/* bottomnav.js
 * -----------------------------------------------------------------
 * Menu aplikasi (Menu Utama, Buku Induk, E-Rapor, PKL, Supervisi,
 * Pelanggaran) tampil sebagai BAR BAWAH di layar HP: hanya 3 tombol = 2 aplikasi yang
 * paling sering dibuka + tombol "Semua Aplikasi" (panel berisi seluruh aplikasi) (<= 860px, sama
 * dengan breakpoint laci menu di mobile.js). Di desktop tidak ada
 * perubahan sama sekali.
 *
 * Dipakai di halaman guru & admin: portal, guru, admin, bukuinduk-guru,
 * bukuinduk-admin, pkl, supervisi, supervisi-admin, pelanggaran.
 *
 * Tujuan tiap tombol mengikuti role (admin / guru). Role diambil dari
 * nama file halaman bila jelas (mis. admin.html), kalau tidak dari
 * tabel profiles (di-cache di sessionStorage per user).
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  var BREAKPOINT = 860;

  var IKON = {
    menu: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    bi: '<path d="M15 13a3 3 0 1 0-6 0"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><circle cx="12" cy="8" r="2"/>',
    rapor: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    gp: '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
    pkl: '<path d="M12 12h.01"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M22 13a18.15 18.15 0 0 1-20 0"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    sup: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    kin: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
    pel: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>'
  };

  // ikon tambahan untuk panel "Semua Aplikasi"
  IKON.rpp = '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>';
  IKON.set = '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>';
  IKON.log = '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>';

  IKON.semua = IKON.menu;
  IKON.menu = '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';

  // ---------- halaman ini ----------
  var berkas = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var kunciAktif = null;
  var roleDariBerkas = null;
  if (berkas === 'portal.html') { kunciAktif = 'menu'; }
  else if (berkas === 'bukuinduk-admin.html') { kunciAktif = 'bi'; roleDariBerkas = 'admin'; }
  else if (berkas === 'bukuinduk-guru.html') { kunciAktif = 'bi'; roleDariBerkas = 'guru'; }
  else if (berkas === 'admin.html') { kunciAktif = 'rapor'; roleDariBerkas = 'admin'; }
  else if (berkas === 'guru.html') { kunciAktif = 'rapor'; roleDariBerkas = 'guru'; }
  else if (berkas === 'guru-penugasan.html') { kunciAktif = 'gp'; roleDariBerkas = 'kepsek'; }
  else if (berkas === 'penugasan-admin.html') { kunciAktif = 'gp'; roleDariBerkas = 'admin'; }
  else if (berkas === 'pkl.html') { kunciAktif = 'pkl'; }
  else if (berkas === 'supervisi-admin.html') { kunciAktif = 'sup'; roleDariBerkas = 'admin'; }
  else if (berkas === 'supervisi.html') { kunciAktif = 'sup'; roleDariBerkas = 'guru'; }
  else if (berkas === 'kinerja.html') { kunciAktif = 'kin'; }
  else if (berkas === 'pelanggaran.html') { kunciAktif = 'pel'; }
  else { return; } // halaman lain (login, siswa, dll): tidak dipasang

  // Daftar lengkap aplikasi per peran. "bar" = boleh jadi 1 dari 2 tombol aplikasi di bar bawah;
  // "sheetSaja" = hanya ada di panel "Semua Aplikasi" (halamannya tidak memasang bar bawah).
  function daftar(role) {
    var admin = role === 'admin' || role === 'kepsek'; // kepsek memakai halaman admin (mode lihat saja)
    var menu = [
      { k: 'menu',  label: 'Menu Utama',  judul: 'Menu Utama',          href: 'portal.html', warna: 'teal' },
      { k: 'bi',    label: 'Buku Induk',  judul: 'Buku Induk',          href: admin ? 'bukuinduk-admin.html' : 'bukuinduk-guru.html', warna: 'oranye' },
      { k: 'rapor', label: 'E-Rapor',     judul: 'E-Rapor',             href: admin ? 'admin.html' : 'guru.html', warna: 'hijau' },
      { k: 'gp',    label: 'Guru',        judul: 'Guru & Penugasan',    href: role === 'kepsek' ? 'guru-penugasan.html' : 'penugasan-admin.html', warna: 'biru', hanyaPimpinan: true },
      { k: 'pkl',   label: 'PKL',         judul: 'Nilai PKL',           href: 'pkl.html', warna: 'biru' },
      { k: 'rpp',   label: 'RPP Maker',   judul: 'RPP Maker',           href: '#', sso: true, warna: 'ungu' },
      { k: 'sup',   label: 'Supervisi',   judul: 'Supervisi',           href: admin ? 'supervisi-admin.html' : 'supervisi.html', warna: 'ungu' },
      { k: 'kin',   label: 'Kinerja',     judul: admin ? 'Kinerja Guru' : 'Kinerja Saya', href: 'kinerja.html', warna: 'oranye' },
      { k: 'pel',   label: 'Pelanggaran', judul: 'Catatan Pelanggaran', href: 'pelanggaran.html', warna: 'merah' },
      { k: 'set',   label: 'Pengaturan',  judul: 'Pengaturan Sekolah',  href: 'pengaturan-admin.html', warna: 'abu', sheetSaja: true, hanyaAdmin: true },
      { k: 'log',   label: 'Log',         judul: 'Log Aktivitas',       href: 'log-admin.html', warna: 'slate', sheetSaja: true, hanyaAdmin: true }
    ];
    return menu.filter(function (it) {
      if (it.hanyaAdmin && role !== 'admin') return false;
      return !it.hanyaPimpinan || role === 'kepsek' || role === 'admin';
    });
  }

  // ---------- aplikasi yang sering dipilih ----------
  // Dihitung per peran, disimpan di perangkat ini (localStorage). Tiap kali halaman
  // aplikasi dibuka (atau RPP Maker diklik) hitungannya naik 1. Bar bawah menampilkan
  // 2 aplikasi dengan hitungan tertinggi; sebelum ada riwayat: Buku Induk dan E-Rapor.
  var FREQ_PREFIX = 'bnav_freq_v1_';
  function bacaFreq(role) {
    try { return JSON.parse(localStorage.getItem(FREQ_PREFIX + role) || '{}') || {}; } catch (e) { return {}; }
  }
  function catat(role, k) {
    if (!k || k === 'menu') return;
    var f = bacaFreq(role);
    f[k] = (f[k] || 0) + 1;
    try { localStorage.setItem(FREQ_PREFIX + role, JSON.stringify(f)); } catch (e) { /* abaikan */ }
  }
  function pilihDua(items, role) {
    var f = bacaFreq(role);
    var kandidat = items.filter(function (it) { return it.k !== 'menu' && !it.sheetSaja; });
    var urut = kandidat.map(function (it, i) { return { it: it, n: f[it.k] || 0, i: i }; })
      .sort(function (a, b) { return (b.n - a.n) || (a.i - b.i); })
      .slice(0, 2)
      .map(function (x) { return x.it; });
    // urutan tampil mengikuti urutan daftar (bukan peringkat) supaya posisi tombol tidak berpindah-pindah
    return kandidat.filter(function (it) { return urut.indexOf(it) >= 0; });
  }

  // ---------- gaya (disisipkan lewat JS supaya tidak tergantung versi style.css) ----------
  function pasangGaya() {
    if (document.getElementById('bottomnavStyle')) return;
    var st = document.createElement('style');
    st.id = 'bottomnavStyle';
    st.textContent =
      '.bnav,.bnav-sheet{display:none;}' +
      '@media screen and (max-width:' + BREAKPOINT + 'px){' +
        'body.has-bnav{padding-bottom:calc(66px + env(safe-area-inset-bottom,0px));}' +
        '.bnav{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:50;' +
          'background:rgba(255,255,255,.97);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);' +
          'border-top:1px solid var(--border,#e2e8f0);box-shadow:0 -6px 20px -8px rgba(15,23,42,.18);' +
          'padding:0 2px env(safe-area-inset-bottom,0px);}' +
        '.bnav__item{position:relative;flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
          'gap:3px;padding:8px 1px 7px;text-decoration:none;color:var(--ink-soft,#64748b);font-size:10px;font-weight:600;line-height:1.15;' +
          'text-align:center;-webkit-tap-highlight-color:transparent;background:none;border:0;font-family:inherit;cursor:pointer;}' +
        '.bnav__item svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;}' +
        '.bnav__item span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
        '.bnav__item.is-active{color:var(--primary,#4f46e5);font-weight:800;}' +
        '.bnav__item.is-active::before{content:"";position:absolute;top:-1px;left:24%;right:24%;height:2.5px;' +
          'background:var(--primary,#4f46e5);border-radius:0 0 3px 3px;}' +
        /* panel "Semua Aplikasi" (lembar dari bawah) */
        '.bnav-sheet.is-open{display:block;position:fixed;inset:0;z-index:70;}' +
        '.bnav-sheet__bg{position:absolute;inset:0;background:rgba(15,23,42,.45);}' +
        '.bnav-sheet__box{position:absolute;left:0;right:0;bottom:0;max-height:82vh;overflow:auto;background:var(--surface,#fff);' +
          'border-radius:18px 18px 0 0;padding:14px 14px calc(16px + env(safe-area-inset-bottom,0px));' +
          'box-shadow:0 -12px 32px -10px rgba(15,23,42,.35);animation:bnavUp .16s ease-out;}' +
        '@keyframes bnavUp{from{transform:translateY(24px);opacity:.6;}to{transform:none;opacity:1;}}' +
        '.bnav-sheet__head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}' +
        '.bnav-sheet__title{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint,#94a3b8);}' +
        '.bnav-sheet__x{border:0;background:#f1f5f9;color:#475569;width:30px;height:30px;border-radius:999px;font-size:18px;line-height:1;cursor:pointer;}' +
        '.bnav-sheet__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}' +
        '.bnav-tile{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px 10px;border-radius:14px;text-decoration:none;' +
          'color:var(--ink,#0f172a);border:1px solid var(--border,#e2e8f0);font-size:11.5px;font-weight:700;line-height:1.2;text-align:center;' +
          '-webkit-tap-highlight-color:transparent;}' +
        '.bnav-tile.is-aktif{border-color:#5eead4;background:#f0fdfa;}' +
        '.bnav-tile__ic{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;}' +
        '.bnav-tile__ic svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}' +
        '.bnav-w-teal{background:#ccfbf1;color:#0f766e;}.bnav-w-hijau{background:#dcfce7;color:#15803d;}' +
        '.bnav-w-oranye{background:#ffedd5;color:#c2410c;}.bnav-w-biru{background:#dbeafe;color:#1d4ed8;}' +
        '.bnav-w-ungu{background:#ede9fe;color:#6d28d9;}.bnav-w-merah{background:#fee2e2;color:#b91c1c;}' +
        '.bnav-w-abu{background:#e0f2fe;color:#0369a1;}.bnav-w-slate{background:#f1f5f9;color:#475569;}' +
        /* tombol "Menu Utama" di topbar jadi mubazir karena sudah ada di bar bawah */
        '.topbar .topbar__app{display:none !important;}' +
        /* elemen melayang lain digeser naik supaya tidak tertutup bar */
        '.simpan-atas{bottom:calc(76px + env(safe-area-inset-bottom,0px)) !important;}' +
        '.pd-toast{bottom:calc(76px + env(safe-area-inset-bottom,0px)) !important;}' +
      '}';
    document.head.appendChild(st);
  }

  // pemuat modul RPP Maker (masuk otomatis tanpa login ulang), dipakai tombol RPP Maker
  function pastikanRppLauncher() {
    if (window.__rppLauncher || document.getElementById('rppLauncherScript')) return;
    var sl = document.createElement('script');
    sl.id = 'rppLauncherScript';
    sl.src = 'rpp-launcher.js';
    document.head.appendChild(sl);
  }

  function ikonSvg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + IKON[k] + '</svg>'; }
  function atributSso(it) { return it.sso ? ' data-sso="rpp"' : ''; }

  // ---------- render ----------
  var rolePakai = 'guru';
  function render(role) {
    rolePakai = role;
    var items = daftar(role);
    var dua = pilihDua(items, role);
    var adaDiBar = dua.some(function (it) { return it.k === kunciAktif; });
    pastikanRppLauncher();

    var nav = document.getElementById('bottomNavApp');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'bottomNavApp';
      nav.className = 'bnav';
      nav.setAttribute('aria-label', 'Menu aplikasi');
      document.body.appendChild(nav);
      document.body.classList.add('has-bnav');
      nav.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('#bnavSemua') : null;
        if (btn) { bukaSheet(); return; }
        var a = e.target.closest ? e.target.closest('a[data-k]') : null;
        if (a && a.getAttribute('data-k') === 'rpp') catat(rolePakai, 'rpp'); // RPP Maker pindah situs, tidak lewat halaman PDP
      });
    }
    nav.innerHTML = dua.map(function (it) {
      var aktif = it.k === kunciAktif;
      return '<a class="bnav__item' + (aktif ? ' is-active' : '') + '" href="' + it.href + '" data-k="' + it.k + '"' + atributSso(it) +
        (aktif ? ' aria-current="page"' : '') + '>' + ikonSvg(it.k) + '<span>' + it.label + '</span></a>';
    }).join('') +
      '<button type="button" id="bnavSemua" class="bnav__item' + (adaDiBar ? '' : ' is-active') + '" aria-haspopup="dialog">' +
      ikonSvg('semua') + '<span>Semua Aplikasi</span></button>';

    // panel "Semua Aplikasi"
    var sheet = document.getElementById('bnavSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'bnavSheet';
      sheet.className = 'bnav-sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-label', 'Semua aplikasi');
      document.body.appendChild(sheet);
      sheet.addEventListener('click', function (e) {
        var t = e.target;
        if (t.classList && (t.classList.contains('bnav-sheet__bg') || t.classList.contains('bnav-sheet__x'))) { tutupSheet(); return; }
        var a = t.closest ? t.closest('a[data-k]') : null;
        if (a) {
          if (a.getAttribute('data-k') === 'rpp') catat(rolePakai, 'rpp');
          tutupSheet();
        }
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') tutupSheet(); });
    }
    sheet.innerHTML =
      '<div class="bnav-sheet__bg"></div>' +
      '<div class="bnav-sheet__box">' +
        '<div class="bnav-sheet__head"><div class="bnav-sheet__title">Semua Aplikasi</div>' +
        '<button type="button" class="bnav-sheet__x" aria-label="Tutup">&times;</button></div>' +
        '<div class="bnav-sheet__grid">' +
        items.map(function (it) {
          var aktif = it.k === kunciAktif;
          return '<a class="bnav-tile' + (aktif ? ' is-aktif' : '') + '" href="' + it.href + '" data-k="' + it.k + '"' + atributSso(it) +
            (aktif ? ' aria-current="page"' : '') + '><span class="bnav-tile__ic bnav-w-' + it.warna + '">' + ikonSvg(it.k) + '</span>' +
            '<span>' + it.judul + '</span></a>';
        }).join('') +
        '</div></div>';
  }
  function bukaSheet() { var s = document.getElementById('bnavSheet'); if (s) s.classList.add('is-open'); }
  function tutupSheet() { var s = document.getElementById('bnavSheet'); if (s) s.classList.remove('is-open'); }

  // ---------- role ----------
  function roleTersimpan(uid) {
    try { return sessionStorage.getItem('bnav_role_' + uid); } catch (e) { return null; }
  }
  function simpanRole(uid, role) {
    try { sessionStorage.setItem('bnav_role_' + uid, role); } catch (e) {}
  }

  async function cariRole() {
    if (typeof supabaseClient === 'undefined') return 'guru';
    try {
      var ses = await supabaseClient.auth.getSession();
      var user = ses && ses.data && ses.data.session && ses.data.session.user;
      if (!user) return 'guru';
      var cache = roleTersimpan(user.id);
      if (cache) return cache;
      var pr = await supabaseClient.from('profiles').select('role').eq('id', user.id).single();
      var role = (pr && pr.data && (pr.data.role === 'admin' || pr.data.role === 'kepsek')) ? pr.data.role : 'guru';
      if (pr && pr.data) simpanRole(user.id, role);
      return role;
    } catch (e) {
      return 'guru';
    }
  }

  async function mulai() {
    pasangGaya();
    var roleAkhir = roleDariBerkas;
    if (roleDariBerkas) {
      render(roleDariBerkas);
    } else {
      // pkl / pelanggaran / portal / kinerja: role bergantung akun
      render('guru'); // tampil dulu supaya bar tidak "muncul belakangan"
      var role = await cariRole();
      roleAkhir = role;
      if (role === 'admin' || role === 'kepsek') render(role);
    }
    // Catat kunjungan SETELAH bar digambar, supaya pilihan 2 aplikasi tidak berubah di tengah halaman yang sedang dibuka.
    catat(roleAkhir || 'guru', kunciAktif);
  }

  if (document.body) mulai();
  else document.addEventListener('DOMContentLoaded', mulai);
})();
