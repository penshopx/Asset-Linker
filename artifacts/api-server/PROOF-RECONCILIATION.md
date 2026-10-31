# Rekonsiliasi bukti historis

Perintah ini hanya untuk operator server dengan kredensial service-role yang
sudah dikonfigurasi. Tidak ada endpoint publik dan tidak dijalankan otomatis
saat startup. Terapkan migrasi API terlebih dahulu, lalu bangun CLI:

```sh
pnpm --filter @workspace/api-server run build
```

## 1. Periksa laporan terlebih dahulu

Pilih waktu batas tetap dalam UTC yang setidaknya 24 jam lalu. Contoh berikut
hanya contoh tanggal; sesuaikan dengan periode historis yang ingin diperiksa:

```sh
pnpm --filter @workspace/api-server run proofs:reconcile --before 2026-10-01T00:00:00Z
```

Default: mode laporan, 100 objek per halaman, maksimal 10 halaman per proses.
Tidak ada perubahan antrean atau penghapusan Storage dalam mode laporan.
Output JSON per halaman berisi nama file, hasil pemeriksaan, dan `nextCursor`.

- `candidate`: bukti lama tanpa referensi dan tanpa reservasi.
- `referenced`: masih digunakan pesanan melalui `bukti_filename` atau URL publik
  `bukti_url` (termasuk URL dengan query).
- `tracked`: sudah memiliki reservasi, lease, atau penanda penghapusan.
- `queued`: baru dimasukkan ke antrean melalui mode antrekan.

Hanya objek bucket `proofs` dengan waktu pembuatan **dan** perubahan sebelum
batas yang diproses. Timestamp kosong tidak dianggap aman. Folder ditelusuri
melalui nama/path lengkap di katalog `storage.objects`, bukan daftar folder.
Katalog hanya dibaca; byte file tetap dihapus lewat API Storage oleh worker.

## 2. Antrekan setelah laporan ditinjau

**Peringatan:** `--enqueue` mengizinkan worker aktif menghapus kandidat historis.
Gunakan waktu batas dan cakupan yang sama dengan laporan yang sudah ditinjau.
Jangan menjalankan mode ini sebelum memastikan database pesanan lengkap.

```sh
pnpm --filter @workspace/api-server run proofs:reconcile --before 2026-10-01T00:00:00Z --enqueue
```

Mode ini tidak menghapus langsung: pemeriksaan referensi dan reservasi memakai
advisory lock yang sama dengan penulisan pesanan. Worker mengambil claim,
memeriksa referensi lagi, kemudian memakai lease dan tombstone yang sudah ada.
Kegagalan penghapusan tetap dapat dicoba ulang oleh worker.

## Melanjutkan secara terbatas

Jika halaman terakhir masih memiliki `nextCursor`, jalankan lagi dengan
`--after` bernilai cursor tersebut, waktu batas dan mode yang sama:

```sh
pnpm --filter @workspace/api-server run proofs:reconcile --before 2026-10-01T00:00:00Z --after 'folder/last-file.pdf' --page-size 100 --max-pages 10
```

`nextCursor: null` berarti pemindaian selesai. Halaman penuh bisa membutuhkan
satu halaman kosong berikutnya untuk memastikan selesai. Ukuran halaman
dibatasi 1–500 dan jumlah halaman 1–100. Cursor berdasarkan nama, bukan offset,
sehingga penghapusan halaman terdahulu tidak melewatkan file selanjutnya.
Jika proses gagal, ulangi dari cursor terakhir yang berhasil dicetak; antrekan
ulang tidak menimpa reservasi atau tombstone. Untuk memulai fase antrekan
setelah laporan selesai, mulai dari awal cakupan laporan, bukan cursor akhirnya.
