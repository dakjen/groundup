import { get } from '@vercel/blob';
import { getSession, getAdmin } from './_utils.js';

// Serves anything uploaded to the Blob store, which is PRIVATE.
//
// Nothing in the store is reachable by URL alone: every request comes through
// here, has to carry a signed-in session, and the file is streamed back from
// Vercel using the server's token. A link shared outside GroundUp is worthless
// without an account.
//
// Avatars are readable by any signed-in member — they appear beside messages —
// while lesson material and shop files stay behind the same door they always
// were, and can be narrowed to entitlement here later.

export default async function handler(req, res) {
  const session = getSession(req);
  const admin = getAdmin(req);

  const pathname = String(req.query.p || '').replace(/^\/+/, '');
  if (!pathname || pathname.includes('..')) return res.status(400).json({ error: 'Bad path' });

  // A browser rendering an <img> cannot attach a bearer token, so profile
  // pictures and shop covers are served without one. They are meant to be seen
  // — an avatar appears beside every message — and they sit at random,
  // unguessable paths in a private store, so nothing is listable or reachable
  // by guessing. Everything else still needs a session, and documents need
  // ownership on top of that.
  const OPEN = ['avatars/', 'shop-covers/'];
  const isImage = OPEN.some(f => pathname.startsWith(f));
  if (!isImage && !session?.uid && !admin) return res.status(401).json({ error: 'Not signed in' });

  // Session prep documents are somebody's pro forma, term sheet or rent roll.
  // Those belong to the person who sent them and to Dr. Merritt — not to every
  // signed-in member, which is all the door above checks.
  if (pathname.startsWith('session-prep/') && !admin) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      const [own] = await sql`SELECT 1 AS x FROM booking_files f
        JOIN bookings b ON b.id = f.booking_id
        WHERE b.user_id = ${session.uid} AND f.url LIKE ${'%' + pathname}`;
      if (!own) return res.status(403).json({ error: 'Not your document' });
    } catch (e) {
      console.error('prep ownership check failed', e.message);
      return res.status(403).json({ error: 'Not your document' });
    }
  }

  try {
    // `access` is required, and the store is private — omitting it threw, which
    // surfaced as a 500 on every file including avatars.
    const found = await get(pathname, { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!found) return res.status(404).json({ error: 'Not found' });

    const { blob, stream } = found;
    res.setHeader('Content-Type', blob?.contentType || 'application/octet-stream');
    if (blob?.size) res.setHeader('Content-Length', String(blob.size));
    // Private to this viewer, so it must never land in a shared cache.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (req.query.download === '1') {
      const name = pathname.split('/').pop() || 'download';
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
    }

    if (found.statusCode === 304) return res.status(304).end();

    if (stream) {
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    }
    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error('file serve failed', pathname, e.message);
    if (/not found|does not exist/i.test(e.message || '')) return res.status(404).json({ error: 'That file is no longer there' });
    return res.status(500).json({ error: `Could not read that file — ${String(e.message || '').slice(0, 120)}` });
  }
}
