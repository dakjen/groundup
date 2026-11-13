// Daily founding-member notes to the waitlist, Nov 14 to Nov 20, 2026, at
// 1 PM Eastern (vercel.json, ?foundingdaily=1). Dakotah asked for these to be
// scheduled on Nov 13, 2026. Text-only on purpose: an HTML part sends them to
// Gmail's Promotions tab. Signed by Gina; replies go to the team inbox.
// One note per day, chosen by the Eastern date. Nothing sends on a date that
// is not in SCHEDULE, so the job goes quiet by itself after November 20.
import { logEmails } from './waitlist.js';
import { firstName } from './_email.js';

// Eastern date -> 1-based position in `notes` below.
export const SCHEDULE = {
  '2026-11-14': 4, // You don't need a deal to start
  '2026-11-15': 1, // Quick question about your GroundUp spot
  '2026-11-16': 7, // The nine phases of a development
  '2026-11-17': 3, // What founding members keep
  '2026-11-18': 5, // December 5 in DC
  '2026-11-19': 8, // How much is the site actually worth?
  '2026-11-20': 6, // Founding membership closes tonight
};

const URL = 'community.drginamerritt.net';
const foot = `Warmly,
Gina

You're getting this because you joined the GroundUp waitlist. To stop these notes, reply with the word "stop".`;

export const notes = [
  { subject: 'Quick question about your GroundUp spot', body: `You signed up for the GroundUp waitlist, and since November 6 you've been able to join as a founding member. I wanted to check in, because I haven't seen you come through yet.

I understand there could be a lot of reasons. Maybe the timing is off. Maybe it's the cost, or you aren't sure which plan fits. Or maybe our emails never reached you, which we've heard has happened to a few people.

Whatever it is, I'd like to hear it. Hit reply and tell me in a sentence. Every answer gets read, and if something is in your way, we'll try to help.

The founding window closes Friday, November 20. If you're ready, go to ${URL}, click Sign In / Join, and use this email address.` },

  { subject: 'What you could open tonight', body: `You joined the waitlist before there was anything to see. There is now. If you created your account tonight, this is what you'd have in front of you:

The Development Overview. The whole life of a real estate deal in order, from finding a site to running the finished building, so you always know which phase you're in and what comes next.

Step-by-step courses on site control, the numbers, financing, approvals and construction. Written lessons you can read on your phone, each ending in one thing to do that week.

Live Lunch & Learns. Founding members get a full year of them included.

A community of people doing the same work, where you can see what others are building and where they're stuck.

Founding membership closes Friday, November 20. To get in before then, go to ${URL}, click Sign In / Join, and use this email address.` },

  { subject: 'What founding members keep', body: `I keep saying "founding member" without spelling out what it means. Here it is.

If you join by Friday, November 20, you get four things that nobody who joins later will get:

One. A quarter off your membership for the whole first year, on whichever plan you choose.

Two. A full year of my live Lunch & Learns, included.

Three. The founding member badge on your profile, permanently.

Four. An invitation to the launch party in Washington, DC on Saturday, December 5.

After the 20th, the membership is still there. Those four things are not.

To join, go to ${URL}, click Sign In / Join, and use this email address. You can cancel a monthly membership whenever you want.` },

  { subject: "You don't need a deal to start", body: `The most common reason people give me for waiting on GroundUp is some version of "I don't have a project yet."

That is the right time to start. The first course walks through an entire development, from the first look at a site to the day the building is running. People who take it before they have a deal know what to look for, what to ask, and what it takes to get from one phase to the next. People who learn it mid-deal learn it the hard way.

If you already have a project, it works the other way: find the phase you're in and start there.

Founding membership closes Friday, November 20. To join, go to ${URL}, click Sign In / Join, and use this email address.

If your reason is something else, reply and tell me.` },

  { subject: 'December 5 in DC', body: `On Saturday, December 5, from 4 to 6 PM, I'm hosting the GroundUp Launch Party in Washington, DC.

It's an afternoon with the first members and the people who helped me build this. The invitation, with the venue and RSVP, goes to founding members.

You're on the waitlist, so you can still become one. The cutoff is Friday, November 20. Join by then and the invitation comes to you.

It takes about two minutes. Go to ${URL}, click Sign In / Join, and use this email address.` },

  { subject: 'Founding membership closes tonight', body: `I hope this one reaches you. We've heard that some of our emails have been landing in spam, so if this is the first you're seeing of any of it, I'm sorry about that.

Today is the last day to join GroundUp as a founding member. It closes tonight, Friday, November 20, at 11:59 PM Eastern.

Founding members get a quarter off their first year, a year of live Lunch & Learns, the founding member badge, and an invitation to the launch party in DC on December 5.

I know this is a busy time of year, and I know it's a real decision. If now isn't the right time, that's completely fine. You can still join after today at the regular rate, and you'll be just as welcome.

If you do want in, go to ${URL}, click Sign In / Join, and use this email address.

And if you have a question, or something isn't working for you, reply and you'll get an answer today.` },

  // Curriculum notes (added Nov 12 at Dakotah's request). Lesson and phase
  // names are the live published titles; only the eight visible courses are named.
  { subject: 'The nine phases of a development', body: `If you've never taken a project from start to finish, the hardest part is knowing what comes next. So the first course inside GroundUp, The Development Overview, lays the whole thing out in order. Nine phases:

1. Feasibility
2. Predevelopment
3. Program Development
4. Acquisition
5. Development: financing, design, construction
6. Community Engagement
7. Construction
8. Stabilization
9. Compliance

Each phase is one lesson. It tells you what happens in that phase, who you need on your team, what it costs you, and what has to be true before you move to the next one. Each lesson ends with one thing to do that week on a real site.

The first one, Feasibility, starts with two questions to answer before you spend a dollar: does this jurisdiction have a large pool of subsidy funds, and how competitive is that pool?

All nine are open to you now. Founding membership closes Friday, November 20. Go to ${URL}, click Sign In / Join, and use this email address.` },

  { subject: 'How much is the site actually worth?', body: `That's the name of one of the lessons inside GroundUp. I wanted to show you a few more, because the lesson names say more about what you'd learn than I can in a paragraph.

How to Read a Market Before You Fall in Love With a Site

Managing Sellers: The Hardest Part Nobody Talks About

Matter of Right: What You Can Build Without Asking

Ownership Interest vs. Economic Interest: Know the Difference

JV Pitfalls: What Actually Goes Wrong

Go After the Funny Money First

When the Deal Blows Up Mid-Stream

The Fifteen-Year Clock

There are eight courses so far. They cover finding and controlling a site, zoning, why affordable housing doesn't pencil without subsidy, financing, building your team, design and construction, and the years after opening day.

Every one of them comes from deals I have worked on, including the ones that went wrong.

Founding membership closes Friday, November 20. Go to ${URL}, click Sign In / Join, and use this email address.` },
];

export const textFor = (n, first) => `Hi ${first},\n\n${n.body}\n\n${foot}`;

const easternDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

// Everyone on the waitlist (both lists) who has not joined a paid plan, is not
// a comped team account, has not opted out, and has not already had this day's note.
export async function foundingDailyAudience(sql, kind) {
  const joined = new Set((await sql`SELECT LOWER(email) AS email FROM users WHERE membership_status = 'active' AND tier IS DISTINCT FROM 'Free'`).map(r => r.email));
  const out = new Set((await sql`SELECT LOWER(email) AS email FROM email_optouts`).map(r => r.email));
  const had = new Set((await sql`SELECT LOWER(recipient_email) AS email FROM email_log WHERE kind = ${kind} AND ok`).map(r => r.email));
  const rows = await sql`SELECT name, email FROM waitlist WHERE NOT COALESCE(comped, FALSE) ORDER BY id`;
  const seen = new Set();
  return rows.filter(r => {
    const e = String(r.email || '').trim().toLowerCase();
    if (!e || seen.has(e) || joined.has(e) || out.has(e) || had.has(e)) return false;
    seen.add(e); return true;
  });
}

export async function foundingDaily(sql, { dry = false, day = easternDay() } = {}) {
  const [off] = await sql`SELECT value FROM settings WHERE key = 'founding_daily_off'`;
  const idx = SCHEDULE[day];
  const kind = `founding daily — ${day}`;
  if (!idx) return { v: 'fd1', day, scheduled: false };
  const note = notes[idx - 1];
  const audience = await foundingDailyAudience(sql, kind);
  if (dry || off?.value) return { v: 'fd1', day, subject: note.subject, paused: !!off?.value, dry, wouldSend: audience.length, to: dry ? audience.map(r => r.email) : undefined, sample: dry ? textFor(note, firstName(audience[0]?.name || '')) : undefined };
  let sent = 0;
  for (const r of audience) {
    let ok = false;
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: 'groundup@drginamerritt.net', name: 'Gina Merritt' },
          replyTo: { email: process.env.BREVO_REPLY_TO || 'djmj@nreuv.com', name: 'Gina Merritt' },
          to: [{ email: r.email }], subject: note.subject, textContent: textFor(note, firstName(r.name)),
        }),
      });
      ok = res.ok;
      if (!ok) console.error('founding daily send failed', r.email, res.status, (await res.text()).slice(0, 200));
    } catch (e) { console.error('founding daily send failed', r.email, e.message); }
    if (ok) sent++;
    await logEmails(sql, kind, 'waitlist', note.subject, [{ name: r.name, email: r.email, ok }]);
  }
  return { v: 'fd1', day, subject: note.subject, sent, total: audience.length };
}
