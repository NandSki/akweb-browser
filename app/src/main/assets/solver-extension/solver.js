// ==UserScript==
// @name         8BP AKWeb Solver Gabungan v2.63 (Getter + dynCall)
// @namespace    nbp
// @version      gabungan-v2.63
// @description  v2.63 ala AKWeb: GARIS MANUAL REALTIME — pas autoplay OFF, garis ngikutin aim + power user TIAP TICK (bukan cuma kalau bola berubah): user geser aim / nge-charge power -> garis + titik berhenti gerak tiap frame kayak cheto (livePreview throttle signature + drawShot fallback cuma kalau tembakan manualnya berubah, jadi diam tidak bikin redraw sia-sia); bola dibaca via getter dynCall + fallback scan heap + pointer tracking (tanda nomor+92/radius+48, terbukti v2.46; alamat dilacak sekali, baca O(16) tanpa sweep ulang), tembak via dynCall setAim/setPower/takeShot + fallback DRAG pointer kalau gate manager/table gagal (angka Steel tidak jalan live), commit gate + plan satu siklus, loop requestAnimationFrame + fallback timer. Binding live guest (wasm sha 6c7a33d4..): manager HEAP32[27555]/[37069], getTable 7992, getBall 24373, setter di objek cue — tervalidasi di rig meja menu; posisi + tembakan belum terbukti di match live (lobby WebSocket diblokir di rig).
// @match        https://prod-web-pool.miniclip.com/*
// @match        https://*.pool.miniclippt.com/*
// @match        https://*.miniclip.com/*
// @match        https://*.miniclippt.com/*
// @match        https://8ballpool.com/*
// @match        https://www.8ballpool.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
var AKV2_VERSION = '2.63';
(function () {
  'use strict';
  function pageCode() {
    'use strict';
    /*__PURE_START__*/
    var AK_U = 2.61062456562, AK_D = 450.084293045, AK_L = 901.566650390625;
    var AK_F = -2.61062456562, AK_H = 355.390623869, AK_C = 600;
    // Pocket tetap dari deteksi gambar tableLondon-ipad.png (koordinat dunia).
    // Lebih akurat daripada PERKIRAAN dari bbox bola. Urutan: TL, TM, TR, BL, BM, BR (2 baris x 3 kolom).
    // Koreksi 2026-10-31: pocket tengah meja game ada di TENGAH ATAS dan TENGAH BAWAH (rel panjang),
    // bukan di kiri-tengah/kanan-tengah. TM/BM diambil dari titik tengah simetris pojok (kalibrasi v8.1
    // pixel TM x=576 tepat di tengah TL-TR, jadi world x tengah = rata-rata x pojok).
    // Bisa dikalibrasi PER-POCKET lewat panel (KALIBRASI POCKET) dan tersimpan per-konteks.
    // v2.58 KONSTANTA TERVERIFIKASI LIVE (§20, rig probe12, getPositionForPocket:
    // [24418] + isBallOverlappingAnyPocket: [24378] di match live): sudut
    // (±130.8, ±67.3) = Steel, TERKONFIRMASI persis; saku samping (0, ±70.0)
    // — Steel (0, ±72) meleset 2.0 unit, DIKOREKSI. Radius tangkap Steel 8.0
    // DIBANTAH: batas game ~10-12 (sudut 10-12 segala arah; samping 8-10 ke
    // tengah, 10-12 tangensial/diagonal, 12-14 ke luar) — bentuk saku, bukan
    // lingkaran. Urutan: TL, TM, TR, BL, BM, BR.
    var POCKET_DEFAULTS = [{ x: -130.8, y: -67.3 }, { x: 0, y: -70 }, { x: 130.8, y: -67.3 },
                           { x: -130.8, y: 67.3 }, { x: 0, y: 70 }, { x: 130.8, y: 67.3 }];
    var AK_POCKET_RADIUS = 10.0;      // §20 live: batas tangkap ~10-12, konservatif 10.0 (Steel 8.0 DIBANTAH)
    var AK_BALL_RADIUS = 3.800475;    // Steel-claimed, terverifikasi (radius bola +80)
    var AK_BALL_OVERLAP = 11.800475;  // Steel-claimed
    var AK_TABLE_BOUNDS = { x: -127, y: -63.5, w: 254, h: 127 }; // origin + ukuran meja
    var PKT_NAMES = ['TL', 'TM', 'TR', 'BL', 'BM', 'BR'];
    var FIXED_POCKETS = POCKET_DEFAULTS.map(function (p) { return { x: p.x, y: p.y }; });
    var FIXED_POCKET_WIDTH = 290;
    var CAL = { x: 0, y: 0, w: 0, h: 0 };
    var CAL_CTX = 'top';
    try { if (window.self !== window.top) CAL_CTX = 'iframe'; } catch (e) {}
    var CAL_KEY = 'akv2cal_' + CAL_CTX;
    try {
      var _c = JSON.parse(localStorage.getItem(CAL_KEY) || 'null');
      if (!_c) { var _o = JSON.parse(localStorage.getItem('akv2cal') || 'null'); if (_o) { _c = _o; try { localStorage.setItem(CAL_KEY, JSON.stringify(_c)); } catch (e2) {} } }
      if (_c && isFinite(_c.x) && isFinite(_c.y)) CAL = _c;
    } catch (e) {}
    // PROFIL MEJA — support SEMUA meja wajib: tiap slot menyimpan pocket + bantalan +
    // nama aset table (kalau terdeteksi). Ganti slot untuk meja berbeda, kalibrasi sekali
    // per slot. Migrasi otomatis: kalibrasi lama (sebelum profil) pindah ke MEJA 1.
    var TABLE_PROFILES_KEY = 'akv2tableprofiles';
    var TABLE_CURRENT_KEY = 'akv2tablecurrent_' + CAL_CTX;
    var TABLE_SLOTS = ['MEJA 1', 'MEJA 2', 'MEJA 3', 'MEJA 4', 'MEJA 5'];
    var PKT_CAL_KEY = 'akv2pocketcal_' + CAL_CTX;       // kunci lama, hanya untuk migrasi
    var CUSHION_CAL_KEY = 'akv2cushioncal_' + CAL_CTX;  // kunci lama, hanya untuk migrasi
    var tableProfiles = {};
    var tableCurrent = 'MEJA 1';
    function saveTableProfiles() {
      try { localStorage.setItem(TABLE_PROFILES_KEY, JSON.stringify(tableProfiles)); } catch (e) {}
      try { localStorage.setItem(TABLE_CURRENT_KEY, tableCurrent); } catch (e) {}
    }
    // v2.58: PENJAGA POCKET — profil tersimpan di localStorage bisa
    // berisi nilai lawas pra-v2.52 (Steel (0,+-72) untuk saku samping)
    // yang akan menimpa POCKET_DEFAULTS tervalidasi S20 (0,+-70.0)
    // SELAMANYA. Error 2 unit di posisi pocket ~= 1-2 derajat error
    // aim — fatal kalau jendela sudut valid cuma +-0.25 derajat (bola 6
    // -> TL, 159 unit). Jadi tiap profil diterapkan, tiap pocket yang
    // menyimpang > 1.5 unit dari nilai tervalidasi DIRESET ke nilai
    // tervalidasi (dicatat di log). Ambang 1.5: posisi pocket adalah
    // konstanta game yang tervalidasi live (eksak, bukan kalibrasi) dan
    // error Steel tepat 2.0 — jadi > 1.5 pasti salah; < 1.5 ditoleransi
    // sebagai noise pemetaan layar.
    function sanitizePockets() {
      var fixed = 0;
      for (var i = 0; i < 6; i++) {
        var d = Math.hypot(FIXED_POCKETS[i].x - POCKET_DEFAULTS[i].x, FIXED_POCKETS[i].y - POCKET_DEFAULTS[i].y);
        if (d > 1.5) {
          log('POCKET DIRESET: ' + PKT_NAMES[i] + ' simpanan (' + FIXED_POCKETS[i].x.toFixed(1) + ',' + FIXED_POCKETS[i].y.toFixed(1) + ') menyimpang ' + d.toFixed(1) + ' dari nilai tervalidasi S20 — dikembalikan ke (' + POCKET_DEFAULTS[i].x + ',' + POCKET_DEFAULTS[i].y + ')');
          FIXED_POCKETS[i].x = POCKET_DEFAULTS[i].x; FIXED_POCKETS[i].y = POCKET_DEFAULTS[i].y;
          fixed++;
        }
      }
      if (fixed) { recalcPocketWidth(); }
      return fixed;
    }
    function applyTableProfile(name) {
      var pr = tableProfiles[name];
      var i;
      if (pr && pr.pockets && pr.pockets.length === 6) {
        for (i = 0; i < 6; i++) { FIXED_POCKETS[i].x = pr.pockets[i].x; FIXED_POCKETS[i].y = pr.pockets[i].y; }
      } else {
        for (i = 0; i < 6; i++) { FIXED_POCKETS[i].x = POCKET_DEFAULTS[i].x; FIXED_POCKETS[i].y = POCKET_DEFAULTS[i].y; }
      }
      sanitizePockets();
      recalcPocketWidth();
      if (pr && pr.cushion && isFinite(pr.cushion.xmin)) CUSHION = { xmin: pr.cushion.xmin, xmax: pr.cushion.xmax, ymin: pr.cushion.ymin, ymax: pr.cushion.ymax };
      else CUSHION = null;
      tableCurrent = name;
      saveTableProfiles();
    }
    // Tebak nama aset table dari daftar resource (mis. tableLondon-ipad.png). Dipakai
    // untuk mencocokkan profil meja otomatis. Kalau tidak ketemu -> null (mode manual).
    function sniffTableAsset() {
      try {
        var rs = performance.getEntriesByType('resource') || [];
        var best = null;
        for (var i = 0; i < rs.length; i++) {
          var u = rs[i].name || '';
          var m = u.match(/table[A-Za-z0-9_-]*-ipad\.png/i);
          if (m) best = m[0].split('/').pop().split('?')[0];
        }
        return best;
      } catch (e) { return null; }
    }
    var lastTableAsset = null;
    // Coba pindah profil otomatis kalau aset table cocok dengan profil tersimpan.
    // Return nama profil kalau pindah, null kalau tidak.
    function tryAutoSwitchTable() {
      var a = sniffTableAsset();
      if (!a || a === lastTableAsset) return null;
      lastTableAsset = a;
      for (var i = 0; i < TABLE_SLOTS.length; i++) {
        var nm = TABLE_SLOTS[i];
        var pr = tableProfiles[nm];
        if (pr && pr.asset === a && nm !== tableCurrent) { applyTableProfile(nm); return nm; }
      }
      return null;
    }
    function switchTableProfile(name) {
      applyTableProfile(name);
      var el = $('akv2ProfName'); if (el) el.textContent = name;
      var pr = tableProfiles[name];
      log('PROFIL MEJA -> ' + name + (pr ? ' (ada simpanan' + (pr.asset ? ', aset=' + pr.asset : '') + ')' : ' (kosong — kalibrasi pocket+bantalan lalu 💾 SAVE)'));
    }
    // Lebar pocket mengikuti hasil kalibrasi (bukan angka bawaan 290), karena dipakai
    // untuk skala power. Di-hitung ulang tiap ada perubahan kalibrasi.
    function recalcPocketWidth() {
      var xs = FIXED_POCKETS.map(function (p) { return p.x; });
      FIXED_POCKET_WIDTH = Math.max(100, Math.max.apply(null, xs) - Math.min.apply(null, xs));
    }
    recalcPocketWidth();
    // Kalibrasi BANTALAN (cushion) untuk pantulan presisi: rect {xmin,xmax,ymin,ymax} dalam
    // koordinat dunia. Default = bbox pocket (perilaku lama). Tersimpan per-konteks.
    // Dipakai solver sebagai batas pantul (menggantikan rect dari pocket).
    var CUSHION = null;
    var CUSHION_EDGES = ['ATAS', 'BAWAH', 'KIRI', 'KANAN'];
    function cushionFromPockets() {
      var xs = FIXED_POCKETS.map(function (p) { return p.x; });
      var ys = FIXED_POCKETS.map(function (p) { return p.y; });
      return { xmin: Math.min.apply(null, xs), xmax: Math.max.apply(null, xs),
               ymin: Math.min.apply(null, ys), ymax: Math.max.apply(null, ys) };
    }
    function getCushionRect() { return CUSHION || cushionFromPockets(); }
    function ensureCushion() { if (!CUSHION) CUSHION = cushionFromPockets(); return CUSHION; }
    // Init profil meja: muat simpanan, migrasi kalibrasi lama -> MEJA 1, terapkan profil aktif.
    (function initTableProfiles() {
      try {
        var _tp = JSON.parse(localStorage.getItem(TABLE_PROFILES_KEY) || 'null');
        if (_tp) tableProfiles = _tp;
        var _tc = null;
        try { _tc = localStorage.getItem(TABLE_CURRENT_KEY); } catch (e) {}
        if (_tc && TABLE_SLOTS.indexOf(_tc) >= 0) tableCurrent = _tc;
      } catch (e) {}
      if (!tableProfiles['MEJA 1']) {
        var _oldP = null, _oldC = null;
        try { _oldP = JSON.parse(localStorage.getItem(PKT_CAL_KEY) || 'null'); } catch (e) {}
        try { _oldC = JSON.parse(localStorage.getItem(CUSHION_CAL_KEY) || 'null'); } catch (e) {}
        if (_oldP && _oldP.length === 6) {
          tableProfiles['MEJA 1'] = { pockets: _oldP, cushion: _oldC, asset: null };
          try { localStorage.removeItem(PKT_CAL_KEY); } catch (e) {}
          try { localStorage.removeItem(CUSHION_CAL_KEY); } catch (e) {}
        }
      }
      applyTableProfile(tableCurrent);
    })();
    function copyText(t) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).catch(function () {}); return; }
      } catch (e) {}
      try {
        var ta = document.createElement('textarea');
        ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
        document.body.removeChild(ta);
      } catch (e3) {}
    }
    function cushionText() {
      var c = getCushionRect();
      return 'xmin=' + c.xmin.toFixed(1) + ' xmax=' + c.xmax.toFixed(1) + ' ymin=' + c.ymin.toFixed(1) + ' ymax=' + c.ymax.toFixed(1) +
             ' (W=' + (c.xmax - c.xmin).toFixed(1) + ' H=' + (c.ymax - c.ymin).toFixed(1) + ')';
    }
    // Geser SATU tepi bantalan (tegak lurus tepinya). ATAS = tepi layar atas = world ymax.
    // Dipakai saat mode KALIBRASI ON dan item terpilih adalah tepi (calSel 6-9).
    function cushionNudge(dxPx, dyPx) {
      var c = ensureCushion();
      var rw = 700, rh = 400;
      try { var cv = largestCanvas(); if (cv && cv.rect.width > 0) { rw = cv.rect.width; rh = cv.rect.height; } } catch (e) {}
      var wxU = AK_L / (AK_U * rw), wyU = AK_C / (Math.abs(AK_F) * rh);
      var e = S.calSel - 6;
      if (e === 0) { if (dyPx === 0) return; c.ymax += -dyPx * wyU; }
      else if (e === 1) { if (dyPx === 0) return; c.ymin += -dyPx * wyU; }
      else if (e === 2) { if (dxPx === 0) return; c.xmin += dxPx * wxU; }
      else { if (dxPx === 0) return; c.xmax += dxPx * wxU; }
      log('BANTALAN ' + CUSHION_EDGES[e] + ' -> ' + cushionText());
    }
    function worldToScreen(wx, wy, rect) {
      var sx = (CAL.w > 0 && rect.width > 0) ? rect.width / CAL.w : 1;
      var sy = (CAL.h > 0 && rect.height > 0) ? rect.height / CAL.h : 1;
      return [rect.left + (wx * AK_U + AK_D) * rect.width / AK_L + CAL.x * sx,
              rect.top + (wy * AK_F + AK_H) * rect.height / AK_C + CAL.y * sy];
    }
    // v2.16: kebalikan worldToScreen — untuk AIM MANUAL (layar -> dunia)
    function screenToWorld(px, py, rect) {
      var sx = (CAL.w > 0 && rect.width > 0) ? rect.width / CAL.w : 1;
      var sy = (CAL.h > 0 && rect.height > 0) ? rect.height / CAL.h : 1;
      var wx = (((px - rect.left - CAL.x * sx) * AK_L / rect.width) - AK_D) / AK_U;
      var wy = (((py - rect.top - CAL.y * sy) * AK_C / rect.height) - AK_H) / AK_F;
      return [wx, wy];
    }
    function calNudge(dx, dy) {
      var r = null;
      try { var cv = largestCanvas(); if (cv) r = cv.getBoundingClientRect(); } catch (e) {}
      CAL.x += dx; CAL.y += dy;
      if (r && r.width > 0 && r.height > 0) { CAL.w = r.width; CAL.h = r.height; }
      try { localStorage.setItem(CAL_KEY, JSON.stringify(CAL)); } catch (e) {}
    }
    // Kalibrasi pocket PER-POCKET (satuan dunia). Dipakai saat mode KALIBRASI ON dan item
    // terpilih adalah pocket (calSel 0-5): nudge ◀▲▼▶ menggeser pocket itu, bukan seluruh overlay.
    function pocketNudge(dxPx, dyPx) {
      var rw = 700, rh = 400;
      try { var cv = largestCanvas(); if (cv && cv.rect.width > 0) { rw = cv.rect.width; rh = cv.rect.height; } } catch (e) {}
      var p = FIXED_POCKETS[S.calSel];
      p.x += dxPx * AK_L / (AK_U * rw);
      p.y += -dyPx * AK_C / (Math.abs(AK_F) * rh); // layar atas (dyPx<0) = world y bertambah (AK_F negatif)
      log('POCKET ' + PKT_NAMES[S.calSel] + ' -> x=' + p.x.toFixed(1) + ' y=' + p.y.toFixed(1));
    }
    // Item kalibrasi gabungan: 0-5 = pocket TL..BR, 6-9 = tepi bantalan ATAS..KANAN.
    var CAL_ITEMS = ['TL', 'TM', 'TR', 'BL', 'BM', 'BR', 'ATAS', 'BAWAH', 'KIRI', 'KANAN'];
    function calSaveAll() {
      // SAVE masuk ke PROFIL MEJA aktif (bukan kunci tunggal lagi).
      tableProfiles[tableCurrent] = {
        pockets: FIXED_POCKETS.map(function (p) { return { x: p.x, y: p.y }; }),
        cushion: CUSHION ? { xmin: CUSHION.xmin, xmax: CUSHION.xmax, ymin: CUSHION.ymin, ymax: CUSHION.ymax } : null,
        asset: sniffTableAsset()
      };
      saveTableProfiles();
      var pr = tableProfiles[tableCurrent];
      var t = 'PROFIL ' + tableCurrent + ' TERSIMPAN: POCKET ' + pr.pockets.map(function (p, i) { return PKT_NAMES[i] + '=' + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ') + ' | W=' + Math.round(FIXED_POCKET_WIDTH) +
              ' || CUSHION ' + cushionText() + (pr.asset ? ' || ASET=' + pr.asset : '');
      log(t + ' [disalin ke clipboard]');
      copyText(t);
    }
    function calResetAll() {
      for (var i = 0; i < 6; i++) { FIXED_POCKETS[i].x = POCKET_DEFAULTS[i].x; FIXED_POCKETS[i].y = POCKET_DEFAULTS[i].y; }
      recalcPocketWidth();
      CUSHION = null;
      delete tableProfiles[tableCurrent];
      saveTableProfiles();
      log('PROFIL ' + tableCurrent + ' di-reset (kembali bawaan).');
    }
    function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
    function pathClear(balls, x1, y1, x2, y2, ignore, R) {
      var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      if (L < 1e-6) return true;
      dx /= L; dy /= L;
      for (var i = 0; i < balls.length; i++) {
        if (ignore.indexOf(i) >= 0) continue;
        var b = balls[i], rx = b.x - x1, ry = b.y - y1, proj = rx * dx + ry * dy;
        if (proj <= R * 0.4 || proj >= L - R * 0.4) continue;
        var qx = x1 + dx * proj, qy = y1 + dy * proj;
        // v2.43: clearance DULU R*2-2 (=5.6) — padahal 2 bola bersentuhan kalau
        // jarak pusat < 2R (=7.6). Jadi solver ngira jalur bersih padahal bola
        // bakal kesenggol pas ditusuk ("ukuran bola kurang besar"). Sekarang
        // R*2+1.5 (=9.1, sama dengan COLLIDE_DIST di checkClearPaths).
        if (Math.hypot(b.x - qx, b.y - qy) < R * 2 + 1.5) return false;
      }
      return true;
    }
    function rawClusters(f64, i32) {
      var out = [], n = f64.length, i, x, y, k, d, score, hasR, hasZ, hasN, v, ii;
      for (i = 0; i + 1 < n; i++) {
        x = f64[i]; y = f64[i + 1];
        if (!isFinite(x) || !isFinite(y)) continue;
        if (x < -200 || x > 200 || y < -160 || y > 160) continue;
        if (x === 0 && y === 0) continue;
        hasR = false; hasZ = false; hasN = false;
        for (k = -16; k <= 16; k++) {
          if (k === 0 || k === 1) continue;
          if (i + k < 0 || i + k >= n) continue;
          d = f64[i + k];
          if (isFinite(d) && d >= 3 && d <= 9) hasR = true;
          if (isFinite(d) && Math.abs(d) < 0.001) hasZ = true;
        }
        for (ii = 2 * i - 64; ii <= 2 * i + 64; ii++) {
          if (ii < 0 || ii >= i32.length) continue;
          v = i32[ii];
          if (v >= 0 && v <= 15) { hasN = true; break; }
        }
        score = (hasR ? 2 : 0) + (hasZ ? 1 : 0) + (hasN ? 2 : 0);
        out.push({ x: x, y: y, idx: i, score: score });
      }
      out.sort(function (a, b) { return b.score - a.score; });
      var clusters = [];
      for (i = 0; i < out.length; i++) {
        var c = out[i], dup = false;
        for (var j = 0; j < clusters.length; j++) {
          if (dist(c.x, c.y, clusters[j].x, clusters[j].y) < 6) { dup = true; break; }
        }
        if (!dup) clusters.push(c);
        if (clusters.length >= 200) break;
      }
      return clusters;
    }

    function rawClustersStrict(f64, i32) {
      var out = [], n = f64.length, i, x, y, k, d, hasR, hasN, hasZeroRun, o, v, ii, stats = { range: 0, strict: 0 };
      for (i = 0; i + 1 < n; i++) {
        x = f64[i]; y = f64[i + 1];
        if (!isFinite(x) || !isFinite(y)) continue;
        if (x < -200 || x > 200 || y < -160 || y > 160) continue;
        if (x === 0 || y === 0) continue;
        if (Math.abs(x - Math.round(x)) < 0.01 && Math.abs(y - Math.round(y)) < 0.01) continue;
        stats.range++;
        hasZeroRun = false;
        for (o = -4; o <= 12; o++) {
          if (i + o < 0 || i + o + 3 >= n) continue;
          if (f64[i + o] === 0 && f64[i + o + 1] === 0 && f64[i + o + 2] === 0 && f64[i + o + 3] === 0) { hasZeroRun = true; break; }
        }
        if (!hasZeroRun) continue;
        hasR = false; hasN = false;
        for (k = -20; k <= 20; k++) {
          if (k === 0 || k === 1) continue;
          if (i + k < 0 || i + k >= n) continue;
          d = f64[i + k];
          if (isFinite(d) && d >= 3 && d <= 9) { hasR = true; break; }
        }
        if (!hasR) continue;
        for (ii = 2 * i - 64; ii <= 2 * i + 64; ii++) {
          if (ii < 0 || ii >= i32.length) continue;
          v = i32[ii];
          if (v >= 0 && v <= 15) { hasN = true; break; }
        }
        if (!hasN) continue;
        stats.strict++;
        out.push({ x: x, y: y, idx: i, score: 5 });
        if (out.length >= 20000) break;
      }
      out.sort(function (a, b) { return b.score - a.score; });
      var clusters = [];
      for (i = 0; i < out.length; i++) {
        var c = out[i], dup = false;
        for (var j = 0; j < clusters.length; j++) {
          if (dist(c.x, c.y, clusters[j].x, clusters[j].y) < 6) { dup = true; break; }
        }
        if (!dup) clusters.push(c);
        if (clusters.length >= 5000) break;
      }
      return { clusters: clusters, stats: stats };
    }
    function stableClusters(clusters, f64b) {
      var out = [];
      for (var i = 0; i < clusters.length; i++) {
        var c = clusters[i];
        if (c.idx + 1 >= f64b.length) continue;
        if (Math.abs(f64b[c.idx] - c.x) < 0.5 && Math.abs(f64b[c.idx + 1] - c.y) < 0.5) out.push(c);
      }
      return out;
    }
    function assignBallsAndPockets(clusters, i32) {
      var high = [], i, j;
      for (i = 0; i < clusters.length; i++) if (clusters[i].score >= 2) high.push(clusters[i]);
      var pool = high.length >= 2 ? high : clusters.slice();
      var xs = clusters.map(function (c) { return c.x; }), ys = clusters.map(function (c) { return c.y; });
      var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
      var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
      var pockets = [], balls = [], pocketFromHeap = false;
      var onEdge = function (c) {
        return Math.abs(c.x - xmin) < 8 || Math.abs(c.x - xmax) < 8 || Math.abs(c.y - ymin) < 8 || Math.abs(c.y - ymax) < 8;
      };
      var edge = clusters.filter(onEdge);
      var mx = (xmin + xmax) / 2, my = (ymin + ymax) / 2;
      var near = function (c, tx, ty) { return dist(c.x, c.y, tx, ty) < 14; };
      var candPocket = [];
      var targets = [[xmin, ymin], [mx, ymin], [xmax, ymin], [xmin, ymax], [mx, ymax], [xmax, ymax]];
      for (i = 0; i < targets.length; i++) {
        var best = null, bd = 1e9;
        for (j = 0; j < edge.length; j++) {
          var dd = dist(edge[j].x, edge[j].y, targets[i][0], targets[i][1]);
          if (dd < bd) { bd = dd; best = edge[j]; }
        }
        if (best && bd < 14) candPocket.push(best);
      }
      if (candPocket.length >= 4) {
        pocketFromHeap = true;
        pockets = candPocket.map(function (c) { return { x: c.x, y: c.y }; });
        for (i = 0; i < pool.length; i++) {
          var isPk = false;
          for (j = 0; j < candPocket.length; j++) if (dist(pool[i].x, pool[i].y, candPocket[j].x, candPocket[j].y) < 6) isPk = true;
          if (!isPk) balls.push(pool[i]);
        }
      } else {
        pockets = FIXED_POCKETS;
        balls = pool.slice();
      }
      var pw = 0;
      for (i = 0; i < pockets.length; i++) pw = Math.max(pw, Math.abs(pockets[i].x - pockets[0].x));
      var pocketWidth = Math.max(100, (function () {
        var a = pockets[2].x - pockets[0].x; return a > 0 ? a : 240;
      })());
      // Radius bola 3.800475: terkonfirmasi dari diseksi PoolPredictor + validasi heap
      // (dulu pocketWidth*0.012 = 3.48 -> titik ghost meleset ~0.6 unit, bidikan kurang ke pocket).
      var R = 3.800475;
      var bestDelta = null, bestDistinct = -1, bestCover = -1;
      for (var delta = -64; delta <= 64; delta++) {
        var vals = [], seen = {}, distinct = 0, cover = 0, dup = false;
        for (i = 0; i < balls.length; i++) {
          var ii2 = 2 * balls[i].idx + delta;
          if (ii2 < 0 || ii2 >= i32.length) { vals.push(null); continue; }
          var vv = i32[ii2];
          if (vv >= 0 && vv <= 15) {
            cover++;
            if (seen[vv]) dup = true; else { seen[vv] = true; distinct++; }
            vals.push(vv);
          } else vals.push(null);
        }
        if (distinct > bestDistinct || (distinct === bestDistinct && cover > bestCover)) {
          bestDistinct = distinct; bestCover = cover; bestDelta = delta;
        }
      }
      var numbersOk = false;
      if (bestDelta !== null && bestDistinct >= Math.max(3, Math.floor(balls.length * 0.6))) {
        var used = {};
        for (i = 0; i < balls.length; i++) {
          var ii3 = 2 * balls[i].idx + bestDelta;
          var v3 = (ii3 >= 0 && ii3 < i32.length) ? i32[ii3] : -1;
          if (v3 >= 0 && v3 <= 15 && !used[v3]) { balls[i].num = v3; used[v3] = true; numbersOk = true; }
          else balls[i].num = null;
        }
      } else {
        for (i = 0; i < balls.length; i++) balls[i].num = null;
      }
      // Radius: R dari lebar pocket, karena radius heap belum tervalidasi di lapangan.
      // Pruning hantu: pasangan double yang bergeser 1 dari bola asli (mis. [y, vx])
      // ikut lolos sebagai kandidat, tapi nomornya tidak unik/konsisten. Kalau
      // nomor berhasil divalidasi (numbersOk), buang semua kandidat tanpa nomor:
      // yang tersisa hanya bola asli, bukan hantu.
      var pruned = balls;
      if (numbersOk) pruned = balls.filter(function (b) { return b.num !== null; });
      if (!pocketFromHeap) {
        pockets = FIXED_POCKETS;
        pocketWidth = FIXED_POCKET_WIDTH;
        R = 3.800475;
      }
      var outBalls = pruned.map(function (b) {
        return { x: b.x, y: b.y, idx: b.idx, score: b.score, num: (b.num === undefined ? null : b.num), cue: (b.num === 0) };
      });
      return { balls: outBalls, pockets: pockets, pocketFromHeap: pocketFromHeap, radius: R, pocketWidth: pocketWidth, numbersOk: numbersOk, numberDelta: bestDelta };
    }
    function bouncePoint(C, G, cn, R, rect) {
      // v2.58 DEFECT 1: tolak input non-finite (dulu pocket OBJECT pk
      // diteruskan ke sini — G[0]/G[1] undefined -> NaN -> 336/364
      // kandidat NaN, dan sort NaN mengembalikan pick NaN sebagai 'best').
      if (!isFinite(C[0]) || !isFinite(C[1]) || !isFinite(G[0]) || !isFinite(G[1]) || !isFinite(R)) return null;
      var e = 0.804, W = rect.xmax, H = rect.ymax, xmin = rect.xmin, ymin = rect.ymin;
      var edge = Math.max(R, R * 1.75);
      if (cn[0] !== 0) {
        var p = cn[0] < 0 ? xmin + edge : W - edge;
        var den = (G[0] - p) - e * (p - C[0]);
        if (Math.abs(den) < 1e-6) return null;
        var by = (C[1] * (G[0] - p) - e * (p - C[0]) * G[1]) / den;
        if (by < ymin + edge || by > H - edge) return null;
        return [p, by];
      }
      var p2 = cn[1] < 0 ? ymin + edge : H - edge;
      var den2 = (G[1] - p2) - e * (p2 - C[1]);
      if (Math.abs(den2) < 1e-6) return null;
      var bx = (C[0] * (G[1] - p2) - e * (p2 - C[1]) * G[0]) / den2;
      if (bx < xmin + edge || bx > W - edge) return null;
      return [bx, p2];
    }
    function segDistT(px, py, x1, y1, x2, y2) {
      // Jarak titik ke segmen + posisi proyeksi t (0..1). Untuk cek scratch.
      var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
      var t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      return { d: Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t)), t: t };
    }
    function difficultyPower(al, travelTgt, cut, scale, bankPt) {
      // Power OTOMATIS dari tingkat kesusahan: jarak cue->ghost, jarak ghost->pocket, sudut potong.
      // Jangkar dipertahankan dari retune 2026-10-31: lantai 24, mentok 80, lurus-pendek max 45, break 85 (di luar fungsi ini).
      var dAl = Math.min(1, (al * scale) / 320);
      var dTr = Math.min(1, (travelTgt * scale) / 320);
      var dCut = Math.min(1, cut / 78);
      var power = 24 + (dAl * 0.4 + dTr * 0.4 + dCut * 0.2) * 56;
      if (bankPt) power = Math.min(80, power * 1.1);
      if (cut < 10 && travelTgt * scale < 200) power = Math.min(power, 45);
      return Math.max(24, Math.min(80, Math.round(power / 2) * 2));
    }
    function cueBallDeflect(ax, ay, dx, dy) {
      // Kecepatan putih pasca-tumbukan (stun): V = aim - pocketDir*cos(cut), |V| = sin(cut).
      // ax,ay = arah bidik (cue->ghost), dx,dy = arah pocket (target->pocket).
      // Cut kecil (<12°): putih dianggap follow ke arah pocket (konservatif untuk cek scratch).
      // Kembali {dir:[x,y] satuan, frac: fraksi kecepatan}.
      var dot = Math.max(-1, Math.min(1, ax * dx + ay * dy));
      var cutRad = Math.acos(dot);
      if (cutRad < 12 * Math.PI / 180) return { dir: [dx, dy], frac: 1 };
      var tx = ax - dx * dot, ty = ay - dy * dot;
      var tl = Math.hypot(tx, ty);
      if (tl < 1e-6) return { dir: [dx, dy], frac: 1 };
      return { dir: [tx / tl, ty / tl], frac: tl };
    }
    function cueRollLen(power, frac, pocketWidth) {
      // Prediksi jarak gelinding bola putih pasca-tumbukan (world units). ∝ (power*frac)^2.
      return pocketWidth * 1.6 * Math.pow(power / 80, 2) * frac * frac;
    }
    function scratchRisk(cue, ghost, cueDir, cueRoll, pockets, R) {
      // WAJIB: true kalau jalur bola putih (sebelum & sesudah tumbukan) mengancam pocket.
      var ex = ghost[0] + cueDir[0] * cueRoll, ey = ghost[1] + cueDir[1] * cueRoll;
      for (var i = 0; i < pockets.length; i++) {
        var pk = pockets[i];
        var s = segDistT(pk.x, pk.y, ghost[0], ghost[1], ex, ey);
        if (s.d < R * 2.1 && s.t < 0.98 && s.t > 0.02) return true;
        // Pra-tumbukan: abaikan pocket di dekat titik ghost (daerah bola target).
        if (Math.hypot(pk.x - ghost[0], pk.y - ghost[1]) < R * 3) continue;
        var s2 = segDistT(pk.x, pk.y, cue.x, cue.y, ghost[0], ghost[1]);
        if (s2.d < R * 1.5) return true;
      }
      return false;
    }
    /* ===== v2.0: MESIN FISIKA (port 1:1 PoolPredictor Prediction.cpp) =====
       Simulasi event-driven: tabrakan bola-bola / bola-bantalan (46 titik) /
       bola-titik, pocket capture, friction + spin ala game asli.
       BALL_RADIUS 3.800475 cocok dgn heap live. World coords (+y up). */
    // pool-physics.js — port of PoolPredictor (iwex) Prediction.cpp / GameConstants.h
    // to JavaScript. Faithful port of the 8 Ball Pool physics model:
    // event-driven simulation: find nearest collision time per ball
    // (ball-ball, ball-line, ball-point), advance, resolve, repeat.
    //
    // World units: table 254 x 127, BALL_RADIUS 3.800475 (matches live WASM).
    // All simulation in WORLD coords; caller converts to screen.
    //
    // API:
    //   const sim = new PoolSim();
    //   const res = sim.simulate({
    //     balls: [{x, y, number, state}],  // state: 1=active, 4=potted(skip), 0=lifted(skip)
    //     shotAngle,   // radians, world coords (+x right, +y up)
    //     shotPower,   // same units as game (mock uses 888.85)
    //     shotSpin: {x, y},
    //     playerClass: 'solid' | 'stripe' | 'any'   // for shot-state rules (optional)
    //   });
    //   res.balls[i] = {index, number, positions: [{x,y}...], pocketed: bool, pocketIndex}
    //   res.cueScratched, res.firstHitIndex, res.shotValid

    'use strict';

    // ---------- GameConstants ----------
    const BALL_RADIUS = 3.800475;
    const BALL_RADIUS_SQUARE = BALL_RADIUS * BALL_RADIUS;
    const MAX_BALLS_COUNT = 16;
    const TABLE_WIDTH = 254.0, TABLE_HEIGHT = 127.0;
    const TABLE_HALF_WIDTH = TABLE_WIDTH / 2.0, TABLE_HALF_HEIGHT = TABLE_HEIGHT / 2.0;
    const TABLE_BOUND_LEFT = -TABLE_HALF_WIDTH + BALL_RADIUS;
    const TABLE_BOUND_TOP = -TABLE_HALF_HEIGHT + BALL_RADIUS;
    const TABLE_BOUND_RIGHT = TABLE_HALF_WIDTH - BALL_RADIUS;
    const TABLE_BOUND_BOTTOM = TABLE_HALF_HEIGHT - BALL_RADIUS;
    const TABLE_POCKETS_COUNT = 6;
    const TABLE_SHAPE_SIZE = 46;
    // v2.58 §20 live: batas tangkap game ~10-12 (Steel 8.0 DIBANTAH).
    // 10.0 = ujung konservatif — radius TARIK sim (bola dalam radius ini
    // ditarik ke tengah saku; masuk saku kalau < BALL_RADIUS dari tengah).
    const POCKET_RADIUS = 10.0;
    const POCKET_RADIUS_SQUARE = POCKET_RADIUS * POCKET_RADIUS;
    const TIME_PER_TICK = 0.005;
    const MIN_TIME = 1E-11;
    const PI = Math.PI, PI_0_5 = PI / 2.0, PI_1_5 = PI * 1.5;

    const BallState = { DEFAULT: 1, IN_POCKET: 2, UNKNOWN: 3, POTTED: 4 };
    const BallClassification = { ANY: -1, CUE_BALL: 0, SOLID: 1, STRIPE: 2, NINE_BALL_RULE: 3, EIGHT_BALL: 4 };

    // magic constants from the game's own physics (dword_35B7xxx)
    const UNK_35B7A20 = MIN_TIME;
    const UNK_35B3F70 = 1.5;
    const UNK_35B3F78 = 120.0;
    const UNK_35B3F80 = MIN_TIME;

    // ---------- TableProperties ----------
    // v2.58 §20 live: saku samping (0, ±70.0), bukan Steel (0, ±72).
    const POCKET_POSITIONS = [
      { x: -130.8, y: -67.3 }, { x: 0, y: -70 }, { x: 130.8, y: -67.3 },
      { x: 130.8, y: 67.3 }, { x: 0, y: 70 }, { x: -130.8, y: 67.3 },
    ];
    const TABLE_SHAPE = [
      [-127, 53.5], [-136.9, 64.1], [-138.2, 69.2], [-136.7, 73.2], [-132.7, 74.7],
      [-127.6, 73.4], [-117, 63.5], [-7.8, 63.5], [-6.1, 68.6], [-5.7, 72.7],
      [-3.7, 75.4], [0, 76.7], [3.7, 75.4], [5.7, 72.7], [6.1, 68.6],
      [7.8, 63.5], [117, 63.5], [127.6, 73.4], [132.7, 74.7], [136.7, 73.2],
      [138.2, 69.2], [136.9, 64.1], [127, 53.5], [127, -53.5], [136.9, -64.1],
      [138.2, -69.2], [136.7, -73.2], [132.7, -74.7], [127.6, -73.4], [117, -63.5],
      [7.8, -63.5], [6.1, -68.6], [5.7, -72.7], [3.7, -75.4], [0, -76.7],
      [-3.7, -75.4], [-5.7, -72.7], [-6.1, -68.6], [-7.8, -63.5], [-117, -63.5],
      [-127.6, -73.4], [-132.7, -74.7], [-136.7, -73.2], [-138.2, -69.2],
      [-136.9, -64.1], [-127, -53.5],
    ].map(p => ({ x: p[0], y: p[1] }));

    // ---------- NumberUtils ----------
    function calcAngleDelta(dx, dy) {
      let angle;
      if (dx === 0.0) {
        angle = PI_1_5;
        if (dy >= 0.0) angle = PI_0_5;
      } else {
        angle = Math.atan(dy / dx);
        if (dx < 0.0) angle += PI;
      }
      return angle;
    }
    function calcAngle(ax, ay, bx, by) { return calcAngleDelta(ax - bx, ay - by); }

    // ---------- Ball ----------
    class Ball {
      constructor() {
        this.index = 0; this.number = 0;
        this.classification = BallClassification.CUE_BALL;
        this.state = BallState.DEFAULT;
        this.originalOnTable = false; this.onTable = false;
        this.vx = 0; this.vy = 0;
        this.sx = 0; this.sy = 0; this.sz = 0;
        this.ix = 0; this.iy = 0;       // initial position
        this.px = 0; this.py = 0;       // predicted position
        this.positions = [];
        this.pocketIndex = -1;
      }
      isMovingOrSpinning() {
        return (this.vx !== 0 || this.vy !== 0 || this.sx !== 0 || this.sy !== 0 || this.sz !== 0);
      }
      findNextCollision(data, time) {
        // ball-ball
        if (this.state === BallState.DEFAULT) {
          for (let i = this.index + 1; i < data.ballsCount; i++) {
            const other = data.balls[i];
            if (other.state === BallState.DEFAULT && this.isBallBallCollision(time, other)) {
              data.collision.valid = true;
              data.collision.ballA = this;
              data.collision.type = 'BALL';
              data.collision.ballB = other;
            }
          }
        }
        if (this.willCollideWithTable(time)) {
          if (this.state === BallState.IN_POCKET) {
            const unkTime = time.t * UNK_35B3F70;
            this.vx -= this.px * unkTime;
            this.vy -= this.py * unkTime;
          } else if (this.state === BallState.DEFAULT) {
            for (let i = 0; i < TABLE_POCKETS_COUNT; i++) {
              const dx = POCKET_POSITIONS[i].x - this.px;
              const dy = POCKET_POSITIONS[i].y - this.py;
              const deltaSquare = dx * dx + dy * dy;
              if (deltaSquare < POCKET_RADIUS_SQUARE) {
                const unkTime = time.t * UNK_35B3F78;
                this.vx += dx * unkTime;
                this.vy += dy * unkTime;
                if (deltaSquare < BALL_RADIUS_SQUARE) {
                  this.state = BallState.IN_POCKET;
                  this.pocketIndex = i;
                  data.pocketStatus[i] = true;
                }
              }
            }
          }
          this.determineBallTableCollision(data, time);
        }
        if (this.state === BallState.IN_POCKET) {
          this.state = BallState.UNKNOWN;
          this.onTable = false;
          this.vx = 0; this.vy = 0;
          this.sx = 0; this.sy = 0; this.sz = 0;
        }
      }
      calcVelocity() {
        if (!this.isMovingOrSpinning()) return;
        const v15 = BALL_RADIUS * this.sx - this.vy;
        const v16 = -this.vx - this.sy * BALL_RADIUS;
        const v17 = Math.sqrt(v16 * v16 + v15 * v15);
        const v18 = v17 * 0.00145772594752187;
        if (v18 > UNK_35B3F80) {
          const v20 = (v18 < TIME_PER_TICK) ? (v17 * 0.00145772594752187) : TIME_PER_TICK;
          const v21 = 196.0 * v20 / v17;
          const v22 = v16 * v21;
          const v23 = v15 * v21;
          this.vx += v22;
          this.vy += v23;
          this.sx -= v23 * 0.6578125102783204;
          this.sy += v22 * 0.6578125102783204;
        }
        if (v18 < TIME_PER_TICK) {
          const v24 = this.vx, v25 = this.vy;
          const v27 = (TIME_PER_TICK - v18) * 10.878;
          const sp = Math.sqrt(v25 * v25 + v24 * v24);
          let v28 = sp > 0 ? 1.0 - v27 / sp : 0.0;
          if (v28 < 0.0) v28 = 0.0;
          this.vx = v24 * v28;
          this.vy = v25 * v28;
          this.sx = v25 * v28 / BALL_RADIUS;
          this.sy = -(v24 * v28) / BALL_RADIUS;
        }
        const v29 = 9.8 * TIME_PER_TICK;
        this.sz = (this.sz > 0.0) ? Math.max(this.sz - v29, 0.0) : Math.min(this.sz + v29, 0.0);
        // v2.58 DEFECT 2: kecepatan non-finite (dari input NaN) harus
        // dimatikan di sini, kalau tidak isMovingOrSpinning() tidak
        // pernah false dan sim tidak pernah selesai.
        if (!isFinite(this.vx) || !isFinite(this.vy) || !isFinite(this.sx) || !isFinite(this.sy) || !isFinite(this.sz)) {
          this.vx = 0; this.vy = 0; this.sx = 0; this.sy = 0; this.sz = 0;
        }
      }
      calcVelocityPostCollision(angle) {
        const angleCos = Math.cos(angle), angleSin = Math.sin(angle);
        const velocityX = angleCos * this.vx - angleSin * this.vy;
        const velocityY = angleSin * this.vx + angleCos * this.vy;
        const spinFactor = velocityX - BALL_RADIUS * this.sz;
        const absSpinFactor = Math.abs(spinFactor);
        const velocityFactor = absSpinFactor / 2.5;
        const absVelocityY = Math.abs(velocityY);
        const spinDirection = (spinFactor > 0.0) ? 1.0 : -1.0;
        let minSpinFactor = 0.4 * absVelocityY;
        if (velocityFactor < minSpinFactor) minSpinFactor = velocityFactor;
        const spinChange = spinDirection * minSpinFactor;
        const newVelocityX = velocityX - spinChange / 2.5;
        const newVelocityY = -0.804 * velocityY;
        this.vx = angleSin * newVelocityY + angleCos * newVelocityX;
        this.vy = angleCos * newVelocityY - newVelocityX * angleSin;
        const newSpinX = angleSin * this.sx + angleCos * this.sy;
        const newSpinY = angleCos * this.sx - angleSin * this.sy - velocityY * 0.1420875022201172;
        const newSpinZ = this.sz + spinChange * 0.6578125102783204;
        this.sx = angleSin * newSpinX + angleCos * newSpinY;
        this.sy = angleCos * newSpinX - newSpinY * angleSin;
        this.sz = newSpinZ;
      }
      move(time, precise) {
        // v2.58 DEFECT 2: kecepatan non-finite -> matikan (jangan gerakkan
        // bola ke posisi NaN).
        if (!isFinite(this.vx) || !isFinite(this.vy)) { this.vx = 0; this.vy = 0; }
        if (this.vx !== 0 || this.vy !== 0) {
          this.px += this.vx * time;
          this.py += this.vy * time;
          if (precise) {
            const n = this.positions.length;
            if (n > 1) {
              const a = this.positions[n - 2], b = this.positions[n - 1];
              if (!(((b.y - a.y) * (this.px - b.x)) === ((this.py - b.y) * (b.x - a.x)))) {
                this.positions.push({ x: this.px, y: this.py });
              }
            } else {
              this.positions.push({ x: this.px, y: this.py });
            }
          }
        }
      }
      isBallBallCollision(smallestTime, other) {
        const rx = other.px - this.px, ry = other.py - this.py;
        const dvx = other.vx - this.vx, dvy = other.vy - this.vy;
        const v24 = (rx * dvx + ry * dvy) * 2.0;
        if (v24 >= 0.0) return false;
        const velocityDeltaSquare = dvx * dvx + dvy * dvy;
        if (velocityDeltaSquare === 0) return false;
        const v27 = (rx * rx + ry * ry - BALL_RADIUS_SQUARE * 4) * (velocityDeltaSquare * 4.0);
        const square = v24 * v24;
        if (square < v27) return false;
        const v28 = (-v24 - Math.sqrt(square - v27)) / (velocityDeltaSquare * 2.0);
        if (v28 < 0.0) return false;
        if (v28 - UNK_35B7A20 > smallestTime.t) return false;
        smallestTime.t = v28;
        return true;
      }
      willCollideWithTable(smallestTime) {
        const currentX = this.px, currentY = this.py;
        const predictedX = currentX + this.vx * smallestTime.t;
        const predictedY = currentY + this.vy * smallestTime.t;
        let leftX, rightX, topY, bottomY;
        if (this.vx > 0.0) { leftX = currentX; rightX = predictedX; }
        else { leftX = predictedX; rightX = currentX; }
        if (this.vy > 0.0) { topY = currentY; bottomY = predictedY; }
        else { topY = predictedY; bottomY = currentY; }
        return (leftX < TABLE_BOUND_LEFT || rightX > TABLE_BOUND_RIGHT ||
                topY < TABLE_BOUND_TOP || bottomY > TABLE_BOUND_BOTTOM);
      }
      determineBallTableCollision(data, smallestTime) {
        for (let i = 0; i < TABLE_SHAPE_SIZE; i++) {
          const point = TABLE_SHAPE[i];
          const nextPoint = TABLE_SHAPE[(i + 1) % TABLE_SHAPE_SIZE];
          if (this.isBallLineCollision(smallestTime, point, nextPoint)) {
            const angle = calcAngle(nextPoint.x, nextPoint.y, point.x, point.y);
            data.collision.valid = true;
            data.collision.ballA = this;
            data.collision.type = 'LINE';
            data.collision.angle = -angle;
          } else if (this.isBallPointCollision(smallestTime, point)) {
            data.collision.valid = true;
            data.collision.ballA = this;
            data.collision.point = point;
            data.collision.type = 'POINT';
          }
        }
      }
      isBallLineCollision(pTime, a, b) {
        if (this.vx === 0 && this.vy === 0) return false;
        const dx = b.x - a.x, dy = b.y - a.y;
        const v17 = dy * this.vx - dx * this.vy;
        if (v17 === 0.0) return false;
        const invDistance = 1.0 / Math.sqrt(dx * dx + dy * dy);
        const v21 = invDistance * BALL_RADIUS;
        const v22 = this.px - a.x - dy * v21;
        const v23 = this.py - a.y + dx * v21;
        const v24 = (v22 * -this.vy - v23 * -this.vx) / v17;
        if (v24 <= 0.0 || v24 >= 1.0) return false;
        const time = (dx * v23 - dy * v22) / v17;
        if (time <= 0.0 || (time - 1E-11 > pTime.t)) return false;
        if (this.vx * (dy * invDistance) + this.vy * -(dx * invDistance) > 0.0) return false;
        pTime.t = time;
        return true;
      }
      isBallPointCollision(smallestTime, point) {
        const dx = point.x - this.px, dy = point.y - this.py;
        const v16 = -(this.vx * dx * 2.0) - (this.vy * dy * 2.0);
        if (v16 >= 0.0) return false;
        const velocitySquare = this.vx * this.vx + this.vy * this.vy;
        if (velocitySquare === 0) return false;
        const distanceSquare = dx * dx + dy * dy;
        const unkSquare = v16 * v16;
        if (distanceSquare - unkSquare / (velocitySquare * 4.0) >= BALL_RADIUS_SQUARE) return false;
        const v22 = (-v16 - Math.sqrt(unkSquare - velocitySquare * 4.0 * (distanceSquare - BALL_RADIUS_SQUARE))) / (velocitySquare * 2.0);
        if (v22 < 0.0) return false;
        if (v22 - UNK_35B7A20 > smallestTime.t) return false;
        smallestTime.t = v22;
        return true;
      }
    }

    // ---------- PoolSim ----------
    class PoolSim {
      simulate(opts) {
        const { balls, shotAngle, shotPower, shotSpin, precise = true } = opts;
        // v2.58 DEFECT 2: tolak input non-finite — sudut/power NaN bikin
        // kecepatan cue NaN, dan isMovingOrSpinning() (vx !== 0) selalu
        // true untuk NaN -> loop sim tak berujung + positions membengkak
        // -> OOM (probe12 run 1: driver OOM 2043 MB). Caller (solveShotV2
        // / isRobustShot) sudah menangkap throw -> fallback geometri.
        if (!isFinite(shotAngle) || !isFinite(shotPower)) throw new Error('sim: non-finite shotAngle/shotPower');
        for (let _fi = 0; _fi < balls.length; _fi++) {
          if (!isFinite(balls[_fi].x) || !isFinite(balls[_fi].y)) throw new Error('sim: non-finite ball position');
        }
        const spin = shotSpin || { x: 0, y: 0 };
        const data = { balls: [], ballsCount: 0, collision: { valid: false }, pocketStatus: new Array(6).fill(false) };
        // init balls (index 0 must be cue)
        const sorted = balls.slice().sort((a, b) => (a.number === 0 ? -1 : b.number === 0 ? 1 : a.number - b.number));
        for (let i = 0; i < sorted.length && i < MAX_BALLS_COUNT; i++) {
          const src = sorted[i], b = new Ball();
          b.index = i; b.number = src.number;
          b.classification = src.number === 0 ? BallClassification.CUE_BALL
            : src.number === 8 ? BallClassification.EIGHT_BALL
            : src.number < 8 ? BallClassification.SOLID : BallClassification.STRIPE;
          const st = src.state === 4 ? BallState.POTTED : (src.state === 1 ? BallState.DEFAULT : BallState.UNKNOWN);
          b.state = st;
          b.originalOnTable = (st === BallState.DEFAULT);
          b.onTable = b.originalOnTable;
          b.ix = src.x; b.iy = src.y; b.px = src.x; b.py = src.y;
          b.positions = [{ x: src.x, y: src.y }];
          data.balls.push(b);
        }
        data.ballsCount = data.balls.length;
        // init cue ball velocity/spin
        const angleSin = Math.sin(shotAngle), angleCos = Math.cos(shotAngle);
        const cue = data.balls[0];
        cue.vx = shotPower * angleCos;
        cue.vy = shotPower * angleSin;
        const spinFactor = shotPower / BALL_RADIUS;
        const v31 = -spin.y * spinFactor;
        cue.sx = -(angleSin * v31);
        cue.sy = angleCos * v31;
        cue.sz = spin.x * spinFactor;
        data.collision.firstHitBall = null;
        // main loop
        this.determineBallsPositions(data, precise);
        // finalize positions
        for (const b of data.balls) {
          const last = b.positions[b.positions.length - 1];
          if (last.x !== b.px || last.y !== b.py) b.positions.push({ x: b.px, y: b.py });
        }
        // results
        const out = data.balls.map(b => ({
          index: b.index, number: b.number,
          positions: b.positions,
          pocketed: !b.onTable && b.originalOnTable,
          pocketIndex: b.pocketIndex,
          finalX: b.px, finalY: b.py,
        }));
        return {
          balls: out,
          cueScratched: !data.balls[0].onTable,
          firstHitIndex: data.collision.firstHitBall ? data.collision.firstHitBall.index : -1,
          firstHitNumber: data.collision.firstHitBall ? data.collision.firstHitBall.number : -1,
          pocketedNumbers: out.filter(b => b.pocketed).map(b => b.number),
        };
      }
      determineBallsPositions(data, precise) {
        // v2.58 DEFECT 2: batas langkah sim — loop ini BERHENTI hanya kalau
        // semua bola berhenti; kecepatan NaN / patologis tidak pernah
        // berhenti (NaN !== 0 selalu true) -> hang + OOM. 20000 tick =
        // 100 detik waktu-sim (TIME_PER_TICK 0.005); tembakan nyata
        // selesai <2000 tick. Kalau batas kena, bola membeku di tempat.
        let isAnyBallMovingOrSpinning, time, time2, ticks = 0;
        do {
          if (++ticks > 20000) break;
          time = TIME_PER_TICK;
          do {
            time2 = { t: time };
            data.collision.valid = false;
            for (let i = 0; i < data.ballsCount; i++) {
              const ball = data.balls[i];
              if (ball.onTable) ball.findNextCollision(data, time2);
            }
            for (let i = 0; i < data.ballsCount; i++) {
              const ball = data.balls[i];
              if (ball.onTable && ball.isMovingOrSpinning()) ball.move(time2.t, precise && !this._coarse);
            }
            if (data.collision.valid) this.handleCollision(data, precise);
            time -= time2.t;
          } while (time > MIN_TIME);
          isAnyBallMovingOrSpinning = false;
          for (let i = 0; i < data.ballsCount; i++) {
            const ball = data.balls[i];
            if (ball.onTable) {
              ball.calcVelocity();
              if (ball.isMovingOrSpinning()) isAnyBallMovingOrSpinning = true;
            }
          }
        } while (isAnyBallMovingOrSpinning);
      }
      handleCollision(data, precise) {
        const ballA = data.collision.ballA, ballB = data.collision.ballB;
        if (!precise) ballA.positions.push({ x: ballA.px, y: ballA.py });
        if (data.collision.type === 'BALL') {
          this.handleBallBallCollision(ballA, ballB);
          if (!precise) ballB.positions.push({ x: ballB.px, y: ballB.py });
          if (data.collision.firstHitBall == null) data.collision.firstHitBall = ballB;
        } else if (data.collision.type === 'LINE') {
          ballA.calcVelocityPostCollision(data.collision.angle);
        } else {
          const dx = data.collision.point.y - ballA.py;
          const dy = -(data.collision.point.x - ballA.px);
          data.collision.angle = -calcAngleDelta(dx, dy);
          ballA.calcVelocityPostCollision(data.collision.angle);
        }
      }
      handleBallBallCollision(ballA, ballB) {
        const rx = ballA.px - ballB.px, ry = ballA.py - ballB.py;
        const dist = Math.sqrt(rx * rx + ry * ry) || 1e-9;
        const nx = rx / dist, ny = ry / dist;
        const vCompA = ballA.vx * nx + ballA.vy * ny;
        const vCompB = ballB.vx * nx + ballB.vy * ny;
        const vAx = nx * vCompA, vAy = ny * vCompA;
        const vBx = nx * vCompB, vBy = ny * vCompB;
        ballA.vx = vBx - (vAx - ballA.vx);
        ballA.vy = vBy - (vAy - ballA.vy);
        ballB.vx = vAx - (vBx - ballB.vx);
        ballB.vy = vAy - (vBy - ballB.vy);
      }
    }

    function solveShot(balls, pockets, R, group, allowBank, pocketWidth, getAll) {
      var cueIdx = -1, i;
      for (i = 0; i < balls.length; i++) if (balls[i].cue || balls[i].num === 0) { cueIdx = i; break; }
      if (cueIdx < 0) return null;
      var cue = balls[cueIdx];
      var targets = [];
      // v2.34: MODE ROTATION (9-ball / 15-ball) — HANYA bola nomor terkecil yang boleh jadi target
      if (typeof S !== 'undefined' && (S.gameMode === '9' || S.gameMode === '15')) {
        var minN = 99, minI = -1;
        for (i = 0; i < balls.length; i++) {
          if (i === cueIdx) continue;
          var nn = balls[i].num;
          if (nn !== null && nn >= 1 && nn < minN) { minN = nn; minI = i; }
        }
        if (minI >= 0) targets.push(minI);
      } else {
        for (i = 0; i < balls.length; i++) {
          if (i === cueIdx) continue;
          var n = balls[i].num;
          if (group === 'solid') { if (n !== null && n >= 1 && n <= 7) targets.push(i); }
          else if (group === 'stripe') { if (n !== null && n >= 9 && n <= 15) targets.push(i); }
          else { if (n === null || (n !== 8)) targets.push(i); }
        }
      }
      if (!targets.length) {
        var only8 = balls.filter(function (b, ii) { return ii !== cueIdx && b.num === 8; });
        if (only8.length) {
          for (i = 0; i < balls.length; i++) if (balls[i].num === 8) targets.push(i);
        }
      }
      if (!targets.length) return null;
      // Batas bantalan: dari kalibrasi BANTALAN kalau ada, kalau tidak dari bbox pocket (perilaku lama).
      var rect = getCushionRect();
      var scale = 1000 / Math.max(100, pocketWidth);
      var cands = [];
      // v2.58: PENALTI SUDUT MASUK SAKU — mulut saku samping (TM/BM)
      // adalah slot sepanjang bantalan: bola harus masuk hampir tegak
      // lurus terhadap bantalan (+-y). Masuk menyamping = menghantam
      // bibir saku (jaw). Saku sudut mulutnya menghadap diagonal ke
      // tengah meja dan jauh lebih pemaaf. Penalti LUNAK di skor saja
      // (sim tetap penentu akhir via TABLE_SHAPE): samping
      // 0.20/skor per derajat dari normal mulut (cap 15), sudut
      // 0.08/derajat (cap 8). Arah masuk = leg terakhir (untuk bank:
      // bounce->pocket, bukan target->bounce; untuk combo: B->pocket).
      // Normal mulut = arah pocket -> tengah meja.
      // v2.59: diekstrak jadi helper supaya consider() dan considerCombo()
      // memakai rumus yang sama.
      function pocketEntryPenalty(pk, edx, edy) {
        try {
          var mdx = -pk.x, mdy = -pk.y, ml = Math.hypot(mdx, mdy) || 1; mdx /= ml; mdy /= ml;
          var devDeg = Math.acos(Math.max(-1, Math.min(1, edx * mdx + edy * mdy))) * 180 / Math.PI;
          var isSide = Math.abs(pk.x) < 1;
          return Math.min(isSide ? 15 : 8, devDeg * (isSide ? 0.20 : 0.08));
        } catch (eEP) { return 0; }
      }
      function consider(tIdx, tgt, pk, dirx, diry, travelTgt, bankPt, kick, combo, firstHit) {
        var ghx = tgt.x - dirx * R * 2, ghy = tgt.y - diry * R * 2;
        var adx = ghx - cue.x, ady = ghy - cue.y, al = Math.hypot(adx, ady);
        if (al < 1) return;
        // v2.58 DEFECT 1: tolak kandidat non-finite sedini mungkin — jangan
        // biarkan NaN mengalir ke power/score/sim (itu yang membekukan sim).
        if (!isFinite(ghx) || !isFinite(ghy) || !isFinite(al) || !isFinite(dirx) || !isFinite(diry) || !isFinite(travelTgt)) return;
        adx /= al; ady /= al;
        var dot = adx * dirx + ady * diry;
        if (dot < Math.cos(78 * Math.PI / 180)) return;
        var cut = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
        if (!pathClear(balls, cue.x, cue.y, ghx, ghy, [tIdx], R)) return;
        for (var gi = 0; gi < balls.length; gi++) {
          if (gi === tIdx || gi === cueIdx) continue;
          if (Math.hypot(balls[gi].x - ghx, balls[gi].y - ghy) < R * 2 + 1) return; // v2.43: ghost tidak boleh menimpa bola lain (dulu R*2-2, kekecilan)
        }
        var power = difficultyPower(al, travelTgt, cut, scale, bankPt);
        // Prediksi bola putih pasca-tumbukan + cek scratch (WAJIB: jangan masukkan putih).
        var tdef = cueBallDeflect(adx, ady, dirx, diry);
        var tdir = tdef.dir;
        var croll = cueRollLen(power, tdef.frac, pocketWidth);
        var scratch = scratchRisk(cue, [ghx, ghy], tdir, croll, pockets, R);
        // v2.58: PENALTI SUDUT MASUK SAKU — mulut saku samping (TM/BM)
        // adalah slot sepanjang bantalan: bola harus masuk hampir tegak
        // lurus terhadap bantalan (+-y). Masuk menyamping = menghantam
        // bibir saku (jaw). Saku sudut mulutnya menghadap diagonal ke
        // tengah meja dan jauh lebih pemaaf. Penalti LUNAK di skor saja
        // (sim tetap penentu akhir via TABLE_SHAPE): samping
        // 0.20/skor per derajat dari normal mulut (cap 15), sudut
        // 0.08/derajat (cap 8). Arah masuk = leg terakhir (untuk bank:
        // bounce->pocket, bukan target->bounce). Normal mulut = arah
        // pocket -> tengah meja.
        var edx = dirx, edy = diry;
        if (bankPt) { var bl2 = Math.hypot(pk.x - bankPt[0], pk.y - bankPt[1]) || 1; edx = (pk.x - bankPt[0]) / bl2; edy = (pk.y - bankPt[1]) / bl2; }
        var entryPen = pocketEntryPenalty(pk, edx, edy);
        var score = cut * 2 + travelTgt * scale * 0.12 + al * scale * 0.05 + entryPen + (bankPt ? 26 : 0) + (kick ? 30 : 0) + (combo ? 34 : 0) + (scratch ? 1000 : 0);
        if (!isFinite(score) || !isFinite(cut) || !isFinite(power) || !isFinite(ghx) || !isFinite(ghy)) return; // v2.58 DEFECT 1: jangan dorong kandidat NaN
        cands.push({ angle: Math.atan2(ady, adx), targetIdx: tIdx, pocket: pk, cut: cut, power: power, score: score, R: R, bank: !!bankPt, kick: !!kick, combo: !!combo, firstHit: firstHit, ghost: [ghx, ghy], cueDir: tdir, cueRoll: croll, scratch: scratch });
      }
      // v2.59 COMBO (cue -> A -> B -> pocket): tembakan jalan alternatif
      // ketika tidak ada direct/bank/kick yang lolos — tanpa foul.
      // LEGALITAS: A dan B harus bola milik sendiri (grup solid 1..7 /
      // stripe 9..15; grup null = keduanya bukan 8; rotasi 9/15 = B bebas,
      // A = bola terendah). B adalah bola yang harus masuk saku; sim
      // memvalidasi B yang masuk (validateSimRes dipanggil dengan
      // potNum = c.comboNum). Cut A->B <= 78 deg; ghostA tidak boleh
      // menimpa bola lain; jalan cue->ghostA, A->B, B->pocket harus
      // bersih. Power = difficultyPower jarak total + cut A->B.
      function considerCombo(tIdx, tgt, b2Idx, bB, pk) {
        // Arah B -> pocket (arah B didorong sesudah kontak A->B).
        var dirBx = pk.x - bB.x, dirBy = pk.y - bB.y, bl = Math.hypot(dirBx, dirBy);
        if (bl < 1 || !isFinite(bl)) return;
        dirBx /= bl; dirBy /= bl;
        // Arah A -> B (arah A didorong sesudah kontak cue->A).
        var abx = bB.x - tgt.x, aby = bB.y - tgt.y, abl = Math.hypot(abx, aby);
        if (abl < R * 2 + 0.5 || !isFinite(abl)) return;
        var abnX = abx / abl, abnY = aby / abl;
        // v2.59: B bergerak sepanjang abn sesudah kontak A->B, jadi garis
        // gerak B HARUS mengarah ke saku: jarak tegak lurus dari pusat
        // saku ke garis B + t*abn harus <= radius tangkap saku (~10).
        // Tanpa cek ini, combo dengan A mendorong B ke arah yang salah
        // membanjiri daftar kandidat dan membuang budget sim.
        var missB = Math.abs(abnX * dirBy - abnY * dirBx) * bl;
        if (missB > 10) return;
        // ghostA = posisi pusat cue saat kontak dengan A: A mundur dari B
        // sepanjang garis A->B sebesar R*2.
        var gAx = tgt.x - abnX * (R * 2), gAy = tgt.y - abnY * (R * 2);
        var cdx = gAx - cue.x, cdy = gAy - cue.y, cl = Math.hypot(cdx, cdy);
        if (cl < 1 || !isFinite(cl)) return;
        cdx /= cl; cdy /= cl;
        // Cut angle = sudut antara arah cue->A dan arah A->B.
        var dot2 = cdx * abnX + cdy * abnY;
        if (dot2 < Math.cos(78 * Math.PI / 180)) return;
        var cut2 = Math.acos(Math.max(-1, Math.min(1, dot2))) * 180 / Math.PI;
        if (!pathClear(balls, cue.x, cue.y, gAx, gAy, [tIdx], R)) return;
        if (!pathClear(balls, tgt.x, tgt.y, bB.x, bB.y, [cueIdx, b2Idx], R)) return;
        if (!pathClear(balls, bB.x, bB.y, pk.x, pk.y, [cueIdx, tIdx], R)) return;
        for (var gi2 = 0; gi2 < balls.length; gi2++) {
          if (gi2 === tIdx || gi2 === cueIdx) continue;
          if (Math.hypot(balls[gi2].x - gAx, balls[gi2].y - gAy) < R * 2 + 1) return;
        }
        var travel2 = cl + abl + bl;
        var power2 = difficultyPower(cl, travel2, cut2, scale, null);
        var tdef2 = cueBallDeflect(cdx, cdy, abnX, abnY);
        var tdir2 = tdef2.dir;
        var croll2 = cueRollLen(power2, tdef2.frac, pocketWidth);
        var scratch2 = scratchRisk(cue, [gAx, gAy], tdir2, croll2, pockets, R);
        var entryPen2 = pocketEntryPenalty(pk, dirBx, dirBy);
        var score2 = cut2 * 2 + travel2 * scale * 0.12 + cl * scale * 0.05 + entryPen2 + 34 + (scratch2 ? 1000 : 0);
        if (!isFinite(score2) || !isFinite(cut2) || !isFinite(power2) || !isFinite(gAx) || !isFinite(gAy)) return;
        cands.push({ angle: Math.atan2(cdy, cdx), targetIdx: tIdx, pocket: pk, cut: cut2, power: power2, score: score2, R: R, bank: false, kick: false, combo: true, comboNum: bB.num, comboIdx: b2Idx, firstHit: tIdx, ghost: [gAx, gAy], cueDir: tdir2, cueRoll: croll2, scratch: scratch2 });
      }
      var isBreak = balls.length >= 15;
      for (var ti = 0; ti < targets.length; ti++) {
        var tIdx = targets[ti], tgt = balls[tIdx];
        for (var p = 0; p < pockets.length; p++) {
          var pk = pockets[p];
          var pdx = pk.x - tgt.x, pdy = pk.y - tgt.y, pl = Math.hypot(pdx, pdy);
          if (pl < 1) continue;
          var isMid = Math.abs(pk.x - (rect.xmin + rect.xmax) / 2) < (rect.xmax - rect.xmin) * 0.12;
          // Bidik TEPAT ke tengah pocket (2026-10-31: dulu pocket pojok digeser 0.35R keluar,
          // bikin bola kurang ke arah pocket). isMid dipertahankan untuk kode bank/kick.
          var aimPk = [pk.x, pk.y];
          var adx2 = aimPk[0] - tgt.x, ady2 = aimPk[1] - tgt.y, al2 = Math.hypot(adx2, ady2);
          if (al2 > 1 && pathClear(balls, tgt.x, tgt.y, pk.x, pk.y, [cueIdx], R)) {
            consider(tIdx, tgt, pk, adx2 / al2, ady2 / al2, pl, null, false, false, null);
          }
          if (allowBank) {
            var cushions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (var ci = 0; ci < cushions.length; ci++) {
              // v2.58 DEFECT 1: bouncePoint butuh ARRAY [x,y] — dulu objek
              // pk diteruskan, G[0]/G[1] undefined -> NaN -> 336/364
              // kandidat NaN di rack run-2 (sort NaN lalu mengembalikan
              // pick NaN sebagai 'best').
              var bpt = bouncePoint([tgt.x, tgt.y], [pk.x, pk.y], cushions[ci], R, rect);
              if (!bpt) continue;
              if (!pathClear(balls, tgt.x, tgt.y, bpt[0], bpt[1], [cueIdx], R)) continue;
              if (!pathClear(balls, bpt[0], bpt[1], pk.x, pk.y, [cueIdx, tIdx], R)) continue;
              var bl = Math.hypot(bpt[0] - tgt.x, bpt[1] - tgt.y);
              if (bl < 1) continue;
              consider(tIdx, tgt, pk, (bpt[0] - tgt.x) / bl, (bpt[1] - tgt.y) / bl, bl + Math.hypot(pk.x - bpt[0], pk.y - bpt[1]) / 0.8, bpt, false, false, null);
            }
            var tdx = pk.x - tgt.x, tdy = pk.y - tgt.y, tpl = Math.hypot(tdx, tdy);
            if (tpl > 1) {
              tdx /= tpl; tdy /= tpl;
              var ghx2 = tgt.x - tdx * R * 2, ghy2 = tgt.y - tdy * R * 2;
              for (var ki = 0; ki < cushions.length; ki++) {
                var bpt3 = bouncePoint([cue.x, cue.y], [ghx2, ghy2], cushions[ki], R, rect);
                if (!bpt3) continue;
                var postx = ghx2 - bpt3[0], posty = ghy2 - bpt3[1], postl = Math.hypot(postx, posty);
                if (postl < 1) continue;
                postx /= postl; posty /= postl;
                var kdot = postx * tdx + posty * tdy;
                if (kdot < Math.cos(78 * Math.PI / 180)) continue;
                if (!pathClear(balls, cue.x, cue.y, bpt3[0], bpt3[1], [tIdx], R)) continue;
                if (!pathClear(balls, bpt3[0], bpt3[1], ghx2, ghy2, [cueIdx, tIdx], R)) continue;
                var kcutDeg = Math.acos(Math.max(-1, Math.min(1, kdot))) * 180 / Math.PI;
                var kpower = Math.max(30, Math.min(80, Math.round(((Math.hypot(bpt3[0] - cue.x, bpt3[1] - cue.y) + postl + tpl) * scale / 22 * 1.1) / 2) * 2));
                var ktdef = cueBallDeflect(postx, posty, tdx, tdy);
                var ktdir = ktdef.dir;
                var kroll = cueRollLen(kpower, ktdef.frac, pocketWidth);
                var kscratch = scratchRisk(cue, [ghx2, ghy2], ktdir, kroll, pockets, R);
                cands.push({ angle: Math.atan2(bpt3[1] - cue.y, bpt3[0] - cue.x), targetIdx: tIdx, pocket: pk, cut: kcutDeg, power: kpower, score: kcutDeg * 2 + tpl * scale * 0.12 + 30 + (kscratch ? 1000 : 0), R: R, bank: false, kick: true, combo: false, firstHit: null, ghost: [ghx2, ghy2], cueDir: ktdir, cueRoll: kroll, scratch: kscratch });
              }
            }
          }
          // v2.59 COMBO: cue -> A(=tgt) -> B -> pocket. Jalan alternatif
          // ketika direct/bank/kick tidak ada — tanpa foul: A dan B harus
          // bola sendiri (solid 1..7 / stripe 9..15; grup null = bukan 8;
          // rotasi = B bebas, A sudah bola terendah via targets).
          // Dibangkitkan TANPA allowBank (combo adalah tembakan direct-cue).
          for (var bi = 0; bi < balls.length; bi++) {
            if (bi === cueIdx || bi === tIdx) continue;
            var bB = balls[bi];
            var bn = bB.num;
            if (bn === null || bn === 0 || bn === 8) continue;
            var rotMode = (typeof S !== 'undefined' && (S.gameMode === '9' || S.gameMode === '15'));
            if (!rotMode) {
              if (group === 'solid' && !(bn >= 1 && bn <= 7)) continue;
              if (group === 'stripe' && !(bn >= 9 && bn <= 15)) continue;
            }
            considerCombo(tIdx, tgt, bi, bB, pk);
          }
        }
      }
      if (!cands.length) return null;
      // v2.58 DEFECT 1: buang kandidat non-finite SEBELUM sort — sort dengan
      // skor NaN itu unspecified (NaN - x = NaN -> diperlakukan 0), jadi
      // pick NaN bisa jadi 'best' (336/364 NaN di rack run-2, versi lama).
      cands = cands.filter(function (c) {
        return isFinite(c.score) && isFinite(c.angle) && isFinite(c.power)
          && isFinite(c.ghost[0]) && isFinite(c.ghost[1]);
      });
      if (!cands.length) return null;
      cands.sort(function (a, b) {
        var ta = (a.bank || a.kick) ? 1 : 0, tb = (b.bank || b.kick) ? 1 : 0;
        return (ta - tb) || (a.score - b.score);
      });
      if (isBreak) { for (var _bi = 0; _bi < cands.length; _bi++) cands[_bi].power = 85; }
      if (getAll) return cands;
      var best = cands[0];
      return best;
    }
    // ===== v2.1: STATISTIK CUE + POWER FISIKA + POWER SWEEP + VALIDASI KETAT =====
    // (diambil dari data Almarou3: CUE_PROPERTIES_MAX_POWER/SPIN, power =
    // sqrt(2*196*jarak), sweep 150..max ambil pertama yg lolos validasi,
    // kalau tidak ada yg lolos = JANGAN TEMBAK)
    function simPowerToUI(sp) {
      // Konversi sim->game ala Almarou3 ShotPowerToPower: game = 1-(1-s/max)^2,
      // dipetakan ke skala drag kita 24..85.
      var mx = S.cueMaxPower || 306;
      var frac = 1 - Math.pow(1 - Math.max(0, Math.min(1, sp / mx)), 2);
      frac = Math.max(0, Math.min(1, frac));
      return 24 + frac * 61;
    }
    function physicsShotPower(cue, ghost, pocket) {
      // v^2 = 2*a*d (a = velocityReductionSliding = 196)
      var d1 = Math.hypot(cue.x - ghost[0], cue.y - ghost[1]);
      var d2 = Math.hypot(ghost[0] - pocket.x, ghost[1] - pocket.y);
      var p = Math.sqrt(2 * 196 * (d1 + d2));
      var mx = S.cueMaxPower || 306;
      return Math.max(150, Math.min(mx, p));
    }
    function badFirstHit(fhn, targetNum, group) {
      if (fhn === -1 || fhn === targetNum) return false;
      if (fhn === 0) return true;
      if (fhn === 8) return targetNum !== 8;
      if (group === 'solid') return !(fhn >= 1 && fhn <= 7);
      if (group === 'stripe') return !(fhn >= 9 && fhn <= 15);
      return fhn === 8;
    }
    function isRobustShot(balls, angle, power, spin, targetNum, group, sim, timeLeft, firstNum) {
      // v2.59: firstNum = bola pertama kena cue (A untuk combo; default =
      // targetNum). Robustness memakai potNum untuk cek potted + 8-prematur.
      // v2.58: HANYA variasi POWER (±8%), TANPA variasi sudut.
      // Alasan (terbukti 2026-11-10, offline vs meja probe11c): sudut bidik
      // di-set EXACT via dynCall setAim (double) — tidak ada error ±1.5°
      // di eksekusi nyata. Variasi sudut ±1.5° menuntut jendela sudut yang
      // tidak ada di tembakan menengah/panjang (bola 6 -> TL, 159 unit:
      // jendela valid cuma ±0.25°; bola 9 -> TM gagal di +1.5°) sehingga
      // isRobustShot menolak SEMUA tembakan dan autoplay tidak pernah
      // menembak ("sim tidak valid"). Yang BENAR-BENAR tidak pasti adalah
      // POWER: setPower berupa rasio simPower/cueMaxPower dan pemetaan
      // rasio->kecepatan game TIDAK BOLEH salah. v2.62 KALIBRASI LIVE
      // (Steel, 2026-11-11, 3 tembakan lurus rasio 0.3/0.5/0.7, v0
      // terukur 62/145/233): kecepatan game V ≈ 440·rasio − 70, jadi
      // cueMaxPower sebenarnya ≈ 306 (bukan 888.85) — sim v2.58-v2.61
      // melebih-lebihkan kecepatan cue 3-4x di rentang operasi
      // (rasio 0.3-0.5), itu sebabnya tembakan live selalu kepelan
      // padahal sim memvalidasi pot. Klaim lama probe16 (rasio 0.6 ->
      // bola 14 ~54 unit, sim 500 -> ~52 unit) SALAH BACA dan kini
      // diganti angka terukur ini. Gesekan sim TERNYATA BENAR (rolling
      // live 10.85-10.87 vs sim 10.878; sliding ~189 vs 196) — yang
      // salah hanya skala kecepatan, bukan gesekan. (Kalibrasi rig
      // mengukur langsung v0 vs rasio; kalau hasilnya beda lagi,
      // konstanta ini yang diubah, bukan rumusnya.)
      // Jadi: tembakan harus tetap masuk kalau power nyata meleset ±8%.
      // validateSimRes (nominal) tetap gerbang keras — tembakan yang tidak
      // masuk di sim nominal TIDAK PERNAH divalidasi (aturan v2.41).
      // Bonus: robustness kini 2 sim (bukan 4) per power, anggaran 60
      // panggilan sim solveShotV2 jadi lebih longgar.
      // v2.58 DEFECT 2: timeLeft (opsional) = sisa anggaran sim solveShotV2;
      // kalau habis -> tolak (jangan mulai sim baru).
      var variations = [
        { da: 0, dp: 1.08 },   // sudut sama, +8% power
        { da: 0, dp: 0.92 },   // sudut sama, -8% power
      ];
      var cueIdx = -1;
      var fnR = (firstNum === undefined || firstNum === null) ? targetNum : firstNum;
      for (var i = 0; i < variations.length; i++) {
        if (timeLeft && timeLeft() <= 0) return false; // v2.58 DEFECT 2: anggaran habis
        var v = variations[i];
        try {
          var simBalls = balls.map(function (b, bi) {
            var n = (bi === cueIdx) ? 0 : (b.num === null || b.num === undefined ? -1 : b.num);
            return { x: b.x, y: b.y, number: n, state: 1 };
          });
          var r = sim.simulate({
            balls: simBalls,
            shotAngle: angle + v.da,
            shotPower: power * v.dp,
            shotSpin: spin
          });
          // Validasi dasar (tanpa rekursi robustness)
          if (!r || r.cueScratched) return false;
          if (r.pocketedNumbers.indexOf(targetNum) < 0) return false;
          if (badFirstHit(r.firstHitNumber, fnR, group)) return false;
          // v2.34: skip aturan 8 prematur di mode rotation
          if (!(typeof S !== 'undefined' && (S.gameMode === '9' || S.gameMode === '15'))) {
            if (targetNum !== 8 && r.pocketedNumbers.indexOf(8) >= 0) return false;
          }
        } catch (e) { return false; }
      }
      return true;
    }
    function validateSimRes(res, targetNum, group, firstNum) {
      // Kriteria ala Almarou3 ValidateShotSimulation: wajib lolos semua.
      // v2.59 COMBO: targetNum = bola yang harus MASUK saku (B untuk
      // combo), firstNum = bola yang PERTAMA kena cue (A untuk combo;
      // default = targetNum untuk direct/bank/kick — perilaku lama).
      var fn = (firstNum === undefined || firstNum === null) ? targetNum : firstNum;
      if (!res) return false;
      if (res.cueScratched) return false;                           // putih masuk = tolak
      if (res.pocketedNumbers.indexOf(targetNum) < 0) return false; // target tidak masuk = tolak (obat "tetep di gas padahal ga masuk")
      if (badFirstHit(res.firstHitNumber, fn, group)) return false; // first-hit salah = tolak
      // v2.34: MODE ROTATION — bola 9/15 masuk = MENANG (bukan pelanggaran).
      // Aturan 8-ball (8 prematur = kalah) TIDAK berlaku di mode rotation.
      if (typeof S !== 'undefined' && (S.gameMode === '9' || S.gameMode === '15')) {
        // Di rotation, tidak ada larangan bola game masuk duluan — itu justru menang.
      } else {
        if (targetNum !== 8 && res.pocketedNumbers.indexOf(8) >= 0) return false; // 8 prematur = tolak
      }
      // v2.7: ANTI-TABRAKAN — target & cue tidak boleh menabrak bola lain.
      if (!checkClearPaths(res, targetNum, fn)) return false;
      return true;
    }
    function checkClearPaths(res, targetNum, firstNum) {
      // v2.7: Pastikan jalur BERSIH dari tabrakan yang tidak diinginkan.
      // - Bola target: lintasannya ke pocket tidak boleh menyentuh bola lain.
      // - Bola cue: sebelum menyentuh target, tidak boleh menyentuh bola lain.
      // Menggunakan positions[] dari simulasi (data asli, bukan tebakan).
      // v2.59 COMBO: firstNum = bola pertama kena cue (A); jalur target
      // (B) tidak dicek terhadap posisi awal A (A bagian dari rantai
      // combo — A menjauh dari posisinya saat B mulai bergerak), dan
      // jalur cue berhenti dicek saat cue sampai di A (bukan di B).
      var fn = (firstNum === undefined || firstNum === null) ? targetNum : firstNum;
      if (!res.balls) return true;
      var R = 3.800475, COLLIDE_DIST = R * 2 + 1.5; // 9.1 (diameter + margin)
      var ballMap = {};
      res.balls.forEach(function (b) { ballMap[b.number] = b; });
      var target = ballMap[targetNum], cue = ballMap[0];
      if (!target || !cue || !target.positions || !cue.positions) return true;
      // 1. Jalur TARGET ke pocket: cek tiap titik lintasan vs semua bola lain.
      //    (Kecuali: cue di titik awal [wajar bersentuhan saat strike], dan bola yang masuk pocket.)
      var potted = {};
      (res.pocketedNumbers || []).forEach(function (n) { potted[n] = 1; });
      for (var i = 0; i < target.positions.length; i++) {
        var tp = target.positions[i];
        for (var j = 0; j < res.balls.length; j++) {
          var ob = res.balls[j];
          if (ob.number === targetNum || ob.number === fn || potted[ob.number]) continue;
          // Posisi awal bola lain (sebelum bergerak) — pakai titik pertama lintasannya.
          var op = (ob.positions && ob.positions.length) ? ob.positions[0] : null;
          if (!op) continue;
          // Skip cue di awal (kontak strike wajar) — tapi hanya di 3 titik pertama target.
          if (ob.number === 0 && i < 3) continue;
          var d = Math.hypot(tp.x - op.x, tp.y - op.y);
          if (d < COLLIDE_DIST) {
            // Bola target bakal menabrak bola ob.number — tolak tembakan ini.
            return false;
          }
        }
      }
      // 2. Jalur CUE ke target: sebelum first-hit, cue tidak boleh dekat bola lain.
      //    (firstHitNumber sudah pastikan yang PERTAMA kena = target, tapi cek lagi
      //    untuk tabrakan di tengah jalan yang mungkin tidak tercatat sebagai first-hit.)
      //    v2.59: berhenti saat cue sampai di bola PERTAMA (fn = A untuk combo).
      var firstBall = ballMap[fn];
      var fPos0 = (firstBall && firstBall.positions && firstBall.positions.length) ? firstBall.positions[0] : null;
      for (var k = 0; k < cue.positions.length; k++) {
        var cp = cue.positions[k];
        // Berhenti cek begitu cue sudah dekat bola pertama (sudah sampai).
        if (fPos0 && Math.hypot(cp.x - fPos0.x, cp.y - fPos0.y) < COLLIDE_DIST) break;
        for (var m = 0; m < res.balls.length; m++) {
          var ob2 = res.balls[m];
          if (ob2.number === 0 || ob2.number === fn || potted[ob2.number]) continue;
          var op2 = (ob2.positions && ob2.positions.length) ? ob2.positions[0] : null;
          if (!op2) continue;
          if (Math.hypot(cp.x - op2.x, cp.y - op2.y) < COLLIDE_DIST) return false;
        }
      }
      return true;
    }
    // ===== v2.11: OTAK ANTI-BANTALAN =====
    // Masalah user: "sering banget bola menabrak bantalan jadi ga masuk".
    // Solusi: (1) kalau target MEPET bantalan (<10 unit), jangan buru-buru tembak lurus —
    // kasih penalti besar biar pilih bola lain yang lebih aman; (2) kalau jalur target
    // ke pocket NYEREMPET bantalan (<8 unit dari bantalan selain di pocket), tolak tembakan.
    function distToCushion(x, y) {
      // v2.24: pakai GARIS BANTALAN presisi kalau ada (S.cushLines dari heap),
      // fallback ke rect kasar kalau belum deteksi.
      if (S.cushLines && S.cushLines.length >= 4) {
        var best = Infinity;
        for (var i = 0; i < S.cushLines.length; i++) {
          var L = S.cushLines[i];
          var d = distPointToSegment(x, y, L.x1, L.y1, L.x2, L.y2);
          if (d < best) best = d;
        }
        return best;
      }
      var cr = getCushionRect();
      var dx = Math.min(Math.abs(x - cr.xmin), Math.abs(x - cr.xmax));
      var dy = Math.min(Math.abs(y - cr.ymin), Math.abs(y - cr.ymax));
      return Math.min(dx, dy);
    }
    function distPointToSegment(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      var len2 = dx * dx + dy * dy;
      if (len2 === 0) return Math.hypot(px - x1, py - y1);
      var t = ((px - x1) * dx + (py - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      var cx = x1 + t * dx, cy = y1 + t * dy;
      return Math.hypot(px - cx, py - cy);
    }
    function targetNearCushion(ball) {
      return distToCushion(ball.x, ball.y) < 10;
    }
    function pathGrazesCushion(fromX, fromY, toX, toY, pocket) {
      // Cek apakah garis dari (fromX,fromY) ke (toX,toY) nyerempet bantalan
      // di TENGAH jalan (bukan di dekat pocket — pendekatan ke pocket sudut
      // memang wajar dekat bantalan).
      var steps = 20;
      for (var i = 2; i < Math.floor(steps * 0.7); i++) {
        var t = i / steps;
        var x = fromX + (toX - fromX) * t;
        var y = fromY + (toY - fromY) * t;
        if (distToCushion(x, y) < 8) return true; // nyerempet di tengah jalan!
      }
      return false;
    }
    function cushionPenalty(ball, pocket) {
      var pen = 0;
      if (targetNearCushion(ball)) {
        pen += 5000;
        try { log('🧠 OTAK: bola ' + ball.num + ' mepet bantalan (' + distToCushion(ball.x, ball.y).toFixed(1) + ' unit) — penalti, cari yang lebih aman.'); } catch (e) {}
      }
      if (pathGrazesCushion(ball.x, ball.y, pocket.x, pocket.y, pocket)) {
        pen += 8000;
        try { log('🧠 OTAK: jalur bola ' + ball.num + ' ke pocket nyerempet bantalan — penalti.'); } catch (e2) {}
      }
      return pen;
    }
    // ===== v2.12: AUTO-BREAK ala Arab =====
    // Pas break (≥15 bola), WAJIB auto-aim seperti zip Arab:
    // scan 72 sudut (0-360°, step 5°) di power MAX, sim tiap sudut,
    // pilih sudut yang masukin bola TERBANYAK (tanpa scratch, tanpa 8).
    // Break BUTUH power keras (beda dengan tembakan biasa yang lembut dulu).
    function isBreakShot(balls) {
      // v2.42: dulu cuma jumlah bola >=15 → break yang tidak memasukkan bola
      // (16 bola tetap di meja) dianggap "masih break" → ngebreak LAGI ke meja
      // yang sudah acak, 5x dalam 9 menit, 0 masuk (BREAK LOOP, terbukti live
      // Steel 2026-11-08). Sekarang: break HANYA kalau bola masih dalam
      // formasi rack (segitiga rapat, bounding box <70 di kedua sumbu).
      if (!balls || balls.length < 15) return false;
      var mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, n = 0;
      for (var i = 0; i < balls.length; i++) {
        if (balls[i].num === 0 || balls[i].cue) continue; // cue bukan bagian rack
        n++;
        if (balls[i].x < mnx) mnx = balls[i].x;
        if (balls[i].x > mxx) mxx = balls[i].x;
        if (balls[i].y < mny) mny = balls[i].y;
        if (balls[i].y > mxy) mxy = balls[i].y;
      }
      if (n < 14) return false;
      return (mxx - mnx) < 70 && (mxy - mny) < 70;
    }
    function findBreakShot(balls, R) {
      // v2.42: break LANGSUNG ke kepala rack (bola terdepan segitiga), power
      // MAX, tanpa scan 72 sudut. Scan lama memilih sudut dari prediksi sim —
      // tapi prediksi break sim meleset (sim bilang 1-2 masuk, realita 0/4 di
      // live test 2026-11-08) → sudut rapuh yang cuma bagus di sim. Break
      // tengah lurus ke kepala rack adalah teknik standar yang paling bisa
      // diandalkan di meja sungguhan.
      var cue = null, cueIdx = -1;
      for (var i = 0; i < balls.length; i++) {
        if (balls[i].num === 0 || balls[i].cue) { cue = balls[i]; cueIdx = i; break; }
      }
      if (!cue) { try { log('💥 BREAK: bola putih tidak ketemu'); } catch (e) {} return null; }
      // Kepala rack = bola objek terdekat dari cue (ujung segitiga).
      var head = null, headIdx = -1, bestD = Infinity;
      for (var j = 0; j < balls.length; j++) {
        if (j === cueIdx) continue;
        var d = Math.hypot(balls[j].x - cue.x, balls[j].y - cue.y);
        if (d < bestD) { bestD = d; head = balls[j]; headIdx = j; }
      }
      if (!head) { try { log('💥 BREAK: kepala rack tidak ketemu'); } catch (e2) {} return null; }
      var dx = head.x - cue.x, dy = head.y - cue.y, dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      // Ghost ball nyata: titik tumbukan dead-center di kepala rack.
      var gx = head.x - dx * R * 2, gy = head.y - dy * R * 2;
      var mx = S.cueMaxPower || 306;
      try { log('💥 BREAK: lurus ke kepala rack (bola ' + head.num + ') sudut ' + (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1) + '° power MAX'); } catch (e3) {}
      return { angle: Math.atan2(dy, dx), power: 85, simPower: mx, spin: { x: 0, y: 0 }, res: null, potted: 0,
               targetIdx: headIdx, ghost: [gx, gy], pocket: { x: head.x, y: head.y },
               simRes: null, validated: true, isBreak: true };
    }
    function ballsMoved(a, b, thr) {
      if (!a || !b || a.length !== b.length) return true;
      var map = {};
      a.forEach(function (x) { map[x.num] = x; });
      for (var i = 0; i < b.length; i++) {
        var o = map[b[i].num];
        if (!o) return true;
        if (Math.hypot(b[i].x - o.x, b[i].y - o.y) > thr) return true;
      }
      return false;
    }
    function saveCue() {
      try { localStorage.setItem('akv2cue', String(S.cueMaxPower)); } catch (e) {}
      try { localStorage.setItem('akv2cueauto', S.cueAuto ? '1' : '0'); } catch (e2) {}
      var el = $('akv2CueVal');
      if (el) el.textContent = S.cueMaxPower + (S.cueAuto ? ' AUTO' : ' MAN');
    }
    // v2.58: CUE AUTO-TUNE KONVERGEN (ganti sawtooth v2.2). Dulu: masuk
    // -> max +5 (dilemahkan), nyaris-masuk -> max -25 — jadi max
    // berburu naik-turun selamanya dan menggeser SEMUA rasio power.
    // Sekarang: masuk = TIDAK BERUBAH (power sudah pas); berhenti
    // pendek (progress > 0.4) = max x0.97 (lebih kuat); KELEWATAN
    // pocket (along-track melewati pocket > 10 unit) = max x1.03
    // (lebih lembut); meleset jauh = masalah aim, jangan ubah max.
    // Langkah multiplikatif +-3%, clamp [200, 500] — konvergen ke
    // nilai benar, bukan osilasi.
    function tuneCuePower(preRes, postRes, shot) {
      if (!S.cueAuto || !shot || !shot.simPower || !preRes || !preRes.balls || !postRes || !postRes.balls) return;
      // v2.61: BELAJAR DARI TITIK BERHENTI (line mendarat dimana).
      // Bandingkan posisi akhir putih HASIL SIM (shot.simRes, power yang
      // dieksekusi) dengan posisi akhir putih NYATA sesudah tembakan.
      // Kalau putih nyata berhenti jauh lebih pendek dari prediksi sim =
      // tenaga kurang — ini ketahuan WALAU target tidak bergerak (kontak
      // lemah / putih berhenti sebelum sampai target tidak ketahuan oleh
      // logika progress target di bawah, yang butuh progress > 0.4).
      // Kalau jauh lebih jauh = terlalu kuat. Satu penyesuaian per
      // tembakan (return sesudah menyesuaikan).
      try {
        var cuePre = null, cuePost = null, cueFinPred = null;
        for (var _ci = 0; _ci < preRes.balls.length; _ci++) if (preRes.balls[_ci].num === 0) cuePre = preRes.balls[_ci];
        for (var _cj = 0; _cj < postRes.balls.length; _cj++) if (postRes.balls[_cj].num === 0) cuePost = postRes.balls[_cj];
        if (shot.simRes && shot.simRes.balls) {
          for (var _ck = 0; _ck < shot.simRes.balls.length; _ck++) {
            var _sb = shot.simRes.balls[_ck];
            if (_sb.number === 0 && _sb.positions && _sb.positions.length) {
              var _lp = _sb.positions[_sb.positions.length - 1];
              cueFinPred = { x: _lp.x, y: _lp.y };
              break;
            }
          }
        }
        if (cuePre && cuePost && cueFinPred) {
          var predTravel = Math.hypot(cueFinPred.x - cuePre.x, cueFinPred.y - cuePre.y);
          var actTravel = Math.hypot(cuePost.x - cuePre.x, cuePost.y - cuePre.y);
          if (predTravel > 10) {
            if (actTravel < predTravel * 0.7) {
              S.cueMaxPower = Math.max(200, S.cueMaxPower * 0.97);
              saveCue();
              log('CUE AUTO: max=' + S.cueMaxPower.toFixed(1) + ' (putih berhenti ' + actTravel.toFixed(0) + ' vs prediksi ' + predTravel.toFixed(0) + ' unit — kurang tenaga, titik berhenti tidak sampai garis)');
              return;
            }
            if (actTravel > predTravel * 1.3) {
              S.cueMaxPower = Math.min(500, S.cueMaxPower * 1.03);
              saveCue();
              log('CUE AUTO: max=' + S.cueMaxPower.toFixed(1) + ' (putih melaju ' + actTravel.toFixed(0) + ' vs prediksi ' + predTravel.toFixed(0) + ' unit — terlalu kuat)');
              return;
            }
          }
        }
      } catch (eCS) {}
      var preTgt = preRes.balls[shot.targetIdx];
      if (!preTgt) return;
      var postTgt = null;
      for (var i = 0; i < postRes.balls.length; i++) {
        if (postRes.balls[i].num === preTgt.num) { postTgt = postRes.balls[i]; break; }
      }
      // v2.58: MASUK = power sudah pas -> max TIDAK BERUBAH. Dulu +5 di
      // sini (melemahkan) adalah separuh sawtooth: tiap bola masuk
      // menggeser semua rasio power berikutnya.
      if (!postTgt) { log('CUE AUTO: bola masuk, max tetap ' + S.cueMaxPower); return; }
      var pk = shot.pocket;
      if (!pk) return;
      var d0 = Math.hypot(preTgt.x - pk.x, preTgt.y - pk.y);
      var d1 = Math.hypot(postTgt.x - pk.x, postTgt.y - pk.y);
      var progress = d0 > 1 ? (d0 - d1) / d0 : 0;
      // v2.58: KELEWATAN dicek DULU (sebelum progress) — bola yang lewat
      // pocket jauh juga punya progress besar (d1 kecil karena sudah
      // melewati pocket), tapi artinya TERLALU KUAT, bukan kurang.
      // Along-track: proyeksi perpindahan ke arah pre->pocket; kalau
      // melewati jarak pre->pocket lebih dari 10 unit = overshoot.
      if (d0 > 1) {
        var ux = (pk.x - preTgt.x) / d0, uy = (pk.y - preTgt.y) / d0;
        var along = (postTgt.x - preTgt.x) * ux + (postTgt.y - preTgt.y) * uy;
        if (along > d0 + 10) {
          S.cueMaxPower = Math.min(500, S.cueMaxPower * 1.03);
          saveCue();
          log('CUE AUTO: max=' + S.cueMaxPower.toFixed(1) + ' (bola KELEWATAN pocket ' + (along - d0).toFixed(1) + ' unit, kurangi tenaga)');
          return;
        }
      }
      if (progress > 0.4) {
        S.cueMaxPower = Math.max(200, S.cueMaxPower * 0.97);
        saveCue();
        log('CUE AUTO: max=' + S.cueMaxPower.toFixed(1) + ' (bola kurang sampai ke pocket, tambah tenaga)');
      }
      // v2.58: meleset jauh (progress kecil, tidak overshoot) = masalah
      // aim, bukan tenaga -> max tidak diubah.
    }
    // ===== v2.4: POCKET LEARN — posisi lubang dipelajari dari bola yang BENAR-BENAR masuk =====
    // Tiap bola yang hilang dicatat posisi terakhirnya (dari jejak 250ms), dimasukkan
    // ke rata-rata pocket terdekat. Makin banyak sampel, makin akurat. Ini DATA ASLI
    // dari meja, bukan tebakan — buat verifikasi & koreksi kalibrasi.
    function loadPokLearn() {
      try {
        var l = JSON.parse(localStorage.getItem('akv2poklearn') || 'null');
        if (l && l.counts && l.counts.length === 6 && l.pos && l.pos.length === 6) { S.pokLearn = l; return; }
      } catch (e) {}
      S.pokLearn = { counts: [0, 0, 0, 0, 0, 0],
        pos: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] };
    }
    function savePokLearn() {
      try { localStorage.setItem('akv2poklearn', JSON.stringify(S.pokLearn)); } catch (e) {}
    }
    function learnPocketsFromPots(preBalls, postBalls, trail) {
      if (!preBalls || !postBalls || !S.pokLearn) return;
      var postNums = {};
      postBalls.forEach(function (b) { postNums[b.num] = 1; });
      preBalls.forEach(function (b) {
        if (postNums[b.num]) return; // masih di meja
        var tr = trail && trail[b.num];
        if (!tr || !tr.length) return; // butuh jejak biar akurat, skip kalau tidak ada
        var lp = tr[tr.length - 1];
        var best = -1, bd = 1e9;
        for (var i = 0; i < 6; i++) {
          var d = Math.hypot(lp.x - FIXED_POCKETS[i].x, lp.y - FIXED_POCKETS[i].y);
          if (d < bd) { bd = d; best = i; }
        }
        if (best < 0 || bd > 40) return;
        var L = S.pokLearn, n = L.counts[best];
        L.pos[best].x = (L.pos[best].x * n + lp.x) / (n + 1);
        L.pos[best].y = (L.pos[best].y * n + lp.y) / (n + 1);
        L.counts[best] = n + 1;
        savePokLearn();
        log('🎯 POCKET BELAJAR: bola ' + b.num + ' masuk dekat ' + PKT_NAMES[best] + ' (' + (n + 1) + 'x) -> (' + L.pos[best].x.toFixed(1) + ',' + L.pos[best].y.toFixed(1) + ')');
      });
    }
    function reportPokLearn() {
      if (!S.pokLearn) loadPokLearn();
      log('📊 POCKET BELAJAR vs DIPAKAI:');
      var names = ['TL', 'TM', 'TR', 'BL', 'BM', 'BR'];
      for (var i = 0; i < 6; i++) {
        var n = S.pokLearn.counts[i];
        if (!n) { log('  ' + names[i] + ': belum ada data (main dulu biar belajar)'); continue; }
        var lp = S.pokLearn.pos[i], cp = FIXED_POCKETS[i];
        var d = Math.hypot(lp.x - cp.x, lp.y - cp.y);
        log('  ' + names[i] + ': belajar(' + lp.x.toFixed(1) + ',' + lp.y.toFixed(1) + ')[' + n + 'x] vs pakai(' + cp.x.toFixed(1) + ',' + cp.y.toFixed(1) + ') selisih=' + d.toFixed(1) + (d < 8 ? ' ✓' : ' ⚠ JAUH'));
      }
    }
    function applyTruePockets() {
      // Posisi lubang ASLI dari kode game (diverifikasi di 2 mod independen).
      // Satu tap -> 6 pocket + bantalan otomatis bener.
      var map = (typeof CAM_NATMAP !== 'undefined') ? CAM_NATMAP : [0, 1, 2, 5, 4, 3];
      for (var i = 0; i < 6; i++) {
        FIXED_POCKETS[i].x = CAM_NAT[map[i]].x;
        FIXED_POCKETS[i].y = CAM_NAT[map[i]].y;
      }
      CUSHION = null; // biar dihitung ulang dari pocket asli
      tableProfiles[tableCurrent] = {
        pockets: FIXED_POCKETS.map(function (p) { return { x: p.x, y: p.y }; }),
        cushion: null,
        asset: (typeof sniffTableAsset === 'function' ? sniffTableAsset() : null)
      };
      saveTableProfiles(); recalcPocketWidth();
      log('🎯 POCKET ASLI GAME dipakai: TL(-130.8,-67.3) TM(0,-70) TR(130.8,-67.3) BL(-130.8,67.3) BM(0,70) BR(130.8,67.3). Bantalan dihitung ulang otomatis.');
      try { if (S.lastScan && S.lastScan.res) drawShot(S.lastScan.shot || null, S.lastScan.res); } catch (e) {}
    }
    // ===== v2.8: CUSHION LEARN — posisi bantalan dipelajari dari bola yang BENERAN memantul =====
    // Tiap bola yang memantul bantalan dicatat titik pantulnya (dari jejak 250ms).
    // Pantulan = salah satu komponen kecepatan BERBALIK ARAH secara tajam tanpa menabrak bola lain.
    // Ini DATA ASLI dari meja — buat verifikasi & koreksi batas bantalan.
    function loadCushLearn() {
      try {
        var l = JSON.parse(localStorage.getItem('akv2cushlearn') || 'null');
        if (l && l.xmin && l.xmax && l.ymin && l.ymax) { S.cushLearn = l; return; }
      } catch (e) {}
      S.cushLearn = { xmin: [], xmax: [], ymin: [], ymax: [] };
    }
    function saveCushLearn() {
      try { localStorage.setItem('akv2cushlearn', JSON.stringify(S.cushLearn)); } catch (e) {}
    }
    function learnCushionsFromBounces(trail, balls) {
      // trail: {num: [{x,y}...4 titik]}, balls: posisi terkini (untuk cek tabrakan bola).
      if (!trail || !S.cushLearn) return;
      var R = 3.800475, MIN_VEL = 4; // min 4 unit/250ms = 16 u/s (hindari noise)
      // Peta posisi bola lain (untuk pastikan pantulan BUKAN tabrakan bola).
      var ballPos = {};
      (balls || []).forEach(function (b) { ballPos[b.num] = b; });
      Object.keys(trail).forEach(function (numStr) {
        var num = parseInt(numStr, 10), tr = trail[numStr];
        if (!tr || tr.length < 3) return;
        // Cek 2 segmen terakhir: v1 = p1->p2, v2 = p2->p3.
        var p1 = tr[tr.length - 3], p2 = tr[tr.length - 2], p3 = tr[tr.length - 1];
        var v1x = p2.x - p1.x, v1y = p2.y - p1.y;
        var v2x = p3.x - p2.x, v2y = p3.y - p2.y;
        // Pastikan bukan tabrakan dengan bola lain di titik p2.
        var hitBall = false;
        Object.keys(ballPos).forEach(function (on) {
          if (parseInt(on, 10) === num) return;
          var op = ballPos[on];
          if (Math.hypot(p2.x - op.x, p2.y - op.y) < R * 2 + 2) hitBall = true;
        });
        if (hitBall) return; // tabrakan bola, bukan bantalan — skip
        // Deteksi pantulan X (kiri/kanan): vx berbalik arah tajam.
        if (Math.abs(v1x) > MIN_VEL && Math.abs(v2x) > MIN_VEL && (v1x * v2x < 0)) {
          var edge = p2.x < 0 ? 'xmin' : 'xmax';
          S.cushLearn[edge].push(p2.x);
          if (S.cushLearn[edge].length > 50) S.cushLearn[edge].shift(); // max 50 sampel
          saveCushLearn();
          log('🛡️ BANTALAN BELAJAR: bola ' + num + ' memantul ' + (edge === 'xmin' ? 'KIRI' : 'KANAN') + ' di x=' + p2.x.toFixed(1) + ' (' + S.cushLearn[edge].length + 'x)');
        }
        // Deteksi pantulan Y (atas/bawah): vy berbalik arah tajam.
        if (Math.abs(v1y) > MIN_VEL && Math.abs(v2y) > MIN_VEL && (v1y * v2y < 0)) {
          var edgeY = p2.y < 0 ? 'ymin' : 'ymax';
          S.cushLearn[edgeY].push(p2.y);
          if (S.cushLearn[edgeY].length > 50) S.cushLearn[edgeY].shift();
          saveCushLearn();
          log('🛡️ BANTALAN BELAJAR: bola ' + num + ' memantul ' + (edgeY === 'ymin' ? 'ATAS' : 'BAWAH') + ' di y=' + p2.y.toFixed(1) + ' (' + S.cushLearn[edgeY].length + 'x)');
        }
      });
    }
    function avg(arr) {
      if (!arr || !arr.length) return null;
      return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    }
    function reportCushLearn() {
      if (!S.cushLearn) loadCushLearn();
      var cr = getCushionRect();
      log('🛡️ BANTALAN BELAJAR vs DIPAKAI:');
      [['xmin', 'KIRI', cr.xmin], ['xmax', 'KANAN', cr.xmax], ['ymin', 'ATAS', cr.ymin], ['ymax', 'BAWAH', cr.ymax]].forEach(function (e) {
        var key = e[0], name = e[1], cur = e[2];
        var a = avg(S.cushLearn[key]);
        if (a === null) { log('  ' + name + ': belum ada data (main dulu biar memantul)'); return; }
        var d = Math.abs(a - cur);
        log('  ' + name + ': belajar=' + a.toFixed(1) + '[' + S.cushLearn[key].length + 'x] vs pakai=' + cur.toFixed(1) + ' selisih=' + d.toFixed(1) + (d < 5 ? ' ✓' : ' ⚠ JAUH'));
      });
    }
    // ===== v2.5: DETEKSI POCKET DARI HEAP (ala mod Arab: baca mPockets langsung dari memory) =====
    // Mod Arab tidak percaya angka hardcode — dia baca array 6 pocket LIVE dari memory game
    // (GameManager -> Table -> TableProperties+0x68 -> Vec2d[6]).
    // Versi WASM: kita scan heap f64 cari 12 nilai berurutan yang membentuk 6 pasang pocket.
    // Kalau ketemu, FIXED_POCKETS di-set dari HASIL BACAAN ASLI — tidak tergantung kalibrasi,
    // tidak akan "pindah" lagi.
    // v2.58 DIHAPUS (auto-run): detectPocketsHeap (scan f64 240MB). Pocket
    // pakai konstanta Steel + kalibrasi profil meja. Tombol debug manual:
    // DEBUG GETTER / CEK POCKET OTOMATIS (geometris, tanpa scan heap).
    function detectPocketsHeap() { log('v2.58: detectPocketsHeap NONAKTIF (scan heap dihapus).'); return null; }
    function detectPocketsGeometric() {
      var h = null;
      try { h = heapViews(); } catch (e) {}
      if (!h || !h.f64) { log('📐 DETEKSI GEOMETRI: heap tidak tersedia'); return null; }
      var f64 = h.f64, n = f64.length;
      var limit = Math.min(n - 12, 30000000);
      var checked = 0;
      for (var i = 0; i < limit; i++) {
        var pairs = [], valid = true;
        for (var j = 0; j < 6; j++) {
          var x = f64[i + j * 2], y = f64[i + j * 2 + 1];
          if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 160 || Math.abs(y) > 100) { valid = false; break; }
          if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01) { valid = false; break; }
          pairs.push([x, y]);
        }
        if (!valid) continue;
        var corners = [], sides = [];
        for (var k = 0; k < 6; k++) {
          var px = pairs[k][0], py = pairs[k][1];
          if (Math.abs(px) > 80 && Math.abs(py) > 40) corners.push(pairs[k]);
          else if (Math.abs(px) < 40 && Math.abs(py) > 50) sides.push(pairs[k]);
        }
        if (corners.length !== 4 || sides.length !== 2) continue;
        checked++;
        var ok = true;
        for (var c = 0; c < 4 && ok; c++) {
          var cx = corners[c][0], cy = corners[c][1];
          var mirrors = [[-cx, cy], [cx, -cy], [-cx, -cy]];
          for (var m = 0; m < 3; m++) {
            var found = false;
            for (var c2 = 0; c2 < 4; c2++) {
              if (Math.abs(corners[c2][0] - mirrors[m][0]) < 2 && Math.abs(corners[c2][1] - mirrors[m][1]) < 2) { found = true; break; }
            }
            if (!found) { ok = false; break; }
          }
        }
        if (ok) {
          var s0x = sides[0][0], s0y = sides[0][1], s1x = sides[1][0], s1y = sides[1][1];
          var symSide = (Math.abs(s0x - s1x) < 2 && Math.abs(s0y + s1y) < 2) ||
                        (Math.abs(s0x + s1x) < 2 && Math.abs(s0y - s1y) < 2);
          if (!symSide) ok = false;
        }
        if (ok) {
          log('📐 DETEKSI GEOMETRI: KETEMU di f64 idx=' + i + ' (cek ' + checked + ' kandidat)');
          log('📐 Pocket: ' + pairs.map(function (p) { return '(' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ')'; }).join(' '));
          return { idx: i, pairs: pairs };
        }
        if (checked > 500) {
          log('📐 DETEKSI GEOMETRI: >500 kandidat pola pocket tapi tidak simetris. Berhenti.');
          return null;
        }
      }
      log('📐 DETEKSI GEOMETRI: tidak ketemu pola 6 pocket simetris.');
      return null;
    }
    // v2.58 DIHAPUS: applyHeapPockets (pakai hasil scan heap).
    function applyHeapPockets() { log('v2.58: applyHeapPockets NONAKTIF — pocket dari konstanta Steel / profil meja.'); return false; }
    // v2.58 DIHAPUS: detectTableBoundsHeap (scan heap).
    function detectTableBoundsHeap() { log('v2.58: detectTableBoundsHeap NONAKTIF.'); return null; }
    // v2.58 DIHAPUS: detectPocketRadiusHeap (scan heap).
    function detectPocketRadiusHeap(pocketIdx) { log('v2.58: detectPocketRadiusHeap NONAKTIF.'); return null; }
    // v2.58 DIHAPUS: detectCushionLinesHeap (scan heap).
    function detectCushionLinesHeap() { log('v2.58: detectCushionLinesHeap NONAKTIF.'); return null; }
    // v2.58 DIHAPUS: applyHeapCushionLines (pakai hasil scan heap).
    function applyHeapCushionLines() { log('v2.58: applyHeapCushionLines NONAKTIF — bantalan dari kalibrasi profil meja.'); return false; }
    // v2.58 DIHAPUS: applyHeapTable (pakai hasil scan heap).
    function applyHeapTable() { log('v2.58: applyHeapTable NONAKTIF.'); return false; }
    function solveShotV2(balls, pockets, R, group, allowBank, pocketWidth) {
      var cands = null;
      try { cands = solveShot(balls, pockets, R, group, allowBank, pocketWidth, true); } catch (e) { cands = null; }
      if (!cands || !cands.length) return null;
      // v2.58 DEFECT 2: anggaran sim — pickShot harus kembali dalam waktu
      // TERBATAS (target <2 detik). Dulu sweep power + robustness tanpa
      // batas: satu kandidat NaN bikin sim hang >30 detik / OOM (probe12
      // run 1: driver OOM 2043 MB). Anggaran: 1500 ms wall-clock + max 60
      // panggilan sim; kalau habis -> fallback geometri (validated=false,
      // display saja — shootNext tidak menembak; tick berikutnya mencoba
      // lagi dengan anggaran baru).
      var simT0 = Date.now(), simCalls = 0, simBudgetMs = 1500, simCallMax = 60;
      function simTimeLeft() { return simBudgetMs - (Date.now() - simT0); }
      function simOverBudget() { return simCalls >= simCallMax || simTimeLeft() <= 0; }
      // v2.58: cueIdx dulu -1 selamanya (cue = balls[-1] = undefined) —
      // physicsShotPower di fallback display selalu throw (ditangkap e7).
      // Sekarang dicari beneran, seperti di solveShot.
      var cueIdx = -1, _i;
      for (_i = 0; _i < balls.length; _i++) if (balls[_i].cue || balls[_i].num === 0) { cueIdx = _i; break; }
      var cue = cueIdx >= 0 ? balls[cueIdx] : null;
      var sim = null;
      try { sim = new PoolSim(); } catch (e2) { return cands[0]; }
      // v2.58 SPIN ala AKWeb: english [x,y] unit disk, dipilih PER TEMBAKAN.
      // - Setter english belum diketahui build ini (S.englishKnown false)
      //   -> spin SELALU (0,0): JANGAN simulasikan spin yang tidak akan
      //   diterapkan game (itu yang bikin garis prediksi meleset kalau
      //   tombol SPIN manual nyala — sim pakai spin, game tidak).
      // - Manual override: kalau user menekan tombol SPIN (S.spinX/spinY
      //   != 0), sweep pakai spin manual itu (dan commit menerapkannya).
      // - Kalau tidak ada override: sweep pakai (0,0); sesudah menang,
      //   stage-2 di bawah mencoba spin posisi (y=+-0.5).
      //   Break: (0,0) selalu (aturan AKWeb).
      var manualSpin = { x: (S.spinX || 0) * (S.cueSpinMult || 1), y: (S.spinY || 0) * (S.cueSpinMult || 1) };
      // v2.58 CLAMP english ala AKWeb (hypot <= 1): sim jangan pakai
      // spin yang game tidak akan terapkan (mis. cueSpinMult besar).
      var _msh = Math.hypot(manualSpin.x, manualSpin.y); if (_msh > 1) { manualSpin = { x: manualSpin.x / _msh, y: manualSpin.y / _msh }; }
      var spinKnown = !!S.englishKnown;
      var spin = { x: 0, y: 0 };
      if (spinKnown && (manualSpin.x !== 0 || manualSpin.y !== 0)) spin = manualSpin;
      var spinManual = (spin.x !== 0 || spin.y !== 0);
      var mx = S.cueMaxPower || 306;
      // v2.59 TOP MIX: sim tidak boleh cuma mencoba 3 direct teratas —
      // kalau ketiganya gagal, bank/kick/combo yang valid tidak pernah
      // dicoba ("ga nemu lobang" padahal ada jalan alternatif — defect
      // v2.58: solveShotV2(allowBank=false) mengembalikan disp
      // unvalidated, pickShot langsung return, fase bank tidak jalan).
      // Ambil 3 direct terbaik + 3 non-direct terbaik (bank/kick/combo),
      // dedupe. allowBank=false -> direct saja (PANTUL OFF).
      var top = [], _seenTop = {};
      function _pushTop(list, n) {
        var cnt = 0;
        for (var _ti = 0; _ti < list.length && cnt < n; _ti++) {
          var _cc = list[_ti];
          var _key = _cc.targetIdx + '|' + _cc.pocket.x + ',' + _cc.pocket.y + '|' + (_cc.combo ? 'C' + _cc.comboNum : (_cc.bank ? 'B' : (_cc.kick ? 'K' : 'D')));
          if (_seenTop[_key]) continue;
          _seenTop[_key] = 1; top.push(_cc); cnt++;
        }
      }
      var _directList = cands.filter(function (c) { return !c.bank && !c.kick && !c.combo; });
      var _altList = cands.filter(function (c) { return c.bank || c.kick || c.combo; });
      _pushTop(_directList, 3);
      if (allowBank) _pushTop(_altList, 3);
      var best = null, bestScore = Infinity, simRusak = false;
      // v2.59 DIAG: berapa kandidat dicoba / tervalidasi per jenis —
      // ditempel ke kandidat kembali supaya panel DIAG bisa bilang
      // "sudah coba N jalan alternatif".
      var simStats = { tried: 0, validated: 0, byType: { direct: 0, bank: 0, kick: 0, combo: 0 } };
      // v2.58 DEFECT 1+2: jangan simulasikan kandidat non-finite — sudut
      // NaN masuk sim = hang/OOM. (solveShot sudah memfilter; ini lapis
      // kedua untuk kandidat dari jalur lain.)
      top = top.filter(function (c) {
        return isFinite(c.angle) && isFinite(c.score) && isFinite(c.power)
          && isFinite(c.ghost[0]) && isFinite(c.ghost[1]);
      });
      // v2.41: PANTUL OFF = jangan pernah pertimbangkan bank/kick, walau lolos sim.
      if (!allowBank) top = top.filter(function (c) { return !c.bank && !c.kick; });
      if (!top.length) return null;
      for (_i = 0; _i < top.length; _i++) {
        var c = top[_i];
        var targetNum = balls[c.targetIdx].num;
        // v2.59 COMBO: bola yang harus MASUK = B (comboNum), bola yang
        // PERTAMA kena cue = A (targetIdx). Direct/bank/kick: keduanya
        // = target. firstNum dipakai badFirstHit + checkClearPaths.
        var potNum = c.combo ? c.comboNum : targetNum;
        var firstNum = targetNum;
        var cType = c.combo ? 'combo' : (c.bank ? 'bank' : (c.kick ? 'kick' : 'direct'));
        simStats.tried++;
        // v2.59 POWER IKUT GARIS: coba dulu power FISIKA physicsShotPower
        // (yang dipakai garis prediksi display) — power eksekusi harus
        // sama dengan power yang digambar, dan berada di TENGAH jendela
        // valid, bukan di tepi lembut. Sweep naik 150.. mengambil power
        // PALING LEMBUT yang lolos = tepi jendela, rapuh terhadap selisih
        // skala sim-vs-game (v2.62: skala sudah terkalibrasi live,
        // cueMaxPower 306).
        // Kalau power fisika tidak lolos / tidak robust, sweep naik seperti dulu.
        // v2.62 MARGIN KECIL: skala power sudah benar (kalibrasi live
        // cueMaxPower 306), jadi sweep cukup coba 1.1x power fisika
        // dulu (sisa kecepatan untuk masuk saku), lalu power fisika.
        // Margin 1.25x v2.61 dicabut — dengan skala yang benar, 1.25x
        // kebanyakan dan kandidatnya sering ditolak validasi sim.
        var powers = [];
        if (cue) {
          try {
            var pPhys = physicsShotPower(cue, c.ghost, c.pocket);
            if (isFinite(pPhys)) {
              [1.1, 1.0].forEach(function (m) {
                var pm = Math.round(pPhys * m);
                if (pm >= 150 && pm <= mx) powers.push(pm);
              });
            }
          } catch (ePP2) {}
        }
        for (var pp = 150; pp <= mx; pp += 50) powers.push(pp);
        powers.push(mx);
        var seen = {}, uniqP = [];
        for (var qi = 0; qi < powers.length; qi++) { var rp = Math.round(powers[qi]); if (!seen[rp]) { seen[rp] = 1; uniqP.push(rp); } }
        var won = null;
        for (var pi2 = 0; pi2 < uniqP.length; pi2++) {
          if (simOverBudget()) break; // v2.58 DEFECT 2: anggaran sim habis -> berhenti sweep
          var spw = uniqP[pi2], res = null;
          try {
            var simBalls = balls.map(function (b, bi) {
              var n = (bi === cueIdx) ? 0 : (b.num === null || b.num === undefined ? -1 : b.num);
              return { x: b.x, y: b.y, number: n, state: 1 };
            });
            simCalls++; // v2.58 DEFECT 2: hitung panggilan sim
            res = sim.simulate({ balls: simBalls, shotAngle: c.angle, shotPower: spw, shotSpin: spin });
          } catch (e3) { simRusak = true; break; }
          if (validateSimRes(res, potNum, group, firstNum)) {
            // v2.31: ROBUSTNESS CHECK — tembakan harus tetap masuk walau ada
            // sedikit error (±1.5° sudut, ±8% power). Kalau cuma masuk di kondisi
            // ideal, TOLAK (ini obat "line prediksi masuk tapi eksekusi gagal").
            if (isRobustShot(balls, c.angle, spw, spin, potNum, group, sim, simTimeLeft, firstNum)) {
              won = { power: spw, res: res }; break;
            } else {
              try { log('🛡️ ROBUSTNESS: tembakan bola ' + potNum + ' ditolak (tidak tahan error)'); } catch (e) {}
            }
          }
        }
        if (simRusak) break;
        if (won) {
          simStats.validated++; simStats.byType[cType]++;
          // v2.58: SPIN POSISI (stage 2) — coba y=+-0.5 di power yang sama.
          // Diadopsi HANYA kalau tetap tervalidasi sim DAN posisi akhir
          // putih lebih dekat > 10 unit ke bola grup berikut (margin
          // jelas, bukan noise). Kalau tidak ada perbaikan, tetap (0,0).
          // Syarat: bukan override manual, setter diketahui, grup sudah
          // ditentukan, bukan rack break (16 bola), anggaran sim cukup.
          var chosenSpin = spin;
          if (!spinManual && spinKnown && balls.length < 15 && typeof S !== 'undefined' && S.group && potNum !== 8 && won.res.balls && !simOverBudget()) {
            try {
              var cueFin0 = null;
              for (var kk0 = 0; kk0 < won.res.balls.length; kk0++) { var bb0 = won.res.balls[kk0]; if (bb0.number === 0 && bb0.positions && bb0.positions.length) { var lp0 = bb0.positions[bb0.positions.length - 1]; cueFin0 = { x: lp0.x, y: lp0.y }; break; } }
              if (cueFin0) {
                var nd0 = Infinity;
                for (var kk1 = 0; kk1 < balls.length; kk1++) { var bn1 = balls[kk1].num; if (kk1 === c.targetIdx || bn1 === null || bn1 === 0 || bn1 === 8) continue; if (S.group === 'solid' && !(bn1 >= 1 && bn1 <= 7)) continue; if (S.group === 'stripe' && !(bn1 >= 9 && bn1 <= 15)) continue; if (won.res.pocketedNumbers.indexOf(bn1) >= 0) continue; var dd1 = Math.hypot(balls[kk1].x - cueFin0.x, balls[kk1].y - cueFin0.y); if (dd1 < nd0) nd0 = dd1; }
                if (isFinite(nd0)) {
                  var spinTry = [{ x: 0, y: 0.5 }, { x: 0, y: -0.5 }];
                  var bestSpinGain = 10; // butuh perbaikan > 10 unit
                  for (var si = 0; si < spinTry.length; si++) {
                    if (simOverBudget()) break;
                    var sres = null;
                    try {
                      var sb2 = balls.map(function (b, bi) { var n = (bi === cueIdx) ? 0 : (b.num === null || b.num === undefined ? -1 : b.num); return { x: b.x, y: b.y, number: n, state: 1 }; });
                      simCalls++;
                      sres = sim.simulate({ balls: sb2, shotAngle: c.angle, shotPower: won.power, shotSpin: spinTry[si] });
                    } catch (eST) { sres = null; }
                    if (!sres || !validateSimRes(sres, potNum, group, firstNum)) continue;
                    var cfS = null;
                    for (var kk2 = 0; kk2 < sres.balls.length; kk2++) { var bbS = sres.balls[kk2]; if (bbS.number === 0 && bbS.positions && bbS.positions.length) { var lpS = bbS.positions[bbS.positions.length - 1]; cfS = { x: lpS.x, y: lpS.y }; break; } }
                    if (!cfS) continue;
                    var ndS = Infinity;
                    for (var kk3 = 0; kk3 < balls.length; kk3++) { var bn3 = balls[kk3].num; if (kk3 === c.targetIdx || bn3 === null || bn3 === 0 || bn3 === 8) continue; if (S.group === 'solid' && !(bn3 >= 1 && bn3 <= 7)) continue; if (S.group === 'stripe' && !(bn3 >= 9 && bn3 <= 15)) continue; if (sres.pocketedNumbers.indexOf(bn3) >= 0) continue; var dd3 = Math.hypot(balls[kk3].x - cfS.x, balls[kk3].y - cfS.y); if (dd3 < ndS) ndS = dd3; }
                    if (isFinite(ndS) && (nd0 - ndS) > bestSpinGain) { bestSpinGain = nd0 - ndS; chosenSpin = spinTry[si]; won.res = sres; }
                  }
                }
              }
            } catch (eSP) {}
          }
          var s = c.score - 12000 - won.res.pocketedNumbers.length * 1000;
          // v2.11: penalti anti-bantalan — pilih jalur yang bersih.
          try {
            var tgtBall = balls[c.targetIdx];
            s += cushionPenalty(tgtBall, c.pocket);
          } catch (eCP) {}
          // v2.43: BONUS BERUNTUN (position play) — pilih tembakan yang
          // meninggalkan bola putih DEKAT bola grup berikutnya, supaya bisa
          // beruntun (runout) tanpa tembakan jauh. Hanya kalau grup sudah
          // ditentukan dan masih ada bola grup lain (bukan bola 8 terakhir).
          try {
            if (typeof S !== 'undefined' && S.group && potNum !== 8 && won.res.balls) {
              var cueFin = null, kk;
              for (kk = 0; kk < won.res.balls.length; kk++) {
                var bb2 = won.res.balls[kk];
                if (bb2.number === 0 && bb2.positions && bb2.positions.length) { var lp = bb2.positions[bb2.positions.length - 1]; cueFin = { x: lp.x, y: lp.y }; break; }
              }
              if (cueFin) {
                var nd = Infinity;
                for (kk = 0; kk < balls.length; kk++) {
                  var bn = balls[kk].num;
                  if (kk === c.targetIdx || bn === null || bn === 0 || bn === 8) continue;
                  if (S.group === 'solid' && !(bn >= 1 && bn <= 7)) continue;
                  if (S.group === 'stripe' && !(bn >= 9 && bn <= 15)) continue;
                  if (won.res.pocketedNumbers.indexOf(bn) >= 0) continue; // ikut masuk = bukan target berikut
                  var dd = Math.hypot(balls[kk].x - cueFin.x, balls[kk].y - cueFin.y);
                  if (dd < nd) nd = dd;
                }
                if (isFinite(nd)) s += nd * 0.15; // makin dekat bola berikut, makin bagus
              }
            }
          } catch (ePP) {}
          c.simScore = s; c.simRes = won.res; c.spin = chosenSpin;
          c.power = simPowerToUI(won.power); c.simPower = won.power;
          if (s < bestScore) { bestScore = s; best = c; }
        }
        // kandidat yang tidak lolos di semua power -> DITOLAK (tidak ditembak)
      }
      if (simRusak) { try { log('v2.2 SIM error, fallback geometri (TIDAK tervalidasi — tidak ditembak otomatis).'); } catch (e4) {} return cands[0]; }
      // v2.2: garis prediksi SELALU ada (ala Arab) — sim display terpisah dari
      // keputusan tembak. Kandidat terbaik geometri selalu dapat simRes untuk
      // digambar, walau tembakannya tidak divalidasi.
      var disp = cands[0];
      if (!disp.simRes && !simOverBudget()) { // v2.58 DEFECT 2: jangan mulai sim display kalau anggaran habis
        try {
          var dbs = balls.map(function (b, bi) {
            var n = (bi === cueIdx) ? 0 : (b.num === null || b.num === undefined ? -1 : b.num);
            return { x: b.x, y: b.y, number: n, state: 1 };
          });
          var dsp = physicsShotPower(cue, disp.ghost, disp.pocket);
          simCalls++; // v2.58 DEFECT 2: hitung panggilan sim
          disp.simRes = sim.simulate({ balls: dbs, shotAngle: disp.angle, shotPower: dsp, shotSpin: spin });
          disp.simPower = dsp;
          if (!disp.power) disp.power = simPowerToUI(dsp);
        } catch (e7) {}
      }
      disp.validated = !!best;
      disp.simStats = simStats; // v2.59: DIAG bisa laporkan jalan alternatif yang dicoba
      if (best) { try { log('v2.2 SIM OK: target ' + balls[best.targetIdx].num + ' powerSim=' + Math.round(best.simPower) + ' -> UI ' + best.power.toFixed(0) + ' (spin ' + (best.spin ? best.spin.x.toFixed(2) : '0') + ',' + (best.spin ? best.spin.y.toFixed(2) : '0') + ')'); } catch (e5) {} best.validated = true; best.simStats = simStats; }
      else { try { log('v2.2 SIM: tidak ada tembakan VALID (3 kandidat x sweep power ditolak) — garis prediksi tetap ditampilkan, tidak ditembak.'); } catch (e6) {} }
      return best || disp; // validated=true -> boleh tembak; false -> cuma display
    }
    function pickShot(balls, pockets, R, group, allowBank, pocketWidth, noSim) {
      // v2.43: DUA FASE — fase 1 tembakan LANGSUNG dulu (tanpa pantul); fase 2
      // baru coba PANTUL kalau tidak ada tembakan langsung yang valid.
      // (User: pantul boleh kalau solver belum menemukan lubang yang cocok.)
      // v2.41: noSim=true = geometri saja (untuk gambar garis display di
      // refreshOverlay — jangan jalankan sim tiap 3 detik, itu biang patah-patah).
      // v2.59 DEFECT "ga nemu lobang": fase 1 dulu mengembalikan disp
      // UNVALIDATED (truthy) begitu ada kandidat geometri — `if (v2)`
      // langsung return, fase bank TIDAK PERNAH jalan. Sekarang: fase 1
      // hanya menang kalau ada tembakan TERVALIDASI sim; kalau tidak,
      // jatuh ke fase bank/kick/combo, baru ke fallback geometri display.
      if (!noSim && typeof S !== 'undefined' && S.useSim) {
        try { var v2 = solveShotV2(balls, pockets, R, group, false, pocketWidth); if (v2 && v2.validated) return v2; } catch (e) {}
        if (allowBank) {
          try { var v2b = solveShotV2(balls, pockets, R, group, true, pocketWidth); if (v2b && v2b.validated) { v2b.isBankFallback = true; try { log('🎱 PANTUL fallback: tidak ada tembakan langsung yang valid, coba pantul...'); } catch (e2) {} return v2b; } } catch (e3) {}
        }
      }
      var g = solveShot(balls, pockets, R, group, allowBank, pocketWidth);
      // v2.41: JANGAN beri label validated pada fallback geometri. Dulu
      // g.validated = true di sini → autoplay menembak tembakan yang sim-nya
      // sudah TOLAK semua (obat "pantul ga jelas bikin kalah"). Garis tetap
      // digambar (drawShot), tapi shootNext tidak akan menembak tanpa validated.
      return g;
    }

    // v2.58 DIHAPUS: readLearnedBalls (fase belajar). Bola dibaca via getter
    // dynCall di readGetterBalls() — lihat modul AKWeb v2.58 di bawah heapViews().
    function readLearnedBalls(f64, i32, learned, numberDelta) { return { balls: [], missing: [] }; }
    /*__PURE_END__*/
    var IS_PROD = (location.hostname === 'prod-web-pool.miniclip.com' || /\.pool\.miniclippt\.com$/.test(location.hostname));
    var S = { mode: 'off', group: null, gameMode: '8', allowBank: true, deteksiOtomatis: true, shooting: false, lastScan: null, lastShot: null, lastCanvas: null, autoBeruntun: true, autoUserOff: false, autoStableCount: 0, diagTick: 0, autoTickCount: 0, stillSince: 0, stillLastBalls: null, holdReason: '', lastPick: null, lastShot: null, diagGate: null, diagGateAt: 0, autoLastBalls: null, autoWaiting: false, autoPreShotNums: null, calMode: false, calSel: 0, nudgeStep: 4, useSim: true, camMode: false, camSel: 0, camDetected: null,
      // v2.1: statistik cue (ala Almarou3: CUE_PROPERTIES_MAX_POWER & CUE_PROPERTIES_SPIN)
      cueMaxPower: 306, cueSpinMult: 1.0, spinX: 0, spinY: 0, cueMaxLive: null, englishKnown: false,
      // v2.2: CUE AUTO-TUNE — tidak perlu setting manual, belajar dari hasil tembakan
      cueAuto: true, tunePre: null, tuneShot: null,
      // v2.1: autoplay kontinu — tidak pernah auto-off
      oppWait: false, oppMoved: false, oppWaitStart: 0, oppLastBalls: null,
      waitChange: false, waitChangeBalls: null, waitChangeSince: 0, autoPhase: '',
      ticking: false, fastTimer: null, fastStable: 0, fastLastBalls: null,
      // v2.58: telemetri DIHAPUS (log lokal saja, tanpa webhook).
      // v2.4: POCKET LEARN — belajar posisi lubang dari bola yang beneran masuk
      pokLearn: null, trail: null,
      // v2.7: TUNGGU LAWAN bisa dimatikan (untuk latihan solo / lawan AFK)
      waitOpp: true,
      // v2.8: CUSHION LEARN — belajar posisi bantalan dari bola yang beneran memantul
      cushLearn: null,
      // v2.10: flag break — bola masuk pas break TIDAK menentukan grup
      breakDone: false,
      // v2.46: flag validasi rack — validasi rack cuma boleh memicu deteksi
      // ulang 1x per meja. Kalau posisi MASIH kesebar sesudah deteksi ulang =
      // break sudah terjadi (bukan array stale) -> breakDone=true, loop berhenti.
      rackValidated: false,
      // v2.16: LINE BEKU — garis diam sampai bola berhenti, baru clear + gambar baru
      linesFrozen: false,
      // v2.16: AIM MANUAL — line prediksi ngikutin arah jari (tembak manual)
      manualAim: false, manualAimHandler: null,
      // v2.19: SEMUA GARIS ala AKWeb — garis warna-warni untuk semua bola sekaligus
      allLines: false };
    function $(id) { return document.getElementById(id); }
    function log(m) {
      var el = $('akv2Log');
      if (el) el.textContent = (new Date().toLocaleTimeString() + ' ' + m + '\n' + el.textContent).slice(0, 12000);
      try { console.log('[AKV2] ' + m); } catch (e) {}
    }
    // ===== v2.58: TELEMETRI DIHAPUS (telSend/telFlushLogs/telStatus/telUpdateBtn
    // diganti stub no-op; semua log hanya lokal via log()/console). =====
    function telSend(obj) { return; }
    function telFlushLogs() { return; }
    function telStatus() { return; }
    function telUpdateBtn() { return; }
    function stat(m) { var el = $('akv2Stat'); if (el) el.textContent = m; }
    function buildPanel() {
      if ($('akv2')) return;
      var p = document.createElement('div');
      p.id = 'akv2';
      p.style.cssText = 'position:fixed;top:68px;right:8px;z-index:2147483000;touch-action:manipulation;-webkit-tap-highlight-color:transparent;width:300px;max-height:92vh;overflow-y:auto;background:#FFF6E5;color:#111;font:bold 13px Arial,sans-serif;padding:10px;border:3px solid #111;border-radius:12px;box-shadow:4px 4px 0 #111;box-sizing:border-box';
      p.innerHTML =
        '<div id="akv2Head" style="text-align:center;font-family:Arial Black,Arial,sans-serif;font-size:15px">🎱 SOLVER HEAP SERIUS <span style="background:#FF0;padding:2px 6px;border-radius:6px;font-size:12px">v2.63</span><button id="akv2ResetPos" title="Reset posisi panel" style="min-width:36px;min-height:36px;font-size:16px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#4ECDC4;color:#fff;margin-right:4px">⌂</button><button id="akv2Close" style="float:right;min-width:36px;min-height:36px;font-size:18px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FF6B6B;color:#fff">✕</button><br><span style="font-size:11px;font-family:Arial,sans-serif">getter dynCall + scan heap fallback + pointer tracking + tembak dynCall + drag fallback ala AKWeb. Tutup dengan ✕, buka lagi dengan ikon 🎱.</span></div>' +
        '<button id="akv2LinePreview" style="width:100%;min-height:52px;font-weight:bold;font-size:16px;border:3px solid #111;border-radius:10px;background:#E1BEE7;box-shadow:2px 2px 0 #111;margin-top:8px">🎯 LINE PREVIEW: ON</button>' +
        '<button id="akv2AutoplayBtn" style="width:100%;min-height:52px;font-weight:bold;font-size:16px;border:3px solid #111;border-radius:10px;background:#59D977;box-shadow:2px 2px 0 #111;margin-top:6px">▶️ AUTO PLAY: OFF</button>' +
        '<button id="akv2MatchBaru" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FF9800;color:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🔄 MATCH BARU</button>' +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
        '<button id="akv2Polos" style="flex:1;min-height:44px;font-weight:bold;font-size:14px;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111">🎱 1-7<br><span style="font-size:10px">POLOS</span></button>' +
        '<button id="akv2Garis" style="flex:1;min-height:44px;font-weight:bold;font-size:14px;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111">🎱 9-15<br><span style="font-size:10px">GARIS</span></button>' +
        '</div>' +
        '<div style="display:flex;gap:4px;margin-top:6px">' +
        '<button id="akv2Mode8" style="flex:1;min-height:40px;font-weight:bold;font-size:13px;border:3px solid #111;border-radius:10px;background:#4CAF50;color:#fff;box-shadow:2px 2px 0 #111">🎱 8-BALL</button>' +
        '<button id="akv2Mode9" style="flex:1;min-height:40px;font-weight:bold;font-size:13px;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111">🎱 9-BALL<br><span style="font-size:9px">URUT</span></button>' +
        '</div>' +

        '<div id="akv2Stat" style="font-size:11px;line-height:1.5;margin:8px 0;color:#333">Menunggu game...</div>' +
        '<div id="akv2GetterStat" style="font-size:11px;line-height:1.5;margin:0 0 8px;color:#333">GETTER: belum dibaca.</div>' +
        '<div id="akv2Diag" style="font-size:11px;line-height:1.5;margin:0 0 8px;padding:6px;background:#111;color:#7CFC00;border-radius:8px;white-space:pre-wrap;word-break:break-word">DIAG AUTOPLAY: menunggu tick...</div>' +
        '<button id="akv2Save" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🔍 DEBUG GETTER (baca bola via dynCall)</button>' +
        '<button id="akv2AutoDetect" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#59D977;box-shadow:2px 2px 0 #111;margin-top:6px">🔍 BACA BOLA (getter, tanpa scan)</button>' +

        '<button id="akv2TesGambar" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">TES GAMBAR (lingkaran bola + pocket)</button>' +
        '<button id="akv2CekPocket" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FFDC58;box-shadow:2px 2px 0 #111;margin-top:6px">\uD83C\uDFAF CEK POCKET OTOMATIS</button>' +
        '<button id="akv2PokAsli" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#59D977;box-shadow:2px 2px 0 #111;margin-top:6px">🎯 POCKET ASLI GAME (1 tap)</button>' +
        '<button id="akv2PokHeap" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#7FD4FF;box-shadow:2px 2px 0 #111;margin-top:6px">🎯 POCKET HEAP (nonaktif v2.58)</button>' +
        '<button id="akv2BanHeap" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FFB066;box-shadow:2px 2px 0 #111;margin-top:6px">🛡️ BANTALAN HEAP (nonaktif v2.58)</button>' +
        '<button id="akv2CushLines" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#B2DFDB;box-shadow:2px 2px 0 #111;margin-top:6px">🛡️ GARIS BANTALAN DARI HEAP</button>' +
        '<button id="akv2BanBelajar" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🛡️ CEK BANTALAN BELAJAR</button>' +
        '<button id="akv2PokBelajar" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">📊 CEK POCKET BELAJAR</button>' +
        '<button id="akv2CamPocket" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">\uD83D\uDCF7 KAMERA POCKET: OFF</button>' +
        '<div id="akv2CamRow" style="display:none;gap:4px;margin-top:6px;align-items:center">' +
        '<button id="akv2CamPrev" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">&#9664;</button>' +
        '<span id="akv2CamName" style="flex:1;text-align:center;font-family:Arial Black,Arial,sans-serif;font-size:14px">TL</span>' +
        '<button id="akv2CamNext" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">&#9654;</button>' +
        '<button id="akv2CamDetect" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#FFDC58">\uD83D\uDD0D</button>' +
        '<button id="akv2CamSave" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#59D977">\uD83D\uDCBE</button></div>' +
        '<div style="display:flex;gap:4px;margin-top:6px;align-items:center">' +
        '<span style="font-size:11px">Kalibrasi:</span>' +
        '<button id="akv2CalL" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">&#9664;</button>' +
        '<button id="akv2CalU" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">&#9650;</button>' +
        '<button id="akv2CalD" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">&#9660;</button>' +
        '<button id="akv2CalR" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">&#9654;</button>' +
        '<button id="akv2CalX" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#FF6B6B;color:#fff">R</button>' +
        '<button id="akv2Step" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#FFDC58;font-size:11px">STEP 4px</button></div>' +
        '<button id="akv2CalAll" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🎯 KALIBRASI (POCKET+BANTALAN): OFF</button>' +
        '<div id="akv2CalRow" style="display:none;gap:4px;margin-top:6px;align-items:center">' +
        '<button id="akv2CalPrev" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">&#9664;</button>' +
        '<span id="akv2CalName" style="flex:1;text-align:center;font-family:Arial Black,Arial,sans-serif;font-size:14px">TL</span>' +
        '<button id="akv2CalNext" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">&#9654;</button>' +
        '<button id="akv2CalSave" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#59D977">💾</button>' +
        '<button id="akv2CalReset" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#FF6B6B;color:#fff">↺</button></div>' +
        '<div style="display:flex;gap:4px;margin-top:6px;align-items:center">' +
        '<span style="font-size:11px;font-weight:bold">Meja:</span>' +
        '<button id="akv2ProfPrev" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">&#9664;</button>' +
        '<span id="akv2ProfName" style="flex:1;text-align:center;font-family:Arial Black,Arial,sans-serif;font-size:13px">MEJA 1</span>' +
        '<button id="akv2ProfNext" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">&#9654;</button>' +
        '<button id="akv2ProfScan" title="Cek aset meja" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">🔍</button></div>' +
        '<button id="akv2Deteksi" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#59D977;box-shadow:2px 2px 0 #111;margin-top:6px">DETEKSI OTOMATIS: ON</button>' +
        '<button id="akv2Learn" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🛡️ DEBUG COMMIT GATE</button>' +
        '<button id="akv2Shoot" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FF6B6B;color:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🎯 TEMBAK dynCall (1x, via plan)</button>' +
        '<button id="akv2Giliran" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#59D977;box-shadow:2px 2px 0 #111;margin-top:6px">AUTO GILIRAN (tanpa SCAN, baca instan)</button>' +
        '<button id="akv2Beruntun" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FFDC58;box-shadow:2px 2px 0 #111;margin-top:6px">AUTO BERUNTUN: OFF</button>' +
        '<button id="akv2Autoplay" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FF6B6B;color:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">▶ AUTOPLAY: OFF</button>' +
        '<button id="akv2WaitOpp" style="width:100%;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#FFE066;margin-top:4px">⏳ TUNGGU LAWAN: ON</button>' +
        '<button id="akv2Gambar" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🖼 CEK GAMBAR BOLA (JSON/XML + URL)</button>' +
        '<div id="akv2LearnStat" style="font-size:11px;line-height:1.5;margin:8px 0 0;color:#333">GETTER v2.58: getter dynCall + scan heap fallback + pointer tracking (tanpa belajar).</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
        '<button id="akv2Polos" style="flex:1;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff">POLOS 1-7</button>' +
        '<button id="akv2Garis" style="flex:1;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff">GARIS 9-15</button>' +
        '<button id="akv2Buka" style="flex:1;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff">BUKA</button></div>' +
        '<button id="akv2Bank" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#59D977;box-shadow:2px 2px 0 #111;margin-top:6px">PANTUL: FALLBACK</button>' +
        '<div style="display:flex;gap:4px;margin-top:6px;align-items:center">' +
        '<span style="font-size:11px;font-weight:bold">⚡CUE:</span>' +
        '<span id="akv2CueVal" style="flex:1;text-align:center;font-family:Arial Black,Arial,sans-serif;font-size:14px">306 AUTO</span>' +
        '<button id="akv2CueMin" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">−</button>' +
        '<button id="akv2CuePlus" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">+</button>' +
        '<button id="akv2CueAuto" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#59D977">AUTO</button></div>' +
        '<div style="display:flex;gap:4px;margin-top:6px;align-items:center">' +
        '<span style="font-size:11px;font-weight:bold">SPIN:</span>' +
        '<button id="akv2SpinBtn" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">SPIN:0</button></div>' +
        '<button id="akv2Ntfy" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🔍 DEBUG GETTER</button>' +
        '<button id="akv2NtfyTopic" style="width:100%;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff;margin-top:4px;font-size:11px">🛡️ DEBUG COMMIT GATE</button>' +
        '<button id="akv2ManualAim" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#E1BEE7;box-shadow:2px 2px 0 #111;margin-top:6px">🎯 AIM MANUAL: OFF</button>' +
        '<button id="akv2AllLines" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FFE0B2;box-shadow:2px 2px 0 #111;margin-top:6px">🌈 SEMUA GARIS: OFF</button>' +
        '<pre id="akv2Log" style="white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.4;color:#111;margin:8px 0 0;max-height:280px;overflow-y:auto"></pre>' +
        '<div style="font-size:11px;color:#666;margin-top:6px">v2.13: 📐 DETEKSI GEOMETRI (pocket pindah). v2.12: 💥 AUTO-BREAK. v2.11: 🧠 OTAK ANTI-BANTALAN.</div>';
      (document.body || document.documentElement).appendChild(p);
      (function () {
        var icon = document.createElement('button');
        icon.id = 'akv2Icon';
        icon.textContent = '🎱';
        icon.style.cssText = 'position:fixed;top:8px;right:8px;z-index:1000000;width:52px;height:52px;font-size:28px;border:3px solid #111;border-radius:50%;background:#FFDC58;box-shadow:3px 3px 0 #111;box-sizing:border-box';
        (document.body || document.documentElement).appendChild(icon);
        icon.addEventListener('click', function () { p.style.display = (p.style.display === 'none') ? 'block' : 'none'; });
        var cl = $('akv2Close');
        if (cl) cl.addEventListener('click', function () { p.style.display = 'none'; });
        var rp = $('akv2ResetPos');
        if (rp) rp.addEventListener('click', function (e) {
          e.stopPropagation();
          try { localStorage.removeItem(PANEL_POS_KEY); } catch (e2) {}
          p.style.left = ''; p.style.top = ''; p.style.right = '8px';
          p.style.top = '68px';
          log('⌂ Posisi panel di-reset ke default.');
        });
        // Menu bisa digeser: tahan header lalu seret (posisi tersimpan per-konteks).
        (function () {
          var head = $('akv2Head');
          if (!head) return;
          head.style.cursor = 'move';
          try { head.style.touchAction = 'none'; } catch (e) {}
          var PANEL_POS_KEY = 'akv2panelpos_' + CAL_CTX;
          try {
            var pp = JSON.parse(localStorage.getItem(PANEL_POS_KEY) || 'null');
            if (pp && pp.x && pp.y) {
              var px = parseFloat(pp.x) || 0, py = parseFloat(pp.y) || 0;
              var vw = window.innerWidth || 800, vh = window.innerHeight || 600;
              // Kalau posisi kesimpen di luar layar, reset ke default
              if (px < -50 || py < -50 || px > vw - 50 || py > vh - 50) {
                try { localStorage.removeItem(PANEL_POS_KEY); } catch (e2) {}
              } else {
                p.style.left = pp.x; p.style.top = pp.y; p.style.right = 'auto';
              }
            }
          } catch (e) {}
          var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
          head.addEventListener('pointerdown', function (e) {
            if (e.target && e.target.id === 'akv2Close') return;
            dragging = true; sx = e.clientX; sy = e.clientY;
            var r = p.getBoundingClientRect(); ox = r.left; oy = r.top;
            p.style.left = ox + 'px'; p.style.top = oy + 'px'; p.style.right = 'auto';
            try { head.setPointerCapture(e.pointerId); } catch (e2) {}
            e.preventDefault();
          });
          head.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var nx = ox + e.clientX - sx, ny = oy + e.clientY - sy;
            var vw2 = window.innerWidth || 800, vh2 = window.innerHeight || 600;
            // Jangan sampai keluar layar
            nx = Math.max(-50, Math.min(nx, vw2 - 80));
            ny = Math.max(-50, Math.min(ny, vh2 - 80));
            p.style.left = nx + 'px';
            p.style.top = ny + 'px';
          });
          var endDrag = function () {
            if (!dragging) return;
            dragging = false;
            try { localStorage.setItem(PANEL_POS_KEY, JSON.stringify({ x: p.style.left, y: p.style.top })); } catch (e) {}
          };
          head.addEventListener('pointerup', endDrag);
          head.addEventListener('pointercancel', endDrag);
        })();
      })();
      $('akv2Save').addEventListener('click', function () { debugGetter(); });
      var maBtn = $('akv2ManualAim');
      if (maBtn) maBtn.addEventListener('click', function () { setManualAim(!S.manualAim); });
      var alBtn = $('akv2AllLines');
      if (alBtn) alBtn.addEventListener('click', function () { setAllLines(!S.allLines); });
      $('akv2AutoDetect').addEventListener('click', function () { var r = readGetterBalls(); if (r) { S.lastScan = { res: r, shot: null }; var sh = pickShot(r.balls, r.pockets, r.radius, S.group, S.allowBank, r.pocketWidth); S.lastScan.shot = sh; drawShot(sh, r); log('BACA BOLA getter: ' + r.balls.length + ' bola, hilang ' + r.missing.length); } else log('BACA BOLA getter gagal — lihat DEBUG GETTER.'); });
      var mbBtn = $('akv2MatchBaru');
      if (mbBtn) mbBtn.addEventListener('click', function () { matchBaru(); });
      // v2.26: handlers untuk tombol minimal
      var lpBtn = $('akv2LinePreview');
      if (lpBtn) lpBtn.addEventListener('click', function () { setLinePreview(!S.linePreview); });
      var apBtn = $('akv2AutoplayBtn');
      if (apBtn) apBtn.addEventListener('click', function () {
        try {
          var on = !S.autoBeruntun;
          setBeruntun(on, true);
          apBtn.textContent = '▶️ AUTO PLAY: ' + (on ? 'ON' : 'OFF');
          apBtn.style.background = on ? '#FF6B6B' : '#59D977';
          log('Auto play ' + (on ? 'ON' : 'OFF'));
        } catch (e) { log('Autoplay error: ' + e.message); }
      });
      // Update tombol saat setBeruntun dipanggil dari tempat lain
      var _origSetBeruntun = setBeruntun;
      setBeruntun = function(on, fromUser) {
        _origSetBeruntun(on, fromUser);
        try {
          var b = $('akv2AutoplayBtn');
          if (b) { b.textContent = '▶️ AUTO PLAY: ' + (on ? 'ON' : 'OFF'); b.style.background = on ? '#FF6B6B' : '#59D977'; }
        } catch (e) {}
      };
      $('akv2TesGambar').addEventListener('click', function () { tesGambar(); });
      $('akv2CekPocket').addEventListener('click', function () { verifyPockets(); });
      $('akv2PokAsli').addEventListener('click', function () { applyTruePockets(); });
      $('akv2PokHeap').addEventListener('click', function () { log('v2.58: deteksi pocket dari heap NONAKTIF — pocket pakai konstanta Steel + kalibrasi profil meja.'); });
      $('akv2BanHeap').addEventListener('click', function () { log('v2.58: deteksi bantalan dari heap NONAKTIF — bantalan pakai kalibrasi profil meja.'); });
      var clBtn = $('akv2CushLines');
      if (clBtn) clBtn.addEventListener('click', function () { log('v2.58: garis bantalan dari heap NONAKTIF.'); });
      $('akv2BanBelajar').addEventListener('click', function () { reportCushLearn(); });
      $('akv2PokBelajar').addEventListener('click', function () { reportPokLearn(); });
      $('akv2CamPocket').addEventListener('click', function () { camToggle(); });
      $('akv2CamPrev').addEventListener('click', function () { S.camSel = (S.camSel + 5) % 6; camNameUpd(); camPositionSquare(); });
      $('akv2CamNext').addEventListener('click', function () { S.camSel = (S.camSel + 1) % 6; camNameUpd(); camPositionSquare(); });
      $('akv2CamDetect').addEventListener('click', function () { camDetect(); });
      $('akv2CamSave').addEventListener('click', function () { camSave(); });
      var calRedraw = function () { if (S.lastScan && S.lastScan.res) drawShot(S.lastScan.shot || null, S.lastScan.res); else tesGambar(); };
      // Nudge: kalau mode KALIBRASI ON -> geser item terpilih (0-5 pocket, 6-9 tepi bantalan);
      // kalau tidak -> seluruh overlay. Besarnya langkah dari STEP (0.5/1/2/4px).
      var doNudge = function (dx, dy) {
        var st = S.nudgeStep;
        if (S.calMode) {
          if (S.calSel < 6) pocketNudge(dx * st, dy * st);
          else cushionNudge(dx * st, dy * st);
        } else calNudge(dx * st, dy * st);
        calRedraw();
      };
      $('akv2CalL').addEventListener('click', function () { doNudge(-1, 0); });
      $('akv2CalR').addEventListener('click', function () { doNudge(1, 0); });
      $('akv2CalU').addEventListener('click', function () { doNudge(0, -1); });
      $('akv2CalD').addEventListener('click', function () { doNudge(0, 1); });
      $('akv2CalX').addEventListener('click', function () { CAL.x = 0; CAL.y = 0; CAL.w = 0; CAL.h = 0; try { localStorage.removeItem(CAL_KEY); } catch (e) {} calRedraw(); log('Kalibrasi di-reset (' + CAL_CTX + ').'); });
      var STEPS = [0.5, 1, 2, 4];
      $('akv2Step').addEventListener('click', function () {
        var i = STEPS.indexOf(S.nudgeStep);
        S.nudgeStep = STEPS[(i + 1) % STEPS.length];
        $('akv2Step').textContent = 'STEP ' + S.nudgeStep + 'px';
        log('STEP nudge = ' + S.nudgeStep + 'px');
      });
      var calNameUpd = function () { var el = $('akv2CalName'); if (el) el.textContent = CAL_ITEMS[S.calSel]; };
      $('akv2CalAll').addEventListener('click', function () {
        S.calMode = !S.calMode;
        $('akv2CalAll').textContent = '🎯 KALIBRASI (POCKET+BANTALAN): ' + (S.calMode ? 'ON' : 'OFF');
        $('akv2CalAll').style.background = S.calMode ? '#FFDC58' : '#fff';
        $('akv2CalRow').style.display = S.calMode ? 'flex' : 'none';
        log(S.calMode ? 'KALIBRASI ON: pilih item ◀ ▶ (TL..BR = pocket, ATAS..KANAN = tepi bantalan), geser dengan nudge ◀▲▼▶, lalu 💾 SAVE pocket+bantalan sekaligus.' : 'KALIBRASI OFF: nudge kembali menggeser seluruh overlay.');
        calRedraw();
      });
      $('akv2CalPrev').addEventListener('click', function () { S.calSel = (S.calSel + 9) % 10; calNameUpd(); calRedraw(); });
      $('akv2CalNext').addEventListener('click', function () { S.calSel = (S.calSel + 1) % 10; calNameUpd(); calRedraw(); });
      $('akv2CalSave').addEventListener('click', function () { calSaveAll(); calRedraw(); });
      $('akv2CalReset').addEventListener('click', function () { calResetAll(); calRedraw(); });
      var profNameUpd = function () { var el = $('akv2ProfName'); if (el) el.textContent = tableCurrent; };
      profNameUpd();
      $('akv2ProfPrev').addEventListener('click', function () { var i = TABLE_SLOTS.indexOf(tableCurrent); switchTableProfile(TABLE_SLOTS[(i + TABLE_SLOTS.length - 1) % TABLE_SLOTS.length]); calRedraw(); });
      $('akv2ProfNext').addEventListener('click', function () { var i = TABLE_SLOTS.indexOf(tableCurrent); switchTableProfile(TABLE_SLOTS[(i + 1) % TABLE_SLOTS.length]); calRedraw(); });
      $('akv2ProfScan').addEventListener('click', function () {
        var a = sniffTableAsset();
        if (!a) { log('CEK MEJA: aset table tidak ketemu di resource (buka satu match dulu).'); return; }
        var hit = null;
        for (var i = 0; i < TABLE_SLOTS.length; i++) { var pr = tableProfiles[TABLE_SLOTS[i]]; if (pr && pr.asset === a) hit = TABLE_SLOTS[i]; }
        log('CEK MEJA: aset=' + a + (hit ? ' -> cocok profil ' + hit + (hit === tableCurrent ? ' (aktif)' : ' (pindah dengan ◀ ▶)') : ' -> belum ada profil (pilih slot, kalibrasi, 💾 SAVE)'));
      });
      $('akv2Deteksi').addEventListener('click', function () { S.deteksiOtomatis = !S.deteksiOtomatis; $('akv2Deteksi').textContent = 'DETEKSI OTOMATIS: ' + (S.deteksiOtomatis ? 'ON' : 'OFF'); log('DETEKSI OTOMATIS ' + (S.deteksiOtomatis ? 'ON (bola dideteksi otomatis, autoplay tetap bisa dimatikan)' : 'OFF')); });
      $('akv2Learn').addEventListener('click', function () { debugCommitGate(); });
      $('akv2Shoot').addEventListener('click', function () { shootLast(); });
      $('akv2Giliran').addEventListener('click', function () { autoGiliran(); });
      $('akv2Beruntun').addEventListener('click', function () { setBeruntun(!S.autoBeruntun, true); });
      $('akv2Autoplay').addEventListener('click', function () { setBeruntun(!S.autoBeruntun, true); });
      // v2.7: toggle TUNGGU LAWAN — matikan kalau main solo/latihan biar tidak menunggu.
      try { S.waitOpp = localStorage.getItem('akv2waitopp') !== '0'; } catch (e) {}
      var wob = $('akv2WaitOpp');
      if (wob) {
        wob.textContent = S.waitOpp ? '⏳ TUNGGU LAWAN: ON' : '⏳ TUNGGU LAWAN: OFF';
        wob.addEventListener('click', function () {
          S.waitOpp = !S.waitOpp;
          try { localStorage.setItem('akv2waitopp', S.waitOpp ? '1' : '0'); } catch (e) {}
          wob.textContent = S.waitOpp ? '⏳ TUNGGU LAWAN: ON' : '⏳ TUNGGU LAWAN: OFF';
          // Kalau sedang menunggu dan dimatikan -> langsung lanjut.
          if (!S.waitOpp && S.oppWait) {
            S.oppWait = false; S.oppMoved = false;
            log('TUNGGU LAWAN dimatikan — langsung lanjut main.');
            S.autoStableCount = 2;
          }
          log('TUNGGU LAWAN: ' + (S.waitOpp ? 'ON (tunggu lawan 30 dtk)' : 'OFF (langsung gas, buat latihan solo)'));
        });
      }
      $('akv2Gambar').addEventListener('click', function () { checkBallImages(); });
      $('akv2Polos').addEventListener('click', function () { S.group = 'solid'; updateGroupBtn(); log('GRUP POLOS (manual)'); });
      $('akv2Garis').addEventListener('click', function () { S.group = 'stripe'; updateGroupBtn(); log('GRUP GARIS (manual)'); });
      // v2.34: MODE GAME selector (8-ball / 9-ball urut / 15-ball urut)
      function setGameMode(m) {
        S.gameMode = m;
        var b8 = $('akv2Mode8'), b9 = $('akv2Mode9');
        if (b8) { b8.style.background = (m === '8') ? '#4CAF50' : '#fff'; b8.style.color = (m === '8') ? '#fff' : '#000'; }
        if (b9) { b9.style.background = (m === '9') ? '#4CAF50' : '#fff'; b9.style.color = (m === '9') ? '#fff' : '#000'; }
        if (m !== '8') { S.group = null; updateGroupBtn(); }
        log('🎱 MODE: ' + (m === '8' ? '8-BALL (grup)' : '9-BALL (urut 1-9)'));
      }
      var m8 = $('akv2Mode8'), m9 = $('akv2Mode9');
      if (m8) m8.addEventListener('click', function () { setGameMode('8'); });
      if (m9) m9.addEventListener('click', function () { setGameMode('9'); });
      $('akv2Bank').addEventListener('click', function () {
        S.allowBank = !S.allowBank;
        $('akv2Bank').textContent = 'PANTUL: ' + (S.allowBank ? 'FALLBACK' : 'OFF'); // v2.43: ON = pantul hanya sebagai fallback (fase 2)
        log('PANTUL ' + (S.allowBank ? 'ON' : 'OFF'));
      });
      // v2.2: CUE AUTO-TUNE — default otomatis belajar sendiri dari hasil
      // tembakan, tidak perlu setting manual. -/+ = override manual (AUTO mati).
      var CUE_KEY = 'akv2cue', CUE_AUTO_KEY = 'akv2cueauto';
      try {
        var _cs = null, _ca = null;
        try { _cs = localStorage.getItem(CUE_KEY); _ca = localStorage.getItem(CUE_AUTO_KEY); } catch (e0) {}
        // v2.62 MIGRASI SKALA: nilai tersimpan dari v2.61 ke bawah
        // memakai skala lama (888.85, ~3x terlalu besar). Kalau nilai
        // tersimpan > 400, itu skala lama — reset ke default baru 306
        // (kalibrasi live 2026-11-11). Tanpa migrasi ini, tuner harus
        // merangkak turun dari 888 dan semua tembakan tetap kepelan.
        if (_cs) {
          var _cv = parseInt(_cs, 10) || 306;
          if (_cv > 400) { _cv = 306; log('CUE: nilai lama ' + _cs + ' (skala 888) direset ke 306 (kalibrasi live)'); }
          S.cueMaxPower = Math.max(200, Math.min(500, _cv));
        }
        if (_ca === '0') S.cueAuto = false;
        saveCue();
      } catch (e0b) {}
      $('akv2CueMin').addEventListener('click', function () {
        S.cueMaxPower = Math.max(200, S.cueMaxPower - 20);
        S.cueAuto = false; saveCue();
        log('CUE manual = ' + S.cueMaxPower + ' (AUTO mati; tekan AUTO untuk belajar otomatis lagi)');
      });
      $('akv2CuePlus').addEventListener('click', function () {
        S.cueMaxPower = Math.min(500, S.cueMaxPower + 20);
        S.cueAuto = false; saveCue();
        log('CUE manual = ' + S.cueMaxPower + ' (AUTO mati; tekan AUTO untuk belajar otomatis lagi)');
      });
      $('akv2CueAuto').addEventListener('click', function () {
        S.cueAuto = true; saveCue();
        $('akv2CueAuto').style.background = '#59D977';
        log('CUE AUTO aktif: bot belajar sendiri dari hasil tembakan, tidak perlu diatur manual.');
      });
      if (!S.cueAuto) $('akv2CueAuto').style.background = '#fff';
      $('akv2SpinBtn').addEventListener('click', function () {
        // putaran: 0 -> atas (+0.5) -> bawah (-0.5) -> 0; sim pakai spin x stat spin cue
        if (S.spinY === 0) { S.spinY = 0.5; $('akv2SpinBtn').textContent = 'SPIN:ATAS'; }
        else if (S.spinY > 0) { S.spinY = -0.5; $('akv2SpinBtn').textContent = 'SPIN:BAWAH'; }
        else { S.spinY = 0; $('akv2SpinBtn').textContent = 'SPIN:0'; }
        log('SPIN manual = ' + S.spinY + ' (efektif x stat spin cue ' + S.cueSpinMult + ') — override autoplay; 0 = solver yang pilih spin per tembakan');
      });
      // v2.58: TELEMETRI DIHAPUS — tombol di atas jadi tombol debug.
      // Tidak ada webhook, tidak ada UUID, tidak ada kirim log keluar.
      var _ntfy = $('akv2Ntfy');
      if (_ntfy) _ntfy.addEventListener('click', function () { debugGetter(); });
      var _ntfyT = $('akv2NtfyTopic');
      if (_ntfyT) _ntfyT.addEventListener('click', function () { debugCommitGate(); });
      // v2.25 DISABLED in v2.27 (bentrok dengan ultra minimal) — skip
      if (false) { // v2.25 block disabled
      try {
        var essential = {akv2AutoDetect:1, akv2MatchBaru:1, akv2Autoplay:1, akv2Beruntun:1, akv2Giliran:1, akv2Shoot:1, akv2Polos:1, akv2Garis:1, akv2ManualAim:1, akv2AllLines:1, akv2CushLines:1, akv2Ntfy:1, akv2WaitOpp:1, akv2Close:1, akv2ResetPos:1, akv2Head:1, akv2Stat:1, akv2Log:1};
        var advDiv = document.createElement('div');
        advDiv.id = 'akv2AdvWrap';
        advDiv.style.display = 'none';
        var panel = $('akv2');
        // Pindahkan tombol non-esensial ke dalam wrap
        var btns = panel.querySelectorAll('button');
        var toMove = [];
        for (var bi = 0; bi < btns.length; bi++) {
          var bid = btns[bi].id;
          if (bid && !essential[bid] && bid.indexOf('akv2') === 0) toMove.push(btns[bi]);
        }
        // Juga pindahkan div row (kalibrasi dsb)
        var divs = panel.querySelectorAll('div');
        for (var di = 0; di < divs.length; di++) {
          var dv = divs[di];
          if (dv.id !== 'akv2' && dv.id !== 'akv2Head' && dv.id !== 'akv2Stat' && dv.id.indexOf('akv2') === 0) {
            // Cek apakah div ini berisi tombol non-esensial
            var hasEss = false;
            var innerBtns = dv.querySelectorAll('button');
            for (var ib = 0; ib < innerBtns.length; ib++) if (essential[innerBtns[ib].id]) { hasEss = true; break; }
            if (!hasEss && innerBtns.length > 0) toMove.push(dv);
          }
        }
        for (var mi = 0; mi < toMove.length; mi++) advDiv.appendChild(toMove[mi]);
        // Tambah toggle button di atas log
        var logEl = $('akv2Log');
        var tglBtn = document.createElement('button');
        tglBtn.id = 'akv2AdvToggle';
        tglBtn.textContent = '⚙️ LANJUTAN (tombol lain)';
        tglBtn.style.cssText = 'width:100%;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#E0E0E0;margin-top:6px;font-size:12px';
        tglBtn.addEventListener('click', function() {
          var w = $('akv2AdvWrap');
          var show = w.style.display === 'none';
          w.style.display = show ? 'block' : 'none';
          tglBtn.textContent = show ? '⚙️ SEMBUNYIKAN' : '⚙️ LANJUTAN (tombol lain)';
        });
        panel.insertBefore(tglBtn, logEl);
        panel.insertBefore(advDiv, logEl);
        log('UI disederhanakan — ' + toMove.length + ' tombol dipindah ke LANJUTAN');
      } catch (e) { log('UI simplify error: ' + e.message); }
      } // end if(false) v2.25 disabled
      // v2.26: ULTRA MINIMAL — sembunyikan SEMUA kecuali 3 tombol utama
      try { applyUltraMinimalUI(); } catch (e2) {}
    }
    function applyUltraMinimalUI() {
      // v2.58: tampilkan juga tombol debug (DEBUG GETTER / BACA BOLA)
      // + log — panel sendiri nyuruh tekan itu, menyembunyikannya = bug.
      // Sisanya tetap minimal (tanpa elemen layout lama yang ditolak user).
      var keep = {akv2LinePreview:1, akv2AutoplayBtn:1, akv2MatchBaru:1, akv2Polos:1, akv2Garis:1, akv2Mode8:1, akv2Mode9:1, akv2Close:1, akv2ResetPos:1, akv2Save:1, akv2AutoDetect:1, akv2Ntfy:1};
      // v2.28: pastikan tombol bisa di-tap (fix untuk Edge/mobile)
      // v2.30: tambah tombol group manual
      try {
        var pgBtn = $('akv2Polos'), grBtn = $('akv2Garis');
        if (pgBtn) pgBtn.addEventListener('click', function() {
          S.group = 'solid'; updateGroupBtn(); log('🎱 GROUP manual: POLOS (1-7)');
        });
        if (grBtn) grBtn.addEventListener('click', function() {
          S.group = 'stripe'; updateGroupBtn(); log('🎱 GROUP manual: GARIS (9-15)');
        });
      } catch (eG) {}
      try {
        // v2.32: handlers manual shot
        try {
          var msBtn = $('akv2ManualShot');
          if (msBtn) msBtn.addEventListener('click', function() { setManualShot(!S.manualShot); });
          var mpSlider = $('akv2ManualPower');
          if (mpSlider) mpSlider.addEventListener('input', function() {
            S.manualPower = parseInt(mpSlider.value, 10) || 50;
            var n = $('akv2ManualPowerNum'); if (n) n.textContent = S.manualPower;
          });
          var msShoot = $('akv2ManualShootBtn');
          if (msShoot) msShoot.addEventListener('click', function() { execManualShot(); });
        } catch (eMS) {}
        ['akv2LinePreview','akv2AutoplayBtn','akv2MatchBaru','akv2Polos','akv2Garis','akv2Mode8','akv2Mode9','akv2Save','akv2AutoDetect','akv2Ntfy'].forEach(function(id) {
          var b = $(id);
          if (b) {
            b.style.touchAction = 'manipulation';
            b.style.cursor = 'pointer';
            b.style.userSelect = 'none';
            b.style.webkitUserSelect = 'none';
            // Tambah touchend handler sebagai backup kalau click tidak jalan
            b.addEventListener('touchend', function(e) {
              e.preventDefault();
              b.click();
            }, {passive: false});
          }
        });
      } catch (e) {}
      var panel = $('akv2');
      if (!panel) return;
      // Sembunyikan semua button kecuali yang di keep
      var btns = panel.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (b.id && !keep[b.id]) b.style.display = 'none';
      }
      // Sembunyikan semua div kecil (kalibrasi rows, dll) kecuali head/stat/log
      var divs = panel.querySelectorAll('div');
      for (var j = 0; j < divs.length; j++) {
        var d = divs[j];
        if (d.id === 'akv2' || d.id === 'akv2Head' || d.id === 'akv2Stat') continue;
        // Kalau div berisi tombol yang disembunyikan semua, sembunyikan div-nya
        var vb = d.querySelectorAll('button:not([style*="display: none"])');
        // Cek apakah ada button visible di dalamnya
        var hasVisible = false;
        var inner = d.querySelectorAll('button');
        for (var k = 0; k < inner.length; k++) {
          if (inner[k].style.display !== 'none') { hasVisible = true; break; }
        }
        if (inner.length > 0 && !hasVisible) d.style.display = 'none';
      }
      // Sembunyikan toggle lanjutan v2.25 kalau ada
      var advT = $('akv2AdvToggle'); if (advT) advT.style.display = 'none';
      var advW = $('akv2AdvWrap'); if (advW) advW.style.display = 'none';
      // v2.58: log TIDAK disembunyikan — hasil BACA BOLA / DEBUG GETTER
      // dan alasan gate/commit harus kelihatan di panel.
      log('UI ULTRA MINIMAL aktif');
    }
    function setLinePreview(on) {
      S.linePreview = on;
      var b = $('akv2LinePreview');
      if (b) b.textContent = '🎯 LINE PREVIEW: ' + (on ? 'ON' : 'OFF');
      if (!on) {
        try { var oc = $('akv2Overlay'); if (oc) oc.getContext('2d').clearRect(0, 0, oc.width, oc.height); } catch (e) {}
      } else {
        // Gambar ulang kalau ada data
        try { if (S.lastScan && S.lastScan.shot) drawShot(S.lastScan.shot, S.lastScan.res); } catch (e2) {}
      }
      log('Line preview ' + (on ? 'ON' : 'OFF'));
    }
    // v2.33: cari Module di frame sendiri DAN semua iframe (obat login match kadang ga bisa)
    // Pas login FB, game bisa di iframe nested yang beda dari frame script.
    // v2.38: throttle — jangan scan DOM iframe tiap panggilan (berat, bisa crash).
    // Scan maksimal 1x per 5 detik; selebihnya pakai cache.
    var _cachedModuleWin = null;
    var _lastFrameScan = 0;
    function findModuleWin() {
      // v2.58: menelusuri window.frames secara REKURSIF (try/catch aman
      // cross-origin) + cache. Match login menaruh game di iframe bersarang,
      // jadi scan DOM 2 level v2.46 tidak cukup. Batasan: pelacakan /mc
      // berbasis network ala AKWeb (webRequest background) TIDAK tersedia
      // untuk userscript — tidak diimplementasikan di sini.
      try { if (window.Module && window.Module.HEAPU8) return window; } catch (e) {}
      try { if (_cachedModuleWin && _cachedModuleWin.Module && _cachedModuleWin.Module.HEAPU8) return _cachedModuleWin; } catch (e) {}
      var nowMs = Date.now();
      if (nowMs - _lastFrameScan < 5000) return _cachedModuleWin;
      _lastFrameScan = nowMs;
      function scanWin(w, depth) {
        if (!w || depth > 4) return null;
        try {
          if (w.Module && w.Module.HEAPU8) { _cachedModuleWin = w; return w; }
        } catch (e) {}
        var fr = null;
        try { fr = w.frames; } catch (e2) {}
        if (!fr) return null;
        for (var i = 0; i < fr.length; i++) {
          var hit = null;
          try { hit = scanWin(fr[i], depth + 1); } catch (e3) {}
          if (hit) return hit;
        }
        return null;
      }
      var found = scanWin(window, 0);
      if (found) return found;
      try { if (window.top && window.top !== window && window.top.Module && window.top.Module.HEAPU8) return window.top; } catch (e4) {}
      try {
        var t = window.top;
        if (t && t !== window) { var h2 = scanWin(t, 0); if (h2) return h2; }
      } catch (e5) {}
      return null;
    }
    function heapViews() {
      try {
        var w = findModuleWin();
        if (!w) return null;
        var M = w.Module;
        var buf = null;
        if (M.HEAPU8 && M.HEAPU8.buffer) buf = M.HEAPU8.buffer;
        else if (M.memory && M.memory.buffer) buf = M.memory.buffer;
        else if (M.wasmMemory && M.wasmMemory.buffer) buf = M.wasmMemory.buffer;
        if (!buf) return null;
        // v2.58: +f32 (radius bola +80 dibaca sebagai f32) dan win/module.
        return { f64: new Float64Array(buf), f32: new Float32Array(buf), u8: new Uint8Array(buf), i32: new Int32Array(buf), bytes: buf.byteLength, module: M, win: w };
      } catch (e) { return null; }
    }
    // =====================================================================
    // v2.58 MODUL AKWeb — GETTER + dynCall + COMMIT GATE + PLAN + rAF LOOP
    // ---------------------------------------------------------------------
    // SUMBER POLA (terverifikasi dari readonly-game-snapshot.js AKWeb 1.0.4):
    //  - Getter: Reflect.apply(dynCall_iii, thisArg, [tableIndex, managerPtr,
    //    selectorAddress]); thisArg = Module atau Module.asm (mana yang punya
    //    dynCall_iii). Getter sederhana pakai selector 0 di beberapa tempat.
    //  - getBallByNumber: Reflect.apply(dynCall_iiii, thisArg,
    //    [getBallByNumberTableIndex, rulesPtr, 0, ballNumber]) -> ball pointer.
    //  - Setter double: _malloc(16), DataView.setFloat64(ptr, value, true),
    //    Reflect.apply(dynCall_viii, thisArg, [tableIndex, managerPtr,
    //    selectorAddress, ptr]), lalu _free(ptr). Pola ini dipakai AKWeb
    //    untuk aimSetter (restore-angle) & powerSetter (zero-power).
    //  - Kill-animation: Reflect.apply(dynCall_vii, thisArg, [tableIndex,
    //    managerPtr, selectorAddress]) — tanpa argumen double.
    //  - Gate AKWeb (nama field terverifikasi, nilai 4/1/0 dari snapshot):
    //    gameStateId===4 && playerTurn===1 && waitingForPlayerShot===1 &&
    //    inputActive===1 && powerMode===0 && aimAnimating===0 &&
    //    powerAnimating===0 && turnTimeFinished===0 && tableAnimating===0 &&
    //    touches==0 && delayed input==0 && englishAnimationTime<=0 &&
    //    winnerDefined===0. CATATAN PENTING: gameStateId 7 = "seseorang
    //    aiming", BUKAN giliran kita — gate v2.58 menolak 7.
    // ANGKA LIVE (guest build wasm_guest_1.0.0_73372, sha256 6c7a33d4..):
    //  GameManager HEAP32[27555], MainManager HEAP32[37069] — 110220/
    //  148276 itu ALAMAT BYTE, bukan indeks HEAP32 (sharedGameManager:
    //  i32.const 110220; i32.load). Tervalidasi runtime di rig meja menu:
    //  gm 80409056, mm 22590184. getTable dynCall_iii [7992, gm, 2401326]
    //  -> table 80563872 (tervalidasi). getBallByNumber dynCall_iiii
    //  [24373, table, 7653857, num] -> 16 pointer bola (tervalidasi).
    //  setAimAngle 26469/sel 8402899, setPower 26470/sel 8402950 — di
    //  objek CUE (visualCue *(gm+36)), BUKAN di GameManager. takeShot
    //  7945/sel 2400642 di GameManager. Selector state: gameStateID 7980/
    //  2401297, isPlayerTurn 7892/2397653, isWaitingForPlayerShot 7837/
    //  2394304, isWinnerDefined 7822/2393991, currentShotId 8023/2371636,
    //  inputActive 26524/8403095, powerMode 26578/8407517, aimAnimating
    //  26476/8408255, powerAnimating 26480/8408338 (statis, High-conf,
    //  BELUM tervalidasi runtime — rig tidak bisa masuk match live).
    //  OFFSET BOLA (runtime, dari pointer getBallByNumber): number +124,
    //  position +32/+40 (f64), velocity +48/+56 (f64), radius f64 +80
    //  (=3.800475), group +116 (0=cue,1=polos,2=garis,4=8-ball), state
    //  +120 (onTable <=> {1,2}). KOREKSI +4: daftar ivar di dokumen
    //  binding mengukur dari basis 4 byte SETELAH pointer runtime
    //  (offset runtime = offset ivar + 4) — terbukti per-field dari
    //  rig/structdump-probe.json (bola 0/1/8): angka +120 SELALU 0,
    //  angka +124 = 0/1/8; radius f64 +80 = 3.800475 persis, f64 +76 =
    //  4.4e230. Jadi JANGAN "betulkan" offset ke +28/+120 — itu merusak
    //  scan + getter. Kalau validasi gagal, baca bola GAGAL TERANG (log
    //  alasannya), tidak pernah ditebak-tebak diam-diam. TIDAK ADA kode
    //  ekstensi AKWeb atau biner .so yang dicomot ke file ini — hanya
    //  arsitektur/pola di atas.
    // BATASAN: pelacakan /mc berbasis network (webRequest background ala
    // AKWeb) TIDAK tersedia untuk userscript — tidak diimplementasikan di
    // sini, jangan diklaim ada. Frame login/bersarang ditangani lewat
    // findModuleWin() rekursif + gating ownModule() di init().
    // =====================================================================
    var AKV2_GUEST = {
      // Singletons: HEAP32 indices (byte addr >> 2). JANGAN pakai alamat
      // byte sebagai indeks — itu yang mematikan getter sejak v2.47.
      gameManagerIdx: 27555, mainManagerIdx: 37069,
      getTableFunc: 7992, getTableSel: 2401326,
      getBallFunc: 24373, getBallSel: 7653857,
      // Setter: receiver = objek CUE (visualCue), bukan GameManager.
      setAimSlot: 26469, setAimSel: 8402899,
      setPowerSlot: 26470, setPowerSel: 8402950,
      takeShotSlot: 7945, takeShotSel: 2400642,
      // v2.60 GETTER double (SRET, MCNumber) untuk readback + live
      // preview: aimAngle 26468/sel 8402869, power 26520/sel 8402944.
      // Dipakai readbackShot (ganti baca heap mentah) + livePreview.
      aimAngleSlot: 26468, aimAngleSel: 8402869,
      powerSlot: 26520, powerSel: 8402944,
      // Receiver cue untuk killAnimation / resetInput.
      killAnimSlot: 26483, killAnimSel: 8408391,
      resetInputSlot: 26509, resetInputSel: 8409356,
      // Objek cue: visualCue = *(gm+36).
      visualCueFunc: 8016, visualCueSel: 2367669,
      // v2.58 English (spin) — setter setEnglish: TERDERIVASI STATIS
      // (High-conf, WASM guest): table 26631, func 32030, selector
      // 8426434 ("setEnglish:", dibaca di alamatnya), types
      // v24@0:4{?={MCNumber=d}{MCNumber=d}}8, dynCall_viii, buffer 16
      // byte (2 f64). Receiver = objek VisualEnglishControl *(gm+40)
      // via getter 8017/sel 2367754. Field yang ditulis mEnglish @+8
      // (f64[0] @+8, f64[1] @+16 — readback di commit). Validasi live
      // efek spin masih pending (rig).
      englishObjFunc: 8017, englishObjSel: 2367754,
      englishSlot: 26631, englishSel: 8426434,
      // Offset ivar mMaxCuePowerOffset di objek cue (guest) — untuk
      // probeCueMaxPower. 0 = tidak diketahui / jangan baca.
      cueMaxPowerOff: 176,
      // Gate state (di gm) — statis, High-conf, belum tervalidasi runtime.
      gameStateFunc: 7980, gameStateSel: 2401297,
      playerTurnFunc: 7892, playerTurnSel: 2397653,
      waitingShotFunc: 7837, waitingShotSel: 2394304,
      winnerDefinedFunc: 7822, winnerDefinedSel: 2393991,
      currentShotIdFunc: 8023, currentShotIdSel: 2371636,
      // Gate cue (di objek visualCue) — statis, High-conf.
      inputActiveFunc: 26524, inputActiveSel: 8403095,
      powerModeFunc: 26578, powerModeSel: 8407517,
      aimAnimFunc: 26476, aimAnimSel: 8408255,
      powerAnimFunc: 26480, powerAnimSel: 8408338,
      // Table helpers.
      getCueBallFunc: 24371, getCueBallSel: 7653832,
      numBallsFunc: 24375, numBallsSel: 7653896,
      // Offset bola RUNTIME (pointer getBallByNumber + offset). BUKAN
      // offset ivar dokumen binding (ivar + 4 = runtime) — lihat §4.
      ballNumberOff: 124, ballPosOff: 32, ballVelOff: 48, ballRadiusOff: 80,
      ballTypeOff: 116, ballStateOff: 120
    };
    // v2.58: tabel LOGGED-IN (build 4.4.3_8602f, meja login seperti Miami).
    // Semua indeks tabel berbeda dari guest; offset bola RUNTIME SAMA
    // (ivar + 4). Selector terverifikasi via bwasm (string selector dibaca
    // di alamatnya). Manager: byte 270408/360320 >> 2. MainManager
    // HEAP32[90080] TERKONFIRMASI live di rig (mm nonzero di menu);
    // GameManager HEAP32[67602] derivasi statis, BELUM terkonfirmasi live
    // (game bundled tidak pernah sampai menu di rig — §23). getTable
    // selector 5031092 (BUKAN 2401326 — itu selector guest; string di
    // 2401326 pada WASM bundled adalah 'cument:').
    var AKV2_LOGGEDIN = {
      // Singletons: HEAP32 indices (byte addr >> 2).
      gameManagerIdx: 67602, mainManagerIdx: 90080,
      getTableFunc: 13573, getTableSel: 5031092,
      getBallFunc: 40597, getBallSel: 13242917,
      // Setter: receiver = objek CUE (visualCue), bukan GameManager.
      setAimSlot: 45300, setAimSel: 14546803,
      setPowerSlot: 45301, setPowerSel: 14546854,
      takeShotSlot: 13526, takeShotSel: 5030408,
      // v2.60 GETTER double (SRET, MCNumber): aimAngle 45299/sel
      // 14546773; power 45351 tapi SELECTOR belum diketahui (—) ->
      // powerSel 0 = readback power di-skip di build ini (jangan gagal).
      aimAngleSlot: 45299, aimAngleSel: 14546773,
      powerSlot: 45351, powerSel: 0,
      // Receiver cue untuk killAnimation / resetInput.
      killAnimSlot: 45314, killAnimSel: 14552295,
      resetInputSlot: 45340, resetInputSel: 14553260,
      // Objek cue: visualCue = *(gm+36).
      visualCueFunc: 13598, visualCueSel: 4980637,
      // v2.58 English (spin) — bundled TERDERIVASI STATIS (High-conf):
      // setEnglish: table 45462, func 39831, selector 14570286
      // ("setEnglish:"); receiver getter visualEnglishControl table
      // 13599, func 74656, selector 4980722 (1 record, tetangga
      // visualCue 13598/4980637). mEnglish @+8 (sama dengan guest).
      // Live bundled tetap belum terverifikasi (GameManager bundled
      // belum pernah mencapai menu di rig).
      englishObjFunc: 13599, englishObjSel: 4980722,
      englishSlot: 45462, englishSel: 14570286,
      cueMaxPowerOff: 0,
      // Gate state (di gm).
      gameStateFunc: 13561, gameStateSel: 5031063,
      playerTurnFunc: 13468, playerTurnSel: 5027316,
      waitingShotFunc: 13414, waitingShotSel: 5023985,
      winnerDefinedFunc: 13398, winnerDefinedSel: 5023655,
      currentShotIdFunc: 13605, currentShotIdSel: 4984604,
      // Gate cue (di objek visualCue).
      inputActiveFunc: 45355, inputActiveSel: 14546999,
      powerModeFunc: 45409, powerModeSel: 14551421,
      aimAnimFunc: 45307, aimAnimSel: 14552159,
      powerAnimFunc: 45311, powerAnimSel: 14552242,
      // Table helpers.
      getCueBallFunc: 40595, getCueBallSel: 13242892,
      numBallsFunc: 40599, numBallsSel: 13242956,
      // Offset bola RUNTIME — SAMA dengan guest (ivar + 4).
      ballNumberOff: 124, ballPosOff: 32, ballVelOff: 48, ballRadiusOff: 80,
      ballTypeOff: 116, ballStateOff: 120
    };
    // v2.58: deteksi build WASM (guest vs logged-in) — PROBE, bukan string
    // buildId (v2.46: bridge.js mengirim buildId '4.4.3_8602f' padahal data
    // guest — string laporan tidak bisa dipercaya). Mencoba tabel AKTIF
    // dulu, lalu tabel lainnya: manager nonzero + masuk akal, getTable
    // mengembalikan pointer masuk akal, getBallByNumber(0/1) mengembalikan
    // dua pointer BERBEDA yang deterministik (panggilan ulang untuk nomor
    // yang sama mengembalikan pointer yang sama) dan berdekatan (< 4 MB).
    // Validasi nomor/radius bola SENGAJA tidak dipakai di sini — di meja
    // menu bola membaca num=0 dan radius 383.2991 (struct belum
    // diinisialisasi, guest §15); validasi struct penuh sudah jalan tiap
    // tick di readGetterBalls via akValidBallStruct. Mengembalikan
    // kandidat yang menang ({name, table}) atau null. Mengganti AKV2_LIVE
    // + AKV2_BUILD kalau menang. Semua dynCall dibungkus try/catch —
    // memanggil fungsi di indeks tabel yang salah tidak boleh meledak.
    var AKV2_LIVE = AKV2_GUEST;
    var AKV2_BUILD = 'guest';
    function akDetectBuild(M, h) {
      var curIsGuest = (AKV2_LIVE === AKV2_GUEST);
      var cands = [
        { name: curIsGuest ? 'guest' : 'logged-in', t: AKV2_LIVE },
        { name: curIsGuest ? 'logged-in' : 'guest', t: curIsGuest ? AKV2_LOGGEDIN : AKV2_GUEST }
      ];
      for (var ci = 0; ci < cands.length; ci++) {
        var cand = cands[ci], T = cand.t;
        var gm = 0, mm = 0;
        try { gm = h.i32[T.gameManagerIdx] || 0; mm = h.i32[T.mainManagerIdx] || 0; } catch (e) { continue; }
        if (!(gm > 0 && gm < h.bytes && mm > 0 && mm < h.bytes)) continue;
        var d = akDyn(M, 'dynCall_iii');
        if (!d) return null;
        var table = 0;
        try { table = Reflect.apply(d.fn, d.self, [T.getTableFunc, gm, T.getTableSel]); } catch (e) { continue; }
        if (!(typeof table === 'number' && table > 0 && table < h.bytes)) continue;
        var d4 = akDyn(M, 'dynCall_iiii');
        if (!d4) return null;
        var p0 = 0, p1 = 0, p0b = 0;
        try {
          p0 = Reflect.apply(d4.fn, d4.self, [T.getBallFunc, table, T.getBallSel, 0]);
          p1 = Reflect.apply(d4.fn, d4.self, [T.getBallFunc, table, T.getBallSel, 1]);
          p0b = Reflect.apply(d4.fn, d4.self, [T.getBallFunc, table, T.getBallSel, 0]);
        } catch (e) { continue; }
        if (!(typeof p0 === 'number' && p0 > 0 && p0 < h.bytes)) continue;
        if (!(typeof p1 === 'number' && p1 > 0 && p1 < h.bytes)) continue;
        if (p0 === p1) continue; // pointer harus berbeda per nomor bola
        if (p0 !== p0b) continue; // getter harus deterministik
        if (Math.abs(p1 - p0) >= 4 * 1024 * 1024) continue; // bola berdekatan
        if ((p0 % 4) !== 0 || (p1 % 4) !== 0) continue;
        AKV2_LIVE = T;
        AKV2_BUILD = cand.name;
        S.englishKnown = !!(T.englishSlot);
        try { log('BUILD terdeteksi: ' + cand.name + ' (gm=' + gm + ' table=' + table + ')'); } catch (e2) {}
        return cand;
      }
      return null;
    }
    S.planCounter = 0; S.getterDiag = null; S.strictGate = false;
    S.scanCache = null; S.scanRunning = false; S.scanClusterLast = 0; S.trackedIdx = {}; S.trackedActive = false;
    S.rafRunning = false; S.rafLastRead = 0; S.rafLastSig = '';
    function akDyn(M, name) {
      try {
        if (M && typeof M[name] === 'function') return { fn: M[name], self: M };
        if (M && M.asm && typeof M.asm[name] === 'function') return { fn: M.asm[name], self: M.asm };
      } catch (e) {}
      return null;
    }
    function akMalloc(M, bytes) {
      try {
        var f = null;
        if (M && typeof M._malloc === 'function') f = M._malloc;
        else if (M && M.asm && typeof M.asm._malloc === 'function') f = M.asm._malloc;
        if (typeof f !== 'function') return 0;
        var p = f.call(M, bytes);
        return (typeof p === 'number') ? p : 0;
      } catch (e) { return 0; }
    }
    function akFree(M, ptr) {
      try {
        var f = (M && typeof M._free === 'function') ? M._free : (M && M.asm && typeof M.asm._free === 'function' ? M.asm._free : null);
        if (typeof f === 'function') f.call(M, ptr);
      } catch (e) {}
    }
    function akGetManagers(h) {
      // Live: GameManager HEAP32[27555], MainManager HEAP32[37069]
      // (alamat byte 110220/148276 >> 2). Tervalidasi runtime di rig:
      // gm 80409056, mm 22590184. TIDAK ADA lagi cek neverIdx: 148284
      // adalah slot singleton manager LAIN (func 50969), bukan "selalu 0".
      var gm = h.i32[AKV2_LIVE.gameManagerIdx] || 0;
      var mm = h.i32[AKV2_LIVE.mainManagerIdx] || 0;
      return { gameManager: gm, mainManager: mm,
        ok: (gm > 0 && gm < h.bytes && mm > 0 && mm < h.bytes) };
    }
    function akGetTable(M, h, mgr) {
      // Live (tervalidasi runtime di rig meja menu -> table 80563872):
      // dynCall_iii [7992, gm, 2401326]. SATU panggilan saja — v2.58
      // mencoba [52429, ...] dulu, padahal 52429 adalah FUNCTION index
      // (bukan table index, > ukuran tabel 42162) jadi trap, dan
      // panggilan salah bisa mengembalikan pointer-dalam-heap palsu
      // sebelum panggilan benar sempat jalan.
      var d = akDyn(M, 'dynCall_iii');
      if (!d) return { ptr: 0, tried: 'dynCall_iii-missing' };
      var v = 0;
      try { v = Reflect.apply(d.fn, d.self, [AKV2_LIVE.getTableFunc, mgr, AKV2_LIVE.getTableSel]); } catch (e) { v = 0; }
      if (typeof v === 'number' && v > 0 && v < h.bytes) return { ptr: v, tried: 'live:7992,' + mgr + ',2401326' };
      return { ptr: 0, tried: 'live-invalid' };
    }
    function akValidBallStruct(h, ptr) {
      // Validasi struct bola (offset RUNTIME, pointer getBallByNumber):
      // nomor +124 (0..15), radius f64 +80 ~= 3.800475, posisi +32/+40
      // dalam meja, state +120 (0..4; onTable <=> {1,2}), group +116.
      // PERHATIAN v2.58: radius WAJIB dibaca f64 — v2.50 membaca f32,
      // dan paruh-bawah double 3.800475 sebagai float32 = 1.3e29, jadi
      // SEMUA pointer bola ditolak walau manager/table/bola sudah benar.
      if (!ptr || ptr < 0 || ptr + 128 > h.bytes) return null;
      var num = h.i32[(ptr + AKV2_LIVE.ballNumberOff) / 4];
      if (num < 0 || num > 15) return null;
      var rad = h.f64[(ptr + AKV2_LIVE.ballRadiusOff) / 8];
      if (!(rad > 3.7 && rad < 3.9)) return null;
      var x = h.f64[(ptr + AKV2_LIVE.ballPosOff) / 8];
      var y = h.f64[(ptr + AKV2_LIVE.ballPosOff + 8) / 8];
      if (!isFinite(x) || !isFinite(y) || x < -140 || x > 140 || y < -80 || y > 80) return null;
      var st = h.i32[(ptr + AKV2_LIVE.ballStateOff) / 4];
      if (st < 0 || st > 4) return null;
      var vx = h.f64[(ptr + AKV2_LIVE.ballVelOff) / 8];
      var vy = h.f64[(ptr + AKV2_LIVE.ballVelOff + 8) / 8];
      if (!isFinite(vx) || !isFinite(vy)) return null;
      var tp = h.i32[(ptr + AKV2_LIVE.ballTypeOff) / 4];
      return { num: num, x: x, y: y, vx: vx, vy: vy, radius: rad, type: tp, state: st, ptr: ptr, cue: (num === 0) };
    }
    function akGetBallPtr(M, h, tablePtr, num) {
      // Live (tervalidasi runtime di rig -> 16 pointer bola berbeda):
      // getBallByNumber via dynCall_iiii [24373, tablePtr, 7653857, num].
      // v2.58 memanggil [7992, tablePtr, 0, num] — 7992 itu getTable,
      // dan selector 0 salah (yang benar 7653857).
      var d = akDyn(M, 'dynCall_iiii');
      if (d) {
        var v = 0;
        try { v = Reflect.apply(d.fn, d.self, [AKV2_LIVE.getBallFunc, tablePtr, AKV2_LIVE.getBallSel, num]); } catch (e) { v = 0; }
        if (typeof v === 'number' && v > 0 && v < h.bytes) {
          var b = akValidBallStruct(h, v);
          if (b && b.num === num) return { ptr: v, via: 'getBallByNumber:24373' };
        }
      }
      // Fallback TERBATAS (bukan scan heap): probe 4 KB pertama objek table
      // untuk pointer-pointer bola yang strukturnya valid. Dicatat di diag.
      for (var off = 0; off <= 4096; off += 4) {
        var cand = h.i32[(tablePtr + off) / 4];
        if (!cand || cand < 0 || cand + 128 > h.bytes) continue;
        var bb = akValidBallStruct(h, cand);
        if (bb && bb.num === num) return { ptr: cand, via: 'table-probe+' + off };
      }
      return { ptr: 0, via: 'none' };
    }
    // v2.58: SCAN HEAP FALLBACK (dari v2.46, terbukti jalan di HP user).
    // Dipakai kalau getter dynCall gagal — walau angka live-nya sudah
    // tervalidasi di rig meja menu, getter tetap bisa gagal di match
    // (mis. struct pindah). Scan TIDAK memakai angka binding sama sekali:
    // tandanya nomor+92 (0-15, = +124 absolut dari pointer bola) DAN
    // radius+48 = 3.800475 (direct, = +80 absolut), atau cluster f64
    // ketat (clusters). Anchor scan = pointer bola +32 (posisi).
    function storeTrackedIdx(balls) {
      // v2.58: simpan alamat struct (idx f64) tiap nomor bola dari hasil
      // scan yang sukses, supaya tick berikutnya baca langsung via pointer
      // (tanpa sweep heap). Hanya nomor 0..15 dengan idx yang disimpan.
      if (!S.trackedIdx) S.trackedIdx = {};
      var n = 0;
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        if (b && typeof b.idx === 'number' && typeof b.num === 'number' && b.num >= 0 && b.num <= 15) { S.trackedIdx[b.num] = b.idx; n++; }
      }
      return n;
    }
    function readTrackedBalls(h) {
      // v2.58: POINTER TRACKING — baca bola dari alamat struct yang sudah
      // dilacak (discovery scan sebelumnya), O(16) baca pointer langsung
      // tiap tick, tanpa sweep heap, tanpa sleep. Ini tiruan jujur jalur
      // cepat AKWeb: alamat ditemukan sekali, lalu dibaca langsung.
      // Validasi tiap entri: radius f64 +48 = 3.800475, nomor i32 +92
      // HARUS sama dengan nomor yang dilacak, posisi dalam batas meja dan
      // bukan (0,0) (struct template / bola yang sudah masuk). Entri yang
      // gagal divalidasi LANGSUNG dihapus — tidak ada data basi yang
      // dikembalikan. Kembalikan null kalau <6 bola atau cue hilang.
      if (!S.trackedIdx) return null;
      var balls = [];
      for (var num = 0; num <= 15; num++) {
        var idx = S.trackedIdx[num];
        if (typeof idx !== 'number') continue;
        if (idx < 0 || idx + 6 >= h.f64.length || 2 * idx + 23 >= h.i32.length) { delete S.trackedIdx[num]; continue; }
        var rad = h.f64[idx + 6];
        if (Math.abs(rad - 3.800475) > 0.000001) { delete S.trackedIdx[num]; continue; }
        if (h.i32[2 * idx + 23] !== num) { delete S.trackedIdx[num]; continue; }
        var x = h.f64[idx], y = h.f64[idx + 1];
        if (!isFinite(x) || !isFinite(y) || x < -200 || x > 200 || y < -160 || y > 160 || (x === 0 && y === 0)) { delete S.trackedIdx[num]; continue; }
        balls.push({ x: x, y: y, idx: idx, num: num });
      }
      var cue = null;
      for (var i = 0; i < balls.length; i++) if (balls[i].num === 0) cue = balls[i];
      // v2.58: ambang bola minimum 6 -> 2 (cue + 1 target). Di bawah 6 bola solver buta total.
      if (!cue || balls.length < 2) return null;
      return { balls: balls, pockets: FIXED_POCKETS, pocketWidth: FIXED_POCKET_WIDTH, radius: AK_BALL_RADIUS, numbersOk: true, pocketFromHeap: false };
    }
    function readScanBalls(h, mgr, tab) {
      // v2.58: coba POINTER TRACKING dulu — baca langsung O(16) tiap tick,
      // segar, tanpa cache 1500 ms. Kalau pointer gagal (<6 bola / cue
      // hilang), jatuh ke jalur lama: cache scan, lalu scan penuh.
      var tr = readTrackedBalls(h);
      if (tr) {
        var trRes = scanResToGetterRes(h, mgr, tab, tr, 'tracked');
        if (trRes.numbersOk) {
          S.getterDiag = 'TRACKED-OK balls=' + trRes.balls.length + ' via=tracked (pointer dilacak, tanpa scan heap)';
          try { var gsT = $('akv2GetterStat'); if (gsT) gsT.textContent = 'GETTER: ' + S.getterDiag; } catch (eT) {}
          if (!S.trackedActive) { S.trackedActive = true; log('TRACKED: ' + trRes.balls.length + ' bola dibaca via pointer (tanpa scan heap).'); }
          return trRes;
        }
        S.trackedActive = false;
      } else {
        S.trackedActive = false;
      }
      // Pakai cache scan kalau masih segar (<= 1500 ms); kalau tidak,
      // jalankan scan async di latar (sekali saja) dan kembalikan null
      // untuk tick ini — tick berikutnya memakai cache yang sudah jadi.
      var now = Date.now();
      if (S.scanCache && S.scanCache.res && (now - S.scanCache.at) < 1500) {
        return scanResToGetterRes(h, mgr, tab, S.scanCache.res, S.scanCache.via);
      }
      if (!S.scanRunning) {
        S.scanRunning = true;
        runScanFallback().then(function () { S.scanRunning = false; }, function (e) { S.scanRunning = false; try { log('SCAN fallback error: ' + (e && e.message)); } catch (e2) {} });
      }
      return null;
    }
    async function runScanFallback() {
      var h = heapViews();
      if (!h) return;
      // Jalur 1: CARI LANGSUNG (tanda nomor+92 / radius+48), chunked
      // async biar tidak freeze game; berhenti cepat kalau >=6 nomor asli.
      var direct = await directScanBalls(h);
      if (direct.length >= 2) { // v2.58: ambang 6 -> 2 (endgame)
        await sleep(800);
        var h2 = heapViews();
        if (h2) {
          var stable = [];
          for (var i = 0; i < direct.length; i++) {
            var dc = direct[i];
            if (dc.idx + 1 < h2.f64.length && Math.abs(h2.f64[dc.idx] - dc.x) < 0.5 && Math.abs(h2.f64[dc.idx + 1] - dc.y) < 0.5 && Math.abs(h2.f64[dc.idx + 6] - 3.800475) < 0.000001) stable.push(dc);
          }
          if (stable.length >= 2) { // v2.58: ambang 6 -> 2 (endgame)
            S.scanCache = { res: { balls: stable, pockets: FIXED_POCKETS, pocketWidth: FIXED_POCKET_WIDTH, radius: AK_BALL_RADIUS, numbersOk: true, pocketFromHeap: false }, via: 'direct', at: Date.now() };
            storeTrackedIdx(stable); // v2.58: lacak pointer struct bola ini.
            S.getterDiag = 'SCAN-OK balls=' + stable.length + ' via=direct (getter dynCall gagal, pakai scan heap)';
            try { var gs = $('akv2GetterStat'); if (gs) gs.textContent = 'GETTER: ' + S.getterDiag; } catch (e) {}
            log('SCAN fallback OK: ' + stable.length + ' bola via direct (nomor+92/radius+48).');
            return;
          }
          log('SCAN direct stabil cuma ' + stable.length + ' bola, coba scan ketat...');
        }
      } else {
        log('SCAN direct cuma ' + direct.length + ' bola (<2), coba scan ketat...');
      }
      // Jalur 2: scan ketat (rawClustersStrict + stabil + assign).
      // Ini pass sync seluruh heap (~detik, bisa bikin game patah
      // sesaat) — makanya dibatasi 1x per 30 detik.
      if (Date.now() - (S.scanClusterLast || 0) < 30000) {
        log('SCAN ketat dilewati (cooldown 30 dtk) — direct gagal, getter gagal.');
        return;
      }
      S.scanClusterLast = Date.now();
      var r = rawClustersStrict(h.f64, h.i32);
      await sleep(600);
      var h3 = heapViews();
      if (!h3) return;
      var stable2 = stableClusters(r.clusters, h3.f64);
      var res2 = assignBallsAndPockets(stable2, h3.i32);
      if (res2.balls.length >= 2 && res2.numbersOk) { // v2.58: ambang 6 -> 2 (endgame)
        S.scanCache = { res: res2, via: 'clusters', at: Date.now() };
        storeTrackedIdx(res2.balls); // v2.58: lacak pointer struct bola ini.
        S.getterDiag = 'SCAN-OK balls=' + res2.balls.length + ' via=clusters (getter dynCall gagal, pakai scan heap)';
        try { var gs2 = $('akv2GetterStat'); if (gs2) gs2.textContent = 'GETTER: ' + S.getterDiag; } catch (e2) {}
        log('SCAN fallback OK: ' + res2.balls.length + ' bola via clusters (range=' + r.stats.range + ' ketat=' + r.stats.strict + ').');
      } else {
        S.scanCache = null;
        log('SCAN fallback gagal: direct=' + direct.length + ' cluster=' + res2.balls.length + ' numbersOk=' + res2.numbersOk + ' — getter + scan dua-duanya gagal.');
      }
    }
    function scanResToGetterRes(h, mgr, tab, scanRes, via) {
      // Bentuk hasil scan ke bentuk yang sama dengan getter, supaya
      // pickShot/drawShot/autoTick/commitShot tidak berubah. Bola scan
      // tidak punya velocity/state/type heap — diisi default (vx/vy=0
      // = bola diam, state=0, type dari nomor). ptr = alamat byte struct
      // (idx*8) supaya cek cuePtr di commit gate konsisten antar baca.
      // tablePointer/gameManager/mainManager diteruskan APA ADANYA dari
      // lookup manager — kalau lookup itu gagal, nilainya 0 dan commit
      // gate akan menolak tembakan dynCall dengan alasan jelas (TIDAK
      // ada pointer yang dikarang di sini).
      var balls = [], missing = [], seen = {};
      for (var i = 0; i < scanRes.balls.length; i++) {
        var b = scanRes.balls[i];
        var num = (b.num === null || b.num === undefined) ? null : b.num;
        if (num === null) continue;
        if (seen[num]) continue;
        seen[num] = true;
        balls.push({ num: num, x: b.x, y: b.y, vx: 0, vy: 0, radius: scanRes.radius || AK_BALL_RADIUS,
          type: num === 0 ? 0 : (num <= 7 ? 1 : 2), state: 0, ptr: (typeof b.idx === 'number' ? b.idx * 8 : 0), cue: num === 0 });
      }
      balls.sort(function (a, b) { return a.num - b.num; });
      for (var n = 0; n <= 15; n++) if (!seen[n]) missing.push(n);
      var cue = null;
      for (var j = 0; j < balls.length; j++) if (balls[j].num === 0) cue = balls[j];
      var numbersOk = !!cue && balls.length >= 2; // v2.58: ambang 6 -> 2 (cue + 1 target)
      var gm = mgr ? mgr.gameManager : 0;
      var mm = mgr ? mgr.mainManager : 0;
      var res = { balls: balls, missing: missing, pockets: scanRes.pockets || FIXED_POCKETS,
        pocketWidth: scanRes.pocketWidth || FIXED_POCKET_WIDTH, radius: scanRes.radius || AK_BALL_RADIUS,
        numbersOk: numbersOk, cueState: cue ? 0 : -1, cueInHand: false,
        tablePointer: (tab && tab.ptr) ? tab.ptr : 0, gameManager: gm, mainManager: mm,
        module: h.module, buffer: null, heapBytes: h.bytes, getterVia: { scan: via } };
      res.buffer = (function () { try { var w = findModuleWin(); return w && w.Module ? (w.Module.HEAPU8 ? w.Module.HEAPU8.buffer : (w.Module.memory ? w.Module.memory.buffer : null)) : null; } catch (e) { return null; } })();
      return res;
    }
    function readGetterBalls() {
      // v2.58: jalur baca bola UTAMA = getter dynCall O(16) per tick.
      // Kalau getter gagal (binding live belum tervalidasi di match),
      // fallback ke scan heap (readScanBalls) — tanda nomor+92 /
      // radius+48 yang terbukti jalan di v2.46. Tanpa fase belajar,
      // tanpa SIMPAN/BANDINGKAN.
      var h = heapViews();
      if (!h || !h.module) { S.getterDiag = 'no-module-heap'; return null; }
      var M = h.module;
      // v2.58: deteksi build sekali saja sebelum baca manager. Kalau
      // belum terdeteksi (manager belum ada / game belum jalan), coba
      // lagi di tick berikutnya — jangan cache kegagalan.
      if (!S.buildDetected) {
        var det = akDetectBuild(M, h);
        if (det) { S.buildDetected = true; S.buildName = det.name; }
      }
      var mgr = akGetManagers(h);
      if (!mgr.ok) {
        // v2.58: manager tidak valid padahal build sudah terdeteksi —
        // tabelnya mungkin salah; reset deteksi supaya tick berikutnya
        // mem-probe ulang (dan bisa pindah ke tabel satunya).
        if (S.buildDetected) { S.buildDetected = false; S.buildName = 'unknown'; }
        S.getterDiag = 'manager-invalid gm=' + mgr.gameManager + ' mm=' + mgr.mainManager + ' heap=' + h.bytes;
        log('GETTER gagal: manager tidak valid (' + S.getterDiag + ')');
        return readScanBalls(h, mgr, null);
      }
      var tab = akGetTable(M, h, mgr.gameManager);
      if (!tab.ptr) {
        S.getterDiag = 'getTable-invalid tried=' + tab.tried + ' gm=' + mgr.gameManager;
        log('GETTER gagal: getTable live [7992,2401326] tidak mengembalikan pointer valid — ' + S.getterDiag);
        return readScanBalls(h, mgr, null);
      }
      var balls = [], missing = [], via = {};
      for (var n = 0; n <= 15; n++) {
        var r = akGetBallPtr(M, h, tab.ptr, n);
        if (!r.ptr) { missing.push(n); continue; }
        var b = akValidBallStruct(h, r.ptr);
        if (!b) { missing.push(n); continue; }
        balls.push(b); via[n] = r.via;
      }
      var cue = null;
      for (var i = 0; i < balls.length; i++) if (balls[i].num === 0) cue = balls[i];
      var numbersOk = !!cue && balls.length >= 2; // v2.58: ambang 6 -> 2 (cue + 1 target)
      if (!numbersOk) return readScanBalls(h, mgr, tab);
      var res = { balls: balls, missing: missing, pockets: FIXED_POCKETS, pocketWidth: FIXED_POCKET_WIDTH,
        radius: AK_BALL_RADIUS, numbersOk: numbersOk, cueState: cue ? cue.state : -1, cueInHand: false,
        tablePointer: tab.ptr, gameManager: mgr.gameManager, mainManager: mgr.mainManager,
        module: M, buffer: null, heapBytes: h.bytes, getterVia: via };
      res.buffer = (function () { try { var w = findModuleWin(); return w && w.Module ? (w.Module.HEAPU8 ? w.Module.HEAPU8.buffer : (w.Module.memory ? w.Module.memory.buffer : null)) : null; } catch (e) { return null; } })();
      S.getterDiag = 'OK balls=' + balls.length + ' missing=' + missing.join(',') + ' table=' + tab.ptr + ' via=' + tab.tried + ' gm=' + mgr.gameManager;
      try { var gs = $('akv2GetterStat'); if (gs) gs.textContent = 'GETTER: ' + S.getterDiag; } catch (e) {}
      return res;
    }
    function contextHash(balls) {
      var parts = [];
      var sorted = balls.slice().sort(function (a, b) { return a.num - b.num; });
      for (var i = 0; i < sorted.length; i++) parts.push(sorted[i].num + ':' + sorted[i].x.toFixed(2) + ',' + sorted[i].y.toFixed(2));
      var str = parts.join('|'), hash = 0;
      for (var j = 0; j < str.length; j++) hash = ((hash << 5) - hash + str.charCodeAt(j)) | 0;
      return 'h' + (hash >>> 0).toString(36);
    }
    // v2.58: invers simPowerToUI yang BENAR. simPowerToUI: frac =
    // 1-(1-s/mx)^2, ui = 24+frac*61. Invers: frac=(ui-24)/61,
    // s/mx = 1-sqrt(1-frac). Dulu fallback memakai (power-24)/61
    // LANGSUNG sebagai rasio — itu frac KUADRAT, bukan s/mx: mis. UI
    // 42.8 (simPower 150) -> rasio 0.309 padahal benar 0.169 (83%
    // terlalu kuat). Fallback ini hanya dipakai kalau shot.simPower
    // hilang (tembakan geometri/display); tembakan tervalidasi selalu
    // punya simPower dan tidak kena jalur ini.
    function uiPowerToRatio(ui) {
      var frac = Math.max(0, Math.min(1, ((ui || 0) - 24) / 61));
      return Math.max(0, Math.min(1, 1 - Math.sqrt(1 - frac)));
    }
    function buildPlan(autoRes, shot) {
      // Plan terikat SATU siklus: satu tembakan per plan; tablePointer /
      // shotId (contextHash posisi bola) berubah -> plan batal.
      var planId = 'p263-' + (++S.planCounter) + '-' + Date.now().toString(36);
      var cue = null, tgt = null;
      for (var i = 0; i < autoRes.balls.length; i++) if (autoRes.balls[i].num === 0) cue = autoRes.balls[i];
      if (shot && shot.targetIdx >= 0) tgt = autoRes.balls[shot.targetIdx];
      var powerRatio = 0;
      try { powerRatio = Math.max(0, Math.min(1, (shot.simPower || 0) / (S.cueMaxPower || 306))); } catch (e) {}
      if (!powerRatio && shot && shot.power) powerRatio = uiPowerToRatio(shot.power);
      // v2.58 SPIN: plan membawa english [x,y] pilihan solver (default
      // (0,0)). Kalau setter english build ini belum diketahui
      // (S.englishKnown false), spin DIPAKSA (0,0) — sim tidak boleh
      // memprediksi spin yang tidak diterapkan game. Break: (0,0).
      var spin = { x: 0, y: 0 };
      if (S.englishKnown && shot && shot.spin && isFinite(shot.spin.x) && isFinite(shot.spin.y)
          && Math.hypot(shot.spin.x, shot.spin.y) <= 1 + 1e-9 && !shot.isBreak) spin = { x: shot.spin.x, y: shot.spin.y };
      var plan = { planId: planId, tablePointer: autoRes.tablePointer, gameManager: autoRes.gameManager,
        mainManager: autoRes.mainManager, shotId: contextHash(autoRes.balls), contextHash: contextHash(autoRes.balls),
        target: tgt ? tgt.num : null, targetIdx: shot ? shot.targetIdx : -1,
        angle: shot ? shot.angle : 0, power: shot ? shot.power : 0, powerRatio: powerRatio, spin: spin,
        nominatedPocket: shot && shot.pocket ? { x: shot.pocket.x, y: shot.pocket.y } : null,
        cuePtr: cue ? cue.ptr : 0, module: autoRes.module, buffer: autoRes.buffer, used: false, createdAt: Date.now() };
      S.currentPlan = plan;
      try { sessionStorage.setItem('akv2plan263', JSON.stringify({ planId: plan.planId, tablePointer: plan.tablePointer, shotId: plan.shotId, target: plan.target, angle: plan.angle, powerRatio: plan.powerRatio })); } catch (e) {}
      log('PLAN ' + plan.planId + ' target=' + plan.target + ' angle=' + (plan.angle * 180 / Math.PI).toFixed(1) + ' powerRatio=' + plan.powerRatio.toFixed(2) + ' spin=(' + spin.x.toFixed(2) + ',' + spin.y.toFixed(2) + ')' + ' shotId=' + plan.shotId);
      return plan;
    }
    function getPlan() { return S.currentPlan || null; }
    function clearPlan(why) {
      if (S.currentPlan) log('PLAN batal: ' + (why || ''));
      S.currentPlan = null;
      try { sessionStorage.removeItem('akv2plan263'); } catch (e) {}
    }
    // v2.58: baca SATU field gate AKWeb via dynCall_iii [func, recv, sel].
    // {ok:true, value} kalau panggilan berhasil + angka; {ok:false} kalau
    // throw / bukan angka (field tetap 'unknown', JANGAN hard-fail —
    // binding-nya statis, belum tervalidasi runtime).
    function akGateCall(M, func, recv, sel) {
      try {
        var d = akDyn(M, 'dynCall_iii');
        if (!d) return { ok: false };
        var v = Reflect.apply(d.fn, d.self, [func, recv, sel]);
        if (typeof v !== 'number' || !isFinite(v)) return { ok: false };
        return { ok: true, value: v };
      } catch (e) { return { ok: false }; }
    }
    // v2.60 GETTER DOUBLE (SRET, MCNumber) — baca aimAngle/power via
    // METHOD, bukan dari heap mentah. Alasan (regresi v2.58 "cuma
    // nge-power ga nusuk"): readbackShot lama membaca mPower dari heap
    // di (cue+8), padahal aturan +4 ivar yang TERBUKTI untuk bola
    // (runtime = ivar + 4) menaruh mPower di (cue+12) — baca +8 dapat
    // pointer mVisualGuide sebagai f64 sampah -> readback SELALU gagal
    // -> commit abandon sesudah setPower -> cue tertinggal ke-charge,
    // tidak pernah takeShot. Method getter tahu offset-nya sendiri,
    // jadi kebal terhadap tebak-tebakan +8 vs +12.
    // Konvensi SRET-FIRST (outPtr dulu): malloc 16, isi sentinel NaN,
    // panggil [slot, outPtr, recv, sel], baca f64 di outPtr. Sentinel
    // NaN membedakan "getter tidak menulis" (skip, bukan gagal) dari
    // "getter menulis 0". Nilai di luar jangkauan masuk akal juga
    // dianggap tidak terbaca. Throw apa pun -> {ok:false}.
    function akGetDouble(M, slot, recv, sel) {
      try {
        if (!slot || !sel || !recv) return { ok: false };
        var d = akDyn(M, 'dynCall_viii');
        if (!d) return { ok: false };
        var ptr = akMalloc(M, 16);
        if (!ptr) return { ok: false };
        try {
          var h = heapViews();
          if (!h) { akFree(M, ptr); return { ok: false }; }
          var buf = h.module.HEAPU8 ? h.module.HEAPU8.buffer : (h.module.memory ? h.module.memory.buffer : null);
          if (!buf) { akFree(M, ptr); return { ok: false }; }
          var dv = new DataView(buf);
          dv.setFloat64(ptr, NaN, true);
          dv.setFloat64(ptr + 8, NaN, true);
          Reflect.apply(d.fn, d.self, [slot, ptr, recv, sel]);
          var v = dv.getFloat64(ptr, true);
          if (!isFinite(v)) return { ok: false };
          return { ok: true, value: v };
        } finally { try { akFree(M, ptr); } catch (eF) {} }
      } catch (e) { return { ok: false }; }
    }
    // v2.58: ambil objek visualCue (receiver setter aim/power) dari gm:
    // dynCall_iii [8016, gm, 2367669] -> *(gm+36). 0 kalau gagal.
    function akGetVisualCue(M, gm) {
      try {
        var d = akDyn(M, 'dynCall_iii');
        if (!d) return 0;
        var v = Reflect.apply(d.fn, d.self, [AKV2_LIVE.visualCueFunc, gm, AKV2_LIVE.visualCueSel]);
        return (typeof v === 'number' && v > 0) ? v : 0;
      } catch (e) { return 0; }
    }
    // v2.58: panggil SATU method void di objek cue via dynCall_vii
    // [slot, recv, sel] — dipakai killAnimation (26483). Best-effort.
    // v2.58: ambil objek VisualEnglishControl (receiver setter english)
    // dari gm: dynCall_iii [englishObjFunc, gm, englishObjSel] -> *(gm+40).
    // 0 kalau getter build ini tidak diketahui / gagal.
    function akGetEnglishObj(M, gm) {
      try {
        if (!AKV2_LIVE.englishObjFunc) return 0;
        var d = akDyn(M, 'dynCall_iii');
        if (!d) return 0;
        var v = Reflect.apply(d.fn, d.self, [AKV2_LIVE.englishObjFunc, gm, AKV2_LIVE.englishObjSel]);
        return (typeof v === 'number' && v > 0) ? v : 0;
      } catch (e) { return 0; }
    }
    // v2.58: setEnglish ala AKWeb — SATU panggilan dynCall_viii dengan
    // buffer 16 byte berisi 2 f64 (english[0] di +0, english[1] di +8),
    // receiver = objek VisualEnglishControl. English di unit disk
    // (hypot <= 1). Slot 0 = setter belum diketahui -> jangan panggil.
    function akSetEnglish(M, recv, slot, sel, x, y, label) {
      if (!slot) { log('SETTER ' + (label || 'setEnglish') + ' dilewati: setter english build ini belum diketahui (spin dipaksa 0)'); return false; }
      if (!recv) { log('SETTER ' + (label || 'setEnglish') + ' gagal: receiver (englishObj) tidak kebaca'); return false; }
      var d = akDyn(M, 'dynCall_viii');
      if (!d) { log('SETTER ' + (label || 'setEnglish') + ' gagal: dynCall_viii tidak ada'); return false; }
      var ptr = akMalloc(M, 16);
      if (!ptr) { log('SETTER ' + (label || 'setEnglish') + ' gagal: _malloc tidak ada'); return false; }
      try {
        var h = heapViews();
        if (!h) { akFree(M, ptr); return false; }
        var dv = new DataView(h.module.HEAPU8 ? h.module.HEAPU8.buffer : h.module.memory.buffer);
        dv.setFloat64(ptr, x, true);
        dv.setFloat64(ptr + 8, y, true);
        Reflect.apply(d.fn, d.self, [slot, recv, sel, ptr]);
        log('SETTER ' + (label || 'setEnglish') + ' slot=' + slot + ' sel=' + sel + ' value=(' + x.toFixed(2) + ',' + y.toFixed(2) + ') (live, receiver=englishObj)');
        return true;
      } catch (e) { log('SETTER ' + (label || 'setEnglish') + ' error: ' + e.message); return false; }
      finally { akFree(M, ptr); }
    }
    function akCallCueVoid(M, slot, recv, sel, label) {
      try {
        var d = akDyn(M, 'dynCall_vii');
        if (!d) { log(label + ' gagal: dynCall_vii tidak ada'); return false; }
        if (!recv) { log(label + ' gagal: cue tidak kebaca'); return false; }
        Reflect.apply(d.fn, d.self, [slot, recv, sel]);
        log(label + ' terkirim slot=' + slot + ' sel=' + sel);
        return true;
      } catch (e) { log(label + ' error: ' + e.message); return false; }
    }
    function readCommitState(plan) {
      // Commit gate ~20 syarat ala AKWeb. Tiap syarat dicatat sumbernya:
      //  getter = dibaca langsung, proxy = turunan terdekat yang tersedia,
      //  unknown = TIDAK BISA dibaca tanpa indeks tabel dinamis AKWeb
      //  (dynamicBindings) — field itu TIDAK dikarang offset-nya; unknown
      //  dicatat + ditampilkan di panel debug, bukan dianggap lolos diam-diam.
      //  Hard-fail hanya untuk syarat getter/proxy yang terbukti gagal.
      var g = { ok: true, reasons: [], unknown: [], failed: [] };
      function fail(code, msg) { g.ok = false; g.failed.push(code); g.reasons.push(code + ': ' + msg); }
      function unk(code) { g.unknown.push(code); }
      if (!plan) { fail('no-plan', 'tidak ada plan aktif'); return g; }
      if (plan.used) { fail('plan-used', 'plan sudah dipakai (satu tembakan per siklus)'); return g; }
      var h = heapViews();
      if (!h || !h.module) { fail('no-module', 'Module/heap hilang'); return g; }
      var M = h.module;
      if (plan.module && plan.module !== M) fail('module-changed', 'Module berubah sejak plan dibuat');
      var curBuf = null;
      try { curBuf = h.module.HEAPU8 ? h.module.HEAPU8.buffer : (h.module.memory ? h.module.memory.buffer : null); } catch (e) {}
      if (plan.buffer && plan.buffer !== curBuf) fail('memory-changed', 'buffer WASM berubah (reload/heap pindah)');
      var mgr = akGetManagers(h);
      if (!mgr.ok) { fail('manager-invalid', 'GameManager/MainManager tidak valid (gm=' + mgr.gameManager + ' mm=' + mgr.mainManager + ')'); return g; }
      if (mgr.gameManager !== plan.gameManager) fail('manager-changed', 'GameManager berubah');
      if (mgr.mainManager !== plan.mainManager) fail('mainmanager-changed', 'MainManager berubah');
      var tab = akGetTable(M, h, mgr.gameManager);
      if (!tab.ptr) { fail('table-unreadable', 'getTable gagal saat commit (' + tab.tried + ')'); return g; }
      if (tab.ptr !== plan.tablePointer) fail('table-changed', 'tablePointer berubah ' + plan.tablePointer + ' -> ' + tab.ptr);
      var fresh = readGetterBalls();
      if (!fresh) { fail('balls-unreadable', 'bola tidak terbaca saat commit'); return g; }
      if (fresh.tablePointer !== plan.tablePointer) fail('table-changed-2', 'tablePointer bola segar != plan');
      var curHash = contextHash(fresh.balls);
      if (curHash !== plan.shotId) fail('shotId-changed', 'shotId/contextHash berubah (meja bergerak sejak plan) ' + plan.shotId + ' -> ' + curHash);
      var cue = null, tgt = null, maxSpeed = 0;
      for (var i = 0; i < fresh.balls.length; i++) {
        var b = fresh.balls[i];
        var sp = Math.hypot(b.vx || 0, b.vy || 0);
        if (sp > maxSpeed) maxSpeed = sp;
        if (b.num === 0) cue = b;
        if (b.num === plan.target) tgt = b;
      }
      if (!cue) fail('no-cue', 'bola putih tidak ada');
      else if (cue.ptr !== plan.cuePtr) fail('cue-changed', 'cue ball pointer berubah');
      if (plan.target !== null && plan.target !== undefined && !tgt) fail('target-gone', 'bola target ' + plan.target + ' sudah tidak ada');
      if (maxSpeed > 0.05) fail('balls-moving', 'bola masih bergerak (maxSpeed=' + maxSpeed.toFixed(3) + ')');
      if (S.shooting) fail('already-shooting', 'tembakan lain sedang berjalan');
      if (!fresh.numbersOk) fail('numbers-not-ok', 'nomor bola tidak lengkap (cue hilang / <6 bola)');
      if (S.matchResult) fail('match-ended', 'match sudah selesai (' + S.matchResult + ')');
      // --- v2.58: field gate AKWeb dibaca LANGSUNG (binding live) ---
      // gameStateId/playerTurn/waitingForPlayerShot/winnerDefined di gm;
      // inputActive/powerMode/animating di objek visualCue. Panggilan yang
      // throw / bukan angka -> 'unknown' (perilaku v2.50), BUKAN gagal.
      // Nilai numerik yang salah -> hard-fail, ala AKWeb.
      var gs = akGateCall(M, AKV2_LIVE.gameStateFunc, mgr.gameManager, AKV2_LIVE.gameStateSel);
      if (gs.ok && gs.value !== 4) fail('gameState-not-4', 'gameStateId=' + gs.value + ' (7=aiming, bukan giliran kita)');
      if (!gs.ok) unk('gameStateId==4 (tidak terbaca)');
      var pt = akGateCall(M, AKV2_LIVE.playerTurnFunc, mgr.gameManager, AKV2_LIVE.playerTurnSel);
      if (pt.ok && pt.value !== 1) fail('not-player-turn', 'isPlayerTurn=' + pt.value);
      if (!pt.ok) unk('playerTurn==1 (tidak terbaca)');
      var ws = akGateCall(M, AKV2_LIVE.waitingShotFunc, mgr.gameManager, AKV2_LIVE.waitingShotSel);
      if (ws.ok && ws.value !== 1) fail('not-waiting-shot', 'isWaitingForPlayerShot=' + ws.value);
      if (!ws.ok) unk('waitingForPlayerShot==1 (tidak terbaca)');
      var wd = akGateCall(M, AKV2_LIVE.winnerDefinedFunc, mgr.gameManager, AKV2_LIVE.winnerDefinedSel);
      if (wd.ok && wd.value !== 0) fail('winner-defined', 'isWinnerDefined=' + wd.value);
      if (!wd.ok) unk('winnerDefined==0 (tidak terbaca)');
      var cs = akGateCall(M, AKV2_LIVE.currentShotIdFunc, mgr.gameManager, AKV2_LIVE.currentShotIdSel);
      if (cs.ok) g.shotIdGame = cs.value; else unk('currentShotId (tidak terbaca)');
      var cueObj = akGetVisualCue(M, mgr.gameManager);
      if (cueObj) {
        var ia = akGateCall(M, AKV2_LIVE.inputActiveFunc, cueObj, AKV2_LIVE.inputActiveSel);
        if (ia.ok && ia.value !== 1) fail('input-inactive', 'inputActive=' + ia.value);
        if (!ia.ok) unk('inputActive==1 (tidak terbaca)');
        var pm = akGateCall(M, AKV2_LIVE.powerModeFunc, cueObj, AKV2_LIVE.powerModeSel);
        if (pm.ok && pm.value !== 0) fail('power-mode', 'powerMode=' + pm.value);
        if (!pm.ok) unk('powerMode==0 (tidak terbaca)');
        var aa = akGateCall(M, AKV2_LIVE.aimAnimFunc, cueObj, AKV2_LIVE.aimAnimSel);
        if (aa.ok && aa.value !== 0) fail('aim-animating', 'isAnimatingAimAngle=' + aa.value);
        if (!aa.ok) unk('aimAnimating==0 (tidak terbaca)');
        var pa = akGateCall(M, AKV2_LIVE.powerAnimFunc, cueObj, AKV2_LIVE.powerAnimSel);
        if (pa.ok && pa.value !== 0) fail('power-animating', 'isAnimatingPower=' + pa.value);
        if (!pa.ok) unk('powerAnimating==0 (tidak terbaca)');
        g.cueObject = cueObj;
      } else {
        unk('inputActive==1 (cue tidak kebaca)');
        unk('powerMode==0 (cue tidak kebaca)');
        unk('aimAnimating==0 (cue tidak kebaca)');
        unk('powerAnimating==0 (cue tidak kebaca)');
      }
      unk('turnTimeFinished==0');
      unk('gameManagerTouches==0');
      unk('cueTouches==0');
      unk('inputActionDelay==0');
      unk('englishAnimationTime<=0');
      // Proxy terdekat yang tersedia (ditandai sebagai proxy, bukan bacaan asli):
      // tableAnimating ~ bola berhenti (sudah dicek di atas); touches/delayed
      // input ~ kita tidak pernah mengirim pointer event untuk menembak,
      // jadi tidak ada input tertunda dari solver.
      g.maxSpeed = maxSpeed; g.tablePointer = tab.ptr; g.shotId = curHash;
      if (g.unknown.length) log('GATE unknown (tidak bisa dibaca tanpa dynamicBindings AKWeb, BUKAN lolos): ' + g.unknown.join(' | '));
      return g;
    }
    // v2.60 READBACK — pastikan nilai yang ditulis setter BENAR-BENAR
    // sampai di game sebelum takeShot. LOLOS kalau ada SATU sumber yang
    // cocok dengan plan; GAGAL hanya kalau SEMUA sumber yang terbaca
    // TIDAK cocok. Sumber tidak terbaca = diabaikan (bukan gagal):
    // v2.57 menembak tanpa readback sama sekali dan itu JALAN.
    // Toleransi: power 0.02 (rasio), aim 1e-4 rad — cukup ketat untuk
    // menangkap power salah total (bug buildPlan v2.58: 83% vs 30%),
    // cukup longgar untuk noise float / kurva setter.
    // Sumber power: getter method (akGetDouble, kebal offset) + heap
    // mentah di KEDUA kandidat offset (+8 dan +12 — jangan tebak).
    // Sumber aim: getter method + heap (*(cue+4)+24) dan (*(cue+8)+24).
    function readbackShot(M, cueObj, plan) {
      try {
        if (!cueObj) return { ok: true, skipped: true };
        var h = heapViews();
        if (!h) return { ok: true, skipped: true };
        var buf = h.module.HEAPU8 ? h.module.HEAPU8.buffer : (h.module.memory ? h.module.memory.buffer : null);
        if (!buf) return { ok: true, skipped: true };
        var dv = new DataView(buf);
        function rawF64(off) {
          try { var v = dv.getFloat64(cueObj + off, true); return isFinite(v) ? v : null; } catch (e) { return null; }
        }
        // --- power ---
        var pwSources = [];
        var gPw = akGetDouble(M, AKV2_LIVE.powerSlot, cueObj, AKV2_LIVE.powerSel);
        if (gPw.ok) pwSources.push(gPw.value);
        var r8 = rawF64(8); if (r8 !== null) pwSources.push(r8);
        var r12 = rawF64(12); if (r12 !== null) pwSources.push(r12);
        if (pwSources.length) {
          var pwOk = false;
          for (var i = 0; i < pwSources.length; i++) if (Math.abs(pwSources[i] - plan.powerRatio) <= 0.02) { pwOk = true; break; }
          if (!pwOk) return { ok: false, why: 'power tidak cocok: sumber=' + pwSources.map(function (v) { return v.toFixed(4); }).join('/') + ' != powerRatio=' + plan.powerRatio.toFixed(4) };
        }
        // --- aim ---
        var anSources = [];
        var gAn = akGetDouble(M, AKV2_LIVE.aimAngleSlot, cueObj, AKV2_LIVE.aimAngleSel);
        if (gAn.ok) anSources.push(gAn.value);
        try {
          var sub4 = dv.getUint32(cueObj + 4, true);
          if (sub4) { var a4 = dv.getFloat64(sub4 + 24, true); if (isFinite(a4)) anSources.push(a4); }
        } catch (e) {}
        try {
          var sub8 = dv.getUint32(cueObj + 8, true);
          if (sub8) { var a8 = dv.getFloat64(sub8 + 24, true); if (isFinite(a8)) anSources.push(a8); }
        } catch (e) {}
        if (anSources.length) {
          var anOk = false;
          for (var j = 0; j < anSources.length; j++) if (Math.abs(anSources[j] - plan.angle) <= 1e-4) { anOk = true; break; }
          if (!anOk) return { ok: false, why: 'aim tidak cocok: sumber=' + anSources.map(function (v) { return v.toFixed(4); }).join('/') + ' != plan.angle=' + plan.angle.toFixed(4) };
        }
        return { ok: true };
      } catch (e) { return { ok: true, skipped: true }; }
    }
    function akSetDouble(M, recv, slot, sel, value, label) {
      // Setter double pola AKWeb: malloc(16) -> setFloat64(0, value, LE) ->
      // dynCall_viii(slot, receiver, selector, ptr) -> free. v2.58: receiver
      // = objek CUE (visualCue), selector live (setAim 8402899, setPower
      // 8402950). v2.58 memanggil di GameManager dengan selector 0 — objek
      // salah + selector salah, jadi setter hampir pasti no-op.
      if (!recv) { log('SETTER ' + label + ' gagal: receiver (cue) tidak kebaca'); return false; }
      var d = akDyn(M, 'dynCall_viii');
      if (!d) { log('SETTER ' + label + ' gagal: dynCall_viii tidak ada'); return false; }
      var ptr = akMalloc(M, 16);
      if (!ptr) { log('SETTER ' + label + ' gagal: _malloc tidak ada'); return false; }
      try {
        var h = heapViews();
        if (!h) { akFree(M, ptr); return false; }
        var dv = new DataView(h.module.HEAPU8 ? h.module.HEAPU8.buffer : h.module.memory.buffer);
        dv.setFloat64(ptr, value, true);
        Reflect.apply(d.fn, d.self, [slot, recv, sel, ptr]);
        log('SETTER ' + label + ' slot=' + slot + ' sel=' + sel + ' value=' + value.toFixed(4) + ' (live, receiver=cue)');
        return true;
      } catch (e) { log('SETTER ' + label + ' error: ' + e.message); return false; }
      finally { akFree(M, ptr); }
    }
    function akTakeShot(M, mgr) {
      // takeShot GameManager slot 7945 via dynCall_vii, pola AKWeb:
      // Reflect.apply(dynCall_vii, thisArg, [tableIndex, manager, selector]).
      // Selector live 2400642 (diambil dari AKV2_LIVE.takeShotSel; flag
      // lama 'v2.58 memakai 0' sudah tidak berlaku — dicek 2026-11-10:
      // satu-satunya definisi takeShotSel ada di baris AKV2_LIVE = 2400642).
      var d = akDyn(M, 'dynCall_vii');
      if (!d) { log('TAKESHOT gagal: dynCall_vii tidak ada'); return false; }
      try {
        Reflect.apply(d.fn, d.self, [AKV2_LIVE.takeShotSlot, mgr, AKV2_LIVE.takeShotSel]);
        log('TAKESHOT slot=7945 sel=2400642 terkirim (live)');
        return true;
      } catch (e) { log('TAKESHOT error: ' + e.message); return false; }
    }
    async function commitShot(plan) {
      // Urutan commit ala AKWeb: gate -> kill-animation/zero-power ->
      // gate ulang -> restore-angle -> gate ulang -> setAim -> setEnglish
      // -> gate ulang (g3) -> setPower -> readback -> takeShot. Satu
      // gagal = abandoned (log alasannya).
      // v2.60 PERBAIKAN "cuma nge-power ga nusuk" (regresi v2.58):
      // g3 DULU sesudah setPower — padahal setPower sendiri yang
      // menyalakan powerMode/powerAnimating dan readback lama membaca
      // heap di offset yang salah (cue+8, lihat readbackShot), jadi
      // commit SELALU abandon sesudah setPower dan cue tertinggal
      // ke-charge selamanya. Sekarang: (1) g3 pindah SEBELUM setPower
      // (state pre-charge yang dicek, bukan akibat setPower sendiri);
      // (2) readback pakai getter method + toleransi + skip kalau tidak
      // terbaca; (3) SETIAP abandon sesudah power ke-charge WAJIB
      // zero-power dulu (cue tidak pernah tertinggal ke-charge).
      if (!plan) plan = getPlan();
      if (!plan) { S.lastGateFail = ['no-plan']; S.lastGateReasons = ['no-plan: tidak ada plan']; log('COMMIT gagal: tidak ada plan'); stat('GATE GAGAL [no-plan] — tidak ada plan'); return false; }
      S.lastGateFail = []; S.lastGateReasons = [];
      var g0 = readCommitState(plan);
      if (!g0.ok) { S.lastGateFail = g0.failed.slice(); S.lastGateReasons = g0.reasons.slice(); log('COMMIT ABANDONED (gate awal): ' + g0.reasons.join(' ; ')); stat('GATE GAGAL [' + g0.failed.join(',') + '] — tembak dynCall ditahan'); clearPlan('gate awal gagal'); return false; }
      var h = heapViews();
      if (!h) { log('COMMIT ABANDONED: heap hilang'); return false; }
      var M = h.module, mgr = plan.gameManager;
      // v2.58: receiver setter = objek visualCue (bukan GameManager).
      var cueObj = akGetVisualCue(M, mgr);
      if (!cueObj) log('COMMIT: visualCue tidak kebaca — setter aim/power tidak bisa jalan (receiver cue)');
      // v2.58: S.shooting TIDAK di-set di sini. Dulu `S.shooting = true`
      // di-set di awal commitShot, padahal gate ulang g1/g2/g3 memanggil
      // readCommitState yang MENOLAK kalau S.shooting true
      // (fail 'already-shooting') — jadi commit SELALU abandon sesudah
      // zero-power dan TIDAK PERNAH sampai ke takeShot. Itulah kenapa
      // autoplay tidak pernah menembak. S.shooting baru di-set sesaat
      // sebelum takeShot (sesudah gate g3 lolos). S.linesFrozen tetap
      // di sini (hanya memengaruhi gambar overlay, bukan gate).
      S.linesFrozen = true;
      // v2.60: flag + helper abandon — kalau power sudah ke-charge,
      // kembalikan ke 0 dulu sebelum pulang, supaya cue tidak tertinggal
      // ke-charge dan tick berikutnya mulai dari keadaan bersih.
      var charged = false;
      function abandon(code, msg) {
        if (charged && cueObj) { try { akSetDouble(M, cueObj, AKV2_LIVE.setPowerSlot, AKV2_LIVE.setPowerSel, 0, 'zero-power-abandon'); } catch (e) {} charged = false; }
        S.lastGateFail = [code]; S.lastGateReasons = [code + ': ' + msg];
        log('COMMIT ABANDONED (' + code + '): ' + msg);
        stat('TEMBAK dynCall ditahan: ' + msg);
        return false;
      }
      try {
        // Langkah 0 — killAnimation beneran (26483 di cue, best-effort).
        // v2.58 memakai zero-power sebagai pengganti; sekarang keduanya
        // jalan (kill dulu, lalu zero-power). Gagal = dicatat, lanjut.
        akCallCueVoid(M, AKV2_LIVE.killAnimSlot, cueObj, AKV2_LIVE.killAnimSel, 'KILL-ANIM');
        // Langkah 1 — zero-power (kill-animation ala AKWeb: matikan animasi
        // power sebelum commit). Kalau setter tidak tersedia, langkah ini
        // dicatat 'setter-unavailable' dan dilewati — kita tidak pernah
        // menggerakkan power via pointer, jadi tidak ada animasi solver.
        var zp = akSetDouble(M, cueObj, AKV2_LIVE.setPowerSlot, AKV2_LIVE.setPowerSel, 0, 'zero-power');
        if (!zp) log('COMMIT langkah zero-power: setter tidak tersedia (unknown, lanjut — tidak ada animasi pointer dari solver)');
        var g1 = readCommitState(plan);
        if (!g1.ok) { S.lastGateFail = g1.failed.slice(); S.lastGateReasons = g1.reasons.slice(); log('COMMIT ABANDONED (gate sesudah zero-power): ' + g1.reasons.join(' ; ')); stat('GATE GAGAL [' + g1.failed.join(',') + '] — tembak dynCall ditahan'); return false; }
        // Langkah 2 — restore-angle: kembalikan sudut aim ke sudut plan.
        var ra = akSetDouble(M, cueObj, AKV2_LIVE.setAimSlot, AKV2_LIVE.setAimSel, plan.angle, 'restore-angle');
        if (!ra) log('COMMIT langkah restore-angle: setter tidak tersedia (unknown, lanjut)');
        var g2 = readCommitState(plan);
        if (!g2.ok) { S.lastGateFail = g2.failed.slice(); S.lastGateReasons = g2.reasons.slice(); log('COMMIT ABANDONED (gate sesudah restore-angle): ' + g2.reasons.join(' ; ')); stat('GATE GAGAL [' + g2.failed.join(',') + '] — tembak dynCall ditahan'); return false; }
        // Langkah 3 — setAimAngle: identitas (angle dunia langsung, tanpa
        // mapping/offset). Ghost-ball: angle = atan2(G.y-cue.y, G.x-cue.x),
        // dan shot.angle solver sudah = atan2 itu.
        if (!akSetDouble(M, cueObj, AKV2_LIVE.setAimSlot, AKV2_LIVE.setAimSel, plan.angle, 'setAimAngle')) {
          return abandon('setter-failed', 'setAimAngle gagal');
        }
        // Langkah 3b — setEnglish (spin) ala AKWeb: english [x,y] di unit
        // disk, SATU panggilan dynCall_viii dengan 2 f64. Urutan AKWeb:
        // aim, english, power. Break dan tembakan tanpa spin: [0,0]
        // (aturan AKWeb: lucky/first-snooker WAJIB [0,0]; break juga
        // [0,0]). Dipanggil JUGA untuk (0,0) kalau setter diketahui —
        // supaya english sisa (mis. dari kontrol in-game) tidak terbawa.
        // Kalau setter build ini belum diketahui (slot 0), dilewati —
        // plan.spin sudah dipaksa (0,0) di buildPlan. Kalau setter
        // GAGAL, matikan S.englishKnown supaya tick berikut menembak
        // tanpa spin (bukan macet selamanya).
        var sp = plan.spin || { x: 0, y: 0 };
        // v2.58 CLAMP english ala AKWeb: plan AKWeb memvalidasi
        // hypot(english) <= 1+1e-9; normalisasi ke unit disk supaya
        // game tidak menerima spin di luar jangkauan, dan supaya
        // readback di bawah membandingkan nilai yang SAMA dengan
        // yang ditulis setter (bukan nilai pra-clamp).
        var _sh = Math.hypot(sp.x, sp.y); if (_sh > 1) { sp = { x: sp.x / _sh, y: sp.y / _sh }; }
        if (AKV2_LIVE.englishSlot) {
          var engObj = akGetEnglishObj(M, mgr);
          if (!engObj) {
            if (sp.x !== 0 || sp.y !== 0) {
              return abandon('setter-failed', 'englishObj tidak kebaca padahal spin=(' + sp.x + ',' + sp.y + ')');
            }
            log('COMMIT langkah setEnglish: englishObj tidak kebaca — spin (0,0), lanjut (tidak ada spin yang hilang)');
          } else if (!akSetEnglish(M, engObj, AKV2_LIVE.englishSlot, AKV2_LIVE.englishSel, sp.x, sp.y, 'setEnglish')) {
            S.englishKnown = false;
            return abandon('setter-failed', 'setEnglish gagal (englishKnown dimatikan)');
          }
        }
        // v2.60: GATE AKHIR (g3) DI SINI — sebelum setPower, bukan
        // sesudahnya. setPower sendiri menyalakan powerMode / animasi
        // power, jadi gate sesudah setPower pasti gagal dan commit tidak
        // pernah sampai takeShot (regresi v2.58). State yang dicek di
        // sini adalah state pre-charge yang benar.
        var g3 = readCommitState(plan);
        if (!g3.ok) { S.lastGateFail = g3.failed.slice(); S.lastGateReasons = g3.reasons.slice(); log('COMMIT ABANDONED (gate akhir): ' + g3.reasons.join(' ; ')); stat('GATE GAGAL [' + g3.failed.join(',') + '] — tembak dynCall ditahan'); return false; }
        // Langkah 4 — setPower (powerRatio 0..1 dari simPower/cueMaxPower).
        if (!akSetDouble(M, cueObj, AKV2_LIVE.setPowerSlot, AKV2_LIVE.setPowerSel, plan.powerRatio, 'setPower')) {
          return abandon('setter-failed', 'setPower gagal');
        }
        charged = true;
        // v2.60 READBACK ala AKWeb: pastikan nilai yang ditulis setter
        // BENAR-BENAR sampai di game sebelum takeShot. Kalau meleset,
        // JANGAN tembak dengan power/sudut yang salah — itu persis
        // keluhan user ("power tidak sesuai garis prediksi"). Versi
        // v2.58 membaca heap mentah di offset salah (cue+8) dan selalu
        // gagal; v2.60 pakai getter method + toleransi (lihat
        // readbackShot) dan tidak pernah gagal karena sumber tidak
        // terbaca. Abandon di sini WAJIB zero-power dulu (lewat
        // abandon()).
        var rb = readbackShot(M, cueObj, plan);
        if (!rb.ok) { return abandon('setter-readback', rb.why); }
        // v2.60 READBACK english ala AKWeb: mEnglish di (engObj+8/+16)
        // harus == plan.spin — TAPI hanya ditegakkan kalau spin memang
        // diminta (sp != 0,0). Kalau spin (0,0) dan readback meleset,
        // itu cuma sisa spin lama / setter tidak menulis; tembakan tetap
        // jalan (v2.57 menembak tanpa readback english dan itu jalan).
        // Abandon atas spin (0,0) adalah salah satu penyebab "cuma
        // nge-power ga nusuk" — jangan ulangi.
        if (typeof engObj !== 'undefined' && engObj && typeof sp !== 'undefined' && sp && (sp.x !== 0 || sp.y !== 0)) {
          try {
            var hRB = heapViews();
            if (hRB) {
              var bufRB = hRB.module.HEAPU8 ? hRB.module.HEAPU8.buffer : (hRB.module.memory ? hRB.module.memory.buffer : null);
              if (bufRB) {
                var dvRB = new DataView(bufRB);
                var ex = dvRB.getFloat64(engObj + 8, true), ey = dvRB.getFloat64(engObj + 16, true);
                if ((isFinite(ex) && Math.abs(ex - sp.x) > 1e-9) || (isFinite(ey) && Math.abs(ey - sp.y) > 1e-9)) {
                  return abandon('setter-readback', 'english=(' + ex + ',' + ey + ') != plan.spin=(' + sp.x + ',' + sp.y + ')');
                }
              }
            }
          } catch (eRBE) {}
        }
        // Langkah 5 — takeShot via dynCall (BUKAN drag pointer canvas).
        // v2.58: S.shooting = true HANYA di sini, sesudah gate terakhir
        // (g3) lolos. Kalau di-set lebih awal, gate ulang g1/g2/g3 akan
        // gagal 'already-shooting' (lihat komentar di awal commitShot).
        S.shooting = true;
        if (!akTakeShot(M, mgr)) { return abandon('takeshot-failed', 'takeShot gagal'); }
        charged = false;
        plan.used = true;
        S.autoPreShotNums = null;
        S.scanCache = null; // v2.58: posisi berubah habis tembak — cache scan harus baca ulang.
        log('COMMIT TERKIRIM plan=' + plan.planId + ' target=' + plan.target + ' angle=' + (plan.angle * 180 / Math.PI).toFixed(1) + ' powerRatio=' + plan.powerRatio.toFixed(2));
        clearPlan('terkirim');
        return true;
      } catch (e) {
        if (charged && cueObj) { try { akSetDouble(M, cueObj, AKV2_LIVE.setPowerSlot, AKV2_LIVE.setPowerSel, 0, 'zero-power-error'); } catch (eZ) {} }
        log('COMMIT error: ' + e.message); return false;
      }
      finally {
        setTimeout(function () { S.shooting = false; S.linesFrozen = false; }, 800);
      }
    }
    // v2.58: KODE GATE YANG BOLEH DRAG — hanya kegagalan manager/table
    // (binding live tidak jalan / meja belum kebaca). Alasan lain (bola bergerak,
    // cue hilang, shotId berubah, nomor tidak lengkap, match selesai,
    // dsb.) = JANGAN drag, tunggu tick berikutnya.
    var DRAG_GATE_CODES = ['manager-invalid', 'manager-changed', 'mainmanager-changed', 'table-unreadable', 'table-changed', 'table-changed-2'];
    // v2.58: TEMBAK DRAG (dari v2.46 shootLast, diadaptasi: terima
    // res/shot/plan langsung, tanpa S.lastScan). Pointerdown/move/up di
    // canvas game via worldToScreen(cue/ghost) + tarikan dari shot.power.
    // TIDAK ada fase belajar di sini; tembakan yang dipakai adalah shot
    // yang SUDAH dipilih plan (tidak re-pick).
    async function dragShoot(res, shot, plan) {
      if (S.shooting) { log('TEMBAK DRAG ditahan: masih menembak'); return false; }
      if (!res || !shot) { log('TEMBAK DRAG gagal: tidak ada res/shot'); return false; }
      if (!shot.ghost || shot.ghost.length < 2 || !isFinite(shot.ghost[0]) || !isFinite(shot.ghost[1])) { log('TEMBAK DRAG gagal: shot tidak punya ghost'); return false; }
      if (!res.numbersOk) { log('TEMBAK DRAG DIBLOKIR: nomor tidak lengkap (cue hilang / <6 bola).'); return false; }
      var cv = largestCanvas();
      if (!cv) { log('TEMBAK DRAG gagal: canvas tidak ketemu'); return false; }
      var cue = null;
      for (var i = 0; i < res.balls.length; i++) if (res.balls[i].num === 0) cue = res.balls[i];
      if (!cue) { log('TEMBAK DRAG gagal: cue tidak ketemu'); return false; }
      S.shooting = true; S.linesFrozen = true;
      setTimeout(function () { S.shooting = false; }, 3000);
      try {
        var rect = cv.rect;
        var cs = worldToScreen(cue.x, cue.y, rect);
        // ARAH BIDIK DALAM KOORDINAT LAYAR (fix v2.46 2026-10-31): arah
        // diambil dari P(cue)->P(ghost) di layar, otomatis benar termasuk
        // flip Y, anisotropi, dan offset kalibrasi.
        var gs = worldToScreen(shot.ghost[0], shot.ghost[1], rect);
        var sdx = gs[0] - cs[0], sdy = gs[1] - cs[1];
        var sl = Math.hypot(sdx, sdy) || 1; sdx /= sl; sdy /= sl;
        var ringDist = Math.min(180, rect.width * 0.35);
        var ring = [cs[0] + sdx * ringDist, cs[1] + sdy * ringDist];
        ring[0] = Math.max(rect.left + 5, Math.min(rect.left + rect.width - 5, ring[0]));
        ring[1] = Math.max(rect.top + 5, Math.min(rect.top + rect.height - 5, ring[1]));
        log('TEMBAK DRAG aim angle=' + (shot.angle * 180 / Math.PI).toFixed(1) + ' power=' + shot.power);
        for (var s = 0; s <= 4; s++) { fireHover(cv.el, cs[0] + (ring[0] - cs[0]) * s / 4, cs[1] + (ring[1] - cs[1]) * s / 4); await sleep(20); }
        fireHover(cv.el, ring[0], ring[1]); await sleep(120);
        // Tarikan cue dilunakkan mengikuti retune power v2.46.
        var pullLen = (40 + shot.power / 100 * 200) * (rect.width / 587);
        var start = ring.slice(), end = [ring[0] - sdx * pullLen, ring[1] - sdy * pullLen];
        fire(cv.el, 'pointerdown', start[0], start[1]);
        for (var j = 1; j <= 6; j++) { fire(cv.el, 'pointermove', start[0] + (end[0] - start[0]) * j / 6, start[1] + (end[1] - start[1]) * j / 6); await sleep(25); }
        await sleep(40);
        fire(cv.el, 'pointerup', end[0], end[1]);
        if (plan) plan.used = true;
        S.autoPreShotNums = null;
        S.scanCache = null;
        var tgtNum = (shot.targetIdx >= 0 && res.balls[shot.targetIdx]) ? res.balls[shot.targetIdx].num : '?';
        log('TEMBAK DRAG TERKIRIM target=' + tgtNum + ' power=' + shot.power + ' (fallback, gate manager/table gagal)');
        stat('TEMBAK DRAG terkirim (fallback gate manager/table)');
        clearPlan('drag terkirim');
        return true;
      } catch (e) { log('TEMBAK DRAG error: ' + e.message); return false; }
      finally { setTimeout(function () { S.shooting = false; S.linesFrozen = false; }, 800); }
    }
    // v2.58: TEMBAK SATU PINTU — coba dynCall dulu, fallback DRAG hanya
    // kalau gate gagal SEMATA karena manager/table. Alasan gate lain =
    // JANGAN drag, tunggu tick berikutnya.
    async function shootWithFallback(plan, res, shot) {
      var ok = await commitShot(plan);
      // v2.58: catat hasil tembakan untuk diagnostik panel.
      if (ok) { S.lastShot = { at: Date.now(), result: 'dynCall TERKIRIM', target: plan.target }; log('TEMBAK dynCall'); return true; }
      var codes = S.lastGateFail || [];
      var onlyMgrTable = codes.length > 0 && codes.every(function (c) { return DRAG_GATE_CODES.indexOf(c) >= 0; });
      if (!onlyMgrTable) {
        var why = codes.length ? codes.join(',') : 'dynCall/setter gagal';
        S.lastShot = { at: Date.now(), result: 'DITAHAN [' + why + ']' };
        log('TEMBAK ditahan: gate [' + why + '] bukan manager/table — tunggu tick berikutnya, TIDAK drag.');
        stat('GATE GAGAL [' + why + '] — tidak drag, tunggu tick berikut');
        return false;
      }
      log('TEMBAK DRAG fallback (gate: ' + codes.join(',') + ')');
      var dr = await dragShoot(res, shot, plan);
      S.lastShot = { at: Date.now(), result: dr ? 'DRAG TERKIRIM' : 'DRAG GAGAL' };
      return dr;
    }
    function debugGetter() {
      var r = readGetterBalls();
      if (!r) { log('DEBUG GETTER: GAGAL — ' + (S.getterDiag || 'tanpa diag')); stat('GETTER GAGAL: ' + (S.getterDiag || '')); return; }
      var txt = r.balls.map(function (b) { return b.num + '@' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ' v=' + Math.hypot(b.vx, b.vy).toFixed(2) + ' st=' + b.state; }).join(' ');
      log('DEBUG GETTER: ' + r.balls.length + ' bola | ' + txt);
      log('DEBUG GETTER: hilang=' + r.missing.join(',') + ' table=' + r.tablePointer + ' gm=' + r.gameManager + ' mm=' + r.mainManager + ' via=' + JSON.stringify(r.getterVia));
      stat('GETTER OK: ' + r.balls.length + ' bola, hilang ' + r.missing.length + '. ' + (S.getterDiag || ''));
    }
    function debugCommitGate() {
      var plan = getPlan();
      if (!plan) {
        var r = readGetterBalls();
        if (!r) { log('DEBUG GATE: tidak ada plan & bola tidak terbaca'); return; }
        var sh = pickShot(r.balls, r.pockets, r.radius, S.group, S.allowBank, r.pocketWidth);
        if (!sh) { log('DEBUG GATE: tidak ada tembakan (plan tidak bisa dibuat)'); return; }
        plan = buildPlan(r, sh);
      }
      var g = readCommitState(plan);
      log('DEBUG GATE plan=' + plan.planId + ' ok=' + g.ok + ' gagal=[' + g.failed.join(',') + '] alasan=[' + g.reasons.join(' ; ') + ']');
      log('DEBUG GATE unknown (perlu dynamicBindings AKWeb): ' + g.unknown.join(' | '));
      stat('GATE plan ' + plan.planId + ': ' + (g.ok ? 'LOLOS (unknown: ' + g.unknown.length + ' field)' : 'GAGAL: ' + g.failed.join(',')));
    }
    function loopTick() {
      // v2.58 (§24): SATU tick logis — dipanggil rAF loop DAN fallback timer.
      // Baca bola max 1x/150ms, hitung signature (jumlah + posisi +
      // kecepatan bola). AUTOPLAY: autoTick dipanggil SETIAP tick selama
      // autoplay ON, BUKAN hanya saat signature berubah — di meja diam
      // dua snapshot 300 ms bisa BIT-IDENTIK, dan autoStableCheck butuh
      // DUA pemanggilan autoTick (pertama: count=1, false); kalau autoTick
      // hanya jalan saat berubah, count mentok di 1 selamanya dan shootNext
      // tidak pernah tercapai (itu penyebab autoplay v2.52 diam). Throttle
      // 150 ms + autoStableCheck + autoDetectCheck + S.ticking/S.shooting
      // sudah mencegah tembakan liar. Mode manual (bukan autoplay) tetap
      // hanya me-refresh overlay saat signature berubah.
      try {
        var now = Date.now();
        if (now - S.rafLastRead < 150) return;
        S.rafLastRead = now;
        var r = readGetterBalls();
        if (!r) return;
        var sigParts = [r.balls.length, S.autoBeruntun ? 'A' : 'a', S.group || '-', S.gameMode];
        for (var i = 0; i < r.balls.length; i++) sigParts.push(r.balls[i].num + ':' + r.balls[i].x.toFixed(1) + ',' + r.balls[i].y.toFixed(1));
        var sig = sigParts.join('|');
        var changed = (sig !== S.rafLastSig);
        S.rafLastSig = sig;
        S.lastGetterRes = r;
        S.diagTick = (S.diagTick || 0) + 1;
        // v2.58: AUTOPLAY OTOMATIS ON saat meja match terdeteksi (bola
        // kebaca, numbersOk) — user minta autoplay "gerak2 sendiri", dan
        // default OFF adalah jebakan: deteksi jalan, garis muncul, tapi
        // tidak pernah menembak kalau tombol AUTO PLAY tidak ditekan.
        // Dihormati: kalau user sengaja mematikan (autoUserOff), jangan
        // nyalakan lagi. Gate + autoStableCheck + sim-validasi tetap yang
        // memutuskan boleh tidaknya menembak.
        if (!S.autoBeruntun && !S.autoUserOff && r.numbersOk && r.balls.length >= 2) {
          try { setBeruntun(true); log('AUTOPLAY OTOMATIS ON — meja match terdeteksi (tap AUTO PLAY untuk mematikan)'); } catch (eAE) {}
        }
        try { updateDiag(); } catch (eUD) {}
        if (S.autoBeruntun) {
          // v2.58 (§24): autoTick tiap tick saat autoplay ON — jangan
          // tunggu signature berubah (meja diam = snapshot identik).
          autoTick().catch(function () {});
          // v2.60: garis LIVE juga saat autoplay ON — kalau user geser
          // aim/power manual, preview ngikutin; kalau tidak, throttle
          // signature bikin ini no-op (garis plan tetap yang digambar).
          try { if (S.lastScan && S.lastScan.shot && S.lastGetterRes) livePreview(S.lastGetterRes, S.lastScan.shot); } catch (eLP2) {}
        } else if (!S.linesFrozen) {
          // v2.63 GARIS MANUAL REALTIME (autoplay OFF): preview jalan
          // TIAP TICK, bukan cuma kalau bola berubah — user geser aim /
          // nge-charge power -> garis + titik berhenti ngikutin tiap
          // frame, kayak cheto. Sebelum v2.63, cabang ini cuma
          // `changed && !linesFrozen` (refreshOverlay): pas drag aim/
          // power, bola diam -> signature tidak berubah -> garis tidak
          // pernah ke-refresh. Sekarang: rebuild tembakan manual dari
          // aim live + livePreview di power live tiap tick (baca bola
          // sudah di-throttle 150 ms di atas). livePreview throttle
          // signature (aim|power|cue) bikin re-sim cuma jalan kalau
          // aim/power berubah; drawShot fallback cuma kalau tembakan
          // manualnya berubah (mSig) — diam tidak bikin redraw sia-sia.
          // Bola bergerak = skip (overlay dibiarkan, sama seperti
          // refreshOverlay). Aim tidak terbaca + bola berubah =
          // fallback refreshOverlay (garis pick solver).
          try {
            var _mr = S.lastGetterRes;
            if (_mr && _mr.balls && _mr.balls.length >= 2) {
              var _still = true;
              for (var _mi = 0; _mi < _mr.balls.length; _mi++) {
                if (Math.hypot(_mr.balls[_mi].vx || 0, _mr.balls[_mi].vy || 0) > 0.05) { _still = false; break; }
              }
              if (_still) {
                var _mShot = null;
                try { _mShot = manualShotFromAim(_mr); } catch (eMS2) { _mShot = null; }
                if (_mShot) {
                  S.lastScan = { res: _mr, shot: _mShot };
                  var _drew = false;
                  try { _drew = livePreview(_mr, _mShot); } catch (eLP3) {}
                  if (!_drew) {
                    var _mSig = _mShot.angle.toFixed(3) + '|' + _mShot.targetIdx + '|' + _mShot.ghost[0].toFixed(1) + ',' + _mShot.ghost[1].toFixed(1);
                    if (_mSig !== S.lastManualSig) { S.lastManualSig = _mSig; drawShot(_mShot, _mr); }
                  }
                } else if (changed) {
                  refreshOverlay().catch(function () {});
                }
              }
            }
          } catch (eMLT) {}
        }
      } catch (e) { try { log('RAF error: ' + e.message); } catch (e2) {} }
    }
    function rafLoop() {
      if (!S.rafRunning) return;
      requestAnimationFrame(rafLoop);
      loopTick();
    }
    function startRafLoop() {
      if (S.rafRunning) return;
      S.rafRunning = true;
      requestAnimationFrame(rafLoop);
      // v2.58: fallback timer 250ms (rantai setTimeout, BUKAN setInterval)
      // — kalau requestAnimationFrame tidak pernah jalan di WebView ini,
      // loop tetap jalan lewat timer. loopTick() di-throttle 250ms, jadi
      // rAF + timer tidak akan dobel-jalan.
      (function tmLoop() {
        if (!S.rafRunning) return;
        setTimeout(tmLoop, 150);
        try { loopTick(); } catch (e) {}
      })();
      log('rAF loop dimulai (tanpa setInterval polling) + fallback timer 150ms');
    }

    function largestCanvas() {
      var all = Array.prototype.slice.call(document.querySelectorAll('canvas'));
      var best = null, bestArea = 0;
      for (var i = 0; i < all.length; i++) {
        if (!all[i].isConnected) continue;
        if (all[i].id === 'akv2Overlay') continue;
        var r = all[i].getBoundingClientRect();
        if (r.width < 100 || r.height < 100) continue;
        var a = r.width * r.height;
        if (a > bestArea) { bestArea = a; best = { el: all[i], rect: r }; }
      }
      return best;
    }
    function overlayCanvas() {
      var c = $('akv2Overlay');
      if (c) return c;
      c = document.createElement('canvas');
      c.id = 'akv2Overlay';
      c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147482998';
      (document.body || document.documentElement).appendChild(c);
      return c;
    }
    function tesGambar() {
      // Gambar 5 lingkaran bola bernomor + 6 lingkaran pocket magenta di posisi
      // dunia yang diketahui, tanpa perlu deteksi. Kalau ini muncul di tempat
      // yang benar di meja, berarti overlay dan pemetaan benar, dan masalahnya
      // di deteksi. Kalau tidak muncul / posisinya ngaco, berarti pemetaan salah.
      // Lingkaran pocket magenta dipakai buat patokan nudge kalibrasi.
      var res = { balls: [
        { x: -150, y: -75, num: 1 }, { x: 0, y: 0, num: 8 },
        { x: 150, y: 75, num: 15 }, { x: -150, y: 75, num: 2 },
        { x: 150, y: -75, num: 9 }
      ], pockets: FIXED_POCKETS };
      drawShot(null, res);
      log('TES GAMBAR: 5 lingkaran bola bernomor 1,8,15,2,9 + 6 lingkaran pocket magenta digambar. Lihat layar: kalau muncul di meja (tengah, sudut, lubang), overlay benar. Kalau tidak muncul sama sekali, kirim log ini.');
    }
    // ===== v2.16: AIM MANUAL — line prediksi ngikutin arah jari =====
    // Cara pakai: nyalakan tombol 🎯 AIM MANUAL, lalu geser jari di meja
    // (seperti mau aim manual). Garis prediksi (cue -> bola -> pocket)
    // muncul real-time ngikutin arah jari lo. Presisi karena pakai sim fisika.
    // v2.29: Ray-circle intersection — cari tabrakan PERTAMA di jalur aim
    function rayHitBall(cx, cy, dx, dy, bx, by, radius) {
      // Ray: P = C + t*D. Circle: |P - B| = radius. Cari t terkecil > 0.
      var ox = cx - bx, oy = cy - by;
      var b = ox * dx + oy * dy;
      var c = ox * ox + oy * oy - radius * radius;
      var disc = b * b - c;
      if (disc < 0) return -1;
      var t = -b - Math.sqrt(disc);
      return t > 0 ? t : -1;
    }
    function manualAimDraw(px, py) {
      try {
        if (!S.lastScan || !S.lastScan.res || !S.lastScan.res.balls) return;
        var balls = S.lastScan.res.balls;
        var cue = null;
        for (var i = 0; i < balls.length; i++) if (balls[i].num === 0) { cue = balls[i]; break; }
        if (!cue) return;
        var cv = largestCanvas();
        if (!cv || !cv.rect) return;
        var rect = cv.rect;
        var w = screenToWorld(px, py, rect);
        var ang = Math.atan2(w[1] - cue.y, w[0] - cue.x);
        S.manualAngle = ang; // v2.32: simpan untuk MANUAL SHOT
        var dx = Math.cos(ang), dy = Math.sin(ang);
        var R = (S.lastScan.res.radius || 3.800475);
        var hitR = R * 2; // diameter untuk deteksi tabrakan antar bola
        // v2.29: Cari bola PERTAMA yang kena ray (bukan yang paling segaris sudut)
        var best = null, bestT = Infinity;
        for (var j = 0; j < balls.length; j++) {
          var b = balls[j];
          if (b.num === 0) continue;
          // Skip bola lawan grup kalau grup sudah ditentukan
          if (S.group === 'solid' && b.num >= 9 && b.num <= 15) continue;
          if (S.group === 'stripe' && b.num >= 1 && b.num <= 7) continue;
          if (b.num === 8 && !isEightBallTurn(balls)) continue;
          var t = rayHitBall(cue.x, cue.y, dx, dy, b.x, b.y, hitR);
          if (t > 0 && t < bestT) { bestT = t; best = b; }
        }
        var oc = overlayCanvas();
        var r = oc.getBoundingClientRect();
        oc.width = r.width; oc.height = r.height;
        var ctx = oc.getContext('2d');
        ctx.clearRect(0, 0, oc.width, oc.height);
        if (!best) {
          // Tidak ada bola segaris — gambar garis arah aja
          var ex = cue.x + Math.cos(ang) * 100, ey = cue.y + Math.sin(ang) * 100;
          var s1 = worldToScreen(cue.x, cue.y, rect), s2 = worldToScreen(ex, ey, rect);
          // v2.58: garis aim manual SOLID (garis putus-putus dihapus — user: line tidak akurat).
          ctx.strokeStyle = '#FF0'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(s1[0] - r.left, s1[1] - r.top); ctx.lineTo(s2[0] - r.left, s2[1] - r.top); ctx.stroke();
          return;
        }
        // Ada target — cari pocket terbaik untuk bola ini, gambar prediksi lengkap
        var pockets = S.lastScan.res.pockets || FIXED_POCKETS;
        var bp = null, bd = Infinity;
        for (var k = 0; k < pockets.length; k++) {
          var d = Math.hypot(pockets[k].x - best.x, pockets[k].y - best.y);
          if (d < bd) { bd = d; bp = pockets[k]; }
        }
        // v2.29: garis BERHENTI di titik tabrakan pertama (tidak menembus bola)
        var hitX = cue.x + dx * bestT, hitY = cue.y + dy * bestT;
        // Gambar: cue -> titik tabrakan (kuning), bola -> pocket (hijau), lingkaran target
        var cs = worldToScreen(cue.x, cue.y, rect);
        var bs = worldToScreen(hitX, hitY, rect); // titik tabrakan, bukan tengah bola
        var ps = bp ? worldToScreen(bp.x, bp.y, rect) : null;
        // Glow + solid ala Arab
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,235,59,0.35)'; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(cs[0]-r.left, cs[1]-r.top); ctx.lineTo(bs[0]-r.left, bs[1]-r.top); ctx.stroke();
        ctx.strokeStyle = '#FFEB3B'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cs[0]-r.left, cs[1]-r.top); ctx.lineTo(bs[0]-r.left, bs[1]-r.top); ctx.stroke();
        // v2.29: garis hijau dari TENGAH BOLA (bukan titik tabrakan)
        var bc = worldToScreen(best.x, best.y, rect);
        var bcx = bc[0]-r.left, bcy = bc[1]-r.top;
        if (ps) {
          ctx.strokeStyle = 'rgba(76,175,80,0.35)'; ctx.lineWidth = 10;
          ctx.beginPath(); ctx.moveTo(bcx, bcy); ctx.lineTo(ps[0]-r.left, ps[1]-r.top); ctx.stroke();
          ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(bcx, bcy); ctx.lineTo(ps[0]-r.left, ps[1]-r.top); ctx.stroke();
        }
        // Lingkaran di TENGAH BOLA target
        ctx.strokeStyle = '#FF5722'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(bcx, bcy, 14, 0, 2*Math.PI); ctx.stroke();
        // Label nomor bola
        ctx.fillStyle = '#FF5722'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
        ctx.fillText('' + best.num, bcx, bcy - 18);
      } catch (e) {}
    }
    // ===== v2.34: MODE ROTATION (9-ball / 15-ball) =====
    // Aturan: harus kena bola NOMOR TERKECIL dulu, masuk urut.
    // Bola 9 (mode 9) / bola 15 (mode 15) = bola game (terakhir).
    function lowestBallNum(balls) {
      var min = 99;
      for (var i = 0; i < balls.length; i++) {
        var n = balls[i].num;
        if (n >= 1 && n < min) min = n;
      }
      return min === 99 ? -1 : min;
    }
    function isRotationMode() { return S.gameMode === '9'; }
    function gameBallNum() { return S.gameMode === '9' ? 9 : 8; }
    function isEightBallTurn(balls) {
      // Boleh tembak 8 kalau semua bola grup kita sudah masuk
      if (!S.group) return false;
      for (var i = 0; i < balls.length; i++) {
        var n = balls[i].num;
        if (S.group === 'solid' && n >= 1 && n <= 7) return false;
        if (S.group === 'stripe' && n >= 9 && n <= 15) return false;
      }
      return true;
    }
    function setManualAim(on) {
      S.manualAim = on;
      var b = $('akv2ManualAim');
      if (b) b.textContent = '🎯 AIM MANUAL: ' + (on ? 'ON' : 'OFF');
      try {
        var cv = largestCanvas();
        var el = cv ? cv.el : null;
        // Bersihkan listener lama dulu (pointer + touch)
        if (el) {
          if (S.manualAimHandler) el.removeEventListener('pointermove', S.manualAimHandler);
          if (S.manualAimTouchHandler) el.removeEventListener('touchmove', S.manualAimTouchHandler);
          if (S.manualAimDownHandler) el.removeEventListener('pointerdown', S.manualAimDownHandler);
        }
        if (on && el) {
          S.manualAimHandler = function (e) { manualAimDraw(e.clientX, e.clientY); };
          S.manualAimTouchHandler = function (e) {
            if (e.touches && e.touches[0]) manualAimDraw(e.touches[0].clientX, e.touches[0].clientY);
          };
          S.manualAimDownHandler = function (e) { manualAimDraw(e.clientX, e.clientY); };
          el.addEventListener('pointermove', S.manualAimHandler);
          el.addEventListener('touchmove', S.manualAimTouchHandler, { passive: true });
          el.addEventListener('pointerdown', S.manualAimDownHandler);
          log('🎯 AIM MANUAL ON — geser jari di meja, garis ngikutin');
        } else {
          S.manualAimHandler = null; S.manualAimTouchHandler = null; S.manualAimDownHandler = null;
          try { var oc = $('akv2Overlay'); if (oc) oc.getContext('2d').clearRect(0, 0, oc.width, oc.height); } catch (e2) {}
          log('🎯 AIM MANUAL OFF');
        }
      } catch (e) { log('AIM MANUAL error: ' + e.message); }
    }
    // ===== v2.32: MANUAL SHOT ala AKWeb =====
    // Mode: user atur AIM (geser jari) + POWER (slider), lalu tekan TEMBAK.
    // Script eksekusi dengan presisi (bukan autoplay yang milih sendiri).
    function setManualShot(on) {
      S.manualShot = on;
      var b = $('akv2ManualShot');
      if (b) {
        b.textContent = '🎯 MANUAL SHOT: ' + (on ? 'ON' : 'OFF');
        b.style.background = on ? '#FF6B6B' : '#E1BEE7';
      }
      var pw = $('akv2ManualPowerWrap');
      if (pw) pw.style.display = on ? 'block' : 'none';
      var sb = $('akv2ManualShootBtn');
      if (sb) sb.style.display = on ? 'block' : 'none';
      if (on) {
        // Aktifkan aim manual juga (biar garis ngikutin)
        if (!S.manualAim) setManualAim(true);
        log('🎯 MANUAL SHOT ON — atur aim (geser jari) + power (slider), lalu TEMBAK');
      } else {
        log('🎯 MANUAL SHOT OFF');
      }
    }
    async function execManualShot() {
      // Eksekusi tembakan manual dengan aim + power dari user
      try {
        if (!S.lastScan || !S.lastScan.res || !S.lastScan.res.balls) { log('MANUAL SHOT: deteksi dulu!'); return; }
        var balls = S.lastScan.res.balls;
        var cue = null;
        for (var i = 0; i < balls.length; i++) if (balls[i].num === 0) { cue = balls[i]; break; }
        if (!cue) { log('MANUAL SHOT: cue tidak ketemu'); return; }
        var angle = S.manualAngle || 0;
        var powerUI = S.manualPower || 50; // 0-100
        // Konversi power 0-100 ke UI 24-85
        var uiPower = 24 + (powerUI / 100) * 61;
        log('💥 MANUAL SHOT: angle=' + (angle*180/Math.PI).toFixed(1) + '° power=' + Math.round(powerUI));
        // Buat shot object dan eksekusi via shootLast
        var ghostDist = 50;
        var gx = cue.x + Math.cos(angle) * ghostDist;
        var gy = cue.y + Math.sin(angle) * ghostDist;
        S.lastScan.shot = {
          angle: angle,
          ghost: [gx, gy],
          power: uiPower,
          simPower: 150 + (powerUI/100) * 156, // 150-306 (skala kalibrasi v2.62)
          targetIdx: -1,
          validated: true
        };
        S.lastScan.res.numbersOk = true;
        await shootLast();
      } catch (e) { log('MANUAL SHOT error: ' + e.message); }
    }
    // ===== v2.19: SEMUA GARIS ala AKWeb =====
    // Gambar garis prediksi untuk SEMUA bola sekaligus, masing-masing warna beda,
    // seperti di video AKWeb (detik 91-107). Garis: bola -> pocket terbaik.
    var ALL_LINE_COLORS = ['#FF3B30', '#007AFF', '#34C759', '#FFCC00', '#FF9500', '#AF52DE', '#00C7BE', '#FF2D92', '#8E8E93', '#FF6B35', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    function drawAllLines() {
      try {
        if (!S.lastScan || !S.lastScan.res || !S.lastScan.res.balls) { log('SEMUA GARIS: belum ada data bola'); return; }
        var balls = S.lastScan.res.balls;
        var pockets = S.lastScan.res.pockets || FIXED_POCKETS;
        var cv = largestCanvas();
        if (!cv || !cv.rect) return;
        var rect = cv.rect;
        var oc = overlayCanvas();
        var r = oc.getBoundingClientRect();
        oc.width = r.width; oc.height = r.height;
        var ctx = oc.getContext('2d');
        ctx.clearRect(0, 0, oc.width, oc.height);
        ctx.lineCap = 'round';
        var ci = 0;
        for (var i = 0; i < balls.length; i++) {
          var b = balls[i];
          if (b.num === 0) continue; // skip cue ball
          // Hormati grup
          if (S.group === 'solid' && b.num >= 9 && b.num <= 15) continue;
          if (S.group === 'stripe' && b.num >= 1 && b.num <= 7) continue;
          if (b.num === 8 && !isEightBallTurn(balls)) continue;
          // Cari pocket terdekat
          var bp = null, bd = Infinity;
          for (var k = 0; k < pockets.length; k++) {
            var d = Math.hypot(pockets[k].x - b.x, pockets[k].y - b.y);
            if (d < bd) { bd = d; bp = pockets[k]; }
          }
          if (!bp) continue;
          var color = ALL_LINE_COLORS[ci % ALL_LINE_COLORS.length]; ci++;
          var bs = worldToScreen(b.x, b.y, rect);
          var ps = worldToScreen(bp.x, bp.y, rect);
          var x1 = bs[0]-r.left, y1 = bs[1]-r.top, x2 = ps[0]-r.left, y2 = ps[1]-r.top;
          // Glow + solid
          ctx.strokeStyle = color + '59'; ctx.lineWidth = 8; // alpha ~35%
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = color; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          // Lingkaran nomor di bola
          ctx.fillStyle = color; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
          ctx.beginPath(); ctx.arc(x1, y1, 10, 0, 2*Math.PI); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText('' + b.num, x1, y1 + 4);
        }
        log('🌈 SEMUA GARIS: ' + ci + ' garis digambar');
      } catch (e) { log('SEMUA GARIS error: ' + e.message); }
    }
    function setAllLines(on) {
      S.allLines = on;
      var b = $('akv2AllLines');
      if (b) b.textContent = '🌈 SEMUA GARIS: ' + (on ? 'ON' : 'OFF');
      if (on) { drawAllLines(); log('🌈 SEMUA GARIS ON — garis warna-warni semua bola'); }
      else {
        try { var oc = $('akv2Overlay'); if (oc) oc.getContext('2d').clearRect(0, 0, oc.width, oc.height); } catch (e) {}
        log('🌈 SEMUA GARIS OFF');
      }
    }
    function screenToWorld(sx, sy, rect) {
      // Kebalikan dari worldToScreen.
      var scx = (CAL.w > 0 && rect.width > 0) ? rect.width / CAL.w : 1;
      var scy = (CAL.h > 0 && rect.height > 0) ? rect.height / CAL.h : 1;
      var wx = ((sx - rect.left - CAL.x * scx) * AK_L / rect.width - AK_D) / AK_U;
      var wy = ((sy - rect.top - CAL.y * scy) * AK_C / rect.height - AK_H) / AK_F;
      return [wx, wy];
    }
    function detectPocketsAuto() {
      // Deteksi posisi pocket dari RENDER game: cari gugusan pixel gelap (lubang)
      // di sekitar 6 area pocket. Kalau canvas WebGL tidak bisa dibaca pixelnya,
      // fallback ke geometri asli game (world unit terbukti sama via radius bola).
      // Kembali {pockets:[{x,y} world atau null], method:'pixel'|'geometri'}.
      var cv = largestCanvas();
      var detected = [], method = 'none';
      if (cv) {
        try {
          var r = cv.rect, el = cv.el;
          var tmp = document.createElement('canvas');
          var W = 480, H = Math.max(200, Math.round(480 * r.height / Math.max(1, r.width)));
          tmp.width = W; tmp.height = H;
          var tctx = tmp.getContext('2d');
          tctx.drawImage(el, 0, 0, W, H);
          var img = tctx.getImageData(0, 0, W, H), d = img.data;
          var opaque = 0;
          for (var i = 3; i < d.length; i += 160) if (d[i] > 10) opaque++;
          if (opaque > 100) {
            method = 'pixel';
            for (var pi = 0; pi < 6; pi++) {
              var pc = worldToScreen(FIXED_POCKETS[pi].x, FIXED_POCKETS[pi].y, r);
              var cx = (pc[0] - r.left) * W / r.width, cy = (pc[1] - r.top) * H / r.height;
              var R2 = 70, sx = 0, sy = 0, n = 0;
              var y0 = Math.max(0, Math.floor(cy - R2)), y1 = Math.min(H - 1, Math.ceil(cy + R2));
              var x0 = Math.max(0, Math.floor(cx - R2)), x1 = Math.min(W - 1, Math.ceil(cx + R2));
              for (var y = y0; y <= y1; y += 2) {
                for (var x = x0; x <= x1; x += 2) {
                  var dx = x - cx, dy = y - cy;
                  if (dx * dx + dy * dy > R2 * R2) continue;
                  var o = (y * W + x) * 4;
                  if (d[o] + d[o + 1] + d[o + 2] < 120) { sx += x; sy += y; n++; }
                }
              }
              if (n > 5) {
                var w = screenToWorld(r.left + (sx / n) * r.width / W, r.top + (sy / n) * r.height / H, r);
                detected.push({ x: w[0], y: w[1], n: n });
              } else detected.push(null);
            }
          }
        } catch (e) { /* jatuh ke fallback geometri */ }
      }
      if (method !== 'pixel') {
        method = 'geometri';
        var NAT = [{ x: -130.8, y: -67.3 }, { x: 0, y: -70 }, { x: 130.8, y: -67.3 },
                   { x: 130.8, y: 67.3 }, { x: 0, y: 70 }, { x: -130.8, y: 67.3 }]; // v2.58 §20: samping ±70.0
        detected = NAT.map(function (p) { return { x: p.x, y: p.y, n: -1 }; });
      }
      return { pockets: detected, method: method };
    }
    var camSq = null, camDot = null;
    function camToggle() {
      S.camMode = !S.camMode;
      var b = $('akv2CamPocket'), row = $('akv2CamRow');
      if (b) b.textContent = '\uD83D\uDCF7 KAMERA POCKET: ' + (S.camMode ? 'ON' : 'OFF');
      if (row) row.style.display = S.camMode ? 'flex' : 'none';
      if (S.camMode) { camShowSquare(); camNameUpd(); }
      else camHideSquare();
      log('KAMERA POCKET ' + (S.camMode ? 'ON: geser kotak ke lubang ' + PKT_NAMES[S.camSel] + ', lalu tekan \uD83D\uDD0D utk tandai posisi asli' : 'OFF'));
    }
    function camShowSquare() {
      camHideSquare();
      camSq = document.createElement('div');
      camSq.id = 'akv2CamSq';
      camSq.style.cssText = 'position:fixed;width:120px;height:120px;border:3px dashed #ffdd00;border-radius:8px;z-index:2147482999;box-sizing:border-box;background:rgba(255,221,0,0.07);touch-action:none;cursor:move';
      camDot = document.createElement('div');
      camDot.style.cssText = 'position:absolute;width:14px;height:14px;border-radius:50%;background:#00e676;border:2px solid #111;left:53px;top:53px;display:none';
      camSq.appendChild(camDot);
      (document.body || document.documentElement).appendChild(camSq);
      camPositionSquare();
      var sx0 = 0, sy0 = 0, lx0 = 0, ly0 = 0, dragging = false;
      camSq.addEventListener('pointerdown', function (e) { dragging = true; sx0 = e.clientX; sy0 = e.clientY; lx0 = parseFloat(camSq.style.left) || 0; ly0 = parseFloat(camSq.style.top) || 0; try { camSq.setPointerCapture(e.pointerId); } catch (e2) {} e.preventDefault(); });
      camSq.addEventListener('pointermove', function (e) { if (!dragging) return; camSq.style.left = (lx0 + e.clientX - sx0) + 'px'; camSq.style.top = (ly0 + e.clientY - sy0) + 'px'; });
      var stop = function () { dragging = false; };
      camSq.addEventListener('pointerup', stop);
      camSq.addEventListener('pointercancel', stop);
    }
    function camHideSquare() { if (camSq && camSq.parentNode) camSq.parentNode.removeChild(camSq); camSq = null; camDot = null; }
    function camPositionSquare() {
      if (!camSq) return;
      var cv = largestCanvas(), cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      if (cv) { var p = worldToScreen(FIXED_POCKETS[S.camSel].x, FIXED_POCKETS[S.camSel].y, cv.rect); cx = p[0]; cy = p[1]; }
      camSq.style.left = (cx - 60) + 'px'; camSq.style.top = (cy - 60) + 'px';
      if (camDot) camDot.style.display = 'none';
      S.camDetected = null;
    }
    function camNameUpd() { var el = $('akv2CamName'); if (el) el.textContent = PKT_NAMES[S.camSel]; }
    var CAM_NAT = [{ x: -130.8, y: -67.3 }, { x: 0, y: -70 }, { x: 130.8, y: -67.3 },
                   { x: 130.8, y: 67.3 }, { x: 0, y: 70 }, { x: -130.8, y: 67.3 }]; // v2.58 §20: samping ±70.0
    var CAM_NATMAP = [0, 1, 2, 5, 4, 3]; // nat: TL,TM,TR,BR,BM,BL -> kita: TL,TM,TR,BL,BM,BR
    function camDetect() {
      // "Deteksi": cocokkan posisi pocket ASLI game (dari kode game, world unit
      // terbukti sama via radius bola) dengan yang terlihat di layar. Titik hijau
      // menandai posisi asli; kalau pas di lubang berarti kalibrasi benar.
      // (Pixel render WebGL tidak bisa dibaca via JS — sudah dites, selalu blank —
      // jadi deteksi pakai geometri game, verifikasi visual oleh pengguna.)
      if (!camSq) { log('KAMERA POCKET: nyalakan dulu tombol kameranya'); return; }
      var cv = largestCanvas();
      if (!cv) { log('KAMERA POCKET: canvas game tidak ketemu'); return; }
      var nat = CAM_NAT[CAM_NATMAP[S.camSel]];
      S.camDetected = { x: nat.x, y: nat.y };
      var sp = worldToScreen(nat.x, nat.y, cv.rect);
      var r = camSq.getBoundingClientRect();
      if (camDot) {
        camDot.style.display = 'block';
        camDot.style.left = ((sp[0] - r.left) - 7) + 'px';
        camDot.style.top = ((sp[1] - r.top) - 7) + 'px';
      }
      var cal = FIXED_POCKETS[S.camSel];
      var dist = Math.hypot(nat.x - cal.x, nat.y - cal.y);
      log('KAMERA ' + PKT_NAMES[S.camSel] + ': asli=(' + nat.x.toFixed(1) + ',' + nat.y.toFixed(1) + ') vs kalibrasi=(' + cal.x.toFixed(1) + ',' + cal.y.toFixed(1) + ') selisih=' + dist.toFixed(1) + (dist < 6 ? ' PAS' : ''));
      stat('Kamera ' + PKT_NAMES[S.camSel] + ': titik hijau = posisi asli. Selisih kalibrasi ' + dist.toFixed(1) + (dist < 6 ? ' PAS' : ''));
    }
    function camSave() {
      if (!S.camDetected) { log('KAMERA POCKET: tekan \uD83D\uDD0D dulu sebelum simpan'); return; }
      FIXED_POCKETS[S.camSel].x = S.camDetected.x;
      FIXED_POCKETS[S.camSel].y = S.camDetected.y;
      tableProfiles[tableCurrent] = {
        pockets: FIXED_POCKETS.map(function (p) { return { x: p.x, y: p.y }; }),
        cushion: CUSHION ? { xmin: CUSHION.xmin, xmax: CUSHION.xmax, ymin: CUSHION.ymin, ymax: CUSHION.ymax } : null,
        asset: sniffTableAsset()
      };
      saveTableProfiles(); recalcPocketWidth();
      log('KAMERA POCKET: ' + PKT_NAMES[S.camSel] + ' disimpan=(' + S.camDetected.x.toFixed(1) + ',' + S.camDetected.y.toFixed(1) + ')');
      S.camSel = (S.camSel + 1) % 6;
      camNameUpd(); camPositionSquare();
    }
    function verifyPockets() {
      // Bandingkan hasil auto-deteksi dengan kalibrasi. Kalau cocok = kalibrasi benar.
      var res = detectPocketsAuto();
      log('CEK POCKET: metode=' + res.method);
      var ok = 0;
      for (var i = 0; i < 6; i++) {
        var det = res.pockets[i], cal = FIXED_POCKETS[i];
        if (!det) { log('  ' + PKT_NAMES[i] + ': TIDAK TERDETEKSI di render'); continue; }
        var dist = Math.hypot(det.x - cal.x, det.y - cal.y);
        var pas = dist < 6;
        if (pas) ok++;
        log('  ' + PKT_NAMES[i] + ': auto=(' + det.x.toFixed(1) + ',' + det.y.toFixed(1) + ') vs kalibrasi=(' + cal.x.toFixed(1) + ',' + cal.y.toFixed(1) + ') selisih=' + dist.toFixed(1) + (pas ? ' PAS' : ' BEDA'));
      }
      var msg = 'CEK POCKET (' + res.method + '): ' + ok + '/6 PAS' + (ok === 6 ? ' -> kalibrasi cocok, itu lubangnya' : ' -> ada yang beda, cek kalibrasi pocket');
      log(msg); stat(msg);
    }
    function drawShot(shot, res) {
      // v2.26: hormati toggle line preview
      if (typeof S !== 'undefined' && S.linePreview === false) {
        try { var oc0 = $('akv2Overlay'); if (oc0) oc0.getContext('2d').clearRect(0, 0, oc0.width, oc0.height); } catch (e0) {}
        return;
      }
      if (!res || !res.balls || !res.balls.length) return;
      var cv = largestCanvas();
      if (!cv) { log('GAMBAR gagal: canvas game tidak ketemu'); return; }
      var oc = overlayCanvas();
      oc.width = Math.round(window.innerWidth); oc.height = Math.round(window.innerHeight);
      var ctx = oc.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, oc.width, oc.height);
      var rect = cv.rect;
      function P(wx, wy) { return worldToScreen(wx, wy, rect); }
      var balls = res.balls, cue = null, tgt = null;
      for (var i = 0; i < balls.length; i++) if (balls[i].cue || balls[i].num === 0) cue = balls[i];
      if (shot) tgt = balls[shot.targetIdx];
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      res.pockets.forEach(function (pk) {
        var s = P(pk.x, pk.y);
        ctx.beginPath(); ctx.arc(s[0], s[1], 14, 0, 7); ctx.strokeStyle = '#ff3df2'; ctx.lineWidth = 4; ctx.stroke();
        ctx.beginPath(); ctx.arc(s[0], s[1], 3, 0, 7); ctx.fillStyle = '#ff3df2'; ctx.fill();
      });
      // Mode KALIBRASI (gabungan pocket + bantalan): rangkaian pocket O—O—O HIJAU + label,
      // bingkai bantalan merah (batas pantul) + ungu luar, item terpilih highlight kuning.
      // calSel 0-5 = pocket TL..BR, 6-9 = tepi bantalan ATAS..KANAN.
      if (S.calMode && res.pockets.length >= 6) {
        var ps = res.pockets.map(function (pk) { return P(pk.x, pk.y); });
        // v2.58: garis kalibrasi SOLID (garis putus-putus dihapus).
        ctx.strokeStyle = '#00e676'; ctx.lineWidth = 3;
        [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5]].forEach(function (e) {
          ctx.beginPath(); ctx.moveTo(ps[e[0]][0], ps[e[0]][1]); ctx.lineTo(ps[e[1]][0], ps[e[1]][1]); ctx.stroke();
        });
        for (var pi2 = 0; pi2 < 6; pi2++) {
          var selP = (S.calSel === pi2);
          ctx.beginPath(); ctx.arc(ps[pi2][0], ps[pi2][1], selP ? 24 : 18, 0, 7);
          ctx.strokeStyle = selP ? '#ffdd00' : '#00e5ff'; ctx.lineWidth = selP ? 5 : 3; ctx.stroke();
          ctx.fillStyle = '#111'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(PKT_NAMES[pi2], ps[pi2][0], ps[pi2][1] - (selP ? 34 : 28));
        }
        var cr = getCushionRect();
        var cA = P(cr.xmin, cr.ymin), cB = P(cr.xmax, cr.ymin), cC = P(cr.xmax, cr.ymax), cD = P(cr.xmin, cr.ymax);
        var oA = P(cr.xmin - 8, cr.ymin - 8), oB = P(cr.xmax + 8, cr.ymin - 8), oC = P(cr.xmax + 8, cr.ymax + 8), oD = P(cr.xmin - 8, cr.ymax + 8);
        ctx.globalAlpha = 0.55; ctx.strokeStyle = '#b14dff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(oA[0], oA[1]); ctx.lineTo(oB[0], oB[1]); ctx.lineTo(oC[0], oC[1]); ctx.lineTo(oD[0], oD[1]); ctx.closePath(); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cA[0], cA[1]); ctx.lineTo(cB[0], cB[1]); ctx.lineTo(cC[0], cC[1]); ctx.lineTo(cD[0], cD[1]); ctx.closePath(); ctx.stroke();
        var ce = S.calSel - 6;
        if (ce >= 0 && ce < 4) {
          ctx.strokeStyle = '#ffdd00'; ctx.lineWidth = 7;
          ctx.beginPath();
          if (ce === 0) { ctx.moveTo(cD[0], cD[1]); ctx.lineTo(cC[0], cC[1]); }
          else if (ce === 1) { ctx.moveTo(cA[0], cA[1]); ctx.lineTo(cB[0], cB[1]); }
          else if (ce === 2) { ctx.moveTo(cA[0], cA[1]); ctx.lineTo(cD[0], cD[1]); }
          else { ctx.moveTo(cB[0], cB[1]); ctx.lineTo(cC[0], cC[1]); }
          ctx.stroke();
        }
        ctx.fillStyle = '#111'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ATAS', (cD[0] + cC[0]) / 2, (cD[1] + cC[1]) / 2 - 16);
        ctx.fillText('BAWAH', (cA[0] + cB[0]) / 2, (cA[1] + cB[1]) / 2 + 16);
        ctx.fillText('KIRI', (cA[0] + cD[0]) / 2 - 24, (cA[1] + cD[1]) / 2);
        ctx.fillText('KANAN', (cB[0] + cC[0]) / 2 + 28, (cB[1] + cC[1]) / 2);
      }
      var BALL_COLORS = { 0: '#ffffff', 1: '#ffd43b', 2: '#2f6df6', 3: '#e83a3a', 4: '#8e44ad', 5: '#ff8c1a', 6: '#27ae60', 7: '#a93226', 8: '#161616', 9: '#ffd43b', 10: '#2f6df6', 11: '#e83a3a', 12: '#8e44ad', 13: '#ff8c1a', 14: '#27ae60', 15: '#a93226' };
      balls.slice(0, 30).forEach(function (b) {
        var s = P(b.x, b.y);
        var col = BALL_COLORS[b.num] || '#ffd43b';
        ctx.beginPath(); ctx.arc(s[0], s[1], 9, 0, 7);
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
        if (b.num >= 9 && b.num <= 15) {
          ctx.fillStyle = '#ffffff'; ctx.fillRect(s[0] - 9, s[1] - 3.5, 18, 7);
        }
        var lightNums = [0, 1, 5, 9, 13];
        ctx.fillStyle = (lightNums.indexOf(b.num) >= 0) ? '#111' : '#fff';
        ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((b.num === null || b.num === undefined ? '?' : String(b.num)), s[0], s[1]);
      });
      // v2.0: garis HANYA untuk bola yang TERSENTUH menurut simulasi fisika.
      // Bola yang tidak bergerak di sim = tidak kena = tidak digambar garis (biar tidak bingung).
      // v2.7: garis ala Arab — lebih TEBAL + glow biar jelas terlihat.
      // v2.60: gambar dari shot.dispRes (preview LIVE) kalau ada, kalau
      // tidak dari shot.simRes (sim plan). dispRes diisi livePreview
      // tiap tick dari aim/power game saat ini.
      var _simDraw = (shot && shot.dispRes && shot.dispRes.balls) ? shot.dispRes : (shot && shot.simRes ? shot.simRes : null);
      if (_simDraw && _simDraw.balls) {
        for (var _si = 0; _si < _simDraw.balls.length; _si++) {
          (function (sb) {
            if (!sb.positions || sb.positions.length < 2) return; // tidak tersentuh, skip
            var _isCue = sb.number === 0;
            var _col = _isCue ? '#ffffff' : (BALL_COLORS[sb.number] || '#ffd43b');
            // Glow: gambar 2x (tebal transparan di bawah, tipis solid di atas).
            ctx.beginPath();
            for (var _pi = 0; _pi < sb.positions.length; _pi++) {
              var _sp = P(sb.positions[_pi].x, sb.positions[_pi].y);
              if (_pi === 0) ctx.moveTo(_sp[0], _sp[1]); else ctx.lineTo(_sp[0], _sp[1]);
            }
            ctx.strokeStyle = _col; ctx.globalAlpha = 0.35; ctx.lineWidth = _isCue ? 10 : 12; ctx.stroke();
            ctx.beginPath();
            for (var _qi = 0; _qi < sb.positions.length; _qi++) {
              var _sq = P(sb.positions[_qi].x, sb.positions[_qi].y);
              if (_qi === 0) ctx.moveTo(_sq[0], _sq[1]); else ctx.lineTo(_sq[0], _sq[1]);
            }
            ctx.strokeStyle = _col; ctx.globalAlpha = 1; ctx.lineWidth = _isCue ? 4 : 5; ctx.stroke();
            var _le = sb.positions[sb.positions.length - 1], _ls = P(_le.x, _le.y);
            ctx.beginPath(); ctx.arc(_ls[0], _ls[1], 8, 0, 7);
            ctx.fillStyle = _col; ctx.fill();
            ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
          })(_simDraw.balls[_si]);
        }
      }
      if (cue && shot && tgt) {
        var cs = P(cue.x, cue.y), gs = P(shot.ghost[0], shot.ghost[1]), ts = P(tgt.x, tgt.y), ps = P(shot.pocket.x, shot.pocket.y);
        // v2.7: garis bidik ala Arab — putih tebal + kuning ke pocket.
        ctx.beginPath(); ctx.moveTo(cs[0], cs[1]); ctx.lineTo(gs[0], gs[1]);
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 10; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cs[0], cs[1]); ctx.lineTo(gs[0], gs[1]);
        ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 4; ctx.stroke();
        // v2.58: garis target->pocket putus-putus DIHAPUS (user: tidak akurat).
        // Pocket tetap ditandai cincin pink, bola target cincin pink — tanpa garis penghubung.
        ctx.beginPath(); ctx.arc(gs[0], gs[1], 12, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.arc(ts[0], ts[1], 14, 0, 7); ctx.strokeStyle = '#ff3df2'; ctx.lineWidth = 3; ctx.stroke();
        // Prediksi bola putih pasca-tumbukan ala cheat umum: garis defleksi dari
        // titik ghost + lingkaran titik berhenti. Biru = aman, merah = risiko scratch
        // (kandidat seperti ini otomatis kalah skor saat pilih jalan).
        if (shot.cueDir && shot.cueRoll > 1) {
          var pex = shot.ghost[0] + shot.cueDir[0] * shot.cueRoll;
          var pey = shot.ghost[1] + shot.cueDir[1] * shot.cueRoll;
          var pes = P(pex, pey);
          var pcol = shot.scratch ? '#ff5252' : '#7ee7ff';
          // v2.58: garis defleksi putus-putus DIHAPUS — hanya lingkaran titik berhenti + label scratch.
          ctx.beginPath(); ctx.arc(pes[0], pes[1], 11, 0, 7);
          ctx.strokeStyle = pcol; ctx.lineWidth = 3; ctx.stroke();
          ctx.beginPath(); ctx.arc(pes[0], pes[1], 3, 0, 7);
          ctx.fillStyle = pcol; ctx.fill();
          if (shot.scratch) {
            ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText('AWAS SCRATCH', pes[0], pes[1] - 18);
          }
        }
        // (blok sim lama digabung ke atas: garis semua bola yang tersentuh)
      }
    }
    // v2.60 GARIS LIVE ala AKWeb — re-sim tiap tick dari aim + power
    // game SAAT INI, lalu gambar ulang trajektori + titik berhenti.
    // Perilaku yang diminta user: "cue digerakkan -> line ngikut;
    // nge-power -> line gerak, nunjukin bola berhenti di mana".
    // v2.61 AIM MAGNET vs BEBAS:
    // - Autoplay ON = MAGNET: garis KUNCI ke tembakan pilihan solver
    //   (shot.angle / shot.simPower) — aim live user DIABAIKAN, jadi
    //   garis tidak goyang mengikuti geseran aim manual; garis
    //   "ngemagnet" ke bola target + saku pilihan solver.
    // - Autoplay OFF = BEBAS: garis ngikutin aim + power user REALTIME
    //   (getter aimAngle/power) — tidak ada magnet ke pick solver.
    //   Dipakai refreshOverlay (manual) lewat manualShotFromAim.
    // - Hasil sim disimpan di shot.dispRes (DISPLAY ONLY — tidak
    //   menyentuh shot.simPower / validated / keputusan tembak).
    // - Throttle: re-sim hanya kalau aim/power/posisi cue berubah;
    //   tidak jalan saat bola bergerak, menembak, atau garis beku.
    function livePreview(res, shot) {
      try {
        if (!res || !res.balls || !res.balls.length) return false;
        if (!shot || !isFinite(shot.angle) || !shot.ghost || !shot.pocket) return false;
        if (S.linesFrozen || S.shooting) return false;
        if (S.linePreview === false) return false;
        var cue = null, maxSp = 0;
        for (var i = 0; i < res.balls.length; i++) {
          var b = res.balls[i];
          var sp2 = Math.hypot(b.vx || 0, b.vy || 0);
          if (sp2 > maxSp) maxSp = sp2;
          if (b.num === 0) cue = b;
        }
        if (!cue || maxSp > 0.05) return false; // bola bergerak = bukan fase aim
        var magnet = !!S.autoBeruntun; // v2.61: ON = kunci ke pick, OFF = ikut aim user
        var liveAngle = shot.angle, livePowerSim = (shot.simPower && shot.simPower > 0) ? shot.simPower : 0;
        if (!magnet) {
          // BEBAS: aim live dari getter (user geser aim manual / solver setAim);
          // fallback sudut plan. Power live dari getter; kalau 0 (belum
          // di-charge) pakai power plan — preview menunjukkan rencana,
          // bukan garis kosong.
          try {
            var h = heapViews();
            if (h) {
              var M = h.module, mgr = akGetManagers(h);
              var gm = (mgr && mgr.ok) ? mgr.gameManager : (res.gameManager || 0);
              var cueObj = gm ? akGetVisualCue(M, gm) : 0;
              if (cueObj) {
                var gAn = akGetDouble(M, AKV2_LIVE.aimAngleSlot, cueObj, AKV2_LIVE.aimAngleSel);
                if (gAn.ok && isFinite(gAn.value) && gAn.value >= -0.01 && gAn.value <= Math.PI * 2 + 0.01) liveAngle = gAn.value;
                var gPw = akGetDouble(M, AKV2_LIVE.powerSlot, cueObj, AKV2_LIVE.powerSel);
                if (gPw.ok && isFinite(gPw.value) && gPw.value > 0.01 && gPw.value <= 1.01) livePowerSim = Math.min(1, gPw.value) * (S.cueMaxPower || 306);
              }
            }
          } catch (e) {}
        }
        if (!(livePowerSim > 0)) {
          try { livePowerSim = physicsShotPower(cue, shot.ghost, shot.pocket); } catch (e2) {}
        }
        if (!(livePowerSim > 0)) return false;
        var sig = liveAngle.toFixed(3) + '|' + Math.round(livePowerSim) + '|' + res.balls.length + '|' + cue.x.toFixed(1) + ',' + cue.y.toFixed(1);
        if (sig === S.livePrevSig) return false;
        S.livePrevSig = sig;
        var sim = null;
        try { sim = new PoolSim(); } catch (e3) { return false; }
        var dbs = res.balls.map(function (bb) { return { x: bb.x, y: bb.y, number: (bb.num === null || bb.num === undefined ? -1 : bb.num), state: 1 }; });
        var r2 = null;
        try { r2 = sim.simulate({ balls: dbs, shotAngle: liveAngle, shotPower: livePowerSim, shotSpin: { x: 0, y: 0 } }); } catch (e4) { return false; }
        if (!r2 || !r2.balls) return false;
        shot.dispRes = r2;
        drawShot(shot, res);
        return true;
      } catch (e) { return false; }
    }
    // v2.61 TEMBAKAN MANUAL dari aim user (autoplay OFF = BEBAS).
    // Baca aimAngle game saat ini, raycast dari putih sepanjang sudut
    // itu ke bola pertama yang kena (jarak tegak < 2R), lalu bangun
    // objek shot minimal untuk digambar + di-preview livePreview:
    // ghost = titik kontak, target = bola pertama kena, pocket = saku
    // paling searah dengan arah bola target sesudah kontak. Kalau tidak
    // ada bola yang kena, ghost = titik bantalan di sepanjang ray dan
    // targetIdx = -1 (sim tetap menunjukkan putih menggelinding +
    // berhenti di mana). Return null kalau aim game tidak terbaca
    // (pemanggil fallback ke garis pick solver).
    function manualShotFromAim(res) {
      try {
        if (!res || !res.balls || !res.balls.length || !res.pockets || !res.pockets.length) return null;
        var cue = null;
        for (var i = 0; i < res.balls.length; i++) if (res.balls[i].num === 0) { cue = res.balls[i]; break; }
        if (!cue) return null;
        var ang = null;
        try {
          var h = heapViews();
          if (h) {
            var M = h.module, mgr = akGetManagers(h);
            var gm = (mgr && mgr.ok) ? mgr.gameManager : (res.gameManager || 0);
            var cueObj = gm ? akGetVisualCue(M, gm) : 0;
            if (cueObj) {
              var gAn = akGetDouble(M, AKV2_LIVE.aimAngleSlot, cueObj, AKV2_LIVE.aimAngleSel);
              if (gAn.ok && isFinite(gAn.value) && gAn.value >= -0.01 && gAn.value <= Math.PI * 2 + 0.01) ang = gAn.value;
            }
          }
        } catch (e) {}
        if (ang === null || !isFinite(ang)) return null;
        var R = res.radius || 3.800475;
        var dx = Math.cos(ang), dy = Math.sin(ang);
        var bestT = Infinity, bestIdx = -1;
        for (var j = 0; j < res.balls.length; j++) {
          if (res.balls[j].num === 0) continue;
          var rx = res.balls[j].x - cue.x, ry = res.balls[j].y - cue.y;
          var t = rx * dx + ry * dy;
          if (t <= 0) continue;
          var perp2 = rx * rx + ry * ry - t * t;
          if (perp2 < 0) perp2 = 0;
          if (Math.sqrt(perp2) >= 2 * R) continue;
          if (t < bestT) { bestT = t; bestIdx = j; }
        }
        var ghost, pocket;
        if (bestIdx >= 0) {
          var tb = res.balls[bestIdx];
          ghost = [tb.x - dx * 2 * R, tb.y - dy * 2 * R];
          // Saku paling searah dengan arah bola target sesudah kontak.
          var ox = tb.x - ghost[0], oy = tb.y - ghost[1];
          var ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
          var bestPk = null, bestDot = -2;
          for (var k = 0; k < res.pockets.length; k++) {
            var px = res.pockets[k].x - tb.x, py = res.pockets[k].y - tb.y;
            var pl = Math.hypot(px, py) || 1;
            var dot = (px / pl) * ox + (py / pl) * oy;
            if (dot > bestDot) { bestDot = dot; bestPk = res.pockets[k]; }
          }
          pocket = bestPk || res.pockets[0];
        } else {
          // Tidak ada bola kena: ghost = titik bantalan di sepanjang ray.
          var cr = null;
          try { cr = getCushionRect(); } catch (eC) {}
          var tC = Infinity;
          if (cr) {
            if (dx > 1e-6) tC = Math.min(tC, (cr.xmax - cue.x) / dx);
            if (dx < -1e-6) tC = Math.min(tC, (cr.xmin - cue.x) / dx);
            if (dy > 1e-6) tC = Math.min(tC, (cr.ymax - cue.y) / dy);
            if (dy < -1e-6) tC = Math.min(tC, (cr.ymin - cue.y) / dy);
          }
          if (!isFinite(tC) || tC <= 0) tC = 100;
          ghost = [cue.x + dx * tC, cue.y + dy * tC];
          var bestPk2 = null, bestD2 = Infinity;
          for (var k2 = 0; k2 < res.pockets.length; k2++) {
            var d2 = Math.hypot(res.pockets[k2].x - ghost[0], res.pockets[k2].y - ghost[1]);
            if (d2 < bestD2) { bestD2 = d2; bestPk2 = res.pockets[k2]; }
          }
          pocket = bestPk2 || res.pockets[0];
        }
        return { angle: ang, ghost: ghost, pocket: pocket, targetIdx: bestIdx,
          power: 0, simPower: 0, spin: { x: 0, y: 0 }, simRes: null,
          validated: false, isManual: true };
      } catch (e) { return null; }
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function evOpts(x, y) { return { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: 1, pointerId: 7, pointerType: 'touch', isPrimary: true }; }
    // v2.58 DIHIDUPKAN LAGI (dari v2.46): fire()/fireHover() — kirim
    // PointerEvent + MouseEvent + TouchEvent ke canvas game. Dipakai
    // HANYA oleh dragShoot() (fallback tembak kalau gate dynCall gagal
    // karena manager/table). Aim manual tetap tampilan saja.
    function fire(el, type, x, y) {
      try { el.dispatchEvent(new PointerEvent(type, evOpts(x, y))); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), evOpts(x, y))); } catch (e) {}
      try {
        if (typeof TouchEvent !== 'undefined' && typeof Touch !== 'undefined') {
          var tch = new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
          el.dispatchEvent(new TouchEvent(type.replace('pointer', 'touch').replace('down', 'start').replace('up', 'end'), { bubbles: true, cancelable: true, touches: type === 'pointerup' ? [] : [tch], changedTouches: [tch] }));
        }
      } catch (e) {}
    }
    function fireHover(el, x, y) {
      var o = { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, buttons: 0, button: -1, pointerId: 1, pointerType: 'mouse', isPrimary: true };
      try { el.dispatchEvent(new PointerEvent('pointermove', o)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mousemove', o)); } catch (e) {}
    }
    async function doScan(autoShoot) {
      // v2.58: baca bola via getter (fallback scan heap kalau getter
      // gagal), hitung tembakan dari otak v2.46, gambar garis.
      var t0 = Date.now();
      var res = readGetterBalls();
      if (!res) { stat('Getter gagal: ' + (S.getterDiag || '')); log('SCAN getter gagal: ' + (S.getterDiag || '')); return; }
      var cv = largestCanvas();
      S.lastScan = { res: res, canvasRect: cv ? cv.rect : null };
      var cue = null;
      for (var i = 0; i < res.balls.length; i++) if (res.balls[i].num === 0) cue = res.balls[i];
      log('BOLA getter ' + res.balls.map(function (b) { return b.num + '@' + b.x.toFixed(1) + ',' + b.y.toFixed(1); }).join(' ') + ' | hilang=' + res.missing.join(',') + ' (' + (Date.now() - t0) + 'ms)');
      stat('Bola ' + res.balls.length + ' (getter, tanpa scan), hilang ' + res.missing.length + ', R=' + res.radius.toFixed(1) + ', cue: ' + (cue ? 'YA' : 'TIDAK'));
      var shot = pickShot(res.balls, res.pockets, res.radius, S.group, S.allowBank, res.pocketWidth);
      if (!shot) { log('SOLVER: tidak ada tembakan (cue=' + (cue ? 'ada' : 'tidak') + ', grup=' + (S.group || 'buka') + ')'); drawShot(null, res); return; }
      S.lastScan.shot = shot;
      var tgt = res.balls[shot.targetIdx];
      log('TEMBAKAN target=' + (tgt.num === null ? '?' : tgt.num) + ' pocket=' + Math.round(shot.pocket.x) + ',' + Math.round(shot.pocket.y) + ' cut=' + shot.cut.toFixed(1) + ' power=' + shot.power + (shot.bank ? ' BANK' : '') + (shot.kick ? ' KICK' : '') + (shot.scratch ? ' SCRATCH-RISK!' : ' putih-aman'));
      drawShot(shot, res);
      if (autoShoot && S.mode === 'once' && res.numbersOk) shootLast();
    }
    async function shootLast() {
      // v2.58: TEMBAK VIA dynCall dulu, fallback DRAG kalau gate gagal
      // semata karena manager/table (lihat shootWithFallback).
      // Alur: plan dari S.lastScan (atau baca getter + pickShot) -> commitShot
      // (gate -> zero-power -> restore-angle -> setAim -> setPower -> takeShot).
      if (S.shooting) { log('TEMBAK ditahan: masih menembak'); return false; }
      var res = null, shot = null;
      if (S.lastScan && S.lastScan.shot && S.lastScan.res) { res = S.lastScan.res; shot = S.lastScan.shot; }
      else {
        res = readGetterBalls();
        if (!res || !res.balls.length) { log('TEMBAK gagal: bola tidak terbaca via getter'); return false; }
        shot = pickShot(res.balls, res.pockets, res.radius, S.group, S.allowBank, res.pocketWidth);
        if (!shot) { log('TEMBAK gagal: tidak ada tembakan'); return false; }
      }
      if (!res.numbersOk) { log('TEMBAK DIBLOKIR: nomor tidak lengkap (cue hilang / <6 bola).'); return false; }
      if (!shot.validated && shot.targetIdx < 0) { log('TEMBAK DIBLOKIR: tembakan tidak tervalidasi sim.'); return false; }
      var plan = buildPlan(res, shot);
      S.lastScan = { res: res, shot: shot };
      S.tunePre = res; S.tuneShot = shot;
      S.autoPreShotNums = res.balls.map(function (b) { return b.num; });
      var ok = await shootWithFallback(plan, res, shot);
      if (ok) { S.mode = 'off'; var ab = $('akv2Auto'); if (ab) ab.textContent = 'AUTOPLAY: OFF (tap = 1 tembakan, lalu OFF)'; S.lastScan.shot = null; }
      return ok;
    }

    // v2.58 DIHIDUPKAN LAGI (dari v2.46): directScanBalls — cari bola
    // LANGSUNG dari tanda nomor+92 (0-15) DAN radius+48 = 3.800475.
    // Dipakai runScanFallback() kalau getter dynCall gagal; TIDAK
    // ada lagi fase belajar (SIMPAN/BANDINGKAN tetap nonaktif).
    function directScanBalls(h) {
      // Cari bola LANGSUNG dari tanda yang sama dengan putih: nomor +92
      // 0-15 DAN radius +48 = 3.800475. Ini tidak peduli posisi x/y-nya
      // 0, integer, atau di rack — kalau tandanya cocok, itu bola PHYS.
      // v2.58: dipakai sebagai fallback tiap kali getter gagal (cache
      // 1500 ms, jadi tidak scan tiap tick). Chunked async + berhenti
      // cepat — tidak freeze game.
      return new Promise(function (resolve) {
        // FIX 11:29: scan lama mengambil kemunculan PERTAMA tiap nomor, dan
        // heap awal berisi salinan tidak aktif / template bola di posisi
        // (0,0) yang tandanya sempat cocok, sehingga bola asli di alamat
        // tinggi (idx ~12,7 juta, byte ~101 juta) terhalang dan tidak
        // pernah masuk daftar. Sekarang kumpulkan SEMUA kandidat per nomor,
        // lalu pilih yang posisinya BUKAN (0,0) dan idx-nya paling besar
        // (bola asli di heap atas). Kandidat (0,0) hanya dipakai kalau
        // tidak ada kandidat lain untuk nomor itu.
        var byNum = {}, i = 0, n = h.f64.length, chunk = 5000000;
        var finalize = function () {
            var out = [];
            for (var nn = 0; nn <= 15; nn++) {
              var cands = byNum[nn]; if (!cands) continue;
              var real = cands.filter(function (c) { return !(c.x === 0 && c.y === 0); });
              var pool = real.length ? real : cands;
              pool.sort(function (a, b) { return b.idx - a.idx; });
              out.push(pool[0]);
              if (cands.length > 1) log('CARI LANGSUNG nomor=' + nn + ' kandidat=' + cands.length + ' dipilih idx=' + pool[0].idx + ' (' + pool[0].x.toFixed(1) + ',' + pool[0].y.toFixed(1) + ')' + (real.length ? '' : ' — HANYA (0,0), bola ini mungkin tidak di meja'));
            }
            out.sort(function (a, b) { return a.num - b.num; });
            return out;
          };
        (function step() {
          var end = Math.min(n - 7, i + chunk);
          for (; i < end; i++) {
            var rad = h.f64[i + 6];
            if (Math.abs(rad - 3.800475) > 0.000001) continue;
            var num = h.i32[2 * i + 23];
            if (num < 0 || num > 15) continue;
            var x = h.f64[i], y = h.f64[i + 1];
            if (!isFinite(x) || !isFinite(y)) continue;
            if (x < -200 || x > 200 || y < -160 || y > 160) continue;
            if (!byNum[num]) byNum[num] = [];
            byNum[num].push({ x: x, y: y, idx: i, num: num });
          }
          // CEPAT: bola asli di semua log ada di idx <25 juta (byte <200MB).
          // Kalau sudah lewat 25 juta dan sudah ada >=6 nomor posisi asli,
          // berhenti, tidak perlu scan sampai 838MB penuh. Kalau belum,
          // lanjut scan penuh sebagai cadangan.
          var realCount = 0;
          for (var nn2 = 0; nn2 <= 15; nn2++) {
            var cc2 = byNum[nn2];
            if (cc2 && cc2.some(function (c) { return !(c.x === 0 && c.y === 0); })) realCount++;
          }
          if (i < n - 7 && !(i >= 25000000 && realCount >= 6)) {
            setTimeout(step, 0);
          } else {
            if (i < n - 7) log('CARI LANGSUNG berhenti cepat di idx=' + i + ' (bola asli sudah ' + realCount + ' nomor, tidak scan sampai akhir).');
            resolve(finalize());
          }
        })();
      });
    }
    // v2.58 DIHAPUS: saveLearn (SIMPAN posisi). Tidak ada lagi fase belajar.
    async function saveLearn() { log('v2.58: SIMPAN NONAKTIF — tidak ada fase belajar, bola dibaca langsung via getter (tombol DEBUG GETTER).'); return; }
    // v2.58 DIHAPUS: autoDetect (scan heap berat + belajar). Deteksi rack/
    // match baru ditangani autoDetectCheck() berbasis getter (readGetterBalls).
    async function autoDetect() { log('v2.58: autoDetect NONAKTIF (scan heap dihapus) — baca bola pakai getter.'); return false; }
    // v2.58 DIHAPUS: compareLearn (BANDINGKAN sesudah tembak manual).
    // Nomor bola langsung dari getter (getBallByNumber) — tidak ada lagi
    // SIMPAN -> tembak manual -> BANDINGKAN.
    async function compareLearn() { log('v2.58: BANDINGKAN NONAKTIF — nomor bola langsung dari getter.'); return; }
    function directReadBalls(moved, h) { return []; }
    function findPointerArray(h, phys) { return null; }
    // v2.58 DIHAPUS: readPointerBalls (baca array via learned.arrayBase).
    function readPointerBalls(h, learned) { return null; }
    function updateLearnStat() { updateGetterStat(); }
    function updateGetterStat() {
      var el = $('akv2LearnStat');
      if (el) el.textContent = 'GETTER v2.58: ' + (S.getterDiag || 'belum dibaca — tekan DEBUG GETTER / BACA BOLA.') + ' (getter dynCall + scan heap fallback + pointer tracking)';
    }
    // v2.58: DIAGNOSTIK AUTOPLAY LIVE — panel menunjukkan ALASAN autoplay
    // tidak menembak, tanpa perlu kirim log. Dipanggil tiap tick loopTick
    // (150ms); probe nilai gate di-throttle 1/detik (dynCall murah tapi
    // jangan tiap tick). Tidak pernah throw (try/catch di dalam).
    function updateDiag() {
      try {
        var el = $('akv2Diag');
        if (!el) return;
        var now = Date.now();
        // Probe nilai gate (sekali/detik): baca langsung via akGateCall.
        if (!S.diagGateAt || now - S.diagGateAt >= 1000) {
          S.diagGateAt = now;
          S.diagGate = probeGateValues();
        }
        var g = S.diagGate || {};
        var r = S.lastGetterRes || null;
        var nBalls = r ? r.balls.length : 0;
        var lines = [];
        lines.push('v2.58 | LOOP tick ' + (S.diagTick || 0) + ' | AUTOPLAY: ' + (S.autoBeruntun ? 'ON' : 'OFF') + (S.autoUserOff ? ' (dimatikan user)' : '') + ' | autoTick ' + (S.autoTickCount || 0) + 'x | bola ' + nBalls + (r && r.numbersOk ? '' : ' (TIDAK OK)') + ' | build ' + (S.buildName || '?') + ' | grup ' + (S.group || 'ANY'));
        // Baris penentu: SATU kalimat alasan kenapa belum menembak.
        lines.push('➤ ' + diagBlockerReason(g, r));
        if (S.autoBeruntun && S.holdReason) lines.push('TAHAN (keputusan autoplay): ' + S.holdReason);
        var gs = (g.gs !== undefined) ? ('gs=' + g.gs + ' pt=' + g.pt + ' ws=' + g.ws + ' wd=' + g.wd + ' ia=' + g.ia + ' pm=' + g.pm + ' aa=' + g.aa + ' pa=' + g.pa) : 'gate belum ter-probe';
        lines.push('GATE ' + gs + (g.mgrOk === false ? ' | MANAGER INVALID gm=' + g.gm + ' mm=' + g.mm : '') + (S.matchResult ? ' | MATCH=' + S.matchResult : ''));
        lines.push('CUE max=' + S.cueMaxPower + (S.cueMaxLive ? ' (live game: ' + S.cueMaxLive.toFixed(1) + ')' : ' (live belum terbaca)') + (S.cueAuto ? ' AUTO' : ' MAN'));
        if (S.lastGateFail && S.lastGateFail.length) lines.push('GATE TERAKHIR GAGAL [' + S.lastGateFail.join(',') + '] ' + (S.lastGateReasons ? S.lastGateReasons.join(' ; ') : ''));
        var pk = S.lastPick;
        if (pk) lines.push('PICK bola ' + (pk.target === null ? '?' : pk.target) + (pk.pocket ? ' → ' + pk.pocket : '') + ' | validated ' + (pk.validated ? 'YA' : 'TIDAK') + ' | ' + (pk.reason || ''));
        else lines.push('PICK: belum ada (picker belum jalan)');
        var sh = S.lastShot;
        if (sh) lines.push('TEMBAK ' + new Date(sh.at).toLocaleTimeString() + ' ' + sh.result + (sh.target !== undefined && sh.target !== null ? ' target=' + sh.target : ''));
        else lines.push('TEMBAK: belum pernah dicoba');
        el.textContent = lines.join('\n');
      } catch (e) {}
    }
    // v2.58: BACA MAX POWER LIVE dari game — mMaxCuePowerOffset, double
    // di (cue+176) (bindings S2b; getter 26447 menghitung nilai yang sama
    // dari stat cue yang dipakai). Nilai ini BUKAN tebakan: kalau masuk
    // akal sebagai kecepatan sim (200..500, skala kalibrasi v2.62),
    // nilainya masuk akal; kalau di luar itu (misalnya ternyata
    // satuannya offset drag, bukan kecepatan), DIABAIKAN dan default
    // 306 tetap dipakai. Dibaca 1/detik bareng probeGateValues.
    // (cue+176) adalah offset ivar LANGSUNG (tanpa geser +4 — geser itu
    // khusus struct bola; setter setPower menyimpan rasio di (cue+8),
    // terverifikasi via oracle di rig probe16.) CATATAN v2.62: kalau
    // probe ini suatu hari membaca ~300, itu KONFIRMASI independen
    // skala kalibrasi (cueMaxPower 306); sejauh ini selalu null.
    // v2.61: probe ini DISPLAY-ONLY — TIDAK LAGI menimpa S.cueMaxPower.
    // Alasan: offset heap mentah (cue+176) adalah kelas yang SAMA dengan
    // yang merusak readback v2.58 (mPower ternyata di (cue+12), bukan
    // (cue+8)); kalau nilai live-nya salah (mis. 1100), dia mendorong
    // max NAIK -> semua rasio mengecil -> tembakan sistematis KEPELAN,
    // dan dia MELAWAN tuner (tuner menurunkan max, probe menaikkan lagi
    // tiap detik). Satu-satunya penulis cueMaxPower sekarang adalah
    // tuneCuePower (belajar dari hasil tembakan nyata). Nilai live tetap
    // ditampilkan di DIAG (baris CUE) untuk diagnosis.
    function probeCueMaxPower(M, cueObj) {
      try {
        if (!cueObj || !M) return;
        // Offset per build dari tabel (guest 176, bundled 0 = jangan baca).
        var off = (typeof AKV2_LIVE !== 'undefined' && AKV2_LIVE.cueMaxPowerOff) || 0;
        if (!off) return;
        var h = heapViews();
        if (!h) return;
        var buf = h.module.HEAPU8 ? h.module.HEAPU8.buffer : (h.module.memory ? h.module.memory.buffer : null);
        if (!buf) return;
        var dv = new DataView(buf);
        var live = dv.getFloat64(cueObj + off, true);
        if (!isFinite(live) || live <= 0) return;
        var changed = (S.cueMaxLive !== live);
        S.cueMaxLive = live;
        if ((live < 200 || live > 500) && changed) {
          log('CUE MAX LIVE: game bilang ' + live.toFixed(1) + ' — di luar rentang kecepatan (200..500), diabaikan (pakai ' + S.cueMaxPower + ')');
        }
      } catch (e) {}
    }
    function probeGateValues() {
      // Baca nilai gate LANGSUNG (tanpa plan): gameState/playerTurn/
      // waiting/winner di gm, inputActive/powerMode/anim di visualCue.
      // Mengembalikan {gs,pt,ws,wd,ia,pm,aa,pa,mgrOk,gm,mm} atau {}.
      try {
        var h = heapViews();
        if (!h || !h.module) return {};
        var M = h.module;
        var mgr = akGetManagers(h);
        var out = { mgrOk: !!mgr.ok, gm: mgr.gameManager, mm: mgr.mainManager };
        if (!mgr.ok) return out;
        function gv(fn, sel) { var v = akGateCall(M, fn, mgr.gameManager, sel); return v.ok ? v.value : null; }
        out.gs = gv(AKV2_LIVE.gameStateFunc, AKV2_LIVE.gameStateSel);
        out.pt = gv(AKV2_LIVE.playerTurnFunc, AKV2_LIVE.playerTurnSel);
        out.ws = gv(AKV2_LIVE.waitingShotFunc, AKV2_LIVE.waitingShotSel);
        out.wd = gv(AKV2_LIVE.winnerDefinedFunc, AKV2_LIVE.winnerDefinedSel);
        var cueObj = akGetVisualCue(M, mgr.gameManager);
        if (cueObj) {
          function cv(fn, sel) { var v = akGateCall(M, fn, cueObj, sel); return v.ok ? v.value : null; }
          out.ia = cv(AKV2_LIVE.inputActiveFunc, AKV2_LIVE.inputActiveSel);
          out.pm = cv(AKV2_LIVE.powerModeFunc, AKV2_LIVE.powerModeSel);
          out.aa = cv(AKV2_LIVE.aimAnimFunc, AKV2_LIVE.aimAnimSel);
          out.pa = cv(AKV2_LIVE.powerAnimFunc, AKV2_LIVE.powerAnimSel);
          try { probeCueMaxPower(M, cueObj); } catch (ePCM) {}
        }
        return out;
      } catch (e) { return {}; }
    }
    function diagBlockerReason(g, r) {
      // SATU kalimat: kenapa autoplay belum menembak. Urutan = urutan
      // jalur autoplay (loop -> ON -> baca bola -> giliran -> picker -> gate -> tembak).
      try {
        if (!S.rafRunning) return 'LOOP MATI — rAF/timer tidak jalan (reload aplikasi).';
        if (!S.autoBeruntun) return 'AUTOPLAY MATI — tap tombol AUTO PLAY (atau tunggu auto-ON saat meja terdeteksi).';
        if (!r || !r.balls || !r.balls.length) return 'BOLA TIDAK TERBACA — getter/scan gagal (lihat GETTER di atas).';
        if (!r.numbersOk) return 'NOMOR BOLA TIDAK LENGKAP — cue hilang / bola <2.';
        if (r.cueInHand || S.cueInHand) return 'BOLA TANGAN — letakkan bola putih manual dulu.';
        if (S.matchResult) return 'MATCH SELESAI (' + S.matchResult + ') — gate menahan tembakan; tap MATCH BARU.';
        if (g.mgrOk === false) return 'MANAGER TIDAK VALID — binding build ini tidak cocok (coba meja lain / mode guest).';
        if (g.gs !== undefined && g.gs !== null && g.gs !== 4) return 'BUKAN GILIRAN KITA (gameState=' + g.gs + ') — menunggu giliran / lawan main.';
        if (g.pt !== undefined && g.pt !== null && g.pt !== 1) return 'BUKAN GILIRAN KITA (isPlayerTurn=' + g.pt + ').';
        if (g.ws !== undefined && g.ws !== null && g.ws !== 1) return 'MENUNGGU TEMBAKAN (isWaitingForPlayerShot=' + g.ws + ') — game belum siap.';
        if (g.ia !== undefined && g.ia !== null && g.ia !== 1) return 'INPUT TIDAK AKTIF (inputActive=' + g.ia + ').';
        if (g.pm !== undefined && g.pm !== null && g.pm !== 0) return 'POWER MODE AKTIF (powerMode=' + g.pm + ') — sedang tarik power.';
        if ((g.aa !== undefined && g.aa !== null && g.aa !== 0) || (g.pa !== undefined && g.pa !== null && g.pa !== 0)) return 'ANIMASI AIM/POWER MASIH JALAN (aa=' + g.aa + ' pa=' + g.pa + ').';
        if (S.oppWait) return 'MENUNGGU LAWAN MENEMBAK (30 detik) — lalu lanjut otomatis.';
        if (S.autoWaiting) return 'MENUNGGU BOLA BERHENTI setelah tembakan...';
        if (S.waitChange) return 'PICKER: tidak ada tembakan VALID (sim menolak semua) — menunggu meja berubah / retry 5 detik.';
        if (S.lastPick && !S.lastPick.validated) {
          var st = S.lastPick.simStats, extra = '';
          if (st) extra = ' (sim coba ' + st.tried + ' kandidat, yang valid: direct ' + (st.byType.direct || 0) + ', bank ' + (st.byType.bank || 0) + ', kick ' + (st.byType.kick || 0) + ', combo ' + (st.byType.combo || 0) + ')';
          return 'PICKER: tembakan terakhir TIDAK TERVALIDASI sim — ' + (S.lastPick.reason || '') + extra;
        }
        if (S.lastGateFail && S.lastGateFail.length) return 'GATE GAGAL: [' + S.lastGateFail.join(',') + '] — lihat baris GATE di bawah.';
        if (S.autoStableCount < 2) return 'MENUNGGU MEJA STABIL (' + S.autoStableCount + '/2)...';
        return 'SIAP — giliran kita, meja stabil, menunggu tembakan...';
      } catch (e) { return 'DIAG error.'; }
    }
    // v2.58 DIHAPUS: saveLearned (menyimpan fase belajar).
    function saveLearned(res, source) { log('v2.58: saveLearned NONAKTIF.'); return false; }
    function readAuto() {
      // v2.58: baca instan = getter + fallback scan heap. Mengembalikan
      // bentuk yang sama seperti dulu supaya pickShot/drawShot/autoTick
      // tidak berubah: {balls, missing, pockets, pocketWidth, radius,
      // numbersOk, cueState, cueInHand, tablePointer, ...}.
      var r = readGetterBalls();
      if (!r) return null;
      return r;
    }
    function autoStableCheck(autoRes) {
      if (!S.autoLastBalls) { S.autoLastBalls = autoRes.balls; S.autoStableCount = 1; return false; }
      var stable = true;
      if (S.autoLastBalls.length !== autoRes.balls.length) stable = false;
      else {
        var map = {}; S.autoLastBalls.forEach(function (b) { map[b.num] = b; });
        for (var i = 0; i < autoRes.balls.length; i++) {
          var o = map[autoRes.balls[i].num];
          if (!o || Math.hypot(autoRes.balls[i].x - o.x, autoRes.balls[i].y - o.y) > 1) { stable = false; break; }
        }
      }
      S.autoLastBalls = autoRes.balls;
      if (stable) S.autoStableCount++; else S.autoStableCount = 1;
      return S.autoStableCount >= 2;
    }
    // v2.58: KEPUTUSAN AUTOPLAY ala V7 (autoplayDecision) — SATU tempat
    // yang memutuskan tembak/tahan, dengan SATU kalimat alasan (seperti
    // V7 yang menampilkan "autoplay: <alasan>" di statusnya). Dipanggil
    // shootNext sesudah pickShot menemukan tembakan tervalidasi, sebelum
    // buildPlan — jadi kalau ditahan, tidak ada plan/commit yang dibuat.
    // Sinyal yang dipakai: autoplay ON, tembakan tervalidasi (aturan
    // v2.41 — TIDAK PERNAH menembak unvalidated), bukan bola tangan,
    // match belum selesai, manager valid, giliran kita (nilai gate hasil
    // probe 1/detik di S.diagGate — BUKAN pixel, BUKAN baca ulang), bola
    // diam >= 500 ms (stillMs, ala V7 siapMs). Kalau S.diagGate belum
    // ter-probe, cek giliran DILEWATI (jangan blokir) — gate lengkap
    // readCommitState TETAP jadi penjaga akhir di commitShot.
    function autoplayDecision(autoRes, shot) {
      if (!S.autoBeruntun) return { fire: false, reason: 'AUTOPLAY MATI — tap tombol AUTO PLAY (atau tunggu auto-ON saat meja terdeteksi).' };
      if (!shot) return { fire: false, reason: 'tidak ada tembakan.' };
      if (!shot.validated) return { fire: false, reason: 'PICKER: tembakan tidak tervalidasi sim.' };
      if ((autoRes && autoRes.cueInHand) || S.cueInHand) return { fire: false, reason: 'BOLA TANGAN — letakkan putih manual dulu.' };
      if (S.matchResult) return { fire: false, reason: 'MATCH SELESAI (' + S.matchResult + ') — tap MATCH BARU.' };
      var g = S.diagGate || {};
      if (g.mgrOk === false) return { fire: false, reason: 'MANAGER TIDAK VALID — binding build ini tidak cocok.' };
      if (g.gs !== undefined && g.gs !== null && g.gs !== 4) return { fire: false, reason: 'BUKAN GILIRAN KITA (gameState=' + g.gs + ') — menunggu giliran / lawan main.' };
      if (g.pt !== undefined && g.pt !== null && g.pt !== 1) return { fire: false, reason: 'BUKAN GILIRAN KITA (isPlayerTurn=' + g.pt + ').' };
      if (g.ws !== undefined && g.ws !== null && g.ws !== 1) return { fire: false, reason: 'MENUNGGU TEMBAKAN (isWaitingForPlayerShot=' + g.ws + ') — game belum siap.' };
      var sm = stillMs(autoRes);
      if (sm < 500) return { fire: false, reason: 'menunggu bola diam 500ms (baru ' + sm + 'ms).', wait: true };
      return { fire: true, reason: '' };
    }
    // v2.58: BOLA DIAM ala V7 (siapMs) — berapa ms meja sudah diam.
    // Diam = kecepatan maks <= 0.05 (dari heap, bukan posisi saja) DAN
    // semua bola dalam 1.5 unit dari bacaan sebelumnya (toleran: 1 bola
    // boleh tak-terpasang / jumlah berubah — seperti sceneStill V7 yang
    // toleran 10%). Kalau bergerak, timer di-reset. Dipakai
    // autoplayDecision; autoStableCheck tetap jadi pre-filter di autoTick.
    function stillMs(autoRes) {
      if (!autoRes || !autoRes.balls || !autoRes.balls.length) { S.stillSince = 0; S.stillLastBalls = null; return 0; }
      var maxSpeed = 0;
      for (var i = 0; i < autoRes.balls.length; i++) {
        var sp = Math.hypot(autoRes.balls[i].vx || 0, autoRes.balls[i].vy || 0);
        if (sp > maxSpeed) maxSpeed = sp;
      }
      var stable = maxSpeed <= 0.05;
      if (stable && S.stillLastBalls) {
        var map = {}; S.stillLastBalls.forEach(function (b) { map[b.num] = b; });
        var unmatched = 0;
        for (var j = 0; j < autoRes.balls.length; j++) {
          var o = map[autoRes.balls[j].num];
          if (!o) { unmatched++; continue; }
          if (Math.hypot(autoRes.balls[j].x - o.x, autoRes.balls[j].y - o.y) > 1.5) { stable = false; break; }
        }
        if (stable) {
          if (Math.abs(S.stillLastBalls.length - autoRes.balls.length) > 1) stable = false;
          else if (unmatched > 1) stable = false;
        }
      }
      S.stillLastBalls = autoRes.balls;
      var now = Date.now();
      if (!stable) { S.stillSince = 0; return 0; }
      if (!S.stillSince) { S.stillSince = now; return 0; }
      return now - S.stillSince;
    }
    function setBeruntun(on, fromUser) {
      // v2.58: TANPA gating "MENUNGGU BELAJAR" — autoplay langsung ON/OFF.
      // Bola dibaca via getter setiap tick rAF, tidak butuh fase belajar.
      // fromUser=true = tombol ditekan user: matikan auto-enable (autoUserOff)
      // sampai user menyalakan lagi / match baru. Auto-enable (loopTick)
      // memanggil setBeruntun(true) TANPA fromUser.
      S.autoBeruntun = on;
      if (fromUser) S.autoUserOff = !on; else if (on) S.autoUserOff = false;
      if (!on) { S.autoplayPending = false; S.oppWait = false; S.oppMoved = false; S.waitChange = false; S.waitChangeBalls = null; S.autoWaiting = false; }
      var b = $('akv2Beruntun'); if (b) b.textContent = 'AUTO BERUNTUN: ' + (on ? 'ON' : 'OFF');
      var ap = $('akv2Autoplay'); if (ap) ap.textContent = (on ? '⏸ AUTOPLAY: ON' : '▶ AUTOPLAY: OFF');
      if (!on) S.autoWaiting = false;
      log('AUTOPLAY ' + (on ? 'ON (getter dynCall, tanpa belajar; kalau giliran lawan dia menunggu lalu lanjut otomatis)' : 'OFF'));
    }
    function checkBallImages() {
      // Metode JSON/XML tadi: daftar resource yang dimuat game (performance).
      // Di dalamnya ada resourcePacksConfig.json, file .plist (XML), dan
      // URL gambar bola ball0-ipad.png .. ball15-ipad.png. Ini BUKAN posisi bola,
      // tapi patokan nomor: nomor heap N harus cocok dengan ballN-ipad.png,
      // dan grupnya dari N (1-7 polos, 8 hitam, 9-15 garis, 0 cue).
      var res = [];
      try { res = performance.getEntriesByType('resource') || []; } catch (e) { res = []; }
      var map = {}, jsonUrls = [], plistUrls = [];
      for (var i = 0; i < res.length; i++) {
        var u = res[i].name || '';
        var m = u.match(/ball(\d+)-ipad\.png/);
        if (m && !map[m[1]]) map[m[1]] = u;
        if (/\.json(\?|$)/.test(u) && jsonUrls.indexOf(u) < 0) jsonUrls.push(u);
        if (/\.plist(\?|$)/.test(u) && plistUrls.indexOf(u) < 0) plistUrls.push(u);
      }
      S.ballImages = map;
      var nums = Object.keys(map).map(function (x) { return parseInt(x, 10); }).sort(function (a, b) { return a - b; });
      var missing = [];
      for (var n = 0; n <= 15; n++) if (nums.indexOf(n) < 0) missing.push(n);
      log('GAMBAR BOLA: ' + nums.length + ' gambar ketemu nomor=' + JSON.stringify(nums) + (missing.length ? ' HILANG=' + JSON.stringify(missing) : ' (0-15 lengkap)'));
      log('GAMBAR JSON: ' + jsonUrls.length + ' file, PLIST/XML: ' + plistUrls.length + ' file. Contoh JSON: ' + (jsonUrls[0] || '-') + ' | Contoh PLIST: ' + (plistUrls[0] || '-'));
      var _gr = readGetterBalls();
      if (_gr) { var ok = 0, bad = []; _gr.balls.forEach(function (e) { if (map[String(e.num)]) ok++; else bad.push(e.num); }); log('GAMBAR vs GETTER: ' + ok + ' nomor getter cocok dengan ballN-ipad.png' + (bad.length ? ', tidak cocok=' + JSON.stringify(bad) : '')); }
      else log('GAMBAR vs GETTER: bola tidak terbaca via getter.');
      stat('Gambar bola: ' + nums.length + '/16 nomor, JSON ' + jsonUrls.length + ', PLIST ' + plistUrls.length);
    }
    async function autoGiliran() {
      // v2.58: baca getter -> pickShot -> plan -> commitShot (dynCall).
      var autoRes = readAuto();
      if (!autoRes) { log('AUTO GILIRAN gagal: bola tidak terbaca via getter.'); return; }
      var shot = pickShot(autoRes.balls, autoRes.pockets, autoRes.radius, S.group, S.allowBank, autoRes.pocketWidth);
      if (!shot) { log('AUTO GILIRAN: tidak ada tembakan (bola ' + autoRes.balls.length + ', hilang ' + autoRes.missing.length + ')'); drawShot(null, autoRes); return; }
      drawShot(shot, autoRes);
      if (!shot.validated) { log('AUTO GILIRAN: tidak ada tembakan VALID — garis prediksi ditampilkan, tidak ditembak.'); return; }
      S.lastScan = { res: autoRes, shot: shot };
      log('AUTO GILIRAN target=' + autoRes.balls[shot.targetIdx].num + ' power=' + shot.power + ' (getter, tanpa SCAN)');
      var plan = buildPlan(autoRes, shot);
      S.tunePre = autoRes; S.tuneShot = shot;
      S.autoPreShotNums = autoRes.balls.map(function (b) { return b.num; });
      await shootWithFallback(plan, autoRes, shot);
    }
    function resetMatchState(why) {
      // v2.44: reset TOTAL semua state match. clearLearned lama hanya reset
      // sebagian — sisanya (waitChange, autoWaiting, oppWait, linesFrozen,
      // shooting, lastAutoDetectFail, lastScan, timer) bikin solver "stuck
      // aneh gajelas" di match baru. Dipakai deteksi menang/kalah, tombol
      // MATCH BARU, dan semua jalur clearLearned.
      S.autoLastBalls = null; S.autoStableCount = 0; S.staleCount = 0; S.prevBallCount = 0;
      // v2.58: BUG LATCH — S.matchResult TIDAK PERNAH di-clear (hanya di-set
      // di autoDetectCheck saat bola 8 hilang, dibaca gate 'match-ended').
      // Sekali match selesai, gate gagal SELAMANYA untuk semua match
      // berikutnya sampai reload. Di-clear di sini (dipanggil deteksi match
      // baru + tombol MATCH BARU) supaya match baru bisa menembak lagi.
      S.matchResult = null;
      // v2.58: match baru = mulai segar — autoplay boleh auto-ON lagi.
      S.autoUserOff = false;
      if (S.group) { try { log('GRUP di-reset (match baru): ' + S.group + ' -> ANY'); } catch (eG) {} }
      S.group = null; try { updateGroupBtn(); } catch (eGB) {}
      S.breakDone = false; S.rackValidated = false; S.oppStartBalls = null;
      S.waitChange = false; S.waitChangeBalls = null; S.waitChangeSince = 0;
      S.autoWaiting = false; S.oppWait = false; S.oppMoved = false; S.oppWaitStart = 0; S.oppLastBalls = null;
      S.shooting = false; S.linesFrozen = false;
      S.autoDetecting = false; S.lastAutoDetectFail = 0;
      S.sawEight = false; S.eightGoneCount = 0;
      S.tunePre = null; S.tuneShot = null; S.lastScan = null;
      S.refreshLastBalls = null; S.fastLastBalls = null; S.fastStable = 0;
      S.autoPreShotNums = null; S.cushLines = null; S.cueInHand = false; S.lastPlaceTry = 0;
      S.trackedIdx = {}; S.trackedActive = false; // v2.58: rack baru = struct baru, pointer lama dibuang.
      S.waitingNewMatch = true; // v2.44: lagi nunggu match baru → cooldown deteksi cuma 5 detik (bukan 30)
      try { var oc = $('akv2Overlay'); if (oc) oc.getContext('2d').clearRect(0, 0, oc.width, oc.height); } catch (eOC) {}
      try { updateGetterStat(); } catch (eUL) {}
      try { log(why); } catch (eL) {}
    }
    function clearLearned(why) {
      resetMatchState(why);
    }
    // v2.25: Tombol MATCH BARU manual — untuk guest mode yang deteksi otomatisnya gagal.
    // Clear SEMUA state dan langsung deteksi ulang.
    async function matchBaru() {
      // v2.58: reset total, lalu baca ulang via getter (+ scan fallback).
      resetMatchState('🔄 MATCH BARU: state di-reset total.');
      log('🔄 MATCH BARU: baca ulang via getter...');
      var ok = false;
      for (var _mi = 0; _mi < 3 && !ok; _mi++) {
        try { var r = readGetterBalls(); if (r && r.balls.length >= 2) { ok = true; S.lastScan = { res: r, shot: null }; log('🔄 MATCH BARU: getter OK, ' + r.balls.length + ' bola.'); } } catch (e) { log('Match baru baca error: ' + e.message); }
        if (!ok && _mi < 2) await new Promise(function (res2) { setTimeout(res2, 1500); });
      }
      if (!ok) log('🔄 MATCH BARU: getter belum berhasil — solver akan coba otomatis tiap tick rAF sampai meja baru muncul.');
      log('🔄 MATCH BARU selesai — siap main!');
    }
    async function autoDetectCheck(tag) {
      // v2.58: deteksi rack/match-baru/menang-kalah dari BACAAN GETTER
      // (readAuto), TANPA scan heap dan TANPA fase belajar. Dipakai rAF loop.
      var chk = readAuto();
      if (!chk || !chk.balls) return false;
      var n = chk.balls.length;
      // v2.58: ambang meja-kosong 6 -> 2. Endgame normal (2-5 bola) JANGAN me-reset match.
      if (n < 2) {
        S.staleCount = (S.staleCount || 0) + 1;
        if (S.staleCount >= 3) {
          log(tag + ': bola kebaca ' + n + ' (3x berturut-turut) — match selesai / meja kosong, reset.');
          resetMatchState(tag + ': meja kosong terdeteksi, state di-reset.');
          S.staleCount = 0;
        }
        return true;
      }
      S.staleCount = 0;
      // Validasi rack 1x per meja: >=14 bola tapi bbox kesebar = break sudah
      // terjadi (bukan array stale — di v2.58 tidak ada array belajar).
      if (!S.breakDone && n >= 14) {
        var _xs = [], _ys = [];
        for (var _bi = 0; _bi < chk.balls.length; _bi++) { if (chk.balls[_bi].num === 0) continue; _xs.push(chk.balls[_bi].x); _ys.push(chk.balls[_bi].y); }
        var _bx = Math.max.apply(null, _xs) - Math.min.apply(null, _xs);
        var _by = Math.max.apply(null, _ys) - Math.min.apply(null, _ys);
        if (_bx > 100 || _by > 100) {
          if (S.rackValidated) { log('✅ RACK kesebar TERKONFIRMASI pasca-break — breakDone=true.'); S.breakDone = true; S.rackValidated = false; return false; }
          S.rackValidated = true;
          log('⚠️ RACK kesebar (' + _bx.toFixed(0) + 'x' + _by.toFixed(0) + ') — dicek sekali lagi tick berikut; kalau tetap kesebar = pasca-break.');
          return true;
        }
      }
      // Deteksi menang/kalah: bola 8 hilang 2x baca berturut-turut.
      var _hasEight = false;
      for (var _ei = 0; _ei < chk.balls.length; _ei++) if (chk.balls[_ei].num === 8) { _hasEight = true; break; }
      if (_hasEight) { S.sawEight = true; S.eightGoneCount = 0; }
      else if (S.sawEight) {
        S.eightGoneCount = (S.eightGoneCount || 0) + 1;
        // v2.58: 2 -> 3 tick — glitch baca getter sesaat (bola 8 tidak
        // kebaca 2 tick) tidak boleh mematikan autoplay satu sesi penuh.
        if (S.eightGoneCount >= 3) {
          var _remGroup = 0;
          if (S.group) {
            for (var _gi = 0; _gi < chk.balls.length; _gi++) {
              var _gn = chk.balls[_gi].num;
              if (S.group === 'solid' && _gn >= 1 && _gn <= 7) _remGroup++;
              if (S.group === 'stripe' && _gn >= 9 && _gn <= 15) _remGroup++;
            }
          }
          var _wonMatch = (S.group && _remGroup === 0) || (chk.balls.length >= 14 && S.breakDone);
          S.matchResult = _wonMatch ? 'win' : 'lose';
          try { stat(_wonMatch ? '🏆 MENANG — match selesai!' : '💔 KALAH — match selesai!'); } catch (eSR) {}
          resetMatchState((_wonMatch ? '🏆 MENANG! Match selesai — bola 8 masuk, grup kita habis.' : '💔 KALAH. Match selesai — bola 8 masuk.') + ' Reset total, menunggu match baru...');
          return true;
        }
      }
      // Match baru: bola kembali banyak (>=14 dan lebih banyak dari sebelumnya).
      if (n >= 14 && S.prevBallCount && n > S.prevBallCount) {
        resetMatchState(tag + ': MATCH BARU terdeteksi (bola ' + S.prevBallCount + ' -> ' + n + ').');
        var _sw = tryAutoSwitchTable();
        if (_sw) { var _pne = $('akv2ProfName'); if (_pne) _pne.textContent = _sw; log('GANTI MEJA OTOMATIS -> ' + _sw + ' (aset table cocok).'); }
        return true;
      }
      S.prevBallCount = n;
      return false;
    }
    async function refreshOverlay() {
      // Dipanggil deteksiTick saat autoplay OFF: baca bola instan lewat
      // array, kalau sudah stabil 2x berturut-turut, hitung tembakan dan
      // gambar ulang garis + angka, supaya overlay selalu sesuai meja
      // terbaru walau user tembak manual. Tidak pakai scan, tidak menembak.
      if (S.linesFrozen) return; // v2.16: garis dibekukan sampai bola berhenti
      var autoRes = readAuto();
      if (!autoRes || !autoRes.balls || autoRes.balls.length < 2) return; // v2.58: ambang 6 -> 2
      var stable = false;
      if (S.refreshLastBalls && S.refreshLastBalls.length === autoRes.balls.length) {
        stable = true;
        var map = {};
        S.refreshLastBalls.forEach(function (b) { map[b.num] = b; });
        for (var i = 0; i < autoRes.balls.length; i++) {
          var o = map[autoRes.balls[i].num];
          if (!o || Math.hypot(autoRes.balls[i].x - o.x, autoRes.balls[i].y - o.y) > 2) { stable = false; break; }
        }
      }
      S.refreshLastBalls = autoRes.balls;
      if (!stable) return;
      // v2.61: autoplay OFF = BEBAS (bukan magnet) — garis dari AIM USER
      // realtime (manualShotFromAim + livePreview), bukan dari pick
      // solver. Kalau aim game tidak terbaca, fallback ke garis pick
      // solver lama supaya overlay tidak kosong.
      var mShot = null;
      try { mShot = manualShotFromAim(autoRes); } catch (eM) { mShot = null; }
      if (mShot) {
        S.lastScan = { res: autoRes, shot: mShot };
        var drew = false;
        try { drew = livePreview(autoRes, mShot); } catch (eLPM) {}
        if (!drew) drawShot(mShot, autoRes);
        var _mn = (mShot.targetIdx >= 0 && autoRes.balls[mShot.targetIdx]) ? autoRes.balls[mShot.targetIdx].num : '-';
        log('REFRESH garis manual target=' + _mn + ' (aim user realtime, tanpa magnet)');
        return;
      }
      var shot = pickShot(autoRes.balls, autoRes.pockets, autoRes.radius, S.group, S.allowBank, autoRes.pocketWidth, true); // v2.41: noSim — garis display saja, sim tiap 3 detik bikin patah-patah
      S.lastScan = { res: autoRes, shot: shot || null };
      drawShot(shot, autoRes);
      if (shot) { try { livePreview(autoRes, shot); } catch (eLP) {} } // v2.60: trajektori + titik berhenti LIVE dari aim/power game
      if (shot) log('REFRESH garis target=' + autoRes.balls[shot.targetIdx].num + ' (otomatis, bola stabil)');
    }
    async function deteksiTick() {
      // v2.58: deteksiTick TIDAK dijadwalkan lagi (tidak ada setInterval).
      // Dipakai hanya kalau dipanggil manual — isinya refresh overlay saja.
      try { await refreshOverlay(); } catch (e) {}
    }
    // v2.58 DIHAPUS: fastTimer 250ms (setInterval). Stabilitas bola
    // ditangani rAF loop (signature posisi) + autoStableCheck di autoTick.
    function stopFastTimer() { return; }
    function startFastTimer() { return; }
    // v2.58 DINONAKTIFKAN: placeCueBall (geser putih via drag pointer).
    // Bola tangan: letakkan putih MANUAL di layar, autoplay lanjut sendiri.
    // Drag pointer tidak pernah dipakai untuk menggerakkan game di v2.58.
    async function placeCueBall(autoRes) { log('🎱 BOLA TANGAN: letakkan putih MANUAL (drag solver dinonaktifkan v2.58).'); return false; }
    async function shootNext(autoRes) {
      var shot = null;
      // v2.58: BOLA TANGAN — putih bisa digeser = JANGAN tembak otomatis,
      // tunggu user meletakkan manual (placeCueBall drag DINONAKTIFKAN).
      if (autoRes.cueInHand || S.cueInHand) { log('🎱 BOLA TANGAN: putih masih bisa digeser — letakkan manual lalu autoplay lanjut.'); return; }
      if (isBreakShot(autoRes.balls) && !S.breakDone) {
        try { log('💥 BREAK terdeteksi (' + autoRes.balls.length + ' bola) — pakai AUTO-BREAK ala Arab'); } catch (eB) {}
        shot = findBreakShot(autoRes.balls, autoRes.radius);
        if (!shot) {
          try { log('💥 BREAK fallback: tembak lurus power MAX'); } catch (eB2) {}
          shot = pickShot(autoRes.balls, autoRes.pockets, autoRes.radius, S.group, S.allowBank, autoRes.pocketWidth);
          if (shot) { shot.power = 85; shot.simPower = S.cueMaxPower || 306; }
        }
      } else {
        shot = pickShot(autoRes.balls, autoRes.pockets, autoRes.radius, S.group, S.allowBank, autoRes.pocketWidth);
      }
      drawShot(shot, autoRes);
      // v2.58: catat hasil picker untuk diagnostik panel.
      try {
        S.lastPick = { at: Date.now(), target: (shot && shot.targetIdx >= 0 && autoRes.balls[shot.targetIdx]) ? autoRes.balls[shot.targetIdx].num : null,
          pocket: (shot && shot.pocket) ? (shot.pocket.x + ',' + shot.pocket.y) : null,
          validated: !!(shot && shot.validated), angle: shot ? shot.angle : null, power: shot ? shot.power : null,
          // v2.59: detail jalan alternatif yang dicoba sim (direct/bank/kick/combo)
          simStats: (shot && shot.simStats) ? shot.simStats : null,
          kind: (shot ? (shot.combo ? 'combo' : (shot.bank ? 'bank' : (shot.kick ? 'kick' : 'direct'))) : null),
          reason: !shot ? 'pickShot null' : (!shot.validated ? 'sim menolak semua (validated=false)' : 'ok') };
      } catch (eLP) {}
      if (!shot || !shot.validated) {
        if (!S.waitChange) log('AUTOPLAY: tidak ada tembakan VALID (sim menolak semua). Garis prediksi tetap tampil, menunggu meja berubah...');
        S.waitChange = true; S.waitChangeBalls = autoRes.balls; S.waitChangeSince = Date.now();
        return;
      }
      S.waitChange = false; S.waitChangeBalls = null;
      // v2.58: KEPUTUSAN ala V7 — satu tempat, satu alasan. Kalau ditahan,
      // JANGAN build plan / commit; alasannya disimpan di S.holdReason
      // untuk DIAG (baris TAHAN). Gate readCommitState di commitShot
      // tetap jadi penjaga akhir.
      var dec = autoplayDecision(autoRes, shot);
      S.holdReason = dec.reason || '';
      if (!dec.fire) { log('AUTOPLAY DITAHAN: ' + dec.reason); return; }
      S.lastScan = { res: autoRes, shot: shot };
      S.autoPreShotNums = autoRes.balls.map(function (b) { return b.num; });
      S.tunePre = autoRes; S.tuneShot = shot;
      S.autoWaiting = true; S.autoStableCount = 0; S.autoLastBalls = null;
      log('AUTO tembak target=' + autoRes.balls[shot.targetIdx].num + ' powerUI=' + shot.power.toFixed(0) + (shot.simPower ? ' (sim ' + Math.round(shot.simPower) + ')' : ''));
      var plan = buildPlan(autoRes, shot);
      var fired = await shootWithFallback(plan, autoRes, shot);
      if (!fired) {
        S.autoWaiting = false; S.tunePre = null; S.tuneShot = null;
        S.autoStableCount = 0; S.autoLastBalls = null;
        log('Tembakan tidak terkirim (gate/plan/dynCall), ulangi pencarian...');
      }
    }
    async function afterShotStable(autoRes) {
      // v2.16: bola sudah berhenti -> cairkan garis beku, clear, gambar baru
      // v2.30: paksa baca ulang + gambar presisi (line wajib sama dengan posisi bola)
      if (S.linesFrozen) {
        S.linesFrozen = false;
        try {
          var oc = $('akv2Overlay');
          if (oc) { var octx = oc.getContext('2d'); octx.clearRect(0, 0, oc.width, oc.height); }
        } catch (e) {}
        log('🧊 LINE CAIR — bola berhenti, garis baru digambar');
      }
      // v2.30: refresh paksa biar garis presisi sama posisi bola terkini
      try {
        if (S.linePreview !== false && autoRes && autoRes.balls) {
          var freshShot = pickShot(autoRes.balls, autoRes.pockets, autoRes.radius, S.group, S.allowBank, autoRes.pocketWidth);
          if (freshShot) { S.lastScan = { res: autoRes, shot: freshShot }; drawShot(freshShot, autoRes); }
        }
      } catch (eR) {}
      var curNums = autoRes.balls.map(function (b) { return b.num; });
      var potted = false;
      var pottedNums = []; // v2.9: daftar nomor bola yang masuk (untuk auto-deteksi grup)
      if (S.autoPreShotNums) for (var i = 0; i < S.autoPreShotNums.length; i++) {
        if (curNums.indexOf(S.autoPreShotNums[i]) < 0) { potted = true; pottedNums.push(S.autoPreShotNums[i]); }
      }
      // v2.9: AUTO-DETEKSI GRUP dari bola pertama yang masuk (kalau grup belum ditentukan).
      // v2.10: Cek apakah ini tembakan BREAK (16 bola sebelum tembak) — kalau ya, skip penentuan grup.
      var wasBreak = S.tunePre && S.tunePre.balls && S.tunePre.balls.length >= 16;
      try { autoDetectGroup(pottedNums, wasBreak); } catch (eG) {}
      if (wasBreak) S.breakDone = true;
      // v2.2: CUE AUTO-TUNE belajar dari hasil tembakan ini (sebelum state di-reset).
      try { tuneCuePower(S.tunePre, autoRes, S.tuneShot); } catch (e) {}
      // v2.4: POCKET LEARN dari bola yang masuk.
      try { learnPocketsFromPots(S.tunePre ? S.tunePre.balls : null, autoRes.balls, S.trail); } catch (e2) {}
      // v2.8: CUSHION LEARN dari bola yang memantul bantalan.
      try { learnCushionsFromBounces(S.trail, autoRes.balls); } catch (e3) {}
      S.tunePre = null; S.tuneShot = null;
      S.autoWaiting = false;
      stopFastTimer();
      if (!potted) {
        // v2.1: TIDAK PERNAH auto-off. Tembakan tidak memasukkan bola =
        // kemungkinan giliran lawan -> tunggu lawan menembak, lalu lanjut otomatis.
        // v2.7: kalau TUNGGU LAWAN dimatikan (main solo), langsung lanjut tanpa menunggu.
        if (S.waitOpp) {
          S.oppWait = true; S.oppMoved = false; S.oppWaitStart = Date.now(); S.oppLastBalls = autoRes.balls;
          S.oppStartBalls = autoRes.balls; // v2.10: simpan posisi awal untuk deteksi grup dari tembakan lawan
          S.autoStableCount = 0; S.autoLastBalls = null;
          log('Tembakan tidak memasukkan bola — kemungkinan giliran lawan. AUTOPLAY tetap ON, menunggu lawan menembak... (30 dtk)');
          drawShot(null, autoRes);
          return;
        }
        log('Tembakan tidak masuk — TUNGGU LAWAN mati, langsung lanjut.');
        S.autoStableCount = 2;
        await shootNext(autoRes);
        return;
      }
      log('AUTO lanjut: bola masuk, masih giliranmu.');
      S.autoStableCount = 2;
      await shootNext(autoRes);
    }
    function setAutoPhase(txt) {
      // v2.2: tampilkan fase autoplay di tombol biar kelihatan dia kerja apa macet.
      S.autoPhase = txt;
      var ap = $('akv2Autoplay');
      if (ap && S.autoBeruntun) ap.textContent = '⏸ AUTOPLAY: ON • ' + txt;
    }
    async function autoTick() {
      // v2.58: dipanggil dari rAF loop (bukan setInterval). Stabilitas sudah
      // disaring rAF via signature posisi; di sini autoStableCheck 2x baca.
      if (S.ticking) return;
      S.ticking = true;
      S.autoTickCount = (S.autoTickCount || 0) + 1; // v2.58: diagnostik panel
      try {
        if (!S.autoBeruntun || S.shooting || S.autoDetecting) return;
        if (await autoDetectCheck('AUTOPLAY')) return;
        var autoRes = readAuto();
        if (!autoRes || !autoRes.balls || !autoRes.balls.length) return;
        setAutoPhase(S.oppWait ? 'tunggu lawan' : S.autoWaiting ? 'tunggu bola diam' : S.waitChange ? 'cari jalan' : 'jalan');
        if (S.oppWait) {
          if (ballsMoved(S.oppLastBalls, autoRes.balls, 3)) S.oppMoved = true;
          S.oppLastBalls = autoRes.balls;
          if (S.oppMoved && autoStableCheck(autoRes)) {
            S.oppWait = false; S.oppMoved = false;
            log('Lawan selesai menembak — giliranmu lagi.');
            try { autoDetectGroupFromOpp(S.oppStartBalls, autoRes.balls); } catch (eGO) {}
            S.oppStartBalls = null;
            S.autoStableCount = 2;
            await shootNext(autoRes);
          } else if (Date.now() - S.oppWaitStart > 30000) {
            S.oppWait = false; S.oppMoved = false;
            log('30 detik tanpa tembakan lawan terdeteksi — lanjut main. (Matikan TUNGGU LAWAN kalau main solo.)');
            S.autoStableCount = 2;
            await shootNext(autoRes);
          }
          return;
        }
        if (S.waitChange) {
          if (ballsMoved(S.waitChangeBalls, autoRes.balls, 1)) {
            S.waitChange = false; S.waitChangeBalls = null;
            log('Meja berubah, cari tembakan lagi.');
          } else if (Date.now() - S.waitChangeSince > 5000) {
            S.waitChange = false; S.waitChangeBalls = null;
            log('Coba cari tembakan lagi (retry 5 detik).');
          } else return;
        }
        if (S.autoWaiting) {
          if (!autoStableCheck(autoRes)) return;
          await afterShotStable(autoRes);
        } else {
          if (!autoStableCheck(autoRes)) return;
          await shootNext(autoRes);
        }
      } catch (eAT) { try { log('AUTOTICK error: ' + eAT.message); } catch (eL3) {} } finally { S.ticking = false; }
    }
    // v2.40: FIX scope — 3 fungsi grup PINDAH dari dalam buildPanel ke level
    // pageCode. Sebelumnya dideklarasi di dalam buildPanel (tutup kurungnya di
    // baris ~2343) sehingga init()/clearLearned()/matchBaru() tidak bisa melihat
    // mereka → ReferenceError 'updateGroupBtn is not defined' → init() mati total
    // (tidak ada panel hidup, tidak ada garis, AKV2 undefined). Bug ini masuk
    // antara v2.31→v2.35 saat init() mulai memanggil updateGroupBtn().
    // v2.9: Update tampilan tombol grup (highlight yang aktif).
    // Klasifikasi ala Arab: 1=SOLID (polos 1-7), 2=STRIPE (garis 9-15), null=ANY (buka).
    function updateGroupBtn() {
      try {
        var bp = $('akv2Polos'), bg = $('akv2Garis'), bb = $('akv2Buka');
        if (bp) bp.style.background = (S.group === 'solid') ? '#7FD4FF' : '#fff';
        if (bg) bg.style.background = (S.group === 'stripe') ? '#7FD4FF' : '#fff';
        if (bb) bb.style.background = (!S.group) ? '#7FD4FF' : '#fff';
      } catch (e) {}
    }
    // v2.9: AUTO-DETEKSI GRUP dari bola pertama yang masuk.
    // Aturan 8-ball: bola pertama yang masuk setelah break menentukan grup.
    // 1-7 = SOLID (polos), 9-15 = STRIPE (garis). Dipanggil setelah tembakan kita.
    // v2.10: Bola masuk PAS BREAK tidak menentukan grup (meja tetap terbuka).
    function autoDetectGroup(pottedNums, wasBreak) {
      if (S.group) return; // sudah ada grup, jangan ubah
      if (wasBreak) {
        log('🎱 BREAK: bola masuk diabaikan untuk grup (meja masih terbuka).');
        return;
      }
      if (!pottedNums || !pottedNums.length) return;
      for (var i = 0; i < pottedNums.length; i++) {
        var n = pottedNums[i];
        if (n >= 1 && n <= 7) {
          S.group = 'solid'; updateGroupBtn();
          log('🎱 GRUP OTOMATIS: POLOS 1-7 (bola ' + n + ' masuk pertama setelah break)');
          return;
        } else if (n >= 9 && n <= 15) {
          S.group = 'stripe'; updateGroupBtn();
          log('🎱 GRUP OTOMATIS: GARIS 9-15 (bola ' + n + ' masuk pertama setelah break)');
          return;
        }
      }
      // Hanya bola 8 atau cue yang masuk -> grup tetap ANY.
    }
    // v2.10: Deteksi grup dari tembakan LAWAN. Kalau lawan masukin polos (1-7),
    // berarti kita GARIS (9-15), dan sebaliknya.
    function autoDetectGroupFromOpp(preBalls, postBalls) {
      if (S.group) return;
      if (!preBalls || !postBalls) return;
      var postNums = {};
      postBalls.forEach(function (b) { postNums[b.num] = 1; });
      for (var i = 0; i < preBalls.length; i++) {
        var n = preBalls[i].num;
        if (postNums[n]) continue; // masih ada
        if (n >= 1 && n <= 7) {
          S.group = 'stripe'; updateGroupBtn();
          log('🎱 GRUP OTOMATIS: GARIS 9-15 (lawan masukin polos ' + n + ')');
          return;
        } else if (n >= 9 && n <= 15) {
          S.group = 'solid'; updateGroupBtn();
          log('🎱 GRUP OTOMATIS: POLOS 1-7 (lawan masukin garis ' + n + ')');
          return;
        }
      }
    }

    function init() {
      // APK/Gecko 2026-11-07: panel HANYA di frame yang punya Module SENDIRI.
      // Content script jalan di SEMUA frame (all_frames) — dulu buildPanel()
      // langsung jalan di frame atas 8ballpool.com juga. Frame atas itu:
      // (1) tidak punya window.Module sendiri (game + heap ada di iframe prod),
      // (2) beda origin dengan prod (8ballpool.com vs prod-web-pool.miniclip.com)
      //     sehingga findModuleWin() lintas frame selalu gagal (SecurityError),
      // (3) panel + overlay canvas-nya menempel di dokumen frame atas dan
      //     MENUTUPI panel hidup di frame prod (elemen fixed dokumen atas
      //     selalu di atas konten iframe) — user lihat panel MATI: tombol
      //     tidak jalan, tidak ada garis. v2.36 dulu membangun panel di semua
      //     frame dan v2.37 menghapus timer auto-sembunyi, jadi panel mati itu
      //     tampil terus. Solusi: JANGAN bangun panel sebelum window.Module +
      //     HEAPU8 ketemu di frame SENDIRI. Instance tanpa Module diam total
      //     (cuma console.log) sampai 120 detik, lalu berhenti. findModuleWin()
      //     / heapViews() TIDAK diubah — tetap dipakai untuk BACA heap
      //     (frame sendiri dulu, fallback lintas frame untuk alur Tampermonkey).
      // CATATAN: perubahan ini HANYA di salinan APK (solver-extension/),
      // master userscript v2.39 di goals/ masih pakai init() lama — kalau
      // re-sync dari master, gating ini harus dibawa lagi.
      var IS_IFRAME = false;
      try { IS_IFRAME = (window.self !== window.top); } catch (e) {}
      function ownModule() {
        try { if (window.Module && window.Module.HEAPU8) return window.Module; } catch (e) {}
        return null;
      }
      // v2.38: FIX crash pas buka — interval JANGAN langsung jalan. Tunggu Module
      // ketemu dulu, baru start. Dulu interval scan heap tiap 3 detik langsung jalan
      // pas game masih loading → heap belum stabil → browser crash (apalagi di HP).
      // v2.58: TIDAK ADA setInterval(autoTick/deteksiTick/telFlush/fastTimer).
      // Satu loop requestAnimationFrame (startRafLoop) + fallback timer
      // 250ms — hanya bertindak saat state berubah (bola bergerak/
      // berhenti, giliran berubah, stabil).
      window.akv2StartIntervals = startRafLoop;
      var _panelBuilt = false;
      var tries = 0;
      (function wait() {
        tries++;
        // Langkah 1: tunggu Module di frame SENDIRI. Belum ada → diam, jangan
        // bangun panel (panel di frame tanpa Module pasti mati).
        if (!ownModule()) {
          if (tries < 120) { setTimeout(wait, 1000); return; }
          try { console.log('[AKV2] INIT url=' + location.href.slice(0, 80) + ' iframe=' + IS_IFRAME + ' — TIDAK ada Module di frame sendiri setelah 120 detik, instance diam (panel tidak dibangun)'); } catch (e) {}
          return;
        }
        // Langkah 2: Module sendiri ketemu → baru bangun panel (sekali saja),
        // lalu lanjut seperti dulu: tunggu heap siap → start interval.
        if (!_panelBuilt) {
          _panelBuilt = true;
          buildPanel();
          loadPokLearn(); // v2.4
          loadCushLearn(); // v2.8
          updateGroupBtn(); // v2.9: tampilkan status grup awal
          updateGetterStat();
          try { log('INIT url=' + location.href.slice(0, 80) + ' iframe=' + IS_IFRAME + ' prod=' + IS_PROD + ' — Module frame sendiri ketemu, panel dibangun'); } catch (e) {}
        }
        var h = heapViews();
        if (h) { stat('Module ketemu, heap ' + h.bytes + ' byte. Tekan BACA BOLA saat bola diam.'); log('Module OK heap=' + h.bytes); try { startRafLoop(); } catch (eSI) {} }
        else if (tries < 120) { stat('Menunggu Module... (' + tries + ')'); setTimeout(wait, 1000); }
        else stat('Module belum ketemu setelah 120 detik. URL: ' + location.hostname);
      })();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.AKV2 = { state: S, scan: doScan, heap: heapViews, getter: readGetterBalls, plan: getPlan, gate: readCommitState, commit: commitShot, debugGetter: debugGetter, debugGate: debugCommitGate, live: AKV2_LIVE };
  }
  function inject() {
    try {
      var s = document.createElement('script');
      s.textContent = '(' + pageCode.toString() + ')();';
      (document.documentElement || document.head || document.body).appendChild(s);
      s.remove();
      return true;
    } catch (e) { return false; }
  }
  if (!inject()) {
    // v2.58: retry inject pakai setTimeout berantai (bukan setInterval 250ms).
    var t = 0;
    (function retryInject() { if (inject() || ++t > 40) return; setTimeout(retryInject, 250); })();
  }
})();
