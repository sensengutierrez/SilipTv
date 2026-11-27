package com.siliptv.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { Home() }
    }
}

@Composable
private fun Home() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var t by remember { mutableStateOf(Themes.current(ctx)) }
    var channels by remember { mutableStateOf(Channels.cached(ctx)) }
    val states = remember { mutableStateMapOf<String, LiveState>() }
    var checking by remember { mutableStateOf(false) }
    var update by remember { mutableStateOf<Updater.Release?>(null) }
    var dlProgress by remember { mutableStateOf(-1f) }   // -1 = hindi nagda-download
    var dlError by remember { mutableStateOf<String?>(null) }

    suspend fun checkAll(list: List<Channel>) {
        checking = true
        list.forEach { states[it.handle] = LiveState.Checking }
        coroutineScope {
            list.map { ch -> async { states[ch.handle] = Channels.checkLive(ch) } }.awaitAll()
        }
        checking = false
    }

    LaunchedEffect(Unit) { update = Updater.check() }
    LaunchedEffect(Unit) {
        Channels.refresh(ctx)?.let { channels = it }
        checkAll(channels)
    }

    // numero ng channel = pwesto sa channels.json (hindi nagbabago kahit mag-sort)
    fun number(ch: Channel) = channels.indexOf(ch) + 1
    // live muna sa unahan
    val sorted = channels.sortedBy { if (states[it.handle] is LiveState.Live) 0 else 1 }

    fun open(ch: Channel) {
        val live = sorted.filter { states[it.handle] is LiveState.Live }
        val idx = live.indexOf(ch)
        if (idx < 0) return
        ctx.startActivity(
            Intent(ctx, PlayerActivity::class.java)
                .putExtra(PlayerActivity.EXTRA_NAMES, live.map { it.name }.toTypedArray())
                .putExtra(PlayerActivity.EXTRA_NUMBERS, live.map { number(it) }.toIntArray())
                .putExtra(PlayerActivity.EXTRA_IDS, live.map { (states[it.handle] as LiveState.Live).videoId }.toTypedArray())
                .putExtra(PlayerActivity.EXTRA_INDEX, idx)
        )
    }

    val firstFocus = remember { FocusRequester() }

    // Kahon ng TV (bezel) sa paligid ng screen kapag retro ang tema
    Box(
        Modifier.fillMaxSize().background(t.bezel)
            .then(if (t.retro) Modifier.border(6.dp, t.bezelEdge) else Modifier)
            .padding(if (t.retro) 14.dp else 0.dp)
    ) {
        Box(
            Modifier.fillMaxSize()
                .clip(RoundedCornerShape(if (t.retro) 28.dp else 0.dp))
                .background(t.bg)
        ) {
            Column(Modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("SilipTV", color = t.accent, fontSize = 28.sp, fontWeight = FontWeight.Bold, fontFamily = t.font)
                    Spacer(Modifier.width(12.dp))
                    Text(
                        "Libreng live mula sa official channels",
                        color = t.muted, fontSize = 13.sp, fontFamily = t.font,
                        modifier = Modifier.weight(1f), maxLines = 2
                    )
                    Pill(t, "🎨 ${t.name}") { t = Themes.next(t); Themes.save(ctx, t) }
                    Spacer(Modifier.width(8.dp))
                    Pill(t, if (checking) "Chine-check…" else "↻ Refresh") {
                        if (!checking) scope.launch {
                            Channels.refresh(ctx)?.let { channels = it }
                            checkAll(channels)
                        }
                    }
                }
                update?.let { u ->
                    Spacer(Modifier.height(12.dp))
                    Row(
                        Modifier.fillMaxWidth().background(t.card, RoundedCornerShape(12.dp)).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            when {
                                dlError != null -> dlError!!
                                dlProgress >= 0f -> "Dina-download ang update… ${(dlProgress * 100).toInt()}%"
                                else -> "May bagong update ng SilipTV (bersyon ${u.number})"
                            },
                            color = t.text, fontSize = 14.sp, fontFamily = t.font, modifier = Modifier.weight(1f)
                        )
                        if (dlProgress < 0f) Pill(t, "I-update") {
                            if (!Updater.canInstall(ctx)) {
                                dlError = "Payagan ang \"Install unknown apps\" para sa SilipTV, tapos pindutin ulit ang I-update."
                                Updater.openInstallPermission(ctx)
                                return@Pill
                            }
                            dlError = null
                            dlProgress = 0f
                            scope.launch {
                                try {
                                    val f = Updater.download(ctx, u) { dlProgress = it }
                                    Updater.install(ctx, f)
                                } catch (e: Exception) {
                                    dlError = e.message ?: "Hindi na-download ang update."
                                }
                                dlProgress = -1f
                            }
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(230.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    contentPadding = PaddingValues(bottom = 24.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(sorted, key = { it.handle }) { ch ->
                        val first = ch == sorted.firstOrNull()
                        ChannelCard(
                            t, ch, number(ch), states[ch.handle] ?: LiveState.Checking,
                            modifier = if (first) Modifier.focusRequester(firstFocus) else Modifier
                        ) { open(ch) }
                    }
                }
            }
            if (t.scanlines) Scanlines()
        }
    }
    LaunchedEffect(sorted.firstOrNull()?.handle) { runCatching { firstFocus.requestFocus() } }
}

@Composable
private fun Pill(t: SilipTheme, text: String, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val focused by src.collectIsFocusedAsState()
    Box(
        Modifier
            .background(if (focused) t.accent else t.card, RoundedCornerShape(50))
            .clickable(interactionSource = src, indication = null, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) { Text(text, color = if (focused) t.bg else t.text, fontSize = 14.sp, fontFamily = t.font) }
}

@Composable
private fun ChannelCard(t: SilipTheme, ch: Channel, number: Int, state: LiveState, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val focused by src.collectIsFocusedAsState()
    val shape = RoundedCornerShape(if (t.retro) 6.dp else 14.dp)
    Column(
        modifier
            .fillMaxWidth()
            .background(t.card, shape)
            .border(3.dp, if (focused) t.accent else Color.Transparent, shape)
            .clickable(interactionSource = src, indication = null, onClick = onClick)
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // numero ng channel, parang lumang TV
            Text(
                "CH %02d".format(number), color = t.accent, fontFamily = t.font,
                fontWeight = FontWeight.Bold, fontSize = 18.sp
            )
            Spacer(Modifier.width(10.dp))
            Box(
                Modifier.size(34.dp).background(if (t.id == "moderno") Color(ch.color) else t.bg, CircleShape)
                    .border(1.dp, t.accent.copy(alpha = 0.5f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(initials(ch.name), color = t.text, fontWeight = FontWeight.Bold, fontSize = 13.sp, fontFamily = t.font)
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(ch.name, color = t.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, fontFamily = t.font, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (ch.group.isNotEmpty()) Text(ch.group, color = t.muted, fontSize = 12.sp, fontFamily = t.font, maxLines = 1)
            }
        }
        Spacer(Modifier.height(10.dp))
        when (state) {
            is LiveState.Live -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.background(t.live, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                        Text("● LIVE", color = t.bg, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = t.font)
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(state.title, color = t.text, fontSize = 13.sp, fontFamily = t.font, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            LiveState.Checking -> Text("Chine-check…", color = t.muted, fontSize = 13.sp, fontFamily = t.font)
            LiveState.Offline -> Text("Walang live ngayon", color = t.muted, fontSize = 13.sp, fontFamily = t.font)
            LiveState.Error -> Text("Hindi ma-check (internet?)", color = t.muted, fontSize = 13.sp, fontFamily = t.font)
        }
    }
}

private fun initials(name: String): String =
    name.split(' ', '-').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
