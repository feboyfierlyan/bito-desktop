# Arsitektur Bito 0.1

## Proses dan jendela

Main Electron (`electron/main.ts`) memiliki lifecycle, SQLite, kredensial, AI, timer, dialog file dan menu. Pet window, chat window dan studio window memakai renderer React. Preload hanya membuka API bertipe untuk perintah tertentu; tidak mengekspos Node atau IPC mentah.

Main memverifikasi bahwa pengirim IPC berasal dari top-level frame salah satu jendela milik Bito. Payload penting divalidasi Zod. Navigasi renderer dan popup eksternal diblokir. `contextIsolation`, sandbox dan CSP aktif. Tautan eksternal dibatasi http/https.

Karakter dan chat memakai jendela transparan terpisah. Hit testing pet menentukan kapan event mouse boleh menembus desktop. Posisi chat dihitung pada work area monitor karakter. Posisi dipulihkan pada perubahan display dan resume.

## Data

`Store` memakai `node:sqlite` bawaan Electron. Saat ini satu baris dokumen state JSON di SQLite dengan WAL dan update atomik. Ini cukup untuk prototype lokal berukuran kecil; riwayat chat dibatasi 500 pesan. Untuk skala lebih besar, pisahkan pesan/tugas/pengingat ke tabel dan migrasi berversi.

SQLite menyimpan profil, pengaturan non-rahasia, pesan, memori, checklist, pengingat dan deadline fokus. API key berada di file terenkripsi OS, tidak dalam state atau ekspor. Mengganti endpoint menghapus key lama agar tidak otomatis terkirim ke host lain.

## AI dan tindakan

`electron/ai.ts` melakukan streaming Responses API, meneruskan delta teks, mengirim hasil tool ke iterasi berikutnya, membatasi loop empat putaran dan mendukung AbortController. History aktif dibatasi 32 pesan, masing-masing maksimal 24.000 karakter. `store:false` dipakai pada request.

Tool hanya `start_focus`, `create_reminder`, `add_task`, dan `remember_note`. Tidak ada arbitrary shell, kontrol komputer, pembacaan file otomatis atau pengiriman pesan eksternal. File dibuka dan disimpan melalui dialog pilihan pengguna. Memori otomatis hanya diminta ketika pengguna secara eksplisit meminta diingatkan/disimpan dalam percakapan.

## Animasi

Rive memegang animasi karakter. UI memetakan aktivitas ke ViewModel1. Drag mengalahkan tidur/fokus/thinking. Konteks tidur menonaktifkan thinking/fokus visual. Render karakter dan permukaan chat terpisah, sehingga delta jawaban tidak merender ulang pet window.

## Distribusi

Vite membangun renderer. esbuild membundel main/preload menjadi CJS. electron-builder membuat paket. GitHub Actions membangun macOS dan Windows secara terpisah dan menyimpan artefak privat.

Belum ada sertifikat distribusi/notarization, server Bito, sinkronisasi cloud, crash reporting atau auto-update. Jangan menyebut prototype ini telah teruji produksi. Pengujian manusia di kedua OS dan evaluasi mahasiswa tetap diperlukan.


## Onboarding handoff (0.2)

`src/Onboarding.tsx` mengukur slot canvas, mengelola form tiga langkah, dan mengirim batas slot dalam koordinat content CSS. `src/handoff.ts` memetakan ke DIP native serta menghitung drop dan interpolasi posisi. Main process hanya menerima perintah onboarding dari studio; readiness dan pembatalan gesture hanya dari pet.

Sesi presentation bersifat sementara, tidak masuk SQLite. Satu pet window/Rive dipanaskan sebelum tampil lalu di-anchor sebagai child studio. Pada langkah ketiga window menjadi interaktif. Saat drag parent dilepas dengan bounds yang sama; saat drop berhasil profil, ukuran, dan posisi disimpan sebelum studio fade/close. Pembatalan perkenalan mengembalikan bounds/visibility sebelumnya. Render teks tidak mengirim IPC per kata: hanya start/stop bicara. Aset Rive dan canvas tetap hidup pada perpindahan.
