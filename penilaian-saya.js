/* penilaian-saya.js
 * -----------------------------------------------------------------
 * KARTU "PENILAIAN REKAN" di Menu Utama (portal.html) untuk guru & staf,
 * tampil di baris yang sama dengan kartu "Predikat Kedisiplinan".
 *
 *   - Kartu HANYA muncul bila admin mencentang "Tampilkan hasil ke yang
 *     dinilai" (Penilaian Rekan -> Pengaturan & Progres) untuk periode aktif.
 *   - Menampilkan predikat rata-rata penilaian rekan. Bisa diklik -> jendela
 *     berisi skor akhir, skor Kinerja / Sikap / Perilaku, dan jumlah penilai.
 *   - Yang tampil hanya RATA-RATA. Jawaban per penilai tidak ada.
 *   - Bila fitur belum diaktifkan / ada galat, kartu diam-diam tidak tampil
 *     dan tidak mengganggu kartu lain.
 *
 * Pakai:  PenilaianSaya.kartu()        -> string HTML kartu (tersembunyi dulu)
 *         PenilaianSaya.muat(callback) -> mengisi kartu; callback dipanggil
 *                                         bila kartu jadi ditampilkan.
 * Dimuat setelah supabase-client.js.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.PenilaianSaya) return;

  var PRED = { 'Sangat Baik': 'sangat-baik', 'Baik': 'baik', 'Cukup': 'cukup', 'Kurang': 'kurang' };
  var DIM = [['skor_kinerja', 'Kinerja'], ['skor_sikap', 'Sikap'], ['skor_perilaku', 'Perilaku']];
  var S = { periode: '', p: null, hasil: null };

  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ikon() { if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (e) { /* abaikan */ } } }
  function angka(x) { return (x === null || x === undefined) ? '—' : Number(x).toFixed(2).replace('.', ','); }
  function seratus(x) { return (x === null || x === undefined) ? '—' : (Number(x) / 4 * 100).toFixed(1).replace('.', ','); }

  function pasangGaya() {
    if (document.getElementById('psStyle')) return;
    var st = document.createElement('style');
    st.id = 'psStyle';
    st.textContent =
      '.ps-pil { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; max-width: 100%; padding: 8px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.16); color: #fff; font: 600 13px/1.3 var(--font-body); text-align: left; cursor: pointer; transition: background .15s, transform .15s; }' +
      '.ps-pil:hover { background: rgba(255,255,255,.26); transform: translateY(-1px); }' +
      '.ps-pil:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }' +
      '.ps-pil svg, .ps-pil i { width: 16px; height: 16px; flex-shrink: 0; }' +
      '.ps-pil__l { color: #dbeafe; } .ps-pil b { font-weight: 800; color: #fff; }' +
      '.ps-pil .ps-p--sangat-baik { color: #a7f3d0; } .ps-pil .ps-p--baik { color: #bfdbfe; } .ps-pil .ps-p--cukup { color: #fde68a; } .ps-pil .ps-p--kurang { color: #fecaca; }' +
      '.ps-pil .ps-pil__a { width: 14px; height: 14px; opacity: .7; }' +
      '@media (max-width: 860px) { .ps-pil { width: 100%; justify-content: flex-start; font-size: 12.5px; padding: 9px 12px; border-radius: 14px; } .ps-pil .ps-pil__a { margin-left: auto; } }' +
      '.ps-ov { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15,23,42,.55); }' +
      '.ps-box { width: 100%; max-width: 520px; max-height: calc(100vh - 32px); overflow-y: auto; background: var(--surface); border-radius: 18px; box-shadow: 0 24px 60px rgba(15,23,42,.35); }' +
      '.ps-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px 12px; }' +
      '.ps-head h3 { margin: 0; font-family: var(--font-display); font-size: 17px; font-weight: 800; letter-spacing: -.01em; }' +
      '.ps-head p { margin: 3px 0 0; font-size: 12px; color: var(--ink-soft); }' +
      '.ps-x { border: 0; background: var(--surface-tint-strong); color: var(--ink-soft); width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }' +
      '.ps-x:hover { color: var(--danger); background: var(--danger-tint); }' +
      '.ps-body { padding: 0 20px 20px; }' +
      '.ps-pred { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 14px; margin-bottom: 14px; border: 1px solid transparent; }' +
      '.ps-pred--sangat-baik { background: #ecfdf5; border-color: #a7f3d0; } .ps-pred--baik { background: #eff6ff; border-color: #bfdbfe; }' +
      '.ps-pred--cukup { background: #fffbeb; border-color: #fde68a; } .ps-pred--kurang { background: #fef2f2; border-color: #fecaca; } .ps-pred--none { background: var(--surface-tint); border-color: var(--border); }' +
      '.ps-pred__l { font-size: 11.5px; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .05em; }' +
      '.ps-pred__v { font-family: var(--font-display); font-size: 22px; font-weight: 800; margin-top: 2px; }' +
      '.ps-pred__s { text-align: right; font-size: 12px; color: var(--ink-soft); }' +
      '.ps-pred__s b { display: block; font-family: var(--font-display); font-size: 26px; color: var(--ink); line-height: 1.1; }' +
      '.ps-p--sangat-baik { color: #047857; } .ps-p--baik { color: #1d4ed8; } .ps-p--cukup { color: #b45309; } .ps-p--kurang { color: #b91c1c; }' +
      '.ps-dim { display: grid; grid-template-columns: 84px 1fr 44px; gap: 12px; align-items: center; padding: 8px 0; font-size: 13px; }' +
      '.ps-dim b { font-weight: 700; } .ps-dim span { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }' +
      '.ps-tr { height: 10px; border-radius: 999px; background: var(--surface-tint-strong); overflow: hidden; }' +
      '.ps-fl { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #60a5fa, var(--primary)); }' +
      '.ps-note { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: var(--surface-tint); border: 1px solid var(--border); font-size: 12px; line-height: 1.5; color: var(--ink-soft); }' +
      '.ps-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; padding: 8px 14px; border-radius: 10px; background: var(--primary); color: #fff; font: 700 12.5px var(--font-body); text-decoration: none; }' +
      '.ps-link:hover { background: var(--primary-dim); }';
    document.head.appendChild(st);
  }

  // ---------- kartu ----------
  function kartu() {
    pasangGaya();
    return '<button type="button" class="ps-pil" id="psKartu" style="display:none;" aria-haspopup="dialog" title="Klik untuk melihat hasil penilaian rekan">' +
      '<i data-lucide="users"></i><span class="ps-pil__l">Nilai Penilaian Rekan :</span> <b id="psKartuNilai">…</b>' +
      '<i data-lucide="chevron-right" class="ps-pil__a"></i></button>';
  }
  function isiKartu() {
    var v = document.getElementById('psKartuNilai');
    if (!v) return;
    var r = S.hasil, ada = r && r.cukup && PRED[r.predikat];
    v.className = ada ? 'ps-p--' + PRED[r.predikat] : '';
    v.textContent = ada ? r.predikat : 'Menunggu hasil';
  }

  // ---------- jendela ----------
  function tutup() { var o = document.getElementById('psOv'); if (o) o.remove(); document.removeEventListener('keydown', tekan); }
  function tekan(e) { if (e.key === 'Escape') tutup(); }

  function isiJendela(o) {
    var r = S.hasil, ada = r && r.cukup, kls = ada && PRED[r.predikat] ? PRED[r.predikat] : 'none';
    var h;
    if (ada) {
      h = '<div class="ps-pred ps-pred--' + kls + '"><div><div class="ps-pred__l">Predikat</div><div class="ps-pred__v ps-p--' + kls + '">' + esc(r.predikat) + '</div></div>' +
        '<div class="ps-pred__s">Skor akhir (1–4)<b>' + angka(r.skor_akhir) + '</b>Nilai 0–100: ' + seratus(r.skor_akhir) + '</div></div>' +
        DIM.map(function (d) {
          return '<div class="ps-dim"><b>' + d[1] + '</b><div class="ps-tr"><div class="ps-fl" style="width:' + Math.round((r[d[0]] || 0) / 4 * 100) + '%"></div></div><span>' + angka(r[d[0]]) + '</span></div>';
        }).join('') +
        '<div class="ps-note">Dihitung dari rata-rata ' + esc(r.jumlah_penilai) + ' rekan penilai. Kinerja 40% · Sikap 30% · Perilaku 30%.</div>';
    } else {
      h = '<div class="ps-pred ps-pred--none"><div><div class="ps-pred__l">Predikat</div><div class="ps-pred__v">Menunggu hasil</div></div></div>' +
        '<div class="ps-note">Hasil tampil setelah jumlah penilai yang masuk mencukupi' + (S.p ? ' (minimal ' + esc(S.p.min_penilai) + ' penilai)' : '') + ', supaya identitas penilai tetap terlindungi. Saat ini ' + esc(r ? r.jumlah_penilai : 0) + ' penilai.</div>';
    }
    h += '<div class="ps-note">Penilaian ini <b>anonim</b>: yang tampil hanya rata-rata. Siapa pun, termasuk Kepala Sekolah dan admin, tidak bisa melihat jawaban per penilai.</div>' +
      '<a class="ps-link" href="penilaian-rekan.html"><i data-lucide="user-check" style="width:14px;height:14px;"></i> Buka Penilaian Rekan</a>';
    o.querySelector('.ps-body').innerHTML = h;
    var sub = o.querySelector('.ps-head p'); if (sub) sub.textContent = S.periode;
    ikon();
  }
  function buka() {
    pasangGaya();
    if (document.getElementById('psOv')) return;
    var o = document.createElement('div');
    o.className = 'ps-ov'; o.id = 'psOv'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Hasil penilaian rekan');
    o.innerHTML = '<div class="ps-box"><div class="ps-head"><div><h3>Hasil Penilaian Rekan Saya</h3><p></p></div>' +
      '<button type="button" class="ps-x" id="psTutup" aria-label="Tutup"><i data-lucide="x" style="width:16px;height:16px;"></i></button></div><div class="ps-body"></div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', function (e) { if (e.target === o) tutup(); });
    document.getElementById('psTutup').addEventListener('click', tutup);
    document.addEventListener('keydown', tekan);
    isiJendela(o);
  }

  // ---------- data ----------
  async function muat(bilaTampil) {
    try {
      var k = document.getElementById('psKartu');
      if (!k) return;
      var ta = await supabaseClient.from('tahun_ajaran').select('nama, semester').eq('is_aktif', true).maybeSingle();
      if (!ta || !ta.data) return;
      S.periode = ta.data.nama + ' · ' + ta.data.semester;       // format sama dengan halaman Penilaian Rekan
      var pg = await supabaseClient.from('penilaian_rekan_pengaturan').select('*').eq('periode', S.periode).maybeSingle();
      if (pg.error || !pg.data || !pg.data.tampil_ke_guru) return; // belum diizinkan admin -> kartu tetap tersembunyi
      S.p = pg.data;
      var r = await supabaseClient.rpc('penilaian_rekan_hasil_saya', { p_periode: S.periode });
      if (r.error) return;
      S.hasil = (r.data && r.data[0]) || null;
      isiKartu();
      if (!k.dataset.ps) { k.dataset.ps = '1'; k.addEventListener('click', buka); }
      k.style.display = '';
      if (typeof bilaTampil === 'function') bilaTampil();
      ikon();
    } catch (e) { /* kartu bersifat tambahan; abaikan galat */ }
  }

  window.PenilaianSaya = { kartu: kartu, muat: muat };
})();
