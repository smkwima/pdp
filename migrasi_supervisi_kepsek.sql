-- Izin Kepala Sekolah mengisi & menyimpan instrumen supervisi SEMUA guru (tabel supervisi_jadwal).
-- Tanpa ini, update dari akun kepsek ditolak RLS (0 baris berubah) dan hasil supervisi tidak tersimpan.
-- Jalankan sekali di Supabase SQL Editor. Aman diulang.

create or replace function public.sv_is_kepsek()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'kepsek');
$$;
grant execute on function public.sv_is_kepsek() to authenticated;

drop policy if exists kepsek_lihat_supervisi_jadwal on public.supervisi_jadwal;
create policy kepsek_lihat_supervisi_jadwal on public.supervisi_jadwal
  for select to authenticated using (public.sv_is_kepsek());

drop policy if exists kepsek_isi_supervisi on public.supervisi_jadwal;
create policy kepsek_isi_supervisi on public.supervisi_jadwal
  for update to authenticated
  using (public.sv_is_kepsek())
  with check (public.sv_is_kepsek());

-- Cek hasil:
-- select policyname, cmd from pg_policies where tablename = 'supervisi_jadwal' order by 1;
