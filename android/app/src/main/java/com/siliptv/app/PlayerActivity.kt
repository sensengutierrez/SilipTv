package com.siliptv.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
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
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.compose.ui.graphics.toArgb
import kotlin.random.Random

/**
 * Full-screen player, parang TV. Ang video ay pinapatugtog ng official YouTube player sa player.html
 * (naka-host sa GitHub Pages para may tamang origin).
 * Remote ng TV: Taas/Baba = palit channel, OK = info, Back = balik sa listahan.
 * Phone: tap = lumabas ang mga button (Back, CH▲, CH▼), swipe pataas/pababa = palit channel.
 */
class PlayerActivity : Activity() {
    companion object {
        const val EXTRA_NAMES = "names"
        const val EXTRA_NUMBERS = "numbers"
        const val EXTRA_IDS = "ids"
        const val EXTRA_INDEX = "index"
        const val PLAYER_URL = "https://sensengutierrez.github.io/SilipTv/player.html"
    }

    private lateinit var web: WebView
    private lateinit var osd: TextView
    private lateinit var info: TextView
    private lateinit var controls: LinearLayout
    private lateinit var snow: SnowView
    private lateinit var theme: SilipTheme
    private val main = Handler(Looper.getMainLooper())
    private var names: Array<String> = emptyArray()
    private var numbers: IntArray = IntArray(0)
    private var ids: Array<String> = emptyArray()
    private var index = 0
    private var errorShown = false   // naka-display ang error: OK = buksan sa YouTube app
    private val hideOsd = Runnable { if (!errorShown) { osd.visibility = View.GONE; info.visibility = View.GONE } }
    private val hideControls = Runnable { controls.visibility = View.GONE }
    private val hideSnow = Runnable { snow.stop() }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        theme = Themes.current(this)
        names = intent.getStringArrayExtra(EXTRA_NAMES) ?: emptyArray()
        ids = intent.getStringArrayExtra(EXTRA_IDS) ?: emptyArray()
        numbers = intent.getIntArrayExtra(EXTRA_NUMBERS) ?: IntArray(ids.size) { it + 1 }
        index = intent.getIntExtra(EXTRA_INDEX, 0)
        if (ids.isEmpty()) { finish(); return }

        val accent = theme.accent.toArgb()
        val font = when {
            theme.font == androidx.compose.ui.text.font.FontFamily.Monospace -> Typeface.MONOSPACE
            theme.font == androidx.compose.ui.text.font.FontFamily.Serif -> Typeface.SERIF
            else -> Typeface.DEFAULT
        }

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
        // Malaking numero ng channel sa kanang itaas, parang lumang TV
        osd = TextView(this).apply {
            setTextColor(accent)
            textSize = 44f
            typeface = Typeface.create(font, Typeface.BOLD)
            setShadowLayer(8f, 0f, 0f, accent)
        }
        info = TextView(this).apply {
            setTextColor(theme.text.toArgb())
            textSize = 18f
            typeface = font
            setBackgroundColor(0xAA000000.toInt())
            setPadding(28, 14, 28, 14)
        }
        snow = SnowView(this)
        controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            visibility = View.GONE
            addView(button("◀ Back", font) { finish() })
            addView(button("CH ▲", font) { switch(-1) })
            addView(button("CH ▼", font) { switch(1) })
            addView(button("YouTube", font) { openInYouTube() })
        }
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(web, FrameLayout.LayoutParams(-1, -1))
            if (theme.scanlines) addView(ScanlineView(context), FrameLayout.LayoutParams(-1, -1))
            addView(snow, FrameLayout.LayoutParams(-1, -1))
            addView(osd, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.END).apply { setMargins(0, 24, 40, 0) })
            addView(info, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START).apply { setMargins(32, 0, 32, 150) })
            addView(controls, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply { setMargins(0, 0, 0, 24) })
        }
        setContentView(root)
        hideSystemUi()
        play()
    }

    private fun button(text: String, font: Typeface, onClick: () -> Unit) = TextView(this).apply {
        this.text = text
        textSize = 17f
        typeface = Typeface.create(font, Typeface.BOLD)
        setTextColor(theme.text.toArgb())
        background = GradientDrawable().apply {
            cornerRadius = if (theme.retro) 10f else 60f
            setColor((theme.card.toArgb() and 0x00FFFFFF) or (0xDD shl 24))
            setStroke(3, theme.accent.toArgb())
        }
        setPadding(40, 22, 40, 22)
        isFocusable = false   // sa TV, ang remote ang gamit (Taas/Baba/Back)
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply { setMargins(14, 0, 14, 0) }
        setOnClickListener { onClick(); showControls() }
    }

    private fun play() {
        errorShown = false
        val id = ids[index].filter { it.isLetterOrDigit() || it == '-' || it == '_' }
        snow.start()
        main.removeCallbacks(hideSnow)
        main.postDelayed(hideSnow, 1500)   // tatanggalin din kapag nagsimula ang video
        web.loadUrl("$PLAYER_URL?v=$id")
        showOsd()
    }

    private fun showOsd() {
        osd.text = "CH %02d".format(numbers.getOrElse(index) { index + 1 })
        info.text = if (ids.size > 1) "${names[index]}   ▲▼ palit channel" else names[index]
        osd.visibility = View.VISIBLE
        info.visibility = View.VISIBLE
        main.removeCallbacks(hideOsd)
        main.postDelayed(hideOsd, 4000)
    }

    private fun showControls() {
        controls.visibility = View.VISIBLE
        main.removeCallbacks(hideControls)
        main.postDelayed(hideControls, 5000)
    }

    private fun switch(delta: Int) {
        if (ids.size < 2) { showOsd(); return }
        index = (index + delta + ids.size) % ids.size
        play()
    }

    /** Kapag ayaw i-embed ng channel ang live, sa YouTube app lang ito mapapanood. */
    private fun openInYouTube() {
        val id = ids[index]
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=$id")))
        } catch (e: ActivityNotFoundException) {
            toast("Walang YouTube app sa device na ito.")
        }
    }

    /** Ipakita ang error code at hayaang pumili: OK = YouTube app, Taas/Baba = ibang channel, Back = listahan. */
    private fun showError(code: String) {
        errorShown = true
        snow.start()   // "walang signal" na itsura
        main.removeCallbacks(hideSnow)
        val why = when (code) {
            "101", "150" -> "Hindi pinapayagan ng channel na i-play ang live na ito sa ibang app."
            else -> "Ayaw i-load ng YouTube player dito."
        }
        osd.text = "CH %02d".format(numbers.getOrElse(index) { index + 1 })
        osd.visibility = View.VISIBLE
        info.text = "${names[index]}\nError $code: $why\nOK = buksan sa YouTube app  ·  ▲▼ ibang channel  ·  Back = listahan"
        info.visibility = View.VISIBLE
        main.removeCallbacks(hideOsd)
        showControls()
    }

    inner class Bridge {
        @JavascriptInterface
        fun event(name: String, data: String) {
            main.post {
                when (name) {
                    "state" -> if (data == "1") { main.removeCallbacks(hideSnow); snow.stop() }
                    "error" -> when (data) {
                        "noapi" -> toast("Hindi ma-load ang YouTube player. I-check ang internet.")
                        else -> showError(data)
                    }
                }
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_CHANNEL_UP -> { switch(-1); return true }
            KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_CHANNEL_DOWN -> { switch(1); return true }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_INFO -> {
                if (errorShown) openInYouTube() else showOsd(); return true
            }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_SPACE -> {
                web.evaluateJavascript("toggle()", null); return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    // Sa phone: swipe pataas/pababa = palit channel; tap = ipakita ang mga button.
    private var downY = 0f
    private var downX = 0f
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        when (ev.action) {
            MotionEvent.ACTION_DOWN -> { downY = ev.y; downX = ev.x }
            MotionEvent.ACTION_UP -> {
                val dy = ev.y - downY
                if (dy < -150) { switch(1); return true }
                if (dy > 150) { switch(-1); return true }
                if (controls.visibility != View.VISIBLE) {
                    showControls(); showOsd()
                    return true
                }
            }
        }
        // ang video mismo ay hindi kinokontrol ng touch; ang mga button lang
        return if (controls.visibility == View.VISIBLE) super.dispatchTouchEvent(ev) else true
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
        if (::snow.isInitialized) snow.stop()
        if (::web.isInitialized) { web.loadUrl("about:blank"); web.destroy() }
        super.onDestroy()
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}

/** "Snow" ng lumang TV habang naglilipat ng channel o walang signal. */
class SnowView(c: Context) : View(c) {
    private val paint = Paint()
    private var running = false
    private val cell = (4 * c.resources.displayMetrics.density).toInt().coerceAtLeast(4)

    init { visibility = GONE }

    fun start() { running = true; visibility = VISIBLE; invalidate() }
    fun stop() { running = false; visibility = GONE }

    override fun onDraw(canvas: Canvas) {
        if (!running) return
        canvas.drawColor(Color.BLACK)
        var y = 0
        while (y < height) {
            var x = 0
            while (x < width) {
                val v = Random.nextInt(256)
                paint.color = Color.rgb(v, v, v)
                canvas.drawRect(x.toFloat(), y.toFloat(), (x + cell).toFloat(), (y + cell).toFloat(), paint)
                x += cell
            }
            y += cell
        }
        postInvalidateDelayed(50)
    }
}

/** Pahalang na linya na parang CRT, nakapatong sa video. */
class ScanlineView(c: Context) : View(c) {
    private val paint = Paint().apply { color = 0x2E000000 }
    override fun onDraw(canvas: Canvas) {
        val step = 3f * resources.displayMetrics.density
        var y = 0f
        while (y < height) { canvas.drawRect(0f, y, width.toFloat(), y + step / 2, paint); y += step }
    }
}
