/**
 * PNS Enterprise Power BI Interactive SVG KPI Card Engine
 * Generates alive, interactive SVG sparklines, gradient area curves,
 * live pulse markers, interactive hover scrubbers, and radial gauges.
 */

// Format helpers
function formatVal(val, unit = '') {
    if (val === undefined || val === null || isNaN(val)) return '0' + (unit ? ' ' + unit : '');
    if (Math.abs(val) >= 1000000000) return (val / 1000000000).toFixed(1) + 'M' + (unit ? ' ' + unit : '');
    if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(1) + ' Jt' + (unit ? ' ' + unit : '');
    if (Math.abs(val) >= 1000 && unit !== '%') return val.toLocaleString('id-ID') + (unit ? ' ' + unit : '');
    return (Number.isInteger(val) ? val.toString() : val.toFixed(1)) + (unit ? ' ' + unit : '');
}

/**
 * Generate a smooth cubic Bezier path from an array of 2D points [[x0,y0], [x1,y1], ...]
 */
function createSmoothPath(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) return `M ${points[0][0]},${points[0][1]}`;
    if (points.length === 2) {
        return `M ${points[0][0]},${points[0][1]} L ${points[1][0]},${points[1][1]}`;
    }

    let d = `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i != points.length - 2 ? points[i + 2] : p2;

        const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
        const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
        const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
        const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

        d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
}

/**
 * Convert polar coordinates to cartesian (x, y) coordinates
 */
export function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}

/**
 * Generate an SVG arc path string from startAngle to endAngle
 */
export function describeArc(x, y, radius, startAngle, endAngle) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
        "M", start.x.toFixed(2), start.y.toFixed(2), 
        "A", radius.toFixed(2), radius.toFixed(2), 0, largeArcFlag, 0, end.x.toFixed(2), end.y.toFixed(2)
    ].join(" ");
}

/**
 * Renders an interactive Power BI SVG Sparkline with gradient area and hover scrubber
 * @param {string|HTMLElement} container Selector or element
 * @param {Array<number|{label: string, value: number}>} dataPoints 
 * @param {Object} options
 */
export function renderSvgSparkline(container, dataPoints, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const actualWidth = rect.width > 0 ? rect.width : (options.width || 200);
    const actualHeight = rect.height > 0 ? rect.height : (options.height || 46);

    const {
        color = '#06b6d4',
        unit = '',
        showArea = true,
        showPulse = true,
        showTarget = false,
        targetValue = null,
        formatter = null,
        badgeLabel = ''
    } = options;

    const width = actualWidth;
    const height = actualHeight;

    // Normalize data
    let items = [];
    if (!dataPoints || dataPoints.length === 0) {
        // Fallback placeholder trend if no data
        items = [
            { label: 'Jan', value: 30 }, { label: 'Feb', value: 45 },
            { label: 'Mar', value: 42 }, { label: 'Apr', value: 60 },
            { label: 'Mei', value: 55 }, { label: 'Jun', value: 75 }
        ];
    } else {
        items = dataPoints.map((d, i) => {
            if (typeof d === 'number') return { label: `B${i + 1}`, value: d };
            return { label: d.label || d.month || `B${i + 1}`, value: Number(d.value || 0) };
        });
    }

    // Pad if only 1 data point
    if (items.length === 1) {
        items = [{ label: 'Lalu', value: items[0].value * 0.95 }, items[0]];
    }

    const values = items.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = (maxVal - minVal) || (maxVal > 0 ? maxVal * 0.2 : 10);
    const padY = 6;
    const chartHeight = height - padY * 2;

    // Compute coordinate points
    const stepX = (width - 16) / (items.length - 1);
    const points = items.map((d, i) => {
        const x = 8 + i * stepX;
        const normalizedY = (d.value - minVal) / range;
        const y = height - padY - (normalizedY * chartHeight);
        return [x, Math.max(padY, Math.min(height - padY, y))];
    });

    const linePath = createSmoothPath(points);
    const lastPt = points[points.length - 1];
    const firstPt = points[0];
    const areaPath = `${linePath} L ${lastPt[0].toFixed(1)},${height} L ${firstPt[0].toFixed(1)},${height} Z`;

    const gradId = `spark-grad-${Math.random().toString(36).substring(2, 9)}`;
    const glowId = `spark-glow-${Math.random().toString(36).substring(2, 9)}`;

    // Calculate delta MoM
    const prevVal = items.length >= 2 ? items[items.length - 2].value : items[0].value;
    const curVal = items[items.length - 1].value;
    let deltaPct = 0;
    if (prevVal !== 0) {
        deltaPct = ((curVal - prevVal) / Math.abs(prevVal)) * 100;
    }

    // Format display
    const fmt = formatter || ((v) => formatVal(v, unit));

    // Target reference line if requested
    let targetSvg = '';
    if (showTarget && targetValue !== null) {
        const normTargetY = (targetValue - minVal) / range;
        const targetY = Math.max(padY, Math.min(height - padY, height - padY - (normTargetY * chartHeight)));
        targetSvg = `
            <line x1="4" y1="${targetY.toFixed(1)}" x2="${width - 4}" y2="${targetY.toFixed(1)}" 
                  stroke="${color}" stroke-opacity="0.35" stroke-dasharray="3,3" stroke-width="1.2" />
        `;
    }
    el.innerHTML = `
        <div class="relative w-full h-full group/svg select-none overflow-visible">
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${color}" stop-opacity="0.32" />
                        <stop offset="100%" stop-color="${color}" stop-opacity="0.0" />
                    </linearGradient>
                    <filter id="${glowId}" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="${color}" flood-opacity="0.4" />
                    </filter>
                </defs>

                ${targetSvg}

                <!-- Area Fill -->
                ${showArea ? `<path d="${areaPath}" fill="url(#${gradId})" class="transition-opacity duration-300 group-hover/svg:opacity-100 opacity-80 pointer-events-none" />` : ''}

                <!-- Sparkline Stroke -->
                <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" 
                      filter="url(#${glowId})" class="transition-all duration-300" />

                <!-- Scrubber Guide Line (Hidden by default) -->
                <line class="pbi-scrubber-line opacity-0 transition-opacity duration-150 pointer-events-none" 
                      x1="0" y1="2" x2="0" y2="${height - 2}" 
                      stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="2,2" />

                <!-- Highlight tracking point -->
                <circle class="pbi-scrubber-dot opacity-0 transition-all duration-150 pointer-events-none" 
                        cx="0" cy="0" r="4.5" fill="#ffffff" stroke="${color}" stroke-width="2.5" />

                <!-- Pulse Beacon on Latest Point -->
                ${showPulse ? `
                    <g class="pbi-live-beacon transition-opacity duration-200">
                        <circle cx="${lastPt[0].toFixed(1)}" cy="${lastPt[1].toFixed(1)}" r="7" fill="${color}" opacity="0.25" class="animate-ping" style="transform-origin: ${lastPt[0].toFixed(1)}px ${lastPt[1].toFixed(1)}px;" />
                        <circle cx="${lastPt[0].toFixed(1)}" cy="${lastPt[1].toFixed(1)}" r="3.5" fill="${color}" stroke="#ffffff" stroke-width="1.5" />
                    </g>
                ` : `
                    <circle cx="${lastPt[0].toFixed(1)}" cy="${lastPt[1].toFixed(1)}" r="3" fill="${color}" />
                `}
            </svg>

            <!-- Floating Scrubber Tooltip -->
            <div class="pbi-spark-tooltip pointer-events-none opacity-0 transition-all duration-150 absolute -top-8 left-0 z-30 transform -translate-x-1/2 bg-slate-900/90 dark:bg-slate-950/95 text-white backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shadow-lg border border-slate-700/60 whitespace-nowrap flex items-center gap-1.5">
                <span class="pbi-tip-lbl text-slate-300">Trend</span>
                <span class="pbi-tip-val text-cyan-300" style="color: ${color};">0</span>
            </div>
        </div>
    `;

    // Interactive Hover Scrubber Logic
    const wrap = el.querySelector('.group\\/svg');
    const svg = el.querySelector('svg');
    const scrubLine = el.querySelector('.pbi-scrubber-line');
    const scrubDot = el.querySelector('.pbi-scrubber-dot');
    const beacon = el.querySelector('.pbi-live-beacon');
    const tooltip = el.querySelector('.pbi-spark-tooltip');

    if (wrap && svg && scrubLine && scrubDot && tooltip) {
        wrap.addEventListener('mousemove', (e) => {
            const rect = svg.getBoundingClientRect();
            const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const svgX = (relX / rect.width) * width;

            // Find closest point
            let closestIdx = 0;
            let closestDist = Infinity;
            points.forEach((pt, idx) => {
                const dist = Math.abs(pt[0] - svgX);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestIdx = idx;
                }
            });

            const targetPt = points[closestIdx];
            const targetItem = items[closestIdx];

            // Update scrubber line and dot position
            scrubLine.setAttribute('x1', targetPt[0]);
            scrubLine.setAttribute('x2', targetPt[0]);
            scrubLine.classList.remove('opacity-0');

            scrubDot.setAttribute('cx', targetPt[0]);
            scrubDot.setAttribute('cy', targetPt[1]);
            scrubDot.classList.remove('opacity-0');

            if (beacon) beacon.classList.add('opacity-0');

            // Position tooltip
            const pixelX = (targetPt[0] / width) * rect.width;
            tooltip.style.left = `${pixelX}px`;
            tooltip.classList.remove('opacity-0');
            tooltip.querySelector('.pbi-tip-lbl').textContent = targetItem.label + ':';
            tooltip.querySelector('.pbi-tip-val').textContent = fmt(targetItem.value);
        });

        wrap.addEventListener('mouseleave', () => {
            scrubLine.classList.add('opacity-0');
            scrubDot.classList.add('opacity-0');
            tooltip.classList.add('opacity-0');
            if (beacon) beacon.classList.remove('opacity-0');
        });
    }
}

/**
 * Renders an interactive Power BI SVG Circular / Donut Progress Gauge
 * @param {string|HTMLElement} container 
 * @param {number} value (0 - 100)
 * @param {number} targetValue (e.g. 99.73)
 * @param {Object} options
 */
export function renderSvgGauge(container, value = 0, targetValue = 99.73, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;

    const {
        size = 52,
        strokeWidth = 5.5,
        color = '#10b981',
        trackColor = '#e2e8f0',
        unit = '%',
        label = ''
    } = options;

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const semiCircumference = circumference / 2;
    const clampedVal = Math.max(0, Math.min(100, Number(value) || 0));
    // The dash array will be 'length gap'. We want length to be semiCircumference.
    // The dash offset controls how much is hidden. Max offset is semiCircumference (0%), min offset is 0 (100%).
    const offset = semiCircumference - (clampedVal / 100) * semiCircumference;

    // Target tick angle for semi-circle: 180 deg to 360 deg
    const targetAngle = 180 + (Math.max(0, Math.min(100, targetValue || 0)) / 100) * 180;
    const targetRad = (targetAngle * Math.PI) / 180;
    const targetX1 = (size / 2) + (radius - strokeWidth / 2 - 1) * Math.cos(targetRad);
    const targetY1 = (size / 2) + (radius - strokeWidth / 2 - 1) * Math.sin(targetRad);
    const targetX2 = (size / 2) + (radius + strokeWidth / 2 + 1) * Math.cos(targetRad);
    const targetY2 = (size / 2) + (radius + strokeWidth / 2 + 1) * Math.sin(targetRad);

    const gradId = `gauge-grad-${Math.random().toString(36).substring(2, 9)}`;

    el.innerHTML = `
        <div class="relative flex items-center justify-center group/gauge cursor-pointer pb-2" style="width: ${size}px; height: ${size}px;" title="${label || 'Progress'}: ${clampedVal.toFixed(1)}% (Target: ${targetValue}%)">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="transform rotate-180 overflow-visible">
                <defs>
                    <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stop-color="${color}" stop-opacity="0.85" />
                        <stop offset="100%" stop-color="${color}" />
                    </linearGradient>
                </defs>

                <!-- Background Track (Semi-circle) -->
                <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" 
                        fill="none" stroke="${trackColor}" stroke-width="${strokeWidth}" 
                        stroke-dasharray="${semiCircumference} ${circumference}"
                        class="dark:stroke-slate-700/60 opacity-60" />

                <!-- Progress Arc (Semi-circle) -->
                <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" 
                        fill="none" stroke="url(#${gradId})" stroke-width="${strokeWidth}" 
                        stroke-linecap="round"
                        stroke-dasharray="${semiCircumference} ${circumference}" 
                        stroke-dashoffset="${offset}" 
                        class="transition-all duration-1000 ease-out group-hover/gauge:stroke-[${strokeWidth + 1}px]" />

                <!-- Target Tick Notch -->
                <line x1="${targetX1.toFixed(1)}" y1="${targetY1.toFixed(1)}" 
                      x2="${targetX2.toFixed(1)}" y2="${targetY2.toFixed(1)}" 
                      stroke="#f59e0b" stroke-width="2" stroke-linecap="round" 
                      class="transition-transform duration-300" />
            </svg>

            <!-- Center Value Readout -->
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span class="text-[11px] font-black tracking-tighter text-slate-800 dark:text-slate-100 leading-none">
                    ${clampedVal.toFixed(0)}<span class="text-[8px] font-bold opacity-75">%</span>
                </span>
            </div>
        </div>
    `;
}

/**
 * Creates a modern Power BI variance / delta pill element HTML
 */
export function createDeltaPillHtml(deltaPct, isPositiveGood = true) {
    const isUp = deltaPct >= 0;
    const isGood = isPositiveGood ? isUp : !isUp;
    const colorClass = isGood 
        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/40' 
        : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/40';

    const arrowSvg = isUp
        ? `<svg class="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5l5 5h-3v4H6v-4H3l5-5z"/></svg>`
        : `<svg class="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12.5l-5-5h3v-4h4v4h3l-5 5z"/></svg>`;

    return `
        <span class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-extrabold border ${colorClass} tracking-tight">
            ${arrowSvg}${Math.abs(deltaPct).toFixed(1)}% MoM
        </span>
    `;
}

/**
 * Renders an Interactive Power BI Custom SVG Status KPI Matrix & Donut
 * @param {string|HTMLElement} container
 * @param {Array<Object>} categories
 * @param {string} currentFilter
 * @param {Function} onSelect
 */
export function renderSvgInteractiveStatusCards(container, categories = [], currentFilter = 'ALL', onSelect = null) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;

    const totalUnits = categories.reduce((sum, c) => sum + (c.count || 0), 0);

    // Support Set, Array, or String for multi-selection
    let selectedSet = new Set();
    if (currentFilter instanceof Set) {
        selectedSet = new Set(currentFilter);
    } else if (Array.isArray(currentFilter)) {
        selectedSet = new Set(currentFilter);
    } else if (currentFilter && currentFilter !== 'ALL') {
        selectedSet = new Set([currentFilter]);
    }

    const isFiltered = selectedSet.size > 0 && selectedSet.size < categories.length;
    const selectedCategories = categories.filter(c => selectedSet.has(c.key));
    const filteredTotal = selectedCategories.reduce((sum, c) => sum + (c.count || 0), 0);

    // Master Donut SVG calculation
    const r = 40;
    const circ = 2 * Math.PI * r; // 251.327
    let accumPct = 0;

    const svgSegments = categories.map(c => {
        const pct = totalUnits > 0 ? (c.count / totalUnits) * 100 : 0;
        const strokeLen = (pct / 100) * circ;
        const offset = -((accumPct / 100) * circ);
        accumPct += pct;

        const isItemActive = isFiltered ? selectedSet.has(c.key) : true;
        const strokeWidth = isFiltered && selectedSet.has(c.key) ? 14 : 10;
        const opacity = isFiltered ? (selectedSet.has(c.key) ? 1.0 : 0.28) : 1.0;

        return `
            <circle cx="60" cy="60" r="${r}" fill="none"
                    stroke="${c.color}" stroke-width="${strokeWidth}"
                    stroke-dasharray="${strokeLen.toFixed(2)} ${circ.toFixed(2)}"
                    stroke-dashoffset="${offset.toFixed(2)}"
                    opacity="${opacity}"
                    class="transition-all duration-300 cursor-pointer hover:opacity-100 hover:stroke-[14px]"
                    onclick="window.pns.toggleVra2StatusFilter('${c.key}')">
                <title>${c.label}: ${c.count} Unit (${pct.toFixed(1)}%) - Klik untuk Multi-Select</title>
            </circle>
        `;
    }).join('');

    const centerNumber = isFiltered ? filteredTotal : totalUnits;
    const centerLabel = isFiltered ? (selectedSet.size === 1 ? selectedCategories[0].label.toUpperCase() : `${selectedSet.size} STATUS`) : 'TOTAL FLEET';
    const centerColor = isFiltered && selectedCategories.length === 1 ? selectedCategories[0].color : (isFiltered ? '#3b82f6' : '#0284c7');

    const cardsHtml = categories.map(c => {
        const isItemActive = isFiltered && selectedSet.has(c.key);
        const pct = totalUnits > 0 ? (c.count / totalUnits) * 100 : 0;

        return `
            <div onclick="window.pns.toggleVra2StatusFilter('${c.key}')"
                 class="group relative flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                     isItemActive 
                         ? 'shadow-sm border-transparent ring-2 font-medium' 
                         : 'border-slate-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-xs hover:-translate-y-0.5'
                 }"
                 style="${isItemActive ? `background: ${c.activeBg}; ring-color: ${c.color}; --tw-ring-color: ${c.color};` : ''}"
                 title="Klik untuk memilih/membatalkan status: ${c.label} (${c.count} Unit)">
                
                <div class="flex items-center gap-3 min-w-0">
                    <!-- Clean Selection Indicator -->
                    <div class="w-1 h-8 rounded-full shrink-0 transition-all ${
                        isItemActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
                    }" style="background: ${c.color};"></div>

                    <!-- Icon Base -->
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                         style="background: ${c.badgeBg}; color: ${c.color};">
                        ${c.iconSvg}
                    </div>
                    <div class="min-w-0 flex flex-col justify-center">
                        <div class="flex items-center gap-1.5">
                            <span class="text-[13px] font-bold truncate ${isItemActive ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}">
                                ${c.label}
                            </span>
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium block truncate">${c.sublabel}</span>
                    </div>
                </div>

                <div class="flex items-center gap-3 shrink-0 ml-2">
                    <div class="text-right">
                        <span class="text-[14px] font-bold block leading-none ${isItemActive ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}">
                            ${c.count} <span class="text-[10px] text-slate-400 font-normal">Unit</span>
                        </span>
                        <span class="text-[11px] font-semibold block mt-1" style="color: ${c.color};">
                            ${pct.toFixed(1)}%
                        </span>
                    </div>
                    <!-- Custom SVG Mini Progress Ring -->
                    <div class="w-6 h-6 shrink-0 relative flex items-center justify-center">
                        <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="14" stroke="currentColor" stroke-width="3" fill="none" class="text-slate-200 dark:text-slate-700/60" />
                            <circle cx="18" cy="18" r="14" stroke="${c.color}" stroke-width="3.5" fill="none" stroke-linecap="round"
                                    stroke-dasharray="${((pct / 100) * 87.96).toFixed(2)} 87.96"
                                    class="transition-all duration-700 ease-out" />
                        </svg>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    el.innerHTML = `
        <div class="flex flex-col xl:flex-row items-center gap-5 w-full py-2">
            <!-- Interactive Master SVG Donut Gauge -->
            <div class="shrink-0 relative flex items-center justify-center p-1 cursor-pointer group" onclick="window.pns.resetVra2StatusFilter()" title="Klik untuk Reset / Pilih Semua Status Armada">
                <svg width="118" height="118" viewBox="0 0 120 120" class="transform -rotate-90 overflow-visible">
                    <!-- Base Track -->
                    <circle cx="60" cy="60" r="${r}" fill="none" stroke="currentColor" stroke-width="11" class="text-slate-100 dark:text-slate-800/80" />
                    <!-- Slices -->
                    ${svgSegments}
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span class="text-xl font-black font-mono leading-none tracking-tight" style="color: ${centerColor};">
                        ${centerNumber}
                    </span>
                    <span class="text-[8px] font-bold uppercase tracking-wider text-slate-400 mt-1 truncate max-w-[75px]">
                        ${centerLabel}
                    </span>
                </div>
            </div>

            <!-- Custom SVG KPI Cards Grid (Responsive Auto-Fit) -->
            <div class="flex-1 grid gap-3 w-full" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));">
                ${cardsHtml}
            </div>
        </div>
    `;
}


/**
 * Radar / Spider Chart SVG Generator (from KPI reference)
 * @param {string|HTMLElement} container Selector or element
 * @param {Array<string>} axesLabels Array of 4 or more labels
 * @param {Array<number>} values Array of values normalized 0..1
 * @param {Object} options Options: size, color, isDark
 */
export function renderSvgRadarChart(container, axesLabels, values, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return '';

    const {
        size = 110,
        color = '#0284c7',
        fillOpacity = 0.25,
        strokeWidth = 2.2
    } = options;

    const isDark = document.documentElement.classList.contains('dark');
    const gridStroke = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.22)';
    const textFill = isDark ? '#94a3b8' : '#64748b';

    const n = Math.max(3, values.length);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 18;

    let grid = '';
    let labels = '';
    const poly = [];

    // 3 Concentric Polygon rings
    [0.35, 0.7, 1.0].forEach(ring => {
        const pts = [];
        for (let i = 0; i < n; i++) {
            const p = polarToCartesian(cx, cy, r * ring, i * (360 / n));
            pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        }
        grid += `<polygon points="${pts.join(' ')}" fill="none" stroke="${gridStroke}" stroke-width="1" stroke-dasharray="${ring === 1.0 ? 'none' : '2 2'}"/>`;
    });

    // Radial spokes & labels
    for (let i = 0; i < n; i++) {
        const ang = i * (360 / n);
        const edge = polarToCartesian(cx, cy, r, ang);
        const lbl = polarToCartesian(cx, cy, r + 11, ang);
        grid += `<line x1="${cx}" y1="${cy}" x2="${edge.x.toFixed(1)}" y2="${edge.y.toFixed(1)}" stroke="${gridStroke}" stroke-width="1"/>`;
        labels += `<text x="${lbl.x.toFixed(1)}" y="${(lbl.y + 3).toFixed(1)}" font-size="8" font-weight="700" fill="${textFill}" text-anchor="middle" font-family="system-ui, sans-serif">${axesLabels[i] || ''}</text>`;
        
        const val = Math.max(0.05, Math.min(1.0, Number(values[i]) || 0));
        const vp = polarToCartesian(cx, cy, r * val, ang);
        poly.push(`${vp.x.toFixed(1)},${vp.y.toFixed(1)}`);
    }

    const svgHtml = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="overflow-visible select-none">
            ${grid}
            <polygon points="${poly.join(' ')}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
            ${poly.map(pt => `<circle cx="${pt.split(',')[0]}" cy="${pt.split(',')[1]}" r="3" fill="${color}" stroke="#fff" stroke-width="1"/>`).join('')}
            ${labels}
        </svg>
    `;

    el.innerHTML = svgHtml;
    return svgHtml;
}

/**
 * Donut SVG Generator with rounded ends and background track
 */
export function renderSvgDonut(container, pct, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return '';

    const {
        size = 80,
        stroke = 9,
        fg = '#e0179c',
        bg = '#fbdcf0',
        centerText = ''
    } = options;

    const clampedPct = Math.min(Math.max(Number(pct) || 0, 0), 1);
    const r = (size - stroke) / 2;
    const cx = size / 2;
    const cy = size / 2;

    const bgPath = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r}`;
    const fgPath = describeArc(cx, cy, r, 0, 360 * Math.max(0.001, clampedPct));

    const svgHtml = `
        <div class="relative flex items-center justify-center shrink-0" style="width:${size}px; height:${size}px;">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="overflow-visible select-none">
                <path d="${bgPath}" fill="none" stroke="${bg}" stroke-width="${stroke}" stroke-linecap="round"/>
                <path d="${fgPath}" fill="none" stroke="${fg}" stroke-width="${stroke}" stroke-linecap="round"/>
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span class="text-xs font-black font-mono leading-none" style="color:${fg}">
                    ${centerText || Math.round(clampedPct * 100) + '%'}
                </span>
            </div>
        </div>
    `;

    el.innerHTML = svgHtml;
    return svgHtml;
}

/**
 * Calendar Heatmap Mini Generator (for 14-day or 30-day activity pattern)
 */
export function renderSvgCalendarHeatmap(container, daysData, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return '';

    const {
        cols = 7,
        cellSize = 16,
        gap = 3,
        days = 14
    } = options;

    const list = Array.isArray(daysData) ? daysData.slice(-days) : [];
    const isDark = document.documentElement.classList.contains('dark');

    let cells = '';
    list.forEach((d, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * (cellSize + gap);
        const y = row * (cellSize + gap);

        // Color determination
        let color = isDark ? '#334155' : '#e2e8f0'; // Off / No data
        let title = `${d.date || 'Hari ' + (i + 1)}: Off / Kosong`;

        if (d.status === 'OPERATED' || d.status === 'Operating' || (d.running_jam > 0 && !d.is_downtime)) {
            color = '#10b981'; // Operating
            title = `${d.date || 'Hari ' + (i + 1)}: Operating (${Number(d.running_jam || 0).toFixed(1)} Jam)`;
        } else if (d.status === 'Standby' || (d.running_jam === 0 && !d.is_downtime)) {
            color = '#f59e0b'; // Standby
            title = `${d.date || 'Hari ' + (i + 1)}: Standby`;
        } else if (d.is_downtime || (d.status && (d.status.includes('Breakdown') || d.status.includes('Rusak')))) {
            color = '#f43f5e'; // Breakdown / Downtime
            title = `${d.date || 'Hari ' + (i + 1)}: Breakdown / Downtime (${Number(d.downtime_jam || 0).toFixed(1)} Jam)`;
        }

        cells += `
            <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="3" fill="${color}" class="transition hover:opacity-80 cursor-pointer">
                <title>${title}</title>
            </rect>
        `;
    });

    const totalRows = Math.ceil(list.length / cols);
    const totalW = cols * (cellSize + gap) - gap;
    const totalH = totalRows * (cellSize + gap) - gap;

    const svgHtml = `
        <svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" class="overflow-visible select-none">
            ${cells}
        </svg>
    `;

    el.innerHTML = svgHtml;
    return svgHtml;
}

/**
 * Cross-Domain 3 Mini Donuts Group (from Card 5 in KPI reference)
 */
export function renderSvgMiniDonutGroup(container, items, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return '';

    const { size = 58, stroke = 7 } = options;

    const html = `
        <div class="flex items-center justify-around gap-2 w-full py-1">
            ${items.map(it => {
                const pct = Math.min(Math.max(Number(it.pct) || 0, 0), 1);
                const r = (size - stroke) / 2;
                const cx = size / 2;
                const cy = size / 2;
                const bgPath = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r}`;
                const fgPath = describeArc(cx, cy, r, 0, 360 * Math.max(0.001, pct));

                return `
                    <div class="flex flex-col items-center text-center">
                        <span class="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-1 truncate max-w-[70px]">${it.domain}</span>
                        <div class="relative flex items-center justify-center" style="width:${size}px; height:${size}px;">
                            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="overflow-visible">
                                <path d="${bgPath}" fill="none" stroke="${it.bg || '#e2e8f0'}" stroke-width="${stroke}" stroke-linecap="round"/>
                                <path d="${fgPath}" fill="none" stroke="${it.color || '#0284c7'}" stroke-width="${stroke}" stroke-linecap="round"/>
                            </svg>
                            <span class="absolute inset-0 flex items-center justify-center text-[10px] font-black font-mono" style="color:${it.color || '#0284c7'}">
                                ${it.centerText || Math.round(pct * 100) + '%'}
                            </span>
                        </div>
                        <span class="text-[9.5px] font-bold text-slate-600 dark:text-slate-300 mt-1">${it.subText || ''}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    el.innerHTML = html;
    return html;
}

export default {
    renderSvgSparkline,
    renderSvgGauge,
    createDeltaPillHtml,
    renderSvgInteractiveStatusCards,
    renderSvgRadarChart,
    renderSvgDonut,
    renderSvgCalendarHeatmap,
    renderSvgMiniDonutGroup
};

