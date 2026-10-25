// "Get started": a diagnostic for people who don't know what kind of help they
// need. Eight questions, scored into one of six honest outcomes — from "you
// don't need us yet" up to a Senior Advisor retainer. The answers travel with
// the lead when they book a scoping call, so the team arrives prepared.
import React, { useEffect, useMemo, useState } from "react";
import { getMember } from "./member.jsx";

const font = "'DM Sans', sans-serif";
const serif = "'Cormorant Garamond', serif";
const RED = "#b80101";

// Each option carries a few signals: k = knowledge need, d = a live deal, m = money/financing stuck, p = wants people/community, t = wants time with Dr. Merritt
const QUESTIONS = [
  { id: "who", q: "Which is closest to you?", opts: [
    ["I want to become a developer", { k: 2 }],
    ["I'm a working developer", { d: 1 }],
    ["I own or inherited a property and don't know what to do with it", { k: 2, d: 1 }],
    ["I'm a house flipper or small landlord moving into ground-up development", { k: 1, d: 1 }],
    ["I work at a nonprofit, CDFI, bank, agency or city", { k: 1, p: 1, o: 1 }],
    ["I work alongside developers — broker, architect, attorney, consultant", { k: 1, p: 1, o: 1 }],
    ["I'm not in real estate at all — just exploring", { k: 3, n: 1 }],
  ] },
  { id: "where", q: "Where are you right now?", opts: [
    ["I'm not in real estate development — just exploring", { k: 4, n: 1 }],
    ["Curious — I want to understand how development works", { k: 3 }],
    ["I have a site, a property or an idea, but no numbers", { k: 2, d: 1 }],
    ["I have numbers and I'm trying to get financing lined up", { d: 2, m: 2 }],
    ["I have a deal in motion and a decision in front of me", { d: 3, m: 2, t: 2 }],
    ["I've developed before and want to go bigger or do it better", { d: 2, k: 1, t: 1 }],
    ["I'm not developing — I need to understand development to do my job", { k: 2, p: 1, o: 1 }],
  ] },
  { id: "first", q: "If you haven't started yet: what's your first move?", opts: [
    ["I honestly don't know where to start", { k: 3 }],
    ["Learn the whole process end to end before I touch anything", { k: 3 }],
    ["Find my first site", { k: 2, d: 1 }],
    ["Find a partner who has done this before", { p: 3 }],
    ["Figure out the money first — how deals get paid for", { k: 2, m: 1 }],
    ["I've already started — this question isn't for me", {}],
    ["I'm not looking to develop — I support or work with developers", { k: 1, o: 1 }],
  ] },
  { id: "done", q: "How close have you been to a development deal that closed?", opts: [
    ["Never — I'm new to this", { k: 2 }],
    ["I've watched one from the outside", { k: 1 }],
    ["I've been part of a team or organization that did one", { k: 1 }],
    ["I've closed one or two myself", { d: 1 }],
    ["I've closed several", { d: 1, t: 1 }],
  ] },
  { id: "control", q: "Do you control a site?", opts: [
    ["No", { k: 1 }],
    ["I'm looking, or talking to an owner", { k: 1, d: 1 }],
    ["Letter of intent, option or contract", { d: 2 }],
    ["I own it", { d: 2 }],
    ["Not mine to control — I work with the people who do", { k: 1, o: 1 }],
  ] },
  { id: "numbers", q: "What do your numbers look like?", opts: [
    ["I don't have any yet", { k: 2 }],
    ["A back-of-envelope budget", { k: 1, d: 1 }],
    ["A pro forma I built myself", { d: 1, m: 1 }],
    ["A full pro forma with sources and uses — and a gap I can't close", { d: 2, m: 3, t: 1 }],
    ["A full pro forma a lender has already seen", { d: 2, m: 2, t: 2 }],
    ["Not my numbers — I need to read other people's pro formas with confidence", { k: 2, o: 1 }],
  ] },
  { id: "stuck", q: "What's most in the way right now?", opts: [
    ["I don't know what I don't know", { k: 3 }],
    ["Understanding the financing: LIHTC, subsidy, the capital stack", { k: 2, m: 2 }],
    ["Finding partners, a team, or people who've done this", { p: 3 }],
    ["A specific problem on my deal that I need an experienced read on", { d: 2, t: 3 }],
    ["Money — a gap, a lender's answer, a term I'm weighing", { m: 3, d: 1, t: 1 }],
    ["Speaking the language — I sit across from developers and need to keep up", { k: 2, p: 1, o: 1 }],
  ] },
  { id: "time", q: "How much time can you give this each week?", opts: [
    ["An hour or two — I'm learning on the side", { k: 1 }],
    ["Several hours — this is a real pursuit", { k: 1, p: 1 }],
    ["It's my job, or about to be", { d: 1, t: 1 }],
    ["It's part of my job — development is what my organization funds, approves or serves", { k: 1, p: 1, o: 1 }],
  ] },
  { id: "help", q: "What kind of help do you want?", opts: [
    ["Teach me — I'll do the work", { k: 3 }],
    ["Teach me and put me in a room with people doing it", { k: 2, p: 2 }],
    ["Answer my questions, live, now and then", { p: 1, t: 2 }],
    ["Work with me on my deal, one on one", { t: 3, d: 1 }],
    ["Honestly, I'm not sure", { k: 1, p: 1 }],
    ["Train my team or my organization", { k: 1, p: 1, o: 2 }],
  ] },
  { id: "horizon", q: "When does something have to happen?", opts: [
    ["No clock — I'm building toward it", { k: 1 }],
    ["This year", { d: 1 }],
    ["In the next ninety days", { d: 2, t: 1 }],
    ["It's on fire", { d: 2, t: 2, m: 1 }],
    ["No deal of my own — I just need to be fluent in this, soon", { k: 1, o: 1 }],
  ] },
];

// The seven honest outcomes, in order of how much help they are
export const OUTCOMES = {
  notyet: { key: "notyet", eyebrow: "Our honest read", title: "You don't need to buy anything yet.", body: "You're not in the work yet, and that's fine — everyone starts there. Begin with the free parts: every course outline, one free live Lunch & Learn, and the glossary. The moment you have a site, a number, or a real question, come back and take this again.", cta: ["Make a free account", "/?join=Free"], alt: ["Read the course outlines", "/courses"] },
  org: { key: "org", eyebrow: "Our honest read", title: "You're not building — you need to be fluent in how building works.", body: "Lenders, agencies, nonprofits, brokers and the people around a deal do better work when they understand the developer's side of the table. GroundUp teaches that whole process in order. A Member plan covers one person; the partner program brings a cohort of your staff or your program's developers through together, with their own channel and office hours.", cta: ["Bring GroundUp to your organization", "/partner-interest"], alt: ["Start with a Member plan", "/pricing"] },
  learn: { key: "learn", eyebrow: "Our honest read", title: "Learn the whole process first — then act.", body: "You're smart to want the map before the trip. The Member plan opens every course and written lesson, the case studies and the worksheets. Go stage by stage, and the deal you eventually do will look nothing like the one you'd do today.", cta: ["See the Member plan", "/pricing"], alt: ["Browse the curriculum", "/courses"] },
  room: { key: "room", eyebrow: "Our honest read", title: "You need the courses and the room.", body: "You're past curious: you have something real and you need people who've done it. Builder puts you in the community — post, ask, find partners — with every course and the Lunch & Learn recording library behind you.", cta: ["See the Builder plan", "/pricing"], alt: ["Talk to the team first", "/go/call"] },
  premium: { key: "premium", eyebrow: "Our honest read", title: "Learning plus live time with Dr. Merritt.", body: "Your questions are specific now, and a course answers them halfway. Premium adds office hours with Dr. Merritt, the Opportunity Board, the premium channels and one included session a year. For a developer with a live project, this is the sweet spot.", cta: ["See the Premium plan", "/pricing"], alt: ["Talk to the team first", "/go/call"] },
  owner: { key: "owner", eyebrow: "Our honest read", title: "You're an Owner: direct access, downloads, three calls a year.", body: "You're working deals and you need a line to someone who has closed them. Owner gives you direct messages to Dr. Merritt and the team, the Developer's Playbook to download, three advisory calls a year and the Owner lounge.", cta: ["See the Owner plan", "/pricing"], alt: ["Talk to the team first", "/go/call"] },
  advisory: { key: "advisory", eyebrow: "Our honest read", title: "This is advisory work — a deal with a decision in front of it.", body: "A course won't do it and a message won't do it. Your deal needs an experienced read of the actual numbers, then someone in your corner month to month. The path: a free scoping call with the team, then the Full Project Intake with Dr. Merritt, then a Senior Advisor retainer if the deal warrants it.", cta: ["Book a free scoping call", "/go/call"], alt: ["Read about the intake", "/contact"] },
};

export function scoreAnswers(answers) {
  const base = scoreBase(answers);
  let o = 0; for (const q of QUESTIONS) { const i = answers[q.id]; if (i != null) o += q.opts[i][1].o || 0; }
  if (o >= 4) return OUTCOMES.org;
  return o > 0 && base.key !== "advisory" ? { ...base, alt: ["Bring GroundUp to your organization", "/partner-interest"] } : base;
}
function scoreBase(answers) {
  const s = { k: 0, d: 0, m: 0, p: 0, t: 0, n: 0, o: 0 };
  for (const q of QUESTIONS) { const i = answers[q.id]; if (i == null) continue; const w = q.opts[i][1]; for (const [key, v] of Object.entries(w)) s[key] += v; }
  // Advisory: a live deal, money on the line, and a wish for one-on-one time
  if (s.d >= 7 && s.t >= 6 && s.m >= 4) return OUTCOMES.advisory;
  if (s.t >= 6 && s.d >= 5) return OUTCOMES.owner;
  if (s.t >= 4 || (s.m >= 5 && s.d >= 4)) return OUTCOMES.premium;
  if (s.p >= 4 || (s.d >= 4 && s.k <= 6)) return OUTCOMES.room;
  // "Not yet" is the floor, and rare: only someone outside the business with
  // no deal in sight, or someone who answered every question as a complete
  // beginner. Anyone with a site, a number or a question is a Member.
  if (s.d === 0 && s.t === 0 && s.m === 0 && (s.n > 0 || (s.k >= 14 && s.p === 0))) return OUTCOMES.notyet;
  return OUTCOMES.learn;
}

export function GetStartedPage({ setActivePage, onSignIn }) {
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [lead, setLead] = useState({ name: "", email: "", website: "" });
  const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const member = getMember();
  useEffect(() => { window.scrollTo(0, 0); }, [step, done]);
  useEffect(() => { if (member && !lead.email) setLead(l => ({ ...l, name: member.name || "", email: member.email || "" })); }, [member?.id]);
  const result = useMemo(() => done ? scoreAnswers(answers) : null, [done, answers]);
  const q = QUESTIONS[step];
  const pick = (i) => {
    const next = { ...answers, [q.id]: i }; setAnswers(next);
    if (step < QUESTIONS.length - 1) setStep(step + 1); else setDone(true);
  };
  const go = (href) => {
    if (href.startsWith("/?join=")) { onSignIn && onSignIn(); return; }
    const page = href.replace(/^\//, "");
    if (page.startsWith("go/")) { window.location.href = href; return; }
    setActivePage(page || "home");
  };
  const summary = () => QUESTIONS.map(x => answers[x.id] != null ? `${x.q} ${x.opts[answers[x.id]][0]}` : null).filter(Boolean).join("\n");
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/lunchlearn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scoping_call", name: lead.name, email: lead.email, website: lead.website, stage: `Diagnostic: ${result.key}`, about: summary(), acquisition: "get-started" }) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong");
      setSent(true);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  const inp = { width: "100%", boxSizing: "border-box", background: "#120808", border: "1px solid #3a1a1a", borderRadius: 12, padding: "14px 16px", color: "#f5e8e8", fontFamily: font, fontSize: 15, outline: "none" };
  const btn = { background: RED, color: "#fff", border: "none", borderRadius: 12, padding: "15px 24px", fontFamily: font, fontWeight: 800, fontSize: 15, cursor: "pointer" };
  const ghost = { background: "transparent", color: "#e0c4c4", border: "1px solid #3a1a1a", borderRadius: 12, padding: "15px 24px", fontFamily: font, fontWeight: 800, fontSize: 15, cursor: "pointer" };

  return (
    <div style={{ background: "#000", minHeight: "100vh", padding: "110px clamp(20px,5vw,80px) 90px", color: "#f5e8e8" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ fontSize: 10, color: RED, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", fontFamily: font, marginBottom: 12 }}>Get started</div>
        {!done ? (
          <>
            <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(32px,5vw,46px)", lineHeight: 1.08, margin: "0 0 10px" }}>What kind of help do you actually need?</h1>
            <p style={{ color: "#a88888", fontSize: 15, fontFamily: font, lineHeight: 1.75, maxWidth: 560, margin: "0 0 28px" }}>Ten quick questions. At the end we tell you honestly: nothing yet, a course, a membership, live time with Dr. Merritt, or one-on-one advisory work. No email required to see the answer.</p>
            <div style={{ display: "flex", gap: 4, marginBottom: 26 }}>
              {QUESTIONS.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? RED : "#2a0000" }} />)}
            </div>
            <div style={{ color: "#8f7070", fontSize: 11, fontFamily: font, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 8 }}>{step + 1} of {QUESTIONS.length}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(24px,4vw,32px)", lineHeight: 1.15, margin: "0 0 18px" }}>{q.q}</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {q.opts.map(([label], i) => (
                <button key={i} onClick={() => pick(i)} style={{ textAlign: "left", background: answers[q.id] === i ? "#2a0a0a" : "#0d0404", border: "1px solid " + (answers[q.id] === i ? RED : "#2a0000"), borderRadius: 14, padding: "16px 18px", color: "#f0d8d8", fontFamily: font, fontSize: 15.5, lineHeight: 1.5, cursor: "pointer" }}>{label}</button>
              ))}
            </div>
            {step > 0 && <button onClick={() => setStep(step - 1)} style={{ background: "none", border: "none", color: "#8f7070", cursor: "pointer", fontSize: 13, fontFamily: font, fontWeight: 700, padding: "18px 0 0" }}>← Back</button>}
          </>
        ) : (
          <>
            <div style={{ fontSize: 10, color: "#8f7070", fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", fontFamily: font, marginBottom: 10 }}>{result.eyebrow}</div>
            <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(32px,5vw,48px)", lineHeight: 1.08, margin: "0 0 14px" }}>{result.title}</h1>
            <p style={{ color: "#c8a8a8", fontSize: 16, fontFamily: font, lineHeight: 1.8, margin: "0 0 26px" }}>{result.body}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 36 }}>
              <button onClick={() => go(result.cta[1])} style={btn}>{result.cta[0]} →</button>
              <button onClick={() => go(result.alt[1])} style={ghost}>{result.alt[0]}</button>
            </div>
            <div style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 18, padding: "24px 24px" }}>
              {sent ? (
                <>
                  <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 24, marginBottom: 6 }}>Got it. We'll be in touch.</div>
                  <div style={{ color: "#c8a8a8", fontSize: 14, fontFamily: font, lineHeight: 1.7 }}>Your answers went to the team with your request. Check your email for the booking link.</div>
                </>
              ) : (
                <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22 }}>Want a human to check this read?</div>
                  <div style={{ color: "#a88888", fontSize: 13.5, fontFamily: font, lineHeight: 1.7, marginBottom: 4 }}>Twenty free minutes with the GroundUp team. Your answers come with you, so we start where you are.</div>
                  <input style={inp} value={lead.name} onChange={e => setLead({ ...lead, name: e.target.value })} placeholder="Your name" required maxLength={120} autoComplete="name" />
                  <input style={inp} type="email" value={lead.email} onChange={e => setLead({ ...lead, email: e.target.value })} placeholder="Email" required maxLength={200} autoComplete="email" inputMode="email" />
                  <input value={lead.website} onChange={e => setLead({ ...lead, website: e.target.value })} tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, opacity: 0, height: 0 }} aria-hidden="true" />
                  {err && <div style={{ color: "#ff6b6b", fontSize: 13, fontFamily: font }}>{err}</div>}
                  <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? "One moment…" : "Book a free scoping call →"}</button>
                </form>
              )}
            </div>
            <button onClick={() => { setDone(false); setStep(0); setAnswers({}); setSent(false); }} style={{ background: "none", border: "none", color: "#8f7070", cursor: "pointer", fontSize: 13, fontFamily: font, fontWeight: 700, padding: "22px 0 0" }}>Start over</button>
          </>
        )}
      </div>
    </div>
  );
}
