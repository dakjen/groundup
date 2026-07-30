import { neon } from '@neondatabase/serverless';
import { requireAdmin } from './_utils.js';


export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      const users = await sql`SELECT * FROM users ORDER BY created_at DESC`;
      return res.json(users);
    }

    if (req.method === 'POST') {
      const { name, email, tier } = req.body;
      const [user] = await sql`
        INSERT INTO users (name, email, tier, created_at)
        VALUES (${name}, ${email}, ${tier}, NOW())
        ON CONFLICT (email) DO NOTHING
        RETURNING *
      `;
      return res.json(user || { error: 'Email already exists' });
    }

    if (req.method === 'PATCH') {
      const { id, tier, role, badge } = req.body;
      if (role !== undefined && !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      if (badge !== undefined && badge !== null && !['team', 'drmerritt'].includes(badge)) return res.status(400).json({ error: 'Invalid badge' });
      // Only fields present in the request change; badge may be set to null to clear it
      const hasBadge = 'badge' in req.body;
      const [user] = await sql`
        UPDATE users SET
          tier = COALESCE(${tier ?? null}, tier),
          role = COALESCE(${role ?? null}, role),
          badge = CASE WHEN ${hasBadge} THEN ${badge ?? null} ELSE badge END
        WHERE id = ${id} RETURNING id, name, email, tier, role, badge, created_at
      `;
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
