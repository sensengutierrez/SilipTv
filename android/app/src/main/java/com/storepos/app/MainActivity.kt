package com.storepos.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.ProgressDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.launch

/**
 * Ang app ay ang web POS (assets/www) sa loob ng WebView.
 * Lahat ng data ay nasa phone (IndexedDB ng WebView). Gumagana kahit walang internet.
 */
class MainActivity : ComponentActivity() {
    lateinit var web: WebView
    private val origin = "https://appassets.androidplatform.net"
    private val startUrl = "$origin/assets/www/index.html"

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: Pair<ByteArray, (String) -> Unit>? = null
    private var pendingBt: ((Boolean) -> Unit)? = null
    private var pendingCam: PermissionRequest? = null
    private var printWeb: WebView? = null

    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val uri = res.data?.data
        fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        fileCallback = null
    }

    private var saveMime = "application/json"
    private val createDoc = registerForActivityResult(object : ActivityResultContracts.CreateDocument("*/*") {
        override fun createIntent(context: android.content.Context, input: String): Intent =
            super.createIntent(context, input).setType(saveMime)
    }) { uri ->
        val p = pendingSave ?: return@registerForActivityResult
        pendingSave = null
        if (uri == null) { p.second("cancel"); return@registerForActivityResult }
        try {
            contentResolver.openOutputStream(uri, "wt")!!.use { it.write(p.first) }
            p.second("ok")
        } catch (e: Exception) { p.second("error") }
    }

    private val btPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        pendingBt?.invoke(ok); pendingBt = null
    }

    private val camPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val r = pendingCam ?: return@registerForActivityResult
        pendingCam = null
        if (ok) r.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else r.deny()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        setContentView(web)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
        }
        web.addJavascriptInterface(Bridge(this), "AndroidPOS")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == Uri.parse(origin).host) return false
                // Sa labas ng app binubuksan ang ibang link, at mga ligtas na scheme lang.
                if (u.scheme?.lowercase() in setOf("https", "http", "mailto", "tel", "sms", "smsto", "whatsapp")) {
                    try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) {}
                }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                return try {
                    val i = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE)
                    val accept = params.acceptTypes.joinToString(",")
                    i.type = if (accept.contains("image")) "image/*" else "*/*"
                    pickFile.launch(i)
                    true
                } catch (e: Exception) { fileCallback = null; false }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (!request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) { request.deny(); return@runOnUiThread }
                    if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    } else {
                        pendingCam = request
                        camPerm.launch(Manifest.permission.CAMERA)
                    }
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.__posBack ? window.__posBack() : false") { handled ->
                    if (handled != "true") { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
                }
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(startUrl)

        checkUpdate()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        BtPrinter.close()
        super.onDestroy()
    }

    // ---- Bluetooth permission (Android 12 pataas) ----
    fun withBluetoothPermission(cb: (Boolean) -> Unit) {
        runOnUiThread {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
            ) cb(true)
            else { pendingBt = cb; btPerm.launch(Manifest.permission.BLUETOOTH_CONNECT) }
        }
    }

    // ---- I-save ang file (backup / CSV) kung saan gusto ng user ----
    fun saveDocument(name: String, mime: String, data: ByteArray, done: (String) -> Unit) {
        pendingSave?.second?.invoke("cancel")
        pendingSave = data to done
        saveMime = mime
        try { createDoc.launch(name) } catch (e: Exception) { pendingSave = null; done("error") }
    }

    // ---- Ordinaryong print (Android print service o PDF) ----
    fun printHtml(html: String) {
        val w = WebView(this)
        printWeb = w
        w.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                val pm = getSystemService(PRINT_SERVICE) as PrintManager
                pm.print("Resibo", view.createPrintDocumentAdapter("Resibo"), PrintAttributes.Builder().build())
            }
        }
        w.loadDataWithBaseURL("$origin/assets/www/", html, "text/html", "UTF-8", null)
    }

    // ---- Auto update mula sa GitHub Releases ----
    private fun checkUpdate() {
        lifecycleScope.launch {
            val rel = Updater.check() ?: return@launch
            if (isFinishing) return@launch
            AlertDialog.Builder(this@MainActivity)
                .setTitle("May bagong update")
                .setMessage("May bagong bersyon ng POS (build ${rel.number}). I-update na? Hindi mawawala ang paninda at benta mo.")
                .setPositiveButton("I-update") { _, _ -> startUpdate(rel) }
                .setNegativeButton("Mamaya", null)
                .show()
        }
    }

    @Suppress("DEPRECATION")
    private fun startUpdate(rel: Updater.Release) {
        if (!Updater.canInstall(this)) {
            AlertDialog.Builder(this)
                .setTitle("Payagan ang pag-install")
                .setMessage("Sa susunod na screen, i-on ang \"Allow from this source\" para sa POS, tapos bumalik dito at pindutin ulit ang I-update.")
                .setPositiveButton("OK") { _, _ -> Updater.openInstallPermission(this) }
                .show()
            return
        }
        val pd = ProgressDialog(this).apply {
            setTitle("Dina-download ang update")
            setProgressStyle(ProgressDialog.STYLE_HORIZONTAL)
            max = 100
            setCancelable(false)
            show()
        }
        lifecycleScope.launch {
            try {
                val f = Updater.download(this@MainActivity, rel) { p -> pd.progress = (p * 100).toInt() }
                pd.dismiss()
                Updater.install(this@MainActivity, f)
            } catch (e: Exception) {
                pd.dismiss()
                AlertDialog.Builder(this@MainActivity).setTitle("Hindi na-update").setMessage(e.message).setPositiveButton("OK", null).show()
            }
        }
    }
}
