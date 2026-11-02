// Zoom, reached as a Server-to-Server OAuth app on Dr. Merritt's account. Each
// booked session gets a meeting of its own, so the join link on the invite is
// a real Zoom room and not a Google Meet.
//
// ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET — the app's credentials
// ZOOM_HOST_EMAIL — the Zoom user who hosts (default gmerritt@nreuv.com)

const HOST = () => process.env.ZOOM_HOST_EMAIL || 'gmerritt@nreuv.com';
export const zoomConfigured = () => !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);

let cached = { token: null, exp: 0 };

async function token() {
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID)}`, {
    method: 'POST', headers: { Authorization: `Basic ${basic}` },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw new Error(`Zoom auth failed: ${d.reason || d.error || res.status}`);
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.token;
}

async function api(path, init = {}) {
  const t = await token();
  const res = await fetch('https://api.zoom.us/v2' + path, {
    ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (res.status === 204) return {};
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Zoom ${init.method || 'GET'} ${path}: ${d.message || res.status}`);
  return d;
}

export async function zoomHost() {
  return api(`/users/${encodeURIComponent(HOST())}`);
}

// A scheduled meeting hosted by Dr. Merritt. Members join by link; the waiting
// room is on so an early arrival waits for her rather than sitting alone.
export async function createMeeting({ topic, startIso, duration, timeZone, agenda }) {
  const m = await api(`/users/${encodeURIComponent(HOST())}/meetings`, {
    method: 'POST',
    body: JSON.stringify({
      topic: String(topic || 'GroundUp session').slice(0, 200),
      type: 2,
      start_time: startIso,
      duration,
      timezone: timeZone,
      agenda: String(agenda || '').slice(0, 2000),
      settings: { waiting_room: true, join_before_host: false, mute_upon_entry: true, approval_type: 2, email_notification: false },
    }),
  });
  return { id: String(m.id), join_url: m.join_url, password: m.password || null };
}

export async function deleteMeeting(id) {
  if (!id) return;
  try { await api(`/meetings/${encodeURIComponent(id)}?schedule_for_reminder=false`, { method: 'DELETE' }); }
  catch (e) { if (!/404|not found|does not exist/i.test(e.message)) throw e; }
}
