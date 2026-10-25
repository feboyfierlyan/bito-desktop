# Changelog

Checkpoint prototype Bito. Setiap versi ditautkan ke commit dan file distribusinya sendiri; versi lama tetap tersedia.

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
