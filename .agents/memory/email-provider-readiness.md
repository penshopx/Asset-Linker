---
name: Email provider readiness
description: Kebijakan pemisahan kegagalan pesan dan provider serta pemulihan tanpa email percobaan.
---

Penolakan pesan/penerima tidak membuktikan provider mati maupun pulih. Pertahankan bukti gangguan yang sudah ada saat menerima penolakan tersebut.

**Why:** Satu alamat yang salah tidak boleh membuat seluruh layanan dianggap terganggu, sementara penolakan pesan juga tidak membuktikan gangguan sebelumnya sudah selesai.

**How to apply:** Klasifikasikan metadata error terstruktur, bukan teks pesan. Autentikasi, akses, konfigurasi pengirim/region, dan kuota tetap belum siap sampai pengiriman nyata berhasil atau proses dimulai ulang. Gangguan sementara kembali ke status belum diperiksa setelah 60 detik dari kegagalan sementara terakhir, bukan menjadi tersedia. Gangguan sementara tidak menghapus masalah konfigurasi yang diketahui.

Readiness tidak boleh mengirim email percobaan ke pembeli atau memblokir pengiriman nyata.

**Why:** Pengujian kesiapan harus bebas efek samping bagi pembeli, dan pengiriman nyata diperlukan untuk memperoleh bukti pemulihan.

**How to apply:** Batas waktu hanya mengakhiri bukti kegagalan sementara; jangan menambahkan probe email atau menyebut kedaluwarsa sebagai bukti pemulihan provider.
