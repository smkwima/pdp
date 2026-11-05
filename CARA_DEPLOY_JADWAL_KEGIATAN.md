# Jadwal Kegiatan (Hitung Mundur) — cara pasang

1. Supabase Dashboard → SQL Editor → jalankan **migrasi_jadwal_kegiatan.sql** (aman diulang).
2. Upload file ke hosting: `jadwal-kegiatan.js` (BARU) dan halaman yang berubah:
   `pengaturan-admin.html`, `admin.html`, `guru.html`, `siswa.html`, `pkl.html`, `bukuinduk-admin.html`,
   `bukuinduk-guru.html`, `supervisi.html`, `supervisi-admin.html`, `pelanggaran.html`,
   `guru-penugasan.html`, `portal.html` (versi bersih: counter dihapus dari Menu Utama).
3. Admin: **Pengaturan Sekolah → Jadwal Kegiatan** → isi kegiatan, pilih modul, atur waktu (WIB).

## Cara kerja
- **Modul** menentukan dashboard mana yang menampilkan hitung mundur:
  E-Rapor (dashboard admin & Dashboard Saya guru), Nilai PKL, Buku Induk (admin & guru), Supervisi,
  Catatan Pelanggaran, Guru & Penugasan. Pilih **Umum** untuk tampil di semua modul.
- **Beranda siswa** menampilkan kegiatan dari semua modul. **Portal (Menu Utama)** tidak menampilkan hitung mundur.
- **Ditampilkan untuk**: centang Admin & Kepsek / Guru / Siswa. Kegiatan yang tidak dicentang untuk
  suatu peran tidak muncul di peran itu.
- **Mulai** = tujuan hitung mundur. **Selesai** opsional; kalau kosong, kegiatan dianggap berlangsung
  sampai akhir hari Mulai, lalu otomatis hilang dari dashboard.
- Kartu berubah warna: kuning (≤ 3 hari), merah (≤ 1 hari), hijau (sedang berlangsung).
- Tombol **Nonaktifkan** menyembunyikan tanpa menghapus. Maksimal 6 kartu tampil per dashboard.
- Semua waktu diinput & ditampilkan dalam **WIB**, siapa pun yang membuka.

## Catatan
- Hanya admin yang bisa menambah/ubah/hapus (dijaga RLS). Semua akun yang login bisa membaca.
- Kalau migrasi belum dijalankan, dashboard tetap normal (kotak tidak muncul) dan menu Jadwal Kegiatan
  menampilkan petunjuk untuk menjalankan migrasi.
