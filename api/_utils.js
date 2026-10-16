import crypto from 'crypto';

// Secret for signing session tokens. Set SESSION_SECRET in Vercel env;
// falls back to a derivation of ADMIN_PASSWORD so nothing breaks before it's set.
function secret() {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error('SESSION_SECRET / ADMIN_PASSWORD not configured');
  return s;
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export function signToken(payload, ttlMs = TOKEN_TTL_MS) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearer(req) {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Returns the token payload if the request carries a valid admin session, else null.
export function getAdmin(req) {
  const payload = verifyToken(bearer(req));
  return payload && payload.role === 'admin' ? payload : null;
}

// Returns payload for any valid session (member or admin), else null.
export function getSession(req) {
  return verifyToken(bearer(req));
}

export function requireAdmin(req, res) {
  const admin = getAdmin(req);
  if (!admin) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  // View-only admins (Dr. Merritt's account) can see everything but change nothing
  if (admin.viewer && req.method !== 'GET') {
    res.status(403).json({ error: 'Your admin access is view-only — ask Dakotah to make this change.' });
    return false;
  }
  return true;
}

// New-member tenure gate. Time with Dr. Merritt is earned with tenure so nobody
// joins, takes her time, and cancels:
//   kind 'meet'      — advisory calls and office hours. Owner after 2 months,
//                      Premium after 4 months (settings benefit_gate_days_owner /
//                      benefit_gate_days_premium override the defaults).
//   kind 'downloads' — Owner's document downloads, after 4 months (benefit_gate_days).
// Comped accounts and team bypass it. Cancel-and-rejoin restarts the clock (tier_since).
export async function benefitGate(sql, user, kind = 'meet') {
  if (!user || user.role === 'admin' || user.comped) return { active: false, until: null, days: 0 };
  let key = null, days = 0;
  if (kind === 'downloads') { if (user.tier === 'Elite') { key = 'benefit_gate_days'; days = 120; } }
  else if (user.tier === 'Elite') { key = 'benefit_gate_days_owner'; days = 60; }
  else if (user.tier === 'Premium') { key = 'benefit_gate_days_premium'; days = 120; }
  if (!key) return { active: false, until: null, days: 0 };
  try {
    const [row] = await sql`SELECT value FROM settings WHERE key = ${key}`;
    const parsed = parseInt(row?.value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) days = parsed;
  } catch { /* default */ }
  if (!days) return { active: false, until: null, days };
  const since = user.tier_since ? new Date(user.tier_since) : null;
  if (!since) return { active: false, until: null, days };
  const until = new Date(since.getTime() + days * 86400000);
  return { active: until > new Date(), until: until.toISOString(), days, months: Math.round(days / 30) };
}

// Password hashing with scrypt (no external deps)
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export const TIER_RANK = { Free: 0, Basic: 1, Builder: 2, Premium: 3, Elite: 4 };
