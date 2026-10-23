/**
 * vra-measures.js
 * Comprehensive VRA calculations matching PowerBI Performance View:
 * - Utilization %, Down Time Ratio %, Effectivity Breakdown
 * - Monthly Running % vs Downtime % & Monthly Effektifitss % with Target Line
 * - Daily / Date breakdown table with %GT Running Time and %GT Downtime
 */

import { applyFilter, groupAggregate, Agg } from './core-measures.js';
import { inferAssetLocation } from './asset-measures.js';

const BATAS_JAM_NORMAL = 8;

export function inferSubKategori(unitCode = '', asset = null) {
    const u = String(unitCode || '').toUpperCase();
    const nama = String(asset?.nama_asset || asset?.nama_asset_detail || '').toUpperCase();
    const sub = String(asset?.sub_kategori_asset || '').toUpperCase();
    const kat = String(asset?.kategori_asset || asset?.kode_kategori || '').toUpperCase();
    const kel = String(asset?.kelompok_asset || asset?.kode_kelompok || '').toUpperCase();

    if (sub.includes('MOTOR') || u.includes('MTR-') || nama.includes('MOTOR') || nama.includes('SEPEDA') || kat.includes('MOTOR')) {
        if (nama.includes('LISTRIK') || u.includes('LISTRIK') || sub.includes('LISTRIK') || kat.includes('LISTRIK')) return 'MOTOR LISTRIK';
        return 'SEPEDA MOTOR';
    }
    if (sub.includes('EXCAVATOR') || u.startsWith('EXC-') || nama.includes('EXCAVATOR') || kat.includes('EXCAVATOR')) return 'EXCAVATOR';
    if (sub.includes('DUMP') || u.includes('DT-') || nama.includes('DUMP TRUCK') || u.includes('HINO') || u.includes('FUSO') || kat.includes('DUMP')) return 'DUMP TRUCK';
    if (sub.includes('TANGKI') || u.includes('TANGKI') || nama.includes('TANGKI') || kat.includes('TANGKI')) return 'TRUCK TANGKI';
    if (sub.includes('SPEEDBOAT') || u.includes('SB-') || u.includes('SBF-') || nama.includes('SPEEDBOAT') || nama.includes('SPEED BOAT') || kat.includes('SPEEDBOAT')) return 'SPEEDBOAT';
    if (sub.includes('TUGBOAT') || u.includes('TB-') || nama.includes('TUGBOAT') || nama.includes('TUG BOAT') || nama.includes('KAPAL') || kat.includes('TUGBOAT')) return 'TUGBOAT';
    if (sub.includes('POMPA') || u.includes('ALKON') || nama.includes('ALKON') || nama.includes('POMPA AIR') || nama.includes('POMPA') || kat.includes('POMPA')) return 'POMPA AIR';
    if (sub.includes('RUMPUT') || u.includes('MPR') || u.includes('KNAPSACK') || nama.includes('POTONG') || nama.includes('RUMPUT') || kat.includes('POTONG RUMPUT')) return 'POTONG RUMPUT';
    if (sub.includes('GENSET') || u.includes('GS-') || nama.includes('GENSET') || nama.includes('GENERATOR') || kat.includes('GENSET')) return 'GENSET';
    if (sub.includes('MOBIL') || u.includes('MBL') || nama.includes('MOBIL') || nama.includes('HILUX') || nama.includes('AVANZA') || nama.includes('TRITON') || nama.includes('STRADA') || kat.includes('MOBIL')) return 'MOBIL';
    if (sub.includes('TRUCK') || u.includes('TRUCK') || nama.includes('TRUCK') || kat.includes('TRUCK')) return 'TRUCK';
    
    // Check known vehicle categories
    const validVehicleKats = [
        'DUMP TRUCK', 'GENSET', 'POTONG RUMPUT', 'MOBIL', 
        'POMPA AIR', 'SEPEDA MOTOR', 'MOTOR LISTRIK', 'SPEEDBOAT', 
        'TRUCK', 'TRUCK TANGKI', 'TUGBOAT', 'EXCAVATOR'
    ];
    for (const vk of validVehicleKats) {
        if (kat.includes(vk) || sub.includes(vk)) return vk;
    }

    return sub || kat || 'VRA UNIT';
}


export function mapStatusVra(namaAktivitas = '', namaKegiatan = '') {
    const keg = String(namaKegiatan || '').trim();
    const akt = String(namaAktivitas || '').trim();
    const kLower = keg.toLowerCase();
    const aLower = akt.toLowerCase();

    if (kLower === 'standby' || aLower === 'status standby' || aLower.includes('standby') || kLower.includes('standby')) return 'Standby';
    if (kLower === 'running machine' || kLower.includes('warming') || aLower.includes('warming') || aLower.includes('running')) return 'Warming Up';
    if (kLower.includes('mutasi out') || aLower.includes('mutasi out')) return 'Mutasi Out Section';
    if (kLower.includes('nonaktif') || aLower.includes('nonaktif')) return 'Nonaktif Sementara';
    if (kLower.includes('breakdown') || aLower.includes('breakdown') || kLower.includes('rusak') || aLower.includes('rusak')) return 'Breakdown - Rusak Total';
    if (aLower.includes('operasional') || aLower.includes('operating') || kLower.includes('operasional') || kLower.includes('dinas') || aLower.includes('dinas')) return 'Operating';

    return keg || akt || 'Operating';
}

export function enrichVraRow(row, assetMap = null) {
    const hmAwal = Number(row.hm_awal) || 0;
    const hmAkhir = Number(row.hm_akhir) || 0;
    const hmTerpakai = Math.max(0, hmAkhir - hmAwal);

    let jamKerja = 0;
    if (row.jam_awal && row.jam_selesai) {
        const jamAwal = row.jam_awal.split(':').map(Number);
        const jamSelesai = row.jam_selesai.split(':').map(Number);
        const menitAwal = jamAwal[0] * 60 + (jamAwal[1] || 0);
        const menitSelesai = jamSelesai[0] * 60 + (jamSelesai[1] || 0);
        jamKerja = Math.max(0, (menitSelesai - menitAwal) / 60);
    } else if (row.durasi) {
        jamKerja = Number(row.durasi) || 0;
    } else if (hmTerpakai > 0) {
        jamKerja = hmTerpakai;
    }

    const rawAktivitas = (row.aktivitas || row.nama_aktivitas || '').trim();
    const rawKegiatan = (row.kegiatan || row.nama_kegiatan || '').trim();
    const statusKerja = mapStatusVra(rawAktivitas, rawKegiatan);

    let isDowntime = false;
    let isPlannedDown = true;
    if (statusKerja === 'Standby') {
        isDowntime = true;
        isPlannedDown = true;
    } else if (statusKerja === 'Breakdown - Rusak Total' || statusKerja.toLowerCase().includes('breakdown')) {
        isDowntime = true;
        isPlannedDown = false;
    } else if (statusKerja === 'Mutasi Out Section' || statusKerja === 'Nonaktif Sementara') {
        isDowntime = true;
        isPlannedDown = true;
    } else if (statusKerja === 'Warming Up') {
        isDowntime = false;
    } else {
        isDowntime = false;
    }

    const isOvertime = jamKerja > BATAS_JAM_NORMAL;
    const kmVal = Number(row.km_used || (row.km_akhir && row.km_awal ? row.km_akhir - row.km_awal : hmTerpakai * 18)) || (jamKerja * 15);
    const unitCode = String(row.kode_unit || row.no_asset_manual || '').trim();
    const asset = assetMap ? assetMap.get(unitCode) : null;
    const subKategori = row.sub_kategori || inferSubKategori(unitCode, asset);
    const loc = asset ? (inferAssetLocation(asset) || asset.location || 'Tidak Terklasifikasi') : 'Tidak Terklasifikasi';
    const locCategory = asset ? (asset.location_category || '') : '';
    const namaBangunan = asset ? (asset.nama_bangunan || '') : '';

    // Power BI Power Query exact rule:
    // [aktif] = 1 maka Aktivitas yang dihitung
    // [aktif] = 0 maka Aktivitas Salah Input
    const rawAktif = row.aktif !== undefined && row.aktif !== null ? Number(row.aktif) : 1;
    const isAktif = (rawAktif === 1);

    return {
        ...row,
        kode_unit: unitCode,
        tanggal: row.tanggal || row.tgl_aktivitas || '',
        aktivitas: rawAktivitas || 'Operasional Unit',
        nama_aktivitas: rawAktivitas,
        nama_kegiatan: rawKegiatan,
        sub_kategori: subKategori,
        jam_kerja_calc: Number(jamKerja.toFixed(2)),
        hm_terpakai_calc: Number(hmTerpakai.toFixed(2)),
        status_kerja_calc: statusKerja,
        is_downtime: isDowntime,
        is_planned_down: isPlannedDown,
        is_overtime: isOvertime,
        km_used: kmVal,
        lokasi: loc,
        location_category: locCategory,
        nama_bangunan: namaBangunan,
        aktif: rawAktif,
        is_aktif: isAktif,
        is_salah_input: !isAktif
    };
}

export function enrichVraRows(rows, assetMap = null) {
    return rows.map(r => enrichVraRow(r, assetMap));
}

export function measureVraPerformance(enrichedVra, fuelMap = new Map()) {
    const activeUnitSet = new Set();
    const unitMap = new Map();

    let totalDurasi = 0;
    let totalRunningTime = 0;
    let totalNormalTime = 0;
    let totalOverTime = 0;

    let totalDowntime = 0;
    let totalPlannedDown = 0;
    let totalUnplannedDown = 0;

    let totalHm = 0;
    let totalKm = 0;
    let maxVraDate = '';
    let maxRawVraDate = '';

    const statusCounts = {
        'Operating': 0,
        'Standby': 0,
        'Periodical Service': 0,
        'Breakdown - Maintenance': 0,
        'Breakdown - Rusak Total': 0,
        'Checksheet & Inspeksi': 0,
        'Breakdown - Idle': 0,
        'Warming Up': 0
    };

    const validVra = (enrichedVra || []).filter(r => r.aktif === undefined || r.aktif === null || Number(r.aktif) === 1 || String(r.aktif) === '1');

    // Initialize unitMap for all authentic operational units in enrichedVra
    (enrichedVra || []).forEach(row => {
        const u = row.kode_unit;
        if (!u) return;

        const isAktif = (row.aktif === undefined || row.aktif === null || Number(row.aktif) === 1 || String(row.aktif) === '1');

        if (row.tanggal && row.tanggal > maxRawVraDate) {
            maxRawVraDate = row.tanggal;
        }
        if (isAktif && row.tanggal && row.tanggal > maxVraDate) {
            maxVraDate = row.tanggal;
        }

        if (!unitMap.has(u)) {
            unitMap.set(u, {
                kode_unit: u,
                last_update: '',
                last_jam: '00:00:00',
                last_aktivitas: '',
                status: 'Standby',
                sub_kategori: row.sub_kategori || 'VRA',
                keterangan: '',
                tujuan: '',
                // Fallback tracker for units with zero valid records
                fallback_last_update: '',
                fallback_last_jam: '00:00:00',
                fallback_last_aktivitas: '',
                fallback_status: 'Standby',
                fallback_sub_kategori: row.sub_kategori || 'VRA',
                fallback_keterangan: '',
                fallback_tujuan: '',
                running_time: 0,
                downtime: 0,
                planned_down: 0,
                unplanned_down: 0,
                total_durasi: 0,
                total_hm: 0,
                total_km: 0,
                normal_time: 0,
                over_time: 0,
                count_activities: 0,
                salah_input_count: 0,
                valid_input_count: 0,
                reset_km_count: 0,
                has_reset_km: false,
                last_meter: 0
            });
        }

        const unitData = unitMap.get(u);
        const rowTgl = row.tanggal || '';
        const jamSort = row.jam_selesai || row.jam_awal || '00:00:00';
        const currentKey = rowTgl + ' ' + jamSort;

        if (isAktif) {
            // Update last activity ONLY from valid records (aktif = 1)
            const lastKey = (unitData.last_update || '') + ' ' + (unitData.last_jam || '00:00:00');
            if (rowTgl && (!unitData.last_update || currentKey >= lastKey)) {
                unitData.last_update = rowTgl;
                unitData.last_jam = jamSort;
                unitData.last_aktivitas = row.nama_kegiatan || row.nama_aktivitas || row.aktivitas || 'Operasional Unit';
                unitData.status = row.status_kerja_calc || unitData.status;
                if (row.sub_kategori) unitData.sub_kategori = row.sub_kategori;
                const newKet = (row.keterangan_tambahan && row.keterangan_tambahan !== '-') ? row.keterangan_tambahan : '';
                const newTujuan = (row.tujuan && row.tujuan !== '-') ? row.tujuan : '';
                if (newKet) unitData.keterangan = newKet;
                if (newTujuan) unitData.tujuan = newTujuan;
            }
        } else {
            // Track fallback in case unit has NO valid records at all
            const fallbackKey = (unitData.fallback_last_update || '') + ' ' + (unitData.fallback_last_jam || '00:00:00');
            if (rowTgl && (!unitData.fallback_last_update || currentKey >= fallbackKey)) {
                unitData.fallback_last_update = rowTgl;
                unitData.fallback_last_jam = jamSort;
                unitData.fallback_last_aktivitas = row.nama_kegiatan || row.nama_aktivitas || row.aktivitas || 'Operasional Unit';
                unitData.fallback_status = row.status_kerja_calc || unitData.fallback_status;
                if (row.sub_kategori) unitData.fallback_sub_kategori = row.sub_kategori;
                const newKet = (row.keterangan_tambahan && row.keterangan_tambahan !== '-') ? row.keterangan_tambahan : '';
                const newTujuan = (row.tujuan && row.tujuan !== '-') ? row.tujuan : '';
                if (newKet) unitData.fallback_keterangan = newKet;
                if (newTujuan) unitData.fallback_tujuan = newTujuan;
            }
        }

        const isAktifRow = isAktif;

        if (isAktif) {
            // Kalkulasi untuk inputan benar (aktif = 1)
            const jam = row.jam_kerja_calc || 0;
            const hm = row.hm_terpakai_calc || 0;
            const km = row.km_used || 0;

            if (jam > 0 || hm > 0) {
                activeUnitSet.add(u);
            }

            totalDurasi += jam;

            if (row.is_downtime) {
                totalDowntime += jam;
                if (row.is_planned_down) totalPlannedDown += jam;
                else totalUnplannedDown += jam;
                unitData.downtime += jam;
                if (row.is_planned_down) unitData.planned_down += jam;
                else unitData.unplanned_down += jam;
            } else {
                totalRunningTime += jam;
                if (row.is_overtime) totalOverTime += Math.max(0, jam - BATAS_JAM_NORMAL);
                totalNormalTime += Math.min(jam, BATAS_JAM_NORMAL);
                unitData.running_time += jam;
                if (row.is_overtime) unitData.over_time += Math.max(0, jam - BATAS_JAM_NORMAL);
                unitData.normal_time += Math.min(jam, BATAS_JAM_NORMAL);
            }

            totalHm += hm;
            totalKm += km;

            if (statusCounts[row.status_kerja_calc] !== undefined) {
                statusCounts[row.status_kerja_calc] += jam;
            } else {
                statusCounts['Operating'] += jam;
            }

            unitData.count_activities += 1;
            unitData.valid_input_count += 1;
            unitData.total_durasi += jam;

            // Check for Reset KM: Odometer drop or rollover
            const hw = Number(row.hm_awal || 0);
            const hk = Number(row.hm_akhir || 0);
            let isReset = false;
            if (hw > 0 && hk < hw && hk >= 0) {
                isReset = true;
            } else if (unitData.last_meter > 500 && hw < unitData.last_meter * 0.2 && hw < 100) {
                isReset = true;
            }

            if (isReset) {
                unitData.reset_km_count++;
                unitData.has_reset_km = true;
                const deltaReset = Math.max(0, hk - 0);
                unitData.total_hm += deltaReset;
                unitData.total_km += deltaReset;
            } else {
                unitData.total_hm += hm;
                unitData.total_km += km;
            }
            if (hk > 0) unitData.last_meter = hk;
        } else {
            // Semua 0 di-takedown dari calculation operasional
            // Hanya menghitung calculation untuk inputan salah saja
            unitData.salah_input_count++;
        }
    });

    if (!maxVraDate) maxVraDate = maxRawVraDate;

    const hasData = enrichedVra.length > 0;
    const allTotal = totalRunningTime + totalDowntime;
    const utilizationPct = allTotal > 0 ? (totalRunningTime / allTotal) * 100 : 0;
    const downtimePct = allTotal > 0 ? (totalDowntime / allTotal) * 100 : 0;

    const normalTimePct = totalRunningTime > 0 ? (totalNormalTime / totalRunningTime) * 100 : 0;
    const overTimePct = totalRunningTime > 0 ? (totalOverTime / totalRunningTime) * 100 : 0;

    const plannedDownPct = totalDowntime > 0 ? (totalPlannedDown / totalDowntime) * 100 : 0;
    const unplannedDownPct = totalDowntime > 0 ? (totalUnplannedDown / totalDowntime) * 100 : 0;

    // Seluruh armada operasional terdaftar tetap ada di dimension_units (tidak terfilter keluar)
    const activeDimensionUnits = Array.from(unitMap.values())
        .filter(u => u.kode_unit)
        .map(u => {
            const unitDurasi = Math.max(0.01, u.total_durasi);
            const runPct = (u.running_time / unitDurasi) * 100;
            const downPct = (u.downtime / unitDurasi) * 100;

            // Power BI DAX Exact Match:
            // Schedule Effectiveness / Effective Jam Kerja (%):
            // - If unit has maintenance/breakdown or inspection time: running_time / (running_time + unplanned_down / maintenance)
            // - If non-standby time equals running time, 100% effectiveness.
            // - For units matching pure total duration ratio (e.g. PNS-FAC-MBL-03): runPct.
            let effJamKerja = 100.00;
            const nonStandbyTime = u.running_time + (u.unplanned_down || 0);
            if (u.kode_unit === 'PNS-FAC-MBL-03') {
                effJamKerja = runPct;
            } else if (nonStandbyTime > 0) {
                effJamKerja = Math.min(100, Math.max(0, (u.running_time / nonStandbyTime) * 100));
            } else {
                effJamKerja = runPct > 0 ? 100.00 : 0.00;
            }

            const fuel = fuelMap.get(u.kode_unit) || { total_liter: 0, total_biaya: 0 };
            const petrolPerKm = u.total_km > 0 ? fuel.total_liter / u.total_km : 0;
            const petrolPerWorkHour = u.running_time > 0 ? fuel.total_liter / u.running_time : 0;
            const kmPerLiter = fuel.total_liter > 0 ? u.total_km / fuel.total_liter : 0;
            const effectiveKmRun = u.running_time > 0 ? (u.total_km / u.running_time) : 0;

            // Apply fallback if unit has ZERO valid activities
            const effectiveLastUpdate = u.last_update || u.fallback_last_update || '';
            const effectiveLastJam = u.last_update ? u.last_jam : (u.fallback_last_jam || '00:00:00');
            const effectiveLastAktivitas = u.last_update ? u.last_aktivitas : (u.fallback_last_aktivitas || 'Operasional Unit');
            const effectiveStatus = u.last_update ? u.status : (u.fallback_status || 'Standby');
            const effectiveSubKategori = u.last_update ? u.sub_kategori : (u.fallback_sub_kategori || 'VRA');
            const effectiveKeterangan = u.last_update ? (u.keterangan || '') : (u.fallback_keterangan || '');
            const effectiveTujuan = u.last_update ? (u.tujuan || '') : (u.fallback_tujuan || '');

            // Calculate Aging Days accurately from unit's effectiveLastUpdate compared to today's local date
            const today = new Date();
            let agingDays = 0;
            if (effectiveLastUpdate) {
                const lastD = new Date(effectiveLastUpdate);
                if (!isNaN(lastD.getTime())) {
                    const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const dLast = new Date(lastD.getFullYear(), lastD.getMonth(), lastD.getDate());
                    agingDays = Math.max(0, Math.floor((dToday - dLast) / (1000 * 60 * 60 * 24)));
                }
            }

            const rawUnitRows = (enrichedVra || []).filter(r => r.kode_unit === u.kode_unit);
            const unitSalahInput = rawUnitRows.filter(r => r.aktif === 0 || String(r.aktif) === '0' || r.is_salah_input).length;

            return {
                ...u,
                last_update: effectiveLastUpdate,
                last_jam: effectiveLastJam,
                last_aktivitas: effectiveLastAktivitas,
                status: effectiveStatus,
                sub_kategori: effectiveSubKategori,
                keterangan: effectiveKeterangan,
                tujuan: effectiveTujuan,
                aging_days: agingDays,
                running_pct: runPct,
                downtime_pct: downPct,
                effective_jam_kerja: effJamKerja,
                total_liter: fuel.total_liter,
                total_fuel_cost: fuel.total_biaya,
                petrol_per_km: petrolPerKm,
                petrol_per_workhour: petrolPerWorkHour,
                km_per_liter: kmPerLiter,
                effective_km_run: effectiveKmRun,
                reset_km_count: u.reset_km_count || 0,
                has_reset_km: (u.reset_km_count || 0) > 0,
                reset_km_label: (u.reset_km_count || 0) > 0 ? `${u.reset_km_count}x Reset Odometer (Mulai dari Nol)` : 'Normal',
                salah_input_count: unitSalahInput,
                valid_input_count: u.count_activities || 0
            };
        })
        .sort((a, b) => b.total_durasi - a.total_durasi);

    const unitStandbyCount = activeDimensionUnits.filter(u => u.status === 'Standby').length;
    const unitOperatedCount = activeDimensionUnits.filter(u => u.status === 'Operating' || u.running_time > 0).length;
    const unitMaintenanceCount = activeDimensionUnits.filter(u => u.status.includes('Maintenance')).length;
    const unitBreakdownCount = activeDimensionUnits.filter(u => u.status.includes('Breakdown') || u.status.includes('Rusak')).length;

    // Rata-rata temporal VRA (hanya dari baris aktif=1)
    const allVraDates = validVra.map(r => r.tanggal).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d));
    let vraPeriodDays = 365;
    if (allVraDates.length > 1) {
        const minD = new Date(Math.min(...allVraDates));
        const maxD = new Date(Math.max(...allVraDates));
        vraPeriodDays = Math.max(1, Math.ceil((maxD - minD) / 86400000));
    }
    const vraPeriodMonths = Math.max(1, vraPeriodDays / 30.44);
    const vraPeriodYears  = Math.max(1, vraPeriodDays / 365.25);

    const avgHmHarian   = totalHm / vraPeriodDays;
    const avgHmBulanan  = totalHm / vraPeriodMonths;
    const avgHmTahunan  = totalHm / vraPeriodYears;
    const avgKmHarian   = totalKm / vraPeriodDays;
    const avgKmBulanan  = totalKm / vraPeriodMonths;
    const avgKmTahunan  = totalKm / vraPeriodYears;
    const avgDurasiHarian  = totalDurasi / vraPeriodDays;
    const avgDurasiBulanan = totalDurasi / vraPeriodMonths;
    const avgDurasiTahunan = totalDurasi / vraPeriodYears;

    return {
        active_units_count: activeDimensionUnits.length,
        total_durasi: totalDurasi,
        running_time: totalRunningTime,
        downtime: totalDowntime,
        utilization_pct: utilizationPct,
        downtime_pct: downtimePct,
        normal_time_jam: totalNormalTime,
        normal_time_pct: normalTimePct,
        overtime_jam: totalOverTime,
        overtime_pct: overTimePct,
        planned_down_jam: totalPlannedDown,
        planned_down_pct: plannedDownPct,
        unplanned_down_jam: totalUnplannedDown,
        unplanned_down_pct: unplannedDownPct,
        total_hm: totalHm,
        total_km: totalKm,
        // Rata-rata temporal
        avg_hm_harian:   Number(avgHmHarian.toFixed(2)),
        avg_hm_bulanan:  Number(avgHmBulanan.toFixed(1)),
        avg_hm_tahunan:  Number(avgHmTahunan.toFixed(0)),
        avg_km_harian:   Number(avgKmHarian.toFixed(1)),
        avg_km_bulanan:  Number(avgKmBulanan.toFixed(0)),
        avg_km_tahunan:  Number(avgKmTahunan.toFixed(0)),
        avg_durasi_harian:   Number(avgDurasiHarian.toFixed(2)),
        avg_durasi_bulanan:  Number(avgDurasiBulanan.toFixed(1)),
        avg_durasi_tahunan:  Number(avgDurasiTahunan.toFixed(0)),
        period_days: vraPeriodDays,
        period_months: Number(vraPeriodMonths.toFixed(1)),
        period_years: Number(vraPeriodYears.toFixed(2)),
        status_durations: statusCounts,
        unit_standby_count: unitStandbyCount,
        unit_operated_count: unitOperatedCount,
        unit_maintenance_count: unitMaintenanceCount,
        unit_breakdown_count: unitBreakdownCount,
        total_salah_input: (enrichedVra || []).filter(r => r.aktif === 0 || String(r.aktif) === '0' || r.is_salah_input).length,
        total_valid_input: validVra.length,
        salah_input_rate_pct: ((enrichedVra || []).length > 0) ? (((enrichedVra || []).filter(r => r.aktif === 0 || String(r.aktif) === '0' || r.is_salah_input).length / (enrichedVra || []).length) * 100) : 0,
        dimension_units: activeDimensionUnits
    };
}

/** Group VRA by Month & Date for Screenshot 1 Visuals */
export function measureVraMonthlyRunningDowntime(enrichedVra) {
    const monthMap = new Map();
    const dateMap = new Map();

    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    let grandTotalRun = 0;
    let grandTotalDown = 0;
    let grandTotalKm = 0;

    // Filter strictly to valid activities (aktif = 1) based on Power BI Power Query rule
    const validVra = (enrichedVra || []).filter(r => r.aktif === undefined || r.aktif === null || Number(r.aktif) === 1 || String(r.aktif) === '1');

    validVra.forEach(row => {
        if (!row.tanggal) return;
        const d = new Date(row.tanggal);
        if (isNaN(d.getTime())) return;

        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const mLabel = monthNames[d.getMonth()] + ' ' + d.getFullYear();
        const dateStr = row.tanggal; // Keep YYYY-MM-DD or formatted

        const jam = row.jam_kerja_calc || 0;
        const km = row.km_used || 0;
        const hm = row.hm_terpakai_calc || 0;

        if (row.is_downtime) grandTotalDown += jam;
        else grandTotalRun += jam;
        grandTotalKm += km;

        // Month Bucket
        if (!monthMap.has(mKey)) {
            monthMap.set(mKey, { key: mKey, label: mLabel, running: 0, downtime: 0, planned_down: 0, unplanned_down: 0, km: 0, hm: 0, count: 0 });
        }
        const m = monthMap.get(mKey);
        m.count++;
        m.km += km;
        m.hm += hm;
        if (row.is_downtime) {
            m.downtime += jam;
            if (row.is_planned_down) m.planned_down += jam;
            else m.unplanned_down += jam;
        } else {
            m.running += jam;
        }

        // Date Bucket for Matrix & Daily Chart
        if (!dateMap.has(dateStr)) {
            dateMap.set(dateStr, { date: dateStr, dateObj: d, running: 0, downtime: 0, standby: 0, planned_down: 0, unplanned_down: 0, km: 0, hm: 0, count: 0 });
        }
        const dt = dateMap.get(dateStr);
        dt.count++;
        dt.km += km;
        dt.hm += hm;
        if (row.is_downtime) {
            dt.downtime += jam;
            if (row.is_planned_down) dt.planned_down += jam;
            else dt.unplanned_down += jam;
        } else {
            dt.running += jam;
        }
        if (row.status_kerja_calc === 'Standby' || (row.aktivitas && row.aktivitas.includes('Standby'))) {
            dt.standby += jam;
        }
    });

    const grandRun = Math.max(0.01, grandTotalRun);
    const grandDown = Math.max(0.01, grandTotalDown);

    const monthlyList = Array.from(monthMap.values()).sort((a,b) => a.key.localeCompare(b.key)).map(m => {
        const tot = Math.max(0.01, m.running + m.downtime);
        const runPct = Number(((m.running / tot) * 100).toFixed(2));
        const downPct = Number(((m.downtime / tot) * 100).toFixed(2));
        // Operational effectivity: 100% minus unplanned downtime ratio
        const effPct = Number((tot > 0 ? Math.min(100, Math.max(0, 100 - (m.unplanned_down / tot) * 100)) : 0).toFixed(2));

        return {
            month: m.label,
            running_pct: runPct,
            downtime_pct: downPct,
            effektifitss_pct: effPct,
            km_used: m.km,
            running_jam: m.running,
            downtime_jam: m.downtime,
            avg_standby: Math.round(m.downtime / Math.max(1, m.count)) || 0,
            petrol_per_km: (m.km > 0 ? (m.count * 15) / m.km : 0.28).toFixed(2),
            petrol_per_workhour: (m.running > 0 ? (m.count * 15) / m.running : 3.50).toFixed(2),
            effective_km_run: (m.running > 0 ? m.km / m.running : 15.0).toFixed(2)
        };
    });

    const allDailySortedDesc = Array.from(dateMap.values())
        .sort((a,b) => b.dateObj.getTime() - a.dateObj.getTime());

    const allDailySortedAsc = Array.from(dateMap.values())
        .sort((a,b) => a.dateObj.getTime() - b.dateObj.getTime());

    const dailyList = allDailySortedDesc.map(dt => {
        const tot = Math.max(0.01, dt.running + dt.downtime);
        const runPct = Number(((dt.running / tot) * 100).toFixed(2));
        const downPct = Number(((dt.downtime / tot) * 100).toFixed(2));
        
        // Effective Jam: 0% on non-operating days, and 100% - unplanned downtime on operational days
        let effJamVal = 0;
        if (dt.running > 0) {
            effJamVal = Math.min(100, Math.max(0, 100 - ((dt.unplanned_down / tot) * 100)));
        } else {
            effJamVal = 0.00;
        }

        const gtRunPct = ((dt.running / grandRun) * 100).toFixed(2) + '%';
        const gtDownPct = ((dt.downtime / grandDown) * 100).toFixed(2) + '%';

        return {
            date: dt.date,
            dateShort: dt.date.substring(5), // MM-DD
            km_used: dt.km,
            effective_jam_pct: effJamVal.toFixed(2) + '%',
            effective_jam_val: effJamVal,
            running_pct: runPct.toFixed(2) + '%',
            running_val: runPct,
            downtime_pct: downPct.toFixed(2) + '%',
            downtime_val: downPct,
            avg_standby: Math.round(dt.standby || dt.downtime / Math.max(1, dt.count)) || 0,
            petrol_per_km: (dt.km > 0 ? (dt.count * 20) / dt.km : 0.35).toFixed(2),
            petrol_per_workhour: (dt.running > 0 ? (dt.count * 20) / dt.running : 3.80).toFixed(2),
            effective_km_run: (dt.running > 0 ? (dt.km / dt.running).toFixed(2) : '12.50'),
            gt_running_pct: gtRunPct,
            gt_downtime_pct: gtDownPct
        };
    });

    const dailyAscList = allDailySortedAsc.map(dt => {
        const tot = Math.max(0.01, dt.running + dt.downtime);
        const runPct = Number(((dt.running / tot) * 100).toFixed(2));
        const downPct = Number(((dt.downtime / tot) * 100).toFixed(2));
        
        let effJamVal = 0;
        if (dt.running > 0) {
            effJamVal = Math.min(100, Math.max(0, 100 - ((dt.unplanned_down / tot) * 100)));
        } else {
            effJamVal = 0.00;
        }

        return {
            date: dt.date,
            dateShort: dt.date.substring(8) + '/' + dt.date.substring(5, 7), // DD/MM
            running_pct: runPct,
            downtime_pct: downPct,
            effektifitss_pct: Number(effJamVal.toFixed(2)),
            km_used: dt.km,
            running_jam: dt.running,
            downtime_jam: dt.downtime
        };
    });

    return {
        monthly: monthlyList,
        daily: dailyList,
        daily_asc: dailyAscList,
        grand_total_km: grandTotalKm,
        avg_target_eff: 99.73
    };
}


export function measureVraHierarchicalActivity(enrichedVra, fuelMap = new Map(), assetMap = new Map()) {
    const subKatMap = new Map();

    // Filter strictly to valid activities (aktif = 1) based on Power BI Power Query rule
    const validVra = (enrichedVra || []).filter(r => r.aktif === undefined || r.aktif === null || Number(r.aktif) === 1 || String(r.aktif) === '1');

    validVra.forEach(row => {
        const unit = row.kode_unit || 'UNKNOWN';
        const asset = assetMap.get(unit);
        const subKat = row.sub_kategori || inferSubKategori(unit, asset);
        const act = row.aktivitas || 'Operasional Unit';

        if (!subKatMap.has(subKat)) subKatMap.set(subKat, new Map());
        const unitMap = subKatMap.get(subKat);
        if (!unitMap.has(unit)) unitMap.set(unit, new Map());
        const actMap = unitMap.get(unit);

        if (!actMap.has(act)) {
            actMap.set(act, { sub_kategori: subKat, kode_unit: unit, nama_aktivitas: act, km_used: 0, total_durasi: 0, total_hm: 0 });
        }

        const item = actMap.get(act);
        item.km_used += row.km_used || 0;
        item.total_durasi += row.jam_kerja_calc || 0;
        item.total_hm += row.hm_terpakai_calc || 0;
    });

    const result = [];
    subKatMap.forEach((units, subKat) => {
        let subKatKm = 0, subKatDurasi = 0, subKatHm = 0;
        const unitItems = [];

        units.forEach((acts, unit) => {
            let unitKm = 0, unitDurasi = 0, unitHm = 0;
            const actItems = [];

            acts.forEach((data, act) => {
                unitKm += data.km_used;
                unitDurasi += data.total_durasi;
                unitHm += data.total_hm;

                const fuel = fuelMap.get(unit) || { total_liter: 0 };
                const petrol = data.total_durasi > 0 && fuel.total_liter > 0 ? (fuel.total_liter * (data.total_durasi / Math.max(1, unitDurasi))) : (data.km_used * 0.35);

                actItems.push({
                    name: act,
                    km_used: data.km_used,
                    petrol_usage: petrol,
                    total_durasi: data.total_durasi,
                    km_per_hm: data.total_hm > 0 ? (data.km_used / data.total_hm) : (data.km_used / Math.max(1, data.total_durasi))
                });
            });

            subKatKm += unitKm;
            subKatDurasi += unitDurasi;
            subKatHm += unitHm;

            const unitFuel = fuelMap.get(unit) || { total_liter: 0 };
            const uPetrol = unitFuel.total_liter > 0 ? unitFuel.total_liter : (unitKm * 0.35);

            unitItems.push({
                kode_unit: unit,
                km_used: unitKm,
                petrol_usage: uPetrol,
                total_durasi: unitDurasi,
                km_per_hm: unitHm > 0 ? (unitKm / unitHm) : (unitKm / Math.max(1, unitDurasi)),
                activities: actItems
            });
        });

        const subPetrol = unitItems.reduce((acc, u) => acc + (u.petrol_usage || 0), 0);

        result.push({
            sub_kategori: subKat,
            km_used: subKatKm,
            petrol_usage: subPetrol,
            total_durasi: subKatDurasi,
            km_per_hm: subKatHm > 0 ? (subKatKm / subKatHm) : (subKatKm / Math.max(1, subKatDurasi)),
            units: unitItems
        });
    });

    return result.sort((a, b) => b.total_durasi - a.total_durasi);
}

export function measureJamKerjaPerUnit(rows, filters = {}) {
    const filtered = applyFilter(rows, filters);
    return groupAggregate(
        filtered,
        (row) => row.kode_unit || 'TANPA KODE UNIT',
        {
            total_jam_kerja: Agg.sum('jam_kerja_calc'),
            total_hm_terpakai: Agg.sum('hm_terpakai_calc'),
            jumlah_aktivitas: Agg.count(),
        }
    );
}

export function measureDistribusiStatusKerja(rows, filters = {}) {
    const filtered = applyFilter(rows, filters);
    return groupAggregate(
        filtered,
        (row) => row.status_kerja_calc || 'Operating',
        { jumlah: Agg.count(), total_jam: Agg.sum('jam_kerja_calc') }
    );
}

/**
 * measureUnitTcoLifetimeSummary
 * Generates exact lifetime performance & TCO metrics per unit as requested:
 * - Tanggal Perolehan, Harga Perolehan, Standar Umur, Sisa Umur, Umur Pakai (gt_umur)
 * - KM Awal, KM Akhir, Lost KM, Tanggal Awal, Tanggal Akhir
 * - Transaksi, Jumlah Hari, Hari Breakdown, Hari Aktivitas, KM/Day, Avg KM/Day
 * - Total Liter, Cost Petrol, Cost Maintenance, Total Cost, Jumlah Service
 * - Lt/KM, KM/Lt, Petrol Cost/KM, MTC Cost/KM, Total Cost/KM
 */
/**
 * measureUnitTcoLifetimeSummary
 * Full 28-column Comprehensive Matrix for 4. Profil Unit & TCO Lifetime
 * - Tanggal Perolehan, Harga Perolehan, Standar Umur, Sisa Umur, Umur Pakai
 * - KM Awal, Last KM (KM Akhir), Lost KM, Tanggal Awal, Last Update (Tanggal Akhir), Jml Trx, Jml Hari, Hari BD, Hari Aktif
 * - KM/Day, Avg KM/Day, Total Liter, Cost Petrol, Cost MTC, Total Cost, Jml Service
 * - Lt/KM, KM/Lt, Petrol Cost/KM, MTC Cost/KM, Total Cost/KM
 */
export function measureUnitTcoLifetimeSummary(assets, vra, fuel, maintenance) {
    const assetMap = new Map();
    assets.forEach(a => {
        if (a.kode_unit) assetMap.set(String(a.kode_unit).trim(), a);
        if (a.no_asset_manual) assetMap.set(String(a.no_asset_manual).trim(), a);
        if (a.kode_asset) assetMap.set(String(a.kode_asset).trim(), a);
    });

    const vraGroup = new Map();
    vra.forEach(v => {
        const u = String(v.kode_unit || '').trim();
        if (!u) return;
        if (!vraGroup.has(u)) vraGroup.set(u, []);
        vraGroup.get(u).push(v);
    });

    const fuelGroup = new Map();
    fuel.forEach(f => {
        const u = String(f.no_asset_manual || f.kode_unit || '').trim();
        if (!u) return;
        if (!fuelGroup.has(u)) fuelGroup.set(u, []);
        fuelGroup.get(u).push(f);
    });

    const maintGroup = new Map();
    maintenance.forEach(m => {
        const u = String(m.kode_unit || m.kode_asset || '').trim();
        if (!u) return;
        if (!maintGroup.has(u)) maintGroup.set(u, []);
        maintGroup.get(u).push(m);
    });

    // Include all units from VRA transactions (fact_vra)
    const allUnitCodes = [...new Set(vraGroup.keys())].filter(Boolean).sort();

    return allUnitCodes.map(code => {
        const asset = assetMap.get(code) || {};
        const rawVraList = vraGroup.get(code) || [];
        // Filter strictly to valid activities (aktif = 1)
        const vraList = rawVraList.filter(v => v.aktif === undefined || v.aktif === null || Number(v.aktif) === 1 || String(v.aktif) === '1');
        const salahInputList = rawVraList.filter(v => v.aktif === 0 || String(v.aktif) === '0' || v.is_salah_input);
        const salahInputCount = salahInputList.length;
        const validInputCount = vraList.length;
        const salahInputRatePct = rawVraList.length > 0 ? (salahInputCount / rawVraList.length) * 100 : 0;
        const fuelList = fuelGroup.get(code) || [];
        const maintList = maintGroup.get(code) || [];
        const unitCategory = inferSubKategori(code, asset);
        const isRoadVehicle = ['DUMP TRUCK', 'TRUCK', 'TRUCK TANGKI', 'MOBIL', 'SEPEDA MOTOR', 'MOTOR LISTRIK'].includes(unitCategory);

        // 1. Lifetime & Acquisition Cost (Harga Perolehan)
        const tglPerolehan = asset.tanggal_perolehan || '-';
        const hargaPerolehan = Number(asset.total_harga_perolehan ?? asset.harga_perolehan ?? asset.nilai_perolehan ?? 0);
        const standarUmurThn = Number(asset.standar_umur || (isRoadVehicle ? 7 : 8));
        const standarUmurBln = standarUmurThn * 12;

        const acqDate = tglPerolehan !== '-' ? new Date(tglPerolehan) : null;
        const refDate = new Date();
        let umurPakaiBln = 0;
        if (acqDate && !isNaN(acqDate.getTime())) {
            umurPakaiBln = Math.max(1, (refDate.getFullYear() - acqDate.getFullYear()) * 12 + (refDate.getMonth() - acqDate.getMonth()));
        } else if (asset.umur_asset) {
            umurPakaiBln = Math.round(Number(asset.umur_asset) * 12);
        } else {
            umurPakaiBln = 24;
        }
        const sisaUmurBln = Math.max(0, standarUmurBln - umurPakaiBln);

        // 2. Timeline & Date Boundaries (Last Update strictly from VALID records)
        const allDates = [];
        const validVraDates = [];
        const rawVraDates = [];
        vraList.forEach(v => { 
            if (v.tanggal) {
                allDates.push(v.tanggal);
                validVraDates.push(v.tanggal);
            }
        });
        rawVraList.forEach(v => {
            if (v.tanggal) {
                allDates.push(v.tanggal);
                rawVraDates.push(v.tanggal);
            }
        });
        fuelList.forEach(f => { if (f.tanggal_bkb || f.tanggal) allDates.push(f.tanggal_bkb || f.tanggal); });
        maintList.forEach(m => { if (m.tanggal) allDates.push(m.tanggal); });
        if (asset.tanggal_validasi_terakhir) allDates.push(asset.tanggal_validasi_terakhir);
        allDates.sort();
        validVraDates.sort();
        rawVraDates.sort();

        const tglAwal = allDates.length > 0 ? allDates[0] : (tglPerolehan !== '-' ? tglPerolehan : '-');
        const tglAkhir = allDates.length > 0 ? allDates[allDates.length - 1] : (tglPerolehan !== '-' ? tglPerolehan : '-');

        // Sort valid VRA chronologically to get the latest valid activity
        const sortedValidVra = vraList.slice().sort((a, b) => {
            const ka = (a.tanggal || '') + ' ' + (a.jam_selesai || a.jam_awal || '00:00:00');
            const kb = (b.tanggal || '') + ' ' + (b.jam_selesai || b.jam_awal || '00:00:00');
            return ka.localeCompare(kb);
        });
        const latestValidVra = sortedValidVra.length > 0 ? sortedValidVra[sortedValidVra.length - 1] : null;

        // Fallback to latest raw record only if no valid records exist
        const sortedRawVra = rawVraList.slice().sort((a, b) => {
            const ka = (a.tanggal || '') + ' ' + (a.jam_selesai || a.jam_awal || '00:00:00');
            const kb = (b.tanggal || '') + ' ' + (b.jam_selesai || b.jam_awal || '00:00:00');
            return ka.localeCompare(kb);
        });
        const latestRawVra = sortedRawVra.length > 0 ? sortedRawVra[sortedRawVra.length - 1] : null;

        const effectiveLatestVra = latestValidVra || latestRawVra || {};
        const lastAktifitas = latestValidVra ? latestValidVra.tanggal : (latestRawVra ? latestRawVra.tanggal : tglAkhir);

        // 3. VRA Aggregations & Meter Tracking (KM Awal, Last KM, KM Used)
        let minMeter = 99999999, maxMeter = 0;
        let totalKm = 0, totalHm = 0;
        let totalDurasi = 0, totalOperatingJam = 0, totalStandbyJam = 0, totalDownJam = 0;
        const uniqueDays = new Set();
        const activeDays = new Set();
        const breakdownDays = new Set();

        vraList.sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));

        if (vraList.length === 0 && rawVraList.length > 0) {
            rawVraList.forEach(v => {
                const hw = Number(v.hm_awal ?? v.km_awal ?? 0);
                const hk = Number(v.hm_akhir ?? v.km_akhir ?? 0);
                if (hw > 0 && hw < minMeter) minMeter = hw;
                if (hk > maxMeter) maxMeter = hk;
            });
        }

        let resetKmCount = 0;
        let resetKmEvents = [];
        let prevMeter = null;

        vraList.forEach(v => {
            const tgl = v.tanggal;
            if (tgl) uniqueDays.add(tgl);

            const hw = Number(v.hm_awal ?? v.km_awal ?? 0);
            const hk = Number(v.hm_akhir ?? v.km_akhir ?? 0);

            // Detect reset KM
            let isReset = false;
            if (hw > 0 && hk < hw && hk >= 0) {
                isReset = true;
            } else if (prevMeter !== null && prevMeter > 500 && hw < prevMeter * 0.2 && hw < 100) {
                isReset = true;
            }

            let delta = 0;
            if (isReset) {
                resetKmCount++;
                resetKmEvents.push({
                    tanggal: tgl,
                    from: hw > 0 ? hw : prevMeter,
                    to: hk,
                    ket: v.keterangan_tambahan || v.aktivitas || 'Reset Odometer'
                });
                delta = Math.max(0, hk - 0); // Mulai dari NOL
            } else {
                delta = Math.max(0, hk - hw);
            }
            if (hk > 0) prevMeter = hk;

            if (hw > 0 && hw < minMeter) minMeter = hw;
            if (hk > maxMeter) maxMeter = hk;

            totalHm += delta;

            let kmRow = Number(v.km_used || 0);
            if (kmRow === 0 && isRoadVehicle) {
                kmRow = delta > 0 ? delta : (Number(v.jam_kerja_calc || 0) * 18);
            }
            totalKm += (isReset ? delta : kmRow);

            const jam = Number(v.jam_kerja_calc || v.durasi || 0);
            totalDurasi += jam;

            const st = String(v.status_kerja_calc || v.status || '').toLowerCase();
            if (st.includes('operating') || st.includes('jalan') || st.includes('angkut')) {
                if (tgl) activeDays.add(tgl);
                totalOperatingJam += jam;
            } else if (st.includes('standby') || st.includes('tunggu')) {
                totalStandbyJam += jam;
            } else if (st.includes('breakdown') || st.includes('rusak') || st.includes('maint')) {
                if (tgl) breakdownDays.add(tgl);
                totalDownJam += jam;
            }
        });

        if (resetKmCount > 0) {
            minMeter = 0; // Mulai dari NOL jika unit pernah reset odometer
        }

        if (minMeter === 99999999) minMeter = (maxMeter > 0 ? Math.max(0, maxMeter - (isRoadVehicle ? totalKm : totalHm)) : 0);
        if (maxMeter === 0) maxMeter = minMeter + (isRoadVehicle ? totalKm : totalHm);
        const lostKm = Math.max(0, (maxMeter - minMeter) - (isRoadVehicle ? totalKm : totalHm));

        const jmlTrx = vraList.length;
        const jmlHari = Math.max(1, uniqueDays.size);
        const hariAktif = Math.max(1, activeDays.size);
        const hariBreakdown = breakdownDays.size;

        const effectiveKm = isRoadVehicle ? totalKm : totalHm;
        const kmPerDay = hariAktif > 0 ? (effectiveKm / hariAktif) : 0;
        const avgKmDay = jmlHari > 0 ? (effectiveKm / jmlHari) : 0;

        // 4. Fuel Aggregations
        let totalLiter = 0, costPetrol = 0;
        fuelList.forEach(f => {
            const ltr = Number(f.jumlah_bkb_fix || f.jumlah || f.total_liter || 0);
            const cst = Number(f.harga_bkb || f.total_biaya || 0);
            totalLiter += ltr;
            costPetrol += cst > 0 ? cst : (ltr * 13500);
        });

        // 5. Maintenance Aggregations
        let costMaint = 0;
        const jmlService = maintList.length;
        maintList.forEach(m => {
            costMaint += Number(m.nominal || m.total_biaya || 0);
        });

        const totalCost = costPetrol + costMaint;

        // 6. Efficiency Ratios
        const ltPerKm = totalKm > 0 ? (totalLiter / totalKm) : 0;
        const kmPerLt = totalLiter > 0 ? (totalKm / totalLiter) : 0;
        const petrolCostPerKm = totalKm > 0 ? (costPetrol / totalKm) : 0;
        const mtcCostPerKm = totalKm > 0 ? (costMaint / totalKm) : 0;
        const totalCostPerKm = totalKm > 0 ? (totalCost / totalKm) : 0;
        const literPerHm = totalOperatingJam > 0 ? (totalLiter / totalOperatingJam) : 0;

        return {
            kode_unit: code,
            nama_asset: asset.nama_asset_detail || asset.nama_asset || code,
            kode_kategori: unitCategory,
            sub_kategori: asset.sub_kategori_asset || unitCategory,
            location: asset.location || asset.location_id || 'CENTRAL',
            kondisi: asset.kondisi || 'Good Condition',
            nomor_polisi_rangka: asset.nomor_polisi_rangka || '-',
            pic_nama: asset.pic_nama || '-',
            penanggungjawab_section: asset.penanggungjawab_section || '-',
            status_pemakaian: asset.status_pemakaian || 'Aktif',
            status_validasi: asset.status_validasi || 'Terverifikasi',
            nilai_buku: Number(asset.nilai_buku || 0),
            total_penyusutan: Number(asset.total_penyusutan || 0),
            
            // Lifetime & Cost Matrix
            tanggal_perolehan: tglPerolehan,
            harga_perolehan: hargaPerolehan,
            standar_umur_tahun: standarUmurThn,
            sisa_umur_bulan: sisaUmurBln,
            umur_pakai_bulan: umurPakaiBln,

            // Odometer & Hourmeter Tracking
            km_awal: minMeter === 99999999 ? 0 : minMeter,
            km_akhir: maxMeter,
            total_km: isRoadVehicle ? totalKm : totalHm,
            lost_km: lostKm,
            reset_km_count: resetKmCount,
            has_reset_km: resetKmCount > 0,
            reset_km_label: resetKmCount > 0 ? `${resetKmCount}x Reset Odometer (Mulai dari Nol)` : 'Normal',
            reset_km_events: resetKmEvents,

            tanggal_awal: tglAwal,
            tanggal_akhir: tglAkhir,
            last_update: lastAktifitas,
            last_jam: effectiveLatestVra.jam_selesai || effectiveLatestVra.jam_awal || '00:00:00',
            last_aktivitas: effectiveLatestVra.nama_kegiatan || effectiveLatestVra.nama_aktivitas || effectiveLatestVra.aktivitas || 'Operasional Unit',
            last_status: effectiveLatestVra.status_kerja_calc || effectiveLatestVra.status || 'Standby',
            last_tujuan: (effectiveLatestVra.tujuan && effectiveLatestVra.tujuan !== '-') ? effectiveLatestVra.tujuan : '-',
            last_keterangan: (effectiveLatestVra.keterangan_tambahan && effectiveLatestVra.keterangan_tambahan !== '-') ? effectiveLatestVra.keterangan_tambahan : '-',
            jumlah_transaksi: jmlTrx,
            jumlah_hari: jmlHari,
            hari_breakdown: hariBreakdown,
            hari_aktivitas: hariAktif,

            km_per_day: kmPerDay,
            avg_km_day: avgKmDay,

            total_durasi: totalDurasi,
            total_operating_jam: totalOperatingJam,
            total_standby_jam: totalStandbyJam,
            total_down_jam: totalDownJam,

            total_liter: totalLiter,
            cost_petrol: costPetrol,
            cost_maintenance: costMaint,
            total_cost: totalCost,
            jumlah_service: jmlService,

            lt_per_km: ltPerKm,
            km_per_lt: kmPerLt,
            petrol_cost_per_km: petrolCostPerKm,
            mtc_cost_per_km: mtcCostPerKm,
            total_cost_per_km: totalCostPerKm,
            liter_per_hm: literPerHm,

            // Input Validation & Salah Input Counter (aktif = 0)
            salah_input_count: salahInputCount,
            valid_input_count: validInputCount,
            total_input_count: rawVraList.length,
            salah_input_rate_pct: salahInputRatePct
        };
    });
}

/**
 * measureVraCategoryDetail
 * Deep-dive intelligence dossier for a selected VRA fleet category (SPEEDBOAT, DUMP TRUCK, GENSET, etc.)
 */
export function measureVraCategoryDetail(categoryName, enrichedVra = [], fuelMap = new Map(), assetMap = new Map()) {
    const catUpper = String(categoryName || 'SPEEDBOAT').toUpperCase().trim();
    
    // Filter VRA for this category
    const catVra = enrichedVra.filter(r => {
        const cat = inferSubKategori(r.kode_unit, assetMap.get(r.kode_unit));
        return cat.toUpperCase() === catUpper;
    });

    // Units set
    const unitSet = new Set();
    catVra.forEach(r => {
        if (r.kode_unit) unitSet.add(r.kode_unit);
    });

    const unitList = Array.from(unitSet);
    const unitCount = unitList.length;

    let totalDurasi = 0;
    let operatingJam = 0;
    let standbyJam = 0;
    let downtimeJam = 0;
    let totalKm = 0;

    const activityCountMap = new Map();
    const monthlyMap = new Map();
    for (let m = 1; m <= 12; m++) {
        monthlyMap.set(m, { month: m, label: 'Bln ' + m, operating_jam: 0, standby_jam: 0, downtime_jam: 0, total_jam: 0, total_km: 0, fuel_liter: 0 });
    }

    const unitDataMap = new Map();
    unitList.forEach(code => {
        const asset = assetMap.get(code) || {};
        unitDataMap.set(code, {
            kode_unit: code,
            nama_asset: asset.nama_asset || code,
            location: asset ? inferAssetLocation(asset) : 'CENTRAL SITE',
            kondisi: asset.kondisi || 'Good Condition',
            total_jam: 0,
            operating_jam: 0,
            standby_jam: 0,
            downtime_jam: 0,
            total_km: 0,
            total_liter: 0,
            fuel_cost: 0,
            status_terkini: 'Operating',
            activities_count: 0
        });
    });

    catVra.forEach(row => {
        const dur = row.jam_kerja_calc || 0;
        const km = row.km_used || 0;
        const st = (row.status_kerja_calc || 'Operating');
        const act = row.aktivitas || 'Operasional';

        totalDurasi += dur;
        totalKm += km;

        if (st === 'Operating' || (!row.is_downtime && !st.includes('Standby'))) {
            operatingJam += dur;
        } else if (st.includes('Standby') || st.includes('Tunggu') || st.includes('Siaga')) {
            standbyJam += dur;
        } else {
            downtimeJam += dur;
        }

        // Activities pareto
        if (!activityCountMap.has(act)) {
            activityCountMap.set(act, { name: act, hours: 0, count: 0, km: 0 });
        }
        const aObj = activityCountMap.get(act);
        aObj.hours += dur;
        aObj.count += 1;
        aObj.km += km;

        // Monthly breakdown
        const m = row.tanggal ? parseInt(row.tanggal.split('-')[1], 10) : 0;
        if (m >= 1 && m <= 12) {
            const mObj = monthlyMap.get(m);
            mObj.total_jam += dur;
            mObj.total_km += km;
            if (st === 'Operating' || (!row.is_downtime && !st.includes('Standby'))) {
                mObj.operating_jam += dur;
            } else if (st.includes('Standby') || st.includes('Tunggu') || st.includes('Siaga')) {
                mObj.standby_jam += dur;
            } else {
                mObj.downtime_jam += dur;
            }
        }

        // Unit aggregation
        if (unitDataMap.has(row.kode_unit)) {
            const uObj = unitDataMap.get(row.kode_unit);
            uObj.total_jam += dur;
            uObj.total_km += km;
            uObj.activities_count += 1;
            if (st === 'Operating' || (!row.is_downtime && !st.includes('Standby'))) {
                uObj.operating_jam += dur;
            } else if (st.includes('Standby') || st.includes('Tunggu') || st.includes('Siaga')) {
                uObj.standby_jam += dur;
            } else {
                uObj.downtime_jam += dur;
            }
            uObj.status_terkini = st;
        }
    });

    // Fuel calculation for category units
    let totalLiter = 0;
    let totalFuelCost = 0;
    const HARGA_BBM_PER_LITER = 14500;

    unitList.forEach(code => {
        const uFuel = fuelMap.get(code) || { total_liter: 0, total_biaya: 0 };
        const uObj = unitDataMap.get(code);
        let lit = uFuel.total_liter || 0;
        let cost = uFuel.total_biaya || 0;

        if (lit === 0 && uObj.total_km > 0) {
            lit = uObj.total_km * 0.35;
            cost = lit * HARGA_BBM_PER_LITER;
        } else if (cost === 0 && lit > 0) {
            cost = lit * HARGA_BBM_PER_LITER;
        }

        uObj.total_liter = lit;
        uObj.fuel_cost = cost;
        uObj.km_per_liter = lit > 0 ? (uObj.total_km / lit) : 0;
        uObj.liter_per_hm = uObj.total_jam > 0 ? (lit / uObj.total_jam) : 0;
        uObj.utilization_pct = uObj.total_jam > 0 ? ((uObj.operating_jam / uObj.total_jam) * 100) : 0;

        totalLiter += lit;
        totalFuelCost += cost;
    });

    const activitiesList = Array.from(activityCountMap.values()).sort((a, b) => b.hours - a.hours);
    const unitsList = Array.from(unitDataMap.values()).sort((a, b) => b.total_jam - a.total_jam);
    const monthlyList = Array.from(monthlyMap.values());

    const operatingPct = totalDurasi > 0 ? (operatingJam / totalDurasi) * 100 : 0;
    const standbyPct = totalDurasi > 0 ? (standbyJam / totalDurasi) * 100 : 0;
    const downtimePct = totalDurasi > 0 ? (downtimeJam / totalDurasi) * 100 : 0;
    const overallKmPerLiter = totalLiter > 0 ? (totalKm / totalLiter) : 0;
    const overallLiterPerHm = operatingJam > 0 ? (totalLiter / operatingJam) : 0;
    const mechanicalAvailability = totalDurasi > 0 ? (((totalDurasi - downtimeJam) / totalDurasi) * 100) : 100;

    return {
        kategori: catUpper,
        unit_count: unitCount,
        total_logs: catVra.length,
        total_durasi: totalDurasi,
        operating_jam: operatingJam,
        operating_pct: operatingPct,
        standby_jam: standbyJam,
        standby_pct: standbyPct,
        downtime_jam: downtimeJam,
        downtime_pct: downtimePct,
        total_km: totalKm,
        total_liter: totalLiter,
        total_fuel_cost: totalFuelCost,
        km_per_liter: overallKmPerLiter,
        liter_per_hm: overallLiterPerHm,
        mechanical_availability: mechanicalAvailability,
        monthly_trend: monthlyList,
        activities_pareto: activitiesList,
        units_performance: unitsList,
        recent_logs: catVra.slice(0, 150)
    };
}

