import { neon } from '@neondatabase/serverless';
import { signToken, getSession, hashPassword, verifyPassword } from './_utils.js';

const PUBLIC_FIELDS = 'id, name, email, tier, role, membership_status, created_at';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const action = req.query.action || (req.body && req.body.action);

  try {
    // GET /api/auth  → current session's user
    if (req.method === 'GET') {
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Not signed in' });
      const [user] = await sql`SELECT id, name, email, tier, role, membership_status, free_lesson_key, created_at FROM users WHERE id = ${session.uid}`;
      if (!user) return res.status(401).json({ error: 'Account not found' });
      // Active one-time passes: course_id 'all' or 'mc1'..'mc4', unexpired
      user.entitlements = await sql`SELECT course_id, expires_at FROM entitlements WHERE user_id = ${user.id} AND (expires_at IS NULL OR expires_at > NOW())`;
      return res.json({ user });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (action === 'signup') {
      const { name, email, password, tier } = req.body;
      if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const cleanEmail = String(email).trim().toLowerCase();
      const safeTier = ['Free', 'Basic', 'Premium', 'Elite'].includes(tier) ? tier : 'Free';
      const [user] = await sql`
        INSERT INTO users (name, email, tier, password_hash, role, created_at)
        VALUES (${String(name).trim()}, ${cleanEmail}, ${safeTier}, ${hashPassword(password)}, 'member', NOW())
        ON CONFLICT (email) DO NOTHING
        RETURNING id, name, email, tier, role, membership_status, free_lesson_key, created_at
      `;
      if (!user) return res.status(409).json({ error: 'An account with that email already exists' });
      const token = signToken({ uid: user.id, role: 'member' });
      return res.status(201).json({ user, token });
    }

    if (action === 'login') {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
      const cleanEmail = String(email).trim().toLowerCase();
      const [user] = await sql`SELECT * FROM users WHERE email = ${cleanEmail}`;
      if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      const token = signToken({ uid: user.id, role: user.role === 'admin' ? 'admin' : 'member' });
      const { password_hash, ...safe } = user;
      safe.entitlements = await sql`SELECT course_id, expires_at FROM entitlements WHERE user_id = ${user.id} AND (expires_at IS NULL OR expires_at > NOW())`;
      return res.json({ user: safe, token });
    }

    // Free plan: claim the single free lesson. Only succeeds if none is claimed yet
    // (or the same one is re-claimed), so it can never be switched later.
    if (action === 'claim_free_lesson') {
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Not signed in' });
      const { key } = req.body;
      if (!key || !/^mc\d+:\d+$/.test(key)) return res.status(400).json({ error: 'Invalid lesson key' });
      const [user] = await sql`
        UPDATE users SET free_lesson_key = ${key}
        WHERE id = ${session.uid} AND (free_lesson_key IS NULL OR free_lesson_key = ${key})
        RETURNING id, name, email, tier, role, membership_status, free_lesson_key, created_at
      `;
      if (!user) return res.status(409).json({ error: 'Free lesson already used' });
      return res.json({ user });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
