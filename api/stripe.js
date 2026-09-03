import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { getSession } from './_utils.js';
import { sendEmail, siteUrl, addLnlContact, dealSupportBlock } from './_email.js';

export const config = { api: { bodyParser: false } };

// Everything purchasable, priced in one place (cents)
const CATALOG = {
  sub_Basic:   { mode: 'subscription', name: 'GroundUp Member',            amount: 4999,  tier: 'Basic' },
  sub_Builder: { mode: 'subscription', name: 'GroundUp Builder',           amount: 9999,  tier: 'Builder' },
  sub_Premium: { mode: 'subscription', name: 'GroundUp Premium',          amount: 14999, tier: 'Premium' },
  sub_Elite:   { mode: 'subscription', name: 'GroundUp Elite',             amount: 49999, tier: 'Elite' },
  // Annual billing — one payment for the year at roughly 10% off the monthly rate
  sub_Basic_annual:   { mode: 'subscription', name: 'GroundUp Member — Annual',  amount: 59988,  tier: 'Basic',   annual: true },
  sub_Builder_annual: { mode: 'subscription', name: 'GroundUp Builder — Annual', amount: 119988, tier: 'Builder', annual: true },
  sub_Premium_annual: { mode: 'subscription', name: 'GroundUp Premium — Annual', amount: 179988, tier: 'Premium', annual: true },
  sub_Elite_annual:   { mode: 'subscription', name: 'GroundUp Elite — Annual',   amount: 599988, tier: 'Elite',   annual: true },
  pass_single: { mode: 'payment',      name: 'Single Course Pass (60 days)', amount: 10000 },
  pass_all:    { mode: 'payment',      name: 'All-Access Pass (30 days)',  amount: 25000 },
  lnl:         { mode: 'payment',      name: 'Lunch & Learn — 6 months',   amount: 3999 },
  session_deal:      { mode: 'payment', name: '1:1 Deal Review (45 min)',        amount: 50000 },
  session_strategy:  { mode: 'payment', name: '1:1 Strategy Session (45 min)',   amount: 42500 },
  session_capital:   { mode: 'payment', name: '1:1 Capital Stack Review (45 min)', amount: 55000 },
  session_community: { mode: 'payment', name: '1:1 Community Development (45 min)', amount: 37500 },
  session_bipoc:     { mode: 'payment', name: '1:1 BIPOC Developer Session (45 min)', amount: 27500 },
  retainer_onboarding: { mode: 'payment', name: 'Full Project Intake with Dr. Merritt', amount: 150000 },
  retainer_5:  { mode: 'subscription', name: 'Senior Advisor Retainer — 5 hrs/month',  amount: 302500, retainerHours: 5 },
  retainer_10: { mode: 'subscription', name: 'Senior Advisor Retainer — 10 hrs/month', amount: 550000, retainerHours: 10 },
  retainer_15: { mode: 'subscription', name: 'Senior Advisor Retainer — 15 hrs/month', amount: 770000, retainerHours: 15 },
};

// NREUV's share of net revenue, per product. Everything not listed uses DEFAULT.
// 1.00 = NREUV keeps all of it; 0.75 = NREUV 75% / platform 25%.
const SPLIT = {
  DEFAULT: 0.75,  // NREUV 75% / platform 25% — memberships and course passes
  lnl: 1.00,      // Lunch & Learn: 100% to NREUV, platform takes no cut
  // Dr. Merritt's own hours — 90/10
  session_deal: 0.90, session_strategy: 0.90, session_capital: 0.90,
  session_community: 0.90, session_bipoc: 0.90,
  retainer_onboarding: 0.90, retainer_5: 0.90, retainer_10: 0.90, retainer_15: 0.90,
};
const splitRate = (item) => (item && SPLIT[item] !== undefined ? SPLIT[item] : SPLIT.DEFAULT);

// Member perk: paid tiers get a standing discount on 1:1 sessions with Dr. Merritt.
// Priced off the sticker price and applied server-side — the client never sends an amount.
const SESSION_DISCOUNT = { Premium: 0.10, Elite: 0.30 };
export const sessionDiscountRate = (tier) => SESSION_DISCOUNT[tier] || 0;

// What a member actually pays for a session, in cents.
// The BIPOC Developer Session is already priced as an access offering — the
// member tier discount does not stack on top of it.
const NO_MEMBER_DISCOUNT = new Set(['session_bipoc']);

export function memberPrice(item, tier) {
  const spec = CATALOG[item];
  if (!spec) return null;
  if (!item.startsWith('session_') || NO_MEMBER_DISCOUNT.has(item)) return spec.amount;
  const rate = sessionDiscountRate(tier);
  if (!rate) return spec.amount;
  // Round DOWN to the nearest $5 — keeps prices clean ($380, not $382.50) and
  // any rounding always lands in the member's favor.
  return Math.floor((spec.amount * (1 - rate)) / 500) * 500;
}

// Elite is sold as a limited cohort. The cap is stored in `settings` so the team
// can change it without a deploy; ELITE_CAP_DEFAULT is the fallback.
const ELITE_CAP_DEFAULT = 20;

export async function eliteSeats(sql) {
  let cap = ELITE_CAP_DEFAULT;
  try {
    const [row] = await sql`SELECT value FROM settings WHERE key = 'elite_cap'`;
    const parsed = parseInt(row?.value, 10);
    if (Number.isFinite(parsed) && parsed > 0) cap = parsed;
  } catch { /* settings table missing — fall back to the default */ }
  // Comped accounts (team comps, VIPs) don't occupy paid seats
  const [row] = await sql`
    SELECT COUNT(*)::int AS n FROM users
    WHERE tier = 'Elite' AND membership_status = 'active'
      AND COALESCE(role, 'member') = 'member' AND NOT COALESCE(comped, FALSE)`;
  const taken = row?.n || 0;
  const remaining = Math.max(0, cap - taken);
  return { cap, taken, remaining, full: remaining === 0 };
}

// The 15-day promise, honored: identity and community data are erased, but the
// user row survives anonymized — deleting it would cascade into bookings and
// destroy financial records we must keep for tax purposes.
async function purgeCancelled(sql) {
  try {
    const stale = await sql`
      SELECT id FROM users
      WHERE cancelled_at IS NOT NULL AND cancelled_at < NOW() - interval '15 days'
        AND COALESCE(role, 'member') = 'member'`;
    for (const { id } of stale) {
      await sql`DELETE FROM dms WHERE user_id = ${id}`;
      await sql`DELETE FROM messages WHERE user_id = ${id}`;
      await sql`DELETE FROM entitlements WHERE user_id = ${id}`;
      await sql`DELETE FROM lnl_rsvps WHERE user_id = ${id}`;
      await sql`DELETE FROM session_requests WHERE user_id = ${id}`;
      await sql`UPDATE users SET
        name = 'Former Member', email = ${'deleted-' + id + '@removed.groundup'},
        password_hash = NULL, badge = NULL, free_lesson_key = NULL,
        cancelled_at = NULL, membership_status = 'purged'
        WHERE id = ${id}`;
    }
    return stale.length;
  } catch (e) { console.error('purge failed', e.message); return 0; }
}

async function readRawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

// Stretch offer: 10% off for the first 12 months, granted by the waitlist
// recommendation engine to people whose needs outgrow their stated budget
async function ensureStretchCoupon(stripe, pct) {
  const id = `STRETCH${pct}`;
  try { return (await stripe.coupons.retrieve(id)).id; }
  catch {
    const c = await stripe.coupons.create({ id, percent_off: pct, duration: 'repeating', duration_in_months: 12, name: `Waitlist stretch offer — ${pct}% off first year` });
    return c.id;
  }
}

async function ensureLnlCoupon(stripe) {
  try { return (await stripe.coupons.retrieve('LNL25')).id; }
  catch {
    const c = await stripe.coupons.create({ id: 'LNL25', percent_off: 25, duration: 'once', name: 'Lunch & Learn — 25% off first month' });
    return c.id;
  }
}

// Revenue split — NREUV's share is a % of GROSS (the sticker price). The platform
// absorbs Stripe's processing fee out of its own share.
//
// THE REFUND POT: 20% of every payment stays in the Stripe platform balance
// until its refund window closes; only the remaining 80% is split immediately.
// The daily cron releases each pot slice once the window passes (45 days for
// monthly/one-time, 193 days — 6 months + the 10-day grace — for annual),
// splitting it at the same rate. A refund-eligible cancellation consumes the
// slice instead, so the pot funds the refund and NREUV keeps what was sent.
const POT_PCT = 0.20;
const POT_CAP_CENTS = 100000; // the pot never holds more than $1,000 in total
function potWindowDays(item) { return String(item || '').endsWith('_annual') ? 193 : 45; }

async function splitCharge(stripe, chargeId, item, sql) {
  const dest = process.env.NREUV_CONNECT_ACCOUNT;
  if (!dest || !chargeId) return;
  const rate = splitRate(item);
  try {
    const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
    const bt = charge.balance_transaction;
    if (!bt || charge.currency !== 'usd') return;
    const gross = charge.amount;      // what the customer paid
    const net = bt.net;               // what actually landed after Stripe's fee
    // Hold 20% — but never past the $1,000 pot cap. When the pot is full, new
    // payments split 100% immediately; releases/consumptions free up room again.
    let held = Math.floor(gross * POT_PCT);
    if (sql && held > 0) {
      try {
        const [pot] = await sql`SELECT COALESCE(SUM(held_cents), 0)::int AS total FROM held_transfers WHERE status = 'held'`;
        held = Math.max(0, Math.min(held, POT_CAP_CENTS - (pot?.total || 0)));
      } catch { held = 0; }
    } else if (!sql) held = 0;
    // Split only the non-pot 80% now; never transfer more than settled
    const share = Math.min(Math.floor((gross - held) * rate), net);
    if (share > 0) {
      await stripe.transfers.create({
        amount: share, currency: 'usd', destination: dest,
        source_transaction: chargeId,
        description: `NREUV ${Math.round(rate * 100)}% of gross less 20% refund pot — ${item || 'purchase'} (gross ${gross}¢, pot ${held}¢, fee ${gross - net}¢)`,
      });
    }
    if (sql && held > 0) {
      const days = potWindowDays(item);
      await sql`INSERT INTO held_transfers (charge_id, customer_id, item, gross_cents, held_cents, rate_pct, release_after, status, created_at)
        VALUES (${chargeId}, ${charge.customer || null}, ${item || null}, ${gross}, ${held}, ${Math.round(rate * 100)}, NOW() + (${days} || ' days')::interval, 'held', NOW())
        ON CONFLICT (charge_id) DO NOTHING`;
    }
  } catch (e) { console.error('split failed', chargeId, e.message); }
}

async function fulfill(sql, session) {
  const md = session.metadata || {};
  const userId = Number(md.user_id);
  const item = md.item;
  if (!userId || !item) return;

  if (item === 'retainer_onboarding') {
    // The intake stands alone: she takes the WHOLE deal in, finds the thing they
    // missed, and the $1,500 credits against the first retainer month if they continue.
    await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at)
      VALUES (${userId}, 'intake', 'intake_paid', NULL, NOW())`;
    try {
      const [u] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
      if (u) {
        await sendEmail(u.email, 'Your Full Project Intake is booked in',
          `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">Send it all, ${u.name.split(' ')[0]}.</h2>
           <p style="color:#a89080;font-size:14px;line-height:1.8;">Your Full Project Intake with Dr. Merritt is paid. Next step: book your intake call on her calendar (link below), and come ready to share the whole deal — pro forma, capital stack, site, timeline. This is the session where the thing you missed gets found.</p>
           <p style="color:#a89080;font-size:14px;line-height:1.8;">And if you continue into the Senior Advisor retainer, <strong style="color:#f0d8d8;">your \$1,500 is credited against your first month</strong> — the intake is never wasted money.</p>
           <a href="${siteUrl()}/advisory" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Book your intake call</a>`);
        await sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
          `INTAKE PAID: ${u.name} — \$1,500 Full Project Intake`,
          `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">New project intake</h2>
           <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${u.name}</strong> (${u.email}) paid for the Full Project Intake. When they book, ask for the full deal package up front. If they continue to a retainer, their first month checkout auto-credits the \$1,500.</p>`);
      }
    } catch (e) { console.error('intake email failed', e.message); }
  } else if (item.startsWith('retainer_')) {
    const spec = CATALOG[item];
    const [offered] = await sql`SELECT id FROM retainers WHERE user_id = ${userId} AND status = 'offered' ORDER BY created_at DESC LIMIT 1`;
    if (offered) {
      await sql`UPDATE retainers SET hours_per_month = ${spec.retainerHours}, monthly_amount = ${spec.amount / 100}, status = 'active', started_at = NOW() WHERE id = ${offered.id}`;
    } else {
      await sql`INSERT INTO retainers (user_id, hours_per_month, monthly_amount, status, started_at, created_at)
        VALUES (${userId}, ${spec.retainerHours}, ${spec.amount / 100}, 'active', NOW(), NOW())`;
    }
    if (md.intake_credit === '1') {
      await sql`UPDATE entitlements SET source = 'intake_credited' WHERE user_id = ${userId} AND course_id = 'intake' AND source = 'intake_paid'`;
    }
    await sql`UPDATE users SET stripe_customer_id = ${session.customer || null} WHERE id = ${userId}`;
    const [c] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
    await sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
      `NEW RETAINER CLIENT: ${c?.name} — ${spec.retainerHours} hrs/mo`,
      `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">New Senior Advisor retainer</h2>
       <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${c?.name}</strong> (${c?.email}) started a <strong style="color:#f0d8d8;">${spec.retainerHours} hours/month</strong> retainer at $${(spec.amount / 100).toLocaleString()}/mo. They're on the Retainer Clients roster now.</p>`);
  } else if (item.startsWith('sub_')) {
    const tier = CATALOG[item]?.tier;
    if (tier) {
      // cancelled_at = NULL stops the 15-day deletion clock for members who rejoin
      await sql`UPDATE users SET tier_since = CASE WHEN tier IS DISTINCT FROM ${tier} THEN NOW() ELSE tier_since END, tier = ${tier}, membership_status = 'active', cancelled_at = NULL, stripe_customer_id = ${session.customer || null} WHERE id = ${userId}`;
    }
    if (md.gift) {
      await sql`UPDATE referrals SET used = TRUE, used_at = NOW(), status = 'used' WHERE code = ${md.gift} AND kind = 'month_free'`;
    }
    // The cap is checked before checkout, but two people can clear that check at
    // the same time. They've paid, so honor the seat — and tell the team it happened.
    if (item === 'sub_Elite' || item === 'sub_Elite_annual') {
      const seats = await eliteSeats(sql);
      if (seats.taken > seats.cap) {
        const [u] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
        await sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
          `ELITE OVER CAP: ${seats.taken} of ${seats.cap} seats`,
          `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">Elite went over cap</h2>
           <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${u?.name}</strong> (${u?.email}) completed Elite checkout at the same moment as someone else, putting Elite at <strong style="color:#f0d8d8;">${seats.taken} of ${seats.cap}</strong>. Their payment went through and their access is live. Either raise the cap in Admin, or reach out to arrange a refund.</p>`);
      }
    }
  } else if (item === 'product') {
    const pid = Number(md.product_id);
    if (pid) {
      // Ownership lives in entitlements ('prod:<id>', never expires) — the shop
      // and their account page both read it to show the download
      await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at)
        VALUES (${userId}, ${'prod:' + pid}, 'stripe_product', NULL, NOW())`;
      try {
        const [u] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
        const [p] = await sql`SELECT title FROM products WHERE id = ${pid}`;
        if (u) await sendEmail(u.email, `Your download is ready: ${p?.title || 'your purchase'}`,
          `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">It's yours, ${u.name.split(' ')[0]}.</h2>
           <p style="color:#a89080;font-size:14px;line-height:1.8;">Your purchase of <strong style="color:#f0d8d8;">${p?.title || 'your document'}</strong> is complete. It now lives in your account permanently — download it any time from the shop or your member page.</p>
           <p style="color:#a89080;font-size:13px;line-height:1.7;">Reminder: this document is for your personal use — reselling or replicating it isn't permitted.</p>
           <a href="${siteUrl()}/shop" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Open Your Downloads</a>${dealSupportBlock()}`);
      } catch (e) { console.error('product email failed', e.message); }
    }
  } else if (item === 'pass_single') {
    const courseId = /^mc\d+$/.test(md.course_id || '') ? md.course_id : 'all';
    await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at) VALUES (${userId}, ${courseId}, 'stripe_onetime', NOW() + interval '60 days', NOW())`;
  } else if (item === 'pass_all') {
    await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at) VALUES (${userId}, 'all', 'stripe_onetime', NOW() + interval '30 days', NOW())`;
  } else if (item === 'lnl') {
    await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at) VALUES (${userId}, 'lunchlearn', 'stripe_onetime', NOW() + interval '6 months', NOW())`;
    await sql`UPDATE users SET lnl_discount_until = NOW() + interval '2 months' WHERE id = ${userId} AND (lnl_discount_until IS NULL OR lnl_discount_until < NOW() + interval '2 months')`;
    // Buyers join the L&L email list just like code redeemers
    try {
      const [u] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
      if (u) await addLnlContact(u.email, u.name);
    } catch (e) { console.error('lnl contact failed', e.message); }
  } else if (item.startsWith('session_')) {
    const spec = CATALOG[item];
    // Record what they actually paid — member session discounts mean this is
    // often below the sticker price in CATALOG.
    const paid = (session.amount_total ?? spec?.amount ?? 0) / 100;
    await sql`INSERT INTO bookings (user_id, item, label, amount, status, charge_id, created_at)
      VALUES (${userId}, ${item}, ${spec?.name || item}, ${paid}, 'awaiting_booking', ${session.payment_intent || null}, NOW())`;
    const [u] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
    await sendEmail(
      process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
      `PAID: ${CATALOG[item]?.name || item} — ${u?.name || 'member'}`,
      `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">New paid session</h2>
       <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${u?.name}</strong> (${u?.email}) paid for <strong style="color:#f0d8d8;">${CATALOG[item]?.name}</strong>. Reach out to schedule, then send the meeting email from the back office.</p>`
    );
  }

  // Receipt-ish confirmation to the member
  const [linkRow] = await sql`SELECT value FROM settings WHERE key = 'advisor_call_link'`;
  const bookingLink = linkRow?.value || '';
  const [u] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
  if (u) {
    await sendEmail(u.email, 'GroundUp — payment received',
      `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">You're all set, ${u.name.split(' ')[0]}.</h2>
       <p style="color:#a89080;font-size:14px;line-height:1.8;">Your payment for <strong style="color:#f0d8d8;">${CATALOG[item]?.name || 'your purchase'}</strong> went through. ${item.startsWith('session_') ? "<strong style=\"color:#f0d8d8;\">One more step — pick your time on Dr. Merritt's calendar.</strong>" : 'Your access is live — sign in and dive in.'}</p>
       ${item.startsWith('session_') && bookingLink ? `<a href="${bookingLink}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin:6px 0 14px;">Book Your Time →</a>` : ''}
       <a href="${siteUrl()}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Open GroundUp</a>`);
  }
}

export default async function handler(req, res) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ error: 'Payments are not configured yet' });
  const stripe = new Stripe(key);
  const sql = neon(process.env.DATABASE_URL);

  try {
    // ── Webhook (raw body + signature) ──
    if (req.query.webhook === '1') {
      const raw = await readRawBody(req);
      let event;
      try {
        event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        return res.status(400).json({ error: `Webhook signature verification failed` });
      }
      if (event.type === 'checkout.session.completed') {
        const cs = event.data.object;
        await fulfill(sql, cs);
        if (cs.mode === 'payment' && cs.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(cs.payment_intent);
          await splitCharge(stripe, pi.latest_charge, cs.metadata?.item, sql);
        }
      } else if (event.type === 'invoice.payment_succeeded') {
        // First subscription invoice AND every monthly renewal: split + keep tier active
        const inv = event.data.object;
        const invItem = inv.subscription_details?.metadata?.item || inv.lines?.data?.[0]?.metadata?.item;
        if (inv.charge) await splitCharge(stripe, inv.charge, invItem, sql);
        const item = invItem;
        const uid = Number(inv.subscription_details?.metadata?.user_id || inv.lines?.data?.[0]?.metadata?.user_id);
        if (uid && item && CATALOG[item]?.tier) {
          await sql`UPDATE users SET tier = ${CATALOG[item].tier}, membership_status = 'active', stripe_customer_id = ${inv.customer} WHERE id = ${uid}`;
        }
        if (uid && item && item.startsWith('retainer_')) {
          await sql`UPDATE retainers SET status = 'active' WHERE user_id = ${uid} AND status = 'paused'`;
        }
      } else if (event.type === 'invoice.payment_failed') {
        // Payment failed: suspend access immediately and tell everyone
        const inv = event.data.object;
        const uid = Number(inv.subscription_details?.metadata?.user_id || inv.lines?.data?.[0]?.metadata?.user_id);
        const failItem = inv.subscription_details?.metadata?.item || inv.lines?.data?.[0]?.metadata?.item || '';
        if (uid) {
          if (failItem.startsWith('retainer_')) {
            await sql`UPDATE retainers SET status = 'paused' WHERE user_id = ${uid} AND status = 'active'`;
          } else {
            await sql`UPDATE users SET membership_status = 'past_due' WHERE id = ${uid}`;
          }
          const [u] = await sql`SELECT name, email FROM users WHERE id = ${uid}`;
          if (u) {
            await sendEmail(u.email, 'Action needed — your GroundUp payment didn\u2019t go through',
              `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">We couldn\u2019t process your payment</h2>
               <p style="color:#a89080;font-size:14px;line-height:1.8;">Hi ${u.name.split(' ')[0]} — your card was declined, so your access is paused until it's sorted. Update your card and everything comes right back on.</p>
               <a href="${siteUrl()}/membership" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Fix My Payment</a>`);
            await sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
              `PAYMENT FAILED: ${u.name}`,
              `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">Payment failed</h2>
               <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${u.name}</strong> (${u.email}) — ${failItem || 'subscription'} declined. Access suspended automatically.</p>`);
          }
        }
      } else if (event.type === 'charge.refunded') {
        const ch = event.data.object;
        const [b] = await sql`
          UPDATE bookings SET status = 'refunded'
          WHERE charge_id = ${ch.payment_intent} AND status != 'refunded' RETURNING *`;
        if (b) {
          const [u] = await sql`SELECT name, email FROM users WHERE id = ${b.user_id}`;
          await sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
            `REFUNDED — remove calendar booking for ${u?.name || 'client'}`,
            `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">Payment refunded — cancel their slot</h2>
             <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${u?.name}</strong> (${u?.email}) was refunded for <strong style="color:#f0d8d8;">${b.label}</strong>. If they already booked on the calendar, remove that appointment.</p>`);
        }
      } else if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        // Refund rules — alert-driven (the NREUV split transfer must be reversed
        // alongside any refund, so the team processes these by hand):
        //   Monthly: cancel before the 5th of the month → that month refunded.
        //   Annual:  cancel within the first 6 months — plus a 10-day grace
        //            period into the second half — and 6 months (half the annual
        //            payment) is refunded; after that, the refund is forfeited.
        const isAnnual = (sub.items?.data?.[0]?.price?.recurring?.interval || sub.plan?.interval) === 'year';
        const daysIn = sub.start_date ? (Date.now() / 1000 - sub.start_date) / 86400 : 9999;
        const monthsIn = daysIn / 30.44;
        // 6 months ≈ 183 days, plus the 10-day grace period into the second half
        const refundEligible = isAnnual ? daysIn <= 193 : new Date().getDate() < 5;
        if (refundEligible) {
          try {
            const [ru] = await sql`SELECT name, email, tier FROM users WHERE stripe_customer_id = ${sub.customer}`;
            // Find the payment being refunded and its pot slice, then do the math
            // for the team: refund amount, what the pot covers, what to reverse.
            let money = '';
            try {
              const inv = sub.latest_invoice ? await stripe.invoices.retrieve(sub.latest_invoice) : null;
              const paid = inv?.amount_paid || 0;
              const chargeId = inv?.charge || null;
              const refund = isAnnual ? Math.round(paid / 2) : paid;
              let held = 0, rate = 75;
              if (chargeId) {
                const [row] = await sql`UPDATE held_transfers SET status = 'consumed', released_at = NOW()
                  WHERE charge_id = ${chargeId} AND status = 'held' RETURNING held_cents, rate_pct`;
                if (row) { held = row.held_cents; rate = row.rate_pct; }
              }
              const reverse = Math.max(0, Math.round((refund - held) * (rate / 100)));
              const d = (c) => '$' + (c / 100).toFixed(2);
              money = `<p style="color:#a89080;font-size:14px;line-height:1.8;">The math, done for you:</p>
               <ul style="color:#a89080;font-size:14px;line-height:1.9;">
                 <li>They paid <strong style="color:#f0d8d8;">${d(paid)}</strong> — refund them <strong style="color:#f0d8d8;">${d(refund)}</strong>${isAnnual ? ' (half the annual payment)' : ''}.</li>
                 <li>${held > 0 ? `The refund pot was still holding <strong style="color:#f0d8d8;">${d(held)}</strong> of this payment — it has been kept automatically (it will never transfer to NREUV) and funds that much of the refund.` : 'The pot slice for this payment had already been released, so the pot covers none of it.'}</li>
                 <li>Reverse <strong style="color:#f0d8d8;">${d(reverse)}</strong> of the NREUV transfer on this payment (their ${rate}% share of the refund beyond what the pot covers).</li>
               </ul>`;
            } catch (e) { console.error('refund math failed', e.message); }
            if (ru) await sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
              isAnnual ? `REFUND DUE: ${ru.name} cancelled an annual plan inside 6 months` : `REFUND DUE: ${ru.name} cancelled before the 5th`,
              `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">Refund to process</h2>
               <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${ru.name}</strong> (${ru.email}, ${ru.tier}) ${isAnnual ? `cancelled an ANNUAL membership about ${monthsIn.toFixed(1)} months in — inside the 6-month window (10-day grace included), so HALF the annual payment (6 months) is refundable per the Terms.` : 'cancelled before the 5th of the month, so this month\'s payment is refundable per the Terms.'} In Stripe: process the ${isAnnual ? 'partial (50%) refund on their annual invoice payment' : 'refund on their latest subscription invoice payment'} AND <strong style="color:#f0d8d8;">reverse the stated share of the NREUV transfer</strong> so the split doesn't come out of the platform's pocket.</p>${money}`);
          } catch (e) { console.error('refund alert failed', e.message); }
        }
        // Stamp when the membership ended — the 15-day data-retention clock runs from here
        await sql`UPDATE users SET tier = 'Free', cancelled_at = NOW() WHERE stripe_customer_id = ${sub.customer}`;
        await sql`UPDATE retainers SET status = 'ended' WHERE user_id IN (SELECT id FROM users WHERE stripe_customer_id = ${sub.customer}) AND status IN ('active','paused')`;
        const [u] = await sql`SELECT name, email FROM users WHERE stripe_customer_id = ${sub.customer}`;
        if (u) {
          const refundNote = isAnnual
            ? (refundEligible ? ' Because you cancelled within the first six months of your annual plan (the 10-day grace period included), 6 months — half your annual payment — will be refunded to your card.' : ' Annual plans cancelled more than 10 days into their second half aren\'t refunded, so your access continues through the end of the year you paid for.')
            : (refundEligible ? ' Because you cancelled before the 5th, this month\'s payment will be refunded to your card.' : ' Cancellations on or after the 5th aren\'t refunded for the current month, so your access continues through the period you paid for.');
          await sendEmail(u.email, 'Your GroundUp membership is cancelled',
            `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">You're all set, ${u.name.split(' ')[0]}.</h2>
             <p style="color:#a89080;font-size:14px;line-height:1.8;">Your membership is cancelled and you won't be charged again.${refundNote} <strong style="color:#f0d8d8;">Your account data — community posts, messages, and progress — will be permanently removed after 15 days.</strong> Rejoin before then and everything picks up right where you left it.</p>
             <a href="${siteUrl()}/pricing" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Rejoin GroundUp</a>`);
        }
      }
      // No cron needed — Stripe events arrive steadily, so the retention
      // sweep rides along with every webhook delivery.
      await purgeCancelled(sql);
      return res.json({ received: true });
    }

    // ── Live pricing: Elite seats remaining + this member's session rate ──
    // Public so the pricing page can show scarcity to signed-out visitors.
    if (req.method === 'GET') {
      const seats = await eliteSeats(sql);
      const session = getSession(req);
      let tier = 'Free';
      if (session?.uid) {
        const [u] = await sql`SELECT tier FROM users WHERE id = ${session.uid} AND membership_status = 'active'`;
        if (u?.tier) tier = u.tier;
      }
      const rate = sessionDiscountRate(tier);
      const sessions = {};
      for (const k of Object.keys(CATALOG)) {
        if (!k.startsWith('session_')) continue;
        sessions[k] = { list: CATALOG[k].amount, price: memberPrice(k, tier) };
      }
      return res.json({ elite: seats, tier, session_discount: rate, sessions });
    }

    // ── Create a Checkout Session ──
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString() || '{}');
    const session = getSession(req);
    if (!session?.uid) return res.status(401).json({ error: 'Sign in to purchase' });
    const [user] = await sql`SELECT id, name, email, tier, lnl_discount_until FROM users WHERE id = ${session.uid}`;
    if (!user) return res.status(401).json({ error: 'Account not found' });

    // ── Self-service billing portal: manage payment method or cancel ──
    // Cancelling must be as easy as joining — one click, no emailing the team.
    if (body.action === 'portal') {
      if (!user.stripe_customer_id) return res.status(400).json({ error: 'No billing on file for this account' });
      const portal = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${siteUrl()}/member`,
      });
      return res.json({ url: portal.url });
    }

    // ── Digital product purchase (priced from the DB, never the client) ──
    if (body.item === 'product') {
      if (!body.agreed_ip) return res.status(400).json({ error: 'Please agree to the content use terms first' });
      const [p] = await sql`SELECT id, title, price_cents FROM products WHERE id = ${Number(body.product_id)} AND active`;
      if (!p) return res.status(404).json({ error: 'Product not found' });
      const [already] = await sql`SELECT id FROM entitlements WHERE user_id = ${user.id} AND course_id = ${'prod:' + p.id} LIMIT 1`;
      if (already) return res.status(409).json({ error: 'You already own this — it\'s in your account' });
      const checkout = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: user.email,
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: p.price_cents, product_data: { name: p.title } } }],
        metadata: { user_id: String(user.id), item: 'product', product_id: String(p.id) },
        success_url: `${siteUrl()}/shop?purchased=1`,
        cancel_url: `${siteUrl()}/shop`,
      });
      return res.json({ url: checkout.url });
    }

    const item = body.item;
    const product = CATALOG[item];
    if (!product) return res.status(400).json({ error: 'Unknown item' });

    // Elite is capped. Check before taking money — an over-cap buyer would otherwise
    // pay $499.99 for a seat we've publicly said doesn't exist.
    if ((item === 'sub_Elite' || item === 'sub_Elite_annual') && user.tier !== 'Elite') {
      const seats = await eliteSeats(sql);
      if (seats.full) {
        return res.status(409).json({
          error: 'Elite is full',
          elite_full: true,
          message: `All ${seats.cap} Elite seats are taken. Join the waitlist and you'll be first to know when one opens.`,
        });
      }
    }

    // Member discount on 1:1 sessions — computed here from the signed-in user's tier.
    // Label off the actual price delta, so an item excluded from the discount
    // (see NO_MEMBER_DISCOUNT) is never labeled as discounted.
    const unitAmount = memberPrice(item, user.tier);
    const saved = product.amount - unitAmount;
    const productName = saved > 0
      ? `${product.name} — ${user.tier} member rate (${Math.round((saved / product.amount) * 100)}% off)`
      : product.name;

    const base = siteUrl();
    const params = {
      mode: product.mode,
      customer_email: user.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: { name: productName },
          ...(product.mode === 'subscription' ? { recurring: { interval: product.annual ? 'year' : 'month' } } : {}),
        },
      }],
      metadata: { user_id: String(user.id), item, course_id: body.course_id || '' },
      ...(product.mode === 'subscription' ? { subscription_data: { metadata: { user_id: String(user.id), item } } } : {}),
      success_url: `${base}/?checkout=success&item=${encodeURIComponent(item)}`,
      cancel_url: `${base}/?checkout=cancelled`,
    };

    // Month-free gift link: locked to the recipient's email, single use — a
    // forwarded link applies to nobody else. Wins over every other discount.
    let discounted = false;
    if (body.gift && product.mode === 'subscription') {
      const [gift] = await sql`SELECT id FROM referrals WHERE code = ${String(body.gift).trim().toUpperCase()}
        AND kind = 'month_free' AND used = FALSE AND expires_at > NOW() AND email = ${user.email}`;
      if (gift) {
        let coupon;
        try { coupon = (await stripe.coupons.retrieve('MONTHFREE')).id; }
        catch { coupon = (await stripe.coupons.create({ id: 'MONTHFREE', percent_off: 100, duration: 'once', name: 'Gift — first month free' })).id; }
        params.discounts = [{ coupon }];
        params.metadata.gift = String(body.gift).trim().toUpperCase();
        discounted = true;
      }
    }
    // Paid intake credits against the first retainer month — automatically
    if (!discounted && item.startsWith('retainer_') && product.mode === 'subscription') {
      const [intake] = await sql`SELECT id FROM entitlements WHERE user_id = ${user.id} AND course_id = 'intake' AND source = 'intake_paid' LIMIT 1`;
      if (intake) {
        let coupon;
        try { coupon = (await stripe.coupons.retrieve('INTAKE1500')).id; }
        catch { coupon = (await stripe.coupons.create({ id: 'INTAKE1500', amount_off: 150000, currency: 'usd', duration: 'once', name: 'Full Project Intake — credited to first month' })).id; }
        params.discounts = [{ coupon }];
        params.metadata.intake_credit = '1';
        discounted = true;
      }
    }
    // Stretch offer: 10% off first year — only if the recommendation engine
    // actually granted it to this email for this exact tier (URL params alone
    // can't unlock it). Takes precedence over the one-month L&L perk.
    if (!discounted && String(body.promo || '').startsWith('stretch') && product.mode === 'subscription' && product.tier) {
      const [wl] = await sql`SELECT stretch_offer FROM waitlist WHERE email = ${user.email}`;
      const [offerTier, offerPct] = String(wl?.stretch_offer || '').split('|');
      const pct = [10, 15].includes(Number(offerPct)) ? Number(offerPct) : null;
      if (offerTier === product.tier && pct) {
        params.discounts = [{ coupon: await ensureStretchCoupon(stripe, pct) }];
        discounted = true;
      }
    }
    // Pass-alum perk: a course pass that ended within the last 7 days earns 15%
    // off when they commit to a full year of membership — applied automatically.
    if (!discounted && product.mode === 'subscription' && product.tier && product.annual) {
      const [pass] = await sql`SELECT id FROM entitlements WHERE user_id = ${user.id}
        AND source IN ('stripe_onetime', 'stripe_onetime_nudged') AND course_id != 'lunchlearn'
        AND expires_at IS NOT NULL AND expires_at < NOW() AND expires_at > NOW() - interval '7 days' LIMIT 1`;
      if (pass) {
        let coupon;
        try { coupon = (await stripe.coupons.retrieve('PASSJOIN15')).id; }
        catch { coupon = (await stripe.coupons.create({ id: 'PASSJOIN15', percent_off: 15, duration: 'once', name: 'Course pass alum — 15% off your first year' })).id; }
        params.discounts = [{ coupon }];
        discounted = true;
      }
    }
    // Annual billing: 10% off, shown as a visible discount on the checkout page.
    // The pass-alum 15% (above) supersedes it — they never stack.
    if (!discounted && product.mode === 'subscription' && product.annual) {
      let coupon;
      try { coupon = (await stripe.coupons.retrieve('ANNUAL10')).id; }
      catch { coupon = (await stripe.coupons.create({ id: 'ANNUAL10', percent_off: 10, duration: 'forever', name: 'Annual billing — 10% off' })).id; }
      params.discounts = [{ coupon }];
      discounted = true;
    }
    // Lunch & Learn perk: 25% off the first month of any membership, automatically
    if (!discounted && product.mode === 'subscription' && user.lnl_discount_until && new Date(user.lnl_discount_until) > new Date()) {
      params.discounts = [{ coupon: await ensureLnlCoupon(stripe) }];
    }

    const checkout = await stripe.checkout.sessions.create(params);
    return res.json({ url: checkout.url });
  } catch (err) {
    console.error('stripe error', err);
    return res.status(500).json({ error: err.message || 'Payment error' });
  }
}
