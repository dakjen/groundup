import { neon } from '@neondatabase/serverless';
import { getSession, getAdmin, TIER_RANK, benefitGate } from './_utils.js';

// Resources & Templates: Premium unlocks resources/templates, Elite adds the
// NREUV partner network (links + referral codes). Admin-editable.

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const admin = getAdmin(req);

  try {
    // ── Digital products shop ──
    // Hidden until settings.shop_live = '1'. Admin always sees everything;
    // members see active products, plus download links ONLY for what they own.
    if (req.method === 'GET' && req.query.products === '1') {
      const [liveRow] = await sql`SELECT value FROM settings WHERE key = 'shop_live'`;
      const live = liveRow?.value === '1';
      if (admin) {
        const rows = await sql`SELECT * FROM products ORDER BY position, id`;
        return res.json({ live, admin: true, products: rows });
      }
      if (!live) return res.json({ live: false, products: [] });
      const session = getSession(req);
      let owned = [];
      let tierRank = 0;
      if (session?.uid) {
        const ents = await sql`SELECT course_id FROM entitlements WHERE user_id = ${session.uid} AND course_id LIKE 'prod:%'`;
        owned = ents.map(e => Number(e.course_id.slice(5)));
        const [u] = await sql`SELECT tier, role, comped, tier_since FROM users WHERE id = ${session.uid} AND membership_status = 'active'`;
        tierRank = TIER_RANK[u?.tier] ?? 0;
        // New paid members wait out the benefit gate before shelf-wide perks kick in
        var gate = u ? await benefitGate(sql, u) : { active: false };
        if (gate.active) tierRank = Math.min(tierRank, 1);
      }
      const rows = await sql`SELECT id, title, description, price_cents, value_cents, cover_url, delivery_url FROM products WHERE active ORDER BY position, id`;
      // Membership perks on the whole shelf: Elite (rank 3) downloads everything;
      // Premium (rank 2) can view everything in the reader but not download.
      // The file URL never leaves the server for anyone below that without a purchase.
      const products = rows.map(p => {
        const bought = owned.includes(p.id);
        const access = bought || tierRank >= 3 ? 'download' : tierRank === 2 ? 'view' : 'buy';
        return {
          id: p.id, title: p.title, description: p.description,
          price_cents: p.price_cents, value_cents: p.value_cents, cover_url: p.cover_url,
          owned: bought, access,
          via: bought ? 'purchase' : tierRank >= 3 ? 'elite' : tierRank === 2 ? 'premium' : null,
          delivery_url: access !== 'buy' ? p.delivery_url : undefined,
        };
      });
      return res.json({ live: true, tier_rank: tierRank, gate: typeof gate !== "undefined" ? gate : { active: false }, products });
    }

    if (req.method === 'POST' && req.body && req.body.action === 'product_save') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const { id, title, description, price_cents, value_cents, cover_url, delivery_url, active, position } = req.body;
      if (!title || !Number.isFinite(Number(price_cents)) || Number(price_cents) < 100) {
        return res.status(400).json({ error: 'Title and a price of at least $1 required' });
      }
      const price = Math.round(Number(price_cents));
      const value = Number.isFinite(Number(value_cents)) && Number(value_cents) > 0 ? Math.round(Number(value_cents)) : null;
      if (id) {
        const [row] = await sql`UPDATE products SET
          title = ${String(title).slice(0, 200)}, description = ${description || null},
          price_cents = ${price}, value_cents = ${value},
          cover_url = ${cover_url || null}, delivery_url = ${delivery_url || null},
          active = ${active !== false}, position = ${Number(position) || 0}
          WHERE id = ${Number(id)} RETURNING *`;
        return res.json({ product: row });
      }
      const [row] = await sql`INSERT INTO products (title, description, price_cents, value_cents, cover_url, delivery_url, active, position, created_at)
        VALUES (${String(title).slice(0, 200)}, ${description || null}, ${price}, ${value}, ${cover_url || null}, ${delivery_url || null}, ${active !== false}, ${Number(position) || 0}, NOW()) RETURNING *`;
      return res.status(201).json({ product: row });
    }

    if (req.method === 'POST' && req.body && req.body.action === 'product_delete') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      await sql`DELETE FROM products WHERE id = ${Number(req.body.id)}`;
      return res.json({ success: true });
    }

    if (req.method === 'POST' && req.body && req.body.action === 'shop_live') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const val = req.body.live ? '1' : '0';
      await sql`INSERT INTO settings (key, value) VALUES ('shop_live', ${val}) ON CONFLICT (key) DO UPDATE SET value = ${val}`;
      return res.json({ success: true, live: val === '1' });
    }

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
