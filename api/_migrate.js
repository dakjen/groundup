import { neon } from '@neondatabase/serverless';

// Mirrors schema.sql. Safe to run repeatedly; executed on admin login so the
// database always matches the deployed code with no manual Neon step.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    tier TEXT DEFAULT 'Free', created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS headline TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS badge TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS free_lesson_key TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_status TEXT DEFAULT 'active'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS lnl_discount_until TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS comped BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS badges JSONB DEFAULT '[]'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_since TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS ip_agreed_at TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_community TIMESTAMP DEFAULT NOW()`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_dm TIMESTAMP DEFAULT NOW()`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS seen_announcement_id INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending', used BOOLEAN DEFAULT FALSE, used_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE referrals ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'invite'`,
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
  `CREATE TABLE IF NOT EXISTS session_requests (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW())`,
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
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS list TEXT DEFAULT 'insider'`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS founding_lnl BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS first10 BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS recommended_notified BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS rec_override TEXT`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS stretch_offer TEXT`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS comped BOOLEAN DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT,
    price_cents INTEGER NOT NULL, delivery_url TEXT, cover_url TEXT, value_cents INTEGER,
    position INTEGER DEFAULT 0, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_playbook BOOLEAN DEFAULT FALSE`,
  // A bundle is a product made of other products: no file of its own, and
  // buying it grants each document inside it.
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS bundle_items JSONB`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP`,
  `CREATE TABLE IF NOT EXISTS partners (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    logo_url TEXT,
    course_ids JSONB NOT NULL DEFAULT '[]',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS capture_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    place TEXT,
    created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS held_transfers (
    id SERIAL PRIMARY KEY,
    charge_id TEXT UNIQUE NOT NULL,
    customer_id TEXT,
    item TEXT,
    gross_cents INTEGER NOT NULL,
    held_cents INTEGER NOT NULL,
    rate_pct INTEGER NOT NULL DEFAULT 75,
    release_after TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'held',
    released_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS deal_leads (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    source TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS download_log (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL, created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE download_log ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'download'`,
  // View-only members are served rendered page images; the PDF itself never
  // leaves the server for them.
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS page_urls JSONB`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 0`,
  // A cohort is a taught program, not a bulk licence: it runs on a cadence,
  // between two dates, in a room of its own.
  `ALTER TABLE partners ADD COLUMN IF NOT EXISTS cadence TEXT`,
  `ALTER TABLE partners ADD COLUMN IF NOT EXISTS starts_on DATE`,
  `ALTER TABLE partners ADD COLUMN IF NOT EXISTS ends_on DATE`,
  `ALTER TABLE partners ADD COLUMN IF NOT EXISTS seats INTEGER`,
  `ALTER TABLE partners ADD COLUMN IF NOT EXISTS meeting_link TEXT`,
  `ALTER TABLE partners ADD COLUMN IF NOT EXISTS program TEXT`,
  // A referrer's own mark, shown on the page and the link preview.
  `ALTER TABLE partner_codes ADD COLUMN IF NOT EXISTS logo_url TEXT`,
  `ALTER TABLE lnl_rsvps ADD COLUMN IF NOT EXISTS question TEXT`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (
    id SERIAL PRIMARY KEY, key TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_auth_attempts_key ON auth_attempts(key, created_at)`,
  `CREATE TABLE IF NOT EXISTS user_notes (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_key TEXT NOT NULL, body TEXT DEFAULT '', updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, note_key))`,
  `CREATE TABLE IF NOT EXISTS email_log (
    id SERIAL PRIMARY KEY, kind TEXT NOT NULL, list TEXT, subject TEXT,
    recipient_name TEXT, recipient_email TEXT NOT NULL, ok BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS resources (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, url TEXT, code TEXT,
    category TEXT DEFAULT 'resource', min_tier TEXT DEFAULT 'Premium',
    position INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS recommendation TEXT`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS phase INTEGER`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS partner_slug TEXT`,
  `ALTER TABLE channels ADD COLUMN IF NOT EXISTS partner_slug TEXT`,
  `CREATE TABLE IF NOT EXISTS email_optouts (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS lesson_progress (user_id INTEGER NOT NULL, course_id TEXT NOT NULL, lesson_idx INTEGER NOT NULL, completed_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (user_id, course_id, lesson_idx))`,
  `CREATE TABLE IF NOT EXISTS login_codes (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, tries INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS glossary (
    id SERIAL PRIMARY KEY, term TEXT UNIQUE NOT NULL, definition TEXT NOT NULL,
    refs JSONB DEFAULT '[]', created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS lesson_responses (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL, lesson_id INTEGER NOT NULL, response TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, course_id, lesson_id))`,
  `CREATE TABLE IF NOT EXISTS partner_codes (
    id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL,
    owner_name TEXT NOT NULL, owner_email TEXT,
    goal INTEGER DEFAULT 5, rewarded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE partner_codes ADD COLUMN IF NOT EXISTS company TEXT`,
  `ALTER TABLE partner_codes ADD COLUMN IF NOT EXISTS tier_alerted INTEGER DEFAULT 0`,
  // referred_by (INTEGER, above) is the member who invited them — a user id.
  // A partner referral CODE is a different relationship and a different type,
  // so it gets its own column. They were previously sharing one, which made
  // partner attribution impossible to store and the referred-member discount
  // impossible to fire.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_code TEXT`,
  // First-run onboarding: the same questions the waitlist asks, so a member who
  // never joined the list still gets a real recommendation. Every answer is
  // optional; only the plan choice is required, and onboarded_at records that
  // they reached the end rather than that they answered anything.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onb_learn TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onb_pain TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onb_budget TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onb_source TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onb_role TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onb_phase TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onb_experience TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onb_focus TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onb_goal TEXT`,
  `CREATE TABLE IF NOT EXISTS resource_clicks (
    id SERIAL PRIMARY KEY, resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS lnl_rsvps (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, event_key))`,
  `CREATE TABLE IF NOT EXISTS retainers (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hours_per_month NUMERIC NOT NULL DEFAULT 10, monthly_amount NUMERIC NOT NULL DEFAULT 5000,
    status TEXT DEFAULT 'active', notes TEXT,
    started_at TIMESTAMP DEFAULT NOW(), created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS retainer_hours (
    id SERIAL PRIMARY KEY, retainer_id INTEGER NOT NULL REFERENCES retainers(id) ON DELETE CASCADE,
    hours NUMERIC NOT NULL, note TEXT, logged_on DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS retainer_files (
    id SERIAL PRIMARY KEY, retainer_id INTEGER NOT NULL REFERENCES retainers(id) ON DELETE CASCADE,
    title TEXT NOT NULL, url TEXT, kind TEXT DEFAULT 'link', uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS retainer_messages (
    id SERIAL PRIMARY KEY, retainer_id INTEGER NOT NULL REFERENCES retainers(id) ON DELETE CASCADE,
    from_admin BOOLEAN DEFAULT FALSE, body TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item TEXT NOT NULL, label TEXT, amount NUMERIC,
    status TEXT DEFAULT 'awaiting_booking',
    booked_at TIMESTAMP, nudges INTEGER DEFAULT 0, last_nudge_at TIMESTAMP,
    charge_id TEXT, created_at TIMESTAMP DEFAULT NOW())`,
  // A paid 1:1 is a small engagement, not just a receipt: it has a brief and
  // documents attached to it. The brief used to live in browser storage on the
  // admin's own machine, which meant it was not really stored at all.
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS brief TEXT`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS brief_at TIMESTAMPTZ`,
  // When the meeting actually is. Google Calendar isn't integrated, so this is
  // entered by the member after they book (or set by the team), which is still
  // far better than nobody on either side having it written down.
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`,
  // The Google event, so a session can be moved or cancelled from our side.
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS calendar_event_id TEXT`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS meet_link TEXT`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS event_link TEXT`,
  // One reaction per person per message per kind — the primary key enforces it,
  // so clicking twice removes rather than stacking.
  `CREATE TABLE IF NOT EXISTS message_reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id, kind))`,
  `CREATE INDEX IF NOT EXISTS message_reactions_msg ON message_reactions (message_id)`,
  `CREATE TABLE IF NOT EXISTS booking_files (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    title TEXT NOT NULL, url TEXT, kind TEXT DEFAULT 'link',
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  // Stripe Products and Prices, created once and reused, instead of inventing a
  // throwaway product on every checkout. Keyed by catalog item. This lives in
  // the database rather than in code because test and live mode have different
  // IDs — and staging and production already have separate databases, so each
  // holds its own without any chance of crossing them.
  `CREATE TABLE IF NOT EXISTS stripe_prices (
    item TEXT PRIMARY KEY, product_id TEXT NOT NULL, price_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL, interval TEXT,
    livemode BOOLEAN, synced_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
    stage TEXT, stage_color TEXT, duration TEXT, position INTEGER DEFAULT 0,
    lessons JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS dms (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_admin BOOLEAN DEFAULT FALSE, body TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())`,
  // When each person last opened each channel / DM thread — drives the unread bubbles
  // Owner deal profile: the deal they are working on, for the team to refer to
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS deal_profile JSONB`,
  `CREATE TABLE IF NOT EXISTS deal_files (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT, url TEXT NOT NULL, kind TEXT DEFAULT 'file', created_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_mode TEXT DEFAULT 'all'`,
  `CREATE TABLE IF NOT EXISTS mentions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, message_id INTEGER NOT NULL, channel_id INTEGER NOT NULL, by_user_id INTEGER, created_at TIMESTAMP DEFAULT NOW(), UNIQUE (user_id, message_id))`,
  `ALTER TABLE retainers ADD COLUMN IF NOT EXISTS private_notes TEXT`,
  // Advisory clients can have more than one project; each carries its own details and documents
  `CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, details JSONB, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`,
  `ALTER TABLE deal_files ADD COLUMN IF NOT EXISTS project_id INTEGER`,
  `ALTER TABLE deal_files ADD COLUMN IF NOT EXISTS size BIGINT DEFAULT 0`,
  `ALTER TABLE deal_files ADD COLUMN IF NOT EXISTS folder TEXT`,
  // Where an account came from (ad funnels): e.g. ig:playbook:spring — set by guest checkout and the free-seat form
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS acquisition TEXT`,
  `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS acquisition TEXT`,
  // Revenue ledger: one row per Stripe charge, the way the services agreement counts it
  `CREATE TABLE IF NOT EXISTS revenue_ledger (id SERIAL PRIMARY KEY, charge_id TEXT UNIQUE, customer_id TEXT, item TEXT, category TEXT, rate_pct INTEGER, gross_cents INTEGER DEFAULT 0, fee_cents INTEGER DEFAULT 0, net_cents INTEGER DEFAULT 0, held_cents INTEGER DEFAULT 0, nreuv_cents INTEGER DEFAULT 0, status TEXT DEFAULT 'paid', refunded_cents INTEGER DEFAULT 0, dispute_id TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`,
  // A hidden course with a release date shows as 'coming' and opens itself on the day
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS available_at TIMESTAMP`,
  // People who raised a hand to be a referral partner (from the /refer form)
  `CREATE TABLE IF NOT EXISTS partner_requests (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, company TEXT, phone TEXT, note TEXT, status TEXT DEFAULT 'new', created_at TIMESTAMP DEFAULT NOW())`,
  // Meetings an advisory client asks for: what they want to cover, how long, and when Dr. Merritt has it on the calendar
  `CREATE TABLE IF NOT EXISTS retainer_meetings (id SERIAL PRIMARY KEY, retainer_id INTEGER NOT NULL, minutes INTEGER DEFAULT 60, topic TEXT, status TEXT DEFAULT 'requested', scheduled_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, endpoint TEXT UNIQUE NOT NULL, keys JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS channel_mutes (user_id INTEGER NOT NULL, channel_id INTEGER NOT NULL, PRIMARY KEY (user_id, channel_id))`,
  `CREATE TABLE IF NOT EXISTS thread_seen (user_id INTEGER NOT NULL, kind TEXT NOT NULL, ref_id INTEGER NOT NULL, seen_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (user_id, kind, ref_id))`,
  `ALTER TABLE channels ADD COLUMN IF NOT EXISTS team_only BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE channels ADD COLUMN IF NOT EXISTS teaser BOOLEAN DEFAULT FALSE`,
  `INSERT INTO channels (slug, name, description, min_tier, admin_only_post, position, team_only)
    VALUES ('team-room', 'Team Room', 'Private — just us. Members never see this channel.', 'Basic', FALSE, 9, TRUE)
    ON CONFLICT (slug) DO NOTHING`,
  `INSERT INTO channels (slug, name, description, min_tier, admin_only_post, position) VALUES
    ('announcements', 'Announcements', 'Official updates from Dr. Merritt and the GroundUp team.', 'Basic', TRUE, 0),
    ('general', 'General', 'Introduce yourself and talk shop with fellow members.', 'Basic', FALSE, 1),
    ('financial-structuring', 'Financial Structuring', 'How to structure a deal and build the capital stack — debt, equity, tax credits, subsidy, and how the pieces fit.', 'Premium', FALSE, 2),
    ('jv-partnerships', 'JV & Partnerships', 'Find partners, structure splits, share opportunities.', 'Premium', FALSE, 3),
    ('opportunity-board', 'Opportunity Board', 'RFPs, funding windows, and deals worth chasing — posted by the team monthly. Reply in threads to discuss.', 'Premium', TRUE, 4),
    ('owner-lounge', 'Owner Lounge', 'Private channel for Owner members and advisory clients.', 'Elite', FALSE, 5),
    ('financial-modeling', 'Financial Modeling', 'Questions about your pro forma — assumptions, operating expenses, debt sizing, the flow of funds, what the model is telling you.', 'Premium', FALSE, 4),
    ('deal-room', 'Deal Room', 'Deal-specific questions — a number that is not working, a term you are weighing, a decision on a real deal. Owner members and advisory clients only. Full deal reviews happen in advisory calls and the retainer.', 'Elite', FALSE, 8),
    ('groundup', 'GroundUp', 'Feedback on the platform, subjects and content you want covered, channels you think we should add, and questions about how GroundUp works. The team reads everything here.', 'Basic', FALSE, 2)
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
