<?php
require_once '../../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

// In a real app, user_id comes from session. For now, we mock it as user_id = 1
$user_id = 1;

$asset_id = $_POST['asset_id'] ?? null;
$kondisi_baru = $_POST['kondisi_baru'] ?? null;
$catatan_user = $_POST['catatan_user'] ?? null;

if (!$asset_id || !$kondisi_baru) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required fields']);
    exit;
}

// Check if asset exists
$stmt = $pdo->prepare("SELECT asset_id FROM assets WHERE asset_id = :asset_id");
$stmt->execute(['asset_id' => $asset_id]);
if ($stmt->rowCount() === 0) {
    http_response_code(404);
    echo json_encode(['error' => 'Asset not found']);
    exit;
}

// Handle file upload
$foto_path = '';
if (isset($_FILES['foto']) && $_FILES['foto']['error'] === UPLOAD_ERR_OK) {
    $uploadDir = '../../public/uploads/validation/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }
    
    $filename = uniqid('val_') . '_' . basename($_FILES['foto']['name']);
    $targetPath = $uploadDir . $filename;
    
    if (move_uploaded_file($_FILES['foto']['tmp_name'], $targetPath)) {
        $foto_path = 'public/uploads/validation/' . $filename;
    }
}

try {
    $stmt = $pdo->prepare("INSERT INTO asset_validation_reports (asset_id, reported_by, kondisi_baru, catatan_user, foto_kondisi, status_laporan) VALUES (:asset_id, :reported_by, :kondisi_baru, :catatan_user, :foto_kondisi, 'Menunggu Verifikasi')");
    $stmt->execute([
        'asset_id' => $asset_id,
        'reported_by' => $user_id,
        'kondisi_baru' => $kondisi_baru,
        'catatan_user' => $catatan_user,
        'foto_kondisi' => $foto_path
    ]);
    
    echo json_encode(['success' => true, 'message' => 'Laporan berhasil disubmit', 'report_id' => $pdo->lastInsertId()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error', 'message' => $e->getMessage()]);
}
?>
