import { neon } from '@neondatabase/serverless';
import { getAdmin } from './_utils.js';
import { sendEmail, sendBulk, addContact, siteUrl, waitlistConfirmEmail, countdownEmail, launchEmail, recommendEmail } from './_email.js';

// ── The recommendation algorithm ──
// Two signals: what their ANSWERS say they need, and what their BUDGET says
// they can spend. Their words set the ambition; their budget sets the ceiling;
// we recommend where the two meet — never a plan above their stated budget.
const PLANS = {
  Basic: { tier: 'Basic', label: 'Member', price: '$59.99/mo', rank: 1, features: [
    'Every course — all seven, plus new ones as they drop', 'All written lessons, case studies & worksheets',
    'Community access — read every channel', 'Resource lists & reading guides',
  ] },
  Premium: { tier: 'Premium', label: 'Premium', price: '$165.99/mo', rank: 2, features: [
    'Everything in Member', 'Post, reply & network in the community', 'The Opportunity Board — RFPs & funding windows',
    'Lunch & Learn recordings', '1 free work session (1 hr) + priority booking', '10% off every 1:1 session',
  ] },
  Elite: { tier: 'Elite', label: 'Elite', price: '$599.99/mo', rank: 3, features: [
    'Everything in Premium', 'Direct messages to Dr. Merritt & her team', '3 one-on-one advisory calls a year',
    '30% off every 1:1 session', 'Elite Lounge — the private channel', 'Small-group advisory sessions & networking invites',
  ] },
};

export function recommendPlan(e) {
  const words = `${e.learn || ''} ${e.reason || ''}`.toLowerCase();
  // What they need, read from their own words
  let need = 1; // courses alone
  if (/(deal|capital|financ|fund|invest|partner|jv|network|opportunit|rfp|pipeline)/.test(words)) need = 2; // active deals → community + tools
  if (/(advis|mentor|coach|1:1|one.on.one|direct access|hands.on|guidance|support from|expert|help me close)/.test(words)) need = 3; // wants Gina herself
  // What they can spend
  const cap = e.budget === '$500+' ? 3 : e.budget === '$150–$500' ? 2 : 1;
  const rank = Math.min(need, cap);
  return rank === 3 ? PLANS.Elite : rank === 2 ? PLANS.Premium : PLANS.Basic;
}

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
      // A resubmission updates the row but keeps created_at — use that to label the alert
      const isNew = Date.now() - new Date(entry.created_at).getTime() < 10000;
      // Founding 25: the first 25 people on the ELITE INSIDER waitlist get their
      // first year of Lunch & Learns free (granted at account creation — see
      // signup in api/auth.js, which reads this flag by email).
      let founding = entry.founding_lnl;
      if (isNew && !founding && entry.list === 'insider') {
        const [row] = await sql`
          UPDATE waitlist SET founding_lnl = TRUE
          WHERE id = ${entry.id} AND list = 'insider'
            AND (SELECT COUNT(*) FROM waitlist WHERE founding_lnl) < 25
          RETURNING id`;
        founding = !!row;
      }
      // First 10 on the waitlist: a 14-day one-course trial + a personal referral
      // link, both delivered when they create their account (see api/auth.js).
      let first10 = entry.first10;
      if (isNew && !first10) {
        const [row] = await sql`
          UPDATE waitlist SET first10 = TRUE
          WHERE id = ${entry.id} AND (SELECT COUNT(*) FROM waitlist WHERE first10) < 10
          RETURNING id`;
        first10 = !!row;
      }
      const mail = waitlistConfirmEmail(entry.name, founding, first10);
      const [{ n: total }] = await sql`SELECT COUNT(*)::int AS n FROM waitlist`;
      await Promise.allSettled([
        sendEmail(entry.email, mail.subject, mail.html),
        addContact(entry.email, entry.name, { WAITLIST_BUDGET: budget, SMS: cleanPhone }),
        sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
          `${isNew ? 'WAITLIST +1' : 'Waitlist update'}: ${entry.name} (${entry.list === 'insider' ? 'Insider' : 'General'})${founding ? ' · FOUNDING 25' : ''} — ${total} total`,
          `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">${isNew ? 'New waitlist signup' : 'Waitlist entry updated'}</h2>
           <p style="color:#a89080;font-size:14px;line-height:1.9;">
             <strong style="color:#f0d8d8;">${entry.name}</strong> — ${entry.email}${entry.phone ? ' · ' + entry.phone : ''}<br/>
             List: <strong style="color:#f0d8d8;">${entry.list === 'insider' ? 'Elite Insider' : 'General'}</strong> · Budget: <strong style="color:#f0d8d8;">${entry.budget || '—'}</strong><br/>
             Wants to learn: ${entry.learn || '—'}<br/>
             Pain point: ${entry.reason || '—'}<br/>
             Heard about us: ${entry.source || '—'}
           </p>
           <p style="color:#a89080;font-size:13px;">That's <strong style="color:#f0d8d8;">${total}</strong> on the waitlist. Full sheet is in Admin → Waitlist.</p>`),
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

    // ~14 days out: send everyone their plan recommendation (no pay link yet)
    if (action === 'recommend') {
      const target = ['insider', 'general'].includes(req.body.list) ? req.body.list : null;
      const entries = target
        ? await sql`SELECT * FROM waitlist WHERE recommended_notified = FALSE AND COALESCE(list, 'insider') = ${target}`
        : await sql`SELECT * FROM waitlist WHERE recommended_notified = FALSE`;
      if (entries.length === 0) return res.status(400).json({ error: 'Everyone on that list already got their recommendation' });
      const [launchRow] = await sql`SELECT value FROM settings WHERE key = ${req.body.list === 'insider' ? 'launch_insider_at' : 'launch_at'}`;
      let sent = 0;
      for (let i = 0; i < entries.length; i += 10) {
        const results = await Promise.allSettled(entries.slice(i, i + 10).map(e => {
          const mail = recommendEmail(e.name, recommendPlan(e), launchRow?.value || null, e.reason);
          return sendEmail(e.email, mail.subject, mail.html);
        }));
        sent += results.filter(x => x.status === 'fulfilled' && x.value).length;
      }
      if (target) await sql`UPDATE waitlist SET recommended_notified = TRUE WHERE COALESCE(list, 'insider') = ${target}`;
      else await sql`UPDATE waitlist SET recommended_notified = TRUE`;
      return res.json({ success: true, sent, total: entries.length });
    }

    // Launch: first notice + a personal plan recommendation from budget + pain point
    if (action === 'launch') {
      const target = ['insider', 'general'].includes(req.body.list) ? req.body.list : null;
      const entries = target
        ? await sql`SELECT * FROM waitlist WHERE launched_notified = FALSE AND COALESCE(list, 'insider') = ${target}`
        : await sql`SELECT * FROM waitlist WHERE launched_notified = FALSE`;
      if (entries.length === 0) return res.status(400).json({ error: 'Everyone on that list has already been notified' });
      let sent = 0;
      for (let i = 0; i < entries.length; i += 10) {
        const chunk = entries.slice(i, i + 10);
        const results = await Promise.allSettled(chunk.map(e => {
          const rec = recommendPlan(e);
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
