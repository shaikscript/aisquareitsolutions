import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(HERE, '../..');

export const DATA_DIR = process.env.AISQUARE_DATA_DIR
  ? path.resolve(process.env.AISQUARE_DATA_DIR)
  : path.join(ROOT_DIR, 'data');

export const STORAGE_DIR = process.env.AISQUARE_STORAGE_DIR
  ? path.resolve(process.env.AISQUARE_STORAGE_DIR)
  : path.join(ROOT_DIR, 'storage');

export const RESUME_DIR = path.join(STORAGE_DIR, 'resumes');
export const GUIDELINE_DIR = path.join(STORAGE_DIR, 'guidelines');
export const DB_PATH = path.join(DATA_DIR, 'aisquare.db');

for (const dir of [DATA_DIR, RESUME_DIR, GUIDELINE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const database = new DatabaseSync(DB_PATH);
database.exec('PRAGMA journal_mode = WAL;');
database.exec('PRAGMA foreign_keys = ON;');
database.exec(fs.readFileSync(path.join(HERE, 'schema.sql'), 'utf8'));

/** Tiny ergonomic wrapper so route code stays readable. */
export const db = {
  raw: database,
  all(sql, ...params) {
    return database.prepare(sql).all(...params);
  },
  get(sql, ...params) {
    return database.prepare(sql).get(...params) ?? null;
  },
  run(sql, ...params) {
    return database.prepare(sql).run(...params);
  },
  exec(sql) {
    database.exec(sql);
  },
  tx(fn) {
    database.exec('BEGIN');
    try {
      const result = fn();
      database.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        database.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    }
  },
};

/* ─────────────────────────── settings ─────────────────────────── */

export const DEFAULT_SETTINGS = {
  company_mission:
    'Give machines better judgement by placing rigorous human reasoning at the centre of every model we touch.',
  company_vision:
    'A world where AI systems are shaped by trained evaluators, transparent rubrics and measurable quality — not guesswork.',
  company_values_json: JSON.stringify([
    'Rubric before opinion',
    'Evidence over intuition',
    'Craft in every detail',
    'Respect for the people behind the data',
  ]),
  public_contact_email: 'hello@aisquare.work',
  public_contact_phone: '+91 40 4000 8181',
  public_office_address: 'AISQUARE Studio, HITEC City, Hyderabad, Telangana 500081, India',
  public_office_hours: 'Monday – Friday · 10:00 – 19:00 IST',
  public_map_link: 'https://maps.google.com/?q=HITEC+City+Hyderabad',
  public_map_lat: '17.4483',
  public_map_lng: '78.3915',
  privacy_contact_note:
    'Write to privacy@aisquare.work for data access, correction and deletion requests. We respond within 30 days.',
  public_linkedin: 'https://www.linkedin.com/company/aisquare-it-solutions',
  public_careers_note: 'Remote-first evaluation cohorts across India, with studio space in Hyderabad.',
  demo_mode: 'true',
};

export function getSettings() {
  const rows = db.all('SELECT key, value FROM company_settings');
  const map = { ...DEFAULT_SETTINGS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export function setSetting(key, value, updatedBy = null) {
  db.run(
    `INSERT INTO company_settings (key, value, updated_by, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
       updated_by = excluded.updated_by, updated_at = datetime('now')`,
    key,
    value == null ? null : String(value),
    updatedBy
  );
}

/* ─────────────────────────── telemetry ─────────────────────────── */

export function recordAudit({
  adminId = null,
  adminIdentity = 'System',
  action,
  entityType,
  entityId = null,
  summary,
  before = null,
  after = null,
}) {
  db.run(
    `INSERT INTO audit_logs (admin_id, admin_identity, action, entity_type, entity_id, summary, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    adminId,
    adminIdentity,
    action,
    entityType,
    entityId == null ? null : String(entityId),
    summary,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null
  );
}

export function recordActivity({ userId, identity, eventType, area = null, detail = null }) {
  db.run(
    `INSERT INTO portal_activity_logs (user_id, user_identity, event_type, area, detail)
     VALUES (?, ?, ?, ?, ?)`,
    userId,
    identity,
    eventType,
    area,
    detail
  );
}

export function notify({ userId, type, title, message, linkPath = null }) {
  db.run(
    `INSERT INTO notifications (user_id, notification_type, title, message, link_path)
     VALUES (?, ?, ?, ?, ?)`,
    userId,
    type,
    title,
    message,
    linkPath
  );
}

export function notifyMany(userIds, payload) {
  if (!userIds.length) return;
  db.tx(() => userIds.forEach((id) => notify({ userId: id, ...payload })));
}

export function notifyAllEmployees(payload) {
  const rows = db.all(
    `SELECT id FROM users
      WHERE status = 'active' AND role = 'employee' AND account_type = 'employee'`
  );
  notifyMany(rows.map((r) => r.id), payload);
}

export function nextAccountCode(type = 'employee') {
  const prefix = type === 'admin' ? 'ADM' : type === 'candidate' ? 'CND' : 'EMP';
  const rows = db.all('SELECT employee_code FROM users WHERE employee_code LIKE ?', `${prefix}-%`);
  let max = 0;
  for (const row of rows) {
    const num = Number.parseInt(String(row.employee_code).split('-')[1], 10);
    if (Number.isFinite(num) && num > max) max = num;
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

export function ensureSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = db.get('SELECT key FROM company_settings WHERE key = ?', key);
    if (!existing) setSetting(key, value);
  }
}

export default db;
