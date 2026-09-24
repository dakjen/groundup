import { neon } from '@neondatabase/serverless';
import { getSession, getAdmin, TIER_RANK, benefitGate } from './_utils.js';

// Resources & Templates: Premium unlocks resources/templates, Elite adds the
// NREUV partner network (links + referral codes). Admin-editable.

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const admin = getAdmin(req);
  if (admin?.viewer && req.method !== 'GET') return res.status(403).json({ error: 'Your admin access is view-only — ask Dakotah to make this change.' });

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
      const rows = await sql`SELECT id, title, description, price_cents, value_cents, cover_url, delivery_url, is_playbook, page_urls, page_count FROM products WHERE active ORDER BY position, id`;
      // The shelf rules:
      //   Owner (4)  → 5 downloads per billing month, Playbook included
      //   Premium (3)→ read everything, download nothing
      //   Builder (2)→ read everything, download nothing
      //   below      → buy (a purchase is always a full, permanent download)
      //
      // "View" means the PDF is never sent. Those members are served rendered
      // page images instead, so there is no document to save — only pictures of
      // one, watermarked and logged. Anything that renders can be screenshotted;
      // this removes the file, not the screen.
      const DL_LIMIT = 5;
      let dl = null;
      if (tierRank >= 4 && session?.uid) {
        const [me2] = await sql`SELECT tier_since FROM users WHERE id = ${session.uid}`;
        const anchor = me2?.tier_since ? new Date(me2.tier_since) : new Date();
        // current billing period start = latest monthly anniversary of tier_since
        const now = new Date();
        const periodStart = new Date(anchor);
        periodStart.setFullYear(now.getFullYear(), now.getMonth(), anchor.getDate());
        if (periodStart > now) periodStart.setMonth(periodStart.getMonth() - 1);
        const [used] = await sql`SELECT COUNT(*)::int AS n FROM download_log WHERE user_id = ${session.uid} AND created_at >= ${periodStart.toISOString()} AND COALESCE(kind, 'download') = 'download'`;
        const resetAt = new Date(periodStart); resetAt.setMonth(resetAt.getMonth() + 1);
        dl = { limit: DL_LIMIT, used: used?.n || 0, remaining: Math.max(0, DL_LIMIT - (used?.n || 0)), resets_at: resetAt.toISOString() };
      }
      const products = rows.map(p => {
        const bought = owned.includes(p.id);
        let access = 'buy';
        if (bought) access = 'download';          // they own it outright
        else if (tierRank >= 4) access = 'metered'; // 5 a month, through the logged action
        else if (tierRank >= 2) access = 'view';    // Builder and Premium read only
        return {
          id: p.id, title: p.title, description: p.description,
          price_cents: p.price_cents, value_cents: p.value_cents, cover_url: p.cover_url,
          is_playbook: !!p.is_playbook,
          owned: bought, access,
          via: bought ? 'purchase' : tierRank >= 4 ? 'elite' : tierRank >= 2 ? 'premium' : null,
          page_count: p.page_count || (Array.isArray(p.page_urls) ? p.page_urls.length : 0),
          // The PDF URL goes out only to someone who bought it. Owners collect it
          // from product_download so the slot is spent and logged; view-only
          // members get page images and never see the document's address at all.
          delivery_url: access === 'download' ? p.delivery_url : undefined,
          page_urls: access === 'view' && Array.isArray(p.page_urls) ? p.page_urls : undefined,
        };
      });
      return res.json({ live: true, tier_rank: tierRank, dl, gate: typeof gate !== "undefined" ? gate : { active: false }, products });
    }

    // Glossary: every key term, its definition, and which courses discuss it.
    // Any signed-in account (Free included) can read it.
    if (req.method === 'GET' && req.query.glossary === '1') {
      const session = getSession(req);
      if (!admin && !session?.uid) return res.status(401).json({ error: 'Sign in required' });
      const terms = await sql`SELECT id, term, definition, refs FROM glossary ORDER BY term`;
      return res.json({ terms });
    }

    if (req.method === 'POST' && req.body && req.body.action === 'glossary_save') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const term = String(req.body.term || '').trim().slice(0, 120);
      const definition = String(req.body.definition || '').trim().slice(0, 2000);
      const refs = Array.isArray(req.body.refs) ? req.body.refs.slice(0, 10) : [];
      if (!term || !definition) return res.status(400).json({ error: 'Term and definition required' });
      const [row] = await sql`
        INSERT INTO glossary (term, definition, refs, created_at) VALUES (${term}, ${definition}, ${JSON.stringify(refs)}::jsonb, NOW())
        ON CONFLICT (term) DO UPDATE SET definition = ${definition}, refs = ${JSON.stringify(refs)}::jsonb RETURNING *`;
      return res.json(row);
    }

    if (req.method === 'POST' && req.body && req.body.action === 'glossary_delete') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      await sql`DELETE FROM glossary WHERE id = ${Number(req.body.id)}`;
      return res.json({ success: true });
    }

    // Member: mark a lesson complete (or un-mark it). Progress is the member's
    // own bookkeeping — nothing is gated on it.
    if (req.method === 'POST' && req.body && req.body.action === 'lesson_complete') {
      const session = getSession(req);
      if (!session?.uid) return res.status(401).json({ error: 'Sign in required' });
      const course_id = String(req.body.course_id || '').slice(0, 40);
      const idx = Number(req.body.lesson_idx);
      if (!course_id || !Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: 'Bad lesson' });
      if (req.body.done === false) await sql`DELETE FROM lesson_progress WHERE user_id = ${session.uid} AND course_id = ${course_id} AND lesson_idx = ${idx}`;
      else await sql`INSERT INTO lesson_progress (user_id, course_id, lesson_idx) VALUES (${session.uid}, ${course_id}, ${idx}) ON CONFLICT DO NOTHING`;
      const rows = await sql`SELECT lesson_idx FROM lesson_progress WHERE user_id = ${session.uid} AND course_id = ${course_id}`;
      return res.json({ success: true, completed: rows.map(r => r.lesson_idx) });
    }

    // Member: submit a case-study exercise answer. Write-once — the reveal
    // only means something if the answer came first.
    if (req.method === 'POST' && req.body && req.body.action === 'exercise_submit') {
      const session = getSession(req);
      if (!session?.uid) return res.status(401).json({ error: 'Sign in required' });
      const course_id = String(req.body.course_id || '').slice(0, 40);
      const lesson_id = Number(req.body.lesson_id);
      const response = String(req.body.response || '').trim().slice(0, 8000);
      if (!course_id || !Number.isFinite(lesson_id) || !response) return res.status(400).json({ error: 'Write your answer before submitting' });
      const [row] = await sql`
        INSERT INTO lesson_responses (user_id, course_id, lesson_id, response, created_at)
        VALUES (${session.uid}, ${course_id}, ${lesson_id}, ${response}, NOW())
        ON CONFLICT (user_id, course_id, lesson_id) DO NOTHING RETURNING id`;
      if (!row) return res.status(409).json({ error: 'You already submitted your answer for this study' });
      return res.status(201).json({ success: true });
    }

    // Member: count a resource click — fire-and-forget from the Resources page
    if (req.method === 'POST' && req.body && req.body.action === 'resource_click') {
      const session = getSession(req);
      const rid = Number(req.body.id);
      if (rid && session?.uid) await sql`INSERT INTO resource_clicks (resource_id, user_id, created_at) VALUES (${rid}, ${session.uid}, NOW())`;
      return res.json({ success: true });
    }

    if (req.method === 'POST' && req.body && req.body.action === 'product_save') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const { id, title, description, price_cents, value_cents, cover_url, delivery_url, active, position, is_playbook, page_urls } = req.body;
      const pages = Array.isArray(page_urls) ? page_urls.filter(u => typeof u === 'string' && u).slice(0, 500) : null;
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
          page_urls = COALESCE(${pages ? JSON.stringify(pages) : null}::jsonb, page_urls),
          page_count = COALESCE(${pages ? pages.length : null}, page_count),
          active = ${active !== false}, position = ${Number(position) || 0}
          WHERE id = ${Number(id)} RETURNING *`;
        return res.json({ product: row });
      }
      const [row] = await sql`INSERT INTO products (title, description, price_cents, value_cents, cover_url, delivery_url, is_playbook, page_urls, page_count, active, position, created_at)
        VALUES (${String(title).slice(0, 200)}, ${description || null}, ${price}, ${value}, ${cover_url || null}, ${delivery_url || null}, ${!!is_playbook}, ${pages ? JSON.stringify(pages) : null}::jsonb, ${pages ? pages.length : 0}, ${active !== false}, ${Number(position) || 0}, NOW()) RETURNING *`;
      return res.status(201).json({ product: row });
    }

    // Bulk import from a spreadsheet. Everything lands INACTIVE: a row carries a
    // title, price, value and description but no document, and a product with
    // nothing to deliver must never be buyable. Attach each PDF, then publish.
    if (req.method === 'POST' && req.body && req.body.action === 'product_import') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
      if (!rows.length) return res.status(400).json({ error: 'Nothing to import' });
      if (rows.length > 200) return res.status(400).json({ error: 'That is more than 200 rows — split the file' });

      const [mx] = await sql`SELECT COALESCE(MAX(position), 0) AS p FROM products`;
      let pos = Number(mx?.p || 0);
      const created = [], skipped = [];

      for (let i = 0; i < rows.length; i++) {
        const line = Number(rows[i]?.line) || i + 1; // nth data row, not the file line
        const title = String(rows[i]?.title || '').trim().slice(0, 200);
        if (!title) { skipped.push({ line, title: '', reason: 'No title' }); continue; }

        const price = Math.round(Number(rows[i]?.price_cents));
        if (!Number.isFinite(price) || price < 100) {
          skipped.push({ line, title, reason: 'Price must be at least $1' });
          continue;
        }
        const rawValue = Number(rows[i]?.value_cents);
        const value = Number.isFinite(rawValue) && rawValue > 0 ? Math.round(rawValue) : null;

        // Re-importing the same sheet shouldn't double the shelf.
        const [dupe] = await sql`SELECT id FROM products WHERE lower(title) = lower(${title}) LIMIT 1`;
        if (dupe) { skipped.push({ line, title, reason: 'Already in the shop' }); continue; }

        pos++;
        const [row] = await sql`INSERT INTO products (title, description, price_cents, value_cents, cover_url, delivery_url, is_playbook, active, position, created_at)
          VALUES (${title}, ${String(rows[i]?.description || '').trim() || null}, ${price}, ${value}, NULL, NULL, FALSE, FALSE, ${pos}, NOW())
          RETURNING id, title, price_cents, value_cents`;
        created.push(row);
      }
      return res.json({ created: created.length, skipped, products: created });
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
      if (bought) return res.json({ url: p.delivery_url }); // they bought it; it's theirs
      if (rank < 4) return res.status(403).json({ error: 'Downloading is an Owner benefit — your plan reads everything in the viewer.' });
      const anchor = u?.tier_since ? new Date(u.tier_since) : new Date();
      const now = new Date();
      const periodStart = new Date(anchor);
      periodStart.setFullYear(now.getFullYear(), now.getMonth(), anchor.getDate());
      if (periodStart > now) periodStart.setMonth(periodStart.getMonth() - 1);
      const [used] = await sql`SELECT COUNT(*)::int AS n FROM download_log WHERE user_id = ${session.uid} AND created_at >= ${periodStart.toISOString()} AND COALESCE(kind, 'download') = 'download'`;
      if ((used?.n || 0) >= 5) {
        const resetAt = new Date(periodStart); resetAt.setMonth(resetAt.getMonth() + 1);
        return res.status(403).json({ error: `You've used your 5 downloads this month — they reset on ${resetAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.` });
      }
      await sql`INSERT INTO download_log (user_id, product_id, kind, created_at) VALUES (${session.uid}, ${p.id}, 'download', NOW())`;
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
      const rows = await sql`SELECT id, title, description, stage, stage_color, duration, series, lessons, hidden FROM courses ORDER BY position, id`;
      // Team gets full lessons (for the admin preview) INCLUDING unpublished
      // drafts; everyone else gets published courses only, id + title per lesson
      const catalog = rows
        .filter(c => admin || !c.hidden)
        .map(c => ({
          id: c.id, title: c.title, description: c.description,
          stage: c.stage, stageColor: c.stage_color, duration: c.duration, series: c.series || null,
          hidden: admin ? !!c.hidden : undefined,
          lessons: admin ? (c.lessons || []) : (c.lessons || []).map(l => ({ id: l.id, title: l.title })),
        }));
      // Progress per course for the signed-in member — powers the bars on the courses page
      let progress = {};
      const sess = getSession(req);
      if (sess?.uid) {
        try {
          const rows = await sql`SELECT course_id, COUNT(*)::int AS n FROM lesson_progress WHERE user_id = ${sess.uid} GROUP BY course_id`;
          for (const r of rows) progress[r.course_id] = r.n;
        } catch { /* table appears after migrate */ }
      }
      return res.json({ courses: catalog, progress });
    }

    // ── Full course content: server-enforced entitlements ──
    // The lesson bodies never ship in the JS bundle; they only leave the
    // database for someone this block says is allowed to read them.
    if (req.method === 'GET' && req.query.course) {
      const [c] = await sql`SELECT id, title, description, stage, stage_color, duration, series, lessons, hidden FROM courses WHERE id = ${req.query.course}`;
      if (!c) return res.status(404).json({ error: 'Course not found' });
      // Unpublished drafts exist only for the team — invisible to members
      if (c.hidden && !admin) return res.status(404).json({ error: 'Course not found' });
      const shape = (full) => ({
        id: c.id, title: c.title, description: c.description,
        stage: c.stage, stageColor: c.stage_color, duration: c.duration, series: c.series || null,
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
      // Case-study exercises: hand back this member's saved answers so a
      // submitted study stays submitted (and the reveal stays revealed).
      let myResponses = {};
      let completed = [];
      try { completed = (await sql`SELECT lesson_idx FROM lesson_progress WHERE user_id = ${user.id} AND course_id = ${c.id}`).map(r => r.lesson_idx); } catch {}
      try {
        const rows = await sql`SELECT lesson_id, response, created_at FROM lesson_responses WHERE user_id = ${user.id} AND course_id = ${c.id}`;
        for (const r of rows) myResponses[r.lesson_id] = { response: r.response, at: r.created_at };
      } catch { /* table appears after migrate */ }
      if (fullAccess) return res.json({ course: shape(() => true), access: 'full', responses: myResponses, completed });

      // Free plan: the curriculum is the preview — every lesson title visible,
      // zero lesson content. (Accounts that claimed the old free lesson keep it.)
      const freeKey = user.free_lesson_key || null;
      return res.json({
        course: shape(i => freeKey === `${c.id}:${i}`),
        access: 'free',
        free_lesson_key: freeKey,
        completed,
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
          // Free accounts: videos stay (lesson content); documents — the pdf
          // and every material — are a membership benefit.
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
      // Every cohort gets its own private channel — visible only to members
      // whose account carries this partner_slug (and the team).
      try {
        const [chExists] = await sql`SELECT id FROM channels WHERE partner_slug = ${slug}`;
        if (!chExists) {
          const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM channels`;
          await sql`INSERT INTO channels (slug, name, description, min_tier, admin_only_post, position, team_only, partner_slug, created_at)
            VALUES (${'cohort-' + slug}, ${name + ' Cohort'}, ${'The private room for the ' + name + ' cohort — just your group and Dr. Merritt.'}, 'Free', FALSE, ${n}, FALSE, ${slug}, NOW())`;
        }
      } catch (e) { console.error('cohort channel create failed', e); }
      return res.json({ success: true, partner: row });
    }
    if (req.method === 'POST' && req.body && req.body.action === 'partner_delete') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      await sql`DELETE FROM partners WHERE id = ${Number(req.body.id)}`;
      return res.json({ success: true });
    }

    // Team: set how many Lifetime Passes may ever be sold (0 = off sale)
    if (req.method === 'POST' && req.body && req.body.action === 'set_lifetime_cap') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const cap = Math.max(0, Math.min(10000, parseInt(req.body.cap, 10) || 0));
      await sql`INSERT INTO settings (key, value) VALUES ('lifetime_cap', ${String(cap)}) ON CONFLICT (key) DO UPDATE SET value = ${String(cap)}`;
      return res.json({ success: true, cap });
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
        const rows = await sql`
          SELECT r.*,
            COALESCE(c.clicks, 0)::int AS clicks,
            COALESCE(c.people, 0)::int AS clickers,
            c.last_click
          FROM resources r
          LEFT JOIN (
            SELECT resource_id, COUNT(*) AS clicks, COUNT(DISTINCT user_id) AS people, MAX(created_at) AS last_click
            FROM resource_clicks GROUP BY resource_id
          ) c ON c.resource_id = r.id
          ORDER BY r.category, r.position, r.id`;
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
      const { title, description, url, code, category, min_tier, position, recommendation, phase } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });
      if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); } }
      const safeCat = ['resource', 'template', 'partner'].includes(category) ? category : 'resource';
      const safeTier = ['Premium', 'Elite'].includes(min_tier) ? min_tier : 'Premium';
      const safePhase = phase >= 1 && phase <= 9 ? Number(phase) : null;
      const [row] = await sql`
        INSERT INTO resources (title, description, url, code, category, min_tier, position, recommendation, phase, created_at)
        VALUES (${String(title).trim()}, ${description || null}, ${url || null}, ${code || null}, ${safeCat}, ${safeTier}, ${Number(position) || 0}, ${recommendation || null}, ${safePhase}, NOW())
        RETURNING *`;
      return res.status(201).json(row);
    }

    if (req.method === 'PATCH') {
      const { id, title, description, url, code, category, min_tier, position, recommendation, phase } = req.body;
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
          recommendation = COALESCE(${recommendation ?? null}, recommendation),
          phase = CASE WHEN ${phase !== undefined} THEN ${phase >= 1 && phase <= 9 ? Number(phase) : null} ELSE phase END
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
