// =========================================================
// EDGE FUNCTION: ijin-absen
// Dipanggil halaman ijin.html (aplikasi "Ijin & Dinas Luar" di pdp).
// Menyimpan pengajuan ijin ke database REKAP ABSEN (project Supabase lain),
// tabel absen_ijin (lihat rekap_ijin.sql).
//
// Aksi (body JSON, field "aksi"):
//   simpan       : { jenis, tanggal_mulai, tanggal_selesai, deskripsi }  -> semua guru/staf/admin
//                  (status awal 'menunggu'; pengajuan admin sendiri langsung 'disetujui')
//   daftar       : { }  -> milik sendiri; admin & kepsek melihat semua
//   hapus        : { id } -> milik sendiri (selama belum disetujui); admin boleh menghapus siapa pun
//   setujui      : { id } -> ADMIN saja
//   tolak        : { id, catatan? } -> ADMIN saja
//   hitung       : { } -> ADMIN saja; jumlah pengajuan 'menunggu' (untuk notifikasi, maks 200)
//   setujui_semua: { ids? } -> ADMIN saja; menyetujui semua yang masih 'menunggu'
//                  (bila ids diisi, hanya yang ada di daftar itu)
//
// Rekap Absen hanya membaca pengajuan berstatus 'disetujui' (lihat rekap_ijin_persetujuan.sql).
//
// Keamanan:
//   - Pemanggil diverifikasi lewat JWT pdp; nama & kode mesin diambil dari
//     tabel profiles (bukan dari kiriman browser), jadi tidak bisa mengaku
//     sebagai orang lain.
//   - Kunci service_role Rekap Absen hanya ada di Secrets function ini.
//
// Secrets (sama dengan sync-kode-mesin):
//   REKAP_SUPABASE_URL, REKAP_SERVICE_KEY
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

const JENIS = ["sakit", "ijin", "dinas_luar"];
const MAKS_HARI = 90;          // satu pengajuan paling lama 90 hari
const MAKS_MUNDUR_HARI = 120;  // boleh mengisi ijin yang sudah lewat sampai 120 hari
const MAKS_MAJU_HARI = 365;
const MAKS_DESKRIPSI = 500;
const MAKS_CATATAN = 200;
const MAKS_MASSAL = 500;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function tglValid(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function selisihHari(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
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

    // ---- Verifikasi pemanggil ----
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Tidak ada sesi login. Silakan login ulang." }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(jwt);
    if (callerErr || !callerData?.user) return json({ error: "Sesi login tidak valid. Silakan login ulang." }, 401);
    const uid = callerData.user.id;

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: prof } = await adminClient
      .from("profiles").select("nama, role, kode_mesin").eq("id", uid).maybeSingle();
    if (!prof || !["admin", "kepsek", "guru", "staf"].includes(prof.role)) {
      return json({ error: "Akun ini tidak berhak mengajukan ijin." }, 403);
    }
    const pimpinan = prof.role === "admin" || prof.role === "kepsek";

    const rekap = async (path: string, init: RequestInit = {}) => {
      const r = await fetch(`${REKAP_URL}/rest/v1${path}`, {
        ...init,
        headers: {
          apikey: REKAP_KEY,
          Authorization: `Bearer ${REKAP_KEY}`,
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
      });
      const tx = await r.text();
      let j: unknown = null;
      try { j = tx ? JSON.parse(tx) : null; } catch { /* bukan JSON */ }
      return { ok: r.ok, status: r.status, data: j, text: tx };
    };
    const galatRekap = (r: { status: number; text: string }) => {
      if (/42703|column .*(status|diproses|catatan_admin)/i.test(r.text)) {
        return json({ error: "Kolom persetujuan belum ada di database Rekap Absen. Minta admin menjalankan rekap_ijin_persetujuan.sql di project Rekap Absen." }, 500);
      }
      if (r.status === 404 || /PGRST205|42P01|schema cache|does not exist/i.test(r.text)) {
        return json({ error: "Tabel absen_ijin belum ada di database Rekap Absen. Minta admin menjalankan rekap_ijin.sql di project Rekap Absen." }, 500);
      }
      return json({ error: `Rekap Absen menolak permintaan (HTTP ${r.status}). ${r.text.slice(0, 200)}` }, 502);
    };

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* body kosong */ }
    const aksi = String(body.aksi || "");

    // ================= SIMPAN =================
    if (aksi === "simpan") {
      const kodeMentah = String(prof.kode_mesin ?? "").trim();
      const kodeAngka = parseInt(kodeMentah, 10);
      if (!kodeMentah || isNaN(kodeAngka)) {
        return json({ error: "Kode mesin (No.ID fingerprint) akunmu belum diisi. Minta admin mengisinya di menu Guru & Penugasan, lalu sinkron ke Rekap Absen." }, 400);
      }
      const kode = String(kodeAngka); // sama dengan normalisasi di Rekap Absen (tanpa nol di depan)

      const jenis = String(body.jenis || "");
      const mulai = body.tanggal_mulai;
      const selesai = body.tanggal_selesai ?? body.tanggal_mulai;
      const deskripsi = String(body.deskripsi ?? "").trim();

      if (!JENIS.includes(jenis)) return json({ error: "Jenis ijin tidak valid." }, 400);
      if (!tglValid(mulai) || !tglValid(selesai)) return json({ error: "Tanggal tidak valid." }, 400);
      if (selesai < mulai) return json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai." }, 400);
      if (selisihHari(mulai, selesai) + 1 > MAKS_HARI) return json({ error: `Satu pengajuan paling lama ${MAKS_HARI} hari.` }, 400);
      const hariIni = new Date().toISOString().slice(0, 10);
      if (selisihHari(mulai, hariIni) > MAKS_MUNDUR_HARI) return json({ error: `Tanggal terlalu lampau (maksimal ${MAKS_MUNDUR_HARI} hari ke belakang).` }, 400);
      if (selisihHari(hariIni, selesai) > MAKS_MAJU_HARI) return json({ error: "Tanggal terlalu jauh ke depan." }, 400);
      if (!deskripsi) return json({ error: "Deskripsi ijin wajib diisi." }, 400);
      if (deskripsi.length > MAKS_DESKRIPSI) return json({ error: `Deskripsi paling banyak ${MAKS_DESKRIPSI} karakter.` }, 400);

      // Tolak kalau bertabrakan dengan pengajuan lain milik orang yang sama
      const tabrak = await rekap(
        `/absen_ijin?select=id,jenis,tanggal_mulai,tanggal_selesai&pdp_user_id=eq.${uid}` +
        `&tanggal_mulai=lte.${selesai}&tanggal_selesai=gte.${mulai}&status=neq.ditolak&limit=1`);
      if (!tabrak.ok) return galatRekap(tabrak);
      if (Array.isArray(tabrak.data) && tabrak.data.length) {
        const t = tabrak.data[0] as { tanggal_mulai: string; tanggal_selesai: string };
        return json({ error: `Sudah ada pengajuan ijin yang bertabrakan (${t.tanggal_mulai} s.d. ${t.tanggal_selesai}). Hapus dulu pengajuan itu bila ingin menggantinya.` }, 409);
      }

      // Pengajuan admin sendiri langsung disetujui; selain itu menunggu persetujuan admin.
      const langsung = prof.role === "admin";
      const ins = await rekap("/absen_ijin", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          pdp_user_id: uid, kode_mesin: kode, nama: prof.nama || callerData.user.email || "—",
          jenis, tanggal_mulai: mulai, tanggal_selesai: selesai, deskripsi,
          status: langsung ? "disetujui" : "menunggu",
          ...(langsung ? { diproses_oleh: uid, diproses_nama: prof.nama || "Admin", diproses_at: new Date().toISOString() } : {}),
        }),
      });
      if (!ins.ok) return galatRekap(ins);
      const row = Array.isArray(ins.data) ? ins.data[0] : ins.data;
      return json({ success: true, data: row }, 200);
    }

    // ================= DAFTAR =================
    if (aksi === "daftar") {
      const kolom = "id,pdp_user_id,kode_mesin,nama,jenis,tanggal_mulai,tanggal_selesai,deskripsi,created_at,status,diproses_nama,diproses_at,catatan_admin";
      const saring = pimpinan ? "" : `&pdp_user_id=eq.${uid}`;
      const r = await rekap(`/absen_ijin?select=${kolom}${saring}&order=tanggal_mulai.desc,created_at.desc&limit=500`);
      if (!r.ok) return galatRekap(r);
      return json({ success: true, semua: pimpinan, data: r.data || [] }, 200);
    }

    // ================= HAPUS =================
    if (aksi === "hapus") {
      const id = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "ID pengajuan tidak valid." }, 400);
      const cari = await rekap(`/absen_ijin?select=id,pdp_user_id,status&id=eq.${id}&limit=1`);
      if (!cari.ok) return galatRekap(cari);
      const baris = Array.isArray(cari.data) ? cari.data[0] as { pdp_user_id: string; status: string } : null;
      if (!baris) return json({ error: "Pengajuan tidak ditemukan (mungkin sudah dihapus)." }, 404);
      if (baris.pdp_user_id !== uid && prof.role !== "admin") {
        return json({ error: "Kamu hanya bisa menghapus pengajuan milikmu sendiri." }, 403);
      }
      if (prof.role !== "admin" && baris.status === "disetujui") {
        return json({ error: "Pengajuan yang sudah disetujui admin tidak bisa dihapus sendiri. Hubungi admin bila perlu dibatalkan." }, 403);
      }
      const del = await rekap(`/absen_ijin?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      if (!del.ok) return galatRekap(del);
      return json({ success: true }, 200);
    }

    // ================= HITUNG (NOTIFIKASI ADMIN) =================
    if (aksi === "hitung") {
      if (prof.role !== "admin") return json({ error: "Hanya admin." }, 403);
      const r = await rekap(`/absen_ijin?select=nama,jenis,created_at&status=eq.menunggu&order=created_at.desc&limit=200`);
      if (!r.ok) return galatRekap(r);
      const baris = Array.isArray(r.data) ? r.data as { nama: string; jenis: string; created_at: string }[] : [];
      return json({ success: true, jumlah: baris.length, terbaru: baris[0] || null }, 200);
    }

    // ================= PERSETUJUAN (ADMIN) =================
    if (aksi === "setujui" || aksi === "tolak" || aksi === "setujui_semua") {
      if (prof.role !== "admin") return json({ error: "Hanya admin yang bisa menyetujui atau menolak pengajuan." }, 403);
      const sekarang = new Date().toISOString();
      const namaAdmin = prof.nama || "Admin";

      if (aksi === "setujui_semua") {
        let saringId = "";
        if (Array.isArray(body.ids)) {
          const ids = (body.ids as unknown[]).map(String);
          if (!ids.length) return json({ success: true, jumlah: 0 }, 200);
          if (ids.length > MAKS_MASSAL || ids.some((x) => !UUID_RE.test(x))) return json({ error: "Daftar ID tidak valid." }, 400);
          saringId = `&id=in.(${ids.join(",")})`;
        }
        const up = await rekap(`/absen_ijin?status=eq.menunggu${saringId}&select=id`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ status: "disetujui", diproses_oleh: uid, diproses_nama: namaAdmin, diproses_at: sekarang, catatan_admin: null }),
        });
        if (!up.ok) return galatRekap(up);
        return json({ success: true, jumlah: Array.isArray(up.data) ? up.data.length : 0 }, 200);
      }

      const id = String(body.id || "");
      if (!UUID_RE.test(id)) return json({ error: "ID pengajuan tidak valid." }, 400);
      const setuju = aksi === "setujui";
      const catatan = setuju ? null : (String(body.catatan ?? "").trim().slice(0, MAKS_CATATAN) || null);
      const up = await rekap(`/absen_ijin?id=eq.${id}&select=id,status`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: setuju ? "disetujui" : "ditolak", diproses_oleh: uid, diproses_nama: namaAdmin, diproses_at: sekarang, catatan_admin: catatan }),
      });
      if (!up.ok) return galatRekap(up);
      if (!Array.isArray(up.data) || !up.data.length) return json({ error: "Pengajuan tidak ditemukan (mungkin sudah dihapus)." }, 404);
      return json({ success: true, status: setuju ? "disetujui" : "ditolak", diproses_nama: namaAdmin, diproses_at: sekarang, catatan_admin: catatan }, 200);
    }

    return json({ error: "Aksi tidak dikenal." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Terjadi kesalahan tak terduga." }, 500);
  }
});
