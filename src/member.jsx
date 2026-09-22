import { BookOpen, MessagesSquare, Video, Handshake, Lock, Mail, Megaphone, Menu, X as XIcon, Eye, Calendar, ThumbsUp, Heart, Lightbulb, Flame, PartyPopper, SmilePlus } from "lucide-react";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { pollVisible } from "./poll.js";

// ─── MEMBER SESSION HELPERS ─────────────────────────────────────────────────

export const TIER_RANK = { Free: 0, Basic: 1, Builder: 2, Premium: 3, Elite: 4 };
// The nine phases of development, in order — Dr. Merritt's official list.
// The library, the phase channels, and the Development Overview course all
// follow this array; rename here and every phase label in the app follows.
// First name for greetings — honorifics keep their next word, so
// "Dr. Gina Merritt" greets as "Dr. Gina", never a bare "Dr."
export function firstName(full) {
  const parts = String(full || "").trim().split(/\s+/);
  if (/^(Dr|Mr|Mrs|Ms|Prof|Rev)\.?$/i.test(parts[0]) && parts[1]) return parts[0] + " " + parts[1];
  return parts[0] || "";
}
export const DEV_PHASES = ["Feasibility", "Predevelopment", "Program Development", "Acquisition", "Development (Financing, Construction)", "Community Engagement", "Construction", "Stabilization", "Compliance"];

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
export const TIER_LABELS = { Free: "Free", Basic: "Member", Builder: "Builder", Premium: "Premium", Elite: "Owner", Partner: "Partner" };

// Account badges — earned perks that follow a member everywhere: the admin
// sheets, their profile, and next to their name in the community. Add new
// badges here as they're invented; unknown keys are ignored gracefully.
export const BADGE_DEFS = {
  founding25: { label: "Founding Member", icon: "✦", color: "#e0c4c4", title: "Founding Member — one of the first 25, with a year of Lunch & Learns free and founding pricing" },
  interest: { label: "Day One", icon: "🌱", color: "#7fb069", title: "Signed up through the interest form on drginamerritt.net before launch" },
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

export function AuthModal({ onClose, onAuthed, onSignupIntent, defaultTier = "Free", startMode = "signup", allowSignup = true }) {
  const [mode, setMode] = useState(startMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tier, setTier] = useState(defaultTier);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const [notice, setNotice] = useState("");
  const [mfa, setMfa] = useState(false); // admin accounts: emailed code step
  const [mfaCode, setMfaCode] = useState("");

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
      // A plain signup hands off to onboarding WITHOUT creating anything yet —
      // the account is written at the end of that flow, so abandoning it leaves
      // no orphan account. Check the email is free first, so nobody fills in
      // three screens and is told at the end that it's taken.
      if (mode === "signup" && tier === "Free" && onSignupIntent) {
        await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "check_email", email }) });
        onSignupIntent({ name, email, password });
        setBusy(false);
        return;
      }
      // Accounts are always created Free — a paid tier only comes from Stripe
      // checkout (below) or an admin. The picker records intent, nothing more.
      const data = mode === "signup"
        ? await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "signup", name, email, password, ref: localStorage.getItem("guRef") || undefined }) })
        : await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "login", email, password, ...(mfa ? { code: mfaCode } : {}) }) });
      // Team accounts get a second step: the emailed 6-digit sign-in code
      if (data.mfa) { setMfa(true); setBusy(false); return; }
      saveMember(data.user, data.token);
      // A signup with no plan already picked hands off to onboarding; someone
      // who clicked "Choose Premium" has already chosen and goes to checkout.
      onAuthed(data.user, mode === "signup" && tier === "Free" ? "onboard" : mode);
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
          {mfa && mode === "login" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "#a89080", fontSize: 12.5, fontFamily: font, lineHeight: 1.6, marginBottom: 10 }}>Team accounts need one more step — a 6-digit code just landed in <strong style={{ color: "#f0d8d8" }}>{email}</strong>. It's good for 10 minutes.</div>
              <label style={lbl}>Sign-in code</label>
              <input style={{ ...inp, fontSize: 20, letterSpacing: "8px", textAlign: "center" }} value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoFocus placeholder="000000" />
            </div>
          )}
          {/* No plan grid here any more. Someone who arrived from a specific tier
              gets that choice confirmed; everyone else picks a plan in onboarding,
              right after the account exists, where the tiers can be compared
              properly instead of as five cramped buttons. */}
          {mode === "signup" && (
            <div style={{ marginBottom: 20 }}>
              {localStorage.getItem("guGift") && (
                <div style={{ background: "#22c55e12", border: "1px solid #22c55e50", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#22c55e", fontSize: 13, fontFamily: font, fontWeight: 700 }}>
                  A gift is attached to your invitation — your first month is free. It works with the email your link was sent to.
                </div>
              )}
              {tier !== "Free" ? (
                <div style={{ background: "#0d0a04", border: "1px solid #2a2000", borderRadius: 8, padding: "10px 14px", color: "#b8a060", fontSize: 12, fontFamily: font, lineHeight: 1.6 }}>
                  You picked <strong style={{ color: "#f0d8d8" }}>{TIER_LABELS[tier] || tier}</strong>. After you create your account you&rsquo;ll go straight to secure checkout — your plan activates the moment payment clears.
                </div>
              ) : (
                <div style={{ background: "#0a0505", border: "1px solid #2a0000", borderRadius: 8, padding: "10px 14px", color: "#8a7070", fontSize: 12, fontFamily: font, lineHeight: 1.6 }}>
                  Next we&rsquo;ll ask what you&rsquo;re working on and show you every plan side by side. Nothing is charged until you choose one.
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
            : <>{allowSignup && <>New here? <button onClick={() => { setMode("signup"); setError(""); }} style={{ background: "none", border: "none", color: "#b80101", cursor: "pointer", fontWeight: 700, fontFamily: font, fontSize: 13 }}>Create an account</button><span style={{ margin: "0 8px", color: "#8a7575" }}>·</span></>}<button onClick={() => { setMode("forgot"); setError(""); }} style={{ background: "none", border: "none", color: "#8a7070", cursor: "pointer", fontWeight: 600, fontFamily: font, fontSize: 13 }}>Forgot password?</button></>}
        </div>
      </div>
    </div>
  );
}

// ─── FIRST-RUN ONBOARDING ───────────────────────────────────────────────────
//
// Shown once, right after an account is created. Two screens: the questions the
// waitlist already asks (so someone who never joined the list still gets a real
// recommendation), then the plan comparison.
//
// Every question is optional and says so — the ONLY required step is choosing a
// plan, and Free counts as a choice. Skipping the questions still lands on the
// comparison; it just arrives without a match badge.

// Free is deliberately NOT a card. Sat beside the paid tiers it competed as a
// product and made the row read as five choices; underneath, as a plain line of
// text, it is what it actually is — an honest way out for someone not ready.
const ONB_PLANS = ["Basic", "Builder", "Premium", "Elite"];
const ONB_PRICE = { Free: "$0", Basic: "$49.99/mo", Builder: "$149.99/mo", Premium: "$249.99/mo", Elite: "$499.99/mo" };
// Standing tags, independent of whatever the engine recommended. Premium is the
// plan we most want people on; Owner is the exceptional one and is capped, so it
// is tagged on access and scarcity rather than value.
const ONB_TAG = { Premium: "Best value", Elite: "Most access · 15 seats" };

// The things people actually buy a plan for. Four bullet lists in a row all read
// at the same weight, so the reasons to move up a tier disappear into them —
// these get bolded wherever they appear. Longest first, so "1:1 sessions with
// Dr. Merritt" wins before the bare "1:1 sessions" can match inside it.
const ONB_HIGHLIGHT = [
  "3 one-on-one advisory calls/yr with Dr. Merritt",
  "Direct messages to Dr. Merritt & her team",
  "Group office hours with Dr. Merritt",
  "The Lunch & Learn recording library",
  "Free invites to every live Lunch & Learn",
  "10% off 1:1 sessions with Dr. Merritt",
  "30% off 1:1 sessions with Dr. Merritt",
  "The Opportunity Board",
  "Post, reply & network in the community",
  "Community access",
  "office hours",
];
const ONB_HL_RE = new RegExp("(" + ONB_HIGHLIGHT.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "i");

function onbBold(text) {
  const parts = String(text).split(ONB_HL_RE);
  return parts.map((part, i) =>
    ONB_HL_RE.test(part) && i % 2 === 1
      ? <strong key={i} style={{ color: "#fff", fontWeight: 800 }}>{part}</strong>
      : <span key={i}>{part}</span>
  );
}
// Not everyone signing up is a developer — consultants, nonprofit and agency
// staff, lenders, architects and students all belong here, and the questions
// shouldn't assume otherwise.
const ONB_ROLE = [
  "Developer, or working toward it",
  "Consultant or advisor",
  "Nonprofit or community organization",
  "Government or public agency",
  "Lender, investor or funder",
  "Architect, engineer or contractor",
  "Property or asset management",
  "Student or researcher",
  "Something else",
];

// Each option has to make sense read on its own in a dropdown — "I've closed
// several" only parsed next to the line above it, and "closed" means reaching
// financial closing, which is exactly the jargon an emerging developer may not
// have yet.
const ONB_EXPERIENCE = [
  "I haven't worked on a development project yet",
  "I've worked on projects, but not my own",
  "I have a project in progress, nothing finished",
  "I've financed and closed one project of my own",
  "I've closed several projects",
  "I develop full time",
];
const ONB_FOCUS = ["Affordable housing (LIHTC)", "Workforce / missing middle", "Market-rate multifamily", "Mixed-use", "Single-family / small infill", "Commercial or retail", "Community facilities", "Still deciding"];

// A real building behind each step — these are Dr. Merritt's own projects, which
// is the point: this is what the curriculum is drawn from.
const ONB_BANNER = [
  { src: "/opt/nannie-helen.jpg", caption: "Nannie Helen at 4800 — Washington, DC" },
  { src: "/opt/hough-blue-hero.jpg", caption: "9410 Hough — Cleveland, Ohio" },
  { src: "/opt/beacon-center.jpg", caption: "The Beacon Center — Washington, DC" },
];

// Brighter than the rest of the member UI on purpose: this is someone's first
// minute inside GroundUp. Reds, blacks, whites and greys only.
const onbInp = { width: "100%", background: "#2a1416", border: "1px solid #5a2122", borderRadius: 9, padding: "12px 14px", color: "#fff5f5", fontFamily: font, fontSize: 14, outline: "none", boxSizing: "border-box" };
const onbLbl = { display: "block", fontSize: 10, color: "#e0aaaa", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 };
const onbBtn = { background: "#e01818", color: "#fff", border: "none", borderRadius: 9, padding: "13px 22px", fontFamily: font, fontWeight: 800, fontSize: 13.5, cursor: "pointer" };

export function OnboardingFlow({ pending, onDone }) {
  const [step, setStep] = useState(0);
  const [learn, setLearn] = useState("");
  const [pain, setPain] = useState("");
  const [source, setSource] = useState("");
  const [phase, setPhase] = useState("");
  const [role, setRole] = useState("");
  const [experience, setExperience] = useState("");
  const [focus, setFocus] = useState("");
  const [goal, setGoal] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Developer-specific questions are hidden from everyone else — a city planner
  // or a lender has no honest answer to "where are you in the process?"
  const isDev = role === "Developer, or working toward it";
  // Five tiers belong on one line; only a genuinely narrow screen may wrap them.
  const wide5 = typeof window !== "undefined" && window.innerWidth >= 860;
  const sel = { ...onbInp, appearance: "auto", cursor: "pointer" };
  const inp2 = onbInp, lbl2 = onbLbl;

  // Saves whatever was answered (possibly nothing) and moves to the plans.
  // Budget is deliberately NOT asked — the engine recommends from need alone.
  const toPlans = async () => {
    setBusy(true);
    try {
      const d = await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "recommend", learn, pain }) });
      setRec(d.recommendation || null);
    } catch { /* a failed recommendation must not trap anyone before the plans */ }
    setBusy(false);
    setStep(2);
  };

  // The account is created HERE, at the end, with every answer attached.
  const choose = async (t) => {
    setBusy(true); setError("");
    try {
      const data = await api("/api/auth", { method: "POST", body: JSON.stringify({
        action: "signup", name: pending.name, email: pending.email, password: pending.password,
        ref: localStorage.getItem("guRef") || undefined,
        onboarding: { learn, pain, source, role, phase, experience, focus, goal, company, location },
      }) });
      saveMember(data.user, data.token);
      // Order matters. Closing the flow first revealed the member portal behind
      // it while the Checkout Session was still being created — someone picking
      // a paid plan briefly saw the site as though they were already in. Start
      // the redirect first and leave this on screen until the browser leaves.
      if (t !== "Free" && window.startCheckout) {
        const ok = await window.startCheckout("sub_" + t + (localStorage.getItem("guAnnual") === "1" ? "_annual" : ""), { promo: localStorage.getItem("guPromo") || undefined, gift: localStorage.getItem("guGift") || undefined });
        if (ok) return; // navigating away — keep the flow up behind the overlay
        setError("Your account is ready, but we couldn't open checkout. You can upgrade any time from Membership.");
        setBusy(false);
        return;
      }
      onDone(data.user);
    } catch (e) {
      setError(e.message || "We couldn't create your account just now.");
      setBusy(false);
    }
  };

  // recommendPlan speaks in tier keys; Advisor and the passes aren't rows here.
  const recTier = rec && ONB_PLANS.includes(rec.tier) ? rec.tier : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(10,2,3,0.92)", backdropFilter: "blur(6px)", overflowY: "auto", padding: "24px 16px" }}>
      <div style={{ background: "#1a0d0e", border: "1px solid #46191a", borderRadius: 20, padding: "32px clamp(20px,4vw,38px)", width: "100%", maxWidth: step === 2 ? 1100 : 520, margin: "0 auto" }}>
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", marginBottom: 22, height: step === 2 ? 110 : 150 }}>
          <img src={ONB_BANNER[step].src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,4,6,0.25) 0%, rgba(20,4,6,0.85) 100%)" }} />
          <div style={{ position: "absolute", left: 16, right: 16, bottom: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
            <div style={{ color: "#ffd9d9", fontSize: 11.5, fontFamily: font, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>{ONB_BANNER[step].caption}</div>
            <div style={{ display: "flex", gap: 5 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 4, background: i === step ? "#ff3b3b" : "#ffffff55", transition: "width .2s" }} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 10, color: "#ff5c5c", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 10 }}>
          Step {step + 1} of 3
        </div>

        {step === 0 ? (
          <>
            <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 30, color: "#f5e8e8", marginBottom: 6 }}>Welcome, {firstName(pending?.name) || "there"}.</h2>
            <p style={{ color: "#d9c2c2", fontSize: 14, lineHeight: 1.7, fontFamily: font, marginBottom: 24 }}>
              Tell us a little about you, so Dr. Merritt and the community know who they're talking to. All of it is optional and you can change it later.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={lbl2}>Company or organization</label>
              <input style={inp2} value={company} onChange={e => setCompany(e.target.value)} maxLength={120} placeholder="Your company, or none yet" />
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={lbl2}>Where do you work?</label>
              <input style={inp2} value={location} onChange={e => setLocation(e.target.value)} maxLength={120} placeholder="e.g. Washington DC · Cleveland" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl2}>Which best describes you?</label>
              <select style={sel} value={role} onChange={e => setRole(e.target.value)}>
                <option value="">Rather not say</option>
                {ONB_ROLE.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {isDev && <div style={{ marginBottom: 26 }}>
              <label style={lbl2}>Any hands-on development experience?</label>
              <select style={sel} value={experience} onChange={e => setExperience(e.target.value)}>
                <option value="">Rather not say</option>
                {ONB_EXPERIENCE.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>}

            <button onClick={() => setStep(1)} style={{ ...onbBtn, width: "100%" }}>Continue →</button>
            <button onClick={toPlans} disabled={busy} style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", color: "#c2a5a5", fontFamily: font, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Skip to the plans
            </button>
          </>
        ) : step === 1 ? (
          <>
            <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 30, color: "#f5e8e8", marginBottom: 6 }}>What are you working on?</h2>
            <p style={{ color: "#d9c2c2", fontSize: 14, lineHeight: 1.7, fontFamily: font, marginBottom: 24 }}>
              This is what we use to point you at the right courses, channels and plan — instead of making you guess. Still optional.
            </p>

            {isDev && <div style={{ marginBottom: 16 }}>
              <label style={lbl2}>What kind of development?</label>
              <select style={sel} value={focus} onChange={e => setFocus(e.target.value)}>
                <option value="">Not sure yet</option>
                {ONB_FOCUS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>}
            {isDev && <div style={{ marginBottom: 16 }}>
              <label style={lbl2}>Where are you in the process?</label>
              <select style={sel} value={phase} onChange={e => setPhase(e.target.value)}>
                <option value="">Not on a project right now</option>
                {DEV_PHASES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl2}>What do you hope to learn?</label>
              <select style={sel} value={learn} onChange={e => setLearn(e.target.value)}>
                <option value="">No preference yet</option>
                {WL_LEARN.filter(o => o !== "Other").map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl2}>What's in your way right now?</label>
              <select style={sel} value={pain} onChange={e => setPain(e.target.value)}>
                <option value="">Rather not say</option>
                {WL_PAIN.filter(o => o !== "Other").map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl2}>What would make this year a win?</label>
              <textarea style={{ ...inp2, minHeight: 74, resize: "vertical" }} value={goal} onChange={e => setGoal(e.target.value)} maxLength={400} placeholder="In your own words — Dr. Merritt reads these." />
            </div>
            <div style={{ marginBottom: 26 }}>
              <label style={lbl2}>How did you find us?</label>
              <select style={sel} value={source} onChange={e => setSource(e.target.value)}>
                <option value="">Prefer not to say</option>
                {WL_SOURCE.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <button onClick={toPlans} disabled={busy} style={{ ...onbBtn, width: "100%", opacity: busy ? 0.6 : 1 }}>
              {busy ? "One moment…" : "See the plans →"}
            </button>
            <button onClick={() => setStep(0)} style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", color: "#c2a5a5", fontFamily: font, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ← Back
            </button>
          </>
        ) : (
          <>
            <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 30, color: "#f5e8e8", marginBottom: 6 }}>Choose your plan</h2>
            <p style={{ color: "#d9c2c2", fontSize: 14, lineHeight: 1.7, fontFamily: font, marginBottom: 8 }}>
              {recTier
                ? <>Based on your answers we'd start you at <strong style={{ color: "#f0d8d8" }}>{TIER_LABELS[recTier]}</strong> — but every plan is here, and you can change or cancel any time.</>
                : <>Every plan, side by side. You can change or cancel any time.</>}
            </p>
            {rec && !recTier && (
              <p style={{ color: "#e5cccc", fontSize: 13, lineHeight: 1.7, fontFamily: font, marginBottom: 8 }}>
                Your answers point at <strong style={{ color: "#f0d8d8" }}>{rec.label}</strong> ({rec.price}) — reach out and we'll set that up directly.
              </p>
            )}
            <p style={{ color: "#b59a9a", fontSize: 12, fontFamily: font, marginBottom: 22 }}>Cancel any time, in one click — no emails, no phone calls.</p>

            {error && <div style={{ background: "#3a1010", border: "1px solid #ef2b2b", borderRadius: 9, padding: "10px 14px", color: "#ffc9c9", fontSize: 13, fontFamily: font, marginBottom: 16 }}>{error}</div>}
            <div style={{ display: "grid", gridTemplateColumns: wide5 ? "repeat(4,minmax(0,1fr))" : "repeat(auto-fit,minmax(180px,1fr))", gap: 12, alignItems: "stretch" }}>
              {ONB_PLANS.map(t => {
                const match = t === recTier;
                return (
                  <div key={t} style={{ background: match ? "#2a1012" : "#22100f", border: `1px solid ${match ? "#ef2b2b" : "#46191a"}`, borderRadius: 14, padding: "18px 15px", display: "flex", flexDirection: "column" }}>
                    {/* A tier can be both their match and the best value — show both
                        rather than letting one quietly hide the other. */}
                    {(match || ONB_TAG[t]) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8, minHeight: 18 }}>
                        {match && <span style={{ fontSize: 9, color: "#fff", background: "#e01818", borderRadius: 4, padding: "3px 6px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", fontFamily: font }}>Your match</span>}
                        {ONB_TAG[t] && <span style={{ fontSize: 9, color: "#ffb3b3", border: "1px solid #7a2a2b", borderRadius: 4, padding: "3px 6px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", fontFamily: font }}>{ONB_TAG[t]}</span>}
                      </div>
                    )}
                    <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: "#f5e8e8" }}>{TIER_LABELS[t]}</div>
                    <div style={{ color: "#ff4d4d", fontWeight: 800, fontSize: 15, fontFamily: font, margin: "2px 0 14px" }}>{ONB_PRICE[t]}</div>
                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px", flex: 1 }}>
                      {(BENEFITS[t] || []).map((f, i) => (
                        <li key={i} style={{ color: "#dcc6c6", fontSize: 12, lineHeight: 1.55, fontFamily: font, marginBottom: 7, paddingLeft: 14, position: "relative" }}>
                          <span style={{ position: "absolute", left: 0, color: "#ef2b2b" }}>·</span>{onbBold(f)}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => choose(t)} disabled={busy} style={{ ...onbBtn, width: "100%", background: match ? "#e01818" : "transparent", border: match ? "none" : "1px solid #5a2122", color: match ? "#fff" : "#f7e6e6" }}>
                      {`Choose ${TIER_LABELS[t]} →`}
                    </button>
                  </div>
                );
              })}
            </div>

            <button onClick={() => choose("Free")} disabled={busy} style={{ display: "block", width: "100%", marginTop: 14, background: "transparent", border: "1px dashed #5a2122", borderRadius: 11, padding: "15px 18px", color: "#e0bcbc", fontFamily: font, fontSize: 13.5, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
              Free — I&rsquo;m not ready to invest yet
              <span style={{ display: "block", marginTop: 4, color: "#b59a9a", fontSize: 12, fontWeight: 500 }}>
                Keep your account, preview every curriculum, and upgrade whenever you are.
              </span>
            </button>

            <button onClick={() => setStep(1)} style={{ display: "block", margin: "18px auto 0", background: "none", border: "none", color: "#c2a5a5", fontFamily: font, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ← Back to the questions
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MEETINGS: a paid 1:1 is a small engagement, not a receipt ───────────────
// Everything about one session in one place: when it is, what Dr. Merritt should
// read first, and the documents to read it from. The brief used to go into
// browser storage, so she never actually received it.
export function MeetingsPanel({ member }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api("/api/bookings").then(d => setRows(d.bookings || [])).catch(e => { setErr(e.message); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);

  if (rows === null) return <div style={{ color: "var(--gu-muted)", fontFamily: font, fontSize: 13.5, padding: "18px 0" }}>Loading your meetings…</div>;
  if (err) return <div style={{ color: "#ff8a8a", fontFamily: font, fontSize: 13.5 }}>{err}</div>;
  if (!rows.length) return null;

  const unscheduled = rows.filter(b => !b.scheduled_at);
  return (
    <div style={{ marginBottom: 22 }}>
      {/* Asking for a time on every card meant someone with four sessions was
          told to book four times. Ask once, for all of them. */}
      {unscheduled.length > 0 && (
        <div style={{ background: "var(--gu-card2)", border: "1px solid #b8010140", borderRadius: 14, padding: "18px 22px", marginBottom: 16 }}>
          <div style={{ color: "var(--gu-text)", fontWeight: 800, fontSize: 15, fontFamily: font, marginBottom: 6 }}>Booking your time</div>
          <div style={{ color: "var(--gu-body)", fontSize: 12.5, fontFamily: font, lineHeight: 1.7, marginBottom: 14 }}>
            We&rsquo;ve emailed you a confirmation with your booking link &mdash; book from there and you&rsquo;ll get a calendar invite. <strong style={{ color: "var(--gu-text2)" }}>If nothing on the calendar works</strong>, reply to that email and we&rsquo;ll find a time with you.
          </div>
          {member.booking_link && <Scheduler link={member.booking_link} />}
        </div>
      )}
      {rows.map(b => <MeetingCard key={b.id} b={b} onChange={load} />)}
    </div>
  );
}

// Google's appointment schedule embeds directly with ?gv=true, so the calendar
// opens inside GroundUp rather than throwing people out to a Google page mid-flow.
// It still doesn't tell us what was booked — Google doesn't expose that to an
// embed — so the optional "when is it" field stays until the Calendar API work.
function Scheduler({ link }) {
  const [open, setOpen] = useState(false);
  const src = link.includes("gv=true") ? link : link + (link.includes("?") ? "&" : "?") + "gv=true";
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{ ...btnRed, marginRight: 10 }}>
        {open ? "Hide the calendar" : "Book your time →"}
      </button>
      <a href={src} target="_blank" rel="noreferrer" style={{ color: "var(--gu-muted)", fontFamily: font, fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>open in a new tab</a>
      {open && (
        <div style={{ marginTop: 14, borderRadius: 12, overflow: "hidden", border: "1px solid var(--gu-border)", background: "#ffffff" }}>
          <iframe src={src} title="Book a time with Dr. Merritt" width="100%" height="640" frameBorder="0" style={{ display: "block", border: 0 }} />
        </div>
      )}
    </div>
  );
}

function MeetingCard({ b, onChange }) {
  const [brief, setBrief] = useState(b.brief || "");
  const [when, setWhen] = useState(b.scheduled_at ? new Date(b.scheduled_at).toISOString().slice(0, 16) : "");
  const [files, setFiles] = useState(b.files || []);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const flash = (ok, text) => { setNote({ ok, text }); setTimeout(() => setNote(null), 4500); };
  const post = (body) => api("/api/bookings", { method: "POST", body: JSON.stringify({ id: b.id, ...body }) });

  const saveBrief = async () => {
    setBusy("brief");
    try { await post({ action: "save_brief", brief }); flash(true, "Saved — Dr. Merritt sees this before your session."); }
    catch (e) { flash(false, e.message); } finally { setBusy(""); }
  };
  const saveWhen = async () => {
    setBusy("when");
    try { await post({ action: "set_scheduled", scheduled_at: when ? new Date(when).toISOString() : null }); flash(true, "Time saved."); onChange(); }
    catch (e) { flash(false, e.message); } finally { setBusy(""); }
  };
  const addLink = async () => {
    if (!linkTitle.trim() || !linkUrl.trim()) { flash(false, "Give the link a name and a URL."); return; }
    setBusy("link");
    try {
      const f = await post({ action: "add_file", title: linkTitle, url: linkUrl, kind: "link" });
      setFiles([...files, f]); setLinkTitle(""); setLinkUrl(""); flash(true, "Link added.");
    } catch (e) { flash(false, e.message); } finally { setBusy(""); }
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy("file");
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/lesson-pdfs?kind=prep", { method: "POST", headers: { Authorization: "Bearer " + (localStorage.getItem("guToken") || "") }, body: fd });
      const raw = await res.text();
      let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch {}
      if (!res.ok || !d.url) throw new Error(d.error || `Upload failed (${res.status})`);
      const f = await post({ action: "add_file", title: file.name, url: d.url, kind: "file" });
      setFiles([...files, f]); flash(true, "Uploaded — she'll have it before your session.");
    } catch (e) { flash(false, e.message); } finally { setBusy(""); }
  };
  const removeFile = async (id) => {
    try { await post({ action: "remove_file", file_id: id }); setFiles(files.filter(f => f.id !== id)); }
    catch (e) { flash(false, e.message); }
  };

  const soon = b.scheduled_at && new Date(b.scheduled_at) > new Date();
  const lbl = { display: "block", fontSize: 9, color: "var(--gu-muted)", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 };
  const box = { width: "100%", boxSizing: "border-box", background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 9, padding: "10px 13px", color: "var(--gu-text)", fontFamily: font, fontSize: 13.5, outline: "none" };

  return (
    <div style={{ background: "var(--gu-card2)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "22px 24px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ color: "var(--gu-text)", fontWeight: 800, fontSize: 16, fontFamily: font }}>{b.label || b.item}</div>
          <div style={{ color: soon ? "#4ade80" : "var(--gu-muted)", fontSize: 12.5, fontFamily: font, fontWeight: 700, marginTop: 4 }}>
            {soon
              ? new Date(b.scheduled_at).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })
              : b.scheduled_at
                ? "This session has passed"
                : `Paid${b.created_at ? " · " + new Date(b.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}`}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 16 }}>
        <div>
          <label style={lbl}>When is it?</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} style={box} />
            <button onClick={saveWhen} disabled={busy === "when"} style={{ ...btnGhost, whiteSpace: "nowrap" }}>{busy === "when" ? "…" : "Save"}</button>
          </div>
          <div style={{ color: "var(--gu-muted)", fontSize: 11.5, fontFamily: font, marginTop: 6 }}>Optional — if you add the time you booked, it shows here and on Dr. Merritt&rsquo;s side.</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>What do you want to cover?</label>
        <textarea value={brief} onChange={e => setBrief(e.target.value)} maxLength={5000} placeholder="Your deal, your question, the decision you're stuck on — as much detail as you can. She reads this before you meet."
          style={{ ...box, minHeight: 110, resize: "vertical", lineHeight: 1.6 }} />
        <button onClick={saveBrief} disabled={busy === "brief"} style={{ ...btnRed, marginTop: 8 }}>{busy === "brief" ? "Saving…" : b.brief ? "Update brief" : "Save brief"}</button>
      </div>

      <div>
        <label style={lbl}>Documents &amp; links for her to review</label>
        {files.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {files.map(f => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--gu-border2)" }}>
                <a href={f.url} target="_blank" rel="noreferrer" style={{ color: "#e0a0a0", fontSize: 13.5, fontFamily: font, fontWeight: 700, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.kind === "file" ? "📄" : "🔗"} {f.title}
                </a>
                <button onClick={() => removeFile(f.id)} style={{ background: "none", border: "none", color: "var(--gu-muted)", cursor: "pointer", fontSize: 12, fontFamily: font }}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} placeholder="Name it — e.g. Pro forma" style={{ ...box, flex: "1 1 180px" }} />
          <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" style={{ ...box, flex: "1 1 220px" }} />
          <button onClick={addLink} disabled={busy === "link"} style={btnGhost}>{busy === "link" ? "…" : "🔗 Submit link"}</button>
        </div>
        <label style={{ ...btnGhost, display: "inline-block", cursor: busy === "file" ? "default" : "pointer", opacity: busy === "file" ? 0.6 : 1 }}>
          {busy === "file" ? "Uploading…" : "📎 Upload project documents"}
          <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.pptx,.csv,.png,.jpg,.jpeg" onChange={e => upload(e.target.files?.[0])} style={{ display: "none" }} disabled={busy === "file"} />
        </label>
        <div style={{ color: "var(--gu-muted)", fontSize: 11.5, fontFamily: font, marginTop: 8 }}>PDF, Word, Excel, PowerPoint, CSV or images, up to 25MB. Anything bigger, add it as a link.</div>
      </div>

      {note && <div style={{ color: note.ok ? "#4ade80" : "#ff8a8a", fontSize: 12.5, fontFamily: font, fontWeight: 700, marginTop: 12 }}>{note.text}</div>}
    </div>
  );
}

// ─── MEMBERSHIP PAGE (dashboard) ────────────────────────────────────────────

const BENEFITS = {
  Free: ["The full course catalog & every curriculum, previewed", "Buy course passes, Lunch & Learns & 1:1 sessions anytime", "Your community profile, ready for when you join"],
  Basic: ["Every course — all seven, plus each new one we add", "All written lessons, case studies & worksheets", "Free invites to every live Lunch & Learn", "Resource lists & reading guides", "Community access — read every channel"],
  Builder: ["Everything in Member", "Post, reply & network in the community", "The Lunch & Learn recording library", "View-only: every guide, template & the Developer's Playbook"],
  Premium: ["Everything in Builder", "Download 3 guides or templates every month", "The Opportunity Board — RFPs, funding windows & deals", "JV & Partnerships channel", "Development timeline templates", "Group office hours with Dr. Merritt + priority booking", "10% off 1:1 sessions with Dr. Merritt"],
  Elite: ["Everything in Premium", "Deal support — bring YOUR deal to your advisory calls", "3 one-on-one advisory calls/yr with Dr. Merritt", "Direct messages to Dr. Merritt & her team — replies within 2 business days", "Owner Lounge — private channel", "Unlimited downloads — including the Developer's Playbook", "30% off 1:1 sessions with Dr. Merritt", "Invite to the exclusive networking event"],
  Partner: ["Custom organizational access", "Contact info@nreuv.com for your cohort setup"],
};

// What the NEXT tier would add — the approachable upsell on the membership page
const NEXT_TIER = {
  Free: { tier: "Basic", price: "$49.99/mo", adds: ["The full curriculum — every course, every lesson", "Community access"] },
  Basic: { tier: "Builder", price: "$149.99/mo", adds: ["A voice in the community — post, reply & network", "Free live Lunch & Learns + all recordings", "Every template & guide, view-only"] },
  Builder: { tier: "Premium", price: "$249.99/mo", adds: ["3 downloads a month", "The Opportunity Board", "Group office hours with Dr. Merritt", "10% off 1:1 sessions"] },
  Premium: { tier: "Elite", price: "$499.99/mo", adds: ["Deal support — bring YOUR deal to advisory calls", "DMs to Dr. Merritt & her team", "Unlimited downloads incl. the Playbook", "30% off 1:1 sessions"] },
};

// Your community profile: the photo, headline and bio other members see when
// they hover your messages.
function ProfileCard({ member }) {
  const [avatar, setAvatar] = useState(member.avatar_url || "");
  const [headline, setHeadline] = useState(member.headline || "");
  const [company, setCompany] = useState(member.company || "");
  const [title, setTitle] = useState(member.title || "");
  const [location, setLocation] = useState(member.location || "");
  const [bio, setBio] = useState(member.bio || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  const inp = { width: "100%", boxSizing: "border-box", background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 10, padding: "12px 14px", color: "var(--gu-text)", fontFamily: font, fontSize: 14, outline: "none" };
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      // Say what actually went wrong. "Upload failed" was the fallback whenever
      // the response wasn't JSON — a 413 from the platform on a large photo, or
      // a crash — so every different failure looked identical and told us nothing.
      if (file.size > 4 * 1024 * 1024) throw new Error(`That photo is ${(file.size / 1048576).toFixed(1)}MB — please keep it under 4MB.`);
      if (!/\.(png|jpe?g|webp)$/i.test(file.name || "")) throw new Error("Profile pictures need to be a PNG, JPG or WEBP. iPhone photos are often HEIC — in Photos, Share → Options → Most Compatible, or take a screenshot of it.");
      const res = await fetch("/api/lesson-pdfs?kind=avatar", { method: "POST", headers: { Authorization: "Bearer " + (localStorage.getItem("guToken") || "") }, body: fd });
      const raw = await res.text();
      let d = {};
      try { d = raw ? JSON.parse(raw) : {}; } catch { /* not JSON — surface the status */ }
      if (!res.ok) throw new Error(d.error || `Upload failed (${res.status}${raw && !d.error ? " · " + raw.slice(0, 80) : ""})`);
      if (!d.url) throw new Error("The upload came back without a picture — please try again.");
      setAvatar(d.url);
      const me = getMember(); if (me) saveMember({ ...me, avatar_url: d.url });
      flash(true, "Profile picture updated.");
    } catch (e) { flash(false, e.message); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "update_profile", headline, bio, company, title, location }) });
      const me = getMember(); if (me) saveMember({ ...me, headline, bio, company, title, location });
      flash(true, "Profile saved — members see it when they hover your messages.");
    } catch (e) { flash(false, e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ background: "var(--gu-card2)", border: "1px solid #1e0000", borderRadius: 16, padding: "24px 28px", marginBottom: 28 }}>
      <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>Your Community Profile</div>
      <div style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, marginBottom: 16 }}>Your photo shows next to your messages, and members who hover see who you are and what you do.</div>
      {msg && <div style={{ background: msg.ok ? "#22c55e12" : "#b8010115", border: `1px solid ${msg.ok ? "#22c55e50" : "#b8010150"}`, color: msg.ok ? "#22c55e" : "#ff6b6b", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontFamily: font, marginBottom: 12 }}>{msg.text}</div>}
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <Avatar url={avatar} name={member.name} size={72} />
          <label style={{ display: "block", marginTop: 8, color: "#b80101", fontSize: 12, fontWeight: 700, fontFamily: font, cursor: "pointer" }}>
            {busy ? "Working…" : avatar ? "Change photo" : "Upload photo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={e => upload(e.target.files?.[0])} />
          </label>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <input style={inp} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Title — e.g. Principal, Developer" />
            <input style={inp} value={company} onChange={e => setCompany(e.target.value)} maxLength={120} placeholder="Company (optional)" />
          </div>
          <input style={{ ...inp, marginBottom: 10 }} value={location} onChange={e => setLocation(e.target.value)} maxLength={120} placeholder="Where you work — e.g. DC · Baltimore" />
          <input style={{ ...inp, marginBottom: 10 }} value={headline} onChange={e => setHeadline(e.target.value)} maxLength={120} placeholder="What you do — e.g. Affordable multifamily · 12 units" />
          <textarea style={{ ...inp, resize: "vertical", marginBottom: 10 }} rows={3} value={bio} onChange={e => setBio(e.target.value)} maxLength={500} placeholder="A few sentences about you, your projects, and what you're building toward." />
          <button style={{ ...btnRed, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>Save Profile</button>
        </div>
      </div>
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
          <div style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font, marginTop: 4 }}>{member.tier === "Elite" ? "Advisory calls with Dr. Merritt, included in Owner." : "Your free work session, included in Premium."}</div>
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
  // One page, read top to bottom, with the sidebar as jump links rather than
  // tabs — so nothing is hidden behind a click and you can still get straight
  // to the part you came for.
  const SECTIONS = [
    ["start", "Jump back in"],
    ["meetings", "Your meetings"],
    ["benefits", "Your benefits"],
    ["advisory", "Advisory"],
    ["account", "Profile & billing"],
  ];
  const [active, setActive] = useState("start");
  const jump = (id) => {
    setActive(id);
    document.getElementById("gu-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Highlight whichever section is actually on screen as you scroll.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (seen) setActive(seen.target.id.replace("gu-", ""));
      },
      { rootMargin: "-100px 0px -60% 0px" }
    );
    SECTIONS.forEach(([id]) => { const el = document.getElementById("gu-" + id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const hasAdvisory = (member.entitlements || []).some(e => e.course_id === "intake");
  const H = { fontFamily: serif, fontWeight: 700, fontSize: "clamp(24px,3vw,32px)", color: "var(--gu-text)", marginBottom: 6 };
  const SUB = { color: "var(--gu-body)", fontSize: 14, fontFamily: font, lineHeight: 1.7, marginBottom: 20 };
  const tile = (onClick, locked) => ({
    background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 16,
    padding: "22px 22px", cursor: locked ? "default" : "pointer", opacity: locked ? 0.55 : 1,
  });

  return (
    <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "110px clamp(16px,4vw,48px) 80px" }}>
      <style>{`@media (max-width: 900px) { .gu-member-grid { grid-template-columns: minmax(0,1fr) !important; } .gu-member-side { position: static !important; } }`}</style>
      <div className="gu-member-grid" style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "218px minmax(0,1fr)", gap: 30, alignItems: "start" }}>

        <aside className="gu-member-side" style={{ position: "sticky", top: 96, background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "18px 10px 14px" }}>
          <div style={{ padding: "0 10px 14px", borderBottom: "1px solid var(--gu-border2)", marginBottom: 12 }}>
            <div style={{ color: "var(--gu-text)", fontWeight: 800, fontSize: 15, fontFamily: font, marginBottom: 8 }}>{firstName(member.name)}</div>
            <TierBadge tier={member.tier} />
          </div>
          {SECTIONS.map(([id, label]) => (
            <button key={id} onClick={() => jump(id)} style={{
              display: "block", width: "100%", textAlign: "left",
              background: active === id ? "#3a1618" : "transparent",
              color: active === id ? "#fbf1f1" : "var(--gu-body)",
              border: "none", borderLeft: `3px solid ${active === id ? "#e01818" : "transparent"}`,
              borderRadius: "0 8px 8px 0", padding: "10px 13px", marginBottom: 2,
              fontFamily: font, fontWeight: active === id ? 800 : 600, fontSize: 13.5, cursor: "pointer",
            }}>{label}</button>
          ))}
          <div style={{ borderTop: "1px solid var(--gu-border2)", marginTop: 12, paddingTop: 10 }}>
            <button onClick={() => setActivePage("pricing")} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", color: "var(--gu-body)", border: "none", padding: "9px 13px", fontFamily: font, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Plans &amp; pricing</button>
            <button onClick={onSignOut} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", color: "var(--gu-muted)", border: "none", padding: "9px 13px", fontFamily: font, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Sign out</button>
          </div>
        </aside>

        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 34 }}>
            <div style={{ fontSize: 10, color: "#e01818", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 10 }}>Your Membership</div>
            <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(30px,4.5vw,44px)", color: "var(--gu-text)", lineHeight: 1.1, marginBottom: 10 }}>Welcome, {firstName(member.name)}.</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <BadgeChips badges={member.badges} small />
              <span style={{ color: "var(--gu-muted2)", fontSize: 13, fontFamily: font }}>{member.email}</span>
            </div>
          </div>

          {/* 1 — four ways back in */}
          <section id="gu-start" style={{ scrollMarginTop: 96, marginBottom: 40 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
              <div onClick={() => setActivePage("courses")} style={tile(null, false)}>
                <div style={{ marginBottom: 10 }}><BookOpen size={22} color="#e01818" /></div>
                <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 15, fontFamily: font, marginBottom: 5 }}>Your Courses</div>
                <p style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, lineHeight: 1.6 }}>{rank >= 1 ? "Every course, every lesson." : "Browse the curriculum."}</p>
              </div>
              <div onClick={() => rank >= 1 && setActivePage("community")} style={tile(null, rank < 1)}>
                <div style={{ marginBottom: 10 }}><MessagesSquare size={22} color="#e01818" /></div>
                <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 15, fontFamily: font, marginBottom: 5 }}>Community {rank < 1 && <Lock size={12} style={{ display: "inline", verticalAlign: "middle" }} />}</div>
                <p style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, lineHeight: 1.6 }}>{rank >= 2 ? "Post, reply and network." : rank >= 1 ? "Read every channel." : "Members only."}</p>
              </div>
              <div onClick={() => setActivePage("lunchlearn")} style={tile(null, rank < 1)}>
                <div style={{ marginBottom: 10 }}><Video size={22} color="#e01818" /></div>
                <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 15, fontFamily: font, marginBottom: 5 }}>Lunch &amp; Learns</div>
                <p style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, lineHeight: 1.6 }}>{rank >= 2 ? "Live sessions and the recording library." : "Live sessions are free on your plan."}</p>
              </div>
              <div onClick={() => setActivePage("officehours")} style={tile(null, rank < 3)}>
                <div style={{ marginBottom: 10 }}><Calendar size={22} color="#e01818" /></div>
                <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 15, fontFamily: font, marginBottom: 5 }}>Office Hours {rank < 3 && <Lock size={12} style={{ display: "inline", verticalAlign: "middle" }} />}</div>
                <p style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, lineHeight: 1.6 }}>{rank >= 3 ? "Group sessions with Dr. Merritt." : "Opens at Premium."}</p>
              </div>
            </div>
          </section>

          {/* 2 — everything about meetings, in one place */}
          <section id="gu-meetings" style={{ scrollMarginTop: 96, marginBottom: 40 }}>
            <h2 style={H}>Your meetings</h2>
            <p style={SUB}>Your one-on-one time with Dr. Merritt — what you have, when it is, and what she should read first.</p>
            <SessionCreditsCard member={member} />
            <MeetingsPanel member={member} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, background: "var(--gu-card2)", border: "1px solid var(--gu-border)", borderRadius: 14, padding: "18px 24px" }}>
              <div style={{ color: "var(--gu-body)", fontSize: 13.5, fontFamily: font, fontWeight: 600 }}>Need her on something specific? Book a single session any time.</div>
              <button style={btnRed} onClick={() => setActivePage("contact")}>Book a session →</button>
            </div>
          </section>

          {/* 3 — what the plan opens up */}
          <section id="gu-benefits" style={{ scrollMarginTop: 96, marginBottom: 40 }}>
            <h2 style={H}>Your benefits</h2>
            <p style={SUB}>Everything your {TIER_LABELS[member.tier] || member.tier} plan opens up — use all of it.</p>
            <BenefitGateNotice member={member} />
            <div style={{ display: "grid", gridTemplateColumns: NEXT_TIER[member.tier] ? "repeat(auto-fit, minmax(290px, 1fr))" : "1fr", gap: 16 }}>
              <div style={{ background: "var(--gu-card2)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "26px 30px" }}>
                <div style={{ fontSize: 9, color: "#e01818", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 14 }}>Included in {TIER_LABELS[member.tier] || member.tier}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {(BENEFITS[member.tier] || []).map((b, i) => (
                    <li key={i} style={{ display: "flex", gap: 12, marginBottom: 10, color: "var(--gu-body)", fontSize: 14, lineHeight: 1.7, fontFamily: font, fontWeight: 600 }}>
                      <span style={{ color: "#22c55e", flexShrink: 0 }}>✓</span><span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {NEXT_TIER[member.tier] && (
                <div style={{ background: "var(--gu-red-tint)", border: "1px solid #b8010145", borderRadius: 16, padding: "26px 30px", display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 9, color: "#f0d0d0", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 14 }}>One step up: {TIER_LABELS[NEXT_TIER[member.tier].tier] || NEXT_TIER[member.tier].tier} · {NEXT_TIER[member.tier].price}</div>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px" }}>
                    {NEXT_TIER[member.tier].adds.map((b, i) => (
                      <li key={i} style={{ display: "flex", gap: 12, marginBottom: 10, color: "var(--gu-body)", fontSize: 14, lineHeight: 1.7, fontFamily: font, fontWeight: 600 }}>
                        <span style={{ color: "#e01818", flexShrink: 0 }}>+</span><span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <button style={{ ...btnRed, marginTop: "auto", alignSelf: "flex-start" }} onClick={() => setActivePage("pricing")}>Upgrade to {TIER_LABELS[NEXT_TIER[member.tier].tier] || NEXT_TIER[member.tier].tier} →</button>
                </div>
              )}
            </div>
          </section>

          {/* 4 — what advisory is, and how to start */}
          <section id="gu-advisory" style={{ scrollMarginTop: 96, marginBottom: 40 }}>
            <h2 style={H}>Advisory</h2>
            <p style={SUB}>{hasAdvisory
              ? "Your project is with Dr. Merritt. Your workspace has the documents, the messages and the hours logged."
              : "A membership teaches you the work. Advisory is Dr. Merritt doing it with you, on your actual deal."}</p>
            <div style={{ background: "var(--gu-card2)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "26px 30px" }}>
              {hasAdvisory ? (
                <button style={btnRed} onClick={() => setActivePage("advisory")}>Open your advisory workspace →</button>
              ) : (<>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px" }}>
                  {["She takes in your whole project — pro forma, capital stack, site, timeline — and finds what you missed",
                    "You get it back as a written read, not a conversation you have to remember",
                    "If you continue on retainer, she's on your project month over month, and the $1,500 intake credits against your first month",
                    "A private workspace: your documents, your messages, and every hour logged"].map((t, i) => (
                    <li key={i} style={{ display: "flex", gap: 12, marginBottom: 10, color: "var(--gu-body)", fontSize: 14, lineHeight: 1.7, fontFamily: font, fontWeight: 600 }}>
                      <span style={{ color: "#e01818", flexShrink: 0 }}>·</span><span>{t}</span>
                    </li>
                  ))}
                </ul>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <button style={btnRed} onClick={() => window.startCheckout && window.startCheckout("retainer_onboarding")}>Start your intake — $1,500 →</button>
                  <button style={btnGhost} onClick={() => setActivePage("contact")}>See how it works</button>
                </div>
              </>)}
            </div>
          </section>

          {/* 5 — the account itself */}
          <section id="gu-account" style={{ scrollMarginTop: 96 }}>
            <h2 style={H}>Profile &amp; billing</h2>
            <p style={SUB}>How you appear in the community, your referral link, and your plan.</p>
            <ProfileCard member={member} />
            <ReferralCard member={member} />
            <ChangePasswordCard />
            <ManageMembershipCard member={member} rank={rank} />
            {rank < 1 && member.lnl_discount_until && new Date(member.lnl_discount_until) > new Date() && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, background: "var(--gu-card2)", border: "1px solid #e0c4c440", borderRadius: 14, padding: "20px 26px", marginTop: 16 }}>
                <div>
                  <div style={{ color: "#e01818", fontWeight: 800, fontSize: 15, fontFamily: font, marginBottom: 4 }}>Your Lunch &amp; Learn perk: 25% off your first month</div>
                  <div style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font }}>Become a member by {new Date(member.lnl_discount_until).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.</div>
                </div>
                <button style={btnRed} onClick={() => setActivePage("pricing")}>See Memberships →</button>
              </div>
            )}
          </section>
        </div>
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

// A member's face in the community: their photo, or their initials.
export function Avatar({ url, name, size = 34 }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid var(--gu-border)" }} />;
  const initials = String(name || "?").split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return <div style={{ width: size, height: size, borderRadius: "50%", background: "#b8010125", border: "1px solid #b8010145", color: "#e0c4c4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 800, fontFamily: font, flexShrink: 0 }}>{initials}</div>;
}

// Hover card: who this person is and what they do
function ProfileHover({ m }) {
  return (
    <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 30, marginTop: 6, width: 280, background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 14, padding: "18px 20px", boxShadow: "0 12px 40px rgba(0,0,0,0.55)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <Avatar url={m.author_avatar} name={m.author_name} size={46} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 15, fontFamily: font }}>{m.author_name || "Member"}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
            {m.author_tier && <TierBadge tier={m.author_tier} small />}
            <BadgeChips badges={m.author_badges} small />
          </div>
        </div>
      </div>
      {(m.author_title || m.author_company) && <div style={{ color: "var(--gu-text2)", fontSize: 13, fontFamily: font, fontWeight: 800, marginBottom: 3 }}>{[m.author_title, m.author_company].filter(Boolean).join(" · ")}</div>}
      {m.author_location && <div style={{ color: "var(--gu-muted)", fontSize: 12, fontFamily: font, marginBottom: 6 }}>📍 {m.author_location}</div>}
      {m.author_headline && <div style={{ color: "var(--gu-body)", fontSize: 13, fontFamily: font, fontWeight: 700, marginBottom: 6 }}>{m.author_headline}</div>}
      {m.author_bio && <div style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, lineHeight: 1.65 }}>{m.author_bio}</div>}
      {!m.author_headline && !m.author_bio && !m.author_title && !m.author_company && <div style={{ color: "var(--gu-faint)", fontSize: 12, fontFamily: font, fontStyle: "italic" }}>They haven't written their profile yet.</div>}
    </div>
  );
}

const REACTIONS = [
  ["up", ThumbsUp, "Agree"],
  ["heart", Heart, "Love this"],
  ["idea", Lightbulb, "Useful"],
  ["fire", Flame, "Strong"],
  ["celebrate", PartyPopper, "Congrats"],
  ["eyes", Eye, "Watching"],
];

// Reactions let a busy channel respond without adding a message to read.
function Reactions({ m, hover }) {
  const [rx, setRx] = useState(m.reactions || []);
  const [open, setOpen] = useState(false);
  const react = async (kind) => {
    const before = rx;
    // Move first, reconcile after — a reaction that lags feels broken.
    setRx(prev => {
      const hit = prev.find(r => r.kind === kind);
      if (!hit) return [...prev, { kind, n: 1, mine: true }];
      const n = hit.mine ? hit.n - 1 : hit.n + 1;
      return n <= 0 ? prev.filter(r => r.kind !== kind) : prev.map(r => r.kind === kind ? { ...r, n, mine: !hit.mine } : r);
    });
    setOpen(false);
    try {
      const d = await api("/api/community", { method: "POST", body: JSON.stringify({ action: "react", message_id: m.id, kind }) });
      if (d.reactions) setRx(d.reactions);
    } catch { setRx(before); }
  };
  const chip = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    background: active ? "#b8010128" : "transparent",
    border: `1px solid ${active ? "#b8010170" : "var(--gu-border2)"}`,
    color: active ? "#f0b8b8" : "var(--gu-muted)",
    borderRadius: 99, padding: "2px 8px", cursor: "pointer",
    fontSize: 11.5, fontFamily: font, fontWeight: 700, lineHeight: 1.6,
  });
  const has = rx.filter(r => r.n > 0);
  if (!has.length && !hover && !open) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, flexWrap: "wrap", position: "relative" }}>
      {has.map(r => {
        const def = REACTIONS.find(x => x[0] === r.kind);
        const Icon = def ? def[1] : SmilePlus;
        return (
          <button key={r.kind} onClick={() => react(r.kind)} title={def ? def[2] : ""} style={chip(r.mine)}>
            <Icon size={12} /> {r.n}
          </button>
        );
      })}
      {(hover || open) && (
        <button onClick={() => setOpen(o => !o)} title="Add a reaction" style={{ ...chip(false), padding: "3px 7px" }}>
          <SmilePlus size={13} />
        </button>
      )}
      {open && (
        <div style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, display: "flex", gap: 2, background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 10, padding: 4, zIndex: 40, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
          {REACTIONS.map(([kind, Icon, label]) => (
            <button key={kind} onClick={() => react(kind)} title={label} style={{ background: "transparent", border: "none", color: "var(--gu-body)", cursor: "pointer", padding: 6, borderRadius: 7, display: "flex" }}>
              <Icon size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Message({ m, onOpenThread, onDelete, canDelete, inThread, onVote, onEdit, meId, isAdmin }) {
  const [showProfile, setShowProfile] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  // Your own messages are editable for 1 hour after sending; the team, anytime.
  const mine = meId && m.user_id === meId;
  const withinHour = Date.now() - new Date(m.created_at).getTime() < 3600 * 1000;
  const canEdit = onEdit && (isAdmin || (mine && withinHour));
  // Dr. Merritt's messages carry a presence of their own — richer than TEAM,
  // unmistakable at a glance: glowing card, serif name, crowned badge.
  const isGina = m.is_admin && m.author_badge === "drmerritt";
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        // A message is a line of talk, not a filing card. Everyone else's sits
        // flat on the page with no box at all; only your own and Dr. Merritt's
        // carry a surface, because those two are worth picking out at a glance.
        padding: isGina ? "14px 18px" : mine ? "9px 14px" : "5px 8px",
        borderRadius: 12,
        background: isGina ? "linear-gradient(135deg, #1a0808 0%, #12060a 100%)" : mine ? "#2c1214" : hover ? "#1a0e0f" : "transparent",
        border: isGina ? "1px solid #b8010170" : "1px solid transparent",
        boxShadow: isGina ? "0 0 20px rgba(184,1,1,0.10)" : "none",
        marginBottom: 2, maxWidth: 680, width: "fit-content", minWidth: 0,
        marginLeft: mine ? "auto" : 0,
        transition: "background-color 0.12s" }}>
      {isGina && <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #b80101, transparent)", margin: "-16px -20px 12px", borderRadius: "10px 10px 0 0" }} />}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ position: "relative", flexShrink: 0, cursor: "default", marginTop: 2 }}
        onMouseEnter={() => !m.is_admin && setShowProfile(true)} onMouseLeave={() => setShowProfile(false)}>
        {m.is_admin && !isGina && !m.author_avatar
          ? <span style={{ width: 36, height: 36, borderRadius: "50%", background: "#160404", border: "1px solid #b8010150", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}><img src="/icon-192.png" alt="GroundUp" width="26" height="26" style={{ borderRadius: 6 }} /></span>
          : <Avatar url={m.author_avatar} name={m.is_admin ? (isGina ? "Gina Merritt" : "GroundUp Team") : m.author_name} size={30} />}
        {showProfile && !m.is_admin && <ProfileHover m={m} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ position: "relative", cursor: "default" }}
          onMouseEnter={() => !m.is_admin && setShowProfile(true)} onMouseLeave={() => setShowProfile(false)}>
          <span style={isGina
            ? { color: "#f5e8e8", fontWeight: 700, fontSize: 16, fontFamily: serif, letterSpacing: "0.3px" }
            : { color: m.is_admin ? "#b80101" : "var(--gu-text2)", fontWeight: 800, fontSize: 13, fontFamily: font }}>{m.author_name || "Member"}</span>
        </span>
        {m.is_admin ? (
          isGina
            ? <span style={{ background: "linear-gradient(135deg, #b80101, #570404)", color: "#fff", borderRadius: 5, padding: "2px 9px", fontSize: 9, fontWeight: 800, fontFamily: font, letterSpacing: "1.5px", boxShadow: "0 0 10px rgba(184,1,1,0.35)" }}>✦ DR. MERRITT</span>
            : <span style={{ background: "#b80101", color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800, fontFamily: font, letterSpacing: "1px" }}>TEAM</span>
        ) : m.author_tier && <TierBadge tier={m.author_tier} small />}
        {!m.is_admin && <BadgeChips badges={m.author_badges} small />}
        <span style={{ color: "var(--gu-faint)", fontSize: 11, fontFamily: font }}>{timeAgo(m.created_at)}</span>
        {m.edited_at && <span style={{ color: "var(--gu-faint)", fontSize: 10, fontFamily: font, fontStyle: "italic" }}>(edited)</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, opacity: hover || editing ? 1 : 0, transition: "opacity 0.15s" }}>
          {canEdit && !editing && <button onClick={() => { setEditing(true); setEditDraft(m.body); }} style={{ background: "none", border: "none", color: "var(--gu-faint)", cursor: "pointer", fontSize: 11, fontFamily: font }}>edit</button>}
          {canDelete && <button onClick={() => { if (window.confirm("Delete this message? This can't be undone.")) onDelete(m); }} style={{ background: "none", border: "none", color: "var(--gu-faint)", cursor: "pointer", fontSize: 11, fontFamily: font }}>delete</button>}
        </span>
      </div>
      {editing ? (
        <div>
          <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={3} maxLength={4000}
            style={{ width: "100%", boxSizing: "border-box", background: "var(--gu-panel)", border: "1px solid #b8010150", borderRadius: 8, padding: "10px 12px", color: "var(--gu-text)", fontFamily: font, fontSize: 14, lineHeight: 1.6, outline: "none", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button onClick={async () => { if (editDraft.trim() && onEdit) { await onEdit(m, editDraft.trim()); } setEditing(false); }} style={{ background: "#b80101", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontFamily: font, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Save</button>
            <button onClick={() => setEditing(false)} style={{ background: "none", border: "1px solid var(--gu-border)", color: "var(--gu-muted)", borderRadius: 6, padding: "6px 14px", fontFamily: font, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ color: "var(--gu-body)", fontSize: 14, fontFamily: font, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{linkify(m.body)}</div>
      )}
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
      <Reactions m={m} hover={hover} />
      {/* A reply count is worth showing always; an invitation to reply only
          when the pointer is on the message. It used to sit under every post
          as a bordered pill, which is why one word of text filled a card. */}
      {!inThread && (Number(m.reply_count) > 0 || hover) && (
        <button onClick={() => onOpenThread(m)} style={{ background: "transparent", border: "none", padding: 0, marginTop: 4, color: Number(m.reply_count) > 0 ? "#e08a8a" : "var(--gu-muted)", cursor: "pointer", fontSize: 12, fontFamily: font, fontWeight: 700 }}>
          {Number(m.reply_count) > 0 ? `${m.reply_count} repl${Number(m.reply_count) === 1 ? "y" : "ies"} →` : "Reply"}
        </button>
      )}
      </div>
      </div>
    </div>
  );
}

export function CommunityPage({ member, isAdmin, onSignIn }) {
  // Where you were survives a refresh: #ch=<slug>[&t=<messageId>] or #dm[=<userId>]
  const hashState = () => {
    const h = window.location.hash.slice(1);
    const m = {}; for (const part of h.split("&")) { const [k, v] = part.split("="); if (k) m[k] = v === undefined ? "" : decodeURIComponent(v); }
    return m;
  };
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
  useEffect(() => {
    const h = hashState();
    if ("dm" in h) { setDmOpen(true); if (h.dm) setDmTarget({ id: Number(h.dm) }); }
  }, []);
  const [newChanOpen, setNewChanOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollForm, setPollForm] = useState({ question: "", options: ["", ""] });
  const [newChan, setNewChan] = useState({ name: "", min_tier: "Basic", admin_only_post: false });
  const feedRef = useRef(null);
  const rank = member && !member.suspended ? (TIER_RANK[member.tier] ?? 0) : 0;
  const hasAccess = isAdmin || rank >= 1;
  const canEngage = isAdmin || rank >= 2;               // Basic (Member) is read-only
  const canDm = isAdmin || rank >= 3;                   // DMs are an Owner benefit

  const loadChannels = useCallback(async () => {
    const data = await api("/api/community?resource=channels");
    setChannels(data.channels);
    const want = hashState().ch;
    setActive(a => a || data.channels.find(c => c.slug === want) || data.channels[0] || null);
  }, []);
  // Write the current spot to the hash whenever it changes
  useEffect(() => {
    if (!active && !dmOpen) return;
    const parts = [];
    if (dmOpen) parts.push(dmTarget?.id ? `dm=${dmTarget.id}` : "dm");
    else if (active) { parts.push(`ch=${encodeURIComponent(active.slug)}`); if (thread) parts.push(`t=${thread.id}`); }
    const next = "#" + parts.join("&");
    if (window.location.hash !== next) window.history.replaceState({}, "", window.location.pathname + window.location.search + next);
  }, [active, thread, dmOpen, dmTarget]);

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

  // Moving to another channel, thread or view starts clean — an error from
  // wherever you just were is not about where you are now.
  useEffect(() => { setError(""); }, [active, thread, dmOpen]);

  useEffect(() => {
    if (!dmOpen) return;
    api("/api/community", { method: "POST", body: JSON.stringify({ action: "mark_seen", what: "dm" }) }).catch(() => {});
    const target = isAdmin ? dmTarget?.id : null;
    if (isAdmin && !target) return;
    // A member without direct messages gets a 403 here. That is not an error
    // worth showing — and it was being written into the shared error state,
    // which renders on every channel and every thread, so "Direct messages are
    // an Owner benefit" followed people around a page they never asked for.
    loadDm(target).catch(e => { if (!/benefit|403/i.test(e.message || "")) setError(e.message); });
    return pollVisible(() => loadDm(target).catch(() => {}), 30000);
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

  const pendingThread = useRef(hashState().t ? Number(hashState().t) : null);
  useEffect(() => {
    if (!active) return;
    setThread(null);
    loadMessages(active.id).then(() => {
      // First load after a refresh: reopen the thread that was open
      const tid = pendingThread.current; pendingThread.current = null;
      if (tid) api(`/api/community?resource=messages&channel=${active.id}`).then(d => { const parent = (d.messages || []).find(m => m.id === tid); if (parent) setThread(parent); }).catch(() => {});
    }).catch(e => setError(e.message));
    return pollVisible(() => loadMessages(active.id).catch(() => {}), 30000);
  }, [active, loadMessages]);

  useEffect(() => {
    if (!thread || !active) return;
    loadMessages(active.id, thread.id).catch(() => {});
    return pollVisible(() => loadMessages(active.id, thread.id).catch(() => {}), 30000);
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

  const editMsg = async (m, body) => {
    try {
      await api("/api/community", { method: "POST", body: JSON.stringify({ action: "edit_message", message_id: m.id, body }) });
      await loadMessages(active.id, thread ? thread.id : undefined);
      if (!thread) await loadMessages(active.id);
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
        {/* Two kinds of talk, kept apart on purpose: topic questions live in the
            phase channels ("I have a design question"), course questions live in
            Course Discussions ("in lesson 3 you said X — how?"). */}
        {(() => {
          const chanBtn = (c, indent) => (
            <button key={c.id} onClick={() => { setActive(c); setDmOpen(false); setSidebarOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", background: !dmOpen && active?.id === c.id ? "#b80101" : "transparent", border: "none", borderRadius: 6, padding: indent ? "8px 12px 8px 20px" : "9px 12px", cursor: "pointer", marginBottom: 2 }}>
              <span style={{ color: "#ffffff", fontWeight: !dmOpen && active?.id === c.id ? 800 : 600, fontSize: indent ? 12.5 : 13.5, fontFamily: font }}>
                {c.admin_only_post ? <Megaphone size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} /> : "#"} {c.name}
              </span>
              {c.min_tier !== "Basic" && <span style={{ marginLeft: 6, fontSize: 9, color: TIER_COLORS[c.min_tier], fontFamily: font, fontWeight: 800 }}>{(TIER_LABELS[c.min_tier] || c.min_tier).toUpperCase()}</span>}
            </button>
          );
          const head = (label) => <div style={{ fontSize: 10, color: "#e8b4b4", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, padding: "0 12px", margin: "18px 0 10px" }}>{label}</div>;
          const general = channels.filter(c => !c.section);
          const phases = channels.filter(c => c.section === "phase");
          const courses = channels.filter(c => c.section === "course");
          return (
            <>
              <div style={{ fontSize: 10, color: "#e8b4b4", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, padding: "0 12px", marginBottom: 10 }}>Channels</div>
              {general.map(c => chanBtn(c))}
              {phases.length > 0 && head("By Development Phase")}
              {phases.map(c => chanBtn(c, true))}
              {courses.length > 0 && head("Course Discussions")}
              {courses.map(c => chanBtn(c, true))}
            </>
          );
        })()}
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
                  <option value="Elite">Owner only</option>
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
                  {(() => {
                    // The reader's own messages sit right in brand red; the other side sits left in a dark card
                    const mine = m.from_admin === !!isAdmin;
                    return (
                      <div style={{ maxWidth: "78%", background: mine ? "#b80101" : "#1a0a0a", border: mine ? "none" : "1px solid #3a1515", borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "11px 15px" }}>
                        {!mine && <div style={{ color: m.from_admin ? "#e0a0a0" : "#c8a8a8", fontSize: 10.5, fontWeight: 800, fontFamily: font, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>{m.from_admin ? "GroundUp Team" : (dmTarget?.name || "Member")}</div>}
                        <div style={{ color: mine ? "#ffffff" : "#f0e0e0", fontSize: 14, fontFamily: font, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                        <div style={{ color: mine ? "rgba(255,255,255,0.7)" : "#8f7070", fontSize: 10, fontFamily: font, marginTop: 5, textAlign: "right" }}>{timeAgo(m.created_at)}</div>
                      </div>
                    );
                  })()}
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
              {messages.map(m => <Message key={m.id} m={m} onOpenThread={setThread} onDelete={deleteMsg} canDelete={isAdmin || (member && m.user_id === member.id)} onVote={votePoll} onEdit={editMsg} meId={member?.id} isAdmin={isAdmin} />)}
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
            {threadMsgs.map(m => <Message key={m.id} m={m} inThread onDelete={deleteMsg} canDelete={isAdmin || (member && m.user_id === member.id)} onEdit={editMsg} meId={member?.id} isAdmin={isAdmin} />)}
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
const WL_BUDGETS = ["$50", "$50–$150", "$150–$500", "$500+", "I already know what tier I want", "I need general support & guidance", "I need specific, customized deal help", "$3,000+"];

// Two lists, one form. "insider" is the secret /waitlist page (first access);
// "general" is what the public homepage collects before the general launch.
export function WaitlistForm({ list = "insider" }) {
  const insider = list === "insider";
  // Spam guard: a honeypot field bots fill and humans never see, plus the time
  // the form mounted (a sub-1.5s submit is not a person).
  const [hp, setHp] = useState("");
  const mountedAt = useRef(Date.now());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [learn, setLearn] = useState("");
  const [learnOther, setLearnOther] = useState("");
  const [pain, setPain] = useState("");
  const [painOther, setPainOther] = useState("");
  const [budget, setBudget] = useState("");
  // A ?source= in the URL (e.g. links from drginamerritt.net arriving as
  // ?source=popup:/) tags the signup's origin. Stashed so it survives the
  // pop-up opening after navigation; the dropdown hides when a link set it.
  const [urlSource] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("source");
      if (q) { localStorage.setItem("guWlSource", q); return q; }
      return localStorage.getItem("guWlSource") || "";
    } catch { return ""; }
  });
  const [source, setSource] = useState(urlSource);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    let learnVal, painVal, budgetVal;
    if (insider) {
      learnVal = learn === "Other" ? learnOther.trim() : learn;
      painVal = pain === "Other" ? painOther.trim() : pain;
      if (!learnVal) { setMsg("Tell us what you hope to learn."); return; }
      if (!painVal) { setMsg("Tell us your main pain point."); return; }
      if (!budget) { setMsg("Pick the monthly budget that fits you."); return; }
      if (budget === "I already know what tier I want" && !wantTier) { setMsg("Pick the tier you want."); return; }
      budgetVal = budget === "I already know what tier I want" ? `I want ${wantTier}` : budget;
    } else {
      // General list: the single goal question answers everything
      if (!goal) { setMsg("Pick your goal."); return; }
      if (goal === "I already know what tier I want" && !wantTier) { setMsg("Pick the tier you want."); return; }
      const g = GEN_GOALS.find(x => x.value === goal);
      const goalText = (g?.label || goal).replace(/^\S+\s/, "");
      learnVal = goalText; painVal = goalText;
      budgetVal = goal === "I already know what tier I want" ? `I want ${wantTier}` : goal;
    }
    setBusy(true); setMsg(null);
    try {
      await api("/api/waitlist", { method: "POST", body: JSON.stringify({ action: "join", name, email, phone, learn: learnVal, pain: painVal, budget: budgetVal, source: source || undefined, list, website: hp, elapsed: Date.now() - mountedAt.current }) });
      setDone(true);
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  };

  const sel = { ...inp, appearance: "auto", cursor: "pointer" };
  // General waitlist: one question — what's your goal — instead of the full
  // insider questionnaire. Each goal maps straight to a plan recommendation.
  const GEN_GOALS = [
    { label: "🎯 I already know what tier I want", value: "I already know what tier I want", bubble: null },
    { label: "📚 I want to learn more about the real estate development industry", value: "I want to learn the industry", bubble: <span>Perfect start — the <strong style={{ color: "#f0d8d8" }}>Member plan</strong> ($49.99/mo): every course, free live Lunch &amp; Learns, and a seat in the community. That's what we'll recommend.</span> },
    { label: "🛠 I'm interested in becoming an expert", value: "I want to become an expert", bubble: <span>That's the <strong style={{ color: "#f0d8d8" }}>Builder plan</strong> ($149.99/mo) — post and network in the community, the full recording library, and every template at your fingertips. That's what we'll recommend.</span> },
    { label: "🧭 I need general support & guidance for my deals", value: "I need general support & guidance", bubble: <span>Think of <strong style={{ color: "#f0d8d8" }}>Premium</strong> ($249.99/mo) as your safety net — the tools, templates, Opportunity Board, and group office hours with Dr. Merritt. That's what we'll recommend.</span> },
    { label: "🔴 I need specific, customized deal help", value: "I need specific, customized deal help", bubble: <span>Deal-specific support — your numbers, your gap, your structure — comes with the <strong style={{ color: "#f0d8d8" }}>Owner plan</strong> ($499.99/mo) or the Senior Advisor retainer. We'll recommend Owner.</span> },
    { label: "✦ Thought partnership", value: "$3,000+", bubble: <span><strong style={{ color: "#f0d8d8" }}>This isn't a subscription — it's a retainer.</strong> Dr. Gina Merritt directly on YOUR project — starting at <strong style={{ color: "#f0d8d8" }}>$3,025/mo</strong>, her expertise, deliverable support, and standing behind your deals.</span> },
  ];
  const [goal, setGoal] = useState("");
  // Thought partnership needs a beat of explanation — show it on hover, not just on select
  const [partnerHover, setPartnerHover] = useState(false);
  const [wantTier, setWantTier] = useState("");
  // ?source=ref:<code> — a partner referral link. Look the partner up and show
  // the you've-been-referred banner with the 10% offer.
  const [partners, setPartners] = useState([]);
  useEffect(() => {
    fetch("/api/waitlist?public=1").then(r => r.json()).then(d => setPartners(d?.partners || [])).catch(() => {});
  }, []);
  const [refBy, setRefBy] = useState(null);
  const [refDismissed, setRefDismissed] = useState(false);
  useEffect(() => {
    if (!/^ref:/.test(urlSource || "")) return;
    fetch("/api/referrals?partner=" + encodeURIComponent(urlSource.slice(4)))
      .then(r => r.json()).then(d => { if (d?.name) setRefBy(d); }).catch(() => {});
  }, []);

  return (
    <div style={{ background: "linear-gradient(180deg, #1f1114 0%, #150a0c 100%)", border: "1px solid #e0c4c435", boxShadow: "0 0 90px rgba(224,196,196,0.07)", borderRadius: 22, padding: "42px clamp(28px,5vw,52px) 38px", width: "100%", maxWidth: 720, margin: "0 auto" }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 30, color: "#f5e8e8", marginBottom: 12 }}>{insider ? "You're an insider." : "You're on the list."}</h2>
            <p style={{ color: "#8a7070", fontSize: 14, fontFamily: font, lineHeight: 1.8 }}>Check your inbox — your spot is saved. We read every answer, and when we launch you'll get our personal recommendation for the plan that fits you best.</p>
          </div>
        ) : (
          <>
            {refBy && !refDismissed && (
              <div style={{ background: "#1c0404", border: "1.5px solid #b80101", borderRadius: 12, padding: "14px 18px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-start", boxShadow: "0 8px 28px rgba(184,1,1,0.25)" }}>
                <span style={{ fontSize: 20 }}>🎁</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#f0d8d8", fontSize: 13.5, fontWeight: 800, fontFamily: font, marginBottom: 3 }}>You've been referred by {refBy.name}{refBy.company ? ` of ${refBy.company}` : ""}!</div>
                  <div style={{ color: "#c8a8a8", fontSize: 12.5, fontFamily: font, lineHeight: 1.6 }}>Join the waitlist now and you'll get <strong style={{ color: "#f0d8d8" }}>a member discount for your first two years</strong> — $5 to $25 off every month depending on your plan, applied automatically at checkout.</div>
                </div>
                <button onClick={() => setRefDismissed(true)} style={{ background: "none", border: "none", color: "#8f7070", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
              </div>
            )}
            <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 10 }}>{insider ? "Insider Waitlist" : "GroundUp Waitlist"}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 30, color: "#f5e8e8", marginBottom: 6 }}>{insider ? "Become an insider" : "Get on the list"}</h2>
            <p style={{ color: "#8a7070", fontSize: 13, fontFamily: font, lineHeight: 1.7, marginBottom: 8 }}>{insider ? "Tell us where you are and what's in your way — at launch, you'll get first access and our personal recommendation for the plan that fits." : "Tell us where you are and what's in your way — the moment doors open, you'll get your invite and our personal recommendation for the plan that fits."}</p>
            <p style={{ color: "#8f7070", fontSize: 12, fontFamily: font, lineHeight: 1.7, marginBottom: insider ? 14 : 22 }}>Questions about the tiers? <a href="/pricing" target="_blank" rel="noreferrer" style={{ color: "#b80101", fontWeight: 800, textDecoration: "none" }}>See the full breakdown on the website ↗</a></p>
            {insider && (
              <div style={{ background: "#e0c4c410", border: "1px solid #e0c4c445", borderRadius: 12, padding: "14px 18px", marginBottom: 22 }}>
                <div style={{ color: "#e0c4c4", fontSize: 11, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>✦ Founding 25</div>
                <div style={{ color: "#c8a8a8", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>The first 25 people on this list lock in <strong style={{ color: "#f0d8d8" }}>founding rates for their entire first year</strong> — plus a year of Lunch & Learns with Dr. Merritt, free. The rates reveal at launch; being early is what earns them.</div>
              </div>
            )}
            <form onSubmit={submit}>
              {/* Honeypot — offscreen, humans never see or tab into it */}
              <input type="text" name="website" value={hp} onChange={e => setHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
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
              {insider ? (<>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>What do you hope to learn?</label>
                <select style={sel} value={learn} onChange={e => setLearn(e.target.value)} required>
                  <option value="" disabled>Choose one…</option>
                  {WL_LEARN.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {learn === "Other" && <input style={{ ...inp, marginTop: 8 }} value={learnOther} onChange={e => setLearnOther(e.target.value)} placeholder="Tell us in your own words" required />}
                {learn === "I need deal-specific support on a live project" && <div style={{ marginTop: 8, background: "#12060a", border: "1px solid #b8010140", borderRadius: 8, padding: "10px 12px", color: "#c8a8a8", fontSize: 12, fontFamily: font, lineHeight: 1.6 }}>Good to know: deal-specific support — your numbers, your gap, your structure — comes only with the <strong style={{ color: "#f0d8d8" }}>Owner plan</strong> or the Senior Advisor retainer. We'll point you there.</div>}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>What's your main pain point?</label>
                <select style={sel} value={pain} onChange={e => setPain(e.target.value)} required>
                  <option value="" disabled>Choose one…</option>
                  {WL_PAIN.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {pain === "Other" && <input style={{ ...inp, marginTop: 8 }} value={painOther} onChange={e => setPainOther(e.target.value)} placeholder="Tell us in your own words" required />}
                {pain === "I need partners or a team" && (
                  <div style={{ marginTop: 8, background: "#1c0404", border: "1.5px solid #b80101", borderRadius: 8, padding: "10px 12px", color: "#e8c8c8", fontSize: 12, fontFamily: font, lineHeight: 1.7 }}>
                    Looking to team with Dr. Gina Merritt herself? The <strong style={{ color: "#f0d8d8" }}>✦ Thought partnership</strong> below is the better fit — she can join your project as a strategic partner (approved per submission). Want structured guidance without the partnership title? Choose <strong style={{ color: "#f0d8d8" }}>Owner</strong>.
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Monthly budget for a course, community, and access to support</label>
                <div style={{ color: "#8f7070", fontSize: 11.5, fontFamily: font, lineHeight: 1.6, margin: "2px 0 8px" }}>The lower tiers build your foundation — the courses, the community, the knowledge. The higher tiers add deal-specific support with Dr. Merritt.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {WL_BUDGETS.map(b => {
                    const long = b === "$3,000+" || b === "I need specific, customized deal help" || b === "I need general support & guidance" || b === "I already know what tier I want";
                    const btn = (
                      <button type="button" key={b} onClick={() => setBudget(b)}
                        onMouseEnter={() => b === "$3,000+" && setPartnerHover(true)}
                        onMouseLeave={() => b === "$3,000+" && setPartnerHover(false)}
                        style={{ width: long ? "100%" : undefined, gridColumn: !long ? undefined : "1 / -1", background: budget === b ? "#b8010118" : "transparent", border: budget === b ? "1px solid #b80101" : b === "$3,000+" ? "1px solid #e0c4c455" : long ? "1px solid #b8010145" : "1px solid #2a0000", borderRadius: 8, padding: "11px 12px", cursor: "pointer", color: budget === b ? "#f0d8d8" : b === "$3,000+" ? "#e0c4c4" : long ? "#c8a8a8" : "#8a7070", fontWeight: 700, fontSize: 13, fontFamily: font }}>
                        {b === "$3,000+" ? "✦ $3,000+ · Thought partnership" : b === "I need specific, customized deal help" ? "🔴 I need specific, customized deal help" : b === "I need general support & guidance" ? "🧭 I need general support & guidance" : b === "I already know what tier I want" ? "🎯 I already know what tier I want" : b}
                      </button>
                    );
                    if (!long) return btn;
                    // The long buttons anchor their pop-up beside the button — a
                    // speech bubble with a tail — instead of stacking underneath.
                    // On narrow screens there's no room beside the form, so it
                    // falls back to right below the button.
                    const showBubble = budget === b || (b === "$3,000+" && partnerHover);
                    let bubbleBody = null;
                    if (showBubble) {
                      if (b === "I already know what tier I want") bubbleBody = (
                        <select style={{ ...sel, width: "100%" }} value={wantTier} onChange={e => setWantTier(e.target.value)} required>
                          <option value="" disabled>Pick your tier…</option>
                          <option value="Member">Member — $49.99/mo</option>
                          <option value="Builder">Builder — $149.99/mo</option>
                          <option value="Premium">Premium — $249.99/mo</option>
                          <option value="Elite">Owner — $499.99/mo</option>
                          <option value="Single Course Pass">Single Course Pass — $100 one-time</option>
                          <option value="All-Access Pass">All-Access Pass — $275 one-time</option>
                          <option value="Lifetime Pass">GroundUp Lifetime Pass — $5,000 one-time</option>
                        </select>
                      );
                      else if (b === "I need general support & guidance") bubbleBody = (
                        <span>Think of <strong style={{ color: "#f0d8d8" }}>Premium</strong> ($249.99/mo) as your safety net — the tools, templates, Opportunity Board, and group office hours with Dr. Merritt, there whenever you need to lean on them. That's what we'll recommend. (Hands-on deal work lives at Owner and the retainer.)</span>
                      );
                      else if (b === "I need specific, customized deal help") bubbleBody = (
                        <span>Deal-specific support — your numbers, your gap, your structure — comes with the <strong style={{ color: "#f0d8d8" }}>Owner plan</strong> ($499.99/mo) or the Senior Advisor retainer. We'll recommend Owner and point you at the fastest way to get Dr. Merritt on your deal.</span>
                      );
                      else bubbleBody = (
                        <span><strong style={{ color: "#f0d8d8" }}>This isn't a subscription — it's a retainer.</strong> Dr. Gina Merritt directly on YOUR project — deal review, capital strategy, negotiation prep — starting at <strong style={{ color: "#f0d8d8" }}>$3,025/mo</strong>, Dr. Gina brings her expertise, deliverable support, and standing to your project — she can even join your RFPs and applications as a strategic partner, approved per submission.</span>
                      );
                    }
                    const gold = b === "$3,000+";
                    // The tier dropdown reads better right under its button; only the
                    // explainer bubbles float to the side.
                    const wide = b !== "I already know what tier I want" && typeof window !== "undefined" && window.innerWidth >= 1024;
                    return (
                      <div key={b} style={{ gridColumn: "1 / -1", position: "relative" }}>
                        {btn}
                        {showBubble && (wide ? (
                          <div style={{ position: "absolute", left: "calc(100% + 16px)", top: "50%", transform: "translateY(-50%)", width: 300, zIndex: 20, background: "#1c0404", border: "1.5px solid #b80101", boxShadow: "0 8px 28px rgba(184,1,1,0.25)", borderRadius: 12, padding: "12px 16px", color: gold ? "#e0c4c4" : "#e8c8c8", fontSize: 12.5, fontFamily: font, lineHeight: 1.7, }}>
                            <div style={{ position: "absolute", left: -7, top: "50%", transform: "translateY(-50%) rotate(45deg)", width: 12, height: 12, background: "#1c0404", borderLeft: "1.5px solid #b80101", borderBottom: "1.5px solid #b80101" }} />
                            {bubbleBody}
                          </div>
                        ) : (
                          <div style={{ marginTop: 8, background: "#1c0404", border: "1.5px solid #b80101", borderRadius: 8, padding: "10px 12px", color: gold ? "#e0c4c4" : "#e8c8c8", fontSize: 12, fontFamily: font, lineHeight: 1.6 }}>{bubbleBody}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              </>) : (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>What's your goal?</label>
                <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                  {GEN_GOALS.map(g => (
                    <div key={g.value}>
                      <button type="button" onClick={() => setGoal(g.value)}
                        style={{ width: "100%", textAlign: "center", background: goal === g.value ? "#b8010118" : "transparent", border: goal === g.value ? "1px solid #b80101" : g.value === "$3,000+" ? "1px solid #e0c4c455" : "1px solid #b8010145", borderRadius: 8, padding: "12px 14px", cursor: "pointer", color: goal === g.value ? "#f0d8d8" : g.value === "$3,000+" ? "#e0c4c4" : "#c8a8a8", fontWeight: 700, fontSize: 13, fontFamily: font }}>
                        {g.label}
                      </button>
                      {goal === g.value && g.bubble && (
                        <div style={{ marginTop: 8, background: "#1c0404", border: "1.5px solid #b80101", borderRadius: 8, padding: "10px 12px", color: "#e8c8c8", fontSize: 12, fontFamily: font, lineHeight: 1.7 }}>{g.bubble}</div>
                      )}
                      {goal === g.value && g.value === "I already know what tier I want" && (
                        <select style={{ ...sel, width: "100%", marginTop: 8 }} value={wantTier} onChange={e => setWantTier(e.target.value)} required>
                          <option value="" disabled>Pick your tier…</option>
                          <option value="Member">Member — $49.99/mo</option>
                          <option value="Builder">Builder — $149.99/mo</option>
                          <option value="Premium">Premium — $249.99/mo</option>
                          <option value="Elite">Owner — $499.99/mo</option>
                          <option value="Single Course Pass">Single Course Pass — $100 one-time</option>
                          <option value="All-Access Pass">All-Access Pass — $275 one-time</option>
                          <option value="Lifetime Pass">GroundUp Lifetime Pass — $5,000 one-time</option>
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              )}
              {!urlSource && (
              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>Where did you hear about us? <span style={{ color: "#9a7878", textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                <select style={sel} value={source} onChange={e => setSource(e.target.value)}>
                  <option value="">Prefer not to say</option>
                  {WL_SOURCE.map(o => <option key={o} value={o}>{o}</option>)}
                  {partners.map(p => <option key={p.code} value={"heard-ref:" + p.code}>Referred by {p.label}</option>)}
                </select>
              </div>
              )}
              {msg && <div style={{ color: "#ff6b6b", fontSize: 13, fontFamily: font, marginBottom: 12 }}>{msg}</div>}
              <button type="submit" disabled={busy} style={{ ...btnRed, width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "Saving your spot…" : insider ? "Join the Insider Waitlist →" : "Join the Waitlist →"}</button>
            </form>
          </>
        )}
    </div>
  );
}


// ─── RESOURCES & TEMPLATES (Premium+; partner network is Elite) ─────────────

// ─── MY COHORT — the home tab for members sponsored through a partner org:
// their program's branding, their curriculum, their private channel. ─────────
export function MyCohortPage({ member, onNav, onCourse }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [cohortSessions, setCohortSessions] = useState([]);
  useEffect(() => {
    if (!member?.partner_slug) return;
    api("/api/lunchlearn").then(d => setCohortSessions((d?.office_hours?.events || []).filter(e => e.audience === "cohort:" + member.partner_slug && new Date(e.date) > new Date()))).catch(() => {});
    fetch(`/api/resources?partner=${encodeURIComponent(member.partner_slug)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Couldn't load your cohort")))
      .then(setData).catch(e => setError(e.message));
  }, [member?.partner_slug]);

  if (!member?.partner_slug) {
    return (
      <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "140px 20px", textAlign: "center" }}>
        <p style={{ color: "var(--gu-muted)", fontFamily: font, fontSize: 15 }}>Your account isn't part of a cohort.</p>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "110px clamp(20px,5vw,80px) 80px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {error && <div style={{ color: "#ff6b6b", fontFamily: font, fontSize: 13, marginBottom: 20 }}>{error}</div>}
        {!data ? <div style={{ color: "var(--gu-muted)", fontFamily: font }}>Loading…</div> : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
              {data.partner.logo_url && <img src={data.partner.logo_url} alt={data.partner.name} style={{ height: 54, maxWidth: 180, objectFit: "contain", background: "#fff", borderRadius: 10, padding: "6px 12px" }} />}
              <div>
                <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>My Cohort</div>
                <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(30px,4.5vw,44px)", color: "var(--gu-text)", margin: 0, lineHeight: 1.1 }}>{data.partner.name}</h1>
              </div>
            </div>
            <p style={{ color: "var(--gu-muted)", fontSize: 14, fontFamily: font, lineHeight: 1.8, maxWidth: 600, marginBottom: 36 }}>Your program's home base — the curriculum selected for your cohort, your private channel, and everything your group does together.</p>

            <div onClick={() => onNav("community")} style={{ background: "var(--gu-card)", border: "1px solid #b8010140", borderRadius: 16, padding: "22px 26px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 40 }}>
              <span style={{ fontSize: 22 }}>💬</span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 16, fontFamily: font, marginBottom: 3 }}>{data.partner.name} Cohort — your private channel</div>
                <div style={{ color: "var(--gu-muted)", fontSize: 13, fontFamily: font, lineHeight: 1.6 }}>Just your group and Dr. Merritt — ask questions, share progress, and hear about cohort sessions here first.</div>
              </div>
              <span style={{ color: "#b80101", fontWeight: 800, fontSize: 14, fontFamily: font }}>Open →</span>
            </div>

            {cohortSessions.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, color: "var(--gu-text2)", marginBottom: 6 }}>Cohort office hours</h2>
                <p style={{ color: "var(--gu-muted2)", fontSize: 13, fontFamily: font, marginBottom: 14 }}>Sessions with Dr. Merritt reserved for your group. RSVP from the Office Hours page.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {cohortSessions.map(ev => (
                    <div key={ev.id || ev.date} onClick={() => onNav("officehours")} style={{ background: "var(--gu-card)", border: "1px solid #c9a22745", borderRadius: 12, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 15, fontFamily: font }}>{ev.title}</div>
                        <div style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, marginTop: 3 }}>{new Date(ev.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}{ev.time ? ` · ${ev.time}` : ""}</div>
                      </div>
                      <span style={{ color: ev.my_rsvp ? "#4ade80" : "#e6c766", fontWeight: 800, fontSize: 12, fontFamily: font }}>{ev.my_rsvp ? "✓ You're in" : "RSVP →"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, color: "var(--gu-text2)", marginBottom: 6 }}>Your curriculum</h2>
            <p style={{ color: "var(--gu-muted2)", fontSize: 13, fontFamily: font, marginBottom: 18 }}>Selected for your cohort and taught by Dr. Gina Merritt.</p>
            {data.courses.length === 0 ? (
              <div style={{ color: "var(--gu-faint)", fontSize: 13, fontFamily: font, background: "var(--gu-card2)", border: "1px solid #1e0000", borderRadius: 12, padding: "20px 24px" }}>Your curriculum is being set up — check back soon.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {data.courses.map(c => (
                  <div key={c.id} onClick={() => onCourse(c.id)} style={{ background: "var(--gu-card)", border: "1px solid #2a0000", borderRadius: 14, padding: "18px 24px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <span style={{ background: (c.stageColor || "#b80101") + "18", color: c.stageColor || "#b80101", border: "1px solid " + (c.stageColor || "#b80101") + "35", borderRadius: 4, padding: "3px 10px", fontSize: 10, fontFamily: font, fontWeight: 800, letterSpacing: "1px", flexShrink: 0 }}>{c.stage}</span>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 19, color: "var(--gu-text2)", lineHeight: 1.2 }}>{c.title}</div>
                    </div>
                    <span style={{ color: "var(--gu-faint)", fontSize: 12, fontFamily: font, flexShrink: 0 }}>{c.lessonCount} lessons</span>
                    <span style={{ color: c.stageColor || "#b80101", fontSize: 16 }}>→</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── THE LIBRARY — the same materials as Resources, filed the way a deal
// actually runs: by development phase, 1 through 9, then the general pile. ───
export function LibraryPage({ member, onUpgrade }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const rank = member && !member.suspended ? (TIER_RANK[member.tier] ?? 0) : 0;
  const allowed = member && (rank >= 2 || member.role === "admin");

  useEffect(() => {
    if (!allowed) return;
    api("/api/resources").then(setData).catch(e => setError(e.message));
  }, [member?.id]);

  const ping = (id) => { try { api("/api/resources", { method: "POST", body: JSON.stringify({ action: "resource_click", id }) }).catch(() => {}); } catch {} };

  if (!allowed) {
    return (
      <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "140px 20px", textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}><Lock size={36} color="#b80101" style={{ display: "inline-block" }} /></div>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 40, color: "var(--gu-text)", marginBottom: 14 }}>The Library</h1>
        <p style={{ color: "var(--gu-muted)", fontFamily: font, fontSize: 15, maxWidth: 480, margin: "0 auto 28px", lineHeight: 1.8 }}>Templates, downloads, and working documents filed by development phase — a Premium benefit.</p>
        <button style={btnRed} onClick={onUpgrade}>View Plans →</button>
      </div>
    );
  }

  const items = data ? data.resources.filter(r => r.category !== "partner") : [];
  return (
    <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "110px clamp(20px,5vw,80px) 80px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>The Library</div>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(32px,5vw,48px)", color: "var(--gu-text)", marginBottom: 10 }}>Filed the way a deal runs</h1>
        <p style={{ color: "var(--gu-muted)", fontSize: 14, fontFamily: font, lineHeight: 1.8, maxWidth: 600, marginBottom: 44 }}>Every template and tool in the member collection, organized by the nine phases of the development process — so when you're in construction, you look under construction. The same materials also live topic-by-topic on the Resources page.</p>
        {error && <div style={{ color: "#ff6b6b", fontFamily: font, fontSize: 13, marginBottom: 20 }}>{error}</div>}
        {!data ? <div style={{ color: "var(--gu-muted)", fontFamily: font }}>Loading…</div> : (
          [...Array.from({ length: 9 }, (_, i) => i + 1), null].map(ph => {
            const phItems = items.filter(r => (r.phase || null) === ph);
            const name = ph ? `Phase ${ph} — ${DEV_PHASES[ph - 1]}` : "General — the whole process";
            return (
              <div key={String(ph)} style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  {ph && <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, color: "#b80101", opacity: 0.55, lineHeight: 1, minWidth: 24 }}>{ph}</span>}
                  <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, color: "var(--gu-text2)", margin: 0 }}>{ph ? DEV_PHASES[ph - 1] : "The Whole Process"}</h2>
                  <span style={{ flex: 1, borderTop: "1px solid #1e0000" }} />
                  <span style={{ color: "var(--gu-faint)", fontSize: 12, fontFamily: font }}>{phItems.length || "—"}</span>
                </div>
                {phItems.length === 0 ? (
                  <div style={{ color: "var(--gu-faint)", fontSize: 12.5, fontFamily: font, padding: "4px 0 4px 36px" }}>Nothing filed here yet.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                    {phItems.map(r => {
                      const isTemplate = r.category === "template";
                      const open = () => { if (r.url) { ping(r.id); window.open(r.url, "_blank", "noreferrer"); } };
                      return (
                        <div key={r.id} onClick={open} style={{ background: "var(--gu-card)", border: "1px solid #2a0000", borderRadius: 14, padding: "18px 20px", cursor: r.url ? "pointer" : "default", display: "flex", gap: 14, alignItems: "flex-start", transition: "all 0.2s" }}
                          onMouseEnter={e => { if (r.url) { e.currentTarget.style.borderColor = "#b8010150"; e.currentTarget.style.transform = "translateY(-2px)"; } }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a0000"; e.currentTarget.style.transform = "none"; }}>
                          <div style={{ width: 38, height: 38, borderRadius: 10, background: isTemplate ? "#c9a22718" : "#b8010115", border: "1px solid " + (isTemplate ? "#c9a22740" : "#b8010130"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{isTemplate ? "📄" : "🔗"}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: "var(--gu-text2)", fontWeight: 800, fontSize: 14.5, fontFamily: font, lineHeight: 1.35, marginBottom: 4 }}>{r.title}</div>
                            {r.description && <div style={{ color: "var(--gu-muted)", fontSize: 12, fontFamily: font, lineHeight: 1.6, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.description}</div>}
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 9, color: isTemplate ? "#c9a227" : "#8f7070", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: font }}>{isTemplate ? "Template" : "Resource"}</span>
                              {r.url && <span style={{ color: "#b80101", fontWeight: 800, fontSize: 12, fontFamily: font, marginLeft: "auto" }}>Open →</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function ResourcesPage({ member, onUpgrade }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const rank = member && !member.suspended ? (TIER_RANK[member.tier] ?? 0) : 0;

  useEffect(() => {
    if (rank < 2 && member?.role !== "admin") return;
    api("/api/resources").then(setData).catch(e => setError(e.message));
  }, [member?.id]);

  // Count every resource use — link opens and code copies — for the admin panel
  const ping = (id) => { try { api("/api/resources", { method: "POST", body: JSON.stringify({ action: "resource_click", id }) }).catch(() => {}); } catch {} };

  if (!member || (rank < 2 && member.role !== "admin")) {
    return (
      <div style={{ background: "var(--gu-bg)", minHeight: "100vh", padding: "140px 20px", textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}><Lock size={36} color="#b80101" style={{ display: "inline-block" }} /></div>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 40, color: "var(--gu-text)", marginBottom: 14 }}>Resources & Templates</h1>
        <p style={{ color: "var(--gu-muted)", fontFamily: font, fontSize: 15, maxWidth: 480, margin: "0 auto 28px", lineHeight: 1.8 }}>
          Development timeline templates, worksheets, and curated tools are a Premium benefit — and Owner members unlock the NREUV partner network with member-only referral codes.
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
                  <span style={{ color: "var(--gu-muted)", fontSize: 14, fontFamily: font, flex: 1 }}>The partner network — marketing, tech, design and more, with member-only referral discounts — is an Owner benefit.</span>
                  <button style={btnRed} onClick={onUpgrade}>Go Owner →</button>
                </div>
              ) : items.length === 0 ? (
                <div style={{ color: "var(--gu-faint)", fontSize: 13, fontFamily: font, background: "var(--gu-card2)", border: "1px solid #1e0000", borderRadius: 12, padding: "20px 24px" }}>Nothing here yet — check back soon.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {items.map(r => (
                    <div key={r.id} style={{ background: "var(--gu-card)", border: "1px solid #2a0000", borderRadius: 14, padding: "20px 26px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "10px 28px" }}>
                      <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 8 }}>
                      {r.url && !/youtube\.com|youtu\.be/.test(r.url) ? (
                        <a href={r.url} target="_blank" rel="noreferrer" onClick={() => ping(r.id)} style={{ color: "#b80101", fontWeight: 800, fontSize: 16, fontFamily: font, textDecoration: "none" }}>{r.title} ↗</a>
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
                          <button onClick={() => { ping(r.id); navigator.clipboard && navigator.clipboard.writeText(r.code); }} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--gu-muted)", cursor: "pointer", fontSize: 11, fontFamily: font, fontWeight: 700 }}>Copy</button>
                        </div>
                      )}
                      {r.url && (() => {
                        const yt = r.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
                        if (yt) return (
                          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden", background: "var(--gu-bg)" }}>
                            <iframe src={`https://www.youtube.com/embed/${yt[1]}`} title={r.title} allowFullScreen allow="accelerometer; encrypted-media; picture-in-picture" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
                          </div>
                        );
                        return <a href={r.url} target="_blank" rel="noreferrer" onClick={() => ping(r.id)} style={{ color: "#b80101", fontSize: 13, fontFamily: font, fontWeight: 800, textDecoration: "none" }}>Open →</a>;
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
  useEffect(() => { load(); return pollVisible(load, 30000); }, [member?.id]);
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
            Already paid the <strong style={{ color: "var(--gu-text2)" }}>$1,500 Full Project Intake</strong>? It credits automatically against your first month at checkout. Haven't yet? The intake — Dr. Merritt reviewing your whole deal before the first working session — is the first step.
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

            {(() => {
              const engagement = (data.files || []).filter(f => f.kind === "engagement");
              const project = (data.files || []).filter(f => f.kind !== "engagement");
              const row = (f) => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--gu-border2)" }}>
                  <FileTextIcon />
                  <span style={{ color: "var(--gu-text2)", fontSize: 13.5, fontFamily: font, fontWeight: 600, flex: 1 }}>{f.title}</span>
                  {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ color: "#b80101", fontSize: 12.5, fontFamily: font, fontWeight: 800, textDecoration: "none" }}>Open ↗</a>}
                </div>
              );
              return (<>
              <div style={{ background: "linear-gradient(135deg, #171004, var(--gu-card))", border: "1px solid #4a3a1060", borderRadius: 16, padding: "26px 28px", marginBottom: 18 }}>
                <div style={{ fontSize: 9, color: "#c9a227", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>Engagement Documents</div>
                <p style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, marginBottom: engagement.length ? 14 : 0 }}>The paperwork of the engagement itself — your agreement, scope, and anything the team formalizes. Both sides see everything here.</p>
                {engagement.length ? engagement.map(row) : <div style={{ color: "var(--gu-faint)", fontSize: 13, fontFamily: font, marginTop: 10 }}>No engagement documents yet — the team adds them here as they're executed.</div>}
              </div>
              <div style={{ background: "var(--gu-card)", border: "1px solid var(--gu-border)", borderRadius: 16, padding: "26px 28px" }}>
                <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>Project Documents</div>
                <p style={{ color: "var(--gu-muted)", fontSize: 12.5, fontFamily: font, marginBottom: 14 }}>Send document links back and forth — deal docs, models, drafts, anything you want Dr. Merritt to review, and anything she sends back.</p>
                <form onSubmit={addFile} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  <input style={{ ...inp, marginBottom: 0, flex: 1, minWidth: 150 }} value={file.title} onChange={e => setFile({ ...file, title: e.target.value })} placeholder="Document name" />
                  <input style={{ ...inp, marginBottom: 0, flex: 1, minWidth: 180 }} value={file.url} onChange={e => setFile({ ...file, url: e.target.value })} placeholder="Link (Drive, Dropbox…)" />
                  <button type="submit" style={btnRed}>Add</button>
                </form>
                {project.length ? project.map(row) : <div style={{ color: "var(--gu-faint)", fontSize: 13, fontFamily: font }}>Nothing shared yet.</div>}
              </div>
              </>);
            })()}
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
