/* pwa-offline.js — lapisan offline untuk PWA (tanpa memasang aplikasi Windows/APK).
 * Harus dimuat SEBELUM supabase-client.js agar fetch milik Supabase ikut terbungkus.
 * Versi browser dari desktop/offline-layer.js, penyimpanan memakai IndexedDB.
 *
 *  - GET / RPC-baca ke Supabase berhasil -> salinan disimpan di perangkat; saat offline dibaca dari salinan.
 *  - Tulis (POST/PATCH/PUT/DELETE ke /rest/v1/, bukan RPC) saat offline -> masuk antrean di perangkat,
 *    dikirim otomatis begitu koneksi kembali.
 *  - Muat ulang token login saat offline -> memakai token terakhir, sesi tidak terputus.
 *    (Login PERTAMA tetap wajib online: kata sandi hanya bisa diperiksa server.)
 *  - Keluar (logout) / tidak ada sesi -> salinan data di perangkat dihapus.
 *  - Pojok kiri bawah: indikator koneksi + jumlah data menunggu kirim.
 */
(function () {
  'use strict';
  if (window.pdpDesktop || window.__pdpOffline) return;      // aplikasi Windows punya lapisan sendiri
  if (!window.indexedDB || !window.fetch) return;
  window.__pdpOffline = true;

  var rawFetch = window.fetch.bind(window);
  var online = navigator.onLine !== false;
  var syncing = false, flushJalan = null, lastSync = null, lastCoba = 0;
  var jumlah = { pending: 0, failed: 0 };
  var supaOrigin = null, supaKey = null;

  // RPC yang hanya MEMBACA (boleh disalin). RPC lain tidak pernah diantre / disalin.
  // JANGAN masukkan bi_dekripsi / siswa_nik_kk_saya (data NIK & No. KK tidak boleh disimpan di perangkat).
  var RPC_BACA = {
    supervisi_jadwal_guru: 1, pkl_penguji_binaan: 1, pkl_pembimbing_uji: 1,
    penilaian_rekan_hasil_saya: 1, penilaian_rekan_hasil: 1, penilaian_rekan_progres: 1,
    penilaian_rekan_daftar_saya: 1, pengaduan_daftar: 1, pengaduan_jumlah_baru: 1,
    nama_wali_kelas_siswa: 1, rapor_riwayat_saya: 1, kehadiran_riwayat_saya: 1
  };

  /* ======================= PENYIMPANAN (IndexedDB) ======================= */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('pdp-offline', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        d.createObjectStore('cache', { keyPath: 'key' });
        d.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('failed', { keyPath: 'id' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s);
        t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  function cacheGet(k) { return tx('cache', 'readonly', function (s) { return s.get(k); }).catch(function () { return null; }); }
  function cacheSet(o) { o.ts = Date.now(); return tx('cache', 'readwrite', function (s) { return s.put(o); }).catch(function () {}); }
  function cacheClear() { return tx('cache', 'readwrite', function (s) { return s.clear(); }).catch(function () {}); }
  function qAll() { return tx('queue', 'readonly', function (s) { return s.getAll(); }).catch(function () { return []; }); }
  function qAdd(it) { return tx('queue', 'readwrite', function (s) { return s.add(it); }); }
  function qDel(id) { return tx('queue', 'readwrite', function (s) { return s.delete(id); }).catch(function () {}); }
  function fAll() { return tx('failed', 'readonly', function (s) { return s.getAll(); }).catch(function () { return []; }); }
  function fAdd(it) { return tx('failed', 'readwrite', function (s) { return s.put(it); }).catch(function () {}); }
  function fDel(id) { return tx('failed', 'readwrite', function (s) { return s.delete(id); }).catch(function () {}); }
  function fGet(id) { return tx('failed', 'readonly', function (s) { return s.get(id); }).catch(function () { return null; }); }

  /* ======================= UTIL ======================= */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function isNetErr(e) { return e && e.name !== 'AbortError' && (e instanceof TypeError || e.name === 'TypeError'); }
  function sama(i, init, k) { return (init && init[k]) || (i && typeof i === 'object' && i[k]) || undefined; }
  function subDari(h) {
    try {
      var t = (h.get('authorization') || '').replace(/^Bearer\s+/i, '');
      var p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.sub || 'anon';
    } catch (e) { return 'anon'; }
  }
  function tabelDari(u) { try { return new URL(u).pathname.split('/').pop(); } catch (e) { return ''; } }
  function denganWaktu(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new TypeError('timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function adaSesi() {
    try {
      for (var i = 0; i < localStorage.length; i++) { if (/^sb-.+-auth-token$/.test(localStorage.key(i))) return true; }
    } catch (e) { return true; }
    return false;
  }

  function dariCache(key) {
    return cacheGet(key).then(function (c) {
      if (!c || c.text == null) throw new TypeError('Failed to fetch');
      var h = {};
      if (c.headers) Object.keys(c.headers).forEach(function (k) { if (c.headers[k]) h[k] = c.headers[k]; });
      h['x-pdp-offline'] = 'cache';
      return new Response(c.text, { status: c.status || 200, headers: h });
    });
  }

  function responPalsu(m, h, body) {
    var rep = /return=representation/.test(h.get('prefer') || '');
    var objek = /vnd\.pgrst\.object/.test(h.get('accept') || '');
    var data = null;
    try { data = body ? JSON.parse(body) : null; } catch (e) {}
    if (!rep) return new Response(null, { status: m === 'POST' ? 201 : 204, headers: { 'x-pdp-offline': 'queued' } });
    var arr = m === 'POST' ? (Array.isArray(data) ? data : [data || {}]) : [data || {}];
    return new Response(JSON.stringify(objek ? arr[0] : arr),
      { status: m === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json', 'x-pdp-offline': 'queued' } });
  }

  /* ======================= STATUS KONEKSI ======================= */
  function setOnline(v) {
    if (online === v) return;
    online = v; render();
    if (v) flush();
  }
  async function probe() {
    if (!supaOrigin && typeof SUPABASE_URL !== 'undefined') supaOrigin = SUPABASE_URL;
    if (!supaKey && typeof SUPABASE_ANON_KEY !== 'undefined') supaKey = SUPABASE_ANON_KEY;
    if (!supaOrigin) { setOnline(navigator.onLine !== false); return; }
    try {
      await denganWaktu(rawFetch(supaOrigin + '/auth/v1/health', { headers: supaKey ? { apikey: supaKey } : {}, cache: 'no-store' }), 6000);
      setOnline(true);                       // respons HTTP apa pun = server terjangkau
    } catch (e) { setOnline(false); }
  }
  window.addEventListener('online', function () { probe(); });
  window.addEventListener('offline', function () { setOnline(false); });

  /* ======================= PEMBUNGKUS FETCH ======================= */
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    var x;
    try { x = new URL(url, location.href); } catch (e) { return rawFetch(input, init); }
    var supa = /\.supabase\.co$/.test(x.hostname);
    var rest = supa && x.pathname.indexOf('/rest/v1/') === 0;
    var authp = supa && x.pathname.indexOf('/auth/v1/') === 0;
    if (!rest && !authp) return rawFetch(input, init);
    if (typeof input !== 'string' && !init) return rawFetch(input, init);   // objek Request: lewatkan

    var m = String(sama(input, init, 'method') || 'GET').toUpperCase();
    var h = new Headers(sama(input, init, 'headers') || {});
    var body = init && init.body;
    var sub = subDari(h);
    if (!supaOrigin) supaOrigin = x.origin;
    if (!supaKey && h.get('apikey')) supaKey = h.get('apikey');

    /* ---- Auth: simpan & pakai ulang token agar sesi tidak putus saat offline ---- */
    if (authp) {
      if (x.pathname === '/auth/v1/token' && m === 'POST') {
        try {
          if (!online && x.search.indexOf('grant_type=refresh_token') >= 0) throw new TypeError('offline');
          var ra = await rawFetch(input, init);
          if (ra.ok) ra.clone().text().then(function (t) { cacheSet({ key: 'auth-token', text: t }); });
          return ra;
        } catch (e) {
          if (!isNetErr(e) || x.search.indexOf('grant_type=refresh_token') < 0) throw e;
          if (online) setOnline(false);
          var c = await cacheGet('auth-token');
          if (!c || !c.text) throw e;
          var j; try { j = JSON.parse(c.text); } catch (e2) { throw e; }
          var minta = ''; try { minta = JSON.parse(body || '{}').refresh_token; } catch (e3) {}
          if (minta && j.refresh_token && minta !== j.refresh_token) throw e;   // jangan serahkan sesi orang lain
          j.expires_in = 60; delete j.expires_at;       // pendek: segera dicoba perbarui lagi saat online
          return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json', 'x-pdp-offline': 'auth' } });
        }
      }
      if (x.pathname === '/auth/v1/logout') {
        try { return await rawFetch(input, init); }
        finally { cacheClear(); }
      }
      if (x.pathname === '/auth/v1/user' && m === 'GET') return bacaDenganCache(input, init, sub + '|auth-user');
      return rawFetch(input, init);
    }

    /* ---- REST ---- */
    var isRpc = x.pathname.indexOf('/rest/v1/rpc/') === 0;
    var rpcNama = isRpc ? x.pathname.split('/').pop() : '';
    var tulis = !isRpc && (m === 'POST' || m === 'PATCH' || m === 'PUT' || m === 'DELETE');
    var bacaBisa = (m === 'GET') || (isRpc && m === 'POST' && RPC_BACA[rpcNama] === 1);

    if (bacaBisa) {
      var key = sub + '|' + m + '|' + x.pathname + x.search + '|' + (isRpc && typeof body === 'string' ? body : '');
      return bacaDenganCache(input, init, key);
    }

    if (tulis) {
      if (online) {
        try { return await rawFetch(input, init); }
        catch (e) { if (!isNetErr(e)) throw e; setOnline(false); }
      }
      if (body != null && typeof body !== 'string') throw new TypeError('Failed to fetch');   // FormData/Blob tidak bisa diantre
      var hh = {}; h.forEach(function (v, k) { hh[k] = v; });
      try {
        await qAdd({ method: m, url: x.href, headers: hh, body: body == null ? null : body, sub: sub, ts: Date.now(), tabel: tabelDari(x.href) });
      } catch (e) { throw new TypeError('Failed to fetch'); }   // penyimpanan penuh/ditolak: perlakukan sebagai gagal
      await segarkanJumlah();
      return responPalsu(m, h, body);
    }

    return rawFetch(input, init);   // RPC tulis, dll: perilaku normal (gagal bila offline)
  };

  async function bacaDenganCache(input, init, key) {
    if (jumlah.pending > 0 && online && flushJalan) { await Promise.race([flushJalan, sleep(3000)]); }   // antrean dikirim dulu agar data mutakhir
    if (!online) return dariCache(key);
    try {
      var r = await denganWaktu(rawFetch(input, init), 12000);
      if (r.ok) {
        r.clone().text().then(function (t) {
          if (t.length < 8e6) cacheSet({ key: key, text: t, status: r.status,
            headers: { 'content-type': r.headers.get('content-type'), 'content-range': r.headers.get('content-range') } });
        });
      }
      return r;
    } catch (e) {
      if (isNetErr(e)) {
        var s = await dariCache(key).catch(function () { return null; });
        if (s) { setOnline(false); return s; }
      }
      throw e;
    }
  }

  /* ======================= ANTREAN -> SERVER ======================= */
  async function tokenSegar(sub) {
    try {
      if (typeof supabaseClient === 'undefined') return null;
      var r = await denganWaktu(supabaseClient.auth.getSession(), 3000);
      var s = r && r.data && r.data.session;
      return s && s.user && s.user.id === sub ? s.access_token : null;
    } catch (e) { return null; }
  }

  function flush() {
    if (flushJalan) return flushJalan;
    flushJalan = (async function () {
      var daftar = await qAll();
      if (!daftar.length || !online) return;
      syncing = true; render();
      var terkirim = 0;
      try {
        daftar.sort(function (a, b) { return a.id - b.id; });
        for (var i = 0; i < daftar.length; i++) {
          var it = daftar[i], hd = {};
          Object.keys(it.headers || {}).forEach(function (k) { hd[k] = it.headers[k]; });
          var tk = await tokenSegar(it.sub);
          if (tk) hd['authorization'] = 'Bearer ' + tk;
          var res;
          try { res = await denganWaktu(rawFetch(it.url, { method: it.method, headers: hd, body: it.body }), 30000); }
          catch (e) { if (isNetErr(e)) { online = false; break; } throw e; }
          if (res.ok) { await qDel(it.id); terkirim++; continue; }
          if (res.status >= 500 || res.status === 429 || res.status === 408) break;      // server sibuk: coba lagi nanti, urutan dijaga
          var err = ''; try { err = (await res.text()).slice(0, 300); } catch (e) {}
          await qDel(it.id);
          await fAdd({ id: it.id, ts: it.ts, method: it.method, url: it.url, headers: it.headers, body: it.body, sub: it.sub,
            tabel: it.tabel, status: res.status, error: err });
        }
        lastSync = Date.now();
      } finally {
        syncing = false; flushJalan = null;
        await segarkanJumlah();
        if (terkirim) toast(terkirim + ' data offline berhasil dikirim ke server.');
      }
    })();
    lastCoba = Date.now();
    return flushJalan;
  }

  async function segarkanJumlah() {
    jumlah.pending = (await qAll()).length;
    jumlah.failed = (await fAll()).length;
    render();
  }

  setInterval(function () {
    if (!online) probe();
    else if (jumlah.pending > 0 && !flushJalan && Date.now() - lastCoba > 30000) flush();
  }, 10000);

  /* ======================= INDIKATOR ======================= */
  var el, pill, panel, tampilToast = 0;
  function css() {
    var s = document.createElement('style');
    s.textContent =
      '#pdpNet{position:fixed;left:14px;bottom:14px;z-index:2147483000;font:600 12px/1.2 "Plus Jakarta Sans",system-ui,Segoe UI,Arial,sans-serif;display:none}' +
      '@media (max-width:768px){#pdpNet{bottom:78px;left:10px}}' +
      '#pdpNet.tampil{display:block}' +
      '#pdpNet button.pill{display:flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:8px 13px;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.28);font:inherit}' +
      '#pdpNet .dot{width:9px;height:9px;border-radius:50%;background:#fff;flex:none}' +
      '#pdpNet.on button.pill{background:#16a34a}#pdpNet.off button.pill{background:#dc2626}#pdpNet.sync button.pill{background:#d97706}' +
      '#pdpNet.sync .dot{animation:pdpBlink 1s infinite}@keyframes pdpBlink{50%{opacity:.25}}' +
      '#pdpNet .panel{position:absolute;left:0;bottom:44px;width:min(330px,86vw);max-height:60vh;overflow:auto;background:#fff;color:#0f172a;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.3);padding:14px;display:none;font-weight:500}' +
      '#pdpNet .panel.open{display:block}#pdpNet h4{margin:0 0 6px;font-size:13px}#pdpNet p{margin:0 0 8px;color:#475569}' +
      '#pdpNet ul{list-style:none;margin:0 0 8px;padding:0}#pdpNet li{padding:6px 8px;border-radius:8px;background:#f1f5f9;margin-bottom:4px;font-size:11.5px}' +
      '#pdpNet li.gagal{background:#fee2e2}#pdpNet li small{display:block;color:#64748b;word-break:break-word}' +
      '#pdpNet .btn{border:0;border-radius:8px;padding:6px 10px;background:#1673e0;color:#fff;font:600 11.5px system-ui,sans-serif;cursor:pointer;margin:2px 4px 0 0}' +
      '#pdpNet .btn.abu{background:#64748b}' +
      '#pdpToast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483001;max-width:90vw;padding:10px 16px;border-radius:10px;background:#0b2b4f;color:#fff;font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)}' +
      '@media print{#pdpNet,#pdpToast{display:none!important}}';
    document.head.appendChild(s);
  }
  function toast(teks) {
    if (!document.body) return;
    var t = document.getElementById('pdpToast');
    if (t) t.remove();
    t = document.createElement('div'); t.id = 'pdpToast'; t.setAttribute('role', 'status'); t.textContent = teks;
    document.body.appendChild(t);
    var id = ++tampilToast;
    setTimeout(function () { if (id === tampilToast && t.parentNode) t.remove(); }, 4000);
  }
  function jam(t) { return new Date(t).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function render() {
    if (!el) return;
    var teks, kelas;
    if (!online) { kelas = 'off'; teks = 'Tidak ada koneksi' + (jumlah.pending ? ' · ' + jumlah.pending + ' data tersimpan' : ''); }
    else if (syncing || jumlah.pending) { kelas = 'sync'; teks = 'Menyinkronkan ' + jumlah.pending + ' data…'; }
    else { kelas = 'on'; teks = 'Terhubung'; }
    if (jumlah.failed) teks += ' · ⚠ ' + jumlah.failed + ' gagal';
    var perlu = !online || jumlah.pending || jumlah.failed || syncing;
    el.className = kelas + (perlu ? ' tampil' : '');
    pill.querySelector('span.t').textContent = teks;
    if (panel.classList.contains('open')) isiPanel();
  }
  async function isiPanel() {
    var pending = await qAll(), failed = await fAll();
    var h = '<h4>' + (online ? 'Terhubung ke server' : 'Mode offline') + '</h4>';
    h += online
      ? '<p>Data tersimpan langsung ke server.' + (lastSync ? ' Sinkron terakhir: ' + jam(lastSync) + '.' : '') + '</p>'
      : '<p>Perubahan Anda <b>disimpan di perangkat ini</b> dan dikirim otomatis saat koneksi kembali. Data yang tampil adalah salinan terakhir saat online.</p>';
    if (pending.length) {
      h += '<b>Menunggu dikirim (' + pending.length + ')</b><ul>';
      pending.slice(0, 30).forEach(function (x) { h += '<li>' + esc(x.method) + ' · ' + esc(x.tabel) + '<small>' + jam(x.ts) + '</small></li>'; });
      h += '</ul>';
    }
    if (failed.length) {
      h += '<b>Gagal dikirim (' + failed.length + ')</b><ul>';
      failed.forEach(function (x) {
        h += '<li class="gagal">' + esc(x.method) + ' · ' + esc(x.tabel) + ' (HTTP ' + esc(x.status) + ')<small>' + esc(x.error) + '</small>' +
          '<button class="btn" data-a="retry" data-id="' + x.id + '">Coba lagi</button><button class="btn abu" data-a="hapus" data-id="' + x.id + '">Hapus</button></li>';
      });
      h += '</ul>';
    }
    h += '<button class="btn" data-a="flush">Kirim sekarang</button>';
    panel.innerHTML = h;
  }
  function buat() {
    css();
    el = document.createElement('div'); el.id = 'pdpNet'; el.setAttribute('data-pdp-noprint', '');
    el.innerHTML = '<div class="panel"></div><button class="pill" type="button"><i class="dot"></i><span class="t">Terhubung</span></button>';
    document.body.appendChild(el);
    pill = el.querySelector('button.pill'); panel = el.querySelector('.panel');
    pill.addEventListener('click', function () { panel.classList.toggle('open'); if (panel.classList.contains('open')) isiPanel(); });
    panel.addEventListener('click', async function (e) {
      var b = e.target.closest('button[data-a]'); if (!b) return;
      var a = b.getAttribute('data-a'), id = Number(b.getAttribute('data-id'));
      if (a === 'flush') { await probe(); await flush(); }
      if (a === 'retry') {
        var x = await fGet(id);
        if (x) { delete x.status; delete x.error; await fDel(id); await qAdd({ method: x.method, url: x.url, headers: x.headers, body: x.body, sub: x.sub, ts: x.ts, tabel: x.tabel }); flush(); }
      }
      if (a === 'hapus' && confirm('Hapus data yang gagal ini? Perubahan tersebut tidak akan terkirim.')) await fDel(id);
      await segarkanJumlah(); isiPanel();
    });
    document.addEventListener('click', function (e) { if (!el.contains(e.target)) panel.classList.remove('open'); });
    segarkanJumlah();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buat); else buat();

  /* ======================= AWAL ======================= */
  // Tidak ada sesi login di perangkat -> buang salinan data milik pengguna sebelumnya.
  if (!adaSesi()) cacheClear();
  // Kirim sisa antrean (mis. dari sesi sebelumnya) begitu halaman terbuka & online.
  qAll().then(function (q) { jumlah.pending = q.length; if (q.length && online) setTimeout(flush, 1500); });

  window.pdpOffline = { flush: flush, status: function () { return { online: online, pending: jumlah.pending, failed: jumlah.failed, lastSync: lastSync }; } };
})();
