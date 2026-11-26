// EDGE FUNCTION: presensi-api  (deploy di project PRESENSI: nrwexyezcbmsokelgkmp)
// Satu-satunya pintu ke database presensi. Browser/APK TIDAK memegang kunci project ini.
//
// Alur: aplikasi login ke e-Rapor/PDP (hanya BACA: login + data pegawai di tabel profiles),
// lalu mengirim token login itu lewat header x-rapor-token. Fungsi ini memverifikasi token
// ke e-Rapor (baca-saja), lalu membaca/menulis data presensi di project ini dengan service role.
//
// PENTING: matikan "Verify JWT" (token e-Rapor bukan JWT project ini):
//   supabase functions deploy presensi-api --no-verify-jwt --project-ref nrwexyezcbmsokelgkmp
//   atau Dashboard > Edge Functions > presensi-api > Details > Verify JWT: OFF
//
// Secrets (Edge Functions > Secrets):
//   RAPOR_URL       = https://iejpwxmcqwecejsrezry.supabase.co
//   RAPOR_ANON_KEY  = kunci publishable/anon project e-Rapor (kunci publik, bukan service_role)
//   REKAP_URL       = (opsional) alamat project Supabase REKAP ABSEN, untuk membaca ijin/sakit/dinas luar
//   REKAP_ANON_KEY  = (opsional) kunci publishable/anon project Rekap Absen (kunci publik, bukan service_role)
//                     Tanpa dua secret ini presensi tetap jalan, hanya tidak membaca ijin.
//
// POST { action, ... }  ->  JSON. Daftar action ada di switch di bawah.
// (rekap_bulanan: ringkasan presensi online satu bulan, admin & kepala sekolah baca-saja.)
import { createClient } from "npm:@supabase/supabase-js@2";

const RAPOR_URL = (Deno.env.get("RAPOR_URL") ?? "").replace(/\/+$/, "");
const RAPOR_ANON = Deno.env.get("RAPOR_ANON_KEY") ?? "";
const REKAP_URL = (Deno.env.get("REKAP_URL") ?? "").replace(/\/+$/, "");
const REKAP_ANON = Deno.env.get("REKAP_ANON_KEY") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BUCKET = "selfie", MAX = 20 * 1024; // foto maks 20 KB
const PEGAWAI = ["guru", "staf", "kepsek", "admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JAM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const TGL = /^\d{4}-\d{2}-\d{2}$/;
const tglOk = (s: unknown) => typeof s === "string" && TGL.test(s) && s >= "2000-01-01" && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const tg = (s: unknown) => (tglOk(s) ? String(s) : "");
const jamHM = (s: unknown) => (typeof s === "string" && JAM.test(s) ? s.slice(0, 5) : "");
const hariDari = (t: string) => new Date(t + "T00:00:00Z").getUTCDay() || 7; // 1=Senin ... 7=Minggu
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-rapor-token, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
class Tolak extends Error { constructor(public msg: string, public status = 400) { super(msg); } }

// Identitas dari e-Rapor (hanya baca: /auth/v1/user dan profiles milik sendiri).
async function siapa(token: string) {
  if (!token) return null;
  const h = { apikey: RAPOR_ANON, Authorization: `Bearer ${token}` };
  const u = await fetch(`${RAPOR_URL}/auth/v1/user`, { headers: h });
  if (!u.ok) return null;
  const { id } = await u.json();
  const p = await fetch(`${RAPOR_URL}/rest/v1/profiles?id=eq.${id}&select=role,kode_mesin`, { headers: h });
  const rows = await p.json();
  return { id: id as string, role: Array.isArray(rows) ? (rows[0]?.role as string) : undefined, kode_mesin: Array.isArray(rows) ? (rows[0]?.kode_mesin as string | null) : null };
}

// Waktu server (WIB) — tidak percaya jam HP.
function wib(at: Date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const tanggal = `${p.year}-${p.month}-${p.day}`;
  return { tanggal, jam: `${p.hour}:${p.minute}:${p.second}`, hari: new Date(tanggal + "T00:00:00Z").getUTCDay() || 7 };
}
function jarak(a: number, b: number, c: number, d: number) {
  const r = (x: number) => x * Math.PI / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return Math.round(12742000 * Math.asin(Math.sqrt(h)));
}
const detik = (t: string) => { const [h, m, s] = t.split(":"); return +h * 3600 + +m * 60 + +(s ?? 0); };
const ok = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Tolak(r.error.message, 500); return r.data; };
const butuhAdmin = (me: { role?: string }) => { if (me.role !== "admin") throw new Tolak("Hanya admin", 403); };
// Rekap harian & foto: admin dan kepala sekolah (kepala sekolah hanya membaca).
const butuhAdminAtauKepsek = (me: { role?: string }) => { if (me.role !== "admin" && me.role !== "kepsek") throw new Tolak("Hanya admin atau kepala sekolah", 403); };

// ---------- Ijin / sakit / dinas luar (dibaca dari database Rekap Absen, tabel absen_ijin) ----------
// Kunci anon Rekap Absen hanya bisa membaca pengajuan berstatus 'disetujui' (lihat rekap_ijin_persetujuan.sql),
// jadi pengajuan yang belum disetujui tidak ikut. Gagal baca / secret kosong => null (presensi tetap jalan).
type Ijin = { kode_mesin: string; nama: string; jenis: string };
const kodeNorm = (v: unknown) => { const k = parseInt(String(v ?? ""), 10); return Number.isNaN(k) ? "" : String(k); };
const JENIS_IJIN: Record<string, string> = { sakit: "Sakit", ijin: "Ijin", dinas_luar: "Dinas Luar" };
async function ijinPada(tanggal: string): Promise<Ijin[] | null> {
  if (!REKAP_URL || !REKAP_ANON) return null;
  try {
    const q = `select=kode_mesin,nama,jenis&tanggal_mulai=lte.${tanggal}&tanggal_selesai=gte.${tanggal}&limit=1000`;
    const r = await fetch(`${REKAP_URL}/rest/v1/absen_ijin?${q}`, { headers: { apikey: REKAP_ANON, Authorization: `Bearer ${REKAP_ANON}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) ? rows as Ijin[] : null;
  } catch { return null; }
}
const ijinSaya = (daftar: Ijin[] | null, kode: unknown) => {
  const k = kodeNorm(kode);
  const e = k && daftar ? daftar.find((x) => kodeNorm(x.kode_mesin) === k) : null;
  return e ? { jenis: e.jenis, label: JENIS_IJIN[e.jenis] ?? e.jenis } : null;
};

// Ijin/sakit/dinas luar milik SATU pegawai pada rentang tanggal (untuk data presensi bulanan).
type IjinR = Ijin & { tanggal_mulai: string; tanggal_selesai: string };
async function ijinRentang(dari: string, sampai: string, kode: unknown): Promise<IjinR[] | null> {
  if (!REKAP_URL || !REKAP_ANON) return null;
  const k = kodeNorm(kode);
  if (!k) return [];
  try {
    const q = `select=kode_mesin,nama,jenis,tanggal_mulai,tanggal_selesai&tanggal_mulai=lte.${sampai}&tanggal_selesai=gte.${dari}&limit=1000`;
    const r = await fetch(`${REKAP_URL}/rest/v1/absen_ijin?${q}`, { headers: { apikey: REKAP_ANON, Authorization: `Bearer ${REKAP_ANON}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) ? (rows as IjinR[]).filter((x) => kodeNorm(x.kode_mesin) === k) : null;
  } catch { return null; }
}

// Ijin/sakit/dinas luar SEMUA pegawai pada rentang tanggal (untuk rekap bulanan admin/kepala sekolah).
type IjinB = { kode_mesin: string; jenis: string; tanggal_mulai: string; tanggal_selesai: string };
async function ijinBulan(dari: string, sampai: string): Promise<IjinB[] | null> {
  if (!REKAP_URL || !REKAP_ANON) return null;
  try {
    const q = `select=kode_mesin,jenis,tanggal_mulai,tanggal_selesai&tanggal_mulai=lte.${sampai}&tanggal_selesai=gte.${dari}&limit=1000`;
    const r = await fetch(`${REKAP_URL}/rest/v1/absen_ijin?${q}`, { headers: { apikey: REKAP_ANON, Authorization: `Bearer ${REKAP_ANON}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) ? rows as IjinB[] : null;
  } catch { return null; }
}

// ---------- Pengaturan jadwal (libur, force majeure, jam staf, acuan tes/pasca tes/piket) ----------
type Peng = {
  staf: Record<string, { masuk: string; pulang: string }>; // jam staf per hari: "1" (Senin) ... "6" (Sabtu); kosong = tidak bekerja
  tes: { dari: string; sampai: string };
  pasca: { masuk: string; pulang: string; dari: string; sampai: string };
  piket: { dari: string; sampai: string; masuk: string; pulang: string };
};
type Jd = { pegawai_id: string; jenis: string; hari: number; jam_masuk: string; jam_pulang: string; jp: number; kelas: string | null };
type Ctx = {
  peng: Peng; libur: string[]; fm: { d: string; ket: string }[]; staf: string[];
  piket: { list: Record<string, string[]>; file?: string; belum?: string[] } | null;
  fileReg?: string; fileTes?: string; adaTes: boolean;
};
type Ef = { tipe: "libur" | "fm" | "kerja" | "tanpa"; ket?: string; masuk?: string; pulang?: string; sumber?: string; mode: string };

// deno-lint-ignore no-explicit-any
function normPeng(v: any): Peng {
  const p = v ?? {};
  return {
    staf: Object.fromEntries(["1", "2", "3", "4", "5", "6"].map((h) => {
      const x = p.staf?.[h];
      if (!x) return [h, { masuk: jamHM(p.staf_masuk) || "07:00", pulang: jamHM(p.staf_pulang) || "14:00" }]; // data lama: satu jam untuk semua hari
      const m = jamHM(x.masuk), pl = jamHM(x.pulang);
      return [h, m && pl ? { masuk: m, pulang: pl } : { masuk: "", pulang: "" }];
    })),
    tes: { dari: tg(p.tes?.dari), sampai: tg(p.tes?.sampai) },
    pasca: { masuk: jamHM(p.pasca?.masuk) || "07:00", pulang: jamHM(p.pasca?.pulang) || "14:00", dari: tg(p.pasca?.dari), sampai: tg(p.pasca?.sampai) },
    piket: { dari: tg(p.piket?.dari), sampai: tg(p.piket?.sampai), masuk: jamHM(p.piket?.masuk), pulang: jamHM(p.piket?.pulang) },
  };
}
// Tanggal acuan 2 (Tes), 3 (Pasca tes), 4 (Piket) tidak boleh bertabrakan.
function cekBentrok(p: Peng) {
  const semua: [string, string, string][] = [["Jadwal tes", p.tes.dari, p.tes.sampai], ["Pasca tes", p.pasca.dari, p.pasca.sampai], ["Piket", p.piket.dari, p.piket.sampai]];
  for (const [n, a, b] of semua) if ((a || b) && (!a || !b || a > b)) throw new Tolak(`Tanggal ${n} belum benar (isi tanggal mulai dan sampai, mulai tidak boleh setelah sampai)`);
  const R = semua.filter(([, a, b]) => a && b);
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    const f = R[i][1] > R[j][1] ? R[i][1] : R[j][1], t = R[i][2] < R[j][2] ? R[i][2] : R[j][2];
    if (f <= t) throw new Tolak(`${R[i][0]} dan ${R[j][0]} bertabrakan pada ${f === t ? f : f + " s.d. " + t}. Tanggal jadwal tes, pasca tes, dan piket tidak boleh bertabrakan.`);
  }
}
async function muatCtx(): Promise<Ctx> {
  const rows = ok(await db.from("presensi_cfg").select("key,value")) as { key: string; value: any }[]; // deno-lint-ignore no-explicit-any
  const m: Record<string, any> = Object.fromEntries(rows.map((r) => [r.key, r.value])); // deno-lint-ignore no-explicit-any
  const tes = ok(await db.from("presensi_jadwal").select("pegawai_id").eq("jenis", "tes").limit(1));
  return {
    peng: normPeng(m.pengaturan),
    libur: Array.isArray(m.libur) ? m.libur.filter(tglOk) : [],
    fm: Array.isArray(m.fm) ? m.fm.filter((x: { d: string }) => tglOk(x?.d)).map((x: { d: string; ket?: string }) => ({ d: x.d, ket: String(x.ket ?? "") })) : [],
    staf: Array.isArray(m.staf) ? m.staf.map(String) : [],
    piket: m.piket?.list ? m.piket : null,
    fileReg: m.file_reguler?.file, fileTes: m.file_tes?.file,
    adaTes: (tes as unknown[]).length > 0,
  };
}
async function semuaJadwal(): Promise<Jd[]> {
  const out: Jd[] = [];
  for (let off = 0; off < 20000; off += 1000) {
    const r = ok(await db.from("presensi_jadwal").select("pegawai_id,jenis,hari,jam_masuk,jam_pulang,jp,kelas")
      .order("pegawai_id").order("jenis").order("hari").range(off, off + 999)) as Jd[];
    out.push(...r);
    if (r.length < 1000) break;
  }
  return out;
}
async function simpanCfg(key: string, value: unknown) { ok(await db.from("presensi_cfg").upsert({ key, value, updated_at: new Date().toISOString() })); }
async function hapusCfg(key: string) { ok(await db.from("presensi_cfg").delete().eq("key", key)); }

const dalam = (t: string, a: string, b: string) => !!(a && b && a <= b && t >= a && t <= b);
function modeOf(c: Ctx, t: string) {
  const p = c.peng;
  if (c.adaTes && dalam(t, p.tes.dari, p.tes.sampai)) return "tes";
  if (p.pasca.masuk && p.pasca.pulang && dalam(t, p.pasca.dari, p.pasca.sampai)) return "pasca";
  if (c.piket && p.piket.masuk && p.piket.pulang && dalam(t, p.piket.dari, p.piket.sampai)) return "piket";
  return "reguler";
}
function tipeHari(c: Ctx, t: string) {
  if (c.libur.includes(t)) return { tipe: "libur", ket: "" };
  const f = c.fm.find((x) => x.d === t);
  return f ? { tipe: "fm", ket: f.ket } : { tipe: "biasa", ket: "" };
}
// Jadwal yang berlaku bagi satu pegawai pada satu tanggal (aturan sama dengan aplikasi rekap).
// rows = semua baris presensi_jadwal milik pegawai itu (reguler + tes).
function efektif(c: Ctx, id: string, role: string, rows: Jd[], tanggal: string, hari: number): Ef {
  const md = modeOf(c, tanggal), th = tipeHari(c, tanggal);
  if (th.tipe === "libur") return { tipe: "libur", mode: md };
  if (th.tipe === "fm") return { tipe: "fm", ket: th.ket, mode: md };
  const reg = rows.filter((r) => r.jenis === "reguler"), tes = rows.filter((r) => r.jenis === "tes");
  const stf = c.staf.includes(id);
  // Jam staf berlaku Senin-Sabtu.
  const sj = hari <= 6 ? c.peng.staf[String(hari)] : null; // jam staf hari itu (kosong = tidak bekerja)
  const stafEx = sj && sj.masuk && sj.pulang ? { masuk: sj.masuk, pulang: sj.pulang, sumber: stf ? "Jam staf (tugas tambahan)" : "Jam staf" } : null;
  const dari = (r: Jd | undefined, sumber: string) => (r ? { masuk: r.jam_masuk.slice(0, 5), pulang: r.jam_pulang.slice(0, 5), sumber } : null);
  let ex: { masuk: string; pulang: string; sumber: string } | null = null;
  if (md === "piket") {
    if ((c.piket?.list?.[String(hari)] ?? []).includes(id)) ex = { masuk: c.peng.piket.masuk, pulang: c.peng.piket.pulang, sumber: "Piket" };
  } else if (md === "tes") {
    const h = tes.find((r) => r.hari === hari);
    const guru = tes.length > 0 || reg.length > 0 || role === "guru";
    ex = h ? dari(h, "Tes") : (guru && !stf) ? null : stafEx;
  } else {
    ex = stf ? stafEx : reg.length ? dari(reg.find((r) => r.hari === hari), "Reguler") : (role === "guru" ? null : stafEx);
    if (ex && md === "pasca") ex = { masuk: c.peng.pasca.masuk, pulang: c.peng.pasca.pulang, sumber: "Pasca tes" };
  }
  return ex ? { tipe: "kerja", ...ex, mode: md } : { tipe: "tanpa", mode: md };
}
async function jadwalSaya(id: string) {
  return ok(await db.from("presensi_jadwal").select("pegawai_id,jenis,hari,jam_masuk,jam_pulang,jp,kelas").eq("pegawai_id", id)) as Jd[];
}

// ---------- Tugas Luar (diisi sendiri oleh pegawai, tanpa persetujuan admin) ----------
// Absen Tugas Luar: foto + titik lokasi satu kali per hari (jenis log 'tugas_luar').
// Absen pulang: tidak perlu bila jam selesai tugas MELEWATI jam pulang jadwal; bila tidak melewati, wajib absen pulang.
type Tg = { id: string; pegawai_id: string; role: string | null; tanggal: string; jam_mulai: string; jam_selesai: string; keperluan: string };
function infoPulang(ef: Ef, jamSelesai: string) {
  const js = jamHM(jamSelesai);
  if (ef.tipe === "libur" || ef.tipe === "fm") return { tipe: ef.tipe, wajib: false, jam_pulang: "" };
  if (ef.tipe !== "kerja") return { tipe: ef.tipe, wajib: false, jam_pulang: "" }; // tidak ada jadwal kerja hari itu
  return { tipe: ef.tipe, wajib: js <= ef.pulang!, jam_pulang: ef.pulang! };
}
const tgOut = (t: Tg, ef: Ef) => ({ id: t.id, pegawai_id: t.pegawai_id, tanggal: t.tanggal, jam_mulai: jamHM(t.jam_mulai), jam_selesai: jamHM(t.jam_selesai), keperluan: t.keperluan, ...infoPulang(ef, t.jam_selesai) });

async function lokasi() {
  return ok(await db.from("presensi_lokasi").select("*").eq("id", 1).single());
}
async function signedUrls(paths: string[]) {
  const urls: Record<string, string> = {};
  if (paths.length) {
    const { data, error } = await db.storage.from(BUCKET).createSignedUrls(paths, 3600);
    if (error) throw new Tolak(error.message, 500);
    for (const d of data ?? []) if (d.signedUrl && d.path) urls[d.path] = d.signedUrl;
  }
  return urls;
}

// Kosongkan bucket foto (rekursif, per 1000 berkas). Berhenti bila melewati batas waktu; panggil lagi untuk melanjutkan.
async function kosongkanFoto(batasMs: number) {
  const st = db.storage.from(BUCKET), mulai = Date.now();
  let hapus = 0, selesai = true;
  const habis = () => Date.now() - mulai > batasMs;
  async function isi(prefix: string): Promise<void> {
    for (let i = 0; i < 500; i++) {
      if (habis()) { selesai = false; return; }
      const { data, error } = await st.list(prefix, { limit: 1000, offset: 0 });
      if (error) throw new Tolak("Gagal membaca storage: " + error.message, 500);
      if (!data || !data.length) return;
      const folder = data.filter((x) => x.id === null).map((x) => (prefix ? prefix + "/" : "") + x.name);
      const berkas = data.filter((x) => x.id !== null).map((x) => (prefix ? prefix + "/" : "") + x.name);
      if (berkas.length) {
        const r = await st.remove(berkas);
        if (r.error) throw new Tolak("Gagal menghapus foto: " + r.error.message, 500);
        hapus += r.data?.length ?? 0;
        if (!r.data?.length) throw new Tolak("Foto tidak bisa dihapus dari storage (tidak ada berkas yang terhapus).", 500);
      }
      for (const f of folder) { await isi(f); if (!selesai) return; }
      if (!berkas.length) return; // hanya folder (kosong atau sudah diproses): selesai
    }
  }
  await isi("");
  return { hapus, selesai };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Gunakan POST" }, 405);
  if (!RAPOR_URL || !RAPOR_ANON) return json({ error: "Secret RAPOR_URL / RAPOR_ANON_KEY belum diisi." }, 500);

  const me = await siapa(req.headers.get("x-rapor-token") ?? "");
  if (!me) return json({ error: "Sesi login e-Rapor tidak valid. Login ulang." }, 401);
  const body = await req.json().catch(() => ({}));
  // Developer: HANYA boleh membaca angka kesehatan (ukuran DB, storage, tabel termasuk CP) untuk panel Kesehatan Sistem.
  if (me.role === "developer") {
    if (body.action !== "kesehatan") return json({ error: "Peran tidak diizinkan" }, 403);
    const r = await db.rpc("presensi_kesehatan");
    if (r.error) return json({ error: "Gagal membaca kesehatan database (sudah menjalankan kesehatan_presensi.sql di project ini?): " + r.error.message }, 500);
    return json(r.data);
  }
  if (!PEGAWAI.includes(me.role ?? "")) return json({ error: "Peran tidak diizinkan" }, 403);
  try {
    switch (body.action) {
      case "lokasi":
        return json({ lokasi: await lokasi() });

      case "lokasi_simpan": {
        butuhAdmin(me);
        const v = {
          nama_lokasi: String(body.nama_lokasi ?? "").slice(0, 100),
          lat: Number(body.lat), lng: Number(body.lng),
          radius_m: Math.round(Number(body.radius_m)), toleransi_menit: Math.round(Number(body.toleransi_menit)),
        };
        if (![v.lat, v.lng, v.radius_m, v.toleransi_menit].every(Number.isFinite)) throw new Tolak("Angka tidak valid");
        if (Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) throw new Tolak("Koordinat tidak valid");
        if (v.radius_m < 10 || v.toleransi_menit < 0) throw new Tolak("Radius minimal 10 m, toleransi minimal 0");
        ok(await db.from("presensi_lokasi").update(v).eq("id", 1));
        return json({ ok: true });
      }

      case "hari_ini": { // data layar Presensi: jadwal yang berlaku hari ini + log hari ini milik sendiri
        const w = wib();
        const [ctx, rows, log, ij, tgs] = await Promise.all([
          muatCtx(), jadwalSaya(me.id),
          db.from("presensi_log").select("*").eq("pegawai_id", me.id).eq("tanggal", w.tanggal),
          ijinPada(w.tanggal),
          db.from("presensi_tugas").select("*").eq("pegawai_id", me.id).eq("tanggal", w.tanggal).limit(1),
        ]);
        const ef = efektif(ctx, me.id, me.role!, rows, w.tanggal, w.hari), tg = (ok(tgs) as Tg[])[0];
        return json({ tanggal: w.tanggal, jam: w.jam, hari: w.hari, ef, log: ok(log), ijin: ijinSaya(ij, me.kode_mesin), tugas: tg ? tgOut(tg, ef) : null });
      }

      case "absen": { // validasi radius, status, simpan foto + log — semua di server
        const jenis = body.jenis;
        if (!["datang", "pulang", "tugas_luar"].includes(jenis)) throw new Tolak("jenis tidak valid");
        const tl = jenis === "tugas_luar"; // Tugas Luar: tanpa batas radius sekolah, harus sudah diisi di menu Tugas Luar
        const akurasi = Number.isFinite(Number(body.akurasi)) ? Math.max(0, Math.min(99999, Math.round(Number(body.akurasi)))) : null;
        const lat = Number(body.lat), lng = Number(body.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Tolak("Lokasi tidak valid");
        const bin = Uint8Array.from(atob(String(body.foto ?? "")), (c) => c.charCodeAt(0));
        if (bin.length < 1000 || bin.length > MAX) throw new Tolak("Ukuran foto harus 1 KB – 20 KB");
        if (bin[0] !== 0xff || bin[1] !== 0xd8 || bin[2] !== 0xff) throw new Tolak("Bukan file JPEG");

        // Absen Tugas Luar yang disimpan di HP (tanpa sinyal) dikirim belakangan: tanggal & jam mengikuti saat foto DIAMBIL.
        // Syarat: bukan di masa depan (toleransi 5 menit) dan paling lama 24 jam sebelum diterima.
        let at = new Date(), diambil: string | null = null;
        if (tl && body.diambil) {
          const t = Date.parse(String(body.diambil)), now = Date.now();
          if (!Number.isFinite(t)) throw new Tolak("Waktu pengambilan foto tidak valid");
          if (t > now + 5 * 60000) throw new Tolak("Waktu pengambilan foto ada di masa depan. Periksa pengaturan jam di HP Anda.");
          if (now - t > 24 * 3600000) throw new Tolak("Absen yang tersimpan di HP sudah lebih dari 24 jam sehingga tidak bisa dikirim. Hubungi admin.");
          if (now - t > 2 * 60000) { at = new Date(t); diambil = at.toISOString(); }
        }
        const cfg = await lokasi(), w = wib(at);
        const ctx = await muatCtx();
        const ef = efektif(ctx, me.id, me.role!, await jadwalSaya(me.id), w.tanggal, w.hari);
        if (ef.tipe === "libur") throw new Tolak("Hari ini libur, presensi tidak diperlukan");
        if (ef.tipe === "fm") throw new Tolak("Hari ini Force Majeure" + (ef.ket ? " (" + ef.ket + ")" : "") + ", presensi tidak diperlukan");
        const d = jarak(cfg.lat, cfg.lng, lat, lng);
        if (!tl && d > cfg.radius_m) throw new Tolak(`Di luar radius presensi (${d} m dari titik, batas ${cfg.radius_m} m)`);

        const hr = ok(await db.from("presensi_log").select("jenis").eq("pegawai_id", me.id).eq("tanggal", w.tanggal));
        if (tl) {
          const t = ok(await db.from("presensi_tugas").select("id").eq("pegawai_id", me.id).eq("tanggal", w.tanggal).limit(1)) as unknown[];
          if (!t.length) throw new Tolak("Anda belum mengisi Tugas Luar untuk hari ini. Isi dulu di menu Tugas Luar (keperluan dan rentang waktu).", 403);
        } else if (hr.length === 0) { // sudah tercatat ijin/sakit/dinas luar (disetujui) dan belum presensi: tidak perlu presensi
          const ij = ijinSaya(await ijinPada(w.tanggal), me.kode_mesin);
          if (ij) throw new Tolak(`Hari ini Anda tercatat ${ij.label} (disetujui), presensi tidak diperlukan`, 409);
        }
        if (hr.some((x: { jenis: string }) => x.jenis === jenis)) throw new Tolak(tl ? "Absen Tugas Luar hari ini sudah tercatat" : `Presensi ${jenis} hari ini sudah tercatat`, 409);
        if (jenis === "pulang" && !hr.some((x: { jenis: string }) => x.jenis === "datang" || x.jenis === "tugas_luar")) throw new Tolak("Belum presensi datang atau absen Tugas Luar hari ini");

        let status = "tepat waktu";
        if (tl) status = "tugas luar";
        else if (ef.tipe !== "kerja") status = "tanpa jadwal";
        else if (jenis === "datang") { if (detik(w.jam) > detik(ef.masuk!) + cfg.toleransi_menit * 60 + 59) status = "terlambat"; }
        else if (detik(w.jam) < detik(ef.pulang!)) status = "pulang cepat";

        const path = `${me.id}/${w.tanggal}-${jenis}.jpg`;
        const ins = await db.from("presensi_log").insert({ pegawai_id: me.id, tanggal: w.tanggal, jenis, lat, lng, jarak_m: d, akurasi_m: akurasi, diambil_at: diambil, foto_path: path, status });
        if (ins.error) throw new Tolak(ins.error.code === "23505" ? (tl ? "Absen Tugas Luar hari ini sudah tercatat" : `Presensi ${jenis} hari ini sudah tercatat`) : ins.error.message, ins.error.code === "23505" ? 409 : 500);
        const up = await db.storage.from(BUCKET).upload(path, bin, { upsert: true, contentType: "image/jpeg" });
        if (up.error) { // batalkan log agar tidak ada presensi tanpa foto
          await db.from("presensi_log").delete().eq("pegawai_id", me.id).eq("tanggal", w.tanggal).eq("jenis", jenis);
          throw new Tolak("Gagal menyimpan foto: " + up.error.message, 500);
        }
        return json({ ok: true, status, jarak_m: d, lat, lng, tanggal: w.tanggal, jam: w.jam, tertunda: !!diambil });
      }

      case "tugas_cek": { // petunjuk langsung di form: wajib absen pulang atau tidak, menurut jadwal pada tanggal itu
        const tgl = String(body.tanggal), js = jamHM(body.jam_selesai);
        if (!tglOk(tgl) || !js) throw new Tolak("Tanggal / jam selesai tidak valid");
        const ef = efektif(await muatCtx(), me.id, me.role!, await jadwalSaya(me.id), tgl, hariDari(tgl));
        return json({ ...infoPulang(ef, js), ket: ef.tipe === "libur" ? "" : ef.tipe === "fm" ? ef.ket ?? "" : "" });
      }

      case "tugas_simpan": { // pegawai mengisi sendiri; langsung berlaku, tanpa persetujuan admin
        const tgl = String(body.tanggal), jm = jamHM(body.jam_mulai), js = jamHM(body.jam_selesai), kep = String(body.keperluan ?? "").trim().replace(/\s+/g, " ");
        const w = wib();
        if (!tglOk(tgl)) throw new Tolak("Tanggal tidak valid");
        if (tgl < w.tanggal) throw new Tolak("Tanggal tugas tidak boleh sebelum hari ini");
        if ((Date.parse(tgl + "T00:00:00Z") - Date.parse(w.tanggal + "T00:00:00Z")) / 86400000 > 90) throw new Tolak("Tanggal tugas terlalu jauh (maksimal 90 hari ke depan)");
        if (!jm || !js) throw new Tolak("Isi jam mulai dan jam selesai");
        if (js <= jm) throw new Tolak("Jam selesai harus setelah jam mulai");
        if (tgl === w.tanggal && js <= w.jam.slice(0, 5)) throw new Tolak("Jam selesai sudah lewat. Isi rentang waktu yang masih berjalan atau yang akan datang.");
        if (kep.length < 3) throw new Tolak("Keperluan Tugas Luar wajib diisi (contoh: Melaksanakan PPDB)");
        if (kep.length > 200) throw new Tolak("Keperluan paling banyak 200 karakter");
        const ctx = await muatCtx(), th = tipeHari(ctx, tgl);
        if (th.tipe === "libur") throw new Tolak("Tanggal itu hari libur, Tugas Luar tidak diperlukan");
        if (th.tipe === "fm") throw new Tolak("Tanggal itu Force Majeure, Tugas Luar tidak diperlukan");
        const ada = ok(await db.from("presensi_tugas").select("id").eq("pegawai_id", me.id).eq("tanggal", tgl).limit(1)) as unknown[];
        if (ada.length) throw new Tolak("Anda sudah punya Tugas Luar pada tanggal itu. Hapus dulu bila ingin menggantinya.", 409);
        const ins = await db.from("presensi_tugas").insert({ pegawai_id: me.id, role: me.role, tanggal: tgl, jam_mulai: jm, jam_selesai: js, keperluan: kep }).select().single();
        if (ins.error) throw new Tolak(ins.error.code === "23505" ? "Anda sudah punya Tugas Luar pada tanggal itu." : ins.error.message, ins.error.code === "23505" ? 409 : 500);
        const ef = efektif(ctx, me.id, me.role!, await jadwalSaya(me.id), tgl, hariDari(tgl));
        return json({ ok: true, tugas: tgOut(ins.data as Tg, ef) });
      }

      case "tugas_saya": { // daftar Tugas Luar milik sendiri (30 hari terakhir sampai yang akan datang) + status absen lokasinya
        const w = wib(), dari = new Date(Date.parse(w.tanggal + "T00:00:00Z") - 30 * 86400000).toISOString().slice(0, 10);
        const [tgs, logs, rows, ctx] = await Promise.all([
          db.from("presensi_tugas").select("*").eq("pegawai_id", me.id).gte("tanggal", dari).order("tanggal", { ascending: false }).limit(120),
          db.from("presensi_log").select("tanggal,jenis,waktu,diambil_at,lat,lng,akurasi_m,foto_path").eq("pegawai_id", me.id).gte("tanggal", dari),
          jadwalSaya(me.id), muatCtx(),
        ]);
        const L = ok(logs) as { tanggal: string; jenis: string; waktu: string; diambil_at: string | null; lat: number; lng: number; akurasi_m: number | null; foto_path: string | null }[];
        const urls = await signedUrls(L.filter((x) => x.jenis === "tugas_luar" && x.foto_path).map((x) => x.foto_path as string).slice(0, 120));
        const tugas = (ok(tgs) as Tg[]).map((t) => {
          const a = L.find((x) => x.tanggal === t.tanggal && x.jenis === "tugas_luar");
          const p = L.find((x) => x.tanggal === t.tanggal && x.jenis === "pulang");
          return { ...tgOut(t, efektif(ctx, me.id, me.role!, rows, t.tanggal, hariDari(t.tanggal))), absen: a ? { waktu: a.diambil_at ?? a.waktu, diterima: a.diambil_at ? a.waktu : null, lat: a.lat, lng: a.lng, akurasi_m: a.akurasi_m, foto: a.foto_path ? urls[a.foto_path] ?? null : null } : null, pulang: !!p, lewat: t.tanggal < w.tanggal };
        });
        return json({ tugas, hari_ini: w.tanggal });
      }

      case "tugas_hapus": { // hanya milik sendiri, yang belum diabsen dan belum lewat
        const id = String(body.id ?? "");
        if (!UUID.test(id)) throw new Tolak("ID tidak valid");
        const t = (ok(await db.from("presensi_tugas").select("*").eq("id", id).eq("pegawai_id", me.id).limit(1)) as Tg[])[0];
        if (!t) throw new Tolak("Tugas Luar tidak ditemukan", 404);
        if (t.tanggal < wib().tanggal) throw new Tolak("Tugas Luar yang sudah lewat tidak bisa dihapus", 409);
        const a = ok(await db.from("presensi_log").select("id").eq("pegawai_id", me.id).eq("tanggal", t.tanggal).eq("jenis", "tugas_luar").limit(1)) as unknown[];
        if (a.length) throw new Tolak("Sudah ada absen Tugas Luar pada tanggal itu, tidak bisa dihapus", 409);
        ok(await db.from("presensi_tugas").delete().eq("id", id));
        return json({ ok: true });
      }

      case "riwayat":
        return json({ log: ok(await db.from("presensi_log").select("*").eq("pegawai_id", me.id).order("waktu", { ascending: false }).limit(60)) });

      case "bulanan": { // data presensi satu bulan milik sendiri: tanggal, datang, pulang, keterangan
        const bln = String(body.bulan ?? "");
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bln) || bln < "2000-01") throw new Tolak("Bulan tidak valid");
        const jml = new Date(Date.UTC(+bln.slice(0, 4), +bln.slice(5, 7), 0)).getUTCDate();
        const dari = `${bln}-01`, sampai = `${bln}-${String(jml).padStart(2, "0")}`, w = wib();
        const [ctx, jd, logs, tgs, ij] = await Promise.all([
          muatCtx(), jadwalSaya(me.id),
          db.from("presensi_log").select("tanggal,jenis,status,waktu,diambil_at").eq("pegawai_id", me.id).gte("tanggal", dari).lte("tanggal", sampai).limit(500),
          db.from("presensi_tugas").select("tanggal").eq("pegawai_id", me.id).gte("tanggal", dari).lte("tanggal", sampai).limit(100),
          ijinRentang(dari, sampai, me.kode_mesin),
        ]);
        type Lg = { tanggal: string; jenis: string; status: string; waktu: string; diambil_at: string | null };
        const L = ok(logs) as Lg[], T = new Set((ok(tgs) as { tanggal: string }[]).map((x) => x.tanggal));
        const jam = (x?: Lg) => (x ? wib(new Date(x.diambil_at ?? x.waktu)).jam.slice(0, 5) : null);
        const rows = [];
        for (let i = 1; i <= jml; i++) {
          const t = `${bln}-${String(i).padStart(2, "0")}`, hari = hariDari(t);
          const th = tipeHari(ctx, t), ef = efektif(ctx, me.id, me.role!, jd, t, hari);
          const d = L.find((x) => x.tanggal === t && x.jenis === "datang"), p = L.find((x) => x.tanggal === t && x.jenis === "pulang"), tl = L.find((x) => x.tanggal === t && x.jenis === "tugas_luar");
          const r: { tanggal: string; hari: number; datang: string | null; pulang: string | null; kode: string; info: string; jenis: string } =
            { tanggal: t, hari, datang: jam(d) ?? jam(tl), pulang: jam(p), kode: "", info: "", jenis: "kerja" };
          if (t > w.tanggal) { r.jenis = "depan"; rows.push(r); continue; }
          if (th.tipe === "libur") { r.jenis = "libur"; r.info = "Libur"; if (!d && !p && !tl) { rows.push(r); continue; } }
          else if (th.tipe === "fm") { r.jenis = "fm"; r.info = th.ket ? `Force Majeure (${th.ket})` : "Force Majeure"; if (!d && !p && !tl) { rows.push(r); continue; } }
          // belum waktunya pulang (hari ini) tidak dihitung "tanpa absen pulang"
          const lewat = t < w.tanggal || (ef.tipe === "kerja" && w.jam.slice(0, 5) > ef.pulang!);
          const telat = d?.status === "terlambat", tap = !!d && !p && lewat;
          if (d || p || tl) {
            r.kode = telat && tap ? "TTAP" : telat ? "T" : tap ? "TAP" : tl && !d ? "TL" : "";
            if (!r.kode && tl && d) r.kode = "TL";
          } else {
            const e = ij?.find((x) => x.tanggal_mulai <= t && x.tanggal_selesai >= t);
            if (e) r.kode = e.jenis === "dinas_luar" ? "DL" : e.jenis === "sakit" ? "Sakit" : e.jenis === "ijin" ? "Ijin" : String(e.jenis);
            else if (T.has(t)) { r.kode = "TL"; r.info = "belum absen lokasi"; }
            else if (ef.tipe !== "kerja") r.jenis = "tanpa";
            else if (lewat) r.jenis = "kosong";
          }
          rows.push(r);
        }
        return json({ bulan: bln, hari_ini: w.tanggal, ijin_ok: ij !== null, rows });
      }

      case "rekap": { // admin & kepala sekolah (baca-saja): semua log pada satu tanggal + tautan foto
        butuhAdminAtauKepsek(me);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.tanggal))) throw new Tolak("Tanggal tidak valid");
        const log = ok(await db.from("presensi_log").select("*").eq("tanggal", body.tanggal));
        const hariInfo = tipeHari(await muatCtx(), body.tanggal);
        const paths = log.map((x: { foto_path: string | null }) => x.foto_path).filter(Boolean).slice(0, 600) as string[];
        const ij = await ijinPada(body.tanggal);
        const tgs = ok(await db.from("presensi_tugas").select("*").eq("tanggal", body.tanggal).limit(1000)) as Tg[];
        let tugas: unknown[] = [];
        if (tgs.length) {
          const ctx = await muatCtx(), hari = hariDari(body.tanggal);
          const jd = ok(await db.from("presensi_jadwal").select("pegawai_id,jenis,hari,jam_masuk,jam_pulang,jp,kelas").in("pegawai_id", tgs.map((t) => t.pegawai_id))) as Jd[];
          tugas = tgs.map((t) => tgOut(t, efektif(ctx, t.pegawai_id, t.role ?? "guru", jd.filter((r) => r.pegawai_id === t.pegawai_id), body.tanggal, hari)));
        }
        return json({ log, hari: hariInfo, urls: await signedUrls(paths), ijin: ij ?? [], ijin_ok: ij !== null, tugas });
      }

      case "rekap_bulanan": { // admin & kepala sekolah (baca-saja): ringkasan presensi online satu bulan untuk banyak pegawai
        butuhAdminAtauKepsek(me);
        const bln = String(body.bulan ?? "");
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bln) || bln < "2000-01") throw new Tolak("Bulan tidak valid");
        const jml = new Date(Date.UTC(+bln.slice(0, 4), +bln.slice(5, 7), 0)).getUTCDate();
        const dari = `${bln}-01`, sampai = `${bln}-${String(jml).padStart(2, "0")}`, w = wib();
        // deno-lint-ignore no-explicit-any
        const peg = (Array.isArray(body.pegawai) ? body.pegawai : []).slice(0, 800).filter((x: any) => UUID.test(String(x?.id)) && PEGAWAI.includes(x?.role));
        const [ctx, jd, ij] = await Promise.all([muatCtx(), semuaJadwal(), ijinBulan(dari, sampai)]);
        const per = new Map<string, Jd[]>();
        for (const r of jd) (per.get(r.pegawai_id) ?? per.set(r.pegawai_id, []).get(r.pegawai_id)!).push(r);
        type Lg = { pegawai_id: string; tanggal: string; jenis: string; status: string; waktu: string; diambil_at: string | null };
        const logs: Lg[] = [], tugasRows: { pegawai_id: string; tanggal: string }[] = [];
        for (let off = 0; off < 60000; off += 1000) {
          const r = ok(await db.from("presensi_log").select("pegawai_id,tanggal,jenis,status,waktu,diambil_at").gte("tanggal", dari).lte("tanggal", sampai)
            .order("pegawai_id").order("tanggal").order("jenis").range(off, off + 999)) as Lg[];
          logs.push(...r);
          if (r.length < 1000) break;
        }
        for (let off = 0; off < 20000; off += 1000) {
          const r = ok(await db.from("presensi_tugas").select("pegawai_id,tanggal").gte("tanggal", dari).lte("tanggal", sampai)
            .order("pegawai_id").order("tanggal").range(off, off + 999)) as { pegawai_id: string; tanggal: string }[];
          tugasRows.push(...r);
          if (r.length < 1000) break;
        }
        const logPer = new Map<string, Lg[]>(), tugasPer = new Map<string, Set<string>>();
        for (const l of logs) (logPer.get(l.pegawai_id) ?? logPer.set(l.pegawai_id, []).get(l.pegawai_id)!).push(l);
        for (const t of tugasRows) (tugasPer.get(t.pegawai_id) ?? tugasPer.set(t.pegawai_id, new Set()).get(t.pegawai_id)!).add(t.tanggal);
        const jamLog = (x: Lg) => wib(new Date(x.diambil_at ?? x.waktu)).jam; // HH:MM:SS WIB
        const hasil: Record<string, Record<string, number | string>> = {};
        for (const p of peg) {
          const id = String(p.id).toLowerCase(), rows = per.get(id) ?? [], L = logPer.get(id) ?? [], T = tugasPer.get(id) ?? new Set<string>();
          const kode = kodeNorm(p.kode_mesin), iP = kode && ij ? ij.filter((x) => kodeNorm(x.kode_mesin) === kode) : [];
          const o = { kerja: 0, telat: 0, menit_telat: 0, pulang_awal: 0, menit_pulang_awal: 0, ijin: 0, sakit: 0, dinas_luar: 0, tugas_luar: 0, tanpa_ket: 0, tap: 0 };
          for (let i = 1; i <= jml; i++) {
            const t = `${bln}-${String(i).padStart(2, "0")}`;
            if (t > w.tanggal) break;
            const ef = efektif(ctx, id, p.role, rows, t, hariDari(t));
            const d = L.find((x) => x.tanggal === t && x.jenis === "datang"), pl = L.find((x) => x.tanggal === t && x.jenis === "pulang"), tl = L.find((x) => x.tanggal === t && x.jenis === "tugas_luar");
            // belum waktunya pulang (hari ini) tidak dihitung kurang absen pulang / tanpa keterangan
            const lewat = t < w.tanggal || (ef.tipe === "kerja" && w.jam.slice(0, 5) > ef.pulang!);
            if (ef.tipe === "kerja") o.kerja++;
            if (d?.status === "terlambat") { // menit dihitung dari jam masuk jadwal (bukan dari akhir toleransi)
              o.telat++;
              if (ef.tipe === "kerja") o.menit_telat += Math.max(0, Math.floor((detik(jamLog(d)) - detik(ef.masuk!)) / 60));
            }
            if (pl?.status === "pulang cepat") {
              o.pulang_awal++;
              if (ef.tipe === "kerja") o.menit_pulang_awal += Math.max(0, Math.floor((detik(ef.pulang!) - detik(jamLog(pl))) / 60));
            }
            if (d && !pl && lewat) o.tap++;
            if (d || pl || tl) continue; // ada presensi / absen Tugas Luar
            const e = iP.find((x) => x.tanggal_mulai <= t && x.tanggal_selesai >= t);
            if (e) { if (e.jenis === "sakit") o.sakit++; else if (e.jenis === "dinas_luar") o.dinas_luar++; else o.ijin++; continue; }
            if (T.has(t)) { o.tugas_luar++; continue; }
            if (ef.tipe === "kerja" && lewat) o.tanpa_ket++;
          }
          // Predikat: aturan yang sama dengan predikat rekap fingerprint (hari terjadwal = hari kerja efektif s.d. hari ini).
          let predikat = "–";
          if (o.kerja > 0) {
            if (o.tanpa_ket === 0 && o.telat === 0 && o.pulang_awal === 0 && o.tap === 0) predikat = "Sangat Baik";
            else if (o.tanpa_ket === 0 && o.telat <= o.kerja * 0.25) predikat = "Baik";
            else if (o.tanpa_ket <= o.kerja * 0.25) predikat = "Cukup";
            else predikat = "Kurang";
          }
          hasil[p.id] = { ...o, predikat };
        }
        return json({ bulan: bln, hari_ini: w.tanggal, ijin_ok: ij !== null, hasil });
      }

      case "reset_data": { // admin: hapus SEMUA data presensi (log + Tugas Luar) dan/atau SEMUA foto di storage
        butuhAdmin(me);
        if (body.konfirmasi !== "RESET") throw new Tolak("Ketik RESET untuk mengonfirmasi");
        const data = body.data === true, foto = body.foto === true;
        if (!data && !foto) throw new Tolak("Pilih yang akan direset: data presensi dan/atau foto");
        const out: { ok: boolean; log: number | null; tugas: number | null; foto: number | null; selesai: boolean } = { ok: true, log: null, tugas: null, foto: null, selesai: true };
        if (data) { // data dulu, supaya tidak ada catatan yang menunjuk ke foto yang sudah hilang
          const a = await db.from("presensi_log").delete({ count: "exact" }).gte("tanggal", "2000-01-01");
          if (a.error) throw new Tolak("Gagal menghapus data presensi: " + a.error.message, 500);
          const b = await db.from("presensi_tugas").delete({ count: "exact" }).gte("tanggal", "2000-01-01");
          if (b.error) throw new Tolak("Gagal menghapus data Tugas Luar: " + b.error.message, 500);
          out.log = a.count ?? 0; out.tugas = b.count ?? 0;
        }
        if (foto) { const f = await kosongkanFoto(90000); out.foto = f!.hapus; out.selesai = f!.selesai; }
        return json(out);
      }

      case "url": { // admin & kepala sekolah: semua foto; lainnya: hanya foto sendiri
        const paths: string[] = (Array.isArray(body.paths) ? body.paths : []).slice(0, 300).map(String);
        return json({ urls: await signedUrls(paths.filter((p) => me.role === "admin" || me.role === "kepsek" || p.startsWith(me.id + "/"))) });
      }

      case "jadwal_list": { // admin: jadwal reguler/tes semua pegawai
        butuhAdmin(me);
        return json({ jadwal: await semuaJadwal() });
      }

      case "cfg_get": { // admin: semua pengaturan + ringkasan jadwal terpasang
        butuhAdmin(me);
        const [c, jd] = await Promise.all([muatCtx(), semuaJadwal()]);
        const ids = (j: string) => [...new Set(jd.filter((r) => r.jenis === j).map((r) => r.pegawai_id))];
        return json({
          pengaturan: c.peng, libur: [...c.libur].sort(), fm: [...c.fm].sort((a, b) => (a.d < b.d ? -1 : 1)), staf: c.staf,
          piket: c.piket, file_reguler: c.fileReg ?? "", file_tes: c.fileTes ?? "",
          ada_reguler: ids("reguler"), ada_tes: ids("tes"),
        });
      }

      case "cfg_simpan": { // admin: simpan satu kelompok pengaturan
        butuhAdmin(me);
        const v = body.value;
        if (body.key === "pengaturan") {
          const p = normPeng(v);
          cekBentrok(p);
          if (p.piket.dari && (!p.piket.masuk || !p.piket.pulang || p.piket.pulang <= p.piket.masuk)) throw new Tolak("Isi jam mulai dan jam akhir piket (akhir harus setelah mulai)");
          if (p.pasca.pulang <= p.pasca.masuk) throw new Tolak("Jam pulang pasca tes harus setelah jam masuk");
          for (const h of ["1", "2", "3", "4", "5", "6"]) {
            const x = p.staf[h], nm = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][+h];
            if (!!x.masuk !== !!x.pulang) throw new Tolak(`Jam staf ${nm}: isi jam masuk dan jam pulang, atau kosongkan keduanya (libur)`);
            if (x.masuk && x.pulang <= x.masuk) throw new Tolak(`Jam staf ${nm}: jam pulang harus setelah jam masuk`);
          }
          await simpanCfg("pengaturan", p);
        } else if (body.key === "libur") {
          const l = [...new Set((Array.isArray(v) ? v : []).filter(tglOk).map(String))].sort().slice(0, 600);
          await simpanCfg("libur", l);
        } else if (body.key === "fm") {
          const m = new Map<string, string>();
          // deno-lint-ignore no-explicit-any
          for (const x of (Array.isArray(v) ? v : []) as any[]) if (tglOk(x?.d)) m.set(x.d, String(x.ket ?? "").slice(0, 80));
          await simpanCfg("fm", [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, 600).map(([d, ket]) => ({ d, ket })));
        } else if (body.key === "staf") {
          await simpanCfg("staf", [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => UUID.test(x)).map((x) => x.toLowerCase()))].slice(0, 2000));
        } else throw new Tolak("key tidak dikenal");
        return json({ ok: true });
      }

      case "jadwal_unggah": { // admin: ganti SELURUH jadwal satu jenis (reguler | tes) dengan isi berkas (atomik)
        butuhAdmin(me);
        const jenis = String(body.jenis);
        if (!["reguler", "tes"].includes(jenis)) throw new Tolak("jenis jadwal tidak valid");
        const rows = Array.isArray(body.rows) ? body.rows.slice(0, 8000) : [];
        const uniq = new Map<string, Record<string, unknown>>();
        for (const r of rows) {
          const hari = Number(r?.hari);
          if (!UUID.test(String(r?.pegawai_id)) || !(hari >= 1 && hari <= 7) || !JAM.test(String(r?.jam_masuk)) || !JAM.test(String(r?.jam_pulang))) continue;
          if (String(r.jam_masuk).slice(0, 5) >= String(r.jam_pulang).slice(0, 5)) continue;
          const id = String(r.pegawai_id).toLowerCase();
          uniq.set(`${id}|${hari}`, { pegawai_id: id, hari, jam_masuk: r.jam_masuk, jam_pulang: r.jam_pulang, jp: Math.max(0, Math.min(99, Math.round(Number(r.jp) || 0))), kelas: String(r.kelas ?? "").slice(0, 200) });
        }
        if (!uniq.size) throw new Tolak("Tidak ada baris jadwal yang valid");
        const n = ok(await db.rpc("presensi_ganti_jadwal", { p_jenis: jenis, p_rows: [...uniq.values()] }));
        await simpanCfg("file_" + jenis, { file: String(body.file ?? "").slice(0, 200), at: new Date().toISOString() });
        return json({ tersimpan: n, pegawai: new Set([...uniq.values()].map((r) => r.pegawai_id)).size });
      }

      case "jadwal_hapus": {
        butuhAdmin(me);
        const jenis = String(body.jenis);
        if (!["reguler", "tes"].includes(jenis)) throw new Tolak("jenis jadwal tidak valid");
        ok(await db.rpc("presensi_ganti_jadwal", { p_jenis: jenis, p_rows: [] }));
        await hapusCfg("file_" + jenis);
        return json({ ok: true });
      }

      case "piket_simpan": { // admin: daftar peserta piket per hari (id akun e-Rapor)
        butuhAdmin(me);
        const list: Record<string, string[]> = {};
        for (const h of ["1", "2", "3", "4", "5", "6", "7"]) {
          const arr = body.list?.[h];
          if (!Array.isArray(arr)) continue;
          const ids = [...new Set(arr.map(String).filter((x: string) => UUID.test(x)).map((x: string) => x.toLowerCase()))];
          if (ids.length) list[h] = ids;
        }
        if (!Object.keys(list).length) throw new Tolak("Tidak ada peserta piket yang cocok dengan data pegawai");
        const belum = (Array.isArray(body.belum) ? body.belum : []).slice(0, 100).map((x: unknown) => String(x).slice(0, 80));
        await simpanCfg("piket", { list, file: String(body.file ?? "").slice(0, 200), belum });
        return json({ ok: true });
      }

      case "piket_hapus":
        butuhAdmin(me);
        await hapusCfg("piket");
        return json({ ok: true });

      case "efektif_hari": { // admin: jadwal yang berlaku pada satu tanggal untuk banyak pegawai (cek jadwal)
        butuhAdmin(me);
        const tgl = String(body.tanggal);
        if (!tglOk(tgl)) throw new Tolak("Tanggal tidak valid");
        const hari = hariDari(tgl);
        const [c, jd] = await Promise.all([muatCtx(), semuaJadwal()]);
        const per = new Map<string, Jd[]>();
        for (const r of jd) (per.get(r.pegawai_id) ?? per.set(r.pegawai_id, []).get(r.pegawai_id)!).push(r);
        // deno-lint-ignore no-explicit-any
        const peg = (Array.isArray(body.pegawai) ? body.pegawai : []).slice(0, 800).filter((x: any) => UUID.test(String(x?.id)) && PEGAWAI.includes(x?.role));
        const hasil: Record<string, Ef> = {};
        for (const p of peg) hasil[p.id] = efektif(c, p.id, p.role, per.get(String(p.id).toLowerCase()) ?? [], tgl, hari);
        return json({ hari, mode: modeOf(c, tgl), ...tipeHari(c, tgl), hasil });
      }
    }
    return json({ error: "action tidak dikenal" }, 400);
  } catch (e) {
    if (e instanceof Tolak) return json({ error: e.msg }, e.status);
    return json({ error: String(e) }, 500);
  }
});
