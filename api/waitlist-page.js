import { neon } from '@neondatabase/serverless';

// Serves /waitlist.
//
// It used to be a plain static rewrite to waitlist.html, which meant every
// share of every referral link produced the same preview card: the crawler
// reads the meta tags out of the HTML and never runs any JavaScript, so
// nothing the page does at runtime can change what gets shown in iMessage,
// LinkedIn or Slack.
//
// This serves the same file with the social tags rewritten per request, so a
// partner's link previews as their invitation. Everything else about the page
// is untouched — same bundle, same behaviour after it loads.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function swapMeta(html, prop, value) {
  const attr = prop.startsWith('og:') || prop.startsWith('twitter:') ? 'property' : 'name';
  const re = new RegExp(`<meta\\s+${attr}="${prop}"\\s+content="[^"]*"\\s*/?>`, 'i');
  const tag = `<meta ${attr}="${prop}" content="${esc(value)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

export default async function handler(req, res) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `${proto}://${host}`;

  let html;
  try {
    const r = await fetch(`${origin}/waitlist.html`);
    if (!r.ok) throw new Error(`waitlist.html ${r.status}`);
    html = await r.text();
  } catch (e) {
    // Never take the page down over a preview card.
    console.error('waitlist page fetch failed', e.message);
    res.setHeader('Location', '/waitlist.html');
    return res.status(302).end();
  }

  // ?source=ref:<code>
  const source = String(req.query.source || '');
  const code = /^ref:/.test(source) ? source.slice(4).trim().toLowerCase() : '';

  if (/^[a-z0-9-]{1,64}$/.test(code)) {
    let refBy = null;
    try {
      const sql = neon(process.env.DATABASE_URL);
      const [pc] = await sql`SELECT owner_name, company FROM partner_codes WHERE code = ${code}`;
      if (pc) refBy = { name: pc.owner_name, label: pc.company || pc.owner_name };
    } catch (e) { console.error('partner lookup failed', e.message); }

    if (refBy) {
      const title = `${refBy.label} invited you to GroundUp`;
      const desc = `${refBy.name} thinks GroundUp is for you. Join through them and take $5 to $25 off every month for two years — affordable housing development taught by Dr. Gina Merritt.`;
      const image = `${origin}/api/og?ref=${encodeURIComponent(code)}`;
      html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`);
      html = swapMeta(html, 'description', desc);
      html = swapMeta(html, 'og:title', title);
      html = swapMeta(html, 'og:description', desc);
      html = swapMeta(html, 'og:image', image);
      html = swapMeta(html, 'og:url', `${origin}/waitlist?list=general&source=${encodeURIComponent(source)}`);
      html = swapMeta(html, 'twitter:title', title);
      html = swapMeta(html, 'twitter:description', desc);
      html = swapMeta(html, 'twitter:image', image);
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Short cache: the card should update when a partner's company name changes,
  // and crawlers re-fetch often enough that a minute is plenty.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  return res.status(200).send(html);
}
