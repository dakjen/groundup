import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from './_utils.js';
import { sendBulk, sendEmail, siteUrl, broadcastEmail, eventEmail, lnlReminderEmail, meetingEmail, dealSupportNudgeEmail, passExpiryEmail, waitlistConfirmEmail, retainerInterestEmail, countdownEmail, recommendEmail, launchEmail, foundingThanksEmail, firstName } from './_email.js';
import { recommendPlan, sendRecommendBatch, sendLaunchBatch, logEmails } from './waitlist.js';
import { foundingSeats } from './stripe.js';
import { insiderReminderEmail, generalFoundingEmail, generalHeadsUpEmail, generalSeatsTomorrowEmail, NEWSLETTER_ISSUES, newsletterEmail } from './_email.js';
import { referredRevenue, rungFor } from './referrals.js';

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
    // The 8 AM Eastern run (vercel.json, ?drip=1) sends only the launch emails, so
    // they land in the morning instead of at the 11 AM daily run.
    const dripOnly = req.query.drip === '1';
    const rows = dripOnly ? [] : await sql`
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
    const expiredBuilders = dripOnly ? [] : await sql`
      SELECT DISTINCT u.id, u.name, u.email FROM users u
      JOIN entitlements e ON e.user_id = u.id AND e.course_id = 'builder_year' AND e.source = 'lifetime' AND e.expires_at < NOW()
      WHERE u.tier = 'Builder' AND u.stripe_customer_id IS NULL AND COALESCE(u.role, 'member') = 'member'`;
    for (const b of expiredBuilders) {
      await sql`UPDATE users SET tier = 'Free' WHERE id = ${b.id}`;
      await sql`UPDATE entitlements SET source = 'lifetime_done' WHERE user_id = ${b.id} AND course_id = 'builder_year' AND source = 'lifetime'`;
      await sendEmail(b.email, 'Your Lifetime Pass — the year of Builder has wrapped',
        `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">Your courses are yours forever, ${firstName(b.name)}.</h2>
         <p style="color:#444444;font-size:14px;line-height:1.8;">The free year of Builder that came with your Lifetime Pass has ended. Nothing changes about the heart of it: <strong style="color:#161616;">every course and every Lunch & Learn stays yours in perpetuity</strong>, and office hours run through your first five years. Want the community back — posting, live Lunch & Learns, the recording library? Any membership picks it right back up.</p>
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
            const mail = countdownEmail(stage, launchText, list);
            const n = await sendBulk(entries, mail.subject, mail.html);
            drip[list + '_countdown_' + stage.replace(' ', '')] = n;
            await logEmails(sql, `countdown — ${stage}`, list, mail.subject, entries.map(r => ({ name: r.name, email: r.email, ok: true })));
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

    // Refund reserve sweep. The reserve fills from 20% of each sale (up to the
    // cap: $1,000 per ten paying members). On the 7th of each month — two days
    // after the monthly refund window closes on the 5th — it is swept down to the
    // $1,000 floor, oldest slices first, each released at its own payment's rate.
    let released = 0, releasedCents = 0;
    if (!dripOnly && process.env.STRIPE_SECRET_KEY && process.env.NREUV_CONNECT_ACCOUNT) {
      const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const etDay = Number(et.find(p => p.type === 'day').value);
      const monthKey = `pot_sweep_${et.find(p => p.type === 'year').value}-${et.find(p => p.type === 'month').value}`;
      const [sweptRow] = await sql`SELECT value FROM settings WHERE key = ${monthKey}`;
      if (etDay >= 7 && !sweptRow?.value) {
        const FLOOR = 100000;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const [tot] = await sql`SELECT COALESCE(SUM(held_cents), 0)::int AS total FROM held_transfers WHERE status = 'held'`;
        let total = tot?.total || 0;
        const held = await sql`SELECT id, charge_id, item, held_cents, rate_pct FROM held_transfers WHERE status = 'held' ORDER BY created_at ASC LIMIT 500`;
        for (const h of held) {
          if (total - h.held_cents < FLOOR) break;
          const amount = Math.floor(h.held_cents * (h.rate_pct / 100));
          try {
            if (amount > 0) await stripe.transfers.create({
              amount, currency: 'usd', destination: process.env.NREUV_CONNECT_ACCOUNT,
              source_transaction: h.charge_id,
              description: `NREUV ${h.rate_pct}% of reserve release — ${h.item || 'purchase'} (reserve ${h.held_cents}¢)`,
            });
            await sql`UPDATE held_transfers SET status = 'released', released_at = NOW() WHERE id = ${h.id}`;
            total -= h.held_cents; released++; releasedCents += amount;
          } catch (e) { console.error('reserve release failed', h.charge_id, e.message); break; }
        }
        await sql`INSERT INTO settings (key, value) VALUES (${monthKey}, ${`swept ${released} slices, ${releasedCents}¢ to NREUV, reserve now ${total}¢`}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
      }
    }
    // Founding email — fires itself the day the insider waitlist reaches 25
    // non-comped signups. Once only (founding_thanked stamps each recipient);
    // anyone who joins the list later gets it on the next daily run.
    let founding = null;
    try {
      // Two ways in, whichever lands first: the list reaching 25 non-comped
      // signups (the original trigger), or the insider launch coming within 7
      // days — founding is claimed by paying once that launch opens, so the
      // email is the heads-up that starts the race and must not be missed.
      const [c] = await sql`SELECT COUNT(*) FILTER (WHERE NOT COALESCE(comped, FALSE))::int AS paying
        FROM waitlist WHERE COALESCE(list, 'insider') = 'insider'`;
      const [insRow] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
      const msToLaunch = insRow?.value ? new Date(insRow.value).getTime() - Date.now() : Infinity;
      const launchClose = msToLaunch <= 7 * 86400000;
      if (c.paying >= 25 || launchClose) {
        await sql`ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS founding_thanked TIMESTAMPTZ`;
        const rows = await sql`SELECT id, name, email FROM waitlist WHERE COALESCE(list, 'insider') = 'insider' AND founding_thanked IS NULL`;
        let fsent = 0;
        for (const r of rows) {
          const mail = foundingThanksEmail(r.name);
          const ok = await sendEmail(r.email, mail.subject, mail.html, { marketing: true, light: true });
          if (ok) { await sql`UPDATE waitlist SET founding_thanked = NOW() WHERE id = ${r.id}`; fsent++; }
        }
        const why = c.paying >= 25
          ? `The insider waitlist reached ${c.paying} non-comped signups`
          : 'The insider launch is a week out';
        founding = { window_open: true, sent: fsent, paying: c.paying, reason: c.paying >= 25 ? 'count' : 'launch_close' };
        if (fsent) await sendEmail(process.env.ADMIN_EMAIL || 'djmj@nreuv.com', `Founding email went out to ${fsent} insider${fsent === 1 ? '' : 's'}`, `<p style="color:#444444;font-size:14px;line-height:1.8;">${why}, so the founding email sent itself to ${fsent} ${fsent === 1 ? 'person' : 'people'} who hadn't received it yet — the first 25 who pay from November 1 claim the seats.</p>`);
      } else founding = { window_open: false, paying: c.paying, needed: 25 - c.paying, days_to_launch: Math.ceil(msToLaunch / 86400000) };
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
        try { weekly.community = await sendCommunityWeekly(sql); } catch (e) { console.error('community weekly failed', e.message); }
        await sql`INSERT INTO settings (key, value) VALUES ('weekly_digest_sent', ${stamp}) ON CONFLICT (key) DO UPDATE SET value = ${stamp}`;
      }
    } catch (e) { console.error('weekly digest failed', e.message); }
    // Referral ladder — checked daily, because a rung is crossed when a referred
    // member passes the 60-day floor, not when anyone signs up or pays. The
    // reward is applied by hand in Admin → Users, so the alert is the trigger.
    let ladder = null;
    try {
      const rows = await referredRevenue(sql);
      const alerts = [];
      for (const r of rows) {
        const { earned } = rungFor(r.mrr_cents);
        const rung = earned ? [80000, 150000, 250000, 850000].indexOf(earned.at) + 1 : 0;
        const [pc] = await sql`SELECT * FROM partner_codes WHERE code = ${r.code}`;
        if (!pc) continue;
        if (rung > (pc.tier_alerted || 0)) {
          await sql`UPDATE partner_codes SET tier_alerted = ${rung} WHERE id = ${pc.id}`;
          const money = '$' + (r.mrr_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
          await sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
            `REFERRAL TIER REACHED: ${pc.owner_name} (${pc.code}) — ${earned.name}`,
            `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">${pc.owner_name} reached ${earned.name}</h2>
             <p style="color:#444444;font-size:14px;line-height:1.9;">Their code <strong style="color:#161616;">${pc.code}</strong> is now carrying <strong style="color:#161616;">${money}/mo</strong> in referred revenue at list price, across <strong style="color:#161616;">${r.paid_members}</strong> paid member${r.paid_members === 1 ? '' : 's'} past the 60-day mark.</p>
             <p style="color:#444444;font-size:14px;line-height:1.9;">They have earned: <strong style="color:#161616;">${earned.reward}</strong>. Apply it from Admin → Users${pc.owner_email ? ' (' + pc.owner_email + ')' : ''}.</p>`);
          alerts.push({ code: pc.code, tier: earned.name, mrr_cents: r.mrr_cents });
        }
      }
      if (alerts.length) ladder = alerts;
    } catch (e) { console.error('referral ladder check failed', e.message); }

    // Monthly report — the 1st of each month, once the insider launch has passed
    let monthly = null;
    try {
      const nowEt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const [ins] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
      const launched = ins?.value && new Date(ins.value).getTime() <= Date.now();
      const stamp = nowEt.toISOString().slice(0, 7);
      const [done] = await sql`SELECT value FROM settings WHERE key = 'monthly_report_sent'`;
      if (nowEt.getDate() === 1 && done?.value !== stamp) {
        // The GroundUp monthly waits for the insider launch; DakJen's own
        // monthly runs from November 1, 2026 regardless, so Dakotah sees
        // October's ledger before launch.
        monthly = launched ? await sendMonthlyReport(sql) : { skipped: 'before launch' };
        try { monthly.dakjen = await sendDakJenMonthly(sql); } catch (e) { console.error('dakjen monthly failed', e.message); }
        await sql`INSERT INTO settings (key, value) VALUES ('monthly_report_sent', ${stamp}) ON CONFLICT (key) DO UPDATE SET value = ${stamp}`;
      }
    } catch (e) { console.error('monthly report failed', e.message); }
    // Insider window (steps 5 and 6 of the sequence). The window runs
    // `insider_window_days` (default 5) from the insider launch. Midway, insiders
    // who have not joined get a seats-left reminder; when it closes, if founding
    // seats remain, the general list is told how many and may join early.
    try {
      const [ins] = await sql`SELECT value FROM settings WHERE key = 'launch_insider_at'`;
      const [wd] = await sql`SELECT value FROM settings WHERE key = 'insider_window_days'`;
      const days = Math.max(1, parseInt(wd?.value, 10) || 5);
      if (ins?.value && !isNaN(Date.parse(ins.value))) {
        const DAY = 86400000;
        const opened = new Date(ins.value).getTime();
        // The window closes at midnight Eastern on the day it ends. Adding whole days in
        // milliseconds drifts an hour when the clocks change (Nov 1), so snap back to midnight.
        let closesAt = opened + days * DAY;
        { const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(new Date(closesAt))) % 24; if (h === 23) closesAt += 3600000; else if (h === 1) closesAt -= 3600000; }
        const closesText = new Date(closesAt).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
        const now = Date.now();
        const joined = new Set((await sql`SELECT LOWER(email) AS email FROM users WHERE membership_status = 'active' AND tier IS DISTINCT FROM 'Free'`).map(r => r.email));
        // Launch day — the general list hears that insiders are in, and the fixed
        // date their turn at any remaining founding seats begins
        const H = 3600000;
        if (now >= opened + 8 * H && now < closesAt) {
          const [done] = await sql`SELECT value FROM settings WHERE key = 'drip_general_headsup'`;
          if (!done?.value) {
            const [pub] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
            const fmtDay = (t) => new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });
            const rows = (await sql`SELECT name, email FROM waitlist WHERE COALESCE(list, 'insider') = 'general' AND NOT COALESCE(comped, FALSE)`).filter(r => !joined.has(String(r.email).toLowerCase()));
            let n = 0;
            for (const r of rows) {
              const mail = generalHeadsUpEmail(r.name, { opensText: fmtDay(opened), seatsDate: fmtDay(closesAt), publicText: pub?.value ? fmtDay(pub.value) : 'December 1' });
              if (await sendEmail(r.email, mail.subject, mail.html, { marketing: true })) n++;
            }
            drip.general_headsup = n;
            await sql`INSERT INTO settings (key, value) VALUES ('drip_general_headsup', 'sent') ON CONFLICT (key) DO UPDATE SET value = 'sent'`;
          }
        }
        // Step 5 — midpoint of the window
        if (now >= opened + Math.floor(days / 2) * DAY && now < closesAt) {
          const [done] = await sql`SELECT value FROM settings WHERE key = 'drip_insider_reminder'`;
          if (!done?.value) {
            const seats = await foundingSeats(sql);
            const rows = (await sql`SELECT name, email FROM waitlist WHERE COALESCE(list, 'insider') = 'insider' AND NOT COALESCE(comped, FALSE)`).filter(r => !joined.has(String(r.email).toLowerCase()));
            let n = 0;
            for (const r of rows) {
              const mail = insiderReminderEmail(r.name, { seatsLeft: seats.remaining, closesText, closesShort: new Date(closesAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric' }), closesKey: new Date(closesAt - 1).toISOString().slice(0, 10), link: `${siteUrl()}/?join=1&email=${encodeURIComponent(r.email)}` });
              if (await sendEmail(r.email, mail.subject, mail.html, { marketing: true })) n++;
            }
            drip.insider_reminder = n;
            await sql`INSERT INTO settings (key, value) VALUES ('drip_insider_reminder', 'sent') ON CONFLICT (key) DO UPDATE SET value = 'sent'`;
          }
        }
        // 24 hours before the window closes, seats remain → tell the general list what's coming
        if (now >= closesAt - DAY + 8 * H && now < closesAt + 8 * H) {
          const [done] = await sql`SELECT value FROM settings WHERE key = 'drip_general_tomorrow'`;
          if (!done?.value) {
            const seats = await foundingSeats(sql);
            let n = 0;
            if (seats.remaining > 0) {
              const rows = (await sql`SELECT name, email FROM waitlist WHERE COALESCE(list, 'insider') = 'general' AND NOT COALESCE(comped, FALSE)`).filter(r => !joined.has(String(r.email).toLowerCase()));
              for (const r of rows) {
                const mail = generalSeatsTomorrowEmail(r.name, { seatsLeft: seats.remaining, opensText: new Date(closesAt + 8 * H).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) });
                if (await sendEmail(r.email, mail.subject, mail.html, { marketing: true })) n++;
              }
            }
            drip.general_tomorrow = n;
            await sql`INSERT INTO settings (key, value) VALUES ('drip_general_tomorrow', ${seats.remaining > 0 ? 'sent' : 'skipped-no-seats'}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
          }
        }
        // Step 6 — window closed, seats remain → the general list
        if (now >= closesAt + 8 * H) {
          const [done] = await sql`SELECT value FROM settings WHERE key = 'drip_general_founding'`;
          if (!done?.value) {
            const seats = await foundingSeats(sql);
            let n = 0;
            if (seats.remaining > 0) {
              const rows = (await sql`SELECT name, email FROM waitlist WHERE COALESCE(list, 'insider') = 'general' AND NOT COALESCE(comped, FALSE)`).filter(r => !joined.has(String(r.email).toLowerCase()));
              for (const r of rows) {
                const mail = generalFoundingEmail(r.name, { seatsLeft: seats.remaining, link: `${siteUrl()}/?join=1&email=${encodeURIComponent(r.email)}` });
                if (await sendEmail(r.email, mail.subject, mail.html, { marketing: true })) n++;
              }
            }
            drip.general_founding = n;
            await sql`INSERT INTO settings (key, value) VALUES ('drip_general_founding', ${seats.remaining > 0 ? 'sent' : 'skipped-no-seats'}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
          }
        }
      }
    } catch (e) { console.error('insider window drip failed', e.message); }
    // The pre-launch weekly: each issue goes once, on or after its Wednesday,
    // to the whole waitlist (both lists, comped and opted-out excluded), and
    // never more than six days late so a missed run cannot send a stale issue.
    try {
      const todayET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      for (const issue of NEWSLETTER_ISSUES) {
        if (todayET < issue.on) continue;
        if ((new Date(todayET) - new Date(issue.on)) / 86400000 > 6) continue;
        const [done] = await sql`SELECT value FROM settings WHERE key = ${'nl_sent_' + issue.key}`;
        if (done?.value) continue;
        const rows = await sql`SELECT name, email FROM waitlist WHERE NOT COALESCE(comped, FALSE)`;
        const mail = newsletterEmail(issue, '{{FIRSTNAME}}');
        const n = rows.length ? await sendBulk(rows, mail.subject, mail.html) : 0;
        await logEmails(sql, `weekly — ${issue.key}`, 'all', mail.subject, rows.map(r => ({ name: r.name, email: r.email, ok: true })));
        await sql`INSERT INTO settings (key, value) VALUES (${'nl_sent_' + issue.key}, ${`sent ${n} on ${todayET}`}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
        drip['weekly_' + issue.key] = n;
      }
    } catch (e) { console.error('weekly newsletter failed', e.message); }
    if (dripOnly) return res.json({ success: true, drip });
    return res.json({ success: true, expired: rows.length, sent, drip, pot_released: released, pot_released_cents: releasedCents, weekly, monthly, founding, ladder });
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

// ── Section 3 statement: gross receipts, refunds and chargebacks, Platform
// Revenue by category, the fee per category, the reserve held and released ─────
export async function revenueStatement(sql, start, end) {
  const CATS = [['course_membership', 'Course & Membership', 25], ['advisory', 'Advisory', 10], ['lunch_learn', 'Lunch & Learn', 0]];
  let rows = [];
  try {
    rows = await sql`SELECT category, COUNT(*)::int AS n, COALESCE(SUM(gross_cents),0)::int AS gross, COALESCE(SUM(fee_cents),0)::int AS fees,
        COALESCE(SUM(CASE WHEN status IN ('refunded','partially_refunded') THEN refunded_cents ELSE 0 END),0)::int AS refunds,
        COALESCE(SUM(CASE WHEN status = 'disputed_lost' THEN gross_cents ELSE 0 END),0)::int AS chargebacks,
        COALESCE(SUM(nreuv_cents),0)::int AS nreuv_paid
      FROM revenue_ledger WHERE created_at >= ${start.toISOString()} AND created_at < ${end.toISOString()} GROUP BY category`;
  } catch { rows = []; }
  const by = Object.fromEntries(rows.map(r => [r.category, r]));
  const cats = CATS.map(([key, label, fee]) => {
    const r = by[key] || { n: 0, gross: 0, fees: 0, refunds: 0, chargebacks: 0, nreuv_paid: 0 };
    const platform = Math.max(0, r.gross - r.refunds - r.chargebacks - r.fees);   // Platform Revenue per the agreement
    const notable = Math.round(platform * fee / 100);
    return { key, label, feePct: fee, count: r.n, gross: r.gross, refunds: r.refunds, chargebacks: r.chargebacks, fees: r.fees, platform, notable, nreuv: platform - notable, nreuvPaid: r.nreuv_paid };
  });
  let heldEnd = 0, releasedInMonth = 0, releasedNreuv = 0, cap = null;
  try { const [h] = await sql`SELECT COALESCE(SUM(held_cents),0)::int AS t FROM held_transfers WHERE status = 'held' AND created_at < ${end.toISOString()}`; heldEnd = h?.t || 0; } catch {}
  try { const [r] = await sql`SELECT COALESCE(SUM(held_cents),0)::int AS t, COALESCE(SUM(FLOOR(held_cents * rate_pct / 100.0)),0)::int AS n FROM held_transfers WHERE status = 'released' AND released_at >= ${start.toISOString()} AND released_at < ${end.toISOString()}`; releasedInMonth = r?.t || 0; releasedNreuv = r?.n || 0; } catch {}
  try { const key = `pot_cap_${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`; const [c] = await sql`SELECT value FROM settings WHERE key = ${key}`; cap = c?.value ? Number(c.value) : null; } catch {}
  const total = (k) => cats.reduce((a, c) => a + c[k], 0);
  return { cats, totals: { count: total('count'), gross: total('gross'), refunds: total('refunds'), chargebacks: total('chargebacks'), fees: total('fees'), platform: total('platform'), notable: total('notable'), nreuv: total('nreuv') }, reserve: { heldEnd, releasedInMonth, releasedNreuv, cap } };
}

export function statementHtml(st, monthName, S = "'DM Sans',Arial,Helvetica,sans-serif") {
  const m = (c) => '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const th = (t, right) => `<th align="${right ? 'right' : 'left'}" style="font-family:${S};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a8a8a;padding:6px 8px;border-bottom:1px solid #e5dccf;">${t}</th>`;
  const td = (t, right, strong) => `<td align="${right ? 'right' : 'left'}" style="font-family:${S};font-size:13px;color:${strong ? '#161616' : '#444444'};font-weight:${strong ? 'bold' : 'normal'};padding:7px 8px;border-bottom:1px solid #f0ece4;white-space:nowrap;">${t}</td>`;
  const row = (c, strong) => `<tr>${td(c.label, false, strong)}${td(m(c.gross), true)}${td(c.refunds || c.chargebacks ? '(' + m(c.refunds + c.chargebacks) + ')' : '—', true)}${td('(' + m(c.fees) + ')', true)}${td(m(c.platform), true, true)}${td(c.feePct === undefined ? m(c.notable) : `${m(c.notable)} <span style="color:#8a8a8a;font-weight:normal;">(${c.feePct}%)</span>`, true)}${td(m(c.nreuv), true, true)}</tr>`;
  return `
    <div style="font-family:${S};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#b80101;font-weight:bold;margin:26px 0 8px;">Revenue statement — ${monthName}</div>
    <p style="font-family:${S};color:#8a8a8a;font-size:12px;margin:0 0 10px;line-height:1.6;">Per Section 3 of the services agreement. Platform Revenue is gross receipts less refunds, chargebacks and processing fees; the fee is calculated on Platform Revenue in each category. A record of the split, not a bill.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>${th('Category')}${th('Gross', 1)}${th('Refunds / CB', 1)}${th('Stripe fees', 1)}${th('Platform revenue', 1)}${th('Notable fee', 1)}${th('NREUV share', 1)}</tr>
      ${st.cats.map(c => row(c)).join('')}
      ${row({ ...st.totals, label: 'Total' }, true)}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;">
      <tr>${td('Payments counted', false)}${td(String(st.totals.count), true, true)}</tr>
      <tr>${td('Actually transferred to NREUV this month (immediate splits + reserve releases)', false)}${td(m(st.cats.reduce((a, c) => a + c.nreuvPaid, 0) + st.reserve.releasedNreuv), true, true)}</tr>
      <tr>${td('Held in the refund reserve at month end', false)}${td(m(st.reserve.heldEnd), true, true)}</tr>
      <tr>${td('Released from the reserve during the month', false)}${td(st.reserve.releasedInMonth ? `${m(st.reserve.releasedInMonth)} <span style="color:#8a8a8a;font-weight:normal;">(${m(st.reserve.releasedNreuv)} to NREUV)</span>` : '—', true, true)}</tr>
      ${st.reserve.cap ? `<tr>${td('Reserve maximum for the month', false)}${td(m(st.reserve.cap), true, true)}</tr>` : ''}
    </table>`;
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
    ${statementHtml(await revenueStatement(sql, start, end), monthName, S)}
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

    ${head('New clients above Premium', '#7d6d6d')}
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
    ${statementHtml(await revenueStatement(sql, start, end), monthName, F)}
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
  // Eligible for founding pricing, which is not the same as being a founding
  // member — that is earned by paying. Both are reported, separately.
  const foundingEligible = entries.filter(e => e.founding_lnl).length;
  let foundingPaid = 0;
  try {
    const [row] = await sql`SELECT COUNT(*)::int AS n FROM users
      WHERE badges @> '["founding25"]'::jsonb AND membership_status = 'active'
        AND COALESCE(role, 'member') = 'member' AND NOT COALESCE(comped, FALSE)
        AND tier IS DISTINCT FROM 'Free'`;
    foundingPaid = row?.n || 0;
  } catch { /* badge column older than the query */ }
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
      ${stat('Founding seats claimed', foundingPaid, `${foundingEligible} eligible, none claimed until they pay`)}
    </tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;"><tr>
      ${stat('Anticipated MRR', money(mrr), 'if everyone joins their recommended plan', '#b80101')}
      ${stat('Anticipated ARR', money(mrr * 12), 'MRR × 12', '#b80101')}
      ${stat('Retainer leads', retainerLeads, 'Senior Advisor track', retainerLeads ? '#7d6d6d' : '#161616')}
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


// ── The Friday community digest: every channel's week, for the team ─────────
// Replaces the email-per-post. Each team member's own mutes are respected.
export async function sendCommunityWeekly(sql, opts = {}) {
  const S = "'DM Sans',Arial,Helvetica,sans-serif", SERIF = "'Cormorant Garamond',Georgia,serif";
  const since = new Date(Date.now() - 7 * 86400000);
  const rows = await sql`
    SELECT m.id, m.channel_id, m.body, m.created_at, m.parent_id, c.name AS channel, u.name AS author, u.tier
    FROM messages m JOIN channels c ON c.id = m.channel_id LEFT JOIN users u ON u.id = m.user_id
    WHERE m.deleted = FALSE AND m.created_at >= ${since.toISOString()} AND NOT c.team_only
    ORDER BY c.position, c.id, m.created_at ASC`;
  const dms = await sql`SELECT COUNT(*)::int AS n FROM dms WHERE from_admin = FALSE AND created_at >= ${since.toISOString()}`;
  const team = opts.to ? opts.to.map(e => ({ email: e, id: null })) : await sql`SELECT id, email FROM users WHERE role = 'admin' AND email IS NOT NULL AND COALESCE(notify_mode, 'all') <> 'mentions'`;
  const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let sent = 0;
  for (const t of team) {
    const muted = t.id ? new Set((await sql`SELECT channel_id FROM channel_mutes WHERE user_id = ${t.id}`).map(r => r.channel_id)) : new Set();
    const mine = rows.filter(r => !muted.has(r.channel_id));
    const byChan = {};
    for (const r of mine) (byChan[r.channel] ||= []).push(r);
    const chans = Object.entries(byChan);
    const body = chans.length === 0
      ? `<p style="font-family:${S};color:#444444;font-size:14px;line-height:1.8;">A quiet week — nothing new in the channels you follow.</p>`
      : chans.map(([name, ms]) => `
        <div style="margin:0 0 22px;">
          <div style="font-family:${S};font-size:11px;color:#b80101;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 8px;">#${esc(name)} · ${ms.length} post${ms.length === 1 ? '' : 's'}</div>
          ${ms.slice(0, 8).map(m => `<div style="border-left:3px solid #e5dccf;padding:6px 0 6px 12px;margin:0 0 8px;">
            <div style="font-family:${S};font-size:12px;color:#8a8a8a;">${esc(m.author || 'Member')}${m.tier ? ' · ' + esc(m.tier === 'Elite' ? 'Owner' : m.tier === 'Basic' ? 'Member' : m.tier) : ''} · ${new Date(m.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${m.parent_id ? ' · reply' : ''}</div>
            <div style="font-family:${S};font-size:14px;color:#333333;line-height:1.7;">${esc(String(m.body).slice(0, 240))}${m.body.length > 240 ? '…' : ''}</div>
          </div>`).join('')}
          ${ms.length > 8 ? `<div style="font-family:${S};font-size:12px;color:#8a8a8a;">and ${ms.length - 8} more</div>` : ''}
        </div>`).join('');
  const html = `
      <div style="font-family:${S};font-size:11px;color:#b80101;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 12px;">This week in the community</div>
      <h1 style="font-family:${SERIF};color:#161616;font-size:30px;line-height:1.15;font-weight:700;margin:0 0 10px;">${mine.length} post${mine.length === 1 ? '' : 's'} across ${chans.length} channel${chans.length === 1 ? '' : 's'}</h1>
      <p style="font-family:${S};color:#8a8a8a;font-size:13px;margin:0 0 22px;">${dms[0].n} member DM${dms[0].n === 1 ? '' : 's'} this week · channels you have muted are left out.</p>
      ${body}
      <p style="margin:18px 0 0;"><a href="${siteUrl()}/community" style="display:inline-block;background:#b80101;color:#ffffff;border-radius:10px;padding:12px 24px;font-weight:bold;font-size:13px;text-decoration:none;font-family:${S};">Open the community</a></p>`;
    if (await sendEmail(t.email, (opts.preview ? '[PREVIEW] ' : '') + `Community this week — ${mine.length} post${mine.length === 1 ? '' : 's'}`, html)) sent++;
  }
  return { sent, posts: rows.length };
}
