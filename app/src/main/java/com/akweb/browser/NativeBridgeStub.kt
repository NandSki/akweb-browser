package com.akweb.browser

/**
 * Stub host native messaging untuk ekstensi AKWeb.
 *
 * Nama host yang diminta ekstensi (lihat generated-contract.js di
 * assets/akweb-extension/): "com.aimking.akweb.bridge".
 *
 * PERAN STUB INI, DAN BATASNYA:
 * - Hanya mencatat pesan yang diterima (build.observe,
 *   game.snapshot.plan, dan operasi lain).
 * - Balasan mengikuti kontrak ack bridge (isolated-bridge.js, fungsi
 *   ut()): TEPAT 10 field — accepted, channelGeneration, channelId,
 *   detail, documentEpoch, extensionRevision, operation, protocol,
 *   requestId, schema — dengan protocol/schema/documentEpoch/
 *   extensionRevision/requestId DIGEMAKAN dari request. Balasan lama
 *   (field status/buildId, tanpa channel*) ditolak bridge sebagai
 *   "ack-contract-mismatch" sehingga UI ekstensi tidak pernah
 *   dipasang sama sekali — itu bug yang dilaporkan 2026-10-29.
 * - Rantai gate bridge: bridge.hello.ack (accepted=true) ->
 *   bridge.capability.ack (accepted=true, channel sama) ->
 *   build.observe.ack (accepted=true, channel sama, detail HARUS
 *   "contract-supported") -> Ba() membuka port kontrol dan mengirim
 *   frame.ready -> router mengirim ui.ready -> overlay dipasang.
 *   Nilai "contract-supported" di sini HANYA membuka gerbang UI
 *   tersebut; ia TIDAK berarti plan tersedia.
 * - TIDAK PERNAH mengembalikan objek plan apa pun. Permintaan
 *   game.snapshot.plan (dan operasi lain di luar tiga gerbang di
 *   atas) tetap dibalas accepted=false dengan detail
 *   plan_tidak_tersedia. Tanpa plan, snapshot ekstensi memang akan
 *   berhenti di tahap plan — dan panel debug di aplikasi inilah yang
 *   menunjukkan persis di titik mana ia berhenti.
 * - Tidak ada kode dari APK AKWeb asli di sini: tidak ada libakweb.so,
 *   tidak ada dex asli, tidak ada plan yang disalin.
 *
 * Kelas ini sengaja murni Kotlin (tanpa Android/Gecko) sehingga
 * logikanya bisa diuji unit tanpa emulator/SDK.
 */
object NativeBridgeStub {
    const val NATIVE_APP = "com.aimking.akweb.bridge"
    const val PLAN_STATUS = "plan_tidak_tersedia"

    const val OP_BUILD_OBSERVE = "build.observe"
    const val OP_SNAPSHOT_PLAN = "game.snapshot.plan"
    const val OP_BRIDGE_HELLO = "bridge.hello"
    const val OP_BRIDGE_CAPABILITY = "bridge.capability"
    const val FALLBACK_PROTOCOL = "akweb-native-bridge"
    // Revision kontrak ekstensi v1.0.3 di shell ini; hanya fallback
    // kalau request tidak membawa extensionRevision (normalnya dibawa).
    const val FALLBACK_REVISION = "fd7647a7fad23bca"
    const val CHANNEL_ID = 1
    const val CHANNEL_GENERATION = 1

    /**
     * Ambil nilai "operation" dari pesan mentah (biasanya JSON).
     * Mengembalikan "" jika tidak ditemukan.
     */
    fun extractOperation(rawMessage: String): String {
        val match = Regex("\"operation\"\\s*:\\s*\"([^\"]+)\"").find(rawMessage)
        return match?.groupValues?.get(1) ?: ""
    }

    fun extractField(rawMessage: String, field: String): String {
        val pattern = Regex("\"" + Regex.escape(field) + "\"\\s*:\\s*\"([^\"]*)\"")
        return pattern.find(rawMessage)?.groupValues?.get(1) ?: ""
    }

    fun extractIntField(rawMessage: String, field: String, default: Int): Int {
        val pattern = Regex("\"" + Regex.escape(field) + "\"\\s*:\\s*(\\d+)")
        return pattern.find(rawMessage)?.groupValues?.get(1)?.toIntOrNull() ?: default
    }

    private fun jsonEscape(value: String): String {
        val out = StringBuilder()
        for (ch in value) {
            when (ch) {
                '"' -> out.append("\\\"")
                '\\' -> out.append("\\\\")
                '\n' -> out.append("\\n")
                '\r' -> out.append("\\r")
                '\t' -> out.append("\\t")
                else -> out.append(ch)
            }
        }
        return out.toString()
    }

    /**
     * Balasan stub untuk satu operasi, dengan TEPAT 10 field kontrak
     * ack bridge (lihat komentar header). accepted=true HANYA untuk
     * tiga gerbang channel (hello, capability, build.observe);
     * semua operasi lain, termasuk game.snapshot.plan, tetap
     * accepted=false dan TIDAK berisi field plan apa pun.
     */
    fun replyJson(
        operation: String,
        requestId: String,
        documentEpoch: String,
        extensionRevision: String,
        protocol: String,
        schema: Int
    ): String {
        val ackOperation = if (operation.isEmpty()) {
            "unknown.ack"
        } else {
            "$operation.ack"
        }
        val accepted = when (operation) {
            OP_BRIDGE_HELLO, OP_BRIDGE_CAPABILITY, OP_BUILD_OBSERVE -> true
            else -> false
        }
        val detail = when (operation) {
            OP_BRIDGE_HELLO -> "stub: channel open (plan not provided)"
            OP_BRIDGE_CAPABILITY -> "stub: capability acknowledged (plan not provided)"
            // Nilai eksak ini dipersyaratkan bridge (Ba() return kalau
            // bukan ini). Artinya HANYA gerbang UI terbuka; plan tetap
            // tidak disediakan (lihat game.snapshot.plan di bawah).
            OP_BUILD_OBSERVE -> "contract-supported"
            OP_SNAPSHOT_PLAN -> PLAN_STATUS
            "" -> "Operasi tidak dikenali."
            else -> "Operasi tidak dilayani oleh host stub."
        }
        return "{" +
            "\"accepted\":" + accepted + "," +
            "\"channelGeneration\":" + CHANNEL_GENERATION + "," +
            "\"channelId\":" + CHANNEL_ID + "," +
            "\"detail\":\"" + jsonEscape(detail) + "\"," +
            "\"documentEpoch\":\"" + jsonEscape(documentEpoch) + "\"," +
            "\"extensionRevision\":\"" + jsonEscape(extensionRevision) + "\"," +
            "\"operation\":\"" + jsonEscape(ackOperation) + "\"," +
            "\"protocol\":\"" + jsonEscape(protocol) + "\"," +
            "\"requestId\":\"" + jsonEscape(requestId) + "\"," +
            "\"schema\":" + schema +
            "}"
    }

    /**
     * Tangani satu pesan mentah: catat, lalu kembalikan balasan stub.
     * Mengembalikan balasan JSON (string) untuk dikirim kembali
     * ke ekstensi lewat delegate GeckoView.
     */
    fun handle(rawMessage: String): String {
        val operation = extractOperation(rawMessage)
        val requestId = extractField(rawMessage, "requestId")
        val documentEpoch = extractField(rawMessage, "documentEpoch")
        val extensionRevision = extractField(rawMessage, "extensionRevision")
            .ifEmpty { FALLBACK_REVISION }
        val protocol = extractField(rawMessage, "protocol")
            .ifEmpty { FALLBACK_PROTOCOL }
        val schema = extractIntField(rawMessage, "schema", 1)
        DebugLog.append("NATIVE <- $operation (requestId=$requestId)")
        val reply = replyJson(
            operation, requestId, documentEpoch,
            extensionRevision, protocol, schema
        )
        DebugLog.append("NATIVE -> $operation.ack accepted=" +
            (operation == OP_BRIDGE_HELLO ||
                operation == OP_BRIDGE_CAPABILITY ||
                operation == OP_BUILD_OBSERVE))
        return reply
    }
}
