import { neon } from '@neondatabase/serverless';
import { getAdmin } from './_utils.js';
import { sendEmail, sendBulk, addContact, siteUrl, waitlistConfirmEmail, countdownEmail, launchEmail, recommendEmail } from './_email.js';

// ── The recommendation algorithm ──
// Two signals: what their ANSWERS say they need, and what their BUDGET says
// they can spend. Their words set the ambition; their budget sets the ceiling;
// we recommend where the two meet — never a plan above their stated budget.
const PLANS = {
  Basic: { tier: 'Basic', label: 'Member', price: '$49.99/mo', rank: 1, features: [
    'Every course — all seven, plus new ones as they drop', 'All written lessons, case studies & worksheets',
    'Community access — read every channel', 'Resource lists & reading guides',
  ] },
  Builder: { tier: 'Builder', label: 'Builder', price: '$99.99/mo', rank: 2, features: [
    'Everything in Member', 'Post, reply & network in the community',
    'View-only access to every guide, template & the Developer\'s Playbook',
  ] },
  Premium: { tier: 'Premium', label: 'Premium', price: '$149.99/mo', rank: 3, features: [
    'Everything in Builder', 'Download 3 guides or templates every month', 'The Opportunity Board — RFPs & funding windows',
    'JV & Partnerships channel', 'Lunch & Learn recordings', 'Group office hours with Dr. Merritt + priority booking', '10% off every 1:1 session',
  ] },
  Elite: { tier: 'Elite', label: 'Elite', price: '$499.99/mo', rank: 4, features: [
    'Everything in Premium', 'Direct messages to Dr. Merritt & her team (replies within 2 business days, Mon–Fri)',
    '3 one-on-one advisory calls a year', "Unlimited downloads — including the Developer's Playbook",
    '30% off every 1:1 session', 'Elite Lounge — the private channel', 'Small-group advisory sessions & networking invites',
  ] },
};

// Every campaign send leaves a permanent record — who, what, when — so the
// team can always see exactly which emails went out.
async function logEmails(sql, kind, list, subject, recipients) {
  try {
    for (const r of recipients) {
      await sql`INSERT INTO email_log (kind, list, subject, recipient_name, recipient_email, ok, created_at)
        VALUES (${kind}, ${list || 'all'}, ${subject}, ${r.name || ''}, ${r.email}, ${r.ok !== false}, NOW())`;
    }
  } catch (err) { console.error('email log failed', err.message); }
}

// What each form answer says they NEED (1 = courses cover it / 2 = needs the
// community, tools & Opportunity Board / 3 = needs Dr. Merritt directly).
// Principle: the more complex the topic and the more human the pain point,
// the higher the plan. The community (Premium) is where partners, capital
// connections, and networking live; Elite is direct access to Gina.
const LEARN_NEED = {
  // Learning topics — the courses and Lunch & Learns teach these → Member
  'Real estate development basics': 1,
  'Finding & evaluating deals': 1,
  'LIHTC & tax credits': 1,
  'JV partnerships & structuring': 1,
  'Construction & design management': 1,
  // Doing — financing and getting deals done → Premium
  'Financing & capital stacks': 2,
  'Getting my first deal done': 2,
  // Operating at scale / Gina's specialty → Elite
  'Public-private partnerships': 3,
  'Scaling my business & pipeline': 3,
  'Scaling my existing pipeline': 3,        // legacy option, kept for old entries
};
const PAIN_NEED = {
  "I don't know where to start": 1,         // courses are the on-ramp
  "I don't understand the numbers": 2,      // numbers → Premium tools & sessions
  "I can't find the capital": 2,            // capital access → community + Opportunity Board
  'I need partners or a team': 2,           // partners = the community
  'No network in the industry': 2,          // networking = the community
  'Navigating government & compliance': 3,  // Gina's home turf → direct access
  "I have a deal but I'm stuck": 3,         // live deal in trouble → hands-on help
};

export function recommendPlan(e) {
  // A team override always wins — set from the admin waitlist sheet
  if (e.rec_override && (PLANS[e.rec_override] || e.rec_override === 'Advisor')) {
    if (e.rec_override !== 'Advisor') return { ...PLANS[e.rec_override], next: null };
    // fall through to the Advisor block below
    e = { ...e, budget: '$2,000+' };
  }
  // Thought partnership ($2,000+): this is retainer territory, not a membership —
  // recommend the Senior Advisor engagement and route them to a call, not checkout
  if (e.budget === '$2,000+') {
    return {
      tier: 'Advisor', label: 'Senior Advisor Retainer', price: 'from $3,025/mo',
      ctaLabel: 'Book your engagement call →', next: null,
      features: [
        'Dr. Merritt embedded on YOUR project, month over month',
        'Deal review, capital strategy & negotiation prep',
        'A private client workspace — documents, messages, logged hours',
        'Her expertise and business infrastructure under your foundation',
        'Everything in Elite included',
      ],
    };
  }
  // Budget decides the base recommendation outright — never pitch above budget:
  //   $500+      → Elite, always
  //   $150–$500  → Premium, always
  //   below $150 → Member (the healthy on-ramp)
  // Budget brackets (new + legacy values both map):
  //   $300+/$500+          → Elite
  //   $100–$200/$150–$500  → Premium
  //   everything below     → Member
  const ELITE_B = ['$300+', '$500+'];
  const PREMIUM_B = ['$100–$200', '$150–$500'];
  const rank = ELITE_B.includes(e.budget) ? 3 : PREMIUM_B.includes(e.budget) ? 2 : 1;
  const rec = rank === 3 ? PLANS.Elite : rank === 2 ? PLANS.Premium : PLANS.Basic;
  // What their answers say they actually NEED (the maps above)
  const need = Math.max(LEARN_NEED[e.learn] || 1, PAIN_NEED[e.reason] || 1);
  // THE STRETCH OFFER: budget $50–$500 but their need sits one tier above what
  // they can afford (no network, can't find capital, needs partners, complex
  // learning goals) → offer the next tier at 10% off their first year.
  const inStretchBand = ['$25–$100', '$100–$200', '$50–$150', '$150–$500'].includes(e.budget);
  // First-10 waitlisters ALWAYS get the stretch offer, and at 15% instead of 10% —
  // being early on the list earns the better deal.
  const insider = (e.list || 'insider') === 'insider';
  // Elite is never discounted — the stretch offer only ever lifts Member → Premium.
  // Premium-budget people see Elite as plain optionality (full price) instead.
  const qualifies = inStretchBand && rank === 1 && (insider || need > rank);
  if (qualifies) {
    const up = PLANS.Builder; // Member-budget stretch goes one step up, never further
    const pct = e.first10 ? 15 : 10; // first-10 earns the deeper cut
    return { ...rec, next: null, stretch: {
      tier: up.tier, label: up.label, price: up.price, pct,
      offer: `${pct}% off your first year${e.first10 ? " — you're one of our first 10" : ''}`,
      extras: up.features.filter(f => !f.startsWith('Everything in')).slice(0, 4),
    } };
  }
  // Otherwise show plain optionality: what the next tier costs and adds
  const next = rank === 1 ? PLANS.Builder : rank === 2 ? PLANS.Elite : null;
  if (!next) return { ...rec, next: null };
  const delta = (parseFloat(next.price.replace(/[^0-9.]/g, '')) - parseFloat(rec.price.replace(/[^0-9.]/g, ''))).toFixed(2);
  return { ...rec, next: { label: next.label, price: next.price, delta: `$${delta}/mo more`, extras: next.features.filter(f => !f.startsWith('Everything in')).slice(0, 4) } };
}

export const PLAN_INFO = {
  Basic: { label: 'Member', monthly: 49.99 },
  Premium: { label: 'Premium', monthly: 149.99 },
  Elite: { label: 'Elite', monthly: 499.99 },
  pass_single: { label: 'Single Course Pass', once: 100 },
  pass_all: { label: 'All-Access Pass', once: 250 },
};

// Conservative monthly estimate per budget range, for anticipated-revenue math
export const BUDGET_EST = {
  'Under $25': 15, '$25–$100': 60, '$100–$200': 166, '$300+': 600, '$2,000+': 3025,
  // legacy ranges from earlier signups
  'Under $50': 40, '$50–$150': 100, '$150–$500': 325, '$500+': 600,
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
      // Live Elite scarcity: seats spoken for = paid Elite members + waitlisters
      // headed for Elite (budget says so, or the team marked them Elite)
      let elite = null;
      try {
        const [capRow] = await sql`SELECT value FROM settings WHERE key = 'elite_cap'`;
        const cap = parseInt(capRow?.value, 10) || 15;
        const [paid] = await sql`SELECT COUNT(*)::int AS n FROM users WHERE tier='Elite' AND membership_status='active' AND COALESCE(role,'member')='member' AND NOT COALESCE(comped,FALSE)`;
        const [intent] = await sql`SELECT COUNT(*)::int AS n FROM waitlist
          WHERE rec_override = 'Elite' OR (rec_override IS NULL AND budget IN ('$300+','$500+'))`;
        const claimed = Math.min(cap, (paid?.n || 0) + (intent?.n || 0));
        elite = { cap, claimed, left: Math.max(0, cap - claimed) };
      } catch (e) { console.error('elite spots failed', e.message); }
      return res.json({ launch_at: launchRow?.value || null, launch_insider_at: insiderRow?.value || null, advisor_call_link: callRow?.value || null, elite });
    }

    // Admin: full list + launch date + revenue rollup
    if (req.method === 'GET') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const entries = await sql`SELECT * FROM waitlist ORDER BY created_at DESC`;
      // Complete record of every campaign email sent, newest first
      let email_log = [];
      try { email_log = await sql`SELECT * FROM email_log ORDER BY created_at DESC LIMIT 500`; } catch { /* table appears after first migrate */ }
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
      // The insider waitlist CLOSES once insiders get access — after the insider
      // launch passes, the door is shut (latecomers use the general list).
      if (safeList === 'insider') {
        const [ins] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
        if (ins?.value && new Date(ins.value).getTime() <= Date.now()) {
          return res.status(403).json({ error: 'The insider waitlist is closed — doors are open for insiders. Sign in or join the general list.' });
        }
      }

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
      const mail = waitlistConfirmEmail(entry.name, founding, first10, entry.list || 'insider');
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
      await logEmails(sql, `countdown: ${stage}`, target, mail.subject, entries.map(e => ({ ...e, ok: true })));
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
      const logRows = [];
      for (let i = 0; i < entries.length; i += 10) {
        const chunk = entries.slice(i, i + 10);
        const results = await Promise.allSettled(chunk.map(e => {
          const rec = recommendPlan(e);
          const mail = recommendEmail(e.name, rec, launchRow?.value || null, e.reason);
          return sendEmail(e.email, mail.subject, mail.html).then(ok => { logRows.push({ name: e.name, email: e.email, ok: !!ok, plan: rec.label }); return ok; });
        }));
        sent += results.filter(x => x.status === 'fulfilled' && x.value).length;
      }
      await logEmails(sql, 'plan recommendation', target, "Here's the plan we'd pick for you", logRows.map(r => ({ ...r, name: `${r.name} → ${r.plan}` })));
      // Record who holds a stretch offer ("Tier|pct") — checkout verifies against this
      for (const e of entries) {
        const rec = recommendPlan(e);
        await sql`UPDATE waitlist SET stretch_offer = ${rec.stretch ? `${rec.stretch.tier}|${rec.stretch.pct}` : null} WHERE id = ${e.id}`;
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
      const logRows = [];
      for (let i = 0; i < entries.length; i += 10) {
        const chunk = entries.slice(i, i + 10);
        const results = await Promise.allSettled(chunk.map(e => {
          const rec = recommendPlan(e);
          const link = `${siteUrl()}/?join=1&plan=${rec.tier}&email=${encodeURIComponent(e.email)}`;
          const stretchLink = rec.stretch ? `${siteUrl()}/?join=1&plan=${rec.stretch.tier}&promo=stretch10&email=${encodeURIComponent(e.email)}` : null;
          const mail = launchEmail(e.name, rec, link, e.reason, stretchLink);
          return sendEmail(e.email, mail.subject, mail.html).then(ok => { logRows.push({ name: `${e.name} → ${rec.label}`, email: e.email, ok: !!ok }); return ok; });
        }));
        sent += results.filter(x => x.status === 'fulfilled' && x.value).length;
      }
      await logEmails(sql, 'launch + pay link', target, "We're live — here's the plan we recommend for you", logRows);
      for (const e of entries) {
        const rec = recommendPlan(e);
        await sql`UPDATE waitlist SET stretch_offer = ${rec.stretch ? `${rec.stretch.tier}|${rec.stretch.pct}` : null} WHERE id = ${e.id}`;
      }
      if (target) await sql`UPDATE waitlist SET launched_notified = TRUE WHERE COALESCE(list, 'insider') = ${target}`;
      else await sql`UPDATE waitlist SET launched_notified = TRUE`;
      return res.json({ success: true, sent, total: entries.length });
    }

    // Team override of a person's plan recommendation ('' clears back to the algorithm)
    if (action === 'set_override') {
      const val = ['Basic', 'Premium', 'Elite', 'Advisor'].includes(req.body.tier) ? req.body.tier : null;
      await sql`UPDATE waitlist SET rec_override = ${val} WHERE id = ${Number(req.body.id)}`;
      return res.json({ success: true, rec_override: val });
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
