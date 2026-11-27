# 📺 SilipTV

Libreng live TV mula sa **official** YouTube channels ng mga Philippine network, sa isang app para sa phone, tablet at Smart TV (Android TV / Google TV).

Walang pirated streams: ang pinapatugtog lang ay ang mga live na nilalabas mismo ng network sa sarili nilang channel, gamit ang official YouTube player.

## I-download

Android (phone, tablet, Smart TV): https://github.com/sensengutierrez/SilipTv/releases/latest/download/SilipTV.apk

## Auto update

Tuwing may bagong push sa `main`, gagawa ang GitHub ng bagong APK. Pagbukas ng app, lalabas ang "May bagong update"; pindutin ang **I-update** (sa unang beses, payagan ang "Install unknown apps" para sa SilipTV).

## Paano gamitin

- Pagbukas, chine-check ng app kung aling channel ang naka-**LIVE** ngayon. Nasa unahan ang mga live.
- Piliin ang channel (touch, o OK sa remote ng TV).
- Habang nanonood: **Taas/Baba** sa remote (o swipe sa phone) = palit channel, **OK** = pangalan ng channel, **Back** = balik sa listahan.
- Kapag ayaw i-play ng channel sa loob ng app, kusang bubuksan sa YouTube app.

## Anime

Sa tab na 🎌 Anime, makikita ang pinakabagong libreng episodes mula sa official anime channels sa YouTube (Muse Asia, Ani-One Asia). May episode na baka naka-geo-block sa bansa mo.

## Magdagdag o magbawas ng channel

I-edit ang [`channels/channels.json`](channels/channels.json) dito sa GitHub. Ang `handle` ay ang `@pangalan` sa `youtube.com/@pangalan`. Makukuha ng app ang bagong listahan sa susunod na refresh, hindi na kailangan ng bagong APK.

## Limitasyon

- Live lang kapag naka-live mismo ang channel (hal. oras ng balita). Hindi lahat ng shows ay may libreng live.
- May live na naka-geo-block sa labas ng Pilipinas. Para doon, official subscription (hal. TFC, GMA Pinoy TV) ang legal na paraan.

## Folders

```
├── android/            Android app (Kotlin, Compose); APK sa GitHub Releases
├── channels/           channels.json: listahan ng channels (kasama sa APK at kinukuha rin online)
├── docs/player.html    YouTube player page (GitHub Pages) na ginagamit ng app
└── .github/workflows/  android.yml (gumagawa ng APK), pages.yml (nagde-deploy ng docs/)
```

## Setup (isang beses lang)

GitHub → Settings → Pages → **Source: GitHub Actions**. Kailangan ito para gumana ang player.
