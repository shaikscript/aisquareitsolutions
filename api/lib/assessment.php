<?php
/**
 * Assessment engine: grading, attempts, reviews and project readiness.
 * Ported one-to-one from the original service layer so behaviour stays stable
 * across runtimes.
 */

declare(strict_types=1);

function normalize_answer($value): string
{
    $text = strtolower((string) ($value ?? ''));
    $text = preg_replace('/[^a-z0-9\s]/', ' ', $text) ?? '';
    return trim(preg_replace('/\s+/', ' ', $text) ?? '');
}

function grade_answer(array $question, $answerValue): array
{
    $type = $question['question_type'];
    if ($type === 'mcq' || $type === 'true_false') {
        $correct = normalize_answer($question['correct_answer'] ?? '');
        $given = normalize_answer($answerValue);
        return [
            'autoMarks' => ($correct !== '' && $given !== '' && $correct === $given) ? (float) $question['marks'] : 0.0,
            'correct' => $correct === $given,
        ];
    }
    if ($type === 'short_answer') {
        $acceptable = json_decode_safe($question['acceptable_answers_json'] ?? '[]', []);
        $given = normalize_answer($answerValue);
        if ($given === '') {
            return ['autoMarks' => 0.0, 'correct' => false];
        }
        $hit = false;
        foreach ((array) $acceptable as $needle) {
            $normalized = normalize_answer($needle);
            if ($normalized !== '' && strpos($given, $normalized) !== false) {
                $hit = true;
                break;
            }
        }
        return ['autoMarks' => $hit ? (float) $question['marks'] : 0.0, 'correct' => $hit];
    }
    return ['autoMarks' => null, 'correct' => null];
}

function best_released_score(int $assessmentId, int $userId): ?float
{
    $value = val(
        "SELECT MAX(percentage) FROM assessment_attempts
          WHERE assessment_id = ? AND user_id = ? AND status IN ('submitted','expired') AND is_released = 1",
        [$assessmentId, $userId]
    );
    return $value === null ? null : (float) $value;
}

function best_any_score(int $assessmentId, int $userId): ?float
{
    $value = val(
        "SELECT MAX(percentage) FROM assessment_attempts
          WHERE assessment_id = ? AND user_id = ? AND status IN ('submitted','expired')",
        [$assessmentId, $userId]
    );
    return $value === null ? null : (float) $value;
}

function recompute_readiness(int $projectId, int $userId, string $actor = 'System'): ?array
{
    $project = one('SELECT * FROM projects WHERE id = ?', [$projectId]);
    if (!$project) {
        return null;
    }
    $requirements = all(
        'SELECT pa.assessment_id, pa.minimum_percentage, a.title, a.passing_percentage
           FROM project_assessments pa JOIN assessments a ON a.id = pa.assessment_id
          WHERE pa.project_id = ?',
        [$projectId]
    );

    $allMet = count($requirements) > 0;
    foreach ($requirements as $requirement) {
        $best = best_released_score((int) $requirement['assessment_id'], $userId) ?? 0.0;
        $threshold = $requirement['minimum_percentage'] !== null
            ? (float) $requirement['minimum_percentage']
            : (float) ($requirement['passing_percentage'] ?? 75);
        if ($best < $threshold) {
            $allMet = false;
        }
    }

    $current = one('SELECT * FROM employee_project_readiness WHERE project_id = ? AND user_id = ?', [$projectId, $userId]);
    if (!$current || $current['readiness_status'] === 'revoked' || $project['approval_mode'] === 'manual') {
        return $current;
    }

    $nextStatus = $allMet ? 'approved' : 'in_preparation';
    if ($nextStatus === $current['readiness_status']) {
        return $current;
    }

    run_sql(
        "UPDATE employee_project_readiness
            SET readiness_status = ?, decision_source = 'automatic', updated_by_identity = ?, updated_at = ?
          WHERE project_id = ? AND user_id = ?",
        [$nextStatus, $actor, now(), $projectId, $userId]
    );
    run_sql(
        'INSERT INTO project_readiness_history (project_id, user_id, previous_status, new_status, decision_source, actor_identity, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $projectId,
            $userId,
            $current['readiness_status'],
            $nextStatus,
            'automatic',
            $actor,
            $allMet ? 'All linked assessment thresholds satisfied.' : 'Linked assessment thresholds no longer satisfied.',
            now(),
        ]
    );
    notify(
        $userId,
        'readiness',
        $nextStatus === 'approved' ? 'Project readiness approved' : 'Project readiness updated',
        $nextStatus === 'approved'
            ? 'You are now cleared for ' . $project['name'] . '.'
            : 'Your readiness for ' . $project['name'] . ' moved to in preparation.',
        '/portal/readiness'
    );

    $current['readiness_status'] = $nextStatus;
    return $current;
}

function start_attempt(array $user, int $assessmentId): array
{
    $assessment = one("SELECT * FROM assessments WHERE id = ? AND status = 'published'", [$assessmentId]);
    if (!$assessment) {
        throw new HttpError(404, 'That assessment is not available.');
    }

    if (!empty($assessment['available_from']) && ts($assessment['available_from']) > time()) {
        throw new HttpError(400, 'This assessment has not opened yet.');
    }
    if (!empty($assessment['available_until']) && ts($assessment['available_until']) < time()) {
        throw new HttpError(400, 'This assessment has closed.');
    }

    if (!empty($user['restrictToAssigned'])) {
        $assigned = one('SELECT id FROM exam_assignments WHERE assessment_id = ? AND user_id = ?', [$assessmentId, $user['id']]);
        if (!$assigned) {
            throw new HttpError(403, 'This assessment has not been assigned to your account.');
        }
    }

    $open = one(
        "SELECT id FROM assessment_attempts WHERE assessment_id = ? AND user_id = ? AND status = 'in_progress'",
        [$assessmentId, $user['id']]
    );
    if ($open) {
        return ['attemptId' => (int) $open['id'], 'resumed' => true];
    }

    $prior = all(
        'SELECT id, percentage FROM assessment_attempts WHERE assessment_id = ? AND user_id = ? ORDER BY id DESC',
        [$assessmentId, $user['id']]
    );

    if (count($prior) > 0) {
        $retake = one(
            'SELECT * FROM retake_authorizations
              WHERE assessment_id = ? AND user_id = ? AND used_in_attempt_id IS NULL
              ORDER BY id LIMIT 1',
            [$assessmentId, $user['id']]
        );
        $best = 0.0;
        foreach ($prior as $entry) {
            $best = max($best, $entry['percentage'] !== null ? (float) $entry['percentage'] : 0.0);
        }
        $passed = $best >= (float) $assessment['passing_percentage'];
        if ($passed || !$retake) {
            throw new HttpError(
                409,
                $passed
                    ? 'You have already passed this assessment.'
                    : 'A second attempt needs administrator authorisation. Contact your reviewer.'
            );
        }
        run_sql('UPDATE retake_authorizations SET used_in_attempt_id = -1 WHERE id = ?', [$retake['id']]);
    }

    if (($assessment['selection_mode'] ?? 'fixed') === 'random_pool') {
        $count = (int) ($assessment['random_sample_count'] ?: 10);
        $rows = all(
            "SELECT * FROM question_bank WHERE status = 'active' AND is_reusable = 1
              ORDER BY RAND() LIMIT " . $count
        );
        $questions = $rows;
    } else {
        $questions = all(
            'SELECT q.*, aq.sort_order, aq.marks_override
               FROM assessment_questions aq JOIN question_bank q ON q.id = aq.question_id
              WHERE aq.assessment_id = ? AND q.status = \'active\'
              ORDER BY aq.sort_order',
            [$assessmentId]
        );
    }

    if (count($questions) === 0) {
        throw new HttpError(400, 'This assessment has no questions yet.');
    }

    $totalMarks = 0.0;
    foreach ($questions as $question) {
        $totalMarks += (float) ($question['marks_override'] ?? $question['marks']);
    }
    $attemptNumber = count($prior) + 1;
    $timeLimit = !empty($assessment['is_timed']) ? ((int) ($assessment['time_limit_minutes'] ?: 30)) * 60 : null;

    $attemptId = insert_id(
        "INSERT INTO assessment_attempts
           (assessment_id, user_id, attempt_number, status, status_detail, started_at, is_timed, time_limit_seconds, total_possible_marks)
         VALUES (?, ?, ?, 'in_progress', 'In progress', ?, ?, ?, ?)",
        [$assessmentId, $user['id'], $attemptNumber, now(), !empty($assessment['is_timed']) ? 1 : 0, $timeLimit, $totalMarks]
    );

    foreach ($questions as $index => $question) {
        run_sql(
            'INSERT INTO attempt_questions
               (attempt_id, source_question_id, question_type, sort_order, prompt, scenario_context, options_json,
                correct_answer, acceptable_answers_json, scoring_rubric, marks, explanation)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $attemptId,
                $question['id'],
                $question['question_type'],
                $index,
                $question['prompt'],
                $question['scenario_context'] ?: null,
                $question['options_json'] ?: null,
                $question['correct_answer'] ?: null,
                $question['acceptable_answers_json'] ?: null,
                $question['scoring_rubric'] ?: null,
                (float) ($question['marks_override'] ?? $question['marks']),
                $question['explanation'] ?: null,
            ]
        );
    }

    run_sql("INSERT INTO attempt_events (attempt_id, event_type, detail, created_at) VALUES (?, 'started', ?, ?)", [
        $attemptId,
        'Attempt ' . $attemptNumber . ' started',
        now(),
    ]);
    notify(
        (int) $user['id'],
        'assessment',
        'Assessment started',
        $assessment['title'] . ' is now in progress.',
        '/portal/assessments'
    );

    return ['attemptId' => $attemptId, 'resumed' => false];
}

function load_attempt(int $attemptId, array $user, bool $asAdmin = false): array
{
    $attempt = one(
        'SELECT a.*, u.full_name AS employee_name, u.employee_code AS employee_code,
                s.title AS assessment_title, s.domain AS assessment_domain,
                s.instructions AS assessment_instructions, s.passing_percentage
           FROM assessment_attempts a
           JOIN users u ON u.id = a.user_id
           JOIN assessments s ON s.id = a.assessment_id
          WHERE a.id = ?',
        [$attemptId]
    );
    if (!$attempt) {
        throw new HttpError(404, 'Attempt not found.');
    }
    if (!$asAdmin && (int) $attempt['user_id'] !== (int) $user['id']) {
        throw new HttpError(403, 'This attempt belongs to another account.');
    }

    $questions = all('SELECT * FROM attempt_questions WHERE attempt_id = ? ORDER BY sort_order', [$attemptId]);
    $answers = [];
    foreach (all('SELECT * FROM attempt_answers WHERE attempt_id = ?', [$attemptId]) as $answer) {
        $answers[(int) $answer['attempt_question_id']] = $answer;
    }

    $elapsed = 0;
    if ($attempt['status'] === 'in_progress') {
        $elapsed = (time() - ts($attempt['started_at'])) - (int) $attempt['paused_seconds'];
    }
    $remaining = null;
    if (!empty($attempt['is_timed']) && $attempt['time_limit_seconds']) {
        $remaining = max(0, (int) $attempt['time_limit_seconds'] - max(0, $elapsed));
    }

    $questionPayload = [];
    foreach ($questions as $question) {
        $answer = $answers[(int) $question['id']] ?? null;
        $questionPayload[] = [
            'id' => (int) $question['id'],
            'index' => (int) $question['sort_order'],
            'type' => $question['question_type'],
            'prompt' => $question['prompt'],
            'scenario' => $question['scenario_context'],
            'options' => $question['options_json'] ? json_decode_safe($question['options_json'], []) : null,
            'rubric' => $question['scoring_rubric'],
            'marks' => (float) $question['marks'],
            'answer' => $answer
                ? [
                    'value' => $answer['answer_value'],
                    'reasoning' => $answer['reasoning_text'],
                    'awardedMarks' => $answer['awarded_marks'] === null ? null : (float) $answer['awarded_marks'],
                    'isCorrect' => $answer['is_correct'] === null ? null : (bool) $answer['is_correct'],
                    'reviewerComment' => $answer['reviewer_comment'],
                ]
                : ['value' => '', 'reasoning' => '', 'awardedMarks' => null, 'isCorrect' => null, 'reviewerComment' => null],
        ];
    }

    return [
        'attempt' => [
            'id' => (int) $attempt['id'],
            'assessmentId' => (int) $attempt['assessment_id'],
            'title' => $attempt['assessment_title'],
            'domain' => $attempt['assessment_domain'],
            'instructions' => $attempt['assessment_instructions'],
            'status' => $attempt['status'],
            'statusDetail' => $attempt['status_detail'],
            'attemptNumber' => (int) $attempt['attempt_number'],
            'startedAt' => iso($attempt['started_at']),
            'submittedAt' => iso($attempt['submitted_at']),
            'isTimed' => (bool) $attempt['is_timed'],
            'timeLimitSeconds' => $attempt['time_limit_seconds'] === null ? null : (int) $attempt['time_limit_seconds'],
            'remainingSeconds' => $remaining,
            'pausedSeconds' => (int) $attempt['paused_seconds'],
            'interruptionCount' => (int) $attempt['interruption_count'],
            'durationSeconds' => $attempt['duration_seconds'] === null ? null : (int) $attempt['duration_seconds'],
            'totalMarks' => (float) $attempt['total_possible_marks'],
            'autoScore' => $attempt['auto_score'] === null ? null : (float) $attempt['auto_score'],
            'finalScore' => $attempt['final_score'] === null ? null : (float) $attempt['final_score'],
            'percentage' => $attempt['percentage'] === null ? null : (float) $attempt['percentage'],
            'passed' => $attempt['passed'] === null ? null : (bool) $attempt['passed'],
            'passingPercentage' => (float) $attempt['passing_percentage'],
            'requiresManualReview' => (bool) $attempt['requires_manual_review'],
            'reviewStatus' => $attempt['review_status'],
            'isReleased' => (bool) $attempt['is_released'],
            'releaseVisibility' => [
                'score' => (bool) $attempt['release_show_score'],
                'pass' => (bool) $attempt['release_show_pass'],
                'answers' => (bool) $attempt['release_show_answers'],
            ],
            'reviewerComment' => $attempt['reviewer_comment'],
            'releasedAt' => iso($attempt['released_at']),
            'employee' => ['name' => $attempt['employee_name'], 'code' => $attempt['employee_code']],
        ],
        'questions' => $questionPayload,
    ];
}

function save_answer(int $attemptId, array $user, int $attemptQuestionId, ?string $value, ?string $reasoning): void
{
    $attempt = one('SELECT * FROM assessment_attempts WHERE id = ? AND user_id = ?', [$attemptId, $user['id']]);
    if (!$attempt) {
        throw new HttpError(404, 'Attempt not found.');
    }
    if ($attempt['status'] !== 'in_progress') {
        throw new HttpError(409, 'This attempt is already submitted.');
    }

    $question = one('SELECT * FROM attempt_questions WHERE id = ? AND attempt_id = ?', [$attemptQuestionId, $attemptId]);
    if (!$question) {
        throw new HttpError(404, 'Question not found in this attempt.');
    }

    $existing = one('SELECT id FROM attempt_answers WHERE attempt_id = ? AND attempt_question_id = ?', [$attemptId, $attemptQuestionId]);
    if ($existing) {
        run_sql(
            'UPDATE attempt_answers SET answer_value = ?, reasoning_text = ?, updated_at = ? WHERE id = ?',
            [$value === null ? null : mb_substr($value, 0, 8000), $reasoning === null ? null : mb_substr($reasoning, 0, 8000), now(), $existing['id']]
        );
    } else {
        run_sql(
            'INSERT INTO attempt_answers (attempt_id, attempt_question_id, answer_value, reasoning_text, updated_at)
             VALUES (?, ?, ?, ?, ?)',
            [$attemptId, $attemptQuestionId, $value === null ? null : mb_substr($value, 0, 8000), $reasoning === null ? null : mb_substr($reasoning, 0, 8000), now()]
        );
    }

    $count = (int) val('SELECT COUNT(*) FROM attempt_events WHERE attempt_id = ?', [$attemptId]);
    if ($count < 400) {
        run_sql("INSERT INTO attempt_events (attempt_id, event_type, detail, created_at) VALUES (?, 'answer_saved', ?, ?)", [
            $attemptId,
            'Question ' . ((int) $question['sort_order'] + 1),
            now(),
        ]);
    }
}

function submit_attempt(int $attemptId, array $user, string $reason = 'Submitted by candidate'): array
{
    $attempt = one('SELECT * FROM assessment_attempts WHERE id = ?', [$attemptId]);
    if (!$attempt) {
        throw new HttpError(404, 'Attempt not found.');
    }
    if ((int) $attempt['user_id'] !== (int) $user['id']) {
        throw new HttpError(403, 'This attempt belongs to another account.');
    }
    if ($attempt['status'] !== 'in_progress') {
        return ['ok' => true, 'alreadySubmitted' => true];
    }

    $questions = all('SELECT * FROM attempt_questions WHERE attempt_id = ?', [$attemptId]);
    $answers = [];
    foreach (all('SELECT * FROM attempt_answers WHERE attempt_id = ?', [$attemptId]) as $answer) {
        $answers[(int) $answer['attempt_question_id']] = $answer;
    }

    $autoScore = 0.0;
    $needsReview = false;

    foreach ($questions as $question) {
        $answer = $answers[(int) $question['id']] ?? null;
        $value = $answer['answer_value'] ?? '';
        $grade = grade_answer($question, $value);
        if ($grade['autoMarks'] === null) {
            $needsReview = true;
        } else {
            $autoScore += (float) $grade['autoMarks'];
        }

        $existing = one('SELECT * FROM attempt_answers WHERE attempt_id = ? AND attempt_question_id = ?', [$attemptId, $question['id']]);
        $awarded = $existing && $existing['awarded_marks'] !== null ? $existing['awarded_marks'] : $grade['autoMarks'];
        $isCorrect = $grade['correct'] === null ? null : ($grade['correct'] ? 1 : 0);

        if ($existing) {
            run_sql(
                'UPDATE attempt_answers SET auto_marks = ?, awarded_marks = ?, is_correct = ?, updated_at = ? WHERE id = ?',
                [$grade['autoMarks'], $awarded, $isCorrect, now(), $existing['id']]
            );
        } else {
            run_sql(
                'INSERT INTO attempt_answers (attempt_id, attempt_question_id, answer_value, reasoning_text, auto_marks, awarded_marks, is_correct, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$attemptId, $question['id'], $value, $answer['reasoning_text'] ?? null, $grade['autoMarks'], $awarded, $isCorrect, now()]
            );
        }
    }

    $duration = max(1, (time() - ts($attempt['started_at'])) - (int) $attempt['paused_seconds']);
    $fallbackTotal = 0.0;
    foreach ($questions as $question) {
        $fallbackTotal += (float) $question['marks'];
    }
    $total = (float) $attempt['total_possible_marks'] ?: $fallbackTotal;
    $percentage = $total > 0 ? round(($autoScore / $total) * 1000) / 10 : 0.0;
    $assessment = one('SELECT passing_percentage FROM assessments WHERE id = ?', [$attempt['assessment_id']]);
    $passingPercentage = (float) ($assessment['passing_percentage'] ?? 75);
    $passed = $percentage >= $passingPercentage;

    run_sql(
        "UPDATE assessment_attempts
            SET status = 'submitted', status_detail = ?, submitted_at = ?, duration_seconds = ?,
                auto_score = ?, final_score = ?, percentage = ?, passed = ?,
                requires_manual_review = ?, review_status = ?, disconnect_started_at = NULL
          WHERE id = ?",
        [
            $needsReview ? 'Awaiting review' : 'Submitted',
            now(),
            $duration,
            $autoScore,
            $autoScore,
            $percentage,
            $passed ? 1 : 0,
            $needsReview ? 1 : 0,
            $needsReview ? 'pending' : 'not_applicable',
            $attemptId,
        ]
    );

    run_sql("INSERT INTO attempt_events (attempt_id, event_type, detail, created_at) VALUES (?, 'submitted', ?, ?)", [
        $attemptId,
        $reason . ' · ' . $percentage . '%',
        now(),
    ]);

    foreach (all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'") as $admin) {
        notify(
            (int) $admin['id'],
            'attempt',
            $needsReview ? 'Attempt needs review' : 'Attempt submitted',
            $user['fullName'] . ' submitted an attempt (' . $percentage . '%).',
            '/admin/results'
        );
    }

    foreach (all('SELECT DISTINCT project_id FROM project_assessments WHERE assessment_id = ?', [$attempt['assessment_id']]) as $project) {
        recompute_readiness((int) $project['project_id'], (int) $attempt['user_id'], $user['fullName']);
    }

    return ['ok' => true, 'percentage' => $percentage, 'passed' => $passed, 'requiresManualReview' => $needsReview];
}

function expire_attempt(int $attemptId, string $detail = 'Timer expired'): void
{
    $attempt = one('SELECT * FROM assessment_attempts WHERE id = ?', [$attemptId]);
    if (!$attempt || $attempt['status'] !== 'in_progress') {
        return;
    }
    run_sql("UPDATE assessment_attempts SET status = 'expired', status_detail = ?, submitted_at = ? WHERE id = ?", [
        $detail,
        now(),
        $attemptId,
    ]);
    run_sql("INSERT INTO attempt_events (attempt_id, event_type, detail, created_at) VALUES (?, 'expired', ?, ?)", [
        $attemptId,
        $detail,
        now(),
    ]);
}

function release_attempt(int $attemptId, array $admin, array $options): void
{
    $attempt = one('SELECT * FROM assessment_attempts WHERE id = ?', [$attemptId]);
    if (!$attempt) {
        throw new HttpError(404, 'Attempt not found.');
    }
    $identity = identity_of($admin);
    run_sql(
        'UPDATE assessment_attempts
            SET is_released = 1, released_by_identity = ?, released_at = ?,
                release_show_score = ?, release_show_pass = ?, release_show_answers = ?
          WHERE id = ?',
        [
            $identity,
            now(),
            !empty($options['showScore']) ? 1 : 0,
            !empty($options['showPass']) ? 1 : 0,
            !empty($options['showAnswers']) ? 1 : 0,
            $attemptId,
        ]
    );
    notify(
        (int) $attempt['user_id'],
        'result',
        'Your result is ready',
        'A reviewer has released your assessment result.',
        '/portal/results'
    );
    record_audit(
        (int) $admin['id'],
        $identity,
        'ATTEMPT_RELEASED',
        'attempt',
        (string) $attemptId,
        'Released attempt #' . $attemptId . '.'
    );
}

function review_attempt(int $attemptId, array $admin, array $answers, ?string $comment, bool $finalise = true): array
{
    $attempt = one('SELECT * FROM assessment_attempts WHERE id = ?', [$attemptId]);
    if (!$attempt) {
        throw new HttpError(404, 'Attempt not found.');
    }
    $questions = all('SELECT * FROM attempt_questions WHERE attempt_id = ?', [$attemptId]);

    $submitted = [];
    foreach ($answers as $entry) {
        if (isset($entry['attemptQuestionId'])) {
            $submitted[(int) $entry['attemptQuestionId']] = $entry;
        }
    }

    $finalScore = 0.0;
    foreach ($questions as $question) {
        $existing = one('SELECT * FROM attempt_answers WHERE attempt_id = ? AND attempt_question_id = ?', [$attemptId, $question['id']]);
        $entry = $submitted[(int) $question['id']] ?? null;
        $awarded = $entry !== null && $entry['awardedMarks'] !== null
            ? max(0.0, min((float) $question['marks'], (float) $entry['awardedMarks']))
            : (float) ($existing['awarded_marks'] ?? 0);
        $finalScore += $awarded;

        $reviewerComment = $entry['comment'] ?? ($existing['reviewer_comment'] ?? null);
        $isCorrect = $awarded >= (float) $question['marks'] ? 1 : 0;

        if ($existing) {
            run_sql(
                'UPDATE attempt_answers SET awarded_marks = ?, reviewer_comment = ?, is_correct = ?, updated_at = ? WHERE id = ?',
                [$awarded, $reviewerComment, $isCorrect, now(), $existing['id']]
            );
        } else {
            run_sql(
                'INSERT INTO attempt_answers (attempt_id, attempt_question_id, answer_value, awarded_marks, reviewer_comment, is_correct, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$attemptId, $question['id'], '', $awarded, $reviewerComment, $isCorrect, now()]
            );
        }
    }

    $fallbackTotal = 0.0;
    foreach ($questions as $question) {
        $fallbackTotal += (float) $question['marks'];
    }
    $total = (float) $attempt['total_possible_marks'] ?: $fallbackTotal;
    $percentage = $total > 0 ? round(($finalScore / $total) * 1000) / 10 : 0.0;
    $passing = one('SELECT passing_percentage FROM assessments WHERE id = ?', [$attempt['assessment_id']]);
    $passed = $percentage >= (float) ($passing['passing_percentage'] ?? 75);

    run_sql(
        'UPDATE assessment_attempts
            SET final_score = ?, percentage = ?, passed = ?, requires_manual_review = 0,
                review_status = ?, reviewer_comment = ?, status_detail = ?
          WHERE id = ?',
        [
            $finalScore,
            $percentage,
            $passed ? 1 : 0,
            $finalise ? 'reviewed' : 'pending',
            $comment ?: ($attempt['reviewer_comment'] ?: null),
            $finalise ? 'Reviewed' : 'Awaiting review',
            $attemptId,
        ]
    );

    if ($finalise) {
        run_sql("INSERT INTO attempt_events (attempt_id, event_type, detail, created_at) VALUES (?, 'reviewed', ?, ?)", [
            $attemptId,
            $percentage . '% after manual review',
            now(),
        ]);
        foreach (all('SELECT DISTINCT project_id FROM project_assessments WHERE assessment_id = ?', [$attempt['assessment_id']]) as $project) {
            recompute_readiness((int) $project['project_id'], (int) $attempt['user_id']);
        }
    }

    return ['percentage' => $percentage, 'passed' => $passed];
}
