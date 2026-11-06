# Deploying the Node app on Render

Two things caused the failure you saw:

1. **The service was created as a Docker service.** Render looked for a
   `Dockerfile` in the repo root, found none, and stopped with
   `failed to read dockerfile: open Dockerfile: no such file or directory`.
   A `Dockerfile` now exists, so that route works too.
2. **Render deployed `main`, which does not contain the app.** At the moment
   `main` only holds the uploaded PHP files (`index.php`, `api/`, `app.html`).
   The Node platform (Express + React + SQLite) lives on the branch
   `arena/a9f774e3-aisquareitsolutions` — pull request #1. So even with a
   Dockerfile, deploying `main` builds the wrong tree.

Pick **one** of the three routes below. Route A is the simplest.

---

## Route A — Web Service, Node runtime (recommended, no Docker)

1. Open <https://dashboard.render.com> → **New +** → **Web Service**.
2. Connect the repository `shaikscript/aisquareitsolutions`.
3. **Branch:** `arena/a9f774e3-aisquareitsolutions`
   (after PR #1 is merged into `main`, you can use `main` instead).
4. **Language / Runtime:** `Node`.
5. **Root Directory:** leave empty.
6. **Build Command:**
   ```
   npm ci --include=dev && npm run build
   ```
7. **Start Command:**
   ```
   npm start
   ```
8. **Instance Type:** `Free`.
9. Open **Advanced** → **Health Check Path:** `/api/health`.
10. Add three environment variables:

    | Key | Value |
    | --- | --- |
    | `NODE_VERSION` | `24` |
    | `NODE_ENV` | `production` |
    | `SEED_DEMO` | `true` |

11. **Create Web Service** and wait 3–5 minutes for the first build.

Do not set `PORT` yourself — Render injects it and the server already reads it.

---

## Route B — Docker service (works now)

Same as Route A, except:

- **Language / Runtime:** `Docker`
- **Dockerfile Path:** `./Dockerfile`
- Leave the build and start commands empty (the image handles both).

The image builds the client bundle, then runs the server with production
dependencies only, on the port Render provides.

---

## Route C — Blueprint (one click, uses `render.yaml`)

1. <https://dashboard.render.com> → **New +** → **Blueprint**.
2. Pick the repository and the branch `arena/a9f774e3-aisquareitsolutions`.
3. Render reads `render.yaml` and shows one free web service — click **Apply**.

The blueprint already sets the build/start commands, health check and the three
environment variables.

---

## After it goes live

Your site is at `https://<service-name>.onrender.com`.

| Role | Username | Password |
| --- | --- | --- |
| Admin console | `admin` | `aisquare-admin` |
| Employee workspace | `priya` | `aisquare-employee` |
| Candidate exam portal | `candidate` | `aisquare-candidate` |

Change the admin password on first sign-in (key icon in the header →
*Change password*). Demo accounts are recreated automatically whenever the
database is empty.

Always use the `https://` URL. Sessions use `Secure` cookies in production, so
sign-in silently fails over plain `http://`.

---

## Free-plan behaviour to expect

- **Cold starts:** the service sleeps after ~15 minutes idle; the next request
  takes roughly 30–60 seconds while it wakes.
- **Ephemeral disk:** `data/` (SQLite) and `storage/` (uploads) are wiped on
  every deploy or restart, so the demo database is reseeded and uploaded résumés
  disappear. That is fine for a demo.
- To keep real data, either attach a Render disk and set
  `AISQUARE_DATA_DIR=/var/data` (paid plans), or use the PHP + MySQL build that
  is already in this repo for InfinityFree — MySQL there is persistent.

---

## Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `failed to read dockerfile: open Dockerfile` | Docker runtime chosen, no Dockerfile at the repo root | Use Route A, or Route B now that `Dockerfile` is committed |
| Build succeeds but `No production bundle found.` | Build command skipped `npm run build` | Use `npm ci --include=dev && npm run build` |
| `Cannot find module 'node:sqlite'` | Node older than 22.13 | Set `NODE_VERSION` = `24` (or `22` at 22.13+), redeploy |
| `npm ci` fails: lock file out of sync | `package-lock.json` missing or stale | It is committed — make sure the branch you selected includes it |
| Build installs nothing / vite not found | npm skipped dev dependencies | Keep `--include=dev` in the build command |
| Sign-in appears to do nothing | Page opened over `http://` | Use the `https://…onrender.com` URL |
| First page load very slow | Free instance was asleep | Wait for the cold start, or upgrade the plan |
