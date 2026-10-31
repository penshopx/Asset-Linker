---
name: Workspace dependency linking
description: Cara mengenali dependensi pnpm yang sudah terkunci tetapi belum tertaut ke package workspace.
---

Jika modul tercantum di manifest dan lockfile serta sudah ada di store pnpm, jangan langsung mengganti versi hanya karena resolver package workspace melaporkan modul hilang. Pulihkan instalasi workspace dengan lockfile beku dan mode offline agar symlink lokal dibuat ulang.

**Why:** Instalasi workspace dapat tertinggal dari manifest/lockfile; pemasang paket generik dari root juga ditolak oleh perlindungan pnpm workspace dan dapat menambahkan konfigurasi runtime yang tidak terkait.

**How to apply:** Saat tes atau typecheck gagal dengan modul hilang, pastikan paket memang ada di manifest, lockfile, dan store. Jika ketiganya ada, gunakan instalasi root yang frozen/offline, lalu pastikan tidak ada perubahan lockfile atau konfigurasi runtime sebelum melanjutkan.

Pada paket dengan TypeScript project references, error export hilang dapat berasal dari deklarasi build lama meskipun export sudah tersedia di source paket bersama.

**Why:** Pemeriksaan tipe API pernah membaca deklarasi paket bersama yang tertinggal; membangun ulang paket referensi menyelesaikannya tanpa perubahan source atau dependensi.

**How to apply:** Jika export ada di source dan symlink benar, bangun paket referensi dengan `tsc -b` sebelum mengubah import atau menambahkan export duplikat.