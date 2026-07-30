import { neon } from '@neondatabase/serverless';
import { requireAdmin, hashPassword } from './_utils.js';

const FIELDS = ['id', 'name', 'email', 'tier', 'role', 'badge', 'membership_status', 'created_at'];

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      const users = await sql`
        SELECT id, name, email, tier, role, badge, membership_status, created_at
        FROM users ORDER BY created_at DESC`;
      return res.json(users);
    }

    // Add a user (member or team). Optional password lets them sign in immediately;
    // optional role 'admin' + badge creates a team member in one step.
    if (req.method === 'POST') {
      const { name, email, tier, password, role, badge } = req.body;
      if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
      if (password && password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      if (role !== undefined && !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      if (badge !== undefined && badge !== null && !['team', 'drmerritt'].includes(badge)) return res.status(400).json({ error: 'Invalid badge' });
      const cleanEmail = String(email).trim().toLowerCase();
      const safeTier = ['Free', 'Basic', 'Premium', 'Elite', 'Partner'].includes(tier) ? tier : 'Free';
      const [user] = await sql`
        INSERT INTO users (name, email, tier, password_hash, role, badge, created_at)
        VALUES (${String(name).trim()}, ${cleanEmail}, ${safeTier}, ${password ? hashPassword(password) : null}, ${role || 'member'}, ${badge || null}, NOW())
        ON CONFLICT (email) DO NOTHING
        RETURNING id, name, email, tier, role, badge, membership_status, created_at
      `;
      if (!user) return res.status(409).json({ error: 'Email already exists' });
      return res.status(201).json(user);
    }

    // Update tier / role / badge, or reset a password ({ id, new_password })
    if (req.method === 'PATCH') {
      const { id, tier, role, badge, new_password } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      if (role !== undefined && !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      if (badge !== undefined && badge !== null && !['team', 'drmerritt'].includes(badge)) return res.status(400).json({ error: 'Invalid badge' });
      if (new_password !== undefined && (typeof new_password !== 'string' || new_password.length < 8)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const hasBadge = 'badge' in req.body;
      const [user] = await sql`
        UPDATE users SET
          tier = COALESCE(${tier ?? null}, tier),
          role = COALESCE(${role ?? null}, role),
          badge = CASE WHEN ${hasBadge} THEN ${badge ?? null} ELSE badge END,
          password_hash = COALESCE(${new_password ? hashPassword(new_password) : null}, password_hash)
        WHERE id = ${id}
        RETURNING id, name, email, tier, role, badge, membership_status, created_at
      `;
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json(user);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql`DELETE FROM users WHERE id = ${id}`;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
}
