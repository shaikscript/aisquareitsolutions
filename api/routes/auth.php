<?php
/**
 * Authentication: three scoped gateways, bootstrap, logout, password change.
 */

declare(strict_types=1);

function find_by_identifier(string $identifier): ?array
{
    return one(
        "SELECT * FROM users WHERE status != 'deleted' AND (LOWER(username) = ? OR LOWER(email) = ?)",
        [strtolower($identifier), strtolower($identifier)]
    );
}

function load_profile(int $userId): ?array
{
    return one(
        'SELECT id, employee_code, full_name, email, username, role, account_type, status,
                department_note, must_change_password, restrict_to_assigned, last_login_at, created_at
           FROM users WHERE id = ?',
        [$userId]
    );
}

function login(string $scope, array $body): array
{
    $identifier = str_input($body['identifier'] ?? '', 200, 2, 'Username or email');
    $password = str_input($body['password'] ?? '', 200, 1, 'Password');
    $key = $scope . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'cli') . ':' . strtolower($identifier);

    if (!throttle($key)) {
        throw new HttpError(429, 'Too many sign-in attempts. Wait a few minutes and try again.');
    }

    $user = find_by_identifier($identifier);
    if (!$user || !verify_password($password, $user['password_hash'])) {
        throw new HttpError(401, 'Those credentials do not match an account.');
    }
    if ($user['status'] !== 'active') {
        throw new HttpError(403, 'This account is not active. Contact your workspace administrator.');
    }

    $isAdmin = $user['role'] === 'admin';
    $accountType = $isAdmin ? 'admin' : ($user['account_type'] ?: 'employee');

    if ($scope === 'admin' && !$isAdmin) {
        throw new HttpError(403, 'This sign-in is for administrators. Use the employee or candidate gateway.');
    }
    if ($scope === 'employee' && ($isAdmin || $accountType !== 'employee')) {
        throw new HttpError(403, 'This sign-in is for employee accounts. Use the candidate exam gateway.');
    }
    if ($scope === 'candidate' && ($isAdmin || $accountType !== 'candidate')) {
        throw new HttpError(403, 'This sign-in is for candidate exam accounts.');
    }

    clear_throttle($key);
    $profile = load_profile((int) $user['id']);
    $token = create_session([
        'id' => (int) $user['id'],
        'employeeCode' => $profile['employee_code'],
        'fullName' => $profile['full_name'],
    ]);

    $resolved = [
        'id' => (int) $profile['id'],
        'employeeCode' => $profile['employee_code'],
        'fullName' => $profile['full_name'],
        'email' => $profile['email'],
        'username' => $profile['username'],
        'role' => $profile['role'],
        'accountType' => $accountType,
        'status' => $profile['status'],
        'departmentNote' => $profile['department_note'],
        'mustChangePassword' => (bool) $profile['must_change_password'],
        'restrictToAssigned' => (bool) $profile['restrict_to_assigned'],
        'lastLoginAt' => $profile['last_login_at'],
        'createdAt' => $profile['created_at'],
    ];

    return ['user' => public_user($resolved), 'token' => $token];
}

Router::get('/health', static function (): void {
    $tables = val("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()");
    json_out(['ok' => true, 'service' => 'aisquare-php', 'php' => PHP_VERSION, 'installed' => true, 'tables' => $tables === null ? null : (int) $tables]);
});

Router::get('/auth/me', static function (): void {
    $user = current_user();
    json_out(['user' => $user ? public_user($user) : null]);
});

Router::get('/auth/setup-status', static function (): void {
    $admins = (int) val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status != 'deleted'");
    json_out(['needsBootstrap' => $admins === 0]);
});

Router::post('/auth/employee/login', static function (): void {
    json_out(login('employee', body()));
});

Router::post('/auth/candidate/login', static function (): void {
    json_out(login('candidate', body()));
});

Router::post('/auth/admin/login', static function (): void {
    json_out(login('admin', body()));
});

Router::post('/auth/bootstrap-admin', static function (): void {
    $admins = (int) val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status != 'deleted'");
    if ($admins > 0) {
        throw new HttpError(403, 'This workspace already has an administrator.');
    }

    $body = body();
    $expected = config()['bootstrap_token'] ?? '';
    $provided = str_input($body['token'] ?? '', 300, 4, 'Setup token');
    if ($expected !== '' && $provided !== $expected) {
        throw new HttpError(403, 'That setup token is not valid.');
    }

    $fullName = str_input($body['fullName'] ?? '', 120, 2, 'Full name');
    $mail = email_input($body['email'] ?? '');
    $username = strtolower(str_input($body['username'] ?? '', 60, 3, 'Username'));
    $password = str_input($body['password'] ?? '', 200, 8, 'Password');
    $problem = password_problem($password);
    if ($problem) {
        throw new HttpError(400, $problem);
    }

    $code = next_account_code('admin');
    $userId = insert_id(
        "INSERT INTO users (employee_code, full_name, email, username, password_hash, role, account_type, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'admin', 'admin', 'active', ?, ?)",
        [$code, $fullName, $mail, $username, hash_password($password), now(), now()]
    );

    $stored = one('SELECT * FROM users WHERE id = ?', [$userId]);
    $token = create_session($stored);
    $resolved = [
        'id' => (int) $stored['id'],
        'employeeCode' => $stored['employee_code'],
        'fullName' => $stored['full_name'],
        'email' => $stored['email'],
        'username' => $stored['username'],
        'role' => 'admin',
        'accountType' => 'admin',
        'status' => 'active',
        'departmentNote' => null,
        'mustChangePassword' => false,
        'restrictToAssigned' => false,
        'lastLoginAt' => $stored['last_login_at'],
        'createdAt' => $stored['created_at'],
    ];
    http_response_code(201);
    json_out(['user' => public_user($resolved), 'token' => $token]);
});

Router::post('/auth/logout', static function (): void {
    destroy_current_session();
    json_out(['ok' => true]);
});

Router::post('/auth/change-password', static function (): void {
    $user = require_user();
    $body = body();
    $current = str_input($body['currentPassword'] ?? '', 200, 1, 'Current password');
    $next = str_input($body['newPassword'] ?? '', 200, 8, 'New password');
    $problem = password_problem($next);
    if ($problem) {
        throw new HttpError(400, $problem);
    }

    $row = one('SELECT password_hash FROM users WHERE id = ?', [$user['id']]);
    if (!$row || !verify_password($current, $row['password_hash'])) {
        throw new HttpError(400, 'Your current password is incorrect.');
    }
    if ($current === $next) {
        throw new HttpError(400, 'Choose a password you have not used before.');
    }

    run_sql('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [
        hash_password($next),
        now(),
        $user['id'],
    ]);
    run_sql('DELETE FROM sessions WHERE user_id = ? AND id != ?', [$user['id'], $user['sessionId']]);
    json_out(['ok' => true]);
}, 'auth');
