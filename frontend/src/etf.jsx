// Admin → Control Tower → 📀 ETF analyser (owner, 2026-11-06: "in the admin panel an ETF section at the last, before the
// algo trading signals … that shows all the real data, why it is picked and all"). The ETFs never appear in any other
// admin or customer screen (scanner/funds.py); this section reads them from their own store: GET /api/snapshots/{id}/etf
// (backend/app/etf.py) for the newest collection on screen.
import React from "react";
import * as XLSX from "xlsx";
const { useState, useEffect, useMemo, useContext } = React;

export const EtfSnapCtx = React.createContext(null);           // the collection id the Control Tower shows (newest)

const TFS = ["M", "Q", "Y"];
const TF_NAME = { M: "Monthly", Q: "Quarterly", Y: "Yearly" };
const PLACE = { ABOVE_TOP: "above", IN_TOP_BAND: "near top", INSIDE: "inside", IN_BOTTOM_BAND: "near bottom", BELOW_BOTTOM: "below", NO_DATA: "—" };
const inr = v => v == null ? "—" : v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : `₹${Math.round(v).toLocaleString("en-IN")}`;
const qty = v => v == null ? "—" : v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : Math.round(v).toLocaleString("en-IN");
const sgn = v => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
const col = v => v == null ? "var(--t3)" : v >= 24 ? "var(--long)" : v <= -24 ? "var(--short)" : "var(--t2)";
const reg = v => v === 1 ? "▲ up" : v === -1 ? "▼ down" : v === 0 ? "◆ flat" : "—";
const nr = v => !v ? "" : v > 0 ? `BO ${v}` : `BD ${-v}`;

const card = { background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 10 };
const TH = { position: "sticky", top: 0, background: "var(--s2)", borderBottom: "1px solid var(--b1)", padding: "6px 8px", fontSize: 9, fontWeight: 700,
             textTransform: "uppercase", letterSpacing: ".4px", color: "var(--t3)", textAlign: "left", whiteSpace: "nowrap", zIndex: 1 };
const TD = { padding: "6px 8px", borderBottom: "1px solid var(--b1)", fontSize: 11.5, verticalAlign: "middle", whiteSpace: "nowrap" };
const sel = { background: "var(--s2)", border: "1px solid var(--b2)", color: "var(--t1)", borderRadius: 6, fontSize: 11.5, padding: "4px 6px" };
const btn = on => ({ ...sel, cursor: "pointer", fontWeight: 600, ...(on ? { borderColor: "var(--acc)", color: "var(--acc)" } : {}) });

function Detail({ r, wide }) {
  const box = { ...card, padding: "10px 12px", background: "var(--s2)" };
  const h = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--t3)", marginBottom: 6, letterSpacing: ".4px" };
  const kv = (k, v) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, padding: "2px 0" }}><span style={{ color: "var(--t2)" }}>{k}</span><b style={{ fontFamily: "var(--mono)" }}>{v}</b></div>;
  const hist = (lab, a) => kv(lab, a && a.some(x => x) ? a.map(x => qty(x)).join(" · ") : "—");
  return (
    <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)", gap: 10, padding: "10px 12px 14px", background: "var(--bg)" }}>
      <div style={{ ...box, ...(wide ? { gridColumn: "1 / -1" } : {}) }}>
        <div style={h}>Timeframes — zone, trend T, position P, strength</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead><tr>{["TF", "Zone bottom – top", "Place", "Steps (newest first)", "T", "P", "Strength raw → after regime", "Mother candle"].map(x => <th key={x} style={{ ...TH, position: "static" }}>{x}</th>)}</tr></thead>
          <tbody>{TFS.map(tf => { const t = r.tf[tf] || {}; return (
            <tr key={tf}><td style={TD}><b>{TF_NAME[tf]}</b></td>
              <td style={{ ...TD, fontFamily: "var(--mono)" }}>{t.bottom ?? "—"} – {t.top ?? "—"}</td>
              <td style={TD}>{PLACE[t.place] || t.place || "—"}</td>
              <td style={{ ...TD, fontFamily: "var(--mono)" }}>{t.steps && t.steps.length ? t.steps.join(" · ") : "—"}</td>
              <td style={{ ...TD, fontFamily: "var(--mono)" }}>{t.T ?? "—"}</td>
              <td style={{ ...TD, fontFamily: "var(--mono)" }}>{t.P ?? "—"}</td>
              <td style={{ ...TD, fontFamily: "var(--mono)" }}><span style={{ color: col(t.raw) }}>{sgn(t.raw)}</span> → <b style={{ color: col(t.st) }}>{sgn(t.st)}</b></td>
              <td style={TD}>{nr(t.nr) || "—"}</td></tr>); })}</tbody>
        </table>
        <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 6, lineHeight: 1.5 }}>Timeframe strength = 100 × (0.6 T + 0.4 P) ± mother candle points; stock strength = Q 50 · Y 30 · M 20
          (missing ones left out). A timeframe against the monthly regime is squeezed into sideways. Same engine as the stocks.</div>
      </div>
      <div style={box}>
        <div style={h}>Trading (volume analyser)</div>
        {kv("Dependable units a day", qty(r.dep))}{kv("Normal units a day", qty(r.norm))}{kv("₹ traded a day", inr(r.value))}
        {kv("Liquidity", r.grade || "—")}{kv("Volume trend", r.vtrend === 1 ? "rising" : r.vtrend === -1 ? "falling" : r.vtrend === 0 ? "steady" : "—")}
        {kv("Spike today / this week", r.spike ? "yes" : "no")}{kv("Erratic month to month", r.erratic ? "yes" : "no")}
        {hist("Last 4 weeks (a day)", r.wk)}{hist("Last 4 months", r.mo)}{hist("Last 4 quarters", r.qt)}{hist("Last 4 years", r.yrs)}
        {kv("History", r.years ? `${r.years} years` : "—")}{kv("Reliability", r.health || "—")}
      </div>
      <div style={box}>
        <div style={h}>Recommended — why / why not</div>
        {(r.checks || []).map(c => (
          <div key={c.k} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 11.5, padding: "3px 0" }}>
            <b style={{ color: c.ok ? "var(--long)" : "var(--short)", width: 12 }}>{c.ok ? "✓" : "✗"}</b>
            <span style={{ flex: 1, color: "var(--t2)" }}>{c.label}</span><b style={{ fontFamily: "var(--mono)" }}>{c.v}</b>
          </div>))}
        <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.5, color: r.rec ? "var(--acc)" : "var(--t2)" }}>{r.rec ? `★ ${r.why}` : r.why_not || ""}</div>
        <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--t3)", lineHeight: 1.5 }}>Rule: the most traded ETF of its underlying among those trading ≥ ₹1 Cr a day steadily; within 10 % of the top, the longer history wins.</div>
      </div>
    </div>);
}

export function EtfSection() {
  const sid = useContext(EtfSnapCtx);
  const [d, setD] = useState(null), [err, setErr] = useState("");
  const [cls, setCls] = useState("all"), [und, setUnd] = useState("all"), [q, setQ] = useState(""), [recOnly, setRecOnly] = useState(false);
  const [open, setOpen] = useState(null), [sort, setSort] = useState("group");
  useEffect(() => {
    if (!sid) return;
    let stop = false; setD(null); setErr("");
    fetch(`/api/snapshots/${sid}/etf`, { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : r.json().catch(() => ({})).then(j => { throw new Error(j.detail || `Error ${r.status}`); }))
      .then(j => !stop && setD(j)).catch(e => !stop && setErr(e.message));
    return () => { stop = true; };
  }, [sid]);
  const rows = (d && d.rows) || [];
  const unds = useMemo(() => {                                   // class → underlyings, the most traded group first
    const tot = {};
    for (const r of rows) { const k = `${r.cls}|${r.u}`; tot[k] = (tot[k] || 0) + (r.value || 0); }
    return ((d && d.classes) || []).map(c => [c, Object.keys(tot).filter(k => k.startsWith(c + "|")).sort((a, b) => tot[b] - tot[a]).map(k => k.slice(c.length + 1))])
      .filter(([c, us]) => us.length && (cls === "all" || c === cls));
  }, [rows, cls, d]);
  useEffect(() => { if (!open) return; const k = e => e.key === "Escape" && setOpen(null); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  const cur = open && rows.find(r => r.s === open);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = rows.filter(r => (cls === "all" || r.cls === cls) && (und === "all" || r.u === und) && (!recOnly || r.rec)
      && (!n || `${r.s} ${r.n} ${r.u}`.toLowerCase().includes(n)));
    const order = (d && d.classes) || [];
    return out.sort(sort === "strength" ? (a, b) => (b.st ?? -999) - (a.st ?? -999)
      : sort === "value" ? (a, b) => (b.value || 0) - (a.value || 0)
      : (a, b) => order.indexOf(a.cls) - order.indexOf(b.cls) || a.u.localeCompare(b.u) || (b.rec - a.rec) || (a.rank || 99) - (b.rank || 99));
  }, [rows, cls, und, q, recOnly, sort, d]);
  const xlsx = () => {
    const flat = list.map(r => ({ Symbol: r.s, Name: r.n, Class: r.cls, Underlying: r.u, Recommended: r.rec ? "Yes" : "", Why: r.why || r.why_not || "",
      Price: r.p, "Change %": r.c, Strength: r.st, "Strength before regime": r.st_raw, "Weekly regime": r.reg_w, "Monthly regime": r.reg_m,
      ...Object.fromEntries(TFS.flatMap(tf => { const t = r.tf[tf] || {}; return [[`${tf} zone bottom`, t.bottom], [`${tf} zone top`, t.top], [`${tf} place`, t.place],
        [`${tf} T`, t.T], [`${tf} P`, t.P], [`${tf} strength raw`, t.raw], [`${tf} strength`, t.st], [`${tf} mother candle`, t.nr]]; })),
      "Dependable units/day": r.dep, "Normal units/day": r.norm, "₹ a day": r.value, Liquidity: r.grade, Erratic: r.erratic ? "Yes" : "No",
      "Rank in group": r.rank, "ETFs in group": r.peers, "Years of history": r.years, Reliability: r.health }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), "ETF analyser");
    XLSX.writeFile(wb, `Hyperplane-ETF-analyser-${(d.as_of || "").slice(0, 10)}.xlsx`);
  };
  const copy = () => navigator.clipboard && navigator.clipboard.writeText(list.map(r => `NSE:${r.s}`).join(","));

  return (
    <div style={{ marginTop: 18 }} id="ct-etf-section">
      <div id="ct-etf" data-ct-anchor="1" style={{ height: 0, scrollMarginTop: 104 }}/>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)" }}>📀 ETF analyser</div>
        <div style={{ fontSize: 11.5, color: "var(--t2)", flex: "1 1 420px" }}>Every tradable ETF (no bond, liquid or plain-index funds), read with the same engine as the stocks. Kept out of every
          other screen. ★ = Recommended for its underlying (shown to customers with the strength). Click an ETF to open its full report: all the numbers and why it is or isn't picked.</div>
      </div>
      {!sid ? <div style={{ ...card, padding: 16, fontSize: 12, color: "var(--t2)" }}>Open a stored collection to see its ETFs.</div>
        : err ? <div style={{ ...card, padding: 16, fontSize: 12, color: "var(--short)" }}>{err}</div>
        : !d ? <div style={{ ...card, padding: 16, fontSize: 12, color: "var(--t2)" }}>Loading ETFs…</div>
        : !d.rows ? <div style={{ ...card, padding: 16, fontSize: 12, color: "var(--t2)" }}>No ETF data in this collection — it appears from the next collection.</div>
        : (
        <div style={card}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderBottom: "1px solid var(--b1)" }}>
            <select value={cls} onChange={e => { setCls(e.target.value); setUnd("all"); }} style={sel} aria-label="Class">
              <option value="all">All classes ({rows.length})</option>{d.classes.filter(c => rows.some(r => r.cls === c)).map(c => <option key={c} value={c}>{c} ({rows.filter(r => r.cls === c).length})</option>)}</select>
            <select value={und} onChange={e => setUnd(e.target.value)} style={{ ...sel, maxWidth: 240 }} aria-label="Group" id="etf-group">
              <option value="all">All groups</option>{unds.map(([c, us]) => <optgroup key={c} label={c}>{us.map(u => <option key={u} value={u}>{u} ({rows.filter(r => r.u === u && r.cls === c).length})</option>)}</optgroup>)}</select>
            <select value={sort} onChange={e => setSort(e.target.value)} style={sel} aria-label="Sort">
              <option value="group">Grouped (★ first)</option><option value="strength">Strongest first</option><option value="value">Most traded first</option></select>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search symbol / name" style={{ ...sel, width: 180 }} aria-label="Search"/>
            <button type="button" onClick={() => setRecOnly(v => !v)} style={btn(recOnly)} id="etf-rec-only">★ Recommended only</button>
            <span style={{ flex: 1 }}/>
            <span style={{ fontSize: 11, color: "var(--t3)" }}>{list.length} ETFs · {rows.filter(r => r.rec).length} ★ · {rows.filter(r => r.st != null).length} with a strength</span>
            <button type="button" onClick={copy} style={btn(false)}>Copy tickers</button>
            <button type="button" onClick={xlsx} style={btn(false)} id="etf-xlsx">Excel</button>
          </div>
          <div style={{ maxHeight: 620, overflow: "auto" }} className="tower-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }} id="etf-table">
              <thead><tr>{["", "ETF", "Class · underlying", "Price", "Strength", "Regime W · M", "Monthly", "Quarterly", "Yearly", "Mother candle", "₹ a day", "History", "Pick"].map(x => <th key={x} style={TH}>{x}</th>)}</tr></thead>
              <tbody>{list.map(r => (
                <React.Fragment key={r.s}>
                  <tr onClick={() => setOpen(r.s)} className="sec-row" data-sym={r.s} title="Open the full report"
                    style={{ cursor: "pointer", background: open === r.s ? "var(--adim)" : r.rec ? "color-mix(in srgb,var(--acc) 6%,transparent)" : "transparent" }}>
                    <td style={{ ...TD, color: "var(--t3)" }}>›</td>
                    <td style={TD}><b>{r.s}</b><div style={{ fontSize: 10.5, color: "var(--t3)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{r.n}</div></td>
                    <td style={TD}>{r.cls}<div style={{ fontSize: 10.5, color: "var(--t2)" }}>{r.u}</div></td>
                    <td style={{ ...TD, fontFamily: "var(--mono)" }}>{r.p ?? "—"}<div style={{ fontSize: 10.5, color: (r.c || 0) < 0 ? "var(--short)" : "var(--long)" }}>{r.c == null ? "" : `${r.c > 0 ? "+" : ""}${r.c}%`}</div></td>
                    <td style={{ ...TD, fontFamily: "var(--mono)" }}><b style={{ color: col(r.st) }}>{sgn(r.st)}</b>{r.held && <span title="Squeezed by the regime" style={{ color: "var(--t3)", fontSize: 10 }}> (raw {sgn(r.st_raw)})</span>}</td>
                    <td style={TD}>{reg(r.reg_w)} · {reg(r.reg_m)}</td>
                    {TFS.map(tf => { const t = r.tf[tf] || {}; return <td key={tf} style={TD}><span style={{ color: col(t.st), fontFamily: "var(--mono)", fontWeight: 700 }}>{sgn(t.st)}</span><div style={{ fontSize: 10.5, color: "var(--t3)" }}>{PLACE[t.place] || "—"}</div></td>; })}
                    <td style={TD}>{TFS.map(tf => nr(r.tf[tf] && r.tf[tf].nr) && <span key={tf} style={{ marginRight: 6, color: r.tf[tf].nr > 0 ? "var(--long)" : "var(--short)" }}>{tf} {nr(r.tf[tf].nr)}</span>)}</td>
                    <td style={{ ...TD, fontFamily: "var(--mono)" }}>{inr(r.value)}<div style={{ fontSize: 10.5, color: "var(--t3)" }}>{r.grade || ""}{r.erratic ? " · erratic" : ""}</div></td>
                    <td style={{ ...TD, fontFamily: "var(--mono)" }}>{r.years ? `${r.years} y` : "—"}</td>
                    <td style={TD}>{r.rec ? <b style={{ color: "var(--acc)" }}>★ Recommended</b> : <span style={{ color: "var(--t3)" }}>#{r.rank} of {r.peers}</span>}</td>
                  </tr>
                </React.Fragment>))}</tbody>
            </table>
          </div>
        </div>)}
      {cur && (                                                  // the ETF's full report in a pop-up panel (like a stock's)
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,.55)", display: "flex", justifyContent: "flex-end" }}>
          <div id="etf-panel" role="dialog" aria-label={`ETF report ${cur.s}`} onClick={e => e.stopPropagation()}
            style={{ width: "min(1180px, 96vw)", height: "100%", overflowY: "auto", background: "var(--bg)", borderLeft: "1px solid var(--b2)", boxShadow: "-20px 0 50px rgba(0,0,0,.35)" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 18px", background: "var(--s1)", borderBottom: "1px solid var(--b1)" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{cur.s} {cur.rec && <span style={{ fontSize: 12, color: "var(--acc)" }}>★ Recommended</span>}</div>
                <div style={{ fontSize: 11.5, color: "var(--t2)" }}>{cur.n} · {cur.cls} › {cur.u} · #{cur.rank} of {cur.peers} by trading</div>
              </div>
              {[["Strength", <b style={{ color: col(cur.st) }}>{sgn(cur.st)}{cur.held ? ` (raw ${sgn(cur.st_raw)})` : ""}</b>], ["Regime W · M", `${reg(cur.reg_w)} · ${reg(cur.reg_m)}`],
                ["Price", `${cur.p ?? "—"}${cur.c == null ? "" : ` (${cur.c > 0 ? "+" : ""}${cur.c}%)`}`], ["₹ a day", `${inr(cur.value)} · ${cur.grade || "—"}`], ["History", cur.years ? `${cur.years} y` : "—"]]
                .map(([k, v]) => <div key={k} style={{ ...card, padding: "6px 10px", fontSize: 12 }}><div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--t3)" }}>{k}</div><div style={{ fontFamily: "var(--mono)" }}>{v}</div></div>)}
              <button type="button" onClick={() => setOpen(null)} style={{ ...btn(false), fontSize: 14 }} aria-label="Close">✕</button>
            </div>
            <Detail r={cur} wide/>
            <div style={{ padding: "0 12px 16px" }}>
              <div style={{ ...card, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>Every {cur.u} ETF — by trading</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
                  {rows.filter(x => x.u === cur.u && x.cls === cur.cls).sort((a, b) => (a.rank || 99) - (b.rank || 99)).map(x => (
                    <tr key={x.s} onClick={() => setOpen(x.s)} style={{ cursor: "pointer", background: x.s === cur.s ? "var(--adim)" : "transparent" }}>
                      <td style={TD}>#{x.rank}</td><td style={TD}><b>{x.s}</b> {x.rec && <span style={{ color: "var(--acc)" }}>★</span>}</td>
                      <td style={{ ...TD, fontFamily: "var(--mono)" }}>{inr(x.value)}</td><td style={TD}>{x.grade || "—"}{x.erratic ? " · erratic" : ""}</td>
                      <td style={{ ...TD, fontFamily: "var(--mono)", color: col(x.st) }}>{sgn(x.st)}</td><td style={{ ...TD, fontFamily: "var(--mono)" }}>{x.years ? `${x.years} y` : "—"}</td>
                      <td style={{ ...TD, whiteSpace: "normal", color: "var(--t3)", fontSize: 11 }}>{x.rec ? x.why : x.why_not}</td></tr>))}
                </tbody></table>
              </div>
            </div>
          </div>
        </div>)}
    </div>);
}
