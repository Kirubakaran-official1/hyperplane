// All Portfolios (round 21, owner 2026-11-13: "in More apps, one more application to see the portfolios of all the sub-applications — for all
// customers, not pinned"): every saved portfolio of the applications the customer holds (the server filters by application), with the
// totals across them, then My portfolios with every tag — opening one opens its tracker (and its On Zerodha section).
import React, { useEffect, useState } from "react";
import { BrandBand, addCss, api } from "../core.jsx";
import { MyPortfolios } from "../saved.jsx";

const inr = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const CSS = `.ap-k{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 14px}
.ap-k .px-card{padding:14px 16px;display:flex;flex-direction:column;gap:4px}.ap-k b{font:800 22px var(--sans);color:var(--t1)}.ap-k small{color:var(--t3);font-size:12px}
.ap-k .up{color:var(--long)}.ap-k .dn{color:var(--short)}
@media (max-width:760px){.ap-k{grid-template-columns:repeat(2,minmax(0,1fr))}}`;

export default function AllPortfolios({ onOut }) {
  addCss("allportfolios", CSS);
  const [list, setList] = useState(null), [err, setErr] = useState("");
  useEffect(() => {
    api("/app/api/saved?kind=all&spark=1").then(setList).catch(e => { if (e.status === 401) onOut(e.message); else setErr(e.message); });
  }, []);
  const t = (list || []).map(x => x.track).filter(Boolean);
  const value = t.reduce((a, x) => a + (x.value || 0), 0), gain = t.reduce((a, x) => a + (x.gain || 0), 0), invested = value - gain;
  const apps = new Set((list || []).map(x => x.tag)).size;
  return (
    <div className="pf px" id="all-portfolios">
      <BrandBand product="All Portfolios" title="All your portfolios" accent="in one place" id="ap-band"
        info="Every portfolio you saved in the AI applications — SIPs, Builder portfolios and Analyser lists — with their totals. Open one for its tracking and its Zerodha orders."/>
      {err && <div className="pf-miss">{err}</div>}
      {list && <section className="ap-k" id="ap-totals">
        <div className="px-card"><span className="px-label">Portfolios</span><b>{list.length}</b><small>in {apps} application{apps === 1 ? "" : "s"}</small></div>
        <div className="px-card"><span className="px-label">Invested</span><b>{inr(invested)}</b><small>model tracking, all portfolios</small></div>
        <div className="px-card"><span className="px-label">Current value</span><b>{inr(value)}</b><small>at the last close</small></div>
        <div className="px-card"><span className="px-label">Returns</span><b className={gain >= 0 ? "up" : "dn"}>{gain >= 0 ? "+" : "−"}{inr(Math.abs(gain))}</b>
          <small className={gain >= 0 ? "up" : "dn"}>{invested ? `${gain >= 0 ? "+" : ""}${(gain / invested * 100).toFixed(2)}%` : "—"}</small></div>
      </section>}
      <MyPortfolios app="portfolios" onOut={onOut}/>
    </div>);
}
