---
name: Regresi akses keyboard browser
description: Batas pengujian browser untuk fokus asinkron, izin clipboard, dan warna CSS.
---

Kontrol keyboard yang sedang menjalankan operasi asinkron harus mempertahankan fokus, bukan sekadar dapat dicapai lagi dengan Tab.

**Why:** Native `disabled` dapat melepaskan fokus Chromium saat penulisan clipboard menunggu hasil. Tes komponen tidak menangkap perilaku browser tersebut.

**How to apply:** Bila kontrol tetap dalam urutan Tab dengan `aria-disabled`, blokir aktivasi berulang secara eksplisit dan uji fokus setelah operasi selesai.

Pengaturan izin melalui CDP harus menargetkan konteks browser tes yang sebenarnya.

**Why:** Mengubah konteks default tidak mengubah izin konteks terisolasi Playwright, sehingga skenario penolakan dapat diam-diam berjalan dengan izin diberikan.

**How to apply:** Verifikasi status izin browser sebelum menguji respons UI; jangan menyamakan stub API dengan penolakan izin nyata.

Bandingkan warna CSS setelah normalisasi browser, bukan teks mentah custom property.

**Why:** Nilai OKLCH berbentuk persentase dan desimal dapat mewakili warna yang sama tetapi berbeda sebagai string.

**How to apply:** Pengujian fokus harus memeriksa gaya yang dirender dan warna yang sudah dihitung browser.
