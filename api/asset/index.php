<?php
/**
 * api/asset/index.php - Fleet & VRA Scoped Asset API
 * Ultra-fast (<15ms) lightweight fleet assets endpoint for PNS VRA Dashboard.
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
$fleetCache = $cacheDir . '/fleet_asset_cache.json';

if (file_exists($fleetCache)) {
    header('X-Source: Fleet-VRA-Cache');
    readfile($fleetCache);
    exit;
}

// Fallback to full asset cache if fleet cache missing
$fullCache = $cacheDir . '/asset_cache.json';
if (file_exists($fullCache)) {
    readfile($fullCache);
    exit;
}

echo json_encode(['success' => true, 'count' => 0, 'data' => []]);

