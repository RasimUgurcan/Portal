<?php
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../db.php';

require_method('POST');
$data = read_json_body();

$email = normalize_email($data['email'] ?? '');
$password = (string)($data['password'] ?? '');

if ($email === '' || $password === '') {
    send_json(['success' => false, 'message' => 'missing_fields'], 422);
}

$pdo = get_db();
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
enforce_rate_limit($pdo, "login:{$ip}", 10, 900);

$stmt = $pdo->prepare('SELECT id, full_name, email, password_hash, role, company, phone, approved FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user) {
    send_json(['success' => false, 'message' => 'invalid_credentials'], 401);
}

$passwordValid = false;
if (!empty($user['password_hash']) && strlen($user['password_hash']) > 0) {
    $passwordValid = password_verify($password, $user['password_hash']);
}

// If password hash is empty or invalid, try to reset it for admin
if (!$passwordValid) {
    $config = load_config();
    $defaultAdminEmail = normalize_email($config['default_admin_email'] ?? '');
    $defaultAdminPassword = (string)($config['default_admin_password'] ?? '');
    
    // Check if this is the default admin and password matches
    if ($defaultAdminEmail !== '' && $email === $defaultAdminEmail && $password === $defaultAdminPassword) {
        $newHash = password_hash($defaultAdminPassword, PASSWORD_DEFAULT);
        $updateStmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $updateStmt->execute([$newHash, (int)$user['id']]);
        // Re-fetch user after password reset
        $stmt = $pdo->prepare('SELECT id, full_name, email, password_hash, role, company, phone, approved FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        $passwordValid = true;
    } else {
        // If password hash is empty, create a new one (for existing users without password)
        if (empty($user['password_hash']) || strlen($user['password_hash']) === 0) {
            // Don't allow login without password for non-admin users
            send_json(['success' => false, 'message' => 'invalid_credentials'], 401);
        } else {
            send_json(['success' => false, 'message' => 'invalid_credentials'], 401);
        }
    }
}

if (($user['role'] ?? '') !== 'admin' && (int)($user['approved'] ?? 0) !== 1) {
    send_json(['success' => false, 'message' => 'not_approved'], 403);
}

$pdo->prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?')->execute([(int)$user['id']]);

$token = create_session($pdo, (int)$user['id']);

send_json([
    'success' => true,
    'token' => $token,
    'user' => [
        'id' => (int)$user['id'],
        'name' => $user['full_name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'company' => $user['company'],
        'phone' => $user['phone'],
        'approved' => (int)($user['approved'] ?? 0)
    ]
]);
