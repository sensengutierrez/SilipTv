package com.storepos.app

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import android.graphics.Color
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import org.json.JSONObject
import java.util.concurrent.Executors

/** Mga function na tinatawag ng web app (window.AndroidPOS). */
class Bridge(private val act: MainActivity) {
    private val io = Executors.newSingleThreadExecutor()

    private fun js(fn: String, id: String, ok: Boolean, msg: String?) {
        val m = JSONObject.quote(msg ?: "")
        val i = JSONObject.quote(id)
        act.runOnUiThread { act.web.evaluateJavascript("window.$fn && window.$fn($i, $ok, $m)", null) }
    }

    @JavascriptInterface
    fun appVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun setBarColor(hex: String) {
        try {
            val c = Color.parseColor(hex)
            act.runOnUiThread { act.window.statusBarColor = c }
        } catch (_: Exception) {}
    }

    // ---- Bluetooth printer ----
    @JavascriptInterface
    fun btList(id: String) {
        act.withBluetoothPermission { granted ->
            if (!granted) { js("__posCb", id, false, "Kailangan ng pahintulot sa Nearby devices / Bluetooth."); return@withBluetoothPermission }
            io.execute {
                try { js("__posCb", id, true, BtPrinter.paired(act)) } catch (e: Exception) { js("__posCb", id, false, e.message) }
            }
        }
    }

    @JavascriptInterface
    fun btPrint(address: String, b64: String, id: String) {
        act.withBluetoothPermission { granted ->
            if (!granted) { js("__posCb", id, false, "Kailangan ng pahintulot sa Nearby devices / Bluetooth."); return@withBluetoothPermission }
            io.execute {
                try {
                    BtPrinter.print(act, address, Base64.decode(b64, Base64.DEFAULT))
                    js("__posCb", id, true, "ok")
                } catch (e: Exception) { js("__posCb", id, false, e.message) }
            }
        }
    }

    @JavascriptInterface
    fun openBluetoothSettings() {
        act.runOnUiThread {
            try { act.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) } catch (_: Exception) {}
        }
    }

    // ---- Barcode (Google code scanner) ----
    @JavascriptInterface
    fun scan(id: String) {
        act.runOnUiThread {
            try {
                val opts = GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(
                        Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E,
                        Barcode.FORMAT_CODE_128, Barcode.FORMAT_CODE_39, Barcode.FORMAT_CODE_93, Barcode.FORMAT_ITF,
                        Barcode.FORMAT_CODABAR, Barcode.FORMAT_QR_CODE, Barcode.FORMAT_DATA_MATRIX
                    )
                    .enableAutoZoom()
                    .build()
                GmsBarcodeScanning.getClient(act, opts).startScan()
                    .addOnSuccessListener { js("__posScan", id, true, it.rawValue ?: "") }
                    .addOnCanceledListener { js("__posScan", id, true, "") }
                    .addOnFailureListener { js("__posScan", id, false, "fallback") }
            } catch (e: Exception) {
                js("__posScan", id, false, "fallback")
            }
        }
    }

    // ---- Files (backup) ----
    @JavascriptInterface
    fun saveFile(name: String, mime: String, text: String, id: String) {
        act.runOnUiThread {
            act.saveDocument(name, mime, text.toByteArray(Charsets.UTF_8)) { result -> js("__posFile", id, result != "error", result) }
        }
    }

    /** Binary na file (hal. Excel .xlsx) bilang base64. */
    @JavascriptInterface
    fun saveFileB64(name: String, mime: String, b64: String, id: String) {
        val bytes = try { Base64.decode(b64, Base64.DEFAULT) } catch (e: Exception) { js("__posFile", id, false, "error"); return }
        act.runOnUiThread {
            act.saveDocument(name, mime, bytes) { result -> js("__posFile", id, result != "error", result) }
        }
    }

    // ---- Pagpapadala ng resibo (WhatsApp, email, share) ----
    /** Buksan ang link sa ibang app: https://wa.me/..., mailto:, tel:, sms: */
    @JavascriptInterface
    fun openUrl(url: String) {
        val u = Uri.parse(url)
        // Mga ligtas na link lang (web, email, tawag, SMS, WhatsApp); bawal ang intent:, file:, content: at iba pa.
        if (u.scheme?.lowercase() !in setOf("https", "http", "mailto", "tel", "sms", "smsto", "whatsapp")) return
        act.runOnUiThread {
            try {
                val i = Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                act.startActivity(i)
            } catch (_: Exception) {
                android.widget.Toast.makeText(act, "Walang app na makakabukas nito", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** Ibahagi ang file (hal. larawan ng resibo) gamit ang share sheet ng Android. */
    @JavascriptInterface
    fun shareFile(name: String, mime: String, b64: String, text: String) {
        io.execute {
            try {
                val dir = File(act.cacheDir, "share").apply { mkdirs() }
                dir.listFiles()?.forEach { it.delete() }
                val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val f = File(dir, safe)
                f.writeBytes(Base64.decode(b64, Base64.DEFAULT))
                val uri = FileProvider.getUriForFile(act, "${act.packageName}.files", f)
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = mime
                    putExtra(Intent.EXTRA_STREAM, uri)
                    if (text.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, text)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                act.runOnUiThread {
                    try { act.startActivity(Intent.createChooser(send, null)) } catch (_: Exception) {}
                }
            } catch (_: Exception) {}
        }
    }

    // ---- Ordinaryong print (Android print / PDF) ----
    @JavascriptInterface
    fun printHtml(html: String) {
        act.runOnUiThread { act.printHtml(html) }
    }
}
