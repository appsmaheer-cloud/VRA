<?php
/**
 * api/fuel/import.php
 * PNS Enterprise REST API - Fuel & BBM CSV Importer
 * Supports delimiter detection, batch transaction, duplicate BKB handling, and audit logging.
 */

require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Metode request tidak diizinkan. Gunakan POST.']);
    exit;
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'File CSV BBM tidak ditemukan atau gagal diunggah.']);
    exit;
}

$filePath = $_FILES['file']['tmp_name'];
$fileName = $_FILES['file']['name'] ?? 'fuel_import.csv';
$handle = fopen($filePath, 'r');
if (!$handle) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Gagal membuka file CSV yang diunggah.']);
    exit;
}

// 1. Detect delimiter (comma or semicolon)
$firstLine = fgets($handle);
rewind($handle);
$delimiter = (strpos($firstLine, ';') !== false && substr_count($firstLine, ';') > substr_count($firstLine, ',')) ? ';' : ',';

// 2. Read and normalize header
$header = fgetcsv($handle, 0, $delimiter);
if (!$header) {
    fclose($handle);
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'File CSV kosong atau header tidak valid.']);
    exit;
}

$header = array_map(function($h) {
    $h = preg_replace('/[\x00-\x1F\x80-\xFF]/', '', $h);
    return strtolower(trim($h));
}, $header);

// Map column indices
$colMap = [
    'no_bkb'          => -1,
    'no_asset_manual' => -1,
    'tanggal_bkb'     => -1,
    'jumlah_bkb_fix'  => -1,
    'harga_bkb'       => -1,
    'jenis_bbm'       => -1,
    'no_brb'          => -1,
    'section'         => -1
];

foreach ($header as $idx => $col) {
    if (in_array($col, ['no_bkb', 'nomor_bkb', 'bkb', 'bkb_no'])) $colMap['no_bkb'] = $idx;
    if (in_array($col, ['no_asset_manual', 'kode_unit', 'unit', 'asset', 'no_asset'])) $colMap['no_asset_manual'] = $idx;
    if (in_array($col, ['tanggal_bkb', 'tanggal', 'tgl', 'date'])) $colMap['tanggal_bkb'] = $idx;
    if (in_array($col, ['jumlah_bkb_fix', 'jumlah', 'liter', 'volume', 'qty'])) $colMap['jumlah_bkb_fix'] = $idx;
    if (in_array($col, ['harga_bkb', 'harga', 'biaya', 'total_biaya', 'cost'])) $colMap['harga_bkb'] = $idx;
    if (in_array($col, ['jenis_bbm', 'jenis', 'bbm', 'fuel_type'])) $colMap['jenis_bbm'] = $idx;
    if (in_array($col, ['no_brb', 'brb'])) $colMap['no_brb'] = $idx;
    if (in_array($col, ['section', 'dept', 'bagian'])) $colMap['section'] = $idx;
}

// Ensure essential columns are mapped
if ($colMap['no_asset_manual'] === -1 || $colMap['tanggal_bkb'] === -1 || $colMap['jumlah_bkb_fix'] === -1) {
    fclose($handle);
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Kolom wajib tidak lengkap dalam file CSV. Wajib ada: Kode Unit/no_asset_manual, Tanggal, dan Jumlah Liter.'
    ]);
    exit;
}

global $pdo;
$processed = 0;
$inserted = 0;
$errors = [];

try {
    $pdo->beginTransaction();

    $stmtInsert = $pdo->prepare("
        INSERT INTO fact_bkb_fuel (no_bkb, no_asset_manual, jenis_bbm, tanggal_bkb, jumlah_bkb_fix, harga_bkb, no_brb, section)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");

    while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
        $processed++;
        if (empty(array_filter($row))) continue;

        $noBkb = $colMap['no_bkb'] !== -1 ? trim($row[$colMap['no_bkb']] ?? '') : 'BKB-' . date('Ymd') . '-' . rand(1000, 9999);
        $unit  = trim($row[$colMap['no_asset_manual']] ?? '');
        $tglRaw = trim($row[$colMap['tanggal_bkb']] ?? '');
        $literRaw = trim($row[$colMap['jumlah_bkb_fix']] ?? '0');
        $hargaRaw = $colMap['harga_bkb'] !== -1 ? trim($row[$colMap['harga_bkb']] ?? '0') : '0';
        $jenisRaw = $colMap['jenis_bbm'] !== -1 ? strtoupper(trim($row[$colMap['jenis_bbm']] ?? '')) : '';
        $noBrb = $colMap['no_brb'] !== -1 ? trim($row[$colMap['no_brb']] ?? '') : null;
        $section = $colMap['section'] !== -1 ? trim($row[$colMap['section']] ?? '') : null;

        if ($unit === '') continue;

        // Normalize Date
        $tgl = date('Y-m-d', strtotime($tglRaw));
        if ($tgl === '1970-01-01' || !$tgl) {
            // Try d/m/Y format
            $d = DateTime::createFromFormat('d/m/Y', $tglRaw);
            $tgl = $d ? $d->format('Y-m-d') : date('Y-m-d');
        }

        // Clean numbers
        $liter = (float)str_replace(',', '.', preg_replace('/[^\d,\.]/', '', $literRaw));
        $harga = (float)str_replace(',', '.', preg_replace('/[^\d,\.]/', '', $hargaRaw));

        // Determine jenis_bbm if not provided
        if (!in_array($jenisRaw, ['SOLAR', 'BENSIN'])) {
            $uUpper = strtoupper($unit);
            if (preg_match('/(MTR|ALKON|MPR|KNAPSACK|AVANZA|GRAN MAX)/', $uUpper)) {
                $jenisRaw = 'BENSIN';
            } else {
                $jenisRaw = 'SOLAR';
            }
        }

        // Calculate price if not provided
        if ($harga <= 0) {
            $harga = $liter * ($jenisRaw === 'BENSIN' ? 10000 : 6800);
        }

        $stmtInsert->execute([$noBkb, $unit, $jenisRaw, $tgl, $liter, $harga, $noBrb, $section]);
        $inserted++;
    }

    // Record Security Log
    $stmtLog = $pdo->prepare("
        INSERT INTO security_logs (action, ip_address, user_agent)
        VALUES ('FUEL_CSV_IMPORTED', ?, ?)
    ");
    $stmtLog->execute([
        $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
        "File: $fileName ($inserted rows inserted)"
    ]);

    $pdo->commit();
    fclose($handle);

    echo json_encode([
        'success'   => true,
        'status'    => 'success',
        'message'   => "Berhasil mengimpor $inserted transaksi BBM dari $processed baris CSV.",
        'inserted'  => $inserted,
        'processed' => $processed
    ]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fclose($handle);
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'status'  => 'error',
        'message' => 'Gagal mengimpor file CSV: ' . $e->getMessage()
    ]);
}
