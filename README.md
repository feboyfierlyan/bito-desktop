# Bito

Aplikasi companion desktop untuk Windows dan macOS. Karakter Rive yang bisa diseret, chat light putih–biru, onboarding tiga langkah, fokus, pengingat, dan bantuan AI. Dibuat sebagai prototype penelitian mahasiswa, dengan data lokal dan kendali pengguna atas memori.

## Coba di Mac ini

Folder proyek: `bito-desktop`.

1. Klik dua kali **Jalankan Bito.command**, atau buka **release/mac-arm64/Bito.app** setelah build lokal tersedia.
2. Pada pemakaian pertama, isi nama → konteks dan gaya bicara → cara berinteraksi. Jika onboarding sudah pernah selesai saat pengujian, buka Settings → Tentang kamu → Ulangi perkenalan.
3. Seret karakter untuk memindahkannya. Melepas drag tidak membuka chat.
4. Klik sekali untuk membuka/menutup chat di kanan Bito.
5. Klik kanan untuk fokus, pengingat, istirahat, Settings, sembunyikan, atau keluar.
6. Untuk ngobrol dengan AI, buka **Settings → Koneksi AI**. Simpan alamat API dan model, masukkan API key sendiri, lalu **Tes koneksi**. Jangan taruh key di kode atau kirim key lewat issue GitHub.

Default menggunakan OpenAI Responses API dan model `gpt-4.1-mini`. Model bisa diganti sesuai akses akunmu. Endpoint kustom wajib mendukung Responses API; ini bukan adapter Chat Completions generik. Pemakaian API memakai saldo akun penyedia. Tanpa key, onboarding, karakter, fokus, tugas dan pengingat tetap berfungsi, tetapi tidak ada jawaban AI palsu.

## Jalankan dari source — Mac atau Windows

Pasang Node.js **24 LTS atau lebih baru** dan Git. Windows: gunakan PowerShell. Mac: gunakan Terminal.

```sh
git clone https://github.com/feboyfierlyan/bito-desktop.git
cd bito-desktop
npm ci
npm run dev
```

Repo privat memerlukan login akun GitHub yang diberi akses. `npm ci` mengunduh Electron dan menyalin runtime Rive ke folder aset. Seluruh aset karakter dimuat lokal; tidak memerlukan CDN.

`npm run dev` menjalankan Vite dan Electron. Perubahan tampilan diperbarui otomatis; perubahan dalam `electron/` memerlukan tutup aplikasi sepenuhnya dan jalankan ulang. Tutup lewat menu tray **Keluar**, bukan hanya menutup chat.

Untuk build produksi lokal:

```sh
npm run build
npm start
```

Untuk menghasilkan installer di OS yang sedang dipakai:

```sh
npm run package
```

Hasil ada di `release/`: Mac `.dmg` dan `.zip`, Windows installer `.exe`. `npm run package:dir` membuat folder aplikasi tanpa installer. Build lokal ini belum dinotariskan atau ditandatangani untuk distribusi publik; distribusi resmi memerlukan sertifikat masing-masing platform. Build dan tes Windows/macOS juga disiapkan lewat GitHub Actions.

## Yang sudah diimplementasikan

- Onboarding tiga langkah dengan nama, konteks proyek, tujuan, gaya komunikasi dan frekuensi sapaan; progres tersimpan.
- Bito Rive asli: drag, thinking, fokus, tidur; prioritas aktivitas ditentukan aplikasi.
- Jendela karakter transparan dan chat terpisah, penempatan di kanan, pemulihan posisi setelah perubahan monitor.
- Chat biru–putih: Markdown, kode, tabel, tautan, salin, simpan catatan, lampiran teks, respons streaming, hentikan, coba lagi.
- SQLite lokal untuk profil, riwayat, memori, tugas, pengingat, posisi dan timer.
- API key memakai enkripsi OS melalui Electron safeStorage, tidak dikirim kembali dalam snapshot UI atau ekspor.
- AI dapat menjalankan tool timer fokus, tambah tugas, pengingat, dan menyimpan memori yang diminta pengguna.
- Timer fokus dengan jeda/lanjutkan, hitungan berbasis waktu nyata agar tahan sleep/wake laptop.
- Pengingat lokal, snooze 10 menit, selesai, notifikasi dan mode jangan ganggu.
- Checklist, pengelolaan memori, ekspor data, hapus chat melalui konfirmasi native.
- Ukuran karakter, always-on-top, tampil saat login, reduced motion dan reduced transparency.
- Tray/menu bar untuk memunculkan Bito kembali atau keluar.

## Batas prototype yang perlu diketahui

- **Bukan agent kontrol desktop bebas.** Tidak mengklik aplikasi lain, menjalankan shell, mengirim email, atau mengakses semua file secara otomatis. Bantuan dokumen menggunakan file yang dipilih sendiri; hasil bisa disimpan melalui dialog native.
- Lampiran saat ini berupa teks `.txt`, `.md`, `.csv`, `.json`, `.log`, maksimal 192 KB; konteks yang dikirim dibatasi 48.000 karakter. PDF/DOCX dan OCR belum diimplementasikan.
- Belum ada voice/TTS dan lip-sync suara. Animasi `isTalking` dipakai saat teks jawaban mengalir; ini gerakan karakter untuk teks, bukan sinkronisasi suara.
- Chat memakai permukaan putih transparan dengan fallback solid. Blur terhadap wallpaper/aplikasi lain lewat material native OS belum diimplementasikan; `backdrop-filter` hanya bekerja pada konten jendela.
- Pengingat berbunyi saat Bito berjalan. Setelah dibuka lagi, pengingat terlewat diperiksa. Tidak ada layanan penjadwal sistem yang berjalan setelah aplikasi keluar.
- Sapaan opsional maksimal satu per jam ketika tidak sibuk/fokus/tidur/chat. Penjadwalan jam tenang khusus belum ada; tersedia Jangan Ganggu dan mode hanya saat dipanggil.
- SQLite lokal tidak dienkripsi. API key dienkripsi tersendiri. Konteks chat/profil/memori dikirim ke provider ketika pengguna mengirim pesan. API request memakai `store:false`; kebijakan retensi provider tetap berlaku.
- File Rive asli memiliki background artboard mendekati putih dan splash. UI melakukan compositing warna artboard serta menunggu runtime siap. Untuk distribusi final, rapikan background/splash dari sumber Rive dan periksa hak ekspornya.
- Belum ada cloud sync, akun, auto-update, telemetry, atau sistem pembayaran.

## Perintah pengujian

```sh
npm run check
npm test
npm run build
npm audit --omit=dev
```

Tes otomatis mencakup gesture threshold, penempatan chat pada monitor negatif, pemulihan posisi, timer sleep/wake, validasi endpoint dan tanggal, persistensi SQLite, streaming AI, tool round trip, pembatalan, serta koneksi putus. Pengujian AI menggunakan server tiruan loopback dan key dummy; tidak memerlukan biaya atau key sungguhan.

Untuk preview UI saja, `npm run preview`. Ini browser preview dengan penyimpanan terpisah. Jangan pakai preview browser untuk menilai drag jendela, menu native, notifikasi, atau API key: fitur tersebut ada di aplikasi Electron.

Lihat [panduan uji lengkap](docs/TESTING.md), [riset dan spesifikasi motion](docs/MOTION.md), dan [arsitektur](docs/ARCHITECTURE.md).

## Data dan troubleshooting

Data aplikasi ada di direktori `userData` OS, biasanya:

- macOS: `~/Library/Application Support/Bito/`
- Windows: `%APPDATA%/Bito/`

`bito.sqlite` menyimpan data aplikasi. `credentials.bin` menyimpan key terenkripsi. Kedua file tidak masuk Git. Untuk percobaan terisolasi, set variabel `BITO_DATA_DIR` ke direktori kosong sebelum `npm start`.

Jika Bito tidak terlihat, pilih **Tampilkan Bito** dari tray/menu bar. Jika `5173` sedang dipakai, tutup preview sebelumnya sebelum `npm run dev`. Jika karakter belum muncul, tunggu runtime siap; periksa bahwa `public/bito.riv` dan `public/rive.wasm` tersedia. Jika key tidak valid, periksa model, saldo API, dan alamat provider di Koneksi AI.

## Proyek dan aset

Karakter `public/bito.riv` berasal dari proyek Bito milik tim. Sumber `.rev` tetap disimpan di luar repo ini. Ikon aplikasi dibuat sebagai SVG di `public/`; PNG merupakan hasil render vektor tersebut. Tidak ada aset screenshot Mobbin yang disalin ke aplikasi.

Belum ditetapkan lisensi distribusi publik untuk kode/aset proyek ini. Repo tetap privat.
