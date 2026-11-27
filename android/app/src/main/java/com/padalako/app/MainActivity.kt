package com.padalako.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    companion object { const val EXTRA_TAB = "tab" }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Reminders.schedule(this)
        val tab = intent.getIntExtra(EXTRA_TAB, 0)
        setContent { PadalaTheme { App(tab) } }
    }
}

/** Mga bukas na form (isa lang ang bukas sa isang oras). */
private sealed class Form {
    data class RemitForm(val r: Remit?) : Form()
    data class GoalForm(val g: Goal?) : Form()
    data class AddToGoal(val g: Goal) : Form()
    data class BillForm(val b: Bill?) : Form()
    object SettingsForm : Form()
    object ImportForm : Form()
}

@Composable
private fun App(startTab: Int) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf(Store.load(ctx)) }
    var tab by remember { mutableStateOf(startTab.coerceIn(0, 3)) }
    var form by remember { mutableStateOf<Form?>(null) }

    var update by remember { mutableStateOf<Updater.Release?>(null) }
    var dlProgress by remember { mutableStateOf(-1f) }   // -1 = hindi nagda-download
    var dlError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { update = Updater.check() }

    fun save(d: Data) {
        val remindersChanged = d.settings.reminders != data.settings.reminders
        data = d
        Store.save(ctx, d)
        if (remindersChanged) Reminders.schedule(ctx)
    }

    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    fun askNotif() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    fun startUpdate(u: Updater.Release) {
        if (!Updater.canInstall(ctx)) {
            dlError = "Payagan ang \"Install unknown apps\" para sa PadalaKo, tapos pindutin ulit ang I-update."
            Updater.openInstallPermission(ctx)
            return
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

    Scaffold(
        containerColor = C.bg,
        topBar = {
            Row(
                Modifier.fillMaxWidth().background(C.green).padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("💸", fontSize = 24.sp)
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text("PadalaKo", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text("Para sa padala, ipon at bayarin ng OFW", color = C.goldSoft, fontSize = 12.sp)
                }
                TextButton(onClick = { form = Form.SettingsForm }) { Text("⚙️", fontSize = 22.sp) }
            }
        },
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                listOf("🏠" to "Buod", "💸" to "Padala", "🐷" to "Ipon", "🧾" to "Bayarin").forEachIndexed { i, (icon, label) ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { tab = i },
                        icon = { Text(icon, fontSize = 20.sp) },
                        label = { Text(label) },
                        colors = NavigationBarItemDefaults.colors(indicatorColor = C.goldSoft, selectedTextColor = C.greenDark),
                    )
                }
            }
        },
        floatingActionButton = {
            val (label, f) = when (tab) {
                2 -> "+ Bagong ipon" to Form.GoalForm(null)
                3 -> "+ Bayarin" to Form.BillForm(null)
                else -> "+ Padala" to Form.RemitForm(null)
            }
            FloatingActionButton(onClick = { form = f }, containerColor = C.gold, contentColor = C.text) {
                Text(label, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 18.dp))
            }
        },
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            val banner: @Composable () -> Unit = {
                update?.let { u ->
                    Row(
                        Modifier.fillMaxWidth().background(C.goldSoft, RoundedCornerShape(14.dp)).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            when {
                                dlError != null -> dlError!!
                                dlProgress >= 0f -> "Dina-download ang update… ${(dlProgress * 100).toInt()}%"
                                else -> "May bagong update ng PadalaKo (bersyon ${u.number})"
                            },
                            color = C.text, fontSize = 14.sp, modifier = Modifier.weight(1f)
                        )
                        if (dlProgress < 0f) TextButton(onClick = { startUpdate(u) }) { Text("I-update", fontWeight = FontWeight.Bold, color = C.greenDark) }
                    }
                }
            }
            when (tab) {
                0 -> SummaryScreen(
                    data, banner,
                    onAddRemit = { form = Form.RemitForm(null) },
                    onPaid = { b -> save(data.copy(bills = data.bills.map { if (it.id == b.id) it.copy(paidMonth = Dates.monthKey()) else it })) },
                    goTab = { tab = it },
                )
                1 -> RemitScreen(data, banner) { form = Form.RemitForm(it) }
                2 -> GoalsScreen(data, banner, onEdit = { form = Form.GoalForm(it) }, onAdd = { form = Form.AddToGoal(it) })
                else -> BillsScreen(
                    data, banner,
                    onEdit = { form = Form.BillForm(it) },
                    onTogglePaid = { b ->
                        val now = Dates.monthKey()
                        save(data.copy(bills = data.bills.map {
                            if (it.id == b.id) it.copy(paidMonth = if (it.paidMonth == now) "" else now) else it
                        }))
                    },
                )
            }
        }
    }

    when (val f = form) {
        is Form.RemitForm -> RemitDialog(
            f.r, data,
            onSave = { r ->
                val list = if (f.r == null) data.remits + r else data.remits.map { if (it.id == r.id) r else it }
                save(data.copy(remits = list, settings = data.settings.copy(rate = r.rate, currency = r.currency)))
                form = null
            },
            onDelete = { save(data.copy(remits = data.remits.filter { it.id != f.r?.id })); form = null },
            onDismiss = { form = null },
        )
        is Form.GoalForm -> GoalDialog(
            f.g,
            onSave = { g ->
                save(data.copy(goals = if (f.g == null) data.goals + g else data.goals.map { if (it.id == g.id) g else it }))
                form = null
            },
            onDelete = { save(data.copy(goals = data.goals.filter { it.id != f.g?.id })); form = null },
            onDismiss = { form = null },
        )
        is Form.AddToGoal -> AmountDialog(
            f.g,
            onSave = { delta ->
                save(data.copy(goals = data.goals.map { if (it.id == f.g.id) it.copy(saved = (it.saved + delta).coerceAtLeast(0.0)) else it }))
                form = null
            },
            onDismiss = { form = null },
        )
        is Form.BillForm -> BillDialog(
            f.b,
            onSave = { b ->
                save(data.copy(bills = if (f.b == null) data.bills + b else data.bills.map { if (it.id == b.id) b else it }))
                if (data.settings.reminders) askNotif()
                form = null
            },
            onDelete = { save(data.copy(bills = data.bills.filter { it.id != f.b?.id })); form = null },
            onDismiss = { form = null },
        )
        Form.SettingsForm -> SettingsDialog(
            data.settings,
            onSave = { s -> save(data.copy(settings = s)); if (s.reminders) askNotif(); form = null },
            onExport = {
                val send = Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, "PadalaKo backup ${Dates.day(System.currentTimeMillis())}")
                    .putExtra(Intent.EXTRA_TEXT, Store.toJson(data).toString())
                ctx.startActivity(Intent.createChooser(send, "I-save ang backup sa…"))
            },
            onImport = { form = Form.ImportForm },
            onDismiss = { form = null },
        )
        Form.ImportForm -> ImportDialog(
            onRestore = { d -> save(d); Reminders.schedule(ctx); form = null },
            onDismiss = { form = null },
        )
        null -> {}
    }
}
