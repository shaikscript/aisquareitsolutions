import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import db, { GUIDELINE_DIR, recordActivity, notify } from '../db/index.js';
import { requireAnyEmployee, requireEmployee } from '../lib/auth.js';
import { str, optionalStr, int, HttpError, asyncRoute } from '../lib/validate.js';
import {
  loadAttempt,
  saveAnswer,
  startAttempt,
  submitAttempt,
  toIso,
  expireAttempt,
} from '../lib/assessment.js';

const router = express.Router();

const identity = (user) => `${user.fullName} (${user.employeeCode})`;

/* ───────────────────────── status & heartbeat ───────────────────────── */

router.get('/status', (req, res) => {
  res.json({
    signedIn: Boolean(req.user),
    accountType: req.user?.accountType || null,
    unread: req.user
      ? db.get('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).count
      : 0,
  });
});

router.post('/heartbeat', requireAnyEmployee, (req, res) => {
  db.run("UPDATE users SET last_active_at = datetime('now') WHERE id = ?", req.user.id);
  res.json({
    ok: true,
    unread: db.get('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).count,
  });
});

/* ───────────────────────── overview ───────────────────────── */

router.get('/overview', requireEmployee, (req, res) => {
  const userId = req.user.id;

  const attempts = db.all(
    `SELECT a.*, s.title, s.passing_percentage, s.domain
       FROM assessment_attempts a JOIN assessments s ON s.id = a.assessment_id
      WHERE a.user_id = ? ORDER BY a.started_at DESC`,
    userId
  );

  const availableAssessments = db.all(
    `SELECT s.* FROM assessments s
      WHERE s.status = 'published'
        AND (s.available_from IS NULL OR datetime(s.available_from) <= datetime('now'))
        AND (s.available_until IS NULL OR datetime(s.available_until) >= datetime('now'))
        AND EXISTS (SELECT 1 FROM assessment_questions aq WHERE aq.assessment_id = s.id)`
  );

  const assignedIds = new Set(
    db.all('SELECT assessment_id FROM exam_assignments WHERE user_id = ?', userId).map((r) => r.assessment_id)
  );
  const eligible = availableAssessments.filter(
    (a) => !req.user.restrictToAssigned || assignedIds.has(a.id)
  );

  const openAttempts = attempts.filter((a) => a.status === 'in_progress');
  const released = attempts.filter((a) => a.status !== 'in_progress' && a.is_released);
  const scored = released.filter((a) => a.percentage != null);
  const average = scored.length
    ? Math.round((scored.reduce((sum, a) => sum + a.percentage, 0) / scored.length) * 10) / 10
    : null;

  const readinessRows = db.all(
    `SELECT r.*, p.name AS project_name, p.approval_mode
       FROM employee_project_readiness r JOIN projects p ON p.id = r.project_id
      WHERE r.user_id = ? ORDER BY p.name`,
    userId
  );

  const readiness = readinessRows.map((row) => {
    const requirements = db.all(
      `SELECT pa.assessment_id AS assessmentId, pa.minimum_percentage AS minimumPercentage,
              s.title AS assessmentTitle, s.passing_percentage AS passingPercentage
         FROM project_assessments pa JOIN assessments s ON s.id = pa.assessment_id
        WHERE pa.project_id = ?`,
      row.project_id
    ).map((req) => {
      const best = db.get(
        `SELECT MAX(percentage) AS best FROM assessment_attempts
          WHERE assessment_id = ? AND user_id = ? AND status IN ('submitted','expired')`,
        req.assessmentId,
        userId
      );
      const minimum = req.minimumPercentage ?? req.passingPercentage ?? 75;
      return { ...req, minimum, best: best?.best ?? null, met: (best?.best ?? 0) >= minimum };
    });
    return {
      projectId: row.project_id,
      project: row.project_name,
      status: row.readiness_status,
      approvalMode: row.approval_mode,
      notes: row.notes,
      requirements,
      updatedAt: toIso(row.updated_at),
    };
  });

  const pendingAssessments = eligible
    .filter((a) => !attempts.some((at) => at.assessment_id === a.id && at.status !== 'in_progress'))
    .filter((a) => !attempts.some((at) => at.assessment_id === a.id && at.status === 'in_progress'))
    .slice(0, 4)
    .map((a) => ({
      id: a.id,
      title: a.title,
      domain: a.domain,
      isTimed: Boolean(a.is_timed),
      timeLimitMinutes: a.time_limit_minutes,
      questionCount: db.get('SELECT COUNT(*) AS count FROM assessment_questions WHERE assessment_id = ?', a.id).count,
    }));

  const ackCount = db.get(
    `SELECT COUNT(*) AS count FROM guideline_reads r JOIN guidelines g ON g.id = r.guideline_id
      WHERE r.user_id = ? AND r.acknowledged = 1 AND g.status = 'published' AND r.version = g.version`,
    userId
  ).count;
  const publishedGuidelines = db.get("SELECT COUNT(*) AS count FROM guidelines WHERE status = 'published'").count;

  res.json({
    profile: {
      name: req.user.fullName,
      code: req.user.employeeCode,
      email: req.user.email,
      department: req.user.departmentNote,
      lastLoginAt: toIso(req.user.lastLoginAt),
    },
    stats: {
      openAssessments: eligible.length,
      inProgress: openAttempts.length,
      completed: released.length,
      averagePercentage: average,
      readinessApproved: readiness.filter((r) => r.status === 'approved').length,
      guidelinesAcknowledged: ackCount,
      guidelinesTotal: publishedGuidelines,
      unreadNotifications: db.get(
        'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
        userId
      ).count,
    },
    readiness,
    pendingAssessments,
    announcements: db.all(
      `SELECT id, title, category, body, author_identity AS author, published_at AS publishedAt
         FROM announcements WHERE status = 'published' ORDER BY datetime(published_at) DESC LIMIT 3`
    ).map((a) => ({ ...a, publishedAt: toIso(a.publishedAt) })),
    activity: db.all(
      `SELECT event_type AS type, area, detail, created_at AS createdAt FROM portal_activity_logs
        WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 8`,
      userId
    ).map((a) => ({ ...a, createdAt: toIso(a.createdAt) })),
  });
});

/* ───────────────────────── guidelines ───────────────────────── */

router.get('/guidelines', requireEmployee, (req, res) => {
  const rows = db.all(
    `SELECT g.*, r.version AS read_version, r.acknowledged, r.seconds_spent AS secondsSpent, r.last_seen_at AS lastSeenAt
       FROM guidelines g
       LEFT JOIN guideline_reads r ON r.guideline_id = g.id AND r.user_id = ?
      WHERE g.status = 'published'
      ORDER BY g.category, g.title`,
    req.user.id
  );

  res.json({
    guidelines: rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      summary: row.summary,
      version: row.version,
      requiresAck: Boolean(row.requires_ack),
      fileName: row.file_original_name,
      fileSize: row.file_size_bytes,
      updatedAt: toIso(row.updated_at),
      read: row.read_version === row.version,
      acknowledged: Boolean(row.acknowledged) && row.read_version === row.version,
      needsReview: row.read_version != null && row.read_version !== row.version,
      secondsSpent: row.secondsSpent || 0,
      lastSeenAt: toIso(row.lastSeenAt),
    })),
  });
});

router.get('/guidelines/:id', requireEmployee, (req, res) => {
  const guideline = db.get("SELECT * FROM guidelines WHERE id = ? AND status = 'published'", req.params.id);
  if (!guideline) throw new HttpError(404, 'Guideline not found.');

  const read = db.get(
    'SELECT * FROM guideline_reads WHERE guideline_id = ? AND user_id = ?',
    guideline.id,
    req.user.id
  );

  if (!read || read.version !== guideline.version) {
    db.run(
      `INSERT INTO guideline_reads (guideline_id, user_id, version, seconds_spent, acknowledged)
       VALUES (?, ?, ?, 0, 0)
       ON CONFLICT(guideline_id, user_id) DO UPDATE SET
         version = excluded.version, acknowledged = 0, first_opened_at = datetime('now'), last_seen_at = datetime('now')`,
      guideline.id,
      req.user.id,
      guideline.version
    );
  } else {
    db.run("UPDATE guideline_reads SET last_seen_at = datetime('now') WHERE id = ?", read.id);
  }

  res.json({
    guideline: {
      id: guideline.id,
      title: guideline.title,
      category: guideline.category,
      summary: guideline.summary,
      version: guideline.version,
      requiresAck: Boolean(guideline.requires_ack),
      fileName: guideline.file_original_name,
      fileSize: guideline.file_size_bytes,
      updatedAt: toIso(guideline.updated_at),
      acknowledged: Boolean(read?.acknowledged) && read?.version === guideline.version,
      pdfUrl: `/api/portal/guidelines/${guideline.id}/pdf`,
      history: db.all(
        'SELECT version, change_note AS changeNote, created_at AS createdAt FROM guideline_versions WHERE guideline_id = ? ORDER BY version DESC',
        guideline.id
      ).map((v) => ({ ...v, createdAt: toIso(v.createdAt) })),
    },
  });
});

router.post('/guidelines/:id/acknowledge', requireEmployee, (req, res) => {
  const guideline = db.get("SELECT * FROM guidelines WHERE id = ? AND status = 'published'", req.params.id);
  if (!guideline) throw new HttpError(404, 'Guideline not found.');
  const seconds = int(req.body.secondsSpent, { max: 86400, fallback: 60 });

  db.run(
    `INSERT INTO guideline_reads (guideline_id, user_id, version, seconds_spent, acknowledged, last_seen_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(guideline_id, user_id) DO UPDATE SET
       version = excluded.version,
       seconds_spent = MAX(guideline_reads.seconds_spent, excluded.seconds_spent),
       acknowledged = 1,
       last_seen_at = datetime('now')`,
    guideline.id,
    req.user.id,
    guideline.version,
    seconds
  );
  recordActivity({
    userId: req.user.id,
    identity: identity(req.user),
    eventType: 'guideline_acknowledged',
    area: 'guidelines',
    detail: guideline.title,
  });
  res.json({ ok: true });
});

router.get('/guidelines/:id/pdf', requireEmployee, (req, res) => {
  const guideline = db.get("SELECT * FROM guidelines WHERE id = ? AND status = 'published'", req.params.id);
  if (!guideline?.file_stored_name) throw new HttpError(404, 'No document is attached.');
  const filePath = path.join(GUIDELINE_DIR, path.basename(guideline.file_stored_name));
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'Document file is missing.');

  db.run(
    `INSERT INTO guideline_reads (guideline_id, user_id, version, seconds_spent, acknowledged, last_seen_at)
     VALUES (?, ?, ?, 0, 0, datetime('now'))
     ON CONFLICT(guideline_id, user_id) DO UPDATE SET last_seen_at = datetime('now')`,
    guideline.id,
    req.user.id,
    guideline.version
  );

  res.setHeader('Content-Type', guideline.file_mime_type || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(guideline.file_original_name || 'guideline.pdf')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(filePath).pipe(res);
});

/* ───────────────────────── assessments ───────────────────────── */

function assessmentState({ assessment, attempts, user, assignedIds, retakeIds }) {
  const open = attempts.find((a) => a.status === 'in_progress');
  const completed = attempts.filter((a) => a.status !== 'in_progress');
  const best = completed.length ? Math.max(...completed.map((a) => a.percentage ?? 0)) : null;
  const passed = best != null && best >= assessment.passing_percentage;
  const now = Date.now();
  const opensAt = assessment.available_from ? Date.parse(toIso(assessment.available_from)) : null;
  const closesAt = assessment.available_until ? Date.parse(toIso(assessment.available_until)) : null;
  const windowOpen = (!opensAt || opensAt <= now) && (!closesAt || closesAt >= now);
  const assigned = !user.restrictToAssigned || assignedIds.has(assessment.id);
  const retake = retakeIds.has(assessment.id);

  let state = 'available';
  if (open) state = 'in_progress';
  else if (completed.length && passed) state = 'passed';
  else if (completed.length && !retake) state = 'awaiting_retake';
  else if (!windowOpen) state = closesAt && closesAt < now ? 'closed' : 'scheduled';
  else if (!assigned) state = 'not_assigned';

  return {
    state,
    openAttemptId: open?.id ?? null,
    bestPercentage: best,
    attemptCount: attempts.length,
    canStart: state === 'available' && assigned && windowOpen,
    retakeAvailable: retake,
  };
}

router.get('/assessments', requireAnyEmployee, (req, res) => {
  const base = db.all(
    `SELECT s.*, (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.assessment_id = s.id) AS question_count
       FROM assessments s WHERE s.status = 'published'
      ORDER BY datetime(s.created_at) DESC`
  );
  const attempts = db.all(
    'SELECT * FROM assessment_attempts WHERE user_id = ? ORDER BY id DESC',
    req.user.id
  );
  const assignedIds = new Set(
    db.all('SELECT assessment_id FROM exam_assignments WHERE user_id = ?', req.user.id).map((r) => r.assessment_id)
  );
  const retakeIds = new Set(
    db.all(
      'SELECT assessment_id FROM retake_authorizations WHERE user_id = ? AND used_in_attempt_id IS NULL',
      req.user.id
    ).map((r) => r.assessment_id)
  );

  const list = base
    .map((assessment) => {
      const mine = attempts.filter((a) => a.assessment_id === assessment.id);
      const state = assessmentState({ assessment, attempts: mine, user: req.user, assignedIds, retakeIds });
      return {
        id: assessment.id,
        title: assessment.title,
        domain: assessment.domain,
        instructions: assessment.instructions,
        isTimed: Boolean(assessment.is_timed),
        timeLimitMinutes: assessment.time_limit_minutes,
        passingPercentage: assessment.passing_percentage,
        questionCount: assessment.question_count,
        availableFrom: toIso(assessment.available_from),
        availableUntil: toIso(assessment.available_until),
        ...state,
        lastAttempt: mine[0]
          ? {
              id: mine[0].id,
              status: mine[0].status,
              percentage: mine[0].is_released ? mine[0].percentage : null,
              submittedAt: toIso(mine[0].submitted_at),
              isReleased: Boolean(mine[0].is_released),
            }
          : null,
      };
    })
    .filter((assessment) => assessment.state !== 'not_assigned' || assessment.attemptCount > 0);

  res.json({ assessments: list });
});

router.post('/assessments/:id/start', requireAnyEmployee, (req, res) => {
  const result = startAttempt({ user: req.user, assessmentId: Number(req.params.id) });
  const assessment = db.get('SELECT title FROM assessments WHERE id = ?', req.params.id);
  recordActivity({
    userId: req.user.id,
    identity: identity(req.user),
    eventType: result.resumed ? 'assessment_resumed' : 'assessment_started',
    area: 'assessments',
    detail: assessment?.title,
  });
  res.status(201).json(result);
});

router.get('/attempts/:attemptId', requireAnyEmployee, (req, res) => {
  const payload = loadAttempt({ attemptId: Number(req.params.attemptId), user: req.user });
  const visible = payload.attempt.isReleased;

  res.json({
    ...payload,
    attempt: {
      ...payload.attempt,
      percentage: visible ? payload.attempt.percentage : null,
      passed: visible ? payload.attempt.passed : null,
      finalScore: visible ? payload.attempt.finalScore : null,
      reviewerComment: visible ? payload.attempt.reviewerComment : null,
    },
    questions: payload.questions.map((q) => ({
      ...q,
      answer:
        q.answer && q.type === 'practical_scenario'
          ? q.answer
          : visible && payload.attempt.releaseVisibility.answers
            ? q.answer
            : {
                value: q.answer?.value ?? '',
                reasoning: q.answer?.reasoning ?? '',
                awardedMarks: null,
                isCorrect: null,
                reviewerComment: null,
              },
    })),
  });
});

router.put('/attempts/:attemptId/answers', requireAnyEmployee, (req, res) => {
  const attemptQuestionId = int(req.body.questionId, { fallback: -1 });
  if (attemptQuestionId < 1) throw new HttpError(400, 'A question is required.');
  saveAnswer({
    attemptId: Number(req.params.attemptId),
    user: req.user,
    attemptQuestionId,
    value: optionalStr(req.body.value, 8000),
    reasoning: optionalStr(req.body.reasoning, 8000),
  });
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

router.post('/attempts/:attemptId/interruption', requireAnyEmployee, (req, res) => {
  const attempt = db.get(
    'SELECT * FROM assessment_attempts WHERE id = ? AND user_id = ?',
    req.params.attemptId,
    req.user.id
  );
  if (!attempt || attempt.status !== 'in_progress') throw new HttpError(409, 'No active attempt.');

  const event = req.body.event === 'resume' ? 'resume' : 'disconnect';
  if (event === 'disconnect') {
    if (!attempt.disconnect_started_at) {
      db.run(
        `UPDATE assessment_attempts SET disconnect_started_at = datetime('now'), interruption_count = interruption_count + 1, status_detail = 'Connection paused'
          WHERE id = ?`,
        attempt.id
      );
      db.run("INSERT INTO attempt_events (attempt_id, event_type, detail) VALUES (?, 'disconnect', 'Connection lost — timer paused')", attempt.id);
    }
  } else if (attempt.disconnect_started_at) {
    const paused = Math.max(
      0,
      Math.round((Date.now() - Date.parse(toIso(attempt.disconnect_started_at))) / 1000)
    );
    db.run(
      `UPDATE assessment_attempts SET paused_seconds = paused_seconds + ?, disconnect_started_at = NULL, status_detail = 'In progress'
        WHERE id = ?`,
      paused,
      attempt.id
    );
    db.run("INSERT INTO attempt_events (attempt_id, event_type, detail) VALUES (?, 'resume', ?)", attempt.id, `Timer paused ${paused}s`);
  }

  const refreshed = db.get('SELECT * FROM assessment_attempts WHERE id = ?', attempt.id);
  const elapsed =
    Math.floor((Date.now() - Date.parse(toIso(refreshed.started_at))) / 1000) - (refreshed.paused_seconds || 0);
  const remaining = refreshed.is_timed
    ? Math.max(0, (refreshed.time_limit_seconds || 0) - Math.max(0, elapsed))
    : null;
  res.json({ ok: true, pausedSeconds: refreshed.paused_seconds, remainingSeconds: remaining });
});

router.post('/attempts/:attemptId/submit', requireAnyEmployee, (req, res) => {
  const result = submitAttempt({ attemptId: Number(req.params.attemptId), user: req.user });
  recordActivity({
    userId: req.user.id,
    identity: identity(req.user),
    eventType: 'assessment_submitted',
    area: 'assessments',
    detail: result.percentage != null ? `${result.percentage}%` : null,
  });
  res.json(result);
});

/* ───────────────────────── results ───────────────────────── */

router.get('/results', requireAnyEmployee, (req, res) => {
  const attempts = db.all(
    `SELECT a.*, s.title, s.domain, s.passing_percentage
       FROM assessment_attempts a JOIN assessments s ON s.id = a.assessment_id
      WHERE a.user_id = ? AND a.status != 'in_progress'
      ORDER BY datetime(a.submitted_at) DESC`,
    req.user.id
  );

  res.json({
    results: attempts.map((a) => ({
      id: a.id,
      assessmentId: a.assessment_id,
      title: a.title,
      domain: a.domain,
      attemptNumber: a.attempt_number,
      submittedAt: toIso(a.submitted_at),
      durationSeconds: a.duration_seconds,
      status: a.status,
      statusDetail: a.status_detail,
      isReleased: Boolean(a.is_released),
      requiresManualReview: Boolean(a.requires_manual_review),
      percentage: a.is_released ? a.percentage : null,
      passed: a.is_released ? Boolean(a.passed) : null,
      passingPercentage: a.passing_percentage,
      releasedAt: toIso(a.released_at),
      showAnswers: Boolean(a.is_released && a.release_show_answers),
      reviewerComment: a.is_released ? a.reviewer_comment : null,
    })),
  });
});

/* ───────────────────────── readiness ───────────────────────── */

router.get('/readiness', requireEmployee, (req, res) => {
  const rows = db.all(
    `SELECT r.*, p.name AS project_name, p.description, p.client_note, p.approval_mode
       FROM employee_project_readiness r JOIN projects p ON p.id = r.project_id
      WHERE r.user_id = ? AND p.status = 'active'
      ORDER BY p.name`,
    req.user.id
  );

  res.json({
    projects: rows.map((row) => ({
      projectId: row.project_id,
      name: row.project_name,
      description: row.description,
      clientNote: row.client_note,
      approvalMode: row.approval_mode,
      status: row.readiness_status,
      decisionSource: row.decision_source,
      notes: row.notes,
      updatedAt: toIso(row.updated_at),
      requirements: db.all(
        `SELECT pa.assessment_id AS id, pa.minimum_percentage AS minimum, s.title, s.passing_percentage AS passingPercentage
           FROM project_assessments pa JOIN assessments s ON s.id = pa.assessment_id
          WHERE pa.project_id = ?`,
        row.project_id
      ).map((req2) => {
        const best = db.get(
          `SELECT MAX(percentage) AS best FROM assessment_attempts
            WHERE assessment_id = ? AND user_id = ? AND status IN ('submitted','expired')`,
          req2.id,
          req.user.id
        );
        const minimum = req2.minimum ?? req2.passingPercentage ?? 75;
        return {
          ...req2,
          minimum,
          best: best?.best ?? null,
          met: (best?.best ?? 0) >= minimum,
        };
      }),
      history: db.all(
        `SELECT previous_status AS previous, new_status AS next, decision_source AS source, actor_identity AS actor,
                reason, created_at AS createdAt
           FROM project_readiness_history WHERE project_id = ? AND user_id = ?
          ORDER BY datetime(created_at) DESC LIMIT 6`,
        row.project_id,
        req.user.id
      ).map((h) => ({ ...h, createdAt: toIso(h.createdAt) })),
    })),
  });
});

/* ───────────────────────── announcements & notifications ───────────────────────── */

router.get('/announcements', requireEmployee, (_req, res) => {
  const rows = db.all(
    `SELECT id, title, category, body, author_identity AS author, published_at AS publishedAt
       FROM announcements WHERE status = 'published' ORDER BY datetime(published_at) DESC`
  );
  res.json({ announcements: rows.map((r) => ({ ...r, publishedAt: toIso(r.publishedAt) })) });
});

router.get('/notifications', requireAnyEmployee, (req, res) => {
  const rows = db.all(
    `SELECT id, notification_type AS type, title, message, link_path AS linkPath, is_read AS isRead, created_at AS createdAt
       FROM notifications WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 100`,
    req.user.id
  );
  res.json({
    notifications: rows.map((r) => ({ ...r, isRead: Boolean(r.isRead), createdAt: toIso(r.createdAt) })),
    unread: rows.filter((r) => !r.isRead).length,
  });
});

router.post('/notifications/:id/read', requireAnyEmployee, (req, res) => {
  db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/notifications/read-all', requireAnyEmployee, (req, res) => {
  db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
});

/* ───────────────────────── feedback ───────────────────────── */

const FEEDBACK_CATEGORIES = new Set([
  'Guideline problem',
  'Assessment concern',
  'Portal usability',
  'Work preparation',
  'Suggestion',
]);

router.get('/feedback', requireEmployee, (req, res) => {
  const rows = db.all(
    `SELECT id, category, subject, message, status, admin_response AS response, created_at AS createdAt, updated_at AS updatedAt
       FROM employee_feedback WHERE user_id = ? ORDER BY datetime(created_at) DESC`,
    req.user.id
  );
  res.json({ feedback: rows.map((r) => ({ ...r, createdAt: toIso(r.createdAt), updatedAt: toIso(r.updatedAt) })) });
});

router.post('/feedback', requireEmployee, (req, res) => {
  const category = str(req.body.category, { field: 'Category', max: 60, min: 3 });
  if (!FEEDBACK_CATEGORIES.has(category)) throw new HttpError(400, 'Choose a valid feedback category.');
  const subject = str(req.body.subject, { field: 'Subject', max: 160, min: 4 });
  const message = str(req.body.message, { field: 'Message', max: 4000, min: 15 });

  const result = db.run(
    `INSERT INTO employee_feedback (user_id, employee_identity, category, subject, message)
     VALUES (?, ?, ?, ?, ?)`,
    req.user.id,
    identity(req.user),
    category,
    subject,
    message
  );
  recordActivity({
    userId: req.user.id,
    identity: identity(req.user),
    eventType: 'feedback_submitted',
    area: 'feedback',
    detail: subject,
  });
  const admins = db.all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  for (const admin of admins) {
    notify({
      userId: admin.id,
      type: 'feedback',
      title: 'New employee feedback',
      message: `${subject} · ${category}`,
      linkPath: '/admin/feedback',
    });
  }
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

export { expireAttempt };
export default router;
