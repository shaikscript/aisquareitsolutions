-- AI Square platform · MySQL schema (InfinityFree compatible)
-- Charset: utf8mb4 so emoji and every script survive.
-- Every table is InnoDB; timestamps are stored as UTC "Y-m-d H:i:s" strings
-- written by PHP, so the app never depends on the database timezone.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS company_settings (
  setting_key   VARCHAR(80) NOT NULL PRIMARY KEY,
  setting_value MEDIUMTEXT NULL,
  updated_by    INT NULL,
  updated_at    DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  employee_code        VARCHAR(24) NOT NULL UNIQUE,
  full_name            VARCHAR(160) NOT NULL,
  email                VARCHAR(190) NOT NULL UNIQUE,
  username             VARCHAR(80) NOT NULL UNIQUE,
  password_hash        VARCHAR(255) NOT NULL,
  role                 VARCHAR(16) NOT NULL DEFAULT 'employee',
  account_type         VARCHAR(16) NOT NULL DEFAULT 'employee',
  status               VARCHAR(16) NOT NULL DEFAULT 'active',
  department_note      VARCHAR(190) NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  restrict_to_assigned TINYINT(1) NOT NULL DEFAULT 0,
  source_application_id INT NULL,
  last_login_at        DATETIME NULL,
  last_active_at       DATETIME NULL,
  created_by           INT NULL,
  created_at           DATETIME NOT NULL,
  updated_at           DATETIME NOT NULL,
  deleted_at           DATETIME NULL,
  INDEX idx_users_role (role, account_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id           CHAR(64) NOT NULL PRIMARY KEY,
  user_id      INT NOT NULL,
  ip_address   VARCHAR(64) NULL,
  user_agent   VARCHAR(400) NULL,
  created_at   DATETIME NOT NULL,
  expires_at   DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_throttle (
  key_hash     CHAR(64) NOT NULL PRIMARY KEY,
  attempts     INT NOT NULL DEFAULT 1,
  window_start DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS jobs (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(190) NOT NULL,
  domain           VARCHAR(120) NULL,
  employment_type  VARCHAR(120) NULL,
  work_mode        VARCHAR(60) NULL DEFAULT 'Remote',
  location_note    VARCHAR(160) NULL,
  description      TEXT NOT NULL,
  responsibilities TEXT NULL,
  qualifications   TEXT NULL,
  skills           TEXT NULL,
  status           VARCHAR(16) NOT NULL DEFAULT 'draft',
  created_by       INT NULL,
  created_at       DATETIME NOT NULL,
  updated_at       DATETIME NOT NULL,
  INDEX idx_jobs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS job_applications (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  job_id               INT NULL,
  candidate_user_id    INT NULL,
  position_title       VARCHAR(190) NOT NULL,
  is_general           TINYINT(1) NOT NULL DEFAULT 0,
  full_name            VARCHAR(160) NOT NULL,
  email                VARCHAR(190) NOT NULL,
  phone                VARCHAR(48) NOT NULL,
  location             VARCHAR(160) NULL,
  portfolio_url        VARCHAR(400) NULL,
  education_experience TEXT NOT NULL,
  cover_letter         TEXT NULL,
  resume_original_name VARCHAR(255) NOT NULL,
  resume_stored_name   VARCHAR(255) NOT NULL,
  resume_mime_type     VARCHAR(120) NOT NULL,
  resume_size_bytes    INT NOT NULL DEFAULT 0,
  status               VARCHAR(24) NOT NULL DEFAULT 'New',
  admin_notes          TEXT NULL,
  created_at           DATETIME NOT NULL,
  updated_at           DATETIME NOT NULL,
  INDEX idx_applications_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(160) NOT NULL,
  email      VARCHAR(190) NOT NULL,
  company    VARCHAR(160) NULL,
  topic      VARCHAR(120) NULL,
  subject    VARCHAR(190) NOT NULL,
  message    TEXT NOT NULL,
  status     VARCHAR(16) NOT NULL DEFAULT 'unread',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  admin_id       INT NULL,
  admin_identity VARCHAR(190) NOT NULL,
  action         VARCHAR(80) NOT NULL,
  entity_type    VARCHAR(60) NOT NULL,
  entity_id      VARCHAR(60) NULL,
  summary        VARCHAR(500) NOT NULL,
  before_json    MEDIUMTEXT NULL,
  after_json     MEDIUMTEXT NULL,
  created_at     DATETIME NOT NULL,
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portal_activity_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NULL,
  user_identity VARCHAR(190) NOT NULL,
  event_type    VARCHAR(80) NOT NULL,
  area          VARCHAR(60) NULL,
  detail        VARCHAR(400) NULL,
  created_at    DATETIME NOT NULL,
  INDEX idx_activity_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guidelines (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  title              VARCHAR(190) NOT NULL,
  category           VARCHAR(80) NOT NULL DEFAULT 'Evaluation',
  summary            TEXT NULL,
  version            INT NOT NULL DEFAULT 1,
  status             VARCHAR(16) NOT NULL DEFAULT 'draft',
  requires_ack       TINYINT(1) NOT NULL DEFAULT 1,
  file_original_name VARCHAR(255) NULL,
  file_stored_name   VARCHAR(255) NULL,
  file_mime_type     VARCHAR(120) NULL,
  file_size_bytes    INT NULL,
  created_by         INT NULL,
  created_at         DATETIME NOT NULL,
  updated_at         DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guideline_versions (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  guideline_id          INT NOT NULL,
  version               INT NOT NULL,
  title                 VARCHAR(190) NOT NULL,
  summary               TEXT NULL,
  change_note           TEXT NULL,
  file_original_name    VARCHAR(255) NULL,
  file_stored_name      VARCHAR(255) NULL,
  file_mime_type        VARCHAR(120) NULL,
  file_size_bytes       INT NULL,
  published_by_identity VARCHAR(190) NULL,
  created_at            DATETIME NOT NULL,
  INDEX idx_gv_guideline (guideline_id),
  CONSTRAINT fk_gv_guideline FOREIGN KEY (guideline_id) REFERENCES guidelines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guideline_reads (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  guideline_id    INT NOT NULL,
  user_id         INT NOT NULL,
  version         INT NOT NULL,
  seconds_spent   INT NOT NULL DEFAULT 0,
  acknowledged    TINYINT(1) NOT NULL DEFAULT 0,
  first_opened_at DATETIME NOT NULL,
  last_seen_at    DATETIME NOT NULL,
  UNIQUE KEY uq_read (guideline_id, user_id),
  CONSTRAINT fk_read_guideline FOREIGN KEY (guideline_id) REFERENCES guidelines(id) ON DELETE CASCADE,
  CONSTRAINT fk_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(190) NOT NULL,
  client_note   VARCHAR(190) NULL,
  description   TEXT NULL,
  approval_mode VARCHAR(16) NOT NULL DEFAULT 'automatic',
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  created_by    INT NULL,
  created_at    DATETIME NOT NULL,
  updated_at    DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS question_bank (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  question_type           VARCHAR(24) NOT NULL,
  prompt                  TEXT NOT NULL,
  scenario_context        TEXT NULL,
  options_json            TEXT NULL,
  correct_answer          TEXT NULL,
  acceptable_answers_json TEXT NULL,
  scoring_rubric          TEXT NULL,
  marks                   DOUBLE NOT NULL DEFAULT 1,
  explanation             TEXT NULL,
  project_ref             VARCHAR(160) NULL,
  is_reusable             TINYINT(1) NOT NULL DEFAULT 1,
  version                 INT NOT NULL DEFAULT 1,
  status                  VARCHAR(16) NOT NULL DEFAULT 'active',
  created_by              INT NULL,
  created_at              DATETIME NOT NULL,
  updated_at              DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assessments (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  title                VARCHAR(190) NOT NULL,
  instructions         TEXT NOT NULL,
  domain               VARCHAR(160) NULL,
  project_id           INT NULL,
  status               VARCHAR(16) NOT NULL DEFAULT 'draft',
  available_from       DATETIME NULL,
  available_until      DATETIME NULL,
  is_timed             TINYINT(1) NOT NULL DEFAULT 0,
  time_limit_minutes   INT NULL,
  pause_on_disconnect  TINYINT(1) NOT NULL DEFAULT 1,
  passing_percentage   DOUBLE NOT NULL DEFAULT 75,
  selection_mode       VARCHAR(24) NOT NULL DEFAULT 'fixed',
  random_sample_count  INT NULL,
  assignment_mode      VARCHAR(24) NOT NULL DEFAULT 'all_active',
  version              INT NOT NULL DEFAULT 1,
  created_by           INT NULL,
  created_at           DATETIME NOT NULL,
  updated_at           DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assessment_questions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  assessment_id  INT NOT NULL,
  question_id    INT NOT NULL,
  sort_order     INT NOT NULL DEFAULT 0,
  marks_override DOUBLE NULL,
  UNIQUE KEY uq_assessment_question (assessment_id, question_id),
  CONSTRAINT fk_aq_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_aq_question FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exam_assignments (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  assessment_id        INT NOT NULL,
  user_id              INT NOT NULL,
  assigned_by_identity VARCHAR(190) NULL,
  created_at           DATETIME NOT NULL,
  UNIQUE KEY uq_assignment (assessment_id, user_id),
  CONSTRAINT fk_assign_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_assign_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_assessments (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  project_id         INT NOT NULL,
  assessment_id      INT NOT NULL,
  minimum_percentage DOUBLE NULL,
  UNIQUE KEY uq_project_assessment (project_id, assessment_id),
  CONSTRAINT fk_pa_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_project_readiness (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  project_id          INT NOT NULL,
  user_id             INT NOT NULL,
  readiness_status    VARCHAR(24) NOT NULL DEFAULT 'not_ready',
  decision_source     VARCHAR(24) NOT NULL DEFAULT 'system',
  notes               TEXT NULL,
  updated_by_identity VARCHAR(190) NULL,
  updated_at          DATETIME NOT NULL,
  UNIQUE KEY uq_readiness (project_id, user_id),
  CONSTRAINT fk_rd_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_rd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_readiness_history (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  project_id       INT NOT NULL,
  user_id          INT NOT NULL,
  previous_status  VARCHAR(24) NULL,
  new_status       VARCHAR(24) NOT NULL,
  decision_source  VARCHAR(24) NOT NULL,
  actor_identity   VARCHAR(190) NOT NULL,
  reason           TEXT NULL,
  created_at       DATETIME NOT NULL,
  INDEX idx_prh_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  assessment_id          INT NOT NULL,
  user_id                INT NOT NULL,
  attempt_number         INT NOT NULL DEFAULT 1,
  status                 VARCHAR(16) NOT NULL,
  status_detail          VARCHAR(160) NOT NULL DEFAULT 'In progress',
  started_at             DATETIME NOT NULL,
  submitted_at           DATETIME NULL,
  is_timed               TINYINT(1) NOT NULL DEFAULT 0,
  time_limit_seconds     INT NULL,
  paused_seconds         INT NOT NULL DEFAULT 0,
  disconnect_started_at  DATETIME NULL,
  interruption_count     INT NOT NULL DEFAULT 0,
  duration_seconds       INT NULL,
  total_possible_marks   DOUBLE NOT NULL DEFAULT 0,
  auto_score             DOUBLE NULL,
  final_score            DOUBLE NULL,
  percentage             DOUBLE NULL,
  passed                 TINYINT(1) NULL,
  requires_manual_review TINYINT(1) NOT NULL DEFAULT 0,
  review_status          VARCHAR(24) NOT NULL DEFAULT 'not_applicable',
  is_released            TINYINT(1) NOT NULL DEFAULT 0,
  release_show_score     TINYINT(1) NOT NULL DEFAULT 1,
  release_show_pass      TINYINT(1) NOT NULL DEFAULT 1,
  release_show_answers   TINYINT(1) NOT NULL DEFAULT 1,
  released_by_identity   VARCHAR(190) NULL,
  released_at            DATETIME NULL,
  reviewer_comment       TEXT NULL,
  INDEX idx_attempts_user (user_id, assessment_id),
  INDEX idx_attempts_status (status, is_released),
  CONSTRAINT fk_attempt_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attempt_questions (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  attempt_id              INT NOT NULL,
  source_question_id      INT NULL,
  question_type           VARCHAR(24) NOT NULL,
  sort_order              INT NOT NULL DEFAULT 0,
  prompt                  TEXT NOT NULL,
  scenario_context        TEXT NULL,
  options_json            TEXT NULL,
  correct_answer          TEXT NULL,
  acceptable_answers_json TEXT NULL,
  scoring_rubric          TEXT NULL,
  marks                   DOUBLE NOT NULL DEFAULT 1,
  explanation             TEXT NULL,
  INDEX idx_aq_attempt (attempt_id),
  CONSTRAINT fk_aqatt_attempt FOREIGN KEY (attempt_id) REFERENCES assessment_attempts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attempt_answers (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  attempt_id          INT NOT NULL,
  attempt_question_id INT NOT NULL,
  answer_value        MEDIUMTEXT NULL,
  reasoning_text      MEDIUMTEXT NULL,
  auto_marks          DOUBLE NULL,
  awarded_marks       DOUBLE NULL,
  is_correct          TINYINT(1) NULL,
  reviewer_comment    TEXT NULL,
  updated_at          DATETIME NOT NULL,
  UNIQUE KEY uq_answer (attempt_id, attempt_question_id),
  CONSTRAINT fk_ans_attempt FOREIGN KEY (attempt_id) REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ans_question FOREIGN KEY (attempt_question_id) REFERENCES attempt_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attempt_events (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  detail     VARCHAR(400) NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_event_attempt (attempt_id),
  CONSTRAINT fk_event_attempt FOREIGN KEY (attempt_id) REFERENCES assessment_attempts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS retake_authorizations (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  assessment_id          INT NOT NULL,
  user_id                INT NOT NULL,
  authorized_by_identity VARCHAR(190) NOT NULL,
  conditions_note        TEXT NULL,
  used_in_attempt_id     INT NULL,
  created_at             DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcements (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(190) NOT NULL,
  category        VARCHAR(80) NOT NULL DEFAULT 'General update',
  body            MEDIUMTEXT NOT NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'published',
  author_identity VARCHAR(190) NOT NULL,
  created_by      INT NULL,
  published_at    DATETIME NULL,
  created_at      DATETIME NOT NULL,
  updated_at      DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  notification_type VARCHAR(40) NOT NULL,
  title             VARCHAR(190) NOT NULL,
  message           TEXT NOT NULL,
  link_path         VARCHAR(190) NULL,
  is_read           TINYINT(1) NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL,
  INDEX idx_notifications_user (user_id, is_read, created_at),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_feedback (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_id             INT NOT NULL,
  employee_identity   VARCHAR(190) NOT NULL,
  category            VARCHAR(80) NOT NULL,
  subject             VARCHAR(190) NOT NULL,
  message             TEXT NOT NULL,
  status              VARCHAR(24) NOT NULL DEFAULT 'New',
  admin_response      TEXT NULL,
  updated_by_identity VARCHAR(190) NULL,
  created_at          DATETIME NOT NULL,
  updated_at          DATETIME NOT NULL,
  INDEX idx_feedback_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS install_state (
  state_key   VARCHAR(60) NOT NULL PRIMARY KEY,
  state_value VARCHAR(190) NULL,
  created_at  DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
