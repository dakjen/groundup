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
        var gate = { active: false }; // shop perks are metered by the monthly cap, not the time gate
      }
      const rows = await sql`SELECT id, title, description, price_cents, value_cents, cover_url, delivery_url, is_playbook FROM products WHERE active ORDER BY position, id`;
      // The shelf rules:
      //   Elite (4)  → unlimited downloads, Playbook included
      //   Premium (3)→ 3 downloads per billing month (guides & templates);
      //                the Developer's Playbook stays view-only
      //   Builder (2)→ view-only across everything
      //   below      → buy (a purchase is always a full, permanent download)
      let dl = null;
      if (tierRank === 3 && session?.uid) {
        const [me2] = await sql`SELECT tier_since FROM users WHERE id = ${session.uid}`;
        const anchor = me2?.tier_since ? new Date(me2.tier_since) : new Date();
        // current billing period start = latest monthly anniversary of tier_since
        const now = new Date();
        const periodStart = new Date(anchor);
        periodStart.setFullYear(now.getFullYear(), now.getMonth(), anchor.getDate());
        if (periodStart > now) periodStart.setMonth(periodStart.getMonth() - 1);
        const [used] = await sql`SELECT COUNT(*)::int AS n FROM download_log WHERE user_id = ${session.uid} AND created_at >= ${periodStart.toISOString()}`;
        const resetAt = new Date(periodStart); resetAt.setMonth(resetAt.getMonth() + 1);
        dl = { limit: 3, used: used?.n || 0, remaining: Math.max(0, 3 - (used?.n || 0)), resets_at: resetAt.toISOString() };
      }
      const products = rows.map(p => {
        const bought = owned.includes(p.id);
        let access = 'buy';
        if (bought || tierRank >= 4) access = 'download';
        else if (tierRank === 3) access = p.is_playbook ? 'view' : 'metered';
        else if (tierRank === 2) access = 'view';
        return {
          id: p.id, title: p.title, description: p.description,
          price_cents: p.price_cents, value_cents: p.value_cents, cover_url: p.cover_url,
          is_playbook: !!p.is_playbook,
          owned: bought, access,
          via: bought ? 'purchase' : tierRank >= 4 ? 'elite' : tierRank >= 2 ? 'premium' : null,
          // metered downloads go through the product_download action, never a bare URL
          delivery_url: access === 'download' || access === 'view' ? p.delivery_url : undefined,
        };
      });
      return res.json({ live: true, tier_rank: tierRank, dl, gate: typeof gate !== "undefined" ? gate : { active: false }, products });
    }

    if (req.method === 'POST' && req.body && req.body.action === 'product_save') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const { id, title, description, price_cents, value_cents, cover_url, delivery_url, active, position, is_playbook } = req.body;
      if (!title || !Number.isFinite(Number(price_cents)) || Number(price_cents) < 100) {
        return res.status(400).json({ error: 'Title and a price of at least $1 required' });
      }
      const price = Math.round(Number(price_cents));
      const value = Number.isFinite(Number(value_cents)) && Number(value_cents) > 0 ? Math.round(Number(value_cents)) : null;
      if (id) {
        const [row] = await sql`UPDATE products SET
          title = ${String(title).slice(0, 200)}, description = ${description || null},
          price_cents = ${price}, value_cents = ${value},
          cover_url = ${cover_url || null}, delivery_url = ${delivery_url || null}, is_playbook = ${!!is_playbook},
          active = ${active !== false}, position = ${Number(position) || 0}
          WHERE id = ${Number(id)} RETURNING *`;
        return res.json({ product: row });
      }
      const [row] = await sql`INSERT INTO products (title, description, price_cents, value_cents, cover_url, delivery_url, is_playbook, active, position, created_at)
        VALUES (${String(title).slice(0, 200)}, ${description || null}, ${price}, ${value}, ${cover_url || null}, ${delivery_url || null}, ${!!is_playbook}, ${active !== false}, ${Number(position) || 0}, NOW()) RETURNING *`;
      return res.status(201).json({ product: row });
    }

    // Premium's metered download: burns one of the 3 monthly slots, returns the file
    if (req.method === 'POST' && req.body && req.body.action === 'product_download') {
      const session = getSession(req);
      if (!session?.uid) return res.status(401).json({ error: 'Sign in required' });
      const [u] = await sql`SELECT tier, tier_since FROM users WHERE id = ${session.uid} AND membership_status = 'active'`;
      const rank = TIER_RANK[u?.tier] ?? 0;
      const [p] = await sql`SELECT id, delivery_url, is_playbook FROM products WHERE id = ${Number(req.body.id)} AND active`;
      if (!p || !p.delivery_url) return res.status(404).json({ error: 'Product not found' });
      const [bought] = await sql`SELECT id FROM entitlements WHERE user_id = ${session.uid} AND course_id = ${'prod:' + p.id} LIMIT 1`;
      if (bought || rank >= 4) return res.json({ url: p.delivery_url }); // owners & Elite: unlimited
      if (rank !== 3) return res.status(403).json({ error: 'Downloads are a Premium and Elite benefit' });
      if (p.is_playbook) return res.status(403).json({ error: "The Developer's Playbook is view-only on Premium — Elite members can download it" });
      const anchor = u?.tier_since ? new Date(u.tier_since) : new Date();
      const now = new Date();
      const periodStart = new Date(anchor);
      periodStart.setFullYear(now.getFullYear(), now.getMonth(), anchor.getDate());
      if (periodStart > now) periodStart.setMonth(periodStart.getMonth() - 1);
      const [used] = await sql`SELECT COUNT(*)::int AS n FROM download_log WHERE user_id = ${session.uid} AND created_at >= ${periodStart.toISOString()}`;
      if ((used?.n || 0) >= 3) {
        const resetAt = new Date(periodStart); resetAt.setMonth(resetAt.getMonth() + 1);
        return res.status(403).json({ error: `You've used your 3 downloads this month — they reset on ${resetAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.` });
      }
      await sql`INSERT INTO download_log (user_id, product_id, created_at) VALUES (${session.uid}, ${p.id}, NOW())`;
      return res.json({ url: p.delivery_url });
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
      const rows = await sql`SELECT id, title, description, stage, stage_color, duration, lessons, hidden FROM courses ORDER BY position, id`;
      // Team gets full lessons (for the admin preview) INCLUDING unpublished
      // drafts; everyone else gets published courses only, id + title per lesson
      const catalog = rows
        .filter(c => admin || !c.hidden)
        .map(c => ({
          id: c.id, title: c.title, description: c.description,
          stage: c.stage, stageColor: c.stage_color, duration: c.duration,
          hidden: admin ? !!c.hidden : undefined,
          lessons: admin ? (c.lessons || []) : (c.lessons || []).map(l => ({ id: l.id, title: l.title })),
        }));
      return res.json({ courses: catalog });
    }

    // ── Full course content: server-enforced entitlements ──
    // The lesson bodies never ship in the JS bundle; they only leave the
    // database for someone this block says is allowed to read them.
    if (req.method === 'GET' && req.query.course) {
      const [c] = await sql`SELECT id, title, description, stage, stage_color, duration, lessons, hidden FROM courses WHERE id = ${req.query.course}`;
      if (!c) return res.status(404).json({ error: 'Course not found' });
      // Unpublished drafts exist only for the team — invisible to members
      if (c.hidden && !admin) return res.status(404).json({ error: 'Course not found' });
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

    // Lesson attachments (PDFs/videos per lesson). Videos are part of the lesson
    // for anyone with course access; PDF downloads (worksheets, case-study docs)
    // are a MEMBERSHIP benefit — pass and trial holders read lessons but don't
    // take the documents with them.
    if (req.method === 'GET' && req.query.attachments === '1') {
      const session = getSession(req);
      if (!admin && (!session || !session.uid)) return res.status(401).json({ error: 'Sign in required' });
      const [row] = await sql`SELECT value FROM settings WHERE key = 'lesson_attachments'`;
      let atts = row?.value ? JSON.parse(row.value) : {};
      if (!admin) {
        const [u] = await sql`SELECT tier FROM users WHERE id = ${session.uid} AND membership_status = 'active'`;
        if ((TIER_RANK[u?.tier] ?? 0) < 1) {
          atts = Object.fromEntries(Object.entries(atts)
            .map(([k, v]) => [k, { ...(v.video ? { video: v.video } : {}) }])
            .filter(([, v]) => Object.keys(v).length));
        }
      }
      return res.json({ attachments: atts });
    }

    // ── Partner pages: a company's branded curriculum at /partner/<slug> ──
    // Public: the partner's name + logo and ONLY the published courses on their
    // list (titles/descriptions — lesson content stays entitlement-gated).
    if (req.method === 'GET' && req.query.partner) {
      const [p] = await sql`SELECT slug, name, logo_url, course_ids FROM partners WHERE slug = ${String(req.query.partner).toLowerCase()} AND active`;
      if (!p) return res.status(404).json({ error: 'Partner not found' });
      const ids = Array.isArray(p.course_ids) ? p.course_ids : [];
      const rows = ids.length ? await sql`SELECT id, title, description, stage, stage_color, duration, lessons FROM courses WHERE id = ANY(${ids}) AND NOT COALESCE(hidden, FALSE) ORDER BY position` : [];
      return res.json({ partner: { slug: p.slug, name: p.name, logo_url: p.logo_url },
        courses: rows.map(c => ({ id: c.id, title: c.title, description: c.description, stage: c.stage, stageColor: c.stage_color, duration: c.duration, lessonCount: (c.lessons || []).length })) });
    }
    if (req.method === 'GET' && req.query.partners === '1') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const rows = await sql`SELECT * FROM partners ORDER BY created_at DESC`;
      return res.json({ partners: rows });
    }
    if (req.method === 'POST' && req.body && req.body.action === 'partner_save') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const slug = String(req.body.slug || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const name = String(req.body.name || '').trim();
      if (!slug || !name) return res.status(400).json({ error: 'Name and slug required' });
      const courseIds = (Array.isArray(req.body.course_ids) ? req.body.course_ids : []).map(String).slice(0, 50);
      const logo = req.body.logo_url ? String(req.body.logo_url) : null;
      const active = req.body.active !== false;
      const [row] = await sql`INSERT INTO partners (slug, name, logo_url, course_ids, active, created_at)
        VALUES (${slug}, ${name}, ${logo}, ${JSON.stringify(courseIds)}, ${active}, NOW())
        ON CONFLICT (slug) DO UPDATE SET name = ${name}, logo_url = ${logo}, course_ids = ${JSON.stringify(courseIds)}, active = ${active}
        RETURNING *`;
      return res.json({ success: true, partner: row });
    }
    if (req.method === 'POST' && req.body && req.body.action === 'partner_delete') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      await sql`DELETE FROM partners WHERE id = ${Number(req.body.id)}`;
      return res.json({ success: true });
    }

    // Publish / unpublish a course — drafts load invisible, one click ships them
    if (req.method === 'POST' && req.body && req.body.action === 'course_publish') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const hidden = !!req.body.hidden;
      const [row] = await sql`UPDATE courses SET hidden = ${hidden} WHERE id = ${String(req.body.id || '')} RETURNING id, hidden`;
      if (!row) return res.status(404).json({ error: 'Course not found' });
      return res.json({ success: true, id: row.id, hidden: row.hidden });
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
