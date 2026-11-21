/* =========================================================
 * AKSES APLIKASI (dikunci / dibuka oleh role Developer)
 * Dipasang SETELAH supabase-client.js di halaman aplikasi, portal, dan siswa.
 *
 * - Halaman aplikasi: kalau aplikasinya dikunci dan pengguna bukan
 *   developer, isi halaman diganti layar "Aplikasi dikunci".
 * - MODE PEMELIHARAAN (tabel pengaturan_sistem): bila aktif, SEMUA halaman
 *   (aplikasi, portal, siswa) menampilkan layar pemeliharaan untuk semua
 *   pengguna kecuali developer. Layar memeriksa ulang tiap 60 detik dan
 *   memuat ulang otomatis saat pemeliharaan selesai.
 * - PENGUMUMAN: banner di bagian atas halaman (dari Developer dan dari Kepala
 *   Sekolah, bisa tampil bersamaan), bisa ditutup per sesi, hilang otomatis
 *   setelah waktu berakhir, dan diperbarui sendiri tiap 2 menit.
 * - Portal / menu bawah: AksesAplikasi.muat() memberi daftar status
 *   supaya kartu aplikasi bisa ditampilkan dengan gembok.
 * - Aman bila migrasi belum dijalankan: kalau tabel tidak terbaca,
 *   tidak ada yang terkunci dan tidak ada banner.
 * Kode aplikasi harus sama dengan tabel akses_aplikasi (migrasi_developer.sql).
 * ========================================================= */
(function () {
  var KODE_DARI_BERKAS = {
    'bukuinduk-admin.html': 'bi', 'bukuinduk-guru.html': 'bi',
    'admin.html': 'rapor', 'guru.html': 'rapor',
    'guru-penugasan.html': 'gp', 'penugasan-admin.html': 'gp',
    'pkl.html': 'pkl',
    'supervisi.html': 'sup', 'supervisi-admin.html': 'sup',
    'kinerja.html': 'kin',
    'penilaian-rekan.html': 'rekan',
    'pelanggaran.html': 'pel',
    'pengaduan.html': 'pgd',
    'catatan-pengawas.html': 'cat',
    'ijin.html': 'ijin',
    'presensi.html': 'presensi',
    'presensi-siswa.html': 'presiswa',
    'disiplin.html': 'disiplin',
    'pengaturan-admin.html': 'set',
    'log-admin.html': 'log'
  };
  // Halaman tanpa kode aplikasi, tetapi tetap ikut mode pemeliharaan & pengumuman.
  var HALAMAN_UMUM = { 'portal.html': 1, 'siswa.html': 1, 'developer.html': 1 };
  // Dipakai portal: tautan kartu -> kode aplikasi (RPP Maker tidak punya halaman, href '#').
  var KODE_DARI_JUDUL = { 'RPP Maker': 'rpp' };

  function berkasSekarang() {
    var b = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (b.indexOf('.') < 0) b += '.html'; // hosting dengan URL bersih: /portal -> portal.html
    return b;
  }
  function kodeDariHref(href, judul) {
    if (judul && KODE_DARI_JUDUL[judul]) return KODE_DARI_JUDUL[judul];
    var b = String(href || '').split('?')[0].split('#')[0].split('/').pop().toLowerCase();
    return KODE_DARI_BERKAS[b] || null;
  }

  var cache = null;
  // Hasil: { peran, kunci: { kode: { nama, keterangan } } (hanya yang dikunci),
  //          sembunyi: { kode: true } (dikunci DAN disembunyikan dari menu), sistem: baris pengaturan_sistem | null }
  async function muat() {
    if (cache) return cache;
    cache = (async function () {
      var hasil = { peran: null, kunci: {}, sembunyi: {}, sistem: null };
      try {
        var ses = await supabaseClient.auth.getSession();
        var user = ses.data && ses.data.session && ses.data.session.user;
        if (!user) return hasil;
        var pr = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
        hasil.peran = pr.data ? String(pr.data.role) : null;
        var hs = await Promise.all([
          supabaseClient.from('akses_aplikasi').select('kode, nama, aktif, keterangan, tersembunyi'),
          supabaseClient.from('pengaturan_sistem').select('*').eq('id', 1).maybeSingle()
        ]);
        var r = hs[0], s = hs[1];
        if (r.error) {
          // Kolom 'tersembunyi' belum ada (migrasi belum dijalankan): baca tanpa kolom itu supaya kunci tetap jalan.
          r = await supabaseClient.from('akses_aplikasi').select('kode, nama, aktif, keterangan');
        }
        if (!r.error && r.data) { // tabel belum ada -> semua aktif
          r.data.forEach(function (a) {
            if (a.aktif === false) {
              hasil.kunci[a.kode] = { nama: a.nama, keterangan: a.keterangan || '' };
              if (a.tersembunyi === true) hasil.sembunyi[a.kode] = true; // tersembunyi selalu ikut terkunci
            }
          });
        }
        if (!s.error && s.data) hasil.sistem = s.data;
      } catch (e) { /* gagal baca: jangan mengunci siapa pun */ }
      return hasil;
    })();
    return cache;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sesudahBodySiap(fn) {
    if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
  }
  function tglIndo(iso) {
    try {
      return new Date(iso).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function tampilkanTerkunci(info) {
    sesudahBodySiap(function () {
      document.title = 'Aplikasi dikunci — ' + info.nama;
      document.body.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f1f5f9;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;">' +
        '<div style="max-width:420px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px 28px;text-align:center;">' +
        '<div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;font-size:26px;">🔒</div>' +
        '<div style="font-size:19px;font-weight:700;color:#0f172a;margin-bottom:8px;">' + esc(info.nama) + ' sedang dikunci</div>' +
        '<div style="font-size:14px;line-height:1.6;color:#475569;margin-bottom:22px;">' + esc(info.keterangan || 'Aplikasi ini sementara tidak dapat diakses. Hubungi admin atau developer untuk informasi lebih lanjut.') + '</div>' +
        '<a href="portal.html" style="display:inline-block;padding:10px 20px;border-radius:10px;background:#1d4ed8;color:#fff;font-weight:600;font-size:14px;text-decoration:none;">Kembali ke Menu Utama</a>' +
        '</div></div>';
      document.documentElement.style.visibility = '';
    });
  }

  // ---- MODE PEMELIHARAAN: layar penuh di atas segalanya (menutup juga pop up yang muncul belakangan) ----
  function tampilkanPemeliharaan(s) {
    sesudahBodySiap(function () {
      document.title = 'Pemeliharaan sistem';
      document.body.style.overflow = 'hidden';
      var el = document.createElement('div');
      el.id = 'pdp-pemeliharaan';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:auto;display:flex;align-items:center;justify-content:center;padding:24px;background:#f1f5f9;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;';
      var selesai = s.pemeliharaan_selesai ? '<div style="font-size:13px;font-weight:600;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:9px 12px;margin-bottom:20px;">Perkiraan selesai: ' + esc(tglIndo(s.pemeliharaan_selesai)) + '</div>' : '';
      el.innerHTML =
        '<div style="max-width:440px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px 28px;text-align:center;">' +
        '<div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;font-size:26px;">🛠️</div>' +
        '<div style="font-size:19px;font-weight:700;color:#0f172a;margin-bottom:8px;">Sistem sedang dalam pemeliharaan</div>' +
        '<div style="font-size:14px;line-height:1.6;color:#475569;margin-bottom:18px;white-space:pre-line;">' + esc(s.pemeliharaan_pesan || 'Portal sementara tidak dapat diakses untuk perbaikan dan pembaruan. Silakan coba beberapa saat lagi.') + '</div>' +
        selesai +
        '<div style="font-size:12px;color:#94a3b8;margin-bottom:18px;">Halaman ini memeriksa ulang otomatis dan akan terbuka sendiri saat pemeliharaan selesai.</div>' +
        '<button type="button" id="pdp-pem-muat" style="padding:10px 18px;border-radius:10px;border:0;background:#1d4ed8;color:#fff;font:600 14px inherit;cursor:pointer;margin:0 4px 6px;">Muat ulang</button>' +
        '<button type="button" id="pdp-pem-keluar" style="padding:10px 18px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#334155;font:600 14px inherit;cursor:pointer;margin:0 4px 6px;">Keluar</button>' +
        '</div>';
      document.body.appendChild(el);
      document.documentElement.style.visibility = '';
      document.getElementById('pdp-pem-muat').onclick = function () { location.reload(); };
      document.getElementById('pdp-pem-keluar').onclick = async function () {
        try { await supabaseClient.auth.signOut(); } catch (e) { /* abaikan */ }
        location.href = 'index.html';
      };
      // Periksa ulang tiap 60 detik; muat ulang begitu pemeliharaan dimatikan.
      setInterval(async function () {
        try {
          var r = await supabaseClient.from('pengaturan_sistem').select('pemeliharaan_aktif').eq('id', 1).maybeSingle();
          if (!r.error && r.data && r.data.pemeliharaan_aktif === false) location.reload();
        } catch (e) { /* coba lagi pada putaran berikutnya */ }
      }, 60000);
    });
  }

  // ---- BANNER (pengumuman developer, pengumuman kepala sekolah, dan penanda untuk developer saat pemeliharaan aktif) ----
  var GAYA_BANNER = {
    info:       { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1e40af', ikon: 'ℹ️' },
    peringatan: { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e', ikon: '⚠️' },
    penting:    { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b', ikon: '📢' }
  };
  function wadahBanner() {
    var w = document.getElementById('pdp-banner-wrap');
    if (w) return w;
    w = document.createElement('div');
    w.id = 'pdp-banner-wrap';
    // Menu Utama (portal): banner masuk ke area konten, tepat di atas kartu sapaan.
    // Halaman lain: banner di paling atas halaman.
    var konten = document.querySelector('main.pt-content');
    if (konten) {
      w.setAttribute('data-mode', 'konten');
      w.style.cssText = 'position:relative;z-index:5;display:grid;gap:10px;margin-bottom:16px;';
      konten.insertBefore(w, konten.firstChild);
    } else {
      w.style.cssText = 'position:relative;z-index:50;';
      document.body.insertBefore(w, document.body.firstChild);
    }
    return w;
  }
  // id: penanda unik banner (satu elemen per id). label: judul kecil tebal di depan teks (opsional).
  function pasangBanner(id, jenis, teks, kunciTutup, label) {
    sesudahBodySiap(function () {
      var elId = 'pdp-banner-' + id;
      var lama = document.getElementById(elId);
      if (lama) lama.remove();
      var g = GAYA_BANNER[jenis] || GAYA_BANNER.info;
      var wadah = wadahBanner();
      var dikonten = wadah.getAttribute('data-mode') === 'konten';
      var el = document.createElement('div');
      el.id = elId;
      el.className = 'pdp-banner';
      el.setAttribute('role', 'status');
      el.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:' + (dikonten ? '12px 16px' : '10px 16px') + ';background:' + g.bg + ';' +
        (dikonten ? 'border:1px solid ' + g.bd + ';border-radius:14px;' : 'border-bottom:1px solid ' + g.bd + ';') +
        'color:' + g.fg + ';font:500 13px/1.5 \'Plus Jakarta Sans\',system-ui,sans-serif;';
      el.innerHTML = '<span aria-hidden="true">' + g.ikon + '</span><div style="flex:1;white-space:pre-line;">' +
        (label ? '<strong>' + esc(label) + '</strong>\n' : '') + esc(teks) + '</div>' +
        (kunciTutup ? '<button type="button" aria-label="Tutup pengumuman" style="border:0;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;">×</button>' : '');
      if (kunciTutup) {
        el.querySelector('button').onclick = function () {
          try { sessionStorage.setItem(kunciTutup, '1'); } catch (e) { /* abaikan */ }
          el.remove();
        };
      }
      wadah.appendChild(el);
    });
  }
  function hapusBanner(id) {
    var el = document.getElementById('pdp-banner-' + id);
    if (el) el.remove();
  }
  function sudahDitutup(kunci) {
    try { return !!sessionStorage.getItem(kunci); } catch (e) { return false; } // tanpa penyimpanan: tampilkan saja
  }
  function belumBerakhir(iso) {
    return !iso || new Date(iso) > new Date();
  }

  // Ambil data TERBARU dari database (bukan dari cache muat()) lalu pasang / lepas banner.
  // Dipanggil saat halaman dibuka, tiap 2 menit, dan saat tab kembali aktif, sehingga
  // pengumuman baru muncul (dan yang dimatikan hilang) tanpa harus memuat ulang halaman.
  var sedangSegar = false;
  async function segarkanPengumuman() {
    if (sedangSegar) return;
    sedangSegar = true;
    try {
      var dbg = { berkas: berkasSekarang(), versiGuard: 3 };
      // 1) Pengumuman Developer (pengaturan_sistem)
      try {
        var rs = await supabaseClient.from('pengaturan_sistem').select('*').eq('id', 1).maybeSingle();
        var s = (!rs.error && rs.data) ? rs.data : null;
        dbg.baca_pengaturan_sistem = rs.error ? 'GALAT: ' + rs.error.message : (s ? 'ok' : 'BARIS id=1 TIDAK ADA / tidak terbaca (RLS?)');
        if (s) {
          dbg.pengumuman_aktif = s.pengumuman_aktif;
          dbg.teks_terisi = !!s.pengumuman_teks;
          dbg.berakhir = s.pengumuman_berakhir || '(kosong)';
          dbg.sudah_berakhir = !belumBerakhir(s.pengumuman_berakhir);
          dbg.ditutup_pengguna_di_sesi_ini = sudahDitutup('pdp_pengumuman_' + (s.diubah_pada || ''));
        }
        if (s && s.pengumuman_aktif && s.pengumuman_teks && belumBerakhir(s.pengumuman_berakhir) &&
            !sudahDitutup('pdp_pengumuman_' + (s.diubah_pada || ''))) {
          pasangBanner('dev', s.pengumuman_jenis, s.pengumuman_teks, 'pdp_pengumuman_' + (s.diubah_pada || ''), null);
        } else {
          hapusBanner('dev');
        }
      } catch (e) { dbg.galat_developer = String(e && e.message || e); }

      // 2) Pengumuman Kepala Sekolah (pengumuman_sekolah; tabel belum ada -> dilewati)
      try {
        var rk = await supabaseClient.from('pengumuman_sekolah')
          .select('id, jenis, judul, teks, pengirim_nama, berakhir_pada, diubah_pada, penerima')
          .eq('aktif', true).order('dibuat_pada', { ascending: false }).limit(10);
        dbg.pengumuman_kepsek = rk.error ? 'GALAT/belum ada tabel: ' + rk.error.message : (rk.data ? rk.data.length + ' aktif' : '0');
        if (!rk.error && rk.data) {
          var tampil = {};
          var uidSaya = null;
          try {
            var ss = await supabaseClient.auth.getSession();
            uidSaya = ss.data && ss.data.session && ss.data.session.user ? ss.data.session.user.id : null;
          } catch (e) { /* abaikan */ }
          rk.data.forEach(function (p) {
            if (!belumBerakhir(p.berakhir_pada)) return;
            // Pengumuman bertarget hanya untuk penerimanya (Kepala Sekolah bisa membacanya semua di database,
            // tetapi bannernya hanya tampil kalau ia termasuk penerima).
            var bertarget = Array.isArray(p.penerima);
            if (bertarget && (!uidSaya || p.penerima.indexOf(uidSaya) < 0)) return;
            var kunci = 'pdp_pengs_' + p.id + '_' + (p.diubah_pada || '');
            if (sudahDitutup(kunci)) return;
            tampil['ks-' + p.id] = true;
            var label = 'Pengumuman ' + (bertarget ? 'untuk Anda ' : '') + (p.pengirim_nama ? 'dari ' + p.pengirim_nama : 'Kepala Sekolah') + (p.judul ? ' · ' + p.judul : '');
            var lama = document.getElementById('pdp-banner-ks-' + p.id);
            // pasang ulang hanya bila belum ada atau isinya berubah
            if (!lama || lama.getAttribute('data-ver') !== String(p.diubah_pada)) {
              pasangBanner('ks-' + p.id, p.jenis, p.teks, kunci, label);
              sesudahBodySiap(function () {
                var e2 = document.getElementById('pdp-banner-ks-' + p.id);
                if (e2) e2.setAttribute('data-ver', String(p.diubah_pada));
              });
            }
          });
          // lepas banner kepala sekolah yang sudah dimatikan / dihapus / berakhir
          var ada = document.querySelectorAll('[id^="pdp-banner-ks-"]');
          for (var i = 0; i < ada.length; i++) {
            if (!tampil[ada[i].id.replace('pdp-banner-', '')]) ada[i].remove();
          }
        }
      } catch (e) { dbg.galat_kepsek = String(e && e.message || e); }
      tampilDebug(dbg);
    } finally {
      sedangSegar = false;
    }
  }

  // Diagnosis: tambahkan ?debugbanner=1 di akhir alamat halaman untuk melihat kenapa banner tampil / tidak.
  function tampilDebug(dbg) {
    var aktif = false;
    try { aktif = /[?&]debugbanner=1/.test(location.search); } catch (e) { /* abaikan */ }
    if (!aktif) return;
    sesudahBodySiap(function () {
      var el = document.getElementById('pdp-debug');
      if (!el) {
        el = document.createElement('pre');
        el.id = 'pdp-debug';
        el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483646;max-width:92vw;max-height:60vh;overflow:auto;margin:0;padding:10px 12px;background:#0f172a;color:#e2e8f0;font:12px/1.5 ui-monospace,monospace;border-radius:10px;white-space:pre-wrap;';
        document.body.appendChild(el);
      }
      el.textContent = 'DIAGNOSIS BANNER\n' + Object.keys(dbg).map(function (k) { return k + ': ' + dbg[k]; }).join('\n') +
        '\nbanner_terpasang_di_halaman: ' + document.querySelectorAll('.pdp-banner').length;
    });
  }

  var timerPengumuman = null;
  function mulaiPengumuman() {
    segarkanPengumuman();
    if (timerPengumuman) return;
    timerPengumuman = setInterval(function () { if (!document.hidden) segarkanPengumuman(); }, 120000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) segarkanPengumuman(); });
  }

  async function jaga() {
    var berkas = berkasSekarang();
    var kode = KODE_DARI_BERKAS[berkas];
    if (!kode && !HALAMAN_UMUM[berkas]) return; // login, developer, dll. tidak dijaga
    var bolehBanner = false;
    document.documentElement.style.visibility = 'hidden'; // cegah halaman berkedip sebelum dicek
    var aman = setTimeout(function () { document.documentElement.style.visibility = ''; }, 4000);
    try {
      var d = await muat();
      var developer = d.peran === 'developer';
      if (d.sistem && d.sistem.pemeliharaan_aktif && !developer) { tampilkanPemeliharaan(d.sistem); return; }
      var info = kode && d.kunci[kode];
      if (info && !developer) { tampilkanTerkunci(info); return; }
      if (d.sistem && d.sistem.pemeliharaan_aktif && developer) {
        pasangBanner('pemeliharaan', 'peringatan', 'Mode pemeliharaan sedang AKTIF. Hanya Anda (developer) yang bisa membuka halaman ini; pengguna lain melihat layar pemeliharaan.', null, null);
      } else {
        bolehBanner = true;
      }
    } finally {
      clearTimeout(aman);
      if (!document.getElementById('pdp-pemeliharaan')) document.documentElement.style.visibility = '';
    }
    // Banner dimuat setelah halaman ditampilkan, supaya tidak menunda tampilan.
    if (bolehBanner) mulaiPengumuman();
  }

  // Buang aplikasi yang disembunyikan dari sebuah daftar menu (item punya href dan judul).
  // Developer tetap melihat semuanya. Hasil muat() 'd' boleh null (gagal baca -> daftar apa adanya).
  function saring(daftar, d) {
    if (!d || d.peran === 'developer' || !d.sembunyi) return daftar;
    return daftar.filter(function (it) {
      var kode = kodeDariHref(it.href, it.judul);
      return !(kode && d.sembunyi[kode]);
    });
  }

  window.AksesAplikasi = { muat: muat, kodeDariHref: kodeDariHref, saring: saring };
  jaga();
})();
