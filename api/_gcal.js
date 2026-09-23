import crypto from 'crypto';

// Google Calendar, reached as a service account with domain-wide delegation —
// it impersonates Dr. Merritt, so it sees her real availability and writes
// events that are genuinely hers. No OAuth token to refresh or re-consent.
//
// GOOGLE_SA_EMAIL  — the service account address
// GOOGLE_SA_KEY    — its private key (literal \n sequences are fine)
// GOOGLE_SUBJECT   — the account to act as (default gmerritt@nreuv.com)
// GOOGLE_CALENDAR_ID — where sessions are written (the GroundUp Sessions calendar)
// GOOGLE_BUSY_CALENDARS — comma-separated extra calendars to avoid clashing with

const SUBJECT = () => process.env.GOOGLE_SUBJECT || 'gmerritt@nreuv.com';
export const SESSION_CALENDAR = () => process.env.GOOGLE_CALENDAR_ID || '';
export const gcalConfigured = () => !!(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_KEY && SESSION_CALENDAR());

// Every calendar whose events should block a slot. Her main calendar is the
// point of this: sessions land on the GroundUp calendar, but nothing may be
// offered on top of something she is already doing.
export const busyCalendars = () => {
  const extra = String(process.env.GOOGLE_BUSY_CALENDARS || '').split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set([SUBJECT(), SESSION_CALENDAR(), ...extra])].filter(Boolean);
};

// The private key is copied out of a JSON file and pasted into a dashboard,
// which mangles it in predictable ways: the surrounding quotes come along, the
// \n escapes survive as literal backslash-n, or the whole thing arrives
// base64-encoded. OpenSSL rejects all of those with the same opaque
// "DECODER routines::unsupported", so normalise rather than expecting a
// perfect paste.
export function normalizeKey(raw) {
  let k = String(raw || '').trim();
  if (!k) return '';
  // Someone pasted the JSON value including its quotes.
  k = k.replace(/^["']|["']$/g, '').trim();
  // Whole key base64-encoded (a common way to dodge newline trouble).
  if (!/BEGIN [A-Z ]*PRIVATE KEY/.test(k) && /^[A-Za-z0-9+/=\s]+$/.test(k) && k.length > 200) {
    try {
      const decoded = Buffer.from(k.replace(/\s+/g, ''), 'base64').toString('utf8');
      if (/BEGIN [A-Z ]*PRIVATE KEY/.test(decoded)) k = decoded;
    } catch { /* leave it be */ }
  }
  // Escaped newlines, single or double escaped, and Windows line endings.
  k = k.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  // A key flattened onto one line: rebuild the 64-character body lines.
  if (/BEGIN [A-Z ]*PRIVATE KEY/.test(k) && !k.includes('\n')) {
    const m = k.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----(.*)-----END \1-----/);
    if (m) {
      const body = m[2].replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || '';
      k = `-----BEGIN ${m[1]}-----\n${body}\n-----END ${m[1]}-----\n`;
    }
  }
  // A copy that stopped at the last \n leaves the footer behind, which is
  // invalid PEM and fails identically to every other paste problem. If the
  // header is there and the footer isn't, put it back.
  const head = k.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----/);
  if (head && !new RegExp(`-----END ${head[1]}-----`).test(k)) {
    k = k.replace(/[\s-]*$/, '') + `\n-----END ${head[1]}-----`;
  }
  if (!k.endsWith('\n')) k += '\n';
  return k;
}

let cached = { token: null, exp: 0 };

async function token() {
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  const key = normalizeKey(process.env.GOOGLE_SA_KEY);
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: process.env.GOOGLE_SA_EMAIL,
    sub: SUBJECT(),
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).end().sign(key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('Calendar auth failed: ' + (d.error_description || d.error || 'unknown'));
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.token;
}

const api = async (path, init = {}) => {
  const res = await fetch('https://www.googleapis.com/calendar/v3' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error?.message || `Calendar API ${res.status}`);
  return d;
};

// What actually blocks a slot.
//
// Google's freeBusy call treats every all-day entry as solid busy time, so a
// week marked "Conference" or a multi-day trip removed every opening that week
// — far more than Dr. Merritt would consider unavailable. Reading the events
// themselves lets us skip the ones that shouldn't block a 45-minute call:
// all-day markers, events she has declined, and anything she set to Free.
//
// Set scheduling_rules.allDayBlocks = true to have all-day entries block again.
export async function freeBusy(fromIso, toIso, opts = {}) {
  const blocks = [];
  for (const id of busyCalendars()) {
    try {
      const d = await api(`/calendars/${encodeURIComponent(id)}/events?singleEvents=true&orderBy=startTime&maxResults=2500`
        + `&timeMin=${encodeURIComponent(fromIso)}&timeMax=${encodeURIComponent(toIso)}`);
      for (const ev of d.items || []) {
        if (ev.status === 'cancelled') continue;
        if (ev.transparency === 'transparent') continue;              // marked Free
        const me = (ev.attendees || []).find(a => a.self);
        if (me && me.responseStatus === 'declined') continue;          // she said no
        const isAllDay = !!ev.start?.date && !ev.start?.dateTime;
        if (isAllDay && !opts.allDayBlocks) continue;                  // a trip marker, not a meeting
        const start = Date.parse(ev.start?.dateTime || ev.start?.date);
        const end = Date.parse(ev.end?.dateTime || ev.end?.date);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
        // Multi-day entries put in with times — travel, a conference, a week
        // marked out — are not meetings either, and they were erasing entire
        // weeks. Nothing longer than half a day is treated as a commitment
        // that blocks a 45-minute call.
        const hours = (end - start) / 3600000;
        if (!opts.allDayBlocks && hours > (opts.maxBlockHours ?? 12)) continue;
        blocks.push([start, end]);
      }
    } catch (e) {
      // A calendar we can't read must not silently open her whole diary, so fall
      // back to freeBusy for that one rather than treating it as empty.
      try {
        const fb = await api('/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: fromIso, timeMax: toIso, items: [{ id }] }) });
        for (const cal of Object.values(fb.calendars || {})) for (const b of cal.busy || []) blocks.push([Date.parse(b.start), Date.parse(b.end)]);
      } catch { console.error('calendar unreadable:', id, e.message); }
    }
  }
  return blocks.sort((a, b) => a[0] - b[0]);
}

export async function createEvent({ summary, description, startIso, endIso, attendees, timeZone }) {
  return api(`/calendars/${encodeURIComponent(SESSION_CALENDAR())}/events?sendUpdates=all&conferenceDataVersion=1`, {
    method: 'POST',
    body: JSON.stringify({
      summary, description,
      start: { dateTime: startIso, timeZone }, end: { dateTime: endIso, timeZone },
      attendees: (attendees || []).map(email => ({ email })),
      // A session with no way to join is not a booking, so ask Google for a Meet
      // link rather than leaving both sides to work it out by email.
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      reminders: { useDefault: true },
    }),
  });
}

export async function deleteEvent(eventId) {
  if (!eventId) return;
  try { await api(`/calendars/${encodeURIComponent(SESSION_CALENDAR())}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: 'DELETE' }); }
  catch (e) { if (!/404|not found|deleted/i.test(e.message)) throw e; }
}

// ── Time zone maths ─────────────────────────────────────────────────────────
// Availability is set in Dr. Merritt's wall-clock time, so noon means noon in
// New York whether or not daylight saving is on. Node has no zoned-time type,
// so convert through the offset the zone actually had at that instant.

export function zoneOffset(at, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = f.formatToParts(at).reduce((a, x) => (a[x.type] = x.value, a), {});
  return Date.UTC(p.year, p.month - 1, p.day, p.hour === '24' ? 0 : p.hour, p.minute, p.second) - at.getTime();
}

// A wall-clock time in `tz` → the real instant. Applied twice so a slot sitting
// on a daylight-saving boundary lands on the right side of it.
export function wallToUtc(y, m, d, hh, mm, tz) {
  let guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  for (let i = 0; i < 2; i++) guess = Date.UTC(y, m - 1, d, hh, mm, 0) - zoneOffset(new Date(guess), tz);
  return new Date(guess);
}

// The calendar date in `tz` for an instant — needed to know which weekday's
// hours apply, since that is a question about her day, not about UTC.
export function partsIn(at, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = f.formatToParts(at).reduce((a, x) => (a[x.type] = x.value, a), {});
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, dow };
}
