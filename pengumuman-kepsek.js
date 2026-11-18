/* pengumuman-kepsek.js
 * -----------------------------------------------------------------
 * PENGUMUMAN dari KEPALA SEKOLAH. Dipakai di portal.html: kepala sekolah
 * dapat membuat, mengubah, menonaktifkan, dan menghapus pengumuman. Pengumuman
 * aktif tampil sebagai banner di portal dan halaman aplikasi semua pengguna
 * (ditampilkan oleh akses-guard.js).
 *
 * Harus dimuat SETELAH supabase-client.js. Pemakaian:
 *   PengumumanKepsek.muat(document.getElementById('pkPengWadah'));
 *
 * Penulisan ke database lewat fungsi pengumuman_simpan / pengumuman_hapus
 * (migrasi_pengumuman.sql) yang memeriksa role kepsek di sisi server.
 * Elemen diberi data-kepsek-ok supaya tidak disembunyikan kepsek-readonly.js.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.PengumumanKepsek) return;

  var JENIS = {
    info:       { nama: 'Informasi',  ikon: 'ℹ️', bg: '#eff6ff', bd: '#bfdbfe', fg: '#1e40af' },
    peringatan: { nama: 'Peringatan', ikon: '⚠️', bg: '#fffbeb', bd: '#fde68a', fg: '#92400e' },
    penting:    { nama: 'Penting',    ikon: '📢', bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b' }
  };
  var MAKS_TEKS = 600, MAKS_JUDUL = 80;

  var wadah = null, daftar = [], galatTabel = null, orang = null, namaById = {};

  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tgl(iso) {
    try { return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function keLokal(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function keIso(v) { return v ? new Date(v).toISOString() : null; }
  function berakhir(p) { return !!(p.berakhir_pada && new Date(p.berakhir_pada) <= new Date()); }

  // ---------- gaya ----------
  function pasangGaya() {
    if (document.getElementById('puStyle')) return;
    var st = document.createElement('style');
    st.id = 'puStyle';
    st.textContent =
      '.pu-card{background:var(--surface,#fff);border:1px solid var(--border,#e5e7eb);border-radius:14px;padding:16px 18px;}' +
      '.pu-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}' +
      '.pu-top p{margin:0;flex:1;min-width:200px;font-size:13px;line-height:1.5;color:var(--ink-soft,#6b7280);}' +
      '.pu-btn{border:1px solid var(--border,#d1d5db);background:var(--surface,#fff);color:inherit;border-radius:10px;padding:8px 14px;font:600 13px system-ui,sans-serif;cursor:pointer;}' +
      '.pu-btn--p{background:var(--primary,#2563eb);border-color:var(--primary,#2563eb);color:#fff;}' +
      '.pu-btn--s{padding:4px 10px;font-size:12px;}' +
      '.pu-btn--d{color:#b91c1c;border-color:#fecaca;}' +
      '.pu-btn:disabled{opacity:.6;cursor:default;}' +
      '.pu-list{margin-top:14px;display:grid;gap:10px;}' +
      '.pu-item{border:1px solid;border-radius:12px;padding:10px 12px;}' +
      '.pu-item.is-mati{opacity:.6;}' +
      '.pu-item__t{font-size:13.5px;line-height:1.5;white-space:pre-line;}' +
      '.pu-item__m{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:11.5px;color:var(--ink-soft,#6b7280);}' +
      '.pu-badge{font:700 10.5px/1 system-ui,sans-serif;padding:3px 7px;border-radius:999px;background:rgba(0,0,0,.08);color:var(--ink-soft,#4b5563);}' +
      '.pu-badge--on{background:#dcfce7;color:#166534;}' +
      '.pu-aksi{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;}' +
      '.pu-note{font-size:12.5px;line-height:1.5;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:9px 11px;margin-top:12px;}' +
      '.pu-ov{position:fixed;inset:0;z-index:200;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;}' +
      '.pu-box{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--surface,#fff);color:var(--ink,#1f2937);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.35);}' +
      '.pu-h{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border,#e5e7eb);}' +
      '.pu-h b{font-size:16px;}' +
      '.pu-x{margin-left:auto;border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:var(--ink-soft,#6b7280);padding:2px 8px;border-radius:8px;}' +
      '.pu-b{padding:16px 18px;display:grid;gap:14px;}' +
      '.pu-l{display:block;font-size:12.5px;font-weight:700;margin-bottom:5px;}' +
      '.pu-l small{font-weight:500;color:var(--ink-soft,#6b7280);}' +
      '.pu-in,.pu-ta,.pu-sel{width:100%;box-sizing:border-box;border:1px solid var(--border,#d1d5db);border-radius:10px;padding:9px 11px;font:inherit;font-size:14px;background:var(--surface,#fff);color:inherit;}' +
      '.pu-ta{min-height:110px;resize:vertical;line-height:1.5;}' +
      '.pu-cek{display:flex;align-items:center;gap:8px;font-size:13.5px;}' +
      '.pu-hit{font-size:11.5px;color:var(--ink-soft,#6b7280);text-align:right;margin-top:3px;}' +
      '.pu-pre{border:1px solid;border-radius:10px;padding:9px 12px;font-size:13px;line-height:1.5;white-space:pre-line;}' +
      '.pu-err{display:none;font-size:12.5px;line-height:1.5;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:9px 11px;}' +
      '.pu-f{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px;border-top:1px solid var(--border,#e5e7eb);}' +
      '.pu-rad{display:flex;gap:16px;flex-wrap:wrap;font-size:13.5px;}' +
      '.pu-rad label{display:flex;align-items:center;gap:6px;cursor:pointer;}' +
      '.pu-pilih{border:1px solid var(--border,#d1d5db);border-radius:10px;padding:10px;display:grid;gap:8px;}' +
      '.pu-pilih__bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}' +
      '.pu-pilih__bar .pu-in{flex:1;min-width:140px;padding:6px 9px;font-size:13px;}' +
      '.pu-pilih__list{max-height:210px;overflow:auto;display:grid;gap:2px;}' +
      '.pu-org{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:8px;font-size:13px;cursor:pointer;}' +
      '.pu-org:hover{background:rgba(0,0,0,.04);}' +
      '.pu-org small{margin-left:auto;color:var(--ink-soft,#6b7280);font-size:11px;}' +
      '.pu-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:300;background:#14532d;color:#fff;padding:10px 16px;border-radius:10px;font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center;}';
    document.head.appendChild(st);
  }

  function toast(teks) {
    var el = document.createElement('div');
    el.className = 'pu-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('data-kepsek-ok', '1');
    el.textContent = teks;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  function pesanGalat(e) {
    var m = (e && e.message) ? e.message : String(e || 'Gagal.');
    if (/pengumuman_simpan|pengumuman_hapus|pengumuman_sekolah|does not exist|schema cache/i.test(m)) {
      return 'Fitur pengumuman belum aktif di database. Jalankan migrasi_pengumuman.sql di Supabase (SQL Editor).';
    }
    return m;
  }

  // ---------- daftar ----------
  async function muatDaftar() {
    galatTabel = null;
    try {
      var r = await supabaseClient.from('pengumuman_sekolah').select('*')
        .order('dibuat_pada', { ascending: false }).limit(30);
      if (r.error) { galatTabel = pesanGalat(r.error); daftar = []; }
      else daftar = r.data || [];
    } catch (e) { galatTabel = pesanGalat(e); daftar = []; }
  }

  function infoPenerima(p) {
    if (!Array.isArray(p.penerima)) return 'Untuk semua pengguna';
    var nama = p.penerima.map(function (id) { return namaById[id]; }).filter(Boolean);
    if (!nama.length) return 'Untuk ' + p.penerima.length + ' penerima';
    return 'Untuk ' + (nama.length <= 3 ? nama.join(', ') : nama.slice(0, 3).join(', ') + ' +' + (p.penerima.length - 3) + ' lainnya');
  }

  // Daftar guru & staf untuk memilih penerima (dimuat sekali).
  async function muatOrang() {
    if (orang) return orang;
    try {
      var r = await supabaseClient.from('profiles').select('id, nama, role').in('role', ['guru', 'staf']).order('nama');
      orang = (!r.error && r.data) ? r.data : [];
      orang.forEach(function (o) { namaById[o.id] = o.nama; });
    } catch (e) { orang = []; }
    return orang;
  }

  function barisHtml(p) {
    var j = JENIS[p.jenis] || JENIS.info;
    var mati = !p.aktif || berakhir(p);
    var status = !p.aktif ? 'Dinonaktifkan' : (berakhir(p) ? 'Sudah berakhir' : 'Tampil');
    return '<div class="pu-item' + (mati ? ' is-mati' : '') + '" data-id="' + esc(p.id) + '" style="background:' + j.bg + ';border-color:' + j.bd + ';color:' + j.fg + ';">' +
      '<div class="pu-item__t">' + j.ikon + ' ' + (p.judul ? '<b>' + esc(p.judul) + '</b>\n' : '') + esc(p.teks) + '</div>' +
      '<div class="pu-item__m"><span class="pu-badge' + (mati ? '' : ' pu-badge--on') + '">' + status + '</span>' +
      '<span>' + esc(infoPenerima(p)) + ' · dibuat ' + esc(tgl(p.dibuat_pada)) + (p.berakhir_pada ? ' · berakhir ' + esc(tgl(p.berakhir_pada)) : '') + '</span>' +
      '<span class="pu-aksi" data-kepsek-ok="1">' +
        '<button type="button" class="pu-btn pu-btn--s" data-aksi="toggle" data-kepsek-ok="1">' + (p.aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button>' +
        '<button type="button" class="pu-btn pu-btn--s" data-aksi="edit" data-kepsek-ok="1">Ubah</button>' +
        '<button type="button" class="pu-btn pu-btn--s pu-btn--d" data-aksi="hapus" data-kepsek-ok="1">Hapus</button>' +
      '</span></div></div>';
  }

  function render() {
    if (!wadah) return;
    var isi = '<div class="pu-card" data-kepsek-ok="1">' +
      '<div class="pu-top"><p>Pengumuman yang Anda buat tampil sebagai banner di portal dan halaman aplikasi. Kirim ke semua pengguna, atau pilih guru/staf tertentu. Pengguna dapat menutupnya; banner muncul lagi di sesi berikutnya selama masih aktif.</p>' +
      '<button type="button" class="pu-btn pu-btn--p" id="puBaru" data-kepsek-ok="1">+ Buat pengumuman</button></div>';
    if (galatTabel) {
      isi += '<div class="pu-note">' + esc(galatTabel) + '</div>';
    } else if (daftar.length) {
      isi += '<div class="pu-list">' + daftar.map(barisHtml).join('') + '</div>';
    } else {
      isi += '<div class="pu-note" style="color:var(--ink-soft,#6b7280);background:transparent;border-style:dashed;border-color:var(--border,#d1d5db);">Belum ada pengumuman.</div>';
    }
    isi += '</div>';
    wadah.innerHTML = isi;
    wadah.setAttribute('data-kepsek-ok', '1');

    var baru = wadah.querySelector('#puBaru');
    if (baru) baru.addEventListener('click', function () { dialog(null); });
    wadah.querySelectorAll('.pu-item').forEach(function (el) {
      var p = daftar.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (!p) return;
      el.querySelectorAll('[data-aksi]').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = b.getAttribute('data-aksi');
          if (a === 'edit') dialog(p);
          else if (a === 'toggle') ubahAktif(p, b);
          else if (a === 'hapus') hapus(p, b);
        });
      });
    });
  }

  async function simpanKeServer(p, ubah) {
    var h = await supabaseClient.rpc('pengumuman_simpan', {
      p_id: p.id || null,
      p_jenis: ubah.jenis, p_judul: ubah.judul || null, p_teks: ubah.teks,
      p_berakhir: ubah.berakhir_pada || null, p_aktif: ubah.aktif,
      p_penerima: (ubah.penerima && ubah.penerima.length) ? ubah.penerima : null
    });
    return h.error ? h.error : null;
  }

  async function ubahAktif(p, tombol) {
    tombol.disabled = true;
    var err = await simpanKeServer(p, { jenis: p.jenis, judul: p.judul, teks: p.teks, berakhir_pada: p.berakhir_pada, aktif: !p.aktif, penerima: p.penerima });
    if (err) { tombol.disabled = false; toast(pesanGalat(err)); return; }
    await segarkan();
    toast(p.aktif ? 'Pengumuman dinonaktifkan.' : 'Pengumuman diaktifkan.');
  }

  async function hapus(p, tombol) {
    if (!confirm('Hapus pengumuman ini? Banner juga hilang dari semua pengguna dan tidak bisa dikembalikan.')) return;
    tombol.disabled = true;
    var h = await supabaseClient.rpc('pengumuman_hapus', { p_id: p.id });
    if (h.error) { tombol.disabled = false; toast(pesanGalat(h.error)); return; }
    await segarkan();
    toast('Pengumuman dihapus.');
  }

  async function segarkan() { await muatDaftar(); await muatOrang(); render(); }

  // ---------- dialog buat / ubah ----------
  function dialog(p) {
    pasangGaya();
    var baru = !p;
    var d = p || { jenis: 'info', judul: '', teks: '', aktif: true, berakhir_pada: null };
    var opsi = Object.keys(JENIS).map(function (k) {
      return '<option value="' + k + '"' + (d.jenis === k ? ' selected' : '') + '>' + JENIS[k].nama + '</option>';
    }).join('');

    var ov = document.createElement('div');
    ov.className = 'pu-ov';
    ov.setAttribute('data-kepsek-ok', '1');
    ov.innerHTML =
      '<div class="pu-box" role="dialog" aria-modal="true" aria-labelledby="puJudulDlg">' +
      '<div class="pu-h"><span aria-hidden="true">📣</span><b id="puJudulDlg">' + (baru ? 'Buat pengumuman' : 'Ubah pengumuman') + '</b><button type="button" class="pu-x" aria-label="Tutup" data-pu-tutup>&times;</button></div>' +
      '<div class="pu-b">' +
        '<div><label class="pu-l" for="puJenis">Jenis</label><select class="pu-sel" id="puJenis">' + opsi + '</select></div>' +
        '<div><label class="pu-l" for="puJudul">Judul <small>(opsional)</small></label><input class="pu-in" id="puJudul" maxlength="' + MAKS_JUDUL + '" value="' + esc(d.judul || '') + '" placeholder="Contoh: Rapat dewan guru"></div>' +
        '<div><label class="pu-l" for="puTeks">Isi pengumuman</label><textarea class="pu-ta" id="puTeks" maxlength="' + MAKS_TEKS + '" placeholder="Contoh: Rapat dewan guru hari Senin pukul 13.00 di ruang guru. Mohon hadir tepat waktu.">' + esc(d.teks || '') + '</textarea><div class="pu-hit" id="puHit"></div></div>' +
        '<div><label class="pu-l" for="puAkhir">Berakhir pada <small>(opsional; kosong = tampil sampai dinonaktifkan)</small></label><input class="pu-in" type="datetime-local" id="puAkhir" value="' + esc(keLokal(d.berakhir_pada)) + '"></div>' +
        '<div><span class="pu-l">Penerima</span>' +
          '<div class="pu-rad"><label><input type="radio" name="puTarget" value="semua"' + (Array.isArray(d.penerima) ? '' : ' checked') + '> Semua pengguna</label>' +
          '<label><input type="radio" name="puTarget" value="tertentu"' + (Array.isArray(d.penerima) ? ' checked' : '') + '> Guru / staf tertentu</label></div>' +
          '<div class="pu-pilih" id="puPilih" style="margin-top:8px;display:' + (Array.isArray(d.penerima) ? 'grid' : 'none') + ';">' +
            '<div class="pu-pilih__bar"><input class="pu-in" id="puCari" type="search" placeholder="Cari nama..." aria-label="Cari nama">' +
            '<button type="button" class="pu-btn pu-btn--s" id="puSemuaOrg">Pilih semua tampil</button><button type="button" class="pu-btn pu-btn--s" id="puKosong">Kosongkan</button></div>' +
            '<div class="pu-pilih__list" id="puDaftarOrang"></div><div class="pu-hit" id="puJumlah" style="text-align:left;"></div>' +
          '</div></div>' +
        '<label class="pu-cek"><input type="checkbox" id="puAktif"' + (d.aktif ? ' checked' : '') + '> Tampilkan sekarang</label>' +
        '<div><span class="pu-l">Pratinjau</span><div id="puPre"></div></div>' +
        '<div class="pu-err" id="puErr" role="alert"></div>' +
      '</div>' +
      '<div class="pu-f"><button type="button" class="pu-btn" data-pu-tutup>Batal</button><button type="button" class="pu-btn pu-btn--p" id="puSimpan">' + (baru ? 'Terbitkan' : 'Simpan') + '</button></div>' +
      '</div>';
    document.body.appendChild(ov);

    var $ = function (id) { return ov.querySelector('#' + id); };
    function tutup() { ov.remove(); document.removeEventListener('keydown', esk); }
    function esk(e) { if (e.key === 'Escape') tutup(); }
    document.addEventListener('keydown', esk);
    ov.addEventListener('click', function (e) { if (e.target === ov) tutup(); });
    ov.querySelectorAll('[data-pu-tutup]').forEach(function (b) { b.addEventListener('click', tutup); });

    function pratinjau() {
      var j = JENIS[$('puJenis').value] || JENIS.info;
      var jd = $('puJudul').value.trim(), tk = $('puTeks').value.trim();
      $('puPre').innerHTML = '<div class="pu-pre" style="background:' + j.bg + ';border-color:' + j.bd + ';color:' + j.fg + ';">' + j.ikon + ' ' +
        (jd ? '<b>' + esc(jd) + '</b>\n' : '') + esc(tk || 'Isi pengumuman akan tampil di sini.') + '</div>';
      $('puHit').textContent = $('puTeks').value.length + ' / ' + MAKS_TEKS;
    }
    ['puJenis', 'puJudul', 'puTeks'].forEach(function (id) { $(id).addEventListener('input', pratinjau); $(id).addEventListener('change', pratinjau); });
    pratinjau();
    $('puTeks').focus();

    // ----- pilihan penerima -----
    var terpilih = {};
    (Array.isArray(d.penerima) ? d.penerima : []).forEach(function (id) { terpilih[id] = true; });
    function jumlahTerpilih() { return Object.keys(terpilih).length; }
    function gambarOrang() {
      var kata = ($('puCari').value || '').toLowerCase().trim();
      var tampil = (orang || []).filter(function (o) { return !kata || String(o.nama || '').toLowerCase().indexOf(kata) >= 0; });
      $('puDaftarOrang').innerHTML = tampil.length ? tampil.map(function (o) {
        return '<label class="pu-org"><input type="checkbox" data-id="' + esc(o.id) + '"' + (terpilih[o.id] ? ' checked' : '') + '> ' + esc(o.nama || '(tanpa nama)') +
          '<small>' + (o.role === 'staf' ? 'Staf' : 'Guru') + '</small></label>';
      }).join('') : '<div class="pu-note" style="margin:0;color:var(--ink-soft,#6b7280);background:transparent;border:0;">' + ((orang || []).length ? 'Tidak ada nama yang cocok.' : 'Daftar guru/staf tidak dapat dimuat.') + '</div>';
      $('puJumlah').textContent = jumlahTerpilih() + ' penerima dipilih';
      $('puDaftarOrang').querySelectorAll('input[data-id]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          if (cb.checked) terpilih[cb.getAttribute('data-id')] = true; else delete terpilih[cb.getAttribute('data-id')];
          $('puJumlah').textContent = jumlahTerpilih() + ' penerima dipilih';
        });
      });
    }
    function modeTertentu() { return ov.querySelector('input[name="puTarget"]:checked').value === 'tertentu'; }
    ov.querySelectorAll('input[name="puTarget"]').forEach(function (r) {
      r.addEventListener('change', function () { $('puPilih').style.display = modeTertentu() ? 'grid' : 'none'; });
    });
    $('puCari').addEventListener('input', gambarOrang);
    $('puSemuaOrg').addEventListener('click', function () {
      $('puDaftarOrang').querySelectorAll('input[data-id]').forEach(function (cb) { cb.checked = true; terpilih[cb.getAttribute('data-id')] = true; });
      $('puJumlah').textContent = jumlahTerpilih() + ' penerima dipilih';
    });
    $('puKosong').addEventListener('click', function () { terpilih = {}; gambarOrang(); });
    muatOrang().then(gambarOrang);

    function galat(t) { var e = $('puErr'); e.textContent = t; e.style.display = 'block'; }

    $('puSimpan').addEventListener('click', async function () {
      var teks = $('puTeks').value.trim();
      var akhir = keIso($('puAkhir').value);
      var aktif = $('puAktif').checked;
      $('puErr').style.display = 'none';
      if (!teks) { galat('Isi pengumuman belum diisi.'); return; }
      var penerima = null;
      if (modeTertentu()) {
        penerima = Object.keys(terpilih);
        if (!penerima.length) { galat('Pilih minimal satu guru atau staf penerima, atau ubah ke "Semua pengguna".'); return; }
      }
      if (aktif && akhir && new Date(akhir) <= new Date()) { galat('Waktu berakhir sudah lewat. Kosongkan atau pilih waktu yang akan datang.'); return; }
      var tombol = $('puSimpan'); tombol.disabled = true; tombol.textContent = 'Menyimpan...';
      var err = await simpanKeServer(p || {}, { jenis: $('puJenis').value, judul: $('puJudul').value.trim(), teks: teks, berakhir_pada: akhir, aktif: aktif, penerima: penerima });
      if (err) { tombol.disabled = false; tombol.textContent = baru ? 'Terbitkan' : 'Simpan'; galat(pesanGalat(err)); return; }
      tutup();
      await segarkan();
      toast(baru ? 'Pengumuman diterbitkan.' : 'Pengumuman diperbarui.');
    });
  }

  async function muat(el) {
    if (!el) return;
    wadah = el;
    pasangGaya();
    await segarkan();
  }

  window.PengumumanKepsek = { muat: muat, buka: function () { dialog(null); } };
})();
