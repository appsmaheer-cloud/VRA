/**
 * core-measures.js
 * Mesin agregasi generik — dipakai semua modul measure (asset, maintenance, vra, fuel).
 *
 * Prinsip efisiensi:
 * - SATU KALI LOOP (single-pass) untuk filter + group + aggregate sekaligus,
 *   bukan filter().map().reduce() berantai yang looping berkali-kali.
 * - Pakai Map untuk grouping -> O(n), bukan array.find() di dalam loop -> O(n²).
 * - Tidak ada library eksternal - vanilla JS murni, ringan buat mobile web.
 */

/**
 * Filter generik: terima array data + object kondisi filter (key: field, value: nilai atau array nilai).
 * Contoh: applyFilter(assets, { kondisi: 'BAIK', kode_kategori: ['111','112'] })
 */
function applyFilter(data, filters = {}) {
  const keys = Object.keys(filters).filter(k => filters[k] !== undefined && filters[k] !== null && filters[k] !== '');
  if (keys.length === 0) return data;

  return data.filter(row => {
    for (const key of keys) {
      const filterVal = filters[key];
      if (typeof filterVal === 'function') {
        if (!filterVal(row)) return false;
      } else if (Array.isArray(filterVal)) {
        if (!filterVal.includes(row[key])) return false;
      } else {
        if (row[key] !== filterVal) return false;
      }
    }
    return true;
  });
}

/**
 * Group + aggregate dalam SATU pass. Tidak perlu groupBy() lalu map() terpisah.
 *
 * @param data        array baris (sudah difilter)
 * @param groupKeyFn  function(row) => string, kunci grouping (bisa gabungan beberapa field)
 * @param aggregators object { nama_measure: { init, step, finalize? } }
 *
 * Contoh aggregator SUM:  { init: () => 0, step: (acc, row) => acc + (row.nominal || 0) }
 * Contoh aggregator COUNT: { init: () => 0, step: (acc) => acc + 1 }
 * Contoh aggregator AVG:  { init: () => ({sum:0,n:0}), step: (acc,row) => ({sum: acc.sum+row.val, n: acc.n+1}), finalize: acc => acc.n ? acc.sum/acc.n : 0 }
 */
function groupAggregate(data, groupKeyFn, aggregators) {
  const groups = new Map(); // key -> { acc per measure }

  for (const row of data) {
    const key = groupKeyFn(row);
    if (!groups.has(key)) {
      const initState = {};
      for (const name in aggregators) {
        const agg = aggregators[name];
        initState[name] = (agg && typeof agg.init === 'function') ? agg.init() : 0;
      }
      groups.set(key, initState);
    }
    const state = groups.get(key);
    for (const name in aggregators) {
      const agg = aggregators[name];
      if (typeof agg === 'function') {
        state[name] = agg(state[name], row);
      } else if (agg && typeof agg.step === 'function') {
        state[name] = agg.step(state[name], row);
      }
    }
  }

  // finalize (misal AVG butuh sum/n dibagi di akhir)
  const result = [];
  for (const [key, state] of groups.entries()) {
    const finalRow = { group: key };
    for (const name in aggregators) {
      const agg = aggregators[name];
      const fn = agg && agg.finalize;
      finalRow[name] = fn ? fn(state[name]) : state[name];
    }
    result.push(finalRow);
  }
  return result;
}

// Aggregator siap pakai - biar tidak nulis ulang init/step tiap kali
const Agg = {
  sum: (field) => ({
    init: () => 0,
    step: (acc, row) => acc + (Number(row[field]) || 0),
  }),
  count: () => ({
    init: () => 0,
    step: (acc) => acc + 1,
  }),
  avg: (field) => ({
    init: () => ({ sum: 0, n: 0 }),
    step: (acc, row) => ({ sum: acc.sum + (Number(row[field]) || 0), n: acc.n + 1 }),
    finalize: (acc) => (acc.n ? acc.sum / acc.n : 0),
  }),
  min: (field) => ({
    init: () => Infinity,
    step: (acc, row) => Math.min(acc, Number(row[field]) || Infinity),
  }),
  max: (field) => ({
    init: () => -Infinity,
    step: (acc, row) => Math.max(acc, Number(row[field]) || -Infinity),
  }),
};

// Export (dipakai lewat <script type="module"> atau digabung manual ke bundle)
export { applyFilter, groupAggregate, Agg };
