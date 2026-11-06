import db, { notify, recordAudit } from '../db/index.js';
import { HttpError } from './validate.js';

export const toIso = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  if (/[zZ]|[+-]\d\d:\d\d$/.test(text)) return new Date(text).toISOString();
  return new Date(`${text.replace(' ', 'T')}Z`).toISOString();
};

const normalize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function gradeAnswer(question, answerValue) {
  const type = question.question_type;
  if (type === 'mcq' || type === 'true_false') {
    const correct = normalize(question.correct_answer);
    const given = normalize(answerValue);
    return { autoMarks: correct && given && correct === given ? question.marks : 0, correct: correct === given };
  }
  if (type === 'short_answer') {
    let acceptable = [];
    try {
      acceptable = JSON.parse(question.acceptable_answers_json || '[]');
    } catch {
      acceptable = [];
    }
    const given = normalize(answerValue);
    if (!given) return { autoMarks: 0, correct: false };
    const hit = acceptable.some((needle) => given.includes(normalize(needle)));
    return { autoMarks: hit ? question.marks : 0, correct: hit };
  }
  return { autoMarks: null, correct: null };
}

export function recomputeReadiness(projectId, userId, actor = 'System') {
  const project = db.get('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) return null;
  const requirements = db.all(
    `SELECT pa.assessment_id, pa.minimum_percentage, a.title, a.passing_percentage
       FROM project_assessments pa JOIN assessments a ON a.id = pa.assessment_id
      WHERE pa.project_id = ?`,
    projectId
  );

  let allMet = requirements.length > 0;
  for (const req of requirements) {
    const best = db.get(
      `SELECT MAX(percentage) AS best FROM assessment_attempts
        WHERE assessment_id = ? AND user_id = ? AND status IN ('submitted', 'expired') AND is_released = 1`,
      req.assessment_id,
      userId
    );
    const threshold = req.minimum_percentage ?? req.passing_percentage ?? 75;
    if ((best?.best ?? 0) < threshold) allMet = false;
  }

  const current = db.get(
    'SELECT * FROM employee_project_readiness WHERE project_id = ? AND user_id = ?',
    projectId,
    userId
  );
  if (!current) return null;
  if (current.readiness_status === 'revoked') return current;
  if (project.approval_mode === 'manual') return current;

  const nextStatus = allMet ? 'approved' : 'in_preparation';
  if (nextStatus === current.readiness_status) return current;

  db.run(
    `UPDATE employee_project_readiness
        SET readiness_status = ?, decision_source = 'automatic', updated_by_identity = ?, updated_at = datetime('now')
      WHERE project_id = ? AND user_id = ?`,
    nextStatus,
    actor,
    projectId,
    userId
  );
  db.run(
    `INSERT INTO project_readiness_history (project_id, user_id, previous_status, new_status, decision_source, actor_identity, reason)
     VALUES (?, ?, ?, ?, 'automatic', ?, ?)`,
    projectId,
    userId,
    current.readiness_status,
    nextStatus,
    actor,
    allMet ? 'All linked assessment thresholds satisfied.' : 'Linked assessment thresholds no longer satisfied.'
  );
  notify({
    userId,
    type: 'readiness',
    title: nextStatus === 'approved' ? 'Project readiness approved' : 'Project readiness updated',
    message:
      nextStatus === 'approved'
        ? `You are now cleared for ${project.name}.`
        : `Your readiness for ${project.name} moved to in preparation.`,
    linkPath: '/portal/readiness',
  });
  return { ...current, readiness_status: nextStatus };
}

export function startAttempt({ user, assessmentId }) {
  const assessment = db.get("SELECT * FROM assessments WHERE id = ? AND status = 'published'", assessmentId);
  if (!assessment) throw new HttpError(404, 'That assessment is not available.');

  if (assessment.available_from && Date.parse(toIso(assessment.available_from)) > Date.now()) {
    throw new HttpError(400, 'This assessment has not opened yet.');
  }
  if (assessment.available_until && Date.parse(toIso(assessment.available_until)) < Date.now()) {
    throw new HttpError(400, 'This assessment has closed.');
  }

  if (user.restrictToAssigned) {
    const assigned = db.get(
      'SELECT id FROM exam_assignments WHERE assessment_id = ? AND user_id = ?',
      assessmentId,
      user.id
    );
    if (!assigned) throw new HttpError(403, 'This assessment has not been assigned to your account.');
  }

  const open = db.get(
    "SELECT id FROM assessment_attempts WHERE assessment_id = ? AND user_id = ? AND status = 'in_progress'",
    assessmentId,
    user.id
  );
  if (open) return { attemptId: open.id, resumed: true };

  const prior = db.all(
    'SELECT id, percentage FROM assessment_attempts WHERE assessment_id = ? AND user_id = ? ORDER BY id DESC',
    assessmentId,
    user.id
  );

  if (prior.length) {
    const retake = db.get(
      `SELECT * FROM retake_authorizations
        WHERE assessment_id = ? AND user_id = ? AND used_in_attempt_id IS NULL
        ORDER BY id LIMIT 1`,
      assessmentId,
      user.id
    );
    const best = Math.max(...prior.map((p) => p.percentage ?? 0));
    const passed = best >= assessment.passing_percentage;
    if (passed || !retake) {
      throw new HttpError(
        409,
        passed
          ? 'You have already passed this assessment.'
          : 'A second attempt needs administrator authorisation. Contact your reviewer.'
      );
    }
    db.run('UPDATE retake_authorizations SET used_in_attempt_id = -1 WHERE id = ?', retake.id);
  }

  let questionRows;
  if (assessment.selection_mode === 'random_pool') {
    const count = assessment.random_sample_count || 10;
    questionRows = db.all(
      `SELECT * FROM question_bank
        WHERE status = 'active' AND is_reusable = 1 ${assessment.domain ? 'AND project_ref = ?' : ''}
        ORDER BY RANDOM() LIMIT ?`,
      ...(assessment.domain ? [assessment.domain, count] : [count])
    );
  } else {
    questionRows = db.all(
      `SELECT q.*, aq.sort_order, aq.marks_override
         FROM assessment_questions aq JOIN question_bank q ON q.id = aq.question_id
        WHERE aq.assessment_id = ? AND q.status = 'active'
        ORDER BY aq.sort_order`,
      assessmentId
    );
  }

  if (!questionRows.length) throw new HttpError(400, 'This assessment has no questions yet.');

  const totalMarks = questionRows.reduce((sum, q) => sum + (q.marks_override ?? q.marks), 0);
  const attemptNumber = prior.length + 1;
  const timeLimit = assessment.is_timed ? (assessment.time_limit_minutes || 30) * 60 : null;

  const result = db.run(
    `INSERT INTO assessment_attempts
       (assessment_id, user_id, attempt_number, status, status_detail, is_timed, time_limit_seconds, total_possible_marks)
     VALUES (?, ?, ?, 'in_progress', 'In progress', ?, ?, ?)`,
    assessmentId,
    user.id,
    attemptNumber,
    assessment.is_timed ? 1 : 0,
    timeLimit,
    totalMarks
  );
  const attemptId = Number(result.lastInsertRowid);

  questionRows.forEach((q, index) => {
    db.run(
      `INSERT INTO attempt_questions
         (attempt_id, source_question_id, question_type, sort_order, prompt, scenario_context, options_json,
          correct_answer, acceptable_answers_json, scoring_rubric, marks, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      attemptId,
      q.id,
      q.question_type,
      index,
      q.prompt,
      q.scenario_context || null,
      q.options_json || null,
      q.correct_answer || null,
      q.acceptable_answers_json || null,
      q.scoring_rubric || null,
      q.marks_override ?? q.marks,
      q.explanation || null
    );
  });

  db.run("INSERT INTO attempt_events (attempt_id, event_type, detail) VALUES (?, 'started', ?)", attemptId, `Attempt ${attemptNumber} started`);
  notify({
    userId: user.id,
    type: 'assessment',
    title: 'Assessment started',
    message: `${assessment.title} is now in progress.`,
    linkPath: '/portal/assessments',
  });
  return { attemptId, resumed: false };
}

export function loadAttempt({ attemptId, user, asAdmin = false }) {
  const attempt = db.get(
    `SELECT a.*, u.full_name AS employee_name, u.employee_code AS employee_code, s.title AS assessment_title,
            s.domain AS assessment_domain, s.instructions AS assessment_instructions, s.passing_percentage
       FROM assessment_attempts a
       JOIN users u ON u.id = a.user_id
       JOIN assessments s ON s.id = a.assessment_id
      WHERE a.id = ?`,
    attemptId
  );
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  if (!asAdmin && attempt.user_id !== user.id) throw new HttpError(403, 'This attempt belongs to another account.');

  const questions = db.all(
    'SELECT * FROM attempt_questions WHERE attempt_id = ? ORDER BY sort_order',
    attemptId
  );
  const answerRows = db.all('SELECT * FROM attempt_answers WHERE attempt_id = ?', attemptId);
  const answers = new Map(answerRows.map((row) => [row.attempt_question_id, row]));

  let elapsed = 0;
  if (attempt.status === 'in_progress') {
    elapsed = Math.floor((Date.now() - Date.parse(toIso(attempt.started_at))) / 1000) - (attempt.paused_seconds || 0);
  }
  const remaining =
    attempt.is_timed && attempt.time_limit_seconds
      ? Math.max(0, attempt.time_limit_seconds - Math.max(0, elapsed))
      : null;

  return {
    attempt: {
      id: attempt.id,
      assessmentId: attempt.assessment_id,
      title: attempt.assessment_title,
      domain: attempt.assessment_domain,
      instructions: attempt.assessment_instructions,
      status: attempt.status,
      statusDetail: attempt.status_detail,
      attemptNumber: attempt.attempt_number,
      startedAt: toIso(attempt.started_at),
      submittedAt: toIso(attempt.submitted_at),
      isTimed: Boolean(attempt.is_timed),
      timeLimitSeconds: attempt.time_limit_seconds,
      remainingSeconds: remaining,
      pausedSeconds: attempt.paused_seconds,
      interruptionCount: attempt.interruption_count,
      durationSeconds: attempt.duration_seconds,
      totalMarks: attempt.total_possible_marks,
      autoScore: attempt.auto_score,
      finalScore: attempt.final_score,
      percentage: attempt.percentage,
      passed: attempt.passed == null ? null : Boolean(attempt.passed),
      passingPercentage: attempt.passing_percentage,
      requiresManualReview: Boolean(attempt.requires_manual_review),
      reviewStatus: attempt.review_status,
      isReleased: Boolean(attempt.is_released),
      releaseVisibility: {
        score: Boolean(attempt.release_show_score),
        pass: Boolean(attempt.release_show_pass),
        answers: Boolean(attempt.release_show_answers),
      },
      reviewerComment: attempt.reviewer_comment,
      releasedAt: toIso(attempt.released_at),
      employee: { name: attempt.employee_name, code: attempt.employee_code },
    },
    questions: questions.map((q) => {
      const answer = answers.get(q.id);
      return {
        id: q.id,
        index: q.sort_order,
        type: q.question_type,
        prompt: q.prompt,
        scenario: q.scenario_context,
        options: q.options_json ? JSON.parse(q.options_json) : null,
        rubric: q.scoring_rubric,
        marks: q.marks,
        answer: answer
          ? {
              value: answer.answer_value,
              reasoning: answer.reasoning_text,
              awardedMarks: answer.awarded_marks,
              isCorrect: answer.is_correct == null ? null : Boolean(answer.is_correct),
              reviewerComment: answer.reviewer_comment,
            }
          : { value: '', reasoning: '', awardedMarks: null, isCorrect: null, reviewerComment: null },
      };
    }),
  };
}

export function saveAnswer({ attemptId, user, attemptQuestionId, value, reasoning }) {
  const attempt = db.get(
    'SELECT * FROM assessment_attempts WHERE id = ? AND user_id = ?',
    attemptId,
    user.id
  );
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  if (attempt.status !== 'in_progress') throw new HttpError(409, 'This attempt is already submitted.');

  const question = db.get(
    'SELECT * FROM attempt_questions WHERE id = ? AND attempt_id = ?',
    attemptQuestionId,
    attemptId
  );
  if (!question) throw new HttpError(404, 'Question not found in this attempt.');

  db.run(
    `INSERT INTO attempt_answers (attempt_id, attempt_question_id, answer_value, reasoning_text, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(attempt_id, attempt_question_id)
     DO UPDATE SET answer_value = excluded.answer_value, reasoning_text = excluded.reasoning_text, updated_at = datetime('now')`,
    attemptId,
    attemptQuestionId,
    value == null ? null : String(value).slice(0, 8000),
    reasoning == null ? null : String(reasoning).slice(0, 8000)
  );

  const events = db.get('SELECT COUNT(*) AS count FROM attempt_events WHERE attempt_id = ?', attemptId);
  if (events.count < 400) {
    db.run("INSERT INTO attempt_events (attempt_id, event_type, detail) VALUES (?, 'answer_saved', ?)", attemptId, `Question ${question.sort_order + 1}`);
  }
  return { ok: true };
}

export function submitAttempt({ attemptId, user, reason = 'Submitted by candidate' }) {
  const attempt = db.get('SELECT * FROM assessment_attempts WHERE id = ?', attemptId);
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  if (attempt.user_id !== user.id) throw new HttpError(403, 'This attempt belongs to another account.');
  if (attempt.status !== 'in_progress') {
    return { ok: true, alreadySubmitted: true };
  }

  const questions = db.all('SELECT * FROM attempt_questions WHERE attempt_id = ?', attemptId);
  const answers = db.all('SELECT * FROM attempt_answers WHERE attempt_id = ?', attemptId);
  const byQuestion = new Map(answers.map((a) => [a.attempt_question_id, a]));

  let autoScore = 0;
  let needsReview = false;

  for (const question of questions) {
    const answer = byQuestion.get(question.id);
    const value = answer?.answer_value ?? '';
    const grade = gradeAnswer(question, value);
    const auto = grade.autoMarks;
    if (auto === null) needsReview = true;
    if (auto != null) autoScore += auto;

    db.run(
      `INSERT INTO attempt_answers (attempt_id, attempt_question_id, answer_value, reasoning_text, auto_marks, awarded_marks, is_correct, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(attempt_id, attempt_question_id) DO UPDATE SET
         auto_marks = excluded.auto_marks,
         awarded_marks = COALESCE(attempt_answers.awarded_marks, excluded.awarded_marks),
         is_correct = excluded.is_correct,
         updated_at = datetime('now')`,
      attemptId,
      question.id,
      value,
      answer?.reasoning_text ?? null,
      auto,
      auto,
      grade.correct == null ? null : grade.correct ? 1 : 0
    );
  }

  const started = Date.parse(toIso(attempt.started_at));
  const duration = Math.max(1, Math.round((Date.now() - started) / 1000) - (attempt.paused_seconds || 0));
  const total = attempt.total_possible_marks || questions.reduce((sum, q) => sum + q.marks, 0);
  const percentage = total ? Math.round((autoScore / total) * 1000) / 10 : 0;
  const assessment = db.get('SELECT passing_percentage FROM assessments WHERE id = ?', attempt.assessment_id);
  const passed = percentage >= (assessment?.passing_percentage ?? 75);

  db.run(
    `UPDATE assessment_attempts
        SET status = 'submitted', status_detail = ?, submitted_at = datetime('now'), duration_seconds = ?,
            auto_score = ?, final_score = ?, percentage = ?, passed = ?,
            requires_manual_review = ?, review_status = ?, disconnect_started_at = NULL
      WHERE id = ?`,
    needsReview ? 'Awaiting review' : 'Submitted',
    duration,
    autoScore,
    autoScore,
    percentage,
    passed ? 1 : 0,
    needsReview ? 1 : 0,
    needsReview ? 'pending' : 'not_applicable',
    attemptId
  );

  db.run(
    "INSERT INTO attempt_events (attempt_id, event_type, detail) VALUES (?, 'submitted', ?)",
    attemptId,
    `${reason} · ${percentage}%`
  );

  const admins = db.all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  for (const admin of admins) {
    notify({
      userId: admin.id,
      type: 'attempt',
      title: needsReview ? 'Attempt needs review' : 'Attempt submitted',
      message: `${user.fullName} submitted an attempt (${percentage}%).`,
      linkPath: '/admin/results',
    });
  }

  /* automatic project readiness re-evaluation */
  const projects = db.all(
    'SELECT DISTINCT project_id FROM project_assessments WHERE assessment_id = ?',
    attempt.assessment_id
  );
  for (const project of projects) recomputeReadiness(project.project_id, attempt.user_id, user.fullName);

  return { ok: true, percentage, passed, requiresManualReview: needsReview };
}

export function expireAttempt(attemptId, detail = 'Timer expired') {
  const attempt = db.get('SELECT * FROM assessment_attempts WHERE id = ?', attemptId);
  if (!attempt || attempt.status !== 'in_progress') return;
  db.run(
    `UPDATE assessment_attempts SET status = 'expired', status_detail = ?, submitted_at = datetime('now') WHERE id = ?`,
    detail,
    attemptId
  );
  db.run("INSERT INTO attempt_events (attempt_id, event_type, detail) VALUES (?, 'expired', ?)", attemptId, detail);
}

export function releaseAttempt({ attemptId, admin, options }) {
  const attempt = db.get('SELECT * FROM assessment_attempts WHERE id = ?', attemptId);
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  db.run(
    `UPDATE assessment_attempts
        SET is_released = 1, released_by_identity = ?, released_at = datetime('now'),
            release_show_score = ?, release_show_pass = ?, release_show_answers = ?
      WHERE id = ?`,
    `${admin.fullName} (${admin.employeeCode})`,
    options.showScore ? 1 : 0,
    options.showPass ? 1 : 0,
    options.showAnswers ? 1 : 0,
    attemptId
  );
  notify({
    userId: attempt.user_id,
    type: 'result',
    title: 'Your result is ready',
    message: 'A reviewer has released your assessment result.',
    linkPath: '/portal/results',
  });
  recordAudit({
    adminId: admin.id,
    adminIdentity: `${admin.fullName} (${admin.employeeCode})`,
    action: 'ATTEMPT_RELEASED',
    entityType: 'attempt',
    entityId: attemptId,
    summary: `Released attempt #${attemptId}.`,
  });
}

export function reviewAttempt({ attemptId, admin, answers, comment, finalise = true }) {
  const attempt = db.get('SELECT * FROM assessment_attempts WHERE id = ?', attemptId);
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  const questions = db.all('SELECT * FROM attempt_questions WHERE attempt_id = ?', attemptId);

  let finalScore = 0;
  for (const question of questions) {
    const submitted = answers.find((a) => Number(a.attemptQuestionId) === Number(question.id));
    const existing = db.get(
      'SELECT * FROM attempt_answers WHERE attempt_id = ? AND attempt_question_id = ?',
      attemptId,
      question.id
    );
    const awarded = submitted?.awardedMarks != null
      ? Math.max(0, Math.min(question.marks, Number(submitted.awardedMarks)))
      : existing?.awarded_marks ?? 0;
    finalScore += awarded;

    db.run(
      `INSERT INTO attempt_answers (attempt_id, attempt_question_id, answer_value, awarded_marks, reviewer_comment, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(attempt_id, attempt_question_id) DO UPDATE SET
         awarded_marks = excluded.awarded_marks,
         reviewer_comment = excluded.reviewer_comment,
         is_correct = CASE WHEN excluded.awarded_marks >= ? THEN 1 ELSE 0 END,
         updated_at = datetime('now')`,
      attemptId,
      question.id,
      existing?.answer_value ?? '',
      awarded,
      submitted?.comment ?? existing?.reviewer_comment ?? null,
      question.marks
    );
  }

  const total = attempt.total_possible_marks || questions.reduce((sum, q) => sum + q.marks, 0);
  const percentage = total ? Math.round((finalScore / total) * 1000) / 10 : 0;
  const passing = db.get('SELECT passing_percentage FROM assessments WHERE id = ?', attempt.assessment_id);
  const passed = percentage >= (passing?.passing_percentage ?? 75);

  db.run(
    `UPDATE assessment_attempts
        SET final_score = ?, percentage = ?, passed = ?, requires_manual_review = 0,
            review_status = ?, reviewer_comment = ?, status_detail = ?
      WHERE id = ?`,
    finalScore,
    percentage,
    passed ? 1 : 0,
    finalise ? 'reviewed' : 'pending',
    comment || attempt.reviewer_comment || null,
    finalise ? 'Reviewed' : 'Awaiting review',
    attemptId
  );

  if (finalise) {
    db.run("INSERT INTO attempt_events (attempt_id, event_type, detail) VALUES (?, 'reviewed', ?)", attemptId, `${percentage}% after manual review`);
    const projects = db.all('SELECT DISTINCT project_id FROM project_assessments WHERE assessment_id = ?', attempt.assessment_id);
    for (const project of projects) recomputeReadiness(project.project_id, attempt.user_id);
  }

  return { percentage, passed };
}
