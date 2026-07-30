import { neon } from '@neondatabase/serverless';

// Mirrors schema.sql. Safe to run repeatedly; executed on admin login so the
// database always matches the deployed code with no manual Neon step.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    tier TEXT DEFAULT 'Free', created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS badge TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS free_lesson_key TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_status TEXT DEFAULT 'active'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS lnl_discount_until TIMESTAMP`,
  `CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending', used BOOLEAN DEFAULT FALSE, used_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS entitlements (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL, source TEXT DEFAULT 'manual', expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT,
    min_tier TEXT DEFAULT 'Basic', admin_only_post BOOLEAN DEFAULT FALSE,
    position INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY, channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    parent_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    body TEXT NOT NULL, is_admin BOOLEAN DEFAULT FALSE, deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS poll JSONB`,
  `CREATE TABLE IF NOT EXISTS poll_votes (
    id SERIAL PRIMARY KEY, message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_idx INTEGER NOT NULL, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(message_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, kind TEXT DEFAULT 'lnl_comp',
    max_uses INTEGER DEFAULT 1, used_count INTEGER DEFAULT 0, expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS lnl_requests (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS waitlist (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'Basic', launched_notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS phone TEXT`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS reason TEXT`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS learn TEXT`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS budget TEXT`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS source TEXT`,
  `CREATE TABLE IF NOT EXISTS resources (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, url TEXT, code TEXT,
    category TEXT DEFAULT 'resource', min_tier TEXT DEFAULT 'Premium',
    position INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS dms (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_admin BOOLEAN DEFAULT FALSE, body TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())`,
  `INSERT INTO channels (slug, name, description, min_tier, admin_only_post, position) VALUES
    ('announcements', 'Announcements', 'Official updates from Dr. Merritt and the GroundUp team.', 'Basic', TRUE, 0),
    ('general', 'General', 'Introduce yourself and talk shop with fellow members.', 'Basic', FALSE, 1),
    ('deals-financing', 'Deals & Financing', 'Capital stacks, LIHTC, gap funding, underwriting questions.', 'Basic', FALSE, 2),
    ('jv-partnerships', 'JV & Partnerships', 'Find partners, structure splits, share opportunities.', 'Premium', FALSE, 3),
    ('opportunity-board', 'Opportunity Board', 'RFPs, funding windows, and deals worth chasing — posted by the team monthly. Reply in threads to discuss.', 'Premium', TRUE, 4),
    ('elite-lounge', 'Elite Lounge', 'Private channel for Elite members and advisory clients.', 'Elite', FALSE, 5)
    ON CONFLICT (slug) DO NOTHING`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code)`,
  `CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, parent_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_dms_user ON dms(user_id, created_at)`,
];

export async function ensureSchema() {
  const sql = neon(process.env.DATABASE_URL);
  for (const stmt of STATEMENTS) {
    // Version-safe raw execution (older neon clients lack sql.query)
    if (typeof sql.query === 'function') { await sql.query(stmt); }
    else { const t = [stmt]; t.raw = [stmt]; await sql(t); }
  }
}
