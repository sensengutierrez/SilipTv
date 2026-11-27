package com.siliptv.app

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily

/** Itsura ng app. Ang mga retro ay may "bezel" (kahon ng lumang TV) at scanlines. */
data class SilipTheme(
    val id: String,
    val name: String,
    val bg: Color,          // screen
    val bezel: Color,       // kahon ng TV sa paligid ng screen
    val bezelEdge: Color,
    val card: Color,
    val accent: Color,
    val text: Color,
    val muted: Color,
    val live: Color,
    val font: FontFamily,
    val scanlines: Boolean,
    val retro: Boolean,
)

object Themes {
    val all = listOf(
        SilipTheme(
            "moderno", "Moderno",
            bg = Color(0xFF0E1320), bezel = Color(0xFF0E1320), bezelEdge = Color(0xFF0E1320),
            card = Color(0xFF1A2236), accent = Color(0xFFF5B700), text = Color.White, muted = Color(0xFF9AA4B8),
            live = Color(0xFFE53935), font = FontFamily.Default, scanlines = false, retro = false,
        ),
        SilipTheme(
            "kahoy", "Kahoy '80s",
            bg = Color(0xFF1B2620), bezel = Color(0xFF6B3E1F), bezelEdge = Color(0xFF3E220F),
            card = Color(0xFF26352C), accent = Color(0xFFFFB74D), text = Color(0xFFF3E9D2), muted = Color(0xFFB9A98A),
            live = Color(0xFFFF7043), font = FontFamily.Serif, scanlines = true, retro = true,
        ),
        SilipTheme(
            "berde", "Berdeng CRT",
            bg = Color(0xFF020A02), bezel = Color(0xFF2B2B2B), bezelEdge = Color(0xFF111111),
            card = Color(0xFF041A06), accent = Color(0xFF39FF6A), text = Color(0xFF8CFF9E), muted = Color(0xFF3FAF55),
            live = Color(0xFF39FF6A), font = FontFamily.Monospace, scanlines = true, retro = true,
        ),
        SilipTheme(
            "amber", "Amber",
            bg = Color(0xFF0D0700), bezel = Color(0xFFCFC6B4), bezelEdge = Color(0xFF8F8775),
            card = Color(0xFF1E1203), accent = Color(0xFFFFB000), text = Color(0xFFFFC94D), muted = Color(0xFFB37B00),
            live = Color(0xFFFF8A00), font = FontFamily.Monospace, scanlines = true, retro = true,
        ),
        SilipTheme(
            "neon", "Neon '90s",
            bg = Color(0xFF12002B), bezel = Color(0xFF1E1E2E), bezelEdge = Color(0xFFFF2BD6),
            card = Color(0xFF240A4A), accent = Color(0xFF00F0FF), text = Color(0xFFFFE6FF), muted = Color(0xFFB58AE0),
            live = Color(0xFFFF2BD6), font = FontFamily.SansSerif, scanlines = false, retro = true,
        ),
    )

    private const val KEY = "theme"

    fun current(c: Context): SilipTheme {
        val id = c.getSharedPreferences("silip", Context.MODE_PRIVATE).getString(KEY, "kahoy")
        return all.firstOrNull { it.id == id } ?: all[1]
    }

    fun save(c: Context, t: SilipTheme) {
        c.getSharedPreferences("silip", Context.MODE_PRIVATE).edit().putString(KEY, t.id).apply()
    }

    fun next(t: SilipTheme) = all[(all.indexOf(t) + 1) % all.size]
}

/** Manipis na pahalang na linya na parang lumang CRT. */
@Composable
fun Scanlines(modifier: Modifier = Modifier.fillMaxSize()) {
    Canvas(modifier) {
        val step = 4.dp2px(density)
        var y = 0f
        while (y < size.height) {
            drawLine(Color.Black.copy(alpha = 0.18f), Offset(0f, y), Offset(size.width, y), strokeWidth = step / 2)
            y += step
        }
    }
}

private fun Int.dp2px(density: Float) = this * density
