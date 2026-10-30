<?php
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');

$type = $_GET['type'] ?? filter_input(INPUT_GET, 'type', FILTER_SANITIZE_FULL_SPECIAL_CHARS) ?? '';

try {
    switch ($type) {
        case 'vra':
            $stmt = $pdo->query("SELECT kode_unit, tanggal, aktivitas, jam_awal, jam_selesai, hm_awal, hm_akhir, tujuan FROM fact_vra");
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;
                case 'fuel':
            $stmt = $pdo->query("SELECT no_bkb, no_asset_manual, tanggal_bkb, jumlah_bkb_fix, harga_bkb, no_brb, section FROM fact_bkb_fuel");
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;
        case 'maintenance':
            $stmt = $pdo->query("SELECT kode_unit, tanggal, kategori_barang_jasa, id_kategori_material, id_sub_kategori_material, kategori_material, sub_kategori_material, nama_spare_part_jasa, nominal, kode_section FROM fact_maintenance WHERE kode_unit IN (SELECT DISTINCT kode_unit FROM fact_vra WHERE kode_unit IS NOT NULL AND kode_unit != '') ORDER BY tanggal DESC");
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;
        case 'health':
        case 'monitoring':
            $data = [
                'system' => 'PNS Enterprise Fleet & Asset Engine',
                'status' => 'OPERATIONAL_READY',
                'timestamp' => date('Y-m-d H:i:s'),
                'security' => [
                    'database_connection' => 'SECURE_PDO_ACTIVE',
                    'xss_protection' => 'ENABLED',
                    'frame_options' => 'SAMEORIGIN'
                ],
                'counts' => [
                    'vra_transactions' => (int)$pdo->query("SELECT count(*) FROM fact_vra")->fetchColumn(),
                    'fuel_records' => (int)$pdo->query("SELECT count(*) FROM fact_bkb_fuel")->fetchColumn(),
                    'maintenance_records' => (int)$pdo->query("SELECT count(*) FROM fact_maintenance WHERE kode_unit IN (SELECT DISTINCT kode_unit FROM fact_vra WHERE kode_unit IS NOT NULL AND kode_unit != '')")->fetchColumn()
                ]
            ];
            break;
        default:
            throw new Exception("Invalid data type requested");
    }

    echo json_encode(['status' => 'success', 'data' => $data], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
