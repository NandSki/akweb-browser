# STATUS — Proyek Android Browser AKWeb (siap review, belum di-build)

Tanggal: 2026-10-27. Lokasi proyek lokal: `~/workspace/work/akweb-browser/`.
**Ini BUKAN APK jadi, dan ekstensi di dalamnya TIDAK diklaim berfungsi penuh.**

## Persetujuan build (dicatat sesuai update user 2026-10-27)

- User **SETUJU** memakai GitHub-nya, repo private **NandSki/8bp-apk**,
  untuk build proyek ini, dan minta cepat.
- **Tetap TIDAK ada push oleh subagent pembuat proyek ini.** Tidak ada
  `git push`, tidak ada remote yang ditambahkan, proyek ini bahkan tidak
  punya `.git` sendiri. Push dan menjalankan workflow dilakukan parent
  setelah review (lihat "Cara push cepat" di bawah).

## Apa yang sudah dibuat

Proyek Android dari nol, template build dari proyek lama
`~/workspace/work/8bp-apk/` (AGP 8.2.2, Kotlin 1.9.24, Gradle 8.5,
Java 17, compileSdk/targetSdk 34, minSdk 26):

- `settings.gradle` — nama proyek `akweb-browser`, repo google/mavenCentral
  + `https://maven.mozilla.org/maven2` untuk GeckoView.
- `build.gradle` — AGP 8.2.2, Kotlin 1.9.24 (sama dengan template lama).
- `gradle.properties` — `android.useAndroidX=true` (berbeda dari proyek
  lama yang `false`, karena GeckoView membawa dependensi AndroidX).
- `gradle/wrapper/gradle-wrapper.properties` — Gradle 8.5.
- `app/build.gradle` — namespace/applicationId `com.akweb.browser`,
  versionName `0.1.0-review`, dependensi
  `org.mozilla.geckoview:geckoview:157.0` (lihat catatan verifikasi di bawah).
- `app/src/main/AndroidManifest.xml` — satu activity `.MainActivity`
  (launcher), label "AKWeb Browser (review)", izin hanya `INTERNET`.
- `app/src/main/java/com/akweb/browser/MainActivity.kt` — GeckoView yang
  membuka `https://8ballpool.com`, tombol "Buka 8ballpool.com" dan
  "Muat ulang", plus panel debug (lihat bawah).
- `app/src/main/java/com/akweb/browser/DebugLog.kt` — log panel, maks 200
  baris, format jam `HH:mm:ss`.
- `app/src/main/java/com/akweb/browser/NativeBridgeStub.kt` — host native
  messaging stub bernama `com.aimking.akweb.bridge` (nama dari
  `generated-contract.js` ekstensi). Murni Kotlin, tanpa Android/Gecko,
  sehingga bisa diuji unit.
- `app/src/main/java/com/akweb/browser/AkwebExtensionDelegate.kt` —
  jembatan GeckoView <-> ekstensi (MessageDelegate/Port).
- `app/src/test/java/com/akweb/browser/NativeBridgeStubTest.kt` — 4 tes unit.
- `app/src/main/assets/akweb-extension/` — **18 file, salinan verbatim**
  dari zip user `~/workspace/user/files/ini_4_1fks.zip`
  (md5 `2a3c9c970636b4bdd0ae629ed88cd620`), diverifikasi `diff -r`
  identik dengan hasil unzip. Termasuk `manifest.json` (AKWeb Android
  Bridge v100.54611.63313.53404, gecko.id
  `akweb-android-bridge@example.invalid`, strict_min_version 157.0,
  permission nativeMessaging/geckoViewAddons, origin prod-web-pool dan
  8ballpool.com), `isolated-bridge.js`, dan `readonly-game-snapshot.js`.
- `.github/workflows/android.yml` — pola proyek lama: `workflow_dispatch`,
  JDK 17 (Temurin), SDK 34 (platform-tools, platforms;android-34,
  build-tools 34.0.0), Gradle 8.5, `:app:assembleDebug
  :app:testDebugUnitTest`, upload artefak `app-debug`. Siap push.
- `README.md`, `.gitignore` (menolak `*.apk`, `*.so`, `*.dex`).

## Panel debug di aplikasi (yang diminta)

Menampilkan: (1) ekstensi terpasang atau tidak, (2) URL game yang dibuka,
(3) pesan native yang diterima, (4) status plan. Plus log bergulir
dengan stempel waktu.

## Perilaku stub — blokir yang TIDAK disembunyikan

Ekstensi meminta plan lewat `browser.runtime.connectNative(
"com.aimking.akweb.bridge")` dengan pesan `build.observe` dan
`game.snapshot.plan`. Stub ini:

- mencatat setiap pesan yang masuk,
- selalu membalas `status = "plan_tidak_tersedia"`, `accepted = false`,
- **TIDAK PERNAH** mengembalikan objek plan apa pun, dan tidak meniru
  jawaban "diterima" host asli.

Jadi saat tes lapangan, yang diharapkan terlihat adalah: pesan
`build.observe` / `game.snapshot.plan` masuk, balasan
`plan_tidak_tersedia` keluar, dan snapshot ekstensi berhenti di situ.
Itu bukti titik berhentinya, bukan kegagalan yang ditutupi.

## Yang TIDAK ada di proyek ini (sengaja)

- Tidak ada APK, tidak ada hasil build, tidak ada `.so`, `.dex`, atau
  file dari APK AKWeb asli. Pencarian file terlarang di proyek: 0 hasil.
- Tidak ada plan palsu dan tidak ada string `schemaVersion` di kode
  Kotlin buatan proyek ini.
- Tidak ada login/membership AKWeb, tidak ada kunci atau kredensial apa pun.

## Verifikasi lokal yang sudah dilakukan (tanpa Java/Android SDK di VM)

VM ini tidak punya `java`/`gradle`/`kotlinc`, jadi **tidak ada kompilasi
yang dijalankan dan tidak ada APK yang dihasilkan**. Yang bisa dicek
lokal sudah dicek:

- Keseimbangan kurung semua 5 file Kotlin: seimbang (brace dan parens).
- Konsistensi: namespace = applicationId = `com.akweb.browser`,
  package Kotlin sama, activity manifest `.MainActivity`, izin INTERNET,
  compileSdk/targetSdk 34, workflow JDK 17 + SDK 34 + Gradle 8.5.
- Aset ekstensi: `diff -r` identik dengan unzip zip user, 18 file lengkap.
- Logika stub disimulasikan (bukan eksekusi Kotlin): untuk
  `build.observe`, `game.snapshot.plan`, dan operasi tak dikenal,
  balasan selalu `status=plan_tidak_tersedia`, `accepted=false`, dan
  tidak mengandung field `"plan"`. (Catatan: di source Kotlin bentuknya
  tertulis escaped `\"accepted\":false`, yang saat runtime menjadi
  `"accepted":false` — itulah kenapa grep mentah tanpa escape sempat
  terlihat "tidak ada".)
- Workflow: `workflow_dispatch`, JDK 17, android-34, Gradle 8.5 — sesuai
  pola proyek lama.

## Yang BELUM — dan harus dicek sebelum/disaat build pertama

1. **Versi GeckoView di Maven.** `geckoview:157.0` di `app/build.gradle`
   harus dikonfirmasi ke artefak yang benar-benar terbit untuk GeckoView
   157 (ekstensi menuntut strict_min_version 157.0). Jika `157.0` bukan
   versi artefak yang terbit, ganti ke versi terbit 157.x yang benar
   sebelum build remote pertama. Ini satu-satunya angka yang belum
   terverifikasi ke Maven (VM offline untuk hal ini).
2. **Permukaan API GeckoView 157** di `AkwebExtensionDelegate.kt`
   (MessageDelegate, Port/PortDelegate, `setMessageDelegate`,
   `installBuiltIn("resource://android/assets/akweb-extension/")`).
   Jika ada nama yang berubah di 157, build pertama akan gagal di titik
   itu dan nama tersebut yang diperbaiki — logika stub tidak berubah.
   `MainActivity` sengaja tidak memakai NavigationDelegate untuk
   mengurangi permukaan API yang belum terverifikasi; status URL panel
   diisi dari URL yang dibuka.
3. **Build remote** (GitHub Actions) — belum dijalankan.
4. **Tes plan di HP** — belum dilakukan; hanya bisa dibuktikan setelah
   APK ter-build dan diinstal di HP user.

## Cara push cepat (untuk parent, setelah review)

Repo lama `NandSki/8bp-apk` saat ini berisi proyek 8bp-apk di branch
utama. Supaya proyek ini tidak menimpa proyek lama, cara tercepat yang
disarankan adalah branch terpisah (isi branch = proyek ini di root,
sehingga workflow di atas jalan apa adanya):

1. Di mesin dengan akses repo: salin isi `~/workspace/work/akweb-browser/`
   ke checkout repo `NandSki/8bp-apk`.
2. `git checkout -b akweb-browser` (dari branch utama yang bersih).
3. `git add -A` lalu `git commit -m "AKWeb Browser review: GeckoView + ekstensi AKWeb + host stub plan_tidak_tersedia"`.
4. `git push -u origin akweb-browser`.
5. Di GitHub repo > Actions > "Build AKWeb Browser (debug)" > pilih
   branch `akweb-browser` > Run workflow.
6. Ambil artefak `app-debug`, instal di HP, lalu cek panel debug sesuai
   "Tes lapangan yang diharapkan" di `README.md`.

Alternatif (jika mau satu branch utama): push sebagai subfolder
`akweb-browser/` — tapi workflow dan path artefak harus diubah dulu
(working-directory dan `app/build/...` menjadi
`akweb-browser/app/build/...`), jadi tidak disarankan kalau mau cepat.

## Langkah berikutnya (berurutan)

1. Parent review proyek ini (khususnya 2 item verifikasi build pertama
   di atas).
2. Parent push ke repo NandSki/8bp-apk (branch `akweb-browser`) dan jalankan
   workflow_dispatch.
3. Jika build hijau: instal APK di HP user, buka 8ballpool.com, kirim
   isi panel debug/log (terutama baris `NATIVE <-` / `NATIVE ->`).
4. Dari log itu diputuskan langkah selanjutnya: apakah dibuat generator
   plan sendiri (pekerjaan reverse-engineering terpisah, bukan bagian
   proyek ini) atau kembali memakai APK AKWeb asli. Proyek ini tidak
   mengklaim langkah itu sudah selesai.
