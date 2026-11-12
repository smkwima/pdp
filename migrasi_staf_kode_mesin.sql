-- =====================================================================
-- ROLE "STAF" + KODE MESIN (fingerprint)
-- Jalankan di Supabase -> SQL Editor. Aman dijalankan ulang.
--
-- 1. Role baru 'staf' di profiles.role (tidak punya akses admin/guru,
--    hanya bisa masuk portal).
-- 2. Kolom profiles.kode_mesin = nomor ID di mesin fingerprint
--    (sama dengan "No.ID" yang dipakai aplikasi Rekap Absen). Unik.
-- 3. Fungsi daftar_kode_mesin() = daftar kode mesin + nama + role guru/staf,
--    hanya untuk admin/kepsek. Dipakai nanti untuk sinkron ke Rekap Absen
--    tanpa membuka email/NIP.
-- =====================================================================

-- 1. Izinkan role 'staf' (menangani kolom bertipe ENUM maupun CHECK)
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
    execute format('alter type public.%I add value if not exists %L', v_enum, 'staf');
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
      check (role in ('admin', 'guru', 'kepsek', 'staf')) not valid;
  end if;
end $$;

-- 2. Kolom kode mesin (angka tanpa nol di depan, mis. "7"), unik
alter table public.profiles add column if not exists kode_mesin text;

create unique index if not exists profiles_kode_mesin_uniq
  on public.profiles (kode_mesin)
  where kode_mesin is not null and kode_mesin <> '';

-- 3. Daftar kode mesin untuk sinkron (hanya admin/kepsek)
create or replace function public.daftar_kode_mesin()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'kepsek')
  ) then
    raise exception 'Hanya admin atau kepala sekolah yang boleh melihat kode mesin.';
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'kode_mesin', pr.kode_mesin,
             'nama', pr.nama,
             'role', pr.role) order by pr.nama)
    from public.profiles pr
    where pr.kode_mesin is not null and pr.kode_mesin <> ''
      and pr.role in ('guru', 'staf')
  ), '[]'::json);
end;
$$;

revoke all on function public.daftar_kode_mesin() from public;
grant execute on function public.daftar_kode_mesin() to authenticated;
