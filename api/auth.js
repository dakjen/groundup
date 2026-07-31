import { neon } from '@neondatabase/serverless';
import { signToken, getSession, hashPassword, verifyPassword } from './_utils.js';
import { sendEmail, addContact, welcomeEmail, resetEmail, siteUrl } from './_email.js';
import { verifyToken } from './_utils.js';

const PUBLIC_FIELDS = 'id, name, email, tier, role, membership_status, created_at';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const action = req.query.action || (req.body && req.body.action);

  try {
    // GET /api/auth  → current session's user
    if (req.method === 'GET') {
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Not signed in' });
      const [user] = await sql`SELECT id, name, email, tier, role, membership_status, free_lesson_key, lnl_discount_until, created_at FROM users WHERE id = ${session.uid}`;
      if (!user) return res.status(401).json({ error: 'Account not found' });
      // Active one-time passes: course_id 'all' or 'mc1'..'mc4', unexpired
      user.entitlements = await sql`SELECT course_id, expires_at FROM entitlements WHERE user_id = ${user.id} AND (expires_at IS NULL OR expires_at > NOW())`;
      const allowance = user.tier === 'Elite' ? 3 : user.tier === 'Premium' ? 1 : 0;
      const [{ used }] = await sql`SELECT COUNT(*)::int AS used FROM session_requests WHERE user_id = ${user.id} AND status != 'declined'`;
      user.sessions = { total: allowance, used, remaining: Math.max(0, allowance - used) };
      // Paid sessions still needing a calendar slot
      user.bookings = await sql`SELECT id, item, label, status, booked_at, created_at FROM bookings
        WHERE user_id = ${user.id} AND status IN ('awaiting_booking','booked') ORDER BY created_at DESC LIMIT 10`;
      const [bl] = await sql`SELECT value FROM settings WHERE key = 'advisor_call_link'`;
      user.booking_link = bl?.value || null;
      // Suspended accounts keep the login but lose entitlements until payment clears
      if (user.membership_status !== 'active') {
        user.suspended = true;
        user.entitlements = [];
      }
      return res.json({ user });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Admin env login (folded in from /api/login)
    if (action === 'admin_login') {
      const { email, password } = req.body;
      if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        try { const { ensureSchema } = await import('./_migrate.js'); await ensureSchema(); } catch (e) { console.error('migration failed', e); }
        return res.json({ success: true, token: signToken({ role: 'admin' }) });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Site password gate (folded in from /api/site-auth)
    if (action === 'site_gate') {
      if (req.body.password === process.env.SITE_PASSWORD) return res.json({ success: true });
      return res.status(401).json({ error: 'Wrong password' });
    }

    if (action === 'signup') {
      // Pre-launch: no signups until the launch moment passes (waitlist only)
      const [launchRow] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
      if (!launchRow?.value || new Date(launchRow.value).getTime() > Date.now()) {
        return res.status(403).json({ error: "We haven't launched yet — join the waitlist to be first in." });
      }
      const { name, email, password, tier } = req.body;
      if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const cleanEmail = String(email).trim().toLowerCase();
      const safeTier = ['Free', 'Basic', 'Premium', 'Elite'].includes(tier) ? tier : 'Free';
      const [user] = await sql`
        INSERT INTO users (name, email, tier, password_hash, role, created_at)
        VALUES (${String(name).trim()}, ${cleanEmail}, ${safeTier}, ${hashPassword(password)}, 'member', NOW())
        ON CONFLICT (email) DO NOTHING
        RETURNING id, name, email, tier, role, membership_status, free_lesson_key, created_at
      `;
      if (!user) return res.status(409).json({ error: 'An account with that email already exists' });
      const token = signToken({ uid: user.id, role: 'member' });
      // Welcome email + Brevo contact — never block signup on email delivery
      const mail = welcomeEmail(user.name, user.tier);
      await Promise.allSettled([
        sendEmail(user.email, mail.subject, mail.html),
        addContact(user.email, user.name, { TIER: user.tier }),
      ]);
      return res.status(201).json({ user, token });
    }

    if (action === 'login') {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
      const cleanEmail = String(email).trim().toLowerCase();
      const [user] = await sql`SELECT * FROM users WHERE email = ${cleanEmail}`;
      if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      const token = signToken({ uid: user.id, role: user.role === 'admin' ? 'admin' : 'member' });
      const { password_hash, ...safe } = user;
      safe.entitlements = await sql`SELECT course_id, expires_at FROM entitlements WHERE user_id = ${user.id} AND (expires_at IS NULL OR expires_at > NOW())`;
      return res.json({ user: safe, token });
    }

    // Forgot password: always succeed (no account enumeration); email a 1-hour reset link
    if (action === 'forgot_password') {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email required' });
      const cleanEmail = String(email).trim().toLowerCase();
      const [user] = await sql`SELECT id, name, email FROM users WHERE email = ${cleanEmail}`;
      if (user) {
        const token = signToken({ uid: user.id, purpose: 'reset' }, 1000 * 60 * 60);
        const mail = resetEmail(user.name, `${siteUrl()}/?reset=${encodeURIComponent(token)}`);
        await sendEmail(user.email, mail.subject, mail.html);
      }
      return res.json({ success: true });
    }

    // Complete a reset from the emailed link
    if (action === 'reset_password') {
      const { token, new_password } = req.body;
      if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const payload = verifyToken(token);
      if (!payload || payload.purpose !== 'reset' || !payload.uid) {
        return res.status(400).json({ error: 'That reset link is invalid or expired — request a new one' });
      }
      await sql`UPDATE users SET password_hash = ${hashPassword(new_password)} WHERE id = ${payload.uid}`;
      return res.json({ success: true });
    }

    // Request one of your included 1-on-1 sessions (Premium/Elite benefit)
    if (action === 'request_session') {
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Not signed in' });
      const [u] = await sql`SELECT id, name, email, tier FROM users WHERE id = ${session.uid}`;
      if (!u) return res.status(401).json({ error: 'Account not found' });
      const allowance = u.tier === 'Elite' ? 3 : u.tier === 'Premium' ? 1 : 0;
      const [{ used }] = await sql`SELECT COUNT(*)::int AS used FROM session_requests WHERE user_id = ${u.id} AND status != 'declined'`;
      if (used >= allowance) return res.status(400).json({ error: 'No sessions remaining on your plan' });
      const note = (req.body.note || '').trim().slice(0, 2000);
      await sql`INSERT INTO session_requests (user_id, note, created_at) VALUES (${u.id}, ${note}, NOW())`;
      // Alert the team by email — they reply to schedule
      await sendEmail(
        process.env.ADMIN_EMAIL || 'info@nreuv.com',
        `Session request from ${u.name} (${u.tier})`,
        `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">1-on-1 session request</h2>
         <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${u.name}</strong> (${u.email}, ${u.tier}) requested one of their included sessions.</p>
         ${note ? `<p style="color:#a89080;font-size:14px;line-height:1.8;">What they want to cover: ${note}</p>` : ''}
         <p style="color:#a89080;font-size:14px;line-height:1.8;">Reply to them directly or send a meeting email from the back office.</p>`
      );
      return res.status(201).json({ success: true });
    }

    // Member marks a paid session as booked
    if (action === 'mark_booked') {
      const session = getSession(req);
      if (!session?.uid) return res.status(401).json({ error: 'Not signed in' });
      await sql`UPDATE bookings SET status = 'booked', booked_at = NOW() WHERE id = ${Number(req.body.id)} AND user_id = ${session.uid}`;
      return res.json({ success: true });
    }

    // Logged-in password change (members and team alike)
    if (action === 'change_password') {
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Not signed in' });
      const { current_password, new_password } = req.body;
      if (!current_password || !new_password) return res.status(400).json({ error: 'Current and new password required' });
      if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
      const [user] = await sql`SELECT id, password_hash FROM users WHERE id = ${session.uid}`;
      if (!user || !verifyPassword(current_password, user.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      await sql`UPDATE users SET password_hash = ${hashPassword(new_password)} WHERE id = ${user.id}`;
      return res.json({ success: true });
    }

    // Free plan: claim the single free lesson. Only succeeds if none is claimed yet
    // (or the same one is re-claimed), so it can never be switched later.
    if (action === 'claim_free_lesson') {
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Not signed in' });
      const { key } = req.body;
      if (!key || !/^mc\d+:\d+$/.test(key)) return res.status(400).json({ error: 'Invalid lesson key' });
      const [user] = await sql`
        UPDATE users SET free_lesson_key = ${key}
        WHERE id = ${session.uid} AND (free_lesson_key IS NULL OR free_lesson_key = ${key})
        RETURNING id, name, email, tier, role, membership_status, free_lesson_key, created_at
      `;
      if (!user) return res.status(409).json({ error: 'Free lesson already used' });
      return res.json({ user });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
