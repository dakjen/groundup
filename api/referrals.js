import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      const referrals = await sql`SELECT * FROM referrals ORDER BY created_at DESC`;
      return res.json(referrals);
    }

    if (req.method === 'POST') {
      const { name, email, code, expires_at } = req.body;
      const [referral] = await sql`
        INSERT INTO referrals (name, email, code, expires_at, status, used, created_at)
        VALUES (${name}, ${email}, ${code}, ${expires_at}, 'pending', false, NOW())
        RETURNING *
      `;
      return res.json(referral);
    }

    if (req.method === 'PATCH') {
      const { id, status, used, used_at } = req.body;
      const [referral] = await sql`
        UPDATE referrals 
        SET status = ${status}, used = ${used}, used_at = ${used_at || null}
        WHERE id = ${id} 
        RETURNING *
      `;
      return res.json(referral);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
}
