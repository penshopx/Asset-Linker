---
name: Prinsip validasi dan pemulihan yang disepakati
description: Kesepakatan penutup tinjauan tentang toleransi skor, grade, data parsial, dan sumber pemulihan.
---

Skor boleh dibandingkan dengan toleransi numerik yang disepakati; grade terhadap acuan harus cocok persis. Ketidakcocokan grade pada input dan aturan yang sama adalah kegagalan pengujian meskipun perbandingan skor lolos.

**Why:** Pengguna menerima prinsip ini sebagai rumusan akhir tinjauan.

**How to apply:** Pisahkan pemeriksaan skor dan grade; keduanya harus lulus. Selidiki perhitungan, normalisasi input, versi aturan, dan kebenaran acuan sebelum menentukan penyebab. Jangan menggeser ambang atau menambah pembulatan hanya agar tes lulus.

Tidak menghasilkan grade untuk data parsial masih usulan kebijakan, bukan aturan yang otomatis berlaku.

**Why:** Pengguna menegaskan perubahan ini membutuhkan keputusan produk eksplisit, termasuk dampak pada alur pengguna dan data lama.

**How to apply:** Jangan mengubah perilaku atau menetapkan ekspektasi tes seolah kebijakan tersebut sudah disetujui.

Pemulihan informasi yang dihapus memerlukan sumber yang terverifikasi masih menyimpan informasi asli.

**Why:** Pengguna menyetujui bahwa skrip migrasi balik saja tidak cukup bila informasi asli telah hilang.

**How to apply:** Sebelum migrasi destruktif, verifikasi backup, arsip, atau rekaman lain memuat payload asli yang diperlukan untuk pemulihan.
