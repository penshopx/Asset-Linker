---
name: Buyer email failure alerts
description: Aturan membedakan kegagalan email pembeli dari status pengiriman yang masih tertunda.
---

Tampilkan notifikasi kegagalan email pembeli hanya ketika status pengiriman bernilai false dan pesan error sudah tersimpan.

**Why:** Pesanan baru dibuat dengan status pengiriman false sebelum proses email latar belakang selesai. Menghitung semua nilai false akan memunculkan alarm palsu pada pesanan yang sebenarnya masih diproses.

**How to apply:** Gunakan keberadaan pesan error sebagai penanda kegagalan yang dapat ditindaklanjuti pada badge, banner, filter, dan otomatisasi notifikasi admin.