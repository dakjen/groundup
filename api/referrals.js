import { neon } from '@neondatabase/serverless';
import { requireAdmin } from './_utils.js';
import { sendEmail, inviteEmail, siteUrl } from './_email.js';

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
    if (req.method === 'GET') {
      const referrals = await sql`SELECT * FROM referrals ORDER BY created_at DESC LIMIT 200`;
      return res.json(referrals);
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
