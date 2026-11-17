// =========================================================
// KONEKSI SUPABASE
// Ganti dua nilai di bawah ini dengan milik project kamu.
// Ambil di: Supabase Dashboard → Project Settings → API
//   - "Project URL"      -> SUPABASE_URL
//   - "anon public" key  -> SUPABASE_ANON_KEY
// =========================================================

var SUPABASE_URL = "https://iejpwxmcqwecejsrezry.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_dZfvfiSsA-JAndPn172VSg_sq_zRWqS";

// ---------------------------------------------------------
// MODE "LIHAT SEBAGAI" (developer melihat portal sebagai pengguna lain)
// Dimulai dari developer.html -> Manajemen Akun. Selama mode ini aktif
// (penanda di localStorage, berlaku untuk semua tab):
//   - SEMUA permintaan tulis ke Supabase diblokir di sini (insert / update /
//     delete / upsert, upload storage, Edge Function, ubah sandi, dst.).
//   - RPC hanya yang tercantum di RPC_BACA yang boleh jalan. RPC lain
//     (termasuk bi_dekripsi & siswa_nik_kk_saya, jadi NIK / No. KK tidak
//     terbuka) diblokir. RPC baru dianggap menulis sampai didaftarkan.
//   - Tombol Keluar mengakhiri mode ini dan memulihkan sesi developer;
//     TIDAK mengeluarkan pengguna aslinya.
//   - Berakhir otomatis sesuai batas waktu dari server (30 menit).
// CATATAN: ini pengaman di browser, bukan batas keamanan server. Batas yang
// sebenarnya: hanya developer yang bisa menerbitkan sesi ini, wajib disertai
// alasan, dibatasi peran & waktu, dan selalu tercatat di log_developer.
// ---------------------------------------------------------
var PdpLihat = (function () {
  var KUNCI = "pdp_lihat_sebagai";      // {user_id, nama, peran, mulai, sampai, dev_id}
  var KUNCI_ASAL = "pdp_lihat_asal";    // sesi developer yang dipulihkan saat selesai
  var RPC_BACA = {
    supervisi_jadwal_guru: 1, pkl_penguji_binaan: 1, pkl_pembimbing_uji: 1,
    penilaian_rekan_hasil_saya: 1, penilaian_rekan_hasil: 1, penilaian_rekan_progres: 1,
    penilaian_rekan_daftar_saya: 1, pengaduan_daftar: 1, pengaduan_jumlah_baru: 1,
    nama_wali_kelas_siswa: 1
  };
  // POST yang tetap diizinkan: muat ulang token, tiket masuk, dan pembuatan tautan baca storage.
  var POST_BOLEH = [/^\/auth\/v1\/(token|verify)$/, /^\/storage\/v1\/object\/(sign|list|info)\//];
  var fetchAsli = window.__pdpFetchAsli || (window.__pdpFetchAsli = window.fetch.bind(window));
  var toastTerakhir = 0;

  function baca() {
    try {
      var v = localStorage.getItem(KUNCI);
      if (!v) return null;
      var o = JSON.parse(v);
      return o && o.sampai ? o : null;
    } catch (e) { return null; }
  }
  function diizinkan(path) {
    var m = /^\/rest\/v1\/rpc\/([A-Za-z0-9_]+)$/.exec(path);
    if (m) return RPC_BACA[m[1]] === 1;
    return POST_BOLEH.some(function (re) { return re.test(path); });
  }
  function toast(teks) {
    var skrg = Date.now();
    if (skrg - toastTerakhir < 3000 || !document.body) return;
    toastTerakhir = skrg;
    var el = document.createElement("div");
    el.setAttribute("role", "status");
    el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483001;max-width:90vw;padding:10px 16px;border-radius:10px;background:#4c1d95;color:#fff;font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);";
    el.textContent = teks;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }
  function fetchKu(input, init) {
    if (baca()) {
      var url = typeof input === "string" ? input : ((input && input.url) || String(input));
      var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (url.indexOf(SUPABASE_URL) === 0 && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        var path = url.slice(SUPABASE_URL.length).split("?")[0];
        if (!diizinkan(path)) {
          toast("Mode Lihat sebagai: hanya baca. Perubahan tidak disimpan.");
          return Promise.resolve(new Response(
            JSON.stringify({ code: "PDP_READONLY", message: "Mode Lihat sebagai hanya-baca: perubahan diblokir." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          ));
        }
      }
    }
    return fetchAsli(input, init);
  }
  // Pemanggilan fetch() langsung di halaman (mis. ke /functions/v1/...) juga lewat penjaga ini.
  window.fetch = fetchKu;

  return { KUNCI: KUNCI, KUNCI_ASAL: KUNCI_ASAL, baca: baca, aktif: function () { return !!baca(); }, fetch: fetchKu };
})();

// Penjaga harus terpasang SEBELUM client dibuat: supabase-js mengambil fungsi fetch saat dibuat.
var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: PdpLihat.fetch } });

(function () {
  var signOutAsli = supabaseClient.auth.signOut.bind(supabaseClient.auth);
  var sedangAkhiri = false;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function sesudahBodySiap(fn) { if (document.body) fn(); else document.addEventListener("DOMContentLoaded", fn); }

  // Akhiri mode: hapus penanda, tutup sesi pengguna yang dilihat (HANYA sesi lokal ini, bukan
  // sesi aslinya di perangkat lain), lalu pulihkan sesi developer.
  PdpLihat.akhiri = async function () {
    var o = PdpLihat.baca();
    if (!o || sedangAkhiri) return;
    sedangAkhiri = true;
    var asal = null;
    try { asal = JSON.parse(localStorage.getItem(PdpLihat.KUNCI_ASAL) || "null"); } catch (e) { /* abaikan */ }
    try { localStorage.removeItem(PdpLihat.KUNCI); } catch (e) { /* abaikan */ }
    try { await signOutAsli({ scope: "local" }); } catch (e) { /* abaikan */ }
    var pulih = false;
    if (asal && asal.access_token && asal.refresh_token) {
      try {
        var r = await supabaseClient.auth.setSession({ access_token: asal.access_token, refresh_token: asal.refresh_token });
        pulih = !r.error;
      } catch (e) { pulih = false; }
    }
    try { localStorage.removeItem(PdpLihat.KUNCI_ASAL); } catch (e) { /* abaikan */ }
    if (pulih) {
      try {
        await supabaseClient.rpc("dev_catat_log", {
          p_aksi: "lihat_sebagai_selesai", p_target: o.user_id, p_target_nama: o.nama || null,
          p_alasan: null, p_rincian: { durasi_detik: Math.round((Date.now() - (o.mulai || Date.now())) / 1000) }
        });
      } catch (e) { /* log tambahan */ }
      location.href = "developer.html#akun";
    } else {
      location.href = "index.html";
    }
  };

  // Tombol "Keluar" di halaman mana pun hanya mengakhiri mode ini (bukan mengeluarkan pengguna asli).
  supabaseClient.auth.signOut = function (opsi) {
    if (PdpLihat.aktif()) { PdpLihat.akhiri(); return new Promise(function () { /* halaman sedang berpindah */ }); }
    return signOutAsli(opsi);
  };

  function pasangBanner() {
    var o = PdpLihat.baca();
    if (!o || document.getElementById("pdp-lihat-banner")) return;
    var el = document.createElement("div");
    el.id = "pdp-lihat-banner";
    el.setAttribute("role", "status");
    el.style.cssText = "position:sticky;top:0;z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 14px;background:#4c1d95;color:#fff;font:600 13px/1.4 'Plus Jakarta Sans',system-ui,sans-serif;";
    el.innerHTML = '<span aria-hidden="true">👁️</span>' +
      '<span style="flex:1;min-width:200px;">Mode <b>Lihat sebagai</b>: ' + esc(o.nama || "pengguna") + " (" + esc(o.peran || "") + ") · hanya baca · sisa <b id=\"pdp-lihat-sisa\"></b></span>" +
      '<button type="button" id="pdp-lihat-akhiri" style="padding:6px 14px;border:0;border-radius:8px;background:#fff;color:#4c1d95;font:700 13px inherit;cursor:pointer;">Akhiri</button>';
    document.body.insertBefore(el, document.body.firstChild);
    document.getElementById("pdp-lihat-akhiri").onclick = function () { PdpLihat.akhiri(); };
  }

  function tik() {
    var o = PdpLihat.baca();
    if (!o) return;
    var sisa = o.sampai - Date.now();
    if (sisa <= 0) { PdpLihat.akhiri(); return; }
    var el = document.getElementById("pdp-lihat-sisa");
    if (el) {
      var m = Math.floor(sisa / 60000), d = Math.floor((sisa % 60000) / 1000);
      el.textContent = m + ":" + (d < 10 ? "0" : "") + d;
    }
  }

  if (PdpLihat.aktif()) {
    var halaman = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (halaman === "index.html") {
      PdpLihat.akhiri(); // membuka halaman login saat mode aktif = selesai, kembali sebagai developer
    } else {
      sesudahBodySiap(pasangBanner);
      setInterval(tik, 1000);
      tik();
    }
  }
})();

// ---------------------------------------------------------
// STATUS SISWA
// Siswa berstatus lulus / pindah / keluar (mutasi) tidak boleh muncul lagi
// di daftar siswa & daftar nilai tahun ajaran berjalan. Status kosong
// dianggap "aktif" (sama seperti Data Siswa di menu Admin).
// - siswaMasihAktif(s)  : untuk memfilter objek siswa hasil query (JS).
// - hanyaSiswaAktif(q)  : untuk query hitung (count) pada tabel siswa_kelas;
//                         select-nya HARUS memakai "siswa:siswa_id!inner(status)".
// ---------------------------------------------------------
function siswaMasihAktif(s) {
  if (!s) return false;
  return String(s.status || 'aktif').toLowerCase() === 'aktif';
}
function hanyaSiswaAktif(q) {
  return q.or('status.is.null,status.eq.aktif', { referencedTable: 'siswa', foreignTable: 'siswa' });
}

// ---------------------------------------------------------
// LOGIN SISWA
// Siswa masuk dengan NIS (bukan email). Di Supabase Auth, akunnya memakai
// email internal <NIS>@siswa.raporwima.local (dibuat oleh
// migrasi_akun_siswa.sql). Domain di bawah HARUS sama dengan fungsi
// public.siswa_email() di migrasi itu.
// ---------------------------------------------------------
var SISWA_EMAIL_DOMAIN = "siswa.raporwima.local";

// Kalau yang diketik mengandung "@" dianggap email (guru/admin), selain itu NIS.
function emailDariInputLogin(teks) {
  var t = String(teks || "").trim();
  if (!t) return "";
  if (t.indexOf("@") !== -1) return t;
  return t.toLowerCase() + "@" + SISWA_EMAIL_DOMAIN;
}

// ---------------------------------------------------------
// LOG AKTIVITAS
// Mencatat login / logout / cetak / unduh ke tabel log_aktivitas lewat
// fungsi database catat_aktivitas() (lihat migrasi_log_aktivitas.sql).
// Perubahan data (tambah/ubah/hapus) TIDAK perlu dicatat di sini: sudah
// otomatis oleh trigger database.
//
// Dibuat aman: tidak pernah melempar error dan tidak menahan lebih dari
// batas waktu (default 1,5 detik), jadi login/logout tidak akan macet
// walaupun migrasi log belum dijalankan atau koneksi lambat.
//   aksi: 'login' | 'logout' | 'cetak' | 'unduh' | 'lainnya'
// ---------------------------------------------------------
// Nama aplikasi untuk kolom log_aktivitas.aplikasi, ditebak dari halaman
// yang sedang dibuka (lihat migrasi_log_aplikasi.sql).
function aplikasiDariHalaman() {
  var b = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (b.indexOf("bukuinduk") === 0) return "Buku Induk";
  if (b === "admin.html" || b === "guru.html") return "E-Rapor";
  if (b === "pkl.html") return "PKL";
  if (b === "guru-penugasan.html" || b === "penugasan-admin.html") return "Guru & Penugasan";
  if (b.indexOf("supervisi") === 0) return "Supervisi";
  if (b === "pelanggaran.html") return "Pelanggaran";
  if (b === "kinerja.html") return "Kinerja";
  if (b === "ijin.html") return "Ijin & Dinas Luar";
  if (b === "pengaturan-admin.html") return "Pengaturan Sekolah";
  if (b === "log-admin.html") return "Log Aktivitas";
  if (b === "siswa.html") return "Portal Siswa";
  return "Akun"; // index.html (login), portal.html
}

function catatAktivitas(aksi, modul, ringkasan, detail, batasMs) {
  try {
    var param = {
      p_aksi: aksi,
      p_modul: modul,
      p_ringkasan: ringkasan || null,
      p_detail: detail || null
    };
    var panggil = supabaseClient.rpc("catat_aktivitas", Object.assign({ p_aplikasi: aplikasiDariHalaman() }, param))
      .then(function (r) {
        // Migrasi migrasi_log_aplikasi.sql belum dijalankan -> coba cara lama.
        if (r && r.error) return supabaseClient.rpc("catat_aktivitas", param).then(function () {}, function () {});
      }, function () {});
    var tunggu = new Promise(function (resolve) { setTimeout(resolve, batasMs || 1500); });
    return Promise.race([panggil, tunggu]);
  } catch (e) {
    return Promise.resolve();
  }
}
