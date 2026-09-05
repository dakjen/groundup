import { BookOpen, MessagesSquare, Video, Handshake, Lock, Mail, Megaphone, Menu, X as XIcon, Eye } from "lucide-react";
import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── MEMBER SESSION HELPERS ─────────────────────────────────────────────────

export const TIER_RANK = { Free: 0, Basic: 1, Builder: 2, Premium: 3, Elite: 4 };

export function getMember() {
  try { const m = localStorage.getItem("guMember"); return m ? JSON.parse(m) : null; } catch { return null; }
}
export function getMemberToken() {
  return localStorage.getItem("guToken") || sessionStorage.getItem("adminToken") || "";
}
export function saveMember(user, token) {
  localStorage.setItem("guMember", JSON.stringify(user));
  if (token) localStorage.setItem("guToken", token);
}
export function clearMember() {
  localStorage.removeItem("guMember");
  localStorage.removeItem("guToken");
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(getMemberToken() ? { Authorization: `Bearer ${getMemberToken()}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

// ─── SHARED STYLES ──────────────────────────────────────────────────────────

const font = "'DM Sans', sans-serif";
const serif = "'Cormorant Garamond', serif";
const inp = { width: "100%", background: "#0a0505", border: "1px solid #2a0000", borderRadius: 8, padding: "12px 14px", color: "#f5e8e8", fontFamily: font, fontSize: 14, outline: "none", boxSizing: "border-box" };
const lbl = { display: "block", fontSize: 10, color: "#8a7070", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 };
const btnRed = { background: "#b80101", color: "#fff", border: "none", borderRadius: 8, padding: "12px 22px", fontFamily: font, fontWeight: 800, fontSize: 13, cursor: "pointer" };
const btnGhost = { background: "transparent", color: "#8a7070", border: "1px solid #2a0000", borderRadius: 8, padding: "12px 22px", fontFamily: font, fontWeight: 600, fontSize: 13, cursor: "pointer" };

const TIER_COLORS = { Free: "#6a6b69", Basic: "#b80101", Builder: "#c85050", Premium: "#e06767", Elite: "#e0c4c4", Partner: "#e0c4c4" };
// Display names — 'Basic' is the internal value for the Member subscription tier
export const TIER_LABELS = { Free: "Free", Basic: "Member", Builder: "Builder", Premium: "Premium", Elite: "Elite", Partner: "Partner" };

// Account badges — earned perks that follow a member everywhere: the admin
// sheets, their profile, and next to their name in the community. Add new
// badges here as they're invented; unknown keys are ignored gracefully.
export const BADGE_DEFS = {
  founding25: { label: "L&L Year One", icon: "✦", color: "#e0c4c4", title: "Founding 25 — first year of Lunch & Learns free" },
  first10: { label: "First 10", icon: "✦", color: "#e0c4c4", title: "One of the first 10 on the waitlist — 14-day course trial + personal referral link" },
};
export function BadgeChips({ badges, small }) {
  const keys = (Array.isArray(badges) ? badges : []).filter(k => BADGE_DEFS[k]);
  if (!keys.length) return null;
  return (
    <>
      {keys.map(k => {
        const b = BADGE_DEFS[k];
        return (
          <span key={k} title={b.title} style={{ background: b.color + "18", color: b.color, border: `1px solid ${b.color}45`, borderRadius: 5, padding: small ? "1px 6px" : "2px 8px", fontSize: small ? 9 : 10, fontFamily: font, fontWeight: 800, letterSpacing: "0.5px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {b.icon} {b.label}
          </span>
        );
      })}
    </>
  );
}

export function TierBadge({ tier, small }) {
  const c = TIER_COLORS[tier] || "#6a6b69";
  return (
    <span style={{ background: c + "18", color: c, border: `1px solid ${c}40`, borderRadius: 5, padding: small ? "1px 7px" : "3px 10px", fontSize: small ? 9 : 10, fontFamily: font, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{TIER_LABELS[tier] || tier}</span>
  );
}

// ─── AUTH MODAL (login / create account) ────────────────────────────────────

export function AuthModal({ onClose, onAuthed, defaultTier = "Free", startMode = "signup", allowSignup = true }) {
  const [mode, setMode] = useState(startMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tier, setTier] = useState(defaultTier);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const [notice, setNotice] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signup" && !agreed) {
        setError("Please agree to the Content Use Policy to continue.");
        setBusy(false);
        return;
      }
      if (mode === "forgot") {
        await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "forgot_password", email }) });
        setNotice("If that email has an account, a reset link is on its way. It works for one hour.");
        return;
      }
      // Accounts are always created Free — a paid tier only comes from Stripe
      // checkout (below) or an admin. The picker records intent, nothing more.
      const data = mode === "signup"
        ? await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "signup", name, email, password, ref: localStorage.getItem("guRef") || undefined }) })
        : await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "login", email, password }) });
      saveMember(data.user, data.token);
      onAuthed(data.user);
      if (mode === "signup" && tier !== "Free" && window.startCheckout) {
        // straight to secure payment — carrying any stretch-offer promo with them
        window.startCheckout("sub_" + tier + (localStorage.getItem("guAnnual") === "1" ? "_annual" : ""), { promo: localStorage.getItem("guPromo") || undefined, gift: localStorage.getItem("guGift") || undefined });
      }
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 20, padding: "36px 36px 32px", width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 10 }}>GroundUp Membership</div>
        <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 30, color: "#f5e8e8", marginBottom: 6 }}>{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back"}</h2>
        <p style={{ color: "#8a7070", fontSize: 13, fontFamily: font, lineHeight: 1.7, marginBottom: 24 }}>
          {mode === "signup" ? "One account for your courses, your community, and your membership benefits." : mode === "forgot" ? "Enter your email and we’ll send you a reset link." : "Sign in to get back to your courses and the community."}
        </p>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Full name</label>
              <input style={inp} value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" />
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Email</label>
            <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          {mode !== "forgot" && (
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Password</label>
              <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} />
            </div>
          )}
          {mode === "signup" && (
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Plan</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {["Free", "Basic", "Builder", "Premium", "Elite"].map(t => (
                  <button type="button" key={t} onClick={() => setTier(t)} style={{ background: tier === t ? "#b8010118" : "transparent", border: tier === t ? "1px solid #b80101" : "1px solid #2a0000", borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ color: tier === t ? "#f0d8d8" : "#8a7070", fontWeight: 800, fontSize: 13, fontFamily: font }}>{TIER_LABELS[t]}</div>
                    <div style={{ color: "#7a5050", fontSize: 11, fontFamily: font }}>{{ Free: "$0", Basic: "$49.99/mo", Builder: "$149.99/mo", Premium: "$249.99/mo", Elite: "$499.99/mo" }[t]}</div>
                  </button>
                ))}
              </div>
              {localStorage.getItem("guGift") && mode === "signup" && (
                <div style={{ background: "#22c55e12", border: "1px solid #22c55e50", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#22c55e", fontSize: 13, fontFamily: font, fontWeight: 700 }}>
                  A gift is attached to your invitation — your first month is free. It works with the email your link was sent to.
                </div>
              )}
              {tier !== "Free" && (
                <div style={{ marginTop: 10, background: "#0d0a04", border: "1px solid #2a2000", borderRadius: 8, padding: "10px 14px", color: "#b8a060", fontSize: 12, fontFamily: font, lineHeight: 1.6 }}>
                  After you create your account, you&rsquo;ll go straight to secure checkout for {TIER_LABELS[tier] || tier}. Your plan activates the moment payment clears.
                </div>
              )}
            </div>
          )}
          {mode === "signup" && (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 3 }} required />
              <span style={{ color: "#8a7070", fontSize: 12, fontFamily: font, lineHeight: 1.6 }}>
I agree to the <a href="/terms" target="_blank" style={{ color: "#b80101", fontWeight: 700 }}>Terms of Use</a> and <a href="/privacy" target="_blank" style={{ color: "#b80101", fontWeight: 700 }}>Privacy Policy</a>, including the content license: all GroundUp materials are the exclusive intellectual property of Dr. Gina Merritt, licensed for my personal use only — no selling, distributing, copying, sharing, reproducing, or creating derivative works, in any form, ever.
              </span>
            </label>
          )}
          {error && <div style={{ color: "#ff6b6b", fontSize: 13, fontFamily: font, marginBottom: 14 }}>{error}</div>}
          {notice && <div style={{ color: "#22c55e", fontSize: 13, fontFamily: font, marginBottom: 14 }}>{notice}</div>}
          <button type="submit" disabled={busy} style={{ ...btnRed, width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "One moment…" : mode === "signup" ? "Create Account →" : mode === "forgot" ? "Send Reset Link →" : "Sign In →"}</button>
        </form>
        <div style={{ marginTop: 18, textAlign: "center", fontSize: 13, fontFamily: font, color: "#8a7070" }}>
          {mode === "signup" ? <>Already a member? <button onClick={() => { setMode("login"); setError(""); }} style={{ background: "none", border: "none", color: "#b80101", cursor: "pointer", fontWeight: 700, fontFamily: font, fontSize: 13 }}>Sign in</button></>
            : mode === "forgot" ? <button onClick={() => { setMode("login"); setError(""); setNotice(""); }} style={{ background: "none", border: "none", color: "#b80101", cursor: "pointer", fontWeight: 700, fontFamily: font, fontSize: 13 }}>← Back to sign in</button>
            : <>{allowSignup && <>New here? <button onClick={() => { setMode("signup"); setError(""); }} style={{ background: "none", border: "none", color: "#b80101", cursor: "pointer", fontWeight: 700, fontFamily: font, fontSize: 13 }}>Create an account</button><span style={{ margin: "0 8px", color: "#3a2a2a" }}>·</span></>}<button onClick={() => { setMode("forgot"); setError(""); }} style={{ background: "none", border: "none", color: "#8a7070", cursor: "pointer", fontWeight: 600, fontFamily: font, fontSize: 13 }}>Forgot password?</button></>}
        </div>
      </div>
    </div>
  );
}

// ─── MEMBERSHIP PAGE (dashboard) ────────────────────────────────────────────

const BENEFITS = {
  Free: ["One free lesson of your choice", "Course catalog & curriculum previews", "Lunch & Learn access available to purchase"],
  Basic: ["Every course — all seven, plus each new one we add", "All written lessons, case studies & worksheets", "Resource lists & reading guides", "Community access — read every channel"],
  Builder: ["Everything in Member", "Post, reply & network in the community", "Live Lunch & Learns with Dr. Merritt — free, plus the recordings", "View-only: every guide, template & the Developer's Playbook"],
  Premium: ["Everything in Builder", "Download 3 guides or templates every month", "The Opportunity Board — RFPs, funding windows & deals", "JV & Partnerships channel", "Development timeline templates", "Group office hours with Dr. Merritt + priority booking", "10% off 1:1 sessions with Dr. Merritt"],
  Elite: ["Everything in Premium", "Deal support — bring YOUR deal to your advisory calls", "3 one-on-one advisory calls/yr with Dr. Merritt", "Direct messages to Dr. Merritt & her team — replies within 2 business days", "Elite Lounge — private channel", "Unlimited downloads — including the Developer's Playbook", "30% off 1:1 sessions with Dr. Merritt", "Invite to the exclusive networking event"],
  Partner: ["Custom organizational access", "Contact info@nreuv.com for your cohort setup"],
};

// What the NEXT tier would add — the approachable upsell on the membership page
const NEXT_TIER = {
  Free: { tier: "Basic", price: "$49.99/mo", adds: ["The full curriculum — every course, every lesson", "Community access"] },
  Basic: { tier: "Builder", price: "$149.99/mo", adds: ["A voice in the community — post, reply & network", "Free live Lunch & Learns + all recordings", "Every template & guide, view-only"] },
  Builder: { tier: "Premium", price: "$249.99/mo", adds: ["3 downloads a month", "The Opportunity Board", "Office hours with Dr. Merritt", "10% off 1:1 sessions"] },
  Premium: { tier: "Elite", price: "$499.99/mo", adds: ["Deal support — bring YOUR deal to advisory calls", "DMs to Dr. Merritt & her team", "Unlimited downloads incl. the Playbook", "30% off 1:1 sessions"] },
};

function BookingsCard({ member }) {
  const [bookings, setBookings] = useState(member.bookings || []);
  const link = member.booking_link;
  if (!bookings.length) return null;
  const mark = async (id) => {
    try { await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "mark_booked", id }) }); setBookings(bookings.map(b => b.id === id ? { ...b, status: "booked" } : b)); } catch {}
  };
  return (
    <div style={{ background: "var(--gu-card2)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "24px 28px", marginBottom: 28 }}>
      <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 16 }}>Your Sessions</div>
      {bookings.map(b => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--gu-border2)" }}>
          <div>
            <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 15, fontFamily: font }}>{b.label}</div>
            <div style={{ color: b.status === "booked" ? "#22c55e" : "#e0c4c4", fontSize: 12.5, fontFamily: font, fontWeight: 700, marginTop: 3 }}>
              {b.status === "booked" ? "✓ Time reserved — see your calendar invite" : "Paid — pick your time"}
            </div>
          </div>
          {b.status !== "booked" && link && (
            <div style={{ display: "flex", gap: 8 }}>
              <a href={link} target="_blank" rel="noreferrer" onClick={() => mark(b.id)} style={{ ...btnRed, textDecoration: "none", display: "inline-block" }}>Book Your Time →</a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SessionCreditsCard({ member }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState(member.sessions || null);
  if (!sessions || sessions.total === 0) return null;

  const request = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "request_session", note }) });
      setSessions({ ...sessions, used: sessions.used + 1, remaining: sessions.remaining - 1 });
      setNote(""); setOpen(false);
      setMsg({ ok: true, text: "Request sent — Dr. Merritt's team will reach out to schedule." });
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };

  return (
    <div style={{ background: "var(--gu-card2)", border: "1px solid #1e0000", borderRadius: 16, padding: "24px 28px", marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 8 }}>Your 1-on-1 Sessions</div>
          <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 16, fontFamily: font }}>{sessions.remaining} of {sessions.total} remaining</div>
          <div style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font, marginTop: 4 }}>{member.tier === "Elite" ? "Advisory calls with Dr. Merritt, included in Elite." : "Your free work session, included in Premium."}</div>
        </div>
        {sessions.remaining > 0 && !open && <button style={btnRed} onClick={() => setOpen(true)}>Request a Session</button>}
      </div>
      {open && (
        <form onSubmit={request} style={{ marginTop: 16 }}>
          <label style={lbl}>What do you want to cover? (optional)</label>
          <textarea style={{ ...inp, background: "var(--gu-card)", border: "1px solid var(--gu-border)", color: "var(--gu-text)", resize: "vertical" }} rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="Your deal, your question, where you're stuck…" />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
            <button type="submit" disabled={busy} style={{ ...btnRed, opacity: busy ? 0.6 : 1 }}>{busy ? "Sending…" : "Send Request"}</button>
            <button type="button" onClick={() => setOpen(false)} style={btnGhost}>Cancel</button>
          </div>
        </form>
      )}
      {msg && <div style={{ color: msg.ok ? "#22c55e" : "#ff6b6b", fontSize: 13, fontFamily: font, marginTop: 12 }}>{msg.text}</div>}
    </div>
  );
}

// Cancelling is as easy as joining — one click into Stripe's portal, no
// emailing the team. The 15-day data note is stated up front, not buried.
function BenefitGateNotice({ member }) {
  if (!member?.benefit_gate?.active) return null;
  return (
    <div style={{ background: "var(--gu-card2)", border: "1px solid #b8010140", borderRadius: 14, padding: "16px 24px", marginBottom: 28, color: "var(--gu-body)", fontSize: 13.5, fontFamily: font, lineHeight: 1.7 }}>
      <strong style={{ color: "var(--gu-text2)" }}>Your full benefits are on the way.</strong> Advisory calls and networking events unlock after four months of continuous membership — yours open on <strong style={{ color: "#b80101" }}>{new Date(member.benefit_gate.until).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</strong>. Courses, the community, and Lunch & Learns are all live for you right now.
    </div>
  );
}

function ManageMembershipCard({ member, rank }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (rank < 1) return null; // Free accounts have no billing to manage
  if (member?.comped) return null; // comped plans have no Stripe billing behind them

  const openPortal = async () => {
    setBusy(true); setErr(null);
    try {
      const d = await api("/api/stripe", { method: "POST", body: JSON.stringify({ action: "portal" }) });
      window.location.href = d.url;
    } catch (e) {
      setErr(e.message || "Couldn't open billing — email groundup@drginamerritt.net and we'll sort it.");
      setBusy(false);
    }
  };

  return (
    <div style={{ background: "var(--gu-card2)", border: "1px solid #1e0000", borderRadius: 16, padding: "24px 28px", marginBottom: 28 }}>
      <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>Membership &amp; billing</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ color: "var(--gu-body)", fontSize: 14, fontFamily: font, lineHeight: 1.7, marginBottom: 6 }}>
            Update your card, view invoices, or cancel — it takes one click, no questions asked.
          </div>
          <div style={{ color: "var(--gu-muted)", fontSize: 12, fontFamily: font, lineHeight: 1.7 }}>
            <span style={{ display: "block", fontWeight: 800, color: "var(--gu-text2)", marginBottom: 8 }}>How cancelling works</span>
            <span style={{ display: "block", marginBottom: 6 }}>1 · Click <strong style={{ color: "var(--gu-text2)" }}>Manage Billing</strong> — it opens your secure Stripe portal.</span>
            <span style={{ display: "block", marginBottom: 6 }}>2 · Choose <strong style={{ color: "var(--gu-text2)" }}>Cancel subscription</strong>. That's it — no emails, no phone calls, no questions.</span>
            <span style={{ display: "block", marginBottom: 12 }}>3 · Your access continues through everything you've already paid for.</span>
            <span style={{ display: "block", fontWeight: 800, color: "var(--gu-text2)", marginBottom: 8 }}>The refund policy</span>
            Monthly plans: cancel before the 5th of the month and this month's payment is refunded; on or after the 5th, no refund for the current month. Annual plans: cancel within the first 6 months (we honor a 10-day grace period past the mark) and half your annual payment is refunded; after that, the refund is forfeited and your access runs to the end of your paid year. <strong style={{ color: "var(--gu-body)" }}>15 days after your membership ends, your account data — posts, messages, and progress — is permanently deleted.</strong> Rejoin before then and nothing is lost.
          </div>
        </div>
        <button onClick={openPortal} disabled={busy} style={{ ...btnGhost, opacity: busy ? 0.6 : 1, whiteSpace: "nowrap" }}>
          {busy ? "Opening…" : "Manage or cancel"}
        </button>
      </div>
      {err && <div style={{ color: "#ff6b6b", fontSize: 13, fontFamily: font, marginTop: 12 }}>{err}</div>}
    </div>
  );
}

// First-10 perk: their personal referral link, plus the state of their own trial
function ReferralCard({ member }) {
  const [copied, setCopied] = useState(false);
  if (!member?.referral_code && !member?.trial_available && !member?.trial) return null;
  const link = `${window.location.origin}/invite/${member.referral_code}`;
  return (
    <div style={{ background: "var(--gu-card2)", border: "1px solid #e0c4c440", borderRadius: 16, padding: "24px 28px", marginBottom: 28 }}>
      <div style={{ fontSize: 9, color: "#e0c4c4", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>✦ Your First-10 perks</div>
      {member.trial_available && (
        <div style={{ color: "var(--gu-body)", fontSize: 14, fontFamily: font, lineHeight: 1.7, marginBottom: 12 }}>
          <strong style={{ color: "var(--gu-text2)" }}>Your 14-day course trial is waiting.</strong> Open any course and you'll be asked which one you want — every lesson in that course, free for 14 days. One trial per account, so pick the course you're most curious about.
        </div>
      )}
      {member.trial && (
        <div style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font, lineHeight: 1.7, marginBottom: 12 }}>
          Your trial is live{member.trial.expires_at ? ` through ${new Date(member.trial.expires_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}` : ""} — enjoy the course, and upgrade any time to keep going after it ends.
        </div>
      )}
      {member.referral_code && (
        <div>
          <div style={{ color: "var(--gu-body)", fontSize: 14, fontFamily: font, lineHeight: 1.7, marginBottom: 10 }}>
            Share your personal link — friends who join through it get their own <strong style={{ color: "var(--gu-text2)" }}>14-day one-course trial</strong>:
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <code style={{ background: "var(--gu-panel)", border: "1px solid #2a0000", borderRadius: 8, padding: "10px 14px", color: "var(--gu-text2)", fontSize: 13, flex: 1, minWidth: 220, overflowX: "auto", whiteSpace: "nowrap" }}>{link}</code>
            <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); }} style={btnRed}>{copied ? "Copied ✓" : "Copy link"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "change_password", current_password: current, new_password: next }) });
      setCurrent(""); setNext("");
      setMsg({ ok: true, text: "Password updated." });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div style={{ background: "var(--gu-card2)", border: "1px solid #1e0000", borderRadius: 16, padding: "24px 28px", marginBottom: 28 }}>
      <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 16 }}>Change password</div>
      <form onSubmit={submit} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={lbl}>Current password</label>
          <input style={inp} type="password" value={current} onChange={e => setCurrent(e.target.value)} required autoComplete="current-password" />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={lbl}>New password</label>
          <input style={inp} type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
        </div>
        <button type="submit" disabled={busy} style={{ ...btnRed, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Update"}</button>
      </form>
      {msg && <div style={{ color: msg.ok ? "#22c55e" : "#ff6b6b", fontSize: 13, fontFamily: font, marginTop: 12 }}>{msg.text}</div>}
    </div>
  );
}

export function MemberPage({ member, setActivePage, onSignOut, onSignIn }) {
  // Team accounts have no tier or plan — just a clean account view
  if (member && member.role === "admin") {
    return (
      <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "110px clamp(20px,5vw,80px) 80px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 36 }}>
            <div>
              <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>GroundUp Team</div>
              <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(32px,5vw,44px)", color: "var(--gu-text)", lineHeight: 1.1, marginBottom: 10 }}>{member.name}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ background: "#b80101", color: "#fff", borderRadius: 4, padding: "2px 9px", fontSize: 10, fontWeight: 800, fontFamily: font, letterSpacing: "1px" }}>{member.badge === "drmerritt" ? "DR. MERRITT" : "TEAM"}</span>
                <span style={{ color: "var(--gu-muted2)", fontSize: 13, fontFamily: font }}>{member.email}</span>
              </div>
            </div>
            <button style={btnGhost} onClick={onSignOut}>Sign out</button>
          </div>
          <p style={{ color: "var(--gu-muted)", fontSize: 14, fontFamily: font, lineHeight: 1.8, marginBottom: 28 }}>Your tools live in the nav: the Community (you post as the team), Resources and Lunch & Learns are your editors, and everything else is under GroundUp Admin.</p>
          <ChangePasswordCard />
        </div>
      </div>
    );
  }
  if (!member) {
    return (
      <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "140px 20px", textAlign: "center" }}>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 40, color: "var(--gu-text)", marginBottom: 14 }}>Membership</h1>
        <p style={{ color: "var(--gu-muted)", fontFamily: font, fontSize: 15, marginBottom: 28 }}>Sign in or create an account to see your membership.</p>
        <button style={btnRed} onClick={onSignIn}>Sign In / Join →</button>
      </div>
    );
  }
  const rank = TIER_RANK[member.tier] ?? 0;
  return (
    <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "110px clamp(20px,5vw,80px) 80px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 40 }}>
          <div>
            <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>Your Membership</div>
            <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(32px,5vw,48px)", color: "var(--gu-text)", lineHeight: 1.1, marginBottom: 10 }}>Welcome, {member.name.split(" ")[0]}.</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TierBadge tier={member.tier} />
              <span style={{ color: "var(--gu-muted2)", fontSize: 13, fontFamily: font }}>{member.email}</span>
            </div>
          </div>
          <button style={btnGhost} onClick={onSignOut}>Sign out</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 40 }}>
          <div onClick={() => setActivePage("courses")} style={{ background: "var(--gu-card)", border: "1px solid #2a0000", borderRadius: 16, padding: "26px 28px", cursor: "pointer" }}>
            <div style={{ marginBottom: 12 }}><BookOpen size={24} color="#b80101" /></div>
            <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 16, fontFamily: font, marginBottom: 6 }}>Your Courses</div>
            <p style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>{rank >= 1 ? "Full access to every course and every lesson." : member.free_lesson_key ? "You've used your free lesson. Upgrade for the full curriculum." : "One free lesson included. Upgrade for the full curriculum."}</p>
          </div>
          <div onClick={() => rank >= 1 && setActivePage("community")} style={{ background: "var(--gu-card)", border: "1px solid #2a0000", borderRadius: 16, padding: "26px 28px", cursor: rank >= 1 ? "pointer" : "default", opacity: rank >= 1 ? 1 : 0.55 }}>
            <div style={{ marginBottom: 12 }}><MessagesSquare size={24} color="#b80101" /></div>
            <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 16, fontFamily: font, marginBottom: 6 }}>Community {rank < 1 && <Lock size={13} style={{ display: "inline", verticalAlign: "middle" }} />}</div>
            <p style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>{rank >= 2 ? "Post, reply, and network with fellow developers." : rank >= 1 ? "Read every channel. Upgrade to Builder to post and reply." : "Members-only. Upgrade to a membership to join the conversation."}</p>
          </div>
          <div onClick={() => setActivePage("lunchlearn")} style={{ background: "var(--gu-card)", border: "1px solid #2a0000", borderRadius: 16, padding: "26px 28px", cursor: "pointer", opacity: rank >= 2 ? 1 : 0.55 }}>
            <div style={{ marginBottom: 12 }}><Video size={24} color="#b80101" /></div>
            <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 16, fontFamily: font, marginBottom: 6 }}>Lunch & Learns {rank < 2 && <Lock size={13} style={{ display: "inline", verticalAlign: "middle" }} />}</div>
            <p style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>{rank >= 2 ? "Live sessions and recordings included in your plan — free." : "Live sessions and recordings come free with Builder and up."}</p>
          </div>
          <div onClick={() => setActivePage("contact")} style={{ background: "var(--gu-card)", border: "1px solid #2a0000", borderRadius: 16, padding: "26px 28px", cursor: "pointer", opacity: rank >= 3 ? 1 : 0.55 }}>
            <div style={{ marginBottom: 12 }}><Handshake size={24} color="#b80101" /></div>
            <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 16, fontFamily: font, marginBottom: 6 }}>Advisory Access {rank < 3 && <Lock size={13} style={{ display: "inline", verticalAlign: "middle" }} />}</div>
            <p style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>{rank >= 3 ? "Your Elite advisory calls and priority Q&A with Dr. Merritt." : "One-on-one time with Dr. Merritt is an Elite benefit. Book single sessions anytime."}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: NEXT_TIER[member.tier] ? "repeat(auto-fit, minmax(300px, 1fr))" : "1fr", gap: 16, marginBottom: 28 }}>
          <div style={{ background: "var(--gu-card2)", border: "1px solid #1e0000", borderRadius: 16, padding: "28px 32px" }}>
            <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>Your {TIER_LABELS[member.tier] || member.tier} benefits</div>
            <div style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, marginBottom: 16 }}>Everything your plan opens up — use all of it.</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {(BENEFITS[member.tier] || []).map((b, i) => (
                <li key={i} style={{ display: "flex", gap: 12, marginBottom: 10, color: "var(--gu-body)", fontSize: 14, lineHeight: 1.7, fontFamily: font, fontWeight: 600 }}>
                  <span style={{ color: "#22c55e", flexShrink: 0 }}>✓</span><span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          {NEXT_TIER[member.tier] && (
            <div style={{ background: "var(--gu-red-tint)", border: "1px solid #b8010135", borderRadius: 16, padding: "28px 32px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 9, color: "#e0c4c4", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>One step up: {TIER_LABELS[NEXT_TIER[member.tier].tier] || NEXT_TIER[member.tier].tier} · {NEXT_TIER[member.tier].price}</div>
              <div style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, marginBottom: 16 }}>When you're ready for more, here's what it adds:</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px" }}>
                {NEXT_TIER[member.tier].adds.map((b, i) => (
                  <li key={i} style={{ display: "flex", gap: 12, marginBottom: 10, color: "var(--gu-body)", fontSize: 14, lineHeight: 1.7, fontFamily: font, fontWeight: 600 }}>
                    <span style={{ color: "#b80101", flexShrink: 0 }}>+</span><span>{b}</span>
                  </li>
                ))}
              </ul>
              <button style={{ ...btnRed, marginTop: "auto", alignSelf: "flex-start" }} onClick={() => setActivePage("pricing")}>Upgrade to {TIER_LABELS[NEXT_TIER[member.tier].tier] || NEXT_TIER[member.tier].tier} →</button>
            </div>
          )}
        </div>

        <BenefitGateNotice member={member} />
        <BookingsCard member={member} />
        <SessionCreditsCard member={member} />
        <ReferralCard member={member} />
        <ChangePasswordCard />
        <ManageMembershipCard member={member} rank={rank} />

        {rank < 1 && member.lnl_discount_until && new Date(member.lnl_discount_until) > new Date() && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, background: "var(--gu-card2)", border: "1px solid #e0c4c440", borderRadius: 14, padding: "20px 26px", marginBottom: 16 }}>
            <div>
              <div style={{ color: "#b80101", fontWeight: 800, fontSize: 15, fontFamily: font, marginBottom: 4 }}>Your Lunch & Learn perk: 25% off your first month</div>
              <div style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font }}>Become a member by {new Date(member.lnl_discount_until).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })} and mention it when you sign up.</div>
            </div>
            <button style={btnRed} onClick={() => setActivePage("pricing")}>See Memberships →</button>
          </div>
        )}

        {rank < 3 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, background: "var(--gu-card2)", border: "1px solid #2a2000", borderRadius: 14, padding: "20px 26px" }}>
            <div style={{ color: "var(--gu-muted)", fontSize: 14, fontFamily: font, fontWeight: 600 }}>Want more access? Compare plans and upgrade anytime.</div>
            <button style={btnRed} onClick={() => setActivePage("pricing")}>View Plans →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COMMUNITY (Slack-style channels + threads) ─────────────────────────────

function timeAgo(ts) {
  const d = new Date(ts); const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function linkify(text) {
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) => /^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: "#b80101", wordBreak: "break-all" }}>{p}</a>
    : p);
}

function Message({ m, onOpenThread, onDelete, canDelete, inThread, onVote }) {
  // Dr. Merritt's messages carry a presence of their own — richer than TEAM,
  // unmistakable at a glance: glowing card, serif name, crowned badge.
  const isGina = m.is_admin && m.author_badge === "drmerritt";
  return (
    <div style={{ padding: isGina ? "16px 20px" : "12px 16px", borderRadius: 10, background: isGina ? "linear-gradient(135deg, #1a0808 0%, #12060a 100%)" : m.is_admin ? "var(--gu-red-tint)" : "transparent", border: isGina ? "1px solid #b8010170" : m.is_admin ? "1px solid #b8010130" : "1px solid transparent", boxShadow: isGina ? "0 0 24px rgba(184,1,1,0.12)" : "none", marginBottom: 4 }}>
      {isGina && <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #b80101, transparent)", margin: "-16px -20px 12px", borderRadius: "10px 10px 0 0" }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={isGina
          ? { color: "#f5e8e8", fontWeight: 700, fontSize: 16, fontFamily: serif, letterSpacing: "0.3px" }
          : { color: m.is_admin ? "#b80101" : "var(--gu-text2)", fontWeight: 800, fontSize: 13, fontFamily: font }}>{m.author_name || "Member"}</span>
        {m.is_admin ? (
          isGina
            ? <span style={{ background: "linear-gradient(135deg, #b80101, #570404)", color: "#fff", borderRadius: 5, padding: "2px 9px", fontSize: 9, fontWeight: 800, fontFamily: font, letterSpacing: "1.5px", boxShadow: "0 0 10px rgba(184,1,1,0.35)" }}>✦ DR. MERRITT</span>
            : <span style={{ background: "#b80101", color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800, fontFamily: font, letterSpacing: "1px" }}>TEAM</span>
        ) : m.author_tier && <TierBadge tier={m.author_tier} small />}
        {!m.is_admin && <BadgeChips badges={m.author_badges} small />}
        <span style={{ color: "var(--gu-faint)", fontSize: 11, fontFamily: font }}>{timeAgo(m.created_at)}</span>
        {canDelete && <button onClick={() => onDelete(m)} style={{ background: "none", border: "none", color: "var(--gu-faint)", cursor: "pointer", fontSize: 11, fontFamily: font, marginLeft: "auto" }}>delete</button>}
      </div>
      <div style={{ color: "var(--gu-body)", fontSize: 14, fontFamily: font, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{linkify(m.body)}</div>
      {m.poll && m.poll_results && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
          {(m.poll.options || []).map((opt, i) => {
            const count = m.poll_results.counts[i] || 0;
            const total = m.poll_results.total || 0;
            const pct = total ? Math.round((count / total) * 100) : 0;
            const mine = m.poll_results.my_vote === i;
            return (
              <button key={i} onClick={() => onVote && onVote(m, i)} style={{ position: "relative", overflow: "hidden", textAlign: "left", background: "var(--gu-panel)", border: mine ? "1px solid #b80101" : "1px solid #2c2214", borderRadius: 9, padding: "9px 12px", cursor: "pointer" }}>
                <span style={{ position: "absolute", inset: 0, width: `${pct}%`, background: mine ? "#b8010128" : "#e0c4c414" }} />
                <span style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ color: mine ? "var(--gu-text2)" : "var(--gu-body)", fontSize: 13, fontFamily: font, fontWeight: 700 }}>{mine ? "● " : ""}{opt}</span>
                  <span style={{ color: "var(--gu-muted)", fontSize: 12, fontFamily: font, fontWeight: 700 }}>{count} · {pct}%</span>
                </span>
                {m.poll_results.voters && count > 0 && (
                  <span style={{ position: "relative", display: "block", color: "var(--gu-muted)", fontSize: 11, fontFamily: font, marginTop: 3 }}>{m.poll_results.voters[i].join(", ")}</span>
                )}
              </button>
            );
          })}
          <span style={{ color: "var(--gu-faint)", fontSize: 11, fontFamily: font }}>{m.poll_results.total} vote{m.poll_results.total === 1 ? "" : "s"} — tap to vote or change your vote</span>
        </div>
      )}
      {!inThread && (
        <button onClick={() => onOpenThread(m)} style={{ background: "none", border: "none", color: Number(m.reply_count) > 0 ? "#b80101" : "var(--gu-faint)", cursor: "pointer", fontSize: 12, fontFamily: font, fontWeight: 700, padding: 0, marginTop: 6 }}>
          {Number(m.reply_count) > 0 ? `${m.reply_count} repl${Number(m.reply_count) === 1 ? "y" : "ies"}` : "Reply in thread"}
        </button>
      )}
    </div>
  );
}

export function CommunityPage({ member, isAdmin, onSignIn }) {
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [thread, setThread] = useState(null);          // parent message when a thread is open
  const [threadMsgs, setThreadMsgs] = useState([]);
  const [draft, setDraft] = useState("");
  const [threadDraft, setThreadDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);          // member DM view, or admin DM inbox thread
  const [dmMsgs, setDmMsgs] = useState([]);
  const [dmDraft, setDmDraft] = useState("");
  const [dmThreads, setDmThreads] = useState([]);       // admin inbox
  const [dmTarget, setDmTarget] = useState(null);       // admin: selected member thread
  const [newChanOpen, setNewChanOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollForm, setPollForm] = useState({ question: "", options: ["", ""] });
  const [newChan, setNewChan] = useState({ name: "", min_tier: "Basic", admin_only_post: false });
  const feedRef = useRef(null);
  const rank = member && !member.suspended ? (TIER_RANK[member.tier] ?? 0) : 0;
  const hasAccess = isAdmin || rank >= 1;
  const canEngage = isAdmin || rank >= 2;               // Basic (Member) is read-only
  const canDm = isAdmin || rank >= 3;                   // DMs are an Elite benefit

  const loadChannels = useCallback(async () => {
    const data = await api("/api/community?resource=channels");
    setChannels(data.channels);
    setActive(a => a || data.channels[0] || null);
  }, []);

  const loadMessages = useCallback(async (channelId, threadId) => {
    const q = threadId ? `&thread=${threadId}` : "";
    const data = await api(`/api/community?resource=messages&channel=${channelId}${q}`);
    if (threadId) setThreadMsgs(data.messages); else setMessages(data.messages);
  }, []);

  useEffect(() => {
    if (!hasAccess) { setLoading(false); return; }
    loadChannels().catch(e => setError(e.message)).finally(() => setLoading(false));
    if (isAdmin) api("/api/community?resource=dm-threads").then(d => setDmThreads(d.threads)).catch(() => {});
    api("/api/community", { method: "POST", body: JSON.stringify({ action: "mark_seen", what: "community" }) }).catch(() => {});
  }, [hasAccess, isAdmin, loadChannels]);

  const loadDm = useCallback(async (targetId) => {
    const q = targetId ? `&user=${targetId}` : "";
    const data = await api(`/api/community?resource=dm${q}`);
    setDmMsgs(data.messages);
  }, []);

  useEffect(() => {
    if (!dmOpen) return;
    api("/api/community", { method: "POST", body: JSON.stringify({ action: "mark_seen", what: "dm" }) }).catch(() => {});
    const target = isAdmin ? dmTarget?.id : null;
    if (isAdmin && !target) return;
    loadDm(target).catch(e => setError(e.message));
    const t = setInterval(() => loadDm(target).catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [dmOpen, dmTarget, isAdmin, loadDm]);

  const sendDm = async (e) => {
    e.preventDefault();
    const text = dmDraft.trim();
    if (!text) return;
    try {
      await api("/api/community", { method: "POST", body: JSON.stringify({ dm: true, body: text, user_id: isAdmin ? dmTarget?.id : undefined }) });
      setDmDraft("");
      await loadDm(isAdmin ? dmTarget?.id : null);
    } catch (err) { setError(err.message); }
  };

  useEffect(() => {
    if (!active) return;
    setThread(null);
    loadMessages(active.id).catch(e => setError(e.message));
    const t = setInterval(() => loadMessages(active.id).catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [active, loadMessages]);

  useEffect(() => {
    if (!thread || !active) return;
    loadMessages(active.id, thread.id).catch(() => {});
    const t = setInterval(() => loadMessages(active.id, thread.id).catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [thread, active, loadMessages]);

  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [messages.length, active]);

  const send = async (parentId, text, clear) => {
    const body = text.trim();
    if (!body || !active) return;
    try {
      await api("/api/community", { method: "POST", body: JSON.stringify({ channel_id: active.id, body, parent_id: parentId || undefined }) });
      clear();
      await loadMessages(active.id, parentId || undefined);
      if (parentId) await loadMessages(active.id); // refresh reply counts
    } catch (e) { setError(e.message); }
  };

  const votePoll = async (msg, idx) => {
    try {
      await api("/api/community", { method: "POST", body: JSON.stringify({ action: "vote", message_id: msg.id, option_idx: idx }) });
      await loadMessages(active.id);
    } catch (e) { setError(e.message); }
  };

  const createPoll = async () => {
    const opts = pollForm.options.map(o => o.trim()).filter(Boolean);
    if (!pollForm.question.trim() || opts.length < 2) { setError("Poll needs a question and at least 2 options."); return; }
    try {
      await api("/api/community", { method: "POST", body: JSON.stringify({ action: "create_poll", channel_id: active.id, question: pollForm.question, options: opts }) });
      setPollOpen(false);
      setPollForm({ question: "", options: ["", ""] });
      await loadMessages(active.id);
    } catch (e) { setError(e.message); }
  };

  const createChannel = async () => {
    try {
      const payload = newChan.min_tier === "team"
        ? { ...newChan, min_tier: "Basic", team_only: true }
        : newChan;
      await api("/api/community", { method: "POST", body: JSON.stringify({ action: "create_channel", ...payload }) });
      setNewChanOpen(false);
      setNewChan({ name: "", min_tier: "Basic", admin_only_post: false });
      await loadChannels();
    } catch (e) { setError(e.message); }
  };

  const deleteMsg = async (m) => {
    try {
      await api("/api/community", { method: "DELETE", body: JSON.stringify({ id: m.id }) });
      await loadMessages(active.id, thread ? thread.id : undefined);
      if (!thread) await loadMessages(active.id);
    } catch (e) { setError(e.message); }
  };

  if (!hasAccess) {
    return (
      <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "140px 20px", textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}><MessagesSquare size={36} color="#b80101" style={{ display: "inline-block" }} /></div>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 40, color: "var(--gu-text)", marginBottom: 14 }}>The GroundUp Community</h1>
        <p style={{ color: "var(--gu-muted)", fontFamily: font, fontSize: 15, maxWidth: 480, margin: "0 auto 28px", lineHeight: 1.8 }}>
          {member ? "The community is a paid-member benefit. Upgrade to Basic or above to join channels for deals, financing, JV partnerships, and direct announcements from Dr. Merritt's team." : "Sign in with a paid membership to chat with fellow developers and hear directly from Dr. Merritt's team."}
        </p>
        <button style={btnRed} onClick={onSignIn}>{member ? "View Plans →" : "Sign In / Join →"}</button>
      </div>
    );
  }

  const canPost = canEngage && active && (!active.admin_only_post || isAdmin);

  return (
    <div style={{ background: "var(--gu-bg)", paddingTop: 64, display: "flex", height: "100vh", boxSizing: "border-box", overflow: "hidden", position: "fixed", inset: 0 }}>
      {/* Channel sidebar */}
      <div className="community-sidebar" style={{ width: 240, flexShrink: 0, borderRight: "1px solid #3f0707", background: "#4a0b0b", padding: "24px 12px", overflowY: "auto", display: sidebarOpen ? "block" : undefined }}>
        <div style={{ fontSize: 10, color: "#e8b4b4", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, padding: "0 12px", marginBottom: 14 }}>Channels</div>
        {channels.map(c => (
          <button key={c.id} onClick={() => { setActive(c); setDmOpen(false); setSidebarOpen(false); }}
            style={{ display: "block", width: "100%", textAlign: "left", background: !dmOpen && active?.id === c.id ? "#b80101" : "transparent", border: "none", borderRadius: 6, padding: "9px 12px", cursor: "pointer", marginBottom: 2 }}>
            <span style={{ color: "#ffffff", fontWeight: !dmOpen && active?.id === c.id ? 800 : 600, fontSize: 13.5, fontFamily: font }}>
              {c.admin_only_post ? <Megaphone size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} /> : "#"} {c.name}
            </span>
            {c.min_tier !== "Basic" && <span style={{ marginLeft: 6, fontSize: 9, color: TIER_COLORS[c.min_tier], fontFamily: font, fontWeight: 800 }}>{(TIER_LABELS[c.min_tier] || c.min_tier).toUpperCase()}</span>}
          </button>
        ))}
        {isAdmin && (
          <div style={{ margin: "8px 0 4px" }}>
            {!newChanOpen ? (
              <button onClick={() => setNewChanOpen(true)} style={{ width: "100%", background: "transparent", border: "1px dashed #8a4040", borderRadius: 6, padding: "9px 12px", color: "#e3c4c4", fontSize: 12.5, fontFamily: font, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>+ New channel</button>
            ) : (
              <div style={{ background: "var(--gu-panel)", border: "1px solid var(--gu-border)", borderRadius: 10, padding: 12 }}>
                <input style={{ ...inp, background: "var(--gu-card)", border: "1px solid var(--gu-border)", color: "var(--gu-text)", marginBottom: 8, fontSize: 13, padding: "9px 11px" }} value={newChan.name} onChange={e => setNewChan({ ...newChan, name: e.target.value })} placeholder="Channel name" maxLength={40} />
                <select style={{ ...inp, background: "var(--gu-card)", border: "1px solid var(--gu-border)", color: "var(--gu-text)", marginBottom: 8, fontSize: 13, padding: "9px 11px", cursor: "pointer" }} value={newChan.min_tier} onChange={e => setNewChan({ ...newChan, min_tier: e.target.value })}>
                  <option value="Basic">All members</option>
                  <option value="Premium">Premium+</option>
                  <option value="Elite">Elite only</option>
                  <option value="team">Team only (private)</option>
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={newChan.admin_only_post} onChange={e => setNewChan({ ...newChan, admin_only_post: e.target.checked })} />
                  <span style={{ color: "var(--gu-muted)", fontSize: 12, fontFamily: font, fontWeight: 600 }}>Only team can post</span>
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={createChannel} style={{ ...btnRed, flex: 1, padding: "9px 10px", fontSize: 12 }}>Create</button>
                  <button onClick={() => setNewChanOpen(false)} style={{ ...btnGhost, padding: "9px 10px", fontSize: 12 }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
        {canDm && (
          <>
            <div style={{ fontSize: 10, color: "#e8b4b4", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, padding: "0 12px", margin: "20px 0 10px" }}>Direct Messages</div>
            {!isAdmin && (
              <button onClick={() => { setDmOpen(true); setSidebarOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", background: dmOpen ? "#b80101" : "transparent", border: "none", borderRadius: 6, padding: "9px 12px", cursor: "pointer" }}>
                <span style={{ color: dmOpen ? "var(--gu-text2)" : "var(--gu-muted)", fontWeight: 700, fontSize: 13.5, fontFamily: font }}><Mail size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} /> Dr. Merritt & Team</span>
              </button>
            )}
            {isAdmin && dmThreads.length === 0 && <div style={{ color: "#c89a9a", fontSize: 12, fontFamily: font, padding: "0 12px" }}>No member DMs yet.</div>}
            {isAdmin && dmThreads.map(t => (
              <button key={t.id} onClick={() => { setDmTarget(t); setDmOpen(true); setSidebarOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", background: dmOpen && dmTarget?.id === t.id ? "#b80101" : "transparent", border: "none", borderRadius: 6, padding: "9px 12px", cursor: "pointer", marginBottom: 2 }}>
                <span style={{ color: dmOpen && dmTarget?.id === t.id ? "var(--gu-text2)" : "var(--gu-muted)", fontWeight: 700, fontSize: 13.5, fontFamily: font }}><Mail size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} /> {t.name}</span>
                <span style={{ marginLeft: 6, fontSize: 9, color: TIER_COLORS[t.tier], fontFamily: font, fontWeight: 800 }}>{(TIER_LABELS[t.tier] || t.tier).toUpperCase()}</span>
              </button>
            ))}
          </>
        )}
        {isAdmin && (
          <div style={{ margin: "16px 12px 0", padding: "8px 12px", background: "#ffffff14", border: "1px solid #ffffff22", borderRadius: 6, color: "#e8b4b4", fontSize: 11, fontFamily: font, fontWeight: 700 }}>You're posting as the GroundUp team.</div>
        )}
      </div>

      {/* Main feed */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {loading ? <div style={{ padding: 40, color: "var(--gu-muted)", fontFamily: font }}>Loading community…</div> : dmOpen ? (
          <>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #1a0000", display: "flex", alignItems: "center", gap: 12 }}>
              <button className="community-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: "none", background: "transparent", border: "1px solid #2a0000", borderRadius: 6, color: "var(--gu-muted)", padding: "6px 10px", cursor: "pointer", fontFamily: font }}><Menu size={15} /></button>
              <div>
                <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 16, fontFamily: font }}><Mail size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} /> {isAdmin ? (dmTarget?.name || "Direct Messages") : "Dr. Merritt & Team"}</div>
                <div style={{ color: "var(--gu-muted2)", fontSize: 12, fontFamily: font }}>{isAdmin ? "Private thread with this member." : (<span>Quick questions welcome — replies within 2 business days (Mon–Fri). Deal-specific work (your numbers, your gap, your structure) belongs in your advisory calls or with Dr. Merritt on the whole deal — <a href="/contact" onClick={() => { try { const t = localStorage.getItem("guToken"); if (t) fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }, body: JSON.stringify({ action: "deal_lead", source: "dm_redirect" }) }); } catch {} }} style={{ color: "#b80101", fontWeight: 700 }}>send it to us here →</a></span>)}</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 12px" }}>
              {dmMsgs.length === 0 && <div style={{ color: "var(--gu-faint)", fontFamily: font, fontSize: 14, textAlign: "center", marginTop: 60 }}>{isAdmin ? "No messages in this thread yet." : "Start the conversation — the team replies within 2 business days. For deep deal review, book a session so you get real time on it."}</div>}
              {dmMsgs.map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: m.from_admin === !isAdmin ? "flex-start" : "flex-end", marginBottom: 10 }}>
                  <div style={{ maxWidth: "78%", background: m.from_admin ? "var(--gu-red-tint)" : "#ffffff", border: m.from_admin ? "1px solid #b8010130" : "1px solid #1a0000", borderRadius: 12, padding: "10px 14px" }}>
                    {m.from_admin && <div style={{ marginBottom: 4 }}><span style={{ background: "#b80101", color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800, fontFamily: font, letterSpacing: "1px" }}>TEAM</span></div>}
                    <div style={{ color: "var(--gu-body)", fontSize: 14, fontFamily: font, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                    <div style={{ color: "var(--gu-faint)", fontSize: 10, fontFamily: font, marginTop: 4 }}>{timeAgo(m.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
            {error && <div style={{ color: "#ff6b6b", fontSize: 12, fontFamily: font, padding: "0 24px 6px" }}>{error}</div>}
            <form onSubmit={sendDm} style={{ display: "flex", gap: 10, padding: "12px 20px 20px", borderTop: "1px solid #1a0000" }}>
              <input style={{ ...inp, background: "var(--gu-card)", border: "1px solid var(--gu-border)", color: "var(--gu-text)", flex: 1 }} value={dmDraft} onChange={e => setDmDraft(e.target.value)} placeholder={isAdmin ? `Reply to ${dmTarget?.name || "member"}…` : "Message Dr. Merritt & team…"} maxLength={4000} />
              <button type="submit" style={btnRed}>Send</button>
            </form>
          </>
        ) : active && (
          <>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #1a0000", display: "flex", alignItems: "center", gap: 12 }}>
              <button className="community-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: "none", background: "transparent", border: "1px solid #2a0000", borderRadius: 6, color: "var(--gu-muted)", padding: "6px 10px", cursor: "pointer", fontFamily: font }}><Menu size={15} /></button>
              <div>
                <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 16, fontFamily: font }}>{active.admin_only_post ? <Megaphone size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} /> : "#"} {active.name}</div>
                <div style={{ color: "var(--gu-muted2)", fontSize: 12, fontFamily: font }}>{active.description}</div>
              </div>
            </div>
            <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: "20px 20px 12px" }}>
              {messages.length === 0 && <div style={{ color: "var(--gu-faint)", fontFamily: font, fontSize: 14, textAlign: "center", marginTop: 60 }}>No messages yet. {canPost ? "Start the conversation." : ""}</div>}
              {messages.map(m => <Message key={m.id} m={m} onOpenThread={setThread} onDelete={deleteMsg} canDelete={isAdmin || (member && m.user_id === member.id)} onVote={votePoll} />)}
            </div>
            {error && <div style={{ color: "#ff6b6b", fontSize: 12, fontFamily: font, padding: "0 24px 6px" }}>{error}</div>}
            <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #1a0000" }}>
              {canPost ? (
                <>
                {isAdmin && pollOpen && (
                  <div style={{ background: "var(--gu-panel)", border: "1px solid #2c2214", borderRadius: 12, padding: 14, marginBottom: 10, maxWidth: 480 }}>
                    <input style={{ ...inp, background: "var(--gu-card)", border: "1px solid var(--gu-border)", color: "var(--gu-text)", marginBottom: 8 }} value={pollForm.question} onChange={e => setPollForm({ ...pollForm, question: e.target.value })} placeholder="Poll question — e.g. Dr. Merritt has 4 event tickets. Interested?" maxLength={500} />
                    {pollForm.options.map((o, i) => (
                      <input key={i} style={{ ...inp, background: "var(--gu-card)", border: "1px solid var(--gu-border)", color: "var(--gu-text)", marginBottom: 8 }} value={o} onChange={e => setPollForm({ ...pollForm, options: pollForm.options.map((x, j) => j === i ? e.target.value : x) })} placeholder={`Option ${i + 1}`} maxLength={100} />
                    ))}
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      {pollForm.options.length < 6 && <button type="button" onClick={() => setPollForm({ ...pollForm, options: [...pollForm.options, ""] })} style={{ ...btnGhost, padding: "8px 14px", fontSize: 12 }}>+ Option</button>}
                      <button type="button" onClick={createPoll} style={{ ...btnRed, padding: "8px 16px", fontSize: 12 }}>Post Poll</button>
                      <button type="button" onClick={() => setPollOpen(false)} style={{ ...btnGhost, padding: "8px 14px", fontSize: 12 }}>Cancel</button>
                    </div>
                  </div>
                )}
                <form onSubmit={e => { e.preventDefault(); send(null, draft, () => setDraft("")); }} style={{ display: "flex", gap: 10 }}>
                  <input style={{ ...inp, background: "var(--gu-card)", border: "1px solid var(--gu-border)", color: "var(--gu-text)", flex: 1 }} value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message ${active.name}`} maxLength={4000} />
                  {isAdmin && <button type="button" onClick={() => setPollOpen(!pollOpen)} style={btnGhost}>Poll</button>}
                  <button type="submit" style={btnRed}>Send</button>
                </form>
                </>
              ) : !canEngage ? (
                <div style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font, textAlign: "center", padding: "8px 0" }}><Eye size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} /> Reading is included with your Member plan. Upgrade to Premium to post, reply, and network.</div>
              ) : (
                <div style={{ color: "var(--gu-muted2)", fontSize: 13, fontFamily: font, textAlign: "center", padding: "8px 0" }}>Only the GroundUp team posts in this channel. Reply in threads to join the discussion.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Thread panel */}
      {thread && (
        <div style={{ width: "min(380px, 100vw)", flexShrink: 0, borderLeft: "1px solid #1a0000", background: "#070303", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a0000", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 14, fontFamily: font }}>Thread</div>
            <button onClick={() => setThread(null)} style={{ background: "none", border: "none", color: "var(--gu-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px" }}>
            <Message m={thread} inThread onDelete={deleteMsg} canDelete={false} />
            <div style={{ borderTop: "1px solid #1a0000", margin: "10px 0" }} />
            {threadMsgs.map(m => <Message key={m.id} m={m} inThread onDelete={deleteMsg} canDelete={isAdmin || (member && m.user_id === member.id)} />)}
          </div>
          {canEngage ? (
            <form onSubmit={e => { e.preventDefault(); send(thread.id, threadDraft, () => setThreadDraft("")); }} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px 16px", borderTop: "1px solid #1a0000" }}>
              <input style={{ ...inp, background: "var(--gu-card)", border: "1px solid var(--gu-border)", color: "var(--gu-text)", flex: 1 }} value={threadDraft} onChange={e => setThreadDraft(e.target.value)} placeholder="Reply…" maxLength={4000} />
              <button type="submit" style={{ ...btnRed, padding: "12px 16px" }}>↑</button>
            </form>
          ) : (
            <div style={{ color: "var(--gu-muted)", fontSize: 12, fontFamily: font, textAlign: "center", padding: "12px 14px", borderTop: "1px solid #1a0000" }}>Upgrade to Premium to reply.</div>
          )}
        </div>
      )}

      <style>{`
        @media (max-width: 760px) {
          .community-sidebar { position: fixed; top: 64px; bottom: 0; left: 0; z-index: 90; display: ${sidebarOpen ? "block" : "none"}; }
          .community-menu-btn { display: inline-block !important; }
        }
      `}</style>
    </div>
  );
}


// ─── RESET PASSWORD (from emailed link) ─────────────────────────────────────

export function ResetPasswordModal({ token, onDone }) {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "reset_password", token, new_password: pw }) });
      setDone(true);
      setMsg({ ok: true, text: "Password updated — sign in with your new password." });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 20, padding: "36px 36px 32px", width: "100%", maxWidth: 420 }}>
        <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 10 }}>GroundUp</div>
        <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 28, color: "#f5e8e8", marginBottom: 18 }}>Choose a new password</h2>
        {!done ? (
          <form onSubmit={submit}>
            <label style={lbl}>New password</label>
            <input style={inp} type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={8} placeholder="At least 8 characters" autoComplete="new-password" />
            {msg && <div style={{ color: msg.ok ? "#22c55e" : "#ff6b6b", fontSize: 13, fontFamily: font, marginTop: 12 }}>{msg.text}</div>}
            <button type="submit" disabled={busy} style={{ ...btnRed, width: "100%", marginTop: 16, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Set New Password"}</button>
          </form>
        ) : (
          <>
            <div style={{ color: "#22c55e", fontSize: 14, fontFamily: font, marginBottom: 18 }}>{msg?.text}</div>
            <button onClick={onDone} style={{ ...btnRed, width: "100%" }}>Sign In →</button>
          </>
        )}
      </div>
    </div>
  );
}


// ─── WAITLIST (public join modal) ───────────────────────────────────────────

const WL_LEARN = [
  "Real estate development basics",
  "Finding & evaluating deals",
  "LIHTC & tax credits",
  "JV partnerships & structuring",
  "Construction & design management",
  "Financing & capital stacks",
  "Getting my first deal done",
  "Public-private partnerships",
  "Scaling my business & pipeline",
  "All of the above",
  "I need deal-specific support on a live project",
  "Other",
];
const WL_PAIN = [
  "I can't find the capital",
  "I don't know where to start",
  "I have a deal but I'm stuck",
  "I need partners or a team",
  "I don't understand the numbers",
  "Navigating government & compliance",
  "No network in the industry",
  "Other",
];
const WL_SOURCE = ["Dr. Merritt / NREUV", "A Lunch & Learn", "LinkedIn", "Instagram", "Word of mouth", "An event or conference", "Other"];
const WL_BUDGETS = ["$25–$100", "$100–$200", "$300+", "I need specific, customized deal help", "$2,000+"];

// Two lists, one form. "insider" is the secret /waitlist page (first access);
// "general" is what the public homepage collects before the general launch.
export function WaitlistForm({ list = "insider" }) {
  const insider = list === "insider";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [learn, setLearn] = useState("");
  const [learnOther, setLearnOther] = useState("");
  const [pain, setPain] = useState("");
  const [painOther, setPainOther] = useState("");
  const [budget, setBudget] = useState("");
  const [source, setSource] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const learnVal = learn === "Other" ? learnOther.trim() : learn;
    const painVal = pain === "Other" ? painOther.trim() : pain;
    if (!learnVal) { setMsg("Tell us what you hope to learn."); return; }
    if (!painVal) { setMsg("Tell us your main pain point."); return; }
    if (!budget) { setMsg("Pick the monthly budget that fits you."); return; }
    setBusy(true); setMsg(null);
    try {
      await api("/api/waitlist", { method: "POST", body: JSON.stringify({ action: "join", name, email, phone, learn: learnVal, pain: painVal, budget, source: source || undefined, list }) });
      setDone(true);
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  };

  const sel = { ...inp, appearance: "auto", cursor: "pointer" };
  // Thought partnership needs a beat of explanation — show it on hover, not just on select
  const [partnerHover, setPartnerHover] = useState(false);

  return (
    <div style={{ background: "linear-gradient(180deg, #1f1114 0%, #150a0c 100%)", border: "1px solid #e0c4c435", boxShadow: "0 0 90px rgba(224,196,196,0.07)", borderRadius: 22, padding: "42px clamp(28px,5vw,52px) 38px", width: "100%", maxWidth: 720, margin: "0 auto" }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 30, color: "#f5e8e8", marginBottom: 12 }}>{insider ? "You're an insider." : "You're on the list."}</h2>
            <p style={{ color: "#8a7070", fontSize: 14, fontFamily: font, lineHeight: 1.8 }}>Check your inbox — your spot is saved. We read every answer, and when we launch you'll get our personal recommendation for the plan that fits you best.</p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 10 }}>{insider ? "Elite Insider Waitlist" : "GroundUp Waitlist"}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 30, color: "#f5e8e8", marginBottom: 6 }}>{insider ? "Become an insider" : "Get on the list"}</h2>
            <p style={{ color: "#8a7070", fontSize: 13, fontFamily: font, lineHeight: 1.7, marginBottom: insider ? 14 : 22 }}>{insider ? "Tell us where you are and what's in your way — at launch, you'll get first access and our personal recommendation for the plan that fits." : "Tell us where you are and what's in your way — the moment doors open, you'll get your invite and our personal recommendation for the plan that fits."}</p>
            {insider && (
              <div style={{ background: "#e0c4c410", border: "1px solid #e0c4c445", borderRadius: 12, padding: "14px 18px", marginBottom: 22 }}>
                <div style={{ color: "#e0c4c4", fontSize: 11, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>✦ Founding 25 — locked-in pricing</div>
                <div style={{ color: "#c8a8a8", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>The first 25 people on this list keep today's founding rates <strong style={{ color: "#f0d8d8" }}>forever</strong> — <strong style={{ color: "#f0d8d8" }}>Builder at $99.99/mo</strong> (instead of $149.99) and <strong style={{ color: "#f0d8d8" }}>Premium at $149.99/mo</strong> (instead of $249.99) — plus your first year of Lunch & Learns free.</div>
              </div>
            )}
            <form onSubmit={submit}>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Full name</label>
                <input style={inp} value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Email</label>
                <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Phone</label>
                <input style={inp} type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="(555) 555-5555" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>What do you hope to learn?</label>
                <select style={sel} value={learn} onChange={e => setLearn(e.target.value)} required>
                  <option value="" disabled>Choose one…</option>
                  {WL_LEARN.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {learn === "Other" && <input style={{ ...inp, marginTop: 8 }} value={learnOther} onChange={e => setLearnOther(e.target.value)} placeholder="Tell us in your own words" required />}
                {learn === "I need deal-specific support on a live project" && <div style={{ marginTop: 8, background: "#12060a", border: "1px solid #b8010140", borderRadius: 8, padding: "10px 12px", color: "#c8a8a8", fontSize: 12, fontFamily: font, lineHeight: 1.6 }}>Good to know: deal-specific support — your numbers, your gap, your structure — comes only with the <strong style={{ color: "#f0d8d8" }}>Elite plan</strong> or the Senior Advisor retainer. We'll point you there.</div>}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>What's your main pain point?</label>
                <select style={sel} value={pain} onChange={e => setPain(e.target.value)} required>
                  <option value="" disabled>Choose one…</option>
                  {WL_PAIN.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {pain === "Other" && <input style={{ ...inp, marginTop: 8 }} value={painOther} onChange={e => setPainOther(e.target.value)} placeholder="Tell us in your own words" required />}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Monthly budget for a course, community, and access to support</label>
                <div style={{ color: "#7a5050", fontSize: 11.5, fontFamily: font, lineHeight: 1.6, margin: "2px 0 8px" }}>The lower tiers build your foundation — the courses, the community, the knowledge. The higher tiers add deal-specific support with Dr. Merritt.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {WL_BUDGETS.map(b => (
                    <button type="button" key={b} onClick={() => setBudget(b)}
                      onMouseEnter={() => b === "$2,000+" && setPartnerHover(true)}
                      onMouseLeave={() => b === "$2,000+" && setPartnerHover(false)}
                      style={{ gridColumn: (b === "$2,000+" || b === "I need specific, customized deal help") ? "1 / -1" : undefined, background: budget === b ? "#b8010118" : "transparent", border: budget === b ? "1px solid #b80101" : b === "$2,000+" ? "1px solid #e0c4c455" : b === "I need specific, customized deal help" ? "1px solid #b8010145" : "1px solid #2a0000", borderRadius: 8, padding: "11px 12px", cursor: "pointer", color: budget === b ? "#f0d8d8" : b === "$2,000+" ? "#e0c4c4" : b === "I need specific, customized deal help" ? "#c8a8a8" : "#8a7070", fontWeight: 700, fontSize: 13, fontFamily: font }}>
                      {b === "$2,000+" ? "✦ $2,000+ · Thought partnership" : b === "I need specific, customized deal help" ? "🔴 I need specific, customized deal help" : b}
                    </button>
                  ))}
                  {budget === "I need specific, customized deal help" && (
                    <div style={{ gridColumn: "1 / -1", background: "#12060a", border: "1px solid #b8010140", borderRadius: 8, padding: "10px 12px", color: "#c8a8a8", fontSize: 12, fontFamily: font, lineHeight: 1.6 }}>Deal-specific support — your numbers, your gap, your structure — comes with the <strong style={{ color: "#f0d8d8" }}>Elite plan</strong> ($499.99/mo) or the Senior Advisor retainer. We'll recommend Elite and point you at the fastest way to get Dr. Merritt on your deal.</div>
                  )}
                  {(budget === "$2,000+" || partnerHover) && (
                    <div style={{ gridColumn: "1 / -1", color: "#e0c4c4", fontSize: 12.5, fontFamily: font, lineHeight: 1.8, background: "#12060a", border: "1px solid #e0c4c430", borderRadius: 8, padding: "12px 16px" }}>
                      <strong style={{ color: "#f0d8d8" }}>This isn't a subscription — it's a retainer.</strong> Put Dr. Gina Merritt directly on YOUR project: dedicated hours with her every month, deal review, capital strategy, negotiation prep, and a private client workspace. You're not buying content — you're buying her time, her expertise, and her business infrastructure under your foundation. That's why it's priced like the consulting engagement it is.
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>Where did you hear about us? <span style={{ color: "#5a4040", textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                <select style={sel} value={source} onChange={e => setSource(e.target.value)}>
                  <option value="">Prefer not to say</option>
                  {WL_SOURCE.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              {msg && <div style={{ color: "#ff6b6b", fontSize: 13, fontFamily: font, marginBottom: 12 }}>{msg}</div>}
              <button type="submit" disabled={busy} style={{ ...btnRed, width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "Saving your spot…" : insider ? "Join the Insider Waitlist →" : "Join the Waitlist →"}</button>
            </form>
          </>
        )}
    </div>
  );
}


// ─── RESOURCES & TEMPLATES (Premium+; partner network is Elite) ─────────────

export function ResourcesPage({ member, onUpgrade }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const rank = member && !member.suspended ? (TIER_RANK[member.tier] ?? 0) : 0;

  useEffect(() => {
    if (rank < 2 && member?.role !== "admin") return;
    api("/api/resources").then(setData).catch(e => setError(e.message));
  }, [member?.id]);

  if (!member || (rank < 2 && member.role !== "admin")) {
    return (
      <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "140px 20px", textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}><Lock size={36} color="#b80101" style={{ display: "inline-block" }} /></div>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 40, color: "var(--gu-text)", marginBottom: 14 }}>Resources & Templates</h1>
        <p style={{ color: "var(--gu-muted)", fontFamily: font, fontSize: 15, maxWidth: 480, margin: "0 auto 28px", lineHeight: 1.8 }}>
          Development timeline templates, worksheets, and curated tools are a Premium benefit — and Elite members unlock the NREUV partner network with member-only referral codes.
        </p>
        <button style={btnRed} onClick={onUpgrade}>View Plans →</button>
      </div>
    );
  }

  const groups = [
    { key: "template", title: "Templates", desc: "Development timelines, worksheets, and working documents." },
    { key: "resource", title: "Resources", desc: "Curated tools and reading Dr. Merritt's team actually uses." },
    { key: "partner", title: "NREUV Partner Network", desc: "The firms in our corner — with member referral codes.", elite: true },
  ];

  return (
    <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "110px clamp(20px,5vw,80px) 80px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>Member Library</div>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(32px,5vw,48px)", color: "var(--gu-text)", marginBottom: 40 }}>Resources & Templates</h1>
        {error && <div style={{ color: "#ff6b6b", fontFamily: font, fontSize: 13, marginBottom: 20 }}>{error}</div>}
        {!data ? <div style={{ color: "var(--gu-muted)", fontFamily: font }}>Loading…</div> : groups.map(g => {
          const items = data.resources.filter(r => r.category === g.key);
          const locked = g.elite && rank < 3 && member.role !== "admin";
          return (
            <div key={g.key} style={{ marginBottom: 44 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
                <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, color: "var(--gu-text2)" }}>{g.title}</h2>
                {g.elite && <TierBadge tier="Elite" small />}
              </div>
              <p style={{ color: "var(--gu-muted2)", fontSize: 13, fontFamily: font, marginBottom: 18 }}>{g.desc}</p>
              {locked ? (
                <div style={{ background: "var(--gu-card2)", border: "1px solid #1e0000", borderRadius: 14, padding: "26px 30px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <Lock size={18} color="var(--gu-muted)" />
                  <span style={{ color: "var(--gu-muted)", fontSize: 14, fontFamily: font, flex: 1 }}>The partner network — marketing, tech, design and more, with member-only referral discounts — is an Elite benefit.</span>
                  <button style={btnRed} onClick={onUpgrade}>Go Elite →</button>
                </div>
              ) : items.length === 0 ? (
                <div style={{ color: "var(--gu-faint)", fontSize: 13, fontFamily: font, background: "var(--gu-card2)", border: "1px solid #1e0000", borderRadius: 12, padding: "20px 24px" }}>Nothing here yet — check back soon.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {items.map(r => (
                    <div key={r.id} style={{ background: "var(--gu-card)", border: "1px solid #2a0000", borderRadius: 14, padding: "20px 26px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "10px 28px" }}>
                      <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 8 }}>
                      {r.url && !/youtube\.com|youtu\.be/.test(r.url) ? (
                        <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#b80101", fontWeight: 800, fontSize: 16, fontFamily: font, textDecoration: "none" }}>{r.title} ↗</a>
                      ) : (
                        <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 16, fontFamily: font }}>{r.title}</div>
                      )}
                      {r.description && <div style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font, lineHeight: 1.7, flex: 1 }}>{r.description}</div>}
                      </div>
                      <div style={{ width: "min(340px, 100%)", display: "flex", flexDirection: "column", gap: 8 }}>
                      {r.recommendation && (
                        <div style={{ background: "var(--gu-red-tint)", border: "1px solid #b8010120", borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ fontSize: 9, color: "#b80101", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 4 }}>Why NREUV recommends it</div>
                          <div style={{ color: "var(--gu-body)", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>{r.recommendation}</div>
                        </div>
                      )}
                      {r.code && (
                        <div style={{ background: "var(--gu-card2)", border: "1px dashed #e0c4c440", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 9, color: "#b80101", fontWeight: 800, letterSpacing: "1.5px", fontFamily: font }}>CODE</span>
                          <code style={{ color: "var(--gu-text2)", fontSize: 13, letterSpacing: "1px" }}>{r.code}</code>
                          <button onClick={() => navigator.clipboard && navigator.clipboard.writeText(r.code)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--gu-muted)", cursor: "pointer", fontSize: 11, fontFamily: font, fontWeight: 700 }}>Copy</button>
                        </div>
                      )}
                      {r.url && (() => {
                        const yt = r.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
                        if (yt) return (
                          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden", background: "var(--gu-bg)" }}>
                            <iframe src={`https://www.youtube.com/embed/${yt[1]}`} title={r.title} allowFullScreen allow="accelerometer; encrypted-media; picture-in-picture" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
                          </div>
                        );
                        return <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#b80101", fontSize: 13, fontFamily: font, fontWeight: 800, textDecoration: "none" }}>Open →</a>;
                      })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── ADVISORY WORKSPACE (Senior Advisor retainer clients) ───────────────────

export function RetainerPage({ member, setActivePage }) {
  const [data, setData] = useState(undefined);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState({ title: "", url: "" });
  const [msg, setMsg] = useState(null);
  const feedRef = useRef(null);

  const load = () => api("/api/retainers").then(d => setData(d.retainer)).catch(() => setData(null));
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [member?.id]);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [data?.messages?.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try { await api("/api/retainers", { method: "POST", body: JSON.stringify({ action: "message", body }) }); await load(); }
    catch (err) { setMsg(err.message); }
  };
  const addFile = async (e) => {
    e.preventDefault();
    if (!file.title) return;
    try {
      await api("/api/retainers", { method: "POST", body: JSON.stringify({ action: "add_file", ...file }) });
      setFile({ title: "", url: "" }); await load();
    } catch (err) { setMsg(err.message); }
  };
  const requestTime = async () => {
    try { await api("/api/retainers", { method: "POST", body: JSON.stringify({ action: "request_time", note: "" }) }); setMsg("Request sent — the team will reach out to schedule."); }
    catch (err) { setMsg(err.message); }
  };

  if (data === undefined) return <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "140px 20px", textAlign: "center", color: "var(--gu-muted)", fontFamily: font }}>Loading your workspace…</div>;

  // Post-call: the team enabled the retainer — client picks hours and pays
  if (data && data.status === "offered") {
    const PLANS = [
      { item: "retainer_5", hrs: 5, price: "$3,025" },
      { item: "retainer_10", hrs: 10, price: "$5,500", popular: true },
      { item: "retainer_15", hrs: 15, price: "$7,700" },
    ];
    return (
      <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "120px clamp(20px,5vw,60px) 80px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>Senior Advisor Retainer</div>
          <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(30px,4.5vw,42px)", color: "var(--gu-text)", marginBottom: 12 }}>Choose your hours.</h1>
          <p style={{ color: "var(--gu-muted)", fontSize: 15, fontFamily: font, lineHeight: 1.8, maxWidth: 520, margin: "0 auto 34px" }}>
            {data.notes || "Following your call with Dr. Merritt — pick the monthly block that fits your project. Billed monthly, cancel anytime. Your workspace opens the moment you're set."}
          </p>
          <div style={{ background: "var(--gu-card2)", border: "1px solid var(--gu-border)", borderRadius: 12, padding: "14px 20px", maxWidth: 520, margin: "0 auto 28px", color: "var(--gu-muted)", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>
            A one-time <strong style={{ color: "var(--gu-text2)" }}>$1,500 onboarding fee</strong> covers Dr. Merritt's project intake — reviewing your deal, documents, and goals before the first working session.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {PLANS.map(p => (
              <div key={p.item} style={{ background: "var(--gu-card)", border: p.popular ? "1px solid #b8010150" : "1px solid var(--gu-border)", borderRadius: 16, padding: "30px 24px" }}>
                <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 46, color: "var(--gu-text)", lineHeight: 1 }}>{p.hrs}</div>
                <div style={{ fontSize: 10, color: "var(--gu-muted)", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", fontFamily: font, marginTop: 6, marginBottom: 16 }}>hours / month</div>
                <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, color: "var(--gu-text2)", marginBottom: 18 }}>{p.price}<span style={{ fontSize: 13, color: "var(--gu-muted)", fontFamily: font, fontWeight: 400 }}>/mo</span></div>
                <button onClick={() => window.startCheckout && window.startCheckout(p.item)} style={{ ...btnRed, width: "100%" }}>Start →</button>
              </div>
            ))}
          </div>
          <p style={{ color: "var(--gu-faint)", fontSize: 12, fontFamily: font, marginTop: 22, marginBottom: 40 }}>Charged monthly. Change or cancel anytime, self-service, from Membership &amp; billing on your member page.</p>

          {/* Locked preview of what opens on payment */}
          <div style={{ position: "relative", textAlign: "left" }}>
            <div style={{ filter: "blur(4px)", opacity: 0.4, pointerEvents: "none", userSelect: "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18 }}>
                <div>
                  <div style={{ background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "26px 28px", marginBottom: 16 }}>
                    <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>Hours this month</div>
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 44, color: "var(--gu-text)" }}>10.0</div>
                    <div style={{ height: 10, background: "var(--gu-card2)", borderRadius: 99, marginTop: 12 }}><div style={{ width: "35%", height: "100%", background: "#b80101", borderRadius: 99 }} /></div>
                  </div>
                  <div style={{ background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "26px 28px" }}>
                    <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>Project Documents</div>
                    <div style={{ color: "var(--gu-body)", fontSize: 13, fontFamily: font, lineHeight: 2 }}>Site feasibility model.xlsx<br />Capital stack draft.pdf<br />LOI — 9410 Hough</div>
                  </div>
                </div>
                <div style={{ background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "22px", minHeight: 260 }}>
                  <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 15, fontFamily: font, marginBottom: 14 }}>Direct line</div>
                  <div style={{ color: "var(--gu-body)", fontSize: 13, fontFamily: font, lineHeight: 1.9 }}>Dr. Merritt: Looked at your capital stack — call me before you respond to the lender.</div>
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Lock size={22} color="#b80101" />
              <div style={{ color: "var(--gu-text2)", fontSize: 13.5, fontFamily: font, fontWeight: 800 }}>Your workspace unlocks the moment payment clears</div>
              <div style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font }}>Hours tracking · project documents · direct line to Dr. Merritt</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "140px 20px", textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}><Handshake size={36} color="#b80101" style={{ display: "inline-block" }} /></div>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 40, color: "var(--gu-text)", marginBottom: 14 }}>Advisory Workspace</h1>
        <p style={{ color: "var(--gu-muted)", fontFamily: font, fontSize: 15, maxWidth: 460, margin: "0 auto 28px", lineHeight: 1.8 }}>
          This is where Senior Advisor retainer clients work with Dr. Merritt month to month — hours, documents, and a direct line. Available with an active retainer.
        </p>
        <button style={btnRed} onClick={() => setActivePage("pricing")}>See the Retainer →</button>
      </div>
    );
  }

  const used = Number(data.used_this_month || 0);
  const total = Number(data.hours_per_month);
  const pct = Math.min(100, Math.round((used / total) * 100));

  return (
    <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "110px clamp(20px,5vw,60px) 70px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>Senior Advisor Retainer</div>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(30px,4.5vw,42px)", color: "var(--gu-text)", marginBottom: 28 }}>Your Advisory Workspace</h1>
        {msg && <div style={{ color: "#22c55e", fontSize: 13, fontFamily: font, marginBottom: 16 }}>{msg}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(280px,340px)", gap: 20, alignItems: "start" }} className="ret-grid">
          {/* Left: hours + files */}
          <div>
            <div style={{ background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "26px 28px", marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font }}>Hours this month</div>
                <div style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font }}>${Number(data.monthly_amount).toLocaleString()}/mo · {total} hrs</div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 44, color: "var(--gu-text)", lineHeight: 1 }}>{(total - used).toFixed(1)}</span>
                <span style={{ color: "var(--gu-muted)", fontSize: 14, fontFamily: font }}>of {total} hours remaining</span>
              </div>
              <div style={{ height: 10, background: "var(--gu-card2)", borderRadius: 99, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "#b80101", borderRadius: 99 }} />
              </div>
              <button onClick={requestTime} style={btnRed}>Request Time →</button>
              {data.log?.length > 0 && (
                <div style={{ marginTop: 20, borderTop: "1px solid var(--gu-border2)", paddingTop: 14 }}>
                  <div style={{ fontSize: 9, color: "var(--gu-muted)", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", fontFamily: font, marginBottom: 10 }}>Recent hours</div>
                  {data.log.map((l, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < data.log.length - 1 ? "1px solid var(--gu-border2)" : "none" }}>
                      <span style={{ color: "var(--gu-body)", fontSize: 13, fontFamily: font }}>{l.note || "Advisory time"}</span>
                      <span style={{ color: "var(--gu-text2)", fontSize: 13, fontFamily: font, fontWeight: 700 }}>{Number(l.hours)} hrs · {new Date(l.logged_on).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "26px 28px" }}>
              <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>Project Documents</div>
              <p style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, marginBottom: 14 }}>Share deal docs, models, and links — anything you want Dr. Merritt to review.</p>
              <form onSubmit={addFile} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <input style={{ ...inp, marginBottom: 0, flex: 1, minWidth: 150 }} value={file.title} onChange={e => setFile({ ...file, title: e.target.value })} placeholder="Document name" />
                <input style={{ ...inp, marginBottom: 0, flex: 1, minWidth: 180 }} value={file.url} onChange={e => setFile({ ...file, url: e.target.value })} placeholder="Link (Drive, Dropbox…)" />
                <button type="submit" style={btnRed}>Add</button>
              </form>
              {data.files?.length ? data.files.map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--gu-border2)" }}>
                  <FileTextIcon />
                  <span style={{ color: "var(--gu-text2)", fontSize: 13.5, fontFamily: font, fontWeight: 600, flex: 1 }}>{f.title}</span>
                  {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ color: "#b80101", fontSize: 12.5, fontFamily: font, fontWeight: 800, textDecoration: "none" }}>Open ↗</a>}
                </div>
              )) : <div style={{ color: "var(--gu-faint)", fontSize: 13, fontFamily: font }}>Nothing shared yet.</div>}
            </div>
          </div>

          {/* Right: direct line */}
          <div style={{ background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 16, display: "flex", flexDirection: "column", height: "min(70vh, 620px)", position: "sticky", top: 90 }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--gu-border2)" }}>
              <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 15, fontFamily: font }}>Direct line</div>
              <div style={{ color: "var(--gu-muted)", fontSize: 12, fontFamily: font }}>Dr. Merritt & the GroundUp team</div>
            </div>
            <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
              {(!data.messages || data.messages.length === 0) && <div style={{ color: "var(--gu-faint)", fontSize: 13, fontFamily: font, textAlign: "center", marginTop: 40 }}>Start the conversation — what are you working on?</div>}
              {data.messages?.map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: m.from_admin ? "flex-start" : "flex-end", marginBottom: 10 }}>
                  <div style={{ maxWidth: "85%", background: m.from_admin ? "var(--gu-red-tint)" : "var(--gu-card2)", border: "1px solid " + (m.from_admin ? "#b8010130" : "var(--gu-border)"), borderRadius: 12, padding: "10px 14px" }}>
                    {m.from_admin && <div style={{ marginBottom: 4 }}><span style={{ background: "#b80101", color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800, fontFamily: font, letterSpacing: "1px" }}>TEAM</span></div>}
                    <div style={{ color: "var(--gu-body)", fontSize: 13.5, fontFamily: font, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                    <div style={{ color: "var(--gu-faint)", fontSize: 10, fontFamily: font, marginTop: 4 }}>{timeAgo(m.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={send} style={{ display: "flex", gap: 8, padding: "12px 14px 16px", borderTop: "1px solid var(--gu-border2)" }}>
              <input style={{ ...inp, marginBottom: 0, flex: 1 }} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Message the team…" maxLength={4000} />
              <button type="submit" style={{ ...btnRed, padding: "12px 16px" }}>↑</button>
            </form>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 860px) { .ret-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function FileTextIcon() {
  return <span style={{ width: 14, height: 14, display: "inline-block", border: "1.5px solid #b80101", borderRadius: 2, flexShrink: 0 }} />;
}
