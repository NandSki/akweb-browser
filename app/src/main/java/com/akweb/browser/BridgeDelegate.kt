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
 * Method record + offset di bawah ini hasil PoC-1/PoC-2 (diturunkan dari
 * game.wasm 4.4.3_8602f, bukan dari AKWeb): dikirim ke extension lewat
 * `data` di game.snapshot.plan.ack, supaya extension tidak hardcode angka.
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
     * Data plan: method record + offset (PoC-1/PoC-2) untuk game 4.4.3.
     * Extension memvalidasi lalu memakai angka ini untuk snapshot + dynCall.
     */
    private fun buildPlanData(): JSONObject {
        val methods = JSONObject().apply {
            put("isRacked", methodRecord(19564, 1835203, 5195, "dynCall_iii"))
            put("setAimAngle", methodRecord(40031, 14546803, 45300, "dynCall_viid"))
            put("setPower", methodRecord(40028, 14546854, 45301, "dynCall_viid"))
            put("setEnglish", methodRecord(39831, 14570286, 45462, "dynCall_viidd"))
            put("takeShot", methodRecord(74731, 5030408, 13526, "dynCall_vii"))
            put("sharedGameManager", methodRecord(75097, 5031641, 13624, "dynCall_iii"))
        }
        val offsets = JSONObject().apply {
            put("gameManagerSingleton", 270408)
            put("mainManagerSingleton", 360320)
            put("sceneSingleton", 360328)
            put("gameManagerRules", 8)
            put("gameManagerCue", 36)
            put("gameManagerEnglish", 40)
            put("gameManagerCueBall", 44)
            put("gameManagerTable", 44)
            put("gameManagerGameHUD", 52)
            put("gameManagerGameState", 72)
            put("gameManagerPlayer", 76)
            put("gameManagerOpponent", 80)
            put("ballNumber", 124)
            put("ballPosition", 32)
            put("ballVelocity", 48)
            put("ballRadius", 80)
            put("ballType", 116)
            put("ballState", 120)
        }
        return JSONObject().apply {
            put("buildId", "4.4.3_8602f")
            put("methods", methods)
            put("offsets", offsets)
        }
    }

    private fun methodRecord(
        functionIndex: Int,
        selectorAddress: Int,
        wasmTableIndex: Int,
        dynCallExport: String
    ): JSONObject {
        return JSONObject().apply {
            put("functionIndex", functionIndex)
            put("selectorAddress", selectorAddress)
            put("wasmTableIndex", wasmTableIndex)
            put("dynCallExport", dynCallExport)
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
