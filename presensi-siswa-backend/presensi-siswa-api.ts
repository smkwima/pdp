// EDGE FUNCTION: presensi-siswa-api  (deploy di project PRESENSI SISWA: sfuucjmnlmfcghobpnkf)
// Satu-satunya pintu ke database presensi siswa. Browser TIDAK memegang kunci project ini.
//
// Konsepnya sama dengan presensi-api (presensi guru): halaman presensi-siswa.html ada di PDP dan memakai
// sesi login PDP. Halaman mengirim token login itu lewat header x-rapor-token; fungsi ini memverifikasinya
// ke e-Rapor/PDP (baca-saja), menentukan peran + kelas yang boleh diakses, lalu membaca/menulis data
// presensi siswa di project ini dengan service role.
//
// Hak akses:
//   admin  : semua kelas, ubah presensi, kelola kelas/siswa, sinkron dari e-Rapor
//   guru   : hanya kelas yang ia wali (tabel wali_kelas e-Rapor, per tahun ajaran), ubah presensi
//   kepsek : semua kelas, BACA SAJA (rekap + cetak)
//
// PENTING: matikan "Verify JWT" (token e-Rapor bukan JWT project ini):
//   supabase functions deploy presensi-siswa-api --no-verify-jwt --project-ref sfuucjmnlmfcghobpnkf
//   atau Dashboard > Edge Functions > presensi-siswa-api > Details > Verify JWT: OFF
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

const PERAN = ["guru", "admin", "kepsek"];
const STATUS = ["S", "I", "A"]; // Sakit, Ijin, Tanpa keterangan. Hadir = tidak ada baris.
const TGL = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\w-]{1,64}$/;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-rapor-token, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
class Tolak extends Error { constructor(public msg: string, public status = 400) { super(msg); } }

const ok = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Tolak(r.error.message, 500); return r.data; };
const tglOk = (s: unknown): s is string => typeof s === "string" && TGL.test(s) && s >= "2000-01-01" && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const idOk = (v: unknown): boolean => (typeof v === "string" && ID.test(v)) || (typeof v === "number" && Number.isFinite(v));
const S = (v: unknown) => String(v ?? "");
const chunk = <T>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const hariSelisih = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

// ---------- Identitas dari e-Rapor (hanya baca) ----------
type Me = { id: string; role: string; nama: string; token: string; wali: { kelas: string; tahun: string }[] };
const cache = new Map<string, { exp: number; me: Me }>(); // cache singkat agar klik beruntun tidak 3x ke e-Rapor
async function siapa(token: string): Promise<Me | null> {
  if (!token) return null;
  const c = cache.get(token);
  if (c && c.exp > Date.now()) return c.me;
  const h = { apikey: RAPOR_ANON, Authorization: `Bearer ${token}` };
  const u = await fetch(`${RAPOR_URL}/auth/v1/user`, { headers: h });
  if (!u.ok) return null;
  const { id } = await u.json();
  const p = await fetch(`${RAPOR_URL}/rest/v1/profiles?id=eq.${id}&select=role,nama`, { headers: h });
  const rows = await p.json();
  const prof = Array.isArray(rows) ? rows[0] : null;
  const role = String(prof?.role ?? "");
  let wali: Me["wali"] = [];
  if (role === "guru") { // wali kelas = penugasan di tabel wali_kelas (per tahun ajaran)
    const w = await fetch(`${RAPOR_URL}/rest/v1/wali_kelas?guru_id=eq.${id}&select=kelas_id,tahun_ajaran_id`, { headers: h });
    if (!w.ok) throw new Tolak("Gagal membaca data wali kelas dari e-Rapor", 502);
    const wr = await w.json();
    wali = Array.isArray(wr) ? wr.map((x: { kelas_id: unknown; tahun_ajaran_id: unknown }) => ({ kelas: S(x.kelas_id), tahun: S(x.tahun_ajaran_id) })) : [];
  }
  const me: Me = { id, role, nama: S(prof?.nama), token, wali };
  if (cache.size > 200) cache.clear();
  cache.set(token, { exp: Date.now() + 30000, me });
  return me;
}
const butuhAdmin = (me: Me) => { if (me.role !== "admin") throw new Tolak("Hanya admin", 403); };

// Kelas + tahun yang boleh diakses. tulis=true: kepsek ditolak. Guru: hanya pasangan (kelas, tahun) yang ia wali.
async function akses(me: Me, tahunId: unknown, kelasId: unknown, tulis: boolean) {
  if (!idOk(tahunId) || !idOk(kelasId)) throw new Tolak("Kelas / tahun ajaran tidak valid");
  if (tulis && me.role === "kepsek") throw new Tolak("Kepala sekolah hanya bisa melihat", 403);
  const [t, k] = await Promise.all([
    db.from("pres_tahun").select("id,rapor_id,nama,semester").eq("id", tahunId).maybeSingle(),
    db.from("pres_kelas").select("id,rapor_id,nama").eq("id", kelasId).maybeSingle(),
  ]);
  // deno-lint-ignore no-explicit-any
  const tahun = ok(t) as any, kelas = ok(k) as any;
  if (!tahun || !kelas) throw new Tolak("Kelas atau tahun ajaran tidak ditemukan", 404);
  if (me.role === "guru") {
    const boleh = !!kelas.rapor_id && !!tahun.rapor_id && me.wali.some((w) => w.kelas === S(kelas.rapor_id) && w.tahun === S(tahun.rapor_id));
    if (!boleh) throw new Tolak("Anda bukan wali kelas " + kelas.nama + " pada tahun ajaran ini", 403);
  }
  return { tahun, kelas };
}

// Daftar siswa kelas (rombel). semua=true: termasuk siswa yang statusnya bukan aktif (untuk validasi tulis).
type Stu = { id: string; nama: string; nis: string | null; nisn: string | null; no: number | null; aktif: boolean };
async function siswaKelas(tahunId: unknown, kelasId: unknown): Promise<Stu[]> {
  const rows = ok(await db.from("pres_rombel").select("no_absen,siswa:pres_siswa(id,nama,nis,nisn,status)").eq("tahun_id", tahunId).eq("kelas_id", kelasId)) as
    // deno-lint-ignore no-explicit-any
    any[];
  return rows.filter((r) => r.siswa).map((r) => ({
    id: S(r.siswa.id), nama: S(r.siswa.nama), nis: r.siswa.nis ?? null, nisn: r.siswa.nisn ?? null,
    no: r.no_absen == null ? null : Number(r.no_absen),
    aktif: !r.siswa.status || String(r.siswa.status).toLowerCase() === "aktif",
  })).sort((a, b) => ((a.no == null ? 1 : 0) - (b.no == null ? 1 : 0)) || ((a.no ?? 0) - (b.no ?? 0)) || a.nama.localeCompare(b.nama));
}

// ---------- Baca semua baris e-Rapor dengan token pengguna (RLS e-Rapor tetap berlaku) ----------
async function raporSemua(token: string, path: string) {
  const out: unknown[] = [];
  for (let off = 0; off < 200000; off += 1000) {
    const r = await fetch(`${RAPOR_URL}/rest/v1/${path}${path.includes("?") ? "&" : "?"}order=id&limit=1000&offset=${off}`, { headers: { apikey: RAPOR_ANON, Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Tolak("Gagal membaca e-Rapor: " + (await r.text()).slice(0, 200), 502);
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Tolak("Jawaban e-Rapor tidak dikenal", 502);
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Gunakan POST" }, 405);
  if (!RAPOR_URL || !RAPOR_ANON) return json({ error: "Secret RAPOR_URL / RAPOR_ANON_KEY belum diisi." }, 500);

  const body = await req.json().catch(() => ({}));
  try {
    const me = await siapa(req.headers.get("x-rapor-token") ?? "");
    if (!me) return json({ error: "Sesi login e-Rapor tidak valid. Login ulang." }, 401);
    if (!PERAN.includes(me.role)) return json({ error: "Peran tidak diizinkan" }, 403);

    switch (body.action) {
      case "awal": { // daftar tahun ajaran & kelas yang boleh dipilih + hak akses pemakai
        const tahun = ok(await db.from("pres_tahun").select("id,rapor_id,nama,semester,aktif").order("nama", { ascending: false }).order("semester", { ascending: false })) as
          // deno-lint-ignore no-explicit-any
          any[];
        const kelas = ok(await db.from("pres_kelas").select("id,rapor_id,nama,tingkat").order("nama")) as
          // deno-lint-ignore no-explicit-any
          any[];
        const hak = { role: me.role, nama: me.nama, tulis: me.role !== "kepsek", admin: me.role === "admin" };
        if (me.role !== "guru") return json({ ...hak, tahun, kelas, pairs: null });
        const pairs: { tahun_id: string; kelas_id: string }[] = [];
        for (const w of me.wali) {
          const t = tahun.find((x) => S(x.rapor_id) === w.tahun), k = kelas.find((x) => S(x.rapor_id) === w.kelas);
          if (t && k) pairs.push({ tahun_id: S(t.id), kelas_id: S(k.id) });
        }
        const tid = new Set(pairs.map((p) => p.tahun_id)), kid = new Set(pairs.map((p) => p.kelas_id));
        return json({ ...hak, tahun: tahun.filter((t) => tid.has(S(t.id))), kelas: kelas.filter((k) => kid.has(S(k.id))), pairs });
      }

      case "absen": { // siswa kelas + presensi (S/I/A) dan tanggal yang sudah disimpan pada rentang tanggal
        const { tahun, kelas } = await akses(me, body.tahun_id, body.kelas_id, false);
        if (!tglOk(body.dari) || !tglOk(body.sampai) || body.dari > body.sampai) throw new Tolak("Rentang tanggal tidak valid");
        if (hariSelisih(body.dari, body.sampai) > 400) throw new Tolak("Rentang tanggal terlalu panjang (maks. 400 hari)");
        const siswa = await siswaKelas(body.tahun_id, body.kelas_id);
        const ids = siswa.filter((x) => x.aktif).map((x) => x.id);
        const absen: { tanggal: string; siswa_id: string; status: string }[] = [];
        if (ids.length) {
          for (let off = 0; off < 100000; off += 1000) {
            const r = ok(await db.from("pres_absen").select("tanggal,siswa_id,status").in("siswa_id", ids).in("status", STATUS)
              .gte("tanggal", body.dari).lte("tanggal", body.sampai).order("id").range(off, off + 999)) as typeof absen;
            absen.push(...r.map((x) => ({ tanggal: S(x.tanggal).slice(0, 10), siswa_id: S(x.siswa_id), status: x.status })));
            if (r.length < 1000) break;
          }
        }
        const sesi = (ok(await db.from("pres_sesi").select("tanggal").eq("kelas_id", body.kelas_id).gte("tanggal", body.dari).lte("tanggal", body.sampai)) as { tanggal: string }[])
          .map((x) => S(x.tanggal).slice(0, 10));
        return json({ kelas: kelas.nama, tahun: { nama: tahun.nama, semester: tahun.semester }, siswa: siswa.filter((x) => x.aktif), absen, sesi });
      }

      case "simpan_hari": { // simpan presensi satu kelas pada satu tanggal; siswa yang tidak ada di daftar = hadir
        await akses(me, body.tahun_id, body.kelas_id, true);
        if (!tglOk(body.tanggal)) throw new Tolak("Tanggal tidak valid");
        const peta = body.absen && typeof body.absen === "object" && !Array.isArray(body.absen) ? body.absen as Record<string, unknown> : {};
        const semua = (await siswaKelas(body.tahun_id, body.kelas_id)).map((x) => x.id);
        const sah = new Set(semua);
        const baris: { tanggal: string; siswa_id: string; status: string }[] = [];
        for (const [sid, st] of Object.entries(peta)) {
          if (!sah.has(sid)) throw new Tolak("Ada siswa yang bukan anggota kelas ini");
          if (!STATUS.includes(S(st))) throw new Tolak("Status presensi tidak valid");
          baris.push({ tanggal: body.tanggal, siswa_id: sid, status: S(st) });
        }
        // Urutan aman: catat sesi, simpan yang baru/berubah, baru hapus yang kembali menjadi hadir.
        ok(await db.from("pres_sesi").upsert({ tanggal: body.tanggal, tahun_id: body.tahun_id, kelas_id: body.kelas_id }, { onConflict: "tanggal,kelas_id" }));
        for (const c of chunk(baris, 200)) ok(await db.from("pres_absen").upsert(c, { onConflict: "tanggal,siswa_id" }));
        const hadir = semua.filter((x) => !(x in peta));
        for (const c of chunk(hadir, 100)) ok(await db.from("pres_absen").delete().eq("tanggal", body.tanggal).in("siswa_id", c));
        return json({ ok: true, tersimpan: baris.length, hadir: hadir.length });
      }

      case "hapus_hari": { // hapus seluruh presensi satu kelas pada satu tanggal
        await akses(me, body.tahun_id, body.kelas_id, true);
        if (!tglOk(body.tanggal)) throw new Tolak("Tanggal tidak valid");
        const semua = (await siswaKelas(body.tahun_id, body.kelas_id)).map((x) => x.id);
        for (const c of chunk(semua, 100)) ok(await db.from("pres_absen").delete().eq("tanggal", body.tanggal).in("siswa_id", c));
        ok(await db.from("pres_sesi").delete().eq("tanggal", body.tanggal).eq("kelas_id", body.kelas_id));
        return json({ ok: true });
      }

      // ---------- Khusus admin ----------
      case "kelas_tambah": {
        butuhAdmin(me);
        const nama = S(body.nama).trim().slice(0, 40);
        if (!nama) throw new Tolak("Nama kelas kosong");
        const r = ok(await db.from("pres_kelas").insert({ nama }).select("id")) as { id: unknown }[];
        return json({ ok: true, id: S(r[0]?.id) });
      }

      case "kelas_hapus": {
        butuhAdmin(me);
        if (!idOk(body.kelas_id)) throw new Tolak("Kelas tidak valid");
        ok(await db.from("pres_kelas").delete().eq("id", body.kelas_id));
        return json({ ok: true });
      }

      case "siswa_tambah": { // tambah siswa manual (tanpa e-Rapor) ke kelas + tahun terpilih
        butuhAdmin(me);
        await akses(me, body.tahun_id, body.kelas_id, true);
        const nama = (Array.isArray(body.names) ? body.names : []).map((x: unknown) => S(x).trim().slice(0, 120)).filter(Boolean).slice(0, 200);
        if (!nama.length) throw new Tolak("Tidak ada nama siswa");
        const s = ok(await db.from("pres_siswa").insert(nama.map((n: string) => ({ nama: n }))).select("id")) as { id: unknown }[];
        ok(await db.from("pres_rombel").insert(s.map((x) => ({ tahun_id: body.tahun_id, kelas_id: body.kelas_id, siswa_id: x.id }))));
        return json({ ok: true, jumlah: s.length });
      }

      case "siswa_hapus": {
        butuhAdmin(me);
        if (!idOk(body.siswa_id)) throw new Tolak("Siswa tidak valid");
        ok(await db.from("pres_absen").delete().eq("siswa_id", body.siswa_id));
        ok(await db.from("pres_rombel").delete().eq("siswa_id", body.siswa_id));
        ok(await db.from("pres_siswa").delete().eq("id", body.siswa_id));
        return json({ ok: true });
      }

      case "sinkron": { // salin tahun ajaran, kelas, siswa per kelas dari e-Rapor (dibaca dengan token admin)
        butuhAdmin(me);
        const log: string[] = [];
        // deno-lint-ignore no-explicit-any
        let ta = await raporSemua(me.token, "tahun_ajaran?select=id,nama,semester,is_aktif") as any[];
        if (body.aktif_saja !== false) ta = ta.filter((t) => t.is_aktif);
        if (!ta.length) throw new Tolak("Tidak ada tahun ajaran/semester yang cocok di e-Rapor.");
        log.push("Mengambil kelas dan siswa dari e-Rapor…");
        // deno-lint-ignore no-explicit-any
        const kl = await raporSemua(me.token, "kelas?select=id,nama,tingkat") as any[];
        // deno-lint-ignore no-explicit-any
        const sk = await raporSemua(me.token, `siswa_kelas?select=siswa_id,kelas_id,tahun_ajaran_id,no_absen,siswa:siswa_id(id,nis,nisn,nama,status)&tahun_ajaran_id=in.(${ta.map((t) => t.id).join(",")})`) as any[];
        // Pengaman: e-Rapor yang mengembalikan 0 siswa (mis. izin baca kurang) TIDAK boleh membuat data lama terhapus.
        if (!sk.length) throw new Tolak("e-Rapor tidak mengembalikan data siswa untuk semester terpilih. Tidak ada yang diubah.");
        log.push(`Ditemukan ${ta.length} semester, ${sk.length} data siswa-kelas.`);

        const tr = ok(await db.from("pres_tahun").upsert(ta.map((t) => ({ rapor_id: S(t.id), nama: t.nama, semester: t.semester, aktif: !!t.is_aktif })), { onConflict: "rapor_id" }).select("id,rapor_id")) as { id: unknown; rapor_id: string }[];
        const tmap: Record<string, string> = {}; tr.forEach((r) => tmap[r.rapor_id] = S(r.id));
        if (body.aktif_saja !== false) { // semester lain tidak lagi ditandai aktif
          const semuaT = ok(await db.from("pres_tahun").select("id,rapor_id,aktif")) as { id: unknown; rapor_id: string | null; aktif: boolean }[];
          const basi = semuaT.filter((t) => t.aktif && !(t.rapor_id && tmap[t.rapor_id])).map((t) => t.id);
          if (basi.length) ok(await db.from("pres_tahun").update({ aktif: false }).in("id", basi));
        }

        const kids = new Set(sk.map((x) => S(x.kelas_id))), ku = kl.filter((k) => kids.has(S(k.id)));
        const lk = ok(await db.from("pres_kelas").select("id,nama,rapor_id")) as { id: unknown; nama: string; rapor_id: string | null }[];
        for (const k of ku) { // kelas manual (tanpa rapor_id) bernama sama: sambungkan, bukan dobel
          const m = lk.find((l) => !l.rapor_id && l.nama === k.nama);
          if (m) { ok(await db.from("pres_kelas").update({ rapor_id: S(k.id) }).eq("id", m.id)); m.rapor_id = S(k.id); }
        }
        const kr = ok(await db.from("pres_kelas").upsert(ku.map((k) => ({ rapor_id: S(k.id), nama: k.nama, tingkat: k.tingkat == null ? null : S(k.tingkat) })), { onConflict: "rapor_id" }).select("id,rapor_id")) as { id: unknown; rapor_id: string }[];
        const kmap: Record<string, string> = {}; kr.forEach((r) => kmap[r.rapor_id] = S(r.id));

        const sm = new Map<string, { id: unknown; nis: unknown; nisn: unknown; nama: string; status: unknown }>();
        sk.forEach((x) => { if (x.siswa) sm.set(S(x.siswa.id), x.siswa); });
        const smap: Record<string, string> = {};
        for (const c of chunk([...sm.values()], 500)) {
          const r = ok(await db.from("pres_siswa").upsert(c.map((s) => ({ rapor_id: S(s.id), nis: s.nis, nisn: s.nisn, nama: s.nama, status: s.status })), { onConflict: "rapor_id" }).select("id,rapor_id")) as { id: unknown; rapor_id: string }[];
          r.forEach((x) => smap[x.rapor_id] = S(x.id));
        }

        const rb = new Map<string, { tahun_id: string; kelas_id: string; siswa_id: string; no_absen: number | null }>();
        sk.forEach((x) => {
          const t = tmap[S(x.tahun_ajaran_id)], k = kmap[S(x.kelas_id)], s = smap[S(x.siswa_id)];
          if (t && k && s) rb.set(t + "|" + s, { tahun_id: t, kelas_id: k, siswa_id: s, no_absen: x.no_absen == null ? null : Number(x.no_absen) });
        });
        for (const c of chunk([...rb.values()], 500)) ok(await db.from("pres_rombel").upsert(c, { onConflict: "tahun_id,siswa_id" }));

        // Penempatan lama dari e-Rapor yang sudah tidak ada (siswa pindah kelas, dsb.). Siswa manual tidak disentuh.
        const lama = ok(await db.from("pres_rombel").select("id,tahun_id,siswa_id,siswa:pres_siswa(rapor_id)").in("tahun_id", Object.values(tmap))) as
          // deno-lint-ignore no-explicit-any
          any[];
        const hilang = lama.filter((o) => o.siswa && o.siswa.rapor_id && !rb.has(S(o.tahun_id) + "|" + S(o.siswa_id))).map((o) => o.id);
        for (const c of chunk(hilang, 200)) ok(await db.from("pres_rombel").delete().in("id", c));
        log.push(`Selesai: ${tr.length} semester, ${kr.length} kelas, ${Object.keys(smap).length} siswa, ${rb.size} penempatan kelas${hilang.length ? `, ${hilang.length} penempatan lama dihapus` : ""}.`);
        return json({ ok: true, log });
      }
    }
    return json({ error: "action tidak dikenal" }, 400);
  } catch (e) {
    if (e instanceof Tolak) return json({ error: e.msg }, e.status);
    return json({ error: String(e) }, 500);
  }
});
