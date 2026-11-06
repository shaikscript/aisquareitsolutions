#!/usr/bin/env node
/**
 * Seeds the demo workspace: three accounts, guidelines with real PDFs,
 * a question bank, four assessments, attempts, projects, jobs, applications,
 * feedback and audit history.
 *
 * Usage:
 *   npm run seed              seed only when the database is empty
 *   npm run seed -- --force   wipe demo data and rebuild it
 */
import { seedDemo, DEMO_ACCOUNTS } from '../db/seed.js';
import { DB_PATH, GUIDELINE_DIR } from '../db/index.js';

const force = process.argv.includes('--force') || process.argv.includes('-f');

console.log(`\n  AI Square · demo seed${force ? ' (force)' : ''}`);
console.log(`  database   ${DB_PATH}`);
console.log(`  guidelines ${GUIDELINE_DIR}\n`);

const started = Date.now();
const result = seedDemo({ force });
const ms = Date.now() - started;

if (!result.seeded) {
  console.log('  Database already contains accounts — nothing to do.');
  console.log('  Re-run with:  npm run seed -- --force\n');
  process.exit(0);
}

console.log(`  ✓ Demo workspace ready in ${ms} ms\n`);
console.log('  ── Sign in ───────────────────────────────────────────');
console.log(`  Administrator   /admin/login   ${DEMO_ACCOUNTS.admin.username} / ${DEMO_ACCOUNTS.admin.password}`);
console.log(`  Employee        /login         ${DEMO_ACCOUNTS.employee.username} / ${DEMO_ACCOUNTS.employee.password}`);
console.log(`  Candidate       /exam-login    ${DEMO_ACCOUNTS.candidate.username} / ${DEMO_ACCOUNTS.candidate.password}`);
console.log('  ──────────────────────────────────────────────────────\n');
