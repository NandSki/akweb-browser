package com.akweb.browser

import android.app.Activity
import android.os.Bundle
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
 * Browser GeckoView minimal + panel debug — HANYA solver kita.
 *
 * TAMPILAN: fullscreen — GeckoView mengisi seluruh layar dan game
 * langsung dibuka saat APK dijalankan. Panel debug (status solver,
 * tombol, log) DISEMBUNYIKAN dari tampilan utama dan hanya muncul
 * lewat ikon obeng 🔧 di pojok kiri bawah layar (atau tombol
 * "Tutup panel debug" di dalam panel itu sendiri).
 *
 * - Membuka https://8ballpool.com/game (langsung ke halaman game,
 *   bukan halaman utama; orientasi landscape — lihat AndroidManifest).
 * - Menginstal HANYA ekstensi solver dari assets/solver-extension/
 *   (content script solver heap v2.60) — solver di-inject ke frame
 *   game via content script (all_frames, document_start), bukan via
 *   javascript: URL.
 * - TIDAK ADA ekstensi AKWeb di aplikasi ini (dihapus 2026-11-07
 *   atas permintaan user: APK sebelumnya menampilkan UI/login AKWeb).
 *   Tidak ada native bridge, tidak ada plan, tidak ada login AKWeb.
 * - Menampilkan di panel debug (TERSEMBUNYI, lihat atas): status
 *   solver, URL yang dibuka, dan log.
 */
class MainActivity : Activity() {

    companion object {
        const val GAME_URL = "https://8ballpool.com/game"
        // Ekstensi solver: content script solver heap v2.60, diinstal
        // built-in dari assets.
        const val SOLVER_EXTENSION_LOCATION = "resource://android/assets/solver-extension/"
        const val SOLVER_VERSION = "v2.60"
    }

    private lateinit var statusSolver: TextView
    private lateinit var statusUrl: TextView
    private lateinit var logView: TextView
    private lateinit var geckoView: GeckoView
    private lateinit var debugPanel: LinearLayout

    private var runtime: GeckoRuntime? = null
    private var session: GeckoSession? = null
    private var solverInstalled = false
    // PoC-3: bridge JSON (tanpa .so). Satu delegate untuk satu ekstensi.
    private var bridgeDelegate: BridgeDelegate? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // FULLSCREEN: GeckoView mengisi seluruh layar, game langsung
        // kebuka saat APK dijalankan. Panel debug TIDAK terlihat di
        // tampilan utama — disembunyikan (GONE) dan hanya muncul lewat
        // ikon obeng 🔧 di pojok kiri bawah (atau tombol "Tutup panel
        // debug" di dalam panel itu sendiri).
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

        debugPanel.addView(label("8BP Solver Browser — GeckoView + solver v2.60"))
        debugPanel.addView(label("Panel debug tersembunyi — tap ikon 🔧 di pojok kiri bawah untuk tampil/sembunyi."))

        statusSolver = label("SOLVER: belum dipasang")
        statusUrl = label("URL: -")
        debugPanel.addView(statusSolver)
        debugPanel.addView(statusUrl)

        val btnOpen = Button(this).apply {
            text = "Buka 8ballpool.com/game"
            setOnClickListener { openGame() }
        }
        val btnReload = Button(this).apply {
            text = "Muat ulang"
            setOnClickListener {
                // Kalau solver belum terpasang, tombol ini mencoba
                // pasang ulang (sukses = game langsung dibuka dari
                // callback install).
                if (solverInstalled) session?.reload()
                else runtime?.let { installSolverExtension(it) }
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

        // Ikon obeng 🔧 di pojok kiri bawah — selalu terlihat di atas
        // GeckoView (dan di atas panel debug), tap = tampil/sembunyi
        // panel debug. Ukuran 48dp, margin 12dp, alpha 0.85 supaya
        // tidak terlalu menutupi game. DITAMBAHKAN SETELAH debugPanel
        // supaya z-order-nya paling atas.
        val wrenchSizePx = (48 * resources.displayMetrics.density).toInt()
        val wrenchMarginPx = (12 * resources.displayMetrics.density).toInt()
        val wrenchBtn = Button(this).apply {
            text = "🔧"
            textSize = 20f
            alpha = 0.85f
            layoutParams = FrameLayout.LayoutParams(wrenchSizePx, wrenchSizePx).apply {
                gravity = android.view.Gravity.BOTTOM or android.view.Gravity.START
                setMargins(wrenchMarginPx, wrenchMarginPx, wrenchMarginPx, wrenchMarginPx)
            }
            setOnClickListener { toggleDebugPanel() }
        }
        root.addView(wrenchBtn)

        setContentView(root)

        DebugLog.listener = { text ->
            runOnUiThread {
                logView.text = text
            }
        }

        setupGecko()
    }

    private fun toggleDebugPanel() {
        val shown = debugPanel.visibility != View.VISIBLE
        debugPanel.visibility = if (shown) View.VISIBLE else View.GONE
        DebugLog.append("PANEL DEBUG: " + if (shown) "ditampilkan (tap 🔧 / tombol Tutup untuk sembunyi)" else "disembunyikan")
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
            // Sengaja TIDAK memakai NavigationDelegate di versi ini:
            // signature onLocationChange berubah antar versi GeckoView,
            // dan status URL di panel cukup diisi dari URL yang dibuka
            // (openGame).
            geckoView.setSession(sess)
            sess.open(rt)
            DebugLog.append("GECKO: runtime + session siap")
            // BUGFIX 2026-10-29: game JANGAN dibuka di sini. Dulu openGame()
            // dipanggil langsung setelah install extension, padahal install
            // itu async — halaman game keburu dimuat sebelum ekstensi siap,
            // sehingga content script (run_at document_start) tidak sempat
            // disuntikkan ke halaman pertama dan solver terlihat "tidak
            // muncul". Sekarang game dibuka dari callback install (sukses
            // maupun gagal), jadi urutannya pasti: solver dulu, game belakangan.
            installSolverExtension(rt)
        } catch (e: Exception) {
            DebugLog.append("GECKO GAGAL: ${e.message}")
            runOnUiThread {
                statusSolver.text = "SOLVER: gagal (Gecko error: ${e.message})"
            }
        }
    }

    /**
     * Pasang ekstensi solver (SATU-SATUNYA ekstensi di aplikasi ini).
     *
     * Isi: satu content script (solver.js, = solver heap v2.60 tanpa
     * blok metadata userscript, dengan gating ownModule() 2026-11-07
     * supaya panel hanya dibangun di frame game yang punya Module
     * sendiri) dengan matches = origin game, all_frames = true,
     * run_at = document_start. Cara inject ini dipilih karena:
     * - GeckoView TIDAK punya API publik evaluateJS/evaluateJavascript
     *   di GeckoSession (tidak seperti WebView.evaluateJavascript),
     *   dan loadUri("javascript:...") tidak disarankan / tidak bisa
     *   diandalkan untuk file 228 KB di semua frame.
     * - Content script WebExtension adalah cara resmi GeckoView untuk
     *   menyuntikkan JS ke halaman + iframe. Solver sendiri juga sudah
     *   dirancang untuk pola ini: @run-at document-start + inject()
     *   script-tag ke page context, dan init() menunggu Module sampai
     *   120 detik.
     * - Urutan: solver dipasang dulu, game dibuka dari callback solver
     *   (sukses maupun gagal), supaya content script terdaftar sebelum
     *   halaman pertama dimuat.
     */
    private fun installSolverExtension(rt: GeckoRuntime) {
        DebugLog.append("SOLVER: memasang dari $SOLVER_EXTENSION_LOCATION ($SOLVER_VERSION)")
        rt.webExtensionController.installBuiltIn(SOLVER_EXTENSION_LOCATION).accept(
            { extension ->
                solverInstalled = true
                DebugLog.append("SOLVER: terpasang ($SOLVER_VERSION, content script document_start, all_frames)")
                runOnUiThread {
                    statusSolver.text = "SOLVER: TERPASANG ($SOLVER_VERSION)"
                }
                // PoC-3: daftarkan bridge JSON SEBELUM game dibuka, supaya
                // pesan dari background script (yang dikirim duluan) ikut
                // antre dan diterima delegate, bukan hilang. nativeApp
                // harus sama dengan yang dipakai bridge.js connectNative.
                try {
                    val delegate = BridgeDelegate { text ->
                        DebugLog.append(text)
                    }
                    bridgeDelegate = delegate
                    // `extension` di callback accept ini nullable
                    // (WebExtension?) — compiler menolak pemanggilan
                    // langsung, jadi cek null dulu.
                    val ext = extension
                    if (ext != null) {
                        ext.setMessageDelegate(delegate, BridgeDelegate.NATIVE_APP)
                        DebugLog.append("BRIDGE: delegate terdaftar (${BridgeDelegate.NATIVE_APP})")
                    } else {
                        DebugLog.append("BRIDGE GAGAL daftar delegate: extension null")
                    }
                } catch (e: Exception) {
                    DebugLog.append("BRIDGE GAGAL daftar delegate: ${e.message}")
                }
                // Baru sekarang buka game: ekstensi sudah siap,
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
