import { ImageResponse } from '@vercel/og';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

// Dynamic link-preview image: Dr. Merritt behind a dark overlay with the rough
// countdown to the insider launch. Regenerates on every share.
// Two countdowns: the home link counts to the PUBLIC launch (Dec 1), the
// waitlist link counts to the INSIDER launch (Nov 1). ?to=public|insider.
export default async function handler(req) {
  const url = new URL(req.url);
  const to = url.searchParams.get('to') === 'insider' ? 'insider' : 'public';
  // ?ref=<code> — the preview for a partner's referral link. It carries their
  // name, because the image is the part people actually see when a link is
  // shared; everything else on the page only appears after a click.
  const refCode = (url.searchParams.get('ref') || '').trim().toLowerCase();
  let refBy = null;
  if (/^[a-z0-9-]{1,64}$/.test(refCode)) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      const [pc] = await sql`SELECT owner_name, company FROM partner_codes WHERE code = ${refCode}`;
      if (pc) refBy = pc.company || pc.owner_name;
    } catch { /* fall through to the ordinary image */ }
  }
  let days = null;
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT key, value FROM settings WHERE key IN ('launch_insider_at', 'launch_at')`;
    const pick = (k) => rows.find(r => r.key === k)?.value;
    const at = to === 'insider' ? (pick('launch_insider_at') || pick('launch_at')) : (pick('launch_at') || pick('launch_insider_at'));
    if (at) {
      const ms = new Date(at).getTime() - Date.now();
      if (ms > 0) days = Math.max(1, Math.ceil(ms / 86400000));
    }
  } catch (e) { /* fall through to generic image */ }

  const origin = url.origin;
  const kicker = refBy ? `REFERRED BY ${String(refBy).toUpperCase()}` : to === 'insider' ? 'INSIDER WAITLIST' : 'GROUNDUP LAUNCH';
  const tagline = refBy
    ? 'join through them — $5 to $25 off every month, two years'
    : to === 'insider' ? 'until insiders get in first — join the waitlist' : 'until the doors open to everyone';
  const h = (type, style, ...children) => ({ type, props: { style, children: children.length === 1 ? children[0] : children } });

  return new ImageResponse(
    h('div', { width: '100%', height: '100%', display: 'flex', position: 'relative', backgroundColor: '#000', fontFamily: 'serif' },
      { type: 'img', props: { src: `${origin}/LIIF-Stills2.jpg`, style: { position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 } } },
      h('div', { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.85))', display: 'flex' }),
      h('div', { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 },
        h('div', { color: '#e8b4b4', fontSize: 26, letterSpacing: 10, display: 'flex' }, kicker),
        refBy
          ? h('div', { color: '#ffffff', fontSize: 104, fontWeight: 700, display: 'flex', lineHeight: 1.05, textAlign: 'center' }, "YOU'RE INVITED.")
          : days !== null
            ? h('div', { color: '#ffffff', fontSize: 170, fontWeight: 700, display: 'flex', lineHeight: 1 }, `${days} DAYS`)
            : h('div', { color: '#ffffff', fontSize: 110, fontWeight: 700, display: 'flex', lineHeight: 1.05, textAlign: 'center' }, 'GET ACCESS FIRST.'),
        (refBy || days !== null) ? h('div', { color: '#f5e8e8', fontSize: 34, display: 'flex' }, tagline) : null,
        h('div', { color: '#b80101', fontSize: 30, fontWeight: 700, letterSpacing: 4, display: 'flex', marginTop: 18 }, 'GROUNDUP')
      )
    ),
    { width: 1200, height: 630 }
  );
}
