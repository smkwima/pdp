-- =====================================================================
-- JALANKAN DI SUPABASE PROJECT REKAP ABSEN (bukan project pdp).
-- Tabel pengajuan ijin guru/staf. Data ditulis HANYA oleh Edge Function
-- 'ijin-absen' milik pdp (memakai service_role). Halaman Rekap Absen
-- (kunci publik/anon) hanya boleh MEMBACA, dan kolom 'deskripsi'
-- sengaja tidak bisa dibaca anon (alasan sakit/ijin bersifat pribadi).
-- Aman dijalankan ulang.
-- =====================================================================
create table if not exists public.absen_ijin (
  id              uuid primary key default gen_random_uuid(),
  pdp_user_id     uuid not null,
  kode_mesin      text not null,
  nama            text not null,
  jenis           text not null check (jenis in ('sakit', 'ijin', 'dinas_luar')),
  tanggal_mulai   date not null,
  tanggal_selesai date not null,
  deskripsi       text,
  created_at      timestamptz not null default now(),
  check (tanggal_selesai >= tanggal_mulai)
);

create index if not exists absen_ijin_user_idx    on public.absen_ijin (pdp_user_id, tanggal_mulai desc);
create index if not exists absen_ijin_tanggal_idx on public.absen_ijin (tanggal_mulai, tanggal_selesai);

alter table public.absen_ijin enable row level security;

drop policy if exists absen_ijin_baca on public.absen_ijin;
create policy absen_ijin_baca on public.absen_ijin
  for select to anon, authenticated using (true);

-- Tidak ada policy insert/update/delete => anon & authenticated tidak bisa menulis.
-- service_role (Edge Function pdp) melewati RLS.
revoke all on public.absen_ijin from anon, authenticated;
grant select (id, kode_mesin, nama, jenis, tanggal_mulai, tanggal_selesai, created_at)
  on public.absen_ijin to anon, authenticated;
