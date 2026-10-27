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
 * - Selalu membalas dengan status yang jelas: plan_tidak_tersedia.
 * - TIDAK PERNAH mengembalikan objek plan apa pun, TIDAK PERNAH
 *   berpura-pura plan tersedia, dan TIDAK PERNAH meniru jawaban
 *   "diterima" dari host asli. Tanpa plan, snapshot ekstensi memang
 *   akan berhenti — dan panel debug di aplikasi inilah yang
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
     * Balasan stub untuk satu operasi. Selalu berisi status
     * plan_tidak_tersedia dan accepted=false, dan TIDAK berisi
     * field plan apa pun.
     */
    fun replyJson(operation: String, requestId: String, buildId: String): String {
        val ackOperation = if (operation.isEmpty()) {
            "unknown.ack"
        } else {
            "$operation.ack"
        }
        val detail = when (operation) {
            OP_BUILD_OBSERVE -> "Host stub ini tidak menyediakan plan. " +
                "Ekstensi berhenti di sini: tidak ada plan untuk dibaca heap."
            OP_SNAPSHOT_PLAN -> "Host stub ini tidak menyediakan plan. " +
                "Snapshot tidak dapat berjalan tanpa plan."
            "" -> "Operasi tidak dikenali."
            else -> "Operasi tidak dilayani oleh host stub."
        }
        return "{" +
            "\"operation\":\"" + jsonEscape(ackOperation) + "\"," +
            "\"status\":\"" + PLAN_STATUS + "\"," +
            "\"accepted\":false," +
            "\"detail\":\"" + jsonEscape(detail) + "\"," +
            "\"requestId\":\"" + jsonEscape(requestId) + "\"," +
            "\"buildId\":\"" + jsonEscape(buildId) + "\"" +
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
        val buildId = extractField(rawMessage, "buildId")
        DebugLog.append("NATIVE <- $operation (buildId=$buildId, requestId=$requestId)")
        val reply = replyJson(operation, requestId, buildId)
        DebugLog.append("NATIVE -> $operation.ack status=$PLAN_STATUS accepted=false")
        return reply
    }
}
