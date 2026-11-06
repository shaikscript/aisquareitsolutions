<?php
/**
 * Employee workspace + candidate exam portal API.
 */

declare(strict_types=1);

function assessment_state(array $assessment, array $attempts, array $user, array $assignedIds, array $retakeIds): array
{
    $open = null;
    $completed = [];
    foreach ($attempts as $attempt) {
        if ($attempt['status'] === 'in_progress') {
            $open = $attempt;
        } else {
            $completed[] = $attempt;
        }
    }

    $best = null;
    foreach ($completed as $attempt) {
        $value = $attempt['percentage'] !== null ? (float) $attempt['percentage'] : 0.0;
        $best = $best === null ? $value : max($best, $value);
    }
    $passed = $best !== null && $best >= (float) $assessment['passing_percentage'];

    $nowStamp = time();
    $opensAt = $assessment['available_from'] ? ts($assessment['available_from']) : null;
    $closesAt = $assessment['available_until'] ? ts($assessment['available_until']) : null;
    $windowOpen = (!$opensAt || $opensAt <= $nowStamp) && (!$closesAt || $closesAt >= $nowStamp);
    $assigned = empty($user['restrictToAssigned']) || in_array((int) $assessment['id'], $assignedIds, true);
    $retake = in_array((int) $assessment['id'], $retakeIds, true);

    if ($open) {
        $state = 'in_progress';
    } elseif (count($completed) && $passed) {
        $state = 'passed';
    } elseif (count($completed) && !$retake) {
        $state = 'awaiting_retake';
    } elseif (!$windowOpen) {
        $state = ($closesAt && $closesAt < $nowStamp) ? 'closed' : 'scheduled';
    } elseif (!$assigned) {
        $state = 'not_assigned';
    } else {
        $state = 'available';
    }

    return [
        'state' => $state,
        'openAttemptId' => $open ? (int) $open['id'] : null,
        'bestPercentage' => $best,
        'attemptCount' => count($attempts),
        'canStart' => $state === 'available' && $assigned && $windowOpen,
        'retakeAvailable' => $retake,
    ];
}

/* ─────────────────────────── status ─────────────────────────── */

Router::get('/portal/status', static function (): void {
    $user = current_user();
    json_out([
        'signedIn' => (bool) $user,
        'accountType' => $user['accountType'] ?? null,
        'unread' => $user ? (int) val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', [$user['id']]) : 0,
    ]);
});

Router::post('/portal/heartbeat', static function (): void {
    $user = require_any_employee();
    run_sql('UPDATE users SET last_active_at = ? WHERE id = ?', [now(), $user['id']]);
    json_out([
        'ok' => true,
        'unread' => (int) val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', [$user['id']]),
    ]);
}, 'any');

/* ─────────────────────────── overview ─────────────────────────── */

Router::get('/portal/overview', static function (): void {
    $user = require_employee();
    $userId = (int) $user['id'];

    $attemptRows = all(
        'SELECT a.*, s.title, s.passing_percentage, s.domain
           FROM assessment_attempts a JOIN assessments s ON s.id = a.assessment_id
          WHERE a.user_id = ? ORDER BY a.started_at DESC',
        [$userId]
    );

    $available = all(
        "SELECT s.* FROM assessments s
          WHERE s.status = 'published'
            AND (s.available_from IS NULL OR s.available_from <= ?)
            AND (s.available_until IS NULL OR s.available_until >= ?)
            AND EXISTS (SELECT 1 FROM assessment_questions aq WHERE aq.assessment_id = s.id)",
        [now(), now()]
    );

    $assignedIds = [];
    foreach (all('SELECT assessment_id FROM exam_assignments WHERE user_id = ?', [$userId]) as $row) {
        $assignedIds[] = (int) $row['assessment_id'];
    }
    $eligible = [];
    foreach ($available as $assessment) {
        if (!empty($user['restrictToAssigned']) && !in_array((int) $assessment['id'], $assignedIds, true)) {
            continue;
        }
        $eligible[] = $assessment;
    }

    $openAttempts = [];
    $released = [];
    $scored = [];
    foreach ($attemptRows as $attempt) {
        if ($attempt['status'] === 'in_progress') {
            $openAttempts[] = $attempt;
        } elseif (!empty($attempt['is_released'])) {
            $released[] = $attempt;
            if ($attempt['percentage'] !== null) {
                $scored[] = (float) $attempt['percentage'];
            }
        }
    }
    $average = count($scored) ? round(array_sum($scored) / count($scored), 1) : null;

    $readiness = [];
    $readinessRows = all(
        'SELECT r.*, p.name AS project_name, p.approval_mode
           FROM employee_project_readiness r JOIN projects p ON p.id = r.project_id
          WHERE r.user_id = ? ORDER BY p.name',
        [$userId]
    );
    foreach ($readinessRows as $row) {
        $requirements = [];
        $requirementRows = all(
            'SELECT pa.assessment_id, pa.minimum_percentage, s.title, s.passing_percentage
               FROM project_assessments pa JOIN assessments s ON s.id = pa.assessment_id
              WHERE pa.project_id = ?',
            [$row['project_id']]
        );
        foreach ($requirementRows as $requirement) {
            $best = best_any_score((int) $requirement['assessment_id'], $userId);
            $minimum = $requirement['minimum_percentage'] !== null
                ? (float) $requirement['minimum_percentage']
                : (float) ($requirement['passing_percentage'] ?? 75);
            $requirements[] = [
                'assessmentId' => (int) $requirement['assessment_id'],
                'minimumPercentage' => $requirement['minimum_percentage'],
                'assessmentTitle' => $requirement['title'],
                'passingPercentage' => (float) $requirement['passing_percentage'],
                'minimum' => $minimum,
                'best' => $best,
                'met' => ($best ?? 0) >= $minimum,
            ];
        }
        $readiness[] = [
            'projectId' => (int) $row['project_id'],
            'project' => $row['project_name'],
            'status' => $row['readiness_status'],
            'approvalMode' => $row['approval_mode'],
            'notes' => $row['notes'],
            'requirements' => $requirements,
            'updatedAt' => iso($row['updated_at']),
        ];
    }

    $pending = [];
    foreach ($eligible as $assessment) {
        $touched = false;
        foreach ($attemptRows as $attempt) {
            if ((int) $attempt['assessment_id'] === (int) $assessment['id']) {
                $touched = true;
                break;
            }
        }
        if ($touched) {
            continue;
        }
        $pending[] = [
            'id' => (int) $assessment['id'],
            'title' => $assessment['title'],
            'domain' => $assessment['domain'],
            'isTimed' => (bool) $assessment['is_timed'],
            'timeLimitMinutes' => $assessment['time_limit_minutes'] === null ? null : (int) $assessment['time_limit_minutes'],
            'questionCount' => (int) val('SELECT COUNT(*) FROM assessment_questions WHERE assessment_id = ?', [$assessment['id']]),
        ];
        if (count($pending) >= 4) {
            break;
        }
    }

    $ackCount = (int) val(
        "SELECT COUNT(*) FROM guideline_reads r JOIN guidelines g ON g.id = r.guideline_id
          WHERE r.user_id = ? AND r.acknowledged = 1 AND g.status = 'published' AND r.version = g.version",
        [$userId]
    );
    $publishedGuidelines = (int) val("SELECT COUNT(*) FROM guidelines WHERE status = 'published'");

    $announcements = [];
    foreach (all("SELECT id, title, category, body, author_identity, published_at FROM announcements WHERE status = 'published' ORDER BY published_at DESC LIMIT 3") as $row) {
        $announcements[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'category' => $row['category'],
            'body' => $row['body'],
            'author' => $row['author_identity'],
            'publishedAt' => iso($row['published_at']),
        ];
    }

    $activity = [];
    foreach (all('SELECT event_type, area, detail, created_at FROM portal_activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 8', [$userId]) as $row) {
        $activity[] = [
            'type' => $row['event_type'],
            'area' => $row['area'],
            'detail' => $row['detail'],
            'createdAt' => iso($row['created_at']),
        ];
    }

    json_out([
        'profile' => [
            'name' => $user['fullName'],
            'code' => $user['employeeCode'],
            'email' => $user['email'],
            'department' => $user['departmentNote'],
            'lastLoginAt' => iso($user['lastLoginAt']),
        ],
        'stats' => [
            'openAssessments' => count($eligible),
            'inProgress' => count($openAttempts),
            'completed' => count($released),
            'averagePercentage' => $average,
            'readinessApproved' => count(array_filter($readiness, static fn ($r) => $r['status'] === 'approved')),
            'guidelinesAcknowledged' => $ackCount,
            'guidelinesTotal' => $publishedGuidelines,
            'unreadNotifications' => (int) val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', [$userId]),
        ],
        'readiness' => $readiness,
        'pendingAssessments' => $pending,
        'announcements' => $announcements,
        'activity' => $activity,
    ]);
}, 'employee');

/* ─────────────────────────── guidelines ─────────────────────────── */

Router::get('/portal/guidelines', static function (): void {
    $user = require_employee();
    $rows = all(
        "SELECT g.*, r.version AS read_version, r.acknowledged, r.seconds_spent, r.last_seen_at
           FROM guidelines g
           LEFT JOIN guideline_reads r ON r.guideline_id = g.id AND r.user_id = ?
          WHERE g.status = 'published'
          ORDER BY g.category, g.title",
        [$user['id']]
    );

    $list = [];
    foreach ($rows as $row) {
        $sameVersion = $row['read_version'] !== null && (int) $row['read_version'] === (int) $row['version'];
        $list[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'category' => $row['category'],
            'summary' => $row['summary'],
            'version' => (int) $row['version'],
            'requiresAck' => (bool) $row['requires_ack'],
            'fileName' => $row['file_original_name'],
            'fileSize' => $row['file_size_bytes'] === null ? null : (int) $row['file_size_bytes'],
            'updatedAt' => iso($row['updated_at']),
            'read' => $sameVersion,
            'acknowledged' => (bool) $row['acknowledged'] && $sameVersion,
            'needsReview' => $row['read_version'] !== null && !$sameVersion,
            'secondsSpent' => (int) ($row['seconds_spent'] ?? 0),
            'lastSeenAt' => iso($row['last_seen_at']),
        ];
    }
    json_out(['guidelines' => $list]);
}, 'employee');

Router::get('/portal/guidelines/{id}', static function (string $id): void {
    $user = require_employee();
    $guideline = one("SELECT * FROM guidelines WHERE id = ? AND status = 'published'", [(int) $id]);
    if (!$guideline) {
        throw new HttpError(404, 'Guideline not found.');
    }

    $read = one('SELECT * FROM guideline_reads WHERE guideline_id = ? AND user_id = ?', [$guideline['id'], $user['id']]);
    if (!$read || (int) $read['version'] !== (int) $guideline['version']) {
        if ($read) {
            run_sql(
                'UPDATE guideline_reads SET version = ?, acknowledged = 0, first_opened_at = ?, last_seen_at = ? WHERE id = ?',
                [$guideline['version'], now(), now(), $read['id']]
            );
        } else {
            run_sql(
                'INSERT INTO guideline_reads (guideline_id, user_id, version, seconds_spent, acknowledged, first_opened_at, last_seen_at)
                 VALUES (?, ?, ?, 0, 0, ?, ?)',
                [$guideline['id'], $user['id'], $guideline['version'], now(), now()]
            );
        }
    } else {
        run_sql('UPDATE guideline_reads SET last_seen_at = ? WHERE id = ?', [now(), $read['id']]);
    }

    $history = [];
    foreach (all('SELECT version, change_note, created_at FROM guideline_versions WHERE guideline_id = ? ORDER BY version DESC', [$guideline['id']]) as $row) {
        $history[] = [
            'version' => (int) $row['version'],
            'changeNote' => $row['change_note'],
            'createdAt' => iso($row['created_at']),
        ];
    }

    json_out([
        'guideline' => [
            'id' => (int) $guideline['id'],
            'title' => $guideline['title'],
            'category' => $guideline['category'],
            'summary' => $guideline['summary'],
            'version' => (int) $guideline['version'],
            'requiresAck' => (bool) $guideline['requires_ack'],
            'fileName' => $guideline['file_original_name'],
            'fileSize' => $guideline['file_size_bytes'] === null ? null : (int) $guideline['file_size_bytes'],
            'updatedAt' => iso($guideline['updated_at']),
            'acknowledged' => (bool) ($read['acknowledged'] ?? false) && (int) ($read['version'] ?? -1) === (int) $guideline['version'],
            'pdfUrl' => '/api/portal/guidelines/' . $guideline['id'] . '/pdf',
            'history' => $history,
        ],
    ]);
}, 'employee');

Router::post('/portal/guidelines/{id}/acknowledge', static function (string $id): void {
    $user = require_employee();
    $guideline = one("SELECT * FROM guidelines WHERE id = ? AND status = 'published'", [(int) $id]);
    if (!$guideline) {
        throw new HttpError(404, 'Guideline not found.');
    }
    $seconds = int_input(input('secondsSpent'), 0, 86400, 60);

    $read = one('SELECT * FROM guideline_reads WHERE guideline_id = ? AND user_id = ?', [$guideline['id'], $user['id']]);
    if ($read) {
        run_sql(
            'UPDATE guideline_reads SET version = ?, seconds_spent = ?, acknowledged = 1, last_seen_at = ? WHERE id = ?',
            [$guideline['version'], max((int) $read['seconds_spent'], $seconds), now(), $read['id']]
        );
    } else {
        run_sql(
            'INSERT INTO guideline_reads (guideline_id, user_id, version, seconds_spent, acknowledged, first_opened_at, last_seen_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)',
            [$guideline['id'], $user['id'], $guideline['version'], $seconds, now(), now()]
        );
    }

    record_activity($user['id'], identity_of($user), 'guideline_acknowledged', 'guidelines', $guideline['title']);
    json_out(['ok' => true]);
}, 'employee');

Router::get('/portal/guidelines/{id}/pdf', static function (string $id): void {
    $user = require_employee();
    $guideline = one("SELECT * FROM guidelines WHERE id = ? AND status = 'published'", [(int) $id]);
    if (!$guideline || !$guideline['file_stored_name']) {
        throw new HttpError(404, 'No document is attached.');
    }
    $path = storage_dir('guidelines') . '/' . basename($guideline['file_stored_name']);

    $read = one('SELECT id FROM guideline_reads WHERE guideline_id = ? AND user_id = ?', [$guideline['id'], $user['id']]);
    if ($read) {
        run_sql('UPDATE guideline_reads SET last_seen_at = ? WHERE id = ?', [now(), $read['id']]);
    } else {
        run_sql(
            'INSERT INTO guideline_reads (guideline_id, user_id, version, seconds_spent, acknowledged, first_opened_at, last_seen_at)
             VALUES (?, ?, ?, 0, 0, ?, ?)',
            [$guideline['id'], $user['id'], $guideline['version'], now(), now()]
        );
    }

    send_file($path, $guideline['file_original_name'] ?: 'guideline.pdf', $guideline['file_mime_type'] ?: 'application/pdf');
}, 'employee');

/* ─────────────────────────── assessments ─────────────────────────── */

Router::get('/portal/assessments', static function (): void {
    $user = require_any_employee();
    $rows = all(
        "SELECT s.*, (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.assessment_id = s.id) AS question_count
           FROM assessments s WHERE s.status = 'published' ORDER BY s.created_at DESC"
    );
    $attempts = all('SELECT * FROM assessment_attempts WHERE user_id = ? ORDER BY id DESC', [$user['id']]);

    $assignedIds = [];
    foreach (all('SELECT assessment_id FROM exam_assignments WHERE user_id = ?', [$user['id']]) as $row) {
        $assignedIds[] = (int) $row['assessment_id'];
    }
    $retakeIds = [];
    foreach (all('SELECT assessment_id FROM retake_authorizations WHERE user_id = ? AND used_in_attempt_id IS NULL', [$user['id']]) as $row) {
        $retakeIds[] = (int) $row['assessment_id'];
    }

    $list = [];
    foreach ($rows as $assessment) {
        $mine = [];
        foreach ($attempts as $attempt) {
            if ((int) $attempt['assessment_id'] === (int) $assessment['id']) {
                $mine[] = $attempt;
            }
        }
        $state = assessment_state($assessment, $mine, $user, $assignedIds, $retakeIds);
        if ($state['state'] === 'not_assigned' && $state['attemptCount'] === 0) {
            continue;
        }
        $last = $mine[0] ?? null;
        $list[] = array_merge([
            'id' => (int) $assessment['id'],
            'title' => $assessment['title'],
            'domain' => $assessment['domain'],
            'instructions' => $assessment['instructions'],
            'isTimed' => (bool) $assessment['is_timed'],
            'timeLimitMinutes' => $assessment['time_limit_minutes'] === null ? null : (int) $assessment['time_limit_minutes'],
            'passingPercentage' => (float) $assessment['passing_percentage'],
            'questionCount' => (int) $assessment['question_count'],
            'availableFrom' => iso($assessment['available_from']),
            'availableUntil' => iso($assessment['available_until']),
        ], $state, [
            'lastAttempt' => $last
                ? [
                    'id' => (int) $last['id'],
                    'status' => $last['status'],
                    'percentage' => !empty($last['is_released']) ? ($last['percentage'] === null ? null : (float) $last['percentage']) : null,
                    'submittedAt' => iso($last['submitted_at']),
                    'isReleased' => (bool) $last['is_released'],
                ]
                : null,
        ]);
    }

    json_out(['assessments' => $list]);
}, 'any');

Router::post('/portal/assessments/{id}/start', static function (string $id): void {
    $user = require_any_employee();
    $result = start_attempt($user, (int) $id);
    $title = val('SELECT title FROM assessments WHERE id = ?', [(int) $id]);
    record_activity(
        $user['id'],
        identity_of($user),
        $result['resumed'] ? 'assessment_resumed' : 'assessment_started',
        'assessments',
        $title
    );
    http_response_code(201);
    json_out($result);
}, 'any');

Router::get('/portal/attempts/{attemptId}', static function (string $attemptId): void {
    $user = require_any_employee();
    $payload = load_attempt((int) $attemptId, $user);
    $visible = $payload['attempt']['isReleased'];

    $payload['attempt']['percentage'] = $visible ? $payload['attempt']['percentage'] : null;
    $payload['attempt']['passed'] = $visible ? $payload['attempt']['passed'] : null;
    $payload['attempt']['finalScore'] = $visible ? $payload['attempt']['finalScore'] : null;
    $payload['attempt']['reviewerComment'] = $visible ? $payload['attempt']['reviewerComment'] : null;

    foreach ($payload['questions'] as $index => $question) {
        $answer = $question['answer'] ?? null;
        $reveal = $question['type'] === 'practical_scenario' ? true : ($visible && $payload['attempt']['releaseVisibility']['answers']);
        if (!$reveal) {
            $payload['questions'][$index]['answer'] = [
                'value' => $answer['value'] ?? '',
                'reasoning' => $answer['reasoning'] ?? '',
                'awardedMarks' => null,
                'isCorrect' => null,
                'reviewerComment' => null,
            ];
        }
    }

    json_out($payload);
}, 'any');

Router::put('/portal/attempts/{attemptId}/answers', static function (string $attemptId): void {
    $user = require_any_employee();
    $body = body();
    $questionId = int_input($body['questionId'] ?? null, 0, 1000000, -1);
    if ($questionId < 1) {
        throw new HttpError(400, 'A question is required.');
    }
    save_answer(
        (int) $attemptId,
        $user,
        $questionId,
        optional_str($body['value'] ?? '', 8000),
        optional_str($body['reasoning'] ?? '', 8000)
    );
    json_out(['ok' => true, 'savedAt' => gmdate('Y-m-d\TH:i:s.000\Z')]);
}, 'any');

Router::post('/portal/attempts/{attemptId}/interruption', static function (string $attemptId): void {
    $user = require_any_employee();
    $attempt = one('SELECT * FROM assessment_attempts WHERE id = ? AND user_id = ?', [(int) $attemptId, $user['id']]);
    if (!$attempt || $attempt['status'] !== 'in_progress') {
        throw new HttpError(409, 'No active attempt.');
    }

    $event = input('event') === 'resume' ? 'resume' : 'disconnect';
    if ($event === 'disconnect') {
        if (empty($attempt['disconnect_started_at'])) {
            run_sql(
                "UPDATE assessment_attempts SET disconnect_started_at = ?, interruption_count = interruption_count + 1, status_detail = 'Connection paused' WHERE id = ?",
                [now(), $attempt['id']]
            );
            run_sql("INSERT INTO attempt_events (attempt_id, event_type, detail, created_at) VALUES (?, 'disconnect', ?, ?)", [
                $attempt['id'],
                'Connection lost — timer paused',
                now(),
            ]);
        }
    } elseif (!empty($attempt['disconnect_started_at'])) {
        $paused = max(0, time() - ts($attempt['disconnect_started_at']));
        run_sql(
            "UPDATE assessment_attempts SET paused_seconds = paused_seconds + ?, disconnect_started_at = NULL, status_detail = 'In progress' WHERE id = ?",
            [$paused, $attempt['id']]
        );
        run_sql("INSERT INTO attempt_events (attempt_id, event_type, detail, created_at) VALUES (?, 'resume', ?, ?)", [
            $attempt['id'],
            'Timer paused ' . $paused . 's',
            now(),
        ]);
    }

    $refreshed = one('SELECT * FROM assessment_attempts WHERE id = ?', [$attempt['id']]);
    $elapsed = (time() - ts($refreshed['started_at'])) - (int) $refreshed['paused_seconds'];
    $remaining = !empty($refreshed['is_timed'])
        ? max(0, (int) $refreshed['time_limit_seconds'] - max(0, $elapsed))
        : null;

    json_out([
        'ok' => true,
        'pausedSeconds' => (int) $refreshed['paused_seconds'],
        'remainingSeconds' => $remaining,
    ]);
}, 'any');

Router::post('/portal/attempts/{attemptId}/submit', static function (string $attemptId): void {
    $user = require_any_employee();
    $result = submit_attempt((int) $attemptId, $user);
    record_activity(
        $user['id'],
        identity_of($user),
        'assessment_submitted',
        'assessments',
        isset($result['percentage']) ? $result['percentage'] . '%' : null
    );
    json_out($result);
}, 'any');

/* ─────────────────────────── results ─────────────────────────── */

Router::get('/portal/results', static function (): void {
    $user = require_any_employee();
    $rows = all(
        "SELECT a.*, s.title, s.domain, s.passing_percentage
           FROM assessment_attempts a JOIN assessments s ON s.id = a.assessment_id
          WHERE a.user_id = ? AND a.status != 'in_progress'
          ORDER BY a.submitted_at DESC",
        [$user['id']]
    );

    $results = [];
    foreach ($rows as $row) {
        $results[] = [
            'id' => (int) $row['id'],
            'assessmentId' => (int) $row['assessment_id'],
            'title' => $row['title'],
            'domain' => $row['domain'],
            'attemptNumber' => (int) $row['attempt_number'],
            'submittedAt' => iso($row['submitted_at']),
            'durationSeconds' => $row['duration_seconds'] === null ? null : (int) $row['duration_seconds'],
            'status' => $row['status'],
            'statusDetail' => $row['status_detail'],
            'isReleased' => (bool) $row['is_released'],
            'requiresManualReview' => (bool) $row['requires_manual_review'],
            'percentage' => !empty($row['is_released']) && $row['percentage'] !== null ? (float) $row['percentage'] : null,
            'passed' => !empty($row['is_released']) ? (bool) $row['passed'] : null,
            'passingPercentage' => (float) $row['passing_percentage'],
            'releasedAt' => iso($row['released_at']),
            'showAnswers' => (bool) $row['is_released'] && (bool) $row['release_show_answers'],
            'reviewerComment' => !empty($row['is_released']) ? $row['reviewer_comment'] : null,
        ];
    }
    json_out(['results' => $results]);
}, 'any');

/* ─────────────────────────── readiness ─────────────────────────── */

Router::get('/portal/readiness', static function (): void {
    $user = require_employee();
    $rows = all(
        "SELECT r.*, p.name AS project_name, p.description, p.client_note, p.approval_mode
           FROM employee_project_readiness r JOIN projects p ON p.id = r.project_id
          WHERE r.user_id = ? AND p.status = 'active'
          ORDER BY p.name",
        [$user['id']]
    );

    $projects = [];
    foreach ($rows as $row) {
        $requirements = [];
        foreach (all(
            'SELECT pa.assessment_id, pa.minimum_percentage, s.title, s.passing_percentage
               FROM project_assessments pa JOIN assessments s ON s.id = pa.assessment_id
              WHERE pa.project_id = ?',
            [$row['project_id']]
        ) as $requirement) {
            $best = best_any_score((int) $requirement['assessment_id'], (int) $user['id']);
            $minimum = $requirement['minimum_percentage'] !== null
                ? (float) $requirement['minimum_percentage']
                : (float) ($requirement['passing_percentage'] ?? 75);
            $requirements[] = [
                'id' => (int) $requirement['assessment_id'],
                'minimum' => $minimum,
                'title' => $requirement['title'],
                'passingPercentage' => (float) $requirement['passing_percentage'],
                'best' => $best,
                'met' => ($best ?? 0) >= $minimum,
            ];
        }

        $history = [];
        foreach (all(
            'SELECT previous_status, new_status, decision_source, actor_identity, reason, created_at
               FROM project_readiness_history WHERE project_id = ? AND user_id = ?
              ORDER BY created_at DESC LIMIT 6',
            [$row['project_id'], $user['id']]
        ) as $entry) {
            $history[] = [
                'previous' => $entry['previous_status'],
                'next' => $entry['new_status'],
                'source' => $entry['decision_source'],
                'actor' => $entry['actor_identity'],
                'reason' => $entry['reason'],
                'createdAt' => iso($entry['created_at']),
            ];
        }

        $projects[] = [
            'projectId' => (int) $row['project_id'],
            'name' => $row['project_name'],
            'description' => $row['description'],
            'clientNote' => $row['client_note'],
            'approvalMode' => $row['approval_mode'],
            'status' => $row['readiness_status'],
            'decisionSource' => $row['decision_source'],
            'notes' => $row['notes'],
            'updatedAt' => iso($row['updated_at']),
            'requirements' => $requirements,
            'history' => $history,
        ];
    }
    json_out(['projects' => $projects]);
}, 'employee');

/* ─────────────────────────── comms ─────────────────────────── */

Router::get('/portal/announcements', static function (): void {
    require_employee();
    $list = [];
    foreach (all("SELECT id, title, category, body, author_identity, published_at FROM announcements WHERE status = 'published' ORDER BY published_at DESC") as $row) {
        $list[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'category' => $row['category'],
            'body' => $row['body'],
            'author' => $row['author_identity'],
            'publishedAt' => iso($row['published_at']),
        ];
    }
    json_out(['announcements' => $list]);
}, 'employee');

Router::get('/portal/notifications', static function (): void {
    $user = require_any_employee();
    $rows = all(
        'SELECT id, notification_type, title, message, link_path, is_read, created_at
           FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
        [$user['id']]
    );
    $list = [];
    $unread = 0;
    foreach ($rows as $row) {
        if (!$row['is_read']) {
            $unread++;
        }
        $list[] = [
            'id' => (int) $row['id'],
            'type' => $row['notification_type'],
            'title' => $row['title'],
            'message' => $row['message'],
            'linkPath' => $row['link_path'],
            'isRead' => (bool) $row['is_read'],
            'createdAt' => iso($row['created_at']),
        ];
    }
    json_out(['notifications' => $list, 'unread' => $unread]);
}, 'any');

Router::post('/portal/notifications/{id}/read', static function (string $id): void {
    $user = require_any_employee();
    run_sql('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [(int) $id, $user['id']]);
    json_out(['ok' => true]);
}, 'any');

Router::post('/portal/notifications/read-all', static function (): void {
    $user = require_any_employee();
    run_sql('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [$user['id']]);
    json_out(['ok' => true]);
}, 'any');

/* ─────────────────────────── feedback ─────────────────────────── */

const FEEDBACK_CATEGORIES = [
    'Guideline problem',
    'Assessment concern',
    'Portal usability',
    'Work preparation',
    'Suggestion',
];

Router::get('/portal/feedback', static function (): void {
    $user = require_employee();
    $list = [];
    foreach (all(
        'SELECT id, category, subject, message, status, admin_response, created_at, updated_at
           FROM employee_feedback WHERE user_id = ? ORDER BY created_at DESC',
        [$user['id']]
    ) as $row) {
        $list[] = [
            'id' => (int) $row['id'],
            'category' => $row['category'],
            'subject' => $row['subject'],
            'message' => $row['message'],
            'status' => $row['status'],
            'response' => $row['admin_response'],
            'createdAt' => iso($row['created_at']),
            'updatedAt' => iso($row['updated_at']),
        ];
    }
    json_out(['feedback' => $list]);
}, 'employee');

Router::post('/portal/feedback', static function (): void {
    $user = require_employee();
    $body = body();
    $category = str_input($body['category'] ?? '', 60, 3, 'Category');
    if (!in_array($category, FEEDBACK_CATEGORIES, true)) {
        throw new HttpError(400, 'Choose a valid feedback category.');
    }
    $subject = str_input($body['subject'] ?? '', 160, 4, 'Subject');
    $message = str_input($body['message'] ?? '', 4000, 15, 'Message');

    $id = insert_id(
        'INSERT INTO employee_feedback (user_id, employee_identity, category, subject, message, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, \'New\', ?, ?)',
        [$user['id'], identity_of($user), $category, $subject, $message, now(), now()]
    );
    record_activity($user['id'], identity_of($user), 'feedback_submitted', 'feedback', $subject);

    foreach (all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'") as $admin) {
        notify((int) $admin['id'], 'feedback', 'New employee feedback', $subject . ' · ' . $category, '/admin/feedback');
    }

    http_response_code(201);
    json_out(['ok' => true, 'id' => $id]);
}, 'employee');
