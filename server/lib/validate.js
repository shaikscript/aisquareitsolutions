export function str(value, { max = 5000, min = 0, field = 'Field' } = {}) {
  const out = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  if (out.length < min) throw new HttpError(400, `${field} is required.`);
  if (out.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  return out;
}

export function optionalStr(value, max = 5000) {
  const out = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  return out.slice(0, max);
}

export function email(value) {
  const out = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out)) throw new HttpError(400, 'Enter a valid email address.');
  return out;
}

export function int(value, { min = 0, max = 1000000, fallback = 0 } = {}) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

export function json(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

export function paginate(req, defaultPageSize = 20) {
  const page = Math.max(1, int(req.query.page, { fallback: 1, max: 100000 }));
  const pageSize = Math.min(100, Math.max(5, int(req.query.pageSize, { fallback: defaultPageSize, max: 100 })));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
