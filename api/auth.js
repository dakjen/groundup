import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';
import { signToken, getSession, hashPassword, verifyPassword, benefitGate } from './_utils.js';
import { sendEmail, addContact, addLnlContact, welcomeEmail, resetEmail, siteUrl } from './_email.js';
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
      const [user] = await sql`SELECT id, name, email, tier, role, membership_status, free_lesson_key, lnl_discount_until, comped, badges, referral_code, referred_by, tier_since, ip_agreed_at, avatar_url, headline, bio, company, title, location, created_at FROM users WHERE id = ${session.uid}`;
      if (!user) return res.status(401).json({ error: 'Account not found' });
      // Active one-time passes: course_id 'all' or 'mc1'..'mc7', unexpired
      user.entitlements = await sql`SELECT course_id, expires_at, source FROM entitlements WHERE user_id = ${user.id} AND (expires_at IS NULL OR expires_at > NOW())`;
      // 14-day one-course trial: earned by being first-10 on the waitlist or by
      // arriving through a member's referral link. One per account, ever.
      const badgeList = Array.isArray(user.badges) ? user.badges : [];
      const trialEligible = badgeList.includes('first10') || !!user.referred_by;
      const [usedTrial] = await sql`SELECT course_id, expires_at FROM entitlements WHERE user_id = ${user.id} AND source = 'referral_trial' LIMIT 1`;
      user.trial = usedTrial ? { course_id: usedTrial.course_id, expires_at: usedTrial.expires_at } : null;
      user.benefit_gate = await benefitGate(sql, user);
      user.trial_available = trialEligible && !usedTrial && user.membership_status === 'active';
      const allowance = user.tier === 'Elite' ? 3 : 0;
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

    // ── Rate limiting (DB-backed — survives serverless cold starts) ──
    // Failed attempts are recorded per key; too many inside the window → 429.
    const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const tooMany = async (key, max, windowMin) => {
      try {
        const [row] = await sql`SELECT COUNT(*)::int AS n FROM auth_attempts WHERE key = ${key} AND created_at > NOW() - (${windowMin} * interval '1 minute')`;
        return (row?.n || 0) >= max;
      } catch { return false; } // never lock everyone out if the table is missing
    };
    const recordFail = async (key) => {
      try {
        await sql`INSERT INTO auth_attempts (key, created_at) VALUES (${key}, NOW())`;
        if (Math.floor(Date.now() / 1000) % 20 === 0) await sql`DELETE FROM auth_attempts WHERE created_at < NOW() - interval '1 day'`;
      } catch { /* best effort */ }
    };
    const clearFails = async (key) => { try { await sql`DELETE FROM auth_attempts WHERE key = ${key}`; } catch { /* best effort */ } };
    const LIMITED = (mins) => res.status(429).json({ error: `Too many attempts — please wait ${mins} minutes and try again.` });

    // Admin env login (folded in from /api/login)
    if (action === 'admin_login') {
      if (await tooMany(`admin:${clientIp}`, 5, 15)) return LIMITED(15);
      const { email, password } = req.body;
      if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        try { const { ensureSchema } = await import('./_migrate.js'); await ensureSchema(); } catch (e) { console.error('migration failed', e); }
        return res.json({ success: true, token: signToken({ role: 'admin' }) });
      }
      await recordFail(`admin:${clientIp}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Admin: which settings are configured on the server (presence only, never values)
    if (action === 'config_check') {
      const { getAdmin } = await import('./_utils.js');
      if (!getAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
      const has = (k) => !!(process.env[k] && String(process.env[k]).trim());
      return res.json({
        config: [
          { key: 'DATABASE_URL', label: 'Database', ok: has('DATABASE_URL'), why: 'Everything depends on this' },
          { key: 'SESSION_SECRET', label: 'Session secret', ok: has('SESSION_SECRET'), why: 'Secure logins' },
          { key: 'SITE_URL', label: 'Site URL', ok: has('SITE_URL'), why: 'Email links & share image' },
          { key: 'STRIPE_SECRET_KEY', label: 'Stripe key', ok: has('STRIPE_SECRET_KEY'), why: 'Taking payments' },
          { key: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe webhook', ok: has('STRIPE_WEBHOOK_SECRET'), why: 'Unlocking access after payment' },
          { key: 'NREUV_CONNECT_ACCOUNT', label: 'NREUV split account', ok: has('NREUV_CONNECT_ACCOUNT'), why: 'Auto-paying NREUV its share' },
          { key: 'BREVO_API_KEY', label: 'Email sending', ok: has('BREVO_API_KEY'), why: 'All outgoing email' },
          { key: 'BREVO_SENDER_EMAIL', label: 'Verified sender', ok: has('BREVO_SENDER_EMAIL'), why: 'Email deliverability' },
          { key: 'ADMIN_EMAIL', label: 'Team alert inbox', ok: has('ADMIN_EMAIL'), why: 'Where team alerts go' },
          { key: 'BLOB_READ_WRITE_TOKEN', label: 'File uploads', ok: has('BLOB_READ_WRITE_TOKEN'), why: 'Lesson PDF uploads' },
        ],
      });
    }

    // Site password gate (folded in from /api/site-auth)
    if (action === 'site_gate') {
      if (await tooMany(`gate:${clientIp}`, 10, 15)) return LIMITED(15);
      if (req.body.password === process.env.SITE_PASSWORD) return res.json({ success: true });
      await recordFail(`gate:${clientIp}`);
      return res.status(401).json({ error: 'Wrong password' });
    }

    if (action === 'signup') {
      // Pre-launch: no signups until the launch moment passes (waitlist only)
      const [launchRow] = await sql`SELECT value FROM settings WHERE key = 'launch_at'`;
      if (!launchRow?.value || new Date(launchRow.value).getTime() > Date.now()) {
        return res.status(403).json({ error: "We haven't launched yet — join the waitlist to be first in." });
      }
      const { name, email, password } = req.body;
      if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const cleanEmail = String(email).trim().toLowerCase();
      // Everyone signs up Free. A paid tier is granted in exactly two places:
      // Stripe fulfillment after a real payment (api/stripe.js), or an admin
      // manually via the team panel (api/users.js). Never from this request —
      // the client used to send a tier here, which let anyone claim Elite free.
      const [user] = await sql`
        INSERT INTO users (name, email, tier, password_hash, role, ip_agreed_at, created_at)
        VALUES (${String(name).trim()}, ${cleanEmail}, 'Free', ${hashPassword(password)}, 'member', NOW(), NOW())
        ON CONFLICT (email) DO NOTHING
        RETURNING id, name, email, tier, role, membership_status, free_lesson_key, created_at
      `;
      if (!user) return res.status(409).json({ error: 'An account with that email already exists' });
      const token = signToken({ uid: user.id, role: 'member' });
      // Founding 25 (first 25 on the Elite Insider waitlist): a free first YEAR of
      // Lunch & Learns attaches to the account the moment it's created — any plan,
      // including Free — plus the founding25 badge that follows them everywhere.
      let founding = false;
      try {
        const [wl] = await sql`SELECT id, founding_lnl, first10 FROM waitlist WHERE email = ${cleanEmail} LIMIT 1`;
        if (wl?.founding_lnl) {
          founding = true;
          await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at)
            VALUES (${user.id}, 'lunchlearn', 'founding25', NOW() + interval '1 year', NOW())`;
          await sql`UPDATE users SET badges = COALESCE(badges, '[]'::jsonb) || '["founding25"]'::jsonb WHERE id = ${user.id}`;
        }
        // First 10 on the waitlist: their own 14-day one-course trial (claimed on
        // the course of their choice) plus a personal referral link to share.
        if (wl?.first10) {
          // Personal, name-based referral code: "dakotah-jennifer" — with a
          // numeric suffix only if two people share the exact name
          const slug = String(user.name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || ('member-' + user.id);
          let code = slug;
          for (let n = 2; n < 50; n++) {
            const [taken] = await sql`SELECT id FROM users WHERE LOWER(referral_code) = ${code} AND id != ${user.id}`;
            if (!taken) break;
            code = `${slug}-${n}`;
          }
          await sql`UPDATE users SET badges = COALESCE(badges, '[]'::jsonb) || '["first10"]'::jsonb, referral_code = ${code} WHERE id = ${user.id}`;
        }
      } catch (e) { console.error('waitlist perk grant failed', e.message); }
      // Came through a member's referral link → eligible for the same 14-day trial
      try {
        const ref = (req.body.ref || '').trim().toLowerCase();
        if (ref) {
          const [referrer] = await sql`SELECT id FROM users WHERE LOWER(referral_code) = ${ref}`;
          if (referrer && referrer.id !== user.id) {
            await sql`UPDATE users SET referred_by = ${referrer.id} WHERE id = ${user.id}`;
          }
        }
      } catch (e) { console.error('referral link failed', e.message); }
      // Welcome email + Brevo contact — never block signup on email delivery
      const mail = welcomeEmail(user.name, user.tier);
      await Promise.allSettled([
        sendEmail(user.email, mail.subject, mail.html),
        addContact(user.email, user.name, { TIER: user.tier }),
        ...(founding ? [addLnlContact(user.email, user.name)] : []),
      ]);
      return res.status(201).json({ user, token });
    }

    if (action === 'login') {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
      const cleanEmail = String(email).trim().toLowerCase();
      // 5 failed tries per account / 15 min; 20 per IP catches spray attacks
      if (await tooMany(`login:${cleanEmail}`, 5, 15)) return LIMITED(15);
      if (await tooMany(`loginip:${clientIp}`, 20, 15)) return LIMITED(15);
      const [user] = await sql`SELECT * FROM users WHERE email = ${cleanEmail}`;
      if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
        await recordFail(`login:${cleanEmail}`);
        await recordFail(`loginip:${clientIp}`);
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      await clearFails(`login:${cleanEmail}`); // a good login resets the account's counter
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
      // Every request counts here (prevents reset-email spam): 3/hr per address, 10/hr per IP
      if (await tooMany(`forgot:${cleanEmail}`, 3, 60)) return LIMITED(60);
      if (await tooMany(`forgotip:${clientIp}`, 10, 60)) return LIMITED(60);
      await recordFail(`forgot:${cleanEmail}`);
      await recordFail(`forgotip:${clientIp}`);
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
      if (await tooMany(`reset:${clientIp}`, 10, 60)) return LIMITED(60);
      const { token, new_password } = req.body;
      if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const payload = verifyToken(token);
      if (!payload || payload.purpose !== 'reset' || !payload.uid) {
        await recordFail(`reset:${clientIp}`);
        return res.status(400).json({ error: 'That reset link is invalid or expired — request a new one' });
      }
      await sql`UPDATE users SET password_hash = ${hashPassword(new_password)} WHERE id = ${payload.uid}`;
      return res.json({ success: true });
    }

    // Request one of your included 1-on-1 sessions (Premium/Elite benefit)
    if (action === 'request_session') {
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Not signed in' });
      const [u] = await sql`SELECT id, name, email, tier, role, comped, tier_since FROM users WHERE id = ${session.uid}`;
      if (!u) return res.status(401).json({ error: 'Account not found' });
      const gate = await benefitGate(sql, u);
      if (gate.active) return res.status(403).json({ error: 'Advisory calls unlock after four months of continuous membership — yours open on ' + new Date(gate.until).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) + '.' });
      const allowance = u.tier === 'Elite' ? 3 : 0;
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

    // Content-capture signals from lesson pages (PrintScreen key, blocked
    // copy/print attempts). Logged per user; the team is emailed at most once
    // per user per day. NOTE: macOS/iOS screenshots are invisible to web pages —
    // this catches what a browser CAN see.
    if (action === 'capture_event') {
      const session = getSession(req);
      if (!session || !session.uid) return res.json({ success: true });
      const kind = String(req.body.kind || 'unknown').slice(0, 40);
      const where = String(req.body.where || '').slice(0, 120);
      const [recent] = await sql`SELECT id FROM capture_log WHERE user_id = ${session.uid} AND created_at > NOW() - interval '1 day' LIMIT 1`;
      await sql`INSERT INTO capture_log (user_id, kind, place, created_at) VALUES (${session.uid}, ${kind}, ${where}, NOW())`;
      if (!recent) {
        try {
          const [u] = await sql`SELECT name, email, tier FROM users WHERE id = ${session.uid}`;
          if (u) await sendEmail(process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net',
            `CONTENT CAPTURE SIGNAL: ${u.name} (${kind})`,
            `<h2 style="color:#f5e8e8;font-size:22px;margin:0 0 14px;">Possible content capture</h2>
             <p style="color:#a89080;font-size:14px;line-height:1.8;"><strong style="color:#f0d8d8;">${u.name}</strong> (${u.email}, ${u.tier}) triggered a capture signal — <strong style="color:#f0d8d8;">${kind}</strong>${where ? ` on ${where}` : ''}. Their lesson view carries their email watermarked across the content, so any leaked screenshot traces back to this account. Further signals from them today are logged silently (capture_log table).</p>
             <p style="color:#7a5050;font-size:12px;line-height:1.7;">Caveat: browsers can only see PrintScreen keys and blocked copy/print attempts — macOS and phone screenshots are invisible to any website, which is why the watermark is the real protection.</p>`);
        } catch (e) { console.error('capture alert failed', e.message); }
      }
      return res.json({ success: true });
    }

    // Member profile: headline ("what you do") and bio, shown on hover in the
    // community. The avatar itself uploads through /api/lesson-pdfs?kind=avatar.
    if (action === 'update_profile') {
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Sign in required' });
      const headline = String(req.body.headline ?? '').trim().slice(0, 120) || null;
      const bio = String(req.body.bio ?? '').trim().slice(0, 500) || null;
      const company = String(req.body.company ?? '').trim().slice(0, 120) || null;
      const title = String(req.body.title ?? '').trim().slice(0, 120) || null;
      const location = String(req.body.location ?? '').trim().slice(0, 120) || null;
      await sql`UPDATE users SET headline = ${headline}, bio = ${bio}, company = ${company}, title = ${title}, location = ${location} WHERE id = ${session.uid}`;
      return res.json({ success: true, headline, bio, company, title, location });
    }

    // A deal-specific ask is a qualified lead — log who raised their hand, where
    if (action === 'deal_lead') {
      const session = getSession(req);
      if (!session || !session.uid) return res.json({ success: true }); // signed-out clicks aren't leads yet
      const src = String(req.body.source || 'unknown').slice(0, 100);
      const [recent] = await sql`SELECT id FROM deal_leads WHERE user_id = ${session.uid} AND source = ${src} AND created_at > NOW() - interval '1 day'`;
      if (!recent) await sql`INSERT INTO deal_leads (user_id, source, created_at) VALUES (${session.uid}, ${src}, NOW())`;
      return res.json({ success: true });
    }

    // One-time IP agreement (recorded with a timestamp — this is the assent record)
    if (action === 'agree_ip') {
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Not signed in' });
      await sql`UPDATE users SET ip_agreed_at = COALESCE(ip_agreed_at, NOW()) WHERE id = ${session.uid}`;
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

    // 14-day one-course trial (first-10 waitlisters and referred signups).
    // They pick ONE course; the claim is once-per-account and can't be re-aimed.
    if (action === 'claim_trial_course') {
      const session = getSession(req);
      if (!session || !session.uid) return res.status(401).json({ error: 'Not signed in' });
      const courseId = /^mc\d+$/.test(req.body.course_id || '') ? req.body.course_id : null;
      if (!courseId) return res.status(400).json({ error: 'Pick a course' });
      const [u] = await sql`SELECT id, badges, referred_by, membership_status FROM users WHERE id = ${session.uid}`;
      if (!u || u.membership_status !== 'active') return res.status(401).json({ error: 'Not signed in' });
      const eligible = (Array.isArray(u.badges) ? u.badges : []).includes('first10') || !!u.referred_by;
      if (!eligible) return res.status(403).json({ error: 'No trial on this account' });
      const [prior] = await sql`SELECT id FROM entitlements WHERE user_id = ${u.id} AND source = 'referral_trial' LIMIT 1`;
      if (prior) return res.status(409).json({ error: 'Your trial has already been used' });
      const [ent] = await sql`INSERT INTO entitlements (user_id, course_id, source, expires_at, created_at)
        VALUES (${u.id}, ${courseId}, 'referral_trial', NOW() + interval '14 days', NOW()) RETURNING course_id, expires_at`;
      return res.json({ success: true, trial: ent });
    }

    // Free plan: the free-lesson perk is retired — free accounts see course
    // titles only. (Accounts that already claimed one keep it.)
    if (action === 'claim_free_lesson') {
      return res.status(403).json({ error: 'Lessons open with a membership or a course pass — free accounts can browse the full curriculum.' });
      // retired path below
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
