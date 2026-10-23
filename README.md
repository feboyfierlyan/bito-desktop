# Bito

Aplikasi companion desktop untuk Windows dan macOS. Karakter Rive yang bisa diseret, chat light putih–biru, onboarding tiga langkah, fokus, pengingat, dan bantuan AI. Dibuat sebagai prototype penelitian mahasiswa, dengan data lokal dan kendali pengguna atas memori.

## Download checkpoint terbaru

**[v0.4.0 — Onboarding polish](https://github.com/feboyfierlyan/bito-desktop/releases/tag/v0.4.0)** · [Semua versi](https://github.com/feboyfierlyan/bito-desktop/releases)

- Mac Apple Silicon (M1 dan lebih baru): pilih `macOS-arm64.dmg` atau `.zip`.
- Mac Intel: pilih `macOS-x64.dmg` atau `.zip`.
- Windows 64-bit: pilih `Windows-x64-Setup.exe`.

Setiap release menyertakan catatan perubahan, sumber commit, dan `SHA256SUMS.txt`. Repo privat: login GitHub dengan akun yang diberi akses untuk mengunduh. Paket prototype belum ditandatangani/notariskan. Lihat [panduan rilis](docs/RELEASING.md) dan [changelog](CHANGELOG.md).

## Coba di Mac ini

Folder proyek: `bito-desktop`.

1. Klik dua kali **Jalankan Bito.command**, atau buka **release/0.4.0/mac-arm64/Bito.app** setelah build lokal tersedia.
2. Pada pemakaian pertama, isi nama → pilih gaya bicara → tahan dan seret Bito keluar jendela onboarding ke desktop. Jika onboarding sudah pernah selesai saat pengujian, buka Settings → Tentang kamu → Ulangi perkenalan.
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

`npm run dev` menjalankan Vite dan Electron. Perubahan tampilan diperbarui otomatis; perubahan dalam `electron/` membangun ulang proses desktop dan memulai ulang Electron otomatis. Tutup lewat menu tray **Keluar**, bukan hanya menutup chat.

Untuk build produksi lokal:

```sh
npm run build
npm start
```

Untuk menghasilkan installer di OS yang sedang dipakai:

```sh
npm run package
```

Hasil dipisahkan per versi di `release/0.4.0/`: Mac `.dmg` dan `.zip`, Windows installer `.exe`. `npm run package:dir` membuat folder aplikasi tanpa installer. Build lokal ini belum dinotariskan atau ditandatangani untuk distribusi publik; distribusi resmi memerlukan sertifikat masing-masing platform. Build dan tes Windows/macOS juga disiapkan lewat GitHub Actions.

## Yang sudah diimplementasikan

- Onboarding percakapan dalam tiga langkah: nama lewat input chat, pilihan kepribadian berbentuk pill, dan pindah ke desktop. Title dan description singkat di atas komposisi terpusat. Bubble abu-abu untuk Bito, balasan biru untuk pengguna, reveal per kata, dan animasi bicara Rive yang mengikuti reveal. Klik Bito pada langkah 1–2 untuk wave.
- Bito memakai satu jendela transparan dan satu instance Rive selama onboarding sampai desktop. Lepas di luar jendela untuk selesai; lepas di dalam untuk kembali lembut. Progres tersimpan; konteks proyek dapat diisi di Settings.
- Bito Rive asli: drag, thinking, fokus, tidur; prioritas aktivitas ditentukan aplikasi.
- Jendela karakter transparan dan chat terpisah, penempatan di kanan, pemulihan posisi setelah perubahan monitor.
- Bubble chat masuk dengan permukaan yang memanjang dari ekor tanpa rotasi, dan spring; teks tidak ikut meregang. Efek dipakai pada onboarding dan pesan baru kedua pihak di chat utama. Riwayat tidak diputar ulang saat membuka chat.
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
- Belum ada voice/TTS dan lip-sync suara. Animasi `isTalking` dipakai saat bubble onboarding terungkap dan teks jawaban mengalir; ini gerakan karakter untuk teks, bukan sinkronisasi suara.
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

Jika Bito tidak terlihat, pilih **Tampilkan Bito** dari tray/menu bar. Mode revisi memakai port `5183` dan memilih port berikutnya otomatis jika sedang dipakai. Jika karakter belum muncul, tunggu runtime siap; periksa bahwa `public/bito.riv` dan `public/rive.wasm` tersedia. Jika key tidak valid, periksa model, saldo API, dan alamat provider di Koneksi AI.

## Proyek dan aset

Karakter `public/bito.riv` berasal dari proyek Bito milik tim. Sumber `.rev` tetap disimpan di luar repo ini. Ikon aplikasi dibuat sebagai SVG di `public/`; PNG merupakan hasil render vektor tersebut. Tidak ada aset screenshot Mobbin yang disalin ke aplikasi.

Ekspor asli dicadangkan di `assets/bito-original.riv`. `scripts/prepare-eye-rig.mjs` menambahkan kembali nama `Pupil_L` dan `Pupil_R` yang terhapus saat ekspor, tanpa mengganti artwork atau animasi. Proses ini juga dijalankan oleh `postinstall`. Jika memperbarui ekspor Rive, identifikasi ulang kedua node sebelum mengganti sumber; pemeriksaan fingerprint mencegah patch diterapkan ke objek yang salah.

Saat onboarding langkah 1–2, cursor native dipetakan ke pupil melalui kanal terpisah pada 30 Hz, lalu dihaluskan setiap frame Rive. Langkah 3, kehilangan fokus, dan gerakan dikurangi menonaktifkan tracking. Uji cepat: gerakkan cursor ke empat sudut, lanjut ke langkah 3, lalu kembali ke langkah 2; pupil harus kembali ke posisi asli saat tracking berhenti dan aktif kembali saat mundur.

Belum ditetapkan lisensi distribusi publik untuk kode/aset proyek ini. Repo tetap privat.

## Revisi lokal cepat

Buka `Revisi Bito.command` atau jalankan `npm run dev`. UI diperbarui langsung; perubahan proses desktop hanya memulai ulang Electron, tanpa packaging installer atau GitHub. Profil uji ada di `.bito-dev-data`, terpisah dari data aplikasi yang terpasang. Saat mode revisi dibuka kembali, perkenalan ditampilkan dari langkah pertama. Gunakan aplikasi Electron yang dibuka mode ini untuk mencoba drag ke desktop; browser preview tidak bisa memindahkan jendela OS.
