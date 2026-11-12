// =========================================================
// EDGE FUNCTION: sync-kode-mesin
// Dipanggil tombol "Sinkron ke Rekap Absen" di menu Guru (penugasan-admin.html).
//
// Alur:
//   1. Pastikan pemanggil login dan rolenya 'admin' (dicek lewat profiles).
//   2. Ambil guru & staf yang punya kode mesin (HANYA nama, role, kode —
//      email/NIP tidak ikut).
//   3. Kirim ke database Rekap Absen (project Supabase lain) ke tabel
//      absen_config, kunci 'kode_mesin', memakai kunci rahasia yang hanya
//      tersimpan di Secrets function ini. Browser tidak pernah melihat kuncinya.
//
// Secrets yang harus diisi (Dashboard -> Edge Functions -> Secrets):
//   REKAP_SUPABASE_URL   mis. https://jvunlziapbmvxmrrnphd.supabase.co
//   REKAP_SERVICE_KEY    service_role key project Rekap Absen
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      return json({
        error: "Secret REKAP_SUPABASE_URL / REKAP_SERVICE_KEY belum diisi di Edge Functions -> Secrets.",
      }, 500);
    }

    // ---- 1. Verifikasi pemanggil = admin ----
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Tidak ada sesi login. Silakan login ulang." }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(jwt);
    if (callerErr || !callerData?.user) {
      return json({ error: "Sesi login tidak valid. Silakan login ulang." }, 401);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: callerProfile } = await adminClient
      .from("profiles").select("nama, role").eq("id", callerData.user.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Hanya admin yang boleh menyinkronkan data." }, 403);
    }

    // ---- 2. Ambil guru & staf (hanya kolom yang dibutuhkan rekap) ----
    const { data: rows, error: rowsErr } = await adminClient
      .from("profiles")
      .select("nama, role, kode_mesin")
      .in("role", ["guru", "staf"])
      .order("nama");
    if (rowsErr) {
      return json({ error: "Gagal membaca data guru/staf: " + rowsErr.message }, 500);
    }

    const items: { id: string; nama: string; role: string }[] = [];
    const tanpaKode: string[] = [];
    for (const r of rows || []) {
      const kode = String(r.kode_mesin ?? "").trim();
      if (kode) items.push({ id: kode, nama: r.nama, role: r.role });
      else tanpaKode.push(r.nama);
    }

    // ---- 3. Kirim ke database Rekap Absen ----
    const sekarang = new Date().toISOString();
    const resp = await fetch(`${REKAP_URL}/rest/v1/absen_config?on_conflict=key`, {
      method: "POST",
      headers: {
        apikey: REKAP_KEY,
        Authorization: `Bearer ${REKAP_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        key: "kode_mesin",
        value: { items, jumlah: items.length, synced_at: sekarang, synced_by: callerProfile.nama },
        updated_at: sekarang,
      }),
    });
    if (!resp.ok) {
      const tx = await resp.text().catch(() => "");
      return json({ error: `Rekap Absen menolak data (HTTP ${resp.status}). ${tx.slice(0, 200)}` }, 502);
    }

    return json({
      success: true,
      terkirim: items.length,
      tanpa_kode: tanpaKode.length,
      nama_tanpa_kode: tanpaKode.slice(0, 30),
      synced_at: sekarang,
    }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Terjadi kesalahan tak terduga." }, 500);
  }
});
