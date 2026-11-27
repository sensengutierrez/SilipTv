package com.padalako.app

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Kulay ng app: berde (pera, pag-asa) at dilaw-ginto (araw ng watawat). */
object C {
    val green = Color(0xFF0B6E4F)
    val greenDark = Color(0xFF07432F)
    val greenSoft = Color(0xFFDCEFE6)
    val gold = Color(0xFFF2B705)
    val goldSoft = Color(0xFFFFF3CC)
    val bg = Color(0xFFF4F6F1)
    val card = Color.White
    val text = Color(0xFF1B2421)
    val muted = Color(0xFF5E6B66)
    val line = Color(0xFFE2E7E3)
    val red = Color(0xFFC0392B)
    val redSoft = Color(0xFFFBE3E0)
}

@Composable
fun PadalaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = C.green,
            onPrimary = Color.White,
            secondary = C.gold,
            onSecondary = C.text,
            background = C.bg,
            surface = C.card,
            onSurface = C.text,
            onBackground = C.text,
            error = C.red,
        ),
        content = content,
    )
}

@Composable
fun SectionCard(title: String? = null, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth()
            .background(C.card, RoundedCornerShape(18.dp))
            .border(1.dp, C.line, RoundedCornerShape(18.dp))
            .padding(16.dp)
    ) {
        if (title != null) Text(title, color = C.text, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
        content()
    }
}

/** Maliit na pindutang bilog-bilog, pampili (kategorya, kanino, atbp.). */
@Composable
fun Chip(text: String, selected: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier.padding(end = 6.dp, bottom = 6.dp)
            .clip(RoundedCornerShape(50))
            .background(if (selected) C.green else C.greenSoft)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp)
    ) { Text(text, color = if (selected) Color.White else C.greenDark, fontSize = 13.sp) }
}

/** Progress bar na gawa sa dalawang kahon. */
@Composable
fun Bar(fraction: Float, color: Color = C.green, track: Color = C.greenSoft, height: Int = 10) {
    Box(Modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(50)).background(track)) {
        val f = fraction.coerceIn(0f, 1f)
        if (f > 0f) Box(Modifier.fillMaxWidth(f.coerceAtLeast(0.03f)).height(height.dp).clip(RoundedCornerShape(50)).background(color))
    }
}

/** Emoji ng bawat kategorya. */
fun catIcon(cat: String) = when (cat) {
    "Pang-araw-araw" -> "🍚"
    "Tuition" -> "🎓"
    "Bayarin" -> "🧾"
    "Gamot" -> "💊"
    "Bahay" -> "🏠"
    "Utang" -> "🤝"
    "Ipon" -> "🐷"
    "Negosyo" -> "🏪"
    "Okasyon" -> "🎉"
    else -> "📦"
}
