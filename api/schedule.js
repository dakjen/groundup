import { neon } from '@neondatabase/serverless';
import { getSession, getAdmin, benefitGate } from './_utils.js';
import { sendEmail, siteUrl, firstName } from './_email.js';
import { gcalConfigured, freeBusy, createEvent, deleteEvent, wallToUtc, partsIn } from './_gcal.js';

// Booking a session with Dr. Merritt, through our own server rather than a
// public calendar link. That is the point: a slot can only be taken against a
// booking this person paid for, so a forwarded URL buys nobody her time.
//
// Availability is read from every calendar she keeps, and the event is written
// to the GroundUp Sessions calendar with her invited, so it shows on her main
// calendar without her sessions being mixed into it.

const TZ = 'America/New_York';

// Her rules, matching the appointment schedule she set up. Overridable from
// settings so hours can move without a deploy.
const DEFAULTS = {
  duration: 45,
  buffer: 15,                 // gap kept either side of an existing commitment
  windowDays: 60,             // how far ahead the calendar opens
  minBusinessDays: 5,         // nothing bookable inside five business days
  hours: {                    // weekday → [startHour, endHour] in her time
    0: null,                  // Sunday
    1: [12, 16], 2: [12, 16], 3: [12, 16], 4: [12, 16], 5: [12, 16],
    6: [13, 16],              // Saturday
  },
};

async function rules(sql) {
  try {
    const [row] = await sql`SELECT value FROM settings WHERE key = 'scheduling_rules'`;
    return row?.value ? { ...DEFAULTS, ...JSON.parse(row.value) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

// Five business days means five *working* days, not a week of calendar time —
// booking on Friday shouldn't quietly allow the following Wednesday.
function afterBusinessDays(from, n) {
  const at = new Date(from);
  let left = n;
  while (left > 0) {
    at.setUTCDate(at.getUTCDate() + 1);
    const dow = partsIn(at, TZ).dow;
    if (dow !== 0 && dow !== 6) left--;
  }
  return at;
}

function slotsFor(dayStartUtc, R, busy, notBefore, now) {
  const { dow, y, m, d } = partsIn(dayStartUtc, TZ);
  const hours = R.hours[dow];
  if (!hours) return [];
  const out = [];
  const bufMs = R.buffer * 60000;
  for (let mins = hours[0] * 60; mins + R.duration <= hours[1] * 60; mins += R.duration) {
    const start = wallToUtc(y, m, d, Math.floor(mins / 60), mins % 60, TZ);
    const end = new Date(start.getTime() + R.duration * 60000);
    if (start < notBefore || start < now) continue;
    // A slot is free only if nothing she already has overlaps it, buffer included.
    const clash = busy.some(([bs, be]) => start.getTime() < be + bufMs && end.getTime() > bs - bufMs);
    if (!clash) out.push({ start: start.toISOString(), end: end.toISOString() });
  }
  return out;
}

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const session = getSession(req);
  const admin = getAdmin(req);
  if (!session?.uid && !admin) return res.status(401).json({ error: 'Not signed in' });
  if (!gcalConfigured()) return res.status(503).json({ error: 'Scheduling is not connected yet.', unconfigured: true });

  try {
    const R = await rules(sql);
    const now = new Date();
    const notBefore = afterBusinessDays(now, R.minBusinessDays);
    const until = new Date(now.getTime() + R.windowDays * 864e5);

    // ── Open slots ──
    if (req.method === 'GET') {
      const busy = await freeBusy(notBefore.toISOString(), until.toISOString());
      const days = [];
      for (let cursor = new Date(notBefore); cursor < until; cursor = new Date(cursor.getTime() + 864e5)) {
        const slots = slotsFor(cursor, R, busy, notBefore, now);
        if (slots.length) {
          const { y, m, d } = partsIn(cursor, TZ);
          days.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, slots });
        }
      }
      return res.json({ timeZone: TZ, duration: R.duration, earliest: notBefore.toISOString(), days });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ── Take a slot ──
    if (req.body?.action === 'book') {
      const startIso = String(req.body.start || '');
      if (isNaN(Date.parse(startIso))) return res.status(400).json({ error: 'Pick a time first.' });

      let b;
      if (req.body.included) {
        // An advisory call the plan already includes. It schedules exactly like
        // a paid one — the allowance is what gets checked instead of a payment.
        const [me] = await sql`SELECT tier, role, comped, tier_since FROM users WHERE id = ${session.uid}`;
        const allowance = me?.tier === 'Elite' ? 3 : 0;
        if (!allowance) return res.status(403).json({ error: 'Advisory calls are included with the Owner plan.' });
        const gate = await benefitGate(sql, { ...me, id: session.uid });
        if (gate.active) return res.status(403).json({ error: `Advisory calls open on ${new Date(gate.until).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.` });
        const [{ used }] = await sql`SELECT COUNT(*)::int AS used FROM session_requests WHERE user_id = ${session.uid} AND status != 'declined'`;
        if (used >= allowance) return res.status(403).json({ error: "You've used this year's advisory calls. You can still book a single session any time." });
        // Draw the call down and give it a booking of its own, so it sits beside
        // paid sessions with the same brief and the same documents.
        await sql`INSERT INTO session_requests (user_id, note, status, created_at)
          VALUES (${session.uid}, 'Scheduled from GroundUp', 'scheduled', NOW())`;
        [b] = await sql`INSERT INTO bookings (user_id, item, label, amount, status, created_at)
          VALUES (${session.uid}, 'advisory_included', 'Advisory Call (included in Owner)', 0, 'awaiting_booking', NOW())
          RETURNING *`;
      } else {
        const bookingId = Number(req.body.booking_id);
        if (!bookingId) return res.status(400).json({ error: 'Pick a session first.' });
        // The whole reason this runs on our server: the slot must belong to a
        // session this person actually paid for.
        [b] = await sql`SELECT * FROM bookings WHERE id = ${bookingId} AND user_id = ${session.uid}`;
        if (!b) return res.status(404).json({ error: "We couldn't find that session on your account." });
        if (b.scheduled_at) return res.status(409).json({ error: 'That session already has a time. Cancel it first to move it.' });
      }

      const start = new Date(startIso);
      const end = new Date(start.getTime() + R.duration * 60000);
      if (start < notBefore) return res.status(400).json({ error: `Sessions need at least ${R.minBusinessDays} business days' notice.` });

      // Re-check against the live calendar — someone else may have taken it
      // between the page loading and this request.
      const busy = await freeBusy(new Date(start.getTime() - 3600e3).toISOString(), new Date(end.getTime() + 3600e3).toISOString());
      const bufMs = R.buffer * 60000;
      if (busy.some(([bs, be]) => start.getTime() < be + bufMs && end.getTime() > bs - bufMs)) {
        return res.status(409).json({ error: 'That time was just taken — please pick another.' });
      }

      const [u] = await sql`SELECT name, email FROM users WHERE id = ${session.uid}`;
      const files = await sql`SELECT title, url FROM booking_files WHERE booking_id = ${b.id} ORDER BY created_at`;
      const desc = [
        `${b.label || b.item} booked through GroundUp.`,
        ``,
        `Member: ${u?.name || ''} <${u?.email || ''}>`,
        b.brief ? `\nWhat they want to cover:\n${b.brief}` : `\nNo brief written yet.`,
        files.length ? `\nDocuments:\n${files.map(f => `• ${f.title}${f.url ? ' — ' + f.url : ''}`).join('\n')}` : '',
        `\nTheir workspace: ${siteUrl()}/membership#meetings`,
      ].filter(Boolean).join('\n');

      // Gina is invited so it lands on her own calendar too, and the member gets
      // the invite and the Meet link without anyone sending anything by hand.
      const ev = await createEvent({
        summary: `${b.label || 'GroundUp session'} — ${u?.name || 'member'}`,
        description: desc,
        startIso: start.toISOString(), endIso: end.toISOString(),
        attendees: [process.env.GOOGLE_SUBJECT || 'gmerritt@nreuv.com', u?.email].filter(Boolean),
        timeZone: TZ,
      });

      const when = start.toLocaleString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      const meet = ev.hangoutLink || ev.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || '';
      // htmlLink opens the event in Google Calendar — the member gets an invite,
      // but a link they can click beats hunting for the email later.
      await sql`UPDATE bookings SET scheduled_at = ${start.toISOString()}, status = 'booked',
        booked_at = NOW(), calendar_event_id = ${ev.id || null},
        meet_link = ${meet || null}, event_link = ${ev.htmlLink || null} WHERE id = ${b.id}`;
      if (u?.email) {
        sendEmail(u.email, `Booked — ${b.label || 'your session'} on ${when}`,
          `<h2 style="color:#161616;font-size:23px;margin:0 0 14px;">You're booked, ${firstName(u.name)}.</h2>
           <p style="color:#444444;font-size:14px;line-height:1.8;margin:0 0 6px;"><strong style="color:#161616;">${b.label || 'Your session'}</strong></p>
           <p style="color:#444444;font-size:14px;line-height:1.8;margin:0 0 18px;">${when}</p>
           ${meet ? `<a href="${meet}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin:0 8px 10px 0;">Join the meeting</a>` : ''}
           ${ev.htmlLink ? `<a href="${ev.htmlLink}" style="display:inline-block;background:#ffffff;color:#b80101;border:1px solid #b80101;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin:0 8px 10px 0;">Add to your calendar</a>` : ''}
           <a href="${siteUrl()}/membership#meetings" style="display:inline-block;background:#ffffff;color:#b80101;border:1px solid #b80101;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;">Your meetings</a>
           <p style="color:#444444;font-size:14px;line-height:1.8;margin:22px 0 0;">A calendar invite is on its way. ${b.brief ? 'Dr. Merritt has your brief.' : '<strong style="color:#161616;">Add your brief before the session</strong> — it\'s what makes the 45 minutes count.'}</p>`
        ).catch(() => {});
      }
      sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net', `Session booked — ${u?.name || 'member'}, ${when}`,
        `<p style="color:#444444;font-size:14px;line-height:1.8;"><strong style="color:#161616;">${u?.name || 'A member'}</strong> booked <strong style="color:#161616;">${b.label || 'a session'}</strong> for ${when}.${b.brief ? ' Their brief is on the calendar invite.' : ' No brief yet.'}</p>`
      ).catch(() => {});

      return res.json({ success: true, scheduled_at: start.toISOString(), meet_link: meet || null, event_link: ev.htmlLink || null });
    }

    // ── Give a slot back ──
    if (req.body?.action === 'cancel') {
      const [b] = await sql`SELECT * FROM bookings WHERE id = ${Number(req.body.booking_id)} AND user_id = ${session.uid}`;
      if (!b) return res.status(404).json({ error: 'Session not found' });
      await deleteEvent(b.calendar_event_id);
      if (b.item === 'advisory_included') {
        // Hand the allowance back rather than charging someone a call for a
        // meeting that never happened.
        await sql`DELETE FROM session_requests WHERE id = (
          SELECT id FROM session_requests WHERE user_id = ${session.uid} AND status = 'scheduled' ORDER BY id DESC LIMIT 1)`;
        await sql`DELETE FROM bookings WHERE id = ${b.id}`;
        return res.json({ success: true, released: true });
      }
      await sql`UPDATE bookings SET scheduled_at = NULL, calendar_event_id = NULL, status = 'awaiting_booking' WHERE id = ${b.id}`;
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('schedule error', e);
    return res.status(500).json({ error: e.message || 'Scheduling failed' });
  }
}
