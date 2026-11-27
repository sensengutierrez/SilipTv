# 💸 PadalaKo

App para sa OFW: i-lista ang bawat **padala**, tingnan kung **saan napupunta** ang pera, mag-**ipon** para sa goal, at magpaalala sa **bayarin sa Pinas**.

Nasa phone lang ang data (walang account, walang server). May backup at restore sa ⚙️ Settings.

## I-download

Android: https://github.com/sensengutierrez/SilipTv/releases/latest/download/PadalaKo.apk

## Auto update

Tuwing may bagong push sa `main`, gagawa ang GitHub ng bagong APK. Pagbukas ng app, lalabas ang "May bagong update"; pindutin ang **I-update** (sa unang beses, payagan ang "Install unknown apps" para sa PadalaKo).

## Mga tab

- 🏠 **Buod**: kabuuang padala ngayong buwan (piso at pera sa abroad), kumpara sa nakaraang buwan, saan napupunta (kategorya), huling 6 na buwan, susunod na bayarin, at ipon.
- 💸 **Padala**: listahan ng padala kada buwan. Pindutin ang isa para i-edit o burahin.
- 🐷 **Ipon**: mga goal (hal. Pambahay) na may progress. **+ Ihulog** para dagdagan.
- 🧾 **Bayarin**: buwanang bayarin na may araw ng due. Notification 3 araw bago ang due, at **✓ Bayad na** kapag nabayaran.

## Folders

```
├── android/            Android app (Kotlin, Compose); APK sa GitHub Releases
└── .github/workflows/  android.yml (gumagawa ng APK)
```
