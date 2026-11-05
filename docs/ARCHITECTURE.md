# Arsitektur Bito — revisi demo privat

## Proses dan jendela

Main Electron (`electron/main.ts`) memiliki lifecycle, SQLite, kredensial, AI, timer, dialog file dan menu. Pet window, chat window dan studio window memakai renderer React. Preload hanya membuka API bertipe untuk perintah tertentu; tidak mengekspos Node atau IPC mentah.

Main memverifikasi bahwa pengirim IPC berasal dari top-level frame salah satu jendela milik Bito. Payload penting divalidasi Zod. Navigasi renderer dan popup eksternal diblokir. `contextIsolation`, sandbox dan CSP aktif. Tautan eksternal dibatasi http/https.

Login mendahului onboarding jika konfigurasi Supabase tersedia. `electron/cloud.ts` menjalankan SDK Auth di proses utama, membuka browser sistem dan menukar kode melalui PKCE. Callback hanya menerima localhost `127.0.0.1:43821` dengan path nonce sekali pakai. `electron/session-storage.ts` menyimpan sesi/verifier dengan enkripsi OS dan penulisan atomik. Tidak ada token di snapshot renderer. Penyimpanan OS yang tidak aman ditolak tanpa fallback plaintext.

Karakter dan chat memakai jendela transparan terpisah. Hit testing pet menentukan kapan event mouse boleh menembus desktop. Posisi chat dihitung pada work area monitor karakter. Posisi dipulihkan pada perubahan display dan resume.

## Data

### Bantuan layar tanpa mode terpisah (27 Oktober 2026)

Bantuan layar memakai dua jalur. Pertanyaan eksplisit dipercepat oleh `src/grounding.ts`; untuk permintaan tersirat, model dapat memilih tool `inspect_screen` berdasarkan tujuan, riwayat percakapan dan nama/judul aplikasi aktif. Contoh: “aku mau bikin daftar isi” tidak harus menyebut tombol atau highlight. Metadata dibaca satu kali saat permintaan chat, tanpa screenshot untuk obrolan biasa. Tool hanya ditawarkan kepada klien desktop yang mengiklankan kapabilitasnya; klien lama tetap memakai tujuh tool sebelumnya.

`ScreenGuide` membaca jendela eksternal melalui helper macOS CoreGraphics / Windows DWM. Pada macOS 14+, ScreenCaptureKit menangkap monitor aktif termasuk menu bar/popover dengan Bito dikecualikan. Windows 10 build 19041+ menangkap monitor dengan jendela Bito dikecualikan melalui content protection; versi lama memakai fallback ID jendela native yang cocok. Screenshot bersifat sementara, tidak ditulis ke disk, renderer, SQLite, log, job contents atau Storage. Penyedia AI memproses gambar sesuai kebijakan datanya.

Panduan berurutan menyimpan tujuan, instruksi terakhir dan hasil yang diharapkan di memori proses. Chat menutup, fokus dikembalikan sekali ke aplikasi asal, lalu overlay pasif menampilkan satu bubble dan sorotan. Sebelum chat menutup, bubble sudah menampilkan tiga titik mengetik selama pembacaan pertama maupun verifikasi berikutnya. Status thinking berubah menjadi instruksi dalam bubble yang sama; menunggu fokus menampilkan petunjuk klik, bukan indikator loading. Overlay tidak menerima klik atau mengambil fokus. Aktivasi aplikasi bersifat asinkron: composer disembunyikan dan dibuat nonfocusable, kemudian panduan menunggu fokus hingga 30 detik tanpa capture. Klik pengguna pada aplikasi asal melanjutkan sesi yang sama. Escape tetap aktif selama menunggu. Hasil awal dan alasan gagal diteruskan persis ke riwayat, tanpa putaran model yang dapat menambahkan instruksi spekulatif. Bito memakai instance Rive yang sama saat mendekati target.

Helper membaca aktivitas input dan elemen antarmuka terbatas: AX di macOS jika Accessibility telah diizinkan, UI Automation di Windows. Hanya nama, peran, status enabled dan posisi kontrol dibaca; nilai input/password tidak dibaca. Tanpa elemen native yang tersedia, model tetap memakai gambar. Perubahan aktivitas memicu pemeriksaan lokal; screenshot harus berubah dan stabil dua kali sebelum meminta AI. Saat diam atau klik tidak mengubah tampilan, AI tidak dipanggil. Satu pemeriksaan susulan diperbolehkan untuk transisi yang terlambat.

Penjelasan layar memakai respons `explanation` berisi maksimal lima area dengan teks, label, confidence dan bounding box yang divalidasi seperti target tunggal. Model membedakannya dari instruksi tindakan berdasarkan maksud pengguna. Satu bubble/sorotan ditampilkan per giliran; klik Bito melanjutkan, Esc mengakhiri. Setiap klik lanjut memeriksa ulang jendela, ukuran frame dan fingerprint terbaru sebelum memakai area berikutnya. Tidak ada pengambilan gambar saat pengguna diam membaca atau panggilan model tambahan per bagian. Jika layar berubah, tur berhenti dan meminta pembacaan baru. Tur memakai snapshot saat permintaan, bukan pemantauan layar terus-menerus.

Endpoint `ground` memverifikasi JWT dan allowlist pada setiap request. Inspeksi pertama dari `inspect_screen` memakai lease chat melalui RPC `bito_screen_observation`. Setelah panduan dimulai, aplikasi membatalkan job chat yang menunggu tool untuk melepas lease, tanpa jawaban model tambahan. Langkah berikutnya memakai request grounding tersendiri. Tidak ada transaksi database yang menunggu API gambar dan tidak ada perubahan izin tabel untuk fitur ini.

Gemini mengembalikan jawaban singkat, box, ID elemen bila tersedia, status `waiting/advanced/done/blocked`, bukti perubahan dan hasil yang diharapkan. Desktop memvalidasi schema, confidence, koordinat, ID kandidat dan kesesuaian dengan gambar. `advanced/done` memerlukan bukti serta confidence minimal 0,9. Klik saja tidak dianggap langkah selesai. Menu/popover baru pada aplikasi yang sama boleh menjadi langkah berikutnya. Sebelum menunjuk, gambar, aktivitas, elemen dan frame diperiksa ulang; hasil terlambat dibuang.

Pergantian aplikasi menjeda panduan tanpa menangkap aplikasi lain atau mengambil fokus kembali. Escape, membuka chat (di luar tur penjelasan), drag, logout, sleep/lock dan perubahan monitor membatalkan sesi. Sesi dibatasi 15 menit, 40 langkah atau 80 pemeriksaan AI sebagai batas pekerjaan; ini bukan kuota chat akun. Selesai/gagal menampilkan satu bubble akhir sebelum Bito kembali ke posisi asal. Konteks follow-up teks maksimal enam turn selama tiga menit tetap tersedia untuk pertanyaan lanjutan manual pada jendela/aplikasi yang sama.

Pemulihan sesi mempertahankan baseline sebelum pindah aplikasi: kembali tanpa perubahan memulihkan sorotan yang sudah divalidasi; kembali sekaligus membuka menu memverifikasi perubahan itu terhadap hasil yang diharapkan. Stabilitas diperiksa pada piksel, elemen native dan frame tangkapan. Jika tampilan berubah saat AI menjawab, koordinat dibuang dan satu verifikasi ulang diizinkan setelah stabil; tidak ada putaran AI tanpa batas. Timer, callback dan hasil milik sesi lama tidak boleh membatalkan atau mengubah sesi pengganti. Karakter dibuat nonfocusable selama panduan dan dikembalikan ke pengaturan sebelumnya saat berhenti. Setiap instruksi lanjutan, bagian penjelasan dan alasan gagal diteruskan persis ke riwayat chat, tanpa menduplikasi instruksi awal atau status sementara.

Percepatan panduan (29 Oktober 2026): selama panduan aktif, macOS AXObserver mengirim sinyal perubahan tanpa teks/piksel; pengamatan berkala tetap menjadi fallback. Pengamatan dipercepat saat tampilan sedang stabilisasi, tetap memerlukan dua observasi stabil. Hanya satu pemeriksaan berjalan pada satu waktu; sinyal yang datang bersamaan digabung, dan observer dilepas saat panduan berhenti. Sorotan dan bubble tidak lagi menunggu animasi perjalanan karakter selesai.

AI boleh mengusulkan satu intent menu lanjutan (`nextMenu`), tanpa koordinat masa depan. Jalur lokal hanya menerima nama menu yang cocok persis, unik, aktif, berada di bawah trigger yang sama, pada jendela/PID yang sama, dan lolos hit-test OS. Elemen tersembunyi, tertutup, ambigu, atau pohon aksesibilitas yang tidak mendukungnya kembali ke pemeriksaan model. Jalur ini tidak mengklik atau menyatakan tugas selesai. Screenshot dan elemen diperiksa lagi sebelum sorotan ditampilkan. Cache per sesi maksimal 12 hasil selama dua menit, memakai hash piksel/tampilan/frame/tujuan/instruksi terakhir/gaya dan validasi target native terkini. Tidak ada cache koordinat lintas aplikasi atau penyimpanan screenshot ke disk.

Diagnostik internal menyimpan maksimal 80 sampel durasi metadata, aksesibilitas, capture, keputusan lokal/model dan paint sorotan. Sampel hanya angka, nama tahap dan jenis jalur; tidak berisi pertanyaan, nama jendela, gambar atau secret. Belum ada pengukuran latensi penggunaan nyata; angka kinerja perlu diukur pada perangkat pengguna. Jalur lokal menu saat ini khusus macOS; platform lain mempertahankan pemeriksaan AI.

Batas dukungan: macOS/Windows, satu monitor per target. Sistem lama memakai tangkapan jendela sehingga menu bar sistem bisa tidak tercakup. Windows helper disertakan tetapi belum diuji pada Windows nyata. Ketepatan model dan kelancaran visual harus diuji pengguna. Tidak ada klik/ketikan otomatis atau shortcut seleksi area Fn+Control pada tahap ini. Linux mendapat penjelasan keterbatasan tanpa menangkap sumber berbeda.

`Store` memakai `node:sqlite` bawaan Electron. Saat ini satu baris dokumen state JSON di SQLite dengan WAL dan update atomik. Ini cukup untuk prototype lokal berukuran kecil; riwayat chat dibatasi 500 pesan. Untuk skala lebih besar, pisahkan pesan/tugas/pengingat ke tabel dan migrasi berversi.

SQLite menyimpan profil, pengaturan non-rahasia, pesan, memori, checklist, pengingat dan deadline fokus di `accounts/<user-id>/bito.sqlite`. Penggantian akun menunggu request aktif berhenti, menutup jendela lama dan mengganti Store sebelum menampilkan akun berikutnya. Riwayat tidak disinkronkan antarperangkat. Data revisi lama di `bito.sqlite` dipertahankan terpisah. Tabel `tool_receipts` menyimpan hasil atau status belum pasti dari tindakan lokal untuk mencegah pengulangan efek samping.

## AI dan tindakan

Proses utama memanggil Supabase Edge Function `bito-api` dengan session JWT pengguna dan konfigurasi publik proyek. `supabase/functions/_shared/handler.ts` memvalidasi token melalui Auth dan keanggotaan aktif pada SETIAP request; tidak mempercayai ID/email dari renderer. Gemini key berada hanya di secrets fungsi. `electron/ai.ts` adalah adapter OpenAI lama yang tidak lagi dipanggil dari aplikasi utama.

`bito_reserve` menyatukan pemeriksaan izin, idempotensi, lease dan pencatatan pemakaian dalam satu transaksi PostgreSQL dengan advisory lock. Tidak ada kuota jumlah chat harian/per menit di aplikasi; pemanggilan model tetap dicatat untuk pemantauan. Tabel/RPC tidak bisa diakses anon/authenticated; operasi server memakai kredensial privileged yang tidak dibundel ke aplikasi. Penonaktifan member membatalkan job dan membersihkan konteks tersimpan melalui trigger.

`gemini.ts` memanggil `streamGenerateContent` model `gemini-3.8-flash`, meneruskan teks SSE dan menyimpan part/signature opaque untuk kelanjutan tool. Tidak memakai retry provider atau fallback berbayar. Maksimum empat putaran, konteks 24.000 karakter, anggaran 4.096 token termasuk thinking/putaran, thinking `low`, timeout 85 detik. Pesan rusak/terpotong dibedakan dari respons selesai. Stop membatalkan stream dan mengirim cancel terpisah ke backend.

Tindakan memakai dua request terpisah: server menyimpan job `waiting` dan mengirim daftar call → aplikasi memvalidasi parameter, memilih lokasi bila diperlukan, menjalankan aksi lokal dan mencatat receipt → aplikasi mengirim hasil dengan identitas akun/perangkat/job/round yang sama → server melanjutkan model. Fungsi tidak menunggu dialog native. Hasil call yang salah/ganda atau job kedaluwarsa ditolak. Konteks dihapus saat selesai; record lama dibersihkan saat request selanjutnya setelah satu hari.

Tool saat ini `start_focus`, `create_reminder`, `add_task`, `remember_note`, dan `create_folder`. Folder hanya satu anak dari lokasi pilihan pengguna; nama lintas-platform divalidasi, tidak menerima path dari model dan tidak menimpa objek yang ada. Tidak ada shell, kontrol komputer bebas, web search, kalender, konversi dokumen atau pengiriman pesan eksternal. Instruksi model melarang klaim kemampuan/tindakan yang belum tersedia dan meminta memori hanya saat diminta pengguna.

## Animasi

Rive memegang animasi karakter. UI memetakan aktivitas ke ViewModel1. Drag mengalahkan tidur/fokus/thinking. Konteks tidur menonaktifkan thinking/fokus visual. Render karakter dan permukaan chat terpisah, sehingga delta jawaban tidak merender ulang pet window.

## Distribusi

Vite membangun renderer. esbuild membundel main/preload menjadi CJS. electron-builder membuat paket. GitHub Actions membangun macOS dan Windows secara terpisah dan menyimpan artefak privat.

Build hanya memuat Project URL dan publishable key publik; rilis tag membutuhkan kedua repository Variables tersebut. Gemini/OAuth/service-role secrets tidak masuk build. Belum ada sertifikat distribusi/notarization, sinkronisasi riwayat, crash reporting atau auto-update. Backend sudah tersedia sebagai source dan perlu di-deploy ke proyek pemilik sebelum tes live. Jangan menyebut pengujian lokal sebagai bukti deployment atau verifikasi Windows. Lihat langkah konfigurasi pemilik di README.

## Onboarding handoff (0.2)

`src/Onboarding.tsx` mengukur slot canvas, mengelola form tiga langkah, dan mengirim batas slot dalam koordinat content CSS. `src/handoff.ts` memetakan ke DIP native serta menghitung drop dan interpolasi posisi. Main process hanya menerima perintah onboarding dari studio; readiness dan pembatalan gesture hanya dari pet.

Sesi presentation bersifat sementara, tidak masuk SQLite. Satu pet window/Rive dipanaskan sebelum tampil lalu di-anchor sebagai child studio. Selama onboarding, pet tetap mouse-pass-through dan nonfocusable; slot di studio menerima gesture langkah ketiga serta mengirim drag IPC. Saat drag parent dilepas dengan bounds yang sama; saat drop berhasil profil, ukuran, dan posisi disimpan sebelum studio fade/close. Pembatalan perkenalan mengembalikan bounds/visibility sebelumnya. Render teks tidak mengirim IPC per kata: hanya start/stop bicara. Aset Rive dan canvas tetap hidup pada perpindahan.

## Percakapan dan tracking (0.4)

Transcript tetap berjangkar di bawah. Setiap turn memakai animasi tinggi untuk entrance/exit sehingga riwayat bergerak sebagai satu aliran. `ConversationCadence` menggantikan pekerjaan tertunda saat navigasi berubah; pesan tujuan mempunyai revision key sendiri untuk replay tanpa mereset pesan yang dipertahankan. Identitas pemilik speech mencegah cleanup pesan lama mematikan animasi pesan baru.

Main membaca cursor native dalam DIP, mengirim gaze terpisah 30 Hz ke renderer pet hanya selama langkah 1–2/fokus aktif. `eye-rig.ts` mengakses dua pupil bernama pada artboard Rive 2.45 yang dipin, menghaluskan target tiap frame, dan melepaskan kontrol sesudah kembali netral. File ekspor asli dicadangkan; tahap persiapan aset hanya memulihkan nama kedua pupil dan memverifikasi fingerprint sumber.

Tag versi menjalankan tes/build kedua OS. Job release baru memublikasikan checkpoint setelah lima installer dan manifest checksum lengkap. Build lokal terpisah di `release/<versi>`; mode revisi memakai `.bito-dev-data` yang diabaikan Git.

## Suara companion

Suara companion memakai satu sumber `src/bito-voice.ts`: arahan percakapan untuk Gemini dan jalur AI lokal, dialog onboarding, pilihan gaya, sapaan desktop, serta pesan timer. Prompt memisahkan contoh kalibrasi nada dari riwayat percakapan sebenarnya; contoh bukan pencocokan kata kunci atau jawaban tetap. Hangat/Tenang/Langsung adalah titik awal yang dapat menyesuaikan bahasa, kebutuhan, dan permintaan pengguna. Pengaturan gaya tidak menambahkan panggilan model terpisah. Pembatasan tool, hasil tindakan yang harus terverifikasi, izin memori eksplisit, dan konteks akun tetap berlaku.

## Kartu hasil yang dapat ditindaklanjuti

`Message.cards` menyimpan discriminated union timer/reminder/checklist/file, bukan HTML buatan model. `rich-actions.ts` menghasilkan metadata kartu dari ID objek lokal yang benar-benar dibuat, lalu menyimpan receipt sebelum meneruskan hasil teks ke backend. Renderer `ResponseCards` mengirim operasi terbatas dengan message/card ID; proses utama memeriksa keanggotaan kartu dalam percakapan akun aktif dan kecocokan objek. Timer memakai deadline wall-clock dengan pembaruan lokal renderer, tanpa menulis SQLite setiap detik.

`file-output.ts` memvalidasi nama, format dan ukuran teks; native folder picker menentukan parent. Penulisan eksklusif mencegah overwrite dan symbolic link. Tabel SQLite lokal `file_outputs` menyimpan lokasi serta identitas file untuk aksi pratinjau/buka/reveal. Lokasi tidak dikirim ke model atau renderer. Pemeriksaan identitas menolak file yang sudah dihapus atau diganti. Ini belum merupakan sandbox eksekusi artifacts bebas: output hanya komponen aplikasi yang telah ditentukan.

### Companion notification delivery

`electron/companion-notifications.ts` captures due reminder/timer events and completed
background replies as assistant messages with notification metadata. Event source IDs
make retries idempotent; event flags and messages are persisted in the same local
account state. Presentation consumes one pending notice at a time through the existing
floating-bubble renderer and morph handoff. Opening chat consumes remaining pending
notices without creating duplicate transcript entries. Obsolete reminders and casual
check-ins are retired; DND and setup/drag/lock state gate presentation. Important events
use a system notification fallback only while the pet is hidden. No model request is
needed to announce a timer, reminder, completed reply, or opt-in check-in.

### Sequential reply bubbles

A reply remains one persisted Message, request ID, tool/card owner, and model history
turn. Optional `bubbles` stores its visual segments; `text` is the canonical plain
Markdown joined with blank lines. The voice prompt may select boundaries using
`[[BITO_BUBBLE]]`. `splitReplyBubbles` removes transport controls incrementally,
protects code, and bounds a reply to four visible bubbles without dropping overflow.
`createReplyDelivery` serializes segment delivery from the same network stream,
including cancellable pauses. Snapshot replyActivity coordinates typing/talking;
first text and phase changes publish atomically to preserve the typing bubble's key.
No extra inference is required for splitting, pacing, or the revision-only preview.

## Gemini 3.8 Flash dan pengendalian biaya (26 Oktober 2026)

Provider default adalah Gemini 3.8 Flash. Groq tetap tersedia lewat `BITO_AI_PROVIDER=groq` secara eksplisit, tanpa fallback otomatis. Secret key ada di server; semua anggota demo menggunakan koneksi bersama yang sama. Adapter tidak mengirim sampling parameters lama, menyimpan thought signatures untuk tool resume, dan menghitung token jawaban + thinking dalam `demo_usage.output_tokens`.

Kuota chat harian/per menit serta batas global dua pengguna dihapus dari `bito_reserve`. Membership, RLS, idempotency per akun/perangkat, lease dan validasi hasil tindakan tetap berlaku. Kolom quota lama hanya tersisa untuk kompatibilitas. Cost control dipasang pemilik di AI Studio project spend cap; angka pemakaian internal bukan tagihan resmi dan request yang gagal sebelum selesai belum tentu memiliki token usage lengkap.
