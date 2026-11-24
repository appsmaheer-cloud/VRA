/**
 * PNS VRA & FLEET ENTERPRISE — HD VEHICLE PHOTO & 3D STUDIO MODULE
 * 1. Tampak Depan / Eksterior Utama
 * 2. Tampak Samping / Kabin & Odometer
 * 3. Kompartemen Mesin / Bak / Belakang
 *
 * Features:
 * - Synchronous preloaded HD manifest (./cache/unit_photos/manifest.json + GitHub Raw CDN fallback)
 * - HD client-side compression up to 1600px @ 0.90 JPEG for admin uploads
 * - 3D Spatial Carousel Showcase (Grid HD <-> Stage 3D toggle)
 * - Interactive HD Lightbox (1x/2x zoom + pan, arrow navigation, EXIF/resolution badge) + 3D Orbit Studio
 */

import {
    mountUnit3DViewer,
    detectUnitModelType,
    getUnitModelLabel
} from './pbi_unit_3d.js?v=20261124';

const PHOTO_STORAGE_PREFIX = 'pns_unit_photos_v1_';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/appsmaheer-cloud/VRA/main';

// Runtime manifest cache hydrated from ./cache/unit_photos/manifest.json
const _manifestMap = new Map();
let _manifestLoaded = false;
let _manifestLoadingPromise = null;
let _showcaseViewMode = 'grid'; // 'grid' | 'stage3d'
let _stage3dActiveSlot = 1;

function resolvePhotoUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return rawUrl;
    }
    const cleanRel = rawUrl.replace(/^\.\//, '');
    const host = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '';
    const proto = (typeof window !== 'undefined' && window.location) ? window.location.protocol : '';
    const isGas = host.includes('googleusercontent.com') || host.includes('script.google.com') || typeof google !== 'undefined' && google?.script?.run;
    if (isGas || proto === 'file:') {
        return `${GITHUB_RAW_BASE}/${cleanRel}`;
    }
    return rawUrl;
}

/**
 * Preload lightweight photo manifest once so every unit lookup is synchronous & instant.
 */
export function ensurePhotosManifest() {
    if (_manifestLoaded) return Promise.resolve(_manifestMap);
    if (_manifestLoadingPromise) return _manifestLoadingPromise;

    const host = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '';
    const proto = (typeof window !== 'undefined' && window.location) ? window.location.protocol : '';
    const isStaticOrGas = host.includes('github.io') || host.includes('googleusercontent.com') || host.includes('script.google.com') || proto === 'file:';

    const candidates = isStaticOrGas
        ? [`${GITHUB_RAW_BASE}/cache/unit_photos/manifest.json`, './cache/unit_photos/manifest.json']
        : ['./cache/unit_photos/manifest.json', './api/asset/photos.php', `${GITHUB_RAW_BASE}/cache/unit_photos/manifest.json`];

    _manifestLoadingPromise = (async () => {
        for (const url of candidates) {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (!res.ok) continue;
                const json = await res.json();
                const units = (json && json.units) ? json.units : (json && json.data ? json.data : null);
                if (units && typeof units === 'object') {
                    Object.keys(units).forEach(k => {
                        const norm = String(k).trim().toUpperCase();
                        const rec = { ...units[k], unit: norm };
                        ['photo1', 'photo2', 'photo3'].forEach(sk => {
                            if (rec[sk]) rec[sk] = resolvePhotoUrl(rec[sk]);
                            if (rec.slots && rec.slots[sk] && rec.slots[sk].url) {
                                rec.slots[sk].url = resolvePhotoUrl(rec.slots[sk].url);
                            }
                        });
                        _manifestMap.set(norm, rec);
                    });
                    _manifestLoaded = true;
                    break;
                }
            } catch (e) {}
        }

        if (_manifestLoaded && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pns:photos-manifest-ready', { detail: { count: _manifestMap.size } }));
            // Re-render current VRA-4 unit showcase & photo count pill immediately if visible
            const curUnit = window.pns?.getCurrentUnitCode ? window.pns.getCurrentUnitCode() : '';
            if (curUnit) {
                renderUnitPhotoShowcase(curUnit);
                const kpiEl = document.getElementById('vra4-kpi-photo-count');
                if (kpiEl) {
                    const p = getUnitPhotos(curUnit);
                    kpiEl.textContent = `${p.count || 0}/3 Foto`;
                }
            }
        }
        return _manifestMap;
    })();

    return _manifestLoadingPromise;
}

// Kick off manifest hydration immediately on load
if (typeof window !== 'undefined') {
    ensurePhotosManifest();
}

const makeSvgUri = (title, subtitle, color, circleColor, iconPath) => {
    const isDark = typeof document !== 'undefined' && document.documentElement && document.documentElement.classList.contains('dark');
    const bgFill = isDark ? '#303030' : '#f8fafc';
    const borderStroke = isDark ? '#444444' : '#d8dce3';
    const textFill = isDark ? '#e5e7eb' : '#334155';
    const subTextFill = isDark ? '#9ca3af' : '#64748b';
    const darkCircleColor = isDark ? '#3b3b3b' : circleColor;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="400" height="260">
        <rect width="400" height="260" rx="6" fill="${bgFill}" stroke="${borderStroke}" stroke-width="1.5" stroke-dasharray="5,5"/>
        <circle cx="200" cy="100" r="30" fill="${darkCircleColor}"/>
        <g transform="translate(184, 84)" fill="${color}">${iconPath}</g>
        <text x="200" y="158" font-family="Inter,Segoe UI,sans-serif" font-size="13" font-weight="600" fill="${textFill}" text-anchor="middle">${title}</text>
        <text x="200" y="178" font-family="Inter,Segoe UI,sans-serif" font-size="11" font-weight="400" fill="${subTextFill}" text-anchor="middle">${subtitle}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const getPlaceholder = (slotKey, isAdmin = false) => {
    const defs = {
        photo1: { title: 'Foto 1: Tampak Depan / Eksterior', color: '#0e5e63', circle: '#e0f2fe', path: '<path d="M16 4C9.37 4 4 9.37 4 16s5.37 12 12 12 12-5.37 12-12S22.63 4 16 4zm0 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.4c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>' },
        photo2: { title: 'Foto 2: Samping / Kabin / Meter', color: '#0284c7', circle: '#ecfdf5', path: '<path d="M16 6c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10S21.52 6 16 6zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>' },
        photo3: { title: 'Foto 3: Mesin / Bak / Belakang', color: '#475569', circle: '#f1f5f9', path: '<path d="M6 8h20v14H6V8zm2 2v10h16V10H8zm4 12h8v2h-8v-2z"/>' }
    };
    const item = defs[slotKey] || defs.photo1;
    return makeSvgUri(item.title, isAdmin ? 'Klik untuk unggah foto HD' : 'Dokumentasi foto belum tersedia', item.color, item.circle, item.path);
};

let activeModalUnitCode = null;
let currentEditingPhotos = { photo1: null, photo2: null, photo3: null, updated_at: null };

function countSlots(obj) {
    if (!obj) return 0;
    let c = 0;
    if (obj.photo1) c++;
    if (obj.photo2) c++;
    if (obj.photo3) c++;
    return c;
}

/**
 * Retrieve merged HD manifest + local Admin overrides for a vehicle unit.
 * @param {string} unitCode
 * @returns {Object} { unit, photo1, photo2, photo3, slots, count, hd_count, quality_tier, note, updated_at }
 */
export function getUnitPhotos(unitCode) {
    if (!unitCode) return { photo1: null, photo2: null, photo3: null, slots: {}, updated_at: null, count: 0, hd_count: 0, quality_tier: 'EMPTY' };
    const norm = String(unitCode).trim().toUpperCase();

    const baseManifest = _manifestMap.get(norm) || null;
    let localOverride = null;
    try {
        const raw = localStorage.getItem(PHOTO_STORAGE_PREFIX + norm);
        if (raw) localOverride = JSON.parse(raw);
    } catch (e) {}

    if (localOverride) {
        const merged = {
            ...(baseManifest || {}),
            ...localOverride,
            unit: norm,
            photo1: localOverride.photo1 !== undefined ? resolvePhotoUrl(localOverride.photo1) : (baseManifest?.photo1 || null),
            photo2: localOverride.photo2 !== undefined ? resolvePhotoUrl(localOverride.photo2) : (baseManifest?.photo2 || null),
            photo3: localOverride.photo3 !== undefined ? resolvePhotoUrl(localOverride.photo3) : (baseManifest?.photo3 || null),
            slots: baseManifest?.slots || {}
        };
        merged.count = countSlots(merged);
        return merged;
    }

    if (baseManifest) {
        return { ...baseManifest, count: countSlots(baseManifest) };
    }

    // Background server hydration for non-manifest local uploads (when on PHP server)
    const host = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '';
    const canPhpApi = (typeof window !== 'undefined' && window.location)
        && (window.location.protocol === 'http:' || window.location.protocol === 'https:')
        && !host.includes('github.io')
        && !host.includes('googleusercontent.com')
        && !host.includes('script.google.com');

    if (canPhpApi) {
        window._pnsServerPhotoFetched = window._pnsServerPhotoFetched || new Set();
        if (!window._pnsServerPhotoFetched.has(norm)) {
            window._pnsServerPhotoFetched.add(norm);
            fetch(`./api/asset/photos.php?unit=${encodeURIComponent(norm)}`)
                .then(r => r.ok ? r.json() : null)
                .then(res => {
                    if (res && res.success && res.data && (res.data.photo1 || res.data.photo2 || res.data.photo3)) {
                        _manifestMap.set(norm, {
                            ...res.data,
                            unit: norm,
                            photo1: resolvePhotoUrl(res.data.photo1),
                            photo2: resolvePhotoUrl(res.data.photo2),
                            photo3: resolvePhotoUrl(res.data.photo3),
                            count: countSlots(res.data)
                        });
                        renderUnitPhotoShowcase(norm);
                    }
                }).catch(() => {});
        }
    }

    return { unit: norm, photo1: null, photo2: null, photo3: null, slots: {}, updated_at: null, count: 0, hd_count: 0, quality_tier: 'EMPTY' };
}

/**
 * Save photos for a vehicle unit (Admin action)
 */
export function saveUnitPhotos(unitCode, photosObj) {
    if (!unitCode) return;
    const norm = String(unitCode).trim().toUpperCase();
    const record = {
        unit: norm,
        photo1: photosObj.photo1 || null,
        photo2: photosObj.photo2 || null,
        photo3: photosObj.photo3 || null,
        count: countSlots(photosObj),
        updated_at: new Date().toISOString()
    };

    try {
        localStorage.setItem(PHOTO_STORAGE_PREFIX + norm, JSON.stringify(record));
    } catch (e) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'Kapasitas Penyimpanan Penuh',
                text: 'Penyimpanan lokal penuh. Unggahan tetap disinkronkan ke server.'
            });
        }
    }

    fetch('./api/asset/photos.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
    }).catch(() => {});

    const gasUrl = window._PNS_CONFIG?.gasWebAppUrl ||
        localStorage.getItem('pns_custom_gas_url') ||
        'https://script.google.com/macros/s/AKfycby1NCzSID7xuPB9AwIdFfPJ5pXPtlbW0SJIA5r29wmYkRMDv-8C5gdDyA5UBwuvsezWtA/exec';

    if (gasUrl) {
        fetch(gasUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'save_unit_photos', ...record })
        }).catch(() => {});
    }
}

/**
 * Compress an uploaded image to HD JPEG standard (max 1600px, quality 0.90)
 */
export function compressImageFile(file, maxDim = 1600, quality = 0.90) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            return reject(new Error('File bukan gambar'));
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                if (w > h) {
                    if (w > maxDim) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    }
                } else {
                    if (h > maxDim) {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = evt.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Open 3-Photo Admin Upload/Manage Modal
 */
export function openUnitPhotoModal(unitCode, unitTitle = '') {
    if (window.pns?.getUserRole && window.pns.getUserRole() === 'public') {
        const targetCode = unitCode || (window.pns?.getCurrentUnitCode ? window.pns.getCurrentUnitCode() : 'PNS-MBL-02');
        openUnitStudioModal(targetCode, { initialTab: 'photos' });
        return;
    }
    if (!unitCode && window.pns && window.pns.getCurrentUnitCode) {
        unitCode = window.pns.getCurrentUnitCode();
    }
    if (!unitCode) unitCode = 'PNS-MBL-02';
    activeModalUnitCode = String(unitCode).trim().toUpperCase();

    const modal = document.getElementById('modal-unit-photos');
    if (!modal) return;

    const titleEl = document.getElementById('modal-photo-unit-title');
    const subEl = document.getElementById('modal-photo-unit-subtitle');
    if (titleEl) titleEl.textContent = activeModalUnitCode;
    if (subEl) subEl.textContent = unitTitle || 'Kelola Foto Dokumentasi HD (Maks 1600px)';

    currentEditingPhotos = getUnitPhotos(activeModalUnitCode);
    updateModalSlotPreview(1, currentEditingPhotos.photo1);
    updateModalSlotPreview(2, currentEditingPhotos.photo2);
    updateModalSlotPreview(3, currentEditingPhotos.photo3);
    updateModalPhotoStatusBadge();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function closeUnitPhotoModal() {
    const modal = document.getElementById('modal-unit-photos');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function updateModalSlotPreview(slotIndex, dataUrl) {
    const imgEl = document.getElementById(`modal-photo-preview-${slotIndex}`);
    const emptyEl = document.getElementById(`modal-photo-empty-${slotIndex}`);
    const delBtn = document.getElementById(`btn-del-photo-${slotIndex}`);
    const statusPill = document.getElementById(`slot-status-pill-${slotIndex}`);

    if (dataUrl) {
        if (imgEl) {
            imgEl.src = dataUrl;
            imgEl.classList.remove('hidden');
        }
        if (emptyEl) emptyEl.classList.add('hidden');
        if (delBtn) delBtn.classList.remove('hidden');
        if (statusPill) {
            statusPill.innerHTML = '<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/70 dark:text-emerald-300 px-2 py-0.5 rounded-[4px] border border-emerald-200 dark:border-emerald-800"><i class="ph-bold ph-check"></i> Terisi</span>';
        }
    } else {
        if (imgEl) {
            imgEl.src = '';
            imgEl.classList.add('hidden');
        }
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (delBtn) delBtn.classList.add('hidden');
        if (statusPill) {
            statusPill.innerHTML = '<span class="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-[4px] border border-slate-200 dark:border-slate-700">Kosong</span>';
        }
    }
}

function updateModalPhotoStatusBadge() {
    const badge = document.getElementById('modal-photo-count-badge');
    if (!badge) return;
    const filled = countSlots(currentEditingPhotos);
    if (filled === 3) {
        badge.innerHTML = '<span class="px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">3/3 Lengkap</span>';
    } else if (filled > 0) {
        badge.innerHTML = `<span class="px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">${filled}/3 Terisi</span>`;
    } else {
        badge.innerHTML = '<span class="px-2 py-0.5 rounded-[4px] text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Belum Ada Foto</span>';
    }
}

export async function onSlotFileInputChange(slotIndex, event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
        const compressed = await compressImageFile(file, 1600, 0.90);
        currentEditingPhotos[`photo${slotIndex}`] = compressed;
        updateModalSlotPreview(slotIndex, compressed);
        updateModalPhotoStatusBadge();
        if (activeModalUnitCode) {
            saveUnitPhotos(activeModalUnitCode, currentEditingPhotos);
            renderUnitPhotoShowcase(activeModalUnitCode);
        }
    } catch (err) {
        console.error('Gagal memproses gambar:', err);
        alert('Gagal membaca gambar. Gunakan format JPEG atau PNG.');
    }
    event.target.value = '';
}

export function removeSlotPhoto(slotIndex) {
    if (!confirm(`Hapus Foto ${slotIndex} untuk unit ini?`)) return;
    currentEditingPhotos[`photo${slotIndex}`] = null;
    updateModalSlotPreview(slotIndex, null);
    updateModalPhotoStatusBadge();
    if (activeModalUnitCode) {
        saveUnitPhotos(activeModalUnitCode, currentEditingPhotos);
        renderUnitPhotoShowcase(activeModalUnitCode);
    }
}

export function saveAllModalPhotos() {
    if (!activeModalUnitCode) return;
    saveUnitPhotos(activeModalUnitCode, currentEditingPhotos);
    renderUnitPhotoShowcase(activeModalUnitCode);
    closeUnitPhotoModal();
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success',
            title: 'Foto HD Tersimpan',
            text: `Dokumentasi foto unit ${activeModalUnitCode} berhasil diperbarui.`,
            timer: 2000,
            showConfirmButton: false
        });
    }
}

// ---------------------------------------------------------------------------
// SHOWCASE VIEW RENDERER (Grid HD & Interactive Stage 3D)
// ---------------------------------------------------------------------------
function formatResBadge(slotMeta, hasPhoto) {
    if (!hasPhoto) return '<span class="text-[10px] text-slate-400">Kosong</span>';
    if (!slotMeta || !slotMeta.width || !slotMeta.height) {
        return '<span class="text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-[3px] border border-emerald-200 dark:border-emerald-800">Tersimpan</span>';
    }
    const dimText = `${slotMeta.width}×${slotMeta.height}`;
    if (slotMeta.is_hd) {
        return `<span class="text-[9.5px] font-mono font-semibold text-[#0E5E63] dark:text-[#2DD4BF] bg-teal-50 dark:bg-teal-950/50 px-1.5 py-0.5 rounded-[3px] border border-teal-200 dark:border-teal-800" title="${dimText} px (${slotMeta.kb || 0} KB)">${dimText} HD</span>`;
    }
    return `<span class="text-[9.5px] font-mono font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded-[3px] border border-amber-200 dark:border-amber-800" title="Di bawah standar HD 720p (${dimText} px)">${dimText} Low-Res</span>`;
}

function getSlotTitle(photos, idx) {
    const defaultTitles = ['', '1. Tampak Depan / Eksterior', '2. Tampak Samping / Kabin', '3. Mesin / Bak / Belakang'];
    const meta = photos?.slots?.[`photo${idx}`];
    if (meta && meta.label) return `${idx}. ${meta.label}`;
    return defaultTitles[idx];
}

export function setPhotoShowcaseMode(mode, unitCode) {
    _showcaseViewMode = mode === 'stage3d' ? 'stage3d' : 'grid';
    renderUnitPhotoShowcase(unitCode || (window.pns?.getCurrentUnitCode ? window.pns.getCurrentUnitCode() : ''));
}

export function stepStage3DSlot(deltaOrSlot, unitCode, absolute = false) {
    if (absolute) {
        _stage3dActiveSlot = Math.max(1, Math.min(3, Number(deltaOrSlot) || 1));
    } else {
        _stage3dActiveSlot = ((_stage3dActiveSlot - 1 + deltaOrSlot + 3) % 3) + 1;
    }
    renderUnitPhotoShowcase(unitCode || (window.pns?.getCurrentUnitCode ? window.pns.getCurrentUnitCode() : ''));
}

export function renderUnitPhotoShowcase(unitCode) {
    const container = document.getElementById('pbi-vra4-photo-showcase');
    if (!container) return;

    const norm = String(unitCode || '').trim().toUpperCase();
    const photos = getUnitPhotos(norm);
    const isAdmin = !(window.pns?.getUserRole && window.pns.getUserRole() === 'public');
    const dateStr = photos.updated_at
        ? new Date(photos.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Belum Diperbarui';

    const slotsData = [1, 2, 3].map(idx => {
        const key = `photo${idx}`;
        const meta = photos.slots ? photos.slots[key] : null;
        return {
            idx,
            key,
            src: photos[key] || getPlaceholder(key, isAdmin),
            hasPhoto: Boolean(photos[key]),
            title: getSlotTitle(photos, idx),
            meta,
            resBadge: formatResBadge(meta, Boolean(photos[key]))
        };
    });

    const headerHtml = `
        <div class="flex flex-wrap items-center justify-between pb-2.5 border-b border-[#D8DCE3] dark:border-[#444444] gap-2">
            <div class="flex items-center gap-2 min-w-0">
                <span class="w-6 h-6 rounded-[4px] bg-[#0E5E63] text-white font-semibold text-xs flex items-center justify-center shrink-0">
                    <i class="ph-bold ph-images"></i>
                </span>
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white tracking-tight">Dokumentasi Foto HD &amp; Tampilan 3D</span>
                        <span class="px-1.5 py-0.5 rounded-[3px] text-[10px] font-mono font-semibold ${photos.count === 3 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800' : (photos.count > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800' : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700')}">${photos.count || 0}/3 Foto</span>
                        ${photos.quality_tier === 'LOW_RES' ? '<span class="px-1.5 py-0.5 rounded-[3px] text-[10px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800">Perlu Update HD</span>' : ''}
                    </div>
                    <span class="text-[11px] text-slate-500 dark:text-slate-400 block truncate">Klik foto untuk Zoom HD 2× atau beralih ke Stage 3D &amp; Model 3D</span>
                </div>
            </div>
            <div class="flex items-center flex-wrap gap-1.5">
                <div class="inline-flex border border-[#D8DCE3] dark:border-[#444444] rounded-[4px] bg-slate-50 dark:bg-[#262626] p-0.5">
                    <button type="button" onclick="window.pns.setPhotoShowcaseMode('grid','${norm}')" class="px-2 py-1 text-[11px] font-semibold rounded-[3px] transition cursor-pointer ${_showcaseViewMode === 'grid' ? 'bg-[#0E5E63] text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'}">
                        <i class="ph-bold ph-grid-four mr-1"></i>Grid HD
                    </button>
                    <button type="button" onclick="window.pns.setPhotoShowcaseMode('stage3d','${norm}')" class="px-2 py-1 text-[11px] font-semibold rounded-[3px] transition cursor-pointer ${_showcaseViewMode === 'stage3d' ? 'bg-[#0E5E63] text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'}">
                        <i class="ph-bold ph-cube mr-1"></i>Stage 3D
                    </button>
                </div>
                <button type="button" onclick="window.pns.openUnitStudioModal('${norm}', { initialTab: '3d' })" class="flex items-center gap-1 px-2.5 py-1 rounded-[4px] text-[11px] font-semibold bg-white dark:bg-[#383838] text-[#2D4A94] dark:text-[#60A5FA] border border-[#D8DCE3] dark:border-[#444444] hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer">
                    <i class="ph-bold ph-cube-transparent"></i> Model 3D
                </button>
                <button type="button" onclick="window.pns.openUnitPhotoModal('${norm}')" class="role-admin-only flex items-center gap-1 px-2.5 py-1 rounded-[4px] text-[11px] font-semibold bg-white dark:bg-[#383838] text-[#0E5E63] dark:text-[#2DD4BF] border border-[#D8DCE3] dark:border-[#444444] hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer">
                    <i class="ph-bold ph-pencil-simple"></i> Kelola
                </button>
            </div>
        </div>
    `;

    const noteHtml = photos.note ? `
        <div class="px-3 py-1.5 rounded-[4px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <i class="ph-bold ph-warning-circle shrink-0"></i>
            <span>${photos.note}</span>
        </div>
    ` : '';

    let bodyHtml = '';
    if (_showcaseViewMode === 'stage3d') {
        const cards3d = slotsData.map(s => {
            let offset = s.idx - _stage3dActiveSlot;
            if (offset > 1) offset -= 3;
            if (offset < -1) offset += 3;
            const isCenter = offset === 0;
            const translateX = offset * 52;
            const translateZ = isCenter ? 0 : -110;
            const rotateY = offset * -28;
            const opacity = isCenter ? 1 : 0.72;
            const zIndex = isCenter ? 20 : 10;
            return `
                <div onclick="${isCenter ? `window.pns.previewSlotShowcase('${norm}', ${s.idx})` : `window.pns.stepStage3DSlot(${s.idx}, '${norm}', true)`}"
                    style="transform: translateX(${translateX}%) translateZ(${translateZ}px) rotateY(${rotateY}deg); opacity: ${opacity}; z-index: ${zIndex}; transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease;"
                    class="absolute inset-y-2 left-1/2 -ml-[38%] sm:-ml-[24%] w-[76%] sm:w-[48%] rounded-[4px] border ${isCenter ? 'border-[#0E5E63] dark:border-[#2DD4BF]' : 'border-[#D8DCE3] dark:border-[#444444]'} bg-white dark:bg-[#2b2b2b] overflow-hidden cursor-pointer flex flex-col">
                    <div class="relative flex-1 bg-slate-100 dark:bg-[#222222] overflow-hidden flex items-center justify-center">
                        <img src="${s.src}" alt="${s.title}" class="w-full h-full object-contain">
                        <span class="absolute top-2 right-2 px-1.5 py-0.5 rounded-[3px] text-[9.5px] font-mono font-semibold bg-white/90 dark:bg-[#303030]/90 text-slate-700 dark:text-slate-200 border border-[#D8DCE3] dark:border-[#444444]">
                            ${s.meta?.width ? `${s.meta.width}×${s.meta.height}` : `Slot ${s.idx}`}
                        </span>
                    </div>
                    <div class="px-2.5 py-1.5 bg-white dark:bg-[#303030] border-t border-[#D8DCE3] dark:border-[#444444] flex items-center justify-between gap-2 shrink-0">
                        <span class="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">${s.title}</span>
                        ${isCenter ? '<span class="text-[10px] font-semibold text-[#0E5E63] dark:text-[#2DD4BF]">Klik Zoom HD</span>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        bodyHtml = `
            <div class="relative rounded-[4px] border border-[#D8DCE3] dark:border-[#444444] bg-[#F8FAFC] dark:bg-[#262626] p-3">
                <div class="relative h-[260px] sm:h-[300px] overflow-hidden" style="perspective: 1100px; transform-style: preserve-3d;">
                    ${cards3d}
                </div>
                <div class="flex items-center justify-between pt-2 border-t border-[#D8DCE3] dark:border-[#444444] mt-2">
                    <button type="button" onclick="window.pns.stepStage3DSlot(-1, '${norm}', false)" class="px-2.5 py-1 rounded-[4px] text-xs font-semibold border border-[#D8DCE3] dark:border-[#444444] bg-white dark:bg-[#383838] text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer">
                        <i class="ph-bold ph-caret-left mr-1"></i>Sudut Sebelumnya
                    </button>
                    <div class="flex items-center gap-1.5">
                        ${[1,2,3].map(n => `<button type="button" onclick="window.pns.stepStage3DSlot(${n}, '${norm}', true)" class="px-2 py-0.5 rounded-[3px] text-[10px] font-mono font-semibold cursor-pointer ${n === _stage3dActiveSlot ? 'bg-[#0E5E63] text-white' : 'bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">Sisi ${n}</button>`).join('')}
                    </div>
                    <button type="button" onclick="window.pns.stepStage3DSlot(1, '${norm}', false)" class="px-2.5 py-1 rounded-[4px] text-xs font-semibold border border-[#D8DCE3] dark:border-[#444444] bg-white dark:bg-[#383838] text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer">
                        Sudut Berikutnya<i class="ph-bold ph-caret-right ml-1"></i>
                    </button>
                </div>
            </div>
        `;
    } else {
        bodyHtml = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                ${slotsData.map(s => `
                    <div class="group relative rounded-[4px] border border-[#D8DCE3] dark:border-[#444444] overflow-hidden bg-slate-50 dark:bg-[#2a2a2a] flex flex-col cursor-pointer" onclick="window.pns.previewSlotShowcase('${norm}', ${s.idx})">
                        <div class="aspect-[4/3] w-full overflow-hidden relative bg-slate-200 dark:bg-[#222222] flex items-center justify-center">
                            <img src="${s.src}" alt="${s.title}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105">
                            <div class="absolute inset-0 bg-slate-900/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                                <i class="ph-bold ph-magnifying-glass-plus text-base"></i> Perbesar HD
                            </div>
                        </div>
                        <div class="px-2.5 py-2 flex items-center justify-between gap-1.5 bg-white dark:bg-[#303030] border-t border-[#D8DCE3] dark:border-[#444444]">
                            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">${s.title}</span>
                            ${s.resBadge}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    container.innerHTML = `
        <div class="clean-card p-3.5 sm:p-4 space-y-3 border border-[#D8DCE3] dark:border-[#444444]">
            ${headerHtml}
            ${noteHtml}
            ${bodyHtml}
            <div class="flex items-center justify-between text-[10.5px] text-slate-400 dark:text-slate-500 pt-1">
                <span>Status Arsip: ${dateStr} • Unit: <span class="font-mono font-semibold text-slate-600 dark:text-slate-300">${norm}</span></span>
                <span>HD Standard: maks 1600px JPEG</span>
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// HD PHOTO LIGHTBOX & 3D INTERACTIVE STUDIO MODAL
// ---------------------------------------------------------------------------
let _studioState = { unitCode: '', slot: 1, zoom: false, tab: 'photos', tx: 0, ty: 0 };

function ensureStudioModalDom() {
    let el = document.getElementById('pbi-hd-studio-modal');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'pbi-hd-studio-modal';
    el.className = 'fixed inset-0 z-[70] bg-slate-950/85 hidden items-center justify-center p-2 sm:p-4';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
        <div class="bg-white dark:bg-[#2b2b2b] border border-[#D8DCE3] dark:border-[#444444] rounded-[4px] w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
            <div class="px-4 py-2.5 bg-slate-900 dark:bg-[#222222] text-white flex flex-wrap items-center justify-between gap-2 shrink-0 border-b border-slate-700">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="px-2 py-0.5 rounded-[3px] bg-[#0E5E63] text-white font-mono text-xs font-semibold" id="studio-unit-badge">-</span>
                    <div class="min-w-0">
                        <h3 class="text-xs sm:text-sm font-semibold truncate" id="studio-title">Inspeksi Foto HD &amp; Model 3D</h3>
                        <p class="text-[10.5px] text-slate-400 font-mono truncate" id="studio-meta">-</p>
                    </div>
                </div>
                <div class="flex items-center gap-1.5">
                    <div class="inline-flex bg-slate-800 rounded-[3px] p-0.5 border border-slate-700">
                        <button type="button" id="studio-tab-photos" class="px-2.5 py-1 rounded-[2px] text-[11px] font-semibold bg-[#0E5E63] text-white cursor-pointer">
                            <i class="ph-bold ph-image mr-1"></i>Foto HD
                        </button>
                        <button type="button" id="studio-tab-3d" class="px-2.5 py-1 rounded-[2px] text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer">
                            <i class="ph-bold ph-cube mr-1"></i>Model 3D
                        </button>
                    </div>
                    <button type="button" id="studio-zoom-btn" class="px-2 py-1 rounded-[3px] text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer" title="Toggle Zoom 2x">
                        <i class="ph-bold ph-magnifying-glass-plus mr-1"></i>Zoom 2×
                    </button>
                    <a id="studio-download-btn" href="#" download class="px-2 py-1 rounded-[3px] text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer inline-flex items-center" title="Unduh Foto HD">
                        <i class="ph-bold ph-download-simple"></i>
                    </a>
                    <button type="button" id="studio-close-btn" class="w-7 h-7 rounded-[3px] bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer" title="Tutup (Esc)">
                        <i class="ph-bold ph-x"></i>
                    </button>
                </div>
            </div>

            <div id="studio-pane-photos" class="flex-1 flex flex-col min-h-0 bg-slate-100 dark:bg-[#1f1f1f]">
                <div id="studio-img-viewport" class="relative flex-1 min-h-[320px] sm:min-h-[440px] flex items-center justify-center overflow-hidden select-none">
                    <img id="studio-main-img" src="" alt="Preview HD" class="max-w-full max-h-[65vh] object-contain transition-transform duration-150">
                    <button type="button" id="studio-prev-btn" class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-[4px] bg-slate-900/75 hover:bg-slate-900 text-white border border-slate-700 flex items-center justify-center cursor-pointer" title="Foto Sebelumnya">
                        <i class="ph-bold ph-caret-left text-base"></i>
                    </button>
                    <button type="button" id="studio-next-btn" class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-[4px] bg-slate-900/75 hover:bg-slate-900 text-white border border-slate-700 flex items-center justify-center cursor-pointer" title="Foto Berikutnya">
                        <i class="ph-bold ph-caret-right text-base"></i>
                    </button>
                </div>
                <div id="studio-thumbs" class="p-2.5 bg-white dark:bg-[#2b2b2b] border-t border-[#D8DCE3] dark:border-[#444444] grid grid-cols-3 gap-2 shrink-0"></div>
            </div>

            <div id="studio-pane-3d" class="hidden flex-1 p-3 sm:p-4 bg-slate-50 dark:bg-[#242424] flex flex-col gap-2">
                <div id="studio-3d-canvas-host" class="w-full"></div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">
                    Seret model ke kiri/kanan/atas untuk memutar 360° atau gunakan tombol sudut kamera di kiri bawah.
                </p>
            </div>
        </div>
    `;
    document.body.appendChild(el);

    const close = () => {
        el.classList.add('hidden');
        el.classList.remove('flex');
        _studioState.zoom = false;
    };
    el.querySelector('#studio-close-btn').addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });

    el.querySelector('#studio-tab-photos').addEventListener('click', () => switchStudioTab('photos'));
    el.querySelector('#studio-tab-3d').addEventListener('click', () => switchStudioTab('3d'));
    el.querySelector('#studio-prev-btn').addEventListener('click', () => stepStudioSlot(-1));
    el.querySelector('#studio-next-btn').addEventListener('click', () => stepStudioSlot(1));
    el.querySelector('#studio-zoom-btn').addEventListener('click', () => {
        _studioState.zoom = !_studioState.zoom;
        _studioState.tx = 0;
        _studioState.ty = 0;
        applyStudioZoom();
    });

    // Click/drag pan inside zoomed HD image
    const viewport = el.querySelector('#studio-img-viewport');
    let panning = false, px = 0, py = 0;
    viewport.addEventListener('mousedown', (e) => {
        if (!_studioState.zoom || e.target.closest('button')) return;
        panning = true; px = e.clientX; py = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
        if (!panning) return;
        _studioState.tx += (e.clientX - px);
        _studioState.ty += (e.clientY - py);
        px = e.clientX; py = e.clientY;
        applyStudioZoom();
    });
    window.addEventListener('mouseup', () => { panning = false; });

    document.addEventListener('keydown', (e) => {
        if (el.classList.contains('hidden')) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') stepStudioSlot(-1);
        else if (e.key === 'ArrowRight') stepStudioSlot(1);
    });

    return el;
}

function applyStudioZoom() {
    const img = document.getElementById('studio-main-img');
    const btn = document.getElementById('studio-zoom-btn');
    if (!img) return;
    if (_studioState.zoom) {
        img.style.transform = `translate(${_studioState.tx}px, ${_studioState.ty}px) scale(2)`;
        img.style.cursor = 'move';
        if (btn) btn.classList.add('bg-[#0E5E63]', 'text-white');
    } else {
        img.style.transform = 'scale(1)';
        img.style.cursor = 'zoom-in';
        if (btn) btn.classList.remove('bg-[#0E5E63]', 'text-white');
    }
}

function renderStudioContents() {
    const el = ensureStudioModalDom();
    const norm = _studioState.unitCode;
    const photos = getUnitPhotos(norm);
    const slot = _studioState.slot;
    const key = `photo${slot}`;
    const isAdmin = !(window.pns?.getUserRole && window.pns.getUserRole() === 'public');
    const src = photos[key] || getPlaceholder(key, isAdmin);
    const meta = photos.slots ? photos.slots[key] : null;
    const slotTitle = getSlotTitle(photos, slot);

    el.querySelector('#studio-unit-badge').textContent = norm || '-';
    el.querySelector('#studio-title').textContent = slotTitle;
    el.querySelector('#studio-meta').textContent = meta && meta.width
        ? `${meta.width}×${meta.height} px • ${meta.kb || 0} KB • ${meta.is_hd ? 'Resolusi HD' : 'Resolusi Rendah'} (${meta.source_file || ''})`
        : (photos[key] ? 'Dokumentasi Unit Tersimpan' : 'Slot Foto Belum Terisi');

    const img = el.querySelector('#studio-main-img');
    img.src = src;
    applyStudioZoom();

    const dlBtn = el.querySelector('#studio-download-btn');
    if (photos[key]) {
        dlBtn.href = src;
        dlBtn.setAttribute('download', `${norm}_slot${slot}.jpg`);
        dlBtn.classList.remove('hidden');
    } else {
        dlBtn.classList.add('hidden');
    }

    const thumbs = el.querySelector('#studio-thumbs');
    thumbs.innerHTML = [1, 2, 3].map(n => {
        const k = `photo${n}`;
        const tSrc = photos[k] || getPlaceholder(k, isAdmin);
        const tLabel = getSlotTitle(photos, n);
        const activeCls = n === slot
            ? 'border-[#0E5E63] dark:border-[#2DD4BF] bg-teal-50/40 dark:bg-teal-950/30'
            : 'border-[#D8DCE3] dark:border-[#444444] bg-white dark:bg-[#303030] opacity-80 hover:opacity-100';
        return `
            <button type="button" onclick="window.pns.selectStudioSlot(${n})" class="flex items-center gap-2 p-1.5 rounded-[4px] border text-left transition cursor-pointer ${activeCls}">
                <img src="${tSrc}" alt="${tLabel}" class="w-12 h-9 object-cover rounded-[2px] bg-slate-200 dark:bg-slate-800 shrink-0">
                <div class="min-w-0 flex-1">
                    <span class="text-[11px] font-semibold text-slate-800 dark:text-slate-200 block truncate">${tLabel}</span>
                    ${formatResBadge(photos.slots?.[k], Boolean(photos[k]))}
                </div>
            </button>
        `;
    }).join('');
}

function switchStudioTab(tab) {
    const el = ensureStudioModalDom();
    _studioState.tab = tab === '3d' ? '3d' : 'photos';
    const paneP = el.querySelector('#studio-pane-photos');
    const pane3d = el.querySelector('#studio-pane-3d');
    const tabP = el.querySelector('#studio-tab-photos');
    const tab3d = el.querySelector('#studio-tab-3d');
    const zoomBtn = el.querySelector('#studio-zoom-btn');

    if (_studioState.tab === '3d') {
        paneP.classList.add('hidden');
        pane3d.classList.remove('hidden');
        tab3d.className = 'px-2.5 py-1 rounded-[2px] text-[11px] font-semibold bg-[#0E5E63] text-white cursor-pointer';
        tabP.className = 'px-2.5 py-1 rounded-[2px] text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer';
        zoomBtn.classList.add('hidden');
        const host = el.querySelector('#studio-3d-canvas-host');
        const kat = window.pns?.getCurrentUnitCategory ? window.pns.getCurrentUnitCategory(_studioState.unitCode) : '';
        mountUnit3DViewer(host, {
            unitCode: _studioState.unitCode,
            kategori: kat,
            compact: false
        });
        el.querySelector('#studio-title').textContent = `${getUnitModelLabel(detectUnitModelType(kat, _studioState.unitCode))} — ${_studioState.unitCode}`;
    } else {
        pane3d.classList.add('hidden');
        paneP.classList.remove('hidden');
        tabP.className = 'px-2.5 py-1 rounded-[2px] text-[11px] font-semibold bg-[#0E5E63] text-white cursor-pointer';
        tab3d.className = 'px-2.5 py-1 rounded-[2px] text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer';
        zoomBtn.classList.remove('hidden');
        renderStudioContents();
    }
}

export function selectStudioSlot(slot) {
    _studioState.slot = Math.max(1, Math.min(3, Number(slot) || 1));
    _studioState.zoom = false;
    _studioState.tx = 0;
    _studioState.ty = 0;
    renderStudioContents();
}

export function stepStudioSlot(delta) {
    _studioState.slot = ((_studioState.slot - 1 + delta + 3) % 3) + 1;
    _studioState.zoom = false;
    _studioState.tx = 0;
    _studioState.ty = 0;
    renderStudioContents();
}

export function openUnitStudioModal(unitCode, opts = {}) {
    const norm = String(unitCode || (window.pns?.getCurrentUnitCode ? window.pns.getCurrentUnitCode() : 'PNS-MBL-02')).trim().toUpperCase();
    _studioState.unitCode = norm;
    _studioState.slot = opts.slot || 1;
    _studioState.zoom = false;
    _studioState.tx = 0;
    _studioState.ty = 0;
    const el = ensureStudioModalDom();
    el.classList.remove('hidden');
    el.classList.add('flex');
    renderStudioContents();
    switchStudioTab(opts.initialTab === '3d' ? '3d' : 'photos');
}

export function previewSlotShowcase(unitCode, slot) {
    if (!unitCode) return;
    openUnitStudioModal(unitCode, { slot: Number(slot) || 1, initialTab: 'photos' });
}

export function previewFullPhoto(imgSrc, title = 'Pratinjau Foto Unit') {
    const unitCode = (window.pns?.getCurrentUnitCode ? window.pns.getCurrentUnitCode() : '');
    if (unitCode) {
        openUnitStudioModal(unitCode, { slot: 1, initialTab: 'photos' });
        return;
    }
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title,
            imageUrl: imgSrc,
            imageAlt: title,
            showCloseButton: true,
            confirmButtonText: 'Tutup',
            confirmButtonColor: '#0E5E63'
        });
    } else {
        window.open(imgSrc, '_blank');
    }
}

if (typeof window !== 'undefined') {
    window.pns = window.pns || {};
    window.pns.ensurePhotosManifest = ensurePhotosManifest;
    window.pns.getUnitPhotos = getUnitPhotos;
    window.pns.saveUnitPhotos = saveUnitPhotos;
    window.pns.openUnitPhotoModal = openUnitPhotoModal;
    window.pns.closeUnitPhotoModal = closeUnitPhotoModal;
    window.pns.onSlotFileInputChange = onSlotFileInputChange;
    window.pns.removeSlotPhoto = removeSlotPhoto;
    window.pns.saveAllModalPhotos = saveAllModalPhotos;
    window.pns.renderUnitPhotoShowcase = renderUnitPhotoShowcase;
    window.pns.previewFullPhoto = previewFullPhoto;
    window.pns.previewSlotShowcase = previewSlotShowcase;
    window.pns.openUnitStudioModal = openUnitStudioModal;
    window.pns.selectStudioSlot = selectStudioSlot;
    window.pns.setPhotoShowcaseMode = setPhotoShowcaseMode;
    window.pns.stepStage3DSlot = stepStage3DSlot;
}
