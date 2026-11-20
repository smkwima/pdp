-- =====================================================================
-- ROLE "DEVELOPER" + KUNCI AKSES APLIKASI
-- Jalankan di Supabase -> SQL Editor. Aman dijalankan ulang.
--
-- 1. Role baru 'developer' di profiles.role (ENUM maupun CHECK).
-- 2. Fungsi is_developer().
-- 3. Tabel akses_aplikasi: satu baris per aplikasi (aktif / dikunci + keterangan).
--    - Semua pengguna yang login boleh MEMBACA (supaya portal bisa menampilkan gembok).
--    - Hanya developer yang boleh MENGUBAH.
--
-- Cara membuat akun developer: lihat CARA_DEPLOY_DEVELOPER.md
-- =====================================================================

-- 1. Izinkan role 'developer'
do $$
declare
  v_enum text;
  c record;
begin
  select t.typname into v_enum
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.profiles'::regclass
    and a.attname = 'role' and t.typtype = 'e';

  if v_enum is not null then
    execute format('alter type public.%I add value if not exists %L', v_enum, 'developer');
  else
    for c in
      select conname from pg_constraint
      where conrelid = 'public.profiles'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%role%'
        and pg_get_constraintdef(oid) ilike '%guru%'
    loop
      execute format('alter table public.profiles drop constraint %I', c.conname);
    end loop;
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('admin', 'guru', 'kepsek', 'staf', 'pengawas', 'developer')) not valid;
  end if;
end $$;

-- 2. Pembantu peran
create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'developer'
  );
$$;
grant execute on function public.is_developer() to authenticated;

-- 3. Tabel kunci akses aplikasi
create table if not exists public.akses_aplikasi (
  kode        text primary key,
  nama        text not null,
  aktif       boolean not null default true,
  keterangan  text,
  diubah_pada timestamptz not null default now()
);

alter table public.akses_aplikasi enable row level security;

drop policy if exists akses_aplikasi_baca on public.akses_aplikasi;
create policy akses_aplikasi_baca on public.akses_aplikasi
  for select to authenticated using (true);

drop policy if exists akses_aplikasi_tulis on public.akses_aplikasi;
create policy akses_aplikasi_tulis on public.akses_aplikasi
  for all to authenticated
  using (public.is_developer()) with check (public.is_developer());

-- Isi awal (semua aktif). Kode harus sama dengan akses-guard.js.
insert into public.akses_aplikasi (kode, nama) values
  ('bi',       'Buku Induk'),
  ('rapor',    'E-Rapor'),
  ('gp',       'Guru & Penugasan'),
  ('pkl',      'Nilai PKL'),
  ('rpp',      'RPP Maker'),
  ('sup',      'Supervisi'),
  ('kin',      'Kinerja'),
  ('rekan',    'Penilaian Rekan'),
  ('pel',      'Catatan Pelanggaran'),
  ('pgd',      'Pengaduan Siswa'),
  ('cat',      'Catatan Pengawas'),
  ('ijin',     'Ijin & Dinas Luar'),
  ('presensi', 'Presensi'),
  ('disiplin', 'Rekap Kedisiplinan'),
  ('set',      'Pengaturan Sekolah'),
  ('log',      'Log Aktivitas')
on conflict (kode) do nothing;

-- Catatan: role developer tidak diberi hak baca/tulis ke tabel data sekolah.
