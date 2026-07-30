import { neon } from '@neondatabase/serverless';
import { getAdmin } from './_utils.js';
import { sendEmail, sendBulk, addContact, siteUrl, waitlistConfirmEmail, countdownEmail, launchEmail } from './_email.js';

export const PLAN_INFO = {
  Basic: { label: 'Member', monthly: 59.99 },
  Premium: { label: 'Premium', monthly: 165.99 },
  Elite: { label: 'Elite', monthly: 599.99 },
  pass_single: { label: 'Single Course Pass', once: 100 },
  pass_all: { label: 'All-Access Pass', once: 250 },
};

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const admin = getAdmin(req);

  try {
    // Public: launch date only — drives the site's pre-launch mode and countdown
    if (req.method === 'GET' && req.query.public === '1') {
      const [launchRow] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
      return res.json({ launch_at: launchRow?.value || null });
    }

    // Admin: full list + launch date + revenue rollup
    if (req.method === 'GET') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const entries = await sql`SELECT * FROM waitlist ORDER BY created_at DESC`;
      const [launchRow] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
      let mrr = 0, oneTime = 0;
      for (const e of entries) {
        const p = PLAN_INFO[e.plan];
        if (p?.monthly) mrr += p.monthly;
        if (p?.once) oneTime += p.once;
      }
      return res.json({ entries, launch_at: launchRow?.value || null, mrr: Math.round(mrr * 100) / 100, oneTime: Math.round(oneTime * 100) / 100 });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const action = req.body?.action;

    // Public: join the waitlist with a chosen plan
    if (action === 'join') {
      const { name, email, plan } = req.body;
      if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
      const safePlan = PLAN_INFO[plan] ? plan : 'Basic';
      const cleanEmail = String(email).trim().toLowerCase();
      const [entry] = await sql`
        INSERT INTO waitlist (name, email, plan, created_at)
        VALUES (${String(name).trim()}, ${cleanEmail}, ${safePlan}, NOW())
        ON CONFLICT (email) DO UPDATE SET plan = ${safePlan}, name = ${String(name).trim()}
        RETURNING *`;
      const mail = waitlistConfirmEmail(entry.name, PLAN_INFO[safePlan].label);
      await Promise.allSettled([
        sendEmail(entry.email, mail.subject, mail.html),
        addContact(entry.email, entry.name, { WAITLIST_PLAN: safePlan }),
      ]);
      return res.status(201).json({ success: true });
    }

    // ── Admin actions ──
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });

    if (action === 'set_launch') {
      const at = req.body.launch_at;
      if (at && isNaN(Date.parse(at))) return res.status(400).json({ error: 'Invalid date' });
      await sql`INSERT INTO settings (key, value) VALUES ('launch_at', ${at || ''}) ON CONFLICT (key) DO UPDATE SET value = ${at || ''}`;
      return res.json({ success: true });
    }

    // Countdown drip: stage is display text like "2 days" / "12 hours"
    if (action === 'countdown') {
      const { stage } = req.body;
      if (!stage) return res.status(400).json({ error: 'stage required' });
      const [launchRow] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
      const launchText = launchRow?.value ? new Date(launchRow.value).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
      const entries = await sql`SELECT name, email FROM waitlist`;
      if (entries.length === 0) return res.status(400).json({ error: 'Waitlist is empty' });
      const mail = countdownEmail(stage, launchText);
      const sent = await sendBulk(entries, mail.subject, mail.html);
      return res.json({ success: true, sent, total: entries.length });
    }

    // Launch: everyone gets first notice + a link that lands on their chosen plan
    if (action === 'launch') {
      const entries = await sql`SELECT * FROM waitlist WHERE launched_notified = FALSE`;
      if (entries.length === 0) return res.status(400).json({ error: 'Everyone on the waitlist has already been notified' });
      let sent = 0;
      for (let i = 0; i < entries.length; i += 10) {
        const chunk = entries.slice(i, i + 10);
        const results = await Promise.allSettled(chunk.map(e => {
          const info = PLAN_INFO[e.plan] || PLAN_INFO.Basic;
          const link = `${siteUrl()}/?join=1&plan=${encodeURIComponent(e.plan)}&email=${encodeURIComponent(e.email)}`;
          const mail = launchEmail(e.name, info.label, link);
          return sendEmail(e.email, mail.subject, mail.html);
        }));
        sent += results.filter(x => x.status === 'fulfilled' && x.value).length;
      }
      await sql`UPDATE waitlist SET launched_notified = TRUE`;
      return res.json({ success: true, sent, total: entries.length });
    }

    if (action === 'remove') {
      const { id } = req.body;
      await sql`DELETE FROM waitlist WHERE id = ${id}`;
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
