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
            id,
            action as level,
            COALESCE((SELECT username FROM users WHERE user_id = s.user_id), username_attempt, 'Unknown') as user,
            action,
            ip_address as ip,
            DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') as timestamp
        FROM security_logs s
        ORDER BY timestamp DESC
        LIMIT 100
    ");
    
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Untuk dummy level/keparahan (mapping dari action)
    foreach ($logs as &$log) {
        if (strpos($log['action'], 'FAILED') !== false || strpos($log['action'], 'DELETED') !== false) {
            $log['level'] = 'CRITICAL';
        } elseif (strpos($log['action'], 'EXPORT') !== false) {
            $log['level'] = 'WARNING';
        } else {
            $log['level'] = 'INFO';
        }
    }
    
    echo json_encode($logs);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error', 'message' => $e->getMessage()]);
}
?>
