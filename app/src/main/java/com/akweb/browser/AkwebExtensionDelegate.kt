package com.akweb.browser

import org.json.JSONObject
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.WebExtension

/**
 * Jembatan GeckoView <-> ekstensi AKWeb.
 *
 * CATATAN VERIFIKASI BUILD PERTAMA: nama-nama API GeckoView di bawah
 * (WebExtension.MessageDelegate, WebExtension.Port, PortDelegate,
 * setMessageDelegate, installBuiltIn) adalah permukaan API GeckoView
 * yang harus dikonfirmasi terhadap GeckoView 157 saat build remote
 * pertama. Jika ada nama yang berubah di versi itu, build akan gagal
 * di titik ini dan nama tersebut yang harus diperbaiki — logika stub
 * di NativeBridgeStub tidak berubah.
 *
 * Delegate ini TIDAK menghasilkan plan. Semua pesan diteruskan ke
 * NativeBridgeStub, yang selalu membalas plan_tidak_tersedia.
 */
class AkwebExtensionDelegate(
    private val onExtensionReady: (String) -> Unit
) : WebExtension.MessageDelegate {

    override fun onMessage(
        nativeApp: String,
        message: Any,
        sender: WebExtension.MessageSender
    ): GeckoResult<Any>? {
        if (nativeApp != NativeBridgeStub.NATIVE_APP) {
            DebugLog.append("NATIVE <- pesan untuk host lain: $nativeApp (diabaikan)")
            return null
        }
        val replyJson = NativeBridgeStub.handle(message.toString())
        return GeckoResult.fromValue(JSONObject(replyJson) as Any)
    }

    override fun onConnect(port: WebExtension.Port) {
        DebugLog.append("NATIVE: port connectNative dibuka oleh ekstensi")
        port.setDelegate(object : WebExtension.PortDelegate {
            override fun onPortMessage(message: Any, port: WebExtension.Port) {
                val replyJson = NativeBridgeStub.handle(message.toString())
                try {
                    port.postMessage(JSONObject(replyJson))
                } catch (e: Exception) {
                    DebugLog.append("NATIVE: gagal membalas lewat port: ${e.message}")
                }
            }

            override fun onDisconnect(port: WebExtension.Port) {
                DebugLog.append("NATIVE: port connectNative ditutup oleh ekstensi")
            }
        })
    }

    override fun onDisconnect(port: WebExtension.Port) {
        DebugLog.append("NATIVE: delegate disconnect (port ditutup)")
    }
}
