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

const wrap = (inner) => `
  <div style="background:#000;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#0d0404;border:1px solid #2a0000;border-radius:16px;padding:36px 32px;color:#e8d8d8;">
      <div style="font-size:20px;font-weight:bold;color:#fff;letter-spacing:1px;margin-bottom:4px;">GROUNDUP</div>
      <div style="font-size:10px;color:#7a6151;letter-spacing:2px;text-transform:uppercase;margin-bottom:28px;">for underrepresented developers</div>
      ${inner}
      <div style="border-top:1px solid #2a0000;margin-top:32px;padding-top:16px;font-size:11px;color:#5a4040;">
        Northern Real Estate Urban Ventures · 825 10th St NW, Suite 981, Washington, DC 20001
      </div>
    </div>
  </div>`;

export async function sendEmail(to, subject, innerHtml) {
  const r = await brevo('/smtp/email', {
    sender: sender(),
    to: [{ email: to }],
    subject,
    htmlContent: wrap(innerHtml),
  });
  return !!r;
}

export async function addContact(email, name, attributes = {}, extraListIds = []) {
  const body = {
    email,
    attributes: { FIRSTNAME: (name || '').split(' ')[0], FULLNAME: name || '', ...attributes },
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
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">Welcome, ${name.split(' ')[0]}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Your GroundUp account is ready on the <strong style="color:#b80101;">${tier === 'Basic' ? 'Member' : tier}</strong> plan. Decades of affordable-housing deal experience, distilled into a curriculum built for developers like you.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Sign in anytime to pick up where you left off — your courses, the community, and your membership all live in one place.</p>
      <a href="https://community.drginamerritt.net" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Go to GroundUp</a>`,
  };
}

// Send to many recipients individually (no shared 'to' — keeps addresses private)
export async function sendBulk(recipients, subject, innerHtml) {
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 10) {
    const chunk = recipients.slice(i, i + 10);
    const results = await Promise.allSettled(chunk.map(r => sendEmail(r.email, subject, innerHtml.replaceAll('{{FIRSTNAME}}', (r.name || 'there').split(' ')[0]))));
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
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Hi ${name.split(' ')[0]} — we received a request to reset your GroundUp password. This link works for one hour:</p>
      <a href="${link}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin:8px 0;">Reset Password</a>
      <p style="color:#7a6060;font-size:12px;line-height:1.7;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
  };
}

export function inviteEmail(name, link) {
  return {
    subject: "You're invited to GroundUp",
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">You're invited, ${name.split(' ')[0]}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Dr. Gina Merritt's team invited you to GroundUp — a curriculum and community for aspiring and emerging affordable-housing developers, built on 30+ years of real deals.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Your invite includes a free trial week — it's live for the next 7 days.</p>
      <a href="${link}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Accept Your Invite</a>`,
  };
}

// Personal month-free gift: one link, one person, one use — locked to their email
export function giftEmail(name, link, personalMessage) {
  return {
    subject: `${name.split(' ')[0]}, your first month of GroundUp is on Dr. Merritt`,
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:3px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">A personal gift</div>
      <h2 style="color:#f5e8e8;font-size:26px;margin:0 0 14px;">This one's on us, ${name.split(' ')[0]}.</h2>
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
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Hi ${name.split(' ')[0]} — Dr. Merritt's team responded to your direct message. Sign in to read it in your private thread.</p>
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
      <p style="color:#a89080;font-size:14px;line-height:1.8;">${audienceHasAccess ? 'Your join link is on your Lunch & Learn page — see you there.' : 'Grab Lunch & Learn access to join live — every session for six months, $39.99.'}</p>
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
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Hi ${(name || 'there').split(' ')[0]} — your session is coming up. Join with the link below:</p>
      ${link ? `<a href="${link}" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Join the Meeting</a>` : ''}
      <p style="color:#7a6060;font-size:12px;line-height:1.7;margin-top:14px;">Need to reschedule? Reply to this email and the team will take care of it.</p>`,
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
  const first = name.split(' ')[0];
  const perks = `
      ${founding ? `<div style="background:#12060a;border:1px solid #b8010140;border-radius:12px;padding:16px 20px;margin:14px 0;">
        <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">✦ Founding 25</div>
        <p style="color:#e0c4c4;font-size:14px;line-height:1.8;margin:0;">Your first <strong style="color:#f5e8e8;">YEAR of Lunch & Learn sessions with Dr. Merritt is on us</strong> — live sessions and every recording, free, on any plan. It attaches to your account automatically the moment you create it at launch.</p>
      </div>` : ''}
      ${first10 ? `<div style="background:#12060a;border:1px solid #b8010140;border-radius:12px;padding:16px 20px;margin:14px 0;">
        <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">✦ First 10</div>
        <p style="color:#e0c4c4;font-size:14px;line-height:1.8;margin:0;">Your special treat: a <strong style="color:#f5e8e8;">14-day trial of any one course</strong>, plus your own personal referral link — friends who join through it get the same trial. Both unlock when you create your account at launch.</p>
      </div>` : ''}`;
  // What GroundUp IS — shared by both emails: why it exists, what it teaches, the value
  const about = `
      <div style="border-top:1px solid #2a0000;margin-top:20px;padding-top:18px;">
        <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:10px;">What GroundUp is</div>
        <p style="color:#a89080;font-size:14px;line-height:1.9;">Dr. Gina Merritt went from public housing in the Bronx to <strong style="color:#f0d8d8;">$600M+ in real estate deals</strong> — and she had to fight for every piece of knowledge alone. She built GroundUp so you don't have to. It's the full development playbook, taught from deals that actually closed, plus a community of developers building alongside you and direct access to her and her team.</p>
        <p style="color:#c8a8a8;font-size:13px;line-height:2;margin:10px 0;">
          <span style="color:#b80101;">→</span> Predevelopment — finding, evaluating &amp; controlling a deal<br/>
          <span style="color:#b80101;">→</span> Building your team, JV partnerships &amp; structuring<br/>
          <span style="color:#b80101;">→</span> Financing — capital stacks, LIHTC &amp; closing the gap<br/>
          <span style="color:#b80101;">→</span> Why affordable housing doesn't pencil (and how to close anyway)<br/>
          <span style="color:#b80101;">→</span> Zoning, entitlements, design &amp; construction, and life after opening day<br/>
          <span style="color:#b80101;">→</span> Live Lunch &amp; Learns, work sessions &amp; the Opportunity Board</p>
        <p style="color:#a89080;font-size:14px;line-height:1.9;">Every membership includes all-access to the full course library — and each tier up adds more of Dr. Merritt herself: her community, her tools, and at the top, a direct line to her and one of only 15 Elite seats. New expertise is added every quarter.</p>
      </div>`;
  if (list === 'insider') {
    return {
      subject: founding ? "Dr. Merritt invited you — and you're one of the first 25" : first10 ? "Dr. Merritt invited you — and you're one of the first 10" : "Dr. Merritt invited you inside",
      html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:3px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">Elite Insider Waitlist</div>
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
    subject: `${name.split(' ')[0]}, here's the plan we'd pick for you`,
    html: `
      <div style="font-size:10px;color:#b80101;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">Launch is almost here</div>
      <h2 style="color:#f5e8e8;font-size:28px;margin:0 0 16px;">We read your answers, ${name.split(' ')[0]}.</h2>
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
      <h2 style="color:#f5e8e8;font-size:28px;margin:0 0 16px;">GroundUp is open, ${name.split(' ')[0]}.</h2>
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

export function lnlAccessEmail(name, expiresAt, hasLink) {
  const through = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return {
    subject: "You're in — Lunch & Learn access confirmed",
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">You're in, ${name.split(' ')[0]}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Your Lunch & Learn access is active${through ? ` through <strong style="color:#f0d8d8;">${through}</strong>` : ''} — every live session with Dr. Merritt for six months, plus the recordings.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">${hasLink ? 'The join link for the next session is waiting on your Lunch & Learn page.' : 'The join link for each session appears on your Lunch & Learn page closer to the date.'} While you're there, tell us what you want to learn about — Dr. Merritt's team reads every submission.</p>
      <p style="color:#c9a227;font-size:14px;line-height:1.8;font-weight:bold;">Your attendee perk: 25% off your first month of membership if you join within two months.</p>
      <a href="https://community.drginamerritt.net" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Open Lunch & Learn</a>`,
  };
}
