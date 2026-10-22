---
name: Keamanan pembersihan bukti
description: Alasan reservasi sebelum unggah dan penanda penghapusan permanen untuk bukti pesanan.
---

Catat kewajiban pembersihan sebelum mengunggah byte. Jangan menghapus penanda file yang sudah dihapus tanpa pengganti yang tetap menolak referensi baru ke file tersebut.

**Why:** Mencatat kegagalan penghapusan setelah unggah tidak cukup ketika database ikut terputus. Memeriksa referensi saja juga tidak cukup: RPC pesanan yang terlambat dapat selesai di antara pemeriksaan dan penghapusan Storage. Penanda penghapusan dan penguncian yang dipakai bersama jalur pesanan menutup benturan tersebut.

**How to apply:** Pertahankan mekanisme penolakan referensi terlambat saat mengubah pembersihan, retensi antrean, atau jalur penulisan bukti. Jika reservasi tidak dapat disimpan, jangan mulai unggahan. Jangan mengubah layanan penyimpanan yang sudah digunakan hanya untuk menambahkan retry.

RPC pembersihan dan helper migrasi wajib memakai kredensial khusus server, bukan identitas anon. Penyelesaian percobaan juga harus cocok dengan token lease yang masih berlaku.

**Why:** RLS tidak membatasi fungsi `SECURITY DEFINER`; izin eksekusi bawaan PUBLIC dapat melewati perlindungan tabel. Helper DDL yang tetap terbuka juga dapat mengembalikan izin yang sudah dicabut. Token lease mencegah hasil proses lama menutup pekerjaan yang sudah diambil proses baru.

**How to apply:** Cabut EXECUTE dari PUBLIC, anon, dan authenticated pada semua RPC tersebut dan helper migrasi; berikan hanya ke service_role. Jangan membuat fallback ke anon bila kunci server belum dikonfigurasi.
