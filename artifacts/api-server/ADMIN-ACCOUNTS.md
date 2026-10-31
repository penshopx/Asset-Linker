# Akun admin pribadi

Panel `/admin-pesanan` memakai Clerk. Passcode lama dan header
`x-admin-passcode` tidak lagi memberi akses. Simulator/pesanan publik tetap
terbuka tanpa login.

## Admin pertama

Daftar atau masuk menggunakan email utama yang sudah dikonfigurasi pemilik
melalui `ADMIN_EMAIL`, lalu selesaikan verifikasi email. Server memberikan peran
admin hanya kepada email terverifikasi tersebut, bukan kepada pendaftar pertama.
Penanda bootstrap disimpan di metadata privat Clerk; pencabutan peran tidak
mengaktifkan ulang bootstrap. Jangan mengubah `ADMIN_EMAIL` menjadi email bersama.

## Admin tambahan dan pencabutan akses

Setiap admin membuat akun sendiri melalui `/admin-daftar` dan memverifikasi
email utamanya. Pendaftaran saja **tidak** memberi akses pesanan.
Pengelola menjalankan perintah berikut dari direktori `artifacts/api-server`
dengan kredensial Clerk lingkungan yang dituju:

```
node scripts/admin-role.mjs grant admin@example.com
node scripts/admin-role.mjs revoke admin@example.com
```

Perintah idempoten dan tidak menimpa metadata lain. Jangan berikan secret key
kepada admin aplikasi. Role diperiksa ulang dari server Clerk pada setiap
permintaan, sehingga pencabutan tidak menunggu JWT role kedaluwarsa.
Di panel, **Keluar / Ganti admin** mengakhiri sesi Clerk dan menghapus tampilan
pesanan sebelum akun berikutnya masuk.

Pengguna development dan production terpisah. Bootstrap dijalankan melalui
login terverifikasi di masing-masing lingkungan; jangan menyalin ID akun atau
kredensial antarlingkungan. Kunci Clerk dikelola melalui pengaturan autentikasi
workspace. Pekerjaan ini tidak menerbitkan aplikasi.

## Riwayat audit

Nama baru disertai ID akun stabil dan label terverifikasi, diambil server dari
sesi dan profil Clerk. Ini membuktikan akun yang bertindak, bukan verifikasi
identitas hukum nama profil. Klien hanya mengirim status, bukan `changed_by`.

Snapshot nama dan ID dienkripsi bersama dalam envelope yang sudah ada, lalu
disalin trigger bersamaan dengan perubahan status. Tidak perlu backfill atau
kolom publik ID akun baru. Riwayat lama tanpa nama tetap kosong; nama lama
dengan passcode diberi label **diisi sendiri — riwayat lama**. API publik tidak
mengembalikan identitas apa pun. Pertahankan `SESSION_SECRET` agar riwayat lama
tetap dapat dibaca; jangan merotasi kunci tanpa rencana migrasi.
