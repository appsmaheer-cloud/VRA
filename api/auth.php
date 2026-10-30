<?php
require_once '../config/database.php';
session_start();

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$username = $input['username'] ?? '';
$password = $input['password'] ?? '';
$ip = $_SERVER['REMOTE_ADDR'];

if (empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing username or password']);
    exit;
}

try {
    $stmt = $pdo->prepare("SELECT user_id, password_hash, role FROM users WHERE username = :username");
    $stmt->execute(['username' => $username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user && password_verify($password, $user['password_hash'])) {
        // Success
        $_SESSION['user_id'] = $user['user_id'];
        $_SESSION['role'] = $user['role'];
        
        $logStmt = $pdo->prepare("INSERT INTO security_logs (user_id, action, ip_address) VALUES (:id, 'LOGIN_SUCCESS', :ip)");
        $logStmt->execute(['id' => $user['user_id'], 'ip' => $ip]);

        echo json_encode(['success' => true, 'role' => $user['role']]);
    } else {
        // Failed
        $logStmt = $pdo->prepare("INSERT INTO security_logs (username_attempt, action, ip_address) VALUES (:username, 'LOGIN_FAILED', :ip)");
        $logStmt->execute(['username' => $username, 'ip' => $ip]);

        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error']);
}
?>
