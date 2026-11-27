package com.padalako.app

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.util.Calendar

/**
 * Paalala sa bayarin: isang beses kada araw (mga 9 AM) tinitingnan kung may bill na
 * malapit nang mag-due (3 araw o mas maikli) o lampas na, at nagpapakita ng notification.
 */
object Reminders {
    private const val CHANNEL = "bayarin"

    fun schedule(c: Context) {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pending(c)
        am.cancel(pi)
        if (!Store.load(c).settings.reminders) return
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 9); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_MONTH, 1)
        }
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.timeInMillis, AlarmManager.INTERVAL_DAY, pi)
    }

    private fun pending(c: Context): PendingIntent =
        PendingIntent.getBroadcast(c, 1, Intent(c, ReminderReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** Mga bill na hindi pa bayad at malapit na o lampas na ang due. */
    fun dueSoon(d: Data): List<Pair<Bill, Int>> =
        d.bills.filter { !Dates.paidThisMonth(it) }
            .map { it to Dates.daysUntilDue(it) }
            .filter { it.second <= 3 }
            .sortedBy { it.second }

    fun label(days: Int) = when {
        days < 0 -> "lampas na ng ${-days} araw"
        days == 0 -> "ngayong araw"
        days == 1 -> "bukas"
        else -> "sa loob ng $days araw"
    }

    fun notifyIfNeeded(c: Context) {
        val d = Store.load(c)
        if (!d.settings.reminders) return
        val due = dueSoon(d)
        if (due.isEmpty()) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = c.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Paalala sa bayarin", NotificationManager.IMPORTANCE_DEFAULT))
        }
        val title = if (due.size == 1) "Bayarin: ${due[0].first.name}" else "${due.size} bayarin ang malapit na"
        val text = due.joinToString("\n") { (b, days) -> "${b.name} ${Money.php(b.amount)}, ${label(days)}" }
        val open = PendingIntent.getActivity(c, 2, Intent(c, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, 3),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_notif)
            .setContentTitle(title)
            .setContentText(text.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try { NotificationManagerCompat.from(c).notify(10, n) } catch (e: SecurityException) { }
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        if (i.action == Intent.ACTION_BOOT_COMPLETED || i.action == Intent.ACTION_MY_PACKAGE_REPLACED) Reminders.schedule(c)
        else Reminders.notifyIfNeeded(c)
    }
}
