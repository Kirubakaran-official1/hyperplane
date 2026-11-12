// Stock insight pop-up (round 19i, owner 2026-11-12: "when I click a new stock in the swap recommendation I need the well detailed data, like
// the AI summary, as a pop-up — with the option to swap there too"). Opened from every SwapPanel (swap-ui.jsx), loaded only when first used.
// It shows the same card the AI Portfolio Analyser shows for a holding — category, chips, sector / industry, the strength tiles and the
// Hyperplane AI research summary (portfolio-engine.analyseHolding on /app/api/stock/{sym}) — then why it is offered, a side-by-side with the
// stock it replaces, and Swap.
import React, { useEffect, useState } from "react";
import { AiSpark, Icon, Info, RELIABILITY, RG_INFO, addCss, api } from "./core.jsx";
import { PF_CAT, PF_MIN_YEARS, StrengthTiles, analyseHolding } from "./apps/portfolio-engine.jsx";
import { CSS as PF_CSS } from "./apps/portfolio.css.js";

addCss("portfolio", PF_CSS);                 // the holding card's styles (the same id as the Analyser, so they are added once)
addCss("stock-insight", `
.si-ov{position:fixed;inset:0;z-index:140;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.6)}
.si-mod{width:min(1180px,100%);max-height:90vh;overflow-y:auto;background:var(--bg);border:1px solid var(--b2);border-radius:16px;padding:18px 20px 20px;display:flex;flex-direction:column;gap:14px;box-shadow:0 30px 80px rgba(0,0,0,.4);text-align:left}
.si-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.si-h h3{margin:4px 0 2px;font:700 19px/26px var(--sans);color:var(--t1)}.si-h h3 em{font-style:normal;color:var(--acc);margin-left:8px;font-size:15px}
.si-h small{font-size:12.5px;color:var(--t2)}
.si-x{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--b1);background:var(--s1);color:var(--t2);cursor:pointer;display:grid;place-items:center}
.si-why{padding:10px 14px;border-radius:10px;background:var(--adim);font-size:13.5px;line-height:20px;color:var(--t1)}.si-why b{color:var(--acc)}
.si-mod .px-item{margin:0}
.si-cmp{border:1px solid var(--b1);border-radius:12px;overflow:hidden;background:var(--s1)}
.si-cmp table{width:100%;border-collapse:collapse;font-size:13px}.si-cmp th,.si-cmp td{padding:9px 14px;border-bottom:1px solid var(--b1);text-align:right;white-space:nowrap;font-feature-settings:"tnum"}
.si-cmp th:first-child,.si-cmp td:first-child{text-align:left;color:var(--t3);font-weight:600}.si-cmp tr:last-child td{border-bottom:0}
.si-cmp thead th{font:600 11px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--t3);background:var(--s2)}.si-cmp thead th.new{color:var(--acc)}
.si-cmp .up{color:var(--long);font-weight:700}.si-cmp .dn{color:var(--short);font-weight:700}
.si-act{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;align-items:center}.si-act .note{margin-right:auto;font-size:12px;color:var(--t3)}
.si-miss{padding:12px 14px;border-radius:10px;border:1px dashed var(--b2);font-size:13px;color:var(--t3)}
@media (max-width:640px){.si-mod{padding:14px}.si-cmp th,.si-cmp td{padding:8px 10px}}
`);

const rs = v => v == null ? "—" : `₹${(+v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cr = v => v == null ? "—" : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L Cr` : `₹${Math.round(v).toLocaleString("en-IN")} Cr`;
const sg = v => v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}`;
const REL = { S: "High", M: "Medium", W: "Low" };

// the holding card of the Analyser, for one stock (no Better-alternative button inside)
function Card({ r }) {
  const [, label, tone] = PF_CAT[r.cat];
  const rel = r.s.h && r.cat !== "new" ? RELIABILITY[r.s.h] : null;
  const grp = x => !x ? ["no data", ""] : x.nb > 0 ? ["strong", "good"] : x.nb < 0 ? ["weak", "bad"] : ["flat", ""];
  const [sw, st] = grp(r.g.sec), [iw, it] = grp(r.g.ind);
  const isNew = r.cat === "new";
  return (
    <article className={`px-item ${tone}`} id="si-card">
      <div className="px-who">
        <div className="px-name"><b title={r.s.n}>{r.s.n}</b><em>{r.s.s}</em></div>
        <div className="px-where">{r.s.sec} › {r.s.ind}</div>
        <span className={`px-pill ${tone}`}><i/>{label}</span>
        <div className="px-chips">
          {r.s.cap && <span className="px-chip">{r.s.cap} cap</span>}
          {r.rg && !isNew && <span className="px-chip rg" title={`${r.rg.text} ${RG_INFO}`}><i className={r.rg.tone}/>{r.rg.word}</span>}
          {rel && <span className="px-chip" title={rel[2]}><i className={rel[1]}/>Reliability: {rel[0]}</span>}
          {r.improving && <span className="px-chip"><i className="good"/>Improving</span>}
          {r.s.x ? <span className="px-chip" title="Went up more than 3 times in a year"><i className="mid"/>Rose very fast</span> : null}
        </div>
        <div className="px-backdrop">
          <div className="px-label">Sector and industry <Info text="Sector and industry strength are shown for reference only. They are not used to calculate the stock strength or the colour."/></div>
          <div className="px-chips"><span className="px-chip"><i className={st}/>Sector: {sw}</span><span className="px-chip"><i className={it}/>Industry: {iw}</span></div>
        </div>
      </div>
      <div className="px-how">{isNew ? <div className="px-newnote"><b>Recently listed</b><span>No view yet. The quant algorithm needs at least {PF_MIN_YEARS} years of yearly data.</span></div> : <StrengthTiles r={r}/>}</div>
      <div className="px-whyc">
        <div className="px-aih"><AiSpark/><b>Hyperplane AI</b><span>Research summary</span></div>
        <ul className="px-why" id="si-why">{(isNew ? r.why.slice(0, 1) : r.why).map((w, i) => <li key={i}>{w}</li>)}</ul>
      </div>
    </article>);
}

export default function StockInsight({ a, cur = {}, reason, busy, onSwap, onClose, onFullDetail }) {
  const [d, setD] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { api(`/app/api/stock/${encodeURIComponent(a.s)}`).then(setD).catch(e => setErr(e.message)); }, [a.s]);
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const r = d ? analyseHolding(d.stock, { sectors: d.sectors, industries: d.industries, rd: d.rd }) : null;
  const diff = a.st != null && cur.st != null ? Math.round(a.st - cur.st) : null;
  return (
    <div className="si-ov" onClick={onClose}><div className="si-mod" role="dialog" aria-label={`${a.s} — stock insight`} id="si-pop" data-detail-of={a.s} onClick={e => e.stopPropagation()}>
      <div className="si-h"><div style={{ minWidth: 0 }}><div className="px-eyebrow"><AiSpark/> Hyperplane AI · Stock insight</div>
        <h3>{a.n || a.s}<em>{a.s}</em></h3><small>{[a.sec, a.ind].filter(Boolean).join(" › ")}{cur.s ? ` · a swap for ${cur.s}` : ""}</small></div>
        <button type="button" className="si-x" onClick={onClose} aria-label="Close" id="si-x"><Icon name="x" size={16}/></button></div>
      {reason && <div className="si-why" id="si-reason"><b>Why it is offered.</b> {reason}</div>}
      {err ? <div className="si-miss">The detailed view could not be loaded ({err}). The comparison below still helps you decide.</div>
        : !r ? <div className="si-miss">Reading the latest data…</div> : <Card r={r}/>}
      {cur.s && <div className="si-cmp" id="si-cmp"><table>
        <thead><tr><th/><th className="new">{a.s} · new</th><th>{cur.s} · now</th></tr></thead>
        <tbody>
          <tr><td>Long-term strength</td><td className={diff > 0 ? "up" : diff < 0 ? "dn" : ""}>{sg(a.st)}{diff != null && diff !== 0 ? ` (${diff > 0 ? "+" : ""}${diff})` : ""}</td><td>{sg(cur.st)}</td></tr>
          <tr><td>Price · 1 share</td><td>{rs(a.p)}</td><td>{rs(cur.p)}</td></tr>
          <tr><td>Company size</td><td>{cr(a.mcap)}{a.cap ? ` · ${a.cap} cap` : ""}</td><td>{cr(cur.mcap)}{cur.cap ? ` · ${cur.cap} cap` : ""}</td></tr>
          <tr><td>Reliability</td><td>{a.rel ? REL[a.rel] || a.rel : "—"}</td><td>{cur.rel ? REL[cur.rel] || cur.rel : "—"}</td></tr>
          <tr><td>Sector › industry</td><td>{[a.sec, a.ind].filter(Boolean).join(" › ") || "—"}</td><td>{[cur.sec, cur.ind].filter(Boolean).join(" › ") || "—"}</td></tr>
        </tbody></table></div>}
      <div className="si-act"><span className="note">Checked by fixed rules on our latest data. For education only, not investment advice.</span>
        {onFullDetail && <button type="button" className="px-btn" onClick={() => { onClose(); onFullDetail(); }} id="si-full"><Icon name="search" size={14}/> Full detail view</button>}
        <button type="button" className="px-btn" onClick={onClose} id="si-back">Back to the options</button>
        {onSwap && <button type="button" className="px-btn primary" onClick={() => onSwap(a)} disabled={!!busy} id="si-swap"><Icon name="swap" size={14}/> {busy === a.s ? "Swapping…" : cur.s ? `Swap ${cur.s} → ${a.s}` : `Swap to ${a.s}`}</button>}
      </div>
    </div></div>);
}
