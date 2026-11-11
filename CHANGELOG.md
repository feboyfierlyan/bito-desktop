# Changelog

Perubahan Bito per versi. Setiap rilis ditautkan ke commit dan file distribusinya sendiri; versi lama tetap tersedia.

## [0.6.3](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.6.3) — 11 November 2026

- Tugas memakai satu halaman dengan tab Hari ini dan Semua, ringkasan progres, serta detail tugas di kolom kanan.
- Jadwal, Proyek, dan Arsip memakai tata letak workspace yang selaras, dengan perbaikan animasi grup, checklist, dan panel.
- Penyuntingan tugas melindungi draf dan memeriksa perubahan yang belum disimpan. Pemilihan tanggal dan pengelolaan sesi kerja diperjelas.
- Area hover karakter mengikuti bentuk Bito. Kontrol desktop tetap bisa dijangkau dari kaki Bito.
- Perbaikan aksesibilitas, onboarding, dan penanganan bantuan layar. Lihat [catatan rilis](docs/releases/v0.6.3.md).

## [0.6.2](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.6.2) — 8 November 2026

- Font lokal baru dan tampilan konsisten untuk seluruh antarmuka Bito.
- Workspace menampilkan langkah berikutnya, pencarian, filter status, progres, dan panduan proyek pertama.
- Proyek terhambat diarahkan ke tinjauan rencana; kelanjutan sesi mengikuti catatan progres terbaru.
- Pengaturan, chat, dan onboarding diperhalus; saran pembuka chat mengisi draf tanpa mengirim otomatis.
- Teks pendukung lebih terbaca, fokus pencarian tetap terjaga, dan feedback tombol lebih jelas; mendukung preferensi kontras dan transparansi.
- Mempertahankan perbaikan login, morph onboarding, dan drag Windows dari v0.6.1.
- 400 tes lokal lulus tanpa skip. Detail dan batasan tersedia di [catatan rilis](docs/releases/v0.6.2.md).

## [0.6.1](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.6.1) — 7 November 2026

- Artwork login dan onboarding tampil penuh; kartu login tetap ringkas.
- Transisi login ke onboarding menyambung dengan satu canvas Bito dan animasi panel yang selaras.
- Handoff drag mempertahankan satu pemilik karakter agar Bito inline tidak muncul kembali saat karakter native diseret.
- Ukuran jendela karakter dikunci selama drag untuk menghindari pertumbuhan akibat pembulatan DPI Windows.
- Tes regresi mencakup 1.000 gerakan onboarding dan 20 sesi drag desktop; pengujian interaksi pada laptop Windows masih diperlukan.
- Detail verifikasi dan batasan tersedia di [catatan rilis](docs/releases/v0.6.1.md).

## [0.6.0](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.6.0) — 5 November 2026

- Rilis Latest untuk macOS Apple Silicon, macOS Intel, dan Windows x64.
- Workspace Astryx dengan navigasi berlabel, kelompok tugas yang dapat diedit, tenggat, kalender, dan progres proyek.
- Chat ringkas dengan pilihan proyek, pratinjau lampiran yang diproses setelah Kirim, dan cuplikan layar sekali pakai.
- Bantuan layar, pencarian dengan sumber, serta sinkronisasi rencana yang disetujui ke Google Calendar.
- Bito berukuran default 180px, dengan transisi onboarding dan kontrol yang menyambung.
- Perbaikan lebar input chat, scroll detail proyek, dan penanganan penyimpanan saat disk penuh.
- Penguatan akses file, izin bantuan layar, dan fungsi database; 389 tes lokal lolos tanpa skip.
- macOS masih ad-hoc/belum notarized dan Windows belum signed. Cakupan pengujian serta batasan akses akun tercantum dalam [catatan rilis](docs/releases/v0.6.0.md).

## [0.5.1](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.5.1) — 26 Oktober 2026

- Perbaikan paket Mac: tanda tangan ad-hoc dibuat ulang setelah bundel aplikasi disusun.
- CI mengekstrak ZIP Apple Silicon dan Intel, lalu memverifikasi seluruh tanda tangan/resource sebelum mengunggah paket.
- v0.5.0 dipertahankan sebagai arsip; unduhan terbaru diarahkan ke v0.5.1. Belum ada sertifikat penerbit/notarization Apple.

## [0.5.0](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.5.0) — 26 Oktober 2026

- Login Google dengan akses demo privat; koneksi AI bersama melalui backend Supabase, tanpa key pengguna di installer.
- Qwen 3.8 27B lewat Groq; pilihan gaya To the point, Chill, Humoris, dan Care dengan migrasi profil lama.
- Chat per kalimat/paragraf, typing antar-bubble, Markdown dan kartu hasil interaktif untuk timer, pengingat, checklist, serta file teks.
- Panel chat putih susu dengan animasi isi yang terbungkus, resize, scroll/fade, pemisah hari, jam saat hover, status error/stop, dan kembali ke pesan terbaru.
- Penempatan chat kiri/kanan mengikuti ruang layar, sapaan dan bubble notifikasi fungsional, wave saat masuk chat, serta ayunan drag.
- Login artwork Bito, transisi ke onboarding yang tersambung, pemanasan aset Rive dan poster lokal, outline transparan tanpa halo putih.
- Settings baru, penyimpanan akun lokal terpisah, sesi terenkripsi OS, dan kendali memori/ekspor data.
- README bergaya halaman produk, panduan instalasi dan teknis terpisah, serta paket Mac Apple Silicon/Intel dan Windows x64.

## [0.4.0](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.4.0) — 23 Oktober 2026

- Percakapan onboarding berkesinambungan: jawaban user lebih dulu, jeda 340 ms, lalu balasan Bito.
- Riwayat bergerak dari bawah; maju/mundur, judul, input, dan progress menyambung tanpa reset seluruh chat.
- Mundur memutar reveal pesan tujuan kembali; balasan tertunda dibatalkan ketika navigasi berubah.
- Bito merespons pilihan gaya bicara sebelum memberi petunjuk drag.
- Pupil mengikuti cursor pada langkah 1–2 dan kembali netral saat langkah 3/kehilangan fokus.
- Bubble morph tanpa rotasi, tanpa tooltip atau aksi skip saat hover/klik.
- Input gesture onboarding ditangani satu permukaan; karakter tidak menangkap klik di lapisan transparan kedua. Alternatif tombol pindah dan outline karakter dihapus.
- Mode revisi lokal dengan UI live, restart otomatis main/preload, dan profil uji terpisah.
- Build per versi, Mac Apple Silicon/Intel, Windows x64, checksum, dan publikasi GitHub Releases setelah seluruh build berhasil.

## [0.3.0](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.3.0) — 23 Oktober 2026

- Onboarding diubah menjadi percakapan terpusat dengan input nama dan pilihan kepribadian berbentuk pill.
- Bubble bergaya iMessage, reveal teks, animasi bicara, dan klik karakter untuk wave pada langkah 1–2.

## [0.2.0](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.2.0) — 23 Oktober 2026

- Onboarding dua panel, bubble berbicara, dan perpindahan karakter dari onboarding ke desktop.
- Satu jendela pet/Rive tetap hidup selama handoff; pembatalan mengembalikan posisi awal.

## [0.1.0](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.1.0) — 22 Oktober 2026

- Prototype awal: karakter desktop, onboarding, chat AI streaming, fokus, tugas, pengingat, memori, Settings, dan penyimpanan lokal.
- Build macOS Apple Silicon dan Windows x64 melalui GitHub Actions.
