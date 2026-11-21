// Daily founding-member notes to the waitlist, Nov 14 to Nov 20, 2026, at
// 1 PM Eastern (vercel.json, ?foundingdaily=1). Dakotah asked for these to be
// scheduled on Nov 13, 2026. Text-only on purpose: an HTML part sends them to
// Gmail's Promotions tab. Signed by Gina; replies go to the team inbox.
// One note per day, chosen by the Eastern date. Nothing sends on a date that
// is not in SCHEDULE, so the job goes quiet by itself after November 20.
import { logEmails } from './waitlist.js';
import { firstName, sendEmail, siteUrl, generalFoundingEmail } from './_email.js';

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

async function freezeRule(sql) {
  const rows = await sql`SELECT key, value FROM settings WHERE key IN ('waitlist_freeze_at', 'waitlist_freeze_exempt')`;
  const v = (k) => rows.find(r => r.key === k)?.value;
  const freeze = v('waitlist_freeze_at') && !isNaN(Date.parse(v('waitlist_freeze_at'))) ? new Date(v('waitlist_freeze_at')) : new Date('2026-11-07T05:00:00.000Z');
  return { freeze, exempt: new Set(String(v('waitlist_freeze_exempt') || '').toLowerCase().split(/[\s,]+/).filter(Boolean)) };
}

// 9 AM Eastern, Nov 14 to Nov 20 (vercel.json, ?foundingwelcome=1). Dakotah,
// Nov 13, 2026: anyone who joins the waitlist gets an email the next morning
// inviting them to be a founding member, until founding closes Nov 20. This
// covers everyone who signed up after the Nov 6 send to the general list and
// before today (Eastern), once each. The freeze in settings waitlist_freeze_at
// was moved to the founding close so these people can actually join.
const AFTER_NOV6_SEND = '2026-11-07T05:00:00.000Z';
export async function foundingWelcome(sql, { dry = false } = {}) {
  const kind = 'founding seats open — late signup';
  const today = easternDay();
  if (today > '2026-11-20') return { v: 'fw2', closed: true, sent: 0 };
  const joined = new Set((await sql`SELECT LOWER(email) AS email FROM users WHERE membership_status = 'active' AND tier IS DISTINCT FROM 'Free'`).map(r => r.email));
  const out = new Set((await sql`SELECT LOWER(email) AS email FROM email_optouts`).map(r => r.email));
  const had = new Set((await sql`SELECT LOWER(recipient_email) AS email FROM email_log WHERE kind = ${kind} AND ok`).map(r => r.email));
  const rows = (await sql`SELECT name, email, created_at FROM waitlist WHERE created_at >= ${AFTER_NOV6_SEND} AND NOT COALESCE(comped, FALSE) ORDER BY id`)
    .filter(r => { const e = String(r.email).toLowerCase(); return easternDay(new Date(r.created_at)) < today && !joined.has(e) && !out.has(e) && !had.has(e); });
  if (dry) return { v: 'fw2', dry, today, to: rows.map(r => r.email) };
  let sent = 0;
  for (const r of rows) {
    const mail = generalFoundingEmail(r.name, { late: true, link: `${siteUrl()}/?join=1&email=${encodeURIComponent(r.email)}` });
    const ok = await sendEmail(r.email, mail.subject, mail.html, { marketing: true }); if (ok) sent++;
    await logEmails(sql, kind, 'general', mail.subject, [{ name: r.name, email: r.email, ok: !!ok }]);
  }
  return { v: 'fw2', sent, total: rows.length };
}

// Everyone on the waitlist (both lists) who has not joined a paid plan, is not
// a comped team account, has not opted out, and has not already had this day's note.
export async function foundingDailyAudience(sql, kind) {
  const joined = new Set((await sql`SELECT LOWER(email) AS email FROM users WHERE membership_status = 'active' AND tier IS DISTINCT FROM 'Free'`).map(r => r.email));
  const out = new Set((await sql`SELECT LOWER(email) AS email FROM email_optouts`).map(r => r.email));
  const had = new Set((await sql`SELECT LOWER(recipient_email) AS email FROM email_log WHERE kind = ${kind} AND ok`).map(r => r.email));
  const rows = await sql`SELECT name, email, created_at FROM waitlist WHERE NOT COALESCE(comped, FALSE) ORDER BY id`;
  // Only people who can actually join: on the waitlist before the Nov 7 freeze,
  // or let through it by name. Later signups wait for December 1 (api/auth.js).
  const { freeze, exempt } = await freezeRule(sql);
  const seen = new Set();
  return rows.filter(r => {
    const e = String(r.email || '').trim().toLowerCase();
    if (!e || seen.has(e) || joined.has(e) || out.has(e) || had.has(e)) return false;
    if (new Date(r.created_at) >= freeze && !exempt.has(e)) return false;
    seen.add(e); return true;
  });
}

export async function foundingDaily(sql, { dry = false, day = easternDay() } = {}) {
  const [off] = await sql`SELECT value FROM settings WHERE key = 'founding_daily_off'`;
  const idx = SCHEDULE[day];
  const kind = `founding daily — ${day}`;
  if (!idx) return { v: 'fd1', day, scheduled: false };
  const note = notes[idx - 1];
  let audience = await foundingDailyAudience(sql, kind);
  // The Nov 19 note is the "land is worth zero" idea. People with an account
  // and no plan already had it in their own note on Nov 18, so they skip this one.
  if (day === '2026-11-19') {
    const hadLand = new Set((await sql`SELECT LOWER(recipient_email) AS email FROM email_log WHERE kind = 'free plan note 1' AND ok`).map(r => r.email));
    audience = audience.filter(r => !hadLand.has(String(r.email).trim().toLowerCase()));
  }
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

// One-time "how to join, step by step" note (Dakotah, Nov 17, 2026): people
// were making an account and not getting through payment. Goes once, at the
// 9 AM Eastern run on Nov 18, to the same audience as the daily notes. Sends
// everyone through Pricing, the route every paid member has used. Signed Gina
// (Dakotah: emails are always signed Gina or the GroundUp team).
const HOWTO_DAY = '2026-11-18';
export const howToNote = { subject: 'How to join GroundUp, step by step', body: `A few people told us they made an account but could not finish joining. Here are the exact steps.

1. Go to ${URL} and click Pricing at the top.

2. Scroll to the plans and click the button under the one you want: Member, Builder, Premium or Owner.

3. Create your account with this email address and a password of 8 or more characters. Tick the agreement box and click Create Account.

4. The secure payment page opens next. Enter your card and click Subscribe. Your membership starts once the payment goes through. An account without payment is not a membership yet.

Already made an account? Click Sign In / Join at the top right and sign in. Then open Pricing and click your plan. The payment page opens from there.

If anything stops you, reply and tell me which step. A person on the team will get you in.

Founding membership closes Friday, November 20 at 11:59 PM Eastern.` };

export async function howToJoin(sql, { dry = false, day = easternDay() } = {}) {
  const kind = 'how to join — steps';
  if (day !== HOWTO_DAY) return { v: 'ht1', day, scheduled: false };
  const audience = await foundingDailyAudience(sql, kind);
  if (dry) return { v: 'ht1', day, dry, subject: howToNote.subject, wouldSend: audience.length, to: audience.map(r => r.email), sample: textFor(howToNote, firstName(audience[0]?.name || '')) };
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
          to: [{ email: r.email }], subject: howToNote.subject, textContent: textFor(howToNote, firstName(r.name)),
        }),
      });
      ok = res.ok;
      if (!ok) console.error('how to join send failed', r.email, res.status, (await res.text()).slice(0, 200));
    } catch (e) { console.error('how to join send failed', r.email, e.message); }
    if (ok) sent++;
    await logEmails(sql, kind, 'waitlist', howToNote.subject, [{ name: r.name, email: r.email, ok }]);
  }
  return { v: 'ht1', day, subject: howToNote.subject, sent, total: audience.length };
}

// "Save us as a contact" (Dakotah, Nov 17, 2026), text-only like the daily
// notes so it reaches the main inbox. The preview goes to Dakotah's inbox
// only. The list send is contactNoteSend below.
export const contactNote = { subject: 'Save our contact so GroundUp emails reach you', body: `Some of our emails have been landing in spam or the promotions tab. There is a quick fix: save us as a contact.

Our email: groundup@drginamerritt.net
Our phone: (202) 505-1444

One tap saves both:
https://${URL}/groundup-contact.vcf

iPhone, Android or Mac: tap the link, then tap Add or Save.
Outlook: open the file it downloads and click Save & Close.
Gmail: hover over our name at the top of this email and click Add to contacts.

If this email was in spam or promotions, please move it to your main inbox too. That tells your mail app to keep us there.

That is all. Thank you for doing it.` };

export async function contactNotePreview(sql) {
  const to = 'dakotah@dakjencreative.com';
  const subject = '[PREVIEW] ' + contactNote.subject;
  let ok = false;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: 'groundup@drginamerritt.net', name: 'Gina Merritt' },
        replyTo: { email: process.env.BREVO_REPLY_TO || 'djmj@nreuv.com', name: 'Gina Merritt' },
        to: [{ email: to }], subject, textContent: textFor(contactNote, 'Dakotah'),
      }),
    });
    ok = res.ok;
    if (!ok) console.error('contact note preview failed', res.status, (await res.text()).slice(0, 200));
  } catch (e) { console.error('contact note preview failed', e.message); }
  await logEmails(sql, 'preview — save our contact (text)', 'preview', contactNote.subject, [{ name: 'Dakotah Jennifer', email: to, ok }]);
  return { v: 'cn1', sent: ok };
}

// The send to everyone (Dakotah, Nov 17, 2026: "email looks good pls send to
// everyone"): every address on the waitlist and every account, paid members
// included, once each. People who opted out of email are left out.
export async function contactNoteSend(sql, { dry = false } = {}) {
  const kind = 'save our contact';
  const out = new Set((await sql`SELECT LOWER(email) AS email FROM email_optouts`).map(r => r.email));
  const had = new Set((await sql`SELECT LOWER(recipient_email) AS email FROM email_log WHERE kind = ${kind} AND ok`).map(r => r.email));
  const rows = [
    ...(await sql`SELECT name, email FROM users ORDER BY id`),
    ...(await sql`SELECT name, email FROM waitlist ORDER BY id`),
  ];
  const seen = new Set();
  const audience = rows.filter(r => {
    const e = String(r.email || '').trim().toLowerCase();
    if (!e || !e.includes('@') || seen.has(e) || out.has(e) || had.has(e)) return false;
    seen.add(e); return true;
  });
  if (dry) return { v: 'cn2', dry, subject: contactNote.subject, wouldSend: audience.length, alreadySent: had.size, optedOut: out.size, to: audience.map(r => `${r.name || ''} <${r.email}>`), sample: textFor(contactNote, firstName(audience[0]?.name || '')) };
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
          to: [{ email: String(r.email).trim() }], subject: contactNote.subject, textContent: textFor(contactNote, firstName(r.name)),
        }),
      });
      ok = res.ok;
      if (!ok) console.error('contact note send failed', r.email, res.status, (await res.text()).slice(0, 200));
    } catch (e) { console.error('contact note send failed', r.email, e.message); }
    if (ok) sent++;
    await logEmails(sql, kind, 'everyone', contactNote.subject, [{ name: r.name, email: r.email, ok }]);
  }
  return { v: 'cn2', subject: contactNote.subject, sent, total: audience.length };
}

// Reply drafts for Dr. Merritt (Dakotah, Nov 17, 2026: "send this in a
// traditional email to gmerritt ... so she can copy paste"). Plain text so the
// drafts paste cleanly. Goes to Gina with a copy to Dakotah, once.
const REPLY_DRAFTS = `Hi Dr. Gina,

Dakotah asked us to send you a few short replies you can copy and paste when people ask you for a "quick chat" or for development support. Each one points them to GroundUp. Change any wording you like.


1. SOMEONE YOU DON'T KNOW ASKS FOR A QUICK CHAT

Thank you for reaching out. I'd love to help. So that I can give people real attention, I now do all of my advising through GroundUp, my development community. That is where I answer questions, walk through deals, and teach the process step by step.

You can join here: https://${URL}

Once you're in, bring your question and I'll see it.


2. "CAN I PICK YOUR BRAIN ABOUT MY PROJECT?"

I appreciate you thinking of me. A quick chat rarely does a project justice, so I built GroundUp for exactly this. Inside, you get the lessons, the tools, and a place to ask me about your own deal.

Start here: https://${URL}

Tell me about your project when you join. I'd like to hear where you are.


3. SOMEONE ASKS FOR DEVELOPMENT SUPPORT ON A DEAL

Thank you for telling me about your project. Development support now runs through GroundUp. Members can request support on a deal there, and that is where I look at the numbers, the site and the next decision with you.

Here is the link: https://${URL}

Join, then send your request from inside. That puts your deal in front of me the right way.


4. SOMEONE YOU KNOW AND LIKE

So good to hear from you. My calendar is spoken for these days, so I've put everything I'd tell you over coffee into GroundUp, and I'm in there every week answering questions.

Come join me: https://${URL}

I'd love to see you in there.


5. ONE LINE, FOR A TEXT OR DM

Thank you for asking! I do all my advising through GroundUp now: https://${URL}. Join and bring your question there.


Two things to check before you use them: the replies say you answer member questions yourself and are in GroundUp every week, and that members request deal support from inside the membership. If either should be worded differently, tell Dakotah and we will fix the drafts.

The GroundUp team`;

export async function replyDraftsToGina(sql) {
  const kind = 'team — reply drafts for Gina';
  const to = 'gmerritt@nreuv.com', cc = 'dakotah@dakjencreative.com';
  const subject = 'Replies you can paste when people ask for a quick chat';
  const [had] = await sql`SELECT 1 AS x FROM email_log WHERE kind = ${kind} AND ok LIMIT 1`;
  if (had) return { v: 'rd1', sent: false, already: true };
  let ok = false;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: 'groundup@drginamerritt.net', name: 'GroundUp' },
        replyTo: { email: 'djmj@nreuv.com', name: 'Dakotah Jennifer' },
        to: [{ email: to }], cc: [{ email: cc }], subject, textContent: REPLY_DRAFTS,
      }),
    });
    ok = res.ok;
    if (!ok) console.error('reply drafts send failed', res.status, (await res.text()).slice(0, 200));
  } catch (e) { console.error('reply drafts send failed', e.message); }
  await logEmails(sql, kind, 'team', subject, [{ name: 'Dr. Gina Merritt', email: to, ok }]);
  return { v: 'rd1', sent: ok };
}

// Notes to people who made an account and have not chosen a plan (Dakotah,
// Nov 18, 2026): "start right at the front with, you haven't upgraded your
// plan ... send one now, send one tomorrow morning, and then send one on
// Saturday ... obviously with different tidbits." Text-only from Gina. Each
// carries one idea from a lesson, in the lesson's own words, and a link to
// Pricing. Note 1 is sent by hand on Nov 18; notes 2 and 3 go at 9 AM Eastern
// on the dates below (vercel.json, ?freeplan=1). Each person gets each note
// once, and nothing after they pay or opt out.
const FREE_SCHEDULE = { '2026-11-19': 2, '2026-11-21': 3 };
const freeOpen = `You made a GroundUp account but haven't chosen a plan yet. We'd love for you to join the community and keep learning on your way into development.

Here is a taste of what is inside.`;
const freeClose = `Choose your plan here:
https://${URL}/pricing

Warmly,
Gina

You're getting this because you made a GroundUp account. To stop these notes, reply with the word "stop".`;
export const freeNotes = [
  { subject: 'Your GroundUp account is waiting on a plan', tidbit: `In affordable housing, land is worth zero. Not as a figure of speech. If a project needs tax credits and subsidy, that is because it cannot carry normal debt and equity. So there is no room for expensive land. The more you pay for the site, the more subsidy you have to find.

That comes from the lesson "How Much Is the Site Actually Worth?", which walks through how to back into a land price you can defend.` },
  { subject: 'Go after the funny money first', tidbit: `Most developers line up their financing in this order: the tax credits, the construction loan, the permanent debt, and then the gap. I do it in the opposite order. I find the gap first and spend the first months filling it.

Tax credits are relatively fixed. Debt is relatively fixed, because your rents drive what you can borrow. What makes or breaks an affordable housing deal is the subsidy: the city money, the foundation grants, the CDFI loans. I call it the funny money, and I go after it first.

That comes from the lesson "Go After the Funny Money First" in the financing course.` },
  { subject: 'Title comes first, always', tidbit: `Once you are under contract, the clock starts. You have a limited window to find the problems that would change your decision to buy.

Title comes first, always. Pull it early and look carefully. You will find things: unpaid water bills, old liens, easements, strange ownership histories. One deal had an owner who owed $250,000 in water bills. You need to know that before you commit.

That comes from the lesson "Due Diligence: What You Need Before You're Locked In", which goes through the full checklist.` },
];
const freeText = (n, first) => `Hi ${first},\n\n${freeOpen}\n\n${n.tidbit}\n\n${freeClose}`;
const freeKind = (i) => `free plan note ${i}`;

export async function freePlanNote(sql, { dry = false, day = easternDay(), index } = {}) {
  const idx = index || FREE_SCHEDULE[day];
  if (!idx) return { v: 'fp1', day, scheduled: false };
  const note = freeNotes[idx - 1];
  const kind = freeKind(idx);
  const out = new Set((await sql`SELECT LOWER(email) AS email FROM email_optouts`).map(r => r.email));
  const had = new Set((await sql`SELECT LOWER(recipient_email) AS email FROM email_log WHERE kind = ${kind} AND ok`).map(r => r.email));
  // Free Lunch & Learn seat holders got their account from the ad page, not by
  // choosing to join; the "you haven't picked a plan" notes are not for them.
  let seat = new Set();
  try { seat = new Set((await sql`SELECT email FROM funnel_leads WHERE came_for IN ('free_seat', 'year_pass')`).map(r => r.email)); } catch {}
  const audience = (await sql`SELECT name, email FROM users WHERE tier = 'Free' AND role = 'member' AND NOT COALESCE(comped, FALSE) ORDER BY id`)
    .filter(r => { const e = String(r.email || '').trim().toLowerCase(); return e && !out.has(e) && !had.has(e) && !seat.has(e); });
  if (dry) return { v: 'fp1', day, dry, note: idx, subject: note.subject, wouldSend: audience.length, to: audience.map(r => r.email), sample: freeText(note, firstName(audience[0]?.name || '')) };
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
          to: [{ email: String(r.email).trim() }], subject: note.subject, textContent: freeText(note, firstName(r.name)),
        }),
      });
      ok = res.ok;
      if (!ok) console.error('free plan note failed', r.email, res.status, (await res.text()).slice(0, 200));
    } catch (e) { console.error('free plan note failed', r.email, e.message); }
    if (ok) sent++;
    await logEmails(sql, kind, 'free accounts', note.subject, [{ name: r.name, email: r.email, ok }]);
  }
  return { v: 'fp1', day, note: idx, subject: note.subject, sent, total: audience.length };
}
