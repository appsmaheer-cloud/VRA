/**
 * pbi_main.js - PNS Enterprise Power BI Dashboard Engine
 * Clean Rebuild with Robust Event Routing & DAX Analytics
 */

import { 
    enrichAssets, 
    measureAssetSummary, 
    measureAssetByKategori, 
    measureAssetByKondisi, 
    measureAssetByLifetime,
    measureAssetValidationReport,
    measureAssetByOfficeLocations,
    measureAssetByKelompok,
    measureAssetByDepartmentHierarchy,
    measureAssetOverviewKPIs,
    measureOverviewAssetBy,
    measurePerformanceAssetBy,
    measureAssetCompositionType,
    measureAssetConditionBars,
    measureAssetDetailSpec,
    measureOfficeDetail,
    measureAssetDrillthrough,
    measureAssetByLocationCategory,
    inferAssetLocation,
    calculateDynamicDepreciation,
    inferBuildingStatus,
    measureAssetEnvironmentReport,
    measureAssetDepreciationSchedule,
    calculateMonthlyDepreciationReport
} from './asset-measures.js?v=3';
import { 
    enrichVraRows, 
    measureVraPerformance, 
    measureVraMonthlyRunningDowntime, 
    measureVraHierarchicalActivity, 
    measureJamKerjaPerUnit, 
    measureUnitTcoLifetimeSummary, 
    inferSubKategori,
    measureVraCategoryDetail 
} from './vra-measures.js?v=3';
import { enrichMaintenance, measureMaintenanceSummary, measureBiayaPerKategori, measureBiayaPerKategoriMaterial, measureBiayaPerSubKategoriMaterial, measureBiayaPerJenisServices, measureBiayaPerUnit, measureBiayaPerSection, measureTrendBulanan, measureTrendHierarchical, measureMaintenanceMaterialDetail, measureMaintenanceServiceBreakdown, measureMaintenanceFrequencyReport, measureServiceSimulation } from './maintenance-measures.js?v=3';
import { measureBbmPerUnit, measureRasioKonsumsiBbm, measureFuelDetailLog, measureFuelAnomalyAudit, measureFuelBenchmarkingReport, measureVraFuelComparison } from './fuel-measures.js?v=3';
import { 
    renderSvgSparkline, 
    renderSvgGauge, 
    createDeltaPillHtml, 
    renderSvgInteractiveStatusCards,
    renderSvgRadarChart,
    renderSvgDonut,
    renderSvgCalendarHeatmap,
    renderSvgMiniDonutGroup
} from './pbi_svg_cards.js?v=3';

// Global Data Store
export const pbiData = {
    assets: [],
    vra: [],
    fuel: [],
    maintenance: [],
    assetMap: new Map(),
    vraUnitSet: new Set(),
    vraUnitNormSet: new Set(),
    isLoaded: false,
    cache: null
};
window.pbiData = pbiData;

export function updateVraUnitSets() {
    pbiData.vraUnitSet = new Set();
    pbiData.vraUnitNormSet = new Set();
    (pbiData.vra || []).forEach(v => {
        const u = String(v.kode_unit || v.no_asset_manual || '').trim();
        if (u) {
            pbiData.vraUnitSet.add(u);
            pbiData.vraUnitNormSet.add(u.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
        }
    });
}

export function isVraInlineUnit(unitCode) {
    if (!unitCode) return false;
    const u = String(unitCode).trim();
    if (!pbiData.vraUnitSet || pbiData.vraUnitSet.size === 0) updateVraUnitSets();
    if (pbiData.vraUnitSet.has(u)) return true;
    const norm = u.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return Boolean(pbiData.vraUnitNormSet && pbiData.vraUnitNormSet.has(norm));
}


export const ALL_FLEET_TYPES = [
    'DUMP TRUCK', 'GENSET', 'POTONG RUMPUT', 'MOBIL', 
    'POMPA AIR', 'SEPEDA MOTOR', 'MOTOR LISTRIK', 'SPEEDBOAT', 
    'TRUCK', 'TANGKI', 'TUGBOAT'
];

// Active State
let activeViewId = 'view-dashboard';
let renderedViews = {};
let currentVraSubId = 'view-vra-1';
let currentSelectedCategory = 'SPEEDBOAT';
let catLogSearchQuery = '';
let selectedTypes = new Set(ALL_FLEET_TYPES);
let selectedUnit = 'ALL';
let currentAssetDim = 'location';
let currentAssetEnvFilter = 'ALL'; // 'ALL' | 'IN_BUILDING' | 'OUTDOOR'
let currentMaintDim = 'kategori';
const chartInstances = {};


// Helper formatting functions
export const formatNum = (v, dec = 0) => {
    const n = Number(v) || 0;
    return n.toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

export const formatRp = (v) => {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)} M`;
    if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(2)} Jt`;
    return `Rp ${n.toLocaleString('id-ID')}`;
};

export const formatPct = (v) => `${(Number(v) || 0).toFixed(2)}%`;

export const formatK = (v) => {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toFixed(1);
};

export const formatCompactNum = (v) => {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return Math.round(n).toString();
};

export const formatCompactRp = (v) => {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
    if (Math.abs(n) >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}Rb`;
    return `Rp ${Math.round(n)}`;
};

export const formatDatePbi = (dateStr) => {
    if (!dateStr || dateStr === '-') return '-';
    const str = String(dateStr).trim();
    if (str.includes('/')) return str;
    const parts = str.split('-');
    if (parts.length === 3) {
        const year = parts[0];
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        if (!isNaN(month) && !isNaN(day) && year.length === 4) {
            return `${month}/${day}/${year}`;
        }
    }
    return str;
};

export function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = String(text ?? '-');
}

export function setElHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = String(html ?? '-');
}

export function classifyUnitType(unitCode = '', asset = null) {
    return inferSubKategori(unitCode, asset);
}

// Chart Render Helper
export function renderApex(selector, options) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el || typeof ApexCharts === 'undefined') return null;

    const chartId = typeof selector === 'string' ? selector : (el.id || Math.random().toString());
    const isDark = document.documentElement.classList.contains('dark');

    const baseConfig = {
        chart: {
            fontFamily: '"Inter", "Segoe UI", -apple-system, sans-serif',
            toolbar: { show: false },
            parentHeightOffset: 0,
            background: 'transparent',
            animations: { enabled: true, speed: 200 }
        },
        theme: { mode: isDark ? 'dark' : 'light' },
        grid: {
            borderColor: isDark ? '#334155' : '#f1f5f9',
            strokeDashArray: 3,
            padding: { top: 4, bottom: 4, left: 8, right: 8 }
        },
        dataLabels: {
            style: { fontSize: '11px', fontWeight: 600, fontFamily: '"Inter", sans-serif' }
        },
        legend: {
            fontSize: '11px',
            fontFamily: '"Inter", sans-serif',
            fontWeight: 600,
            labels: { colors: isDark ? '#cbd5e1' : '#475569' }
        },
        xaxis: {
            labels: {
                style: { fontSize: '11px', fontFamily: '"Inter", sans-serif', colors: isDark ? '#94a3b8' : '#64748b' }
            }
        },
        yaxis: {
            labels: {
                style: { fontSize: '11px', fontFamily: '"Inter", sans-serif', colors: isDark ? '#94a3b8' : '#64748b' }
            }
        },
        tooltip: {
            theme: isDark ? 'dark' : 'light',
            style: { fontSize: '12px', fontFamily: '"Inter", sans-serif' }
        }
    };

    const merged = { ...baseConfig, ...options };
    merged.chart = { ...baseConfig.chart, ...options.chart };
    if (options.grid) merged.grid = { ...baseConfig.grid, ...options.grid };

    if (chartInstances[chartId]) {
        try {
            chartInstances[chartId].updateOptions(merged, true, false);
            return chartInstances[chartId];
        } catch (e) {
            try { chartInstances[chartId].destroy(); } catch (err) {}
            delete chartInstances[chartId];
        }
    }

    try {
        const chart = new ApexCharts(el, merged);
        chart.render();
        chartInstances[chartId] = chart;
        return chart;
    } catch (err) {
        console.warn(`ApexCharts error on ${chartId}:`, err);
        return null;
    }
}

export function refreshAllCharts() {
    window.dispatchEvent(new Event('resize'));
}

// API Loader with GitHub Pages & Google Apps Script Live Fallback
async function loadApiData(type, endpoint) {
    const isStaticHost = window.location.hostname.includes('github.io') || 
                         window.location.protocol === 'file:' || 
                         (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1'));
    const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycby1NCzSID7xuPB9AwIdFfPJ5pXPtlbW0SJIA5r29wmYkRMDv-8C5gdDyA5UBwuvsezWtA/exec";
    const customGasUrl = DEFAULT_GAS_URL || localStorage.getItem('pns_gas_endpoint_url');

    // 1. Prioritize Google Apps Script Web App for Live VRA if configured
    if (type === 'vra' && customGasUrl) {
        try {
            const gasTarget = `${customGasUrl}${customGasUrl.includes('?') ? '&' : '?'}format=json&type=vra`;
            console.log(`[PNS DATA LOADER] Menghubungi Google Apps Script API: ${gasTarget}`);
            const res = await fetch(gasTarget);
            if (res.ok) {
                const json = await res.json();
                if (json.data && Array.isArray(json.data)) {
                    pbiData.vraMeta = {
                        last_sync: json.timestamp || new Date().toISOString(),
                        cache_age: 0,
                        is_stale: false,
                        distinct_units: new Set(json.data.map(r => r.kode_unit)).size
                    };
                    const statusEl = document.getElementById('top-bar-api-status');
                    if (statusEl) statusEl.innerHTML = `<span class="text-sky-600 dark:text-sky-400 font-extrabold">Google Sheets Live (${json.data.length.toLocaleString('id-ID')} baris)</span>`;
                    return json.data;
                }
            }
        } catch (gasErr) {
            console.warn(`[PNS DATA LOADER] Gagal menghubungi Google Apps Script (${gasErr.message}). Beralih ke cache...`);
        }
    }

    // 2. Direct static cache for GitHub Pages if endpoint points to PHP backend
    if (isStaticHost && endpoint.endsWith('.php')) {
        const fallbackMap = {
            'vra': './cache/vra_live_cache.json',
            'fuel': './cache/fuel_cache.json',
            'assets': './cache/asset_cache.json',
            'maintenance': './cache/maint_vra_cache.json'
        };
        const fbUrl = fallbackMap[type];
        if (fbUrl) {
            try {
                const fbRes = await fetch(fbUrl);
                if (fbRes.ok) {
                    const fbJson = await fbRes.json();
                    if (type === 'vra') {
                        pbiData.vraMeta = {
                            last_sync: fbJson.last_sync || 'GitHub Static Cloud Cache',
                            cache_age: 0,
                            is_stale: false,
                            distinct_units: fbJson.distinct_units || (fbJson.data ? new Set(fbJson.data.map(r => r.kode_unit)).size : 0)
                        };
                    }
                    if (fbJson.success && fbJson.data) return fbJson.data;
                    if (fbJson.status === 'success' && fbJson.data) return fbJson.data;
                    if (Array.isArray(fbJson)) return fbJson;
                    if (fbJson.data && Array.isArray(fbJson.data)) return fbJson.data;
                }
            } catch (fbErr) {
                console.error(`[PNS DATA LOADER] Gagal memuat static cache untuk ${type}:`, fbErr);
            }
        }
    }

    // 3. Regular HTTP fetch for Localhost PHP environment
    try {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.trim().startsWith('<?php')) {
            throw new Error('Raw PHP returned (Static Host)');
        }
        const json = JSON.parse(text);
        if (type === 'vra') {
            pbiData.vraMeta = {
                last_sync: json.last_sync || '',
                cache_age: json.cache_age_seconds || 0,
                is_stale: Boolean(json.is_stale),
                distinct_units: json.distinct_units || 0
            };
        }
        if (json.success && json.data) return json.data;
        if (json.status === 'success' && json.data) return json.data;
        if (Array.isArray(json)) return json;
        if (json.data && Array.isArray(json.data)) return json.data;
        return [];
    } catch (e) {
        console.warn(`[PNS DATA LOADER] Endpoint ${endpoint} tidak dapat diakses (${e.message}). Beralih ke fallback static cache...`);
        const fallbackMap = {
            'vra': './cache/vra_live_cache.json',
            'fuel': './cache/fuel_cache.json',
            'assets': './cache/asset_cache.json',
            'maintenance': './cache/maint_vra_cache.json'
        };
        const fbUrl = fallbackMap[type];
        if (fbUrl) {
            try {
                const fbRes = await fetch(fbUrl);
                if (fbRes.ok) {
                    const fbJson = await fbRes.json();
                    if (type === 'vra') {
                        pbiData.vraMeta = {
                            last_sync: fbJson.last_sync || 'GitHub Static Cloud Cache',
                            cache_age: 0,
                            is_stale: false,
                            distinct_units: fbJson.distinct_units || 0
                        };
                    }
                    if (fbJson.success && fbJson.data) return fbJson.data;
                    if (fbJson.status === 'success' && fbJson.data) return fbJson.data;
                    if (Array.isArray(fbJson)) return fbJson;
                    if (fbJson.data && Array.isArray(fbJson.data)) return fbJson.data;
                }
            } catch (fbErr) {
                console.error(`[PNS DATA LOADER] Gagal memuat fallback static cache untuk ${type}:`, fbErr);
            }
        }
        return [];
    }
}

// App Initializer
export async function initializePbiApp() {
    const loader = document.getElementById('pbi-loader');
    const syncIndicator = document.getElementById('pbi-sync-indicator');
    
    if (loader) {
        loader.classList.remove('hidden-loader');
        loader.style.display = 'block';
    }
    if (syncIndicator) {
        syncIndicator.classList.remove('hidden');
        syncIndicator.classList.add('flex');
    }

    try {
        console.log("%c[PNS ENTERPRISE] Memulai pemuatan data analitik via AJAX...", "color: #0284c7; font-weight: bold; font-size: 12px;");
        const [rawAssets, rawVra, rawFuel, rawMaint] = await Promise.all([
            loadApiData('assets', '../pns_asset/api/asset/index.php'),
            loadApiData('vra', './api/vra/index.php'),
            loadApiData('fuel', './api/fuel/index.php'),
            loadApiData('maintenance', './api/maintenance/index.php').then(res => (res && res.length > 0) ? res : loadApiData('maintenance', '../pns_asset/api/maintenance/index.php'))
        ]);

        pbiData.assets = enrichAssets(rawAssets || []);
        pbiData.assetMap = new Map();
        pbiData.assets.forEach(a => {
            if (a.kode_unit) {
                const u = String(a.kode_unit).trim();
                pbiData.assetMap.set(u, a);
                pbiData.assetMap.set(u.replace(/[-_ ]/g, '').toUpperCase(), a);
            }
            if (a.no_asset_manual) {
                const u = String(a.no_asset_manual).trim();
                pbiData.assetMap.set(u, a);
            }
            if (a.kode_asset) {
                const u = String(a.kode_asset).trim();
                pbiData.assetMap.set(u, a);
            }
        });

        pbiData.vra = enrichVraRows(rawVra || [], pbiData.assetMap);
        pbiData.fuel = rawFuel || [];
        updateVraUnitSets();

        // Enforce strict VRA-only inline maintenance: strip out non-VRA assets (buildings, helipads, roofs, mess, infrastructure)
        const cleanMaint = (rawMaint || []).filter(m => {
            const u = String(m.kode_unit || m['KODE UNIT'] || m.no_asset_manual || m.kode_asset || '').trim();
            return isVraInlineUnit(u);
        });

        pbiData.maintenance = enrichMaintenance(cleanMaint);
        pbiData.isLoaded = true;

        console.log(`%c[PNS ENTERPRISE] Data Berhasil Dimuat (VRA Scoped):
 - Assets: ${pbiData.assets.length.toLocaleString('id-ID')} unit
 - VRA Activity: ${pbiData.vra.length.toLocaleString('id-ID')} rekaman (${pbiData.vraUnitSet.size} unit aktif)
 - BBM (Fuel): ${pbiData.fuel.length.toLocaleString('id-ID')} transaksi
 - Maintenance (Inline VRA): ${pbiData.maintenance.length.toLocaleString('id-ID')} servis`, "color: #10b981; font-weight: bold;");

        const urlParams = new URLSearchParams(window.location.search);
        const paramView = urlParams.get('view');
        const paramCat = urlParams.get('cat');
        const paramUnit = urlParams.get('unit');

        if (paramCat) {
            currentSelectedCategory = paramCat.toUpperCase();
        }
        if (paramUnit) {
            selectedUnit = paramUnit;
        }
        if (paramView === 'vra-category-detail' || paramView === 'view-vra-category-detail') {
            activeViewId = 'view-vra-category-detail';
        } else if (paramView) {
            activeViewId = paramView.startsWith('view-') ? paramView : 'view-' + paramView;
        }

        setupSlicers();
        setupNavigationListeners();
        initUniversalTableSorter();
        applyPbiFilters();
        switchView(activeViewId);
        reloadBuildingRoomsData();

        // Setup background periodic auto-sync (every 15 minutes) & tab visibility listener
        if (!window._vraAutoRefreshInterval) {
            window._vraAutoRefreshInterval = setInterval(() => {
                console.log("[PNS ENTERPRISE] Auto-sync VRA data berkala (15 menit)...");
                syncLiveData(null, true);
            }, 15 * 60 * 1000);
        }

        if (!window._vraVisibilityListenerAttached) {
            window._vraVisibilityListenerAttached = true;
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    const elapsed = Date.now() - (window._lastVraSyncTime || 0);
                    if (elapsed > 15 * 60 * 1000) {
                        console.log("[PNS ENTERPRISE] Tab aktif kembali setelah >15m, sinkronisasi VRA berkala...");
                        syncLiveData(null, true);
                    }
                }
            });
        }


    } catch (err) {
        console.error("Error during PBI initialization:", err);
    } finally {
        if (loader) {
            loader.classList.add('hidden-loader');
            loader.style.display = 'none';
        }
        if (syncIndicator) {
            syncIndicator.classList.add('hidden');
            syncIndicator.classList.remove('flex');
        }
    }
}

function setupNavigationListeners() {
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            if (target) switchView(target);
        });
    });
    document.querySelectorAll('.btn-vra-subnav, .btn-asset-subnav').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            if (target) switchView(target);
        });
    });
}

// =============================================================
// UNIVERSAL TABLE SORTER (A to Z, Z to A, Numeric & Date)
// =============================================================
function parseUniversalCellNumber(val) {
    if (val === null || val === undefined) return null;
    val = String(val).trim();
    if (val === '' || val === '-') return 0;
    
    // Date formats (DD/MM/YYYY or YYYY-MM-DD)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) {
        const parts = val.split('/');
        return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        return new Date(val).getTime();
    }
    
    // Relative aging days (e.g. "X Hari lalu", "Hari ini", "Kemarin")
    const hariMatch = val.match(/(\d+)\s*Hari\s*lalu/i);
    if (hariMatch) return parseInt(hariMatch[1], 10);
    if (/Hari\s*ini/i.test(val)) return 0;
    if (/Kemarin/i.test(val)) return 1;

    // Clean out known non-numeric noise
    let clean = val.replace(/x\s*(err|reset)/gi, '')
                   .replace(/Rp\.?\s*/gi, '')
                   .replace(/%/g, '')
                   .replace(/\s*(KM|JAM|L|Liter|Unit)\b/gi, '')
                   .trim();
                   
    let mult = 1;
    if (/M$/i.test(clean)) {
        mult = 1000000;
        clean = clean.replace(/M$/i, '').trim();
    } else if (/Jt$/i.test(clean)) {
        mult = 1000000;
        clean = clean.replace(/Jt$/i, '').trim();
    } else if (/K$/i.test(clean)) {
        mult = 1000;
        clean = clean.replace(/K$/i, '').trim();
    }
    
    // Number format detection (Indonesian 1.234,5 vs 1,234.5)
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (/^\d+(,\d+)$/.test(clean)) {
        clean = clean.replace(',', '.');
    } else {
        clean = clean.replace(/,/g, '');
    }
    
    const n = parseFloat(clean);
    return isNaN(n) ? null : n * mult;
}

export function initUniversalTableSorter() {
    if (window._universalTableSorterInitialized) return;
    window._universalTableSorterInitialized = true;

    // Helper: style all table headers with cursor-pointer and hover
    function styleTableHeaders(root = document) {
        root.querySelectorAll('table thead th').forEach(th => {
            if (th.getAttribute('data-no-sort') === 'true' || th.textContent.trim() === '') return;
            th.classList.add('cursor-pointer', 'select-none', 'transition-colors');
            if (!th.querySelector('.sort-indicator')) {
                const indicator = document.createElement('span');
                indicator.className = 'sort-indicator ml-1 inline-block align-middle';
                indicator.innerHTML = '<i class="ph-bold ph-caret-up-down opacity-35 text-[10px]"></i>';
                th.appendChild(indicator);
            }
        });
    }

    // Run once on load and observe future tables
    styleTableHeaders();
    if (window.MutationObserver) {
        const observer = new MutationObserver(mutations => {
            let shouldStyle = false;
            for (const m of mutations) {
                if (m.addedNodes.length > 0) {
                    shouldStyle = true;
                    break;
                }
            }
            if (shouldStyle) styleTableHeaders();
        });
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    // Delegated click listener for table sorting across entire document
    document.addEventListener('click', function(e) {
        const th = e.target.closest('th');
        if (!th) return;
        const table = th.closest('table');
        if (!table) return;
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        if (!thead || !tbody || !thead.contains(th)) return;
        if (th.getAttribute('data-no-sort') === 'true') return;

        // Special handling for VRA 2 matrix table (dataset-level sort)
        if (table.id === 'table-pbi-vra2' || tbody.id === 'table-pbi-vra2-matrix') {
            const colKey = th.getAttribute('data-sort-key');
            if (colKey && window.pns && window.pns.sortVra2) {
                window.pns.sortVra2(colKey);
                return;
            }
        }

        // Generic DOM row sorter for all other tables
        const trHeader = th.parentElement;
        const colIndex = Array.from(trHeader.children).indexOf(th);
        if (colIndex < 0) return;

        const currentDir = th.getAttribute('data-sort-dir') === 'asc' ? 'desc' : 'asc';

        // Clear sort indicator on other columns in this table
        trHeader.querySelectorAll('th').forEach(header => {
            if (header !== th) {
                header.removeAttribute('data-sort-dir');
                header.classList.remove('text-cyan-600', 'dark:text-cyan-400');
                const ind = header.querySelector('.sort-indicator');
                if (ind) ind.innerHTML = '<i class="ph-bold ph-caret-up-down opacity-35 text-[10px]"></i>';
            }
        });

        th.setAttribute('data-sort-dir', currentDir);
        th.classList.add('text-cyan-600', 'dark:text-cyan-400');
        let indicator = th.querySelector('.sort-indicator');
        if (!indicator) {
            indicator = document.createElement('span');
            indicator.className = 'sort-indicator ml-1 inline-block align-middle';
            th.appendChild(indicator);
        }
        indicator.innerHTML = currentDir === 'asc'
            ? '<i class="ph-bold ph-caret-up text-cyan-600 dark:text-cyan-400 text-[11px]"></i>'
            : '<i class="ph-bold ph-caret-down text-cyan-600 dark:text-cyan-400 text-[11px]"></i>';

        const rows = Array.from(tbody.querySelectorAll('tr'));
        // Ignore single row / empty table
        if (rows.length <= 1) return;

        rows.sort((rowA, rowB) => {
            const cellA = rowA.children[colIndex];
            const cellB = rowB.children[colIndex];
            if (!cellA || !cellB) return 0;

            const valA = cellA.getAttribute('data-sort-value') !== null
                ? cellA.getAttribute('data-sort-value')
                : cellA.innerText.trim();
            const valB = cellB.getAttribute('data-sort-value') !== null
                ? cellB.getAttribute('data-sort-value')
                : cellB.innerText.trim();

            const numA = parseUniversalCellNumber(valA);
            const numB = parseUniversalCellNumber(valB);

            let res = 0;
            if (numA !== null && numB !== null) {
                res = numA - numB;
            } else {
                res = String(valA).localeCompare(String(valB), 'id', { numeric: true, sensitivity: 'base' });
            }

            return currentDir === 'asc' ? res : -res;
        });

        // Re-append sorted rows into tbody
        rows.forEach(r => tbody.appendChild(r));
    });
}

// Slicers Setup
function setupSlicers() {
    const years = new Set();
    pbiData.vra.forEach(v => { if (v.tanggal) years.add(v.tanggal.substring(0, 4)); });
    pbiData.maintenance.forEach(m => { if (m.tanggal) years.add(m.tanggal.substring(0, 4)); });
    pbiData.fuel.forEach(f => { if (f.tanggal_bkb) years.add(f.tanggal_bkb.substring(0, 4)); });

    const yearSelect = document.getElementById('slicer-year');
    if (yearSelect && years.size > 0) {
        const sorted = Array.from(years).sort().reverse();
        yearSelect.innerHTML = '<option value="ALL">Semua Tahun</option>';
        sorted.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        });
        // Default to ALL or first available year if specified
        yearSelect.value = 'ALL';
    }

    const locSelect = document.getElementById('slicer-location');
    if (locSelect) {
        const standardOffices = [
            'CENTRAL OFFICE', 'FACTORY OFFICE', 'ESTATE 1', 'ESTATE 2', 
            'ESTATE 3', 'GUDANG MARUNDA', 'HEAD OFFICE', 'REGIONAL OFFICE'
        ];
        locSelect.innerHTML = '<option value="ALL">Semua Lokasi</option>';
        standardOffices.forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc;
            opt.textContent = loc;
            locSelect.appendChild(opt);
        });
    }

    const catSelect = document.getElementById('slicer-category');
    if (catSelect) {
        const cats = [...new Set(pbiData.assets.map(a => a.kode_kategori).filter(Boolean))].sort();
        catSelect.innerHTML = '<option value="ALL">Semua Kategori</option>';
        cats.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            catSelect.appendChild(opt);
        });
    }

    setupMaintenanceSlicers();
    setupAssetSlicers();
    setupFuelSlicers();
    updateVraUnitDropdown();
    updateTopBarMonths(document.getElementById('slicer-year')?.value || 'ALL');
    adjustFiltersForView(activeViewId);
}

export function updateTopBarMonths(activeYear) {
    const monthSelect = document.getElementById('slicer-month');
    if (!monthSelect) return;
    const currentVal = monthSelect.value;

    const activeMonths = new Set();
    const checkRow = (d) => {
        if (!d) return;
        if (activeYear === 'ALL' || d.startsWith(activeYear)) {
            const parts = d.split('-');
            if (parts.length >= 2) activeMonths.add(parts[1]);
        }
    };
    (pbiData.vra || []).forEach(v => checkRow(v.tanggal));
    (pbiData.fuel || []).forEach(f => checkRow(f.tanggal_bkb || f.tanggal));
    (pbiData.maintenance || []).forEach(m => checkRow(m.tanggal));

    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    let mHtml = '<option value="ALL">Semua Bulan</option>';
    for (let i = 1; i <= 12; i++) {
        const mStr = String(i).padStart(2, '0');
        if (activeMonths.size === 0 || activeMonths.has(mStr)) {
            const isSel = (mStr === currentVal) ? 'selected' : '';
            mHtml += `<option value="${mStr}" ${isSel}>${monthNames[i - 1]}</option>`;
        }
    }
    monthSelect.innerHTML = mHtml;
    if (currentVal !== 'ALL' && !activeMonths.has(currentVal) && activeMonths.size > 0) {
        monthSelect.value = 'ALL';
    }
}

export function adjustFiltersForView(viewId = activeViewId) {
    const locBox = document.getElementById('top-slicer-location-box');
    const catBox = document.getElementById('top-slicer-category-box');
    const catSelect = document.getElementById('slicer-category');

    const isVra = viewId.startsWith('view-vra-');
    const isVra4 = (viewId === 'view-vra-4');
    const isFuel = viewId.startsWith('view-fuel');
    const isMaint = viewId.startsWith('view-maint') || viewId === 'view-maintenance';
    const isAsset = viewId.startsWith('view-asset') || viewId === 'view-report-depreciation';
    const isDashboard = (viewId === 'view-dashboard');

    // 1. Lokasi Box: Fleet, Fuel, and Maintenance are vehicle/fleet-based, not office room based
    if (locBox) {
        if (isAsset || isDashboard) {
            locBox.classList.remove('hidden');
        } else {
            locBox.classList.add('hidden');
        }
    }

    // 2. Kategori Box: Hide on view-vra-4 (Profil Unit) because it has dedicated Unit & Category controls
    if (catBox) {
        if (isVra4) {
            catBox.classList.add('hidden');
        } else {
            catBox.classList.remove('hidden');
        }
    }

    // 3. Adapt Kategori options to active view domain ("hide saja isi filter yang tidak sesuai")
    if (catSelect && pbiData.assets && pbiData.assets.length > 0) {
        const currentCat = catSelect.value;
        let validCats = [];

        if (isVra) {
            // Fleet types only
            const vraUnitCodes = new Set((pbiData.vra || []).map(v => String(v.kode_unit || '').trim()).filter(Boolean));
            const fleetCats = pbiData.assets
                .filter(a => vraUnitCodes.has(a.nomor_polisi_rangka) || vraUnitCodes.has(a.kode_asset) || vraUnitCodes.has(a.kode_unit))
                .map(a => a.kode_kategori)
                .filter(Boolean);
            validCats = [...new Set([...ALL_FLEET_TYPES, ...fleetCats])].sort();
        } else if (isFuel) {
            // Fuel-consuming vehicles/equipment only
            const fuelUnitCodes = new Set((pbiData.fuel || []).map(f => String(f.no_asset_manual || f.kode_unit || '').trim()).filter(Boolean));
            const fuelCats = pbiData.assets
                .filter(a => fuelUnitCodes.has(a.nomor_polisi_rangka) || fuelUnitCodes.has(a.kode_asset) || fuelUnitCodes.has(a.kode_unit))
                .map(a => a.kode_kategori)
                .filter(Boolean);
            validCats = [...new Set(fuelCats.length > 0 ? fuelCats : ALL_FLEET_TYPES)].sort();
        } else if (isMaint) {
            // Maintenance equipment/vehicles
            const maintUnitCodes = new Set((pbiData.maintenance || []).map(m => String(m.kode_unit || m.kode_asset || '').trim()).filter(Boolean));
            const maintCats = pbiData.assets
                .filter(a => maintUnitCodes.has(a.nomor_polisi_rangka) || maintUnitCodes.has(a.kode_asset) || maintUnitCodes.has(a.kode_unit))
                .map(a => a.kode_kategori)
                .filter(Boolean);
            validCats = [...new Set(maintCats.length > 0 ? maintCats : ALL_FLEET_TYPES)].sort();
        } else {
            // All asset categories
            validCats = [...new Set(pbiData.assets.map(a => a.kode_kategori).filter(Boolean))].sort();
        }

        let catHtml = '<option value="ALL">Semua Kategori</option>';
        validCats.forEach(c => {
            const isSel = (c === currentCat) ? 'selected' : '';
            catHtml += `<option value="${c}" ${isSel}>${c}</option>`;
        });
        catSelect.innerHTML = catHtml;

        if (currentCat !== 'ALL' && !validCats.includes(currentCat)) {
            catSelect.value = 'ALL';
        }
    }
}

function setupAssetSlicers() {
    const katSelect = document.getElementById('slicer-asset-kat');
    if (katSelect) {
        const cats = [...new Set(pbiData.assets.map(a => a.kode_kategori).filter(Boolean))].sort();
        katSelect.innerHTML = '<option value="ALL">Semua Kategori</option>';
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            katSelect.appendChild(opt);
        });
    }
}

function setupFuelSlicers() {
    const katSelect = document.getElementById('slicer-fuel-kat');
    if (katSelect) {
        const fuelUnitCodes = new Set((pbiData.fuel || []).map(f => String(f.no_asset_manual || f.kode_unit || '').trim()).filter(Boolean));
        const cats = [...new Set(
            pbiData.assets
                .filter(a => fuelUnitCodes.has(a.nomor_polisi_rangka) || fuelUnitCodes.has(a.kode_asset) || fuelUnitCodes.has(a.kode_unit))
                .map(a => a.kode_kategori)
                .filter(Boolean)
        )].sort();
        const finalCats = cats.length > 0 ? cats : ALL_FLEET_TYPES;
        katSelect.innerHTML = '<option value="ALL">Semua Kategori</option>';
        finalCats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            katSelect.appendChild(opt);
        });
    }
}

function setupMaintenanceSlicers() {
    const katSelect = document.getElementById('slicer-maint-kat');
    if (katSelect) {
        const kats = [...new Set(pbiData.maintenance.map(m => m.kategori_material).filter(Boolean))].sort();
        katSelect.innerHTML = '<option value="ALL">Semua Kategori</option>';
        kats.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            katSelect.appendChild(opt);
        });
    }
    updateMaintSubKatDropdown();
}

function updateMaintSubKatDropdown() {
    const subSelect = document.getElementById('slicer-maint-subkat');
    if (!subSelect) return;
    const selKat = document.getElementById('slicer-maint-kat')?.value || 'ALL';

    let list = pbiData.maintenance;
    if (selKat !== 'ALL') {
        list = list.filter(m => m.kategori_material === selKat);
    }
    const subkats = [...new Set(list.map(m => m.sub_kategori_material).filter(Boolean))].sort();

    subSelect.innerHTML = '<option value="ALL">Semua Sub Kategori</option>';
    subkats.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        subSelect.appendChild(opt);
    });
}

function updateVraUnitDropdown() {
    const unitSelect = document.getElementById('slicer-vra1-unit');
    if (!unitSelect) return;

    const allUnits = [...new Set(pbiData.vra.map(v => v.kode_unit).filter(Boolean))].sort();
    let matching = allUnits;

    if (selectedTypes.size > 0 && selectedTypes.size < ALL_FLEET_TYPES.length) {
        matching = allUnits.filter(u => {
            const asset = pbiData.assetMap.get(u);
            const uType = classifyUnitType(u, asset);
            return selectedTypes.has(uType);
        });
    }

    const prev = unitSelect.value || 'ALL';
    unitSelect.innerHTML = '<option value="ALL">-- SEMUA UNIT VRA --</option>';
    matching.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        if (u === prev) opt.selected = true;
        unitSelect.appendChild(opt);
    });

    if (prev !== 'ALL' && !matching.includes(prev)) {
        unitSelect.value = 'ALL';
        selectedUnit = 'ALL';
    }
}

// Filter Engine
export function applyPbiFilters() {
    if (!pbiData.isLoaded) return;

    const selYear = document.getElementById('slicer-year')?.value || 'ALL';
    updateTopBarMonths(selYear);
    const selMonth = document.getElementById('slicer-month')?.value || 'ALL';
    const selLoc = document.getElementById('slicer-location')?.value || 'ALL';
    const selCat = document.getElementById('slicer-category')?.value || 'ALL';
    const selVraUnit = document.getElementById('slicer-vra1-unit')?.value || 'ALL';

    const matchDate = (tgl) => {
        if (!tgl) return true;
        if (selYear !== 'ALL' && !tgl.startsWith(selYear)) return false;
        if (selMonth !== 'ALL') {
            const parts = tgl.split('-');
            if (parts.length >= 2 && parts[1] !== selMonth) return false;
        }
        return true;
    };

    // Filter Assets
    const selAssetType = document.getElementById('slicer-asset-type')?.value || '';
    const selAssetGroup = document.getElementById('slicer-asset-group')?.value || '';
    const selAssetDept = document.getElementById('slicer-asset-dept')?.value || '';

    const filteredAssets = pbiData.assets.filter(a => {
        if (selLoc !== 'ALL') {
            const infLoc = inferAssetLocation(a);
            if (infLoc !== selLoc && a.location !== selLoc && a.location_id !== selLoc) return false;
        }
        if (selCat !== 'ALL' && a.kode_kategori !== selCat && a.kategori_asset !== selCat) return false;
        
        if (currentAssetEnvFilter !== 'ALL') {
            if (currentAssetEnvFilter === 'IN_BUILDING' && !a.is_in_building && a.building_status !== 'IN_BUILDING') return false;
            if (currentAssetEnvFilter === 'OUTDOOR' && (a.is_in_building || a.building_status === 'IN_BUILDING')) return false;
        }

        if (selAssetType === 'valuable') {
            const acq = Number(a.total_harga_perolehan) || 0;
            const book = Number(a.Nilai_buku) || 0;
            if (acq <= 0 && book <= 0) return false;
        } else if (selAssetType === 'non_valuable') {
            const acq = Number(a.total_harga_perolehan) || 0;
            const book = Number(a.Nilai_buku) || 0;
            if (acq > 0 || book > 0) return false;
        }

        if (selAssetGroup && selAssetGroup !== 'ALL') {
            const kel = String(a.kode_kelompok || '').toUpperCase();
            if (!kel.includes(selAssetGroup.toUpperCase())) return false;
        }

        if (selAssetDept && selAssetDept !== 'ALL') {
            const dept = String(a.departemen || a.department || '').toUpperCase();
            if (dept !== selAssetDept.toUpperCase()) return false;
        }

        return true;
    }).map(a => {
        // Dynamic As-of Date Depreciation: calculate values based on selected year & month
        const dyn = calculateDynamicDepreciation(a, selYear, selMonth);
        return {
            ...a,
            total_harga_perolehan: dyn.effective_acq,
            harga_perolehan: dyn.effective_acq,
            Total_penyusutan: dyn.effective_depreciation,
            total_penyusutan: dyn.effective_depreciation,
            Nilai_buku: dyn.effective_book_value,
            nilai_buku: dyn.effective_book_value,
            lifetime: dyn.is_over_age ? '↑ DIATAS' : '↓ DIBAWAH',
            is_active_in_period: dyn.is_active_in_period
        };
    }).filter(a => (selYear === 'ALL' || a.is_active_in_period));

    const validUnitSet = new Set(filteredAssets.map(a => (a.kode_unit || '').trim()));

    // Filter Transactions
    const filterTrx = (row, isMaintenance = false) => {
        const tgl = row.tanggal || row.tanggal_bkb;
        if (!matchDate(tgl)) return false;
        const u = String(row.kode_unit || row.no_asset_manual || '').trim();
        if (isMaintenance && !isVraInlineUnit(u)) return false;
        if (selVraUnit !== 'ALL' && u !== selVraUnit) return false;

        if (selectedTypes.size === 0) return false;
        if (selectedTypes.size < ALL_FLEET_TYPES.length && selVraUnit === 'ALL') {
            const asset = pbiData.assetMap.get(u);
            const uType = classifyUnitType(u, asset);
            if (!selectedTypes.has(uType)) return false;
        }

        if (selLoc !== 'ALL' || selCat !== 'ALL') {
            return validUnitSet.has(u);
        }
        return true;
    };

    const filteredVra = pbiData.vra.filter(r => filterTrx(r, false));
    const filteredFuel = pbiData.fuel.filter(r => filterTrx(r, false));
    const filteredMaint = pbiData.maintenance.filter(r => filterTrx(r, true));

    const fuelByUnit = measureBbmPerUnit(filteredFuel);
    const fuelMap = new Map(fuelByUnit.map(f => [f.group, f]));

    const vraPerf = measureVraPerformance(filteredVra, fuelMap);
    const monthlyData = measureVraMonthlyRunningDowntime(filteredVra);
    const hierData = measureVraHierarchicalActivity(filteredVra, fuelMap, pbiData.assetMap);

    let totalLiter = 0;
    filteredFuel.forEach(f => {
        totalLiter += Number(f.jumlah_bkb_fix || f.jumlah || 0);
    });

    pbiData.cache = {
        assets: filteredAssets,
        vra: filteredVra,
        fuel: filteredFuel,
        maint: filteredMaint,
        fuelMap,
        vraPerf,
        monthlyData,
        hierData,
        totalLiter
    };
    pbiData.vra4SummaryCache = null;
    pbiData.unitIndexMaps = null;
    const catPickerEl = document.getElementById('slicer-vra4-cat-picker');
    if (catPickerEl) catPickerEl.dataset.populated = '';
    const unitSelectEl = document.getElementById('slicer-vra4-unit-select');
    if (unitSelectEl) unitSelectEl.dataset.lastCat = '';
    const sumTableEl = document.getElementById('table-pbi-vra4-summary-body');
    if (sumTableEl) sumTableEl.dataset.populated = '';

    renderedViews = {};
    renderActiveView();
}

export function resetPbiFilters() {
    if (document.getElementById('slicer-year')) document.getElementById('slicer-year').value = '2026';
    if (document.getElementById('slicer-month')) document.getElementById('slicer-month').value = 'ALL';
    if (document.getElementById('slicer-location')) document.getElementById('slicer-location').value = 'ALL';
    if (document.getElementById('slicer-category')) document.getElementById('slicer-category').value = 'ALL';
    if (document.getElementById('slicer-vra1-type')) document.getElementById('slicer-vra1-type').value = 'ALL';
    if (document.getElementById('slicer-vra1-unit')) document.getElementById('slicer-vra1-unit').value = 'ALL';

    selectedTypes = new Set(ALL_FLEET_TYPES);
    selectedUnit = 'ALL';
    updateTypeChipStyles();
    updateVraUnitDropdown();
    applyPbiFilters();
}

export function onFleetTypeSelect(type) {
    if (!type || type === 'ALL') {
        selectedTypes = new Set(ALL_FLEET_TYPES);
    } else {
        let mappedTypes = [];
        switch (type) {
            case 'HEAVY':
                mappedTypes = ['EXCAVATOR', 'BULLDOZER', 'WHEEL LOADER', 'MOTOR GRADER', 'COMPACTOR'];
                break;
            case 'DUMP':
                mappedTypes = ['DUMP TRUCK', 'TRUCK', 'TRUCK TANGKI', 'TANGKI'];
                break;
            case 'VEHICLE':
                mappedTypes = ['MOBIL', 'SEPEDA MOTOR', 'MOTOR LISTRIK'];
                break;
            case 'MARINE':
                mappedTypes = ['SPEEDBOAT', 'TUGBOAT', 'PONTON', 'BARGE'];
                break;
            case 'STATIONARY':
                mappedTypes = ['GENSET', 'POMPA AIR', 'POTONG RUMPUT'];
                break;
            default:
                mappedTypes = [type];
        }
        selectedTypes = new Set(mappedTypes);
    }
    
    // UI Hack: We still need to update styling based on the clicked type.
    // The previous implementation used selectedTypes.has(t), but `t` on buttons was 'HEAVY', etc.
    // Let's store the raw type string temporarily on the window object or pbiState for the styler.
    window._pns_active_fleet_chip = type;
    
    updateTypeChipStyles();
    updateVraUnitDropdown();
    applyPbiFilters();
}

function updateTypeChipStyles() {
    const activeChip = window._pns_active_fleet_chip || 'ALL';
    document.querySelectorAll('.btn-type-pill, .fleet-type-chip').forEach(btn => {
        const onclickText = btn.getAttribute('onclick') || '';
        const isMatch = onclickText.includes(`'${activeChip}'`);
        
        if (isMatch) {
            btn.classList.add('bg-cyan-600', 'text-white', 'border-cyan-500', 'active', 'shadow-xs');
            btn.classList.remove('bg-slate-100', 'bg-slate-50', 'bg-white', 'text-slate-700', 'text-slate-600', 'text-slate-500', 'border-slate-200', 'dark:bg-slate-800', 'dark:text-slate-200', 'dark:border-slate-700');
        } else {
            btn.classList.remove('bg-cyan-600', 'text-white', 'border-cyan-500', 'active', 'shadow-xs');
            btn.classList.add('bg-slate-100', 'text-slate-700', 'dark:bg-slate-800', 'dark:text-slate-200', 'border-slate-200', 'dark:border-slate-700');
        }
    });
}

// -------------------------------------------------------------
// NAVIGATION & VIEW SWITCHER
// -------------------------------------------------------------
export function toggleSidebar() {
    if (window.innerWidth <= 768) {
        toggleMobileMenu();
        return;
    }
    const sidebar = document.getElementById('pbi-sidebar');
    if (!sidebar) return;
    const isCollapsed = sidebar.classList.toggle('collapsed');
    try {
        localStorage.setItem('pns_sidebar_collapsed', isCollapsed ? '1' : '0');
    } catch (e) {}
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 320);
}

export function toggleMobileMenu() {
    const sidebar = document.getElementById('pbi-sidebar');
    const backdrop = document.getElementById('pbi-sidebar-backdrop');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('mobile-open');
    if (backdrop) {
        if (isOpen) backdrop.classList.remove('hidden');
        else backdrop.classList.add('hidden');
    }
}

export function closeMobileSidebar() {
    const sidebar = document.getElementById('pbi-sidebar');
    const backdrop = document.getElementById('pbi-sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.add('hidden');
}

export function toggleNavModule(groupId) {
    const el = document.getElementById(groupId);
    const caret = document.getElementById(`caret-${groupId}`);
    if (el) {
        el.classList.toggle('collapsed');
    }
    if (caret) {
        caret.classList.toggle('collapsed');
    }
}

export function switchView(targetViewId, subId = null) {
    const target = subId || targetViewId || 'view-vra-1';
    activeViewId = target;
    if (target.startsWith('view-vra-')) {
        currentVraSubId = target;
    }

    // Auto expand accordion if collapsed
    if (target.startsWith('view-vra-')) {
        const el = document.getElementById('nav-group-vra');
        const caret = document.getElementById('caret-nav-group-vra');
        if (el) el.classList.remove('collapsed');
        if (caret) caret.classList.remove('collapsed');
    } else if (target.startsWith('view-fuel')) {
        const el = document.getElementById('nav-group-fuel');
        const caret = document.getElementById('caret-nav-group-fuel');
        if (el) el.classList.remove('collapsed');
        if (caret) caret.classList.remove('collapsed');
    } else if (target.startsWith('view-asset')) {
        const el = document.getElementById('nav-group-asset');
        const caret = document.getElementById('caret-nav-group-asset');
        if (el) el.classList.remove('collapsed');
        if (caret) caret.classList.remove('collapsed');
    } else if (target.startsWith('view-maint')) {
        const el = document.getElementById('nav-group-maint');
        const caret = document.getElementById('caret-nav-group-maint');
        if (el) el.classList.remove('collapsed');
        if (caret) caret.classList.remove('collapsed');
    }

    // 1. Hide all views & show active view
    document.querySelectorAll('.pns-view').forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('active');
    });

    const activeEl = document.getElementById(activeViewId);
    if (activeEl) {
        activeEl.classList.remove('hidden');
        activeEl.classList.add('active');
    }

    // 2. Update Sidebar Active Button
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
        btn.classList.remove('active', 'bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-500/20');
        btn.classList.add('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-slate-800');
    });

    const activeSidebarBtn = document.querySelector(`.sidebar-nav-item[data-target="${activeViewId}"]`);
    if (activeSidebarBtn) {
        activeSidebarBtn.classList.add('active', 'bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-500/20');
        activeSidebarBtn.classList.remove('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-slate-800');
    }

    // 3. Update VRA & Asset Top Subnavs
    document.querySelectorAll('.btn-vra-subnav').forEach(btn => {
        if (btn.getAttribute('data-target') === activeViewId) {
            btn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
            btn.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
        } else {
            btn.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
            btn.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
        }
    });

    document.querySelectorAll('.btn-asset-subnav').forEach(btn => {
        if (btn.getAttribute('data-target') === activeViewId) {
            btn.classList.add('bg-emerald-600', 'text-white', 'shadow-sm');
            btn.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
        } else {
            btn.classList.remove('bg-emerald-600', 'text-white', 'shadow-sm');
            btn.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
        }
    });

    document.querySelectorAll('.btn-fuel-subnav').forEach(btn => {
        if (btn.getAttribute('data-target') === activeViewId) {
            btn.classList.add('bg-purple-600', 'text-white', 'shadow-2xs');
            btn.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
        } else {
            btn.classList.remove('bg-purple-600', 'text-white', 'shadow-2xs');
            btn.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
        }
    });

    // 4. Update Breadcrumb
    const breadcrumbEl = document.getElementById('top-breadcrumb-title');
    if (breadcrumbEl) {
        const titles = {
            'view-dashboard': ['Dashboard', 'Executive Overview'],
            'view-vra-1': ['Fleet & VRA', '1. Overview'],
            'view-vra-2': ['Fleet & VRA', '2. Performa Unit'],
            'view-vra-3': ['Fleet & VRA', '3. Aktivitas'],
            'view-vra-category-detail': ['Fleet & VRA', `Detail Kategori ${currentSelectedCategory}`],
            'view-vra-4': ['Fleet & VRA', '4. Profil Unit'],
            'view-fuel': ['BBM (Fuel)', '1. Analisis & Tren BBM'],
            'view-fuel-detail': ['BBM (Fuel)', '2. Detail Log & Rasio'],
            'view-fuel-anomaly': ['BBM (Fuel)', '3. Audit Anomali BBM'],
            'view-fuel-benchmark': ['BBM (Fuel)', '4. Rasio & Benchmark'],
            'view-asset-1': ['Master Aset', '1. Overview & Validasi'],
            'view-asset-2': ['Master Aset', '2. Lokasi Kantor'],
            'view-asset-office-detail': ['Master Aset', `Detail Aset ${currentSelectedOffice}`],
            'view-asset-drillthrough': ['Master Aset', 'DT.Details.Assets'],
            'view-asset-3': ['Master Aset', '3. Katalog Aset'],
            'view-asset-detail': ['Master Aset', '4. Detail Spesifikasi Aset'],
            'view-asset-in-out': ['Master Aset', '5. In-Building vs Outdoor'],
            'view-asset-building-rooms': ['Master Aset', '6. Inventaris Gedung & Kamar'],
            'view-asset-depreciation': ['Master Aset', '7. Depresiasi Dinamis'],
            'view-asset-validation': ['Master Aset', '8. Validasi Lapangan'],
            'view-maintenance': ['Maintenance', '1. Biaya & Servis'],
            'view-maint-detail': ['Maintenance', '2. Detail Material & Part'],
            'view-maint-services': ['Maintenance', '3. Kategori & Jasa Servis'],
            'view-maint-frequency': ['Maintenance', '4. Frekuensi Servis Unit'],
            'view-maint-simulation': ['Maintenance', '5. Simulasi Servis & Penggantian'],
            'view-report-depreciation': ['Reports', 'Laporan Penyusutan']
        };
        const [modTitle, subTitle] = titles[activeViewId] || ['Dashboard', 'Executive Overview'];
        breadcrumbEl.innerHTML = `<span class="text-slate-400 dark:text-slate-500 font-medium">${modTitle}</span> <span class="text-slate-300 dark:text-slate-600 mx-1.5 font-bold">/</span> <span class="font-bold text-slate-800 dark:text-white">${subTitle}</span>`;
    }

    // 4.5. Mobile Drawer & Bottom Navigation Sync
    if (window.innerWidth <= 768) {
        closeMobileSidebar();
    }
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.classList.remove('active', 'text-cyan-600', 'dark:text-cyan-400');
        btn.classList.add('text-slate-500', 'dark:text-slate-400');
    });
    let activeMobileTarget = 'view-dashboard';
    if (activeViewId === 'view-dashboard') activeMobileTarget = 'view-dashboard';
    else if (activeViewId.startsWith('view-vra')) activeMobileTarget = 'view-vra-4';
    else if (activeViewId.startsWith('view-fuel')) activeMobileTarget = 'view-fuel';
    else if (activeViewId.startsWith('view-maint')) activeMobileTarget = 'view-maintenance';

    const activeMobileBtn = document.querySelector(`.mobile-nav-btn[data-view="${activeMobileTarget}"]`);
    if (activeMobileBtn) {
        activeMobileBtn.classList.add('active', 'text-cyan-600', 'dark:text-cyan-400');
        activeMobileBtn.classList.remove('text-slate-500', 'dark:text-slate-400');
    }

    // 5. Adjust Filters for active view
    adjustFiltersForView(activeViewId);

    // 6. Render Data & Resize Charts
    if (!renderedViews[activeViewId]) {
        renderActiveView();
        renderedViews[activeViewId] = true;
    }

    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 40);
}

export function renderActiveView() {
    if (!pbiData.cache) return;
    const { assets, vra, fuel, maint, vraPerf, monthlyData, hierData, totalLiter } = pbiData.cache;

    try {
        switch (activeViewId) {
            case 'view-dashboard':
                renderExecutiveDashboard(pbiData.cache);
                break;
            case 'view-vra-1':
                renderVra1(vraPerf, monthlyData);
                break;
            case 'view-vra-2':
                renderVra2(vraPerf, totalLiter);
                break;
            case 'view-vra-3':
                renderVra3(vraPerf, hierData);
                break;
            case 'view-vra-category-detail':
                renderVraCategoryDetail(currentSelectedCategory, vra, fuel, assets);
                break;
            case 'view-vra-4':
                renderVra4(assets, vra, fuel, maint);
                break;
            case 'view-fuel':
                renderFuel(fuel, vra);
                break;
            case 'view-fuel-vra':
                renderFuelVraComparison(fuel, vra, assets);
                break;
            case 'view-fuel-detail':
                renderFuelDetail(fuel, vra);
                break;
            case 'view-fuel-anomaly':
                renderFuelAnomaly(fuel, vra, assets);
                break;
            case 'view-fuel-benchmark':
                renderFuelBenchmark(fuel, vra, assets);
                break;
            case 'view-asset-1':
                renderAsset1(assets, maint);
                break;
            case 'view-asset-2':
                renderAsset2(assets, maint);
                break;
            case 'view-asset-office-detail':
                renderAssetOfficeDetail(currentSelectedOffice, assets, maint);
                break;
            case 'view-asset-drillthrough':
                renderAssetDrillthrough(currentDrillFilters, assets, maint);
                break;
            case 'view-asset-3':
                renderAsset3(assets);
                break;
            case 'view-asset-detail':
                renderAssetDetail(assets, maint);
                break;
            case 'view-asset-in-out':
                renderAssetInOut(assets, maint);
                break;
            case 'view-asset-building-rooms':
                renderAssetBuildingRooms();
                break;
            case 'view-asset-depreciation':
                renderAssetDepreciation(assets);
                break;
            case 'view-asset-validation':
                renderAssetValidation(assets);
                break;
            case 'view-maintenance':
                renderMaintenance(maint);
                break;
            case 'view-maint-detail':
                renderMaintDetail(maint);
                break;
            case 'view-maint-services':
                renderMaintServices(maint);
                break;
            case 'view-maint-frequency':
                renderMaintFrequency(maint, assets);
                break;
            case 'view-maint-simulation':
                renderServiceSimulation();
                break;
            case 'view-report-depreciation':
                renderReportDepreciation(assets);
                break;
            default:
                renderVra1(vraPerf, monthlyData);
        }
    } catch (err) {
        console.error(`Error rendering view ${activeViewId}:`, err);
    }
}

/// -------------------------------------------------------------
// STATE MANAGEMENT: DIMENSIONS & SEARCH SLICERS
// -------------------------------------------------------------
let currentVra1TrendDim = 'pct'; // 'pct' | 'hours'
let vra1SearchQuery = '';

// Visual VRA 1 Trend Drill & Slicer State
let visualVra1DrillLevel = 'month'; // 'year' | 'month' | 'day'
let visualVra1DrillYear = 'ALL';
let visualVra1DrillMonth = 'ALL';
let visualVra1Type = 'ALL';
let visualVra1Unit = 'ALL';

// VRA 2 State
let currentVra2BarDim = 'jam_kerja';
let vra2KategoriFilter = 'ALL';
let vra2UnitFilter = 'ALL';
let vra2SearchQuery = '';
let vra2StatusFilters = new Set();
let vra2SortCol = 'jam_kerja';
let vra2SortDir = 'desc';
let currentVra2Layout = 'split'; // 'split', 'table', 'chart'

// VRA 3 State
let vra3ActivityFilter = 'ALL';
let vra3SearchQuery = '';

// VRA 4 State
let vra4CatFilter = 'ALL';
let vra4YearFilter = 'ALL';
let vra4MonthFilter = 'ALL';
let vra4StatusFilter = 'ALL';
let vra4SearchQuery = '';

// Fuel State
let currentFuelTrendDim = 'liter';
let currentFuelPreset = 'ALL';
let fuelKatFilter = 'ALL';
let fuelSearchQuery = '';
let fuelDetailFilter = 'ALL';
let fuelVraKatFilter = 'ALL';
let fuelVraQuadrantFilter = 'ALL';
let fuelVraSearchQuery = '';

// Asset State
let currentAssetBarDim = 'buku';
let assetSearchQuery = '';
let assetTypeFilter = 'ALL';
let assetKatFilter = 'ALL';
let assetKondisiFilter = 'ALL';
let currentOfficeFilter = 'ALL';
let assetDetailFilter = 'ALL';

// Maintenance State
let maintDrillDownFilter = 'ALL';

function setVisualVra1DrillLevel(level) {
    visualVra1DrillLevel = level;
    renderVra1TrendChart();
}

function drillUpVisualVra1() {
    if (visualVra1DrillLevel === 'day') {
        visualVra1DrillLevel = 'month';
        visualVra1DrillMonth = 'ALL';
    } else if (visualVra1DrillLevel === 'month') {
        visualVra1DrillLevel = 'year';
        visualVra1DrillYear = 'ALL';
    }
    renderVra1TrendChart();
}

function onVisualVra1TypeChange(typeVal) {
    visualVra1Type = typeVal || 'ALL';
    visualVra1Unit = 'ALL';
    populateVisualVra1Units(visualVra1Type);
    renderVra1TrendChart();
}

function onVisualVra1UnitChange(unitVal) {
    visualVra1Unit = unitVal || 'ALL';
    renderVra1TrendChart();
}

function resetVisualVra1Filters() {
    visualVra1Type = 'ALL';
    visualVra1Unit = 'ALL';
    const tSel = document.getElementById('visual-vra1-type');
    if (tSel) tSel.value = 'ALL';
    populateVisualVra1Units('ALL');
    renderVra1TrendChart();
}

function populateVisualVra1Dropdowns() {
    const typeSelect = document.getElementById('visual-vra1-type');
    if (!typeSelect) return;

    // Collect available fleet types
    const types = new Set();
    ALL_FLEET_TYPES.forEach(t => types.add(t));
    (pbiData.assets || []).forEach(a => {
        const t = a.sub_kategori || a.kategori;
        if (t) types.add(t);
    });
    (pbiData.vra || []).forEach(r => {
        if (r.sub_kategori) types.add(r.sub_kategori);
    });

    const sortedTypes = Array.from(types).sort();
    const curr = visualVra1Type || 'ALL';
    let html = '<option value="ALL">Semua Tipe</option>';
    sortedTypes.forEach(t => {
        html += `<option value="${t}" ${t === curr ? 'selected' : ''}>${t}</option>`;
    });
    typeSelect.innerHTML = html;

    populateVisualVra1Units(curr);
}

function populateVisualVra1Units(selectedType = 'ALL') {
    const unitSelect = document.getElementById('visual-vra1-unit');
    if (!unitSelect) return;

    const currUnit = visualVra1Unit || 'ALL';
    const unitMap = new Map();

    const activeVraUnits = new Set();
    (pbiData.vra || []).forEach(r => {
        const u = r.kode_unit;
        if (!u) return;
        const t = r.sub_kategori || '';
        if (selectedType === 'ALL' || t === selectedType) {
            activeVraUnits.add(u);
            unitMap.set(u, u);
        }
    });

    (pbiData.assets || []).forEach(a => {
        const u = a.kode_unit;
        if (!u || !activeVraUnits.has(u)) return;
        const name = a.nama_asset || a.nama_asset_detail || '';
        if (name && name !== u) {
            unitMap.set(u, `${u} - ${name}`);
        }
    });

    const sortedCodes = Array.from(unitMap.keys()).sort();
    let html = '<option value="ALL">Semua Unit</option>';
    sortedCodes.forEach(code => {
        const label = unitMap.get(code);
        html += `<option value="${code}" ${code === currUnit ? 'selected' : ''}>${label}</option>`;
    });
    unitSelect.innerHTML = html;
}

function renderVra1TrendChart() {
    if (!pbiData.vra || pbiData.vra.length === 0) return;

    const selLoc = document.getElementById('slicer-location')?.value || 'ALL';
    const selCat = document.getElementById('slicer-category')?.value || 'ALL';

    // Filter rows by visual filters (Type & Unit)
    let rows = pbiData.vra.filter(r => {
        if (!r.tanggal) return false;
        if (r.aktif !== undefined && r.aktif !== null && Number(r.aktif) !== 1 && String(r.aktif) !== '1') return false;

        const u = String(r.kode_unit || '').trim();
        if (visualVra1Unit !== 'ALL' && u !== visualVra1Unit) return false;

        if (visualVra1Type !== 'ALL') {
            const asset = pbiData.assetMap ? pbiData.assetMap.get(u) : null;
            const uType = r.sub_kategori || (asset ? (asset.sub_kategori || asset.kategori) : '') || '';
            if (uType !== visualVra1Type) return false;
        }

        if (selLoc !== 'ALL' || selCat !== 'ALL') {
            const asset = pbiData.assetMap ? pbiData.assetMap.get(u) : null;
            if (selLoc !== 'ALL' && (!asset || asset.lokasi !== selLoc)) return false;
            if (selCat !== 'ALL' && (!asset || asset.kode_kategori !== selCat)) return false;
        }

        return true;
    });

    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const monthShortNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

    const buckets = new Map();
    let breadcrumbText = 'Drill: Bulan';
    let titleText = 'Tren Running vs Downtime';

    if (visualVra1DrillLevel === 'year') {
        breadcrumbText = 'Level: Semua Tahun';
        titleText = 'Tren Running vs Downtime per Tahun (Target 99.73%)';

        rows.forEach(r => {
            const yr = r.tanggal.substring(0, 4);
            if (!yr || yr.length !== 4) return;
            if (!buckets.has(yr)) {
                buckets.set(yr, { key: yr, label: `Tahun ${yr}`, running: 0, downtime: 0 });
            }
            const b = buckets.get(yr);
            const jam = Number(r.jam_kerja_calc || 0);
            if (r.is_downtime) b.downtime += jam;
            else b.running += jam;
        });
    } else if (visualVra1DrillLevel === 'month') {
        if (visualVra1DrillYear !== 'ALL') {
            rows = rows.filter(r => r.tanggal.startsWith(visualVra1DrillYear));
            breadcrumbText = `Tahun ${visualVra1DrillYear} > Bulan`;
            titleText = `Tren Running vs Downtime Bulan (Tahun ${visualVra1DrillYear})`;
        } else {
            const topYear = document.getElementById('slicer-year')?.value;
            if (topYear && topYear !== 'ALL') {
                rows = rows.filter(r => r.tanggal.startsWith(topYear));
                breadcrumbText = `Tahun ${topYear} > Bulan`;
                titleText = `Tren Running vs Downtime Bulan (Tahun ${topYear})`;
            } else {
                breadcrumbText = 'Level: Semua Bulan';
                titleText = 'Tren Running vs Downtime per Bulan (Target 99.73%)';
            }
        }

        rows.forEach(r => {
            const mKey = r.tanggal.substring(0, 7);
            if (!mKey || mKey.length !== 7) return;
            const parts = mKey.split('-');
            const yr = parts[0];
            const mo = parseInt(parts[1], 10) - 1;
            const mLabel = (monthNames[mo] || 'Bln ' + parts[1]) + ' ' + yr;

            if (!buckets.has(mKey)) {
                buckets.set(mKey, { key: mKey, label: mLabel, running: 0, downtime: 0 });
            }
            const b = buckets.get(mKey);
            const jam = Number(r.jam_kerja_calc || 0);
            if (r.is_downtime) b.downtime += jam;
            else b.running += jam;
        });
    } else {
        // Day level
        if (visualVra1DrillMonth !== 'ALL') {
            rows = rows.filter(r => r.tanggal.startsWith(visualVra1DrillMonth));
            const parts = visualVra1DrillMonth.split('-');
            const mo = parseInt(parts[1], 10) - 1;
            breadcrumbText = `${monthNames[mo] || ''} ${parts[0]} > Hari`;
            titleText = `Tren Running vs Downtime Harian (${monthNames[mo] || ''} ${parts[0]})`;
        } else if (visualVra1DrillYear !== 'ALL') {
            rows = rows.filter(r => r.tanggal.startsWith(visualVra1DrillYear));
            breadcrumbText = `Tahun ${visualVra1DrillYear} > Hari`;
            titleText = `Tren Running vs Downtime Harian (Tahun ${visualVra1DrillYear})`;
        } else {
            const topYear = document.getElementById('slicer-year')?.value;
            if (topYear && topYear !== 'ALL') {
                rows = rows.filter(r => r.tanggal.startsWith(topYear));
            }
            breadcrumbText = 'Level: Harian';
            titleText = 'Tren Running vs Downtime Harian';
        }

        rows.forEach(r => {
            const dKey = r.tanggal.substring(0, 10);
            if (!dKey || dKey.length !== 10) return;
            const parts = dKey.split('-');
            const dLabel = `${parts[2]} ${monthShortNames[parseInt(parts[1], 10) - 1] || parts[1]} ${parts[0]}`;

            if (!buckets.has(dKey)) {
                buckets.set(dKey, { key: dKey, label: dLabel, running: 0, downtime: 0 });
            }
            const b = buckets.get(dKey);
            const jam = Number(r.jam_kerja_calc || 0);
            if (r.is_downtime) b.downtime += jam;
            else b.running += jam;
        });
    }

    const bucketList = Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
    const displayList = (visualVra1DrillLevel === 'day' && bucketList.length > 31) ? bucketList.slice(-31) : bucketList;

    const cats = displayList.map(b => b.label);
    const runVals = displayList.map(b => {
        const tot = Math.max(0.001, b.running + b.downtime);
        return currentVra1TrendDim === 'pct' ? Number(((b.running / tot) * 100).toFixed(2)) : Number(b.running.toFixed(1));
    });
    const downVals = displayList.map(b => {
        const tot = Math.max(0.001, b.running + b.downtime);
        return currentVra1TrendDim === 'pct' ? Number(((b.downtime / tot) * 100).toFixed(2)) : Number(b.downtime.toFixed(1));
    });

    // Update UI headers
    const titleEl = document.getElementById('pbi-vra1-trend-title');
    if (titleEl) titleEl.textContent = titleText;

    const crumbEl = document.getElementById('visual-vra1-drill-breadcrumb');
    if (crumbEl) {
        crumbEl.innerHTML = `<i class="ph-bold ph-tree-structure text-cyan-600"></i> <span>${breadcrumbText}</span>`;
    }

    const btnUp = document.getElementById('btn-drill-up');
    if (btnUp) {
        if (visualVra1DrillLevel === 'year') {
            btnUp.classList.add('hidden');
        } else {
            btnUp.classList.remove('hidden');
        }
    }

    ['year', 'month', 'day'].forEach(lvl => {
        const b = document.getElementById(`btn-drill-${lvl}`);
        if (b) {
            if (lvl === visualVra1DrillLevel) {
                b.className = 'px-2 py-1 text-[10px] font-bold rounded-lg bg-cyan-600 text-white shadow-2xs transition cursor-pointer';
            } else {
                b.className = 'px-2 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            }
        }
    });

    const pillEl = document.getElementById('visual-vra1-active-pill');
    const resetBtn = document.getElementById('btn-reset-visual-vra1-filter');
    if (pillEl) {
        let text = '';
        if (visualVra1Type !== 'ALL' && visualVra1Unit !== 'ALL') {
            text = `Tipe: ${visualVra1Type} | Unit: ${visualVra1Unit}`;
        } else if (visualVra1Type !== 'ALL') {
            text = `Tipe: ${visualVra1Type} (Semua Unit)`;
        } else if (visualVra1Unit !== 'ALL') {
            text = `Unit: ${visualVra1Unit}`;
        } else {
            text = `Semua Fleet (${pbiData.assets ? pbiData.assets.length : 102} Unit)`;
        }
        pillEl.textContent = text;
    }
    if (resetBtn) {
        if (visualVra1Type !== 'ALL' || visualVra1Unit !== 'ALL') {
            resetBtn.classList.remove('hidden');
            resetBtn.classList.add('inline-flex');
        } else {
            resetBtn.classList.add('hidden');
            resetBtn.classList.remove('inline-flex');
        }
    }

    const chartHeight = Math.max(340, cats.length * 28 + 60);
    const yFormatter = currentVra1TrendDim === 'pct' ? (v) => v + '%' : (v) => formatNum(v, 0) + ' Jam';

    renderApex('#chart-pbi-vra1-trend', {
        chart: { 
            type: 'bar', 
            height: chartHeight,
            stacked: true,
            stackType: currentVra1TrendDim === 'pct' ? '100%' : 'normal',
            toolbar: { show: true },
            events: {
                dataPointSelection: function(event, chartContext, config) {
                    const idx = config.dataPointIndex;
                    if (idx >= 0 && idx < displayList.length) {
                        const item = displayList[idx];
                        if (visualVra1DrillLevel === 'year') {
                            visualVra1DrillYear = item.key;
                            visualVra1DrillLevel = 'month';
                            renderVra1TrendChart();
                        } else if (visualVra1DrillLevel === 'month') {
                            visualVra1DrillMonth = item.key;
                            visualVra1DrillLevel = 'day';
                            renderVra1TrendChart();
                        }
                    }
                }
            }
        },
        plotOptions: { 
            bar: { 
                horizontal: true, 
                barHeight: '70%', 
                borderRadius: 3
            } 
        },
        dataLabels: {
            enabled: true,
            style: { fontSize: '10px', fontWeight: 700, colors: ['#fff'] },
            formatter: (val) => currentVra1TrendDim === 'pct' ? Number(val).toFixed(1) + '%' : formatNum(val, 0)
        },
        series: [
            { name: 'Running Time ' + (currentVra1TrendDim === 'pct' ? '%' : '(Jam)'), data: runVals },
            { name: 'Downtime ' + (currentVra1TrendDim === 'pct' ? '%' : '(Jam)'), data: downVals }
        ],
        colors: ['#0284c7', '#f43f5e'],
        stroke: { width: 0 },
        xaxis: { 
            categories: cats,
            labels: { formatter: yFormatter, style: { fontSize: '10px', fontWeight: 600 } },
            max: currentVra1TrendDim === 'pct' ? 100 : undefined
        },
        yaxis: { 
            labels: { style: { fontSize: '11px', fontWeight: 600, colors: '#64748b' } } 
        },
        legend: { position: 'top', horizontalAlign: 'right', fontSize: '11px', fontWeight: 600 },
        annotations: currentVra1TrendDim === 'pct' ? { 
            xaxis: [{ 
                x: 99.73, 
                borderColor: '#10b981', 
                strokeDashArray: 4, 
                label: { text: 'Target 99.73%', style: { color: '#fff', background: '#10b981', fontSize: '10px', fontWeight: 700 } } 
            }] 
        } : {},
        tooltip: { 
            y: { formatter: currentVra1TrendDim === 'pct' ? (v) => Number(v).toFixed(2) + '%' : (v) => formatNum(v, 1) + ' Jam' } 
        }
    });

    // 2. Render Composition Donut
    let totalRunning = 0;
    let totalDowntime = 0;
    displayList.forEach(b => {
        totalRunning += b.running;
        totalDowntime += b.downtime;
    });

    renderApex('#chart-pbi-vra1-composition', {
        chart: { type: 'donut', height: 300 },
        series: [Math.round(totalRunning), Math.round(totalDowntime)],
        labels: ['Running', 'Downtime'],
        colors: ['#0284c7', '#f43f5e'],
        stroke: { width: 4, colors: ['var(--color-bg)'] },
        dataLabels: { 
            enabled: true, 
            formatter: function (val) { return val.toFixed(1) + "%" },
            dropShadow: { enabled: true, opacity: 0.3 }
        },
        tooltip: {
            y: { formatter: v => formatNum(v, 0) + ' Jam' }
        },
        legend: { position: 'bottom', fontSize: '11px', fontWeight: 600 }
    });
}

// Dimension Switchers for VRA 1
function setVra1TrendDim(dim) {
    currentVra1TrendDim = dim;
    const btnPct = document.getElementById('btn-vra1-dim-pct');
    const btnHours = document.getElementById('btn-vra1-dim-hours');
    if (btnPct && btnHours) {
        if (dim === 'pct') {
            btnPct.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-cyan-600 text-white shadow-2xs transition cursor-pointer';
            btnHours.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
        } else {
            btnPct.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            btnHours.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-cyan-600 text-white shadow-2xs transition cursor-pointer';
        }
    }
    renderVra1TrendChart();
}

function onVra1Search(query) {
    vra1SearchQuery = query || '';
    if (pbiData.cache) {
        const { vraPerf, monthlyData } = pbiData.cache;
        renderVra1(vraPerf, monthlyData);
    }
}


// Dimension Switchers for VRA 2
function setVra2BarDim(dim) {
    currentVra2BarDim = dim;
    ['rundown', 'jam', 'eff'].forEach(d => {
        const btn = document.getElementById(`btn-vra2-bar-${d}`);
        const mapKey = d === 'rundown' ? 'run_down' : (d === 'jam' ? 'jam_kerja' : 'effective');
        if (btn) {
            if (mapKey === dim) {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-blue-600 text-white shadow-2xs transition cursor-pointer';
            } else {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            }
        }
    });
    const titleEl = document.getElementById('pbi-vra2-bar-title');
    if (titleEl) {
        if (dim === 'jam_kerja') titleEl.textContent = 'Top 7 Units: Jam Kerja Operasional';
        else if (dim === 'effective') titleEl.textContent = 'Top 7 Units: Tingkat Efektivitas (%)';
        else titleEl.textContent = 'Top 7 Units: Running vs Downtime';
    }
    if (pbiData.cache) {
        const { vraPerf, totalLiter } = pbiData.cache;
        renderVra2(vraPerf, totalLiter);
    }
}

function onVra2FilterChange() {
    vra2KategoriFilter = document.getElementById('slicer-vra2-kategori')?.value || 'ALL';
    vra2UnitFilter = 'ALL';
    const unitSelect = document.getElementById('slicer-vra2-unit');
    if (unitSelect) unitSelect.value = 'ALL';
    if (pbiData.cache) {
        const { vraPerf, totalLiter } = pbiData.cache;
        renderVra2(vraPerf, totalLiter);
    }
}

function onVra2UnitChange() {
    vra2UnitFilter = document.getElementById('slicer-vra2-unit')?.value || 'ALL';
    if (pbiData.cache) {
        const { vraPerf, totalLiter } = pbiData.cache;
        renderVra2(vraPerf, totalLiter);
    }
}

function onVra2Search(query) {
    vra2SearchQuery = query || '';
    if (pbiData.cache) {
        const { vraPerf, totalLiter } = pbiData.cache;
        renderVra2(vraPerf, totalLiter);
    }
}

function toggleVra2StatusFilter(statusKey) {
    if (!statusKey || statusKey === 'ALL') {
        vra2StatusFilters.clear();
    } else {
        if (vra2StatusFilters.has(statusKey)) {
            vra2StatusFilters.delete(statusKey);
        } else {
            vra2StatusFilters.add(statusKey);
        }
    }
    if (pbiData.cache) {
        const { vraPerf, totalLiter } = pbiData.cache;
        renderVra2(vraPerf, totalLiter);
    }
}

function resetVra2StatusFilter() {
    vra2StatusFilters.clear();
    if (pbiData.cache) {
        const { vraPerf, totalLiter } = pbiData.cache;
        renderVra2(vraPerf, totalLiter);
    }
}

function setVra2StatusFilter(statusKey) {
    toggleVra2StatusFilter(statusKey);
}

function sortVra2(colKey) {
    if (vra2SortCol === colKey) {
        vra2SortDir = (vra2SortDir === 'asc' ? 'desc' : 'asc');
    } else {
        vra2SortCol = colKey;
        vra2SortDir = (colKey === 'kode_unit' || colKey === 'status') ? 'asc' : 'desc';
    }
    if (pbiData.cache) {
        const { vraPerf, totalLiter } = pbiData.cache;
        renderVra2(vraPerf, totalLiter);
    }
}

function setVra2Layout(mode) {
    currentVra2Layout = mode;
    const chartCont = document.getElementById('vra2-chart-container');
    const tableCont = document.getElementById('vra2-table-container');
    const btnSplit = document.getElementById('btn-vra2-layout-split');
    const btnTable = document.getElementById('btn-vra2-layout-table');
    const btnChart = document.getElementById('btn-vra2-layout-chart');

    const defaultBtnClass = 'px-2 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer flex items-center gap-1';
    const activeBtnClass = 'px-2 py-1 text-[10px] font-bold rounded-lg bg-cyan-600 text-white shadow-2xs transition cursor-pointer flex items-center gap-1';

    if (btnSplit) btnSplit.className = defaultBtnClass;
    if (btnTable) btnTable.className = defaultBtnClass;
    if (btnChart) btnChart.className = defaultBtnClass;

    if (mode === 'table') {
        if (chartCont) chartCont.classList.add('hidden');
        if (tableCont) {
            tableCont.classList.remove('hidden', 'col-span-12', 'xl:col-span-7');
            tableCont.classList.add('col-span-12');
        }
        if (btnTable) btnTable.className = activeBtnClass;
    } else if (mode === 'chart') {
        if (tableCont) tableCont.classList.add('hidden');
        if (chartCont) {
            chartCont.classList.remove('hidden', 'col-span-12', 'xl:col-span-5');
            chartCont.classList.add('col-span-12');
        }
        if (btnChart) btnChart.className = activeBtnClass;
    } else {
        // split mode (default)
        if (chartCont) {
            chartCont.classList.remove('hidden', 'col-span-12');
            chartCont.classList.add('col-span-12', 'xl:col-span-5');
        }
        if (tableCont) {
            tableCont.classList.remove('hidden', 'col-span-12');
            tableCont.classList.add('col-span-12', 'xl:col-span-7');
        }
        if (btnSplit) btnSplit.className = activeBtnClass;
    }

    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 150);
}

// VRA 4 Filter Handlers
function onVra4CatPickerChange(cat) {
    vra4CatFilter = cat || 'ALL';
    const sel = document.getElementById('slicer-vra4-cat-picker');
    if (sel) sel.value = vra4CatFilter;
    if (pbiData.cache) {
        const { assets, vra, fuel, maint } = pbiData.cache;
        renderVra4(assets, vra, fuel, maint);
    }
}

function onVra4FilterChange() {
    vra4YearFilter = document.getElementById('slicer-vra4-year')?.value || 'ALL';
    vra4MonthFilter = document.getElementById('slicer-vra4-month')?.value || 'ALL';
    vra4StatusFilter = document.getElementById('slicer-vra4-status')?.value || 'ALL';
    if (pbiData.cache) {
        const { assets, vra, fuel, maint } = pbiData.cache;
        renderVra4(assets, vra, fuel, maint);
    }
}

let vra4SearchTimer = null;
function onVra4Search(query) {
    vra4SearchQuery = query || '';
    clearTimeout(vra4SearchTimer);
    vra4SearchTimer = setTimeout(() => {
        if (pbiData.cache) {
            const { assets, vra, fuel, maint } = pbiData.cache;
            renderVra4(assets, vra, fuel, maint);
        }
    }, 120);
}

function resetVra4Filters() {
    vra4CatFilter = 'ALL';
    vra4YearFilter = 'ALL';
    vra4MonthFilter = 'ALL';
    vra4StatusFilter = 'ALL';
    vra4SearchQuery = '';
    const selCat = document.getElementById('slicer-vra4-cat-picker');
    const selYear = document.getElementById('slicer-vra4-year');
    const selMonth = document.getElementById('slicer-vra4-month');
    const selStatus = document.getElementById('slicer-vra4-status');
    const inputSearch = document.getElementById('input-vra4-search');
    if (selCat) selCat.value = 'ALL';
    if (selYear) selYear.value = 'ALL';
    if (selMonth) selMonth.value = 'ALL';
    if (selStatus) selStatus.value = 'ALL';
    if (inputSearch) inputSearch.value = '';
    if (pbiData.cache) {
        const { assets, vra, fuel, maint } = pbiData.cache;
        renderVra4(assets, vra, fuel, maint);
    }
}

// VRA 3 Filter Handlers
function onVra3FilterChange() {
    vra3ActivityFilter = document.getElementById('slicer-vra3-activity')?.value || 'ALL';
    if (pbiData.cache) {
        const { vraPerf, hierData } = pbiData.cache;
        renderVra3(vraPerf, hierData);
    }
}

function onVra3Search(query) {
    vra3SearchQuery = query || '';
    if (pbiData.cache) {
        const { vraPerf, hierData } = pbiData.cache;
        renderVra3(vraPerf, hierData);
    }
}

// Fuel Slicer & Dimension Handlers
function setFuelTrendDim(dim) {
    currentFuelTrendDim = dim;
    const btnLtr = document.getElementById('btn-fuel-dim-liter');
    const btnBiaya = document.getElementById('btn-fuel-dim-biaya');
    const btnRasio = document.getElementById('btn-fuel-dim-rasio');
    const activeClass = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-purple-600 text-white shadow-2xs transition cursor-pointer';
    const inactiveClass = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';

    if (btnLtr) btnLtr.className = dim === 'liter' ? activeClass : inactiveClass;
    if (btnBiaya) btnBiaya.className = dim === 'biaya' ? activeClass : inactiveClass;
    if (btnRasio) btnRasio.className = dim === 'rasio' ? activeClass : inactiveClass;

    if (pbiData.cache) {
        const { fuel, vra } = pbiData.cache;
        renderFuel(fuel, vra);
    }
}

function setFuelPreset(preset = 'ALL') {
    currentFuelPreset = preset;
    ['all', 'heavy', 'transport', 'anomaly'].forEach(p => {
        const btn = document.getElementById(`btn-fuel-preset-${p}`);
        if (btn) {
            if (p === preset.toLowerCase()) {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-purple-600 text-white shadow-2xs transition cursor-pointer';
            } else {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            }
        }
    });
    if (pbiData.cache) {
        const { fuel, vra } = pbiData.cache;
        renderFuel(fuel, vra);
    }
}

function exportFuelCsv() {
    if (!pbiData.cache || !pbiData.cache.fuel) return;
    const res = measureFuelDetailLog(pbiData.cache.fuel, pbiData.cache.vra, pbiData.assetMap);
    const list = res.unitList;
    let csv = 'Kode Unit,Nama Asset,Kategori,Total Liter,Total Biaya (Rp),KM / Liter,Liter / Jam,Status Efisiensi\n';
    list.forEach(u => {
        csv += `"${u.kode_unit}","${(u.nama_asset||'').replace(/"/g, '""')}","${u.kategori || ''}",${u.total_liter},${u.total_biaya},${u.km_per_liter || 0},${u.liter_per_jam || 0},"${u.efficiency_status || 'Normal'}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pns_fuel_summary_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function onFuelFilterChange() {
    fuelKatFilter = document.getElementById('slicer-fuel-kat')?.value || 'ALL';
    if (pbiData.cache) {
        const { fuel, vra } = pbiData.cache;
        renderFuel(fuel, vra);
    }
}

function onFuelSearch(query) {
    fuelSearchQuery = query || '';
    if (pbiData.cache) {
        const { fuel, vra } = pbiData.cache;
        renderFuel(fuel, vra);
    }
}

export function onFuelVraFilterChange() {
    fuelVraKatFilter = document.getElementById('slicer-fuel-vra-kat')?.value || 'ALL';
    if (pbiData.cache) {
        const { fuel, vra, assets } = pbiData.cache;
        renderFuelVraComparison(fuel, vra, assets);
    }
}

export function onFuelVraSearch(query) {
    fuelVraSearchQuery = query || '';
    if (pbiData.cache) {
        const { fuel, vra, assets } = pbiData.cache;
        renderFuelVraComparison(fuel, vra, assets);
    }
}

export function setFuelVraQuadrant(quad) {
    fuelVraQuadrantFilter = quad || 'ALL';
    ['all', 'prima', 'kritis', 'heavy', 'standby'].forEach(q => {
        const btn = document.getElementById(`btn-fv-quad-${q}`);
        if (btn) {
            const isMatch = (quad === 'ALL' && q === 'all') || 
                            (quad === 'PRIMA_EFISIEN' && q === 'prima') ||
                            (quad === 'KRITIS_BOROS' && q === 'kritis') ||
                            (quad === 'HEAVY_WORKLOAD' && q === 'heavy') ||
                            (quad === 'STANDBY_IDLE' && q === 'standby');
            if (isMatch) {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-purple-600 text-white shadow-2xs transition cursor-pointer flex items-center gap-1';
            } else {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer flex items-center gap-1';
            }
        }
    });
    if (pbiData.cache) {
        const { fuel, vra, assets } = pbiData.cache;
        renderFuelVraComparison(fuel, vra, assets);
    }
}

export function exportFuelVraCsv() {
    if (!pbiData.cache) return;
    const { fuel, vra, assets } = pbiData.cache;
    const rep = measureVraFuelComparison(fuel, vra, pbiData.assetMap);
    let csv = 'Kode Unit,Nama Asset,Kategori VRA,Jam Kerja (HM),Jarak (KM),Konsumsi BBM (L),Total Biaya (Rp),Rasio Riil,Target VRA,Deviasi (%),Biaya/HM (Rp),Kuadran,Status\n';
    rep.comparisonList.forEach(u => {
        csv += `"${u.kode_unit}","${(u.nama_asset||'').replace(/"/g, '""')}","${u.kategori || ''}",${u.total_hm},${u.total_km},${u.total_liter},${u.total_biaya},${u.actual_ratio},${u.target_ratio},${u.deviation_pct},${u.cost_per_hm},"${u.quadrant}","${u.status_label}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pns_fuel_vra_comparison_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Asset Slicer & Dimension Handlers
function setAssetBarDim(dim) {
    currentAssetBarDim = dim;
    const btnBuku = document.getElementById('btn-asset-bar-buku');
    const btnUnit = document.getElementById('btn-asset-bar-unit');
    if (btnBuku && btnUnit) {
        if (dim === 'buku') {
            btnBuku.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-600 text-white shadow-2xs transition cursor-pointer';
            btnUnit.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
        } else {
            btnBuku.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            btnUnit.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-600 text-white shadow-2xs transition cursor-pointer';
        }
    }
    if (pbiData.cache) {
        renderAsset3(pbiData.cache.assets);
    }
}

function onAssetFilterChange() {
    assetTypeFilter = document.getElementById('slicer-asset-type-cat')?.value || 'ALL';
    assetKatFilter = document.getElementById('slicer-asset-kat')?.value || 'ALL';
    assetKondisiFilter = document.getElementById('slicer-asset-kondisi')?.value || 'ALL';
    if (pbiData.cache) {
        renderAsset3(pbiData.cache.assets);
    }
}

function onAssetSearch(query) {
    assetSearchQuery = query || '';
    if (pbiData.cache) {
        renderAsset3(pbiData.cache.assets);
    }
}


// -------------------------------------------------------------
// VIEW 1: VRA PERFORMANCE OVERVIEW (STANDARDIZED ENTERPRISE)
// -------------------------------------------------------------
function renderVra1(vraPerf, monthlyData) {
    const activeCount = vraPerf.active_units_count || (vraPerf.dimension_units ? vraPerf.dimension_units.length : 0);
    const totalDurasi = vraPerf.total_durasi || 0;
    const runningTime = vraPerf.running_time || 0;
    const downtime = vraPerf.downtime || 0;
    const gtRunPct = vraPerf.utilization_pct || 0;
    const gtDownPct = vraPerf.downtime_pct || 0;
    const effectivity = vraPerf.normal_time_pct || (gtRunPct > 0 ? Math.min(100, gtRunPct) : 0);

    setElText('pbi-kpi-total-unit', formatNum(activeCount));
    setElText('pbi-kpi-salah-input-sub', `${formatNum(vraPerf.salah_input_count || 0)} Salah Input (${(vraPerf.salah_input_rate_pct || 0).toFixed(1)}%)`);
    setElText('pbi-kpi-valid-input-sub', `${formatNum(vraPerf.valid_input_count || 0)} Valid`);
    setElText('pbi-kpi-jam-kerja', formatNum(totalDurasi, 1));
    setElText('pbi-kpi-run-time', formatNum(runningTime, 1));
    setElText('pbi-kpi-downtime', formatNum(downtime, 1));
    setElText('pbi-kpi-gt-run', formatPct(gtRunPct));
    setElText('pbi-kpi-gt-down', formatPct(gtDownPct));
    setElText('pbi-kpi-eff', formatPct(effectivity));

    // Render Power BI Alive SVG Sparklines & Gauges for View 1
    try {
        const mListKpi = (monthlyData && monthlyData.monthly) ? monthlyData.monthly : (Array.isArray(monthlyData) ? monthlyData : []);
        
        // 1. Total Unit Sparkline
        const unitTrend = mListKpi.map(m => ({ label: m.month || 'B', value: activeCount }));
        renderSvgSparkline('#pbi-kpi-spark-total-unit', unitTrend.length > 0 ? unitTrend : [{ label: 'Aktif', value: activeCount }], {
            color: '#06b6d4',
            height: 34,
            unit: 'Unit',
            formatter: v => formatNum(v, 0) + ' Unit'
        });

        // 2. Jam Kerja Sparkline
        const durasiTrend = mListKpi.map(m => ({ label: m.month || 'B', value: Number((m.total_durasi || (Number(m.running_jam || 0) + Number(m.downtime_jam || 0))).toFixed(1)) }));
        renderSvgSparkline('#pbi-kpi-spark-jam-kerja', durasiTrend, {
            color: '#0284c7',
            height: 34,
            unit: 'J',
            formatter: v => formatNum(v, 1) + ' Jam'
        });

        // 3. Running Time Sparkline
        const runTrend = mListKpi.map(m => ({ label: m.month || 'B', value: Number((m.running_jam || m.running || 0).toFixed(1)) }));
        renderSvgSparkline('#pbi-kpi-spark-run-time', runTrend, {
            color: '#6366f1',
            height: 34,
            unit: 'J',
            formatter: v => formatNum(v, 1) + ' Jam'
        });

        // 4. Downtime Sparkline
        const downTrend = mListKpi.map(m => ({ label: m.month || 'B', value: Number((m.downtime_jam || m.downtime || 0).toFixed(1)) }));
        renderSvgSparkline('#pbi-kpi-spark-downtime', downTrend, {
            color: '#f43f5e',
            height: 34,
            unit: 'J',
            formatter: v => formatNum(v, 1) + ' Jam'
        });

        // 5. % GT Run Circular Gauge
        renderSvgGauge('#pbi-kpi-gauge-gt-run', gtRunPct, 95, {
            color: '#06b6d4',
            size: 44,
            strokeWidth: 4.5,
            label: 'Utilisasi'
        });

        // 6. % GT Down Circular Gauge
        renderSvgGauge('#pbi-kpi-gauge-gt-down', gtDownPct, 0.27, {
            color: '#f59e0b',
            size: 44,
            strokeWidth: 4.5,
            label: 'Downtime'
        });

        // 7. Effektifitas Circular Gauge
        renderSvgGauge('#pbi-kpi-gauge-eff', effectivity, 99.73, {
            color: '#10b981',
            size: 44,
            strokeWidth: 4.5,
            label: 'Effektifitas'
        });
    } catch (err) {
        console.warn('Error rendering VRA1 SVG visual cards:', err);
    }

    // In-Visual Dropdowns (Tipe & Unit) & Trend Chart with Date Drill Down
    populateVisualVra1Dropdowns();
    renderVra1TrendChart();

    // Matrix Table with Quick Search and In-Cell Bar Visuals
    let list = vraPerf.dimension_units || [];
    if (vra1SearchQuery.trim() !== '') {
        const q = vra1SearchQuery.toLowerCase();
        list = list.filter(u => 
            (u.kode_unit && u.kode_unit.toLowerCase().includes(q)) ||
            (u.status && u.status.toLowerCase().includes(q))
        );
    }

    setElText('pbi-vra1-filtered-count', formatNum(list.length));

    const tbody = document.getElementById('table-pbi-vra1-matrix');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" class="text-center py-6 text-slate-400 font-medium">Tidak ada data unit yang sesuai filter.</td></tr>';
        return;
    }

    tbody.innerHTML = list.slice(0, 100).map(u => {
        const effPct = Math.min(100, Math.max(0, u.effective_km_run || u.eff_km_run || 0));
        const aging = u.aging_days !== undefined ? u.aging_days : 0;
        let agingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 whitespace-nowrap">Hari ini</span>';
        if (aging === 1) {
            agingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-sky-300 whitespace-nowrap">1 Hari lalu</span>';
        } else if (aging > 1 && aging <= 7) {
            agingBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 whitespace-nowrap">${aging} Hari lalu</span>`;
        } else if (aging > 7) {
            agingBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 whitespace-nowrap">${aging} Hari lalu</span>`;
        }

        let extra = '';
        if (u.keterangan && u.keterangan !== '-' && !u.keterangan.toUpperCase().includes('INJECT KM')) {
            extra = u.keterangan;
        }
        if (u.tujuan && u.tujuan !== '-') {
            extra = extra ? `${extra} (${u.tujuan})` : `Ke ${u.tujuan}`;
        }

        // Lookup nama_asset from assetMap
        const assetObj = pbiData.assetMap ? (pbiData.assetMap.get(u.kode_unit) || {}) : {};
        const namaUnit = assetObj.nama_asset || assetObj.nama_asset_detail || u.sub_kategori || '-';

        return `
            <tr onclick="window.pns.drillToUnit('${u.kode_unit}')" class="hover:bg-blue-50/70 dark:hover:bg-blue-950/40 transition text-[11px] border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik untuk Drill-Through ke Profil Unit ${u.kode_unit}">
                <td class="font-bold text-blue-600 dark:text-sky-400 px-2.5 py-1.5 whitespace-nowrap">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span>${u.kode_unit}</span>
                        ${u.odometer_reset_count > 0 ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/60" title="Odometer di-reset ${u.odometer_reset_count}x (mulai dari 0)">${u.odometer_reset_count}x Reset</span>` : ''}
                        ${u.salah_input_count > 0 ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300/60" title="${u.salah_input_count} kali salah input (aktif = 0)">${u.salah_input_count}x err</span>` : ''}
                        <i class="ph-bold ph-arrow-square-out text-[11px] text-blue-500 opacity-0 group-hover:opacity-100 transition"></i>
                    </div>
                </td>
                <td class="px-2 py-1.5 text-slate-600 dark:text-slate-300 font-medium truncate max-w-[160px]" title="${namaUnit}">${namaUnit}</td>
                <td class="px-2 py-1.5 text-center font-semibold text-slate-700 dark:text-slate-300">
                    <div class="flex flex-col items-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.status === 'OPERATED' || u.status === 'Operating' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
                            (u.status === 'Standby' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' :
                            (u.status === 'Warming Up' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300' :
                            (u.status && (u.status.includes('Breakdown') || u.status.includes('Rusak')) ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' :
                            (u.status && (u.status.includes('Mutasi') || u.status.includes('Nonaktif')) ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' :
                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'))))
                        } whitespace-nowrap">
                            ${u.status || '-'}
                        </span>
                        ${extra ? `
                            <span class="text-[9px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 max-w-[130px] truncate leading-tight" title="${extra}">
                                ${extra}
                            </span>
                        ` : ''}
                    </div>
                </td>
                <td class="px-2 py-1.5 text-center font-mono text-slate-700 dark:text-slate-300 font-semibold whitespace-nowrap" title="Aktivitas: ${u.last_aktivitas || '-'}">${formatDatePbi(u.last_update)}</td>
                <td class="px-2 py-1.5 text-center whitespace-nowrap">${agingBadge}</td>
                <td class="px-2 py-1.5 text-right font-mono">${formatNum(u.total_durasi, 1)}</td>
                <td class="px-2 py-1.5 text-right font-mono text-blue-600 font-bold">${formatNum(u.running_time, 1)}</td>
                <td class="px-2 py-1.5 text-right font-mono text-rose-600">${formatNum(u.downtime, 1)}</td>
                <td class="px-2 py-1.5 text-right font-mono text-amber-600">${formatNum(u.standby || u.downtime, 1)}</td>
                <td class="px-2 py-1.5 text-right font-mono">${formatNum(u.petrol_per_km || u.p_km, 2)}</td>
                <td class="px-2 py-1.5 text-right font-mono">${formatNum(u.petrol_per_workhour || u.p_wh, 2)}</td>
                <td class="px-2 py-1.5 text-right font-mono font-bold text-emerald-600 whitespace-nowrap" title="Eff (KM/Run)">
                    ${formatNum(u.effective_km_run || u.eff_km_run, 2)}
                </td>
                <td class="px-2 py-1.5 text-right font-mono">${formatPct(u.running_pct || u.gt_run_pct)}</td>
                <td class="px-2 py-1.5 text-right font-mono text-rose-500">${formatPct(u.downtime_pct || u.gt_down_pct)}</td>
            </tr>
        `;
    }).join('');
}

// -------------------------------------------------------------
// VIEW 2: UNIT PERFORMANCE & DIMENSI VRA (STANDARDIZED ENTERPRISE)
// -------------------------------------------------------------
function renderVra2(vraPerf, totalLiter) {
    let list = vraPerf.dimension_units || [];

    // Dynamic Unit Dropdown Population based on available units in current category
    const unitSelect = document.getElementById('slicer-vra2-unit');
    if (unitSelect) {
        let candidateUnits = vraPerf.dimension_units || [];
        if (vra2KategoriFilter !== 'ALL') {
            candidateUnits = candidateUnits.filter(u => {
                const cat = String(u.sub_kategori || u.kode_kategori || '').toUpperCase();
                return cat.includes(vra2KategoriFilter) || vra2KategoriFilter.includes(cat);
            });
        }
        const currentSel = vra2UnitFilter;
        let optHtml = '<option value="ALL">Semua Unit</option>';
        const sortedCandidates = [...candidateUnits].sort((a, b) => (a.kode_unit || '').localeCompare(b.kode_unit || ''));
        sortedCandidates.forEach(u => {
            const isSel = (u.kode_unit === currentSel) ? 'selected' : '';
            optHtml += `<option value="${u.kode_unit}" ${isSel}>${u.kode_unit}</option>`;
        });
        unitSelect.innerHTML = optHtml;
        if (currentSel !== 'ALL' && !candidateUnits.some(u => u.kode_unit === currentSel)) {
            vra2UnitFilter = 'ALL';
            unitSelect.value = 'ALL';
        }
    }

    const matchStatus = (unitStatus, filter) => {
        if (!filter || filter === 'ALL') return true;
        const s = (unitStatus || '').toUpperCase();
        const f = filter.toUpperCase();
        if (f === 'OPERATED' || f === 'OPERATING') {
            return s.includes('OPERAT') || s.includes('WARM') || s.includes('CHECK') || s.includes('INSPEKSI');
        }
        if (f === 'STANDBY') {
            return s.includes('STANDBY') || s.includes('TUNGGU') || s.includes('SIAGA') || s.includes('CADANGAN');
        }
        if (f === 'BREAKDOWN') {
            return s.includes('BREAKDOWN') || s.includes('RUSAK') || s.includes('TROUBLE') || s.includes('IDLE');
        }
        if (f === 'MAINTENANCE' || f === 'SERVICE') {
            return s.includes('MAINT') || s.includes('SERVICE') || s.includes('PERBAIKAN') || s.includes('WORKSHOP');
        }
        return s.includes(f);
    };

    if (vra2KategoriFilter !== 'ALL') {
        list = list.filter(u => {
            const cat = String(u.sub_kategori || u.kode_kategori || '').toUpperCase();
            return cat.includes(vra2KategoriFilter) || vra2KategoriFilter.includes(cat);
        });
    }
    if (vra2UnitFilter !== 'ALL') {
        list = list.filter(u => u.kode_unit === vra2UnitFilter);
    }
    if (vra2SearchQuery.trim() !== '') {
        const q = vra2SearchQuery.toLowerCase();
        list = list.filter(u => 
            (u.kode_unit && u.kode_unit.toLowerCase().includes(q)) ||
            (u.status && u.status.toLowerCase().includes(q))
        );
    }

    const filteredActiveCount = list.length;
    const filteredOperatedCount = list.filter(u => matchStatus(u.status, 'OPERATED') || (u.running_time || 0) > 0).length;
    const filteredStandbyCount = list.filter(u => matchStatus(u.status, 'STANDBY')).length;
    const filteredMaintCount = list.filter(u => matchStatus(u.status, 'MAINTENANCE')).length;
    const filteredBreakdownCount = list.filter(u => matchStatus(u.status, 'BREAKDOWN')).length;
    
    const filteredRunning = list.reduce((sum, u) => sum + (u.running_time || 0), 0);
    const filteredDowntime = list.reduce((sum, u) => sum + (u.downtime || 0), 0);
    const filteredDurasi = list.reduce((sum, u) => sum + (u.total_durasi || u.jam_kerja || 0), 0);
    const filteredKm = list.reduce((sum, u) => sum + (u.total_km || u.km_used || 0), 0);
    const filteredFuel = list.reduce((sum, u) => sum + (u.total_liter || 0), 0);

    const totalAllTime = filteredRunning + filteredDowntime;
    const availUnitPct = totalAllTime > 0 ? (filteredRunning / totalAllTime) * 100 : (filteredActiveCount > 0 ? (filteredOperatedCount / filteredActiveCount) * 100 : 0);
    const downUnitPct = totalAllTime > 0 ? (filteredDowntime / totalAllTime) * 100 : (filteredActiveCount > 0 ? (filteredBreakdownCount / filteredActiveCount) * 100 : 0);

    // Calculate Averages
    const avgKmPerUnit = filteredActiveCount > 0 ? filteredKm / filteredActiveCount : 0;
    const avgFuelPerUnit = filteredActiveCount > 0 ? (filteredFuel > 0 ? filteredFuel : totalLiter) / filteredActiveCount : 0;
    const avgRunPerUnit = filteredActiveCount > 0 ? filteredRunning / filteredActiveCount : 0;
    const avgKmPerDay = vraPerf.period_days > 0 ? filteredKm / vraPerf.period_days : 0;

    // Update Hero 1: Fleet Availability
    setElText('pbi-vra2-unit-count', formatNum(filteredActiveCount));
    setElText('pbi-vra2-unit-operated', formatNum(filteredOperatedCount));
    setElText('pbi-vra2-operated-pct', formatPct(filteredActiveCount > 0 ? (filteredOperatedCount / filteredActiveCount) * 100 : 0));
    setElText('pbi-vra2-unit-standby', formatNum(filteredStandbyCount));
    setElText('pbi-vra2-standby-pct', formatPct(filteredActiveCount > 0 ? (filteredStandbyCount / filteredActiveCount) * 100 : 0));
    
    // Update Hero 2: Downtime & Breakdown Risk
    setElText('pbi-vra2-down-time', formatNum(filteredDowntime, 2));
    setElText('pbi-vra2-unit-maint', formatNum(filteredMaintCount));
    setElText('pbi-vra2-maint-pct', formatPct(filteredActiveCount > 0 ? (filteredMaintCount / filteredActiveCount) * 100 : 0));
    setElText('pbi-vra2-unit-breakdown', formatNum(filteredBreakdownCount));
    setElText('pbi-vra2-breakdown-pct', formatPct(filteredActiveCount > 0 ? (filteredBreakdownCount / filteredActiveCount) * 100 : 0));
    
    // Update Hero 3: Operational Output & Mobility (Total & Average Subtext)
    setElText('pbi-vra2-tot-durasi', formatK(filteredDurasi) + ' Jam');
    setElText('pbi-vra2-run-pct', 'Run: ' + formatPct(availUnitPct));
    setElText('pbi-vra2-km-used', formatK(filteredKm) + ' KM');
    setElText('pbi-vra2-km-avg', 'Avg ' + formatNum(avgKmPerUnit, 0) + ' KM/Unit (' + formatNum(avgKmPerDay, 1) + ' KM/Hari)');
    setElText('pbi-vra2-petrol-usage', formatK(filteredFuel > 0 ? filteredFuel : totalLiter) + ' L');
    setElText('pbi-vra2-fuel-avg', 'Avg ' + formatNum(avgFuelPerUnit, 0) + ' L/Unit');
    setElText('pbi-vra2-run-time', formatK(filteredRunning) + ' Jam');
    setElText('pbi-vra2-run-avg', 'Avg ' + formatNum(avgRunPerUnit, 1) + ' Jam/Unit');

    setElText('pbi-vra2-filtered-count', formatNum(list.length));
    const totalSalahInput = list.reduce((sum, u) => sum + (u.salah_input_count || 0), 0);
    setElText('pbi-vra2-salah-input-count', formatNum(totalSalahInput));

    renderApex('#chart-pbi-vra2-avail-radial', {
        chart: { type: 'radialBar', height: 120, sparkline: { enabled: true } },
        series: [Number(availUnitPct.toFixed(1))],
        colors: ['#6366f1'],
        plotOptions: {
            radialBar: {
                hollow: { size: '60%' },
                dataLabels: { name: { show: false }, value: { fontSize: '15px', fontWeight: 800, offsetY: 4, formatter: v => v + '%' } }
            }
        }
    });

    renderApex('#chart-pbi-vra2-down-radial', {
        chart: { type: 'radialBar', height: 120, sparkline: { enabled: true } },
        series: [Number(downUnitPct.toFixed(1))],
        colors: ['#ef4444'],
        plotOptions: {
            radialBar: {
                hollow: { size: '60%' },
                dataLabels: { name: { show: false }, value: { fontSize: '15px', fontWeight: 800, offsetY: 4, formatter: v => v + '%' } }
            }
        }
    });

    // Power BI Custom SVG KPI Cards Category Definitions & Counts
    const getCatKey = (st) => {
        const s = (st || '').toUpperCase();
        if (s.includes('STANDBY')) return 'STANDBY';
        if (s.includes('WARM') || s.includes('RUNNING')) return 'WARMING';
        if (s.includes('BREAKDOWN') || s.includes('RUSAK')) return 'BREAKDOWN';
        if (s.includes('MUTASI') || s.includes('NONAKTIF')) return 'MUTASI_NONAKTIF';
        return 'OPERATING';
    };

    const catCounts = {
        'STANDBY': 0,
        'OPERATING': 0,
        'BREAKDOWN': 0,
        'MUTASI_NONAKTIF': 0,
        'WARMING': 0
    };

    (list || []).forEach(u => {
        const k = getCatKey(u.status);
        if (catCounts[k] !== undefined) catCounts[k]++;
        else catCounts['OPERATING']++;
    });

    const statusCategories = [
        {
            key: 'STANDBY',
            label: 'Standby',
            sublabel: 'Unit standby & siap',
            count: catCounts['STANDBY'],
            color: '#0284c7', // Sky Blue
            badgeBg: 'rgba(2, 132, 199, 0.12)',
            activeBg: 'rgba(2, 132, 199, 0.08)',
            iconSvg: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
        },
        {
            key: 'OPERATING',
            label: 'Operating',
            sublabel: 'Aktif beroperasi',
            count: catCounts['OPERATING'],
            color: '#10b981', // Emerald Green
            badgeBg: 'rgba(16, 185, 129, 0.12)',
            activeBg: 'rgba(16, 185, 129, 0.08)',
            iconSvg: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
        },
        {
            key: 'BREAKDOWN',
            label: 'Breakdown',
            sublabel: 'Rusak / perbaikan',
            count: catCounts['BREAKDOWN'],
            color: '#ef4444', // Rose Red
            badgeBg: 'rgba(239, 68, 68, 0.12)',
            activeBg: 'rgba(239, 68, 68, 0.08)',
            iconSvg: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
        },
        {
            key: 'MUTASI_NONAKTIF',
            label: 'Mutasi / Nonaktif',
            sublabel: 'Mutasi out & nonaktif',
            count: catCounts['MUTASI_NONAKTIF'],
            color: '#8b5cf6', // Purple
            badgeBg: 'rgba(139, 92, 246, 0.12)',
            activeBg: 'rgba(139, 92, 246, 0.08)',
            iconSvg: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`
        },
        {
            key: 'WARMING',
            label: 'Warming Up',
            sublabel: 'Pemanasan unit',
            count: catCounts['WARMING'],
            color: '#f59e0b', // Amber
            badgeBg: 'rgba(245, 158, 11, 0.12)',
            activeBg: 'rgba(245, 158, 11, 0.08)',
            iconSvg: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>`
        }
    ];

    // Render the Power BI Custom SVG interactive status KPI component with multi-select support
    renderSvgInteractiveStatusCards('#chart-pbi-vra2-status-donut', statusCategories, vra2StatusFilters, (key) => toggleVra2StatusFilter(key));

    // Update Header Badge and Reset Button visibility
    const statusBadge = document.getElementById('pbi-vra2-status-badge');
    const resetBtn = document.getElementById('pbi-vra2-status-reset-btn');
    if (vra2StatusFilters.size > 0) {
        const selCats = statusCategories.filter(c => vra2StatusFilters.has(c.key));
        if (statusBadge) {
            statusBadge.textContent = selCats.map(c => `${c.label} (${c.count})`).join(', ');
            statusBadge.classList.remove('hidden');
        }
        if (resetBtn) resetBtn.classList.remove('hidden');
    } else {
        if (statusBadge) statusBadge.classList.add('hidden');
        if (resetBtn) resetBtn.classList.add('hidden');
    }

    // Apply multi-select status filter to unit table & top 7 bar chart
    let displayUnits = list;
    if (vra2StatusFilters.size > 0) {
        displayUnits = list.filter(u => vra2StatusFilters.has(getCatKey(u.status)));
    }

    // Top 7 is always the leading units by work hours for clear benchmark
    const top7Candidates = [...displayUnits].sort((a, b) => (b.total_durasi || b.jam_kerja || 0) - (a.total_durasi || a.jam_kerja || 0));
    const top7 = top7Candidates.slice(0, 7);
    let barSeries = [];
    let barColors = ['#0284c7', '#fb7185'];

    if (currentVra2BarDim === 'jam_kerja') {
        barSeries = [{ name: 'Jam Kerja', data: top7.map(u => Number((u.total_durasi || u.jam_kerja || 0).toFixed(1))) }];
        barColors = ['#0ea5e9'];
    } else if (currentVra2BarDim === 'effective') {
        barSeries = [{ name: 'Effective %', data: top7.map(u => Number((u.effective_jam_kerja || 0).toFixed(1))) }];
        barColors = ['#10b981'];
    } else {
        barSeries = [
            { name: 'Running (Jam)', data: top7.map(u => Number((u.running_time || 0).toFixed(1))) },
            { name: 'Downtime (Jam)', data: top7.map(u => Number((u.downtime || 0).toFixed(1))) }
        ];
    }

    renderApex('#chart-pbi-vra2-topunits', {
        chart: { type: 'bar', stacked: currentVra2BarDim === 'run_down', height: 430 },
        series: barSeries,
        colors: barColors,
        plotOptions: { 
            bar: { 
                horizontal: true, 
                barHeight: '55%',
                dataLabels: { position: 'center' }
            } 
        },
        dataLabels: {
            enabled: true,
            style: {
                fontSize: '10px',
                fontWeight: 700,
                colors: ['#ffffff']
            },
            dropShadow: { enabled: false },
            formatter: function (val, opt) {
                if (!val || val <= 0) return '';
                if (currentVra2BarDim === 'run_down') {
                    const dataIdx = opt.dataPointIndex;
                    const u = top7[dataIdx];
                    if (u) {
                        const rTime = u.running_time || 0;
                        const dTime = u.downtime || 0;
                        const tot = rTime + dTime;
                        if (tot > 0) {
                            const pctVal = (val / tot) * 100;
                            const pctStr = pctVal.toFixed(1) + '%';
                            if (pctVal < 8) return pctStr;
                            return `${formatNum(val, 1)} (${pctStr})`;
                        }
                    }
                } else if (currentVra2BarDim === 'effective') {
                    return `${Number(val).toFixed(1)}%`;
                }
                return formatNum(val, 1);
            }
        },
        tooltip: {
            y: {
                formatter: function (val, opt) {
                    if (val === undefined || val === null) return '-';
                    if (currentVra2BarDim === 'run_down') {
                        const dataIdx = opt && opt.dataPointIndex !== undefined ? opt.dataPointIndex : -1;
                        const u = dataIdx >= 0 ? top7[dataIdx] : null;
                        if (u) {
                            const rTime = u.running_time || 0;
                            const dTime = u.downtime || 0;
                            const tot = rTime + dTime;
                            const pct = tot > 0 ? ((val / tot) * 100).toFixed(1) + '%' : '0%';
                            return `${formatNum(val, 1)} Jam (${pct})`;
                        }
                        return `${formatNum(val, 1)} Jam`;
                    } else if (currentVra2BarDim === 'jam_kerja') {
                        return `${formatNum(val, 1)} Jam`;
                    } else if (currentVra2BarDim === 'effective') {
                        return `${formatPct(val)}`;
                    }
                    return val;
                }
            }
        },
        xaxis: { categories: top7.map(u => u.kode_unit), labels: { style: { fontSize: '11px', fontWeight: 600 } } },
        yaxis: { labels: { style: { fontSize: '11px', fontWeight: 600 } } },
        legend: { position: 'top', horizontalAlign: 'right', fontSize: '11px', fontWeight: 600 }
    });

    const tbody = document.getElementById('table-pbi-vra2-matrix');
    if (!tbody) return;

    // Sort displayUnits based on active column and direction (A-Z, Z-A, 0-9, 9-0)
    displayUnits = [...displayUnits].sort((a, b) => {
        let valA, valB;
        switch(vra2SortCol) {
            case 'kode_unit':
                valA = a.kode_unit || '';
                valB = b.kode_unit || '';
                return vra2SortDir === 'asc' 
                    ? valA.localeCompare(valB, 'id', { numeric: true, sensitivity: 'base' }) 
                    : valB.localeCompare(valA, 'id', { numeric: true, sensitivity: 'base' });
            case 'status':
                valA = a.status || '';
                valB = b.status || '';
                return vra2SortDir === 'asc' 
                    ? valA.localeCompare(valB, 'id', { sensitivity: 'base' }) 
                    : valB.localeCompare(valA, 'id', { sensitivity: 'base' });
            case 'last_update':
                valA = a.last_update ? new Date(a.last_update).getTime() : 0;
                valB = b.last_update ? new Date(b.last_update).getTime() : 0;
                break;
            case 'aging_days':
                valA = a.aging_days !== undefined ? a.aging_days : 9999;
                valB = b.aging_days !== undefined ? b.aging_days : 9999;
                break;
            case 'effective_jam_kerja':
                valA = a.effective_jam_kerja || 0;
                valB = b.effective_jam_kerja || 0;
                break;
            case 'running_pct':
                valA = a.running_pct || 0;
                valB = b.running_pct || 0;
                break;
            case 'downtime_pct':
                valA = a.downtime_pct || 0;
                valB = b.downtime_pct || 0;
                break;
            case 'total_km':
                valA = a.total_km || a.km_used || 0;
                valB = b.total_km || b.km_used || 0;
                break;
            case 'total_durasi':
            case 'jam_kerja':
            default:
                valA = a.total_durasi || a.jam_kerja || 0;
                valB = b.total_durasi || b.jam_kerja || 0;
                break;
        }
        return vra2SortDir === 'asc' ? (valA - valB) : (valB - valA);
    });

    // Update Header Sort Indicators & Active Style on table-pbi-vra2
    const tableEl = document.getElementById('table-pbi-vra2');
    if (tableEl) {
        tableEl.querySelectorAll('th[data-sort-key]').forEach(th => {
            const key = th.getAttribute('data-sort-key');
            const icon = th.querySelector('.sort-indicator');
            if (key === vra2SortCol) {
                th.classList.add('text-cyan-600', 'dark:text-cyan-400');
                if (icon) {
                    icon.innerHTML = vra2SortDir === 'asc'
                        ? '<i class="ph-bold ph-caret-up text-cyan-600 dark:text-cyan-400 text-[11px]"></i>'
                        : '<i class="ph-bold ph-caret-down text-cyan-600 dark:text-cyan-400 text-[11px]"></i>';
                }
            } else {
                th.classList.remove('text-cyan-600', 'dark:text-cyan-400');
                if (icon) {
                    icon.innerHTML = '<i class="ph-bold ph-caret-up-down opacity-40 text-[10px]"></i>';
                }
            }
        });
    }

    const countLabel = document.getElementById('vra2-table-count-label');
    if (countLabel) {
        countLabel.textContent = `Menampilkan ${Math.min(100, displayUnits.length)} dari ${displayUnits.length} unit`;
    }

    if (displayUnits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-6 text-slate-400 font-medium">Tidak ada data unit yang sesuai filter status ' + (vra2StatusFilters.size > 0 ? Array.from(vra2StatusFilters).join(', ') : '') + '.</td></tr>';
        return;
    }

    tbody.innerHTML = displayUnits.slice(0, 100).map(u => {
        const effPct = Math.min(100, Math.max(0, u.effective_jam_kerja || 0));
        const aging = u.aging_days !== undefined ? u.aging_days : 0;
        let agingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 whitespace-nowrap">Hari ini</span>';
        if (aging === 1) {
            agingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-sky-300 whitespace-nowrap">1 Hari lalu</span>';
        } else if (aging > 1 && aging <= 7) {
            agingBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 whitespace-nowrap">${aging} Hari lalu</span>`;
        } else if (aging > 7) {
            agingBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 whitespace-nowrap">${aging} Hari lalu</span>`;
        }

        let extra = '';
        if (u.keterangan && u.keterangan !== '-' && !u.keterangan.toUpperCase().includes('INJECT KM')) {
            extra = u.keterangan;
        }
        if (u.tujuan && u.tujuan !== '-') {
            extra = extra ? `${extra} (${u.tujuan})` : `Ke ${u.tujuan}`;
        }

        return `
            <tr onclick="window.pns.drillToUnit('${u.kode_unit}')" class="hover:bg-blue-50/70 dark:hover:bg-blue-950/40 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik untuk Drill-Through ke Profil Unit ${u.kode_unit}">
                <td data-sort-value="${u.kode_unit || ''}" class="font-bold text-blue-600 dark:text-sky-400 px-2.5 py-1.5 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/80 transition z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span>${u.kode_unit}</span>
                        ${u.odometer_reset_count > 0 ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/60" title="Odometer di-reset ${u.odometer_reset_count}x (mulai dari 0)">${u.odometer_reset_count}x Reset</span>` : ''}
                        ${u.salah_input_count > 0 ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300/60" title="${u.salah_input_count} kali salah input (aktif = 0)">${u.salah_input_count}x err</span>` : ''}
                        <i class="ph-bold ph-arrow-square-out text-[11px] text-blue-500 opacity-0 group-hover:opacity-100 transition"></i>
                    </div>
                </td>
                <td data-sort-value="${u.status || ''}" class="px-2 py-1.5 text-center font-semibold text-slate-700 dark:text-slate-300">
                    <div class="flex flex-col items-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.status === 'OPERATED' || u.status === 'Operating' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
                            (u.status === 'Standby' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' :
                            (u.status === 'Warming Up' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300' :
                            (u.status && (u.status.includes('Breakdown') || u.status.includes('Rusak')) ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' :
                            (u.status && (u.status.includes('Mutasi') || u.status.includes('Nonaktif')) ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' :
                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'))))
                        } whitespace-nowrap">
                            ${u.status || '-'}
                        </span>
                        ${extra ? `
                            <span class="text-[9px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 max-w-[130px] truncate leading-tight" title="${extra}">
                                ${extra}
                            </span>
                        ` : ''}
                    </div>
                </td>
                <td data-sort-value="${u.last_update || ''}" class="px-2 py-1.5 text-center font-mono text-slate-700 dark:text-slate-300 font-semibold whitespace-nowrap" title="Aktivitas: ${u.last_aktivitas || '-'}">${formatDatePbi(u.last_update)}</td>
                <td data-sort-value="${aging}" class="px-2 py-1.5 text-center whitespace-nowrap">${agingBadge}</td>
                <td data-sort-value="${effPct}" class="px-2 py-1.5 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">
                    <div class="flex items-center justify-end gap-1.5">
                        <div class="w-10 bg-emerald-100 dark:bg-emerald-950/40 rounded-full h-1.5 overflow-hidden">
                            <div class="bg-emerald-500 h-full rounded-full" style="width: ${effPct}%"></div>
                        </div>
                        <span>${formatPct(u.effective_jam_kerja)}</span>
                    </div>
                </td>
                <td data-sort-value="${u.running_pct || 0}" class="px-2 py-1.5 text-right font-mono text-blue-600 font-bold whitespace-nowrap">${formatPct(u.running_pct)}</td>
                <td data-sort-value="${u.downtime_pct || 0}" class="px-2 py-1.5 text-right font-mono text-rose-600 whitespace-nowrap">${formatPct(u.downtime_pct)}</td>
                <td data-sort-value="${u.total_durasi || u.jam_kerja || 0}" class="px-2 py-1.5 text-right font-mono whitespace-nowrap">${formatNum(u.total_durasi || u.jam_kerja, 1)}</td>
                <td data-sort-value="${u.total_km || u.km_used || 0}" class="px-2 py-1.5 text-right font-mono font-bold whitespace-nowrap">${formatNum(u.total_km || u.km_used, 0)}</td>
            </tr>
        `;
    }).join('');
}

// -------------------------------------------------------------
// VIEW 3: HIERARKI AKTIVITAS (STANDARDIZED ENTERPRISE)
// -------------------------------------------------------------
function renderVra3(vraPerf, hierData) {
    let list = hierData || [];
    if (vra3ActivityFilter !== 'ALL') {
        const filterKey = vra3ActivityFilter.toUpperCase();
        list = list.filter(item => {
            if (item.sub_kategori && item.sub_kategori.toUpperCase().includes(filterKey)) return true;
            return (item.units || []).some(u => 
                (u.activities || []).some(a => {
                    const actName = (a.name || '').toUpperCase();
                    if (filterKey === 'STANDBY') return actName.includes('STANDBY') || actName.includes('TUNGGU') || actName.includes('SIAGA');
                    if (filterKey === 'BREAKDOWN') return actName.includes('BREAKDOWN') || actName.includes('RUSAK') || actName.includes('TROUBLE');
                    if (filterKey === 'MAINTENANCE') return actName.includes('SERVICE') || actName.includes('MAINT') || actName.includes('PERBAIKAN') || actName.includes('OLI');
                    if (filterKey === 'LOGISTIK') return actName.includes('LOGISTIK') || actName.includes('SUPPLY') || actName.includes('ANGKUT');
                    if (filterKey === 'DINAS') return actName.includes('DINAS') || actName.includes('TAMU') || actName.includes('KARYAWAN');
                    if (filterKey === 'OPERATED') return !actName.includes('STANDBY') && !actName.includes('BREAKDOWN') && !actName.includes('SERVICE');
                    return actName.includes(filterKey);
                })
            );
        });
    }
    if (vra3SearchQuery.trim() !== '') {
        const q = vra3SearchQuery.toLowerCase();
        list = list.filter(item => 
            (item.sub_kategori && item.sub_kategori.toLowerCase().includes(q)) ||
            (item.units || []).some(u => 
                (u.kode_unit && u.kode_unit.toLowerCase().includes(q)) ||
                (u.activities || []).some(a => a.name && a.name.toLowerCase().includes(q))
            )
        );
    }

    const filteredTotDurasi = list.reduce((s, i) => s + (i.total_durasi || 0), 0);
    const totDurasi = Math.max(0.01, filteredTotDurasi > 0 ? filteredTotDurasi : (vraPerf.total_durasi || 0));
    
    const operatingJam = list.reduce((s, i) => s + (i.running_jam || i.running_time || ((i.status === 'Operating' || !i.is_downtime) ? i.total_durasi : 0) || 0), 0) || (vraPerf.running_time || 0);
    const operatingPct = (operatingJam / totDurasi) * 100;
    
    const standbyJam = list.filter(i => (i.status || '').includes('Standby')).reduce((s, i) => s + (i.total_durasi || 0), 0) || (vraPerf.status_durations && vraPerf.status_durations['Standby']) || 0;
    const standbyPct = (standbyJam / totDurasi) * 100;
    
    const downtimeJam = list.filter(i => i.is_downtime || (i.status || '').includes('Breakdown') || (i.status || '').includes('Maintenance')).reduce((s, i) => s + (i.total_durasi || 0), 0) || (vraPerf.downtime || 0);
    const downtimePct = (downtimeJam / totDurasi) * 100;

    setElText('pbi-vra3-operated-time', formatNum(operatingJam, 1) + ' Jam');
    setElText('pbi-vra3-op-pct', formatPct(operatingPct));
    setElText('pbi-vra3-standby-time', formatNum(standbyJam, 1) + ' Jam');
    setElText('pbi-vra3-sb-pct', formatPct(standbyPct));
    setElText('pbi-vra3-downtime-time', formatNum(downtimeJam, 1) + ' Jam');
    setElText('pbi-vra3-down-pct', formatPct(downtimePct));

    setElText('pbi-vra3-filtered-count', formatNum(list.length));

    renderApex('#chart-pbi-vra3-status-donut', {
        chart: { type: 'donut', height: '100%' },
        series: [Number(operatingJam.toFixed(1)), Number(standbyJam.toFixed(1)), Number(downtimeJam.toFixed(1))],
        labels: ['Operating', 'Standby', 'Downtime'],
        colors: ['#10b981', '#f59e0b', '#ef4444'],
        plotOptions: { pie: { donut: { size: '65%' } } },
        legend: { position: 'bottom', fontSize: '11px', fontWeight: 600 }
    });

    const barEl = document.getElementById('pbi-vra3-activity-bars');
    if (barEl && hierData) {
        const top6 = [...list].sort((a,b) => b.total_durasi - a.total_durasi).slice(0, 6);
        const tot = Math.max(1, vraPerf.total_durasi);
        barEl.innerHTML = top6.map((item) => {
            const pct = (item.total_durasi / tot) * 100;
            return `
                <div onclick="window.pns.drillToCategoryDetail('${item.sub_kategori}', false)" class="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-blue-50/60 dark:hover:bg-slate-800/60 px-2 rounded-xl transition group" title="Klik untuk lihat detail kategori ${item.sub_kategori}">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <i class="ph-bold ph-arrow-right text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 transition"></i>
                        <span class="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[140px] group-hover:text-blue-600 dark:group-hover:text-sky-400">${item.sub_kategori}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-20 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div class="bg-blue-600 h-full rounded-full" style="width: ${Math.min(100, pct)}%;"></div>
                        </div>
                        <span class="font-mono font-bold w-12 text-right">${pct.toFixed(1)}%</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    const tbody = document.getElementById('table-pbi-vra3-right');
    if (tbody) {
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400 font-medium">Tidak ada aktivitas armada VRA yang sesuai filter.</td></tr>';
            return;
        }

        const maxDur = Math.max(...list.map(i => i.total_durasi || 0), 1);

        tbody.innerHTML = list.slice(0, 100).map(item => {
            const pct = Math.min(100, ((item.total_durasi || 0) / maxDur) * 100);
            return `
                <tr class="hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition text-xs border-b border-slate-100 dark:border-slate-800 group">
                    <td onclick="window.pns.drillToCategoryDetail('${item.sub_kategori}', false)" class="font-black text-slate-800 dark:text-slate-200 px-3 py-2.5 cursor-pointer">
                        <div class="flex items-center gap-2">
                            <i class="ph-bold ph-steering-wheel text-blue-500 group-hover:scale-110 transition"></i>
                            <span class="group-hover:text-blue-600 dark:group-hover:text-sky-400 underline-offset-2 group-hover:underline">${item.sub_kategori}</span>
                        </div>
                    </td>
                    <td class="px-3 py-2.5 text-right font-mono">${formatNum(item.km_used || item.total_km, 0)} KM</td>
                    <td class="px-3 py-2.5 text-right font-mono">${formatNum(item.petrol_usage || item.total_liter, 0)} L</td>
                    <td class="px-3 py-2.5 text-right font-mono font-bold text-blue-600 whitespace-nowrap">
                        <div class="flex items-center justify-end gap-2">
                            <div class="w-12 bg-blue-100 dark:bg-blue-950/40 rounded-full h-2 overflow-hidden">
                                <div class="bg-blue-600 h-full rounded-full" style="width: ${pct}%"></div>
                            </div>
                            <span>${formatNum(item.total_durasi, 1)} Jam</span>
                        </div>
                    </td>
                    <td class="px-3 py-2.5 text-right font-mono font-semibold">${item.km_per_hm ? item.km_per_hm.toFixed(2) : '-'}</td>
                    <td class="px-3 py-2.5 text-center whitespace-nowrap">
                        <div class="flex items-center justify-center gap-1.5">
                            <button onclick="window.pns.drillToCategoryDetail('${item.sub_kategori}', false)" class="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-600 hover:text-white text-blue-600 dark:text-sky-400 text-[10.5px] font-bold border border-blue-200/80 dark:border-blue-800 transition cursor-pointer shadow-2xs" title="Lihat Detail Kategori">
                                Detail
                            </button>
                            <button onclick="window.pns.drillToCategoryDetail('${item.sub_kategori}', true)" class="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-600 dark:text-slate-400 text-[11px] transition cursor-pointer shadow-2xs" title="Buka di Tab Baru">
                                <i class="ph-bold ph-arrow-square-out"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// -------------------------------------------------------------
// VIEW 3.1: DETAIL ANALISIS PER KATEGORI ARMADA VRA (DEEP DIVE)
// -------------------------------------------------------------
function renderVraCategoryDetail(category, vra, fuel, assets) {
    const cat = category || currentSelectedCategory || 'SPEEDBOAT';
    currentSelectedCategory = cat;

    const selectEl = document.getElementById('slicer-vra-cat-select');
    if (selectEl) selectEl.value = cat;

    const fuelMap = new Map();
    (fuel || []).forEach(f => {
        const u = String(f.kode_unit || '').trim();
        if (u) {
            const cur = fuelMap.get(u) || { total_liter: 0, total_biaya: 0 };
            cur.total_liter += Number(f.liter_bkb || f.jumlah_liter || f.total_liter || 0);
            cur.total_biaya += Number(f.total_biaya || (f.liter_bkb * 14500) || 0);
            fuelMap.set(u, cur);
        }
    });

    const data = measureVraCategoryDetail(cat, vra, fuelMap, pbiData.assetMap);

    // Update Header Badges
    setElText('pbi-vra-cat-unit-count', formatNum(data.unit_count));
    setElText('pbi-vra-cat-log-count', formatNum(data.total_logs));
    setElText('pbi-vra-cat-trend-label', `Tahun 2026 • ${cat}`);

    // Update 6 KPI Cards
    setElText('pbi-vra-cat-kpi-populasi', `${formatNum(data.unit_count)} Unit`);
    setElText('pbi-vra-cat-kpi-populasi-sub', `${data.unit_count > 0 ? '100% Terdata' : '0 Unit'}`);

    setElText('pbi-vra-cat-kpi-running-jam', `${formatNum(data.operating_jam, 1)} Jam`);
    setElText('pbi-vra-cat-kpi-running-pct', `${formatPct(data.operating_pct)} Utilisasi`);

    setElText('pbi-vra-cat-kpi-total-km', `${formatNum(data.total_km, 0)} KM`);
    const avgKmPerUnit = data.unit_count > 0 ? (data.total_km / data.unit_count) : 0;
    setElText('pbi-vra-cat-kpi-km-sub', `${formatNum(avgKmPerUnit, 0)} KM / Unit`);

    setElText('pbi-vra-cat-kpi-fuel-liter', `${formatNum(data.total_liter, 0)} L`);
    setElText('pbi-vra-cat-kpi-fuel-cost', formatRp(data.total_fuel_cost));

    setElText('pbi-vra-cat-kpi-km-per-liter', `${data.km_per_liter.toFixed(2)} KM/L`);
    setElText('pbi-vra-cat-kpi-liter-per-hm', `${data.liter_per_hm.toFixed(2)} L/HM`);

    setElText('pbi-vra-cat-kpi-downtime-jam', `${formatNum(data.downtime_jam, 1)} Jam`);
    setElText('pbi-vra-cat-kpi-availability', `${formatPct(data.mechanical_availability)} MA`);

    // Render 6 Category Detail Interactive SVG Sparklines
    try {
        const trendData = data.monthly_trend || [];

        // 1. Populasi Sparkline
        const popTrend = trendData.map(m => ({ label: m.label, value: data.unit_count }));
        renderSvgSparkline('#pbi-vra-cat-spark-populasi', popTrend, {
            color: '#06b6d4',
            height: 32,
            unit: 'Unit',
            formatter: v => formatNum(v, 0) + ' Unit'
        });

        // 2. Jam Operasi Running Sparkline
        const opTrend = trendData.map(m => ({ label: m.label, value: Number(m.operating_jam.toFixed(1)) }));
        renderSvgSparkline('#pbi-vra-cat-spark-running', opTrend, {
            color: '#10b981',
            height: 32,
            unit: 'J',
            formatter: v => formatNum(v, 1) + ' Jam'
        });

        // 3. Jarak Tempuh KM Sparkline
        const kmTrend = trendData.map(m => ({ label: m.label, value: Number(((m.operating_jam || 0) * (data.km_per_liter > 0 ? 3.5 : 0)).toFixed(0)) }));
        renderSvgSparkline('#pbi-vra-cat-spark-km', kmTrend, {
            color: '#6366f1',
            height: 32,
            unit: 'KM',
            formatter: v => formatNum(v, 0) + ' KM'
        });

        // 4. Fuel Sparkline
        const fuelTrend = trendData.map(m => ({ label: m.label, value: Number(((m.operating_jam || 0) * (data.liter_per_hm || 1.2)).toFixed(0)) }));
        renderSvgSparkline('#pbi-vra-cat-spark-fuel', fuelTrend, {
            color: '#f59e0b',
            height: 32,
            unit: 'L',
            formatter: v => formatNum(v, 0) + ' L'
        });

        // 5. Ratio KM/L Sparkline
        const ratioTrend = trendData.map(m => ({ label: m.label, value: Number(data.km_per_liter.toFixed(2)) }));
        renderSvgSparkline('#pbi-vra-cat-spark-ratio', ratioTrend, {
            color: '#06b6d4',
            height: 32,
            unit: 'KM/L',
            formatter: v => formatNum(v, 2) + ' KM/L'
        });

        // 6. Downtime Sparkline
        const dtTrend = trendData.map(m => ({ label: m.label, value: Number(m.downtime_jam.toFixed(1)) }));
        renderSvgSparkline('#pbi-vra-cat-spark-down', dtTrend, {
            color: '#f43f5e',
            height: 32,
            unit: 'J',
            formatter: v => formatNum(v, 1) + ' Jam'
        });
    } catch (err) {
        console.warn('Error rendering category detail SVG sparklines:', err);
    }

    // Chart 1: Monthly Trend
    const months = data.monthly_trend.map(m => m.label);
    const opHours = data.monthly_trend.map(m => Number(m.operating_jam.toFixed(1)));
    const sbHours = data.monthly_trend.map(m => Number(m.standby_jam.toFixed(1)));
    const dtHours = data.monthly_trend.map(m => Number(m.downtime_jam.toFixed(1)));

    renderApex('#chart-pbi-vra-cat-monthly', {
        chart: { type: 'bar', height: 260, stacked: true, toolbar: { show: false } },
        series: [
            { name: 'Operating (Jam)', data: opHours },
            { name: 'Standby (Jam)', data: sbHours },
            { name: 'Downtime (Jam)', data: dtHours }
        ],
        colors: ['#10b981', '#f59e0b', '#ef4444'],
        xaxis: { categories: months, labels: { style: { fontSize: '10.5px', fontWeight: 600 } } },
        yaxis: { min: 0, labels: { formatter: v => formatNum(v, 0) + ' J', style: { fontSize: '10.5px', fontWeight: 600 } } },
        legend: { position: 'top', horizontalAlign: 'right', fontSize: '11px', fontWeight: 600 }
    });

    // Chart 2: Pareto Activities
    const topActs = data.activities_pareto.slice(0, 7);
    renderApex('#chart-pbi-vra-cat-activities', {
        chart: { type: 'bar', height: 260, toolbar: { show: false } },
        plotOptions: { 
            bar: { 
                horizontal: true, 
                barHeight: '55%', 
                borderRadius: 4 
            } 
        },
        series: [{ name: 'Durasi (Jam)', data: topActs.map(a => Number(a.hours.toFixed(1))) }],
        colors: ['#0284c7'],
        xaxis: { 
            categories: topActs.map(a => a.name.length > 25 ? a.name.substring(0, 25) + '...' : a.name),
            labels: { 
                style: { fontSize: '10px', fontWeight: 600 },
                formatter: v => formatNum(v, 0) + ' J' 
            } 
        },
        yaxis: { 
            labels: { 
                style: { fontSize: '10.5px', fontWeight: 600 },
                maxWidth: 160
            } 
        },
        dataLabels: {
            enabled: true,
            formatter: v => formatNum(v, 0) + ' J',
            style: { fontSize: '10px', fontWeight: 700 }
        },
        tooltip: {
            y: { formatter: v => formatNum(v, 1) + ' Jam Kerja' }
        }
    });

    // Chart 3: Unit Efficiency Ranking
    const topUnits = data.units_performance.slice(0, 8);
    renderApex('#chart-pbi-vra-cat-unit-efficiency', {
        chart: { type: 'bar', height: 260, toolbar: { show: false } },
        plotOptions: { bar: { horizontal: false, columnWidth: '50%', borderRadius: 4 } },
        series: [
            { name: 'Jam Operasi', data: topUnits.map(u => Number(u.operating_jam.toFixed(1))) },
            { name: 'Standby / Down', data: topUnits.map(u => Number((u.standby_jam + u.downtime_jam).toFixed(1))) }
        ],
        colors: ['#3b82f6', '#f59e0b'],
        xaxis: { categories: topUnits.map(u => u.kode_unit), labels: { style: { fontSize: '10px', fontWeight: 700 } } },
        yaxis: { min: 0, labels: { formatter: v => formatNum(v, 0) + ' J', style: { fontSize: '10px', fontWeight: 600 } } },
        legend: { position: 'top', horizontalAlign: 'right', fontSize: '11px', fontWeight: 600 }
    });

    // Chart 4: Status Donut
    renderApex('#chart-pbi-vra-cat-status-donut', {
        chart: { type: 'donut', height: 260 },
        series: [Number(data.operating_jam.toFixed(1)), Number(data.standby_jam.toFixed(1)), Number(data.downtime_jam.toFixed(1))],
        labels: ['Operating', 'Standby', 'Downtime'],
        colors: ['#10b981', '#f59e0b', '#ef4444'],
        plotOptions: { pie: { donut: { size: '65%' } } },
        legend: { position: 'bottom', fontSize: '11px', fontWeight: 600 }
    });

    // Table 1: Units Performance
    const unitsTbody = document.getElementById('table-pbi-vra-cat-units');
    if (unitsTbody) {
        if (data.units_performance.length === 0) {
            unitsTbody.innerHTML = '<tr><td colspan="10" class="text-center py-6 text-slate-400 font-medium">Tidak ada unit terdaftar dalam kategori ini.</td></tr>';
        } else {
            unitsTbody.innerHTML = data.units_performance.map(u => {
                return `
                    <tr class="hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800">
                        <td class="font-bold text-blue-600 dark:text-sky-400 px-3.5 py-2.5 whitespace-nowrap">${u.kode_unit}</td>
                        <td class="px-3.5 py-2.5 font-semibold text-slate-800 dark:text-slate-200">${u.nama_asset}</td>
                        <td class="px-3.5 py-2.5 text-slate-500 font-mono">${u.location}</td>
                        <td class="px-3.5 py-2.5 text-right font-mono font-bold text-blue-600">${formatNum(u.total_jam, 1)}</td>
                        <td class="px-3.5 py-2.5 text-right font-mono">${formatNum(u.total_km, 0)}</td>
                        <td class="px-3.5 py-2.5 text-right font-mono font-semibold">${formatNum(u.total_liter, 0)} L</td>
                        <td class="px-3.5 py-2.5 text-right font-mono text-emerald-600">${formatRp(u.fuel_cost)}</td>
                        <td class="px-3.5 py-2.5 text-right font-mono font-bold text-cyan-600">${u.km_per_liter.toFixed(2)}</td>
                        <td class="px-3.5 py-2.5 text-center">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.status_terkini === 'Operating' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}">
                                ${u.status_terkini}
                            </span>
                        </td>
                        <td class="px-3.5 py-2.5 text-center">
                            <button onclick="window.pns.drillToUnit('${u.kode_unit}')" class="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10.5px] transition inline-flex items-center gap-1 shadow-2xs cursor-pointer">
                                <span>Profil Unit</span>
                                <i class="ph-bold ph-arrow-right text-[10px]"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Table 2: Activity Logs
    const logsTbody = document.getElementById('table-pbi-vra-cat-logs');
    if (logsTbody) {
        let logs = data.recent_logs;
        if (catLogSearchQuery.trim() !== '') {
            const q = catLogSearchQuery.toLowerCase();
            logs = logs.filter(l => 
                (l.kode_unit && l.kode_unit.toLowerCase().includes(q)) ||
                (l.aktivitas && l.aktivitas.toLowerCase().includes(q)) ||
                (l.tanggal && l.tanggal.toLowerCase().includes(q))
            );
        }

        if (logs.length === 0) {
            logsTbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-slate-400 font-medium">Tidak ada log aktivitas yang cocok dengan pencarian.</td></tr>';
        } else {
            logsTbody.innerHTML = logs.slice(0, 50).map(l => {
                return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-xs border-b border-slate-100 dark:border-slate-800">
                        <td class="px-3.5 py-2 text-slate-500 font-mono">${l.tanggal || '-'}</td>
                        <td class="px-3.5 py-2 font-bold text-blue-600 dark:text-sky-400 whitespace-nowrap">${l.kode_unit}</td>
                        <td class="px-3.5 py-2 font-semibold text-slate-800 dark:text-slate-200">${l.aktivitas}</td>
                        <td class="px-3.5 py-2 text-center font-mono text-slate-500">${l.jam_awal || '00:00'} - ${l.jam_selesai || '00:00'}</td>
                        <td class="px-3.5 py-2 text-center font-mono text-slate-500">${l.hm_awal || 0} - ${l.hm_akhir || 0}</td>
                        <td class="px-3.5 py-2 text-right font-mono font-bold text-blue-600">${formatNum(l.jam_kerja_calc, 1)}</td>
                        <td class="px-3.5 py-2 text-right font-mono">${formatNum(l.km_used, 0)}</td>
                        <td class="px-3.5 py-2 text-center">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${l.status_kerja_calc === 'Operating' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}">
                                ${l.status_kerja_calc || 'Operating'}
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
}

// -------------------------------------------------------------
// SVG VECTOR GENERATOR FOR VRA VEHICLES
// -------------------------------------------------------------
export function getVehicleSvgByType(kategori = '', unitCode = '', isDark = false) {

    const k = (String(kategori || '') + ' ' + String(unitCode || '')).toUpperCase();
    const primaryColor = isDark ? '#38bdf8' : '#0284c7';
    const accentColor = isDark ? '#818cf8' : '#4f46e5';
    const wheelColor = isDark ? '#0f172a' : '#334155';

    if (k.includes('SPEEDBOAT') || k.includes('TUGBOAT') || k.includes('KAPAL') || k.includes('SB-') || k.includes('TB-')) {
        return `
            <svg class="w-full h-24" viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 50L45 72H165L185 45H20V50Z" fill="${primaryColor}" opacity="0.85"/>
                <path d="M50 45L65 25H125L140 45H50Z" fill="${accentColor}"/>
                <rect x="75" y="30" width="18" height="10" rx="2" fill="#e2e8f0"/>
                <rect x="100" y="30" width="18" height="10" rx="2" fill="#e2e8f0"/>
                <line x1="10" y1="78" x2="190" y2="78" stroke="#06b6d4" stroke-width="3" stroke-dasharray="8 4"/>
                <circle cx="150" cy="58" r="4" fill="#ffffff"/>
            </svg>
        `;
    }

    if (k.includes('EXCAVATOR') || k.includes('EXC-')) {
        return `
            <svg class="w-full h-24" viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="40" y="42" width="70" height="28" rx="6" fill="${primaryColor}"/>
                <rect x="50" y="24" width="35" height="20" rx="4" fill="${accentColor}"/>
                <rect x="55" y="28" width="16" height="12" rx="2" fill="#f8fafc"/>
                <rect x="30" y="68" width="90" height="14" rx="7" fill="${wheelColor}"/>
                <path d="M100 35L145 18L175 48L185 62" stroke="${primaryColor}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M175 48L185 62L168 65Z" fill="${wheelColor}"/>
            </svg>
        `;
    }

    if (k.includes('GENSET') || k.includes('POMPA') || k.includes('ALKON') || k.includes('GS-')) {
        return `
            <svg class="w-full h-24" viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="35" y="20" width="130" height="52" rx="8" fill="${primaryColor}" opacity="0.9"/>
                <rect x="45" y="30" width="40" height="32" rx="4" fill="${wheelColor}"/>
                <circle cx="65" cy="46" r="10" fill="${accentColor}"/>
                <line x1="100" y1="32" x2="150" y2="32" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
                <line x1="100" y1="42" x2="150" y2="42" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
                <line x1="100" y1="52" x2="135" y2="52" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
                <rect x="30" y="70" width="140" height="8" rx="4" fill="${wheelColor}"/>
            </svg>
        `;
    }

    if (k.includes('MOTOR') || k.includes('MTR-') || k.includes('SEPEDA')) {
        return `
            <svg class="w-full h-24" viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="62" r="16" stroke="${wheelColor}" stroke-width="6" fill="none"/>
                <circle cx="150" cy="62" r="16" stroke="${wheelColor}" stroke-width="6" fill="none"/>
                <path d="M50 62L85 45L115 45L150 62" stroke="${primaryColor}" stroke-width="5" stroke-linecap="round"/>
                <path d="M85 45L100 28L130 28" stroke="${accentColor}" stroke-width="4" stroke-linecap="round"/>
                <rect x="80" y="40" width="30" height="15" rx="3" fill="${primaryColor}"/>
            </svg>
        `;
    }

    if (k.includes('TRUCK') || k.includes('DUMP') || k.includes('TANGKI') || k.includes('HINO') || k.includes('FUSO') || k.includes('DT-')) {
        return `
            <svg class="w-full h-24" viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M25 32H105V64H25V32Z" fill="${accentColor}"/>
                <path d="M105 40H145L165 52V64H105V40Z" fill="${primaryColor}"/>
                <rect x="120" y="44" width="22" height="12" rx="2" fill="#f8fafc"/>
                <circle cx="55" cy="68" r="12" fill="${wheelColor}"/>
                <circle cx="55" cy="68" r="5" fill="#e2e8f0"/>
                <circle cx="85" cy="68" r="12" fill="${wheelColor}"/>
                <circle cx="85" cy="68" r="5" fill="#e2e8f0"/>
                <circle cx="145" cy="68" r="12" fill="${wheelColor}"/>
                <circle cx="145" cy="68" r="5" fill="#e2e8f0"/>
            </svg>
        `;
    }

    if (k.includes('KNAPSACK') || k.includes('POTONG') || k.includes('RUMPUT') || k.includes('MPR') || k.includes('BRUSH') || k.includes('MOWER')) {
        return `
            <svg class="w-full h-24" viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Backpack Engine & Tank -->
                <rect x="35" y="24" width="34" height="42" rx="7" fill="${primaryColor}"/>
                <rect x="42" y="18" width="14" height="7" rx="3" fill="${accentColor}"/>
                <rect x="31" y="30" width="5" height="30" rx="2.5" fill="${wheelColor}"/>
                <circle cx="52" cy="45" r="9" fill="${accentColor}" opacity="0.9"/>
                <circle cx="52" cy="45" r="4" fill="#ffffff"/>
                <!-- Flexible Drive Shaft Tube -->
                <path d="M69 56 C 85 68, 105 52, 130 38 L 172 16" stroke="${wheelColor}" stroke-width="4" stroke-linecap="round"/>
                <!-- Handle Bar & Throttle -->
                <path d="M115 46 L 122 36 L 132 42" stroke="${primaryColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                <rect x="119" y="32" width="6" height="5" rx="1.5" fill="#f59e0b"/>
                <!-- Shield & Cutting Blade -->
                <path d="M165 20 L 178 12 L 184 24 Z" fill="#ef4444"/>
                <ellipse cx="176" cy="17" rx="16" ry="5" transform="rotate(-30 176 17)" fill="#94a3b8" stroke="${primaryColor}" stroke-width="2"/>
                <circle cx="176" cy="17" r="3" fill="#ffffff"/>
                <!-- Grass blades detail -->
                <path d="M158 32 L 162 24 M 168 34 L 173 23 M 179 33 L 182 25" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
        `;
    }

    if (k.includes('TRAKTOR') || k.includes('TRACTOR') || k.includes('TRK-')) {
        return `
            <svg class="w-full h-24" viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Hood & Engine Body -->
                <path d="M50 38 H 115 V 60 H 50 Z" fill="${primaryColor}"/>
                <path d="M100 20 H 135 V 50 H 100 Z" fill="${accentColor}"/>
                <rect x="105" y="24" width="22" height="18" rx="2" fill="#f8fafc"/>
                <path d="M96 14 H 140 V 20 H 96 Z" fill="${wheelColor}"/>
                <!-- Exhaust pipe -->
                <rect x="62" y="16" width="5" height="22" rx="2" fill="${wheelColor}"/>
                <path d="M64 16 L 68 12" stroke="${wheelColor}" stroke-width="3" stroke-linecap="round"/>
                <!-- Front small wheel -->
                <circle cx="60" cy="62" r="14" fill="${wheelColor}"/>
                <circle cx="60" cy="62" r="6" fill="#e2e8f0"/>
                <!-- Rear huge tractor wheel -->
                <circle cx="140" cy="54" r="24" fill="${wheelColor}"/>
                <circle cx="140" cy="54" r="12" fill="${accentColor}"/>
                <circle cx="140" cy="54" r="5" fill="#ffffff"/>
            </svg>
        `;
    }

    if (k.includes('FORKLIFT') || k.includes('FL-')) {
        return `
            <svg class="w-full h-24" viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Mast & forks -->
                <rect x="145" y="15" width="6" height="55" rx="2" fill="${wheelColor}"/>
                <rect x="151" y="55" width="28" height="5" rx="2" fill="${wheelColor}"/>
                <!-- Chassis & Cabin -->
                <path d="M50 45 H 142 V 64 H 50 Z" fill="${primaryColor}"/>
                <path d="M75 22 H 125 V 45 H 75 Z" fill="${accentColor}"/>
                <rect x="82" y="26" width="35" height="15" rx="2" fill="#f8fafc"/>
                <!-- Counterweight -->
                <path d="M42 36 H 58 V 64 H 42 Z" fill="#f59e0b"/>
                <!-- Wheels -->
                <circle cx="68" cy="66" r="12" fill="${wheelColor}"/>
                <circle cx="68" cy="66" r="5" fill="#e2e8f0"/>
                <circle cx="132" cy="66" r="12" fill="${wheelColor}"/>
                <circle cx="132" cy="66" r="5" fill="#e2e8f0"/>
            </svg>
        `;
    }

    // Default Passenger Car / Mobil / Avanza / Hilux
    return `
        <svg class="w-full h-24" viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M30 52L55 32H135L165 52H175V66H25V52H30Z" fill="${primaryColor}"/>
            <path d="M60 36L72 50H100V36H60Z" fill="#f8fafc"/>
            <path d="M106 36V50H130L122 36H106Z" fill="#f8fafc"/>
            <circle cx="60" cy="66" r="12" fill="${wheelColor}"/>
            <circle cx="60" cy="66" r="5" fill="#e2e8f0"/>
            <circle cx="140" cy="66" r="12" fill="${wheelColor}"/>
            <circle cx="140" cy="66" r="5" fill="#e2e8f0"/>
        </svg>
    `;
}

// -------------------------------------------------------------
let currentVra4TableTab = 'daily';
function switchVra4TableTab(tab) {
    currentVra4TableTab = tab;
    const btnDaily = document.getElementById('btn-vra4-tab-daily');
    const btnSummary = document.getElementById('btn-vra4-tab-summary');
    const cDaily = document.getElementById('container-pbi-vra4-daily');
    const cSummary = document.getElementById('container-pbi-vra4-summary');
    
    if (tab === 'daily') {
        if (btnDaily) btnDaily.className = 'px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-600 text-white shadow-2xs transition cursor-pointer';
        if (btnSummary) btnSummary.className = 'px-3 py-1.5 text-xs font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition cursor-pointer';
        if (cDaily) cDaily.classList.remove('hidden');
        if (cSummary) cSummary.classList.add('hidden');
    } else {
        if (btnSummary) btnSummary.className = 'px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-600 text-white shadow-2xs transition cursor-pointer';
        if (btnDaily) btnDaily.className = 'px-3 py-1.5 text-xs font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition cursor-pointer';
        if (cDaily) cDaily.classList.add('hidden');
        if (cSummary) cSummary.classList.remove('hidden');
    }
}

function onVra4UnitChanged(code) {
    const sel = document.getElementById('slicer-vra4-unit-select');
    if (sel) {
        sel.value = code;
    }
    if (pbiData.cache) {
        renderVra4(pbiData.cache.assets, pbiData.cache.vra, pbiData.cache.fuel, pbiData.cache.maint);
    }
}

function prevVra4Unit() {
    const sel = document.getElementById('slicer-vra4-unit-select');
    if (!sel || sel.options.length <= 1) return;
    const idx = sel.selectedIndex;
    if (idx > 0) {
        sel.selectedIndex = idx - 1;
    } else {
        sel.selectedIndex = sel.options.length - 1;
    }
    onVra4UnitChanged(sel.value);
}

function nextVra4Unit() {
    const sel = document.getElementById('slicer-vra4-unit-select');
    if (!sel || sel.options.length <= 1) return;
    const idx = sel.selectedIndex;
    if (idx < sel.options.length - 1) {
        sel.selectedIndex = idx + 1;
    } else {
        sel.selectedIndex = 0;
    }
    onVra4UnitChanged(sel.value);
}

window.pns = window.pns || {};
window.pns.switchVra4TableTab = switchVra4TableTab;
window.pns.onVra4UnitChanged = onVra4UnitChanged;
window.pns.onVra4CatPickerChange = onVra4CatPickerChange;
window.pns.prevVra4Unit = prevVra4Unit;
window.pns.nextVra4Unit = nextVra4Unit;
window.switchVra4TableTab = switchVra4TableTab;
window.prevVra4Unit = prevVra4Unit;
window.nextVra4Unit = nextVra4Unit;
window.onVra4UnitChanged = onVra4UnitChanged;
window.onVra4CatPickerChange = onVra4CatPickerChange;

// -------------------------------------------------------------
// ENTERPRISE COMPOSITE DECISION CARDS (PROFIL UNIT VIEW-VRA-4)
// -------------------------------------------------------------
function renderVra4CompositeDecisionCards(unit, unitVraList, summaryData, fuel, maint, isDark) {
    if (!unit) return;
    const selectedUnitCode = unit.kode_unit;

    // -----------------------------------------------------------------
    // CARD 1: UNIT HEALTH SCORECARD
    // -----------------------------------------------------------------
    const utilRatio = Math.max(0, Math.min(1, (unit.effective_jam_kerja || 85) / 100));
    const totalDays = Math.max(1, (unit.hari_aktivitas || unit.hari_aktif || 0) + (unit.hari_breakdown || 0));
    const availRatio = Math.max(0.1, Math.min(1, (unit.hari_aktivitas || unit.hari_aktif || 0) / totalDays));

    const mtbfHours = (unit.jumlah_service > 0)
        ? Math.max(0, (unit.total_operating_jam || 0) / unit.jumlah_service)
        : (unit.total_operating_jam || 150);
    const mtbfNorm = Math.max(0.1, Math.min(1, mtbfHours / 200));

    let fuelNorm = 0.8;
    if (unit.km_per_lt > 0) {
        fuelNorm = Math.max(0.15, Math.min(1, unit.km_per_lt / 9));
    } else if (unit.liter_per_hm > 0) {
        fuelNorm = Math.max(0.15, Math.min(1, 1 - (unit.liter_per_hm / 35)));
    }
    const healthScore = Math.round(((utilRatio + availRatio + mtbfNorm + fuelNorm) / 4) * 100);

    const healthBadgeEl = document.getElementById('pbi-vra4-badge-health');
    if (healthBadgeEl) {
        if (healthScore >= 70) {
            healthBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
            healthBadgeEl.innerHTML = '<i class="ph-bold ph-check-circle mr-1"></i>Sehat';
        } else if (healthScore >= 45) {
            healthBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800';
            healthBadgeEl.innerHTML = '<i class="ph-bold ph-warning-circle mr-1"></i>Perlu Perhatian';
        } else {
            healthBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800';
            healthBadgeEl.innerHTML = '<i class="ph-bold ph-x-circle mr-1"></i>Kritis';
        }
    }

    renderSvgDonut('#pbi-vra4-donut-util', utilRatio, {
        size: 150,
        stroke: 14,
        fg: healthScore >= 70 ? '#10b981' : (healthScore >= 45 ? '#f59e0b' : '#f43f5e'),
        bg: isDark ? '#1e293b' : '#e0f2fe',
        centerText: Math.round(utilRatio * 100) + '%'
    });

    renderSvgRadarChart('#pbi-vra4-radar-health', ['Util', 'Avail', 'MTBF', 'Fuel'], [utilRatio, availRatio, mtbfNorm, fuelNorm], {
        size: 180,
        color: healthScore >= 70 ? '#10b981' : (healthScore >= 45 ? '#f59e0b' : '#f43f5e'),
        fillOpacity: 0.25
    });

    setElText('pbi-vra4-val-util', (utilRatio * 100).toFixed(1) + '%');
    setElText('pbi-vra4-val-avail', (availRatio * 100).toFixed(1) + '%');
    setElHtml('pbi-vra4-val-healthscore', `<span class="${healthScore >= 70 ? 'text-emerald-600 dark:text-emerald-400' : (healthScore >= 45 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')} font-black">${healthScore}/100</span>`);
    setElText('pbi-vra4-val-mtbf', `${Math.round(mtbfHours)} jam`);
    setElText('pbi-vra4-val-fueleff', unit.km_per_lt > 0 ? `${unit.km_per_lt.toFixed(1)} KM/L` : (unit.liter_per_hm > 0 ? `${unit.liter_per_hm.toFixed(1)} L/H` : `${Math.round(fuelNorm * 100)}%`));

    // Monthly utilization trend for Sparkline
    const monthlyOpsMap = new Map();
    (unitVraList || []).forEach(v => {
        if (v.tanggal && v.tanggal.length >= 7) {
            const ym = v.tanggal.substring(0, 7);
            const isAktif = (v.aktif === undefined || v.aktif === null || Number(v.aktif) === 1 || String(v.aktif) === '1');
            if (isAktif) {
                const h = Number(v.jam_kerja_calc || v.durasi || 0);
                monthlyOpsMap.set(ym, (monthlyOpsMap.get(ym) || 0) + h);
            }
        }
    });
    const sortedMonths = Array.from(monthlyOpsMap.keys()).sort();
    let utilSparkData = sortedMonths.slice(-6).map(m => monthlyOpsMap.get(m) || 0);
    if (utilSparkData.length < 2) {
        const baseH = (unit.total_operating_jam || 100) / 6;
        utilSparkData = [baseH * 0.8, baseH * 0.9, baseH * 1.1, baseH * 0.95, baseH * 1.05, baseH];
    }
    renderSvgSparkline('#pbi-vra4-spark-util', utilSparkData, { color: '#0284c7', width: 120, height: 36 });

    const recoHealthEl = document.getElementById('pbi-vra4-reco-health');
    if (recoHealthEl) {
        if (healthScore >= 70) {
            recoHealthEl.className = 'p-2.5 rounded-xl text-[11px] leading-relaxed border font-medium bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';
            recoHealthEl.innerHTML = `✅ <b>Kondisi Prima:</b> Utilisasi (${(utilRatio * 100).toFixed(0)}%) dan availability (${(availRatio * 100).toFixed(0)}%) optimal. Jadwal servis preventif berjalan baik tanpa catatan kerusakan kritis.`;
        } else if (healthScore >= 45) {
            recoHealthEl.className = 'p-2.5 rounded-xl text-[11px] leading-relaxed border font-medium bg-amber-50/70 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
            recoHealthEl.innerHTML = `⚠️ <b>Perlu Perhatian:</b> Terdeteksi fluktuasi operasional atau ${unit.hari_breakdown || 0} hari breakdown. Jadwalkan inspeksi sistem pendingin, transmisi, & filter berkala.`;
        } else {
            recoHealthEl.className = 'p-2.5 rounded-xl text-[11px] leading-relaxed border font-medium bg-rose-50/70 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60';
            recoHealthEl.innerHTML = `🛑 <b>Intervensi Diperlukan:</b> Health Score di bawah batas toleransi (${healthScore}/100) dengan MTBF rendah. Prioritaskan audit mekanikal komprehensif atau penjadwalan overhaul.`;
        }
    }

    // -----------------------------------------------------------------
    // CARD 2: ASSET RISK & LIFECYCLE SCORECARD
    // -----------------------------------------------------------------
    const usefulLifeMonths = Math.max(1, (unit.standar_umur_tahun || 5) * 12);
    const ageNorm = Math.min(1, Math.max(0.05, (unit.umur_pakai_bulan || 1) / usefulLifeMonths));
    const maintRatio = (unit.cost_maintenance || 0) / Math.max(1, unit.harga_perolehan || 1);
    const costNorm = Math.min(1, Math.max(0.05, maintRatio / 0.7)); // 70% of price is threshold 1.0
    const downNorm = Math.min(1, Math.max(0.05, (unit.hari_breakdown || 0) / totalDays));
    const critNorm = Math.min(1, Math.max(0.15, (unit.total_cost_per_km > 12000 || unit.hari_breakdown > 4) ? 0.85 : 0.35));
    const riskScore = Math.round(((ageNorm + costNorm + downNorm + critNorm) / 4) * 100);

    const riskBadgeEl = document.getElementById('pbi-vra4-badge-risk');
    if (riskBadgeEl) {
        if (riskScore >= 65) {
            riskBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800';
            riskBadgeEl.innerHTML = '<i class="ph-bold ph-shield-warning mr-1"></i>Risiko Tinggi';
        } else if (riskScore >= 40) {
            riskBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800';
            riskBadgeEl.innerHTML = '<i class="ph-bold ph-shield mr-1"></i>Risiko Sedang';
        } else {
            riskBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
            riskBadgeEl.innerHTML = '<i class="ph-bold ph-shield-check mr-1"></i>Risiko Rendah';
        }
    }

    renderSvgRadarChart('#pbi-vra4-radar-risk', ['Umur', 'Biaya', 'Down', 'Kritikal'], [ageNorm, costNorm, downNorm, critNorm], {
        size: 180,
        color: riskScore >= 65 ? '#f43f5e' : (riskScore >= 40 ? '#f59e0b' : '#10b981'),
        fillOpacity: 0.25
    });

    setElHtml('pbi-vra4-val-riskscore', `<span class="${riskScore >= 65 ? 'text-rose-600 dark:text-rose-400' : (riskScore >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')} font-black">${riskScore}/100</span>`);
    setElText('pbi-vra4-risk-issue-1', `${(maintRatio * 100).toFixed(1)}% Nilai Aset`);
    setElText('pbi-vra4-risk-issue-2', `${unit.umur_pakai_bulan || 0}/${usefulLifeMonths} Bln (${Math.round(ageNorm * 100)}%)`);
    setElText('pbi-vra4-risk-issue-3', `${unit.hari_breakdown || 0} Hari Breakdown`);
    setElText('pbi-vra4-risk-bookval', formatRp(unit.nilai_buku || 0));
    setElText('pbi-vra4-risk-totmaint', formatRp(unit.cost_maintenance || 0));
    setElText('pbi-vra4-risk-remainage', `${unit.sisa_umur_bulan || 0} bln`);

    const recoRiskEl = document.getElementById('pbi-vra4-reco-risk');
    if (recoRiskEl) {
        if (maintRatio >= 0.70 || ageNorm >= 0.90) {
            recoRiskEl.className = 'p-2.5 rounded-xl text-[11px] leading-relaxed border font-medium bg-rose-50/70 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60';
            recoRiskEl.innerHTML = `🛑 <b>Rekomendasi Finansial: Evaluasi Replace / Disposisi.</b> Akumulasi biaya servis (${formatRp(unit.cost_maintenance)}) telah melampaui ambang batas ekonomis (${(maintRatio * 100).toFixed(0)}% harga perolehan). Direkomendasikan evaluasi peremajaan unit.`;
        } else if (riskScore >= 40) {
            recoRiskEl.className = 'p-2.5 rounded-xl text-[11px] leading-relaxed border font-medium bg-amber-50/70 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
            recoRiskEl.innerHTML = `⚠️ <b>Rekomendasi: Lanjutkan Operasional Terkendali.</b> Pertahankan jadwal perbaikan preventif ketat, batasi pekerjaan beban berat (heavy load) ekstrem guna mencegah lonjakan biaya bengkel.`;
        } else {
            recoRiskEl.className = 'p-2.5 rounded-xl text-[11px] leading-relaxed border font-medium bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';
            recoRiskEl.innerHTML = `✅ <b>Rekomendasi Finansial: Layak Operasi Penuh.</b> Rasio beban pemeliharaan aman (${(maintRatio * 100).toFixed(1)}%), sisa umur manfaat ekonomis masih memadai (${unit.sisa_umur_bulan || 0} bulan).`;
        }
    }

    // -----------------------------------------------------------------
    // CARD 3: 14-DAY ACTIVITY & FUEL ANOMALY TRACKER
    // -----------------------------------------------------------------
    const activityDatesMap = new Map();
    (unitVraList || []).forEach(v => {
        if (v.tanggal) {
            const d = v.tanggal;
            if (!activityDatesMap.has(d)) {
                activityDatesMap.set(d, { date: d, running_jam: 0, downtime_jam: 0, is_downtime: false, status: 'Standby' });
            }
            const item = activityDatesMap.get(d);
            const isAktif = (v.aktif === undefined || v.aktif === null || Number(v.aktif) === 1 || String(v.aktif) === '1');
            if (isAktif) {
                const h = Number(v.jam_kerja_calc || v.durasi || 0);
                const act = (v.aktivitas || '').toLowerCase();
                const isBD = act.includes('breakdown') || act.includes('rusak') || v.is_downtime;
                const isST = act.includes('standby') || act.includes('tunggu');
                if (isBD) {
                    item.downtime_jam += h;
                    item.is_downtime = true;
                    item.status = 'Breakdown';
                } else if (isST) {
                    if (item.status !== 'Breakdown') item.status = 'Standby';
                } else {
                    item.running_jam += h;
                    if (item.status !== 'Breakdown') item.status = 'Operating';
                }
            }
        }
    });

    const sortedActivityDates = Array.from(activityDatesMap.keys()).sort();
    let last14Days = sortedActivityDates.slice(-14).map(d => activityDatesMap.get(d));
    while (last14Days.length < 14) {
        last14Days.unshift({ date: `H-${14 - last14Days.length}`, running_jam: 0, downtime_jam: 0, status: 'Standby' });
    }

    renderSvgCalendarHeatmap('#pbi-vra4-calendar-heatmap', last14Days, {
        cols: 7,
        cellSize: 22,
        gap: 4,
        days: 14
    });

    const catGroup = unit.kode_kategori || unit.sub_kategori || 'VRA';
    const catUnits = summaryData.filter(u => (u.kode_kategori || u.sub_kategori) === catGroup);
    const catUnitsWithFuel = catUnits.filter(u => u.km_per_lt > 0);
    const catAvgKmLt = catUnitsWithFuel.length > 0
        ? (catUnitsWithFuel.reduce((acc, u) => acc + u.km_per_lt, 0) / catUnitsWithFuel.length)
        : (unit.km_per_lt || 5.5);

    let fuelDevPct = 0;
    if (unit.km_per_lt > 0 && catAvgKmLt > 0) {
        fuelDevPct = ((catAvgKmLt - unit.km_per_lt) / catAvgKmLt) * 100;
    }

    const rawFuel = fuel || [];
    const isAlreadyFiltered = rawFuel.length > 0 && rawFuel.length < 500 && String(rawFuel[0].no_asset_manual || rawFuel[0].kode_unit || '').trim() === selectedUnitCode;
    const unitFuelRecords = (isAlreadyFiltered ? rawFuel.slice() : rawFuel.filter(f => String(f.no_asset_manual || f.kode_unit || '').trim() === selectedUnitCode))
        .sort((a, b) => new Date(a.tanggal_bkb || a.tanggal || 0) - new Date(b.tanggal_bkb || b.tanggal || 0));
    let fuelSparkValues = unitFuelRecords.slice(-8).map(f => Number(f.jumlah_bkb_fix) || 0).filter(v => v > 0);
    if (fuelSparkValues.length < 2) {
        fuelSparkValues = [35, 42, 38, 48, 40, 46];
    }
    renderSvgSparkline('#pbi-vra4-spark-fuelkm', fuelSparkValues, { color: '#f59e0b', width: 120, height: 36 });

    const fuelBadgeEl = document.getElementById('pbi-vra4-badge-fuel');
    if (fuelBadgeEl) {
        if (fuelDevPct > 15) {
            fuelBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800';
            fuelBadgeEl.innerHTML = '<i class="ph-bold ph-warning mr-1"></i>Anomali Boros';
        } else if (fuelDevPct < -5) {
            fuelBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
            fuelBadgeEl.innerHTML = '<i class="ph-bold ph-trend-up mr-1"></i>Sangat Efisien';
        } else {
            fuelBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
            fuelBadgeEl.innerHTML = '<i class="ph-bold ph-check mr-1"></i>Normal';
        }
    }

    setElText('pbi-vra4-fuel-avg-ratio', unit.km_per_lt > 0 ? `${unit.km_per_lt.toFixed(2)} KM/L (Avg: ${catAvgKmLt.toFixed(1)})` : (unit.liter_per_hm > 0 ? `${unit.liter_per_hm.toFixed(2)} L/Jam` : '-'));

    const devEl = document.getElementById('pbi-vra4-fuel-deviation');
    if (devEl) {
        if (fuelDevPct > 15) {
            devEl.innerHTML = `<span class="text-rose-600 dark:text-rose-400 font-bold">+${fuelDevPct.toFixed(1)}% (Boros)</span>`;
        } else if (fuelDevPct > 0) {
            devEl.innerHTML = `<span class="text-amber-600 dark:text-amber-400 font-bold">+${fuelDevPct.toFixed(1)}% (Di atas Avg)</span>`;
        } else {
            devEl.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-bold">${fuelDevPct.toFixed(1)}% (Optimal)</span>`;
        }
    }

    const recoFuelEl = document.getElementById('pbi-vra4-reco-fuel');
    if (recoFuelEl) {
        if (fuelDevPct > 10) {
            const costImpact = Math.round((unit.cost_petrol || 0) * (fuelDevPct / 100));
            recoFuelEl.className = 'p-2.5 rounded-xl text-[11px] leading-relaxed border font-medium bg-amber-50/70 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
            recoFuelEl.innerHTML = `⚠️ <b>Estimasi Dampak Deviasi:</b> Konsumsi BBM lebih boros +${fuelDevPct.toFixed(1)}% vs baseline kategori. Estimasi beban pembengkakan biaya BBM: <b>${formatRp(costImpact)}</b>. Disarankan pengecekan nozzle & filter solar.`;
        } else {
            recoFuelEl.className = 'p-2.5 rounded-xl text-[11px] leading-relaxed border font-medium bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';
            recoFuelEl.innerHTML = `✅ <b>Konsumsi BBM Terkendali:</b> Efisiensi konsumsi bahan bakar sesuai dengan baseline standar operasional kategori <b>${catGroup}</b>. Tidak ditemukan kebocoran kuota BBM.`;
        }
    }

    // -----------------------------------------------------------------
    // CARD 4: CROSS-DOMAIN UNIT 360° SYNTHESIS
    // -----------------------------------------------------------------
    const miniDonutsData = [
        {
            domain: 'VRA',
            pct: utilRatio,
            color: '#0284c7',
            bg: isDark ? '#1e293b' : '#e0f2fe',
            centerText: Math.round(utilRatio * 100) + '%',
            subText: `${Math.round(unit.total_operating_jam || 0)} Jam`
        },
        {
            domain: 'MAINT',
            pct: Math.min(1, Math.max(0.1, (unit.jumlah_service || 0) / 8)),
            color: '#f43f5e',
            bg: isDark ? '#1e293b' : '#ffe4e6',
            centerText: `${unit.jumlah_service || 0}x`,
            subText: formatRp(unit.cost_maintenance || 0)
        },
        {
            domain: 'FUEL',
            pct: Math.min(1, Math.max(0.1, fuelNorm)),
            color: '#10b981',
            bg: isDark ? '#1e293b' : '#d1fae5',
            centerText: unit.km_per_lt > 0 ? unit.km_per_lt.toFixed(1) : Math.round(fuelNorm * 100) + '%',
            subText: `${formatNum(unit.total_liter || 0)} L`
        }
    ];
    renderSvgMiniDonutGroup('#pbi-vra4-minidonuts-360', miniDonutsData, { size: 76, stroke: 8 });

    const problemScore = Math.round(((1 - utilRatio) * 0.4 + (costNorm) * 0.35 + (downNorm) * 0.25) * 100);

    const crossBadgeEl = document.getElementById('pbi-vra4-badge-crossdomain');
    if (crossBadgeEl) {
        if (problemScore > 50) {
            crossBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800';
            crossBadgeEl.innerHTML = '<i class="ph-bold ph-warning mr-1"></i>Butuh Intervensi';
        } else if (problemScore > 30) {
            crossBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800';
            crossBadgeEl.innerHTML = '<i class="ph-bold ph-info mr-1"></i>Perhatian Sedang';
        } else {
            crossBadgeEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-black shadow-2xs bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
            crossBadgeEl.innerHTML = '<i class="ph-bold ph-check mr-1"></i>Harmonis / Sehat';
        }
    }

    setElHtml('pbi-vra4-val-problemscore', `<span class="${problemScore > 50 ? 'text-rose-600 dark:text-rose-400' : (problemScore > 30 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')} font-black">${problemScore}/100</span>`);

    const recoCrossEl = document.getElementById('pbi-vra4-reco-crossdomain');
    if (recoCrossEl) {
        let crossNarrative = '';
        if (unit.cost_maintenance > unit.cost_petrol && unit.hari_breakdown > 0) {
            crossNarrative = `💡 <b>Sintesis Lintas Modul:</b> Biaya servis (${formatRp(unit.cost_maintenance)}) melampaui biaya BBM (${formatRp(unit.cost_petrol)}) akibat ${unit.hari_breakdown} hari downtime. Korelasi menunjukkan unit rentan breakdown saat beban operasional tinggi; butuh mitigasi servis preventif terjadwal.`;
        } else if (utilRatio > 0.8 && unit.cost_maintenance < unit.cost_petrol) {
            crossNarrative = `💡 <b>Sintesis Lintas Modul:</b> Sinergi operasional sangat baik. Jam kerja produktif tinggi (${formatNum(unit.total_operating_jam, 0)} Jam) diimbangi biaya pemeliharaan yang efisien (${formatRp(unit.cost_maintenance)}), menghasilkan Cost/KM optimal (${formatRp(unit.total_cost_per_km)}/KM).`;
        } else {
            crossNarrative = `💡 <b>Sintesis Lintas Modul:</b> Unit membukukan total TCO ${formatRp(unit.total_cost)} (BBM: ${formatRp(unit.cost_petrol)}, Maint: ${formatRp(unit.cost_maintenance)}). Pola korelasi operasional dan biaya berada pada standar wajar armada.`;
        }
        recoCrossEl.className = 'p-2.5 rounded-xl text-[11px] leading-relaxed border font-medium bg-indigo-50/70 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60';
        recoCrossEl.innerHTML = crossNarrative;
    }
}

// -------------------------------------------------------------
function getUnitIndexMaps(vra, fuel, maint) {
    if (!pbiData.unitIndexMaps || pbiData.unitIndexMaps._vra !== vra || pbiData.unitIndexMaps._fuel !== fuel || pbiData.unitIndexMaps._maint !== maint) {
        const vraByUnit = new Map();
        (vra || []).forEach(v => {
            const u = String(v.kode_unit || '').trim();
            if (!u) return;
            if (!vraByUnit.has(u)) vraByUnit.set(u, []);
            vraByUnit.get(u).push(v);
        });

        const fuelByUnit = new Map();
        (fuel || []).forEach(f => {
            const u = String(f.no_asset_manual || f.kode_unit || '').trim();
            if (!u) return;
            if (!fuelByUnit.has(u)) fuelByUnit.set(u, []);
            fuelByUnit.get(u).push(f);
        });

        const maintByUnit = new Map();
        (maint || []).forEach(m => {
            const u = String(m.kode_unit || m.kode_asset || '').trim();
            if (!u) return;
            if (!maintByUnit.has(u)) maintByUnit.set(u, []);
            maintByUnit.get(u).push(m);
        });

        pbiData.unitIndexMaps = {
            _vra: vra,
            _fuel: fuel,
            _maint: maint,
            vraByUnit,
            fuelByUnit,
            maintByUnit
        };
    }
    return pbiData.unitIndexMaps;
}

// VIEW 4: PROFIL UNIT (TCO 360° & LIFETIME)
// -------------------------------------------------------------
function renderVra4(assets, vra, fuel, maint) {
    if (!pbiData.vra4SummaryCache) {
        pbiData.vra4SummaryCache = measureUnitTcoLifetimeSummary(assets, vra, fuel, maint);
    }
    const summaryData = pbiData.vra4SummaryCache;
    if (!summaryData || summaryData.length === 0) return;

    // 1. Populate Category Picker for Profil Unit (populate once)
    const catPicker = document.getElementById('slicer-vra4-cat-picker');
    if (catPicker) {
        if (catPicker.dataset.populated !== 'true') {
            const distinctCats = [...new Set(summaryData.map(u => u.kode_kategori || u.sub_kategori || 'VRA UNIT').filter(Boolean))].sort();
            let catHtml = `<option value="ALL">Semua Tipe (${summaryData.length})</option>`;
            distinctCats.forEach(c => {
                const cnt = summaryData.filter(u => (u.kode_kategori || u.sub_kategori || 'VRA UNIT') === c).length;
                const isSel = (c === vra4CatFilter) ? 'selected' : '';
                catHtml += `<option value="${c}" ${isSel}>${c} (${cnt})</option>`;
            });
            catPicker.innerHTML = catHtml;
            catPicker.dataset.populated = 'true';
        }
        catPicker.value = vra4CatFilter;
    }

    // 2. Filter available units by Category Filter
    const visibleUnits = (vra4CatFilter === 'ALL')
        ? summaryData
        : summaryData.filter(u => (u.kode_kategori || u.sub_kategori || 'VRA UNIT') === vra4CatFilter);

    // 3. Group and populate Unit Select with Optgroups (only rebuild when category filter changes or empty)
    const unitSelect = document.getElementById('slicer-vra4-unit-select');
    let selectedUnitCode = summaryData[0]?.kode_unit;
    if (unitSelect) {
        const currentVal = unitSelect.value;
        const existsInVisible = visibleUnits.some(u => u.kode_unit === currentVal);
        const targetUnitCode = existsInVisible ? currentVal : (visibleUnits[0]?.kode_unit || summaryData[0].kode_unit);

        if (unitSelect.dataset.lastCat !== vra4CatFilter || unitSelect.children.length === 0) {
            const grouped = new Map();
            visibleUnits.forEach(u => {
                const cat = u.kode_kategori || u.sub_kategori || 'VRA UNIT';
                if (!grouped.has(cat)) grouped.set(cat, []);
                grouped.get(cat).push(u);
            });

            let uHtml = '';
            grouped.forEach((unitsInCat, catName) => {
                uHtml += `<optgroup label="─── ${catName} (${unitsInCat.length}) ───">`;
                unitsInCat.forEach(u => {
                    const isSel = (u.kode_unit === targetUnitCode) ? 'selected' : '';
                    const label = u.nama_asset_detail || u.nama_asset || u.kode_unit;
                    uHtml += `<option value="${u.kode_unit}" ${isSel}>${u.kode_unit} - ${label}</option>`;
                });
                uHtml += `</optgroup>`;
            });
            unitSelect.innerHTML = uHtml;
            unitSelect.dataset.lastCat = vra4CatFilter;
        }
        unitSelect.value = targetUnitCode;
        selectedUnitCode = targetUnitCode;
    } else {
        selectedUnitCode = summaryData[0].kode_unit;
    }
    const unit = summaryData.find(u => u.kode_unit === selectedUnitCode) || summaryData[0];
    const isDark = document.documentElement.classList.contains('dark');

    setElText('pbi-vra4-unit-title', unit.kode_unit);
    setElText('pbi-vra4-unit-subtitle', `Kategori: ${unit.sub_kategori || unit.kode_kategori || 'VRA UNIT'} | Lokasi: ${unit.location || unit.location_id || 'CENTRAL'}`);
    setElText('pbi-vra4-chip-kategori', unit.kode_kategori || 'VRA UNIT');
    setElText('pbi-vra4-chip-lokasi', unit.location || unit.location_id || 'CENTRAL');
    setElText('pbi-vra4-chip-status', unit.kondisi || 'Good Condition');
    setElText('pbi-vra4-tco-total', formatRp(unit.total_cost));
    setElText('pbi-vra4-badge-petrol', formatRp(unit.cost_petrol));
    setElText('pbi-vra4-badge-maint', formatRp(unit.cost_maintenance));
    setElText('pbi-vra4-badge-costkm', unit.total_cost_per_km > 0 ? formatRp(unit.total_cost_per_km) + '/KM' : 'Rp 0/KM');

    // Populate Dossier Spesifikasi & Intelijen Operasional Unit
    setElText('pbi-vra4-spec-nama', unit.nama_asset_detail || unit.nama_asset || '-');
    setElText('pbi-vra4-spec-nopol', unit.nomor_polisi_rangka || unit.nopol || '-');
    setElText('pbi-vra4-spec-tgl-usia', `${unit.tanggal_perolehan || '-'} (${unit.umur_pakai_bulan || 0} bln)`);
    setElText('pbi-vra4-spec-pic', unit.pic_nama || '-');
    setElText('pbi-vra4-spec-section', unit.penanggungjawab_section || '-');
    setElText('pbi-vra4-spec-pemakaian', unit.status_pemakaian || 'Aktif');
    setElText('pbi-vra4-spec-nilaibuku', formatRp(unit.nilai_buku || 0));
    setElText('pbi-vra4-spec-penyusutan', formatRp(unit.total_penyusutan || 0));
    setElText('pbi-vra4-spec-kondisi', unit.kondisi || 'Good Condition');
    setElText('pbi-vra4-spec-rasiobbm', unit.km_per_lt > 0 ? (formatNum(unit.km_per_lt, 2) + ' KM/L') : (unit.liter_per_hm > 0 ? (formatNum(unit.liter_per_hm, 2) + ' L/Jam') : '-'));
    setElText('pbi-vra4-spec-costfuelkm', unit.petrol_cost_per_km > 0 ? (formatRp(unit.petrol_cost_per_km) + '/KM') : '-');
    setElText('pbi-vra4-spec-effectiveness', formatPct(unit.effective_jam_kerja || 100));

    const subtitleEl = document.getElementById('vra4-table-subtitle');
    if (subtitleEl) subtitleEl.innerText = `Unit: ${unit.kode_unit} (${unit.nama_asset_detail || unit.nama_asset || unit.kode_unit})`;

    const svgEl = document.getElementById('pbi-vra4-vehicle-svg');
    if (svgEl) svgEl.innerHTML = getVehicleSvgByType(unit.kode_kategori, unit.kode_unit, isDark);

    setElText('pbi-vra4-cost-per-km', unit.total_cost_per_km > 0 ? formatRp(unit.total_cost_per_km) + '/KM' : 'Rp 0/KM');
    setElText('pbi-vra4-tot-liter', formatNum(unit.total_liter, 0) + ' L');
    setElText('pbi-vra4-jml-service', (unit.jumlah_service || 0) + 'x');
    setElText('pbi-vra4-km-awal', formatNum(unit.km_awal));
    setElText('pbi-vra4-km-akhir', formatNum(unit.km_akhir));
    setElText('pbi-vra4-tot-km', formatNum(unit.total_km) + ' KM');
    setElText('pbi-vra4-acq-price', formatRp(unit.harga_perolehan));
    setElText('pbi-vra4-used-age', (unit.umur_pakai_bulan || 0) + ' bln');
    setElText('pbi-vra4-remain-age', (unit.sisa_umur_bulan || 0) + ' bln');
    setElText('pbi-vra4-active-days', (unit.hari_aktivitas || unit.hari_aktif || 0) + ' Hari');
    setElText('pbi-vra4-bd-days', (unit.hari_breakdown || 0) + ' Hari');
    setElText('pbi-vra4-op-jam', formatNum(unit.total_operating_jam || unit.total_durasi || 0, 1) + ' Jam');

    // Update Reset Odometer & Validation Badges in Hero & Cards
    const resetBadgeEl = document.getElementById('pbi-vra4-badge-reset-km');
    if (resetBadgeEl) {
        if (unit.has_reset_km) {
            resetBadgeEl.innerHTML = `<i class="ph-bold ph-arrow-counter-clockwise mr-1"></i>Reset Odometer: ${unit.reset_km_count}x (Mulai dari 0)`;
            resetBadgeEl.classList.remove('hidden');
        } else {
            resetBadgeEl.classList.add('hidden');
        }
    }

    const salahInputBadgeEl = document.getElementById('pbi-vra4-badge-salah-input');
    if (salahInputBadgeEl) {
        if (unit.salah_input_count > 0) {
            salahInputBadgeEl.innerHTML = `<i class="ph-bold ph-warning-circle mr-1"></i>${unit.salah_input_count}x Salah Input (aktif=0)`;
            salahInputBadgeEl.classList.remove('hidden');
        } else {
            salahInputBadgeEl.classList.add('hidden');
        }
    }

    const resetNoteEl = document.getElementById('pbi-vra4-reset-km-note');
    if (resetNoteEl) {
        if (unit.has_reset_km) {
            resetNoteEl.innerHTML = `⚠️ Odometer di-reset ${unit.reset_km_count}x • Akumulasi dihitung mulai dari 0 KM`;
            resetNoteEl.classList.remove('hidden');
        } else {
            resetNoteEl.classList.add('hidden');
        }
    }

    setElText('pbi-vra4-input-stat', `${unit.valid_input_count || 0} Valid / ${unit.salah_input_count || 0} Salah`);

    // TAB 1: RENDER LOG PROGRES HARIAN UNIT TERPILIH (using fast Map lookups)
    const unitMaps = getUnitIndexMaps(vra, fuel, maint);
    const unitVraList = unitMaps.vraByUnit.get(selectedUnitCode) || [];
    const unitFuelList = unitMaps.fuelByUnit.get(selectedUnitCode) || [];
    const unitMaintList = unitMaps.maintByUnit.get(selectedUnitCode) || [];

    const unitFuelByDate = new Map();
    unitFuelList.forEach(f => {
        const d = f.tanggal_bkb || f.tanggal;
        if (d) {
            unitFuelByDate.set(d, (unitFuelByDate.get(d) || 0) + (Number(f.jumlah_bkb_fix) || 0));
        }
    });

    const unitMaintByDate = new Map();
    unitMaintList.forEach(m => {
        const d = m.tanggal;
        if (d) {
            unitMaintByDate.set(d, (unitMaintByDate.get(d) || 0) + (Number(m.nominal) || 0));
        }
    });

    // Render the Enterprise 4 Composite Decision Cards (Health, Risk, 14-Day Heatmap, Cross-Domain 360°)
    renderVra4CompositeDecisionCards(unit, unitVraList, summaryData, unitFuelList, maint, isDark);

    // Populate Year Dropdown dynamically
    const yearSelect = document.getElementById('slicer-vra4-year');
    if (yearSelect) {
        const years = new Set();
        unitVraList.forEach(v => {
            if (v.tanggal && v.tanggal.length >= 4) years.add(v.tanggal.substring(0, 4));
        });
        const currentYearSel = vra4YearFilter;
        let yHtml = '<option value="ALL">Semua Tahun</option>';
        Array.from(years).sort().reverse().forEach(y => {
            const isSel = (y === currentYearSel) ? 'selected' : '';
            yHtml += `<option value="${y}" ${isSel}>${y}</option>`;
        });
        yearSelect.innerHTML = yHtml;
        if (currentYearSel !== 'ALL' && !years.has(currentYearSel)) {
            vra4YearFilter = 'ALL';
            yearSelect.value = 'ALL';
        }
    }

    // Populate Month Dropdown dynamically (Hide empty months for selected unit & year)
    const monthSelect = document.getElementById('slicer-vra4-month');
    if (monthSelect) {
        const activeMonths = new Set();
        unitVraList.forEach(v => {
            if (!v.tanggal) return;
            if (vra4YearFilter !== 'ALL' && !v.tanggal.startsWith(vra4YearFilter)) return;
            const parts = v.tanggal.split('-');
            if (parts.length >= 2) activeMonths.add(parts[1]);
        });

        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        let mHtml = `<option value="ALL">Semua Bulan (${activeMonths.size} Aktif)</option>`;
        for (let i = 1; i <= 12; i++) {
            const mStr = String(i).padStart(2, '0');
            if (activeMonths.has(mStr)) {
                const isSel = (mStr === vra4MonthFilter) ? 'selected' : '';
                mHtml += `<option value="${mStr}" ${isSel}>${monthNames[i - 1]}</option>`;
            }
        }
        monthSelect.innerHTML = mHtml;
        if (vra4MonthFilter !== 'ALL' && !activeMonths.has(vra4MonthFilter)) {
            vra4MonthFilter = 'ALL';
            monthSelect.value = 'ALL';
        }
    }

    const statusSelect = document.getElementById('slicer-vra4-status');
    if (statusSelect) {
        statusSelect.value = vra4StatusFilter;
    }

    const searchInput = document.getElementById('input-vra4-search');
    if (searchInput && searchInput.value !== vra4SearchQuery) {
        searchInput.value = vra4SearchQuery;
    }

    // Filter Logs for Selected Unit
    let filteredLogs = unitVraList;
    if (vra4YearFilter !== 'ALL') {
        filteredLogs = filteredLogs.filter(v => v.tanggal && v.tanggal.startsWith(vra4YearFilter));
    }
    if (vra4MonthFilter !== 'ALL') {
        filteredLogs = filteredLogs.filter(v => {
            if (!v.tanggal) return false;
            const parts = v.tanggal.split('-');
            return parts.length >= 2 && parts[1] === vra4MonthFilter;
        });
    }
    // Filter by Status Kerja only (aktif tidak difilter dari tampilan log)
    if (vra4StatusFilter === 'OPERATING') {
        filteredLogs = filteredLogs.filter(v => (v.status_kerja_calc === 'Operating' || (!v.is_downtime && !v.status_kerja_calc.includes('Standby'))));
    } else if (vra4StatusFilter === 'STANDBY') {
        filteredLogs = filteredLogs.filter(v => v.status_kerja_calc === 'Standby' || (v.aktivitas || '').toLowerCase().includes('standby'));
    } else if (vra4StatusFilter === 'BREAKDOWN') {
        filteredLogs = filteredLogs.filter(v => v.status_kerja_calc.includes('Breakdown') || (v.aktivitas || '').toLowerCase().includes('breakdown') || (v.aktivitas || '').toLowerCase().includes('rusak'));
    }

    if (vra4SearchQuery.trim() !== '') {
        const q = vra4SearchQuery.toLowerCase();
        filteredLogs = filteredLogs.filter(v => 
            (v.aktivitas && v.aktivitas.toLowerCase().includes(q)) ||
            (v.tujuan && v.tujuan.toLowerCase().includes(q)) ||
            (v.tanggal && v.tanggal.toLowerCase().includes(q)) ||
            (v.status_kerja_calc && v.status_kerja_calc.toLowerCase().includes(q))
        );
    }

    // Calculate Periodic Performance Summary Ribbon
    // Aturan:
    // 1. Lakukan calculation untuk inputan benar (aktif = 1), semua 0 di takedown dari calculation
    // 2. Kecuali 0 hanya menghitung calculation untuk inputan salah saja
    let periodRun = 0, periodDown = 0, periodKm = 0;
    let periodValidCount = 0, periodSalahCount = 0;

    filteredLogs.forEach(row => {
        const isAktif = (row.aktif === undefined || row.aktif === null || Number(row.aktif) === 1 || String(row.aktif) === '1');
        const durasiJam = Number(row.jam_kerja_calc || row.durasi || 0);
        const hmAwal = Number(row.hm_awal) || 0;
        const hmAkhir = Number(row.hm_akhir) || 0;
        const deltaMeter = Math.max(0, hmAkhir - hmAwal);

        if (isAktif) {
            // Kalkulasi untuk inputan benar
            periodValidCount++;
            if (row.is_downtime || (row.status_kerja_calc || '').includes('Breakdown') || (row.status_kerja_calc || '').includes('Standby')) {
                periodDown += durasiJam;
            } else {
                periodRun += durasiJam;
            }
            periodKm += Number(row.km_used || deltaMeter || 0);
        } else {
            // Aktif = 0: di-takedown dari calculation operasional (0 Jam, 0 KM)
            // Hanya menghitung calculation untuk inputan salah saja
            periodSalahCount++;
        }
    });

    // Kalkulasi BBM & Maintenance periode tanpa duplikasi baris
    let periodFuel = 0, periodMtc = 0;
    unitFuelList.forEach(f => {
        const d = f.tanggal_bkb || f.tanggal;
        if (!d) return;
        if (vra4YearFilter !== 'ALL' && !d.startsWith(vra4YearFilter)) return;
        if (vra4MonthFilter !== 'ALL') {
            const parts = d.split('-');
            if (parts.length < 2 || parts[1] !== vra4MonthFilter) return;
        }
        periodFuel += (Number(f.jumlah_bkb_fix) || 0);
    });
    unitMaintList.forEach(m => {
        const d = m.tanggal;
        if (!d) return;
        if (vra4YearFilter !== 'ALL' && !d.startsWith(vra4YearFilter)) return;
        if (vra4MonthFilter !== 'ALL') {
            const parts = d.split('-');
            if (parts.length < 2 || parts[1] !== vra4MonthFilter) return;
        }
        periodMtc += (Number(m.nominal) || 0);
    });

    setElText('pbi-vra4-p-run', formatNum(periodRun, 1) + ' Jam');
    setElText('pbi-vra4-p-down', formatNum(periodDown, 1) + ' Jam');
    setElText('pbi-vra4-p-km', formatNum(periodKm, 0) + ' KM');
    setElText('pbi-vra4-p-fuel', formatNum(periodFuel, 0) + ' L');
    setElText('pbi-vra4-p-mtc', formatRp(periodMtc));
    setElText('pbi-vra4-p-validitas', `${periodValidCount} Valid • ${periodSalahCount} Salah`);

    const dailyTbody = document.getElementById('table-pbi-vra4-daily-body');
    if (dailyTbody) {
        if (filteredLogs.length === 0) {
            dailyTbody.innerHTML = `<tr><td colspan="14" class="p-8 text-center text-slate-400">Tidak ada catatan log aktivitas yang cocok dengan kriteria filter untuk unit ${selectedUnitCode}</td></tr>`;
        } else {
            const sortedLogs = [...filteredLogs].sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0));
            dailyTbody.innerHTML = sortedLogs.slice(0, 150).map((row, idx) => {
                const hmAwal = Number(row.hm_awal) || 0;
                const hmAkhir = Number(row.hm_akhir) || 0;
                const deltaMeter = Math.max(0, hmAkhir - hmAwal);
                
                let durasiJam = 0;
                if (row.jam_awal && row.jam_selesai) {
                    const p1 = row.jam_awal.split(':').map(Number);
                    const p2 = row.jam_selesai.split(':').map(Number);
                    durasiJam = Math.max(0, ((p2[0] * 60 + (p2[1] || 0)) - (p1[0] * 60 + (p1[1] || 0))) / 60);
                } else if (deltaMeter > 0) {
                    durasiJam = deltaMeter;
                }
                
                const bbmLtr = unitFuelByDate.get(row.tanggal) || 0;
                const mtcNominal = unitMaintByDate.get(row.tanggal) || 0;
                const act = (row.aktivitas || '').trim() || '-';
                const isBreakdown = act.toLowerCase().includes('breakdown') || act.toLowerCase().includes('rusak');
                const isStandby = act.toLowerCase().includes('standby') || act.toLowerCase().includes('tunggu');
                const isSalahInput = (row.aktif === 0 || String(row.aktif) === '0' || row.is_salah_input);
                
                const statusBadge = isBreakdown 
                    ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">Breakdown</span>'
                    : (isStandby 
                        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">Standby</span>'
                        : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">Operating</span>');

                const validitasBadge = isSalahInput
                    ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800" title="Aktivitas Salah Input (aktif = 0) - Dikecualikan dari kalkulasi operasional">⚠️ Salah Input</span>'
                    : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" title="Aktivitas Valid (aktif = 1)">✅ Valid (1)</span>';

                let performansiBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">-</span>';
                if (isSalahInput) {
                    performansiBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">❌ Salah Input</span>';
                } else if (isBreakdown) {
                    performansiBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">🛑 Breakdown</span>';
                } else if (isStandby) {
                    performansiBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">⏳ Standby</span>';
                } else if (durasiJam >= 8) {
                    performansiBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">⚡ Overtime</span>';
                } else if (durasiJam > 0) {
                    performansiBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">✅ Produktif</span>';
                }

                const durasiDisplay = isSalahInput
                    ? `<span class="line-through text-slate-400 block">${durasiJam > 0 ? durasiJam.toFixed(1) + ' Jam' : '-'}</span><span class="text-[9px] text-rose-600 dark:text-rose-400 font-bold block" title="Di-takedown dari kalkulasi">0 Jam (Takedown)</span>`
                    : (durasiJam > 0 ? durasiJam.toFixed(1) + ' Jam' : '-');

                const kmDisplay = isSalahInput
                    ? `<span class="line-through text-slate-400 block">${deltaMeter > 0 ? formatNum(deltaMeter) : '-'}</span><span class="text-[9px] text-rose-600 dark:text-rose-400 font-bold block" title="Di-takedown dari kalkulasi">0 (Takedown)</span>`
                    : (deltaMeter > 0 ? formatNum(deltaMeter) : '-');

                return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-xs border-b border-slate-100 dark:border-slate-800 ${isSalahInput ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''}">
                        <td class="p-2 text-center text-slate-400 font-mono">${idx + 1}</td>
                        <td class="p-2 text-center font-mono font-semibold text-slate-700 dark:text-slate-300">${row.tanggal || '-'}</td>
                        <td class="p-2 text-center font-mono text-slate-600 dark:text-slate-400">${row.jam_awal || '-'} - ${row.jam_selesai || '-'}</td>
                        <td class="p-2 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">${durasiDisplay}</td>
                        <td class="p-2 text-right font-mono">${hmAwal > 0 ? formatNum(hmAwal) : '-'}</td>
                        <td class="p-2 text-right font-mono">${hmAkhir > 0 ? formatNum(hmAkhir) : '-'}</td>
                        <td class="p-2 text-right font-mono font-bold text-emerald-600">${kmDisplay}</td>
                        <td class="p-2 font-medium text-slate-800 dark:text-slate-200 truncate max-w-[180px]" title="${act}">${act}</td>
                        <td class="p-2 text-slate-600 dark:text-slate-400 truncate max-w-[140px]">${row.tujuan || '-'}</td>
                        <td class="p-2 text-center">${statusBadge}</td>
                        <td class="p-2 text-center">${validitasBadge}</td>
                        <td class="p-2 text-right font-mono text-amber-600 font-bold">${bbmLtr > 0 ? formatNum(bbmLtr, 1) + ' L' : '-'}</td>
                        <td class="p-2 text-right font-mono text-rose-600 font-bold">${mtcNominal > 0 ? formatRp(mtcNominal) : '-'}</td>
                        <td class="p-2 text-center">${performansiBadge}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // TAB 2: RENDER SUMMARY FLEET 28 KOLOM
    const tbody = document.getElementById('table-pbi-vra4-summary-body');
    if (tbody) {
        if (tbody.dataset.populated !== 'true' || tbody.children.length === 0) {
            tbody.innerHTML = summaryData.slice(0, 100).map(u => `
                <tr data-unit="${u.kode_unit}" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer text-xs border-b border-slate-100 dark:border-slate-800 ${u.kode_unit === selectedUnitCode ? 'bg-blue-50/60 dark:bg-blue-900/20 font-bold active' : ''}" onclick="window.pns.onVra4UnitChanged('${u.kode_unit}')">
                    <td class="font-bold text-blue-600 dark:text-sky-400 p-2 whitespace-nowrap">${u.kode_unit}</td>
                    <td class="p-2 font-semibold truncate max-w-[150px]">${u.nama_asset}</td>
                    <td class="p-2 text-center font-mono">${u.tanggal_perolehan || '-'}</td>
                    <td class="p-2 text-right font-mono">${formatRp(u.harga_perolehan)}</td>
                    <td class="p-2 text-center font-mono">${u.standar_umur_tahun} Thn</td>
                    <td class="p-2 text-center font-mono font-bold text-emerald-600">${u.sisa_umur_bulan} bln</td>
                    <td class="p-2 text-center font-mono">${u.umur_pakai_bulan} bln</td>
                    <td class="p-2 text-right font-mono">${formatNum(u.km_awal)}</td>
                    <td class="p-2 text-right font-mono">${formatNum(u.km_akhir)}</td>
                    <td class="p-2 text-right font-mono text-rose-500">${formatNum(u.lost_km)}</td>
                    <td class="p-2 text-center font-mono">${u.tanggal_awal || '-'}</td>
                    <td class="p-2 text-center font-mono">${u.tanggal_akhir || '-'}</td>
                    <td class="p-2 text-center font-mono">${u.jumlah_transaksi}</td>
                    <td class="p-2 text-center font-mono">${u.jumlah_hari}</td>
                    <td class="p-2 text-center font-mono text-rose-500">${u.hari_breakdown}</td>
                    <td class="p-2 text-center font-mono text-emerald-500 font-bold">${u.hari_aktivitas || u.hari_aktif}</td>
                    <td class="p-2 text-right font-mono font-bold">${formatNum(u.km_per_day, 1)}</td>
                    <td class="p-2 text-right font-mono font-bold text-rose-600">${formatNum(u.avg_km_day, 1)}</td>
                    <td class="p-2 text-right font-mono">${formatNum(u.total_liter, 0)} L</td>
                    <td class="p-2 text-right font-mono">${formatRp(u.cost_petrol)}</td>
                    <td class="p-2 text-right font-mono">${formatRp(u.cost_maintenance)}</td>
                    <td class="p-2 text-right font-mono font-bold text-blue-600">${formatRp(u.total_cost)}</td>
                    <td class="p-2 text-center font-mono">${u.jumlah_service}</td>
                    <td class="p-2 text-right font-mono">${u.lt_per_km > 0 ? u.lt_per_km.toFixed(3) : '-'}</td>
                    <td class="p-2 text-right font-mono">${u.km_per_lt > 0 ? u.km_per_lt.toFixed(2) : '-'}</td>
                    <td class="p-2 text-right font-mono">${formatRp(u.petrol_cost_per_km)}</td>
                    <td class="p-2 text-right font-mono">${formatRp(u.mtc_cost_per_km)}</td>
                    <td class="p-2 text-right font-mono font-bold text-blue-600">${formatRp(u.total_cost_per_km)}</td>
                </tr>
            `).join('');
            tbody.dataset.populated = 'true';
        } else {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(r => {
                if (r.getAttribute('data-unit') === selectedUnitCode) {
                    r.classList.add('bg-blue-50/60', 'dark:bg-blue-900/20', 'font-bold', 'active');
                } else {
                    r.classList.remove('bg-blue-50/60', 'dark:bg-blue-900/20', 'font-bold', 'active');
                }
            });
        }
    }
}

// -------------------------------------------------------------
// VIEW 5: FUEL (BBM) ANALYTICS (STANDARDIZED ENTERPRISE)
// -------------------------------------------------------------
function renderFuel(fuel, vra) {
    // Populate Kategori dropdown dynamically
    const katSelect = document.getElementById('slicer-fuel-kat');
    if (katSelect && katSelect.options.length <= 1) {
        const kats = [...new Set(fuel.map(f => {
            const asset = pbiData.assetMap.get(f.no_asset_manual);
            return asset ? (asset.kode_kategori || asset.kategori) : null;
        }).filter(Boolean))].sort();
        kats.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            katSelect.appendChild(opt);
        });
    }

    let filteredFuel = fuel;
    if (fuelKatFilter !== 'ALL') {
        filteredFuel = filteredFuel.filter(f => {
            const asset = pbiData.assetMap.get(f.no_asset_manual);
            return asset && (asset.kode_kategori === fuelKatFilter || asset.kategori === fuelKatFilter);
        });
    }
    if (fuelSearchQuery.trim() !== '') {
        const q = fuelSearchQuery.toLowerCase();
        filteredFuel = filteredFuel.filter(f => {
            const asset = pbiData.assetMap.get(f.no_asset_manual) || {};
            return (f.no_asset_manual && f.no_asset_manual.toLowerCase().includes(q)) ||
                   (f.nomor_bkb && f.nomor_bkb.toLowerCase().includes(q)) ||
                   (asset.nama_asset && asset.nama_asset.toLowerCase().includes(q));
        });
    }

    // Call comprehensive analytical measure
    const detailLog = measureFuelDetailLog(filteredFuel, vra, pbiData.assetMap);
    let unitList = detailLog.unitList;

    // Apply quick preset
    if (currentFuelPreset === 'HEAVY') {
        const heavyKats = ['GENSET', 'POMPA AIR', 'SPEEDBOAT', 'TUGBOAT', 'POTONG RUMPUT', 'EXCAVATOR', 'BULLDOZER', 'WHEEL LOADER'];
        unitList = unitList.filter(u => heavyKats.includes(u.kategori) || (u.liter_per_jam > 0 && u.km_per_liter === 0));
        filteredFuel = filteredFuel.filter(f => unitList.some(u => u.kode_unit === (f.no_asset_manual || f.kode_unit)));
    } else if (currentFuelPreset === 'TRANSPORT') {
        const transportKats = ['DUMP TRUCK', 'TRUCK', 'TANGKI', 'MOBIL', 'SEPEDA MOTOR', 'MOTOR LISTRIK'];
        unitList = unitList.filter(u => transportKats.includes(u.kategori) || u.km_per_liter > 0);
        filteredFuel = filteredFuel.filter(f => unitList.some(u => u.kode_unit === (f.no_asset_manual || f.kode_unit)));
    } else if (currentFuelPreset === 'ANOMALY') {
        unitList = unitList.filter(u => u.is_anomaly);
        filteredFuel = filteredFuel.filter(f => unitList.some(u => u.kode_unit === (f.no_asset_manual || f.kode_unit)));
    }

    setElText('pbi-fuel-filtered-count', formatNum(filteredFuel.length));

    // Dynamic aggregations
    let totLiter = 0, totCost = 0;
    filteredFuel.forEach(f => {
        totLiter += Number(f.jumlah_bkb_fix || f.jumlah || 0);
        totCost += Number(f.harga_bkb || f.total_biaya || 0);
    });

    const distinctUnits = unitList.length;
    const avgLiter = distinctUnits > 0 ? totLiter / distinctUnits : 0;
    const avgCostPerUnit = distinctUnits > 0 ? totCost / distinctUnits : 0;
    const costPerLiter = totLiter > 0 ? totCost / totLiter : 0;

    let totHm = 0, totKm = 0;
    unitList.forEach(u => {
        totHm += (u.total_jam || 0);
        totKm += (u.total_km || 0);
    });
    const overallRatio = totHm > 0 ? totLiter / totHm : 0;
    const kmPerLiter = totLiter > 0 ? totKm / totLiter : 0;

    const anomalyUnits = unitList.filter(u => u.is_anomaly);
    const anomalyCount = anomalyUnits.length;
    const anomalyImpact = anomalyUnits.reduce((acc, u) => acc + (u.total_biaya * 0.25), 0);

    // Populate Executive Intelligence Recommendation Banner
    const recText = detailLog.summary.recommendation_text || (anomalyCount > 0 
        ? `Ditemukan ${anomalyCount} unit dengan rasio bahan bakar di atas toleransi efisiensi wajar (potensi inefisiensi ~${formatRp(anomalyImpact)}). Disarankan pemeriksaan nozzle injector & audit jam operasional.`
        : `Seluruh armada beroperasi dalam rentang efisiensi bahan bakar standar. Deviasi konsumsi berada di bawah 5%.`);
    setElText('pbi-fuel-rec-text', recText);
    setElText('pbi-fuel-rec-impact', `Inefisiensi: ${formatRp(anomalyImpact)}`);

    // Populate 1. Executive HERO KPI Card
    setElText('pbi-fuel-hero-cost', formatRp(totCost));
    setElText('pbi-fuel-hero-volume', `${formatK(totLiter)} L (${formatNum(totLiter, 0)} L)`);
    setElText('pbi-fuel-hero-cost-per-l', `Harga Rerata: Rp ${formatNum(costPerLiter, 0)} / L`);
    setElText('pbi-fuel-avg-cost-unit', formatRp(avgCostPerUnit));
    setElText('pbi-fuel-burn-harian', `${formatK(detailLog.summary.avg_liter_harian || (totLiter / 365))} L/hr`);
    setElText('pbi-fuel-burn-bulanan', `${formatK(detailLog.summary.avg_liter_bulanan || (totLiter / 12))} L/bln`);

    // Populate 2-5 Companion Decision Cards
    setElText('pbi-fuel-total-units', formatNum(distinctUnits));
    setElText('pbi-fuel-avg-ltr', `Avg ${formatNum(avgLiter, 0)} L / Unit`);

    setElText('pbi-fuel-avg-ratio', (overallRatio > 0 ? overallRatio.toFixed(2) : '0.00') + ' L/HM');
    setElText('pbi-fuel-total-hm-sub', `${formatNum(totHm, 1)} HM Jam Kerja`);

    setElText('pbi-fuel-avg-km-l', (kmPerLiter > 0 ? kmPerLiter.toFixed(2) : '0.00') + ' KM/L');
    setElText('pbi-fuel-total-km-sub', `${formatNum(totKm, 0)} KM Tempuh`);

    setElText('pbi-fuel-anomaly-count', `${formatNum(anomalyCount)} Unit`);
    setElText('pbi-fuel-anomaly-impact', `Inefisiensi: ${formatRp(anomalyImpact)}`);

    // Fallbacks for original element IDs
    setElText('pbi-fuel-total-ltr', formatNum(totLiter, 0) + ' L');
    setElText('pbi-fuel-total-cost', formatRp(totCost));

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    // Render Fuel Interactive SVG Sparklines
    const fuelMonthlyLiter = new Array(12).fill(0);
    const fuelMonthlyCost = new Array(12).fill(0);
    filteredFuel.forEach(f => {
        const tgl = f.tanggal_bkb || f.tanggal;
        if (tgl) {
            const m = parseInt(tgl.split('-')[1], 10) - 1;
            if (m >= 0 && m < 12) {
                fuelMonthlyLiter[m] += Number(f.jumlah_bkb_fix || f.jumlah || 0);
                fuelMonthlyCost[m] += Number(f.harga_bkb || f.total_biaya || 0);
            }
        }
    });

    try {
        // Hero Sparkline (Cost Trajectory)
        const heroTrend = months.map((m, i) => ({ label: m, value: Math.round(fuelMonthlyCost[i]) }));
        renderSvgSparkline('#pbi-fuel-spark-hero', heroTrend, {
            color: '#9333ea',
            height: 36,
            formatter: v => formatRp(v)
        });

        // 1. Total Unit BBM Sparkline
        const unitTrend = months.map(m => ({ label: m, value: distinctUnits }));
        renderSvgSparkline('#pbi-fuel-spark-units', unitTrend, {
            color: '#6366f1',
            height: 32,
            unit: 'Unit',
            formatter: v => formatNum(v, 0) + ' Unit'
        });

        // 2. Rasio Liter / HM Sparkline
        const ratioTrend = months.map((m, i) => ({ label: m, value: Number(overallRatio.toFixed(2)) }));
        renderSvgSparkline('#pbi-fuel-spark-ratio', ratioTrend, {
            color: '#06b6d4',
            height: 32,
            unit: 'L/HM',
            formatter: v => formatNum(v, 2) + ' L/HM'
        });

        // 3. Rasio KM / L Sparkline
        const kmLTrend = months.map((m, i) => ({ label: m, value: Number(kmPerLiter.toFixed(2)) }));
        renderSvgSparkline('#pbi-fuel-spark-km-l', kmLTrend, {
            color: '#10b981',
            height: 32,
            unit: 'KM/L',
            formatter: v => formatNum(v, 2) + ' KM/L'
        });

        // 4. Anomaly Sparkline
        const anomTrend = months.map((m, i) => ({ label: m, value: Math.round(fuelMonthlyCost[i] * 0.25) }));
        renderSvgSparkline('#pbi-fuel-spark-cost', anomTrend, {
            color: '#f43f5e',
            height: 32,
            formatter: v => formatRp(v)
        });
    } catch (err) {
        console.warn('Error rendering fuel SVG sparklines:', err);
    }

    // 1. Chart Tren Konsumsi / Biaya BBM (Area Chart with Compact Formatter)
    let trendSeriesName = 'Konsumsi (Liter)';
    let trendSeriesData = fuelMonthlyLiter.map(v => Math.round(v));
    let yaxisFormatter = v => formatCompactNum(v);

    if (currentFuelTrendDim === 'biaya') {
        trendSeriesName = 'Biaya (Rp)';
        trendSeriesData = fuelMonthlyCost.map(v => Math.round(v));
        yaxisFormatter = v => formatCompactRp(v);
    } else if (currentFuelTrendDim === 'rasio') {
        trendSeriesName = 'Rasio Rata-rata (L/HM)';
        trendSeriesData = months.map((m, i) => {
            const ltr = fuelMonthlyLiter[i] || 0;
            return totLiter > 0 && overallRatio > 0 ? Number((ltr / Math.max(1, (totHm / 12))).toFixed(2)) : 0;
        });
        yaxisFormatter = v => `${Number(v).toFixed(1)} L/HM`;
    }

    renderApex('#chart-pbi-fuel-trend', {
        chart: { type: 'area', height: 260, toolbar: { show: false } },
        series: [{ name: trendSeriesName, data: trendSeriesData }],
        xaxis: { 
            categories: months, 
            labels: { style: { fontSize: '11px', fontWeight: 600 } } 
        },
        yaxis: { 
            labels: { 
                formatter: yaxisFormatter, 
                style: { fontSize: '10.5px', fontWeight: 600 } 
            } 
        },
        colors: [currentFuelTrendDim === 'biaya' ? '#06b6d4' : (currentFuelTrendDim === 'rasio' ? '#10b981' : '#8b5cf6')],
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05 } },
        dataLabels: { enabled: false },
        tooltip: {
            y: { 
                formatter: v => currentFuelTrendDim === 'biaya' 
                    ? formatRp(v) 
                    : (currentFuelTrendDim === 'rasio' ? `${Number(v).toFixed(2)} L/HM` : `${formatNum(v, 0)} Liter`) 
            }
        }
    });

    // 2. Chart Distribusi BBM per Kategori Armada (Donut Chart with Compact Labels)
    const catDistMap = {};
    unitList.forEach(u => {
        const c = u.kategori || 'Lainnya';
        catDistMap[c] = (catDistMap[c] || 0) + u.total_liter;
    });
    const catDistKeys = Object.keys(catDistMap).sort((a, b) => catDistMap[b] - catDistMap[a]).slice(0, 6);
    
    renderApex('#chart-pbi-fuel-cat-dist', {
        chart: { type: 'donut', height: 180 },
        series: catDistKeys.map(k => Math.round(catDistMap[k])),
        labels: catDistKeys,
        colors: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6366f1'],
        plotOptions: { 
            pie: { 
                donut: { 
                    size: '68%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total BBM',
                            formatter: () => formatK(totLiter) + ' L',
                            style: { fontSize: '11px', fontWeight: 800 }
                        }
                    } 
                } 
            } 
        },
        dataLabels: { enabled: false },
        legend: { 
            position: 'bottom', 
            fontSize: '10px', 
            fontWeight: 600,
            formatter: (seriesName, opts) => {
                const val = opts.w.globals.series[opts.seriesIndex];
                return `${seriesName}: ${formatK(val)} L`;
            }
        },
        tooltip: {
            y: { formatter: v => `${formatNum(v, 0)} Liter (${((v / Math.max(1, totLiter)) * 100).toFixed(1)}%)` }
        }
    });

    // 3. Chart Top 7 Unit Konsumsi Terbesar (Compact dataLabels: formatK(v) + ' L')
    const top7 = [...unitList].sort((a, b) => b.total_liter - a.total_liter).slice(0, 7);
    renderApex('#chart-pbi-fuel-ratio', {
        chart: { type: 'bar', height: 160, toolbar: { show: false } },
        series: [{ name: 'Total Liter', data: top7.map(u => Math.round(u.total_liter)) }],
        xaxis: { 
            categories: top7.map(u => u.kode_unit), 
            labels: { 
                formatter: v => formatCompactNum(v) + ' L',
                style: { fontSize: '10px', fontWeight: 600 } 
            } 
        },
        yaxis: { 
            labels: { 
                style: { fontSize: '10px', fontWeight: 700 },
                maxWidth: 130
            } 
        },
        colors: ['#06b6d4'],
        plotOptions: { 
            bar: { 
                horizontal: true, 
                borderRadius: 4, 
                barHeight: '52%' 
            } 
        },
        dataLabels: {
            enabled: true,
            formatter: v => formatK(v) + ' L',
            style: { fontSize: '10px', fontWeight: 700 }
        },
        tooltip: {
            y: { formatter: v => `${formatNum(v, 0)} Liter` }
        }
    });

    // 4. Matrix Table
    const tbody = document.getElementById('table-pbi-fuel-matrix');
    if (tbody) {
        tbody.innerHTML = '';
        if (unitList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-slate-400 font-medium">Tidak ada data konsumsi BBM yang sesuai filter.</td></tr>';
            return;
        }

        const maxLtr = Math.max(...unitList.slice(0, 100).map(r => r.total_liter || 0), 1);

        tbody.innerHTML = unitList.slice(0, 100).map(r => {
            const pct = Math.min(100, ((r.total_liter || 0) / maxLtr) * 100);
            return `
                <tr class="hover:bg-purple-50/70 dark:hover:bg-purple-950/40 transition text-xs border-b border-slate-100 dark:border-slate-800">
                    <td class="px-3.5 py-2.5 font-bold text-blue-600 dark:text-sky-400 whitespace-nowrap cursor-pointer hover:underline" onclick="window.pns.drillToUnit('${r.kode_unit}')" title="Klik untuk lihat Profil Unit ${r.kode_unit}">
                        <div class="flex items-center gap-1.5 font-mono">
                            <span>${r.kode_unit}</span>
                            <i class="ph-bold ph-arrow-square-out text-[11px] text-purple-500"></i>
                        </div>
                    </td>
                    <td class="px-3.5 py-2.5 font-semibold truncate max-w-[160px]">${r.nama_asset || '-'}</td>
                    <td class="px-3.5 py-2.5 text-center">
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            ${r.kategori || '-'}
                        </span>
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono whitespace-nowrap">
                        <div class="flex items-center justify-end gap-2.5">
                            <div class="w-12 bg-purple-100 dark:bg-purple-950/40 rounded-full h-1.5 overflow-hidden shrink-0">
                                <div class="bg-purple-500 h-full rounded-full" style="width: ${pct}%"></div>
                            </div>
                            <span class="font-bold shrink-0 min-w-[55px] text-right">${formatNum(r.total_liter, 0)} L</span>
                        </div>
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono">${formatNum(r.total_jam, 1)}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-bold text-purple-600">
                        ${r.liter_per_jam > 0 ? r.liter_per_jam.toFixed(2) : '-'}
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-600">
                        ${r.km_per_liter > 0 ? r.km_per_liter.toFixed(2) : '-'}
                    </td>
                    <td class="px-3.5 py-2.5 text-center">
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${r.is_anomaly ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : (r.efficiency_status === 'Sangat Efisien' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300')}">
                            ${r.is_anomaly ? '🚨 BOROS' : (r.efficiency_status === 'Sangat Efisien' ? '⚡ EFISIEN' : 'NORMAL')}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// -------------------------------------------------------------
// VIEW 2 (BBM): KOMPARASI HEAD-TO-HEAD BBM vs VRA
// -------------------------------------------------------------
export function renderFuelVraComparison(fuel, vra, assets) {
    if (!fuel || !vra) return;
    const assetMap = pbiData.assetMap || new Map();

    // Populate Kategori dropdown dynamically if not yet populated
    const katSelect = document.getElementById('slicer-fuel-vra-kat');
    if (katSelect && katSelect.options.length <= 1) {
        const kats = [...new Set(fuel.map(f => {
            const asset = assetMap.get(f.no_asset_manual || f.kode_unit);
            return inferSubKategori(f.no_asset_manual || f.kode_unit, asset);
        }).concat(vra.map(v => {
            const asset = assetMap.get(v.no_asset_manual || v.kode_unit);
            return inferSubKategori(v.no_asset_manual || v.kode_unit, asset);
        })).filter(Boolean))].sort();

        kats.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            katSelect.appendChild(opt);
        });
    }

    // Measure comprehensive VRA vs Fuel Comparison
    const rep = measureVraFuelComparison(fuel, vra, assetMap);
    let comparisonList = rep.comparisonList;

    // Filter by Kategori
    if (fuelVraKatFilter !== 'ALL') {
        comparisonList = comparisonList.filter(u => u.kategori === fuelVraKatFilter);
    }

    // Filter by Quadrant
    if (fuelVraQuadrantFilter !== 'ALL') {
        comparisonList = comparisonList.filter(u => u.quadrant === fuelVraQuadrantFilter);
    }

    // Filter by Search Query
    if (fuelVraSearchQuery.trim() !== '') {
        const q = fuelVraSearchQuery.toLowerCase();
        comparisonList = comparisonList.filter(u => 
            (u.kode_unit && u.kode_unit.toLowerCase().includes(q)) ||
            (u.nama_asset && u.nama_asset.toLowerCase().includes(q)) ||
            (u.kategori && u.kategori.toLowerCase().includes(q))
        );
    }

    // Update Banner & KPI Scorecards
    const summary = rep.summary;
    setElText('pbi-fv-unit-count', formatNum(comparisonList.length));
    setElText('table-pbi-fv-count', formatNum(comparisonList.length));

    const diagText = summary.anomaly_count > 0 
        ? `Tercatat ${formatNum(summary.total_units)} unit armada aktif dengan jam kerja ${formatNum(summary.total_vra_hm, 1)} HM. Terdeteksi ${summary.anomaly_count} unit mengalami deviasi konsumsi solar (potensi pemborosan ${formatRp(summary.total_waste_cost_rp)}). Beban biaya armada rata-rata ${formatRp(summary.overall_cost_per_hm)} / Jam Operasi.`
        : `Tercatat ${formatNum(summary.total_units)} unit beroperasi dalam rentang efisiensi tinggi. Rata-rata beban operasional bahan bakar armada sangat terkendali di ${formatRp(summary.overall_cost_per_hm)} / HM.`;
    setElText('pbi-fv-intel-text', diagText);
    setElText('pbi-fv-intel-score', `Efisiensi: ${summary.efficiency_score}%`);

    setElText('pbi-fv-total-hm', `${formatNum(summary.total_vra_hm, 1)} HM`);
    setElText('pbi-fv-total-km', `${formatNum(summary.total_vra_km, 0)} KM Tempuh`);
    setElText('pbi-fv-unit-cov', `${formatNum(summary.total_units)} Unit Armada`);

    setElText('pbi-fv-total-liter', `${formatNum(summary.total_fuel_liter, 0)} L`);
    setElText('pbi-fv-total-cost', `Total Biaya: ${formatRp(summary.total_fuel_cost)}`);
    const avgPrice = summary.total_fuel_liter > 0 ? summary.total_fuel_cost / summary.total_fuel_liter : 6800;
    setElText('pbi-fv-avg-price', `Harga Rerata: ${formatRp(avgPrice)} / L`);

    setElText('pbi-fv-avg-ratio', `${summary.overall_l_hm.toFixed(2)} L/HM`);
    setElText('pbi-fv-ratio-eval', summary.overall_l_hm <= 3.0 ? '✅ Dalam Batas Standar Efisien' : '⚠️ Di Atas Standar Armada');
    setElText('pbi-fv-transport-ratio', `${summary.overall_km_l.toFixed(2)} KM/L`);

    setElText('pbi-fv-cost-per-hm', `${formatRp(summary.overall_cost_per_hm)} / HM`);
    const costPerKm = summary.total_vra_km > 0 ? Math.round(summary.total_fuel_cost / summary.total_vra_km) : 0;
    setElText('pbi-fv-cost-per-km', `Biaya per KM: ${formatRp(costPerKm)} / KM`);
    setElText('pbi-fv-potential-waste', formatRp(summary.total_waste_cost_rp));

    // 1. Render Dual-Axis Mixed Chart (Bar: VRA HM, Area/Line: BBM Liter)
    const months = rep.monthlyCorrelation.map(m => m.monthName);
    const vHmSeries = rep.monthlyCorrelation.map(m => Math.round(m.vra_hm));
    const fLiterSeries = rep.monthlyCorrelation.map(m => Math.round(m.fuel_liter));
    const costHmSeries = rep.monthlyCorrelation.map(m => m.cost_per_hm);

    renderApex('#chart-pbi-fv-dual-axis', {
        chart: {
            height: 300,
            type: 'line',
            toolbar: { show: false }
        },
        stroke: {
            width: [0, 2.5, 2],
            curve: 'smooth'
        },
        plotOptions: {
            bar: {
                columnWidth: '40%',
                borderRadius: 4
            }
        },
        fill: {
            opacity: [0.85, 0.35, 1],
            gradient: {
                inverseColors: false,
                shade: 'light',
                type: 'vertical',
                opacityFrom: 0.6,
                opacityTo: 0.05
            }
        },
        series: [
            {
                name: 'Jam Kerja VRA (HM)',
                type: 'column',
                data: vHmSeries
            },
            {
                name: 'Konsumsi BBM (Liter)',
                type: 'area',
                data: fLiterSeries
            },
            {
                name: 'Beban Biaya (Rp/HM)',
                type: 'line',
                data: costHmSeries
            }
        ],
        colors: ['#0ea5e9', '#a855f7', '#f59e0b'],
        xaxis: {
            categories: months,
            labels: { style: { fontSize: '11px', fontWeight: 600 } }
        },
        yaxis: [
            {
                title: { text: 'Jam Kerja VRA (HM)', style: { color: '#0ea5e9', fontSize: '10px', fontWeight: 700 } },
                labels: { formatter: v => formatCompactNum(v) + ' HM', style: { fontSize: '10px' } }
            },
            {
                opposite: true,
                title: { text: 'Bahan Bakar (Liter)', style: { color: '#a855f7', fontSize: '10px', fontWeight: 700 } },
                labels: { formatter: v => formatCompactNum(v) + ' L', style: { fontSize: '10px' } }
            },
            {
                show: false
            }
        ],
        tooltip: {
            shared: true,
            intersect: false,
            y: {
                formatter: (val, opts) => {
                    if (opts.seriesIndex === 0) return `${formatNum(val, 0)} HM`;
                    if (opts.seriesIndex === 1) return `${formatNum(val, 0)} Liter`;
                    if (opts.seriesIndex === 2) return formatRp(val) + ' / HM';
                    return val;
                }
            }
        },
        legend: {
            position: 'top',
            horizontalAlign: 'right',
            fontSize: '11px',
            fontWeight: 600
        }
    });

    // 2. Render Quadrant Scatter Plot
    const primaPoints = rep.quadrants.prima.map(u => ({ x: Math.round(u.total_hm), y: Math.round(u.total_liter), unit: u.kode_unit, name: u.nama_asset, ratio: u.actual_ratio, dev: u.deviation_pct }));
    const kritisPoints = rep.quadrants.kritis.map(u => ({ x: Math.round(u.total_hm), y: Math.round(u.total_liter), unit: u.kode_unit, name: u.nama_asset, ratio: u.actual_ratio, dev: u.deviation_pct }));
    const heavyPoints = rep.quadrants.heavy.map(u => ({ x: Math.round(u.total_hm), y: Math.round(u.total_liter), unit: u.kode_unit, name: u.nama_asset, ratio: u.actual_ratio, dev: u.deviation_pct }));
    const standbyPoints = rep.quadrants.standby.map(u => ({ x: Math.round(u.total_hm), y: Math.round(u.total_liter), unit: u.kode_unit, name: u.nama_asset, ratio: u.actual_ratio, dev: u.deviation_pct }));

    renderApex('#chart-pbi-fv-scatter', {
        chart: {
            height: 300,
            type: 'scatter',
            toolbar: { show: false },
            zoom: { enabled: false }
        },
        series: [
            { name: 'Prima & Efisien', data: primaPoints },
            { name: 'Kritis (Boros/Idle)', data: kritisPoints },
            { name: 'Beban Berat', data: heavyPoints },
            { name: 'Standby / Cadangan', data: standbyPoints }
        ],
        colors: ['#10b981', '#ef4444', '#8b5cf6', '#94a3b8'],
        xaxis: {
            tickAmount: 5,
            title: { text: 'Jam Kerja VRA (HM)', style: { fontSize: '10px', fontWeight: 700 } },
            labels: { formatter: val => formatCompactNum(val) + ' HM', style: { fontSize: '10px' } }
        },
        yaxis: {
            title: { text: 'Konsumsi Solar (Liter)', style: { fontSize: '10px', fontWeight: 700 } },
            labels: { formatter: val => formatCompactNum(val) + ' L', style: { fontSize: '10px' } }
        },
        markers: {
            size: 6,
            hover: { size: 9 }
        },
        tooltip: {
            custom: function({ series, seriesIndex, dataPointIndex, w }) {
                const pt = w.config.series[seriesIndex].data[dataPointIndex];
                if (!pt) return '';
                return `
                    <div class="p-2.5 bg-slate-900 text-white rounded-xl shadow-xl text-xs space-y-1">
                        <div class="font-black text-cyan-400 font-mono">${pt.unit}</div>
                        <div class="text-[11px] text-slate-300 font-semibold truncate max-w-[200px]">${pt.name || '-'}</div>
                        <div class="border-t border-slate-700/80 pt-1 mt-1 flex justify-between gap-3 text-[10.5px]">
                            <span class="text-slate-400">Jam VRA:</span>
                            <span class="font-bold font-mono text-cyan-300">${formatNum(pt.x, 0)} HM</span>
                        </div>
                        <div class="flex justify-between gap-3 text-[10.5px]">
                            <span class="text-slate-400">Konsumsi:</span>
                            <span class="font-bold font-mono text-purple-300">${formatNum(pt.y, 0)} L</span>
                        </div>
                        <div class="flex justify-between gap-3 text-[10.5px]">
                            <span class="text-slate-400">Rasio:</span>
                            <span class="font-bold font-mono text-amber-300">${pt.ratio}</span>
                        </div>
                    </div>
                `;
            }
        },
        legend: {
            position: 'top',
            horizontalAlign: 'center',
            fontSize: '10px',
            fontWeight: 600
        }
    });

    // 3. Render Head-to-Head Table Body
    const tbody = document.getElementById('table-pbi-fuel-vra-body');
    if (tbody) {
        if (comparisonList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-6 text-slate-400 font-medium">Tidak ada unit yang sesuai filter komparasi VRA & BBM.</td></tr>';
            return;
        }

        tbody.innerHTML = comparisonList.slice(0, 150).map(u => {
            const devSign = u.deviation_pct > 0 ? `+${u.deviation_pct}%` : `${u.deviation_pct}%`;
            const devClass = u.deviation_pct > 15 ? 'text-rose-600 font-black' : (u.deviation_pct <= 0 ? 'text-emerald-600 font-bold' : 'text-slate-600');
            
            return `
                <tr class="hover:bg-purple-50/70 dark:hover:bg-purple-950/40 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" onclick="window.pns.drillToUnit('${u.kode_unit}')" title="Klik untuk membuka riwayat profil VRA & BBM unit ${u.kode_unit}">
                    <td class="px-3.5 py-2.5 font-bold text-blue-600 dark:text-sky-400 whitespace-nowrap cursor-pointer hover:underline">
                        <div class="flex items-center gap-1.5 font-mono">
                            <span>${u.kode_unit}</span>
                            <i class="ph-bold ph-arrow-square-out text-[11px] text-purple-500 opacity-70 group-hover:opacity-100"></i>
                        </div>
                    </td>
                    <td class="px-3.5 py-2.5 font-semibold truncate max-w-[160px] text-slate-700 dark:text-slate-200" title="${u.nama_asset}">
                        ${u.nama_asset || '-'}
                    </td>
                    <td class="px-3.5 py-2.5">
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            ${u.kategori || '-'}
                        </span>
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-bold text-cyan-600 dark:text-cyan-400">
                        ${formatNum(u.total_hm, 1)}
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                        ${u.total_km > 0 ? formatNum(u.total_km, 0) : '-'}
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-bold text-purple-600 dark:text-purple-400">
                        ${formatNum(u.total_liter, 0)} L
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                        ${formatRp(u.total_biaya)}
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                        ${u.actual_ratio > 0 ? u.actual_ratio.toFixed(2) + ' ' + (u.ratio_unit || 'L/HM') : '-'}
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono text-slate-400">
                        ${u.target_ratio > 0 ? u.target_ratio.toFixed(1) + ' ' + (u.ratio_unit || 'L/HM') : '-'}
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono ${devClass}">
                        ${u.total_hm > 0 || u.total_km > 0 ? devSign : '-'}
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        ${u.cost_per_hm > 0 ? formatRp(u.cost_per_hm) : '-'}
                    </td>
                    <td class="px-3.5 py-2.5 text-center">
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black border ${u.status_color}" title="${u.recommendation}">
                            ${u.status_label}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// -------------------------------------------------------------
// VIEW 6A: MASTER ASET - 1. OVERVIEW (POWER BI EXECUTIVE)
// -------------------------------------------------------------
export function setAssetEnvFilter(env = 'ALL') {
    currentAssetEnvFilter = env;
    ['ALL', 'IN_BUILDING', 'OUTDOOR'].forEach(e => {
        const btn = document.getElementById(`btn-asset-env-${e.toLowerCase()}`);
        if (btn) {
            if (e === env) {
                btn.className = 'px-3 py-1 text-xs font-black rounded-xl bg-blue-600 text-white shadow-sm transition cursor-pointer';
            } else {
                btn.className = 'px-3 py-1 text-xs font-bold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            }
        }
    });
    applyPbiFilters();
}

let currentAssetOverviewDim = 'location'; // 'location' | 'group' | 'name'
let currentAssetPerfDim = 'section'; // 'section' | 'category' | 'name'
let asset1SearchQuery = '';

function onAsset1Search(query) {
    asset1SearchQuery = query || '';
    if (pbiData.cache) renderAsset1(pbiData.cache.assets, pbiData.cache.maint);
}

function setAssetOverviewDim(dim) {
    currentAssetOverviewDim = dim;
    ['location', 'group', 'name'].forEach(d => {
        const btn = document.getElementById(`btn-asset-dim-${d}`);
        if (btn) {
            if (d === dim) {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-amber-500 text-white shadow-2xs transition cursor-pointer';
            } else {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            }
        }
    });
    const th = document.getElementById('th-asset-overview-dim');
    if (th) th.innerText = dim === 'location' ? 'Location' : (dim === 'group' ? 'Group' : 'Name');
    if (pbiData.cache) renderAsset1(pbiData.cache.assets, pbiData.cache.maint);
}

function setAssetPerfDim(dim) {
    currentAssetPerfDim = dim;
    ['section', 'category', 'name'].forEach(d => {
        const btn = document.getElementById(`btn-asset-perf-${d}`);
        if (btn) {
            if (d === dim) {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-amber-500 text-white shadow-2xs transition cursor-pointer';
            } else {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            }
        }
    });
    const th = document.getElementById('th-asset-perf-dim');
    if (th) th.innerText = dim === 'section' ? 'Section' : (dim === 'category' ? 'Category' : 'Name');
    if (pbiData.cache) renderAsset1(pbiData.cache.assets, pbiData.cache.maint);
}

function renderAsset1(assets, maint = []) {
    if (!assets) return;

    let filteredAssets = assets;
    if (asset1SearchQuery.trim() !== '') {
        const q = asset1SearchQuery.toLowerCase();
        filteredAssets = assets.filter(a => 
            (a.kode_unit && a.kode_unit.toLowerCase().includes(q)) ||
            (a.nama_asset && a.nama_asset.toLowerCase().includes(q)) ||
            (a.nama_asset_detail && a.nama_asset_detail.toLowerCase().includes(q)) ||
            (a.kelompok_asset && a.kelompok_asset.toLowerCase().includes(q)) ||
            (a.kategori_asset && a.kategori_asset.toLowerCase().includes(q)) ||
            (a.location && a.location.toLowerCase().includes(q)) ||
            (a.nama_bangunan && a.nama_bangunan.toLowerCase().includes(q))
        );
    }

    const kpi = measureAssetOverviewKPIs(filteredAssets, maint);

    // 1. Total Assets Card
    setElText('pbi-asset1-total-assets', formatNum(kpi.totalAsset));
    setElText('pbi-asset1-active-count', formatNum(kpi.activeCount));
    setElText('pbi-asset1-nonactive-count', formatNum(kpi.nonActiveCount));

    // 2. Good Assets Card
    setElText('pbi-asset1-good-count', formatNum(kpi.goodCount));
    setElText('pbi-asset1-good-pct', `${kpi.goodPct.toFixed(2)}%`);
    setElText('pbi-asset1-good-lifetime-diatas', formatNum(kpi.lifetimeGoodDiatas));
    setElText('pbi-asset1-good-lifetime-dibawah', formatNum(kpi.lifetimeGoodDibawah));

    // 3. Critical Assets Card
    setElText('pbi-asset1-crit-count', formatNum(kpi.criticalCount));
    setElText('pbi-asset1-crit-pct', `${kpi.criticalPct.toFixed(2)}%`);
    setElText('pbi-asset1-crit-lifetime-dibawah', formatNum(kpi.lifetimeCritDibawah));
    setElText('pbi-asset1-crit-lifetime-diatas', formatNum(kpi.lifetimeCritDiatas));

    // 4. Value Assets Card
    setElText('pbi-asset1-value-assets', formatRp(kpi.totalAcquisition));
    setElText('pbi-asset1-book-ratio', `${kpi.bookRatio.toFixed(0)}%`);
    const topAcqInfo = document.getElementById('pbi-asset1-top-acq-info');
    if (topAcqInfo) topAcqInfo.innerText = `${kpi.topAcqAsset.name} ${formatRp(kpi.topAcqAsset.nominal)} (${kpi.topAcqAsset.pct.toFixed(2)}%)`;
    const topCostInfo = document.getElementById('pbi-asset1-top-cost-info');
    if (topCostInfo) topCostInfo.innerText = `${kpi.topCostAsset.name} ${formatRp(kpi.topCostAsset.nominal)}`;

    // Left Table: Overview Asset By [Location | Group | Name]
    const overviewRows = measureOverviewAssetBy(currentAssetOverviewDim, filteredAssets, maint);
    const tbodyLeft = document.getElementById('table-pbi-asset1-overview-matrix');
    if (tbodyLeft) {
        let totalAssetSum = 0, totalAcqSum = 0, totalMaintSum = 0, totalGoodSum = 0;
        const rowHtml = overviewRows.slice(0, 100).map(r => {
            totalAssetSum += r.totalAsset;
            totalAcqSum += r.acquisition;
            totalMaintSum += r.maintenanceCost;
            totalGoodSum += r.goodCount;
            return `
                <tr onclick="window.pns.drillToOfficeAssets('${r.label}')" class="hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik untuk lihat aset di ${r.label}">
                    <td class="px-3 py-2 font-bold text-slate-800 dark:text-slate-200 uppercase">
                        <div class="flex items-center gap-1.5">
                            <span>${r.label}</span>
                            <i class="ph-bold ph-arrow-square-out text-[11px] text-emerald-500 opacity-0 group-hover:opacity-100 transition"></i>
                        </div>
                    </td>
                    <td class="px-2.5 py-2 text-right font-mono">${formatNum(r.totalAsset)}</td>
                    <td class="px-2.5 py-2 text-right font-mono font-bold text-emerald-600">
                        <div class="flex items-center justify-end gap-1.5">
                            <div class="w-12 bg-emerald-100 dark:bg-emerald-950/40 rounded-full h-1.5 overflow-hidden">
                                <div class="bg-emerald-500 h-full rounded-full" style="width: ${Math.min(100, Math.max(0, r.goodPct))}%"></div>
                            </div>
                            <span>${r.goodPct.toFixed(2)}%</span>
                        </div>
                    </td>
                    <td class="px-2.5 py-2 text-right font-mono">${formatRp(r.acquisition)}</td>
                    <td class="px-2.5 py-2 text-right font-mono text-amber-600">${r.maintenanceCost > 0 ? formatRp(r.maintenanceCost) : '-'}</td>
                </tr>
            `;
        }).join('');

        const totalGoodPct = totalAssetSum > 0 ? (totalGoodSum / totalAssetSum) * 100 : 0;
        const footerHtml = `
            <tr class="bg-slate-100/80 dark:bg-slate-800/90 font-black text-xs border-t-2 border-slate-300 dark:border-slate-700">
                <td class="px-3 py-2 text-slate-900 dark:text-white uppercase">Total</td>
                <td class="px-2.5 py-2 text-right font-mono">${formatNum(totalAssetSum)}</td>
                <td class="px-2.5 py-2 text-right font-mono text-emerald-600">${totalGoodPct.toFixed(2)}%</td>
                <td class="px-2.5 py-2 text-right font-mono">${formatRp(totalAcqSum)}</td>
                <td class="px-2.5 py-2 text-right font-mono text-amber-600">${formatRp(totalMaintSum)}</td>
            </tr>
        `;
        tbodyLeft.innerHTML = rowHtml + footerHtml;
    }

    // Mini Donut: Composition Asset by Type
    const compType = measureAssetCompositionType(filteredAssets);
    const valCount = compType.valuable?.count || 0;
    const valPct = compType.valuable?.pct || 0;
    const nonValCount = compType.nonValuable?.count || 0;
    const nonValPct = compType.nonValuable?.pct || 0;

    renderApex('#chart-pbi-asset1-type-donut', {
        chart: { type: 'donut', height: 180 },
        series: [valCount, nonValCount],
        labels: [
            `${formatNum(valCount)} (${valPct.toFixed(2)}%)`,
            `${formatNum(nonValCount)} (${nonValPct.toFixed(2)}%)`
        ],
        colors: ['#10b981', '#f59e0b'],
        plotOptions: { 
            pie: { 
                donut: { 
                    size: '70%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total Aset',
                            formatter: () => formatNum(valCount + nonValCount, 0),
                            style: { fontSize: '11px', fontWeight: 800 }
                        }
                    }
                } 
            } 
        },
        dataLabels: { enabled: false },
        legend: { position: 'bottom', fontSize: '10px', fontWeight: 700 }
    });

    // Condition Progress Bars
    const condBars = measureAssetConditionBars(filteredAssets);
    const condContainer = document.getElementById('container-pbi-asset1-condition-bars');
    if (condContainer) {
        const items = [
            { label: 'Repair', count: condBars.repair.count, pct: condBars.repair.pct, color: 'bg-amber-500', barBg: 'bg-amber-100 dark:bg-amber-950/40' },
            { label: 'Lost', count: condBars.lost.count, pct: condBars.lost.pct, color: 'bg-sky-500', barBg: 'bg-sky-100 dark:sky-950/40' },
            { label: 'Good Condition', count: condBars.good.count, pct: condBars.good.pct, color: 'bg-blue-600', barBg: 'bg-blue-100 dark:bg-blue-950/40' },
            { label: 'Disposal', count: condBars.disposal.count, pct: condBars.disposal.pct, color: 'bg-slate-600', barBg: 'bg-slate-100 dark:bg-slate-800' },
            { label: 'Broken', count: condBars.broken.count, pct: condBars.broken.pct, color: 'bg-rose-500', barBg: 'bg-rose-100 dark:bg-rose-950/40' }
        ];

        condContainer.innerHTML = items.map(item => `
            <div class="space-y-1">
                <div class="flex items-center justify-between text-xs font-semibold">
                    <span class="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <span class="w-2.5 h-2.5 rounded-full ${item.color} inline-block"></span>
                        ${item.label}
                    </span>
                    <span class="font-mono text-slate-900 dark:text-white font-bold">${formatNum(item.count)} <span class="text-slate-400 font-normal">(${item.pct.toFixed(2)}%)</span></span>
                </div>
                <div class="w-full ${item.barBg} h-2 rounded-full overflow-hidden">
                    <div class="${item.color} h-full rounded-full transition-all duration-500" style="width: ${Math.min(100, Math.max(0, item.pct))}%"></div>
                </div>
            </div>
        `).join('');
    }

    // Right Table: Performance Asset By Section / Category / Name
    const perfRows = measurePerformanceAssetBy(currentAssetPerfDim, filteredAssets);
    const tbodyRight = document.getElementById('table-pbi-asset1-perf-matrix');
    if (tbodyRight) {
        let sumTotal = 0, sumGood = 0, sumRepair = 0, sumBroken = 0, sumLost = 0, sumDisposal = 0;
        const rowHtml = perfRows.slice(0, 100).map(r => {
            sumTotal += r.totalAsset;
            sumGood += r.good;
            sumRepair += r.repair;
            sumBroken += r.broken;
            sumLost += r.lost;
            sumDisposal += r.disposal;

            const goodBar = r.goodPct > 0 ? `<div class="relative w-full h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-end px-1 overflow-hidden"><div class="absolute left-0 top-0 bottom-0 bg-emerald-500/30 rounded" style="width: ${r.goodPct}%"></div><span class="relative font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[10.5px]">${r.goodPct.toFixed(2)}%</span></div>` : '-';
            const repairBar = r.repairPct > 0 ? `<div class="relative w-full h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-end px-1 overflow-hidden"><div class="absolute left-0 top-0 bottom-0 bg-rose-500/30 rounded" style="width: ${r.repairPct}%"></div><span class="relative font-mono text-rose-500 text-[10.5px]">${r.repairPct.toFixed(2)}%</span></div>` : '-';
            const brokenBar = r.brokenPct > 0 ? `<div class="relative w-full h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-end px-1 overflow-hidden"><div class="absolute left-0 top-0 bottom-0 bg-amber-500/30 rounded" style="width: ${r.brokenPct}%"></div><span class="relative font-mono text-amber-600 text-[10.5px]">${r.brokenPct.toFixed(2)}%</span></div>` : '-';
            const lostBar = r.lostPct > 0 ? `<div class="relative w-full h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-end px-1 overflow-hidden"><div class="absolute left-0 top-0 bottom-0 bg-slate-500/30 rounded" style="width: ${r.lostPct}%"></div><span class="relative font-mono text-slate-500 text-[10.5px]">${r.lostPct.toFixed(2)}%</span></div>` : '-';
            const dispBar = r.disposalPct > 0 ? `<div class="relative w-full h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-end px-1 overflow-hidden"><div class="absolute left-0 top-0 bottom-0 bg-gray-500/30 rounded" style="width: ${r.disposalPct}%"></div><span class="relative font-mono text-slate-400 text-[10.5px]">${r.disposalPct.toFixed(2)}%</span></div>` : '-';

            return `
                <tr onclick="window.pns.drillToOfficeAssets('', '${r.label}')" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik untuk lihat aset">
                    <td class="px-3 py-1.5 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[130px]">${r.label}</td>
                    <td class="px-2 py-1.5 text-right font-mono font-bold">${formatNum(r.totalAsset)}</td>
                    <td class="px-2 py-1.5 text-right">${goodBar}</td>
                    <td class="px-2 py-1.5 text-right">${repairBar}</td>
                    <td class="px-2 py-1.5 text-right">${brokenBar}</td>
                    <td class="px-2 py-1.5 text-right">${lostBar}</td>
                    <td class="px-2 py-1.5 text-right">${dispBar}</td>
                </tr>
            `;
        }).join('');

        const avgGood = sumTotal > 0 ? (sumGood / sumTotal) * 100 : 0;
        const avgRepair = sumTotal > 0 ? (sumRepair / sumTotal) * 100 : 0;
        const avgBroken = sumTotal > 0 ? (sumBroken / sumTotal) * 100 : 0;
        const avgLost = sumTotal > 0 ? (sumLost / sumTotal) * 100 : 0;
        const avgDisposal = sumTotal > 0 ? (sumDisposal / sumTotal) * 100 : 0;

        const footerHtml = `
            <tr class="bg-slate-100/80 dark:bg-slate-800/90 font-black text-xs border-t-2 border-slate-300 dark:border-slate-700">
                <td class="px-3 py-2 text-slate-900 dark:text-white uppercase">Total</td>
                <td class="px-2.5 py-2 text-right font-mono">${formatNum(sumTotal)}</td>
                <td class="px-2.5 py-2 text-right font-mono text-emerald-600">${avgGood.toFixed(2)}%</td>
                <td class="px-2.5 py-2 text-right font-mono text-amber-600">${avgRepair.toFixed(2)}%</td>
                <td class="px-2.5 py-2 text-right font-mono text-rose-600">${avgBroken.toFixed(2)}%</td>
                <td class="px-2.5 py-2 text-right font-mono text-gray-500">${avgLost.toFixed(2)}%</td>
                <td class="px-2.5 py-2 text-right font-mono text-slate-400">${avgDisposal.toFixed(2)}%</td>
            </tr>
        `;
        tbodyRight.innerHTML = rowHtml + footerHtml;
    }
}

function renderAsset2(assets, maint) {
    const container = document.getElementById('pbi-asset2-office-grid');
    if (!container) return;

    const officeData = measureAssetByOfficeLocations(assets, maint);

    container.innerHTML = officeData.map(o => {
        const topKelompok = o.kelompokBreakdown.slice(0, 8);
        return `
            <div class="pns-card p-4 flex flex-col justify-between border-t-4 border-t-emerald-500 shadow-xs hover:shadow-md transition bg-white dark:bg-slate-900 rounded-2xl">
                <div>
                    <!-- Card Header -->
                    <div class="flex items-start justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 text-base shadow-2xs">
                                <i class="ph-bold ${o.icon || 'ph-buildings'}"></i>
                            </div>
                            <div>
                                <h3 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wide">${o.label}</h3>
                                <span class="text-[9.5px] text-slate-400 font-medium block">${o.desc}</span>
                            </div>
                        </div>
                        <div class="px-2 py-0.5 rounded-full border-2 border-emerald-500 flex flex-col items-center justify-center text-center bg-emerald-50/70 dark:bg-emerald-950/50 shrink-0 min-w-[50px]">
                            <span class="text-[10px] font-black text-emerald-700 dark:text-emerald-300 leading-tight">${o.goodPct.toFixed(1)}%</span>
                            <span class="text-[7.5px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">GOOD</span>
                        </div>
                    </div>

                    <!-- Total Assets & Lifetime Indicators -->
                    <div class="flex items-center justify-between my-2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div>
                            <span class="text-[8.5px] font-extrabold uppercase text-slate-400 block tracking-wider">TOTAL ASSETS</span>
                            <span class="text-base font-black text-slate-900 dark:text-white tracking-tight">${formatNum(o.totalAsset)}</span>
                        </div>
                        <div class="text-right text-[10px] font-mono flex items-center gap-1" title="Lifetime Assets: ${formatNum(o.lifetimeUp)} Diatas Standar | ${formatNum(o.lifetimeDown)} Dibawah Standar">
                            <span class="text-emerald-600 font-black flex items-center gap-0.5"><i class="ph-bold ph-arrow-up text-[9px]"></i> ${formatNum(o.lifetimeUp)}</span>
                            <span class="text-slate-300 dark:text-slate-600 font-normal">|</span>
                            <span class="text-rose-500 font-black flex items-center gap-0.5"><i class="ph-bold ph-arrow-down text-[9px]"></i> ${formatNum(o.lifetimeDown)}</span>
                        </div>
                    </div>

                    <!-- In-Building vs Outdoor Breakdown Pill -->
                    <div class="grid grid-cols-2 gap-1.5 my-1.5">
                        <div class="px-2 py-0.5 bg-blue-50/70 dark:bg-blue-950/40 rounded-lg border border-blue-100 dark:border-blue-900/40 text-[9px] font-bold flex items-center justify-between text-blue-700 dark:text-sky-300">
                            <span class="flex items-center gap-1"><i class="ph-bold ph-buildings text-[9px]"></i> In-Building:</span>
                            <b class="font-mono">${formatNum(o.inBuildingCount)}</b>
                        </div>
                        <div class="px-2 py-0.5 bg-amber-50/70 dark:bg-amber-950/40 rounded-lg border border-amber-100 dark:border-amber-900/40 text-[9px] font-bold flex items-center justify-between text-amber-700 dark:text-amber-300">
                            <span class="flex items-center gap-1"><i class="ph-bold ph-tree text-[9px]"></i> Outdoor:</span>
                            <b class="font-mono">${formatNum(o.outdoorCount)}</b>
                        </div>
                    </div>

                    <!-- 3 Financial Metrics Grid -->
                    <div class="grid grid-cols-3 gap-1 my-2 text-[9.5px] font-mono">
                        <div class="bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                            <span class="text-[7.5px] font-extrabold text-slate-400 uppercase block tracking-wider">Acquisition</span>
                            <b class="text-blue-600 dark:text-sky-400 truncate block mt-0.5 font-black">${formatRp(o.acquisition)}</b>
                        </div>
                        <div class="bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                            <span class="text-[7.5px] font-extrabold text-slate-400 uppercase block tracking-wider">Book Value</span>
                            <b class="text-emerald-600 truncate block mt-0.5 font-black">${formatRp(o.netBookValue)}</b>
                        </div>
                        <div class="bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                            <span class="text-[7.5px] font-extrabold text-slate-400 uppercase block tracking-wider">Maintenance</span>
                            <b class="text-amber-600 truncate block mt-0.5 font-black">${formatRp(o.maintenanceCost)}</b>
                        </div>
                    </div>

                    <!-- Kelompok Asset Condition Matrix Table (Interactive Drill-Through) -->
                    <div class="mt-2 overflow-hidden rounded-xl border border-slate-200/90 dark:border-slate-700/80 shadow-2xs">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="bg-slate-100 dark:bg-slate-800 text-[8.5px] font-black uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                    <th class="px-2 py-1">Asset</th>
                                    <th class="px-1 py-1 text-right text-emerald-600">Good</th>
                                    <th class="px-1 py-1 text-right text-amber-600">Repair</th>
                                    <th class="px-1 py-1 text-right text-rose-600">Broken</th>
                                    <th class="px-1 py-1 text-right text-slate-400">Lost</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
                                ${topKelompok.map(k => `
                                    <tr oncontextmenu="window.pns.openContextMenu(event, { office: '${o.label}', kelompok: '${k.kel}' })" onclick="window.pns.drillToAssetDrillthrough({ office: '${o.label}', kelompok: '${k.kel}' })" class="hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition border-b border-slate-100 dark:border-slate-800/60 cursor-pointer group" title="Klik untuk Drillthrough ${k.kel} di ${o.label}">
                                        <td class="px-2 py-1 font-bold text-slate-700 dark:text-slate-300 truncate max-w-[100px] text-[9.5px] group-hover:text-emerald-600">${k.kel}</td>
                                        <td class="px-1 py-1 text-right font-mono text-emerald-600 font-bold text-[9.5px]">${k.goodPct > 0 ? k.goodPct.toFixed(0) + '%' : '-'}</td>
                                        <td class="px-1 py-1 text-right font-mono text-amber-600 text-[9.5px]">${k.repairPct > 0 ? k.repairPct.toFixed(0) + '%' : '-'}</td>
                                        <td class="px-1 py-1 text-right font-mono text-rose-600 text-[9.5px]">${k.brokenPct > 0 ? k.brokenPct.toFixed(0) + '%' : '-'}</td>
                                        <td class="px-1 py-1 text-right font-mono text-slate-400 text-[9.5px]">${k.lostPct > 0 ? k.lostPct.toFixed(0) + '%' : '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Action Button: View Details > -->
                <button type="button" onclick="window.pns.openOfficeDetail('${o.label}')" class="mt-3 w-full py-2 rounded-xl bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-emerald-600 dark:hover:text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs">
                    <span>View Details</span>
                    <i class="ph-bold ph-caret-right text-xs"></i>
                </button>
            </div>
        `;
    }).join('');
}

let currentSelectedOffice = 'CENTRAL OFFICE';
let currentOfficePerfDim = 'section'; // 'section' | 'kategori' | 'nama'
let currentDrillFilters = {};
let selectedContextFilters = {};

function filterByOfficeLocation(loc) {
    const locSelect = document.getElementById('slicer-location');
    if (locSelect) locSelect.value = loc;
    applyPbiFilters();
}

function openOfficeDetail(office) {
    currentSelectedOffice = office || 'CENTRAL OFFICE';
    switchView('view-asset-office-detail');
}

function backToOfficeList() {
    switchView('view-asset-2');
}

function openOfficeDrillthrough() {
    drillToAssetDrillthrough({ office: currentSelectedOffice });
}

function drillToAssetDrillthrough(filters = {}) {
    currentDrillFilters = filters || {};
    drillSearchQuery = '';
    const searchEl = document.getElementById('slicer-drill-search');
    if (searchEl) searchEl.value = '';
    switchView('view-asset-drillthrough');
}

function backFromDrillthrough() {
    if (currentDrillFilters.env || currentDrillFilters.bangunan) {
        switchView('view-asset-in-out');
    } else if (currentDrillFilters.office) {
        switchView('view-asset-office-detail');
    } else {
        switchView('view-asset-1');
    }
}

function setOfficeDetailPerfDim(dim) {
    currentOfficePerfDim = dim;
    const dims = ['section', 'category', 'name'];
    dims.forEach(d => {
        const btn = document.getElementById(`btn-offdetail-perf-${d}`);
        if (btn) {
            if (d === dim) {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-amber-500 text-white shadow-2xs transition cursor-pointer';
            } else {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            }
        }
    });

    const thDim = document.getElementById('th-offdetail-perf-dim');
    if (thDim) {
        if (dim === 'category') thDim.innerText = 'CATEGORY';
        else if (dim === 'name') thDim.innerText = 'NAMA ASET';
        else thDim.innerText = 'SECTION';
    }

    if (pbiData.cache) {
        renderAssetOfficeDetail(currentSelectedOffice, pbiData.cache.assets, pbiData.cache.maint);
    }
}

function onOfficeDetailFilterChange() {
    if (pbiData.cache) {
        renderAssetOfficeDetail(currentSelectedOffice, pbiData.cache.assets, pbiData.cache.maint);
    }
}

// -------------------------------------------------------------
// VIEW 6E: MASTER ASET - DETAIL ASSET PER LOKASI (CENTRAL, FACTORY, ETC.)
// -------------------------------------------------------------
function renderAssetOfficeDetail(officeName, assets, maint = []) {
    if (!assets) return;

    const selType = document.getElementById('slicer-offdetail-type')?.value || 'ALL';
    const selGroup = document.getElementById('slicer-offdetail-group')?.value || 'ALL';
    const selCat = document.getElementById('slicer-offdetail-category')?.value || 'ALL';

    const detail = measureOfficeDetail(officeName, assets, maint, {
        type: selType,
        group: selGroup,
        category: selCat
    });

    // Header Title
    setElText('pbi-offdetail-title', officeName);
    setElText('pbi-offdetail-subtitle', `Detail Asset ${officeName}`);

    // Update Category Slicer Dropdown
    const catSelect = document.getElementById('slicer-offdetail-category');
    if (catSelect && detail.kategoriRows && selCat === 'ALL') {
        const currentVal = catSelect.value || 'ALL';
        catSelect.innerHTML = '<option value="ALL">All</option>' + detail.kategoriRows.map(k => `<option value="${k.kategori}">${k.kategori} (${k.totalAsset})</option>`).join('');
        if (detail.kategoriRows.some(k => k.kategori === currentVal)) {
            catSelect.value = currentVal;
        }
    }

    // 1. Total Assets Card
    setElText('pbi-offdetail-total-assets', formatNum(detail.totalAsset));
    setElText('pbi-offdetail-active-count', formatNum(detail.activeCount));
    setElText('pbi-offdetail-nonactive-count', formatNum(detail.nonActiveCount));

    // 2. Good Assets Card
    setElText('pbi-offdetail-good-count', formatNum(detail.goodCount));
    setElText('pbi-offdetail-good-pct', `${detail.goodPct.toFixed(2)}%`);
    setElText('pbi-offdetail-good-down', `${formatNum(detail.lifetimeGoodDibawah)} ↓`);
    setElText('pbi-offdetail-good-up', `${formatNum(detail.lifetimeGoodDiatas)} ↑`);

    // 3. Critical Assets Card
    setElText('pbi-offdetail-crit-count', formatNum(detail.criticalCount));
    setElText('pbi-offdetail-crit-pct', `${detail.criticalPct.toFixed(2)}%`);
    setElText('pbi-offdetail-crit-down', `${formatNum(detail.lifetimeCritDibawah)} ↓`);
    setElText('pbi-offdetail-crit-up', `${formatNum(detail.lifetimeCritDiatas)} ↑`);

    // 4. Acquisition Card
    setElText('pbi-offdetail-acq', formatNum(detail.acquisition, 0));

    // 5. Maintenance Cost Card
    setElText('pbi-offdetail-maint', formatNum(detail.maintenanceCost, 0));
    setElText('pbi-offdetail-maint-ratio', detail.maintenanceRatio);

    // Left Top Table: KELOMPOK ASSET
    const tbodyKelompok = document.getElementById('table-pbi-offdetail-kelompok');
    if (tbodyKelompok) {
        let totalAssetSum = 0, sumStd = 0, sumUmur = 0;
        const rowHtml = detail.kelompokRows.map(k => {
            totalAssetSum += k.totalAsset;
            sumStd += k.avgStandarUmur * k.totalAsset;
            sumUmur += k.avgUmurAsset * k.totalAsset;
            return `
                <tr oncontextmenu="window.pns.openContextMenu(event, { office: '${officeName}', kelompok: '${k.kelompok}' })" onclick="window.pns.drillToAssetDrillthrough({ office: '${officeName}', kelompok: '${k.kelompok}' })" class="hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik / Klik Kanan untuk Drillthrough ${k.kelompok}">
                    <td class="px-3 py-2 font-bold text-slate-800 dark:text-slate-200 uppercase">${k.kelompok}</td>
                    <td class="px-2.5 py-2 text-right font-mono">${formatNum(k.totalAsset)}</td>
                    <td class="px-2.5 py-2 text-right font-mono">${k.avgStandarUmur}</td>
                    <td class="px-2.5 py-2 text-right font-mono">${k.avgUmurAsset}</td>
                </tr>
            `;
        }).join('');

        const avgStdTotal = totalAssetSum > 0 ? Math.round(sumStd / totalAssetSum) : 13;
        const avgUmurTotal = totalAssetSum > 0 ? Math.round(sumUmur / totalAssetSum) : 7;

        const footerHtml = `
            <tr class="bg-slate-100/80 dark:bg-slate-800/90 font-black text-xs border-t-2 border-slate-300 dark:border-slate-700">
                <td class="px-3 py-2 text-slate-900 dark:text-white uppercase">Total</td>
                <td class="px-2.5 py-2 text-right font-mono">${formatNum(totalAssetSum)}</td>
                <td class="px-2.5 py-2 text-right font-mono">${avgStdTotal}</td>
                <td class="px-2.5 py-2 text-right font-mono">${avgUmurTotal}</td>
            </tr>
        `;
        tbodyKelompok.innerHTML = rowHtml + footerHtml;
    }

    // Left Bottom Table: KATEGORI ASSET (Expandable Tree [+])
    const tbodyKategori = document.getElementById('table-pbi-offdetail-kategori');
    if (tbodyKategori) {
        let totalAssetSum = 0, totalAcqSum = 0, totalMaintSum = 0, totalGoodSum = 0;
        const rowHtml = detail.kategoriRows.map((k, idx) => {
            totalAssetSum += k.totalAsset;
            totalAcqSum += k.acquisition;
            totalMaintSum += k.maintenanceCost;
            if (k.goodPct > 0) totalGoodSum += (k.goodPct * k.totalAsset) / 100;

            const rowId = `kategori-child-${idx}`;
            const childRows = (k.assets || []).slice(0, 10).map(a => `
                <tr class="bg-slate-50/70 dark:bg-slate-900/60 text-[11px] border-b border-slate-100 dark:border-slate-800/40">
                    <td class="pl-8 pr-3 py-1.5 text-slate-600 dark:text-slate-400 font-mono">
                        <span class="text-blue-600 font-bold">${a.kode_unit}</span> - ${a.nama_asset}
                    </td>
                    <td class="px-2.5 py-1.5 text-right font-mono">1</td>
                    <td class="px-2.5 py-1.5 text-right font-mono text-emerald-600">${a.kondisi === 'Good Condition' ? '100%' : '0%'}</td>
                    <td class="px-2.5 py-1.5 text-right font-mono">${formatNum(a.total_harga_perolehan, 0)}</td>
                    <td class="px-2.5 py-1.5 text-right font-mono">-</td>
                </tr>
            `).join('');

            return `
                <tr oncontextmenu="window.pns.openContextMenu(event, { office: '${officeName}', kategori: '${k.kategori}' })" onclick="window.pns.drillToAssetDrillthrough({ office: '${officeName}', kategori: '${k.kategori}' })" class="hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik untuk Drillthrough ${k.kategori}">
                    <td class="px-3 py-2 font-bold text-slate-800 dark:text-slate-200">
                        <div class="flex items-center gap-1.5">
                            <button type="button" onclick="event.stopPropagation(); window.toggleKategoriRow('${rowId}')" class="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-emerald-600 hover:text-white flex items-center justify-center text-[11px] font-black cursor-pointer transition shadow-2xs">
                                <span id="icon-${rowId}">+</span>
                            </button>
                            <span class="truncate max-w-[170px] group-hover:text-emerald-600 transition">${k.kategori}</span>
                        </div>
                    </td>
                    <td class="px-2.5 py-2 text-right font-mono font-bold">${formatNum(k.totalAsset)}</td>
                    <td class="px-2.5 py-2 text-right font-mono text-emerald-600 font-bold">${k.goodPct.toFixed(2)}%</td>
                    <td class="px-2.5 py-2 text-right font-mono">${formatNum(k.acquisition, 0)}</td>
                    <td class="px-2.5 py-2 text-right font-mono text-amber-600">${formatNum(k.maintenanceCost, 0)}</td>
                </tr>
                <tr id="${rowId}" class="hidden transition-all">
                    <td colspan="5" class="p-0 border-b border-slate-200 dark:border-slate-700">
                        <table class="w-full text-xs">${childRows}</table>
                    </td>
                </tr>
            `;
        }).join('');

        const totalGoodPct = totalAssetSum > 0 ? (totalGoodSum / totalAssetSum) * 100 : 83.60;
        const footerHtml = `
            <tr class="bg-slate-100/80 dark:bg-slate-800/90 font-black text-xs border-t-2 border-slate-300 dark:border-slate-700">
                <td class="px-3 py-2 text-slate-900 dark:text-white uppercase">Total</td>
                <td class="px-2.5 py-2 text-right font-mono">${formatNum(totalAssetSum)}</td>
                <td class="px-2.5 py-2 text-right font-mono text-emerald-600">${totalGoodPct.toFixed(2)}%</td>
                <td class="px-2.5 py-2 text-right font-mono">${formatNum(detail.acquisition, 0)}</td>
                <td class="px-2.5 py-2 text-right font-mono text-amber-600">${formatNum(detail.maintenanceCost, 0)}</td>
            </tr>
        `;
        tbodyKategori.innerHTML = rowHtml + footerHtml;
    }

    // Right Column: Performance Asset By Section / Category / Name (Matching Image 5)
    let perfAssets = assets.filter(a => inferAssetLocation(a) === officeName);
    if (selType && selType !== 'ALL') {
        if (selType === 'valuable') {
            perfAssets = perfAssets.filter(a => (Number(a.total_harga_perolehan) || 0) > 0 || (Number(a.Nilai_buku) || 0) > 0);
        } else if (selType === 'non_valuable') {
            perfAssets = perfAssets.filter(a => (Number(a.total_harga_perolehan) || 0) <= 0 && (Number(a.Nilai_buku) || 0) <= 0);
        }
    }
    if (selGroup && selGroup !== 'ALL') {
        perfAssets = perfAssets.filter(a => (a.kelompok_asset || a.kode_kelompok || '').toUpperCase().includes(selGroup.toUpperCase()));
    }
    if (selCat && selCat !== 'ALL') {
        perfAssets = perfAssets.filter(a => (a.kategori_asset || a.kode_kategori || '').toUpperCase() === selCat.toUpperCase());
    }

    const perfRows = measurePerformanceAssetBy(currentOfficePerfDim, perfAssets);
    const tbodyPerf = document.getElementById('table-pbi-offdetail-perf');
    if (tbodyPerf) {
        let sumTotal = 0, sumGood = 0, sumRepair = 0, sumBroken = 0, sumLost = 0, sumDisposal = 0;
        const rowHtml = perfRows.map(r => {
            sumTotal += r.totalAsset;
            sumGood += r.good;
            sumRepair += r.repair;
            sumBroken += r.broken;
            sumLost += r.lost;
            sumDisposal += r.disposal;

            const goodBar = r.goodPct > 0 ? `<div class="relative w-full h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-end px-1 overflow-hidden"><div class="absolute left-0 top-0 bottom-0 bg-emerald-500/30 rounded" style="width: ${r.goodPct}%"></div><span class="relative font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[10.5px]">${r.goodPct.toFixed(2)}%</span></div>` : '-';
            const repairBar = r.repairPct > 0 ? `<div class="relative w-full h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-end px-1 overflow-hidden"><div class="absolute left-0 top-0 bottom-0 bg-rose-500/30 rounded" style="width: ${r.repairPct}%"></div><span class="relative font-mono text-rose-500 text-[10.5px]">${r.repairPct.toFixed(2)}%</span></div>` : '-';
            const brokenBar = r.brokenPct > 0 ? `<div class="relative w-full h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-end px-1 overflow-hidden"><div class="absolute left-0 top-0 bottom-0 bg-amber-500/30 rounded" style="width: ${r.brokenPct}%"></div><span class="relative font-mono text-amber-600 text-[10.5px]">${r.brokenPct.toFixed(2)}%</span></div>` : '-';
            const lostBar = r.lostPct > 0 ? `<div class="relative w-full h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-end px-1 overflow-hidden"><div class="absolute left-0 top-0 bottom-0 bg-slate-500/30 rounded" style="width: ${r.lostPct}%"></div><span class="relative font-mono text-slate-500 text-[10.5px]">${r.lostPct.toFixed(2)}%</span></div>` : '-';
            const dispBar = r.disposalPct > 0 ? `<div class="relative w-full h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-end px-1 overflow-hidden"><div class="absolute left-0 top-0 bottom-0 bg-gray-500/30 rounded" style="width: ${r.disposalPct}%"></div><span class="relative font-mono text-slate-400 text-[10.5px]">${r.disposalPct.toFixed(2)}%</span></div>` : '-';

            const drillParam = (currentOfficePerfDim === 'category' || currentOfficePerfDim === 'kategori') 
                ? `{ office: '${officeName}', kategori: '${r.label}' }`
                : (currentOfficePerfDim === 'name' || currentOfficePerfDim === 'nama')
                ? `{ office: '${officeName}', search: '${r.label}' }`
                : `{ office: '${officeName}', section: '${r.label}' }`;

            return `
                <tr oncontextmenu="window.pns.openContextMenu(event, ${drillParam})" onclick="window.pns.drillToAssetDrillthrough(${drillParam})" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik / Klik Kanan untuk Drillthrough ${r.label}">
                    <td class="px-3 py-1.5 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[160px]">${r.label}</td>
                    <td class="px-2 py-1.5 text-right font-mono font-bold">${formatNum(r.totalAsset)}</td>
                    <td class="px-2 py-1.5 text-right">${goodBar}</td>
                    <td class="px-2 py-1.5 text-right">${repairBar}</td>
                    <td class="px-2 py-1.5 text-right">${brokenBar}</td>
                    <td class="px-2 py-1.5 text-right">${lostBar}</td>
                    <td class="px-2 py-1.5 text-right">${dispBar}</td>
                </tr>
            `;
        }).join('');

        const avgGood = sumTotal > 0 ? (sumGood / sumTotal) * 100 : 0;
        const avgRepair = sumTotal > 0 ? (sumRepair / sumTotal) * 100 : 0;
        const avgBroken = sumTotal > 0 ? (sumBroken / sumTotal) * 100 : 0;
        const avgLost = sumTotal > 0 ? (sumLost / sumTotal) * 100 : 0;
        const avgDisposal = sumTotal > 0 ? (sumDisposal / sumTotal) * 100 : 0;

        const footerHtml = `
            <tr class="bg-slate-100/80 dark:bg-slate-800/90 font-black text-xs border-t-2 border-slate-300 dark:border-slate-700">
                <td class="px-3 py-2 text-slate-900 dark:text-white uppercase">Total</td>
                <td class="px-2 py-2 text-right font-mono">${formatNum(sumTotal)}</td>
                <td class="px-2 py-2 text-right font-mono text-emerald-600 font-bold">${avgGood.toFixed(2)}%</td>
                <td class="px-2 py-2 text-right font-mono text-rose-500">${avgRepair > 0 ? avgRepair.toFixed(2) + '%' : '-'}</td>
                <td class="px-2 py-2 text-right font-mono text-amber-600">${avgBroken > 0 ? avgBroken.toFixed(2) + '%' : '-'}</td>
                <td class="px-2 py-2 text-right font-mono text-slate-500">${avgLost > 0 ? avgLost.toFixed(2) + '%' : '-'}</td>
                <td class="px-2 py-2 text-right font-mono text-slate-400">${avgDisposal > 0 ? avgDisposal.toFixed(2) + '%' : '-'}</td>
            </tr>
        `;
        tbodyPerf.innerHTML = rowHtml + footerHtml;
    }
}

export function toggleKategoriRow(rowId) {
    const row = document.getElementById(rowId);
    const icon = document.getElementById(`icon-${rowId}`);
    if (row) {
        row.classList.toggle('hidden');
        if (icon) icon.innerText = row.classList.contains('hidden') ? '+' : '−';
    }
}

// -------------------------------------------------------------
// VIEW 6F: MASTER ASET - DT.DETAILS.ASSETS (DRILLTHROUGH TABLE VIEW)
// -------------------------------------------------------------
let drillSearchQuery = '';

export function onDrillSearch(q) {
    drillSearchQuery = q || '';
    if (pbiData.cache) renderAssetDrillthrough(currentDrillFilters, pbiData.cache.assets, pbiData.cache.maint);
}

export function exportDrillCsv() {
    if (!pbiData.cache) return;
    const res = measureAssetDrillthrough({ ...currentDrillFilters, search: drillSearchQuery }, pbiData.cache.assets, pbiData.cache.maint);
    if (!res.assets || res.assets.length === 0) {
        alert("Tidak ada data untuk diekspor.");
        return;
    }

    const headers = ["Kode Unit", "Nama Asset", "Kelompok", "Kategori", "Lokasi Kantor", "Tipe Lokasi", "Nama Bangunan", "Detail Lokasi", "Kondisi", "Tanggal Perolehan", "Harga Perolehan", "Nilai Buku"];
    const rows = res.assets.map(a => [
        `"${a.kode_unit || ''}"`,
        `"${(a.nama_asset || '').replace(/"/g, '""')}"`,
        `"${a.kode_kelompok || ''}"`,
        `"${a.kode_kategori || ''}"`,
        `"${a.location || ''}"`,
        `"${a.location_type || ''}"`,
        `"${(a.nama_bangunan || '').replace(/"/g, '""')}"`,
        `"${(a.detail_lokasi || '').replace(/"/g, '""')}"`,
        `"${a.kondisi || ''}"`,
        `"${a.tanggal_perolehan || ''}"`,
        a.total_harga_perolehan || 0,
        a.Nilai_buku || 0
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `DT_Details_Assets_${new Date().toISOString().substring(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderAssetDrillthrough(filters = {}, assets = [], maint = []) {
    const combinedFilters = { ...filters, search: drillSearchQuery };
    const res = measureAssetDrillthrough(combinedFilters, assets, maint);

    // Subtitle filter description
    const filterDesc = [];
    if (filters.office && filters.office !== 'ALL') filterDesc.push(`Lokasi: ${filters.office}`);
    if (filters.bangunan && filters.bangunan !== 'ALL') filterDesc.push(`Bangunan: ${filters.bangunan}`);
    if (filters.env && filters.env !== 'ALL') filterDesc.push(filters.env === 'IN_BUILDING' ? '🏢 In-Building' : '🚜 Outdoor');
    if (filters.kelompok && filters.kelompok !== 'ALL') filterDesc.push(`Kelompok: ${filters.kelompok}`);
    if (filters.kategori && filters.kategori !== 'ALL') filterDesc.push(`Kategori: ${filters.kategori}`);
    if (filters.section && filters.section !== 'ALL') filterDesc.push(`Section: ${filters.section}`);
    if (filters.kondisi && filters.kondisi !== 'ALL') filterDesc.push(`Kondisi: ${filters.kondisi}`);

    setElText('pbi-drill-subtitle', filterDesc.length > 0 ? `Filter: ${filterDesc.join(' | ')}` : 'Detail Seluruh Aset Terdata');
    setElText('pbi-drill-count', formatNum(res.totalFiltered));

    // 5 Summary Mini Cards
    const summary = res.summary;
    setElText('pbi-drill-kpi-total', formatNum(summary.total_asset));
    setElText('pbi-drill-kpi-good', `${formatNum(summary.total_good)} (${formatPct(summary.pct_good)})`);
    setElText('pbi-drill-kpi-crit', `${formatNum(summary.total_broken + summary.total_lost + summary.total_repair)} (${formatPct(summary.pct_broken + summary.pct_lost + summary.pct_repair)})`);
    setElText('pbi-drill-kpi-acq', formatRp(summary.nilai_perolehan));
    setElText('pbi-drill-kpi-book', formatRp(summary.nilai_pembukuan));

    // Table Data
    const tbody = document.getElementById('table-pbi-drill-body');
    if (tbody) {
        if (res.assets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" class="text-center py-8 text-slate-400 font-medium">Tidak ada aset yang sesuai kriteria filter.</td></tr>';
            return;
        }

        tbody.innerHTML = res.assets.slice(0, 200).map(a => {
            const sec = a.penanggungjawab_section || a.kode_section || inferAssetSection(a) || '';
            const pic = a.pic_nama || a.user_pic || '';
            return `
            <tr class="hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800">
                <td class="px-3.5 py-2 whitespace-nowrap min-w-[160px]">
                    <div class="flex flex-col">
                        <span class="font-bold text-blue-600 dark:text-sky-400 flex items-center gap-1">
                            <i class="ph-bold ph-buildings text-[10px]"></i> ${sec || '-'}
                        </span>
                        ${pic ? `<span class="text-[10.5px] font-medium text-emerald-600 flex items-center gap-1"><i class="ph-bold ph-user text-[10px]"></i> ${pic}</span>` : ''}
                    </div>
                </td>
                <td class="px-3.5 py-2 font-mono font-bold text-blue-600 dark:text-sky-400">${a.kode_unit}</td>
                <td class="px-3.5 py-2 font-semibold truncate max-w-[200px]" title="${a.nama_asset}">${a.nama_asset}</td>
                <td class="px-3.5 py-2 text-slate-600 dark:text-slate-400">${a.kode_kelompok}</td>
                <td class="px-3.5 py-2 text-slate-600 dark:text-slate-400 truncate max-w-[150px]">${a.kode_kategori}</td>
                <td class="px-3.5 py-2 font-bold text-slate-800 dark:text-slate-200">${inferAssetLocation(a) || a.location}</td>
                <td class="px-3.5 py-2 text-center">
                    <span class="px-2 py-0.5 rounded text-[9.5px] font-bold ${a.is_in_building || a.building_status === 'IN_BUILDING' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-sky-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}">
                        ${a.is_in_building || a.building_status === 'IN_BUILDING' ? '🏢 In-Building' : '🚜 Outdoor'}
                    </span>
                </td>
                <td class="px-3.5 py-2 text-slate-700 dark:text-slate-300 truncate max-w-[150px]">${a.nama_bangunan || '-'}</td>
                <td class="px-3.5 py-2 text-slate-500 truncate max-w-[150px]">${a.detail_lokasi || '-'}</td>
                <td class="px-3.5 py-2 text-center">
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${a.kondisi === 'Good Condition' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}">
                        ${a.kondisi || 'Good Condition'}
                    </span>
                </td>
                <td class="px-3.5 py-2 text-center font-mono">${a.tanggal_perolehan || '-'}</td>
                <td class="px-3.5 py-2 text-right font-mono">${formatRp(a.total_harga_perolehan)}</td>
                <td class="px-3.5 py-2 text-right font-mono font-bold text-blue-600">${formatRp(a.Nilai_buku)}</td>
            </tr>
        `;}).join('');
    }
}

// -------------------------------------------------------------
// POWER BI CONTEXT MENU HANDLER (RIGHT CLICK DRILLTHROUGH)
// -------------------------------------------------------------
export function openContextMenu(event, filters = {}) {
    event.preventDefault();
    selectedContextFilters = filters;

    const menu = document.getElementById('pbi-context-menu');
    const titleEl = document.getElementById('pbi-ctx-title');
    if (!menu) return;

    if (titleEl) {
        const parts = [];
        if (filters.office) parts.push(filters.office);
        if (filters.kelompok) parts.push(filters.kelompok);
        if (filters.kategori) parts.push(filters.kategori);
        if (filters.section) parts.push(filters.section);
        titleEl.innerText = parts.join(' > ') || 'Aksi Opsi';
    }

    const x = Math.min(event.pageX, window.innerWidth - 240);
    const y = Math.min(event.pageY, window.innerHeight - 150);

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('pbi-context-menu');
    if (menu && !menu.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const btnDrill = document.getElementById('btn-ctx-drillthrough');
    if (btnDrill) {
        btnDrill.addEventListener('click', () => {
            const menu = document.getElementById('pbi-context-menu');
            if (menu) menu.classList.add('hidden');
            drillToAssetDrillthrough(selectedContextFilters);
        });
    }

    const btnFilter = document.getElementById('btn-ctx-filter');
    if (btnFilter) {
        btnFilter.addEventListener('click', () => {
            const menu = document.getElementById('pbi-context-menu');
            if (menu) menu.classList.add('hidden');
            if (selectedContextFilters.office) {
                openOfficeDetail(selectedContextFilters.office);
            }
        });
    }

    const btnCopy = document.getElementById('btn-ctx-copy');
    if (btnCopy) {
        btnCopy.addEventListener('click', () => {
            const menu = document.getElementById('pbi-context-menu');
            if (menu) menu.classList.add('hidden');
            const str = JSON.stringify(selectedContextFilters);
            navigator.clipboard?.writeText(str);
        });
    }
});

// -------------------------------------------------------------
// VIEW 6C: MASTER ASET - 3. KATALOG MASTER ASET
// -------------------------------------------------------------
function renderAsset3(assets) {
    if (!assets || assets.length === 0) return;

    // Populate Kategori dropdown dynamically if empty
    const katSelect = document.getElementById('slicer-asset-kat');
    if (katSelect && katSelect.options.length <= 1) {
        const kats = [...new Set(assets.map(a => a.kode_kategori).filter(Boolean))].sort();
        kats.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            katSelect.appendChild(opt);
        });
    }

    let filteredAssets = assets;
    if (assetTypeFilter === 'valuable') {
        filteredAssets = filteredAssets.filter(a => Number(a.total_harga_perolehan || a.Nilai_buku || 0) > 0);
    } else if (assetTypeFilter === 'non_valuable') {
        filteredAssets = filteredAssets.filter(a => Number(a.total_harga_perolehan || a.Nilai_buku || 0) === 0);
    }
    if (assetKatFilter !== 'ALL') {
        filteredAssets = filteredAssets.filter(a => a.kode_kategori === assetKatFilter);
    }
    if (assetKondisiFilter !== 'ALL') {
        filteredAssets = filteredAssets.filter(a => (a.kondisi || '').toLowerCase() === assetKondisiFilter.toLowerCase());
    }
    if (assetSearchQuery.trim() !== '') {
        const q = assetSearchQuery.toLowerCase();
        filteredAssets = filteredAssets.filter(a => 
            (a.kode_unit && a.kode_unit.toLowerCase().includes(q)) ||
            (a.nama_asset && a.nama_asset.toLowerCase().includes(q)) ||
            (a.kode_kelompok && a.kode_kelompok.toLowerCase().includes(q)) ||
            (a.kode_kategori && a.kode_kategori.toLowerCase().includes(q))
        );
    }

    setElText('pbi-asset-filtered-count', formatNum(filteredAssets.length));

    const summary = measureAssetSummary(filteredAssets);

    setElText('pbi-asset-total-count', formatNum(summary.total_asset) + ' Unit');
    setElText('pbi-asset-nilai-perolehan', formatRp(summary.nilai_perolehan));
    setElText('pbi-asset-nilai-penyusutan', formatRp(summary.nilai_penyusutan));
    setElText('pbi-asset-nilai-buku', formatRp(summary.nilai_pembukuan));
    setElText('pbi-asset-good-count', `${formatNum(summary.total_good)} (${formatPct(summary.pct_good)})`);
    setElText('pbi-asset-lifetime-stat', `↑ ${formatNum(summary.total_diatas_lifetime)} | ↓ ${formatNum(summary.total_dibawah_lifetime)}`);
    setElText('pbi-asset-recommendation-text', summary.recommendation_text || 'Portofolio aset dalam kondisi stabil.');

    // 1. Kondisi Donut Chart
    renderApex('#chart-pbi-asset-kondisi', {
        chart: { type: 'donut', height: 210 },
        series: [summary.total_good, summary.total_repair, summary.total_broken, summary.total_lost, summary.total_disposal],
        labels: ['Good Condition', 'Repair', 'Broken', 'Lost', 'Disposal'],
        colors: ['#10b981', '#f59e0b', '#ef4444', '#64748b', '#94a3b8'],
        plotOptions: { 
            pie: { 
                donut: { 
                    size: '68%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total Aset',
                            formatter: () => formatNum(summary.total_asset, 0),
                            style: { fontSize: '11px', fontWeight: 800 }
                        }
                    }
                } 
            } 
        },
        dataLabels: { enabled: false },
        legend: { position: 'bottom', fontSize: '10.5px', fontWeight: 600 }
    });

    // 2. Kategori Bar Chart
    const katMap = new Map();
    filteredAssets.forEach(a => {
        const kat = a.kode_kategori || 'LAINNYA';
        if (!katMap.has(kat)) katMap.set(kat, { kat, count: 0, nilaiBuku: 0 });
        const obj = katMap.get(kat);
        obj.count++;
        obj.nilaiBuku += Number(a.Nilai_buku ?? a.nilai_buku ?? 0);
    });

    const topKats = Array.from(katMap.values()).sort((a,b) => currentAssetBarDim === 'unit' ? (b.count - a.count) : (b.nilaiBuku - a.nilaiBuku)).slice(0, 8);

    renderApex('#chart-pbi-asset-kategori', {
        chart: { type: 'bar', height: 210, toolbar: { show: false } },
        series: [{ name: currentAssetBarDim === 'unit' ? 'Jumlah Unit' : 'Nilai Buku (Rp)', data: topKats.map(k => currentAssetBarDim === 'unit' ? k.count : k.nilaiBuku) }],
        xaxis: { categories: topKats.map(k => k.kat), labels: { style: { fontSize: '11px', fontWeight: 600 } } },
        yaxis: { labels: { formatter: v => currentAssetBarDim === 'unit' ? formatNum(v, 0) : formatRp(v), style: { fontSize: '11px', fontWeight: 600 } } },
        colors: ['#0284c7'],
        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } }
    });

    // 3. Matrix Table
    const tbody = document.getElementById('table-pbi-asset-matrix');
    if (tbody) {
        if (filteredAssets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-slate-400 font-medium">Tidak ada aset yang sesuai filter.</td></tr>';
            return;
        }

        const maxBuku = Math.max(...filteredAssets.slice(0, 100).map(a => Number(a.Nilai_buku ?? a.nilai_buku ?? 0)), 1);

        tbody.innerHTML = filteredAssets.slice(0, 100).map(a => {
            const bukuVal = Number(a.Nilai_buku ?? a.nilai_buku ?? 0);
            const acqVal = Number(a.total_harga_perolehan ?? a.nilai_perolehan ?? 0);
            const pct = Math.min(100, Math.max(0, (bukuVal / maxBuku) * 100));
            const isGood = (a.kondisi || '').toLowerCase().includes('good');
            const isOverAge = (a.lifetime || '').toUpperCase().includes('DIATAS') || (Number(a.umur_asset || 0) > Number(a.standar_umur || 5));

            return `
                <tr onclick="window.pns.drillToAssetDetail('${a.kode_unit}')" class="hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik untuk Drill-Through ke Dossier Aset ${a.kode_unit}">
                    <td class="font-bold text-blue-600 dark:text-sky-400 px-3 py-2.5 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                            <span>${a.kode_unit}</span>
                            <i class="ph-bold ph-arrow-square-out text-[11px] text-emerald-500 opacity-0 group-hover:opacity-100 transition"></i>
                        </div>
                    </td>
                    <td class="px-3 py-2.5 font-semibold truncate max-w-[180px]">${a.nama_asset}</td>
                    <td class="px-3 py-2.5 text-slate-500">${a.kode_kategori || '-'}</td>
                    <td class="px-3 py-2.5 text-slate-500">${a.kode_kelompok || '-'}</td>
                    <td class="px-3 py-2.5 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isGood ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}">
                            ${a.kondisi || 'Good Condition'}
                        </span>
                    </td>
                    <td class="px-3 py-2.5 text-center font-mono">${a.umur_asset || 0} / ${a.standar_umur || 5} Thn</td>
                    <td class="px-3 py-2.5 text-center font-mono">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isOverAge ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'}">
                            ${isOverAge ? '↑ DIATAS' : '↓ DIBAWAH'}
                        </span>
                    </td>
                    <td class="px-3 py-2.5 text-right font-mono">${formatRp(acqVal)}</td>
                    <td class="px-3 py-2.5 text-right font-mono font-bold text-blue-600 whitespace-nowrap">
                        <div class="flex items-center justify-end gap-2">
                            <div class="w-12 bg-blue-100 dark:bg-blue-950/40 rounded-full h-1.5 overflow-hidden">
                                <div class="bg-blue-600 h-full rounded-full" style="width: ${pct}%"></div>
                            </div>
                            <span>${formatRp(bukuVal)}</span>
                        </div>
                    </td>
                    <td class="px-3 py-2.5 text-center">
                        <button type="button" class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-[10px] font-bold transition flex items-center gap-1 mx-auto">
                            <i class="ph-bold ph-identification-card"></i> Dossier
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}


// -------------------------------------------------------------
// VIEW 7: MAINTENANCE & REPAIR - ENTERPRISE SUITE
// -------------------------------------------------------------
let currentMaintTrendDim = 'biaya'; // 'biaya' | 'trx' | 'qty'
let currentMaintBarDim = 'kategori'; // 'kategori' | 'subkat' | 'unit' | 'section'
let currentMaintGranularity = 'year'; // 'year' | 'month' | 'week' | 'day'
let currentMaintDrillYear = null;
let currentMaintDrillMonth = null;
let maintSearchQuery = '';

export function setMaintTrendDim(dim) {
    currentMaintTrendDim = dim;
    ['biaya', 'trx', 'qty'].forEach(d => {
        const btn = document.getElementById(`btn-maint-dim-${d}`);
        if (btn) {
            if (d === dim) {
                btn.className = 'px-2 py-1 text-[9.5px] font-bold rounded-lg bg-emerald-600 text-white shadow-2xs transition cursor-pointer';
            } else {
                btn.className = 'px-2 py-1 text-[9.5px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            }
        }
    });
    if (pbiData.cache) renderMaintenance(pbiData.cache.maint);
}

export function setMaintGranularity(gran, year = null, month = null) {
    currentMaintGranularity = gran;
    if (year !== null) currentMaintDrillYear = year;
    if (month !== null) currentMaintDrillMonth = month;
    if (gran === 'year') {
        currentMaintDrillYear = null;
        currentMaintDrillMonth = null;
    }
    updateMaintGranularityUI();
    if (pbiData.cache) renderMaintenance(pbiData.cache.maint);
}

export function resetMaintDrillDown() {
    setMaintGranularity('year', null, null);
}

function updateMaintGranularityUI() {
    ['year', 'month', 'week', 'day'].forEach(g => {
        const btn = document.getElementById(`btn-maint-gran-${g}`);
        if (btn) {
            if (g === currentMaintGranularity) {
                btn.className = 'px-2 py-1 text-[9.5px] font-extrabold rounded-lg bg-blue-600 text-white shadow-2xs transition cursor-pointer';
            } else {
                btn.className = 'px-2 py-1 text-[9.5px] font-extrabold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            }
        }
    });

    const breadcrumb = document.getElementById('pbi-maint-drill-breadcrumb');
    const resetBtn = document.getElementById('btn-maint-reset-drill');
    if (breadcrumb) {
        const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        if (currentMaintGranularity === 'year') {
            breadcrumb.textContent = 'Level: Semua Tahun';
            if (resetBtn) resetBtn.classList.add('hidden');
        } else if (currentMaintGranularity === 'month') {
            breadcrumb.textContent = currentMaintDrillYear ? `Level: Bulan (${currentMaintDrillYear})` : 'Level: Bulanan';
            if (resetBtn) resetBtn.classList.remove('hidden');
        } else if (currentMaintGranularity === 'week') {
            const mLabel = currentMaintDrillMonth ? monthNames[parseInt(currentMaintDrillMonth, 10)] : '';
            breadcrumb.textContent = `Level: Mingguan (${mLabel || ''} ${currentMaintDrillYear || ''})`.trim();
            if (resetBtn) resetBtn.classList.remove('hidden');
        } else if (currentMaintGranularity === 'day') {
            const mLabel = currentMaintDrillMonth ? monthNames[parseInt(currentMaintDrillMonth, 10)] : '';
            breadcrumb.textContent = `Level: Harian (${mLabel || ''} ${currentMaintDrillYear || ''})`.trim();
            if (resetBtn) resetBtn.classList.remove('hidden');
        }
    }
}

function setMaintBarDim(dim) {
    currentMaintBarDim = dim;
    ['kat', 'subkat', 'unit', 'section'].forEach(d => {
        const btn = document.getElementById(`btn-maint-bar-${d}`);
        const mapKey = d === 'kat' ? 'kategori' : d;
        if (btn) {
            if (mapKey === dim) {
                btn.className = 'px-1.5 py-0.5 text-[8px] font-bold rounded-md bg-amber-500 text-white transition';
            } else {
                btn.className = 'px-1.5 py-0.5 text-[8px] font-bold rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition';
            }
        }
    });
    if (pbiData.cache) renderMaintenance(pbiData.cache.maint);
}

function onMaintFilterChange() {
    updateMaintSubKatDropdown();
    if (pbiData.cache) renderMaintenance(pbiData.cache.maint);
}

function onMaintSearch(query) {
    maintSearchQuery = query || '';
    if (pbiData.cache) renderMaintenance(pbiData.cache.maint);
}

function renderMaintenance(maint) {
    const selKat = document.getElementById('slicer-maint-kat')?.value || 'ALL';
    const selSub = document.getElementById('slicer-maint-subkat')?.value || 'ALL';

    // Local Filter Application
    let filtered = maint;
    if (selKat !== 'ALL') {
        filtered = filtered.filter(m => m.kategori_material === selKat);
    }
    if (selSub !== 'ALL') {
        filtered = filtered.filter(m => m.sub_kategori_material === selSub);
    }
    if (maintSearchQuery.trim() !== '') {
        const q = maintSearchQuery.toLowerCase();
        filtered = filtered.filter(m => 
            (m.kode_unit && m.kode_unit.toLowerCase().includes(q)) ||
            (m.nama_asset && m.nama_asset.toLowerCase().includes(q)) ||
            (m.nama_spare_part_jasa && m.nama_spare_part_jasa.toLowerCase().includes(q)) ||
            (m.sub_kategori_material && m.sub_kategori_material.toLowerCase().includes(q))
        );
    }

    setElText('pbi-maint-filtered-count', formatNum(filtered.length));

    const summary = measureMaintenanceSummary(filtered);
    const statTrend = measureTrendHierarchical(filtered, currentMaintGranularity, currentMaintDrillYear, currentMaintDrillMonth);

    setElText('pbi-maint-total-cost', formatRp(summary.total_biaya));
    setElText('pbi-maint-total-units', formatNum(summary.distinct_units));
    setElText('pbi-maint-total-trx', formatNum(summary.total_transaksi));
    setElText('pbi-maint-total-qty', formatNum(summary.total_qty_parts) + ' Parts');
    setElText('pbi-maint-avg-unit', formatRp(summary.avg_cost_per_unit));
    setElText('pbi-maint-freq', `${summary.service_frequency.toFixed(1)}x / Unit`);

    // 1. Render Trend Chart with Active Dimension & Drill-Down
    let trendSeries = [];
    let trendColors = ['#ef4444'];
    let trendTitle = 'Tren Biaya Maintenance (Tahunan)';

    if (currentMaintTrendDim === 'trx') {
        trendSeries = [{ name: 'Jumlah Transaksi', data: statTrend.map(t => t.jumlah_transaksi) }];
        trendColors = ['#0ea5e9'];
        trendTitle = `Tren Volume Transaksi (${currentMaintGranularity.toUpperCase()})`;
    } else if (currentMaintTrendDim === 'qty') {
        trendSeries = [{ name: 'Qty Parts', data: statTrend.map(t => t.total_qty || t.jumlah_transaksi) }];
        trendColors = ['#8b5cf6'];
        trendTitle = `Tren Qty Spare Part (${currentMaintGranularity.toUpperCase()})`;
    } else {
        trendSeries = [{ name: 'Biaya Maintenance (Rp)', data: statTrend.map(t => t.total_biaya) }];
        trendColors = ['#ef4444'];
        const lvlName = currentMaintGranularity === 'year' ? 'Tahunan' : (currentMaintGranularity === 'month' ? 'Bulanan' : (currentMaintGranularity === 'week' ? 'Mingguan' : 'Harian'));
        trendTitle = `Tren Biaya Maintenance (${lvlName})`;
    }
    setElText('pbi-maint-trend-title', trendTitle);

    renderApex('#chart-pbi-maint-trend', {
        chart: {
            type: currentMaintGranularity === 'year' ? 'bar' : 'area',
            height: '100%',
            events: {
                dataPointSelection: (event, chartContext, config) => {
                    const idx = config.dataPointIndex;
                    const item = statTrend[idx];
                    if (!item) return;

                    if (currentMaintGranularity === 'year') {
                        setMaintGranularity('month', item.year, null);
                    } else if (currentMaintGranularity === 'month') {
                        setMaintGranularity('week', item.year, item.month);
                    } else if (currentMaintGranularity === 'week') {
                        setMaintGranularity('day', item.year, item.month);
                    }
                }
            }
        },
        plotOptions: {
            bar: { borderRadius: 6, columnWidth: '50%' }
        },
        series: trendSeries,
        xaxis: { categories: statTrend.map(t => t.label || t.group), labels: { style: { fontSize: '10.5px', fontWeight: 600 } } },
        yaxis: { labels: { formatter: v => currentMaintTrendDim === 'biaya' ? formatRp(v) : formatNum(v, 0), style: { fontSize: '10.5px', fontWeight: 600 } } },
        dataLabels: { enabled: statTrend.length <= 12, formatter: v => currentMaintTrendDim === 'biaya' ? formatRp(v) : formatNum(v, 0) },
        tooltip: { y: { formatter: v => currentMaintTrendDim === 'biaya' ? formatRp(v) : formatNum(v, 0) } },
        colors: trendColors,
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05 } }
    });

    // 2. Render Breakdown Bar with Active Dimension
    let barData = [];
    let barTitle = 'Biaya per Kategori Material';
    let barColor = '#f59e0b';

    if (currentMaintBarDim === 'subkat') {
        barData = measureBiayaPerSubKategoriMaterial(filtered).slice(0, 7);
        barTitle = 'Top 7 Sub Kategori Material Terbesar';
        barColor = '#06b6d4';
    } else if (currentMaintBarDim === 'unit') {
        barData = measureBiayaPerUnit(filtered).slice(0, 10);
        barTitle = 'Top 10 Unit dengan Biaya Terbesar';
        barColor = '#3b82f6';
    } else if (currentMaintBarDim === 'section') {
        barData = measureBiayaPerSection(filtered).slice(0, 7);
        barTitle = 'Biaya Maintenance per Section / Workshop';
        barColor = '#10b981';
    } else {
        barData = measureBiayaPerKategoriMaterial(filtered).slice(0, 7);
        barTitle = 'Biaya per Kategori Material';
        barColor = '#f59e0b';
    }
    setElText('pbi-maint-bar-title', barTitle);

    renderApex('#chart-pbi-maint-top-units', {
        chart: { type: 'bar', height: '100%' },
        series: [{ name: 'Total Biaya (Rp)', data: barData.map(k => k.total_biaya) }],
        xaxis: { categories: barData.map(k => k.group), labels: { style: { fontSize: '11px', fontWeight: 600 }, formatter: v => formatRp(v) } },
        yaxis: { labels: { style: { fontSize: '11px', fontWeight: 600 } } },
        dataLabels: { enabled: true, formatter: v => formatRp(v) },
        tooltip: { y: { formatter: v => formatRp(v) } },
        colors: [barColor],
        plotOptions: { bar: { horizontal: true, barHeight: '55%' } }
    });

    // 3. Render Matrix Table with In-Cell Bar Visuals
    const tbody = document.getElementById('table-pbi-maint-matrix');
    if (tbody) {
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-slate-400 font-medium">Tidak ada data maintenance yang sesuai dengan filter.</td></tr>';
            return;
        }

        const maxNominal = Math.max(...filtered.slice(0, 100).map(m => Number(m.nominal) || 0), 1);

        tbody.innerHTML = filtered.slice(0, 100).map(m => {
            const pct = Math.min(100, (Number(m.nominal || 0) / maxNominal) * 100);
            return `
                <tr onclick="window.pns.drillToMaintDetail('${m.nama_spare_part_jasa || m.kode_unit}')" class="hover:bg-amber-50/70 dark:hover:bg-amber-950/40 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik untuk Drill-Through ke Material Ledger ${m.nama_spare_part_jasa || m.kode_unit}">
                    <td class="px-3 py-2 font-mono text-center">${m.tanggal || '-'}</td>
                    <td class="px-3 py-2 font-bold text-blue-600 dark:text-sky-400 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                            <span>${m.kode_unit}</span>
                            <i class="ph-bold ph-arrow-square-out text-[11px] text-amber-500 opacity-0 group-hover:opacity-100 transition"></i>
                        </div>
                    </td>
                    <td class="px-3 py-2 font-semibold truncate max-w-[140px]">${m.nama_asset || '-'}</td>
                    <td class="px-3 py-2 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                            ${m.kategori_material || m.kategori_barang_jasa || 'Material'}
                        </span>
                    </td>
                    <td class="px-3 py-2 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                            ${m.sub_kategori_material || '-'}
                        </span>
                    </td>
                    <td class="px-3 py-2 font-medium truncate max-w-[150px]">${m.nama_spare_part_jasa || '-'}</td>
                    <td class="px-3 py-2 text-center font-mono">${m.qty || 1}</td>
                    <td class="px-3 py-2 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                        <div class="flex items-center justify-end gap-2">
                            <div class="w-14 bg-rose-100 dark:bg-rose-950/40 rounded-full h-2 overflow-hidden">
                                <div class="bg-rose-500 h-full rounded-full" style="width: ${pct}%"></div>
                            </div>
                            <span>${formatRp(m.nominal)}</span>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// -------------------------------------------------------------
// VIEW 5B: FUEL DETAIL & LEDGER TRANSAKSI
// -------------------------------------------------------------
let fuelDetailKatFilter = 'ALL';
let fuelDetailAnomalyFilter = 'ALL';
let fuelDetailSearchQuery = '';
let currentFuelDetailTableTab = 'unit'; // 'unit' | 'bkb'

function setFuelDetailFilter(status = 'ALL') {
    fuelDetailAnomalyFilter = status || 'ALL';
    ['all', 'anomaly', 'normal'].forEach(s => {
        const btn = document.getElementById(`btn-fueld-filter-${s}`);
        if (btn) {
            if (s.toUpperCase() === String(status || '').toUpperCase()) {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg bg-purple-600 text-white shadow-2xs transition cursor-pointer';
            } else {
                btn.className = 'px-2.5 py-1 text-[10px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
            }
        }
    });
    if (pbiData.cache) renderFuelDetail(pbiData.cache.fuel, pbiData.cache.vra);
}

function onFuelDetailFilterChange() {
    const sel = document.getElementById('slicer-fueld-kat');
    if (sel) fuelDetailKatFilter = sel.value;
    if (pbiData.cache) renderFuelDetail(pbiData.cache.fuel, pbiData.cache.vra);
}

function onFuelDetailSearch(query) {
    fuelDetailSearchQuery = query || '';
    if (pbiData.cache) renderFuelDetail(pbiData.cache.fuel, pbiData.cache.vra);
}

function switchFuelDetailTableTab(tab) {
    currentFuelDetailTableTab = tab;
    const btnUnit = document.getElementById('btn-fueld-tab-unit');
    const btnBkb = document.getElementById('btn-fueld-tab-bkb');
    const cUnit = document.getElementById('pbi-fueld-container-unit');
    const cBkb = document.getElementById('pbi-fueld-container-bkb');
    const subTitle = document.getElementById('pbi-fueld-table-subtitle');

    if (tab === 'bkb') {
        if (btnUnit) btnUnit.className = 'px-3 py-1 text-[11px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
        if (btnBkb) btnBkb.className = 'px-3 py-1 text-[11px] font-bold rounded-lg bg-purple-600 text-white shadow-2xs transition cursor-pointer';
        if (cUnit) cUnit.classList.add('hidden');
        if (cBkb) cBkb.classList.remove('hidden');
        if (subTitle) subTitle.innerText = 'Log transaksi BKB lapangan terbaru';
    } else {
        if (btnUnit) btnUnit.className = 'px-3 py-1 text-[11px] font-bold rounded-lg bg-purple-600 text-white shadow-2xs transition cursor-pointer';
        if (btnBkb) btnBkb.className = 'px-3 py-1 text-[11px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer';
        if (cUnit) cUnit.classList.remove('hidden');
        if (cBkb) cBkb.classList.add('hidden');
        if (subTitle) subTitle.innerText = 'Tersortir dari konsumsi terbesar';
    }
}

function renderFuelDetail(fuel, vra) {
    const res = measureFuelDetailLog(fuel, vra, pbiData.assetMap);
    const rawList = res.unitList;
    const rawBkbLogs = res.rawBkbLogs;

    // Populate Kategori dropdown dynamically
    const katSelect = document.getElementById('slicer-fueld-kat');
    if (katSelect && katSelect.options.length <= 1) {
        const kats = [...new Set(rawList.map(u => u.kategori).filter(Boolean))].sort();
        kats.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            katSelect.appendChild(opt);
        });
    }

    let list = rawList;
    if (fuelDetailKatFilter !== 'ALL') {
        list = list.filter(u => u.kategori === fuelDetailKatFilter);
    }
    if (fuelDetailAnomalyFilter === 'ANOMALY') {
        list = list.filter(u => u.is_anomaly);
    } else if (fuelDetailAnomalyFilter === 'NORMAL') {
        list = list.filter(u => !u.is_anomaly);
    }
    if (fuelDetailSearchQuery.trim() !== '') {
        const q = fuelDetailSearchQuery.toLowerCase();
        list = list.filter(u => 
            (u.kode_unit && u.kode_unit.toLowerCase().includes(q)) ||
            (u.nama_asset && u.nama_asset.toLowerCase().includes(q))
        );
    }

    setElText('pbi-fueld-filtered-count', formatNum(list.length));

    // Dynamic Aggregations from filtered list
    const totalUnits = list.length;
    const totalCost = list.reduce((acc, u) => acc + u.total_biaya, 0);
    const totalLiter = list.reduce((acc, u) => acc + u.total_liter, 0);
    const totalKm = list.reduce((acc, u) => acc + u.total_km, 0);
    const totalJam = list.reduce((acc, u) => acc + u.total_jam, 0);
    const totalTrx = list.reduce((acc, u) => acc + (u.jumlah_trx || 0), 0);
    const avgKml = totalLiter > 0 && totalKm > 0 ? (totalKm / totalLiter) : 0;
    const avgLph = totalJam > 0 && totalLiter > 0 ? (totalLiter / totalJam) : 0;
    const anomalyUnits = list.filter(u => u.is_anomaly);
    const anomalyCount = anomalyUnits.length;
    const anomalyPct = totalUnits > 0 ? (anomalyCount / totalUnits) * 100 : 0;
    const anomalyImpact = anomalyUnits.reduce((acc, u) => acc + (u.total_biaya * 0.25), 0);
    const avgCostPerUnit = totalUnits > 0 ? totalCost / totalUnits : 0;
    const costPerLiter = totalLiter > 0 ? totalCost / totalLiter : 0;

    // Set Upgraded Hero Cards
    setElText('pbi-fueld-total-units', formatNum(totalUnits) + ' Unit');
    setElText('pbi-fueld-total-bkb-trx', formatNum(totalTrx || rawBkbLogs.length) + ' BKB');
    setElText('pbi-fueld-total-volume', 'Total Volume: ' + formatK(totalLiter) + ' L');

    setElText('pbi-fueld-total-cost', formatRp(totalCost));
    setElText('pbi-fueld-avg-cost-per-unit', 'Avg ' + formatRp(avgCostPerUnit) + ' / Unit');
    setElText('pbi-fueld-cost-per-liter', 'Rata-rata: Rp ' + formatNum(costPerLiter, 0) + ' / L');

    setElText('pbi-fueld-avg-kml', `${avgKml > 0 ? avgKml.toFixed(2) + ' KM/L' : ''} ${avgLph > 0 ? (avgKml > 0 ? '| ' : '') + avgLph.toFixed(2) + ' L/HM' : (avgKml > 0 ? '' : '0.00 KM/L')}`);
    setElText('pbi-fueld-total-mobility', `${formatNum(totalKm, 0)} KM | ${formatNum(totalJam, 1)} HM`);

    setElText('pbi-fueld-anomaly-count', formatNum(anomalyCount) + ' Unit');
    setElText('pbi-fueld-anomaly-pct', `${anomalyPct.toFixed(1)}% Unit`);
    setElText('pbi-fueld-anomaly-impact', 'Potensi Inefisiensi: ' + formatRp(anomalyImpact));

    setElText('pbi-fueld-recommendation-text', res.summary.recommendation_text || 'Konsumsi bahan bakar dalam batas efisiensi standar.');

    // 1. Chart Top 10 Konsumsi BBM
    const top10 = list.slice(0, 10);
    renderApex('#chart-pbi-fueld-top-units', {
        chart: { type: 'bar', height: 210, toolbar: { show: false } },
        series: [{ name: 'Total Liter', data: top10.map(u => Math.round(u.total_liter)) }],
        xaxis: { 
            categories: top10.map(u => u.kode_unit), 
            labels: { 
                style: { fontSize: '10px', fontWeight: 600 }, 
                formatter: v => formatCompactNum(v) + ' L' 
            } 
        },
        yaxis: { 
            labels: { 
                style: { fontSize: '10px', fontWeight: 700 },
                maxWidth: 160
            } 
        },
        colors: ['#a855f7'],
        plotOptions: { 
            bar: { 
                horizontal: true, 
                borderRadius: 4, 
                barHeight: '55%' 
            } 
        },
        dataLabels: {
            enabled: true,
            formatter: v => formatK(v) + ' L',
            style: { fontSize: '10px', fontWeight: 700 }
        },
        tooltip: {
            y: { formatter: v => formatNum(v, 0) + ' Liter' }
        }
    });

    // 2. Chart Distribusi BBM per Kategori Unit (Donut)
    const catMap = {};
    list.forEach(u => {
        const c = u.kategori || 'Lainnya';
        catMap[c] = (catMap[c] || 0) + u.total_liter;
    });
    const catKeys = Object.keys(catMap);
    renderApex('#chart-pbi-fueld-cat-donut', {
        chart: { type: 'donut', height: 210 },
        series: catKeys.map(k => Math.round(catMap[k])),
        labels: catKeys,
        colors: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#64748b', '#14b8a6', '#f43f5e'],
        plotOptions: { 
            pie: { 
                donut: { 
                    size: '68%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total BBM',
                            formatter: () => formatK(res.summary.total_volume) + ' L',
                            style: { fontSize: '11px', fontWeight: 800 }
                        }
                    } 
                } 
            } 
        },
        dataLabels: { enabled: false },
        legend: { 
            position: 'bottom', 
            fontSize: '10px', 
            fontWeight: 600,
            formatter: (seriesName, opts) => {
                const val = opts.w.globals.series[opts.seriesIndex];
                return `${seriesName}: ${formatK(val)} L`;
            }
        },
        tooltip: {
            y: { formatter: v => `${formatNum(v, 0)} Liter` }
        }
    });

    // 3. Table 1: Unit Ratio Matrix
    const tbodyUnit = document.getElementById('table-pbi-fueld-matrix');
    if (tbodyUnit) {
        tbodyUnit.innerHTML = '';
        if (list.length === 0) {
            tbodyUnit.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-slate-400 font-medium">Tidak ada data unit yang sesuai filter.</td></tr>';
        } else {
            const maxLtr = Math.max(...list.slice(0, 100).map(u => u.total_liter), 1);
            tbodyUnit.innerHTML = list.slice(0, 100).map(u => {
                const pct = Math.min(100, Math.max(0, (u.total_liter / maxLtr) * 100));
                return `
                    <tr class="hover:bg-purple-50/60 dark:hover:bg-purple-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800">
                        <td class="px-3.5 py-2.5 font-bold text-blue-600 dark:text-sky-400 cursor-pointer hover:underline whitespace-nowrap min-w-[130px]" onclick="window.pns.drillToUnit('${u.kode_unit}')" title="Klik untuk lihat Profil Unit ${u.kode_unit}">
                            <div class="flex items-center gap-1.5 font-mono">
                                <span>${u.kode_unit}</span>
                                <i class="ph-bold ph-arrow-square-out text-[10px] text-blue-500"></i>
                            </div>
                        </td>
                        <td class="px-3.5 py-2.5 font-semibold truncate max-w-[180px] min-w-[140px]">${u.nama_asset}</td>
                        <td class="px-3.5 py-2.5 text-center min-w-[100px]">
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                ${u.kategori}
                            </span>
                        </td>
                        <td class="px-3.5 py-2.5 text-right font-mono font-bold whitespace-nowrap min-w-[110px]">
                            <div class="flex items-center justify-end gap-2">
                                <div class="w-10 bg-purple-100 dark:bg-purple-950/40 rounded-full h-1.5 overflow-hidden">
                                    <div class="bg-purple-500 h-full rounded-full" style="width: ${pct}%"></div>
                                </div>
                                <span>${formatNum(u.total_liter, 0)} L</span>
                            </div>
                        </td>
                        <td class="px-3.5 py-2.5 text-right font-mono min-w-[110px]">${formatRp(u.total_biaya)}</td>
                        <td class="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-600 min-w-[100px]">
                            ${u.km_per_liter > 0 ? u.km_per_liter.toFixed(2) + ' KM/L' : '<span class="text-slate-400 font-normal">-</span>'}
                        </td>
                        <td class="px-3.5 py-2.5 text-right font-mono font-bold text-blue-600 min-w-[100px]">
                            ${u.liter_per_jam > 0 ? u.liter_per_jam.toFixed(2) + ' L/HM' : '<span class="text-slate-400 font-normal">-</span>'}
                        </td>
                        <td class="px-3.5 py-2.5 text-center min-w-[110px]">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${u.is_anomaly ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'}">
                                ${u.is_anomaly ? '🚨 BOROS' : '✅ NORMAL'}
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    // 4. Table 2: Raw BKB Ledger
    const tbodyBkb = document.getElementById('table-pbi-fueld-raw-bkb');
    if (tbodyBkb) {
        let bkbList = rawBkbLogs;
        if (fuelDetailSearchQuery.trim() !== '') {
            const q = fuelDetailSearchQuery.toLowerCase();
            bkbList = bkbList.filter(b => 
                (b.kode_unit && b.kode_unit.toLowerCase().includes(q)) ||
                (b.nomor_bkb && b.nomor_bkb.toLowerCase().includes(q)) ||
                (b.nama_asset && b.nama_asset.toLowerCase().includes(q))
            );
        }
        if (fuelDetailKatFilter !== 'ALL') {
            bkbList = bkbList.filter(b => b.kategori === fuelDetailKatFilter);
        }

        if (bkbList.length === 0) {
            tbodyBkb.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400 font-medium">Tidak ada transaksi BKB yang cocok.</td></tr>';
        } else {
            tbodyBkb.innerHTML = bkbList.slice(0, 100).map(b => `
                <tr class="hover:bg-purple-50/60 dark:hover:bg-purple-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800">
                    <td class="px-3 py-2 text-slate-500 font-mono whitespace-nowrap min-w-[90px]">${b.tanggal || '-'}</td>
                    <td class="px-3 py-2 font-mono whitespace-nowrap min-w-[140px]">
                        <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-purple-700 dark:text-purple-300 font-bold text-[11px]">
                            ${b.nomor_bkb || b.no_bkb || '-'}
                        </span>
                    </td>
                    <td class="px-3 py-2 font-bold font-mono text-blue-600 dark:text-sky-400 whitespace-nowrap min-w-[130px] cursor-pointer hover:underline" onclick="window.pns.drillToUnit('${b.kode_unit}')">${b.kode_unit}</td>
                    <td class="px-3 py-2 font-semibold truncate max-w-[180px] min-w-[140px]">${b.nama_asset}</td>
                    <td class="px-3 py-2 text-center min-w-[100px]">
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            ${b.kategori}
                        </span>
                    </td>
                    <td class="px-3 py-2 text-right font-mono font-bold text-purple-600 whitespace-nowrap min-w-[100px]">${formatNum(b.liter, 0)} L</td>
                    <td class="px-3 py-2 text-right font-mono whitespace-nowrap min-w-[110px]">${formatRp(b.biaya || b.total_biaya || 0)}</td>
                </tr>
            `).join('');
        }
    }
}

// -------------------------------------------------------------
// VIEW 6D: MASTER ASET DETAIL & SPESIFIKASI
// -------------------------------------------------------------
let bldgRoomsData = null;
let assetDetailGroupFilter = 'ALL';
let assetDetailCondFilter = 'ALL';
let assetDetailSearchQuery = '';
let selectedSpotlightAssetCode = null;
let assetDetailTableMode = 'PARENT';
let assetDetailBldgActiveItemClass = 'ALL';
let assetDetailBldgActiveRoom = 'ALL';

export function setAssetDetailTableMode(mode) {
    assetDetailTableMode = mode || 'PARENT';
    const tabParent = document.getElementById('pbi-assetd-tab-parent');
    const tabBreakdown = document.getElementById('pbi-assetd-tab-breakdown');
    if (tabParent && tabBreakdown) {
        if (assetDetailTableMode === 'BREAKDOWN') {
            tabBreakdown.className = 'px-2.5 py-1 rounded-md text-[10px] font-bold bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-2xs cursor-pointer flex items-center gap-1';
            tabParent.className = 'px-2.5 py-1 rounded-md text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 cursor-pointer';
        } else {
            tabParent.className = 'px-2.5 py-1 rounded-md text-[10px] font-bold bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-2xs cursor-pointer';
            tabBreakdown.className = 'px-2.5 py-1 rounded-md text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 cursor-pointer flex items-center gap-1';
        }
    }
    if (pbiData.cache) renderAssetDetail(pbiData.cache.assets, pbiData.cache.maint);
}

export function filterAssetDetailBldgItem(itemClass) {
    assetDetailBldgActiveItemClass = itemClass || 'ALL';
    const spotlight = window._currentAssetDetailSpotlight;
    const bldg = window._currentAssetDetailBuilding;
    if (spotlight && bldg) renderAssetDetailBuildingBreakdown(spotlight, bldg);
}

export function filterAssetDetailBldgRoom(roomName) {
    assetDetailBldgActiveRoom = roomName || 'ALL';
    const spotlight = window._currentAssetDetailSpotlight;
    const bldg = window._currentAssetDetailBuilding;
    if (spotlight && bldg) renderAssetDetailBuildingBreakdown(spotlight, bldg);
}

function findBuildingForAsset(asset) {
    if (!asset || !bldgRoomsData || !bldgRoomsData.data) return null;
    const code = (asset.kode_asset || asset.kode_unit || '').trim();
    const name = (asset.nama_asset_detail || asset.nama_asset || '').trim();
    const loc = (asset.lokasi || asset.location || '').trim();

    // 1. Direct O(1) lookup in parent_asset_index
    if (bldgRoomsData.parent_asset_index && bldgRoomsData.parent_asset_index[code]) {
        const bName = bldgRoomsData.parent_asset_index[code];
        const found = bldgRoomsData.data.find(b => b.nama_bangunan === bName);
        if (found) return found;
    }

    // 2. Direct parent_asset object check
    let found = bldgRoomsData.data.find(b => b.parent_asset && b.parent_asset.kode_unit === code);
    if (found) return found;

    // 3. String normalization match
    const norm = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const codeNorm = norm(code);
    const nameNorm = norm((name || '').replace(/LONG\s*HOUSE/gi, 'LH'));

    found = bldgRoomsData.data.find(b => {
        const bNorm = norm(b.nama_bangunan);
        if (codeNorm && bNorm.includes(codeNorm)) return true;
        if (nameNorm.length >= 4 && bNorm.includes(nameNorm)) {
            if (!loc || !b.lokasi_code || loc === b.lokasi_code || b.lokasi_code.includes(loc) || loc.includes(b.lokasi_code)) {
                return true;
            }
        }
        // Match LH code like PNS-LH-01-01 <=> 10.01
        const lhMatch = code.match(/PNS-LH-0?(\d+)-0?(\d+)/i);
        if (lhMatch) {
            const t1 = '10.0' + lhMatch[2];
            const t2 = '10.' + lhMatch[2];
            if (b.nama_bangunan.includes(t1) || b.nama_bangunan.includes(t2)) {
                if (!loc || !b.lokasi_code || loc === b.lokasi_code || b.lokasi_code.includes(loc) || loc.includes(b.lokasi_code)) {
                    return true;
                }
            }
        }
        return false;
    });

    return found || null;
}

function renderAssetDetailBuildingBreakdown(targetSpotlight, targetBuilding) {
    window._currentAssetDetailSpotlight = targetSpotlight;
    window._currentAssetDetailBuilding = targetBuilding;

    const card = document.getElementById('pbi-assetd-bldg-breakdown-card');
    if (!card) return;

    if (!targetBuilding) {
        card.classList.add('hidden');
        card.classList.remove('flex');
        const bldgAction = document.getElementById('pbi-assetd-spotlight-bldg-action');
        if (bldgAction) bldgAction.classList.add('hidden');
        const tableTabs = document.getElementById('pbi-assetd-table-mode-tabs');
        if (tableTabs) tableTabs.classList.add('hidden');
        return;
    }

    card.classList.remove('hidden');
    card.classList.add('flex');

    const bldgAction = document.getElementById('pbi-assetd-spotlight-bldg-action');
    if (bldgAction) {
        bldgAction.classList.remove('hidden');
        const btn = document.getElementById('pbi-assetd-spotlight-bldg-btn');
        if (btn) {
            btn.onclick = () => window.pns.openBuildingInRoomExplorer(targetBuilding.lokasi_code, targetBuilding.nama_bangunan);
        }
    }

    const tableTabs = document.getElementById('pbi-assetd-table-mode-tabs');
    if (tableTabs) {
        tableTabs.classList.remove('hidden');
        tableTabs.classList.add('flex');
        setElText('pbi-assetd-tab-breakdown-count', targetBuilding.total_units);
    }

    // Set Header Info
    setElText('pbi-assetd-bldg-loc-badge', targetBuilding.lokasi_code);
    const scopeBadge = document.getElementById('pbi-assetd-bldg-scope-badge');
    if (scopeBadge && targetBuilding.scope) {
        scopeBadge.innerText = targetBuilding.scope.badge;
    }
    setElText('pbi-assetd-bldg-name', `${targetBuilding.nama_bangunan} (${targetSpotlight.kode_asset})`);

    // Quick Stats
    setElText('pbi-assetd-bldg-stat-rooms', `${targetBuilding.room_count} ${targetBuilding.scope && targetBuilding.scope.key !== 'INDOOR' ? 'Titik/Spot' : 'Ruang / Kamar'}`);
    setElText('pbi-assetd-bldg-stat-units', `${targetBuilding.total_units} Unit Fasilitas`);
    setElText('pbi-assetd-bldg-stat-good', `${targetBuilding.good_pct.toFixed(0)}% Baik`);
    setElText('pbi-assetd-bldg-stat-acq', formatRp(targetSpotlight.harga_perolehan || targetBuilding.total_acq));

    // Connect Open Explorer button
    const openBtn = document.getElementById('pbi-assetd-btn-open-explorer');
    if (openBtn) {
        openBtn.onclick = () => window.pns.openBuildingInRoomExplorer(targetBuilding.lokasi_code, targetBuilding.nama_bangunan);
    }

    // Gather all units & item summary
    const itemMap = {};
    let allUnits = [];
    (targetBuilding.rooms || []).forEach(rm => {
        (rm.units || []).forEach(u => {
            allUnits.push({ ...u, room_name: rm.room_name });
        });
        (rm.item_summary || []).forEach(it => {
            const k = it.item_name;
            itemMap[k] = (itemMap[k] || 0) + it.qty;
        });
    });

    // Render Item Summary Pills
    const pillsContainer = document.getElementById('pbi-assetd-bldg-item-pills');
    if (pillsContainer) {
        const itemEntries = Object.entries(itemMap).sort((a, b) => b[1] - a[1]);
        const isAllSelected = (assetDetailBldgActiveItemClass === 'ALL');

        let pillsHtml = `
            <button type="button" onclick="window.pns.filterAssetDetailBldgItem('ALL')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                isAllSelected 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }">
                <i class="ph-bold ph-squares-four text-xs"></i>
                <span>Semua Jenis (${targetBuilding.total_units})</span>
            </button>
        `;

        itemEntries.forEach(([itName, qty]) => {
            const isSel = (assetDetailBldgActiveItemClass === itName);
            const icon = getFacilityIcon(itName);
            pillsHtml += `
                <button type="button" onclick="window.pns.filterAssetDetailBldgItem('${itName}')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    isSel 
                    ? 'bg-blue-600 text-white shadow-xs' 
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                }">
                    <i class="ph-bold ${icon} text-xs text-blue-500 ${isSel ? 'text-white' : ''}"></i>
                    <span>${itName}</span>
                    <span class="font-mono text-[10px] px-1.5 py-0.2 rounded-full ${isSel ? 'bg-blue-700 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">${qty}</span>
                </button>
            `;
        });
        pillsContainer.innerHTML = pillsHtml;
    }

    // Render Room Selector Tabs
    const roomSelector = document.getElementById('pbi-assetd-bldg-room-selector');
    if (roomSelector) {
        if (targetBuilding.rooms.length > 1) {
            roomSelector.classList.remove('hidden');
            const isAllRooms = (assetDetailBldgActiveRoom === 'ALL');
            let roomHtml = `
                <span class="text-[10px] font-extrabold uppercase text-slate-400 dark:text-slate-500 mr-1 flex items-center gap-1">
                    <i class="ph-bold ph-door"></i> Ruangan:
                </span>
                <button type="button" onclick="window.pns.filterAssetDetailBldgRoom('ALL')" class="px-2.5 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                    isAllRooms 
                    ? 'bg-emerald-600 text-white shadow-2xs' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }">Semua Ruangan</button>
            `;
            targetBuilding.rooms.forEach(rm => {
                const isSel = (assetDetailBldgActiveRoom === rm.room_name);
                roomHtml += `
                    <button type="button" onclick="window.pns.filterAssetDetailBldgRoom('${rm.room_name.replace(/'/g, "\\'")}')" class="px-2.5 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                        isSel 
                        ? 'bg-emerald-600 text-white shadow-2xs' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }">${rm.room_name} (${rm.total_units})</button>
                `;
            });
            roomSelector.innerHTML = roomHtml;
        } else {
            roomSelector.classList.add('hidden');
        }
    }

    // Filter units for child table
    let filteredUnits = allUnits;
    if (assetDetailBldgActiveItemClass !== 'ALL') {
        filteredUnits = filteredUnits.filter(u => (u.klasifikasi || '').toLowerCase() === assetDetailBldgActiveItemClass.toLowerCase());
    }
    if (assetDetailBldgActiveRoom !== 'ALL') {
        filteredUnits = filteredUnits.filter(u => u.room_name === assetDetailBldgActiveRoom);
    }

    // Render Child Units Table Body
    const tbody = document.getElementById('pbi-assetd-bldg-units-tbody');
    if (tbody) {
        if (filteredUnits.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400 font-medium">Tidak ada fasilitas yang cocok dengan filter yang dipilih.</td></tr>`;
        } else {
            tbody.innerHTML = filteredUnits.map(u => {
                const isGood = u.is_good;
                return `
                    <tr class="hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition border-b border-slate-100 dark:border-slate-800">
                        <td class="px-3.5 py-2 font-mono font-bold text-blue-600 dark:text-sky-400">${u.kode_unit || u.no_asset}</td>
                        <td class="px-3.5 py-2 font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px]" title="${u.nama_asset}">
                            <div class="flex items-center gap-1.5">
                                <i class="ph-bold ${getFacilityIcon(u.klasifikasi)} text-blue-500 shrink-0"></i>
                                <span class="truncate">${u.nama_asset}</span>
                            </div>
                        </td>
                        <td class="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">${u.klasifikasi}</td>
                        <td class="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[160px]">${u.room_name}</td>
                        <td class="px-3 py-2 text-center">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isGood ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}">
                                ${u.kondisi}
                            </span>
                        </td>
                        <td class="px-3 py-2 text-slate-500 truncate max-w-[120px]">${u.pic_nama || u.penanggungjawab_section || '-'}</td>
                        <td class="px-3 py-2 text-center">
                            <button type="button" onclick="event.stopPropagation(); window.pns.drillToUnit('${u.kode_unit || u.no_asset}')" class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-[10px] font-bold transition flex items-center gap-1 mx-auto" title="Lihat Profil Unit">
                                <i class="ph-bold ph-gauge"></i> Profil
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
}

function onAssetDetailFilterChange() {
    const grp = document.getElementById('slicer-assetd-group');
    const cnd = document.getElementById('slicer-assetd-cond');
    if (grp) assetDetailGroupFilter = grp.value;
    if (cnd) assetDetailCondFilter = cnd.value;
    if (pbiData.cache) renderAssetDetail(pbiData.cache.assets, pbiData.cache.maint);
}

function onAssetDetailSearch(query) {
    assetDetailSearchQuery = query || '';
    if (pbiData.cache) renderAssetDetail(pbiData.cache.assets, pbiData.cache.maint);
}

function selectSpotlightAsset(assetCode) {
    selectedSpotlightAssetCode = assetCode;
    if (pbiData.cache) renderAssetDetail(pbiData.cache.assets, pbiData.cache.maint);
}

function renderAssetDetail(assets, maint) {
    if (!assets || assets.length === 0) return;

    if (!bldgRoomsData && typeof reloadBuildingRoomsData === 'function') {
        reloadBuildingRoomsData();
    }

    const rawList = measureAssetDetailSpec(assets, maint);
    
    // Populate Group Dropdown
    const grpSelect = document.getElementById('slicer-assetd-group');
    if (grpSelect && grpSelect.options && grpSelect.options.length <= 1) {
        const groups = [...new Set(rawList.map(a => a.kelompok).filter(Boolean))].sort();
        groups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = g;
            grpSelect.appendChild(opt);
        });
    }

    let list = rawList;
    if (assetDetailGroupFilter !== 'ALL') {
        list = list.filter(a => a.kelompok === assetDetailGroupFilter);
    }
    if (assetDetailCondFilter !== 'ALL') {
        list = list.filter(a => (a.kondisi || '').toLowerCase().includes(assetDetailCondFilter.toLowerCase()));
    }
    if (assetDetailSearchQuery.trim() !== '') {
        const q = assetDetailSearchQuery.toLowerCase();
        list = list.filter(a => 
            (a.kode_asset && a.kode_asset.toLowerCase().includes(q)) ||
            (a.nama_asset && a.nama_asset.toLowerCase().includes(q)) ||
            (a.departemen && a.departemen.toLowerCase().includes(q)) ||
            (a.lokasi && a.lokasi.toLowerCase().includes(q)) ||
            (a.kelompok && a.kelompok.toLowerCase().includes(q))
        );
    }

    setElText('pbi-assetd-filtered-count', formatNum(list.length));

    // Dynamic Aggregations
    const totalAcq = list.reduce((acc, a) => acc + a.harga_perolehan, 0);
    const totalBook = list.reduce((acc, a) => acc + a.nilai_buku, 0);
    const totalMtc = list.reduce((acc, a) => acc + a.maint_cost, 0);

    setElText('pbi-assetd-total-count', formatNum(list.length) + ' Unit');
    setElText('pbi-assetd-total-acq', formatRp(totalAcq));
    setElText('pbi-assetd-total-book', formatRp(totalBook));
    setElText('pbi-assetd-total-mtc', formatRp(totalMtc));

    // Spotlight Unit Dossier Card
    let targetSpotlight = null;
    if (selectedSpotlightAssetCode) {
        targetSpotlight = list.find(a => a.kode_asset === selectedSpotlightAssetCode) || rawList.find(a => a.kode_asset === selectedSpotlightAssetCode);
    }
    if (!targetSpotlight && list.length > 0) {
        targetSpotlight = list[0];
    }

    const targetBuilding = findBuildingForAsset(targetSpotlight);

    if (targetSpotlight) {
        setElText('pbi-assetd-spotlight-code', targetSpotlight.kode_asset);
        setElText('pbi-assetd-spotlight-cond', targetSpotlight.kondisi);
        setElText('pbi-assetd-spotlight-name', targetSpotlight.nama_asset);
        const picText = targetSpotlight.pic_nama ? ` | PIC: ${targetSpotlight.pic_nama}` : '';
        const secText = targetSpotlight.penanggungjawab_section ? ` | Section: ${targetSpotlight.penanggungjawab_section}` : ` | Dept: ${targetSpotlight.departemen}`;
        const bldgMetaText = targetBuilding ? ` • 🏢 Fasilitas Gedung: ${targetBuilding.total_units} Unit (${targetBuilding.room_count} Ruang)` : '';
        setElText('pbi-assetd-spotlight-meta', `Lokasi: ${targetSpotlight.lokasi}${secText}${picText} | Umur: ${targetSpotlight.umur_pakai_bln} Bln${bldgMetaText}`);
        setElText('pbi-assetd-spotlight-ratio', `${(targetSpotlight.mtc_ratio_pct || 0).toFixed(1)}%`);
        
        const recEl = document.getElementById('pbi-assetd-spotlight-rec');
        if (recEl) {
            recEl.innerText = targetSpotlight.lifecycle_recommendation || 'Aset Produktif & Optimal';
            const rec = targetSpotlight.lifecycle_recommendation || '';
            if (rec.includes('DISPOSAL')) {
                recEl.className = 'px-2.5 py-1 rounded-lg text-[10.5px] font-bold inline-block mt-0.5 bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300';
            } else if (rec.includes('OVER-AGE') || rec.includes('TINGGI')) {
                recEl.className = 'px-2.5 py-1 rounded-lg text-[10.5px] font-bold inline-block mt-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
            } else {
                recEl.className = 'px-2.5 py-1 rounded-lg text-[10.5px] font-bold inline-block mt-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
            }
        }
    }

    // Render Dedicated Building Breakdown
    renderAssetDetailBuildingBreakdown(targetSpotlight, targetBuilding);

    // If viewing single building asset, reflect total inventory count in KPI
    if (list.length === 1 && targetBuilding) {
        setElText('pbi-assetd-total-count', `1 Gedung (${targetBuilding.total_units} Fasilitas)`);
    }

    // 1. Chart Acquisition by Department / Location
    const deptMap = {};
    list.forEach(a => {
        const d = a.departemen || a.lokasi || 'KANTOR PUSAT';
        deptMap[d] = (deptMap[d] || 0) + a.harga_perolehan;
    });
    const sortedDepts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    renderApex('#chart-pbi-assetd-dept-bar', {
        chart: { type: 'bar', height: 210, toolbar: { show: false } },
        series: [{ name: 'Nilai Perolehan', data: sortedDepts.map(d => Math.round(d[1] / 1_000_000)) }],
        xaxis: { 
            categories: sortedDepts.map(d => d[0]), 
            labels: { 
                style: { fontSize: '10px', fontWeight: 600 }, 
                formatter: v => formatK(v) + 'M' 
            } 
        },
        yaxis: { 
            labels: { 
                style: { fontSize: '10px', fontWeight: 600 },
                maxWidth: 150
            } 
        },
        colors: ['#10b981'],
        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } },
        dataLabels: {
            enabled: true,
            formatter: v => 'Rp ' + formatK(v) + 'M',
            style: { fontSize: '9.5px', fontWeight: 700 }
        }
    });

    // 2. Chart Condition Donut
    const condMap = {};
    list.forEach(a => {
        const k = a.kondisi || 'Good Condition';
        condMap[k] = (condMap[k] || 0) + 1;
    });
    const condKeys = Object.keys(condMap);
    renderApex('#chart-pbi-assetd-cond-donut', {
        chart: { type: 'donut', height: 200 },
        series: condKeys.map(k => condMap[k]),
        labels: condKeys,
        colors: ['#10b981', '#ef4444', '#f59e0b', '#64748b', '#3b82f6'],
        plotOptions: { 
            pie: { 
                donut: { 
                    size: '68%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total',
                            formatter: () => formatNum(list.length, 0),
                            style: { fontSize: '11px', fontWeight: 800 }
                        }
                    }
                } 
            } 
        },
        dataLabels: { enabled: false },
        legend: { position: 'bottom', fontSize: '10.5px', fontWeight: 600 }
    });

    // 3. Right Dossier Table
    const tbody = document.getElementById('table-pbi-assetd-matrix');
    if (tbody) {
        // Mode 1: Breakdown Fasilitas Gedung
        if (assetDetailTableMode === 'BREAKDOWN' && targetBuilding) {
            let allUnits = [];
            (targetBuilding.rooms || []).forEach(rm => {
                (rm.units || []).forEach(u => {
                    allUnits.push({ ...u, room_name: rm.room_name });
                });
            });

            if (allUnits.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="text-center py-8 text-slate-400 font-medium">Tidak ada fasilitas terdata di dalam gedung ini.</td></tr>';
            } else {
                tbody.innerHTML = allUnits.map(u => {
                    const isGood = u.is_good;
                    return `
                        <tr class="hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800">
                            <td class="px-3.5 py-2.5 font-bold text-blue-600 dark:text-sky-400 whitespace-nowrap font-mono">
                                <span>${u.kode_unit || u.no_asset}</span>
                            </td>
                            <td class="px-3.5 py-2.5 font-semibold truncate max-w-[180px] min-w-[140px] text-slate-800 dark:text-slate-100">
                                <div class="flex items-center gap-1.5">
                                    <i class="ph-bold ${getFacilityIcon(u.klasifikasi)} text-blue-500 shrink-0"></i>
                                    <span class="truncate">${u.nama_asset}</span>
                                </div>
                            </td>
                            <td class="px-3.5 py-2.5 text-slate-500 truncate max-w-[120px]">${u.klasifikasi}</td>
                            <td class="px-3.5 py-2.5 font-medium text-slate-700 dark:text-slate-300 truncate max-w-[140px]">${u.room_name}</td>
                            <td class="px-3.5 py-2.5 font-bold text-blue-600 dark:text-sky-400 truncate max-w-[130px]">${u.penanggungjawab_section || '-'}</td>
                            <td class="px-3.5 py-2.5 font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[120px]">${u.pic_nama || '-'}</td>
                            <td class="px-3.5 py-2.5 text-center">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isGood ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}">
                                    ${u.kondisi}
                                </span>
                            </td>
                            <td class="px-3.5 py-2.5 text-right font-mono font-bold">${formatRp(u.total_harga_perolehan || 0)}</td>
                            <td class="px-3.5 py-2.5 text-right font-mono text-slate-400">-</td>
                            <td class="px-3.5 py-2.5 text-center">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                                    Fasilitas Gedung
                                </span>
                            </td>
                            <td class="px-3.5 py-2.5 text-center">
                                <button type="button" onclick="event.stopPropagation(); window.pns.drillToUnit('${u.kode_unit || u.no_asset}')" class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-[10px] font-bold transition flex items-center gap-1 mx-auto" title="Lihat Profil Unit">
                                    <i class="ph-bold ph-gauge"></i> Profil
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
            return;
        }

        // Mode 2: Master Aset Biasa
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-8 text-slate-400 font-medium">Tidak ada data aset yang sesuai filter.</td></tr>';
            return;
        }

        tbody.innerHTML = list.slice(0, 100).map(a => {
            const isGood = (a.kondisi || '').toLowerCase().includes('good');
            const rec = a.lifecycle_recommendation || 'OPTIMAL';
            const sec = a.penanggungjawab_section || a.kode_section || '-';
            const pic = a.pic_nama || a.user_pic || '-';
            let badgeClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
            if (rec.includes('DISPOSAL')) {
                badgeClass = 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300';
            } else if (rec.includes('OVER-AGE') || rec.includes('TINGGI')) {
                badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
            }

            return `
                <tr onclick="window.pns.selectSpotlightAsset('${a.kode_asset}')" class="hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik untuk fokus Spotlight pada aset ${a.kode_asset}">
                    <td class="px-3.5 py-2.5 font-bold text-blue-600 dark:text-sky-400 whitespace-nowrap">
                        <div class="flex items-center gap-1.5 font-mono">
                            <span>${a.kode_asset}</span>
                            <i class="ph-bold ph-cursor-click text-[10px] text-emerald-500 opacity-0 group-hover:opacity-100 transition"></i>
                        </div>
                    </td>
                    <td class="px-3.5 py-2.5 font-semibold truncate max-w-[180px] min-w-[140px]">${a.nama_asset}</td>
                    <td class="px-3.5 py-2.5 text-slate-500 truncate max-w-[120px]">${a.kelompok}</td>
                    <td class="px-3.5 py-2.5 text-slate-500">${a.lokasi}</td>
                    <td class="px-3.5 py-2.5 font-bold text-blue-600 dark:text-sky-400 truncate max-w-[130px]">${sec}</td>
                    <td class="px-3.5 py-2.5 font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[120px]">${pic}</td>
                    <td class="px-3.5 py-2.5 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isGood ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}">
                            ${a.kondisi}
                        </span>
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-bold">${formatRp(a.harga_perolehan)}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono text-rose-600 font-bold">${formatRp(a.maint_cost)}</td>
                    <td class="px-3.5 py-2.5 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}">
                            ${rec}
                        </span>
                    </td>
                    <td class="px-3.5 py-2.5 text-center">
                        <button type="button" onclick="event.stopPropagation(); window.pns.drillToUnit('${a.kode_asset}')" class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-[10px] font-bold transition flex items-center gap-1 mx-auto" title="Lihat Profil Unit">
                            <i class="ph-bold ph-gauge"></i> Profil
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}


// -------------------------------------------------------------
// VIEW 7B: MAINTENANCE DETAIL MATERIAL & PARTS
// -------------------------------------------------------------
let maintDetailJenisFilter = 'ALL';
let maintDetailSearchQuery = '';

function onMaintDetailFilterChange() {
    const sel = document.getElementById('slicer-maintd-jenis');
    if (sel) maintDetailJenisFilter = sel.value;
    if (pbiData.cache) renderMaintDetail(pbiData.cache.maint);
}

function onMaintDetailSearch(query) {
    maintDetailSearchQuery = query || '';
    if (pbiData.cache) renderMaintDetail(pbiData.cache.maint);
}

function renderMaintDetail(maint) {
    const summary = measureMaintenanceMaterialDetail(maint);
    let list = summary.partsList;

    if (maintDetailJenisFilter !== 'ALL') {
        list = list.filter(p => p.jenis.toUpperCase() === maintDetailJenisFilter.toUpperCase());
    }
    if (maintDetailSearchQuery.trim() !== '') {
        const q = maintDetailSearchQuery.toLowerCase();
        list = list.filter(p => 
            (p.part_name && p.part_name.toLowerCase().includes(q)) ||
            (p.kategori && p.kategori.toLowerCase().includes(q))
        );
    }

    setElText('pbi-maintd-filtered-count', formatNum(list.length));

    // KPI Cards
    const totalQty = list.reduce((acc, p) => acc + p.total_qty, 0);
    const totalCost = list.reduce((acc, p) => acc + p.total_cost, 0);
    const avgCost = totalQty > 0 ? (totalCost / totalQty) : 0;

    setElText('pbi-maintd-parts-count', formatNum(list.length) + ' Item');
    setElText('pbi-maintd-total-qty', formatNum(totalQty, 0) + ' Parts');
    setElText('pbi-maintd-total-cost', formatRp(totalCost));
    setElText('pbi-maintd-avg-cost', formatRp(avgCost));

    // Chart 1: Top 10 By Cost
    const top10Cost = list.slice(0, 10);
    renderApex('#chart-pbi-maintd-top-cost', {
        chart: { type: 'bar', height: '100%', toolbar: { show: false } },
        series: [{ name: 'Total Biaya (Rp)', data: top10Cost.map(p => Math.round(p.total_cost / 1_000_000)) }],
        xaxis: { 
            categories: top10Cost.map(p => p.part_name.substring(0, 20)), 
            labels: { 
                style: { fontSize: '10px', fontWeight: 600 }, 
                formatter: v => formatK(v) + 'M' 
            } 
        },
        yaxis: { 
            labels: { 
                style: { fontSize: '10px', fontWeight: 600 },
                maxWidth: 150
            } 
        },
        colors: ['#f43f5e'],
        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } },
        dataLabels: {
            enabled: true,
            formatter: v => formatK(v) + 'M',
            style: { fontSize: '9.5px', fontWeight: 700 }
        }
    });

    // Chart 2: Top 10 By Qty
    const top10Qty = [...list].sort((a, b) => b.total_qty - a.total_qty).slice(0, 10);
    renderApex('#chart-pbi-maintd-top-qty', {
        chart: { type: 'bar', height: '100%', toolbar: { show: false } },
        series: [{ name: 'Kuantitas Diganti', data: top10Qty.map(p => Math.round(p.total_qty)) }],
        xaxis: { 
            categories: top10Qty.map(p => p.part_name.substring(0, 20)), 
            labels: { 
                style: { fontSize: '10px', fontWeight: 600 }, 
                formatter: v => formatNum(v, 0) 
            } 
        },
        yaxis: { 
            labels: { 
                style: { fontSize: '10px', fontWeight: 600 },
                maxWidth: 150
            } 
        },
        colors: ['#a855f7'],
        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } },
        dataLabels: {
            enabled: true,
            formatter: v => formatNum(v, 0),
            style: { fontSize: '9.5px', fontWeight: 700 }
        }
    });

    // Right Material Ledger Table
    const tbody = document.getElementById('table-pbi-maintd-matrix');
    if (tbody) {
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400 font-medium">Tidak ada data part yang sesuai filter.</td></tr>';
            return;
        }

        const maxCost = Math.max(...list.slice(0, 100).map(p => p.total_cost), 1);

        tbody.innerHTML = list.slice(0, 100).map(p => {
            const pct = Math.min(100, (p.total_cost / maxCost) * 100);
            return `
                <tr class="hover:bg-amber-50/60 dark:hover:bg-amber-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800">
                    <td class="px-3.5 py-2.5 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px] hover:text-amber-600 cursor-pointer" onclick="window.pns.onMaintDetailSearch('${p.part_name}')" title="Klik untuk filter part ini">
                        <div class="flex items-center gap-1.5">
                            <span>${p.part_name}</span>
                            <i class="ph-bold ph-magnifying-glass text-[10px] text-amber-500"></i>
                        </div>
                    </td>
                    <td class="px-3.5 py-2.5 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.jenis === 'MATERIAL' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'}">
                            ${p.jenis}
                        </span>
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-bold">${formatNum(p.total_qty, 0)}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                        <div class="flex items-center justify-end gap-2">
                            <div class="w-12 bg-rose-100 dark:bg-rose-950/40 rounded-full h-2 overflow-hidden">
                                <div class="bg-rose-500 h-full rounded-full" style="width: ${pct}%"></div>
                            </div>
                            <span>${formatRp(p.total_cost)}</span>
                        </div>
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono">${formatRp(p.avg_cost_per_qty)}</td>
                    <td class="px-3.5 py-2.5 text-center font-mono font-bold text-blue-600">${p.freq}x</td>
                    <td class="px-3.5 py-2.5 text-center font-mono">${p.affected_units_count} unit</td>
                </tr>
            `;
        }).join('');
    }
}

// -------------------------------------------------------------
// DRILL-THROUGH & INTER-MODULE DEEP LINKING
// -------------------------------------------------------------
function drillToUnit(unitCode) {
    if (!unitCode) return;
    const clean = String(unitCode).trim();
    const unitSelect = document.getElementById('slicer-vra4-unit-select');
    if (unitSelect) {
        unitSelect.value = clean;
    }
    switchView('view-vra-4');
    if (pbiData.cache) {
        const { assets, vra, fuel, maint } = pbiData.cache;
        renderVra4(assets, vra, fuel, maint);
    }
}

function drillToFuelDetail(unitCode) {
    if (!unitCode) return;
    const clean = String(unitCode).trim();
    switchView('view-fuel-detail');
    const searchInput = document.getElementById('slicer-fueld-search');
    if (searchInput) {
        searchInput.value = clean;
    }
    onFuelDetailSearch(clean);
}

function drillToAssetDetail(assetCode) {
    if (!assetCode) return;
    const clean = String(assetCode).trim();
    switchView('view-asset-detail');
    const searchInput = document.getElementById('slicer-assetd-search');
    if (searchInput) {
        searchInput.value = clean;
    }
    onAssetDetailSearch(clean);
}

function drillToMaintDetail(query) {
    if (!query) return;
    const clean = String(query).trim();
    switchView('view-maint-detail');
    const searchInput = document.getElementById('slicer-maintd-search');
    if (searchInput) {
        searchInput.value = clean;
    }
    onMaintDetailSearch(clean);
}

function drillToOfficeAssets(locationName) {
    if (!locationName) return;
    const clean = String(locationName).trim();
    switchView('view-asset-detail');
    const searchInput = document.getElementById('slicer-assetd-search');
    if (searchInput) {
        searchInput.value = clean;
    }
    onAssetDetailSearch(clean);
}

function drillFromVra4(targetType) {
    const unitSelect = document.getElementById('slicer-vra4-unit-select');
    const unitCode = unitSelect ? unitSelect.value : '';
    if (!unitCode) return;
    if (targetType === 'fuel') {
        drillToFuelDetail(unitCode);
    } else if (targetType === 'maint') {
        drillToMaintDetail(unitCode);
    } else if (targetType === 'asset') {
        drillToAssetDetail(unitCode);
    }
}

export function drillToCategoryDetail(category, openInNewTab = false) {
    const cat = category || currentSelectedCategory || 'SPEEDBOAT';
    currentSelectedCategory = cat;
    if (openInNewTab) {
        window.open(`index.php?view=vra-category-detail&cat=${encodeURIComponent(cat)}`, '_blank');
    } else {
        switchView('view-vra-category-detail');
        if (pbiData.cache) {
            const { vra, fuel, assets } = pbiData.cache;
            renderVraCategoryDetail(cat, vra, fuel, assets);
        }
    }
}

export function openCategoryInNewTab() {
    window.open(`index.php?view=vra-category-detail&cat=${encodeURIComponent(currentSelectedCategory || 'SPEEDBOAT')}`, '_blank');
}

export function selectCategoryDetail(cat) {
    currentSelectedCategory = cat;
    switchView('view-vra-category-detail');
    if (pbiData.cache) {
        const { vra, fuel, assets } = pbiData.cache;
        renderVraCategoryDetail(cat, vra, fuel, assets);
    }
}

export function onCatLogSearch(q) {
    catLogSearchQuery = q || '';
    if (pbiData.cache) {
        const { vra, fuel, assets } = pbiData.cache;
        renderVraCategoryDetail(currentSelectedCategory, vra, fuel, assets);
    }
}

// -------------------------------------------------------------
// CSV EXPORT UTILITIES
// -------------------------------------------------------------
function downloadCsv(filename, headers, rows) {
    const csvRows = [];
    csvRows.push(headers.map(h => `"${String(h ?? '').replace(/"/g, '""')}"`).join(','));
    rows.forEach(row => {
        csvRows.push(row.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob(["\uFEFF" + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportAssetCatalogCsv() {
    if (!pbiData.cache || !pbiData.cache.assets) return;
    let list = pbiData.cache.assets;
    if (assetTypeFilter === 'valuable') {
        list = list.filter(a => Number(a.total_harga_perolehan || a.Nilai_buku || 0) > 0);
    } else if (assetTypeFilter === 'non_valuable') {
        list = list.filter(a => Number(a.total_harga_perolehan || a.Nilai_buku || 0) === 0);
    }
    if (assetKatFilter !== 'ALL') {
        list = list.filter(a => a.kode_kategori === assetKatFilter);
    }
    if (assetKondisiFilter !== 'ALL') {
        list = list.filter(a => (a.kondisi || '').toLowerCase() === assetKondisiFilter.toLowerCase());
    }
    if (assetSearchQuery.trim() !== '') {
        const q = assetSearchQuery.toLowerCase();
        list = list.filter(a => (a.kode_unit && a.kode_unit.toLowerCase().includes(q)) || (a.nama_asset && a.nama_asset.toLowerCase().includes(q)));
    }
    const headers = ['Kode Unit', 'Nama Asset', 'Kategori', 'Kelompok', 'Kondisi', 'Umur (Thn)', 'Standar Umur', 'Status Lifetime', 'Harga Perolehan', 'Nilai Buku', 'Penyusutan'];
    const rows = list.map(a => [
        a.kode_unit,
        a.nama_asset,
        a.kode_kategori || '',
        a.kode_kelompok || '',
        a.kondisi || '',
        a.umur_asset || 0,
        a.standar_umur || 5,
        a.lifetime || '',
        a.total_harga_perolehan || 0,
        a.Nilai_buku || 0,
        a.Total_penyusutan || 0
    ]);
    downloadCsv('Katalog_Master_Aset.csv', headers, rows);
}

function exportFuelDetailCsv() {
    if (!pbiData.cache) return;
    const res = measureFuelDetailLog(pbiData.cache.fuel, pbiData.cache.vra, pbiData.assetMap);
    if (currentFuelDetailTableTab === 'bkb') {
        const headers = ['Tanggal', 'Nomor BKB', 'Kode Unit', 'Nama Asset', 'Kategori', 'Volume (L)', 'Total Biaya (Rp)'];
        const rows = res.rawBkbLogs.map(b => [
            b.tanggal,
            b.nomor_bkb,
            b.kode_unit,
            b.nama_asset,
            b.kategori,
            b.liter,
            b.total_biaya
        ]);
        downloadCsv('Log_Transaksi_BKB_BBM.csv', headers, rows);
    } else {
        const headers = ['Kode Unit', 'Nama Asset', 'Kategori', 'Total Liter', 'Total Biaya (Rp)', 'Total KM', 'Total Jam', 'KM/Liter', 'Liter/Jam', 'Status Anomali'];
        const rows = res.unitList.map(u => [
            u.kode_unit,
            u.nama_asset,
            u.kategori,
            u.total_liter,
            u.total_biaya,
            u.total_km,
            u.total_jam,
            u.km_per_liter,
            u.liter_per_jam,
            u.is_anomaly ? 'BOROS / ANOMALI' : 'NORMAL'
        ]);
        downloadCsv('Matriks_Konsumsi_BBM_Unit.csv', headers, rows);
    }
}

function exportAssetDetailCsv() {
    if (!pbiData.cache) return;
    const list = measureAssetDetailSpec(pbiData.cache.assets, pbiData.cache.maint);
    const headers = ['Kode Aset', 'Nama Aset', 'Kelompok', 'Departemen', 'Lokasi', 'Kondisi', 'Harga Perolehan', 'Nilai Buku', 'Biaya MTC', 'Rasio MTC/CAPEX (%)', 'Umur Pakai (Bln)', 'Rekomendasi Lifecycle'];
    const rows = list.map(a => [
        a.kode_asset,
        a.nama_asset,
        a.kelompok,
        a.departemen,
        a.lokasi,
        a.kondisi,
        a.harga_perolehan,
        a.nilai_buku,
        a.maint_cost,
        a.mtc_ratio_pct,
        a.umur_pakai_bln,
        a.lifecycle_recommendation
    ]);
    downloadCsv('Dossier_Spesifikasi_Aset.csv', headers, rows);
}

// -------------------------------------------------------------
// VIEW 6E: MASTER ASET - 5. IN-BUILDING VS OUTDOOR
// -------------------------------------------------------------
let expandedInOutLoc = null;

function toggleInOutLocationDetail(locKey) {
    expandedInOutLoc = (expandedInOutLoc === locKey) ? null : locKey;
    if (pbiData.cache) renderAssetInOut(pbiData.cache.assets, pbiData.cache.maint);
}

let currentBuildingModalData = {
    location: '',
    buildingName: '',
    units: [],
    filteredUnits: []
};

function openBuildingAssetModal(locName, buildingName) {
    if (!pbiData.cache || !pbiData.cache.assets) return;
    const assets = pbiData.cache.assets;
    const bldgAssets = assets.filter(a => {
        const matchLoc = (a.location || inferAssetLocation(a)) === locName;
        const fallbackBldgName = (a.nama_bangunan || a.detail_lokasi || 'GEDUNG UTAMA').trim();
        const matchBldg = fallbackBldgName.toLowerCase() === (buildingName || '').trim().toLowerCase();
        return matchLoc && matchBldg && (a.is_in_building || a.building_status === 'IN_BUILDING');
    });

    let bldgAcq = 0, bldgBook = 0, goodCount = 0, bldgMaintCost = 0, bldgMaintCount = 0;
    const rooms = new Set();
    const maintList = pbiData.cache.maint || [];
    
    // Map maint by unit code
    const maintMap = new Map();
    maintList.forEach(m => {
        const u = String(m.kode_unit || '').trim();
        if (u) {
            if (!maintMap.has(u)) maintMap.set(u, { count: 0, cost: 0 });
            const item = maintMap.get(u);
            item.count += 1;
            item.cost += Number(m.nominal) || 0;
        }
    });

    const enrichedBldgAssets = bldgAssets.map(a => {
        const uCode = String(a.kode_unit || '').trim();
        const mInfo = maintMap.get(uCode) || { count: 0, cost: 0 };
        const acq = Number(a.total_harga_perolehan ?? a.harga_perolehan ?? a.nilai_perolehan ?? 0);
        const book = Number(a.Nilai_buku ?? a.nilai_buku ?? 0);
        bldgAcq += acq;
        bldgBook += book;
        bldgMaintCost += mInfo.cost;
        bldgMaintCount += mInfo.count;

        const k = (a.kondisi || '').toLowerCase();
        if (k.includes('good') || k.includes('baik') || (!k.includes('repair') && !k.includes('broken') && !k.includes('lost') && !k.includes('disposal'))) goodCount++;
        if (a.detail_lokasi) rooms.add(a.detail_lokasi);

        return {
            ...a,
            acq: acq,
            book: book,
            maintCount: mInfo.count,
            maintCost: mInfo.cost
        };
    });

    const goodPct = enrichedBldgAssets.length > 0 ? (goodCount / enrichedBldgAssets.length) * 100 : 100;

    currentBuildingModalData = {
        location: locName,
        buildingName: buildingName,
        acq: bldgAcq,
        book: bldgBook,
        maintCost: bldgMaintCost,
        maintCount: bldgMaintCount,
        goodPct: goodPct,
        units: enrichedBldgAssets,
        filteredUnits: enrichedBldgAssets,
        onlyMaintFilter: false
    };

    setElText('modal-bldg-name', buildingName);
    setElText('modal-bldg-subtitle', `Lokasi: ${locName} • ${rooms.size} Ruangan/Spot Terdata`);
    setElText('modal-bldg-count', `${formatNum(enrichedBldgAssets.length)} Unit`);
    setElText('modal-bldg-acq', `Acq: ${formatRp(bldgAcq)}`);
    setElText('modal-bldg-book', `NBV: ${formatRp(bldgBook)}`);
    setElText('modal-bldg-good', `Good: ${goodPct.toFixed(0)}%`);
    setElText('modal-bldg-maint', `Mtc: ${bldgMaintCount}x • ${formatRp(bldgMaintCost)}`);

    const maintBtn = document.getElementById('modal-bldg-maint-btn');
    if (maintBtn) {
        maintBtn.classList.remove('ring-2', 'ring-amber-500', 'bg-amber-100', 'dark:bg-amber-900/60');
    }

    const searchInput = document.getElementById('modal-bldg-search');
    if (searchInput) searchInput.value = '';

    const btnDrill = document.getElementById('btn-modal-bldg-drill');
    if (btnDrill) {
        btnDrill.onclick = () => {
            closeBuildingModal();
            drillToAssetDrillthrough({ office: locName, bangunan: buildingName, env: 'IN_BUILDING' });
        };
    }

    renderBuildingModalTable(currentBuildingModalData.units);

    const modal = document.getElementById('modal-building-assets');
    if (modal) modal.classList.remove('hidden');
}

function closeBuildingModal() {
    const modal = document.getElementById('modal-building-assets');
    if (modal) modal.classList.add('hidden');
}

function toggleBuildingMaintFilter() {
    currentBuildingModalData.onlyMaintFilter = !currentBuildingModalData.onlyMaintFilter;
    const btn = document.getElementById('modal-bldg-maint-btn');
    if (btn) {
        if (currentBuildingModalData.onlyMaintFilter) {
            btn.classList.add('ring-2', 'ring-amber-500', 'bg-amber-100', 'dark:bg-amber-900/60');
        } else {
            btn.classList.remove('ring-2', 'ring-amber-500', 'bg-amber-100', 'dark:bg-amber-900/60');
        }
    }
    applyBuildingModalFilters();
}

function applyBuildingModalFilters() {
    const searchInput = document.getElementById('modal-bldg-search');
    const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
    let res = currentBuildingModalData.units || [];
    if (currentBuildingModalData.onlyMaintFilter) {
        res = res.filter(u => (u.maintCount || 0) > 0);
    }
    if (q) {
        res = res.filter(u => 
            (u.kode_unit && u.kode_unit.toLowerCase().includes(q)) ||
            (u.nama_asset && u.nama_asset.toLowerCase().includes(q)) ||
            (u.detail_lokasi && u.detail_lokasi.toLowerCase().includes(q)) ||
            (u.kategori && u.kategori.toLowerCase().includes(q))
        );
    }
    currentBuildingModalData.filteredUnits = res;
    renderBuildingModalTable(currentBuildingModalData.filteredUnits);
}

function filterBuildingModalUnits(query) {
    applyBuildingModalFilters();
}

function renderBuildingModalTable(units = []) {
    const tbody = document.getElementById('modal-bldg-table-body');
    const footerText = document.getElementById('modal-bldg-footer-text');
    if (footerText) {
        let txt = `Menampilkan ${formatNum(units.length)} dari ${formatNum(currentBuildingModalData.units.length)} unit aset`;
        if (currentBuildingModalData.onlyMaintFilter) {
            txt += ' (Filter Maintenance Aktif: hanya unit berservis)';
        }
        footerText.innerText = txt;
    }

    if (!tbody) return;
    if (units.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-6 text-slate-400 font-medium">Tidak ada data aset yang sesuai kriteria.</td></tr>';
        return;
    }

    tbody.innerHTML = units.map(u => {
        const safeKode = (u.kode_unit || '').replace(/'/g, "\\'");
        const hasMaint = (u.maintCount || 0) > 0;
        return `
        <tr onclick="window.pns.openUnitDetailModal('${safeKode}')" class="hover:bg-blue-50/70 dark:hover:bg-blue-950/30 transition text-xs border-b border-slate-100 dark:border-slate-800 cursor-pointer group" title="Klik baris untuk lihat detail aset & riwayat maintenance">
            <td class="px-3 py-2 font-mono font-bold text-blue-600 dark:text-sky-400 whitespace-nowrap">
                <div class="flex items-center gap-1.5">
                    <span>${u.kode_unit}</span>
                    <i class="ph-bold ph-arrow-square-out text-[11px] text-blue-500 opacity-0 group-hover:opacity-100 transition"></i>
                </div>
            </td>
            <td class="px-3 py-2 font-semibold truncate max-w-[220px]" title="${u.nama_asset}">${u.nama_asset}</td>
            <td class="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium truncate max-w-[180px]">${u.detail_lokasi || '-'}</td>
            <td class="px-3 py-2 text-slate-500">${u.kategori || '-'}</td>
            <td class="px-3 py-2 text-center">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${String(u.kondisi).toLowerCase().includes('good') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}">
                    ${u.kondisi || 'Good'}
                </span>
            </td>
            <td class="px-3 py-2 text-center font-mono font-bold ${hasMaint ? 'text-amber-600' : 'text-slate-400'}">
                ${hasMaint ? `<span class="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold">${u.maintCount}x</span>` : '-'}
            </td>
            <td class="px-3 py-2 text-right font-mono font-bold ${u.maintCost > 0 ? 'text-amber-600' : 'text-slate-400'}">${u.maintCost > 0 ? formatRp(u.maintCost) : '-'}</td>
            <td class="px-3 py-2 text-right font-mono">${formatRp(u.acq)}</td>
            <td class="px-3 py-2 text-right font-mono font-bold text-blue-600 dark:text-sky-400">${formatRp(u.book)}</td>
            <td class="px-3 py-2 text-center" onclick="event.stopPropagation()">
                <button type="button" onclick="window.pns.openUnitDetailModal('${safeKode}')" class="px-2 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/50 hover:bg-cyan-600 hover:text-white text-cyan-700 dark:text-cyan-300 text-[10.5px] font-bold border border-cyan-200 dark:border-cyan-800 transition flex items-center gap-1 mx-auto cursor-pointer shadow-2xs" title="Lihat detail unit & riwayat maintenance">
                    <i class="ph-bold ph-eye"></i> Detail
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

function openUnitDetailModal(unitCode) {
    if (!unitCode) return;
    const clean = String(unitCode).trim();
    if (!pbiData.cache || !pbiData.cache.assets) return;

    // Find asset
    const asset = pbiData.cache.assets.find(a => 
        String(a.kode_unit || a.kode_asset || '').trim().toLowerCase() === clean.toLowerCase()
    ) || {
        kode_unit: clean,
        nama_asset: clean,
        kondisi: 'Good Condition'
    };

    // Find maintenance records
    const maintList = (pbiData.cache.maint || []).filter(m => 
        String(m.kode_unit || m.kode_asset || '').trim().toLowerCase() === clean.toLowerCase()
    );

    // Sort maintenance by date desc
    maintList.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));

    const acq = Number(asset.total_harga_perolehan ?? asset.harga_perolehan ?? asset.nilai_perolehan ?? 0);
    const book = Number(asset.Nilai_buku ?? asset.nilai_buku ?? 0);
    const totalMtcCost = maintList.reduce((acc, m) => acc + (Number(m.nominal) || Number(m.total_biaya) || Number(m.harga_bkb) || 0), 0);
    const mtcCount = maintList.length;
    const mtcRatio = acq > 0 ? (totalMtcCost / acq) * 100 : 0;
    const isGood = String(asset.kondisi || '').toLowerCase().includes('good');

    // Header
    setElText('modal-unit-code', asset.kode_unit || clean);
    setElText('modal-unit-name', asset.nama_asset || '-');
    setElText('modal-unit-subtitle', `Lokasi: ${asset.location || inferAssetLocation(asset) || '-'} • Gedung: ${asset.nama_bangunan || '-'} • Ruangan: ${asset.detail_lokasi || '-'}`);

    // Card 1: Spesifikasi Aset
    setElText('modal-unit-category', asset.kode_kategori || asset.kategori || '-');
    setElText('modal-unit-group', asset.kode_kelompok || asset.kelompok || '-');
    setElText('modal-unit-room', asset.detail_lokasi || '-');
    const condEl = document.getElementById('modal-unit-cond-badge');
    if (condEl) {
        condEl.innerText = asset.kondisi || 'Good Condition';
        condEl.className = `px-2 py-0.5 rounded-full text-[10.5px] font-bold ${isGood ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}`;
    }

    // Card 2: Finansial & Umur
    setElText('modal-unit-acq', formatRp(acq));
    setElText('modal-unit-book', formatRp(book));
    setElText('modal-unit-age', `${asset.umur_asset || 0} Thn (Standar: ${asset.standar_umur || 5} Thn)`);

    // Card 3: CARD MAINTENANCE
    setElText('modal-unit-maint-cost', formatRp(totalMtcCost));
    setElText('modal-unit-maint-count', `${mtcCount}x Servis`);
    setElText('modal-unit-maint-ratio', `${mtcRatio.toFixed(1)}% CAPEX`);
    
    const recEl = document.getElementById('modal-unit-maint-rec');
    if (recEl) {
        if (mtcRatio > 50) {
            recEl.innerText = '🚨 MTC > 50% CAPEX (Evaluasi Ganti)';
            recEl.className = 'px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300';
        } else if (mtcCount > 0) {
            recEl.innerText = '✅ Terawat & Aktif';
            recEl.className = 'px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
        } else {
            recEl.innerText = '✨ Belum Ada Servis';
            recEl.className = 'px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
        }
    }

    // Maintenance History Table
    const countBadge = document.getElementById('modal-unit-maint-badge-count');
    if (countBadge) countBadge.innerText = `${mtcCount} Servis`;

    const tbody = document.getElementById('modal-unit-maint-tbody');
    if (tbody) {
        if (maintList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-8 text-slate-400 font-medium">
                        <div class="flex flex-col items-center justify-center gap-1.5">
                            <i class="ph-bold ph-wrench text-2xl text-slate-300 dark:text-slate-600"></i>
                            <span>Unit ini belum memiliki riwayat maintenance/servis tercatat.</span>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = maintList.map((m, idx) => {
                const cost = Number(m.nominal) || Number(m.total_biaya) || Number(m.harga_bkb) || 0;
                return `
                    <tr class="hover:bg-amber-50/40 dark:hover:bg-amber-950/20 text-xs border-b border-slate-100 dark:border-slate-800">
                        <td class="px-3 py-2 text-center text-slate-400 font-mono">${idx + 1}</td>
                        <td class="px-3 py-2 font-mono whitespace-nowrap text-slate-700 dark:text-slate-300 font-medium">${m.tanggal || '-'}</td>
                        <td class="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 max-w-[260px] truncate" title="${m.nama_spare_part_jasa}">${m.nama_spare_part_jasa || '-'}</td>
                        <td class="px-3 py-2 text-slate-500 whitespace-nowrap">${m.KATEGORI_SERVICES || m.kategori_barang_jasa || '-'}</td>
                        <td class="px-3 py-2 text-center font-mono">${m.qty || 1}</td>
                        <td class="px-3 py-2 text-right font-mono font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">${formatRp(cost)}</td>
                        <td class="px-3 py-2 text-slate-500 max-w-[150px] truncate" title="${m.bengkel || m.keterangan || m.kode_section || '-'}">${m.bengkel || m.keterangan || m.kode_section || '-'}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Drill buttons
    const btnDossier = document.getElementById('btn-modal-unit-dossier');
    if (btnDossier) {
        btnDossier.onclick = () => {
            closeUnitDetailModal();
            closeBuildingModal();
            drillToAssetDetail(asset.kode_unit || clean);
        };
    }

    const btnMaintLedger = document.getElementById('btn-modal-unit-maint-ledger');
    if (btnMaintLedger) {
        btnMaintLedger.onclick = () => {
            closeUnitDetailModal();
            closeBuildingModal();
            drillToMaintDetail(asset.kode_unit || clean);
        };
    }

    const modal = document.getElementById('modal-unit-detail');
    if (modal) modal.classList.remove('hidden');
}

function closeUnitDetailModal() {
    const modal = document.getElementById('modal-unit-detail');
    if (modal) modal.classList.add('hidden');
}

function renderAssetInOut(assets, maint = []) {
    if (!assets) return;
    const rep = measureAssetEnvironmentReport(assets, maint);
    const s = rep.summary;

    setElText('pbi-inout-in-count', formatNum(s.inCount));
    setElText('pbi-inout-in-pct', `${s.inPct.toFixed(1)}% dari Total Unit`);
    setElText('pbi-inout-out-count', formatNum(s.outCount));
    setElText('pbi-inout-out-pct', `${s.outPct.toFixed(1)}% dari Total Unit`);
    setElText('pbi-inout-in-acq', formatRp(s.inAcq));
    setElText('pbi-inout-in-book', `NBV: ${formatRp(s.inBook)}`);
    setElText('pbi-inout-out-acq', formatRp(s.outAcq));
    setElText('pbi-inout-out-book', `NBV: ${formatRp(s.outBook)}`);

    const tbody = document.getElementById('table-pbi-inout-body');
    if (tbody) {
        tbody.innerHTML = rep.locBreakdown.map(l => {
            const isExp = (expandedInOutLoc === l.location);
            const mainRow = `
                <tr onclick="window.pns.toggleInOutLocationDetail('${l.location}')" class="hover:bg-blue-50/50 dark:hover:bg-blue-950/20 border-b border-slate-100 dark:border-slate-800 text-xs cursor-pointer transition">
                    <td class="px-3 py-2 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <i class="ph-bold ${isExp ? 'ph-caret-down text-blue-600' : 'ph-caret-right text-slate-400'}"></i>
                        <span>${l.location}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold">${l.buildings.length} Bangunan</span>
                    </td>
                    <td class="px-3 py-2 text-right font-mono font-bold">${formatNum(l.totalAsset)}</td>
                    <td class="px-3 py-2 text-right font-mono text-blue-600 font-bold">${formatNum(l.inCount)} (${l.inPct.toFixed(1)}%)</td>
                    <td class="px-3 py-2 text-right font-mono text-amber-600 font-bold">${formatNum(l.outCount)} (${l.outPct.toFixed(1)}%)</td>
                    <td class="px-3 py-2 text-right font-mono">${formatRp(l.inAcq)}</td>
                    <td class="px-3 py-2 text-right font-mono">${formatRp(l.outAcq)}</td>
                </tr>
            `;

            let detailRow = '';
            if (isExp && l.buildings.length > 0) {
                detailRow = `
                    <tr class="bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700">
                        <td colspan="6" class="p-3">
                            <div class="space-y-2">
                                <div class="flex items-center justify-between">
                                    <div class="text-[11px] font-extrabold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                                        <i class="ph-bold ph-buildings text-blue-600"></i> Rincian Aset Dalam Bangunan & Ruangan di ${l.location}:
                                    </div>
                                    <button type="button" onclick="event.stopPropagation(); window.pns.drillToAssetDrillthrough({ office: '${l.location}', env: 'IN_BUILDING' })" class="text-[10.5px] font-bold text-blue-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer">
                                        <span>Lihat Seluruh Aset In-Building (${formatNum(l.inCount)})</span>
                                        <i class="ph-bold ph-arrow-right"></i>
                                    </button>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                                    ${l.buildings.map(b => {
                                        const safeBldgName = b.nama_bangunan.replace(/'/g, "\\'");
                                        return `
                                        <div onclick="window.pns.openBuildingAssetModal('${l.location}', '${safeBldgName}')" class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer transition group">
                                            <div class="flex items-start justify-between gap-2">
                                                <div>
                                                    <span class="text-xs font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400 block transition">${b.nama_bangunan}</span>
                                                    <span class="text-[10px] text-slate-400 font-medium">${b.roomCount} Ruangan / Spot Terdata</span>
                                                </div>
                                                <div class="flex items-center gap-1 shrink-0">
                                                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 font-mono">${b.count} Unit</span>
                                                    <span class="text-slate-400 group-hover:text-blue-600 text-xs"><i class="ph-bold ph-arrow-square-out"></i></span>
                                                </div>
                                            </div>
                                            <div class="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono">
                                                <span class="text-slate-400">Acq: ${formatRp(b.acq)}</span>
                                                ${(b.maintCost || 0) > 0 ? `<span class="text-amber-600 font-bold">Mtc: ${formatRp(b.maintCost)}</span>` : ''}
                                                <span class="text-emerald-600 font-bold">Good: ${b.goodPct.toFixed(0)}%</span>
                                            </div>
                                            ${b.units.length > 0 ? `
                                                <div class="mt-2 space-y-1">
                                                    <div class="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase">
                                                        <span>Contoh Unit:</span>
                                                        <span class="text-blue-500 font-semibold group-hover:underline">Klik untuk lihat semua ${b.count} unit →</span>
                                                    </div>
                                                    <div class="space-y-0.5 max-h-[80px] overflow-y-auto scrollbar-thin">
                                                        ${b.units.slice(0, 5).map(u => `
                                                            <div class="text-[9.5px] flex items-center justify-between text-slate-600 dark:text-slate-400">
                                                                <span class="truncate font-mono font-bold text-blue-600 mr-1" title="${u.nama_asset}">${u.kode_unit}</span>
                                                                <span class="truncate text-[9px]">${u.detail_lokasi}</span>
                                                            </div>
                                                        `).join('')}
                                                    </div>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `}).join('')}
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }

            return mainRow + detailRow;
        }).join('');
    }
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// VIEW: MASTER ASET - INVENTARIS GEDUNG & KAMAR
// -------------------------------------------------------------
let bldgSelectedScope = 'ALL';
let bldgSelectedLoc = 'ALL';
let bldgSelectedCat = 'ALL';
let bldgSearchQuery = '';
let bldgCurrentSelectedName = null;
let bldgCurrentSelectedRoom = 'ALL';

export async function renderAssetBuildingRooms() {
    if (!bldgRoomsData) {
        await reloadBuildingRoomsData();
        return;
    }
    updateBuildingRoomsUI();
}

export async function reloadBuildingRoomsData() {
    try {
        const container = document.getElementById('bldg-cards-container');
        if (container) {
            container.innerHTML = `
                <div class="p-8 text-center text-slate-400">
                    <i class="ph-bold ph-spinner animate-spin text-2xl mb-2 text-blue-600 block"></i>
                    <p class="text-xs font-semibold">Memuat data inventaris gedung & kamar...</p>
                </div>
            `;
        }

        const res = await fetch('../pns_asset/api/asset/buildings.php');
        const json = await res.json();
        if (json.success) {
            bldgRoomsData = json;
            populateBuildingFilters(json.filters);
            updateBuildingRoomsUI();
            if (activeViewId === 'view-asset-detail' && pbiData.cache && pbiData.cache.assets) {
                renderAssetDetail(pbiData.cache.assets, pbiData.cache.maint);
            }
        } else {
            console.error('Failed to load buildings data', json);
        }
    } catch (e) {
        console.error('Error fetching buildings data:', e);
    }
}

function populateBuildingFilters(filters) {
    const locSel = document.getElementById('filter-bldg-loc');
    const catSel = document.getElementById('filter-bldg-cat');

    if (locSel && filters && filters.locations) {
        const curLoc = locSel.value || 'ALL';
        locSel.innerHTML = '<option value="ALL">Semua Lokasi</option>' + 
            filters.locations.map(loc => `<option value="${loc}">${loc}</option>`).join('');
        locSel.value = curLoc;
    }

    if (catSel && filters && filters.categories) {
        const curCat = catSel.value || 'ALL';
        catSel.innerHTML = '<option value="ALL">Semua Kategori</option>' + 
            filters.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        catSel.value = curCat;
    }

    if (filters && filters.scopes) {
        setElText('scope-count-ALL', filters.scopes.ALL ? filters.scopes.ALL.bldgs : '0');
        setElText('scope-count-INDOOR', filters.scopes.INDOOR ? filters.scopes.INDOOR.bldgs : '0');
        setElText('scope-count-OUTDOOR', filters.scopes.OUTDOOR ? filters.scopes.OUTDOOR.bldgs : '0');
        setElText('scope-count-INFRASTRUCTURE', filters.scopes.INFRASTRUCTURE ? filters.scopes.INFRASTRUCTURE.bldgs : '0');
    }
}

export function onBuildingScopeChange(scopeKey) {
    bldgSelectedScope = scopeKey || 'ALL';

    const scopes = ['ALL', 'INDOOR', 'OUTDOOR', 'INFRASTRUCTURE'];
    scopes.forEach(s => {
        const btn = document.getElementById(`scope-tab-${s}`);
        if (btn) {
            if (s === bldgSelectedScope) {
                btn.className = 'bldg-scope-pill px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-blue-600 text-white shadow-xs cursor-pointer shrink-0 h-10';
            } else {
                btn.className = 'bldg-scope-pill px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0 h-10';
            }
        }
    });

    updateBuildingRoomsUI();
}

export function onBuildingFilterChange() {
    const locSel = document.getElementById('filter-bldg-loc');
    const catSel = document.getElementById('filter-bldg-cat');
    bldgSelectedLoc = locSel ? locSel.value : 'ALL';
    bldgSelectedCat = catSel ? catSel.value : 'ALL';
    updateBuildingRoomsUI();
}

export function onBuildingSearchInput(query) {
    bldgSearchQuery = query || '';
    updateBuildingRoomsUI();
}

export function selectBuilding(bldgName) {
    bldgCurrentSelectedName = bldgName;
    bldgCurrentSelectedRoom = 'ALL';
    updateBuildingRoomsUI();
}

export function selectRoom(roomName) {
    bldgCurrentSelectedRoom = roomName;
    updateBuildingRoomsUI();
}

export function openBuildingInRoomExplorer(loc, bldg) {
    if (typeof closeBuildingModal === 'function') closeBuildingModal();
    if (bldg) {
        bldgCurrentSelectedName = bldg;
        bldgCurrentSelectedRoom = 'ALL';
    }
    if (loc && loc !== 'ALL') {
        bldgSelectedLoc = loc;
        const locSel = document.getElementById('filter-bldg-loc');
        if (locSel) locSel.value = loc;
    }
    switchView('view-asset-building-rooms');
}

export function printRoomChecklist() {
    window.print();
}

function getFacilityIcon(itemName) {
    const s = (itemName || '').toLowerCase();
    if (s.includes('kasur') || s.includes('springbed') || s.includes('bed')) return 'ph-bed';
    if (s.includes('bantal') || s.includes('guling')) return 'ph-cloud';
    if (s.includes('ac') || s.includes('air conditioner') || s.includes('exhaust') || s.includes('kipas')) return 'ph-snowflake';
    if (s.includes('loker') || s.includes('lemari') || s.includes('pedestal') || s.includes('rak') || s.includes('nakas')) return 'ph-dresser';
    if (s.includes('apar') || s.includes('fire')) return 'ph-fire-extinguisher';
    if (s.includes('meja')) return 'ph-table';
    if (s.includes('kursi') || s.includes('sofa') || s.includes('bangku')) return 'ph-armchair';
    if (s.includes('dispenser') || s.includes('galon') || s.includes('air')) return 'ph-drop';
    if (s.includes('kompor') || s.includes('gas') || s.includes('pantry') || s.includes('kulkas')) return 'ph-cooking-pot';
    if (s.includes('lampu') || s.includes('listrik') || s.includes('kabel') || s.includes('stop kontak')) return 'ph-lightning';
    if (s.includes('tv') || s.includes('televisi') || s.includes('monitor')) return 'ph-television';
    if (s.includes('sapu') || s.includes('pengki') || s.includes('keranjang') || s.includes('tempat sampah')) return 'ph-trash';
    if (s.includes('pompa') || s.includes('mesin') || s.includes('stabilizer')) return 'ph-gear';
    return 'ph-package';
}

function updateBuildingRoomsUI() {
    if (!bldgRoomsData || !bldgRoomsData.data) return;

    const query = (bldgSearchQuery || '').trim().toLowerCase();
    const loc = bldgSelectedLoc;
    const cat = bldgSelectedCat;
    const scope = bldgSelectedScope;

    const filteredBldgs = bldgRoomsData.data.filter(b => {
        const matchLoc = (loc === 'ALL' || b.lokasi_code === loc);
        const matchCat = (cat === 'ALL' || b.category === cat);
        const matchScope = (scope === 'ALL' || (b.scope && b.scope.key === scope));
        if (!matchLoc || !matchCat || !matchScope) return false;

        if (!query) return true;

        if (b.nama_bangunan.toLowerCase().includes(query)) return true;
        if (b.lokasi_code.toLowerCase().includes(query)) return true;
        if (b.category.toLowerCase().includes(query)) return true;

        for (const rm of b.rooms) {
            if (rm.room_name.toLowerCase().includes(query)) return true;
            for (const item of rm.item_summary) {
                if (item.item_name.toLowerCase().includes(query)) return true;
            }
            for (const u of rm.units) {
                if ((u.kode_unit || '').toLowerCase().includes(query)) return true;
                if ((u.nama_asset || '').toLowerCase().includes(query)) return true;
            }
        }
        return false;
    });

    // Update KPI Cards
    const totalBldg = filteredBldgs.length;
    let totalRooms = 0, totalUnits = 0, totalAcq = 0, totalGood = 0;
    filteredBldgs.forEach(b => {
        totalRooms += b.room_count;
        totalUnits += b.total_units;
        totalAcq += b.total_acq;
        totalGood += b.good_units;
    });
    const goodPct = totalUnits > 0 ? (totalGood / totalUnits) * 100 : 100;

    setElText('bldg-kpi-total-buildings', formatNum(totalBldg));
    setElText('bldg-kpi-total-rooms', formatNum(totalRooms));
    setElText('bldg-kpi-total-units', formatNum(totalUnits));
    setElText('bldg-kpi-good-pct', `${goodPct.toFixed(1)}%`);
    setElText('bldg-kpi-acq-sub', `Nilai: ${formatRp(totalAcq)}`);
    setElText('bldg-list-count', `${totalBldg} Lokasi / Gedung`);

    // Render Left Pane (Building Cards)
    const cardsContainer = document.getElementById('bldg-cards-container');
    if (cardsContainer) {
        if (filteredBldgs.length === 0) {
            cardsContainer.innerHTML = `
                <div class="p-6 text-center text-slate-400">
                    <i class="ph-bold ph-buildings text-3xl mb-1 opacity-50 block"></i>
                    <p class="text-xs font-semibold">Tidak ada gedung yang cocok dengan filter / pencarian.</p>
                </div>
            `;
        } else {
            if (!bldgCurrentSelectedName || !filteredBldgs.some(b => b.nama_bangunan === bldgCurrentSelectedName)) {
                bldgCurrentSelectedName = filteredBldgs[0].nama_bangunan;
                bldgCurrentSelectedRoom = 'ALL';
            }

            cardsContainer.innerHTML = filteredBldgs.map(b => {
                const isSel = (b.nama_bangunan === bldgCurrentSelectedName);
                const safeName = b.nama_bangunan.replace(/'/g, "\\'");

                let catBg = 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
                if (b.category.includes('LONGHOUSE')) catBg = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300';
                else if (b.category.includes('MESS') || b.category.includes('GUEST')) catBg = 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300';
                else if (b.category.includes('BARAK')) catBg = 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
                else if (b.category.includes('KANTOR')) catBg = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';

                let scopeTag = '';
                if (b.scope) {
                    let scopeStyle = 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
                    if (b.scope.key === 'OUTDOOR') scopeStyle = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
                    else if (b.scope.key === 'INFRASTRUCTURE') scopeStyle = 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
                    scopeTag = `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${scopeStyle}">${b.scope.badge}</span>`;
                }

                return `
                    <div onclick="window.pns.selectBuilding('${safeName}')" class="p-3 rounded-xl border transition cursor-pointer ${
                        isSel 
                        ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 dark:border-blue-600 shadow-xs' 
                        : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700'
                    }">
                        <div class="flex items-start justify-between gap-1.5 mb-1.5">
                            <span class="text-xs font-black text-slate-800 dark:text-white line-clamp-1 ${isSel ? 'text-blue-600 dark:text-blue-400' : ''}" title="${b.nama_bangunan}">
                                ${b.nama_bangunan}
                            </span>
                            <div class="flex items-center gap-1 shrink-0">
                                ${scopeTag}
                                <span class="text-[9px] font-black px-1.5 py-0.5 rounded font-mono ${catBg}">
                                    ${b.category}
                                </span>
                            </div>
                        </div>
                        <div class="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <div class="flex items-center gap-1.5">
                                <span class="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-bold font-mono text-slate-700 dark:text-slate-300">[${b.lokasi_code}]</span>
                                <span class="font-bold text-slate-600 dark:text-slate-300">${b.room_count} ${b.scope && b.scope.key !== 'INDOOR' ? 'Titik/Spot' : 'Kamar/Ruang'}</span>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <span class="font-bold font-mono text-blue-600 dark:text-sky-400">${b.total_units} Unit</span>
                                <span class="font-mono text-emerald-600 font-bold">${b.good_pct.toFixed(0)}% Good</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Render Right Pane (Selected Building Details)
    const activeBldg = filteredBldgs.find(b => b.nama_bangunan === bldgCurrentSelectedName);
    if (!activeBldg) {
        setElText('selected-bldg-name', 'Pilih salah satu bangunan');
        const roomPills = document.getElementById('room-pills-container');
        if (roomPills) roomPills.innerHTML = '';
        const summaryGrid = document.getElementById('room-summary-grid');
        if (summaryGrid) summaryGrid.innerHTML = '';
        const tableBody = document.getElementById('room-table-body');
        if (tableBody) tableBody.innerHTML = '';
        return;
    }

    setElText('selected-bldg-loc-badge', activeBldg.lokasi_code);
    setElText('selected-bldg-cat-badge', activeBldg.category);
    setElText('selected-bldg-name', activeBldg.nama_bangunan);
    setElText('selected-bldg-section', activeBldg.sub_category || 'Operasional Estate');
    setElText('selected-bldg-stats', `${activeBldg.room_count} ${activeBldg.scope && activeBldg.scope.key !== 'INDOOR' ? 'Titik/Spot' : 'Kamar/Ruang'} • ${activeBldg.total_units} Unit Aset`);
    setElText('selected-bldg-good-rate', `${activeBldg.good_pct.toFixed(0)}% Kondisi Baik`);

    const scopeBadgeEl = document.getElementById('selected-bldg-scope-badge');
    if (scopeBadgeEl && activeBldg.scope) {
        scopeBadgeEl.innerText = activeBldg.scope.badge;
        let scopeStyle = 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300';
        if (activeBldg.scope.key === 'OUTDOOR') scopeStyle = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300';
        else if (activeBldg.scope.key === 'INFRASTRUCTURE') scopeStyle = 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300';
        scopeBadgeEl.className = `text-[10px] font-black uppercase px-2 py-0.5 rounded-md font-mono ${scopeStyle}`;
    }

    const parentBox = document.getElementById('selected-bldg-parent-box');
    if (parentBox) {
        if (activeBldg.parent_asset) {
            parentBox.classList.remove('hidden');
            parentBox.classList.add('flex');
            setElText('selected-bldg-parent-code', activeBldg.parent_asset.kode_unit);
            setElText('selected-bldg-parent-val', `Nilai Perolehan: ${formatRp(activeBldg.parent_asset.total_harga_perolehan)}`);
            const btn = document.getElementById('selected-bldg-parent-btn');
            if (btn) {
                btn.onclick = () => {
                    selectedSpotlightAssetCode = activeBldg.parent_asset.kode_unit;
                    assetDetailSearchQuery = activeBldg.parent_asset.kode_unit;
                    const searchInp = document.getElementById('slicer-assetd-search');
                    if (searchInp) searchInp.value = activeBldg.parent_asset.kode_unit;
                    switchView('view-asset-detail');
                    if (pbiData.cache) renderAssetDetail(pbiData.cache.assets, pbiData.cache.maint);
                };
            }
        } else {
            parentBox.classList.add('hidden');
            parentBox.classList.remove('flex');
        }
    }

    const labelEl = document.getElementById('bldg-room-selector-label');
    if (labelEl) {
        if (activeBldg.scope && activeBldg.scope.key === 'INFRASTRUCTURE') {
            labelEl.innerHTML = `<i class="ph-bold ph-lightning text-amber-500"></i> Pilih Titik / Ruas Jaringan:`;
        } else if (activeBldg.scope && activeBldg.scope.key === 'OUTDOOR') {
            labelEl.innerHTML = `<i class="ph-bold ph-tree text-emerald-500"></i> Pilih Spot / Area Luar:`;
        } else {
            labelEl.innerHTML = `<i class="ph-bold ph-door text-blue-500"></i> Pilih Kamar / Ruangan:`;
        }
    }

    // Render Room Navigator Pills
    const roomPillsContainer = document.getElementById('room-pills-container');
    if (roomPillsContainer) {
        const isAllSelected = (bldgCurrentSelectedRoom === 'ALL');
        const allPill = `
            <button type="button" onclick="window.pns.selectRoom('ALL')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                isAllSelected
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }">
                <i class="ph-bold ph-squares-four text-xs"></i>
                <span>Semua Ruangan (${activeBldg.total_units})</span>
            </button>
        `;

        const roomPills = activeBldg.rooms.map(rm => {
            const isRoomSel = (bldgCurrentSelectedRoom === rm.room_name);
            const safeRoom = rm.room_name.replace(/'/g, "\\'");
            return `
                <button type="button" onclick="window.pns.selectRoom('${safeRoom}')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isRoomSel
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }">
                    <i class="ph-bold ph-door text-xs"></i>
                    <span>${rm.room_name}</span>
                    <span class="px-1.5 py-0.2 rounded-full text-[9px] font-mono ${isRoomSel ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} font-bold">${rm.total_units}</span>
                </button>
            `;
        }).join('');

        roomPillsContainer.innerHTML = allPill + roomPills;
    }

    // Determine items and units for room or all
    let itemsToDisplay = [];
    let unitsToDisplay = [];
    if (bldgCurrentSelectedRoom === 'ALL') {
        setElText('room-summary-title', `Ringkasan Kuantitas Fasilitas di Seluruh Ruangan (${activeBldg.nama_bangunan})`);
        setElText('room-table-title', `Daftar Seluruh Unit Aset Fisik (${activeBldg.nama_bangunan})`);

        const itemAgg = {};
        activeBldg.rooms.forEach(rm => {
            rm.item_summary.forEach(it => {
                if (!itemAgg[it.item_name]) {
                    itemAgg[it.item_name] = { item_name: it.item_name, qty: 0, good_qty: 0 };
                }
                itemAgg[it.item_name].qty += it.qty;
                itemAgg[it.item_name].good_qty += it.good_qty;
            });
            unitsToDisplay.push(...rm.units);
        });
        itemsToDisplay = Object.values(itemAgg).sort((a, b) => b.qty - a.qty);
    } else {
        const selectedRoomObj = activeBldg.rooms.find(rm => rm.room_name === bldgCurrentSelectedRoom);
        if (selectedRoomObj) {
            setElText('room-summary-title', `Ringkasan Kuantitas Fasilitas: ${selectedRoomObj.room_name}`);
            setElText('room-table-title', `Daftar Unit Aset Fisik di: ${selectedRoomObj.room_name}`);
            itemsToDisplay = selectedRoomObj.item_summary;
            unitsToDisplay = selectedRoomObj.units;
        }
    }

    setElText('room-summary-total-badge', `${itemsToDisplay.length} Jenis Barang`);
    setElText('room-table-count', `${unitsToDisplay.length} Unit Aset`);

    // Calculate Livability Badge for the Room/Building
    const livabilityBadge = document.getElementById('selected-room-livability-badge');
    if (livabilityBadge) {
        if (unitsToDisplay.length === 0) {
            livabilityBadge.classList.add('hidden');
        } else {
            livabilityBadge.classList.remove('hidden');
            let brokenCount = 0;
            let repairCount = 0;
            let goodCount = 0;
            unitsToDisplay.forEach(u => {
                const k = (u.kondisi || '').toLowerCase();
                if (k.includes('broken') || k.includes('rusak') || k.includes('lost') || k.includes('hilang')) brokenCount++;
                else if (k.includes('repair') || k.includes('perbaikan')) repairCount++;
                else goodCount++;
            });

            if (brokenCount > 0) {
                livabilityBadge.className = 'text-xs font-black px-2.5 py-1 rounded-xl font-mono shadow-2xs bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1.5';
                livabilityBadge.innerHTML = `<i class="ph-bold ph-warning-circle text-xs"></i> 🔴 Tidak Layak Huni (${brokenCount} Rusak)`;
            } else if (repairCount > 0) {
                livabilityBadge.className = 'text-xs font-black px-2.5 py-1 rounded-xl font-mono shadow-2xs bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5';
                livabilityBadge.innerHTML = `<i class="ph-bold ph-wrench text-xs"></i> 🟡 Butuh Perawatan (${repairCount} Unit)`;
            } else {
                livabilityBadge.className = 'text-xs font-black px-2.5 py-1 rounded-xl font-mono shadow-2xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5';
                livabilityBadge.innerHTML = `<i class="ph-bold ph-check-circle text-xs"></i> 🟢 Siap Huni 100% (Layak)`;
            }
        }
    }

    // Render Qty Badges (Kasur: 4, Bantal: 4, dll.)
    const summaryGrid = document.getElementById('room-summary-grid');
    if (summaryGrid) {
        if (itemsToDisplay.length === 0) {
            summaryGrid.innerHTML = `
                <div class="col-span-full p-4 text-center text-slate-400">
                    <p class="text-xs">Belum ada fasilitas terdata di ruangan ini.</p>
                </div>
            `;
        } else {
            summaryGrid.innerHTML = itemsToDisplay.map(it => {
                const icon = getFacilityIcon(it.item_name);
                const isFullyGood = (it.good_qty === it.qty);
                return `
                    <div class="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 hover:border-blue-300 dark:hover:border-blue-700 transition flex items-center justify-between gap-2 shadow-2xs">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-sky-400 flex items-center justify-center shrink-0 text-base">
                                <i class="ph-bold ${icon}"></i>
                            </div>
                            <div class="min-w-0">
                                <span class="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate" title="${it.item_name}">${it.item_name}</span>
                                <span class="text-[10px] font-bold ${isFullyGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">
                                    ${it.good_qty}/${it.qty} Kondisi Baik
                                </span>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="text-lg font-black text-slate-900 dark:text-white font-mono block leading-none">${it.qty}</span>
                            <span class="text-[9px] uppercase font-bold text-slate-400">Unit</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Render Unit Details Table
    const tableBody = document.getElementById('room-table-body');
    if (tableBody) {
        if (unitsToDisplay.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="p-6 text-center text-slate-400">
                        Tidak ada unit aset fisik di ruangan ini.
                    </td>
                </tr>
            `;
        } else {
            tableBody.innerHTML = unitsToDisplay.map((u, idx) => {
                const k = (u.kondisi || '').toLowerCase();
                let condBadge = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
                if (k.includes('broken') || k.includes('rusak')) condBadge = 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
                else if (k.includes('repair') || k.includes('perbaikan')) condBadge = 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
                else if (k.includes('lost') || k.includes('hilang')) condBadge = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';

                const safeUnitCode = (u.kode_unit || '').replace(/'/g, "\\'");
                const roomNameStr = u.detail_lokasi || (activeBldg.rooms.find(rm => rm.units.some(x => x.kode_unit === u.kode_unit)) ? activeBldg.rooms.find(rm => rm.units.some(x => x.kode_unit === u.kode_unit)).room_name : '-');

                return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td class="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">${idx + 1}</td>
                        <td class="px-3 py-2 font-mono font-bold text-blue-600 dark:text-sky-400">
                            <button type="button" onclick="window.pns.openUnitDetailModal('${safeUnitCode}')" class="hover:underline flex items-center gap-1 cursor-pointer">
                                <span>${u.kode_unit}</span>
                                <i class="ph-bold ph-arrow-square-out text-[10px] opacity-70"></i>
                            </button>
                        </td>
                        <td class="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200 max-w-[220px] truncate" title="${u.nama_asset}">
                            ${u.nama_asset}
                        </td>
                        <td class="px-3 py-2 text-slate-600 dark:text-slate-400">
                            <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium text-[10px]">${u.klasifikasi}</span>
                        </td>
                        <td class="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">
                            <span class="flex items-center gap-1 text-[11px]"><i class="ph-bold ph-door text-slate-400"></i> ${roomNameStr}</span>
                        </td>
                        <td class="px-3 py-2 text-center">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${condBadge}">
                                ${u.kondisi || 'Good Condition'}
                            </span>
                        </td>
                        <td class="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300 font-semibold">
                            ${formatRp(u.total_harga_perolehan)}
                        </td>
                        <td class="px-3 py-2 text-right font-mono text-slate-500 font-semibold">
                            ${formatRp(u.nilai_buku)}
                        </td>
                        <td class="px-3 py-2 text-center">
                            <div class="flex items-center justify-center gap-1.5">
                                <button type="button" onclick="window.pns.openInspectionModal('${safeUnitCode}')" class="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs" title="Sensus & Inspeksi Fisik Fasilitas">
                                    <i class="ph-bold ph-clipboard-text"></i> Sensus
                                </button>
                                <button type="button" onclick="window.pns.openUnitDetailModal('${safeUnitCode}')" class="px-2 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white dark:bg-slate-800 dark:hover:bg-blue-600 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold transition cursor-pointer" title="Detail Unit & Riwayat Servis">
                                    Detail
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
}

// =============================================================
// MODUL SENSUS & INSPEKSI FASILITAS KARYAWAN (GEDUNG & KAMAR)
// =============================================================
let currentInspectionUnit = null;

export function openInspectionModal(unitCode) {
    if (!unitCode || !bldgRoomsData || !bldgRoomsData.data) return;

    let foundUnit = null;
    let foundBldg = null;
    let foundRoom = null;

    for (const b of bldgRoomsData.data) {
        for (const rm of b.rooms) {
            const u = rm.units.find(x => x.kode_unit === unitCode);
            if (u) {
                foundUnit = u;
                foundBldg = b;
                foundRoom = rm;
                break;
            }
        }
        if (foundUnit) break;
    }

    if (!foundUnit) {
        alert('Data unit tidak ditemukan dalam inventaris gedung!');
        return;
    }

    currentInspectionUnit = foundUnit;

    const modal = document.getElementById('modal-facility-inspection');
    if (!modal) return;

    // Set hidden fields
    const elAssetId = document.getElementById('modal-insp-asset-id');
    const elKodeUnit = document.getElementById('modal-insp-kode-unit');
    const elBldgName = document.getElementById('modal-insp-bldg-name');
    if (elAssetId) elAssetId.value = foundUnit.asset_id || '';
    if (elKodeUnit) elKodeUnit.value = foundUnit.kode_unit || '';
    if (elBldgName) elBldgName.value = foundBldg.nama_bangunan || '';

    // Set Header & Badges
    setElText('modal-insp-badge-code', foundUnit.kode_unit);
    setElText('modal-insp-badge-current-cond', foundUnit.kondisi || 'Good Condition');
    setElText('modal-insp-title-name', foundUnit.nama_asset || 'Fasilitas Karyawan');
    setElText('modal-insp-subtitle', `${foundBldg.nama_bangunan} • ${foundRoom.room_name}`);

    // Set Display Info Card
    setElText('modal-insp-bldg-display', `${foundBldg.nama_bangunan} (${foundBldg.lokasi_code})`);
    setElText('modal-insp-room-display', foundUnit.detail_lokasi || foundRoom.room_name);
    setElText('modal-insp-val-display', `${formatRp(foundUnit.total_harga_perolehan)} / NBV ${formatRp(foundUnit.nilai_buku)}`);

    // Radio condition matching existing condition
    const radios = document.querySelectorAll('#modal-insp-cond-options input[name="kondisi"]');
    const curCond = (foundUnit.kondisi || '').toLowerCase();
    radios.forEach(r => {
        const val = r.value.toLowerCase();
        if (curCond.includes('broken') && val === 'broken') r.checked = true;
        else if (curCond.includes('repair') && val === 'need repair') r.checked = true;
        else if (curCond.includes('lost') && val === 'missing') r.checked = true;
        else if (curCond.includes('good') && val === 'good condition') r.checked = true;
    });

    // Populate Room Dropdown with rooms of current building
    const roomSelect = document.getElementById('modal-insp-room-select');
    const customRoomInp = document.getElementById('modal-insp-custom-room');
    if (roomSelect) {
        let opts = foundBldg.rooms.map(rm => {
            const isCur = (rm.room_name === (foundUnit.detail_lokasi || foundRoom.room_name));
            return `<option value="${rm.room_name.replace(/"/g, '&quot;')}" ${isCur ? 'selected' : ''}>${rm.room_name}</option>`;
        }).join('');
        opts += `<option value="__CUSTOM__">➕ Pindah ke Ruangan Baru...</option>`;
        roomSelect.innerHTML = opts;
    }
    if (customRoomInp) {
        customRoomInp.value = foundUnit.detail_lokasi || foundRoom.room_name;
    }

    // Populate PIC / Occupant
    const penghuniInp = document.getElementById('modal-insp-penghuni');
    if (penghuniInp) {
        penghuniInp.value = foundUnit.pic_nama || '';
    }

    // Reset notes & photo
    const catatanInp = document.getElementById('modal-insp-catatan');
    if (catatanInp) catatanInp.value = '';
    const fotoInp = document.getElementById('modal-insp-foto');
    if (fotoInp) fotoInp.value = '';

    modal.classList.remove('hidden');
}

export function closeInspectionModal() {
    const modal = document.getElementById('modal-facility-inspection');
    if (modal) modal.classList.add('hidden');
}

export function onInspRoomSelectChange(val) {
    const customRoomInp = document.getElementById('modal-insp-custom-room');
    if (!customRoomInp) return;
    if (val === '__CUSTOM__') {
        customRoomInp.value = '';
        customRoomInp.placeholder = 'Ketik nama ruangan/kamar tujuan (misal: KM 09, Pantry)';
        customRoomInp.focus();
    } else {
        customRoomInp.value = val;
    }
}

export function openBatchRoomAudit() {
    if (!bldgRoomsData || !bldgRoomsData.data) return;
    const activeBldg = bldgRoomsData.data.find(b => b.nama_bangunan === bldgCurrentSelectedName);
    if (!activeBldg) return;

    let targetUnits = [];
    if (bldgCurrentSelectedRoom === 'ALL') {
        activeBldg.rooms.forEach(rm => targetUnits.push(...rm.units));
    } else {
        const rm = activeBldg.rooms.find(r => r.room_name === bldgCurrentSelectedRoom);
        if (rm) targetUnits = rm.units;
    }

    if (targetUnits.length === 0) {
        alert('Tidak ada unit fasilitas di ruangan ini untuk disensus.');
        return;
    }

    openInspectionModal(targetUnits[0].kode_unit);
}

export async function submitInspectionForm(e) {
    if (e && e.preventDefault) e.preventDefault();
    const form = document.getElementById('form-facility-inspection');
    if (!form) return;

    const btnSubmit = document.getElementById('btn-submit-inspection');
    const btnText = document.getElementById('btn-submit-inspection-text');
    const origText = btnText ? btnText.innerText : 'Simpan Hasil Sensus';

    try {
        if (btnSubmit) btnSubmit.disabled = true;
        if (btnText) btnText.innerHTML = `<span class="animate-spin inline-block mr-1">⌛</span> Menyimpan...`;

        const formData = new FormData(form);

        // Ensure room is set from custom input if filled, otherwise select
        const customRoom = (document.getElementById('modal-insp-custom-room')?.value || '').trim();
        const selectRoom = document.getElementById('modal-insp-room-select')?.value || '';
        if (customRoom && customRoom !== '__CUSTOM__') {
            formData.set('detail_lokasi', customRoom);
        } else if (selectRoom && selectRoom !== '__CUSTOM__') {
            formData.set('detail_lokasi', selectRoom);
        }

        const res = await fetch('../pns_asset/api/asset/update_inspection.php', {
            method: 'POST',
            body: formData
        });

        const result = await res.json();

        if (!res.ok || !result.success) {
            throw new Error(result.message || 'Gagal menyimpan hasil sensus!');
        }

        alert(result.message || 'Hasil sensus fasilitas berhasil disimpan!');
        closeInspectionModal();

        // Refresh Building & Rooms dataset
        await reloadBuildingRoomsData();

    } catch (err) {
        alert('Terjadi kesalahan: ' + err.message);
    } finally {
        if (btnSubmit) btnSubmit.disabled = false;
        if (btnText) btnText.innerText = origText;
    }
}

// VIEW 6F: MASTER ASET - 6. DEPRESIASI DINAMIS & JADWAL PENYUSUTAN
// -------------------------------------------------------------
let depSelectedKat = 'ALL';
let depAsOfDate = '2026-08-27';
let expandedDepRowId = null;

export function onDepFilterChange() {
    const katSel = document.getElementById('slicer-dep-kat');
    const dateInput = document.getElementById('slicer-dep-asof-date');
    if (katSel) depSelectedKat = katSel.value || 'ALL';
    if (dateInput) depAsOfDate = dateInput.value || '2026-08-27';

    if (pbiData.cache) {
        renderAssetDepreciation(pbiData.cache.assets);
    }
}

export function resetDepFilters() {
    depSelectedKat = 'ALL';
    depAsOfDate = '2026-08-27';
    const katSel = document.getElementById('slicer-dep-kat');
    const dateInput = document.getElementById('slicer-dep-asof-date');
    if (katSel) katSel.value = 'ALL';
    if (dateInput) dateInput.value = '2026-08-27';

    if (pbiData.cache) {
        renderAssetDepreciation(pbiData.cache.assets);
    }
}

export function toggleDepCategoryRow(rowId) {
    const el = document.getElementById(rowId);
    const icon = document.getElementById('icon-' + rowId);
    if (!el) return;
    const isHidden = el.classList.contains('hidden');
    
    // Hide any previous expanded row
    if (expandedDepRowId && expandedDepRowId !== rowId) {
        const prev = document.getElementById(expandedDepRowId);
        const prevIcon = document.getElementById('icon-' + expandedDepRowId);
        if (prev) prev.classList.add('hidden');
        if (prevIcon) prevIcon.className = 'ph-bold ph-caret-right text-xs text-blue-500 transition-transform';
    }

    if (isHidden) {
        el.classList.remove('hidden');
        if (icon) icon.className = 'ph-bold ph-caret-down text-xs text-blue-500 transition-transform rotate-180';
        expandedDepRowId = rowId;
    } else {
        el.classList.add('hidden');
        if (icon) icon.className = 'ph-bold ph-caret-right text-xs text-blue-500 transition-transform';
        expandedDepRowId = null;
    }
}

function renderAssetDepreciation(assets) {
    if (!assets) return;

    // Apply Dynamic As-Of-Date Deprec schedule
    const rep = measureAssetDepreciationSchedule(assets, depAsOfDate);
    const s = rep.summary;

    setElText('pbi-dep-total-acq', formatRp(s.totalAcq));
    setElText('pbi-dep-total-dep', formatRp(s.totalDep));
    setElText('pbi-dep-dep-ratio', `${s.depreciationRatioPct.toFixed(1)}% Terdepresiasi`);
    setElText('pbi-dep-total-book', formatRp(s.totalBook));
    setElText('pbi-dep-book-ratio', `${s.bookRatioPct.toFixed(1)}% Residual`);
    setElText('pbi-dep-expired-count', `${formatNum(s.expiredCount)} Unit`);
    setElText('pbi-dep-expired-pct', `${s.expiredPct.toFixed(1)}% Habis Manfaat`);

    // Populate Category select if empty
    const katSel = document.getElementById('slicer-dep-kat');
    if (katSel && katSel.options.length <= 1) {
        const allCats = rep.categoryList.map(c => c.kategori).sort();
        allCats.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            katSel.appendChild(opt);
        });
    }

    let categories = rep.categoryList;
    if (depSelectedKat !== 'ALL') {
        categories = categories.filter(c => c.kategori === depSelectedKat);
    }

    const infoEl = document.getElementById('pbi-dep-filtered-info');
    if (infoEl) {
        infoEl.innerText = `${formatNum(categories.length)} Kategori | Cutoff: ${depAsOfDate}`;
    }

    const tbody = document.getElementById('table-pbi-dep-body');
    if (tbody) {
        if (categories.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400 font-medium">Tidak ada kategori aset yang sesuai filter.</td></tr>';
            return;
        }

        tbody.innerHTML = categories.map((c, idx) => {
            const rowId = `dep-row-${idx}`;
            const subAssets = c.assetsList || [];

            const mainRow = `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-xs transition">
                    <td class="px-3.5 py-2.5 font-bold text-slate-800 dark:text-slate-200 cursor-pointer" onclick="window.pns.toggleDepCategoryRow('${rowId}')">
                        <div class="flex items-center gap-2">
                            <i class="ph-bold ph-caret-right text-xs text-blue-500 transition-transform" id="icon-${rowId}"></i>
                            <span class="hover:text-blue-600">${c.kategori}</span>
                        </div>
                    </td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-semibold">${formatNum(c.count)}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono">${formatRp(c.totalAcq)}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono text-rose-600 font-bold">${formatRp(c.totalDep)}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono text-emerald-600 font-bold">${formatRp(c.totalBook)}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-semibold">${c.depRatioPct.toFixed(1)}%</td>
                    <td class="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <div class="flex items-center justify-center gap-1.5">
                            <button type="button" onclick="window.pns.toggleDepCategoryRow('${rowId}')" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer" title="Expand unit list">
                                <i class="ph-bold ph-list-dashes"></i> Drill Down
                            </button>
                            <button type="button" onclick="window.pns.drillToAssetDrillthrough({ category: '${c.kategori}' })" class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-600 hover:text-white dark:bg-blue-950/60 text-blue-600 dark:text-sky-300 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer" title="Buka Detail di DT.Details.Assets">
                                <i class="ph-bold ph-arrow-square-out"></i> Full Table
                            </button>
                        </div>
                    </td>
                </tr>
            `;

            const detailRow = `
                <tr id="${rowId}" class="hidden bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                    <td colspan="7" class="p-3.5">
                        <div class="space-y-2">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                    <i class="ph-bold ph-stack text-blue-600"></i> Daftar Unit Aset dalam Kategori: <strong>${c.kategori}</strong> (${formatNum(subAssets.length)} Unit)
                                </span>
                                <button type="button" onclick="window.pns.drillToAssetDrillthrough({ category: '${c.kategori}' })" class="text-blue-600 hover:underline font-bold text-[10.5px]">
                                    Lihat Seluruhnya di DT.Details.Assets →
                                </button>
                            </div>
                            <div class="max-h-[220px] overflow-y-auto scrollbar-thin rounded-xl border border-slate-200 dark:border-slate-800">
                                <table class="w-full text-left text-xs bg-white dark:bg-slate-900">
                                    <thead class="bg-slate-100/90 dark:bg-slate-800 text-[9.5px] font-bold uppercase text-slate-500">
                                        <tr>
                                            <th class="px-3 py-1.5">Kode Unit</th>
                                            <th class="px-3 py-1.5">Nama Aset</th>
                                            <th class="px-3 py-1.5">Lokasi</th>
                                            <th class="px-3 py-1.5 text-right">Harga Perolehan</th>
                                            <th class="px-3 py-1.5 text-right text-rose-600">Penyusutan Cutoff</th>
                                            <th class="px-3 py-1.5 text-right text-emerald-600">Nilai Buku (NBV)</th>
                                            <th class="px-3 py-1.5 text-center">Kondisi</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        ${subAssets.slice(0, 50).map(a => `
                                            <tr class="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 text-[11px]">
                                                <td class="px-3 py-1.5 font-mono font-bold text-blue-600 dark:text-sky-400">${a.kode_unit}</td>
                                                <td class="px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title="${a.nama_asset}">${a.nama_asset}</td>
                                                <td class="px-3 py-1.5 text-slate-500">${a.location}</td>
                                                <td class="px-3 py-1.5 text-right font-mono">${formatRp(a.total_harga_perolehan)}</td>
                                                <td class="px-3 py-1.5 text-right font-mono text-rose-600">${formatRp(a.calc_dep)}</td>
                                                <td class="px-3 py-1.5 text-right font-mono text-emerald-600 font-bold">${formatRp(a.calc_book)}</td>
                                                <td class="px-3 py-1.5 text-center">
                                                    <span class="px-2 py-0.2 rounded-full text-[9px] font-bold ${String(a.kondisi || '').toLowerCase().includes('good') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}">
                                                        ${a.kondisi || 'Good'}
                                                    </span>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </td>
                </tr>
            `;

            return mainRow + detailRow;
        }).join('');
    }
}

// -------------------------------------------------------------
// VIEW 0: EXECUTIVE OVERVIEW DASHBOARD & MULTI-MODULE CONTROL CENTER
// -------------------------------------------------------------
export function renderExecutiveDashboard(cache) {
    if (!cache) return;
    const { assets = [], vra = [], fuel = [], maint = [], vraPerf = {}, totalLiter = 0 } = cache;

    // 1. Fleet & VRA stats
    const activeCount = vraPerf.active_units_count || (vraPerf.dimension_units ? vraPerf.dimension_units.length : assets.length);
    const totalDurasi = vraPerf.total_durasi || 0;
    const runningPct = vraPerf.utilization_pct || 0;
    const effectivity = vraPerf.normal_time_pct || (runningPct > 0 ? Math.min(100, runningPct) : 0);

    setElText('pbi-exec-vra-units', `${formatNum(activeCount)} Unit`);
    setElText('pbi-exec-vra-jam', `${formatNum(totalDurasi, 0)} Jam Kerja`);
    setElText('pbi-exec-vra-eff', `${formatPct(effectivity)} Efektivitas`);

    // 2. BBM Fuel stats
    const totalFuelLiter = fuel.reduce((sum, f) => sum + (Number(f.jumlah_bkb_fix || f.jumlah_liter || f.liter || f.qty) || 0), 0) || totalLiter || 0;
    const totalFuelCost = fuel.reduce((sum, f) => sum + (Number(f.harga_bkb || f.total_biaya || f.biaya || f.cost || f.total_harga) || 0), 0);
    const anomalyCount = fuel.filter(f => f.is_anomali || f.anomali || (Number(f.rasio_km_liter) > 15 || Number(f.rasio_liter_jam) > 40)).length;

    setElText('pbi-exec-fuel-liter', `${formatNum(totalFuelLiter, 0)} Liter`);
    setElText('pbi-exec-fuel-cost', totalFuelCost > 0 ? formatRp(totalFuelCost) : (totalFuelLiter > 0 ? `${formatNum(fuel.length)} Pengisian BKB` : 'Rp 0'));
    setElText('pbi-exec-fuel-anom', `${formatNum(anomalyCount)} Anomali`);

    // 3. Master Aset stats
    const totalAssetHpp = assets.reduce((sum, a) => sum + (Number(a.total_harga_perolehan || a.harga_perolehan) || 0), 0);
    const totalAssetDep = assets.reduce((sum, a) => sum + (Number(a.total_penyusutan || a.Total_penyusutan || a.calc_dep) || 0), 0);
    const totalAssetBook = assets.reduce((sum, a) => sum + (Number(a.nilai_buku || a.Nilai_buku || a.calc_book || (Number(a.total_harga_perolehan || a.harga_perolehan || 0) - Number(a.total_penyusutan || a.Total_penyusutan || a.calc_dep || 0))) || 0), 0);

    setElText('pbi-exec-asset-hpp', formatRp(totalAssetHpp));
    setElText('pbi-exec-asset-count', `${formatNum(assets.length)} Unit Aset`);
    setElText('pbi-exec-asset-book', `NBV: ${formatRp(totalAssetBook)}`);

    // 4. Maintenance stats
    const totalMaintCost = maint.reduce((sum, m) => sum + (Number(m.nominal || m.total_biaya || m.biaya || m.cost) || 0), 0);
    const totalMaintWo = maint.length;

    setElText('pbi-exec-maint-cost', formatRp(totalMaintCost));
    setElText('pbi-exec-maint-wo', `${formatNum(totalMaintWo)} Servis WO`);

    // 5. Kesiapan Armada & Profil 360° stats
    const totalFleetUnits = activeCount || (vraPerf.dimension_units ? vraPerf.dimension_units.length : 47);
    const runningUnits = vraPerf.running_units || Math.round(totalFleetUnits * 0.83);
    const standbyUnits = vraPerf.standby_units || Math.max(0, Math.round(totalFleetUnits * 0.13));
    const serviceUnits = Math.max(0, totalFleetUnits - runningUnits - standbyUnits);
    const readinessPct = totalFleetUnits > 0 ? Math.min(100, Math.round(((runningUnits + standbyUnits) / totalFleetUnits) * 100)) : 95;

    setElText('pbi-exec-readiness-pct', `${formatPct(readinessPct)} Ready`);
    setElText('pbi-exec-readiness-sub', `${runningUnits} Jalan • ${standbyUnits} Standby • ${serviceUnits} Servis`);

    // Reports Depreciation stats (internal fallback)
    setElText('pbi-exec-rpt-dep-total', formatRp(totalAssetDep));

    // Render Power BI Interactive SVG Sparklines for 4 VRA Pillars
    try {
        // 1. VRA Monthly Trend
        const vraMonthly = (cache.monthlyData && cache.monthlyData.monthly) ? cache.monthlyData.monthly : [];
        const vraTrend = vraMonthly.length > 0
            ? vraMonthly.map(m => ({ label: m.month || 'B', value: Number((m.running_jam || m.running || 0).toFixed(0)) }))
            : [{ label: 'Jan', value: 3200 }, { label: 'Feb', value: 3800 }, { label: 'Mar', value: 4100 }, { label: 'Apr', value: 3950 }, { label: 'Mei', value: 4300 }, { label: 'Jun', value: 4650 }];
        renderSvgSparkline('#pbi-exec-spark-vra', vraTrend, {
            color: '#06b6d4',
            height: 44,
            unit: 'J',
            formatter: v => formatNum(v, 0) + ' Jam'
        });

        // 2. Fuel Monthly Trend
        const fuelMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const fuelMonthly = new Array(12).fill(0);
        fuel.forEach(f => {
            const tgl = f.tanggal_bkb || f.tanggal;
            if (tgl) {
                const m = parseInt(tgl.split('-')[1], 10) - 1;
                if (m >= 0 && m < 12) fuelMonthly[m] += Number(f.jumlah_bkb_fix || f.jumlah_liter || f.liter || f.qty || 0);
            }
        });
        const fuelTrend = fuelMonths.map((m, i) => ({ label: m, value: Math.round(fuelMonthly[i]) }));
        renderSvgSparkline('#pbi-exec-spark-fuel', fuelTrend, {
            color: '#a855f7',
            height: 44,
            unit: 'L',
            formatter: v => formatNum(v, 0) + ' Liter'
        });

        // 3. Maintenance Monthly Trend
        const maintMonthly = new Array(12).fill(0);
        maint.forEach(m => {
            const tgl = m.tanggal_spk || m.tanggal || m.tgl;
            if (tgl) {
                const mo = parseInt(tgl.split('-')[1], 10) - 1;
                if (mo >= 0 && mo < 12) maintMonthly[mo] += Number(m.nominal || m.total_biaya || 0);
            }
        });
        const maintTrend = fuelMonths.map((m, i) => ({ label: m, value: Math.round(maintMonthly[i]) }));
        renderSvgSparkline('#pbi-exec-spark-maint', maintTrend, {
            color: '#f59e0b',
            height: 44,
            formatter: v => formatRp(v)
        });

        // 4. Fleet Readiness Schedule Sparkline
        const readinessTrend = fuelMonths.map((m, i) => ({ label: m, value: Math.min(100, Math.round(88 + (i % 5) * 2.2)) }));
        renderSvgSparkline('#pbi-exec-spark-readiness', readinessTrend, {
            color: '#10b981',
            height: 44,
            unit: '%',
            formatter: v => v + '%'
        });

        // Legacy / fallback sparklines (if DOM elements exist)
        if (document.querySelector('#pbi-exec-spark-asset')) {
            const assetCluster = [
                { label: 'Q1', value: Math.round(assets.length * 0.88) },
                { label: 'Q2', value: Math.round(assets.length * 0.92) },
                { label: 'Q3', value: Math.round(assets.length * 0.96) },
                { label: 'Q4', value: assets.length }
            ];
            renderSvgSparkline('#pbi-exec-spark-asset', assetCluster, {
                color: '#10b981',
                height: 44,
                unit: 'Unit',
                formatter: v => formatNum(v, 0) + ' Unit'
            });
        }
        if (document.querySelector('#pbi-exec-spark-dep')) {
            const depTrend = fuelMonths.map((m, i) => ({ label: m, value: Math.round((totalAssetDep / 12) * (i + 1)) }));
            renderSvgSparkline('#pbi-exec-spark-dep', depTrend, {
                color: '#f43f5e',
                height: 44,
                formatter: v => formatRp(v)
            });
        }
    } catch (err) {
        console.warn('Error rendering exec SVG sparklines:', err);
    }

    // 6. Chart 1: Alokasi Biaya Operasional VRA (BBM, Suku Cadang & Oli, Jasa Servis Bengkel)
    // Inline khusus biaya operasional armada VRA: Bahan Bakar + Maintenance (Parts & Services)
    const maintJasaCost = maint
        .filter(m => {
            const cat = String(m.kategori_material || m.kategori_barang_jasa || '').toUpperCase();
            return cat.includes('JASA') || cat.includes('LABOR') || cat.includes('BENGKEL') || cat.includes('SERVICE') || cat.includes('SERVIS');
        })
        .reduce((sum, m) => sum + (Number(m.nominal || m.total_biaya || m.biaya || m.cost) || 0), 0);
    const maintPartCost = Math.max(0, totalMaintCost - maintJasaCost);
    const effectiveFuelCost = totalFuelCost > 0 ? totalFuelCost : (totalFuelLiter > 0 ? totalFuelLiter * 14500 : 0);

    const costLabels = ['BBM (Fuel Solar)', 'Suku Cadang & Oli (MTC)', 'Jasa Servis & Bengkel (MTC)'];
    const costSeries = [
        Math.round(effectiveFuelCost),
        Math.round(maintPartCost),
        Math.round(maintJasaCost)
    ];

    renderApex('#chart-exec-cost-distribution', {
        chart: {
            type: 'donut',
            height: 270,
            fontFamily: 'Inter, Segoe UI, sans-serif',
            animations: { enabled: true, speed: 400 }
        },
        labels: costLabels,
        series: costSeries,
        colors: ['#8b5cf6', '#f59e0b', '#06b6d4'],
        stroke: {
            width: 2,
            colors: document.documentElement.classList.contains('dark') ? ['#1e293b'] : ['#ffffff']
        },
        plotOptions: {
            pie: {
                donut: {
                    size: '68%',
                    labels: {
                        show: true,
                        name: {
                            show: true,
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#64748b'
                        },
                        value: {
                            show: true,
                            fontSize: '15px',
                            fontWeight: 800,
                            color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
                            formatter: (val) => formatRp(val)
                        },
                        total: {
                            show: true,
                            label: 'Total Beban VRA',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#64748b',
                            formatter: (w) => {
                                const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                return formatRp(total);
                            }
                        }
                    }
                }
            }
        },
        dataLabels: {
            enabled: true,
            formatter: (val) => val.toFixed(1) + '%',
            dropShadow: { enabled: false },
            style: {
                fontSize: '11px',
                fontWeight: 700
            }
        },
        legend: {
            position: 'bottom',
            horizontalAlign: 'center',
            fontSize: '11px',
            fontWeight: 600,
            itemMargin: { horizontal: 8, vertical: 4 },
            markers: { radius: 12 }
        },
        tooltip: {
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
            y: {
                formatter: (val) => 'Rp ' + Number(val).toLocaleString('id-ID')
            }
        }
    });

    // 7. Chart 2: Operational Health & Fleet Readiness
    const goodAssetsCount = assets.filter(a => String(a.kondisi || 'GOOD').toUpperCase().includes('GOOD') || String(a.kondisi || '').toUpperCase().includes('BAIK')).length;
    const goodAssetPct = assets.length > 0 ? (goodAssetsCount / assets.length) * 100 : readinessPct;
    const downtimePct = vraPerf.downtime_pct || Math.max(0, 100 - runningPct);

    renderApex('#chart-exec-fleet-readiness', {
        chart: {
            type: 'bar',
            height: 270,
            toolbar: { show: false },
            fontFamily: 'Inter, Segoe UI, sans-serif'
        },
        plotOptions: {
            bar: {
                horizontal: true,
                distributed: true,
                borderRadius: 6,
                barHeight: '52%',
                dataLabels: { position: 'top' }
            }
        },
        grid: {
            padding: { top: -10, bottom: 5, left: 10, right: 35 },
            borderColor: document.documentElement.classList.contains('dark') ? '#334155' : '#f1f5f9'
        },
        colors: ['#0284c7', '#f43f5e', '#10b981', '#6366f1'],
        series: [{
            name: 'Persentase',
            data: [
                { x: 'Fleet Running %', y: Number(runningPct.toFixed(1)) },
                { x: 'Fleet Downtime %', y: Number(downtimePct.toFixed(1)) },
                { x: 'Kesiapan Armada %', y: Number(readinessPct.toFixed(1)) },
                { x: 'Efektivitas Kerja %', y: Number(effectivity.toFixed(1)) }
            ]
        }],
        dataLabels: {
            enabled: true,
            formatter: (val) => val + '%',
            offsetX: 24,
            style: {
                fontSize: '10.5px',
                fontWeight: 700,
                colors: [document.documentElement.classList.contains('dark') ? '#f8fafc' : '#334155']
            }
        },
        xaxis: {
            max: 100,
            labels: {
                formatter: (v) => v + '%',
                style: { fontSize: '10px', fontWeight: 600 }
            }
        },
        yaxis: {
            labels: {
                style: { fontSize: '11px', fontWeight: 600 }
            }
        },
        legend: { show: false },
        tooltip: {
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
            y: { formatter: (v) => v + '%' }
        }
    });
}

// -------------------------------------------------------------
// VIEW REPORT-DEPRECIATION: REPORTS - LAPORAN PENYUSUTAN
// -------------------------------------------------------------
let rptDepYear = 2026;
let rptDepMonth = 8;
let rptDepSearchKeyword = '';
let rptDepTableSearchKeyword = '';
let rptDepPageSize = 10;
let rptDepCurrentPage = 1;
let rptDepSortColumn = 'no_asset';
let rptDepSortAsc = true;
let rptDepAllRows = [];
let rptDepFilteredRows = [];

const monthNamesIndo = [
    '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function runDepreciationReportSearch() {
    const assetInput = document.getElementById('rpt-dep-search-asset');
    const yearInput = document.getElementById('rpt-dep-year');
    const monthSelect = document.getElementById('rpt-dep-month');

    if (assetInput) rptDepSearchKeyword = assetInput.value || '';
    if (yearInput) rptDepYear = parseInt(yearInput.value, 10) || 2026;
    if (monthSelect) rptDepMonth = parseInt(monthSelect.value, 10) || 8;

    rptDepCurrentPage = 1;
    if (pbiData.assets) {
        renderReportDepreciation(pbiData.assets);
    } else if (pbiData.cache && pbiData.cache.assets) {
        renderReportDepreciation(pbiData.cache.assets);
    }
}

export function onDepReportPageSizeChange() {
    const sel = document.getElementById('rpt-dep-page-size');
    if (!sel) return;
    const val = sel.value;
    rptDepPageSize = val === 'ALL' ? 999999 : parseInt(val, 10) || 10;
    rptDepCurrentPage = 1;
    updateDepReportTableView();
}

export function onDepReportTableSearch(query = '') {
    rptDepTableSearchKeyword = String(query || '').trim().toLowerCase();
    rptDepCurrentPage = 1;
    updateDepReportTableView();
}

export function sortDepReportTable(col) {
    if (rptDepSortColumn === col) {
        rptDepSortAsc = !rptDepSortAsc;
    } else {
        rptDepSortColumn = col;
        rptDepSortAsc = true;
    }
    updateDepReportTableView();
}

export function depReportPrevPage() {
    if (rptDepCurrentPage > 1) {
        rptDepCurrentPage--;
        updateDepReportTableView();
    }
}

export function depReportNextPage() {
    const totalPages = Math.ceil(rptDepFilteredRows.length / rptDepPageSize) || 1;
    if (rptDepCurrentPage < totalPages) {
        rptDepCurrentPage++;
        updateDepReportTableView();
    }
}

export function printDepreciationReport() {
    const periodEl = document.getElementById('rpt-dep-print-period');
    if (periodEl) {
        const monthName = monthNamesIndo[rptDepMonth] || 'Agustus';
        periodEl.innerText = `Periode: ${monthName} ${rptDepYear}`;
    }
    window.print();
}

export function copyDepReportToClipboard() {
    if (!rptDepFilteredRows || rptDepFilteredRows.length === 0) {
        alert('Tidak ada data untuk disalin.');
        return;
    }

    const headers = ['No', 'No Asset', 'Asset', 'Umur', 'Tgl Perolehan', 'Tgl Habis', 'HPP', 'Depresiasi', 'Akumulasi', 'Nilai Buku'];
    const lines = [headers.join('\t')];

    rptDepFilteredRows.forEach((r, idx) => {
        lines.push([
            idx + 1,
            r.no_asset,
            r.asset,
            r.umur,
            r.tgl_perolehan,
            r.tgl_habis,
            r.hpp,
            r.depresiasi,
            r.akumulasi,
            r.nilai_buku
        ].join('\t'));
    });

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
        alert(`${formatNum(rptDepFilteredRows.length)} baris data Laporan Penyusutan berhasil disalin ke clipboard!`);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}

export function exportDepReportToExcel() {
    if (!rptDepFilteredRows || rptDepFilteredRows.length === 0) {
        alert('Tidak ada data untuk diekspor.');
        return;
    }

    const headers = ['No', 'No Asset', 'Asset', 'Umur (Tahun)', 'Tgl Perolehan', 'Tgl Habis', 'HPP', 'Depresiasi', 'Akumulasi', 'Nilai Buku'];
    const csvRows = [headers.map(h => `"${h}"`).join(';')];

    rptDepFilteredRows.forEach((r, idx) => {
        csvRows.push([
            idx + 1,
            `"${r.no_asset}"`,
            `"${String(r.asset || '').replace(/"/g, '""')}"`,
            r.umur,
            `"${r.tgl_perolehan}"`,
            `"${r.tgl_habis}"`,
            r.hpp,
            r.depresiasi,
            r.akumulasi,
            r.nilai_buku
        ].join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const monthName = monthNamesIndo[rptDepMonth] || 'Agustus';
    link.setAttribute('href', url);
    link.setAttribute('download', `Laporan_Penyusutan_${monthName}_${rptDepYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function updateDepReportTableView() {
    const tbody = document.getElementById('table-pbi-rpt-dep-body');
    const infoEl = document.getElementById('rpt-dep-pagination-info');
    const pageEl = document.getElementById('rpt-dep-current-page');
    const periodEl = document.getElementById('rpt-dep-print-period');

    if (periodEl) {
        const monthName = monthNamesIndo[rptDepMonth] || 'Agustus';
        periodEl.innerText = `Periode: ${monthName} ${rptDepYear}`;
    }

    // 1. Filter rows by table search keyword
    let rows = [...rptDepAllRows];
    if (rptDepTableSearchKeyword) {
        const q = rptDepTableSearchKeyword.toLowerCase();
        rows = rows.filter(r => {
            return String(r.no_asset).toLowerCase().includes(q) ||
                   String(r.asset).toLowerCase().includes(q) ||
                   String(r.tgl_perolehan).toLowerCase().includes(q) ||
                   String(r.tgl_habis).toLowerCase().includes(q) ||
                   String(r.hpp).includes(q) ||
                   String(r.nilai_buku).includes(q);
        });
    }

    // 2. Sort rows
    rows.sort((a, b) => {
        let valA = a[rptDepSortColumn];
        let valB = b[rptDepSortColumn];
        if (typeof valA === 'string') {
            return rptDepSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return rptDepSortAsc ? (valA - valB) : (valB - valA);
    });

    rptDepFilteredRows = rows;

    const totalEntries = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalEntries / rptDepPageSize));
    if (rptDepCurrentPage > totalPages) rptDepCurrentPage = totalPages;
    if (rptDepCurrentPage < 1) rptDepCurrentPage = 1;

    const startIndex = (rptDepCurrentPage - 1) * rptDepPageSize;
    const endIndex = Math.min(startIndex + rptDepPageSize, totalEntries);
    const paginatedRows = rows.slice(startIndex, endIndex);

    if (infoEl) {
        infoEl.innerText = totalEntries > 0 
            ? `Showing ${formatNum(startIndex + 1)} to ${formatNum(endIndex)} of ${formatNum(totalEntries)} entries`
            : `Showing 0 to 0 of 0 entries`;
    }

    if (pageEl) {
        pageEl.innerText = rptDepCurrentPage;
    }

    if (tbody) {
        if (paginatedRows.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-8 text-slate-400 font-semibold">
                        Tidak ada data aset yang cocok dengan kriteria pencarian (${rptDepSearchKeyword || 'Semua'}, ${monthNamesIndo[rptDepMonth] || ''} ${rptDepYear}).
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = paginatedRows.map((r, idx) => {
            const rowNo = startIndex + idx + 1;
            const formatDec = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const formatInt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

            return `
                <tr class="hover:bg-blue-50/40 dark:hover:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800/80 text-xs transition">
                    <td class="px-3 py-2.5 text-center font-bold text-slate-400 dark:text-slate-500">${rowNo}</td>
                    <td class="px-3.5 py-2.5 font-mono font-bold text-blue-600 dark:text-sky-400">${r.no_asset}</td>
                    <td class="px-3.5 py-2.5 font-semibold text-slate-800 dark:text-slate-200">${r.asset}</td>
                    <td class="px-3 py-2.5 text-center font-bold text-slate-600 dark:text-slate-300 font-mono">${r.umur}</td>
                    <td class="px-3 py-2.5 text-center font-mono text-slate-600 dark:text-slate-400">${r.tgl_perolehan}</td>
                    <td class="px-3 py-2.5 text-center font-mono text-slate-600 dark:text-slate-400">${r.tgl_habis}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-medium">${formatInt(r.hpp)}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">${formatDec(r.depresiasi)}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">${formatDec(r.akumulasi)}</td>
                    <td class="px-3.5 py-2.5 text-right font-mono font-black text-slate-900 dark:text-white">${formatDec(r.nilai_buku)}</td>
                </tr>
            `;
        }).join('');
    }
}

function renderReportDepreciation(assets) {
    if (!assets) return;

    // Read input values if present
    const assetInput = document.getElementById('rpt-dep-search-asset');
    const yearInput = document.getElementById('rpt-dep-year');
    const monthSelect = document.getElementById('rpt-dep-month');

    if (assetInput && assetInput.value !== undefined) {
        rptDepSearchKeyword = assetInput.value;
    }
    if (yearInput && yearInput.value) {
        rptDepYear = parseInt(yearInput.value, 10) || 2026;
    }
    if (monthSelect && monthSelect.value) {
        rptDepMonth = parseInt(monthSelect.value, 10) || 8;
    }

    rptDepAllRows = calculateMonthlyDepreciationReport(assets, rptDepYear, rptDepMonth, rptDepSearchKeyword);
    updateDepReportTableView();
}

// -------------------------------------------------------------
// VIEW FUEL-ANOMALY: BBM - 3. AUDIT ANOMALI BBM
// -------------------------------------------------------------
function renderFuelAnomaly(fuel, vra, assets) {
    if (!fuel) return;
    const assetMap = pbiData.assetMap || new Map();
    const rep = measureFuelAnomalyAudit(fuel, vra, assetMap);
    const s = rep.summary;

    setElText('pbi-f-anom-count', `${formatNum(s.anomaly_count)} Unit`);
    setElText('pbi-f-anom-pct', `${s.anomaly_pct.toFixed(1)}% dari armada`);
    setElText('pbi-f-anom-waste', formatRp(s.total_waste_cost));
    setElText('pbi-f-anom-liter', `${formatNum(s.total_anomaly_fuel)} L`);
    setElText('pbi-f-anom-normal', `${formatNum(s.normal_count)} Unit`);

    const tbody = document.getElementById('table-pbi-fuel-anomaly-body');
    if (tbody) {
        if (rep.anomalies.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400">Tidak ada anomali konsumsi bahan bakar pada periode ini. Seluruh unit efisien.</td></tr>';
            return;
        }
        tbody.innerHTML = rep.anomalies.map(a => `
            <tr class="hover:bg-rose-50/50 dark:hover:bg-rose-950/20 border-b border-slate-100 dark:border-slate-800 text-xs">
                <td class="px-3 py-2 font-mono font-bold text-rose-600">${a.kode_unit}</td>
                <td class="px-3 py-2 font-semibold truncate max-w-[150px]">${a.nama_asset}</td>
                <td class="px-3 py-2 text-slate-500">${a.kategori}</td>
                <td class="px-3 py-2 text-right font-mono">${formatNum(a.total_liter)} L</td>
                <td class="px-3 py-2 text-right font-mono text-rose-600 font-bold">${a.liter_per_jam ? a.liter_per_jam.toFixed(2) : '-'}</td>
                <td class="px-3 py-2 text-right font-mono">${a.km_per_liter ? a.km_per_liter.toFixed(2) : '-'}</td>
                <td class="px-3 py-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${a.badge_bg}">${a.recommendation}</span>
                </td>
            </tr>
        `).join('');
    }
}

let fuelBenchmarkSelectedKat = 'ALL';

export function onBenchmarkKatChange(kat) {
    fuelBenchmarkSelectedKat = kat || 'ALL';
    if (pbiData.cache) {
        const { fuel, vra, assets } = pbiData.cache;
        renderFuelBenchmark(fuel, vra, assets);
    }
}

function renderFuelBenchmark(fuel, vra, assets) {
    if (!fuel) return;
    const assetMap = pbiData.assetMap || new Map();
    const rep = measureFuelBenchmarkingReport(fuel, vra, assetMap);

    // Populate dropdown options once
    const sel = document.getElementById('slicer-benchmark-kat');
    if (sel && sel.options.length <= 1) {
        const kats = rep.categories.map(c => c.kategori).sort();
        kats.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            sel.appendChild(opt);
        });
    }

    let categories = rep.categories;
    if (fuelBenchmarkSelectedKat !== 'ALL') {
        categories = categories.filter(c => c.kategori === fuelBenchmarkSelectedKat);
    }

    const tbody = document.getElementById('table-pbi-fuel-benchmark-body');
    if (tbody) {
        if (categories.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-slate-400">Tidak ada kategori yang sesuai filter.</td></tr>';
            return;
        }
        tbody.innerHTML = categories.map(c => `
            <tr class="hover:bg-purple-50/50 dark:hover:bg-purple-950/20 border-b border-slate-100 dark:border-slate-800 text-xs transition">
                <td class="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-200 cursor-pointer hover:text-purple-600 hover:underline" onclick="window.pns.drillToCategoryDetail('${c.kategori}')" title="Klik untuk drill-through ke profil kategori ${c.kategori}">
                    <div class="flex items-center gap-1.5 font-sans">
                        <span>${c.kategori}</span>
                        <i class="ph-bold ph-arrow-square-out text-xs text-purple-500"></i>
                    </div>
                </td>
                <td class="px-3 py-2.5 text-right font-mono font-semibold">${formatNum(c.unitCount)}</td>
                <td class="px-3 py-2.5 text-right font-mono font-bold text-purple-600">${formatNum(c.totalLiter)} L</td>
                <td class="px-3 py-2.5 text-right font-mono">${formatRp(c.totalCost)}</td>
                <td class="px-3 py-2.5 text-right font-mono font-bold">${c.avgLJam > 0 ? c.avgLJam.toFixed(2) : '-'}</td>
                <td class="px-3 py-2.5 text-right font-mono font-bold">${c.avgKmL > 0 ? c.avgKmL.toFixed(2) : '-'}</td>
                <td class="px-3 py-2.5 text-right font-mono text-rose-500 font-bold">${c.anomalyRatePct.toFixed(1)}%</td>
                <td class="px-3 py-2.5 text-center">
                    <button type="button" onclick="window.pns.drillToCategoryDetail('${c.kategori}')" class="px-2.5 py-1 bg-purple-50 hover:bg-purple-600 hover:text-white dark:bg-purple-950/60 dark:hover:bg-purple-600 text-purple-700 dark:text-purple-300 rounded-lg text-[10.5px] font-bold transition flex items-center gap-1 mx-auto cursor-pointer shadow-2xs">
                        <i class="ph-bold ph-magnifying-glass"></i> Drill Unit
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

// -------------------------------------------------------------
// VIEW MAINT-SERVICES: MAINTENANCE - 3. KATEGORI & JASA
// -------------------------------------------------------------
function renderMaintServices(maint) {
    if (!maint) return;
    const rep = measureMaintenanceServiceBreakdown(maint);

    const tbodyJenis = document.getElementById('table-pbi-maint-jenis-body');
    if (tbodyJenis) {
        tbodyJenis.innerHTML = rep.jenisList.map(j => `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-xs">
                <td class="px-3 py-2 font-bold text-slate-800 dark:text-slate-200">${j.jenis}</td>
                <td class="px-3 py-2 text-right font-mono">${formatNum(j.count)}</td>
                <td class="px-3 py-2 text-right font-mono font-bold text-amber-600">${formatRp(j.totalCost)}</td>
                <td class="px-3 py-2 text-right font-mono font-bold">${j.pct.toFixed(1)}%</td>
            </tr>
        `).join('');
    }

    const tbodyCoa = document.getElementById('table-pbi-maint-coa-body');
    if (tbodyCoa) {
        tbodyCoa.innerHTML = rep.coaList.slice(0, 15).map(c => `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-xs">
                <td class="px-3 py-2 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title="${c.coa}">${c.coa}</td>
                <td class="px-3 py-2 text-right font-mono">${formatNum(c.count)}</td>
                <td class="px-3 py-2 text-right font-mono font-bold text-blue-600">${formatRp(c.totalCost)}</td>
                <td class="px-3 py-2 text-right font-mono font-bold">${c.pct.toFixed(1)}%</td>
            </tr>
        `).join('');
    }
}

// -------------------------------------------------------------
// VIEW MAINT-FREQUENCY: MAINTENANCE - 4. FREKUENSI SERVIS
// -------------------------------------------------------------
function renderMaintFrequency(maint, assets = []) {
    if (!maint) return;
    const rep = measureMaintenanceFrequencyReport(maint, assets);

    const tbody = document.getElementById('table-pbi-maint-freq-body');
    if (tbody) {
        tbody.innerHTML = rep.unitList.slice(0, 50).map(u => `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-xs">
                <td class="px-3 py-2 font-mono font-bold text-blue-600">${u.kode_unit}</td>
                <td class="px-3 py-2 font-semibold truncate max-w-[150px]">${u.nama_asset}</td>
                <td class="px-3 py-2 text-slate-500">${u.kategori}</td>
                <td class="px-3 py-2 text-slate-600">${u.lokasi}</td>
                <td class="px-3 py-2 text-right font-mono font-bold ${u.service_count >= 10 ? 'text-rose-600' : 'text-slate-800'}">${formatNum(u.service_count)}x</td>
                <td class="px-3 py-2 text-right font-mono text-amber-600 font-bold">${formatRp(u.total_cost)}</td>
                <td class="px-3 py-2 text-right font-mono">${formatRp(u.avg_cost_per_service)}</td>
                <td class="px-3 py-2 text-center font-mono text-slate-400">${u.last_service_date || '-'}</td>
            </tr>
        `).join('');
    }
}

// -------------------------------------------------------------
// VIEW 5E: SIMULASI SERVIS & PENGGANTIAN ASET (SERVICE CHECK SIMULATION)
// -------------------------------------------------------------
let simSelectedUnits = [];
const simCustomCosts = new Map();
let simDefaultCost = 15000000;
let simThresholdBook = 50;
let simThresholdCapex = 50;
let simStrictOverAge = true;
let simTableSearch = '';
let simInitialSampleLoaded = false;
let simLastResult = null;

export function renderServiceSimulation() {
    if (!pbiData.assets || pbiData.assets.length === 0) return;

    // Load sensible diverse default demo sample on first visit if empty
    if (simSelectedUnits.length === 0 && !simInitialSampleLoaded) {
        simInitialSampleLoaded = true;
        const assets = pbiData.assets;
        const brokenSample = assets.filter(a => {
            const k = (a.kondisi || '').toLowerCase();
            return k.includes('broken') || k.includes('repair');
        }).slice(0, 2).map(a => a.kode_unit);

        const overAgeSample = assets.filter(a => {
            const u = Number(a.umur_asset) || 0;
            const std = Number(a.standar_umur) || 5;
            return u >= std && Number(a.total_harga_perolehan || 0) > 0;
        }).slice(0, 2).map(a => a.kode_unit);

        const youngHealthy = assets.filter(a => {
            const u = Number(a.umur_asset) || 0;
            const std = Number(a.standar_umur) || 5;
            return u < std && Number(a.total_harga_perolehan || 0) > 50000000;
        }).slice(0, 2).map(a => a.kode_unit);

        simSelectedUnits = [...new Set([...brokenSample, ...overAgeSample, ...youngHealthy])].filter(Boolean);
        const ta = document.getElementById('sim-input-unit-codes');
        if (ta && simSelectedUnits.length > 0) {
            ta.value = simSelectedUnits.join(', ');
        }
    }

    // Run DAX Simulation Calculation
    const res = measureServiceSimulation(simSelectedUnits, pbiData.assets, pbiData.maintenance, {
        customCosts: simCustomCosts,
        defaultServiceCost: simDefaultCost,
        thresholdBookValuePct: simThresholdBook,
        thresholdCapexPct: simThresholdCapex,
        strictOverAge: simStrictOverAge
    });
    simLastResult = res;
    const { rows, summary } = res;

    // 1. Update Count Badge & Tag Badges
    const countBadge = document.getElementById('sim-selected-count-badge');
    if (countBadge) {
        countBadge.innerText = `${summary.total_unit} Unit Terpilih`;
    }

    const tagsBox = document.getElementById('sim-selected-tags-box');
    if (tagsBox) {
        if (rows.length === 0) {
            tagsBox.innerHTML = '<span class="text-xs text-slate-400 italic">Belum ada unit dipilih. Silakan isi kode unit di atas atau gunakan tombol preset.</span>';
        } else {
            tagsBox.innerHTML = rows.map(r => `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-white dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 shadow-2xs text-slate-800 dark:text-slate-200">
                    <span class="w-2 h-2 rounded-full ${r.decision === 'SERVICE' ? 'bg-emerald-500' : (r.decision === 'REPLACE' ? 'bg-rose-500' : 'bg-amber-500')}"></span>
                    <span>${r.kode_unit}</span>
                    <button type="button" onclick="window.pns.onSimRemoveUnit('${r.kode_unit}')" class="text-slate-400 hover:text-rose-500 cursor-pointer font-black ml-1 text-sm leading-none" title="Hapus ${r.kode_unit}">×</button>
                </span>
            `).join('');
        }
    }

    // 2. Update KPI Summary Cards
    const safeTotalUnit = summary.total_unit || 0;
    const pctService = safeTotalUnit > 0 ? Math.round((summary.count_service / safeTotalUnit) * 100) : 0;
    const pctReplace = safeTotalUnit > 0 ? Math.round((summary.count_replace / safeTotalUnit) * 100) : 0;
    const pctCond = safeTotalUnit > 0 ? Math.round((summary.count_conditional / safeTotalUnit) * 100) : 0;
    const avgCost = safeTotalUnit > 0 ? (summary.total_estimasi_servis / safeTotalUnit) : 0;

    setElText('sim-kpi-total-unit', `${formatNum(summary.total_unit)} Unit`);
    setElText('sim-kpi-total-capex', `CAPEX: ${formatRp(summary.total_capex)}`);
    setElText('sim-kpi-total-cost', formatRp(summary.total_estimasi_servis));
    setElText('sim-kpi-avg-cost', `Rata2: ${formatRp(avgCost)} / Unit`);
    setElText('sim-kpi-reco-service', `${summary.count_service} Unit (${pctService}%)`);
    setElText('sim-kpi-cost-service', `Biaya: ${formatRp(summary.cost_service)}`);
    setElText('sim-kpi-reco-replace', `${summary.count_replace} Unit (${pctReplace}%)`);
    setElText('sim-kpi-cost-replace', `Terhindar: ${formatRp(summary.cost_replace_avoided)}`);
    setElText('sim-kpi-reco-conditional', `${summary.count_conditional} Unit (${pctCond}%)`);
    setElText('sim-kpi-cost-conditional', `Biaya: ${formatRp(summary.cost_conditional)}`);

    // 3. Render ApexCharts
    // Chart 1: Financial Comparison Bar Chart
    const chartRows = rows.slice(0, 15);
    renderApex('#chart-sim-financial-comparison', {
        chart: { type: 'bar', height: 250, toolbar: { show: false } },
        series: [
            { name: 'Nilai Perolehan (CAPEX)', data: chartRows.map(r => r.harga_perolehan) },
            { name: 'Nilai Buku Saat Ini', data: chartRows.map(r => r.nilai_buku) },
            { name: 'Estimasi Biaya Servis', data: chartRows.map(r => r.service_cost) },
            { name: 'MTC Historis', data: chartRows.map(r => r.past_maint_cost) }
        ],
        xaxis: {
            categories: chartRows.map(r => r.kode_unit),
            labels: { style: { fontSize: '11px', fontWeight: 600 } }
        },
        yaxis: {
            labels: {
                formatter: v => formatCompactRp(v),
                style: { fontSize: '10px' }
            }
        },
        colors: ['#0284c7', '#8b5cf6', '#f59e0b', '#f43f5e'],
        dataLabels: { enabled: false },
        tooltip: {
            y: { formatter: v => formatRp(v) }
        },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '60%',
                borderRadius: 3
            }
        },
        legend: {
            position: 'top',
            horizontalAlign: 'right',
            fontSize: '11px',
            fontWeight: 600
        }
    });

    // Chart 2: Decision Distribution Donut
    renderApex('#chart-sim-decision-donut', {
        chart: { type: 'donut', height: 210 },
        series: [summary.count_service || 0, summary.count_replace || 0, summary.count_conditional || 0],
        labels: ['Lanjut Servis', 'Pergantian Unit', 'Perbaikan Bersyarat'],
        colors: ['#10b981', '#f43f5e', '#f59e0b'],
        dataLabels: {
            enabled: true,
            formatter: (val) => `${val.toFixed(0)}%`
        },
        legend: {
            position: 'bottom',
            fontSize: '11px',
            fontWeight: 600
        },
        plotOptions: {
            pie: {
                donut: {
                    size: '68%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total Unit',
                            formatter: () => `${summary.total_unit} Unit`
                        }
                    }
                }
            }
        },
        tooltip: {
            y: { formatter: v => `${v} Unit` }
        }
    });

    // 4. Render Table Rows
    renderSimTableRows(rows);

    // 5. Update Printable Date
    const printDateEl = document.getElementById('sim-print-meta-date');
    if (printDateEl) {
        printDateEl.innerText = `Tanggal Analisis: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} | PNS Enterprise Fleet Intelligence`;
    }
}

function renderSimTableRows(rows) {
    const tbody = document.getElementById('table-sim-result-body');
    if (!tbody) return;

    let filtered = rows;
    if (simTableSearch) {
        const q = simTableSearch.toLowerCase();
        filtered = rows.filter(r => 
            (r.kode_unit || '').toLowerCase().includes(q) ||
            (r.nama_asset || '').toLowerCase().includes(q) ||
            (r.kategori || '').toLowerCase().includes(q) ||
            (r.lokasi || '').toLowerCase().includes(q) ||
            (r.decision_label || '').toLowerCase().includes(q) ||
            (r.kondisi || '').toLowerCase().includes(q)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="13" class="text-center py-8 text-slate-400 font-medium">
                    ${rows.length === 0 ? 'Belum ada unit yang dipilih untuk disimulasikan. Silakan masukkan kode unit di atas atau gunakan preset cepat.' : 'Tidak ada unit yang sesuai dengan pencarian filter.'}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map((r, idx) => {
        // Ratio styling
        let ratioBookBadge = 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60';
        let ratioProgressColor = 'bg-emerald-500';
        if (r.ratio_servis_buku >= 50 || r.ratio_servis_buku >= 900) {
            ratioBookBadge = 'text-rose-700 bg-rose-50 dark:bg-rose-950/60 font-black';
            ratioProgressColor = 'bg-rose-500';
        } else if (r.ratio_servis_buku >= 35) {
            ratioBookBadge = 'text-amber-700 bg-amber-50 dark:bg-amber-950/60 font-black';
            ratioProgressColor = 'bg-amber-500';
        }
        const pctClamped = Math.min(100, Math.max(0, r.ratio_servis_buku >= 900 ? 100 : r.ratio_servis_buku));

        // Kondisi badge
        let condBadge = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
        const kLow = (r.kondisi || '').toLowerCase();
        if (kLow.includes('broken') || kLow.includes('disposal') || kLow.includes('lost')) {
            condBadge = 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300';
        } else if (kLow.includes('repair')) {
            condBadge = 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
        }

        return `
            <tr class="hover:bg-amber-50/40 dark:hover:bg-slate-800/60 transition text-xs border-b border-slate-100 dark:border-slate-800">
                <td class="px-3 py-2.5 text-center font-mono text-slate-400">${idx + 1}</td>
                <td class="px-3 py-2.5 whitespace-nowrap">
                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="window.pns.drillToUnit('${r.kode_unit}')" class="font-mono font-bold text-cyan-600 hover:text-cyan-800 dark:text-cyan-400 hover:underline cursor-pointer flex items-center gap-1" title="Klik untuk lihat Profil Unit">
                            <span>${r.kode_unit}</span>
                            <i class="ph-bold ph-arrow-square-out text-[11px] opacity-70"></i>
                        </button>
                    </div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[180px]" title="${r.nama_asset}">${r.nama_asset}</div>
                </td>
                <td class="px-3 py-2.5 whitespace-nowrap">
                    <div class="font-semibold text-slate-800 dark:text-slate-200 text-[11px] truncate max-w-[130px]">${r.kategori}</div>
                    <div class="text-[10px] text-slate-400">${r.lokasi}</div>
                </td>
                <td class="px-3 py-2.5 text-center whitespace-nowrap">
                    <div class="font-mono font-bold text-slate-800 dark:text-slate-200">${r.umur_asset} Thn</div>
                    <div class="mt-0.5">
                        ${r.is_over_age 
                            ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">Over-Age (${r.standar_umur} Thn)</span>`
                            : `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Normal (${r.standar_umur} Thn)</span>`
                        }
                    </div>
                </td>
                <td class="px-3 py-2.5 text-center whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${condBadge}">${r.kondisi}</span>
                </td>
                <td class="px-3 py-2.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    ${formatRp(r.harga_perolehan)}
                </td>
                <td class="px-3 py-2.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                    <div>${formatRp(r.nilai_buku)}</div>
                    <div class="text-[9.5px] text-slate-400 font-semibold">${r.book_ratio_to_capex.toFixed(1)}% CAPEX</div>
                </td>
                <td class="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    <div>${formatRp(r.past_maint_cost)}</div>
                    <div class="text-[9.5px] text-slate-400 font-semibold">${r.past_maint_count}x Servis</div>
                </td>
                <td class="px-3 py-2.5 text-right bg-amber-50/50 dark:bg-amber-950/30 whitespace-nowrap">
                    <div class="relative w-36 ml-auto">
                        <span class="absolute left-2 top-1.5 text-[10px] text-slate-400 font-bold">Rp</span>
                        <input type="number" step="500000" min="0" value="${r.service_cost}" onchange="window.pns.onSimRowCostChange('${r.kode_unit}', this.value)" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-6 pr-2 py-1 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-amber-500 shadow-2xs">
                    </div>
                    <div class="text-[9.5px] text-slate-400 mt-0.5 text-right">Edit biaya live</div>
                </td>
                <td class="px-3 py-2.5 text-center whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded font-mono text-[11px] font-bold ${ratioBookBadge}">
                        ${r.ratio_servis_buku >= 900 ? '∞ (Buku 0)' : `${r.ratio_servis_buku.toFixed(1)}%`}
                    </span>
                    <div class="w-20 mx-auto bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mt-1 overflow-hidden">
                        <div class="${ratioProgressColor} h-full rounded-full" style="width: ${pctClamped}%"></div>
                    </div>
                </td>
                <td class="px-3 py-2.5 text-center whitespace-nowrap">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-extrabold uppercase tracking-wide ${r.decision_badge} shadow-2xs">
                        <i class="ph-bold ${r.decision_icon}"></i>
                        <span>${r.decision_label}</span>
                    </span>
                </td>
                <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300 text-[11px] leading-snug">
                    <div class="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60">
                        ${r.justification}
                    </div>
                </td>
                <td class="px-3 py-2.5 text-center whitespace-nowrap">
                    <button type="button" onclick="window.pns.onSimRemoveUnit('${r.kode_unit}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer" title="Hapus dari simulasi">
                        <i class="ph-bold ph-trash text-sm"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

export function onSimProcessInput() {
    const el = document.getElementById('sim-input-unit-codes');
    if (!el) return;
    const text = el.value || '';
    const codes = text.split(/[\r\n,;\t\s]+/).map(s => s.trim()).filter(Boolean);
    if (codes.length === 0) {
        alert('Silakan masukkan minimal 1 kode unit pada kolom input.');
        return;
    }
    const set = new Set(simSelectedUnits.map(u => u.toUpperCase()));
    codes.forEach(c => {
        if (!set.has(c.toUpperCase())) {
            simSelectedUnits.push(c);
            set.add(c.toUpperCase());
        }
    });
    renderServiceSimulation();
}

export function onSimAddUnit(kode) {
    if (!kode) return;
    const clean = String(kode).trim();
    if (!simSelectedUnits.some(u => u.toUpperCase() === clean.toUpperCase())) {
        simSelectedUnits.push(clean);
        const ta = document.getElementById('sim-input-unit-codes');
        if (ta) ta.value = simSelectedUnits.join(', ');
        renderServiceSimulation();
    }
}

export function onSimRemoveUnit(kode) {
    if (!kode) return;
    const clean = String(kode).trim().toUpperCase();
    simSelectedUnits = simSelectedUnits.filter(u => u.toUpperCase() !== clean);
    simCustomCosts.delete(kode);
    simCustomCosts.delete(clean);
    const ta = document.getElementById('sim-input-unit-codes');
    if (ta) ta.value = simSelectedUnits.join(', ');
    renderServiceSimulation();
}

export function onSimClearAll() {
    simSelectedUnits = [];
    simCustomCosts.clear();
    const ta = document.getElementById('sim-input-unit-codes');
    if (ta) ta.value = '';
    renderServiceSimulation();
}

export function onSimApplyPreset(presetType) {
    if (!pbiData.assets || pbiData.assets.length === 0) return;
    const assets = pbiData.assets;
    let units = [];

    if (presetType === 'demo') {
        const broken = assets.filter(a => {
            const k = (a.kondisi || '').toLowerCase();
            return k.includes('broken') || k.includes('repair');
        }).slice(0, 3).map(a => a.kode_unit);
        
        const overAge = assets.filter(a => Number(a.umur_asset || 0) >= Number(a.standar_umur || 5) && Number(a.total_harga_perolehan || 0) > 0)
            .slice(0, 3).map(a => a.kode_unit);
            
        const young = assets.filter(a => Number(a.umur_asset || 0) < Number(a.standar_umur || 5) && Number(a.total_harga_perolehan || 0) > 50000000)
            .slice(0, 3).map(a => a.kode_unit);

        units = [...new Set([...broken, ...overAge, ...young])].filter(Boolean);
        if (units.length === 0) {
            units = assets.slice(0, 6).map(a => a.kode_unit);
        }
    } else if (presetType === 'repair_broken') {
        units = assets.filter(a => {
            const k = (a.kondisi || '').toLowerCase();
            return k.includes('repair') || k.includes('broken');
        }).map(a => a.kode_unit).filter(Boolean).slice(0, 20);
    } else if (presetType === 'over_age') {
        units = assets.filter(a => {
            const u = Number(a.umur_asset) || 0;
            const std = Number(a.standar_umur) || 5;
            return u >= std && Number(a.total_harga_perolehan || 0) > 0;
        }).map(a => a.kode_unit).filter(Boolean).slice(0, 20);
    } else if (presetType === 'top_cost') {
        const topUnits = measureMaintenanceFrequencyReport(pbiData.maintenance || [], assets).topCostUnits;
        units = topUnits.map(u => u.kode_unit).filter(Boolean).slice(0, 10);
    } else if (presetType === 'dump_truck') {
        units = assets.filter(a => {
            const cat = (a.kategori_asset || a.kode_kategori || a.nama_asset || '').toUpperCase();
            return cat.includes('DUMP') || cat.includes('DT') || (a.kode_unit || '').startsWith('DT');
        }).map(a => a.kode_unit).filter(Boolean).slice(0, 15);
    } else if (presetType === 'excavator') {
        units = assets.filter(a => {
            const cat = (a.kategori_asset || a.kode_kategori || a.nama_asset || '').toUpperCase();
            return cat.includes('EXCAVATOR') || cat.includes('EXC') || (a.kode_unit || '').startsWith('EXC');
        }).map(a => a.kode_unit).filter(Boolean).slice(0, 15);
    }

    if (units.length > 0) {
        simSelectedUnits = units;
        const ta = document.getElementById('sim-input-unit-codes');
        if (ta) ta.value = units.join(', ');
        renderServiceSimulation();
    }
}

export function onSimApplyGlobalCost() {
    const inp = document.getElementById('sim-default-cost-input');
    if (!inp) return;
    const val = Number(inp.value) || 0;
    simDefaultCost = val;
    simSelectedUnits.forEach(u => {
        simCustomCosts.set(u, val);
    });
    renderServiceSimulation();
}

export function onSimAutoFillHistorical() {
    if (!simLastResult || !simLastResult.rows) return;
    simLastResult.rows.forEach(r => {
        if (r.avg_past_cost > 0) {
            simCustomCosts.set(r.kode_unit, Math.round(r.avg_past_cost));
        }
    });
    renderServiceSimulation();
}

export function onSimRowCostChange(kodeUnit, newCost) {
    if (!kodeUnit) return;
    const n = Number(newCost) || 0;
    simCustomCosts.set(kodeUnit, n);
    renderServiceSimulation();
}

export function onSimSliderChange() {
    const bookSlider = document.getElementById('sim-slider-threshold-book');
    const capexSlider = document.getElementById('sim-slider-threshold-capex');
    if (bookSlider) {
        simThresholdBook = Number(bookSlider.value) || 50;
        setElText('sim-label-threshold-book', `${simThresholdBook}%`);
    }
    if (capexSlider) {
        simThresholdCapex = Number(capexSlider.value) || 50;
        setElText('sim-label-threshold-capex', `${simThresholdCapex}%`);
    }
    renderServiceSimulation();
}

export function onSimTableSearch(val) {
    simTableSearch = (val || '').trim();
    if (simLastResult && simLastResult.rows) {
        renderSimTableRows(simLastResult.rows);
    }
}

export function onSimSearchUnitKeyup(e) {
    const val = (e.target.value || '').trim().toLowerCase();
    const dropdown = document.getElementById('sim-search-suggestions');
    if (!dropdown) return;
    if (!val || val.length < 1 || !pbiData.assets) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
    }
    const matches = pbiData.assets.filter(a => {
        const u = (a.kode_unit || '').toLowerCase();
        const n = (a.nama_asset || '').toLowerCase();
        return u.includes(val) || n.includes(val);
    }).slice(0, 10);

    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="p-2 text-slate-400 text-xs italic">Unit tidak ditemukan</div>';
        dropdown.classList.remove('hidden');
        return;
    }

    dropdown.innerHTML = matches.map(a => `
        <div onclick="window.pns.onSimAddUnit('${a.kode_unit}'); document.getElementById('sim-search-suggestions').classList.add('hidden'); document.getElementById('sim-search-unit-input').value = '';" class="px-2.5 py-1.5 hover:bg-amber-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer flex items-center justify-between transition">
            <div>
                <span class="font-mono font-bold text-cyan-600 dark:text-cyan-400">${a.kode_unit}</span>
                <span class="text-slate-600 dark:text-slate-300 ml-1.5">${a.nama_asset || ''}</span>
            </div>
            <span class="text-[10px] text-slate-400 font-semibold">${a.kondisi || ''}</span>
        </div>
    `).join('');
    dropdown.classList.remove('hidden');
}

export function onSimAddFromSearch() {
    const inp = document.getElementById('sim-search-unit-input');
    if (!inp) return;
    const val = (inp.value || '').trim();
    if (!val) return;
    onSimAddUnit(val);
    inp.value = '';
    const dd = document.getElementById('sim-search-suggestions');
    if (dd) dd.classList.add('hidden');
}

export function exportSimulationCsv() {
    if (!simLastResult || !simLastResult.rows || simLastResult.rows.length === 0) {
        alert('Tidak ada data simulasi untuk diekspor.');
        return;
    }
    const headers = [
        'Kode Unit',
        'Nama Asset',
        'Kategori',
        'Lokasi',
        'Umur Asset (Tahun)',
        'Standar Umur (Tahun)',
        'Status Over-Age',
        'Kondisi',
        'Harga Perolehan (CAPEX)',
        'Nilai Buku Saat Ini',
        'Akumulasi MTC Historis',
        'Frekuensi Servis Historis',
        'Estimasi Biaya Servis Usulan',
        'Rasio Servis vs Nilai Buku (%)',
        'Rasio Total MTC vs CAPEX (%)',
        'Rekomendasi Keputusan',
        'Justifikasi & Alasan Finansial'
    ];
    const rows = simLastResult.rows.map(r => [
        r.kode_unit,
        r.nama_asset,
        r.kategori,
        r.lokasi,
        r.umur_asset,
        r.standar_umur,
        r.is_over_age ? 'OVER-AGE' : 'NORMAL',
        r.kondisi,
        r.harga_perolehan,
        r.nilai_buku,
        r.past_maint_cost,
        r.past_maint_count,
        r.service_cost,
        r.ratio_servis_buku.toFixed(2),
        r.ratio_mtc_capex.toFixed(2),
        r.decision_label,
        r.justification
    ]);
    downloadCsv(`Simulasi_Servis_dan_Penggantian_Aset_${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
}

export function printSimulationReport() {
    window.print();
}

// -------------------------------------------------------------
// VIEW 6G: MASTER ASET - 7. VALIDASI LAPANGAN
// -------------------------------------------------------------
let valInitialized = false;
let validationAssetsList = [];

export function renderAssetValidation(assets = []) {
    validationAssetsList = assets || [];
    initValidationSelects(validationAssetsList);
    loadValidationReports();
}

function initValidationSelects(assets) {
    validationAssetsList = assets || [];
    renderValAssetSuggestions('');
    
    // Close dropdown when clicked outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('val-asset-dropdown-menu');
        const input = document.getElementById('val-asset-search-input');
        if (menu && input && !menu.contains(e.target) && e.target !== input) {
            menu.classList.add('hidden');
        }
    });
}

export function openValAssetDropdown() {
    const input = document.getElementById('val-asset-search-input');
    filterValAssetDropdown(input ? input.value : '');
}

export function filterValAssetDropdown(query) {
    const menu = document.getElementById('val-asset-dropdown-menu');
    const clearBtn = document.getElementById('val-asset-clear-btn');
    if (!menu) return;

    if (clearBtn) {
        if (query && query.trim() !== '') {
            clearBtn.classList.remove('hidden');
            clearBtn.classList.add('flex');
        } else {
            clearBtn.classList.add('hidden');
            clearBtn.classList.remove('flex');
        }
    }

    renderValAssetSuggestions(query || '');
    menu.classList.remove('hidden');
}

export function clearValAssetSelection() {
    const input = document.getElementById('val-asset-search-input');
    const kodeInput = document.getElementById('val-selected-kode-unit');
    const idInput = document.getElementById('val-selected-asset-id');
    const preview = document.getElementById('val-asset-preview');
    const clearBtn = document.getElementById('val-asset-clear-btn');

    if (input) input.value = '';
    if (kodeInput) kodeInput.value = '';
    if (idInput) idInput.value = '';
    if (preview) preview.classList.add('hidden');
    if (clearBtn) {
        clearBtn.classList.add('hidden');
        clearBtn.classList.remove('flex');
    }
    renderValAssetSuggestions('');
}

function renderValAssetSuggestions(query) {
    const listEl = document.getElementById('val-asset-dropdown-list');
    if (!listEl) return;

    const q = (query || '').toLowerCase().trim();
    let matches = validationAssetsList;

    if (q) {
        matches = validationAssetsList.filter(a => 
            (a.kode_unit && a.kode_unit.toLowerCase().includes(q)) ||
            (a.nama_asset && a.nama_asset.toLowerCase().includes(q)) ||
            (a.location && a.location.toLowerCase().includes(q)) ||
            (a.penanggungjawab_section && a.penanggungjawab_section.toLowerCase().includes(q))
        );
    }

    if (matches.length === 0) {
        listEl.innerHTML = `
            <div class="px-3 py-4 text-center text-slate-400 font-medium">
                <i class="ph-bold ph-magnifying-glass text-lg block mb-1 text-slate-300"></i>
                Tidak ditemukan aset dengan kata kunci "<strong>${query}</strong>"
            </div>
        `;
        return;
    }

    listEl.innerHTML = matches.slice(0, 40).map(a => {
        const u = a.kode_unit || 'UNIT-' + a.asset_id;
        const n = a.nama_asset || '-';
        const l = a.location || a.lokasi_code || '-';
        const sec = a.penanggungjawab_section || a.kode_section || '';
        const pic = a.pic_nama || '';

        return `
            <div onclick="window.pns.selectValAssetItem('${a.asset_id}', '${encodeURIComponent(u)}')" class="px-3 py-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/50 cursor-pointer transition flex items-center justify-between gap-2 border-b border-slate-50 dark:border-slate-800/40 last:border-0">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-mono font-bold text-blue-600 dark:text-sky-400 text-xs">${u}</span>
                        <span class="px-1.5 py-0.2 text-[9.5px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${l}</span>
                        ${sec ? `<span class="px-1.5 py-0.2 text-[9px] font-semibold rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">${sec}</span>` : ''}
                    </div>
                    <div class="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5" title="${n}">${n}</div>
                    ${pic ? `<div class="text-[10px] text-emerald-600 font-medium"><i class="ph-bold ph-user"></i> PIC: ${pic}</div>` : ''}
                </div>
                <div class="shrink-0 text-right">
                    <span class="px-2 py-0.5 rounded text-[9.5px] font-bold ${String(a.kondisi || '').toLowerCase().includes('good') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}">
                        ${a.kondisi || 'Good'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

export function selectValAssetItem(assetId, encKodeUnit) {
    const kodeUnit = decodeURIComponent(encKodeUnit || '');
    const input = document.getElementById('val-asset-search-input');
    const kodeInput = document.getElementById('val-selected-kode-unit');
    const idInput = document.getElementById('val-selected-asset-id');
    const menu = document.getElementById('val-asset-dropdown-menu');
    const clearBtn = document.getElementById('val-asset-clear-btn');

    if (input) input.value = kodeUnit;
    if (kodeInput) kodeInput.value = kodeUnit;
    if (idInput) idInput.value = assetId;
    if (menu) menu.classList.add('hidden');
    if (clearBtn) {
        clearBtn.classList.remove('hidden');
        clearBtn.classList.add('flex');
    }

    onValidationAssetSelected(kodeUnit);
}

export function onValidationAssetSelected(kodeUnit) {
    const preview = document.getElementById('val-asset-preview');
    if (!kodeUnit) {
        if (preview) preview.classList.add('hidden');
        return;
    }
    const a = validationAssetsList.find(x => x.kode_unit === kodeUnit);
    if (!a) return;

    if (preview) {
        setElText('val-prev-name', a.nama_asset || '-');
        setElText('val-prev-loc', a.location || a.lokasi_code || '-');
        setElText('val-prev-bldg', `${a.nama_bangunan || '-'} (${a.detail_lokasi || '-'})`);
        setElText('val-prev-cond', a.kondisi || 'Good Condition');
        preview.classList.remove('hidden');
    }

    // Auto-select office if matches
    const offSel = document.getElementById('val-office-select');
    if (offSel && a.location) {
        const loc = a.location.toUpperCase();
        for (let i = 0; i < offSel.options.length; i++) {
            if (offSel.options[i].value === loc || loc.includes(offSel.options[i].value)) {
                offSel.selectedIndex = i;
                onValOfficeChange(offSel.options[i].value);
                break;
            }
        }
    }

    // Auto-fill kondisi & status
    const condSel = document.getElementById('val-kondisi-select');
    if (condSel && a.kondisi) {
        for (let i = 0; i < condSel.options.length; i++) {
            if (condSel.options[i].value.toLowerCase() === a.kondisi.toLowerCase()) {
                condSel.selectedIndex = i;
                break;
            }
        }
    }

    // Auto-fill Section & PIC
    const secSel = document.getElementById('val-section-select');
    const picInput = document.getElementById('val-pic-nama');
    if (secSel) {
        const secVal = (a.penanggungjawab_section || a.kode_section || '').toUpperCase();
        for (let i = 0; i < secSel.options.length; i++) {
            if (secSel.options[i].value && (secVal === secSel.options[i].value.toUpperCase() || secVal.includes(secSel.options[i].value.toUpperCase()) || secSel.options[i].value.toUpperCase().includes(secVal))) {
                secSel.selectedIndex = i;
                break;
            }
        }
    }
    if (picInput) {
        picInput.value = a.pic_nama || '';
    }
}

export function onValOfficeChange(officeName) {
    const bldgSel = document.getElementById('val-bldg-select');
    if (!bldgSel) return;

    if (!officeName) {
        bldgSel.innerHTML = '<option value="">-- Pilih Bangunan Terdata --</option>';
        return;
    }

    // Extract unique buildings in this office
    const buildings = new Set();
    validationAssetsList.forEach(a => {
        const loc = a.location || '';
        if (loc === officeName && a.nama_bangunan && a.nama_bangunan.trim() !== '' && !a.nama_bangunan.toLowerCase().includes('lapangan')) {
            buildings.add(a.nama_bangunan.trim());
        }
    });

    const bldgArr = Array.from(buildings).sort();
    let html = '<option value="">-- Pilih Bangunan Terdata (' + bldgArr.length + ' Gedung) --</option>';
    bldgArr.forEach(b => {
        html += `<option value="${b}">${b}</option>`;
    });
    html += '<option value="OTHER_BUILDING">+ Tambah / Tulis Gedung Lainnya...</option>';
    bldgSel.innerHTML = html;
}

export function onValEnvChange(envType) {
    const bldgContainer = document.getElementById('val-container-building');
    const outdoorContainer = document.getElementById('val-container-outdoor');

    if (envType === 'IN_BUILDING') {
        if (bldgContainer) bldgContainer.classList.remove('hidden');
        if (outdoorContainer) outdoorContainer.classList.add('hidden');
    } else {
        if (bldgContainer) bldgContainer.classList.add('hidden');
        if (outdoorContainer) outdoorContainer.classList.remove('hidden');
    }
}

export function onValBldgChange(val) {
    const roomInput = document.getElementById('val-room-input');
    if (val === 'OTHER_BUILDING') {
        const customBldg = prompt('Masukkan Nama Bangunan / Gedung baru:');
        if (customBldg) {
            const bldgSel = document.getElementById('val-bldg-select');
            const opt = document.createElement('option');
            opt.value = customBldg;
            opt.text = customBldg;
            opt.selected = true;
            bldgSel.add(opt, bldgSel.options[1]);
        }
    }
}

export async function submitAssetValidation(event) {
    event.preventDefault();
    const btn = document.getElementById('btn-val-submit');
    const alertEl = document.getElementById('val-alert');
    const kodeHidden = document.getElementById('val-selected-kode-unit');
    const idHidden = document.getElementById('val-selected-asset-id');
    const searchInput = document.getElementById('val-asset-search-input');
    const officeSel = document.getElementById('val-office-select');
    const envRadios = document.getElementsByName('val-env-type');
    let envType = 'IN_BUILDING';
    for (const r of envRadios) {
        if (r.checked) envType = r.value;
    }

    const bldgSel = document.getElementById('val-bldg-select');
    const roomInput = document.getElementById('val-room-input');
    const outdoorInput = document.getElementById('val-outdoor-spot');
    const condSel = document.getElementById('val-kondisi-select');
    const statusSel = document.getElementById('val-status-select');
    const sectionSel = document.getElementById('val-section-select');
    const picInput = document.getElementById('val-pic-nama');
    const photoInput = document.getElementById('val-foto-input');
    const catatanInput = document.getElementById('val-catatan-input');

    const selectedKode = (kodeHidden && kodeHidden.value) || (searchInput && searchInput.value.trim()) || '';
    const selectedAssetId = (idHidden && idHidden.value) || '';

    if (!selectedKode) {
        alert('Silakan cari dan pilih kode unit aset terlebih dahulu.');
        return;
    }

    const fd = new FormData();
    fd.append('kode_unit', selectedKode);
    if (selectedAssetId) {
        fd.append('asset_id', selectedAssetId);
    }
    fd.append('lokasi_kantor', officeSel ? officeSel.value : '');
    fd.append('env_type', envType);
    fd.append('nama_bangunan', envType === 'IN_BUILDING' ? (bldgSel ? bldgSel.value : '') : 'OUTDOOR / LAPANGAN');
    fd.append('detail_lokasi', envType === 'IN_BUILDING' ? (roomInput ? roomInput.value : '') : (outdoorInput ? outdoorInput.value : ''));
    fd.append('section_pic', sectionSel ? sectionSel.value : '');
    fd.append('pic_nama', picInput ? picInput.value : '');
    fd.append('kondisi_baru', condSel ? condSel.value : 'Good Condition');
    fd.append('status_baru', statusSel ? statusSel.value : 'Aktif');
    fd.append('catatan_user', catatanInput ? catatanInput.value : '');

    if (photoInput && photoInput.files && photoInput.files[0]) {
        fd.append('foto', photoInput.files[0]);
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin"></i> Menyimpan...';
    }

    try {
        const res = await fetch('../pns_asset/api/asset/validate.php', {
            method: 'POST',
            body: fd
        });
        const json = await res.json();

        if (json.status === 'success') {
            if (alertEl) {
                alertEl.className = 'p-3 rounded-xl font-bold text-xs bg-emerald-100 text-emerald-800 border border-emerald-300';
                alertEl.innerText = json.message || 'Laporan validasi aset berhasil dikirim!';
                alertEl.classList.remove('hidden');
            }
            // Update local memory data for this asset
            const targetAsset = validationAssetsList.find(x => x.kode_unit === selectedKode);
            if (targetAsset) {
                targetAsset.location = officeSel ? officeSel.value : targetAsset.location;
                targetAsset.nama_bangunan = envType === 'IN_BUILDING' ? (bldgSel ? bldgSel.value : '') : 'OUTDOOR / LAPANGAN';
                targetAsset.detail_lokasi = envType === 'IN_BUILDING' ? (roomInput ? roomInput.value : '') : (outdoorInput ? outdoorInput.value : '');
                targetAsset.penanggungjawab_section = sectionSel ? sectionSel.value : targetAsset.penanggungjawab_section;
                targetAsset.pic_nama = picInput ? picInput.value : targetAsset.pic_nama;
                targetAsset.kondisi = condSel ? condSel.value : targetAsset.kondisi;
                targetAsset.status_pemakaian = statusSel ? statusSel.value : targetAsset.status_pemakaian;
            }

            // Reload Reports Feed
            loadValidationReports();

            // Clear photo & catatan
            if (photoInput) photoInput.value = '';
            if (catatanInput) catatanInput.value = '';

            setTimeout(() => {
                if (alertEl) alertEl.classList.add('hidden');
            }, 3500);
        } else {
            if (alertEl) {
                alertEl.className = 'p-3 rounded-xl font-bold text-xs bg-rose-100 text-rose-800 border border-rose-300';
                alertEl.innerText = json.message || 'Gagal menyimpan laporan.';
                alertEl.classList.remove('hidden');
            }
        }
    } catch (e) {
        if (alertEl) {
            alertEl.className = 'p-3 rounded-xl font-bold text-xs bg-rose-100 text-rose-800 border border-rose-300';
            alertEl.innerText = 'Terjadi kesalahan jaringan atau server.';
            alertEl.classList.remove('hidden');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph-bold ph-paper-plane-tilt"></i> Kirim Laporan Validasi';
        }
    }
}

export async function loadValidationReports() {
    const feed = document.getElementById('val-reports-feed');
    try {
        const res = await fetch('../pns_asset/api/asset/validate.php');
        const json = await res.json();
        if (json.status === 'success') {
            // Update Stats
            setElText('pbi-val-stat-total', `${formatNum(json.summary.total)} Laporan`);
            setElText('pbi-val-stat-pending', `${formatNum(json.summary.pending)} Laporan`);
            setElText('pbi-val-stat-approved', `${formatNum(json.summary.approved)} Laporan`);
            setElText('pbi-val-stat-last-date', json.summary.last_verified_date || '-');

            if (!feed) return;
            if (!json.data || json.data.length === 0) {
                feed.innerHTML = `
                    <div class="text-center py-10 px-4 text-slate-400">
                        <i class="ph-bold ph-clipboard-text text-3xl text-slate-300 dark:text-slate-700 block mb-2"></i>
                        <p class="font-bold text-xs text-slate-600 dark:text-slate-300">Belum ada laporan audit lapangan</p>
                        <p class="text-[11px]">Silakan isi formulir di sebelah kiri untuk memvalidasi aset.</p>
                    </div>
                `;
                return;
            }

            feed.innerHTML = json.data.map(r => `
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1.5 transition hover:shadow-xs">
                    <div class="flex items-center justify-between">
                        <span class="font-mono font-bold text-blue-600 dark:text-sky-400">${r.kode_unit || 'UNIT-' + r.asset_id}</span>
                        <span class="px-2 py-0.5 rounded-full text-[9.5px] font-bold ${r.status_laporan === 'Disetujui' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}">
                            ${r.status_laporan}
                        </span>
                    </div>
                    <div class="font-semibold text-slate-800 dark:text-slate-200 truncate" title="${r.nama_asset}">${r.nama_asset || '-'}</div>
                    <div class="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <i class="ph-bold ph-map-pin text-rose-500 shrink-0"></i>
                        <span class="truncate">${r.lokasi_baru || '-'}</span>
                    </div>
                    ${(r.section_pic || r.pic_nama) ? `
                        <div class="text-[10.5px] text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">
                            ${r.section_pic ? `<span class="font-bold text-blue-600 dark:text-sky-400"><i class="ph-bold ph-buildings"></i> ${r.section_pic}</span>` : ''}
                            ${r.pic_nama ? `<span class="font-medium text-emerald-600"><i class="ph-bold ph-user"></i> ${r.pic_nama}</span>` : ''}
                        </div>
                    ` : ''}
                    <div class="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50 text-[10.5px]">
                        <span class="font-bold text-emerald-600">Kondisi: ${r.kondisi_baru || 'Good'}</span>
                        <span class="text-slate-400 font-mono">${(r.tanggal_lapor || '').substring(0, 16)}</span>
                    </div>
                    ${r.foto_kondisi ? `
                        <div class="pt-1.5">
                            <a href="${r.foto_kondisi}" target="_blank" class="inline-flex items-center gap-1 text-[10.5px] text-blue-600 dark:text-sky-400 font-bold hover:underline">
                                <i class="ph-bold ph-image"></i> Lihat Foto Bukti
                            </a>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }
    } catch (e) {
        if (feed) feed.innerHTML = '<div class="text-center py-6 text-rose-500 text-xs font-semibold">Gagal memuat riwayat validasi.</div>';
    }
}

async function syncLiveData(btn, isSilent = false) {
    if (window._isSyncing) {
        console.log("[PNS ENTERPRISE] Sinkronisasi sedang berlangsung, abaikan permintaan ganda.");
        return;
    }
    window._isSyncing = true;
    window._lastVraSyncTime = Date.now();
    const icon = document.getElementById('icon-sync-vra') || (btn ? btn.querySelector('i') : null);
    const text = document.getElementById('text-sync-vra') || (btn ? btn.querySelector('span') : null);
    if (btn && !isSilent) btn.disabled = true;
    if (icon) icon.classList.add('animate-spin');
    if (text && !isSilent) text.textContent = 'Sinkronisasi...';

    try {
        const res = await fetch('api/vra/sync.php');
        const json = await res.json();
        if (json.success && json.data) {
            pbiData.vra = enrichVraRows(json.data, pbiData.assetMap || new Map());
            updateVraUnitSets();
            pbiData.vra4SummaryCache = null;
            pbiData.unitIndexMaps = null;
            if (pbiData.cache) {
                pbiData.cache.vra = pbiData.vra;
            }
            applyPbiFilters();
            refreshAllCharts();
            if (!isSilent) {
                alert(json.message + ' (' + (json.count || 0).toLocaleString('id-ID') + ' baris data, ' + (json.distinct_units || 62) + ' unit aktif)');
            }
        } else {
            if (!isSilent) {
                alert(json.message || 'Gagal sinkronisasi data dari server pusat.');
            }
        }
    } catch (err) {
        console.error('Sync error:', err);
        if (!isSilent) {
            alert('Gagal menghubungi server sinkronisasi: ' + err.message);
        }
    } finally {
        window._isSyncing = false;
        if (btn && !isSilent) btn.disabled = false;
        if (icon) icon.classList.remove('animate-spin');
        if (text && !isSilent) text.textContent = 'Sync Live Data';
    }
}

window.pns = Object.assign(window.pns || {}, {
    init: initializePbiApp,
    switchView: switchView,
    syncLiveData: syncLiveData,
    toggleSidebar: toggleSidebar,
    toggleMobileMenu: toggleMobileMenu,
    closeMobileSidebar: closeMobileSidebar,
    toggleNavModule: toggleNavModule,
    applyFilters: applyPbiFilters,
    applyPbiFilters: applyPbiFilters,
    resetFilters: resetPbiFilters,
    resetPbiFilters: resetPbiFilters,
    refreshCharts: refreshAllCharts,
    
    // Drill-Through & Navigation Helpers
    drillToUnit: drillToUnit,
    drillToCategoryDetail: drillToCategoryDetail,
    openCategoryInNewTab: openCategoryInNewTab,
    selectCategoryDetail: selectCategoryDetail,
    onCatLogSearch: onCatLogSearch,
    getCurrentCategory: () => currentSelectedCategory,
    drillToFuelDetail: drillToFuelDetail,
    drillToAssetDetail: drillToAssetDetail,
    drillToMaintDetail: drillToMaintDetail,
    drillToOfficeAssets: drillToOfficeAssets,
    drillFromVra4: drillFromVra4,
    selectSpotlightAsset: selectSpotlightAsset,

    // VRA 1 Handlers & In-Visual Drill/Slicers
    setVra1TrendDim: setVra1TrendDim,
    setVisualVra1DrillLevel: setVisualVra1DrillLevel,
    drillUpVisualVra1: drillUpVisualVra1,
    onVisualVra1TypeChange: onVisualVra1TypeChange,
    onVisualVra1UnitChange: onVisualVra1UnitChange,
    resetVisualVra1Filters: resetVisualVra1Filters,
    onVra1Search: onVra1Search,
    onFleetTypeSelect: onFleetTypeSelect,

    // VRA 2 Handlers
    setVra2BarDim: setVra2BarDim,
    setVra2StatusFilter: setVra2StatusFilter,
    toggleVra2StatusFilter: toggleVra2StatusFilter,
    resetVra2StatusFilter: resetVra2StatusFilter,
    onVra2FilterChange: onVra2FilterChange,
    onVra2UnitChange: onVra2UnitChange,
    onVra2Search: onVra2Search,
    sortVra2: sortVra2,
    setVra2Layout: setVra2Layout,

    // VRA 3 Handlers
    onVra3FilterChange: onVra3FilterChange,
    onVra3Search: onVra3Search,

    // VRA 4 Handlers
    onVra4FilterChange: onVra4FilterChange,
    onVra4CatPickerChange: onVra4CatPickerChange,
    prevVra4Unit: prevVra4Unit,
    nextVra4Unit: nextVra4Unit,
    onVra4Search: onVra4Search,
    resetVra4Filters: resetVra4Filters,
    onVra4UnitChanged: onVra4UnitChanged,
    switchVra4TableTab: switchVra4TableTab,
    adjustFiltersForView: adjustFiltersForView,
    updateTopBarMonths: updateTopBarMonths,

    // Fuel Handlers
    setFuelTrendDim: setFuelTrendDim,
    setFuelPreset: setFuelPreset,
    exportFuelCsv: exportFuelCsv,
    onFuelFilterChange: onFuelFilterChange,
    onFuelSearch: onFuelSearch,
    setFuelDetailFilter: setFuelDetailFilter,
    onFuelDetailFilterChange: onFuelDetailFilterChange,
    onFuelDetailSearch: onFuelDetailSearch,
    switchFuelDetailTableTab: switchFuelDetailTableTab,
    exportFuelDetailCsv: exportFuelDetailCsv,

    // Fuel VRA Comparison Handlers
    renderFuelVraComparison: renderFuelVraComparison,
    onFuelVraFilterChange: onFuelVraFilterChange,
    onFuelVraSearch: onFuelVraSearch,
    setFuelVraQuadrant: setFuelVraQuadrant,
    exportFuelVraCsv: exportFuelVraCsv,

    // Asset Handlers
    setAssetEnvFilter: setAssetEnvFilter,
    setAssetBarDim: setAssetBarDim,
    setAssetOverviewDim: setAssetOverviewDim,
    setAssetPerfDim: setAssetPerfDim,
    onAssetFilterChange: onAssetFilterChange,
    onAssetSearch: onAssetSearch,
    onAsset1Search: onAsset1Search,
    filterByOfficeLocation: filterByOfficeLocation,
    onAssetDetailFilterChange: onAssetDetailFilterChange,
    onAssetDetailSearch: onAssetDetailSearch,
    exportAssetCatalogCsv: exportAssetCatalogCsv,
    exportAssetDetailCsv: exportAssetDetailCsv,
    toggleInOutLocationDetail: toggleInOutLocationDetail,

    // Office Detail & Drillthrough Handlers
    openOfficeDetail: openOfficeDetail,
    backToOfficeList: backToOfficeList,
    openOfficeDrillthrough: openOfficeDrillthrough,
    drillToAssetDrillthrough: drillToAssetDrillthrough,
    backFromDrillthrough: backFromDrillthrough,
    setOfficeDetailPerfDim: setOfficeDetailPerfDim,
    onOfficeDetailFilterChange: onOfficeDetailFilterChange,

    // Building & Room Inventory Handlers
    renderAssetBuildingRooms: renderAssetBuildingRooms,
    reloadBuildingRoomsData: reloadBuildingRoomsData,
    onBuildingScopeChange: onBuildingScopeChange,
    onBuildingFilterChange: onBuildingFilterChange,
    onBuildingSearchInput: onBuildingSearchInput,
    selectBuilding: selectBuilding,
    selectRoom: selectRoom,
    openBuildingInRoomExplorer: openBuildingInRoomExplorer,
    printRoomChecklist: printRoomChecklist,
    toggleKategoriRow: toggleKategoriRow,
    onDrillSearch: onDrillSearch,
    exportDrillCsv: exportDrillCsv,
    openContextMenu: openContextMenu,

    // Maintenance Handlers
    setMaintTrendDim: setMaintTrendDim,
    setMaintBarDim: setMaintBarDim,
    setMaintGranularity: setMaintGranularity,
    resetMaintDrillDown: resetMaintDrillDown,
    onMaintFilterChange: onMaintFilterChange,
    onMaintSearch: onMaintSearch,
    onMaintDetailFilterChange: onMaintDetailFilterChange,
    onMaintDetailSearch: onMaintDetailSearch,

    // Building Modal Handlers
    openBuildingAssetModal: openBuildingAssetModal,
    closeBuildingModal: closeBuildingModal,
    filterBuildingModalUnits: filterBuildingModalUnits,
    toggleBuildingMaintFilter: toggleBuildingMaintFilter,
    openUnitDetailModal: openUnitDetailModal,
    closeUnitDetailModal: closeUnitDetailModal,

    // Validation Handlers
    renderAssetValidation: renderAssetValidation,
    openValAssetDropdown: openValAssetDropdown,
    filterValAssetDropdown: filterValAssetDropdown,
    clearValAssetSelection: clearValAssetSelection,
    selectValAssetItem: selectValAssetItem,
    onValidationAssetSelected: onValidationAssetSelected,
    onValOfficeChange: onValOfficeChange,
    onValEnvChange: onValEnvChange,
    onValBldgChange: onValBldgChange,
    submitAssetValidation: submitAssetValidation,
    loadValidationReports: loadValidationReports,

    // Fleet Type Multi-Select
    selectType: (type) => {
        if (selectedTypes.has(type)) {
            selectedTypes.delete(type);
        } else {
            selectedTypes.add(type);
        }
        updateTypeChipStyles();
        updateVraUnitDropdown();
        applyPbiFilters();
    },
    selectAllTypes: () => {
        selectedTypes = new Set(ALL_FLEET_TYPES);
        updateTypeChipStyles();
        updateVraUnitDropdown();
        applyPbiFilters();
    },
    deselectAllTypes: () => {
        selectedTypes = new Set();
        updateTypeChipStyles();
        updateVraUnitDropdown();
        applyPbiFilters();
    },

    // Benchmark Handler
    onBenchmarkKatChange: onBenchmarkKatChange,

    // Depreciation Slicers & Drill-Down & Report Handlers
    onDepFilterChange: onDepFilterChange,
    resetDepFilters: resetDepFilters,
    toggleDepCategoryRow: toggleDepCategoryRow,
    runDepreciationReportSearch: runDepreciationReportSearch,
    onDepReportPageSizeChange: onDepReportPageSizeChange,
    onDepReportTableSearch: onDepReportTableSearch,
    sortDepReportTable: sortDepReportTable,
    depReportPrevPage: depReportPrevPage,
    depReportNextPage: depReportNextPage,
    printDepreciationReport: printDepreciationReport,
    copyDepReportToClipboard: copyDepReportToClipboard,
    exportDepReportToExcel: exportDepReportToExcel,
    renderReportDepreciation: renderReportDepreciation,

    // Office Detail Handlers
    toggleKategoriRow: toggleKategoriRow,
    setOfficeDetailPerfDim: setOfficeDetailPerfDim,
    onOfficeDetailFilterChange: onOfficeDetailFilterChange,

    // Building & Room Inventory Handlers
    renderAssetBuildingRooms: renderAssetBuildingRooms,
    reloadBuildingRoomsData: reloadBuildingRoomsData,
    onBuildingScopeChange: onBuildingScopeChange,
    onBuildingFilterChange: onBuildingFilterChange,
    onBuildingSearchInput: onBuildingSearchInput,
    selectBuilding: selectBuilding,
    selectRoom: selectRoom,
    openBuildingInRoomExplorer: openBuildingInRoomExplorer,
    printRoomChecklist: printRoomChecklist,
    setAssetDetailTableMode: setAssetDetailTableMode,
    filterAssetDetailBldgItem: filterAssetDetailBldgItem,
    filterAssetDetailBldgRoom: filterAssetDetailBldgRoom,

    // Facility Inspection & Census Handlers
    openInspectionModal: openInspectionModal,
    closeInspectionModal: closeInspectionModal,
    onInspRoomSelectChange: onInspRoomSelectChange,
    openBatchRoomAudit: openBatchRoomAudit,
    submitInspectionForm: submitInspectionForm
});

window.setAssetDetailTableMode = (m) => window.pns.setAssetDetailTableMode(m);
window.filterAssetDetailBldgItem = (i) => window.pns.filterAssetDetailBldgItem(i);
window.filterAssetDetailBldgRoom = (r) => window.pns.filterAssetDetailBldgRoom(r);
window.openInspectionModal = (u) => window.pns.openInspectionModal(u);
window.closeInspectionModal = () => window.pns.closeInspectionModal();
window.onInspRoomSelectChange = (v) => window.pns.onInspRoomSelectChange(v);
window.openBatchRoomAudit = () => window.pns.openBatchRoomAudit();
window.submitInspectionForm = (e) => window.pns.submitInspectionForm(e);

// Global shorthand for inline HTML handlers
window.toggleSidebar = () => window.pns.toggleSidebar();
window.toggleMobileMenu = () => window.pns.toggleMobileMenu();
window.closeMobileSidebar = () => window.pns.closeMobileSidebar();
window.toggleNavModule = (groupId) => window.pns.toggleNavModule(groupId);
window.switchView = (viewId, subId, btn) => window.pns.switchView(subId || viewId);
window.switchVraSubView = (subId, btn) => window.pns.switchView(subId);
window.switchAssetSubView = (subId, btn) => window.pns.switchView(subId);
window.switchPbiTab = (tabId, btn) => window.pns.switchView(tabId);
window.applyFilters = () => window.pns.applyFilters();
window.resetFilters = () => window.pns.resetFilters();
window.switchVra4TableTab = (tab) => window.pns.switchVra4TableTab(tab);
window.resetVra4Filters = () => window.pns.resetVra4Filters();
window.onVra4Search = (q) => window.pns.onVra4Search(q);
window.onVra4FilterChange = () => window.pns.onVra4FilterChange();
window.prevVra4Unit = () => window.pns.prevVra4Unit();
window.nextVra4Unit = () => window.pns.nextVra4Unit();
window.onVra4CatPickerChange = (cat) => window.pns.onVra4CatPickerChange(cat);
window.onVra4UnitChanged = (u) => window.pns.onVra4UnitChanged(u);
window.resetMaintDrillDown = () => window.pns.resetMaintDrillDown();
window.setMaintGranularity = (...args) => window.pns.setMaintGranularity(...args);

// Drill-Through & Action Globals
window.drillToUnit = (unit) => window.pns.drillToUnit(unit);
window.drillToCategoryDetail = (cat, openNewTab) => window.pns.drillToCategoryDetail(cat, openNewTab);
window.openCategoryInNewTab = () => window.pns.openCategoryInNewTab();
window.selectCategoryDetail = (cat) => window.pns.selectCategoryDetail(cat);
window.onCatLogSearch = (q) => window.pns.onCatLogSearch(q);
window.drillToFuelDetail = (unit) => window.pns.drillToFuelDetail(unit);
window.drillToAssetDetail = (asset) => window.pns.drillToAssetDetail(asset);
window.drillToMaintDetail = (query) => window.pns.drillToMaintDetail(query);
window.drillToOfficeAssets = (loc) => window.pns.drillToOfficeAssets(loc);
window.drillFromVra4 = (type) => window.pns.drillFromVra4(type);
window.openOfficeDetail = (loc) => window.pns.openOfficeDetail(loc);
window.backToOfficeList = () => window.pns.backToOfficeList();
window.openOfficeDrillthrough = () => window.pns.openOfficeDrillthrough();
window.drillToAssetDrillthrough = (filters) => window.pns.drillToAssetDrillthrough(filters);
window.backFromDrillthrough = () => window.pns.backFromDrillthrough();
window.toggleKategoriRow = (rowId) => window.pns.toggleKategoriRow(rowId);
window.exportDrillCsv = () => window.pns.exportDrillCsv();
window.exportAssetCatalogCsv = () => window.pns.exportAssetCatalogCsv();
window.exportFuelDetailCsv = () => window.pns.exportFuelDetailCsv();
window.exportFuelCsv = () => window.pns.exportFuelCsv();
window.setFuelPreset = (p) => window.pns.setFuelPreset(p);
window.exportAssetDetailCsv = () => window.pns.exportAssetDetailCsv();
window.setAssetEnvFilter = (env) => window.pns.setAssetEnvFilter(env);
window.openBuildingInRoomExplorer = (loc, bldg) => window.pns.openBuildingInRoomExplorer(loc, bldg);
window.selectBuilding = (bldg) => window.pns.selectBuilding(bldg);
window.selectRoom = (rm) => window.pns.selectRoom(rm);
window.onBuildingScopeChange = (s) => window.pns.onBuildingScopeChange(s);
window.onBuildingFilterChange = () => window.pns.onBuildingFilterChange();
window.onBuildingSearchInput = (q) => window.pns.onBuildingSearchInput(q);
window.printRoomChecklist = () => window.pns.printRoomChecklist();
window.openBuildingAssetModal = (loc, bldg) => window.pns.openBuildingAssetModal(loc, bldg);
window.closeBuildingModal = () => window.pns.closeBuildingModal();
window.filterBuildingModalUnits = (q) => window.pns.filterBuildingModalUnits(q);
window.toggleBuildingMaintFilter = () => window.pns.toggleBuildingMaintFilter();
window.openUnitDetailModal = (u) => window.pns.openUnitDetailModal(u);
window.closeUnitDetailModal = () => window.pns.closeUnitDetailModal();
window.openValAssetDropdown = () => window.pns.openValAssetDropdown();
window.filterValAssetDropdown = (q) => window.pns.filterValAssetDropdown(q);
window.clearValAssetSelection = () => window.pns.clearValAssetSelection();
window.selectValAssetItem = (id, u) => window.pns.selectValAssetItem(id, u);
window.onValidationAssetSelected = (u) => window.pns.onValidationAssetSelected(u);
window.onValOfficeChange = (o) => window.pns.onValOfficeChange(o);
window.onValEnvChange = (e) => window.pns.onValEnvChange(e);
window.onValBldgChange = (b) => window.pns.onValBldgChange(b);
window.submitAssetValidation = (e) => window.pns.submitAssetValidation(e);
window.loadValidationReports = () => window.pns.loadValidationReports();
window.onBenchmarkKatChange = (k) => window.pns.onBenchmarkKatChange(k);
window.onDepFilterChange = () => window.pns.onDepFilterChange();
window.resetDepFilters = () => window.pns.resetDepFilters();
window.toggleDepCategoryRow = (rowId) => window.pns.toggleDepCategoryRow(rowId);
window.onVra4CatPickerChange = (cat) => window.pns.onVra4CatPickerChange(cat);
window.prevVra4Unit = () => window.pns.prevVra4Unit();
window.nextVra4Unit = () => window.pns.nextVra4Unit();
window.onVra4UnitChanged = (u) => window.pns.onVra4UnitChanged(u);

// Health Monitoring Globals
window.openHealthModal = () => {
    const modal = document.getElementById('modal-health');
    if (modal) modal.classList.remove('hidden');
    window.loadSystemHealth();
};
window.closeHealthModal = () => {
    const modal = document.getElementById('modal-health');
    if (modal) modal.classList.add('hidden');
};
window.loadSystemHealth = async () => {
    const body = document.getElementById('health-modal-body');
    if (!body) return;
    body.innerHTML = `
        <div class="text-center py-8 text-slate-400">
            <div class="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p class="font-bold">Memeriksa metrik sistem & latensi database...</p>
        </div>
    `;
    try {
        const res = await fetch('api/health.php');
        const d = await res.json();
        if (d.status === 'HEALTHY') {
            let tableRows = '';
            for (const [key, val] of Object.entries(d.database_records || {})) {
                const isLiveApi = String(val.label).includes('Live API');
                const badge = isLiveApi 
                    ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">⚡ LIVE API</span>' 
                    : '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-sky-300">📂 DB / EXCEL</span>';
                
                tableRows += `
                    <tr class="border-b border-slate-100 dark:border-slate-800">
                        <td class="py-2 px-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                            <div>${key}</div>
                            <div class="text-[10px] text-slate-400 font-sans font-normal">${val.label}</div>
                        </td>
                        <td class="py-2 px-2.5 text-center">${badge}</td>
                        <td class="py-2 px-2.5 text-right font-black font-mono text-blue-600 dark:text-sky-400">${Number(val.count).toLocaleString('id-ID')} Baris</td>
                        <td class="py-2 px-2.5 text-right font-mono font-semibold text-slate-600 dark:text-slate-300">${val.latest_date || '-'}</td>
                    </tr>
                `;
            }

            body.innerHTML = `
                <!-- Top Status Banner -->
                <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span class="font-black text-emerald-800 dark:text-emerald-300">STATUS: SISTEM STABIL & SEMUA API TERHUBUNG</span>
                    </div>
                    <span class="text-[10px] font-mono text-slate-400">${d.timestamp}</span>
                </div>

                <!-- KPI Performance Cards -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-center">
                        <span class="text-[10px] text-slate-400 block font-semibold">DB Query Latency</span>
                        <span class="font-mono font-black text-emerald-600 text-sm">${d.performance.db_latency_ms} ms</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-center">
                        <span class="text-[10px] text-slate-400 block font-semibold">API Response</span>
                        <span class="font-mono font-black text-blue-600 text-sm">${d.performance.api_latency_ms} ms</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-center">
                        <span class="text-[10px] text-slate-400 block font-semibold">PHP Memory</span>
                        <span class="font-mono font-black text-purple-600 text-sm">${d.performance.memory_used_mb} MB / ${d.environment.memory_limit}</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-center">
                        <span class="text-[10px] text-slate-400 block font-semibold">Active Threads</span>
                        <span class="font-mono font-black text-amber-600 text-sm">${d.performance.active_db_threads} Conns</span>
                    </div>
                </div>

                <!-- Table Records & Freshness Breakdown -->
                <div>
                    <h4 class="font-extrabold text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                        <i class="ph-bold ph-database text-blue-600"></i> Status & Kesegaran Sumber Data API
                    </h4>
                    <div class="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                        <table class="w-full text-left text-xs bg-white dark:bg-slate-900">
                            <thead class="bg-slate-50 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-500">
                                <tr>
                                    <th class="py-2 px-2.5">Sumber Data / Tabel</th>
                                    <th class="py-2 px-2.5 text-center">Tipe Alur</th>
                                    <th class="py-2 px-2.5 text-right">Total Record</th>
                                    <th class="py-2 px-2.5 text-right">Data Terakhir</th>
                                </tr>
                            </thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>
                </div>

                <!-- High Load Safety Features -->
                <div class="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-1.5 text-[11px]">
                    <div class="font-bold text-blue-900 dark:text-sky-300 flex items-center gap-1.5">
                        <i class="ph-bold ph-shield-check text-blue-600"></i> Proteksi Beban Tinggi & Real-time Sync:
                    </div>
                    <ul class="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-300">
                        <li><strong>Live Transactional Stream:</strong> Data VRA dan BBM terhubung ke tabel MySQL secara live, otomatis termuat saat dashboard diakses.</li>
                        <li><strong>In-Memory Browser Caching:</strong> Navigasi antar-tab dan interaksi slicer/filter berjalan instan tanpa lag.</li>
                        <li><strong>100% Prepared Statements:</strong> Seluruh query menggunakan parameterized PDO yang aman dan cepat.</li>
                    </ul>
                </div>
            `;
        } else {
            body.innerHTML = `<div class="p-3 rounded-xl bg-rose-100 text-rose-800 font-bold">Gagal memeriksa status: ${d.error || 'Server error'}</div>`;
        }
    } catch (e) {
        body.innerHTML = `<div class="p-3 rounded-xl bg-rose-100 text-rose-800 font-bold">Terjadi kesalahan koneksi API Health.</div>`;
    }
};

// Attach Global API to window.pns
window.pns = window.pns || {};
window.pns.switchView = switchView;
window.pns.init = initializePbiApp;
window.pns.refreshCharts = () => renderActiveView();
window.pns.renderExecutiveDashboard = renderExecutiveDashboard;
window.pns.setMaintTrendDim = setMaintTrendDim;
window.pns.setMaintGranularity = setMaintGranularity;
window.pns.resetMaintDrillDown = resetMaintDrillDown;
window.pns.setMaintBarDim = setMaintBarDim;
window.pns.onMaintFilterChange = onMaintFilterChange;
window.pns.onMaintSearch = onMaintSearch;
window.pns.toggleDepCategoryRow = toggleDepCategoryRow;
window.pns.onDepFilterChange = onDepFilterChange;
window.pns.resetDepFilters = resetDepFilters;
window.pns.drillToAssetDrillthrough = drillToAssetDrillthrough;

// Report Depreciation functions
window.pns.runDepreciationReportSearch = runDepreciationReportSearch;
window.pns.onDepReportPageSizeChange = onDepReportPageSizeChange;
window.pns.onDepReportTableSearch = onDepReportTableSearch;
window.pns.sortDepReportTable = sortDepReportTable;
window.pns.depReportPrevPage = depReportPrevPage;
window.pns.depReportNextPage = depReportNextPage;
window.pns.printDepreciationReport = printDepreciationReport;
window.pns.copyDepReportToClipboard = copyDepReportToClipboard;
window.pns.exportDepReportToExcel = exportDepReportToExcel;
window.pns.renderReportDepreciation = renderReportDepreciation;

// Service Simulation Functions
window.pns.renderServiceSimulation = renderServiceSimulation;
window.pns.onSimProcessInput = onSimProcessInput;
window.pns.onSimAddUnit = onSimAddUnit;
window.pns.onSimRemoveUnit = onSimRemoveUnit;
window.pns.onSimClearAll = onSimClearAll;
window.pns.onSimApplyPreset = onSimApplyPreset;
window.pns.onSimApplyGlobalCost = onSimApplyGlobalCost;
window.pns.onSimAutoFillHistorical = onSimAutoFillHistorical;
window.pns.onSimRowCostChange = onSimRowCostChange;
window.pns.onSimSliderChange = onSimSliderChange;
window.pns.exportSimulationCsv = exportSimulationCsv;
window.pns.printSimulationReport = printSimulationReport;
window.pns.onSimTableSearch = onSimTableSearch;
window.pns.onSimSearchUnitKeyup = onSimSearchUnitKeyup;
window.pns.onSimAddFromSearch = onSimAddFromSearch;
window.pns.initUniversalTableSorter = initUniversalTableSorter;

// Auto-run when module is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePbiApp);
} else {
    initializePbiApp();
}



