package com.padalako.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/** Isang padala (remittance) pauwi sa Pinas. */
data class Remit(
    val id: Long,
    val date: Long,          // epoch millis
    val amount: Double,      // halaga sa pera ng bansang pinagtatrabahuhan (hal. BHD)
    val currency: String,
    val rate: Double,        // 1 [currency] = rate PHP
    val to: String,          // kanino (hal. Nanay)
    val category: String,    // para saan
    val via: String,         // saan ipinadala (bank, remittance center, GCash...)
    val note: String,
) {
    val php get() = amount * rate
}

/** Ipon na may target. */
data class Goal(val id: Long, val name: String, val target: Double, val saved: Double)

/** Bayarin sa Pinas na buwan-buwan. paidMonth = "yyyy-MM" ng huling buwan na nabayaran. */
data class Bill(val id: Long, val name: String, val amount: Double, val dueDay: Int, val paidMonth: String)

data class Settings(val currency: String = "BHD", val rate: Double = 150.0, val reminders: Boolean = true)

data class Data(
    val remits: List<Remit> = emptyList(),
    val goals: List<Goal> = emptyList(),
    val bills: List<Bill> = emptyList(),
    val settings: Settings = Settings(),
)

object Store {
    private const val PREFS = "padalako"
    private const val KEY = "data"

    val categories = listOf("Pang-araw-araw", "Tuition", "Bayarin", "Gamot", "Bahay", "Utang", "Ipon", "Negosyo", "Okasyon", "Iba pa")
    val currencies = listOf("BHD", "SAR", "AED", "QAR", "KWD", "OMR", "USD", "SGD", "HKD", "JPY", "EUR", "GBP")

    fun load(c: Context): Data {
        val s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return Data()
        return try { fromJson(JSONObject(s)) } catch (e: Exception) { Data() }
    }

    fun save(c: Context, d: Data) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, toJson(d).toString()).apply()
    }

    fun newId() = System.currentTimeMillis() * 1000 + (0..999).random()

    // ---------- JSON (pang-save at pang-backup) ----------

    fun toJson(d: Data): JSONObject = JSONObject().apply {
        put("version", 1)
        put("remits", JSONArray().apply {
            d.remits.forEach { r ->
                put(JSONObject().put("id", r.id).put("date", r.date).put("amount", r.amount).put("currency", r.currency)
                    .put("rate", r.rate).put("to", r.to).put("category", r.category).put("via", r.via).put("note", r.note))
            }
        })
        put("goals", JSONArray().apply {
            d.goals.forEach { g -> put(JSONObject().put("id", g.id).put("name", g.name).put("target", g.target).put("saved", g.saved)) }
        })
        put("bills", JSONArray().apply {
            d.bills.forEach { b ->
                put(JSONObject().put("id", b.id).put("name", b.name).put("amount", b.amount).put("dueDay", b.dueDay).put("paidMonth", b.paidMonth))
            }
        })
        put("settings", JSONObject().put("currency", d.settings.currency).put("rate", d.settings.rate).put("reminders", d.settings.reminders))
    }

    fun fromJson(j: JSONObject): Data {
        fun <T> arr(name: String, f: (JSONObject) -> T): List<T> {
            val a = j.optJSONArray(name) ?: return emptyList()
            return (0 until a.length()).map { f(a.getJSONObject(it)) }
        }
        val s = j.optJSONObject("settings")
        return Data(
            remits = arr("remits") {
                Remit(it.getLong("id"), it.getLong("date"), it.getDouble("amount"), it.optString("currency", "BHD"),
                    it.getDouble("rate"), it.optString("to"), it.optString("category", "Iba pa"), it.optString("via"), it.optString("note"))
            },
            goals = arr("goals") { Goal(it.getLong("id"), it.optString("name"), it.getDouble("target"), it.optDouble("saved", 0.0)) },
            bills = arr("bills") { Bill(it.getLong("id"), it.optString("name"), it.getDouble("amount"), it.optInt("dueDay", 1), it.optString("paidMonth")) },
            settings = if (s == null) Settings() else Settings(s.optString("currency", "BHD"), s.optDouble("rate", 150.0), s.optBoolean("reminders", true)),
        )
    }
}

/** Mga petsa (Calendar para gumana kahit sa lumang Android). */
object Dates {
    private val months = listOf("Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo", "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre")
    private val short = listOf("Ene", "Peb", "Mar", "Abr", "May", "Hun", "Hul", "Ago", "Set", "Okt", "Nob", "Dis")
    private val keyFmt get() = SimpleDateFormat("yyyy-MM", Locale.US)

    fun monthKey(millis: Long = System.currentTimeMillis()): String = keyFmt.format(millis)

    fun monthKeyOffset(offset: Int): String {
        val c = Calendar.getInstance(); c.set(Calendar.DAY_OF_MONTH, 1); c.add(Calendar.MONTH, offset)
        return keyFmt.format(c.timeInMillis)
    }

    /** "2026-11" -> "Nobyembre 2026" */
    fun monthName(key: String): String {
        val p = key.split("-")
        val m = p.getOrNull(1)?.toIntOrNull() ?: return key
        return "${months[m - 1]} ${p[0]}"
    }

    fun monthOnly(key: String): String {
        val m = key.split("-").getOrNull(1)?.toIntOrNull() ?: return key
        return months[m - 1]
    }

    fun day(millis: Long): String {
        val c = Calendar.getInstance(); c.timeInMillis = millis
        return "${short[c.get(Calendar.MONTH)]} ${c.get(Calendar.DAY_OF_MONTH)}, ${c.get(Calendar.YEAR)}"
    }

    fun addDays(millis: Long, days: Int): Long {
        val c = Calendar.getInstance(); c.timeInMillis = millis; c.add(Calendar.DAY_OF_MONTH, days)
        return c.timeInMillis
    }

    private fun startOfDay(millis: Long): Long {
        val c = Calendar.getInstance(); c.timeInMillis = millis
        c.set(Calendar.HOUR_OF_DAY, 0); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
        return c.timeInMillis
    }

    /** Petsa ng susunod na bayad ng bill (ngayong buwan kung hindi pa bayad, kung bayad na ay sa susunod na buwan). */
    fun nextDue(b: Bill, now: Long = System.currentTimeMillis()): Long {
        val c = Calendar.getInstance(); c.timeInMillis = startOfDay(now)
        if (b.paidMonth == monthKey(now)) { c.set(Calendar.DAY_OF_MONTH, 1); c.add(Calendar.MONTH, 1) }
        c.set(Calendar.DAY_OF_MONTH, b.dueDay.coerceIn(1, c.getActualMaximum(Calendar.DAY_OF_MONTH)))
        return c.timeInMillis
    }

    /** Ilang araw pa bago ang due (negatibo = lampas na). */
    fun daysUntilDue(b: Bill, now: Long = System.currentTimeMillis()): Int =
        Math.round((nextDue(b, now) - startOfDay(now)) / 86_400_000.0).toInt()

    fun paidThisMonth(b: Bill) = b.paidMonth == monthKey()
}

object Money {
    fun php(v: Double) = "₱" + String.format(Locale.US, "%,.2f", v)
    fun of(v: Double, cur: String) = String.format(Locale.US, "%,.2f", v) + " " + cur
    fun parse(s: String): Double? = s.replace(",", "").trim().toDoubleOrNull()
    fun plain(v: Double): String = if (v == Math.floor(v)) v.toLong().toString() else String.format(Locale.US, "%.2f", v)
}
