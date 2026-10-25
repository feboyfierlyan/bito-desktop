# Mengembangkan Bito

Panduan untuk pengembang dan pemilik demo. Untuk mengenal aplikasi atau mengunduh installer, buka [halaman Bito](../README.md). Semua perintah dijalankan dari folder utama repo.

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

Hasil dipisahkan per versi di `release/0.5.0/`: Mac `.dmg` dan `.zip`, Windows installer `.exe`. `npm run package:dir` membuat folder aplikasi tanpa installer. Build lokal ini belum dinotariskan atau ditandatangani untuk distribusi publik; distribusi resmi memerlukan sertifikat masing-masing platform. Build dan tes Windows/macOS juga disiapkan lewat GitHub Actions.

## Yang sudah diimplementasikan

- Onboarding percakapan dalam tiga langkah: nama lewat input chat, pilihan kepribadian berbentuk pill, dan pindah ke desktop. Title dan description singkat di atas komposisi terpusat. Bubble abu-abu untuk Bito, balasan biru untuk pengguna, reveal per kata, dan animasi bicara Rive yang mengikuti reveal. Klik Bito pada langkah 1–2 untuk wave.
- Login dan onboarding memakai satu instance Rive di jendela setup; jendela karakter desktop disiapkan tersembunyi dan mengambil alih di posisi yang sama pada langkah ketiga, sebelum gesture dimulai. Permukaan native itu tidak mengambil fokus dan meneruskan klik ke kontrol onboarding. Lepas di luar jendela untuk selesai; lepas di dalam untuk kembali lembut. Progres tersimpan; konteks proyek dapat diisi di Settings.
- Bito Rive asli: drag, thinking, fokus, tidur; prioritas aktivitas ditentukan aplikasi.
- Jendela karakter transparan dan chat terpisah, penempatan di kanan, pemulihan posisi setelah perubahan monitor.
- Bubble chat masuk dengan permukaan yang memanjang dari ekor tanpa rotasi, dan spring; teks tidak ikut meregang. Efek dipakai pada onboarding dan pesan baru kedua pihak di chat utama. Riwayat tidak diputar ulang saat membuka chat.
- Chat biru–putih: Markdown, kode, tabel, tautan, salin, simpan catatan, lampiran teks, respons streaming, hentikan, coba lagi.
- SQLite lokal untuk profil, riwayat, memori, tugas, pengingat, posisi dan timer.
- Login Google melalui browser sistem dengan PKCE dan callback loopback sekali pakai. Sesi dienkripsi dengan safeStorage OS di proses utama; token tidak diberikan ke React atau ekspor.
- Backend memeriksa sesi dan keanggotaan aktif pada setiap request, dengan kuota harian/menit bersama yang dihitung di transaksi database.
- AI dapat menjalankan timer, tambah tugas, pengingat, memori yang diminta, dan membuat satu folder melalui pemilihan lokasi native. Tindakan memakai receipt lokal agar retry tidak mengulang efek samping.
- Timer fokus dengan jeda/lanjutkan, hitungan berbasis waktu nyata agar tahan sleep/wake laptop.
- Pengingat lokal, snooze 10 menit, selesai, notifikasi dan mode jangan ganggu.
- Checklist, pengelolaan memori, ekspor data, hapus chat melalui konfirmasi native.
- Ukuran karakter, always-on-top, tampil saat login, reduced motion dan reduced transparency.
- Tray/menu bar untuk memunculkan Bito kembali atau keluar.

## Batas prototype yang perlu diketahui

- **Bukan agent kontrol desktop bebas.** Tidak mengklik aplikasi lain, menjalankan shell, mengirim email, atau mengakses semua file secara otomatis. Bantuan dokumen menggunakan file yang dipilih sendiri; hasil bisa disimpan melalui dialog native.
- Lampiran saat ini berupa teks `.txt`, `.md`, `.csv`, `.json`, `.log`, maksimal 192 KB. Konteks AI dibatasi 24.000 karakter total; pesan terbaru maksimal 16.000 karakter. PDF/DOCX dan OCR belum diimplementasikan.
- Belum ada voice/TTS dan lip-sync suara. Animasi `isTalking` dipakai saat bubble onboarding terungkap dan teks jawaban mengalir; ini gerakan karakter untuk teks, bukan sinkronisasi suara.
- Chat memakai permukaan putih transparan dengan fallback solid. Blur terhadap wallpaper/aplikasi lain lewat material native OS belum diimplementasikan; `backdrop-filter` hanya bekerja pada konten jendela.
- Pengingat berbunyi saat Bito berjalan. Setelah dibuka lagi, pengingat terlewat diperiksa. Tidak ada layanan penjadwal sistem yang berjalan setelah aplikasi keluar.
- Sapaan opsional maksimal satu per jam ketika tidak sibuk/fokus/tidur/chat. Penjadwalan jam tenang khusus belum ada; tersedia Jangan Ganggu dan mode hanya saat dipanggil.
- SQLite lokal tidak dienkripsi dan dipisah per ID akun. Sesi dienkripsi tersendiri. Konteks chat/profil/memori yang dibatasi dikirim lewat backend ke penyedia AI yang dipilih pemilik saat pengguna mengirim pesan. Periksa ketentuan dan pengaturan data penyedia yang aktif; jangan gunakan dokumen sensitif untuk pengujian demo.
- Aset Rive disiapkan transparan. Runtime dan file dipanaskan per renderer, poster lokal menjaga tampilan sebelum frame pertama, dan perpindahan jendela menunggu frame yang siap. Hak ekspor aset mengikuti lisensi proyek.
- Akun dan backend privat sudah disiapkan di source; proyek cloud, provider Google, allowlist dan secret perlu dikonfigurasi pemilik sebelum tes live. Belum ada sinkronisasi riwayat antarperangkat, auto-update, telemetry, atau sistem pembayaran.

## Perintah pengujian

```sh
npm run check
npm test
npm run build
npm audit --omit=dev
```

Tes otomatis mencakup gesture threshold, penempatan chat pada monitor negatif, pemulihan posisi, timer sleep/wake, validasi endpoint dan tanggal, persistensi SQLite, streaming AI, tool round trip, pembatalan, serta koneksi putus. Pengujian AI menggunakan server tiruan loopback dan key dummy; tidak memerlukan biaya atau key sungguhan.

Untuk preview UI saja, `npm run preview`. Ini browser preview dengan penyimpanan terpisah. Jangan pakai preview browser untuk menilai drag jendela, menu native, notifikasi, atau API key: fitur tersebut ada di aplikasi Electron.

Lihat [panduan uji lengkap](TESTING.md), [riset dan spesifikasi motion](MOTION.md), dan [arsitektur](ARCHITECTURE.md).

## Data dan troubleshooting

Data aplikasi ada di direktori `userData` OS, biasanya:

- macOS: `~/Library/Application Support/Bito/`
- Windows: `%APPDATA%/Bito/`

`accounts/<user-id>/bito.sqlite` menyimpan data masing-masing akun. `session-<project>.bin` menyimpan sesi terenkripsi OS. `guest.sqlite` terpisah dari akun. Data revisi lama di `bito.sqlite` tetap disimpan dan tidak otomatis dipindahkan ke akun lain. File kredensial lama tidak lagi dibaca. Semua data tersebut diabaikan Git. Untuk percobaan terisolasi, set `BITO_DATA_DIR` ke direktori kosong sebelum `npm start`.

Jika Bito tidak terlihat, pilih **Tampilkan Bito** dari tray/menu bar. Mode revisi memakai port `5183` dan memilih port berikutnya otomatis jika sedang dipakai. Jika karakter belum muncul, tunggu runtime siap; periksa `public/bito.riv` dan `public/rive.wasm`. Jika login ditolak, pemilik perlu mengecek allowlist dan konfigurasi Google. Jika jatah demo/Gemini tercapai, aplikasi menampilkan penanda error; tidak ada fallback berbayar.

## Proyek dan aset

Karakter `public/bito.riv` berasal dari proyek Bito milik tim. Sumber `.rev` tetap disimpan di luar repo ini. Ikon aplikasi dibuat sebagai SVG di `public/`; PNG merupakan hasil render vektor tersebut. Tidak ada aset screenshot Mobbin yang disalin ke aplikasi.

Ekspor asli dicadangkan di `assets/bito-original.riv`. `scripts/prepare-eye-rig.mjs` menambahkan kembali nama `Pupil_L` dan `Pupil_R` yang terhapus saat ekspor, tanpa mengganti artwork atau animasi. Proses ini juga dijalankan oleh `postinstall`. Jika memperbarui ekspor Rive, identifikasi ulang kedua node sebelum mengganti sumber; pemeriksaan fingerprint mencegah patch diterapkan ke objek yang salah.

Saat onboarding langkah 1–2, cursor native dipetakan ke pupil melalui kanal terpisah pada 30 Hz, lalu dihaluskan setiap frame Rive. Langkah 3, kehilangan fokus, dan gerakan dikurangi menonaktifkan tracking. Uji cepat: gerakkan cursor ke empat sudut, lanjut ke langkah 3, lalu kembali ke langkah 2; pupil harus kembali ke posisi asli saat tracking berhenti dan aktif kembali saat mundur.

Belum ditetapkan lisensi distribusi publik untuk kode/aset proyek ini. Repo tetap privat.

## Revisi lokal cepat

Saat aplikasi sudah terbuka, pilih menu native **Mode revisi → Login screen (preview)**, **Ulangi onboarding**, atau **Kembali ke desktop**. Menu yang sama ada pada klik kanan Bito dan ikon Bito di menu bar/tray. Tanpa backend, **Status login (preview)** mencoba keadaan menunggu, memeriksa, berhasil, ditolak dan offline; **Tes transisi login → onboarding** mencoba perpindahan layar. Preview ini hanya mengubah tampilan, tidak membuat sesi atau membuka akses backend. Login Google asli tetap memerlukan konfigurasi pemilik. **Halaman selesai login (preview)** membuka halaman konfirmasi browser dengan artwork Bito, panel putih ringkas, karakter vektor dan tombol biru yang membawa Bito ke depan. Halaman sukses/error ini memakai alamat lokal sementara tanpa kode OAuth, aset lokal, animasi singkat dan dukungan reduced motion. Untuk mengulang onboarding dari Settings, buka **Kamu → Ulangi perkenalan**.

Login memakai panel putih di tengah artwork Bito, dengan satu tombol Google. Area konten login dikunci pada 1040×740 px; resize manual, maximize dan fullscreen dinonaktifkan khusus login. Artwork tracing pengguna `public/artwork/bito-login-background.svg` menjadi latar penuh yang tidak menangkap input. Panel putih mengikuti tinggi isi (sekitar 310–320 px saat idle) dan hanya berisi satu Bito animasi, judul/deskripsi dan tombol Google. Status tidak memesan ruang kosong; ketika diperlukan, panel bertambah tinggi ke bawah selama 260 ms tanpa menggeser isi utama. Tidak ada foreground tambahan atau petunjuk akun di bawah tombol; area tersebut dipakai hanya ketika status login perlu ditampilkan. SVG foreground lama disimpan sebagai aset, tetapi tidak dirender pada login. Bito Rive kecil memakai viewport 104 px, gerak pupil mengikuti cursor dan wave pembuka sekali. Background, panel dan instance karakter dipertahankan pada satu scene. Panel melebar menuju bingkai onboarding berjarak 28 px dari tepi selama 520 ms; Bito yang sama bergerak dan membesar dengan buffer gambar tetap tajam. Konten onboarding masuk setelah panel mulai terbuka; reduced motion langsung memakai posisi tujuan. Login dan dua langkah awal tidak memakai jendela karakter terpisah yang terlihat. Pada langkah ketiga, karakter native sudah siap sebelum pointer ditekan; ini menghindari putusnya pointer capture macOS ketika jendela baru ditampilkan saat drag. Gerak mata kembali netral ketika jendela kehilangan fokus, memeriksa akun, atau reduced motion aktif. Logo Google berasal dari [aset resmi Google](https://developers.google.com/static/identity/images/g-logo.png); font Google Sans Medium dibundel lokal dengan [lisensi SIL OFL](../public/google-sans-OFL.txt), mengikuti [pedoman tombol Google](https://developers.google.com/identity/branding-guidelines).

Buka `Revisi Bito.command` atau jalankan `npm run dev`. UI diperbarui langsung; perubahan proses desktop hanya memulai ulang Electron, tanpa packaging installer atau GitHub. Profil uji ada di `.bito-dev-data`, terpisah dari data aplikasi yang terpasang. Mode revisi sekarang langsung membuka karakter desktop dan percakapan. Untuk menguji onboarding lagi, jalankan `BITO_DEV_ONBOARDING=1 npm run dev`. Gunakan aplikasi Electron yang dibuka mode ini untuk mencoba drag ke desktop; browser preview tidak bisa memindahkan jendela OS.


## Kartu hasil — mode revisi

Percakapan mendukung teks dan kartu hasil yang berasal dari tindakan lokal berhasil. Coba:

- “Pasang timer 5 menit.” Kartu menghitung waktu dari deadline nyata; jeda, lanjutkan, tambah satu menit, dan akhiri bekerja langsung tanpa memanggil model. Kartu sesi lama tidak bisa mengendalikan sesi baru.
- “Ingatkan aku minum 10 menit lagi.” Kartu mengikuti pengingat lokal, bisa diubah atau dibatalkan.
- “Buat checklist persiapan presentasi berisi tiga langkah.” Checklist menyimpan setiap tugas dengan ID sendiri; centang tersimpan per akun.
- “Buat hello-world.txt berisi Hello, World!” Pilih folder pada dialog native. Setelah file berhasil ditulis, kartu menyediakan pratinjau isi teks, buka file, dan tampilkan di folder. Mendukung UTF-8 TXT, Markdown, CSV, maksimal 64 KB; tidak menimpa nama yang sudah ada. File PDF/Office, konversi, pencarian web dan kalender belum didukung batch ini.

Kartu dan registrasi file bertahan saat aplikasi dibuka ulang, terpisah per akun. Jalur file hanya disimpan di proses lokal/SQLite; renderer dan backend hanya menerima ID serta metadata hasil. Tombol file hanya dapat memakai hasil yang terdaftar pada percakapan akun aktif. Pratinjau diperlakukan sebagai teks; isi dokumen tidak dijalankan sebagai HTML atau kode. Kartu yang sudah berhasil tetap terlihat jika balasan AI berikutnya terputus; tombol retry otomatis tidak ditawarkan pada hasil tersebut agar tindakan tidak terulang.

## Menyiapkan demo privat — pemilik saja

Status: login Google dan chat Gemini live sudah berhasil diuji pada proyek demo pemilik; langkah di bawah mendokumentasikan setup untuk proyek baru. Teman/dosen tidak menjalankan langkah konfigurasi ini dan tidak memerlukan key sendiri.


1. Buat proyek **Supabase Free** bernama `bito-demo`. Pilih region dekat pengguna. Simpan password database sendiri; jangan kirim ke chat atau repo.
2. Di **Settings → API Keys**, ambil Project URL dan **publishable key** (atau legacy `anon`). Salin `.env.example` menjadi `.env.local` dan isi hanya dua nilai publik tersebut. `sb_secret_…`, service role, OAuth secret, dan Gemini key tidak boleh masuk file konfigurasi aplikasi. Sesudah mengubahnya, mulai ulang `npm run dev`.
3. Buka **SQL Editor**, jalankan isi `supabase/migrations/202610240001_private_demo.sql` **sekali**, lalu `supabase/migrations/20261025113434_revision_demo_quotas.sql` untuk batas revisi terbaru. Alternatif CLI: link proyek lalu `npx supabase db push`, dengan password yang dimasukkan sendiri di terminal. Semua tabel memakai RLS, tanpa izin tabel/RPC untuk klien biasa.
4. Di **Table Editor → demo_members**, tambahkan email Google pemilik, anggota kelompok dan dosen dalam huruf kecil; biarkan `user_id` kosong dan `active=true`. ID diikat server saat login pertama yang tervalidasi. Menyetel `active=false` menolak request berikutnya tanpa menerbitkan ulang installer.
5. Aktifkan **Authentication → Sign In / Providers → Google**. Di Google Cloud Console, buat OAuth client jenis **Web application**, isi consent screen dan tambahkan akun demo sebagai test users bila aplikasi masih berstatus Testing. Redirect URI Google harus `https://PROJECT_REF.supabase.co/auth/v1/callback`. Masukkan client ID dan client secret hanya ke provider Google di dashboard Supabase. Setup Google OAuth tidak memerlukan pengaktifan billing Gemini/Google Cloud lama. [Panduan resmi Google login](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
6. Pada **Authentication → URL Configuration → Redirect URLs**, tambahkan **hanya** `http://127.0.0.1:43821/auth/callback/*`. Wildcard ini terbatas pada nonce sekali pakai di loopback komputer pengguna. Jangan ganti menjadi wildcard semua host. Port ini dipakai sama di Mac dan Windows; jika sedang dipakai, Bito menampilkan error dan tidak pindah ke host/port sembarang.
7. Di **Edge Functions → Secrets**, isi `GEMINI_API_KEY` dengan **key baru** dari proyek AI Studio Free Tier; ganti key yang pernah terpapar di chat. Opsional `GEMINI_MODEL=gemini-3.5-flash-lite`. Supabase menyediakan kredensial internal Edge Function secara otomatis; tidak ada service role key di aplikasi desktop. Jangan memasukkan secrets ke `.env.local` aplikasi.
8. Unggah fungsi dari folder proyek:

   ```sh
   npm run backend:login
   npm run backend:deploy -- --project-ref PROJECT_REF
   ```

   Login CLI dilakukan pemilik melalui browser/terminal. Jangan kirim access token ke chat. Opsi `--use-api` sudah ada pada script sehingga Docker tidak diperlukan untuk deploy. `verify_jwt=false` di konfigurasi diperlukan karena handler melakukan validasi token langsung ke Supabase Auth; semua action, termasuk session/resume/cancel, memeriksa keanggotaan aktif. Menghapus validasi handler akan membahayakan akses demo.

9. Jalankan `npm run dev`, klik **Lanjutkan dengan Google**, pilih akun yang terdaftar. Login dibuka di browser sistem, kembali otomatis ke Bito. Akun baru menjalani onboarding yang sudah ada; akun lama melanjutkan data lokal miliknya. Chat **“Halo Bito”**, lalu **“Buatkan folder Project Bito”** dan pilih lokasi lewat dialog. Bito baru menyatakan berhasil setelah hasil lokal diterima server.
10. Uji akun Google di luar daftar: login bisa dikenali Auth tetapi akses demo/AI harus ditolak. Uji satu anggota kelompok di laptop kedua dengan build yang memakai dua konfigurasi publik yang sama. Riwayat tetap lokal per akun/perangkat; key AI tetap satu di server pemilik.

Untuk build GitHub Actions nanti, buat repository **Variables**, bukan secrets AI, bernama `BITO_SUPABASE_URL` dan `BITO_SUPABASE_PUBLISHABLE_KEY`. Build rilis tag ditolak bila kedua nilai publik kosong. Jangan masukkan `GEMINI_API_KEY` ke build GitHub/installer. Versi rilis baru belum dibuat oleh revisi ini.

### Qwen lewat Groq — mode revisi

Backend mendukung model `qwen/qwen3.8-27b` yang sama dengan Groq Playground. Pemilik membuat key di [Groq](https://console.groq.com/keys), tetap pada paket Free, lalu menyimpan `GROQ_API_KEY` di Supabase **Edge Functions → Secrets**. Kehadiran key ini memilih Groq untuk seluruh akun demo pada deployment terbaru; tidak ada key AI di desktop dan tidak perlu mengubah Settings setiap pengguna. `BITO_AI_PROVIDER=gemini` memilih kembali Gemini; `BITO_AI_PROVIDER=groq` mewajibkan Groq dan gagal aman jika key belum tersedia. Tidak ada perpindahan provider atau retry otomatis ketika kuota habis. Jangan mengganti provider di tengah tindakan yang masih berjalan; selesaikan atau hentikan chat tersebut dahulu.

Paket gratis Groq saat pemeriksaan 25 Oktober 2026 mencantumkan 30 request/menit, 1.000 request/hari, 8.000 token/menit, dan 200.000 token/hari untuk model ini. Seluruh pengguna berbagi batas organisasi; riwayat, instruksi, tool, dan jawaban memakai token. Tindakan bisa memerlukan beberapa request. Nilai aktual mengikuti [Limits akun](https://console.groq.com/settings/limits), bukan jumlah bubble. Model ini berstatus Preview. Harga berbayar terpisah; aplikasi tidak mengubah paket atau mengaktifkan pembayaran.

Pilihan gaya baru: **To the point, Chill, Humoris, Care** pada onboarding/Settings. Profil lama `warm` dipetakan ke Care, `calm` ke Chill, `direct` tetap To the point. Riwayat dan pengingat tetap tersimpan. Untuk chat biasa, kalimat/paragraf dipisah di aplikasi meski model tidak mengirim `[[BITO_BUBBLE]]`, dengan jeda mengetik 1,6–3,6 detik antar-bubble. Permintaan teks persis/email/kode/dokumen tetap utuh. Satu balasan tetap satu giliran model/riwayat; bubble tambahan bukan panggilan AI tambahan. Penyesuaian gaya tidak menjamin setiap jawaban model akan cocok; tes percakapan dilakukan pemilik.

### Batas internal

- `demo_policy` setelah migrasi batas revisi: 400 pemanggilan model/hari bersama, 200/akun/hari, 8/menit bersama, 4/akun/menit. Maksimal dua pemanggilan model bersamaan dan satu job aktif per akun, maksimal empat putaran model/job, 1.024 token output/putaran, timeout provider 85 detik. Set `enabled=false` untuk menjeda demo. Ini batas internal Bito; kuota aktual Gemini tetap terpisah. Penggunaan yang sudah tercatat tidak dihapus saat batas dinaikkan.
- Setiap putaran, termasuk yang gagal/dihentikan, menghabiskan satu reservasi. Tidak ada retry provider otomatis atau peningkatan ke paket berbayar. Free Tier harus tetap dipilih pada proyek AI Studio. Batas aplikasi bukan pengganti status billing provider.
- Job tool menunggu maksimal 10 menit. Verifikasi hasil terikat akun, perangkat, ID job, ID tool dan nomor putaran. Setelah selesai/gagal/dibatalkan, konteks job dihapus segera. Record lama dibersihkan saat request berikutnya setelah satu hari; ini pembersihan oportunistik, bukan janji penghapusan terjadwal jika demo tidak dipakai.
- Receipt lokal mencegah tindakan diulang saat retry. Jika aplikasi mati di tengah tindakan filesystem, statusnya dianggap belum pasti dan tidak diulang otomatis; pengguna diminta memeriksa hasil.
- Tombol keluar menghentikan request aktif, menutup permukaan akun lama, menghapus sesi lokal dan kembali ke login. Koneksi internet diperlukan untuk memakai Gemini. Task/pengingat lokal tidak disinkronkan ke cloud dan diperiksa hanya ketika akun tersebut aktif di aplikasi.
- Proyek Supabase Free dapat dijeda saat tidak aktif. Buka dashboard dan uji satu request sebelum presentasi. [Batas fungsi](https://supabase.com/docs/guides/functions/limits), [kuota Gemini](https://ai.google.dev/gemini-api/docs/rate-limits).
- Web search, konversi PDF/DOCX, akses kalender dan pengaturan file massal belum tersedia; Bito diberi instruksi untuk tidak mengklaim sudah melakukan tindakan tersebut.

### Pengujian backend

```sh
npm run check
npm test
npm run backend:check
```

Tes memakai Auth/Gemini tiruan, callback loopback asli dengan PKCE, streaming lintas chunk UTF-8, error/cancel, tindakan folder nyata di folder temp, sesi terenkripsi dan receipt yang dipersistenkan. Tidak memanggil Gemini live.

Tes tambahan memakai PostgreSQL lokal sementara (bukan database cloud), dengan URL database `bito_test_*` pada localhost:

```sh
BITO_TEST_DATABASE_URL=postgresql://127.0.0.1:55439/bito_test_private_demo npx tsx --test tests/private-demo-db.test.ts
```

Tes ini mengosongkan schema `public` **di database uji tersebut saja**. Ia menolak host non-lokal dan nama database selain `bito_test_*`. Mencakup RLS, izin RPC, revokasi, konkurensi kuota global/per akun, duplikasi, isolasi perangkat, pembatalan dan kedaluwarsa lease. Pada `npm test` biasa tes database ini dilewati jika variabel tidak diisi.
