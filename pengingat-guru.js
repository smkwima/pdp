/* pengingat-guru.js
 * -----------------------------------------------------------------
 * LONCENG NOTIFIKASI untuk akun GURU: menampilkan pengingat yang
 * dikirim Kepala Sekolah / admin (tabel pengingat_guru, lihat
 * migrasi_pengingat.sql).
 *
 * Pasang di halaman yang dibuka guru (setelah supabase-client.js):
 *   <script src="pengingat-guru.js?v=1" defer></script>
 *
 * Untuk role selain guru skrip ini tidak melakukan apa-apa.
 * Aman: kalau tabel belum dimigrasi atau gagal dimuat, tidak
 * menampilkan apa pun dan tidak mengganggu halaman.
 *
 * Pembaruan: realtime (Supabase) + cek ulang tiap 60 detik + saat
 * tab kembali dibuka, sebagai cadangan kalau realtime belum aktif.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (typeof supabaseClient === 'undefined') return;
  if (window.__pengingatGuruAktif) return;
  window.__pengingatGuruAktif = true;

  var MODUL = {
    erapor: { label: 'E-Rapor', href: 'guru.html' },
    kinerja: { label: 'Kinerja', href: 'kinerja.html' },
    pkl: { label: 'Nilai PKL', href: 'pkl.html' },
    supervisi: { label: 'Supervisi', href: 'supervisi.html' },
    bukuinduk: { label: 'Buku Induk', href: 'bukuinduk-guru.html' },
    umum: { label: 'Umum', href: 'portal.html' }
  };
  var KUNCI_SEEN = 'pg_seen_';
  var POLLING_MS = 60000;

  var uid = null, daftar = [], panelTerbuka = false, kanal = null, pertamaKali = true;

  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function waktuRelatif(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var d = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (d < 60) return 'baru saja';
    if (d < 3600) return Math.floor(d / 60) + ' menit lalu';
    if (d < 86400) return Math.floor(d / 3600) + ' jam lalu';
    if (d < 86400 * 7) return Math.floor(d / 86400) + ' hari lalu';
    try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }

  function tautanAman(t) {
    return (typeof t === 'string' && /^[a-z0-9_\-]+\.html(#[a-z0-9_\-]*)?$/i.test(t)) ? t : null;
  }
  function tujuan(p) {
    return tautanAman(p.tautan) || (MODUL[p.modul] ? MODUL[p.modul].href : 'portal.html');
  }

  // ---------- gaya ----------
  function pasangGaya() {
    if (document.getElementById('pgStyle')) return;
    var st = document.createElement('style');
    st.id = 'pgStyle';
    st.textContent =
      '#pgBell{position:fixed;right:16px;bottom:16px;z-index:60;width:40px;height:40px;border-radius:50%;border:1px solid var(--border,#e5e7eb);' +
      'background:var(--surface,#fff);color:var(--ink,#1f2937);display:flex;align-items:center;justify-content:center;cursor:pointer;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.16);padding:0;}' +
      '#pgBell:hover{transform:translateY(-1px);}' +
      '#pgBell i,#pgBell svg{display:block;width:18px !important;height:18px !important;}' +
      '#pgBell.pg-ada{color:#b45309;border-color:#fdba74;background:#fff7ed;}' +
      '#pgBell.pg-ada svg{animation:pgGoyang 2.4s ease-in-out infinite;transform-origin:50% 10%;}' +
      '@keyframes pgGoyang{0%,70%,100%{transform:rotate(0)}75%{transform:rotate(14deg)}80%{transform:rotate(-12deg)}85%{transform:rotate(8deg)}90%{transform:rotate(-5deg)}}' +
      '@media (prefers-reduced-motion:reduce){#pgBell.pg-ada svg{animation:none}}' +
      '#pgBadge{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:#dc2626;color:#fff;' +
      'font:700 10px/17px system-ui,sans-serif;text-align:center;box-sizing:border-box;}' +
      '#pgPanel{position:fixed;right:16px;bottom:66px;z-index:70;width:min(380px,calc(100vw - 24px));max-height:min(70vh,520px);display:none;flex-direction:column;' +
      'background:var(--surface,#fff);color:var(--ink,#1f2937);border:1px solid var(--border,#e5e7eb);border-radius:14px;box-shadow:0 18px 48px rgba(0,0,0,.24);overflow:hidden;}' +
      '#pgPanel.pg-buka{display:flex;}' +
      '.pg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border,#e5e7eb);}' +
      '.pg-head b{font-size:14px;}' +
      '.pg-head button{border:0;background:none;color:var(--primary,#2563eb);font:600 12.5px system-ui,sans-serif;cursor:pointer;padding:4px 6px;border-radius:6px;}' +
      '.pg-head button:disabled{color:var(--ink-faint,#9ca3af);cursor:default;}' +
      '.pg-list{overflow:auto;overscroll-behavior:contain;}' +
      '.pg-item{display:block;width:100%;text-align:left;border:0;border-top:1px solid var(--border,#e5e7eb);background:none;color:inherit;padding:12px 14px;cursor:pointer;font:inherit;}' +
      '.pg-item:first-child{border-top:0;}' +
      '.pg-item:hover{background:var(--surface-2,rgba(0,0,0,.04));}' +
      '.pg-item.pg-baru{background:rgba(245,158,11,.10);}' +
      '.pg-item__top{display:flex;align-items:center;gap:8px;margin-bottom:3px;}' +
      '.pg-chip{font:700 10.5px/1 system-ui,sans-serif;letter-spacing:.02em;padding:3px 7px;border-radius:999px;background:rgba(37,99,235,.12);color:#1d4ed8;}' +
      '.pg-dot{width:8px;height:8px;border-radius:50%;background:#dc2626;flex:none;}' +
      '.pg-waktu{margin-left:auto;font-size:11.5px;color:var(--ink-soft,#6b7280);white-space:nowrap;}' +
      '.pg-judul{font-weight:700;font-size:13.5px;line-height:1.35;}' +
      '.pg-pesan{font-size:12.5px;line-height:1.5;color:var(--ink-soft,#4b5563);margin-top:3px;white-space:pre-line;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;}' +
      '.pg-dari{font-size:11.5px;color:var(--ink-soft,#6b7280);margin-top:5px;}' +
      '.pg-kosong{padding:28px 16px;text-align:center;font-size:13px;color:var(--ink-soft,#6b7280);}' +
      '#pgToast{position:fixed;right:16px;bottom:66px;z-index:80;width:min(340px,calc(100vw - 24px));background:#1f2937;color:#fff;border-radius:12px;padding:12px 14px;' +
      'box-shadow:0 12px 32px rgba(0,0,0,.3);font:13px/1.45 system-ui,sans-serif;cursor:pointer;}' +
      '#pgToast b{display:block;font-size:13.5px;margin-bottom:2px;}' +
      '#pgToast span{display:block;opacity:.85;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '@media screen and (max-width:860px){#pgBell{bottom:76px;right:12px;}#pgPanel,#pgToast{bottom:124px;right:12px;}}';
    document.head.appendChild(st);
  }

  // ---------- tampilan ----------
  function belumDibaca() { return daftar.filter(function (p) { return !p.dibaca_pada; }); }

  function buatLonceng() {
    if (document.getElementById('pgBell')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'pgBell';
    b.setAttribute('aria-label', 'Notifikasi pengingat');
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('data-guard-ignore', '');
    b.innerHTML = '<i data-lucide="bell"></i><span id="pgBadge" hidden></span>';
    b.addEventListener('click', function (e) { e.stopPropagation(); togglePanel(); });
    document.body.appendChild(b);

    var p = document.createElement('div');
    p.id = 'pgPanel';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Pengingat dari Kepala Sekolah');
    p.innerHTML = '<div class="pg-head"><b>Pengingat</b><button type="button" id="pgSemua" data-guard-ignore>Tandai semua dibaca</button></div><div class="pg-list" id="pgList"></div>';
    document.body.appendChild(p);
    p.addEventListener('click', function (e) { e.stopPropagation(); });
    document.getElementById('pgSemua').addEventListener('click', tandaiSemua);
    document.addEventListener('click', function () { if (panelTerbuka) togglePanel(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panelTerbuka) togglePanel(false); });
    if (window.lucide) lucide.createIcons();
  }

  function render() {
    var bel = document.getElementById('pgBell');
    if (!bel) return;
    var n = belumDibaca().length;
    var badge = document.getElementById('pgBadge');
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : String(n);
    bel.classList.toggle('pg-ada', n > 0);
    bel.setAttribute('aria-label', n ? 'Notifikasi pengingat, ' + n + ' belum dibaca' : 'Notifikasi pengingat');
    document.getElementById('pgSemua').disabled = n === 0;

    var list = document.getElementById('pgList');
    if (!daftar.length) {
      list.innerHTML = '<div class="pg-kosong">Belum ada pengingat. Pengingat dari Kepala Sekolah akan muncul di sini.</div>';
      return;
    }
    list.innerHTML = daftar.map(function (p) {
      var m = MODUL[p.modul] || MODUL.umum;
      return '<button type="button" class="pg-item' + (p.dibaca_pada ? '' : ' pg-baru') + '" data-id="' + esc(p.id) + '" data-guard-ignore>' +
        '<div class="pg-item__top">' + (p.dibaca_pada ? '' : '<span class="pg-dot" aria-label="Belum dibaca"></span>') +
        '<span class="pg-chip">' + esc(m.label) + '</span><span class="pg-waktu">' + esc(waktuRelatif(p.dibuat_pada)) + '</span></div>' +
        '<div class="pg-judul">' + esc(p.judul) + '</div>' +
        (p.pesan ? '<div class="pg-pesan">' + esc(p.pesan) + '</div>' : '') +
        '<div class="pg-dari">Dari ' + esc(p.pengirim_nama || 'Kepala Sekolah') + '</div></button>';
    }).join('');
    list.querySelectorAll('.pg-item').forEach(function (el) {
      el.addEventListener('click', function () { bukaItem(el.getAttribute('data-id')); });
    });
  }

  function togglePanel(paksa) {
    var p = document.getElementById('pgPanel');
    if (!p) return;
    panelTerbuka = typeof paksa === 'boolean' ? paksa : !panelTerbuka;
    p.classList.toggle('pg-buka', panelTerbuka);
    if (panelTerbuka) { sembunyikanToast(); render(); }
  }

  var timerToast = null;
  function sembunyikanToast() {
    var t = document.getElementById('pgToast');
    if (t) t.remove();
    clearTimeout(timerToast);
  }
  function tampilkanToast(p) {
    if (panelTerbuka) return;
    sembunyikanToast();
    var t = document.createElement('div');
    t.id = 'pgToast';
    t.setAttribute('role', 'status');
    t.innerHTML = '<b>🔔 Pengingat dari ' + esc(p.pengirim_nama || 'Kepala Sekolah') + '</b><span>' + esc(p.judul) + '</span>';
    t.addEventListener('click', function () { sembunyikanToast(); togglePanel(true); });
    document.body.appendChild(t);
    timerToast = setTimeout(sembunyikanToast, 9000);
  }

  // ---------- data ----------
  async function tandai(ids) {
    var lokal = new Date().toISOString();
    daftar.forEach(function (p) { if (!ids || ids.indexOf(p.id) >= 0) p.dibaca_pada = p.dibaca_pada || lokal; });
    render();
    try { await supabaseClient.rpc('pengingat_tandai_dibaca', { p_ids: ids || null }); } catch (e) { /* abaikan; dimuat ulang berikutnya */ }
  }
  function tandaiSemua() { tandai(null); }

  function bukaItem(id) {
    var p = daftar.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var dest = tujuan(p);
    var perluTandai = !p.dibaca_pada;
    var halamanIni = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var tujuanBerkas = dest.split('#')[0].toLowerCase();
    var tandaiDulu = perluTandai ? tandai([id]) : Promise.resolve();
    if (tujuanBerkas === halamanIni) { togglePanel(false); return; }
    // beri waktu singkat agar permintaan tandai-dibaca terkirim sebelum pindah halaman
    Promise.race([tandaiDulu, new Promise(function (r) { setTimeout(r, 600); })]).then(function () { location.href = dest; });
  }

  function barisBaru(p) {
    try {
      var seen = JSON.parse(sessionStorage.getItem(KUNCI_SEEN + uid) || '{}');
      var kunci = p.id + '|' + p.dibuat_pada;
      if (seen[kunci]) return false;
      seen[kunci] = 1;
      sessionStorage.setItem(KUNCI_SEEN + uid, JSON.stringify(seen));
      return true;
    } catch (e) { return true; }
  }

  async function muat() {
    try {
      var r = await supabaseClient.from('pengingat_guru')
        .select('id, modul, judul, pesan, tautan, pengirim_nama, dibuat_pada, dibaca_pada')
        .eq('guru_id', uid).order('dibuat_pada', { ascending: false }).limit(30);
      if (r.error) return; // tabel belum ada / ditolak: diam saja
      daftar = r.data || [];
      render();
      var baru = belumDibaca().filter(barisBaru);
      if (baru.length) tampilkanToast(baru[0]);
      pertamaKali = false;
    } catch (e) { /* abaikan */ }
  }

  function langganan() {
    try {
      if (!supabaseClient.channel) return;
      kanal = supabaseClient.channel('pengingat-' + uid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pengingat_guru', filter: 'guru_id=eq.' + uid }, function () { muat(); })
        .subscribe();
    } catch (e) { /* realtime opsional; polling tetap jalan */ }
  }

  async function mulai() {
    try {
      var ses = await supabaseClient.auth.getSession();
      var user = ses && ses.data && ses.data.session && ses.data.session.user;
      if (!user) return;
      var pr = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!pr || !pr.data || pr.data.role !== 'guru') return;
      uid = user.id;
      pasangGaya();
      buatLonceng();
      await muat();
      langganan();
      setInterval(function () { if (!document.hidden) muat(); }, POLLING_MS);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) muat(); });
    } catch (e) { /* jangan ganggu halaman */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai);
  else mulai();
})();
