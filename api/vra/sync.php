<?php
/**
 * api/vra/sync.php
 * Manual & programmatic trigger to sync authentic VRA data from central server.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

set_time_limit(300);
ini_set('memory_limit', '1024M');

require_once __DIR__ . '/vra_engine.php';

$res = performVraSync();
echo json_encode($res, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
