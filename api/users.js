import { neon } from '@neondatabase/serverless';
import { requireAdmin, hashPassword } from './_utils.js';

const FIELDS = ['id', 'name', 'email', 'tier', 'role', 'badge', 'membership_status', 'created_at'];

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const sql = neon(process.env.DATABASE_URL);

  try {
    // ── Master contact list: everyone who has EVER touched GroundUp ──
    // Compiled live from every source (accounts, waitlist, gifts, invites,
    // Lunch & Learn) and deduped by email — nothing to maintain by hand.
    if (req.method === 'GET' && req.query.contacts === '1') {
      const contacts = new Map();
      const touch = (email, fields) => {
        const key = String(email || '').trim().toLowerCase();
        if (!key || key.includes('@removed.groundup')) return;
        const c = contacts.get(key) || { email: key, sources: [], name: null, phone: null, why: null, joined: null, tier: null };
        if (fields.name && !c.name) c.name = fields.name;
        if (fields.phone && !c.phone) c.phone = fields.phone;
        if (fields.why && !c.why) c.why = fields.why;
        if (fields.tier) c.tier = fields.tier;
        if (fields.source && !c.sources.includes(fields.source)) c.sources.push(fields.source);
        if (fields.joined && (!c.joined || new Date(fields.joined) < new Date(c.joined))) c.joined = fields.joined;
        contacts.set(key, c);
      };
      const accounts = await sql`SELECT name, email, tier, role, created_at FROM users`;
      for (const u of accounts) touch(u.email, { name: u.name, tier: u.role === 'admin' ? 'Team' : u.tier, source: u.role === 'admin' ? 'Team account' : 'Member account', joined: u.created_at });
      const wl = await sql`SELECT name, email, phone, reason, learn, budget, list, created_at FROM waitlist`;
      for (const w of wl) touch(w.email, { name: w.name, phone: w.phone, why: [w.learn, w.reason, w.budget && `budget ${w.budget}`].filter(Boolean).join(' · '), source: (w.list || 'insider') === 'insider' ? 'Insider waitlist' : 'General waitlist', joined: w.created_at });
      const refs = await sql`SELECT name, email, kind, used, created_at FROM referrals`;
      for (const r of refs) touch(r.email, { name: r.name, source: r.kind === 'month_free' ? (r.used ? 'Gift (redeemed)' : 'Gift (sent)') : 'Personal invite', joined: r.created_at });
      const lnl = await sql`SELECT u.name, u.email, e.created_at FROM entitlements e JOIN users u ON u.id = e.user_id WHERE e.course_id = 'lunchlearn'`;
      for (const l of lnl) touch(l.email, { name: l.name, source: 'Lunch & Learn', joined: l.created_at });
      const leads = await sql`SELECT u.name, u.email, d.source AS lead_src, d.created_at FROM deal_leads d JOIN users u ON u.id = d.user_id`;
      for (const l of leads) touch(l.email, { name: l.name, source: 'DEAL LEAD', joined: l.created_at, why: 'Asked for deal-specific help (' + l.lead_src + ')' });
      const list = [...contacts.values()].sort((a, b) => new Date(b.joined || 0) - new Date(a.joined || 0));
      return res.json({ contacts: list, total: list.length });
    }

    if (req.method === 'GET') {
      const users = await sql`
        SELECT id, name, email, tier, role, badge, membership_status, comped, badges, created_at
        FROM users ORDER BY created_at DESC`;
      return res.json(users);
    }

    // Add a user (member or team). Optional password lets them sign in immediately;
    // optional role 'admin' + badge creates a team member in one step.
    if (req.method === 'POST') {
      const { name, email, tier, password, role, badge } = req.body;
      if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
      if (password && password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      if (role !== undefined && !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      if (badge !== undefined && badge !== null && !['team', 'drmerritt'].includes(badge)) return res.status(400).json({ error: 'Invalid badge' });
      const cleanEmail = String(email).trim().toLowerCase();
      const safeTier = ['Free', 'Basic', 'Builder', 'Premium', 'Elite', 'Partner'].includes(tier) ? tier : 'Free';
      const [user] = await sql`
        INSERT INTO users (name, email, tier, password_hash, role, badge, created_at)
        VALUES (${String(name).trim()}, ${cleanEmail}, ${safeTier}, ${password ? hashPassword(password) : null}, ${role || 'member'}, ${badge || null}, NOW())
        ON CONFLICT (email) DO NOTHING
        RETURNING id, name, email, tier, role, badge, membership_status, created_at
      `;
      if (!user) return res.status(409).json({ error: 'Email already exists' });
      return res.status(201).json(user);
    }

    // Update tier / role / badge / comped, or reset a password ({ id, new_password })
    if (req.method === 'PATCH') {
      const { id, tier, role, badge, comped, new_password } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      if (role !== undefined && !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      if (badge !== undefined && badge !== null && !['team', 'drmerritt'].includes(badge)) return res.status(400).json({ error: 'Invalid badge' });
      if (comped !== undefined && typeof comped !== 'boolean') return res.status(400).json({ error: 'comped must be boolean' });
      if (new_password !== undefined && (typeof new_password !== 'string' || new_password.length < 8)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const hasBadge = 'badge' in req.body;
      const hasComped = 'comped' in req.body;
      const [user] = await sql`
        UPDATE users SET
          tier_since = CASE WHEN ${tier ?? null}::text IS NOT NULL AND tier IS DISTINCT FROM ${tier ?? null} THEN NOW() ELSE tier_since END,
          tier = COALESCE(${tier ?? null}, tier),
          role = COALESCE(${role ?? null}, role),
          badge = CASE WHEN ${hasBadge} THEN ${badge ?? null} ELSE badge END,
          comped = CASE WHEN ${hasComped} THEN ${comped ?? false} ELSE comped END,
          password_hash = COALESCE(${new_password ? hashPassword(new_password) : null}, password_hash)
        WHERE id = ${id}
        RETURNING id, name, email, tier, role, badge, membership_status, comped, badges, created_at
      `;
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json(user);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql`DELETE FROM users WHERE id = ${id}`;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
}
