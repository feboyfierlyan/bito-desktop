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
- **Onboarding 0.3:** satu komposisi terpusat: progres di atas, satu title/description, Bito di kiri bubble, input atau pill tepat di bawah bubble. Tidak ada panel terpisah, footer, eyebrow, kartu, atau label tambahan. Konten berganti lewat fade/pergeseran 5 px selama 180 ms; slot karakter tetap.
- **Bubble:** kapsul abu-abu dengan ekor melengkung kiri bawah mengikuti referensi pengguna. Permukaannya memanjang dari ekor (scaleX 0.32 → 1; scaleY 0.82 → 1), sementara shell berotasi ringan ±3.5° → 0° memakai spring stiffness 430/damping 30/mass 0.8. Surface memakai stiffness 470/damping 31/mass 0.7. Teks adalah lapisan terpisah agar tidak meregang. Ini interpretasi Bito atas gerakan iMessage, bukan implementasi native Apple. Kata ditampilkan dengan fade 160 ms, tempo 105–195 ms ditambah jeda tanda baca. Seluruh kalimat sudah menempati layout sejak awal agar bubble tidak melompat saat reveal. Klik bubble menampilkan sisa kalimat seketika.
- **Bicara:** `isTalking=true` selama reveal, false pada akhir, skip, pergantian kalimat, unmount, atau drag. Reduced motion menampilkan teks langsung tanpa bicara buatan.
- **Progres:** tiga segmen abu-abu di tengah atas dengan navigasi kembali/maju. Aksi kirim input memakai lingkaran biru.
- **Keluar ke desktop:** native pet window sudah berada di atas slot kiri sejak awal. Setelah siap, jendela menangkap gesture; dilepas dari parent saat drag dimulai tanpa mengubah bounds. Drop dihitung dari pusat viewport karakter di luar bounds onboarding. Ukuran canvas 282 DIP tetap sama saat selesai dan disimpan sebagai ukuran desktop. Onboarding fade 280 ms lalu ditutup; tidak membuat ulang pet atau Rive.
- **Batal/tepi layar:** drop di dalam atau pointer cancel mengembalikan karakter ke anchor dengan cubic ease-out 280 ms. Drop di tepi layar dirapikan dengan gerakan yang sama. Mouse-up ditangani di main process dan renderer untuk mencegah gesture tertinggal saat menyeberang jendela. Koordinat negative zero dinormalisasi sebelum melewati batas native.
- **Alternatif:** tombol ikon pindah di bawah bubble langkah 3 (label aksesibel “Pindahkan Bito ke desktop tanpa menyeret”) memakai jendela dan jalur penyelesaian yang sama. Reduced motion melewati tween dan fade.
- **Tab:** garis penanda mengikuti tab terpilih memakai layout animation; isi memakai fade singkat.
- **Pesan baru:** memakai reveal permukaan, rotasi, dan spring yang sama untuk Bito/pengguna, dengan origin berlawanan sesuai ekor bubble. Isi tampil melalui fade singkat, terpisah dari scale permukaan. Dimensi bubble mengikuti streaming dengan layout transition 200 ms; teks streaming tidak diberi penundaan per huruf. Pesan yang sudah terlihat tidak mengulang entrance ketika membuka chat/tab.
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


- **Wave:** klik/Enter pada Bito di langkah 1–2 mengirim trigger Rive `wave`, dengan guard karakter siap dan cooldown 650 ms. Langkah 3 khusus drag; klik tidak mengirim wave.
- **Balasan onboarding:** kirim nama/pilihan memberi bubble biru selama satu entrance singkat (380 ms), lalu melanjutkan langkah. Reduced motion melewati entrance dan jeda ini. Teks yang terlihat hanya title, description, percakapan, dan kontrol balasan.
