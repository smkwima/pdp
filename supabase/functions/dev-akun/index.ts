// =========================================================
// EDGE FUNCTION: dev-akun
// Dipanggil dari developer.html (menu "Manajemen Akun").
//
// Aksi (semua hanya untuk role 'developer', dicek lewat tabel profiles):
//   reset_sandi   : ganti kata sandi akun mana pun (min. 8 karakter)
//   ubah_peran    : ubah profiles.role (admin/guru/kepsek/staf/pengawas)
//   nonaktifkan   : blokir login + cabut semua sesi
//   aktifkan      : buka blokir login
//   paksa_keluar  : cabut semua sesi login
//   lihat_sebagai : terbitkan token sekali pakai agar developer bisa
//                   melihat portal sebagai pengguna lain (BACA SAJA,
//                   30 menit; pembatasan baca-saja ditegakkan di browser
//                   oleh supabase-client.js)
//
// Aturan keras:
//   - Tidak bisa dipakai pada akun sendiri maupun akun developer lain.
//   - 'lihat_sebagai' hanya untuk peran di PERAN_BOLEH_DILIHAT dan wajib
//     menyertakan alasan; dicatat LEBIH DAHULU ke log_developer. Bila
//     pencatatan gagal, aksi dibatalkan.
//   - Semua aksi dicatat ke log_developer (terbaca admin) dan, bila bisa,
//     ke Log Aktivitas. Kata sandi TIDAK PERNAH dicatat.
//
// Env var SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// sudah otomatis tersedia di Edge Function.
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

const PERAN_BARU = ["admin", "guru", "kepsek", "staf", "pengawas"];
// 'admin' sengaja tidak ada: melihat sebagai admin membuka data paling sensitif.
// Tambahkan di sini bila memang diperlukan.
const PERAN_BOLEH_DILIHAT = ["guru", "kepsek", "staf", "pengawas", "siswa"];
const DURASI_LIHAT_MENIT = 30;
const BAN_LAMA = "876000h"; // ~100 tahun
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method tidak didukung, gunakan POST." }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ---- 1. Identitas pemanggil ----
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Tidak ada sesi login. Silakan login ulang." }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(jwt);
    if (callerErr || !callerData?.user) return json({ error: "Sesi login tidak valid. Silakan login ulang." }, 401);
    const caller = callerData.user;

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---- 2. Harus developer ----
    const { data: callerProfile } = await adminClient
      .from("profiles").select("role, nama").eq("id", caller.id).maybeSingle();
    if (!callerProfile || String(callerProfile.role) !== "developer") {
      return json({ error: "Hanya developer yang boleh memakai fitur ini." }, 403);
    }

    // ---- 3. Validasi input & akun target ----
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    const userId = String(body.user_id || "").trim();
    if (!UUID_RE.test(userId)) return json({ error: "user_id tidak valid." }, 400);
    if (userId === caller.id) return json({ error: "Fitur ini tidak bisa dipakai pada akun sendiri." }, 400);

    const { data: tAuth, error: tErr } = await adminClient.auth.admin.getUserById(userId);
    if (tErr || !tAuth?.user) return json({ error: "Akun tidak ditemukan." }, 404);
    const targetUser = tAuth.user;

    const { data: tp } = await adminClient.from("profiles").select("nama, role").eq("id", userId).maybeSingle();
    let peranTarget: string | null = tp?.role ? String(tp.role) : null;
    let namaTarget: string | null = tp?.nama ?? null;
    if (!peranTarget) {
      const { data: sw } = await adminClient.from("siswa").select("nama").eq("auth_user_id", userId).maybeSingle();
      if (sw) { peranTarget = "siswa"; namaTarget = sw.nama ?? null; }
    }
    if (peranTarget === "developer") {
      return json({ error: "Akun developer tidak bisa dikelola lewat fitur ini." }, 403);
    }

    // Pencatatan: log_developer (wajib) + Log Aktivitas (usaha terbaik, terbaca admin di Log Aktivitas).
    async function catat(aksi: string, rincian: unknown, alasan?: string): Promise<boolean> {
      const { error } = await adminClient.from("log_developer").insert({
        developer_id: caller.id, developer_nama: callerProfile!.nama ?? null, aksi,
        target_id: userId, target_nama: namaTarget, target_peran: peranTarget,
        alasan: alasan ?? null, rincian: rincian ?? null,
      });
      try {
        const ringkasan = `Developer: ${aksi} — ${namaTarget ?? userId}`;
        const r = await callerClient.rpc("catat_aktivitas", {
          p_aplikasi: "Developer", p_aksi: "lainnya", p_modul: "Akun", p_ringkasan: ringkasan, p_detail: null,
        });
        if (r.error) await callerClient.rpc("catat_aktivitas", { p_aksi: "lainnya", p_modul: "Akun", p_ringkasan: ringkasan, p_detail: null });
      } catch (_) { /* tambahan saja */ }
      return !error;
    }
    async function cabutSesi() {
      const { error } = await adminClient.rpc("dev_cabut_sesi", { p_user: userId });
      return !error;
    }

    // ---------------- RESET SANDI ----------------
    if (action === "reset_sandi") {
      const pw = String(body.password || "");
      if (pw.length < 8) return json({ error: "Kata sandi baru minimal 8 karakter." }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password: pw });
      if (error) return json({ error: "Gagal mengubah kata sandi: " + error.message }, 400);
      const logOk = await catat("reset_sandi", null);
      return json({ ok: true, log_tercatat: logOk }, 200);
    }

    // ---------------- UBAH PERAN ----------------
    if (action === "ubah_peran") {
      const peranBaru = String(body.peran || "").trim();
      if (!PERAN_BARU.includes(peranBaru)) return json({ error: "Peran harus salah satu dari: " + PERAN_BARU.join(", ") + "." }, 400);
      if (!tp) return json({ error: "Akun ini tidak punya profil staf (mis. akun siswa), jadi peran tidak bisa diubah." }, 400);
      if (peranBaru === peranTarget) return json({ error: "Peran baru sama dengan peran sekarang." }, 400);
      const { error } = await adminClient.from("profiles").update({ role: peranBaru }).eq("id", userId);
      if (error) return json({ error: "Gagal mengubah peran: " + error.message }, 400);
      const logOk = await catat("ubah_peran", { dari: peranTarget, ke: peranBaru });
      return json({ ok: true, log_tercatat: logOk }, 200);
    }

    // ---------------- NONAKTIFKAN / AKTIFKAN ----------------
    if (action === "nonaktifkan") {
      const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: BAN_LAMA });
      if (error) return json({ error: "Gagal menonaktifkan akun: " + error.message }, 400);
      const sesiOk = await cabutSesi();
      const logOk = await catat("nonaktifkan", { sesi_dicabut: sesiOk });
      return json({ ok: true, log_tercatat: logOk, sesi_dicabut: sesiOk }, 200);
    }
    if (action === "aktifkan") {
      const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (error) return json({ error: "Gagal mengaktifkan akun: " + error.message }, 400);
      const logOk = await catat("aktifkan", null);
      return json({ ok: true, log_tercatat: logOk }, 200);
    }

    // ---------------- PAKSA KELUAR ----------------
    if (action === "paksa_keluar") {
      const sesiOk = await cabutSesi();
      if (!sesiOk) return json({ error: "Gagal mencabut sesi. Pastikan migrasi_akun.sql sudah dijalankan." }, 500);
      const logOk = await catat("paksa_keluar", null);
      return json({ ok: true, log_tercatat: logOk }, 200);
    }

    // ---------------- LIHAT SEBAGAI ----------------
    if (action === "lihat_sebagai") {
      if (!peranTarget || !PERAN_BOLEH_DILIHAT.includes(peranTarget)) {
        return json({ error: "Peran '" + (peranTarget ?? "tanpa profil") + "' tidak boleh dilihat lewat fitur ini." }, 403);
      }
      if (targetUser.banned_until && new Date(targetUser.banned_until) > new Date()) {
        return json({ error: "Akun ini sedang dinonaktifkan." }, 400);
      }
      if (!targetUser.email) return json({ error: "Akun ini tidak punya email login." }, 400);
      const alasan = String(body.alasan || "").trim();
      if (alasan.length < 5) return json({ error: "Alasan wajib diisi (minimal 5 karakter)." }, 400);

      const sampai = new Date(Date.now() + DURASI_LIHAT_MENIT * 60_000).toISOString();
      // Catat DULU; bila gagal, batalkan (tidak ada akses tanpa jejak).
      const logOk = await catat("lihat_sebagai", { sampai, login_terakhir_sebelumnya: targetUser.last_sign_in_at ?? null }, alasan);
      if (!logOk) return json({ error: "Gagal mencatat log. Pastikan migrasi_akun.sql sudah dijalankan. Aksi dibatalkan." }, 500);

      const { data: link, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "magiclink", email: targetUser.email,
      });
      const tokenHash = link?.properties?.hashed_token;
      if (linkErr || !tokenHash) return json({ error: "Gagal membuat tiket masuk: " + (linkErr?.message ?? "token kosong") }, 500);

      return json({ ok: true, token_hash: tokenHash, sampai, nama: namaTarget, peran: peranTarget }, 200);
    }

    return json({ error: "Aksi tidak dikenal." }, 400);
  } catch (e) {
    return json({ error: "Kesalahan server: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
