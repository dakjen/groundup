// Brevo (transactional email + contacts). Configure in Vercel env:
//   BREVO_API_KEY      — required for any email to send
//   BREVO_SENDER_EMAIL — verified sender (default info@nreuv.com)
//   BREVO_SENDER_NAME  — display name (default "GroundUp")
//   BREVO_LIST_ID      — optional contact list id for new signups
// Every helper is fire-and-forget safe: missing config or API errors log and
// return false without breaking the request that triggered them.

const BREVO = 'https://api.brevo.com/v3';

function sender() {
  return {
    email: process.env.BREVO_SENDER_EMAIL || 'info@nreuv.com',
    name: process.env.BREVO_SENDER_NAME || 'GroundUp',
  };
}

async function brevo(path, body) {
  const key = process.env.BREVO_API_KEY;
  if (!key) { console.warn('Brevo not configured — skipping', path); return null; }
  const res = await fetch(BREVO + path, {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('Brevo error', path, res.status, text);
    return null;
  }
  return res.json().catch(() => ({}));
}

const wrap = (inner) => `
  <div style="background:#000;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#0d0404;border:1px solid #2a0000;border-radius:16px;padding:36px 32px;color:#e8d8d8;">
      <div style="font-size:20px;font-weight:bold;color:#fff;letter-spacing:1px;margin-bottom:4px;">GROUNDUP</div>
      <div style="font-size:10px;color:#7a6151;letter-spacing:2px;text-transform:uppercase;margin-bottom:28px;">for underrepresented developers</div>
      ${inner}
      <div style="border-top:1px solid #2a0000;margin-top:32px;padding-top:16px;font-size:11px;color:#5a4040;">
        Northern Real Estate Urban Ventures · 825 10th St NW, Suite 981, Washington, DC 20001
      </div>
    </div>
  </div>`;

export async function sendEmail(to, subject, innerHtml) {
  const r = await brevo('/smtp/email', {
    sender: sender(),
    to: [{ email: to }],
    subject,
    htmlContent: wrap(innerHtml),
  });
  return !!r;
}

export async function addContact(email, name, attributes = {}) {
  const body = {
    email,
    attributes: { FIRSTNAME: (name || '').split(' ')[0], FULLNAME: name || '', ...attributes },
    updateEnabled: true,
  };
  const listId = Number(process.env.BREVO_LIST_ID);
  if (listId) body.listIds = [listId];
  const r = await brevo('/contacts', body);
  return !!r;
}

export function welcomeEmail(name, tier) {
  return {
    subject: 'Welcome to GroundUp',
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">Welcome, ${name.split(' ')[0]}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Your GroundUp account is ready on the <strong style="color:#b80101;">${tier === 'Basic' ? 'Member' : tier}</strong> plan. Decades of affordable-housing deal experience, distilled into a curriculum built for developers like you.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Sign in anytime to pick up where you left off — your courses, the community, and your membership all live in one place.</p>
      <a href="https://groundup.nreuv.com" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Go to GroundUp</a>`,
  };
}

export function lnlAccessEmail(name, expiresAt, hasLink) {
  const through = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return {
    subject: "You're in — Lunch & Learn access confirmed",
    html: `
      <h2 style="color:#f5e8e8;font-size:24px;margin:0 0 16px;">You're in, ${name.split(' ')[0]}.</h2>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">Your Lunch & Learn access is active${through ? ` through <strong style="color:#f0d8d8;">${through}</strong>` : ''} — every live session with Dr. Merritt for six months, plus the recordings.</p>
      <p style="color:#a89080;font-size:14px;line-height:1.8;">${hasLink ? 'The join link for the next session is waiting on your Lunch & Learn page.' : 'The join link for each session appears on your Lunch & Learn page closer to the date.'} While you're there, tell us what you want to learn about — Dr. Merritt's team reads every submission.</p>
      <p style="color:#c9a227;font-size:14px;line-height:1.8;font-weight:bold;">Your attendee perk: 25% off your first month of membership if you join within two months.</p>
      <a href="https://groundup.nreuv.com" style="display:inline-block;background:#b80101;color:#fff;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;text-decoration:none;margin-top:8px;">Open Lunch & Learn</a>`,
  };
}
