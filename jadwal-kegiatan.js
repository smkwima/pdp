// =====================================================================
// JADWAL KEGIATAN — HITUNG MUNDUR
// Admin mengatur kegiatan di Pengaturan Sekolah → Jadwal Kegiatan
// (tabel jadwal_kegiatan, lihat migrasi_jadwal_kegiatan.sql). File ini
// menampilkan hitung mundurnya di dashboard tiap modul.
//
// Pemakaian di halaman modul (setelah supabase-client.js):
//   <script src="jadwal-kegiatan.js?v=1"></script>
//   JadwalKegiatan.pasang({ modul: 'erapor', tampilJika: function () { ... } });
//
//   modul      : 'erapor' | 'pkl' | 'bukuinduk' | 'penugasan' | 'supervisi'
//                | 'pelanggaran' | 'kinerja' | 'semua'  (kegiatan bermodul 'umum' selalu ikut)
//   tampilJika : fungsi, true = kotak ditampilkan (mis. hanya saat menu
//                Dashboard aktif). Kosong = selalu tampil.
//   peran      : 'admin' | 'guru' | 'siswa' (kosong = dideteksi otomatis)
//   anchor     : elemen; kotak disisipkan SEBELUM elemen ini (default #content)
//   flush      : true = tanpa padding sendiri (kalau induknya sudah berpadding)
//
// Semua waktu disimpan sebagai timestamptz dan diinput/ditampilkan dalam WIB.
// Dibuat aman: kalau tabel belum dimigrasi / gagal dimuat, tidak menampilkan
// apa pun dan tidak mengganggu halaman.
// =====================================================================
(function () {
  'use strict';

  var MODUL = {
    erapor: 'E-Rapor',
    pkl: 'Nilai PKL',
    bukuinduk: 'Buku Induk',
    penugasan: 'Guru & Penugasan',
    supervisi: 'Supervisi',
    pelanggaran: 'Catatan Pelanggaran',
    kinerja: 'Kinerja Guru',
    umum: 'Umum (semua modul)'
  };
  var TZ = 'Asia/Jakarta';

  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // ---------- Waktu WIB ----------
  function bagianWib(d) {
    var f = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(d);
    var o = {};
    f.forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  // ISO → 'YYYY-MM-DDTHH:mm' (WIB) untuk <input type="datetime-local">
  function keInputWib(iso) {
    if (!iso) return '';
    var o = bagianWib(new Date(iso));
    return o.year + '-' + o.month + '-' + o.day + 'T' + o.hour + ':' + o.minute;
  }
  // 'YYYY-MM-DDTHH:mm' (dianggap WIB) → ISO
  function dariInputWib(v) {
    if (!v) return null;
    var d = new Date(v + ':00+07:00');
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function formatWaktu(iso) {
    var d = new Date(iso);
    var tgl = d.toLocaleDateString('id-ID', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var o = bagianWib(d);
    return tgl + ' · ' + o.hour + '.' + o.minute + ' WIB';
  }

  function akhirEfektif(k) {
    if (k.waktu_selesai) return new Date(k.waktu_selesai).getTime();
    // tanpa waktu selesai: berakhir di akhir hari (WIB) waktu mulai
    return new Date(keInputWib(k.waktu_mulai).slice(0, 10) + 'T23:59:59+07:00').getTime();
  }
  function statusKegiatan(k, now) {
    var mulai = new Date(k.waktu_mulai).getTime();
    if (now < mulai) return 'akan';
    if (now <= akhirEfektif(k)) return 'berlangsung';
    return 'selesai';
  }
  function pecah(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    return { h: Math.floor(s / 86400), j: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), d: s % 60 };
  }

  // ---------- Data ----------
  function ambilSemua(hanyaAktif) {
    try {
      var q = supabaseClient.from('jadwal_kegiatan').select('*').order('waktu_mulai', { ascending: true });
      if (hanyaAktif) q = q.eq('aktif', true);
      return q.then(function (r) {
        if (r.error) { if (window.console) console.warn('jadwal_kegiatan:', r.error.message); return []; }
        return r.data || [];
      }, function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }

  var perananCache = null;
  function deteksiPeran() {
    if (perananCache) return perananCache;
    perananCache = supabaseClient.auth.getSession().then(function (s) {
      var u = s && s.data && s.data.session && s.data.session.user;
      if (!u) return 'siswa';
      return supabaseClient.from('profiles').select('role').eq('id', u.id).maybeSingle().then(function (r) {
        var role = r && r.data && r.data.role;
        if (role === 'admin' || role === 'kepsek') return 'admin';
        if (role) return 'guru';
        return 'siswa';
      }, function () { return 'siswa'; });
    }, function () { return 'siswa'; });
    return perananCache;
  }

  function cocok(k, o, peran) {
    if (peran === 'admin' && !k.untuk_admin) return false;
    if (peran === 'guru' && !k.untuk_guru) return false;
    if (peran === 'siswa' && !k.untuk_siswa) return false;
    var m = o.modul;
    if (!m || m === 'semua') return true;
    var arr = Array.isArray(m) ? m : [m];
    return k.modul === 'umum' || arr.indexOf(k.modul) >= 0;
  }

  // ---------- Tampilan ----------
  function pasangCss() {
    if (document.getElementById('kgCss')) return;
    var st = document.createElement('style');
    st.id = 'kgCss';
    st.textContent =
      '.kg-slot{padding:28px 36px 0;}' +
      '.kg-slot[hidden]{display:none;}' +
      '.kg-head{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-soft,#64748b);margin-bottom:10px;}' +
      '.kg-head svg{width:15px;height:15px;}' +
      '.kg-grid{display:flex;flex-direction:column;gap:12px;}' +
      '.kg-card{position:relative;border:1px solid var(--border,#e2e8f0);border-left:4px solid var(--primary,#2563eb);border-radius:var(--radius,12px);background:var(--surface,#fff);padding:16px 22px;box-shadow:0 1px 2px rgba(15,23,42,.04);display:flex;align-items:center;justify-content:space-between;gap:24px;width:100%;box-sizing:border-box;}' +
      '.kg-info{flex:1;min-width:0;}' +
      '.kg-hitung{flex:0 0 auto;min-width:340px;}' +
      '.kg-card--segera{border-left-color:#d97706;background:#fffbeb;}' +
      '.kg-card--hari{border-left-color:var(--danger,#dc2626);background:var(--danger-tint,#fef2f2);}' +
      '.kg-card--berlangsung{border-left-color:var(--success,#059669);background:var(--success-tint,#ecfdf5);}' +
      '.kg-chip{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--primary-dim,#1d4ed8);background:var(--primary-tint,#eff6ff);border-radius:999px;padding:2px 9px;margin-bottom:6px;}' +
      '.kg-judul{font-size:15px;font-weight:800;color:var(--ink,#0f172a);line-height:1.3;}' +
      '.kg-ket{font-size:12.5px;color:var(--ink-soft,#64748b);margin-top:3px;white-space:pre-line;}' +
      '.kg-label{font-size:11.5px;font-weight:700;color:var(--ink-soft,#64748b);margin:0 0 6px;text-align:right;}' +
      '.kg-timer{display:flex;gap:6px;}' +
      '.kg-timer>div{flex:1;text-align:center;background:rgba(255,255,255,.75);border:1px solid var(--border,#e2e8f0);border-radius:10px;padding:8px 4px 6px;min-width:72px;}' +
      '.kg-timer b{display:block;font-family:var(--font-display,inherit);font-size:28px;line-height:1.1;font-weight:800;color:var(--ink,#0f172a);font-variant-numeric:tabular-nums;}' +
      '.kg-timer span{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-faint,#94a3b8);}' +
      '.kg-tgl{font-size:12px;color:var(--ink-soft,#64748b);margin-top:6px;}' +
      '.kg-more{font-size:12px;color:var(--ink-soft,#64748b);margin-top:8px;}' +
      '@media (max-width:900px){.kg-slot{padding:16px 14px 0;}.kg-card{flex-direction:column;align-items:stretch;gap:12px;padding:14px 16px;}.kg-hitung{min-width:0;}.kg-label{text-align:left;}.kg-timer b{font-size:22px;}.kg-timer>div{min-width:0;}}' +
      '.kg-slot.kg-slot--flush{padding:0 0 20px;}';
    document.head.appendChild(st);
  }

  var BATAS_KARTU = 6;

  function pasang(o) {
    o = o || {};
    var anchor = o.anchor || document.getElementById('content');
    if (!anchor || !anchor.parentNode) return null;
    if (anchor.parentNode.querySelector(':scope > .kg-slot')) return null; // jangan dobel
    pasangCss();

    var slot = document.createElement('div');
    slot.className = 'kg-slot' + (o.flush ? ' kg-slot--flush' : '');
    slot.hidden = true;
    anchor.parentNode.insertBefore(slot, anchor);

    var semua = [];
    var peran = o.peran || null;
    var tersaji = '';   // tanda tangan daftar yang sedang digambar (id:status)
    var siap = false;

    function daftarTampil(now) {
      return semua.filter(function (k) { return cocok(k, o, peran) && statusKegiatan(k, now) !== 'selesai'; })
        .sort(function (a, b) {
          // yang sedang berlangsung di atas, lalu yang paling dekat
          var sa = statusKegiatan(a, now) === 'berlangsung' ? 0 : 1;
          var sb = statusKegiatan(b, now) === 'berlangsung' ? 0 : 1;
          return sa - sb || new Date(a.waktu_mulai) - new Date(b.waktu_mulai);
        });
    }

    function kelasKartu(k, now) {
      var st = statusKegiatan(k, now);
      var sisaMulai = new Date(k.waktu_mulai).getTime() - now;
      var kelas = 'kg-card';
      if (st === 'berlangsung') kelas += ' kg-card--berlangsung';
      else if (sisaMulai <= 86400000) kelas += ' kg-card--hari';
      else if (sisaMulai <= 3 * 86400000) kelas += ' kg-card--segera';
      return kelas;
    }

    function kartu(k, now) {
      var st = statusKegiatan(k, now);
      var kelas = kelasKartu(k, now);
      var label = st === 'berlangsung'
        ? (k.waktu_selesai ? 'Sedang berlangsung — berakhir dalam' : 'Berlangsung hari ini — sisa waktu')
        : 'Dimulai dalam';
      return '<div class="' + kelas + '" data-id="' + esc(k.id) + '">' +
        '<div class="kg-info">' +
        '<span class="kg-chip">' + esc(MODUL[k.modul] || k.modul) + '</span>' +
        '<div class="kg-judul">' + esc(k.judul) + '</div>' +
        (k.keterangan ? '<div class="kg-ket">' + esc(k.keterangan) + '</div>' : '') +
        '<div class="kg-tgl">' + esc(formatWaktu(k.waktu_mulai)) + '</div>' +
        '</div>' +
        '<div class="kg-hitung"><div class="kg-label">' + label + '</div>' +
        '<div class="kg-timer"><div><b data-u="h">0</b><span>Hari</span></div><div><b data-u="j">00</b><span>Jam</span></div>' +
        '<div><b data-u="m">00</b><span>Menit</span></div><div><b data-u="d">00</b><span>Detik</span></div></div></div>' +
        '</div>';
    }

    function gambarUlang(daftar, now) {
      var tampil = daftar.slice(0, BATAS_KARTU);
      slot.innerHTML =
        '<div class="kg-head"><i data-lucide="timer"></i>Hitung Mundur Kegiatan</div>' +
        '<div class="kg-grid">' + tampil.map(function (k) { return kartu(k, now); }).join('') + '</div>' +
        (daftar.length > tampil.length ? '<div class="kg-more">+ ' + (daftar.length - tampil.length) + ' kegiatan lain</div>' : '');
      if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (e) { /* abaikan */ } }
    }

    function isiAngka(daftar, now) {
      daftar.slice(0, BATAS_KARTU).forEach(function (k) {
        var el = slot.querySelector('.kg-card[data-id="' + k.id + '"]');
        if (!el) return;
        var st = statusKegiatan(k, now);
        var ms = st === 'berlangsung' ? akhirEfektif(k) - now : new Date(k.waktu_mulai).getTime() - now;
        var p = pecah(ms);
        el.querySelector('[data-u="h"]').textContent = p.h;
        el.querySelector('[data-u="j"]').textContent = pad(p.j);
        el.querySelector('[data-u="m"]').textContent = pad(p.m);
        el.querySelector('[data-u="d"]').textContent = pad(p.d);
      });
    }

    function tick() {
      if (!siap) return;
      var now = Date.now();
      var daftar = daftarTampil(now);
      var boleh = typeof o.tampilJika === 'function' ? !!o.tampilJika() : true;
      var tampilkan = boleh && daftar.length > 0;
      if (slot.hidden === tampilkan) slot.hidden = !tampilkan;
      if (!tampilkan) { tersaji = ''; return; }
      var tanda = daftar.slice(0, BATAS_KARTU).map(function (k) { return k.id + ':' + kelasKartu(k, now); }).join('|') + '#' + daftar.length;
      if (tanda !== tersaji) { gambarUlang(daftar, now); tersaji = tanda; }
      isiAngka(daftar, now);
    }

    function muat() {
      return ambilSemua(true).then(function (rows) { semua = rows; siap = true; tick(); });
    }

    // Tentukan peran lalu muat data.
    (peran ? Promise.resolve(peran) : deteksiPeran()).then(function (p) {
      peran = p;
      return muat();
    });

    setInterval(tick, 1000);
    setInterval(function () { if (siap) muat(); }, 5 * 60 * 1000);

    // Tampil/sembunyi mengikuti perpindahan menu & render ulang konten.
    var jadwalCek = null;
    function cekSoon() {
      if (jadwalCek) return;
      jadwalCek = setTimeout(function () { jadwalCek = null; tick(); }, 60);
    }
    try {
      var mo = new MutationObserver(cekSoon);
      mo.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
      if (anchor.nodeType === 1) mo.observe(anchor, { childList: true });
    } catch (e) { /* abaikan */ }
    window.addEventListener('hashchange', cekSoon);
    document.addEventListener('click', cekSoon, true);

    return { muat: muat, tick: tick };
  }

  window.JadwalKegiatan = {
    MODUL: MODUL,
    pasang: pasang,
    ambilSemua: ambilSemua,
    statusKegiatan: statusKegiatan,
    keInputWib: keInputWib,
    dariInputWib: dariInputWib,
    formatWaktu: formatWaktu,
    esc: esc
  };
})();
