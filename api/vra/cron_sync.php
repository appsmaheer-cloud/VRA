<?php
/**
 * api/vra/cron_sync.php
 * CLI Script for Windows Task Scheduler / Cron to sync authentic VRA data periodically.
 * Usage: php api/vra/cron_sync.php
 */

if (php_sapi_name() !== 'cli' && empty($_GET['cron_key'])) {
    http_response_code(403);
    die("CLI access only.\n");
}

require_once __DIR__ . '/vra_engine.php';

echo "[" . date('Y-m-d H:i:s') . "] Starting periodic VRA sync...\n";
$res = performVraSync();

if ($res['success']) {
    echo "[" . date('Y-m-d H:i:s') . "] SUCCESS: {$res['count']} records, {$res['distinct_units']} units synced in {$res['duration_seconds']}s.\n";
} else {
    echo "[" . date('Y-m-d H:i:s') . "] ERROR: {$res['message']}\n";
}
