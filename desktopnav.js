/* desktopnav.js — navigasi kecil di tengah bawah untuk TAMPILAN DESKTOP (lebar layar > 860px):
 *   Sebelumnya (back) · Muat Ulang (reload) · Berikutnya (forward)
 *
 * - Hanya tampil di layar lebar; di HP/tablet sempit disembunyikan (di sana sudah ada bar bawah bottomnav.js).
 * - Tidak dipasang di aplikasi Windows (Electron) karena aplikasi itu sudah punya toolbar sendiri (nav-toolbar.js).
 * - Dimuat otomatis oleh pwa.js, yang sudah ada di semua halaman. Aman dipanggil berulang.
 * - Ukuran kecil dan agak transparan; jelas saat kursor di atasnya. Tidak ikut tercetak.
 */
(function () {
  'use strict';
  if (window.__desktopNav || /Electron/i.test(navigator.userAgent || '')) return;
  window.__desktopNav = true;

  function pasang() {
    if (!document.body || document.getElementById('dnav')) return;

    var st = document.createElement('style');
    st.id = 'dnavCss';
    st.textContent =
      '#dnav{display:none}' +
      '@media screen and (min-width:861px){' +
        '#dnav{display:flex;position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:900;gap:2px;padding:3px;' +
          'border-radius:999px;background:rgba(15,23,42,.82);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);' +
          'box-shadow:0 3px 12px rgba(0,0,0,.28);opacity:.55;transition:opacity .15s,bottom .15s;user-select:none;-webkit-user-select:none}' +
        '#dnav:hover,#dnav:focus-within{opacity:1}' +
        '#dnav button{width:30px;height:28px;border:0;border-radius:999px;background:transparent;color:#fff;cursor:pointer;' +
          'display:flex;align-items:center;justify-content:center;padding:0;font:inherit}' +
        '#dnav button:hover:not(:disabled){background:rgba(255,255,255,.18)}' +
        '#dnav button:active:not(:disabled){background:rgba(255,255,255,.3)}' +
        '#dnav button:focus-visible{outline:2px solid #93c5fd;outline-offset:-2px}' +
        '#dnav button:disabled{opacity:.3;cursor:default}' +
        '#dnav svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}' +
        /* spanduk "Pasang Aplikasi" (pwa.js) juga di tengah bawah: navigasi naik sedikit agar tidak tertimpa */
        'body:has(#pwaBar) #dnav{bottom:92px}' +
      '}' +
      '@media print{#dnav{display:none!important}}';
    document.head.appendChild(st);

    var bar = document.createElement('div');
    bar.id = 'dnav';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Navigasi halaman');
    bar.setAttribute('data-pdp-noprint', '');
    bar.innerHTML =
      '<button type="button" data-a="back" title="Sebelumnya (Alt + \u2190)" aria-label="Sebelumnya"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button type="button" data-a="reload" title="Muat ulang (F5)" aria-label="Muat ulang"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/></svg></button>' +
      '<button type="button" data-a="forward" title="Berikutnya (Alt + \u2192)" aria-label="Berikutnya"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>';
    document.body.appendChild(bar);

    var b = bar.querySelector('[data-a=back]'), f = bar.querySelector('[data-a=forward]');

    // Navigation API (Chrome/Edge) tahu apakah masih ada halaman sebelumnya/berikutnya; browser lain: tombol selalu aktif.
    function segarkan() {
      var nav = window.navigation;
      if (nav && typeof nav.canGoBack === 'boolean') {
        b.disabled = !nav.canGoBack;
        f.disabled = !nav.canGoForward;
      } else {
        b.disabled = false; f.disabled = false;
      }
    }
    segarkan();
    window.addEventListener('pageshow', segarkan);
    window.addEventListener('popstate', segarkan);
    window.addEventListener('hashchange', segarkan);
    if (window.navigation && window.navigation.addEventListener) {
      window.navigation.addEventListener('currententrychange', segarkan);
    }

    bar.addEventListener('click', function (e) {
      var t = e.target.closest('button[data-a]');
      if (!t || t.disabled) return;
      var a = t.getAttribute('data-a');
      if (a === 'back') history.back();
      else if (a === 'forward') history.forward();
      else location.reload();   // perubahan belum disimpan tetap ditanyakan oleh unsaved-guard.js (beforeunload)
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasang);
  else pasang();
})();
