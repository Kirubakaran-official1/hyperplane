// Quick guide (gold ⓘ in the top bar): how to use Hyperplane in one minute, in very simple words.
// Meanings only — never how anything is calculated.
import React, { useEffect, useState } from "react";
import { Icon, TONE_ICON } from "./core.jsx";

const Chip = ({ k, children }) => <span className={`qg-chip ${k}`}>{children}</span>;
const LEVEL = { S: ["Strong", "s"], M: ["Average", "m"], W: ["Weak", "w"] };

const EXAMPLES = [
  { stock: "S", ind: "W", sec: "W", tone: "bad", verdict: "Avoid",
    why: "The stock is going up, but its industry and sector are falling. It is swimming against the current — such moves usually don't last." },
  { stock: "S", ind: "M", sec: "S", tone: "mid", verdict: "Okay — be careful",
    why: "Stock and sector are strong, the industry is only average. You may consider it with a smaller amount, or wait for the industry to turn strong." },
  { stock: "M", ind: "S", sec: "S", tone: "watch", verdict: "Watch — not yet",
    why: "The group is strong, but the stock itself is only moderate. Keep it on your watch list and act when the stock's own trend becomes strong." },
  { stock: "S", ind: "S", sec: "S", tone: "good", verdict: "Best case",
    why: "Stock, industry and sector are all strong and going up. Everything points the same way — this is where to focus." },
];

export function QuickGuideButton({ onDocs }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const k = e => e.key === "Escape" && setOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  return (
    <>
      <button type="button" className="qg-btn" onClick={() => setOpen(true)} title="Quick guide — how to use Hyperplane" aria-label="Quick guide"><Icon name="help" size={20}/></button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal qg" onClick={e => e.stopPropagation()} role="dialog" aria-label="Quick guide">
            <button className="x" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" size={16}/></button>
            <div className="qg-k">Quick guide</div>
            <h2>How to use Hyperplane — in one minute</h2>

            <section>
              <h3><span>1</span>Always look in this order</h3>
              <div className="qg-flow">
                <div><b>Sector</b><small>the big group<br/>e.g. Healthcare</small></div><i>→</i>
                <div><b>Industry</b><small>the smaller group<br/>e.g. Pharma</small></div><i>→</i>
                <div><b>Stock</b><small>the company<br/>e.g. one pharma stock</small></div>
              </div>
              <p>Think of a <b>river</b> (sector), a <b>stream</b> inside it (industry) and a <b>boat</b> (stock). A boat moves fastest
                when the river and the stream flow the same way.</p>
            </section>

            <section>
              <h3><span>2</span>Five timeframes for everything</h3>
              <div className="qg-tfs">
                {[["D", "Daily", "days"], ["W", "Weekly", "weeks"], ["M", "Monthly", "months"], ["Q", "Quarterly", "about a year"], ["Y", "Yearly", "years"]].map(([k, l, s]) =>
                  <div key={k}><b>{k}</b><span>{l}</span><small>{s}</small></div>)}
              </div>
              <p>Every <b>stock</b>, every <b>industry</b> and every <b>sector</b> is checked on all five. In the <b>Trading mode</b> filter, pick your style:
                <b>Swing</b> gives Monthly &amp; Quarterly the most weight, <b>Investing</b> gives Quarterly &amp; Yearly the most,
                <b>Balanced</b> treats all five the same. Or use the <b>Timeframe</b> filter (D / W / M / Q / Y) to see one timeframe alone.</p>
            </section>

            <section>
              <h3><span>3</span>Check the strength of all three — then decide</h3>
              <p>Strength is shown from 0 to 100%: <Chip k="s">Strong 81+</Chip> <Chip k="s">Good 61–80</Chip> <Chip k="m">Average 31–60</Chip> <Chip k="w">Weak 0–30</Chip>.
                It tells you how strong the trend is — <b>not</b> how much the price will move.</p>
              <div className="qg-ex">
                <div className="qg-ex-h"><span>#</span><span>Stock</span><span>Industry</span><span>Sector</span><span>Decision</span></div>
                {EXAMPLES.map((e, i) => (
                  <div key={i} className={`qg-ex-r ${e.tone}`}>
                    <span className="n">{i + 1}</span>
                    <span data-l="Stock"><Chip k={LEVEL[e.stock][1]}>{LEVEL[e.stock][0]}{e.stock !== "W" ? " ▲" : ""}</Chip></span>
                    <span data-l="Industry"><Chip k={LEVEL[e.ind][1]}>{LEVEL[e.ind][0]}</Chip></span>
                    <span data-l="Sector"><Chip k={LEVEL[e.sec][1]}>{LEVEL[e.sec][0]}</Chip></span>
                    <span className="v"><b><Icon name={TONE_ICON[e.tone]} size={14}/> {e.verdict}</b><small>{e.why}</small></span>
                  </div>
                ))}
              </div>
              <p className="qg-tip"><Icon name="bulb" size={14}/> You don't have to work this out yourself — click any stock and its <b>AI insights</b> show this verdict.
                A <b><Icon name="flame" size={14}/> Stretched</b> stock (3× or more in a year) is never a best case — don't chase it.</p>
            </section>

            <section>
              <h3><span>4</span>How to look at the screen — 4 clicks</h3>
              <ol className="qg-steps">
                <li><b>Sector chart</b> (left): look at the <b>top-right</b> corner — <i>Strong + Uptrend</i>. Click one or two bubbles.</li>
                <li><b>Industry chart</b> (right): it now shows only those sectors' industries. Again click the <b>top-right</b> ones.</li>
                <li><b>Filters</b>: set <i>Trend</i> = <b>▲ Up</b> and <i>Stock reliability</i> = <b>Strong</b>. The list shows the strongest first.</li>
                <li><b>Click a stock</b>: read its <b>AI insights</b>. <b><Icon name="check" size={14}/> Best case</b> = stock, industry and sector all agree.
                  Then press <b>TV</b> to copy it to TradingView and check the chart yourself.</li>
              </ol>
            </section>

            <div className="qg-f">
              <span className="sub">Want the full story and the golden rules?</span>
              <button type="button" className="qg-docs" onClick={() => { setOpen(false); onDocs(); }}>Open the Docs →</button>
            </div>
            <p className="fine">For education and information only — not investment advice.</p>
          </div>
        </div>
      )}
    </>
  );
}

export const QUICK_CSS = `
.qg-btn{width:32px;height:32px;border-radius:4px;border:0;background:none;color:var(--t2);display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
.qg-btn:hover{background:var(--s2);color:var(--t1)}.qg-btn:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.modal.qg{max-width:760px}
.qg-k{font:600 10px/16px var(--sans);letter-spacing:.6px;text-transform:uppercase;color:var(--acc)}
.qg h2{margin:4px 0 12px;font:600 20px/28px var(--sans);letter-spacing:-.01em}
.qg section{border:1px solid var(--b1);background:var(--s1);border-radius:8px;padding:14px 16px;margin-bottom:10px}
.qg h3{display:flex;align-items:center;gap:8px;margin:0 0 8px;font:600 14px/20px var(--sans)}
.qg h3 span{width:24px;height:24px;border-radius:50%;background:var(--ds-action-bg);color:var(--on-acc);font:600 12px/24px var(--sans);text-align:center;flex-shrink:0}
.qg p{margin:8px 0 0;font-size:13px;line-height:20px;color:var(--t1)}
.qg-flow{display:flex;align-items:stretch;gap:8px}.qg-flow>div{flex:1;border:1px solid var(--b2);border-radius:8px;padding:9px 10px;background:var(--s2);text-align:center}
.qg-flow b{display:block;font-size:14px;color:var(--acc)}.qg-flow small{font-size:11px;color:var(--t2);line-height:1.4}.qg-flow i{align-self:center;font-style:normal;color:var(--t2);font-size:18px}
.qg-tfs{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.qg-tfs>div{border:1px solid var(--b2);border-radius:8px;padding:7px 4px;text-align:center;background:var(--s2);display:flex;flex-direction:column}
.qg-tfs b{font:600 14px var(--sans);color:var(--acc)}.qg-tfs span{font-size:12px;font-weight:600}.qg-tfs small{font-size:11px;color:var(--t2)}
.qg-chip{display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:999px;font:500 11px/16px var(--sans);border:1px solid transparent;white-space:nowrap}
.qg-chip.s{color:var(--long);background:var(--longd);border-color:rgba(0,200,150,.4)}
.qg-chip.m{color:var(--mixed);background:var(--mixedd);border-color:rgba(255,170,0,.4)}
.qg-chip.w{color:var(--short);background:var(--shortd);border-color:rgba(255,68,84,.4)}
.qg-ex{margin-top:10px;border:1px solid var(--b1);border-radius:8px;overflow:hidden}
.qg-ex-h,.qg-ex-r{display:grid;grid-template-columns:26px 104px 92px 92px minmax(0,1fr);gap:8px;align-items:center;padding:9px 12px}
.qg-ex-h{background:var(--s2);font:600 10px/16px var(--sans);text-transform:uppercase;letter-spacing:.6px;color:var(--t2)}
.qg-ex-r{border-top:1px solid var(--b1);border-left:3px solid var(--b2)}.qg-ex-r .n{font:600 12px var(--sans);color:var(--t2)}
.qg-ex-r .v b{display:block;font-size:13px}.qg-ex-r .v small{display:block;font-size:12px;color:var(--t2);line-height:1.45}
.qg-ex-r.bad{border-left-color:var(--short)}.qg-ex-r.bad .v b{color:var(--short)}
.qg-ex-r.mid{border-left-color:var(--mixed)}.qg-ex-r.mid .v b{color:var(--mixed)}
.qg-ex-r.watch{border-left-color:var(--acc)}.qg-ex-r.watch .v b{color:var(--acc)}
.qg-ex-r.good{border-left-color:var(--long);background:var(--longd)}.qg-ex-r.good .v b{color:var(--long)}
.qg-tip{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-radius:6px;background:var(--s2);border:1px solid var(--b1)}
.qg-steps{margin:0;padding-left:20px;font-size:13px;line-height:1.6}.qg-steps li{margin-bottom:6px}
.qg-f{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:6px 0 8px}
.qg-docs{height:32px;padding:0 12px;border-radius:4px;border:1px solid var(--b2);background:var(--s1);color:var(--t1);font:500 13px/16px var(--sans);cursor:pointer}.qg-docs:hover{background:var(--s2)}
@media (max-width:640px){.qg-ex-h{display:none}.qg-ex-r>span[data-l]::before{content:attr(data-l);display:block;font-size:10px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--t2);margin-bottom:2px}.qg-ex-r{grid-template-columns:22px repeat(3,auto) ;row-gap:6px}.qg-ex-r .v{grid-column:1/-1}
  .qg-tfs{grid-template-columns:repeat(5,minmax(0,1fr))}.qg-flow{flex-direction:column}.qg-flow i{transform:rotate(90deg)}}
`;
