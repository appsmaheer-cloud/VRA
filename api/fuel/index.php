<?php
/**
 * api/fuel/index.php
 * PNS Enterprise REST API - Fuel & BBM Analytics Service
 * Conforms strictly to API_CONTRACT.md and BUSINESS_RULES.md
 */

require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$cacheDir = __DIR__ . '/../../cache';
if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0777, true);
}
$cacheFile = $cacheDir . '/fuel_cache.json';
$cacheGzFile = $cacheDir . '/fuel_cache.json.gz';
$isDefaultRequest = empty(array_diff(array_keys($_GET), ['force', 'refresh']));
$forceRefresh = isset($_GET['force']) || isset($_GET['refresh']);

if ($isDefaultRequest && !$forceRefresh && file_exists($cacheFile) && filesize($cacheFile) > 1000) {
    $age = time() - filemtime($cacheFile);
    if ($age < 3600) {
        header('Content-Type: application/json; charset=utf-8');
        header('X-Cache-Status: HIT');
        header('X-Cache-Age: ' . $age);
        if (strpos($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '', 'gzip') !== false && file_exists($cacheGzFile)) {
            header('Content-Encoding: gzip');
            readfile($cacheGzFile);
            exit;
        }
        readfile($cacheFile);
        exit;
    }
}

try {
    global $pdo;

    // 1. Parse Query Parameters
    $search     = trim($_GET['search'] ?? '');
    $jenisBbm   = strtoupper(trim($_GET['jenis_bbm'] ?? ''));
    $kategori   = trim($_GET['kategori'] ?? '');
    $kodeUnit   = trim($_GET['kode_unit'] ?? '');
    $startDate  = trim($_GET['start_date'] ?? '');
    $endDate    = trim($_GET['end_date'] ?? '');
    $section    = trim($_GET['section'] ?? '');
    $limit      = isset($_GET['limit']) ? max(1, min(1000, (int)$_GET['limit'])) : null;
    $page       = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $needStats  = isset($_GET['stats']) && $_GET['stats'] == '1';

    // 2. Build WHERE Clause
    $where = [];
    $params = [];

    if ($jenisBbm !== '' && in_array($jenisBbm, ['SOLAR', 'BENSIN'])) {
        $where[] = "f.jenis_bbm = :jenis_bbm";
        $params[':jenis_bbm'] = $jenisBbm;
    }

    if ($kodeUnit !== '' && $kodeUnit !== 'ALL') {
        $where[] = "f.no_asset_manual = :kode_unit";
        $params[':kode_unit'] = $kodeUnit;
    }

    if ($kategori !== '' && $kategori !== 'ALL') {
        $where[] = "(a.kode_kategori = :kategori OR a.kategori_asset = :kategori)";
        $params[':kategori'] = $kategori;
    }

    if ($section !== '' && $section !== 'ALL') {
        $where[] = "(f.section = :section OR a.penanggungjawab_section = :section)";
        $params[':section'] = $section;
    }

    if ($startDate !== '') {
        $where[] = "f.tanggal_bkb >= :start_date";
        $params[':start_date'] = $startDate;
    }

    if ($endDate !== '') {
        $where[] = "f.tanggal_bkb <= :end_date";
        $params[':end_date'] = $endDate;
    }

    if ($search !== '') {
        $where[] = "(f.no_bkb LIKE :q OR f.no_asset_manual LIKE :q OR a.nama_asset LIKE :q OR f.section LIKE :q)";
        $params[':q'] = "%$search%";
    }

    $whereSql = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";

    // 3. Optional Aggregate Stats Calculation
    $stats = null;
    if ($needStats || $limit !== null) {
        $statsSql = "
            SELECT 
                COUNT(*) as total_records,
                COUNT(DISTINCT f.no_asset_manual) as distinct_units,
                COALESCE(SUM(f.jumlah_bkb_fix), 0) as total_liters,
                COALESCE(SUM(f.harga_bkb), 0) as total_cost,
                COALESCE(SUM(CASE WHEN f.jenis_bbm = 'BENSIN' THEN f.jumlah_bkb_fix ELSE 0 END), 0) as bensin_qty,
                COALESCE(SUM(CASE WHEN f.jenis_bbm = 'BENSIN' THEN f.harga_bkb ELSE 0 END), 0) as bensin_cost,
                COALESCE(SUM(CASE WHEN f.jenis_bbm = 'SOLAR' THEN f.jumlah_bkb_fix ELSE 0 END), 0) as solar_qty,
                COALESCE(SUM(CASE WHEN f.jenis_bbm = 'SOLAR' THEN f.harga_bkb ELSE 0 END), 0) as solar_cost,
                MIN(f.tanggal_bkb) as min_date,
                MAX(f.tanggal_bkb) as max_date
            FROM fact_bkb_fuel f
            LEFT JOIN assets a ON f.no_asset_manual = a.kode_unit
            $whereSql
        ";
        $stmtStats = $pdo->prepare($statsSql);
        $stmtStats->execute($params);
        $rawStats = $stmtStats->fetch(PDO::FETCH_ASSOC);

        $totLit = (float)$rawStats['total_liters'];
        $totCst = (float)$rawStats['total_cost'];
        $distUnit = (int)$rawStats['distinct_units'];

        $stats = [
            'total_records'   => (int)$rawStats['total_records'],
            'distinct_units'  => $distUnit,
            'total_liters'    => round($totLit, 2),
            'total_cost'      => round($totCst, 2),
            'avg_price_per_l' => $totLit > 0 ? round($totCst / $totLit, 2) : 0,
            'petrol_per_unit' => $distUnit > 0 ? round($totLit / $distUnit, 2) : 0,
            'bensin' => [
                'qty'  => round((float)$rawStats['bensin_qty'], 2),
                'cost' => round((float)$rawStats['bensin_cost'], 2),
            ],
            'solar' => [
                'qty'  => round((float)$rawStats['solar_qty'], 2),
                'cost' => round((float)$rawStats['solar_cost'], 2),
            ],
            'date_range' => [
                'min' => $rawStats['min_date'],
                'max' => $rawStats['max_date']
            ]
        ];
    }

    // 4. Query Main Data with Asset Dimension Join
    $selectSql = "
        SELECT 
            f.id,
            f.no_bkb,
            f.no_bkb AS nomor_bkb,
            f.no_asset_manual,
            f.no_asset_manual AS kode_unit,
            f.jenis_bbm,
            f.tanggal_bkb,
            f.tanggal_bkb AS tanggal,
            f.jumlah_bkb_fix,
            f.jumlah_bkb_fix AS jumlah_liter,
            f.harga_bkb,
            f.harga_bkb AS total_biaya,
            ROUND(f.harga_bkb / NULLIF(f.jumlah_bkb_fix, 0), 2) AS harga_per_liter,
            f.no_brb,
            COALESCE(f.section, a.penanggungjawab_section, '') AS section,
            COALESCE(NULLIF(a.nama_asset_detail, ''), a.nama_asset, 'Unit Belum Terdaftar') AS nama_asset,
            COALESCE(a.kode_kategori, a.kategori_asset, 'UMUM') AS kode_kategori,
            COALESCE(a.kode_kelompok, 'KENDARAAN & ALAT BERAT') AS kode_kelompok,
            COALESCE(a.location, '') AS location,
            COALESCE(a.pic_nama, '') AS pic_nama,
            CASE WHEN a.kode_unit IS NULL THEN 1 ELSE 0 END AS is_unregistered
        FROM fact_bkb_fuel f
        LEFT JOIN assets a ON f.no_asset_manual = a.kode_unit
        $whereSql
        ORDER BY f.tanggal_bkb DESC, f.id DESC
    ";

    if ($limit !== null) {
        $offset = ($page - 1) * $limit;
        $selectSql .= " LIMIT $limit OFFSET $offset";
    }

    $stmt = $pdo->prepare($selectSql);
    $stmt->execute($params);
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Format numbers
    foreach ($data as &$row) {
        $row['id'] = (int)$row['id'];
        $row['jumlah_bkb_fix'] = (float)$row['jumlah_bkb_fix'];
        $row['jumlah_liter'] = (float)$row['jumlah_liter'];
        $row['harga_bkb'] = (float)$row['harga_bkb'];
        $row['total_biaya'] = (float)$row['total_biaya'];
        $row['harga_per_liter'] = (float)$row['harga_per_liter'];
        $row['is_unregistered'] = (bool)$row['is_unregistered'];
    }

    $response = [
        'success' => true,
        'message' => 'Data BBM berhasil diambil',
        'count'   => count($data),
        'data'    => $data
    ];

    if ($stats !== null) {
        $response['stats'] = $stats;
    }

    if ($limit !== null) {
        $totalItems = $stats['total_records'] ?? count($data);
        $response['meta'] = [
            'current_page' => $page,
            'per_page'     => $limit,
            'total_item'   => $totalItems,
            'total_page'   => ceil($totalItems / $limit)
        ];
    }

    $jsonOutput = json_encode($response, JSON_UNESCAPED_UNICODE);
    if ($isDefaultRequest) {
        file_put_contents($cacheFile, $jsonOutput);
        file_put_contents($cacheGzFile, gzencode($jsonOutput, 6));
    }
    echo $jsonOutput;

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success'    => false,
        'error_code' => 'FUEL_FETCH_ERROR',
        'message'    => 'Gagal mengambil data analitik BBM',
        'error'      => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
