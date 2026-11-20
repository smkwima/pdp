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
//
// POST { action, ... }  ->  JSON. Daftar action ada di switch di bawah.
import { createClient } from "npm:@supabase/supabase-js@2";

const RAPOR_URL = (Deno.env.get("RAPOR_URL") ?? "").replace(/\/+$/, "");
const RAPOR_ANON = Deno.env.get("RAPOR_ANON_KEY") ?? "";
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
  const p = await fetch(`${RAPOR_URL}/rest/v1/profiles?id=eq.${id}&select=role`, { headers: h });
  const rows = await p.json();
  return { id: id as string, role: Array.isArray(rows) ? (rows[0]?.role as string) : undefined };
}

// Waktu server (WIB) — tidak percaya jam HP.
function wib() {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Gunakan POST" }, 405);
  if (!RAPOR_URL || !RAPOR_ANON) return json({ error: "Secret RAPOR_URL / RAPOR_ANON_KEY belum diisi." }, 500);

  const me = await siapa(req.headers.get("x-rapor-token") ?? "");
  if (!me) return json({ error: "Sesi login e-Rapor tidak valid. Login ulang." }, 401);
  if (!PEGAWAI.includes(me.role ?? "")) return json({ error: "Peran tidak diizinkan" }, 403);

  const body = await req.json().catch(() => ({}));
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
        const [ctx, rows, log] = await Promise.all([
          muatCtx(), jadwalSaya(me.id),
          db.from("presensi_log").select("*").eq("pegawai_id", me.id).eq("tanggal", w.tanggal),
        ]);
        return json({ tanggal: w.tanggal, jam: w.jam, hari: w.hari, ef: efektif(ctx, me.id, me.role!, rows, w.tanggal, w.hari), log: ok(log) });
      }

      case "absen": { // validasi radius, status, simpan foto + log — semua di server
        const jenis = body.jenis;
        if (!["datang", "pulang"].includes(jenis)) throw new Tolak("jenis tidak valid");
        const lat = Number(body.lat), lng = Number(body.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Tolak("Lokasi tidak valid");
        const bin = Uint8Array.from(atob(String(body.foto ?? "")), (c) => c.charCodeAt(0));
        if (bin.length < 1000 || bin.length > MAX) throw new Tolak("Ukuran foto harus 1 KB – 20 KB");
        if (bin[0] !== 0xff || bin[1] !== 0xd8 || bin[2] !== 0xff) throw new Tolak("Bukan file JPEG");

        const cfg = await lokasi(), w = wib();
        const ctx = await muatCtx();
        const ef = efektif(ctx, me.id, me.role!, await jadwalSaya(me.id), w.tanggal, w.hari);
        if (ef.tipe === "libur") throw new Tolak("Hari ini libur, presensi tidak diperlukan");
        if (ef.tipe === "fm") throw new Tolak("Hari ini Force Majeure" + (ef.ket ? " (" + ef.ket + ")" : "") + ", presensi tidak diperlukan");
        const d = jarak(cfg.lat, cfg.lng, lat, lng);
        if (d > cfg.radius_m) throw new Tolak(`Di luar radius presensi (${d} m dari titik, batas ${cfg.radius_m} m)`);

        const hr = ok(await db.from("presensi_log").select("jenis").eq("pegawai_id", me.id).eq("tanggal", w.tanggal));
        if (hr.some((x: { jenis: string }) => x.jenis === jenis)) throw new Tolak(`Presensi ${jenis} hari ini sudah tercatat`, 409);
        if (jenis === "pulang" && !hr.some((x: { jenis: string }) => x.jenis === "datang")) throw new Tolak("Belum presensi datang hari ini");

        let status = "tepat waktu";
        if (ef.tipe !== "kerja") status = "tanpa jadwal";
        else if (jenis === "datang") { if (detik(w.jam) > detik(ef.masuk!) + cfg.toleransi_menit * 60 + 59) status = "terlambat"; }
        else if (detik(w.jam) < detik(ef.pulang!)) status = "pulang cepat";

        const path = `${me.id}/${w.tanggal}-${jenis}.jpg`;
        const ins = await db.from("presensi_log").insert({ pegawai_id: me.id, tanggal: w.tanggal, jenis, lat, lng, jarak_m: d, foto_path: path, status });
        if (ins.error) throw new Tolak(ins.error.code === "23505" ? `Presensi ${jenis} hari ini sudah tercatat` : ins.error.message, ins.error.code === "23505" ? 409 : 500);
        const up = await db.storage.from(BUCKET).upload(path, bin, { upsert: true, contentType: "image/jpeg" });
        if (up.error) { // batalkan log agar tidak ada presensi tanpa foto
          await db.from("presensi_log").delete().eq("pegawai_id", me.id).eq("tanggal", w.tanggal).eq("jenis", jenis);
          throw new Tolak("Gagal menyimpan foto: " + up.error.message, 500);
        }
        return json({ ok: true, status, jarak_m: d, tanggal: w.tanggal, jam: w.jam });
      }

      case "riwayat":
        return json({ log: ok(await db.from("presensi_log").select("*").eq("pegawai_id", me.id).order("waktu", { ascending: false }).limit(60)) });

      case "rekap": { // admin & kepala sekolah (baca-saja): semua log pada satu tanggal + tautan foto
        butuhAdminAtauKepsek(me);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.tanggal))) throw new Tolak("Tanggal tidak valid");
        const log = ok(await db.from("presensi_log").select("*").eq("tanggal", body.tanggal));
        const hariInfo = tipeHari(await muatCtx(), body.tanggal);
        const paths = log.map((x: { foto_path: string | null }) => x.foto_path).filter(Boolean).slice(0, 600) as string[];
        return json({ log, hari: hariInfo, urls: await signedUrls(paths) });
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
