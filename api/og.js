import { ImageResponse } from '@vercel/og';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

// Dynamic link-preview image: Dr. Merritt behind a dark overlay with the rough
// countdown to the insider launch. Regenerates on every share.
export default async function handler(req) {
  let days = null;
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT key, value FROM settings WHERE key IN ('launch_insider_at', 'launch_at')`;
    const at = rows.find(r => r.key === 'launch_insider_at')?.value || rows.find(r => r.key === 'launch_at')?.value;
    if (at) {
      const ms = new Date(at).getTime() - Date.now();
      if (ms > 0) days = Math.max(1, Math.ceil(ms / 86400000));
    }
  } catch (e) { /* fall through to generic image */ }

  const origin = new URL(req.url).origin;
  const h = (type, style, ...children) => ({ type, props: { style, children: children.length === 1 ? children[0] : children } });

  return new ImageResponse(
    h('div', { width: '100%', height: '100%', display: 'flex', position: 'relative', backgroundColor: '#000', fontFamily: 'serif' },
      { type: 'img', props: { src: `${origin}/LIIF-Stills2.png`, style: { position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 } } },
      h('div', { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.85))', display: 'flex' }),
      h('div', { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 },
        h('div', { color: '#e8b4b4', fontSize: 26, letterSpacing: 10, display: 'flex' }, 'ELITE INSIDER WAITLIST'),
        days !== null
          ? h('div', { color: '#ffffff', fontSize: 170, fontWeight: 700, display: 'flex', lineHeight: 1 }, `${days} DAYS`)
          : h('div', { color: '#ffffff', fontSize: 110, fontWeight: 700, display: 'flex', lineHeight: 1.05, textAlign: 'center' }, 'GET ACCESS FIRST.'),
        days !== null ? h('div', { color: '#f5e8e8', fontSize: 36, display: 'flex' }, 'until the doors open — get access first') : null,
        h('div', { color: '#b80101', fontSize: 30, fontWeight: 700, letterSpacing: 4, display: 'flex', marginTop: 18 }, 'GROUNDUP')
      )
    ),
    { width: 1200, height: 630 }
  );
}
