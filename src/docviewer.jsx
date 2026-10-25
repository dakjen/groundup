// The document viewer: any uploaded file opens here instead of saving straight
// to Downloads. PDFs show inline; Excel renders as a table (SheetJS) and Word
// as formatted text (mammoth), both in the browser from the private file;
// PowerPoint and anything else get the name and a download button. The file
// is fetched with the session, so nothing here is reachable without signing in.
import React, { useEffect, useState } from "react";
import { getMemberToken } from "./member.jsx";

const font = "'DM Sans', sans-serif";
const serif = "'Cormorant Garamond', serif";
const RED = "#b80101";

function niceName(pathname) {
  const raw = (pathname || "").split("/").pop() || "document";
  return raw.replace(/^\d{10,}-/, "").replace(/-[A-Za-z0-9]{20,}(?=\.[A-Za-z0-9]+$)/, "").replace(/_/g, " ");
}

export function DocViewerPage({ setActivePage }) {
  const params = new URLSearchParams(window.location.search);
  const p = params.get("p") || "";
  const back = params.get("from") || "";
  const name = params.get("name") || niceName(p);
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
  const [state, setState] = useState({ status: "loading" });
  const fileUrl = `/api/file?p=${encodeURIComponent(p)}`;

  useEffect(() => {
    let revoke = null;
    (async () => {
      try {
        if (!p) throw new Error("No document named.");
        const r = await fetch(fileUrl, { headers: { Authorization: "Bearer " + getMemberToken() } });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || (r.status === 401 ? "Sign in to open this document." : "Couldn't open this document.")); }
        const blob = await r.blob();
        const objectUrl = URL.createObjectURL(blob); revoke = objectUrl;
        if (ext === "pdf") { setState({ status: "pdf", objectUrl, blob }); return; }
        if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "csv") {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(await blob.arrayBuffer(), { type: "array", cellStyles: false });
          const sheets = wb.SheetNames.map(n => ({ name: n, html: XLSX.utils.sheet_to_html(wb.Sheets[n], { editable: false }) }));
          setState({ status: "sheet", objectUrl, blob, sheets, active: 0 }); return;
        }
        if (ext === "docx") {
          const mammoth = await import("mammoth/mammoth.browser");
          const out = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
          setState({ status: "doc", objectUrl, blob, html: out.value }); return;
        }
        if (/^(png|jpg|jpeg|webp|gif)$/.test(ext)) { setState({ status: "image", objectUrl, blob }); return; }
        setState({ status: "other", objectUrl, blob });
      } catch (e) { setState({ status: "error", error: e.message }); }
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [p]);

  const download = () => {
    if (!state.objectUrl) return;
    const a = document.createElement("a"); a.href = state.objectUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
  const goBack = () => { if (back) { window.location.href = back; return; } if (window.history.length > 1) window.history.back(); else setActivePage("resources"); };

  const btn = { background: RED, color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px", fontFamily: font, fontWeight: 800, fontSize: 13, cursor: "pointer" };
  const ghost = { background: "transparent", color: "#e0c4c4", border: "1px solid #3a1a1a", borderRadius: 10, padding: "11px 18px", fontFamily: font, fontWeight: 700, fontSize: 13, cursor: "pointer" };

  return (
    <div style={{ background: "#000", minHeight: "100vh", padding: "90px clamp(16px,3vw,40px) 60px", color: "#f5e8e8" }}>
      <style>{`
        .dv-sheet table { border-collapse: collapse; font-family: ${font}; font-size: 12.5px; color: #161616; background: #fff; }
        .dv-sheet td, .dv-sheet th { border: 1px solid #d8d2c6; padding: 5px 9px; white-space: nowrap; max-width: 420px; overflow: hidden; text-overflow: ellipsis; }
        .dv-sheet tr:first-child td { font-weight: 700; background: #f3efe7; }
        .dv-doc { background: #fff; color: #161616; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; line-height: 1.7; padding: 48px clamp(20px,6vw,72px); max-width: 860px; margin: 0 auto; border-radius: 8px; }
        .dv-doc h1, .dv-doc h2, .dv-doc h3 { font-family: ${font}; line-height: 1.25; margin: 1.2em 0 0.5em; }
        .dv-doc table { border-collapse: collapse; margin: 12px 0; } .dv-doc td, .dv-doc th { border: 1px solid #ccc; padding: 6px 10px; }
        .dv-doc img { max-width: 100%; }
      `}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <button onClick={goBack} style={{ background: "none", border: "none", color: "#8f7070", cursor: "pointer", fontSize: 13, fontFamily: font, fontWeight: 700, padding: 0 }}>← Back</button>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: "clamp(20px,3vw,28px)", color: "#f5e8e8", flex: "1 1 240px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <span style={{ color: "#8f7070", fontSize: 10, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: font }}>{ext || "file"}{state.blob ? ` · ${(state.blob.size / 1024).toFixed(0)} KB` : ""}</span>
          {state.objectUrl && <button onClick={download} style={btn}>Download</button>}
          {state.status === "pdf" && <a href={state.objectUrl} target="_blank" rel="noreferrer" style={{ ...ghost, textDecoration: "none" }}>Open in a new tab</a>}
        </div>

        {/^(xlsx|xls|xlsm|csv|docx|doc|pptx|ppt)$/.test(ext) && (
          <div style={{ background: "#0d0404", border: "1px solid #b8010140", borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontFamily: font }}>
            <span style={{ color: "#e0c4c4", fontSize: 13.5, flex: "1 1 260px" }}>Need help using this template on your own deal? Set up a call with Dr. Merritt.</span>
            <button onClick={() => setActivePage("contact")} style={{ ...btn, padding: "9px 16px", fontSize: 12.5 }}>Book a session →</button>
          </div>
        )}
        {state.status === "loading" && <div style={{ color: "#8f7070", fontFamily: font, padding: 40, textAlign: "center" }}>Opening…</div>}
        {state.status === "error" && <div style={{ background: "#0d0404", border: "1px solid #b8010140", borderRadius: 14, padding: 28, color: "#e0c4c4", fontFamily: font }}>{state.error}</div>}

        {state.status === "pdf" && <iframe src={state.objectUrl + "#toolbar=0"} title={name} style={{ width: "100%", height: "calc(100vh - 190px)", minHeight: 520, border: "1px solid #2a0000", borderRadius: 12, background: "#fff" }} />}

        {state.status === "sheet" && (
          <div>
            {state.sheets.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {state.sheets.map((sh, i) => <button key={sh.name} onClick={() => setState({ ...state, active: i })} style={{ background: state.active === i ? RED : "#0d0404", color: state.active === i ? "#fff" : "#c8a8a8", border: "1px solid " + (state.active === i ? RED : "#2a0000"), borderRadius: 999, padding: "6px 14px", fontFamily: font, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{sh.name}</button>)}
              </div>
            )}
            <div className="dv-sheet" style={{ overflow: "auto", maxHeight: "calc(100vh - 230px)", border: "1px solid #2a0000", borderRadius: 12, background: "#fff" }} dangerouslySetInnerHTML={{ __html: state.sheets[state.active].html }} />
            <div style={{ color: "#8f7070", fontSize: 12, fontFamily: font, marginTop: 10 }}>A read-only look at the workbook. Formulas, colors and formatting live in the downloaded file.</div>
          </div>
        )}

        {state.status === "doc" && <div className="dv-doc" dangerouslySetInnerHTML={{ __html: state.html }} />}

        {state.status === "image" && <img src={state.objectUrl} alt={name} style={{ maxWidth: "100%", borderRadius: 12, display: "block", margin: "0 auto" }} />}

        {state.status === "other" && (
          <div style={{ background: "#0d0404", border: "1px solid #2a0000", borderRadius: 14, padding: 36, textAlign: "center" }}>
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 24, marginBottom: 8 }}>No preview for this file type.</div>
            <div style={{ color: "#a88888", fontSize: 14, fontFamily: font, marginBottom: 18 }}>Download it and open it in {ext === "pptx" || ext === "ppt" ? "PowerPoint or Keynote" : "the app it was made in"}.</div>
            <button onClick={download} style={btn}>Download {name}</button>
          </div>
        )}
      </div>
    </div>
  );
}
