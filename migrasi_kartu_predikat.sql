-- =====================================================================
-- PENGATURAN KARTU PREDIKAT DI MENU UTAMA GURU & STAF
-- Jalankan di Supabase (project e-Rapor) -> SQL Editor. Aman dijalankan ulang.
--
-- Admin mengatur, lewat menu "Predikat Guru & Staf", apakah tiap info
-- berikut tampil di kartu Menu Utama guru/staf:
--   * Predikat Kedisiplinan (Finger)  -> dari rekap fingerprint
--   * Predikat Kedisiplinan (Online)  -> dari presensi online bulan berjalan
--   * Nilai Penilaian Rekan           -> hasil rata-rata penilaian rekan
-- Bawaan: semuanya tampil (perilaku lama tidak berubah sampai admin mematikan).
--
-- Semua pengguna yang login boleh MEMBACA (dipakai portal.html untuk
-- memutuskan kartu mana yang tampil). Hanya admin yang boleh MENGUBAH.
-- =====================================================================

create or replace function public.kp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin');
$$;
grant execute on function public.kp_is_admin() to authenticated;

create table if not exists public.kartu_predikat_pengaturan (
  id            integer primary key default 1 check (id = 1),
  tampil_finger boolean not null default true,
  tampil_online boolean not null default true,
  tampil_rekan  boolean not null default true,
  diubah_pada   timestamptz not null default now()
);

insert into public.kartu_predikat_pengaturan (id) values (1) on conflict (id) do nothing;

alter table public.kartu_predikat_pengaturan enable row level security;

drop policy if exists kp_baca on public.kartu_predikat_pengaturan;
create policy kp_baca on public.kartu_predikat_pengaturan
  for select to authenticated using (true);

drop policy if exists kp_admin_ubah on public.kartu_predikat_pengaturan;
create policy kp_admin_ubah on public.kartu_predikat_pengaturan
  for all to authenticated
  using (public.kp_is_admin())
  with check (public.kp_is_admin());

grant select on public.kartu_predikat_pengaturan to authenticated;
grant insert, update on public.kartu_predikat_pengaturan to authenticated;
