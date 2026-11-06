# AI Square IT Solutions

The AI Square platform — public marketing site, employee workspace, candidate exam portal
and admin console — in two runtimes:

| Path | Runtime | Purpose |
| --- | --- | --- |
| `src/`, `server/` | Node 22 + SQLite | reference implementation used during development |
| `php/` | PHP 8 + MySQL | the deployment that ships to shared hosting (InfinityFree) |

Both expose the same API contract and the same UI, so the frontend is byte-identical
apart from the base path it is mounted at.

---

## Shared hosting (InfinityFree) — production target

```bash
npx vite build                 # dist/index.html — one file, JS and CSS inlined
node tools/package-php.mjs     # → php/app.html + deploy/aisquare-infinityfree.zip
```

Upload `deploy/aisquare-infinityfree.zip` over FTP, create a MySQL database in the
InfinityFree control panel, then open `install.php` in the browser. Full walkthrough:

**[DEPLOY-INFINITYFREE.md](DEPLOY-INFINITYFREE.md)**

Highlights of the PHP port:

- `php/index.php` is the SPA shell: it reads `app.html`, injects `<base href>` and
  `window.__AISQUARE_BASE__`, so the same upload works at a domain root or in a subfolder.
- `php/api/` is a dependency-free REST API (`core`, `assessment`, `pdf`, `seed` libraries and
  five route modules) that talks to MySQL through PDO.
- Uploads (resumes, guideline PDFs) land in `php/storage/`, which is blocked from the web by
  both `.htaccess` and a rewrite rule; files are streamed after a permission check.
- Demo data, including generated PDF guidelines, comes from `php/api/lib/seed.php`.

---

## Local development (Node reference)

```bash
npm install
npm run seed -- --force     # creates data/aisquare.db with demo data
npm run dev                 # API + Vite dev server on http://localhost:3000
```

Route render check — mounts the real app in jsdom and walks all 35 routes, failing on
the error boundary or a render-time exception:

```bash
npm run check:render                                   # mock data
npm run check:render -- --fixtures fixtures.json       # real API payloads
npm run check:render -- /admin /portal                 # selected routes
```

Demo accounts: `admin` / `aisquare-admin`, `priya` / `aisquare-employee`,
`candidate` / `aisquare-candidate`.

---

## Managed hosting (Render) — Node runtime in the cloud

The same Node app runs on Render. Two files make that work:

| File | Purpose |
| --- | --- |
| `render.yaml` | Blueprint: free web service, `npm ci && npm run build`, `npm start`, health check `/api/health` |
| `Dockerfile` | Two-stage image (bundle build → production runtime) for the Docker runtime |

A plain **Web Service** with `Node` runtime needs no Dockerfile:

```
Build:  npm ci --include=dev && npm run build
Start:  npm start
Health: /api/health
Env:    NODE_VERSION=24  NODE_ENV=production  SEED_DEMO=true
```

Full step-by-step walkthrough and troubleshooting table:
**[RENDER-STEPS.md](RENDER-STEPS.md)**

Render's free plan uses an ephemeral disk, so `data/` (SQLite) and `storage/`
(uploads) reset on every deploy — the demo database reseeds itself. For durable
data, use the MySQL build on InfinityFree, or attach a paid Render disk and point
`AISQUARE_DATA_DIR` at it.

---

## Feature set

- **Public site** — landing page with 3D hero, services, process, careers listing with PDF
  applications, contact form, legal pages, PWA manifest.
- **Employee workspace** — guidelines with acknowledgement tracking, assigned assessments
  with timed attempts and connection-loss handling, results, project readiness, announcements,
  notifications and feedback.
- **Candidate exam portal** — scoped login, assigned assessments, timed attempts with
  auto-save, interruption resilience, released results only.
- **Admin console** — overview, people management (single + bulk creation with generated
  credentials, promotions, assignment, password resets), admin accounts, guidelines with
  versions and reader acknowledgements, question bank, assessment builder, attempts with
  manual review and release, retakes, projects and readiness decisions, hiring pipeline,
  contact messages, announcements, feedback, company info and audit/activity logs.

---

## Repository layout

```
src/                 React 18 frontend (Vite, single-file build)
server/              Node reference API (Express-style router, node:sqlite)
php/                 PHP + MySQL deployment (this is what InfinityFree serves)
  api/lib/           core (db, sessions, uploads), assessment engine, PDF writer, seeder
  api/routes/        auth, public, portal, admin, admin_platform
  schema.sql         MySQL schema, utf8mb4 / InnoDB
  install.php        browser installer (writes api/config.php, imports schema, seeds demo)
tools/package-php.mjs  build step that produces the uploadable ZIP
Dockerfile           two-stage image for Render's Docker runtime
render.yaml          Render Blueprint (Node runtime, free plan)
DEPLOY-INFINITYFREE.md  shared-hosting guide, troubleshooting table
RENDER-STEPS.md      Render walkthrough (Web Service / Docker / Blueprint)
STYLE-GUIDE.md       the "Ink & Brass" design system
```
