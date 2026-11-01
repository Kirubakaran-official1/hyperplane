// ⚙ Admin → 🧪 Strength evidence (owner, 2026-11-01: "check all the combinations as much as possible … accuracy").
// Every collection stores each stock's combination (backend/app/evidence.py); this tab shows how each combination's
// stocks actually did afterwards, against the whole market on the same dates. Admin only.
import React, { useEffect, useMemo, useState } from "react";

const TFN = { M: "Monthly", Q: "Quarterly", Y: "Yearly" };
const LEVELS = [["nr", "Mother candle", "breakout / breakdown × where the price sits · 12 per timeframe + none"],
  ["zone", "Zone states", "zone trend × place × mother candle · 90 per timeframe"],
  ["full", "Full combinations", "Monthly × Quarterly × Yearly · 729,000 possible"]];
const btn = (on = false) => ({ padding: "6px 12px", borderRadius: 7, border: `1px solid ${on ? "var(--acc)" : "var(--b2)"}`, cursor: "pointer",
  background: on ? "var(--adim, rgba(0,229,255,.1))" : "var(--s2)", color: on ? "var(--acc)" : "var(--t1)", fontSize: 12, fontWeight: 700 });
const card = { background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 10, padding: "12px 14px" };
const pct = v => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const VERDICT = { "Better than the market": "var(--long)", "Worse than the market": "var(--short)", "In line with the market": "var(--t2)", "Not enough yet": "var(--t3)" };

export function EvidenceTab({ api, notify }) {
  const [st, setSt] = useState(null);
  const [level, setLevel] = useState("nr"); const [tf, setTf] = useState("Q"); const [hz, setHz] = useState(30);
  const [rep, setRep] = useState(null); const [busy, setBusy] = useState(false); const [seenOnly, setSeenOnly] = useState(true);
  const [sort, setSort] = useState("examples");
  const loadStatus = () => api("/api/admin/evidence").then(setSt).catch(e => notify && notify(e.message, "error"));
  useEffect(() => { loadStatus(); }, []);
  useEffect(() => {
    setBusy(true);
    api(`/api/admin/evidence/report?level=${level}&tf=${tf}&horizon=${hz}`).then(setRep).catch(e => notify && notify(e.message, "error")).finally(() => setBusy(false));
  }, [level, tf, hz, st && st.rows]);
  const rebuild = () => {
    if (!window.confirm("Rebuild every stored past day and every stock state with the current formula? The worker does it in the background (a few seconds per collection).")) return;
    api("/api/admin/evidence/rebuild", { method: "POST" }).then(r => { setSt(r); notify && notify(`Rebuilding ${r.pending} collections in the background`, "ok"); })
      .catch(e => notify && notify(e.message, "error"));
  };
  const rows = useMemo(() => {
    if (!rep) return [];
    const list = rep.boxes.filter(b => !seenOnly || b.examples > 0);
    const key = { examples: b => -b.examples, excess: b => -(b.avg_excess ?? -1e9), ret: b => -(b.avg_ret ?? -1e9), worst: b => (b.avg_excess ?? 1e9) }[sort];
    return [...list].sort((a, b) => key(a) - key(b));
  }, [rep, seenOnly, sort]);
  const csv = () => {
    const head = level === "full" ? ["Monthly", "Quarterly", "Yearly"] : level === "zone" ? ["Zone trend", "Price place", "Mother candle"] : ["Mother candle", "Price place"];
    const lines = [[...head, "Examples", "With result", "Avg return %", "Vs market %", "% went up", "% beat market", "Avg strength", "Verdict"],
      ...rows.map(b => [...(level === "full" ? [b.M, b.Q, b.Y] : level === "zone" ? [b.trend, b.place, b.nr] : [b.event, b.place]),
        b.examples, b.done, b.avg_ret ?? "", b.avg_excess ?? "", b.up_pct ?? "", b.beat_pct ?? "", b.avg_strength ?? "", b.verdict])];
    const blob = new Blob(["﻿" + lines.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `strength-evidence-${level}-${level === "full" ? "" : tf + "-"}${hz}d.csv`; a.click();
  };
  const mb = st ? (st.bytes / 1048576).toFixed(1) : "—";
  return (
    <div style={{ padding: "16px 22px 30px", display: "flex", flexDirection: "column", gap: 14 }} id="evidence">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 18, fontWeight: 800 }}>🧪 Strength evidence</div>
          <div style={{ fontSize: 12.5, color: "var(--t2)", marginTop: 3, maxWidth: 900, lineHeight: 1.5 }}>Every collection stores each stock's combination (zone trend × price place × mother candle, per timeframe)
            and its exact strength. Here every combination is checked against what the price did afterwards, compared with all stocks on the same dates.
            One example per stock per period (a quarterly box counts a stock once a quarter). {st && `${st.min_examples}+`} finished examples = enough to judge.</div></div>
        <button type="button" style={btn()} onClick={rebuild} title="Rebuild every past day and stock state with the current formula">⟳ Rebuild with the current formula</button>
      </div>
      {st && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <div style={card}><div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 700 }}>COLLECTIONS STORED</div><b style={{ fontSize: 20 }}>{st.collections} <small style={{ fontSize: 12, color: "var(--t3)" }}>of {st.snapshots}</small></b>
          <div style={{ fontSize: 11.5, color: "var(--t3)" }}>{st.first} → {st.last}</div></div>
        <div style={card}><div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 700 }}>STOCK STATES</div><b style={{ fontSize: 20 }}>{st.rows.toLocaleString("en-IN")}</b>
          <div style={{ fontSize: 11.5, color: "var(--t3)" }}>{mb} MB · formula v{st.formula}{st.old_rows ? ` · ${st.old_rows} old` : ""}</div></div>
        <div style={card}><div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 700 }}>FULL COMBINATIONS SEEN</div><b style={{ fontSize: 20 }}>{st.seen_full.toLocaleString("en-IN")}</b>
          <div style={{ fontSize: 11.5, color: "var(--t3)" }}>of {st.possible_full.toLocaleString("en-IN")} possible</div></div>
        <div style={card}><div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 700 }}>STATES SEEN PER TIMEFRAME</div><b style={{ fontSize: 20 }}>{["M", "Q", "Y"].map(k => st.seen_tf[k]).join(" · ")}</b>
          <div style={{ fontSize: 11.5, color: "var(--t3)" }}>Monthly · Quarterly · Yearly, of 90 each</div></div>
      </div>}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 700, marginBottom: 4 }}>LEVEL</div>
          <div style={{ display: "flex", gap: 6 }}>{LEVELS.map(([k, l, d]) => <button key={k} type="button" style={btn(level === k)} title={d} onClick={() => setLevel(k)} id={`ev-${k}`}>{l}</button>)}</div></div>
        {level !== "full" && <div><div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 700, marginBottom: 4 }}>TIMEFRAME</div>
          <div style={{ display: "flex", gap: 6 }}>{["M", "Q", "Y"].map(k => <button key={k} type="button" style={btn(tf === k)} onClick={() => setTf(k)}>{TFN[k]}</button>)}</div></div>}
        <div><div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 700, marginBottom: 4 }}>RESULT AFTER</div>
          <div style={{ display: "flex", gap: 6 }}>{(st ? st.horizons : [7, 30, 90]).map(h => <button key={h} type="button" style={btn(hz === h)} onClick={() => setHz(h)}>{h} days</button>)}</div></div>
        <div><div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 700, marginBottom: 4 }}>SORT</div>
          <select value={sort} onChange={e => setSort(e.target.value)} style={{ ...btn(), fontWeight: 600 }}>
            <option value="examples">Most examples</option><option value="excess">Best vs market</option><option value="worst">Worst vs market</option><option value="ret">Best return</option></select></div>
        {level === "zone" && <label style={{ fontSize: 12, color: "var(--t2)", display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={seenOnly} onChange={e => setSeenOnly(e.target.checked)}/>Only combinations seen so far</label>}
        <button type="button" style={{ ...btn(), marginLeft: "auto" }} onClick={csv}>⬇ Excel (CSV)</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--t3)" }}>{busy ? "Checking…" : rep ? `${rep.seen.toLocaleString("en-IN")} of ${rep.possible.toLocaleString("en-IN")} ${level === "full" ? "full combinations" : `${TFN[tf].toLowerCase()} boxes`} seen · result after ${hz} days${level === "full" ? " · the 300 most common shown" : ""}` : ""}</div>
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }} id="ev-table">
          <thead><tr style={{ background: "var(--s2)", color: "var(--t3)", fontSize: 10.5, textAlign: "left" }}>
            {(level === "full" ? ["Monthly", "Quarterly", "Yearly"] : level === "zone" ? ["Zone trend", "Price place", "Mother candle"] : ["Mother candle", "Price place"]).map(h => <th key={h} style={{ padding: "8px 10px" }}>{h.toUpperCase()}</th>)}
            {["Examples", "With result", "Avg return", "Vs market", "% went up", "% beat market", "Avg strength", "Verdict"].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: h === "Verdict" ? "left" : "right", whiteSpace: "nowrap" }}>{h.toUpperCase()}</th>)}</tr></thead>
          <tbody>{rows.map((b, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--b1)" }}>
              {(level === "full" ? [b.M, b.Q, b.Y] : level === "zone" ? [b.trend, b.place, b.nr] : [b.event, b.place]).map((v, j) => <td key={j} style={{ padding: "7px 10px" }}>{v}</td>)}
              <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--mono)" }}>{b.examples.toLocaleString("en-IN")}</td>
              <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--mono)" }}>{b.done.toLocaleString("en-IN")}</td>
              <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--mono)" }}>{pct(b.avg_ret)}</td>
              <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--mono)", color: b.avg_excess > 0 ? "var(--long)" : b.avg_excess < 0 ? "var(--short)" : "" }}>{pct(b.avg_excess)}</td>
              <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--mono)" }}>{b.up_pct == null ? "—" : `${b.up_pct}%`}</td>
              <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--mono)" }}>{b.beat_pct == null ? "—" : `${b.beat_pct}%`}</td>
              <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--mono)" }}>{b.avg_strength ?? "—"}</td>
              <td style={{ padding: "7px 10px", color: VERDICT[b.verdict], fontWeight: 700, whiteSpace: "nowrap" }}>{b.verdict}</td>
            </tr>))}
            {!rows.length && <tr><td colSpan={11} style={{ padding: 16, color: "var(--t3)" }}>{busy ? "Checking…" : "Nothing stored yet. The worker fills this in the background."}</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
