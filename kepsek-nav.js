/* kepsek-nav.js
 * -----------------------------------------------------------------
 * TAMPILAN NAVIGASI untuk akun Kepala Sekolah (profiles.role = 'kepsek').
 *
 *   SIDEBAR  = daftar APLIKASI (Beranda, Buku Induk, E-Rapor, Nilai PKL,
 *              Supervisi, Catatan Pelanggaran).
 *   TAB      = menu internal tiap aplikasi (yang dulu ada di sidebar
 *              aplikasi tsb), tampil sebagai tab di atas konten.
 *
 * Cara kerja (aman, tidak mengubah logika aplikasi):
 *   - Menu asli aplikasi TETAP ada di DOM (hanya disembunyikan). Tab
 *     hanyalah "pantulan": klik tab = klik menu aslinya, dan tab yang
 *     aktif mengikuti class .menu-item--active milik menu asli.
 *   - Menu yang disembunyikan kepsek-readonly.js (data-kepsek-hidden)
 *     otomatis tidak muncul sebagai tab.
 *   - Untuk role lain skrip ini tidak melakukan apa-apa.
 *
 * Dimuat di: admin.html, bukuinduk-admin.html, pkl.html,
 * supervisi-admin.html, guru-penugasan.html, pelanggaran.html (setelah supabase-client.js).
 * (portal.html sudah memakai sidebar aplikasi sendiri.)
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (typeof supabaseClient === 'undefined') return;

  var APLIKASI = [
    { grup: null,                 href: 'portal.html',           ikon: 'layout-dashboard',    judul: 'Beranda' },
    { grup: 'Data Induk',         href: 'bukuinduk-admin.html',  ikon: 'book-user',           judul: 'Buku Induk' },
    { grup: 'Akademik',           href: 'admin.html',            ikon: 'file-text',           judul: 'E-Rapor' },
    { grup: 'Akademik',           href: 'guru-penugasan.html',   ikon: 'users-round',         judul: 'Guru & Penugasan' },
    { grup: 'Akademik',           href: 'pkl.html',              ikon: 'briefcase-business',  judul: 'Nilai PKL' },
    { grup: 'Pembinaan & Mutu',   href: 'supervisi-admin.html',  ikon: 'clipboard-check',     judul: 'Supervisi' },
    { grup: 'Pembinaan & Mutu',   href: 'pelanggaran.html',      ikon: 'shield-alert',        judul: 'Catatan Pelanggaran' }
  ];

  var berkas = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- gaya ----------
  function pasangGaya() {
    if (document.getElementById('knStyle')) return;
    var st = document.createElement('style');
    st.id = 'knStyle';
    st.textContent =
      /* menu asli aplikasi disembunyikan (tetap ada di DOM sebagai sumber tab) */
      'body.kepsek-tabs .sidebar > .sidebar__section-label,' +
      'body.kepsek-tabs .sidebar > .menu-list:not(.kn-apps){display:none !important;}' +
      /* tombol pindah aplikasi di topbar tidak perlu lagi (sudah ada di sidebar) */
      'body.kepsek-tabs .topbar .topbar__app{display:none !important;}' +
      '.kn-apps{margin-bottom:12px;}' +
      '.kn-apps .sidebar__section-label{margin:14px 0 6px;}' +

      /* bar tab */
      '.kn-tabs{position:sticky;top:0;z-index:4;display:flex;align-items:stretch;gap:2px;' +
        'padding:0 36px;background:var(--surface,#fff);border-bottom:1px solid var(--border,#e2e8f0);' +
        'overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:thin;}' +
      '.kn-tabs[hidden]{display:none !important;}' +
      '.kn-tab{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;' +
        'padding:13px 14px;font-size:13.5px;font-weight:600;white-space:nowrap;text-decoration:none;' +
        'color:var(--ink-soft,#64748b);border-bottom:2.5px solid transparent;margin-bottom:-1px;' +
        'transition:color .15s ease,border-color .15s ease,background .15s ease;cursor:pointer;}' +
      '.kn-tab:hover{color:var(--ink,#0f172a);background:var(--surface-tint,#f8fafc);}' +
      '.kn-tab.is-active{color:var(--primary-dim,#3730a3);border-bottom-color:var(--primary,#4f46e5);font-weight:800;}' +
      '.kn-tab svg{width:16px;height:16px;flex-shrink:0;}' +
      '.kn-tab:focus-visible{outline:2px solid var(--primary,#4f46e5);outline-offset:-2px;border-radius:6px;}' +
      '.kn-tabs__sep{flex:0 0 1px;margin:11px 8px;background:var(--border,#e2e8f0);}' +

      '@media screen and (max-width:860px){' +
        /* di HP aplikasi berpindah lewat bar bawah (bottomnav.js); laci menu tidak dipakai */
        'body.kepsek-tabs .menu-toggle{display:none !important;}' +
        '.kn-tabs{padding:0 10px;}' +
        '.kn-tab{padding:12px 11px;font-size:13px;}' +
      '}' +
      '@media print{.kn-tabs{display:none !important;}}';
    document.head.appendChild(st);
  }

  // ---------- sidebar = aplikasi ----------
  function pasangSidebarAplikasi() {
    var sidebar = document.querySelector('.app > .sidebar');
    if (!sidebar || sidebar.querySelector('.kn-apps')) return;

    // Judul topbar: "Dashboard Admin" -> "E-Rapor" (halaman admin.html) / "Dashboard" (lainnya)
    var jd = document.querySelector('.topbar__title');
    if (jd && /\s+Admin\s*$/i.test(jd.textContent)) {
      jd.textContent = berkas === 'admin.html' ? 'E-Rapor' : jd.textContent.replace(/\s+Admin\s*$/i, '');
    }

    // Merek & label peran
    var mark = sidebar.querySelector('.sidebar__brand-mark');
    if (mark) mark.textContent = 'Portal Sekolah';
    var role = sidebar.querySelector('.sidebar__role');
    if (role && !role.querySelector('#roleLabel')) {
      var anak = role.childNodes;
      for (var i = anak.length - 1; i >= 0; i--) {
        if (anak[i].nodeType === 3 || (anak[i].nodeType === 1 && !/^(i|svg)$/i.test(anak[i].nodeName))) role.removeChild(anak[i]);
      }
      role.appendChild(document.createTextNode(' Kepala Sekolah'));
    }

    var h = '', grupTerakhir = '__awal__';
    APLIKASI.forEach(function (a) {
      if (a.grup !== grupTerakhir) {
        if (a.grup) h += '<div class="sidebar__section-label">' + esc(a.grup) + '</div>';
        grupTerakhir = a.grup;
      }
      var aktif = a.href === berkas;
      h += '<a href="' + a.href + '" class="menu-item' + (aktif ? ' menu-item--active' : '') + '"' +
        (aktif ? ' aria-current="page"' : '') + '>' +
        '<i data-lucide="' + a.ikon + '" class="menu-icon"></i>' +
        '<span class="menu-item__title">' + esc(a.judul) + '</span></a>';
    });

    var nav = document.createElement('nav');
    nav.className = 'menu-list kn-apps';
    nav.setAttribute('aria-label', 'Aplikasi');
    nav.innerHTML = h;
    var foot = sidebar.querySelector('.sidebar__footer');
    if (foot) sidebar.insertBefore(nav, foot); else sidebar.appendChild(nav);
    if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (e) { /* abaikan */ } }
  }

  // ---------- menu internal aplikasi -> tab ----------
  var bar = null, tandaTerakhir = null, daftarTab = [];

  function kumpulkanSumber() {
    var hasil = [];
    var navs = document.querySelectorAll('.sidebar .menu-list:not(.kn-apps)');
    for (var n = 0; n < navs.length; n++) {
      var grup = '';
      var anak = navs[n].children;
      for (var i = 0; i < anak.length; i++) {
        var el = anak[i];
        if (el.classList.contains('sidebar__section-label')) { grup = (el.textContent || '').trim(); continue; }
        if (!el.classList.contains('menu-item')) continue;
        if (el.hasAttribute('data-kepsek-hidden')) continue;
        var href = (el.getAttribute('href') || '').trim();
        var penuh = el.getAttribute('data-view');
        // tautan ke halaman/aplikasi lain bukan tab
        if (!penuh && href && href !== '#') continue;
        var judulEl = el.querySelector('.menu-item__title');
        var label = ((judulEl || el).textContent || '').replace(/\s+/g, ' ').trim();
        if (!label) continue;
        hasil.push({ el: el, label: label, grup: n + ':' + grup });
      }
    }
    return hasil;
  }

  function gulirKeAktif() {
    if (!bar) return;
    var aktif = bar.querySelector('.kn-tab.is-active');
    if (!aktif) return;
    var tujuan = aktif.offsetLeft - (bar.clientWidth - aktif.offsetWidth) / 2;
    bar.scrollLeft = Math.max(0, tujuan);
  }

  function sinkronAktif() {
    var berubah = false;
    daftarTab.forEach(function (t) {
      var aktif = t.src.classList.contains('menu-item--active');
      if (t.tab.classList.contains('is-active') !== aktif) berubah = true;
      t.tab.classList.toggle('is-active', aktif);
      t.tab.setAttribute('aria-selected', aktif ? 'true' : 'false');
    });
    if (berubah) gulirKeAktif();
  }

  function bangunTab() {
    if (!bar) return;
    var sumber = kumpulkanSumber();
    var tanda = sumber.map(function (s) { return s.grup + '|' + s.label; }).join('||');

    if (tanda === tandaTerakhir) { sinkronAktif(); return; }
    tandaTerakhir = tanda;

    bar.innerHTML = '';
    daftarTab = [];
    var grupSebelumnya = null;
    sumber.forEach(function (s) {
      if (grupSebelumnya !== null && s.grup !== grupSebelumnya) {
        var sep = document.createElement('span');
        sep.className = 'kn-tabs__sep';
        sep.setAttribute('aria-hidden', 'true');
        bar.appendChild(sep);
      }
      grupSebelumnya = s.grup;

      var a = document.createElement('a');
      a.href = '#';
      a.className = 'kn-tab';
      a.setAttribute('role', 'tab');
      var ik = s.el.querySelector('svg, i');
      if (ik) a.appendChild(ik.cloneNode(true));
      var sp = document.createElement('span');
      sp.textContent = s.label;
      a.appendChild(sp);
      a.addEventListener('click', function (e) {
        e.preventDefault();
        s.el.click(); // jalankan menu asli aplikasi
      });
      bar.appendChild(a);
      daftarTab.push({ tab: a, src: s.el });
    });

    // Satu tab saja (mis. Nilai PKL / Pelanggaran) = tidak perlu bar tab.
    bar.hidden = sumber.length < 2;
    if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (e) { /* abaikan */ } }
    sinkronAktif();
    gulirKeAktif();
    aturPosisi();
  }

  function aturPosisi() {
    var tb = document.querySelector('.main > .topbar');
    if (bar && tb) bar.style.top = tb.offsetHeight + 'px';
  }

  function pasangBarTab() {
    var tb = document.querySelector('.main > .topbar');
    if (!tb || document.querySelector('.kn-tabs')) return;
    bar = document.createElement('div');
    bar.className = 'kn-tabs';
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'Menu aplikasi');
    bar.hidden = true;
    tb.parentNode.insertBefore(bar, tb.nextSibling);

    bangunTab();

    // Pantau menu asli: diisi async (PKL), disembunyikan kepsek-readonly, atau berganti aktif.
    var jadwal = false;
    var mo = new MutationObserver(function () {
      if (jadwal) return;
      jadwal = true;
      requestAnimationFrame(function () { jadwal = false; bangunTab(); });
    });
    var navs = document.querySelectorAll('.sidebar .menu-list:not(.kn-apps)');
    for (var i = 0; i < navs.length; i++) {
      mo.observe(navs[i], { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-kepsek-hidden'] });
    }

    window.addEventListener('resize', aturPosisi);
    if (window.ResizeObserver) new ResizeObserver(aturPosisi).observe(tb);
  }

  // ---------- deteksi role (berbagi cache dengan kepsek-readonly.js) ----------
  async function adalahKepsek() {
    try {
      var ses = await supabaseClient.auth.getSession();
      var user = ses && ses.data && ses.data.session && ses.data.session.user;
      if (!user) return false;
      var kunci = 'kepsek_ro_' + user.id;
      var cache = null;
      try { cache = sessionStorage.getItem(kunci); } catch (e) { /* abaikan */ }
      if (cache !== null) return cache === '1';
      var pr = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
      var ya = !!(pr && pr.data && pr.data.role === 'kepsek');
      try { sessionStorage.setItem(kunci, ya ? '1' : '0'); } catch (e) { /* abaikan */ }
      return ya;
    } catch (e) {
      return false;
    }
  }

  // ---------- anti-kedip ----------
  // Tiap pindah aplikasi = memuat halaman baru. Supaya sidebar kepala sekolah langsung
  // tampil tanpa menunggu cek role, role terakhir diingat (localStorage 'kepsek_hint').
  // Cek role asli tetap berjalan; kalau ternyata beda, petunjuk dibuang & halaman dimuat ulang.
  var HINT = 'kepsek_hint';
  function adaHint() { try { return localStorage.getItem(HINT) === '1'; } catch (e) { return false; } }
  function setHint(ya) { try { if (ya) localStorage.setItem(HINT, '1'); else localStorage.removeItem(HINT); } catch (e) { /* abaikan */ } }

  // Sampai sidebar baru siap, menu asli disembunyikan (bukan dihapus) agar tidak sempat terlihat.
  if (adaHint()) {
    document.documentElement.classList.add('kn-pre');
    var pra = document.createElement('style');
    pra.id = 'knPre';
    pra.textContent = 'html.kn-pre .sidebar > .menu-list,html.kn-pre .sidebar > .sidebar__section-label,' +
      'html.kn-pre .topbar .topbar__app{visibility:hidden !important;}';
    document.head.appendChild(pra);

    // Pasang sidebar & tab begitu topbar selesai dibaca browser, jangan menunggu seluruh halaman.
    // Dengan begitu tampilan akhir sudah jadi sebelum frame pertama digambar (tidak ada "loncatan").
    var moAwal = new MutationObserver(function () {
      if (sudahAktif) { moAwal.disconnect(); return; }
      if (document.body && document.querySelector('.main > .topbar')) { aktifkan(); moAwal.disconnect(); }
    });
    moAwal.observe(document, { childList: true, subtree: true });
  }

  var sudahAktif = false;
  function aktifkan() {
    if (sudahAktif || !document.body) return;
    sudahAktif = true;
    document.body.classList.add('kepsek-tabs');
    pasangGaya();
    pasangSidebarAplikasi();
    pasangBarTab();
    document.documentElement.classList.remove('kn-pre');
  }

  function mulai() {
    var hint = adaHint();
    if (hint) aktifkan();                       // langsung, tanpa menunggu jaringan
    adalahKepsek().then(function (ya) {
      setHint(ya);
      if (ya && !hint) aktifkan();
      else if (!ya && hint) location.reload();  // petunjuk basi (mis. ganti akun)
      else if (!ya) document.documentElement.classList.remove('kn-pre');
    });
  }
  if (document.body) mulai();
  else document.addEventListener('DOMContentLoaded', mulai);
})();
