import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import db, {
  RESUME_DIR,
  getSettings,
  setSetting,
  recordAudit,
  nextAccountCode,
  notifyAllEmployees,
  DEFAULT_SETTINGS,
} from '../db/index.js';
import { requireAdmin } from '../lib/auth.js';
import { hashPassword, randomToken, passwordProblem } from '../lib/crypto.js';
import { str, optionalStr, email, int, bool, HttpError, asyncRoute } from '../lib/validate.js';
import { toIso } from '../lib/assessment.js';

const router = express.Router();
router.use(requireAdmin);

const adminIdentity = (user) => `${user.fullName} (${user.employeeCode})`;

const serializeUser = (row) => ({
  id: row.id,
  code: row.employee_code,
  fullName: row.full_name,
  email: row.email,
  username: row.username,
  role: row.role,
  accountType: row.account_type,
  status: row.status,
  departmentNote: row.department_note,
  restrictToAssigned: Boolean(row.restrict_to_assigned),
  mustChangePassword: Boolean(row.must_change_password),
  lastLoginAt: toIso(row.last_login_at),
  lastActiveAt: toIso(row.last_active_at),
  createdAt: toIso(row.created_at),
});

function uniqueUsername(base) {
  const clean = String(base || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 24) || 'user';
  let candidate = clean;
  let i = 1;
  while (db.get('SELECT id FROM users WHERE username = ?', candidate)) {
    candidate = `${clean}${i}`;
    i += 1;
  }
  return candidate;
}

function temporaryPassword() {
  const words = ['atlas', 'prism', 'quartz', 'meridian', 'lumen', 'vector'];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}-${randomToken(3)}${Math.floor(Math.random() * 90 + 10)}`;
}

function createEmployeeAccount({ fullName, email: mail, username, password, accountType, departmentNote, restrictToAssigned, createdBy }) {
  const type = accountType === 'candidate' ? 'candidate' : 'employee';
  const code = nextAccountCode(type);
  const pass = password || temporaryPassword();
  const problem = passwordProblem(pass);
  if (problem) throw new HttpError(400, problem);

  const finalUsername = uniqueUsername(username || mail.split('@')[0]);
  const existingEmail = db.get('SELECT id FROM users WHERE email = ?', mail);
  if (existingEmail) throw new HttpError(409, 'An account with that email already exists.');

  const result = db.run(
    `INSERT INTO users (employee_code, full_name, email, username, password_hash, role, account_type, status,
                        department_note, must_change_password, restrict_to_assigned, created_by)
     VALUES (?, ?, ?, ?, ?, 'employee', ?, 'active', ?, 1, ?, ?)`,
    code,
    fullName,
    mail,
    finalUsername,
    hashPassword(pass),
    type,
    departmentNote || null,
    type === 'candidate' ? (restrictToAssigned ? 1 : 0) : 0,
    createdBy
  );

  return {
    id: Number(result.lastInsertRowid),
    code,
    fullName,
    email: mail,
    username: finalUsername,
    password: pass,
    accountType: type,
  };
}

/* ───────────────────────── overview ───────────────────────── */

router.get('/overview', (_req, res) => {
  const count = (sql, ...params) => db.get(sql, ...params).count;

  const employees = count("SELECT COUNT(*) AS count FROM users WHERE role = 'employee' AND account_type = 'employee' AND status = 'active'");
  const candidates = count("SELECT COUNT(*) AS count FROM users WHERE role = 'employee' AND account_type = 'candidate' AND status = 'active'");
  const admins = count("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'");
  const pendingReview = count("SELECT COUNT(*) AS count FROM assessment_attempts WHERE status = 'submitted' AND review_status = 'pending'");
  const unreleased = count("SELECT COUNT(*) AS count FROM assessment_attempts WHERE status != 'in_progress' AND is_released = 0");
  const newApplications = count("SELECT COUNT(*) AS count FROM job_applications WHERE status = 'New'");
  const unreadMessages = count("SELECT COUNT(*) AS count FROM contact_messages WHERE status = 'unread'");
  const publishedJobs = count("SELECT COUNT(*) AS count FROM jobs WHERE status = 'published'");
  const publishedAssessments = count("SELECT COUNT(*) AS count FROM assessments WHERE status = 'published'");
  const activeProjects = count("SELECT COUNT(*) AS count FROM projects WHERE status = 'active'");
  const openFeedback = count("SELECT COUNT(*) AS count FROM employee_feedback WHERE status IN ('New','Under Review')");

  const avg = db.get(
    "SELECT AVG(percentage) AS value FROM assessment_attempts WHERE status IN ('submitted','expired') AND percentage IS NOT NULL"
  );
  const passRate = db.get(
    "SELECT SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS passed, COUNT(*) AS total FROM assessment_attempts WHERE status IN ('submitted','expired') AND is_released = 1"
  );

  const pipeline = db.all(
    `SELECT status, COUNT(*) AS count FROM job_applications GROUP BY status`
  );
  const readiness = db.all(
    `SELECT readiness_status AS status, COUNT(*) AS count FROM employee_project_readiness GROUP BY readiness_status`
  );

  const activitySeries = [];
  for (let i = 13; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const attempts = db.get(
      "SELECT COUNT(*) AS count FROM assessment_attempts WHERE date(submitted_at) = ?",
      day
    ).count;
    const events = db.get(
      'SELECT COUNT(*) AS count FROM portal_activity_logs WHERE date(created_at) = ?',
      day
    ).count;
    activitySeries.push({ day, attempts, events });
  }

  res.json({
    kpis: {
      activeEmployees: employees,
      candidates,
      admins,
      pendingReview,
      unreleased,
      newApplications,
      unreadMessages,
      publishedJobs,
      publishedAssessments,
      activeProjects,
      openFeedback,
      averagePercentage: avg.value ? Math.round(avg.value * 10) / 10 : null,
      passRate: passRate.total ? Math.round((passRate.passed / passRate.total) * 1000) / 10 : null,
    },
    pipeline,
    readiness,
    activitySeries,
    pendingAttempts: db.all(
      `SELECT a.id, a.percentage, a.status_detail, a.submitted_at AS submittedAt,
              u.full_name AS employeeName, u.employee_code AS employeeCode, s.title
         FROM assessment_attempts a JOIN users u ON u.id = a.user_id JOIN assessments s ON s.id = a.assessment_id
        WHERE a.requires_manual_review = 1 AND a.review_status = 'pending'
        ORDER BY datetime(a.submitted_at) DESC LIMIT 6`
    ).map((r) => ({ ...r, submittedAt: toIso(r.submittedAt) })),
    recentActivity: db.all(
      `SELECT admin_identity AS identity, action, summary, created_at AS createdAt FROM audit_logs
        ORDER BY datetime(created_at) DESC LIMIT 8`
    ).map((r) => ({ ...r, createdAt: toIso(r.createdAt) })),
    upcoming: db.all(
      `SELECT s.id, s.title, s.available_from AS availableFrom, s.available_until AS availableUntil,
              (SELECT COUNT(*) FROM exam_assignments e WHERE e.assessment_id = s.id) AS assigned
         FROM assessments s WHERE s.status = 'published' ORDER BY datetime(s.created_at) DESC LIMIT 5`
    ).map((r) => ({ ...r, availableFrom: toIso(r.availableFrom), availableUntil: toIso(r.availableUntil) })),
  });
});

/* ───────────────────────── people ───────────────────────── */

router.get('/employees', (req, res) => {
  const type = req.query.type === 'candidate' ? 'candidate' : req.query.type === 'admin' ? 'admin' : 'employee';
  const search = `%${String(req.query.search || '').trim().toLowerCase()}%`;
  const status = req.query.status;

  const rows = db.all(
    `SELECT * FROM users
      WHERE ${type === 'admin' ? "role = 'admin'" : "role = 'employee' AND account_type = ?"}
        AND status != 'deleted'
        ${status && status !== 'all' ? 'AND status = ?' : ''}
        AND (LOWER(full_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(username) LIKE ? OR LOWER(employee_code) LIKE ?)
      ORDER BY datetime(created_at) DESC`,
    ...(type === 'admin' ? [] : [type]),
    ...(status && status !== 'all' ? [status] : []),
    search,
    search,
    search,
    search
  );

  res.json({
    people: rows.map((row) => ({
      ...serializeUser(row),
      assignedAssessments: db.get(
        'SELECT COUNT(*) AS count FROM exam_assignments WHERE user_id = ?',
        row.id
      ).count,
      attempts: db.get('SELECT COUNT(*) AS count FROM assessment_attempts WHERE user_id = ?', row.id).count,
      averagePercentage: db.get(
        "SELECT ROUND(AVG(percentage), 1) AS value FROM assessment_attempts WHERE user_id = ? AND status != 'in_progress' AND is_released = 1",
        row.id
      ).value,
      readinessStatus: db.get(
        "SELECT COUNT(*) AS count FROM employee_project_readiness WHERE user_id = ? AND readiness_status = 'approved'",
        row.id
      ).count,
    })),
    counts: {
      employee: db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'employee' AND account_type = 'employee' AND status = 'active'").count,
      candidate: db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'employee' AND account_type = 'candidate' AND status = 'active'").count,
      admin: db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").count,
    },
  });
});

router.get('/employees/:id', (req, res) => {
  const row = db.get("SELECT * FROM users WHERE id = ? AND status != 'deleted'", req.params.id);
  if (!row) throw new HttpError(404, 'Account not found.');

  res.json({
    person: {
      ...serializeUser(row),
      assignments: db.all(
        `SELECT e.assessment_id AS id, a.title, a.domain, e.created_at AS assignedAt
           FROM exam_assignments e JOIN assessments a ON a.id = e.assessment_id WHERE e.user_id = ?`,
        row.id
      ).map((r) => ({ ...r, assignedAt: toIso(r.assignedAt) })),
      attempts: db.all(
        `SELECT at.id, at.status, at.percentage, at.is_released AS released, at.submitted_at AS submittedAt,
                s.title, s.id AS assessmentId
           FROM assessment_attempts at JOIN assessments s ON s.id = at.assessment_id
          WHERE at.user_id = ? ORDER BY datetime(at.started_at) DESC`,
        row.id
      ).map((r) => ({ ...r, released: Boolean(r.released), submittedAt: toIso(r.submittedAt) })),
      readiness: db.all(
        `SELECT r.project_id AS projectId, p.name, r.readiness_status AS status, r.updated_at AS updatedAt
           FROM employee_project_readiness r JOIN projects p ON p.id = r.project_id WHERE r.user_id = ?`,
        row.id
      ).map((r) => ({ ...r, updatedAt: toIso(r.updatedAt) })),
      guidelineProgress: db.all(
        `SELECT g.id, g.title, g.version, r.acknowledged, r.version AS readVersion, r.seconds_spent AS secondsSpent
           FROM guidelines g LEFT JOIN guideline_reads r ON r.guideline_id = g.id AND r.user_id = ?
          WHERE g.status = 'published'`,
        row.id
      ).map((g) => ({
        ...g,
        acknowledged: Boolean(g.acknowledged) && g.readVersion === g.version,
        needsReview: g.readVersion != null && g.readVersion !== g.version,
      })),
    },
  });
});

router.post('/employees', asyncRoute((req, res) => {
  const fullName = str(req.body.fullName, { field: 'Full name', max: 120, min: 2 });
  const mail = email(req.body.email);
  const accountType = req.body.accountType === 'candidate' ? 'candidate' : 'employee';
  const departmentNote = optionalStr(req.body.departmentNote, 160);
  const account = createEmployeeAccount({
    fullName,
    email: mail,
    username: req.body.username,
    password: req.body.password,
    accountType,
    departmentNote,
    restrictToAssigned: bool(req.body.restrictToAssigned, accountType === 'candidate'),
    createdBy: req.user.id,
  });

  const assessmentIds = Array.isArray(req.body.assessmentIds) ? req.body.assessmentIds.map(Number) : [];
  for (const id of assessmentIds) {
    db.run(
      'INSERT OR IGNORE INTO exam_assignments (assessment_id, user_id, assigned_by_identity) VALUES (?, ?, ?)',
      id,
      account.id,
      adminIdentity(req.user)
    );
  }

  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: account.id,
    summary: `Created ${accountType} account ${account.code} for ${fullName}.`,
  });
  res.status(201).json({ account });
}));

router.post('/employees/bulk', asyncRoute((req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 200) : [];
  if (!rows.length) throw new HttpError(400, 'Add at least one row to import.');
  const accountType = req.body.accountType === 'candidate' ? 'candidate' : 'employee';
  const assessmentIds = Array.isArray(req.body.assessmentIds) ? req.body.assessmentIds.map(Number) : [];
  const created = [];
  const failed = [];

  for (const [index, row] of rows.entries()) {
    try {
      const fullName = str(row.fullName ?? row.name, { field: `Row ${index + 1} name`, max: 120, min: 2 });
      const mail = email(row.email);
      const account = createEmployeeAccount({
        fullName,
        email: mail,
        username: row.username,
        password: row.password,
        accountType,
        departmentNote: optionalStr(row.departmentNote ?? row.department, 160),
        restrictToAssigned: accountType === 'candidate',
        createdBy: req.user.id,
      });
      for (const id of assessmentIds) {
        db.run(
          'INSERT OR IGNORE INTO exam_assignments (assessment_id, user_id, assigned_by_identity) VALUES (?, ?, ?)',
          id,
          account.id,
          adminIdentity(req.user)
        );
      }
      created.push(account);
    } catch (error) {
      failed.push({ row: index + 1, email: row.email || '', error: error.message });
    }
  }

  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'USER_BULK_CREATED',
    entityType: 'user',
    summary: `Bulk created ${created.length} ${accountType} accounts (${failed.length} failed).`,
  });
  res.status(201).json({ created, failed });
}));

router.patch('/employees/:id', asyncRoute((req, res) => {
  const row = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!row) throw new HttpError(404, 'Account not found.');
  if (row.role === 'admin' && req.user.id !== row.id) {
    throw new HttpError(403, 'Administrator profiles are managed in the admin directory.');
  }

  const fullName = req.body.fullName ? str(req.body.fullName, { field: 'Full name', max: 120, min: 2 }) : row.full_name;
  const mail = req.body.email ? email(req.body.email) : row.email;
  const departmentNote = req.body.departmentNote !== undefined ? optionalStr(req.body.departmentNote, 160) : row.department_note;
  const restrict = req.body.restrictToAssigned !== undefined ? bool(req.body.restrictToAssigned) : Boolean(row.restrict_to_assigned);

  const clash = db.get('SELECT id FROM users WHERE email = ? AND id != ?', mail, row.id);
  if (clash) throw new HttpError(409, 'Another account already uses that email.');

  db.run(
    `UPDATE users SET full_name = ?, email = ?, department_note = ?, restrict_to_assigned = ?, updated_at = datetime('now')
      WHERE id = ?`,
    fullName,
    mail,
    departmentNote || null,
    restrict ? 1 : 0,
    row.id
  );
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: row.id,
    summary: `Updated profile for ${row.full_name}.`,
    before: { fullName: row.full_name, email: row.email },
    after: { fullName, email: mail },
  });
  res.json({ ok: true });
}));

router.post('/employees/:id/status', asyncRoute((req, res) => {
  const row = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!row) throw new HttpError(404, 'Account not found.');
  if (row.id === req.user.id) throw new HttpError(400, 'You cannot change your own account status.');
  if (row.role === 'admin') throw new HttpError(403, 'Use the admin directory to manage administrators.');

  const status = req.body.status === 'deactivated' ? 'deactivated' : 'active';
  db.run("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?", status, row.id);
  if (status === 'deactivated') db.run('DELETE FROM sessions WHERE user_id = ?', row.id);

  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: status === 'active' ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
    entityType: 'user',
    entityId: row.id,
    summary: `${status === 'active' ? 'Reactivated' : 'Deactivated'} ${row.full_name} (${row.employee_code}).`,
  });
  res.json({ ok: true, status });
}));

router.post('/employees/:id/reset-password', asyncRoute((req, res) => {
  const row = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!row) throw new HttpError(404, 'Account not found.');
  const password = temporaryPassword();
  db.run(
    "UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?",
    hashPassword(password),
    row.id
  );
  db.run('DELETE FROM sessions WHERE user_id = ?', row.id);
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'PASSWORD_RESET',
    entityType: 'user',
    entityId: row.id,
    summary: `Issued a one-time password for ${row.full_name} (${row.employee_code}).`,
  });
  res.json({ ok: true, username: row.username, password });
}));

router.delete('/employees/:id', asyncRoute((req, res) => {
  const row = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!row) throw new HttpError(404, 'Account not found.');
  if (row.role === 'admin') throw new HttpError(403, 'Administrators cannot be deleted from this endpoint.');

  db.run(
    "UPDATE users SET status = 'deleted', deleted_at = datetime('now'), email = ?, username = ? WHERE id = ?",
    `${row.email}.deleted.${Date.now()}`,
    `${row.username}.deleted.${Date.now()}`,
    row.id
  );
  db.run('DELETE FROM sessions WHERE user_id = ?', row.id);
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'USER_DELETED',
    entityType: 'user',
    entityId: row.id,
    summary: `Removed account ${row.employee_code} (${row.full_name}).`,
  });
  res.json({ ok: true });
}));

router.post('/employees/:id/promote', asyncRoute((req, res) => {
  const row = db.get("SELECT * FROM users WHERE id = ? AND account_type = 'candidate'", req.params.id);
  if (!row) throw new HttpError(404, 'Candidate account not found.');

  db.run(
    `UPDATE users SET account_type = 'employee', restrict_to_assigned = 0, department_note = ?, updated_at = datetime('now')
      WHERE id = ?`,
    optionalStr(req.body.departmentNote, 160) || 'Evaluator · newly onboarded',
    row.id
  );
  db.run(
    `INSERT INTO notifications (user_id, notification_type, title, message, link_path)
     VALUES (?, 'account', 'Welcome to the employee workspace', 'Your candidate account has been upgraded. Guidelines and readiness tracking are now available.', '/portal')`,
    row.id
  );
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'CANDIDATE_PROMOTED',
    entityType: 'user',
    entityId: row.id,
    summary: `Promoted ${row.full_name} (${row.employee_code}) to employee.`,
  });
  res.json({ ok: true });
}));

router.put('/employees/:id/assignments', asyncRoute((req, res) => {
  const row = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!row) throw new HttpError(404, 'Account not found.');
  const ids = Array.isArray(req.body.assessmentIds) ? req.body.assessmentIds.map(Number) : [];

  db.tx(() => {
    db.run('DELETE FROM exam_assignments WHERE user_id = ?', row.id);
    for (const id of ids) {
      db.run(
        'INSERT OR IGNORE INTO exam_assignments (assessment_id, user_id, assigned_by_identity) VALUES (?, ?, ?)',
        id,
        row.id,
        adminIdentity(req.user)
      );
    }
  });
  res.json({ ok: true, assigned: ids.length });
}));

/* ───────────────────────── jobs ───────────────────────── */

router.get('/jobs', (_req, res) => {
  res.json({
    jobs: db.all('SELECT * FROM jobs ORDER BY datetime(created_at) DESC').map((job) => ({
      id: job.id,
      title: job.title,
      domain: job.domain,
      employmentType: job.employment_type,
      workMode: job.work_mode,
      location: job.location_note,
      description: job.description,
      responsibilities: job.responsibilities,
      qualifications: job.qualifications,
      skills: job.skills,
      status: job.status,
      createdAt: toIso(job.created_at),
      applications: db.get('SELECT COUNT(*) AS count FROM job_applications WHERE job_id = ?', job.id).count,
    })),
  });
});

function jobPayload(body) {
  return {
    title: str(body.title, { field: 'Title', max: 160, min: 3 }),
    domain: optionalStr(body.domain, 120) || 'Evaluation',
    employmentType: optionalStr(body.employmentType, 120) || 'Contract',
    workMode: optionalStr(body.workMode, 60) || 'Remote',
    location: optionalStr(body.location, 160) || 'Remote · India',
    description: str(body.description, { field: 'Description', max: 4000, min: 20 }),
    responsibilities: optionalStr(body.responsibilities, 3000),
    qualifications: optionalStr(body.qualifications, 3000),
    skills: optionalStr(body.skills, 1000),
    status: ['draft', 'published', 'closed'].includes(body.status) ? body.status : 'draft',
  };
}

router.post('/jobs', asyncRoute((req, res) => {
  const job = jobPayload(req.body);
  const result = db.run(
    `INSERT INTO jobs (title, domain, employment_type, work_mode, location_note, description, responsibilities, qualifications, skills, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    job.title, job.domain, job.employmentType, job.workMode, job.location, job.description,
    job.responsibilities, job.qualifications, job.skills, job.status, req.user.id
  );
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'JOB_CREATED',
    entityType: 'job',
    entityId: result.lastInsertRowid,
    summary: `Created role “${job.title}” (${job.status}).`,
  });
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

router.patch('/jobs/:id', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM jobs WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Role not found.');
  const job = jobPayload(req.body);
  db.run(
    `UPDATE jobs SET title = ?, domain = ?, employment_type = ?, work_mode = ?, location_note = ?, description = ?,
       responsibilities = ?, qualifications = ?, skills = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
    job.title, job.domain, job.employmentType, job.workMode, job.location, job.description,
    job.responsibilities, job.qualifications, job.skills, job.status, existing.id
  );
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'JOB_UPDATED',
    entityType: 'job',
    entityId: existing.id,
    summary: `Updated role “${job.title}”.`,
  });
  res.json({ ok: true });
}));

router.delete('/jobs/:id', asyncRoute((req, res) => {
  const existing = db.get('SELECT * FROM jobs WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'Role not found.');
  db.run("UPDATE jobs SET status = 'closed', updated_at = datetime('now') WHERE id = ?", existing.id);
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'JOB_CLOSED',
    entityType: 'job',
    entityId: existing.id,
    summary: `Closed role “${existing.title}”.`,
  });
  res.json({ ok: true });
}));

/* ───────────────────────── applications ───────────────────────── */

router.get('/applications', (req, res) => {
  const status = req.query.status;
  const search = `%${String(req.query.search || '').trim().toLowerCase()}%`;
  const rows = db.all(
    `SELECT * FROM job_applications
      WHERE 1 = 1
        ${status && status !== 'all' ? 'AND status = ?' : ''}
        AND (LOWER(full_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(position_title) LIKE ?)
      ORDER BY datetime(created_at) DESC`,
    ...(status && status !== 'all' ? [status] : []),
    search, search, search
  );

  res.json({
    applications: rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      position: row.position_title,
      general: Boolean(row.is_general),
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      location: row.location,
      portfolioUrl: row.portfolio_url,
      educationExperience: row.education_experience,
      coverLetter: row.cover_letter,
      resume: { name: row.resume_original_name, size: row.resume_size_bytes, mime: row.resume_mime_type },
      status: row.status,
      notes: row.admin_notes,
      candidateUserId: row.candidate_user_id,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    })),
    counts: Object.fromEntries(
      ['New', 'Under Review', 'Shortlisted', 'Selected', 'Rejected'].map((s) => [
        s,
        db.get('SELECT COUNT(*) AS count FROM job_applications WHERE status = ?', s).count,
      ])
    ),
  });
});

router.get('/applications/:id/resume', (req, res) => {
  const row = db.get('SELECT * FROM job_applications WHERE id = ?', req.params.id);
  if (!row?.resume_stored_name) throw new HttpError(404, 'Resume not found.');
  const filePath = path.join(RESUME_DIR, path.basename(row.resume_stored_name));
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'Resume file is missing from storage.');
  res.setHeader('Content-Type', row.resume_mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.resume_original_name)}"`);
  fs.createReadStream(filePath).pipe(res);
});

router.patch('/applications/:id', asyncRoute((req, res) => {
  const row = db.get('SELECT * FROM job_applications WHERE id = ?', req.params.id);
  if (!row) throw new HttpError(404, 'Application not found.');
  const status = ['New', 'Under Review', 'Shortlisted', 'Selected', 'Rejected'].includes(req.body.status)
    ? req.body.status
    : row.status;
  const notes = req.body.adminNotes !== undefined ? optionalStr(req.body.adminNotes, 3000) : row.admin_notes;

  db.run(
    "UPDATE job_applications SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?",
    status,
    notes,
    row.id
  );
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'APPLICATION_UPDATED',
    entityType: 'application',
    entityId: row.id,
    summary: `Moved ${row.full_name}'s application to ${status}.`,
  });
  res.json({ ok: true, status });
}));

router.post('/applications/:id/issue-login', asyncRoute((req, res) => {
  const application = db.get('SELECT * FROM job_applications WHERE id = ?', req.params.id);
  if (!application) throw new HttpError(404, 'Application not found.');
  if (application.candidate_user_id) {
    const existing = db.get('SELECT username FROM users WHERE id = ?', application.candidate_user_id);
    throw new HttpError(409, `This candidate already has an exam account (${existing?.username || 'unknown'}).`);
  }

  const account = createEmployeeAccount({
    fullName: application.full_name,
    email: application.email,
    username: req.body.username || application.email.split('@')[0],
    accountType: 'candidate',
    departmentNote: `Candidate · ${application.position_title}`,
    restrictToAssigned: true,
    createdBy: req.user.id,
  });

  db.run(
    `UPDATE job_applications SET candidate_user_id = ?, status = 'Shortlisted', updated_at = datetime('now') WHERE id = ?`,
    account.id,
    application.id
  );

  const assessmentIds = Array.isArray(req.body.assessmentIds) ? req.body.assessmentIds.map(Number) : [];
  for (const id of assessmentIds) {
    db.run(
      'INSERT OR IGNORE INTO exam_assignments (assessment_id, user_id, assigned_by_identity) VALUES (?, ?, ?)',
      id,
      account.id,
      adminIdentity(req.user)
    );
  }

  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'CANDIDATE_LOGIN_ISSUED',
    entityType: 'application',
    entityId: application.id,
    summary: `Issued exam credentials for ${application.full_name} (${account.code}).`,
  });

  res.status(201).json({ account });
}));

/* ───────────────────────── messages ───────────────────────── */

router.get('/messages', (_req, res) => {
  res.json({
    messages: db.all('SELECT * FROM contact_messages ORDER BY datetime(created_at) DESC').map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      company: row.company,
      topic: row.topic,
      subject: row.subject,
      message: row.message,
      status: row.status,
      createdAt: toIso(row.created_at),
    })),
  });
});

router.patch('/messages/:id', asyncRoute((req, res) => {
  const row = db.get('SELECT * FROM contact_messages WHERE id = ?', req.params.id);
  if (!row) throw new HttpError(404, 'Message not found.');
  const status = ['unread', 'read', 'archived'].includes(req.body.status) ? req.body.status : 'read';
  db.run(
    "UPDATE contact_messages SET status = ?, updated_at = datetime('now') WHERE id = ?",
    status,
    row.id
  );
  res.json({ ok: true, status });
}));

/* ───────────────────────── company settings ───────────────────────── */

const PUBLIC_KEYS = [
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

router.get('/settings', (_req, res) => {
  const settings = getSettings();
  res.json({
    settings: Object.fromEntries(PUBLIC_KEYS.map((key) => [key, settings[key] ?? DEFAULT_SETTINGS[key] ?? ''])),
  });
});

router.put('/settings', asyncRoute((req, res) => {
  const incoming = req.body.settings && typeof req.body.settings === 'object' ? req.body.settings : req.body;
  let changed = 0;
  for (const key of PUBLIC_KEYS) {
    if (incoming[key] === undefined) continue;
    setSetting(key, optionalStr(incoming[key], 5000), req.user.id);
    changed += 1;
  }
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'SETTINGS_UPDATED',
    entityType: 'settings',
    summary: `Updated ${changed} company setting${changed === 1 ? '' : 's'}.`,
  });
  res.json({ ok: true, changed });
}));

/* ───────────────────────── activity ───────────────────────── */

router.get('/activity', (req, res) => {
  const audit = db.all(
    `SELECT id, admin_identity AS identity, action, entity_type AS entityType, entity_id AS entityId,
            summary, created_at AS createdAt FROM audit_logs ORDER BY datetime(created_at) DESC LIMIT 120`
  ).map((r) => ({ ...r, createdAt: toIso(r.createdAt) }));

  const portal = db.all(
    `SELECT id, user_identity AS identity, event_type AS eventType, area, detail, created_at AS createdAt
       FROM portal_activity_logs ORDER BY datetime(created_at) DESC LIMIT 120`
  ).map((r) => ({ ...r, createdAt: toIso(r.createdAt) }));

  res.json({ audit, portal });
});

/* ───────────────────────── administrators ───────────────────────── */

router.get('/admins', (req, res) => {
  res.json({
    admins: db.all(
      `SELECT * FROM users WHERE role = 'admin' AND status != 'deleted' ORDER BY datetime(created_at) ASC`
    ).map((row) => ({ ...serializeUser(row), isSelf: row.id === req.user.id })),
  });
});

router.post('/admins', asyncRoute((req, res) => {
  const fullName = str(req.body.fullName, { field: 'Full name', max: 120, min: 2 });
  const mail = email(req.body.email);
  const username = uniqueUsername(req.body.username || mail.split('@')[0]);
  const password = str(req.body.password, { field: 'Password', max: 200, min: 8 });
  const problem = passwordProblem(password);
  if (problem) throw new HttpError(400, problem);
  if (db.get('SELECT id FROM users WHERE email = ?', mail)) throw new HttpError(409, 'That email is already in use.');

  const code = nextAccountCode('admin');
  const result = db.run(
    `INSERT INTO users (employee_code, full_name, email, username, password_hash, role, account_type, status, must_change_password, created_by)
     VALUES (?, ?, ?, ?, ?, 'admin', 'admin', 'active', 1, ?)`,
    code, fullName, mail, username, hashPassword(password), req.user.id
  );
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'ADMIN_CREATED',
    entityType: 'admin',
    entityId: result.lastInsertRowid,
    summary: `Created administrator ${code} (${fullName}).`,
  });
  res.status(201).json({ account: { code, username, fullName, email: mail, password } });
}));

router.patch('/admins/:id', asyncRoute((req, res) => {
  const row = db.get("SELECT * FROM users WHERE id = ? AND role = 'admin'", req.params.id);
  if (!row) throw new HttpError(404, 'Administrator not found.');
  const fullName = req.body.fullName ? str(req.body.fullName, { field: 'Full name', max: 120, min: 2 }) : row.full_name;
  const mail = req.body.email ? email(req.body.email) : row.email;
  const clash = db.get('SELECT id FROM users WHERE email = ? AND id != ?', mail, row.id);
  if (clash) throw new HttpError(409, 'Another account already uses that email.');
  db.run(
    "UPDATE users SET full_name = ?, email = ?, updated_at = datetime('now') WHERE id = ?",
    fullName, mail, row.id
  );
  res.json({ ok: true });
}));

router.post('/admins/:id/status', asyncRoute((req, res) => {
  const row = db.get("SELECT * FROM users WHERE id = ? AND role = 'admin'", req.params.id);
  if (!row) throw new HttpError(404, 'Administrator not found.');
  if (row.id === req.user.id) throw new HttpError(400, 'You cannot deactivate your own account.');

  const status = req.body.status === 'deactivated' ? 'deactivated' : 'active';
  const activeAdmins = db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").count;
  if (status === 'deactivated' && activeAdmins <= 1) throw new HttpError(400, 'At least one active administrator is required.');

  db.run("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?", status, row.id);
  if (status === 'deactivated') db.run('DELETE FROM sessions WHERE user_id = ?', row.id);
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'ADMIN_STATUS_CHANGED',
    entityType: 'admin',
    entityId: row.id,
    summary: `${status === 'active' ? 'Reactivated' : 'Deactivated'} administrator ${row.full_name}.`,
  });
  res.json({ ok: true, status });
}));

router.post('/admins/:id/reset-password', asyncRoute((req, res) => {
  const row = db.get("SELECT * FROM users WHERE id = ? AND role = 'admin'", req.params.id);
  if (!row) throw new HttpError(404, 'Administrator not found.');
  const password = temporaryPassword();
  db.run(
    "UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?",
    hashPassword(password),
    row.id
  );
  db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', row.id, req.user.sessionId);
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'ADMIN_PASSWORD_RESET',
    entityType: 'admin',
    entityId: row.id,
    summary: `Reset password for administrator ${row.full_name}.`,
  });
  res.json({ ok: true, username: row.username, password });
}));

router.delete('/admins/:id', asyncRoute((req, res) => {
  const row = db.get("SELECT * FROM users WHERE id = ? AND role = 'admin'", req.params.id);
  if (!row) throw new HttpError(404, 'Administrator not found.');
  if (row.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account.');
  const activeAdmins = db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").count;
  if (activeAdmins <= 1) throw new HttpError(400, 'At least one active administrator is required.');

  db.run(
    "UPDATE users SET status = 'deleted', deleted_at = datetime('now'), email = ?, username = ? WHERE id = ?",
    `${row.email}.deleted.${Date.now()}`,
    `${row.username}.deleted.${Date.now()}`,
    row.id
  );
  db.run('DELETE FROM sessions WHERE user_id = ?', row.id);
  recordAudit({
    adminId: req.user.id,
    adminIdentity: adminIdentity(req.user),
    action: 'ADMIN_DELETED',
    entityType: 'admin',
    entityId: row.id,
    summary: `Removed administrator ${row.full_name}.`,
  });
  res.json({ ok: true });
}));

export default router;
