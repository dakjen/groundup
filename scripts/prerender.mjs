// After `vite build`: write a static HTML page for each public route so search
// engines, AI crawlers and link-preview bots see real content (headline, copy,
// the curriculum, the plans) without running the app. Each page carries its
// own title, description, canonical and share title. The app removes the
// static block the moment it mounts, so visitors never see two copies.
import fs from 'node:fs';
import path from 'node:path';
import catalogFallback from '../src/courseCatalog.js';

const DIST = path.resolve('dist');
const SITE = 'https://community.drginamerritt.net';
const base = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

async function courses() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`${SITE}/api/resources?courses=1`, { signal: ctl.signal }); clearTimeout(t);
    if (r.ok) { const d = await r.json(); if (d?.courses?.length) return { list: d.courses, upcoming: d.upcoming || [] }; }
  } catch {}
  return { list: catalogFallback, upcoming: [] };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const h = (tag, text, cls) => `<${tag}${cls ? ` class="${cls}"` : ''}>${esc(text)}</${tag}>`;
const p = (text) => h('p', text);
const ul = (items) => `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
const a = (href, text) => `<a href="${href}">${esc(text)}</a>`;

const PLANS = [
  ['Member', '$49.99/mo', 'Every course and every written lesson, case studies and worksheets, invites to every live Lunch & Learn, read access to the whole community.'],
  ['Builder', '$149.99/mo', 'Everything in Member, plus posting and networking in the community, the Lunch & Learn recording library, and view-only access to every guide, template and the Developer\'s Playbook.'],
  ['Premium', '$249.99/mo', 'Everything in Builder, plus the full document library, the Opportunity Board of RFPs and funding windows, the Financial Structuring, Financial Modeling and JV & Partnerships channels, group office hours with Dr. Merritt and one included 1:1 session a year after four months, and 10% off 1:1 sessions.'],
  ['Owner', '$499.99/mo, limited seats', 'Everything in Premium, plus direct messages to Dr. Merritt and her team, three one-on-one advisory calls a year after two months, deal support on your own project, the Owner Lounge and Deal Room, three downloads a month after four months, and 30% off 1:1 sessions.'],
  ['Senior Advisor retainer', 'from $3,025/mo', 'Dr. Merritt embedded on your project month to month: 5, 10 or 15 hours a month, a private workspace with a deal room, and everything in Owner. Starts with a $1,500 Full Project Intake, credited against the first month.'],
];

function pages({ list, upcoming }) {
  const core = list.filter(c => !c.series);
  const curriculum = core.map(c => `${c.stage ? c.stage + ' — ' : ''}${c.title}`);
  const courseBlocks = core.map(c => `<section><h2>${esc(c.stage ? `${c.stage}: ${c.title}` : c.title)}</h2>${p(c.description)}${c.lessons?.length ? ul(c.lessons.map((l, i) => `Lesson ${i + 1}: ${l.title}`)) : ''}</section>`).join('');
  const upcomingLine = upcoming.length ? p(`Coming ${new Date(upcoming[0].available_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}: ${[...new Set(upcoming.map(u => u.series || u.title))].join(', ')} — a deep-dive series for Premium and Owner members.`) : '';
  const founder = p('Dr. Gina Merritt was raised in the Bronx and bootstrapped from public housing to a $390M+ development portfolio across Washington, DC, Baltimore and Cleveland, with more than $6 billion underwritten and 8,000+ units built. She is a Howard graduate with a Darden MBA and a USC doctorate, and the founder of Northern Real Estate Urban Ventures.');
  const what = p('GroundUp by Dr. Gina Merritt is an online education platform and membership community for affordable housing development. It teaches the whole life of a deal — feasibility, predevelopment, program development, acquisition, financing and the capital stack, community engagement, construction, stabilization and the fifteen years of compliance after opening — from projects that actually closed. It exists for underrepresented and emerging developers, nonprofits, CDFIs and anyone who needs to learn how affordable housing really gets built.');
  const dates = `<p><strong>Opening soon.</strong> GroundUp opens to its insider waitlist on November 1, 2026 and to the public on December 1, 2026. The first twenty-five members become founding members at 25% off their first year. ${a('/waitlist', 'Join the waitlist')} to get your personal invitation and plan recommendation first.</p>`;
  return {
    '': { title: 'GroundUp by Dr. Gina Merritt — Affordable Housing Development Courses & Community', desc: 'Learn affordable housing development from Dr. Gina Merritt — 30+ years and billions in real deals. Courses, community, and direct access for underrepresented developers.',
      body: `<h1>Build Wealth. Build Legacy. Build it Right.</h1>${dates}${what}<h2>The curriculum</h2>${ul(curriculum)}${upcomingLine}<h2>Who teaches it</h2>${founder}<h2>Inside the membership</h2>${ul(['Eight courses and sixty written lessons, with case studies from Dr. Merritt\'s own deals', 'A community of developers organized by stage and topic, with direct messages to Dr. Merritt on the Owner plan', 'Live Lunch & Learn sessions and group office hours', 'A library of guides, templates and the Developer\'s Playbook', 'One-on-one sessions and Senior Advisor retainers for developers with a live deal'])}<p>${a('/courses', 'See the curriculum')} · ${a('/pricing', 'Plans and pricing')} · ${a('/about', 'About Dr. Merritt')} · ${a('/waitlist', 'Join the waitlist')}</p>` },
    courses: { title: 'The Curriculum — GroundUp by Dr. Gina Merritt', desc: 'Seven stages across the full development lifecycle plus a nine-phase Development Overview: predevelopment, teams and JVs, financing and LIHTC, zoning, design and construction, and after opening day — taught from deals that closed.',
      body: `<h1>The GroundUp curriculum</h1>${dates}${p('Every course is written from a project Dr. Merritt led. The Development Overview walks the nine phases of a deal in order; the seven stages go deep on each.')}${courseBlocks}${upcomingLine}<p>${a('/pricing', 'Every plan includes every course')}</p>` },
    pricing: { title: 'Plans & Pricing — GroundUp by Dr. Gina Merritt', desc: 'Member $49.99, Builder $149.99, Premium $249.99, Owner $499.99 — plus one-time course passes, Lunch & Learn access, 1:1 sessions and Senior Advisor retainers. Every plan includes the full course library.',
      body: `<h1>Plans and pricing</h1>${dates}${p('Every membership includes every course. Higher plans add the community, the library, time with Dr. Merritt, and deal support.')}${PLANS.map(([n, pr, d]) => `<section><h2>${esc(n)} — ${esc(pr)}</h2>${p(d)}</section>`).join('')}<h2>One-time options</h2>${ul(['Single Course Pass, $100: one course for 60 days', 'All-Access Pass, $275: every course for 30 days', 'Lunch & Learn: one live session $39.99, a one-year pass $105, a Lifetime Pass $350', '1:1 sessions with Dr. Merritt, 45 minutes: Deal Review $500, Strategy Session $425, Capital Stack Review $550, Community Development $375', 'Full Project Intake, $1,500: Dr. Merritt reviews your whole project; credited against the first retainer month'])}${p('Founding members, the first twenty-five to join, pay 25% off Member, Builder, Premium or Owner for their entire first year. Memberships are the only purchase that can be cancelled; digital products, passes and sessions are non-refundable.')}` },
    about: { title: 'About Dr. Gina Merritt — GroundUp', desc: 'From public housing in the Bronx to a $390M+ development portfolio. The story behind GroundUp and Northern Real Estate Urban Ventures.',
      body: `<h1>About Dr. Gina Merritt</h1>${founder}${p('Her projects include Ninety-Four Ten Hough in Cleveland, a $47M, 116-apartment catalyst development on a site that sat vacant fifteen years; the Beacon Center in Washington, DC, 99 apartments plus office, retail and a community facility financed across three capital stacks; Nannie Helen at 4800, affordable homes on Nannie Helen Burroughs Avenue NE; and Mary\'s House, fifteen single-room units with communal space for LGBTQ+ adults over 62. Through Project Community Capital® her company stays embedded on site after opening: job placement with 44 employer partners, a 93% retention rate, mental-health services and food access.')}${p('“I only started to own projects in 2020. I spent my first 20 years in this business doing everything except owning. That\'s the reality for most of us — and it doesn\'t have to be a bad thing. It\'s how you learn.”')}${p('GroundUp is the map she wishes someone had handed her: every framework in the curriculum was forged on a real project, and the projects show up inside the lessons, deal by deal.')}` },
    lunchlearn: { title: 'Lunch & Learns — GroundUp by Dr. Gina Merritt', desc: 'Live sessions with Dr. Gina Merritt — real deals, real numbers, live Q&A — plus a recording library for members.',
      body: `<h1>Lunch & Learns</h1>${p('Live, interactive sessions with Dr. Merritt: a real deal, the real numbers, and your questions answered. One live session is $39.99, a one-year pass is $105, a Lifetime Pass is $350. Free accounts get one live session free; paid members are invited to every one, and Builder and above can watch the recording library.')}` },
    contact: { title: 'Book a 1:1 Session — GroundUp by Dr. Gina Merritt', desc: 'Work directly with Dr. Gina Merritt: deal review, strategy, capital stack review and community development sessions, or the Full Project Intake for a live deal.',
      body: `<h1>Work with Dr. Merritt</h1>${p('Forty-five minute sessions on your project: Deal Review $500, Strategy Session $425, Capital Stack Review $550, Community Development $375. Premium members take 10% off, Owners 30%. Have a live deal? The $1,500 Full Project Intake is Dr. Merritt reviewing the whole thing, and it credits against the first month of a Senior Advisor retainer.')}` },
    terms: { title: 'Terms of Use — GroundUp by Dr. Gina Merritt', desc: 'The GroundUp Terms of Use: content license, memberships, billing, refunds, and community rules.', body: `<h1>Terms of Use</h1>${p('The GroundUp Terms of Use cover the content license, memberships and billing, refunds, community conduct, and the educational nature of everything on the platform.')}` },
    privacy: { title: 'Privacy Policy — GroundUp by Dr. Gina Merritt', desc: 'What GroundUp collects, how it is used, who processes it, and how deletion works.', body: `<h1>Privacy Policy</h1>${p('What GroundUp collects, how it is used, who processes it, and how deletion works.')}` },
    'partner-interest': { title: 'Partner With GroundUp — for agencies, CDFIs and nonprofit developer programs', desc: 'Sponsor your cohort\'s first year of GroundUp at a group discount, with a branded partner page, a private cohort channel and cohort-only office hours.', body: `<h1>Bring GroundUp to your cohort</h1>${p('For agencies, CDFIs and nonprofit developer programs: sponsor a cohort\'s first year at a group discount, with a branded page, a private cohort channel and cohort-only office hours with Dr. Merritt. Developers continue as individual members after the sponsored year.')}` },
    'go/playbook': { title: 'The Developer\'s Playbook — GroundUp by Dr. Gina Merritt', desc: 'The step-by-step Dr. Merritt follows on every deal, from the first site walk to the fifteen-year compliance clock. Read it in your GroundUp account.', body: `<h1>Nobody hands you the map. This is the map.</h1>${p('Affordable housing gets built by people who learned the hard way, with nobody to call. The Developer\'s Playbook is thirty years of that work written down in order: feasibility, predevelopment, program, acquisition, financing, community, construction, stabilization, compliance. The checklists she runs before closing, before construction and before conversion. Yours to read in the GroundUp portal, tied to your account.')}${p('Buy it on its own, no membership required. Your email becomes your GroundUp account.')}` },
    'go/lunch': { title: 'A free seat at a live Lunch & Learn with Dr. Gina Merritt', desc: 'One closed deal, every number on the table: sources and uses, basis and credit pricing, the gap, the lender\'s conditions, and what the developer did. For people who already underwrite. First seat free.', body: `<h1>One closed deal. Every number on the table.</h1>${p('A live Lunch & Learn takes one real project apart: the sources and uses as they actually closed, where the gap opened when credit pricing moved, the term the lender would not give, the downward adjuster in the LP agreement, and what the developer did about each one. Worked through by Dr. Gina Merritt, who closed it, with the model on screen. For people who already underwrite and want to see the judgment calls. Normally $39.99; your first seat is free.')}` },
    'go/call': { title: 'A free 20-minute scoping call with the GroundUp team', desc: 'Tell us what you\'re building. We\'ll tell you honestly what would help: a course, a membership, office hours, or time with Dr. Merritt.', body: `<h1>Tell us what you're building. We'll tell you what would actually help.</h1>${p('Before you buy a course, a membership, or an hour of anyone\'s time, talk to a person. Twenty minutes with the GroundUp team: where your project stands, what is in the way, and an honest read on the next right step. A course, a membership, office hours, or time with Dr. Gina Merritt, and which one first. Free, no card. If you need Dr. Merritt directly, you arrive at her intake prepared.')}` },
    'go/intake': { title: 'A free 20-minute scoping call with the GroundUp team', desc: 'Put your whole deal in front of Dr. Merritt: pro forma, capital stack, site, timeline. Credits toward a Senior Advisor retainer.', body: `<h1>Your whole deal, read by someone who has closed them.</h1>${p('The Full Project Intake puts your entire project — pro forma, capital stack, site, timeline — and telling you what you missed, what the lender will say, and what to do next. $1,500, one time, credited in full against the first month of a Senior Advisor retainer. For developers with a live deal.')}` },
    'get-started': { title: 'What kind of help do you need? — GroundUp by Dr. Gina Merritt', desc: 'Ten questions, one honest answer: nothing yet, a course, a membership, live time with Dr. Merritt, or one-on-one advisory work.', body: `<h1>What kind of help do you actually need?</h1>${p('Ten quick questions about where you are: whether you control a site, what your numbers look like, what is in the way, and what kind of help you want. At the end GroundUp tells you honestly which fits: nothing yet, the courses, a Member, Builder, Premium or Owner membership, or advisory work with Dr. Gina Merritt through a scoping call, the Full Project Intake and a Senior Advisor retainer. No email required to see the answer.')}` },
    refer: { title: 'Become a GroundUp Referral Partner', desc: 'Send people to GroundUp with your own link and earn toward a complimentary membership.', body: `<h1>Become a referral partner</h1>${p('Know developers, nonprofits or anyone who should be learning this work from Dr. Merritt? Sign up as a referral partner, get your own link, and earn toward a complimentary GroundUp membership as the people you send join.')}` },
  };
}

// The pre-rendered copy is for crawlers and screen readers: it sits in the
// page as accessible text (the standard clipped sr-only pattern) so nothing
// flashes on screen before the app mounts, then main.jsx removes it.
const STYLE = `<style id="seo-style">#seo-content{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}</style>`;

const data = await courses();
const P = pages(data);
let n = 0;
for (const [route, pg] of Object.entries(P)) {
  const url = `${SITE}/${route}`;
  let html = base
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(pg.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(pg.desc)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(pg.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(pg.desc)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(pg.title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(pg.desc)}$2`)
    .replace('<div id="root"></div>', `${STYLE}<div id="seo-content">${pg.body}</div><div id="root"></div>`);
  if (!html.includes('id="seo-content"')) throw new Error('root div not found in dist/index.html');
  const out = route ? path.join(DIST, route, 'index.html') : path.join(DIST, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  n++;
}
console.log(`prerendered ${n} pages (${data.list.length} courses${data.upcoming.length ? `, ${data.upcoming.length} upcoming` : ''})`);
