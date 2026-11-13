// =========================================================
// EDGE FUNCTION: rekap-disiplin
// Dipakai halaman disiplin.html (khusus Kepala Sekolah; admin juga boleh).
// Membaca rekap yang sudah DISIMPAN di Rekap Absen (tabel absen_rekap) dan
// mengembalikan HANYA nama guru/staf + predikat kedisiplinan. Data scan,
// jadwal, jam, dan jumlah menit tidak pernah dikirim ke browser.
//
// Aksi (body JSON, field "aksi"):
//   daftar : { }        -> daftar rekap tersimpan (judul, periode), terbaru dulu
//   lihat  : { id }     -> [{ nama, predikat }] untuk satu rekap
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
    const { data: prof } = await adminClient.from("profiles").select("role").eq("id", callerData.user.id).maybeSingle();
    if (!prof || !["kepsek", "admin"].includes(prof.role)) {
      return json({ error: "Rekap kedisiplinan hanya untuk Kepala Sekolah." }, 403);
    }

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
      // Hanya nama + predikat yang keluar dari server.
      const data = ring
        .map((o) => ({ nama: String(o.nama ?? "").slice(0, 120), predikat: String(o.predikat ?? "–").slice(0, 30) }))
        .filter((o) => o.nama)
        .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
      return json({
        success: true,
        judul: baris.judul, periode_awal: baris.periode_awal, periode_akhir: baris.periode_akhir, created_at: baris.created_at,
        data,
      }, 200);
    }

    return json({ error: "Aksi tidak dikenal." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Terjadi kesalahan tak terduga." }, 500);
  }
});
