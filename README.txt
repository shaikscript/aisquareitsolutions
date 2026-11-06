AI SQUARE · upload instructions
================================

1. Put these files in htdocs (or a subfolder such as htdocs/aisquare) using FTP.
2. Create a MySQL database in the InfinityFree control panel and note the host,
   database name, user and password.
3. Open https://your-site/install.php and fill in those four values.
4. Delete install.php once the installer reports success.
5. Sign in:  /admin/login  ·  /login  ·  /exam-login

Full guide: DEPLOY-INFINITYFREE.md
The frontend is a single file (app.html) with every script inlined, so there are
no .js files to upload and nothing exceeds the host's 10 MB per-file limit.
