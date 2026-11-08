// ==UserScript==
// @name         8BP AKWeb Solver Gabungan v2.13 (Heap Only)
// @namespace    nbp
// @version      gabungan-v2.40
// @description  v2.39: FIX lag — scan heap cuma sekali, baca dari cache — cari pocket dari POLA (6 pasang simetris), tidak butuh tau nilainya dulu. Untuk game yang pocket-nya "pindah".
// @match        https://prod-web-pool.miniclip.com/*
// @match        https://*.pool.miniclippt.com/*
// @match        https://*.miniclip.com/*
// @match        https://*.miniclippt.com/*
// @match        https://8ballpool.com/*
// @match        https://www.8ballpool.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
var AKV2_VERSION = '2.40';
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
    var POCKET_DEFAULTS = [{ x: -144.5, y: -74.0 }, { x: -2.0, y: -72.65 }, { x: 140.5, y: -71.3 },
                           { x: -136.1, y: 70.3 }, { x: -3.35, y: 70.75 }, { x: 129.4, y: 71.2 }];
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
    function applyTableProfile(name) {
      var pr = tableProfiles[name];
      var i;
      if (pr && pr.pockets && pr.pockets.length === 6) {
        for (i = 0; i < 6; i++) { FIXED_POCKETS[i].x = pr.pockets[i].x; FIXED_POCKETS[i].y = pr.pockets[i].y; }
      } else {
        for (i = 0; i < 6; i++) { FIXED_POCKETS[i].x = POCKET_DEFAULTS[i].x; FIXED_POCKETS[i].y = POCKET_DEFAULTS[i].y; }
      }
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
      if (typeof S !== 'undefined' && S.learned) S.learned.pocketWidth = FIXED_POCKET_WIDTH;
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
      if (typeof S !== 'undefined' && S.learned) S.learned.pocketWidth = FIXED_POCKET_WIDTH;
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
      if (typeof S !== 'undefined' && S.learned) S.learned.pocketWidth = FIXED_POCKET_WIDTH;
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
        if (Math.hypot(b.x - qx, b.y - qy) < R * 2 - 2) return false;
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
    const POCKET_RADIUS = 8.0;
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
    const POCKET_POSITIONS = [
      { x: -130.8, y: -67.3 }, { x: 0, y: -72 }, { x: 130.8, y: -67.3 },
      { x: 130.8, y: 67.3 }, { x: 0, y: 72 }, { x: -130.8, y: 67.3 },
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
        let isAnyBallMovingOrSpinning, time, time2;
        do {
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
      function consider(tIdx, tgt, pk, dirx, diry, travelTgt, bankPt, kick, combo, firstHit) {
        var ghx = tgt.x - dirx * R * 2, ghy = tgt.y - diry * R * 2;
        var adx = ghx - cue.x, ady = ghy - cue.y, al = Math.hypot(adx, ady);
        if (al < 1) return;
        adx /= al; ady /= al;
        var dot = adx * dirx + ady * diry;
        if (dot < Math.cos(78 * Math.PI / 180)) return;
        var cut = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
        if (!pathClear(balls, cue.x, cue.y, ghx, ghy, [tIdx], R)) return;
        for (var gi = 0; gi < balls.length; gi++) {
          if (gi === tIdx || gi === cueIdx) continue;
          if (Math.hypot(balls[gi].x - ghx, balls[gi].y - ghy) < R * 2 - 2) return;
        }
        var power = difficultyPower(al, travelTgt, cut, scale, bankPt);
        // Prediksi bola putih pasca-tumbukan + cek scratch (WAJIB: jangan masukkan putih).
        var tdef = cueBallDeflect(adx, ady, dirx, diry);
        var tdir = tdef.dir;
        var croll = cueRollLen(power, tdef.frac, pocketWidth);
        var scratch = scratchRisk(cue, [ghx, ghy], tdir, croll, pockets, R);
        var score = cut * 2 + travelTgt * scale * 0.12 + al * scale * 0.05 + (bankPt ? 26 : 0) + (kick ? 30 : 0) + (combo ? 34 : 0) + (scratch ? 1000 : 0);
        cands.push({ angle: Math.atan2(ady, adx), targetIdx: tIdx, pocket: pk, cut: cut, power: power, score: score, R: R, bank: !!bankPt, kick: !!kick, combo: !!combo, firstHit: firstHit, ghost: [ghx, ghy], cueDir: tdir, cueRoll: croll, scratch: scratch });
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
              var bpt = bouncePoint([tgt.x, tgt.y], pk, cushions[ci], R, rect);
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
        }
      }
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
      var mx = S.cueMaxPower || 666;
      var frac = 1 - Math.pow(1 - Math.max(0, Math.min(1, sp / mx)), 2);
      frac = Math.max(0, Math.min(1, frac));
      return 24 + frac * 61;
    }
    function physicsShotPower(cue, ghost, pocket) {
      // v^2 = 2*a*d (a = velocityReductionSliding = 196)
      var d1 = Math.hypot(cue.x - ghost[0], cue.y - ghost[1]);
      var d2 = Math.hypot(ghost[0] - pocket.x, ghost[1] - pocket.y);
      var p = Math.sqrt(2 * 196 * (d1 + d2));
      var mx = S.cueMaxPower || 666;
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
    function isRobustShot(balls, angle, power, spin, targetNum, group, sim) {
      // Test 4 variasi: (±1.5° angle, ±8% power). Semua harus lolos validasi.
      var variations = [
        { da: 0.026, dp: 1.08 },   // +1.5°, +8% power
        { da: -0.026, dp: 0.92 },  // -1.5°, -8% power
        { da: 0.026, dp: 0.92 },   // +1.5°, -8% power
        { da: -0.026, dp: 1.08 },  // -1.5°, +8% power
      ];
      var cueIdx = -1;
      for (var i = 0; i < variations.length; i++) {
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
          if (badFirstHit(r.firstHitNumber, targetNum, group)) return false;
          // v2.34: skip aturan 8 prematur di mode rotation
          if (!(typeof S !== 'undefined' && (S.gameMode === '9' || S.gameMode === '15'))) {
            if (targetNum !== 8 && r.pocketedNumbers.indexOf(8) >= 0) return false;
          }
        } catch (e) { return false; }
      }
      return true;
    }
    function validateSimRes(res, targetNum, group) {
      // Kriteria ala Almarou3 ValidateShotSimulation: wajib lolos semua.
      if (!res) return false;
      if (res.cueScratched) return false;                           // putih masuk = tolak
      if (res.pocketedNumbers.indexOf(targetNum) < 0) return false; // target tidak masuk = tolak (obat "tetep di gas padahal ga masuk")
      if (badFirstHit(res.firstHitNumber, targetNum, group)) return false; // first-hit salah = tolak
      // v2.34: MODE ROTATION — bola 9/15 masuk = MENANG (bukan pelanggaran).
      // Aturan 8-ball (8 prematur = kalah) TIDAK berlaku di mode rotation.
      if (typeof S !== 'undefined' && (S.gameMode === '9' || S.gameMode === '15')) {
        // Di rotation, tidak ada larangan bola game masuk duluan — itu justru menang.
      } else {
        if (targetNum !== 8 && res.pocketedNumbers.indexOf(8) >= 0) return false; // 8 prematur = tolak
      }
      // v2.7: ANTI-TABRAKAN — target & cue tidak boleh menabrak bola lain.
      if (!checkClearPaths(res, targetNum)) return false;
      return true;
    }
    function checkClearPaths(res, targetNum) {
      // v2.7: Pastikan jalur BERSIH dari tabrakan yang tidak diinginkan.
      // - Bola target: lintasannya ke pocket tidak boleh menyentuh bola lain.
      // - Bola cue: sebelum menyentuh target, tidak boleh menyentuh bola lain.
      // Menggunakan positions[] dari simulasi (data asli, bukan tebakan).
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
          if (ob.number === targetNum || potted[ob.number]) continue;
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
      for (var k = 0; k < cue.positions.length; k++) {
        var cp = cue.positions[k];
        // Berhenti cek begitu cue sudah dekat target (sudah sampai).
        var tPos0 = target.positions[0];
        if (Math.hypot(cp.x - tPos0.x, cp.y - tPos0.y) < COLLIDE_DIST) break;
        for (var m = 0; m < res.balls.length; m++) {
          var ob2 = res.balls[m];
          if (ob2.number === 0 || ob2.number === targetNum || potted[ob2.number]) continue;
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
      return balls && balls.length >= 15;
    }
    function findBreakShot(balls, R) {
      var cue = null, cueIdx = -1;
      for (var i = 0; i < balls.length; i++) {
        if (balls[i].num === 0 || balls[i].cue) { cue = balls[i]; cueIdx = i; break; }
      }
      if (!cue) { try { log('💥 BREAK: bola putih tidak ketemu'); } catch (e) {} return null; }
      var sim = null;
      try { sim = new PoolSim(); } catch (e2) { return null; }
      var mx = S.cueMaxPower || 666;
      var spin = { x: 0, y: 0 }; // break tanpa spin (lurus maksimal)
      var best = null, bestScore = Infinity, checked = 0;
      try { log('💥 BREAK: scan 72 sudut di power MAX...'); } catch (e3) {}
      for (var deg = 0; deg < 360; deg += 5) {
        var angle = deg * Math.PI / 180;
        var simBalls = balls.map(function (b, bi) {
          var n = (bi === cueIdx) ? 0 : (b.num === null || b.num === undefined ? -1 : b.num);
          return { x: b.x, y: b.y, number: n, state: 1 };
        });
        var res = null;
        try { res = sim.simulate({ balls: simBalls, shotAngle: angle, shotPower: mx, shotSpin: spin }); }
        catch (e4) { continue; }
        checked++;
        if (res.cueScratched) continue; // scratch = tolak
        if (res.pocketedNumbers.indexOf(8) >= 0) continue; // 8 masuk = tolak
        var potted = res.pocketedNumbers.filter(function (n) { return n !== 0; }).length;
        if (potted === 0) continue; // tidak ada yang masuk = tolak
        // Skor ala Arab: -1000 per bola masuk (makin banyak makin bagus).
        var score = -potted * 1000;
        if (score < bestScore) {
          bestScore = score;
          // Ghost = titik 50 unit di arah tembakan (untuk aim di shootLast).
          var gx = cue.x + Math.cos(angle) * 50, gy = cue.y + Math.sin(angle) * 50;
          // power UI = 85 (MAX), simPower = mx (666). Break BUTUH keras!
          best = { angle: angle, power: 85, simPower: mx, res: res, potted: potted,
                   targetIdx: cueIdx, ghost: [gx, gy], pocket: { x: gx, y: gy },
                   simRes: res, validated: true, isBreak: true };
        }
      }
      if (best) {
        try { log('💥 BREAK: sudut terbaik ' + (best.angle * 180 / Math.PI).toFixed(1) + '° masukin ' + best.potted + ' bola (dari ' + checked + ' sudut dicek)'); } catch (e5) {}
      } else {
        try { log('💥 BREAK: tidak ada sudut bagus, tembak lurus ke rack'); } catch (e6) {}
      }
      return best;
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
    // v2.2: CUE AUTO-TUNE. Tidak perlu setting manual — bot belajar sendiri:
    // bandingkan posisi bola target sebelum vs sesudah tembakan.
    // - Masuk seperti prediksi -> naikkan pelan (cari titik pas).
    // - Tidak masuk TAPI bola bergerak >40% ke arah pocket -> KURANG TENAGA -> turunkan max ( = drag lebih jauh).
    // - Tidak masuk dan bola melenceng -> masalah aim, bukan tenaga -> jangan ubah.
    function tuneCuePower(preRes, postRes, shot) {
      if (!S.cueAuto || !shot || !shot.simPower || !preRes || !preRes.balls || !postRes || !postRes.balls) return;
      var preTgt = preRes.balls[shot.targetIdx];
      if (!preTgt) return;
      var postTgt = null;
      for (var i = 0; i < postRes.balls.length; i++) {
        if (postRes.balls[i].num === preTgt.num) { postTgt = postRes.balls[i]; break; }
      }
      if (!postTgt) {
        if (S.cueMaxPower < 800) { S.cueMaxPower = Math.min(800, S.cueMaxPower + 5); saveCue(); }
        return;
      }
      var pk = shot.pocket;
      if (!pk) return;
      var d0 = Math.hypot(preTgt.x - pk.x, preTgt.y - pk.y);
      var d1 = Math.hypot(postTgt.x - pk.x, postTgt.y - pk.y);
      var progress = d0 > 1 ? (d0 - d1) / d0 : 0;
      if (progress > 0.4 && S.cueMaxPower > 400) {
        S.cueMaxPower = Math.max(400, S.cueMaxPower - 25);
        saveCue();
        log('CUE AUTO: max=' + S.cueMaxPower + ' (bola kurang sampai ke pocket, tambah tenaga)');
      }
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
      log('🎯 POCKET ASLI GAME dipakai: TL(-130.8,-67.3) TM(0,-72) TR(130.8,-67.3) BL(-130.8,67.3) BM(0,72) BR(130.8,67.3). Bantalan dihitung ulang otomatis.');
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
    function detectPocketsHeap() {
      var h = null;
      try { h = heapViews(); } catch (e) {}
      if (!h || !h.f64) { log('🎯 DETEKSI POCKET: heap tidak tersedia'); return null; }
      var f64 = h.f64, n = f64.length;
      // Pasangan pocket yang diharapkan (urutan bebas — diverifikasi sebagai SET).
      var expected = [[-130.8, -67.3], [0, -72], [130.8, -67.3], [130.8, 67.3], [0, 72], [-130.8, 67.3]];
      var EPS = 0.01;
      // Scan 240MB pertama (data game ada di awal, seperti scan bola).
      var limit = Math.min(n - 12, 30000000);
      var checked = 0, anchorHits = 0;
      for (var i = 0; i < limit; i++) {
        var v = f64[i];
        // Anchor: nilai ±130.8 sangat khas (hanya pocket sudut yang punya).
        if (Math.abs(Math.abs(v) - 130.8) > EPS) continue;
        anchorHits++;
        // Ambil 12 nilai sebagai 6 pasang (x,y).
        var pairs = [];
        for (var j = 0; j < 6; j++) pairs.push([f64[i + j * 2], f64[i + j * 2 + 1]]);
        // v2.7: log kandidat pertama biar tahu formatnya (diagnostik).
        if (anchorHits === 1) {
          log('🎯 DETEKSI: kandidat#1 di idx=' + i + ': ' + pairs.map(function (p) { return '(' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ')'; }).join(' '));
        }
        // Verifikasi: tiap pasang harus cocok dengan satu expected, semua berbeda.
        var used = {}, ok = true;
        for (var k = 0; k < 6; k++) {
          var found = -1;
          for (var e = 0; e < 6; e++) {
            if (used[e]) continue;
            if (Math.abs(pairs[k][0] - expected[e][0]) < EPS && Math.abs(pairs[k][1] - expected[e][1]) < EPS) { found = e; break; }
          }
          if (found < 0) { ok = false; break; }
          used[found] = 1;
        }
        if (ok) {
          checked++;
          log('🎯 DETEKSI POCKET HEAP: KETEMU di f64 idx=' + i + ' (byte ' + (i * 8) + '), cek ' + checked + ' kandidat.');
          return { idx: i, pairs: pairs };
        }
        checked++;
        if (checked > 200) {
          log('🎯 DETEKSI: ' + anchorHits + ' anchor ±130.8 ketemu tapi tidak ada yang cocok pola 6 pocket. Game mungkin update format.');
          return null;
        }
      }
      log('🎯 DETEKSI POCKET: tidak ada nilai ±130.8 di 240MB pertama (anchorHits=0). Coba: (1) pastikan game sudah loading, (2) tekan lagi setelah masuk meja.');
      return null;
    }
    // ===== v2.13: DETEKSI POCKET GEOMETRI (tidak butuh tau nilai) =====
    // Kalau pocket game "pindah" (nilai berubah dari ±130.8), detektor nilai gagal.
    // Detektor ini cari POLA: 12 f64 berurutan = 6 pasang (x,y) yang membentuk
    // 4 sudut + 2 tengah, simetris terhadap kedua sumbu. Murni geometri, tanpa asumsi nilai.
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
    function applyHeapPockets() {
      var res = detectPocketsHeap();
      // v2.13: kalau detektor nilai gagal (pocket "pindah"), coba detektor geometri.
      if (!res) {
        try { log('🎯 Detektor nilai gagal, coba DETEKSI GEOMETRI...'); } catch (e) {}
        res = detectPocketsGeometric();
      }
      if (!res) return;
      // Mapping: urutan heap bebas -> kita pakai nama TL,TM,TR,BL,BM,BR berdasarkan posisi.
      // Klasifikasi: |x|<20 & y<0 = TM; |x|<20 & y>0 = BM; x<0 & y<0 = TL; x>0 & y<0 = TR; x<0 & y>0 = BL; x>0 & y>0 = BR.
      var slot = [null, null, null, null, null, null]; // TL,TM,TR,BL,BM,BR
      res.pairs.forEach(function (p) {
        var x = p[0], y = p[1], idx = -1;
        if (Math.abs(x) < 20) idx = (y < 0 ? 1 : 4);
        else if (x < 0) idx = (y < 0 ? 0 : 3);
        else idx = (y < 0 ? 2 : 5);
        slot[idx] = { x: x, y: y };
      });
      for (var i = 0; i < 6; i++) {
        if (!slot[i]) { log('🎯 DETEKSI POCKET: klasifikasi gagal di slot ' + i); return; }
        FIXED_POCKETS[i].x = slot[i].x;
        FIXED_POCKETS[i].y = slot[i].y;
      }
      CUSHION = null;
      tableProfiles[tableCurrent] = {
        pockets: FIXED_POCKETS.map(function (p) { return { x: p.x, y: p.y }; }),
        cushion: null,
        asset: (typeof sniffTableAsset === 'function' ? sniffTableAsset() : null)
      };
      saveTableProfiles(); recalcPocketWidth();
      var names = ['TL', 'TM', 'TR', 'BL', 'BM', 'BR'];
      log('🎯 POCKET DARI HEAP dipakai (bacaan ASLI game, bukan kalibrasi):');
      for (var k = 0; k < 6; k++) log('  ' + names[k] + '=(' + FIXED_POCKETS[k].x.toFixed(1) + ',' + FIXED_POCKETS[k].y.toFixed(1) + ')');
      try { if (S.lastScan && S.lastScan.res) drawShot(S.lastScan.shot || null, S.lastScan.res); } catch (e) {}
    }
    // ===== v2.6: DETEKSI BANTALAN DARI HEAP (tableCollisionBounds + pocketRadius) =====
    // Mod Arab baca table.mTableCollisionBounds() (Vec4d: x,y,w,h) LIVE dari memory.
    // Versi WASM: scan heap cari 4 f64 berurutan [x, y, 254, 127].
    // pocketRadius (f64 ~8.0) ada tepat setelah array 12 f64 pocket.
    function detectTableBoundsHeap() {
      var h = null;
      try { h = heapViews(); } catch (e) {}
      if (!h || !h.f64) { log('🛡️ DETEKSI BANTALAN: heap tidak tersedia'); return null; }
      var f64 = h.f64, n = f64.length, EPS = 0.01;
      var limit = Math.min(n - 4, 30000000);
      var checked = 0;
      for (var i = 0; i < limit; i++) {
        // Anchor: w≈254 diikuti h≈127.
        if (Math.abs(f64[i + 2] - 254) > EPS || Math.abs(f64[i + 3] - 127) > EPS) continue;
        var x = f64[i], y = f64[i + 1];
        // x,y harus masuk akal (origin meja, sekitar -140..10).
        if (!isFinite(x) || !isFinite(y) || x < -140 || x > 10 || y < -80 || y > 10) continue;
        checked++;
        log('🛡️ DETEKSI BANTALAN: KETEMU bounds di f64 idx=' + i + ' -> x=' + x.toFixed(1) + ' y=' + y.toFixed(1) + ' w=254 h=127');
        return { idx: i, x: x, y: y, w: 254, h: 127 };
      }
      log('🛡️ DETEKSI BANTALAN: tidak ketemu pola [x,y,254,127].');
      return null;
    }
    function detectPocketRadiusHeap(pocketIdx) {
      // pocketRadius = 1 f64 tepat setelah 12 f64 array pocket.
      if (pocketIdx == null) return null;
      var h = null;
      try { h = heapViews(); } catch (e) {}
      if (!h || !h.f64) return null;
      var r = h.f64[pocketIdx + 12];
      if (isFinite(r) && r > 0 && r < 50) {
        log('🛡️ POCKET RADIUS dari heap: ' + r.toFixed(2));
        return r;
      }
      return null;
    }
    // ===== v2.23: DETEKSI GARIS BANTALAN dari heap =====
    // Pola: polygon 46-titik, segmen lurus pertama (-117,63.5)->(-7.8,63.5).
    // Lebih presisi dari rect: tahu persis mana bantalan vs lubang pocket.
    function detectCushionLinesHeap() {
      try {
        var M = window.Module;
        if (!M || !M.HEAPU8) { log('CUSHION LINES: heap tidak ada'); return null; }
        var f64 = new Float64Array(M.HEAPU8.buffer);
        var n = f64.length, EPS = 0.5;
        var limit = Math.min(n - 8, 30000000);
        for (var i = 0; i < limit; i++) {
          // Anchor: (-117, 63.5) -> (-7.8, 63.5) = segmen bantalan atas-kiri
          if (Math.abs(f64[i] + 117) < EPS && Math.abs(f64[i+1] - 63.5) < EPS &&
              Math.abs(f64[i+2] + 7.8) < EPS && Math.abs(f64[i+3] - 63.5) < EPS) {
            // Verifikasi: segmen kedua harus (7.8,63.5)->(117,63.5) dalam 40 langkah
            var ok = false;
            for (var j = i; j < i + 80 && j < n - 4; j += 2) {
              if (Math.abs(f64[j] - 7.8) < EPS && Math.abs(f64[j+1] - 63.5) < EPS &&
                  Math.abs(f64[j+2] - 117) < EPS && Math.abs(f64[j+3] - 63.5) < EPS) { ok = true; break; }
            }
            if (!ok) continue;
            // Baca 6 segmen lurus utama (bantalan)
            var lines = [];
            // Format di heap: [x1,y1,x2,y2] per segmen, tapi ada kurva pocket di antaranya
            // Kita ambil segmen lurus yang panjang > 50
            for (var k = i; k < i + 200 && k < n - 4; k += 2) {
              var x1 = f64[k], y1 = f64[k+1], x2 = f64[k+2], y2 = f64[k+3];
              if (!isFinite(x1) || Math.abs(x1) > 200) break;
              var len = Math.hypot(x2-x1, y2-y1);
              // Segmen lurus panjang = bantalan
              if (len > 50 && len < 150) {
                var isH = Math.abs(y1-y2) < 1, isV = Math.abs(x1-x2) < 1;
                if (isH || isV) lines.push({ x1: x1, y1: y1, x2: x2, y2: y2 });
              }
              if (lines.length >= 6) break;
            }
            if (lines.length >= 4) {
              log('🛡️ CUSHION LINES KETEMU: ' + lines.length + ' segmen @' + i);
              return lines;
            }
          }
        }
        log('🛡️ CUSHION LINES: tidak ketemu (pakai rect biasa)');
        return null;
      } catch (e) { log('CUSHION LINES error: ' + e.message); return null; }
    }
    function applyHeapCushionLines() {
      var lines = detectCushionLinesHeap();
      if (lines && lines.length >= 4) {
        S.cushLines = lines;
        // Update CUSHION rect dari garis (untuk kompatibilitas)
        // Bantalan atas/bawah: y=±63.5, kiri/kanan: x=±127
        log('🛡️ CUSHION LINES AKTIF: ' + lines.length + ' segmen presisi');
        try {
          var btn = $('akv2CushLines');
          if (btn) btn.textContent = '🛡️ GARIS BANTALAN: ' + lines.length + ' SEGMEN ✓';
        } catch (e) {}
        return true;
      }
      return false;
    }
    function applyHeapTable() {
      var b = detectTableBoundsHeap();
      if (!b) return;
      // Konversi bounds -> rect bantalan {xmin,xmax,ymin,ymax}.
      CUSHION = { xmin: b.x, xmax: b.x + b.w, ymin: b.y, ymax: b.y + b.h };
      tableProfiles[tableCurrent] = {
        pockets: FIXED_POCKETS.map(function (p) { return { x: p.x, y: p.y }; }),
        cushion: { xmin: CUSHION.xmin, xmax: CUSHION.xmax, ymin: CUSHION.ymin, ymax: CUSHION.ymax },
        asset: (typeof sniffTableAsset === 'function' ? sniffTableAsset() : null)
      };
      saveTableProfiles(); recalcPocketWidth();
      log('🛡️ BANTALAN DARI HEAP dipakai (bacaan ASLI game): xmin=' + CUSHION.xmin.toFixed(1) + ' xmax=' + CUSHION.xmax.toFixed(1) + ' ymin=' + CUSHION.ymin.toFixed(1) + ' ymax=' + CUSHION.ymax.toFixed(1));
      try { if (S.lastScan && S.lastScan.res) drawShot(S.lastScan.shot || null, S.lastScan.res); } catch (e) {}
    }
    // Ambil 3 kandidat geometri terbaik, tiap kandidat dicoba POWER SWEEP
    // (power fisika dulu, lalu 150..max step 50), ambil power PERTAMA yang
    // lolos validasi sim. Kandidat yang tidak lolos di semua power = DITOLAK.
    // Kalau tidak ada kandidat lolos = return null = JANGAN TEMBAK.
    function solveShotV2(balls, pockets, R, group, allowBank, pocketWidth) {
      var cands = null;
      try { cands = solveShot(balls, pockets, R, group, allowBank, pocketWidth, true); } catch (e) { cands = null; }
      if (!cands || !cands.length) return null;
      var cueIdx = -1, _i;
      var cue = balls[cueIdx];
      var sim = null;
      try { sim = new PoolSim(); } catch (e2) { return cands[0]; }
      // Spin efektif ala Almarou3: spin settingan x stat spin cue.
      var spin = { x: (S.spinX || 0) * (S.cueSpinMult || 1), y: (S.spinY || 0) * (S.cueSpinMult || 1) };
      var mx = S.cueMaxPower || 666;
      var top = cands.slice(0, 3), best = null, bestScore = Infinity, simRusak = false;
      for (_i = 0; _i < top.length; _i++) {
        var c = top[_i];
        var targetNum = balls[c.targetIdx].num;
        // POWER SWEEP v2.11: LEMBUT DULU (150 -> max step 50). Ambil power
        // PALING LEMBUT yang lolos validasi sim. Pukulan lembut = lebih akurat,
        // bola putih tidak liar, tidak memantul bantalan keras-keras.
        // (Dulu: power fisika dulu yang sering terlalu keras.)
        var powers = [];
        for (var pp = 150; pp <= mx; pp += 50) powers.push(pp);
        powers.push(mx);
        var seen = {}, uniqP = [];
        for (var qi = 0; qi < powers.length; qi++) { var rp = Math.round(powers[qi]); if (!seen[rp]) { seen[rp] = 1; uniqP.push(rp); } }
        var won = null;
        for (var pi2 = 0; pi2 < uniqP.length; pi2++) {
          var spw = uniqP[pi2], res = null;
          try {
            var simBalls = balls.map(function (b, bi) {
              var n = (bi === cueIdx) ? 0 : (b.num === null || b.num === undefined ? -1 : b.num);
              return { x: b.x, y: b.y, number: n, state: 1 };
            });
            res = sim.simulate({ balls: simBalls, shotAngle: c.angle, shotPower: spw, shotSpin: spin });
          } catch (e3) { simRusak = true; break; }
          if (validateSimRes(res, targetNum, group)) {
            // v2.31: ROBUSTNESS CHECK — tembakan harus tetap masuk walau ada
            // sedikit error (±1.5° sudut, ±8% power). Kalau cuma masuk di kondisi
            // ideal, TOLAK (ini obat "line prediksi masuk tapi eksekusi gagal").
            if (isRobustShot(balls, c.angle, spw, spin, targetNum, group, sim)) {
              won = { power: spw, res: res }; break;
            } else {
              try { log('🛡️ ROBUSTNESS: tembakan bola ' + targetNum + ' ditolak (tidak tahan error)'); } catch (e) {}
            }
          }
        }
        if (simRusak) break;
        if (won) {
          var s = c.score - 12000 - won.res.pocketedNumbers.length * 1000;
          // v2.11: penalti anti-bantalan — pilih jalur yang bersih.
          try {
            var tgtBall = balls[c.targetIdx];
            s += cushionPenalty(tgtBall, c.pocket);
          } catch (eCP) {}
          c.simScore = s; c.simRes = won.res;
          c.power = simPowerToUI(won.power); c.simPower = won.power;
          if (s < bestScore) { bestScore = s; best = c; }
        }
        // kandidat yang tidak lolos di semua power -> DITOLAK (tidak ditembak)
      }
      if (simRusak) { try { log('v2.2 SIM error, fallback geometri.'); } catch (e4) {} cands[0].validated = true; return cands[0]; }
      // v2.2: garis prediksi SELALU ada (ala Arab) — sim display terpisah dari
      // keputusan tembak. Kandidat terbaik geometri selalu dapat simRes untuk
      // digambar, walau tembakannya tidak divalidasi.
      var disp = cands[0];
      if (!disp.simRes) {
        try {
          var dbs = balls.map(function (b, bi) {
            var n = (bi === cueIdx) ? 0 : (b.num === null || b.num === undefined ? -1 : b.num);
            return { x: b.x, y: b.y, number: n, state: 1 };
          });
          var dsp = physicsShotPower(cue, disp.ghost, disp.pocket);
          disp.simRes = sim.simulate({ balls: dbs, shotAngle: disp.angle, shotPower: dsp, shotSpin: spin });
          disp.simPower = dsp;
          if (!disp.power) disp.power = simPowerToUI(dsp);
        } catch (e7) {}
      }
      disp.validated = !!best;
      if (best) { try { log('v2.2 SIM OK: target ' + balls[best.targetIdx].num + ' powerSim=' + Math.round(best.simPower) + ' -> UI ' + best.power.toFixed(0) + ' (spin ' + spin.x.toFixed(2) + ',' + spin.y.toFixed(2) + ')'); } catch (e5) {} best.validated = true; }
      else { try { log('v2.2 SIM: tidak ada tembakan VALID (3 kandidat x sweep power ditolak) — garis prediksi tetap ditampilkan, tidak ditembak.'); } catch (e6) {} }
      return best || disp; // validated=true -> boleh tembak; false -> cuma display
    }
    function pickShot(balls, pockets, R, group, allowBank, pocketWidth) {
      if (typeof S !== 'undefined' && S.useSim) {
        try { var v2 = solveShotV2(balls, pockets, R, group, allowBank, pocketWidth); if (v2) return v2; } catch (e) {}
      }
      var g = solveShot(balls, pockets, R, group, allowBank, pocketWidth);
      if (g) g.validated = true; // fallback geometri murni (sim mati) -> boleh tembak seperti dulu
      return g;
    }

    function readLearnedBalls(f64, i32, learned, numberDelta) {
      var balls = [], missing = [];
      for (var i = 0; i < learned.length; i++) {
        var e = learned[i], idx = e.idx;
        if (idx + 1 >= f64.length) { missing.push(e.num); continue; }
        var x = f64[idx], y = f64[idx + 1];
        if (!isFinite(x) || !isFinite(y) || x < -200 || x > 200 || y < -160 || y > 160) { missing.push(e.num); continue; }
        if (numberDelta !== null && numberDelta !== undefined) {
          var ii = 2 * idx + numberDelta;
          if (ii < 0 || ii >= i32.length || i32[ii] !== e.num) { missing.push(e.num); continue; }
        }
        balls.push({ x: x, y: y, idx: idx, score: 5, num: e.num, cue: (e.num === 0) });
      }
      return { balls: balls, missing: missing };
    }
    /*__PURE_END__*/
    var IS_PROD = (location.hostname === 'prod-web-pool.miniclip.com' || /\.pool\.miniclippt\.com$/.test(location.hostname));
    var S = { mode: 'off', group: null, gameMode: '8', allowBank: false, deteksiOtomatis: true, shooting: false, lastScan: null, lastShot: null, lastCanvas: null, learnOld: null, learned: null, autoBeruntun: false, autoStableCount: 0, autoLastBalls: null, autoWaiting: false, autoPreShotNums: null, calMode: false, calSel: 0, nudgeStep: 4, useSim: true, camMode: false, camSel: 0, camDetected: null,
      // v2.1: statistik cue (ala Almarou3: CUE_PROPERTIES_MAX_POWER & CUE_PROPERTIES_SPIN)
      cueMaxPower: 666, cueSpinMult: 1.0, spinX: 0, spinY: 0,
      // v2.2: CUE AUTO-TUNE — tidak perlu setting manual, belajar dari hasil tembakan
      cueAuto: true, tunePre: null, tuneShot: null,
      // v2.1: autoplay kontinu — tidak pernah auto-off
      oppWait: false, oppMoved: false, oppWaitStart: 0, oppLastBalls: null,
      waitChange: false, waitChangeBalls: null, waitChangeSince: 0, autoPhase: '',
      ticking: false, fastTimer: null, fastStable: 0, fastLastBalls: null,
      // v2.3: telemetri webhook.site — nyambung ke bang (satu arah: script -> bang)
      telOn: false, telUuid: 'ab999c26-e986-42b4-842d-584ba77dbaf5', // v2.17: hardcode, tanpa input
      // v2.4: POCKET LEARN — belajar posisi lubang dari bola yang beneran masuk
      pokLearn: null, trail: null,
      // v2.7: TUNGGU LAWAN bisa dimatikan (untuk latihan solo / lawan AFK)
      waitOpp: true,
      // v2.8: CUSHION LEARN — belajar posisi bantalan dari bola yang beneran memantul
      cushLearn: null,
      // v2.10: flag break — bola masuk pas break TIDAK menentukan grup
      breakDone: false,
      // v2.16: LINE BEKU — garis diam sampai bola berhenti, baru clear + gambar baru
      linesFrozen: false,
      // v2.16: AIM MANUAL — line prediksi ngikutin arah jari (tembak manual)
      manualAim: false, manualAimHandler: null,
      // v2.19: SEMUA GARIS ala AKWeb — garis warna-warni untuk semua bola sekaligus
      allLines: false };
    var telLogBuf = [];
    function $(id) { return document.getElementById(id); }
    function log(m) {
      var el = $('akv2Log');
      if (el) el.textContent = (new Date().toLocaleTimeString() + ' ' + m + '\n' + el.textContent).slice(0, 12000);
      try { console.log('[AKV2] ' + m); } catch (e) {}
      try { if (S.telOn && S.telUuid) { telLogBuf.push(m); if (telLogBuf.length > 40) telLogBuf.shift(); } } catch (e2) {}
    }
    // ===== v2.3: TELEMETRI webhook.site (script -> bang) =====
    // Cara pakai: buka webhook.site di browser, copy UUID-nya, masukkan lewat
    // tombol 🔑. Bang memantau dari jauh via API webhook.site.
    function telSend(obj) {
      if (!S.telOn || !S.telUuid) return;
      try {
        // mode no-cors + text/plain: tembus tanpa preflight CORS (cukup untuk kirim satu arah).
        fetch('https://webhook.site/' + encodeURIComponent(S.telUuid), {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(obj)
        }).catch(function () {});
      } catch (e) {}
    }
    function telFlushLogs() {
      if (!S.telOn || !S.telUuid || !telLogBuf.length) return;
      var batch = telLogBuf.splice(0, telLogBuf.length);
      telSend({ t: 'logs', v: AKV2_VERSION, lines: batch.slice(-12) });
    }
    function telStatus() {
      var nb = 0;
      try { nb = S.learned ? S.learned.count : 0; } catch (e) {}
      telSend({ t: 'status', v: AKV2_VERSION, autoplay: !!S.autoBeruntun, phase: S.autoPhase || '-', balls: nb, cue: S.cueMaxPower, cueAuto: !!S.cueAuto, group: S.group || '-' });
    }
    function telUpdateBtn() {
      var b = $('akv2Ntfy');
      if (b) b.textContent = '📡 TELEMETRI: ' + (S.telOn ? 'ON' : 'OFF') + (S.telUuid ? ' ✓' : ' (butuh URL)');
    }
    function stat(m) { var el = $('akv2Stat'); if (el) el.textContent = m; }
    function buildPanel() {
      if ($('akv2')) return;
      var p = document.createElement('div');
      p.id = 'akv2';
      p.style.cssText = 'position:fixed;top:68px;right:8px;z-index:2147483000;touch-action:manipulation;-webkit-tap-highlight-color:transparent;width:300px;max-height:92vh;overflow-y:auto;background:#FFF6E5;color:#111;font:bold 13px Arial,sans-serif;padding:10px;border:3px solid #111;border-radius:12px;box-shadow:4px 4px 0 #111;box-sizing:border-box';
      p.innerHTML =
        '<div id="akv2Head" style="text-align:center;font-family:Arial Black,Arial,sans-serif;font-size:15px">🎱 SOLVER HEAP SERIUS <span style="background:#FF0;padding:2px 6px;border-radius:6px;font-size:12px">v2.40</span><button id="akv2ResetPos" title="Reset posisi panel" style="min-width:36px;min-height:36px;font-size:16px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#4ECDC4;color:#fff;margin-right:4px">⌂</button><button id="akv2Close" style="float:right;min-width:36px;min-height:36px;font-size:18px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FF6B6B;color:#fff">✕</button><br><span style="font-size:11px;font-family:Arial,sans-serif">heap saja, tanpa deteksi canvas. Tutup dengan ✕, buka lagi dengan ikon 🎱.</span></div>' +
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
        '<button id="akv2Save" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">💾 SIMPAN POSISI (sebelum tembak manual)</button>' +
        '<button id="akv2AutoDetect" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#59D977;box-shadow:2px 2px 0 #111;margin-top:6px">🤖 AUTO DETEKSI (tanpa tembak manual)</button>' +

        '<button id="akv2TesGambar" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">TES GAMBAR (lingkaran bola + pocket)</button>' +
        '<button id="akv2CekPocket" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FFDC58;box-shadow:2px 2px 0 #111;margin-top:6px">\uD83C\uDFAF CEK POCKET OTOMATIS</button>' +
        '<button id="akv2PokAsli" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#59D977;box-shadow:2px 2px 0 #111;margin-top:6px">🎯 POCKET ASLI GAME (1 tap)</button>' +
        '<button id="akv2PokHeap" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#7FD4FF;box-shadow:2px 2px 0 #111;margin-top:6px">🎯 DETEKSI POCKET DARI HEAP</button>' +
        '<button id="akv2BanHeap" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FFB066;box-shadow:2px 2px 0 #111;margin-top:6px">🛡️ DETEKSI BANTALAN DARI HEAP</button>' +
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
        '<button id="akv2Learn" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🔍 BANDINGKAN (sesudah bola berhenti)</button>' +
        '<button id="akv2Shoot" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FF6B6B;color:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🎯 TEMBAK (1x, dari belajar terakhir)</button>' +
        '<button id="akv2Giliran" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#59D977;box-shadow:2px 2px 0 #111;margin-top:6px">AUTO GILIRAN (tanpa SCAN, baca instan)</button>' +
        '<button id="akv2Beruntun" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FFDC58;box-shadow:2px 2px 0 #111;margin-top:6px">AUTO BERUNTUN: OFF</button>' +
        '<button id="akv2Autoplay" style="width:100%;min-height:46px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#FF6B6B;color:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">▶ AUTOPLAY: OFF</button>' +
        '<button id="akv2WaitOpp" style="width:100%;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#FFE066;margin-top:4px">⏳ TUNGGU LAWAN: ON</button>' +
        '<button id="akv2Gambar" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">🖼 CEK GAMBAR BOLA (JSON/XML + URL)</button>' +
        '<div id="akv2LearnStat" style="font-size:11px;line-height:1.5;margin:8px 0 0;color:#333">BELAJAR: BELUM - SIMPAN lalu BANDINGKAN dulu (sekali per rack)</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
        '<button id="akv2Polos" style="flex:1;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff">POLOS 1-7</button>' +
        '<button id="akv2Garis" style="flex:1;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff">GARIS 9-15</button>' +
        '<button id="akv2Buka" style="flex:1;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff">BUKA</button></div>' +
        '<button id="akv2Bank" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#59D977;box-shadow:2px 2px 0 #111;margin-top:6px">PANTUL: OFF</button>' +
        '<div style="display:flex;gap:4px;margin-top:6px;align-items:center">' +
        '<span style="font-size:11px;font-weight:bold">⚡CUE:</span>' +
        '<span id="akv2CueVal" style="flex:1;text-align:center;font-family:Arial Black,Arial,sans-serif;font-size:14px">666 AUTO</span>' +
        '<button id="akv2CueMin" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">−</button>' +
        '<button id="akv2CuePlus" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">+</button>' +
        '<button id="akv2CueAuto" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#59D977">AUTO</button></div>' +
        '<div style="display:flex;gap:4px;margin-top:6px;align-items:center">' +
        '<span style="font-size:11px;font-weight:bold">SPIN:</span>' +
        '<button id="akv2SpinBtn" style="flex:1;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff">SPIN:0</button></div>' +
        '<button id="akv2Ntfy" style="width:100%;min-height:42px;font-weight:bold;border:3px solid #111;border-radius:10px;background:#fff;box-shadow:2px 2px 0 #111;margin-top:6px">📡 TELEMETRI: OFF</button>' +
        '<button id="akv2NtfyTopic" style="width:100%;min-height:36px;font-weight:bold;border:2px solid #111;border-radius:8px;background:#fff;margin-top:4px;font-size:11px">🔑 UUID WEBHOOK (webhook.site)</button>' +
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
      $('akv2Save').addEventListener('click', function () { saveLearn(); });
      var maBtn = $('akv2ManualAim');
      if (maBtn) maBtn.addEventListener('click', function () { setManualAim(!S.manualAim); });
      var alBtn = $('akv2AllLines');
      if (alBtn) alBtn.addEventListener('click', function () { setAllLines(!S.allLines); });
      $('akv2AutoDetect').addEventListener('click', function () { autoDetect(); });
      var mbBtn = $('akv2MatchBaru');
      if (mbBtn) mbBtn.addEventListener('click', function () { matchBaru(); });
      // v2.26: handlers untuk tombol minimal
      var lpBtn = $('akv2LinePreview');
      if (lpBtn) lpBtn.addEventListener('click', function () { setLinePreview(!S.linePreview); });
      var apBtn = $('akv2AutoplayBtn');
      if (apBtn) apBtn.addEventListener('click', function () {
        try {
          var on = !S.autoBeruntun;
          setBeruntun(on);
          apBtn.textContent = '▶️ AUTO PLAY: ' + (on ? 'ON' : 'OFF');
          apBtn.style.background = on ? '#FF6B6B' : '#59D977';
          log('Auto play ' + (on ? 'ON' : 'OFF'));
        } catch (e) { log('Autoplay error: ' + e.message); }
      });
      // Update tombol saat setBeruntun dipanggil dari tempat lain
      var _origSetBeruntun = setBeruntun;
      setBeruntun = function(on) {
        _origSetBeruntun(on);
        try {
          var b = $('akv2AutoplayBtn');
          if (b) { b.textContent = '▶️ AUTO PLAY: ' + (on ? 'ON' : 'OFF'); b.style.background = on ? '#FF6B6B' : '#59D977'; }
        } catch (e) {}
      };
      $('akv2TesGambar').addEventListener('click', function () { tesGambar(); });
      $('akv2CekPocket').addEventListener('click', function () { verifyPockets(); });
      $('akv2PokAsli').addEventListener('click', function () { applyTruePockets(); });
      $('akv2PokHeap').addEventListener('click', function () { applyHeapPockets(); });
      $('akv2BanHeap').addEventListener('click', function () { applyHeapTable(); });
      var clBtn = $('akv2CushLines');
      if (clBtn) clBtn.addEventListener('click', function () { applyHeapCushionLines(); });
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
      $('akv2Learn').addEventListener('click', function () { compareLearn(); });
      $('akv2Shoot').addEventListener('click', function () { shootLast(); });
      $('akv2Giliran').addEventListener('click', function () { autoGiliran(); });
      $('akv2Beruntun').addEventListener('click', function () { setBeruntun(!S.autoBeruntun); });
      $('akv2Autoplay').addEventListener('click', function () { setBeruntun(!S.autoBeruntun); });
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
        $('akv2Bank').textContent = 'PANTUL: ' + (S.allowBank ? 'ON' : 'OFF');
        log('PANTUL ' + (S.allowBank ? 'ON' : 'OFF'));
      });
      // v2.2: CUE AUTO-TUNE — default otomatis belajar sendiri dari hasil
      // tembakan, tidak perlu setting manual. -/+ = override manual (AUTO mati).
      var CUE_KEY = 'akv2cue', CUE_AUTO_KEY = 'akv2cueauto';
      try {
        var _cs = null, _ca = null;
        try { _cs = localStorage.getItem(CUE_KEY); _ca = localStorage.getItem(CUE_AUTO_KEY); } catch (e0) {}
        if (_cs) S.cueMaxPower = Math.max(400, Math.min(800, parseInt(_cs, 10) || 666));
        if (_ca === '0') S.cueAuto = false;
        saveCue();
      } catch (e0b) {}
      $('akv2CueMin').addEventListener('click', function () {
        S.cueMaxPower = Math.max(400, S.cueMaxPower - 20);
        S.cueAuto = false; saveCue();
        log('CUE manual = ' + S.cueMaxPower + ' (AUTO mati; tekan AUTO untuk belajar otomatis lagi)');
      });
      $('akv2CuePlus').addEventListener('click', function () {
        S.cueMaxPower = Math.min(800, S.cueMaxPower + 20);
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
        log('SPIN = ' + S.spinY + ' (efektif x stat spin cue ' + S.cueSpinMult + ')');
      });
      // v2.3: telemetri — UUID webhook.site dimasukkan sekali via tombol 🔑, tersimpan.
      try {
        var _nt = null;
        try { _nt = localStorage.getItem('akv2tel'); } catch (e0c) {}
        if (_nt) S.telUuid = _nt;
        // v2.17: fallback ke hardcode kalau localStorage kosong (beda konteks iframe)
        if (!S.telUuid) S.telUuid = 'ab999c26-e986-42b4-842d-584ba77dbaf5';
      } catch (e0d) {}
      $('akv2Ntfy').addEventListener('click', function () {
        if (!S.telOn) {
          if (!S.telUuid) {
            log('TELEMETRI butuh URL webhook.site dulu — tekan tombol 🔑, buka webhook.site di browser, copy UUID-nya.');
            telUpdateBtn();
            return;
          }
          S.telOn = true;
          telSend({ t: 'hello', v: AKV2_VERSION });
          telStatus();
          log('TELEMETRI ON — log dikirim tiap 10 detik. Bang bisa memantau dari jauh.');
        } else {
          S.telOn = false;
          log('TELEMETRI OFF.');
        }
        telUpdateBtn();
      });
      $('akv2NtfyTopic').addEventListener('click', function () {
        var t = null;
        try { t = prompt('UUID webhook.site (buka webhook.site, copy UUID di halamannya):', S.telUuid || ''); } catch (e) {}
        if (t && t.trim()) {
          var m = t.trim().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          S.telUuid = m ? m[0] : t.trim().replace(/\s+/g, '');
          try { localStorage.setItem('akv2tel', S.telUuid); } catch (e2) {}
          log('UUID telemetri: ' + S.telUuid);
        }
        telUpdateBtn();
      });
      telUpdateBtn();
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
      // Hanya tampilkan: LINE PREVIEW, AUTO PLAY, MATCH BARU, + close
      // Sisanya disembunyikan total (tidak ada toggle lanjutan)
      var keep = {akv2LinePreview:1, akv2AutoplayBtn:1, akv2MatchBaru:1, akv2Polos:1, akv2Garis:1, akv2Mode8:1, akv2Mode9:1, akv2Close:1, akv2ResetPos:1};
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
        ['akv2LinePreview','akv2AutoplayBtn','akv2MatchBaru','akv2Polos','akv2Garis','akv2Mode8','akv2Mode9'].forEach(function(id) {
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
      // Sembunyikan log juga biar ringkas (bisa dibuka via console)
      var lg = $('akv2Log'); if (lg) lg.style.display = 'none';
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
      // 1. Frame sendiri dulu (paling umum, murah)
      try { if (window.Module && window.Module.HEAPU8) return window; } catch (e) {}
      // 2. Cache (kalau udah ketemu, pakai lagi)
      try { if (_cachedModuleWin && _cachedModuleWin.Module && _cachedModuleWin.Module.HEAPU8) return _cachedModuleWin; } catch (e) {}
      // 3. Throttle scan iframe (v2.38)
      var nowMs = Date.now();
      if (nowMs - _lastFrameScan < 5000) return _cachedModuleWin;
      _lastFrameScan = nowMs;
      // 3. Cari di semua iframe (rekursif 2 level)
      try {
        var frames = document.querySelectorAll('iframe');
        for (var i = 0; i < frames.length; i++) {
          try {
            var w = frames[i].contentWindow;
            if (w && w.Module && w.Module.HEAPU8) { _cachedModuleWin = w; return w; }
            // Level 2: iframe dalam iframe
            if (w) {
              var sub = w.document ? w.document.querySelectorAll('iframe') : [];
              for (var j = 0; j < sub.length; j++) {
                try {
                  var w2 = sub[j].contentWindow;
                  if (w2 && w2.Module && w2.Module.HEAPU8) { _cachedModuleWin = w2; return w2; }
                } catch (e2) {}
              }
            }
          } catch (e3) {}
        }
      } catch (e4) {}
      // 4. Coba window.top (kalau script di iframe, game di top)
      try { if (window.top && window.top !== window && window.top.Module && window.top.Module.HEAPU8) return window.top; } catch (e5) {}
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
        return { f64: new Float64Array(buf), i32: new Int32Array(buf), bytes: buf.byteLength, module: M };
      } catch (e) { return null; }
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
          ctx.strokeStyle = '#FF0'; ctx.lineWidth = 3; ctx.setLineDash([8, 4]);
          ctx.beginPath(); ctx.moveTo(s1[0] - r.left, s1[1] - r.top); ctx.lineTo(s2[0] - r.left, s2[1] - r.top); ctx.stroke();
          ctx.setLineDash([]);
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
          simPower: 150 + (powerUI/100) * 516, // 150-666
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
        var NAT = [{ x: -130.8, y: -67.3 }, { x: 0, y: -72 }, { x: 130.8, y: -67.3 },
                   { x: 130.8, y: 67.3 }, { x: 0, y: 72 }, { x: -130.8, y: 67.3 }];
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
    var CAM_NAT = [{ x: -130.8, y: -67.3 }, { x: 0, y: -72 }, { x: 130.8, y: -67.3 },
                   { x: 130.8, y: 67.3 }, { x: 0, y: 72 }, { x: -130.8, y: 67.3 }];
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
        ctx.strokeStyle = '#00e676'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
        [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5]].forEach(function (e) {
          ctx.beginPath(); ctx.moveTo(ps[e[0]][0], ps[e[0]][1]); ctx.lineTo(ps[e[1]][0], ps[e[1]][1]); ctx.stroke();
        });
        ctx.setLineDash([]);
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
      if (shot && shot.simRes && shot.simRes.balls) {
        for (var _si = 0; _si < shot.simRes.balls.length; _si++) {
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
          })(shot.simRes.balls[_si]);
        }
      }
      if (cue && shot && tgt) {
        var cs = P(cue.x, cue.y), gs = P(shot.ghost[0], shot.ghost[1]), ts = P(tgt.x, tgt.y), ps = P(shot.pocket.x, shot.pocket.y);
        // v2.7: garis bidik ala Arab — putih tebal + kuning ke pocket.
        ctx.beginPath(); ctx.moveTo(cs[0], cs[1]); ctx.lineTo(gs[0], gs[1]);
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 10; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cs[0], cs[1]); ctx.lineTo(gs[0], gs[1]);
        ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 4; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ts[0], ts[1]); ctx.lineTo(ps[0], ps[1]);
        ctx.strokeStyle = 'rgba(255,225,60,.35)'; ctx.lineWidth = 10; ctx.setLineDash([10, 8]); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(ts[0], ts[1]); ctx.lineTo(ps[0], ps[1]);
        ctx.strokeStyle = 'rgba(255,225,60,.95)'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(gs[0], gs[1], 12, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(ts[0], ts[1], 14, 0, 7); ctx.strokeStyle = '#ff3df2'; ctx.lineWidth = 3; ctx.stroke();
        // Prediksi bola putih pasca-tumbukan ala cheat umum: garis defleksi dari
        // titik ghost + lingkaran titik berhenti. Biru = aman, merah = risiko scratch
        // (kandidat seperti ini otomatis kalah skor saat pilih jalan).
        if (shot.cueDir && shot.cueRoll > 1) {
          var pex = shot.ghost[0] + shot.cueDir[0] * shot.cueRoll;
          var pey = shot.ghost[1] + shot.cueDir[1] * shot.cueRoll;
          var pes = P(pex, pey);
          var pcol = shot.scratch ? '#ff5252' : '#7ee7ff';
          ctx.beginPath(); ctx.moveTo(gs[0], gs[1]); ctx.lineTo(pes[0], pes[1]);
          ctx.strokeStyle = shot.scratch ? 'rgba(255,82,82,.9)' : 'rgba(126,231,255,.9)';
          ctx.lineWidth = 3; ctx.setLineDash([7, 6]); ctx.stroke(); ctx.setLineDash([]);
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
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function evOpts(x, y) { return { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: 1, pointerId: 7, pointerType: 'touch', isPrimary: true }; }
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
      var t0 = Date.now();
      var h1 = heapViews();
      if (!h1) { stat('Module/heap belum ada. Masuk match dulu sampai meja muncul.'); log('SCAN gagal: Module belum ada'); return; }
      var r1 = rawClustersStrict(h1.f64, h1.i32);
      var clusters = r1.clusters;
      log('SCAN1 heap=' + h1.bytes + ' range=' + r1.stats.range + ' ketat=' + r1.stats.strict + ' cluster=' + clusters.length + ' (' + (Date.now() - t0) + 'ms)');
      await sleep(600);
      var h2 = heapViews();
      if (!h2) { log('SCAN gagal: heap hilang di scan ke-2'); return; }
      var stable = stableClusters(clusters, h2.f64);
      var res = assignBallsAndPockets(stable, h2.i32);
      var cv = largestCanvas();
      S.lastScan = { res: res, canvasRect: cv ? cv.rect : null };
      var cue = res.balls.filter(function (b) { return b.cue || b.num === 0; })[0];
      var ballTxt = res.balls.slice(0, 20).map(function (b) { return (b.num === null ? '?' : b.num) + '@' + b.x.toFixed(2) + ',' + b.y.toFixed(2); }).join(' ') + (res.balls.length > 20 ? ' ... +' + (res.balls.length - 20) + ' lagi' : '');
      stat('Bola ' + res.balls.length + ' (stabil ' + stable.length + '), pocket dari heap: ' + (res.pocketFromHeap ? 'YA' : 'PERKIRAAN') + ', nomor OK: ' + (res.numbersOk ? 'YA' : 'TIDAK') + ', R=' + res.radius.toFixed(1) + ', cue: ' + (cue ? 'YA' : 'TIDAK'));
      log('BOLA ' + ballTxt);
      log('POCKET ' + res.pockets.map(function (p) { return Math.round(p.x) + ',' + Math.round(p.y); }).join(' ') + ' | R=' + res.radius.toFixed(1) + ' W=' + Math.round(res.pocketWidth));
      saveLearned(res, 'SCAN KETAT');
      var shot = pickShot(res.balls, res.pockets, res.radius, S.group, S.allowBank, res.pocketWidth);
      if (!shot) {
        log('SOLVER: tidak ada tembakan (cue=' + (cue ? 'ada' : 'tidak') + ', grup=' + (S.group || 'buka') + ')');
        drawShot(null, res);
        return;
      }
      S.lastScan.shot = shot;
      if (!res.numbersOk) {
        S.mode = 'off';
        var ab2 = $('akv2Auto'); if (ab2) ab2.textContent = 'AUTOPLAY: OFF (tap = 1 tembakan, lalu OFF)';
        log('NOMOR TIDAK KETEMU: tidak menembak otomatis. Pakai SIMPAN lalu BANDINGKAN sesudah tembak manual, atau kirim log ini.');
      }
      var tgt = res.balls[shot.targetIdx];
      log('TEMBAKAN target=' + (tgt.num === null ? '?' : tgt.num) + ' pocket=' + Math.round(shot.pocket.x) + ',' + Math.round(shot.pocket.y) + ' cut=' + shot.cut.toFixed(1) + ' power=' + shot.power + (shot.bank ? ' BANK' : '') + (shot.kick ? ' KICK' : '') + (shot.scratch ? ' SCRATCH-RISK!' : ' putih-aman'));
      drawShot(shot, res);
      if (autoShoot && S.mode === 'once' && res.numbersOk) shootLast();
    }
    async function shootLast() {
      // v2.2: return true kalau tembakan BENERAN terkirim, false kalau diblokir/gagal
      // (dipakai shootNext biar tidak macet di autoWaiting).
      if (S.shooting) { log('TEMBAK ditahan: masih menembak'); return false; }
      if (!S.lastScan || !S.lastScan.shot) { log('TEMBAK gagal: SCAN dulu'); return false; }
      var cv = largestCanvas();
      if (!cv) { log('TEMBAK gagal: canvas tidak ketemu'); return false; }
      var res = S.lastScan.res, shot = S.lastScan.shot;
      if (!res.numbersOk) { log('TEMBAK DIBLOKIR: nomor tidak ketemu, risiko menembak bola hantu. Pakai SIMPAN/BANDINGKAN dulu.'); return false; }
      var cue = null;
      for (var i = 0; i < res.balls.length; i++) if (res.balls[i].cue || res.balls[i].num === 0) cue = res.balls[i];
      if (!cue) { log('TEMBAK gagal: cue tidak ketemu'); return false; }
      S.shooting = true;
      S.linesFrozen = true; // v2.16: bekukan garis sampai bola berhenti
      try { stat('⏸️ LINE BEKU — menunggu bola berhenti...'); } catch (e) {}
      // v2.2: pengaman — S.shooting pasti lepas walau ada error di tengah.
      setTimeout(function () { S.shooting = false; }, 3000);
      try {
        var rect = cv.rect;
        var cs = worldToScreen(cue.x, cue.y, rect);
        // ARAH BIDIK DALAM KOORDINAT LAYAR (fix 2026-10-31): shot.angle adalah sudut
        // KOORDINAT DUNIA, sedangkan worldToScreen membalik sumbu Y (AK_F negatif).
        // Memakai sudut dunia langsung di pixel layar = bidikan TERCERMIN vertikal
        // -> tembakan "asal tusuk" padahal garis putih (digambar via worldToScreen)
        // terlihat benar. Sekarang arah diambil dari P(cue)->P(ghost) di layar,
        // otomatis benar termasuk flip Y, anisotropi, dan offset kalibrasi.
        var gs = worldToScreen(shot.ghost[0], shot.ghost[1], rect);
        var sdx = gs[0] - cs[0], sdy = gs[1] - cs[1];
        var sl = Math.hypot(sdx, sdy) || 1; sdx /= sl; sdy /= sl;
        var ringDist = Math.min(180, rect.width * 0.35);
        var ring = [cs[0] + sdx * ringDist, cs[1] + sdy * ringDist];
        ring[0] = Math.max(rect.left + 5, Math.min(rect.left + rect.width - 5, ring[0]));
        ring[1] = Math.max(rect.top + 5, Math.min(rect.top + rect.height - 5, ring[1]));
        log('AIM angle=' + (shot.angle * 180 / Math.PI).toFixed(1) + ' power=' + shot.power);
        for (var s = 0; s <= 4; s++) { fireHover(cv.el, cs[0] + (ring[0] - cs[0]) * s / 4, cs[1] + (ring[1] - cs[1]) * s / 4); await sleep(20); }
        fireHover(cv.el, ring[0], ring[1]); await sleep(120);
        // Tarikan cue dilunakkan 2026-10-31 mengikuti retune power (dulu 50+270 -> selalu tarikan maksimal).
        var pullLen = (40 + shot.power / 100 * 200) * (rect.width / 587);
        var start = ring.slice(), end = [ring[0] - sdx * pullLen, ring[1] - sdy * pullLen];
        fire(cv.el, 'pointerdown', start[0], start[1]);
        for (var j = 1; j <= 6; j++) { fire(cv.el, 'pointermove', start[0] + (end[0] - start[0]) * j / 6, start[1] + (end[1] - start[1]) * j / 6); await sleep(25); }
        await sleep(40);
        fire(cv.el, 'pointerup', end[0], end[1]);
        log('TEMBAK TERKIRIM. Menunggu bola berhenti.');
      } catch (e) { log('TEMBAK error: ' + e.message); return false; }
      finally { setTimeout(function () { S.shooting = false; }, 800); }
      S.mode = 'off';
      var ab = $('akv2Auto'); if (ab) ab.textContent = 'AUTOPLAY: OFF (tap = 1 tembakan, lalu OFF)';
      S.lastScan.shot = null;
      return true;
    }

    function directScanBalls(h) {
      // Cari bola LANGSUNG dari tanda yang sama dengan putih: nomor +92
      // 0-15 DAN radius +48 = 3.800475. Ini tidak peduli posisi x/y-nya
      // 0, integer, atau di rack — kalau tandanya cocok, itu bola PHYS.
      // Scan sekali per SIMPAN saja, bukan per giliran.
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
    async function saveLearn() {
      var h = heapViews();
      if (!h) { log('SIMPAN gagal: Module belum ada'); return; }
      log('SIMPAN: CARI BOLA LANGSUNG dari tanda putih (nomor +92, radius +48)…');
      var direct = await directScanBalls(h);
      log('CARI BOLA LANGSUNG selesai: ' + direct.length + ' bola nomor=' + direct.map(function (b) { return b.num; }).join(','));
      if (direct.length >= 6) {
        await sleep(800);
        var h2d = heapViews(); if (!h2d) { log('SIMPAN gagal: heap hilang'); return; }
        var stableD = [];
        for (var di = 0; di < direct.length; di++) {
          var dc = direct[di];
          if (dc.idx + 1 < h2d.f64.length && Math.abs(h2d.f64[dc.idx] - dc.x) < 0.5 && Math.abs(h2d.f64[dc.idx + 1] - dc.y) < 0.5 && Math.abs(h2d.f64[dc.idx + 6] - 3.800475) < 0.000001) stableD.push(dc);
          else log('  bola nomor=' + dc.num + ' GUGUR di cek stabil (posisi/radius berubah) — kemungkinan salinan tidak aktif.');
        }
        S.learnOld = stableD;
        log('SIMPAN OK dari CARI LANGSUNG stabil=' + stableD.length + ' dari ' + direct.length + ', heap bytes=' + h2d.bytes + '. Sekarang tembak manual, tunggu bola BERHENTI, lalu tekan BANDINGKAN.');
        for (var fi2 = 0; fi2 < stableD.length; fi2++) {
          var cc2 = stableD[fi2], bb2 = cc2.idx * 8;
          log('  bola idx=' + cc2.idx + ' byte=' + bb2 + ' (' + cc2.x.toFixed(1) + ',' + cc2.y.toFixed(1) + ') num=' + cc2.num + ' radius+48=' + h2d.f64[(bb2 + 48) / 8]);
        }
        stat('Posisi tersimpan (' + stableD.length + ' bola langsung). Tembak manual, tunggu berhenti, lalu BANDINGKAN.');
        return;
      }
      log('CARI LANGSUNG hanya ' + direct.length + ' bola (<6), pakai scan ketat sebagai cadangan…');
      var r = rawClustersStrict(h.f64, h.i32);
      await sleep(800);
      var h2 = heapViews();
      if (!h2) { log('SIMPAN gagal: heap hilang'); return; }
      var stable = [];
      for (var i = 0; i < r.clusters.length; i++) {
        var c = r.clusters[i];
        if (c.idx + 1 < h2.f64.length && Math.abs(h2.f64[c.idx] - c.x) < 0.5 && Math.abs(h2.f64[c.idx + 1] - c.y) < 0.5) stable.push(c);
      }
      // SERIUS: pass kedua untuk bola putih di garis tengah y=0/x=0, yang
      // dibuang scan ketat. Hanya yang lolos directRead (nomor 0-15, radius
      // 3.800475) yang ikut, jadi geometri tetap tidak ikut.
      for (var ci = 0; ci < h2.f64.length - 1; ci++) {
        var cx = h2.f64[ci], cy = h2.f64[ci + 1];
        if (!isFinite(cx) || !isFinite(cy)) continue;
        if (!(cx === 0 || cy === 0)) continue;
        if (cx < -200 || cx > 200 || cy < -160 || cy > 160) continue;
        if (cx === 0 && cy === 0) continue;
        var cbyte = ci * 8, cnum = h2.i32[(cbyte + 92) / 4], crad = h2.f64[(cbyte + 48) / 8];
        if (cnum < 0 || cnum > 15) continue;
        if (Math.abs(crad - 3.800475) > 0.000001) continue;
        var dup2 = false;
        for (var dj = 0; dj < stable.length; dj++) if (Math.hypot(stable[dj].x - cx, stable[dj].y - cy) < 6) { dup2 = true; break; }
        if (!dup2) stable.push({ x: cx, y: cy, idx: ci });
      }
      S.learnOld = stable;
      log('SIMPAN OK stabil=' + stable.length + ' dari cluster=' + r.clusters.length + ' (range=' + r.stats.range + ' ketat=' + r.stats.strict + '), heap bytes=' + h2.bytes + '. Sekarang tembak manual, tunggu bola BERHENTI, lalu tekan BANDINGKAN.');
      for (var fi = 0; fi < stable.length; fi++) {
        var cc = stable[fi], bb = cc.idx * 8;
        log('  stabil idx=' + cc.idx + ' byte=' + bb + ' (' + cc.x.toFixed(1) + ',' + cc.y.toFixed(1) + ') num+92=' + h2.i32[(bb + 92) / 4] + ' radius+48=' + h2.f64[(bb + 48) / 8]);
      }
      stat('Posisi tersimpan (' + stable.length + ' stabil). Tembak manual, tunggu berhenti, lalu BANDINGKAN.');
    }
    async function autoDetect() {
      // FIX deadlock 2026-10-31: autoDetectCheck dulu menyetel S.autoDetecting=true SEBELUM
      // memanggil autoDetect(), sehingga guard di bawah langsung return 'sudah berjalan' dan
      // deteksi TIDAK PERNAH jalan (loop tiap 30 detik selamanya). Sekarang flag dikelola di sini.
      if (S.autoDetecting && !S.autoBeruntun) { log('AUTO DETEKSI sudah berjalan, tunggu.'); return; }
      S.autoDetecting = true;
      try {
      // AUTO DETEKSI: tanpa tembak manual, tanpa canvas, tanpa template PNG
      // (PNG itu tekstur 3D, bukan foto dari atas, jadi pencocokan PNG ke
      // layar akan lambat dan tidak akurat). Jalurnya heap saja:
      // 1) CARI LANGSUNG dapat benih bola posisi asli,
      // 2) cari array pointer slot=nomor dari benih itu,
      // 3) baca SEMUA bola lewat array itu — termasuk bola yang terlewat
      //    scan langsung karena salinannya di (0,0).
      // Ini yang diminta user: deteksi otomatis, dapat y/x, lalu ambil.
      var h = heapViews();
      if (!h) { log('AUTO DETEKSI gagal: Module belum ada'); return; }
      log('AUTO DETEKSI mulai: CARI LANGSUNG benih bola…');
      var direct = await directScanBalls(h);
      var seeds = direct.filter(function (b) { return !(b.x === 0 && b.y === 0); });
      log('AUTO DETEKSI benih posisi asli=' + seeds.length + ' nomor=' + seeds.map(function (b) { return b.num; }).join(','));
      if (seeds.length < 3) { log('AUTO DETEKSI gagal: benih <3. Pastikan bola di meja dan diam, lalu tekan lagi.'); return; }
      var phys = directReadBalls(seeds.map(function (b) { return { x: b.x, y: b.y, idx: b.idx }; }), h).filter(function (b) { return b.radiusType === 'PHYS'; });
      log('AUTO DETEKSI PHYS benih=' + phys.length + ' nomor=' + phys.map(function (b) { return b.num; }).join(','));
      if (phys.length < 3) { log('AUTO DETEKSI gagal: PHYS benih <3.'); return; }
      log('AUTO DETEKSI: mencari array pointer slot=nomor… (agak lama)');
      var pa = await findPointerArray(h, phys);
      var h2 = heapViews(); if (!h2) { log('AUTO DETEKSI gagal: heap hilang'); return; }
      if (pa) {
        log('AUTO DETEKSI ARRAY KETEMU base=' + pa.base + ' nomor=' + pa.numbers.join(','));
        var pockets = FIXED_POCKETS;
        var dummy = { arrayBase: pa.base, pockets: pockets, pocketWidth: FIXED_POCKET_WIDTH };
        var ptr = readPointerBalls(h2, dummy);
        if (ptr && ptr.balls.length >= 6) {
          // readPointerBalls menyimpan idx = objectBase, sedangkan posisi
          // ada di idx+4. Perbaiki idx supaya fallback idx belajar juga benar.
          var autoBalls = ptr.balls.map(function (b) { return { x: b.x, y: b.y, idx: b.idx + 4, num: b.num, cue: b.cue }; });
          var res = { balls: autoBalls, pockets: pockets, pocketWidth: dummy.pocketWidth, radius: 3.800475, numbersOk: true, pocketFromHeap: false, numberDelta: 23 };
          S.lastScan = { res: res, canvasRect: null };
          saveLearned(res, 'AUTO DETEKSI');
          if (S.learned) { S.learned.arrayBase = pa.base; updateLearnStat(); }
          log('AUTO DETEKSI OK: ' + ptr.balls.length + ' bola lewat array: ' + ptr.balls.map(function (b) { return b.num + '@' + b.x.toFixed(1) + ',' + b.y.toFixed(1); }).join(' ') + (ptr.missing.length ? ' | hilang=' + ptr.missing.join(',') : ''));
          // v2.28: auto pocket biar pas sama meja
          try { if (typeof applyHeapPockets === 'function') applyHeapPockets(); } catch (eAP) {}
          var shot = pickShot(res.balls, res.pockets, res.radius, S.group, S.allowBank, res.pocketWidth);
          if (shot) { S.lastScan.shot = shot; var tgt = res.balls[shot.targetIdx]; log('AUTO DETEKSI tembakan target=' + tgt.num + ' cut=' + shot.cut.toFixed(1) + ' power=' + shot.power); drawShot(shot, res); }
          else { log('AUTO DETEKSI: tidak ada tembakan (cek grup POLOS/GARIS).'); drawShot(null, res); }
          if (S.autoplayPending) { S.autoplayPending = false; log('AUTOPLAY yang menunggu belajar sekarang DINYALAKAN otomatis.'); setBeruntun(true); }
          return;
        }
        log('AUTO DETEKSI: baca lewat array hanya ' + (ptr ? ptr.balls.length : 0) + ' bola, pakai benih PHYS sebagai cadangan.');
      } else log('AUTO DETEKSI: array tidak ketemu, pakai benih PHYS sebagai cadangan.');
      var pockets2 = FIXED_POCKETS;
      var res2 = { balls: phys, pockets: pockets2, pocketWidth: FIXED_POCKET_WIDTH, radius: 3.800475, numbersOk: true, pocketFromHeap: false, numberDelta: 23 };
      S.lastScan = { res: res2, canvasRect: null };
      saveLearned(res2, 'AUTO DETEKSI (cadangan)');
      var shot2 = pickShot(res2.balls, res2.pockets, res2.radius, S.group, S.allowBank, res2.pocketWidth);
      if (shot2) { S.lastScan.shot = shot2; drawShot(shot2, res2); }
      } finally { S.autoDetecting = false; }
    }
    async function compareLearn() {
      if (!S.learnOld) { log('BANDINGKAN gagal: tekan SIMPAN dulu sebelum tembak manual'); return; }
      var h = heapViews();
      if (!h) { log('BANDINGKAN gagal: Module belum ada'); return; }
      // v1.1 FIX: JANGAN scan ulang lalu cocokkan idx. Scan ulang tidak stabil
      // (log user: SIMPAN 19 cluster, BANDINGKAN 29 cluster, idx-nya tidak ketemu
      // sehingga BERGERAK=0). Cara detector yang terbukti: baca LANGSUNG posisi
      // baru dari idx yang sudah tersimpan, tanpa scan baru.
      var moved = [], still = 0;
      S.learnOld.forEach(function (o) {
        if (o.idx + 1 >= h.f64.length) return;
        var nx = h.f64[o.idx], ny = h.f64[o.idx + 1];
        if (!isFinite(nx) || !isFinite(ny)) return;
        var d = Math.hypot(nx - o.x, ny - o.y);
        if (d > 2) moved.push({ x: nx, y: ny, idx: o.idx, score: 5, oldX: o.x, oldY: o.y });
        else still++;
      });
      var maxD = 0; S.learnOld.forEach(function (o) { if (o.idx + 1 < h.f64.length) { var dd = Math.hypot(h.f64[o.idx] - o.x, h.f64[o.idx + 1] - o.y); if (isFinite(dd) && dd > maxD) maxD = dd; } });
      log('BANDINGKAN dari ' + S.learnOld.length + ' tersimpan (baca langsung, tanpa scan ulang), BERGERAK=' + moved.length + ' DIAM=' + still + ' GERAK MAKS=' + maxD.toFixed(2) + ' heap bytes=' + h.bytes);
      log('BERGERAK ' + moved.slice(0, 20).map(function (b) { return b.x.toFixed(2) + ',' + b.y.toFixed(2); }).join(' '));
      if (!moved.length) { log('Tidak ada bola bergerak. Pastikan kamu SUDAH tembak manual di antara SIMPAN dan BANDINGKAN, dan semua bola sudah BERHENTI penuh sebelum tekan BANDINGKAN. Kalau sudah tembak tapi tetap 0, kirim log ini.'); return; }
      var res = assignBallsAndPockets(moved, h.i32);
      S.lastScan = { res: res, canvasRect: null };
      var shot = pickShot(res.balls, res.pockets, res.radius, S.group, S.allowBank, res.pocketWidth);
      saveLearned(res, 'BANDINGKAN');
      if (S.autoplayPending && S.learned && !S.autoBeruntun) { S.autoplayPending = false; log('AUTOPLAY yang tadi menunggu belajar sekarang DINYALAKAN otomatis (fallback idx, array pointer menyusul).'); setBeruntun(true); }
      log('BELAJAR bola=' + res.balls.map(function (b) { return (b.num === null ? '?' : b.num) + '@' + b.x.toFixed(2) + ',' + b.y.toFixed(2); }).join(' '));
      log('BELAJAR pocketHeap=' + res.pocketFromHeap + ' nomorOK=' + res.numbersOk + ' R=' + res.radius.toFixed(2));
      // PATOKAN GABUNGAN v1: bola bergerak -> directRead terkonfirmasi -> array pointer.
      var phys = directReadBalls(moved, h).filter(function (b) { return b.radiusType === 'PHYS'; });
      log('PATOKAN directRead: ' + phys.length + ' bola PHYS (nomor +92, radius +48=3.800475): ' + phys.map(function (b) { return b.num + '@' + b.x.toFixed(1) + ',' + b.y.toFixed(1); }).join(' '));
      try { var _res = performance.getEntriesByType('resource') || []; var _map = {}; for (var _i = 0; _i < _res.length; _i++) { var _m = (_res[_i].name || '').match(/ball(\d+)-ipad\.png/); if (_m && !_map[_m[1]]) _map[_m[1]] = 1; } S.ballImages = _map; var _ok = phys.filter(function (b) { return _map[String(b.num)]; }).length; log('PATOKAN GAMBAR: ' + _ok + '/' + phys.length + ' nomor PHYS cocok dengan ballN-ipad.png di resource game.'); } catch (e) {}
      if (phys.length >= 6) {
        var res2 = { balls: phys, pockets: res.pockets, pocketWidth: res.pocketWidth, radius: 3.800475, numbersOk: true, pocketFromHeap: false };
        var shot2 = pickShot(res2.balls, res2.pockets, res2.radius, S.group, S.allowBank, res2.pocketWidth);
        S.lastScan = { res: res2, shot: shot2 || null };
        if (shot2) { var tgt2 = res2.balls[shot2.targetIdx]; log('PATOKAN tembakan target=' + tgt2.num + ' cut=' + shot2.cut.toFixed(1) + ' power=' + shot2.power); drawShot(shot2, res2); }
        else { log('PATOKAN: tidak ada tembakan dari bola PHYS (pocket perkiraan mungkin meleset).'); drawShot(null, res2); }
        log('PATOKAN: mencari array pointer slot=nomor (scan heap, agak lama)…');
        findPointerArray(h, phys).then(function (pa) {
          if (pa) {
            if (S.learned) { S.learned.arrayBase = pa.base; updateLearnStat(); }
            log('PATOKAN ARRAY KETEMU: base=' + pa.base + ' ' + pa.numbers.length + ' bola nomor=' + JSON.stringify(pa.numbers) + ' — AUTO GILIRAN sekarang baca lewat array ini, tanpa SCAN.');
            if (S.autoplayPending) { S.autoplayPending = false; log('AUTOPLAY yang tadi menunggu belajar sekarang DINYALAKAN otomatis.'); setBeruntun(true); }
          } else log('PATOKAN ARRAY TIDAK KETEMU (>=5 bola). Ulangi BANDINGKAN sesudah tembakan lain yang menggerakkan lebih banyak bola; AUTO GILIRAN pakai fallback idx.');
        });
      } else {
        var _all = directReadBalls(moved, h);
        log('PATOKAN GAGAL: bola PHYS <6 (moved=' + moved.length + ', directRead lolos=' + _all.length + '): ' + moved.map(function (m) { var b = m.idx * 8; return 'idx=' + m.idx + ' num=' + h.i32[(b + 92) / 4] + ' rad=' + h.f64[(b + 48) / 8]; }).join(' | '));
        log('PATOKAN GAGAL: tembak manual lagi yang menggerakkan lebih banyak bola, lalu BANDINGKAN lagi.');
      }
      if (shot) {
        S.lastScan.shot = shot;
        var tgt = res.balls[shot.targetIdx];
        log('BELAJAR tembakan target=' + (tgt.num === null ? '?' : tgt.num) + ' cut=' + shot.cut.toFixed(1) + ' power=' + shot.power);
        drawShot(shot, res);
      } else {
        log('BELAJAR: tidak ada tembakan (cue/nomor belum ketemu). Kirim log ini.');
        drawShot(null, res);
      }
    }


    function directReadBalls(moved, h) {
      var out = [];
      for (var i = 0; i < moved.length; i++) {
        var c = moved[i], byte = c.idx * 8;
        var num = h.i32[(byte + 92) / 4];
        var radius = h.f64[(byte + 48) / 8];
        var vx = h.f64[(byte + 16) / 8], vy = h.f64[(byte + 24) / 8];
        var radOk = (radius === 0 || Math.abs(radius - 3.800475) < 0.000001);
        var velOk = isFinite(vx) && isFinite(vy) && Math.abs(vx) < 100 && Math.abs(vy) < 100;
        if (!radOk || !velOk) continue;
        var type = (Math.abs(radius - 3.800475) < 0.000001) ? 'PHYS' : 'ARRAY';
        out.push({ x: c.x, y: c.y, idx: c.idx, num: num, radius: radius, radiusType: type, velocityX: vx, velocityY: vy, obj: byte - 32, cue: (num === 0) });
      }
      return out;
    }
    function findPointerArray(h, phys) {
      return new Promise(function (resolve) {
        var targetSet = {}, groups = {};
        for (var i = 0; i < phys.length; i++) targetSet[phys[i].obj] = true;
        var pos = 0, chunk = 10000000, total = h.i32.length;
        (function step() {
          var end = Math.min(pos + chunk, total);
          for (var j = pos; j < end; j++) {
            var v = h.i32[j];
            if (targetSet[v]) {
              var src = j * 4;
              if (!groups[v]) groups[v] = { sourceBytes: [] };
              groups[v].sourceBytes.push(src);
            }
          }
          pos = end;
          // CEPAT: array pointer di semua log ada di byte ~100MB (i32 ~25 juta).
          // Kalau sudah lewat 40 juta dan sudah ada base dengan >=6 nomor,
          // berhenti, tidak perlu scan sampai akhir.
          var earlyBest = null;
          if (pos >= 40000000) {
            var _numByObj = {};
            for (var _k = 0; _k < phys.length; _k++) _numByObj[phys[_k].obj] = phys[_k].num;
            var _bg = {};
            for (var _tg in groups) {
              var _num = _numByObj[parseInt(_tg, 10)]; if (_num === undefined) continue;
              for (var _sb = 0; _sb < groups[_tg].sourceBytes.length; _sb++) {
                var _base = groups[_tg].sourceBytes[_sb] - 4 * _num;
                if (!_bg[_base]) _bg[_base] = {};
                _bg[_base][_num] = true;
              }
            }
            for (var _b in _bg) { var _nl = Object.keys(_bg[_b]).length; if (_nl >= 6 && (!earlyBest || _nl > earlyBest)) earlyBest = _nl; }
          }
          if (pos < total && !earlyBest) setTimeout(step, 0);
          else {
            var numByObj = {};
            for (var k = 0; k < phys.length; k++) numByObj[phys[k].obj] = phys[k].num;
            var baseGroups = {};
            for (var tg in groups) {
              var num = numByObj[parseInt(tg, 10)];
              if (num === undefined) continue;
              for (var sb = 0; sb < groups[tg].sourceBytes.length; sb++) {
                var base = groups[tg].sourceBytes[sb] - 4 * num;
                if (!baseGroups[base]) baseGroups[base] = { base: base, numbers: {} };
                baseGroups[base].numbers[num] = true;
              }
            }
            var best = null;
            for (var bg in baseGroups) {
              var nlist = Object.keys(baseGroups[bg].numbers).map(function (x) { return parseInt(x, 10); }).sort(function (a, b) { return a - b; });
              if (nlist.length >= 5 && (!best || nlist.length > best.numbers.length)) best = { base: baseGroups[bg].base, numbers: nlist };
            }
            resolve(best);
          }
        })();
      });
    }
    function readPointerBalls(h, learned) {
      if (!learned || !learned.arrayBase) return null;
      var balls = [], missing = [];
      for (var num = 0; num <= 15; num++) {
        var obj = h.i32[learned.arrayBase / 4 + num];
        if (!obj) { missing.push(num); continue; }
        var fi = obj / 8, ii = obj / 4;
        var x = h.f64[fi + 4], y = h.f64[fi + 5], radius = h.f64[fi + 10], nread = h.i32[ii + 31];
        if (nread !== num || Math.abs(radius - 3.800475) > 0.000001 || !isFinite(x) || !isFinite(y) || x < -200 || x > 200 || y < -160 || y > 160) { missing.push(num); continue; }
        balls.push({ x: x, y: y, idx: fi, num: num, cue: (num === 0) });
      }
      if (balls.length < 6) return null;
      return { balls: balls, missing: missing, pockets: learned.pockets, pocketWidth: learned.pocketWidth, radius: 3.800475, numbersOk: true };
    }
    function updateLearnStat() {
      var el = $('akv2LearnStat');
      if (el) el.textContent = S.learned ? ('BELAJAR: OK (' + S.learned.source + ', ' + S.learned.count + ' bola) - AUTO bisa baca instan di rack ini') : 'BELAJAR: BELUM - SIMPAN lalu BANDINGKAN dulu (sekali per rack)';
    }
    function saveLearned(res, source) {
      if (!res || !res.numbersOk || !res.balls || res.balls.length < 6) {
        log('BELAJAR GAGAL (' + source + '): bola bernomor ' + (res && res.balls ? res.balls.length : 0) + ' <6 atau nomor tidak OK. Lakukan break / SCAN KETAT lagi.');
        return false;
      }
      S.learned = { entries: res.balls.map(function (b) { return { idx: b.idx, num: b.num }; }), numberDelta: res.numberDelta, pocketWidth: res.pocketWidth, radius: res.radius, pockets: res.pockets, pocketFromHeap: res.pocketFromHeap, source: source, count: res.balls.length };
      updateLearnStat();
      log('BELAJAR OK (' + source + '): ' + res.balls.length + ' bola, delta nomor=' + res.numberDelta + '. AUTO GILIRAN / AUTO BERUNTUN sekarang baca instan tanpa SCAN, di rack ini saja. Rack baru / reload = belajar lagi.');
      return true;
    }
    function readAuto() {
      if (!S.learned) return null;
      var h = heapViews();
      if (!h) return null;
      var ptr = readPointerBalls(h, S.learned);
      if (ptr) { log('BACA ARRAY: ' + ptr.balls.length + ' bola lewat arrayBase=' + S.learned.arrayBase + ', tanpa SCAN'); return ptr; }
      log('BACA ARRAY gagal, fallback ke idx belajar lama');
      var r = readLearnedBalls(h.f64, h.i32, S.learned.entries, S.learned.numberDelta);
      return { balls: r.balls, missing: r.missing, pockets: S.learned.pockets, pocketWidth: S.learned.pocketWidth, radius: S.learned.radius, numbersOk: true };
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
    function setBeruntun(on) {
      // v1.3 FIX: log user v1.2 menumpuk ON/OFF karena AUTOPLAY ditekan sebelum
      // belajar, lalu autoTick mematikannya lagi tiap detik. Sekarang: kalau
      // belum belajar, AUTOPLAY tidak dinyalakan paksa — dia MENUNGGU, dan akan
      // nyala sendiri sesudah BANDINGKAN berhasil (lihat compareLearn).
      if (on && !S.learned) {
        S.autoplayPending = true;
        var ap2 = $('akv2Autoplay'); if (ap2) ap2.textContent = '⏳ AUTOPLAY: MENUNGGU BELAJAR';
        var b2 = $('akv2Beruntun'); if (b2) b2.textContent = 'AUTO BERUNTUN: MENUNGGU BELAJAR';
        log('AUTOPLAY MENUNGGU BELAJAR: lakukan SIMPAN -> tembak manual -> BANDINGKAN dulu. Sesudah belajar berhasil, AUTOPLAY akan nyala sendiri, tidak perlu ditekan lagi.');
        return;
      }
      S.autoBeruntun = on;
      if (!on) { S.autoplayPending = false; S.oppWait = false; S.oppMoved = false; S.waitChange = false; S.waitChangeBalls = null; S.autoWaiting = false; stopFastTimer(); }
      var b = $('akv2Beruntun'); if (b) b.textContent = 'AUTO BERUNTUN: ' + (on ? 'ON' : 'OFF');
      var ap = $('akv2Autoplay'); if (ap) ap.textContent = (on ? '⏸ AUTOPLAY: ON' : '▶ AUTOPLAY: OFF');
      if (!on) S.autoWaiting = false;
      log('AUTOPLAY ' + (on ? 'ON (tidak pernah mati sendiri; kalau giliran lawan dia menunggu lalu lanjut otomatis)' : 'OFF') + ' (giliran tidak bisa dibaca dari heap, jadi jeda lawan dideteksi dari gerakan bola)');
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
      if (S.learned && S.learned.entries) {
        var ok = 0, bad = [];
        S.learned.entries.forEach(function (e) { if (map[String(e.num)]) ok++; else bad.push(e.num); });
        log('GAMBAR vs HEAP: ' + ok + ' nomor belajar cocok dengan ballN-ipad.png' + (bad.length ? ', tidak cocok=' + JSON.stringify(bad) : ''));
      } else log('GAMBAR vs HEAP: belum belajar, tekan SIMPAN/BANDINGKAN dulu untuk cek cocok tidaknya.');
      stat('Gambar bola: ' + nums.length + '/16 nomor, JSON ' + jsonUrls.length + ', PLIST ' + plistUrls.length);
    }
    async function autoGiliran() {
      var autoRes = readAuto();
      if (!autoRes) { log('AUTO GILIRAN gagal: BELUM BELAJAR. SIMPAN lalu BANDINGKAN dulu.'); return; }
      var shot = pickShot(autoRes.balls, autoRes.pockets, autoRes.radius, S.group, S.allowBank, autoRes.pocketWidth);
      if (!shot) { log('AUTO GILIRAN: tidak ada tembakan (bola ' + autoRes.balls.length + ', hilang ' + autoRes.missing.length + ')'); drawShot(null, autoRes); return; }
      drawShot(shot, autoRes); // v2.2: garis prediksi selalu digambar
      if (!shot.validated) { log('AUTO GILIRAN: tidak ada tembakan VALID — garis prediksi ditampilkan, tidak ditembak.'); return; }
      S.lastScan = { res: autoRes, shot: shot };
      log('AUTO GILIRAN target=' + autoRes.balls[shot.targetIdx].num + ' power=' + shot.power + ' (baca instan, tanpa SCAN)');
      await shootLast();
    }
    function clearLearned(why) {
      S.learned = null; S.autoLastBalls = null; S.autoStableCount = 0; S.staleCount = 0;
      // v2.9: FIX match ke-2 — reset grup juga! (Grup match lama tidak boleh
      // dipakai di match baru. Grup = null artinya ANY/belum ditentukan.)
      if (S.group) { log('GRUP di-reset (match baru): ' + S.group + ' -> ANY'); }
      S.group = null; updateGroupBtn();
      S.breakDone = false; // v2.10: reset flag break untuk match baru
      S.oppStartBalls = null;
      updateLearnStat();
      log(why);
    }
    // v2.25: Tombol MATCH BARU manual — untuk guest mode yang deteksi otomatisnya gagal.
    // Clear SEMUA state dan langsung deteksi ulang.
    async function matchBaru() {
      log('🔄 MATCH BARU: clear semua state...');
      S.learned = null; S.autoLastBalls = null; S.autoStableCount = 0; S.staleCount = 0;
      S.group = null; updateGroupBtn();
      S.breakDone = false; S.oppStartBalls = null; S.cushLines = null;
      S.linesFrozen = false; S.shooting = false;
      S.refreshLastBalls = null; S.fastLastBalls = null;
      // Clear overlay
      try { var oc = $('akv2Overlay'); if (oc) oc.getContext('2d').clearRect(0, 0, oc.width, oc.height); } catch (e) {}
      updateLearnStat();
      log('🔄 MATCH BARU: state di-clear, deteksi ulang...');
      try { await autoDetect(); } catch (e) { log('Match baru deteksi error: ' + e.message); }
      // Auto-detect cushion lines juga
      try { applyHeapCushionLines(); } catch (e2) {}
      log('🔄 MATCH BARU selesai — siap main!');
      // v2.28: auto-deteksi pocket dari heap biar pas sama meja
      try {
        log('🎯 Auto-deteksi pocket dari heap...');
        if (typeof applyHeapPockets === 'function') applyHeapPockets();
        if (typeof applyHeapCushionLines === 'function') applyHeapCushionLines();
      } catch (e) {}
    }
    async function autoDetectCheck(tag) {
      if (S.autoDetecting) return true;
      if (!S.learned) {
        var nowT = Date.now();
        if (S.lastAutoDetectFail && nowT - S.lastAutoDetectFail < 30000) return false;
        try { log(tag + ': belum belajar, AUTO DETEKSI otomatis...'); await autoDetect(); if (!S.learned) S.lastAutoDetectFail = Date.now(); } finally { S.autoDetecting = false; }
        return true;
      }
      var chk = readAuto();
      var n = (chk && chk.balls) ? chk.balls.length : 0;
      if (n < 6) {
        // v2.39: JANGAN langsung scan ulang — bola <6 bisa sementara (break,
        // bola gerak, baca gagal sesaat). Tunggu 3x gagal berturut-turut baru
        // clear + scan ulang. Sebelum itu, DIAM aja (baca dari cache tetap jalan).
        S.staleCount = (S.staleCount || 0) + 1;
        if (S.staleCount >= 3) {
          clearLearned(tag + ': match selesai / meja kosong terdeteksi, state lama di-clear.');
          try { log(tag + ': DETEKSI ULANG otomatis...'); await autoDetect(); } finally { S.autoDetecting = false; }
        } else {
          log(tag + ': bola kebaca ' + n + ' (tunggu ' + S.staleCount + '/3, TIDAK scan ulang — anti lag)');
        }
        return true;
      }
      S.staleCount = 0;
      // MATCH BARU: bola tidak pernah bertambah di tengah permainan (cuma
      // berkurang karena masuk lubang). Kalau tiba-tiba bola kembali banyak
      // (>=14 dan lebih banyak dari sebelumnya), itu meja/rack baru ->
      // clear dan deteksi ulang otomatis, tanpa klik apapun.
      if (n >= 14 && n > S.learned.count) {
        clearLearned(tag + ': MATCH BARU terdeteksi (bola ' + S.learned.count + ' -> ' + n + '), deteksi ulang otomatis tanpa klik.');
        var _sw = tryAutoSwitchTable();
        if (_sw) { var _pne = $('akv2ProfName'); if (_pne) _pne.textContent = _sw; log('GANTI MEJA OTOMATIS -> ' + _sw + ' (aset table cocok).'); }
        else { var _a = sniffTableAsset(); if (_a) log('ASET MEJA: ' + _a + ' (tidak ada profil yang cocok — pilih slot & kalibrasi lalu 💾 SAVE kalau ini meja baru).'); }
        try { await autoDetect(); if (!S.learned) S.lastAutoDetectFail = Date.now(); } finally { S.autoDetecting = false; }
        return true;
      }
      return false;
    }
    async function refreshOverlay() {
      // Dipanggil deteksiTick saat autoplay OFF: baca bola instan lewat
      // array, kalau sudah stabil 2x berturut-turut, hitung tembakan dan
      // gambar ulang garis + angka, supaya overlay selalu sesuai meja
      // terbaru walau user tembak manual. Tidak pakai scan, tidak menembak.
      if (S.linesFrozen) return; // v2.16: garis dibekukan sampai bola berhenti
      var autoRes = readAuto();
      if (!autoRes || !autoRes.balls || autoRes.balls.length < 6) return;
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
      var shot = pickShot(autoRes.balls, autoRes.pockets, autoRes.radius, S.group, S.allowBank, autoRes.pocketWidth);
      S.lastScan = { res: autoRes, shot: shot || null };
      drawShot(shot, autoRes);
      if (shot) log('REFRESH garis target=' + autoRes.balls[shot.targetIdx].num + ' (otomatis, bola stabil)');
    }
    async function deteksiTick() {
      // v2.38: skip kalau halaman belum selesai load (game masih loading → jangan scan heap)
      try { if (document.readyState !== 'complete') return; } catch (e) {}
      if (!S.deteksiOtomatis || S.autoBeruntun || S.shooting || S.linesFrozen) return;
      if (await autoDetectCheck('DETEKSI OTOMATIS')) return;
      await refreshOverlay();
    }
    function stopFastTimer() { if (S.fastTimer) { clearInterval(S.fastTimer); S.fastTimer = null; } }
    function startFastTimer() {
      // v2.1: deteksi instan — sesudah tembakan (atau bola bergerak), cek heap
      // tiap 250ms; begitu bola diam 2x berturut-turut langsung jalankan
      // autoTick tanpa menunggu interval 1 detik.
      if (S.fastTimer || !S.autoBeruntun) return;
      S.fastStable = 0; S.fastLastBalls = null; S.fastTimerStart = Date.now();
      S.trail = {}; // v2.4: jejak posisi per bola untuk POCKET LEARN
      S.fastTimer = setInterval(function () {
        if (!S.autoBeruntun || S.autoDetecting) { stopFastTimer(); return; }
        if (S.shooting || S.ticking) return; // lagi nembak -> lewati tick ini, jangan matikan timer
        var r = null;
        try { r = readAuto(); } catch (e) {}
        if (!r || !r.balls || !r.balls.length) return;
        // v2.4: catat jejak (4 titik terakhir per bola)
        try {
          r.balls.forEach(function (b) {
            var t = S.trail[b.num] || (S.trail[b.num] = []);
            var last = t[t.length - 1];
            if (!last || Math.hypot(b.x - last.x, b.y - last.y) > 0.5) {
              t.push({ x: b.x, y: b.y });
              if (t.length > 4) t.shift();
            }
          });
        } catch (e2) {}
        var stable = false;
        if (S.fastLastBalls && S.fastLastBalls.length === r.balls.length) {
          stable = true;
          var map = {};
          S.fastLastBalls.forEach(function (b) { map[b.num] = b; });
          for (var i = 0; i < r.balls.length; i++) {
            var o = map[r.balls[i].num];
            // v2.30: threshold 1 -> 2 unit (bola kadang getar dikit padahal udah berhenti)
            if (!o || Math.hypot(r.balls[i].x - o.x, r.balls[i].y - o.y) > 2) { stable = false; break; }
          }
        }
        // v2.30: timeout paksa — kalau udah 3 detik belum stabil juga, anggap berhenti
        // (mencegah nunggu selamanya karena getaran kecil)
        if (!S.fastTimerStart) S.fastTimerStart = Date.now();
        var elapsed = Date.now() - S.fastTimerStart;
        if (elapsed > 3000) { stable = true; S.fastStable = 2; }
        S.fastLastBalls = r.balls;
        S.fastStable = stable ? S.fastStable + 1 : 0;
        if (S.fastStable >= 2) {
          stopFastTimer();
          S.autoLastBalls = r.balls; S.autoStableCount = 2;
          autoTick().catch(function () {});
        }
      }, 250);
    }
    async function shootNext(autoRes) {
      var shot = null;
      // v2.12: Pas BREAK (≥15 bola), WAJIB pakai auto-break ala Arab (scan sudut, power MAX).
      if (isBreakShot(autoRes.balls)) {
        try { log('💥 BREAK terdeteksi (' + autoRes.balls.length + ' bola) — pakai AUTO-BREAK ala Arab'); } catch (eB) {}
        shot = findBreakShot(autoRes.balls, autoRes.radius);
        if (!shot) {
          // Fallback: tembak lurus ke tengah rack dengan power MAX.
          try { log('💥 BREAK fallback: tembak lurus power MAX'); } catch (eB2) {}
          shot = pickShot(autoRes.balls, autoRes.pockets, autoRes.radius, S.group, S.allowBank, autoRes.pocketWidth);
          if (shot) { shot.power = 85; shot.simPower = S.cueMaxPower || 666; }
        }
      } else {
        shot = pickShot(autoRes.balls, autoRes.pockets, autoRes.radius, S.group, S.allowBank, autoRes.pocketWidth);
      }
      // v2.2: garis prediksi SELALU digambar (dari sim display), walau tidak valid untuk ditembak.
      drawShot(shot, autoRes);
      if (!shot || !shot.validated) {
        // tidak ada tembakan valid — JANGAN tembak, tunggu meja berubah (retry 20 detik).
        if (!S.waitChange) log('AUTOPLAY: tidak ada tembakan VALID (sim menolak semua). Garis prediksi tetap tampil, menunggu meja berubah...');
        S.waitChange = true; S.waitChangeBalls = autoRes.balls; S.waitChangeSince = Date.now();
        return;
      }
      S.waitChange = false; S.waitChangeBalls = null;
      S.lastScan = { res: autoRes, shot: shot };
      S.autoPreShotNums = autoRes.balls.map(function (b) { return b.num; });
      S.tunePre = autoRes; S.tuneShot = shot;
      S.autoWaiting = true; S.autoStableCount = 0; S.autoLastBalls = null;
      log('AUTO tembak target=' + autoRes.balls[shot.targetIdx].num + ' powerUI=' + shot.power.toFixed(0) + (shot.simPower ? ' (sim ' + Math.round(shot.simPower) + ')' : ''));
      startFastTimer();
      var fired = await shootLast();
      if (!fired) {
        // v2.2: tembakan tidak terkirim (diblokir/gagal) — jangan macet di autoWaiting.
        S.autoWaiting = false; S.tunePre = null; S.tuneShot = null;
        stopFastTimer();
        S.autoStableCount = 0; S.autoLastBalls = null;
        log('Tembakan tidak terkirim, ulangi pencarian...');
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
      if (S.ticking) return;
      S.ticking = true;
      try {
        if (!S.autoBeruntun || S.shooting || S.autoDetecting) return;
        if (await autoDetectCheck('AUTOPLAY')) return;
        var autoRes = readAuto();
        if (!autoRes || !autoRes.balls || !autoRes.balls.length) return;
        setAutoPhase(S.oppWait ? 'tunggu lawan' : S.autoWaiting ? 'tunggu bola diam' : S.waitChange ? 'cari jalan' : 'jalan');
        // v2.1: fase TUNGGU LAWAN — autoplay tetap ON, tidak pernah mati sendiri.
        // Begitu terdeteksi bola bergerak (lawan menembak) lalu diam lagi,
        // berarti giliranmu -> tembak otomatis.
        if (S.oppWait) {
          if (ballsMoved(S.oppLastBalls, autoRes.balls, 3)) S.oppMoved = true;
          S.oppLastBalls = autoRes.balls;
          if (S.oppMoved && autoStableCheck(autoRes)) {
            S.oppWait = false; S.oppMoved = false;
            log('Lawan selesai menembak — giliranmu lagi.');
            // v2.10: Cek grup dari bola yang dimasukin lawan.
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
        // v2.2: tidak ada tembakan valid tadi -> diam sampai meja berubah,
        // atau coba lagi tiap 20 detik (barangkali bacaan heap sempat salah).
        if (S.waitChange) {
          if (ballsMoved(S.waitChangeBalls, autoRes.balls, 1)) {
            S.waitChange = false; S.waitChangeBalls = null;
            log('Meja berubah, cari tembakan lagi.');
          } else if (Date.now() - S.waitChangeSince > 20000) {
            S.waitChange = false; S.waitChangeBalls = null;
            log('Coba cari tembakan lagi (retry 20 detik).');
          } else return;
        }
        if (S.autoWaiting) {
          if (!autoStableCheck(autoRes)) { startFastTimer(); return; }
          await afterShotStable(autoRes);
        } else {
          if (!autoStableCheck(autoRes)) { startFastTimer(); return; }
          await shootNext(autoRes);
        }
      } finally { S.ticking = false; }
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
      // v2.36: FIX login — panel SELALU dibangun di semua frame.
      // Dulu: di 8ballpool.com top frame (login) script langsung return → panel
      // nggak muncul → "cheat cuma jalan di guest". Sekarang panel muncul di
      // mana aja, dan findModuleWin() yang cari Module di semua frame.
      // Anti panel ganda: cuma frame yang NEMU Module (atau prod/iframe) yang
      // tampilkan panel penuh; frame lain sembunyikan panel setelah 5 detik
      // kalau Module nggak ketemu.
      var IS_IFRAME = false;
      try { IS_IFRAME = (window.self !== window.top); } catch (e) {}
      buildPanel();
      // v2.37: panel TIDAK PERNAH auto-sembunyi (timer v2.36 dihapus — itu bug:
      // game login bisa load >8 detik, panel keburu disembunyiin sebelum Module muncul).
      // Kalau ada panel ganda, user bisa close manual pakai tombol ✕.
      // v2.38: FIX crash pas buka — interval JANGAN langsung jalan. Tunggu Module
      // ketemu dulu, baru start. Dulu interval scan heap tiap 3 detik langsung jalan
      // pas game masih loading → heap belum stabil → browser crash (apalagi di HP).
      var _intervalsStarted = false;
      function startIntervals() {
        if (_intervalsStarted) return;
        _intervalsStarted = true;
        setInterval(autoTick, 1000);
        setInterval(deteksiTick, 3000);
        setInterval(telFlushLogs, 10000); // v2.3: kirim batch log tiap 10 detik
        log('Interval dimulai (Module sudah ketemu)');
      }
      window.akv2StartIntervals = startIntervals;
      loadPokLearn(); // v2.4
      loadCushLearn(); // v2.8
      updateGroupBtn(); // v2.9: tampilkan status grup awal
      updateLearnStat();
      // v2.37: log URL + frame info buat debug login
      try { log('INIT url=' + location.href.slice(0, 80) + ' iframe=' + IS_IFRAME + ' prod=' + IS_PROD); } catch (e) {}
      var tries = 0;
      (function wait() {
        tries++;
        var h = heapViews();
        if (h) { stat('Module ketemu, heap ' + h.bytes + ' byte. Tekan SCAN saat bola diam.'); log('Module OK heap=' + h.bytes); try { startIntervals(); } catch (eSI) {} }
        else if (tries < 120) { stat('Menunggu Module... (' + tries + ')'); setTimeout(wait, 1000); }
        else stat('Module belum ketemu setelah 120 detik. URL: ' + location.hostname);
      })();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.AKV2 = { state: S, scan: doScan, heap: heapViews };
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
    var t = 0, iv = setInterval(function () { if (inject() || ++t > 40) clearInterval(iv); }, 250);
  }
})();
