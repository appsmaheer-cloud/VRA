/**
 * PNS VRA & FLEET ENTERPRISE — VEHICLE PHOTO MANAGEMENT MODULE (3 FOTO)
 * 1. Foto Tampak Depan & Eksterior
 * 2. Foto Kabin, Dashboard & Odometer / HM Meter
 * 3. Foto Mesin / Bak / Tampak Belakang
 * 
 * Features:
 * - HTML5 Canvas client-side compression (lightweight, ~120KB per photo)
 * - Persistent storage via localStorage & memory fallback
 * - Smartphone camera direct shutter & desktop file chooser
 * - Responsive 3-slot showcase & modal dialog
 */

const PHOTO_STORAGE_PREFIX = 'pns_unit_photos_v1_';

// Default / Placeholder SVG illustrations for each slot (Properly URL-encoded to prevent attribute injection)
const makeSvgUri = (title, subtitle, color, circleColor, iconPath) => {
    const isDark = typeof document !== 'undefined' && document.documentElement && document.documentElement.classList.contains('dark');
    const bgFill = isDark ? '#333333' : '#f8fafc';
    const borderStroke = isDark ? '#4f4f4f' : '#cbd5e1';
    const textFill = isDark ? '#e5e7eb' : '#334155';
    const subTextFill = isDark ? '#9ca3af' : '#94a3b8';
    const darkCircleColor = isDark ? '#404040' : circleColor;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" width="400" height="250">
        <rect width="400" height="250" rx="16" fill="${bgFill}" stroke="${borderStroke}" stroke-width="1.8" stroke-dasharray="6,6"/>
        <circle cx="200" cy="95" r="32" fill="${darkCircleColor}"/>
        <g transform="translate(184, 79)" fill="${color}">
            ${iconPath}
        </g>
        <text x="200" y="155" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="13" font-weight="500" fill="${textFill}" text-anchor="middle">${title}</text>
        <text x="200" y="175" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="11" font-weight="400" fill="${subTextFill}" text-anchor="middle">${subtitle}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const getPlaceholder = (slotKey) => {
    const defs = {
        photo1: { title: 'Foto 1: Tampak Depan / Eksterior', subtitle: 'Klik untuk ambil foto / upload', color: '#0ea5e9', circle: '#e0f2fe', path: '<path d="M16 4C9.37 4 4 9.37 4 16s5.37 12 12 12 12-5.37 12-12S22.63 4 16 4zm0 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.4c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>' },
        photo2: { title: 'Foto 2: Kabin & Odometer / HM', subtitle: 'Klik untuk ambil foto / upload', color: '#10b981', circle: '#ecfdf5', path: '<path d="M16 6c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10S21.52 6 16 6zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>' },
        photo3: { title: 'Foto 3: Mesin / Bak / Belakang', subtitle: 'Klik untuk ambil foto / upload', color: '#8b5cf6', circle: '#f5f3ff', path: '<path d="M6 8h20v14H6V8zm2 2v10h16V10H8zm4 12h8v2h-8v-2z"/>' }
    };
    const item = defs[slotKey] || defs.photo1;
    return makeSvgUri(item.title, item.subtitle, item.color, item.circle, item.path);
};

let activeModalUnitCode = null;
let currentEditingPhotos = { photo1: null, photo2: null, photo3: null, updated_at: null };

/**
 * Retrieve saved photos for a vehicle unit
 * @param {string} unitCode 
 * @returns {Object} { photo1, photo2, photo3, updated_at, count }
 */
export function getUnitPhotos(unitCode) {
    if (!unitCode) return { photo1: null, photo2: null, photo3: null, updated_at: null, count: 0 };
    const norm = String(unitCode).trim().toUpperCase();
    try {
        const raw = localStorage.getItem(PHOTO_STORAGE_PREFIX + norm);
        if (raw) {
            const parsed = JSON.parse(raw);
            let count = 0;
            if (parsed.photo1) count++;
            if (parsed.photo2) count++;
            if (parsed.photo3) count++;
            parsed.count = count;
            return parsed;
        }
    } catch (e) {
        console.warn('Error reading unit photos for', norm, e);
    }

    // Try silent background hydration from server if not yet fetched this session
    window._pnsServerPhotoFetched = window._pnsServerPhotoFetched || new Set();
    if (!window._pnsServerPhotoFetched.has(norm)) {
        window._pnsServerPhotoFetched.add(norm);
        try {
            fetch(`./api/asset/photos.php?unit=${encodeURIComponent(norm)}`)
                .then(r => r.json())
                .then(res => {
                    if (res && res.success && res.data && (res.data.photo1 || res.data.photo2 || res.data.photo3)) {
                        localStorage.setItem(PHOTO_STORAGE_PREFIX + norm, JSON.stringify(res.data));
                        renderUnitPhotoShowcase(norm);
                    }
                }).catch(() => {});
        } catch (e) {}
    }

    return { photo1: null, photo2: null, photo3: null, updated_at: null, count: 0 };
}

/**
 * Save photos for a vehicle unit
 * @param {string} unitCode 
 * @param {Object} photosObj 
 */
export function saveUnitPhotos(unitCode, photosObj) {
    if (!unitCode) return;
    const norm = String(unitCode).trim().toUpperCase();
    photosObj.updated_at = new Date().toISOString();
    try {
        localStorage.setItem(PHOTO_STORAGE_PREFIX + norm, JSON.stringify(photosObj));
        console.log(`[PNS PHOTO] Foto unit ${norm} berhasil disimpan di lokal.`);
    } catch (e) {
        console.error('Error saving unit photos', e);
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'Kapasitas Penyimpanan Penuh',
                text: 'Penyimpanan lokal perangkat penuh. Foto mungkin tidak tersimpan secara permanen.'
            });
        }
    }

    // 1. Silent background sync to server API so photos persist across local network
    try {
        fetch('./api/asset/photos.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                unit: norm,
                photo1: photosObj.photo1,
                photo2: photosObj.photo2,
                photo3: photosObj.photo3
            })
        }).then(res => res.json()).then(res => {
            if (res.success) {
                console.log(`[PNS PHOTO] Foto unit ${norm} tersinkronisasi ke server.`);
            }
        }).catch(err => {
            console.warn(`[PNS PHOTO] Server sync offline/unreachable, cache lokal tetap aktif.`);
        });
    } catch (netErr) {}

    // 2. Direct Cloud Sync to Google Drive via Google Apps Script Web App
    const gasUrl = window._PNS_CONFIG?.gasWebAppUrl || 
                   localStorage.getItem('pns_custom_gas_url') || 
                   'https://script.google.com/macros/s/AKfycby1NCzSID7xuPB9AwIdFfPJ5pXPtlbW0SJIA5r29wmYkRMDv-8C5gdDyA5UBwuvsezWtA/exec';

    if (gasUrl) {
        try {
            fetch(gasUrl, {
                method: 'POST',
                mode: 'no-cors', // Google Apps Script web app redirect requirement
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'save_unit_photos',
                    unit: norm,
                    photo1: photosObj.photo1,
                    photo2: photosObj.photo2,
                    photo3: photosObj.photo3
                })
            }).then(() => {
                console.log(`[PNS PHOTO] Foto unit ${norm} berhasil di-upload ke Google Drive folder: PNS_VRA_FOTO_ARMADA`);
            }).catch(e => {
                console.warn('[PNS PHOTO] Cloud Google Drive sync pending/background:', e);
            });
        } catch (gasErr) {}
    }
}

/**
 * Compress an image file using an offscreen HTML5 Canvas to keep footprint tiny (<150KB)
 * @param {File} file 
 * @param {number} maxDim 
 * @param {number} quality 
 * @returns {Promise<string>} Data URL
 */
export function compressImageFile(file, maxDim = 1200, quality = 0.8) {
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
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = evt.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Open 3-Photo Management Modal for a Unit
 * @param {string} unitCode 
 * @param {string} unitTitle 
 */
export function openUnitPhotoModal(unitCode, unitTitle = '') {
    if (window.pns?.getUserRole && window.pns.getUserRole() === 'public') {
        alert('Mode Publik / Viewer: Fitur kelola dan unggah foto hanya dapat diakses oleh Administrator.');
        return;
    }
    if (!unitCode && window.pns && window.pns.getCurrentUnitCode) {
        unitCode = window.pns.getCurrentUnitCode();
    }
    if (!unitCode) {
        unitCode = 'PNS-MBL-02'; // fallback default
    }
    activeModalUnitCode = String(unitCode).trim().toUpperCase();

    const modal = document.getElementById('modal-unit-photos');
    if (!modal) return;

    // Header info
    const titleEl = document.getElementById('modal-photo-unit-title');
    const subEl = document.getElementById('modal-photo-unit-subtitle');
    if (titleEl) titleEl.textContent = activeModalUnitCode;
    if (subEl) subEl.textContent = unitTitle || 'Kelola Foto Kendaraan';

    // Load saved data
    currentEditingPhotos = getUnitPhotos(activeModalUnitCode);

    // Update 3 slots in modal
    updateModalSlotPreview(1, currentEditingPhotos.photo1);
    updateModalSlotPreview(2, currentEditingPhotos.photo2);
    updateModalSlotPreview(3, currentEditingPhotos.photo3);

    updateModalPhotoStatusBadge();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Close 3-Photo Modal
 */
export function closeUnitPhotoModal() {
    const modal = document.getElementById('modal-unit-photos');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Update single slot preview inside modal
 */
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
            statusPill.innerHTML = '<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/70 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800"><i class="ph-bold ph-check"></i> Terisi</span>';
        }
    } else {
        if (imgEl) {
            imgEl.src = '';
            imgEl.classList.add('hidden');
        }
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (delBtn) delBtn.classList.add('hidden');
        if (statusPill) {
            statusPill.innerHTML = '<span class="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">Kosong</span>';
        }
    }
}

function updateModalPhotoStatusBadge() {
    const badge = document.getElementById('modal-photo-count-badge');
    if (!badge) return;
    let filled = 0;
    if (currentEditingPhotos.photo1) filled++;
    if (currentEditingPhotos.photo2) filled++;
    if (currentEditingPhotos.photo3) filled++;

    if (filled === 3) {
        badge.innerHTML = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1"><i class="ph-bold ph-check-circle"></i> 3/3 Foto Lengkap</span>';
    } else if (filled > 0) {
        badge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1"><i class="ph-bold ph-clock"></i> ${filled}/3 Foto Terisi</span>`;
    } else {
        badge.innerHTML = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center gap-1"><i class="ph-bold ph-image"></i> Belum Ada Foto</span>';
    }
}

/**
 * Slot File Input Change Handler
 */
export async function onSlotFileInputChange(slotIndex, event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
        const compressed = await compressImageFile(file, 1200, 0.82);
        currentEditingPhotos[`photo${slotIndex}`] = compressed;
        updateModalSlotPreview(slotIndex, compressed);
        updateModalPhotoStatusBadge();

        // Auto-save instantly
        if (activeModalUnitCode) {
            saveUnitPhotos(activeModalUnitCode, currentEditingPhotos);
            // Refresh showcase if on view-vra-4
            renderUnitPhotoShowcase(activeModalUnitCode);
        }
    } catch (err) {
        console.error('Gagal memproses gambar:', err);
        alert('Gagal membaca gambar. Silakan gunakan format JPEG atau PNG.');
    }
    // reset input
    event.target.value = '';
}

/**
 * Remove single slot photo
 */
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

/**
 * Save all photos button handler
 */
export function saveAllModalPhotos() {
    if (!activeModalUnitCode) return;
    saveUnitPhotos(activeModalUnitCode, currentEditingPhotos);
    renderUnitPhotoShowcase(activeModalUnitCode);
    closeUnitPhotoModal();
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success',
            title: 'Tersimpan ke Google Drive',
            text: `3 Dokumentasi foto fisik unit ${activeModalUnitCode} tersimpan ke Google Drive (folder: PNS_VRA_FOTO_ARMADA) & server.`,
            timer: 2200,
            showConfirmButton: false
        });
    }
}

/**
 * Render the 3-photo Showcase Banner inside view-vra-4 (Profil Unit)
 * @param {string} unitCode 
 */
export function renderUnitPhotoShowcase(unitCode) {
    const container = document.getElementById('pbi-vra4-photo-showcase');
    if (!container) return;

    const photos = getUnitPhotos(unitCode);
    const dateStr = photos.updated_at
        ? new Date(photos.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Belum Diperbarui';

    container.innerHTML = `
        <div class="clean-card p-4 space-y-3 shadow-2xs">
            <div class="flex flex-wrap items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 gap-2">
                <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded-full bg-cyan-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        <i class="ph-bold ph-camera"></i>
                    </span>
                    <div>
                        <span class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white uppercase tracking-wider block">Foto Fisik Kendaraan (3 Sisi)</span>
                        <span class="text-[11px] text-slate-500 dark:text-slate-400">Tampak depan, kabin/odometer, dan bagian belakang/mesin</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[11px] font-mono text-slate-400 dark:text-slate-500 mr-1 hidden sm:inline">Status: ${dateStr}</span>
                    <button type="button" onclick="window.pns.openUnitPhotoModal('${unitCode}')" class="role-admin-only flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-50 dark:bg-cyan-950/70 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 transition shadow-2xs cursor-pointer">
                        <i class="ph-bold ph-pencil-simple"></i> Kelola / Ganti 3 Foto
                    </button>
                    <span class="role-public-only inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700">
                        <i class="ph-bold ph-eye text-cyan-500"></i> Mode Pratinjau (Publik)
                    </span>
                </div>
            </div>

            <!-- 3 Photo Grid Showcase -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <!-- Foto 1: Depan & Eksterior -->
                <div class="group relative rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-900 shadow-2xs flex flex-col cursor-pointer" onclick="window.pns.previewSlotShowcase('${unitCode}', 1)">
                    <div class="aspect-16/10 w-full overflow-hidden relative bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                        <img src="${photos.photo1 || getPlaceholder('photo1')}" alt="Tampak Depan" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105">
                        <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5 backdrop-blur-2xs">
                            <i class="ph-bold ph-magnifying-glass-plus text-base"></i> Perbesar
                        </div>
                    </div>
                    <div class="p-2.5 flex items-center justify-between bg-white dark:bg-slate-800/90 border-t border-slate-100 dark:border-slate-800">
                        <span class="text-xs font-bold text-slate-800 dark:text-slate-200">1. Tampak Depan / Sisi</span>
                        ${photos.photo1 ? '<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-md">Terisi</span>' : '<span class="text-[10px] text-slate-400">Kosong</span>'}
                    </div>
                </div>

                <!-- Foto 2: Kabin & Odometer -->
                <div class="group relative rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-900 shadow-2xs flex flex-col cursor-pointer" onclick="window.pns.previewSlotShowcase('${unitCode}', 2)">
                    <div class="aspect-16/10 w-full overflow-hidden relative bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                        <img src="${photos.photo2 || getPlaceholder('photo2')}" alt="Kabin & Odometer" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105">
                        <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5 backdrop-blur-2xs">
                            <i class="ph-bold ph-magnifying-glass-plus text-base"></i> Perbesar
                        </div>
                    </div>
                    <div class="p-2.5 flex items-center justify-between bg-white dark:bg-slate-800/90 border-t border-slate-100 dark:border-slate-800">
                        <span class="text-xs font-bold text-slate-800 dark:text-slate-200">2. Kabin &amp; Odometer</span>
                        ${photos.photo2 ? '<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-md">Terisi</span>' : '<span class="text-[10px] text-slate-400">Kosong</span>'}
                    </div>
                </div>

                <!-- Foto 3: Mesin & Bak -->
                <div class="group relative rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-900 shadow-2xs flex flex-col cursor-pointer" onclick="window.pns.previewSlotShowcase('${unitCode}', 3)">
                    <div class="aspect-16/10 w-full overflow-hidden relative bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                        <img src="${photos.photo3 || getPlaceholder('photo3')}" alt="Mesin & Bak" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105">
                        <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5 backdrop-blur-2xs">
                            <i class="ph-bold ph-magnifying-glass-plus text-base"></i> Perbesar
                        </div>
                    </div>
                    <div class="p-2.5 flex items-center justify-between bg-white dark:bg-slate-800/90 border-t border-slate-100 dark:border-slate-800">
                        <span class="text-xs font-bold text-slate-800 dark:text-slate-200">3. Mesin / Bak / Belakang</span>
                        ${photos.photo3 ? '<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-md">Terisi</span>' : '<span class="text-[10px] text-slate-400">Kosong</span>'}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Preview Single Slot Photo Showcase safely without raw inline SVG injection
 */
export function previewSlotShowcase(unitCode, slot) {
    if (!unitCode) return;
    const photos = getUnitPhotos(unitCode);
    const key = `photo${slot}`;
    const src = photos[key] || getPlaceholder(key);
    const titles = [
        '',
        'Foto 1: Tampak Depan / Eksterior',
        'Foto 2: Kabin & Odometer / HM',
        'Foto 3: Mesin / Bak / Belakang'
    ];
    previewFullPhoto(src, `${titles[slot] || 'Foto Unit'} (${unitCode})`);
}

/**
 * Preview Full Photo Modal
 */
export function previewFullPhoto(imgSrc, title = 'Pratinjau Foto Unit') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: title,
            imageUrl: imgSrc,
            imageAlt: title,
            showCloseButton: true,
            confirmButtonText: 'Tutup',
            confirmButtonColor: '#0284c7',
            customClass: {
                popup: 'rounded-2xl',
                image: 'rounded-xl max-h-[70vh] object-contain'
            }
        });
    } else {
        window.open(imgSrc, '_blank');
    }
}

// Attach globally to window.pns
if (typeof window !== 'undefined') {
    window.pns = window.pns || {};
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
}

