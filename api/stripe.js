import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { getSession } from './_utils.js';
import { sendEmail, siteUrl } from './_email.js';

export const config = { api: { bodyParser: false } };

// Everything purchasable, priced in one place (cents)
const CATALOG = {
  sub_Basic:   { mode: 'subscription', name: 'GroundUp Member',            amount: 5999,  tier: 'Basic' },
  sub_Premium: { mode: 'subscription', name: 'GroundUp Premium',           amount: 16599, tier: 'Premium' },
  sub_Elite:   { mode: 'subscription', name: 'GroundUp Elite',             amount: 59999, tier: 'Elite' },
  pass_single: { mode: 'payment',      name: 'Single Course Pass (30 days)', amount: 10000 },
  pass_all:    { mode: 'payment',      name: 'All-Access Pass (30 days)',  amount: 25000 },
  lnl:         { mode: 'payment',      name: 'Lunch & Learn — 6 months',   amount: 3999 },
  session_deal:      { mode: 'payment', name: '1:1 Deal Review (45 min)',        amount: 50000 },
  session_strategy:  { mode: 'payment', name: '1:1 Strategy Session (45 min)',   amount: 42500 },
  session_capital:   { mode: 'payment', name: '1:1 Capital Stack Review (45 min)', amount: 55000 },
  session_community: { mode: 'payment', name: '1:1 Community Development (45 min)', amount: 37500 },
  session_bipoc:     { mode: 'payment', name: '1:1 BIPOC Developer Session (45 min)', amount: 27500 },
};

// NREUV's share of net revenue, per product. Everything not listed uses DEFAULT.
// 1.00 = NREUV keeps all of it; 0.75 = NREUV 75% / platform 25%.
const SPLIT = {
  DEFAULT: 0.75,   // NREUV 75% / platform 25% — everything on the site
  retainer: 0.90,  // Senior Advisor retainer: Dr. Merritt's own hours, 90/10
};
const splitRate = (item) => (item && SPLIT[item] !== undefined ? SPLIT[item] : SPLIT.DEFAULT);

async function readRawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function ensureLnlCoupon(stripe) {
  try { return (await stripe.coupons.retrieve('LNL25')).id; }
  catch {
    const c = await stripe.coupons.create({ id: 'LNL25', percent_off: 25, duration: 'once', name: 'Lunch & Learn — 25% off first month' });
    return c.id;
  }
}

// Revenue split: 75% of net (after Stripe fees) transfers to NREUV's connected account
async function splitCharge(stripe, chargeId, item) {
  const dest = process.env.NREUV_CONNECT_ACCOUNT;
  if (!dest || !chargeId) return;
  const rate = splitRate(item);
  try {
    const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
    const bt = charge.balance_transaction;
    if (!bt || charge.currency !== 'usd') return;
    const net = bt.net; // cents, after Stripe fees
    const share = Math.floor(net * rate);
    if (share > 0) {
      await stripe.transfers.create({
        amount: share, currency: 'usd', destination: dest,
        source_transaction: chargeId,
        description: `NREUV ${Math.round(rate * 100)}% split — ${item || 'purchase'} (net ${net}¢)`,
      });
    }
  } catch (e) { console.error('split failed', chargeId, e.message); }
}

async function fulfill(sql, session) {
  const md = session.metadata || {};
  const userId = Number(md.user_id);
  const item = md.item;
  if (!userId || !item) return;

  if (item.startsWith('sub_')) {
    const tier = CATALOG[item]?.tier;
    if (tier) {
      await sql`UPDATE users SET tier = ${tier}, membership_status = 'active', stripe_customer_id = ${session.customer || null} WHERE id = ${userId}`;
    }
  } else if (item === 'pass_single') {
    const courseId = /^mc\d+$/.test(md.course_id || '') ? md.course_id : 'all';
    await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at) VALUES (${userId}, ${courseId}, 'stripe_onetime', NOW() + interval '30 days', NOW())`;
  } else if (item === 'pass_all') {
    await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at) VALUES (${userId}, 'all', 'stripe_onetime', NOW() + interval '30 days', NOW())`;
  } else if (item === 'lnl') {
    await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at) VALUES (${userId}, 'lunchlearn', 'stripe_onetime', NOW() + interval '6 months', NOW())`;
    await sql`UPDATE users SET lnl_discount_until = NOW() + interval '2 months' WHERE id = ${userId} AND (lnl_discount_until IS NULL OR lnl_discount_until < NOW() + interval '2 months')`;
  } else if (item.startsWith('session_')) {
    const [u] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
    await sendEmail(
      process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
      `PAID: ${CATALOG[item]?.name || item} — ${u?.name || 'member'}`,
      `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">New paid session</h2>
       <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${u?.name}</strong> (${u?.email}) paid for <strong style="color:#f0d8d8;">${CATALOG[item]?.name}</strong>. Reach out to schedule, then send the meeting email from the back office.</p>`
    );
  }

  // Receipt-ish confirmation to the member
  const [u] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
  if (u) {
    await sendEmail(u.email, 'GroundUp — payment received',
      `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">You're all set, ${u.name.split(' ')[0]}.</h2>
       <p style="color:#a89080;font-size:14px;line-height:1.8;">Your payment for <strong style="color:#f0d8d8;">${CATALOG[item]?.name || 'your purchase'}</strong> went through. ${item.startsWith('session_') ? "Dr. Merritt's team will reach out to schedule." : 'Your access is live — sign in and dive in.'}</p>
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
          await splitCharge(stripe, pi.latest_charge, cs.metadata?.item);
        }
      } else if (event.type === 'invoice.payment_succeeded') {
        // First subscription invoice AND every monthly renewal: split + keep tier active
        const inv = event.data.object;
        const invItem = inv.subscription_details?.metadata?.item || inv.lines?.data?.[0]?.metadata?.item;
        if (inv.charge) await splitCharge(stripe, inv.charge, invItem);
        const item = invItem;
        const uid = Number(inv.subscription_details?.metadata?.user_id || inv.lines?.data?.[0]?.metadata?.user_id);
        if (uid && item && CATALOG[item]?.tier) {
          await sql`UPDATE users SET tier = ${CATALOG[item].tier}, membership_status = 'active', stripe_customer_id = ${inv.customer} WHERE id = ${uid}`;
        }
      } else if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        await sql`UPDATE users SET tier = 'Free' WHERE stripe_customer_id = ${sub.customer}`;
      }
      return res.json({ received: true });
    }

    // ── Create a Checkout Session ──
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString() || '{}');
    const session = getSession(req);
    if (!session?.uid) return res.status(401).json({ error: 'Sign in to purchase' });
    const [user] = await sql`SELECT id, name, email, tier, lnl_discount_until FROM users WHERE id = ${session.uid}`;
    if (!user) return res.status(401).json({ error: 'Account not found' });

    const item = body.item;
    const product = CATALOG[item];
    if (!product) return res.status(400).json({ error: 'Unknown item' });

    const base = siteUrl();
    const params = {
      mode: product.mode,
      customer_email: user.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: product.amount,
          product_data: { name: product.name },
          ...(product.mode === 'subscription' ? { recurring: { interval: 'month' } } : {}),
        },
      }],
      metadata: { user_id: String(user.id), item, course_id: body.course_id || '' },
      ...(product.mode === 'subscription' ? { subscription_data: { metadata: { user_id: String(user.id), item } } } : {}),
      success_url: `${base}/?checkout=success&item=${encodeURIComponent(item)}`,
      cancel_url: `${base}/?checkout=cancelled`,
    };

    // Lunch & Learn perk: 25% off the first month of any membership, automatically
    if (product.mode === 'subscription' && user.lnl_discount_until && new Date(user.lnl_discount_until) > new Date()) {
      params.discounts = [{ coupon: await ensureLnlCoupon(stripe) }];
    }

    const checkout = await stripe.checkout.sessions.create(params);
    return res.json({ url: checkout.url });
  } catch (err) {
    console.error('stripe error', err);
    return res.status(500).json({ error: err.message || 'Payment error' });
  }
}
