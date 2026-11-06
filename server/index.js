import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import db, { ROOT_DIR, ensureSettings } from './db/index.js';
import { seedDemo } from './db/seed.js';
import { attachUser } from './lib/auth.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import portalRoutes from './routes/portal.js';
import adminRoutes from './routes/admin.js';
import adminPlatformRoutes from './routes/adminPlatform.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

function bootstrapData() {
  ensureSettings();
  const { count } = db.get('SELECT COUNT(*) AS count FROM users');
  if (count === 0) {
    if (process.env.SEED_DEMO !== 'false') {
      seedDemo();
      console.log(
        '\n  Demo workspace created\n' +
          '  ├─ Admin      admin / aisquare-admin\n' +
          '  ├─ Employee   priya / aisquare-employee\n' +
          '  └─ Candidate  candidate / aisquare-candidate\n'
      );
    } else {
      console.log('  No accounts yet. Set ADMIN_BOOTSTRAP_TOKEN and use /admin/login → initialize workspace.');
    }
  }
}

async function start() {
  bootstrapData();

  const app = express();
  const server = http.createServer(app);

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.set('etag', false);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store, private');
    }
    next();
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '6mb' }));
  app.use(express.urlencoded({ extended: true, limit: '6mb' }));
  app.use(attachUser);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'AI Square platform',
      mode: isProd ? 'production' : 'development',
      time: new Date().toISOString(),
    });
  });

  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/portal', portalRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin', adminPlatformRoutes);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'That upload is too large.' });
    }
    if (req.path.startsWith('/api')) {
      const status = err.status && err.status >= 400 ? err.status : 500;
      if (status >= 500) console.error('[api error]', err);
      return res.status(status).json({ error: err.message || 'Something went wrong.', code: err.code });
    }
    return next(err);
  });

  const bundleDir = path.join(ROOT_DIR, 'dist');

  if (isProd) {
    if (!fs.existsSync(path.join(bundleDir, 'index.html'))) {
      console.error('No production bundle found. Run `npm run build` first.');
      process.exit(1);
    }
    app.use(
      express.static(bundleDir, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(fs.readFileSync(path.join(bundleDir, 'index.html'), 'utf8'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: ROOT_DIR,
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: { server },
        watch: { ignored: ['**/data/**', '**/storage/**'] },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, HOST, () => {
    console.log(`AI Square platform · http://${HOST}:${PORT} · ${isProd ? 'production' : 'development'}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
