// Brevo (transactional email + contacts). Configure in Vercel env:
//   BREVO_API_KEY      — required for any email to send
//   BREVO_SENDER_EMAIL — verified sender (default info@nreuv.com)
//   BREVO_SENDER_NAME  — display name (default "GroundUp")
//   BREVO_LIST_ID      — optional contact list id for new signups
// Every helper is fire-and-forget safe: missing config or API errors log and
// return false without breaking the request that triggered them.

const BREVO = 'https://api.brevo.com/v3';

function sender() {
  return {
    email: process.env.BREVO_SENDER_EMAIL || 'groundup@drginamerritt.net',
    name: process.env.BREVO_SENDER_NAME || 'GroundUp',
  };
}

async function brevo(path, body) {
  const key = process.env.BREVO_API_KEY;
  if (!key) { console.warn('Brevo not configured — skipping', path); return null; }
  const res = await fetch(BREVO + path, {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('Brevo error', path, res.status, text);
    return null;
  }
  return res.json().catch(() => ({}));
}

import { createHmac } from 'crypto';

// Unsubscribe: a signed per-address link in every email footer. Clicking it
// lands the address in email_optouts; marketing sends check that table first.
// Transactional email (resets, receipts) still delivers to opted-out addresses.
export function unsubToken(email) {
  return createHmac('sha256', process.env.SESSION_SECRET || 'unsub').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 24);
}
const unsubLink = (email) => `${siteUrl()}/api/auth?unsubscribe=${encodeURIComponent(String(email).trim().toLowerCase())}&t=${unsubToken(email)}`;

// Two shells: the dark brand wrap (default), and a light cream one for
// utility emails like sign-in codes where a wall of black reads heavy.
const FONT_LINK = '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">';
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS  = "'DM Sans',Arial,Helvetica,sans-serif";

const wrap = (inner, toEmail, light) => light === 'card' ? `
  ${FONT_LINK}
  <div style="background:#000000;padding:32px 16px;font-family:${SANS};">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;color:#333333;">
      <div style="background:#000000;padding:26px 32px 22px;">
        <img src="${siteUrl()}/icon-192.png" alt="" width="42" height="42" style="display:block;border-radius:10px;margin-bottom:10px;" />
        <div style="font-family:${SANS};font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:1px;margin-bottom:4px;">GROUNDUP</div>
        <div style="font-family:${SANS};font-size:10px;color:#a08560;letter-spacing:2px;text-transform:uppercase;">for underrepresented developers</div>
      </div>
      <div style="height:4px;background:#b80101;font-size:0;line-height:0;">&nbsp;</div>
      <div style="padding:32px 32px 28px;">
        ${inner}
      </div>
      <div style="background:#000000;padding:16px 32px;font-family:${SANS};font-size:11px;color:#7a6151;">
        Northern Real Estate Urban Ventures · 825 10th St NW, Suite 981, Washington, DC 20001${toEmail ? ` · <a href="${unsubLink(toEmail)}" style="color:#a08560;">Unsubscribe</a>` : ''}
      </div>
    </div>
  </div>` : light ? `
  <div style="background:#f3ede4;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dccf;border-radius:16px;padding:36px 32px;color:#333333;">
      <img src="${siteUrl()}/icon-192.png" alt="" width="42" height="42" style="display:block;border-radius:10px;margin-bottom:10px;" />
      <div style="font-size:20px;font-weight:bold;color:#161616;letter-spacing:1px;margin-bottom:4px;">GROUNDUP</div>
      <div style="font-size:10px;color:#a08560;letter-spacing:2px;text-transform:uppercase;margin-bottom:28px;">for underrepresented developers</div>
      ${inner}
      <div style="border-top:1px solid #efe8db;margin-top:32px;padding-top:16px;font-size:11px;color:#9a9285;">
        Northern Real Estate Urban Ventures · 825 10th St NW, Suite 981, Washington, DC 20001${toEmail ? ` · <a href="${unsubLink(toEmail)}" style="color:#a08560;">Unsubscribe</a>` : ''}
      </div>
    </div>
  </div>` : `
  <div style="background:#000;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#0d0404;border:1px solid #2a0000;border-radius:16px;padding:36px 32px;color:#e8d8d8;">
      <div style="font-size:20px;font-weight:bold;color:#fff;letter-spacing:1px;margin-bottom:4px;">GROUNDUP</div>
      <div style="font-size:10px;color:#7a6151;letter-spacing:2px;text-transform:uppercase;margin-bottom:28px;">for underrepresented developers</div>
      ${inner}
      <div style="border-top:1px solid #2a0000;margin-top:32px;padding-top:16px;font-size:11px;color:#5a4040;">
        Northern Real Estate Urban Ventures · 825 10th St NW, Suite 981, Washington, DC 20001${toEmail ? ` · <a href="${unsubLink(toEmail)}" style="color:#7a5555;">Unsubscribe</a>` : ''}
      </div>
    </div>
  </div>`;


// First name for greetings — an honorific keeps its next word, so
// "Dr. Gina Merritt" greets as "Dr. Gina", never a bare "Dr."
export function firstName(full, fallback = 'there') {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  if (/^(Dr|Mr|Mrs|Ms|Mx|Prof|Rev)\.?$/i.test(parts[0])) return parts[1] ? `${parts[0]} ${parts[1]}` : fallback;
  return parts[0];
}

export async function sendEmail(to, subject, innerHtml, opts = {}) {
  if (opts.marketing && await isOptedOut(to)) return false;
  const r = await brevo('/smtp/email', {
    sender: sender(),
    to: [{ email: to }],
    subject,
    htmlContent: wrap(innerHtml, to, opts.light),
  });
  return !!r;
}

async function isOptedOut(email) {
  try {
    if (!process.env.DATABASE_URL) return false;
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const [row] = await sql`SELECT 1 AS x FROM email_optouts WHERE email = ${String(email).trim().toLowerCase()}`;
    return !!row;
  } catch { return false; }
}

// The full suppression list, for filtering bulk audiences in one query
export async function optedOutSet() {
  try {
    if (!process.env.DATABASE_URL) return new Set();
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    return new Set((await sql`SELECT email FROM email_optouts`).map(r => r.email));
  } catch { return new Set(); }
}

export async function addContact(email, name, attributes = {}, extraListIds = []) {
  const body = {
    email,
    attributes: { FIRSTNAME: firstName(name, ''), FULLNAME: name || '', ...attributes },
    updateEnabled: true,
  };
  const listIds = [Number(process.env.BREVO_LIST_ID), ...extraListIds].filter(n => Number.isFinite(n) && n > 0);
  if (listIds.length) body.listIds = listIds;
  const r = await brevo('/contacts', body);
  return !!r;
}

// Everyone with Lunch & Learn access lands on the L&L email list (session
// reminders, recording drops). Works via a dedicated Brevo list when
// BREVO_LNL_LIST_ID is set; the LNL attribute makes them segmentable either way.
export async function addLnlContact(email, name) {
  const lnlList = Number(process.env.BREVO_LNL_LIST_ID);
  return addContact(email, name, { LNL: true }, lnlList ? [lnlList] : []);
}

export function welcomeEmail(name, tier) {
  return {
    subject: 'Welcome to GroundUp',
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">Welcome, ${firstName(name)}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Your GroundUp account is ready on the <strong style="color:#b80101;">${tier === 'Basic' ? 'Member' : tier}</strong> plan. Decades of affordable-housing deal experience, distilled into a curriculum built for developers like you.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Sign in anytime to pick up where you left off — your courses, the community, and your membership all live in one place.</p>
      <a href="https://community.drginamerritt.net" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Go to GroundUp</a>`,
  };
}

// Send to many recipients individually (no shared 'to' — keeps addresses private)
export async function sendBulk(recipients, subject, innerHtml) {
  const out = await optedOutSet();
  recipients = recipients.filter(r => !out.has(String(r.email || '').trim().toLowerCase()));
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 10) {
    const chunk = recipients.slice(i, i + 10);
    const results = await Promise.allSettled(chunk.map(r => sendEmail(r.email, subject, innerHtml.replaceAll('{{FIRSTNAME}}', firstName(r.name)))));
    sent += results.filter(x => x.status === 'fulfilled' && x.value).length;
  }
  return sent;
}

export function siteUrl() {
  return process.env.SITE_URL || 'https://community.drginamerritt.net';
}

export function resetEmail(name, link) {
  return {
    subject: 'Reset your GroundUp password',
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">Password reset</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Hi ${firstName(name)} — we received a request to reset your GroundUp password. This link works for one hour:</p>
      <a href="${link}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin:8px 0;">Reset Password</a>
      <p style="color:#7a6060;font-size:12px;line-height:1.7;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
  };
}

export function inviteEmail(name, link) {
  return {
    subject: "You're invited to GroundUp",
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">You're invited, ${firstName(name)}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Dr. Gina Merritt's team invited you to GroundUp — a curriculum and community for aspiring and emerging affordable-housing developers, built on 30+ years of real deals.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Your invite includes a free trial week — it's live for the next 7 days.</p>
      <a href="${link}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Accept Your Invite</a>`,
  };
}

// Personal month-free gift: one link, one person, one use — locked to their email
export function giftEmail(name, link, personalMessage) {
  return {
    subject: `${firstName(name)}, your first month of GroundUp is on Dr. Merritt`,
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:3px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">A personal gift</div>
      <h2 style="color:#f5e8e8;font-size:26px;margin:0 0 14px;">This one's on us, ${firstName(name)}.</h2>
      ${personalMessage ? `<div style="background:#12060a;border-left:3px solid #b80101;padding:14px 20px;margin:0 0 16px;">
        <p style="color:#e0c4c4;font-size:14px;line-height:1.9;margin:0;font-style:italic;">${String(personalMessage).replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>
        <p style="color:#8a7070;font-size:12px;margin:8px 0 0;">— Dr. Gina Merritt &amp; the GroundUp team</p>
      </div>` : ''}
      <p style="color:#a89080;font-size:14px;line-height:1.9;">Dr. Gina Merritt wants you inside GroundUp — her full development curriculum, the community, and everything she fought 30+ years to learn. So your <strong style="color:#f0d8d8;">first month is free</strong>, with her compliments.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.9;">This link is <strong style="color:#f0d8d8;">yours alone</strong> — it works once, only with this email address, so hold onto it.</p>
      <a href="${link}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:14px 30px;font-weight:bold;font-size:15px;text-decoration:none;margin:6px 0;">Claim your free month →</a>
      <p style="color:#7a6060;font-size:12px;line-height:1.7;">Pick any membership at checkout — the first month comes off automatically.</p>`,
  };
}

export function dmReplyEmail(name) {
  return {
    subject: 'Dr. Merritt\\u2019s team replied to your message',
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">You have a reply.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Hi ${firstName(name)} — Dr. Merritt's team responded to your direct message. Sign in to read it in your private thread.</p>
      <a href="${siteUrl()}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Read the Reply</a>`,
  };
}

export function eventEmail(title, date, time, description, audienceHasAccess) {
  return {
    subject: `Upcoming: ${title}`,
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">Upcoming Session</div>
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 10px;">${title}</h2>
      <p style="color:#c9a227;font-size:14px;font-weight:bold;margin:0 0 16px;">${date}${time ? ' · ' + time : ''}</p>
      ${description ? `<p style="color:#a89080;font-size:14px;line-height:1.8;">${description}</p>` : ''}
      <p style="color:#a89080;font-size:14px;line-height:1.8;">${audienceHasAccess ? 'Your join link is on your Lunch & Learn page — see you there.' : 'Grab a seat to join live — $39.99 per session.'}</p>
      <a href="${siteUrl()}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">${audienceHasAccess ? 'Open Lunch & Learn' : 'Get Access'}</a>`,
  };
}

export function lnlReminderEmail(title, date, time, link) {
  return {
    subject: `Reminder: ${title || 'Lunch & Learn'} — ${date}${time ? ' at ' + time : ''}`,
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">Session Reminder</div>
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 10px;">${title || 'Lunch & Learn with Dr. Merritt'}</h2>
      <p style="color:#c9a227;font-size:14px;font-weight:bold;margin:0 0 16px;">${date}${time ? ' · ' + time : ''}</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Hi {{FIRSTNAME}} — your session is coming up. Join with the link below:</p>
      <a href="${link}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Join the Session</a>
      <p style="color:#7a6060;font-size:12px;line-height:1.7;margin-top:14px;">This link is for you — please don't forward it.</p>`,
  };
}

export function meetingEmail(name, title, date, time, link) {
  return {
    subject: `Your session with Dr. Merritt — ${date}${time ? ' at ' + time : ''}`,
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">Your 1-on-1 Session</div>
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 10px;">${title || 'Session with Dr. Merritt'}</h2>
      <p style="color:#c9a227;font-size:14px;font-weight:bold;margin:0 0 16px;">${date}${time ? ' · ' + time : ''}</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Hi ${firstName(name)} — your session is coming up. Join with the link below:</p>
      ${link ? `<a href="${link}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Join the Meeting</a>` : ''}
      <p style="color:#7a6060;font-size:12px;line-height:1.7;margin-top:14px;">Need to reschedule? Reply to this email and the team will take care of it.</p>`,
  };
}

// The deal-support nudge: sent manually from the Email tab to any segment —
// three doors, each with a handle: upgrade to Owner, book the free discovery
// call for the retainer, or buy the \$1,500 intake outright.
export function dealSupportNudgeEmail() {
  return {
    subject: 'When you\'re ready for help on YOUR deal',
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">Hi {{FIRSTNAME}} — got a deal that needs more than a course?</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">The curriculum, the community, and the Lunch & Learns build your foundation. But "I can't solve the gap on MY deal" isn't a lesson — it's deal work, and there are three ways to get Dr. Merritt on it:</p>
      <div style="margin:18px 0;padding:16px 18px;background:#12060a;border:1px solid #b8010140;border-radius:10px;">
        <p style="color:#f0d8d8;font-size:14px;font-weight:bold;margin:0 0 6px;">1 · Upgrade to Owner — \$499.99/mo</p>
        <p style="color:#a89080;font-size:13px;line-height:1.7;margin:0;">Bring YOUR deal to your one-on-one advisory calls with Dr. Merritt, plus direct messages, unlimited downloads, and the Owner Lounge. <a href="${siteUrl()}/pricing" style="color:#b80101;font-weight:bold;">Upgrade here →</a></p>
      </div>
      <div style="margin:18px 0;padding:16px 18px;background:#12060a;border:1px solid #b8010140;border-radius:10px;">
        <p style="color:#f0d8d8;font-size:14px;font-weight:bold;margin:0 0 6px;">2 · Book a free discovery call — Senior Advisor retainer</p>
        <p style="color:#a89080;font-size:13px;line-height:1.7;margin:0;">For whole-deal involvement, Dr. Merritt works month over month on your project — deal review, capital strategy, negotiation prep. The discovery call is free and there's no obligation. <a href="mailto:groundup@drginamerritt.net?subject=Senior%20Advisor%20%E2%80%94%20discovery%20call" style="color:#b80101;font-weight:bold;">Book your discovery call →</a></p>
      </div>
      <div style="margin:18px 0;padding:16px 18px;background:#12060a;border:1px solid #b8010140;border-radius:10px;">
        <p style="color:#f0d8d8;font-size:14px;font-weight:bold;margin:0 0 6px;">3 · Start with the \$1,500 Full Project Intake</p>
        <p style="color:#a89080;font-size:13px;line-height:1.7;margin:0;">Send her the whole thing — pro forma, capital stack, site, timeline — and she finds what you missed. If you continue into the retainer, the \$1,500 is credited against your first month. <a href="${siteUrl()}/contact" style="color:#b80101;font-weight:bold;">Buy the intake →</a></p>
      </div>
      <p style="color:#7a5050;font-size:13px;line-height:1.7;">Not there yet? Keep building — the courses and community aren't going anywhere. When your deal heats up, this email is the map.</p>`,
  };
}

// Sent by the daily cron when a course pass runs out: 7 days to extend, and
// 15% off if they commit to a full year of membership.
export function passExpiryEmail(name, single) {
  const first = firstName(name);
  return {
    subject: `${first}, your course pass has ended — you have 7 days to extend`,
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">Your ${single ? 'course pass' : 'All-Access Pass'} just wrapped, ${first}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">We hope the material moved you forward. For the next <strong style="color:#f0d8d8;">7 days</strong>, here are your ways to keep going:</p>
      <div style="margin:18px 0;padding:16px 18px;background:#12060a;border:1px solid #b8010140;border-radius:10px;">
        <p style="color:#f0d8d8;font-size:14px;font-weight:bold;margin:0 0 6px;">Extend your access</p>
        <p style="color:#a89080;font-size:13px;line-height:1.7;margin:0;">Grab another pass — 60 days of one course (\$100) or 30 days of everything (\$275). <a href="https://community.drginamerritt.net/pricing" style="color:#b80101;font-weight:bold;">Get a pass →</a></p>
      </div>
      <div style="margin:18px 0;padding:16px 18px;background:#12060a;border:1px solid #b8010140;border-radius:10px;">
        <p style="color:#f0d8d8;font-size:14px;font-weight:bold;margin:0 0 6px;">Or go all in: an annual membership at 15% off</p>
        <p style="color:#a89080;font-size:13px;line-height:1.7;margin:0;">Membership means every course, always — plus the community, from \$49.99/mo. Pay for the year within your 7-day window and <strong style="color:#f0d8d8;">15% comes off automatically at checkout</strong> — instead of the usual 10% annual discount. <a href="https://community.drginamerritt.net/pricing?annual=1" style="color:#b80101;font-weight:bold;">Become a member →</a></p>
      </div>
      ${dealSupportBlock()}`,
  };
}

// Retainer-track waitlisters get more than a confirmation — they get the next
// step: a discovery call with Dr. Merritt. Calls close retainers; emails don't.
export function retainerInterestEmail(name, callLink) {
  const first = firstName(name);
  const href = callLink || 'mailto:groundup@drginamerritt.net?subject=' + encodeURIComponent('Senior Advisor — discovery call');
  return {
    subject: `${first} — let's talk about your project`,
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:3px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">Senior Advisor Retainer</div>
      <h2 style="color:#f5e8e8;font-size:26px;margin:0 0 14px;">Thank you for your interest, ${first}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.9;">You told us you're looking at the <strong style="color:#f0d8d8;">Senior Advisor level</strong> — Dr. Merritt working your project with you, month over month. That conversation doesn't start with a checkout page; it starts with a call.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.9;">Set up a <strong style="color:#f0d8d8;">free discovery call with Dr. Gina Merritt</strong> to walk through your project and your needs — where the deal stands, what's in the way, and how a partnership could work. No obligation; you'll leave the call knowing your next step either way.</p>
      <a href="${href}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:14px 30px;font-weight:bold;font-size:14px;text-decoration:none;margin:10px 0 18px;">Set Up Your Discovery Call →</a>
      <p style="color:#7a5050;font-size:12.5px;line-height:1.8;">Have a live deal and want to go deeper right away? The <strong style="color:#c8a8a8;">$1,500 Full Project Intake</strong> is the front door: Dr. Merritt takes in your entire project — pro forma, capital stack, site, timeline — and finds what you missed. If you continue into the retainer, the $1,500 credits against your first month.</p>`,
  };
}

export function broadcastEmail(subject, message) {
  const paragraphs = message.split(/\\n{2,}/).map(p =>
    `<p style="color:#a89080;font-size:14px;line-height:1.8;">${p.replace(/\\n/g, '<br/>')}</p>`).join('');
  return {
    subject,
    html: `
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Hi {{FIRSTNAME}},</p>
      ${paragraphs}
      <a href="${siteUrl()}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Open GroundUp</a>`,
  };
}

export function waitlistConfirmEmail(name, founding, first10, list = 'insider') {
  const first = firstName(name);
  const perks = `
      ${founding ? `<div style="background:#12060a;border:1px solid #b8010140;border-radius:12px;padding:16px 20px;margin:14px 0;">
        <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">✦ Founding 25</div>
        <p style="color:#e0c4c4;font-size:14px;line-height:1.8;margin:0;">Your first <strong style="color:#f5e8e8;">YEAR of LIVE Lunch & Learn sessions with Dr. Merritt is on us</strong> — free, on any plan. It attaches to your account automatically the moment you create it at launch.</p>
      </div>` : ''}
      ${first10 ? `<div style="background:#12060a;border:1px solid #b8010140;border-radius:12px;padding:16px 20px;margin:14px 0;">
        <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">✦ First 10</div>
        <p style="color:#e0c4c4;font-size:14px;line-height:1.8;margin:0;">Your special treat: a <strong style="color:#f5e8e8;">14-day trial of any one course</strong>, plus your own personal referral link — friends who join through it get the same trial. Both unlock when you create your account at launch.</p>
      </div>` : ''}`;
  // What GroundUp IS — shared by both emails: why it exists, what it teaches, the value
  const about = `
      <div style="border-top:1px solid #2a0000;margin-top:20px;padding-top:18px;">
        <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:10px;">What GroundUp is</div>
        <p style="color:#a89080;font-size:14px;line-height:1.9;">Dr. Gina Merritt went from public housing in the Bronx to <strong style="color:#f0d8d8;">billions of dollars in real estate deals</strong> — and she had to fight for every piece of knowledge alone. She built GroundUp so you don't have to. It's the full development playbook, taught from deals that actually closed, plus a community of developers building alongside you and direct access to her and her team.</p>
        <p style="color:#c8a8a8;font-size:13px;line-height:2;margin:10px 0;">
          <span style="color:#b80101;">→</span> Predevelopment — finding, evaluating &amp; controlling a deal<br/>
          <span style="color:#b80101;">→</span> Building your team, JV partnerships &amp; structuring<br/>
          <span style="color:#b80101;">→</span> Financing — capital stacks, LIHTC &amp; closing the gap<br/>
          <span style="color:#b80101;">→</span> Why affordable housing doesn't pencil (and how to close anyway)<br/>
          <span style="color:#b80101;">→</span> Zoning, entitlements, design &amp; construction, and life after opening day<br/>
          <span style="color:#b80101;">→</span> Live Lunch &amp; Learns, work sessions &amp; the Opportunity Board</p>
        <p style="color:#a89080;font-size:14px;line-height:1.9;">Every membership includes all-access to the full course library — and each tier up adds more of Dr. Merritt herself: her community, her tools, and at the top, a direct line to her and one of only 15 Owner seats. New expertise is added every quarter.</p>
      </div>`;
  if (list === 'insider') {
    return {
      subject: founding ? "Dr. Merritt invited you — and you're one of the first 25" : first10 ? "Dr. Merritt invited you — and you're one of the first 10" : "Dr. Merritt invited you inside",
      html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:3px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">Insider Waitlist</div>
      <h2 style="color:#f5e8e8;font-size:26px;margin:0 0 14px;">Welcome inside, ${first}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.9;"><strong style="color:#f0d8d8;">Dr. Gina Merritt invited you herself.</strong> This list isn't public — it's the people she wants in the room first. That means <strong style="color:#f0d8d8;">the doors open for you before they open for anyone else</strong>: you get access at the insider launch, ahead of the public, with a personal plan recommendation built from exactly what you told us.</p>
      ${perks}
      ${about}
      <p style="color:#a89080;font-size:14px;line-height:1.9;margin-top:16px;">We read every answer — what you want to learn, what's standing in your way — and we're building for exactly that. Keep this between us for now.</p>
      <p style="color:#7a6060;font-size:12px;line-height:1.7;">Nothing to do yet. Watch your inbox — insiders hear from us first.</p>`,
    };
  }
  return {
    subject: "You're on the GroundUp waitlist",
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:3px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">GroundUp Waitlist</div>
      <h2 style="color:#f5e8e8;font-size:26px;margin:0 0 14px;">Your spot is saved, ${first}.</h2>
      ${perks}
      <p style="color:#a89080;font-size:14px;line-height:1.9;">We read every answer you gave — what you want to learn, what's in your way — and we're building for exactly that. When GroundUp opens, you'll get a personal recommendation for the plan that fits you, with your own link to claim it.</p>
      ${about}
      <p style="color:#a89080;font-size:14px;line-height:1.9;margin-top:16px;">It's almost time.</p>`,
  };
}

export function countdownEmail(stage, launchText) {
  return {
    subject: `${stage} until GroundUp launches`,
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">Launch Countdown</div>
      <h2 style="color:#f5e8e8;font-size:28px;margin:0 0 10px;">${stage} to go.</h2>
      ${launchText ? `<p style="color:#e0c4c4;font-size:14px;font-weight:bold;margin:0 0 16px;">Doors open ${launchText}</p>` : ''}
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Hi {{FIRSTNAME}} — GroundUp is almost here. You're on the waitlist, which means you get first notice and a personal link to claim your plan the moment we open.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Keep an eye on your inbox.</p>`,
  };
}

// ~14 days out: the personalized recommendation — builds anticipation, no pay
// link yet. The launch-day email (below) carries the actual checkout link.
export function recommendEmail(name, rec, launchAt, painPoint) {
  const dateText = launchAt ? new Date(launchAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'soon';
  return {
    subject: `${firstName(name)}, here's the plan we'd pick for you`,
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">Launch is almost here</div>
      <h2 style="color:#f5e8e8;font-size:28px;margin:0 0 16px;">We read your answers, ${firstName(name)}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Doors open <strong style="color:#f0d8d8;">${dateText}</strong>. We went through what you told us${painPoint ? " — what you want to learn, and what's been standing in your way" : ""} — and based on your goals and budget, this is the plan we'd put you on:</p>
      <div style="background:#12060a;border:1px solid #b8010130;border-radius:12px;padding:20px 24px;margin:16px 0;">
        <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">Our recommendation for you</div>
        <div style="color:#f5e8e8;font-size:22px;font-weight:bold;">${rec.label} <span style="color:#8a7070;font-size:14px;font-weight:normal;">· ${rec.price}</span></div>
        ${rec.features?.length ? `<div style="margin-top:12px;">${rec.features.map(f => `<div style="color:#c8a8a8;font-size:13px;line-height:2;"><span style="color:#b80101;">→</span> ${f}</div>`).join('')}</div>` : ''}
      </div>
      ${rec.stretch ? `<div style="background:#12060a;border:1px solid #c9a22745;border-radius:12px;padding:18px 22px;margin:16px 0;">
        <div style="font-size:10px;color:#c9a227;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">✦ A special offer, just for you</div>
        <div style="color:#a89080;font-size:13px;line-height:1.8;margin-bottom:8px;">Based on what you're working through, we think <strong style="color:#f0d8d8;">${rec.stretch.label}</strong> would serve you better — so we're offering it to you at <strong style="color:#c9a227;">${rec.stretch.offer}</strong>.</div>
        <div style="color:#e0c4c4;font-size:15px;font-weight:bold;">${rec.stretch.label} · ${rec.stretch.price} <span style="color:#c9a227;font-size:13px;">→ ${rec.stretch.offer}</span></div>
        <div style="margin-top:8px;">${rec.stretch.extras.map(f => `<div style="color:#a89080;font-size:12.5px;line-height:1.9;"><span style="color:#c9a227;">+</span> ${f}</div>`).join('')}</div>
      </div>` : ''}
      ${rec.next ? `<div style="background:#0d0a04;border:1px solid #2a200030;border-radius:12px;padding:16px 22px;margin:16px 0;">
        <div style="font-size:10px;color:#8a7070;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">One step up, if you want it</div>
        <div style="color:#e0c4c4;font-size:15px;font-weight:bold;">${rec.next.label} · ${rec.next.delta}</div>
        <div style="margin-top:8px;">${rec.next.extras.map(f => `<div style="color:#a89080;font-size:12.5px;line-height:1.9;"><span style="color:#b80101;">+</span> ${f}</div>`).join('')}</div>
      </div>` : ''}
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Nothing to do yet — on launch day you'll get one more email with your personal checkout link. Keep an eye out.</p>`,
  };
}

export function launchEmail(name, rec, link, painPoint, stretchLink) {
  return {
    subject: "We're live \u2014 here's the plan we recommend for you",
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">We're Live</div>
      <h2 style="color:#f5e8e8;font-size:28px;margin:0 0 16px;">GroundUp is open, ${firstName(name)}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">You're getting this first because you're an insider. We read what you told us${painPoint ? " \u2014 including what's been standing in your way" : ""} \u2014 and based on your goals and your budget, here's our recommendation:</p>
      <div style="background:#12060a;border:1px solid #b8010130;border-radius:12px;padding:20px 24px;margin:16px 0;">
        <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">Recommended for you</div>
        <div style="color:#f5e8e8;font-size:22px;font-weight:bold;">${rec.label} <span style="color:#8a7070;font-size:14px;font-weight:normal;">\u00b7 ${rec.price}</span></div>
        ${rec.features?.length ? `<div style="margin-top:12px;">${rec.features.map(f => `<div style="color:#c8a8a8;font-size:13px;line-height:2;"><span style="color:#b80101;">\u2192</span> ${f}</div>`).join('')}</div>` : ''}
      </div>
      <a href="${link}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:14px 30px;font-weight:bold;font-size:15px;text-decoration:none;margin:6px 0;">${rec.ctaLabel || `Join as ${rec.label} \u2014 secure checkout \u2192`}</a>
      ${rec.stretch && stretchLink ? `<div style="background:#12060a;border:1px solid #c9a22745;border-radius:12px;padding:18px 22px;margin:16px 0;">
        <div style="font-size:10px;color:#c9a227;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">\u2726 Your special offer is live</div>
        <div style="color:#a89080;font-size:13px;line-height:1.8;margin-bottom:8px;">Based on what you're working through, <strong style="color:#f0d8d8;">${rec.stretch.label}</strong> would serve you better \u2014 and your <strong style="color:#c9a227;">${rec.stretch.offer}</strong> is attached to this link:</div>
        <div style="margin-bottom:10px;">${rec.stretch.extras.map(f => `<div style="color:#a89080;font-size:12.5px;line-height:1.9;"><span style="color:#c9a227;">+</span> ${f}</div>`).join('')}</div>
        <a href="${stretchLink}" style="display:inline-block;background:transparent;color:#c9a227;border:1px solid #c9a22760;border-radius:8px;padding:12px 24px;font-weight:bold;font-size:14px;text-decoration:none;">Claim ${rec.stretch.label} at 10% off \u2192</a>
      </div>` : ''}
      ${rec.next ? `<div style="background:#0d0a04;border:1px solid #2a200030;border-radius:12px;padding:16px 22px;margin:16px 0;">
        <div style="font-size:10px;color:#8a7070;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">One step up, if you want it</div>
        <div style="color:#e0c4c4;font-size:15px;font-weight:bold;">${rec.next.label} \u00b7 ${rec.next.delta}</div>
        <div style="margin-top:8px;">${rec.next.extras.map(f => `<div style="color:#a89080;font-size:12.5px;line-height:1.9;"><span style="color:#b80101;">+</span> ${f}</div>`).join('')}</div>
      </div>` : ''}
      <p style="color:#7a6060;font-size:12px;line-height:1.7;">Not the right fit? Every plan is on the pricing page \u2014 and you can change anytime.</p>`,
  };
}

// The standing invitation — appended to member-facing emails. Every touchpoint
// reminds people that deal-specific support has a doorway: Premium/Elite, or just ask.
export function dealSupportBlock() {
  return `<div style="margin-top:22px;padding:16px 18px;background:#12060a;border:1px solid #b8010140;border-radius:10px;">
    <p style="color:#c8a8a8;font-size:13px;line-height:1.7;margin:0;">Working on a specific deal? The courses and community build your foundation — <strong style="color:#f0d8d8;">deal-specific support</strong> comes with the Premium and Owner memberships, or you can send Dr. Merritt your whole project with the <strong style="color:#f0d8d8;">\$1,500 Full Project Intake</strong> (credited to your first retainer month if you continue). <a href="https://community.drginamerritt.net/contact" style="color:#b80101;font-weight:bold;">Send it to us →</a></p>
  </div>`;
}

export function lnlAccessEmail(name, expiresAt, hasLink) {
  const through = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return {
    subject: "You're in — Lunch & Learn access confirmed",
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">You're in, ${firstName(name)}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Your seat is reserved${through ? ` — your access runs through <strong style="color:#f0d8d8;">${through}</strong>` : ''} for the next live session with Dr. Merritt, its recording included.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">${hasLink ? 'The join link for the next session is waiting on your Lunch & Learn page.' : 'The join link for each session appears on your Lunch & Learn page closer to the date.'} While you're there, tell us what you want to learn about — Dr. Merritt's team reads every submission.</p>
      <p style="color:#c9a227;font-size:14px;line-height:1.8;font-weight:bold;">Your attendee perk: 25% off your first month of membership if you join within two months.</p>
      <p style="color:#a89080;font-size:13px;line-height:1.7;">Every recording you have access to lives on your <a href="https://community.drginamerritt.net/lunchlearn" style="color:#b80101;font-weight:bold;">Lunch & Learn page</a> — catch up on any session you missed.</p>
      <a href="https://community.drginamerritt.net" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Open Lunch & Learn</a>
      ${dealSupportBlock()}`,
  };
}

// ── The founding-member thank-you: sent once to the insider waitlist ─────────
// Dakotah's review (Sep 18): "You were here first" stands alone as the
// heading, the thank-you with their name sits under it, the founding-member
// section stays, black comes back as the page around a white card (the
// 'card' shell), brand fonts where clients allow them, and the dates as a
// row of calendar tiles — a table, because that survives every mail client.
/* One month as a 7-column table. `marks` is { 'YYYY-MM-DD': { bg, fg, ring } }.
   Cells are small on purpose so four months fit a 560px email; the marked
   days carry the meaning, the rest is context. */
function monthGrid(year, month, marks) {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const name = first.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const key = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const cell = (inner, style) => `<td align="center" style="width:14.28%;height:26px;font-family:${SANS};font-size:11px;line-height:1;${style}">${inner}</td>`;
  let rows = '', d = 1;
  for (let r = 0; r < 6 && d <= days; r++) {
    let tr = '';
    for (let c = 0; c < 7; c++) {
      const inGrid = (r > 0 || c >= first.getUTCDay()) && d <= days;
      if (!inGrid) { tr += cell('', ''); continue; }
      const m = marks[key(d)];
      tr += m
        ? cell(m.border
            ? `<span style="display:inline-block;min-width:22px;padding:3px 0;border-radius:11px;border:2px solid ${m.border};color:${m.border};font-weight:bold;">${d}</span>`
            : `<span style="display:inline-block;min-width:22px;padding:5px 0;border-radius:11px;background:${m.bg};color:${m.fg};font-weight:bold;">${d}</span>`, '')
        : cell(d, 'color:#555555;');
      d++;
    }
    rows += `<tr>${tr}</tr>`;
  }
  const wk = ['S','M','T','W','T','F','S'].map((w) => cell(w, 'color:#999999;font-size:9px;font-weight:bold;height:18px;')).join('');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e3dbd0;border-radius:10px;overflow:hidden;">
      <tr><td colspan="7" align="center" style="background:#161616;color:#ffffff;font-family:${SERIF};font-size:15px;font-weight:700;letter-spacing:1px;padding:7px 4px;">${name} ${year}</td></tr>
      <tr>${wk}</tr>
      ${rows}
    </table>`;
}

export function foundingThanksEmail(name, opts = {}) {
  const first = firstName(name);
  const now = opts.now || new Date();
  // Today in Eastern time, then the two months after it; November and
  // December are fixed because those are the launch dates.
  const etParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y0 = +etParts.find((p) => p.type === 'year').value, m0 = +etParts.find((p) => p.type === 'month').value - 1, d0 = +etParts.find((p) => p.type === 'day').value;
  const y1 = m0 === 11 ? y0 + 1 : y0, m1 = (m0 + 1) % 12;
  const todayKey = `${y0}-${String(m0 + 1).padStart(2, '0')}-${String(d0).padStart(2, '0')}`;
  const marks = {
    [todayKey]: { bg: '#161616', fg: '#ffffff' },
    '2026-11-01': { bg: '#b80101', fg: '#ffffff' },
    '2026-12-01': { bg: '#a08560', fg: '#ffffff' },
    '2026-12-05': { border: '#b80101' },
  };

  return {
    subject: 'You were here first \u2014 your insider access opens November 1',
    html: `
      <img src="${siteUrl()}/opt/founding-banner-v2.jpg" alt="Dr. Gina Merritt at 9410 Hough" width="496" style="width:100%;border-radius:10px;display:block;margin:0 0 26px;" />

      <h1 style="font-family:${SERIF};color:#161616;font-size:34px;line-height:1.15;font-weight:700;margin:0 0 10px;">You were here first.</h1>
      <p style="font-family:${SANS};color:#161616;font-size:16px;line-height:1.7;margin:0 0 18px;">Thank you, ${first}, for joining the GroundUp waitlist.</p>
      <p style="font-family:${SANS};color:#444444;font-size:15px;line-height:1.85;margin:0 0 24px;">We are so excited \u2014 and so close. What Dr.\u00A0Gina Merritt has been building is almost ready to open its doors. And because you believed in this before anyone else, you\u2019re not just an early signup. <strong style="color:#b80101;">You are a founding member.</strong></p>

      <div style="border-left:4px solid #b80101;background:#faf7f7;border-radius:0 12px 12px 0;padding:22px 26px;margin:0 0 26px;">
        <div style="font-family:${SANS};font-size:11px;color:#b80101;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:10px;">What founding member means</div>
        <p style="font-family:${SANS};color:#333333;font-size:14px;line-height:1.85;margin:0 0 10px;">You walk in on <strong style="color:#b80101;">November 1 \u2014 a full month before the public</strong> \u2014 with the courses, the community, all of it. And your account carries a permanent <strong style="color:#b80101;">founding badge</strong> in the community, so everyone knows you were part of the original circle.</p>
        <p style="font-family:${SANS};color:#333333;font-size:14px;line-height:1.85;margin:0 0 12px;">And founding members lock in <strong style="color:#b80101;">25% off any membership for their entire first year</strong> \u2014 a rate that will never be offered again after launch:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 12px;">
          <tr><td style="font-family:${SANS};font-size:14px;color:#161616;font-weight:bold;padding:5px 12px 5px 0;white-space:nowrap;">Member</td><td style="font-family:${SANS};font-size:14px;color:#444444;padding:5px 0;"><s style="color:#999999;">$49.99</s> &nbsp;<strong style="color:#b80101;">$37.49/mo</strong> your first year</td></tr>
          <tr><td style="font-family:${SANS};font-size:14px;color:#161616;font-weight:bold;padding:5px 12px 5px 0;white-space:nowrap;">Builder</td><td style="font-family:${SANS};font-size:14px;color:#444444;padding:5px 0;"><s style="color:#999999;">$149.99</s> &nbsp;<strong style="color:#b80101;">$112.49/mo</strong> your first year</td></tr>
          <tr><td style="font-family:${SANS};font-size:14px;color:#161616;font-weight:bold;padding:5px 12px 5px 0;white-space:nowrap;">Premium</td><td style="font-family:${SANS};font-size:14px;color:#444444;padding:5px 0;"><s style="color:#999999;">$249.99</s> &nbsp;<strong style="color:#b80101;">$187.49/mo</strong> your first year</td></tr>
          <tr><td style="font-family:${SANS};font-size:14px;color:#161616;font-weight:bold;padding:5px 12px 5px 0;white-space:nowrap;">Owner</td><td style="font-family:${SANS};font-size:14px;color:#444444;padding:5px 0;"><s style="color:#999999;">$499.99</s> &nbsp;<strong style="color:#b80101;">$374.99/mo</strong> your first year</td></tr>
          <tr><td colspan="2" style="font-family:${SANS};font-size:13px;color:#444444;padding:5px 0;">\u2026plus your <strong style="color:#161616;">first year of LIVE Lunch &amp; Learns free</strong> \u2014 and if you\u2019re headed for the Senior Advisor retainer, <strong style="color:#161616;">15% off your first three retainer months</strong>.</td></tr>
        </table>
        <p style="font-family:${SANS};color:#333333;font-size:14px;line-height:1.85;margin:0;">It all applies automatically the moment you <strong style="color:#b80101;">sign up and choose your membership</strong> \u2014 no codes to remember, nothing to claim. We\u2019ll recognize you.</p>
      </div>

      <div style="font-family:${SANS};font-size:11px;color:#161616;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 12px;">The dates that matter</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 12px;">
        <tr>
          <td width="50%" valign="top" style="padding:0 6px 12px 0;">${monthGrid(y0, m0, marks)}</td>
          <td width="50%" valign="top" style="padding:0 0 12px 6px;">${monthGrid(y1, m1, marks)}</td>
        </tr>
        <tr>
          <td width="50%" valign="top" style="padding:0 6px 0 0;">${monthGrid(2026, 10, marks)}</td>
          <td width="50%" valign="top" style="padding:0 0 0 6px;">${monthGrid(2026, 11, marks)}</td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px;">
        <tr><td style="padding:3px 0;font-family:${SANS};font-size:12px;color:#444444;"><span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:#161616;vertical-align:middle;margin-right:8px;"></span><strong style="color:#161616;">Today</strong> \u2014 you\u2019re on the list</td></tr>
        <tr><td style="padding:3px 0;font-family:${SANS};font-size:12px;color:#444444;"><span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:#b80101;vertical-align:middle;margin-right:8px;"></span><strong style="color:#161616;">November 1</strong> \u2014 insider access opens. Founding members walk in a full month before the public: courses, community, all of it.</td></tr>
        <tr><td style="padding:3px 0;font-family:${SANS};font-size:12px;color:#444444;"><span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:#a08560;vertical-align:middle;margin-right:8px;"></span><strong style="color:#161616;">December 1</strong> \u2014 full public launch. You\u2019ll already be a month ahead.</td></tr>
        <tr><td style="padding:3px 0;font-family:${SANS};font-size:12px;color:#444444;"><span style="display:inline-block;width:12px;height:12px;border-radius:6px;border:2px solid #b80101;box-sizing:border-box;vertical-align:middle;margin-right:8px;"></span><strong style="color:#161616;">December 5 \u2014 The Launch Party.</strong> Every founding member is invited \u2014 save the date; your invitation is coming soon.</td></tr>
      </table>

      <p style="font-family:${SANS};color:#444444;font-size:15px;line-height:1.85;margin:0 0 26px;">This community was built on 30+ years and billions of dollars in real deals \u2014 and it was built for you. We can\u2019t wait to show you inside.</p>
      <p style="font-family:${SANS};color:#777777;font-size:13px;line-height:1.8;margin:26px 0 0;">With gratitude,<br /><strong style="color:#161616;">Dr. Gina Merritt</strong> &amp; the GroundUp team</p>`,
    light: 'card',
  };
}

// For rendering previews outside a send.
export const _wrapForPreview = wrap;
