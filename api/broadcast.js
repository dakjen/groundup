import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from './_utils.js';
import { sendBulk, sendEmail, siteUrl, broadcastEmail, eventEmail, lnlReminderEmail, meetingEmail, dealSupportNudgeEmail, passExpiryEmail, waitlistConfirmEmail, retainerInterestEmail, countdownEmail, recommendEmail, launchEmail, foundingThanksEmail, firstName } from './_email.js';
import { recommendPlan, sendRecommendBatch, sendLaunchBatch } from './waitlist.js';

// Team email tools: send a custom email or an event announcement to a segment.
// Audiences: all | Free | Basic | Premium | Elite | lnl (active Lunch & Learn access)

async function recipients(sql, audience) {
  // Qualified leads — anyone who's asked a deal-specific question (deal_leads table)
  if (audience === 'leads') {
    return sql`
      SELECT DISTINCT u.name, u.email FROM deal_leads d
      JOIN users u ON u.id = d.user_id
      WHERE u.membership_status = 'active'`;
  }
  if (audience === 'lnl') {
    return sql`
      SELECT DISTINCT u.name, u.email FROM entitlements e
      JOIN users u ON u.id = e.user_id
      WHERE e.course_id = 'lunchlearn' AND (e.expires_at IS NULL OR e.expires_at > NOW())`;
  }
  if (['Free', 'Basic', 'Builder', 'Premium', 'Elite'].includes(audience)) {
    return sql`SELECT name, email FROM users WHERE tier = ${audience} AND membership_status = 'active'`;
  }
  if (audience === 'paid') {
    return sql`SELECT name, email FROM users WHERE tier IN ('Basic','Premium','Elite') AND membership_status = 'active'`;
  }
  return sql`SELECT name, email FROM users WHERE membership_status = 'active'`;
}

export default async function handler(req, res) {
  // Vercel daily cron: nudge anyone whose course pass just expired — 7 days to
  // extend, or 15% off an annual membership. Authed by CRON_SECRET, which
  // Vercel attaches to cron requests automatically.
  if (req.method === 'GET' && process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT e.id, e.course_id, u.name, u.email FROM entitlements e
      JOIN users u ON u.id = e.user_id
      WHERE e.source = 'stripe_onetime' AND e.course_id != 'lunchlearn'
        AND e.expires_at < NOW() AND e.expires_at > NOW() - interval '3 days'
        AND u.membership_status = 'active' AND u.tier = 'Free'`;
    let sent = 0;
    for (const r of rows) {
      const mail = passExpiryEmail(r.name, r.course_id !== 'all');
      const ok = await sendEmail(r.email, mail.subject, mail.html, { marketing: true });
      if (ok) { sent++; await sql`UPDATE entitlements SET source = 'stripe_onetime_nudged' WHERE id = ${r.id}`; }
    }

    // Lifetime Pass Builder years that have run out: revert to Free — but only
    // accounts with no Stripe billing, so a real Builder subscription is never touched.
    const expiredBuilders = await sql`
      SELECT DISTINCT u.id, u.name, u.email FROM users u
      JOIN entitlements e ON e.user_id = u.id AND e.course_id = 'builder_year' AND e.source = 'lifetime' AND e.expires_at < NOW()
      WHERE u.tier = 'Builder' AND u.stripe_customer_id IS NULL AND COALESCE(u.role, 'member') = 'member'`;
    for (const b of expiredBuilders) {
      await sql`UPDATE users SET tier = 'Free' WHERE id = ${b.id}`;
      await sql`UPDATE entitlements SET source = 'lifetime_done' WHERE user_id = ${b.id} AND course_id = 'builder_year' AND source = 'lifetime'`;
      await sendEmail(b.email, 'Your Lifetime Pass — the year of Builder has wrapped',
        `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">Your courses are yours forever, ${firstName(b.name)}.</h2>
         <p style="color:#a89080;font-size:14px;line-height:1.8;">The free year of Builder that came with your Lifetime Pass has ended. Nothing changes about the heart of it: <strong style="color:#f0d8d8;">every course and every Lunch & Learn stays yours in perpetuity</strong>, and office hours run through your first five years. Want the community back — posting, live Lunch & Learns, the recording library? Any membership picks it right back up.</p>
         <a href="https://community.drginamerritt.net/pricing" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">See Memberships</a>`);
    }

    // Launch drip, driven by the countdown dates set in the admin: 14 days out
    // a save-the-date countdown, 7 days out each person's plan recommendation,
    // and the launch email (pay link, or the retainer discovery-call invite)
    // once the date arrives. Per list, idempotent — the countdown via a
    // settings flag, the other two via each row's notified flags.
    const drip = {};
    for (const list of ['insider', 'general']) {
      const key = list === 'insider' ? 'launch_insider_at' : 'launch_at';
      const [lr] = await sql`SELECT value FROM settings WHERE key = ${key}`;
      if (!lr?.value || isNaN(Date.parse(lr.value))) continue;
      const msLeft = new Date(lr.value) - Date.now();
      const DAY = 86400000;
      try {
        const sendCountdown = async (stage, flag) => {
          const [done] = await sql`SELECT value FROM settings WHERE key = ${flag}`;
          if (done?.value) return;
          const entries = await sql`SELECT name, email FROM waitlist WHERE COALESCE(list, 'insider') = ${list} AND NOT COALESCE(comped, FALSE)`;
          if (entries.length) {
            const launchText = new Date(lr.value).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
            const mail = countdownEmail(stage, launchText);
            drip[list + '_countdown_' + stage.replace(' ', '')] = await sendBulk(entries, mail.subject, mail.html);
          }
          await sql`INSERT INTO settings (key, value) VALUES (${flag}, 'sent') ON CONFLICT (key) DO UPDATE SET value = 'sent'`;
        };
        if (msLeft <= 0) {
          const r = await sendLaunchBatch(sql, list);
          if (r.total) drip[list + '_launch'] = r.sent;
        } else if (msLeft <= 2 * DAY) {
          // Final stretch: make sure recommendations went out, then the 2-day hype
          const r = await sendRecommendBatch(sql, list);
          if (r.total) drip[list + '_recommend'] = r.sent;
          await sendCountdown('2 days', 'drip_countdown2_' + list);
        } else if (msLeft <= 7 * DAY) {
          const r = await sendRecommendBatch(sql, list);
          if (r.total) drip[list + '_recommend'] = r.sent;
        } else if (msLeft <= 14 * DAY) {
          await sendCountdown('2 weeks', 'drip_countdown14_' + list);
        }
      } catch (e) { console.error('launch drip failed for ' + list, e.message); }
    }

    // Refund pot: release every slice whose refund window has closed — NREUV's
    // rate applies to the held 20% exactly as it did to the 80% on day one.
    let released = 0, releasedCents = 0;
    if (process.env.STRIPE_SECRET_KEY && process.env.NREUV_CONNECT_ACCOUNT) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const due = await sql`SELECT id, charge_id, item, held_cents, rate_pct FROM held_transfers
        WHERE status = 'held' AND release_after < NOW() LIMIT 100`;
      for (const h of due) {
        const amount = Math.floor(h.held_cents * (h.rate_pct / 100));
        try {
          if (amount > 0) await stripe.transfers.create({
            amount, currency: 'usd', destination: process.env.NREUV_CONNECT_ACCOUNT,
            source_transaction: h.charge_id,
            description: `NREUV ${h.rate_pct}% of refund-pot release — ${h.item || 'purchase'} (pot ${h.held_cents}¢)`,
          });
          await sql`UPDATE held_transfers SET status = 'released', released_at = NOW() WHERE id = ${h.id}`;
          released++; releasedCents += amount;
        } catch (e) { console.error('pot release failed', h.charge_id, e.message); }
      }
    }
    // Founding email — fires itself the day the insider waitlist reaches 25
    // non-comped signups. Once only (founding_thanked stamps each recipient);
    // anyone who joins the list later gets it on the next daily run.
    let founding = null;
    try {
      // Founding is claimed by paying after the insider launch, so the email
      // goes out 7 days BEFORE that launch — it's the heads-up that starts the race.
      const [insRow] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
      const msToLaunch = insRow?.value ? new Date(insRow.value).getTime() - Date.now() : Infinity;
      if (msToLaunch <= 7 * 86400000) {
        await sql`ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS founding_thanked TIMESTAMPTZ`;
        const rows = await sql`SELECT id, name, email FROM waitlist WHERE COALESCE(list, 'insider') = 'insider' AND founding_thanked IS NULL`;
        let fsent = 0;
        for (const r of rows) {
          const mail = foundingThanksEmail(r.name);
          const ok = await sendEmail(r.email, mail.subject, mail.html, { marketing: true, light: true });
          if (ok) { await sql`UPDATE waitlist SET founding_thanked = NOW() WHERE id = ${r.id}`; fsent++; }
        }
        founding = { window_open: true, sent: fsent };
        if (fsent) await sendEmail(process.env.ADMIN_EMAIL || 'djmj@nreuv.com', `Founding email went out to ${fsent} insider${fsent === 1 ? '' : 's'}`, `<p style="color:#a89080;font-size:14px;line-height:1.8;">The insider launch is a week out, so the founding email sent itself to ${fsent} ${fsent === 1 ? 'person' : 'people'} who hadn't received it yet — the first 25 who join from November 1 claim the seats.</p>`);
      } else founding = { window_open: false, days_to_launch: Math.ceil(msToLaunch / 86400000) };
    } catch (e) { console.error('founding auto-send failed', e.message); }

    // Weekly team digest — Fridays, only once the insider launch has passed.
    // Guarded by a settings flag so a re-run the same day never double-sends.
    let weekly = null;
    try {
      const nowEt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const [ins] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
      const launched = ins?.value && new Date(ins.value).getTime() <= Date.now();
      const stamp = nowEt.toISOString().slice(0, 10);
      const [done] = await sql`SELECT value FROM settings WHERE key = 'weekly_digest_sent'`;
      if (nowEt.getDay() === 5 && done?.value !== stamp) {
        weekly = launched ? await sendWeeklyDigest(sql) : await sendWaitlistWeekly(sql);
        await sql`INSERT INTO settings (key, value) VALUES ('weekly_digest_sent', ${stamp}) ON CONFLICT (key) DO UPDATE SET value = ${stamp}`;
      }
    } catch (e) { console.error('weekly digest failed', e.message); }
    // Monthly report — the 1st of each month, once the insider launch has passed
    let monthly = null;
    try {
      const nowEt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const [ins] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
      const launched = ins?.value && new Date(ins.value).getTime() <= Date.now();
      const stamp = nowEt.toISOString().slice(0, 7);
      const [done] = await sql`SELECT value FROM settings WHERE key = 'monthly_report_sent'`;
      if (launched && nowEt.getDate() === 1 && done?.value !== stamp) {
        monthly = await sendMonthlyReport(sql);
        try { monthly.dakjen = await sendDakJenMonthly(sql); } catch (e) { console.error('dakjen monthly failed', e.message); }
        await sql`INSERT INTO settings (key, value) VALUES ('monthly_report_sent', ${stamp}) ON CONFLICT (key) DO UPDATE SET value = ${stamp}`;
      }
    } catch (e) { console.error('monthly report failed', e.message); }
    return res.json({ success: true, expired: rows.length, sent, drip, pot_released: released, pot_released_cents: releasedCents, weekly, monthly, founding });
  }

  if (!requireAdmin(req, res)) return;
  const sql = neon(process.env.DATABASE_URL);

  try {
    // GET ?audience=... → recipient count preview
    if (req.method === 'GET') {
      // Email engagement, straight from Brevo: 30-day aggregate + recent events
      // (delivered / opened / clicked, per recipient). ?email= filters to one person.
      if (req.query.engagement === '1') {
        const key = process.env.BREVO_API_KEY;
        if (!key) return res.status(502).json({ error: 'Brevo is not configured' });
        const H = { 'api-key': key, accept: 'application/json' };
        const emailFilter = req.query.email ? `&email=${encodeURIComponent(String(req.query.email).trim())}` : '';
        const [aggRes, evRes] = await Promise.all([
          fetch('https://api.brevo.com/v3/smtp/statistics/aggregatedReport?days=30', { headers: H }),
          fetch(`https://api.brevo.com/v3/smtp/statistics/events?limit=80&days=30&sort=desc${emailFilter}`, { headers: H }),
        ]);
        const agg = aggRes.ok ? await aggRes.json() : null;
        const ev = evRes.ok ? await evRes.json() : null;
        return res.json({
          stats: agg ? { sent: agg.requests || 0, delivered: agg.delivered || 0, opened: agg.uniqueOpens ?? agg.opens ?? 0, clicked: agg.uniqueClicks ?? agg.clicks ?? 0, bounced: (agg.hardBounces || 0) + (agg.softBounces || 0) } : null,
          events: (ev?.events || []).map(e => ({ email: e.email, event: e.event, subject: e.subject || '', date: e.date, link: e.link || null })),
        });
      }
      const rows = await recipients(sql, req.query.audience || 'all');
      return res.json({ count: rows.length });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { kind, audience, subject, message, title, date, time, description, to_email, to_name, link } = req.body;

    // Team preview: the waitlist welcome emails, sent to any address so the
    // wording can be reviewed in a real inbox. Subjects are [PREVIEW]-prefixed.
    // Founding thank-you: preview to any addresses, or the real once-only send
    // to every insider waitlister who hasn't gotten it yet.
    // Weekly digest preview — sends the real numbers to whoever asks, tagged [PREVIEW]
    if (kind === 'waitlist_weekly_preview' || kind === 'waitlist_weekly_send') {
      const recips = kind === 'waitlist_weekly_send' ? ['gmerritt@nreuv.com', 'djmj@nreuv.com'] : String(to_email || '').split(/[,;\s]+/).map(a => a.trim()).filter(a => a.includes('@'));
      if (!recips.length) return res.status(400).json({ error: 'Recipient email required' });
      const r = await sendWaitlistWeekly(sql, { to: recips, preview: kind === 'waitlist_weekly_preview' });
      return r.sent ? res.json({ success: true, sent: r.sent }) : res.status(502).json({ error: 'Email failed to send' });
    }

    if (kind === 'weekly_digest_preview') {
      const recips = String(to_email || '').split(/[,;\s]+/).map(a => a.trim()).filter(a => a.includes('@'));
      if (!recips.length) return res.status(400).json({ error: 'Recipient email required' });
      const r = await sendWeeklyDigest(sql, { to: recips, preview: true });
      return r.sent ? res.json({ success: true, sent: r.sent }) : res.status(502).json({ error: 'Email failed to send' });
    }

    if (kind === 'dakjen_monthly_preview') {
      const recips = String(to_email || '').split(/[,;\s]+/).map(a => a.trim()).filter(a => a.includes('@'));
      if (!recips.length) return res.status(400).json({ error: 'Recipient email required' });
      const r = await sendDakJenMonthly(sql, { to: recips, preview: true });
      return r.sent ? res.json({ success: true, sent: r.sent }) : res.status(502).json({ error: 'Email failed to send' });
    }

    if (kind === 'monthly_report_preview') {
      const recips = String(to_email || '').split(/[,;\s]+/).map(a => a.trim()).filter(a => a.includes('@'));
      if (!recips.length) return res.status(400).json({ error: 'Recipient email required' });
      const r = await sendMonthlyReport(sql, { to: recips, preview: true });
      return r.sent ? res.json({ success: true, sent: r.sent }) : res.status(502).json({ error: 'Email failed to send' });
    }

    if (kind === 'founding_thanks') {
      if (to_email) {
        const mail = foundingThanksEmail('Dakotah');
        const recips = String(to_email).split(/[,;\s]+/).map(a => a.trim()).filter(a => a.includes('@'));
        let sent = 0;
        for (const addr of recips) { if (await sendEmail(addr, `[PREVIEW] ${mail.subject}`, mail.html, { light: true })) sent++; }
        return sent ? res.json({ success: true, sent, preview: true }) : res.status(502).json({ error: 'Email failed to send — is Brevo configured?' });
      }
      await sql`ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS founding_thanked TIMESTAMPTZ`;
      const rows = await sql`SELECT id, name, email FROM waitlist WHERE COALESCE(list,'insider') = 'insider' AND founding_thanked IS NULL`;
      let sent = 0;
      for (const r of rows) {
        const mail = foundingThanksEmail(r.name);
        const ok = await sendEmail(r.email, mail.subject, mail.html, { marketing: true, light: true });
        if (ok) { await sql`UPDATE waitlist SET founding_thanked = NOW() WHERE id = ${r.id}`; sent++; }
      }
      return res.json({ success: true, sent, total: rows.length });
    }

    if (kind === 'waitlist_preview') {
      if (!to_email) return res.status(400).json({ error: 'Recipient email required' });
      const first = firstName(to_name, 'Dakotah');
      const sampleRec = recommendPlan({ budget: '$150–$500', learn: 'Underwriting and the capital stack', reason: 'My numbers keep coming back short' });
      const [lr] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
      const launchAt = lr?.value || null;
      const launchText = launchAt ? new Date(launchAt).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'Launch day';
      const sampleLink = `${siteUrl()}/?join=1&plan=${sampleRec.tier}`;
      const variants = [
        { label: 'Welcome · Insider', mail: waitlistConfirmEmail(first, false, false, 'insider') },
        { label: 'Welcome · Insider + Founding 25', mail: waitlistConfirmEmail(first, true, false, 'insider') },
        { label: 'Welcome · General (site popup)', mail: waitlistConfirmEmail(first, false, false, 'general') },
        { label: 'Countdown — 2 weeks', mail: countdownEmail('2 weeks', launchText) },
        { label: 'Plan recommendation — 7 days out', mail: recommendEmail(first, sampleRec, launchAt, 'My numbers keep coming back short') },
        { label: 'Launch + pay link', mail: launchEmail(first, sampleRec, sampleLink, 'My numbers keep coming back short', null) },
        { label: 'Senior Advisor Retainer — discovery call', mail: retainerInterestEmail(first, null) },
      ];
      const recips = String(to_email).split(/[,;\s]+/).map(a => a.trim()).filter(a => a.includes('@'));
      let sent = 0;
      for (const addr of recips) for (const v of variants) {
        const ok = await sendEmail(addr, `[PREVIEW · ${v.label}] ${v.mail.subject}`, v.mail.html);
        if (ok) sent++;
      }
      return sent ? res.json({ success: true, sent, total: variants.length * recips.length }) : res.status(502).json({ error: 'Email failed to send — is Brevo configured?' });
    }

    // One-off personal meeting email (1:1 sessions) — team drops the link, we send it
    if (kind === 'meeting') {
      if (!to_email || !date) return res.status(400).json({ error: 'Recipient email and date required' });
      if (link) { try { new URL(link); } catch { return res.status(400).json({ error: 'Invalid meeting link' }); } }
      const mail = meetingEmail(to_name || '', title, date, time, link);
      const ok = await sendEmail(to_email, mail.subject, mail.html, { marketing: true });
      return ok ? res.json({ success: true, sent: 1, total: 1 }) : res.status(502).json({ error: 'Email failed to send — is Brevo configured?' });
    }

    // Lunch & Learn reminder with the join link — goes to everyone who RSVP'd
    if (kind === 'lnl_reminder') {
      if (!date) return res.status(400).json({ error: 'Date required' });
      const [linkRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_link'`;
      if (!linkRow?.value) return res.status(400).json({ error: 'Set the live session link first (Lunch & Learn tab)' });
      const [evRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_event'`;
      const event = evRow?.value ? JSON.parse(evRow.value) : null;
      if (!event) return res.status(400).json({ error: 'Schedule the next session first (Lunch & Learn tab)' });
      const rows = await sql`
        SELECT u.name, u.email FROM lnl_rsvps r JOIN users u ON u.id = r.user_id
        WHERE r.event_key = ${event.date}`;
      if (rows.length === 0) return res.status(400).json({ error: 'No RSVPs yet for this session' });
      const mail = lnlReminderEmail(title, date, time || '', linkRow.value);
      const sent = await sendBulk(rows, mail.subject, mail.html);
      return res.json({ success: true, sent, total: rows.length });
    }

    const rows = await recipients(sql, audience || 'all');
    if (rows.length === 0) return res.status(400).json({ error: 'No recipients in that audience' });

    let sent = 0;
    if (kind === 'deal_support') {
      const mail = dealSupportNudgeEmail();
      sent = await sendBulk(rows, mail.subject, mail.html);
    } else if (kind === 'event') {
      if (!title || !date) return res.status(400).json({ error: 'Event title and date required' });
      const mail = eventEmail(title, date, time || '', description || '', audience === 'lnl');
      sent = await sendBulk(rows, mail.subject, mail.html);
    } else {
      if (!subject || !message) return res.status(400).json({ error: 'Subject and message required' });
      if (message.length > 10000) return res.status(400).json({ error: 'Message too long' });
      const mail = broadcastEmail(subject, message);
      sent = await sendBulk(rows, mail.subject, mail.html);
    }
    return res.json({ success: true, sent, total: rows.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}


// ── The Friday team digest: what happened this week, in one email ────────────
const PRICES = { Basic: 49.99, Builder: 149.99, Premium: 249.99, Elite: 499.99 };
const FOUNDING = { Basic: 37.49, Builder: 112.49, Premium: 187.49, Elite: 374.99 };
const TIER_LABEL = { Basic: 'Member', Builder: 'Builder', Premium: 'Premium', Elite: 'Owner' };
const mrrOf = (u) => (u.comped || u.role === 'admin' || !PRICES[u.tier]) ? 0 : ((Array.isArray(u.badges) ? u.badges : []).includes('founding25') ? FOUNDING[u.tier] : PRICES[u.tier]);
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function sendWeeklyDigest(sql, opts = {}) {
  const week = "NOW() - interval '7 days'";
  const users = await sql`SELECT id, name, email, tier, role, comped, badges, membership_status, created_at, tier_since, cancelled_at FROM users`;
  const active = users.filter(u => u.membership_status === 'active' && (u.role || 'member') === 'member');
  const paying = active.filter(u => mrrOf(u) > 0);
  const mrr = paying.reduce((a, u) => a + mrrOf(u), 0);
  const [ret] = await sql`SELECT COUNT(*)::int AS n, COALESCE(SUM(monthly_amount),0)::float AS mrr FROM retainers WHERE status = 'active'`;
  const totalMrr = mrr + Number(ret.mrr || 0);

  const since = new Date(Date.now() - 7 * 86400000);
  const newSignups = users.filter(u => new Date(u.created_at) >= since && (u.role || 'member') === 'member');
  const newPaid = active.filter(u => u.tier_since && new Date(u.tier_since) >= since && mrrOf(u) > 0);
  const gainedMrr = newPaid.reduce((a, u) => a + mrrOf(u), 0);
  const lost = users.filter(u => u.cancelled_at && new Date(u.cancelled_at) >= since);
  const lostMrr = lost.reduce((a, u) => a + (PRICES[u.tier] || 0), 0);

  const [wl] = await sql`SELECT COUNT(*)::int AS n FROM waitlist WHERE created_at >= NOW() - interval '7 days'`;
  const [posts] = await sql`SELECT COUNT(*)::int AS n FROM messages WHERE created_at >= NOW() - interval '7 days' AND deleted = FALSE`;
  const [dmsN] = await sql`SELECT COUNT(*)::int AS n FROM dms WHERE created_at >= NOW() - interval '7 days' AND from_admin = FALSE`;
  const [rsvps] = await sql`SELECT COUNT(*)::int AS n FROM lnl_rsvps WHERE created_at >= NOW() - interval '7 days'`;
  let lessonsDone = 0; try { const [l] = await sql`SELECT COUNT(*)::int AS n FROM lesson_progress WHERE completed_at >= NOW() - interval '7 days'`; lessonsDone = l.n; } catch {}
  let leads = 0; try { const [d] = await sql`SELECT COUNT(*)::int AS n FROM deal_leads WHERE created_at >= NOW() - interval '7 days'`; leads = d.n; } catch {}
  let tickets = 0; try { const [t] = await sql`SELECT COUNT(*)::int AS n FROM session_requests WHERE created_at >= NOW() - interval '7 days'`; tickets = t.n; } catch {}
  const tierCounts = ['Elite', 'Premium', 'Builder', 'Basic'].map(t => [TIER_LABEL[t], active.filter(u => u.tier === t).length]);

  const S = "'DM Sans',Arial,Helvetica,sans-serif";
  const stat = (label, value, sub, color = '#161616') => `<td style="padding:6px;width:33%;vertical-align:top;"><div style="background:#faf7f2;border:1px solid #e5dccf;border-radius:12px;padding:16px 14px;"><div style="font-family:${S};font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8a8a8a;font-weight:bold;margin-bottom:8px;">${label}</div><div style="font-family:Georgia,serif;font-size:26px;font-weight:bold;color:${color};line-height:1;">${value}</div>${sub ? `<div style="font-family:${S};font-size:11px;color:#8a8a8a;margin-top:6px;">${sub}</div>` : ''}</div></td>`;
  const row = (label, value) => `<tr><td style="font-family:${S};font-size:13px;color:#444444;padding:6px 0;border-bottom:1px solid #f0ece4;">${label}</td><td align="right" style="font-family:${S};font-size:13px;color:#161616;font-weight:bold;padding:6px 0;border-bottom:1px solid #f0ece4;">${value}</td></tr>`;
  const person = (u, extra) => `<tr><td style="font-family:${S};font-size:13px;color:#161616;padding:5px 0;">${u.name} <span style="color:#8a8a8a;">· ${u.email}</span></td><td align="right" style="font-family:${S};font-size:12px;color:#8a8a8a;padding:5px 0;">${extra}</td></tr>`;
  const weekLabel = `${since.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const html = `
    <h2 style="font-family:Georgia,serif;color:#161616;font-size:24px;margin:0 0 4px;">The week at GroundUp</h2>
    <p style="font-family:${S};color:#8a8a8a;font-size:13px;margin:0 0 20px;">${weekLabel}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      ${stat('MRR now', money(totalMrr), `${paying.length} paying · ${ret.n} retainer${ret.n === 1 ? '' : 's'}`)}
      ${stat('Gained this week', '+' + money(gainedMrr), `${newPaid.length} new paid member${newPaid.length === 1 ? '' : 's'}`, '#1a7a3a')}
      ${stat('Lost this week', '−' + money(lostMrr), `${lost.length} cancellation${lost.length === 1 ? '' : 's'}`, lost.length ? '#b80101' : '#161616')}
    </tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;"><tr>
      ${stat('New accounts', newSignups.length, 'signed up this week')}
      ${stat('Waitlist joins', wl.n, 'this week')}
      ${stat('ARR run-rate', money(totalMrr * 12), 'MRR × 12')}
    </tr></table>

    <div style="font-family:${S};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#b80101;font-weight:bold;margin:26px 0 8px;">Community & learning</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row('Community posts', posts.n)}${row('Member DMs to the team', dmsN.n)}${row('Lessons completed', lessonsDone)}${row('Event RSVPs', rsvps.n)}${row('Deal leads (send-her-your-deal)', leads)}${row('Session requests', tickets)}
    </table>

    <div style="font-family:${S};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#b80101;font-weight:bold;margin:26px 0 8px;">Members by tier</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${tierCounts.map(([l, n]) => row(l, n)).join('')}</table>

    ${newPaid.length ? `<div style="font-family:${S};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#1a7a3a;font-weight:bold;margin:26px 0 8px;">New paying members</div><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${newPaid.map(u => person(u, `${TIER_LABEL[u.tier]} · ${money(mrrOf(u))}/mo`)).join('')}</table>` : ''}
    ${lost.length ? `<div style="font-family:${S};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#b80101;font-weight:bold;margin:26px 0 8px;">Cancellations</div><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${lost.map(u => person(u, `was ${TIER_LABEL[u.tier] || u.tier}`)).join('')}</table>` : ''}
    ${newSignups.length && newSignups.length <= 25 ? `<div style="font-family:${S};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#8a8a8a;font-weight:bold;margin:26px 0 8px;">New accounts</div><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${newSignups.map(u => person(u, TIER_LABEL[u.tier] || u.tier)).join('')}</table>` : ''}
    <p style="font-family:${S};color:#8a8a8a;font-size:12px;line-height:1.7;margin:28px 0 0;">Full detail lives in the admin: Revenue for the money, Users for the people, Waitlist for the pipeline. This digest goes out every Friday.</p>`;
  const subject = `GroundUp weekly — ${money(totalMrr)} MRR · +${newPaid.length} paid · ${newSignups.length} new accounts`;
  const to = opts.to || ['gmerritt@nreuv.com', 'djmj@nreuv.com'];
  let sent = 0;
  for (const addr of to) { if (await sendEmail(addr, (opts.preview ? '[PREVIEW] ' : '') + subject, html, { light: true })) sent++; }
  return { sent, to, subject, mrr: totalMrr, gained: gainedMrr, lost: lostMrr };
}


// NREUV's actual revenue = Stripe transfers to their connected account (the
// 75/90/100 splits, including refund-pot releases). Summed for a window.
async function nreuvTransfers(fromSec, toSec) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.NREUV_CONNECT_ACCOUNT) return null;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let total = 0, count = 0, starting_after;
  for (let page = 0; page < 20; page++) {
    const res = await stripe.transfers.list({ limit: 100, destination: process.env.NREUV_CONNECT_ACCOUNT, created: { gte: fromSec, lt: toSec }, ...(starting_after ? { starting_after } : {}) });
    for (const t of res.data) { total += t.amount - (t.amount_reversed || 0); count++; }
    if (!res.has_more) break; starting_after = res.data[res.data.length - 1].id;
  }
  return { total: total / 100, count };
}

// ── The monthly report: the 1st of the month, the month that just closed ─────
export async function sendMonthlyReport(sql, opts = {}) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);   // first day of last month
  const end = new Date(now.getFullYear(), now.getMonth(), 1);         // first day of this month
  const monthName = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const users = await sql`SELECT id, name, email, tier, role, comped, badges, membership_status, created_at, tier_since, cancelled_at FROM users`;
  const active = users.filter(u => u.membership_status === 'active' && (u.role || 'member') === 'member');
  const paying = active.filter(u => mrrOf(u) > 0);
  const memberMrr = paying.reduce((a, u) => a + mrrOf(u), 0);
  const [ret] = await sql`SELECT COUNT(*)::int AS n, COALESCE(SUM(monthly_amount),0)::float AS mrr FROM retainers WHERE status = 'active'`;
  const totalMrr = memberMrr + Number(ret.mrr || 0);

  const inMonth = (d) => d && new Date(d) >= start && new Date(d) < end;
  const newSignups = users.filter(u => inMonth(u.created_at) && (u.role || 'member') === 'member');
  const newPaid = active.filter(u => inMonth(u.tier_since) && mrrOf(u) > 0);
  const gainedMrr = newPaid.reduce((a, u) => a + mrrOf(u), 0);
  const lost = users.filter(u => inMonth(u.cancelled_at));
  const lostMrr = lost.reduce((a, u) => a + (PRICES[u.tier] || 0), 0);
  // "Above Premium" = Owner members and retainer clients who started this month
  const newOwners = newPaid.filter(u => u.tier === 'Elite');
  const newRetainers = await sql`SELECT r.*, u.name, u.email FROM retainers r JOIN users u ON u.id = r.user_id WHERE r.status = 'active' AND r.created_at >= ${start.toISOString()} AND r.created_at < ${end.toISOString()}`;

  // Pending: things waiting on the team right now
  const [dmPending] = await sql`SELECT COUNT(DISTINCT d.user_id)::int AS n FROM dms d
    WHERE d.from_admin = FALSE AND NOT EXISTS (SELECT 1 FROM dms a WHERE a.user_id = d.user_id AND a.from_admin = TRUE AND a.created_at > d.created_at)`;
  const [wsPending] = await sql`SELECT COUNT(DISTINCT m.retainer_id)::int AS n FROM retainer_messages m
    WHERE m.from_admin = FALSE AND NOT EXISTS (SELECT 1 FROM retainer_messages a WHERE a.retainer_id = m.retainer_id AND a.from_admin = TRUE AND a.created_at > m.created_at)`;
  let sessionsPending = 0; try { const [sp] = await sql`SELECT COUNT(*)::int AS n FROM session_requests WHERE status = 'pending'`; sessionsPending = sp.n; } catch {}
  let bookingsPending = 0; try { const [bp] = await sql`SELECT COUNT(*)::int AS n FROM bookings WHERE status = 'awaiting_booking'`; bookingsPending = bp.n; } catch {}
  let topicReqs = 0; try { const [tr] = await sql`SELECT COUNT(*)::int AS n FROM lnl_requests WHERE created_at >= ${start.toISOString()} AND created_at < ${end.toISOString()}`; topicReqs = tr.n; } catch {}

  // One-time revenue this month from Stripe, if reachable (passes, sessions, L&L, intake)
  let oneTime = null;
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      let total = 0, count = 0, starting_after;
      for (let page = 0; page < 10; page++) {
        const res = await stripe.charges.list({ limit: 100, created: { gte: Math.floor(start.getTime() / 1000), lt: Math.floor(end.getTime() / 1000) }, ...(starting_after ? { starting_after } : {}) });
        for (const c of res.data) if (c.paid && !c.refunded) { total += c.amount; count++; }
        if (!res.has_more) break; starting_after = res.data[res.data.length - 1].id;
      }
      oneTime = { total: total / 100, count };
    }
  } catch (e) { console.error('monthly stripe pull failed', e.message); }

  const tierCounts = ['Elite', 'Premium', 'Builder', 'Basic'].map(t => [TIER_LABEL[t], active.filter(u => u.tier === t).length]);
  // NREUV's take — what actually moved to their Stripe account: last month and year to date
  const yearStart = new Date(start.getFullYear(), 0, 1);
  let nreuvMonth = null, nreuvYtd = null;
  try {
    nreuvMonth = await nreuvTransfers(Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000));
    nreuvYtd = await nreuvTransfers(Math.floor(yearStart.getTime() / 1000), Math.floor(end.getTime() / 1000));
  } catch (e) { console.error('nreuv transfer pull failed', e.message); }
  // NREUV's share of the recurring base (memberships 75%, retainers 90%)
  const nreuvMrr = memberMrr * 0.75 + Number(ret.mrr || 0) * 0.90;

  const S = "'DM Sans',Arial,Helvetica,sans-serif";
  const stat = (label, value, sub, color = '#161616') => `<td style="padding:6px;width:33%;vertical-align:top;"><div style="background:#faf7f2;border:1px solid #e5dccf;border-radius:12px;padding:16px 14px;"><div style="font-family:${S};font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8a8a8a;font-weight:bold;margin-bottom:8px;">${label}</div><div style="font-family:Georgia,serif;font-size:26px;font-weight:bold;color:${color};line-height:1;">${value}</div>${sub ? `<div style="font-family:${S};font-size:11px;color:#8a8a8a;margin-top:6px;">${sub}</div>` : ''}</div></td>`;
  const row = (label, value) => `<tr><td style="font-family:${S};font-size:13px;color:#444444;padding:6px 0;border-bottom:1px solid #f0ece4;">${label}</td><td align="right" style="font-family:${S};font-size:13px;color:#161616;font-weight:bold;padding:6px 0;border-bottom:1px solid #f0ece4;">${value}</td></tr>`;
  const person = (name, email, extra) => `<tr><td style="font-family:${S};font-size:13px;color:#161616;padding:5px 0;">${name} <span style="color:#8a8a8a;">· ${email}</span></td><td align="right" style="font-family:${S};font-size:12px;color:#8a8a8a;padding:5px 0;">${extra}</td></tr>`;
  const head = (t, c = '#b80101') => `<div style="font-family:${S};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:${c};font-weight:bold;margin:26px 0 8px;">${t}</div>`;

  const html = `
    <h2 style="font-family:Georgia,serif;color:#161616;font-size:24px;margin:0 0 4px;">GroundUp — ${monthName}</h2>
    <p style="font-family:${S};color:#8a8a8a;font-size:13px;margin:0 0 20px;">The month in full, from NREUV's seat. Sent the 1st of every month.</p>
    ${head('NREUV revenue')}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      ${stat(monthName.split(' ')[0] + ' — paid to NREUV', nreuvMonth ? money(nreuvMonth.total) : '—', nreuvMonth ? `${nreuvMonth.count} transfer${nreuvMonth.count === 1 ? '' : 's'} to your Stripe account` : 'fills in on the server (Stripe)', '#1a7a3a')}
      ${stat(start.getFullYear() + ' year to date', nreuvYtd ? money(nreuvYtd.total) : '—', nreuvYtd ? `${nreuvYtd.count} transfers since Jan 1` : 'fills in on the server (Stripe)', '#1a7a3a')}
      ${stat('Recurring, your share', money(nreuvMrr) + '/mo', 'of ' + money(totalMrr) + ' gross MRR — 75% memberships · 90% retainers')}
    </tr></table>
    ${head('Membership base')}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      ${stat('Gross MRR at month end', money(totalMrr), `${paying.length} paying · ${ret.n} retainer${ret.n === 1 ? '' : 's'}`)}
      ${stat('MRR gained', '+' + money(gainedMrr), `${newPaid.length} new paid`, '#1a7a3a')}
      ${stat('MRR lost', '−' + money(lostMrr), `${lost.length} cancellation${lost.length === 1 ? '' : 's'}`, lost.length ? '#b80101' : '#161616')}
    </tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;"><tr>
      ${stat('Total collected (gross)', oneTime ? money(oneTime.total) : '—', oneTime ? `${oneTime.count} payments, all products` : 'fills in on the server (Stripe)')}
      ${stat('ARR run-rate (gross)', money(totalMrr * 12), 'MRR × 12')}
      ${stat('Net MRR change', (gainedMrr - lostMrr >= 0 ? '+' : '−') + money(Math.abs(gainedMrr - lostMrr)), 'gained minus lost', gainedMrr - lostMrr >= 0 ? '#1a7a3a' : '#b80101')}
    </tr></table>

    ${head('New sign-ups')}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${row('New accounts', newSignups.length)}${row('New paying members', newPaid.length)}${row('Course-topic requests', topicReqs)}</table>

    ${head('New clients above Premium', '#8a5a08')}
    ${newOwners.length || newRetainers.length ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${newRetainers.map(r => person(r.name, r.email, `Senior Advisor · ${r.hours_per_month} hrs · ${money(r.monthly_amount)}/mo`)).join('')}${newOwners.map(u => person(u.name, u.email, `Owner · ${money(mrrOf(u))}/mo`)).join('')}</table>` : `<p style="font-family:${S};font-size:13px;color:#8a8a8a;margin:0;">None this month.</p>`}

    ${head('Pending — waiting on the team', '#b80101')}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${row('Member DMs without a reply', dmPending.n)}${row('Advisory workspaces awaiting a reply', wsPending.n)}${row('Session requests pending', sessionsPending)}${row('Paid sessions not yet booked', bookingsPending)}</table>

    ${head('Members by tier', '#8a8a8a')}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${tierCounts.map(([l, n]) => row(l, n)).join('')}</table>
    ${lost.length ? head('Cancellations') + `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${lost.map(u => person(u.name, u.email, `was ${TIER_LABEL[u.tier] || u.tier}`)).join('')}</table>` : ''}
    <p style="font-family:${S};color:#8a8a8a;font-size:12px;line-height:1.7;margin:28px 0 0;">Money detail: Admin → Revenue. People: Admin → Users. Pipeline: Admin → Waitlist.</p>`;
  const subject = `GroundUp monthly — ${monthName}: ${money(totalMrr)} MRR · +${newPaid.length} paid · ${newOwners.length + newRetainers.length} above Premium`;
  const to = opts.to || ['gmerritt@nreuv.com', 'djmj@nreuv.com'];
  let sent = 0;
  for (const addr of to) { if (await sendEmail(addr, (opts.preview ? '[PREVIEW] ' : '') + subject, html, { light: true })) sent++; }
  return { sent, to, subject, mrr: totalMrr };
}


// ── The DakJen monthly: Notable-branded, DakJen's side of the ledger ─────────
// DakJen's GroundUp take = gross collected minus what transferred to NREUV
// (the platform absorbs Stripe fees, so this is before fees). Notable revenue
// is a slot for a second source once it's wired (QuickBooks / Notable Stripe).
async function grossCharges(fromSec, toSec) {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let total = 0, fees = 0, count = 0, starting_after;
  for (let page = 0; page < 20; page++) {
    const res = await stripe.charges.list({ limit: 100, created: { gte: fromSec, lt: toSec }, expand: ['data.balance_transaction'], ...(starting_after ? { starting_after } : {}) });
    for (const c of res.data) if (c.paid) { total += c.amount - (c.amount_refunded || 0); fees += (c.balance_transaction?.fee || 0); count++; }
    if (!res.has_more) break; starting_after = res.data[res.data.length - 1].id;
  }
  return { total: total / 100, fees: fees / 100, count };
}

export async function sendDakJenMonthly(sql, opts = {}) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(start.getFullYear(), 0, 1);
  const monthName = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const mo = monthName.split(' ')[0];
  const sec = (d) => Math.floor(d.getTime() / 1000);

  let gM = null, gY = null, nM = null, nY = null;
  try { gM = await grossCharges(sec(start), sec(end)); gY = await grossCharges(sec(yearStart), sec(end)); nM = await nreuvTransfers(sec(start), sec(end)); nY = await nreuvTransfers(sec(yearStart), sec(end)); } catch (e) { console.error('dakjen stripe pull failed', e.message); }
  const L = (g, n) => g && n ? { gross: g.total, nreuv: n.total, fees: g.fees, net: g.total - n.total - g.fees } : null;
  const djM = L(gM, nM), djY = L(gY, nY);

  const users = await sql`SELECT tier, role, comped, badges, membership_status, created_at, tier_since FROM users`;
  const active = users.filter(u => u.membership_status === 'active' && (u.role || 'member') === 'member');
  const paying = active.filter(u => mrrOf(u) > 0);
  const memberMrr = paying.reduce((a, u) => a + mrrOf(u), 0);
  const [ret] = await sql`SELECT COUNT(*)::int AS n, COALESCE(SUM(monthly_amount),0)::float AS mrr FROM retainers WHERE status = 'active'`;
  const djMrr = memberMrr * 0.25 + Number(ret.mrr || 0) * 0.10;
  const inMonth = (d) => d && new Date(d) >= start && new Date(d) < end;
  const newSignups = users.filter(u => inMonth(u.created_at) && (u.role || 'member') === 'member').length;
  const newPaid = active.filter(u => inMonth(u.tier_since) && mrrOf(u) > 0).length;
  const notable = opts.notable || null;

  // One clean statement: a single table, label left, amount right. No tiles.
  // DJC brand, per the marketing-report styling spec: Calibri; Navy #1B2A4A
  // headings and section bars; Rose #C0737A accent rules and stat numbers;
  // Dark Gray #2D2D2D body; Medium Gray #6B6B6B captions; Light Gray #F4F4F4 rows.
  const F = "Calibri,Arial,Helvetica,sans-serif";
  const NAVY = '#1B2A4A', ROSE = '#C0737A', DARK = '#2D2D2D', MID = '#6B6B6B', LIGHT = '#F4F4F4';
  let i = 0;
  const line = (label, value, o = {}) => { const bg = o.strong ? '#ffffff' : (i++ % 2 === 1 ? LIGHT : '#ffffff'); const top = o.strong ? 'border-top:2px solid ' + NAVY + ';' : ''; return `<tr>
    <td style="font-family:${F};font-size:14px;color:${o.strong ? NAVY : DARK};font-weight:${o.strong ? 'bold' : 'normal'};padding:9px 10px;background:${bg};${top}">${label}</td>
    <td align="right" style="font-family:${F};font-size:${o.strong ? '17px' : '14px'};color:${o.strong ? (o.color || ROSE) : DARK};font-weight:bold;padding:9px 10px;white-space:nowrap;background:${bg};${top}">${value}</td></tr>`; };
  const section = (title) => { i = 0; return `<tr><td colspan="2" style="padding:22px 0 0;"><div style="background:${NAVY};color:#ffffff;font-family:${F};font-size:13px;font-weight:bold;letter-spacing:0.5px;padding:8px 12px;">${title}</div></td></tr>`; };
  const statement = (T, label) => T
    ? line('Collected from members', money(T.gross)) + line('Paid to NREUV', '(' + money(T.nreuv) + ')') + line('Stripe fees', '(' + money(T.fees) + ')') + line('DakJen net — ' + label, money(T.net), { strong: true, color: T.net >= 0 ? ROSE : '#b80101' })
    : line('DakJen net — ' + label, 'fills in on the server', { strong: true, color: MID });

  const body = `
    <div style="font-family:${F};font-size:28px;font-weight:bold;color:${NAVY};line-height:1.1;margin:0 0 6px;">Monthly Statement</div>
    <div style="font-family:${F};font-size:13px;color:${MID};font-style:italic;margin:0 0 4px;">${monthName} · GroundUp platform revenue, Notable share</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${section('GroundUp — ' + mo)}
      ${statement(djM, mo)}
      ${section('GroundUp — ' + start.getFullYear() + ' year to date')}
      ${statement(djY, 'YTD')}
      ${section('Recurring revenue')}
      ${line('Gross MRR at month end', money(memberMrr + Number(ret.mrr || 0)))}
      ${line('DakJen share of MRR (25% memberships · 10% retainers)', money(djMrr) + '/mo', { strong: true })}
      ${section('Notable')}
      ${notable ? line(mo + ' revenue', money(notable.month)) + line(start.getFullYear() + ' YTD', money(notable.ytd), { strong: true }) : line('Revenue source not yet connected', '—')}
      ${section('GroundUp growth')}
      ${line('New accounts', newSignups)}
      ${line('New paying members', newPaid)}
      ${line('Paying members now', paying.length)}
      ${line('Active retainers', ret.n)}
    </table>
    ${notable ? '' : `<p style="font-family:${F};color:${MID};font-size:12px;font-style:italic;line-height:1.6;margin:18px 0 0;">Notable fills in once its revenue source is connected (QuickBooks, a Notable Stripe account, or a sheet).</p>`}`;

  // DJC page: white, the DJC MARKETING header over a rose rule, the DJC footer
  const shell = `
    <div style="background:#ffffff;padding:28px 16px;font-family:${F};">
      <div style="max-width:600px;margin:0 auto;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-bottom:2px solid ${ROSE};margin-bottom:26px;"><tr>
          <td style="font-family:${F};font-size:15px;font-weight:bold;color:${NAVY};letter-spacing:1px;padding:0 0 10px;">NOTABLE</td>
          <td align="right" style="font-family:${F};padding:0 0 10px;"><div style="font-size:13px;font-weight:bold;color:${NAVY};">Powered by Notable Services</div><div style="font-size:11px;color:${MID};">Monthly Statement | ${monthName}</div></td>
        </tr></table>
        ${body}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid ${ROSE};margin-top:30px;"><tr>
          <td style="font-family:${F};font-size:11px;color:${MID};padding-top:10px;">gobenotable.com &nbsp;|&nbsp; Powered by Notable Services</td>
          <td align="right" style="font-family:${F};font-size:11px;color:${MID};padding-top:10px;">Internal · not sent to NREUV</td>
        </tr></table>
      </div>
    </div>`;
  const subject = `DakJen monthly — ${monthName}: ${djM ? money(djM.net) : '—'} net · ${djY ? money(djY.net) : '—'} YTD`;
  const to = opts.to || ['dakotah@dakjencreative.com'];
  let sent = 0;
  for (const addr of to) { if (await sendEmail(addr, (opts.preview ? '[PREVIEW] ' : '') + subject, shell, { raw: true })) sent++; }
  return { sent, to, subject, month: djM, ytd: djY };
}


// ── Pre-launch Friday summary: the waitlist to date, NREUV's view ────────────
// Same per-person math as the admin Waitlist tab: each entry's recommended plan
// at the founding rate. No DakJen figures in this email.
const REC_MRR = { Basic: 37.49, Builder: 112.49, Premium: 187.49, Elite: 374.99 };
export async function sendWaitlistWeekly(sql, opts = {}) {
  const entries = await sql`SELECT id, name, email, list, budget, learn, reason, founding_lnl, first10, rec_override, comped, created_at FROM waitlist ORDER BY created_at DESC`;
  const since = new Date(Date.now() - 7 * 86400000);
  const fresh = entries.filter(e => new Date(e.created_at) >= since);
  const mrrFor = (e) => {
    if (e.comped) return 0;
    const r = recommendPlan(e);
    if (r.oneTime) return 0;
    if (r.tier === 'Advisor') return 3025;
    const list = { Basic: 49.99, Builder: 149.99, Premium: 249.99, Elite: 499.99 }[r.tier] || 0;
    return e.founding_lnl ? (REC_MRR[r.tier] || 0) : list;
  };
  const labelFor = (e) => { const r = recommendPlan(e); return r.tier === 'Advisor' ? 'Senior Advisor' : r.oneTime ? r.label : ({ Basic: 'Member', Builder: 'Builder', Premium: 'Premium', Elite: 'Owner' }[r.tier] || r.label); };
  const mrr = entries.reduce((a, e) => a + mrrFor(e), 0);
  const counts = {};
  for (const e of entries) { const l = labelFor(e); counts[l] = (counts[l] || 0) + 1; }
  const insiders = entries.filter(e => (e.list || 'insider') === 'insider').length;
  const founding = entries.filter(e => e.founding_lnl).length;
  const retainerLeads = entries.filter(e => labelFor(e) === 'Senior Advisor').length;
  const [ins] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
  const daysToLaunch = ins?.value ? Math.max(0, Math.ceil((new Date(ins.value).getTime() - Date.now()) / 86400000)) : null;

  const S = "'DM Sans',Arial,Helvetica,sans-serif";
  const stat = (label, value, sub, color = '#161616') => `<td style="padding:6px;width:33%;vertical-align:top;"><div style="background:#faf7f2;border:1px solid #e5dccf;border-radius:12px;padding:16px 14px;"><div style="font-family:${S};font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8a8a8a;font-weight:bold;margin-bottom:8px;">${label}</div><div style="font-family:Georgia,serif;font-size:26px;font-weight:bold;color:${color};line-height:1;">${value}</div>${sub ? `<div style="font-family:${S};font-size:11px;color:#8a8a8a;margin-top:6px;">${sub}</div>` : ''}</div></td>`;
  const row = (label, value) => `<tr><td style="font-family:${S};font-size:13px;color:#444444;padding:6px 0;border-bottom:1px solid #f0ece4;">${label}</td><td align="right" style="font-family:${S};font-size:13px;color:#161616;font-weight:bold;padding:6px 0;border-bottom:1px solid #f0ece4;">${value}</td></tr>`;
  const head = (t, c = '#b80101') => `<div style="font-family:${S};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:${c};font-weight:bold;margin:26px 0 8px;">${t}</div>`;
  const order = ['Senior Advisor', 'Owner', 'Premium', 'Builder', 'Member'];
  const tierRows = [...order.filter(k => counts[k]), ...Object.keys(counts).filter(k => !order.includes(k))].map(k => row(k, counts[k])).join('');

  const html = `
    <h2 style="font-family:Georgia,serif;color:#161616;font-size:24px;margin:0 0 4px;">The waitlist, to date</h2>
    <p style="font-family:${S};color:#8a8a8a;font-size:13px;margin:0 0 20px;">${daysToLaunch !== null ? `${daysToLaunch} days to insider launch · ` : ''}${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      ${stat('On the waitlist', entries.length, `${insiders} insider · ${entries.length - insiders} general`)}
      ${stat('New this week', '+' + fresh.length, fresh.length ? fresh.slice(0, 3).map(e => e.name.split(' ')[0]).join(', ') + (fresh.length > 3 ? '…' : '') : 'quiet week', '#1a7a3a')}
      ${stat('Founding members', founding, 'locked in at founding rates')}
    </tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;"><tr>
      ${stat('Anticipated MRR', money(mrr), 'if everyone joins their recommended plan', '#b80101')}
      ${stat('Anticipated ARR', money(mrr * 12), 'MRR × 12', '#b80101')}
      ${stat('Retainer leads', retainerLeads, 'Senior Advisor track', retainerLeads ? '#8a5a08' : '#161616')}
    </tr></table>
    ${head('Where they’re headed')}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${tierRows || row('No entries yet', '—')}</table>
    ${fresh.length ? head('Joined this week', '#1a7a3a') + `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${fresh.map(e => `<tr><td style="font-family:${S};font-size:13px;color:#161616;padding:5px 0;">${e.name} <span style="color:#8a8a8a;">· ${e.email}</span></td><td align="right" style="font-family:${S};font-size:12px;color:#8a8a8a;padding:5px 0;">${labelFor(e)}${e.founding_lnl ? ' · founding' : ''}</td></tr>`).join('')}</table>` : ''}
    <p style="font-family:${S};color:#8a8a8a;font-size:12px;line-height:1.7;margin:28px 0 0;">Every Friday until launch. After November 1 this becomes the weekly membership digest.</p>`;
  const subject = `GroundUp waitlist — ${entries.length} signed up · ${money(mrr)} anticipated MRR${fresh.length ? ` · +${fresh.length} this week` : ''}`;
  const to = opts.to || ['gmerritt@nreuv.com', 'djmj@nreuv.com'];
  let sent = 0;
  for (const addr of to) { if (await sendEmail(addr, (opts.preview ? '[PREVIEW] ' : '') + subject, html, { light: true })) sent++; }
  return { sent, to, subject, total: entries.length, mrr };
}
