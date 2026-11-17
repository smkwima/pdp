-- =====================================================================
-- MODE PEMELIHARAAN GLOBAL + PENGUMUMAN + MONITOR KESEHATAN SISTEM
-- Jalankan di Supabase -> SQL Editor. Aman dijalankan ulang.
-- Syarat: migrasi_developer.sql sudah dijalankan (butuh is_developer()).
--
-- 1. Tabel pengaturan_sistem (satu baris, id = 1):
--    - Mode pemeliharaan: mengunci SEMUA halaman untuk semua pengguna
--      kecuali developer.
--    - Pengumuman: banner di portal / halaman aplikasi.
--    - Semua pengguna login boleh MEMBACA; hanya developer yang boleh MENGUBAH.
-- 2. Fungsi sistem_dalam_pemeliharaan() untuk dipakai di RLS (opsional).
-- 3. Fungsi dev_kesehatan(): statistik database, storage, dan pengguna
--    untuk panel Kesehatan Sistem. Hanya bisa dipanggil developer.
-- =====================================================================

-- 1. Pengaturan sistem
create table if not exists public.pengaturan_sistem (
  id                   int primary key default 1 check (id = 1),
  pemeliharaan_aktif   boolean not null default false,
  pemeliharaan_pesan   text,
  pemeliharaan_selesai timestamptz,
  pengumuman_aktif     boolean not null default false,
  pengumuman_jenis     text not null default 'info'
                       check (pengumuman_jenis in ('info', 'peringatan', 'penting')),
  pengumuman_teks      text,
  pengumuman_berakhir  timestamptz,
  diubah_pada          timestamptz not null default now(),
  diubah_oleh          uuid
);

alter table public.pengaturan_sistem enable row level security;

drop policy if exists pengaturan_sistem_baca on public.pengaturan_sistem;
create policy pengaturan_sistem_baca on public.pengaturan_sistem
  for select to authenticated using (true);

drop policy if exists pengaturan_sistem_tulis on public.pengaturan_sistem;
create policy pengaturan_sistem_tulis on public.pengaturan_sistem
  for all to authenticated
  using (public.is_developer()) with check (public.is_developer());

insert into public.pengaturan_sistem (id) values (1) on conflict (id) do nothing;

-- 2. Pembantu RLS (opsional): true bila sistem sedang pemeliharaan DAN pemanggil bukan developer.
-- Contoh pemakaian pada policy tulis tabel nilai:
--   using ( ...kondisi lama... and not public.sistem_dalam_pemeliharaan() )
create or replace function public.sistem_dalam_pemeliharaan()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.pemeliharaan_aktif from public.pengaturan_sistem s where s.id = 1), false)
         and not public.is_developer();
$$;
grant execute on function public.sistem_dalam_pemeliharaan() to authenticated;

-- 3. Statistik untuk panel Kesehatan Sistem
create or replace function public.dev_kesehatan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_tabel   jsonb := '[]'::jsonb;
  v_storage jsonb := '[]'::jsonb;
  v_peran   jsonb := '{}'::jsonb;
  v_auth    jsonb := '{}'::jsonb;
  v_koneksi int   := 0;
begin
  if not public.is_developer() then
    raise exception 'Hanya developer yang boleh memanggil dev_kesehatan' using errcode = '42501';
  end if;

  -- Tabel terbesar (jumlah baris = perkiraan dari statistik Postgres)
  select coalesce(jsonb_agg(jsonb_build_object(
           'tabel', s.relname, 'baris', s.n_live_tup, 'ukuran', s.ukuran
         ) order by s.ukuran desc), '[]'::jsonb)
    into v_tabel
  from (
    select relname, n_live_tup, pg_total_relation_size(relid) as ukuran
    from pg_stat_user_tables
    where schemaname = 'public'
    order by 3 desc
    limit 15
  ) s;

  -- Koneksi aktif ke database ini
  begin
    select count(*) into v_koneksi from pg_stat_activity where datname = current_database();
  exception when others then v_koneksi := 0;
  end;

  -- Storage per bucket
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'bucket', b.bucket_id, 'berkas', b.n, 'ukuran', b.u
           ) order by b.u desc), '[]'::jsonb)
      into v_storage
    from (
      select bucket_id, count(*) as n, coalesce(sum((metadata->>'size')::bigint), 0) as u
      from storage.objects
      group by bucket_id
    ) b;
  exception when others then v_storage := '[]'::jsonb;
  end;

  -- Jumlah akun per peran
  begin
    select coalesce(jsonb_object_agg(r.peran, r.n), '{}'::jsonb)
      into v_peran
    from (
      select coalesce(role::text, '(kosong)') as peran, count(*) as n
      from public.profiles group by 1
    ) r;
  exception when others then v_peran := '{}'::jsonb;
  end;

  -- Aktivitas login (semua akun, termasuk siswa)
  begin
    select jsonb_build_object(
             'total',        count(*),
             'aktif_24_jam', count(*) filter (where last_sign_in_at > now() - interval '24 hours'),
             'aktif_7_hari', count(*) filter (where last_sign_in_at > now() - interval '7 days')
           )
      into v_auth
    from auth.users;
  exception when others then v_auth := '{}'::jsonb;
  end;

  return jsonb_build_object(
    'waktu_server', now(),
    'versi',        split_part(version(), ' on ', 1),
    'db_bytes',     pg_database_size(current_database()),
    'koneksi',      v_koneksi,
    'tabel',        v_tabel,
    'storage',      v_storage,
    'peran',        v_peran,
    'login',        v_auth
  );
end;
$$;

revoke all on function public.dev_kesehatan() from public, anon;
grant execute on function public.dev_kesehatan() to authenticated;

-- Catatan: dev_kesehatan() hanya mengembalikan angka agregat; developer tetap
-- tidak mendapat akses baca ke isi tabel data sekolah.
