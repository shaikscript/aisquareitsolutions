<?php
/**
 * Administrator console API · rubric library, question bank, assessments,
 * attempt review, readiness gates, announcements and feedback.
 */

declare(strict_types=1);

const GUIDELINE_STATUSES = ['draft', 'published', 'archived'];
const QUESTION_TYPES = ['mcq', 'true_false', 'short_answer', 'practical_scenario'];

/* ─────────────────────────── guidelines ─────────────────────────── */

function guideline_shape(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'title' => $row['title'],
        'category' => $row['category'],
        'summary' => $row['summary'],
        'version' => (int) $row['version'],
        'status' => $row['status'],
        'requiresAck' => (bool) $row['requires_ack'],
        'fileName' => $row['file_original_name'],
        'fileSize' => $row['file_size_bytes'] === null ? null : (int) $row['file_size_bytes'],
        'updatedAt' => iso($row['updated_at']),
        'createdAt' => iso($row['created_at']),
        'acknowledged' => (int) ($row['acknowledged'] ?? 0),
        'audience' => (int) ($row['audience'] ?? 0),
    ];
}

Router::get('/admin/guidelines', static function (): void {
    require_admin();
    $rows = all(
        "SELECT g.*,
                (SELECT COUNT(*) FROM guideline_reads r WHERE r.guideline_id = g.id AND r.acknowledged = 1 AND r.version = g.version) AS acknowledged,
                (SELECT COUNT(*) FROM users u WHERE u.role = 'employee' AND u.account_type = 'employee' AND u.status = 'active') AS audience
           FROM guidelines g ORDER BY g.category, g.title"
    );
    json_out(['guidelines' => array_map('guideline_shape', $rows)]);
}, 'admin');

Router::get('/admin/guidelines/{id}', static function (string $id): void {
    require_admin();
    $row = one('SELECT * FROM guidelines WHERE id = ?', [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Guideline not found.');
    }
    $versions = [];
    foreach (all('SELECT id, version, change_note, created_at, published_by_identity FROM guideline_versions WHERE guideline_id = ? ORDER BY version DESC', [$row['id']]) as $entry) {
        $versions[] = [
            'id' => (int) $entry['id'],
            'version' => (int) $entry['version'],
            'changeNote' => $entry['change_note'],
            'createdAt' => iso($entry['created_at']),
            'publishedBy' => $entry['published_by_identity'],
        ];
    }
    $readers = [];
    foreach (all(
        'SELECT u.full_name, u.employee_code, r.version, r.acknowledged, r.seconds_spent, r.last_seen_at
           FROM guideline_reads r JOIN users u ON u.id = r.user_id WHERE r.guideline_id = ?
          ORDER BY r.last_seen_at DESC',
        [$row['id']]
    ) as $entry) {
        $readers[] = [
            'name' => $entry['full_name'],
            'code' => $entry['employee_code'],
            'readVersion' => (int) $entry['version'],
            'acknowledged' => (bool) $entry['acknowledged'],
            'secondsSpent' => (int) $entry['seconds_spent'],
            'lastSeenAt' => iso($entry['last_seen_at']),
        ];
    }
    json_out(['guideline' => guideline_shape($row) + ['versions' => $versions, 'readers' => $readers]]);
}, 'admin');

Router::post('/admin/guidelines', static function (): void {
    $admin = require_admin();
    $title = str_input(input('title'), 200, 3, 'Title');
    $category = optional_str(input('category', ''), 80) ?: 'Evaluation';
    $summary = optional_str(input('summary', ''), 600);
    $status = in_array(input('status'), GUIDELINE_STATUSES, true) ? input('status') : 'draft';

    $file = file_upload('file');
    if (!$file) {
        throw new HttpError(400, 'Attach the guideline PDF.');
    }
    $stored = store_upload($file, 'guidelines', ['application/pdf'], 15 * 1024 * 1024);

    $id = insert_id(
        'INSERT INTO guidelines (title, category, summary, version, status, requires_ack, file_original_name,
            file_stored_name, file_mime_type, file_size_bytes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $title,
            $category,
            $summary,
            $status,
            bool_input(input('requiresAck'), true) ? 1 : 0,
            $stored['original'],
            $stored['stored'],
            $stored['mime'],
            $stored['size'],
            $admin['id'],
            now(),
            now(),
        ]
    );
    run_sql(
        'INSERT INTO guideline_versions (guideline_id, version, title, summary, change_note, file_original_name,
            file_stored_name, file_mime_type, file_size_bytes, published_by_identity, created_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $id,
            $title,
            $summary,
            optional_str(input('changeNote', ''), 400) ?: 'Initial publication',
            $stored['original'],
            $stored['stored'],
            $stored['mime'],
            $stored['size'],
            identity_of($admin),
            now(),
        ]
    );

    if ($status === 'published') {
        notify_all_employees('guideline', 'New guideline published', $title . ' is now available in your workspace.', '/portal/guidelines');
    }
    record_audit($admin['id'], identity_of($admin), 'GUIDELINE_CREATED', 'guideline', (string) $id, 'Published guideline “' . $title . '” v1 (' . $status . ').');
    http_response_code(201);
    json_out(['id' => $id]);
}, 'admin');

Router::put('/admin/guidelines/{id}', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM guidelines WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Guideline not found.');
    }

    $title = input('title') !== null ? str_input(input('title'), 200, 3, 'Title') : $existing['title'];
    $category = input('category') !== null ? (optional_str(input('category'), 80) ?: 'Evaluation') : $existing['category'];
    $summary = input('summary') !== null ? optional_str(input('summary'), 600) : $existing['summary'];
    $requiresAck = input('requiresAck') !== null ? bool_input(input('requiresAck')) : (bool) $existing['requires_ack'];
    $status = in_array(input('status'), GUIDELINE_STATUSES, true) ? input('status') : $existing['status'];

    $file = file_upload('file');
    $stored = $file ? store_upload($file, 'guidelines', ['application/pdf'], 15 * 1024 * 1024) : null;

    $contentChanged = $stored !== null || $title !== $existing['title'] || $summary !== $existing['summary'];
    $version = $contentChanged ? ((int) $existing['version'] + 1) : (int) $existing['version'];

    run_sql(
        'UPDATE guidelines SET title = ?, category = ?, summary = ?, requires_ack = ?, status = ?, version = ?,
            file_original_name = ?, file_stored_name = ?, file_mime_type = ?, file_size_bytes = ?, updated_at = ?
          WHERE id = ?',
        [
            $title,
            $category,
            $summary,
            $requiresAck ? 1 : 0,
            $status,
            $version,
            $stored['original'] ?? $existing['file_original_name'],
            $stored['stored'] ?? $existing['file_stored_name'],
            $stored['mime'] ?? $existing['file_mime_type'],
            $stored['size'] ?? $existing['file_size_bytes'],
            now(),
            $existing['id'],
        ]
    );

    if ($contentChanged) {
        run_sql(
            'INSERT INTO guideline_versions (guideline_id, version, title, summary, change_note, file_original_name,
                file_stored_name, file_mime_type, file_size_bytes, published_by_identity, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $existing['id'],
                $version,
                $title,
                $summary,
                optional_str(input('changeNote', ''), 400) ?: 'Content revision',
                $stored['original'] ?? $existing['file_original_name'],
                $stored['stored'] ?? $existing['file_stored_name'],
                $stored['mime'] ?? $existing['file_mime_type'],
                $stored['size'] ?? $existing['file_size_bytes'],
                identity_of($admin),
                now(),
            ]
        );
        if ($status === 'published') {
            notify_all_employees('guideline', 'Guideline updated', $title . ' is now at version ' . $version . '. Please re-read and acknowledge.', '/portal/guidelines');
        }
    }

    record_audit($admin['id'], identity_of($admin), 'GUIDELINE_UPDATED', 'guideline', (string) $existing['id'], 'Updated guideline “' . $title . '” to v' . $version . '.');
    json_out(['ok' => true, 'version' => $version]);
}, 'admin');

Router::post('/admin/guidelines/{id}/status', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM guidelines WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Guideline not found.');
    }
    $status = in_array(input('status'), GUIDELINE_STATUSES, true) ? input('status') : 'draft';
    run_sql('UPDATE guidelines SET status = ?, updated_at = ? WHERE id = ?', [$status, now(), $existing['id']]);
    if ($status === 'published' && $existing['status'] !== 'published') {
        notify_all_employees('guideline', 'Guideline published', $existing['title'] . ' is available in your workspace.', '/portal/guidelines');
    }
    record_audit($admin['id'], identity_of($admin), 'GUIDELINE_STATUS_CHANGED', 'guideline', (string) $existing['id'], 'Set “' . $existing['title'] . '” to ' . $status . '.');
    json_out(['ok' => true, 'status' => $status]);
}, 'admin');

Router::get('/admin/guidelines/{id}/file', static function (string $id): void {
    require_admin();
    $row = one('SELECT * FROM guidelines WHERE id = ?', [(int) $id]);
    if (!$row || !$row['file_stored_name']) {
        throw new HttpError(404, 'No document attached.');
    }
    send_file(
        storage_dir('guidelines') . '/' . basename($row['file_stored_name']),
        $row['file_original_name'] ?: 'guideline.pdf',
        $row['file_mime_type'] ?: 'application/pdf'
    );
}, 'admin');

/* ─────────────────────────── question bank ─────────────────────────── */

function question_shape(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'questionType' => $row['question_type'],
        'prompt' => $row['prompt'],
        'scenario' => $row['scenario_context'],
        'options' => $row['options_json'] ? json_decode_safe($row['options_json'], []) : [],
        'correctAnswer' => $row['correct_answer'],
        'acceptableAnswers' => $row['acceptable_answers_json'] ? json_decode_safe($row['acceptable_answers_json'], []) : [],
        'rubric' => $row['scoring_rubric'],
        'marks' => (float) $row['marks'],
        'explanation' => $row['explanation'],
        'projectRef' => $row['project_ref'],
        'status' => $row['status'],
        'version' => (int) $row['version'],
        'createdAt' => iso($row['created_at']),
        'usage' => (int) ($row['usage'] ?? 0),
    ];
}

function question_payload(array $body, ?array $existing = null): array
{
    $type = in_array($body['questionType'] ?? '', QUESTION_TYPES, true)
        ? $body['questionType']
        : ($existing['question_type'] ?? 'mcq');
    $prompt = str_input($body['prompt'] ?? ($existing['prompt'] ?? ''), 2000, 8, 'Question prompt');

    $options = $body['options'] ?? (($existing['options_json'] ?? '') ? json_decode_safe($existing['options_json'], []) : null);
    if (is_string($options)) {
        $options = json_decode_safe($options, []);
    }
    $correctAnswer = optional_str($body['correctAnswer'] ?? ($existing['correct_answer'] ?? ''), 1000);
    if (($type === 'mcq' || $type === 'true_false') && $correctAnswer === '') {
        throw new HttpError(400, 'Choose the correct answer for this question type.');
    }
    if ($type === 'mcq' && (!is_array($options) || count($options) < 2)) {
        throw new HttpError(400, 'Multiple-choice questions need at least two options.');
    }

    $acceptable = $body['acceptableAnswers'] ?? (($existing['acceptable_answers_json'] ?? '') ? json_decode_safe($existing['acceptable_answers_json'], []) : null);
    if (is_string($acceptable)) {
        $acceptable = array_values(array_filter(array_map('trim', explode(',', $acceptable))));
    }

    return [
        'type' => $type,
        'prompt' => $prompt,
        'scenario' => optional_str($body['scenario'] ?? ($existing['scenario_context'] ?? ''), 3000) ?: null,
        'options' => $type === 'mcq' ? json_encode(array_values((array) $options), JSON_UNESCAPED_UNICODE) : ($type === 'true_false' ? json_encode(['True', 'False']) : null),
        'correctAnswer' => $correctAnswer !== '' ? $correctAnswer : null,
        'acceptable' => is_array($acceptable) && count($acceptable) ? json_encode(array_values($acceptable), JSON_UNESCAPED_UNICODE) : null,
        'rubric' => optional_str($body['rubric'] ?? ($existing['scoring_rubric'] ?? ''), 3000) ?: null,
        'marks' => max(0.5, (float) ($body['marks'] ?? ($existing['marks'] ?? 1))),
        'explanation' => optional_str($body['explanation'] ?? ($existing['explanation'] ?? ''), 2000) ?: null,
        'projectRef' => optional_str($body['projectRef'] ?? ($existing['project_ref'] ?? ''), 160) ?: null,
        'status' => in_array($body['status'] ?? '', ['active', 'archived'], true) ? $body['status'] : ($existing['status'] ?? 'active'),
    ];
}

Router::get('/admin/question-bank', static function (): void {
    require_admin();
    $search = '%' . strtolower(trim((string) query('search', ''))) . '%';
    $type = (string) query('type', 'all');
    $status = (string) query('status', 'all');

    $sql = 'SELECT q.*, (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.question_id = q.id) AS usage
              FROM question_bank q
             WHERE (LOWER(q.prompt) LIKE ? OR LOWER(COALESCE(q.project_ref, \'\')) LIKE ?) ';
    $params = [$search, $search];
    if ($type !== '' && $type !== 'all') {
        $sql .= 'AND q.question_type = ? ';
        $params[] = $type;
    }
    if ($status !== '' && $status !== 'all') {
        $sql .= 'AND q.status = ? ';
        $params[] = $status;
    }
    $sql .= 'ORDER BY q.created_at DESC';

    $counts = [];
    foreach (QUESTION_TYPES as $questionType) {
        $counts[$questionType] = (int) val("SELECT COUNT(*) FROM question_bank WHERE question_type = ? AND status = 'active'", [$questionType]);
    }
    json_out(['questions' => array_map('question_shape', all($sql, $params)), 'counts' => $counts]);
}, 'admin');

Router::post('/admin/question-bank', static function (): void {
    $admin = require_admin();
    $q = question_payload(body());
    $id = insert_id(
        'INSERT INTO question_bank (question_type, prompt, scenario_context, options_json, correct_answer,
            acceptable_answers_json, scoring_rubric, marks, explanation, project_ref, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $q['type'],
            $q['prompt'],
            $q['scenario'],
            $q['options'],
            $q['correctAnswer'],
            $q['acceptable'],
            $q['rubric'],
            $q['marks'],
            $q['explanation'],
            $q['projectRef'],
            $q['status'],
            $admin['id'],
            now(),
            now(),
        ]
    );
    record_audit($admin['id'], identity_of($admin), 'QUESTION_CREATED', 'question', (string) $id, 'Added a ' . $q['type'] . ' question to the bank.');
    http_response_code(201);
    json_out(['id' => $id]);
}, 'admin');

Router::patch('/admin/question-bank/{id}', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM question_bank WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Question not found.');
    }
    $q = question_payload(body(), $existing);
    run_sql(
        'UPDATE question_bank SET question_type = ?, prompt = ?, scenario_context = ?, options_json = ?,
            correct_answer = ?, acceptable_answers_json = ?, scoring_rubric = ?, marks = ?, explanation = ?,
            project_ref = ?, status = ?, version = version + 1, updated_at = ?
          WHERE id = ?',
        [
            $q['type'],
            $q['prompt'],
            $q['scenario'],
            $q['options'],
            $q['correctAnswer'],
            $q['acceptable'],
            $q['rubric'],
            $q['marks'],
            $q['explanation'],
            $q['projectRef'],
            $q['status'],
            now(),
            $existing['id'],
        ]
    );
    record_audit($admin['id'], identity_of($admin), 'QUESTION_UPDATED', 'question', (string) $existing['id'], 'Revised a question in the bank.');
    json_out(['ok' => true]);
}, 'admin');

/* ─────────────────────────── assessments ─────────────────────────── */

function assessment_shape(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'title' => $row['title'],
        'instructions' => $row['instructions'],
        'domain' => $row['domain'],
        'projectId' => $row['project_id'] === null ? null : (int) $row['project_id'],
        'status' => $row['status'],
        'availableFrom' => iso($row['available_from']),
        'availableUntil' => iso($row['available_until']),
        'isTimed' => (bool) $row['is_timed'],
        'timeLimitMinutes' => $row['time_limit_minutes'] === null ? null : (int) $row['time_limit_minutes'],
        'passingPercentage' => (float) $row['passing_percentage'],
        'selectionMode' => $row['selection_mode'],
        'randomSampleCount' => $row['random_sample_count'] === null ? null : (int) $row['random_sample_count'],
        'version' => (int) $row['version'],
        'createdAt' => iso($row['created_at']),
        'questionCount' => (int) ($row['question_count'] ?? 0),
        'totalMarks' => (float) ($row['total_marks'] ?? 0),
        'assignedCount' => (int) ($row['assigned_count'] ?? 0),
        'attemptCount' => (int) ($row['attempt_count'] ?? 0),
        'pendingReview' => (int) ($row['pending_review'] ?? 0),
    ];
}

function assessment_payload(array $body, ?array $existing = null): array
{
    $isTimed = array_key_exists('isTimed', $body) ? bool_input($body['isTimed']) : (bool) ($existing['is_timed'] ?? false);
    $timeLimit = array_key_exists('timeLimitMinutes', $body)
        ? int_input($body['timeLimitMinutes'], 1, 600, 45)
        : ($existing['time_limit_minutes'] ?? null);
    if ($isTimed && !$timeLimit) {
        throw new HttpError(400, 'Set a time limit for a timed assessment.');
    }

    return [
        'title' => str_input($body['title'] ?? ($existing['title'] ?? ''), 200, 3, 'Title'),
        'instructions' => str_input($body['instructions'] ?? ($existing['instructions'] ?? ''), 4000, 10, 'Instructions'),
        'domain' => optional_str($body['domain'] ?? ($existing['domain'] ?? ''), 120) ?: null,
        'projectId' => !empty($body['projectId']) ? (int) $body['projectId'] : ($existing['project_id'] ?? null),
        'isTimed' => $isTimed,
        'timeLimitMinutes' => $timeLimit,
        'passingPercentage' => int_input($body['passingPercentage'] ?? ($existing['passing_percentage'] ?? 75), 1, 100, 75),
        'availableFrom' => !empty($body['availableFrom']) ? to_db_datetime($body['availableFrom']) : ($existing['available_from'] ?? null),
        'availableUntil' => !empty($body['availableUntil']) ? to_db_datetime($body['availableUntil']) : ($existing['available_until'] ?? null),
        'selectionMode' => ($body['selectionMode'] ?? '') === 'random_pool' ? 'random_pool' : 'fixed',
        'randomSampleCount' => !empty($body['randomSampleCount']) ? int_input($body['randomSampleCount'], 1, 100, 10) : ($existing['random_sample_count'] ?? null),
        'status' => in_array($body['status'] ?? '', ['draft', 'published', 'archived'], true) ? $body['status'] : ($existing['status'] ?? 'draft'),
    ];
}

Router::get('/admin/assessments', static function (): void {
    require_admin();
    $rows = all(
        "SELECT s.*,
                (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.assessment_id = s.id) AS question_count,
                (SELECT COALESCE(SUM(COALESCE(aq.marks_override, q.marks)), 0) FROM assessment_questions aq
                   JOIN question_bank q ON q.id = aq.question_id WHERE aq.assessment_id = s.id) AS total_marks,
                (SELECT COUNT(*) FROM exam_assignments e WHERE e.assessment_id = s.id) AS assigned_count,
                (SELECT COUNT(*) FROM assessment_attempts at WHERE at.assessment_id = s.id) AS attempt_count,
                (SELECT COUNT(*) FROM assessment_attempts at WHERE at.assessment_id = s.id AND at.review_status = 'pending') AS pending_review
           FROM assessments s ORDER BY s.created_at DESC"
    );
    json_out(['assessments' => array_map('assessment_shape', $rows)]);
}, 'admin');

Router::get('/admin/assessments/{id}', static function (string $id): void {
    require_admin();
    $row = one('SELECT * FROM assessments WHERE id = ?', [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Assessment not found.');
    }
    $questions = [];
    foreach (all(
        'SELECT q.*, aq.sort_order, aq.marks_override FROM assessment_questions aq
           JOIN question_bank q ON q.id = aq.question_id WHERE aq.assessment_id = ? ORDER BY aq.sort_order',
        [$row['id']]
    ) as $entry) {
        $shape = question_shape($entry);
        $shape['marksOverride'] = $entry['marks_override'] === null ? null : (float) $entry['marks_override'];
        $questions[] = $shape;
    }
    $assignments = [];
    foreach (all(
        'SELECT e.user_id, u.full_name, u.employee_code, u.account_type
           FROM exam_assignments e JOIN users u ON u.id = e.user_id WHERE e.assessment_id = ?',
        [$row['id']]
    ) as $entry) {
        $assignments[] = [
            'userId' => (int) $entry['user_id'],
            'name' => $entry['full_name'],
            'code' => $entry['employee_code'],
            'accountType' => $entry['account_type'],
        ];
    }
    $payload = assessment_shape($row);
    $payload['questions'] = $questions;
    $payload['assignments'] = $assignments;
    json_out(['assessment' => $payload]);
}, 'admin');

Router::post('/admin/assessments', static function (): void {
    $admin = require_admin();
    $body = body();
    $a = assessment_payload($body);
    $id = insert_id(
        'INSERT INTO assessments (title, instructions, domain, project_id, status, available_from, available_until,
            is_timed, time_limit_minutes, passing_percentage, selection_mode, random_sample_count, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $a['title'],
            $a['instructions'],
            $a['domain'],
            $a['projectId'],
            $a['status'],
            $a['availableFrom'],
            $a['availableUntil'],
            $a['isTimed'] ? 1 : 0,
            $a['timeLimitMinutes'],
            $a['passingPercentage'],
            $a['selectionMode'],
            $a['randomSampleCount'],
            $admin['id'],
            now(),
            now(),
        ]
    );

    foreach (array_values((array) ($body['questionIds'] ?? [])) as $index => $questionId) {
        $questionId = (int) $questionId;
        if ($questionId < 1) {
            continue;
        }
        if (val('SELECT id FROM assessment_questions WHERE assessment_id = ? AND question_id = ?', [$id, $questionId]) === null) {
            run_sql('INSERT INTO assessment_questions (assessment_id, question_id, sort_order) VALUES (?, ?, ?)', [$id, $questionId, $index]);
        }
    }
    foreach ((array) ($body['userIds'] ?? []) as $userId) {
        $userId = (int) $userId;
        if ($userId < 1) {
            continue;
        }
        if (val('SELECT id FROM exam_assignments WHERE assessment_id = ? AND user_id = ?', [$id, $userId]) === null) {
            run_sql('INSERT INTO exam_assignments (assessment_id, user_id, assigned_by_identity, created_at) VALUES (?, ?, ?, ?)', [
                $id,
                $userId,
                identity_of($admin),
                now(),
            ]);
        }
    }

    record_audit($admin['id'], identity_of($admin), 'ASSESSMENT_CREATED', 'assessment', (string) $id, 'Created assessment “' . $a['title'] . '” (' . $a['status'] . ').');
    http_response_code(201);
    json_out(['id' => $id]);
}, 'admin');

Router::put('/admin/assessments/{id}', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM assessments WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Assessment not found.');
    }
    $body = body();
    $a = assessment_payload($body, $existing);

    run_sql(
        'UPDATE assessments SET title = ?, instructions = ?, domain = ?, project_id = ?, status = ?, available_from = ?,
            available_until = ?, is_timed = ?, time_limit_minutes = ?, passing_percentage = ?, selection_mode = ?,
            random_sample_count = ?, version = version + 1, updated_at = ? WHERE id = ?',
        [
            $a['title'],
            $a['instructions'],
            $a['domain'],
            $a['projectId'],
            $a['status'],
            $a['availableFrom'],
            $a['availableUntil'],
            $a['isTimed'] ? 1 : 0,
            $a['timeLimitMinutes'],
            $a['passingPercentage'],
            $a['selectionMode'],
            $a['randomSampleCount'],
            now(),
            $existing['id'],
        ]
    );

    if (isset($body['questionIds']) && is_array($body['questionIds'])) {
        run_sql('DELETE FROM assessment_questions WHERE assessment_id = ?', [$existing['id']]);
        foreach (array_values($body['questionIds']) as $index => $questionId) {
            $questionId = (int) $questionId;
            if ($questionId < 1) {
                continue;
            }
            if (val('SELECT id FROM assessment_questions WHERE assessment_id = ? AND question_id = ?', [$existing['id'], $questionId]) === null) {
                run_sql('INSERT INTO assessment_questions (assessment_id, question_id, sort_order) VALUES (?, ?, ?)', [
                    $existing['id'],
                    $questionId,
                    $index,
                ]);
            }
        }
    }

    record_audit($admin['id'], identity_of($admin), 'ASSESSMENT_UPDATED', 'assessment', (string) $existing['id'], 'Updated assessment “' . $a['title'] . '”.');
    json_out(['ok' => true]);
}, 'admin');

Router::post('/admin/assessments/{id}/status', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM assessments WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Assessment not found.');
    }
    $status = in_array(input('status'), ['draft', 'published', 'archived'], true) ? input('status') : 'draft';
    if ($status === 'published') {
        $count = (int) val('SELECT COUNT(*) FROM assessment_questions WHERE assessment_id = ?', [$existing['id']]);
        if ($count === 0) {
            throw new HttpError(400, 'Add at least one question before publishing.');
        }
    }
    run_sql('UPDATE assessments SET status = ?, updated_at = ? WHERE id = ?', [$status, now(), $existing['id']]);
    record_audit($admin['id'], identity_of($admin), 'ASSESSMENT_STATUS_CHANGED', 'assessment', (string) $existing['id'], 'Set “' . $existing['title'] . '” to ' . $status . '.');
    json_out(['ok' => true, 'status' => $status]);
}, 'admin');

Router::post('/admin/assessments/{id}/duplicate', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM assessments WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Assessment not found.');
    }
    $newId = insert_id(
        "INSERT INTO assessments (title, instructions, domain, project_id, status, available_from, available_until,
            is_timed, time_limit_minutes, passing_percentage, selection_mode, random_sample_count, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $existing['title'] . ' (copy)',
            $existing['instructions'],
            $existing['domain'],
            $existing['project_id'],
            $existing['available_from'],
            $existing['available_until'],
            $existing['is_timed'],
            $existing['time_limit_minutes'],
            $existing['passing_percentage'],
            $existing['selection_mode'],
            $existing['random_sample_count'],
            $admin['id'],
            now(),
            now(),
        ]
    );
    foreach (all('SELECT * FROM assessment_questions WHERE assessment_id = ?', [$existing['id']]) as $question) {
        run_sql('INSERT INTO assessment_questions (assessment_id, question_id, sort_order, marks_override) VALUES (?, ?, ?, ?)', [
            $newId,
            $question['question_id'],
            $question['sort_order'],
            $question['marks_override'],
        ]);
    }
    record_audit($admin['id'], identity_of($admin), 'ASSESSMENT_DUPLICATED', 'assessment', (string) $newId, 'Duplicated “' . $existing['title'] . '”.');
    http_response_code(201);
    json_out(['id' => $newId]);
}, 'admin');

Router::put('/admin/assessments/{id}/assignments', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM assessments WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Assessment not found.');
    }
    $userIds = is_array(input('userIds', [])) ? input('userIds', []) : [];
    run_sql('DELETE FROM exam_assignments WHERE assessment_id = ?', [$existing['id']]);
    foreach ($userIds as $userId) {
        $userId = (int) $userId;
        if ($userId < 1) {
            continue;
        }
        run_sql('INSERT INTO exam_assignments (assessment_id, user_id, assigned_by_identity, created_at) VALUES (?, ?, ?, ?)', [
            $existing['id'],
            $userId,
            identity_of($admin),
            now(),
        ]);
    }
    json_out(['ok' => true, 'assigned' => count($userIds)]);
}, 'admin');

/* ─────────────────────────── attempts ─────────────────────────── */

Router::get('/admin/attempts', static function (): void {
    require_admin();
    $status = (string) query('status', '');
    $search = '%' . strtolower(trim((string) query('search', ''))) . '%';

    $sql = 'SELECT a.*, u.full_name, u.employee_code, u.account_type, s.title, s.domain, s.passing_percentage
              FROM assessment_attempts a JOIN users u ON u.id = a.user_id JOIN assessments s ON s.id = a.assessment_id
             WHERE 1 = 1 ';
    $params = [];
    if ($status !== '' && $status !== 'all') {
        if ($status === 'pending') {
            $sql .= "AND a.review_status = 'pending' ";
        } else {
            $sql .= 'AND a.status = ? ';
            $params[] = $status;
        }
    }
    $sql .= 'AND (LOWER(u.full_name) LIKE ? OR LOWER(u.employee_code) LIKE ? OR LOWER(s.title) LIKE ?) ORDER BY a.started_at DESC';
    array_push($params, $search, $search, $search);

    $attempts = [];
    foreach (all($sql, $params) as $row) {
        $attempts[] = [
            'id' => (int) $row['id'],
            'employeeName' => $row['full_name'],
            'employeeCode' => $row['employee_code'],
            'accountType' => $row['account_type'],
            'title' => $row['title'],
            'domain' => $row['domain'],
            'status' => $row['status'],
            'statusDetail' => $row['status_detail'],
            'attemptNumber' => (int) $row['attempt_number'],
            'percentage' => $row['percentage'] === null ? null : (float) $row['percentage'],
            'passingPercentage' => (float) $row['passing_percentage'],
            'passed' => $row['passed'] === null ? null : (bool) $row['passed'],
            'requiresManualReview' => (bool) $row['requires_manual_review'],
            'reviewStatus' => $row['review_status'],
            'isReleased' => (bool) $row['is_released'],
            'startedAt' => iso($row['started_at']),
            'submittedAt' => iso($row['submitted_at']),
            'durationSeconds' => $row['duration_seconds'] === null ? null : (int) $row['duration_seconds'],
        ];
    }

    json_out([
        'attempts' => $attempts,
        'counts' => [
            'pending' => (int) val("SELECT COUNT(*) FROM assessment_attempts WHERE review_status = 'pending'"),
            'unreleased' => (int) val("SELECT COUNT(*) FROM assessment_attempts WHERE status != 'in_progress' AND is_released = 0"),
            'inProgress' => (int) val("SELECT COUNT(*) FROM assessment_attempts WHERE status = 'in_progress'"),
            'total' => (int) val('SELECT COUNT(*) FROM assessment_attempts'),
        ],
    ]);
}, 'admin');

Router::get('/admin/attempts/{id}', static function (string $id): void {
    $admin = require_admin();
    $payload = load_attempt((int) $id, $admin, true);
    $events = [];
    foreach (all('SELECT event_type, detail, created_at FROM attempt_events WHERE attempt_id = ? ORDER BY id', [(int) $id]) as $event) {
        $events[] = [
            'type' => $event['event_type'],
            'detail' => $event['detail'],
            'createdAt' => iso($event['created_at']),
        ];
    }
    $payload['events'] = $events;
    json_out($payload);
}, 'admin');

Router::post('/admin/attempts/{id}/review', static function (string $id): void {
    $admin = require_admin();
    $body = body();
    $result = review_attempt(
        (int) $id,
        $admin,
        is_array($body['answers'] ?? null) ? $body['answers'] : [],
        optional_str($body['comment'] ?? '', 3000),
        ($body['finalise'] ?? true) !== false
    );
    record_audit($admin['id'], identity_of($admin), 'ATTEMPT_REVIEWED', 'attempt', $id, 'Reviewed attempt #' . $id . ' → ' . $result['percentage'] . '%.');
    json_out($result);
}, 'admin');

Router::post('/admin/attempts/{id}/release', static function (string $id): void {
    $admin = require_admin();
    release_attempt((int) $id, $admin, [
        'showScore' => bool_input(input('showScore'), true),
        'showPass' => bool_input(input('showPass'), true),
        'showAnswers' => bool_input(input('showAnswers'), true),
    ]);
    json_out(['ok' => true]);
}, 'admin');

Router::post('/admin/attempts/{id}/unrelease', static function (string $id): void {
    $admin = require_admin();
    $attempt = one('SELECT * FROM assessment_attempts WHERE id = ?', [(int) $id]);
    if (!$attempt) {
        throw new HttpError(404, 'Attempt not found.');
    }
    run_sql('UPDATE assessment_attempts SET is_released = 0, released_at = NULL, released_by_identity = NULL WHERE id = ?', [$attempt['id']]);
    record_audit($admin['id'], identity_of($admin), 'ATTEMPT_UNRELEASED', 'attempt', (string) $attempt['id'], 'Withdrew the released result for attempt #' . $attempt['id'] . '.');
    json_out(['ok' => true]);
}, 'admin');

Router::post('/admin/attempts/{id}/expire', static function (string $id): void {
    require_admin();
    expire_attempt((int) $id, 'Closed by administrator');
    json_out(['ok' => true]);
}, 'admin');

Router::post('/admin/retakes', static function (): void {
    $admin = require_admin();
    $assessmentId = int_input(input('assessmentId'), 0, 1000000, -1);
    $userId = int_input(input('userId'), 0, 1000000, -1);
    if ($assessmentId < 1 || $userId < 1) {
        throw new HttpError(400, 'Choose an assessment and a person.');
    }
    $assessment = one('SELECT * FROM assessments WHERE id = ?', [$assessmentId]);
    $user = one("SELECT * FROM users WHERE id = ? AND role = 'employee'", [$userId]);
    if (!$assessment || !$user) {
        throw new HttpError(404, 'Assessment or account not found.');
    }
    $note = optional_str(input('conditionsNote', ''), 600);

    run_sql(
        'INSERT INTO retake_authorizations (assessment_id, user_id, authorized_by_identity, conditions_note, created_at)
         VALUES (?, ?, ?, ?, ?)',
        [$assessmentId, $userId, identity_of($admin), $note ?: null, now()]
    );
    notify(
        $userId,
        'retake',
        'A retake has been authorised',
        'You may retake ' . $assessment['title'] . '. ' . optional_str($note, 200),
        '/portal/assessments'
    );
    record_audit($admin['id'], identity_of($admin), 'RETAKE_AUTHORISED', 'assessment', (string) $assessmentId, 'Authorised a retake of “' . $assessment['title'] . '” for ' . $user['full_name'] . '.');
    http_response_code(201);
    json_out(['ok' => true]);
}, 'admin');

/* ─────────────────────────── projects & readiness ─────────────────────────── */

Router::get('/admin/projects', static function (): void {
    require_admin();
    $projects = [];
    foreach (all('SELECT * FROM projects ORDER BY created_at DESC') as $row) {
        $requirements = [];
        foreach (all(
            'SELECT pa.assessment_id, pa.minimum_percentage, a.title, a.passing_percentage
               FROM project_assessments pa JOIN assessments a ON a.id = pa.assessment_id WHERE pa.project_id = ?',
            [$row['id']]
        ) as $requirement) {
            $requirements[] = [
                'assessmentId' => (int) $requirement['assessment_id'],
                'minimumPercentage' => $requirement['minimum_percentage'] === null
                    ? (float) $requirement['passing_percentage']
                    : (float) $requirement['minimum_percentage'],
                'title' => $requirement['title'],
                'passingPercentage' => (float) $requirement['passing_percentage'],
            ];
        }
        $readiness = [];
        foreach (all('SELECT readiness_status, COUNT(*) AS count FROM employee_project_readiness WHERE project_id = ? GROUP BY readiness_status', [$row['id']]) as $entry) {
            $readiness[] = ['status' => $entry['readiness_status'], 'count' => (int) $entry['count']];
        }
        $projects[] = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'clientNote' => $row['client_note'],
            'description' => $row['description'],
            'approvalMode' => $row['approval_mode'],
            'status' => $row['status'],
            'createdAt' => iso($row['created_at']),
            'requirements' => $requirements,
            'readiness' => $readiness,
        ];
    }
    json_out(['projects' => $projects]);
}, 'admin');

Router::post('/admin/projects', static function (): void {
    $admin = require_admin();
    $body = body();
    $name = str_input($body['name'] ?? '', 160, 2, 'Project name');
    $id = insert_id(
        'INSERT INTO projects (name, client_note, description, approval_mode, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $name,
            optional_str($body['clientNote'] ?? '', 200) ?: null,
            optional_str($body['description'] ?? '', 2000) ?: null,
            ($body['approvalMode'] ?? '') === 'manual' ? 'manual' : 'automatic',
            ($body['status'] ?? 'active') === 'archived' ? 'archived' : 'active',
            $admin['id'],
            now(),
            now(),
        ]
    );
    foreach ((array) ($body['requirements'] ?? []) as $requirement) {
        $assessmentId = (int) ($requirement['assessmentId'] ?? 0);
        if ($assessmentId < 1) {
            continue;
        }
        $minimum = !empty($requirement['minimumPercentage']) ? int_input($requirement['minimumPercentage'], 1, 100, 75) : null;
        if (val('SELECT id FROM project_assessments WHERE project_id = ? AND assessment_id = ?', [$id, $assessmentId]) === null) {
            run_sql('INSERT INTO project_assessments (project_id, assessment_id, minimum_percentage) VALUES (?, ?, ?)', [$id, $assessmentId, $minimum]);
        }
    }
    record_audit($admin['id'], identity_of($admin), 'PROJECT_CREATED', 'project', (string) $id, 'Created project “' . $name . '”.');
    http_response_code(201);
    json_out(['id' => $id]);
}, 'admin');

Router::put('/admin/projects/{id}', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM projects WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Project not found.');
    }
    $body = body();
    $name = !empty($body['name']) ? str_input($body['name'], 160, 2, 'Project name') : $existing['name'];
    run_sql(
        'UPDATE projects SET name = ?, client_note = ?, description = ?, approval_mode = ?, status = ?, updated_at = ? WHERE id = ?',
        [
            $name,
            optional_str($body['clientNote'] ?? '', 200) ?: $existing['client_note'],
            optional_str($body['description'] ?? '', 2000) ?: $existing['description'],
            ($body['approvalMode'] ?? '') === 'manual' ? 'manual' : 'automatic',
            ($body['status'] ?? '') === 'archived' ? 'archived' : 'active',
            now(),
            $existing['id'],
        ]
    );
    if (isset($body['requirements']) && is_array($body['requirements'])) {
        run_sql('DELETE FROM project_assessments WHERE project_id = ?', [$existing['id']]);
        foreach ($body['requirements'] as $requirement) {
            $assessmentId = (int) ($requirement['assessmentId'] ?? 0);
            if ($assessmentId < 1) {
                continue;
            }
            $minimum = !empty($requirement['minimumPercentage']) ? int_input($requirement['minimumPercentage'], 1, 100, 75) : null;
            if (val('SELECT id FROM project_assessments WHERE project_id = ? AND assessment_id = ?', [$existing['id'], $assessmentId]) === null) {
                run_sql('INSERT INTO project_assessments (project_id, assessment_id, minimum_percentage) VALUES (?, ?, ?)', [
                    $existing['id'],
                    $assessmentId,
                    $minimum,
                ]);
            }
        }
        foreach (all('SELECT user_id FROM employee_project_readiness WHERE project_id = ?', [$existing['id']]) as $person) {
            recompute_readiness((int) $existing['id'], (int) $person['user_id'], identity_of($admin));
        }
    }
    record_audit($admin['id'], identity_of($admin), 'PROJECT_UPDATED', 'project', (string) $existing['id'], 'Updated project “' . $name . '”.');
    json_out(['ok' => true]);
}, 'admin');

Router::get('/admin/readiness', static function (): void {
    require_admin();
    $projects = [];
    foreach (all("SELECT * FROM projects WHERE status = 'active' ORDER BY name") as $project) {
        $requirements = [];
        foreach (all(
            'SELECT pa.assessment_id, a.title, pa.minimum_percentage, a.passing_percentage
               FROM project_assessments pa JOIN assessments a ON a.id = pa.assessment_id WHERE pa.project_id = ?',
            [$project['id']]
        ) as $requirement) {
            $requirements[] = [
                'assessmentId' => (int) $requirement['assessment_id'],
                'title' => $requirement['title'],
                'minimumPercentage' => $requirement['minimum_percentage'] === null ? null : (float) $requirement['minimum_percentage'],
                'passing_percentage' => (float) $requirement['passing_percentage'],
            ];
        }

        $people = [];
        foreach (all(
            "SELECT r.user_id, u.full_name, u.employee_code, r.readiness_status, r.decision_source, r.notes, r.updated_at
               FROM employee_project_readiness r JOIN users u ON u.id = r.user_id
              WHERE r.project_id = ? AND u.status != 'deleted' ORDER BY u.full_name",
            [$project['id']]
        ) as $person) {
            $scores = [];
            foreach (all(
                'SELECT pa.assessment_id, a.title, pa.minimum_percentage,
                        (SELECT MAX(percentage) FROM assessment_attempts at WHERE at.assessment_id = pa.assessment_id AND at.user_id = ?) AS best
                   FROM project_assessments pa JOIN assessments a ON a.id = pa.assessment_id WHERE pa.project_id = ?',
                [$person['user_id'], $project['id']]
            ) as $score) {
                $minimum = $score['minimum_percentage'] === null ? 75.0 : (float) $score['minimum_percentage'];
                $scores[] = [
                    'assessmentId' => (int) $score['assessment_id'],
                    'title' => $score['title'],
                    'minimumPercentage' => $score['minimum_percentage'] === null ? null : (float) $score['minimum_percentage'],
                    'best' => $score['best'] === null ? null : (float) $score['best'],
                    'minimum' => $minimum,
                    'met' => (float) ($score['best'] ?? 0) >= $minimum,
                ];
            }
            $people[] = [
                'userId' => (int) $person['user_id'],
                'name' => $person['full_name'],
                'code' => $person['employee_code'],
                'status' => $person['readiness_status'],
                'source' => $person['decision_source'],
                'notes' => $person['notes'],
                'updatedAt' => iso($person['updated_at']),
                'scores' => $scores,
            ];
        }

        $projects[] = [
            'id' => (int) $project['id'],
            'name' => $project['name'],
            'approvalMode' => $project['approval_mode'],
            'requirements' => $requirements,
            'people' => $people,
        ];
    }
    json_out(['projects' => $projects]);
}, 'admin');

Router::post('/admin/readiness/decision', static function (): void {
    $admin = require_admin();
    $body = body();
    $projectId = int_input($body['projectId'] ?? null, 0, 1000000, -1);
    $userId = int_input($body['userId'] ?? null, 0, 1000000, -1);
    $status = $body['status'] ?? '';
    if (!in_array($status, ['not_ready', 'in_preparation', 'pending_approval', 'approved', 'revoked'], true)) {
        throw new HttpError(400, 'Choose a valid readiness status.');
    }

    $project = one('SELECT * FROM projects WHERE id = ?', [$projectId]);
    $user = one("SELECT * FROM users WHERE id = ? AND role = 'employee'", [$userId]);
    if (!$project || !$user) {
        throw new HttpError(404, 'Project or account not found.');
    }
    $notes = optional_str($body['notes'] ?? '', 1000);

    $existing = one('SELECT * FROM employee_project_readiness WHERE project_id = ? AND user_id = ?', [$projectId, $userId]);
    if ($existing) {
        run_sql(
            "UPDATE employee_project_readiness SET readiness_status = ?, decision_source = 'manual', notes = ?, updated_by_identity = ?, updated_at = ?
              WHERE id = ?",
            [$status, $notes ?: $existing['notes'], identity_of($admin), now(), $existing['id']]
        );
    } else {
        run_sql(
            "INSERT INTO employee_project_readiness (project_id, user_id, readiness_status, decision_source, notes, updated_by_identity, updated_at)
             VALUES (?, ?, ?, 'manual', ?, ?, ?)",
            [$projectId, $userId, $status, $notes ?: null, identity_of($admin), now()]
        );
    }

    run_sql(
        "INSERT INTO project_readiness_history (project_id, user_id, previous_status, new_status, decision_source, actor_identity, reason, created_at)
         VALUES (?, ?, ?, ?, 'manual', ?, ?, ?)",
        [$projectId, $userId, $existing['readiness_status'] ?? null, $status, identity_of($admin), optional_str($notes, 500) ?: null, now()]
    );
    notify(
        $userId,
        'readiness',
        'Readiness decision recorded',
        $project['name'] . ' is now ' . str_replace('_', ' ', $status) . '.',
        '/portal/readiness'
    );
    record_audit($admin['id'], identity_of($admin), 'READINESS_DECISION', 'project', (string) $projectId, 'Set ' . $user['full_name'] . ' to ' . $status . ' for ' . $project['name'] . '.');
    json_out(['ok' => true, 'status' => $status]);
}, 'admin');

/* ─────────────────────────── announcements ─────────────────────────── */

Router::get('/admin/announcements', static function (): void {
    require_admin();
    $list = [];
    foreach (all('SELECT * FROM announcements ORDER BY created_at DESC') as $row) {
        $list[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'category' => $row['category'],
            'body' => $row['body'],
            'status' => $row['status'],
            'author' => $row['author_identity'],
            'publishedAt' => iso($row['published_at']),
            'createdAt' => iso($row['created_at']),
        ];
    }
    json_out(['announcements' => $list]);
}, 'admin');

Router::post('/admin/announcements', static function (): void {
    $admin = require_admin();
    $body = body();
    $title = str_input($body['title'] ?? '', 190, 3, 'Title');
    $category = optional_str($body['category'] ?? '', 80) ?: 'General update';
    $message = str_input($body['body'] ?? '', 20000, 10, 'Message');
    $status = in_array($body['status'] ?? '', ['draft', 'published', 'archived'], true) ? $body['status'] : 'published';

    $id = insert_id(
        'INSERT INTO announcements (title, category, body, status, author_identity, created_by, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$title, $category, $message, $status, identity_of($admin), $admin['id'], $status === 'published' ? now() : null, now(), now()]
    );
    if ($status === 'published') {
        notify_all_employees('announcement', $title, mb_substr($message, 0, 180), '/portal/announcements');
    }
    record_audit($admin['id'], identity_of($admin), 'ANNOUNCEMENT_CREATED', 'announcement', (string) $id, 'Published announcement “' . $title . '”.');
    http_response_code(201);
    json_out(['id' => $id]);
}, 'admin');

Router::put('/admin/announcements/{id}', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM announcements WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Announcement not found.');
    }
    $body = body();
    $title = !empty($body['title']) ? str_input($body['title'], 190, 3, 'Title') : $existing['title'];
    $category = array_key_exists('category', $body) ? (optional_str($body['category'], 80) ?: 'General update') : $existing['category'];
    $message = !empty($body['body']) ? str_input($body['body'], 20000, 10, 'Message') : $existing['body'];
    $status = in_array($body['status'] ?? '', ['draft', 'published', 'archived'], true) ? $body['status'] : $existing['status'];
    $publishedAt = $status === 'published' ? ($existing['published_at'] ?: now()) : $existing['published_at'];

    run_sql(
        'UPDATE announcements SET title = ?, category = ?, body = ?, status = ?, published_at = ?, updated_at = ? WHERE id = ?',
        [$title, $category, $message, $status, $publishedAt, now(), $existing['id']]
    );
    if ($status === 'published' && $existing['status'] !== 'published') {
        notify_all_employees('announcement', $title, mb_substr($message, 0, 180), '/portal/announcements');
    }
    record_audit($admin['id'], identity_of($admin), 'ANNOUNCEMENT_UPDATED', 'announcement', (string) $existing['id'], 'Updated announcement “' . $title . '”.');
    json_out(['ok' => true]);
}, 'admin');

Router::delete('/admin/announcements/{id}', static function (string $id): void {
    $admin = require_admin();
    $existing = one('SELECT * FROM announcements WHERE id = ?', [(int) $id]);
    if (!$existing) {
        throw new HttpError(404, 'Announcement not found.');
    }
    run_sql("UPDATE announcements SET status = 'archived', updated_at = ? WHERE id = ?", [now(), $existing['id']]);
    record_audit($admin['id'], identity_of($admin), 'ANNOUNCEMENT_ARCHIVED', 'announcement', (string) $existing['id'], 'Archived announcement “' . $existing['title'] . '”.');
    json_out(['ok' => true]);
}, 'admin');

/* ─────────────────────────── feedback ─────────────────────────── */

Router::get('/admin/feedback', static function (): void {
    require_admin();
    $status = (string) query('status', '');
    $sql = 'SELECT * FROM employee_feedback ';
    $params = [];
    if ($status !== '' && $status !== 'all') {
        $sql .= 'WHERE status = ? ';
        $params[] = $status;
    }
    $sql .= 'ORDER BY created_at DESC';

    $feedback = [];
    foreach (all($sql, $params) as $row) {
        $feedback[] = [
            'id' => (int) $row['id'],
            'identity' => $row['employee_identity'],
            'category' => $row['category'],
            'subject' => $row['subject'],
            'message' => $row['message'],
            'status' => $row['status'],
            'response' => $row['admin_response'],
            'createdAt' => iso($row['created_at']),
            'updatedAt' => iso($row['updated_at']),
        ];
    }
    json_out(['feedback' => $feedback]);
}, 'admin');

Router::patch('/admin/feedback/{id}', static function (string $id): void {
    $admin = require_admin();
    $row = one('SELECT * FROM employee_feedback WHERE id = ?', [(int) $id]);
    if (!$row) {
        throw new HttpError(404, 'Feedback not found.');
    }
    $body = body();
    $status = in_array($body['status'] ?? '', ['New', 'Under Review', 'Addressed', 'Closed'], true) ? $body['status'] : $row['status'];
    $response = array_key_exists('response', $body) ? optional_str($body['response'], 4000) : $row['admin_response'];

    run_sql('UPDATE employee_feedback SET status = ?, admin_response = ?, updated_by_identity = ?, updated_at = ? WHERE id = ?', [
        $status,
        $response ?: null,
        identity_of($admin),
        now(),
        $row['id'],
    ]);
    if ($status === 'Addressed' && $row['status'] !== 'Addressed') {
        notify(
            (int) $row['user_id'],
            'feedback',
            'Your feedback has been addressed',
            $row['subject'],
            '/portal/feedback'
        );
    }
    record_audit($admin['id'], identity_of($admin), 'FEEDBACK_UPDATED', 'feedback', (string) $row['id'], 'Moved feedback “' . $row['subject'] . '” to ' . $status . '.');
    json_out(['ok' => true, 'status' => $status]);
}, 'admin');
