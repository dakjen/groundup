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

// Conservative monthly estimate per budget range, for anticipated-revenue math
export const BUDGET_EST = {
  'Under $50': 40,
  '$50–$150': 100,
  '$150–$500': 325,
  '$500+': 600,
};

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const admin = getAdmin(req);

  try {
    // Public: launch dates — general drives pre-launch mode; insider drives the /waitlist countdown
    if (req.method === 'GET' && req.query.public === '1') {
      const [launchRow] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
      const [insiderRow] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
      const [callRow] = await sql`SELECT value FROM settings WHERE key = 'advisor_call_link'`;
      return res.json({ launch_at: launchRow?.value || null, launch_insider_at: insiderRow?.value || null, advisor_call_link: callRow?.value || null });
    }

    // Admin: full list + launch date + revenue rollup
    if (req.method === 'GET') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const entries = await sql`SELECT * FROM waitlist ORDER BY created_at DESC`;
      const [launchRow] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
      const [insiderRow] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
      // Anticipated revenue from stated budgets (falls back to chosen plan for old entries)
      let mrr = 0, oneTime = 0;
      for (const e of entries) {
        if (e.budget && BUDGET_EST[e.budget]) { mrr += BUDGET_EST[e.budget]; continue; }
        const p = PLAN_INFO[e.plan];
        if (p?.monthly) mrr += p.monthly;
        if (p?.once) oneTime += p.once;
      }
      return res.json({ entries, launch_at: launchRow?.value || null, launch_insider_at: insiderRow?.value || null, mrr: Math.round(mrr * 100) / 100, oneTime: Math.round(oneTime * 100) / 100 });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const action = req.body?.action;

    // Public: join the waitlist with a chosen plan
    if (action === 'join') {
      const { name, email, phone, learn, pain, budget, source, list } = req.body;
      const safeList = list === 'general' ? 'general' : 'insider';
      if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
      if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'Phone number required' });
      if (!learn || !String(learn).trim()) return res.status(400).json({ error: 'Tell us what you want to learn' });
      if (!pain || !String(pain).trim()) return res.status(400).json({ error: 'Tell us your biggest pain point' });
      if (!BUDGET_EST[budget]) return res.status(400).json({ error: 'Pick a monthly budget' });
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanPhone = String(phone).trim().slice(0, 30);
      const cleanLearn = String(learn).trim().slice(0, 2000);
      const cleanPain = String(pain).trim().slice(0, 2000);
      const cleanSource = source ? String(source).trim().slice(0, 200) : null;
      const [entry] = await sql`
        INSERT INTO waitlist (name, email, phone, learn, reason, budget, source, list, created_at)
        VALUES (${String(name).trim()}, ${cleanEmail}, ${cleanPhone}, ${cleanLearn}, ${cleanPain}, ${budget}, ${cleanSource}, ${safeList}, NOW())
        ON CONFLICT (email) DO UPDATE SET name = ${String(name).trim()}, phone = ${cleanPhone}, learn = ${cleanLearn}, reason = ${cleanPain}, budget = ${budget}, source = ${cleanSource}
        RETURNING *`;
      const mail = waitlistConfirmEmail(entry.name, null);
      await Promise.allSettled([
        sendEmail(entry.email, mail.subject, mail.html),
        addContact(entry.email, entry.name, { WAITLIST_BUDGET: budget, SMS: cleanPhone }),
      ]);
      return res.status(201).json({ success: true });
    }

    // ── Admin actions ──
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });

    if (action === 'set_launch') {
      const at = req.body.launch_at;
      if (at && isNaN(Date.parse(at))) return res.status(400).json({ error: 'Invalid date' });
      const key = req.body.which === 'insider' ? 'launch_insider_at' : 'launch_at';
      await sql`INSERT INTO settings (key, value) VALUES (${key}, ${at || ''}) ON CONFLICT (key) DO UPDATE SET value = ${at || ''}`;
      return res.json({ success: true });
    }

    // Countdown drip: stage is display text like "2 days" / "12 hours"
    if (action === 'countdown') {
      const { stage } = req.body;
      if (!stage) return res.status(400).json({ error: 'stage required' });
      const [launchRow] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
      const launchText = launchRow?.value ? new Date(launchRow.value).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
      const target = ['insider', 'general'].includes(req.body.list) ? req.body.list : null;
      const entries = target
        ? await sql`SELECT name, email FROM waitlist WHERE COALESCE(list, 'insider') = ${target}`
        : await sql`SELECT name, email FROM waitlist`;
      if (entries.length === 0) return res.status(400).json({ error: 'That waitlist is empty' });
      const mail = countdownEmail(stage, launchText);
      const sent = await sendBulk(entries, mail.subject, mail.html);
      return res.json({ success: true, sent, total: entries.length });
    }

    // Launch: first notice + a personal plan recommendation from budget + pain point
    if (action === 'launch') {
      const target = ['insider', 'general'].includes(req.body.list) ? req.body.list : null;
      const entries = target
        ? await sql`SELECT * FROM waitlist WHERE launched_notified = FALSE AND COALESCE(list, 'insider') = ${target}`
        : await sql`SELECT * FROM waitlist WHERE launched_notified = FALSE`;
      if (entries.length === 0) return res.status(400).json({ error: 'Everyone on that list has already been notified' });
      const recommend = (e) => {
        if (e.budget === '$500+') return { tier: 'Elite', label: 'Elite', price: '$599.99/mo' };
        if (e.budget === '$150–$500') return { tier: 'Premium', label: 'Premium', price: '$165.99/mo' };
        return { tier: 'Basic', label: 'Member', price: '$59.99/mo' };
      };
      let sent = 0;
      for (let i = 0; i < entries.length; i += 10) {
        const chunk = entries.slice(i, i + 10);
        const results = await Promise.allSettled(chunk.map(e => {
          const rec = recommend(e);
          const link = `${siteUrl()}/?join=1&plan=${rec.tier}&email=${encodeURIComponent(e.email)}`;
          const mail = launchEmail(e.name, rec, link, e.reason);
          return sendEmail(e.email, mail.subject, mail.html);
        }));
        sent += results.filter(x => x.status === 'fulfilled' && x.value).length;
      }
      if (target) await sql`UPDATE waitlist SET launched_notified = TRUE WHERE COALESCE(list, 'insider') = ${target}`;
      else await sql`UPDATE waitlist SET launched_notified = TRUE`;
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
