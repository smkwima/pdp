/* offline-layer.js
 * Disisipkan otomatis ke setiap halaman HTML saat build aplikasi Windows (scripts/prepare.js).
 * Harus dimuat PALING AWAL (sebelum supabase-client.js) agar fetch milik Supabase ikut terbungkus.
 *
 *  - GET ke Supabase berhasil  -> salinan disimpan di komputer; saat offline dibaca dari salinan.
 *  - Tulis (POST/PATCH/PUT/DELETE ke /rest/v1/) saat offline -> masuk antrean di komputer,
 *    dikirim otomatis begitu koneksi kembali.
 *  - Muat ulang token login saat offline -> memakai token terakhir, sesi tidak terputus.
 *  - Pojok kanan bawah: indikator koneksi + jumlah data menunggu kirim.
 */
(function () {
  'use strict';
  if (!window.pdpDesktop || window.__pdpOffline) return;   // hanya aktif di aplikasi Windows
  window.__pdpOffline = true;

  var D = window.pdpDesktop;
  var rawFetch = window.fetch.bind(window);
  var status = { online: true, syncing: false, pending: 0, failed: 0, lastSync: null };
  var hello = false;

  // RPC yang hanya MEMBACA (boleh disalin). RPC lain tidak pernah diantre / disalin.
  var RPC_BACA = {
    supervisi_jadwal_guru: 1, pkl_penguji_binaan: 1, pkl_pembimbing_uji: 1,
    penilaian_rekan_hasil_saya: 1, penilaian_rekan_hasil: 1, penilaian_rekan_progres: 1,
    penilaian_rekan_daftar_saya: 1, pengaduan_daftar: 1, pengaduan_jumlah_baru: 1,
    nama_wali_kelas_siswa: 1
  };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function isNetErr(e) { return e && e.name !== 'AbortError' && (e instanceof TypeError || e.name === 'TypeError'); }
  function sama(i, init, k) {
    return (init && init[k]) || (i && typeof i === 'object' && i[k]) || undefined;
  }
  function subDari(h) {
    try {
      var t = (h.get('authorization') || '').replace(/^Bearer\s+/i, '');
      var p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.sub || 'anon';
    } catch (e) { return 'anon'; }
  }
  function tabelDari(u) { return u.pathname.split('/').pop(); }

  function dariCache(key) {
    return D.cacheGet(key).then(function (c) {
      if (!c) throw new TypeError('Failed to fetch');
      var h = {};
      if (c.headers) Object.keys(c.headers).forEach(function (k) { if (c.headers[k]) h[k] = c.headers[k]; });
      h['x-pdp-offline'] = 'cache';
      return new Response(c.text, { status: c.status || 200, headers: h });
    });
  }

  function responPalsu(m, h, body, u) {
    var rep = /return=representation/.test(h.get('prefer') || '');
    var objek = /vnd\.pgrst\.object/.test(h.get('accept') || '');
    var data = null;
    try { data = body ? JSON.parse(body) : null; } catch (e) {}
    var hd = { 'content-type': 'application/json', 'x-pdp-offline': 'queued' };
    if (!rep) return new Response(null, { status: m === 'POST' ? 201 : 204, headers: { 'x-pdp-offline': 'queued' } });
    var arr;
    if (m === 'POST') arr = Array.isArray(data) ? data : [data || {}];
    else arr = [data || {}];                   // PATCH/PUT/DELETE: anggap 1 baris terdampak
    return new Response(JSON.stringify(objek ? arr[0] : arr), { status: m === 'POST' ? 201 : 200, headers: hd });
  }

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

    if (!hello) { hello = true; D.hello({ supabaseUrl: x.origin }); }
    if (h.get('authorization')) D.auth({ sub: sub, authorization: h.get('authorization'), apikey: h.get('apikey') });

    // ---- Auth: simpan & pakai ulang token agar sesi tidak putus saat offline ----
    if (authp) {
      if (x.pathname === '/auth/v1/token' && m === 'POST') {
        try {
          var ra = await rawFetch(input, init);
          if (ra.ok) ra.clone().text().then(function (t) { D.cacheSet({ key: 'auth-token', text: t, status: 200, headers: { 'content-type': 'application/json' } }); });
          return ra;
        } catch (e) {
          if (!isNetErr(e) || x.search.indexOf('grant_type=refresh_token') < 0) throw e;
          var c = await D.cacheGet('auth-token');
          if (!c) throw e;
          var j = JSON.parse(c.text); j.expires_in = 60; delete j.expires_at;   // pendek: segera dicoba perbarui lagi saat online
          return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json', 'x-pdp-offline': 'auth' } });
        }
      }
      if (x.pathname === '/auth/v1/logout') D.cacheSet({ key: 'auth-token', text: '' });
      if (x.pathname === '/auth/v1/user' && m === 'GET') return bacaDenganCache(input, init, sub + '|auth-user');
      return rawFetch(input, init);
    }

    // ---- REST ----
    var isRpc = x.pathname.indexOf('/rest/v1/rpc/') === 0;
    var rpcNama = isRpc ? x.pathname.split('/').pop() : '';
    var tulis = !isRpc && (m === 'POST' || m === 'PATCH' || m === 'PUT' || m === 'DELETE');
    var bacaBisa = (m === 'GET') || (isRpc && m === 'POST' && RPC_BACA[rpcNama]);

    if (bacaBisa) {
      var key = sub + '|' + m + '|' + x.pathname + x.search + '|' + (isRpc && typeof body === 'string' ? body : '');
      return bacaDenganCache(input, init, key);
    }

    if (tulis) {
      if (status.online) {
        try { return await rawFetch(input, init); }
        catch (e) { if (!isNetErr(e)) throw e; }
      }
      if (body != null && typeof body !== 'string') throw new TypeError('Failed to fetch');   // FormData/Blob tidak bisa diantre
      var hh = {}; h.forEach(function (v, k) { hh[k] = v; });
      await D.enqueue({ method: m, url: x.href, headers: hh, body: body == null ? null : body, sub: sub });
      return responPalsu(m, h, body, x);
    }

    return rawFetch(input, init);   // RPC tulis, dll: perilaku normal (gagal bila offline)
  };

  async function bacaDenganCache(input, init, key) {
    if (status.pending > 0 && status.online) { await Promise.race([D.flush(), sleep(3000)]); }   // kirim antrean dulu agar data tampil mutakhir
    if (!status.online) return dariCache(key);
    try {
      var r = await rawFetch(input, init);
      if (r.ok) {
        r.clone().text().then(function (t) {
          if (t.length < 8e6) D.cacheSet({ key: key, text: t, status: r.status,
            headers: { 'content-type': r.headers.get('content-type'), 'content-range': r.headers.get('content-range') } });
        });
      }
      return r;
    } catch (e) {
      if (isNetErr(e)) return dariCache(key);
      throw e;
    }
  }

  // ======================= INDIKATOR KONEKSI =======================
  var pill, panel;
  function css() {
    var s = document.createElement('style');
    s.textContent =
      '#pdpNet{position:fixed;right:14px;bottom:14px;z-index:2147483000;font:600 12px/1.2 "Plus Jakarta Sans",Segoe UI,Arial,sans-serif}' +
      '#pdpNet button.pill{display:flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:8px 13px;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.28);font:inherit}' +
      '#pdpNet .dot{width:9px;height:9px;border-radius:50%;background:#fff;flex:none}' +
      '#pdpNet.on button.pill{background:#16a34a}#pdpNet.off button.pill{background:#dc2626}#pdpNet.sync button.pill{background:#d97706}' +
      '#pdpNet.sync .dot{animation:pdpBlink 1s infinite}@keyframes pdpBlink{50%{opacity:.25}}' +
      '#pdpNet .panel{position:absolute;right:0;bottom:44px;width:330px;max-height:60vh;overflow:auto;background:#fff;color:#0f172a;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.3);padding:14px;display:none;font-weight:500}' +
      '#pdpNet .panel.open{display:block}#pdpNet h4{margin:0 0 6px;font-size:13px}#pdpNet p{margin:0 0 8px;color:#475569}' +
      '#pdpNet ul{list-style:none;margin:0 0 8px;padding:0}#pdpNet li{padding:6px 8px;border-radius:8px;background:#f1f5f9;margin-bottom:4px;font-size:11.5px}' +
      '#pdpNet li.gagal{background:#fee2e2}#pdpNet li small{display:block;color:#64748b;word-break:break-word}' +
      '#pdpNet .btn{border:0;border-radius:8px;padding:6px 10px;background:#1673e0;color:#fff;font:600 11.5px inherit;cursor:pointer;margin:2px 4px 0 0}' +
      '#pdpNet .btn.abu{background:#64748b}';
    document.head.appendChild(s);
  }
  function jam(t) { return new Date(t).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }); }
  function render() {
    if (!pill) return;
    var el = pill.parentNode, teks, kelas;
    if (!status.online) { kelas = 'off'; teks = 'Tidak ada koneksi' + (status.pending ? ' · ' + status.pending + ' data tersimpan' : ''); }
    else if (status.syncing || status.pending) { kelas = 'sync'; teks = 'Menyinkronkan ' + status.pending + ' data…'; }
    else { kelas = 'on'; teks = 'Terhubung'; }
    if (status.failed) teks += ' · ⚠ ' + status.failed + ' gagal';
    el.className = kelas;
    pill.querySelector('span.t').textContent = teks;
    if (panel.classList.contains('open')) isiPanel();
  }
  async function isiPanel() {
    var info = await D.info();
    var h = '<h4>' + (status.online ? 'Terhubung ke server' : 'Mode offline') + '</h4>';
    h += status.online
      ? '<p>Data tersimpan langsung ke server.' + (status.lastSync ? ' Sinkron terakhir: ' + jam(status.lastSync) + '.' : '') + '</p>'
      : '<p>Perubahan Anda <b>disimpan di komputer ini</b> dan dikirim otomatis saat koneksi kembali. Data yang tampil adalah salinan terakhir saat online.</p>';
    if (info.pending.length) {
      h += '<b>Menunggu dikirim (' + info.pending.length + ')</b><ul>';
      info.pending.slice(0, 30).forEach(function (x) { h += '<li>' + x.method + ' · ' + x.tabel + '<small>' + jam(x.ts) + '</small></li>'; });
      h += '</ul>';
    }
    if (info.failed.length) {
      h += '<b>Gagal dikirim (' + info.failed.length + ')</b><ul>';
      info.failed.forEach(function (x) {
        h += '<li class="gagal">' + x.method + ' · ' + x.tabel + ' (HTTP ' + x.status + ')<small>' + String(x.error || '').replace(/</g, '&lt;') + '</small>' +
          '<button class="btn" data-a="retry" data-id="' + x.id + '">Coba lagi</button><button class="btn abu" data-a="hapus" data-id="' + x.id + '">Hapus</button></li>';
      });
      h += '</ul>';
    }
    h += '<button class="btn" data-a="flush">Kirim sekarang</button>';
    panel.innerHTML = h;
  }
  function buat() {
    css();
    var el = document.createElement('div'); el.id = 'pdpNet';
    el.innerHTML = '<div class="panel"></div><button class="pill" type="button"><i class="dot"></i><span class="t">Terhubung</span></button>';
    document.body.appendChild(el);
    pill = el.querySelector('button.pill'); panel = el.querySelector('.panel');
    pill.addEventListener('click', function () { panel.classList.toggle('open'); if (panel.classList.contains('open')) isiPanel(); });
    panel.addEventListener('click', async function (e) {
      var b = e.target.closest('button[data-a]'); if (!b) return;
      var a = b.getAttribute('data-a'), id = b.getAttribute('data-id');
      if (a === 'flush') await D.flush();
      if (a === 'retry') await D.retry(id);
      if (a === 'hapus' && confirm('Hapus data yang gagal ini? Perubahan tersebut tidak akan terkirim.')) await D.discard(id);
      isiPanel();
    });
    document.addEventListener('click', function (e) { if (!el.contains(e.target)) panel.classList.remove('open'); });
    D.status().then(function (s) { status = s; render(); });
    D.onStatus(function (s) { status = s; render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buat); else buat();
  D.status().then(function (s) { status = s; });
  D.onStatus(function (s) { status = s; });
})();
