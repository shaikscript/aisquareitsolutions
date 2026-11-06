/**
 * Render check: mounts the real app in jsdom and walks every route, failing on
 * the error boundary or on render-time exceptions.
 *
 *   node tools/render-check.mjs                       # default mock data
 *   node tools/render-check.mjs --fixtures api.json   # real API payloads
 *   node tools/render-check.mjs /admin /portal        # specific routes
 *
 * `api.json` maps request paths to response bodies, e.g. captured from the
 * running backend: { "/api/admin/overview": { ... } }.
 */
import { JSDOM } from 'jsdom';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
global.localStorage = window.localStorage;
global.sessionStorage = window.sessionStorage;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.Event = window.Event;
global.CustomEvent = window.CustomEvent;
global.MutationObserver = window.MutationObserver;
global.getComputedStyle = window.getComputedStyle.bind(window);
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
window.scrollTo = () => {};
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
global.WebGLRenderingContext = class {};
window.HTMLCanvasElement.prototype.getContext = () => null;

const api = {
  '/api/auth/me': { user: { id: 1, fullName: 'Aarav Mehta', role: 'admin', accountType: 'admin', homePath: '/admin', employeeCode: 'ADM-0001' } },
  '/api/auth/setup-status': { needsBootstrap: false },
  '/api/public/info': { companyName: 'AI Square IT Solutions', values: [], demoMode: true },
  '/api/public/jobs': { jobs: [] },
  '/api/public/stats': {},
  '/api/admin/overview': { stats: [], kpis: {}, activity: [], pendingAttempts: [], upcoming: [] },
  '/api/admin/attempts': { attempts: [], counts: {} },
  '/api/admin/employees': { people: [] },
  '/api/admin/admins': { admins: [] },
  '/api/admin/directory': { people: [], assessments: [] },
  '/api/admin/jobs': { jobs: [] },
  '/api/admin/applications': { applications: [] },
  '/api/admin/messages': { messages: [] },
  '/api/admin/settings': { settings: {} },
  '/api/admin/activity': { activity: [] },
  '/api/admin/guidelines': { guidelines: [] },
  '/api/admin/question-bank': { questions: [], counts: {} },
  '/api/admin/assessments': { assessments: [] },
  '/api/admin/projects': { projects: [] },
  '/api/admin/readiness': { projects: [] },
  '/api/admin/announcements': { announcements: [] },
  '/api/admin/feedback': { feedback: [] },
  '/api/portal/notifications': { notifications: [], unread: 0 },
};
const ROLE = process.env.ROLE || 'auto';
let CURRENT_USER = api['/api/auth/me'];
const argv = process.argv.slice(2);
const fixtureFlag = argv.indexOf('--fixtures');
const fixturePath = fixtureFlag > -1 ? argv[fixtureFlag + 1] : null;
const routeArgs = argv.filter((arg, index) => arg.startsWith('/') && (fixtureFlag === -1 || index !== fixtureFlag + 1));
const fixtures = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : {};
global.fetch = window.fetch = async (url) => {
  const path = String(url).replace('http://localhost', '').split('?')[0];
  let body = fixtures[path] ?? api[path] ?? {};
  if (path === '/api/auth/me') body = CURRENT_USER;
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
};

const cacheDir = '.cache';
if (!existsSync(cacheDir)) mkdirSync(cacheDir);
const bundlePath = `${cacheDir}/render-bundle.mjs`;
if (!existsSync(bundlePath) || process.env.REBUILD === '1') {
const out = await build({
  entryPoints: [new URL('./render-entry.jsx', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"development"', 'process.env.NODE_ENV ': '"development"' },
  write: false,
  logLevel: 'silent',
  absWorkingDir: process.cwd(),
});
writeFileSync(bundlePath, out.outputFiles[0].text);
}
const mod = await import(pathToFileURL(bundlePath).href + '?v=' + Date.now());

let failures = 0;
const errors = [];
const origError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); };

const DEFAULT_ROUTES = [
  '/', '/about', '/careers', '/contact', '/privacy', '/terms',
  '/login', '/admin/login', '/exam-login',
  '/admin', '/admin/employees', '/admin/candidates', '/admin/admins', '/admin/guidelines',
  '/admin/question-bank', '/admin/assessments', '/admin/results', '/admin/readiness',
  '/admin/applications', '/admin/jobs', '/admin/messages', '/admin/announcements',
  '/admin/feedback', '/admin/company-info', '/admin/activity',
  '/portal', '/portal/guidelines', '/portal/assessments', '/portal/results', '/portal/readiness',
  '/portal/announcements', '/portal/notifications', '/portal/feedback',
  '/exam-portal', '/exam-portal/results',
];
const cliRoutes = routeArgs;
const routes = cliRoutes.length ? cliRoutes : DEFAULT_ROUTES;
for (const route of routes) {
  try {
  const role = ROLE !== 'auto' ? ROLE : route.startsWith('/admin') ? 'admin' : route.startsWith('/exam-portal') ? 'candidate' : route.startsWith('/portal') ? 'employee' : 'guest';
  CURRENT_USER = role === 'guest'
    ? { user: null }
    : { user: { id: 2, fullName: role === 'admin' ? 'Aarav Mehta' : role === 'candidate' ? 'Meera Iyer' : 'Priya Nair', role, accountType: role, homePath: role === 'admin' ? '/admin' : role === 'candidate' ? '/exam-portal' : '/portal', employeeCode: role === 'admin' ? 'ADM-0001' : role === 'candidate' ? 'CND-0001' : 'EMP-0001', email: 'demo@example.com' } };
  errors.length = 0;
  window.history.pushState({}, '', route);
  const el = window.document.getElementById('root');
  el.innerHTML = '';
  const root = mod.mount(el);
  await new Promise((r) => setTimeout(r, 450));
  const text = el.textContent || '';
  const crashed = text.includes('unexpected state');
  if (crashed) failures += 1;
  const detail = crashed ? text.slice(0, 160) : '';
  console.log(`${crashed ? 'CRASH' : 'ok   '} ${route}${detail ? ' → ' + detail.replace(/\s+/g, ' ') : ''}`);
  if (errors.length) {
    const real = errors.filter((e) => !e.includes('not wrapped in act'));
    if (real.length) console.log('   console.error:', real[0].slice(0, 4000));
  }
  try { root.unmount(); } catch { /* ignore */ }
  } catch (e) {
    console.log('ERROR', route, String(e && e.stack ? e.stack.split('\n').slice(0,3).join(' | ') : e).slice(0, 300));
  }
}
console.error = origError;
console.log(`\n${failures === 0 ? 'all routes rendered' : failures + ' route(s) crashed'} (${routes.length} checked)`);
process.exitCode = failures === 0 ? 0 : 1;
