/**
 * fuel-measures.js
 * Measure untuk fact_bkb_fuel: total BBM, rasio konsumsi vs HM terpakai, deteksi anomali, log detail transaksi.
 */
import { applyFilter, groupAggregate, Agg } from './core-measures.js?v=20261029_fix2';
import { inferSubKategori, sanitizeFuelRowsForVra, evaluateUnitNonAktifOrMutasi, doesActivityRequireBbm } from './vra-measures.js?v=20261125_r2';
import { inferAssetLocation } from './asset-measures.js';

/** Total pemakaian & biaya BBM per unit, dengan filter opsional */
export function measureBbmPerUnit(fuelRows, filters = {}) {
  const filtered = applyFilter(fuelRows, filters);
  return groupAggregate(
    filtered,
    (row) => row.kode_unit || row.no_asset_manual || 'TANPA UNIT',
    {
      total_liter: {
        init: () => 0,
        step: (acc, r) => acc + (Number(r.jumlah_bkb_fix || r.jumlah_liter || r.liter || r.jumlah) || 0)
      },
      total_biaya: {
        init: () => 0,
        step: (acc, r) => acc + (Number(r.harga_bkb || r.total_biaya || r.biaya) || 0)
      },
      jumlah_pengisian: Agg.count(),
    }
  );
}

/**
 * Rasio konsumsi BBM per HM terpakai, dan tandai anomali kalau di luar ambang batas.
 */
export function measureRasioKonsumsiBbm(fuelByUnit, vraByUnit, ambangRasio = 1.5) {
  const vraMap = new Map(vraByUnit.map(v => [v.group, v]));

  return fuelByUnit.map(fuel => {
    const vra = vraMap.get(fuel.group);
    const hmTerpakai = vra ? vra.total_hm_terpakai : 0;
    const rasio = hmTerpakai > 0 ? fuel.total_liter / hmTerpakai : null;

    return {
      kode_unit: fuel.group,
      total_liter: fuel.total_liter,
      total_hm_terpakai: hmTerpakai,
      rasio_liter_per_hm: rasio !== null ? Number(rasio.toFixed(3)) : null,
      anomali: rasio !== null && rasio > ambangRasio,
    };
  });
}

/**
 * Analisis Detail Log & Rasio BBM per Unit (Untuk View Detail BBM)
 */
export function measureFuelDetailLog(fuelRows = [], vraRows = [], assetMap = new Map()) {
  const cleanFuelRows = sanitizeFuelRowsForVra(fuelRows, vraRows, assetMap);
  const unitMap = new Map();
  const rawBkbLogs = [];
  let grandTotalLiter = 0;
  let grandTotalCost = 0;

  // 1. Process Validated Fuel Transactions (0 BBM on Standby & Non-BBM activities)
  cleanFuelRows.forEach(f => {
    const code = (f.kode_unit || f.no_asset_manual || 'UNKNOWN').trim();
    const liter = Number(f.jumlah_bkb_fix) || Number(f.jumlah_liter) || Number(f.liter) || 0;
    const cost = Number(f.harga_bkb) || Number(f.total_biaya) || Number(f.biaya) || 0;
    const noBkb = f.nomor_bkb || f.no_bkb || '-';
    const tgl = f.tanggal_bkb || f.tanggal || '-';

    grandTotalLiter += liter;
    grandTotalCost += cost;

    const unitCode = String(f.kode_unit || f.no_asset_manual || '').trim();
    const asset = assetMap ? (assetMap.get(unitCode) || {}) : {};
    const namaAsset = asset.nama_asset || f.keterangan || code;
    const kat = inferSubKategori(code, asset);
    const loc = inferAssetLocation(asset) || asset.location || 'Tidak Terklasifikasi';
    const locCategory = asset.location_category || '';
    const namaBangunan = asset.nama_bangunan || '';

    rawBkbLogs.push({
      nomor_bkb: noBkb,
      tanggal: tgl,
      kode_unit: code,
      nama_asset: namaAsset,
      kategori: kat,
      lokasi: loc,
      location_category: locCategory,
      nama_bangunan: namaBangunan,
      liter: liter,
      biaya: cost,
      keterangan: f.keterangan || '-'
    });

    if (!unitMap.has(code)) {
      unitMap.set(code, {
        kode_unit: code,
        nama_asset: namaAsset,
        kategori: kat,
        lokasi: loc,
        total_liter: 0,
        total_biaya: 0,
        jumlah_trx: 0,
        last_date: '',
        total_km: 0,
        total_jam: 0,
        transactions: []
      });
    }

    const u = unitMap.get(code);
    u.total_liter += liter;
    u.total_biaya += cost;
    u.jumlah_trx += 1;
    if (tgl !== '-' && (!u.last_date || tgl > u.last_date)) {
      u.last_date = tgl;
    }
  });

  // 2. Attach VRA mobility & duration data (strictly valid operating rows)
  vraRows.forEach(v => {
    if (v.aktif === 0 || String(v.aktif) === '0' || v.is_salah_input || v.is_downtime) return;
    const code = (v.kode_unit || v.no_asset_manual || '').trim();
    if (unitMap.has(code)) {
      const u = unitMap.get(code);
      const hm = Number(v.hm_terpakai_calc) || 0;
      const jam = Number(v.jam_kerja_calc) || (hm > 0 && hm <= 24 ? hm : 0);
      const km = Number(v.km_used) || 0;

      u.total_km += km > 0 ? km : 0;
      u.total_jam += jam > 0 ? jam : 0;
    }
  });

  // 3. Compute Ratios, Anomaly, and Decision Recommendations
  let anomalyCount = 0;
  let totalKmAll = 0;
  let totalJamAll = 0;
  let totalAnomalyCostImpact = 0;

  const unitList = Array.from(unitMap.values()).map(u => {
    totalKmAll += u.total_km;
    totalJamAll += u.total_jam;

    const kmPerLiter = u.total_liter > 0 && u.total_km > 0 ? (u.total_km / u.total_liter) : 0;
    const literPerJam = u.total_jam > 0 && u.total_liter > 0 ? (u.total_liter / u.total_jam) : 0;
    const costPerKm = u.total_km > 0 ? (u.total_biaya / u.total_km) : 0;
    
    // Benchmark thresholds:
    // Heavy / Marine: > 3.2 L/Jam is high
    // Light / Truck: < 2.0 KM/L is inefficient
    const isAnomaly = (u.total_jam > 5 && literPerJam > 3.2) || (u.total_km > 30 && kmPerLiter < 1.8 && kmPerLiter > 0);
    let efficiencyStatus = 'Standar Wajar';
    let efficiencyColor = 'text-blue-600';
    let badgeBg = 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
    let recommendation = 'Pertahankan jadwal operasional rutin.';

    if (isAnomaly) {
      anomalyCount++;
      efficiencyStatus = 'Boros / Anomali';
      efficiencyColor = 'text-rose-600';
      badgeBg = 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300';
      totalAnomalyCostImpact += (u.total_biaya * 0.25); // estimate 25% waste
      recommendation = '🚨 Jadwalkan kalibrasi injector nozzle & audit log jam kerja.';
    } else if ((kmPerLiter >= 3.5) || (literPerJam > 0 && literPerJam <= 1.8)) {
      efficiencyStatus = 'Sangat Efisien';
      efficiencyColor = 'text-emerald-600';
      badgeBg = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
      recommendation = '✅ Performa optimal & konsumsi bahan bakar efisien.';
    }

    return {
      ...u,
      km_per_liter: Number(kmPerLiter.toFixed(2)),
      liter_per_jam: Number(literPerJam.toFixed(2)),
      cost_per_km: Number(costPerKm.toFixed(0)),
      is_anomaly: isAnomaly,
      efficiency_status: efficiencyStatus,
      efficiency_color: efficiencyColor,
      badge_bg: badgeBg,
      recommendation: recommendation
    };
  }).sort((a, b) => b.total_liter - a.total_liter);

  const avgKmL = grandTotalLiter > 0 && totalKmAll > 0 ? (totalKmAll / grandTotalLiter) : 0;
  const avgLJam = totalJamAll > 0 && grandTotalLiter > 0 ? (grandTotalLiter / totalJamAll) : 0;

  // Rata-rata temporal BBM
  const allDates = cleanFuelRows.map(f => f.tanggal_bkb || f.tanggal).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d));
  let periodDays = 365;
  if (allDates.length > 1) {
    const minD = new Date(Math.min(...allDates));
    const maxD = new Date(Math.max(...allDates));
    periodDays = Math.max(1, Math.ceil((maxD - minD) / 86400000));
  }
  const periodMonths = Math.max(1, periodDays / 30.44);
  const periodYears  = Math.max(1, periodDays / 365.25);

  const avgLiterHarian  = grandTotalLiter / periodDays;
  const avgLiterBulanan = grandTotalLiter / periodMonths;
  const avgLiterTahunan = grandTotalLiter / periodYears;
  const avgCostHarian   = grandTotalCost  / periodDays;
  const avgCostBulanan  = grandTotalCost  / periodMonths;
  const avgCostTahunan  = grandTotalCost  / periodYears;

  return {
    unitList: unitList,
    rawBkbLogs: rawBkbLogs.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '')),
    summary: {
      total_units: unitList.length,
      total_liter: grandTotalLiter,
      total_cost: grandTotalCost,
      avg_km_l: Number(avgKmL.toFixed(2)),
      avg_l_jam: Number(avgLJam.toFixed(2)),
      // Rata-rata temporal
      avg_liter_harian:  Number(avgLiterHarian.toFixed(1)),
      avg_liter_bulanan: Number(avgLiterBulanan.toFixed(1)),
      avg_liter_tahunan: Number(avgLiterTahunan.toFixed(0)),
      avg_cost_harian:   Math.round(avgCostHarian),
      avg_cost_bulanan:  Math.round(avgCostBulanan),
      avg_cost_tahunan:  Math.round(avgCostTahunan),
      period_days: periodDays,
      period_months: Number(periodMonths.toFixed(1)),
      period_years: Number(periodYears.toFixed(2)),
      anomaly_count: anomalyCount,
      anomaly_cost_impact: totalAnomalyCostImpact,
      recommendation_text: anomalyCount > 0 
        ? `Ditemukan ${anomalyCount} unit dengan rasio konsumsi bahan bakar di atas batas toleransi efisiensi (potensi inefisiensi ~Rp ${(totalAnomalyCostImpact/1_000_000).toFixed(1)} Jt). Disarankan audit fisik meteran dan servis sistem pembakaran.`
        : `Seluruh unit beroperasi dalam rentang efisiensi normal. Tingkat deviasi bahan bakar berada di bawah 5%.`
    }
  };
}

export function measureFuelDetailLedger(fuelRows, vraRows = [], assetMap = new Map()) {
  const res = measureFuelDetailLog(fuelRows, vraRows, assetMap);
  return res.unitList;
}

/**
 * DAX Measure: Audit Anomali BBM (Untuk Sub Modul Fuel Anomaly)
 */
export function measureFuelAnomalyAudit(fuelRows, vraRows = [], assetMap = new Map()) {
  const res = measureFuelDetailLog(fuelRows, vraRows, assetMap);
  const anomalies = res.unitList.filter(u => u.is_anomaly);
  const normal = res.unitList.filter(u => !u.is_anomaly);

  let totalWasteCost = 0;
  anomalies.forEach(a => {
    totalWasteCost += (a.total_biaya * 0.25);
  });

  return {
    summary: {
      total_units: res.unitList.length,
      anomaly_count: anomalies.length,
      normal_count: normal.length,
      anomaly_pct: res.unitList.length > 0 ? (anomalies.length / res.unitList.length) * 100 : 0,
      total_waste_cost: totalWasteCost,
      total_anomaly_fuel: anomalies.reduce((s, a) => s + a.total_liter, 0)
    },
    anomalies: anomalies.sort((a, b) => b.total_biaya - a.total_biaya),
    allUnits: res.unitList
  };
}

/**
 * DAX Measure: Benchmarking Efisiensi Bahan Bakar per Kategori Unit
 */
export function measureFuelBenchmarkingReport(fuelRows, vraRows = [], assetMap = new Map()) {
  const res = measureFuelDetailLog(fuelRows, vraRows, assetMap);
  const catMap = new Map();

  res.unitList.forEach(u => {
    const cat = u.kategori || 'GENERAL';
    if (!catMap.has(cat)) {
      catMap.set(cat, {
        kategori: cat,
        unitCount: 0,
        totalLiter: 0,
        totalCost: 0,
        totalKm: 0,
        totalJam: 0,
        anomalyCount: 0
      });
    }
    const c = catMap.get(cat);
    c.unitCount++;
    c.totalLiter += u.total_liter;
    c.totalCost += u.total_biaya;
    c.totalKm += u.total_km;
    c.totalJam += u.total_jam;
    if (u.is_anomaly) c.anomalyCount++;
  });

  const categories = Array.from(catMap.values()).map(c => ({
    ...c,
    avgKmL: c.totalLiter > 0 && c.totalKm > 0 ? Number((c.totalKm / c.totalLiter).toFixed(2)) : 0,
    avgLJam: c.totalJam > 0 && c.totalLiter > 0 ? Number((c.totalLiter / c.totalJam).toFixed(2)) : 0,
    avgCostPerUnit: c.unitCount > 0 ? Math.round(c.totalCost / c.unitCount) : 0,
    anomalyRatePct: c.unitCount > 0 ? (c.anomalyCount / c.unitCount) * 100 : 0
  })).sort((a, b) => b.totalCost - a.totalCost);

  return {
    categories,
    topEfficient: res.unitList.filter(u => u.efficiency_status === 'Sangat Efisien').slice(0, 10),
    topHeavyConsumers: res.unitList.slice(0, 10)
  };
}

/**
 * DAX Measure: Rekonsiliasi & Komparasi 3-Arah BBM (Output BKB Gudang vs Input BBM Driver VRA vs Output Kerja VRA)
 * Memisahkan otomatis unit dengan BKB Gudang Site vs Kendaraan Luar Site / SPBU Luar.
 */
export function measureVraFuelComparison(fuelRows = [], vraRows = [], assetMap = new Map()) {
  const BENCHMARKS = {
    'EXCAVATOR': { type: 'HM', target: 16.0, unit: 'L/Jam', maxTolerance: 20.0, name: 'Excavator' },
    'BULLDOZER': { type: 'HM', target: 18.0, unit: 'L/Jam', maxTolerance: 22.0, name: 'Bulldozer' },
    'WHEEL LOADER': { type: 'HM', target: 12.0, unit: 'L/Jam', maxTolerance: 15.0, name: 'Wheel Loader' },
    'GENSET': { type: 'HM', target: 3.2, unit: 'L/Jam', maxTolerance: 4.5, name: 'Genset Listrik' },
    'POMPA AIR': { type: 'HM', target: 2.0, unit: 'L/Jam', maxTolerance: 3.0, name: 'Pompa Air / Alkon' },
    'SPEEDBOAT': { type: 'HM', target: 18.0, unit: 'L/Jam', maxTolerance: 24.0, name: 'Speedboat' },
    'TUGBOAT': { type: 'HM', target: 25.0, unit: 'L/Jam', maxTolerance: 35.0, name: 'Tugboat' },
    'POTONG RUMPUT': { type: 'HM', target: 1.0, unit: 'L/Jam', maxTolerance: 1.5, name: 'Mesin Potong Rumput' },
    'DUMP TRUCK': { type: 'KM', target: 2.8, unit: 'KM/L', minTolerance: 1.8, name: 'Dump Truck' },
    'TRUCK': { type: 'KM', target: 2.5, unit: 'KM/L', minTolerance: 1.6, name: 'Truk Operasional' },
    'TRUCK TANGKI': { type: 'KM', target: 2.6, unit: 'KM/L', minTolerance: 1.6, name: 'Truk Tangki' },
    'MOBIL': { type: 'KM', target: 9.0, unit: 'KM/L', minTolerance: 6.5, name: 'Mobil Operasional' },
    'SEPEDA MOTOR': { type: 'KM', target: 38.0, unit: 'KM/L', minTolerance: 28.0, name: 'Sepeda Motor' },
    'MOTOR LISTRIK': { type: 'KM', target: 45.0, unit: 'KM/L', minTolerance: 35.0, name: 'Motor Listrik' },
  };
  const DEFAULT_HM_BENCHMARK = { type: 'HM', target: 3.0, unit: 'L/Jam', maxTolerance: 4.5 };
  const DEFAULT_KM_BENCHMARK = { type: 'KM', target: 3.0, unit: 'KM/L', minTolerance: 2.0 };

  const lookupAsset = (code) => {
    if (!assetMap || !code) return {};
    return assetMap.get(code) || assetMap.get(String(code).replace(/[-_ ]/g, '').toUpperCase()) || {};
  };

  // 0. Tentukan daftar Unit Aktif VRA (takedown unit Non-Aktif & Mutasi agar selaras dengan Profil Unit)
  let maxDatasetDate = '';
  const rawVraByUnit = new Map();
  (vraRows || []).forEach(v => {
    const code = String(v.kode_unit || v.no_asset_manual || '').trim();
    if (!code) return;
    if (!rawVraByUnit.has(code)) rawVraByUnit.set(code, []);
    rawVraByUnit.get(code).push(v);
    const isVal = !(v.aktif === 0 || String(v.aktif) === '0' || v.is_salah_input);
    const tgl = String(v.tanggal || '').slice(0, 10);
    if (isVal && tgl && tgl > maxDatasetDate) maxDatasetDate = tgl;
  });

  const activeVraUnitSet = new Set();
  rawVraByUnit.forEach((list, code) => {
    const validList = list.filter(v => !(v.aktif === 0 || String(v.aktif) === '0' || v.is_salah_input));
    const sortedValid = validList.slice().sort((a, b) =>
      ((a.tanggal || '') + ' ' + (a.jam_selesai || a.jam_awal || '')).localeCompare((b.tanggal || '') + ' ' + (b.jam_selesai || b.jam_awal || ''))
    );
    const sortedRaw = list.slice().sort((a, b) =>
      ((a.tanggal || '') + ' ' + (a.jam_selesai || a.jam_awal || '')).localeCompare((b.tanggal || '') + ' ' + (b.jam_selesai || b.jam_awal || ''))
    );
    const latestValid = sortedValid.length > 0 ? sortedValid[sortedValid.length - 1] : null;
    const latestRaw = sortedRaw.length > 0 ? sortedRaw[sortedRaw.length - 1] : {};
    const eff = latestValid || latestRaw;
    const asset = lookupAsset(code);

    const td = evaluateUnitNonAktifOrMutasi({
      kodeUnit: code,
      asset,
      validCount: validList.length,
      lastAktivitas: eff.nama_aktivitas || eff.aktivitas || '',
      lastKegiatan: eff.nama_kegiatan || '',
      lastStatus: eff.status_kerja_calc || eff.status || '',
      lastDate: latestValid ? latestValid.tanggal : '',
      maxDatasetDate
    });
    if (!td.isTakedown) {
      activeVraUnitSet.add(code);
    }
  });

  const cleanFuelRows = sanitizeFuelRowsForVra(fuelRows, vraRows, assetMap);
  const unitMap = new Map();

  const ensureUnitEntry = (code, fallbackName = '') => {
    if (!unitMap.has(code)) {
      const asset = lookupAsset(code);
      const kat = inferSubKategori(code, asset);
      const loc = inferAssetLocation(asset) || asset.location || 'Lapangan';
      unitMap.set(code, {
        kode_unit: code,
        nama_asset: asset.nama_asset_detail || asset.nama_asset || fallbackName || code,
        kategori: kat,
        lokasi: loc,
        total_liter: 0,
        total_biaya: 0,
        trx_count: 0,
        bkb_liter: 0,
        bkb_biaya: 0,
        bkb_trx_count: 0,
        driver_liter: 0,
        driver_trx_count: 0,
        driver_estimasi_biaya: 0,
        total_hm: 0,
        total_km: 0,
        op_days_set: new Set(),
        last_date: '',
        bkb_dates_set: new Set()
      });
    }
    return unitMap.get(code);
  };

  // Inisialisasi semua unit VRA aktif agar unit luar site tanpa BKB (seperti HO/RO/Listrik) juga terpantau
  activeVraUnitSet.forEach(code => ensureUnitEntry(code));

  // 1. Agregasi BKB Gudang Asli (hanya unit VRA aktif; abaikan baris sintetis BKB-VRA-* di sini karena sisi driver diambil langsung dari vraRows)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const monthlyCorrelation = Array.from({ length: 12 }, (_, i) => ({
    monthIdx: i,
    monthName: monthNames[i],
    vra_hm: 0,
    vra_km: 0,
    bkb_liter: 0,
    driver_liter: 0,
    spbu_luar_liter: 0,
    fuel_liter: 0,
    fuel_cost: 0,
    ratio_l_hm: 0,
    cost_per_hm: 0
  }));

  cleanFuelRows.forEach(f => {
    const code = String(f.kode_unit || f.no_asset_manual || '').trim();
    if (!code || (activeVraUnitSet.size > 0 && !activeVraUnitSet.has(code))) return;

    const noBkb = String(f.no_bkb || f.nomor_bkb || '').trim();
    const isRealBkb = Boolean(noBkb && noBkb !== '-' && !noBkb.startsWith('BKB-VRA-'));
    if (!isRealBkb) return;

    const liter = Number(f.jumlah_bkb_fix ?? f.jumlah_liter ?? f.liter ?? 0) || 0;
    if (liter <= 0) return;
    const isBensin = /MTR|ALKON|MPR|KNAPSACK|AVANZA|GRAN MAX|SPEEDBOAT|SB-|SBF/i.test(code);
    const defaultPrice = isBensin ? 10000 : 6800;
    const cost = Number(f.harga_bkb || f.total_biaya || f.biaya || 0) || Math.round(liter * defaultPrice);
    const tgl = String(f.tanggal_bkb || f.tanggal || '').slice(0, 10);

    const u = ensureUnitEntry(code, f.nama_asset || f.keterangan || code);
    u.bkb_liter += liter;
    u.bkb_biaya += cost;
    u.bkb_trx_count += 1;
    if (tgl) {
      u.bkb_dates_set.add(tgl);
      if (!u.last_date || tgl > u.last_date) u.last_date = tgl;
      const parts = tgl.split('-');
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10) - 1;
        if (m >= 0 && m < 12) {
          monthlyCorrelation[m].bkb_liter += liter;
          monthlyCorrelation[m].fuel_liter += liter;
          monthlyCorrelation[m].fuel_cost += cost;
        }
      }
    }
  });

  // 2. Agregasi Output Kerja VRA & Input BBM Driver VRA (hanya log operasional valid yang butuh BBM)
  (vraRows || []).forEach(v => {
    const code = String(v.kode_unit || v.no_asset_manual || '').trim();
    if (!code || (activeVraUnitSet.size > 0 && !activeVraUnitSet.has(code))) return;
    if (v.aktif === 0 || String(v.aktif) === '0' || v.is_salah_input || v.is_downtime) return;

    const u = ensureUnitEntry(code);
    const hm = Number(v.hm_terpakai_calc) || 0;
    const jam = Number(v.jam_kerja_calc) || (hm > 0 && hm <= 24 ? hm : 0);
    const effectiveHm = jam > 0 ? jam : hm;
    const km = Number(v.km_used) || 0;
    const reqBbm = v.requires_bbm !== undefined
      ? Boolean(v.requires_bbm)
      : doesActivityRequireBbm(v.nama_aktivitas || v.aktivitas, v.nama_kegiatan, code, u.kategori, v.keterangan_tambahan);
    const driverLtr = reqBbm ? (Number(v.quantity_bahan_bakar ?? v.bbm_liter ?? 0) || 0) : 0;
    const tgl = String(v.tanggal || '').slice(0, 10);

    u.total_hm += effectiveHm;
    u.total_km += km;
    if (tgl) {
      u.op_days_set.add(tgl);
      if (!u.last_date || tgl > u.last_date) u.last_date = tgl;
    }

    if (driverLtr > 0) {
      u.driver_liter += driverLtr;
      u.driver_trx_count += 1;
      const isBensin = /MTR|ALKON|MPR|KNAPSACK|AVANZA|GRAN MAX|SPEEDBOAT|SB-|SBF/i.test(code);
      const estCost = Number(v.bbm_estimasi_rp) || Math.round(driverLtr * (isBensin ? 10000 : 6800));
      u.driver_estimasi_biaya += estCost;
    }

    if (tgl) {
      const parts = tgl.split('-');
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10) - 1;
        if (m >= 0 && m < 12) {
          monthlyCorrelation[m].vra_hm += effectiveHm;
          monthlyCorrelation[m].vra_km += km;
          if (driverLtr > 0) {
            if (u.bkb_liter > 0) {
              monthlyCorrelation[m].driver_liter += driverLtr;
            } else {
              monthlyCorrelation[m].spbu_luar_liter += driverLtr;
            }
          }
        }
      }
    }
  });

  // Betulkan pengelompokan bulanan driver_liter vs spbu_luar_liter setelah bkb_liter final terakumulasi per unit
  monthlyCorrelation.forEach(m => {
    m.driver_liter = 0;
    m.spbu_luar_liter = 0;
  });
  (vraRows || []).forEach(v => {
    const code = String(v.kode_unit || v.no_asset_manual || '').trim();
    if (!code || !unitMap.has(code)) return;
    if (v.aktif === 0 || String(v.aktif) === '0' || v.is_salah_input || v.is_downtime) return;
    const u = unitMap.get(code);
    const reqBbm = v.requires_bbm !== undefined
      ? Boolean(v.requires_bbm)
      : doesActivityRequireBbm(v.nama_aktivitas || v.aktivitas, v.nama_kegiatan, code, u.kategori, v.keterangan_tambahan);
    const driverLtr = reqBbm ? (Number(v.quantity_bahan_bakar ?? v.bbm_liter ?? 0) || 0) : 0;
    if (driverLtr <= 0) return;
    const tgl = String(v.tanggal || '').slice(0, 10);
    const parts = tgl.split('-');
    if (parts.length >= 2) {
      const m = parseInt(parts[1], 10) - 1;
      if (m >= 0 && m < 12) {
        if (u.bkb_liter > 0) monthlyCorrelation[m].driver_liter += driverLtr;
        else monthlyCorrelation[m].spbu_luar_liter += driverLtr;
      }
    }
  });

  monthlyCorrelation.forEach(m => {
    m.ratio_l_hm = m.vra_hm > 0 ? Number((m.bkb_liter / m.vra_hm).toFixed(2)) : 0;
    m.cost_per_hm = m.vra_hm > 0 ? Math.round(m.fuel_cost / m.vra_hm) : 0;
  });

  // 3. Evaluasi Rekonsiliasi & Kuadran Efisiensi per Unit
  let totalWasteCostRp = 0;
  let totalOverLiter = 0;
  let efficientCount = 0;
  let anomalyCount = 0;

  const comparisonList = Array.from(unitMap.values()).map(u => {
    const isElectric = u.kategori === 'MOTOR LISTRIK' || u.kode_unit.toUpperCase().includes('MTRL');
    const isBkbSite = u.bkb_liter > 0;
    const sumberBbmMode = isBkbSite ? 'BKB_SITE' : 'SPBU_LUAR';

    // Total BBM resmi untuk kalkulasi TCO & Efisiensi: BKB Gudang untuk unit site, Input Driver untuk SPBU luar
    const effectiveLiter = isElectric ? 0 : (isBkbSite ? u.bkb_liter : u.driver_liter);
    const effectiveBiaya = isElectric ? 0 : (isBkbSite ? u.bkb_biaya : u.driver_estimasi_biaya);
    const trxCount = isBkbSite ? u.bkb_trx_count : u.driver_trx_count;

    const isRoadWithKm = ['DUMP TRUCK', 'TRUCK', 'TRUCK TANGKI', 'MOBIL', 'SEPEDA MOTOR', 'MOTOR LISTRIK'].includes(u.kategori) && u.total_km > 0;
    const bm = BENCHMARKS[u.kategori] || (isRoadWithKm ? DEFAULT_KM_BENCHMARK : DEFAULT_HM_BENCHMARK);
    const ratioUnit = isRoadWithKm ? 'KM/L' : 'L/Jam';

    const actualBkbRatio = isElectric ? 0 : (
      isRoadWithKm
        ? (u.bkb_liter > 0 ? Number((u.total_km / u.bkb_liter).toFixed(2)) : 0)
        : (u.total_hm > 0 ? Number((u.bkb_liter / u.total_hm).toFixed(2)) : 0)
    );
    const actualDriverRatio = isElectric ? 0 : (
      isRoadWithKm
        ? (u.driver_liter > 0 ? Number((u.total_km / u.driver_liter).toFixed(2)) : 0)
        : (u.total_hm > 0 ? Number((u.driver_liter / u.total_hm).toFixed(2)) : 0)
    );

    const actualRatio = isBkbSite ? actualBkbRatio : actualDriverRatio;
    const actualLpHm = (u.total_hm > 0 && effectiveLiter > 0) ? Number((effectiveLiter / u.total_hm).toFixed(2)) : 0;
    const actualKmpL = (effectiveLiter > 0 && u.total_km > 0) ? Number((u.total_km / effectiveLiter).toFixed(2)) : 0;
    const costPerHm = u.total_hm > 0 ? Math.round(effectiveBiaya / u.total_hm) : 0;
    const costPerKm = u.total_km > 0 ? Math.round(effectiveBiaya / u.total_km) : 0;

    // Rekonsiliasi BKB Gudang vs Input Driver
    const selisihLiter = isBkbSite ? Number((u.bkb_liter - u.driver_liter).toFixed(1)) : 0;
    const selisihPct = isBkbSite && u.bkb_liter > 0
      ? Number((((u.driver_liter - u.bkb_liter) / u.bkb_liter) * 100).toFixed(1))
      : 0;

    let rekonStatus = 'SPBU_LUAR_DRIVER';
    let rekonLabel = '⛽ SPBU Luar Site';
    let rekonColor = 'text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800';
    if (isBkbSite) {
      if (Math.abs(selisihPct) <= 10 || Math.abs(selisihLiter) <= 15) {
        rekonStatus = 'SESUAI';
        rekonLabel = '✅ Sesuai (≤10%)';
        rekonColor = 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
      } else if (u.bkb_liter > u.driver_liter) {
        rekonStatus = 'DRIVER_KURANG';
        rekonLabel = '⚠️ Driver Kurang Input';
        rekonColor = 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
      } else {
        rekonStatus = 'DRIVER_LEBIH';
        rekonLabel = '🔶 Input Driver > BKB';
        rekonColor = 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
      }
    } else if (isElectric) {
      rekonStatus = 'MOTOR_LISTRIK';
      rekonLabel = '⚡ Motor Listrik (0 BBM)';
      rekonColor = 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800';
    } else if (u.driver_liter > 0) {
      rekonStatus = 'SPBU_LUAR_DRIVER';
      rekonLabel = '⛽ SPBU Luar (Driver)';
      rekonColor = 'text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800';
    } else {
      rekonStatus = 'LUAR_SITE_KOSONG';
      rekonLabel = '📍 Luar Site (Belum Input)';
      rekonColor = 'text-slate-600 bg-slate-100 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }

    // Evaluasi Benchmark Efisiensi BBM vs Output Kerja
    let isAnomaly = false;
    let deviationPct = 0;
    let overLiter = 0;
    const targetRatio = bm.target;

    if (!isElectric && effectiveLiter > 0) {
      if (!isRoadWithKm) {
        if (u.total_hm > 5 && targetRatio > 0) {
          deviationPct = ((actualRatio - targetRatio) / targetRatio) * 100;
          if (actualRatio > bm.maxTolerance) {
            isAnomaly = true;
            overLiter = Math.max(0, effectiveLiter - (u.total_hm * targetRatio));
          }
        }
      } else if (u.total_km > 30 && targetRatio > 0 && actualRatio > 0) {
        deviationPct = ((targetRatio - actualRatio) / targetRatio) * 100;
        if (actualRatio < bm.minTolerance) {
          isAnomaly = true;
          overLiter = Math.max(0, effectiveLiter - (u.total_km / targetRatio));
        }
      }
    }

    const avgPricePerLtr = effectiveLiter > 0 ? effectiveBiaya / effectiveLiter : 6800;
    const wasteCost = Math.round(overLiter * avgPricePerLtr);

    if (isAnomaly) {
      anomalyCount++;
      totalWasteCostRp += wasteCost;
      totalOverLiter += overLiter;
    } else if (u.total_hm > 10 && deviationPct <= 0) {
      efficientCount++;
    }

    let quadrant = 'STANDBY_IDLE';
    let statusLabel = 'Wajar / Normal';
    let statusColor = 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60';
    let recommendation = 'Aktivitas operasional dalam batas wajar.';

    if (u.total_hm >= 20 || u.total_km >= 250) {
      if (!isAnomaly && deviationPct <= 5) {
        quadrant = 'PRIMA_EFISIEN';
        statusLabel = 'Prima & Efisien';
        statusColor = 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60';
        recommendation = 'Kinerja prima. Jam kerja tinggi dengan rasio konsumsi optimal.';
      } else {
        quadrant = 'HEAVY_WORKLOAD';
        statusLabel = isAnomaly ? 'Beban Berat & Boros' : 'Operasi Beban Berat';
        statusColor = isAnomaly
          ? 'text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60'
          : 'text-purple-600 bg-purple-50 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60';
        recommendation = isAnomaly
          ? 'Prioritas audit selisih BKB vs driver, kalibrasi injektor & cek saringan udara.'
          : 'Beban kerja tinggi, periksa jadwal penggantian oli dan filter.';
      }
    } else if (effectiveLiter > 50 && (u.total_hm < 5 || isAnomaly)) {
      quadrant = 'KRITIS_BOROS';
      statusLabel = 'Kritis (Idle / Boros)';
      statusColor = 'text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800';
      recommendation = '🚨 Kritis! Pengeluaran BKB tinggi tetapi output kerja VRA minim.';
    } else {
      quadrant = 'STANDBY_IDLE';
      statusLabel = 'Aktivitas Rendah / Cadangan';
      statusColor = 'text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
      recommendation = 'Unit beraktivitas rendah atau cadangan.';
    }

    return {
      kode_unit: u.kode_unit,
      nama_asset: u.nama_asset,
      kategori: u.kategori,
      lokasi: u.lokasi,
      sumber_bbm_mode: sumberBbmMode,
      is_electric: isElectric,
      op_days: u.op_days_set.size,
      total_hm: Number(u.total_hm.toFixed(1)),
      total_km: Math.round(u.total_km),
      bkb_liter: Number(u.bkb_liter.toFixed(1)),
      bkb_biaya: Math.round(u.bkb_biaya),
      bkb_trx_count: u.bkb_trx_count,
      driver_liter: Number(u.driver_liter.toFixed(1)),
      driver_trx_count: u.driver_trx_count,
      driver_estimasi_biaya: Math.round(u.driver_estimasi_biaya),
      selisih_liter: selisihLiter,
      selisih_pct: selisihPct,
      rekon_status: rekonStatus,
      rekon_label: rekonLabel,
      rekon_color: rekonColor,
      total_liter: Number(effectiveLiter.toFixed(1)),
      total_biaya: Math.round(effectiveBiaya),
      trx_count: trxCount,
      actual_l_hm: actualLpHm,
      actual_km_l: actualKmpL,
      actual_ratio_bkb: actualBkbRatio,
      actual_ratio_driver: actualDriverRatio,
      actual_ratio: actualRatio,
      target_ratio: targetRatio,
      ratio_unit: ratioUnit,
      deviation_pct: Number(deviationPct.toFixed(1)),
      over_liter: Math.round(overLiter),
      waste_cost_rp: wasteCost,
      cost_per_hm: costPerHm,
      cost_per_km: costPerKm,
      is_anomaly: isAnomaly,
      quadrant: quadrant,
      status_label: statusLabel,
      status_color: statusColor,
      recommendation: recommendation,
      last_date: u.last_date
    };
  }).sort((a, b) => (b.bkb_liter + b.driver_liter) - (a.bkb_liter + a.driver_liter));

  const buildModeSummary = (subset) => {
    const tHm = subset.reduce((s, u) => s + u.total_hm, 0);
    const tKm = subset.reduce((s, u) => s + u.total_km, 0);
    const tBkbL = subset.reduce((s, u) => s + u.bkb_liter, 0);
    const tBkbRp = subset.reduce((s, u) => s + u.bkb_biaya, 0);
    const tBkbTrx = subset.reduce((s, u) => s + u.bkb_trx_count, 0);
    const tDrvL = subset.reduce((s, u) => s + u.driver_liter, 0);
    const tDrvTrx = subset.reduce((s, u) => s + u.driver_trx_count, 0);
    const tDrvRp = subset.reduce((s, u) => s + u.driver_estimasi_biaya, 0);
    const tEffL = subset.reduce((s, u) => s + u.total_liter, 0);
    const tEffRp = subset.reduce((s, u) => s + u.total_biaya, 0);
    const tWaste = subset.reduce((s, u) => s + u.waste_cost_rp, 0);
    const anom = subset.filter(u => u.is_anomaly).length;
    const matchCnt = subset.filter(u => u.rekon_status === 'SESUAI').length;
    const underCnt = subset.filter(u => u.rekon_status === 'DRIVER_KURANG').length;
    const overCnt = subset.filter(u => u.rekon_status === 'DRIVER_LEBIH').length;

    return {
      total_units: subset.length,
      total_vra_hm: Number(tHm.toFixed(1)),
      total_vra_km: Math.round(tKm),
      bkb_liter: Number(tBkbL.toFixed(1)),
      bkb_cost: Math.round(tBkbRp),
      bkb_trx_count: tBkbTrx,
      driver_liter: Number(tDrvL.toFixed(1)),
      driver_trx_count: tDrvTrx,
      driver_estimasi_cost: Math.round(tDrvRp),
      net_selisih_liter: Number((tBkbL - tDrvL).toFixed(1)),
      net_selisih_pct: tBkbL > 0 ? Number((((tDrvL - tBkbL) / tBkbL) * 100).toFixed(1)) : 0,
      match_unit_count: matchCnt,
      under_input_count: underCnt,
      over_input_count: overCnt,
      total_fuel_liter: Math.round(tEffL),
      total_fuel_cost: Math.round(tEffRp),
      overall_l_hm: tHm > 0 ? Number((tEffL / tHm).toFixed(2)) : 0,
      overall_bkb_l_hm: tHm > 0 ? Number((tBkbL / tHm).toFixed(2)) : 0,
      overall_driver_l_hm: tHm > 0 ? Number((tDrvL / tHm).toFixed(2)) : 0,
      overall_km_l: tEffL > 0 ? Number((tKm / tEffL).toFixed(2)) : 0,
      overall_bkb_km_l: tBkbL > 0 ? Number((tKm / tBkbL).toFixed(2)) : 0,
      overall_driver_km_l: tDrvL > 0 ? Number((tKm / tDrvL).toFixed(2)) : 0,
      overall_cost_per_hm: tHm > 0 ? Math.round(tEffRp / tHm) : 0,
      efficiency_score: subset.length > 0 ? Math.max(0, Math.min(100, Math.round(100 - ((anom / subset.length) * 100)))) : 100,
      anomaly_count: anom,
      efficient_count: subset.filter(u => !u.is_anomaly && u.total_hm > 10 && u.deviation_pct <= 0).length,
      total_waste_cost_rp: Math.round(tWaste),
      total_over_liter: Math.round(subset.reduce((s, u) => s + u.over_liter, 0)),
      units: subset
    };
  };

  const bkbSiteUnits = comparisonList.filter(u => u.sumber_bbm_mode === 'BKB_SITE');
  const spbuLuarUnits = comparisonList.filter(u => u.sumber_bbm_mode === 'SPBU_LUAR');
  const bkbSiteSummary = buildModeSummary(bkbSiteUnits);
  const spbuLuarSummary = buildModeSummary(spbuLuarUnits);
  const allSummary = buildModeSummary(comparisonList);

  return {
    summary: {
      ...allSummary,
      bkb_site_summary: bkbSiteSummary,
      spbu_luar_summary: spbuLuarSummary
    },
    bkb_site_summary: bkbSiteSummary,
    spbu_luar_summary: spbuLuarSummary,
    monthlyCorrelation: monthlyCorrelation,
    comparisonList: comparisonList,
    bkbSiteUnits: bkbSiteUnits,
    spbuLuarUnits: spbuLuarUnits,
    quadrants: {
      prima: comparisonList.filter(u => u.quadrant === 'PRIMA_EFISIEN'),
      kritis: comparisonList.filter(u => u.quadrant === 'KRITIS_BOROS'),
      heavy: comparisonList.filter(u => u.quadrant === 'HEAVY_WORKLOAD'),
      standby: comparisonList.filter(u => u.quadrant === 'STANDBY_IDLE')
    }
  };
}



