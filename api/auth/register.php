<?php
require_once __DIR__ . '/../db.php';

require_method('POST');
$data = read_json_body();

$fullName = sanitize_text($data['fullName'] ?? '');
$email = normalize_email($data['email'] ?? '');
$password = (string)($data['password'] ?? '');
$company = sanitize_text($data['company'] ?? '');
$phone = sanitize_text($data['phone'] ?? '');

$config = load_config();
$minLength = (int)($config['password_min_length'] ?? 6);

if ($fullName === '' || $email === '' || $password === '') {
    send_json(['success' => false, 'message' => 'missing_fields'], 422);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    send_json(['success' => false, 'message' => 'invalid_email'], 422);
}

if (mb_strlen($password) < $minLength) {
    send_json(['success' => false, 'message' => 'weak_password'], 422);
}

$pdo = get_db();
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
enforce_rate_limit($pdo, "register:{$ip}", 5, 3600);
$check = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$check->execute([$email]);
if ($check->fetch()) {
    send_json(['success' => false, 'message' => 'email_exists'], 409);
}

$hash = password_hash($password, PASSWORD_DEFAULT);
$insert = $pdo->prepare('INSERT INTO users (full_name, email, password_hash, role, company, phone, approved) VALUES (?, ?, ?, ?, ?, ?, ?)');
$insert->execute([$fullName, $email, $hash, 'client', $company, $phone, 0]);

$userId = (int)$pdo->lastInsertId();
send_json([
    'success' => true,
    'user' => [
        'id' => $userId,
        'name' => $fullName,
        'email' => $email,
        'role' => 'client',
        'company' => $company,
        'phone' => $phone,
        'approved' => 0
    ]
], 201);
