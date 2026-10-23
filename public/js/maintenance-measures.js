/**
 * maintenance-measures.js
 * Maintenance calculations and DAX measures conforming to Power Query M and PowerBI specifications.
 */

import { applyFilter, groupAggregate, Agg } from './core-measures.js';

/**
 * Normalizes location codes from Power Query M:
 * CO -> CENTRAL, E1 -> ESTATE 1, E2 -> ESTATE 2, E3 -> ESTATE 3, FR -> FACTORY, HO -> HEAD OFFICE
 */
export function normalizeLocation(loc) {
    if (!loc) return 'CENTRAL';
    const clean = loc.trim().toUpperCase();
    const map = {
        'CO': 'CENTRAL',
        'CENTRAL': 'CENTRAL',
        'E1': 'ESTATE 1',
        'ESTATE 1': 'ESTATE 1',
        'E2': 'ESTATE 2',
        'ESTATE 2': 'ESTATE 2',
        'E3': 'ESTATE 3',
        'ESTATE 3': 'ESTATE 3',
        'FR': 'FACTORY',
        'FACTORY': 'FACTORY',
        'HO': 'HEAD OFFICE',
        'HEAD OFFICE': 'HEAD OFFICE'
    };
    return map[clean] || clean;
}

/**
 * Enrich single maintenance row according to Power Query M logic:
 * - Clean KODE UNIT (remove spaces)
 * - Derive JENIS_SERVICES & KATEGORI_SERVICES
 * - Normalize LOCATION
 */
export function enrichMaintenanceRow(row) {
    const rawUnit = row.kode_unit || row['KODE UNIT'] || '';
    const cleanUnit = String(rawUnit).replace(/\s+/g, '').trim();

    const nominal = Number(row.nominal || row.NOMINAL || row.nominal_edit || 0);
    const qty = Number(row.qty || row.QTY || 1);
    const tanggal = row.tanggal || row.TANGGAL || '';
    const namaPart = row.nama_spare_part_jasa || row['NAMA SPARE PART & JASA'] || row.description || row.DESCRIPTION || '-';
    const rawCoa = row.nama_coa || row.NAMA_COA || row.kategori_barang_jasa || '';

    // Power Query M logic: JENIS_SERVICES & KATEGORI_SERVICES
    let jenisServices = 'MATERIAL';
    let kategoriServices = 'MESIN & INSTALASI';

    if (rawCoa.includes('-')) {
        const parts = rawCoa.split('-');
        if (parts.length >= 2) {
            let part2 = parts[1].trim();
            // Replacements
            part2 = part2.replace(/MESIN & PERALATAN/gi, 'MATERIAL')
                         .replace(/BOP/gi, 'MATERIAL')
                         .replace(/\s*MATERIAL\s*/gi, 'MATERIAL');
            jenisServices = part2 || 'MATERIAL';

            let part1 = parts[0].trim();
            if (part1.length > 19) {
                part1 = part1.substring(19).trim();
            }
            kategoriServices = part1 || 'MESIN & INSTALASI';
        }
    } else if (row.kategori_barang_jasa) {
        kategoriServices = row.kategori_barang_jasa;
    }

    const cleanLocation = normalizeLocation(row.location || row.LOCATION);
    const kodeSection = row.kode_section || row.KODE_SECTION || row.dept || row.DEPT || 'WORKSHOP';

    return {
        ...row,
        kode_unit: cleanUnit,
        tanggal: tanggal,
        nominal: nominal,
        qty: qty,
        nama_spare_part_jasa: namaPart,
        JENIS_SERVICES: jenisServices,
        KATEGORI_SERVICES: kategoriServices,
        location: cleanLocation,
        kode_section: kodeSection
    };
}

export function enrichMaintenance(rows) {
    return rows.map(enrichMaintenanceRow);
}

/**
 * DAX Measure: AllMeasure for Maintenance
 * Computes TOTAL MAINTENANCE, Quantity Part, ServiceFrequencyPerUnit, and Unit Counts.
 */
export function measureMaintenanceSummary(maintRows) {
    const distinctUnits = new Set(maintRows.map(m => m.kode_unit).filter(Boolean));
    const distinctCount = distinctUnits.size;
    const totalTrx = maintRows.length;

    let totalBiaya = 0;
    let totalQty = 0;
    let maxDate = '';

    maintRows.forEach(m => {
        totalBiaya += m.nominal || 0;
        totalQty += m.qty || 0;
        if (m.tanggal && m.tanggal > maxDate) {
            maxDate = m.tanggal;
        }
    });

    const avgCostPerUnit = distinctCount > 0 ? (totalBiaya / distinctCount) : 0;
    const avgCostPerTrx = totalTrx > 0 ? (totalBiaya / totalTrx) : 0;
    const serviceFrequency = distinctCount > 0 ? (totalTrx / distinctCount) : 0;

    return {
        total_biaya: totalBiaya,
        distinct_units: distinctCount,
        total_transaksi: totalTrx,
        total_qty_parts: totalQty,
        avg_cost_per_unit: avgCostPerUnit,
        avg_cost_per_trx: avgCostPerTrx,
        service_frequency: serviceFrequency,
        last_service_date: maxDate || '-'
    };
}

/** Total biaya maintenance per KATEGORI MATERIAL HIERARCHY */
export function measureBiayaPerKategoriMaterial(rows, filters = {}) {
    const filtered = applyFilter(rows, filters);
    return groupAggregate(
        filtered,
        (row) => row.kategori_material || 'Consumable & Fast Moving',
        {
            total_biaya: Agg.sum('nominal'),
            jumlah_transaksi: Agg.count(),
            total_qty: Agg.sum('qty')
        }
    ).sort((a, b) => b.total_biaya - a.total_biaya);
}

/** Total biaya maintenance per SUB KATEGORI MATERIAL HIERARCHY */
export function measureBiayaPerSubKategoriMaterial(rows, filters = {}) {
    const filtered = applyFilter(rows, filters);
    return groupAggregate(
        filtered,
        (row) => row.sub_kategori_material || 'Lain-lain',
        {
            total_biaya: Agg.sum('nominal'),
            jumlah_transaksi: Agg.count(),
            total_qty: Agg.sum('qty')
        }
    ).sort((a, b) => b.total_biaya - a.total_biaya);
}

/** Total biaya maintenance per KATEGORI_SERVICES */
export function measureBiayaPerKategori(rows, filters = {}) {
    const filtered = applyFilter(rows, filters);
    return groupAggregate(
        filtered,
        (row) => row.kategori_material || row.KATEGORI_SERVICES || row.kategori_barang_jasa || 'MESIN & INSTALASI',
        {
            total_biaya: Agg.sum('nominal'),
            jumlah_transaksi: Agg.count(),
            total_qty: Agg.sum('qty')
        }
    ).sort((a, b) => b.total_biaya - a.total_biaya);
}

/** Total biaya maintenance per JENIS_SERVICES (JASA vs MATERIAL) */
export function measureBiayaPerJenisServices(rows, filters = {}) {
    const filtered = applyFilter(rows, filters);
    return groupAggregate(
        filtered,
        (row) => row.JENIS_SERVICES || 'MATERIAL',
        {
            total_biaya: Agg.sum('nominal'),
            jumlah_transaksi: Agg.count()
        }
    ).sort((a, b) => b.total_biaya - a.total_biaya);
}

/** Total biaya maintenance per unit (kode_unit) */
export function measureBiayaPerUnit(rows, filters = {}) {
    const filtered = applyFilter(rows, filters);
    return groupAggregate(
        filtered,
        (row) => row.kode_unit || 'TANPA KODE UNIT',
        { 
            total_biaya: Agg.sum('nominal'), 
            jumlah_transaksi: Agg.count(),
            total_qty: Agg.sum('qty')
        }
    ).sort((a, b) => b.total_biaya - a.total_biaya);
}

/** Total biaya maintenance per section / departemen */
export function measureBiayaPerSection(rows, filters = {}) {
    const filtered = applyFilter(rows, filters);
    return groupAggregate(
        filtered,
        (row) => row.kode_section || 'WORKSHOP',
        { 
            total_biaya: Agg.sum('nominal'), 
            jumlah_transaksi: Agg.count()
        }
    ).sort((a, b) => b.total_biaya - a.total_biaya);
}

/** Trend biaya per bulan (YYYY-MM) */
export function measureTrendBulanan(rows, filters = {}) {
    const filtered = applyFilter(rows, filters);
    const result = groupAggregate(
        filtered,
        (row) => {
            if (!row.tanggal) return 'UNKNOWN';
            const d = new Date(row.tanggal);
            if (isNaN(d.getTime())) return 'UNKNOWN';
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        },
        { total_biaya: Agg.sum('nominal'), jumlah_transaksi: Agg.count() }
    ).filter(r => r.group !== 'UNKNOWN');
    return result.sort((a, b) => a.group.localeCompare(b.group));
}

/**
 * DAX Measure: Hierarchical Time Series Trend with Multi-Level Drill-Down
 * Granularity: 'year' | 'month' | 'week' | 'day'
 */
export function measureTrendHierarchical(rows, level = 'year', filterYear = null, filterMonth = null) {
    const monthNames = [
        '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const monthShort = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    let validRows = rows.filter(r => {
        if (!r.tanggal) return false;
        const d = new Date(r.tanggal);
        if (isNaN(d.getTime())) return false;
        const y = d.getFullYear().toString();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        if (filterYear && filterYear !== 'ALL' && y !== filterYear.toString()) return false;
        if (filterMonth && filterMonth !== 'ALL' && m !== filterMonth.toString().padStart(2, '0')) return false;
        return true;
    });

    const groups = new Map();

    validRows.forEach(r => {
        const d = new Date(r.tanggal);
        const y = d.getFullYear().toString();
        const mNum = d.getMonth() + 1;
        const mStr = mNum.toString().padStart(2, '0');
        const dayNum = d.getDate();
        const dayStr = dayNum.toString().padStart(2, '0');

        let key = '';
        let label = '';
        let sortKey = '';

        if (level === 'year') {
            key = y;
            label = y;
            sortKey = y;
        } else if (level === 'month') {
            key = `${y}-${mStr}`;
            label = filterYear ? `${monthNames[mNum]}` : `${monthShort[mNum]} ${y}`;
            sortKey = `${y}-${mStr}`;
        } else if (level === 'week') {
            const wNum = Math.min(5, Math.ceil(dayNum / 7));
            key = `${y}-${mStr}-W${wNum}`;
            const startDay = ((wNum - 1) * 7 + 1).toString().padStart(2, '0');
            const endDay = Math.min(dayNum <= 28 ? wNum * 7 : 31, 31).toString().padStart(2, '0');
            label = `Mg ${wNum} (${startDay}-${endDay} ${monthShort[mNum]})`;
            sortKey = `${y}-${mStr}-${wNum}`;
        } else if (level === 'day') {
            key = `${y}-${mStr}-${dayStr}`;
            label = `${dayStr} ${monthShort[mNum]}`;
            sortKey = `${y}-${mStr}-${dayStr}`;
        }

        if (!groups.has(key)) {
            groups.set(key, {
                group: key,
                label: label,
                sortKey: sortKey,
                total_biaya: 0,
                jumlah_transaksi: 0,
                total_qty: 0,
                year: y,
                month: mStr,
                day: dayStr
            });
        }

        const g = groups.get(key);
        g.total_biaya += (Number(r.nominal || r.biaya || r.total_biaya) || 0);
        g.jumlah_transaksi += 1;
        g.total_qty += (Number(r.qty) || 1);
    });

    const result = Array.from(groups.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return result;
}

/**
 * DAX Measure: Detailed Spare Parts & Material Log (For View Detail Maintenance)
 */
export function measureMaintenanceMaterialDetail(maintRows) {
    const partMap = new Map();

    maintRows.forEach(m => {
        const name = (m.nama_spare_part_jasa || m.description || 'GENERAL MAINTENANCE').trim();
        if (!partMap.has(name)) {
            partMap.set(name, {
                part_name: name,
                jenis: m.JENIS_SERVICES || 'MATERIAL',
                kategori: m.KATEGORI_SERVICES || 'MESIN & INSTALASI',
                total_qty: 0,
                total_cost: 0,
                freq: 0,
                units: new Set(),
                last_date: ''
            });
        }
        const p = partMap.get(name);
        p.total_qty += (Number(m.qty) || 1);
        p.total_cost += (Number(m.nominal) || 0);
        p.freq += 1;
        if (m.kode_unit) p.units.add(m.kode_unit);
        if (m.tanggal && (!p.last_date || m.tanggal > p.last_date)) {
            p.last_date = m.tanggal;
        }
    });

    const partsList = Array.from(partMap.values()).map(p => ({
        ...p,
        affected_units_count: p.units.size,
        avg_cost_per_qty: p.total_qty > 0 ? (p.total_cost / p.total_qty) : 0
    })).sort((a, b) => b.total_cost - a.total_cost);

    return {
        partsList: partsList,
        top10ByCost: partsList.slice(0, 10),
        top10ByQty: [...partsList].sort((a, b) => b.total_qty - a.total_qty).slice(0, 10),
        rawLogs: maintRows.slice(0, 150)
    };
}

/**
 * DAX Measure: Breakdown Biaya Servis per Jenis & Kategori (Material vs Jasa/BOP)
 */
export function measureMaintenanceServiceBreakdown(maintRows) {
    const jenisMap = new Map();
    const coaMap = new Map();
    let totalCost = 0;
    let totalTrx = maintRows.length;

    maintRows.forEach(m => {
        const cost = Number(m.nominal) || 0;
        totalCost += cost;

        const jenis = m.JENIS_SERVICES || 'MATERIAL';
        if (!jenisMap.has(jenis)) jenisMap.set(jenis, { jenis, totalCost: 0, count: 0 });
        const jObj = jenisMap.get(jenis);
        jObj.totalCost += cost;
        jObj.count++;

        const coa = m.kategori_barang_jasa || m.NAMA_COA || m.nama_coa || 'LAINNYA';
        if (!coaMap.has(coa)) coaMap.set(coa, { coa, totalCost: 0, count: 0 });
        const cObj = coaMap.get(coa);
        cObj.totalCost += cost;
        cObj.count++;
    });

    const jenisList = Array.from(jenisMap.values()).map(j => ({
        ...j,
        pct: totalCost > 0 ? (j.totalCost / totalCost) * 100 : 0
    })).sort((a, b) => b.totalCost - a.totalCost);

    const coaList = Array.from(coaMap.values()).map(c => ({
        ...c,
        pct: totalCost > 0 ? (c.totalCost / totalCost) * 100 : 0
    })).sort((a, b) => b.totalCost - a.totalCost);

    return {
        totalCost,
        totalTrx,
        jenisList,
        coaList
    };
}

/**
 * DAX Measure: Analisis Frekuensi Servis & Repeat Failure Maintenance
 */
export function measureMaintenanceFrequencyReport(maintRows, assets = []) {
    const unitMap = new Map();
    const assetMap = new Map(assets.map(a => [(a.kode_unit || '').trim(), a]));

    maintRows.forEach(m => {
        const u = String(m.kode_unit || '').trim();
        if (!unitMap.has(u)) {
            const a = assetMap.get(u) || {};
            unitMap.set(u, {
                kode_unit: u || 'NON-UNIT',
                nama_asset: a.nama_asset || m.description || '-',
                kategori: a.kode_kategori || 'GENERAL',
                lokasi: a.location || m.LOCATION || 'CENTRAL',
                total_cost: 0,
                service_count: 0,
                last_service_date: ''
            });
        }
        const obj = unitMap.get(u);
        obj.total_cost += (Number(m.nominal) || 0);
        obj.service_count++;
        if (m.tanggal && (!obj.last_service_date || m.tanggal > obj.last_service_date)) {
            obj.last_service_date = m.tanggal;
        }
    });

    const unitList = Array.from(unitMap.values()).map(u => ({
        ...u,
        avg_cost_per_service: u.service_count > 0 ? (u.total_cost / u.service_count) : 0,
        is_frequent: u.service_count >= 10
    })).sort((a, b) => b.service_count - a.service_count);

    return {
        unitList,
        frequentUnits: unitList.filter(u => u.is_frequent),
        topCostUnits: [...unitList].sort((a, b) => b.total_cost - a.total_cost).slice(0, 15)
    };
}

/**
 * DAX Measure: Simulasi Keputusan Servis vs Pergantian Aset (Service Check Simulation)
 * Menganalisis kelayakan servis berdasarkan umur aset, kondisi, CAPEX, nilai buku, dan biaya perbaikan.
 */
export function measureServiceSimulation(unitCodes = [], assets = [], maint = [], options = {}) {
    const customCosts = options.customCosts || new Map();
    const defaultCost = Number(options.defaultServiceCost) || 15000000;
    const thresholdBookPct = Number(options.thresholdBookValuePct) !== undefined ? Number(options.thresholdBookValuePct) : 50;
    const thresholdCapexPct = Number(options.thresholdCapexPct) !== undefined ? Number(options.thresholdCapexPct) : 50;
    const strictOverAge = options.strictOverAge !== false;

    // Build fast lookup asset map
    const assetMap = new Map();
    (assets || []).forEach(a => {
        if (a.kode_unit) {
            const raw = String(a.kode_unit).trim();
            assetMap.set(raw, a);
            assetMap.set(raw.replace(/[-_ ]/g, '').toUpperCase(), a);
        }
        if (a.no_asset_manual) {
            const raw = String(a.no_asset_manual).trim();
            assetMap.set(raw, a);
            assetMap.set(raw.replace(/[-_ ]/g, '').toUpperCase(), a);
        }
        if (a.kode_asset) {
            const raw = String(a.kode_asset).trim();
            assetMap.set(raw, a);
            assetMap.set(raw.replace(/[-_ ]/g, '').toUpperCase(), a);
        }
    });

    // Build fast lookup maintenance summary per unit
    const maintSummaryMap = new Map();
    (maint || []).forEach(m => {
        const u = String(m.kode_unit || m.kode_asset || '').trim();
        const norm = u.replace(/[-_ ]/g, '').toUpperCase();
        if (!norm) return;

        if (!maintSummaryMap.has(norm)) {
            maintSummaryMap.set(norm, {
                total_cost: 0,
                count: 0,
                last_date: '',
                last_part: '',
                costs: []
            });
        }
        const obj = maintSummaryMap.get(norm);
        const cost = Number(m.nominal || m.total_biaya || m.harga_bkb || 0);
        obj.total_cost += cost;
        obj.count++;
        if (cost > 0) obj.costs.push(cost);
        if (m.tanggal && (!obj.last_date || m.tanggal > obj.last_date)) {
            obj.last_date = m.tanggal;
            obj.last_part = m.nama_spare_part_jasa || m.description || '';
        }
    });

    // Parse input unitCodes (handles array or string separated by comma/newline/space)
    let rawList = [];
    if (Array.isArray(unitCodes)) {
        rawList = unitCodes;
    } else if (typeof unitCodes === 'string') {
        rawList = unitCodes.split(/[\r\n,;\t\s]+/).filter(Boolean);
    }

    // Deduplicate preserving order
    const seen = new Set();
    const cleanUnitCodes = [];
    rawList.forEach(item => {
        const str = String(item || '').trim();
        if (str && !seen.has(str.toUpperCase())) {
            seen.add(str.toUpperCase());
            cleanUnitCodes.push(str);
        }
    });

    let totalCapex = 0;
    let totalNilaiBuku = 0;
    let totalEstimasiServis = 0;
    let totalMaintHistoris = 0;
    let countService = 0;
    let costService = 0;
    let countReplace = 0;
    let costReplaceAvoided = 0;
    let countConditional = 0;
    let costConditional = 0;

    const rows = cleanUnitCodes.map(code => {
        const norm = code.replace(/[-_ ]/g, '').toUpperCase();
        const a = assetMap.get(code) || assetMap.get(norm) || null;
        const mInfo = maintSummaryMap.get(norm) || { total_cost: 0, count: 0, last_date: '-', last_part: '-', costs: [] };

        const matched = !!a;
        const kodeUnit = a ? (a.kode_unit || code) : code;
        const namaAsset = a ? (a.nama_asset || a.nama_asset_detail || 'Unit Terdaftar') : `Unit [${code}]`;
        const kategori = a ? (a.kategori_asset || a.kode_kategori || 'GENERAL') : 'TIDAK TERDAFTAR';
        const kelompok = a ? (a.kelompok_asset || a.kode_kelompok || '-') : '-';
        const lokasi = a ? (a.location || a.lokasi_code || 'CENTRAL') : '-';
        const kondisi = a ? (a.kondisi || 'Good Condition') : 'Unknown';

        const umurAsset = a ? (Number(a.umur_asset) || 0) : 0;
        const standarUmur = a ? (Number(a.standar_umur) || 5) : 5;
        const isOverAge = standarUmur > 0 ? (umurAsset >= standarUmur) : false;

        const capex = a ? (Number(a.total_harga_perolehan) || Number(a.harga_perolehan) || 0) : 0;
        let bookValue = 0;
        if (a) {
            bookValue = (a.Nilai_buku !== undefined) ? Number(a.Nilai_buku) : (Number(a.nilai_buku) || 0);
            if (bookValue < 0) bookValue = 0;
        }

        const totalPenyusutan = a ? (Number(a.Total_penyusutan) || Number(a.total_penyusutan) || 0) : 0;
        const bookRatioToCapex = capex > 0 ? (bookValue / capex) * 100 : 0;

        // Historical maintenance metrics
        const pastMaintCost = mInfo.total_cost || 0;
        const pastMaintCount = mInfo.count || 0;
        const avgPastCost = pastMaintCount > 0 ? (pastMaintCost / pastMaintCount) : 0;
        const lastMaintDate = mInfo.last_date || '-';
        const lastMaintPart = mInfo.last_part || '-';

        // Proposed service cost
        let serviceCost = defaultCost;
        if (customCosts.has(kodeUnit)) {
            serviceCost = Number(customCosts.get(kodeUnit)) || 0;
        } else if (customCosts.has(norm)) {
            serviceCost = Number(customCosts.get(norm)) || 0;
        } else if (options.useHistoricalAvg && avgPastCost > 0) {
            serviceCost = Math.round(avgPastCost);
        }

        // Ratios
        let ratioServisBuku = 0;
        if (bookValue > 0) {
            ratioServisBuku = (serviceCost / bookValue) * 100;
        } else if (serviceCost > 0) {
            ratioServisBuku = 999; // Nilai buku 0 namun ada biaya servis
        }

        const cumulativeMaint = pastMaintCost + serviceCost;
        const ratioMtcCapex = capex > 0 ? (cumulativeMaint / capex) * 100 : 0;
        const ratioServisCapex = capex > 0 ? (serviceCost / capex) * 100 : 0;

        // DECISION ENGINE
        let decision = 'SERVICE';
        let decisionLabel = 'Rekomendasi Servis';
        let decisionBadge = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800';
        let decisionIcon = 'ph-wrench';
        let score = 85;
        let reasons = [];

        const kLower = kondisi.toLowerCase();
        const isDamaged = kLower.includes('broken') || kLower.includes('disposal') || kLower.includes('lost') || kLower.includes('rusak berat');

        if (!matched) {
            decision = 'CONDITIONAL';
            decisionLabel = 'Unit Tidak Terdaftar';
            decisionBadge = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700';
            decisionIcon = 'ph-question';
            score = 30;
            reasons.push('Kode unit tidak ditemukan di Master Aset. Verifikasi data registrasi unit terlebih dahulu.');
        } else if (isDamaged) {
            decision = 'REPLACE';
            decisionLabel = 'Rekomendasi Ganti Unit';
            decisionBadge = 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800';
            decisionIcon = 'ph-arrows-clockwise';
            score = 15;
            reasons.push(`Kondisi fisik aset [${kondisi}] sudah tidak layak operasi. Melakukan perbaikan berisiko kegagalan berulang.`);
        } else if (ratioServisBuku > thresholdBookPct && (isOverAge || ratioMtcCapex > thresholdCapexPct || bookValue <= 0)) {
            decision = 'REPLACE';
            decisionLabel = 'Rekomendasi Ganti Unit';
            decisionBadge = 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800';
            decisionIcon = 'ph-arrows-clockwise';
            score = 25;
            if (bookValue <= 0) {
                reasons.push(`Nilai buku aset sudah habis (Rp 0), sedangkan usulan biaya servis signifikan.`);
            } else {
                reasons.push(`Biaya servis melampaui ${ratioServisBuku.toFixed(0)}% sisa nilai buku (ambang batas: ${thresholdBookPct}%).`);
            }
            if (isOverAge) {
                reasons.push(`Aset telah over-age (${umurAsset} thn vs standar ${standarUmur} thn).`);
            }
            if (ratioMtcCapex > thresholdCapexPct) {
                reasons.push(`Akumulasi perbaikan mencapai ${ratioMtcCapex.toFixed(0)}% dari harga perolehan.`);
            }
        } else if (ratioMtcCapex > thresholdCapexPct && isOverAge) {
            decision = 'REPLACE';
            decisionLabel = 'Rekomendasi Ganti Unit';
            decisionBadge = 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800';
            decisionIcon = 'ph-arrows-clockwise';
            score = 28;
            reasons.push(`Total akumulasi servis (${ratioMtcCapex.toFixed(0)}% CAPEX) melampaui batas batas ekonomis 50% Rule pada unit over-age.`);
        } else if (ratioServisBuku > (thresholdBookPct * 0.7) || (isOverAge && ratioServisBuku > 30) || pastMaintCount >= 12) {
            decision = 'CONDITIONAL';
            decisionLabel = 'Perbaikan Bersyarat';
            decisionBadge = 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800';
            decisionIcon = 'ph-warning';
            score = 55;
            reasons.push(`Aset berada di zona kritis biaya servis (${ratioServisBuku.toFixed(0)}% nilai buku).`);
            if (isOverAge) reasons.push(`Usia aset mendekati/melebihi batas standar.`);
            if (pastMaintCount >= 12) reasons.push(`Frekuensi servis tinggi (${pastMaintCount} kali riwayat servis).`);
            reasons.push(`Direkomendasikan servis terbatas untuk menjaga operasional jangka pendek sembari menyiapkan usulan unit pengganti.`);
        } else {
            decision = 'SERVICE';
            decisionLabel = 'Rekomendasi Servis';
            decisionBadge = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800';
            decisionIcon = 'ph-wrench';
            score = 88;
            reasons.push(`Biaya servis ekonomis (${ratioServisBuku.toFixed(1)}% dari nilai buku).`);
            if (!isOverAge) {
                const sisa = Math.max(0, standarUmur - umurAsset);
                reasons.push(`Aset masih dalam masa manfaat produktif (sisa ~${sisa} thn).`);
            }
            reasons.push(`Rasio pemeliharaan kumulatif aman (${ratioMtcCapex.toFixed(1)}% dari CAPEX). Layak dilanjutkan servis berkala.`);
        }

        // Tally summaries
        totalCapex += capex;
        totalNilaiBuku += bookValue;
        totalEstimasiServis += serviceCost;
        totalMaintHistoris += pastMaintCost;

        if (decision === 'SERVICE') {
            countService++;
            costService += serviceCost;
        } else if (decision === 'REPLACE') {
            countReplace++;
            costReplaceAvoided += serviceCost;
        } else {
            countConditional++;
            costConditional += serviceCost;
        }

        return {
            kode_unit: kodeUnit,
            nama_asset: namaAsset,
            kategori: kategori,
            kelompok: kelompok,
            lokasi: lokasi,
            kondisi: kondisi,
            umur_asset: umurAsset,
            standar_umur: standarUmur,
            is_over_age: isOverAge,
            harga_perolehan: capex,
            nilai_buku: bookValue,
            total_penyusutan: totalPenyusutan,
            book_ratio_to_capex: bookRatioToCapex,
            past_maint_cost: pastMaintCost,
            past_maint_count: pastMaintCount,
            avg_past_cost: avgPastCost,
            last_maint_date: lastMaintDate,
            last_maint_part: lastMaintPart,
            service_cost: serviceCost,
            ratio_servis_buku: ratioServisBuku,
            ratio_mtc_capex: ratioMtcCapex,
            ratio_servis_capex: ratioServisCapex,
            decision: decision,
            decision_label: decisionLabel,
            decision_badge: decisionBadge,
            decision_icon: decisionIcon,
            score: score,
            justification: reasons.join(' ')
        };
    });

    const totalCount = rows.length;
    const avgAge = totalCount > 0 ? (rows.reduce((acc, r) => acc + r.umur_asset, 0) / totalCount) : 0;
    const avgRatioBook = totalNilaiBuku > 0 ? (totalEstimasiServis / totalNilaiBuku) * 100 : 0;

    return {
        rows,
        summary: {
            total_unit: totalCount,
            total_capex: totalCapex,
            total_nilai_buku: totalNilaiBuku,
            total_estimasi_servis: totalEstimasiServis,
            total_maint_historis: totalMaintHistoris,
            count_service: countService,
            cost_service: costService,
            count_replace: countReplace,
            cost_replace_avoided: costReplaceAvoided,
            count_conditional: countConditional,
            cost_conditional: costConditional,
            avg_age: avgAge,
            avg_ratio_book: avgRatioBook,
            threshold_book_pct: thresholdBookPct,
            threshold_capex_pct: thresholdCapexPct
        }
    };
}


