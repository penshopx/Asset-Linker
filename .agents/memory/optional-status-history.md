---
name: Optional status history
description: Aturan degradasi aman ketika migrasi riwayat status belum tersedia.
---

Endpoint status pesanan harus tetap mengembalikan detail pesanan dengan `history: []` bila tabel riwayat belum ada. Jangan menyamarkan error database lain sebagai history kosong.

**Why:** Migrasi riwayat bergantung pada helper RPC yang mungkin belum tersedia, sementara data pesanan utama tetap valid dan berguna. Menyamarkan semua error akan membuat gangguan database nyata sulit dideteksi.

**How to apply:** Kenali hanya error tabel/relation hilang atau schema cache untuk riwayat status sebagai kondisi kompatibilitas. Pertahankan respons gagal untuk error query lainnya, dan pastikan UI tidak merender timeline saat array kosong.