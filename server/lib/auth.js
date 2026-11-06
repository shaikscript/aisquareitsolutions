import db from '../db/index.js';
import { randomToken } from './crypto.js';

export const SESSION_COOKIE = 'aisq_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const TOKEN_RE = /^[a-f0-9]{64}$/i;

function candidates(req) {
  const out = [];
  const push = (raw) => {
    if (typeof raw !== 'string') return;
    const token = raw.trim();
    if (!TOKEN_RE.test(token) || out.includes(token)) return;
    out.push(token);
  };

  const header = req.headers['x-aisquare-session'];
  if (Array.isArray(header)) header.forEach(push);
  else push(header);

  push(req.query?._sid);
  push(req.query?.sid);

  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) push(auth.slice(7));

  push(req.cookies?.[SESSION_COOKIE]);
  return out;
}

export function attachUser(req, _res, next) {
  req.user = null;
  const tokens = candidates(req);
  if (!tokens.length) return next();

  const statement = `
    SELECT s.id AS session_id, s.expires_at,
           u.id, u.employee_code, u.full_name, u.email, u.username, u.role, u.account_type,
           u.status, u.department_note, u.must_change_password, u.restrict_to_assigned,
           u.last_login_at, u.last_active_at, u.created_at
      FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now')`;

  let row = null;
  for (const token of tokens) {
    const found = db.get(statement, token);
    if (!found) continue;
    if (found.status !== 'active') {
      db.run('DELETE FROM sessions WHERE user_id = ?', found.id);
      continue;
    }
    row = found;
    break;
  }

  if (!row) return next();

  db.run("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?", row.session_id);
  db.run("UPDATE users SET last_active_at = datetime('now') WHERE id = ?", row.id);

  req.user = {
    id: row.id,
    sessionId: row.session_id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    email: row.email,
    username: row.username,
    role: row.role,
    accountType: row.role === 'admin' ? 'admin' : row.account_type || 'employee',
    status: row.status,
    departmentNote: row.department_note,
    mustChangePassword: Boolean(row.must_change_password),
    restrictToAssigned: Boolean(row.restrict_to_assigned),
    lastLoginAt: row.last_login_at,
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
  };
  return next();
}

export function createSession(req, res, user) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  db.run(
    `INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    token,
    user.id,
    req.ip || null,
    String(req.headers['user-agent'] || '').slice(0, 300),
    expires.toISOString().replace('T', ' ').slice(0, 19)
  );
  db.run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", user.id);

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });

  return token;
}

export function destroySession(req, res) {
  if (req.user?.sessionId) db.run('DELETE FROM sessions WHERE id = ?', req.user.sessionId);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in to continue.', code: 'UNAUTHENTICATED' });
  }
  return next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in to continue.', code: 'UNAUTHENTICATED' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'This area is restricted to workspace administrators.', code: 'FORBIDDEN' });
  }
  return next();
}

export function requireEmployee(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in to continue.', code: 'UNAUTHENTICATED' });
  }
  if (req.user.role === 'admin' || req.user.accountType !== 'employee') {
    return res.status(403).json({ error: 'This area is for employee accounts.', code: 'FORBIDDEN' });
  }
  return next();
}

export function requireAnyEmployee(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in to continue.', code: 'UNAUTHENTICATED' });
  }
  if (req.user.role === 'admin') {
    return res.status(403).json({ error: 'This area is for employee or candidate accounts.', code: 'FORBIDDEN' });
  }
  return next();
}

/* Simple in-memory brute-force guard for credential endpoints. */
const attempts = new Map();

export function throttle(key, { limit = 8, windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.start > windowMs) {
    attempts.set(key, { count: 1, start: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export function clearThrottle(key) {
  attempts.delete(key);
}
