import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── MEMBER SESSION HELPERS ─────────────────────────────────────────────────

export const TIER_RANK = { Free: 0, Basic: 1, Premium: 2, Elite: 3 };

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

const TIER_COLORS = { Free: "#6a6b69", Basic: "#b80101", Premium: "#c9a227", Elite: "#e0c4c4", Partner: "#c9a227" };
// Display names — 'Basic' is the internal value for the Member subscription tier
export const TIER_LABELS = { Free: "Free", Basic: "Member", Premium: "Premium", Elite: "Elite", Partner: "Partner" };

export function TierBadge({ tier, small }) {
  const c = TIER_COLORS[tier] || "#6a6b69";
  return (
    <span style={{ background: c + "18", color: c, border: `1px solid ${c}40`, borderRadius: 5, padding: small ? "1px 7px" : "3px 10px", fontSize: small ? 9 : 10, fontFamily: font, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{TIER_LABELS[tier] || tier}</span>
  );
}

// ─── AUTH MODAL (login / create account) ────────────────────────────────────

export function AuthModal({ onClose, onAuthed, defaultTier = "Free", startMode = "signup" }) {
  const [mode, setMode] = useState(startMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tier, setTier] = useState(defaultTier);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const data = mode === "signup"
        ? await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "signup", name, email, password, tier }) })
        : await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "login", email, password }) });
      saveMember(data.user, data.token);
      onAuthed(data.user);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 20, padding: "36px 36px 32px", width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 10 }}>GroundUp Membership</div>
        <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: 30, color: "#f5e8e8", marginBottom: 6 }}>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        <p style={{ color: "#8a7070", fontSize: 13, fontFamily: font, lineHeight: 1.7, marginBottom: 24 }}>
          {mode === "signup" ? "One account for your courses, your community, and your membership benefits." : "Sign in to get back to your courses and the community."}
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
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Password</label>
            <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} />
          </div>
          {mode === "signup" && (
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Plan</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {["Free", "Basic", "Premium", "Elite"].map(t => (
                  <button type="button" key={t} onClick={() => setTier(t)} style={{ background: tier === t ? "#b8010118" : "transparent", border: tier === t ? "1px solid #b80101" : "1px solid #2a0000", borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ color: tier === t ? "#f0d8d8" : "#8a7070", fontWeight: 800, fontSize: 13, fontFamily: font }}>{TIER_LABELS[t]}</div>
                    <div style={{ color: "#7a5050", fontSize: 11, fontFamily: font }}>{{ Free: "$0", Basic: "$59.99/mo", Premium: "$165.99/mo", Elite: "$599.99/mo" }[t]}</div>
                  </button>
                ))}
              </div>
              {tier !== "Free" && (
                <div style={{ marginTop: 10, background: "#0d0a04", border: "1px solid #2a2000", borderRadius: 8, padding: "10px 14px", color: "#b8a060", fontSize: 12, fontFamily: font, lineHeight: 1.6 }}>
                  Online payment is coming soon — your account starts on the Free plan and our team will activate {tier} once payment is arranged. Email info@nreuv.com to get set up.
                </div>
              )}
            </div>
          )}
          {error && <div style={{ color: "#ff6b6b", fontSize: 13, fontFamily: font, marginBottom: 14 }}>{error}</div>}
          <button type="submit" disabled={busy} style={{ ...btnRed, width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "One moment…" : mode === "signup" ? "Create Account →" : "Sign In →"}</button>
        </form>
        <div style={{ marginTop: 18, textAlign: "center", fontSize: 13, fontFamily: font, color: "#8a7070" }}>
          {mode === "signup" ? <>Already a member? <button onClick={() => { setMode("login"); setError(""); }} style={{ background: "none", border: "none", color: "#b80101", cursor: "pointer", fontWeight: 700, fontFamily: font, fontSize: 13 }}>Sign in</button></>
            : <>New here? <button onClick={() => { setMode("signup"); setError(""); }} style={{ background: "none", border: "none", color: "#b80101", cursor: "pointer", fontWeight: 700, fontFamily: font, fontSize: 13 }}>Create an account</button></>}
        </div>
      </div>
    </div>
  );
}

// ─── MEMBERSHIP PAGE (dashboard) ────────────────────────────────────────────

const BENEFITS = {
  Free: ["One lesson of your choice — the first you open", "1 curated case study", "Glossary & resource sheet"],
  Basic: ["All 4 courses + every new course we add", "Case studies, worksheets & reading guides", "Community access — read every channel"],
  Premium: ["Everything in Member", "Engage in the community — post, reply & network", "JV & Partnerships channel", "Development timeline templates", "Lunch & Learn recordings", "1 free work session (1 hr) + priority booking"],
  Elite: ["Everything in Premium", "Priority responses in the community", "Direct messages to Dr. Merritt & her team", "Elite Lounge — private channel", "3 one-on-one advisory calls/yr with Dr. Merritt", "Priority Q&A submissions"],
  Partner: ["Custom organizational access", "Contact info@nreuv.com for your cohort setup"],
};

export function MemberPage({ member, setActivePage, onSignOut, onSignIn }) {
  if (!member) {
    return (
      <div style={{ background: "#000", minHeight: "100vh", padding: "140px 20px", textAlign: "center" }}>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 40, color: "#f5e8e8", marginBottom: 14 }}>Membership</h1>
        <p style={{ color: "#8a7070", fontFamily: font, fontSize: 15, marginBottom: 28 }}>Sign in or create an account to see your membership.</p>
        <button style={btnRed} onClick={onSignIn}>Sign In / Join →</button>
      </div>
    );
  }
  const rank = TIER_RANK[member.tier] ?? 0;
  return (
    <div style={{ background: "#000", minHeight: "100vh", padding: "110px clamp(20px,5vw,80px) 80px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 40 }}>
          <div>
            <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>Your Membership</div>
            <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(32px,5vw,48px)", color: "#f5e8e8", lineHeight: 1.1, marginBottom: 10 }}>Welcome, {member.name.split(" ")[0]}.</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TierBadge tier={member.tier} />
              <span style={{ color: "#7a5050", fontSize: 13, fontFamily: font }}>{member.email}</span>
            </div>
          </div>
          <button style={btnGhost} onClick={onSignOut}>Sign out</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 40 }}>
          <div onClick={() => setActivePage("courses")} style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 16, padding: "26px 28px", cursor: "pointer" }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>📚</div>
            <div style={{ color: "#f0d8d8", fontWeight: 800, fontSize: 16, fontFamily: font, marginBottom: 6 }}>Your Courses</div>
            <p style={{ color: "#8a7070", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>{rank >= 1 ? "Full access to all 4 courses and every lesson." : member.free_lesson_key ? "You've used your free lesson. Upgrade for the full curriculum." : "One free lesson included. Upgrade for the full curriculum."}</p>
          </div>
          <div onClick={() => rank >= 1 && setActivePage("community")} style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 16, padding: "26px 28px", cursor: rank >= 1 ? "pointer" : "default", opacity: rank >= 1 ? 1 : 0.55 }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>💬</div>
            <div style={{ color: "#f0d8d8", fontWeight: 800, fontSize: 16, fontFamily: font, marginBottom: 6 }}>Community {rank < 1 && "🔒"}</div>
            <p style={{ color: "#8a7070", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>{rank >= 2 ? "Post, reply, and network with fellow developers." : rank >= 1 ? "Read every channel. Upgrade to Premium to post and reply." : "Members-only. Upgrade to a membership to join the conversation."}</p>
          </div>
          <div onClick={() => setActivePage("lunchlearn")} style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 16, padding: "26px 28px", cursor: "pointer", opacity: rank >= 2 ? 1 : 0.55 }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>🎥</div>
            <div style={{ color: "#f0d8d8", fontWeight: 800, fontSize: 16, fontFamily: font, marginBottom: 6 }}>Lunch & Learns {rank < 2 && "🔒"}</div>
            <p style={{ color: "#8a7070", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>{rank >= 2 ? "Recordings and live session access included in your plan." : "Recordings are a Premium benefit. Live sessions open to all."}</p>
          </div>
          <div onClick={() => setActivePage("contact")} style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 16, padding: "26px 28px", cursor: "pointer", opacity: rank >= 3 ? 1 : 0.55 }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>🤝</div>
            <div style={{ color: "#f0d8d8", fontWeight: 800, fontSize: 16, fontFamily: font, marginBottom: 6 }}>Advisory Access {rank < 3 && "🔒"}</div>
            <p style={{ color: "#8a7070", fontSize: 13, fontFamily: font, lineHeight: 1.7 }}>{rank >= 3 ? "Your Elite advisory calls and priority Q&A with Dr. Merritt." : "One-on-one time with Dr. Merritt is an Elite benefit. Book single sessions anytime."}</p>
          </div>
        </div>

        <div style={{ background: "#0a0808", border: "1px solid #1e0000", borderRadius: 16, padding: "28px 32px", marginBottom: 28 }}>
          <div style={{ fontSize: 9, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 16 }}>What your {member.tier} plan includes</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {(BENEFITS[member.tier] || []).map((b, i) => (
              <li key={i} style={{ display: "flex", gap: 12, marginBottom: 10, color: "#c8a8a8", fontSize: 14, lineHeight: 1.7, fontFamily: font, fontWeight: 600 }}>
                <span style={{ color: "#b80101" }}>→</span><span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {rank < 3 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, background: "#0d0a04", border: "1px solid #2a2000", borderRadius: 14, padding: "20px 26px" }}>
            <div style={{ color: "#b8a060", fontSize: 14, fontFamily: font, fontWeight: 600 }}>Want more access? Compare plans and upgrade anytime.</div>
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

function Message({ m, onOpenThread, onDelete, canDelete, inThread }) {
  return (
    <div style={{ padding: "12px 16px", borderRadius: 10, background: m.is_admin ? "#12060a" : "transparent", border: m.is_admin ? "1px solid #b8010130" : "1px solid transparent", marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ color: m.is_admin ? (m.author_badge === "drmerritt" ? "#c9a227" : "#b80101") : "#f0d8d8", fontWeight: 800, fontSize: 13, fontFamily: font }}>{m.author_name || "Member"}</span>
        {m.is_admin ? (
          m.author_badge === "drmerritt"
            ? <span style={{ background: "linear-gradient(135deg, #c9a227, #8a6d1a)", color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800, fontFamily: font, letterSpacing: "1px" }}>DR. MERRITT</span>
            : <span style={{ background: "#b80101", color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800, fontFamily: font, letterSpacing: "1px" }}>TEAM</span>
        ) : m.author_tier && <TierBadge tier={m.author_tier} small />}
        <span style={{ color: "#5a4040", fontSize: 11, fontFamily: font }}>{timeAgo(m.created_at)}</span>
        {canDelete && <button onClick={() => onDelete(m)} style={{ background: "none", border: "none", color: "#5a4040", cursor: "pointer", fontSize: 11, fontFamily: font, marginLeft: "auto" }}>delete</button>}
      </div>
      <div style={{ color: "#c8b0b0", fontSize: 14, fontFamily: font, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
      {!inThread && (
        <button onClick={() => onOpenThread(m)} style={{ background: "none", border: "none", color: Number(m.reply_count) > 0 ? "#b80101" : "#5a4040", cursor: "pointer", fontSize: 12, fontFamily: font, fontWeight: 700, padding: 0, marginTop: 6 }}>
          {Number(m.reply_count) > 0 ? `💬 ${m.reply_count} repl${Number(m.reply_count) === 1 ? "y" : "ies"}` : "Reply in thread"}
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
  const feedRef = useRef(null);
  const rank = member ? (TIER_RANK[member.tier] ?? 0) : 0;
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
  }, [hasAccess, isAdmin, loadChannels]);

  const loadDm = useCallback(async (targetId) => {
    const q = targetId ? `&user=${targetId}` : "";
    const data = await api(`/api/community?resource=dm${q}`);
    setDmMsgs(data.messages);
  }, []);

  useEffect(() => {
    if (!dmOpen) return;
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

  const deleteMsg = async (m) => {
    try {
      await api("/api/community", { method: "DELETE", body: JSON.stringify({ id: m.id }) });
      await loadMessages(active.id, thread ? thread.id : undefined);
      if (!thread) await loadMessages(active.id);
    } catch (e) { setError(e.message); }
  };

  if (!hasAccess) {
    return (
      <div style={{ background: "#000", minHeight: "100vh", padding: "140px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
        <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: 40, color: "#f5e8e8", marginBottom: 14 }}>The GroundUp Community</h1>
        <p style={{ color: "#8a7070", fontFamily: font, fontSize: 15, maxWidth: 480, margin: "0 auto 28px", lineHeight: 1.8 }}>
          {member ? "The community is a paid-member benefit. Upgrade to Basic or above to join channels for deals, financing, JV partnerships, and direct announcements from Dr. Merritt's team." : "Sign in with a paid membership to chat with fellow developers and hear directly from Dr. Merritt's team."}
        </p>
        <button style={btnRed} onClick={onSignIn}>{member ? "View Plans →" : "Sign In / Join →"}</button>
      </div>
    );
  }

  const canPost = canEngage && active && (!active.admin_only_post || isAdmin);

  return (
    <div style={{ background: "#000", minHeight: "100vh", paddingTop: 64, display: "flex", height: "100vh", boxSizing: "border-box" }}>
      {/* Channel sidebar */}
      <div className="community-sidebar" style={{ width: 240, flexShrink: 0, borderRight: "1px solid #1a0000", background: "#070303", padding: "24px 12px", overflowY: "auto", display: sidebarOpen ? "block" : undefined }}>
        <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, padding: "0 12px", marginBottom: 14 }}>Channels</div>
        {channels.map(c => (
          <button key={c.id} onClick={() => { setActive(c); setDmOpen(false); setSidebarOpen(false); }}
            style={{ display: "block", width: "100%", textAlign: "left", background: !dmOpen && active?.id === c.id ? "#b8010118" : "transparent", border: "none", borderRadius: 8, padding: "9px 12px", cursor: "pointer", marginBottom: 2 }}>
            <span style={{ color: !dmOpen && active?.id === c.id ? "#f0d8d8" : "#8a7070", fontWeight: 700, fontSize: 13.5, fontFamily: font }}>
              {c.admin_only_post ? "📣" : "#"} {c.name}
            </span>
            {c.min_tier !== "Basic" && <span style={{ marginLeft: 6, fontSize: 9, color: TIER_COLORS[c.min_tier], fontFamily: font, fontWeight: 800 }}>{(TIER_LABELS[c.min_tier] || c.min_tier).toUpperCase()}</span>}
          </button>
        ))}
        {canDm && (
          <>
            <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, padding: "0 12px", margin: "20px 0 10px" }}>Direct Messages</div>
            {!isAdmin && (
              <button onClick={() => { setDmOpen(true); setSidebarOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", background: dmOpen ? "#b8010118" : "transparent", border: "none", borderRadius: 8, padding: "9px 12px", cursor: "pointer" }}>
                <span style={{ color: dmOpen ? "#f0d8d8" : "#8a7070", fontWeight: 700, fontSize: 13.5, fontFamily: font }}>✉️ Dr. Merritt & Team</span>
              </button>
            )}
            {isAdmin && dmThreads.length === 0 && <div style={{ color: "#5a4040", fontSize: 12, fontFamily: font, padding: "0 12px" }}>No member DMs yet.</div>}
            {isAdmin && dmThreads.map(t => (
              <button key={t.id} onClick={() => { setDmTarget(t); setDmOpen(true); setSidebarOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", background: dmOpen && dmTarget?.id === t.id ? "#b8010118" : "transparent", border: "none", borderRadius: 8, padding: "9px 12px", cursor: "pointer", marginBottom: 2 }}>
                <span style={{ color: dmOpen && dmTarget?.id === t.id ? "#f0d8d8" : "#8a7070", fontWeight: 700, fontSize: 13.5, fontFamily: font }}>✉️ {t.name}</span>
                <span style={{ marginLeft: 6, fontSize: 9, color: TIER_COLORS[t.tier], fontFamily: font, fontWeight: 800 }}>{(TIER_LABELS[t.tier] || t.tier).toUpperCase()}</span>
              </button>
            ))}
          </>
        )}
        {isAdmin && <div style={{ margin: "18px 12px 0", padding: "10px 12px", background: "#12060a", border: "1px solid #b8010130", borderRadius: 8, color: "#b80101", fontSize: 11, fontFamily: font, fontWeight: 700 }}>You're posting as the GroundUp team.</div>}
      </div>

      {/* Main feed */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {loading ? <div style={{ padding: 40, color: "#8a7070", fontFamily: font }}>Loading community…</div> : dmOpen ? (
          <>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #1a0000", display: "flex", alignItems: "center", gap: 12 }}>
              <button className="community-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: "none", background: "transparent", border: "1px solid #2a0000", borderRadius: 6, color: "#8a7070", padding: "6px 10px", cursor: "pointer", fontFamily: font }}>☰</button>
              <div>
                <div style={{ color: "#f0d8d8", fontWeight: 800, fontSize: 16, fontFamily: font }}>✉️ {isAdmin ? (dmTarget?.name || "Direct Messages") : "Dr. Merritt & Team"}</div>
                <div style={{ color: "#7a5050", fontSize: 12, fontFamily: font }}>{isAdmin ? "Private thread with this member." : "Private line to Dr. Merritt and the GroundUp team — an Elite benefit."}</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 12px" }}>
              {dmMsgs.length === 0 && <div style={{ color: "#5a4040", fontFamily: font, fontSize: 14, textAlign: "center", marginTop: 60 }}>{isAdmin ? "No messages in this thread yet." : "Start the conversation — Dr. Merritt's team will respond here."}</div>}
              {dmMsgs.map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: m.from_admin === !isAdmin ? "flex-start" : "flex-end", marginBottom: 10 }}>
                  <div style={{ maxWidth: "78%", background: m.from_admin ? "#12060a" : "#0d0404", border: m.from_admin ? "1px solid #b8010130" : "1px solid #1a0000", borderRadius: 12, padding: "10px 14px" }}>
                    {m.from_admin && <div style={{ marginBottom: 4 }}><span style={{ background: "#b80101", color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800, fontFamily: font, letterSpacing: "1px" }}>TEAM</span></div>}
                    <div style={{ color: "#c8b0b0", fontSize: 14, fontFamily: font, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                    <div style={{ color: "#5a4040", fontSize: 10, fontFamily: font, marginTop: 4 }}>{timeAgo(m.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
            {error && <div style={{ color: "#ff6b6b", fontSize: 12, fontFamily: font, padding: "0 24px 6px" }}>{error}</div>}
            <form onSubmit={sendDm} style={{ display: "flex", gap: 10, padding: "12px 20px 20px", borderTop: "1px solid #1a0000" }}>
              <input style={{ ...inp, flex: 1 }} value={dmDraft} onChange={e => setDmDraft(e.target.value)} placeholder={isAdmin ? `Reply to ${dmTarget?.name || "member"}…` : "Message Dr. Merritt & team…"} maxLength={4000} />
              <button type="submit" style={btnRed}>Send</button>
            </form>
          </>
        ) : active && (
          <>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #1a0000", display: "flex", alignItems: "center", gap: 12 }}>
              <button className="community-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: "none", background: "transparent", border: "1px solid #2a0000", borderRadius: 6, color: "#8a7070", padding: "6px 10px", cursor: "pointer", fontFamily: font }}>☰</button>
              <div>
                <div style={{ color: "#f0d8d8", fontWeight: 800, fontSize: 16, fontFamily: font }}>{active.admin_only_post ? "📣" : "#"} {active.name}</div>
                <div style={{ color: "#7a5050", fontSize: 12, fontFamily: font }}>{active.description}</div>
              </div>
            </div>
            <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: "20px 20px 12px" }}>
              {messages.length === 0 && <div style={{ color: "#5a4040", fontFamily: font, fontSize: 14, textAlign: "center", marginTop: 60 }}>No messages yet. {canPost ? "Start the conversation." : ""}</div>}
              {messages.map(m => <Message key={m.id} m={m} onOpenThread={setThread} onDelete={deleteMsg} canDelete={isAdmin || (member && m.user_id === member.id)} />)}
            </div>
            {error && <div style={{ color: "#ff6b6b", fontSize: 12, fontFamily: font, padding: "0 24px 6px" }}>{error}</div>}
            <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #1a0000" }}>
              {canPost ? (
                <form onSubmit={e => { e.preventDefault(); send(null, draft, () => setDraft("")); }} style={{ display: "flex", gap: 10 }}>
                  <input style={{ ...inp, flex: 1 }} value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message ${active.name}`} maxLength={4000} />
                  <button type="submit" style={btnRed}>Send</button>
                </form>
              ) : !canEngage ? (
                <div style={{ color: "#b8a060", fontSize: 13, fontFamily: font, textAlign: "center", padding: "8px 0" }}>👀 Reading is included with your Member plan. Upgrade to Premium to post, reply, and network.</div>
              ) : (
                <div style={{ color: "#7a5050", fontSize: 13, fontFamily: font, textAlign: "center", padding: "8px 0" }}>Only the GroundUp team posts in this channel. Reply in threads to join the discussion.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Thread panel */}
      {thread && (
        <div style={{ width: "min(380px, 100vw)", flexShrink: 0, borderLeft: "1px solid #1a0000", background: "#070303", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a0000", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#f0d8d8", fontWeight: 800, fontSize: 14, fontFamily: font }}>Thread</div>
            <button onClick={() => setThread(null)} style={{ background: "none", border: "none", color: "#8a7070", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px" }}>
            <Message m={thread} inThread onDelete={deleteMsg} canDelete={false} />
            <div style={{ borderTop: "1px solid #1a0000", margin: "10px 0" }} />
            {threadMsgs.map(m => <Message key={m.id} m={m} inThread onDelete={deleteMsg} canDelete={isAdmin || (member && m.user_id === member.id)} />)}
          </div>
          {canEngage ? (
            <form onSubmit={e => { e.preventDefault(); send(thread.id, threadDraft, () => setThreadDraft("")); }} style={{ display: "flex", gap: 8, padding: "12px 14px 16px", borderTop: "1px solid #1a0000" }}>
              <input style={{ ...inp, flex: 1 }} value={threadDraft} onChange={e => setThreadDraft(e.target.value)} placeholder="Reply…" maxLength={4000} />
              <button type="submit" style={{ ...btnRed, padding: "12px 16px" }}>↑</button>
            </form>
          ) : (
            <div style={{ color: "#b8a060", fontSize: 12, fontFamily: font, textAlign: "center", padding: "12px 14px", borderTop: "1px solid #1a0000" }}>Upgrade to Premium to reply.</div>
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
