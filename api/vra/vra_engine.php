<?php
/**
 * api/vra/vra_engine.php
 * Core engine for authentic VRA synchronization, caching, and MySQL persistence.
 */

function performVraSync() {
    $cacheDir = __DIR__ . '/../../cache';
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0777, true);
    }
    $cacheFile = $cacheDir . '/vra_live_cache.json';

    $urls = [
        'https://app.pratamanusantara.co.id/racikan/api.php?path=list_vra&periode_tahun',
        'http://application.pns.co.id/racikan/api.php?path=list_vra&periode_tahun'
    ];

    $raw = null;
    $httpCode = 0;
    $err = '';
    $totalTime = 0;

    foreach ($urls as $url) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_TIMEOUT, 90);
        curl_setopt($ch, CURLOPT_ENCODING, '');
        curl_setopt($ch, CURLOPT_BUFFERSIZE, 128 * 1024);

        $t0 = microtime(true);
        $res = curl_exec($ch);
        $totalTime = round(microtime(true) - $t0, 2);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($httpCode === 200 && !empty($res) && strlen($res) > 1000) {
            $raw = $res;
            break;
        }
    }

    if (!$raw) {
        return [
            'success' => false,
            'message' => 'Gagal terhubung ke Server Pusat VRA: ' . ($err ?: "HTTP $httpCode"),
            'cached_time' => file_exists($cacheFile) ? date('Y-m-d H:i:s', filemtime($cacheFile)) : null
        ];
    }

    $json = json_decode($raw, true);
    $data = $json['data'] ?? [];

    if (empty($data)) {
        return [
            'success' => false,
            'message' => 'Format data dari server pusat kosong atau tidak valid.'
        ];
    }

    // Authentic clean dataset (DO NOT merge with old dummy records!)
    $cleanData = [];
    $distinctUnits = [];

    foreach ($data as $r) {
        $u = trim($r['kode_unit'] ?? '');
        if (!$u) continue;
        $distinctUnits[$u] = true;
        $cleanData[] = $r;
    }

    $unitList = array_keys($distinctUnits);
    sort($unitList);

    // Save authentic clean cache
    $payload = [
        'success' => true,
        'timestamp' => time(),
        'last_sync' => date('Y-m-d H:i:s'),
        'count' => count($cleanData),
        'distinct_units' => count($unitList),
        'units' => $unitList,
        'data' => $cleanData
    ];

    $cacheContent = json_encode($payload, JSON_UNESCAPED_UNICODE);
    file_put_contents($cacheFile, $cacheContent);
    file_put_contents($cacheFile . '.gz', gzencode($cacheContent, 6));

    // Persist to MySQL database (fact_vra and fact_bkb_fuel)
    try {
        require_once __DIR__ . '/../../config/database.php';
        global $pdo;

        if ($pdo) {
            // Update fact_vra
            $pdo->exec("TRUNCATE TABLE fact_vra");
            $pdo->beginTransaction();

            $sql = "INSERT INTO fact_vra (
                kode_unit, tanggal, jam_awal, jam_selesai, hm_awal, hm_akhir, hm_terpakai,
                aktivitas, nama_aktivitas, kode_aktivitas, nama_kegiatan, kode_kegiatan,
                keterangan_tambahan, tujuan, no_bkb, cost_section, aktif
            ) VALUES ";

            $params = [];
            $valuesArr = [];
            $batchSize = 1000;

            foreach ($cleanData as $r) {
                $u = substr(trim($r['kode_unit'] ?? ''), 0, 50);
                $tgl = $r['tanggal'] ?? date('Y-m-d');
                $ja = !empty($r['jam_awal']) ? $r['jam_awal'] : null;
                $js = !empty($r['jam_selesai']) ? $r['jam_selesai'] : null;
                $ha = isset($r['hm_awal']) ? (float)$r['hm_awal'] : 0;
                $hk = isset($r['hm_akhir']) ? (float)$r['hm_akhir'] : 0;
                $ht = isset($r['hm_terpakai']) ? (float)$r['hm_terpakai'] : max(0, $hk - $ha);
                $akt = substr($r['nama_aktivitas'] ?? ($r['nama_kegiatan'] ?? ($r['aktivitas'] ?? 'Operasional')), 0, 255);
                $nAkt = isset($r['nama_aktivitas']) ? substr($r['nama_aktivitas'], 0, 255) : null;
                $kAkt = isset($r['kode_aktivitas']) ? substr($r['kode_aktivitas'], 0, 50) : null;
                $nKeg = isset($r['nama_kegiatan']) ? substr($r['nama_kegiatan'], 0, 255) : null;
                $kKeg = isset($r['kode_kegiatan']) ? substr($r['kode_kegiatan'], 0, 50) : null;
                $ket = $r['keterangan_tambahan'] ?? ($r['keterangan'] ?? null);
                $tuj = $r['tujuan'] ?? null;
                $bkb = isset($r['no_bkb']) ? substr($r['no_bkb'], 0, 255) : null;
                $sec = isset($r['cost_section']) ? substr($r['cost_section'], 0, 100) : null;
                $aktif = isset($r['aktif']) ? (int)$r['aktif'] : 1;

                $valuesArr[] = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                array_push($params, $u, $tgl, $ja, $js, $ha, $hk, $ht, $akt, $nAkt, $kAkt, $nKeg, $kKeg, $ket, $tuj, $bkb, $sec, $aktif);

                if (count($valuesArr) >= $batchSize) {
                    $stmt = $pdo->prepare($sql . implode(',', $valuesArr));
                    $stmt->execute($params);
                    $valuesArr = [];
                    $params = [];
                }
            }

            if (!empty($valuesArr)) {
                $stmt = $pdo->prepare($sql . implode(',', $valuesArr));
                $stmt->execute($params);
            }
            $pdo->commit();

            // Sync fuel into fact_bkb_fuel
            $stmtBkb = $pdo->prepare("
                INSERT INTO fact_bkb_fuel (no_bkb, no_asset_manual, jenis_bbm, tanggal_bkb, jumlah_bkb_fix, harga_bkb, section)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE jumlah_bkb_fix = VALUES(jumlah_bkb_fix), harga_bkb = VALUES(harga_bkb)
            ");

            $pdo->beginTransaction();
            foreach ($cleanData as $r) {
                $qty = (float)($r['quantity_bahan_bakar'] ?? 0);
                if ($qty <= 0) continue;

                $u = substr(trim($r['kode_unit'] ?? ''), 0, 50);
                if (!$u) continue;

                $tgl = $r['tanggal'] ?? date('Y-m-d');
                $bkb = substr(trim($r['no_bkb'] ?? ''), 0, 50);
                if (!$bkb || $bkb === '-') {
                    $bkb = substr('BKB-VRA-' . str_replace('-', '', $tgl) . '-' . substr(md5($u . $tgl . ($r['jam_awal'] ?? '') . $qty), 0, 6), 0, 50);
                }
                $sec = isset($r['cost_section']) ? substr($r['cost_section'], 0, 50) : null;

                $uUpper = strtoupper($u);
                $jenis = 'SOLAR';
                if (preg_match('/(MTR|ALKON|MPR|KNAPSACK|AVANZA|GRAN MAX)/', $uUpper)) {
                    $jenis = 'BENSIN';
                }
                $pricePerLiter = ($jenis === 'BENSIN') ? 10000 : 6800;
                $harga = round($qty * $pricePerLiter, 2);

                $stmtBkb->execute([$bkb, $u, $jenis, $tgl, $qty, $harga, $sec]);
            }
            $pdo->commit();
        }
    } catch (Exception $dbEx) {
        error_log("VRA Database Sync Error: " . $dbEx->getMessage());
    }

    return [
        'success' => true,
        'message' => 'Berhasil sinkronisasi data live VRA terbaru dari server pusat.',
        'count' => count($cleanData),
        'distinct_units' => count($unitList),
        'units' => $unitList,
        'duration_seconds' => $totalTime,
        'last_sync' => date('d M Y H:i:s'),
        'timestamp' => time()
    ];
}
