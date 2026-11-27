package com.siliptv.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * Auto update: tinitingnan ang pinakabagong release sa GitHub (tag na app-vN).
 * Kapag mas bago ang N kaysa sa versionCode ng app, ida-download ang APK at bubuksan ang installer.
 * Kaya tuwing may push sa main, gagawa ang GitHub ng bagong APK at makikita ito ng app.
 */
object Updater {
    const val REPO = "sensengutierrez/SilipTv"

    data class Release(val number: Int, val apkUrl: String)

    suspend fun check(): Release? = withContext(Dispatchers.IO) {
        try {
            val r = Request.Builder().url("https://api.github.com/repos/$REPO/releases/latest")
                .header("Accept", "application/vnd.github+json").build()
            Channels.http.newCall(r).execute().use { res ->
                if (!res.isSuccessful) return@withContext null
                val j = JSONObject(res.body?.string() ?: return@withContext null)
                val n = j.optString("tag_name").removePrefix("app-v").toIntOrNull() ?: return@withContext null
                var url: String? = null
                val assets = j.optJSONArray("assets")
                if (assets != null) for (i in 0 until assets.length()) {
                    val a = assets.getJSONObject(i)
                    if (a.optString("name").endsWith(".apk")) url = a.optString("browser_download_url")
                }
                if (url != null && n > BuildConfig.VERSION_CODE) Release(n, url) else null
            }
        } catch (e: Exception) { null }
    }

    /** I-download ang APK; tinatawag ang progress(0..1). Itinutuloy kapag naputol (hanggang 4 na beses). */
    suspend fun download(c: Context, rel: Release, progress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val dir = File(c.getExternalFilesDir(null) ?: c.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val f = File(dir, "SilipTV-${rel.number}.apk")
        var total = -1L
        var tries = 0
        while (true) {
            val have = if (f.exists()) f.length() else 0L
            if (total > 0 && have >= total) break
            val req = Request.Builder().url(rel.apkUrl).apply { if (have > 0) header("Range", "bytes=$have-") }.build()
            try {
                Channels.http.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) throw RuntimeException("HTTP ${res.code}")
                    val body = res.body ?: throw RuntimeException("Walang laman")
                    val resumed = res.code == 206
                    if (!resumed && have > 0) f.delete()
                    val start = if (resumed) have else 0L
                    if (total < 0) {
                        val len = body.contentLength()
                        total = if (len > 0) start + len else -1L
                    }
                    body.byteStream().use { input ->
                        FileOutputStream(f, resumed).use { out ->
                            val buf = ByteArray(64 * 1024); var done = start
                            while (true) {
                                val n = input.read(buf); if (n < 0) break
                                out.write(buf, 0, n); done += n
                                if (total > 0) {
                                    val p = (done.toFloat() / total).coerceAtMost(1f)
                                    withContext(Dispatchers.Main) { progress(p) }
                                }
                            }
                        }
                    }
                }
                if (total <= 0) break
            } catch (e: Exception) {
                if (++tries >= 4) throw RuntimeException("Naputol ang download. Subukan ulit.")
            }
            if (total > 0 && f.length() < total && ++tries >= 4) throw RuntimeException("Hindi buo ang na-download. Subukan ulit.")
        }
        val ok = try { java.util.zip.ZipFile(f).use { it.getEntry("AndroidManifest.xml") != null } } catch (e: Exception) { false }
        if (!ok) { f.delete(); throw RuntimeException("Sira ang na-download na file. Subukan ulit.") }
        f
    }

    /** Kailangang payagan ng user ang "Install unknown apps" para sa SilipTV (minsan lang). */
    fun canInstall(c: Context) = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || c.packageManager.canRequestPackageInstalls()

    fun openInstallPermission(c: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            c.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${c.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun install(c: Context, f: File) {
        val uri = FileProvider.getUriForFile(c, "${c.packageName}.files", f)
        c.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
