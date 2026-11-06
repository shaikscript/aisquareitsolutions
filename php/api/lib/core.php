<?php
/**
 * AI Square · core runtime
 *
 * Everything shared by the public, portal and admin APIs lives here: database
 * access, request/response helpers, validation, sessions, notifications and
 * small conveniences such as account codes.
 *
 * The code deliberately avoids framework dependencies so it runs unchanged on
 * shared PHP hosting (InfinityFree, cPanel, Plesk) from PHP 8.0 upwards.
 */

declare(strict_types=1);

/*
 * Some shared hosts ship PHP without mbstring. The platform only needs two
 * helpers, so a byte-safe fallback keeps the site running instead of crashing.
 */
if (!function_exists('mb_substr')) {
    function mb_substr(string $string, int $start, ?int $length = null, ?string $encoding = null)
    {
        return $length === null ? substr($string, $start) : substr($string, $start, $length);
    }
}
if (!function_exists('mb_strlen')) {
    function mb_strlen(string $string, ?string $encoding = null)
    {
        return strlen($string);
    }
}

const AISQ_SESSION_COOKIE = 'aisq_session';
const AISQ_SESSION_DAYS = 7;
const AISQ_PASSWORD_ALGO = PASSWORD_DEFAULT;

final class HttpError extends Exception
{
    public int $status;
    public ?string $errorCode;

    public function __construct(int $status, string $message, ?string $errorCode = null)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->errorCode = $errorCode;
    }
}

/* ─────────────────────────── configuration ─────────────────────────── */

function config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $file = __DIR__ . '/../config.php';
    if (!is_file($file)) {
        throw new HttpError(503, 'The workspace is not configured yet. Open install.php to finish setup.', 'NOT_INSTALLED');
    }
    $config = require $file;
    if (!is_array($config) || empty($config['db'])) {
        throw new HttpError(503, 'The configuration file is invalid. Re-run install.php.', 'NOT_INSTALLED');
    }
    return $config;
}

function storage_dir(string $sub = ''): string
{
    $root = config()['storage'] ?? (__DIR__ . '/../../storage');
    $path = rtrim($root, '/') . ($sub !== '' ? '/' . trim($sub, '/') : '');
    if (!is_dir($path)) {
        @mkdir($path, 0775, true);
    }
    return $path;
}

/* ─────────────────────────── database ─────────────────────────── */

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $db = config()['db'];
    $driver = $db['driver'] ?? 'mysql';

    if ($driver === 'sqlite') {
        $pdo = new PDO('sqlite:' . $db['path']);
        $pdo->exec('PRAGMA foreign_keys = ON');
    } else {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $db['host'],
            (int) ($db['port'] ?? 3306),
            $db['name']
        );
        $pdo = new PDO($dsn, $db['user'], $db['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $statement = db()->prepare($sql);
    $statement->execute($params);
    return $statement;
}

function all(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function one(string $sql, array $params = []): ?array
{
    $row = q($sql, $params)->fetch();
    return $row === false ? null : $row;
}

function val(string $sql, array $params = [])
{
    $row = q($sql, $params)->fetch(PDO::FETCH_NUM);
    return $row === false ? null : $row[0];
}

function run_sql(string $sql, array $params = []): int
{
    return q($sql, $params)->rowCount();
}

function insert_id(string $sql, array $params = []): int
{
    q($sql, $params);
    return (int) db()->lastInsertId();
}

/* ─────────────────────────── time helpers ─────────────────────────── */

function now(): string
{
    return gmdate('Y-m-d H:i:s');
}

function iso(?string $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $text = (string) $value;
    if (preg_match('/[zZ]|[+-]\d\d:\d\d$/', $text)) {
        $stamp = strtotime($text);
        return $stamp ? gmdate('Y-m-d\TH:i:s\Z', $stamp) : null;
    }
    $stamp = strtotime($text . ' UTC');
    return $stamp ? gmdate('Y-m-d\TH:i:s\Z', $stamp) : null;
}

function ts(?string $value): int
{
    if (!$value) {
        return 0;
    }
    $stamp = strtotime(str_replace('T', ' ', $value) . ' UTC');
    return $stamp ?: 0;
}

function to_db_datetime(?string $value): ?string
{
    if (!$value) {
        return null;
    }
    $stamp = strtotime($value);
    return $stamp ? gmdate('Y-m-d H:i:s', $stamp) : null;
}

/* ─────────────────────────── validation ─────────────────────────── */

function str_input($value, int $max = 5000, int $min = 0, string $field = 'Field'): string
{
    $text = trim((string) ($value ?? ''));
    if (mb_strlen($text) < $min) {
        throw new HttpError(400, $field . ' is required.');
    }
    if (mb_strlen($text) > $max) {
        throw new HttpError(400, $field . ' must be ' . $max . ' characters or fewer.');
    }
    return $text;
}

function optional_str($value, int $max = 5000): string
{
    return mb_substr(trim((string) ($value ?? '')), 0, $max);
}

function email_input($value): string
{
    $text = strtolower(trim((string) ($value ?? '')));
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $text)) {
        throw new HttpError(400, 'Enter a valid email address.');
    }
    return $text;
}

function int_input($value, int $min = 0, int $max = 1000000, int $fallback = 0): int
{
    if (!is_numeric($value)) {
        return $fallback;
    }
    return (int) max($min, min($max, (int) $value));
}

function bool_input($value, bool $fallback = false): bool
{
    if ($value === null || $value === '') {
        return $fallback;
    }
    return $value === true || $value === 1 || $value === '1' || $value === 'true' || $value === 'on';
}

function json_decode_safe(?string $value, $fallback = [])
{
    if ($value === null || $value === '') {
        return $fallback;
    }
    $decoded = json_decode($value, true);
    return $decoded === null ? $fallback : $decoded;
}

function slugify(string $value): string
{
    $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $value) ?? '');
    return trim(substr($slug, 0, 80), '-');
}

function password_problem(?string $password): ?string
{
    $value = (string) $password;
    if (strlen($value) < 8) {
        return 'Password must be at least 8 characters.';
    }
    if (strlen($value) > 200) {
        return 'Password is too long.';
    }
    if (!preg_match('/[a-zA-Z]/', $value) || !preg_match('/[0-9]/', $value)) {
        return 'Password must include at least one letter and one number.';
    }
    return null;
}

/* ─────────────────────────── requests ─────────────────────────── */

function method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function body(): array
{
    static $body = null;
    if ($body !== null) {
        return $body;
    }
    $raw = file_get_contents('php://input') ?: '';
    $decoded = json_decode($raw, true);
    $body = is_array($decoded) ? $decoded : [];
    if (!empty($_POST)) {
        $body = array_merge($body, $_POST);
    }
    return $body;
}

function input(string $key, $default = null)
{
    $body = body();
    return array_key_exists($key, $body) ? $body[$key] : $default;
}

function query(string $key, $default = null)
{
    return array_key_exists($key, $_GET) ? $_GET[$key] : $default;
}

function file_upload(string $key): ?array
{
    if (empty($_FILES[$key]) || !is_array($_FILES[$key])) {
        return null;
    }
    $file = $_FILES[$key];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new HttpError(400, 'That file could not be uploaded. Try a smaller file.');
    }
    return $file;
}

/* ─────────────────────────── responses ─────────────────────────── */

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function app_base(): string
{
    static $base = null;
    if ($base !== null) {
        return $base;
    }
    $script = $_SERVER['SCRIPT_NAME'] ?? '/api/index.php';
    $dir = str_replace('\\', '/', dirname($script));
    $base = preg_replace('#/api$#', '', $dir) ?? '';
    $base = rtrim($base, '/');
    return $base;
}

function identity_of(array $user): string
{
    return $user['fullName'] . ' (' . $user['employeeCode'] . ')';
}

/* ─────────────────────────── settings ─────────────────────────── */

function default_settings(): array
{
    return [
        'company_mission' => 'Give machines better judgement by placing rigorous human reasoning at the centre of every model we touch.',
        'company_vision' => 'A world where AI systems are shaped by trained evaluators, transparent rubrics and measurable quality — not guesswork.',
        'company_values_json' => '["Rubric before opinion","Evidence over intuition","Craft in every detail","Respect for the people behind the data"]',
        'public_contact_email' => 'hello@aisquare.work',
        'public_contact_phone' => '+91 40 4000 8181',
        'public_office_address' => 'AISQUARE Studio, HITEC City, Hyderabad, Telangana 500081, India',
        'public_office_hours' => 'Monday – Friday · 10:00 – 19:00 IST',
        'public_map_link' => 'https://maps.google.com/?q=HITEC+City+Hyderabad',
        'public_map_lat' => '17.4483',
        'public_map_lng' => '78.3915',
        'public_linkedin' => 'https://www.linkedin.com/company/aisquare-it-solutions',
        'public_careers_note' => 'Remote-first evaluation cohorts across India, with studio space in Hyderabad.',
        'privacy_contact_note' => 'Write to privacy@aisquare.work for data access, correction and deletion requests. We respond within 30 days.',
        'demo_mode' => 'true',
    ];
}

function settings(bool $create_missing = true): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $rows = all('SELECT setting_key, setting_value FROM company_settings');
    $settings = [];
    foreach ($rows as $row) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
    if ($create_missing) {
        foreach (default_settings() as $key => $value) {
            if (!array_key_exists($key, $settings)) {
                run_sql('INSERT INTO company_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)', [$key, $value, now()]);
                $settings[$key] = $value;
            }
        }
    }
    $cache = $settings;
    return $cache;
}

function set_setting(string $key, string $value, ?int $userId = null): void
{
    $existing = val('SELECT setting_key FROM company_settings WHERE setting_key = ?', [$key]);
    if ($existing === null) {
        run_sql('INSERT INTO company_settings (setting_key, setting_value, updated_by, updated_at) VALUES (?, ?, ?, ?)', [$key, $value, $userId, now()]);
    } else {
        run_sql('UPDATE company_settings SET setting_value = ?, updated_by = ?, updated_at = ? WHERE setting_key = ?', [$value, $userId, now(), $key]);
    }
}

/* ─────────────────────────── passwords ─────────────────────────── */

function hash_password(string $password): string
{
    return password_hash($password, AISQ_PASSWORD_ALGO);
}

function verify_password(string $password, ?string $stored): bool
{
    if (!$stored) {
        return false;
    }
    return password_verify($password, $stored);
}

/* ─────────────────────────── sessions & users ─────────────────────────── */

function session_token_candidates(): array
{
    $tokens = [];
    $push = static function ($raw) use (&$tokens): void {
        if (!is_string($raw)) {
            return;
        }
        $token = trim($raw);
        if (!preg_match('/^[a-f0-9]{64}$/i', $token) || in_array($token, $tokens, true)) {
            return;
        }
        $tokens[] = $token;
    };

    $push($_SERVER['HTTP_X_AISQUARE_SESSION'] ?? null);
    $push(query('_sid'));
    $push(query('sid'));
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (is_string($auth) && stripos($auth, 'Bearer ') === 0) {
        $push(substr($auth, 7));
    }
    $push($_COOKIE[AISQ_SESSION_COOKIE] ?? null);
    return $tokens;
}

function current_user(): ?array
{
    static $resolved = false;
    static $user = null;
    if ($resolved) {
        return $user;
    }
    $resolved = true;

    $tokens = session_token_candidates();
    if (!$tokens) {
        return null;
    }

    foreach ($tokens as $token) {
        $row = one(
            'SELECT s.id AS session_id, s.expires_at,
                    u.id, u.employee_code, u.full_name, u.email, u.username, u.role, u.account_type,
                    u.status, u.department_note, u.must_change_password, u.restrict_to_assigned,
                    u.last_login_at, u.last_active_at, u.created_at
               FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.id = ? AND s.expires_at > ?',
            [$token, now()]
        );
        if (!$row) {
            continue;
        }
        if ($row['status'] !== 'active') {
            run_sql('DELETE FROM sessions WHERE user_id = ?', [$row['id']]);
            continue;
        }
        run_sql('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [now(), $row['session_id']]);
        run_sql('UPDATE users SET last_active_at = ? WHERE id = ?', [now(), $row['id']]);

        $accountType = $row['role'] === 'admin' ? 'admin' : ($row['account_type'] ?: 'employee');
        $user = [
            'id' => (int) $row['id'],
            'sessionId' => $row['session_id'],
            'employeeCode' => $row['employee_code'],
            'fullName' => $row['full_name'],
            'email' => $row['email'],
            'username' => $row['username'],
            'role' => $row['role'],
            'accountType' => $accountType,
            'status' => $row['status'],
            'departmentNote' => $row['department_note'],
            'mustChangePassword' => (bool) $row['must_change_password'],
            'restrictToAssigned' => (bool) $row['restrict_to_assigned'],
            'lastLoginAt' => $row['last_login_at'],
            'lastActiveAt' => $row['last_active_at'],
            'createdAt' => $row['created_at'],
        ];
        break;
    }
    return $user;
}

function require_user(): array
{
    $user = current_user();
    if (!$user) {
        throw new HttpError(401, 'Please sign in to continue.', 'UNAUTHENTICATED');
    }
    return $user;
}

function require_admin(): array
{
    $user = require_user();
    if ($user['role'] !== 'admin') {
        throw new HttpError(403, 'This area is restricted to workspace administrators.', 'FORBIDDEN');
    }
    return $user;
}

function require_employee(): array
{
    $user = require_user();
    if ($user['role'] === 'admin' || $user['accountType'] !== 'employee') {
        throw new HttpError(403, 'This area is for employee accounts.', 'FORBIDDEN');
    }
    return $user;
}

function require_any_employee(): array
{
    $user = require_user();
    if ($user['role'] === 'admin') {
        throw new HttpError(403, 'This area is for employee or candidate accounts.', 'FORBIDDEN');
    }
    return $user;
}

function create_session(array $user): string
{
    $token = bin2hex(random_bytes(32));
    $expires = gmdate('Y-m-d H:i:s', time() + AISQ_SESSION_DAYS * 86400);
    run_sql(
        'INSERT INTO sessions (id, user_id, ip_address, user_agent, created_at, expires_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
            $token,
            $user['id'],
            $_SERVER['REMOTE_ADDR'] ?? null,
            mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300),
            now(),
            $expires,
            now(),
        ]
    );
    run_sql('UPDATE users SET last_login_at = ?, last_active_at = ? WHERE id = ?', [now(), now(), $user['id']]);

    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    setcookie(AISQ_SESSION_COOKIE, $token, [
        'expires' => time() + AISQ_SESSION_DAYS * 86400,
        'path' => app_base() === '' ? '/' : app_base() . '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    return $token;
}

function destroy_current_session(): void
{
    $user = current_user();
    if ($user && !empty($user['sessionId'])) {
        run_sql('DELETE FROM sessions WHERE id = ?', [$user['sessionId']]);
    }
    setcookie(AISQ_SESSION_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => app_base() === '' ? '/' : app_base() . '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function throttle(string $key, int $limit = 8, int $windowSeconds = 600): bool
{
    $hash = hash('sha256', $key);
    $row = one('SELECT * FROM login_throttle WHERE key_hash = ?', [$hash]);
    if (!$row || (time() - ts($row['window_start'])) > $windowSeconds) {
        if ($row) {
            run_sql('UPDATE login_throttle SET attempts = 1, window_start = ? WHERE key_hash = ?', [now(), $hash]);
        } else {
            run_sql('INSERT INTO login_throttle (key_hash, attempts, window_start) VALUES (?, 1, ?)', [$hash, now()]);
        }
        return true;
    }
    run_sql('UPDATE login_throttle SET attempts = attempts + 1 WHERE key_hash = ?', [$hash]);
    return ((int) $row['attempts'] + 1) <= $limit;
}

function clear_throttle(string $key): void
{
    run_sql('DELETE FROM login_throttle WHERE key_hash = ?', [hash('sha256', $key)]);
}

/* ─────────────────────────── domain helpers ─────────────────────────── */

function next_account_code(string $type): string
{
    $prefix = $type === 'admin' ? 'ADM' : ($type === 'candidate' ? 'CND' : 'EMP');
    $row = one('SELECT employee_code FROM users WHERE employee_code LIKE ? ORDER BY id DESC LIMIT 1', [$prefix . '-%']);
    $next = 1;
    if ($row && preg_match('/-(\d+)$/', $row['employee_code'], $match)) {
        $next = ((int) $match[1]) + 1;
    }
    return sprintf('%s-%04d', $prefix, $next);
}

function notify(int $userId, string $type, string $title, string $message, ?string $linkPath = null): void
{
    run_sql(
        'INSERT INTO notifications (user_id, notification_type, title, message, link_path, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)',
        [$userId, $type, mb_substr($title, 0, 190), $message, $linkPath, now()]
    );
}

function notify_all_employees(string $type, string $title, string $message, ?string $linkPath = null): void
{
    $rows = all("SELECT id FROM users WHERE status = 'active' AND role = 'employee' AND account_type = 'employee'");
    foreach ($rows as $row) {
        notify((int) $row['id'], $type, $title, $message, $linkPath);
    }
}

function record_audit(
    ?int $adminId,
    string $adminIdentity,
    string $action,
    string $entityType,
    ?string $entityId,
    string $summary,
    ?array $before = null,
    ?array $after = null
): void {
    run_sql(
        'INSERT INTO audit_logs (admin_id, admin_identity, action, entity_type, entity_id, summary, before_json, after_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $adminId,
            mb_substr($adminIdentity, 0, 190),
            mb_substr($action, 0, 80),
            mb_substr($entityType, 0, 60),
            $entityId,
            mb_substr($summary, 0, 500),
            $before ? json_encode($before, JSON_UNESCAPED_UNICODE) : null,
            $after ? json_encode($after, JSON_UNESCAPED_UNICODE) : null,
            now(),
        ]
    );
}

function record_activity(?int $userId, string $identity, string $eventType, ?string $area, ?string $detail): void
{
    run_sql(
        'INSERT INTO portal_activity_logs (user_id, user_identity, event_type, area, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?)',
        [$userId, mb_substr($identity, 0, 190), mb_substr($eventType, 0, 80), $area, $detail ? mb_substr($detail, 0, 400) : null, now()]
    );
}

function public_user(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'code' => $user['employeeCode'],
        'fullName' => $user['fullName'],
        'email' => $user['email'],
        'username' => $user['username'],
        'role' => $user['role'],
        'accountType' => $user['accountType'],
        'status' => $user['status'],
        'departmentNote' => $user['departmentNote'],
        'mustChangePassword' => (bool) $user['mustChangePassword'],
        'restrictToAssigned' => (bool) $user['restrictToAssigned'],
        'lastLoginAt' => iso($user['lastLoginAt']),
        'createdAt' => iso($user['createdAt']),
        'homePath' => $user['role'] === 'admin' ? '/admin' : ($user['accountType'] === 'candidate' ? '/exam-portal' : '/portal'),
    ];
}

/* ─────────────────────────── routing ─────────────────────────── */

final class Router
{
    private static array $routes = [];

    public static function add(string $method, string $pattern, callable $handler, ?string $guard = null): void
    {
        $regex = '#^' . preg_replace('#\{([a-zA-Z_]+)\}#', '([^/]+)', $pattern) . '$#';
        self::$routes[] = [
            'method' => strtoupper($method),
            'regex' => $regex,
            'handler' => $handler,
            'guard' => $guard,
        ];
    }

    public static function get(string $pattern, callable $handler, ?string $guard = null): void
    {
        self::add('GET', $pattern, $handler, $guard);
    }

    public static function post(string $pattern, callable $handler, ?string $guard = null): void
    {
        self::add('POST', $pattern, $handler, $guard);
    }

    public static function put(string $pattern, callable $handler, ?string $guard = null): void
    {
        self::add('PUT', $pattern, $handler, $guard);
    }

    public static function patch(string $pattern, callable $handler, ?string $guard = null): void
    {
        self::add('PATCH', $pattern, $handler, $guard);
    }

    public static function delete(string $pattern, callable $handler, ?string $guard = null): void
    {
        self::add('DELETE', $pattern, $handler, $guard);
    }

    public static function dispatch(string $path): void
    {
        $matchedPath = false;
        foreach (self::$routes as $route) {
            if (!preg_match($route['regex'], $path, $matches)) {
                continue;
            }
            $matchedPath = true;
            if ($route['method'] !== method()) {
                continue;
            }
            $guard = $route['guard'];
            if ($guard === 'admin') {
                require_admin();
            } elseif ($guard === 'employee') {
                require_employee();
            } elseif ($guard === 'any') {
                require_any_employee();
            } elseif ($guard === 'auth') {
                require_user();
            }
            array_shift($matches);
            ($route['handler'])(...$matches);
            return;
        }
        if ($matchedPath) {
            throw new HttpError(405, 'That method is not allowed here.', 'METHOD_NOT_ALLOWED');
        }
        throw new HttpError(404, 'That endpoint does not exist.', 'NOT_FOUND');
    }
}

/* ─────────────────────────── file helpers ─────────────────────────── */

function store_upload(array $file, string $folder, array $allowedMime, int $maxBytes): array
{
    if (($file['size'] ?? 0) > $maxBytes) {
        throw new HttpError(400, 'That file is too large. The limit is ' . round($maxBytes / 1048576, 1) . ' MB.');
    }
    $mime = '';
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string) ($finfo->file($file['tmp_name']) ?: '');
    }
    if ($mime === '') {
        // fileinfo can be missing on trimmed shared-hosting builds; fall back
        // to the extension and the leading bytes of the uploaded file.
        $extension = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
        $mime = $extension === 'pdf' ? 'application/pdf' : 'application/octet-stream';
        if ($mime === 'application/pdf') {
            $head = (string) @file_get_contents($file['tmp_name'], false, null, 0, 5);
            if ($head !== '%PDF-') {
                $mime = 'application/octet-stream';
            }
        }
    }
    if (!in_array($mime, $allowedMime, true)) {
        throw new HttpError(400, 'Upload a PDF file.');
    }

    $dir = storage_dir($folder);
    $extension = $mime === 'application/pdf' ? 'pdf' : strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
    $stored = date('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.' . ($extension ?: 'bin');
    $target = $dir . '/' . $stored;
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        throw new HttpError(500, 'The file could not be saved. Check that the storage folder is writable.');
    }
    return [
        'stored' => $stored,
        'original' => mb_substr((string) $file['name'], 0, 255),
        'mime' => $mime,
        'size' => (int) $file['size'],
        'path' => $target,
    ];
}

function send_file(string $path, string $downloadName, string $mime = 'application/pdf', bool $inline = true): void
{
    if (!is_file($path)) {
        throw new HttpError(404, 'That file is no longer available.');
    }
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($path));
    $safe = str_replace(['"', "\r", "\n"], '', $downloadName);
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $safe . '"');
    header('Cache-Control: private, max-age=0, no-store');
    readfile($path);
    exit;
}

function public_info(): array
{
    $settings = settings();
    $values = json_decode_safe($settings['company_values_json'] ?? '[]', []);
    return [
        'companyName' => 'AI Square IT Solutions',
        'mission' => $settings['company_mission'] ?? '',
        'vision' => $settings['company_vision'] ?? '',
        'values' => is_array($values) ? $values : [],
        'careersNote' => $settings['public_careers_note'] ?? '',
        'email' => $settings['public_contact_email'] ?? '',
        'phone' => $settings['public_contact_phone'] ?? '',
        'address' => $settings['public_office_address'] ?? '',
        'hours' => $settings['public_office_hours'] ?? '',
        'mapLink' => $settings['public_map_link'] ?? '',
        'lat' => isset($settings['public_map_lat']) ? (float) $settings['public_map_lat'] : null,
        'lng' => isset($settings['public_map_lng']) ? (float) $settings['public_map_lng'] : null,
        'linkedin' => $settings['public_linkedin'] ?? '',
        'privacyNote' => $settings['privacy_contact_note'] ?? '',
        'demoMode' => ($settings['demo_mode'] ?? 'true') === 'true',
    ];
}
