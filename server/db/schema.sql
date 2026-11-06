PRAGMA foreign_keys = ON;

/* ─────────────────────────── CORE ─────────────────────────── */

CREATE TABLE IF NOT EXISTS company_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code        TEXT UNIQUE NOT NULL,
  full_name            TEXT NOT NULL,
  email                TEXT UNIQUE NOT NULL,
  username             TEXT UNIQUE NOT NULL,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('employee', 'admin')),
  account_type         TEXT NOT NULL DEFAULT 'employee' CHECK (account_type IN ('employee', 'candidate', 'admin')),
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated', 'deleted')),
  department_note      TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  restrict_to_assigned INTEGER NOT NULL DEFAULT 0,
  source_application_id INTEGER,
  last_login_at        TEXT,
  last_active_at       TEXT,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at           TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, account_type, status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

/* ───────────────────────── PUBLIC WEBSITE ───────────────────────── */

CREATE TABLE IF NOT EXISTS jobs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  domain         TEXT,
  employment_type TEXT,
  work_mode      TEXT DEFAULT 'Remote',
  location_note  TEXT,
  description    TEXT NOT NULL,
  responsibilities TEXT,
  qualifications TEXT,
  skills         TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS job_applications (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id              INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  candidate_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  position_title      TEXT NOT NULL,
  is_general          INTEGER NOT NULL DEFAULT 0,
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT NOT NULL,
  location            TEXT,
  portfolio_url       TEXT,
  education_experience TEXT NOT NULL,
  cover_letter        TEXT,
  resume_original_name TEXT NOT NULL,
  resume_stored_name  TEXT NOT NULL,
  resume_mime_type    TEXT NOT NULL,
  resume_size_bytes   INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Under Review', 'Shortlisted', 'Selected', 'Rejected')),
  admin_notes         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON job_applications(status);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  company    TEXT,
  topic      TEXT,
  subject    TEXT NOT NULL,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ───────────────────────── TELEMETRY ───────────────────────── */

CREATE TABLE IF NOT EXISTS audit_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  admin_identity TEXT NOT NULL,
  action         TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT,
  summary        TEXT NOT NULL,
  before_json    TEXT,
  after_json     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS portal_activity_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_identity TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  area          TEXT,
  detail        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON portal_activity_logs(created_at DESC);

/* ───────────────────────── GUIDELINES ───────────────────────── */

CREATE TABLE IF NOT EXISTS guidelines (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'Evaluation',
  summary          TEXT,
  version          INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  requires_ack     INTEGER NOT NULL DEFAULT 1,
  file_original_name TEXT,
  file_stored_name TEXT,
  file_mime_type   TEXT,
  file_size_bytes  INTEGER,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guideline_versions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  guideline_id     INTEGER NOT NULL REFERENCES guidelines(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL,
  title            TEXT NOT NULL,
  summary          TEXT,
  change_note      TEXT,
  file_original_name TEXT,
  file_stored_name TEXT,
  file_mime_type   TEXT,
  file_size_bytes  INTEGER,
  published_by_identity TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guideline_reads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guideline_id  INTEGER NOT NULL REFERENCES guidelines(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  seconds_spent INTEGER NOT NULL DEFAULT 0,
  acknowledged  INTEGER NOT NULL DEFAULT 0,
  first_opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (guideline_id, user_id)
);

/* ───────────────────────── PROJECT READINESS ───────────────────────── */

CREATE TABLE IF NOT EXISTS projects (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  client_note    TEXT,
  description    TEXT,
  approval_mode  TEXT NOT NULL DEFAULT 'automatic' CHECK (approval_mode IN ('automatic', 'manual')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_assessments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assessment_id      INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  minimum_percentage REAL,
  UNIQUE (project_id, assessment_id)
);

CREATE TABLE IF NOT EXISTS employee_project_readiness (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  readiness_status TEXT NOT NULL DEFAULT 'not_ready' CHECK (
    readiness_status IN ('not_ready', 'in_preparation', 'pending_approval', 'approved', 'revoked')
  ),
  decision_source  TEXT NOT NULL DEFAULT 'system' CHECK (decision_source IN ('automatic', 'manual', 'system')),
  notes            TEXT,
  updated_by_identity TEXT,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_readiness_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status    TEXT NOT NULL,
  decision_source TEXT NOT NULL,
  actor_identity TEXT NOT NULL,
  reason        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ───────────────────────── QUESTION BANK ───────────────────────── */

CREATE TABLE IF NOT EXISTS question_bank (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  question_type          TEXT NOT NULL CHECK (question_type IN ('mcq', 'true_false', 'short_answer', 'practical_scenario')),
  prompt                 TEXT NOT NULL,
  scenario_context       TEXT,
  options_json           TEXT,
  correct_answer         TEXT,
  acceptable_answers_json TEXT,
  scoring_rubric         TEXT,
  marks                  REAL NOT NULL DEFAULT 1,
  explanation            TEXT,
  project_ref            TEXT,
  is_reusable            INTEGER NOT NULL DEFAULT 1,
  version                INTEGER NOT NULL DEFAULT 1,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ───────────────────────── ASSESSMENTS ───────────────────────── */

CREATE TABLE IF NOT EXISTS assessments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  title              TEXT NOT NULL,
  instructions       TEXT NOT NULL,
  domain             TEXT,
  project_id         INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  available_from     TEXT,
  available_until    TEXT,
  is_timed           INTEGER NOT NULL DEFAULT 0,
  time_limit_minutes INTEGER,
  pause_on_disconnect INTEGER NOT NULL DEFAULT 1,
  passing_percentage REAL NOT NULL DEFAULT 75,
  selection_mode     TEXT NOT NULL DEFAULT 'fixed' CHECK (selection_mode IN ('fixed', 'random_pool')),
  random_sample_count INTEGER,
  assignment_mode    TEXT NOT NULL DEFAULT 'all_active',
  version            INTEGER NOT NULL DEFAULT 1,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id   INTEGER NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  marks_override REAL,
  UNIQUE (assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS exam_assignments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_identity TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (assessment_id, user_id)
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id        INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_number       INTEGER NOT NULL DEFAULT 1,
  status               TEXT NOT NULL CHECK (status IN ('in_progress', 'submitted', 'expired')),
  status_detail        TEXT NOT NULL DEFAULT 'In progress',
  started_at           TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at         TEXT,
  is_timed             INTEGER NOT NULL DEFAULT 0,
  time_limit_seconds   INTEGER,
  paused_seconds       INTEGER NOT NULL DEFAULT 0,
  disconnect_started_at TEXT,
  interruption_count   INTEGER NOT NULL DEFAULT 0,
  duration_seconds     INTEGER,
  total_possible_marks REAL NOT NULL DEFAULT 0,
  auto_score           REAL,
  final_score          REAL,
  percentage           REAL,
  passed               INTEGER,
  requires_manual_review INTEGER NOT NULL DEFAULT 0,
  review_status        TEXT NOT NULL DEFAULT 'not_applicable' CHECK (review_status IN ('not_applicable', 'pending', 'reviewed')),
  is_released          INTEGER NOT NULL DEFAULT 0,
  release_show_score   INTEGER NOT NULL DEFAULT 1,
  release_show_pass    INTEGER NOT NULL DEFAULT 1,
  release_show_answers INTEGER NOT NULL DEFAULT 1,
  released_by_identity TEXT,
  released_at          TEXT,
  reviewer_comment     TEXT
);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON assessment_attempts(user_id, assessment_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON assessment_attempts(status, is_released);

CREATE TABLE IF NOT EXISTS attempt_questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id    INTEGER NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  source_question_id INTEGER,
  question_type TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  prompt        TEXT NOT NULL,
  scenario_context TEXT,
  options_json  TEXT,
  correct_answer TEXT,
  acceptable_answers_json TEXT,
  scoring_rubric TEXT,
  marks         REAL NOT NULL DEFAULT 1,
  explanation   TEXT
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id          INTEGER NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  attempt_question_id INTEGER NOT NULL REFERENCES attempt_questions(id) ON DELETE CASCADE,
  answer_value        TEXT,
  reasoning_text      TEXT,
  auto_marks          REAL,
  awarded_marks       REAL,
  is_correct          INTEGER,
  reviewer_comment    TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (attempt_id, attempt_question_id)
);

CREATE TABLE IF NOT EXISTS attempt_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS retake_authorizations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id  INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  authorized_by_identity TEXT NOT NULL,
  conditions_note TEXT,
  used_in_attempt_id INTEGER REFERENCES assessment_attempts(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ───────────────────────── COMMUNICATIONS ───────────────────────── */

CREATE TABLE IF NOT EXISTS announcements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'General update',
  body            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  author_identity TEXT NOT NULL,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  published_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  link_path         TEXT,
  is_read           INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS employee_feedback (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_identity TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (
    category IN ('Guideline problem', 'Assessment concern', 'Portal usability', 'Work preparation', 'Suggestion')
  ),
  subject           TEXT NOT NULL,
  message           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Under Review', 'Addressed', 'Closed')),
  admin_response    TEXT,
  updated_by_identity TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
