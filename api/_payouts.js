// Payouts on the 15th and the 30th (Dakotah, Nov 22, 2026).
//
// Every payment is held in GroundUp's Stripe balance until its 5-day refund
// window has closed. On the 15th and on the 30th (the last day in February),
// every payment that is 5 or more days old and not yet paid out goes out,
// oldest first, as long as what stays behind is at or above the reserve:
//   · the 15th keeps $1,000 in Stripe (settings.payout_keep_15_cents)
//   · the 30th keeps $500 (settings.payout_keep_30_cents)
// Early-month renewals refill the reserve to $1,000; everything over that goes
// out on the 15th, and on the 30th everything over $500 goes out.
//
// Of each payment, NREUV's share (its rate × the payment net of Stripe's fee:
// 75% memberships and courses, 90% sessions and retainers, 100% Lunch & Learn)
// is transferred to NREUV's Stripe account, and DakJen's share goes to the bank
// as one payout the same day.
//
// A refund or a lost chargeback on a payment that was already paid out comes off
// the next payout, each side giving back its own share. Anything the payout is
// too small to cover carries to the one after.
//
// Every run is a row in `payouts` (and each payment it paid points at it), for
// the team portal's Payouts page. Requires Stripe payouts set to MANUAL.

const FIRST_PAYDAY = '2026-11-30'; // the rule starts here; nothing earlier is caught up

let ready = false;
export async function ensurePayoutTables(sql) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS payouts (
    id SERIAL PRIMARY KEY,
    payday DATE UNIQUE NOT NULL,
    kept_cents INTEGER NOT NULL,
    payments INTEGER NOT NULL DEFAULT 0,
    nreuv_cents INTEGER NOT NULL DEFAULT 0,
    dakjen_cents INTEGER NOT NULL DEFAULT 0,
    refund_nreuv_cents INTEGER NOT NULL DEFAULT 0,
    refund_dakjen_cents INTEGER NOT NULL DEFAULT 0,
    reserve_after_cents INTEGER,
    stripe_payout_id TEXT,
    status TEXT NOT NULL DEFAULT 'done',
    note TEXT,
    lines JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`ALTER TABLE held_transfers ADD COLUMN IF NOT EXISTS refund_settled_cents INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE held_transfers ADD COLUMN IF NOT EXISTS payout_id INTEGER`;
  await sql`ALTER TABLE held_transfers ADD COLUMN IF NOT EXISTS nreuv_paid_cents INTEGER`;
  await sql`ALTER TABLE held_transfers ADD COLUMN IF NOT EXISTS dakjen_paid_cents INTEGER`;
  ready = true;
}

async function setting(sql, key, fallback) {
  try { const [r] = await sql`SELECT value FROM settings WHERE key = ${key}`; const v = parseInt(r?.value, 10); if (Number.isFinite(v) && v >= 0) return v; } catch {}
  return fallback;
}

function etParts(now) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return { y: Number(p.find(x => x.type === 'year').value), m: Number(p.find(x => x.type === 'month').value), d: Number(p.find(x => x.type === 'day').value) };
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// The payday that is due today in Eastern time (or was due earlier this month
// and has not run yet), or null.
export function paydayDue(now = new Date()) {
  const { y, m, d } = etParts(now);
  const late = Math.min(30, new Date(Date.UTC(y, m, 0)).getUTCDate());
  const day = d >= late ? late : d >= 15 ? 15 : null;
  return day ? { date: iso(y, m, day), kind: day === 15 ? 15 : 30 } : null;
}

// The next paydays from today, for the Payouts page.
export function nextPaydays(now = new Date(), n = 4) {
  let { y, m, d } = etParts(now);
  const out = [];
  while (out.length < n) {
    const late = Math.min(30, new Date(Date.UTC(y, m, 0)).getUTCDate());
    for (const day of [15, late]) if (day >= d && out.length < n) out.push({ date: iso(y, m, day), kind: day === 15 ? 15 : 30 });
    m++; if (m > 12) { m = 1; y++; } d = 1;
  }
  return out;
}

export async function payoutKeeps(sql) {
  return { k15: await setting(sql, 'payout_keep_15_cents', 100000), k30: await setting(sql, 'payout_keep_30_cents', 50000) };
}

export async function runPayout(sql, stripe, { now = new Date(), alert = async () => {} } = {}) {
  const pd = paydayDue(now);
  if (!pd || pd.date < FIRST_PAYDAY) return { skipped: 'not a payday' };
  await ensurePayoutTables(sql);
  const { k15, k30 } = await payoutKeeps(sql);
  const keep = pd.kind === 15 ? k15 : k30;
  // Claim the payday first, so two runs can never both pay.
  const [claim] = await sql`INSERT INTO payouts (payday, kept_cents, status) VALUES (${pd.date}, ${keep}, 'running') ON CONFLICT (payday) DO NOTHING RETURNING id`;
  if (!claim) return { skipped: 'already ran' };
  const payoutId = claim.id;

  let manual = null;
  try { const acct = await stripe.accounts.retrieve(); manual = acct.settings?.payouts?.schedule?.interval === 'manual'; } catch {}

  // 1. Refunds on payments still held: only what is left of the payment gets split.
  const heldRefunds = await sql`SELECT h.id, h.held_cents, h.refund_settled_cents, l.refunded_cents
    FROM held_transfers h JOIN revenue_ledger l ON l.charge_id = h.charge_id
    WHERE h.status = 'held' AND COALESCE(l.refunded_cents, 0) > h.refund_settled_cents
      AND COALESCE(l.nreuv_cents, 0) = 0`; // launch-week payments split at purchase are handled by hand (alert)
  for (const r of heldRefunds) {
    const left = Math.max(0, r.held_cents - (r.refunded_cents - r.refund_settled_cents));
    await sql`UPDATE held_transfers SET held_cents = ${left}, refund_settled_cents = ${r.refunded_cents}, status = ${left === 0 ? 'refunded' : 'held'} WHERE id = ${r.id}`;
  }

  // 2. Refunds and lost chargebacks on payments already paid out: each side
  //    gives back its own share, off this payout (plus anything carried over).
  let owedN = 0, owedD = 0; const notes = [];
  try { const c = JSON.parse((await sql`SELECT value FROM settings WHERE key = 'payout_carry'`)[0]?.value || '{}'); owedN += c.n || 0; owedD += c.d || 0; } catch {}
  const paidRefunds = await sql`SELECT h.id, h.item, h.rate_pct, h.gross_cents, h.refund_settled_cents, l.refunded_cents, l.status
    FROM held_transfers h JOIN revenue_ledger l ON l.charge_id = h.charge_id
    WHERE h.status = 'released' AND COALESCE(l.nreuv_cents, 0) = 0 AND (COALESCE(l.refunded_cents, 0) > h.refund_settled_cents
      OR (l.status = 'disputed_lost' AND h.refund_settled_cents < h.gross_cents))`;
  for (const r of paidRefunds) {
    const target = r.status === 'disputed_lost' ? r.gross_cents : r.refunded_cents;
    const back = Math.max(0, target - r.refund_settled_cents);
    const n = Math.floor(back * r.rate_pct / 100), d = back - n;
    owedN += n; owedD += d;
    await sql`UPDATE held_transfers SET refund_settled_cents = ${target} WHERE id = ${r.id}`;
    notes.push(`${r.status === 'disputed_lost' ? 'Chargeback' : 'Refund'} on ${r.item || 'a payment'} already paid out: $${(back / 100).toFixed(2)} back (NREUV $${(n / 100).toFixed(2)}, DakJen $${(d / 100).toFixed(2)})`);
  }

  // 3. The balance as GroundUp's records see it: everything still held, less
  //    what refunds of paid-out payments have already taken from it.
  const [tot] = await sql`SELECT COALESCE(SUM(held_cents), 0)::int AS total FROM held_transfers WHERE status = 'held'`;
  let balance = (tot?.total || 0) - owedN - owedD;
  const cutoff = new Date(now.getTime() - 5 * 86400000).toISOString();
  const due = await sql`SELECT h.id, h.charge_id, h.item, h.held_cents, h.rate_pct
    FROM held_transfers h LEFT JOIN revenue_ledger l ON l.charge_id = h.charge_id
    WHERE h.status = 'held' AND h.created_at <= ${cutoff} AND h.held_cents > 0
      AND COALESCE(l.status, 'paid') NOT IN ('disputed', 'disputed_lost')
    ORDER BY h.created_at ASC LIMIT 1000`;

  let sentN = 0, shareDTotal = 0, tookN = 0, count = 0; const lines = [];
  for (const h of due) {
    if (balance - h.held_cents < keep) continue; // would dip into the reserve; a smaller one may still fit
    const shareN = Math.floor(h.held_cents * (h.rate_pct / 100));
    const shareD = h.held_cents - shareN;
    const takeN = Math.min(owedN, shareN);
    const sendN = shareN - takeN;
    try {
      if (sendN > 0) await stripe.transfers.create({
        amount: sendN, currency: 'usd', destination: process.env.NREUV_CONNECT_ACCOUNT,
        source_transaction: h.charge_id,
        description: `NREUV ${h.rate_pct}% — GroundUp payout ${pd.date} — ${h.item || 'purchase'}${takeN ? ` (less ${(takeN / 100).toFixed(2)} refunded)` : ''}`,
      });
    } catch (e) { await alert('payout transfer ' + h.charge_id, e); notes.push(`Stopped early: the NREUV transfer for ${h.item || 'a payment'} failed (${e.message}).`); break; }
    owedN -= takeN; tookN += takeN;
    await sql`UPDATE held_transfers SET status = 'released', released_at = NOW(), payout_id = ${payoutId}, nreuv_paid_cents = ${sendN}, dakjen_paid_cents = ${shareD} WHERE id = ${h.id}`;
    balance -= h.held_cents - takeN; count++; sentN += sendN; shareDTotal += shareD;
    lines.push(`${h.item || 'purchase'}: net $${(h.held_cents / 100).toFixed(2)} → NREUV $${(sendN / 100).toFixed(2)}${takeN ? ` (after $${(takeN / 100).toFixed(2)} refunded)` : ''}, DakJen $${(shareD / 100).toFixed(2)}`);
  }
  // DakJen's own refund share comes off DakJen's payout and stays in the balance
  const takeD = Math.min(owedD, shareDTotal); owedD -= takeD;
  const sendD = shareDTotal - takeD;
  balance += takeD;
  await sql`INSERT INTO settings (key, value) VALUES ('payout_carry', ${JSON.stringify({ n: owedN, d: owedD })}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  if (owedN || owedD) notes.push(`Carried to the next payout: NREUV owes $${(owedN / 100).toFixed(2)}, DakJen $${(owedD / 100).toFixed(2)} in refunds.`);

  let payoutRef = null, status = 'done';
  if (sendD > 0) {
    try {
      const po = await stripe.payouts.create({ amount: sendD, currency: 'usd', description: `DakJen share — GroundUp payout ${pd.date}`, statement_descriptor: 'GROUNDUP PAYOUT' });
      payoutRef = po.id;
    } catch (e) { status = 'bank_failed'; notes.push(`The bank payout to DakJen failed: ${e.message}`); await alert('DakJen payout', e); }
  }
  if (manual === false) notes.push('Stripe payouts are set to AUTOMATIC, so Stripe moves the whole balance (reserve included) by itself. Set them to manual in Stripe.');
  await sql`UPDATE payouts SET status = ${status}, payments = ${count}, nreuv_cents = ${sentN}, dakjen_cents = ${sendD},
    refund_nreuv_cents = ${tookN}, refund_dakjen_cents = ${takeD}, reserve_after_cents = ${balance},
    stripe_payout_id = ${payoutRef}, note = ${notes.join(' ') || null}, lines = ${JSON.stringify(lines)}::jsonb
    WHERE id = ${payoutId}`;
  return { payday: pd.date, kept: keep, payments: count, nreuv: sentN, dakjen: sendD, reserve: balance, notes, lines };
}

// What the Payouts page shows: past runs, what is waiting, the next paydays.
export async function payoutOverview(sql, now = new Date()) {
  await ensurePayoutTables(sql);
  const { k15, k30 } = await payoutKeeps(sql);
  const runs = await sql`SELECT * FROM payouts ORDER BY payday DESC LIMIT 60`;
  const cutoff = new Date(now.getTime() - 5 * 86400000).toISOString();
  const waiting = await sql`SELECT h.id, h.item, h.held_cents, h.rate_pct, h.gross_cents, h.created_at, u.name
    FROM held_transfers h LEFT JOIN users u ON u.stripe_customer_id = h.customer_id
    WHERE h.status = 'held' ORDER BY h.created_at ASC`;
  const paid = await sql`SELECT h.payout_id, h.item, h.held_cents, h.rate_pct, h.gross_cents, h.nreuv_paid_cents, h.dakjen_paid_cents, h.created_at, h.released_at, u.name
    FROM held_transfers h LEFT JOIN users u ON u.stripe_customer_id = h.customer_id
    WHERE h.payout_id IS NOT NULL ORDER BY h.created_at ASC`;
  let carry = { n: 0, d: 0 };
  try { carry = JSON.parse((await sql`SELECT value FROM settings WHERE key = 'payout_carry'`)[0]?.value || '{}'); } catch {}
  return {
    keep15: k15, keep30: k30, carry,
    next: nextPaydays(now, 4).filter(p => p.date >= FIRST_PAYDAY),
    runs,
    waiting: waiting.map(w => ({ ...w, past_window: new Date(w.created_at).toISOString() <= cutoff })),
    paid,
  };
}
