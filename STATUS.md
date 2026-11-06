# STATUS — Proyek Android Browser AKWeb (siap review, belum di-build)

Tanggal: 2026-10-27. Lokasi proyek lokal: `~/workspace/work/akweb-browser/`.
**Ini BUKAN APK jadi, dan ekstensi di dalamnya TIDAK diklaim berfungsi penuh.**

## Update 2026-11-06 — Inject solver v2.39 + fullscreen ala AKWeb

Perubahan sejak 2026-10-27 (semua lokal, TIDAK ada push/CI oleh subagent):

### 1. Inject solver heap v2.39 (jalur terpisah dari ekstensi AKWeb)
- Solver disalin verbatim ke
  `app/src/main/assets/solver/akweb-heap-solver-serius-v2.39.user.js`
  (md5 `67eae7f57b1d09591334040f1b443669`, sama dengan file sumber di
  `~/workspace/goals/8-ball-pool-autoplay/files/`, 229.893 byte).
- Ekstensi solver baru di `app/src/main/assets/solver-extension/`:
  - `manifest.json` — manifest v2, gecko.id
    `akv2-solver@example.invalid`, strict_min_version 157.0, satu
    content script `solver.js`, matches = origin game
    (prod-web-pool.miniclip.com, *.pool.miniclippt.com,
    *.miniclip.com, *.miniclippt.com, 8ballpool.com,
    www.8ballpool.com), `all_frames: true`,
    `run_at: document_start`.
  - `solver.js` (229.223 byte) — isi solver v2.39 TANPA 14 baris blok
    metadata `==UserScript==` (diverifikasi identik dengan badan
    userscript, `node --check` OK). Blok itu hanya dibaca Tampermonkey;
    sebagai content script tidak dibutuhkan.
- `MainActivity.kt` — fungsi baru `installSolverExtension(rt)`:
  memasang ekstensi solver via `installBuiltIn(
  "resource://android/assets/solver-extension/")`. Urutan install:
  ekstensi AKWeb dulu → solver kedua → game dibuka dari callback
  solver (sukses maupun gagal), supaya kedua content script terdaftar
  sebelum halaman pertama dimuat. Kode ekstensi AKWeb TIDAK diubah.
- Panel debug: status baru `SOLVER: TERPASANG (v2.39)` /
  `SOLVER: GAGAL (...)` / `SOLVER: belum dipasang`, plus tombol
  "Muat ulang (re-inject solver)" (me-reload halaman → content
  script disuntikkan ulang).
- **Cara inject yang dipilih: WebExtension content script** (bukan
  `javascript:` URL, bukan evaluate JS). Alasan: GeckoView TIDAK
  punya API publik evaluateJS di GeckoSession (tidak seperti
  WebView.evaluateJavascript), dan `loadUri("javascript:...")` tidak
  bisa diandalkan untuk file 228 KB di semua frame. Content script
  adalah cara resmi GeckoView — persis cara content script AKWeb
  (`readonly-game-snapshot.js`) disuntikkan ke frame prod-web-pool.
  Solver juga memang dirancang untuk pola ini: `@run-at
  document-start` + `inject()` script-tag ke page context, dan
  `init()` menunggu Module sampai 120 detik.

### 2. Tampilan fullscreen ala AKWeb
- GeckoView mengisi seluruh layar (`FrameLayout` MATCH_PARENT);
  panel debug + semua tombol DISEMBUNYIKAN dari tampilan utama
  (`View.GONE`). Game langsung kebuka begitu APK dijalankan.
- Panel debug hanya muncul lewat **triple-tap di layar game**
  (3 ketukan < 600 ms; `OnTouchListener` mengembalikan `false`
  supaya sentuhan tetap diteruskan ke game) atau tombol "Tutup
  panel debug" di dalam panel itu sendiri.

### 3. Persyaratan user lainnya
- `GAME_URL` diubah ke `https://8ballpool.com/game`
  (sebelumnya `https://8ballpool.com`).
- Orientasi **landscape** saat pertama masuk: `AndroidManifest.xml`,
  `android:screenOrientation="landscape"` +
  `android:configChanges="orientation|screenSize|keyboardHidden"`
  di `.MainActivity`.
- Mode **desktop dipertahankan**: `USER_AGENT_MODE_DESKTOP` +
  `VIEWPORT_MODE_DESKTOP` di `MainActivity.setupGecko()` (tidak diubah).
- **ABI filter arm64-v8a saja: SUDAH ADA** di `app/build.gradle`
  (`ndk { abiFilters += "arm64-v8a" }`, baris 20) sejak sebelum
  tugas ini — tidak ada perubahan yang dibutuhkan. Tanpa filter,
  APK ikut membawa lib x86_64 (~185 MB) dan armeabi-v7a (~130 MB);
  dengan filter, perkiraan APK ~190 MB (GeckoView libxul 148 MB
  mendominasi; user sudah tahu dan setuju pakai Gecko).

### Verifikasi lokal (tanpa Java/Android SDK di VM)
- Keseimbangan kurung semua file Kotlin yang diubah: seimbang
  (MainActivity 345 baris, braces 0, parens 0).
- `solver.js`: `node --check` OK; identik dengan badan userscript
  v2.39; `manifest.json` solver: JSON valid.
- `AndroidManifest.xml`: landscape + configChanges ada;
  `GAME_URL`, desktop UA, ABI filter terkonfirmasi lewat grep.
- **TIDAK ada build yang dijalankan** (VM tidak punya java/gradle/
  Android SDK); TIDAK ada push ke GitHub; TIDAK ada workflow CI
  yang dijalankan. Semua masih harus diverifikasi lewat build
  remote pertama (lihat bawah).

### Yang belum terverifikasi / perlu dites di HP user
1. Build remote pertama (GitHub Actions, `:app:assembleDebug`) —
   permukaan API baru yang dipakai (`installBuiltIn` kedua,
   `FrameLayout`, `setOnTouchListener`) harus lolos kompilasi
   GeckoView 157.
2. Di HP: APK dibuka → langsung landscape fullscreen game
   (https://8ballpool.com/game), tanpa panel debug terlihat.
3. Panel solver muncul di dalam game (garis/lines + panel solver
   v2.39); status panel debug (triple-tap) menunjukkan
   `SOLVER: TERPASANG (v2.39)`.
4. Triple-tap tidak mengganggu aim/tembak game; tombol "Tutup
   panel debug" menyembunyikan panel lagi.
5. Kalau status solver `GAGAL`, kirim isi log panel (baris
   `SOLVER ...`) — kemungkinan besar manifest/id ekstensi solver
   ditolak GeckoView 157.

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
