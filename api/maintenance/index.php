<?php
/**
 * api/maintenance/index.php
 * Serves authentic Maintenance records that are STRICTLY INLINE with VRA data (fact_vra units).
 * Eliminates non-VRA assets (buildings, helipads, roofs, mess, infrastructure) from the VRA dashboard.
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
$cacheFile = $cacheDir . '/maint_vra_cache.json';
$cacheGzFile = $cacheDir . '/maint_vra_cache.json.gz';

$softTtl = 900; // 15 menit
$forceSync = isset($_GET['force']) || isset($_GET['sync']);

// Serve from cache if fresh
if (!$forceSync && file_exists($cacheFile) && filesize($cacheFile) > 100) {
    $fileTime = filemtime($cacheFile);
    $cacheAge = time() - $fileTime;
    $isStale = ($cacheAge >= $softTtl);

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

require_once __DIR__ . '/../../config/database.php';

try {
    global $pdo;

    // Fetch distinct VRA unit codes
    $vraUnitsStmt = $pdo->query("SELECT DISTINCT kode_unit FROM fact_vra WHERE kode_unit IS NOT NULL AND kode_unit != ''");
    $vraUnits = $vraUnitsStmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($vraUnits)) {
        // Fallback to cache if database has no VRA units
        $cacheVra = __DIR__ . '/../../cache/vra_live_cache.json';
        if (file_exists($cacheVra)) {
            $jsonVra = json_decode(file_get_contents($cacheVra), true);
            foreach ($jsonVra['data'] ?? [] as $r) {
                $u = trim($r['kode_unit'] ?? '');
                if ($u) $vraUnits[] = $u;
            }
            $vraUnits = array_unique($vraUnits);
        }
    }

    if (empty($vraUnits)) {
        echo json_encode([
            'success' => true,
            'count' => 0,
            'distinct_units' => 0,
            'data' => []
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Query maintenance records strictly for VRA units
    $inPlaceholders = implode(',', array_fill(0, count($vraUnits), '?'));
    $sql = "SELECT id, kode_unit, tanggal, kategori_barang_jasa, id_kategori_material, id_sub_kategori_material, 
                   kategori_material, sub_kategori_material, nama_spare_part_jasa, nominal, kode_section 
            FROM fact_maintenance 
            WHERE kode_unit IN ($inPlaceholders) 
            ORDER BY tanggal DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_values($vraUnits));
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $distinctUnits = [];
    foreach ($data as $r) {
        $u = trim($r['kode_unit'] ?? '');
        if ($u) $distinctUnits[$u] = true;
    }

    $payload = [
        'success' => true,
        'timestamp' => time(),
        'last_sync' => date('Y-m-d H:i:s'),
        'count' => count($data),
        'distinct_units' => count($distinctUnits),
        'filter_scope' => 'VRA_INLINE_ONLY',
        'data' => $data
    ];

    $jsonStr = json_encode($payload, JSON_UNESCAPED_UNICODE);

    // Save to cache
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0777, true);
    }
    @file_put_contents($cacheFile, $jsonStr);
    @file_put_contents($cacheGzFile, gzencode($jsonStr, 6));

    header('X-Cache-Status: REFRESHED');
    echo $jsonStr;

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Gagal mengambil data Maintenance VRA: ' . $e->getMessage()
    ]);
}
