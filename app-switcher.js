/* app-switcher.js
 * -----------------------------------------------------------------
 * Menu "Aplikasi" di topbar (menggantikan deretan tombol lepas
 * "Menu Utama / E-Rapor / Buku Induk / Catatan Pelanggaran / ...").
 *
 *  - Satu tombol "Aplikasi" -> panel berisi SEMUA aplikasi sesuai peran:
 *      Guru  : Menu Utama, E-Rapor, Buku Induk, Nilai PKL, Supervisi, Catatan Pelanggaran
 *      Admin : semua milik guru versi admin + Pengaturan Sekolah + Log Aktivitas
 *  - Aplikasi yang sedang dibuka diberi tanda.
 *  - Kepala Sekolah tidak diubah (memakai kepsek-nav.js).
 *  - Di HP tetap memakai bottomnav.js (tombol ini ikut disembunyikan
 *    lewat kelas .topbar__app seperti sebelumnya).
 *
 * Harus dimuat SETELAH supabase-client.js. Aman dipasang di halaman mana pun.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  var APP_GURU = [
    { href: 'portal.html',          judul: 'Menu Utama',          ikon: 'layout-grid',        warna: 'teal',   desc: 'Beranda semua aplikasi' },
    { href: 'guru.html',            judul: 'E-Rapor',             ikon: 'file-text',          warna: 'hijau',  desc: 'Nilai, presensi & cetak rapor' },
    { href: 'bukuinduk-guru.html',  judul: 'Buku Induk',          ikon: 'book-user',          warna: 'oranye', desc: 'Data induk siswa kelas wali' },
    { href: 'pkl.html',             judul: 'Nilai PKL',           ikon: 'briefcase-business', warna: 'biru',   desc: 'Pengolahan nilai PKL' },
    { href: 'supervisi.html',       judul: 'Supervisi',           ikon: 'clipboard-check',    warna: 'ungu',   desc: 'Jadwal & form supervisi' },
    { href: 'pelanggaran.html',     judul: 'Catatan Pelanggaran', ikon: 'shield-alert',       warna: 'merah',  desc: 'Pembinaan kedisiplinan siswa' }
  ];
  var APP_ADMIN = [
    { href: 'portal.html',            judul: 'Menu Utama',          ikon: 'layout-grid',        warna: 'teal',   desc: 'Beranda semua aplikasi' },
    { href: 'admin.html',             judul: 'E-Rapor',             ikon: 'file-text',          warna: 'hijau',  desc: 'Kelas, siswa, nilai & rapor' },
    { href: 'bukuinduk-admin.html',   judul: 'Buku Induk',          ikon: 'book-user',          warna: 'oranye', desc: 'Data induk seluruh siswa' },
    { href: 'pkl.html',               judul: 'Nilai PKL',           ikon: 'briefcase-business', warna: 'biru',   desc: 'Pembimbing, penguji & rekap' },
    { href: 'supervisi-admin.html',   judul: 'Supervisi',           ikon: 'clipboard-check',    warna: 'ungu',   desc: 'Jadwal, form & data supervisi' },
    { href: 'pelanggaran.html',       judul: 'Catatan Pelanggaran', ikon: 'shield-alert',       warna: 'merah',  desc: 'Pembinaan kedisiplinan siswa' },
    { href: 'pengaturan-admin.html',  judul: 'Pengaturan Sekolah',  ikon: 'settings',           warna: 'abu',    desc: 'Profil, tahun ajaran, kelulusan' },
    { href: 'log-admin.html',         judul: 'Log Aktivitas',       ikon: 'history',            warna: 'slate',  desc: 'Siapa melakukan apa & kapan' }
  ];

  // Halaman yang pasti milik satu peran (dipakai agar menu langsung tampil tanpa menunggu cek role).
  var HALAMAN_ADMIN = ['admin.html', 'bukuinduk-admin.html', 'supervisi-admin.html', 'pengaturan-admin.html', 'log-admin.html'];
  var HALAMAN_GURU = ['guru.html', 'bukuinduk-guru.html', 'supervisi.html'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function berkasIni() { return (location.pathname.split('/').pop() || 'index.html').toLowerCase(); }

  function pasangGaya() {
    if (document.getElementById('asStyle')) return;
    var st = document.createElement('style');
    st.id = 'asStyle';
    st.textContent =
      '.topbar__app[data-as-hidden]{display:none !important;}' +
      '.as-wrap{position:relative;display:inline-flex;}' +
      '.topbar .as-btn.topbar__app{background:linear-gradient(135deg,#14b8a6,#0d9488);border-color:#0d9488;color:#fff;' +
        'box-shadow:0 4px 12px -3px rgba(13,148,136,.45);font-weight:700;cursor:pointer;gap:7px;}' +
      '.topbar .as-btn.topbar__app:hover{background:linear-gradient(135deg,#2dd4bf,#0f766e);border-color:#0f766e;color:#fff;}' +
      '.topbar .as-btn.topbar__app:focus-visible{outline:2px solid #5eead4;outline-offset:2px;}' +
      '.topbar .as-btn.topbar__app svg,.topbar .as-btn.topbar__app i{color:#ccfbf1;}' +
      '.as-btn .as-caret{transition:transform .15s ease;}' +
      '.as-btn[aria-expanded="true"] .as-caret{transform:rotate(180deg);}' +
      '.as-panel{position:absolute;top:calc(100% + 8px);left:0;z-index:60;width:min(560px,92vw);padding:10px;' +
        'background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-radius:16px;' +
        'box-shadow:0 18px 40px -12px rgba(15,23,42,.28);display:none;}' +
      '.as-panel.is-open{display:block;animation:asIn .14s ease-out;}' +
      '@keyframes asIn{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}' +
      '.as-head{padding:4px 8px 8px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint,#94a3b8);}' +
      '.as-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}' +
      '.as-item{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:12px;text-decoration:none;color:var(--ink,#0f172a);' +
        'border:1px solid transparent;transition:background .12s ease,border-color .12s ease;min-width:0;}' +
      '.as-item:hover{background:#f0fdfa;border-color:#99f6e4;}' +
      '.as-item.is-aktif{background:#f0fdfa;border-color:#5eead4;}' +
      '.as-ic{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}' +
      '.as-ic svg,.as-ic i{width:18px;height:18px;}' +
      '.as-t{font-size:13.5px;font-weight:700;line-height:1.25;display:flex;align-items:center;gap:6px;}' +
      '.as-d{font-size:11.5px;color:var(--ink-soft,#64748b);line-height:1.3;margin-top:1px;}' +
      '.as-now{font-size:9.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#0f766e;background:#ccfbf1;padding:1px 6px;border-radius:999px;}' +
      '.as-ic--teal{background:#ccfbf1;color:#0f766e;}.as-ic--hijau{background:#dcfce7;color:#15803d;}' +
      '.as-ic--oranye{background:#ffedd5;color:#c2410c;}.as-ic--biru{background:#dbeafe;color:#1d4ed8;}' +
      '.as-ic--ungu{background:#ede9fe;color:#6d28d9;}.as-ic--merah{background:#fee2e2;color:#b91c1c;}' +
      '.as-ic--abu{background:#e0f2fe;color:#0369a1;}.as-ic--slate{background:#f1f5f9;color:#475569;}' +
      '@media (max-width:640px){.as-panel{width:min(360px,92vw);}.as-grid{grid-template-columns:1fr;}}';
    document.head.appendChild(st);
  }

  function bangun(daftar, adaPanduan) {
    var kini = berkasIni();
    var tombolAsli = Array.prototype.slice.call(document.querySelectorAll('.topbar a.topbar__app'));
    var baris = document.querySelector('.topbar__row');
    var jangkar = tombolAsli[0] || null;
    if (!jangkar && !baris) {
      // halaman dengan topbar sederhana (mis. Supervisi): buat baris sendiri di bawah judul
      var kiri = document.querySelector('.topbar > div:first-child');
      if (!kiri) return;
      baris = document.createElement('div');
      baris.className = 'topbar__row';
      baris.style.marginTop = '6px';
      kiri.appendChild(baris);
    }
    pasangGaya();
    if (document.querySelector('.as-wrap')) return;

    var wrap = document.createElement('div');
    wrap.className = 'as-wrap';
    var items = daftar.map(function (a) {
      var aktif = a.href.toLowerCase() === kini;
      return '<a class="as-item' + (aktif ? ' is-aktif' : '') + '" href="' + esc(a.href) + '"' + (aktif ? ' aria-current="page"' : '') + '>' +
        '<span class="as-ic as-ic--' + a.warna + '"><i data-lucide="' + a.ikon + '"></i></span>' +
        '<span style="min-width:0;"><span class="as-t">' + esc(a.judul) + (aktif ? '<span class="as-now">Dibuka</span>' : '') + '</span>' +
        '<span class="as-d" style="display:block;">' + esc(a.desc) + '</span></span></a>';
    }).join('');
    wrap.innerHTML =
      '<button type="button" class="btn-small topbar__app as-btn" aria-haspopup="true" aria-expanded="false">' +
      '<i data-lucide="layout-grid" style="width:14px;height:14px;"></i> Aplikasi ' +
      '<i data-lucide="chevron-down" class="as-caret" style="width:14px;height:14px;"></i></button>' +
      '<div class="as-panel" role="menu"><div class="as-head">Pindah aplikasi</div><div class="as-grid">' + items + '</div></div>';

    if (jangkar) jangkar.parentNode.insertBefore(wrap, jangkar);
    else baris.appendChild(wrap);
    tombolAsli.forEach(function (a) { a.setAttribute('data-as-hidden', '1'); });

    var btn = wrap.querySelector('.as-btn'), panel = wrap.querySelector('.as-panel');
    function tutup() { panel.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
    function buka() { panel.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); if (panel.classList.contains('is-open')) tutup(); else buka(); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) tutup(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') tutup(); });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    // ikon lucide dibuat ulang setelah halaman selesai memuat (jaga-jaga skrip lucide telat)
    setTimeout(function () { if (window.lucide && lucide.createIcons) lucide.createIcons(); }, 600);
  }

  async function tentukanRole() {
    var berkas = berkasIni();
    var hint = null;
    if (HALAMAN_ADMIN.indexOf(berkas) >= 0) hint = 'admin';
    else if (HALAMAN_GURU.indexOf(berkas) >= 0) hint = 'guru';
    try {
      if (typeof supabaseClient === 'undefined') return hint;
      var ses = await supabaseClient.auth.getSession();
      var user = ses && ses.data && ses.data.session && ses.data.session.user;
      if (!user) return null;
      var kunci = 'as_role_' + user.id, cache = null;
      try { cache = sessionStorage.getItem(kunci); } catch (e) { /* abaikan */ }
      if (cache) return cache;
      var pr = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
      var role = pr && pr.data && pr.data.role;
      if (role) { try { sessionStorage.setItem(kunci, role); } catch (e) { /* abaikan */ } }
      return role || null;
    } catch (e) { return hint; }
  }

  async function mulai() {
    var role = await tentukanRole();
    if (role === 'admin') bangun(APP_ADMIN);
    else if (role === 'guru') bangun(APP_GURU);
    // 'kepsek' / siswa / belum login: biarkan seperti semula.
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai);
  else mulai();
})();
