/* rpp-launcher.js
 * -----------------------------------------------------------------
 * Membuka RPP Maker sebagai modul PDP TANPA login ulang.
 * Tautan RPP Maker (atribut data-sso="rpp") dicegat: token sesi PDP yang sedang
 * aktif dibawa ke RPP Maker lewat bagian # pada URL (tidak ikut dikirim ke server
 * hosting, dan langsung dihapus dari alamat oleh RPP Maker). RPP Maker lalu
 * memverifikasinya ke E-Rapor lewat Edge Function login-sso.
 *
 * Harus dimuat SETELAH supabase-client.js.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__rppLauncher) return;
  window.__rppLauncher = true;

  // Alamat RPP Maker di hosting (dengan garis miring di akhir).
  window.RPP_URL = 'https://wima15.github.io/rpp-maker/';

  document.addEventListener('click', async function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-sso="rpp"]') : null;
    if (!a) return;
    e.preventDefault();
    try {
      var ses = await supabaseClient.auth.getSession();   // token otomatis diperbarui bila hampir habis
      var tk = ses && ses.data && ses.data.session && ses.data.session.access_token;
      if (!tk) throw new Error('no session');
      // 'from' = alamat portal PDP ini, dipakai RPP Maker untuk tombol kembali
      var dari = location.origin + location.pathname.replace(/[^/]*$/, '') + 'portal.html';
      location.href = window.RPP_URL + '#sso=' + encodeURIComponent(tk) + '&from=' + encodeURIComponent(dari);
    } catch (err) {
      alert('Sesi PDP sudah berakhir. Silakan masuk lagi ke PDP, lalu buka RPP Maker.');
    }
  });
})();
