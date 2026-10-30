# 🌐 PANDUAN LENGKAP DEPLOYMENT KODE GIT (GitHub Pages)
## 100% Sama Persis dengan Laragon & Tanpa Loading Pages (SPA + AJAX)

Folder ini berisi seluruh source code **Enterprise Power BI Web Dashboard** yang siap di-deploy ke **GitHub Pages** (`https://<username>.github.io/<repo>/`).

---

### 🌟 Kenapa Versi Ini "Sama Persis" & "Tanpa Loading Pages"?
1. **100% Sama Persis UI/UX:**
   - Menyertakan seluruh tampilan lengkap: Sidebar navigasi, **Dashboard Overview**, **Armada VRA (Sub 1, 2, 3, 4)**, **BBM & Fuel Analytics**, **Maintenance & Servis**, **Simulasi Servis**, dan **Drilldown Matrix**.
   - Dilengkapi kartu KPI interaktif SVG Alive, grafik ApexCharts, visualisasi Heatmap, dan Dark/Light Mode.
2. **Tanpa Loading Pages (Zero Page Reload):**
   - Arsitektur **Single Page Application (SPA)**: Pindah menu, ganti tab, filter tahun/bulan/kategori/unit berjalan instan dalam memori (0 milidetik).
3. **Data Loading Asinkron via AJAX (`fetch`):**
   - Seluruh data dimuat di latar belakang via AJAX tanpa menghentikan atau me-reload halaman.
   - Bisa langsung membaca data dari `./cache/*.json` ATAU live dari Google Sheets via Google Apps Script Web App API URL.

---

## 📁 Struktur Berkas di Folder Ini:
```text
kode_git/
├── index.html                 (Dashboard Utama 607 KB - 100% Lengkap)
├── public/
│   └── js/
│       ├── pbi_main.js        (Engine Analitik AJAX & Event Routing)
│       ├── pbi_svg_cards.js   (Kartu SVG Alive & Sparklines)
│       ├── vra-measures.js    (Kalkulasi DAX VRA & Jam Kerja)
│       ├── fuel-measures.js   (Kalkulasi DAX BBM & Rasio Konsumsi)
│       ├── maintenance-measures.js (Kalkulasi Servis & Biaya)
│       ├── asset-measures.js  (Hierarki & Metadata Aset)
│       ├── core-measures.js   (Fungsi Dasar Agregasi)
│       └── main.js
├── cache/
│   ├── vra_live_cache.json    (Data Aktivitas VRA)
│   ├── fuel_cache.json        (Data Konsumsi BBM Solar & Bensin)
│   ├── maint_vra_cache.json   (Data Servis & Pemeliharaan Armada)
│   └── asset_cache.json       (Master Data Unit & Aset)
├── img/
│   ├── logo-mark.png          (Logo Resmi PNS)
│   ├── logo-full.png
│   └── bg.png                 (Wallpaper Canvas Dashboard)
├── PANDUAN_KODE_GIT.md
└── README.md
```

---

## 🚀 Langkah Upload ke GitHub:

### Cara 1: Menggunakan Git Command Line (Paling Cepat & Rapi)
Buka terminal / PowerShell di folder ini (`c:\laragon\www\pns_vra\kode_git`):
```bash
git init
git add .
git commit -m "feat: 100% full parity SPA dashboard with AJAX"
git branch -M main
git remote add origin https://github.com/USERNAME_ANDA/NAMA_REPO.git
git push -u origin main --force
```

### Cara 2: Upload Manual via Browser GitHub
1. Buka repository Anda di GitHub.
2. Klik tombol **Add file** &rarr; **Upload files**.
3. Drag & drop seluruh isi folder `kode_git/` (yaitu `index.html`, folder `public/`, folder `cache/`, dan folder `img/`).
4. Klik **Commit changes**.

---

## ⚡ Mengaktifkan GitHub Pages:
1. Di repository GitHub Anda, klik tab **Settings** (di bilah atas).
2. Di menu samping kiri, klik **Pages**.
3. Di bagian **Build and deployment**:
   - **Source:** Pilih `Deploy from a branch`.
   - **Branch:** Pilih `main` (atau `master`) dan folder `/ (root)`.
4. Klik **Save**.
5. Tunggu 1 menit, lalu refresh halaman. Link website Anda akan muncul:
   👉 `https://USERNAME.github.io/NAMA_REPO/`

---

## 🔌 Menghubungkan ke Google Apps Script (Live Google Sheets Data):
1. Buka dashboard GitHub Pages Anda.
2. Klik tombol **"Google Sheets API"** (ikon colokan colokan biru di header atas).
3. Masukkan Web App URL dari Google Apps Script:
   `https://script.google.com/macros/s/AKfycb.../exec`
4. Klik **Simpan & Tarik Data**.
5. Data VRA akan langsung ditarik secara live via AJAX dari Google Sheets Anda tanpa reload halaman!
