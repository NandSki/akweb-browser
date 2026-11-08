package com.akweb.browser

import org.json.JSONArray
import org.json.JSONObject
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.WebExtension

/**
 * PoC-3 — Native bridge JSON (tanpa .so).
 *
 * Jalur: extension (background script bridge.js) --browser.runtime.connectNative-->
 * MessageDelegate.onConnect (port) --PortDelegate.onPortMessage--> Kotlin,
 * balik via port.postMessage(JSONObject).
 *
 * Protokol (meniru kontrak AKWeb, disederhanakan untuk solver kita):
 * - Pesan extension -> native: {protocol, schema, operation, sequence,
 *   requestId, documentEpoch, extensionRevision, ...field operasi}
 * - Ack native -> extension: TEPAT 10 field (accepted, channelGeneration,
 *   channelId, detail, documentEpoch, extensionRevision, operation,
 *   protocol, requestId, schema) — atau 11 field bila membawa `data`
 *   (game.snapshot.plan.ack). Satu field meleset = extension menutup port.
 * - nativeApp string: "com.nandskie.solver.bridge" (bebas, ditentukan di
 *   setMessageDelegate; harus sama dengan yang dipakai connectNative).
 *
 * Method record + offset di bawah ini hasil verifikasi runtime di game
 * LIVE (wasm_guest_1.0.0_73372, Steel, 2026-11-08): dikirim ke extension
 * lewat `data` di game.snapshot.plan.ack, supaya extension tidak hardcode
 * angka. Semua angka terverifikasi empiris — getBallByNumber 16/16 bola,
 * jalur tembak AKWeb (setter -> takeShot GM) terbukti menembak ke arah
 * tepat (error 0,0002 deg), read-back aim via f64[visualGuide+24].
 * Detail: ~/workspace/goals/8-ball-pool-autoplay/files/
 *   tiru-akweb-poc-live-akweb-path.md (§5.1),
 *   tiru-akweb-poc-live-calib.md (§6),
 *   tiru-akweb-table-pocket.md (§6),
 *   tiru-akweb-angle-mapping.md (§8).
 * JANGAN pakai takeShot:angle:spin: (slot 24384) sebagai API tembak —
 * tidak dipakai AKWeb, hanya menembak 2/5 sesi kalibrasi, arah salah.
 *
 * Untuk PoC-3, plan yang dikembalikan masih trivial (echo + "no shot"):
 * tujuannya membuktikan pipa JSON jalan dua arah. Perencana tembakan
 * (PoolSim) di Kotlin adalah langkah berikutnya, bukan PoC-3.
 */
class BridgeDelegate(
    private val onBridgeEvent: (String) -> Unit = {}
) : WebExtension.MessageDelegate, WebExtension.PortDelegate {

    companion object {
        const val NATIVE_APP = "com.nandskie.solver.bridge"
        const val PROTOCOL = "nandskie-solver-bridge"
        const val SCHEMA = 1
        const val EXTENSION_REVISION = "poc3"
    }

    @Volatile
    private var port: WebExtension.Port? = null

    @Volatile
    private var channelId: Long = 0

    @Volatile
    private var channelGeneration: Long = 0

    // ---- WebExtension.MessageDelegate ----

    override fun onConnect(port: WebExtension.Port) {
        this.port = port
        port.setDelegate(this)
        onBridgeEvent("BRIDGE: port terhubung (connectNative)")
        DebugLog.append("BRIDGE: port terhubung (connectNative)")
    }

    // One-off sendNativeMessage (bila extension memakai itu, bukan port).
    // Kembalikan ack JSON sebagai GeckoResult.
    override fun onMessage(
        nativeApp: String,
        message: Any,
        sender: WebExtension.MessageSender
    ): GeckoResult<Any>? {
        val json = message as? JSONObject ?: return null
        val ack = handleMessage(json)
        return if (ack != null) GeckoResult.fromValue<Any>(ack) else null
    }

    // ---- WebExtension.PortDelegate ----

    override fun onPortMessage(message: Any, port: WebExtension.Port) {
        val json = message as? JSONObject ?: return
        val ack = handleMessage(json) ?: return
        try {
            port.postMessage(ack)
        } catch (e: Exception) {
            onBridgeEvent("BRIDGE: gagal kirim ack (${e.message})")
            DebugLog.append("BRIDGE: gagal kirim ack (${e.message})")
        }
    }

    override fun onDisconnect(port: WebExtension.Port) {
        if (this.port === port) {
            this.port = null
        }
        onBridgeEvent("BRIDGE: port terputus")
        DebugLog.append("BRIDGE: port terputus")
    }

    // ---- Penanganan pesan ----

    private fun handleMessage(json: JSONObject): JSONObject? {
        val operation = json.optString("operation", "")
        val requestId = json.optString("requestId", "")
        val documentEpoch = json.optString("documentEpoch", "")
        val sequence = json.optLong("sequence", 0)
        if (operation.isEmpty()) return null

        // Simpan channel dari hello pertama (bila extension mengirimnya).
        if (operation == "bridge.hello") {
            channelId = System.currentTimeMillis() and 0x7FFFFFFF
            channelGeneration = 1
        }

        val detail = when (operation) {
            "bridge.hello" -> "hello-ok"
            "bridge.capability" -> "capability-ok"
            "build.observe" -> "contract-supported"
            "game.snapshot.plan" -> "plan-ready"
            "game.snapshot.submit" -> "snapshot-ready"
            "automation.plan.submit" -> "plan-accepted"
            else -> "ok"
        }
        val logLine = "BRIDGE: <$operation> seq=$sequence req=$requestId"
        onBridgeEvent(logLine)
        DebugLog.append(logLine)

        val ack = buildAck(
            operation = "$operation.ack",
            requestId = requestId,
            documentEpoch = documentEpoch,
            detail = detail,
            accepted = true
        )
        if (operation == "game.snapshot.plan") {
            ack.put("data", buildPlanData())
        }
        if (operation == "game.snapshot.submit") {
            // PoC-3: plan trivial — echo bahwa snapshot diterima.
            // Perencana sesungguhnya (PoolSim) menyusul.
            ack.put("data", buildEchoPlan(json))
        }
        return ack
    }

    private fun buildAck(
        operation: String,
        requestId: String,
        documentEpoch: String,
        detail: String,
        accepted: Boolean
    ): JSONObject {
        // Urutan key tidak penting (JSON object), tapi JUMLAH field harus
        // tepat 10 (atau 11 dengan `data`) — kontrak AKWeb.
        return JSONObject().apply {
            put("accepted", accepted)
            put("channelGeneration", channelGeneration)
            put("channelId", channelId)
            put("detail", detail)
            put("documentEpoch", documentEpoch)
            put("extensionRevision", EXTENSION_REVISION)
            put("operation", operation)
            put("protocol", PROTOCOL)
            put("requestId", requestId)
            put("schema", SCHEMA)
        }
    }

    /**
     * Data plan LIVE (wasm_guest_1.0.0_73372) — terverifikasi runtime.
     * Extension memvalidasi lalu memakai angka ini untuk snapshot + dynCall.
     * Aturan pakai: pakai GETTER, bukan offset GM langsung (offset runtime
     * bergeser +644 sistematis dari nilai statis; getter membaca sel offset
     * runtime sehingga otomatis benar). Commit tembakan HANYA bila
     * isPlayerTurn==1 dan gameStateID di {4,7} (lihat "shot.shootGate").
     */
    private fun buildPlanData(): JSONObject {
        val methods = JSONObject().apply {
            // --- Snapshot bola (receiver: table) ---
            put("getBallByNumber", methodRecord(34759, 7653857, 24373, "dynCall_iiii", "table"))
            put("getNumBallsOnTable", methodRecord(34757, 7653896, 24375, "dynCall_iii", "table"))
            put("getCueBall", methodRecord(34761, 7653832, 24371, "dynCall_iii", "table"))
            put("getObjectBall", methodRecord(34760, 7653843, 24372, "dynCall_iii", "table"))
            // --- Geometri meja (receiver: table) ---
            put("tableProperties", methodRecord(34684, 7614052, 24441, "dynCall_iii", "table"))
            put("tableShape", methodRecord(34682, 7614474, 24443, "dynCall_viii", "table", "sret-first, outPtr 12B header -> 46 titik {x,y} f64"))
            put("tableBounds", methodRecord(34678, 7614957, 24447, "dynCall_viii", "table", "sret-first, outPtr 32B -> [origin.x, origin.y, width, height]"))
            put("getActiveCushions", methodRecord(34764, 7653786, 24368, "dynCall_iii", "table"))
            put("isBallOverlappingAnyPocket", methodRecord(34754, 7654103, 24378, "dynCall_iiiii", "table", "(table, sel, ballPtr, pointPtr 16B) -> 0/1"))
            // --- Getter GameManager (receiver: gameManager, dynCall iii) ---
            put("getTable", methodRecord(52429, 2401326, 7992, "dynCall_iii", "gameManager"))
            put("gameStateID", methodRecord(10769, 2401297, 7980, "dynCall_iii", "gameManager"))
            put("isPlayerTurn", methodRecord(10752, 2397653, 7892, "dynCall_iii", "gameManager", "1 = giliran kita (GATE tembakan)"))
            put("visualCue", methodRecord(52406, 2367669, 8016, "dynCall_iii", "gameManager"))
            put("visualEnglishControl", methodRecord(52405, 2367754, 8017, "dynCall_iii", "gameManager"))
            put("visualCueBallControl", methodRecord(52404, 2367850, 8018, "dynCall_iii", "gameManager"))
            put("gameHUD", methodRecord(52403, 2371349, 8019, "dynCall_iii", "gameManager"))
            put("player", methodRecord(52398, 2371687, 8024, "dynCall_iii", "gameManager"))
            put("opponent", methodRecord(52397, 2371735, 8025, "dynCall_iii", "gameManager"))
            put("gameMode", methodRecord(52400, 2371559, 8022, "dynCall_iii", "gameManager"))
            put("tierID", methodRecord(52401, 2371448, 8021, "dynCall_iii", "gameManager"))
            // --- Scene via MainManager getter (JANGAN pakai mem32[148284], nilainya 0) ---
            put("scene", methodRecord(50969, 3021810, 9486, "dynCall_iii", "mainManager"))
            // --- Cue (receiver: visualCue) ---
            put("setAimAngle", methodRecord(32229, 8402899, 26469, "dynCall_viii", "visualCue", "arg3 = ptr 8B double (radian)"))
            put("setPower", methodRecord(32228, 8402950, 26470, "dynCall_viii", "visualCue", "arg3 = ptr 8B double (rasio 0..1)"))
            put("setEnglish", methodRecord(32030, 8426434, 26631, "dynCall_viii", "visualEnglishControl", "arg3 = ptr 16B (2x double x,y)"))
            put("visualGuide", methodRecord(32173, 8402830, 26519, "dynCall_iii", "visualCue", "-> guide ptr; aim = f64[guide+24]"))
            put("aimAngle", methodRecord(32230, 8402869, 26468, "dynCall_viii", "visualCue", "sret-first: (slot, outPtr, receiver, sel)"))
            put("power", methodRecord(32172, 8402944, 26520, "dynCall_viii", "visualCue", "sret-first: (slot, outPtr, receiver, sel)"))
            put("killAnimation", methodRecord(32215, 8408391, 26483, "dynCall_vii", "visualCue"))
            put("isAnimatingAimAngle", methodRecord(32222, 8408255, 26476, "dynCall_iii", "visualCue"))
            put("inputActive", methodRecord(32168, 8403095, 26524, "dynCall_iii", "visualCue"))
            put("powerMode", methodRecord(32110, 8407517, 26578, "dynCall_iii", "visualCue"))
            // --- English (receiver: visualEnglishControl) ---
            put("getEnglishTarget", methodRecord(32024, 8427033, 26637, "dynCall_viii", "visualEnglishControl", "sret-first: (slot, outPtr, receiver, sel), outPtr 16B -> (x,y)"))
            // --- Commit tembakan (receiver: gameManager) ---
            put("takeShot", methodRecord(52476, 2400642, 7945, "dynCall_vii", "gameManager"))
        }
        val offsets = JSONObject().apply {
            // Singleton: indeks mem32 (bukan alamat byte).
            put("gameManagerSingleton", 110220)
            put("mainManagerSingleton", 148276)
            // Field bola (offset byte dari object pointer bola).
            put("ballNumber", 124)
            put("ballPosition", 32)
            put("ballVelocity", 48)
            put("ballRadius", 80)
            put("ballRadiusValue", 3.800475)
            put("ballType", 116)
            put("ballState", 120)
            // Offset GameManager RUNTIME (info saja — pakai getter, bukan ini).
            // Semua = nilai statis +644 (ivar sliding runtime ObjC).
            put("gameManagerTableRuntime", 656)
            put("gameManagerCueRuntime", 680)
            put("gameManagerEnglishRuntime", 684)
            put("gameManagerCueBallRuntime", 688)
            put("gameManagerGameHUDRuntime", 696)
            put("gameManagerPlayerRuntime", 720)
            put("gameManagerOpponentRuntime", 724)
            put("gameManagerTierIDRuntime", 868)
            // Read-back power/english (offset runtime, nilai presisi-float).
            put("cuePower", 640)
            put("englishValueX", 664)
            put("englishValueY", 672)
            // Read-back aim.
            put("visualGuideAimAngleOffset", 24)
            // TableProperties (dari pointer hasil getter tableProperties).
            put("tablePropertiesPockets", 52)
            put("tablePropertiesPocketInset", 64)
        }
        val pockets = JSONObject().apply {
            // Urutan vektor: BL, BM, BR, TR, TM, TL.
            put("centers", JSONArray().apply {
                put(point(-130.8, -67.3))
                put(point(0.0, -72.0))
                put(point(130.8, -67.3))
                put(point(130.8, 67.3))
                put(point(0.0, 72.0))
                put(point(-130.8, 67.3))
            })
            put("inset", JSONArray().apply {
                put(point(-125.14, -61.64))
                put(point(0.0, -64.0))
                put(point(125.14, -61.64))
                put(point(125.14, 61.64))
                put(point(0.0, 64.0))
                put(point(-125.14, 61.64))
            })
            put("radius", 8.0)
            put("overlapRadius", 11.800475)
        }
        val table = JSONObject().apply {
            put("boundsOrigin", point(-127.0, -63.5))
            put("boundsSize", point(254.0, 127.0))
            put("shapePointCount", 46)
        }
        val shot = JSONObject().apply {
            put("angleFormula", "angle_aim = atan2(G.y - cue.y, G.x - cue.x) mod 2pi; G = target - 2R * dir(target->pocket), R = 3.800475")
            put("path", JSONArray().apply {
                put("killAnimation")
                put("zero-power (setPower 0)")
                put("setAimAngle")
                put("setPower")
                put("setEnglish")
                put("verify f64[guide+24] == angle_aim (re-set if mismatch)")
                put("commit takeShot GM")
            })
            put("shootGate", "isPlayerTurn==1 AND gameStateID in {4,7} AND inputActive==1 AND powerMode==0 AND isAnimatingAimAngle==0")
            put("gameState", JSONObject().apply {
                put("1", "loading/popup")
                put("4", "rack/menunggu")
                put("5", "resolving")
                put("6", "transisi")
                put("7", "aiming")
                put("8", "bola bergerak")
                put("9", "tutorial")
            })
        }
        val doNotUse = JSONArray().apply {
            put("takeShot:angle:spin: (slot 24384) sebagai API tembak")
            put("takeShot:aimStats:spinStats: (slot 7946)")
            put("offset GM statis (table +12, cue +36, dst.)")
            put("mem32[148284] sebagai Scene (selalu 0)")
            put("getPositionForPocket: (slot 24418) untuk fisika (koordinat visual saja)")
        }
        return JSONObject().apply {
            put("buildId", "wasm_guest_1.0.0_73372")
            put("methods", methods)
            put("offsets", offsets)
            put("pockets", pockets)
            put("table", table)
            put("shot", shot)
            put("doNotUse", doNotUse)
        }
    }

    private fun point(x: Double, y: Double): JSONArray {
        return JSONArray().apply {
            put(x)
            put(y)
        }
    }

    private fun methodRecord(
        functionIndex: Int,
        selectorAddress: Int,
        wasmTableIndex: Int,
        dynCallExport: String,
        receiver: String = "",
        args: String = ""
    ): JSONObject {
        return JSONObject().apply {
            put("functionIndex", functionIndex)
            put("selectorAddress", selectorAddress)
            put("wasmTableIndex", wasmTableIndex)
            put("dynCallExport", dynCallExport)
            if (receiver.isNotEmpty()) put("receiver", receiver)
            if (args.isNotEmpty()) put("args", args)
        }
    }

    private fun buildEchoPlan(snapshotMsg: JSONObject): JSONObject {
        val balls = snapshotMsg.optJSONArray("balls") ?: JSONArray()
        return JSONObject().apply {
            put("planId", "poc3-echo")
            put("ballsSeen", balls.length())
            put("shot", JSONObject.NULL)
            put("note", "PoC-3 echo: snapshot diterima, perencana belum diimplementasi")
        }
    }
}
