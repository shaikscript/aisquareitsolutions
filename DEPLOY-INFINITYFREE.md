# Deploying AI Square on InfinityFree

Everything ships as plain PHP 8 + MySQL + static files. There is no Node process, no
build step on the host and no external service to connect. The upload lives happily in
a subfolder such as `htdocs/aisquare/` and also at the domain root — the same files work
in both places because the PHP shell injects its own base path at runtime.

---

## What you upload

```
htdocs/<folder>/
  index.php              ← serves the app shell, injects the base path
  app.html               ← the whole frontend, JS + CSS inlined (≈1.2 MB)
  .htaccess              ← API rewrite, SPA fallback, private storage block
  install.php            ← browser installer; delete it once you are done
  schema.sql             ← MySQL tables (also usable in phpMyAdmin)
  manifest.webmanifest
  brand/                 ← icons + apple touch icon
  api/
    index.php            ← API front controller
    config.sample.php    ← template for config.php (installer writes the real one)
    lib/                 ← core.php, assessment.php, pdf.php, seed.php (blocked from the web)
    routes/              ← auth, public, portal, admin, admin_platform (blocked from the web)
  storage/
    resumes/             ← applicant CVs (blocked from the web)
    guidelines/          ← generated guideline PDFs (blocked from the web)
```

Build the package locally:

```bash
npx vite build                 # dist/index.html — single file, no separate .js
node tools/package-php.mjs     # copies the build to php/app.html and writes deploy/aisquare-infinityfree.zip
```

---

## 1 · Create the database

1. Open the InfinityFree control panel (vPanel) → **MySQL Databases**.
2. Create a database, e.g. `aisquare`. InfinityFree prefixes it, so the real name looks
   like `if0_38492011_aisquare`.
3. Note the four values the installer asks for:
   - **MySQL host** — shown on the same page, usually `sql104.infinityfree.com`
   - **Database name** — `if0_38492011_aisquare`
   - **Username** — `if0_38492011`
   - **Password** — the database password you set (not your account password)

You do *not* need to create tables. The installer does that.

---

## 2 · Upload the files

InfinityFree's browser file manager is fussy: it rejects some uploads, times out on big
files and cannot always unpack archives. FTP is the reliable route.

**Option A — FTP with FileZilla (recommended)**

1. vPanel → **FTP Accounts** → copy host (`ftpupload.net`), username and password.
2. In FileZilla: host, username, password, port 21 → **Quickconnect**.
3. Local pane: `deploy/` (after unzipping `aisquare-infinityfree.zip`).
   Remote pane: open `htdocs/`, create a folder such as `aisquare`.
4. Select everything in the local pane → right-click → **Upload**.
   Upload `api/`, `storage/`, `brand/` as folders — FileZilla recreates the tree.
5. Check the transfer queue for **Failed transfers**. Re-upload anything that failed.

**Option B — file manager**

1. vPanel → **Online File Manager** → `htdocs` → your folder.
2. Upload `aisquare-infinityfree.zip`, then right-click it → **Extract**.
3. If extraction is unavailable, upload the files individually. This is where the
   file manager usually gives up — use FTP instead.

### About the `.js` problem

InfinityFree's file manager is the part that rejects files, not Apache. The build solves
this at the source: `app.html` contains every script and stylesheet inline, so the upload
has **zero `.js` files**. The largest file is `app.html` at ≈1.2 MB, far below the 10 MB
per-file cap. Do not rename PHP or HTML files to "hide" their extension — Apache would
stop executing/serving them.

### Permissions

`storage/` and its two subfolders must be writable (755 is enough on InfinityFree; some
setups need 775). The installer creates the folders if they are missing.

---

## 3 · Run the installer

Open:

```
https://your-domain.infinityfreeapp.com/aisquare/install.php
```

Fill in:

| Field | Value |
| --- | --- |
| MySQL host | `sqlXXX.infinityfree.com` |
| Port | `3306` |
| Database name | `if0_XXXXXXXX_aisquare` |
| Database user | `if0_XXXXXXXX` |
| Database password | the MySQL password |
| Administrator | your name, email, username, password (8+ chars, letter + number) |
| Demo workspace | tick to load sample guidelines, question bank, assessments, projects and hiring data |

The installer creates the tables, writes `api/config.php`, creates your admin account and
(optionally) seeds the demo workspace. It prints the demo credentials when it finishes.

Then **delete `install.php`** and open the site root. Sign in at:

- `/aisquare/admin/login` — admin console
- `/aisquare/login` — employee workspace
- `/aisquare/exam-login` — candidate exam portal

### Demo credentials (if you loaded the demo workspace)

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `aisquare-admin` (or the password you typed in the installer) |
| Employee | `priya` | `aisquare-employee` |
| Candidate | `candidate` | `aisquare-candidate` |

Change them from the admin console before sharing the site.

> The installer refuses to overwrite an existing `api/config.php`. If setup fails halfway,
> delete `api/config.php` and run it again.

---

## 4 · Manual install (phpMyAdmin instead of the installer)

1. vPanel → **phpMyAdmin** → select your database → **Import** → choose `schema.sql` → Go.
2. Copy `api/config.sample.php` to `api/config.php` and edit:

```php
<?php
return [
    'db' => [
        'driver'   => 'mysql',
        'host'     => 'sqlXXX.infinityfree.com',
        'port'     => 3306,
        'name'     => 'if0_XXXXXXXX_aisquare',
        'user'     => 'if0_XXXXXXXX',
        'password' => 'your-database-password',
    ],
    'storage' => __DIR__ . '/../storage',
    'bootstrap_token' => 'change-me',
];
```

3. Visit `/aisquare/admin/login`. When no admin exists the page shows a bootstrap form;
   paste `bootstrap_token` there, then create the first administrator.
4. Optional demo data: run `install.php` **before** you create an admin (it seeds only
   when the `users` table is empty), or skip the demo entirely.

---

## 5 · Things that are specific to InfinityFree

- **`?i=1` interstitial.** The first request from a new visitor is answered by
  InfinityFree's bot check (`...?i=1`) before the real page loads. Cookies carry the
  clearance, so the app's own API calls are unaffected. Nothing to configure.
- **HTTPS.** Enable the free SSL certificate in vPanel → **SSL**. Once it is active, force
  it by adding this to `.htaccess` (commented out by default so a shared certificate
  problem can never break the upload):

  ```apache
  # <IfModule mod_rewrite.c>
  #   RewriteCond %{HTTPS} off
  #   RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
  # </IfModule>
  ```
- **Cron jobs** run at most every 5 minutes and outbound HTTP is usually blocked. Nothing
  in this app needs either.
- **Mail.** `mail()` is rate limited and often disabled. Messages from the contact form
  are stored in the admin console (`/admin/messages`), which is the reliable channel.
- **No `Options` directive needed.** The `.htaccess` avoids `Options -Indexes` because
  some InfinityFree accounts reject it; directory listings are blocked by the rewrite
  rules instead.

---

## 6 · Troubleshooting

| Symptom | Fix |
| --- | --- |
| **500 Internal Server Error** on any page | The `.htaccess` was rejected. Rename it to `.htaccess.off` and reload. If the site works, re-upload the file with FTP in **binary** mode (a Windows text-mode upload can corrupt it). |
| **503 "The site shell is missing"** | `app.html` did not upload. Re-run `node tools/package-php.mjs` and upload that file. |
| **503 "The workspace is not configured yet"** | `api/config.php` is missing. Run `install.php`, or create the file from `api/config.sample.php`. |
| **"Could not connect to MySQL"** | Host must be the `sqlXXX.infinityfree.com` value, not `localhost`. Check the `if0_` prefix on both the database name and the user. |
| **Login works, then everything 403/401** | The browser dropped the session cookie. Make sure the site and the API are on the same host and that you are not mixing `http://` and `https://`. |
| **Uploads fail in the file manager** | Use FileZilla. Nothing in the app depends on the file manager. |
| **PDF guidelines 404** | `storage/guidelines/` is missing or not writable. Create it (755/775) and re-publish the guideline. |
| **White page, no error** | Set `AISQUARE_DEBUG=1` in `api/index.php` temporarily (`setenv`/`putenv`) to surface the stack trace, or check vPanel → **Error logs**. |
| **Everything works but routes 404** | `mod_rewrite` is off or `.htaccess` was not uploaded. Confirm with FTP that the dot-file is present (`ls -a`). |

---

## 7 · Updating the site later

1. `npx vite build && node tools/package-php.mjs`
2. Upload only `app.html` (and `brand/`/`manifest.webmanifest` if the icons changed).
3. Leave `api/config.php` and `storage/` untouched — the database and uploads stay put.
