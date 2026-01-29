<?php
require_once __DIR__ . '/../db.php';

require_method('POST');
$data = read_json_body();
$action = $data['action'] ?? '';

$pdo = get_db();
$authUser = require_auth($pdo);
require_admin($authUser);

if ($action === 'list') {
    $role = $data['role'] ?? null;
    if ($role) {
        $stmt = $pdo->prepare('SELECT id, full_name AS name, email, role, company, phone, approved, last_login, created_at FROM users WHERE role = ? ORDER BY created_at DESC');
        $stmt->execute([$role]);
    } else {
        $stmt = $pdo->query('SELECT id, full_name AS name, email, role, company, phone, approved, last_login, created_at FROM users ORDER BY created_at DESC');
    }
    $users = $stmt->fetchAll();
    send_json(['success' => true, 'users' => $users]);
}

if ($action === 'create') {
    $name = sanitize_text($data['name'] ?? '');
    $email = normalize_email($data['email'] ?? '');
    $password = (string)($data['password'] ?? '');
    $company = sanitize_text($data['company'] ?? '');
    $phone = sanitize_text($data['phone'] ?? '');
    $role = $data['role'] ?? 'client';
    $approved = isset($data['approved']) ? (int)(bool)$data['approved'] : 1;

    if ($name === '' || $email === '' || $password === '') {
        send_json(['success' => false, 'message' => 'missing_fields'], 422);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send_json(['success' => false, 'message' => 'invalid_email'], 422);
    }

    $check = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $check->execute([$email]);
    if ($check->fetch()) {
        send_json(['success' => false, 'message' => 'email_exists'], 409);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $insert = $pdo->prepare('INSERT INTO users (full_name, email, password_hash, role, company, phone, approved) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $insert->execute([$name, $email, $hash, $role, $company, $phone, $approved]);
    $userId = (int)$pdo->lastInsertId();

    send_json([
        'success' => true,
        'user' => [
            'id' => $userId,
            'name' => $name,
            'email' => $email,
            'role' => $role,
            'company' => $company,
            'phone' => $phone,
            'approved' => $approved
        ]
    ], 201);
}

if ($action === 'update') {
    $id = (int)($data['id'] ?? 0);
    if ($id <= 0) {
        send_json(['success' => false, 'message' => 'missing_id'], 422);
    }

    $name = sanitize_text($data['name'] ?? '');
    $email = normalize_email($data['email'] ?? '');
    $company = sanitize_text($data['company'] ?? '');
    $phone = sanitize_text($data['phone'] ?? '');
    $role = $data['role'] ?? null;
    $approved = isset($data['approved']) ? (int)(bool)$data['approved'] : null;
    $password = (string)($data['password'] ?? '');

    if ($email !== '') {
        $check = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
        $check->execute([$email, $id]);
        if ($check->fetch()) {
            send_json(['success' => false, 'message' => 'email_exists'], 409);
        }
    }

    $fields = [];
    $values = [];
    if ($name !== '') {
        $fields[] = 'full_name = ?';
        $values[] = $name;
    }
    if ($email !== '') {
        $fields[] = 'email = ?';
        $values[] = $email;
    }
    if ($company !== '') {
        $fields[] = 'company = ?';
        $values[] = $company;
    }
    if ($phone !== '') {
        $fields[] = 'phone = ?';
        $values[] = $phone;
    }
    if ($role !== null) {
        $fields[] = 'role = ?';
        $values[] = $role;
    }
    if ($approved !== null) {
        $fields[] = 'approved = ?';
        $values[] = $approved;
    }
    if ($password !== '') {
        $fields[] = 'password_hash = ?';
        $values[] = password_hash($password, PASSWORD_DEFAULT);
    }

    if (count($fields) === 0) {
        send_json(['success' => false, 'message' => 'no_changes'], 422);
    }

    $values[] = $id;
    $stmt = $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?');
    $stmt->execute($values);

    $stmt = $pdo->prepare('SELECT id, full_name AS name, email, role, company, phone, approved, last_login, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();

    send_json(['success' => true, 'user' => $user]);
}

if ($action === 'delete') {
    $id = (int)($data['id'] ?? 0);
    if ($id <= 0) {
        send_json(['success' => false, 'message' => 'missing_id'], 422);
    }

    $check = $pdo->prepare('SELECT role FROM users WHERE id = ?');
    $check->execute([$id]);
    $user = $check->fetch();
    if (!$user) {
        send_json(['success' => false, 'message' => 'not_found'], 404);
    }

    if ($user['role'] === 'admin') {
        $count = $pdo->query("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'")->fetch();
        if ((int)$count['total'] <= 1) {
            send_json(['success' => false, 'message' => 'last_admin'], 409);
        }
    }

    $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$id]);
    send_json(['success' => true]);
}

send_json(['success' => false, 'message' => 'invalid_action'], 400);
