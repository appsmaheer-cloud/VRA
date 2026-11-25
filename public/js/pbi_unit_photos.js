/**
 * PNS VRA & FLEET ENTERPRISE — UNIFIED REAL-PHOTO 3D & HD GALLERY MODULE
 * Single unified media controller for Profil Unit (#view-vra-4) & Studio Lightbox:
 * - Preloads ./cache/unit_photos/manifest.json synchronously on startup
 * - Renders ONE unified Media Card (Interactive 3D Real-Photo Perspective + 3-Side Filmstrip)
 * - Full-resolution HD Lightbox with 2x Zoom/Pan & Real-Photo 3D Turntable Tab
 */

import {
    mountRealPhoto3DViewer,
    buildEmptyPhotoBlueprintSvg
} from './pbi_unit_3d.js?v=20261124_r2';

const PHOTO_STORAGE_PREFIX = 'pns_unit_photos_v1_';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/appsmaheer-cloud/VRA/main';

const _manifestMap = new Map();
let _manifestLoaded = false;
let _manifestLoadingPromise = null;
let _showcaseViewMode = '3d'; // '3d' (Real-Photo 3D Stage) | 'grid' (3-Side Flat Strip)
let _activeSlotByUnit = new Map();
let _current3dInstance = null;

function resolvePhotoUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return rawUrl;
    }
    const cleanRel = rawUrl.replace(/^\.\//, '');
    const host = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '';
    const proto = (typeof window !== 'undefined' && window.location) ? window.location.protocol : '';
    const isGas = host.includes('googleusercontent.com') || host.includes('script.google.com') || (typeof google !== 'undefined' && google?.script?.run);
    if (isGas || proto === 'file:') {
        return `${GITHUB_RAW_BASE}/${cleanRel}`;
    }
    return rawUrl;
}

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

if (typeof window !== 'undefined') {
    ensurePhotosManifest();
}

const makeEmptySlotSvgUri = (label) => {
    const isDark = typeof document !== 'undefined' && document.documentElement && document.documentElement.classList.contains('dark');
    const bgFill = isDark ? '#262626' : '#f8fafc';
    const stroke = isDark ? '#444444' : '#d8dce3';
    const txt = isDark ? '#9ca3af' : '#64748b';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200">
        <rect width="320" height="200" rx="4" fill="${bgFill}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4,4"/>
        <text x="160" y="98" font-family="Inter,Segoe UI,sans-serif" font-size="12" font-weight="600" fill="${txt}" text-anchor="middle">${label}</text>
        <text x="160" y="118" font-family="Inter,Segoe UI,sans-serif" font-size="10.5" fill="${txt}" opacity="0.75" text-anchor="middle">Belum ada foto</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

let activeModalUnitCode = null;
let currentEditingPhotos = { photo1: null, photo2: null, photo3: null, updated_at: null };

function countSlots(obj) {
    if (!obj) return 0;
    return (obj.photo1 ? 1 : 0) + (obj.photo2 ? 1 : 0) + (obj.photo3 ? 1 : 0);
}

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
    } catch (e) {}

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
                    if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
                } else if (h > maxDim) {
                    w = Math.round((w * maxDim) / h); h = maxDim;
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
    if (subEl) subEl.textContent = unitTitle || 'Kelola 3 Sudut Foto Fisik HD (Maks 1600px)';

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
        if (imgEl) { imgEl.src = dataUrl; imgEl.classList.remove('hidden'); }
        if (emptyEl) emptyEl.classList.add('hidden');
        if (delBtn) delBtn.classList.remove('hidden');
        if (statusPill) {
            statusPill.innerHTML = '<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/70 dark:text-emerald-300 px-2 py-0.5 rounded-[4px] border border-emerald-200 dark:border-emerald-800"><i class="ph-bold ph-check"></i> Terisi</span>';
        }
    } else {
        if (imgEl) { imgEl.src = ''; imgEl.classList.add('hidden'); }
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
            timer: 1800,
            showConfirmButton: false
        });
    }
}

// ---------------------------------------------------------------------------
// UNIFIED DOSSIER MEDIA VIEWER (SINGLE LOCATION IN PROFIL UNIT)
// ---------------------------------------------------------------------------
function getSlotTitle(photos, idx) {
    const defaults = ['', '1. Tampak Depan', '2. Tampak Samping', '3. Mesin / Belakang'];
    const meta = photos?.slots?.[`photo${idx}`];
    if (meta && meta.label) return `${idx}. ${meta.label}`;
    return defaults[idx];
}

function buildSlotsArray(photos) {
    return [1, 2, 3].map(idx => {
        const key = `photo${idx}`;
        const meta = photos.slots ? photos.slots[key] : null;
        const hasPhoto = Boolean(photos[key]);
        const title = getSlotTitle(photos, idx);
        const dimText = (meta && meta.width && meta.height)
            ? `${meta.width}×${meta.height} ${meta.is_hd ? 'HD' : 'Low-Res'}`
            : (hasPhoto ? 'Tersimpan' : 'Kosong');
        return {
            idx,
            key,
            src: photos[key] || makeEmptySlotSvgUri(title),
            hasPhoto,
            title,
            meta,
            isHd: Boolean(meta?.is_hd),
            dimText
        };
    });
}

export function setPhotoShowcaseMode(mode, unitCode) {
    _showcaseViewMode = (mode === 'grid') ? 'grid' : '3d';
    renderUnitPhotoShowcase(unitCode || (window.pns?.getCurrentUnitCode ? window.pns.getCurrentUnitCode() : ''));
}

export function selectShowcaseSlot(unitCode, slotIdx) {
    const norm = String(unitCode || '').trim().toUpperCase();
    const n = Math.max(1, Math.min(3, Number(slotIdx) || 1));
    _activeSlotByUnit.set(norm, n);
    if (_showcaseViewMode === '3d' && _current3dInstance) {
        _current3dInstance.selectSlot(n);
        updateThumbHighlight(norm, n);
    } else {
        previewSlotShowcase(norm, n);
    }
}

function updateThumbHighlight(norm, activeIdx) {
    const container = document.getElementById('pbi-vra4-photo-showcase');
    if (!container) return;
    container.querySelectorAll('[data-thumb-slot]').forEach(btn => {
        const sIdx = Number(btn.getAttribute('data-thumb-slot'));
        if (sIdx === activeIdx) {
            btn.className = 'group relative rounded-[4px] border-2 border-[#0E5E63] dark:border-[#2DD4BF] bg-teal-50/40 dark:bg-teal-950/30 overflow-hidden cursor-pointer text-left transition';
        } else {
            btn.className = 'group relative rounded-[4px] border border-[#D8DCE3] dark:border-[#444444] bg-white dark:bg-[#2A2A2A] opacity-80 hover:opacity-100 overflow-hidden cursor-pointer text-left transition';
        }
    });
}

export function renderUnitPhotoShowcase(unitCode) {
    const container = document.getElementById('pbi-vra4-photo-showcase');
    if (!container) return;

    const norm = String(unitCode || '').trim().toUpperCase();
    const photos = getUnitPhotos(norm);
    const slotsData = buildSlotsArray(photos);
    const activeSlot = _activeSlotByUnit.get(norm) || 1;

    const countBadgeCls = photos.count === 3
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
        : (photos.count > 0
            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
            : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700');

    container.innerHTML = `
        <div class="pns-card p-3 sm:p-3.5 h-full flex flex-col justify-between gap-2.5 border border-[#D8DCE3] dark:border-[#444444]">
            <!-- Media Card Header -->
            <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#D8DCE3] dark:border-[#444444]">
                <div class="flex items-center gap-1.5 min-w-0">
                    <i class="ph-bold ph-cube-focus text-[#0E5E63] dark:text-[#2DD4BF] text-sm shrink-0"></i>
                    <span class="text-xs font-semibold text-slate-900 dark:text-white truncate">Visual 3D &amp; Foto Fisik</span>
                    <span class="px-1.5 py-0.5 rounded-[3px] text-[10px] font-mono font-semibold border ${countBadgeCls}">${photos.count || 0}/3</span>
                    ${photos.quality_tier === 'LOW_RES' ? '<span class="px-1.5 py-0.5 rounded-[3px] text-[9.5px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">Low-Res</span>' : ''}
                </div>
                <div class="flex items-center gap-1">
                    <div class="inline-flex border border-[#D8DCE3] dark:border-[#444444] rounded-[4px] bg-slate-50 dark:bg-[#262626] p-0.5">
                        <button type="button" onclick="window.pns.setPhotoShowcaseMode('3d','${norm}')" class="px-2 py-0.5 text-[10.5px] font-semibold rounded-[3px] cursor-pointer ${_showcaseViewMode === '3d' ? 'bg-[#0E5E63] text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700'}">
                            3D Perspektif
                        </button>
                        <button type="button" onclick="window.pns.setPhotoShowcaseMode('grid','${norm}')" class="px-2 py-0.5 text-[10.5px] font-semibold rounded-[3px] cursor-pointer ${_showcaseViewMode === 'grid' ? 'bg-[#0E5E63] text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700'}">
                            3 Sisi
                        </button>
                    </div>
                    <button type="button" onclick="window.pns.openUnitPhotoModal('${norm}')" class="role-admin-only px-2 py-1 rounded-[4px] text-[10.5px] font-semibold bg-white dark:bg-[#383838] text-[#0E5E63] dark:text-[#2DD4BF] border border-[#D8DCE3] dark:border-[#444444] hover:bg-slate-100 cursor-pointer" title="Unggah / Ganti 3 Foto Unit">
                        <i class="ph-bold ph-camera"></i> Kelola
                    </button>
                </div>
            </div>

            ${photos.note ? `
            <div class="px-2.5 py-1.5 rounded-[4px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[10.5px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5 leading-snug">
                <i class="ph-bold ph-warning-circle shrink-0 mt-0.5"></i>
                <span>${photos.note}</span>
            </div>` : ''}

            <!-- Main Stage: Real-Photo 3D Perspective OR 3-Side Grid -->
            ${_showcaseViewMode === '3d' ? `
                <div id="vra4-real3d-stage-host" class="w-full flex-1 min-h-[255px] flex flex-col"></div>
            ` : `
                <div class="grid grid-cols-3 gap-2">
                    ${slotsData.map(s => `
                        <div onclick="window.pns.previewSlotShowcase('${norm}', ${s.idx})" class="group relative rounded-[4px] border border-[#D8DCE3] dark:border-[#444444] overflow-hidden bg-slate-100 dark:bg-[#222222] cursor-pointer flex flex-col">
                            <div class="aspect-[4/3] w-full overflow-hidden relative">
                                <img src="${s.src}" alt="${s.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200">
                            </div>
                            <div class="p-1.5 bg-white dark:bg-[#303030] border-t border-[#D8DCE3] dark:border-[#444444]">
                                <span class="text-[10.5px] font-semibold text-slate-800 dark:text-slate-200 block truncate">${s.title}</span>
                                <span class="text-[9.5px] font-mono ${s.isHd ? 'text-[#0E5E63] dark:text-[#2DD4BF]' : 'text-slate-400'} block truncate">${s.dimText}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}

            <!-- Unified 3-Angle Thumbnail Strip -->
            <div class="grid grid-cols-3 gap-2 pt-0.5">
                ${slotsData.map(s => {
                    const isAct = s.idx === activeSlot && _showcaseViewMode === '3d';
                    const cls = isAct
                        ? 'border-2 border-[#0E5E63] dark:border-[#2DD4BF] bg-teal-50/40 dark:bg-teal-950/30'
                        : 'border border-[#D8DCE3] dark:border-[#444444] bg-white dark:bg-[#2A2A2A] opacity-85 hover:opacity-100';
                    return `
                        <button type="button" data-thumb-slot="${s.idx}"
                            onclick="window.pns.selectShowcaseSlot('${norm}', ${s.idx})"
                            ondblclick="window.pns.previewSlotShowcase('${norm}', ${s.idx})"
                            class="group relative rounded-[4px] ${cls} overflow-hidden cursor-pointer text-left transition flex items-center gap-2 p-1.5"
                            title="${s.title} (${s.dimText}) — Klik untuk fokus 3D, klik 2x / tombol Zoom untuk layar penuh">
                            <img src="${s.src}" alt="${s.title}" class="w-11 h-8 object-cover rounded-[2px] bg-slate-200 dark:bg-slate-800 shrink-0">
                            <div class="min-w-0 flex-1">
                                <span class="text-[10.5px] font-semibold text-slate-800 dark:text-slate-200 block truncate">${s.title}</span>
                                <span class="text-[9px] font-mono ${s.hasPhoto ? (s.isHd ? 'text-[#0E5E63] dark:text-[#2DD4BF]' : 'text-amber-600 dark:text-amber-400') : 'text-slate-400'} block truncate">${s.dimText}</span>
                            </div>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    if (_showcaseViewMode === '3d') {
        const stageHost = document.getElementById('vra4-real3d-stage-host');
        _current3dInstance = mountRealPhoto3DViewer(stageHost, {
            unitCode: norm,
            slots: slotsData,
            activeSlot,
            tall: false,
            onActiveSlotChange: (newSlotIdx) => {
                _activeSlotByUnit.set(norm, newSlotIdx);
                updateThumbHighlight(norm, newSlotIdx);
            },
            onZoom: (slotIdx) => {
                openUnitStudioModal(norm, { slot: slotIdx, initialTab: 'photos' });
            }
        });
    } else {
        _current3dInstance = null;
    }
}

// ---------------------------------------------------------------------------
// FULLSCREEN HD LIGHTBOX & REAL-PHOTO 3D STUDIO MODAL
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
                        <h3 class="text-xs sm:text-sm font-semibold truncate" id="studio-title">Inspeksi Foto HD &amp; 3D</h3>
                        <p class="text-[10.5px] text-slate-400 font-mono truncate" id="studio-meta">-</p>
                    </div>
                </div>
                <div class="flex items-center gap-1.5">
                    <div class="inline-flex bg-slate-800 rounded-[3px] p-0.5 border border-slate-700">
                        <button type="button" id="studio-tab-photos" class="px-2.5 py-1 rounded-[2px] text-[11px] font-semibold bg-[#0E5E63] text-white cursor-pointer">
                            <i class="ph-bold ph-magnifying-glass-plus mr-1"></i>Zoom HD
                        </button>
                        <button type="button" id="studio-tab-3d" class="px-2.5 py-1 rounded-[2px] text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer">
                            <i class="ph-bold ph-cube-focus mr-1"></i>3D Foto Asli
                        </button>
                    </div>
                    <button type="button" id="studio-zoom-btn" class="px-2 py-1 rounded-[3px] text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer" title="Toggle Zoom 2x">
                        Zoom 2×
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
                    <button type="button" id="studio-prev-btn" class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-[4px] bg-slate-900/75 hover:bg-slate-900 text-white border border-slate-700 flex items-center justify-center cursor-pointer">
                        <i class="ph-bold ph-caret-left text-base"></i>
                    </button>
                    <button type="button" id="studio-next-btn" class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-[4px] bg-slate-900/75 hover:bg-slate-900 text-white border border-slate-700 flex items-center justify-center cursor-pointer">
                        <i class="ph-bold ph-caret-right text-base"></i>
                    </button>
                </div>
                <div id="studio-thumbs" class="p-2.5 bg-white dark:bg-[#2b2b2b] border-t border-[#D8DCE3] dark:border-[#444444] grid grid-cols-3 gap-2 shrink-0"></div>
            </div>

            <div id="studio-pane-3d" class="hidden flex-1 p-3 sm:p-4 bg-slate-50 dark:bg-[#242424] flex flex-col gap-2">
                <div id="studio-3d-canvas-host" class="w-full"></div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">
                    Arahkan kursor atau geser kiri/kanan pada foto asli untuk memutar perspektif 3D antar sudut kendaraan.
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
        _studioState.tx = 0; _studioState.ty = 0;
        applyStudioZoom();
    });

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
    const slotsData = buildSlotsArray(photos);
    const s = slotsData[_studioState.slot - 1] || slotsData[0];

    el.querySelector('#studio-unit-badge').textContent = norm || '-';
    el.querySelector('#studio-title').textContent = s.title;
    el.querySelector('#studio-meta').textContent = s.meta && s.meta.width
        ? `${s.meta.width}×${s.meta.height} px • ${s.meta.kb || 0} KB • ${s.meta.is_hd ? 'Resolusi HD' : 'Resolusi Rendah'}`
        : (s.hasPhoto ? 'Foto Unit Tersimpan' : 'Belum Ada Foto Fisik');

    const img = el.querySelector('#studio-main-img');
    img.src = s.src;
    applyStudioZoom();

    const dlBtn = el.querySelector('#studio-download-btn');
    if (s.hasPhoto) {
        dlBtn.href = s.src;
        dlBtn.setAttribute('download', `${norm}_slot${s.idx}.jpg`);
        dlBtn.classList.remove('hidden');
    } else {
        dlBtn.classList.add('hidden');
    }

    el.querySelector('#studio-thumbs').innerHTML = slotsData.map(it => {
        const activeCls = it.idx === s.idx
            ? 'border-[#0E5E63] dark:border-[#2DD4BF] bg-teal-50/40 dark:bg-teal-950/30'
            : 'border-[#D8DCE3] dark:border-[#444444] bg-white dark:bg-[#303030] opacity-80 hover:opacity-100';
        return `
            <button type="button" onclick="window.pns.selectStudioSlot(${it.idx})" class="flex items-center gap-2 p-1.5 rounded-[4px] border text-left transition cursor-pointer ${activeCls}">
                <img src="${it.src}" alt="${it.title}" class="w-12 h-9 object-cover rounded-[2px] bg-slate-200 dark:bg-slate-800 shrink-0">
                <div class="min-w-0 flex-1">
                    <span class="text-[11px] font-semibold text-slate-800 dark:text-slate-200 block truncate">${it.title}</span>
                    <span class="text-[9.5px] font-mono ${it.isHd ? 'text-[#0E5E63] dark:text-[#2DD4BF]' : 'text-slate-400'} block truncate">${it.dimText}</span>
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
        const photos = getUnitPhotos(_studioState.unitCode);
        mountRealPhoto3DViewer(el.querySelector('#studio-3d-canvas-host'), {
            unitCode: _studioState.unitCode,
            slots: buildSlotsArray(photos),
            activeSlot: _studioState.slot,
            tall: true,
            autoOrbit: false,
            onZoom: (slotIdx) => {
                _studioState.slot = slotIdx;
                switchStudioTab('photos');
            }
        });
        el.querySelector('#studio-title').textContent = `Perspektif 3D Foto Asli — ${_studioState.unitCode}`;
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
    _studioState.zoom = false; _studioState.tx = 0; _studioState.ty = 0;
    renderStudioContents();
}

export function stepStudioSlot(delta) {
    _studioState.slot = ((_studioState.slot - 1 + delta + 3) % 3) + 1;
    _studioState.zoom = false; _studioState.tx = 0; _studioState.ty = 0;
    renderStudioContents();
}

export function openUnitStudioModal(unitCode, opts = {}) {
    const norm = String(unitCode || (window.pns?.getCurrentUnitCode ? window.pns.getCurrentUnitCode() : 'PNS-MBL-02')).trim().toUpperCase();
    _studioState.unitCode = norm;
    _studioState.slot = opts.slot || 1;
    _studioState.zoom = false; _studioState.tx = 0; _studioState.ty = 0;
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
        Swal.fire({ title, imageUrl: imgSrc, imageAlt: title, showCloseButton: true, confirmButtonText: 'Tutup', confirmButtonColor: '#0E5E63' });
    } else {
        window.open(imgSrc, '_blank');
    }
}

export function stepStage3DSlot() {}

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
    window.pns.selectShowcaseSlot = selectShowcaseSlot;
    window.pns.stepStage3DSlot = stepStage3DSlot;
    window.pns.buildEmptyPhotoBlueprintSvg = buildEmptyPhotoBlueprintSvg;
}
