---
name: Admin audit identity
description: Batas kepercayaan identitas pelaku perubahan selama admin memakai passcode bersama.
---

Selama panel memakai satu passcode bersama, nama pelaku perubahan adalah identitas yang diisi sendiri, bukan identitas akun terverifikasi. Jelaskan batas ini pada UI dan jangan menyebutnya audit identitas terverifikasi.

**Why:** Penambahan nama pelaku dibuat tanpa mengganti mekanisme akses bersama dengan sistem akun pribadi; passcode bersama tidak dapat membuktikan siapa pemakainya.

**How to apply:** Wajibkan nama sebelum perubahan status baru dan pertahankan tampilan aman untuk riwayat lama tanpa nama. Bila beralih ke akun pribadi, ambil identitas dari sesi terverifikasi di server, bukan dari nama kiriman klien.

Nama audit harus terenkripsi sebelum diteruskan ke database; dekripsi hanya boleh dilakukan setelah pemeriksaan admin. Pertahankan `SESSION_SECRET` yang sama di semua proses server. Mengganti atau menghilangkan kunci ini membuat nama audit lama tidak dapat dibaca; siapkan migrasi kunci sebelum rotasi.

**Why:** Akses database aplikasi memakai kunci anonim dan riwayat status dapat dibaca publik. Pembatasan respons API saja tidak melindungi nama dari pembacaan langsung ke Supabase.

**How to apply:** Jangan menyimpan nama mentah pada kolom pesanan maupun riwayat. Jangan menaruh kunci dekripsi pada SQL, frontend, log, atau respons API; bind ciphertext pada ID pesanan untuk mencegah pemindahan identitas antar-pesanan.
