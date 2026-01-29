<?php
function load_config(): array
{
    static $config;
    if (!$config) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

function send_json($data, int $status = 200): void
{
    header('Content-Type: application/json; charset=UTF-8');
    $origin = get_allowed_origin();
    if ($origin !== null) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function require_method(string $method): void
{
    enforce_cors();
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        send_json(['ok' => true], 200);
    }
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        send_json(['success' => false, 'message' => 'method_not_allowed'], 405);
    }
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function normalize_email(string $email): string
{
    return strtolower(trim($email));
}

function sanitize_text(string $text): string
{
    // XSS koruması: HTML tag'lerini temizle
    $text = strip_tags($text);
    // Fazla boşlukları temizle
    $text = preg_replace('/\s+/', ' ', $text);
    // Başta ve sonda boşlukları temizle
    $text = trim($text);
    // Null byte'ları temizle
    $text = str_replace("\0", '', $text);
    return $text;
}

function get_allowed_origin(): ?string
{
    $config = load_config();
    $allowed = $config['cors_origin'] ?? '*';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if ($allowed === '*') {
        return '*';
    }
    if ($origin === '') {
        return null;
    }
    if (is_array($allowed) && in_array($origin, $allowed, true)) {
        return $origin;
    }
    if (is_string($allowed) && $allowed === $origin) {
        return $origin;
    }
    return null;
}

function enforce_cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return;
    }
    if (get_allowed_origin() === null) {
        send_json(['success' => false, 'message' => 'cors_forbidden'], 403);
    }
}

function get_auth_token(): ?string
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (is_string($auth) && stripos($auth, 'Bearer ') === 0) {
        return trim(substr($auth, 7));
    }
    $token = $headers['X-Auth-Token'] ?? $headers['x-auth-token'] ?? ($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
    return is_string($token) && $token !== '' ? $token : null;
}

function require_auth(PDO $pdo): array
{
    $token = get_auth_token();
    if (!$token) {
        send_json(['success' => false, 'message' => 'unauthorized'], 401);
    }
    $stmt = $pdo->prepare('SELECT users.id, users.full_name AS name, users.email, users.role, users.company, users.phone, users.approved
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = ? AND sessions.expires_at > CURRENT_TIMESTAMP');
    $stmt->execute([$token]);
    $user = $stmt->fetch();
    if (!$user) {
        send_json(['success' => false, 'message' => 'unauthorized'], 401);
    }
    if (($user['role'] ?? '') !== 'admin' && (int)($user['approved'] ?? 0) !== 1) {
        send_json(['success' => false, 'message' => 'not_approved'], 403);
    }
    return $user;
}

function require_admin(array $user): void
{
    if (($user['role'] ?? '') !== 'admin') {
        send_json(['success' => false, 'message' => 'forbidden'], 403);
    }
}

function enforce_rate_limit(PDO $pdo, string $key, int $limit, int $windowSeconds): void
{
    $config = load_config();
    $whitelist = $config['rate_limit_whitelist'] ?? [];
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if ($ip !== '') {
        if (is_array($whitelist) && in_array($ip, $whitelist, true)) {
            return;
        }
        if (is_string($whitelist) && $whitelist === $ip) {
            return;
        }
    }
    $now = time();
    $stmt = $pdo->prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    if ($row) {
        $resetAt = strtotime($row['reset_at']);
        if ($resetAt <= $now) {
            $stmt = $pdo->prepare('UPDATE rate_limits SET count = 1, reset_at = ? WHERE key = ?');
            $stmt->execute([date('Y-m-d H:i:s', $now + $windowSeconds), $key]);
            return;
        }
        $count = (int)$row['count'] + 1;
        if ($count > $limit) {
            send_json(['success' => false, 'message' => 'rate_limited'], 429);
        }
        $stmt = $pdo->prepare('UPDATE rate_limits SET count = ? WHERE key = ?');
        $stmt->execute([$count, $key]);
        return;
    }
    $stmt = $pdo->prepare('INSERT INTO rate_limits (key, count, reset_at) VALUES (?, ?, ?)');
    $stmt->execute([$key, 1, date('Y-m-d H:i:s', $now + $windowSeconds)]);
}
