-- =====================================================================
-- PENGADUAN SISWA (bullying / pelanggaran lain), NAMA PELAPOR WAJIB
--
-- Aturan (dipaksa di DATABASE, bukan hanya disembunyikan di layar):
--   * Siswa mengirim lewat fungsi pengaduan_kirim(...). Nama pelapor
--     WAJIB tercatat (tidak ada opsi anonim; parameter p_anonim diabaikan).
--   * Hanya Admin dan Kepala Sekolah yang dapat membaca daftar pengaduan.
--     Guru, wali kelas, dan siswa lain TIDAK punya akses ke tabel ini
--     (tidak ada policy untuk mereka).
--   * Siswa hanya bisa membaca pengaduan miliknya sendiri lewat view
--     pengaduan_saya (status + tanggapan sekolah), tidak milik siswa lain.
--   * Hanya Admin yang dapat mengubah status / menulis tanggapan
--     (fungsi pengaduan_proses). Kepala Sekolah: hanya lihat.
--   * Siswa tidak punya hak tulis langsung ke tabel (tidak ada policy
--     insert/update/delete); semua lewat fungsi security definer.
--
-- Aman dijalankan berulang. Jalankan di Supabase -> SQL Editor.
-- =====================================================================

-- 1) Pembantu peran
create or replace function public.pengaduan_boleh_lihat_semua()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'kepsek')
  );
$$;
grant execute on function public.pengaduan_boleh_lihat_semua() to authenticated;

create or replace function public.pengaduan_boleh_proses()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;
grant execute on function public.pengaduan_boleh_proses() to authenticated;

-- 2) Tabel. Tipe kolom siswa_id mengikuti tipe siswa.id apa pun (uuid / bigint).
do $$
declare
  v_tipe text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_tipe
    from pg_attribute a
   where a.attrelid = 'public.siswa'::regclass and a.attname = 'id' and not a.attisdropped;
  if v_tipe is null then
    raise exception 'Tabel public.siswa atau kolom id tidak ditemukan.';
  end if;

  execute format($f$
    create table if not exists public.pengaduan (
      id             uuid primary key default gen_random_uuid(),
      nomor          bigint generated always as identity,
      siswa_id       %s not null references public.siswa(id) on delete cascade,
      pelapor_nama   text not null,            -- salinan nama saat melapor
      pelapor_nis    text,
      pelapor_kelas  text,
      is_anonim      boolean not null default false,
      kategori       text not null
                     check (kategori in ('bullying', 'kekerasan', 'pelecehan', 'tata_tertib',
                                         'narkoba_rokok', 'pencurian', 'lainnya')),
      terlapor       text,                     -- nama / ciri pihak yang dilaporkan (opsional)
      tanggal_kejadian date,
      tempat         text,
      uraian         text not null,
      status         text not null default 'baru'
                     check (status in ('baru', 'diproses', 'selesai', 'ditolak')),
      tanggapan      text,                     -- terlihat oleh pelapor
      catatan_internal text,                   -- hanya admin / kepsek
      ditangani_oleh uuid references public.profiles(id) on delete set null,
      dibuat_pada    timestamptz not null default now(),
      diperbarui_pada timestamptz not null default now()
    )$f$, v_tipe);
end $$;

create index if not exists pengaduan_siswa_idx  on public.pengaduan (siswa_id, dibuat_pada desc);
create index if not exists pengaduan_status_idx on public.pengaduan (status, dibuat_pada desc);

-- Jika sebelumnya sudah ada data dengan opsi anonim, jadikan tidak anonim.
update public.pengaduan set is_anonim = false where is_anonim;

-- 3) RLS
alter table public.pengaduan enable row level security;

-- Tabel hanya terbaca oleh Admin & Kepala Sekolah (termasuk nama pelapor & catatan internal).
-- Siswa TIDAK membaca tabel langsung; mereka memakai view pengaduan_saya di bawah.
drop policy if exists pengaduan_select on public.pengaduan;
create policy pengaduan_select on public.pengaduan
  for select to authenticated
  using (public.pengaduan_boleh_lihat_semua());
-- Sengaja TIDAK ada policy insert / update / delete.
revoke all on public.pengaduan from anon;

-- View untuk siswa: hanya pengaduan miliknya, tanpa catatan_internal / ditangani_oleh.
-- (Berjalan dengan hak pemilik view, tetapi dibatasi auth.uid() di dalamnya.)
create or replace view public.pengaduan_saya
with (security_invoker = false) as
  select p.id, p.nomor, p.is_anonim, p.kategori, p.terlapor, p.tanggal_kejadian, p.tempat,
         p.uraian, p.status, p.tanggapan, p.dibuat_pada, p.diperbarui_pada
    from public.pengaduan p
   where p.siswa_id in (select s.id from public.siswa s where s.auth_user_id = auth.uid());
revoke all on public.pengaduan_saya from anon, public;
grant select on public.pengaduan_saya to authenticated;

-- 4) Kirim pengaduan (hanya akun siswa)
create or replace function public.pengaduan_kirim(
  p_kategori         text,
  p_uraian           text,
  p_anonim           boolean default false,
  p_terlapor         text default null,
  p_tanggal_kejadian date default null,
  p_tempat           text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siswa  public.siswa%rowtype;
  v_kelas  text;
  v_uraian text := btrim(coalesce(p_uraian, ''));
  v_id     uuid;
begin
  select * into v_siswa from public.siswa where auth_user_id = auth.uid() limit 1;
  if not found then
    raise exception 'Hanya akun siswa yang dapat mengirim pengaduan.' using errcode = '42501';
  end if;

  if p_kategori is null or p_kategori not in
     ('bullying', 'kekerasan', 'pelecehan', 'tata_tertib', 'narkoba_rokok', 'pencurian', 'lainnya') then
    raise exception 'Kategori pengaduan tidak valid.' using errcode = '22023';
  end if;
  if length(v_uraian) < 15 then
    raise exception 'Uraian terlalu singkat. Ceritakan kejadiannya minimal 15 karakter.' using errcode = '22023';
  end if;
  if length(v_uraian) > 4000 then
    raise exception 'Uraian terlalu panjang (maksimal 4000 karakter).' using errcode = '22023';
  end if;
  if p_tanggal_kejadian is not null and p_tanggal_kejadian > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal kejadian tidak boleh di masa depan.' using errcode = '22023';
  end if;

  -- Batas kirim: maksimal 5 pengaduan per jam per siswa (cegah spam).
  if (select count(*) from public.pengaduan
       where siswa_id = v_siswa.id and dibuat_pada > now() - interval '1 hour') >= 5 then
    raise exception 'Terlalu banyak pengaduan dalam satu jam. Coba lagi nanti.' using errcode = '54000';
  end if;

  -- Kelas pada tahun ajaran aktif (salinan, supaya tetap benar walau siswa naik kelas).
  select k.nama into v_kelas
    from public.siswa_kelas sk
    join public.kelas k on k.id = sk.kelas_id
    join public.tahun_ajaran ta on ta.id = sk.tahun_ajaran_id and ta.is_aktif
   where sk.siswa_id = v_siswa.id
   limit 1;

  insert into public.pengaduan
    (siswa_id, pelapor_nama, pelapor_nis, pelapor_kelas, is_anonim, kategori,
     terlapor, tanggal_kejadian, tempat, uraian)
  values
    (v_siswa.id, coalesce(v_siswa.nama, '(tanpa nama)'), v_siswa.nis, v_kelas, false, p_kategori,
     nullif(left(btrim(coalesce(p_terlapor, '')), 200), ''), p_tanggal_kejadian,
     nullif(left(btrim(coalesce(p_tempat, '')), 200), ''), v_uraian)
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.pengaduan_kirim(text, text, boolean, text, date, text) from public, anon;
grant execute on function public.pengaduan_kirim(text, text, boolean, text, date, text) to authenticated;

-- 5) Daftar lengkap untuk admin / kepsek (termasuk catatan_internal & nama pelapor)
create or replace function public.pengaduan_daftar()
returns setof public.pengaduan
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.pengaduan_boleh_lihat_semua() then
    raise exception 'Hanya Admin dan Kepala Sekolah yang dapat melihat daftar pengaduan.' using errcode = '42501';
  end if;
  return query select * from public.pengaduan order by dibuat_pada desc;
end;
$$;
revoke all on function public.pengaduan_daftar() from public, anon;
grant execute on function public.pengaduan_daftar() to authenticated;

-- 6) Proses pengaduan (HANYA admin): ubah status, tulis tanggapan & catatan internal
create or replace function public.pengaduan_proses(
  p_id               uuid,
  p_status           text,
  p_tanggapan        text default null,
  p_catatan_internal text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pengaduan_boleh_proses() then
    raise exception 'Hanya Admin yang dapat memproses pengaduan.' using errcode = '42501';
  end if;
  if p_status not in ('baru', 'diproses', 'selesai', 'ditolak') then
    raise exception 'Status tidak valid.' using errcode = '22023';
  end if;

  update public.pengaduan
     set status           = p_status,
         tanggapan        = nullif(left(btrim(coalesce(p_tanggapan, '')), 2000), ''),
         catatan_internal = nullif(left(btrim(coalesce(p_catatan_internal, '')), 4000), ''),
         ditangani_oleh   = auth.uid(),
         diperbarui_pada  = now()
   where id = p_id;
  if not found then
    raise exception 'Pengaduan tidak ditemukan.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.pengaduan_proses(uuid, text, text, text) from public, anon;
grant execute on function public.pengaduan_proses(uuid, text, text, text) to authenticated;

-- 7) Hapus (HANYA admin), mis. pengaduan uji coba
create or replace function public.pengaduan_hapus(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pengaduan_boleh_proses() then
    raise exception 'Hanya Admin yang dapat menghapus pengaduan.' using errcode = '42501';
  end if;
  delete from public.pengaduan where id = p_id;
end;
$$;
revoke all on function public.pengaduan_hapus(uuid) from public, anon;
grant execute on function public.pengaduan_hapus(uuid) to authenticated;

-- 8) Jumlah pengaduan baru (untuk lencana di aplikasi admin / kepsek)
create or replace function public.pengaduan_jumlah_baru()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.pengaduan_boleh_lihat_semua()
              then (select count(*)::int from public.pengaduan where status = 'baru')
              else 0 end;
$$;
grant execute on function public.pengaduan_jumlah_baru() to authenticated;

-- =====================================================================
-- PEMERIKSAAN (jalankan manual setelah migrasi)
--   select * from public.pengaduan;                  -- sebagai admin: terlihat semua
--   select * from public.pengaduan_saya;             -- sebagai siswa: hanya miliknya
-- =====================================================================
