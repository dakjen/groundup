import { neon } from '@neondatabase/serverless';
import { getSession, getAdmin, benefitGate } from './_utils.js';
import { sendEmail } from './_email.js';

// A paid 1:1 with Dr. Merritt is a small engagement, not a receipt. It carries a
// time, a brief, and the documents she needs to read beforehand. Retainers keep
// their own workspace (api/retainers.js); this is the same idea at one-meeting
// scale, and it lives on the member page rather than behind the advisory door.
//
// Everything here is scoped to the signed-in member's own bookings. Admins read
// any booking, because Dr. Merritt has to see the brief to prepare.

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const session = getSession(req);
  const admin = getAdmin(req);
  if (!session?.uid && !admin) return res.status(401).json({ error: 'Not signed in' });

  // Only ever act on a booking this person owns (admins excepted).
  const own = async (id) => {
    const [b] = admin
      ? await sql`SELECT * FROM bookings WHERE id = ${Number(id)}`
      : await sql`SELECT * FROM bookings WHERE id = ${Number(id)} AND user_id = ${session.uid}`;
    return b || null;
  };

  try {
    if (req.method === 'GET') {
      const uid = admin && req.query.user_id ? Number(req.query.user_id) : session?.uid;
      if (!uid) return res.json({ bookings: [] });
      const rows = await sql`SELECT id, item, label, amount, status, booked_at, scheduled_at,
        brief, brief_at, meet_link, event_link, calendar_event_id, created_at
        FROM bookings WHERE user_id = ${uid} ORDER BY created_at DESC`;
      const files = rows.length
        ? await sql`SELECT id, booking_id, title, url, kind, created_at FROM booking_files
            WHERE booking_id = ANY(${rows.map(r => r.id)}) ORDER BY created_at`
        : [];
      // Included advisory calls come back here too. They were read from the
      // member object cached in the browser at sign-in, which never contains
      // them — so an Owner with three calls saw nothing at all.
      const [me] = await sql`SELECT tier, role, comped, tier_since FROM users WHERE id = ${uid}`;
      const allowance = me?.tier === 'Elite' ? 3 : 0;
      const [{ used }] = await sql`SELECT COUNT(*)::int AS used FROM session_requests
        WHERE user_id = ${uid} AND status != 'declined'`;
      return res.json({
        bookings: rows.map(b => ({ ...b, files: files.filter(f => f.booking_id === b.id) })),
        credits: { total: allowance, used, remaining: Math.max(0, allowance - used) },
        gate: await benefitGate(sql, me ? { ...me, id: uid } : null),
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { action, id } = req.body || {};
    const booking = id ? await own(id) : null;
    if (id && !booking) return res.status(404).json({ error: 'Booking not found' });

    // What they want Dr. Merritt to look at. Saved to the database — this used
    // to live in browser storage, which meant she never actually received it.
    if (action === 'save_brief') {
      const brief = String(req.body.brief ?? '').trim().slice(0, 5000);
      await sql`UPDATE bookings SET brief = ${brief || null}, brief_at = ${brief ? new Date().toISOString() : null} WHERE id = ${booking.id}`;
      return res.json({ success: true, brief, brief_at: brief ? new Date().toISOString() : null });
    }

    // When the meeting is. Entered after booking, since the calendar isn't wired in.
    if (action === 'set_scheduled') {
      const at = req.body.scheduled_at;
      if (at && isNaN(Date.parse(at))) return res.status(400).json({ error: 'That date doesn\'t look right.' });
      await sql`UPDATE bookings SET scheduled_at = ${at || null},
        status = ${at ? 'booked' : booking.status}, booked_at = COALESCE(booked_at, ${at ? new Date().toISOString() : null})
        WHERE id = ${booking.id}`;
      return res.json({ success: true, scheduled_at: at || null });
    }

    if (action === 'add_file') {
      const title = String(req.body.title ?? '').trim().slice(0, 200);
      const url = String(req.body.url ?? '').trim();
      if (!title) return res.status(400).json({ error: 'Give it a name so Dr. Merritt knows what it is.' });
      if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'That link doesn\'t look right — include https://' }); } }
      const [f] = await sql`INSERT INTO booking_files (booking_id, title, url, kind, uploaded_by, created_at)
        VALUES (${booking.id}, ${title}, ${url || null}, ${req.body.kind || 'link'}, ${session?.uid || null}, NOW())
        RETURNING id, booking_id, title, url, kind, created_at`;
      // She prepares from these, so tell her one arrived rather than hoping she looks.
      const [u] = await sql`SELECT name, email FROM users WHERE id = ${booking.user_id}`;
      sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
        `${u?.name || 'A member'} added a document for their ${booking.label || 'session'}`,
        `<p style="color:#444444;font-size:14px;line-height:1.8;"><strong style="color:#161616;">${u?.name || 'A member'}</strong> (${u?.email || ''}) attached <strong style="color:#161616;">${title}</strong> ahead of their <strong style="color:#161616;">${booking.label || 'session'}</strong>.</p>`
      ).catch(() => {});
      return res.status(201).json(f);
    }

    if (action === 'remove_file') {
      await sql`DELETE FROM booking_files WHERE id = ${Number(req.body.file_id)} AND booking_id = ${booking.id}`;
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('bookings error', e);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
