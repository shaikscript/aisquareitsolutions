const TOKEN_KEY = 'aisquare.session';

/**
 * The app can live at the domain root or inside a subfolder on shared hosting.
 * The PHP shell injects `window.__AISQUARE_BASE__` (e.g. "/aisquare") so every
 * request resolves against the folder the app was uploaded to.
 */
export const API_BASE = (() => {
  if (typeof window === 'undefined') return '';
  const injected = window.__AISQUARE_BASE__;
  if (typeof injected === 'string' && injected && injected !== '/') {
    return injected.replace(/\/+$/, '');
  }
  return '';
})();

/** Turn an app-absolute path ("/api/...") into a deploy-safe URL. */
export const apiUrl = (path) => {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
};

let memoryToken = null;

export function getToken() {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export function setToken(token) {
  memoryToken = token || null;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage can be blocked in embedded previews */
  }
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export async function api(path, { method = 'GET', body, form = false, signal } = {}) {
  const token = getToken();
  const headers = {};
  if (token) headers['X-AISquare-Session'] = token;

  let payloadBody;
  if (body !== undefined) {
    if (form) {
      payloadBody = body;
    } else {
      headers['Content-Type'] = 'application/json';
      payloadBody = JSON.stringify(body);
    }
  }

  const response = await fetch(apiUrl(path), {
    method,
    headers,
    body: payloadBody,
    credentials: 'include',
    signal,
  });

  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = (data && typeof data === 'object' && data.error) || `Request failed (${response.status})`;
    const error = new ApiError(message, response.status, data);
    if (response.status === 401 && data?.code === 'UNAUTHENTICATED') {
      setToken(null);
      window.dispatchEvent(new CustomEvent('aisquare:unauthenticated'));
    }
    throw error;
  }

  return data;
}

/** Append the session token for iframe/PDF URLs when cookies are blocked. */
export function withSession(url) {
  const target = apiUrl(url);
  const token = getToken();
  if (!token) return target;
  return `${target}${target.includes('?') ? '&' : '?'}sid=${token}`;
}

export const formatDate = (value, opts = {}) => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...opts });
};

export const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

export const relativeTime = (value) => {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(value);
};

export const minutesLabel = (seconds) => {
  if (seconds == null) return '—';
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
};

export const humanDuration = (seconds) => {
  if (seconds == null) return '—';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

export const initials = (name) =>
  String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export const titleCase = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const statusTone = (status) => {
  const value = String(status || '').toLowerCase();
  if (['approved', 'passed', 'active', 'published', 'selected', 'addressed', 'released'].includes(value)) return 'ok';
  if (['pending', 'pending_approval', 'under review', 'in_preparation', 'awaiting review', 'shortlisted', 'submitted'].includes(value)) return 'warn';
  if (['revoked', 'rejected', 'deactivated', 'expired', 'closed', 'danger', 'failed'].includes(value)) return 'danger';
  if (['in_progress', 'new', 'draft', 'scheduled'].includes(value)) return 'info';
  return 'default';
};
