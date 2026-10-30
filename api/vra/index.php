<?php
/**
 * api/vra/index.php
 * Serves authentic VRA operational data with smart caching, TTL validation,
 * and automatic periodic sync support.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$cacheDir = __DIR__ . '/../../cache';
$cacheFile = $cacheDir . '/vra_live_cache.json';
$cacheGzFile = $cacheDir . '/vra_live_cache.json.gz';

// Configuration: 15 minutes soft TTL
$softTtl = 900; // 15 menit
$forceSync = isset($_GET['force']) || isset($_GET['sync']);

// If forced or cache does not exist, perform sync
if ($forceSync || !file_exists($cacheFile) || filesize($cacheFile) < 1000) {
    require_once __DIR__ . '/vra_engine.php';
    $syncResult = performVraSync();
    if ($syncResult['success'] && file_exists($cacheFile)) {
        header('X-Cache-Status: REFRESHED');
    }
}

// Serve from live API cache if available
if (file_exists($cacheFile) && filesize($cacheFile) > 1000) {
    $fileTime = filemtime($cacheFile);
    $cacheAge = time() - $fileTime;
    $isStale = ($cacheAge >= $softTtl);

    header('Content-Type: application/json; charset=utf-8');
    header('X-Cache-Status: ' . ($isStale ? 'STALE' : 'HIT'));
    header('X-Cache-Age: ' . $cacheAge);

    if (strpos($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '', 'gzip') !== false && file_exists($cacheGzFile)) {
        header('Content-Encoding: gzip');
        readfile($cacheGzFile);
        exit;
    }

    readfile($cacheFile);
    exit;
}

// Fallback to database if cache fails
require_once __DIR__ . '/../../config/database.php';

try {
    global $pdo;
    
    $stmt = $pdo->query("SELECT * FROM fact_vra ORDER BY tanggal DESC, jam_awal DESC");
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $distinctUnits = [];
    foreach ($data as $r) {
        $u = trim($r['kode_unit'] ?? '');
        if ($u) $distinctUnits[$u] = true;
    }

    header('X-Cache-Status: DB_FALLBACK');
    echo json_encode([
        'success' => true,
        'count' => count($data),
        'distinct_units' => count($distinctUnits),
        'source' => 'database',
        'is_stale' => true,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Gagal mengambil data VRA: ' . $e->getMessage()
    ]);
}
