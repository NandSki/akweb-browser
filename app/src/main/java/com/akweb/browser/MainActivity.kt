package com.akweb.browser

import android.app.Activity
import android.os.Bundle
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.GeckoView

/**
 * Browser GeckoView minimal + panel debug.
 *
 * TAMPILAN (ala AKWeb): fullscreen — GeckoView mengisi seluruh layar
 * dan game langsung dibuka saat APK dijalankan. Panel debug (status
 * ekstensi/solver, tombol, log) DISEMBUNYIKAN dari tampilan utama dan
 * hanya muncul lewat triple-tap di layar game (atau tombol "Tutup
 * panel debug" di dalam panel itu sendiri).
 *
 * - Membuka https://8ballpool.com/game (langsung ke halaman game,
 *   bukan halaman utama; orientasi landscape — lihat AndroidManifest).
 * - Menginstal ekstensi dari assets/akweb-extension/ (salinan verbatim
 *   dari zip yang dikirim user, BUKAN dari APK AKWeb asli).
 * - Menginstal ekstensi solver dari assets/solver-extension/ (content
 *   script solver heap v2.39) sebagai jalur TERPISAH dari ekstensi
 *   AKWeb — solver di-inject ke frame game via content script
 *   (all_frames, document_start), bukan via javascript: URL.
 * - Menampilkan di panel debug (TERSEMBUNYI, lihat atas): status
 *   ekstensi, status solver, URL yang dibuka, pesan native yang
 *   diterima, dan status plan.
 *
 * Yang TIDAK dilakukan aplikasi ini: menjalankan snapshot/tembak
 * otomatis. Tanpa plan dari host asli, ekstensi berhenti di
 * handshake plan — panel inilah yang membuktikannya di lapangan.
 */
class MainActivity : Activity() {

    companion object {
        const val GAME_URL = "https://8ballpool.com/game"
        const val EXTENSION_LOCATION = "resource://android/assets/akweb-extension/"
        // Ekstensi solver (jalur terpisah dari AKWeb): content script
        // solver heap v2.39, diinstal built-in dari assets.
        const val SOLVER_EXTENSION_LOCATION = "resource://android/assets/solver-extension/"
        const val SOLVER_VERSION = "v2.39"
    }

    private lateinit var statusExtension: TextView
    private lateinit var statusSolver: TextView
    private lateinit var statusUrl: TextView
    private lateinit var statusNative: TextView
    private lateinit var statusPlan: TextView
    private lateinit var logView: TextView
    private lateinit var geckoView: GeckoView
    private lateinit var debugPanel: LinearLayout

    private var runtime: GeckoRuntime? = null
    private var session: GeckoSession? = null
    private var extensionInstalled = false
    private var solverInstalled = false
    private var lastNativeMessage = "belum ada"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // FULLSCREEN ala AKWeb: GeckoView mengisi seluruh layar, game
        // langsung kebuka saat APK dijalankan. Panel debug TIDAK terlihat
        // di tampilan utama — disembunyikan (GONE) dan hanya muncul lewat
        // triple-tap di layar game (atau tombol "Tutup panel debug" di
        // dalam panel itu sendiri).
        val root = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        geckoView = GeckoView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        root.addView(geckoView)

        fun label(text: String): TextView {
            return TextView(this).apply {
                this.text = text
                textSize = 16f
            }
        }

        debugPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
            setBackgroundColor(0xEEFFFFFF.toInt())
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        debugPanel.addView(label("AKWeb Browser (review) — GeckoView + ekstensi AKWeb + solver v2.39"))
        debugPanel.addView(label("BUKAN APK jadi. Proyek siap review; belum pernah di-build."))
        debugPanel.addView(label("Panel debug tersembunyi — triple-tap layar game untuk tampil/sembunyi."))

        statusExtension = label("EKSTENSI: belum dipasang")
        statusSolver = label("SOLVER: belum dipasang")
        statusUrl = label("URL: -")
        statusNative = label("NATIVE: belum ada pesan")
        statusPlan = label("PLAN: " + NativeBridgeStub.PLAN_STATUS + " (host stub)")
        debugPanel.addView(statusExtension)
        debugPanel.addView(statusSolver)
        debugPanel.addView(statusUrl)
        debugPanel.addView(statusNative)
        debugPanel.addView(statusPlan)

        val btnOpen = Button(this).apply {
            text = "Buka 8ballpool.com/game"
            setOnClickListener { openGame() }
        }
        val btnReload = Button(this).apply {
            text = "Muat ulang"
            setOnClickListener {
                // Kalau ekstensi belum terpasang, tombol ini mencoba pasang
                // ulang (sukses = game langsung dibuka dari callback install).
                if (extensionInstalled) session?.reload()
                else runtime?.let { installExtension(it) }
            }
        }
        val btnReinjectSolver = Button(this).apply {
            text = "Muat ulang (re-inject solver)"
            setOnClickListener {
                // Content script solver disuntikkan ulang setiap kali
                // halaman dimuat ulang; tombol ini jalan pintas debug
                // kalau panel solver tidak muncul setelah navigasi.
                DebugLog.append("SOLVER: muat ulang halaman (re-inject solver)")
                session?.reload()
            }
        }
        val btnHidePanel = Button(this).apply {
            text = "Tutup panel debug"
            setOnClickListener { toggleDebugPanel() }
        }
        debugPanel.addView(btnOpen)
        debugPanel.addView(btnReload)
        debugPanel.addView(btnReinjectSolver)
        debugPanel.addView(btnHidePanel)

        logView = TextView(this).apply {
            textSize = 13f
            typeface = android.graphics.Typeface.MONOSPACE
        }
        val logHeightPx = (400 * resources.displayMetrics.density).toInt()
        val scroll = ScrollView(this).apply {
            addView(logView)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                logHeightPx
            )
        }
        debugPanel.addView(scroll)

        root.addView(debugPanel)

        // Triple-tap di layar game = tampil/sembunyi panel debug.
        // Listener mengembalikan false supaya sentuhan tetap diteruskan
        // ke game (tidak mengganggu aim/tembak).
        var tapCount = 0
        var lastTapMs = 0L
        geckoView.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_UP) {
                val now = SystemClock.uptimeMillis()
                tapCount = if (now - lastTapMs < 600) tapCount + 1 else 1
                lastTapMs = now
                if (tapCount >= 3) {
                    tapCount = 0
                    toggleDebugPanel()
                }
            }
            false
        }

        setContentView(root)

        DebugLog.listener = { text ->
            runOnUiThread {
                logView.text = text
                statusNative.text = "NATIVE: $lastNativeMessage"
            }
        }

        setupGecko()
    }

    private fun toggleDebugPanel() {
        val shown = debugPanel.visibility != View.VISIBLE
        debugPanel.visibility = if (shown) View.VISIBLE else View.GONE
        DebugLog.append("PANEL DEBUG: " + if (shown) "ditampilkan (triple-tap lagi / tombol Tutup untuk sembunyi)" else "disembunyikan")
    }

    private fun setupGecko() {
        try {
            val rt = GeckoRuntime.create(this)
            runtime = rt
            val sess = GeckoSession()
            session = sess
            // Mode desktop wajib: tanpa ini GeckoView memakai UA mobile dan
            // situs game tidak jalan sebagai versi desktop. Set sebelum open.
            sess.settings.userAgentMode = GeckoSessionSettings.USER_AGENT_MODE_DESKTOP
            sess.settings.viewportMode = GeckoSessionSettings.VIEWPORT_MODE_DESKTOP
            // Sengaja TIDAK memakai NavigationDelegate di versi review ini:
            // signature onLocationChange berubah antar versi GeckoView,
            // dan status URL di panel cukup diisi dari URL yang dibuka
            // (openGame). Navigasi internal game (iframe prod) tetap
            // terlihat lewat pesan native ekstensi di log.
            geckoView.setSession(sess)
            sess.open(rt)
            DebugLog.append("GECKO: runtime + session siap")
            // BUGFIX 2026-10-29: game JANGAN dibuka di sini. Dulu openGame()
            // dipanggil langsung setelah installExtension(), padahal install
            // itu async — halaman game keburu dimuat sebelum ekstensi siap,
            // sehingga content script (run_at document_start) tidak sempat
            // disuntikkan ke halaman pertama dan ekstensi terlihat "tidak
            // muncul". Sekarang game dibuka dari callback install (sukses
            // maupun gagal), jadi urutannya pasti: ekstensi dulu, game belakangan.
            installExtension(rt)
        } catch (e: Exception) {
            DebugLog.append("GECKO GAGAL: ${e.message}")
            runOnUiThread {
                statusExtension.text = "EKSTENSI: gagal (Gecko error: ${e.message})"
            }
        }
    }

    private fun installExtension(rt: GeckoRuntime) {
        DebugLog.append("EKSTENSI: memasang dari $EXTENSION_LOCATION")
        rt.webExtensionController.installBuiltIn(EXTENSION_LOCATION).accept(
            { extension ->
                extension?.setMessageDelegate(
                    AkwebExtensionDelegate { name ->
                        lastNativeMessage = name
                    },
                    NativeBridgeStub.NATIVE_APP
                )
                extensionInstalled = true
                DebugLog.append("EKSTENSI: terpasang (id dari manifest gecko)")
                runOnUiThread {
                    statusExtension.text = "EKSTENSI: TERPASANG"
                }
                // Lanjut pasang ekstensi solver DULU, baru buka game:
                // content script solver harus terdaftar sebelum halaman
                // pertama dimuat, sama seperti content script AKWeb.
                installSolverExtension(rt)
            },
            { error ->
                DebugLog.append("EKSTENSI GAGAL: ${error?.message}")
                runOnUiThread {
                    statusExtension.text = "EKSTENSI: GAGAL (${error?.message})"
                }
                // Tetap lanjut ke solver + game supaya panel dan halaman
                // terlihat, dan status GAGAL di atas jadi bukti install
                // yang gagal.
                installSolverExtension(rt)
            }
        )
    }

    /**
     * Pasang ekstensi solver (jalur TERPISAH dari ekstensi AKWeb).
     *
     * Isi: satu content script (solver.js, = solver heap v2.39 tanpa
     * blok metadata userscript) dengan matches = origin game,
     * all_frames = true, run_at = document_start. Cara inject ini
     * dipilih karena:
     * - GeckoView TIDAK punya API publik evaluateJS/evaluateJavascript
     *   di GeckoSession (tidak seperti WebView.evaluateJavascript),
     *   dan loadUri("javascript:...") tidak disarankan / tidak bisa
     *   diandalkan untuk file 228 KB di semua frame.
     * - Content script WebExtension adalah cara resmi GeckoView untuk
     *   menyuntikkan JS ke halaman + iframe — persis cara content
     *   script AKWeb (readonly-game-snapshot.js) disuntikkan ke frame
     *   prod-web-pool. Solver sendiri juga sudah dirancang untuk pola
     *   ini: @run-at document-start + inject() script-tag ke page
     *   context, dan init() menunggu Module sampai 120 detik.
     * - Urutan install: AKWeb dulu, solver kedua, game dibuka dari
     *   callback solver (sukses maupun gagal), supaya kedua content
     *   script terdaftar sebelum halaman pertama dimuat.
     */
    private fun installSolverExtension(rt: GeckoRuntime) {
        DebugLog.append("SOLVER: memasang dari $SOLVER_EXTENSION_LOCATION ($SOLVER_VERSION)")
        rt.webExtensionController.installBuiltIn(SOLVER_EXTENSION_LOCATION).accept(
            {
                solverInstalled = true
                DebugLog.append("SOLVER: terpasang ($SOLVER_VERSION, content script document_start, all_frames)")
                runOnUiThread {
                    statusSolver.text = "SOLVER: TERPASANG ($SOLVER_VERSION)"
                }
                // Baru sekarang buka game: kedua ekstensi sudah siap,
                // content script pasti ikut di halaman pertama.
                openGame()
            },
            { error ->
                DebugLog.append("SOLVER GAGAL: ${error?.message}")
                runOnUiThread {
                    statusSolver.text = "SOLVER: GAGAL (${error?.message})"
                }
                // Tetap buka game supaya panel + halaman terlihat, dan
                // status GAGAL di atas jadi bukti install yang gagal.
                openGame()
            }
        )
    }

    private fun openGame() {
        val sess = session
        if (sess == null) {
            DebugLog.append("NAV: session belum siap, tidak bisa membuka game")
            return
        }
        DebugLog.append("NAV: membuka $GAME_URL")
        runOnUiThread {
            statusUrl.text = "URL: $GAME_URL"
        }
        sess.loadUri(GAME_URL)
    }

    override fun onDestroy() {
        try {
            session?.close()
        } catch (ignored: Exception) {
            // Tutup session best-effort; tidak ada aksi lanjutan.
        }
        super.onDestroy()
    }
}
