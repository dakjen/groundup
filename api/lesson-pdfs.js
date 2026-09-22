import { put, del } from '@vercel/blob';
import { getAdmin, getSession } from './_utils.js';
import { neon } from '@neondatabase/serverless';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // Members may upload exactly one thing: their own profile picture.
  // Members may upload their own profile picture, and documents for a session
  // they have paid for. Everything else is team-only.
  const isAvatar = req.query.kind === 'avatar';
  const isPrep = req.query.kind === 'prep';
  const session = (isAvatar || isPrep) ? getSession(req) : null;
  if (!getAdmin(req) && !((isAvatar || isPrep) && session?.uid)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);

      const boundary = req.headers['content-type']?.split('boundary=')[1];
      if (!boundary) return res.status(400).json({ error: 'Missing boundary' });

      const parts = parseMultipart(body, boundary);
      const filePart = parts.find(p => p.filename);
      if (!filePart) return res.status(400).json({ error: 'No file uploaded' });

      // kind=file (shop deliverable PDF), kind=cover (shop image), kind=avatar
      // (member profile picture), default: lesson PDF
      const kind = ['cover', 'file', 'avatar', 'prep'].includes(req.query.kind) ? req.query.kind : 'lesson';
      const lower = filePart.filename.toLowerCase();
      const IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
      const imgExt = Object.keys(IMG).find(e => lower.endsWith(e));
      let folder, contentType;
      if (kind === 'avatar') {
        if (!imgExt) return res.status(400).json({ error: 'Profile pictures must be PNG, JPG, or WEBP' });
        if (filePart.data.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'Keep profile pictures under 4MB' });
        folder = 'avatars'; contentType = IMG[imgExt];
      } else if (kind === 'prep') {
        // Whatever she needs to read before a session: a pro forma, a rent roll,
        // a term sheet, a site plan. Documents, spreadsheets and images.
        const PREP = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.doc': 'application/msword', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.csv': 'text/csv', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
        const ext = Object.keys(PREP).find(e => lower.endsWith(e));
        if (!ext) return res.status(400).json({ error: 'Send a PDF, Word, Excel, PowerPoint, CSV or image.' });
        if (filePart.data.length > 25 * 1024 * 1024) return res.status(400).json({ error: 'Keep files under 25MB — for anything larger, share a link instead.' });
        folder = 'session-prep'; contentType = PREP[ext];
      } else if (kind === 'cover') {
        if (!imgExt) return res.status(400).json({ error: 'Covers must be PNG, JPG, or WEBP' });
        folder = 'shop-covers'; contentType = IMG[imgExt];
      } else {
        const DOC_TYPES = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
        const ext = Object.keys(DOC_TYPES).find(e => lower.endsWith(e));
        if (kind === 'material') {
          if (!ext) return res.status(400).json({ error: 'Materials can be PDF, Word, Excel, or PowerPoint files' });
          folder = 'lesson-pdfs'; contentType = DOC_TYPES[ext];
        } else {
          if (!lower.endsWith('.pdf')) return res.status(400).json({ error: 'Only PDF files are allowed' });
          folder = kind === 'file' ? 'shop-files' : 'lesson-pdfs'; contentType = 'application/pdf';
        }
      }

      // A filename straight off a phone or a Mac can carry spaces, quotes,
      // emoji or non-Latin characters, and it is being pasted into a URL path.
      // Reduce it to something safe and keep the extension.
      const safeName = String(filePart.filename)
        .normalize('NFKD').replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        .slice(-80) || 'upload';
      const blob = await put(`${folder}/${Date.now()}-${safeName}`, filePart.data, {
        access: 'public',
        contentType,
        addRandomSuffix: true,
      });

      if (kind === 'avatar' && session?.uid) {
        const sql = neon(process.env.DATABASE_URL);
        await sql`UPDATE users SET avatar_url = ${blob.url} WHERE id = ${session.uid}`;
      }

      return res.status(200).json({ url: blob.url, filename: filePart.filename });
    } catch (err) {
      // Every failure used to come back as the same three words, which made a
      // misconfigured blob store look identical to a bad file.
      console.error('Upload error:', err);
      const detail = String(err?.message || '').slice(0, 160);
      const missingStore = /BLOB_READ_WRITE_TOKEN|No token|store.*not.*found/i.test(detail);
      return res.status(500).json({
        error: missingStore
          ? 'File storage isn\'t configured on this environment yet.'
          : `Upload failed — ${detail || 'the server hit an unexpected error'}`,
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const { url } = JSON.parse(Buffer.concat(chunks).toString());
      if (!url) return res.status(400).json({ error: 'URL required' });
      let parsed;
      try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
      const allowed = ['/lesson-pdfs/', '/shop-files/', '/shop-covers/'];
      if (!parsed.hostname.endsWith('.blob.vercel-storage.com') || !allowed.some(p => parsed.pathname.startsWith(p))) {
        return res.status(400).json({ error: 'URL not allowed' });
      }

      await del(url);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Delete error:', err);
      return res.status(500).json({ error: 'Delete failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function parseMultipart(body, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  let start = indexOf(body, boundaryBuf, 0);
  if (start === -1) return parts;

  while (true) {
    start += boundaryBuf.length;
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break; // --
    start += 2; // skip \r\n

    const headerEnd = indexOf(body, Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;

    const headers = body.slice(start, headerEnd).toString();
    const dataStart = headerEnd + 4;
    const nextBoundary = indexOf(body, boundaryBuf, dataStart);
    if (nextBoundary === -1) break;

    const data = body.slice(dataStart, nextBoundary - 2); // -2 for \r\n before boundary

    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const nameMatch = headers.match(/name="([^"]+)"/);

    parts.push({
      name: nameMatch ? nameMatch[1] : null,
      filename: filenameMatch ? filenameMatch[1] : null,
      data,
      headers,
    });

    start = nextBoundary;
  }

  return parts;
}

function indexOf(buf, search, from) {
  for (let i = from; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}
