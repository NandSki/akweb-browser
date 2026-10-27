# AKWeb Browser (proyek review, bukan APK jadi)

Browser Android berbasis GeckoView yang membuka `https://8ballpool.com` dan
memasang ekstensi AKWeb dari `app/src/main/assets/akweb-extension/`.

## Apa yang ada di sini

- `app/src/main/java/com/akweb/browser/MainActivity.kt` — GeckoView +
  panel debug (status ekstensi, URL, pesan native, status plan).
- `app/src/main/java/com/akweb/browser/AkwebExtensionDelegate.kt` — jembatan
  GeckoView <-> ekstensi.
- `app/src/main/java/com/akweb/browser/NativeBridgeStub.kt` — host native
  messaging stub bernama `com.aimking.akweb.bridge`. Hanya mencatat pesan
  dan selalu membalas `plan_tidak_tersedia` (accepted=false).
- `app/src/main/assets/akweb-extension/` — salinan **verbatim** dari zip
  yang dikirim user (`ini_4_1fks.zip`, md5
  `2a3c9c970636b4bdd0ae629ed88cd620`), 18 file. Bukan dari APK asli.
- `.github/workflows/android.yml` — pola build proyek lama (workflow_dispatch,
  JDK 17, SDK 34). **Siap push, belum di-push.** Persetujuan build
  (2026-10-27): user setuju memakai repo private NandSki/8bp-apk dan minta
  cepat; push dan run workflow dilakukan parent setelah review, bukan oleh
  pembuat proyek ini. Cara push cepat ada di `STATUS.md`.

## Apa yang TIDAK ada / TIDAK diklaim

- **Tidak ada APK jadi.** Proyek ini belum pernah di-build (VM ini tidak
  punya Java/Android SDK).
- **Ekstensi tidak berfungsi penuh.** Tanpa plan dari host asli, snapshot
  ekstensi akan berhenti di handshake plan. Itulah yang akan terlihat di
  panel debug saat tes lapangan: pesan `build.observe` /
  `game.snapshot.plan` masuk, balasan `plan_tidak_tersedia` keluar.
- **Tidak ada plan palsu.** Stub tidak mengembalikan objek plan apa pun
  dan tidak meniru jawaban "diterima" host asli.
- **Tidak ada kode APK asli.** Tidak ada `libakweb.so`, tidak ada dex
  asli, tidak ada APK asli di proyek ini.

## Cara build (setelah review)

1. Konfirmasi versi GeckoView di `app/build.gradle` ke artefak yang
   benar-benar terbit untuk GeckoView 157 (lihat catatan di file itu).
2. Konfirmasi permukaan API GeckoView di `AkwebExtensionDelegate.kt`
   (MessageDelegate/Port/setMessageDelegate/installBuiltIn) terhadap
   GeckoView 157 — itu item verifikasi build pertama.
3. Baru jalankan workflow GitHub Actions secara manual, atau
   `./gradlew :app:assembleDebug` di mesin dengan SDK 34.

## Tes lapangan yang diharapkan (setelah APK ter-build)

1. Buka aplikasi, tekan "Buka 8ballpool.com".
2. Panel harus menunjukkan: EKSTENSI: TERPASANG, URL game, PLAN:
   `plan_tidak_tersedia`.
3. Saat game memuat dan ekstensi meminta plan, log harus menunjukkan
   `NATIVE <- build.observe` / `NATIVE <- game.snapshot.plan` lalu
   `NATIVE -> ... status=plan_tidak_tersedia accepted=false`.
4. Jika log itu muncul, proyek ini sudah membuktikan titik berhentinya.
   Langkah berikutnya bukan "ulangi build", melainkan memutuskan apakah
   akan dibuat generator plan sendiri (pekerjaan reverse-engineering
   terpisah, bukan bagian proyek ini) atau kembali memakai APK AKWeb asli.

Lihat `STATUS.md` untuk laporan verifikasi lokal.
