// Founding-member referrals.
//
// A founding member (one of the first 25 to pay after the insider launch) gets
// a personal link, /invite/<code>. People who join through it are recorded on
// their account (users.referred_by). A referral COUNTS when the referred person
// makes their first membership payment; signups alone are shown but do not
// move the milestone count. The rewards at each milestone are deliberately not
// published: the team is emailed when a member reaches one and decides what to
// do, then marks it granted in Admin → Gifts & Invites.
import { sendEmail } from './_email.js';

export const MILESTONES = [1, 3, 5, 10, 25];

// Personal, name-based code: "dakotah-jennifer", with a numeric suffix only
// if two people share the exact name. Keeps an existing code if there is one.
export async function assignReferralCode(sql, userId) {
  const [user] = await sql`SELECT id, name, referral_code FROM users WHERE id = ${userId}`;
  if (!user) return null;
  if (user.referral_code) return user.referral_code;
  const slug = String(user.name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || ('member-' + user.id);
  let code = slug;
  for (let n = 2; n < 50; n++) {
    const [taken] = await sql`SELECT id FROM users WHERE LOWER(referral_code) = ${code} AND id != ${user.id}`;
    if (!taken) break;
    code = `${slug}-${n}`;
  }
  await sql`UPDATE users SET referral_code = ${code} WHERE id = ${user.id}`;
  return code;
}

// Paid = on a paying tier right now, not comped. Signed up = everyone who came
// through the link, paying or not.
export async function referralStats(sql, userId) {
  const [row] = await sql`
    SELECT COUNT(*)::int AS signed_up,
           COUNT(*) FILTER (WHERE tier IN ('Basic','Builder','Premium','Elite') AND membership_status = 'active' AND NOT COALESCE(comped, FALSE))::int AS paid
    FROM users WHERE referred_by = ${userId}`;
  let milestones = [];
  try { milestones = await sql`SELECT milestone, reached_at, granted_at FROM referral_milestones WHERE user_id = ${userId} ORDER BY milestone`; } catch { /* table arrives with the migration */ }
  const paid = row?.paid || 0;
  const next = MILESTONES.find(m => m > paid) || null;
  return { signed_up: row?.signed_up || 0, paid, milestones, next };
}

// Called when a member's membership payment lands. If they were referred,
// recount the referrer's paid referrals and record any milestone just crossed.
export async function recordReferralPaid(sql, paidUserId) {
  const [u] = await sql`SELECT referred_by FROM users WHERE id = ${paidUserId}`;
  if (!u?.referred_by) return;
  const referrerId = u.referred_by;
  const stats = await referralStats(sql, referrerId);
  const reached = MILESTONES.filter(m => stats.paid >= m && !stats.milestones.some(x => x.milestone === m));
  if (!reached.length) return;
  const [ref] = await sql`SELECT name, email FROM users WHERE id = ${referrerId}`;
  for (const m of reached) {
    await sql`INSERT INTO referral_milestones (user_id, milestone, reached_at) VALUES (${referrerId}, ${m}, NOW()) ON CONFLICT (user_id, milestone) DO NOTHING`;
  }
  const top = Math.max(...reached);
  try {
    await sendEmail(process.env.ADMIN_EMAIL || 'djmj@nreuv.com',
      `Referral milestone: ${ref?.name} has ${stats.paid} paid referral${stats.paid === 1 ? '' : 's'}`,
      `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">Referral milestone reached</h2>
       <p style="color:#444444;font-size:14px;line-height:1.8;"><strong style="color:#161616;">${ref?.name}</strong> (${ref?.email}) now has <strong style="color:#161616;">${stats.paid} paid referral${stats.paid === 1 ? '' : 's'}</strong> and ${stats.signed_up} signed up through their link. Milestone: <strong style="color:#161616;">${top}</strong>.</p>
       <p style="color:#444444;font-size:14px;line-height:1.8;">Decide the reward, deliver it, then mark it granted in Admin → Gifts & Invites → Founding referrals.</p>`);
  } catch (e) { console.error('milestone email failed', e.message); }
  if (ref?.email) {
    try {
      await sendEmail(ref.email, `You just reached a referral milestone`,
        `<h2 style="color:#161616;font-size:22px;margin:0 0 14px;">${stats.paid} of the people you sent us ${stats.paid === 1 ? 'is' : 'are'} now members.</h2>
         <p style="color:#444444;font-size:14px;line-height:1.8;">That is a milestone, and milestones come with something from us. Dr. Merritt's team will be in touch with what it is.</p>
         <p style="color:#444444;font-size:14px;line-height:1.8;">Thank you for building this with us.</p>`);
    } catch (e) { console.error('milestone member email failed', e.message); }
  }
}
