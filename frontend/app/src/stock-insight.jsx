// Stock insight (round 19i, owner 2026-11-12: "when I click a new stock in the swap recommendation I need the well detailed data, like
// the AI summary, as a pop-up — with the option to swap there too"). Opened from every SwapPanel (swap-ui.jsx), loaded only when first used.
// It shows the same card the AI Portfolio Analyser shows for a holding — category, chips, sector / industry, the strength tiles and the
// Hyperplane AI research summary (portfolio-engine.analyseHolding on /app/api/stock/{sym}) — then why it is offered, a side-by-side with the
// stock it replaces, and Swap.
import React, { useEffect, useRef, useState } from "react";
import { AiSpark, Icon, Info, RELIABILITY, RG_INFO, addCss, api } from "./core.jsx";
import { PF_CAT, PF_MIN_YEARS, StrengthTiles, analyseHolding } from "./apps/portfolio-engine.jsx";
import { CSS as PF_CSS } from "./apps/portfolio.css.js";

addCss("portfolio", PF_CSS);                 // the holding card's styles (the same id as the Analyser, so they are added once)
addCss("stock-insight", `
.si-in{display:flex;flex-direction:column;gap:14px;min-width:0;text-align:left;scroll-margin-top:12px;animation:siIn .2s ease-out}
@keyframes siIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.si-in{animation:none}}
.si-h{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--b1)}.si-h .si-t{flex:1;min-width:220px}.si-h h3{margin:4px 0 2px;font:700 19px/26px var(--sans);color:var(--t1)}.si-h h3 em{font-style:normal;color:var(--acc);margin-left:8px;font-size:15px}
.si-h small{font-size:12.5px;color:var(--t2)}
.si-bk{flex:none;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px 0 10px;border:1px solid var(--b2);border-radius:999px;background:var(--s1);color:var(--t1);font:600 13px var(--sans);cursor:pointer}.si-bk:hover{border-color:var(--acc);color:var(--acc)}
.si-why{padding:10px 14px;border-radius:10px;background:var(--adim);font-size:13.5px;line-height:20px;color:var(--t1)}.si-why b{color:var(--acc)}
.si-in .px-item{margin:0}
.si-cmp{border:1px solid var(--b1);border-radius:12px;overflow:hidden;background:var(--s1)}
.si-cmp table{width:100%;border-collapse:collapse;font-size:13px}.si-cmp th,.si-cmp td{padding:9px 14px;border-bottom:1px solid var(--b1);text-align:right;white-space:nowrap;font-feature-settings:"tnum"}
.si-cmp th:first-child,.si-cmp td:first-child{text-align:left;color:var(--t3);font-weight:600}.si-cmp tr:last-child td{border-bottom:0}
.si-cmp thead th{font:600 11px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--t3);background:var(--s2)}.si-cmp thead th.new{color:var(--acc)}
.si-cmp .up{color:var(--long);font-weight:700}.si-cmp .dn{color:var(--short);font-weight:700}
.si-act{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;align-items:center}.si-act .note{margin-right:auto;font-size:12px;color:var(--t3)}
.si-miss{padding:12px 14px;border-radius:10px;border:1px dashed var(--b2);font-size:13px;color:var(--t3)}
@media (max-width:640px){.si-cmp th,.si-cmp td{padding:8px 10px}.si-go{width:100%;justify-content:center}}
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

// round 19j (owner 2026-11-12: "no pop on pop — handle it within one pop"): the insight is not a second window. It takes the place of
// the options inside the same pop-up (or drop-down) — "Back to the options" returns; Esc goes back too, and never closes the outer window.
// The owner-level "Full detail view" is not offered here ("on swap remove the detail view — it is only for the manager").
export default function StockInsight({ a, cur = {}, reason, busy, onSwap, onClose }) {
  const [d, setD] = useState(null); const [err, setErr] = useState("");
  const top = useRef(null);
  useEffect(() => { setD(null); setErr(""); api(`/app/api/stock/${encodeURIComponent(a.s)}`).then(setD).catch(e => setErr(e.message)); }, [a.s]);
  useEffect(() => { if (top.current) top.current.scrollIntoView({ block: "start", behavior: "smooth" }); }, [a.s]);
  useEffect(() => {                     // capture phase: Esc goes back to the options and does not reach the outer pop-up's own Esc
    const k = e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true);
  }, []);
  const r = d ? analyseHolding(d.stock, { sectors: d.sectors, industries: d.industries, rd: d.rd }) : null;
  const diff = a.st != null && cur.st != null ? Math.round(a.st - cur.st) : null;
  const swapBtn = id => onSwap && <button type="button" className="px-btn primary si-go" onClick={() => onSwap(a)} disabled={!!busy} id={id}>
    <Icon name="swap" size={14}/> {busy === a.s ? "Swapping…" : cur.s ? `Swap ${cur.s} → ${a.s}` : `Swap to ${a.s}`}</button>;
  return (
    <div className="si-in" id="si-pop" data-detail-of={a.s} ref={top} role="region" aria-label={`${a.s} — stock insight`}>
      <div className="si-h">
        <button type="button" className="si-bk" onClick={onClose} id="si-back"><span aria-hidden="true">‹</span> Back to the options</button>
        <div className="si-t"><div className="px-eyebrow"><AiSpark/> Hyperplane AI · Stock insight</div>
          <h3>{a.n || a.s}<em>{a.s}</em></h3><small>{[a.sec, a.ind].filter(Boolean).join(" › ")}{cur.s ? ` · a swap for ${cur.s}` : ""}</small></div>
        {swapBtn("si-swap-top")}
      </div>
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
        <button type="button" className="px-btn" onClick={onClose} id="si-back2">Back to the options</button>
        {swapBtn("si-swap")}
      </div>
    </div>);
}
