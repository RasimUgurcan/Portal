<?php
require_once __DIR__ . '/helpers.php';

function get_db(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = load_config();
    $dbPath = $config['database_path'];

    $dir = dirname($dbPath);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');

    ensure_schema($pdo, $config);
    return $pdo;
}

function ensure_schema(PDO $pdo, array $config): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT "client",
        company TEXT,
        phone TEXT,
        approved INTEGER NOT NULL DEFAULT 0,
        last_login TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at TEXT NOT NULL
    )');

    $columns = $pdo->query('PRAGMA table_info(users)')->fetchAll();
    $hasApproved = false;
    $hasLastLogin = false;
    foreach ($columns as $col) {
        if (($col['name'] ?? '') === 'approved') {
            $hasApproved = true;
        }
        if (($col['name'] ?? '') === 'last_login') {
            $hasLastLogin = true;
        }
    }
    if (!$hasApproved) {
        $pdo->exec('ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 0');
        $pdo->exec('UPDATE users SET approved = 1');
    } else {
        $pdo->exec('UPDATE users SET approved = 1 WHERE role = "admin"');
    }
    if (!$hasLastLogin) {
        $pdo->exec('ALTER TABLE users ADD COLUMN last_login TEXT');
    }

    $stmt = $pdo->query('SELECT COUNT(*) AS total FROM users');
    $count = (int)($stmt->fetch()['total'] ?? 0);
    $adminEmail = normalize_email($config['default_admin_email']);
    $adminPassword = $config['default_admin_password'];
    $hash = password_hash($adminPassword, PASSWORD_DEFAULT);
    if ($count === 0) {
        $insert = $pdo->prepare('INSERT INTO users (full_name, email, password_hash, role, approved) VALUES (?, ?, ?, ?, ?)');
        $insert->execute(['EYS Portal Admin', $adminEmail, $hash, 'admin', 1]);
    } else {
        $check = $pdo->prepare('SELECT id, role FROM users WHERE email = ?');
        $check->execute([$adminEmail]);
        $existing = $check->fetch();
        if (!$existing) {
            $insert = $pdo->prepare('INSERT INTO users (full_name, email, password_hash, role, approved) VALUES (?, ?, ?, ?, ?)');
            $insert->execute(['EYS Portal Admin', $adminEmail, $hash, 'admin', 1]);
        } else {
            $pdo->prepare('UPDATE users SET role = "admin", approved = 1 WHERE id = ?')->execute([(int)$existing['id']]);
        }
    }
}

function create_session(PDO $pdo, int $userId, int $ttlSeconds = 604800): string
{
    $token = bin2hex(random_bytes(32));
    $expiresAt = date('Y-m-d H:i:s', time() + $ttlSeconds);
    $stmt = $pdo->prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)');
    $stmt->execute([$userId, $token, $expiresAt]);
    return $token;
}

function get_store_value(PDO $pdo, string $key)
{
    $stmt = $pdo->prepare('SELECT value FROM kv_store WHERE key = ?');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $decoded = json_decode($row['value'], true);
    return $decoded;
}

function set_store_value(PDO $pdo, string $key, $value): void
{
    $encoded = json_encode($value, JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare('INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP');
    $stmt->execute([$key, $encoded]);
}

function delete_store_value(PDO $pdo, string $key): void
{
    $stmt = $pdo->prepare('DELETE FROM kv_store WHERE key = ?');
    $stmt->execute([$key]);
}

function get_all_store_values(PDO $pdo): array
{
    $rows = $pdo->query('SELECT key, value FROM kv_store')->fetchAll();
    $result = [];
    foreach ($rows as $row) {
        $decoded = json_decode($row['value'], true);
        $result[$row['key']] = $decoded;
    }
    return $result;
}
