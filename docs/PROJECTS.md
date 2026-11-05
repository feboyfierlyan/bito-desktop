# Ruang Proyek Bito

Bito bisa menemani pekerjaan yang berlangsung beberapa hari atau bulan. Setiap
proyek punya tujuan, bahan, rencana, progres, titik lanjut, dan percakapan sendiri.

## Mencoba di mode revisi

1. Klik kanan Bito, lalu pilih **Proyek**. Menu di kolom chat juga menyediakan
   **Proyek**.
2. Pilih **Proyek baru**. Cukup isi nama dahulu, atau tambahkan gambaran tugas,
   hasil akhir, tenggat, dan waktu yang tersedia.
3. Di tab **Pemahaman** atau **Bahan**, tambahkan instruksi tugas atau catatan.
   Setelah unggah, Bito menyiapkan pemahaman untuk dikonfirmasi.
4. Bito menanyakan informasi penting yang belum jelas, kemudian menyimpan draf
   milestone. Tinjau tanggal, estimasi, dan kriteria selesai. Edit atau tambahkan
   langkah sebelum menekan **Setujui rencana**.
5. Ubah status langkah, atau laporkan kemajuan lewat chat. Coba “aku sudah selesai
   membaca bagian metode, besok lanjut bandingkan sensor”. Saat kembali, coba
   “lanjut yang kemarin” atau “aku punya 20 menit”.

Pilihan proyek aktif juga berlaku untuk chat desktop. Pilih **Obrolan umum**
untuk keluar dari konteks proyek. Mengarsipkan proyek menyimpan rencana dan
riwayatnya; pilih tombol arsip untuk membukanya kembali.

## Mulai dari instruksi tugas

Ruang proyek juga dipakai untuk tugas singkat: PR, laporan, presentasi, coding,
atau kerja kelompok. Tidak perlu judul TA atau rencana besar. Buat nama tugas
dan ceritakan secukupnya; hasil, tenggat dan waktu luang boleh dilengkapi lewat chat.

Tambahkan PDF, PNG, JPG, WebP, atau bahan teks. Bito membaca file, lalu menyimpan
ringkasan bagian penting. Sesudah itu, kartu **Pemahaman** memperlihatkan tujuan,
hasil yang dikumpulkan, ketentuan, dan yang belum jelas. Koreksi isinya jika perlu,
lalu klik **Sudah sesuai, lanjut**. Ini persetujuan pemahaman tugas, terpisah dari
persetujuan timeline. Bito baru bisa membuat draf setelah konfirmasi ini.

Bahan baru atau perubahan instruksi membatalkan konfirmasi lama; rencana aktif
tetap dipertahankan sampai draf penggantinya disetujui. Menambahkan tenggat atau
waktu luang saja tidak mengharuskan review tugas dari awal.

## Yang sudah tersedia

- Tujuan, tenggat, ketersediaan waktu, serta bahan per proyek.
- Intake melalui percakapan, draf AI yang harus ditinjau, milestone dan langkah
  dengan rentang durasi serta kriteria selesai.
- Rencana aktif tetap dipakai selama draf revisi belum disetujui. Langkah selesai
  dipertahankan saat revisi; draf lama tidak boleh menimpa perubahan terbaru.
- Progres manual atau dari laporan eksplisit pengguna, kendala, dan titik lanjut.
- Riwayat chat terpisah dan pengingat yang dikaitkan ke proyek asal. Pengingat
  hanya dibuat atas permintaan pengguna dan waktu yang jelas.
- Pengambilan bagian bahan teks yang relevan saat cuplikan awal belum cukup.

## Batas versi pertama

Proyek disimpan lokal per akun pada perangkat tersebut. Login di perangkat lain
belum menyinkronkan ruang proyek. Belum ada integrasi Google Calendar atau
penjadwalan otomatis dari timeline. Estimasi AI tetap perlu ditinjau pengguna.

Importer menerima PDF/gambar maksimal 6 MB serta TXT, Markdown, CSV, JSON, dan LOG
maksimal 192 KB. Dokumen Office belum didukung. PDF/gambar dikirim ke backend
terautentikasi dan Gemini untuk dibaca sekali; byte asli tidak disimpan ke log,
riwayat chat atau tabel job cloud. Yang disimpan lokal adalah hasil ekstraksi AI,
bukan salinan lengkap dokumen. Hasil bisa salah/tidak lengkap: periksa catatan
bagian buram atau ambigu sebelum konfirmasi. Gambar tulisan tangan yang sulit
dibaca atau PDF terenkripsi dapat gagal; gunakan crop lebih jelas atau teks.

Maksimal 12 bahan, 48.000 karakter per bahan teks, dan 192.000 karakter per tugas.
Ekstrak PDF/gambar dibatasi 18.000 karakter. File yang sama dalam satu tugas
dikenali melalui hash agar tidak memanggil AI lagi. Untuk bahan panjang, tambahkan
halaman/bagian penting secara terpisah. File asli tidak diminta ulang saat chat;
AI mengakses bagian ekstrak lokal yang relevan lewat alat pembacaan bahan.

## Implementasi

`src/projects.ts` menyimpan tipe, validasi, pembatasan konteks dan persetujuan.
`electron/projects.ts` menangani perintah UI dan alat AI.
`electron/project-import.ts` mengimpor bahan dengan pemeriksaan scope, cancel,
duplikasi dan jenis file. Endpoint `material` memakai lease dan otorisasi demo
yang sama dengan chat, lalu menyelesaikan job tanpa menyimpan byte sumber. Rencana aktif hanya
berubah lewat persetujuan UI; model tidak memiliki alat persetujuan.

Alat proyek hanya ditawarkan pada klien dengan kemampuan `projects`. Server
mengeluarkan panggilan alat; aplikasi memvalidasi akun/proyek aktif, ID sumber,
tanggal, versi draf dan rentang estimasi sebelum menyimpan hasil. Hasil alat dan
state tersimpan dalam transaksi SQLite yang sama. Backend tetap memakai
autentikasi dan daftar izin demo yang sudah ada. Tidak ada perubahan skema cloud
atau penambahan secret.

Uji otomatis mencakup siklus draf/persetujuan, isolasi konteks, pembacaan bahan,
versi kedaluwarsa, pelestarian progres, batas konteks, penyimpanan ulang, rollback
transaksi, serta pengingat lintas proyek. Ketepatan rencana dan pengalaman visual
tetap diuji langsung oleh pengguna.
