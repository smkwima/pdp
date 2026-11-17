# Mode Pemeliharaan, Pengumuman, dan Kesehatan Sistem — cara pasang

1. Pastikan `migrasi_developer.sql` sudah pernah dijalankan.
2. Supabase Dashboard → SQL Editor → jalankan **migrasi_sistem.sql** (aman diulang).
3. Upload ke hosting: `akses-guard.js` (versi baru), `developer.html`, `siswa.html`, dan semua halaman
   yang tautan skripnya berubah dari `akses-guard.js?v=1` menjadi `?v=2` (supaya cache browser diperbarui).
4. Login sebagai developer → menu **Pemeliharaan & Pengumuman** dan **Kesehatan Sistem**.

## Perilaku
- **Mode pemeliharaan aktif:** portal, semua aplikasi, dan halaman siswa menampilkan layar pemeliharaan untuk
  semua pengguna kecuali developer. Halaman login (`index.html`) tetap terbuka. Layar memeriksa ulang tiap
  60 detik dan memuat ulang otomatis saat dimatikan. Developer melihat banner penanda di tiap halaman.
- **Perkiraan selesai** hanya informasi; mode tidak mati sendiri.
- **Pengumuman:** banner di atas halaman, bisa ditutup per sesi, hilang otomatis setelah waktu berakhir.
- **Kesehatan sistem:** latensi API, ukuran database & storage (dibanding batas paket Free), jumlah akun
  dan login, status 4 Edge Function, serta tabel terbesar. Ubah `BATAS_DB_MB` / `BATAS_STORAGE_MB` di
  `developer.html` bila paket Supabase berbeda.

## Catatan
- Penguncian ini di sisi klien (sama seperti Kunci Aplikasi). Untuk benar-benar memblokir tulis data lewat API,
  pakai `public.sistem_dalam_pemeliharaan()` pada policy RLS tabel penting, misalnya:
  `using ( ...kondisi lama... and not public.sistem_dalam_pemeliharaan() )`.
- Status Edge Function hanya menunjukkan function ter-deploy dan merespons. Waktu eksekusi terakhir dan log
  galat tidak bisa dibaca dari browser; lihat di Dashboard → Edge Functions → Logs.
- Jumlah baris tabel adalah perkiraan statistik Postgres.
