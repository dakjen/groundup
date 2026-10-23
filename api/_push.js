// Web Push: the notification that reaches a phone or desktop even when GroundUp
// is closed. A browser hands us a subscription (endpoint + keys) when the
// member turns notifications on; we keep one row per endpoint and send to
// every device a person has. Dead endpoints (410/404) are dropped on the spot.
//
// Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in the environment (generate
// once with `npx web-push generate-vapid-keys`). Without them nothing is sent
// and nothing breaks — email still goes out as before.
import webpush from 'web-push';

export const PUSH_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';

function configured() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails('mailto:' + (process.env.ADMIN_EMAIL || 'groundup@drginamerritt.net'), process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
}

// sendPush(sql, [userIds], { title, body, url, tag }) — never throws.
export async function sendPush(sql, userIds, payload) {
  try {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(Number))];
    if (!ids.length || !configured()) return 0;
    const subs = await sql`SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = ANY(${ids})`;
    const data = JSON.stringify({ title: payload.title || 'GroundUp', body: payload.body || '', url: payload.url || '/', tag: payload.tag || undefined });
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: typeof s.keys === 'string' ? JSON.parse(s.keys) : s.keys }, data, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { try { await sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`; } catch {} }
        else console.error('push failed', e.statusCode, e.body || e.message);
      }
    }
    return sent;
  } catch (e) { console.error('push error', e.message); return 0; }
}

// Every admin's id — the team hears about member DMs; Dr. Merritt alone hears
// about advisory messages (see retainers.js).
export async function adminIds(sql) {
  try { return (await sql`SELECT id FROM users WHERE role = 'admin'`).map(r => r.id); } catch { return []; }
}
