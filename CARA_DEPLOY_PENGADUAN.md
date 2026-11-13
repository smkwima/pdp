# Pengaduan Siswa (Bullying & Pelanggaran)

Siswa melapor lewat Portal Siswa dengan **nama wajib tercantum** (tidak ada opsi anonim).
Laporan hanya dapat dibaca oleh **Admin dan Kepala Sekolah**.

## File
- BARU  `migrasi_pengaduan.sql`  -> jalankan di Supabase -> SQL Editor (aman diulang)
- BARU  `pengaduan-siswa.js`     -> menu Pengaduan di Portal Siswa
- BARU  `pengaduan.html`         -> halaman Admin & Kepala Sekolah
- UBAH  `siswa.html`, `portal.html`, `app-switcher.js`, `kepsek-nav.js`, `bottomnav.js`
- UBAH  semua `*.html` yang memuat `app-switcher.js` / `kepsek-nav.js` / `bottomnav.js` (hanya nomor versi `?v=` dinaikkan agar cache browser diperbarui)

## Langkah
1. Jalankan `migrasi_pengaduan.sql` di Supabase SQL Editor.
2. Upload semua file di atas ke hosting, lalu muat ulang (Ctrl+F5).
3. Siswa: menu **Pengaduan** (di HP: Lainnya -> Pengaduan) atau kartu di Beranda.
4. Admin / Kepala Sekolah: **Menu Utama -> Pengaduan Siswa**.

## Siapa bisa apa
| Peran | Kirim | Lihat nama pelapor | Ubah status / tanggapan | Hapus |
|---|---|---|---|---|
| Siswa | ya | miliknya sendiri | tidak | tidak |
| Guru / wali kelas / staf | tidak | **tidak bisa membuka sama sekali** | tidak | tidak |
| Kepala Sekolah | tidak | ya (semua) | tidak (hanya lihat) | tidak |
| Admin | tidak | ya (semua) | ya | ya |

## Dikunci di database (bukan hanya disembunyikan di layar)
- Tabel `pengaduan` hanya terbaca oleh Admin & Kepala Sekolah (RLS). Tidak ada policy tulis langsung.
- Siswa mengirim lewat fungsi `pengaduan_kirim` dan membaca riwayat lewat view `pengaduan_saya`
  (hanya miliknya; tanpa catatan internal).
- Identitas pelapor (nama, NIS, kelas) selalu disimpan; kelas disalin saat melapor. Parameter `p_anonim` diabaikan.
- Batas kirim: 5 pengaduan per jam per siswa (anti spam). Uraian minimal 15 karakter.

## Fitur halaman Admin / Kepala Sekolah
- Ringkasan jumlah (total, baru, diproses, selesai), filter status/jenis, pencarian.
- Detail: identitas pelapor, pihak terlapor, tempat, tanggal, uraian.
- Admin: ubah status (Baru / Diproses / Selesai / Ditutup), **Tanggapan untuk pelapor**
  (tampil di Portal Siswa pelapor), dan **Catatan internal** (hanya admin & kepsek).

## Catatan
- Formulir memberi tahu siswa bahwa laporan atas namanya dan hanya dibaca Admin & Kepala Sekolah.
- Tanggapan untuk pelapor dibaca siswa pelapor; jangan menulis data pihak lain di kolom itu.
- Belum ada unggah foto/bukti dan belum ada notifikasi lonceng; bisa ditambahkan kemudian.
- Pengaduan uji coba dihapus lewat tombol **Hapus** (admin) di detail pengaduan.
