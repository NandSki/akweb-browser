package com.akweb.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tes unit untuk stub host native. Menegaskan dua hal penting:
 * (1) balasan mengikuti kontrak ack bridge: TEPAT 10 field, tanpa
 * field lama (status/buildId) yang dulu ditolak sebagai
 * "ack-contract-mismatch";
 * (2) stub TIDAK PERNAH mengembalikan plan: game.snapshot.plan
 * selalu accepted=false dengan detail plan_tidak_tersedia.
 */
class NativeBridgeStubTest {

    private fun replyFor(operation: String): String {
        return NativeBridgeStub.replyJson(
            operation, "req-1", "0123456789abcdef0123456789abcdef",
            "fd7647a7fad23bca", "akweb-native-bridge", 1
        )
    }

    @Test
    fun ack_memilikiTepatSepuluhFieldKontrak() {
        val reply = replyFor(NativeBridgeStub.OP_SNAPSHOT_PLAN)
        for (key in listOf(
            "accepted", "channelGeneration", "channelId", "detail",
            "documentEpoch", "extensionRevision", "operation", "protocol",
            "requestId", "schema"
        )) {
            assertTrue("hilang: $key", reply.contains("\"$key\""))
        }
        assertFalse(reply.contains("\"status\""))
        assertFalse(reply.contains("\"buildId\""))
    }

    @Test
    fun hello_diterimaUntukMembukaChannel() {
        val reply = replyFor(NativeBridgeStub.OP_BRIDGE_HELLO)
        assertTrue(reply.contains("bridge.hello.ack"))
        assertTrue(reply.contains("\"accepted\":true"))
    }

    @Test
    fun buildObserve_membukaGerbangUiTanpaPlan() {
        val reply = replyFor(NativeBridgeStub.OP_BUILD_OBSERVE)
        assertTrue(reply.contains("build.observe.ack"))
        assertTrue(reply.contains("\"accepted\":true"))
        assertTrue(reply.contains("contract-supported"))
        assertFalse(reply.contains("\"plan\""))
    }

    @Test
    fun snapshotPlan_dijawabPlanTidakTersediaTanpaPlan() {
        val reply = replyFor(NativeBridgeStub.OP_SNAPSHOT_PLAN)
        assertTrue(reply.contains("game.snapshot.plan.ack"))
        assertTrue(reply.contains(NativeBridgeStub.PLAN_STATUS))
        assertTrue(reply.contains("\"accepted\":false"))
        assertFalse(reply.contains("\"plan\""))
    }

    @Test
    fun operasiTidakDikenal_tetapTanpaPlan() {
        val reply = replyFor("operasi.aneh")
        assertTrue(reply.contains("operasi.aneh.ack"))
        assertTrue(reply.contains("\"accepted\":false"))
        assertFalse(reply.contains("\"plan\""))
    }

    @Test
    fun extractOperation_membacaOperationDariJson() {
        val raw = "{\"operation\":\"game.snapshot.plan\",\"buildId\":\"b1\"}"
        assertEquals(
            NativeBridgeStub.OP_SNAPSHOT_PLAN,
            NativeBridgeStub.extractOperation(raw)
        )
    }
}
