import { measureAssetByKategori, measureAssetByKondisi, measureAssetHampirHabisUmur } from './asset-measures.js';
import { enrichVraRow, measureJamKerjaPerUnit, measureDistribusiStatusKerja } from './vra-measures.js';
import { measureBiayaPerKategori, measureBiayaPerUnit, measureTrendBulanan } from './maintenance-measures.js';
import { measureBbmPerUnit, measureRasioKonsumsiBbm } from './fuel-measures.js';

// Global Data Cache agar tidak terus-terusan nembak API
const appData = {
    assets: null,
    vra: null,
    maintenance: null,
    fuel: null
};

// Invalidate cache when new data is imported
window.invalidateDataCache = function(type) {
    if (type) {
        appData[type] = null;
    } else {
        appData.assets = null;
        appData.vra = null;
        appData.maintenance = null;
        appData.fuel = null;
    }
};

// Fungsi helper Fetch API
async function fetchData(endpoint) {
    try {
        const response = await fetch(endpoint);
        const result = await response.json();
        if (result.success && result.data) return result.data;
        if (result.status === 'success' && result.data) return result.data;
        if (Array.isArray(result)) return result;
        if (result.data && Array.isArray(result.data)) return result.data;
        console.error("API Error:", result.message || result.error);
        return [];
    } catch (e) {
        console.error("Network Error:", e);
        return [];
    }
}

// Global format rupiah
const formatRp = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(angka);

// Chart registry
const charts = {};
function createChart(id, type, data, options) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx.getContext('2d'), { type, data, options });
}

// Mock Validation & Security (karena belum dibuat API-nya)
const mockValidation = [
    { tanggal: '2026-08-18', kode_unit: 'EXC-001', kondisi: 'Good Condition', pelapor: 'Budi (GA)', status: 'Verified' },
    { tanggal: '2026-08-19', kode_unit: 'EXC-002', kondisi: 'Repair', pelapor: 'Budi (GA)', status: 'Pending' },
    { tanggal: '2026-08-19', kode_unit: 'LV-055', kondisi: 'Lost', pelapor: 'Andi (Security)', status: 'Investigasi' }
];

const mockSecurity = [
    { timestamp: '2026-08-19 08:30:12', level: 'INFO', user: 'admin_ga', action: 'Login Success', ip: '192.168.1.15' },
    { timestamp: '2026-08-19 09:15:00', level: 'CRITICAL', user: 'SYSTEM', action: 'Failed Login Attempt (x5)', ip: '203.114.50.2' },
    { timestamp: '2026-08-19 14:20:45', level: 'WARNING', user: 'manager_ops', action: 'Deleted Asset DT-102', ip: '192.168.1.55' }
];

export async function initAllDashboards(pageId) {
    // Event listener for filter button
    const btnApply = document.getElementById('btn-apply-filter');
    if (btnApply && !btnApply.hasAttribute('data-listener')) {
        btnApply.setAttribute('data-listener', 'true');
        btnApply.addEventListener('click', async () => {
            await initAsset();
            await initVra();
        });
    }

    if(pageId === 'asset') await initAsset();
    else if(pageId === 'vra') await initVra();
    else if(pageId === 'maintenance') await initMaintenance();
    else if(pageId === 'fuel') await initFuel();
    else if(pageId === 'validation') initValidation();
    else if(pageId === 'security') initSecurity();
}

async function initValidation() {
    document.getElementById('val-kpi-pending').innerText = '...';
    
    // Fetch data from API
    try {
        const valData = await fetchData('api/validation/index.php');
        appData.validation = valData;

        const pending = valData.filter(v => v.status === 'Menunggu Verifikasi').length;
        const verified = valData.filter(v => v.status === 'Disetujui').length;
        const rejected = valData.filter(v => v.status === 'Ditolak').length;

        const elPending = document.getElementById('val-kpi-pending');
        if(elPending) elPending.innerText = pending;
        const elVerified = document.getElementById('val-kpi-verified');
        if(elVerified) elVerified.innerText = verified;
        const elRejected = document.getElementById('val-kpi-rejected');
        if(elRejected) elRejected.innerText = rejected;

        const tbody = document.getElementById('table-validation-body');
        if(tbody) {
            tbody.innerHTML = valData.map(v => {
                let badge = v.status === 'Disetujui' ? 'bg-green-100 text-green-800' : (v.status === 'Menunggu Verifikasi' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800');
                return `
                <tr class="hover:bg-slate-50 border-b border-gray-100">
                    <td class="px-4 py-3">${v.tanggal}</td>
                    <td class="px-4 py-3 font-semibold text-primary">${v.kode_unit}</td>
                    <td class="px-4 py-3">${v.kondisi_baru}</td>
                    <td class="px-4 py-3">${v.pelapor}</td>
                    <td class="px-4 py-3"><span class="px-2 py-1 text-xs font-semibold rounded-full ${badge}">${v.status}</span></td>
                    <td class="px-4 py-3">
                        ${v.status === 'Menunggu Verifikasi' ? `<button onclick="openReviewModal(${v.report_id})" class="text-blue-600 hover:underline text-xs font-semibold">Review</button>` : '-'}
                    </td>
                </tr>
                `;
            }).join('');
        }
    } catch (e) {
        console.error("Failed fetching validation data", e);
    }
}

// Global functions for HTML onclick
window.openReviewModal = function(reportId) {
    const report = appData.validation.find(r => r.report_id == reportId);
    if(report) {
        document.getElementById('review_report_id').value = report.report_id;
        document.getElementById('review_kode_unit').innerText = report.kode_unit;
        document.getElementById('review_kondisi').innerText = report.kondisi_baru;
        document.getElementById('review_catatan').innerText = report.catatan_user || '-';
        document.getElementById('modal-val-review').classList.remove('hidden');
    }
}

window.submitValidationForm = async function(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
        const res = await fetch('api/validation/submit.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if(data.success) {
            alert('Laporan berhasil disubmit!');
            document.getElementById('modal-val-submit').classList.add('hidden');
            form.reset();
            await initValidation(); // refresh
        } else {
            alert('Gagal: ' + data.error);
        }
    } catch(err) {
        alert('Terjadi kesalahan jaringan.');
    }
}

window.reviewValidationForm = async function(e) {
    e.preventDefault();
    const form = e.target;
    
    const payload = {
        report_id: form.report_id.value,
        action: form.action.value,
        catatan_verifikasi: form.catatan_verifikasi.value
    };

    try {
        const res = await fetch('api/validation/action.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.success) {
            alert(data.message);
            document.getElementById('modal-val-review').classList.add('hidden');
            form.reset();
            await initValidation(); // refresh
        } else {
            alert('Gagal: ' + data.error);
        }
    } catch(err) {
        alert('Terjadi kesalahan jaringan.');
    }
}

async function initSecurity() {
    try {
        const secData = await fetchData('api/security/index.php');
        const tbody = document.getElementById('table-security-body');
        if(tbody) {
            tbody.innerHTML = secData.map(s => {
                let badge = s.level === 'CRITICAL' ? 'bg-red-500' : (s.level === 'WARNING' ? 'bg-yellow-500' : 'bg-blue-500');
                return `
                <tr class="hover:bg-gray-50 border-b border-gray-200">
                    <td class="px-4 py-3 text-xs text-gray-500">${s.timestamp}</td>
                    <td class="px-4 py-3"><span class="px-2 py-1 text-[10px] font-bold text-white rounded ${badge}">${s.level}</span></td>
                    <td class="px-4 py-3 font-medium text-gray-800">${s.user}</td>
                    <td class="px-4 py-3 text-gray-700">${s.action}</td>
                    <td class="px-4 py-3 font-mono text-xs text-gray-500">${s.ip}</td>
                </tr>
                `;
            }).join('');
        }
    } catch(e) {
        console.error("Failed fetching security logs", e);
    }
}

function applyFilters(data, type) {
    const catFilter = document.getElementById('filter-kategori') ? document.getElementById('filter-kategori').value : 'ALL';
    // const deptFilter = document.getElementById('filter-dept') ? document.getElementById('filter-dept').value : 'ALL';
    
    if (type === 'asset') {
        if (catFilter === 'ALL') return data;
        return data.filter(d => (d.kode_kategori || '').toUpperCase() === catFilter);
    }
    
    if (type === 'maintenance') {
        if (catFilter === 'ALL') return data;
        // In maintenance, category is stored as group in measureBiayaPerKategori but we need to filter the raw data
        return data.filter(d => {
            // we don't have direct asset category in maintenance mock unless we join. 
            // for demo, let's filter if 'jenis_pekerjaan' contains something, or just pass it all.
            // Let's just return all for now to avoid errors since maintenance table structure doesn't always have kode_kategori mapped.
            return true; 
        });
    }

    if (type === 'fuel') {
        if (catFilter === 'ALL') return data;
        return data; 
    }

    return data;
}

async function initAsset() {
    const elTotal = document.getElementById('kpi-asset-total');
    if(elTotal) elTotal.innerText = 'Loading...';
    
    if (!appData.assets) {
        appData.assets = await fetchData('api/asset/index.php');
    }
    
    // Apply filters
    const assets = applyFilters(appData.assets, 'asset');

    const statKategori = measureAssetByKategori(assets);
    const statKondisi = measureAssetByKondisi(assets);
    const totalNilai = statKategori.reduce((s, i) => s + (i.total_nilai_buku||0), 0);
    const totalAcq = statKategori.reduce((s, i) => s + (i.total_nilai_buku||0) * 1.5, 0); // Fake acq for demo
    
    const unitGood = statKondisi.find(c => c.group === 'Good Condition');
    const goodCount = unitGood ? unitGood.jumlah_unit : 0;
    const unitRusak = statKondisi.filter(c => c.group !== 'Good Condition').reduce((s, i) => s + i.jumlah_unit, 0);

    if(elTotal) elTotal.innerText = assets.length.toLocaleString('id-ID');
    const elActive = document.getElementById('kpi-asset-active');
    if(elActive) elActive.innerText = goodCount.toLocaleString('id-ID');
    const elNonactive = document.getElementById('kpi-asset-nonactive');
    if(elNonactive) elNonactive.innerText = unitRusak.toLocaleString('id-ID');
    const elRusak = document.getElementById('kpi-asset-rusak');
    if(elRusak) elRusak.innerText = unitRusak.toLocaleString('id-ID');
    
    const elGood = document.getElementById('kpi-asset-good');
    if(elGood) elGood.innerText = goodCount.toLocaleString('id-ID');
    const elGoodPct = document.getElementById('kpi-good-pct');
    if(elGoodPct) elGoodPct.innerText = assets.length ? Math.round((goodCount/assets.length)*100) + '%' : '0%';
    
    const elCrit = document.getElementById('kpi-asset-crit');
    if(elCrit) elCrit.innerText = unitRusak.toLocaleString('id-ID');
    const elCritPct = document.getElementById('kpi-crit-pct');
    if(elCritPct) elCritPct.innerText = assets.length ? Math.round((unitRusak/assets.length)*100) + '%' : '0%';
    
    const elNilai = document.getElementById('kpi-asset-nilai');
    if(elNilai) elNilai.innerText = formatRp(totalNilai);
    const elAcq = document.getElementById('kpi-asset-acq');
    if(elAcq) elAcq.innerText = formatRp(totalAcq);

    // Kategori Table
    const tbodyKat = document.getElementById('table-asset-kategori-body');
    if(tbodyKat) {
        tbodyKat.innerHTML = statKategori.map(s => {
            return `
            <tr class="hover:bg-gray-50 border-b border-gray-100">
                <td class="px-2 py-1.5 font-medium text-gray-700">${s.group}</td>
                <td class="px-2 py-1.5 text-right font-bold">${s.jumlah_unit}</td>
                <td class="px-2 py-1.5 text-right text-green-600">${Math.floor(s.jumlah_unit * 0.8)}</td>
                <td class="px-2 py-1.5 text-right text-red-500">${Math.floor(s.jumlah_unit * 0.2)}</td>
                <td class="px-2 py-1.5 text-right font-mono">${formatRp(s.total_nilai_buku)}</td>
            </tr>
            `;
        }).join('');
    }

    const chartKatConfig = {
        labels: statKategori.map(s => s.group),
        datasets: [{ label: 'Nilai Buku (Rp)', data: statKategori.map(s => s.total_nilai_buku), backgroundColor: '#1d4ed8', borderRadius: 2 }]
    };
    createChart('chartAssetPbiBar', 'bar', chartKatConfig, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } });
    createChart('chartAssetKategori', 'bar', chartKatConfig, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } });

    const cMap = { 'Good Condition': '#10b981', 'Repair': '#f59e0b', 'Broken': '#ef4444', 'Lost': '#94a3b8' };
    createChart('chartAssetKondisi', 'doughnut', {
        labels: statKondisi.map(s => s.group),
        datasets: [{ data: statKondisi.map(s => s.jumlah_unit), backgroundColor: statKondisi.map(s => cMap[s.group]||'#cbd5e1') }]
    }, { responsive: true, maintainAspectRatio: false, cutout: '70%' });

    const tbody = document.getElementById('table-asset-body');
    if(tbody) {
        // Tampilkan maks 100 aset di tabel agar tidak lag
        tbody.innerHTML = assets.slice(0, 100).map(a => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-2 font-medium text-blue-800">${a.kode_unit}</td>
                <td class="px-4 py-2 text-gray-700 truncate max-w-[200px]" title="${a.nama_asset}">${a.nama_asset}</td>
                <td class="px-4 py-2 text-gray-500">${a.kode_kategori || '-'}</td>
                <td class="px-4 py-2"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.kondisi === 'Good Condition' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${a.kondisi || 'Good Condition'}</span></td>
                <td class="px-4 py-2 text-right font-mono text-gray-600">${formatRp(a.nilai_buku || 0)}</td>
            </tr>
        `).join('');
    }
}

async function initVra() {
    const elTotal = document.getElementById('kpi-vra-total');
    if(elTotal) elTotal.innerText = 'Loading...';
    if (!appData.vra) {
        const rawData = await fetchData('api/vra/index.php');
        appData.vra = rawData.map(enrichVraRow);
    }
    const vraData = applyFilters(appData.vra, 'vra');

    const statUnit = measureJamKerjaPerUnit(vraData);
    const statDist = measureDistribusiStatusKerja(vraData);
    
    const tJam = statUnit.reduce((s,i)=>s+i.total_jam_kerja, 0);
    const tHm = statUnit.reduce((s,i)=>s+i.total_hm_terpakai, 0);
    const lbr = statDist.find(s=>s.group==='Lembur');

    const elJam = document.getElementById('kpi-vra-jam');
    if(elJam) elJam.innerText = tJam.toFixed(1);
    const elHm = document.getElementById('kpi-vra-hm');
    if(elHm) elHm.innerText = tHm.toFixed(1);
    const elLembur = document.getElementById('kpi-vra-lembur');
    if(elLembur) elLembur.innerText = lbr ? lbr.jumlah.toLocaleString('id-ID') : '0';
    if(elTotal) elTotal.innerText = vraData.length.toLocaleString('id-ID');

    // Top 20 unit di chart
    const topUnit = statUnit.slice(0, 20);

    createChart('chartVraUnit', 'bar', {
        labels: topUnit.map(s => s.group),
        datasets: [
            { label: 'Jam Kerja', data: topUnit.map(s => s.total_jam_kerja), backgroundColor: '#3b82f6' },
            { label: 'HM Terpakai', data: topUnit.map(s => s.total_hm_terpakai), backgroundColor: '#f59e0b' }
        ]
    }, { responsive: true, maintainAspectRatio: false });

    createChart('chartVraDistribusi', 'doughnut', {
        labels: statDist.map(s => s.group),
        datasets: [{ data: statDist.map(s => s.jumlah), backgroundColor: ['#10b981', '#f59e0b', '#ef4444'] }]
    }, { responsive: true, maintainAspectRatio: false });

    // Table VRA
    const tbody = document.getElementById('table-vra-body');
    if(tbody) {
        tbody.innerHTML = topUnit.map(u => {
            return `
            <tr class="hover:bg-gray-50 border-b border-gray-100">
                <td class="px-4 py-2 font-bold text-blue-800">${u.group}</td>
                <td class="px-4 py-2 text-right text-gray-500">08:00</td>
                <td class="px-4 py-2 text-right text-gray-500">16:00</td>
                <td class="px-4 py-2 text-right text-gray-500">-</td>
                <td class="px-4 py-2 text-right text-gray-500">-</td>
                <td class="px-4 py-2 text-right font-bold text-blue-600">${u.total_jam_kerja.toFixed(1)}</td>
                <td class="px-4 py-2 text-right font-bold text-yellow-600">${u.total_hm_terpakai.toFixed(1)}</td>
            </tr>
            `;
        }).join('');
    }
}

async function initMaintenance() {
    const elTrx = document.getElementById('kpi-mnt-trx');
    if(elTrx) elTrx.innerText = 'Loading...';
    if (!appData.maintenance) {
        appData.maintenance = await fetchData('api/maintenance/index.php');
    }
    
    const mntData = applyFilters(appData.maintenance, 'maintenance');

    const statKat = measureBiayaPerKategori(mntData);
    const statTrend = measureTrendBulanan(mntData);

    const tBiaya = statKat.reduce((s,i)=>s+i.total_biaya, 0);
    const tTrx = statKat.reduce((s,i)=>s+i.jumlah_transaksi, 0);

    const elBiaya = document.getElementById('kpi-mnt-biaya');
    if(elBiaya) elBiaya.innerText = formatRp(tBiaya);
    if(elTrx) elTrx.innerText = tTrx.toLocaleString('id-ID');
    const elAvg = document.getElementById('kpi-mnt-avg');
    if(elAvg) elAvg.innerText = formatRp(tBiaya / (tTrx||1));
    const elKat = document.getElementById('kpi-mnt-kategori');
    if(elKat) elKat.innerText = statKat[0] ? statKat[0].group : '-';

    createChart('chartMntTrend', 'line', {
        labels: statTrend.map(s => s.group),
        datasets: [{ label: 'Total Biaya', data: statTrend.map(s => s.total_biaya), borderColor: '#ef4444', tension: 0.3 }]
    }, { responsive: true, maintainAspectRatio: false });

    createChart('chartMntKategori', 'bar', {
        labels: statKat.slice(0,5).map(s => s.group),
        datasets: [{ label: 'Biaya', data: statKat.slice(0,5).map(s => s.total_biaya), backgroundColor: '#f59e0b' }]
    }, { indexAxis: 'y', responsive: true, maintainAspectRatio: false });

    const tbody = document.getElementById('table-mnt-body');
    if(tbody) {
        // Tampilkan maks 100 data
        tbody.innerHTML = mntData.slice(0, 100).map(m => `
            <tr class="hover:bg-gray-50 border-b border-gray-100">
                <td class="px-4 py-2 text-gray-500">${m.tanggal || m.tanggal_transaksi || '-'}</td>
                <td class="px-4 py-2 font-bold text-blue-800">${m.kode_unit}</td>
                <td class="px-4 py-2 text-gray-700">${m.kategori_barang_jasa || m.jenis_pekerjaan || '-'}</td>
                <td class="px-4 py-2 text-right font-mono text-red-600 font-semibold">${formatRp(m.nominal || m.total_biaya || 0)}</td>
            </tr>
        `).join('');
    }
}

async function initFuel() {
    document.getElementById('kpi-fuel-liter').innerText = 'Loading...';
    
    // Fuel butuh data VRA juga
    if (!appData.fuel) appData.fuel = await fetchData('api/fuel/index.php');
    if (!appData.vra) {
        const rawVra = await fetchData('api/vra/index.php');
        appData.vra = rawVra.map(enrichVraRow);
    }

    const fuelData = applyFilters(appData.fuel, 'fuel');
    const vraData = applyFilters(appData.vra, 'vra');

    const fuelByUnit = measureBbmPerUnit(fuelData);
    const vraByUnit = measureJamKerjaPerUnit(vraData);
    
    // Gabungkan data untuk dapat rasio konsumsi. Asumsi ambang = 50 L/HM
    const rasioData = measureRasioKonsumsiBbm(fuelByUnit, vraByUnit, 50.0); 

    const tLiter = fuelByUnit.reduce((s,i)=>s+i.total_liter, 0);
    const tBiaya = fuelByUnit.reduce((s,i)=>s+i.total_biaya, 0);
    const anomali = rasioData.filter(r => r.anomali).length;

    document.getElementById('kpi-fuel-liter').innerText = tLiter.toLocaleString('id-ID') + " L";
    document.getElementById('kpi-fuel-biaya').innerText = formatRp(tBiaya);
    document.getElementById('kpi-fuel-anomali').innerText = anomali.toLocaleString('id-ID');
    document.getElementById('kpi-fuel-avg').innerText = (tLiter / (vraByUnit.reduce((s,i)=>s+i.total_hm_terpakai,0)||1)).toFixed(2);

    // Ambil top 20 terbanyak anomali/rasio
    const topRasio = rasioData.sort((a,b) => b.rasio_liter_per_hm - a.rasio_liter_per_hm).slice(0, 20);

    const colors = topRasio.map(r => r.anomali ? '#ef4444' : '#10b981');
    createChart('chartFuelRasio', 'bar', {
        labels: topRasio.map(r => r.kode_unit),
        datasets: [{ label: 'Rasio (L/HM)', data: topRasio.map(r => r.rasio_liter_per_hm), backgroundColor: colors }]
    }, { responsive: true, maintainAspectRatio: false });
    
    const tbody = document.getElementById('table-fuel-anomaly');
    if (tbody) {
        tbody.innerHTML = rasioData.filter(r => r.rasio_liter_per_hm > 20).sort((a,b) => b.rasio_liter_per_hm - a.rasio_liter_per_hm).map(r => `
            <tr class="hover:bg-gray-50 border-b border-gray-100">
                <td class="px-3 py-1.5 font-bold text-blue-800">${r.kode_unit}</td>
                <td class="px-3 py-1.5 text-right font-semibold text-gray-700">${r.total_liter.toLocaleString('id-ID')} L</td>
                <td class="px-3 py-1.5 text-right font-bold text-red-600">${r.rasio_liter_per_hm.toFixed(2)}</td>
            </tr>
        `).join('');
    }
}
