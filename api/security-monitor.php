# Güvenlik İzleme ve Loglama

# Bu dosya güvenlik olaylarını loglar
# Sunucu log dizinine yazılır

<?php
function log_security_event($event_type, $details = []) {
    $log_file = __DIR__ . '/../storage/security.log';
    $timestamp = date('Y-m-d H:i:s');
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
    $request_uri = $_SERVER['REQUEST_URI'] ?? 'unknown';
    
    $log_entry = [
        'timestamp' => $timestamp,
        'event_type' => $event_type,
        'ip' => $ip,
        'user_agent' => $user_agent,
        'request_uri' => $request_uri,
        'details' => $details
    ];
    
    $log_line = json_encode($log_entry, JSON_UNESCAPED_UNICODE) . "\n";
    
    // Log dosyasına yaz (append mode)
    @file_put_contents($log_file, $log_line, FILE_APPEND | LOCK_EX);
    
    // Log dosyası çok büyükse temizle (10MB'dan büyükse)
    if (file_exists($log_file) && filesize($log_file) > 10 * 1024 * 1024) {
        $lines = file($log_file);
        $keep_lines = array_slice($lines, -10000); // Son 10000 satırı tut
        file_put_contents($log_file, implode('', $keep_lines), LOCK_EX);
    }
}

function detect_suspicious_activity() {
    $suspicious_patterns = [
        '/home/',
        'z0f76a1d14fd21a8fb5fd0d03e0fdc3d3cedae52f',
        'wsidchk',
        'pdata',
        'eval(',
        'base64_decode',
        'gzinflate',
        'shell_exec',
        'system(',
        'exec(',
        'passthru',
        'proc_open',
        'file_get_contents.*http',
        'file_put_contents',
        'move_uploaded_file'
    ];
    
    $request_uri = $_SERVER['REQUEST_URI'] ?? '';
    $query_string = $_SERVER['QUERY_STRING'] ?? '';
    $post_data = file_get_contents('php://input');
    
    $all_data = $request_uri . ' ' . $query_string . ' ' . $post_data;
    
    foreach ($suspicious_patterns as $pattern) {
        if (preg_match('/' . preg_quote($pattern, '/') . '/i', $all_data)) {
            log_security_event('suspicious_pattern_detected', [
                'pattern' => $pattern,
                'request_uri' => $request_uri,
                'query_string' => $query_string
            ]);
            return true;
        }
    }
    
    return false;
}

// Otomatik şüpheli aktivite tespiti
if (php_sapi_name() !== 'cli') {
    detect_suspicious_activity();
}
?>