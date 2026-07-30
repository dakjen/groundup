import { signToken } from './_utils.js';
import { ensureSchema } from './_migrate.js';

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, password } = req.body;

  if (
    process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD &&
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    // Bring the database up to date with the deployed code — no manual SQL step
    try { await ensureSchema(); } catch (e) { console.error('migration failed', e); }
    return res.status(200).json({ success: true, token: signToken({ role: 'admin' }) });
  }

  return res.status(401).json({ error: "Invalid credentials" });
}
