// The swap options panel — ONE component for every swap screen. Used by the Swap pop-up and the AI watch pop-up (saved.jsx) and by the
// Analyser watch drop-down (apps/portfolio.jsx).
// Round 18c (owner 2026-11-08: "the swap screen looks childish, not professional — bring a 2×2 grid, keep it as the table as usual, the
// colours of our theme … and the details of the stock on click"). Layout, top to bottom:
//   1. the stock being replaced, on one line: price, size, strength and the money that moves
//   2. how we choose (one short line) and, when the industry has no peer, a clear note
//   3. a 2×2 grid of tables — Same industry · Same sector / Better alternative · Upgrade — in the app's table style (.hp-t), theme colours
//      only; one column on narrow screens. An empty table says why, in one line.
//   4. a click on a stock opens the Stock insight pop-up (round 19i): the AI research summary card, why it is offered, a side-by-side
//      with the stock it replaces, and Swap.
import React, { Suspense, lazy, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { DetailCtx, Icon, addCss, loadChunk, swapSections } from "./core.jsx";

// round 19i: a click on a stock opens the Stock insight pop-up (the Analyser's AI summary card + a side-by-side + Swap), loaded on first use
const StockInsight = lazy(() => loadChunk(() => import("./stock-insight.jsx")));

const REL = { S: "High", M: "Medium", W: "Low" };
const rs = v => v == null ? "—" : `₹${(+v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inr = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const cr = v => v == null ? "—" : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L Cr` : `₹${Math.round(v).toLocaleString("en-IN")} Cr`;
const sg = v => v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}`;
const tone = v => v == null ? "" : v < 0 ? "dn" : v >= 24 ? "up" : "";

addCss("swp", `
.swp{display:flex;flex-direction:column;gap:12px;min-width:0;text-align:left;container-type:inline-size}
.swp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.swp-sec{display:flex;flex-direction:column;min-width:0;padding:0!important;margin:0!important;text-align:left!important;border:1px solid var(--b1);border-radius:12px;background:var(--s1);overflow:hidden}
.swp-sh{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--b1);background:var(--s2)}
.swp-sh .t{min-width:0;flex:1}.swp-sh b{display:block;font:700 13.5px/19px var(--sans);color:var(--t1)}.swp-sh small{display:block;font-size:12px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.swp-sh .c{flex:none;min-width:24px;height:22px;padding:0 8px;border-radius:999px;display:grid;place-items:center;background:var(--adim);color:var(--acc);font:700 12px var(--sans);font-feature-settings:"tnum"}
.swp-sec.empty .swp-sh .c{background:var(--s3);color:var(--t3)}
.swp-t{table-layout:fixed}.swp-t th{background:var(--s1)}.swp-t th,.swp-t td{padding:8px 10px}.swp-t th:first-child,.swp-t td:first-child{padding-left:14px}.swp-t th:last-child,.swp-t td:last-child{padding-right:12px}
.swp-t col.p,.swp-t col.z{width:92px}.swp-t col.s{width:76px}.swp-t col.a{width:78px}
.swp-t tr:last-child>td{border-bottom:0}
.swp-row{cursor:pointer}.swp-row:hover>td,.swp-row.open>td{background:color-mix(in srgb,var(--acc) 5%,transparent)}
.swp-row .swt{display:flex;align-items:center;gap:6px;min-width:0}.swp-row .sym{border:0!important;background:none!important;padding:0;font:600 13.5px var(--sans);color:var(--acc);overflow:hidden;text-overflow:ellipsis}
.swp-row .chev{flex:none;color:var(--t3);transition:transform .15s}.swp-row:hover .chev{transform:translateX(2px);color:var(--acc)}
.swp-row td .sub{max-width:none}.swp-row .sub .swp-tag{margin-right:6px;vertical-align:1px}
.swp-tag{flex:none;display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;font:600 10.5px var(--sans);background:var(--adim);color:var(--acc)}
.swp-st{font:700 13px var(--sans);font-feature-settings:"tnum";color:var(--t1)}.swp-st.up{color:var(--long)}.swp-st.dn{color:var(--short)}
.swp-go{height:30px;padding:0 10px}.swp-go .ic{margin-right:2px}
.swp-empty{display:flex;align-items:flex-start;gap:10px;padding:14px;font-size:12.5px;line-height:18px;color:var(--t3)}.swp-empty .ic{flex:none}
@keyframes swpIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.swp-row .chev{transition:none}}
@container (max-width:900px){.swp-grid{grid-template-columns:minmax(0,1fr)}}
@container (max-width:460px){.swp-t col.z{width:0}.swp-t .z{display:none}}
`);

// the plain reason a stock is offered, by its section
const why = (a, cur) => {
  const it = cur.s || "the stock you hold";
  if (a.section === "industry") return <>The same industry as {it}{a.ind ? <> — <b>{a.ind}</b></> : ""} — the closest like-for-like change.</>;
  if (a.section === "sector") return <>The same sector{a.sec ? <> — <b>{a.sec}</b></> : ""}, in another industry{a.ind ? ` (${a.ind})` : ""}.</>;
  if (a.section === "cap") return <>A company of the same size{a.cap ? ` (${a.cap} cap)` : ""} from another sector{a.sec ? <> — <b>{a.sec}</b></> : ""}, with a stronger long-term trend.</>;
  return <>A bigger company{a.cap ? <> — <b>{a.cap} cap</b></> : ""} in {a.why && a.why.includes("industry") ? "the same industry" : "the same sector"}, for more stability.</>;
};
const diff = (v, w, word) => v == null || w == null ? null : v === w ? ["Same as now", ""] : [`${v > w ? "+" : ""}${Math.round(v - w)} ${v > w ? word[0] : word[1]}`, v > w ? "up" : "dn"];

// what one stock holds: the replaced one ("cur") and the options — see core.swapSections for the four sections
export function SwapPanel({ items, cur = {}, onPick, busy, amount, per, idp = "swp", app = "portfolio", rootAttrs = {} }) {
  const { sections } = swapSections(items, cur);
  const [open, setOpen] = useState(null);                        // the stock whose insight pop-up is open
  const det = useContext(DetailCtx);                             // the owner-level detail view (roles with "<app>:detail")
  const first = items[0] && items[0].s;
  const buys = a => { if (!amount || !a.p) return null; if (per) return `${inr(amount)} ${per}`; const n = Math.max(1, Math.floor(amount / a.p)); return `${n.toLocaleString("en-IN")} share${n === 1 ? "" : "s"} · ${inr(n * a.p)}`; };
  return (
    <div className="swp" data-swap-sections {...rootAttrs}>
      <div className="swp-grid">
        {sections.map(g => (
          <section key={g.k} id={`${idp}-sec-${g.k}`} className={`swp-sec ${g.k} ${g.items.length ? "" : "empty"}`} data-section={g.k}>
            <header className="swp-sh"><div className="t"><b>{g.title}</b><small>{g.sub}</small></div><span className="c" title={`${g.items.length} option${g.items.length === 1 ? "" : "s"}`}>{g.items.length}</span></header>
            {g.items.length ? <table className="hp-t swp-t">
              <colgroup><col/><col className="p"/><col className="z"/><col className="s"/><col className="a"/></colgroup>
              <thead><tr><th>Stock</th><th className="num">Price</th><th className="num z">Size</th><th className="num">Strength</th><th/></tr></thead>
              <tbody>{g.items.map(a => { const on = open && open.s === a.s; return (<React.Fragment key={a.s}>
                <tr className={`swp-row ${on ? "open" : ""}`} data-opt={a.s} data-alt={a.s} data-up={a.up ? 1 : 0} title={`See ${a.s} in detail`} onClick={() => setOpen(a)}>
                  <td><span className="swt"><b className="sym" title={a.s}>{a.s}</b><Icon name="chevron" size={12} className="chev"/></span><span className="sub">{a.s === first && <span className="swp-tag">Best match</span>}{a.n || ""}</span></td>
                  <td className="num">{rs(a.p)}{buys(a) && !per ? <span className="sub">{buys(a).split(" · ")[0]}</span> : null}</td>
                  <td className="num z">{cr(a.mcap)}<span className="sub">{a.cap ? `${a.cap} cap` : ""}</span></td>
                  <td className="num"><span className={`swp-st ${tone(a.st)}`} title="Long-term strength">{sg(a.st)}</span>{a.rel && <span className="sub">{REL[a.rel] || a.rel}</span>}</td>
                  <td className="num"><button type="button" className={`px-btn swp-go ${a.s === first ? "primary" : ""}`} onClick={e => { e.stopPropagation(); onPick(a); }} disabled={!!busy} data-pick={a.s} title={`Replace ${cur.s || "it"} with ${a.s}`}>{busy === a.s ? "…" : "Swap"}</button></td>
                </tr>
              </React.Fragment>); })}</tbody>
            </table> : <div className="swp-empty" data-empty={g.k}><Icon name="info" size={15}/><span>{g.empty}</span></div>}
          </section>))}
      </div>
      {open && createPortal(<Suspense fallback={null}><StockInsight a={open} cur={cur} reason={why(open, cur)} busy={busy} onClose={() => setOpen(null)}
        onSwap={x => { setOpen(null); onPick(x); }} onFullDetail={det && det.can(app) ? () => det.open(open.s, app) : null}/></Suspense>, document.body)}
    </div>);
}
