import { neon } from '@neondatabase/serverless';
import { getSession, getAdmin, TIER_RANK } from './_utils.js';
import { sendEmail, dmReplyEmail } from './_email.js';

// Resolve the requesting user (member or admin). Admins get Elite-level access.
async function resolveUser(req, sql) {
  const session = getSession(req);
  if (!session) return null;
  if (session.role === 'admin') {
    if (session.uid) {
      const [u] = await sql`SELECT id, name, tier, role, badge FROM users WHERE id = ${session.uid}`;
      if (u) return { ...u, role: 'admin', badge: u.badge || 'team', rank: TIER_RANK.Elite };
    }
    return { id: null, name: 'GroundUp Team', tier: 'Elite', role: 'admin', badge: 'team', rank: TIER_RANK.Elite };
  }
  if (!session.uid) return null;
  const [u] = await sql`SELECT id, name, tier, role, membership_status FROM users WHERE id = ${session.uid}`;
  if (!u || u.membership_status !== 'active') return null;
  return { ...u, rank: TIER_RANK[u.tier] ?? 0 };
}

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  try {
    const user = await resolveUser(req, sql);
    if (!user) return res.status(401).json({ error: 'Sign in required' });

    // GET ?resource=channels — channels visible to this user
    if (req.method === 'GET' && req.query.resource === 'channels') {
      const channels = await sql`SELECT * FROM channels ORDER BY position, id`;
      const visible = channels.filter(c => (!c.team_only || user.role === 'admin') && user.rank >= (TIER_RANK[c.min_tier] ?? 1));
      return res.json({ channels: visible, tier: user.tier });
    }

    // GET ?resource=messages&channel=<id>[&thread=<messageId>]
    if (req.method === 'GET' && req.query.resource === 'messages') {
      const channelId = Number(req.query.channel);
      if (!channelId) return res.status(400).json({ error: 'channel required' });
      const [channel] = await sql`SELECT * FROM channels WHERE id = ${channelId}`;
      if (!channel || user.rank < (TIER_RANK[channel.min_tier] ?? 1) || (channel.team_only && user.role !== 'admin')) {
        return res.status(403).json({ error: 'No access to this channel' });
      }
      const threadId = req.query.thread ? Number(req.query.thread) : null;
      const rows = threadId
        ? await sql`
            SELECT m.*, u.name AS author_name, u.tier AS author_tier, u.badge AS author_badge
            FROM messages m LEFT JOIN users u ON u.id = m.user_id
            WHERE m.channel_id = ${channelId} AND m.parent_id = ${threadId} AND m.deleted = FALSE
            ORDER BY m.created_at ASC LIMIT 200`
        : await sql`
            SELECT m.*, u.name AS author_name, u.tier AS author_tier, u.badge AS author_badge,
              (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id AND r.deleted = FALSE) AS reply_count
            FROM messages m LEFT JOIN users u ON u.id = m.user_id
            WHERE m.channel_id = ${channelId} AND m.parent_id IS NULL AND m.deleted = FALSE
            ORDER BY m.created_at ASC LIMIT 200`;
      // Attach poll results (counts, your vote; voter names for the team)
      const pollMsgs = rows.filter(r => r.poll);
      if (pollMsgs.length) {
        const ids = pollMsgs.map(r => r.id);
        const votes = await sql`
          SELECT v.message_id, v.option_idx, v.user_id, u.name
          FROM poll_votes v LEFT JOIN users u ON u.id = v.user_id
          WHERE v.message_id = ANY(${ids})`;
        for (const m of pollMsgs) {
          const mine = votes.find(v => v.message_id === m.id && v.user_id === user.id);
          const counts = (m.poll.options || []).map((_, i) => votes.filter(v => v.message_id === m.id && v.option_idx === i).length);
          m.poll_results = {
            counts,
            total: counts.reduce((a, b) => a + b, 0),
            my_vote: mine ? mine.option_idx : null,
            ...(user.role === 'admin' ? { voters: (m.poll.options || []).map((_, i) => votes.filter(v => v.message_id === m.id && v.option_idx === i).map(v => v.name || 'Member')) } : {}),
          };
        }
      }
      return res.json({ messages: rows });
    }

    // ── Direct messages (Elite benefit): one private thread per member with the team ──
    const isAdminReq = user.role === 'admin';

    // GET ?resource=dm-threads — admin: list members who have DM threads
    if (req.method === 'GET' && req.query.resource === 'dm-threads') {
      if (!isAdminReq) return res.status(403).json({ error: 'Admins only' });
      const threads = await sql`
        SELECT u.id, u.name, u.tier, MAX(d.created_at) AS last_at, COUNT(*) AS msg_count
        FROM dms d JOIN users u ON u.id = d.user_id
        GROUP BY u.id, u.name, u.tier ORDER BY last_at DESC LIMIT 100`;
      return res.json({ threads });
    }

    // GET ?resource=dm[&user=<id>] — member reads own thread; admin reads any
    if (req.method === 'GET' && req.query.resource === 'dm') {
      let targetId = user.id;
      if (isAdminReq && req.query.user) targetId = Number(req.query.user);
      else if (!isAdminReq && user.rank < TIER_RANK.Elite) return res.status(403).json({ error: 'Direct messages are an Elite benefit' });
      if (!targetId) return res.status(400).json({ error: 'No thread' });
      const msgs = await sql`SELECT * FROM dms WHERE user_id = ${targetId} ORDER BY created_at ASC LIMIT 200`;
      return res.json({ messages: msgs });
    }

    // POST { dm: true, body, user_id? } — Elite member messages the team; admin replies
    if (req.method === 'POST' && req.body && req.body.dm) {
      const text = (req.body.body || '').trim();
      if (!text) return res.status(400).json({ error: 'body required' });
      if (text.length > 4000) return res.status(400).json({ error: 'Message too long' });
      let targetId;
      if (isAdminReq) {
        targetId = Number(req.body.user_id);
        if (!targetId) return res.status(400).json({ error: 'user_id required' });
      } else {
        if (user.rank < TIER_RANK.Elite) return res.status(403).json({ error: 'Direct messages are an Elite benefit' });
        targetId = user.id;
      }
      const [msg] = await sql`
        INSERT INTO dms (user_id, from_admin, body, created_at)
        VALUES (${targetId}, ${isAdminReq}, ${text}, NOW()) RETURNING *`;
      // Team replied → let the member know by email (fire-and-forget)
      if (isAdminReq) {
        try {
          const [target] = await sql`SELECT name, email FROM users WHERE id = ${targetId}`;
          if (target) {
            const mail = dmReplyEmail(target.name);
            await sendEmail(target.email, mail.subject, mail.html);
          }
        } catch (e) { console.error('dm email failed', e); }
      }
      return res.status(201).json({ message: msg });
    }

    // Team: post a poll into a channel (e.g. event interest in Announcements / Elite Lounge)
    if (req.method === 'POST' && req.body && req.body.action === 'create_poll') {
      if (!isAdminReq) return res.status(403).json({ error: 'Team only' });
      const { channel_id, question, options } = req.body;
      const opts = (Array.isArray(options) ? options : []).map(o => String(o).trim()).filter(Boolean).slice(0, 6);
      if (!channel_id || !question || opts.length < 2) return res.status(400).json({ error: 'Question and at least 2 options required' });
      const [msg] = await sql`
        INSERT INTO messages (channel_id, user_id, body, is_admin, poll, created_at)
        VALUES (${channel_id}, ${user.id}, ${String(question).trim().slice(0, 500)}, TRUE, ${JSON.stringify({ options: opts })}, NOW())
        RETURNING *`;
      return res.status(201).json({ message: msg });
    }

    // Anyone with channel access votes (single choice, changeable) — Basic readers included
    if (req.method === 'POST' && req.body && req.body.action === 'vote') {
      const { message_id, option_idx } = req.body;
      const [msg] = await sql`SELECT m.*, c.min_tier FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ${Number(message_id)}`;
      if (!msg || !msg.poll) return res.status(404).json({ error: 'Poll not found' });
      if (user.rank < (TIER_RANK[msg.min_tier] ?? 1)) return res.status(403).json({ error: 'No access to this channel' });
      const idx = Number(option_idx);
      if (!(idx >= 0 && idx < (msg.poll.options || []).length)) return res.status(400).json({ error: 'Invalid option' });
      if (!user.id) return res.status(400).json({ error: 'Vote from a member account' });
      await sql`
        INSERT INTO poll_votes (message_id, user_id, option_idx, created_at)
        VALUES (${msg.id}, ${user.id}, ${idx}, NOW())
        ON CONFLICT (message_id, user_id) DO UPDATE SET option_idx = ${idx}`;
      return res.json({ success: true });
    }

    // Team: create a channel (max 10)
    if (req.method === 'POST' && req.body && req.body.action === 'create_channel') {
      if (!isAdminReq) return res.status(403).json({ error: 'Team only' });
      const { name, description, min_tier, admin_only_post, team_only } = req.body;
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'Channel name required' });
      const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM channels`;
      if (count >= 10) return res.status(400).json({ error: 'Channel limit reached (10) — delete one first' });
      const clean = String(name).trim().slice(0, 40);
      const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'channel';
      const safeTier = ['Basic', 'Premium', 'Elite'].includes(min_tier) ? min_tier : 'Basic';
      const [ch] = await sql`
        INSERT INTO channels (slug, name, description, min_tier, admin_only_post, position, team_only, created_at)
        VALUES (${slug}, ${clean}, ${(description || '').slice(0, 200)}, ${safeTier}, ${!!admin_only_post}, ${count}, ${!!team_only}, NOW())
        ON CONFLICT (slug) DO NOTHING RETURNING *`;
      if (!ch) return res.status(409).json({ error: 'A channel with that name already exists' });
      return res.status(201).json({ channel: ch });
    }

    // Team: delete a channel (messages go with it)
    if (req.method === 'POST' && req.body && req.body.action === 'delete_channel') {
      if (!isAdminReq) return res.status(403).json({ error: 'Team only' });
      await sql`DELETE FROM channels WHERE id = ${Number(req.body.id)}`;
      return res.json({ success: true });
    }

    // POST { channel_id, body, parent_id? } — post a message or thread reply
    // Posting requires Premium+; Basic is read-only. Admins always post.
    if (req.method === 'POST') {
      const { channel_id, body, parent_id } = req.body;
      if (!isAdminReq && user.rank < TIER_RANK.Premium) {
        return res.status(403).json({ error: 'Posting requires a Premium or Elite membership — Basic includes read access' });
      }
      const text = (body || '').trim();
      if (!channel_id || !text) return res.status(400).json({ error: 'channel_id and body required' });
      if (text.length > 4000) return res.status(400).json({ error: 'Message too long' });
      const [channel] = await sql`SELECT * FROM channels WHERE id = ${channel_id}`;
      if (!channel || user.rank < (TIER_RANK[channel.min_tier] ?? 1) || (channel.team_only && user.role !== 'admin')) {
        return res.status(403).json({ error: 'No access to this channel' });
      }
      if (channel.admin_only_post && user.role !== 'admin') {
        return res.status(403).json({ error: 'Only the GroundUp team can post here' });
      }
      if (parent_id) {
        const [parent] = await sql`SELECT id, channel_id, parent_id FROM messages WHERE id = ${parent_id}`;
        if (!parent || parent.channel_id !== channel.id || parent.parent_id) {
          return res.status(400).json({ error: 'Invalid thread' });
        }
      }
      const [msg] = await sql`
        INSERT INTO messages (channel_id, user_id, parent_id, body, is_admin, created_at)
        VALUES (${channel_id}, ${user.id}, ${parent_id || null}, ${text}, ${user.role === 'admin'}, NOW())
        RETURNING *`;
      return res.status(201).json({ message: { ...msg, author_name: user.role === 'admin' ? (user.name || 'GroundUp Team') : user.name, author_tier: user.tier, author_badge: user.badge || null, reply_count: 0 } });
    }

    // DELETE { id } — author or admin soft-deletes a message
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const [msg] = await sql`SELECT * FROM messages WHERE id = ${id}`;
      if (!msg) return res.status(404).json({ error: 'Not found' });
      const isAdmin = !!getAdmin(req);
      if (!isAdmin && msg.user_id !== user.id) return res.status(403).json({ error: 'Not your message' });
      await sql`UPDATE messages SET deleted = TRUE WHERE id = ${id}`;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
