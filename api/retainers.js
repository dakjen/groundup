import { neon } from '@neondatabase/serverless';
import { getSession, getAdmin } from './_utils.js';
import { sendEmail, firstName } from './_email.js';
import { sendPush } from './_push.js';

// Senior Advisor retainers: clients see their own workspace; the team sees the roster.
export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const admin = getAdmin(req);
  if (admin?.viewer && req.method !== 'GET') return res.status(403).json({ error: 'Your admin access is view-only — ask Dakotah to make this change.' });
  const session = getSession(req);

  const monthUsed = async (rid) => {
    const [r] = await sql`
      SELECT COALESCE(SUM(hours), 0)::float AS used FROM retainer_hours
      WHERE retainer_id = ${rid} AND logged_on >= date_trunc('month', CURRENT_DATE)`;
    return r.used;
  };

  try {
    if (req.method === 'GET') {
      // One client's direct line (admin) — opening it marks it seen
      if (admin && req.query.admin === '1' && req.query.thread) {
        const rid = Number(req.query.thread) || 0;
        const messages = await sql`SELECT * FROM retainer_messages WHERE retainer_id = ${rid} ORDER BY created_at ASC LIMIT 300`;
        if (admin.uid) { try { await sql`INSERT INTO thread_seen (user_id, kind, ref_id, seen_at) VALUES (${admin.uid}, 'advisory', ${rid}, NOW()) ON CONFLICT (user_id, kind, ref_id) DO UPDATE SET seen_at = NOW()`; } catch {} }
        return res.json({ messages });
      }
      // Admin roster
      if (admin && req.query.admin === '1') {
        const rows = await sql`
          SELECT r.*, u.name, u.email FROM retainers r
          JOIN users u ON u.id = r.user_id ORDER BY r.status, r.created_at DESC`;
        for (const r of rows) {
          r.used_this_month = await monthUsed(r.id);
          try { const [u] = await sql`SELECT deal_profile, tier, avatar_url FROM users WHERE id = ${r.user_id}`; r.deal_profile = u?.deal_profile || null; r.tier = u?.tier; r.avatar_url = u?.avatar_url; } catch {}
          try { r.deal_files = await sql`SELECT id, project_id, folder, title, url, kind, size, created_at FROM deal_files WHERE user_id = ${r.user_id} ORDER BY created_at DESC`; } catch { r.deal_files = []; }
          try { r.projects = await sql`SELECT id, name, details, created_at, updated_at FROM projects WHERE user_id = ${r.user_id} ORDER BY created_at ASC`; } catch { r.projects = []; }
          r.log = await sql`SELECT * FROM retainer_hours WHERE retainer_id = ${r.id} ORDER BY logged_on DESC, id DESC LIMIT 60`;
          try { r.meetings = await sql`SELECT * FROM retainer_meetings WHERE retainer_id = ${r.id} AND status <> 'done' ORDER BY scheduled_at ASC NULLS LAST, created_at DESC LIMIT 10`; } catch { r.meetings = []; }
          // The thread rides along so the Messages tab shows instantly (it is not marked seen until opened)
          r.messages = await sql`SELECT * FROM retainer_messages WHERE retainer_id = ${r.id} ORDER BY created_at ASC LIMIT 300`;
          r.files = await sql`SELECT * FROM retainer_files WHERE retainer_id = ${r.id} ORDER BY created_at DESC`;
          // The direct line is its own thread, separate from Community DMs. Unread = what the client wrote since this admin last opened the tab.
          try { const [d] = await sql`SELECT COUNT(*)::int AS n FROM retainer_messages m WHERE m.retainer_id = ${r.id} AND m.from_admin = FALSE AND m.created_at > COALESCE((SELECT seen_at FROM thread_seen t WHERE t.user_id = ${admin.uid || 0} AND t.kind = 'advisory' AND t.ref_id = ${r.id}), '1970-01-01')`; r.unread = d?.n || 0; } catch { r.unread = 0; }
        }
        const mrr = rows.filter(r => r.status === 'active').reduce((a, r) => a + Number(r.monthly_amount), 0);
        const [callRow] = await sql`SELECT value FROM settings WHERE key = 'advisor_call_link'`;
        const bookings = await sql`
          SELECT b.*, u.name, u.email FROM bookings b JOIN users u ON u.id = b.user_id
          ORDER BY (b.status = 'awaiting_booking') DESC, b.created_at DESC LIMIT 100`;
        // Auto-nudge: anyone who paid 48h+ ago, never booked, max 2 nudges, 72h apart
        const link = callRow?.value || '';
        if (link) {
          const stale = await sql`
            SELECT b.*, u.name, u.email FROM bookings b JOIN users u ON u.id = b.user_id
            WHERE b.status = 'awaiting_booking' AND b.created_at < NOW() - interval '48 hours'
              AND COALESCE(b.nudges, 0) < 2
              AND (b.last_nudge_at IS NULL OR b.last_nudge_at < NOW() - interval '72 hours')`;
          for (const b of stale) {
            await sendEmail(b.email, `Reminder: book your ${b.label}`,
              `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">You haven't picked a time yet</h2>
               <p style="color:#444444;font-size:14px;line-height:1.8;">Hi ${firstName(b.name)} — your <strong style="color:#161616;">${b.label}</strong> is paid and waiting. Grab a slot on Dr. Merritt's calendar so she can prepare for you.</p>
               <a href="${link}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Book Your Time →</a>`);
            await sql`UPDATE bookings SET nudges = COALESCE(nudges,0) + 1, last_nudge_at = NOW() WHERE id = ${b.id}`;
          }
        }
        return res.json({ retainers: rows, mrr, call_link: callRow?.value || '', bookings });
      }
      // Member's own retainer
      if (!session?.uid) return res.status(401).json({ error: 'Sign in required' });
      const [r] = await sql`SELECT * FROM retainers WHERE user_id = ${session.uid} AND status IN ('active','offered') ORDER BY created_at DESC LIMIT 1`;
      if (!r) return res.json({ retainer: null });
      if (r.status === 'offered') return res.json({ retainer: { id: r.id, status: 'offered', notes: r.notes } });
      r.used_this_month = await monthUsed(r.id);
      r.log = await sql`SELECT hours, note, logged_on FROM retainer_hours WHERE retainer_id = ${r.id} ORDER BY logged_on DESC LIMIT 12`;
      r.files = await sql`SELECT * FROM retainer_files WHERE retainer_id = ${r.id} ORDER BY created_at DESC`;
      try { r.meetings = await sql`SELECT id, minutes, topic, status, scheduled_at, created_at FROM retainer_meetings WHERE retainer_id = ${r.id} AND status <> 'done' ORDER BY scheduled_at ASC NULLS LAST, created_at DESC LIMIT 10`; } catch { r.meetings = []; }
      r.messages = await sql`SELECT * FROM retainer_messages WHERE retainer_id = ${r.id} ORDER BY created_at ASC LIMIT 300`;
      if (req.query.thread) {
        // The client's direct line — opening it marks it seen
        const messages = await sql`SELECT * FROM retainer_messages WHERE retainer_id = ${r.id} ORDER BY created_at ASC LIMIT 300`;
        try { await sql`INSERT INTO thread_seen (user_id, kind, ref_id, seen_at) VALUES (${session.uid}, 'advisory', ${r.id}, NOW()) ON CONFLICT (user_id, kind, ref_id) DO UPDATE SET seen_at = NOW()`; } catch {}
        return res.json({ retainer: r, messages });
      }
      return res.json({ retainer: r });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const action = req.body?.action;

    // Client asks for a meeting (Dr. Merritt works behind the scenes and logs
    // her hours on the timesheet; a meeting is what the client requests)
    if (action === 'request_time' || action === 'request_meeting') {
      if (!session?.uid) return res.status(401).json({ error: 'Sign in required' });
      const [r] = await sql`SELECT * FROM retainers WHERE user_id = ${session.uid} AND status = 'active' LIMIT 1`;
      if (!r) return res.status(403).json({ error: 'No active retainer' });
      const [u] = await sql`SELECT name, email FROM users WHERE id = ${session.uid}`;
      const note = String(req.body.note || '').trim().slice(0, 2000);
      const minutes = [30, 45, 60, 90].includes(Number(req.body.minutes)) ? Number(req.body.minutes) : 60;
      const hours = minutes / 60;
      const used = await monthUsed(r.id);
      if (used + hours > Number(r.hours_per_month) + 0.001) return res.status(400).json({ error: `That meeting would go past your ${r.hours_per_month} hours this month — ${Math.max(0, Number(r.hours_per_month) - used).toFixed(2)} left.` });
      // The meeting comes out of this month's hours and shows on the timesheet
      await sql`INSERT INTO retainer_hours (retainer_id, hours, note, logged_on, created_at)
        VALUES (${r.id}, ${hours}, ${('Meeting' + (note ? ' — ' + note.slice(0, 160) : '')).slice(0, 200)}, CURRENT_DATE, NOW())`;
      try { await sql`INSERT INTO retainer_meetings (retainer_id, minutes, topic) VALUES (${r.id}, ${minutes}, ${note || null})`; } catch (e) { console.error('meeting row failed', e.message); }
      const [linkRow] = await sql`SELECT value FROM settings WHERE key = 'advisor_call_link'`;
      const link = linkRow?.value || '';
      const [gina] = await sql`SELECT email FROM users WHERE badge = 'drmerritt' LIMIT 1`;
      const to = gina?.email ? [gina.email] : [process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net'];
      for (const addr of to) await sendEmail(addr,
        `Meeting request — ${u.name} (${minutes} min)`,
        `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">An advisory client would like a meeting</h2>
         <p style="color:#444444;font-size:14px;line-height:1.8;"><strong style="color:#161616;">${u.name}</strong> (${u.email}) — ${minutes} minutes, logged against their ${r.hours_per_month} hrs/mo retainer (${(used + hours).toFixed(2)} used this month).${link ? ' They were sent to your booking link to pick a time.' : ' No booking link is set, so they are waiting for you to reach out.'}</p>
         ${note ? `<p style="color:#444444;font-size:14px;line-height:1.8;background:#faf7f7;border:1px solid #e5dccf;border-radius:10px;padding:14px 18px;"><strong style="color:#161616;">What they want to cover:</strong><br>${note.replace(/</g, '&lt;')}</p>` : ''}`);
      return res.json({ success: true, link, minutes, used: used + hours });
    }

    // The direct line and workspace documents — client or team, on their own retainer
    if (action === 'message' || action === 'add_file' || action === 'remove_file') {
      let rid = Number(req.body.retainer_id) || 0;
      if (!admin) {
        if (!session?.uid) return res.status(401).json({ error: 'Sign in required' });
        const [own] = await sql`SELECT id FROM retainers WHERE user_id = ${session.uid} AND status = 'active' LIMIT 1`;
        if (!own) return res.status(403).json({ error: 'No active retainer' });
        rid = own.id;
      }
      if (!rid) return res.status(400).json({ error: 'retainer_id required' });

      if (action === 'message') {
        const body = String(req.body.body || '').trim().slice(0, 4000);
        if (!body) return res.status(400).json({ error: 'Message required' });
        const [m] = await sql`INSERT INTO retainer_messages (retainer_id, from_admin, body, created_at)
          VALUES (${rid}, ${!!admin}, ${body}, NOW()) RETURNING *`;
        // The sender has seen their own thread
        const seenBy = admin ? admin.uid : session?.uid;
        if (seenBy) { try { await sql`INSERT INTO thread_seen (user_id, kind, ref_id, seen_at) VALUES (${seenBy}, 'advisory', ${rid}, NOW()) ON CONFLICT (user_id, kind, ref_id) DO UPDATE SET seen_at = NOW()`; } catch {} }
        const [r] = await sql`SELECT r.user_id, u.name, u.email FROM retainers r JOIN users u ON u.id = r.user_id WHERE r.id = ${rid}`;
        if (admin && r) {
          await sendEmail(r.email, 'Dr. Merritt replied in your advisory workspace',
            `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">New message in your workspace</h2>
             <p style="color:#444444;font-size:14px;line-height:1.8;">Sign in and open your Advisory workspace to read it and reply.</p>`);
          await sendPush(sql, [r.user_id], { title: 'Dr. Merritt replied', body: body.slice(0, 140), url: '/advisory', tag: 'advisory:' + rid });
        } else if (r) {
          // The advisory direct line is Dr. Merritt's alone — not the team inbox
          const [gina] = await sql`SELECT email FROM users WHERE badge = 'drmerritt' LIMIT 1`;
          const to = gina?.email ? [gina.email] : [process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net'];
          for (const addr of to) await sendEmail(addr,
            `Advisory client — ${r.name}`,
            `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">${r.name} wrote in their advisory workspace</h2>
             <p style="color:#444444;font-size:14px;line-height:1.8;background:#faf7f7;border:1px solid #e5dccf;border-radius:10px;padding:14px 18px;">${body.slice(0, 500)}</p>
             <p style="color:#7a5050;font-size:12px;line-height:1.7;">Reply from their tab on the Advisory Clients page — they're emailed when you do.</p>`);
          const [gu] = await sql`SELECT id FROM users WHERE badge = 'drmerritt' LIMIT 1`;
          if (gu) await sendPush(sql, [gu.id], { title: `${r.name} — advisory`, body: body.slice(0, 140), url: `/admin-retainers#adv=${rid}&tab=messages`, tag: 'advisory:' + rid });
        }
        return res.status(201).json(m);
      }

      if (action === 'add_file') {
        const { title, url, kind } = req.body;
        if (!title) return res.status(400).json({ error: 'Title required' });
        if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid link' }); } }
        const [f] = await sql`INSERT INTO retainer_files (retainer_id, title, url, kind, uploaded_by, created_at)
          VALUES (${rid}, ${String(title).slice(0, 200)}, ${url || null}, ${kind || 'link'}, ${session?.uid || null}, NOW()) RETURNING *`;
        // A document the team uploaded for this client has to open for the client:
        // register it under their account so the file gate lets them through.
        if (admin && url && String(url).startsWith('/api/file?p=deal-docs')) {
          try { const [r] = await sql`SELECT user_id FROM retainers WHERE id = ${rid}`; if (r) await sql`INSERT INTO deal_files (user_id, title, url, kind) VALUES (${r.user_id}, ${String(title).slice(0, 160)}, ${url}, 'file')`; } catch (e) { console.error('deal_files mirror failed', e.message); }
        }
        return res.status(201).json(f);
      }

      if (action === 'remove_file') {
        await sql`DELETE FROM retainer_files WHERE id = ${Number(req.body.id)} AND retainer_id = ${rid}`;
        return res.json({ success: true });
      }
    }

    // ── Team only ──
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });

    if (action === 'booking_status') {
      const { id, status } = req.body;
      if (!['booked', 'cancelled', 'awaiting_booking'].includes(status)) return res.status(400).json({ error: 'Bad status' });
      await sql`UPDATE bookings SET status = ${status}, booked_at = ${status === 'booked' ? new Date().toISOString() : null} WHERE id = ${Number(id)}`;
      return res.json({ success: true });
    }

    if (action === 'nudge_booking') {
      const [b] = await sql`SELECT b.*, u.name, u.email FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.id = ${Number(req.body.id)}`;
      if (!b) return res.status(404).json({ error: 'Not found' });
      const [linkRow] = await sql`SELECT value FROM settings WHERE key = 'advisor_call_link'`;
      await sendEmail(b.email, `Reminder: book your ${b.label}`,
        `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">You haven't picked a time yet</h2>
         <p style="color:#444444;font-size:14px;line-height:1.8;">Hi ${firstName(b.name)} — your <strong style="color:#161616;">${b.label}</strong> is paid and waiting. Grab a slot so Dr. Merritt can prepare for you.</p>
         ${linkRow?.value ? `<a href="${linkRow.value}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Book Your Time →</a>` : ''}`);
      await sql`UPDATE bookings SET nudges = COALESCE(nudges,0) + 1, last_nudge_at = NOW() WHERE id = ${b.id}`;
      return res.json({ success: true });
    }

    if (action === 'set_call_link') {
      const url = String(req.body.url || '').trim();
      if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid link' }); } }
      await sql`INSERT INTO settings (key, value) VALUES ('advisor_call_link', ${url}) ON CONFLICT (key) DO UPDATE SET value = ${url}`;
      return res.json({ success: true });
    }

    if (action === 'create') {
      const { user_id, hours_per_month, monthly_amount, notes, status } = req.body;
      if (!user_id) return res.status(400).json({ error: 'Pick a member' });
      const st = status === 'offered' ? 'offered' : 'active';
      const [r] = await sql`
        INSERT INTO retainers (user_id, hours_per_month, monthly_amount, notes, status, started_at, created_at)
        VALUES (${Number(user_id)}, ${Number(hours_per_month) || 10}, ${Number(monthly_amount) || 5500}, ${notes || null}, ${st}, NOW(), NOW())
        RETURNING *`;
      // Advisory clients get everything an Owner gets — the account moves to the Owner tier.
      if (st === 'active') await sql`UPDATE users SET tier = 'Elite', tier_since = COALESCE(tier_since, NOW()), membership_status = 'active' WHERE id = ${Number(user_id)} AND tier IS DISTINCT FROM 'Elite'`;
      // Invite the client to choose a plan and pay
      if (st === 'offered') {
        const [u] = await sql`SELECT name, email FROM users WHERE id = ${Number(user_id)}`;
        if (u) await sendEmail(u.email, 'Your Senior Advisor retainer — choose your hours',
          `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">Ready when you are, ${firstName(u.name)}.</h2>
           <p style="color:#444444;font-size:14px;line-height:1.8;">Following your call with Dr. Merritt — your Senior Advisor retainer is ready to start. Sign in and pick the hour block that fits, and your advisory workspace opens immediately.</p>
           <a href="https://community.drginamerritt.net/advisory" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Choose Your Plan</a>`);
      }
      return res.status(201).json(r);
    }

    if (action === 'log_hours') {
      const { retainer_id, hours, note, logged_on } = req.body;
      if (!retainer_id || !hours) return res.status(400).json({ error: 'Retainer and hours required' });
      await sql`INSERT INTO retainer_hours (retainer_id, hours, note, logged_on, created_at)
        VALUES (${Number(retainer_id)}, ${Number(hours)}, ${note || null}, ${logged_on || null} , NOW())`;
      return res.status(201).json({ success: true });
    }

    // When the meeting is on the calendar (or finished) — shows to the client as "next meeting"
    if (action === 'meeting_update') {
      const id = Number(req.body.id) || 0;
      const status = ['requested', 'scheduled', 'done'].includes(req.body.status) ? req.body.status : null;
      const when = req.body.scheduled_at ? new Date(req.body.scheduled_at) : null;
      await sql`UPDATE retainer_meetings SET scheduled_at = COALESCE(${when && !isNaN(when) ? when.toISOString() : null}, scheduled_at), status = COALESCE(${status}, CASE WHEN ${!!(when && !isNaN(when))} THEN 'scheduled' ELSE status END) WHERE id = ${id}`;
      return res.json({ success: true });
    }

    // Dr. Merritt's private notes on a client — never shown to the client.
    if (action === 'private_notes') {
      await sql`UPDATE retainers SET private_notes = ${String(req.body.notes || '').slice(0, 8000)} WHERE id = ${Number(req.body.id)}`;
      return res.json({ success: true });
    }

    if (action === 'update') {
      const { id, hours_per_month, monthly_amount, status, notes } = req.body;
      const [r] = await sql`
        UPDATE retainers SET
          hours_per_month = COALESCE(${hours_per_month ?? null}, hours_per_month),
          monthly_amount = COALESCE(${monthly_amount ?? null}, monthly_amount),
          status = COALESCE(${status ?? null}, status),
          notes = COALESCE(${notes ?? null}, notes)
        WHERE id = ${Number(id)} RETURNING *`;
      if (r && status === 'active') await sql`UPDATE users SET tier = 'Elite', tier_since = COALESCE(tier_since, NOW()), membership_status = 'active' WHERE id = ${r.user_id} AND tier IS DISTINCT FROM 'Elite'`;
      return res.json(r);
    }

    if (action === 'delete') {
      await sql`DELETE FROM retainers WHERE id = ${Number(req.body.id)}`;
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
