// nav-toolbar.js — toolbar melayang "Kembali · Muat Ulang · Maju" untuk aplikasi Windows PDP Wima.
// Disisipkan oleh main.js ke jendela utama (halaman lokal app://pdp/ maupun RPP Maker / Rekap Absen)
// setiap halaman selesai dimuat. Aman dipanggil berulang (tidak menggandakan toolbar).
(function () {
  if (!window.pdpNav || !document.body || document.getElementById('pdpNav')) return;

  var st = document.createElement('style');
  st.id = 'pdpNavCss';
  st.textContent =
    '#pdpNav{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:2px;padding:4px;' +
    'border-radius:999px;background:rgba(15,23,42,.82);backdrop-filter:blur(6px);box-shadow:0 4px 16px rgba(0,0,0,.3);' +
    'opacity:.55;transition:opacity .15s;user-select:none;-webkit-user-select:none}' +
    '#pdpNav:hover,#pdpNav:focus-within{opacity:1}' +
    '#pdpNav button{width:34px;height:30px;border:0;border-radius:999px;background:transparent;color:#fff;cursor:pointer;' +
    'display:flex;align-items:center;justify-content:center;padding:0}' +
    '#pdpNav button:hover:not(:disabled){background:rgba(255,255,255,.18)}' +
    '#pdpNav button:active:not(:disabled){background:rgba(255,255,255,.3)}' +
    '#pdpNav button:disabled{opacity:.3;cursor:default}' +
    '#pdpNav svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}' +
    '#pdpNav.load [data-a=reload] svg{animation:pdpNavSpin .8s linear infinite}@keyframes pdpNavSpin{to{transform:rotate(360deg)}}' +
    '@media (max-width:860px){#pdpNav{bottom:72px}}' +
    '@media print{#pdpNav{display:none!important}}';
  document.head.appendChild(st);

  var bar = document.createElement('div');
  bar.id = 'pdpNav';
  bar.setAttribute('data-pdp-noprint', '');
  bar.innerHTML =
    '<button type="button" data-a="back" title="Kembali (Alt + \u2190)" aria-label="Kembali"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' +
    '<button type="button" data-a="reload" title="Muat ulang (F5) \u2014 Shift+klik: muat ulang penuh" aria-label="Muat ulang"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/></svg></button>' +
    '<button type="button" data-a="forward" title="Maju (Alt + \u2192)" aria-label="Maju"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>';
  document.body.appendChild(bar);

  var b = bar.querySelector('[data-a=back]'), f = bar.querySelector('[data-a=forward]');
  function set(s) {
    if (!s) return;
    b.disabled = !s.back; f.disabled = !s.fwd;
    bar.classList.toggle('load', !!s.loading);
  }
  bar.addEventListener('click', function (e) {
    var t = e.target.closest('button[data-a]');
    if (!t || t.disabled) return;
    var a = t.getAttribute('data-a');
    window.pdpNav.act(a === 'reload' && e.shiftKey ? 'hard' : a);
  });
  set({ back: false, fwd: false });
  window.pdpNav.state().then(set).catch(function () {});
  window.pdpNav.onState(set);
})();
