<?php
require_once __DIR__ . '/../db.php';

require_method('POST');
$data = read_json_body();
$action = $data['action'] ?? '';

$pdo = get_db();
$authUser = require_auth($pdo);

$defaultTemplates = [
    [
        'type' => 'certificate_expiring',
        'subject' => 'Certificate Expiring Soon - {{certificateNumber}}',
        'body' => 'Dear {{clientName}},\n\nYour certificate {{certificateNumber}} will expire on {{expiryDate}}. Please renew it soon.\n\nBest regards,\nEYS Global Team'
    ],
    [
        'type' => 'certificate_expired',
        'subject' => 'Certificate Expired - {{certificateNumber}}',
        'body' => 'Dear {{clientName}},\n\nYour certificate {{certificateNumber}} has expired on {{expiryDate}}. Please renew it immediately.\n\nBest regards,\nEYS Global Team'
    ],
    [
        'type' => 'inspection_info',
        'subject' => 'Inspection Report - {{inspectionType}} for {{clientName}}',
        'body' => 'Dear {{clientName}},\n\nHere is the report for your recent inspection:\n\nInspection Type: {{inspectionType}}\nLocation: {{inspectionLocation}}\nDate: {{inspectionDate}}\nStatus: {{inspectionStatus}}\nNotes: {{inspectionNotes}}\n\nBest regards,\nEYS Global Team'
    ],
    [
        'type' => 'welcome_client',
        'subject' => 'EYS Global Portal hesabınız hazır',
        'body' => 'Merhaba {{clientName}},\n\nEYS Global Portal hesabınız oluşturuldu. Denetim ve sertifika süreçlerinizi bu portal üzerinden takip edebilirsiniz.\n\nGiriş: {{portalUrl}}\nHesap: {{clientEmail}}\n\nHerhangi bir sorunuz olursa bu e-posta üzerinden bize ulaşabilirsiniz.\n\nSaygılarımızla,\nEYS Global'
    ],
    [
        'type' => 'report_info',
        'subject' => 'Inspection Report - {{reportType}} for {{clientName}}',
        'body' => 'Dear {{clientName}},\n\nHere is your report for a recent inspection:\n\nReport Type: {{reportType}}\nLocation: {{reportLocation}}\nDate: {{reportDate}}\nStatus: {{reportStatus}}\nNotes: {{reportNotes}}\n\nBest regards,\nEYS Global Team'
    ]
];

$defaultStore = [
    'inspections' => [],
    'certificates' => [],
    'docCategories' => [],
    'documents' => [],
    'notifications' => [],
    'notificationTemplates' => $defaultTemplates,
    'smtpSettings' => [
        'server' => '',
        'port' => 587,
        'email' => '',
        'password' => ''
    ],
    'certificateSettings' => [
        'notifyDays' => 30,
        'autoReminder' => true
    ]
];

foreach ($defaultStore as $key => $value) {
    if (get_store_value($pdo, $key) === null) {
        set_store_value($pdo, $key, $value);
    }
}

if ($action === 'get_all') {
    if (($authUser['role'] ?? '') === 'admin') {
        $store = get_all_store_values($pdo);
        send_json(['success' => true, 'store' => $store]);
    }
    $store = get_all_store_values($pdo);
    $clientId = (string)($authUser['id'] ?? '');
    $clientEmail = normalize_email($authUser['email'] ?? '');
    $filtered = [];
    foreach ($store as $key => $value) {
        if (!is_array($value)) {
            continue;
        }
        if ($key === 'docCategories') {
            $filtered[$key] = $value;
            continue;
        }
        if (in_array($key, ['inspections', 'certificates', 'notifications', 'documents'], true)) {
            $filtered[$key] = array_values(array_filter($value, function ($item) use ($clientId, $clientEmail) {
                if (!is_array($item)) return false;
                $itemEmail = normalize_email((string)($item['clientEmail'] ?? $item['recipientEmail'] ?? ''));
                $itemId = (string)($item['clientId'] ?? $item['recipientId'] ?? '');
                return ($itemId !== '' && $itemId === $clientId) || ($itemEmail !== '' && $itemEmail === $clientEmail);
            }));
        }
    }
    send_json(['success' => true, 'store' => $filtered]);
}

if ($action === 'get') {
    $key = (string)($data['key'] ?? '');
    if ($key === '') {
        send_json(['success' => false, 'message' => 'missing_key'], 422);
    }
    if (($authUser['role'] ?? '') !== 'admin' && !in_array($key, ['inspections', 'certificates', 'notifications', 'documents', 'docCategories'], true)) {
        send_json(['success' => false, 'message' => 'forbidden'], 403);
    }
    $value = get_store_value($pdo, $key);
    send_json(['success' => true, 'key' => $key, 'value' => $value]);
}

if ($action === 'set') {
    if (($authUser['role'] ?? '') !== 'admin') {
        send_json(['success' => false, 'message' => 'forbidden'], 403);
    }
    $key = (string)($data['key'] ?? '');
    if ($key === '') {
        send_json(['success' => false, 'message' => 'missing_key'], 422);
    }
    if (!array_key_exists('value', $data)) {
        send_json(['success' => false, 'message' => 'missing_value'], 422);
    }
    $value = $data['value'];
    if ($value === null) {
        delete_store_value($pdo, $key);
    } else {
        set_store_value($pdo, $key, $value);
    }
    send_json(['success' => true]);
}

if ($action === 'bulk_set') {
    if (($authUser['role'] ?? '') !== 'admin') {
        send_json(['success' => false, 'message' => 'forbidden'], 403);
    }
    $items = $data['data'] ?? null;
    if (!is_array($items)) {
        send_json(['success' => false, 'message' => 'missing_data'], 422);
    }
    foreach ($items as $key => $value) {
        if ($value === null) {
            delete_store_value($pdo, $key);
        } else {
            set_store_value($pdo, $key, $value);
        }
    }
    send_json(['success' => true]);
}

send_json(['success' => false, 'message' => 'invalid_action'], 400);
