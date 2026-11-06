import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N: SCRYPT_N, r: 8, p: 1 }).toString('hex');
  return `scrypt$${SCRYPT_N}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto
      .scryptSync(String(password), salt, KEYLEN, { N: Number(n) || SCRYPT_N, r: 8, p: 1 })
      .toString('hex');
    const a = Buffer.from(candidate, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function passwordProblem(password) {
  const value = String(password ?? '');
  if (value.length < 8) return 'Password must be at least 8 characters.';
  if (value.length > 200) return 'Password is too long.';
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}
