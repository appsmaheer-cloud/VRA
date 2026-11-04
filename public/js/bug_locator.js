/**
 * public/js/bug_locator.js
 * Panduan Lokasi Kode & Cek Kendala Teknis (Khusus Mode Admin)
 */
(function () {
    'use strict';

    const VARIANT = String(window.PNS_MVC_VARIANT || 'PHP').toUpperCase();
    const IS_GAS_VERSION = (VARIANT === 'GAS_GIT' || VARIANT === 'KODE_GIT' || VARIANT === 'KODE_GOOGLE');
    const capturedBugs = [];

    const MVC_CODE_MAP = [
        {
            id: 'MOD-VRA-CALC',
            module: 'Perhitungan Jam Kerja, HM & Status Aging Unit',
            layer: 'Model & Measure',
            file: IS_GAS_VERSION
                ? 'Gas - git/kode_git/public/js/vra-measures.js | Gas - git/kode_google/app/Models/VraSheetModel.gs'
                : 'PHP/public/js/vra-measures.js | PHP/app/Models/VraModel.php',
            func: 'measureVraPerformance() [Baris 185–475]',
            fixHint: 'Jika hitungan jam kerja atau status tidak aktif (>= 100 hari) perlu disesuaikan, buka `public/js/vra-measures.js` baris 420–465.'
        },
        {
            id: 'MOD-VRA4-UI',
            module: 'Halaman Profil Unit (VRA 4) & Tabel Harian',
            layer: 'View & Controller',
            file: IS_GAS_VERSION
                ? 'Gas - git/kode_git/index.html & public/js/pbi_main.js | Gas - git/kode_google/Index.html'
                : 'PHP/index.php (#view-vra-4) | PHP/public/js/pbi_main.js',
            func: 'renderVra4() [Baris 4340–4820]',
            fixHint: 'Untuk mengubah tampilan kartu ringkasan atau tabel harian unit, buka fungsi `renderVra4()` di `public/js/pbi_main.js`.'
        },
        {
            id: 'MOD-UNIT-SEARCH',
            module: 'Pencarian Cepat Kode Unit (Tombol `/` di Header)',
            layer: 'Controller UI',
            file: IS_GAS_VERSION
                ? 'Gas - git/kode_git/public/js/pbi_main.js | Gas - git/kode_google/Index.html'
                : 'PHP/public/js/pbi_main.js',
            func: 'onGlobalUnitSearch() [Baris 8275–8560]',
            fixHint: 'Jika pencarian cepat unit perlu diubah, periksa fungsi `onGlobalUnitSearch()` di `public/js/pbi_main.js`.'
        },
        {
            id: 'MOD-FUEL-BBM',
            module: 'Perhitungan BBM (Solar vs Bensin & Rasio Konsumsi)',
            layer: 'Model & Measure',
            file: IS_GAS_VERSION
                ? 'Gas - git/kode_google/app/Models/FuelSheetModel.gs | Gas - git/kode_git/public/js/fuel-measures.js'
                : 'PHP/app/Models/FuelModel.php | PHP/public/js/fuel-measures.js',
            func: 'measureVraFuelComparison() [Baris 190–340]',
            fixHint: 'Untuk mengatur harga Solar/Bensin atau rasio L/HM, buka `public/js/fuel-measures.js` atau `FuelModel.php`.'
        },
        {
            id: 'MOD-MAINT',
            module: 'Data Biaya Servis, Suku Cadang & Simulasi',
            layer: 'Model & Measure',
            file: IS_GAS_VERSION
                ? 'Gas - git/kode_google/MaintData.gs | Gas - git/kode_git/public/js/maintenance-measures.js'
                : 'PHP/app/Models/MaintenanceModel.php | PHP/public/js/maintenance-measures.js',
            func: 'MaintenanceModel::getDashboardSummary()',
            fixHint: 'Jika rincian biaya servis perlu diperbaiki, periksa `MaintenanceModel.php` atau `public/js/maintenance-measures.js`.'
        },
        {
            id: 'MOD-PHOTOS',
            module: 'Kelola 3 Foto Kendaraan & Simpan ke Google Drive',
            layer: 'Model & Storage',
            file: IS_GAS_VERSION
                ? 'Gas - git/kode_google/app/Models/DrivePhotoModel.gs & appsscript.json'
                : 'PHP/app/Models/AssetModel.php | PHP/public/js/pbi_unit_photos.js',
            func: 'saveUnitPhotosToGoogleDrive() / AssetModel::saveUnitPhoto()',
            fixHint: 'Pastikan izin akses Drive aktif di `kode_google/appsscript.json` atau periksa `public/js/pbi_unit_photos.js`.'
        },
        {
            id: 'MOD-SYNC-DB',
            module: IS_GAS_VERSION
                ? 'Sinkronisasi Data ke Google Sheets (`kode_google`)'
                : 'Sinkronisasi Data ke Database MySQL (`PHP`)',
            layer: 'Data Sync',
            file: IS_GAS_VERSION
                ? 'Gas - git/kode_google/Code.gs & app/Models/VraSheetModel.gs'
                : 'PHP/app/Models/VraModel.php & PHP/database/schema_complete.sql',
            func: IS_GAS_VERSION ? 'fetchVraApiData()' : 'VraModel::syncBatch()',
            fixHint: IS_GAS_VERSION
                ? 'Periksa koneksi API di `Gas - git/kode_google/Code.gs`.'
                : 'Periksa koneksi MySQL di `PHP/app/Config/Database.php` dan `VraModel.php`.'
        }
    ];

    function resolveCodeLocation(fileOrMsg) {
        const s = String(fileOrMsg || '').toLowerCase();
        if (s.includes('fuel') || s.includes('bbm') || s.includes('bkb')) return MVC_CODE_MAP[3];
        if (s.includes('maint') || s.includes('servis')) return MVC_CODE_MAP[4];
        if (s.includes('photo') || s.includes('drive')) return MVC_CODE_MAP[5];
        if (s.includes('vra-measures') || s.includes('aging')) return MVC_CODE_MAP[0];
        if (s.includes('search')) return MVC_CODE_MAP[2];
        if (s.includes('sync') || s.includes('sql') || s.includes('fetch')) return MVC_CODE_MAP[6];
        return MVC_CODE_MAP[1];
    }

    function recordSilentBug(type, message, sourceFile, lineNo, colNo) {
        const mapped = resolveCodeLocation((sourceFile || '') + ' ' + (message || ''));
        const bugEntry = {
            id: 'LOG-' + new Date().toTimeString().slice(0, 8).replace(/:/g, ''),
            time: new Date().toLocaleTimeString('id-ID'),
            type: type,
            message: String(message || 'Kendala teknis'),
            file: sourceFile ? String(sourceFile).split('?')[0].split('/').slice(-3).join('/') : mapped.file,
            line: lineNo || '-',
            col: colNo || '-',
            targetModule: mapped.module,
            targetFunction: mapped.func,
            fixInstruction: mapped.fixHint
        };
        capturedBugs.unshift(bugEntry);
        if (capturedBugs.length > 50) capturedBugs.pop();
        updateBadgeCount();
        const modal = document.getElementById('pns-modal-bug-locator');
        if (modal && !modal.classList.contains('hidden')) {
            const searchInput = document.getElementById('pns-bug-map-search');
            renderBugLocatorTables(searchInput ? searchInput.value : '');
        }
    }

    window.addEventListener('error', function (evt) {
        recordSilentBug('Error JS', evt.message, evt.filename, evt.lineno, evt.colno);
    });

    window.addEventListener('unhandledrejection', function (evt) {
        const reason = evt.reason ? (evt.reason.message || String(evt.reason)) : 'Kendala proses async';
        const stack = evt.reason && evt.reason.stack ? evt.reason.stack : '';
        const lineMatch = stack.match(/:(\d+):(\d+)/);
        recordSilentBug('Proses Async', reason, stack.split('\n')[1] || '', lineMatch ? lineMatch[1] : '-', lineMatch ? lineMatch[2] : '-');
    });

    window.addEventListener('keydown', function (evt) {
        if (evt.altKey && (evt.key === 'b' || evt.key === 'B')) {
            if (isUserAdmin()) {
                evt.preventDefault();
                openBugLocatorModal();
            }
        }
    });

    function isUserAdmin() {
        try {
            const role = localStorage.getItem('pns_user_role') || 'admin';
            return role === 'admin';
        } catch (_) {
            return true;
        }
    }

    function updateBadgeCount() {
        const countEl = document.getElementById('pns-bug-locator-count');
        const btn = document.getElementById('pns-btn-bug-locator');
        if (countEl) {
            countEl.textContent = String(capturedBugs.length);
            countEl.className = capturedBugs.length > 0
                ? 'px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-rose-500 text-white'
                : 'px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-emerald-500 text-white';
        }
        if (btn) {
            btn.style.display = isUserAdmin() ? 'inline-flex' : 'none';
        }
    }

    function simulateBugTest() {
        const sampleFile = IS_GAS_VERSION
            ? 'Gas - git/kode_git/public/js/fuel-measures.js'
            : 'PHP/app/Models/FuelModel.php';
        recordSilentBug(
            'Contoh Uji',
            'Simulasi pengecekan rumus rasio BBM pada unit operasional',
            sampleFile,
            214,
            18
        );
    }

    function clearCapturedBugs() {
        capturedBugs.length = 0;
        updateBadgeCount();
        const searchInput = document.getElementById('pns-bug-map-search');
        renderBugLocatorTables(searchInput ? searchInput.value : '');
    }

    function injectAdminLocatorUI() {
        if (document.getElementById('pns-btn-bug-locator')) return;

        const roleSwitcher = document.getElementById('pns-role-switcher');
        if (roleSwitcher && roleSwitcher.parentElement) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'pns-btn-bug-locator';
            btn.title = 'Panduan lokasi file kode & cek kendala (Hanya tampil di Mode Admin)';
            btn.className = 'items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition cursor-pointer shrink-0';
            btn.style.display = isUserAdmin() ? 'inline-flex' : 'none';
            btn.innerHTML = '<span>🛠️ Kode & Bug</span><span id="pns-bug-locator-count" class="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-emerald-500 text-white">0</span>';
            btn.onclick = openBugLocatorModal;
            roleSwitcher.parentElement.insertBefore(btn, roleSwitcher);
        }

        const variantBadge = IS_GAS_VERSION
            ? 'Versi GAS - Git (kode_google & kode_git)'
            : 'Versi PHP + MySQL';

        const modal = document.createElement('div');
        modal.id = 'pns-modal-bug-locator';
        modal.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 hidden flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-5xl max-h-[86vh] flex flex-col overflow-hidden">
                <div class="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                    <div class="flex items-center gap-2.5 flex-wrap">
                        <span class="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800 text-[10px] font-medium">Mode Admin</span>
                        <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-normal">${variantBadge}</span>
                        <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-100">Panduan Lokasi File & Cek Kendala</h3>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="window.pns.simulateBugTest()" class="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-600 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800 text-[11px] font-medium cursor-pointer transition">Coba Contoh</button>
                        <button type="button" onclick="window.pns.clearCapturedBugs()" class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-[11px] font-normal cursor-pointer transition">Bersihkan</button>
                        <button type="button" onclick="window.pns.closeBugLocatorModal()" class="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs font-normal px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">✕ Tutup</button>
                    </div>
                </div>
                <div class="p-5 overflow-y-auto space-y-5 text-xs flex-1">
                    <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-between gap-3 flex-wrap">
                        <div class="flex-1 min-w-[260px] leading-relaxed">
                            Panel ini hanya tampil saat Anda berada di Mode Admin. Saat pengguna membuka Mode Publik, tombol ini dan catatan teknis di bawah tidak ditampilkan.
                        </div>
                        <input type="text" id="pns-bug-map-search" placeholder="Cari fitur atau nama file..." class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs w-64 focus:outline-none focus:border-blue-400">
                    </div>

                    <!-- Section 1: Captured Runtime Bugs -->
                    <div>
                        <h4 class="font-medium text-slate-700 dark:text-slate-200 text-xs mb-2">1. Catatan Kendala pada Sesi Ini</h4>
                        <div id="pns-bug-locator-live-list" class="space-y-2"></div>
                    </div>

                    <!-- Section 2: MVC Code Locator Table -->
                    <div>
                        <h4 class="font-medium text-slate-700 dark:text-slate-200 text-xs mb-2">2. Daftar Lokasi File Kode per Fitur</h4>
                        <div class="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                            <table class="w-full text-left border-collapse text-xs">
                                <thead class="bg-slate-50 dark:bg-slate-800/60 text-[11px] font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                                    <tr>
                                        <th class="p-3 w-[23%]">Fitur</th>
                                        <th class="p-3 w-[11%]">Bagian</th>
                                        <th class="p-3 w-[27%]">Lokasi File</th>
                                        <th class="p-3 w-[17%]">Fungsi & Baris</th>
                                        <th class="p-3 w-[22%]">Keterangan</th>
                                    </tr>
                                </thead>
                                <tbody id="pns-bug-map-tbody" class="divide-y divide-slate-100 dark:divide-slate-800/70"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const searchInput = document.getElementById('pns-bug-map-search');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                renderBugLocatorTables(this.value);
            });
        }

        if (window.pns && typeof window.pns.setUserRole === 'function') {
            const origSetRole = window.pns.setUserRole;
            window.pns.setUserRole = function (role) {
                const res = origSetRole.apply(this, arguments);
                const locatorBtn = document.getElementById('pns-btn-bug-locator');
                if (locatorBtn) {
                    locatorBtn.style.display = (role === 'admin') ? 'inline-flex' : 'none';
                }
                if (role !== 'admin') {
                    closeBugLocatorModal();
                }
                return res;
            };
        }
    }

    function renderBugLocatorTables(filterQuery) {
        const q = String(filterQuery || '').trim().toLowerCase();
        const liveList = document.getElementById('pns-bug-locator-live-list');
        if (liveList) {
            if (capturedBugs.length === 0) {
                liveList.innerHTML = `<div class="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 text-slate-500 text-center">Belum ada kendala yang tercatat pada sesi ini. Semua fitur berjalan normal.</div>`;
            } else {
                liveList.innerHTML = capturedBugs.map(b => `
                    <div class="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50 flex flex-col gap-1">
                        <div class="flex items-center justify-between flex-wrap gap-2">
                            <span class="font-medium text-rose-700 dark:text-rose-300">${b.id} • ${b.type} (${b.time})</span>
                            <span class="font-mono text-[11px] px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60">File: ${b.file} (Baris ${b.line})</span>
                        </div>
                        <div class="text-slate-600 dark:text-slate-300">Keterangan: <code class="font-mono text-[11px]">${b.message}</code></div>
                        <div class="text-slate-600 dark:text-slate-400">Petunjuk (${b.targetFunction}): ${b.fixInstruction}</div>
                    </div>
                `).join('');
            }
        }

        const tbody = document.getElementById('pns-bug-map-tbody');
        if (tbody) {
            const rows = MVC_CODE_MAP.filter(m => !q || (m.module + ' ' + m.file + ' ' + m.func + ' ' + m.fixHint).toLowerCase().includes(q));
            tbody.innerHTML = rows.map(m => `
                <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td class="p-3 font-medium text-slate-700 dark:text-slate-200">${m.module}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10.5px]">${m.layer}</span></td>
                    <td class="p-3 font-mono text-[11px] text-blue-600 dark:text-sky-400">${m.file}</td>
                    <td class="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">${m.func}</td>
                    <td class="p-3 text-slate-500 dark:text-slate-400 leading-relaxed">${m.fixHint}</td>
                </tr>
            `).join('');
        }
    }

    function openBugLocatorModal() {
        if (!isUserAdmin()) return;
        const modal = document.getElementById('pns-modal-bug-locator');
        if (modal) {
            renderBugLocatorTables('');
            modal.classList.remove('hidden');
        }
    }

    function closeBugLocatorModal() {
        const modal = document.getElementById('pns-modal-bug-locator');
        if (modal) modal.classList.add('hidden');
    }

    window.pns = window.pns || {};
    window.pns.openBugLocatorModal = openBugLocatorModal;
    window.pns.closeBugLocatorModal = closeBugLocatorModal;
    window.pns.recordSilentBug = recordSilentBug;
    window.pns.simulateBugTest = simulateBugTest;
    window.pns.clearCapturedBugs = clearCapturedBugs;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectAdminLocatorUI);
    } else {
        setTimeout(injectAdminLocatorUI, 300);
    }
})();
