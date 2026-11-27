package com.siliptv.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Isang channel: official YouTube channel ng network (handle, hal. "@gmanews"). */
data class Channel(
    val name: String,
    val handle: String,
    val group: String,
    val color: Long,
)

/** Estado ng live check ng isang channel. */
sealed class LiveState {
    data object Checking : LiveState()
    data class Live(val videoId: String, val title: String) : LiveState()
    data object Offline : LiveState()
    data object Error : LiveState()
}

object Channels {
    /** Listahan na pwedeng i-edit sa GitHub nang hindi gumagawa ng bagong APK. */
    const val REMOTE_URL = "https://raw.githubusercontent.com/sensengutierrez/SilipTv/main/channels/channels.json"
    private const val PREFS = "silip"
    private const val KEY_CACHE = "channels_json"

    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private const val UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

    fun parse(json: String): List<Channel> {
        val arr = JSONObject(json).getJSONArray("channels")
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.getJSONObject(i)
            val handle = o.optString("handle").trim()
            if (handle.isEmpty()) return@mapNotNull null
            Channel(
                name = o.optString("name", handle),
                handle = if (handle.startsWith("@")) handle else "@$handle",
                group = o.optString("group", ""),
                color = parseColor(o.optString("color", "#3A4A6B")),
            )
        }
    }

    private fun parseColor(s: String): Long =
        runCatching { 0xFF000000 or s.removePrefix("#").toLong(16) }.getOrDefault(0xFF3A4A6B)

    /** Bundled list → huling na-download na list → bagong download (kung may internet). */
    fun cached(c: Context): List<Channel> {
        val p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        p.getString(KEY_CACHE, null)?.let { s -> runCatching { parse(s) }.getOrNull()?.let { if (it.isNotEmpty()) return it } }
        return parse(c.assets.open("channels.json").bufferedReader().use { it.readText() })
    }

    suspend fun refresh(c: Context): List<Channel>? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url(REMOTE_URL + "?t=" + System.currentTimeMillis()).build()
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return@runCatching null
                val body = r.body?.string() ?: return@runCatching null
                val list = parse(body)
                if (list.isEmpty()) return@runCatching null
                c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_CACHE, body).apply()
                list
            }
        }.getOrNull()
    }

    private val canonical = Regex("""<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})"""")
    private val metaTitle = Regex("""<meta name="title" content="([^"]*)"""")

    /**
     * Tinitingnan ang youtube.com/@handle/live. Kapag naka-live ang channel, ang canonical link ng page
     * ay ang mismong live video. Kapag "upcoming" lang (naka-schedule pa), hindi pa ito live.
     */
    suspend fun checkLive(ch: Channel): LiveState = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url("https://www.youtube.com/${ch.handle}/live")
                .header("User-Agent", UA)
                .header("Accept-Language", "en-US,en;q=0.8")
                .header("Cookie", "SOCS=CAI; CONSENT=YES+1")
                .build()
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return@withContext LiveState.Error
                val html = r.body?.string() ?: return@withContext LiveState.Error
                val id = canonical.find(html)?.groupValues?.get(1) ?: return@withContext LiveState.Offline
                val live = html.contains("\"isLiveNow\":true") ||
                    (html.contains("\"isLive\":true") && !html.contains("\"isUpcoming\":true"))
                if (!live) return@withContext LiveState.Offline
                val title = metaTitle.find(html)?.groupValues?.get(1)?.let(::unescape) ?: ""
                LiveState.Live(id, title)
            }
        } catch (e: Exception) {
            LiveState.Error
        }
    }

    private fun unescape(s: String) = s
        .replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'")
        .replace("&lt;", "<").replace("&gt;", ">")
}
