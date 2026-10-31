---
name: Admin audit identity
description: Batas kepercayaan audit akun pribadi, riwayat passcode lama, dan alasan enkripsi identitas.
---

Identitas audit baru harus berasal dari akun pribadi dan sesi yang diverifikasi server, bukan nama kiriman klien. Verifikasi akun/email bukan verifikasi identitas hukum nama profil. Riwayat passcode bersama adalah identitas yang diisi sendiri; jangan mengubahnya menjadi identitas terverifikasi secara retrospektif.

**Why:** Passcode bersama tidak dapat membuktikan siapa pemakainya. Mengisi ulang identitas lama dari akun saat ini akan menghasilkan klaim audit yang tidak pernah dibuktikan.

**How to apply:** Pertahankan nama historis sebagai snapshot dan sertakan ID akun stabil untuk perubahan baru. Bedakan nama lama yang diisi sendiri dari akun terverifikasi; riwayat tanpa identitas harus tetap tidak diketahui.

Nama audit harus terenkripsi sebelum diteruskan ke database; dekripsi hanya boleh dilakukan setelah pemeriksaan admin. Pertahankan `SESSION_SECRET` yang sama di semua proses server. Mengganti atau menghilangkan kunci ini membuat nama audit lama tidak dapat dibaca; siapkan migrasi kunci sebelum rotasi.

**Why:** Riwayat status database dapat dibaca publik. Pembatasan respons API saja tidak melindungi nama maupun ID akun dari pembacaan langsung ke Supabase.

**How to apply:** Jangan menyimpan nama mentah pada kolom pesanan maupun riwayat. Jangan menaruh kunci dekripsi pada SQL, frontend, log, atau respons API; bind ciphertext pada ID pesanan untuk mencegah pemindahan identitas antar-pesanan.
