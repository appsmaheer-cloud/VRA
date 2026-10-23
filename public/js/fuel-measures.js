/**
 * fuel-measures.js
 * Measure untuk fact_bkb_fuel: total BBM, rasio konsumsi vs HM terpakai, deteksi anomali, log detail transaksi.
 */
import { applyFilter, groupAggregate, Agg } from './core-measures.js';
import { inferSubKategori } from './vra-measures.js';
import { inferAssetLocation } from './asset-measures.js';

/** Total pemakaian & biaya BBM per unit, dengan filter opsional */
export function measureBbmPerUnit(fuelRows, filters = {}) {
  const filtered = applyFilter(fuelRows, filters);
  return groupAggregate(
    filtered,
    (row) => row.no_asset_manual || 'TANPA UNIT',
    {
      total_liter: Agg.sum('jumlah_bkb_fix'),
      total_biaya: Agg.sum('harga_bkb'),
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
  const unitMap = new Map();
  const rawBkbLogs = [];
  let grandTotalLiter = 0;
  let grandTotalCost = 0;

  // 1. Process Fuel Transactions
  fuelRows.forEach(f => {
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

  // 2. Attach VRA mobility & duration data
  vraRows.forEach(v => {
    const code = (v.kode_unit || v.no_asset_manual || '').trim();
    if (unitMap.has(code)) {
      const u = unitMap.get(code);
      const hm = Number(v.hm_terpakai_calc) || (v.hm_akhir && v.hm_awal ? Number(v.hm_akhir) - Number(v.hm_awal) : 0);
      const jam = Number(v.jam_kerja_calc) || Number(v.total_durasi) || Number(v.durasi) || (hm > 0 ? hm : 0);
      
      let km = Number(v.km_used) || 0;
      if (km === 0 && (Number(v.km_akhir) > Number(v.km_awal))) {
        km = Number(v.km_akhir) - Number(v.km_awal);
      }
      
      const isRoadVehicle = ['DUMP TRUCK', 'TRUCK', 'TRUCK TANGKI', 'MOBIL', 'SEPEDA MOTOR', 'MOTOR LISTRIK'].includes(u.kategori);
      if (km === 0 && isRoadVehicle) {
        km = (hm > 0 ? hm * 18 : (jam > 0 ? jam * 15 : 0));
      }

      u.total_km += km > 0 ? km : 0;
      u.total_jam += (hm > 0 ? hm : (jam > 0 ? jam : 0));
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
  const allDates = fuelRows.map(f => f.tanggal_bkb || f.tanggal).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d));
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
 * DAX Measure: Komparasi Head-to-Head VRA vs BBM (Fleet Operational Efficiency)
 * Memetakan korelasi langsung antara Jam Kerja / HM VRA dengan Konsumsi Bahan Bakar.
 */
export function measureVraFuelComparison(fuelRows = [], vraRows = [], assetMap = new Map()) {
  const BENCHMARKS = {
    'EXCAVATOR': { type: 'HM', target: 16.0, unit: 'L/HM', maxTolerance: 20.0, name: 'Excavator' },
    'BULLDOZER': { type: 'HM', target: 18.0, unit: 'L/HM', maxTolerance: 22.0, name: 'Bulldozer' },
    'WHEEL LOADER': { type: 'HM', target: 12.0, unit: 'L/HM', maxTolerance: 15.0, name: 'Wheel Loader' },
    'GENSET': { type: 'HM', target: 3.2, unit: 'L/HM', maxTolerance: 4.5, name: 'Genset Listrik' },
    'POMPA AIR': { type: 'HM', target: 2.0, unit: 'L/HM', maxTolerance: 3.0, name: 'Pompa Air / Alkon' },
    'SPEEDBOAT': { type: 'HM', target: 22.0, unit: 'L/HM', maxTolerance: 30.0, name: 'Speedboat' },
    'TUGBOAT': { type: 'HM', target: 25.0, unit: 'L/HM', maxTolerance: 35.0, name: 'Tugboat' },
    'POTONG RUMPUT': { type: 'HM', target: 1.0, unit: 'L/HM', maxTolerance: 1.5, name: 'Mesin Potong Rumput' },
    'DUMP TRUCK': { type: 'KM', target: 2.8, unit: 'KM/L', minTolerance: 1.8, name: 'Dump Truck' },
    'TRUCK': { type: 'KM', target: 3.0, unit: 'KM/L', minTolerance: 2.0, name: 'Truk Operasional' },
    'TRUCK TANGKI': { type: 'KM', target: 2.6, unit: 'KM/L', minTolerance: 1.8, name: 'Truk Tangki' },
    'MOBIL': { type: 'KM', target: 9.0, unit: 'KM/L', minTolerance: 6.5, name: 'Mobil Operasional' },
    'SEPEDA MOTOR': { type: 'KM', target: 38.0, unit: 'KM/L', minTolerance: 28.0, name: 'Sepeda Motor' },
    'MOTOR LISTRIK': { type: 'KM', target: 45.0, unit: 'KM/L', minTolerance: 35.0, name: 'Motor Listrik' },
  };
  const DEFAULT_HM_BENCHMARK = { type: 'HM', target: 3.0, unit: 'L/HM', maxTolerance: 4.5 };
  const DEFAULT_KM_BENCHMARK = { type: 'KM', target: 3.0, unit: 'KM/L', minTolerance: 2.0 };

  const unitMap = new Map();
  let totalFuelLiter = 0;
  let totalFuelCost = 0;
  let totalVraHm = 0;
  let totalVraKm = 0;

  // 1. Agregasi data BBM per unit
  fuelRows.forEach(f => {
    const code = String(f.kode_unit || f.no_asset_manual || 'UNKNOWN').trim();
    const liter = Number(f.jumlah_bkb_fix) || Number(f.jumlah_liter) || Number(f.liter) || 0;
    const cost = Number(f.harga_bkb) || Number(f.total_biaya) || Number(f.biaya) || 0;
    const tgl = f.tanggal_bkb || f.tanggal || '';

    totalFuelLiter += liter;
    totalFuelCost += cost;

    if (!unitMap.has(code)) {
      const asset = assetMap.get(code) || {};
      const kat = inferSubKategori(code, asset);
      const loc = inferAssetLocation(asset) || asset.location || 'Lapangan';

      unitMap.set(code, {
        kode_unit: code,
        nama_asset: asset.nama_asset || f.keterangan || code,
        kategori: kat,
        lokasi: loc,
        total_liter: 0,
        total_biaya: 0,
        trx_count: 0,
        total_hm: 0,
        total_km: 0,
        last_date: tgl
      });
    }

    const u = unitMap.get(code);
    u.total_liter += liter;
    u.total_biaya += cost;
    u.trx_count += 1;
    if (tgl && (!u.last_date || tgl > u.last_date)) u.last_date = tgl;
  });

  // 2. Agregasi VRA data per unit
  vraRows.forEach(v => {
    const code = String(v.kode_unit || v.no_asset_manual || 'UNKNOWN').trim();
    const hm = Number(v.hm_terpakai_calc) || (v.hm_akhir && v.hm_awal ? Number(v.hm_akhir) - Number(v.hm_awal) : 0);
    const jam = Number(v.jam_kerja_calc) || Number(v.total_durasi) || Number(v.durasi) || (hm > 0 ? hm : 0);
    const effectiveHm = hm > 0 ? hm : (jam > 0 ? jam : 0);

    let km = Number(v.km_used) || 0;
    if (km === 0 && Number(v.km_akhir) > Number(v.km_awal)) {
      km = Number(v.km_akhir) - Number(v.km_awal);
    }

    totalVraHm += effectiveHm;
    totalVraKm += km;

    if (!unitMap.has(code)) {
      const asset = assetMap.get(code) || {};
      const kat = inferSubKategori(code, asset);
      const loc = inferAssetLocation(asset) || asset.location || 'Lapangan';

      unitMap.set(code, {
        kode_unit: code,
        nama_asset: asset.nama_asset || code,
        kategori: kat,
        lokasi: loc,
        total_liter: 0,
        total_biaya: 0,
        trx_count: 0,
        total_hm: 0,
        total_km: 0,
        last_date: v.tanggal || ''
      });
    }

    const u = unitMap.get(code);
    u.total_hm += effectiveHm;
    if (km === 0 && ['DUMP TRUCK', 'TRUCK', 'TRUCK TANGKI', 'MOBIL', 'SEPEDA MOTOR'].includes(u.kategori)) {
      km = effectiveHm > 0 ? effectiveHm * 18 : 0;
    }
    u.total_km += km;
  });

  // 3. Analisis Korelasi Bulanan (12 Bulan) Head-to-Head VRA (HM) vs BBM (Liter & Biaya)
  const monthlyCorrelation = Array.from({ length: 12 }, (_, i) => {
    const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return {
      monthIdx: i,
      monthName: mNames[i],
      vra_hm: 0,
      vra_km: 0,
      fuel_liter: 0,
      fuel_cost: 0,
      ratio_l_hm: 0,
      cost_per_hm: 0
    };
  });

  fuelRows.forEach(f => {
    const tgl = f.tanggal_bkb || f.tanggal;
    if (tgl) {
      const parts = String(tgl).split('-');
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10) - 1;
        if (m >= 0 && m < 12) {
          monthlyCorrelation[m].fuel_liter += Number(f.jumlah_bkb_fix || f.jumlah || 0);
          monthlyCorrelation[m].fuel_cost += Number(f.harga_bkb || f.total_biaya || 0);
        }
      }
    }
  });

  vraRows.forEach(v => {
    const tgl = v.tanggal || v.tgl_operasional || v.tgl;
    if (tgl) {
      const parts = String(tgl).split('-');
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10) - 1;
        if (m >= 0 && m < 12) {
          const hm = Number(v.hm_terpakai_calc) || (v.hm_akhir && v.hm_awal ? Number(v.hm_akhir) - Number(v.hm_awal) : 0);
          const jam = Number(v.jam_kerja_calc) || Number(v.total_durasi) || (hm > 0 ? hm : 0);
          monthlyCorrelation[m].vra_hm += (hm > 0 ? hm : (jam > 0 ? jam : 0));
          monthlyCorrelation[m].vra_km += Number(v.km_used || 0);
        }
      }
    }
  });

  monthlyCorrelation.forEach(m => {
    m.ratio_l_hm = m.vra_hm > 0 ? Number((m.fuel_liter / m.vra_hm).toFixed(2)) : 0;
    m.cost_per_hm = m.vra_hm > 0 ? Math.round(m.fuel_cost / m.vra_hm) : 0;
  });

  // 4. Hitung Benchmark, Deviasi, Potensi Pemborosan, dan Kuadran Produktivitas per Unit
  let totalWasteCostRp = 0;
  let totalOverLiter = 0;
  let efficientCount = 0;
  let anomalyCount = 0;

  const comparisonList = Array.from(unitMap.values()).map(u => {
    const isRoad = ['DUMP TRUCK', 'TRUCK', 'TRUCK TANGKI', 'MOBIL', 'SEPEDA MOTOR', 'MOTOR LISTRIK'].includes(u.kategori);
    const bm = BENCHMARKS[u.kategori] || (isRoad ? DEFAULT_KM_BENCHMARK : DEFAULT_HM_BENCHMARK);
    
    const actualLpHm = u.total_hm > 0 ? Number((u.total_liter / u.total_hm).toFixed(2)) : 0;
    const actualKmpL = u.total_liter > 0 ? Number((u.total_km / u.total_liter).toFixed(2)) : 0;
    const costPerHm = u.total_hm > 0 ? Math.round(u.total_biaya / u.total_hm) : 0;
    const costPerKm = u.total_km > 0 ? Math.round(u.total_biaya / u.total_km) : 0;
    
    let isAnomaly = false;
    let deviationPct = 0;
    let overLiter = 0;
    let targetRatio = bm.target;
    let actualRatio = bm.type === 'HM' ? actualLpHm : actualKmpL;
    let ratioUnit = bm.unit;

    if (bm.type === 'HM') {
      if (u.total_hm > 5 && targetRatio > 0) {
        deviationPct = ((actualLpHm - targetRatio) / targetRatio) * 100;
        if (actualLpHm > bm.maxTolerance) {
          isAnomaly = true;
          overLiter = Math.max(0, u.total_liter - (u.total_hm * targetRatio));
        }
      }
    } else {
      if (u.total_km > 30 && targetRatio > 0 && actualKmpL > 0) {
        deviationPct = ((targetRatio - actualKmpL) / targetRatio) * 100;
        if (actualKmpL < bm.minTolerance) {
          isAnomaly = true;
          const expectedLtr = u.total_km / targetRatio;
          overLiter = Math.max(0, u.total_liter - expectedLtr);
        }
      }
    }

    const avgPricePerLtr = u.total_liter > 0 ? u.total_biaya / u.total_liter : 6800;
    const wasteCost = Math.round(overLiter * avgPricePerLtr);

    if (isAnomaly) {
      anomalyCount++;
      totalWasteCostRp += wasteCost;
      totalOverLiter += overLiter;
    } else if (u.total_hm > 10 && deviationPct <= 0) {
      efficientCount++;
    }

    // Klasifikasi Kuadran Produktivitas & Efisiensi VRA vs BBM
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
          ? 'Prioritas kalibrasi injektor, cek saringan udara & audit shift kerja.'
          : 'Beban kerja tinggi, periksa jadwal penggantian oli dan filter.';
      }
    } else {
      if (u.total_liter > 50 && (u.total_hm < 5 || isAnomaly)) {
        quadrant = 'KRITIS_BOROS';
        statusLabel = 'Kritis (Idle / Boros)';
        statusColor = 'text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800';
        recommendation = '🚨 Kritis! Solar keluar tinggi tetapi jam kerja VRA minim. Audit potensi kebocoran atau mesin idle lama.';
      } else {
        quadrant = 'STANDBY_IDLE';
        statusLabel = 'Standby / Low Activity';
        statusColor = 'text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
        recommendation = 'Unit jarang beroperasi atau bertindak sebagai cadangan.';
      }
    }

    return {
      ...u,
      actual_l_hm: actualLpHm,
      actual_km_l: actualKmpL,
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
      recommendation: recommendation
    };
  }).sort((a, b) => b.total_liter - a.total_liter);

  const overallLpHm = totalVraHm > 0 ? Number((totalFuelLiter / totalVraHm).toFixed(2)) : 0;
  const overallCostPerHm = totalVraHm > 0 ? Math.round(totalFuelCost / totalVraHm) : 0;
  const overallKmpL = totalFuelLiter > 0 ? Number((totalVraKm / totalFuelLiter).toFixed(2)) : 0;
  const efficiencyScore = comparisonList.length > 0 
    ? Math.max(0, Math.min(100, Math.round(100 - ((anomalyCount / comparisonList.length) * 100))))
    : 100;

  return {
    summary: {
      total_units: comparisonList.length,
      total_vra_hm: Number(totalVraHm.toFixed(1)),
      total_vra_km: Math.round(totalVraKm),
      total_fuel_liter: Math.round(totalFuelLiter),
      total_fuel_cost: Math.round(totalFuelCost),
      overall_l_hm: overallLpHm,
      overall_cost_per_hm: overallCostPerHm,
      overall_km_l: overallKmpL,
      efficiency_score: efficiencyScore,
      anomaly_count: anomalyCount,
      efficient_count: efficientCount,
      total_waste_cost_rp: Math.round(totalWasteCostRp),
      total_over_liter: Math.round(totalOverLiter)
    },
    monthlyCorrelation: monthlyCorrelation,
    comparisonList: comparisonList,
    quadrants: {
      prima: comparisonList.filter(u => u.quadrant === 'PRIMA_EFISIEN'),
      kritis: comparisonList.filter(u => u.quadrant === 'KRITIS_BOROS'),
      heavy: comparisonList.filter(u => u.quadrant === 'HEAVY_WORKLOAD'),
      standby: comparisonList.filter(u => u.quadrant === 'STANDBY_IDLE')
    }
  };
}



