-- Project e-Rapor/PDP (iejpwxmcqwecejsrezry): aplikasi presensi hanya MEMBACA di sini
-- (login + tabel profiles). TIDAK ada tabel presensi di project ini lagi.
--
-- SATU-SATUNYA perubahan (opsional): izinkan akun ber-role 'admin' MEMBACA semua baris profiles
-- (untuk menu Rekap/Jadwal/Pegawai). Jika aturan PDP yang ada sudah mengizinkan admin membaca
-- semua profil, file ini TIDAK perlu dijalankan. Hanya SELECT, tidak ada insert/update/delete.
-- Aman dijalankan ulang.

create or replace function public.presensi_is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

drop policy if exists p_profiles_admin_baca on public.profiles;
create policy p_profiles_admin_baca on public.profiles for select to authenticated
  using (public.presensi_is_admin());

-- Jika sebelumnya sudah menjalankan versi lama file ini, tabel presensi_lokasi / presensi_jadwal /
-- presensi_log di project e-Rapor sudah tidak dipakai. Salin dulu datanya bila perlu, lalu hapus manual:
--   drop table if exists public.presensi_log, public.presensi_jadwal, public.presensi_lokasi cascade;
--   drop function if exists public.presensi_cek_radius();
