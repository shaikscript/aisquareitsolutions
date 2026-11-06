#!/usr/bin/env node
/**
 * Build the InfinityFree upload: dist/ → php/app.html, then zip php/ .
 *
 *   node tools/package-php.mjs
 *
 * The script is intentionally dependency free (Node 18+, `zip` on PATH).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, statSync, copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const site = path.join(root, 'php');
const out = path.join(root, 'deploy');

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html is missing — run `npx vite build` first.');
  process.exit(1);
}

copyFileSync(path.join(dist, 'index.html'), path.join(site, 'app.html'));
mkdirSync(path.join(site, 'brand'), { recursive: true });
for (const name of readdirSync(path.join(dist, 'brand'))) {
  copyFileSync(path.join(dist, 'brand', name), path.join(site, 'brand', name));
}
copyFileSync(path.join(dist, 'manifest.webmanifest'), path.join(site, 'manifest.webmanifest'));

mkdirSync(out, { recursive: true });
const zipName = 'aisquare-infinityfree.zip';
const zipPath = path.join(out, zipName);
rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', '-q', zipPath, '.', '-x', 'api/config.php', '-x', 'storage/resumes/*', '-x', 'storage/guidelines/*'], {
  cwd: site,
});

const size = (statSync(zipPath).size / 1048576).toFixed(2);
let largest = { name: '', size: 0 };
const walk = (dir, base = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
    else {
      const bytes = statSync(path.join(dir, entry.name)).size;
      if (bytes > largest.size) largest = { name: rel, size: bytes };
    }
  }
};
walk(site);

console.log(`✓ deploy/${zipName} — ${size} MB`);
console.log(`  largest file: ${largest.name} (${(largest.size / 1048576).toFixed(2)} MB, host limit is 10 MB)`);
