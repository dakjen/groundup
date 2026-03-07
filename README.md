# GroundUp

Real development education for underrepresented developers.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create Neon database**
   - Go to [neon.tech](https://neon.tech) and create a project
   - Open the SQL editor and run `schema.sql`
   - Copy your connection string

3. **Set environment variables**
   - Copy `.env.local` and fill in your `DATABASE_URL`

4. **Run locally**
   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Push to GitHub
2. Connect repo in Vercel dashboard
3. Add `DATABASE_URL` environment variable in Vercel → Settings → Environment Variables
4. Deploy — Vercel auto-detects Vite

## Stack
- React 18 + Vite
- Neon (serverless Postgres)
- Vercel (hosting + API routes)
