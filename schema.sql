-- Run this in your Neon SQL editor before deploying

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  tier TEXT DEFAULT 'Free',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Membership additions (safe to re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';
-- For admins: badge shown on community posts — 'team' (default) or 'drmerritt'
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge TEXT;
-- Free plan: the single lesson this user has claimed, e.g. 'mc1:0'. NULL = not used yet.
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_lesson_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_status TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Per-user course access (one-time purchases get expires_at; subscriptions leave it NULL)
CREATE TABLE IF NOT EXISTS entitlements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,           -- 'mc1'..'mc4' or 'all'
  source TEXT DEFAULT 'manual',      -- manual | stripe_onetime | stripe_subscription
  expires_at TIMESTAMP,              -- NULL = no expiry (subscription-managed)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Community: Slack-style channels with threaded messages
CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  min_tier TEXT DEFAULT 'Basic',     -- Free | Basic | Premium | Elite
  admin_only_post BOOLEAN DEFAULT FALSE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  parent_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,  -- NULL = top-level, else thread reply
  body TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lunch & Learn: 25%-off-first-month window after attending (2 months)
ALTER TABLE users ADD COLUMN IF NOT EXISTS lnl_discount_until TIMESTAMP;

-- Comp coupon codes for Lunch & Learn access (Dr. Merritt can hand these out)
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  kind TEXT DEFAULT 'lnl_comp',
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- "What do you want to learn about?" submissions from Lunch & Learn signups
CREATE TABLE IF NOT EXISTS lnl_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Launch waitlist: joined with a chosen plan; launch email carries their plan link
CREATE TABLE IF NOT EXISTS waitlist (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'Basic',        -- Free | Basic | Premium | Elite | pass_single | pass_all
  phone TEXT,
  reason TEXT,
  launched_notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS reason TEXT;

-- Simple key/value settings (e.g. the live Lunch & Learn session link)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Direct messages: one private thread per member with Dr. Merritt & the team (Elite benefit)
CREATE TABLE IF NOT EXISTS dms (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_admin BOOLEAN DEFAULT FALSE,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Default channels
INSERT INTO channels (slug, name, description, min_tier, admin_only_post, position) VALUES
  ('announcements', 'Announcements', 'Official updates from Dr. Merritt and the GroundUp team.', 'Basic', TRUE, 0),
  ('general', 'General', 'Introduce yourself and talk shop with fellow members.', 'Basic', FALSE, 1),
  ('deals-financing', 'Deals & Financing', 'Capital stacks, LIHTC, gap funding, underwriting questions.', 'Basic', FALSE, 2),
  ('jv-partnerships', 'JV & Partnerships', 'Find partners, structure splits, share opportunities.', 'Premium', FALSE, 3),
  ('elite-lounge', 'Elite Lounge', 'Private channel for Elite members and advisory clients.', 'Elite', FALSE, 4)
ON CONFLICT (slug) DO NOTHING;

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, parent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dms_user ON dms(user_id, created_at);
