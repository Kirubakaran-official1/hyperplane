// Simulators (owner 2026-11-07, rounds 14–16): SIP growth / goal planner / start now vs later — or, for a portfolio, its own amount
// (fixed: a new amount is a new portfolio) and "add a monthly SIP". Annual growth: 5 % by default (below the market's long-run
// average, on purpose), adjustable from 0 to 100 % (round 16). Never a one-time amount, never a forecast. Used on the shared page
// (public.jsx) and on the customer's own portfolio page (saved.jsx Tracker); the CSS is scoped to .pq-sim.
import React, { useEffect, useRef, useState } from "react";
import { AiSpark, Icon, addCss } from "./core.jsx";

export const DEFAULT_RATE = 5;
const VAL = "#8b5cf6";
const inr = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const short = v => v == null ? "—" : Math.abs(v) >= 1e7 ? `₹${+(v / 1e7).toFixed(2)} Cr` : Math.abs(v) >= 1e5 ? `₹${+(v / 1e5).toFixed(2)} L` : inr(v);
const calm = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

// a number that counts up to its value
export function useCount(target, ms = 900) {
  const [v, setV] = useState(calm() ? target : 0), from = useRef(0);
  useEffect(() => {
    if (calm()) { setV(target); return; }
    const a = from.current, t0 = performance.now(); let raf;
    const tick = now => { const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3); setV(a + (target - a) * e); if (p < 1) raf = requestAnimationFrame(tick); else from.current = target; };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
export const Count = ({ v, f = inr }) => <>{f(useCount(v || 0))}</>;
// the width of a box, so a chart fills it exactly
export function useWidth() {
  const ref = useRef(null), [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; setW(Math.round(el.clientWidth)); const ro = new ResizeObserver(e => setW(Math.round(e[0].contentRect.width))); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, Math.max(280, w)];
}

function sipYears(p, years, rate, step) {
  const g = Math.pow(1 + rate / 100, 1 / 12) - 1; let put = 0, val = 0; const out = [];
  for (let y = 1; y <= years; y++) { const each = p * Math.pow(1 + step / 100, y - 1); for (let m = 0; m < 12; m++) { put += each; val = (val + each) * (1 + g); } out.push({ y, put, val, each }); }
  return out;
}
const lumpYears = (a, years, rate) => Array.from({ length: years }, (_, i) => ({ y: i + 1, put: a, val: a * Math.pow(1 + rate / 100, i + 1) }));
function Bars({ rows, id }) {
  const [ref, w] = useWidth(), [hv, setHv] = useState(null), [on, setOn] = useState(calm());
  useEffect(() => { if (calm()) return; setOn(false); const t = setTimeout(() => setOn(true), 40); return () => clearTimeout(t); }, [rows.length]);
  const H = 250, T = 10, B = 24, n = rows.length, max = Math.max(...rows.map(r => r.val)) || 1, bw = w / n, ih = H - T - B;
  return (
    <div className="pq-chart" ref={ref} id={id}>
      <svg width={w} height={H} role="img" aria-label="Year by year: the amount invested and the projected value">
        <defs><linearGradient id="pqv" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={VAL}/><stop offset="1" stopColor="var(--ch-pf)"/></linearGradient></defs>
        <line x1="0" x2={w} y1={H - B} y2={H - B} stroke="var(--b1)"/>
        {rows.map((r, i) => { const x0 = i * bw + bw * 0.14, ww = Math.max(3, bw * 0.72), hP = ih * r.put / max, hV = ih * r.val / max, dim = hv != null && hv !== i;
          const tr = { transition: `height .65s cubic-bezier(.2,.8,.2,1) ${i * 22}ms, y .65s cubic-bezier(.2,.8,.2,1) ${i * 22}ms, opacity .15s` };
          return <g key={r.y} onPointerEnter={() => setHv(i)} onPointerLeave={() => setHv(null)}>
            <rect x={i * bw} y={T} width={bw} height={ih} fill="transparent"/>
            <rect x={x0} width={ww} rx="4" y={H - B - (on ? hV : 0)} height={on ? hV : 0} fill="url(#pqv)" opacity={dim ? .35 : 1} style={tr}/>
            <rect x={x0} width={ww} rx="4" y={H - B - (on ? hP : 0)} height={on ? hP : 0} fill="var(--ch-in)" opacity={dim ? .35 : .95} style={tr}/>
            {(n <= 12 || i === 0 || (i + 1) % 5 === 0) && <text x={i * bw + bw / 2} y={H - 7} textAnchor="middle" fontSize="11" fill="var(--t3)">{`Yr ${r.y}`}</text>}
          </g>; })}
      </svg>
      {hv != null && <div className="pq-tip" style={{ left: Math.max(8, Math.min(hv * bw + bw + 6, w - 230)), top: 8 }}><b>After year {rows[hv].y}</b>
        <span><i style={{ background: "var(--ch-in)" }}/>Amount invested<em>{short(rows[hv].put)}</em></span>
        <span><i style={{ background: VAL }}/>Projected value<em>{short(rows[hv].val)}</em></span>
        {rows[hv].each != null && <span><i style={{ background: "var(--t3)" }}/>Each month that year<em>{inr(rows[hv].each)}</em></span>}</div>}
    </div>);
}
function Slider({ label, value, min, max, step, onChange, fmt, id }) {
  const f = Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
  return (
    <label className="pq-sl"><span className="pq-sll"><span>{label}</span><b>{fmt(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} id={id} style={{ "--f": `${f}%` }}/>
      <span className="pq-slr"><span>{fmt(min)}</span><span>{fmt(max)}</span></span></label>);
}
const yrsF = v => `${v} yr${v === 1 ? "" : "s"}`;
export function Simulators({ isSip, amount0, years0, onStart, idp = "pub", title = "Simulators" }) {
  const tabs = isSip ? [["grow", "SIP growth"], ["goal", "Goal planner"], ["late", "Start now vs later"]] : [["grow", "This portfolio"], ["sip", "Add a monthly SIP"]];
  const [tab, setTab] = useState("grow");
  const [mon, setMon] = useState(isSip ? Math.max(1000, Math.round((amount0 || 10000) / 1000) * 1000) : 10000);
  const [yrs, setYrs] = useState(Math.min(30, years0 || 10)), [step, setStep] = useState(isSip ? 10 : 0);
  const [goal, setGoal] = useState(5000000), [late, setLate] = useState(3), [RATE, setRate] = useState(DEFAULT_RATE);
  const monthly = isSip || tab === "sip";
  const gi = Math.pow(1 + RATE / 100, 1 / 12) - 1;
  const needSip = goal / (((Math.pow(1 + gi, yrs * 12) - 1) / gi) * (1 + gi));
  const lateBy = Math.min(late, yrs - 1);
  const rows = tab === "goal" ? sipYears(needSip, yrs, RATE, 0) : monthly ? sipYears(mon, yrs, RATE, step) : lumpYears(amount0 || 0, yrs, RATE);
  const end = rows[rows.length - 1];
  const lateRows = lateBy > 0 ? sipYears(mon, yrs - lateBy, RATE, step) : rows, lateEnd = lateRows[lateRows.length - 1];
  const startAmt = Math.round((tab === "goal" ? needSip : monthly ? mon : amount0) / 1000) * 1000 || 1000;
  return (
    <section className="pq-card pq-sim" id={`${idp}-sim`}>
      <div className="pq-ch"><h3><Icon name="chart" size={16}/> {title}<small>try your own numbers — an illustration, never a forecast</small></h3><span className="pq-sp"/>
        <div className="pq-seg" role="tablist">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} id={`${idp}-sim-${k}`}>{l}</button>)}</div></div>
      <div className="pq-simb">
        <div className="pq-simc">
          {tab === "goal" ? <Slider label="Your goal" value={goal} min={500000} max={50000000} step={100000} onChange={setGoal} fmt={short} id={`${idp}-goal`}/>
            : monthly ? <Slider label="Every month" value={mon} min={1000} max={200000} step={1000} onChange={setMon} fmt={short} id={`${idp}-amt`}/>
            : <div className="pq-fixed" id={`${idp}-fixed`}><span>Amount of this portfolio</span><b>{short(amount0)}</b><small>Fixed — a new amount is a new portfolio.</small></div>}
          <Slider label="For" value={yrs} min={1} max={30} step={1} onChange={setYrs} fmt={yrsF} id={`${idp}-years`}/>
          {monthly && tab !== "goal" && <div className="pq-steps"><span>Raise it every year (step-up)</span>
            <div className="pq-seg" id={`${idp}-sim-step`}>{[0, 5, 10, 15].map(v => <button key={v} type="button" className={step === v ? "on" : ""} onClick={() => setStep(v)}>{v ? `+${v}%` : "Off"}</button>)}</div></div>}
          {tab === "late" && yrs > 1 && <Slider label="Start later by" value={lateBy} min={1} max={yrs - 1} step={1} onChange={setLate} fmt={yrsF} id={`${idp}-late`}/>}
          <div className="pq-rate" id={`${idp}-rate`}>
            <div className="pq-rh"><span>Annual growth</span><span className="pq-rin"><input type="number" min="0" max="100" step="0.5" value={RATE} id={`${idp}-rate-in`} aria-label="Annual growth %"
              onChange={e => setRate(Math.max(0, Math.min(100, +e.target.value || 0)))}/>%</span></div>
            <input type="range" min="0" max="100" step="0.5" value={RATE} onChange={e => setRate(+e.target.value)} aria-label="Annual growth" id={`${idp}-rate-sl`} style={{ "--f": `${RATE}%` }}/>
            <small>{RATE === DEFAULT_RATE ? "5% is the default — below the market's long-run average, on purpose, so the picture stays modest."
              : RATE > 15 ? "Above 15% a year is rare to keep for long — treat it as a stretch case." : RATE < DEFAULT_RATE ? "Lower than the 5% default — a cautious case." : "Your own assumption — never a forecast."}
              {RATE !== DEFAULT_RATE && <button type="button" onClick={() => setRate(DEFAULT_RATE)} id={`${idp}-rate-reset`}>Back to 5%</button>}</small>
          </div>
        </div>
        <div className="pq-simr">
          {tab === "goal" ? <div className="pq-two" id={`${idp}-sim-out`}>
              <div className="pq-big hl"><span>Monthly SIP needed</span><b><Count v={needSip}/></b><small>reaches {short(goal)} in {yrsF(yrs)} at {RATE}% a year</small></div>
              <div className="pq-big"><span>Amount invested</span><b><Count v={needSip * yrs * 12} f={short}/></b><small>growth adds {short(goal - needSip * yrs * 12)}</small></div></div>
            : tab === "late" ? <div className="pq-two" id={`${idp}-sim-out`}>
              <div className="pq-big hl"><span>Start today</span><b><Count v={end.val} f={short}/></b><small>{short(end.put)} invested</small></div>
              <div className="pq-big"><span>Start {yrsF(lateBy)} later</span><b><Count v={lateEnd.val} f={short}/></b><small>{short(lateEnd.put)} invested · <span className="dn">{short(end.val - lateEnd.val)} less</span></small></div></div>
            : <div className="pq-two" id={`${idp}-sim-out`}>
              <div className="pq-big"><span>Amount invested</span><b><Count v={end.put} f={short}/></b><small>{monthly ? (step ? `starting ${inr(mon)} a month, rising ${step}% a year` : `${inr(mon)} every month`) : "this portfolio, once"}</small></div>
              <div className="pq-big hl"><span>Projected value</span><b><Count v={end.val} f={short}/></b><small>in {yrsF(yrs)} at {RATE}% a year · <span className="up">gain {short(end.val - end.put)}</span></small></div></div>}
          <div className="pq-leg"><span><i style={{ background: "var(--ch-in)" }}/>Amount invested</span><span><i style={{ background: VAL }}/>Projected value</span><span className="pq-sp"/>
            {onStart && (monthly || isSip) && <button type="button" className="pq-btn pri sm" onClick={() => onStart(startAmt, true)} id={`${idp}-sim-go`}><AiSpark/> Start with {short(startAmt)} a month</button>}</div>
          <Bars rows={rows} id={`${idp}-bars`}/>
        </div>
      </div>
    </section>);
}

addCss("sim", `
.pq-sim .pq-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 16px;border-radius:9px;font:600 13.5px var(--sans);text-decoration:none;white-space:nowrap;cursor:pointer;border:1px solid var(--b2);background:var(--s1);color:var(--t1)}
.pq-sim .pq-btn:hover{border-color:var(--acc);color:var(--acc)}.pq-sim .pq-btn.pri{background:var(--ds-action-bg);border-color:transparent;color:var(--on-acc)}.pq-sim .pq-btn.pri:hover{background:var(--ds-action-hover);color:var(--on-acc)}
.pq-sim .pq-btn.sm{height:32px;padding:0 12px;font-size:12.5px}.pq-sim .pq-btn.pri .ai-spark{color:#fff;opacity:1}
.pq-sim{background:var(--s1);border:1px solid var(--b1);border-radius:18px;overflow:hidden;min-width:0}
.pq-sim .pq-ch{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--b1)}
.pq-sim .pq-ch h3{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0;font:700 16px var(--sans);color:var(--t1)}.pq-sim .pq-ch h3 small{font:500 12.5px var(--sans);color:var(--t2)}.pq-sim .pq-ch h3 .ic{color:var(--acc)}
.pq-sim .pq-seg{display:inline-flex;flex-wrap:wrap;padding:3px;border-radius:10px;background:var(--s2);border:1px solid var(--b1)}
.pq-sim .pq-seg button{height:30px;padding:0 12px;border:0;border-radius:7px;background:none;color:var(--t2);font:600 12.5px var(--sans);cursor:pointer;transition:all .15s}
.pq-sim .pq-seg button:hover{color:var(--t1)}.pq-sim .pq-seg button.on{background:var(--s1);color:var(--acc);box-shadow:0 1px 3px rgba(15,27,45,.14)}
.pq-sim .up{color:var(--long)!important}.pq-sim .dn{color:var(--short)!important}
.pq-sim .pq-leg{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--t2)}.pq-sim .pq-leg>span{display:inline-flex;align-items:center;gap:6px}.pq-sim .pq-leg i{width:12px;height:4px;border-radius:2px}
.pq-sim .pq-chart{position:relative;width:100%;min-width:0}.pq-sim .pq-chart svg{display:block}
.pq-sim .pq-tip{position:absolute;top:12px;z-index:3;min-width:210px;padding:10px 12px;border-radius:10px;background:var(--s1);border:1px solid var(--b2);box-shadow:0 12px 28px -12px rgba(0,0,0,.4);font-size:12.5px;color:var(--t1);pointer-events:none}
.pq-sim .pq-tip b{display:block;margin-bottom:4px}.pq-sim .pq-tip span{display:flex;align-items:center;gap:6px;padding:2px 0}.pq-sim .pq-tip i{width:8px;height:8px;border-radius:2px}.pq-sim .pq-tip em{margin-left:auto;padding-left:12px;font-style:normal;font-weight:700}
.pq-sim .pq-simb{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr)}
.pq-sim .pq-simc{display:flex;flex-direction:column;gap:18px;padding:18px 20px;border-right:1px solid var(--b1);background:var(--s2)}
.pq-sim .pq-simr{display:flex;flex-direction:column;gap:12px;padding:16px 18px 12px;min-width:0}
.pq-sim .pq-sl{display:flex;flex-direction:column;gap:5px}.pq-sim .pq-sll{display:flex;justify-content:space-between;align-items:baseline;font:600 13px var(--sans);color:var(--t2)}.pq-sim .pq-sll b{font:800 17px var(--sans);color:var(--t1)}
.pq-sim .pq-sl input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;margin:6px 0;padding:0;border:0;box-shadow:none;border-radius:999px;cursor:pointer;
  background:linear-gradient(90deg,var(--acc) 0,${VAL} var(--f),var(--s3) var(--f))}
.pq-sim .pq-sl input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid var(--acc);box-shadow:0 2px 6px rgba(15,27,45,.3);transition:transform .15s}
.pq-sim .pq-sl input[type=range]:active::-webkit-slider-thumb{transform:scale(1.15)}
.pq-sim .pq-sl input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid var(--acc)}
.pq-sim .pq-slr{display:flex;justify-content:space-between;font-size:11px;color:var(--t3)}
.pq-sim .pq-steps{display:flex;flex-direction:column;gap:6px;font:600 13px var(--sans);color:var(--t2)}
.pq-sim .pq-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pq-sim .pq-big{display:flex;flex-direction:column;gap:2px;padding:12px 16px;border-radius:14px;background:var(--s2);border:1px solid var(--b1);min-width:0}
.pq-sim .pq-big>span{font:600 11px var(--sans);letter-spacing:.5px;text-transform:uppercase;color:var(--t3)}.pq-sim .pq-big b{font:800 28px/34px var(--sans);letter-spacing:-.02em;color:var(--t1)}.pq-sim .pq-big small{font-size:12.5px;color:var(--t2)}
.pq-sim .pq-big.hl{background:linear-gradient(135deg,color-mix(in srgb,var(--acc) 11%,var(--s1)),color-mix(in srgb,${VAL} 11%,var(--s1)));border-color:var(--accb)}.pq-sim .pq-big.hl b{color:var(--acc)}
.pq-sim .pq-fixed{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:12px;background:var(--s1);border:1px solid var(--b1)}
.pq-sim .pq-fixed span{font:600 13px var(--sans);color:var(--t2)}.pq-sim .pq-fixed b{font:800 22px var(--sans);color:var(--t1)}.pq-sim .pq-fixed small{font-size:12px;line-height:17px;color:var(--t3)}
.pq-sim .pq-rate{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:10px;border:1px dashed var(--b2);font-size:12px;line-height:17px;color:var(--t2)}
.pq-sim .pq-rate b{font:800 15px var(--sans);color:var(--t1)}
.pq-sim{--ch-pf:#0891b2;--ch-in:#f59e0b}
.pq-sim .pq-sp{flex:1}
.pq-sim .pq-rate{gap:6px}.pq-sim .pq-rh{display:flex;align-items:center;justify-content:space-between;font:600 13px var(--sans);color:var(--t2)}
.pq-sim .pq-rin{display:inline-flex;align-items:center;gap:4px;font:800 15px var(--sans);color:var(--t1)}
.pq-sim .pq-rin input{width:64px;height:30px;padding:0 6px;border-radius:7px;border:1px solid var(--b2);background:var(--s1);color:var(--t1);font:700 14px var(--sans);text-align:right}
.pq-sim .pq-rate input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;margin:4px 0;padding:0;border:0;border-radius:999px;cursor:pointer;background:linear-gradient(90deg,var(--acc) 0,${VAL} var(--f),var(--s3) var(--f))}
.pq-sim .pq-rate input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid var(--acc)}
.pq-sim .pq-rate small{font-size:12px;line-height:17px;color:var(--t2)}
.pq-sim .pq-rate small button{margin-left:6px;border:0;background:none;padding:0;color:var(--acc);font:600 12px var(--sans);cursor:pointer}
@media (max-width:1180px){.pq-sim .pq-simb{grid-template-columns:1fr}.pq-sim .pq-simc{border-right:0;border-bottom:1px solid var(--b1)}}
@media (max-width:640px){.pq-sim .pq-two{grid-template-columns:1fr}.pq-sim .pq-big b{font-size:24px;line-height:30px}.pq-sim .pq-ch,.pq-sim .pq-simr{padding-left:12px;padding-right:12px}}
`);
