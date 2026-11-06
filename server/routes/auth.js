import express from 'express';
import db from '../db/index.js';
import { hashPassword, verifyPassword, passwordProblem } from '../lib/crypto.js';
import {
  createSession,
  destroySession,
  requireAuth,
  throttle,
  clearThrottle,
} from '../lib/auth.js';
import { str, email, HttpError, asyncRoute } from '../lib/validate.js';

const router = express.Router();

const publicUser = (user) => ({
  id: user.id,
  code: user.employeeCode,
  fullName: user.fullName,
  email: user.email,
  username: user.username,
  role: user.role,
  accountType: user.accountType,
  status: user.status,
  departmentNote: user.departmentNote,
  mustChangePassword: user.mustChangePassword,
  restrictToAssigned: user.restrictToAssigned,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  homePath: user.role === 'admin' ? '/admin' : user.accountType === 'candidate' ? '/exam-portal' : '/portal',
});

function findByIdentifier(identifier) {
  return db.get(
    'SELECT * FROM users WHERE status != ? AND (LOWER(username) = ? OR LOWER(email) = ?)',
    'deleted',
    identifier.toLowerCase(),
    identifier.toLowerCase()
  );
}

async function login(req, res, { scope }) {
  const identifier = str(req.body.identifier, { field: 'Username or email', max: 200, min: 2 });
  const password = str(req.body.password, { field: 'Password', max: 200, min: 1 });
  const key = `${scope}:${req.ip}:${identifier.toLowerCase()}`;

  if (!throttle(key)) {
    throw new HttpError(429, 'Too many sign-in attempts. Wait a few minutes and try again.');
  }

  const user = findByIdentifier(identifier);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, 'Those credentials do not match an account.');
  }
  if (user.status !== 'active') {
    throw new HttpError(403, 'This account is not active. Contact your workspace administrator.');
  }

  const isAdmin = user.role === 'admin';
  const accountType = isAdmin ? 'admin' : user.account_type || 'employee';

  if (scope === 'admin' && !isAdmin) throw new HttpError(403, 'This sign-in is for administrators. Use the employee or candidate gateway.');
  if (scope === 'employee' && (isAdmin || accountType !== 'employee')) throw new HttpError(403, 'This sign-in is for employee accounts. Use the candidate exam gateway.');
  if (scope === 'candidate' && (isAdmin || accountType !== 'candidate')) throw new HttpError(403, 'This sign-in is for candidate exam accounts.');

  clearThrottle(key);
  const token = createSession(req, res, user);

  const profile = db.get(
    `SELECT id, employee_code AS employeeCode, full_name AS fullName, email, username, role, account_type AS accountType,
            status, department_note AS departmentNote, must_change_password AS mustChangePassword,
            restrict_to_assigned AS restrictToAssigned, last_login_at AS lastLoginAt, created_at AS createdAt
       FROM users WHERE id = ?`,
    user.id
  );

  req.user = {
    ...profile,
    mustChangePassword: Boolean(profile.mustChangePassword),
    restrictToAssigned: Boolean(profile.restrictToAssigned),
  };

  return res.json({ user: publicUser(req.user), token });
}

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  return res.json({ user: publicUser(req.user) });
});

router.get('/setup-status', (_req, res) => {
  const admins = db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status != 'deleted'");
  res.json({ needsBootstrap: admins.count === 0 });
});

router.post('/employee/login', asyncRoute((req, res) => login(req, res, { scope: 'employee' })));
router.post('/candidate/login', asyncRoute((req, res) => login(req, res, { scope: 'candidate' })));
router.post('/admin/login', asyncRoute((req, res) => login(req, res, { scope: 'admin' })));

router.post('/bootstrap-admin', asyncRoute((req, res) => {
  const admins = db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status != 'deleted'");
  if (admins.count > 0) throw new HttpError(403, 'This workspace already has an administrator.');

  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN || '';
  const provided = str(req.body.token, { field: 'Setup token', max: 300, min: 4 });
  if (expected && provided !== expected) throw new HttpError(403, 'That setup token is not valid.');

  const fullName = str(req.body.fullName, { field: 'Full name', max: 120, min: 2 });
  const mail = email(req.body.email);
  const username = str(req.body.username, { field: 'Username', max: 60, min: 3 }).toLowerCase();
  const password = str(req.body.password, { field: 'Password', max: 200, min: 8 });
  const problem = passwordProblem(password);
  if (problem) throw new HttpError(400, problem);

  const count = db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status != 'deleted'");
  const code = `ADM-${String(count.count + 1).padStart(4, '0')}`;
  const inserted = db.run(
    `INSERT INTO users (employee_code, full_name, email, username, password_hash, role, account_type, status)
     VALUES (?, ?, ?, ?, ?, 'admin', 'admin', 'active')`,
    code, fullName, mail, username, hashPassword(password)
  );
  const user = {
    id: Number(inserted.lastInsertRowid),
    employeeCode: code,
    fullName,
    email: mail,
    username,
    role: 'admin',
    accountType: 'admin',
    status: 'active',
    mustChangePassword: false,
    restrictToAssigned: false,
  };
  const token = createSession(req, res, user);
  res.status(201).json({ user: publicUser(user), token });
}));

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, asyncRoute((req, res) => {
  const current = str(req.body.currentPassword, { field: 'Current password', max: 200, min: 1 });
  const next = str(req.body.newPassword, { field: 'New password', max: 200, min: 8 });
  const problem = passwordProblem(next);
  if (problem) throw new HttpError(400, problem);

  const row = db.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(current, row.password_hash)) throw new HttpError(400, 'Your current password is incorrect.');
  if (current === next) throw new HttpError(400, 'Choose a password you have not used before.');

  db.run(
    'UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime(\'now\') WHERE id = ?',
    hashPassword(next),
    req.user.id
  );
  db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', req.user.id, req.user.sessionId);
  res.json({ ok: true });
}));

export default router;
