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

private val Bg = Color(0xFF0E1320)
private val Card = Color(0xFF1A2236)
private val Accent = Color(0xFFF5B700)
private val LiveRed = Color(0xFFE53935)
private val Muted = Color(0xFF9AA4B8)

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
    var channels by remember { mutableStateOf(Channels.cached(ctx)) }
    val states = remember { mutableStateMapOf<String, LiveState>() }
    var checking by remember { mutableStateOf(false) }

    suspend fun checkAll(list: List<Channel>) {
        checking = true
        list.forEach { states[it.handle] = LiveState.Checking }
        coroutineScope {
            list.map { ch -> async { states[ch.handle] = Channels.checkLive(ch) } }.awaitAll()
        }
        checking = false
    }

    LaunchedEffect(Unit) {
        Channels.refresh(ctx)?.let { channels = it }
        checkAll(channels)
    }

    // live muna sa unahan
    val sorted = channels.sortedBy { if (states[it.handle] is LiveState.Live) 0 else 1 }

    fun open(ch: Channel) {
        val live = sorted.filter { states[it.handle] is LiveState.Live }
        val idx = live.indexOf(ch)
        if (idx < 0) return
        ctx.startActivity(
            Intent(ctx, PlayerActivity::class.java)
                .putExtra(PlayerActivity.EXTRA_NAMES, live.map { it.name }.toTypedArray())
                .putExtra(PlayerActivity.EXTRA_IDS, live.map { (states[it.handle] as LiveState.Live).videoId }.toTypedArray())
                .putExtra(PlayerActivity.EXTRA_INDEX, idx)
        )
    }

    val firstFocus = remember { FocusRequester() }

    Column(Modifier.fillMaxSize().background(Bg).padding(horizontal = 24.dp, vertical = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("SilipTV", color = Accent, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(12.dp))
            Text(
                "Libreng live mula sa official channels",
                color = Muted, fontSize = 14.sp, modifier = Modifier.weight(1f)
            )
            Pill(if (checking) "Chine-check…" else "↻ I-refresh") {
                if (!checking) scope.launch {
                    Channels.refresh(ctx)?.let { channels = it }
                    checkAll(channels)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        LazyVerticalGrid(
            columns = GridCells.Adaptive(220.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(bottom = 24.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(sorted, key = { it.handle }) { ch ->
                val first = ch == sorted.firstOrNull()
                ChannelCard(
                    ch, states[ch.handle] ?: LiveState.Checking,
                    modifier = if (first) Modifier.focusRequester(firstFocus) else Modifier
                ) { open(ch) }
            }
        }
    }
    LaunchedEffect(sorted.firstOrNull()?.handle) { runCatching { firstFocus.requestFocus() } }
}

@Composable
private fun Pill(text: String, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val focused by src.collectIsFocusedAsState()
    Box(
        Modifier
            .background(if (focused) Accent else Card, RoundedCornerShape(50))
            .clickable(interactionSource = src, indication = null, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) { Text(text, color = if (focused) Bg else Color.White, fontSize = 14.sp) }
}

@Composable
private fun ChannelCard(ch: Channel, state: LiveState, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val focused by src.collectIsFocusedAsState()
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier
            .fillMaxWidth()
            .background(Card, shape)
            .border(3.dp, if (focused) Accent else Color.Transparent, shape)
            .clickable(interactionSource = src, indication = null, onClick = onClick)
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(44.dp).background(Color(ch.color), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(initials(ch.name), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(ch.name, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (ch.group.isNotEmpty()) Text(ch.group, color = Muted, fontSize = 12.sp, maxLines = 1)
            }
        }
        Spacer(Modifier.height(10.dp))
        when (state) {
            is LiveState.Live -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.background(LiveRed, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                        Text("LIVE", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(state.title, color = Color.White, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            LiveState.Checking -> Text("Chine-check…", color = Muted, fontSize = 13.sp)
            LiveState.Offline -> Text("Walang live ngayon", color = Muted, fontSize = 13.sp)
            LiveState.Error -> Text("Hindi ma-check (internet?)", color = Muted, fontSize = 13.sp)
        }
    }
}

private fun initials(name: String): String =
    name.split(' ', '-').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
