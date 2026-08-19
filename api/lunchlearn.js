import { neon } from '@neondatabase/serverless';
import { getSession, getAdmin } from './_utils.js';
import { sendEmail, lnlAccessEmail, addLnlContact } from './_email.js';

// Lunch & Learn onboarding: $69.99 buys 6 months of access (entitlement
// course_id 'lunchlearn'); comp coupons grant the same. Access also starts a
// 2-month window for 25% off the first month of a membership.

const SIX_MONTHS = "interval '6 months'";

// The schedule lives in settings.lnl_events (array). settings.lnl_event (single)
// is legacy — read once for back-compat, never written again.
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
  // Two doors in: a Lunch & Learn purchase/comp (the entitlement), or a
  // Premium/Elite membership — those tiers include L&L as a benefit.
  const [ent] = await sql`
    SELECT expires_at FROM entitlements
    WHERE user_id = ${userId} AND course_id = 'lunchlearn' AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY expires_at DESC NULLS FIRST LIMIT 1`;
  if (ent) return ent;
  const [u] = await sql`SELECT tier FROM users WHERE id = ${userId} AND membership_status = 'active'`;
  if (u && ['Premium', 'Elite'].includes(u.tier)) return { expires_at: null, via: 'membership' };
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
        sendEmail(u.email, mail.subject, mail.html),
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

  try {
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
      const upcoming = events.filter(e => new Date(e.date) > new Date());
      const event = upcoming[0] || null;
      const allRsvps = events.length ? await sql`
        SELECT r.event_key, u.name, u.email FROM lnl_rsvps r JOIN users u ON u.id = r.user_id
        ORDER BY r.created_at ASC` : [];
      const rsvpsByEvent = {};
      for (const r of allRsvps) (rsvpsByEvent[r.event_key] ||= []).push({ name: r.name, email: r.email });
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
      if (access || admin) {
        const [recRow] = await sql`SELECT value FROM settings WHERE key = 'lnl_recordings'`;
        recordings = recRow?.value ? JSON.parse(recRow.value) : [];
      }
      const allEvents = await getEvents(sql);
      const upcomingEvents = allEvents.filter(e => new Date(e.date) > new Date());
      const event = upcomingEvents[0] || null;
      const myRsvpRows = session.uid ? await sql`SELECT event_key FROM lnl_rsvps WHERE user_id = ${session.uid}` : [];
      const myRsvpKeys = myRsvpRows.map(r => r.event_key);
      const my_rsvp = !!(event && myRsvpKeys.includes(event.date));
      return res.json({
        event, my_rsvp,
        // The full upcoming schedule, with this member's RSVP state per session
        events: upcomingEvents.map(e => ({ ...e, my_rsvp: myRsvpKeys.includes(e.date) })),
        active: !!access || !!admin,
        expires_at: access?.expires_at || null,
        link,
        recordings,
        discount_until: user?.lnl_discount_until || null,
        has_request: !!reqRow,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const action = req.body?.action;

    // ── Admin actions ──
    // Add a session to the schedule (set_event kept as an alias for old clients)
    if (action === 'set_event' || action === 'add_event') {
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const { title, date, time, description } = req.body;
      if (!title || !date) return res.status(400).json({ error: 'Title and date required' });
      if (isNaN(Date.parse(date))) return res.status(400).json({ error: 'Invalid date' });
      const events = await getEvents(sql);
      events.push({ id: String(Date.now()), title: String(title).slice(0, 200), date, time: (time || '').slice(0, 50), description: (description || '').slice(0, 500) });
      await saveEvents(sql, events);
      return res.json({ success: true, events });
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
      const access = admin ? { ok: true } : await getAccess(sql, session.uid);
      if (!access) return res.status(403).json({ error: 'Lunch & Learn access required to RSVP' });
      const events = await getEvents(sql);
      // event_key targets a specific session; default to the next upcoming one
      const target = req.body.event_key
        ? events.find(e => e.date === req.body.event_key)
        : events.find(e => new Date(e.date) > new Date());
      if (!target) return res.status(400).json({ error: 'No upcoming session scheduled' });
      if (req.body.going) {
        await sql`INSERT INTO lnl_rsvps (user_id, event_key, created_at) VALUES (${session.uid}, ${target.date}, NOW()) ON CONFLICT (user_id, event_key) DO NOTHING`;
      } else {
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
