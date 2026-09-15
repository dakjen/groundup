import { neon } from '@neondatabase/serverless';
import { requireAdmin } from './_utils.js';
import { sendEmail, inviteEmail, giftEmail, siteUrl } from './_email.js';

function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  for (const n of buf) s += chars[n % chars.length];
  return s;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const sql = neon(process.env.DATABASE_URL);

  try {
    // Partner referral codes: a custom code per ambassador; signups through
    // their link count toward a goal that earns them a comped membership.
    if (req.method === 'GET' && req.query.partner_codes === '1') {
      const codes = await sql`
        SELECT p.*, COALESCE(w.n, 0)::int AS signups
        FROM partner_codes p
        LEFT JOIN (SELECT source, COUNT(*) AS n FROM waitlist GROUP BY source) w
          ON w.source = 'ref:' || p.code
        ORDER BY p.created_at DESC`;
      return res.json({ codes });
    }

    if (req.method === 'GET') {
      const referrals = await sql`SELECT * FROM referrals ORDER BY created_at DESC LIMIT 200`;
      return res.json(referrals);
    }

    if (req.method === 'POST' && req.body.kind === 'partner_code') {
      const owner_name = String(req.body.owner_name || '').trim();
      const owner_email = String(req.body.owner_email || '').trim().toLowerCase() || null;
      const goal = Math.max(1, Number(req.body.goal) || 5);
      if (!owner_name) return res.status(400).json({ error: 'Name required' });
      const code = String(req.body.code || owner_name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      if (!code) return res.status(400).json({ error: 'Code required' });
      const [row] = await sql`
        INSERT INTO partner_codes (code, owner_name, owner_email, goal, created_at)
        VALUES (${code}, ${owner_name}, ${owner_email}, ${goal}, NOW())
        ON CONFLICT (code) DO NOTHING RETURNING *`;
      if (!row) return res.status(409).json({ error: 'That code already exists' });
      return res.status(201).json(row);
    }

    if (req.method === 'DELETE' && req.body?.kind === 'partner_code') {
      await sql`DELETE FROM partner_codes WHERE id = ${Number(req.body.id)}`;
      return res.json({ success: true });
    }

    // Month-free gift: a personal link locked to ONE person's email. The link
    // does nothing for anyone else, so it can't spread. Single use, 60 days.
    if (req.method === 'POST' && req.body.kind === 'month_free') {
      const { name, email } = req.body;
      if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
      const code = genCode();
      const [gift] = await sql`
        INSERT INTO referrals (name, email, code, kind, expires_at, status, used, created_at)
        VALUES (${String(name).trim()}, ${String(email).trim().toLowerCase()}, ${code}, 'month_free', NOW() + interval '60 days', 'pending', false, NOW())
        RETURNING *`;
      return res.status(201).json({ ...gift, link: `${siteUrl()}/gift/${code}` });
    }

    // Bulk month-free gifts from a CSV: one personal single-use link per person,
    // each emailed with the team's message. Skips emails already gifted.
    if (req.method === 'POST' && req.body.kind === 'month_free_bulk') {
      const people = Array.isArray(req.body.people) ? req.body.people.slice(0, 500) : [];
      const message = (req.body.message || '').slice(0, 2000);
      if (!people.length) return res.status(400).json({ error: 'No people found in the file' });
      let sent = 0, skipped = 0;
      for (const p of people) {
        const email = String(p.email || '').trim().toLowerCase();
        const name = String(p.name || '').trim() || email.split('@')[0];
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped++; continue; }
        const [existing] = await sql`SELECT id FROM referrals WHERE email = ${email} AND kind = 'month_free'`;
        if (existing) { skipped++; continue; }
        const code = genCode();
        await sql`INSERT INTO referrals (name, email, code, kind, expires_at, status, used, created_at)
          VALUES (${name}, ${email}, ${code}, 'month_free', NOW() + interval '60 days', 'pending', false, NOW())`;
        const mail = giftEmail(name, `${siteUrl()}/gift/${code}`, message);
        const ok = await sendEmail(email, mail.subject, mail.html);
        if (ok) sent++;
      }
      return res.json({ success: true, sent, skipped, total: people.length });
    }

    // Create an invite and email it (7-day trial link with the referral code)
    if (req.method === 'POST') {
      const { name, email } = req.body;
      if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
      const code = genCode();
      const [referral] = await sql`
        INSERT INTO referrals (name, email, code, expires_at, status, used, created_at)
        VALUES (${String(name).trim()}, ${String(email).trim().toLowerCase()}, ${code}, NOW() + interval '7 days', 'pending', false, NOW())
        RETURNING *
      `;
      const mail = inviteEmail(referral.name, `${siteUrl()}/?ref=${referral.code}`);
      const emailed = await sendEmail(referral.email, mail.subject, mail.html);
      return res.status(201).json({ ...referral, emailed });
    }

    if (req.method === 'PATCH') {
      const { id, status, used, used_at } = req.body;
      const [referral] = await sql`
        UPDATE referrals
        SET status = ${status}, used = ${used}, used_at = ${used_at || null}
        WHERE id = ${id}
        RETURNING *
      `;
      return res.json(referral);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql`DELETE FROM referrals WHERE id = ${id}`;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
}
