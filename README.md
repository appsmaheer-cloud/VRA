# Portal Layanan General Services (GS) & Ruang Meeting
### PT Pratama Nusantara Sakti

Portal terpadu untuk pemesanan ruang meeting, permintaan kendaraan operasional lapangan, pengajuan ATK, approval berjenjang, dan monitoring aset.

---

## 🌐 Arsitektur Sistem Hybrid
Aplikasi ini berjalan dengan arsitektur **Serverless Hybrid**:
1. **Frontend / Website:** Hosted di GitHub Pages (`https://<username>.github.io/<repo>/`).
2. **Backend & Business Logic:** Google Apps Script (REST/RPC API Web App).
3. **Database:** Google Sheets (13 Tabs relational database).

---

## 📁 Struktur File Repository
- **`index.html`**: Halaman utama portal untuk seluruh Karyawan / Pemohon (Login, Dashboard, Kalender Meeting, Formulir ATK, Permintaan Mobil, Tracking Riwayat).
- **`admin.html`**: Halaman konsol khusus Administrator GS & IT (Persetujuan User Baru, Manajemen Supir & Mobil, Monitoring & Approval).
- **`README.md`**: Informasi repositori dan panduan operasional.

---

## ⚡ Cara Menghubungkan ke Google Sheets & Apps Script
1. Buka website di browser: `https://<username>.github.io/<repo>/`
2. Klik tombol **`⚙️ Google Sheets API`** di pojok kanan bawah.
3. Masukkan **URL Web App Google Apps Script** Anda:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
4. Klik **"Simpan & Hubungkan"**.
5. Selesai! Seluruh data otomatis membaca dan menulis langsung ke Google Spreadsheet perusahaan secara *real-time*.
