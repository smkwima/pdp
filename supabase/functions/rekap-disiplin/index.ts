// =========================================================
// EDGE FUNCTION: rekap-disiplin
// Dipakai halaman disiplin.html (khusus Kepala Sekolah; admin juga boleh).
// Membaca rekap yang sudah DISIMPAN di Rekap Absen (tabel absen_rekap) dan
// mengembalikan HANYA nama guru/staf + predikat kedisiplinan. Data scan,
// jadwal, jam, dan jumlah menit tidak pernah dikirim ke browser.
//
// Aksi (body JSON, field "aksi"):
//   daftar : { }        -> daftar rekap tersimpan (judul, periode), terbaru dulu   (kepsek/admin)
//   lihat  : { id }     -> semua guru/staf + angka + predikat untuk satu rekap      (kepsek/admin)
//   saya   : { id? }    -> HANYA baris milik pemanggil (dicocokkan lewat kode mesin,
//                          cadangan: nama) + daftar rekap; id kosong = rekap terbaru.
//                          Boleh untuk guru, staf, kepsek, admin.  (kartu di Menu Utama)
//
// Secrets (sama dengan ijin-absen): REKAP_SUPABASE_URL, REKAP_SERVICE_KEY
// =========================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ---- pembaca angka ringkasan (toleran terhadap variasi nama kunci) ----
const KOLOM: Record<string, string[]> = {
  alpa: ["alpa", "alpha", "tidak_hadir", "tidakHadir"],
  terlambat: ["terlambat", "telat"],
  pulang_awal: ["pulang_awal", "pulangAwal", "pulang_cepat", "pulangCepat", "pulang_lebih_awal"],
  ijin: ["ijin", "izin"],
  sakit: ["sakit"],
  dinas_luar: ["dinas_luar", "dinasLuar", "dl"],
};
// Ubah satu nilai ringkasan jadi angka: angka, "1", "1x", "1 kali", daftar tanggal (dihitung), atau objek {kali/jumlah/count}.
function keAngka(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return v.length;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["kali", "jumlah", "count", "n", "hari", "total"]) {
      const x = keAngka(o[k]);
      if (x !== null) return x;
    }
    return null;
  }
  const f = parseFloat(String(v).replace(",", "."));
  return isNaN(f) ? null : f;
}
// Pola cadangan bila nama kunci tidak persis sama. Kunci berisi menit/jam/durasi tidak dipakai (itu lama, bukan jumlah kejadian).
const POLA: Record<string, RegExp> = {
  alpa: /(alpa|alpha|tidak_?hadir|absen)/i,
  terlambat: /(terlambat|telat|late)/i,
  pulang_awal: /(pulang.*(awal|cepat)|(awal|cepat).*pulang|early)/i,
  ijin: /(ijin|izin)/i,
  sakit: /sakit/i,
  dinas_luar: /(dinas|^dl$|_dl$)/i,
};
const BUKAN_JUMLAH = /(menit|min$|_min|jam|durasi|detik|total_?waktu|persen|pct)/i;
function angka(o: Record<string, unknown>, kunci: string[], pola?: RegExp): number | null {
  for (const k of kunci) {
    const x = keAngka(o[k]);
    if (x !== null) return x;
  }
  if (pola) {
    for (const k of Object.keys(o)) {
      if (pola.test(k) && !BUKAN_JUMLAH.test(k)) {
        const x = keAngka(o[k]);
        if (x !== null) return x;
      }
    }
  }
  return null;
}
function barisAman(o: Record<string, unknown>) {
  const out: Record<string, unknown> = {
    nama: String(o.nama ?? "").slice(0, 120),
    predikat: String(o.predikat ?? "–").slice(0, 30),
  };
  for (const [k, alias] of Object.entries(KOLOM)) out[k] = angka(o, alias, POLA[k]);
  return out;
}
function kolomHilang(rows: Record<string, unknown>[]): string[] {
  return Object.keys(KOLOM).filter((k) => rows.length > 0 && rows.every((r) => r[k] === null || r[k] === undefined));
}
const kodeNorm = (v: unknown) => { const t = String(v ?? "").trim(); return /^\d+$/.test(t) ? String(parseInt(t, 10)) : ""; };
const namaNorm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
function cariBarisSaya(ring: Record<string, unknown>[], kode: string, nama: string) {
  if (kode) {
    const h = ring.find((o) => ["kode_mesin", "kode", "kodeMesin", "no_id", "id", "pin"].some((k) => kodeNorm(o[k]) === kode));
    if (h) return h;
  }
  const n = namaNorm(nama);
  return n ? ring.find((o) => namaNorm(o.nama) === n) : undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method tidak didukung, gunakan POST." }, 405);
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const REKAP_URL = (Deno.env.get("REKAP_SUPABASE_URL") || "").replace(/\/+$/, "");
    const REKAP_KEY = Deno.env.get("REKAP_SERVICE_KEY") || "";
    if (!REKAP_URL || !REKAP_KEY) {
      return json({ error: "Secret REKAP_SUPABASE_URL / REKAP_SERVICE_KEY belum diisi di Edge Functions -> Secrets." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Tidak ada sesi login. Silakan login ulang." }, 401);
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(jwt);
    if (callerErr || !callerData?.user) return json({ error: "Sesi login tidak valid. Silakan login ulang." }, 401);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: prof } = await adminClient.from("profiles").select("nama, role, kode_mesin").eq("id", callerData.user.id).maybeSingle();
    if (!prof) return json({ error: "Profil akun tidak ditemukan." }, 403);
    const boleh = ["kepsek", "admin"].includes(prof.role);

    const rekap = async (path: string) => {
      const r = await fetch(`${REKAP_URL}/rest/v1${path}`, { headers: { apikey: REKAP_KEY, Authorization: `Bearer ${REKAP_KEY}` } });
      const tx = await r.text();
      let j: unknown = null;
      try { j = tx ? JSON.parse(tx) : null; } catch { /* bukan JSON */ }
      return { ok: r.ok, status: r.status, data: j, text: tx };
    };
    const galat = (r: { status: number; text: string }) => {
      if (r.status === 404 || /PGRST205|42P01|schema cache|does not exist/i.test(r.text)) {
        return json({ error: "Tabel absen_rekap belum ada di database Rekap Absen." }, 500);
      }
      return json({ error: `Rekap Absen menolak permintaan (HTTP ${r.status}). ${r.text.slice(0, 200)}` }, 502);
    };

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* body kosong */ }
    const aksi = String(body.aksi || "");

    if ((aksi === "daftar" || aksi === "lihat") && !boleh) {
      return json({ error: "Rekap kedisiplinan seluruh guru hanya untuk Kepala Sekolah." }, 403);
    }

    if (aksi === "daftar") {
      const r = await rekap("/absen_rekap?select=id,judul,periode_awal,periode_akhir,created_at&order=created_at.desc&limit=60");
      if (!r.ok) return galat(r);
      return json({ success: true, data: r.data || [] }, 200);
    }

    if (aksi === "lihat") {
      const id = String(body.id ?? "");
      if (!/^[0-9a-zA-Z-]{1,64}$/.test(id)) return json({ error: "ID rekap tidak valid." }, 400);
      const r = await rekap(`/absen_rekap?id=eq.${encodeURIComponent(id)}&select=judul,periode_awal,periode_akhir,created_at,ringkasan&limit=1`);
      if (!r.ok) return galat(r);
      const baris = Array.isArray(r.data) ? r.data[0] as Record<string, unknown> | undefined : undefined;
      if (!baris) return json({ error: "Rekap tidak ditemukan." }, 404);
      const ring = Array.isArray(baris.ringkasan) ? baris.ringkasan as Record<string, unknown>[] : [];
      const data = ring
        .map((o) => barisAman(o))
        .filter((o) => o.nama)
        .sort((a, b) => String(a.nama).localeCompare(String(b.nama), "id"));
      return json({
        success: true,
        judul: baris.judul, periode_awal: baris.periode_awal, periode_akhir: baris.periode_akhir, created_at: baris.created_at,
        data, kolom_hilang: kolomHilang(data),
      }, 200);
    }

    if (aksi === "saya") {
      const dr = await rekap("/absen_rekap?select=id,judul,periode_awal,periode_akhir,created_at&order=created_at.desc&limit=24");
      if (!dr.ok) return galat(dr);
      const daftar = (dr.data || []) as Record<string, unknown>[];
      if (!daftar.length) return json({ success: true, daftar: [], rekap: null, data: null, alasan: "belum_ada_rekap" }, 200);

      const idMinta = String(body.id ?? "");
      if (idMinta && !/^[0-9a-zA-Z-]{1,64}$/.test(idMinta)) return json({ error: "ID rekap tidak valid." }, 400);
      const id = idMinta || String(daftar[0].id);
      const r = await rekap(`/absen_rekap?id=eq.${encodeURIComponent(id)}&select=judul,periode_awal,periode_akhir,created_at,ringkasan&limit=1`);
      if (!r.ok) return galat(r);
      const baris = Array.isArray(r.data) ? r.data[0] as Record<string, unknown> | undefined : undefined;
      if (!baris) return json({ error: "Rekap tidak ditemukan." }, 404);
      const ring = Array.isArray(baris.ringkasan) ? baris.ringkasan as Record<string, unknown>[] : [];

      const kode = kodeNorm(prof.kode_mesin);
      const milik = cariBarisSaya(ring, kode, String(prof.nama ?? ""));
      const dataSaya = milik ? barisAman(milik) : null;
      return json({
        success: true,
        daftar,
        rekap: { id, judul: baris.judul, periode_awal: baris.periode_awal, periode_akhir: baris.periode_akhir, created_at: baris.created_at },
        data: dataSaya,
        kolom_hilang: dataSaya ? kolomHilang([dataSaya]) : [],
        kunci_tersedia: milik ? Object.keys(milik).slice(0, 60) : [],
        alasan: dataSaya ? null : (kode ? "tidak_ditemukan" : "kode_mesin_kosong"),
      }, 200);
    }

    return json({ error: "Aksi tidak dikenal." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Terjadi kesalahan tak terduga." }, 500);
  }
});
