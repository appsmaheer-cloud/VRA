<?php
require_once '../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

try {
    $stmt = $pdo->query("
        SELECT 
            r.report_id,
            a.kode_unit,
            a.nama_asset,
            r.kondisi_baru,
            r.status_laporan as status,
            u.username as pelapor,
            DATE_FORMAT(r.tanggal_lapor, '%d %b %Y') as tanggal,
            r.foto_kondisi,
            r.catatan_user
        FROM asset_validation_reports r
        JOIN assets a ON r.asset_id = a.asset_id
        JOIN users u ON r.reported_by = u.user_id
        ORDER BY r.tanggal_lapor DESC
    ");
    
    $reports = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($reports);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error', 'message' => $e->getMessage()]);
}
?>
