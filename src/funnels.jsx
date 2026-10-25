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
    headline: ["Nobody hands you", "the map. This is the map."],
    sub: "Affordable housing gets built by people who learned the hard way, one deal at a time, with nobody to call. The Developer's Playbook is thirty years of that work written down in order: what to do, when, and what it costs if you skip it.",
    image: "/opt/nannie-helen.webp", imageAlt: "Nannie Helen at 4800, Washington, DC",
    proof: [["$6B+", "underwritten"], ["8,000+", "units built"], ["30+", "years in the work"]],
    bullets: [
      "Every phase of a deal in order: feasibility, predevelopment, program, acquisition, financing, community, construction, stabilization, compliance",
      "The checklists a developer runs before closing, before construction, and before conversion",
      "What to pay before closing and what can wait — the discipline that keeps a predevelopment budget skinny",
      "Yours to read in the GroundUp portal anytime, tied to your account",
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
    page: "lunch", eyebrow: "A free seat · live Lunch & Learn",
    headline: ["See how a real deal", "actually gets built."],
    sub: "There is no school for this. A live Lunch & Learn is the next best thing: one real project, the real numbers, what went wrong and how it closed, with a developer who has done it for thirty years answering your questions on the call. Normally $39.99. Your first seat is free.",
    image: "/opt/sis-gm-speech.jpg", imageAlt: "A live Lunch & Learn session",
    proof: [["$390M+", "portfolio behind it"], ["116", "apartments on one deal"], ["Live", "Q&A on the call"]],
    bullets: [
      "A full session, not a teaser: the deal, the capital stack, what went wrong and how it closed",
      "Ask your questions live, about your own situation",
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
  call: {
    page: "call", eyebrow: "Free scoping call · 20 minutes",
    headline: ["Tell us what you're building.", "We'll tell you what would actually help."],
    sub: "Before you buy a course, a membership, or an hour of anyone's time, talk to a person. Twenty minutes with the GroundUp team: where your project stands, what's in the way, and an honest read on the next right step — even if that step isn't us.",
    image: "/opt/LIIF-Stills1.jpg", imageAlt: "A finished affordable housing development",
    proof: [["20 min", "on the phone or Zoom"], ["$0", "no card, no pitch"], ["30+ yrs", "of experience behind the answer"]],
    bullets: [
      "A real conversation about your deal or your goal, not a sales script",
      "An honest diagnosis: course, membership, office hours, or time with Dr. Merritt — and which one first",
      "If you need Dr. Merritt directly, you'll arrive at her intake prepared, with the right documents",
      "If you don't, we'll say so and point you somewhere useful",
    ],
    cta: "Book my free call →", priceNote: "Free · 20 minutes · with the GroundUp team", mode: "call", item: "scoping",
    faq: [
      ["Who will I talk to?", "A member of the GroundUp team who knows the curriculum, the memberships and Dr. Merritt's advisory work, and who can tell you which fits where you are."],
      ["Is this a call with Dr. Merritt?", "No. Her time is booked through the Full Project Intake. This call is how you find out whether you need that yet, and how to show up ready if you do."],
      ["What should I bring?", "Whatever you have: a site, a napkin pro forma, a question. That's plenty."],
    ],
    success: { title: "You're on the list.", body: "Check your email for the booking link and pick a time that works. Come with whatever you have." },
  },
  intake: {
    page: "intake", eyebrow: "Full Project Intake · $1,500",
    headline: ["Your whole deal,", "read by someone who has closed them."],
    sub: "Most developers find out what the lender thinks when the lender says no. The Full Project Intake puts your entire project — pro forma, capital stack, site, timeline — in front of thirty years of experience first, and gives you back what you missed and what to do next.",
    image: "/opt/LIIF-Stills1.jpg", imageAlt: "A finished affordable housing development",
    proof: [["$47M", "9410 Hough, Cleveland"], ["$52M", "Beacon Center, DC"], ["3", "capital stacks on one deal"]],
    bullets: [
      "A working session on your actual numbers, not a consultation about development in general",
      "A written read-back: the gaps, the risks, the order of operations from here",
      "Your documents go through a private brief before the call, so the review arrives prepared",
      "The $1,500 credits in full against your first month if you continue on a Senior Advisor retainer",
    ],
    cta: "Book the intake →", priceNote: "$1,500 · one time · credits toward a retainer", mode: "buy", item: "retainer_onboarding",
    faq: [
      ["Who is this for?", "A developer with a deal in motion: a site under control, numbers on paper, a financing question in front of them."],
      ["What happens after I pay?", "You get an account and a link to book the call, then a brief to attach your documents."],
      ["Refund?", "The intake is refundable only at NREUV's discretion. If a session happens with no real deal on the table, any refund is reduced by $550."],
    ],
    success: { title: "You're booked in.", body: "Check your email: we made you a GroundUp account and sent a link to set your password. Once you are in, the first thing you see is the link to pick a time for your intake call." },
  },
};

export function FunnelPage({ offer }) {
  const o = OFFERS[offer];
  const [form, setForm] = useState({ name: "", email: "", website: "", phone: "", stage: "", about: "" });
  const [bookLink, setBookLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(() => { try { return new URLSearchParams(window.location.search).get("success") === "1"; } catch { return false; } });
  const [sessionInfo, setSessionInfo] = useState(null);
  const [seatCode, setSeatCode] = useState(null);
  const [nextSession, setNextSession] = useState(null);
  const [formVisible, setFormVisible] = useState(false);
  // The next live session, on the page before anyone fills anything in
  useEffect(() => { if (o?.page !== "lunch") return; fetch("/api/lunchlearn?next=1").then(r => r.ok ? r.json() : null).then(d => setNextSession(d?.session || null)).catch(() => {}); }, [o?.page]);
  // The sticky button steps aside while the form itself is on screen
  useEffect(() => {
    const el = document.getElementById("fn-form-mobile"); if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setFormVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el); return () => io.disconnect();
  }, [done]);
  const acq = useMemo(() => acquisitionTag(o?.page || "x"), [o?.page]);
  const member = getMember();
  useEffect(() => { window.scrollTo(0, 0); pixel("ViewContent", { content_name: o?.page }); if (done) pixel(o?.mode === "buy" ? "Purchase" : "Lead", { content_name: o?.page, currency: "USD", value: o?.item === "retainer_onboarding" ? 1500 : undefined }); }, [o?.page, done]);
  useEffect(() => { if (member && !form.email) setForm(f => ({ ...f, name: member.name || "", email: member.email || "" })); }, [member?.id]);
  if (!o) return null;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (o.mode === "call") {
        const r = await fetch("/api/lunchlearn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scoping_call", name: form.name, email: form.email, phone: form.phone, stage: form.stage, about: form.about, website: form.website, acquisition: acq }) });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong");
        setBookLink(d.link || null); setDone(true); pixel("Lead", { content_name: o.page }); pixel("Schedule", { content_name: o.page });
        try { history.replaceState(null, "", window.location.pathname + "?success=1"); } catch {}
      } else if (o.mode === "lead") {
        const r = await fetch("/api/lunchlearn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "free_seat", name: form.name, email: form.email, website: form.website, acquisition: acq }) });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong");
        setSessionInfo(d.session || null); setSeatCode(d.code || null); setDone(true); pixel("Lead", { content_name: o.page });
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
      {seatCode && (
        <div style={{ marginTop: 16, background: "#120808", border: "1px dashed #b8010180", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 9.5, color: RED, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>Your seat code</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <code style={{ color: "#f5e8e8", fontSize: 22, letterSpacing: "2px", fontWeight: 700 }}>{seatCode}</code>
            <button onClick={() => { try { navigator.clipboard.writeText(seatCode); } catch {} }} style={{ background: "none", border: "1px solid #3a1a1a", color: "#e0c4c4", borderRadius: 8, padding: "6px 12px", fontFamily: font, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Copy</button>
          </div>
          <ol style={{ color: "#c8a8a8", fontSize: 13.5, fontFamily: font, lineHeight: 1.7, margin: "10px 0 0", paddingLeft: 18 }}>
            <li>Create your free account at <a href="/?join=Free" style={{ color: "#e08a8a", fontWeight: 700 }}>community.drginamerritt.net</a></li>
            <li>Open Lunch & Learns and enter the code</li>
            <li>RSVP to the session. The link arrives once you hold the seat.</li>
          </ol>
        </div>
      )}
      {bookLink && <a href={bookLink} target="_blank" rel="noreferrer" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none", marginTop: 16, boxSizing: "border-box" }}>Pick a time →</a>}
      <a href="/" style={{ display: "inline-block", marginTop: 16, color: "#e08a8a", fontFamily: font, fontWeight: 800, fontSize: 13, textDecoration: "none" }}>See everything else inside GroundUp →</a>
    </div>
  ) : (
    <form onSubmit={submit} id="funnel-form" style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 18, padding: compact ? "20px 18px" : "28px", display: "grid", gap: 12 }}>
      {o.priceNote && <div style={{ color: "#e0c4c4", fontSize: 13, fontFamily: font, fontWeight: 800, letterSpacing: "0.5px" }}>{o.priceNote}</div>}
      <input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name" required maxLength={120} autoComplete="name" />
      <input style={inp} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" required maxLength={200} autoComplete="email" inputMode="email" />
      {o.mode === "call" && (<>
        <input style={inp} type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" maxLength={40} autoComplete="tel" inputMode="tel" />
        <select style={{ ...inp, cursor: "pointer" }} value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} required>
          <option value="">Where are you right now?</option>
          <option>Just getting started — learning the business</option>
          <option>Have a site or an idea, no numbers yet</option>
          <option>Have numbers, need financing figured out</option>
          <option>Deal in motion — need an experienced read</option>
          <option>Already developing — want to go bigger</option>
        </select>
        <textarea style={{ ...inp, resize: "vertical" }} rows={3} value={form.about} onChange={e => setForm({ ...form, about: e.target.value })} placeholder="What are you building, and what's in the way? A sentence or two is fine." maxLength={2000} />
      </>)}
      <input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, opacity: 0, height: 0 }} aria-hidden="true" />
      {err && <div style={{ color: "#ff6b6b", fontSize: 13, fontFamily: font }}>{err}</div>}
      <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? "One moment…" : o.cta}</button>
      <div style={{ color: "#8a7070", fontSize: 11.5, fontFamily: font, lineHeight: 1.6, textAlign: "center" }}>{o.mode === "buy" ? "Secure checkout by Stripe. Your email becomes your GroundUp account." : o.mode === "call" ? "No card. We reply within one business day." : "No card. One code, one seat, yours."}</div>
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
          <span style={{ color: "#8a7070", fontSize: 11, fontFamily: font, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" }}>{o.mode === "buy" ? "Secure checkout" : o.mode === "call" ? "Free call" : "Free seat"}</span>
        </div>

        <div className="fn-hero">
          <div>
            <div style={{ fontSize: 10.5, color: RED, fontWeight: 800, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font }}>{o.eyebrow}</div>
            <h1 className="fn-h1">{o.headline[0]}<br /><span style={{ color: "#e0c4c4", fontStyle: "italic", fontWeight: 600 }}>{o.headline[1]}</span></h1>
            <p style={{ color: "#c8a8a8", fontSize: 16.5, fontFamily: font, lineHeight: 1.75, margin: 0, maxWidth: 520 }}>{o.sub}</p>
            {o.page === "lunch" && nextSession?.date && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 16, background: "#120808", border: "1px solid #b8010160", borderRadius: 999, padding: "8px 14px 8px 10px" }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: RED, display: "inline-block" }} />
                <span style={{ color: "#f0d8d8", fontSize: 13, fontFamily: font, fontWeight: 800 }}>Next session: {new Date(nextSession.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}{nextSession.time ? ` · ${nextSession.time} ET` : ""}</span>
              </div>
            )}
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
              <img src="/GM Headshot.webp" alt="Dr. Gina Merritt" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 32, objectFit: "cover", flexShrink: 0 }} />
              <div>
                <div style={{ color: "#f5e8e8", fontFamily: font, fontWeight: 800, fontSize: 14 }}>Built by a working developer</div>
                <div style={{ color: "#8f7070", fontFamily: font, fontSize: 12.5, lineHeight: 1.6 }}>GroundUp is taught by Dr. Gina Merritt: thirty years in affordable housing, a $390M+ portfolio across DC, Baltimore and Cleveland, and $6B+ underwritten. Every lesson comes from a deal that closed.</div>
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
        <div className="fn-sticky" style={{ display: formVisible || done ? "none" : undefined }}>
          <button onClick={() => { const el = document.getElementById("fn-form-mobile"); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); const i = el.querySelector("input"); if (i) setTimeout(() => i.focus(), 400); } }} style={{ ...btn, padding: "15px 20px" }}>
            {o.cta}{o.priceNote ? <span style={{ fontWeight: 600, opacity: 0.85 }}> · {o.priceNote.split(" · ")[0]}</span> : null}
          </button>
        </div>
      )}
    </div>
  );
}
