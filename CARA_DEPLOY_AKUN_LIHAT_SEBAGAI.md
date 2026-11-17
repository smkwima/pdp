# Manajemen Akun & "Lihat Sebagai" (Developer) — cara pasang

## 1. Database
Supabase → SQL Editor → jalankan **migrasi_akun.sql** (aman diulang). Syarat: `migrasi_developer.sql` sudah dijalankan.

## 2. Edge Function baru `dev-akun`
Sama seperti `admin-create-guru`, lewat browser:
1. Supabase Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name: `dev-akun` (harus persis).
3. Hapus isi editor, lalu copy-paste seluruh `supabase/functions/dev-akun/index.ts`.
4. **Deploy**, tunggu status **Active**. Secrets tidak perlu diisi.

## 3. Upload file
`supabase-client.js` (berubah besar), `developer.html`, dan **semua halaman .html** di paket ini: tautan skrip
`supabase-client.js` dinaikkan ke `?v=3` supaya cache browser memuat penjaga baca-saja yang baru.

## 4. Pakai
Login developer → menu **Manajemen Akun**.

| Tindakan | Efek |
|---|---|
| Reset sandi | Ganti sandi akun mana pun (min. 8 karakter; tombol "Buat acak"). Sandi tidak disimpan di log. |
| Ubah peran | admin / guru / kepsek / staf / pengawas. Peran developer tidak bisa diberikan dari sini. |
| Nonaktifkan / Aktifkan | Blokir login + cabut semua sesi. Data tidak dihapus. |
| Paksa keluar | Cabut semua sesi login akun tersebut. |
| Lihat sebagai | Buka portal persis seperti pengguna itu, **hanya baca**, maksimal 30 menit. |

Tidak ada tindakan yang bisa dilakukan pada akun sendiri atau akun developer lain.

## Cara kerja "Lihat sebagai"
1. Function `dev-akun` mencatat ke `log_developer` (alasan wajib), lalu menerbitkan tiket masuk sekali pakai.
   Bila pencatatan gagal, tidak ada tiket yang terbit.
2. Browser menyimpan sesi developer, lalu masuk memakai tiket itu (sesi asli pengguna di perangkat lain tidak disentuh).
3. Selama mode aktif, `supabase-client.js` memblokir semua permintaan tulis, RPC yang tidak terdaftar sebagai
   baca-saja, upload, Edge Function, dan ubah sandi. RPC dekripsi NIK/No. KK (`bi_dekripsi`, `siswa_nik_kk_saya`)
   ikut diblokir. Bar ungu di atas halaman menampilkan sisa waktu dan tombol **Akhiri**.
4. Tombol **Keluar** di halaman mana pun hanya mengakhiri mode ini dan memulihkan sesi developer;
   pengguna aslinya tidak ikut dikeluarkan.
5. Saat selesai, akhir sesi dicatat (`lihat_sebagai_selesai`, beserta durasi).

## Yang perlu diketahui
- **Pembatasan baca-saja ada di browser**, bukan di database. Developer yang paham teknis bisa melewatinya
  dan bertindak sebagai pengguna itu. Pengaman yang sebenarnya: hanya developer yang bisa menerbitkan sesi,
  alasan wajib, peran dibatasi, durasi 30 menit, dan semuanya tercatat di `log_developer` yang
  tidak bisa diubah/dihapus dari aplikasi dan bisa dibaca admin.
- **Admin tidak bisa dilihat** (disengaja). Untuk mengizinkan, tambahkan `"admin"` ke `PERAN_BOLEH_DILIHAT` di
  `dev-akun/index.ts` dan ke `PERAN_BISA_DILIHAT` di `developer.html`.
- **RPC baru** yang Anda tambahkan nanti dianggap menulis dan akan diblokir saat "Lihat sebagai" sampai
  didaftarkan di `RPC_BACA` pada `supabase-client.js`. Kalau suatu halaman terlihat kosong saat mode ini,
  periksa Console: respons 403 `PDP_READONLY` menunjukkan RPC mana yang diblokir.
- **Login terakhir** akun yang dilihat ikut berubah karena sesi baru dibuat. Nilai sebelumnya tersimpan di
  kolom keterangan riwayat.
- Menonaktifkan/paksa keluar mencabut sesi, tetapi token akses yang sudah terbit bisa tetap berlaku sampai
  habis masa berlakunya (maksimal sekitar 1 jam).
- Admin melihat tindakan developer di Log Aktivitas (usaha terbaik via `catat_aktivitas`). Tampilan khusus
  `log_developer` untuk admin belum ada; datanya bisa dibaca admin lewat SQL Editor atau API.
- Peran **siswa** dikenali lewat `siswa.auth_user_id`; akun tanpa profil dan bukan siswa muncul sebagai "Tanpa profil".
