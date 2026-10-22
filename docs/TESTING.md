# Panduan mencoba Bito

## Sebelum mulai

Gunakan aplikasi Electron, bukan browser preview. Simpan pekerjaan lain sebelum menguji notifikasi/always-on-top. Jangan gunakan API key produksi tim di screenshot atau issue.

## Alur utama

1. Buka Bito pertama kali. Pastikan ada tepat tiga langkah onboarding. Coba nama kosong: lanjut harus nonaktif. Isi nama, lanjut, pilih gaya, kembali; isian harus masih ada. Selesaikan.
2. Karakter muncul di desktop, chat belum terbuka. Klik sekali: chat terbuka di kanan. Klik lagi: chat menutup. Ulangi klik cepat saat transisi berlangsung.
3. Seret Bito ke tempat lain, lalu lepas. Chat harus tetap tertutup. Seret ketika chat terbuka; chat mengikuti dan tidak keluar dari layar.
4. Klik kanan karakter. Coba menu fokus, Settings dan sembunyikan. Tampilkan kembali lewat tray/menu bar.
5. Seret ke dekat kanan/bawah layar, lalu buka chat. Karakter dan panel harus tetap terlihat. Jika tersedia, coba monitor di kiri monitor utama dan lepas monitor eksternal.

## Fokus, tugas, memori, pengingat

1. Buka tab Fokus. Pilih 15, 25 atau 45 menit; mulai, jeda dan lanjutkan. Menutup chat tidak menghentikan timer.
2. Coba sleep/wake laptop ketika timer aktif. Waktu tersisa dihitung dari deadline, bukan jumlah interval.
3. Tab Langkah kecil: tambah tugas dan tandai selesai. Tutup aplikasi lewat tray → Keluar, buka lagi; tugas harus masih tersimpan.
4. Settings → Pengingat: buat pengingat 1–2 menit ke depan. Notifikasi memerlukan izin OS. Coba snooze dan selesai. Saat Jangan Ganggu aktif, notifikasi ditunda sampai nonaktif.
5. Settings → Memori & data: tambah memori, pastikan muncul, hapus memori uji sendiri. Ekspor data; pastikan tidak ada API key.

## Chat AI — membutuhkan key sendiri

1. Settings → Koneksi AI. Simpan endpoint dan model, lalu API key. Tes koneksi.
2. Kirim “Bantu aku memecah tugas akhir menjadi tiga langkah”. Jawaban harus mengalir bertahap. Tekan Hentikan di tengah jawaban.
3. Kirim “Mulai fokus 15 menit”. Tab Fokus harus benar-benar berjalan; model mendapat hasil tool sebelum menyatakan berhasil.
4. Minta tambah tugas, buat pengingat dengan waktu jelas, dan “Ingat bahwa aku lebih suka belajar sore”. Periksa hasil di panel terkait.
5. Pilih dokumen teks lewat tombol +. Dokumen hanya dikirim ketika pesan dikirim. Coba simpan hasil jawaban sebagai Markdown melalui ikon bookmark.
6. Coba key salah, model salah, jaringan putus dan batas API. Pesan kesalahan harus menyediakan arah pemulihan; draft tidak hilang saat key belum terpasang.
7. Ketika sedang membaca pesan lama, kirim/terima jawaban panjang; auto-scroll tidak boleh merebut posisi baca.

## Tampilan dan aksesibilitas

- Semua kontrol dapat difokuskan lewat Tab; Enter mengirim dan Shift+Enter membuat baris baru.
- Bito tidak punya pilihan dark mode. Periksa tampilan di wallpaper terang/gelap.
- Kurangi gerakan dan transparansi di Settings → Desktop.
- Periksa ukuran karakter minimum/maksimum, skala tampilan Windows 100/150/200%, Retina Mac, dan layar kecil.
- Tautan eksternal hanya http/https dan terbuka lewat browser default.

## Bukti tes otomatis

`npm test` menjalankan tes logika desktop dan mock HTTP server lokal untuk Responses API. Ini tidak membuktikan kualitas model AI sungguhan atau kelancaran di semua OS. Build GitHub Actions membuktikan packaging masing-masing runner, bukan pemeriksaan visual Windows.
