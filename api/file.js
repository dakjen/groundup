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
  if (!session?.uid && !admin) return res.status(401).json({ error: 'Not signed in' });

  const pathname = String(req.query.p || '').replace(/^\/+/, '');
  if (!pathname || pathname.includes('..')) return res.status(400).json({ error: 'Bad path' });

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
    const found = await get(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
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
    return res.status(500).json({ error: 'Could not read that file' });
  }
}
