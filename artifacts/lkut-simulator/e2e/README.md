# Regresi browser salin tautan pesanan

Jalankan workflow `artifacts/lkut-simulator: web`, lalu:

```sh
pnpm --filter @workspace/lkut-simulator exec playwright install chromium
pnpm --filter @workspace/lkut-simulator run test:browser
```

Jika Chromium sudah disediakan oleh lingkungan:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/repl/tools/bin/chromium \
  pnpm --filter @workspace/lkut-simulator run test:browser
```

Secara default suite memakai shared proxy `http://localhost:80/`.
Gunakan `LKUT_BROWSER_BASE_URL=https://domain-preview/` untuk preview HTTPS,
atau sertakan base path aplikasi jika dipasang pada subpath.
Suite tidak menyalakan server lain dan tidak memerlukan API server/database.

Keempat kasus memakai kartu pesanan pada halaman `cek-pesanan`, masing-masing
dengan Enter dan Space setelah navigasi Tab. Respons pesanan sepenuhnya
diintersep; permintaan API lainnya diblokir dan menggagalkan tes.
Izin clipboard diberikan/ditolak oleh Chromium, bukan mock `writeText`.
Kasus penolakan juga memeriksa seleksi seluruh URL, copy/paste keyboard asli
saat API ditolak, serta pemulihan setelah izin diberikan kembali.

Tes memeriksa fokus yang dirender dan teks dalam live region yang sudah ada
sebelum aktivasi. Ini tidak mengklaim menguji suara pembaca layar.
Clipboard OS dibagi antar-konteks sehingga suite harus berjalan satu worker.
Trace/screenshot kegagalan disimpan di `generated-artifacts/lkut-browser`
yang dikecualikan dari Git dan deployment.
