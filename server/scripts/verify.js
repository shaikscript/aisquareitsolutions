#!/usr/bin/env node
/**
 * Post-install health check: schema, seed completeness, stored files and
 * (optionally) the live HTTP API.
 *
 *   npm run verify
 *   npm run verify -- --url http://localhost:3000
 */
import fs from 'node:fs';
import path from 'node:path';
import db, { DB_PATH, GUIDELINE_DIR } from '../db/index.js';

const urlArgIndex = process.argv.indexOf('--url');
const baseUrl = urlArgIndex > -1 ? process.argv[urlArgIndex + 1] : null;

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? `  ${detail}` : ''}`);
  }
}

console.log('\n  AI Square · verification');
console.log(`  database ${DB_PATH}\n`);

const tables = db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
check('schema created', tables.length >= 15, `${tables.length} tables`);

const count = (sql) => db.get(sql)?.count ?? 0;

check('administrators exist', count("SELECT COUNT(*) AS count FROM users WHERE role='admin'") > 0);
check('employees exist', count("SELECT COUNT(*) AS count FROM users WHERE account_type='employee'") > 0);
check('candidate accounts exist', count("SELECT COUNT(*) AS count FROM users WHERE account_type='candidate'") > 0);
check('guidelines published', count("SELECT COUNT(*) AS count FROM guidelines WHERE status='published'") > 0);
check('questions in bank', count('SELECT COUNT(*) AS count FROM questions') > 0);
check('assessments exist', count('SELECT COUNT(*) AS count FROM assessments') > 0);
check('assessment attempts exist', count('SELECT COUNT(*) AS count FROM assessment_attempts') > 0);
check('projects configured', count('SELECT COUNT(*) AS count FROM projects') > 0);
check('job openings exist', count('SELECT COUNT(*) AS count FROM job_openings') > 0);
check('applications exist', count('SELECT COUNT(*) AS count FROM applications') > 0);
check('announcements exist', count('SELECT COUNT(*) AS count FROM announcements') > 0);
check('company profile seeded', Boolean(db.get("SELECT value FROM settings WHERE key='company_mission'")?.value));

const docs = db.all("SELECT id, title, stored_name FROM guidelines WHERE stored_name IS NOT NULL");
const missing = docs.filter((doc) => !fs.existsSync(path.join(GUIDELINE_DIR, doc.stored_name)));
check('guideline PDFs on disk', docs.length > 0 && missing.length === 0, `${docs.length - missing.length}/${docs.length}`);

if (baseUrl) {
  console.log(`\n  HTTP checks · ${baseUrl}\n`);
  try {
    const info = await fetch(`${baseUrl}/api/public/info`).then((r) => r.json());
    check('public info responds', Boolean(info?.company?.mission), info?.company?.name || '');
    const jobs = await fetch(`${baseUrl}/api/public/jobs`).then((r) => r.json());
    check('jobs endpoint responds', Array.isArray(jobs?.jobs), `${jobs?.jobs?.length ?? 0} open roles`);
    const setup = await fetch(`${baseUrl}/api/auth/setup-status`).then((r) => r.json());
    check('auth setup-status responds', typeof setup?.needsBootstrap === 'boolean');
    const shell = await fetch(baseUrl);
    const html = await shell.text();
    check('SPA shell served', shell.ok && html.includes('<div id="root">'));
  } catch (err) {
    check('HTTP reachable', false, err.message);
  }
}

console.log(`\n  ${checks - failures}/${checks} checks passed${failures ? ` · ${failures} failing` : ''}\n`);
process.exit(failures ? 1 : 0);
