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
    headline: ["The guide experienced developers", "keep to themselves."],
    sub: "Thirty years and $2B of deals worked on, written down as a working reference: what has to be true at construction closing, which draws the lender inspects, how the equity pay-in meets the construction loan, what cost certification needs before the final capital contribution, the conditions precedent to conversion. The judgment that is not in any QAP or textbook, organized so you can open the phase you are in and find it. Developers who have it do not usually share it.",
    image: "/opt/nannie-helen.webp", imageAlt: "Nannie Helen at 4800, Washington, DC",
    proof: [["$6B+", "underwritten"], ["8,000+", "units built"], ["30+", "years in the work"]],
    bullets: [
      "Organized to be looked up, not read once: nine phases in execution order, from site control and the predevelopment draw schedule through year fifteen",
      "The pre-closing, pre-construction and pre-conversion checklists, as run on 9410 Hough (fourteen sources) and the Beacon Center (three closings, one building)",
      "The judgment that is not in any QAP: what goes hard and when, how far to carry drawings before the stack is committed, what to concede to a lender and what never to",
      "Always current in your GroundUp account. When the practice changes, the page changes, and you have the new one",
    ],
    // Not on sale yet (no playbook product exists). "soon" mode shows a
    // coming-soon card in place of the buy form and points at the waitlist.
    cta: "Coming soon", priceNote: "Coming soon · the working reference for developers with deals in motion", mode: "soon", item: "playbook",
    faq: [
      ["Who is this for?", "Developers who have been to at least one closing, and the owner's reps, lenders and syndicators who work beside them. It assumes you know what basis, DSCR and a conversion test are, and it is built to make you better at them."],
      ["How do I use it?", "Like a reference. You do not read it front to back; you open the phase you are in and run the checklist. Before a closing, before a draw, before conversion, before the next hard conversation."],
      ["Is it a download?", "It lives in your GroundUp account and you read it there, so it stays current. Owner members can also download it."],
      ["Do I need a membership?", "No. Once it is out you can buy it on its own. If you join later, it is already in your account."],
      ["Refunds?", "Digital products are non-refundable once access is delivered."],
    ],
    success: { title: "The Playbook is yours.", body: "Check your email: we made you a GroundUp account and sent a link to set your password. The Playbook is waiting under Shop → My documents. Open it to the phase you are in." },
  },
  lunch: {
    page: "lunch", eyebrow: "A free seat · live Lunch & Learn",
    headline: ["An hour on one topic,", "with someone who has done it."],
    sub: "Each live Lunch & Learn takes one subject a working developer actually struggles with: sizing the gap when credit pricing moves, what a lender will and will not give on a construction loan, structuring a JV so your guarantee is protected, reading a QAP for score. Dr. Gina Merritt works it through from deals she has closed, then takes your questions on your own situation. For people who already know the vocabulary and need the judgment. Normally $39.99. Your first seat is free.",
    image: "/opt/hough-exterior.webp", imageAlt: "9410 Hough, Cleveland — a real deal, taken apart live",
    proof: [["$2B+", "in deals behind the advice"], ["1 hr", "one topic, live"], ["Q&A", "on your situation"]],
    bullets: [
      "One topic per session, taught from real closings, with the numbers that go with it",
      "Bring your own situation. The Q&A is for your deal: your gap, your term sheet, your partner question",
      "The recording is yours after",
      "Attend and get 25% off your first month if you ever join GroundUp",
    ],
    cta: "Save my free seat →", priceNote: "Free · normally $39.99", mode: "lead", item: "lnl",
    faq: [
      ["Who is this for?", "Developers who have been through at least part of a deal, and the lenders, syndicators and consultants who work with them. Sessions assume you know what a capital stack, a QAP and a conversion are. If you are new to the work, the courses are the better door."],
      ["What are the topics?", "They change each session and are posted on the Lunch & Learn page: financing, structuring, entitlements, construction, operations. The next session's topic is in its title."],
      ["Is it really free?", "Yes. You get a one-time code by email, create a free account, enter the code, and RSVP. No card."],
      ["When is it?", "Dates are on the Lunch & Learn page once you are in. Sessions run about an hour, 11 AM Eastern, on Zoom."],
      ["What if I can't make it live?", "RSVP anyway. The recording is sent to everyone who held a seat."],
    ],
    success: { title: "Your seat is saved.", body: "Your code is on its way by email, with the three steps to claim it. Check your inbox (and the promotions tab)." },
  },
  call: {
    page: "call", eyebrow: "Free scoping call · 20 minutes",
    headline: ["You have a deal and a decision.", "Get it in front of the right expertise."],
    sub: "A gap that opened when pricing moved. A lender conditioning the construction loan on more equity. A JV partner's decision rights against your guarantee. A 9% application you are not sure scores. These are not introductory questions, and they do not get answered by a course. Twenty minutes with the GroundUp team sizes the problem and routes it: office hours with Dr. Merritt, a Senior Advisor retainer, or her Full Project Intake on the whole deal.",
    image: "/opt/beacon-center.webp", imageAlt: "The Beacon Center, Washington, DC",
    proof: [["$2B+", "in deals behind the advice"], ["20 min", "to size the problem"], ["$0", "no card, no pitch"]],
    bullets: [
      "A working conversation about the deal: the stack, the term, the partner, the application, whatever is stuck",
      "A read on the level of help it needs: office hours, a Senior Advisor retainer, or the Full Project Intake with Dr. Merritt",
      "If it is the intake, you arrive prepared: pro forma, sources and uses, term sheets and the LP agreement she will read first",
      "If it is smaller than that, we say so",
    ],
    cta: "Book my free call →", priceNote: "Free · 20 minutes · with the GroundUp team", mode: "call", item: "scoping",
    faq: [
      ["Who is this for?", "Developers with a deal in motion, or a specific decision in front of them. If you are at the start, the courses and the free Lunch & Learn are the better door."],
      ["Who will I talk to?", "A member of the GroundUp team who works alongside Dr. Merritt's advisory practice and can tell you which level of help fits the problem."],
      ["Is this a call with Dr. Merritt?", "No. Her time is booked through the Full Project Intake and the Senior Advisor retainer. This call is how you get to her prepared, or find out you do not need to yet."],
      ["What should I bring?", "Your pro forma, your sources and uses, the lender's term sheet or the investor's LOI, and the specific question. Whatever the problem lives in."],
    ],
    success: { title: "You're on the list.", body: "Check your email for the booking link and pick a time that works. Come with whatever you have." },
  },
  intake: {
    page: "intake", eyebrow: "Full Project Intake · $1,500",
    headline: ["Your whole deal,", "read by someone who has closed them."],
    sub: "Most developers find out what the lender thinks when the lender says no. The Full Project Intake puts your entire project — pro forma, capital stack, site, timeline — in front of thirty years of experience first, and gives you back what you missed and what to do next.",
    image: "/opt/beacon-center.webp", imageAlt: "The Beacon Center, Washington, DC",
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

  const inp = { width: "100%", boxSizing: "border-box", background: "#120808", border: "1px solid #3a1a1a", borderRadius: 10, padding: "13px 14px", color: "#f5e8e8", fontFamily: font, fontSize: 15, outline: "none" };
  const btn = { width: "100%", background: RED, color: "#fff", border: "none", borderRadius: 10, padding: "15px 18px", fontFamily: font, fontWeight: 800, fontSize: 15, cursor: "pointer", letterSpacing: "0.2px" };
  const formBlock = (compact) => o.mode === "soon" ? (
    <div style={{ background: "#0b0505", border: "1px solid #b8010160", borderRadius: 14, padding: compact ? "20px 18px" : "24px 22px" }}>
      <div style={{ fontSize: 9.5, color: RED, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", fontFamily: font, marginBottom: 8 }}>Coming soon</div>
      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 24, color: "#f5e8e8", marginBottom: 8 }}>The Playbook is not on sale yet.</div>
      <div style={{ color: "#c8a8a8", fontSize: 14.5, fontFamily: font, lineHeight: 1.7 }}>It is being finished for launch. Join the GroundUp waitlist and you will hear the day it is out, with first access.</div>
      <a href="/" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none", marginTop: 16, boxSizing: "border-box" }}>Join the waitlist →</a>
    </div>
  ) : done ? (
    <div style={{ background: "#0b0505", border: "1px solid #22c55e50", borderRadius: 14, padding: compact ? "20px 18px" : "24px 22px" }}>
      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 24, color: "#f5e8e8", marginBottom: 8 }}>{o.success.title}</div>
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
    <form onSubmit={submit} id="funnel-form" style={{ background: "#0b0505", border: "1px solid #241010", borderRadius: 14, padding: compact ? "18px 16px" : "22px", display: "grid", gap: 10 }}>
      {o.priceNote && <div style={{ color: "#d9bcbc", fontSize: 12.5, fontFamily: font, fontWeight: 800, letterSpacing: "0.3px" }}>{o.priceNote}</div>}
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
        .fn-wrap { max-width: 980px; margin: 0 auto; padding: 0 24px 100px; }
        .fn-top { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid #1c0b0b; }
        .fn-hero { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr); gap: 44px; align-items: start; padding: 40px 0 28px; }
        .fn-img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 14px; display: block; border: 1px solid #241010; }
        .fn-eyebrow { font-family: ${font}; font-size: 10px; color: ${RED}; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; }
        .fn-h1 { font-family: ${serif}; font-weight: 700; font-size: 40px; line-height: 1.1; margin: 10px 0 14px; letter-spacing: -0.2px; text-wrap: balance; max-width: 18ch; }
        .fn-sub { color: #b9a3a3; font-size: 15.5px; font-family: ${font}; line-height: 1.7; margin: 0; max-width: 56ch; }
        .fn-proof { display: flex; gap: 0; margin: 20px 0 22px; border: 1px solid #241010; border-radius: 12px; overflow: hidden; background: #0b0505; }
        .fn-proof > div { flex: 1; padding: 12px 14px; border-left: 1px solid #241010; }
        .fn-proof > div:first-child { border-left: none; }
        .fn-proof b { display: block; font-family: ${serif}; font-weight: 700; font-size: 22px; color: #f5e8e8; line-height: 1.05; }
        .fn-proof span { display: block; color: #8f7070; font-size: 10px; font-family: ${font}; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px; }
        .fn-card { background: #0b0505; border: 1px solid #241010; border-radius: 14px; padding: 20px 22px; }
        .fn-label { font-family: ${font}; font-size: 10px; color: ${RED}; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px; }
        .fn-two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; margin-top: 8px; }
        .fn-sticky { display: none; }
        @media (max-width: 920px) {
          .fn-hero { grid-template-columns: 1fr; gap: 24px; padding: 28px 0 16px; }
          .fn-img { aspect-ratio: 16 / 9; }
          .fn-h1 { font-size: 34px; max-width: none; }
        }
        @media (max-width: 760px) {
          .fn-wrap { padding: 0 18px 120px; }
          .fn-hero { padding: 20px 0 8px; gap: 18px; }
          .fn-img { aspect-ratio: 4 / 3; border-radius: 12px; }
          .fn-h1 { font-size: 29px; }
          .fn-sub { font-size: 15px; }
          .fn-proof > div { padding: 10px 8px; } .fn-proof b { font-size: 19px; } .fn-proof span { font-size: 9px; letter-spacing: .8px; }
          .fn-two { grid-template-columns: 1fr; gap: 14px; }
          .fn-desktop-form { display: none; }
          .fn-byline { display: none; }
          .fn-sticky { display: block; position: fixed; left: 0; right: 0; bottom: 0; padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); background: rgba(0,0,0,0.92); backdrop-filter: blur(12px); border-top: 1px solid #241010; z-index: 205; }
        }
      `}</style>
      <div className="fn-wrap">
        <div className="fn-top">
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <img src="/gu-icon-red.png" alt="" width={24} height={24} style={{ display: "block" }} />
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 16, color: "#fff", letterSpacing: "1px" }}>GROUNDUP</span>
            <span className="fn-byline" style={{ fontFamily: font, fontWeight: 700, fontSize: 8.5, letterSpacing: "1.8px", textTransform: "uppercase", color: "#9a7e7e", whiteSpace: "nowrap" }}>by Dr. Gina Merritt</span>
          </a>
          <span style={{ color: "#7a6060", fontSize: 10, fontFamily: font, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" }}>{o.mode === "buy" ? "Secure checkout" : o.mode === "call" ? "Free call" : "Free seat"}</span>
        </div>

        <div className="fn-hero">
          <div>
            <div className="fn-eyebrow">{o.eyebrow}</div>
            <h1 className="fn-h1">{o.headline[0]} <span style={{ color: "#d9bcbc", fontStyle: "italic", fontWeight: 500 }}>{o.headline[1]}</span></h1>
            <p className="fn-sub">{o.sub}</p>
            {o.page === "lunch" && nextSession?.date && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 16, background: "#120808", border: "1px solid #b8010160", borderRadius: 999, padding: "8px 14px 8px 10px" }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: RED, display: "inline-block" }} />
                <span style={{ color: "#f0d8d8", fontSize: 13, fontFamily: font, fontWeight: 800 }}>Next session: {new Date(nextSession.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}{nextSession.time ? ` · ${nextSession.time} ET` : ""}</span>
              </div>
            )}
            <div className="fn-proof">
              {o.proof.map(([n, l]) => (<div key={l}><b>{n}</b><span>{l}</span></div>))}
            </div>
            <div className="fn-desktop-form">{formBlock(false)}</div>
          </div>
          <img className="fn-img" src={o.image} alt={o.imageAlt} />
        </div>

        <div className="fn-two">
          <div className="fn-card">
            <div className="fn-label">What you get</div>
            {o.bullets.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: i ? "1px solid #1a0b0b" : "none" }}>
                <span style={{ color: RED, fontWeight: 800, fontFamily: font, flexShrink: 0, fontSize: 13, lineHeight: 1.7 }}>→</span>
                <span style={{ color: "#dcc9c9", fontSize: 14, fontFamily: font, lineHeight: 1.65 }}>{b}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <div className="fn-card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <img src="/GM Headshot.webp" alt="Dr. Gina Merritt" width={56} height={56} style={{ width: 56, height: 56, borderRadius: 28, objectFit: "cover", flexShrink: 0 }} />
              <div>
                <div style={{ color: "#f5e8e8", fontFamily: font, fontWeight: 800, fontSize: 13.5 }}>Built by a working developer</div>
                <div style={{ color: "#8f7070", fontFamily: font, fontSize: 12.5, lineHeight: 1.6 }}>Dr. Gina Merritt: thirty years in affordable housing, $2B of deals worked on, a $390M+ ownership pipeline across DC, Baltimore and Cleveland, $6B+ underwritten. Every lesson comes from a deal that closed.</div>
              </div>
            </div>
            <div className="fn-card">
              {o.faq.map(([q, a], i) => (
                <div key={i} style={{ padding: "9px 0", borderTop: i ? "1px solid #1a0b0b" : "none" }}>
                  <div style={{ color: "#f0d8d8", fontFamily: font, fontWeight: 800, fontSize: 13.5, marginBottom: 3 }}>{q}</div>
                  <div style={{ color: "#a08585", fontFamily: font, fontSize: 13, lineHeight: 1.65 }}>{a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div id="fn-form-mobile" style={{ marginTop: 20 }}>{formBlock(true)}</div>
        <div style={{ color: "#5a4040", fontSize: 11, fontFamily: font, textAlign: "center", marginTop: 28, lineHeight: 1.7, borderTop: "1px solid #1c0b0b", paddingTop: 18 }}>© {new Date().getFullYear()} GroundUp by Dr. Gina Merritt · Northern Real Estate Urban Ventures · <a href="/terms" style={{ color: "#7a5a5a" }}>Terms</a> · <a href="/privacy" style={{ color: "#7a5a5a" }}>Privacy</a></div>
      </div>

      {!done && o.mode !== "soon" && (
        <div className="fn-sticky" style={{ display: formVisible || done ? "none" : undefined }}>
          <button onClick={() => { const el = document.getElementById("fn-form-mobile"); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); const i = el.querySelector("input"); if (i) setTimeout(() => i.focus(), 400); } }} style={{ ...btn, padding: "15px 20px" }}>
            {o.cta}{o.priceNote ? <span style={{ fontWeight: 600, opacity: 0.85 }}> · {o.priceNote.split(" · ")[0]}</span> : null}
          </button>
        </div>
      )}
    </div>
  );
}
