import { neon } from '@neondatabase/serverless';
import { getSession, getAdmin } from './_utils.js';
import { sendEmail } from './_email.js';

// Senior Advisor retainers: clients see their own workspace; the team sees the roster.
export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const admin = getAdmin(req);
  const session = getSession(req);

  const monthUsed = async (rid) => {
    const [r] = await sql`
      SELECT COALESCE(SUM(hours), 0)::float AS used FROM retainer_hours
      WHERE retainer_id = ${rid} AND logged_on >= date_trunc('month', CURRENT_DATE)`;
    return r.used;
  };

  try {
    if (req.method === 'GET') {
      // Admin roster
      if (admin && req.query.admin === '1') {
        const rows = await sql`
          SELECT r.*, u.name, u.email FROM retainers r
          JOIN users u ON u.id = r.user_id ORDER BY r.status, r.created_at DESC`;
        for (const r of rows) {
          r.used_this_month = await monthUsed(r.id);
          r.log = await sql`SELECT * FROM retainer_hours WHERE retainer_id = ${r.id} ORDER BY logged_on DESC, id DESC LIMIT 20`;
          r.files = await sql`SELECT * FROM retainer_files WHERE retainer_id = ${r.id} ORDER BY created_at DESC`;
          r.messages = await sql`SELECT * FROM retainer_messages WHERE retainer_id = ${r.id} ORDER BY created_at ASC LIMIT 200`;
        }
        const mrr = rows.filter(r => r.status === 'active').reduce((a, r) => a + Number(r.monthly_amount), 0);
        const [callRow] = await sql`SELECT value FROM settings WHERE key = 'advisor_call_link'`;
        return res.json({ retainers: rows, mrr, call_link: callRow?.value || '' });
      }
      // Member's own retainer
      if (!session?.uid) return res.status(401).json({ error: 'Sign in required' });
      const [r] = await sql`SELECT * FROM retainers WHERE user_id = ${session.uid} AND status IN ('active','offered') ORDER BY created_at DESC LIMIT 1`;
      if (!r) return res.json({ retainer: null });
      if (r.status === 'offered') return res.json({ retainer: { id: r.id, status: 'offered', notes: r.notes } });
      r.used_this_month = await monthUsed(r.id);
      r.log = await sql`SELECT hours, note, logged_on FROM retainer_hours WHERE retainer_id = ${r.id} ORDER BY logged_on DESC LIMIT 12`;
      r.files = await sql`SELECT * FROM retainer_files WHERE retainer_id = ${r.id} ORDER BY created_at DESC`;
      r.messages = await sql`SELECT * FROM retainer_messages WHERE retainer_id = ${r.id} ORDER BY created_at ASC LIMIT 200`;
      return res.json({ retainer: r });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const action = req.body?.action;

    // Client requests time against their retainer
    if (action === 'request_time') {
      if (!session?.uid) return res.status(401).json({ error: 'Sign in required' });
      const [r] = await sql`SELECT * FROM retainers WHERE user_id = ${session.uid} AND status = 'active' LIMIT 1`;
      if (!r) return res.status(403).json({ error: 'No active retainer' });
      const [u] = await sql`SELECT name, email FROM users WHERE id = ${session.uid}`;
      const note = String(req.body.note || '').trim().slice(0, 2000);
      await sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
        `Retainer time request — ${u.name}`,
        `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">Retainer client needs time</h2>
         <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${u.name}</strong> (${u.email}) — ${r.hours_per_month} hrs/mo retainer, ${await monthUsed(r.id)} used this month.</p>
         ${note ? `<p style="color:#a89080;font-size:14px;line-height:1.8;">${note}</p>` : ''}`);
      return res.json({ success: true });
    }

    // Workspace messages — client or team, on their own retainer
    if (action === 'message' || action === 'add_file' || action === 'remove_file') {
      let rid = Number(req.body.retainer_id) || 0;
      if (!admin) {
        if (!session?.uid) return res.status(401).json({ error: 'Sign in required' });
        const [own] = await sql`SELECT id FROM retainers WHERE user_id = ${session.uid} AND status = 'active' LIMIT 1`;
        if (!own) return res.status(403).json({ error: 'No active retainer' });
        rid = own.id;
      }
      if (!rid) return res.status(400).json({ error: 'retainer_id required' });

      if (action === 'message') {
        const body = String(req.body.body || '').trim().slice(0, 4000);
        if (!body) return res.status(400).json({ error: 'Message required' });
        const [m] = await sql`INSERT INTO retainer_messages (retainer_id, from_admin, body, created_at)
          VALUES (${rid}, ${!!admin}, ${body}, NOW()) RETURNING *`;
        // Notify the other side
        const [r] = await sql`SELECT r.user_id, u.name, u.email FROM retainers r JOIN users u ON u.id = r.user_id WHERE r.id = ${rid}`;
        if (admin && r) {
          await sendEmail(r.email, 'Dr. Merritt replied in your advisory workspace',
            `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">New message in your workspace</h2>
             <p style="color:#a89080;font-size:14px;line-height:1.8;">Sign in to read it and reply.</p>`);
        } else if (r) {
          await sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
            `Retainer message — ${r.name}`,
            `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">${r.name} posted in their workspace</h2>
             <p style="color:#a89080;font-size:14px;line-height:1.8;">${body.slice(0, 400)}</p>`);
        }
        return res.status(201).json(m);
      }

      if (action === 'add_file') {
        const { title, url, kind } = req.body;
        if (!title) return res.status(400).json({ error: 'Title required' });
        if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid link' }); } }
        const [f] = await sql`INSERT INTO retainer_files (retainer_id, title, url, kind, uploaded_by, created_at)
          VALUES (${rid}, ${String(title).slice(0, 200)}, ${url || null}, ${kind || 'link'}, ${session?.uid || null}, NOW()) RETURNING *`;
        return res.status(201).json(f);
      }

      if (action === 'remove_file') {
        await sql`DELETE FROM retainer_files WHERE id = ${Number(req.body.id)} AND retainer_id = ${rid}`;
        return res.json({ success: true });
      }
    }

    // ── Team only ──
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });

    if (action === 'set_call_link') {
      const url = String(req.body.url || '').trim();
      if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid link' }); } }
      await sql`INSERT INTO settings (key, value) VALUES ('advisor_call_link', ${url}) ON CONFLICT (key) DO UPDATE SET value = ${url}`;
      return res.json({ success: true });
    }

    if (action === 'create') {
      const { user_id, hours_per_month, monthly_amount, notes, status } = req.body;
      if (!user_id) return res.status(400).json({ error: 'Pick a member' });
      const st = status === 'offered' ? 'offered' : 'active';
      const [r] = await sql`
        INSERT INTO retainers (user_id, hours_per_month, monthly_amount, notes, status, started_at, created_at)
        VALUES (${Number(user_id)}, ${Number(hours_per_month) || 10}, ${Number(monthly_amount) || 5500}, ${notes || null}, ${st}, NOW(), NOW())
        RETURNING *`;
      // Invite the client to choose a plan and pay
      if (st === 'offered') {
        const [u] = await sql`SELECT name, email FROM users WHERE id = ${Number(user_id)}`;
        if (u) await sendEmail(u.email, 'Your Senior Advisor retainer — choose your hours',
          `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">Ready when you are, ${u.name.split(' ')[0]}.</h2>
           <p style="color:#a89080;font-size:14px;line-height:1.8;">Following your call with Dr. Merritt — your Senior Advisor retainer is ready to start. Sign in and pick the hour block that fits, and your advisory workspace opens immediately.</p>
           <a href="https://community.drginamerritt.net/advisory" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Choose Your Plan</a>`);
      }
      return res.status(201).json(r);
    }

    if (action === 'log_hours') {
      const { retainer_id, hours, note, logged_on } = req.body;
      if (!retainer_id || !hours) return res.status(400).json({ error: 'Retainer and hours required' });
      await sql`INSERT INTO retainer_hours (retainer_id, hours, note, logged_on, created_at)
        VALUES (${Number(retainer_id)}, ${Number(hours)}, ${note || null}, ${logged_on || null} , NOW())`;
      return res.status(201).json({ success: true });
    }

    if (action === 'update') {
      const { id, hours_per_month, monthly_amount, status, notes } = req.body;
      const [r] = await sql`
        UPDATE retainers SET
          hours_per_month = COALESCE(${hours_per_month ?? null}, hours_per_month),
          monthly_amount = COALESCE(${monthly_amount ?? null}, monthly_amount),
          status = COALESCE(${status ?? null}, status),
          notes = COALESCE(${notes ?? null}, notes)
        WHERE id = ${Number(id)} RETURNING *`;
      return res.json(r);
    }

    if (action === 'delete') {
      await sql`DELETE FROM retainers WHERE id = ${Number(req.body.id)}`;
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
