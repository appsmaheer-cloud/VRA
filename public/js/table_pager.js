/**
 * table_pager.js
 * Utilitas Universal Freeze Header & Pagination ("Pindah Halaman" + "Semua Scroll")
 * Bekerja otomatis pada seluruh tabel data tanpa mengubah markup tabel yang ada.
 */
(function () {
    'use strict';

    const DEFAULT_PAGE_SIZE = 25;
    const pagerStateMap = new WeakMap();
    let tableIdSeq = 1;
    let isScanning = false;

    function isSkippableTable(table) {
        if (!table || table.getAttribute('data-no-pager') === '1') return true;
        if (!table.tHead || !table.tBodies || table.tBodies.length === 0) return true;
        if (table.closest('.pns-pager-bar')) return true;
        // Lewati tabel bersarang di dalam tabel lain
        if (table.parentElement && table.parentElement.closest('table')) return true;
        return false;
    }

    function getDataRows(tbody) {
        const all = Array.from(tbody.children).filter(el => el.tagName === 'TR');
        const dataRows = [];
        const pinnedRows = [];

        all.forEach(tr => {
            const firstTd = tr.firstElementChild;
            const hasColspanEmpty = all.length === 1 && firstTd && firstTd.hasAttribute('colspan');
            const isTotalFooter = firstTd &&
                firstTd.textContent.trim().toUpperCase() === 'TOTAL' &&
                (tr.className.includes('border-t-2') || tr.className.includes('font-semibold'));
            if (hasColspanEmpty || isTotalFooter || tr.getAttribute('data-pager-keep') === '1') {
                pinnedRows.push(tr);
            } else {
                dataRows.push(tr);
            }
        });

        return { dataRows, pinnedRows };
    }

    function ensureViewportWrapper(table) {
        const parent = table.parentElement;
        if (!parent) return null;

        const cls = String(parent.className || '');
        const isExistingOverflowDiv = parent.tagName === 'DIV' && (
            parent.classList.contains('pns-table-viewport') ||
            cls.includes('overflow-x-auto') ||
            cls.includes('overflow-y-auto') ||
            cls.includes('overflow-auto')
        );

        // Pastikan sibling non-table tidak ikut terperangkap di dalam area scroll jika parent terlalu besar
        const elementChildren = Array.from(parent.children).filter(c => c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE');
        if (isExistingOverflowDiv && elementChildren.length === 1) {
            parent.classList.add('pns-table-viewport');
            return parent;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'pns-table-viewport overflow-x-auto';
        parent.insertBefore(wrapper, table);
        wrapper.appendChild(table);
        return wrapper;
    }

    function buildPagerBar(state) {
        const bar = document.createElement('div');
        bar.className = 'pns-pager-bar';
        bar.setAttribute('data-pager-for', state.uid);
        bar.innerHTML = `
            <div class="pns-pager-info font-mono text-[11px]">Menampilkan 0 data</div>
            <div class="pns-pager-controls flex flex-wrap items-center gap-1.5">
                <label class="inline-flex items-center gap-1 text-[11px]">
                    <span class="hidden sm:inline">Tampil:</span>
                    <select class="pns-pager-size" aria-label="Jumlah baris per halaman">
                        <option value="25" selected>25 / hal</option>
                        <option value="50">50 / hal</option>
                        <option value="100">100 / hal</option>
                        <option value="0">Semua (Scroll)</option>
                    </select>
                </label>
                <div class="inline-flex items-center gap-1">
                    <button type="button" class="pns-pager-btn pns-btn-first" title="Halaman Pertama">&laquo;</button>
                    <button type="button" class="pns-pager-btn pns-btn-prev" title="Halaman Sebelumnya">&lsaquo; Sblm</button>
                    <span class="pns-pager-indicator font-mono text-[11px] px-1.5">Hal 1 / 1</span>
                    <button type="button" class="pns-pager-btn pns-btn-next" title="Halaman Berikutnya">Brkt &rsaquo;</button>
                    <button type="button" class="pns-pager-btn pns-btn-last" title="Halaman Terakhir">&raquo;</button>
                </div>
            </div>
        `;

        const selectEl = bar.querySelector('.pns-pager-size');
        const btnFirst = bar.querySelector('.pns-btn-first');
        const btnPrev = bar.querySelector('.pns-btn-prev');
        const btnNext = bar.querySelector('.pns-btn-next');
        const btnLast = bar.querySelector('.pns-btn-last');

        selectEl.addEventListener('change', function () {
            state.pageSize = parseInt(this.value, 10);
            state.page = 1;
            state.userTouchedSize = true;
            renderPage(state, true);
        });
        btnFirst.addEventListener('click', function () {
            if (state.page > 1) {
                state.page = 1;
                renderPage(state, true);
            }
        });
        btnPrev.addEventListener('click', function () {
            if (state.page > 1) {
                state.page--;
                renderPage(state, true);
            }
        });
        btnNext.addEventListener('click', function () {
            if (state.page < state.totalPages) {
                state.page++;
                renderPage(state, true);
            }
        });
        btnLast.addEventListener('click', function () {
            if (state.page < state.totalPages) {
                state.page = state.totalPages;
                renderPage(state, true);
            }
        });

        return bar;
    }

    function renderPage(state, scrollTop) {
        const tbody = state.tbody;
        if (!tbody) return;

        const { dataRows, pinnedRows } = getDataRows(tbody);
        const total = dataRows.length;

        if (state.lastTotal !== total) {
            state.page = 1;
            state.lastTotal = total;
        }

        const showAll = state.pageSize <= 0;
        const pageSize = showAll ? Math.max(1, total) : state.pageSize;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        state.totalPages = totalPages;
        if (state.page > totalPages) state.page = totalPages;
        if (state.page < 1) state.page = 1;

        const startIdx = showAll ? 0 : (state.page - 1) * pageSize;
        const endIdx = showAll ? total : Math.min(total, startIdx + pageSize);

        dataRows.forEach((tr, idx) => {
            const visible = showAll || (idx >= startIdx && idx < endIdx);
            const targetDisplay = visible ? '' : 'none';
            if (tr.style.display !== targetDisplay) {
                tr.style.display = targetDisplay;
            }
        });

        pinnedRows.forEach(tr => {
            if (tr.style.display === 'none') tr.style.display = '';
        });

        // Tampilkan pager bar jika viewport tidak hidden dan baris > 10
        const isViewportHidden = state.viewport && state.viewport.classList && state.viewport.classList.contains('hidden');
        const shouldShowBar = !isViewportHidden && (total > 10 || (state.userTouchedSize && total > 0));
        if (state.bar) {
            state.bar.style.display = shouldShowBar ? 'flex' : 'none';
            if (shouldShowBar) {
                const infoEl = state.bar.querySelector('.pns-pager-info');
                const indEl = state.bar.querySelector('.pns-pager-indicator');
                const btnFirst = state.bar.querySelector('.pns-btn-first');
                const btnPrev = state.bar.querySelector('.pns-btn-prev');
                const btnNext = state.bar.querySelector('.pns-btn-next');
                const btnLast = state.bar.querySelector('.pns-btn-last');
                const selectEl = state.bar.querySelector('.pns-pager-size');

                if (infoEl) {
                    infoEl.textContent = showAll
                        ? `Menampilkan semua ${total.toLocaleString('id-ID')} baris (scroll aktif)`
                        : `Menampilkan ${(startIdx + 1).toLocaleString('id-ID')}–${endIdx.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} baris`;
                }
                if (indEl) {
                    indEl.textContent = showAll ? 'Mode Scroll' : `Hal ${state.page} / ${totalPages}`;
                }
                if (selectEl && String(selectEl.value) !== String(state.pageSize)) {
                    selectEl.value = String(state.pageSize);
                }
                const atStart = showAll || state.page <= 1;
                const atEnd = showAll || state.page >= totalPages;
                if (btnFirst) btnFirst.disabled = atStart;
                if (btnPrev) btnPrev.disabled = atStart;
                if (btnNext) btnNext.disabled = atEnd;
                if (btnLast) btnLast.disabled = atEnd;
            }
        }

        if (scrollTop && state.viewport) {
            state.viewport.scrollTop = 0;
        }
    }

    function attach(table) {
        if (isSkippableTable(table)) return null;
        const tbody = table.tBodies[0];
        if (!tbody) return null;

        let state = pagerStateMap.get(table);
        if (!state) {
            const viewport = ensureViewportWrapper(table);
            if (!viewport) return null;

            const customSize = parseInt(table.getAttribute('data-page-size') || '', 10);
            state = {
                uid: table.id || ('pns-tbl-' + (tableIdSeq++)),
                table: table,
                tbody: tbody,
                viewport: viewport,
                pageSize: Number.isFinite(customSize) && customSize >= 0 ? customSize : DEFAULT_PAGE_SIZE,
                page: 1,
                totalPages: 1,
                lastTotal: -1,
                userTouchedSize: false,
                rafPending: false,
                bar: null
            };

            // Gunakan bar yang sudah ada bila dipanggil ulang setelah re-scan
            const nextEl = viewport.nextElementSibling;
            if (nextEl && nextEl.classList && nextEl.classList.contains('pns-pager-bar') && nextEl.getAttribute('data-pager-for') === state.uid) {
                state.bar = nextEl;
            } else {
                state.bar = buildPagerBar(state);
                viewport.insertAdjacentElement('afterend', state.bar);
            }

            pagerStateMap.set(table, state);

            // Amati hanya childList pada tbody agar perubahan style.display tidak memicu observer ulang
            const tbodyObserver = new MutationObserver(function () {
                if (state.rafPending) return;
                state.rafPending = true;
                window.requestAnimationFrame(function () {
                    state.rafPending = false;
                    renderPage(state, false);
                });
            });
            tbodyObserver.observe(tbody, { childList: true });
            state.observer = tbodyObserver;

            const vpObserver = new MutationObserver(function () {
                renderPage(state, false);
            });
            vpObserver.observe(viewport, { attributes: true, attributeFilter: ['class'] });
        }

        renderPage(state, false);
        return state;
    }

    function initAll() {
        if (isScanning) return;
        isScanning = true;
        try {
            document.querySelectorAll('table').forEach(tbl => attach(tbl));
        } finally {
            isScanning = false;
        }
    }

    function refresh(target) {
        const tbl = target && target.tagName === 'TBODY' ? target.closest('table') : target;
        if (!tbl) {
            initAll();
            return;
        }
        const st = attach(tbl);
        if (st) renderPage(st, false);
    }

    function bootstrapPager() {
        initAll();
        if (document.body) {
            let docRaf = false;
            const bodyObs = new MutationObserver(function (mutations) {
                let hasNewTable = false;
                for (let i = 0; i < mutations.length; i++) {
                    const added = mutations[i].addedNodes;
                    for (let j = 0; j < added.length; j++) {
                        const n = added[j];
                        if (n.nodeType === 1 && (n.tagName === 'TABLE' || (n.querySelector && n.querySelector('table')))) {
                            hasNewTable = true;
                            break;
                        }
                    }
                    if (hasNewTable) break;
                }
                if (hasNewTable && !docRaf) {
                    docRaf = true;
                    window.requestAnimationFrame(function () {
                        docRaf = false;
                        initAll();
                    });
                }
            });
            bodyObs.observe(document.body, { childList: true, subtree: true });
        }
    }

    window.pnsTablePager = {
        initAll: initAll,
        attach: attach,
        refresh: refresh
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapPager);
    } else {
        bootstrapPager();
    }
})();
