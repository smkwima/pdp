# Presensi di Menu Utama PDP (masuk otomatis)

Presensi muncul di **Menu Utama** PDP (kelompok *Kepegawaian*), di menu **Aplikasi** (desktop)
dan di bar bawah / **Semua Aplikasi** (HP) untuk guru, staf, admin, dan kepala sekolah.
Klik **Presensi** -> langsung terbuka tanpa login ulang. Caranya sama seperti RPP Maker:
token sesi PDP dibawa lewat bagian `#` pada URL (tidak dikirim ke server hosting dan
langsung dihapus dari alamat oleh Presensi).

## Yang perlu dilakukan
1. Unggah (push) repo **pdp** dan repo **presensi** yang sudah diubah ke hosting masing-masing.
2. Pastikan alamat Presensi di `rpp-launcher.js` benar:
   `window.PRESENSI_URL = 'https://wima15.github.io/presensi/';`
   (ubah bila nama repo/alamat hosting Presensi berbeda).
3. Tidak ada migrasi SQL dan tidak ada Edge Function baru. Edge Function `presensi-api`
   yang sudah ada tetap dipakai apa adanya (ia sudah memverifikasi token e-Rapor/PDP).

## Perilaku
- Token PDP dipakai langsung oleh Presensi dan **tidak disimpan permanen**. Berlaku sesuai masa token
  (umumnya 1 jam). Saat habis, Presensi menampilkan tombol **Perbarui dari PDP**; PDP lalu membuka
  Presensi lagi dengan token baru (tanpa login).
- Tombol **Keluar** di Presensi (mode ini) berganti menjadi **Kembali ke PDP** dan tidak mengeluarkan
  akun dari PDP.
- Presensi yang dibuka langsung (tanpa lewat PDP) atau lewat APK Presensi tetap memakai login
  email + kata sandi seperti sebelumnya.
- Mode **Lihat sebagai** (developer) tidak boleh membuka Presensi, supaya tidak tercatat atas nama orang lain.
- Di aplikasi Android PDP, Presensi terbuka di browser HP (kamera & lokasi bekerja di sana).

## Kunci / sembunyikan dari Developer
Jalankan `migrasi_presensi_akses.sql` di Supabase (SQL Editor) sekali saja. Presensi lalu muncul di
developer.html -> Akses Aplikasi. *Sembunyikan* menghilangkan Presensi dari Menu Utama, menu Aplikasi, dan bar bawah;
*Kunci* menampilkannya bergembok di Menu Utama dan menolak pembukaan dari PDP.
Catatan: Presensi berjalan di situs/APK terpisah, jadi kunci ini hanya berlaku untuk jalan masuk dari PDP.
Membuka Presensi langsung (alamat sendiri atau APK) tidak ikut terkunci.
