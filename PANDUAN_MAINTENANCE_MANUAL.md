# 📋 PANDUAN PEMASANGAN KODE GOOGLE (Google Sheets, Apps Script & Git)
## Versi 3.5 Final: VRA Operasional, Sistem BBM (Fuel) & Sistem Maintenance

Folder `kode_google` ini berisi seluruh source code backend & antarmuka Web App yang dirancang agar **100% kompatibel dijalankan di Google Sheets (Container-Bound), Google Apps Script Web App (Standalone), maupun di Git (GitHub Pages)**.

---

## 📁 Daftar Berkas di Folder `kode_google/`:
1. **`Code.gs`** : Script backend utama Google Apps Script:
   - Konektor Multi-Year Live API Pusat PNS (`2026`, `2025`, atau `ALL`) dengan failover otomatis ke Sheet & GitHub CDN.
   - Menu Kustom di Google Sheets (`⚡ PNS Enterprise VRA & BBM`) termasuk fitur **Buka Dashboard Langsung di Google Sheet (Full Modal Dialog)**.
   - Ekstraksi & sinkronisasi data **BBM (Fuel BKB)** lengkap (Solar vs Bensin, 4 Kuadran Efisiensi, rasio L/HM, dan estimasi waste).
   - Sinkronisasi data **Maintenance (`Data_MTC`)** 9 kolom standar yang 100% aman (tidak pernah menghapus data paste manual dari Excel).
   - Ringkasan komprehensif **Per Unit Armada** (VRA Jam Kerja + BBM + Maintenance TCO) & **Executive KPI Sheet**.
   - **REST API Gateway (`doGet`)** untuk integrasi langsung dengan **Git / GitHub Pages**:
     - `?format=json&type=vra&tahun=ALL` (Data VRA Operasional)
     - `?format=json&type=fuel` (Data Konsumsi BBM BKB)
     - `?format=json&type=maintenance` (Data Pemeliharaan & Servis Manual Google Sheets)
     - `?format=json&type=health` (Status & Monitoring API)
     - `?action=payload` (Agregasi KPI lengkap untuk Dashboard)
2. **`MaintData.gs`** : Adapter dataset awal pemeliharaan (`Data_MTC`).
3. **`Index.html`** : Antarmuka Web App Dual-Mode (Bisa berjalan di dalam Google Sheets/Apps Script via `google.script.run` MAUPUN di Git/Browser via AJAX REST API + Static Cache Fallback).
4. **`appsscript.json`** : Manifest konfigurasi Apps Script (`Asia/Jakarta`, V8 runtime, izin `UrlFetchApp` & `SpreadsheetApp`).
5. **`.clasp.json`** : Konfigurasi Google Clasp CLI.

---

## 🚀 Cara 1: Pemasangan di Google Sheets & Google Apps Script

### Langkah 1: Buka Editor Apps Script dari Google Sheet
1. Buka Google Spreadsheet Anda di browser (atau buat baru di [sheets.new](https://sheets.new)).
2. Klik menu **Extensions (Ekstensi)** &rarr; **Apps Script**.

### Langkah 2: Salin Berkas Kode
1. **`Code.gs`**: Hapus isi bawaan di editor, lalu salin dan tempel seluruh isi dari `kode_google/Code.gs`.
2. **`MaintData.gs`**: Klik tombol **`+` (Add a file)** &rarr; **Script**, beri nama `MaintData`, lalu tempel isi dari `kode_google/MaintData.gs`.
3. **`Index.html`**: Klik tombol **`+` (Add a file)** &rarr; **HTML**, beri nama `Index` (otomatis menjadi `Index.html`), lalu tempel seluruh isi dari `kode_google/Index.html`.
4. Klik **Save (Ikon Disket / `Ctrl + S`)**.

### Langkah 3: Jalankan di Dalam Google Sheets
1. Refresh tab Google Spreadsheet Anda.
2. Akan muncul menu **`⚡ PNS Enterprise VRA & BBM`** di bilah atas.
3. Klik **`🚀 SINKRONISASI SEMUA SHEET (Full Sync VRA + BBM + Maint)`** untuk mengisi otomatis sheet operasional (`📊 Executive KPI`, `🚜 Data VRA Operasional`, `⛽ Log Konsumsi BBM`, `Data_MTC`, `📋 Ringkasan Per Unit`).
4. Klik **`🖥️ Buka Dashboard Langsung di Google Sheet`** untuk membuka tampilan grafik interaktif langsung di dalam layar Google Sheet Anda!

### Langkah 4: Deploy sebagai Web App & API untuk Git
1. Di editor Apps Script, klik tombol **Deploy** &rarr; **New deployment** (atau **Manage deployments** &rarr; **Edit** &rarr; **New version**).
2. Pilih jenis **Web app**:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` *(Penting agar Git / GitHub Pages dapat menarik data JSON tanpa blokir CORS/Login)*.
3. Klik **Deploy** dan salin **Web App URL** (`https://script.google.com/macros/s/.../exec`).

---

## 🌐 Cara 2: Menghubungkan dengan Git (`kode_git` / GitHub Pages)
1. Buka dashboard Git (`kode_git/index.html` atau `kode_git/gas_dashboard.html`) di GitHub Pages.
2. Klik tombol **Google Sheets API** (ikon colokan/pengaturan di kanan atas header).
3. Tempelkan **Web App URL** dari Langkah 4 di atas, lalu klik **Simpan & Tarik Data**.
4. Dashboard di Git akan langsung menarik data live dari Google Sheet Anda!

---

## 🛠️ Panduan Update Manual Data Maintenance di Google Sheets

Data Pemeliharaan & Servis (**Maintenance / MTC**) dikelola secara **manual** langsung di Google Sheets tab **`Data_MTC`**.

### 1. Struktur 9 Kolom Standar di Tab `Data_MTC`:
| Kolom | Nama Kolom | Keterangan & Format | Contoh |
| :--- | :--- | :--- | :--- |
| **A** | **Tanggal** | Tanggal servis/pembelian (`YYYY-MM-DD` atau `DD/MM/YYYY`) | `2026-06-03` atau `03/06/2026` |
| **B** | **Kode Unit** | Kode unit armada/alat operasional *(Wajib)* | `PNS-MBL-02`, `EXC-01`, `DT-05` |
| **C** | **Kategori Fleet** | Jenis armada *(Opsional, otomatis terdeteksi jika kosong)* | `MOBIL`, `EXCAVATOR`, `DUMP TRUCK` |
| **D** | **Kategori Barang/Jasa** | Klasifikasi barang/jasa | `MAINTENANT ASSET - KENDARAAN` |
| **E** | **Kategori Material** | Kategori grup material/servis | `Consumable & Fast Moving Umum` |
| **F** | **Sub Kategori Material**| Rincian jenis part/material | `Filter (Oli, Solar, Udara)`, `Baut` |
| **G** | **Nama Spare Part / Jasa**| Nama barang atau deskripsi jasa servis | `OIL FILTER ME130968`, `JASA TUNE UP` |
| **H** | **Nominal Biaya (Rp)** | Total biaya pengeluaran dalam Rupiah *(Angka)* | `150000` atau `Rp 150.000` |
| **I** | **Kode Section** | Section penanggung jawab | `HRO`, `WKS`, `AGR`, `CSU`, `SEC` |

### 2. Cara Menambah / Mengupdate Data Manual:
1. Buka tab **`Data_MTC`** di Google Spreadsheet Anda.
2. Tambahkan baris baru di bawah baris terakhir, atau tempel (*copy-paste*) data langsung dari Excel bengkel/logistik Anda mulai kolom A.
3. **Format Otomatis**:
   - Jika kolom *Kategori Fleet* kosong, sistem otomatis mengenali jenis unit (contoh: unit berisi `DT` menjadi `DUMP TRUCK`, `EXC` menjadi `EXCAVATOR`, `MBL` menjadi `MOBIL`).
   - Nominal biaya otomatis dibersihkan dari format teks `Rp`, titik, atau koma.
   - Format tanggal fleksibel: mendukung format tanggal Google Sheets, `dd/mm/yyyy`, maupun `yyyy-mm-dd`.
4. **Data Anda 100% Aman**:
   - Skrip Google Apps Script **tidak akan pernah menghapus / meng-overwrite** data yang sudah Anda isi di tab `Data_MTC`.
5. **Memicu Pembaruan ke Dashboard**:
   - Setiap kali Anda mengubah sel di `Data_MTC`, sistem otomatis mereset cache.
   - Di Google Sheets: Klik menu **`⚡ PNS Enterprise VRA & BBM`** &rarr; **`🔧 Format & Validasi Manual Tab Data_MTC`** untuk merapikan tampilan dan format Rupiah.
   - Di Dashboard Git / Web: Klik tombol **`Sync Live Data`** di kanan atas, data maintenance manual terbaru Anda akan langsung tampil pada KPI Biaya, grafik per kategori material, dan tabel rincian servis.
