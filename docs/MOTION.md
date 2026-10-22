# Motion dan micro-interaction Bito

## Riset yang menjadi dasar

- Apple, [Designing Fluid Interfaces, WWDC18](https://developer.apple.com/videos/play/wwdc2018/803/): respons langsung terhadap gesture, interupsi/redirection, gerakan yang berhubungan dengan tindakan. Ini prinsip interaksi, bukan formula durasi yang wajib.
- Apple, [Motion HIG](https://developer.apple.com/design/human-interface-guidelines/motion): gerakan bertujuan, feedback singkat, bisa dibatalkan, tidak membuat pengguna menunggu.
- Apple, [Reduced Motion](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria): hormati preferensi gerakan dan ganti pergeseran/skala dengan perubahan yang lebih tenang.
- Mobbin, [Messages conversation](https://mobbin.com/screens/a4708b67-37de-471e-8b24-268d66750595): komposisi bubble, hierarki waktu, composer ringan.
- Mobbin, [Finch onboarding](https://mobbin.com/flows/80ef83ef-f872-4825-b18d-6b193d60a9aa): karakter sebagai pusat perkenalan dan manfaat pengingat yang diperlihatkan.
- Mobbin, [Codecademy onboarding](https://mobbin.com/flows/9e0051c2-a775-4a37-adcd-a9649df80a60): progres dan pemilihan tujuan.

Implementasi ini terinspirasi prinsip tersebut, bukan komponen Apple atau replika native Liquid Glass.

## Gerakan yang diterapkan

- **Press:** kontrol langsung memberi feedback skala 0.97; tidak ada delay klik buatan.
- **Drag:** gerakan ≥6 px mengubah gesture menjadi drag; posisi native mengikuti pointer. Tidak ada tween posisi saat drag karena akan tertinggal dari tangan. Pointer capture mempertahankan gesture. Pointer cancel/blur mengakhiri drag.
- **Lepas drag:** tidak meneruskan gesture sebagai klik. Posisi dijepit ke area kerja monitor dan disimpan.
- **Chat:** opacity, pergeseran horizontal 12 px, skala 0.965 → 1; origin di sisi karakter. Spring awal stiffness 420, damping 36, mass 0.85. Parameter ini pilihan desain Bito, bukan angka resmi Apple.
- **Tutup/buka cepat:** pending hide dibatalkan saat dibuka kembali; kontrol tetap dapat dipakai selama animasi. Jendela disembunyikan setelah transisi tutup singkat.
- **Onboarding:** 220 ms fade dengan pergeseran 12 px dan blur tipis. Karakter tetap pada satu lokasi agar mata tidak mencari ulang.
- **Progres:** titik aktif memanjang; perubahan memperlihatkan posisi langkah.
- **Tab:** garis penanda mengikuti tab terpilih memakai layout animation; isi memakai fade singkat.
- **Pesan baru:** 180 ms, 8 px ke atas dan skala 0.98 → 1. Teks streaming tidak dianimasikan huruf demi huruf secara buatan.
- **Scroll:** mengikuti jawaban hanya saat pembaca berada dalam 90 px dari bawah. Membaca pesan lama tidak direbut auto-scroll.
- **Composer:** fokus menambah ring biru lembut; textarea tumbuh hingga batas sebelum scroll internal.
- **Thinking:** tiga titik berurutan; status teks menyertai animasi sehingga makna tidak hanya bergantung pada gerak.
- **Toggle:** thumb bergerak singkat dan warna berubah; input checkbox asli tetap dapat diakses lewat keyboard.
- **Fokus:** angka berbasis waktu nyata dan ring progres lembut; menghentikan render tidak mengubah waktu sebenarnya.
- **Feedback simpan/salin:** teks dan ikon check sementara tanpa modal yang menghalangi kerja.

## Aksesibilitas dan performa

- `prefers-reduced-motion` OS dan opsi aplikasi diteruskan ke Motion. CSS non-esensial juga dikurangi. Rive idle dijeda ketika opsi aplikasi aktif.
- Permukaan chat dapat dibuat solid. Aplikasi selalu light sesuai brief.
- Gerakan utama memakai transform/opacity. Drag native dan Rive dipisahkan dari komponen percakapan.
- Asset Rive dan WASM dibundel lokal. Tidak ada ketergantungan CDN di runtime.
- Ini spesifikasi awal yang perlu diuji dengan mahasiswa. Kelancaran 60/120 fps belum diukur secara kuantitatif pada seluruh perangkat.
