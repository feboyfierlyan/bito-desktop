# Checkpoint dan release Bito

## Pemakaian

Download di [GitHub Releases](https://github.com/feboyfierlyan/bito-desktop/releases). Pilih OS/arsitektur sesuai nama file. v0.1–0.3 diarsipkan dari build aslinya; v0.4 memperluas paket Mac dengan Intel x64. Tidak mengubah atau mengganti installer versi lama dengan kode yang lebih baru.

Build terbaru ada di `release/<versi>/`, terpisah dari installer checkpoint lama. `SHA256SUMS.txt` dan `BUILD-INFO.txt` menyertai setiap release. Installer belum ditandatangani/notariskan; ini distribusi prototype untuk pengujian kelompok.

## Membuat checkpoint berikutnya

1. Selesaikan revisi lokal di `npm run dev`. Profil uji `.bito-dev-data` terpisah dari profil aplikasi terpasang.
2. Naikkan versi `package.json` dan `package-lock.json` bersama. Tampilan About dan launcher mengambil versi langsung dari package.json.
3. Perbarui `CHANGELOG.md` dan buat `docs/releases/v<versi>.md`; baris pertama menjadi judul release.
4. Jalankan `npm run check`, `npm test`, dan `npm run build`. Commit source/aset/dokumentasi; jangan commit installer, database, profil uji, atau API key.
5. Push commit ke `main`; buat dan push tag `v<versi>` pada commit yang sama.
6. GitHub Actions menguji dan membangun Mac arm64/x64 serta Windows x64. Job release menunggu keduanya sukses, memeriksa kelima paket, menghitung checksum, dan menyiapkan draft.
7. Setelah semua file terunggah, draft dipublikasikan sebagai Latest. Jika build gagal, release tidak dipublikasikan; perbaiki sebabnya atau rerun job yang gagal. Workflow menolak menimpa release yang sudah terbit.
8. Unduh release ke `release/<versi>/`, verifikasi checksum, dan lakukan smoke test native. Catat batas pengujian dalam release notes.

Build Mac saja: `npm run package:mac`. Build Windows pada Windows: `npm run package:win`. `npm run package` membuat paket host saat ini. `npm run release:manifest -- release/<versi>` memerlukan tepat lima paket release lengkap.

## Lanjut revisi

Buka `Revisi Bito.command` atau jalankan `npm run dev`. Tidak perlu installer ulang setiap revisi. `Jalankan Bito.command` membuka aplikasi yang sudah dipaketkan untuk checkpoint lokal.
