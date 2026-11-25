/**
 * PNS VRA & FLEET ENTERPRISE — REAL-PHOTO 3D PERSPECTIVE & TURNTABLE ENGINE
 * Builds an interactive 3D spatial inspection viewer directly from real unit photographs
 * (1. Tampak Depan / Body, 2. Tampak Samping / Kabin, 3. Mesin / Belakang):
 *  - Interactive 3D CSS perspective prism/turntable across real photo angles
 *  - Pointer/touch 3D tilt + multi-layer depth parallax + dynamic specular sheen
 *  - Auto-turntable 3D orbit & seamless drag-to-rotate between real vehicle sides
 */

const _activeReal3D = new WeakMap();

/**
 * Clean minimal blueprint placeholder SVG ONLY used when a unit has 0 real photos uploaded.
 */
export function buildEmptyPhotoBlueprintSvg(unitCode = '', isDark = false) {
    const bg = isDark ? '#262626' : '#f8fafc';
    const stroke = isDark ? '#444444' : '#cbd5e1';
    const textMain = isDark ? '#d1d5db' : '#475569';
    const textSub = isDark ? '#9ca3af' : '#94a3b8';
    return `<svg class="w-full h-full" viewBox="0 0 480 300" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="480" height="300" fill="${bg}"/>
        <g stroke="${stroke}" stroke-width="1" opacity="0.55">
            <line x1="0" y1="60" x2="480" y2="60"/><line x1="0" y1="120" x2="480" y2="120"/>
            <line x1="0" y1="180" x2="480" y2="180"/><line x1="0" y1="240" x2="480" y2="240"/>
            <line x1="96" y1="0" x2="96" y2="300"/><line x1="192" y1="0" x2="192" y2="300"/>
            <line x1="288" y1="0" x2="288" y2="300"/><line x1="384" y1="0" x2="384" y2="300"/>
        </g>
        <rect x="140" y="86" width="200" height="108" rx="4" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="5 5"/>
        <text x="240" y="136" font-family="Inter,Segoe UI,sans-serif" font-size="13" font-weight="600" fill="${textMain}" text-anchor="middle">${unitCode || 'UNIT ARMADA'}</text>
        <text x="240" y="158" font-family="Inter,Segoe UI,sans-serif" font-size="11" fill="${textSub}" text-anchor="middle">Belum ada foto fisik lapangan (0/3)</text>
    </svg>`;
}

// Legacy compatibility export so existing callers never fail
export function buildIsometricVehicleSvg(kategori = '', unitCode = '', isDark = false) {
    return buildEmptyPhotoBlueprintSvg(unitCode, isDark);
}

/**
 * Mount an interactive Real-Photo 3D Spatial Viewer inside `container`.
 * Uses actual unit photos (`slots`: array of { idx, src, hasPhoto, title, dimText, isHd })
 * arranged in a 3D perspective turntable with pointer 3D tilt, depth parallax & swipe rotation.
 */
export function mountRealPhoto3DViewer(containerOrId, opts = {}) {
    const container = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!container) return null;

    const prev = _activeReal3D.get(container);
    if (prev && typeof prev.destroy === 'function') prev.destroy();

    const unitCode = String(opts.unitCode || '').trim().toUpperCase();
    const slots = Array.isArray(opts.slots) ? opts.slots : [];
    const filledSlots = slots.filter(s => s && s.hasPhoto && s.src);
    const heightCls = opts.tall ? 'h-[340px] sm:h-[430px]' : 'flex-1 min-h-[255px] sm:min-h-[300px] h-full';

    if (filledSlots.length === 0) {
        const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
        container.innerHTML = `
            <div class="relative w-full ${heightCls} rounded-[4px] border border-[#D8DCE3] dark:border-[#444444] overflow-hidden bg-[#F8FAFC] dark:bg-[#262626] flex items-center justify-center">
                ${buildEmptyPhotoBlueprintSvg(unitCode, isDark)}
            </div>
        `;
        return null;
    }

    let activePos = 0;
    if (opts.activeSlot) {
        const foundIdx = filledSlots.findIndex(s => s.idx === opts.activeSlot);
        if (foundIdx >= 0) activePos = foundIdx;
    }

    let tiltX = 5;
    let tiltY = -8;
    let dragOffsetDeg = 0;
    let autoOrbit = Boolean(opts.autoOrbit);
    let dragging = false;
    let startX = 0, startY = 0;
    let movedPx = 0;
    let orbitTimer = null;
    let rafId = null;
    let destroyed = false;

    container.innerHTML = `
        <div class="relative w-full ${heightCls} rounded-[4px] border border-[#D8DCE3] dark:border-[#444444] bg-[#EEF2F6] dark:bg-[#1E1E1E] overflow-hidden select-none" data-real3d-root>
            <!-- Subtle studio floor horizon & perspective grid -->
            <div class="absolute inset-x-0 bottom-0 h-2/5 pointer-events-none opacity-60"
                 style="background: linear-gradient(to top, rgba(14,94,99,0.10), transparent);"></div>

            <!-- 3D Perspective Stage -->
            <div data-real3d-stage class="relative w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
                 style="perspective: 1150px; transform-style: preserve-3d;">
                ${filledSlots.map((s, idx) => `
                    <div data-real3d-card="${idx}"
                         class="absolute w-[78%] sm:w-[74%] h-[82%] rounded-[4px] border border-white/70 dark:border-[#525252] bg-slate-900 overflow-hidden will-change-transform"
                         style="transform-style: preserve-3d; box-shadow: 0 18px 36px -12px rgba(0,0,0,0.42);">
                        <!-- Ambient blurred depth backplate from the REAL photo -->
                        <img src="${s.src}" alt="" aria-hidden="true"
                             class="absolute inset-0 w-full h-full object-cover scale-110 blur-md opacity-45 pointer-events-none">
                        <!-- Crisp foreground real HD photo -->
                        <img src="${s.src}" alt="${s.title}"
                             class="relative z-10 w-full h-full object-contain pointer-events-none">
                        <!-- Dynamic 3D specular light reflection overlay -->
                        <div data-real3d-sheen class="absolute inset-0 z-20 pointer-events-none opacity-0 transition-opacity duration-200"></div>
                        <!-- Elevated 3D caption bar -->
                        <div class="absolute bottom-2 left-2 right-2 z-30 flex items-center justify-between gap-1.5 px-2.5 py-1 rounded-[3px] bg-slate-950/75 text-white text-[10.5px] pointer-events-none">
                            <span class="font-semibold truncate">${s.title}</span>
                            <span class="font-mono text-[9.5px] text-teal-300 shrink-0">${s.dimText || 'Foto Asli'}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Top-left Live 3D Indicator -->
            <div class="absolute top-2 left-2 z-40 flex items-center gap-1.5 pointer-events-none">
                <span class="px-2 py-0.5 rounded-[3px] text-[9.5px] font-mono font-semibold bg-slate-900/80 text-white border border-white/15">
                    3D FOTO ASLI • ${filledSlots.length} SUDUT
                </span>
            </div>

            <!-- Top-right Controls (Auto-Putar & Zoom HD) -->
            <div class="absolute top-2 right-2 z-40 flex items-center gap-1">
                ${filledSlots.length > 1 ? `
                <button type="button" data-real3d-spin class="px-2 py-1 rounded-[3px] text-[10px] font-semibold ${autoOrbit ? 'bg-[#0E5E63] text-white' : 'bg-white/90 dark:bg-[#303030]/90 text-slate-700 dark:text-slate-200'} border border-[#D8DCE3] dark:border-[#444444] hover:opacity-95 cursor-pointer flex items-center gap-1" title="Putar 3D Otomatis antar Sudut Foto Asli">
                    <i class="ph-bold ph-arrows-clockwise"></i> <span>Putar 3D</span>
                </button>` : ''}
                <button type="button" data-real3d-zoom class="px-2 py-1 rounded-[3px] text-[10px] font-semibold bg-white/90 dark:bg-[#303030]/90 text-[#0E5E63] dark:text-[#2DD4BF] border border-[#D8DCE3] dark:border-[#444444] hover:bg-white cursor-pointer flex items-center gap-1" title="Perbesar Resolusi Penuh (Zoom 2x)">
                    <i class="ph-bold ph-magnifying-glass-plus"></i> <span>Zoom HD</span>
                </button>
            </div>

            <!-- Left / Right 3D Orbit Arrows (when >= 2 real photos) -->
            ${filledSlots.length > 1 ? `
            <button type="button" data-real3d-prev class="absolute left-2 top-1/2 -translate-y-1/2 z-40 w-8 h-8 rounded-[4px] bg-white/90 dark:bg-[#303030]/90 hover:bg-[#0E5E63] hover:text-white text-slate-700 dark:text-slate-200 border border-[#D8DCE3] dark:border-[#444444] flex items-center justify-center cursor-pointer transition" title="Putar ke Sudut Sebelumnya">
                <i class="ph-bold ph-caret-left text-sm"></i>
            </button>
            <button type="button" data-real3d-next class="absolute right-2 top-1/2 -translate-y-1/2 z-40 w-8 h-8 rounded-[4px] bg-white/90 dark:bg-[#303030]/90 hover:bg-[#0E5E63] hover:text-white text-slate-700 dark:text-slate-200 border border-[#D8DCE3] dark:border-[#444444] flex items-center justify-center cursor-pointer transition" title="Putar ke Sudut Berikutnya">
                <i class="ph-bold ph-caret-right text-sm"></i>
            </button>` : ''}
        </div>
    `;

    const rootEl = container.querySelector('[data-real3d-root]');
    const stageEl = container.querySelector('[data-real3d-stage]');
    const cardEls = [...container.querySelectorAll('[data-real3d-card]')];

    const applyTransforms = (animate = true) => {
        if (destroyed) return;
        const n = filledSlots.length;
        cardEls.forEach((card, i) => {
            let rel = i - activePos;
            if (n === 3) {
                if (rel > 1) rel -= 3;
                if (rel < -1) rel += 3;
            }
            const isCenter = rel === 0;
            const baseRotY = rel * -46 + (isCenter ? tiltY + dragOffsetDeg : dragOffsetDeg * 0.45);
            const baseRotX = isCenter ? tiltX : tiltX * 0.35;
            const tx = rel * 56 + (isCenter ? dragOffsetDeg * 0.35 : 0);
            const tz = isCenter ? 18 : -135;
            const scale = isCenter ? 1 : 0.82;
            const opacity = isCenter ? 1 : 0.62;

            card.style.transition = (animate && !dragging)
                ? 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease, border-color 0.25s ease'
                : 'none';
            card.style.transform = `translateX(${tx}%) translateZ(${tz}px) rotateY(${baseRotY.toFixed(2)}deg) rotateX(${baseRotX.toFixed(2)}deg) scale(${scale})`;
            card.style.opacity = String(opacity);
            card.style.zIndex = isCenter ? '30' : (rel < 0 ? '15' : '14');
            card.style.borderColor = isCenter ? '#0E5E63' : '';

            const sheen = card.querySelector('[data-real3d-sheen]');
            if (sheen) {
                if (isCenter) {
                    const gx = Math.round(50 + tiltY * 2.2);
                    const gy = Math.round(50 - tiltX * 2.5);
                    sheen.style.opacity = '1';
                    sheen.style.background = `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.0) 62%)`;
                } else {
                    sheen.style.opacity = '0';
                }
            }
        });
    };

    const selectPos = (nextPos) => {
        const n = filledSlots.length;
        activePos = ((nextPos % n) + n) % n;
        dragOffsetDeg = 0;
        applyTransforms(true);
        if (typeof opts.onActiveSlotChange === 'function') {
            opts.onActiveSlotChange(filledSlots[activePos].idx);
        }
    };

    const stopOrbit = () => {
        autoOrbit = false;
        if (orbitTimer) { clearInterval(orbitTimer); orbitTimer = null; }
        const spinBtn = container.querySelector('[data-real3d-spin]');
        if (spinBtn) {
            spinBtn.classList.remove('bg-[#0E5E63]', 'text-white');
            spinBtn.classList.add('bg-white/90', 'dark:bg-[#303030]/90', 'text-slate-700', 'dark:text-slate-200');
        }
    };

    const startOrbit = () => {
        if (filledSlots.length <= 1) return;
        stopOrbit();
        autoOrbit = true;
        const spinBtn = container.querySelector('[data-real3d-spin]');
        if (spinBtn) {
            spinBtn.classList.add('bg-[#0E5E63]', 'text-white');
            spinBtn.classList.remove('bg-white/90', 'dark:bg-[#303030]/90', 'text-slate-700', 'dark:text-slate-200');
        }
        orbitTimer = setInterval(() => {
            if (!dragging && !destroyed) {
                tiltY = -6;
                tiltX = 4;
                selectPos(activePos + 1);
            }
        }, 2600);
    };

    // Hover 3D tilt tracking on desktop pointer
    const onPointerHover = (e) => {
        if (dragging || e.touches) return;
        const rect = rootEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1; // -1..1
        const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1; // -1..1
        tiltY = nx * 14;
        tiltX = -ny * 10;
        if (!rafId) {
            rafId = requestAnimationFrame(() => {
                rafId = null;
                applyTransforms(false);
            });
        }
    };

    const onPointerLeave = () => {
        if (dragging) return;
        tiltX = 4;
        tiltY = -6;
        applyTransforms(true);
    };

    const onDown = (e) => {
        if (e.target.closest('button')) return;
        dragging = true;
        movedPx = 0;
        stopOrbit();
        const pt = e.touches ? e.touches[0] : e;
        startX = pt.clientX;
        startY = pt.clientY;
    };

    const onMove = (e) => {
        if (!dragging) return;
        const pt = e.touches ? e.touches[0] : e;
        const dx = pt.clientX - startX;
        const dy = pt.clientY - startY;
        movedPx = Math.max(movedPx, Math.hypot(dx, dy));
        dragOffsetDeg = Math.max(-38, Math.min(38, dx * 0.22));
        tiltX = Math.max(-14, Math.min(14, -dy * 0.08));
        applyTransforms(false);
    };

    const onUp = (e) => {
        if (!dragging) return;
        dragging = false;
        if (Math.abs(dragOffsetDeg) > 12 && filledSlots.length > 1) {
            selectPos(dragOffsetDeg < 0 ? activePos + 1 : activePos - 1);
        } else {
            const clickedCard = e.target?.closest?.('[data-real3d-card]');
            if (movedPx < 6 && clickedCard) {
                const idx = Number(clickedCard.getAttribute('data-real3d-card'));
                if (idx !== activePos) {
                    selectPos(idx);
                } else if (typeof opts.onZoom === 'function') {
                    opts.onZoom(filledSlots[activePos].idx);
                }
            } else {
                dragOffsetDeg = 0;
                tiltX = 4;
                tiltY = -6;
                applyTransforms(true);
            }
        }
    };

    stageEl.addEventListener('mousemove', onPointerHover);
    stageEl.addEventListener('mouseleave', onPointerLeave);
    stageEl.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    stageEl.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);

    const prevBtn = container.querySelector('[data-real3d-prev]');
    const nextBtn = container.querySelector('[data-real3d-next]');
    const spinBtn = container.querySelector('[data-real3d-spin]');
    const zoomBtn = container.querySelector('[data-real3d-zoom]');

    if (prevBtn) prevBtn.addEventListener('click', (ev) => { ev.stopPropagation(); stopOrbit(); selectPos(activePos - 1); });
    if (nextBtn) nextBtn.addEventListener('click', (ev) => { ev.stopPropagation(); stopOrbit(); selectPos(activePos + 1); });
    if (spinBtn) spinBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (autoOrbit) stopOrbit(); else startOrbit();
    });
    if (zoomBtn) zoomBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (typeof opts.onZoom === 'function') opts.onZoom(filledSlots[activePos].idx);
    });

    applyTransforms(false);
    if (autoOrbit) startOrbit();

    const instance = {
        selectSlot(slotIdx) {
            const pos = filledSlots.findIndex(s => s.idx === Number(slotIdx));
            if (pos >= 0) {
                stopOrbit();
                selectPos(pos);
            }
        },
        destroy() {
            destroyed = true;
            stopOrbit();
            if (rafId) cancelAnimationFrame(rafId);
            stageEl.removeEventListener('mousemove', onPointerHover);
            stageEl.removeEventListener('mouseleave', onPointerLeave);
            stageEl.removeEventListener('mousedown', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            stageEl.removeEventListener('touchstart', onDown);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
        }
    };
    _activeReal3D.set(container, instance);
    return instance;
}

// Keep alias name so external references remain compatible
export const mountUnit3DViewer = mountRealPhoto3DViewer;

if (typeof window !== 'undefined') {
    window.pns = window.pns || {};
    window.pns.mountRealPhoto3DViewer = mountRealPhoto3DViewer;
    window.pns.mountUnit3DViewer = mountRealPhoto3DViewer;
    window.pns.buildIsometricVehicleSvg = buildIsometricVehicleSvg;
}
