<?php
require_once '../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

// In a real app, user_id comes from session. For now, we mock it as user_id = 2 (Admin/GA)
$user_id = 2;

$input = json_decode(file_get_contents('php://input'), true);
$report_id = $input['report_id'] ?? null;
$action = $input['action'] ?? null; // 'approve' or 'reject'
$catatan_verifikasi = $input['catatan_verifikasi'] ?? '';

if (!$report_id || !in_array($action, ['approve', 'reject'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid input']);
    exit;
}

try {
    $pdo->beginTransaction();

    // Dapatkan data report
    $stmt = $pdo->prepare("SELECT asset_id, kondisi_baru FROM asset_validation_reports WHERE report_id = :report_id FOR UPDATE");
    $stmt->execute(['report_id' => $report_id]);
    $report = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$report) {
        throw new Exception("Report not found");
    }

    $status_baru = ($action === 'approve') ? 'Disetujui' : 'Ditolak';

    $stmt = $pdo->prepare("UPDATE asset_validation_reports SET status_laporan = :status, verified_by = :verified_by, catatan_verifikasi = :catatan, tanggal_verifikasi = NOW() WHERE report_id = :report_id");
    $stmt->execute([
        'status' => $status_baru,
        'verified_by' => $user_id,
        'catatan' => $catatan_verifikasi,
        'report_id' => $report_id
    ]);

    // Jika di-approve, update status aset
    if ($action === 'approve') {
        $stmt = $pdo->prepare("UPDATE assets SET kondisi = :kondisi, status_validasi = 'Valid', tanggal_validasi_terakhir = NOW() WHERE asset_id = :asset_id");
        $stmt->execute([
            'kondisi' => $report['kondisi_baru'],
            'asset_id' => $report['asset_id']
        ]);
    }

    $pdo->commit();
    echo json_encode(['success' => true, 'message' => "Report {$action} successfully"]);
} catch (Exception $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error', 'message' => $e->getMessage()]);
}
?>
