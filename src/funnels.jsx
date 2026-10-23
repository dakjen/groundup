// Ad funnels: one page, one offer, one button. No nav, no footer, nothing to
// wander off to. Built phone-first — the button rides along at the bottom of
// the screen — and each page sells something real: the Playbook (read in the
// portal), a free seat at the next live Lunch & Learn, or the Full Project
// Intake. Buying needs only an email; the purchase makes the account.
import React, { useEffect, useMemo, useState } from "react";
import { getMember, getMemberToken } from "./member.jsx";

const font = "'DM Sans', sans-serif";
const serif = "'Cormorant Garamond', serif";
const RED = "#b80101";

// Everything we know about where this visitor came from, kept for the whole visit
export function acquisitionTag(page) {
  try {
    const q = new URLSearchParams(window.location.search);
    const parts = [q.get("utm_source"), q.get("utm_campaign") || q.get("utm_content")].filter(Boolean);
    const key = "guAcq:" + page;
    if (parts.length) sessionStorage.setItem(key, parts.join(":").slice(0, 80));
    const saved = sessionStorage.getItem(key);
    return (saved ? saved + ":" : "direct:") + page;
  } catch { return "direct:" + page; }
}
const pixel = (event, data) => { try { if (typeof window.fbq === "function") window.fbq("track", event, data || {}); } catch {} };

const OFFERS = {
  playbook: {
    page: "playbook", eyebrow: "The Developer's Playbook",
    headline: ["The playbook Dr. Merritt", "actually uses."],
    sub: "Thirty years, billions underwritten, 8,000+ units built — written down as the step-by-step she follows on every deal. Read it in your GroundUp account, from the first site walk to the fifteen-year compliance clock.",
    image: "/opt/nannie-helen.webp", imageAlt: "Nannie Helen at 4800, Washington, DC",
    proof: [["$6B+", "underwritten"], ["8,000+", "units built"], ["30+", "years in the work"]],
    bullets: [
      "Every phase of a deal in order: feasibility, predevelopment, program, acquisition, financing, community, construction, stabilization, compliance",
      "The checklists she runs before closing, before construction, and before conversion",
      "What to pay before closing and what can wait — the discipline that keeps a predevelopment budget skinny",
      "Yours to read in the portal anytime, tied to your account",
    ],
    cta: "Get the Playbook →", priceNote: null, mode: "buy", item: "playbook",
    faq: [
      ["Is it a download?", "It opens in your GroundUp account and you read it there, like a book on a shelf you own. Owner members can download it; everyone else reads it in the portal."],
      ["Do I need a membership?", "No. Buy it on its own. If you join later, it is already in your account."],
      ["Refunds?", "Digital products are non-refundable once access is delivered."],
    ],
    success: { title: "The Playbook is yours.", body: "Check your email: we made you a GroundUp account and sent a link to set your password. The Playbook is waiting under Shop → My documents." },
  },
  lunch: {
    page: "lunch", eyebrow: "A free seat · live with Dr. Gina Merritt",
    headline: ["Watch a real deal", "get taken apart. Live."],
    sub: "One live session with Dr. Merritt — the real numbers from a real project, and your questions answered on the call. Normally $39.99. Your first seat is on us.",
    image: "/opt/sis-gm-speech.jpg", imageAlt: "Dr. Gina Merritt speaking",
    proof: [["$390M+", "portfolio"], ["116", "apartments at 9410 Hough"], ["Live", "Q&A on the call"]],
    bullets: [
      "A full session, not a teaser: the deal, the capital stack, what went wrong and how it closed",
      "Ask Dr. Merritt directly during the live Q&A",
      "The recording is yours after",
      "Attend and get 25% off your first month if you ever join GroundUp",
    ],
    cta: "Save my free seat →", priceNote: "Free · normally $39.99", mode: "lead", item: "lnl",
    faq: [
      ["Is it really free?", "Yes. You get a one-time code by email, create a free account, enter the code, and RSVP. No card."],
      ["When is it?", "Dates are on the Lunch & Learn page once you are in. Sessions run about an hour, 11 AM Eastern, on Zoom."],
      ["What if I can't make it live?", "RSVP anyway. The recording is sent to everyone who held a seat."],
    ],
    success: { title: "Your seat is saved.", body: "Your code is on its way by email, with the three steps to claim it. Check your inbox (and the promotions tab)." },
  },
  intake: {
    page: "intake", eyebrow: "Full Project Intake · $1,500",
    headline: ["Put your whole deal", "in front of Dr. Merritt."],
    sub: "Pro forma, capital stack, site, timeline — she takes in the entire project and tells you what you missed, what the lender will say, and what to do next. For developers with a live deal.",
    image: "/opt/LIIF-Stills1.jpg", imageAlt: "Dr. Gina Merritt outside a finished development",
    proof: [["$47M", "9410 Hough, Cleveland"], ["$52M", "Beacon Center, DC"], ["3", "capital stacks on one deal"]],
    bullets: [
      "A working session on your actual numbers, not a consultation about development in general",
      "A written read-back: the gaps, the risks, the order of operations from here",
      "Your documents go through a private brief before the call, so she arrives prepared",
      "The $1,500 credits in full against your first month if you continue on a Senior Advisor retainer",
    ],
    cta: "Book the intake →", priceNote: "$1,500 · one time · credits toward a retainer", mode: "buy", item: "retainer_onboarding",
    faq: [
      ["Who is this for?", "A developer with a deal in motion: a site under control, numbers on paper, a financing question in front of them."],
      ["What happens after I pay?", "You get an account and a link to book the call on Dr. Merritt's calendar, then a brief to attach your documents."],
      ["Refund?", "The intake is refundable only at NREUV's discretion. If a session happens with no real deal on the table, any refund is reduced by $550."],
    ],
    success: { title: "You're booked in.", body: "Check your email: we made you a GroundUp account and sent a link to set your password. Once you are in, the first thing you see is the link to pick a time with Dr. Merritt." },
  },
};

export function FunnelPage({ offer }) {
  const o = OFFERS[offer];
  const [form, setForm] = useState({ name: "", email: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(() => { try { return new URLSearchParams(window.location.search).get("success") === "1"; } catch { return false; } });
  const [sessionInfo, setSessionInfo] = useState(null);
  const acq = useMemo(() => acquisitionTag(o?.page || "x"), [o?.page]);
  const member = getMember();
  useEffect(() => { window.scrollTo(0, 0); pixel("ViewContent", { content_name: o?.page }); if (done) pixel(o?.mode === "buy" ? "Purchase" : "Lead", { content_name: o?.page, currency: "USD", value: o?.item === "retainer_onboarding" ? 1500 : undefined }); }, [o?.page, done]);
  useEffect(() => { if (member && !form.email) setForm(f => ({ ...f, name: member.name || "", email: member.email || "" })); }, [member?.id]);
  if (!o) return null;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (o.mode === "lead") {
        const r = await fetch("/api/lunchlearn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "free_seat", name: form.name, email: form.email, website: form.website, acquisition: acq }) });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong");
        setSessionInfo(d.session || null); setDone(true); pixel("Lead", { content_name: o.page });
        try { history.replaceState(null, "", window.location.pathname + "?success=1"); } catch {}
      } else {
        pixel("InitiateCheckout", { content_name: o.page });
        const r = await fetch("/api/stripe", { method: "POST", headers: { "Content-Type": "application/json", ...(getMemberToken() ? { Authorization: "Bearer " + getMemberToken() } : {}) }, body: JSON.stringify({ action: "guest_checkout", item: o.item, name: form.name, email: form.email, acquisition: acq }) });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Checkout failed");
        window.location.href = d.url;
      }
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  const inp = { width: "100%", boxSizing: "border-box", background: "#120808", border: "1px solid #3a1a1a", borderRadius: 12, padding: "15px 16px", color: "#f5e8e8", fontFamily: font, fontSize: 16, outline: "none" };
  const btn = { width: "100%", background: RED, color: "#fff", border: "none", borderRadius: 12, padding: "17px 20px", fontFamily: font, fontWeight: 800, fontSize: 16, cursor: "pointer", letterSpacing: "0.2px" };
  const formBlock = (compact) => done ? (
    <div style={{ background: "#0d0404", border: "1px solid #22c55e50", borderRadius: 18, padding: compact ? "22px 20px" : "30px 28px" }}>
      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, color: "#f5e8e8", marginBottom: 8 }}>{o.success.title}</div>
      <div style={{ color: "#c8a8a8", fontSize: 14.5, fontFamily: font, lineHeight: 1.7 }}>{o.success.body}{sessionInfo?.date ? ` Next session: ${sessionInfo.title}, ${new Date(sessionInfo.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${sessionInfo.time ? " · " + sessionInfo.time + " ET" : ""}.` : ""}</div>
      <a href="/" style={{ display: "inline-block", marginTop: 16, color: "#e08a8a", fontFamily: font, fontWeight: 800, fontSize: 13, textDecoration: "none" }}>See everything else inside GroundUp →</a>
    </div>
  ) : (
    <form onSubmit={submit} id="funnel-form" style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 18, padding: compact ? "20px 18px" : "28px", display: "grid", gap: 12 }}>
      {o.priceNote && <div style={{ color: "#e0c4c4", fontSize: 13, fontFamily: font, fontWeight: 800, letterSpacing: "0.5px" }}>{o.priceNote}</div>}
      <input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name" required maxLength={120} autoComplete="name" />
      <input style={inp} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" required maxLength={200} autoComplete="email" inputMode="email" />
      <input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, opacity: 0, height: 0 }} aria-hidden="true" />
      {err && <div style={{ color: "#ff6b6b", fontSize: 13, fontFamily: font }}>{err}</div>}
      <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? "One moment…" : o.cta}</button>
      <div style={{ color: "#8a7070", fontSize: 11.5, fontFamily: font, lineHeight: 1.6, textAlign: "center" }}>{o.mode === "buy" ? "Secure checkout by Stripe. Your email becomes your GroundUp account." : "No card. One code, one seat, yours."}</div>
    </form>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, overflowY: "auto", background: "#000", color: "#f5e8e8", WebkitOverflowScrolling: "touch" }}>
      <style>{`
        .fn-wrap { max-width: 1040px; margin: 0 auto; padding: 0 20px 120px; }
        .fn-hero { display: grid; grid-template-columns: 1.1fr 1fr; gap: 40px; align-items: center; padding: 48px 0 24px; }
        .fn-img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 22px; display: block; border: 1px solid #2a0000; }
        .fn-h1 { font-family: ${serif}; font-weight: 700; font-size: clamp(38px, 6.5vw, 64px); line-height: 1.02; margin: 12px 0 16px; letter-spacing: -0.5px; }
        .fn-proof { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 22px 0; }
        .fn-two { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; margin-top: 8px; }
        .fn-sticky { display: none; }
        @media (max-width: 760px) {
          .fn-wrap { padding: 0 16px 140px; }
          .fn-hero { grid-template-columns: 1fr; gap: 18px; padding: 16px 0 8px; }
          .fn-img { aspect-ratio: 4 / 3; border-radius: 16px; }
          .fn-two { grid-template-columns: 1fr; gap: 18px; }
          .fn-desktop-form { display: none; }
          .fn-byline { display: none; }
          .fn-sticky { display: block; position: fixed; left: 0; right: 0; bottom: 0; padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); background: rgba(0,0,0,0.92); backdrop-filter: blur(12px); border-top: 1px solid #2a0000; z-index: 205; }
        }
      `}</style>
      <div className="fn-wrap">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0 0" }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <img src="/gu-icon-red.png" alt="" width={28} height={28} style={{ display: "block" }} />
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: "#fff", letterSpacing: "1px" }}>GROUNDUP</span>
            <span className="fn-byline" style={{ fontFamily: font, fontWeight: 700, fontSize: 8.5, letterSpacing: "1.8px", textTransform: "uppercase", color: "#c8a8a8", whiteSpace: "nowrap" }}>by Dr. Gina Merritt</span>
          </a>
          <span style={{ color: "#8a7070", fontSize: 11, fontFamily: font, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" }}>{o.mode === "buy" ? "Secure checkout" : "Free seat"}</span>
        </div>

        <div className="fn-hero">
          <div>
            <div style={{ fontSize: 10.5, color: RED, fontWeight: 800, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font }}>{o.eyebrow}</div>
            <h1 className="fn-h1">{o.headline[0]}<br /><span style={{ color: "#e0c4c4", fontStyle: "italic", fontWeight: 600 }}>{o.headline[1]}</span></h1>
            <p style={{ color: "#c8a8a8", fontSize: 16.5, fontFamily: font, lineHeight: 1.75, margin: 0, maxWidth: 520 }}>{o.sub}</p>
            <div className="fn-proof">
              {o.proof.map(([n, l]) => (
                <div key={l} style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
                  <div style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(22px, 5vw, 30px)", color: "#f5e8e8", lineHeight: 1 }}>{n}</div>
                  <div style={{ color: "#8f7070", fontSize: 10, fontFamily: font, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", marginTop: 6 }}>{l}</div>
                </div>
              ))}
            </div>
            <div className="fn-desktop-form">{formBlock(false)}</div>
          </div>
          <img className="fn-img" src={o.image} alt={o.imageAlt} />
        </div>

        <div className="fn-two">
          <div style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 18, padding: "24px 22px" }}>
            <div style={{ fontSize: 10, color: RED, fontWeight: 800, letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>What you get</div>
            {o.bullets.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: i ? "1px solid #1a0a0a" : "none" }}>
                <span style={{ color: RED, fontWeight: 800, fontFamily: font, flexShrink: 0 }}>→</span>
                <span style={{ color: "#e2cfcf", fontSize: 14.5, fontFamily: font, lineHeight: 1.65 }}>{b}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", background: "#0d0404", border: "1px solid #2a0000", borderRadius: 18, padding: "18px 20px", marginBottom: 18 }}>
              <img src="/opt/gina-9410.webp" alt="Dr. Gina Merritt" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 32, objectFit: "cover", flexShrink: 0 }} />
              <div>
                <div style={{ color: "#f5e8e8", fontFamily: font, fontWeight: 800, fontSize: 14 }}>Dr. Gina Merritt</div>
                <div style={{ color: "#8f7070", fontFamily: font, fontSize: 12.5, lineHeight: 1.6 }}>Raised in the Bronx. From public housing to a $390M+ portfolio across DC, Baltimore and Cleveland. Howard, Darden MBA, USC doctorate. Founder, Northern Real Estate Urban Ventures.</div>
              </div>
            </div>
            <div style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 18, padding: "20px 22px" }}>
              {o.faq.map(([q, a], i) => (
                <div key={i} style={{ padding: "10px 0", borderTop: i ? "1px solid #1a0a0a" : "none" }}>
                  <div style={{ color: "#f0d8d8", fontFamily: font, fontWeight: 800, fontSize: 13.5, marginBottom: 4 }}>{q}</div>
                  <div style={{ color: "#a88888", fontFamily: font, fontSize: 13, lineHeight: 1.65 }}>{a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div id="fn-form-mobile" style={{ marginTop: 22 }}>{formBlock(true)}</div>
        <div style={{ color: "#5a4040", fontSize: 11, fontFamily: font, textAlign: "center", marginTop: 26, lineHeight: 1.7 }}>© {new Date().getFullYear()} GroundUp by Dr. Gina Merritt · Northern Real Estate Urban Ventures · <a href="/terms" style={{ color: "#7a5a5a" }}>Terms</a> · <a href="/privacy" style={{ color: "#7a5a5a" }}>Privacy</a></div>
      </div>

      {!done && (
        <div className="fn-sticky">
          <button onClick={() => { const el = document.getElementById("fn-form-mobile"); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); const i = el.querySelector("input"); if (i) setTimeout(() => i.focus(), 400); } }} style={{ ...btn, padding: "15px 20px" }}>
            {o.cta}{o.priceNote ? <span style={{ fontWeight: 600, opacity: 0.85 }}> · {o.priceNote.split(" · ")[0]}</span> : null}
          </button>
        </div>
      )}
    </div>
  );
}
