import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      const [userStats] = await sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE tier = 'Free') as free_count,
          COUNT(*) FILTER (WHERE tier = 'Basic') as basic_count,
          COUNT(*) FILTER (WHERE tier = 'Premium') as premium_count,
          COUNT(*) FILTER (WHERE tier = 'Elite') as elite_count,
          ROUND(
            COUNT(*) FILTER (WHERE tier = 'Basic') * 17.99 +
            COUNT(*) FILTER (WHERE tier = 'Premium') * 40.99 +
            COUNT(*) FILTER (WHERE tier = 'Elite') * 89.99,
            2
          ) as mrr
        FROM users
      `;

      const signupsByMonth = await sql`
        SELECT 
          TO_CHAR(created_at, 'Mon') as month,
          EXTRACT(YEAR FROM created_at) as year,
          EXTRACT(MONTH FROM created_at) as month_num,
          COUNT(*) as count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY month, year, month_num
        ORDER BY year, month_num
      `;

      const [referralStats] = await sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE used = true) as used_count
        FROM referrals
      `;

      return res.json({ userStats, signupsByMonth, referralStats });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
}
