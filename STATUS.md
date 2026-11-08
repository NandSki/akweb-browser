# STATUS — Proyek 8BP Solver Browser (GeckoView + solver v2.39, tanpa AKWeb)

Tanggal: 2026-10-27. Lokasi proyek lokal: `~/workspace/work/akweb-browser/`.
**Ini BUKAN APK jadi, dan solver di dalamnya TIDAK diklaim berfungsi penuh.**

## Update 2026-11-07 (hapus AKWeb) — APK cuma solver kita

Laporan user setelah install APK build run 42257787875: "Aku buka apl
mu kok isi isinya punya akweb ya" — APK menampilkan UI/login AKWeb.
Penyebab: proyek masih memasang ekstensi AKWeb (dari
`assets/akweb-extension/`, salinan zip user) lewat
`MainActivity.installExtension()` + `AkwebExtensionDelegate` +
`NativeBridgeStub`, bersamaan dengan ekstensi solver. Ekstensi AKWeb
itu yang menampilkan UI/login-nya di dalam game.

**Yang DIHAPUS total (lokal, TIDAK ada push/CI oleh subagent):**
- Folder `app/src/main/assets/akweb-extension/` beserta seluruh isinya
  (18 file: manifest.json AKWeb, isolated-bridge.js,
  readonly-game-snapshot.js, generated-*.js, ui/*.js, ui/assets/*).
- `app/src/main/java/com/akweb/browser/AkwebExtensionDelegate.kt`
  (jembatan GeckoView <-> ekstensi AKWeb).
- `app/src/main/java/com/akweb/browser/NativeBridgeStub.kt` (host
  native messaging stub `com.aimking.akweb.bridge`, balasan
  `plan_tidak_tersedia`) — tidak dipakai apa pun selain delegate AKWeb,
  jadi dihapus sekalian, bukan dipertahankan sebagai stub kosong.
- `app/src/test/java/com/akweb/browser/NativeBridgeStubTest.kt` (tes
  unit stub — ikut terhapus karena kelas yang dites sudah tidak ada;
  workflow `:app:testDebugUnitTest` kini tidak punya tes lagi, tetap
  jalan tanpa tes).

**Yang DIUBAH:**
- `MainActivity.kt` ditulis ulang tanpa jalur AKWeb: `installExtension()`
  DIHAPUS; `setupGecko()` langsung memanggil
  `installSolverExtension()`; game dibuka dari callback solver (sukses
  maupun gagal), seperti sebelumnya. Dihapus: `EXTENSION_LOCATION`,
  `extensionInstalled`, `lastNativeMessage`, `statusExtension`,
  `statusNative`, `statusPlan`, tombol "Muat ulang" kini memakai
  `solverInstalled`. Panel debug hanya menampilkan status SOLVER +
  URL + log. Header komentar + label panel diubah ("8BP Solver
  Browser"). Perbaikan subagent sebelumnya TETAP: gating panel solver
  per-frame (`ownModule()`, 2026-11-07) dan ikon obeng 🔧 pojok kiri
  bawah — tidak disentuh.
- `AndroidManifest.xml`: label aplikasi `AKWeb Browser (review)` →
  `8BP Solver Browser`.
- `README.md`: ditulis ulang — proyek solver-only, tanpa AKWeb.

**Yang TERSISA (sengaja, bukan kelalaian):**
- Nama package/namespace `com.akweb.browser`, nama proyek/branch
  `akweb-browser`, dan repo `NandSki/akweb-browser` TIDAK diganti
  namanya — ganti nama package butuh ubah namespace + applicationId +
  semua file Kotlin + workflow, dan tidak mengubah isi APK yang
  terlihat user. Label aplikasi yang tampil di HP sudah "8BP Solver
  Browser".
- `app/src/main/assets/solver/` (salinan referensi userscript v2.39)
  dan `app/src/main/assets/solver-extension/` (ekstensi solver yang
  dipakai) TIDAK diubah.
- Bagian-bagian lama STATUS.md di bawah ini masih menyebut AKWeb —
  itu catatan sejarah build 2026-10-27 s.d. 2026-11-06, bukan keadaan
  proyek sekarang.

**Verifikasi lokal (tanpa Java/Android SDK di VM):**
- `node --check` solver.js: OK (lihat bawah).
- Grep: tidak ada lagi referensi `akweb-extension`,
  `AkwebExtensionDelegate`, `NativeBridgeStub`, `plan_tidak_tersedia`,
  `com.aimking.akweb.bridge` di file kode/assets (kecuali nama package
  `com.akweb.browser` dan catatan sejarah di STATUS.md).
- Keseimbangan kurung MainActivity.kt: OK (lihat bawah).
- **TIDAK ada build yang dijalankan; TIDAK ada push ke GitHub; TIDAK
  ada workflow CI yang dijalankan.** Parent yang push + build.

**Yang belum terverifikasi / perlu dites di HP user (setelah build baru):**
1. Build remote lolos (permukaan API yang dipakai sekarang lebih
   kecil: `installBuiltIn` sekali, `FrameLayout`, `Gravity` — semuanya
   API standar).
2. Di HP: buka APK → langsung landscape fullscreen game, **TIDAK ADA
   UI/login AKWeb apa pun**, panel solver v2.39 muncul di frame game
   (garis + autoplay), ikon 🔧 di pojok kiri bawah, panel debug
   menunjukkan `SOLVER: TERPASANG (v2.39)`.


## Update 2026-11-07 — Panel solver cuma di frame game + ikon obeng 🔧

Laporan user setelah install APK build run 42257787875: (1) menu solver
muncul tapi TIDAK berfungsi (tidak ada garis/line), (2) minta triple-tap
diganti ikon obeng di pojok kiri bawah. Dua-duanya diperbaiki lokal,
TIDAK ada push/CI oleh subagent.

### 1. Panel solver HANYA di frame yang punya Module sendiri
**Diagnosis.** Content script solver jalan di SEMUA frame
(`all_frames: true`) dan `init()` v2.39 membangun panel langsung di
setiap frame — termasuk frame atas 8ballpool.com. Frame atas itu:
- tidak punya `window.Module` sendiri (game + heap ada di iframe prod),
- beda origin dengan prod (8ballpool.com vs prod-web-pool.miniclip.com)
  sehingga `findModuleWin()` lintas frame selalu gagal (SecurityError),
- panel + overlay canvas-nya menempel di dokumen frame atas dan
  MENUTUPI panel hidup di frame prod (elemen `fixed` dokumen atas
  selalu di atas konten iframe).
Hasilnya user melihat panel MATI: tombol tidak jalan, tidak ada garis.
v2.36 dulu membangun panel di semua frame dan v2.37 menghapus timer
auto-sembunyi, jadi panel mati itu tampil terus.
**Perbaikan** (`app/src/main/assets/solver-extension/solver.js` saja,
fungsi `init()`):
- `init()` sekarang menunggu `window.Module + HEAPU8` di frame SENDIRI
  dulu (fungsi baru `ownModule()`, poll max 120 detik, 1x/detik).
- Panel (`buildPanel()`, termasuk ikon 🎱 untuk buka lagi), `loadPokLearn`,
  `loadCushLearn`, `updateGroupBtn`, `updateLearnStat` baru jalan
  SETELAH Module sendiri ketemu — sekali saja (flag `_panelBuilt`).
- Instance tanpa Module diam total (cuma `console.log` sekali setelah
  120 detik), panel tidak dibangun, interval tidak start.
- `findModuleWin()` / `heapViews()` TIDAK diubah — tetap dipakai untuk
  BACA heap (frame sendiri dulu, fallback lintas frame untuk alur
  Tampermonkey). Logika inti solver (fisika/tembak/deteksi) TIDAK diubah.
- **Divergensi dari master:** perubahan ini HANYA di salinan APK.
  Master userscript v2.39 (`~/workspace/goals/8-ball-pool-autoplay/files/`,
  md5 `67eae7f57b1d09591334040f1b443669`) masih pakai `init()` lama —
  kalau re-sync dari master, gating `ownModule()` harus dibawa lagi.
  Salinan referensi `app/src/main/assets/solver/akweb-heap-solver-serius-v2.39.user.js`
  juga TIDAK diubah (bukan yang dipakai content script).
- Verifikasi: `node --check` OK; `buildPanel()` cuma dipanggil 1x
  (di dalam gate `ownModule()`); `log()`/`stat()` null-safe jadi aman
  dipanggil sebelum panel ada.

### 2. Triple-tap diganti ikon obeng 🔧 (pojok kiri bawah)
- `MainActivity.kt`: `OnTouchListener` triple-tap DIHAPUS total
  (termasuk import `SystemClock`/`MotionEvent` yang sudah tidak dipakai).
- Tombol `🔧` baru (48dp, margin 12dp, alpha 0.85, teks 20sp),
  `FrameLayout.LayoutParams` gravity `BOTTOM|START`, ditambahkan
  SETELAH `debugPanel` supaya z-order paling atas — selalu terlihat
  dan bisa di-tap, walau panel debug sedang terbuka. Tap = tampil/
  sembunyi panel debug (`toggleDebugPanel()`).
- Label panel + pesan log disesuaikan ("tap ikon 🔧 ...", bukan
  triple-tap). Tombol "Tutup panel debug" di dalam panel tetap ada.
- Verifikasi: kurung Kotlin seimbang (`{`/`}` 52/52, `(`/`)` 144/144);
  tidak ada lagi `setOnTouchListener`/`SystemClock`/`MotionEvent`.

### Verifikasi lokal (tanpa Java/Android SDK di VM)
- `solver.js`: `node --check` OK (lihat §1).
- `MainActivity.kt`: keseimbangan kurung OK (lihat §2).
- **TIDAK ada build yang dijalankan** (VM tidak punya java/gradle/
  Android SDK); TIDAK ada push ke GitHub; TIDAK ada workflow CI
  yang dijalankan. Parent yang push + build.

### Yang belum terverifikasi / perlu dites di HP user (setelah build baru)
1. Build remote lolos (API baru yang dipakai: `FrameLayout`,
   `Gravity.BOTTOM|START`, `Button` — semuanya API Android standar,
   risiko gagal kompilasi kecil).
2. Di HP: buka APK → langsung landscape fullscreen game; **panel
   solver TIDAK muncul di halaman 8ballpool.com** (frame atas diam),
   panel solver muncul di dalam frame game (prod) dengan garis +
   autoplay berfungsi.
3. Ikon 🔧 terlihat di pojok kiri bawah di atas game; tap → panel
   debug muncul; tap lagi / tombol "Tutup panel debug" → sembunyi.
   Ikon tidak mengganggu aim/tembak secara berarti (48dp di sudut).
4. Kalau panel solver tetap tidak muncul di frame game, kirim isi
   console/log: baris `[AKV2] INIT ... TIDAK ada Module di frame
   sendiri` berarti gating bekerja tapi Module tidak ketemu di frame
   prod (masalah lain); kalau tidak ada baris itu sama sekali,
   content script solver tidak jalan.

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

## Update 2026-11-08 (v2.40 — FIX scope, ROOT CAUSE menu mati)
Diagnosis (reproduksi Steel 2026-11-08): solver v2.39 (master + salinan APK)
mati total saat init() — error `Uncaught ReferenceError: updateGroupBtn is
not defined`. Penyebab: `updateGroupBtn`, `autoDetectGroup`,
`autoDetectGroupFromOpp` dideklarasi DI DALAM `buildPanel` (tutup kurungnya
baru di baris ~2343), sehingga `init()` / `clearLearned()` / `matchBaru()`
tidak bisa melihat mereka. init() mati → AKV2 undefined, interval tidak
start, tidak ada garis. Bug masuk antara v2.31→v2.35 saat init() mulai
memanggil updateGroupBtn(). Panel tetap kebangun (buildPanel jalan duluan)
dengan stat mentok "Menunggu game..." — itu gejala khasnya.
Fix v2.40: 3 fungsi dipindah keluar dari buildPanel ke level pageCode
(sebelum `function init()`). Diverifikasi live di Steel (prod-web-pool):
AKV2 object, stat "Module ketemu, heap 838860800 byte", 0 error — untuk
master v2.40 DAN salinan APK (yang tetap pakai gating ownModule).
File: solver-extension/solver.js + assets/solver/*.user.js → v2.40;
manifest solver-extension version 2.40.

## Update 2026-11-08 (v2.41 — anti pantul ngasal, match baru, anti patah-patah)
Keluhan user: in game patah2/crash, autoplay work tapi ga akurat, tembakan
langsung bisa masuk malah jadi pantul ga jelas (bikin kalah), MATCH BARU ga work.
Akar masalah (dari baca kode):
1. pickShot: fallback geometri dikasih `validated = true` (baris 1801) → kalau
   sim menolak SEMUA tembakan, autoplay tetap menembak yang geometri terbaik
   TANPA validasi. Itu sumber "pantul ga jelas bikin kalah". Sama untuk
   fallback simRusak (cands[0].validated = true).
2. matchBaru(): tidak reset cooldown deteksi 30 detik (lastAutoDetectFail) dan
   flag tunggu match lama (waitChange/autoWaiting/oppWait) → deteksi ulang
   ke-block. Sekali autoDetect gagal, user harus nunggu 30 detik.
3. refreshOverlay (tiap 3 detik, autoplay OFF): menjalankan pickShot LENGKAP
   dengan sim (3 kandidat x ~12 power x robustness = ratusan sim fisika)
   cuma untuk gambar garis display → blokir main thread → patah-patah.
Fix v2.41: (a) fallback geometri & simRusak TIDAK lagi diberi validated
(garis tetap tampil, autoplay tidak menembak tanpa validasi sim); (b) PANTUL
OFF = bank/kick tidak pernah dipertimbangkan di solveShotV2; (c) refreshOverlay
pakai geometri saja (noSim=true); (d) matchBaru reset state pemblokir + retry
autoDetect 3x (jeda 1.5 detik). Diverifikasi Steel: AKV2 object, 0 error.
File: solver-extension/solver.js + assets/solver/*.user.js → v2.41.
