<?php
/**
 * Copy this file to config.php and fill in the database details from the
 * InfinityFree control panel (MySQL Databases). install.php can also write
 * this file for you.
 */
return [
    'db' => [
        'driver' => 'mysql',
        'host' => 'sqlXXX.infinityfree.com',
        'port' => 3306,
        'name' => 'if0_XXXXXXXX_aisquare',
        'user' => 'if0_XXXXXXXX',
        'password' => 'your-database-password',
    ],
    'storage' => __DIR__ . '/../storage',
    'bootstrap_token' => 'change-me-to-a-long-random-string',
];
