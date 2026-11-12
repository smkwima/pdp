/* ijin-notif.js
 * -----------------------------------------------------------------
 * NOTIFIKASI PENGAJUAN IJIN untuk ADMIN.
 *  - Lencana angka (jumlah pengajuan yang menunggu persetujuan) pada setiap
 *    tautan ke ijin.html: kartu Menu Utama, sidebar, panel "Aplikasi",
 *    menu bawah / "Semua Aplikasi" di HP.
 *  - Pesan kecil di pojok layar saat admin membuka halaman dan ada
 *    pengajuan baru (muncul lagi bila jumlahnya bertambah).
 *  - Diperbarui tiap 90 detik dan saat tab kembali dibuka.
 *
 * Pasang di halaman pdp (setelah supabase-client.js):
 *   <script src="ijin-notif.js?v=1" defer></script>
 * Selain admin skrip ini tidak melakukan apa-apa. Bila Edge Function
 * ijin-absen / kolom status belum dipasang, skrip diam saja.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (typeof supabaseClient === 'undefined' || window.__ijinNotifAktif) return;
  window.__ijinNotifAktif = true;

  var POLLING_MS = 90000;
  var KUNCI_ROLE = 'ijn_role', KUNCI_LAST = 'ijn_last';
  var jumlah = 0, terbaru = null, pewaktu = null, pengamat = null, terjadwal = false;
  var JENIS = { sakit: 'sakit', ijin: 'ijin', dinas_luar: 'dinas luar' };

  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function berkasIni() { return (location.pathname.split('/').pop() || 'index.html').toLowerCase(); }

  function pasangGaya() {
    if (document.getElementById('ijn-style')) return;
    var st = document.createElement('style');
    st.id = 'ijn-style';
    st.textContent =
      '.ijn-badge{position:absolute;top:6px;right:8px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#f59e0b;color:#fff;font:800 11px/18px "Plus Jakarta Sans",system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff;pointer-events:none;z-index:2}' +
      '.ijn-toast{position:fixed;top:14px;right:14px;z-index:4000;max-width:min(360px,calc(100vw - 28px));display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:#fff;border:1px solid #fde68a;box-shadow:0 12px 32px rgba(0,0,0,.18);font:500 13px/1.45 "Plus Jakarta Sans",system-ui,sans-serif;color:#1f2937;animation:ijnIn .25s ease-out}' +
      '.ijn-toast__ic{flex:none;width:32px;height:32px;border-radius:10px;background:#fffbeb;color:#b45309;display:flex;align-items:center;justify-content:center;font-size:16px}' +
      '.ijn-toast b{display:block;font-weight:800;margin-bottom:2px}' +
      '.ijn-toast a{display:inline-block;margin-top:6px;font-weight:800;color:#2563eb;text-decoration:none}' +
      '.ijn-toast button{flex:none;border:0;background:transparent;color:#9ca3af;font-size:18px;line-height:1;cursor:pointer;padding:0 2px}' +
      '@keyframes ijnIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}';
    document.head.appendChild(st);
  }

  // ---------- Lencana pada tautan ijin.html ----------
  function terapkanLencana() {
    terjadwal = false;
    var tautan = document.querySelectorAll('a[href="ijin.html"]');
    for (var i = 0; i < tautan.length; i++) {
      var a = tautan[i];
      var ada = a.querySelector(':scope > .ijn-badge');
      if (!jumlah) { if (ada) ada.remove(); continue; }
      var teks = jumlah > 99 ? '99+' : String(jumlah);
      if (ada) { if (ada.textContent !== teks) ada.textContent = teks; continue; }
      try { if (getComputedStyle(a).position === 'static') a.style.position = 'relative'; } catch (e) { /* abaikan */ }
      var b = document.createElement('span');
      b.className = 'ijn-badge';
      b.setAttribute('aria-label', teks + ' pengajuan menunggu persetujuan');
      b.textContent = teks;
      a.appendChild(b);
    }
  }
  function jadwalkanLencana() {
    if (terjadwal) return;
    terjadwal = true;
    (window.requestAnimationFrame || setTimeout)(terapkanLencana);
  }
  function awasiDom() {
    if (pengamat || !window.MutationObserver) return;
    // menu aplikasi / bottomnav dibangun lewat JavaScript, jadi lencana dipasang ulang bila DOM berubah
    pengamat = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target;
        if (t && t.classList && t.classList.contains('ijn-badge')) continue;
        jadwalkanLencana(); return;
      }
    });
    pengamat.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- Pesan di pojok layar ----------
  function tampilkanPesan() {
    var terakhir = 0;
    try { terakhir = parseInt(sessionStorage.getItem(KUNCI_LAST) || '0', 10) || 0; } catch (e) { /* abaikan */ }
    if (!jumlah || jumlah <= terakhir) return;
    try { sessionStorage.setItem(KUNCI_LAST, String(jumlah)); } catch (e) { /* abaikan */ }
    if (berkasIni() === 'ijin.html') return;
    var lama = document.getElementById('ijnToast'); if (lama) lama.remove();
    var t = document.createElement('div');
    t.id = 'ijnToast'; t.className = 'ijn-toast'; t.setAttribute('role', 'status');
    var rinci = terbaru && terbaru.nama
      ? 'Terbaru: ' + esc(terbaru.nama) + (terbaru.jenis && JENIS[terbaru.jenis] ? ' (' + JENIS[terbaru.jenis] + ')' : '') + '.'
      : 'Perlu ditinjau admin.';
    t.innerHTML = '<div class="ijn-toast__ic">🔔</div><div><b>' + jumlah + ' pengajuan ijin menunggu persetujuan</b>' + rinci +
      '<br><a href="ijin.html">Tinjau sekarang →</a></div><button type="button" aria-label="Tutup">×</button>';
    t.querySelector('button').addEventListener('click', function () { t.remove(); });
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 15000);
  }

  // ---------- Ambil jumlah dari Edge Function ----------
  async function periksa() {
    if (document.hidden) return;
    try {
      var ses = await supabaseClient.auth.getSession();
      var token = ses && ses.data && ses.data.session ? ses.data.session.access_token : null;
      if (!token) return;
      var resp = await fetch(SUPABASE_URL + '/functions/v1/ijin-absen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ aksi: 'hitung' })
      });
      var out = await resp.json().catch(function () { return {}; });
      if (!resp.ok || !out.success) return;
      jumlah = out.jumlah || 0;
      terbaru = out.terbaru || null;
      // jumlah turun (sudah diproses) -> pesan baru muncul lagi bila nanti bertambah
      try { var l = parseInt(sessionStorage.getItem(KUNCI_LAST) || '0', 10) || 0; if (jumlah < l) sessionStorage.setItem(KUNCI_LAST, String(jumlah)); } catch (e) { /* abaikan */ }
      terapkanLencana();
      tampilkanPesan();
    } catch (e) { /* diam: jangan ganggu halaman */ }
  }

  async function adalahAdmin() {
    try { var c = sessionStorage.getItem(KUNCI_ROLE); if (c) return c === 'admin'; } catch (e) { /* abaikan */ }
    try {
      var ses = await supabaseClient.auth.getSession();
      var user = ses && ses.data && ses.data.session && ses.data.session.user;
      if (!user) return false;
      var pr = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
      var role = pr && pr.data ? pr.data.role : '';
      try { if (role) sessionStorage.setItem(KUNCI_ROLE, role); } catch (e) { /* abaikan */ }
      return role === 'admin';
    } catch (e) { return false; }
  }

  async function mulai() {
    if (!(await adalahAdmin())) return;
    pasangGaya(); awasiDom();
    await periksa();
    pewaktu = setInterval(periksa, POLLING_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) periksa(); });
    // dipanggil ijin.html setelah admin memproses pengajuan agar lencana ikut turun
    window.addEventListener('ijin-diproses', periksa);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai);
  else mulai();
})();
