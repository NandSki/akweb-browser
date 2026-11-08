/* bridge.js — PoC-3 background script: native bridge JSON (tanpa .so).
 *
 * Membuka port ke aplikasi via browser.runtime.connectNative, lalu
 * handshake: bridge.hello -> bridge.capability -> build.observe ->
 * game.snapshot.plan. Tujuannya membuktikan pipa JSON extension <-> Kotlin
 * jalan dua arah. TIDAK mengganggu solver.js (content script) — solver
 * tetap jalan seperti biasa; bridge ini hanya handshake + minta data plan.
 *
 * Ack dari native harus tepat 10 field (11 kalau membawa `data`):
 * accepted, channelGeneration, channelId, detail, documentEpoch,
 * extensionRevision, operation, protocol, requestId, schema.
 * Satu field meleset = port ditutup + reconnect (max 3x).
 */
(function () {
  "use strict";

  var NATIVE_APP = "com.nandskie.solver.bridge";
  var PROTOCOL = "nandskie-solver-bridge";
  var SCHEMA = 1;
  var EXTENSION_REVISION = "poc3";
  var ACK_FIELDS_10 = ["accepted", "channelGeneration", "channelId", "detail",
    "documentEpoch", "extensionRevision", "operation", "protocol",
    "requestId", "schema"];
  var ACK_FIELDS_11 = ACK_FIELDS_10.concat(["data"]);
  var MAX_RETRY = 3;

  var seq = 0;
  var epoch = randomHex(16);
  var port = null;
  var retries = 0;
  var planData = null;

  function randomHex(nBytes) {
    var a = new Uint8Array(nBytes);
    crypto.getRandomValues(a);
    var s = "";
    for (var i = 0; i < a.length; i++) {
      s += ("0" + a[i].toString(16)).slice(-2);
    }
    return s;
  }

  function log() {
    var args = ["[BRIDGE]"].concat(Array.prototype.slice.call(arguments));
    try { console.log.apply(console, args); } catch (e) {}
  }

  function buildMsg(operation, extra) {
    seq += 1;
    var m = {
      protocol: PROTOCOL,
      schema: SCHEMA,
      operation: operation,
      sequence: seq,
      requestId: randomHex(8),
      documentEpoch: epoch,
      extensionRevision: EXTENSION_REVISION
    };
    if (extra) {
      for (var k in extra) { m[k] = extra[k]; }
    }
    return m;
  }

  function validAck(msg, expectData) {
    if (!msg || typeof msg !== "object") return false;
    var keys = Object.keys(msg).sort();
    var want = (expectData ? ACK_FIELDS_11 : ACK_FIELDS_10).slice().sort();
    if (keys.join("|") !== want.join("|")) return false;
    if (msg.protocol !== PROTOCOL || msg.schema !== SCHEMA) return false;
    if (msg.documentEpoch !== epoch) return false;
    if (msg.extensionRevision !== EXTENSION_REVISION) return false;
    return true;
  }

  function onAck(msg) {
    var op = msg && msg.operation;
    if (!validAck(msg, op === "game.snapshot.plan.ack")) {
      log("ACK TIDAK VALID (field meleset), tutup port:", JSON.stringify(msg));
      try { port.disconnect(); } catch (e) {}
      return;
    }
    log("ACK OK:", op, "| detail:", msg.detail, "| accepted:", msg.accepted);
    if (op === "bridge.hello.ack" && msg.accepted) {
      port.postMessage(buildMsg("bridge.capability",
        { wrappedJSObject: true, canvasPresent: true }));
    } else if (op === "bridge.capability.ack" && msg.accepted) {
      port.postMessage(buildMsg("build.observe", { buildId: "4.4.3_8602f" }));
    } else if (op === "build.observe.ack" && msg.accepted) {
      port.postMessage(buildMsg("game.snapshot.plan", { buildId: "4.4.3_8602f" }));
    } else if (op === "game.snapshot.plan.ack" && msg.accepted) {
      planData = msg.data || null;
      log("PLAN DATA DITERIMA:", planData ? JSON.stringify(planData).slice(0, 400) : "null");
      // Simpan supaya content script bisa baca lewat runtime.sendMessage.
      try {
        browser.storage.local.set({ bridgePlanData: planData, bridgeConnected: true });
      } catch (e) {}
    }
  }

  function connect() {
    try {
      port = browser.runtime.connectNative(NATIVE_APP);
    } catch (e) {
      log("connectNative GAGAL:", e && e.message);
      return;
    }
    port.onMessage.addListener(onAck);
    port.onDisconnect.addListener(function () {
      log("port terputus");
      port = null;
      if (retries < MAX_RETRY) {
        retries += 1;
        setTimeout(connect, 250 * retries);
      } else {
        log("retry habis (" + MAX_RETRY + "x) — bridge mati, solver tetap jalan");
      }
    });
    port.postMessage(buildMsg("bridge.hello"));
    log("hello dikirim, menunggu ack...");
  }

  // Content script bisa minta status/data plan lewat runtime.sendMessage.
  try {
    browser.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg && msg.type === "bridge.status") {
        sendResponse({ connected: !!port, planData: planData });
        return true;
      }
      return false;
    });
  } catch (e) {}

  connect();
})();
