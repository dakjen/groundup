import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from './_utils.js';
import { sendBulk, sendEmail, siteUrl, broadcastEmail, eventEmail, lnlReminderEmail, meetingEmail, dealSupportNudgeEmail, passExpiryEmail, waitlistConfirmEmail, retainerInterestEmail, countdownEmail, recommendEmail, launchEmail } from './_email.js';
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
      const ok = await sendEmail(r.email, mail.subject, mail.html);
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
        `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">Your courses are yours forever, ${(b.name || 'there').split(' ')[0]}.</h2>
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
        if (msLeft <= 0) {
          const r = await sendLaunchBatch(sql, list);
          if (r.total) drip[list + '_launch'] = r.sent;
        } else if (msLeft <= 7 * DAY) {
          const r = await sendRecommendBatch(sql, list);
          if (r.total) drip[list + '_recommend'] = r.sent;
        } else if (msLeft <= 14 * DAY) {
          const flag = 'drip_countdown14_' + list;
          const [done] = await sql`SELECT value FROM settings WHERE key = ${flag}`;
          if (!done?.value) {
            const entries = await sql`SELECT name, email FROM waitlist WHERE COALESCE(list, 'insider') = ${list} AND NOT COALESCE(comped, FALSE)`;
            if (entries.length) {
              const launchText = new Date(lr.value).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
              const mail = countdownEmail('2 weeks', launchText);
              drip[list + '_countdown'] = await sendBulk(entries, mail.subject, mail.html);
            }
            await sql`INSERT INTO settings (key, value) VALUES (${flag}, 'sent') ON CONFLICT (key) DO UPDATE SET value = 'sent'`;
          }
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
    return res.json({ success: true, expired: rows.length, sent, drip, pot_released: released, pot_released_cents: releasedCents });
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
    if (kind === 'waitlist_preview') {
      if (!to_email) return res.status(400).json({ error: 'Recipient email required' });
      const first = (to_name || 'Dakotah').split(' ')[0];
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
      const ok = await sendEmail(to_email, mail.subject, mail.html);
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
