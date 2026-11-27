package com.padalako.app

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

@Composable
private fun Field(label: String, value: String, number: Boolean = false, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Decimal else KeyboardType.Text),
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
    )
}

@Composable
private fun ChipRow(options: List<String>, selected: String, label: (String) -> String = { it }, onPick: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 6.dp)) {
        options.forEach { o -> Chip(label(o), o == selected) { onPick(o) } }
    }
}

@Composable
private fun Small(text: String) = Text(text, color = C.muted, fontSize = 13.sp, modifier = Modifier.padding(bottom = 4.dp))

@Composable
private fun DeleteButton(onDelete: () -> Unit) {
    var sure by remember { mutableStateOf(false) }
    TextButton(onClick = { if (sure) onDelete() else sure = true }) {
        Text(if (sure) "Sigurado? Burahin" else "Burahin", color = C.red)
    }
}

// ---------- Padala ----------

@Composable
fun RemitDialog(initial: Remit?, d: Data, onSave: (Remit) -> Unit, onDelete: () -> Unit, onDismiss: () -> Unit) {
    var amount by remember { mutableStateOf(initial?.let { Money.plain(it.amount) } ?: "") }
    var currency by remember { mutableStateOf(initial?.currency ?: d.settings.currency) }
    var rate by remember { mutableStateOf(Money.plain(initial?.rate ?: d.settings.rate)) }
    var to by remember { mutableStateOf(initial?.to ?: d.remits.maxByOrNull { it.date }?.to ?: "") }
    var category by remember { mutableStateOf(initial?.category ?: "Pang-araw-araw") }
    var via by remember { mutableStateOf(initial?.via ?: d.remits.maxByOrNull { it.date }?.via ?: "") }
    var note by remember { mutableStateOf(initial?.note ?: "") }
    var date by remember { mutableStateOf(initial?.date ?: System.currentTimeMillis()) }
    var error by remember { mutableStateOf<String?>(null) }

    val amt = Money.parse(amount)
    val rt = Money.parse(rate)
    val recentTo = d.remits.sortedByDescending { it.date }.map { it.to }.filter { it.isNotBlank() }.distinct().take(6)
    val toOptions = (recentTo + listOf("Nanay", "Tatay", "Asawa", "Anak", "Kapatid")).distinct().take(8)
    val viaOptions = (d.remits.sortedByDescending { it.date }.map { it.via }.filter { it.isNotBlank() } +
        listOf("Bank", "Remittance center", "GCash", "Maya", "Western Union")).distinct().take(8)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "Bagong padala" else "I-edit ang padala") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                ChipRow(Store.currencies, currency) { currency = it }
                Field("Halaga ($currency)", amount, number = true) { amount = it }
                Field("Palitan: 1 $currency = ilang piso", rate, number = true) { rate = it }
                Text(
                    if (amt != null && rt != null) "= ${Money.php(amt * rt)}" else "= ₱0.00",
                    color = C.greenDark, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp)
                )
                Field("Kanino", to) { to = it }
                ChipRow(toOptions, to) { to = it }
                Small("Para saan")
                ChipRow(Store.categories, category, label = { "${catIcon(it)} $it" }) { category = it }
                Field("Saan ipinadala", via) { via = it }
                ChipRow(viaOptions, via) { via = it }
                Field("Note (hindi kailangan)", note) { note = it }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Petsa: ${Dates.day(date)}", color = C.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
                    TextButton(onClick = { date = Dates.addDays(date, -1) }) { Text("◀") }
                    TextButton(onClick = { if (Dates.addDays(date, 1) <= System.currentTimeMillis()) date = Dates.addDays(date, 1) }) { Text("▶") }
                }
                error?.let { Text(it, color = C.red, fontSize = 13.sp) }
                if (initial != null) DeleteButton(onDelete)
            }
        },
        confirmButton = {
            Button(onClick = {
                when {
                    amt == null || amt <= 0 -> error = "Ilagay ang halaga."
                    rt == null || rt <= 0 -> error = "Ilagay ang palitan (rate)."
                    else -> onSave(
                        Remit(initial?.id ?: Store.newId(), date, amt, currency, rt, to.trim(), category, via.trim(), note.trim())
                    )
                }
            }) { Text("I-save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Kanselahin") } },
    )
}

// ---------- Ipon ----------

@Composable
fun GoalDialog(initial: Goal?, onSave: (Goal) -> Unit, onDelete: () -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var target by remember { mutableStateOf(initial?.let { Money.plain(it.target) } ?: "") }
    var saved by remember { mutableStateOf(initial?.let { Money.plain(it.saved) } ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "Bagong ipon" else "I-edit ang ipon") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Field("Pangalan (hal. Pambahay)", name) { name = it }
                ChipRow(listOf("Pambahay", "Pang-negosyo", "Emergency fund", "Pag-uwi", "Pang-aral"), name) { name = it }
                Field("Target (₱)", target, number = true) { target = it }
                Field("Naipon na (₱)", saved, number = true) { saved = it }
                error?.let { Text(it, color = C.red, fontSize = 13.sp) }
                if (initial != null) DeleteButton(onDelete)
            }
        },
        confirmButton = {
            Button(onClick = {
                val t = Money.parse(target)
                when {
                    name.isBlank() -> error = "Lagyan ng pangalan."
                    t == null || t <= 0 -> error = "Ilagay ang target."
                    else -> onSave(Goal(initial?.id ?: Store.newId(), name.trim(), t, Money.parse(saved) ?: 0.0))
                }
            }) { Text("I-save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Kanselahin") } },
    )
}

@Composable
fun AmountDialog(g: Goal, onSave: (Double) -> Unit, onDismiss: () -> Unit) {
    var amount by remember { mutableStateOf("") }
    val a = Money.parse(amount)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("🐷 ${g.name}") },
        text = {
            Column {
                Small("Naipon na: ${Money.php(g.saved)}")
                Field("Halaga (₱)", amount, number = true) { amount = it }
                OutlinedButton(onClick = { if (a != null && a > 0) onSave(-a) }) { Text("− Binawasan") }
            }
        },
        confirmButton = {
            Button(onClick = { if (a != null && a > 0) onSave(a) }) { Text("+ Idagdag") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Kanselahin") } },
    )
}

// ---------- Bayarin ----------

@Composable
fun BillDialog(initial: Bill?, onSave: (Bill) -> Unit, onDelete: () -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var amount by remember { mutableStateOf(initial?.let { Money.plain(it.amount) } ?: "") }
    var day by remember { mutableStateOf(initial?.dueDay?.toString() ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "Bagong bayarin" else "I-edit ang bayarin") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Field("Pangalan (hal. Kuryente)", name) { name = it }
                ChipRow(listOf("Kuryente", "Tubig", "Internet", "Tuition", "Hulog sa bahay", "Load", "Insurance", "Pag-IBIG", "SSS"), name) { name = it }
                Field("Halaga (₱)", amount, number = true) { amount = it }
                Field("Araw ng due (1 hanggang 31)", day, number = true) { day = it.filter { c -> c.isDigit() }.take(2) }
                error?.let { Text(it, color = C.red, fontSize = 13.sp) }
                if (initial != null) DeleteButton(onDelete)
            }
        },
        confirmButton = {
            Button(onClick = {
                val a = Money.parse(amount)
                val dd = day.toIntOrNull()
                when {
                    name.isBlank() -> error = "Lagyan ng pangalan."
                    a == null || a < 0 -> error = "Ilagay ang halaga."
                    dd == null || dd !in 1..31 -> error = "Ang araw ay 1 hanggang 31."
                    else -> onSave(Bill(initial?.id ?: Store.newId(), name.trim(), a, dd, initial?.paidMonth ?: ""))
                }
            }) { Text("I-save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Kanselahin") } },
    )
}

// ---------- Settings at backup ----------

@Composable
fun SettingsDialog(s: Settings, onSave: (Settings) -> Unit, onExport: () -> Unit, onImport: () -> Unit, onDismiss: () -> Unit) {
    var currency by remember { mutableStateOf(s.currency) }
    var rate by remember { mutableStateOf(Money.plain(s.rate)) }
    var reminders by remember { mutableStateOf(s.reminders) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("⚙️ Settings") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Small("Pera sa bansang pinagtatrabahuhan")
                ChipRow(Store.currencies, currency) { currency = it }
                Field("Karaniwang palitan: 1 $currency = ilang piso", rate, number = true) { rate = it }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("Paalala sa bayarin", color = C.text, fontSize = 15.sp)
                        Small("Notification 3 araw bago ang due")
                    }
                    Switch(checked = reminders, onCheckedChange = { reminders = it })
                }
                Spacer(Modifier.height(8.dp))
                Small("Nasa phone mo lang ang data. Mag-backup para hindi mawala kapag nagpalit ng phone.")
                Row {
                    OutlinedButton(onClick = onExport) { Text("📤 I-backup") }
                    Spacer(Modifier.padding(4.dp))
                    OutlinedButton(onClick = onImport) { Text("📥 I-restore") }
                }
                Spacer(Modifier.height(10.dp))
                Small("PadalaKo bersyon ${BuildConfig.VERSION_NAME}")
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(s.copy(currency = currency, rate = Money.parse(rate)?.takeIf { it > 0 } ?: s.rate, reminders = reminders))
            }) { Text("I-save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Isara") } },
    )
}

@Composable
fun ImportDialog(onRestore: (Data) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("📥 I-restore ang backup") },
        text = {
            Column {
                Small("I-paste dito ang buong text ng backup. Papalitan nito ang lahat ng data sa app.")
                OutlinedTextField(
                    value = text, onValueChange = { text = it }, label = { Text("Backup") },
                    modifier = Modifier.fillMaxWidth().height(160.dp),
                )
                error?.let { Text(it, color = C.red, fontSize = 13.sp) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    try {
                        val j = JSONObject(text.trim())
                        if (!j.has("remits")) throw IllegalArgumentException()
                        onRestore(Store.fromJson(j))
                    } catch (e: Exception) {
                        error = "Hindi ito backup ng PadalaKo. Kopyahin ulit ang buong text."
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = C.red),
            ) { Text("I-restore") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Kanselahin") } },
    )
}
