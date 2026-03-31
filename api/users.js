import { neon } from '@neondatabase/serverless';

function requireAdmin(req, res) {
  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

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
      const { id, tier } = req.body;
      const [user] = await sql`
        UPDATE users SET tier = ${tier} WHERE id = ${id} RETURNING *
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
