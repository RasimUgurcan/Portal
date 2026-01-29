<?php
// Güvenlik: Hata gösterimini kapat
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

header('Content-Type: text/html; charset=UTF-8');

// Rate limiting için basit kontrol
session_start();
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateLimitKey = 'contact_form_' . md5($ip);
$rateLimitCount = $_SESSION[$rateLimitKey] ?? 0;
$rateLimitTime = $_SESSION[$rateLimitKey . '_time'] ?? 0;

if ($rateLimitTime > time() - 3600) {
    if ($rateLimitCount >= 5) {
        http_response_code(429);
        die('Too many requests. Please try again later.');
    }
    $_SESSION[$rateLimitKey] = $rateLimitCount + 1;
} else {
    $_SESSION[$rateLimitKey] = 1;
    $_SESSION[$rateLimitKey . '_time'] = time();
}

$to = 'danisman@eysglobal.com.tr';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.html#contact');
    exit;
}

// Input sanitization ve validation
$name = trim($_POST['Ad Soyad'] ?? '');
$email = trim($_POST['E-posta'] ?? '');
$company = trim($_POST['Şirket / Kurum'] ?? '');
$message = trim($_POST['Mesaj'] ?? '');

// XSS koruması: HTML tag'lerini temizle
$name = strip_tags($name);
$email = strip_tags($email);
$company = strip_tags($company);
$message = strip_tags($message);

// Uzunluk limitleri
if (mb_strlen($name) > 200 || mb_strlen($email) > 200 || mb_strlen($company) > 200 || mb_strlen($message) > 5000) {
    http_response_code(422);
    die('Input too long.');
}

// Basic validation
if ($name === '' || $email === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    if (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'fetch') {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'validation_error']);
        exit;
    }
    header('Location: index.html?status=error#contact');
    exit;
}

// Prevent header injection - daha güvenli
$safeName = preg_replace("/[\r\n]+/", ' ', $name);
$safeEmail = preg_replace("/[\r\n]+/", ' ', $email);
$safeCompany = preg_replace("/[\r\n]+/", ' ', $company);
$safeMessage = preg_replace("/[\r\n]+/", ' ', $message);

// Email formatını tekrar kontrol et
if (!filter_var($safeEmail, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    die('Invalid email format.');
}

$subject = 'EYS Global Teklif Formu';
if (function_exists('mb_encode_mimeheader')) {
    $subject = mb_encode_mimeheader($subject, 'UTF-8', 'B');
}

$bodyLines = [
    "Ad Soyad: " . $safeName,
    "E-posta: " . $safeEmail,
    "Şirket / Kurum: " . ($safeCompany !== '' ? $safeCompany : '-'),
    "Mesaj:",
    $safeMessage
];
$body = implode("\n", $bodyLines);

$headers = [];
$headers[] = 'From: EYS Global <no-reply@eysglobal.com.tr>';
$headers[] = 'Reply-To: ' . $safeEmail;
$headers[] = 'Content-Type: text/plain; charset=UTF-8';
$headers[] = 'X-Mailer: EYS Global Contact Form';

$sent = @mail($to, $subject, $body, implode("\r\n", $headers));

if ($sent) {
    if (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'fetch') {
        echo json_encode(['success' => true]);
        exit;
    }
    header('Location: index.html?status=ok#contact');
} else {
    if (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'fetch') {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'send_failed']);
        exit;
    }
    header('Location: index.html?status=error#contact');
}
exit;
?>
