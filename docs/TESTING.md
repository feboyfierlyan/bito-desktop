# Panduan mencoba Bito

## Sebelum mulai

Gunakan aplikasi Electron, bukan browser preview. Simpan pekerjaan lain sebelum menguji notifikasi/always-on-top. Jangan gunakan API key produksi tim di screenshot atau issue.

## Alur utama

1. Pada demo yang sudah dikonfigurasi, masuk dengan Google memakai akun yang diizinkan. Akun baru masuk ke tiga langkah onboarding. Coba nama kosong: lanjut harus nonaktif. Isi nama, lanjut, pilih gaya, kembali; isian harus masih ada. Seret Bito keluar untuk selesai. Mode revisi tanpa konfigurasi publik tetap memakai profil uji lama dan balasan contoh.
2. Karakter muncul di desktop, chat belum terbuka. Klik sekali: chat terbuka di kanan. Klik lagi: chat menutup. Ulangi klik cepat saat transisi berlangsung.
3. Seret Bito ke tempat lain, lalu lepas. Chat harus tetap tertutup. Seret ketika chat terbuka; chat mengikuti dan tidak keluar dari layar.
4. Klik kanan karakter. Coba menu fokus, Settings dan sembunyikan. Tampilkan kembali lewat tray/menu bar.
5. Seret ke dekat kanan/bawah layar, lalu buka chat. Karakter dan panel harus tetap terlihat. Jika tersedia, coba monitor di kiri monitor utama dan lepas monitor eksternal.

## Login — mode revisi

1. Buka menu native **Mode revisi → Login screen (preview)**. Artwork SVG memenuhi latar, panel putih berada di tengah dengan Bito kecil di atas judul dan satu tombol Google. Panel mengikuti isi sekitar 310–320 px saat idle, tanpa foreground tambahan atau petunjuk akun di bawah tombol. Tombol dan status tidak boleh tertutup atau kehilangan klik. Tidak ada kontrol developer di badan layar. Tab menyorot tombol; Enter bekerja satu kali walaupun ditekan cepat.
2. Gerakkan cursor ke empat sudut: pupil mengikuti dalam batas putih mata. Wave pembuka berjalan sekali. Saat blur, pemeriksaan akun, atau reduced motion aktif, pupil kembali netral.
3. Tanpa backend, klik Google hanya menampilkan pemberitahuan konfigurasi yang tenang. Panel bertambah tinggi ke bawah; posisi Bito, judul dan tombol tidak bergeser. **Status login (preview)** mencoba menunggu/browser, memeriksa, berhasil, akun belum diundang dan koneksi terputus. Coba Batal/Gunakan akun lain/Coba lagi: status kembali idle tanpa mengubah akses akun.
4. Login harus membuka area konten tetap 1040×740 px: seret tepi/sudut, coba maximize dan fullscreen; komposisi tidak boleh berubah. Panel tenang berada di atas satu layer latar; tidak ada barisan karakter tambahan di depan panel. Pilih **Tes transisi login → onboarding**: status memeriksa → berhasil → perkenalan. Background tetap terlihat; panel login melebar menjadi bingkai putih dengan margin 28 px (20 px pada jendela sempit). Jendela dan instance Rive setup dipertahankan; karakter kecil membesar sambil berpindah ke slot onboarding tanpa mengganti canvas. Reduced motion langsung memakai posisi tujuan. Sesudah masuk onboarding, aturan resize onboarding kembali berlaku. Klik aplikasi lain di belakang sekali: fokus harus langsung pindah. Login dan langkah 1–2 tidak menampilkan jendela pet terpisah. Langkah 3 mempersiapkan pet native pada posisi identik sebelum pointer ditekan, dengan klik diteruskan ke onboarding dan tanpa mengambil fokus. Uji lepas di dalam → kembali ke slot, dan lepas di luar → desktop, lalu klik Bito untuk chat. Sebelum drag pada langkah 3, pindah ke aplikasi lain, minimalkan onboarding, dan ganti desktop/Space: karakter native tidak boleh tertinggal di atas aplikasi lain. Kembali ke onboarding: karakter tetap di slot semula. Drag yang sengaja sedang berlangsung boleh melintasi aplikasi; lepas di dalam tetap kembali dan lepas di luar baru menyelesaikan onboarding.
5. Dengan backend aktif, uji callback Google asli, pembatalan, login gagal, akun ditolak, retry offline, serta akun lama yang melanjutkan desktop. Preview visual tidak membuktikan autentikasi live. Uji Windows dan perpindahan monitor pada perangkat aslinya.

## Fokus, tugas, memori, pengingat

1. Mulai timer dari klik kanan karakter atau minta lewat AI setelah backend aktif. Menutup chat tidak menghentikan timer.
2. Coba sleep/wake laptop ketika timer aktif. Waktu tersisa dihitung dari deadline, bukan jumlah interval.
3. Minta AI menambahkan tugas. Gunakan ekspor data untuk memeriksa persistensi tugas; menu Langkah kecil lama telah dihapus dari composer.
4. Settings → Pengingat: buat pengingat 1–2 menit ke depan. Notifikasi memerlukan izin OS. Coba snooze dan selesai. Saat Jangan Ganggu aktif, notifikasi ditunda sampai nonaktif.
5. Settings → Memori & data: tambah memori, pastikan muncul, hapus memori uji sendiri. Ekspor data; pastikan tidak ada API key.

## Chat AI — demo privat, tanpa key pengguna

1. Pemilik menjalankan konfigurasi backend pada README. Masuk memakai Google melalui browser sistem. Pengguna tidak boleh diminta mengisi API key di Settings.
2. Kirim “Bantu aku memecah tugas akhir menjadi tiga langkah”. Jawaban harus mengalir bertahap. Tekan Hentikan di tengah jawaban.
3. Kirim “Mulai timer 1 menit”. Tunggu notifikasi ketika berakhir; model mendapat hasil tool sebelum menyatakan berhasil.
4. Minta tambah tugas, buat pengingat dengan waktu jelas, dan “Ingat bahwa aku lebih suka belajar sore”. Periksa hasil di panel terkait.
5. Pilih dokumen teks lewat tombol +. Dokumen hanya dikirim ketika pesan dikirim. Coba simpan hasil jawaban sebagai Markdown melalui ikon bookmark.
6. Uji jaringan putus, stop dan batas demo. Pesan kesalahan harus menyediakan arah pemulihan. Meminta tindakan yang belum ada, misalnya konversi PDF atau kalender, tidak boleh menghasilkan klaim berhasil.
7. Ketika sedang membaca pesan lama, kirim/terima jawaban panjang; auto-scroll tidak boleh merebut posisi baca.
8. Minta “Buat folder Project Bito”, pilih lokasi temp. Folder harus ada, tidak menimpa nama yang sudah ada, dan pembatalan dialog tidak membuat folder. Tidak ada shell atau akses ke path arbitrary.
9. Keluar dari akun lewat Settings → Aplikasi. Akun kedua tidak boleh melihat profil, riwayat atau memori akun pertama. Login kembali akun pertama memulihkan data lokalnya tanpa onboarding ulang.
10. Akun di luar allowlist harus ditolak tanpa panggilan model. Nonaktifkan member di dashboard: request berikutnya ditolak. Uji pada laptop anggota kedua untuk membuktikan API key hanya perlu disiapkan pemilik.

## Tampilan dan aksesibilitas

- Semua kontrol dapat difokuskan lewat Tab; Enter mengirim dan Shift+Enter membuat baris baru.
- Bito tidak punya pilihan dark mode. Periksa tampilan di wallpaper terang/gelap.
- Kurangi gerakan dan transparansi di Settings → Desktop.
- Periksa ukuran karakter minimum/maksimum, skala tampilan Windows 100/150/200%, Retina Mac, dan layar kecil.
- Tautan eksternal hanya http/https dan terbuka lewat browser default.

## Bukti tes otomatis

`npm test` mencakup logika desktop, callback PKCE loopback, sesi terenkripsi, isolasi akun, streaming Gemini tiruan, error/stop, handoff tool dan pembuatan folder nyata di temp. `npm run backend:check` memeriksa sumber Deno. Tes database opsional menggunakan PostgreSQL lokal disposable untuk RLS, izin RPC, revokasi, kuota konkuren dan idempotensi; lihat README. Pengujian ini tidak membuktikan kualitas Gemini live, deployment, atau kelancaran di semua OS. Build CI membuktikan packaging runner, bukan pemeriksaan visual Windows.


## Onboarding checkpoint 0.4

1. Coba langkah 1 → 2 → 3 dan kembali 3 → 2 → 1. Bubble user muncul lebih dulu, kemudian balasan Bito. Header dan input tidak menggeser slot karakter.
2. Saat mundur, pesan terbaru menyusut, riwayat turun, dan pesan tujuan melakukan reveal lagi. Ketik dan gunakan input ketika Bito masih berbicara.
3. Klik navigasi cepat saat jeda balasan/reveal. Tidak boleh muncul pesan terlambat di step yang salah atau petunjuk drag ganda.
4. Pilih Hangat/Tenang/Langsung. Bito merespons pilihan dulu, baru memberi petunjuk drag. Hover/klik bubble tidak menampilkan tooltip atau skip.
5. Gerakkan cursor ke empat sudut pada langkah 1–2; pupil mengikuti tanpa keluar dari putih mata. Langkah 3 mengembalikan pupil netral; mundur mengaktifkannya kembali. Klik karakter pada langkah 1–2 tetap wave.
6. Drag langsung pada langkah 3, tanpa klik aktivasi tambahan. Drop di dalam mengembalikan karakter; drop di luar menyelesaikan onboarding. Tidak ada tombol pindah manual atau outline karakter.
7. Coba reduced motion, blur/focus, resize/move/minimize onboarding, serta display 100/150/200%. Mac Intel dan Windows perlu diperiksa pada perangkat asli.
8. Setelah onboarding selesai, coba chat, drag desktop, context menu dan Settings. Ulangi perkenalan lewat Settings dan batalkan: posisi/ukuran desktop sebelumnya dipulihkan.

Checkpoint ini mencakup 26 tes otomatis, termasuk batas pupil, reset/release kontrol mata, pembatalan balasan tertunda dan navigasi cepat. CI membangun macOS arm64/x64 dan Windows x64. Pengujian visual onboarding dilakukan di macOS Apple Silicon; 60/120 fps dan gesture pada Windows/Intel belum diukur atau diverifikasi langsung.


## Suara companion (revisi)

`tests/companion-context.test.ts` memeriksa bahwa kalibrasi suara tidak menambahkan giliran percakapan palsu, koreksi pengguna tetap utuh, kedua jalur AI memakai arahan gaya yang sama, serta nama/memori/gaya tidak menjadi instruksi sistem. Ini bukan tes kualitas percakapan: penilaian nada tetap memakai respons Gemini langsung.

Uji percakapan beruntun dengan cerita baru di luar contoh prompt: bercanda → koreksi asumsi → cerita sedih tanpa solusi → lanjut bercerita → ganti topik praktis → kabar baik → permintaan tulisan formal. Periksa konteks nyambung, tidak mengarang detail, tidak memaksa emoji/slang/nasihat, tidak selalu bertanya, dan tidak mengklaim tindakan sebelum tool berhasil. Coba tiga gaya tanpa mewajibkan susunan kata tertentu. Riwayat lama dipertahankan; teks lama tidak ditulis ulang.

Uji onboarding dari menu Mode revisi: nama → gaya → tanggapan pilihan → instruksi drag. Navigasi balik harus tetap replay sesuai cadence lama dan isTalking mengikuti reveal. Setelah drop, sapaan memakai nama dan gaya yang dipilih. Timer selesai tidak boleh mengklaim tugas sudah berhasil; pengingat memakai judul yang benar. Tes Windows visual tetap perlu perangkat Windows asli.

## Kartu hasil dan file teks (revisi)

`tests/rich-results.test.ts` memeriksa tindakan timer lama vs sesi baru, jeda/lanjut/tambah/akhir, checklist tanpa duplikasi, penolakan ID tugas asing, validasi dan pembatalan pengingat, tulisan UTF-8, batas byte, pembatalan dialog, penolakan overwrite/symlink, serta persistensi dan isolasi registry file antar-akun.

Uji desktop: minta timer + checklist, jeda timer dan centang satu tugas, mulai ulang aplikasi, lalu pastikan status dipulihkan. Buat file TXT/MD/CSV dari percakapan, pilih folder, buka pratinjau dan tampilkan hasil di folder. Coba nama yang sudah ada, batal memilih folder, ubah/batalkan reminder, serta resize chat sambil kartu terbuka. Riwayat yang sedang dibaca tidak boleh ditarik ke bawah oleh pembaruan kartu. Windows tetap memerlukan uji visual pada perangkat Windows asli.


## Bubble notifikasi dalam pemakaian harian (mode revisi)

Pemeriksaan otomatis: `tests/companion-notifications.test.ts` mencakup timer selesai,
pengingat jatuh tempo, antrean prioritas/FIFO, deduplikasi, Jangan Ganggu, pemulihan
setelah restart, isolasi akun, pengingat dibatalkan/selesai/ditunda, balasan selesai
saat chat ditutup, konsumsi pesan ketika chat dibuka, dan durasi baca setelah reveal.

Untuk diuji sendiri: **Mode revisi → Tes bubble notifikasi** menutup chat lalu
menampilkan satu contoh bubble, tanpa memanggil model atau membuat pengingat asli.
Klik bubble untuk membuka pesan yang sama di chat. Pemicu sebenarnya: timer selesai,
pengingat jatuh tempo, atau balasan selesai/gagal ketika chat ditutup. Sapaan berkala
aktif hanya pada **Settings → Bito → Kebiasaan menyapa → Sesekali**, dengan jeda
minimal satu jam; tidak muncul ketika fokus, tidur, sibuk, atau Bito disembunyikan.

Saat beberapa peristiwa datang, hanya satu bubble tampil, dengan jeda singkat sebelum
berikutnya. Hover/drag menahan waktu baca; membuka chat mengonsumsi antrean di sana.
Jangan Ganggu, layar terkunci, tidur dan onboarding menunda tampilan. Event penting
tersimpan bersama riwayat per akun. Saat Bito disembunyikan, event penting mencoba
notifikasi sistem; sapaan santai tidak memunculkan kembali Bito. Notifikasi terjadwal
memerlukan aplikasi tetap berjalan; ketika aplikasi dibuka lagi, pengingat yang
terlewat diproses. Pengujian visual manual diserahkan ke pengguna pada revisi ini.


## Balasan beberapa bubble (mode revisi)

Satu permintaan model dapat memilih 1–4 bubble dengan pemisah internal. Paragraf,
email, tabel dan teks siap salin tetap satu bubble kecuali model memilih titik
pemisah percakapan. Parser melindungi fenced/inline code dan menahan pemisah yang
terbelah antar-chunk. Jeda antar-bubble 1,6–3,6 detik, dengan indikator mengetik sebelum bubble
berikutnya. Reduced motion mengurangi gerakan, bukan waktu mengetik percakapan. Stop membatalkan bubble yang masih antre.

`tests/reply-bubbles.test.ts` mencakup berbagai ukuran chunk, pemisah parsial,
Markdown, batas jumlah bubble, sinkronisasi UI/state, jeda, pembatalan, persistensi,
dan satu giliran history tanpa pemisah internal. Tes menggunakan stream lokal
buatan dan waktu terkontrol; tidak memanggil model atau menjalankan aplikasi manual.

Untuk dicoba sendiri: **Mode revisi → Tes balasan beberapa bubble** membuka chat
lalu mengirim contoh tiga bubble secara lokal, tanpa kuota AI dan tanpa tindakan.
Untuk AI sebenarnya, coba percakapan biasa atau minta balasan 2–3 bubble. Kartu hasil,
copy/save, retry, timestamp dan pemberitahuan balasan selesai tetap terikat ke satu
balasan utuh. Riwayat lama tetap ditampilkan seperti sebelumnya.


## Satu wadah animasi panel chat (mode revisi)

Panel putih sekarang memuat transcript, input, kartu hasil, menu dan pegangan resize
sebagai anak DOM. Satu clip-path/opacity pada parent mengendalikan enter/exit;
input tidak lagi memanjang atau fade memakai waktu terpisah. Tinggi panel terakhir
tertahan selama penutupan, dan hanya parent menandai animasi tutup selesai. Resize
serta pertumbuhan isi tetap menggunakan reflow yang sudah ada. Perpindahan bubble
notifikasi menunggu parent selesai terbuka; sapaan mandiri tetap di luar panel.

`tests/chat-panel-motion.test.ts` menguji arah kiri/kanan, ukuran compact, mask
parsial, posisi monitor negatif, serta hit regions supaya area yang belum terlihat
tidak mengambil klik. Unit terkait layout/reflow/sapaan dan typecheck lolos.
Tes visual buka-tutup cepat, menu, resize, dan perpindahan sapaan dilakukan pengguna;
agen tidak menjalankan pengujian aplikasi secara manual untuk revisi ini.
# Revisi Qwen dan gaya chat

- Tes otomatis provider memakai respons tiruan; tidak memakai key, kuota AI, atau UI manual: `node --import tsx --test tests/groq.test.ts tests/reply-bubbles.test.ts tests/companion-context.test.ts tests/preference-writer.test.ts`.
- Pemilik mencoba sendiri: Settings → Bito → Gaya bicara. Bandingkan sapaan pendek, giliran knock-knock tanpa spoiler, kabar senang, curhat tanpa solusi, dan permintaan faktual pada empat mode. Contoh adalah sasaran nada, bukan jawaban tetap.
- Balasan chat biasa harus terpisah per kalimat/paragraf, typing muncul antar-bubble, Stop membatalkan bubble yang belum dikirim. Email/kode/tabel/teks siap salin harus tetap utuh. Riwayat lama tetap menggunakan pengelompokan tersimpannya.
- Groq aktif ketika pemilik menyimpan `GROQ_API_KEY` di server dan tidak memaksa `BITO_AI_PROVIDER=gemini`. Tes live satu percakapan serta tindakan reminder dilakukan pemilik; adapter menguji alur tool/resume dengan mock.
