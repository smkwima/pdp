-- =====================================================================
-- KINERJA SAYA — guru mengajukan bukti dukung kinerja, Kepala Sekolah
-- mengecek dan memberi JEMPOL. Aman dijalankan berulang.
--
-- Alur status:  draft -> diajukan -> disetujui (jempol)
--                               \-> revisi (dikembalikan + catatan) -> diajukan lagi
--
-- Kategori (poin 1-4, guru boleh menambah butir sendiri):
--   perangkat | pelaksanaan | penilaian | tugas_tambahan
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Pembantu peran
-- ---------------------------------------------------------------------
-- Yang boleh MELIHAT semua butir & memberi jempol: kepsek dan admin.
-- (Kalau jempol ingin khusus kepsek saja, hapus 'admin' dari daftar di bawah.)
create or replace function public.kinerja_boleh_cek()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('kepsek', 'admin')
  );
$$;

-- ---------------------------------------------------------------------
-- 2) Tabel butir kinerja
-- ---------------------------------------------------------------------
create table if not exists public.kinerja_butir (
  id             uuid primary key default gen_random_uuid(),
  guru_id        uuid not null references public.profiles(id) on delete cascade,
  periode        text not null,                     -- mis. "2026/2027 · Gasal"
  kategori       text not null check (kategori in ('perangkat', 'pelaksanaan', 'penilaian', 'tugas_tambahan')),
  jenis_tugas    text check (jenis_tugas in ('wali_kelas', 'kokurikuler', 'ekskul', 'lainnya')),  -- hanya tugas_tambahan
  nama_tugas     text,                              -- mis. "Wali Kelas XI TKJ 1", "Pramuka", "Wakasek Kurikulum"
  judul          text not null,
  keterangan     text,
  tanggal        date,
  bukti          jsonb not null default '[]'::jsonb, -- [{t:'link',u:'https://..',n:'Nama'},{t:'file',p:'path',n:'nama.pdf',s:12345}]
  standar        boolean not null default false,     -- true = dimuat dari daftar standar, false = ditambah guru sendiri
  status         text not null default 'draft' check (status in ('draft', 'diajukan', 'disetujui', 'revisi')),
  diajukan_pada  timestamptz,
  dicek_oleh     uuid references public.profiles(id) on delete set null,
  dicek_pada     timestamptz,
  catatan_kepsek text,
  dibuat_pada    timestamptz not null default now(),
  diubah_pada    timestamptz not null default now()
);

create index if not exists kinerja_butir_guru_idx   on public.kinerja_butir (guru_id, periode);
create index if not exists kinerja_butir_status_idx on public.kinerja_butir (status, periode);

-- ---------------------------------------------------------------------
-- 3) Trigger: jaga kolom pemeriksaan agar tidak bisa dipalsukan guru
-- ---------------------------------------------------------------------
create or replace function public.kinerja_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'diajukan' then new.diajukan_pada := now(); end if;
  return new;
end;
$$;

create or replace function public.kinerja_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.diubah_pada := now();

  -- Kepala sekolah / admin (lewat fungsi kinerja_cek): bebas.
  if public.kinerja_boleh_cek() then
    return new;
  end if;

  -- Guru: kolom pemeriksaan dikunci.
  new.guru_id        := old.guru_id;
  new.dicek_oleh     := old.dicek_oleh;
  new.dicek_pada     := old.dicek_pada;
  new.catatan_kepsek := old.catatan_kepsek;

  if old.status = 'disetujui' then
    raise exception 'Butir yang sudah mendapat jempol tidak dapat diubah.';
  end if;
  if old.status = 'diajukan' and new.status <> 'draft' then
    raise exception 'Butir sedang diajukan. Batalkan pengajuan dulu bila ingin mengubahnya.';
  end if;
  if new.status = 'disetujui' or (new.status = 'revisi' and old.status <> 'revisi') then
    raise exception 'Status ini hanya dapat ditetapkan oleh Kepala Sekolah.';
  end if;

  if new.status = 'diajukan' then new.diajukan_pada := now(); end if;
  if new.status in ('draft', 'diajukan') then
    new.dicek_oleh := null;
    new.dicek_pada := null;
  end if;
  return new;
end;
$$;

drop trigger if exists kinerja_before_insert on public.kinerja_butir;
create trigger kinerja_before_insert
  before insert on public.kinerja_butir
  for each row execute function public.kinerja_before_insert();

drop trigger if exists kinerja_before_update on public.kinerja_butir;
create trigger kinerja_before_update
  before update on public.kinerja_butir
  for each row execute function public.kinerja_before_update();

-- ---------------------------------------------------------------------
-- 4) Row Level Security
-- ---------------------------------------------------------------------
alter table public.kinerja_butir enable row level security;

drop policy if exists kinerja_baca_sendiri on public.kinerja_butir;
create policy kinerja_baca_sendiri on public.kinerja_butir
  for select to authenticated
  using (guru_id = auth.uid());

drop policy if exists kinerja_baca_pemeriksa on public.kinerja_butir;
create policy kinerja_baca_pemeriksa on public.kinerja_butir
  for select to authenticated
  using (public.kinerja_boleh_cek());

drop policy if exists kinerja_tambah on public.kinerja_butir;
create policy kinerja_tambah on public.kinerja_butir
  for insert to authenticated
  with check (guru_id = auth.uid() and status in ('draft', 'diajukan') and dicek_oleh is null);

drop policy if exists kinerja_ubah on public.kinerja_butir;
create policy kinerja_ubah on public.kinerja_butir
  for update to authenticated
  using (guru_id = auth.uid() and status in ('draft', 'diajukan', 'revisi'))
  with check (guru_id = auth.uid() and status in ('draft', 'diajukan', 'revisi'));

drop policy if exists kinerja_hapus on public.kinerja_butir;
create policy kinerja_hapus on public.kinerja_butir
  for delete to authenticated
  using (guru_id = auth.uid() and status in ('draft', 'revisi'));

grant select, insert, update, delete on public.kinerja_butir to authenticated;

-- ---------------------------------------------------------------------
-- 5) Fungsi pemeriksaan (jempol / minta revisi / cabut jempol)
--    p_hasil: 'disetujui' (jempol) | 'revisi' (kembalikan + catatan) | 'diajukan' (cabut jempol)
-- ---------------------------------------------------------------------
create or replace function public.kinerja_cek(p_id uuid, p_hasil text, p_catatan text default null)
returns public.kinerja_butir
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.kinerja_butir;
begin
  if not public.kinerja_boleh_cek() then
    raise exception 'Hanya Kepala Sekolah yang dapat memeriksa bukti kinerja.';
  end if;
  if p_hasil not in ('disetujui', 'revisi', 'diajukan') then
    raise exception 'Hasil pemeriksaan tidak dikenal.';
  end if;
  if p_hasil = 'revisi' and coalesce(btrim(p_catatan), '') = '' then
    raise exception 'Tulis catatan agar guru tahu apa yang perlu diperbaiki.';
  end if;

  update public.kinerja_butir k set
    status         = p_hasil,
    dicek_oleh     = case when p_hasil = 'diajukan' then null else auth.uid() end,
    dicek_pada     = case when p_hasil = 'diajukan' then null else now() end,
    catatan_kepsek = case when p_hasil = 'diajukan' then k.catatan_kepsek else nullif(btrim(coalesce(p_catatan, '')), '') end
  where k.id = p_id and k.status <> 'draft'
  returning * into r;

  if not found then
    raise exception 'Butir tidak ditemukan atau belum diajukan guru.';
  end if;
  return r;
end;
$$;

revoke all on function public.kinerja_cek(uuid, text, text) from public;
grant execute on function public.kinerja_cek(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Penyimpanan file bukti (bucket privat "bukti-kinerja", maks 10 MB per file)
--    Folder pertama = id guru, jadi guru hanya bisa mengakses miliknya;
--    kepsek/admin bisa membuka semua.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('bukti-kinerja', 'bukti-kinerja', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists kinerja_file_tambah on storage.objects;
create policy kinerja_file_tambah on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bukti-kinerja' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists kinerja_file_baca on storage.objects;
create policy kinerja_file_baca on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bukti-kinerja'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.kinerja_boleh_cek())
  );

drop policy if exists kinerja_file_hapus on storage.objects;
create policy kinerja_file_hapus on storage.objects
  for delete to authenticated
  using (bucket_id = 'bukti-kinerja' and (storage.foldername(name))[1] = auth.uid()::text);
