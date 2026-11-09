import { neon } from '@neondatabase/serverless';
import { requireAdmin } from './_utils.js';
import { revenueStatement } from './broadcast.js';


export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      const [userStats] = await sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE tier = 'Free') as free_count,
          COUNT(*) FILTER (WHERE tier = 'Basic') as basic_count,
          COUNT(*) FILTER (WHERE tier = 'Builder') as builder_count,
          COUNT(*) FILTER (WHERE tier = 'Premium') as premium_count,
          COUNT(*) FILTER (WHERE tier = 'Elite') as elite_count,
          COUNT(*) FILTER (WHERE COALESCE(comped, FALSE)) as comped_count,
          -- MRR counts only paying members: not comped, not team accounts
          ROUND(
            COUNT(*) FILTER (WHERE tier = 'Basic' AND NOT COALESCE(comped, FALSE) AND COALESCE(role,'member') = 'member') * 49.99 +
            COUNT(*) FILTER (WHERE tier = 'Builder' AND NOT COALESCE(comped, FALSE) AND COALESCE(role,'member') = 'member') * 149.99 +
            COUNT(*) FILTER (WHERE tier = 'Premium' AND NOT COALESCE(comped, FALSE) AND COALESCE(role,'member') = 'member') * 249.99 +
            COUNT(*) FILTER (WHERE tier = 'Elite' AND NOT COALESCE(comped, FALSE) AND COALESCE(role,'member') = 'member') * 499.99,
            2
          ) as mrr
        FROM users
      `;

      // Retainer / thought-partnership clients bill monthly too — their real
      // monthly_amount joins the MRR alongside membership subscriptions.
      const [retainerStats] = await sql`
        SELECT COUNT(*)::int AS active_count, COALESCE(SUM(monthly_amount), 0)::numeric AS retainer_mrr
        FROM retainers WHERE status = 'active'
      `;

      const signupsByMonth = await sql`
        SELECT 
          TO_CHAR(created_at, 'Mon') as month,
          EXTRACT(YEAR FROM created_at) as year,
          EXTRACT(MONTH FROM created_at) as month_num,
          COUNT(*) as count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY month, year, month_num
        ORDER BY year, month_num
      `;

      const [referralStats] = await sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE used = true) as used_count
        FROM referrals
      `;

      // Actual money, per the services agreement: this month and last month from the
      // revenue ledger, and where the refund reserve stands right now.
      let statement = null, reserve = null;
      try {
        const now = new Date();
        const thisStart = new Date(now.getFullYear(), now.getMonth(), 1), nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        statement = { current: await revenueStatement(sql, thisStart, nextStart), previous: await revenueStatement(sql, lastStart, thisStart) };
        const [h] = await sql`SELECT COALESCE(SUM(held_cents),0)::int AS t, COUNT(*)::int AS n FROM held_transfers WHERE status = 'held'`;
        // Payments held whole under the current rule, apart from the 20% reserve slices
        // left by the launch-week payments that the old code split at purchase.
        const [parts] = await sql`SELECT
            COALESCE(SUM(h.held_cents) FILTER (WHERE COALESCE(l.nreuv_cents, 0) = 0), 0)::int AS whole_cents,
            COUNT(*) FILTER (WHERE COALESCE(l.nreuv_cents, 0) = 0)::int AS whole_n,
            COALESCE(SUM(h.held_cents) FILTER (WHERE COALESCE(l.nreuv_cents, 0) > 0), 0)::int AS slice_cents,
            COUNT(*) FILTER (WHERE COALESCE(l.nreuv_cents, 0) > 0)::int AS slice_n
          FROM held_transfers h LEFT JOIN revenue_ledger l ON l.charge_id = h.charge_id WHERE h.status = 'held'`;
        // The actual Stripe balance, so the two can be compared on the page.
        let stripeBalance = null;
        if (process.env.STRIPE_SECRET_KEY) {
          try {
            const { default: Stripe } = await import('stripe');
            const bal = await new Stripe(process.env.STRIPE_SECRET_KEY).balance.retrieve();
            const sum = (arr) => (arr || []).filter(x => x.currency === 'usd').reduce((a, x) => a + x.amount, 0);
            stripeBalance = { available_cents: sum(bal.available), pending_cents: sum(bal.pending) };
          } catch (e) { console.error('stripe balance', e.message); }
        }
        const [floorRow] = await sql`SELECT value FROM settings WHERE key = 'reserve_floor_cents'`;
        const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
        const y = et.find(p => p.type === 'year').value, m = et.find(p => p.type === 'month').value, d = Number(et.find(p => p.type === 'day').value);
        const [capRow] = await sql`SELECT value FROM settings WHERE key = ${`pot_cap_${y}-${m}`}`;
        const [sweep] = await sql`SELECT value FROM settings WHERE key = ${`pot_sweep_${y}-${m}`}`;
        const [paying] = await sql`SELECT COUNT(*)::int AS n FROM users WHERE membership_status = 'active' AND tier IN ('Basic','Builder','Premium','Elite') AND COALESCE(comped, FALSE) = FALSE AND COALESCE(role,'member') = 'member'`;
        const nextSweep = d < 6 ? new Date(Number(y), Number(m) - 1, 6) : new Date(Number(y), Number(m), 6);
        const fixedFloor = Number.isFinite(parseInt(floorRow?.value, 10)) ? parseInt(floorRow.value, 10) : null;
        const cap = capRow?.value ? Number(capRow.value) : (fixedFloor ?? 100000 * Math.max(1, Math.ceil((paying?.n || 0) / 10)));
        reserve = { held_cents: h?.t || 0, slices: h?.n || 0,
          whole_cents: parts?.whole_cents || 0, whole_n: parts?.whole_n || 0, slice_cents: parts?.slice_cents || 0, slice_n: parts?.slice_n || 0,
          cap_cents: cap, floor_cents: cap, floor_fixed: fixedFloor != null, paying: paying?.n || 0,
          stripe: stripeBalance, swept_this_month: sweep?.value || null, next_sweep: nextSweep.toISOString() };
      } catch (e) { console.error('revenue actuals failed', e.message); }
      return res.json({ userStats, retainerStats, signupsByMonth, referralStats, statement, reserve });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
}
