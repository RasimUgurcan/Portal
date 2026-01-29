<?php
return [
    'app_name' => 'EYS Portal',
    'cors_origin' => [
        'https://eysglobal.com.tr',
        'https://www.eysglobal.com.tr'
    ],
    'database_path' => __DIR__ . '/../storage/portal.sqlite',
    'default_admin_email' => 'danisman@eysglobal.com.tr',
    'default_admin_password' => 'Admin123!',
    'password_min_length' => 6,
    'contact_to' => 'danisman@eysglobal.com.tr',
    'rate_limit_whitelist' => [
        '127.0.0.1'
    ],
    'smtp' => [
        'host' => 'mail.eysglobal.com.tr',
        'port' => 465,
        'user' => 'danisman@eysglobal.com.tr',
        'pass' => '%<^i%6qI_2wOG35++-*.|||+%',
        'from' => 'danisman@eysglobal.com.tr',
        'from_name' => 'EYS Global',
        'security' => 'ssl'
    ]
];
