---
name: Buyer email retry ownership
description: Aturan konsistensi untuk retry dan rekonsiliasi email pembeli lintas proses.
---

Bedakan percobaan email yang sedang berjalan, gagal terkonfirmasi, dan berhasil dengan state persisten. Batasi kegagalan terkonfirmasi, tetapi izinkan rekonsiliasi state `sending` yang stale memakai idempotency key provider yang sama.

**Why:** Counter saja tidak dapat membedakan kegagalan provider dari provider sukses yang gagal dicatat ke database. Tanpa ownership per percobaan, proses lama juga dapat menimpa hasil proses yang lebih baru.

**How to apply:** Semua jalur retry manual dan otomatis harus memakai claim database yang sama. Update terminal harus mencocokkan counter dan timestamp/token claim, dan pengiriman ulang untuk satu pesanan harus memakai idempotency key provider yang stabil.