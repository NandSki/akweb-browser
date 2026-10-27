package com.akweb.browser

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView

/**
 * Browser GeckoView minimal + panel debug.
 *
 * - Membuka https://8ballpool.com (halaman utama game; game prod
 *   sendiri dimuat dari sana ke iframe prod-web-pool.miniclip.com).
 * - Menginstal ekstensi dari assets/akweb-extension/ (salinan verbatim
 *   dari zip yang dikirim user, BUKAN dari APK AKWeb asli).
 * - Menampilkan di panel debug: status ekstensi, URL yang dibuka,
 *   pesan native yang diterima, dan status plan.
 *
 * Yang TIDAK dilakukan aplikasi ini: menjalankan snapshot/tembak
 * otomatis. Tanpa plan dari host asli, ekstensi berhenti di
 * handshake plan — panel inilah yang membuktikannya di lapangan.
 */
class MainActivity : Activity() {

    companion object {
        const val GAME_URL = "https://8ballpool.com"
        const val EXTENSION_LOCATION = "resource://android/assets/akweb-extension/"
    }

    private lateinit var statusExtension: TextView
    private lateinit var statusUrl: TextView
    private lateinit var statusNative: TextView
    private lateinit var statusPlan: TextView
    private lateinit var logView: TextView
    private lateinit var geckoView: GeckoView

    private var runtime: GeckoRuntime? = null
    private var session: GeckoSession? = null
    private var extensionInstalled = false
    private var lastNativeMessage = "belum ada"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }

        fun label(text: String): TextView {
            return TextView(this).apply {
                this.text = text
                textSize = 16f
            }
        }

        root.addView(label("AKWeb Browser (review) — GeckoView + ekstensi AKWeb"))
        root.addView(label("BUKAN APK jadi. Proyek siap review; belum pernah di-build."))

        statusExtension = label("EKSTENSI: belum dipasang")
        statusUrl = label("URL: -")
        statusNative = label("NATIVE: belum ada pesan")
        statusPlan = label("PLAN: " + NativeBridgeStub.PLAN_STATUS + " (host stub)")
        root.addView(statusExtension)
        root.addView(statusUrl)
        root.addView(statusNative)
        root.addView(statusPlan)

        val btnOpen = Button(this).apply {
            text = "Buka 8ballpool.com"
            setOnClickListener { openGame() }
        }
        val btnReload = Button(this).apply {
            text = "Muat ulang"
            setOnClickListener { session?.reload() }
        }
        root.addView(btnOpen)
        root.addView(btnReload)

        logView = TextView(this).apply {
            textSize = 13f
            typeface = android.graphics.Typeface.MONOSPACE
        }
        val scroll = ScrollView(this).apply {
            addView(logView)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                0.4f
            )
        }
        root.addView(scroll)

        geckoView = GeckoView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                0.6f
            )
        }
        root.addView(geckoView)

        setContentView(root)

        DebugLog.listener = { text ->
            runOnUiThread {
                logView.text = text
                statusNative.text = "NATIVE: $lastNativeMessage"
            }
        }

        setupGecko()
    }

    private fun setupGecko() {
        try {
            val rt = GeckoRuntime.create(this)
            runtime = rt
            val sess = GeckoSession()
            session = sess
            // Sengaja TIDAK memakai NavigationDelegate di versi review ini:
            // signature onLocationChange berubah antar versi GeckoView,
            // dan status URL di panel cukup diisi dari URL yang dibuka
            // (openGame). Navigasi internal game (iframe prod) tetap
            // terlihat lewat pesan native ekstensi di log.
            geckoView.setSession(sess)
            sess.open(rt)
            DebugLog.append("GECKO: runtime + session siap")
            installExtension(rt)
            openGame()
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
                extension.setMessageDelegate(
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
            },
            { error ->
                DebugLog.append("EKSTENSI GAGAL: ${error?.message}")
                runOnUiThread {
                    statusExtension.text = "EKSTENSI: GAGAL (${error?.message})"
                }
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
