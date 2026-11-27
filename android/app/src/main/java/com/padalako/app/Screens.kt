package com.padalako.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val listPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp)

private fun monthRemits(d: Data, key: String) = d.remits.filter { Dates.monthKey(it.date) == key }

// ================= BUOD =================

@Composable
fun SummaryScreen(d: Data, banner: @Composable () -> Unit, onAddRemit: () -> Unit, onPaid: (Bill) -> Unit, goTab: (Int) -> Unit) {
    val thisKey = Dates.monthKey()
    val lastKey = Dates.monthKeyOffset(-1)
    val thisMonth = monthRemits(d, thisKey)
    val total = thisMonth.sumOf { it.php }
    val lastTotal = monthRemits(d, lastKey).sumOf { it.php }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPadding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { banner() }

        // Malaking card: kabuuang padala ngayong buwan
        item {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(C.green).padding(20.dp)
            ) {
                Text("Padala ngayong ${Dates.monthOnly(thisKey)}", color = C.goldSoft, fontSize = 14.sp)
                Text(Money.php(total), color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Bold)
                val foreign = thisMonth.groupBy { it.currency }.map { (cur, l) -> Money.of(l.sumOf { it.amount }, cur) }
                Text(
                    (if (foreign.isEmpty()) "" else foreign.joinToString(" + ") + " · ") + "${thisMonth.size} padala",
                    color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp
                )
                if (lastTotal > 0) {
                    Spacer(Modifier.height(8.dp))
                    val diff = total - lastTotal
                    Text(
                        when {
                            diff > 0 -> "▲ Mas mataas ng ${Money.php(diff)} kaysa ${Dates.monthOnly(lastKey)}"
                            diff < 0 -> "▼ Mas mababa ng ${Money.php(-diff)} kaysa ${Dates.monthOnly(lastKey)}"
                            else -> "Kapareho ng ${Dates.monthOnly(lastKey)}"
                        },
                        color = C.gold, fontSize = 13.sp, fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        if (d.remits.isEmpty() && d.goals.isEmpty() && d.bills.isEmpty()) item {
            SectionCard("Mabuhay, Kabayan! 👋") {
                Text(
                    "Dito mo makikita kung magkano na ang naipadala mo, saan napupunta ang pera, " +
                        "gaano kalapit sa ipon mo, at kailan ang mga bayarin sa Pinas.",
                    color = C.muted, fontSize = 14.sp
                )
                Spacer(Modifier.height(10.dp))
                Text("1. Pindutin ang + Padala para i-lista ang unang padala.", color = C.text, fontSize = 14.sp)
                Text("2. Sa 🐷 Ipon, maglagay ng goal (hal. Pambahay, Pang-negosyo).", color = C.text, fontSize = 14.sp)
                Text("3. Sa 🧾 Bayarin, ilagay ang kuryente, tubig, tuition, atbp. para may paalala.", color = C.text, fontSize = 14.sp)
                Spacer(Modifier.height(6.dp))
                TextButton(onClick = onAddRemit) { Text("+ Unang padala", color = C.greenDark, fontWeight = FontWeight.Bold) }
            }
        }

        // Bayarin na malapit na
        val upcoming = d.bills.filter { !Dates.paidThisMonth(it) }.sortedBy { Dates.daysUntilDue(it) }.take(4)
        if (upcoming.isNotEmpty()) item {
            SectionCard("🧾 Susunod na bayarin") {
                upcoming.forEach { b ->
                    val days = Dates.daysUntilDue(b)
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(b.name, color = C.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            Text(
                                "${Money.php(b.amount)} · ${Reminders.label(days)}",
                                color = if (days < 0) C.red else if (days <= 3) C.greenDark else C.muted, fontSize = 13.sp
                            )
                        }
                        TextButton(onClick = { onPaid(b) }) { Text("✓ Bayad na", color = C.green) }
                    }
                }
            }
        }

        // Saan napupunta ang padala
        if (thisMonth.isNotEmpty()) item {
            SectionCard("📊 Saan napupunta ngayong ${Dates.monthOnly(thisKey)}") {
                val byCat = thisMonth.groupBy { it.category }.mapValues { (_, l) -> l.sumOf { it.php } }.toList().sortedByDescending { it.second }
                byCat.forEach { (cat, amt) ->
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                        Text("${catIcon(cat)} $cat", color = C.text, fontSize = 14.sp, modifier = Modifier.weight(1f))
                        Text("${Money.php(amt)}  ${(amt / total * 100).toInt()}%", color = C.muted, fontSize = 13.sp)
                    }
                    Spacer(Modifier.height(4.dp))
                    Bar((amt / total).toFloat(), color = C.gold, track = C.goldSoft, height = 8)
                }
            }
        }

        // 6 na buwan
        if (d.remits.isNotEmpty()) item {
            SectionCard("📈 Huling 6 na buwan") {
                val keys = (-5..0).map { Dates.monthKeyOffset(it) }
                val sums = keys.map { k -> monthRemits(d, k).sumOf { it.php } }
                val max = (sums.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
                Row(Modifier.fillMaxWidth().height(120.dp), verticalAlignment = Alignment.Bottom) {
                    keys.forEachIndexed { i, k ->
                        Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                            if (sums[i] > 0) Text(short(sums[i]), color = C.muted, fontSize = 10.sp)
                            Box(
                                Modifier.width(22.dp).height((80 * (sums[i] / max)).coerceAtLeast(2.0).dp)
                                    .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                                    .background(if (k == thisKey) C.green else C.greenSoft)
                            )
                            Text(Dates.monthOnly(k).take(3), color = C.muted, fontSize = 11.sp)
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Text("Kabuuan sa 6 na buwan: ${Money.php(sums.sum())}", color = C.muted, fontSize = 13.sp)
            }
        }

        // Ipon
        if (d.goals.isNotEmpty()) item {
            SectionCard("🐷 Ipon") {
                d.goals.forEach { g ->
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                        Text(g.name, color = C.text, fontSize = 14.sp, modifier = Modifier.weight(1f))
                        Text("${pct(g)}%", color = C.greenDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(4.dp))
                    Bar(frac(g))
                }
                TextButton(onClick = { goTab(2) }) { Text("Tingnan lahat", color = C.greenDark) }
            }
        }
    }
}

private fun short(v: Double) = when {
    v >= 1_000_000 -> String.format(java.util.Locale.US, "%.1fM", v / 1_000_000)
    v >= 1_000 -> String.format(java.util.Locale.US, "%.0fk", v / 1_000)
    else -> v.toInt().toString()
}

private fun frac(g: Goal) = if (g.target <= 0) 0f else (g.saved / g.target).toFloat()
private fun pct(g: Goal) = (frac(g) * 100).toInt().coerceAtMost(999)

// ================= PADALA =================

@Composable
fun RemitScreen(d: Data, banner: @Composable () -> Unit, onEdit: (Remit) -> Unit) {
    val byMonth = d.remits.sortedByDescending { it.date }.groupBy { Dates.monthKey(it.date) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPadding, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { banner() }
        if (byMonth.isEmpty()) item {
            SectionCard("Wala pang padala") {
                Text("Pindutin ang + Padala sa baba para i-lista ang bawat padala mo pauwi.", color = C.muted, fontSize = 14.sp)
            }
        }
        byMonth.forEach { (key, list) ->
            item(key = "h$key") {
                Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 2.dp)) {
                    Text(Dates.monthName(key), color = C.greenDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text(Money.php(list.sumOf { it.php }), color = C.greenDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
            items(list, key = { it.id }) { r -> RemitRow(r) { onEdit(r) } }
        }
    }
}

@Composable
private fun RemitRow(r: Remit, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.card).clickable(onClick = onClick).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(50)).background(C.goldSoft), contentAlignment = Alignment.Center) {
            Text(catIcon(r.category), fontSize = 20.sp)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                if (r.to.isBlank()) r.category else "${r.to} · ${r.category}",
                color = C.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis
            )
            Text(
                listOf(Dates.day(r.date), r.via, r.note).filter { it.isNotBlank() }.joinToString(" · "),
                color = C.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(Money.php(r.php), color = C.text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Text(Money.of(r.amount, r.currency), color = C.muted, fontSize = 12.sp)
        }
    }
}

// ================= IPON =================

@Composable
fun GoalsScreen(d: Data, banner: @Composable () -> Unit, onEdit: (Goal) -> Unit, onAdd: (Goal) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPadding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { banner() }
        if (d.goals.isEmpty()) item {
            SectionCard("Wala pang ipon na goal") {
                Text("Halimbawa: Pambahay ₱500,000, Pang-negosyo ₱100,000, Emergency fund ₱50,000. Pindutin ang + Bagong ipon.", color = C.muted, fontSize = 14.sp)
            }
        } else item {
            val saved = d.goals.sumOf { it.saved }
            val target = d.goals.sumOf { it.target }
            SectionCard {
                Text("Kabuuang ipon", color = C.muted, fontSize = 13.sp)
                Text(Money.php(saved), color = C.greenDark, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                Text("sa target na ${Money.php(target)}", color = C.muted, fontSize = 13.sp)
            }
        }
        items(d.goals, key = { it.id }) { g ->
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(C.card).clickable { onEdit(g) }.padding(16.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("🐷 ${g.name}", color = C.text, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text("${pct(g)}%", color = C.greenDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(8.dp))
                Bar(frac(g), height = 12)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${Money.php(g.saved)} / ${Money.php(g.target)}", color = C.text, fontSize = 14.sp)
                        val left = g.target - g.saved
                        Text(if (left > 0) "Kulang pa ${Money.php(left)}" else "🎉 Naabot mo na!", color = C.muted, fontSize = 13.sp)
                    }
                    TextButton(onClick = { onAdd(g) }) { Text("+ Ihulog", color = C.greenDark, fontWeight = FontWeight.Bold) }
                }
            }
        }
    }
}

// ================= BAYARIN =================

@Composable
fun BillsScreen(d: Data, banner: @Composable () -> Unit, onEdit: (Bill) -> Unit, onTogglePaid: (Bill) -> Unit) {
    val bills = d.bills.sortedWith(compareBy({ Dates.paidThisMonth(it) }, { Dates.daysUntilDue(it) }))
    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { banner() }
        if (bills.isEmpty()) item {
            SectionCard("Wala pang bayarin") {
                Text(
                    "Ilagay ang mga buwanang bayarin sa Pinas (kuryente, tubig, internet, tuition, hulog sa bahay). " +
                        "Magpapaalala ang app 3 araw bago ang due.",
                    color = C.muted, fontSize = 14.sp
                )
            }
        } else item {
            val month = Dates.monthOnly(Dates.monthKey())
            val all = bills.sumOf { it.amount }
            val paid = bills.filter { Dates.paidThisMonth(it) }.sumOf { it.amount }
            SectionCard {
                Text("Bayarin ngayong $month", color = C.muted, fontSize = 13.sp)
                Text("${Money.php(paid)} / ${Money.php(all)} bayad na", color = C.greenDark, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                Bar(if (all > 0) (paid / all).toFloat() else 0f)
            }
        }
        items(bills, key = { it.id }) { b ->
            val paid = Dates.paidThisMonth(b)
            val days = Dates.daysUntilDue(b)
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                    .background(if (!paid && days < 0) C.redSoft else C.card)
                    .clickable { onEdit(b) }.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(b.name, color = C.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text("${Money.php(b.amount)} · tuwing ika-${b.dueDay}", color = C.muted, fontSize = 13.sp)
                    Text(
                        if (paid) "✓ Bayad na ngayong buwan" else "Due ${Dates.day(Dates.nextDue(b))}, ${Reminders.label(days)}",
                        color = when { paid -> C.green; days < 0 -> C.red; days <= 3 -> C.greenDark; else -> C.muted },
                        fontSize = 13.sp, fontWeight = if (!paid && days <= 3) FontWeight.Bold else FontWeight.Normal
                    )
                }
                TextButton(onClick = { onTogglePaid(b) }) {
                    Text(if (paid) "I-undo" else "✓ Bayad na", color = if (paid) C.muted else C.green, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
