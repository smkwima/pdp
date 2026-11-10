/* dashboard-kepsek.js
 * -----------------------------------------------------------------
 * DASHBOARD RINGKASAN KEPALA SEKOLAH (satu layar) di Beranda (portal.html).
 *
 *   - 4 kartu: progres E-Rapor, Kinerja Guru, Nilai PKL, Supervisi.
 *   - Tabel "Perlu ditindaklanjuti": guru yang masih punya pekerjaan belum
 *     lengkap di salah satu modul, beserta tombol Ingatkan (pengingat-kepsek.js).
 *
 *   - Panel "Riwayat Pengingat": semua pengingat yang pernah dikirim, status
 *     dibaca / belum dibaca, filter modul & status, dan tombol "Ingatkan lagi".
 *
 *   - Panel paling bawah "Kirim ke grup WhatsApp": menyusun ringkasan teks
 *     (bisa diedit) untuk disalin / dibagikan; Kepala Sekolah mengirim manual ke grup.
 *
 * Hanya MEMBACA data (kepsek punya hak SELECT). Tiap modul dimuat terpisah:
 * kalau satu gagal, kartu lain tetap tampil.
 *
 * Pakai:  DashboardKepsek.muat(tahunAjaranAktif, elemenWadah)
 * Dimuat setelah supabase-client.js dan pengingat-kepsek.js.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.DashboardKepsek) return;

  var BATAS_BARIS = 10;
  var D = { guru: [], erapor: null, kinerja: null, pkl: null, supervisi: null, ta: null };
  var semuaDitampilkan = false;
  var R = { rows: null, modul: '', status: '', tampil: 15 };
  var NAMA_MODUL = { erapor: 'E-Rapor', kinerja: 'Kinerja', pkl: 'Nilai PKL', supervisi: 'Supervisi', bukuinduk: 'Buku Induk', umum: 'Umum' };
  var HARI_LAMA = 3; // belum dibaca lebih dari ini ditandai "sudah lama"
  var wadah = null;

  // ---------- util ----------
  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function kosong(v) { return v === null || v === undefined || String(v).trim() === ''; }
  function tglLokal(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // Ambil semua baris (Supabase membatasi 1000 baris per permintaan).
  async function semua(buat) {
    var out = [], dari = 0, langkah = 1000;
    for (;;) {
      var r = await buat(dari, dari + langkah - 1);
      if (r.error) throw r.error;
      var d = r.data || [];
      out = out.concat(d);
      if (d.length < langkah) break;
      dari += langkah;
    }
    return out;
  }

  // ---------- gaya ----------
  function pasangGaya() {
    if (document.getElementById('dkStyle')) return;
    var st = document.createElement('style');
    st.id = 'dkStyle';
    st.textContent =
      '.dk-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;}' +
      '.dk-card{display:flex;flex-direction:column;gap:6px;padding:16px;border:1px solid var(--border,#e2e8f0);border-radius:16px;background:var(--surface,#fff);color:inherit;text-decoration:none;transition:box-shadow .15s,transform .15s;}' +
      '.dk-card:hover{box-shadow:0 8px 22px rgba(15,23,42,.09);transform:translateY(-1px);}' +
      '.dk-card__h{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft,#64748b);}' +
      '.dk-card__h i,.dk-card__h svg{width:15px;height:15px;}' +
      '.dk-card__n{font-size:30px;font-weight:800;line-height:1.1;letter-spacing:-.02em;}' +
      '.dk-card__n small{font-size:14px;font-weight:700;color:var(--ink-soft,#64748b);margin-left:3px;}' +
      '.dk-card__s{font-size:12.5px;color:var(--ink-soft,#64748b);line-height:1.5;}' +
      '.dk-card__warn{display:inline-block;margin-top:2px;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;background:#fef3c7;color:#92400e;}' +
      '.dk-card__warn--bad{background:#fee2e2;color:#991b1b;}' +
      '.dk-card__warn--ok{background:#dcfce7;color:#166534;}' +
      '.dk-bar{height:7px;border-radius:999px;background:var(--surface-tint-strong,#e5e7eb);overflow:hidden;min-width:60px;}' +
      '.dk-bar__f{height:100%;border-radius:999px;background:#2563eb;}' +
      '.dk-bar__f.is-ok{background:#16a34a;}.dk-bar__f.is-low{background:#dc2626;}.dk-bar__f.is-mid{background:#f59e0b;}' +
      '.dk-panel{margin-top:16px;border:1px solid var(--border,#e2e8f0);border-radius:16px;background:var(--surface,#fff);overflow:hidden;}' +
      '.dk-panel__h{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border,#e2e8f0);}' +
      '.dk-panel__h b{font-size:14.5px;}' +
      '.dk-panel__h span.dk-hint{font-size:12.5px;color:var(--ink-soft,#64748b);}' +
      '.dk-panel__h .dk-sp{margin-left:auto;}' +
      '.dk-wrap{overflow-x:auto;}' +
      '.dk-tbl{width:100%;border-collapse:collapse;font-size:13px;}' +
      '.dk-tbl th{text-align:left;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft,#64748b);padding:10px 14px;white-space:nowrap;background:var(--surface-tint,#f8fafc);}' +
      '.dk-tbl td{padding:11px 14px;border-top:1px solid var(--border,#e2e8f0);vertical-align:top;}' +
      '.dk-nama{font-weight:700;}' +
      '.dk-cell{display:grid;gap:4px;min-width:120px;}' +
      '.dk-cell small{font-size:11.5px;color:var(--ink-soft,#64748b);line-height:1.4;}' +
      '.dk-mut{color:var(--ink-faint,#94a3b8);}' +
      '.dk-bad{color:#b91c1c;font-weight:700;}' +
      '.dk-good{padding:18px 16px;font-size:13.5px;color:#166534;}' +
      '.dk-more{display:block;width:100%;border:0;border-top:1px solid var(--border,#e2e8f0);background:var(--surface-tint,#f8fafc);padding:10px;font:600 13px system-ui,sans-serif;cursor:pointer;color:var(--primary,#2563eb);}' +
      '.dk-flt{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}' +
      '.dk-sel{border:1px solid var(--border,#d1d5db);border-radius:10px;padding:6px 10px;font:inherit;font-size:13px;background:var(--surface,#fff);color:inherit;}' +
      '.dk-ring{display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border,#e2e8f0);}' +
      '.dk-pill{font-size:12.5px;font-weight:700;padding:4px 11px;border-radius:999px;background:var(--surface-tint-strong,#eef2f7);}' +
      '.dk-pill--warn{background:#fef3c7;color:#92400e;}.dk-pill--ok{background:#dcfce7;color:#166534;}' +
      '.dk-rw{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,2fr) auto auto;gap:12px;align-items:start;padding:12px 16px;border-top:1px solid var(--border,#e2e8f0);font-size:13px;}' +
      '.dk-rw:first-child{border-top:0;}' +
      '.dk-rw__t{font-weight:700;}' +
      '.dk-rw__m{font-size:12px;color:var(--ink-soft,#64748b);margin-top:2px;}' +
      '.dk-rw details summary{cursor:pointer;font-size:12px;color:var(--primary,#2563eb);margin-top:4px;}' +
      '.dk-rw details div{white-space:pre-line;font-size:12.5px;line-height:1.5;margin-top:4px;padding:8px 10px;border:1px dashed var(--border,#d1d5db);border-radius:10px;background:rgba(0,0,0,.025);}' +
      '.dk-st{font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap;}' +
      '.dk-st--ok{background:#dcfce7;color:#166534;}.dk-st--wait{background:#fef3c7;color:#92400e;}.dk-st--old{background:#fee2e2;color:#991b1b;}' +
      '.dk-chk{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;cursor:pointer;}' +
      '.dk-chk input{width:18px;height:18px;flex:none;}' +
      '.dk-wa-ta{min-height:260px;font-size:13px;line-height:1.5;font-family:ui-monospace,Menlo,Consolas,monospace;}' +
      '.dk-wa-btn{background:#16a34a !important;border-color:#16a34a !important;}' +
      '.dk-err{font-size:12.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 12px;margin-top:12px;}' +
      '@media (max-width:980px){.dk-cards{grid-template-columns:repeat(2,minmax(0,1fr));}}' +
      '@media (max-width:520px){.dk-cards{gap:10px;}.dk-card{padding:13px;}.dk-card__n{font-size:24px;}.dk-card__h{font-size:11px;}.dk-card__s{font-size:12px;}}' +
      /* HP: tabel jadi kartu per guru (tanpa geser samping), tombol cukup besar untuk jari */
      '@media (max-width:700px){' +
        '.dk-panel{border-radius:14px;}' +
        '.dk-panel__h{padding:12px 14px;}' +
        '.dk-panel__h .dk-sp{margin-left:0;width:100%;display:flex;gap:8px;}' +
        '.dk-panel__h .dk-sp>*{flex:1 1 0;min-width:0;}' +
        '.dk-sel{width:100%;min-height:40px;font-size:14px;}' +
        '.dk-panel .pk-btn-ingat{min-height:38px;justify-content:center;font-size:13px !important;padding:8px 12px !important;}' +
        '.dk-panel__h .dk-sp .pk-btn-ingat{width:100%;}' +
        '.dk-wrap{overflow:visible;}' +
        '.dk-tbl,.dk-tbl tbody{display:block;width:100%;}' +
        '.dk-tbl thead{display:none;}' +
        '.dk-tbl tr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 10px;padding:13px 14px;border-top:1px solid var(--border,#e2e8f0);}' +
        '.dk-tbl tr:first-child{border-top:0;}' +
        '.dk-tbl td{display:block;padding:0;border:0;min-width:0;}' +
        '.dk-tbl td:nth-child(1){grid-column:1;grid-row:1;}' +
        '.dk-tbl td:nth-child(5){grid-column:2;grid-row:1;}' +
        '.dk-tbl td:nth-child(2),.dk-tbl td:nth-child(3),.dk-tbl td:nth-child(4){grid-column:1 / -1;}' +
        '.dk-tbl td.dk-na{display:none;}' +
        '.dk-tbl td[data-label]::before{content:attr(data-label);display:block;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-soft,#64748b);margin-bottom:3px;}' +
        '.dk-cell{min-width:0;}' +
        '.dk-rw{grid-template-columns:minmax(0,1fr) auto;gap:8px 10px;align-items:center;padding:12px 14px;}' +
        '.dk-rw>div:nth-child(1),.dk-rw>div:nth-child(2){grid-column:1 / -1;}' +
        '.dk-ring{padding:10px 14px;}' +
        '.dk-more{min-height:44px;}' +
        '.dk-panel__h .dk-sp .dk-wa-btn{width:100%;min-height:42px;}' +
        '.dk-wa-ta{min-height:220px;}' +
      '}';
    document.head.appendChild(st);
  }

  // ---------- pemuatan data per modul ----------
  async function muatGuru() {
    var r = await supabaseClient.from('profiles').select('id, nama').eq('role', 'guru').order('nama');
    if (r.error) throw r.error;
    return r.data || [];
  }

  async function muatErapor(ta) {
    var pg = await semua(function (a, b) {
      return supabaseClient.from('penugasan_guru')
        .select('id, guru:guru_id(id, nama), mapel:mapel_id(id, nama), kelas:kelas_id(id, nama)')
        .eq('tahun_ajaran_id', ta.id).order('id').range(a, b);
    });
    pg = pg.filter(function (p) { return p.guru && p.mapel && p.kelas; });
    var hasil = { filled: 0, total: 0, perGuru: {}, guruSelesai: 0, guruTotal: 0 };
    if (!pg.length) return hasil;

    var mapelIds = Array.from(new Set(pg.map(function (p) { return p.mapel.id; })));
    var sk = await semua(function (a, b) {
      return supabaseClient.from('siswa_kelas').select('siswa_id, kelas_id')
        .eq('tahun_ajaran_id', ta.id).order('id').range(a, b);
    });
    var kelasSiswa = {};
    sk.forEach(function (r) { (kelasSiswa[r.kelas_id] = kelasSiswa[r.kelas_id] || []).push(r.siswa_id); });

    var nl = await semua(function (a, b) {
      return supabaseClient.from('nilai').select('siswa_id, mapel_id, nilai')
        .eq('tahun_ajaran_id', ta.id).eq('jenis', 'rapor').in('mapel_id', mapelIds).order('id').range(a, b);
    });
    var terisi = {};
    nl.forEach(function (r) { if (r.nilai !== null && r.nilai !== undefined) terisi[r.mapel_id + '|' + r.siswa_id] = true; });

    pg.forEach(function (p) {
      var ids = kelasSiswa[p.kelas.id] || [];
      var f = 0;
      ids.forEach(function (sid) { if (terisi[p.mapel.id + '|' + sid]) f++; });
      var g = hasil.perGuru[p.guru.id] || (hasil.perGuru[p.guru.id] = { nama: p.guru.nama, filled: 0, total: 0, kurang: [] });
      g.filled += f; g.total += ids.length;
      if (ids.length > 0 && f < ids.length) g.kurang.push({ mapel: p.mapel.nama, kelas: p.kelas.nama, filled: f, total: ids.length });
      hasil.filled += f; hasil.total += ids.length;
    });
    Object.keys(hasil.perGuru).forEach(function (id) {
      var g = hasil.perGuru[id];
      if (g.total > 0) { hasil.guruTotal++; if (g.filled === g.total) hasil.guruSelesai++; }
    });
    return hasil;
  }

  async function muatKinerja(ta) {
    var periode = ta ? ta.nama + ' · ' + ta.semester : 'Tahun berjalan';
    var rows = await semua(function (a, b) {
      return supabaseClient.from('kinerja_butir').select('guru_id, status')
        .eq('periode', periode).order('id').range(a, b);
    });
    var hasil = { total: 0, draft: 0, diajukan: 0, disetujui: 0, revisi: 0, perGuru: {} };
    rows.forEach(function (x) {
      var g = hasil.perGuru[x.guru_id] || (hasil.perGuru[x.guru_id] = { total: 0, draft: 0, diajukan: 0, disetujui: 0, revisi: 0 });
      g.total++; hasil.total++;
      if (g[x.status] !== undefined) { g[x.status]++; hasil[x.status]++; }
    });
    return hasil;
  }

  function tpLengkap(r) { return !!r && !kosong(r.tp1) && !kosong(r.tp2) && !kosong(r.tp3) && !kosong(r.tp4); }

  async function muatPkl(ta) {
    var pb = await semua(function (a, b) {
      return supabaseClient.from('pkl_pembimbing')
        .select('siswa_id, guru_id, nama_dudi, tanggal_mulai, tanggal_selesai, catatan')
        .eq('tahun_ajaran_id', ta.id).order('siswa_id').range(a, b);
    });
    var pu = await semua(function (a, b) {
      return supabaseClient.from('pkl_penguji').select('siswa_id, guru_id')
        .eq('tahun_ajaran_id', ta.id).order('siswa_id').range(a, b);
    });
    var nl = await semua(function (a, b) {
      return supabaseClient.from('nilai_pkl').select('siswa_id, sumber, tp1, tp2, tp3, tp4')
        .eq('tahun_ajaran_id', ta.id).order('siswa_id').order('sumber').range(a, b);
    });
    var nilai = {};
    nl.forEach(function (r) { (nilai[r.siswa_id] = nilai[r.siswa_id] || {})[r.sumber] = r; });

    var pend = {}, uji = {};
    pb.forEach(function (r) {
      var g = pend[r.guru_id] || (pend[r.guru_id] = { n: 0, selesai: 0 });
      var n = nilai[r.siswa_id] || {};
      g.n++;
      g.selesai += (!kosong(r.nama_dudi) && !kosong(r.tanggal_mulai) && !kosong(r.tanggal_selesai) ? 1 : 0) +
        (tpLengkap(n.dudi) ? 1 : 0) + (!kosong(r.catatan) ? 1 : 0);
    });
    pu.forEach(function (r) {
      var g = uji[r.guru_id] || (uji[r.guru_id] = { n: 0, selesai: 0 });
      g.n++;
      if (tpLengkap((nilai[r.siswa_id] || {}).penguji)) g.selesai++;
    });

    var hasil = { pend: {}, uji: {}, nPend: 0, nUji: 0, langkahSelesai: 0, langkahTotal: 0 };
    Object.keys(pend).forEach(function (id) {
      var g = pend[id]; hasil.pend[id] = { n: g.n, pct: pct(g.selesai, g.n * 3) };
      hasil.nPend++; hasil.langkahSelesai += g.selesai; hasil.langkahTotal += g.n * 3;
    });
    Object.keys(uji).forEach(function (id) {
      var g = uji[id]; hasil.uji[id] = { n: g.n, pct: pct(g.selesai, g.n) };
      hasil.nUji++; hasil.langkahSelesai += g.selesai; hasil.langkahTotal += g.n;
    });
    return hasil;
  }

  async function muatSupervisi() {
    var sekarang = new Date();
    var batas = new Date(sekarang.getFullYear() - 1, sekarang.getMonth(), sekarang.getDate());
    var rows = await semua(function (a, b) {
      return supabaseClient.from('supervisi_jadwal').select('id, tanggal, status')
        .gte('tanggal', tglLokal(batas)).order('id').range(a, b);
    });
    var hariIni = tglLokal(sekarang);
    var depan = new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate() + 30);
    var h = { total: rows.length, selesai: 0, terlambat: 0, mendatang: 0 };
    rows.forEach(function (j) {
      if (j.status === 'selesai') { h.selesai++; return; }
      var t = String(j.tanggal || '').slice(0, 10);
      if (t && t < hariIni) h.terlambat++;
      else if (t && t <= tglLokal(depan)) h.mendatang++;
    });
    return h;
  }

  // ---------- tampilan kartu ----------
  function warnaBar(p) { return p >= 100 ? 'is-ok' : (p >= 50 ? 'is-mid' : 'is-low'); }
  function bar(p) { return '<div class="dk-bar"><div class="dk-bar__f ' + warnaBar(p) + '" style="width:' + Math.min(100, p) + '%"></div></div>'; }

  function kartu(id, ikon, judul, href) {
    return '<a class="dk-card" id="' + id + '" href="' + href + '"><div class="dk-card__h"><i data-lucide="' + ikon + '"></i>' + esc(judul) + '</div>' +
      '<div class="dk-card__n">…</div><div class="dk-card__s">Memuat…</div></a>';
  }
  function isiKartu(id, angka, sub, lencana) {
    var el = document.getElementById(id);
    if (!el) return;
    el.querySelector('.dk-card__n').innerHTML = angka;
    el.querySelector('.dk-card__s').innerHTML = sub + (lencana || '');
  }
  function gagalKartu(id, msg) {
    isiKartu(id, '—', 'Data belum bisa dimuat' + (msg ? ' (' + esc(msg) + ')' : '') + '.');
  }
  function lencana(teks, jenis) { return '<br><span class="dk-card__warn' + (jenis ? ' dk-card__warn--' + jenis : '') + '">' + esc(teks) + '</span>'; }

  function renderKartuErapor() {
    var e = D.erapor;
    if (!e || e.total === 0) { isiKartu('dkErapor', '—', 'Belum ada penugasan atau siswa untuk tahun ajaran aktif.'); return; }
    var p = pct(e.filled, e.total), belum = e.guruTotal - e.guruSelesai;
    isiKartu('dkErapor', p + '<small>%</small>', e.guruSelesai + ' dari ' + e.guruTotal + ' guru sudah selesai mengisi nilai rapor.',
      belum > 0 ? lencana(belum + ' guru belum selesai', 'warn') : lencana('Semua guru selesai', 'ok'));
  }
  function renderKartuKinerja() {
    var k = D.kinerja;
    if (!k || k.total === 0) { isiKartu('dkKinerja', '—', 'Belum ada butir bukti kinerja pada periode ini.'); return; }
    var p = pct(k.disetujui, k.total);
    isiKartu('dkKinerja', p + '<small>%</small>', k.disetujui + ' dari ' + k.total + ' butir bukti sudah disetujui.',
      k.diajukan > 0 ? lencana(k.diajukan + ' butir menunggu pengecekan Anda', 'warn') : (k.revisi > 0 ? lencana(k.revisi + ' butir dalam revisi guru', '') : lencana('Tidak ada yang menunggu', 'ok')));
  }
  function renderKartuPkl() {
    var p = D.pkl;
    if (!p || p.langkahTotal === 0) { isiKartu('dkPkl', '—', 'Belum ada penugasan pendamping / penguji PKL.'); return; }
    isiKartu('dkPkl', pct(p.langkahSelesai, p.langkahTotal) + '<small>%</small>', p.nPend + ' pendamping · ' + p.nUji + ' penguji, rata-rata kelengkapan nilai PKL.');
  }
  function renderKartuSupervisi() {
    var s = D.supervisi;
    if (!s || s.total === 0) { isiKartu('dkSupervisi', '—', 'Belum ada jadwal supervisi dalam 12 bulan terakhir.'); return; }
    isiKartu('dkSupervisi', s.selesai + '<small>/ ' + s.total + ' jadwal selesai</small>', s.mendatang + ' jadwal dalam 30 hari ke depan (12 bulan terakhir).',
      s.terlambat > 0 ? lencana(s.terlambat + ' jadwal lewat tanggal, belum selesai', 'bad') : lencana('Tidak ada yang terlambat', 'ok'));
  }

  // ---------- tabel guru yang perlu ditindaklanjuti ----------
  function masalahGuru(id) {
    var m = { erapor: null, kinerja: null, pend: null, uji: null, jumlah: 0 };
    var e = D.erapor && D.erapor.perGuru[id];
    if (e && e.total > 0 && e.filled < e.total) { m.erapor = e; m.jumlah++; }
    if (D.kinerja) {
      var k = D.kinerja.perGuru[id] || { total: 0, draft: 0, diajukan: 0, disetujui: 0, revisi: 0 };
      if (k.total === 0 || k.draft > 0 || k.revisi > 0) { m.kinerja = k; m.jumlah++; }
    }
    var pd = D.pkl && D.pkl.pend[id]; if (pd && pd.pct < 100) { m.pend = pd; m.jumlah++; }
    var uj = D.pkl && D.pkl.uji[id]; if (uj && uj.pct < 100) { m.uji = uj; m.jumlah++; }
    return m;
  }

  function pesanGuru(id) {
    var m = masalahGuru(id), L = [];
    if (m.erapor) {
      var kr = m.erapor.kurang.slice().sort(function (a, b) { return pct(a.filled, a.total) - pct(b.filled, b.total); });
      var ringkas = kr.slice(0, 3).map(function (r) { return r.mapel + ' ' + r.kelas + ' (' + r.filled + '/' + r.total + ')'; }).join('; ');
      L.push('• E-Rapor: nilai baru terisi ' + pct(m.erapor.filled, m.erapor.total) + '%' + (ringkas ? ' — ' + ringkas + (kr.length > 3 ? ', dan ' + (kr.length - 3) + ' lainnya' : '') : '') + '.');
    }
    if (m.kinerja) {
      if (m.kinerja.total === 0) L.push('• Kinerja: belum ada butir bukti dukung kinerja.');
      else {
        var b = [];
        if (m.kinerja.draft > 0) b.push(m.kinerja.draft + ' butir belum diajukan');
        if (m.kinerja.revisi > 0) b.push(m.kinerja.revisi + ' butir perlu direvisi');
        L.push('• Kinerja: ' + b.join(', ') + '.');
      }
    }
    if (m.pend) L.push('• Nilai PKL (Pendamping): kelengkapan baru ' + m.pend.pct + '% untuk ' + m.pend.n + ' siswa.');
    if (m.uji) L.push('• Nilai PKL (Penguji): kelengkapan baru ' + m.uji.pct + '% untuk ' + m.uji.n + ' siswa.');
    return 'Mohon dilengkapi:\n' + L.join('\n');
  }

  function selKinerja(m, k) {
    if (!D.kinerja) return '<span class="dk-mut">—</span>';
    if (k.total === 0) return '<span class="dk-bad">Belum ada butir</span>';
    var rinci = [];
    if (k.draft > 0) rinci.push(k.draft + ' belum diajukan');
    if (k.revisi > 0) rinci.push(k.revisi + ' revisi');
    if (k.diajukan > 0) rinci.push(k.diajukan + ' menunggu cek');
    return '<div class="dk-cell">' + bar(pct(k.disetujui, k.total)) + '<small>' + k.disetujui + '/' + k.total + ' disetujui' + (rinci.length ? ' · ' + rinci.join(', ') : '') + '</small></div>';
  }

  function renderTabel() {
    var el = document.getElementById('dkTabel');
    if (!el) return;
    var baris = D.guru.map(function (g) { return { g: g, m: masalahGuru(g.id) }; })
      .filter(function (x) { return x.m.jumlah > 0; });
    baris.sort(function (a, b) { return b.m.jumlah - a.m.jumlah || a.g.nama.localeCompare(b.g.nama, 'id'); });

    var modulTersedia = D.erapor || D.kinerja || D.pkl;
    if (!modulTersedia) { el.innerHTML = ''; return; }

    if (!baris.length) {
      el.innerHTML = '<div class="dk-panel"><div class="dk-panel__h"><b>Perlu ditindaklanjuti</b></div>' +
        '<div class="dk-good">Semua guru sudah melengkapi pekerjaannya di E-Rapor, Kinerja, dan Nilai PKL. 🎉</div></div>';
      return;
    }

    var tampil = semuaDitampilkan ? baris : baris.slice(0, BATAS_BARIS);
    var tombolSemua = window.Pengingat ? Pengingat.tombolHtml('data-dk-ingat="semua"', 'Ingatkan semua (' + baris.length + ')') : '';
    el.innerHTML = '<div class="dk-panel"><div class="dk-panel__h"><b>Perlu ditindaklanjuti</b>' +
      '<span class="dk-hint">' + baris.length + ' guru masih punya pekerjaan belum lengkap · diurutkan dari yang paling banyak</span>' +
      '<span class="dk-sp">' + tombolSemua + '</span></div>' +
      '<div class="dk-wrap"><table class="dk-tbl"><thead><tr><th>Guru</th><th>E-Rapor</th><th>Kinerja</th><th>Nilai PKL</th><th></th></tr></thead><tbody>' +
      tampil.map(function (x) {
        var m = x.m, e = D.erapor && D.erapor.perGuru[x.g.id];
        var cE = !D.erapor ? '<span class="dk-mut">—</span>' : (!e || e.total === 0 ? '<span class="dk-mut">—</span>' :
          '<div class="dk-cell">' + bar(pct(e.filled, e.total)) + '<small>' + pct(e.filled, e.total) + '% · ' + e.filled + '/' + e.total + ' nilai</small></div>');
        var k = D.kinerja && (D.kinerja.perGuru[x.g.id] || { total: 0, draft: 0, diajukan: 0, disetujui: 0, revisi: 0 });
        var cK = D.kinerja ? selKinerja(m, k) : '<span class="dk-mut">—</span>';
        var p = [];
        if (D.pkl && D.pkl.pend[x.g.id]) p.push('Pendamping ' + D.pkl.pend[x.g.id].pct + '%');
        if (D.pkl && D.pkl.uji[x.g.id]) p.push('Penguji ' + D.pkl.uji[x.g.id].pct + '%');
        var cP = p.length ? '<div class="dk-cell"><small style="font-size:12.5px;color:inherit;">' + esc(p.join(' · ')) + '</small></div>' : '<span class="dk-mut">—</span>';
        // Di HP sel kosong ("—") dan yang sudah lengkap disembunyikan (kelas dk-na); di desktop tetap tampil.
        function td(label, isi, lengkap) { return '<td data-label="' + label + '"' + (lengkap || isi.indexOf('dk-mut') >= 0 ? ' class="dk-na"' : '') + '>' + isi + '</td>'; }
        return '<tr data-dk-guru="' + esc(x.g.id) + '"><td><span class="dk-nama">' + esc(x.g.nama) + '</span><span class="pk-diingat" data-dk-label></span></td>' +
          td('E-Rapor', cE, !m.erapor) + td('Kinerja', cK, !m.kinerja) + td('Nilai PKL', cP, !m.pend && !m.uji) +
          '<td>' + (window.Pengingat ? Pengingat.tombolHtml('data-dk-ingat="' + esc(x.g.id) + '"', 'Ingatkan') : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (baris.length > BATAS_BARIS ? '<button type="button" class="dk-more" id="dkMore">' + (semuaDitampilkan ? 'Tampilkan lebih sedikit' : 'Tampilkan semua ' + baris.length + ' guru') + '</button>' : '') +
      '</div>';
    if (window.lucide) lucide.createIcons();
    isiLabelRiwayat();
  }

  async function isiLabelRiwayat() {
    if (!window.Pengingat) return;
    var r = await Pengingat.riwayat('umum');
    document.querySelectorAll('tr[data-dk-guru]').forEach(function (tr) {
      var info = r[tr.getAttribute('data-dk-guru')], l = tr.querySelector('[data-dk-label]');
      if (l && info) l.textContent = Pengingat.labelRiwayat(info);
    });
  }

  function onKlik(e) {
    var more = e.target.closest ? e.target.closest('#dkMore') : null;
    if (more) { semuaDitampilkan = !semuaDitampilkan; renderTabel(); return; }
    var wa = e.target.closest ? e.target.closest('#dkWaBtn') : null;
    if (wa) { e.preventDefault(); bukaDialogWa(); return; }
    var rm = e.target.closest ? e.target.closest('#dkRMore') : null;
    if (rm) { R.tampil += 15; renderRiwayat(); return; }
    var ul = e.target.closest ? e.target.closest('[data-dk-ulang]') : null;
    if (ul) { e.preventDefault(); ingatkanLagi(ul.getAttribute('data-dk-ulang')); return; }
    var b = e.target.closest ? e.target.closest('[data-dk-ingat]') : null;
    if (!b || !window.Pengingat) return;
    e.preventDefault();
    var tujuan = b.getAttribute('data-dk-ingat'), penerima = [];
    if (tujuan === 'semua') {
      D.guru.forEach(function (g) { if (masalahGuru(g.id).jumlah > 0) penerima.push({ id: g.id, nama: g.nama, pesan: pesanGuru(g.id) }); });
    } else {
      var g = D.guru.filter(function (x) { return x.id === tujuan; })[0];
      if (g) penerima = [{ id: g.id, nama: g.nama, pesan: pesanGuru(g.id) }];
    }
    Pengingat.buka({
      modul: 'umum', tautan: 'portal.html', judul: 'Ada pekerjaan yang belum lengkap', penerima: penerima,
      onSelesai: function () {
        penerima.forEach(function (p) {
          var l = wadah.querySelector('tr[data-dk-guru="' + p.id + '"] [data-dk-label]');
          if (l) l.textContent = 'Diingatkan baru saja · belum dibaca';
        });
        segarkanRiwayat();
      }
    });
  }


  // ---------- riwayat pengingat ----------
  async function muatRiwayat() {
    try {
      var r = await supabaseClient.from('pengingat_guru')
        .select('id, guru_id, modul, judul, pesan, tautan, dibuat_pada, dibaca_pada, guru:guru_id(nama)')
        .order('dibuat_pada', { ascending: false }).limit(500);
      R.rows = r.error ? null : (r.data || []);
    } catch (e) { R.rows = null; }
  }

  function hariLalu(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }

  function statusRow(x) {
    if (x.dibaca_pada) return '<span class="dk-st dk-st--ok">Dibaca ' + esc(Pengingat.waktuRelatif(x.dibaca_pada)) + '</span>';
    var h = hariLalu(x.dibuat_pada);
    return h >= HARI_LAMA ? '<span class="dk-st dk-st--old">Belum dibaca · ' + h + ' hari</span>' : '<span class="dk-st dk-st--wait">Belum dibaca</span>';
  }

  function renderRiwayat() {
    var el = document.getElementById('dkRiwayat');
    if (!el || !window.Pengingat) return;
    if (R.rows === null) { el.innerHTML = ''; return; }

    var semuaRows = R.rows;
    var belum = semuaRows.filter(function (x) { return !x.dibaca_pada; });
    var lama = belum.filter(function (x) { return hariLalu(x.dibuat_pada) >= HARI_LAMA; });
    var baris = semuaRows.filter(function (x) {
      return (!R.modul || x.modul === R.modul) && (!R.status || (R.status === 'belum' ? !x.dibaca_pada : !!x.dibaca_pada));
    });
    var tampil = baris.slice(0, R.tampil);

    var opsiModul = '<option value="">Semua modul</option>' + Object.keys(NAMA_MODUL).map(function (k) {
      return '<option value="' + k + '"' + (R.modul === k ? ' selected' : '') + '>' + NAMA_MODUL[k] + '</option>';
    }).join('');
    var opsiStatus = [['', 'Semua status'], ['belum', 'Belum dibaca'], ['dibaca', 'Sudah dibaca']].map(function (o) {
      return '<option value="' + o[0] + '"' + (R.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');

    var daftar = tampil.length ? tampil.map(function (x) {
      var nama = x.guru && x.guru.nama ? x.guru.nama : 'Guru';
      return '<div class="dk-rw" data-dk-rid="' + esc(x.id) + '">' +
        '<div><div class="dk-rw__t">' + esc(nama) + '</div><div class="dk-rw__m">' + esc(NAMA_MODUL[x.modul] || x.modul) + ' · ' + esc(Pengingat.waktuRelatif(x.dibuat_pada)) + '</div></div>' +
        '<div><div>' + esc(x.judul) + '</div>' +
        (x.pesan ? '<details><summary>Lihat pesan</summary><div>' + esc(x.pesan) + '</div></details>' : '') + '</div>' +
        '<div>' + statusRow(x) + '</div>' +
        '<div>' + (!x.dibaca_pada ? Pengingat.tombolHtml('data-dk-ulang="' + esc(x.id) + '"', 'Ingatkan lagi') : '') + '</div></div>';
    }).join('') : '<div class="dk-good" style="color:var(--ink-soft,#64748b);">' + (semuaRows.length ? 'Tidak ada pengingat yang cocok dengan filter.' : 'Belum ada pengingat yang dikirim.') + '</div>';

    el.innerHTML = '<div class="dk-panel"><div class="dk-panel__h"><b>Riwayat Pengingat</b>' +
      '<span class="dk-sp dk-flt"><select class="dk-sel" id="dkFModul" aria-label="Filter modul">' + opsiModul + '</select>' +
      '<select class="dk-sel" id="dkFStatus" aria-label="Filter status">' + opsiStatus + '</select></span></div>' +
      '<div class="dk-ring"><span class="dk-pill">' + semuaRows.length + ' terkirim</span>' +
      '<span class="dk-pill dk-pill--ok">' + (semuaRows.length - belum.length) + ' sudah dibaca</span>' +
      '<span class="dk-pill' + (belum.length ? ' dk-pill--warn' : '') + '">' + belum.length + ' belum dibaca</span>' +
      (lama.length ? '<span class="dk-pill dk-pill--warn">' + lama.length + ' belum dibaca lebih dari ' + HARI_LAMA + ' hari</span>' : '') + '</div>' +
      daftar +
      (baris.length > R.tampil ? '<button type="button" class="dk-more" id="dkRMore">Tampilkan lebih banyak (' + (baris.length - R.tampil) + ' lagi)</button>' : '') +
      '<div class="dk-ring" style="border-bottom:0;border-top:1px solid var(--border,#e2e8f0);"><span class="dk-card__s">Pengingat yang belum dibaca dengan modul dan judul sama diperbarui, bukan ditumpuk, jadi satu baris menunjukkan pengingat terbaru.</span></div></div>';
    if (window.lucide) lucide.createIcons();
  }

  async function segarkanRiwayat() { await muatRiwayat(); renderRiwayat(); }

  function onUbah(e) {
    if (e.target.id === 'dkFModul') { R.modul = e.target.value; R.tampil = 15; renderRiwayat(); }
    else if (e.target.id === 'dkFStatus') { R.status = e.target.value; R.tampil = 15; renderRiwayat(); }
  }

  function ingatkanLagi(id) {
    var x = (R.rows || []).filter(function (r) { return r.id === id; })[0];
    if (!x) return;
    Pengingat.buka({
      modul: x.modul, tautan: x.tautan || null, judul: x.judul,
      penerima: [{ id: x.guru_id, nama: x.guru && x.guru.nama, pesan: x.pesan || '' }],
      onSelesai: function () { segarkanRiwayat(); }
    });
  }


  // ---------- ringkasan untuk grup WhatsApp ----------
  var NAMA_HARI_FMT = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };

  function susunWa(sertakanNama, batas) {
    var tgl = '';
    try { tgl = new Date().toLocaleDateString('id-ID', NAMA_HARI_FMT); } catch (e) { tgl = tglLokal(new Date()); }
    var L = [];
    L.push('*PENGINGAT DARI KEPALA SEKOLAH*');
    L.push('SMK Widya Mandala Tambak');
    L.push(tgl + (D.ta ? ' · TA ' + D.ta.nama + ' ' + D.ta.semester : ''));
    L.push('');
    L.push('Yth. Bapak/Ibu Guru, berikut perkembangan pengisian data yang masih perlu dilengkapi:');
    L.push('');
    L.push('*Ringkasan*');
    if (D.erapor && D.erapor.total > 0) L.push('• Nilai E-Rapor: ' + pct(D.erapor.filled, D.erapor.total) + '% terisi (' + (D.erapor.guruTotal - D.erapor.guruSelesai) + ' guru belum selesai)');
    if (D.kinerja && D.kinerja.total > 0) L.push('• Bukti Kinerja: ' + pct(D.kinerja.disetujui, D.kinerja.total) + '% disetujui');
    if (D.pkl && D.pkl.langkahTotal > 0) L.push('• Nilai PKL: ' + pct(D.pkl.langkahSelesai, D.pkl.langkahTotal) + '% lengkap');

    var baris = D.guru.map(function (g) { return { g: g, m: masalahGuru(g.id) }; }).filter(function (x) { return x.m.jumlah > 0; });
    baris.sort(function (a, b) { return b.m.jumlah - a.m.jumlah || a.g.nama.localeCompare(b.g.nama, 'id'); });

    if (!baris.length) {
      L.push('');
      L.push('Seluruh data sudah lengkap. Terima kasih atas kerja samanya 🙏');
      return L.join('\n');
    }

    var nE = 0, nK = 0, nP = 0;
    baris.forEach(function (x) { if (x.m.erapor) nE++; if (x.m.kinerja) nK++; if (x.m.pend || x.m.uji) nP++; });
    L.push('');
    L.push('*Yang perlu dilengkapi* (' + baris.length + ' guru)');
    if (sertakanNama) {
      baris.forEach(function (x, i) {
        L.push('');
        L.push((i + 1) + '. *' + x.g.nama + '*');
        var m = x.m;
        if (m.erapor) {
          var kr = m.erapor.kurang.slice().sort(function (a, b) { return pct(a.filled, a.total) - pct(b.filled, b.total); });
          var ds = kr.slice(0, 3).map(function (r) { return r.mapel + ' ' + r.kelas + ' (' + r.filled + '/' + r.total + ')'; }).join('; ');
          L.push('   • E-Rapor ' + pct(m.erapor.filled, m.erapor.total) + '%' + (ds ? ': ' + ds + (kr.length > 3 ? ', dll.' : '') : ''));
        }
        if (m.kinerja) {
          if (m.kinerja.total === 0) L.push('   • Kinerja: belum ada butir bukti');
          else {
            var b = [];
            if (m.kinerja.draft > 0) b.push(m.kinerja.draft + ' butir belum diajukan');
            if (m.kinerja.revisi > 0) b.push(m.kinerja.revisi + ' butir direvisi');
            L.push('   • Kinerja: ' + b.join(', '));
          }
        }
        if (m.pend) L.push('   • Nilai PKL (Pendamping) ' + m.pend.pct + '%');
        if (m.uji) L.push('   • Nilai PKL (Penguji) ' + m.uji.pct + '%');
      });
    } else {
      if (nE) L.push('• Nilai E-Rapor: ' + nE + ' guru');
      if (nK) L.push('• Bukti Kinerja: ' + nK + ' guru');
      if (nP) L.push('• Nilai PKL: ' + nP + ' guru');
      L.push('(Rincian per guru dapat dilihat di aplikasi.)');
    }
    L.push('');
    if (batas && batas.trim()) { L.push('Batas waktu: *' + batas.trim() + '*'); }
    L.push('Mohon segera dilengkapi. Terima kasih 🙏');
    return L.join('\n');
  }

  function salinTeks(teks) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(teks).then(function () { return true; }, function () { return salinLama(teks); });
    }
    return Promise.resolve(salinLama(teks));
  }
  function salinLama(teks) {
    try {
      var ta = document.createElement('textarea');
      ta.value = teks; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, teks.length);
      var ok = document.execCommand('copy'); ta.remove(); return !!ok;
    } catch (e) { return false; }
  }

  function toastDk(teks) {
    var el = document.createElement('div');
    el.className = 'pk-toast'; el.setAttribute('role', 'status'); el.textContent = teks;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  function renderWa() {
    var el = document.getElementById('dkWa');
    if (!el) return;
    el.innerHTML = '<div class="dk-panel"><div class="dk-panel__h"><b>Kirim ke grup WhatsApp</b>' +
      '<span class="dk-hint">Susun ringkasan, salin, lalu kirim sendiri ke grup guru</span>' +
      '<span class="dk-sp"><button type="button" class="pk-btn pk-btn--p dk-wa-btn" id="dkWaBtn">Ingatkan lewat WhatsApp</button></span></div></div>';
  }

  function bukaDialogWa() {
    var ov = document.createElement('div');
    ov.className = 'pk-ov';
    var bisaBagi = typeof navigator.share === 'function';
    ov.innerHTML =
      '<div class="pk-box" role="dialog" aria-modal="true" aria-labelledby="dkWaJudul">' +
      '<div class="pk-h"><span aria-hidden="true">💬</span><b id="dkWaJudul">Ringkasan untuk grup WhatsApp</b><button type="button" class="pk-x" aria-label="Tutup" data-wa-tutup>&times;</button></div>' +
      '<div class="pk-b">' +
      '<label class="dk-chk"><input type="checkbox" id="dkWaNama" checked> Sertakan nama guru dan rincian per guru</label>' +
      '<div><label class="pk-l" for="dkWaBatas">Batas waktu <small>(opsional)</small></label><input class="pk-in" id="dkWaBatas" maxlength="60" placeholder="Mis. Jumat, 14 November 2026"></div>' +
      '<div><label class="pk-l" for="dkWaTeks">Pesan <small>(boleh diubah sebelum disalin)</small></label><textarea class="pk-ta dk-wa-ta" id="dkWaTeks"></textarea></div>' +
      '<div class="pk-note">Mengubah pilihan atau batas waktu menyusun ulang pesan dan menimpa perubahan manual Anda.</div>' +
      '</div>' +
      '<div class="pk-f"><button type="button" class="pk-btn" data-wa-tutup>Tutup</button>' +
      (bisaBagi ? '<button type="button" class="pk-btn" id="dkWaBagi">Bagikan…</button>' : '') +
      '<button type="button" class="pk-btn pk-btn--p" id="dkWaSalin">Salin pesan</button></div></div>';
    document.body.appendChild(ov);

    var tekstEl = ov.querySelector('#dkWaTeks'), namaEl = ov.querySelector('#dkWaNama'), batasEl = ov.querySelector('#dkWaBatas'), salinEl = ov.querySelector('#dkWaSalin');
    function susun() { tekstEl.value = susunWa(namaEl.checked, batasEl.value); }
    susun();
    namaEl.addEventListener('change', susun);
    batasEl.addEventListener('input', susun);

    function tutup() { document.removeEventListener('keydown', onKey); ov.remove(); }
    function onKey(e) { if (e.key === 'Escape') tutup(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) tutup(); });
    ov.querySelectorAll('[data-wa-tutup]').forEach(function (b) { b.addEventListener('click', tutup); });

    salinEl.addEventListener('click', async function () {
      var ok = await salinTeks(tekstEl.value);
      if (ok) { salinEl.textContent = 'Tersalin ✓'; toastDk('Pesan tersalin. Tempel di grup WhatsApp.'); setTimeout(function () { salinEl.textContent = 'Salin pesan'; }, 2500); }
      else { tekstEl.focus(); tekstEl.select(); toastDk('Tidak bisa menyalin otomatis. Teks sudah dipilih, tekan Salin manual.'); }
    });
    var bagiEl = ov.querySelector('#dkWaBagi');
    if (bagiEl) bagiEl.addEventListener('click', function () {
      navigator.share({ text: tekstEl.value }).catch(function () { /* dibatalkan */ });
    });
  }

  // ---------- titik masuk ----------
  async function muat(ta, el) {
    if (!el) return;
    wadah = el;
    pasangGaya();
    D = { guru: [], erapor: null, kinerja: null, pkl: null, supervisi: null, ta: ta };
    semuaDitampilkan = false;
    R = { rows: null, modul: '', status: '', tampil: 15 };

    el.innerHTML = '<div class="dk-cards">' +
      kartu('dkErapor', 'file-text', 'Nilai E-Rapor', 'admin.html') +
      kartu('dkKinerja', 'award', 'Kinerja Guru', 'kinerja.html') +
      kartu('dkPkl', 'briefcase-business', 'Nilai PKL', 'pkl.html') +
      kartu('dkSupervisi', 'clipboard-check', 'Supervisi', 'supervisi-admin.html') +
      '</div><div id="dkGalat"></div><div id="dkTabel"></div><div id="dkRiwayat"></div><div id="dkWa"></div>';
    if (window.lucide) lucide.createIcons();
    el.addEventListener('click', onKlik);
    el.addEventListener('change', onUbah);

    var galat = [];
    function catatGalat(nama) { return function (x) { galat.push(nama); return null; }; }

    var tugas = [
      muatGuru().then(function (v) { D.guru = v; }, catatGalat('daftar guru')),
      muatRiwayat(),
      muatSupervisi().then(function (v) { D.supervisi = v; renderKartuSupervisi(); }, function () { gagalKartu('dkSupervisi'); galat.push('Supervisi'); })
    ];
    if (ta) {
      tugas.push(muatErapor(ta).then(function (v) { D.erapor = v; renderKartuErapor(); }, function (x) { gagalKartu('dkErapor'); galat.push('E-Rapor'); }));
      tugas.push(muatKinerja(ta).then(function (v) { D.kinerja = v; renderKartuKinerja(); }, function (x) { gagalKartu('dkKinerja'); galat.push('Kinerja Guru'); }));
      tugas.push(muatPkl(ta).then(function (v) { D.pkl = v; renderKartuPkl(); }, function (x) { gagalKartu('dkPkl'); galat.push('Nilai PKL'); }));
    } else {
      ['dkErapor', 'dkKinerja', 'dkPkl'].forEach(function (id) { isiKartu(id, '—', 'Belum ada tahun ajaran aktif.'); });
    }
    await Promise.all(tugas);

    if (galat.length) {
      var g = document.getElementById('dkGalat');
      if (g) g.innerHTML = '<div class="dk-err">Sebagian data belum bisa dimuat: ' + esc(galat.join(', ')) + '. Muat ulang halaman, atau buka modulnya langsung.</div>';
    }
    if (D.guru.length) renderTabel();
    renderRiwayat();
    renderWa();
    if (window.lucide) lucide.createIcons();
  }

  window.DashboardKepsek = { muat: muat };
})();
