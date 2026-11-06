# 8BP Solver Browser (proyek review, bukan APK jadi)

Browser Android berbasis GeckoView yang membuka `https://8ballpool.com/game`
dan memasang **hanya ekstensi solver kita** dari
`app/src/main/assets/solver-extension/` (content script solver heap v2.39).

> **Tidak ada AKWeb di aplikasi ini.** Ekstensi AKWeb + native bridge
> stub dihapus total 2026-11-07 atas permintaan user (APK sebelumnya
> menampilkan UI/login AKWeb). Tidak ada login AKWeb, tidak ada plan,
> tidak ada kunci atau kredensial apa pun.

## Apa yang ada di sini

- `app/src/main/java/com/akweb/browser/MainActivity.kt` — GeckoView
  fullscreen (landscape, mode desktop) + panel debug tersembunyi
  (status solver, URL, log) yang muncul lewat ikon obeng 🔧 di pojok
  kiri bawah.
- `app/src/main/java/com/akweb/browser/DebugLog.kt` — log panel, maks
  200 baris, format jam `HH:mm:ss`.
- `app/src/main/assets/solver-extension/` — ekstensi solver (manifest
  v2, content script `solver.js` = solver heap v2.39 tanpa blok metadata
  userscript, gating `ownModule()` supaya panel hanya dibangun di frame
  game yang punya Module sendiri).
- `app/src/main/assets/solver/` — salinan referensi userscript v2.39
  (bukan yang dipakai content script).
- `.github/workflows/android.yml` — pola build proyek lama
  (workflow_dispatch, JDK 17, SDK 34). Persetujuan build (2026-10-27):
  user setuju memakai repo private NandSki/akweb-browser dan minta
  cepat; push dan run workflow dilakukan parent setelah review, bukan
  oleh pembuat proyek ini. Cara push cepat ada di `STATUS.md`.

## Apa yang TIDAK ada / TIDAK diklaim

- **Tidak ada APK jadi.** Proyek ini belum pernah di-build di VM ini
  (tidak punya Java/Android SDK); build lewat GitHub Actions.
- **Solver belum terbukti di lapangan.** Panel solver harus muncul di
  frame game dengan garis + autoplay; itu yang dicek saat tes lapangan.
- **Tidak ada ekstensi AKWeb, tidak ada native bridge, tidak ada plan.**
- **Tidak ada kode APK asli.** Tidak ada `libakweb.so`, tidak ada dex
  asli, tidak ada APK asli di proyek ini.

## Cara build (setelah review)

1. Konfirmasi versi GeckoView di `app/build.gradle` ke artefak yang
   benar-benar terbit untuk GeckoView 157.
2. Konfirmasi permukaan API GeckoView di `MainActivity.kt`
   (`installBuiltIn`, `FrameLayout`, `Gravity`) terhadap GeckoView 157.
3. Baru jalankan workflow GitHub Actions secara manual, atau
   `./gradlew :app:assembleDebug` di mesin dengan SDK 34.

## Tes lapangan yang diharapkan (setelah APK ter-build)

1. Buka aplikasi → langsung landscape fullscreen ke 8ballpool.com/game,
   tanpa panel debug terlihat dan tanpa UI/login AKWeb apa pun.
2. Panel solver v2.39 muncul di dalam frame game (garis + tombol
   LINE PREVIEW / AUTO PLAY / MATCH BARU).
3. Ikon 🔧 terlihat di pojok kiri bawah; tap → panel debug muncul
   dengan `SOLVER: TERPASANG (v2.39)`; tap lagi → sembunyi.

Lihat `STATUS.md` untuk laporan verifikasi lokal.
