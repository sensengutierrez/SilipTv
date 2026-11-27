package com.siliptv.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast

/**
 * Full-screen player. Ang video ay pinapatugtog ng official YouTube player sa player.html (naka-host sa
 * GitHub Pages para may tamang origin; kung wala, "This video is unavailable" / error 152).
 * Remote ng TV: Taas/Baba = palit channel, OK = ipakita ang pangalan, Back = balik sa listahan.
 */
class PlayerActivity : Activity() {
    companion object {
        const val EXTRA_NAMES = "names"
        const val EXTRA_IDS = "ids"
        const val EXTRA_INDEX = "index"
        const val PLAYER_URL = "https://sensengutierrez.github.io/SilipTv/player.html"
    }

    private lateinit var web: WebView
    private lateinit var label: TextView
    private val main = Handler(Looper.getMainLooper())
    private var names: Array<String> = emptyArray()
    private var ids: Array<String> = emptyArray()
    private var index = 0
    private val hideLabel = Runnable { label.visibility = View.GONE }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        names = intent.getStringArrayExtra(EXTRA_NAMES) ?: emptyArray()
        ids = intent.getStringArrayExtra(EXTRA_IDS) ?: emptyArray()
        index = intent.getIntExtra(EXTRA_INDEX, 0)
        if (ids.isEmpty()) { finish(); return }

        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = false; isFocusableInTouchMode = false   // ang remote ay para sa app
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) main.post { toast("Hindi ma-load ang player. I-check ang internet.") }
                }
            }
            addJavascriptInterface(Bridge(), "SilipApp")
        }
        label = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 20f
            setBackgroundColor(0xAA000000.toInt())
            setPadding(32, 16, 32, 16)
        }
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(web, FrameLayout.LayoutParams(-1, -1))
            addView(label, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START).apply { setMargins(32, 32, 0, 0) })
        }
        setContentView(root)
        hideSystemUi()
        play()
    }

    private fun play() {
        val id = ids[index].filter { it.isLetterOrDigit() || it == '-' || it == '_' }
        web.loadUrl("$PLAYER_URL?v=$id")
        showLabel()
    }

    private fun showLabel() {
        label.text = if (ids.size > 1) "${names[index]}   (${index + 1}/${ids.size})  ▲▼ palit" else names[index]
        label.visibility = View.VISIBLE
        main.removeCallbacks(hideLabel)
        main.postDelayed(hideLabel, 4000)
    }

    private fun switch(delta: Int) {
        if (ids.size < 2) { showLabel(); return }
        index = (index + delta + ids.size) % ids.size
        play()
    }

    /** Kapag ayaw i-embed ng channel ang live, buksan sa YouTube app. */
    private fun openInYouTube() {
        val id = ids[index]
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=$id")))
        } catch (e: ActivityNotFoundException) {
            toast("Walang YouTube app sa device na ito.")
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun event(name: String, data: String) {
            main.post {
                if (name == "error") {
                    when (data) {
                        "101", "150", "152", "153" -> {
                            toast("Hindi pwedeng i-play dito ang live na ito. Bubuksan sa YouTube app.")
                            openInYouTube()
                        }
                        "noapi" -> toast("Hindi ma-load ang YouTube player. I-check ang internet.")
                        else -> toast("Hindi ma-play (error $data). Subukan ang ibang channel.")
                    }
                }
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_CHANNEL_UP -> { switch(-1); return true }
            KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_CHANNEL_DOWN -> { switch(1); return true }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_INFO -> { showLabel(); return true }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_SPACE -> {
                web.evaluateJavascript("toggle()", null); return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    // Sa phone: swipe pataas/pababa para magpalit ng channel, tap para makita ang pangalan.
    private var downY = 0f
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        when (ev.action) {
            MotionEvent.ACTION_DOWN -> downY = ev.y
            MotionEvent.ACTION_UP -> {
                val dy = ev.y - downY
                if (dy < -150) { switch(1); return true }
                if (dy > 150) { switch(-1); return true }
                showLabel()
            }
        }
        return super.dispatchTouchEvent(ev)
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onPause() { super.onPause(); if (::web.isInitialized) web.onPause() }
    override fun onResume() { super.onResume(); if (::web.isInitialized) web.onResume() }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        if (::web.isInitialized) { web.loadUrl("about:blank"); web.destroy() }
        super.onDestroy()
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}
