// Funnel Leads (team portal). Everyone who came in through a funnel page: the
// free Lunch & Learn seat, the year pass, the scoping call, the Full Project
// Intake, the Playbook, and the Get Started quiz. What they came for, how far
// they got, and what they have done since (Dakotah, Nov 20, 2026).
import { useEffect, useState } from "react";

const font = "'DM Sans', sans-serif";
const serif = "'Cormorant Garamond', serif";

export const CAME_FOR = {
  free_seat: { label: "Free Lunch & Learn seat", short: "Free seat", price: "Free" },
  year_pass: { label: "Lunch & Learn year pass", short: "Year pass", price: "$99.99" },
  scoping_call: { label: "Free scoping call", short: "Scoping call", price: "Free" },
  intake: { label: "Full Project Intake", short: "Intake", price: "$1,500" },
  playbook: { label: "The Playbook", short: "Playbook", price: "" },
  quiz: { label: "Get Started quiz", short: "Quiz", price: "Free" },
};
const STATUS = {
  signed_up: { label: "Signed up", color: "#555555", bg: "#efefef" },
  started_payment: { label: "Started payment, didn't finish", color: "#9a5b00", bg: "#fff3dc" },
  paid: { label: "Paid", color: "#13703a", bg: "#e3f6e9" },
};
const TIER_NAME = { Basic: "Member", Builder: "Builder", Premium: "Premium", Elite: "Owner", Partner: "Partner" };
const when = (d) => d ? new Date(d).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
// "ad:direct:lunch" / "fb:spring:lunch" → where they came from, in words
const fromWhere = (acq) => {
  if (!acq) return "Not recorded";
  const parts = String(acq).split(":");
  if (parts[0] === "direct") return "Direct link (no ad tag)";
  if (parts.length > 1) return `${parts[0]} · ${parts.slice(1).join(" · ")}`;
  return acq;
};
const STAGE_KEYS = [["phone", "Phone"], ["stage", "Where they are"], ["about", "What they told us"], ["read", "Quiz read"]];

export default function FunnelLeadsPage() {
  const [leads, setLeads] = useState(null);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  useEffect(() => {
    fetch("/api/lunchlearn?funnel=1", { headers: { Authorization: "Bearer " + (sessionStorage.getItem("adminToken") || localStorage.getItem("guToken") || "") } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Couldn't load funnel leads")))
      .then(d => setLeads(d.leads || []))
      .catch(e => { setErr(e.message); setLeads([]); });
  }, []);

  const all = leads || [];
  const counts = all.reduce((m, l) => { m[l.came_for] = (m[l.came_for] || 0) + 1; return m; }, {});
  const shown = filter === "all" ? all : filter === "unpaid" ? all.filter(l => l.status === "started_payment") : all.filter(l => l.came_for === filter);
  const people = new Set(all.map(l => l.email)).size;
  const becameMembers = new Set(all.filter(l => l.tier && l.tier !== "Free" && l.membership_status === "active").map(l => l.email)).size;

  const csv = () => {
    const rows = shown.map(l => [l.name, l.email, (CAME_FOR[l.came_for] || {}).label || l.came_for, (STATUS[l.status] || {}).label || l.status, when(l.created_at), fromWhere(l.acquisition),
      l.details?.phone || "", l.details?.stage || "", l.details?.about || "", l.details?.read || "",
      l.user_id ? "Yes" : "No", l.tier && l.tier !== "Free" ? (TIER_NAME[l.tier] || l.tier) : "", l.rsvps || 0]);
    const out = [["Name", "Email", "Came for", "Status", "Date (ET)", "Came from", "Phone", "Where they are", "What they told us", "Quiz read", "Has account", "Member plan", "Lunch & Learn RSVPs"], ...rows]
      .map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([out], { type: "text/csv" })); a.download = "funnel-leads.csv"; a.click();
  };

  const chip = (key, label, n) => (
    <button key={key} onClick={() => setFilter(key)} style={{ background: filter === key ? "#b80101" : "#ffffff", color: filter === key ? "#ffffff" : "#444444", border: "1px solid " + (filter === key ? "#b80101" : "#e0d8cc"), borderRadius: 99, padding: "7px 14px", fontFamily: font, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
      {label}{n !== undefined ? ` · ${n}` : ""}
    </button>
  );

  return (
    <div>
      <div style={{ fontSize: 10, color: "#b80101", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>Team</div>
      <h1 style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(30px,4.5vw,42px)", color: "#161616", margin: "0 0 8px" }}>Funnel Leads</h1>
      <p style={{ color: "#666666", fontSize: 13.5, fontFamily: font, lineHeight: 1.7, margin: "0 0 18px", maxWidth: 640 }}>
        Everyone who came in through a funnel page (the free Lunch &amp; Learn seat, the year pass, the scoping call, the Full Project Intake, the Playbook, or the Get Started quiz). What they came for, how far they got, and whether they have made an account, RSVPed, or become a member since.
      </p>

      {leads === null ? (
        <div style={{ color: "#9a9a9a", fontSize: 13, fontFamily: font }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[["People", people], ["Free seats", counts.free_seat || 0], ["Started payment, didn't finish", all.filter(l => l.status === "started_payment").length], ["Became members", becameMembers]].map(([t, n]) => (
              <div key={t} style={{ background: "#ffffff", border: "1px solid #e6e0d6", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 10.5, color: "#8a8a8a", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", fontFamily: font, marginBottom: 6 }}>{t}</div>
                <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 28, color: "#161616", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{n}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" }}>
            {chip("all", "Everyone", all.length)}
            {Object.keys(CAME_FOR).filter(k => counts[k]).map(k => chip(k, CAME_FOR[k].short, counts[k]))}
            {all.some(l => l.status === "started_payment") && chip("unpaid", "Didn't finish paying", all.filter(l => l.status === "started_payment").length)}
            {shown.length > 0 && <button onClick={csv} style={{ marginLeft: "auto", background: "none", border: "1px solid #e0d8cc", color: "#444444", borderRadius: 8, padding: "7px 12px", fontFamily: font, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Download CSV</button>}
          </div>

          {err && <div style={{ color: "#b80101", fontSize: 13, fontFamily: font, marginBottom: 12 }}>{err}</div>}
          {shown.length === 0 ? (
            <div style={{ background: "#ffffff", border: "1px solid #e6e0d6", borderRadius: 12, padding: 32, textAlign: "center", color: "#9a9a9a", fontSize: 13, fontFamily: font }}>No funnel leads here yet.</div>
          ) : shown.map(l => {
            const cf = CAME_FOR[l.came_for] || { label: l.came_for };
            const st = STATUS[l.status] || STATUS.signed_up;
            const member = l.tier && l.tier !== "Free" && l.membership_status === "active";
            const isOpen = open === l.id;
            const extra = STAGE_KEYS.filter(([k]) => l.details?.[k]);
            const answers = Array.isArray(l.details?.answers) ? l.details.answers : [];
            return (
              <div key={l.id} style={{ background: "#ffffff", border: "1px solid " + (isOpen ? "#b8010150" : "#e6e0d6"), borderRadius: 12, padding: "14px 16px", marginBottom: 8 }}>
                <div onClick={() => setOpen(isOpen ? null : l.id)} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "8px 14px", cursor: "pointer" }}>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ color: "#161616", fontSize: 15, fontWeight: 800, fontFamily: font }}>{l.name || "(no name)"} <span style={{ color: "#9a9a9a", fontSize: 11, display: "inline-block", transform: isOpen ? "rotate(180deg)" : "none" }}>▾</span></div>
                    <div style={{ color: "#777777", fontSize: 12.5, fontFamily: font, overflowWrap: "anywhere" }}>{l.email}</div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <span style={{ background: "#fbeaea", color: "#8a0000", fontSize: 11.5, fontWeight: 800, fontFamily: font, borderRadius: 99, padding: "4px 10px" }}>{cf.label}{cf.price ? ` · ${cf.price}` : ""}</span>
                    <span style={{ background: st.bg, color: st.color, fontSize: 11.5, fontWeight: 800, fontFamily: font, borderRadius: 99, padding: "4px 10px" }}>{st.label}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 8, color: "#666666", fontSize: 12, fontFamily: font }}>
                  <span>{when(l.created_at)}</span>
                  <span>From: {fromWhere(l.acquisition)}</span>
                  <span>{member ? <strong style={{ color: "#13703a" }}>Member · {TIER_NAME[l.tier] || l.tier}</strong> : l.user_id ? "Has an account, no plan" : "No account"}</span>
                  {l.rsvps > 0 && <span>RSVPed to {l.rsvps} Lunch &amp; Learn{l.rsvps === 1 ? "" : "s"}</span>}
                </div>
                {isOpen && (
                  <div style={{ borderTop: "1px solid #eee7dd", marginTop: 12, paddingTop: 12, display: "grid", gap: 8 }}>
                    {extra.length === 0 && answers.length === 0 && <div style={{ color: "#9a9a9a", fontSize: 12.5, fontFamily: font }}>This page only asked for their name and email.</div>}
                    {extra.map(([k, t]) => (
                      <div key={k} style={{ fontSize: 13, fontFamily: font, lineHeight: 1.6 }}><span style={{ color: "#8a8a8a", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", fontSize: 10.5 }}>{t}</span><br /><span style={{ color: "#222222", whiteSpace: "pre-wrap" }}>{l.details[k]}</span></div>
                    ))}
                    {answers.map((a, i) => (
                      <div key={i} style={{ fontSize: 12.5, fontFamily: font, lineHeight: 1.6 }}><span style={{ color: "#8a8a8a" }}>{a.q}</span><br /><strong style={{ color: "#222222" }}>{a.a}</strong></div>
                    ))}
                    {l.status === "started_payment" && <div style={{ color: "#9a5b00", fontSize: 12.5, fontFamily: font }}>They opened the payment page on {when(l.updated_at)} and did not finish.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
