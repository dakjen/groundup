import { neon } from '@neondatabase/serverless';
import { getSession, getAdmin, TIER_RANK } from './_utils.js';

// Resources & Templates: Premium unlocks resources/templates, Elite adds the
// NREUV partner network (links + referral codes). Admin-editable.

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const admin = getAdmin(req);

  try {
    // ── Course catalog: titles and descriptions only, safe to show anyone ──
    if (req.method === 'GET' && req.query.courses === '1') {
      const rows = await sql`SELECT id, title, description, stage, stage_color, duration, lessons FROM courses ORDER BY position, id`;
      // Team gets full lessons (for the admin preview); everyone else gets
      // id + title only — enough for cards and locked lists
      const catalog = rows.map(c => ({
        id: c.id, title: c.title, description: c.description,
        stage: c.stage, stageColor: c.stage_color, duration: c.duration,
        lessons: admin ? (c.lessons || []) : (c.lessons || []).map(l => ({ id: l.id, title: l.title })),
      }));
      return res.json({ courses: catalog });
    }

    // ── Full course content: server-enforced entitlements ──
    // The lesson bodies never ship in the JS bundle; they only leave the
    // database for someone this block says is allowed to read them.
    if (req.method === 'GET' && req.query.course) {
      const [c] = await sql`SELECT id, title, description, stage, stage_color, duration, lessons FROM courses WHERE id = ${req.query.course}`;
      if (!c) return res.status(404).json({ error: 'Course not found' });
      const shape = (full) => ({
        id: c.id, title: c.title, description: c.description,
        stage: c.stage, stageColor: c.stage_color, duration: c.duration,
        lessons: (c.lessons || []).map((l, i) => full(i) ? { ...l, locked: false } : { id: l.id, title: l.title, locked: true }),
      });
      if (admin) return res.json({ course: shape(() => true), access: 'team' });

      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Sign in required' });
      const [user] = await sql`SELECT id, tier, membership_status, free_lesson_key FROM users WHERE id = ${session.uid}`;
      if (!user) return res.status(401).json({ error: 'Sign in required' });

      const active = user.membership_status === 'active';
      const rank = active ? (TIER_RANK[user.tier] ?? 0) : 0;
      const passes = active ? await sql`
        SELECT course_id FROM entitlements
        WHERE user_id = ${user.id} AND course_id IN ('all', ${c.id})
          AND (expires_at IS NULL OR expires_at > NOW())` : [];
      const fullAccess = rank >= 1 || passes.length > 0;
      if (fullAccess) return res.json({ course: shape(() => true), access: 'full' });

      // Free plan: exactly one lesson total, and only after it's been claimed
      // (claim_free_lesson in api/auth.js). Keys are `${courseId}:${index}`.
      const freeKey = user.free_lesson_key || null;
      return res.json({
        course: shape(i => freeKey === `${c.id}:${i}`),
        access: 'free',
        free_lesson_key: freeKey,
      });
    }

    // Lesson attachments (PDFs/videos per lesson) — readable by any signed-in member
    if (req.method === 'GET' && req.query.attachments === '1') {
      const session = getSession(req);
      if (!admin && (!session || !session.uid)) return res.status(401).json({ error: 'Sign in required' });
      const [row] = await sql`SELECT value FROM settings WHERE key = 'lesson_attachments'`;
      return res.json({ attachments: row?.value ? JSON.parse(row.value) : {} });
    }

    if (req.method === 'POST' && req.body && req.body.action === 'set_attachments') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const val = JSON.stringify(req.body.attachments || {});
      if (val.length > 200000) return res.status(400).json({ error: 'Too large' });
      await sql`INSERT INTO settings (key, value) VALUES ('lesson_attachments', ${val}) ON CONFLICT (key) DO UPDATE SET value = ${val}`;
      return res.json({ success: true });
    }

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
      const { title, description, url, code, category, min_tier, position, recommendation } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });
      if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); } }
      const safeCat = ['resource', 'template', 'partner'].includes(category) ? category : 'resource';
      const safeTier = ['Premium', 'Elite'].includes(min_tier) ? min_tier : 'Premium';
      const [row] = await sql`
        INSERT INTO resources (title, description, url, code, category, min_tier, position, recommendation, created_at)
        VALUES (${String(title).trim()}, ${description || null}, ${url || null}, ${code || null}, ${safeCat}, ${safeTier}, ${Number(position) || 0}, ${recommendation || null}, NOW())
        RETURNING *`;
      return res.status(201).json(row);
    }

    if (req.method === 'PATCH') {
      const { id, title, description, url, code, category, min_tier, position, recommendation } = req.body;
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
          position = COALESCE(${position ?? null}, position),
          recommendation = COALESCE(${recommendation ?? null}, recommendation)
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
