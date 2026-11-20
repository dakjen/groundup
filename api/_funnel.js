// Funnel leads: everyone who comes in through an ad / funnel page, with what
// they came for and how far they got (Dakotah, Nov 20, 2026). Shown on the
// team portal's Funnel Leads page. One row per person per thing they came for.
//
// came_for: free_seat | year_pass | scoping_call | intake | playbook | quiz
// status:   signed_up | started_payment | paid

let ready = false;
export async function ensureFunnelTable(sql) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS funnel_leads (
    id SERIAL PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL,
    came_for TEXT NOT NULL,
    page TEXT,
    status TEXT NOT NULL DEFAULT 'signed_up',
    acquisition TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (email, came_for)
  )`;
  ready = true;
}

const RANK = { signed_up: 1, started_payment: 2, paid: 3 };

// Records (or moves forward) one lead. A status never goes backwards: someone
// who paid and later clicks "buy" again stays "paid". Never throws — a failed
// record must not break the page the person is using.
export async function recordFunnelLead(sql, { name, email, cameFor, page, status = 'signed_up', acquisition, details } = {}) {
  try {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !cameFor) return;
    await ensureFunnelTable(sql);
    const [had] = await sql`SELECT status FROM funnel_leads WHERE email = ${e} AND came_for = ${cameFor}`;
    if (had && (RANK[had.status] || 0) >= (RANK[status] || 0)) {
      if (details) await sql`UPDATE funnel_leads SET details = COALESCE(details, '{}'::jsonb) || ${JSON.stringify(details)}::jsonb, updated_at = NOW() WHERE email = ${e} AND came_for = ${cameFor}`;
      return;
    }
    await sql`INSERT INTO funnel_leads (name, email, came_for, page, status, acquisition, details)
      VALUES (${name || null}, ${e}, ${cameFor}, ${page || null}, ${status}, ${acquisition || null}, ${details ? JSON.stringify(details) : null}::jsonb)
      ON CONFLICT (email, came_for) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW(),
        name = COALESCE(funnel_leads.name, EXCLUDED.name),
        acquisition = COALESCE(funnel_leads.acquisition, EXCLUDED.acquisition),
        details = COALESCE(funnel_leads.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb)`;
  } catch (err) { console.error('funnel lead record failed', err.message); }
}

// The checkout items a funnel page sells, mapped to what the person came for.
export const FUNNEL_ITEMS = { lnl_year_funnel: 'year_pass', retainer_onboarding: 'intake', playbook: 'playbook' };
