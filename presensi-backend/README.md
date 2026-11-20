# Presensi (backend & database)

Halaman Presensi ada di repo ini sebagai **`presensi.html`** (bagian PDP, memakai login PDP yang sama).
Folder ini hanya berisi sisi database/backend yang **tetap terpisah** di project Supabase presensi
(`nrwexyezcbmsokelgkmp`). File di folder ini TIDAK ikut dipakai oleh situs maupun aplikasi Android/Windows.

- `setup.sql`: tabel & fungsi database presensi (jalankan di SQL Editor project presensi).
- `presensi-api.ts`: isi Edge Function `presensi-api` (deploy di project presensi sebagai `presensi-api`).
- `schema_erapor.sql`: salinan skema e-Rapor sebagai referensi (project PDP, hanya dibaca).

Cara kerja: `presensi.html` login memakai sesi PDP, lalu memanggil Edge Function `presensi-api` dengan token itu
(header `x-rapor-token`). Fungsi memverifikasi token ke e-Rapor (baca-saja) lalu membaca/menulis data presensi
dengan service role. Browser tidak memegang kunci project presensi.

## Database & jadwal
- Data presensi (lokasi, jadwal, pengaturan, log, foto) ada di project Supabase `nrwexyezcbmsokelgkmp`; e-Rapor/PDP hanya dibaca (login + data pegawai).
- Setup: jalankan `setup.sql` di project presensi, deploy isi `presensi-api.ts` sebagai Edge Function `presensi-api` (di Dashboard, atau simpan sebagai `supabase/functions/presensi-api/index.ts` di project presensi) (Verify JWT: OFF, secret `RAPOR_URL` dan `RAPOR_ANON_KEY`).
- Menu admin: **Input jadwal** (xlsx reguler / tes / piket + template), **Cek jadwal**, **Pengaturan** (jam staf, libur, force majeure, guru tugas tambahan staf, tanggal acuan tes / pasca tes / piket).
- Urutan jadwal yang berlaku per tanggal: libur / force majeure (tidak ada jadwal, presensi ditolak) → mode acuan (tes, pasca tes, piket, atau reguler) → jam staf bila berlaku. Jam staf berlaku Senin–Sabtu.
- Unggah dan unduh template Excel paling nyaman dari browser komputer.
