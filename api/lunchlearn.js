import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';
import { getSession, getAdmin, TIER_RANK, benefitGate, hashPassword, signToken } from './_utils.js';
import { sendEmail, lnlAccessEmail, addLnlContact, freeSeatEmail, siteUrl } from './_email.js';
import { wallToUtc, partsIn } from './_gcal.js';
import { OUTCOMES, OUTCOME_PLAN } from '../shared/outcomes.js';
import { recordFunnelLead, ensureFunnelTable } from './_funnel.js';

// Lunch & Learn onboarding: $69.99 buys 6 months of access (entitlement
// course_id 'lunchlearn'); comp coupons grant the same. Access also starts a
// 2-month window for 25% off the first month of a membership.

const SIX_MONTHS = "interval '6 months'";

// Per-session audience for office hours and classes. audience: 'all' (every
// eligible tier) | 'elite' (Owner only) | 'cohort:<partner_slug>' (one cohort).
// Cohort sessions ignore the tier line — the cohort was invited, full stop.
function audienceFits(ev, me, rank) {
  const a = ev.audience || 'all';
  if (a === 'all') return rank >= 3;
  if (a === 'elite') return rank >= 4;
  if (a.startsWith('cohort:')) return !!me?.partner_slug && me.partner_slug === a.slice(7);
  return rank >= 3;
}

// The schedule lives in settings.lnl_events (array). settings.lnl_event (single)
// is legacy — read once for back-compat, never written again.
// A session stays on the schedule (and joinable) until four hours after it
// starts — people join late, sessions run long, and a link that vanishes two
// minutes in is worse than one that lingers.
const LIVE_HOURS = 4;
// Plain-text email from Gina: lands in the main inbox, not Promotions (tested Nov 12, 2026).
async function sendPlain(to, subject, textContent) {
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: { email: 'groundup@drginamerritt.net', name: 'Gina Merritt' }, replyTo: { email: process.env.BREVO_REPLY_TO || 'djmj@nreuv.com', name: 'Gina Merritt' }, to: [{ email: to }], subject, textContent }),
    });
    if (!r.ok) console.error('plain send failed', to, r.status);
    return r.ok;
  } catch (e) { console.error('plain send failed', e.message); return false; }
}
export function freeSeatText(name, next, link) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const when = new Date(next.date).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });
  return `Hi ${first},

Your seat is held for my live Lunch & Learn on ${when}, at ${String(next.time || '11 am').toUpperCase().replace('AM', 'AM')} Eastern, on Zoom.

To claim it and get the Zoom link, set up your free account. We made it for you with this email address. Just choose a password here:

${link}

That's it. You are already RSVPed. The Zoom link will be on your Lunch & Learn page, and in your reminder email before the session.

Bring your questions. The Q&A is for your own deal.

Warmly,
Gina

Dr. Gina Merritt
Founder, GroundUp
community.drginamerritt.net`;
}

export const stillLive = (e) => new Date(e.date).getTime() + LIVE_HOURS * 3600e3 > Date.now();

async function getEvents(sql) {
  const [row] = await sql`SELECT value FROM settings WHERE key = 'lnl_events'`;
  let events = row?.value ? JSON.parse(row.value) : null;
  if (!events) {
    const [legacy] = await sql`SELECT value FROM settings WHERE key = 'lnl_event'`;
    events = legacy?.value ? [{ id: 'legacy', ...JSON.parse(legacy.value) }] : [];
  }
  // Upcoming first; past events fall off the list on their own
  return events
    .filter(e => e && e.date && !isNaN(Date.parse(e.date)))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function saveEvents(sql, events) {
  const val = JSON.stringify(events.slice(0, 100));
  await sql`INSERT INTO settings (key, value) VALUES ('lnl_events', ${val}) ON CONFLICT (key) DO UPDATE SET value = ${val}`;
}

async function getAccess(sql, userId) {
  // Doors in: a Lunch & Learn purchase/comp (the entitlement) grants everything;
  // ANY paid membership grants the live sessions (invites + RSVP). Recordings
  // ("the old ones") stay a Builder-and-up benefit.
  const [ent] = await sql`
    SELECT expires_at, source FROM entitlements
    WHERE user_id = ${userId} AND course_id = 'lunchlearn' AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY expires_at DESC NULLS FIRST LIMIT 1`;
  const [u] = await sql`SELECT tier FROM users WHERE id = ${userId} AND membership_status = 'active'`;
  // A founding member's free year of Lunch & Learns is a membership benefit: it
  // travels with a paid plan, not with the person after they drop to Free.
  if (ent && !(ent.source === 'founding25' && (!u || u.tier === 'Free'))) return ent;
  if (u && ['Builder', 'Premium', 'Elite'].includes(u.tier)) return { expires_at: null, via: 'membership' };
  if (u && u.tier === 'Basic') return { expires_at: null, via: 'membership_live' }; // live only — no recordings
  return null;
}

async function grantAccess(sql, userId, source) {
  const [ent] = await sql`
    INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at)
    VALUES (${userId}, 'lunchlearn', ${source}, NOW() + interval '6 months', NOW())
    RETURNING expires_at`;
  // Open (or refresh) the 25%-off-first-month window: 2 months from now
  await sql`UPDATE users SET lnl_discount_until = NOW() + interval '2 months' WHERE id = ${userId} AND (lnl_discount_until IS NULL OR lnl_discount_until < NOW() + interval '2 months')`;
  // Confirmation email + L&L email list — fire-and-forget, never block the grant
  try {
    const [u] = await sql`SELECT name, email FROM users WHERE id = ${userId}`;
    const [linkRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_link'`;
    if (u) {
      const mail = lnlAccessEmail(u.name, ent.expires_at, !!linkRow?.value);
      await Promise.allSettled([
        sendEmail(u.email, mail.subject, mail.html, { marketing: true }),
        addLnlContact(u.email, u.name),
      ]);
    }
  } catch (e) { console.error('lnl email failed', e); }
  return ent;
}

function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = 'LNL-';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  for (const n of buf) s += chars[n % chars.length];
  return s;
}

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const session = getSession(req);
  const admin = getAdmin(req);
  if (admin?.viewer && req.method !== 'GET') return res.status(403).json({ error: 'Your admin access is view-only — ask Dakotah to make this change.' });

  try {
    // ── Public: the next live session, for the ad funnel's headline ──
    if (req.method === 'GET' && req.query.next === '1') {
      const events = await getEvents(sql);
      const next = events.filter(e => (e.kind || 'lnl') === 'lnl' && stillLive(e)).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.json({ session: next ? { title: next.title, date: next.date, time: next.time || null } : null });
    }

    // ── Admin: Funnel Leads — everyone who came in through a funnel page, what
    // they came for, how far they got, and what they have done since ──
    if (req.method === 'GET' && req.query.funnel === '1') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      await ensureFunnelTable(sql);
      const rows = await sql`
        SELECT f.id, f.name, f.email, f.came_for, f.page, f.status, f.acquisition, f.details, f.created_at, f.updated_at,
               u.id AS user_id, u.tier, u.membership_status, u.created_at AS account_at,
               (SELECT COUNT(*)::int FROM lnl_rsvps r WHERE r.user_id = u.id) AS rsvps,
               EXISTS (SELECT 1 FROM waitlist w WHERE LOWER(w.email) = f.email) AS on_waitlist
        FROM funnel_leads f LEFT JOIN users u ON LOWER(u.email) = f.email
        ORDER BY f.created_at DESC LIMIT 1000`;
      return res.json({ leads: rows });
    }

    // ── Admin: every completed Get Started quiz, newest first ──
    if (req.method === 'GET' && req.query.quiz === '1') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      let rows = [];
      try { rows = await sql`SELECT id, name, email, outcome, answers, acquisition, created_at FROM quiz_results ORDER BY created_at DESC LIMIT 500`; } catch { /* before the migration */ }
      return res.json({ results: rows.map(r => ({ ...r, plan: OUTCOME_PLAN[r.outcome] || r.outcome, title: OUTCOMES[r.outcome]?.title || r.outcome })) });
    }

    // ── Admin: dashboard data ──
    if (req.method === 'GET' && req.query.admin === '1') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const [linkRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_link'`;
      const [recRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_recordings'`;
      const coupons = await sql`SELECT * FROM coupons WHERE kind = 'lnl_comp' ORDER BY created_at DESC LIMIT 100`;
      const requests = await sql`
        SELECT r.id, r.body, r.created_at, u.name, u.email
        FROM lnl_requests r LEFT JOIN users u ON u.id = r.user_id
        ORDER BY r.created_at DESC LIMIT 200`;
      const attendees = await sql`
        SELECT u.id, u.name, u.email, e.expires_at, e.source
        FROM entitlements e JOIN users u ON u.id = e.user_id
        WHERE e.course_id = 'lunchlearn' AND (e.expires_at IS NULL OR e.expires_at > NOW())
        ORDER BY e.created_at DESC LIMIT 200`;
      const events = await getEvents(sql);
      const upcoming = events.filter(stillLive);
      const event = upcoming[0] || null;
      const allRsvps = events.length ? await sql`
        SELECT r.event_key, r.question, u.name, u.email FROM lnl_rsvps r JOIN users u ON u.id = r.user_id
        ORDER BY r.created_at ASC` : [];
      const rsvpsByEvent = {};
      for (const r of allRsvps) (rsvpsByEvent[r.event_key] ||= []).push({ name: r.name, email: r.email, question: r.question || null });
      const rsvps = event ? (rsvpsByEvent[event.date] || []) : [];
      return res.json({ event, events, rsvps, rsvpsByEvent, link: linkRow?.value || '', recordings: recRow?.value ? JSON.parse(recRow.value) : [], coupons, requests, attendees });
    }

    // ── Member: my Lunch & Learn status ──
    if (req.method === 'GET') {
      if (!session || !session.uid) return res.status(401).json({ error: 'Sign in required' });
      const access = admin ? { expires_at: null } : await getAccess(sql, session.uid);
      const [user] = await sql`SELECT lnl_discount_until FROM users WHERE id = ${session.uid}`;
      let link = null;
      if (access || admin) {
        const [linkRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_link'`;
        link = linkRow?.value || null;
      }
      const [reqRow] = session.uid ? await sql`SELECT id FROM lnl_requests WHERE user_id = ${session.uid} LIMIT 1` : [];
      let recordings = [];
      {
        // Recordings open at Builder and above (or any L&L access); the live
        // session link stays with L&L access holders (Developer+/purchase/comp)
        const [rt] = await sql`SELECT tier FROM users WHERE id = ${session.uid} AND membership_status = 'active'`;
        const recRank = TIER_RANK[rt?.tier] ?? 0;
        if (admin || recRank >= 2 || (access && access.via !== 'membership_live')) {
          const [recRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_recordings'`;
          recordings = recRow?.value ? JSON.parse(recRow.value) : [];
        }
      }
      const allEvents = await getEvents(sql);
      // Lunch & Learns and Office Hours share the schedule store but are
      // separate experiences — L&L keeps its page, office hours get their own
      const upcomingAll = allEvents.filter(stillLive);
      const upcomingEvents = upcomingAll.filter(e => (e.kind || 'lnl') !== 'office');
      const officeEvents = upcomingAll.filter(e => (e.kind || 'lnl') === 'office');
      const event = upcomingEvents[0] || null;
      const myRsvpRows = session.uid ? await sql`SELECT event_key, joined_at FROM lnl_rsvps WHERE user_id = ${session.uid}` : [];
      const myRsvpKeys = myRsvpRows.map(r => r.event_key);
      const joinedKeys = myRsvpRows.filter(r => r.joined_at).map(r => r.event_key);
      const my_rsvp = !!(event && myRsvpKeys.includes(event.date));
      // Office hours: Premium+ benefit with a yearly RSVP allowance per tier
      let office_hours = null;
      {
        const [me] = await sql`SELECT tier, role, comped, tier_since, partner_slug FROM users WHERE id = ${session.uid} AND membership_status = 'active'`;
        const rank = admin ? 4 : (TIER_RANK[me?.tier] ?? 0);
        // Office hours are time with Dr. Merritt: Owner after 2 months, Premium after 4
        const gate = admin ? { active: false } : await benefitGate(sql, { ...me, id: session.uid });
        const [lifetime] = await sql`SELECT id FROM entitlements WHERE user_id = ${session.uid} AND course_id = 'officehours' AND source = 'lifetime' AND expires_at > NOW() LIMIT 1`;
        // Cohort members see their cohort's sessions even below Premium
        const cohortSessions = officeEvents.filter(e => (e.audience || '').startsWith('cohort:') && me?.partner_slug && e.audience === 'cohort:' + me.partner_slug);
        if (rank >= 3 || lifetime || cohortSessions.length) {
          const [pRow] = await sql`SELECT value FROM settings WHERE key = ${rank >= 4 ? 'office_allow_elite' : 'office_allow_premium'}`;
          const limit = parseInt(pRow?.value, 10) || (rank >= 4 ? 6 : 2);
          const officeKeys = allEvents.filter(e => (e.kind || 'lnl') === 'office').map(e => e.date);
          const usedRows = officeKeys.length ? await sql`SELECT COUNT(*)::int AS n FROM lnl_rsvps
            WHERE user_id = ${session.uid} AND event_key = ANY(${officeKeys}) AND created_at > NOW() - interval '365 days'` : [{ n: 0 }];
          office_hours = {
            eligible: true, gate,
            allowance: { limit, used: usedRows[0]?.n || 0, remaining: Math.max(0, limit - (usedRows[0]?.n || 0)) },
            events: officeEvents.filter(e => admin || audienceFits(e, me, rank >= 3 || lifetime ? Math.max(rank, 3) : rank)).map(e => { const mine = myRsvpKeys.includes(e.date); return { ...e, my_rsvp: mine, joined: joinedKeys.includes(e.date), has_link: !!e.link, link: mine ? e.link : undefined }; }),   // the link follows the seat, team included
          };
        } else {
          office_hours = { eligible: false, events: [] };
        }
      }
      return res.json({
        event, my_rsvp, office_hours,
        // The full upcoming schedule, with this member's RSVP state per session
        // Each session can carry its own meeting link; the global link is the fallback. Seat holders only.
        events: upcomingEvents.map(e => { const mine = myRsvpKeys.includes(e.date); return { ...e, my_rsvp: mine, joined: joinedKeys.includes(e.date), has_link: !!(e.link || link), link: mine ? (e.link || link || null) : undefined }; }),
        active: !!access || !!admin,
        expires_at: access?.expires_at || null,
        // The Zoom link is for people who hold a seat — RSVP first
        link: my_rsvp ? ((event && event.link) || link || null) : null,
        has_link: !!((event && event.link) || link),
        recordings,
        discount_until: user?.lnl_discount_until || null,
        has_request: !!reqRow,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const action = req.body?.action;

    // ── Admin actions ──
    // Add a session to the schedule (set_event kept as an alias for old clients).
    // kind 'lnl' (default) = Lunch & Learn; kind 'office' = tier-gated office hours.
    if (action === 'set_event' || action === 'add_event') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const { title, date, time, description, kind } = req.body;
      if (!title || !date) return res.status(400).json({ error: 'Title and date required' });
      if (isNaN(Date.parse(date))) return res.status(400).json({ error: 'Invalid date' });
      const events = await getEvents(sql);
      const aud = String(req.body.audience || 'all');
      const audience = aud === 'elite' || /^cohort:[a-z0-9-]+$/.test(aud) ? aud : 'all';
      const k = kind === 'office' ? 'office' : kind === 'class' ? 'class' : 'lnl';
      // A class is taught to one cohort, so it must name one — otherwise it
      // would fall through to 'all' and appear as a general office hour.
      if (k === 'class' && !/^cohort:[a-z0-9-]+$/.test(audience)) {
        return res.status(400).json({ error: 'A class has to belong to a cohort' });
      }
      events.push({ id: String(Date.now()), kind: k, title: String(title).slice(0, 200), date, time: (time || '').slice(0, 50), description: (description || '').slice(0, 500),
        ...(k === 'office' || k === 'class' ? { audience } : {}),
        ...(req.body.link ? { link: String(req.body.link).slice(0, 500) } : {}) });
      await saveEvents(sql, events);
      return res.json({ success: true, events });
    }

    // Build a whole term of synchronous classes in one go. A 12-week program is
    // 12 sessions; typing them one at a time invites gaps and typos, and the
    // cadence is the thing being sold, so it is generated rather than entered.
    if (action === 'add_class_series') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const slug = String(req.body.slug || '').toLowerCase().trim();
      if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Which cohort?' });
      const [cohort] = await sql`SELECT slug, name, meeting_link FROM partners WHERE slug = ${slug}`;
      if (!cohort) return res.status(404).json({ error: 'No cohort with that slug' });

      const first = String(req.body.first_date || '');
      if (isNaN(Date.parse(first))) return res.status(400).json({ error: 'Give the first class a valid date' });
      const count = Math.min(52, Math.max(1, Number(req.body.count) || 0));
      if (!count) return res.status(400).json({ error: 'How many classes?' });
      const cadence = req.body.cadence === 'biweekly' ? 'biweekly' : 'weekly';
      const step = cadence === 'biweekly' ? 14 : 7;
      const time = String(req.body.time || '').slice(0, 50);
      const link = String(req.body.link || cohort.meeting_link || '').slice(0, 500);
      // Titles are optional; anything not named becomes "Class N" and can be
      // renamed later through update_event.
      const titles = Array.isArray(req.body.titles) ? req.body.titles : [];
      const base = String(req.body.title || 'Class').slice(0, 120);

      const events = await getEvents(sql);
      const made = [];
      // Step the series in Eastern wall-clock, not in UTC. A term that crosses
      // the November change would otherwise slide an hour partway through —
      // 11am ET becomes 10am ET — because the server runs on UTC and adding
      // seven days there keeps the UTC time, not the class time.
      const TZ = 'America/New_York';
      const at = partsIn(new Date(first), TZ);
      for (let i = 0; i < count; i++) {
        const shifted = new Date(Date.UTC(at.y, at.m - 1, at.d + i * step, 12, 0, 0));
        const d = wallToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), at.hh, at.mm, TZ);
        const ev = {
          id: String(Date.now()) + '-' + i,
          kind: 'class',
          title: (titles[i] && String(titles[i]).slice(0, 200)) || `${base} ${i + 1}`,
          date: d.toISOString(),
          time,
          description: String(req.body.description || '').slice(0, 500),
          audience: 'cohort:' + slug,
          ...(link ? { link } : {}),
        };
        events.push(ev);
        made.push(ev);
      }
      await saveEvents(sql, events);
      return res.json({ success: true, created: made.length, cadence, events: made });
    }

    // Drop a whole cohort's classes at once — rescheduling a term usually means
    // rebuilding it, and removing 12 sessions by hand is where mistakes happen.
    if (action === 'clear_class_series') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const slug = String(req.body.slug || '').toLowerCase().trim();
      if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Which cohort?' });
      const events = await getEvents(sql);
      const keep = events.filter(e => !(e.kind === 'class' && e.audience === 'cohort:' + slug));
      const removed = events.length - keep.length;
      await saveEvents(sql, keep);
      return res.json({ success: true, removed });
    }

    // Rename / relabel a scheduled session (past or upcoming)
    if (action === 'update_event') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const events = await getEvents(sql);
      const ev = events.find(e => e.id === req.body.id);
      if (!ev) return res.status(404).json({ error: 'Session not found' });
      if (req.body.title) ev.title = String(req.body.title).slice(0, 200);
      if (req.body.time !== undefined) ev.time = String(req.body.time || '').slice(0, 50);
      if (req.body.description !== undefined) ev.description = String(req.body.description || '').slice(0, 500);
      if (req.body.link !== undefined) { const l = String(req.body.link || '').trim().slice(0, 500); if (l && !/^https?:\/\//i.test(l)) return res.status(400).json({ error: 'The meeting link must start with http' }); if (l) ev.link = l; else delete ev.link; }
      await saveEvents(sql, events);
      return res.json({ success: true, events });
    }

    // Rename a past recording
    if (action === 'update_recording') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const [recRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_recordings'`;
      const recs = recRow?.value ? JSON.parse(recRow.value) : [];
      const rec = recs.find(x => x.id === req.body.id);
      if (!rec) return res.status(404).json({ error: 'Recording not found' });
      if (req.body.title) rec.title = String(req.body.title).slice(0, 200);
      if (req.body.date !== undefined) rec.date = String(req.body.date || '').slice(0, 50);
      if (req.body.description !== undefined) rec.description = String(req.body.description || '').slice(0, 500);
      const val = JSON.stringify(recs);
      await sql`INSERT INTO settings (key, value) VALUES ('lnl_recordings', ${val}) ON CONFLICT (key) DO UPDATE SET value = ${val}`;
      return res.json({ success: true, recordings: recs });
    }

    if (action === 'remove_event') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const events = (await getEvents(sql)).filter(e => e.id !== req.body.id);
      await saveEvents(sql, events);
      return res.json({ success: true, events });
    }

    if (action === 'set_link') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const url = (req.body.url || '').trim();
      if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); } }
      await sql`INSERT INTO settings (key, value) VALUES ('lnl_link', ${url}) ON CONFLICT (key) DO UPDATE SET value = ${url}`;
      return res.json({ success: true });
    }

    // The join link was clicked: stamp the seat so it can't be released after.
    if (action === 'joined') {
      if (!session?.uid) return res.status(401).json({ error: 'Sign in required' });
      await sql`UPDATE lnl_rsvps SET joined_at = COALESCE(joined_at, NOW()) WHERE user_id = ${session.uid} AND event_key = ${String(req.body.event_key || '')}`;
      return res.json({ success: true });
    }

    // Ad funnel: a free scoping call with the GroundUp team — the human read
    // before anyone pays for an intake with Dr. Merritt. Records the lead,
    // tells the team, and sends the caller the booking link.
    if (action === 'scoping_call') {
      const email = String(req.body.email || '').trim().toLowerCase().slice(0, 200);
      const name = String(req.body.name || '').trim().slice(0, 120);
      if ((req.body.website && String(req.body.website).trim())) return res.status(201).json({ success: true });
      if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Your name and a real email, please' });
      // The free call is for new people only (Dakotah, Nov 16): not members,
      // and not anyone who joined the waitlist themselves. Rows the funnels
      // add on their own (source ad:… or quiz:…) do not count, or the quiz
      // would lock out the people it sends here.
      const [isMember] = await sql`SELECT id FROM users WHERE LOWER(email) = ${email}`;
      const [onList] = isMember ? [null] : await sql`SELECT id FROM waitlist WHERE LOWER(email) = ${email} AND COALESCE(source, '') NOT LIKE 'ad:%' AND COALESCE(source, '') NOT LIKE 'quiz:%'`;
      if (isMember || onList) return res.status(409).json({ error: 'The free scoping call is for people who are new to GroundUp, and this email is already with us. Reply to any GroundUp email and a person on the team will help you.' });
      const phone = String(req.body.phone || '').trim().slice(0, 40) || null;
      const stage = String(req.body.stage || '').trim().slice(0, 80) || null;
      const about = String(req.body.about || '').trim().slice(0, 2000) || null;
      const acq = String(req.body.acquisition || '').slice(0, 120) || 'scoping-call';
      await recordFunnelLead(sql, { name, email, cameFor: 'scoping_call', page: 'call', acquisition: acq, details: { phone, stage, about } });
      try { await sql`INSERT INTO scoping_requests (name, email, phone, stage, about, acquisition) VALUES (${name}, ${email}, ${phone}, ${stage}, ${about}, ${acq})`; } catch (e) { console.error('scoping insert', e.message); }
      try { await sql`INSERT INTO waitlist (name, email, list, source, acquisition, created_at) VALUES (${name}, ${email}, 'general', ${'ad:' + acq}, ${acq}, NOW()) ON CONFLICT DO NOTHING`; } catch {}
      const [linkRow] = await sql`SELECT value FROM settings WHERE key = 'scoping_call_link'`;
      const link = linkRow?.value || '';
      const esc = (x) => String(x || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const teamTo = [...new Set([process.env.SCOPING_EMAIL || 'dakotah@dakjencreative.com', process.env.ADMIN_EMAIL || 'admin@nreuv.com'])];
      for (const addr of teamTo) await sendEmail(addr, `Scoping call request — ${name}`,
        `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">${esc(name)} wants a scoping call</h2>
         <p style="color:#444444;font-size:14px;line-height:1.8;">${esc(email)}${phone ? ' · ' + esc(phone) : ''}<br>Where they are: <strong>${esc(stage || 'not said')}</strong><br>Came in from: ${esc(acq)}</p>
         ${about ? `<p style="color:#444444;font-size:14px;line-height:1.8;background:#faf7f7;border:1px solid #e5dccf;border-radius:10px;padding:14px 18px;">${esc(about)}</p>` : ''}
         <p style="color:#7a5050;font-size:12px;line-height:1.7;">${link ? 'They were sent the booking link. ' : 'No booking link is set yet — reach out to pick a time. '}Track it on Intake &amp; Bookings.</p>`);
      await sendEmail(email, 'Your free scoping call with GroundUp',
        `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">Let's talk about what you're building, ${esc(name.split(' ')[0])}.</h2>
         <p style="color:#444444;font-size:14px;line-height:1.8;">Twenty minutes with the GroundUp team. We'll hear where your project stands, what's in the way, and tell you honestly what would help most — a course, a membership, office hours, or time with Dr. Merritt. No pitch for things you don't need.</p>
         ${link ? `<p style="margin:22px 0;"><a href="${esc(link)}" style="display:inline-block;background:#b80101;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px;">Pick a time →</a></p>` : `<p style="color:#444444;font-size:14px;line-height:1.8;">We'll reach out within one business day with times.</p>`}
         <p style="color:#7a5050;font-size:12px;line-height:1.7;">Come with whatever you have — a site, a napkin pro forma, a question. That's plenty.</p>`);
      return res.status(201).json({ success: true, link: link || null });
    }

    // Get Started quiz: save the answers and the read, email the person their
    // recommendation, and keep them on the general list. Public, honeypot-guarded.
    if (action === 'quiz_result') {
      const email = String(req.body.email || '').trim().toLowerCase().slice(0, 200);
      const name = String(req.body.name || '').trim().slice(0, 120);
      if ((req.body.website && String(req.body.website).trim())) return res.status(201).json({ success: true });
      if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Your name and a real email, please' });
      const outcome = OUTCOMES[String(req.body.outcome || '')];
      if (!outcome) return res.status(400).json({ error: 'No recommendation to send' });
      const answers = Array.isArray(req.body.answers) ? req.body.answers.slice(0, 12).map(a => ({ q: String(a?.q || '').slice(0, 200), a: String(a?.a || '').slice(0, 200) })).filter(a => a.q && a.a) : [];
      const acq = String(req.body.acquisition || '').slice(0, 120) || 'get-started';
      await recordFunnelLead(sql, { name, email, cameFor: 'quiz', page: 'get-started', acquisition: acq, details: { outcome: outcome.key, read: outcome.title, answers } });
      try { await sql`INSERT INTO quiz_results (name, email, outcome, answers, acquisition) VALUES (${name}, ${email}, ${outcome.key}, ${JSON.stringify(answers)}::jsonb, ${acq})`; } catch (e) { console.error('quiz insert', e.message); }
      try { await sql`INSERT INTO waitlist (name, email, list, source, acquisition, created_at) VALUES (${name}, ${email}, 'general', ${'quiz:' + outcome.key}, ${acq}, NOW()) ON CONFLICT DO NOTHING`; } catch {}
      const esc = (x) => String(x || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const site = siteUrl();
      const href = (h) => h.startsWith('/?join=') ? site + '/' : site + h;
      const first = esc(name.split(' ')[0]);
      // One plain-text email with everything (Dakotah, Nov 22, 2026): the result,
      // the next step with its link, the free scoping call link, and their answers.
      try {
        const { quizEmail } = await import('./_quiz_email.js');
        const [callRow] = await sql`SELECT value FROM settings WHERE key = 'scoping_call_link'`;
        const [launchRow] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
        const launched = !!launchRow?.value && new Date(launchRow.value).getTime() <= Date.now();
        const m = quizEmail({ name, email, outcome, answers, site, callLink: callRow?.value || null, launched });
        await sendPlain(email, m.subject, m.text);
      } catch (e) { console.error('quiz email', e.message); }
      return res.status(201).json({ success: true });
    }

    // Ad funnel: a free seat at the next live session, no account needed yet.
    // Makes a single-use code, emails it with the three steps, and records the lead.
    if (action === 'free_seat') {
      const email = String(req.body.email || '').trim().toLowerCase().slice(0, 200);
      const name = String(req.body.name || '').trim().slice(0, 120);
      if ((req.body.website && String(req.body.website).trim())) return res.status(201).json({ success: true });
      if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Your name and a real email, please' });
      const acq = String(req.body.acquisition || '').slice(0, 120) || 'free-seat';
      await recordFunnelLead(sql, { name, email, cameFor: 'free_seat', page: 'lunch', acquisition: acq });
      const code = 'LIVE-' + genCode().slice(0, 6);
      const [coupon] = await sql`INSERT INTO coupons (code, kind, max_uses, expires_at, created_at) VALUES (${code}, 'lnl_comp', 1, NOW() + interval '180 days', NOW()) ON CONFLICT (code) DO NOTHING RETURNING code`;
      if (!coupon) return res.status(500).json({ error: 'Try once more' });
      try { await sql`ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS acquisition TEXT`; } catch {}
      try { await sql`INSERT INTO waitlist (name, email, list, source, acquisition, created_at) VALUES (${name}, ${email}, 'general', ${'ad:' + acq}, ${acq}, NOW()) ON CONFLICT DO NOTHING`; } catch (e) { console.error('free seat lead', e.message); }
      const events = await getEvents(sql);
      const next = events.filter(e => (e.kind || 'lnl') === 'lnl' && stillLive(e)).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
      // The seat is held in their name (Dakotah, Nov 20, 2026: "it should rsvp
      // them"). We make the account and RSVP it to the next session; they claim
      // it by setting a password from the email, and the Zoom link is on their
      // Lunch & Learn page and in the reminder.
      let held = false, link = `${siteUrl()}/lunchlearn`;
      try {
        let [u] = await sql`SELECT id FROM users WHERE LOWER(email) = ${email}`;
        let isNew = false;
        if (!u) {
          [u] = await sql`INSERT INTO users (name, email, tier, password_hash, role, ip_agreed_at, acquisition, created_at)
            VALUES (${name}, ${email}, 'Free', ${hashPassword(crypto.randomBytes(24).toString('hex'))}, 'member', NOW(), ${acq}, NOW())
            ON CONFLICT (email) DO NOTHING RETURNING id`;
          isNew = !!u;
          if (!u) [u] = await sql`SELECT id FROM users WHERE LOWER(email) = ${email}`;
        }
        if (u && next) {
          const access = await getAccess(sql, u.id);
          if (!access) {
            const until = new Date(new Date(next.date).getTime() + 24 * 3600 * 1000).toISOString();
            await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at) VALUES (${u.id}, 'lunchlearn', 'free_seat', ${until}, NOW())`;
          }
          await sql`INSERT INTO lnl_rsvps (user_id, event_key, created_at) VALUES (${u.id}, ${next.date}, NOW()) ON CONFLICT (user_id, event_key) DO NOTHING`;
          await sql`UPDATE coupons SET used_count = max_uses WHERE code = ${code}`;
          held = true;
        }
        if (u && isNew) link = `${siteUrl()}/?reset=${encodeURIComponent(signToken({ uid: u.id, purpose: 'reset' }, 1000 * 60 * 60 * 24 * 14))}`;
      } catch (e) { console.error('free seat hold failed', e.message); }
      let ok = false;
      if (held) {
        ok = await sendPlain(email, `Your seat for the ${new Date(next.date).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric' })} Lunch & Learn`, freeSeatText(name, next, link));
      } else {
        const mail = freeSeatEmail(name, code, next);
        ok = await sendEmail(email, mail.subject, mail.html);
      }
      try { await addLnlContact?.(email, name); } catch {}
      if (held) return res.status(201).json({ success: true, sent: !!ok, held: true, session: { title: next.title, date: next.date, time: next.time } });
      // The code comes back on the page too, so a missed email never costs the seat
      return res.status(201).json({ success: true, sent: !!ok, code, session: next ? { title: next.title, date: next.date, time: next.time } : null });
    }

    if (action === 'create_coupon') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const code = (req.body.code || genCode()).trim().toUpperCase();
      const maxUses = Math.max(1, Math.min(1000, Number(req.body.max_uses) || 1));
      const [coupon] = await sql`
        INSERT INTO coupons (code, kind, max_uses, expires_at, created_at)
        VALUES (${code}, 'lnl_comp', ${maxUses}, NOW() + interval '1 year', NOW())
        ON CONFLICT (code) DO NOTHING RETURNING *`;
      if (!coupon) return res.status(409).json({ error: 'That code already exists' });
      return res.status(201).json({ coupon });
    }

    if (action === 'add_recording') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const { title, url, date, description } = req.body;
      if (!title || !url) return res.status(400).json({ error: 'Title and video URL required' });
      // Accept every YouTube URL shape — watch, share, live (most L&L recordings), shorts, embed
      const yt = String(url).match(/(?:[?&]v=|youtu\.be\/|youtube\.com\/(?:live|shorts|embed|v)\/)([\w-]{11})/);
      if (!yt) return res.status(400).json({ error: 'Use a YouTube link (unlisted videos work great)' });
      const [recRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_recordings'`;
      const recs = recRow?.value ? JSON.parse(recRow.value) : [];
      recs.unshift({ id: String(Date.now()), title: String(title).slice(0, 200), videoId: yt[1], date: date || '', description: (description || '').slice(0, 500) });
      const val = JSON.stringify(recs.slice(0, 200));
      await sql`INSERT INTO settings (key, value) VALUES ('lnl_recordings', ${val}) ON CONFLICT (key) DO UPDATE SET value = ${val}`;
      return res.status(201).json({ success: true, recordings: recs });
    }

    if (action === 'remove_recording') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const [recRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_recordings'`;
      const recs = (recRow?.value ? JSON.parse(recRow.value) : []).filter(r => r.id !== req.body.id);
      const val = JSON.stringify(recs);
      await sql`INSERT INTO settings (key, value) VALUES ('lnl_recordings', ${val}) ON CONFLICT (key) DO UPDATE SET value = ${val}`;
      return res.json({ success: true, recordings: recs });
    }

    if (action === 'grant') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const userId = Number(req.body.user_id);
      if (!userId) return res.status(400).json({ error: 'user_id required' });
      const ent = await grantAccess(sql, userId, 'manual');
      return res.json({ success: true, expires_at: ent.expires_at });
    }

    // ── Member actions ──
    if (!session || !session.uid) return res.status(401).json({ error: 'Sign in required' });

    if (action === 'rsvp') {
      const events = await getEvents(sql);
      // event_key targets a specific session; default to the next upcoming L&L
      const target = req.body.event_key
        ? events.find(e => e.date === req.body.event_key)
        : events.find(e => stillLive(e) && (e.kind || 'lnl') !== 'office');
      if (!target) return res.status(400).json({ error: 'No upcoming session scheduled' });
      if ((target.kind || 'lnl') === 'office') {
        // Office hours: Premium+ only, behind the new-member gate, within the yearly allowance
        if (!admin) {
          const [me] = await sql`SELECT tier, role, comped, tier_since, partner_slug FROM users WHERE id = ${session.uid} AND membership_status = 'active'`;
          const rank = TIER_RANK[me?.tier] ?? 0;
          const [lifetime] = await sql`SELECT id FROM entitlements WHERE user_id = ${session.uid} AND course_id = 'officehours' AND source = 'lifetime' AND expires_at > NOW() LIMIT 1`;
          const effRank = lifetime ? Math.max(rank, 3) : rank;
          const isCohortSession = (target.audience || '').startsWith('cohort:');
          if (!audienceFits(target, me, effRank)) {
            if (isCohortSession) return res.status(403).json({ error: 'This session is reserved for a specific cohort.' });
            if ((target.audience || 'all') === 'elite') return res.status(403).json({ error: 'This session is for Owner members.' });
            return res.status(403).json({ error: 'Office hours come with Premium and Owner — or the Lifetime Pass' });
          }
          if (req.body.going && !isCohortSession) {
            const g = admin ? { active: false } : await benefitGate(sql, { ...me, id: session.uid });
            if (g.active) return res.status(403).json({ error: `Office hours open after your first ${g.months} months of membership — yours unlock on ${new Date(g.until).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.` });
            const [pRow] = await sql`SELECT value FROM settings WHERE key = ${rank >= 4 ? 'office_allow_elite' : 'office_allow_premium'}`;
            const limit = parseInt(pRow?.value, 10) || (rank >= 4 ? 6 : 2);
            const officeKeys = events.filter(e => (e.kind || 'lnl') === 'office').map(e => e.date);
            const [used] = await sql`SELECT COUNT(*)::int AS n FROM lnl_rsvps WHERE user_id = ${session.uid} AND event_key = ANY(${officeKeys}) AND created_at > NOW() - interval '365 days'`;
            if ((used?.n || 0) >= limit) return res.status(403).json({ error: `You've used all ${limit} office-hours spots your plan includes this year.` });
          }
        }
      } else {
        let access = admin ? { ok: true } : await getAccess(sql, session.uid);
        // The free taste: every account gets ONE live Lunch & Learn on the house.
        // The first RSVP grants access through that session; after that, it's a
        // membership or a purchase.
        if (!access && req.body.going) {
          // Before the public launch an unpaid account gets nothing — the
          // free taste opens December 1 (early access is for paying founding
          // members only).
          const [pub] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
          if (pub?.value && new Date(pub.value).getTime() > Date.now()) {
            return res.status(403).json({ error: 'Your free Lunch & Learn seat opens with the public launch on December 1. Founding members have live sessions included now.' });
          }
          const [taste] = await sql`SELECT id FROM entitlements WHERE user_id = ${session.uid} AND course_id = 'lunchlearn' AND source = 'free_taste' LIMIT 1`;
          if (!taste) {
            const until = new Date(new Date(target.date).getTime() + 24 * 3600 * 1000).toISOString();
            await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at) VALUES (${session.uid}, 'lunchlearn', 'free_taste', ${until}, NOW())`;
            access = { ok: true, via: 'free_taste' };
          }
        }
        if (!access) return res.status(403).json({ error: 'That was your free session — Lunch & Learn access comes with any membership, or on its own for $39.99.' });
      }
      if (req.body.going) {
        const q = String(req.body.question || '').slice(0, 500) || null;
        await sql`INSERT INTO lnl_rsvps (user_id, event_key, question, created_at) VALUES (${session.uid}, ${target.date}, ${q}, NOW()) ON CONFLICT (user_id, event_key) DO UPDATE SET question = COALESCE(${q}, lnl_rsvps.question)`;
      } else {
        // Once they've clicked the join link the seat is spent, whenever that was.
        const [held] = await sql`SELECT joined_at FROM lnl_rsvps WHERE user_id = ${session.uid} AND event_key = ${target.date}`;
        if (held?.joined_at) return res.status(400).json({ error: 'You joined this session — the seat counts toward your plan.' });
        // A seat can be released up to an hour before the session. After that
        // it is spent — otherwise an Owner could join, release, and keep all
        // six office-hours spots for the year.
        const msToStart = new Date(target.date).getTime() - Date.now();
        if (msToStart < 3600e3) return res.status(400).json({ error: msToStart > 0 ? 'Seats lock an hour before the session starts.' : 'This session has started — the seat is yours and counts toward your plan.' });
        await sql`DELETE FROM lnl_rsvps WHERE user_id = ${session.uid} AND event_key = ${target.date}`;
      }
      return res.json({ success: true });
    }

    if (action === 'redeem') {
      const code = (req.body.code || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: 'Enter a code' });
      const existing = await getAccess(sql, session.uid);
      if (existing) return res.status(409).json({ error: 'You already have Lunch & Learn access' });
      // Atomic redemption — only succeeds while uses remain and it hasn't expired
      const [coupon] = await sql`
        UPDATE coupons SET used_count = used_count + 1
        WHERE code = ${code} AND kind = 'lnl_comp' AND used_count < max_uses AND (expires_at IS NULL OR expires_at > NOW())
        RETURNING *`;
      if (!coupon) return res.status(400).json({ error: 'That code is invalid, expired, or already used' });
      const ent = await grantAccess(sql, session.uid, 'coupon');
      return res.json({ success: true, expires_at: ent.expires_at });
    }

    // Personal notes on a recording — saved to the account, one note per video
    if (action === 'save_note') {
      const key = String(req.body.key || '').slice(0, 100);
      const body = String(req.body.body ?? '').slice(0, 20000);
      if (!key.startsWith('lnl:')) return res.status(400).json({ error: 'Bad note key' });
      await sql`INSERT INTO user_notes (user_id, note_key, body, updated_at) VALUES (${session.uid}, ${key}, ${body}, NOW())
        ON CONFLICT (user_id, note_key) DO UPDATE SET body = ${body}, updated_at = NOW()`;
      return res.json({ success: true });
    }

    if (action === 'get_notes') {
      const rows = await sql`SELECT note_key, body FROM user_notes WHERE user_id = ${session.uid} AND note_key LIKE 'lnl:%'`;
      const notes = {};
      for (const r of rows) notes[r.note_key] = r.body;
      return res.json({ notes });
    }

    if (action === 'request') {
      const body = (req.body.body || '').trim();
      if (!body) return res.status(400).json({ error: 'Tell us what you want to learn about' });
      if (body.length > 2000) return res.status(400).json({ error: 'Please keep it under 2000 characters' });
      await sql`INSERT INTO lnl_requests (user_id, body, created_at) VALUES (${session.uid}, ${body}, NOW())`;
      return res.status(201).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
