<?php
ob_start();
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/db.php';

// Hataları yakalayıp JSON olarak döndürmek için shutdown fonksiyonu
register_shutdown_function(function() {
    $error = error_get_last();
    $fatals = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR];
    if ($error && in_array($error['type'], $fatals)) {
        if (ob_get_length()) ob_clean();
        header('Content-Type: application/json; charset=UTF-8');
        header('Access-Control-Allow-Origin: *'); // Fail-safe CORS
        echo json_encode([
            'success' => false,
            'message' => 'fatal_error',
            'detail' => $error['message'],
            'file' => basename($error['file']),
            'line' => $error['line']
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
});

function smtp_read($socket): string {
    $data = '';
    while ($line = fgets($socket, 515)) {
        $data .= $line;
        if (preg_match('/^\d{3} /', $line)) break;
    }
    return $data;
}

function smtp_cmd($socket, ?string $command, array $expectedCodes): string {
    if ($command !== null) fwrite($socket, $command . "\r\n");
    $response = smtp_read($socket);
    $code = substr($response, 0, 3);
    if (!in_array($code, $expectedCodes, true)) throw new Exception(trim($response));
    return $response;
}

$config = load_config();
$pdo = null;

try {
    require_method('POST');
    $data = read_json_body();

    // Veritabanı bağlantısı (Hata alsa bile mail gönderimini engellememesi için try-catch içinde)
    try {
        $pdo = get_db();
    } catch (Throwable $dbErr) {
        error_log("DB connection failed in send-email: " . $dbErr->getMessage());
    }

    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $token = get_auth_token();
    $isAdmin = false;

    if ($token && $pdo) {
        $stmt = $pdo->prepare('SELECT role FROM users JOIN sessions ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at > CURRENT_TIMESTAMP');
        $stmt->execute([$token]);
        $authUser = $stmt->fetch();
        if ($authUser && ($authUser['role'] ?? '') === 'admin') $isAdmin = true;
    }

    $to = normalize_email($data['to'] ?? '');
    $subject = trim((string)($data['subject'] ?? ''));
    $body = trim((string)($data['body'] ?? ''));

    if ($to === '' || $subject === '' || $body === '') {
        send_json(['success' => false, 'message' => 'missing_fields'], 422);
    }
    
    if (!$isAdmin) {
        $allowedTo = normalize_email($config['contact_to'] ?? '');
        if ($allowedTo === '' || $to !== $allowedTo) send_json(['success' => false, 'message' => 'forbidden'], 403);
        if ($pdo) enforce_rate_limit($pdo, "contact_email:{$ip}", 10, 3600);
    }

    $smtp = $config['smtp'] ?? [];
    $host = $smtp['host'] ?? '';
    $port = (int)($smtp['port'] ?? 465);
    $user = $smtp['user'] ?? '';
    $pass = $smtp['pass'] ?? '';
    $from = $smtp['from'] ?? $user;
    $fromName = $smtp['from_name'] ?? 'EYS Global';
    $security = strtolower($smtp['security'] ?? 'ssl');

    if ($host === '' || $user === '' || $pass === '') {
        throw new Exception("SMTP ayarları eksik. Lütfen api/config.php dosyasını kontrol edin.");
    }

    $remote = ($security === 'ssl' || $port === 465) ? "ssl://{$host}:{$port}" : "{$host}:{$port}";
    $socket = @stream_socket_client($remote, $errno, $errstr, 10);
    
    if (!$socket) throw new Exception("SMTP bağlantı hatası: $errstr ($errno)");

    smtp_cmd($socket, null, ['220']);
    $hostname = gethostname() ?: 'localhost';
    smtp_cmd($socket, "EHLO $hostname", ['250']);
    smtp_cmd($socket, 'AUTH LOGIN', ['334']);
    smtp_cmd($socket, base64_encode($user), ['334']);
    smtp_cmd($socket, base64_encode($pass), ['235']);

    smtp_cmd($socket, "MAIL FROM:<$from>", ['250']);
    smtp_cmd($socket, "RCPT TO:<$to>", ['250', '251']);
    smtp_cmd($socket, 'DATA', ['354']);

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $messageId = '<' . bin2hex(random_bytes(12)) . '@' . ($smtp['host'] ?? 'eysglobal.com.tr') . '>';

    $headers = [
        "From: $fromName <$from>",
        "To: <$to>",
        "Subject: $encodedSubject",
        "Message-ID: $messageId",
        "Date: " . date('r'),
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: quoted-printable"
    ];

    $encodedBody = quoted_printable_encode(str_replace(["\r\n", "\r"], "\n", $body));
    $message = implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n", "\r\n", $encodedBody) . "\r\n.\r\n";

    fwrite($socket, $message);
    smtp_cmd($socket, null, ['250']);
    smtp_cmd($socket, 'QUIT', ['221']);
    fclose($socket);

    if (ob_get_length()) ob_end_clean();
    send_json(['success' => true]);

} catch (Throwable $e) {
    if (ob_get_length()) ob_end_clean();
    error_log("Email API Error: " . $e->getMessage());
    send_json([
        'success' => false,
        'message' => 'server_error',
        'detail' => $e->getMessage(),
        'file' => basename($e->getFile()),
        'line' => $e->getLine()
    ], 500);
}

