-- =====================================================================
-- JALANKAN DI SUPABASE PROJECT REKAP ABSEN (bukan project pdp).
-- Menambah alur PERSETUJUAN ADMIN pada tabel absen_ijin.
--   status : 'menunggu' (baru diajukan) | 'disetujui' | 'ditolak'
-- Pengajuan lama (sebelum fitur ini) otomatis dianggap 'disetujui'.
-- Pengajuan baru otomatis 'menunggu' sampai admin menyetujui.
-- Halaman Rekap Absen (kunci anon) HANYA bisa membaca yang 'disetujui',
-- jadi ijin yang belum disetujui tidak mengubah rekap.
-- Aman dijalankan ulang. Jalankan SETELAH rekap_ijin.sql.
-- =====================================================================
alter table public.absen_ijin
  add column if not exists status        text not null default 'disetujui',  -- baris lama = disetujui
  add column if not exists diproses_oleh uuid,
  add column if not exists diproses_nama text,
  add column if not exists diproses_at   timestamptz,
  add column if not exists catatan_admin text;

-- Baris baru mulai sekarang menunggu persetujuan
alter table public.absen_ijin alter column status set default 'menunggu';

alter table public.absen_ijin drop constraint if exists absen_ijin_status_check;
alter table public.absen_ijin
  add constraint absen_ijin_status_check check (status in ('menunggu', 'disetujui', 'ditolak'));

create index if not exists absen_ijin_status_idx on public.absen_ijin (status, tanggal_mulai desc);

-- Rekap Absen (anon/authenticated) hanya boleh melihat yang sudah disetujui
drop policy if exists absen_ijin_baca on public.absen_ijin;
create policy absen_ijin_baca on public.absen_ijin
  for select to anon, authenticated using (status = 'disetujui');

revoke all on public.absen_ijin from anon, authenticated;
grant select (id, kode_mesin, nama, jenis, tanggal_mulai, tanggal_selesai, created_at, status)
  on public.absen_ijin to anon, authenticated;
-- deskripsi, diproses_*, catatan_admin tetap TIDAK bisa dibaca anon.
