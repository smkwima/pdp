/* rpp-launcher.js
 * -----------------------------------------------------------------
 * Membuka aplikasi lain (RPP Maker dan Presensi) sebagai modul PDP TANPA login
 * ulang. Tautan dengan atribut data-sso="rpp" atau data-sso="presensi" dicegat:
 * token sesi PDP yang sedang aktif dibawa ke aplikasi tujuan lewat bagian # pada
 * URL (tidak ikut dikirim ke server hosting, dan langsung dihapus dari alamat oleh
 * aplikasi tujuan).
 *   - RPP Maker  : memverifikasi token ke E-Rapor lewat Edge Function login-sso.
 *   - Presensi   : memakai token itu langsung (akun e-Rapor/PDP yang sama).
 *
 * Presensi yang kehabisan masa token membawa pengguna kembali ke portal dengan
 * ?buka=presensi; portal lalu otomatis membukanya lagi dengan token baru.
 *
 * Harus dimuat SETELAH supabase-client.js.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__rppLauncher) return;
  window.__rppLauncher = true;

  // Alamat aplikasi di hosting (dengan garis miring di akhir).
  window.RPP_URL = 'https://wima15.github.io/rpp-maker/';
  window.PRESENSI_URL = 'https://wima15.github.io/presensi/';

  async function bukaSso(tujuan) {
    try {
      var ses = await supabaseClient.auth.getSession();   // token otomatis diperbarui bila hampir habis
      var tk = ses && ses.data && ses.data.session && ses.data.session.access_token;
      if (!tk) throw new Error('no session');
      if (tujuan === 'presensi') {
        // Aplikasi dikunci developer: pengguna biasa tidak boleh membuka (developer tetap bisa).
        try {
          var ak = window.AksesAplikasi ? await AksesAplikasi.muat() : null;
          if (ak && ak.peran !== 'developer' && ak.kunci && ak.kunci.presensi) {
            alert('Presensi sedang dikunci.\n' + (ak.kunci.presensi.keterangan || ''));
            return;
          }
        } catch (e) { /* gagal baca kunci: jangan menghalangi */ }
        // Presensi mencatat kehadiran atas nama akun: jangan dibuka saat mode "Lihat sebagai" (developer).
        if (window.PdpLihat && PdpLihat.aktif()) {
          alert('Presensi tidak bisa dibuka dalam mode Lihat sebagai.');
          return;
        }
        // Token baru dengan masa berlaku penuh, supaya Presensi tidak cepat kehabisan sesi.
        try {
          var seg = await supabaseClient.auth.refreshSession();
          var baru = seg && seg.data && seg.data.session && seg.data.session.access_token;
          if (baru) tk = baru;
        } catch (e) { /* pakai token yang ada */ }
      }
      // 'from' = alamat portal PDP ini, dipakai aplikasi tujuan untuk tombol kembali
      var dari = location.origin + location.pathname.replace(/[^/]*$/, '') + 'portal.html';
      var base = tujuan === 'presensi' ? window.PRESENSI_URL : window.RPP_URL;
      location.href = base + '#sso=' + encodeURIComponent(tk) + '&from=' + encodeURIComponent(dari);
    } catch (err) {
      alert('Sesi PDP sudah berakhir. Silakan masuk lagi ke PDP, lalu buka ' + (tujuan === 'presensi' ? 'Presensi' : 'RPP Maker') + '.');
    }
  }
  window.bukaSsoPdp = bukaSso;

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-sso]') : null;
    if (!a) return;
    e.preventDefault();
    bukaSso(a.getAttribute('data-sso') === 'presensi' ? 'presensi' : 'rpp');
  });

  // Dibawa kembali dari Presensi karena tokennya habis: buka lagi otomatis (hanya di portal).
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('buka') === 'presensi' && /portal\.html$/i.test(location.pathname)) {
      history.replaceState(null, '', location.pathname);
      window.addEventListener('load', function () { bukaSso('presensi'); });
    }
  } catch (e) { /* abaikan */ }
})();
