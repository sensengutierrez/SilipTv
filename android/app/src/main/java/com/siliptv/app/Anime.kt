package com.siliptv.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONObject

/** Official na anime channel sa YouTube (hal. Muse Asia, Ani-One Asia) na libre at legal. */
data class AnimeSource(val name: String, val handle: String)

data class Episode(val videoId: String, val title: String, val published: String)

object Anime {
    private const val UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

    /** Nasa "anime" ng channels.json. */
    fun parse(json: String): List<AnimeSource> {
        val arr = JSONObject(json).optJSONArray("anime") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.getJSONObject(i)
            val h = o.optString("handle").trim()
            if (h.isEmpty()) null else AnimeSource(o.optString("name", h), if (h.startsWith("@")) h else "@$h")
        }
    }

    fun cached(c: Context): List<AnimeSource> {
        val p = c.getSharedPreferences("silip", Context.MODE_PRIVATE)
        p.getString("channels_json", null)?.let { s -> runCatching { parse(s) }.getOrNull()?.let { if (it.isNotEmpty()) return it } }
        return runCatching { parse(c.assets.open("channels.json").bufferedReader().use { it.readText() }) }.getOrDefault(emptyList())
    }

    private val channelIdPatterns = listOf(
        Regex("""<meta itemprop="identifier" content="(UC[A-Za-z0-9_-]{22})""""),
        Regex(""""externalId":"(UC[A-Za-z0-9_-]{22})""""),
        Regex(""""channelId":"(UC[A-Za-z0-9_-]{22})""""),
    )

    private fun get(url: String): String? {
        val req = Request.Builder().url(url)
            .header("User-Agent", UA)
            .header("Accept-Language", "en-US,en;q=0.8")
            .header("Cookie", "SOCS=CAI; CONSENT=YES+1")
            .build()
        return Channels.http.newCall(req).execute().use { r -> if (r.isSuccessful) r.body?.string() else null }
    }

    /**
     * Pinakabagong mga video ng channel gamit ang official RSS feed ng YouTube
     * (youtube.com/feeds/videos.xml?channel_id=...). Hinahanap muna ang channel ID mula sa @handle.
     */
    suspend fun latest(c: Context, src: AnimeSource): List<Episode>? = withContext(Dispatchers.IO) {
        try {
            val prefs = c.getSharedPreferences("silip", Context.MODE_PRIVATE)
            val key = "chid_" + src.handle.lowercase()
            val id = prefs.getString(key, null) ?: run {
                val html = get("https://www.youtube.com/${src.handle}") ?: return@withContext null
                val found = channelIdPatterns.firstNotNullOfOrNull { it.find(html)?.groupValues?.get(1) } ?: return@withContext null
                prefs.edit().putString(key, found).apply()
                found
            }
            val xml = get("https://www.youtube.com/feeds/videos.xml?channel_id=$id") ?: return@withContext null
            parseFeed(xml)
        } catch (e: Exception) { null }
    }

    private val entry = Regex("<entry>(.*?)</entry>", RegexOption.DOT_MATCHES_ALL)
    private val vid = Regex("<yt:videoId>([A-Za-z0-9_-]{11})</yt:videoId>")
    private val title = Regex("<title>(.*?)</title>", RegexOption.DOT_MATCHES_ALL)
    private val published = Regex("<published>(\\d{4}-\\d{2}-\\d{2})")

    fun parseFeed(xml: String): List<Episode> = entry.findAll(xml).mapNotNull { m ->
        val e = m.groupValues[1]
        val id = vid.find(e)?.groupValues?.get(1) ?: return@mapNotNull null
        Episode(
            id,
            unescape(title.find(e)?.groupValues?.get(1) ?: ""),
            published.find(e)?.groupValues?.get(1) ?: "",
        )
    }.toList()

    private fun unescape(s: String) = s
        .replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'")
        .replace("&lt;", "<").replace("&gt;", ">")
}
