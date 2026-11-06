<?php
/**
 * AI Square · API front controller
 *
 * Apache rewrites every /api/* request here (see .htaccess). The controller
 * resolves the current user, loads the module that owns the route, and turns
 * exceptions into the same JSON error envelope the frontend expects.
 */

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/assessment.php';
require __DIR__ . '/lib/pdf.php';
require __DIR__ . '/routes/auth.php';
require __DIR__ . '/routes/public.php';
require __DIR__ . '/routes/portal.php';
require __DIR__ . '/routes/admin.php';
require __DIR__ . '/routes/admin_platform.php';

set_exception_handler(static function (Throwable $error): void {
    if ($error instanceof HttpError) {
        json_out(['error' => $error->getMessage()] + ($error->errorCode ? ['code' => $error->errorCode] : []), $error->status);
    }
    error_log('[aisquare] ' . $error->getMessage() . ' @ ' . $error->getFile() . ':' . $error->getLine());
    if (getenv('AISQUARE_DEBUG') === '1') {
        json_out(['error' => $error->getMessage(), 'trace' => $error->getTraceAsString()], 500);
    }
    json_out(['error' => 'Something went wrong on our side. Please try again.', 'code' => 'SERVER_ERROR'], 500);
});

set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    // Deprecations are noise on shared hosting (PHP minor versions differ per
    // account); warnings and notices still fail loudly so bugs surface early.
    if ($severity === E_DEPRECATED || $severity === E_USER_DEPRECATED) {
        return true;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

try {
    $base = app_base();
    $uri = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
    if ($base !== '' && strpos($uri, $base) === 0) {
        $uri = substr($uri, strlen($base));
    }
    if (strpos($uri, '/api') === 0) {
        $uri = substr($uri, 4);
    }
    $path = '/' . trim($uri, '/');
    if ($path === '/') {
        $path = '/health';
    }

    Router::dispatch($path);
} catch (Throwable $error) {
    if ($error instanceof HttpError) {
        json_out(['error' => $error->getMessage()] + ($error->errorCode ? ['code' => $error->errorCode] : []), $error->status);
    }
    error_log('[aisquare] ' . $error->getMessage() . ' @ ' . $error->getFile() . ':' . $error->getLine());
    json_out(['error' => 'Something went wrong on our side. Please try again.', 'code' => 'SERVER_ERROR'], 500);
}
