import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import db, {
  GUIDELINE_DIR,
  recordAudit,
  notifyAllEmployees,
  nextAccountCode,
} from '../db/index.js';
import { requireAdmin } from '../lib/auth.js';
import { randomToken } from '../lib/crypto.js';
import { str, optionalStr, int, bool, json, HttpError, asyncRoute } from '../lib/validate.js';
import {
  toIso,
  loadAttempt,
  reviewAttempt,
  releaseAttempt,
  recomputeReadiness,
  expireAttempt,
} from '../lib/assessment.js';

const router = express.Router();
router.use(requireAdmin);

const actor = (user) => `${user.fullName} (${user.employeeCode})`;

const audit = (req, action, entityType, entityId, summary, extra = {}) =>
  recordAudit({
    adminId: req.user.id,
    adminIdentity: actor(req.user),
    action,
    entityType,
    entityId,
    summary,
    ...extra,
  });

/* ───────────────────────── guidelines ───────────────────────── */

const uploadGuideline = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, GUIDELINE_DIR),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${randomToken(8)}${path.extname(file.originalname || '.pdf').toLowerCase() || '.pdf'}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.pdf') return cb(new HttpError(400, 'Guidelines must be uploaded as PDF.'));
    return cb(null, true);
  },
});

const guidelineShape = (row) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  summary: row.summary,
  version: row.version,
  status: row.status,
  requiresAck: Boolean(row.requires_ack),
  fileName: row.file_original_name,
  fileSize: row.file_size_bytes,
  updatedAt: toIso(row.updated_at),
  createdAt: toIso(row.created_at),
  acknowledged: row.acknowledged ?? 0,
  audience: row.audience ?? 0,
});

router.get('/guidelines', (_req, res) => {
  const rows = db.all(
    `SELECT g.*,
            (SELECT COUNT(*) FROM guideline_reads r WHERE r.guideline_id = g.id AND r.acknowledged = 1 AND r.version = g.version) AS acknowledged,
            (SELECT COUNT(*) FROM users u WHERE u.role = 'employee' AND u.account_type = 'employee' AND u.status = 'active') AS audience
       FROM guidelines g ORDER BY g.category, g.title`
  );
  res.json({ guidelines: rows.map(guidelineShape) });
});

router.get('/guidelines/:id', (req, res) => {
  const row = db.get('SELECT * FROM guidelines WHERE id = ?', req.params.id);
  if (!row) throw new HttpError(404, 'Guideline not found.');
  res.json({
    guideline: {
      ...guidelineShape(row),
      versions: db.all(
        `SELECT id, version, change_note AS changeNote, created_at AS createdAt, published_by_identity AS publishedBy
           FROM guideline_versions WHERE guideline_id = ? ORDER BY version DESC`,
        row.id
      ).map((v) => ({ ...v, createdAt: toIso(v.createdAt) })),
      readers: db.all(
        `SELECT u.full_name AS name, u.employee_code AS code, r.version AS readVersion, r.acknowledged,
                r.seconds_spent AS secondsSpent, r.last_seen_at AS lastSeenAt
           FROM guideline_reads r JOIN users u ON u.id = r.user_id WHERE r.guideline_id = ?
          ORDER BY datetime(r.last_seen_at) DESC`,
        row.id
      ).map((r) => ({ ...r, acknowledged: Boolean(r.acknowledged), lastSeenAt: toIso(r.lastSeenAt) })),
    },
  });
});

router.post('/guidelines', (req, res, next) => {
  uploadGuideline.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const title = str(req.body.title, { field: 'Title', max: 200, min: 3 });
      const category = optionalStr(req.body.category, 80) || 'Evaluation';
      const summary = optionalStr(req.body.summary, 600);
      const status = ['draft', 'published', 'archived'].includes(req.body.status) ? req.body.status : 'draft';
      if (!req.file) throw new HttpError(400, 'Attach the guideline PDF.');

      const result = db.run(
        `INSERT INTO guidelines (title, category, summary, version, status, requires_ack, file_original_name,
            file_stored_name, file_mime_type, file_size_bytes, created_by)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        title,
        category,
        summary,
        status,
        bool(req.body.requiresAck, true) ? 1 : 0,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        req.user.id
      );
      const id = Number(result.lastInsertRowid);
      db.run(
        `INSERT INTO guideline_versions (guideline_id, version, title, summary, change_note, file_original_name,
            file_stored_name, file_mime_type, file_size_bytes, published_by_identity)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        title,
        summary,
        optionalStr(req.body.changeNote, 400) || 'Initial publication',
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        actor(req.user)
      );

      if (status === 'published') {
        notifyAllEmployees({
          type: 'guideline',
          title: 'New guideline published',
          message: `${title} is now available in your workspace.`,
          linkPath: '/portal/guidelines',
        });
      }

      audit(req, 'GUIDELINE_CREATED', 'guideline', id, `Published guideline “${title}” v1 (${status}).`);
      res.status(201).json({ id });
    } catch (error) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(error);
    }
  });
});

router.put('/guidelines/:id', (req, res, next) => {
  uploadGuideline.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const existing = db.get('SELECT * FROM guidelines WHERE id = ?', req.params.id);
      if (!existing) throw new HttpError(404, 'Guideline not found.');

      const title = req.body.title ? str(req.body.title, { field: 'Title', max: 200, min: 3 }) : existing.title;
      const category = req.body.category !== undefined ? optionalStr(req.body.category, 80) || 'Evaluation' : existing.category;
      const summary = req.body.summary !== undefined ? optionalStr(req.body.summary, 600) : existing.summary;
      const requiresAck = req.body.requiresAck !== undefined ? bool(req.body.requiresAck) : Boolean(existing.requires_ack);
      const status = ['draft', 'published', 'archived'].includes(req.body.status) ? req.body.status : existing.status;

      const contentChanged = Boolean(req.file) || title !== existing.title || summary !== existing.summary;
      const version = contentChanged ? existing.version + 1 : existing.version;

      db.run(
        `UPDATE guidelines SET title = ?, category = ?, summary = ?, requires_ack = ?, status = ?, version = ?,
            file_original_name = COALESCE(?, file_original_name),
            file_stored_name = COALESCE(?, file_stored_name),
            file_mime_type = COALESCE(?, file_mime_type),
            file_size_bytes = COALESCE(?, file_size_bytes),
            updated_at = datetime('now')
          WHERE id = ?`,
        title,
        category,
        summary,
        requiresAck ? 1 : 0,
        status,
        version,
        req.file?.originalname || null,
        req.file?.filename || null,
        req.file?.mimetype || null,
        req.file?.size || null,
        existing.id
      );

      if (contentChanged) {
        db.run(
          `INSERT INTO guideline_versions (guideline_id, version, title, summary, change_note, file_original_name,
              file_stored_name, file_mime_type, file_size_bytes, published_by_identity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          existing.id,
          version,
          title,
          summary,
          optionalStr(req.body.changeNote, 400) || 'Content revision',
          req.file?.originalname || existing.file_original_name,
          req.file?.filename || existing.file_stored_name,
          req.file?.mimetype || existing.file_mime_type,
          req.file?.size || existing.file_size_bytes,
          actor(req.user)
        );
        if (status === 'published') {
          notifyAllEmployees({
            type: 'guideline',
            title: 'Guideline updated',
            message: `${title} is now at version ${version}. Please re-read and acknowledge.`,
            linkPath: '/portal/guidelines',
          });
        }
      }

      audit(req, 'GUIDELINE_UPDATED', 'guideline', existing.id, `Updated guideline “${title}” to v${version}.`);
      res.json({ ok: true, version });
    } catch (error) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(error);
    }
  });
});

router.post('/guidelines/:id/status', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM guidelines WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Guideline not found.');
  const status = ['draft', 'published', 'archived'].includes(req.body.status) ? req.body.status : 'draft';
  db.run("UPDATE guidelines SET status = ?, updated_at = datetime('now') WHERE id = ?", status, existing.id);
  if (status === 'published' && existing.status !== 'published') {
    notifyAllEmployees({
      type: 'guideline',
      title: 'Guideline published',
      message: `${existing.title} is available in your workspace.`,
      linkPath: '/portal/guidelines',
    });
  }
  audit(req, 'GUIDELINE_STATUS_CHANGED', 'guideline', existing.id, `Set “${existing.title}” to ${status}.`);
  res.json({ ok: true, status });
}));

router.get('/guidelines/:id/file', (req, res) => {
  const row = db.get('SELECT * FROM guidelines WHERE id = ?', req.params.id);
  if (!row?.file_stored_name) throw new HttpError(404, 'No document attached.');
  const filePath = path.join(GUIDELINE_DIR, path.basename(row.file_stored_name));
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'Document file missing.');
  res.setHeader('Content-Type', row.file_mime_type || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.file_original_name || 'guideline.pdf')}"`);
  fs.createReadStream(filePath).pipe(res);
});

/* ───────────────────────── question bank ───────────────────────── */

const QUESTION_TYPES = new Set(['mcq', 'true_false', 'short_answer', 'practical_scenario']);

function questionPayload(body, existing = {}) {
  const type = QUESTION_TYPES.has(body.questionType) ? body.questionType : existing.question_type || 'mcq';
  const prompt = str(body.prompt ?? existing.prompt, { field: 'Question prompt', max: 2000, min: 8 });
  const options = json(body.options ?? (existing.options_json ? JSON.parse(existing.options_json) : null));
  const correctAnswer = optionalStr(body.correctAnswer ?? existing.correct_answer, 1000);
  if ((type === 'mcq' || type === 'true_false') && !correctAnswer) {
    throw new HttpError(400, 'Choose the correct answer for this question type.');
  }
  if (type === 'mcq' && (!Array.isArray(options) || options.length < 2)) {
    throw new HttpError(400, 'Multiple-choice questions need at least two options.');
  }

  return {
    type,
    prompt,
    scenario: optionalStr(body.scenario ?? existing.scenario_context, 3000) || null,
    options: type === 'mcq' ? JSON.stringify(options) : type === 'true_false' ? JSON.stringify(['True', 'False']) : null,
    correctAnswer: correctAnswer || null,
    acceptable: json(body.acceptableAnswers ?? (existing.acceptable_answers_json ? JSON.parse(existing.acceptable_answers_json) : null)),
    rubric: optionalStr(body.rubric ?? existing.scoring_rubric, 3000) || null,
    marks: Math.max(0.5, Number(body.marks ?? existing.marks ?? 1)),
    explanation: optionalStr(body.explanation ?? existing.explanation, 2000) || null,
    projectRef: optionalStr(body.projectRef ?? existing.project_ref, 160) || null,
    status: ['active', 'archived'].includes(body.status) ? body.status : existing.status || 'active',
  };
}

const questionShape = (row) => ({
  id: row.id,
  questionType: row.question_type,
  prompt: row.prompt,
  scenario: row.scenario_context,
  options: row.options_json ? JSON.parse(row.options_json) : [],
  correctAnswer: row.correct_answer,
  acceptableAnswers: row.acceptable_answers_json ? JSON.parse(row.acceptable_answers_json) : [],
  rubric: row.scoring_rubric,
  marks: row.marks,
  explanation: row.explanation,
  projectRef: row.project_ref,
  status: row.status,
  version: row.version,
  createdAt: toIso(row.created_at),
  usage: row.usage ?? 0,
});

router.get('/question-bank', (req, res) => {
  const search = `%${String(req.query.search || '').toLowerCase().trim()}%`;
  const type = req.query.type;
  const rows = db.all(
    `SELECT q.*, (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.question_id = q.id) AS usage
       FROM question_bank q
      WHERE (LOWER(q.prompt) LIKE ? OR LOWER(COALESCE(q.project_ref,'')) LIKE ?)
        ${type && type !== 'all' ? 'AND q.question_type = ?' : ''}
        ${req.query.status && req.query.status !== 'all' ? 'AND q.status = ?' : ''}
      ORDER BY datetime(q.created_at) DESC`,
    search,
    search,
    ...(type && type !== 'all' ? [type] : []),
    ...(req.query.status && req.query.status !== 'all' ? [req.query.status] : [])
  );
  res.json({
    questions: rows.map(questionShape),
    counts: Object.fromEntries(
      ['mcq', 'true_false', 'short_answer', 'practical_scenario'].map((t) => [
        t,
        db.get("SELECT COUNT(*) AS count FROM question_bank WHERE question_type = ? AND status = 'active'", t).count,
      ])
    ),
  });
});

router.post('/question-bank', asyncRoute((req, res) => {
  const q = questionPayload(req.body);
  const result = db.run(
    `INSERT INTO question_bank (question_type, prompt, scenario_context, options_json, correct_answer,
        acceptable_answers_json, scoring_rubric, marks, explanation, project_ref, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    q.type,
    q.prompt,
    q.scenario,
    q.options,
    q.correctAnswer,
    q.acceptable ? JSON.stringify(q.acceptable) : null,
    q.rubric,
    q.marks,
    q.explanation,
    q.projectRef,
    q.status,
    req.user.id
  );
  audit(req, 'QUESTION_CREATED', 'question', result.lastInsertRowid, `Added a ${q.type} question to the bank.`);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

router.patch('/question-bank/:id', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM question_bank WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Question not found.');
  const q = questionPayload(req.body, existing);
  db.run(
    `UPDATE question_bank SET question_type = ?, prompt = ?, scenario_context = ?, options_json = ?,
        correct_answer = ?, acceptable_answers_json = ?, scoring_rubric = ?, marks = ?, explanation = ?,
        project_ref = ?, status = ?, version = version + 1, updated_at = datetime('now')
      WHERE id = ?`,
    q.type,
    q.prompt,
    q.scenario,
    q.options,
    q.correctAnswer,
    q.acceptable ? JSON.stringify(q.acceptable) : null,
    q.rubric,
    q.marks,
    q.explanation,
    q.projectRef,
    q.status,
    existing.id
  );
  audit(req, 'QUESTION_UPDATED', 'question', existing.id, 'Revised a question in the bank.');
  res.json({ ok: true });
}));

router.post('/question-bank/bulk', asyncRoute((req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 200) : [];
  if (!rows.length) throw new HttpError(400, 'Provide questions to import.');
  const created = [];
  const failed = [];
  for (const [index, row] of rows.entries()) {
    try {
      const q = questionPayload({
        questionType: row.questionType ?? row.type,
        prompt: row.prompt,
        scenario: row.scenario,
        options: row.options,
        correctAnswer: row.correctAnswer ?? row.correct,
        acceptableAnswers: row.acceptableAnswers,
        rubric: row.rubric,
        marks: row.marks,
        explanation: row.explanation,
        projectRef: row.projectRef ?? row.domain,
      });
      const result = db.run(
        `INSERT INTO question_bank (question_type, prompt, scenario_context, options_json, correct_answer,
            acceptable_answers_json, scoring_rubric, marks, explanation, project_ref, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        q.type, q.prompt, q.scenario, q.options, q.correctAnswer,
        q.acceptable ? JSON.stringify(q.acceptable) : null, q.rubric, q.marks, q.explanation, q.projectRef, req.user.id
      );
      created.push(Number(result.lastInsertRowid));
    } catch (error) {
      failed.push({ row: index + 1, error: error.message });
    }
  }
  audit(req, 'QUESTION_BULK_IMPORT', 'question', null, `Imported ${created.length} questions (${failed.length} failed).`);
  res.status(201).json({ created: created.length, failed });
}));

/* ───────────────────────── assessments ───────────────────────── */

const assessmentShape = (row) => ({
  id: row.id,
  title: row.title,
  instructions: row.instructions,
  domain: row.domain,
  projectId: row.project_id,
  status: row.status,
  availableFrom: toIso(row.available_from),
  availableUntil: toIso(row.available_until),
  isTimed: Boolean(row.is_timed),
  timeLimitMinutes: row.time_limit_minutes,
  passingPercentage: row.passing_percentage,
  selectionMode: row.selection_mode,
  randomSampleCount: row.random_sample_count,
  version: row.version,
  createdAt: toIso(row.created_at),
  questionCount: row.question_count ?? 0,
  totalMarks: row.total_marks ?? 0,
  assignedCount: row.assigned_count ?? 0,
  attemptCount: row.attempt_count ?? 0,
  pendingReview: row.pending_review ?? 0,
});

function assessmentPayload(body, existing = {}) {
  return {
    title: str(body.title ?? existing.title, { field: 'Title', max: 200, min: 3 }),
    instructions: str(body.instructions ?? existing.instructions, { field: 'Instructions', max: 4000, min: 10 }),
    domain: optionalStr(body.domain ?? existing.domain, 120) || null,
    projectId: body.projectId ? int(body.projectId) : existing.project_id || null,
    isTimed: body.isTimed !== undefined ? bool(body.isTimed) : Boolean(existing.is_timed),
    timeLimitMinutes: body.timeLimitMinutes !== undefined ? int(body.timeLimitMinutes, { min: 1, max: 600 }) : existing.time_limit_minutes,
    passingPercentage: body.passingPercentage !== undefined ? int(body.passingPercentage, { min: 1, max: 100 }) : existing.passing_percentage ?? 75,
    availableFrom: body.availableFrom ? new Date(body.availableFrom).toISOString().slice(0, 19).replace('T', ' ') : existing.available_from || null,
    availableUntil: body.availableUntil ? new Date(body.availableUntil).toISOString().slice(0, 19).replace('T', ' ') : existing.available_until || null,
    selectionMode: body.selectionMode === 'random_pool' ? 'random_pool' : 'fixed',
    randomSampleCount: body.randomSampleCount ? int(body.randomSampleCount, { min: 1, max: 100 }) : existing.random_sample_count || null,
    status: ['draft', 'published', 'archived'].includes(body.status) ? body.status : existing.status || 'draft',
  };
}

router.get('/assessments', (_req, res) => {
  const rows = db.all(
    `SELECT s.*,
            (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.assessment_id = s.id) AS question_count,
            (SELECT COALESCE(SUM(COALESCE(aq.marks_override, q.marks)), 0) FROM assessment_questions aq
               JOIN question_bank q ON q.id = aq.question_id WHERE aq.assessment_id = s.id) AS total_marks,
            (SELECT COUNT(*) FROM exam_assignments e WHERE e.assessment_id = s.id) AS assigned_count,
            (SELECT COUNT(*) FROM assessment_attempts at WHERE at.assessment_id = s.id) AS attempt_count,
            (SELECT COUNT(*) FROM assessment_attempts at WHERE at.assessment_id = s.id AND at.review_status = 'pending') AS pending_review
       FROM assessments s ORDER BY datetime(s.created_at) DESC`
  );
  res.json({ assessments: rows.map(assessmentShape) });
});

router.get('/assessments/:id', (req, res) => {
  const row = db.get('SELECT * FROM assessments WHERE id = ?', req.params.id);
  if (!row) throw new HttpError(404, 'Assessment not found.');
  res.json({
    assessment: {
      ...assessmentShape(row),
      questions: db.all(
        `SELECT q.*, aq.sort_order, aq.marks_override FROM assessment_questions aq
           JOIN question_bank q ON q.id = aq.question_id WHERE aq.assessment_id = ? ORDER BY aq.sort_order`,
        row.id
      ).map((q) => ({ ...questionShape(q), marksOverride: q.marks_override })),
      assignments: db.all(
        `SELECT e.user_id AS userId, u.full_name AS name, u.employee_code AS code, u.account_type AS accountType
           FROM exam_assignments e JOIN users u ON u.id = e.user_id WHERE e.assessment_id = ?`,
        row.id
      ),
    },
  });
});

router.post('/assessments', asyncRoute((req, res) => {
  const a = assessmentPayload(req.body);
  if (a.isTimed && !a.timeLimitMinutes) throw new HttpError(400, 'Set a time limit for a timed assessment.');
  const result = db.run(
    `INSERT INTO assessments (title, instructions, domain, project_id, status, available_from, available_until,
        is_timed, time_limit_minutes, passing_percentage, selection_mode, random_sample_count, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    a.title, a.instructions, a.domain, a.projectId, a.status, a.availableFrom, a.availableUntil,
    a.isTimed ? 1 : 0, a.timeLimitMinutes, a.passingPercentage, a.selectionMode, a.randomSampleCount, req.user.id
  );
  const id = Number(result.lastInsertRowid);

  const questionIds = Array.isArray(req.body.questionIds) ? req.body.questionIds.map(Number) : [];
  questionIds.forEach((qid, index) => {
    db.run(
      'INSERT OR IGNORE INTO assessment_questions (assessment_id, question_id, sort_order) VALUES (?, ?, ?)',
      id,
      qid,
      index
    );
  });

  const userIds = Array.isArray(req.body.userIds) ? req.body.userIds.map(Number) : [];
  for (const uid of userIds) {
    db.run(
      'INSERT OR IGNORE INTO exam_assignments (assessment_id, user_id, assigned_by_identity) VALUES (?, ?, ?)',
      id, uid, actor(req.user)
    );
  }

  audit(req, 'ASSESSMENT_CREATED', 'assessment', id, `Created assessment “${a.title}” (${a.status}).`);
  res.status(201).json({ id });
}));

router.put('/assessments/:id', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM assessments WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Assessment not found.');
  const a = assessmentPayload(req.body, existing);
  db.run(
    `UPDATE assessments SET title = ?, instructions = ?, domain = ?, project_id = ?, status = ?, available_from = ?,
        available_until = ?, is_timed = ?, time_limit_minutes = ?, passing_percentage = ?, selection_mode = ?,
        random_sample_count = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?`,
    a.title, a.instructions, a.domain, a.projectId, a.status, a.availableFrom, a.availableUntil,
    a.isTimed ? 1 : 0, a.timeLimitMinutes, a.passingPercentage, a.selectionMode, a.randomSampleCount, existing.id
  );

  if (Array.isArray(req.body.questionIds)) {
    db.tx(() => {
      db.run('DELETE FROM assessment_questions WHERE assessment_id = ?', existing.id);
      req.body.questionIds.map(Number).forEach((qid, index) => {
        db.run(
          'INSERT OR IGNORE INTO assessment_questions (assessment_id, question_id, sort_order) VALUES (?, ?, ?)',
          existing.id, qid, index
        );
      });
    });
  }

  audit(req, 'ASSESSMENT_UPDATED', 'assessment', existing.id, `Updated assessment “${a.title}”.`);
  res.json({ ok: true });
}));

router.post('/assessments/:id/status', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM assessments WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Assessment not found.');
  const status = ['draft', 'published', 'archived'].includes(req.body.status) ? req.body.status : 'draft';
  if (status === 'published') {
    const count = db.get('SELECT COUNT(*) AS count FROM assessment_questions WHERE assessment_id = ?', existing.id).count;
    if (!count) throw new HttpError(400, 'Add at least one question before publishing.');
  }
  db.run("UPDATE assessments SET status = ?, updated_at = datetime('now') WHERE id = ?", status, existing.id);
  audit(req, 'ASSESSMENT_STATUS_CHANGED', 'assessment', existing.id, `Set “${existing.title}” to ${status}.`);
  res.json({ ok: true, status });
}));

router.post('/assessments/:id/duplicate', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM assessments WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Assessment not found.');
  const result = db.run(
    `INSERT INTO assessments (title, instructions, domain, project_id, status, available_from, available_until,
        is_timed, time_limit_minutes, passing_percentage, selection_mode, random_sample_count, created_by)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
    `${existing.title} (copy)`, existing.instructions, existing.domain, existing.project_id,
    existing.available_from, existing.available_until, existing.is_timed, existing.time_limit_minutes,
    existing.passing_percentage, existing.selection_mode, existing.random_sample_count, req.user.id
  );
  const id = Number(result.lastInsertRowid);
  const questions = db.all('SELECT * FROM assessment_questions WHERE assessment_id = ?', existing.id);
  for (const q of questions) {
    db.run(
      'INSERT INTO assessment_questions (assessment_id, question_id, sort_order, marks_override) VALUES (?, ?, ?, ?)',
      id, q.question_id, q.sort_order, q.marks_override
    );
  }
  audit(req, 'ASSESSMENT_DUPLICATED', 'assessment', id, `Duplicated “${existing.title}”.`);
  res.status(201).json({ id });
}));

router.put('/assessments/:id/assignments', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM assessments WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Assessment not found.');
  const userIds = Array.isArray(req.body.userIds) ? req.body.userIds.map(Number) : [];

  db.tx(() => {
    db.run('DELETE FROM exam_assignments WHERE assessment_id = ?', existing.id);
    for (const uid of userIds) {
      db.run(
        'INSERT OR IGNORE INTO exam_assignments (assessment_id, user_id, assigned_by_identity) VALUES (?, ?, ?)',
        existing.id, uid, actor(req.user)
      );
    }
  });
  res.json({ ok: true, assigned: userIds.length });
}));

/* ───────────────────────── attempts ───────────────────────── */

router.get('/attempts', (req, res) => {
  const status = req.query.status;
  const search = `%${String(req.query.search || '').trim().toLowerCase()}%`;
  const rows = db.all(
    `SELECT a.*, u.full_name AS employeeName, u.employee_code AS employeeCode, u.account_type AS accountType,
            s.title, s.domain, s.passing_percentage
       FROM assessment_attempts a JOIN users u ON u.id = a.user_id JOIN assessments s ON s.id = a.assessment_id
      WHERE 1 = 1
        ${status && status !== 'all' ? (status === 'pending' ? "AND a.review_status = 'pending'" : 'AND a.status = ?') : ''}
        AND (LOWER(u.full_name) LIKE ? OR LOWER(u.employee_code) LIKE ? OR LOWER(s.title) LIKE ?)
      ORDER BY datetime(a.started_at) DESC`,
    ...(status && status !== 'all' && status !== 'pending' ? [status] : []),
    search, search, search
  );

  res.json({
    attempts: rows.map((a) => ({
      id: a.id,
      employeeName: a.employeeName,
      employeeCode: a.employeeCode,
      accountType: a.accountType,
      title: a.title,
      domain: a.domain,
      status: a.status,
      statusDetail: a.status_detail,
      attemptNumber: a.attempt_number,
      percentage: a.percentage,
      passingPercentage: a.passing_percentage,
      passed: a.passed == null ? null : Boolean(a.passed),
      requiresManualReview: Boolean(a.requires_manual_review),
      reviewStatus: a.review_status,
      isReleased: Boolean(a.is_released),
      startedAt: toIso(a.started_at),
      submittedAt: toIso(a.submitted_at),
      durationSeconds: a.duration_seconds,
    })),
    counts: {
      pending: db.get("SELECT COUNT(*) AS count FROM assessment_attempts WHERE review_status = 'pending'").count,
      unreleased: db.get("SELECT COUNT(*) AS count FROM assessment_attempts WHERE status != 'in_progress' AND is_released = 0").count,
      inProgress: db.get("SELECT COUNT(*) AS count FROM assessment_attempts WHERE status = 'in_progress'").count,
      total: db.get('SELECT COUNT(*) AS count FROM assessment_attempts').count,
    },
  });
});

router.get('/attempts/:id', (req, res) => {
  const payload = loadAttempt({ attemptId: Number(req.params.id), user: req.user, asAdmin: true });
  const events = db.all(
    'SELECT event_type AS type, detail, created_at AS createdAt FROM attempt_events WHERE attempt_id = ? ORDER BY id',
    req.params.id
  ).map((e) => ({ ...e, createdAt: toIso(e.createdAt) }));
  res.json({ ...payload, events, questions: payload.questions.map((q) => ({ ...q, explanation: undefined })) });
});

router.post('/attempts/:id/review', asyncRoute((req, res) => {
  const result = reviewAttempt({
    attemptId: Number(req.params.id),
    admin: req.user,
    answers: Array.isArray(req.body.answers) ? req.body.answers : [],
    comment: optionalStr(req.body.comment, 3000),
    finalise: req.body.finalise !== false,
  });
  audit(req, 'ATTEMPT_REVIEWED', 'attempt', req.params.id, `Reviewed attempt #${req.params.id} → ${result.percentage}%.`);
  res.json(result);
}));

router.post('/attempts/:id/release', asyncRoute((req, res) => {
  releaseAttempt({
    attemptId: Number(req.params.id),
    admin: req.user,
    options: {
      showScore: bool(req.body.showScore, true),
      showPass: bool(req.body.showPass, true),
      showAnswers: bool(req.body.showAnswers, true),
    },
  });
  res.json({ ok: true });
}));

router.post('/attempts/:id/unrelease', asyncRoute((req, res) => {
  const attempt = db.get('SELECT * FROM assessment_attempts WHERE id = ?', req.params.id);
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  db.run(
    'UPDATE assessment_attempts SET is_released = 0, released_at = NULL, released_by_identity = NULL WHERE id = ?',
    attempt.id
  );
  audit(req, 'ATTEMPT_UNRELEASED', 'attempt', attempt.id, `Withdrew the released result for attempt #${attempt.id}.`);
  res.json({ ok: true });
}));

router.post('/attempts/:id/expire', asyncRoute((req, res) => {
  expireAttempt(Number(req.params.id), 'Closed by administrator');
  res.json({ ok: true });
}));

router.post('/retakes', asyncRoute((req, res) => {
  const assessmentId = int(req.body.assessmentId, { fallback: -1 });
  const userId = int(req.body.userId, { fallback: -1 });
  if (assessmentId < 1 || userId < 1) throw new HttpError(400, 'Choose an assessment and a person.');
  const assessment = db.get('SELECT * FROM assessments WHERE id = ?', assessmentId);
  const user = db.get("SELECT * FROM users WHERE id = ? AND role = 'employee'", userId);
  if (!assessment || !user) throw new HttpError(404, 'Assessment or account not found.');

  db.run(
    `INSERT INTO retake_authorizations (assessment_id, user_id, authorized_by_identity, conditions_note)
     VALUES (?, ?, ?, ?)`,
    assessmentId,
    userId,
    actor(req.user),
    optionalStr(req.body.conditionsNote, 600) || null
  );
  db.run(
    `INSERT INTO notifications (user_id, notification_type, title, message, link_path)
     VALUES (?, 'retake', 'A retake has been authorised', ?, '/portal/assessments')`,
    userId,
    `You may retake ${assessment.title}. ${optionalStr(req.body.conditionsNote, 200)}`
  );
  audit(req, 'RETAKE_AUTHORISED', 'assessment', assessmentId, `Authorised a retake of “${assessment.title}” for ${user.full_name}.`);
  res.status(201).json({ ok: true });
}));

/* ───────────────────────── projects & readiness ───────────────────────── */

router.get('/projects', (_req, res) => {
  const rows = db.all('SELECT * FROM projects ORDER BY datetime(created_at) DESC');
  res.json({
    projects: rows.map((p) => ({
      id: p.id,
      name: p.name,
      clientNote: p.client_note,
      description: p.description,
      approvalMode: p.approval_mode,
      status: p.status,
      createdAt: toIso(p.created_at),
      requirements: db.all(
        `SELECT pa.assessment_id AS assessmentId, pa.minimum_percentage AS minimumPercentage,
                a.title, a.passing_percentage AS passingPercentage
           FROM project_assessments pa JOIN assessments a ON a.id = pa.assessment_id WHERE pa.project_id = ?`,
        p.id
      ).map((r) => ({ ...r, minimumPercentage: r.minimumPercentage ?? r.passingPercentage })),
      readiness: db.all(
        `SELECT readiness_status AS status, COUNT(*) AS count FROM employee_project_readiness
          WHERE project_id = ? GROUP BY readiness_status`,
        p.id
      ),
    })),
  });
});

router.post('/projects', asyncRoute((req, res) => {
  const name = str(req.body.name, { field: 'Project name', max: 160, min: 2 });
  const result = db.run(
    `INSERT INTO projects (name, client_note, description, approval_mode, created_by) VALUES (?, ?, ?, ?, ?)`,
    name,
    optionalStr(req.body.clientNote, 200) || null,
    optionalStr(req.body.description, 2000) || null,
    req.body.approvalMode === 'manual' ? 'manual' : 'automatic',
    req.user.id
  );
  const id = Number(result.lastInsertRowid);
  const requirements = Array.isArray(req.body.requirements) ? req.body.requirements : [];
  for (const requirement of requirements) {
    const assessmentId = int(requirement.assessmentId, { fallback: -1 });
    if (assessmentId < 1) continue;
    db.run(
      'INSERT OR IGNORE INTO project_assessments (project_id, assessment_id, minimum_percentage) VALUES (?, ?, ?)',
      id, assessmentId, requirement.minimumPercentage ? int(requirement.minimumPercentage, { min: 1, max: 100 }) : null
    );
  }
  audit(req, 'PROJECT_CREATED', 'project', id, `Created project “${name}”.`);
  res.status(201).json({ id });
}));

router.put('/projects/:id', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Project not found.');
  const name = req.body.name ? str(req.body.name, { field: 'Project name', max: 160, min: 2 }) : existing.name;
  db.run(
    `UPDATE projects SET name = ?, client_note = ?, description = ?, approval_mode = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?`,
    name,
    optionalStr(req.body.clientNote, 200) || existing.client_note,
    optionalStr(req.body.description, 2000) || existing.description,
    req.body.approvalMode === 'manual' ? 'manual' : 'automatic',
    req.body.status === 'archived' ? 'archived' : 'active',
    existing.id
  );
  if (Array.isArray(req.body.requirements)) {
    db.tx(() => {
      db.run('DELETE FROM project_assessments WHERE project_id = ?', existing.id);
      for (const requirement of req.body.requirements) {
        const assessmentId = int(requirement.assessmentId, { fallback: -1 });
        if (assessmentId < 1) continue;
        db.run(
          'INSERT OR IGNORE INTO project_assessments (project_id, assessment_id, minimum_percentage) VALUES (?, ?, ?)',
          existing.id, assessmentId, requirement.minimumPercentage ? int(requirement.minimumPercentage, { min: 1, max: 100 }) : null
        );
      }
    });
    const people = db.all('SELECT user_id FROM employee_project_readiness WHERE project_id = ?', existing.id);
    for (const person of people) recomputeReadiness(existing.id, person.user_id, actor(req.user));
  }
  audit(req, 'PROJECT_UPDATED', 'project', existing.id, `Updated project “${name}”.`);
  res.json({ ok: true });
}));

router.get('/readiness', (_req, res) => {
  const projects = db.all("SELECT * FROM projects WHERE status = 'active' ORDER BY name");
  res.json({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      approvalMode: project.approval_mode,
      requirements: db.all(
        `SELECT pa.assessment_id AS assessmentId, a.title, pa.minimum_percentage AS minimumPercentage, a.passing_percentage
           FROM project_assessments pa JOIN assessments a ON a.id = pa.assessment_id WHERE pa.project_id = ?`,
        project.id
      ),
      people: db.all(
        `SELECT r.user_id AS userId, u.full_name AS name, u.employee_code AS code, r.readiness_status AS status,
                r.decision_source AS source, r.notes, r.updated_at AS updatedAt
           FROM employee_project_readiness r JOIN users u ON u.id = r.user_id
          WHERE r.project_id = ? AND u.status != 'deleted' ORDER BY u.full_name`,
        project.id
      ).map((row) => ({
        ...row,
        updatedAt: toIso(row.updatedAt),
        scores: db.all(
          `SELECT pa.assessment_id AS assessmentId, a.title, pa.minimum_percentage AS minimumPercentage,
                  (SELECT MAX(percentage) FROM assessment_attempts at WHERE at.assessment_id = pa.assessment_id AND at.user_id = ?) AS best
             FROM project_assessments pa JOIN assessments a ON a.id = pa.assessment_id WHERE pa.project_id = ?`,
          row.userId,
          project.id
        ).map((s) => ({
          ...s,
          minimum: s.minimumPercentage ?? 75,
          met: (s.best ?? 0) >= (s.minimumPercentage ?? 75),
        })),
      })),
    })),
  });
});

router.post('/readiness/decision', asyncRoute((req, res) => {
  const projectId = int(req.body.projectId, { fallback: -1 });
  const userId = int(req.body.userId, { fallback: -1 });
  const status = req.body.status;
  if (!['not_ready', 'in_preparation', 'pending_approval', 'approved', 'revoked'].includes(status)) {
    throw new HttpError(400, 'Choose a valid readiness status.');
  }
  const project = db.get('SELECT * FROM projects WHERE id = ?', projectId);
  const user = db.get("SELECT * FROM users WHERE id = ? AND role = 'employee'", userId);
  if (!project || !user) throw new HttpError(404, 'Project or account not found.');

  const existing = db.get(
    'SELECT * FROM employee_project_readiness WHERE project_id = ? AND user_id = ?',
    projectId,
    userId
  );
  if (existing) {
    db.run(
      `UPDATE employee_project_readiness SET readiness_status = ?, decision_source = 'manual', notes = ?,
          updated_by_identity = ?, updated_at = datetime('now') WHERE id = ?`,
      status,
      optionalStr(req.body.notes, 1000) || existing.notes,
      actor(req.user),
      existing.id
    );
  } else {
    db.run(
      `INSERT INTO employee_project_readiness (project_id, user_id, readiness_status, decision_source, notes, updated_by_identity)
       VALUES (?, ?, ?, 'manual', ?, ?)`,
      projectId, userId, status, optionalStr(req.body.notes, 1000) || null, actor(req.user)
    );
  }
  db.run(
    `INSERT INTO project_readiness_history (project_id, user_id, previous_status, new_status, decision_source, actor_identity, reason)
     VALUES (?, ?, ?, ?, 'manual', ?, ?)`,
    projectId,
    userId,
    existing?.readiness_status || null,
    status,
    actor(req.user),
    optionalStr(req.body.notes, 500) || null
  );
  db.run(
    `INSERT INTO notifications (user_id, notification_type, title, message, link_path)
     VALUES (?, 'readiness', ?, ?, '/portal/readiness')`,
    userId,
    status === 'approved' ? 'Project readiness approved' : 'Readiness decision recorded',
    `${project.name}: ${status.replace(/_/g, ' ')}.`
  );
  audit(req, 'READINESS_DECISION', 'readiness', `${projectId}:${userId}`, `Set ${user.full_name} on ${project.name} to ${status}.`);
  res.json({ ok: true });
}));

/* ───────────────────────── announcements ───────────────────────── */

const announcementShape = (row) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  body: row.body,
  status: row.status,
  author: row.author_identity,
  publishedAt: toIso(row.published_at),
  createdAt: toIso(row.created_at),
});

router.get('/announcements', (_req, res) => {
  res.json({
    announcements: db.all('SELECT * FROM announcements ORDER BY datetime(created_at) DESC').map(announcementShape),
  });
});

router.post('/announcements', asyncRoute((req, res) => {
  const title = str(req.body.title, { field: 'Title', max: 200, min: 3 });
  const body = str(req.body.body, { field: 'Message', max: 6000, min: 10 });
  const category = optionalStr(req.body.category, 60) || 'General update';
  const status = ['draft', 'published', 'archived'].includes(req.body.status) ? req.body.status : 'published';

  const result = db.run(
    `INSERT INTO announcements (title, category, body, status, author_identity, created_by, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ${status === 'published' ? "datetime('now')" : 'NULL'})`,
    title, category, body, status, actor(req.user), req.user.id
  );
  if (status === 'published') {
    notifyAllEmployees({
      type: 'announcement',
      title,
      message: body.slice(0, 180),
      linkPath: '/portal/announcements',
    });
  }
  audit(req, 'ANNOUNCEMENT_CREATED', 'announcement', result.lastInsertRowid, `Published announcement “${title}”.`);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

router.put('/announcements/:id', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM announcements WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Announcement not found.');
  const title = req.body.title ? str(req.body.title, { field: 'Title', max: 200, min: 3 }) : existing.title;
  const body = req.body.body ? str(req.body.body, { field: 'Message', max: 6000, min: 10 }) : existing.body;
  const category = optionalStr(req.body.category, 60) || existing.category;
  const status = ['draft', 'published', 'archived'].includes(req.body.status) ? req.body.status : existing.status;
  db.run(
    `UPDATE announcements SET title = ?, body = ?, category = ?, status = ?,
        published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN datetime('now') ELSE published_at END,
        updated_at = datetime('now') WHERE id = ?`,
    title, body, category, status, status, existing.id
  );
  if (status === 'published' && existing.status !== 'published') {
    notifyAllEmployees({ type: 'announcement', title, message: body.slice(0, 180), linkPath: '/portal/announcements' });
  }
  audit(req, 'ANNOUNCEMENT_UPDATED', 'announcement', existing.id, `Updated announcement “${title}”.`);
  res.json({ ok: true });
}));

router.delete('/announcements/:id', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM announcements WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Announcement not found.');
  db.run("UPDATE announcements SET status = 'archived', updated_at = datetime('now') WHERE id = ?", existing.id);
  audit(req, 'ANNOUNCEMENT_ARCHIVED', 'announcement', existing.id, `Archived announcement “${existing.title}”.`);
  res.json({ ok: true });
}));

/* ───────────────────────── feedback ───────────────────────── */

router.get('/feedback', (req, res) => {
  const status = req.query.status;
  res.json({
    feedback: db.all(
      `SELECT * FROM employee_feedback ${status && status !== 'all' ? 'WHERE status = ?' : ''}
        ORDER BY datetime(created_at) DESC`,
      ...(status && status !== 'all' ? [status] : [])
    ).map((row) => ({
      id: row.id,
      identity: row.employee_identity,
      category: row.category,
      subject: row.subject,
      message: row.message,
      status: row.status,
      response: row.admin_response,
      createdAt: toIso(row.created_at),
    })),
  });
});

router.patch('/feedback/:id', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM employee_feedback WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Feedback not found.');
  const status = ['New', 'Under Review', 'Addressed', 'Closed'].includes(req.body.status)
    ? req.body.status
    : existing.status;
  const response = req.body.response !== undefined ? optionalStr(req.body.response, 3000) : existing.admin_response;
  db.run(
    `UPDATE employee_feedback SET status = ?, admin_response = ?, updated_by_identity = ?, updated_at = datetime('now')
      WHERE id = ?`,
    status, response, actor(req.user), existing.id
  );
  if (status === 'Addressed' && existing.status !== 'Addressed') {
    db.run(
      `INSERT INTO notifications (user_id, notification_type, title, message, link_path)
       VALUES (?, 'feedback', 'Your feedback was addressed', ?, '/portal/feedback')`,
      existing.user_id,
      existing.subject
    );
  }
  audit(req, 'FEEDBACK_UPDATED', 'feedback', existing.id, `Set feedback “${existing.subject}” to ${status}.`);
  res.json({ ok: true });
}));

/* ───────────────────────── people directory for pickers ───────────────────────── */

router.get('/directory', (_req, res) => {
  res.json({
    people: db.all(
      `SELECT id, full_name AS name, employee_code AS code, account_type AS accountType, status
         FROM users WHERE role = 'employee' AND status != 'deleted' ORDER BY full_name`
    ),
    assessments: db.all(
      "SELECT id, title, domain, status FROM assessments WHERE status != 'archived' ORDER BY title"
    ),
  });
});

export { nextAccountCode };
export default router;
