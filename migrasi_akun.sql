-- =====================================================================
-- MANAJEMEN AKUN (DEVELOPER) + "LIHAT SEBAGAI"
-- Jalankan di Supabase -> SQL Editor. Aman dijalankan ulang.
-- Syarat: migrasi_developer.sql sudah dijalankan (butuh is_developer()).
--
-- 1. log_developer: catatan semua tindakan developer pada akun orang lain
--    (reset sandi, ubah peran, nonaktifkan, paksa keluar, lihat sebagai).
--    Admin dan developer boleh MEMBACA; tidak ada yang bisa menulis dari
--    browser (hanya Edge Function dev-akun dan fungsi dev_catat_log).
-- 2. dev_daftar_akun(): daftar akun + login terakhir + status (hanya developer).
-- 3. dev_cabut_sesi(): mencabut semua sesi login satu akun (hanya service_role,
--    dipanggil Edge Function dev-akun).
-- 4. dev_catat_log(): pencatat akhir sesi "Lihat sebagai" dari browser.
-- =====================================================================

-- 1. Log tindakan developer
create table if not exists public.log_developer (
  id             bigint generated always as identity primary key,
  waktu          timestamptz not null default now(),
  developer_id   uuid,
  developer_nama text,
  aksi           text not null,
  target_id      uuid,
  target_nama    text,
  target_peran   text,
  alasan         text,
  rincian        jsonb
);
create index if not exists log_developer_waktu_idx on public.log_developer (waktu desc);

create or replace function public.dev_boleh_lihat_log()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('admin', 'developer')
  );
$$;
grant execute on function public.dev_boleh_lihat_log() to authenticated;

alter table public.log_developer enable row level security;
drop policy if exists log_developer_baca on public.log_developer;
create policy log_developer_baca on public.log_developer
  for select to authenticated using (public.dev_boleh_lihat_log());
-- Sengaja tanpa policy insert/update/delete: browser tidak bisa menulis atau menghapus log ini.

-- 2. Daftar akun (staf + siswa) untuk panel Manajemen Akun
create or replace function public.dev_daftar_akun(
  p_cari   text default null,
  p_peran  text default null,
  p_batas  int  default 25,
  p_offset int  default 0
)
returns table (
  id              uuid,
  nama            text,
  identitas       text,
  peran           text,
  login_terakhir  timestamptz,
  dibuat_pada     timestamptz,
  nonaktif        boolean,
  jumlah_total    bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_developer() then
    raise exception 'Hanya developer yang boleh memanggil dev_daftar_akun' using errcode = '42501';
  end if;
  p_batas  := least(greatest(coalesce(p_batas, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select x.id, x.nama, x.identitas, x.peran, x.login_terakhir, x.dibuat_pada, x.nonaktif,
         count(*) over ()
  from (
    select u.id as id,
           coalesce(p.nama, s.nama, '(tanpa nama)')::text as nama,
           (case when p.id is null and s.id is not null then coalesce(s.nis::text, u.email) else u.email end)::text as identitas,
           coalesce(p.role::text, case when s.id is not null then 'siswa' end, 'tanpa-profil')::text as peran,
           u.last_sign_in_at as login_terakhir,
           u.created_at      as dibuat_pada,
           (u.banned_until is not null and u.banned_until > now()) as nonaktif
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.siswa    s on s.auth_user_id = u.id
  ) x
  where (coalesce(p_peran, '') = '' or x.peran = p_peran)
    and (coalesce(p_cari, '')  = '' or x.nama ilike '%' || p_cari || '%' or coalesce(x.identitas, '') ilike '%' || p_cari || '%')
  order by x.nama
  limit p_batas offset p_offset;
end;
$$;
revoke all on function public.dev_daftar_akun(text, text, int, int) from public, anon;
grant execute on function public.dev_daftar_akun(text, text, int, int) to authenticated;

-- 3. Cabut semua sesi satu akun (hanya service_role = Edge Function)
create or replace function public.dev_cabut_sesi(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  begin
    update auth.refresh_tokens set revoked = true where user_id::text = p_user::text;
  exception when others then null;
  end;
  delete from auth.sessions where user_id = p_user;
end;
$$;
revoke all on function public.dev_cabut_sesi(uuid) from public, anon, authenticated;
grant execute on function public.dev_cabut_sesi(uuid) to service_role;

-- 4. Pencatat akhir sesi "Lihat sebagai" (dipanggil browser setelah sesi developer dipulihkan).
--    Hanya aksi yang diizinkan di bawah; identitas developer diambil dari sesi, bukan dari kiriman browser.
create or replace function public.dev_catat_log(
  p_aksi        text,
  p_target      uuid,
  p_target_nama text,
  p_alasan      text  default null,
  p_rincian     jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_nama text;
begin
  if not public.is_developer() then
    raise exception 'Hanya developer' using errcode = '42501';
  end if;
  if p_aksi not in ('lihat_sebagai_selesai') then
    raise exception 'Aksi log tidak diizinkan: %', p_aksi;
  end if;
  select nama into v_nama from public.profiles where id = auth.uid();
  insert into public.log_developer (developer_id, developer_nama, aksi, target_id, target_nama, alasan, rincian)
  values (auth.uid(), v_nama, p_aksi, p_target, p_target_nama, p_alasan, p_rincian);
end;
$$;
revoke all on function public.dev_catat_log(text, uuid, text, text, jsonb) from public, anon;
grant execute on function public.dev_catat_log(text, uuid, text, text, jsonb) to authenticated;
