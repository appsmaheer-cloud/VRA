# 🐙 PANDUAN LENGKAP UPLOAD KE GITHUB (GITHUB PAGES)
### Folder: `kode_git` — PT Pratama Nusantara Sakti

Folder ini berisi seluruh file yang **WAJIB DI-UPLOAD KE ROOT REPOSITORI GITHUB** (`appsmaheer-cloud/G-Apps`):

---

## 📋 File yang Harus Di-Upload ke GitHub (Total 6 File):

Upload semua file berikut langsung ke halaman utama repositori GitHub Anda (bukan di dalam subfolder):

```text
📂 appsmaheer-cloud/G-Apps (Root Repository)
│
├── 📄 index.html      <-- Portal Utama (Booking Meeting, Kendaraan, ATK, Mess, Servis)
├── 📄 admin.html      <-- Portal Admin GS (Approval, Master Data, Manajemen Driver)
├── 🖼️ favicon.ico     <-- Icon resmi daun hijau & emas PNS untuk tab browser
├── 🖼️ favicon.png     <-- Icon PNG resmi PNS resolusi tajam
├── 🖼️ bg.jpg          <-- Background landscape pabrik PNS (tampil instan 0.1 detik)
├── 🎥 video.mp4       <-- Video operasional kantor (background video looping)
└── 📄 README.md        <-- Dokumentasi repositori
```

---

## 🚀 Cara Upload ke GitHub (Sangat Mudah):

1. **Buka Repositori Anda di Browser:**
   Kunjungi: `https://github.com/appsmaheer-cloud/G-Apps`

2. **Upload File Baru / Timpa File Lama:**
   - Klik tombol **Add file** lalu pilih **Upload files**.
   - Tarik (*drag & drop*) seluruh file dari folder `c:\laragon\www\mr\kode_git\`:
     - `index.html` *(menimpa yang lama)*
     - `admin.html` *(menimpa yang lama)*
     - `favicon.ico` *(file baru)*
     - `favicon.png` *(file baru)*
     - `bg.jpg` *(file baru)*
     - `video.mp4` *(file baru)*
   - Di bagian bawah, klik tombol hijau **Commit changes**.

3. **Cek Hasilnya:**
   - Buka `https://appsmaheer-cloud.github.io/G-Apps/`
   - Tekan **Ctrl + F5** (Hard Refresh) di browser.
   - **Hasil:**
     - Tab browser langsung menampilkan logo daun resmi hijau & emas PNS (bukan kotak hijau kosong lagi).
     - Background langsung menampilkan gambar pabrik PNS `bg.jpg` dan video operasional `video.mp4` (bukan hitam polos lagi).
     - Tombol toggle tema Light/Dark mode di pojok kanan atas login kini berbentuk toggle iOS bulat rapi.

---

## ⚠️ Catatan Penting Mengenai Izin Google Apps Script (HTTP 401):
Jika saat login muncul pesan akses atau koneksi terputus:
1. Buka script Anda di `script.google.com`.
2. Klik tombol biru **Deploy** (Terapkan) > **Manage deployments** (Kelola deployment).
3. Klik ikon pensil **Edit**.
4. Di bagian **Who has access** (Siapa yang memiliki akses), pastikan memilih: **Anyone** (Siapa saja) — *bukan "Only myself"*.
5. Klik **Deploy** (Terapkan).
