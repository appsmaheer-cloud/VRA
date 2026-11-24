/**
 * PNS VRA & FLEET ENTERPRISE — INTERACTIVE 3D VEHICLE MODEL & ISOMETRIC VECTOR ENGINE
 * Zero-dependency HTML5 Canvas 3D Polyhedral Projection + Isometric 3D SVG fallback.
 * Tailored for Light & Dark Gray Enterprise UI across fleet categories.
 */

// ---------------------------------------------------------------------------
// 1. ARCHETYPE CLASSIFIER (Category + Unit Code -> Specific 3D Mesh)
// ---------------------------------------------------------------------------
export function detectUnitModelType(kategori = '', unitCode = '') {
    const raw = `${String(kategori || '')} ${String(unitCode || '')}`.toUpperCase();
    const u = String(unitCode || '').toUpperCase();

    if (raw.includes('SBFA') || (raw.includes('AMBULANCE') && (raw.includes('BOAT') || raw.includes('SPEED') || u.includes('SB')))) {
        return 'ambulance_boat';
    }
    if (raw.includes('SPEEDBOAT') || raw.includes('TUGBOAT') || raw.includes('KAPAL') || u.includes('SB-') || u.includes('SBF-') || u.includes('TB-')) {
        return 'boat';
    }
    if (raw.includes('EXCAVATOR') || u.includes('EXC-')) return 'excavator';
    if (raw.includes('TRAKTOR') || raw.includes('TRACTOR') || u.includes('TRK-')) return 'tractor';
    if (raw.includes('FORKLIFT') || u.includes('FL-')) return 'forklift';
    if (raw.includes('TRUCK') || raw.includes('DUMP') || raw.includes('TANGKI') || raw.includes('HINO') || raw.includes('FUSO') || u.includes('MBL-LT') || u.includes('DT-')) {
        return u.includes('LT') ? 'trado' : 'truck';
    }
    if (u.includes('MBLA') || raw.includes('AMBULANCE')) return 'ambulance_car';
    if (u.includes('MTR-35') || raw.includes('VIAR') || raw.includes('RODA 3')) return 'trike';
    if (raw.includes('MOTOR') || u.includes('MTR-') || u.includes('MTRL-') || raw.includes('SEPEDA')) return 'motor';
    if (raw.includes('KNAPSACK') || u.includes('KNAPSACK')) return 'knapsack';
    if (raw.includes('POTONG') || raw.includes('RUMPUT') || u.includes('MPR') || raw.includes('BRUSH') || raw.includes('MOWER')) return 'brushcutter';
    if (raw.includes('GENSET') || raw.includes('POMPA') || raw.includes('ALKON') || u.includes('GS-')) return 'pump';
    if (u.includes('MBL-10') || u.includes('MBL-11') || u.includes('FAC-MBL-02') || raw.includes('HILUX') || raw.includes('TRITON') || raw.includes('PICKUP')) {
        return 'pickup';
    }
    return 'car';
}

export function getUnitModelLabel(type) {
    const labels = {
        ambulance_boat: '3D Ambulance Boat',
        boat: '3D Speedboat / Kapal',
        excavator: '3D Excavator',
        tractor: '3D Tractor',
        forklift: '3D Forklift',
        trado: '3D Lowbed Trado',
        truck: '3D Cargo / Dump Truck',
        ambulance_car: '3D Ambulance Van',
        trike: '3D Motor Roda Tiga',
        motor: '3D Sepeda Motor',
        knapsack: '3D Knapsack Sprayer',
        brushcutter: '3D Mesin Potong Rumput',
        pump: '3D Pompa Alkon / Genset',
        pickup: '3D Double Cabin 4x4',
        car: '3D Mobil Operasional'
    };
    return labels[type] || '3D Unit Armada';
}

// ---------------------------------------------------------------------------
// 2. CRISP 3D ISOMETRIC SVG ENGINE (Immediate fallback / table / SSR)
// ---------------------------------------------------------------------------
export function buildIsometricVehicleSvg(kategori = '', unitCode = '', isDark = false) {
    const type = detectUnitModelType(kategori, unitCode);
    const pTop = isDark ? '#38bdf8' : '#0284c7';
    const pFront = isDark ? '#0284c7' : '#0369a1';
    const pSide = isDark ? '#0369a1' : '#0c4a6e';
    const glass = isDark ? '#cbd5e1' : '#e0f2fe';
    const wheel = isDark ? '#171717' : '#334155';
    const rim = isDark ? '#9ca3af' : '#cbd5e1';
    const floor = isDark ? '#3f3f46' : '#e2e8f0';
    const accent = '#0e7490';

    if (type === 'boat' || type === 'ambulance_boat') {
        const hullSide = type === 'ambulance_boat' ? '#cbd5e1' : pSide;
        const hullDeck = type === 'ambulance_boat' ? '#f8fafc' : pFront;
        const stripe = type === 'ambulance_boat' ? '#dc2626' : '#06b6d4';
        return `<svg class="w-full h-24" viewBox="0 0 220 110" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="110" cy="88" rx="82" ry="12" fill="${floor}" opacity="0.55"/>
            <path d="M24 62 L52 78 L158 78 L188 52 L176 46 L48 52 Z" fill="${hullSide}" stroke="${accent}" stroke-width="1.2"/>
            <path d="M24 62 L48 52 L176 46 L146 66 L52 72 Z" fill="${hullDeck}"/>
            <path d="M40 69 L158 66 L166 59 L46 63 Z" fill="${stripe}" opacity="0.9"/>
            <path d="M74 52 L90 32 L134 30 L146 50 Z" fill="${pTop}"/>
            <polygon points="90,34 114,33 118,48 80,49" fill="${glass}"/>
            <rect x="172" y="42" width="16" height="24" rx="2" fill="${wheel}"/>
            <line x1="180" y1="66" x2="184" y2="79" stroke="${rim}" stroke-width="3" stroke-linecap="round"/>
            ${type === 'ambulance_boat' ? '<rect x="104" y="25" width="16" height="5" rx="1.5" fill="#dc2626"/>' : ''}
        </svg>`;
    }

    if (type === 'truck' || type === 'trado') {
        const cargoColor = type === 'trado' ? '#b45309' : (isDark ? '#15803d' : '#166534');
        const cabColor = type === 'trado' ? '#d97706' : '#65a30d';
        return `<svg class="w-full h-24" viewBox="0 0 220 110" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="112" cy="88" rx="80" ry="11" fill="${floor}" opacity="0.55"/>
            ${type === 'trado'
                ? `<polygon points="34,58 134,58 148,48 50,48" fill="${cargoColor}"/>
                   <polygon points="34,58 134,58 134,68 34,68" fill="#78350f"/>
                   <polygon points="18,44 34,58 34,68 18,52" fill="#92400e"/>`
                : `<polygon points="34,26 128,26 144,18 52,18" fill="${cargoColor}" opacity="0.9"/>
                   <rect x="34" y="26" width="94" height="38" fill="${cargoColor}"/>
                   <polygon points="128,26 144,18 144,54 128,64" fill="#14532d"/>`}
            <polygon points="134,34 168,34 182,42 182,66 134,66" fill="${cabColor}"/>
            <polygon points="134,34 148,26 176,26 182,36 168,34" fill="#a3e635" opacity="0.85"/>
            <polygon points="146,37 170,37 176,48 146,48" fill="${glass}"/>
            <ellipse cx="62" cy="70" rx="11" ry="12" fill="${wheel}"/><ellipse cx="62" cy="70" rx="4.5" ry="5" fill="${rim}"/>
            <ellipse cx="92" cy="70" rx="11" ry="12" fill="${wheel}"/><ellipse cx="92" cy="70" rx="4.5" ry="5" fill="${rim}"/>
            <ellipse cx="158" cy="70" rx="11" ry="12" fill="${wheel}"/><ellipse cx="158" cy="70" rx="4.5" ry="5" fill="${rim}"/>
        </svg>`;
    }

    if (type === 'motor' || type === 'trike') {
        return `<svg class="w-full h-24" viewBox="0 0 220 110" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="110" cy="86" rx="68" ry="10" fill="${floor}" opacity="0.55"/>
            ${type === 'trike'
                ? `<polygon points="34,42 94,42 108,34 48,34" fill="#dc2626"/>
                   <rect x="34" y="42" width="60" height="20" fill="#b91c1c"/>`
                : `<polygon points="62,48 122,42 132,52 72,58" fill="${pTop}"/>`}
            <circle cx="58" cy="68" r="14" stroke="${wheel}" stroke-width="6" fill="none"/>
            <circle cx="58" cy="68" r="5" fill="${rim}"/>
            <circle cx="156" cy="68" r="14" stroke="${wheel}" stroke-width="6" fill="none"/>
            <circle cx="156" cy="68" r="5" fill="${rim}"/>
            <path d="M58 68 L98 50 L132 50 L156 68" stroke="${pFront}" stroke-width="5" stroke-linejoin="round"/>
            <path d="M126 30 L156 68" stroke="${pSide}" stroke-width="5" stroke-linecap="round"/>
            <polygon points="82,42 118,40 124,46 80,48" fill="${wheel}"/>
        </svg>`;
    }

    if (type === 'brushcutter' || type === 'knapsack') {
        const tank = type === 'knapsack' ? '#e2e8f0' : '#eab308';
        const cowl = type === 'knapsack' ? '#dc2626' : '#ea580c';
        return `<svg class="w-full h-24" viewBox="0 0 220 110" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="105" cy="88" rx="64" ry="10" fill="${floor}" opacity="0.55"/>
            <polygon points="48,26 84,26 92,20 56,20" fill="${tank}" stroke="#94a3b8" stroke-width="1"/>
            <rect x="48" y="26" width="36" height="28" rx="4" fill="${cowl}"/>
            <polygon points="84,26 92,20 92,48 84,54" fill="#9a3412"/>
            <rect x="42" y="24" width="6" height="44" rx="2" fill="${wheel}"/>
            <rect x="52" y="20" width="28" height="12" rx="3" fill="${tank}"/>
            <path d="M90 52 C110 66, 130 50, 174 28" stroke="${wheel}" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M126 42 L134 30 L144 37" stroke="${pTop}" stroke-width="3" stroke-linecap="round"/>
            <ellipse cx="176" cy="27" rx="16" ry="6" transform="rotate(-24 176 27)" fill="#94a3b8" stroke="${wheel}" stroke-width="2"/>
        </svg>`;
    }

    if (type === 'pump') {
        return `<svg class="w-full h-24" viewBox="0 0 220 110" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="110" cy="88" rx="68" ry="10" fill="${floor}" opacity="0.55"/>
            <polygon points="48,24 162,24 174,34 60,34" fill="none" stroke="${wheel}" stroke-width="4"/>
            <rect x="48" y="24" width="114" height="52" rx="5" fill="none" stroke="${wheel}" stroke-width="4"/>
            <rect x="64" y="42" width="44" height="30" rx="4" fill="#cbd5e1" stroke="#64748b" stroke-width="1.5"/>
            <rect x="114" y="34" width="36" height="22" rx="4" fill="#dc2626"/>
            <circle cx="86" cy="57" r="10" fill="#64748b"/>
            <rect x="116" y="56" width="32" height="16" rx="2" fill="#475569"/>
        </svg>`;
    }

    // Default SUV / Pickup / Ambulance Van (3D isometric body)
    const bodyTop = type === 'ambulance_car' ? '#f8fafc' : (type === 'pickup' ? '#e2e8f0' : pTop);
    const bodySide = type === 'ambulance_car' ? '#e2e8f0' : (type === 'pickup' ? '#cbd5e1' : pSide);
    const bodyFront = type === 'ambulance_car' ? '#cbd5e1' : (type === 'pickup' ? '#94a3b8' : pFront);
    return `<svg class="w-full h-24" viewBox="0 0 220 110" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="110" cy="88" rx="76" ry="11" fill="${floor}" opacity="0.55"/>
        <polygon points="34,54 146,54 168,44 58,44" fill="${bodyTop}"/>
        <polygon points="34,54 146,54 146,72 34,72" fill="${bodySide}"/>
        <polygon points="146,54 168,44 168,62 146,72" fill="${bodyFront}"/>
        <polygon points="62,32 122,32 136,46 52,46" fill="${bodyTop}" stroke="${accent}" stroke-width="1"/>
        <polygon points="122,32 136,46 146,44 128,31" fill="${glass}"/>
        <polygon points="68,36 116,36 124,46 62,46" fill="${glass}"/>
        ${type === 'ambulance_car' ? '<rect x="86" y="58" width="16" height="4" fill="#dc2626"/><rect x="92" y="52" width="4" height="16" fill="#dc2626"/>' : ''}
        <ellipse cx="64" cy="72" rx="11" ry="12" fill="${wheel}"/><ellipse cx="64" cy="72" rx="4.5" ry="5" fill="${rim}"/>
        <ellipse cx="130" cy="72" rx="11" ry="12" fill="${wheel}"/><ellipse cx="130" cy="72" rx="4.5" ry="5" fill="${rim}"/>
    </svg>`;
}

// ---------------------------------------------------------------------------
// 3. INTERACTIVE 3D POLYHEDRAL CANVAS ENGINE (Zero external libraries)
// ---------------------------------------------------------------------------
function makeBoxFaces(cx, cy, cz, sx, sy, sz, color, shadeFactor = 1) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const v = [
        [cx - hx, cy - hy, cz - hz], // 0
        [cx + hx, cy - hy, cz - hz], // 1
        [cx + hx, cy + hy, cz - hz], // 2
        [cx - hx, cy + hy, cz - hz], // 3
        [cx - hx, cy - hy, cz + hz], // 4
        [cx + hx, cy - hy, cz + hz], // 5
        [cx + hx, cy + hy, cz + hz], // 6
        [cx - hx, cy + hy, cz + hz]  // 7
    ];
    return [
        { pts: [v[0], v[1], v[2], v[3]], n: [0, 0, -1], color, s: 0.90 * shadeFactor }, // back
        { pts: [v[4], v[7], v[6], v[5]], n: [0, 0, 1], color, s: 1.00 * shadeFactor },  // front
        { pts: [v[0], v[3], v[7], v[4]], n: [-1, 0, 0], color, s: 0.80 * shadeFactor }, // left
        { pts: [v[1], v[5], v[6], v[2]], n: [1, 0, 0], color, s: 0.86 * shadeFactor },  // right
        { pts: [v[3], v[2], v[6], v[7]], n: [0, 1, 0], color, s: 1.08 * shadeFactor },  // top
        { pts: [v[0], v[4], v[5], v[1]], n: [0, -1, 0], color, s: 0.65 * shadeFactor }  // bottom
    ];
}

function makeCylinderWheel(cx, cy, cz, r, w, axis, tireColor, rimColor) {
    const faces = [];
    const segs = 12;
    const hw = w / 2;
    const capA = [], capB = [];
    for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const c = Math.cos(a) * r, s = Math.sin(a) * r;
        if (axis === 'z') {
            capA.push([cx + c, cy + s, cz - hw]);
            capB.push([cx + c, cy + s, cz + hw]);
        } else {
            capA.push([cx - hw, cy + s, cz + c]);
            capB.push([cx + hw, cy + s, cz + c]);
        }
    }
    faces.push({ pts: capA, color: tireColor, s: 0.95 });
    faces.push({ pts: capB.slice().reverse(), color: tireColor, s: 0.95 });
    for (let i = 0; i < segs; i++) {
        const n = (i + 1) % segs;
        faces.push({
            pts: [capA[i], capA[n], capB[n], capB[i]],
            color: tireColor,
            s: 0.72
        });
    }
    // Small rim highlight box
    faces.push(...makeBoxFaces(cx, cy, cz, axis === 'x' ? w + 0.04 : r * 0.85, r * 0.85, axis === 'z' ? w + 0.04 : r * 0.85, rimColor, 1));
    return faces;
}

function build3DMeshForUnit(type, isDark) {
    const faces = [];
    const primary = isDark ? '#38bdf8' : '#0284c7';
    const bodyDark = isDark ? '#0369a1' : '#0e5e63';
    const whiteBody = isDark ? '#d1d5db' : '#f1f5f9';
    const glass = isDark ? '#475569' : '#bae6fd';
    const tire = '#1f2937';
    const rim = '#cbd5e1';

    if (type === 'truck' || type === 'trado') {
        const cabCol = type === 'trado' ? '#d97706' : '#65a30d';
        const bedCol = type === 'trado' ? '#92400e' : '#166534';
        // Chassis rail
        faces.push(...makeBoxFaces(-0.1, -0.15, 0, 3.2, 0.2, 1.1, '#334155'));
        // Cabin
        faces.push(...makeBoxFaces(1.15, 0.42, 0, 0.95, 1.05, 1.18, cabCol));
        // Windshield
        faces.push(...makeBoxFaces(1.61, 0.56, 0, 0.08, 0.48, 1.02, glass));
        if (type === 'trado') {
            faces.push(...makeBoxFaces(-0.6, 0.05, 0, 2.2, 0.16, 1.24, bedCol));
            faces.push(...makeBoxFaces(-1.75, 0.25, 0, 0.35, 0.52, 1.1, '#b45309'));
        } else {
            faces.push(...makeBoxFaces(-0.55, 0.58, 0, 2.1, 1.15, 1.24, bedCol));
        }
        for (const x of [-1.2, -0.5, 1.1]) {
            faces.push(...makeCylinderWheel(x, -0.45, 0.62, 0.34, 0.24, 'z', tire, rim));
            faces.push(...makeCylinderWheel(x, -0.45, -0.62, 0.34, 0.24, 'z', tire, rim));
        }
        return faces;
    }

    if (type === 'boat' || type === 'ambulance_boat') {
        const isAmb = type === 'ambulance_boat';
        const hull = isAmb ? whiteBody : primary;
        const deck = isAmb ? '#dc2626' : bodyDark;
        // Tapered V-hull (2 stacked boxes + bow wedge)
        faces.push(...makeBoxFaces(-0.2, -0.15, 0, 2.8, 0.44, 1.25, hull));
        faces.push(...makeBoxFaces(1.45, -0.1, 0, 0.85, 0.38, 0.72, hull));
        faces.push(...makeBoxFaces(-0.2, 0.08, 0, 2.6, 0.08, 1.15, deck));
        // Cabin console
        faces.push(...makeBoxFaces(0.15, 0.42, 0, 1.05, 0.62, 0.92, whiteBody));
        faces.push(...makeBoxFaces(0.66, 0.45, 0, 0.12, 0.36, 0.80, glass));
        // Outboard engine
        faces.push(...makeBoxFaces(-1.72, 0.15, 0, 0.38, 0.55, 0.34, '#334155'));
        faces.push(...makeBoxFaces(-1.76, -0.30, 0, 0.18, 0.52, 0.18, '#64748b'));
        if (isAmb) faces.push(...makeBoxFaces(0.15, 0.78, 0, 0.3, 0.14, 0.5, '#dc2626'));
        return faces;
    }

    if (type === 'motor' || type === 'trike') {
        const tankCol = type === 'trike' ? '#b91c1c' : primary;
        faces.push(...makeBoxFaces(0.05, 0.05, 0, 1.5, 0.38, 0.34, '#334155'));
        faces.push(...makeBoxFaces(0.25, 0.35, 0, 0.55, 0.28, 0.38, tankCol));
        faces.push(...makeBoxFaces(-0.35, 0.30, 0, 0.65, 0.18, 0.32, '#1e293b'));
        faces.push(...makeBoxFaces(0.80, 0.55, 0, 0.14, 0.45, 0.68, '#475569'));
        if (type === 'trike') {
            faces.push(...makeBoxFaces(-0.75, 0.25, 0, 1.35, 0.48, 1.15, '#dc2626'));
            faces.push(...makeCylinderWheel(-0.95, -0.35, 0.62, 0.30, 0.20, 'z', tire, rim));
            faces.push(...makeCylinderWheel(-0.95, -0.35, -0.62, 0.30, 0.20, 'z', tire, rim));
        } else {
            faces.push(...makeCylinderWheel(-0.85, -0.35, 0, 0.34, 0.18, 'z', tire, rim));
        }
        faces.push(...makeCylinderWheel(0.95, -0.35, 0, 0.34, 0.18, 'z', tire, rim));
        return faces;
    }

    if (type === 'brushcutter' || type === 'knapsack') {
        const tankCol = type === 'knapsack' ? '#f8fafc' : '#eab308';
        const cowlCol = type === 'knapsack' ? '#dc2626' : '#ea580c';
        // Frame plate & backpack
        faces.push(...makeBoxFaces(-0.55, 0.20, 0, 0.22, 1.15, 0.85, '#1e293b'));
        faces.push(...makeBoxFaces(-0.25, 0.42, 0, 0.62, 0.72, 0.78, tankCol));
        faces.push(...makeBoxFaces(-0.25, -0.18, 0, 0.56, 0.44, 0.64, cowlCol));
        if (type !== 'knapsack') {
            // Long shaft boom & guard blade
            faces.push(...makeBoxFaces(0.85, -0.18, 0.12, 1.95, 0.08, 0.08, '#94a3b8'));
            faces.push(...makeBoxFaces(0.75, 0.06, 0.12, 0.10, 0.24, 0.55, '#0f172a'));
            faces.push(...makeBoxFaces(1.80, -0.22, 0.12, 0.45, 0.06, 0.45, '#dc2626'));
        }
        return faces;
    }

    if (type === 'pump') {
        // Steel frame + OHV motor + volute housing
        faces.push(...makeBoxFaces(0, -0.45, 0, 1.8, 0.12, 1.15, '#334155'));
        faces.push(...makeBoxFaces(0, 0.55, 0.52, 1.8, 0.10, 0.10, '#334155'));
        faces.push(...makeBoxFaces(0, 0.55, -0.52, 1.8, 0.10, 0.10, '#334155'));
        for (const cx of [-0.85, 0.85]) {
            faces.push(...makeBoxFaces(cx, 0.05, 0.52, 0.10, 1.0, 0.10, '#334155'));
            faces.push(...makeBoxFaces(cx, 0.05, -0.52, 0.10, 1.0, 0.10, '#334155'));
        }
        faces.push(...makeBoxFaces(-0.30, 0.0, 0, 0.75, 0.65, 0.72, '#94a3b8')); // volute
        faces.push(...makeBoxFaces(-0.85, 0.0, 0, 0.35, 0.28, 0.28, '#475569')); // suction
        faces.push(...makeBoxFaces(-0.30, 0.46, 0, 0.26, 0.30, 0.26, '#64748b')); // discharge
        faces.push(...makeBoxFaces(0.35, 0.15, 0, 0.68, 0.42, 0.68, '#dc2626'));  // fuel tank
        faces.push(...makeBoxFaces(0.35, -0.18, 0, 0.62, 0.36, 0.62, '#cbd5e1')); // crankcase
        return faces;
    }

    if (type === 'excavator' || type === 'forklift' || type === 'tractor') {
        const cabCol = '#f59e0b';
        faces.push(...makeBoxFaces(-0.2, -0.1, 0, 1.8, 0.55, 1.2, cabCol));
        faces.push(...makeBoxFaces(-0.35, 0.45, 0, 0.9, 0.65, 1.0, '#1e293b'));
        faces.push(...makeBoxFaces(0.10, 0.48, 0, 0.08, 0.45, 0.85, glass));
        if (type === 'forklift') {
            faces.push(...makeBoxFaces(0.85, 0.45, 0, 0.15, 1.5, 0.9, '#334155'));
            faces.push(...makeBoxFaces(1.25, -0.28, 0, 0.75, 0.08, 0.75, '#64748b'));
        } else {
            faces.push(...makeBoxFaces(0.85, 0.55, 0.25, 0.9, 0.24, 0.22, cabCol));
            faces.push(...makeBoxFaces(1.35, 0.15, 0.25, 0.24, 0.9, 0.24, '#334155'));
        }
        faces.push(...makeCylinderWheel(-0.75, -0.45, 0.60, 0.34, 0.22, 'z', tire, rim));
        faces.push(...makeCylinderWheel(-0.75, -0.45, -0.60, 0.34, 0.22, 'z', tire, rim));
        faces.push(...makeCylinderWheel(0.75, -0.45, 0.60, 0.28, 0.20, 'z', tire, rim));
        faces.push(...makeCylinderWheel(0.75, -0.45, -0.60, 0.28, 0.20, 'z', tire, rim));
        return faces;
    }

    // Default Car / Hilux Double Cabin / Innova / Ambulance Van
    const isPick = type === 'pickup';
    const isAmb = type === 'ambulance_car';
    const chassisCol = isAmb ? whiteBody : (isPick ? '#e2e8f0' : primary);
    // Lower body
    faces.push(...makeBoxFaces(0, 0.0, 0, 2.75, 0.58, 1.22, chassisCol));
    // Cabin top
    if (isPick) {
        faces.push(...makeBoxFaces(0.18, 0.48, 0, 1.15, 0.46, 1.10, chassisCol));
        faces.push(...makeBoxFaces(-0.92, 0.25, 0, 0.92, 0.12, 1.12, '#334155')); // cargo bed
    } else if (isAmb) {
        faces.push(...makeBoxFaces(-0.18, 0.48, 0, 2.05, 0.52, 1.14, chassisCol));
        faces.push(...makeBoxFaces(0.25, 0.80, 0, 0.22, 0.12, 0.55, '#dc2626')); // siren
        faces.push(...makeBoxFaces(-0.20, 0.24, 0.62, 0.40, 0.14, 0.03, '#dc2626')); // red cross h
        faces.push(...makeBoxFaces(-0.20, 0.24, -0.62, 0.40, 0.14, 0.03, '#dc2626'));
    } else {
        faces.push(...makeBoxFaces(-0.15, 0.46, 0, 1.65, 0.45, 1.10, chassisCol));
    }
    // Front grille & windshield
    faces.push(...makeBoxFaces(0.76, 0.46, 0, 0.08, 0.36, 0.98, glass));
    faces.push(...makeBoxFaces(1.38, -0.02, 0, 0.04, 0.30, 0.72, '#1e293b'));
    // 4 wheels
    for (const x of [-0.88, 0.88]) {
        faces.push(...makeCylinderWheel(x, -0.40, 0.62, 0.29, 0.20, 'z', tire, rim));
        faces.push(...makeCylinderWheel(x, -0.40, -0.62, 0.29, 0.20, 'z', tire, rim));
    }
    return faces;
}

function shadeHex(hex, factor) {
    let h = String(hex || '#0284c7').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const num = parseInt(h, 16);
    const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 255) * factor)));
    const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 255) * factor)));
    const b = Math.max(0, Math.min(255, Math.round((num & 255) * factor)));
    return `rgb(${r},${g},${b})`;
}

// Track active canvases so switching units cleans up old animation frames
const _active3dInstances = new WeakMap();

/**
 * Mount interactive 3D orbit canvas inside a container element.
 * Supports mouse & touch drag 360°, camera presets, and optional compact or studio size.
 */
export function mountUnit3DViewer(containerOrId, opts = {}) {
    const container = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!container) return null;

    const prev = _active3dInstances.get(container);
    if (prev && typeof prev.destroy === 'function') prev.destroy();

    const kategori = opts.kategori || '';
    const unitCode = opts.unitCode || '';
    let isDark = opts.isDark ?? (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
    const compact = opts.compact !== false;
    const modelType = detectUnitModelType(kategori, unitCode);
    const modelLabel = getUnitModelLabel(modelType);
    let meshes = build3DMeshForUnit(modelType, isDark);

    const hClass = compact ? 'h-28' : 'h-[320px] sm:h-[380px]';
    container.innerHTML = `
        <div class="relative w-full ${hClass} overflow-hidden select-none rounded-[4px] bg-[#F8FAFC] dark:bg-[#262626] border border-[#D8DCE3] dark:border-[#444444]">
            <canvas class="w-full h-full block cursor-grab active:cursor-grabbing" aria-label="Model 3D ${unitCode}"></canvas>
            <div class="absolute top-1.5 left-1.5 flex items-center gap-1 pointer-events-none">
                <span class="px-1.5 py-0.5 rounded-[3px] text-[9px] font-semibold font-mono bg-white/90 dark:bg-[#303030]/90 text-[#0E5E63] dark:text-[#2DD4BF] border border-[#D8DCE3] dark:border-[#444444]">
                    3D
                </span>
                ${!compact ? `<span class="px-1.5 py-0.5 rounded-[3px] text-[10px] font-medium bg-white/90 dark:bg-[#303030]/90 text-slate-600 dark:text-slate-300 border border-[#D8DCE3] dark:border-[#444444]">${modelLabel}</span>` : ''}
            </div>
            <div class="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 pointer-events-auto">
                <div class="flex items-center gap-1 bg-white/90 dark:bg-[#303030]/90 border border-[#D8DCE3] dark:border-[#444444] rounded-[3px] p-0.5">
                    <button type="button" data-cam="iso" class="px-1.5 py-0.5 text-[9px] font-semibold rounded-[2px] bg-[#0E5E63] text-white cursor-pointer" title="Sudut 3D Isometrik">3D</button>
                    <button type="button" data-cam="front" class="px-1.5 py-0.5 text-[9px] font-semibold rounded-[2px] text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer" title="Tampak Depan">Depan</button>
                    <button type="button" data-cam="side" class="px-1.5 py-0.5 text-[9px] font-semibold rounded-[2px] text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer" title="Tampak Samping">Sisi</button>
                    <button type="button" data-cam="top" class="px-1.5 py-0.5 text-[9px] font-semibold rounded-[2px] text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer" title="Tampak Atas">Atas</button>
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" data-spin class="px-1.5 py-0.5 text-[9px] font-semibold bg-white/90 dark:bg-[#303030]/90 text-slate-600 dark:text-slate-300 border border-[#D8DCE3] dark:border-[#444444] rounded-[3px] hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer" title="Putar 3D Otomatis">
                        <i class="ph-bold ph-arrows-clockwise"></i>
                    </button>
                    ${compact && opts.onExpand ? `
                    <button type="button" data-expand class="px-1.5 py-0.5 text-[9px] font-semibold bg-white/90 dark:bg-[#303030]/90 text-[#0E5E63] dark:text-[#2DD4BF] border border-[#D8DCE3] dark:border-[#444444] rounded-[3px] hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer" title="Buka Studio 3D & Foto HD">
                        <i class="ph-bold ph-cube"></i> Studio
                    </button>` : ''}
                </div>
            </div>
        </div>
    `;

    const canvas = container.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        container.innerHTML = buildIsometricVehicleSvg(kategori, unitCode, isDark);
        return null;
    }

    let yaw = 0.65;
    let pitch = 0.34;
    let autoSpin = !compact;
    let dragging = false;
    let lastX = 0, lastY = 0;
    let rafId = null;
    let destroyed = false;

    const project = (pt, w, h) => {
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const x1 = pt[0] * cy - pt[2] * sy;
        const z1 = pt[0] * sy + pt[2] * cy;
        const y2 = pt[1] * cp - z1 * sp;
        const z2 = pt[1] * sp + z1 * cp;
        const dist = 6.2;
        const scale = Math.min(w, h) * (compact ? 1.15 : 1.05) / (dist - z2);
        return [w / 2 + x1 * scale, h / 2 - y2 * scale - (compact ? 4 : 8), z2];
    };

    const draw = () => {
        if (destroyed) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(180, Math.round(rect.width || container.clientWidth || 220));
        const h = Math.max(96, Math.round(rect.height || container.clientHeight || 112));
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // Subtle architectural grid floor at y = -0.74
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)';
        ctx.lineWidth = 1;
        for (let g = -2; g <= 2; g++) {
            const pA = project([g, -0.74, -1.6], w, h);
            const pB = project([g, -0.74, 1.6], w, h);
            ctx.beginPath(); ctx.moveTo(pA[0], pA[1]); ctx.lineTo(pB[0], pB[1]); ctx.stroke();
        }
        for (let g = -1.5; g <= 1.5; g += 0.75) {
            const pA = project([-2.0, -0.74, g], w, h);
            const pB = project([2.0, -0.74, g], w, h);
            ctx.beginPath(); ctx.moveTo(pA[0], pA[1]); ctx.lineTo(pB[0], pB[1]); ctx.stroke();
        }

        // Depth sort faces back-to-front
        const projected = meshes.map(f => {
            const pts2d = f.pts.map(p => project(p, w, h));
            const avgZ = pts2d.reduce((acc, p) => acc + p[2], 0) / pts2d.length;
            return { f, pts2d, avgZ };
        }).sort((a, b) => a.avgZ - b.avgZ);

        for (const item of projected) {
            const pts = item.pts2d;
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();
            ctx.fillStyle = shadeHex(item.f.color, item.f.s || 1);
            ctx.fill();
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.16)';
            ctx.lineWidth = compact ? 0.7 : 0.9;
            ctx.stroke();
        }

        if (autoSpin && !dragging) {
            yaw += 0.008;
        }
        if (autoSpin || dragging) {
            rafId = requestAnimationFrame(draw);
        } else {
            rafId = null;
        }
    };

    const requestDraw = () => {
        if (!rafId && !destroyed) rafId = requestAnimationFrame(draw);
    };

    const onDown = (e) => {
        dragging = true;
        autoSpin = false;
        const p = e.touches ? e.touches[0] : e;
        lastX = p.clientX;
        lastY = p.clientY;
        requestDraw();
    };
    const onMove = (e) => {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e;
        yaw += (p.clientX - lastX) * 0.012;
        pitch = Math.max(-0.25, Math.min(1.35, pitch + (p.clientY - lastY) * 0.010));
        lastX = p.clientX;
        lastY = p.clientY;
        requestDraw();
    };
    const onUp = () => { dragging = false; };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);

    container.querySelectorAll('[data-cam]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            autoSpin = false;
            const mode = btn.getAttribute('data-cam');
            if (mode === 'iso') { yaw = 0.65; pitch = 0.34; }
            else if (mode === 'front') { yaw = 1.52; pitch = 0.16; }
            else if (mode === 'side') { yaw = 0.0; pitch = 0.16; }
            else if (mode === 'top') { yaw = 0.55; pitch = 1.22; }
            container.querySelectorAll('[data-cam]').forEach(b => {
                b.className = b === btn
                    ? 'px-1.5 py-0.5 text-[9px] font-semibold rounded-[2px] bg-[#0E5E63] text-white cursor-pointer'
                    : 'px-1.5 py-0.5 text-[9px] font-semibold rounded-[2px] text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer';
            });
            draw();
        });
    });

    const spinBtn = container.querySelector('[data-spin]');
    if (spinBtn) {
        spinBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            autoSpin = !autoSpin;
            spinBtn.classList.toggle('bg-[#0E5E63]', autoSpin);
            spinBtn.classList.toggle('text-white', autoSpin);
            if (autoSpin) requestDraw();
        });
    }

    const expBtn = container.querySelector('[data-expand]');
    if (expBtn && typeof opts.onExpand === 'function') {
        expBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            opts.onExpand();
        });
    }

    draw();

    const themeObs = (typeof MutationObserver !== 'undefined') ? new MutationObserver(() => {
        const nextDark = document.documentElement.classList.contains('dark');
        if (nextDark !== isDark && !destroyed) {
            isDark = nextDark;
            meshes = build3DMeshForUnit(modelType, isDark);
            draw();
        }
    }) : null;
    if (themeObs) themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const instance = {
        setCamera(preset) {
            const btn = container.querySelector(`[data-cam="${preset}"]`);
            if (btn) btn.click();
        },
        destroy() {
            destroyed = true;
            if (themeObs) themeObs.disconnect();
            if (rafId) cancelAnimationFrame(rafId);
            canvas.removeEventListener('mousedown', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            canvas.removeEventListener('touchstart', onDown);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
        }
    };
    _active3dInstances.set(container, instance);
    return instance;
}

if (typeof window !== 'undefined') {
    window.pns = window.pns || {};
    window.pns.detectUnitModelType = detectUnitModelType;
    window.pns.buildIsometricVehicleSvg = buildIsometricVehicleSvg;
    window.pns.mountUnit3DViewer = mountUnit3DViewer;
}
