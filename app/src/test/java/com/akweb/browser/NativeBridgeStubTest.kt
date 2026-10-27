package com.akweb.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tes unit untuk stub host native. Menegaskan satu hal penting:
 * stub TIDAK PERNAH mengembalikan plan, dalam bentuk apa pun.
 */
class NativeBridgeStubTest {

    @Test
    fun buildObserve_dijawabPlanTidakTersedia() {
        val reply = NativeBridgeStub.replyJson(
            NativeBridgeStub.OP_BUILD_OBSERVE, "req-1", "build-1"
        )
        assertTrue(reply.contains("build.observe.ack"))
        assertTrue(reply.contains(NativeBridgeStub.PLAN_STATUS))
        assertTrue(reply.contains("\"accepted\":false"))
        assertFalse(reply.contains("\"plan\""))
    }

    @Test
    fun snapshotPlan_dijawabPlanTidakTersediaTanpaPlan() {
        val reply = NativeBridgeStub.replyJson(
            NativeBridgeStub.OP_SNAPSHOT_PLAN, "req-2", "build-1"
        )
        assertTrue(reply.contains("game.snapshot.plan.ack"))
        assertTrue(reply.contains(NativeBridgeStub.PLAN_STATUS))
        assertTrue(reply.contains("\"accepted\":false"))
        assertFalse(reply.contains("\"plan\""))
    }

    @Test
    fun operasiTidakDikenal_tetapTanpaPlan() {
        val reply = NativeBridgeStub.replyJson("operasi.aneh", "req-3", "")
        assertTrue(reply.contains(NativeBridgeStub.PLAN_STATUS))
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
