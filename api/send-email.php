<?php
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/db.php';

try {
    require_method('POST');
    $data = read_json_body();

    $pdo = get_db();
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $token = get_auth_token();
    $isAdmin = false;

    if ($token) {
        $stmt = $pdo->prepare('SELECT users.id, users.full_name AS name, users.email, users.role, users.company, users.phone, users.approved
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ? AND sessions.expires_at > CURRENT_TIMESTAMP');
        $stmt->execute([$token]);
        $authUser = $stmt->fetch();
        if ($authUser && ($authUser['role'] ?? '') === 'admin') {
            $isAdmin = true;
        }
    }

    $to = normalize_email($data['to'] ?? '');
    $subject = trim((string)($data['subject'] ?? ''));
    $body = trim((string)($data['body'] ?? ''));

    if ($to === '' || $subject === '' || $body === '') {
        send_json(['success' => false, 'message' => 'missing_fields'], 422);
    }
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        send_json(['success' => false, 'message' => 'invalid_email'], 422);
    }

    if (!$isAdmin) {
        $config = load_config();
        $allowedTo = normalize_email($config['contact_to'] ?? '');
        if ($allowedTo === '' || $to !== $allowedTo) {
            send_json(['success' => false, 'message' => 'forbidden'], 403);
        }
        enforce_rate_limit($pdo, "contact_email:{$ip}", 5, 3600);
    } else {
        enforce_rate_limit($pdo, "send_email:{$ip}", 30, 3600);
    }

    $host = getenv('SMTP_HOST') ?: '';
    $port = (int)(getenv('SMTP_PORT') ?: 465);
    $user = getenv('SMTP_USER') ?: '';
    $pass = getenv('SMTP_PASS') ?: '';
    $from = getenv('SMTP_FROM') ?: $user;
    $fromName = getenv('SMTP_FROM_NAME') ?: 'EYS Global';
    $security = strtolower(getenv('SMTP_SECURITY') ?: 'ssl');

    if ($host === '' || $user === '' || $pass === '' || $from === '') {
        send_json(['success' => false, 'message' => 'smtp_not_configured'], 500);
    }

    function smtp_read($socket): string
    {
        $data = '';
        while ($line = fgets($socket, 515)) {
            $data .= $line;
            if (preg_match('/^\d{3} /', $line)) {
                break;
            }
        }
        return $data;
    }

    function smtp_cmd($socket, ?string $command, array $expectedCodes): string
    {
        if ($command !== null) {
            fwrite($socket, $command . "\r\n");
        }
        $response = smtp_read($socket);
        $code = substr($response, 0, 3);
        if (!in_array($code, $expectedCodes, true)) {
            throw new Exception(trim($response));
        }
        return $response;
    }

    $remote = ($security === 'ssl' || $port === 465)
        ? "ssl://{$host}:{$port}"
        : "{$host}:{$port}";

    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true
        ]
    ]);

    $socket = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        throw new Exception("SMTP connection failed: {$errstr} (Error {$errno})");
    }

    smtp_cmd($socket, null, ['220']);
    $hostname = gethostname() ?: 'localhost';
    smtp_cmd($socket, "EHLO {$hostname}", ['250']);

    if ($security === 'tls' && $port !== 465) {
        smtp_cmd($socket, 'STARTTLS', ['220']);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new Exception('STARTTLS failed');
        }
        smtp_cmd($socket, "EHLO {$hostname}", ['250']);
    }

    smtp_cmd($socket, 'AUTH LOGIN', ['334']);
    smtp_cmd($socket, base64_encode($user), ['334']);
    smtp_cmd($socket, base64_encode($pass), ['235']);

    smtp_cmd($socket, "MAIL FROM:<{$from}>", ['250']);
    smtp_cmd($socket, "RCPT TO:<{$to}>", ['250', '251']);
    smtp_cmd($socket, 'DATA', ['354']);

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $fromDomain = '';
    $atPos = strrpos($from, '@');
    if ($atPos !== false) {
        $fromDomain = substr($from, $atPos + 1);
    }
    $messageIdDomain = $fromDomain !== '' ? $fromDomain : $host;
    $messageId = '<' . bin2hex(random_bytes(12)) . '@' . $messageIdDomain . '>';

    $headers = [
        "From: {$fromName} <{$from}>",
        "Reply-To: {$fromName} <{$from}>",
        "To: <{$to}>",
        "Subject: {$encodedSubject}",
        "Message-ID: {$messageId}",
        "Date: " . date('r'),
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: quoted-printable",
        "X-Mailer: EYS Global Portal"
    ];

    $safeBody = str_replace(["\r\n", "\r"], "\n", $body);
    $safeBody = str_replace("\n.", "\n..", $safeBody);
    $encodedBody = quoted_printable_encode($safeBody);
    $message = implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n", "\r\n", $encodedBody);

    fwrite($socket, $message . "\r\n.\r\n");
    smtp_cmd($socket, null, ['250']);
    smtp_cmd($socket, 'QUIT', ['221']);
    fclose($socket);

    send_json(['success' => true]);
} catch (Exception $e) {
    error_log("Send email error: " . $e->getMessage());
    send_json(['success' => false, 'message' => 'smtp_error', 'detail' => $e->getMessage()], 500);
} catch (Error $e) {
    error_log("Send email fatal error: " . $e->getMessage());
    send_json(['success' => false, 'message' => 'server_error', 'detail' => $e->getMessage()], 500);
} catch (Throwable $e) {
    error_log("Send email throwable error: " . $e->getMessage());
    send_json(['success' => false, 'message' => 'server_error', 'detail' => $e->getMessage()], 500);
}
