// The general waitlist's last two emails (Dakotah, Nov 22, 2026). Founding
// membership closed Nov 20, so nothing here mentions founding: regular prices
// only. Plain text from "Gina Merritt" so they land in the main inbox. After
// Dec 1 the waitlist no longer exists; the Dec 1 note is the last one it gets.
//
//   · Sun Nov 29: "GroundUp opens Tuesday"
//   · Tue Dec 1:  "GroundUp is open", with the plan we'd pick for them and their link
//
// The separate plan-recommendation email is folded into Dec 1 (no extra email).
// Nothing sends until the team approves the wording: settings.general_launch_ok.

import { firstName, siteUrl } from './_email.js';

const SIG = `Warmly,
Gina

Dr. Gina Merritt
Founder, GroundUp
community.drginamerritt.net`;

const FOOT = `———
You're getting this because you joined the GroundUp waitlist.`;

const PRICE = { Basic: '$49.99 a month', Builder: '$149.99 a month', Premium: '$249.99 a month', Elite: '$499.99 a month' };

export function generalTwoDays(name) {
  return {
    subject: 'GroundUp opens Tuesday',
    text: `Hi ${firstName(name) || 'there'},

GroundUp opens to everyone this Tuesday, December 1.

That morning I'll send you your personal link, along with the plan I'd pick for you based on what you told us when you joined the waitlist.

Inside, you'll find the courses, a community of people building real projects, and my Lunch & Learns.

We're also planning a launch party in DC. More on that soon.

See you Tuesday.

${SIG}

${FOOT}`,
  };
}

export function generalLaunch(name, rec, link, advisorLink) {
  const first = firstName(name) || 'there';
  let pick;
  if (rec.tier === 'Advisor') {
    pick = `From what you told us, your project sounds like a fit for working with me directly, as your Senior Advisor.

${advisorLink ? `Book a call with me here: ${advisorLink}` : 'Reply to this email and we will set up a call.'}`;
  } else {
    const price = PRICE[rec.tier] || rec.price;
    const perks = (rec.features || []).slice(0, 4).map(f => `•  ${f}`).join('\n');
    pick = `From what you told us when you joined the waitlist, here's the plan I'd pick for you:

${rec.label}, ${price}
${perks}

Your personal link: ${link}

It takes you straight to sign-up with this email address. Every other plan is there too, if another one fits you better.`;
  }
  return {
    subject: 'GroundUp is open',
    text: `Hi ${first},

GroundUp is open.

${pick}

If you have any questions, just reply to this email.

${SIG}

${FOOT} This is the last waitlist note. From here on, you'll only hear from us if you join.`,
  };
}

export function generalLinkFor(rec, email) {
  return rec.oneTime ? `${siteUrl()}/pricing` : `${siteUrl()}/?join=1&plan=${rec.tier}&email=${encodeURIComponent(email)}`;
}

export async function sendPlainText(to, subject, textContent) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: 'groundup@drginamerritt.net', name: 'Gina Merritt' },
      replyTo: { email: process.env.BREVO_REPLY_TO || 'djmj@nreuv.com', name: 'Gina Merritt' },
      to: [{ email: to }], subject, textContent,
    }),
  });
  if (!res.ok) console.error('plain send failed', to, res.status);
  return res.ok;
}

export async function generalApproved(sql) {
  try { const [r] = await sql`SELECT value FROM settings WHERE key = 'general_launch_ok'`; return !!r?.value; } catch { return false; }
}
