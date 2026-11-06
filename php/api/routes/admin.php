<?php
/**
 * Administrator console API · people, hiring, comms and reporting.
 */

declare(strict_types=1);

function serialize_user(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'code' => $row['employee_code'],
        'fullName' => $row['full_name'],
        'email' => $row['email'],
        'username' => $row['username'],
        'role' => $row['role'],
        'accountType' => $row['account_type'],
        'status' => $row['status'],
        'departmentNote' => $row['department_note'],
        'restrictToAssigned' => (bool) $row['restrict_to_assigned'],
        'mustChangePassword' => (bool) $row['must_change_password'],
        'lastLoginAt' => iso($row['last_login_at']),
        'lastActiveAt' => iso($row['last_active_at']),
        'createdAt' => iso($row['created_at']),
    ];
}

function unique_username(string $base): string
{
    $clean = substr(preg_replace('/[^a-z0-9._-]/', '', strtolower($base)) ?: '', 0, 24);
    if ($clean === '') {
        $clean = 'user';
    }
    $candidate = $clean;
    $index = 1;
    while (val('SELECT id FROM users WHERE username = ?', [$candidate]) !== null) {
        $candidate = $clean . $index;
        $index++;
    }
    return $candidate;
}

function temporary_password(): string
{
    $words = ['atlas', 'prism', 'quartz', 'meridian', 'lumen', 'vector'];
    return $words[random_int(0, count($words) - 1)] . '-' . bin2hex(random_bytes(3)) . random_int(10, 99);
}

function create_account(array $input, array $admin): array
{
    $type = ($input['accountType'] ?? 'employee') === 'candidate' ? 'candidate' : 'employee';
    $fullName = str_input($input['fullName'] ?? '', 120, 2, 'Full name');
    $mail = email_input($input['email'] ?? '');
    if (val('SELECT id FROM users WHERE email = ?', [$mail]) !== null) {
        throw new HttpError(409, 'An account with that email already exists.');
    }

    $password = (string) ($input['password'] ?? '');
    if ($password === '') {
        $password = temporary_password();
    }
    $problem = password_problem($password);
    if ($problem) {
        throw new HttpError(400, $problem);
    }

    $username = unique_username((string) ($input['username'] ?? '') ?: explode('@', $mail)[0]);
    $code = next_account_code($type);
    $restrict = $type === 'candidate' ? bool_input($input['restrictToAssigned'] ?? true, true) : false;

    $id = insert_id(
        "INSERT INTO users (employee_code, full_name, email, username, password_hash, role, account_type, status,
                            department_note, must_change_password, restrict_to_assigned, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'employee', ?, 'active', ?, 1, ?, ?, ?, ?)",
        [
            $code,
            $fullName,
            $mail,
            $username,
            hash_password($password),
            $type,
            optional_str($input['departmentNote'] ?? '', 160) ?: null,
            $restrict ? 1 : 0,
            $admin['id'],
            now(),
            now(),
        ]
    );

    return [
        'id' => $id,
        'code' => $code,
        'fullName' => $fullName,
        'email' => $mail,
        'username' => $username,
        'password' => $password,
        'accountType' => $type,
    ];
}

function assign_assessments(int $userId, array $assessmentIds, array $admin): void
{
    foreach ($assessmentIds as $assessmentId) {
        $assessmentId = (int) $assessmentId;
        if ($assessmentId < 1) {
            continue;
        }
        $exists = val('SELECT id FROM exam_assignments WHERE assessment_id = ? AND user_id = ?', [$assessmentId, $userId]);
        if ($exists === null) {
            run_sql(
                'INSERT INTO exam_assignments (assessment_id, user_id, assigned_by_identity, created_at) VALUES (?, ?, ?, ?)',
                [$assessmentId, $userId, identity_of($admin), now()]
            );
        }
    }
}

/* ─────────────────────────── overview ─────────────────────────── */

Router::get('/admin/overview', static function (): void {
    $count = static fn (string $sql): int => (int) val($sql);

    $avg = val("SELECT AVG(percentage) FROM assessment_attempts WHERE status IN ('submitted','expired') AND percentage IS NOT NULL");
    $passed = (int) val("SELECT COALESCE(SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END),0) FROM assessment_attempts WHERE status IN ('submitted','expired') AND is_released = 1");
    $totalReleased = (int) val("SELECT COUNT(*) FROM assessment_attempts WHERE status IN ('submitted','expired') AND is_released = 1");

    $activitySeries = [];
    for ($i = 13; $i >= 0; $i--) {
        $day = gmdate('Y-m-d', time() - $i * 86400);
        $activitySeries[] = [
            'day' => $day,
            'attempts' => (int) val('SELECT COUNT(*) FROM assessment_attempts WHERE DATE(submitted_at) = ?', [$day]),
            'events' => (int) val('SELECT COUNT(*) FROM portal_activity_logs WHERE DATE(created_at) = ?', [$day]),
        ];
    }

    $pendingAttempts = [];
    foreach (all(
        "SELECT a.id, a.percentage, a.status_detail, a.submitted_at, u.full_name, u.employee_code, s.title
           FROM assessment_attempts a JOIN users u ON u.id = a.user_id JOIN assessments s ON s.id = a.assessment_id
          WHERE a.requires_manual_review = 1 AND a.review_status = 'pending'
          ORDER BY a.submitted_at DESC LIMIT 6"
    ) as $row) {
        $pendingAttempts[] = [
            'id' => (int) $row['id'],
            'percentage' => $row['percentage'] === null ? null : (float) $row['percentage'],
            'statusDetail' => $row['status_detail'],
            'submittedAt' => iso($row['submitted_at']),
            'employeeName' => $row['full_name'],
            'employeeCode' => $row['employee_code'],
            'title' => $row['title'],
        ];
    }

    $recentActivity = [];
    foreach (all('SELECT admin_identity, action, summary, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 8') as $row) {
        $recentActivity[] = [
            'identity' => $row['admin_identity'],
            'action' => $row['action'],
            'summary' => $row['summary'],
            'createdAt' => iso($row['created_at']),
        ];
    }

    $upcoming = [];
    foreach (all(
        "SELECT s.id, s.title, s.available_from, s.available_until,
                (SELECT COUNT(*) FROM exam_assignments e WHERE e.assessment_id = s.id) AS assigned
           FROM assessments s WHERE s.status = 'published' ORDER BY s.created_at DESC LIMIT 5"
    ) as $row) {
        $upcoming[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'availableFrom' => iso($row['available_from']),
            'availableUntil' => iso($row['available_until']),
            'assigned' => (int) $row['assigned'],
        ];
    }

    json_out([
        'kpis' => [
            'activeEmployees' => $count("SELECT COUNT(*) FROM users WHERE role = 'employee' AND account_type = 'employee' AND status = 'active'"),
            'candidates' => $count("SELECT COUNT(*) FROM users WHERE role = 'employee' AND account_type = 'candidate' AND status = 'active'"),
            'admins' => $count("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'"),
            'pendingReview' => $count("SELECT COUNT(*) FROM assessment_attempts WHERE status = 'submitted' AND review_status = 'pending'"),
            'unreleased' => $count("SELECT COUNT(*) FROM assessment_attempts WHERE status != 'in_progress' AND is_released = 0"),
            'newApplications' => $count("SELECT COUNT(*) FROM job_applications WHERE status = 'New'"),
            'unreadMessages' => $count("SELECT COUNT(*) FROM contact_messages WHERE status = 'unread'"),
            'publishedJobs' => $count("SELECT COUNT(*) FROM jobs WHERE status = 'published'"),
            'publishedAssessments' => $count("SELECT COUNT(*) FROM assessments WHERE status = 'published'"),
            'activeProjects' => $count("SELECT COUNT(*) FROM projects WHERE status = 'active'"),
            'openFeedback' => $count("SELECT COUNT(*) FROM employee_feedback WHERE status IN ('New','Under Review')"),
            'averagePercentage' => $avg === null ? null : round((float) $avg, 1),
            'passRate' => $totalReleased > 0 ? round(($passed / $totalReleased) * 1000) / 10 : null,
        ],
        'pipeline' => array_map(
            static fn ($row) => ['status' => $row['status'], 'count' => (int) $row['count']],
            all('SELECT status, COUNT(*) AS count FROM job_applications GROUP BY status')
        ),
        'readiness' => array_map(
            static fn ($row) => ['status' => $row['readiness_status'], 'count' => (int) $row['count']],
            all('SELECT readiness_status, COUNT(*) AS count FROM employee_project_readiness GROUP BY readiness_status')
        ),
        'activitySeries' => $activitySeries,
        'pendingAttempts' => $pendingAttempts,
        'recentActivity' => $recentActivity,
        'upcoming' => $upcoming,
    ]);
}, 'admin');

/* ─────────────────────────── people ─────────────────────────── */

Router::get('/admin/employees', static function (): void {
    $type = query('type') === 'candidate' ? 'candidate' : (query('type') === 'admin' ? 'admin' : 'employee');
    $search = '%' . strtolower(trim((string) query('search', ''))) . '%';
    $status = (string) query('status', '');

    $sql = 'SELECT * FROM users WHERE status != \'deleted\' AND ';
    $sql .= $type === 'admin' ? "role = 'admin' " : "role = 'employee' AND account_type = ? ";
    $params = $type === 'admin' ? [] : [$type];
    if ($status !== '' && $status !== 'all') {
        $sql .= 'AND status = ? ';
        $params[] = $status;
    }
    $sql .= 'AND (LOWER(full_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(username) LIKE ? OR LOWER(employee_code) LIKE ?) ';
    $sql .= 'ORDER BY created_at DESC';
    array_push($params, $search, $search, $search, $search);

    $people = [];
    foreach (all($sql, $params) as $row) {
        $person = serialize_user($row);
        $person['assignedAssessments'] = (int) val('SELECT COUNT(*) FROM exam_assignments WHERE user_id = ?', [$row['id']]);
        $person['attempts'] = (int) val('SELECT COUNT(*) FROM assessment_attempts WHERE user_id = ?', [$row['id']]);
        $avg = val(
            "SELECT ROUND(AVG(percentage), 1) FROM assessment_attempts WHERE user_id = ? AND status != 'in_progress' AND is_released = 1",
            [$row['id']]
        );
        $person['averagePercentage'] = $avg === null ? null : (float) $avg;
        $person['readinessStatus'] = (int) val(
            "SELECT COUNT(*) FROM employee_project_readiness WHERE user_id = ? AND readiness_status = 'approved'",
            [$row['id']]
        );
        $people[] = $person;
    }

    json_out([
        'people' => $people,
        'counts' => [
            'employee' => (int) val("SELECT COUNT(*) FROM users WHERE role = 'employee' AND account_type = 'employee' AND status = 'active'"),
            'candidate' => (int) val("SELECT COUNT(*) FROM users WHERE role = 'employee' AND account_type = 'candidate' AND status = 'active'"),
            'admin' => (int) val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'"),
        ],
    ]);
}, 'admin');

Router::get('/admin/employees/{id}', static function (string $id): void {
    $row = one("SELECT * FROM users WHERE id = ? AND status != 'deleted'", [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Account not found.');
    }
    $person = serialize_user($row);

    $assignments = [];
    foreach (all(
        'SELECT e.assessment_id, a.title, a.domain, e.created_at
           FROM exam_assignments e JOIN assessments a ON a.id = e.assessment_id WHERE e.user_id = ?',
        [$row['id']]
    ) as $entry) {
        $assignments[] = [
            'id' => (int) $entry['assessment_id'],
            'title' => $entry['title'],
            'domain' => $entry['domain'],
            'assignedAt' => iso($entry['created_at']),
        ];
    }
    $person['assignments'] = $assignments;

    $attempts = [];
    foreach (all(
        'SELECT at.id, at.status, at.percentage, at.is_released, at.submitted_at, s.title, s.id AS assessment_id
           FROM assessment_attempts at JOIN assessments s ON s.id = at.assessment_id
          WHERE at.user_id = ? ORDER BY at.started_at DESC',
        [$row['id']]
    ) as $entry) {
        $attempts[] = [
            'id' => (int) $entry['id'],
            'status' => $entry['status'],
            'percentage' => $entry['percentage'] === null ? null : (float) $entry['percentage'],
            'released' => (bool) $entry['is_released'],
            'submittedAt' => iso($entry['submitted_at']),
            'title' => $entry['title'],
            'assessmentId' => (int) $entry['assessment_id'],
        ];
    }
    $person['attempts'] = $attempts;

    $readiness = [];
    foreach (all(
        'SELECT r.project_id, p.name, r.readiness_status, r.updated_at
           FROM employee_project_readiness r JOIN projects p ON p.id = r.project_id WHERE r.user_id = ?',
        [$row['id']]
    ) as $entry) {
        $readiness[] = [
            'projectId' => (int) $entry['project_id'],
            'name' => $entry['name'],
            'status' => $entry['readiness_status'],
            'updatedAt' => iso($entry['updated_at']),
        ];
    }
    $person['readiness'] = $readiness;

    $guidelineProgress = [];
    foreach (all(
        "SELECT g.id, g.title, g.version, r.acknowledged, r.version AS read_version, r.seconds_spent
           FROM guidelines g LEFT JOIN guideline_reads r ON r.guideline_id = g.id AND r.user_id = ?
          WHERE g.status = 'published'",
        [$row['id']]
    ) as $entry) {
        $sameVersion = $entry['read_version'] !== null && (int) $entry['read_version'] === (int) $entry['version'];
        $guidelineProgress[] = [
            'id' => (int) $entry['id'],
            'title' => $entry['title'],
            'version' => (int) $entry['version'],
            'acknowledged' => (bool) $entry['acknowledged'] && $sameVersion,
            'readVersion' => $entry['read_version'] === null ? null : (int) $entry['read_version'],
            'secondsSpent' => (int) ($entry['seconds_spent'] ?? 0),
            'needsReview' => $entry['read_version'] !== null && !$sameVersion,
        ];
    }
    $person['guidelineProgress'] = $guidelineProgress;

    json_out(['person' => $person]);
}, 'admin');

Router::post('/admin/employees', static function (): void {
    $admin = require_admin();
    $body = body();
    $account = create_account($body, $admin);
    assign_assessments($account['id'], is_array($body['assessmentIds'] ?? null) ? $body['assessmentIds'] : [], $admin);

    record_audit(
        $admin['id'],
        identity_of($admin),
        'USER_CREATED',
        'user',
        (string) $account['id'],
        'Created ' . $account['accountType'] . ' account ' . $account['code'] . ' for ' . $account['fullName'] . '.'
    );
    http_response_code(201);
    json_out(['account' => $account]);
}, 'admin');

Router::post('/admin/employees/bulk', static function (): void {
    $admin = require_admin();
    $body = body();
    $rows = is_array($body['rows'] ?? null) ? array_slice($body['rows'], 0, 200) : [];
    if (count($rows) === 0) {
        throw new HttpError(400, 'Add at least one row to import.');
    }
    $type = ($body['accountType'] ?? 'employee') === 'candidate' ? 'candidate' : 'employee';
    $assessmentIds = is_array($body['assessmentIds'] ?? null) ? $body['assessmentIds'] : [];
    $created = [];
    $failed = [];

    foreach ($rows as $index => $row) {
        try {
            $account = create_account([
                'fullName' => $row['fullName'] ?? $row['name'] ?? '',
                'email' => $row['email'] ?? '',
                'username' => $row['username'] ?? '',
                'password' => $row['password'] ?? '',
                'accountType' => $type,
                'departmentNote' => $row['departmentNote'] ?? $row['department'] ?? '',
                'restrictToAssigned' => $type === 'candidate',
            ], $admin);
            assign_assessments($account['id'], $assessmentIds, $admin);
            $created[] = $account;
        } catch (Throwable $error) {
            $failed[] = [
                'row' => $index + 1,
                'email' => (string) ($row['email'] ?? ''),
                'error' => $error->getMessage(),
            ];
        }
    }

    record_audit(
        $admin['id'],
        identity_of($admin),
        'USER_BULK_CREATED',
        'user',
        null,
        'Bulk created ' . count($created) . ' ' . $type . ' accounts (' . count($failed) . ' failed).'
    );
    http_response_code(201);
    json_out(['created' => $created, 'failed' => $failed]);
}, 'admin');

Router::patch('/admin/employees/{id}', static function (string $id): void {
    $admin = require_admin();
    $row = one('SELECT * FROM users WHERE id = ?', [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Account not found.');
    }
    if ($row['role'] === 'admin' && (int) $row['id'] !== (int) $admin['id']) {
        throw new HttpError(403, 'Administrator profiles are managed in the admin directory.');
    }

    $body = body();
    $fullName = !empty($body['fullName']) ? str_input($body['fullName'], 120, 2, 'Full name') : $row['full_name'];
    $mail = !empty($body['email']) ? email_input($body['email']) : $row['email'];
    $department = array_key_exists('departmentNote', $body) ? optional_str($body['departmentNote'], 160) : $row['department_note'];
    $restrict = array_key_exists('restrictToAssigned', $body) ? bool_input($body['restrictToAssigned']) : (bool) $row['restrict_to_assigned'];

    if (val('SELECT id FROM users WHERE email = ? AND id != ?', [$mail, $row['id']]) !== null) {
        throw new HttpError(409, 'Another account already uses that email.');
    }

    run_sql('UPDATE users SET full_name = ?, email = ?, department_note = ?, restrict_to_assigned = ?, updated_at = ? WHERE id = ?', [
        $fullName,
        $mail,
        $department ?: null,
        $restrict ? 1 : 0,
        now(),
        $row['id'],
    ]);
    record_audit(
        $admin['id'],
        identity_of($admin),
        'USER_UPDATED',
        'user',
        (string) $row['id'],
        'Updated profile for ' . $row['full_name'] . '.',
        ['fullName' => $row['full_name'], 'email' => $row['email']],
        ['fullName' => $fullName, 'email' => $mail]
    );
    json_out(['ok' => true]);
}, 'admin');

Router::post('/admin/employees/{id}/status', static function (string $id): void {
    $admin = require_admin();
    $row = one('SELECT * FROM users WHERE id = ?', [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Account not found.');
    }
    if ((int) $row['id'] === (int) $admin['id']) {
        throw new HttpError(400, 'You cannot change your own account status.');
    }
    if ($row['role'] === 'admin') {
        throw new HttpError(403, 'Use the admin directory to manage administrators.');
    }

    $status = input('status') === 'deactivated' ? 'deactivated' : 'active';
    run_sql('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [$status, now(), $row['id']]);
    if ($status === 'deactivated') {
        run_sql('DELETE FROM sessions WHERE user_id = ?', [$row['id']]);
    }

    record_audit(
        $admin['id'],
        identity_of($admin),
        $status === 'active' ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
        'user',
        (string) $row['id'],
        ($status === 'active' ? 'Reactivated ' : 'Deactivated ') . $row['full_name'] . ' (' . $row['employee_code'] . ').'
    );
    json_out(['ok' => true, 'status' => $status]);
}, 'admin');

Router::post('/admin/employees/{id}/reset-password', static function (string $id): void {
    $admin = require_admin();
    $row = one('SELECT * FROM users WHERE id = ?', [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Account not found.');
    }
    $password = temporary_password();
    run_sql('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?', [
        hash_password($password),
        now(),
        $row['id'],
    ]);
    run_sql('DELETE FROM sessions WHERE user_id = ?', [$row['id']]);
    record_audit(
        $admin['id'],
        identity_of($admin),
        'PASSWORD_RESET',
        'user',
        (string) $row['id'],
        'Issued a one-time password for ' . $row['full_name'] . ' (' . $row['employee_code'] . ').'
    );
    json_out(['ok' => true, 'username' => $row['username'], 'password' => $password]);
}, 'admin');

Router::post('/admin/employees/{id}/promote', static function (string $id): void {
    $admin = require_admin();
    $row = one("SELECT * FROM users WHERE id = ? AND account_type = 'candidate'", [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Candidate account not found.');
    }
    $department = optional_str(input('departmentNote', ''), 160) ?: 'Evaluator · newly onboarded';
    run_sql("UPDATE users SET account_type = 'employee', restrict_to_assigned = 0, department_note = ?, updated_at = ? WHERE id = ?", [
        $department,
        now(),
        $row['id'],
    ]);
    notify(
        (int) $row['id'],
        'account',
        'Welcome to the employee workspace',
        'Your candidate account has been upgraded. Guidelines and readiness tracking are now available.',
        '/portal'
    );
    record_audit(
        $admin['id'],
        identity_of($admin),
        'CANDIDATE_PROMOTED',
        'user',
        (string) $row['id'],
        'Promoted ' . $row['full_name'] . ' (' . $row['employee_code'] . ') to employee.'
    );
    json_out(['ok' => true]);
}, 'admin');

Router::delete('/admin/employees/{id}', static function (string $id): void {
    $admin = require_admin();
    $row = one('SELECT * FROM users WHERE id = ?', [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Account not found.');
    }
    if ($row['role'] === 'admin') {
        throw new HttpError(403, 'Administrators cannot be deleted from this endpoint.');
    }
    $suffix = '.' . time();
    run_sql("UPDATE users SET status = 'deleted', deleted_at = ?, email = ?, username = ? WHERE id = ?", [
        now(),
        $row['email'] . '.deleted' . $suffix,
        $row['username'] . '.deleted' . $suffix,
        $row['id'],
    ]);
    run_sql('DELETE FROM sessions WHERE user_id = ?', [$row['id']]);
    record_audit(
        $admin['id'],
        identity_of($admin),
        'USER_DELETED',
        'user',
        (string) $row['id'],
        'Removed account ' . $row['employee_code'] . ' (' . $row['full_name'] . ').'
    );
    json_out(['ok' => true]);
}, 'admin');

Router::put('/admin/employees/{id}/assignments', static function (string $id): void {
    $admin = require_admin();
    $row = one('SELECT * FROM users WHERE id = ?', [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Account not found.');
    }
    $ids = is_array(input('assessmentIds', [])) ? input('assessmentIds', []) : [];
    run_sql('DELETE FROM exam_assignments WHERE user_id = ?', [$row['id']]);
    assign_assessments((int) $row['id'], $ids, $admin);
    json_out(['ok' => true, 'assigned' => count($ids)]);
}, 'admin');

/* ─────────────────────────── administrators ─────────────────────────── */

Router::get('/admin/admins', static function (): void {
    $admin = require_admin();
    $admins = [];
    foreach (all("SELECT * FROM users WHERE role = 'admin' AND status != 'deleted' ORDER BY created_at ASC") as $row) {
        $admins[] = serialize_user($row) + ['isSelf' => (int) $row['id'] === (int) $admin['id']];
    }
    json_out(['admins' => $admins]);
}, 'admin');

Router::post('/admin/admins', static function (): void {
    $admin = require_admin();
    $body = body();
    $fullName = str_input($body['fullName'] ?? '', 120, 2, 'Full name');
    $mail = email_input($body['email'] ?? '');
    $password = str_input($body['password'] ?? '', 200, 8, 'Password');
    $problem = password_problem($password);
    if ($problem) {
        throw new HttpError(400, $problem);
    }
    if (val('SELECT id FROM users WHERE email = ?', [$mail]) !== null) {
        throw new HttpError(409, 'That email is already in use.');
    }
    $username = unique_username((string) ($body['username'] ?? '') ?: explode('@', $mail)[0]);
    $code = next_account_code('admin');

    $id = insert_id(
        "INSERT INTO users (employee_code, full_name, email, username, password_hash, role, account_type, status,
                            must_change_password, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'admin', 'admin', 'active', 1, ?, ?, ?)",
        [$code, $fullName, $mail, $username, hash_password($password), $admin['id'], now(), now()]
    );
    record_audit(
        $admin['id'],
        identity_of($admin),
        'ADMIN_CREATED',
        'admin',
        (string) $id,
        'Created administrator ' . $code . ' (' . $fullName . ').'
    );
    http_response_code(201);
    json_out(['account' => ['code' => $code, 'username' => $username, 'fullName' => $fullName, 'email' => $mail, 'password' => $password]]);
}, 'admin');

Router::patch('/admin/admins/{id}', static function (string $id): void {
    require_admin();
    $row = one("SELECT * FROM users WHERE id = ? AND role = 'admin'", [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Administrator not found.');
    }
    $body = body();
    $fullName = !empty($body['fullName']) ? str_input($body['fullName'], 120, 2, 'Full name') : $row['full_name'];
    $mail = !empty($body['email']) ? email_input($body['email']) : $row['email'];
    if (val('SELECT id FROM users WHERE email = ? AND id != ?', [$mail, $row['id']]) !== null) {
        throw new HttpError(409, 'Another account already uses that email.');
    }
    run_sql('UPDATE users SET full_name = ?, email = ?, updated_at = ? WHERE id = ?', [$fullName, $mail, now(), $row['id']]);
    json_out(['ok' => true]);
}, 'admin');

Router::post('/admin/admins/{id}/status', static function (string $id): void {
    $admin = require_admin();
    $row = one("SELECT * FROM users WHERE id = ? AND role = 'admin'", [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Administrator not found.');
    }
    if ((int) $row['id'] === (int) $admin['id']) {
        throw new HttpError(400, 'You cannot deactivate your own account.');
    }
    $status = input('status') === 'deactivated' ? 'deactivated' : 'active';
    $activeAdmins = (int) val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'");
    if ($status === 'deactivated' && $activeAdmins <= 1) {
        throw new HttpError(400, 'At least one active administrator is required.');
    }
    run_sql('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [$status, now(), $row['id']]);
    if ($status === 'deactivated') {
        run_sql('DELETE FROM sessions WHERE user_id = ?', [$row['id']]);
    }
    record_audit(
        $admin['id'],
        identity_of($admin),
        'ADMIN_STATUS_CHANGED',
        'admin',
        (string) $row['id'],
        ($status === 'active' ? 'Reactivated' : 'Deactivated') . ' administrator ' . $row['full_name'] . '.'
    );
    json_out(['ok' => true, 'status' => $status]);
}, 'admin');

Router::post('/admin/admins/{id}/reset-password', static function (string $id): void {
    $admin = require_admin();
    $row = one("SELECT * FROM users WHERE id = ? AND role = 'admin'", [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Administrator not found.');
    }
    $password = temporary_password();
    run_sql('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?', [
        hash_password($password),
        now(),
        $row['id'],
    ]);
    run_sql('DELETE FROM sessions WHERE user_id = ? AND id != ?', [$row['id'], $admin['sessionId']]);
    record_audit(
        $admin['id'],
        identity_of($admin),
        'ADMIN_PASSWORD_RESET',
        'admin',
        (string) $row['id'],
        'Reset password for administrator ' . $row['full_name'] . '.'
    );
    json_out(['ok' => true, 'username' => $row['username'], 'password' => $password]);
}, 'admin');

Router::delete('/admin/admins/{id}', static function (string $id): void {
    $admin = require_admin();
    $row = one("SELECT * FROM users WHERE id = ? AND role = 'admin'", [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Administrator not found.');
    }
    if ((int) $row['id'] === (int) $admin['id']) {
        throw new HttpError(400, 'You cannot delete your own account.');
    }
    $activeAdmins = (int) val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'");
    if ($activeAdmins <= 1) {
        throw new HttpError(400, 'At least one active administrator is required.');
    }
    $suffix = '.' . time();
    run_sql("UPDATE users SET status = 'deleted', deleted_at = ?, email = ?, username = ? WHERE id = ?", [
        now(),
        $row['email'] . '.deleted' . $suffix,
        $row['username'] . '.deleted' . $suffix,
        $row['id'],
    ]);
    run_sql('DELETE FROM sessions WHERE user_id = ?', [$row['id']]);
    record_audit(
        $admin['id'],
        identity_of($admin),
        'ADMIN_DELETED',
        'admin',
        (string) $row['id'],
        'Removed administrator ' . $row['full_name'] . '.'
    );
    json_out(['ok' => true]);
}, 'admin');

/* ─────────────────────────── directory ─────────────────────────── */

Router::get('/admin/directory', static function (): void {
    require_admin();
    $people = [];
    foreach (all("SELECT id, full_name, employee_code, account_type, status FROM users WHERE role != 'admin' AND status != 'deleted' ORDER BY full_name") as $row) {
        $people[] = [
            'id' => (int) $row['id'],
            'name' => $row['full_name'],
            'code' => $row['employee_code'],
            'accountType' => $row['account_type'],
            'status' => $row['status'],
        ];
    }
    $assessments = [];
    foreach (all("SELECT id, title, domain, status FROM assessments WHERE status != 'archived' ORDER BY title") as $row) {
        $assessments[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'domain' => $row['domain'],
            'status' => $row['status'],
        ];
    }
    json_out(['people' => $people, 'assessments' => $assessments]);
}, 'admin');

/* ─────────────────────────── jobs ─────────────────────────── */

function job_payload(): array
{
    $body = body();
    return [
        'title' => str_input($body['title'] ?? '', 160, 3, 'Title'),
        'domain' => optional_str($body['domain'] ?? '', 120) ?: 'Evaluation',
        'employment_type' => optional_str($body['employmentType'] ?? '', 120) ?: 'Contract',
        'work_mode' => optional_str($body['workMode'] ?? '', 60) ?: 'Remote',
        'location_note' => optional_str($body['location'] ?? '', 160) ?: 'Remote · India',
        'description' => str_input($body['description'] ?? '', 4000, 20, 'Description'),
        'responsibilities' => optional_str($body['responsibilities'] ?? '', 3000),
        'qualifications' => optional_str($body['qualifications'] ?? '', 3000),
        'skills' => optional_str($body['skills'] ?? '', 1000),
        'status' => in_array($body['status'] ?? '', ['draft', 'published', 'closed'], true) ? $body['status'] : 'draft',
    ];
}

Router::get('/admin/jobs', static function (): void {
    require_admin();
    $jobs = [];
    foreach (all('SELECT * FROM jobs ORDER BY created_at DESC') as $row) {
        $jobs[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'domain' => $row['domain'],
            'employmentType' => $row['employment_type'],
            'workMode' => $row['work_mode'],
            'location' => $row['location_note'],
            'description' => $row['description'],
            'responsibilities' => $row['responsibilities'],
            'qualifications' => $row['qualifications'],
            'skills' => $row['skills'],
            'status' => $row['status'],
            'createdAt' => iso($row['created_at']),
            'applications' => (int) val('SELECT COUNT(*) FROM job_applications WHERE job_id = ?', [$row['id']]),
        ];
    }
    json_out(['jobs' => $jobs]);
}, 'admin');

Router::post('/admin/jobs', static function (): void {
    $admin = require_admin();
    $job = job_payload();
    $id = insert_id(
        'INSERT INTO jobs (title, domain, employment_type, work_mode, location_note, description, responsibilities, qualifications, skills, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $job['title'],
            $job['domain'],
            $job['employment_type'],
            $job['work_mode'],
            $job['location_note'],
            $job['description'],
            $job['responsibilities'],
            $job['qualifications'],
            $job['skills'],
            $job['status'],
            $admin['id'],
            now(),
            now(),
        ]
    );
    record_audit($admin['id'], identity_of($admin), 'JOB_CREATED', 'job', (string) $id, 'Created role “' . $job['title'] . '” (' . $job['status'] . ').');
    http_response_code(201);
    json_out(['id' => $id]);
}, 'admin');

Router::patch('/admin/jobs/{id}', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM jobs WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Role not found.');
    }
    $job = job_payload();
    run_sql(
        'UPDATE jobs SET title = ?, domain = ?, employment_type = ?, work_mode = ?, location_note = ?, description = ?,
            responsibilities = ?, qualifications = ?, skills = ?, status = ?, updated_at = ? WHERE id = ?',
        [
            $job['title'],
            $job['domain'],
            $job['employment_type'],
            $job['work_mode'],
            $job['location_note'],
            $job['description'],
            $job['responsibilities'],
            $job['qualifications'],
            $job['skills'],
            $job['status'],
            now(),
            $existing['id'],
        ]
    );
    record_audit($admin['id'], identity_of($admin), 'JOB_UPDATED', 'job', (string) $existing['id'], 'Updated role “' . $job['title'] . '”.');
    json_out(['ok' => true]);
}, 'admin');

Router::delete('/admin/jobs/{id}', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM jobs WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Role not found.');
    }
    run_sql("UPDATE jobs SET status = 'closed', updated_at = ? WHERE id = ?", [now(), $existing['id']]);
    record_audit($admin['id'], identity_of($admin), 'JOB_CLOSED', 'job', (string) $existing['id'], 'Closed role “' . $existing['title'] . '”.');
    json_out(['ok' => true]);
}, 'admin');

/* ─────────────────────────── applications ─────────────────────────── */

Router::get('/admin/applications', static function (): void {
    require_admin();
    $status = (string) query('status', '');
    $search = '%' . strtolower(trim((string) query('search', ''))) . '%';
    $sql = 'SELECT * FROM job_applications WHERE 1 = 1 ';
    $params = [];
    if ($status !== '' && $status !== 'all') {
        $sql .= 'AND status = ? ';
        $params[] = $status;
    }
    $sql .= 'AND (LOWER(full_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(position_title) LIKE ?) ORDER BY created_at DESC';
    array_push($params, $search, $search, $search);

    $applications = [];
    foreach (all($sql, $params) as $row) {
        $applications[] = [
            'id' => (int) $row['id'],
            'jobId' => $row['job_id'] === null ? null : (int) $row['job_id'],
            'position' => $row['position_title'],
            'general' => (bool) $row['is_general'],
            'fullName' => $row['full_name'],
            'email' => $row['email'],
            'phone' => $row['phone'],
            'location' => $row['location'],
            'portfolioUrl' => $row['portfolio_url'],
            'educationExperience' => $row['education_experience'],
            'coverLetter' => $row['cover_letter'],
            'resume' => [
                'name' => $row['resume_original_name'],
                'size' => (int) $row['resume_size_bytes'],
                'mime' => $row['resume_mime_type'],
            ],
            'status' => $row['status'],
            'notes' => $row['admin_notes'],
            'candidateUserId' => $row['candidate_user_id'] === null ? null : (int) $row['candidate_user_id'],
            'createdAt' => iso($row['created_at']),
            'updatedAt' => iso($row['updated_at']),
        ];
    }

    $counts = [];
    foreach (['New', 'Under Review', 'Shortlisted', 'Selected', 'Rejected'] as $key) {
        $counts[$key] = (int) val('SELECT COUNT(*) FROM job_applications WHERE status = ?', [$key]);
    }
    json_out(['applications' => $applications, 'counts' => $counts]);
}, 'admin');

Router::get('/admin/applications/{id}/resume', static function (string $id): void {
    require_admin();
    $row = one('SELECT * FROM job_applications WHERE id = ?', [(int) $id]);
    if (!$row || !$row['resume_stored_name']) {
        throw new HttpError(404, 'Resume not found.');
    }
    send_file(
        storage_dir('resumes') . '/' . basename($row['resume_stored_name']),
        $row['resume_original_name'],
        $row['resume_mime_type'] ?: 'application/octet-stream'
    );
}, 'admin');

Router::patch('/admin/applications/{id}', static function (string $id): void {
    $admin = require_admin();
    $row = one('SELECT * FROM job_applications WHERE id = ?', [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Application not found.');
    }
    $body = body();
    $status = in_array($body['status'] ?? '', ['New', 'Under Review', 'Shortlisted', 'Selected', 'Rejected'], true)
        ? $body['status']
        : $row['status'];
    $notes = array_key_exists('adminNotes', $body) ? optional_str($body['adminNotes'], 3000) : $row['admin_notes'];

    run_sql('UPDATE job_applications SET status = ?, admin_notes = ?, updated_at = ? WHERE id = ?', [$status, $notes, now(), $row['id']]);
    record_audit($admin['id'], identity_of($admin), 'APPLICATION_UPDATED', 'application', (string) $row['id'], 'Moved ' . $row['full_name'] . "'s application to " . $status . '.');
    json_out(['ok' => true, 'status' => $status]);
}, 'admin');

Router::post('/admin/applications/{id}/issue-login', static function (string $id): void {
    $admin = require_admin();
    $application = one('SELECT * FROM job_applications WHERE id = ?', [(int) $id]);
    if (!$application) {
        throw new HttpError(404, 'Application not found.');
    }
    if ($application['candidate_user_id']) {
        $existing = one('SELECT username FROM users WHERE id = ?', [$application['candidate_user_id']]);
        throw new HttpError(409, 'This candidate already has an exam account (' . ($existing['username'] ?? 'unknown') . ').');
    }

    $body = body();
    $account = create_account([
        'fullName' => $application['full_name'],
        'email' => $application['email'],
        'username' => $body['username'] ?? '',
        'accountType' => 'candidate',
        'departmentNote' => 'Candidate · ' . $application['position_title'],
        'restrictToAssigned' => true,
    ], $admin);

    run_sql("UPDATE job_applications SET candidate_user_id = ?, status = 'Shortlisted', updated_at = ? WHERE id = ?", [
        $account['id'],
        now(),
        $application['id'],
    ]);
    assign_assessments($account['id'], is_array($body['assessmentIds'] ?? null) ? $body['assessmentIds'] : [], $admin);

    record_audit(
        $admin['id'],
        identity_of($admin),
        'CANDIDATE_LOGIN_ISSUED',
        'application',
        (string) $application['id'],
        'Issued exam credentials for ' . $application['full_name'] . ' (' . $account['code'] . ').'
    );
    notify(
        (int) $account['id'],
        'account',
        'Your exam account is ready',
        'Use your username and temporary password to enter the exam portal.',
        '/exam-login'
    );
    http_response_code(201);
    json_out(['account' => $account]);
}, 'admin');

/* ─────────────────────────── inbox ─────────────────────────── */

Router::get('/admin/messages', static function (): void {
    require_admin();
    $messages = [];
    foreach (all('SELECT * FROM contact_messages ORDER BY created_at DESC') as $row) {
        $messages[] = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'email' => $row['email'],
            'company' => $row['company'],
            'topic' => $row['topic'],
            'subject' => $row['subject'],
            'message' => $row['message'],
            'status' => $row['status'],
            'createdAt' => iso($row['created_at']),
        ];
    }
    json_out(['messages' => $messages]);
}, 'admin');

Router::patch('/admin/messages/{id}', static function (string $id): void {
    require_admin();
    $row = one('SELECT * FROM contact_messages WHERE id = ?', [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Message not found.');
    }
    $status = in_array(input('status'), ['unread', 'read', 'archived'], true) ? input('status') : 'read';
    run_sql('UPDATE contact_messages SET status = ?, updated_at = ? WHERE id = ?', [$status, now(), $row['id']]);
    json_out(['ok' => true, 'status' => $status]);
}, 'admin');

/* ─────────────────────────── settings ─────────────────────────── */

const PUBLIC_SETTING_KEYS = [
    'company_mission',
    'company_vision',
    'company_values_json',
    'public_contact_email',
    'public_contact_phone',
    'public_office_address',
    'public_office_hours',
    'public_map_link',
    'public_map_lat',
    'public_map_lng',
    'public_linkedin',
    'public_careers_note',
    'privacy_contact_note',
    'demo_mode',
];

Router::get('/admin/settings', static function (): void {
    require_admin();
    $settings = settings();
    $payload = [];
    foreach (PUBLIC_SETTING_KEYS as $key) {
        $payload[$key] = $settings[$key] ?? (default_settings()[$key] ?? '');
    }
    json_out(['settings' => $payload]);
}, 'admin');

Router::put('/admin/settings', static function (): void {
    $admin = require_admin();
    $incoming = input('settings', null);
    if (!is_array($incoming)) {
        $incoming = body();
    }
    $changed = 0;
    foreach (PUBLIC_SETTING_KEYS as $key) {
        if (!array_key_exists($key, $incoming)) {
            continue;
        }
        set_setting($key, optional_str((string) $incoming[$key], 5000), $admin['id']);
        $changed++;
    }
    record_audit($admin['id'], identity_of($admin), 'SETTINGS_UPDATED', 'settings', null, 'Updated ' . $changed . ' company setting' . ($changed === 1 ? '' : 's') . '.');
    json_out(['ok' => true, 'changed' => $changed]);
}, 'admin');

/* ─────────────────────────── activity ─────────────────────────── */

Router::get('/admin/activity', static function (): void {
    require_admin();
    $audit = [];
    foreach (all('SELECT id, admin_identity, action, entity_type, entity_id, summary, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 120') as $row) {
        $audit[] = [
            'id' => (int) $row['id'],
            'identity' => $row['admin_identity'],
            'action' => $row['action'],
            'entityType' => $row['entity_type'],
            'entityId' => $row['entity_id'],
            'summary' => $row['summary'],
            'createdAt' => iso($row['created_at']),
        ];
    }
    $portal = [];
    foreach (all('SELECT id, user_identity, event_type, area, detail, created_at FROM portal_activity_logs ORDER BY created_at DESC LIMIT 120') as $row) {
        $portal[] = [
            'id' => (int) $row['id'],
            'identity' => $row['user_identity'],
            'eventType' => $row['event_type'],
            'area' => $row['area'],
            'detail' => $row['detail'],
            'createdAt' => iso($row['created_at']),
        ];
    }
    json_out(['audit' => $audit, 'portal' => $portal]);
}, 'admin');
