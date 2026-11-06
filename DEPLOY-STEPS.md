# Deploy AI Square on InfinityFree — the easy path

Nine short steps, about 25 minutes. Do them in order; each one ends with a
**"you should see"** line so you always know it worked before moving on.

You need: the ZIP file, [FileZilla](https://filezilla-project.org/download.php?type=client)
(free), and your InfinityFree control panel open in one browser tab.

---

## Step 1 · Create the database

Control panel → **MySQL Databases** → create a database, e.g. `aisquare`.

Nothing else to configure. Now write down these four values — copy them into a
note, you will paste them in step 4:

| What the installer asks for | Where to find it | Looks like |
| --- | --- | --- |
| MySQL host | same page, next to "MySQL Host" | `sql104.infinityfree.com` |
| Database name | the full name it created | `if0_38492011_aisquare` |
| Database user | "MySQL Username" | `if0_38492011` |
| Database password | the password you just typed | your own |

> **Watch out:** the host is **not** `localhost`. And the database name keeps the
> `if0_` prefix — copy it exactly, don't shorten it.

**You should see:** the database listed as *Active*.

---

## Step 2 · Unpack the ZIP on your PC

1. Download `aisquare-infinityfree.zip` (it's open in your file viewer).
2. Right-click → **Extract All**.
3. Open the extracted folder.

**You should see** `index.php`, `app.html`, `install.php`, `schema.sql`, and the
folders `api`, `brand`, `storage` — all sitting side by side.

> If you see one folder inside containing all of these, go one level deeper and
> use *that* folder. This is the single most common mistake.

---

## Step 3 · Connect with FileZilla

Open FileZilla and fill the four boxes at the top:

| Box | Value |
| --- | --- |
| Host | `ftpupload.net` |
| Username | from control panel → **FTP Accounts** (starts with `if0_` or `epiz_`) |
| Password | your hosting account password (the one you log into the control panel with) |
| Port | `21` |

Click **Quickconnect**. Accept any certificate prompt.

**You should see** the right-hand pane fill with a folder called `htdocs`.

---

## Step 4 · Upload

1. In the **right** pane (the server), double-click `htdocs`.
2. Right-click in the empty space → **Create directory** → name it `aisquare`.
3. Double-click into `aisquare`.
4. In the **left** pane (your PC), open the extracted folder from step 2.
5. Select **everything** inside it — `Ctrl+A`.
6. Right-click → **Upload**.

Wait for the queue at the bottom to finish.

**You should see:** the right pane shows `index.php`, `app.html`, `.htaccess`,
`api`, `brand`, `install.php`, `storage`, and the queue says **0 failed**.

> **Two things that matter here:**
> - Upload the *contents*, not the folder itself.
> - `.htaccess` must be there. FileZilla uploads dotfiles normally; the web file
>   manager often hides or rejects them — which is exactly why we're using FTP.

---

## Step 5 · Run the installer

In your browser open:

```
https://YOUR-SITE.infinityfreeapp.com/aisquare/install.php
```

Replace `YOUR-SITE` with your account's domain.

Fill in the four database values from step 1, then your own admin account
(name, email, username, password — 8+ characters with a letter and a number).
Leave **"Load the demo workspace"** ticked the first time; you get guidelines,
questions, assessments and projects to look at immediately.

Click **Install workspace**.

**You should see:** *"The workspace is live."* with three login links and the
demo passwords listed.

> If you get the `?i=1` screen first, that's InfinityFree's bot check — it passes
> by itself. If the page hangs, refresh once.

---

## Step 6 · Delete the installer

Back in FileZilla: right-click `install.php` → **Delete**.

**You should see** it disappear from the right pane. This step is not optional —
leaving it up lets anyone re-run setup.

---

## Step 7 · Sign in

| Portal | URL | Demo login |
| --- | --- | --- |
| Admin console | `/aisquare/admin/login` | `admin` / `aisquare-admin` |
| Employee workspace | `/aisquare/login` | `priya` / `aisquare-employee` |
| Candidate exams | `/aisquare/exam-login` | `candidate` / `aisquare-candidate` |

The admin password is the one **you typed in step 5** if you didn't use the demo
account; the three demo logins above exist only when the demo workspace was loaded.

**You should see** the admin dashboard with KPIs, a review queue and quick actions.

---

## Step 8 · Your first 10 minutes in the admin console

1. **Company info** — replace the placeholder address, phone, email and values.
2. **People → Add employee** — create real accounts; the generated password is
   shown once, copy it.
3. **Guidelines → New guideline** — upload a PDF, publish it. Employees now see
   it in their workspace and must acknowledge it.
4. **Question bank → New question** — add a few MCQs or a scenario.
5. **Assessments → New assessment** — pick questions, set the pass mark and time
   limit, then assign it to people.
6. **Change your own password** — click the key icon at the top-right of the
   header, in any workspace.

---

## Step 9 · Turn on HTTPS (optional, 2 minutes)

Control panel → **SSL Certificates** → request the free certificate → wait for it
to say active, then open your site with `https://`.

Once HTTPS works, you can force it by editing `.htaccess` and uncommenting the
three redirect lines at the bottom of the file.

---

## If something goes wrong

| What you see | What it means | Fix |
| --- | --- | --- |
| **500 Internal Server Error** | `.htaccess` didn't upload correctly | Re-upload `.htaccess` with FileZilla in **binary** transfer mode |
| **403 Forbidden** on every page | `index.php` missing or in the wrong folder | Check `htdocs/aisquare/index.php` exists |
| **503 "The site shell is missing"** | `app.html` didn't upload | Upload `app.html` again — it's the 1.15 MB file |
| **503 "workspace is not configured"** | `api/config.php` wasn't written | Run `install.php` again, or create the file from `api/config.sample.php` |
| **"Could not connect to MySQL"** | Wrong host or prefix | Host must be `sqlXXX.infinityfree.com`, name must keep `if0_` |
| **Login works, then it kicks you out** | Cookie blocked by mixing http/https | Use one origin consistently; enable SSL in step 9 |
| **Blank white page** | A PHP error is hidden | Control panel → **Error logs**, or set `AISQUARE_DEBUG` to `1` in `api/index.php` |

---

## Why this upload has no `.js` problem

The whole frontend is compiled into **one `app.html`** with every script and style
inlined. The upload contains zero `.js` files, and the largest single file is
1.15 MB — far below the 10 MB per-file limit. If the web file manager still
refuses something, FTP always works, and nothing needs renaming.
