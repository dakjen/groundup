import { put, del } from '@vercel/blob';
import { getAdmin } from './_utils.js';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (!getAdmin(req)) {
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

      // kind=file (shop deliverable PDF), kind=cover (shop image), default: lesson PDF
      const kind = req.query.kind === 'cover' ? 'cover' : req.query.kind === 'file' ? 'file' : 'lesson';
      const lower = filePart.filename.toLowerCase();
      const IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
      const imgExt = Object.keys(IMG).find(e => lower.endsWith(e));
      let folder, contentType;
      if (kind === 'cover') {
        if (!imgExt) return res.status(400).json({ error: 'Covers must be PNG, JPG, or WEBP' });
        folder = 'shop-covers'; contentType = IMG[imgExt];
      } else {
        if (!lower.endsWith('.pdf')) return res.status(400).json({ error: 'Only PDF files are allowed' });
        folder = kind === 'file' ? 'shop-files' : 'lesson-pdfs'; contentType = 'application/pdf';
      }

      const blob = await put(`${folder}/${Date.now()}-${filePart.filename}`, filePart.data, {
        access: 'public',
        contentType,
      });

      return res.status(200).json({ url: blob.url, filename: filePart.filename });
    } catch (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Upload failed' });
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
