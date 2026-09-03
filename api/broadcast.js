import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from './_utils.js';
import { sendBulk, sendEmail, broadcastEmail, eventEmail, lnlReminderEmail, meetingEmail, dealSupportNudgeEmail, passExpiryEmail } from './_email.js';

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
    return res.json({ success: true, expired: rows.length, sent, pot_released: released, pot_released_cents: releasedCents });
  }

  if (!requireAdmin(req, res)) return;
  const sql = neon(process.env.DATABASE_URL);

  try {
    // GET ?audience=... → recipient count preview
    if (req.method === 'GET') {
      const rows = await recipients(sql, req.query.audience || 'all');
      return res.json({ count: rows.length });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { kind, audience, subject, message, title, date, time, description, to_email, to_name, link } = req.body;

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
