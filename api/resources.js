import { neon } from '@neondatabase/serverless';
import { getSession, getAdmin, TIER_RANK } from './_utils.js';

// Resources & Templates: Premium unlocks resources/templates, Elite adds the
// NREUV partner network (links + referral codes). Admin-editable.

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const admin = getAdmin(req);

  try {
    if (req.method === 'GET') {
      if (admin) {
        const rows = await sql`SELECT * FROM resources ORDER BY category, position, id`;
        return res.json({ resources: rows });
      }
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Sign in required' });
      const [user] = await sql`SELECT tier, membership_status FROM users WHERE id = ${session.uid}`;
      if (!user || user.membership_status !== 'active') return res.status(401).json({ error: 'Sign in required' });
      const rank = TIER_RANK[user.tier] ?? 0;
      const rows = await sql`SELECT * FROM resources ORDER BY category, position, id`;
      const visible = rows.filter(r => rank >= (TIER_RANK[r.min_tier] ?? 2));
      return res.json({ resources: visible, tier: user.tier });
    }

    if (!admin) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const { title, description, url, code, category, min_tier, position } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });
      if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); } }
      const safeCat = ['resource', 'template', 'partner'].includes(category) ? category : 'resource';
      const safeTier = ['Premium', 'Elite'].includes(min_tier) ? min_tier : 'Premium';
      const [row] = await sql`
        INSERT INTO resources (title, description, url, code, category, min_tier, position, created_at)
        VALUES (${String(title).trim()}, ${description || null}, ${url || null}, ${code || null}, ${safeCat}, ${safeTier}, ${Number(position) || 0}, NOW())
        RETURNING *`;
      return res.status(201).json(row);
    }

    if (req.method === 'PATCH') {
      const { id, title, description, url, code, category, min_tier, position } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); } }
      const [row] = await sql`
        UPDATE resources SET
          title = COALESCE(${title ?? null}, title),
          description = COALESCE(${description ?? null}, description),
          url = COALESCE(${url ?? null}, url),
          code = COALESCE(${code ?? null}, code),
          category = COALESCE(${category ?? null}, category),
          min_tier = COALESCE(${min_tier ?? null}, min_tier),
          position = COALESCE(${position ?? null}, position)
        WHERE id = ${id} RETURNING *`;
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.json(row);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql`DELETE FROM resources WHERE id = ${id}`;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
