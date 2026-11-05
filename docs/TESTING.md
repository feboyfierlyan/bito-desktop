# Panduan mencoba Bito

## Bantuan layar — revisi 27 Oktober

Fixture penjelasan layar mencakup validasi maksimal lima area, confidence/box tidak sah, satu area per giliran, klik Bito untuk lanjut/selesai tanpa panggilan AI baru, layar berubah, Esc, alasan error aman, dan bubble mengetik yang sudah tampil sebelum chat menutup. Pengujian ini memakai gambar dan jendela tiruan; tidak membuktikan ketepatan model live.

Saat bantuan layar pertama dipakai di macOS, Bito mengecek lalu meminta izin Aksesibilitas melalui API resmi jika belum diizinkan. Pengguna tetap mengaktifkannya sendiri di Pengaturan Sistem. Nama pada mode revisi dapat tampil sebagai Electron. Permintaan tidak diulang dalam sesi yang sama; pembacaan gambar tetap menjadi fallback ketika izin belum diberikan. Fixture menguji permintaan satu kali dan pengiriman ulang setelah izin diberikan, tanpa membuka pengaturan atau mengubah izin OS selama tes.

Tes otomatis `grounding.test.ts`, `screen-guide.test.ts` dan `screen-assistance.test.ts` memeriksa routing chat vs pertanyaan layar, pemetaan box pada monitor negatif/retina, posisi karakter, validasi JSON/confidence, perubahan isi/frame jendela, pembatalan saat drag, click-through tanpa fokus, izin layar, autentikasi/allowlist dan screenshot yang tidak disimpan. Tes juga mensimulasikan ID Electron hilang, thumbnail kosong, fallback sumber native/jendela, koordinat menu bar, sumber tangkapan kedua putus, konteks follow-up dan pergantian aplikasi. Helper Swift dikompilasi universal arm64/x86_64; capture layar nyata dan ketepatan model belum diuji manual oleh agen. Windows helper disertakan, tetapi belum diuji visual di Windows. Tes tambahan memakai provider/capture tiruan untuk alur permintaan tersirat → tool → pembacaan → sorotan → jawaban lanjutan; obrolan biasa tanpa capture; kapabilitas klien lama; JSON hasil panjang; izin/perangkat/round/call yang salah, replay dan pembatalan. Tes PostgreSQL lokal memeriksa perebutan lease paralel dan akumulasi token observasi.

Untuk uji visual oleh pengguna: buka dokumen/editor lalu kirim “bantu aku bikin daftar isi di dokumen ini”. Chat harus menutup, satu bubble pasif memberi langkah, sorotan menerima klik tembus ke aplikasi dan Bito mendekat. Setelah menu terbuka, panduan memverifikasi tampilan baru lalu menunjukkan kontrol berikutnya. Coba salah klik, klik tanpa perubahan, menu/popover baru, loading lambat, berpindah aplikasi, Escape dan drag. Idle tidak memanggil AI. Membuka chat membatalkan panduan. Chat biasa tidak mengambil gambar. Ini bantuan baca/tunjuk, bukan klik otomatis; shortcut seleksi area belum termasuk.

Tes fixture juga memeriksa aktivasi aplikasi yang terlambat, menunggu tanpa capture, klik aplikasi yang melanjutkan request yang sama, Escape saat menunggu, serta alasan gagal yang sama persis di bubble dan riwayat tanpa jawaban model tambahan. Tes fixture panduan berurutan mencakup gerbang aktivitas + dua frame stabil, perubahan menu kecil, elemen native palsu/nonaktif/di luar frame, bukti langkah, salah klik, satu bubble, pergantian aplikasi, hasil terlambat, Escape, selesai dan pelepasan lease chat sebelum pemeriksaan berikutnya. Helper macOS dikompilasi tanpa dijalankan pada layar nyata; UI Automation/capture Windows perlu pemeriksaan pengguna di Windows.

## Sebelum mulai

Regresi pemulihan panduan (28 Oktober 2026): fixture memeriksa kembali ke aplikasi tanpa perubahan versus kembali sambil membuka menu; stabilitas elemen native dan frame selain piksel; pemulihan fokus karakter; callback abort/hasil dari sesi yang telah diganti; satu verifikasi ulang otomatis sesudah hasil kedaluwarsa tanpa loop AI; kesamaan instruksi lanjutan/error pada bubble dan riwayat; serta ID native yang tidak dapat dipastikan tidak menghasilkan instruksi klik palsu. Semua pemeriksaan menggunakan host Electron dan provider tiruan, tanpa interaksi desktop atau request AI live.

Regresi percepatan (29 Oktober 2026): fixture memeriksa notifikasi native saat RPC menunggu, token observer lama, burst event selama inferensi, pelepasan observer saat pembatalan, perubahan UI tanpa klik, serta intent menu yang diteruskan tanpa request model kedua. Kasus negatif mencakup item tertutup/nonaktif/duplikat, parent/PID/jendela yang berubah, cache kedaluwarsa atau berbeda piksel/tujuan/gaya, dan hasil tidak pasti/selesai yang tidak boleh dipakai ulang. Instruksi harus sudah tersedia sebelum perjalanan Bito berakhir. Seluruh tes dijalankan dengan `node --import tsx --test --test-reporter=spec tests/*.test.ts`: 192 lolos, 1 tes database opsional dilewati. Pemeriksaan TypeScript dan kompilasi helper universal/main lolos. Backend bito-api versi 20 cocok dengan bundle lokal; request tanpa login tetap ditolak (401), tanpa request Gemini. Tidak ada tes manual desktop oleh agen.

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
- Groq aktif jika pemilik memilih `BITO_AI_PROVIDER=groq`; default adalah Gemini 3.8 Flash. Tes live satu percakapan serta tindakan reminder dilakukan pemilik; adapter menguji alur tool/resume dengan mock.

## Gemini 3.8 Flash / quota-free demo

- `tests/gemini.test.ts` memeriksa endpoint/key header, thinking low, streaming bubble, token thinking, tool/signature resume, stop, final round dan kegagalan tanpa retry memakai respons tiruan.
- `tests/private-demo-db.test.ts` menerapkan migrasi terbaru pada database lokal sementara, memastikan legacy quota tidak memblokir tiga akun sekaligus serta akses, revocation dan idempotency tetap bekerja.
- Tidak ada tes UI manual atau request AI live oleh agen untuk revisi ini. Pemilik mencoba percakapan dan tindakan di aplikasi sesudah backend terunggah.

Verifikasi revisi 26 Oktober 2026: typecheck aplikasi dan Deno backend lolos; 36 tes provider/cloud/bubble lolos; 9 tes database lokal sementara lolos. `bito-api` versi 13 ACTIVE dan isi deployment cocok dengan bundle yang diperiksa. Pemeriksaan SQL remote memastikan kuota dihapus, akses RPC khusus server, dan duplicate/member checks tetap ada. Request remote tanpa login ditolak HTTP 401. Respons AI live dari aplikasi dilakukan pemilik. Tidak ada build installer atau push rilis pada revisi ini.

Pencarian web: `tests/web-search.test.ts` memeriksa pemilihan tool server, chat satu request, kueri tanpa profil/riwayat, metadata sumber, sitasi, pemakaian token tiga tahap, pembatalan, hasil tanpa bukti, serta tindakan lokal campuran yang ditunda tanpa side effect ganda. `tests/cloud.test.ts` memeriksa transport activity/sumber dari backend sampai klien, menyimpan konteks tool lengkap sebelum menerbitkan sumber, dan tidak membocorkan key. Tes ini memakai penyedia palsu; tidak membuktikan relevansi hasil Google secara live.

## Sapaan tugas proaktif

`tests/project-companion.test.ts` menguji saran berbasis rencana yang disetujui,
checkpoint, hambatan, tenggat, dan laporan hasil nyata. Termasuk jam lokal/semalam,
DND, mode tenang, snooze, sesi terbuka, kedaluwarsa, perubahan rencana, klik ganda,
isolasi akun, deduplikasi, serta anggaran frekuensi yang tetap tersimpan setelah restart.
Scheduler tidak memanggil model atau memantau isi layar. Task tidak selesai hanya
karena waktu sesi habis; laporan pengguna tetap diperlukan.

Untuk dicoba sendiri tanpa menunggu: siapkan tugas dengan rencana aktif dan tanpa
sesi terbuka, lalu **Mode revisi → Tes sapaan tugas**. Tombol **Mulai 15 menit**
membuka ringkasan dan memulai sesi tugas yang ditawarkan. **Lihat tugas** membuka
ringkasan tanpa sesi; **Nanti** menjeda saran tugas minimal satu jam. Preview tidak
menghabiskan anggaran saran otomatis dan tetap menghormati DND/jam menyapa.

Settings → Bito → Teman nugas mengatur bantuan tugas, frekuensi (maksimal 2 atau
3 tawaran per hari), dan jam lokal. Mode tenang mematikan semua sapaan otomatis.
Normalnya ada jeda startup/kembali aktif 45 detik dan jeda interaksi/edit tugas
dua menit. Saran otomatis hanya tampil saat aplikasi berjalan, Bito terlihat,
komputer aktif, dan tidak sedang chat, mengatur proyek, fokus, atau memakai panduan
layar. Saran yang tidak relevan tidak diantrekan untuk mengejar pengguna nanti.
Pengujian visual dan pengalaman dilakukan pengguna; agen hanya menjalankan cek otomatis.


## Task flow redesign · 4 November 2026

This revision follows the user's updated instruction: the agent runs interaction and visual checks itself. `tests/ui/index.html?surface=projects` is a DEV-only browser fixture using production components and the preview command handler. It seeds isolated browser data and does not modify the Electron account database.

Automated coverage includes real Astryx composer input, failed-save retention, duplicate-submit protection, explicit discard, project/section capture, individual dates, priority metadata, stale versions, atomic deadline validation, progress preservation, and preservation of task metadata during AI plan revision.

Browser checks covered global and inline capture, date shortcuts/calendar selection, project/section selection, task completion/reopening, task visibility in schedule/priority, Escape and continue editing, project navigation, and 1280px/800px layouts. Calendar/AI transport tests use mocks; this is not a claim of a live Google account or AI request.

### 5 November 2026 — project layout and custom groups

- Agent exercised the production components in the disposable browser fixture at 1280×900 and 800×700: project menu → details, Escape focus return, create empty group → rename → add a P1 task, and the priority directory. Header/back button vertical centers matched; popover bounds stayed inside the viewport; narrow layout stacked the context rail below tasks without horizontal overflow.
- Focused text input and selector were inspected in the browser: no outline or box-shadow glow. Sidebar Ngobrol and workspace close action are removed. Calendar and progress render alongside the list without view tabs.
- Regression suite: 362 tests, 361 passed, 1 skipped; production build passed. Group tests cover SQLite reopen, preserved existing tasks, version checks, draft/read-only rejection, group limits and adding to an unplanned project. Empty groups do not appear completed in calendar/roadmap summaries.
- UI proof: `/tmp/bito-ui-proof/project-revision.jpg`. Browser fixture uses disposable state; external services and native desktop handoff were not re-tested in this revision.

### 5 November 2026 — whole-app audit follow-up

- Mobbin research and implementation decisions are recorded in `DESIGN_SYSTEM.md`. The shared Astryx foundation remains in use.
- New real-component regressions check that the sidebar creates projects, group creation has one entry even with its menu open, inline tasks have a fixed destination, and a single progress observation does not produce an empty history chart. Archive tests verify that viewing an archive sends no restore/select command, its controls are disabled, and explicit restoration issues the expected commands.
- Agent-operated browser checks covered project gallery, grouped tasks, inline creation, project detail/menu, pre-archived read-only content, priorities, weekly schedule, quick tasks, new-project input, settings pages, reminders, login and all three onboarding steps. Project layout/menu were inspected at 1280×900 and 800×700; chat at 540×740. No user manual testing was requested.
- Chat text and composer position remained unchanged while opening its project selector. Computed styles were checked through all seven input/container layers after removing the remaining focus glow. Settings navigation was tested with an invalid empty name (stays on the current page with an error), then a valid name (saves and navigates).
- Native Electron check used `/tmp/bito-audit-native`, a separate temporary database, and a build with cloud/Calendar configuration disabled. The agent completed onboarding, dragged Bito from step three, observed the onboarding window transition to the desktop pet, and opened chat by clicking the pet. The temporary process was stopped after testing. This does not involve the user's account database.
- Final regression suite: **364 tests; 363 passed, 1 skipped, 0 failed**. TypeScript and production build passed. The existing Vite bundle-size warning remains. The suite needed loopback-listener access for mocked OAuth/Calendar callbacks; no live Google or AI request was made.
- Direct clicking of the archive action was rejected by automatic approval review. The safe alternative was a pre-archived disposable fixture plus component tests, not a retry against an active project.
- UI evidence: `/tmp/bito-audit/after-project.png` and `/tmp/bito-audit/native-pet.png`. Browser preview is not evidence for real OAuth, network failures, or OS permission prompts; these remain covered by mocked/domain tests where available.


### 2026-11-05: chat drafts, compact controls and onboarding release

- Real macOS Electron, fresh isolated profile: first area drag opens chat, includes a crop thumbnail, and typing works immediately without a second selection. Draft capture was removed without sending desktop pixels.
- Browser fixture with synthetic Bito image: attaching leaves zero user messages; text can be edited before Send; Send moves the attachment to message history and clears the composer. Menus remain overlays: measured compact panel height stays 105px before/after opening the project selector at a 320px viewport. Preview rail uses untransformed height to avoid overlapping the project label during motion.
- Thinking overlay visually checked: 68×44px rather than the text bubble's 300×210 placement estimate.
- Automated regressions cover first drag/new-session reset, empty-question crop staging, one-shot consumption, deferred image analysis, failed-send draft retention, original-byte isolation, scope/expiry, compact docking and real native release interpolation (including reduced motion).
- Live screenshot-to-cloud submission was not performed: automatic approval review rejected sending a desktop crop. Send behavior was checked with synthetic data and local fixtures instead.

Final verification: 371 tests, 370 passed, 1 existing private-database integration test skipped. Production build and TypeScript check passed. Native onboarding release also has an isolated main-process test that samples the actual window bounds through the 460ms interpolation and checks the final 180 setting, stable foot anchor and reduced-motion endpoint.

### 2026-11-05 — release morph and full-disk recovery

The onboarding release now animates a fixed Rive canvas with a compositor transform for 560 ms. Main waits for the renderer's final-frame acknowledgement before committing the native window once; stale/duplicate acknowledgements are ignored and reduced motion completes immediately. `PetArtwork` keeps the same 320 px layout/buffer on desktop, avoiding the final canvas reallocation. The local release fixture measured 35 frames, 34 distinct widths, and one unchanged 1056×1056 backing buffer. The user also confirmed the revised motion is smooth.

`state-persistence.test.ts` forces a real SQLite `SQLITE_FULL` condition with a page limit: save errors remain recoverable, previous saved data remains readable, and the latest pending state saves after capacity returns. Native position saves now publish a persistent storage warning and retry instead of throwing out of a drag callback. Disk space on this machine remains low; only regenerable caches in old temporary QA profiles were removed (182 MiB), not databases or personal files.

## Release 0.6.0 preview verification — 2026-11-05

Run the full database suite with a disposable loopback PostgreSQL database named
`bito_test_*` through `BITO_TEST_DATABASE_URL`. CI provisions PostgreSQL 17 and
blocks desktop packaging when this check fails. The local release pass executed
388 tests with zero skipped tests. Security regressions cover unexpected model
screen tools and raw-path attachment requests; regular-file reads are bounded.

Real integration verification used the existing encrypted account session and
synthetic input only: authenticated membership, streamed AI reply, image material
analysis, region grounding, and an explicitly authorized Calendar event create,
read-back and delete. This verifies the API path, not a fresh Google consent flow
on every packaged OS. No user screen contents were uploaded. Native Windows and
Intel UI/upgrade verification and distribution signing remain preview limitations.
