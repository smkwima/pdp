/* =========================================================
 * AKSES APLIKASI (dikunci / dibuka oleh role Developer)
 * Dipasang SETELAH supabase-client.js di halaman aplikasi dan portal.
 *
 * - Halaman aplikasi: kalau aplikasinya dikunci dan pengguna bukan
 *   developer, isi halaman diganti layar "Aplikasi dikunci".
 * - Portal / menu bawah: AksesAplikasi.muat() memberi daftar status
 *   supaya kartu aplikasi bisa ditampilkan dengan gembok.
 * - Aman bila migrasi belum dijalankan: kalau tabel tidak terbaca,
 *   semua aplikasi dianggap aktif (tidak ada yang terkunci).
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
    'disiplin.html': 'disiplin',
    'pengaturan-admin.html': 'set',
    'log-admin.html': 'log'
  };
  // Dipakai portal: tautan kartu -> kode aplikasi (RPP Maker tidak punya halaman, href '#').
  var KODE_DARI_JUDUL = { 'RPP Maker': 'rpp' };

  function berkasSekarang() {
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }
  function kodeDariHref(href, judul) {
    if (judul && KODE_DARI_JUDUL[judul]) return KODE_DARI_JUDUL[judul];
    var b = String(href || '').split('?')[0].split('#')[0].split('/').pop().toLowerCase();
    return KODE_DARI_BERKAS[b] || null;
  }

  var cache = null;
  // Hasil: { peran: 'guru'|..., kunci: { kode: { nama, keterangan } } }  (hanya yang dikunci)
  async function muat() {
    if (cache) return cache;
    cache = (async function () {
      var hasil = { peran: null, kunci: {} };
      try {
        var ses = await supabaseClient.auth.getSession();
        var user = ses.data && ses.data.session && ses.data.session.user;
        if (!user) return hasil;
        var pr = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
        hasil.peran = pr.data ? String(pr.data.role) : null;
        var r = await supabaseClient.from('akses_aplikasi').select('kode, nama, aktif, keterangan');
        if (r.error || !r.data) return hasil; // tabel belum ada -> semua aktif
        r.data.forEach(function (a) {
          if (a.aktif === false) hasil.kunci[a.kode] = { nama: a.nama, keterangan: a.keterangan || '' };
        });
      } catch (e) { /* gagal baca: jangan mengunci siapa pun */ }
      return hasil;
    })();
    return cache;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function tampilkanTerkunci(info) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { tampilkanTerkunci(info); }); return; }
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
  }

  async function jaga() {
    var kode = KODE_DARI_BERKAS[berkasSekarang()];
    if (!kode) return; // bukan halaman aplikasi (login, portal, siswa, developer)
    document.documentElement.style.visibility = 'hidden'; // cegah halaman berkedip sebelum dicek
    var aman = setTimeout(function () { document.documentElement.style.visibility = ''; }, 4000);
    try {
      var d = await muat();
      var info = d.kunci[kode];
      if (info && d.peran !== 'developer') { tampilkanTerkunci(info); return; }
    } finally {
      clearTimeout(aman);
      document.documentElement.style.visibility = '';
    }
  }

  window.AksesAplikasi = { muat: muat, kodeDariHref: kodeDariHref };
  jaga();
})();
