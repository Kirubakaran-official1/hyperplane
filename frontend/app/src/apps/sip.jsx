// Hyperplane AI SIPs — one lazily loaded module for two applications (owner, 2026-11-06: "split into 2 apps"):
//   mode "etf"    AI ETF SIP Builder (Reliable) — ETFs only: gold share, index cap mix and how many ETFs (6 … 20); the
//                 slots beyond the core index go to the strongest ETFs today (owner round 5)     → /app/api/sip
//   mode "stock"  AI Momentum SIP (Risk) — stocks only, spread wide even at ₹10,000, RISK banner → /app/api/msip
// The SERVER builds and checks the SIP (backend/app/sip.py); this page collects the inputs, shows the plan in the same
// table format as the AI Portfolio Builder (groups as accordion rows), the insights pop-up, the growth simulator, a
// "How to buy" guide, Save and My portfolios (tracking, momentum check, alerts — saved.jsx). The form uses the AI
// Portfolio Builder layout (steps on the left, How it works + Your plan on the right, the same .al sliders); the
// sector / market bars of the result filter the holdings table.
import React, { useEffect, useState } from "react";
import { AiSpark, BrandBand, CopyBtns, GroupRow, Icon, Info, MultiSelect, addCss, api, dirVal, loadChunk, signed, tc, trackAction, trendWordOf, useAsOf } from "../core.jsx";
import { CSS } from "./sip.css.js";
import { MyPortfolios, SaveBar, SavedNote, buyText } from "../saved.jsx";

addCss("sip", CSS);

const AMOUNTS = [5000, 10000, 25000, 50000, 100000];
const STEPUPS = [0, 5, 10, 15, 20], RATE_MAX = 15;
const CAPS = [["Large", "Large cap"], ["Mid", "Mid cap"], ["Small", "Small cap"]];
const CAP_COL = ["var(--mx-l)", "var(--mx-m)", "var(--mx-s)"];
const WORD = { month: "month", quarter: "quarter" };
const EASE = { "Very high": "Very easy", High: "Easy", Moderate: "Fairly easy", Low: "Harder", "Very low": "Hard" };
const REL = [["S", "High"], ["M", "Medium"], ["W", "Low"]];
const REL_WORD = { S: "High", M: "Medium", W: "Low" };
const ROLE = { core: "Core index", theme: "Theme", diversifier: "Diversifier", commodity: "Gold / silver" };
const YEARS = [5, 10, 15, 20, 25];
// AI ETF SIP Builder style (owner round 7: "focus, standard and more diversified as a slightly big chip-like selection"):
// focus = only what is going up (the core only when it is going up too) · standard = the core index + what is going up ·
// more diversified = standard + some diversifiers. The core index already diversifies, so only the last adds diversifiers.
const STYLES = [
  ["focus", "Focus", "Only what is going up", "The strongest sectors, themes and markets. The core index only if it is going up too. Fewer ETFs, bolder."],
  ["standard", "Standard", "Core index + what is going up", "The core Nifty markets always, plus the sectors and themes going up. The balanced way."],
  ["diverse", "More diversified", "Standard + diversifiers", "Everything in Standard, plus steady strategy, international and other index ETFs to spread the risk wider."],
];
const STYLE_NAME = { focus: "Focus", standard: "Standard", diverse: "More diversified" };
const MSIP_CHIPS = [10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 250];
// AI Momentum SIP "More options" — the AI Portfolio Builder's own choices and words (owner round 6: "bring the same
// advanced settings"); the Customer level keeps the standard settings (the server checks it)
const ADV_DEFAULT = { horizon: "long", quality: "good", confirmed: true, run_up: 30, fno_only: false, exclude: [] };
const A_HORIZON = [["long", "Long term", "Months to years · quarter and year count most"], ["medium", "Medium term", "Weeks to months · the month counts more"]];
const A_QUALITY = [["strong", "Leaders only", "Strength 40 and above · the fewest, strongest stocks"],
  ["good", "Proven trends", "Strength 24 and above"], ["building", "Proven + emerging", "Adds rising trends when proven ones run out"]];
const A_REGIME = [[false, "Uptrend regime", "The long-term regime is up"], [true, "Confirmed uptrend", "Long- and short-term regimes both up · stricter"]];
const A_RUNUP = [[20, "20%"], [30, "30%"], [50, "50%"], [0, "Don't leave out"]];
const SLEEVE = { index: "Index ETFs", commodity: "Gold & silver", stock: "Momentum stocks" };
// what a bar of the result filters the holdings table by (owner: "the sector should work like the filter of the bottom table")
const FILTER_BY = { sec: h => h.kind === "stock" ? h.sec : null, cap: h => h.kind === "stock" ? `${h.cap} cap` : null,
  grp: h => h.kind === "etf" ? h.grp : null, type: h => SLEEVE[h.sleeve] };
const shares = (hs, by) => {
  const m = {}, tot = hs.reduce((t, h) => t + h.amt, 0) || 1;
  hs.forEach(h => { const k = FILTER_BY[by](h); if (k) m[k] = (m[k] || 0) + h.amt; });
  return Object.entries(m).map(([k, v]) => [k, +(v / tot * 100).toFixed(1)]).sort((a, b) => b[1] - a[1]);
};
const MODES = {
  etf: { app: "sip", product: "AI ETF SIP Builder", title: "Build a SIP", accent: "in ETFs", word: "SIP", chip: "Reliable",
    info: "A SIP in ETFs only: the Nifty large, mid and small caps every month, a little gold, and small themes. Steady and simple.",
    def: { amount: 10000, freq: "month", years: 10, opts: { gold: 10, caps: { Large: 55, Mid: 25, Small: 20 }, style: "standard" } } },
  stock: { app: "msip", product: "AI Momentum SIP Builder", title: "Build a Momentum SIP", accent: "in stocks", word: "Momentum SIP", chip: "Risk",
    info: "A SIP in momentum stocks only, spread over many stocks and sectors. Each stock gets the same money every month. Higher risk than ETFs.",
    def: { amount: 10000, freq: "month", years: 10, rel: ["S"], mix: { Large: 60, Mid: 25, Small: 15 }, count: null, adv: null, sector: 10 } },
};
const inr = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const inr2 = v => v == null ? "—" : `₹${(+v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const inrShort = v => v >= 1e7 ? `₹${+(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${+(v / 1e5).toFixed(2)} L` : inr(v);
const plus = v => v == null ? "—" : `${v > 0 ? "+" : ""}${signed(v)}`;
const tfWord = v => v == null ? "—" : dirVal(v) === 1 ? "Rising" : dirVal(v) === -1 ? "Falling" : "Sideways";
const recFrom = (money, rule, dflt) => { for (const [cut, n] of rule || []) if (cut == null || money < cut) return n; return dflt; };
// three linked sliders: moving one shares the difference over the others (steps of 5, never below 0)
const rebalance = (vals, key, v, keys, st = 5) => {
  v = Math.max(0, Math.min(100, Math.round(v / st) * st));
  const others = keys.filter(k => k !== key), rest = 100 - v, cur = others.reduce((t, k) => t + vals[k], 0);
  const next = { ...vals, [key]: v };
  let left = rest;
  others.forEach((k, i) => {
    const share = i === others.length - 1 ? left : Math.round((cur ? vals[k] / cur : 1 / others.length) * rest / st) * st;
    next[k] = Math.max(0, Math.min(left, share)); left -= next[k];
  });
  return next;
};
// growth simulator: instalments at the start of each period, an assumed yearly growth (an illustration, never a forecast)
const simulate = (inst, perYear, years, stepup, rate) => {
  const r = Math.pow(1 + rate / 100, 1 / perYear) - 1;
  let put = 0, val = 0; const rows = [];
  for (let y = 1; y <= years; y++) {
    const each = inst * Math.pow(1 + stepup / 100, y - 1);
    for (let i = 0; i < perYear; i++) { put += each; val = (val + each) * (1 + r); }
    rows.push({ y, each, put, val });
  }
  return rows;
};
const I = {
  rel: "High = a steady price history. Medium and Low allow less steady stocks.",
  ai: "Fixed rules on our data. Never a made-up number. Not investment advice.",
  strength: "−100 to +100. Above +24 = going up.",
  sim: "An illustration with the growth rate you pick. Not a forecast, not a promise.",
  gold: "Gold moves differently from shares, so a little of it steadies the SIP.",
  caps: "How the index money is split: Large = Nifty 50 + Nifty Next 50, Mid = Midcap 150, Small = Smallcap 250.",
};

function Strength({ v, big }) {
  if (v == null) return <span className="sp-na">—</span>;
  const w = `${Math.min(100, Math.abs(v)) / 2}%`;
  return (
    <span className={`sp-st ${big ? "big" : ""} ${tc(v)}`} title={`Long-term strength ${plus(v)} (−100 to +100)`}>
      <span className="sp-bar" aria-hidden="true"><i style={v >= 0 ? { left: "50%", width: w } : { right: "50%", width: w }}/></span>
      <b>{plus(v)}</b><small>{trendWordOf(v)}</small>
    </span>);
}

function Bars({ title, rows, on, onPick, id }) {
  if (!rows || !rows.length) return null;
  return (
    <div className="sp-bars" id={id}><span className="px-label">{title}<small>click one to filter the holdings</small></span>
      <div className="sp-bll">{rows.map(([k, v]) => <button type="button" key={k} className={`sp-bl ${on === k ? "on" : on ? "dim" : ""}`} data-f={k} aria-pressed={on === k}
        onClick={() => onPick(on === k ? null : k)}><span>{k}</span><i><b style={{ width: `${Math.max(2, v)}%` }}/></i><em>{v}%</em></button>)}</div>
    </div>);
}

// the AI Portfolio Builder's allocation rows: a colour bar, then per part a slider, − / + with the %, and the money
function Sliders({ keys, labels, vals, onChange, idp, colors, amount, word, max = {} }) {
  const set = (k, v, st = 5) => onChange(rebalance(vals, k, Math.min(max[k] ?? 100, +v || 0), keys, st));
  return (
    <div className="al sp-al" role="group" aria-label={labels.map(l => l[0]).join(", ")}>
      <div className="al-top"><div className="sp-stack" aria-hidden="true">{keys.map((k, i) => vals[k] > 0 && <i key={k} style={{ flexGrow: vals[k], background: colors[i] }}>{vals[k] >= 12 ? `${vals[k]}%` : ""}</i>)}</div>
        <span className="al-total"><Icon name="check" size={12}/> 100% allocated</span></div>
      <div className="al-head" aria-hidden="true"><span>Part</span><span>Allocation</span><span className="c">Share</span><span className="r">Each {word}</span></div>
      {keys.map((k, i) => (
        <div key={k} className="al-row" data-part={k}>
          <span className="al-name"><i className="al-sw" style={{ background: colors[i] }}/><span><b>{labels[i][0]}</b>{labels[i][1] && <small>{labels[i][1]}</small>}</span></span>
          <input type="range" className="al-range" min="0" max="100" step="5" value={vals[k]} id={`${idp}-${k}`} onChange={e => set(k, e.target.value)}
            aria-label={`${labels[i][0]} share`} style={{ "--c": colors[i], "--v": `${vals[k]}%` }}/>
          <span className="al-step">
            <button type="button" onClick={() => set(k, vals[k] - 5)} disabled={vals[k] <= 0} aria-label={`Less ${labels[i][0]}`}>−</button>
            <input type="number" min="0" max="100" value={vals[k]} onChange={e => set(k, e.target.value, 1)} aria-label={`${labels[i][0]} %`}/><em>%</em>
            <button type="button" onClick={() => set(k, vals[k] + 5)} disabled={vals[k] >= (max[k] ?? 100)} aria-label={`More ${labels[i][0]}`}>+</button></span>
          <span className="al-amt">{amount > 0 ? inr(amount * vals[k] / 100) : "—"}</span>
        </div>))}
    </div>);
}

// under the AI summary (owner round 6: "huge white space below the AI summary … bring another stat"): the trend spread
// of the holdings, then three facts — strongest holding, the biggest group and the steadiness / core share
const SPREAD = [["Strong", "60+", "var(--long)"], ["Good", "40–59", "color-mix(in srgb,var(--long) 65%,var(--s3))"],
  ["Building", "24–39", "color-mix(in srgb,var(--long) 35%,var(--s3))"], ["Steady", "below 24", "var(--s3)"]];
function AiNumbers({ res, hs, isStock, w }) {
  const sp = (res.insights && res.insights.spread) || {}, n = hs.length || 1;
  const best = [...hs].filter(h => h.st != null).sort((a, b) => b.st - a.st)[0];
  const top = shares(hs, isStock ? "sec" : "grp")[0];
  const third = isStock
    ? (() => { const hi = hs.filter(h => h.rel === "S").length; return ["High reliability", `${hi} of ${hs.length}`, "steady price history"]; })()
    : (() => { const c = hs.filter(h => h.role === "core").reduce((t, h) => t + h.amt, 0) / (res.invested || 1) * 100; return ["Core index share", `${c.toFixed(0)}%`, "kept whatever the trend"]; })();
  return (
    <div className="sp-aix" id={`${res.app}-ainum`}>
      <div className="sp-aisp"><span className="px-label">Trend spread of the {isStock ? "stocks" : "holdings"}</span>
        <div className="sp-aibar" role="img" aria-label={SPREAD.map(([k]) => `${k} ${sp[k] || 0}`).join(", ")}>
          {SPREAD.map(([k, , c]) => sp[k] > 0 && <i key={k} style={{ flexGrow: sp[k], background: c }} title={`${k}: ${sp[k]}`}/>)}</div>
        <div className="sp-aileg">{SPREAD.map(([k, r, c]) => <span key={k}><i style={{ background: c }}/>{k} <b>{sp[k] || 0}</b><small>{r}</small></span>)}</div></div>
      <div className="sp-aik">
        {best && <div><small>Strongest {isStock ? "stock" : "holding"}</small><b className="sym">{best.s}</b><em className={tc(best.st)}>{plus(best.st)} · {trendWordOf(best.st)}</em></div>}
        {top && <div><small>Biggest {isStock ? "sector" : "market"}</small><b>{top[0]}</b><em>{top[1]}% of each {w}</em></div>}
        <div><small>{third[0]}</small><b>{third[1]}</b><em>{third[2]}</em></div>
      </div>
    </div>);
}

function Modal({ children, onClose, label, id }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  return <div className="overlay tk-ov" onClick={onClose}><div className="tk-modal sp-howm" role="dialog" aria-label={label} id={id} onClick={e => e.stopPropagation()}>{children}</div></div>;
}

// ── the insights pop-up of one holding ──
function Insight({ h, freq, onClose }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const v = dirVal(h.st), verdict = h.st == null ? "Too new to read" : v === 1 ? "Long-term uptrend" : v === -1 ? "Long-term downtrend" : "Moving sideways";
  const sf = h.sf || [], kp = h.kp || {};
  const checks = h.kind === "stock" ? [
    ["Record", sf[0] != null ? `${sf[0]}+ years` : "—", sf[0] == null || sf[0] >= 5],
    ["Worst fall, 3 years", sf[1] != null ? `${Math.abs(sf[1]).toFixed(0)}%` : "—", sf[1] == null || sf[1] > -40],
    ["Rise in 1 year", sf[2] != null ? `${sf[2].toFixed(1)}×` : "—", sf[2] == null || sf[2] <= 2],
    ["Rise in 4 months", sf[3] != null ? `${sf[3] > 0 ? "+" : ""}${sf[3].toFixed(0)}%` : "—", sf[3] == null || sf[3] <= 50],
  ] : [];
  const dir = h.kind === "stock" ? (h.rp ? (h.rp[0] === 1 ? (h.rp[1] === 1 ? "Up, confirmed" : "Up, short term turning") : h.rp[0] === -1 ? "Down" : "Flat") : "—")
    : h.rg === 1 ? "Up" : h.rg === -1 ? "Down" : "Flat";
  const roleTag = h.role === "core" ? "Core index · always kept" : h.role === "commodity" ? "Commodity · steadies the SIP" : h.role === "theme" ? "Theme · small share" : h.role === "diversifier" ? "Diversifier · small share" : null;
  return (
    <div className="overlay sp-ov" onClick={onClose}>
      <aside className="sp-panel" role="dialog" aria-label={`${h.s} insights`} id="sip-insight" onClick={e => e.stopPropagation()}>
        <div className="sp-ph">
          <div><div className="px-eyebrow"><AiSpark/> Hyperplane AI insights</div>
            <h2>{h.s} <small>{h.n !== h.s ? h.n : ""}</small></h2>
            <div className="sp-tags"><span>{h.kind === "etf" ? `ETF · ${h.grp}` : `${h.grp} · ${h.sec}`}</span>
              {h.kind === "stock" && <span className={`rel ${h.rel}`}>{REL_WORD[h.rel]} reliability</span>}
              {roleTag && <span className="rel S">{roleTag}</span>}</div></div>
          <button className="x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button>
        </div>
        <div className={`sp-verdict ${tc(h.st)}`}><b>{verdict} <Info text={I.strength}/></b><Strength v={h.st} big/></div>
        <div className="sp-facts">
          <div><span className="px-label">Trend over time</span><div className="sp-tfs">{["Months", "Quarters", "Years"].map((l, i) => <span key={l} className={tc(h.tf && h.tf[i])}><small>{l}</small><b>{tfWord(h.tf && h.tf[i])}</b></span>)}</div></div>
          <div><span className="px-label">Overall direction</span><b>{dir}</b></div>
          {h.kind === "stock"
            ? <div><span className="px-label">Stability <Info text="0–100 from its whole price history. High from 58."/></span><b>{h.rs ?? "—"}<small>/100</small></b><i className="sp-meter"><b style={{ width: `${h.rs || 0}%` }}/></i></div>
            : <div><span className="px-label">Easy to trade</span><b>{EASE[h.lq] || "—"}</b><small>{h.v ? `~${inrShort(h.v)} a day` : ""}</small></div>}
          {h.kind === "stock"
            ? <div><span className="px-label">Sector · industry</span><b>{h.sec_st != null ? `${h.sec_st}%` : "—"} · {h.ind_st != null ? `${h.ind_st}%` : "—"}</b><small>long-term strength</small></div>
            : <div><span className="px-label">Track record</span><b>{h.y ? `${Math.floor(h.y)}+ years` : "—"}</b></div>}
        </div>
        {checks.length > 0 && <div className="sp-safe"><span className="px-label">Safety checks <Info text="Steady stocks fall less and rise at a calmer pace."/></span>
          <div className="sp-checks2">{checks.map(([l, val, ok]) => <span key={l} className={ok ? "ok" : "no"}><Icon name={ok ? "check" : "alert"} size={13}/>{l}<b>{val}</b></span>)}</div></div>}
        {h.kind === "stock" && (kp.qstreak >= 2 || kp.breakout) && <div className="sp-zone"><Icon name="chart" size={14}/>
          {kp.qstreak >= 2 && <span>Price zones rising for <b>{kp.qstreak} quarters</b></span>}{kp.breakout && <span>Broke out after <b>{kp.breakout.n} {kp.breakout.unit}</b></span>}</div>}
        <div className="sp-whyp"><span className="px-label"><AiSpark/> Why it is in your SIP</span><ul>{(h.why || []).slice(0, 6).map((t, i) => <li key={i}>{t}</li>)}</ul></div>
        <div className="sp-buy"><div><small>This SIP buys</small><b>{buyText(h, freq)}</b></div><div><small>Per {WORD[freq]}</small><b>{inr(h.amt)}</b></div><div><small>Per year</small><b>{inrShort(h.year)}</b></div></div>
        {h.kind === "etf" && h.peers && h.peers.length > 0 && <div className="sp-peers"><span className="px-label">Also follow {h.grp}</span>
          {h.peers.map(p => <div key={p.s}><b>{p.s}</b><small>{EASE[p.lq] || "—"} to trade</small><Strength v={p.st}/></div>)}</div>}
      </aside>
    </div>);
}

// ── "How to buy this SIP" (owner: "how to purchase the SIP in the broker … recommend Zerodha, zero brokerage") ──
function HowToBuy({ res, onClose }) {
  const w = WORD[res.freq], hs = res.holdings;
  return (
    <Modal onClose={onClose} label="How to buy this SIP" id="sip-how">
      <div className="tk-mh"><div><div className="px-eyebrow"><AiSpark/> How to buy</div><h3>Set up this SIP in your broker</h3>
        <small>Recommended: Zerodha Kite — India's largest broker, zero brokerage on equity delivery (stocks and ETFs held, not traded).</small></div>
        <button type="button" className="tk-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
      <ol className="sp-howl">
        <li>Open <b>Kite</b> (app or kite.zerodha.com) and sign in.</li>
        <li>Search the ticker below (NSE), tap <b>Buy</b>.</li>
        <li>Choose <b>SIP</b> (Create SIP) instead of a one-time order.</li>
        <li>Set the <b>amount</b> (or quantity) shown below and the frequency: <b>{w === "month" ? "monthly" : "quarterly"}</b>. Pick a start date.</li>
        <li>Confirm. Repeat for each holding — or add them to a <b>basket</b> and create one basket SIP.</li>
        <li>Each {w}, Hyperplane AI re-checks the plan: open <b>My portfolios → Momentum check</b> and follow any change.</li>
      </ol>
      <div className="hp-tw"><table className="hp-t"><thead><tr><th>Ticker</th><th className="num">₹ per {w}</th><th className="num">About</th></tr></thead>
        <tbody>{hs.map(h => <tr key={h.s}><td><span className="sym">{h.s}</span><span className="sub">{h.n !== h.s ? h.n : h.grp}</span></td><td className="num">{inr(h.amt)}</td>
          <td className="num">{(h.every || 1) > 1 ? `1 every ${h.every} ${w}s` : `${h.units} ${h.kind === "etf" ? "unit" : "share"}${h.units === 1 ? "" : "s"}`}</td></tr>)}</tbody></table></div>
      <div className="sp-howf"><span className="lbl">Copy all tickers</span><CopyBtns syms={hs.map(h => h.s)}/></div>
      <p className="svp-note">Steps can change — check your broker's help page. Any broker with SIPs in stocks / ETFs works. For education only, not investment advice.</p>
    </Modal>);
}

function SipView({ apps = [], onAddToPortfolio, onOpenApp, onOut, onHelpdesk, mode = "etf" }) {
  const M = MODES[mode], APP = M.app, isStock = mode === "stock";
  const S_IN = `hp_${APP}_in_v4`, S_RES = `hp_${APP}_res_v4`;
  const loadIn = () => { try { const v = JSON.parse(localStorage.getItem(S_IN) || "{}"); return { ...M.def, ...v, ...(M.def.opts ? { opts: { ...M.def.opts, ...(v.opts || {}) } } : {}), ...(M.def.mix ? { mix: { ...M.def.mix, ...(v.mix || {}) } } : {}) }; } catch { return { ...M.def }; } };
  const [tab, setTab] = useState("build");
  const [inp, setInpRaw] = useState(loadIn);
  const setInp = p => setInpRaw(o => { const n = { ...o, ...p }; try { localStorage.setItem(S_IN, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const setOpt = p => setInp({ opts: { ...inp.opts, ...p } });
  const [amtText, setAmtText] = useState(() => loadIn().amount.toLocaleString("en-IN"));
  const [info, setInfo] = useState(null), [infoErr, setInfoErr] = useState("");
  const [res, setResRaw] = useState(() => { try { return JSON.parse(sessionStorage.getItem(S_RES) || "null"); } catch { return null; } });
  const setRes = r => { setResRaw(r); try { r ? sessionStorage.setItem(S_RES, JSON.stringify(r)) : sessionStorage.removeItem(S_RES); } catch { /* ignore */ } };
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [open, setOpen] = useState(null), [how, setHow] = useState(false);
  const [sent, setSent] = useState(""), [saving, setSaving] = useState(false), [msg, setMsg] = useState("");
  const [nSaved, setNSaved] = useState(null), [sim, setSimRaw] = useState({ rate: 0, step: 0 }), [shut, setShut] = useState(() => new Set());
  const setSim = p => setSimRaw(o => ({ ...o, ...p }));
  const [flt, setFltRaw] = useState(null);                          // { by: "sec" | "cap" | "grp" | "type", v } — the table filter
  const setFlt = f => { setFltRaw(f); setTimeout(() => { const t = document.getElementById(`${APP}-table`); if (f && t) t.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 30); };
  useEffect(() => {
    api(`/app/api/${APP}/info`).then(setInfo).catch(e => { if (e.status === 401) onOut(e.message); else setInfoErr(e.message || `Could not load the ${M.product}.`); });
    api(`/app/api/saved?kind=${APP}`).then(r => setNSaved(r.length)).catch(() => {});
    try { if (sessionStorage.getItem(`hp_open_${APP}`)) setTab("mine"); } catch { /* ignore */ }   // opened from a notification
    const on = e => { if (e.detail && e.detail.app === APP) setTab("mine"); };
    window.addEventListener("hp-open", on);
    return () => window.removeEventListener("hp-open", on);
  }, []);
  useAsOf(APP, (res && res.as_of) || (info && info.as_of));
  const plan = isStock && info && info.plan ? info.plan : null;              // the Momentum SIP level (Customer / Admin)
  const locked = !!plan && !plan.options;
  const minA = (info && info.min_amount) || 5000, maxA = (plan && plan.max_amount) || (info && info.max_amount) || 1e7;
  const adv = { ...ADV_DEFAULT, ...(inp.adv || {}) };
  const setAdv = p => setInp({ adv: { ...adv, ...p } });
  // a customer's saved choices from before (or another level): back within the level
  useEffect(() => {
    if (!plan) return;
    const rel = inp.rel.filter(r => plan.reliability.includes(r));
    const fix = {};
    if (rel.length !== inp.rel.length) fix.rel = rel.length ? rel : ["S"];
    if (inp.count != null && (inp.count > plan.max_count || inp.count < plan.min_count)) fix.count = null;
    if (locked && (inp.adv || inp.sector !== 10)) { fix.adv = null; fix.sector = 10; }
    if (Object.keys(fix).length) setInp(fix);
  }, [plan && plan.tier]);
  const amtOk = inp.amount >= minA && inp.amount <= maxA;
  const rec = isStock ? recFrom(inp.amount, info && info.msip_rule, 30) : 0;
  const nProblem = isStock && plan && inp.count != null ? (inp.count < plan.min_count ? `Choose at least ${plan.min_count} stocks.`
    : inp.count > plan.max_count ? `Your access allows up to ${plan.max_count} stocks.` : "") : "";
  const problem = !amtOk ? (inp.amount < minA ? `Enter at least ${inr(minA)} per ${WORD[inp.freq]}.`
      : plan && plan.tier === "customer" ? `Your access allows up to ${inr(maxA)} per ${WORD[inp.freq]}.` : `A SIP can be up to ${inrShort(maxA)} per ${WORD[inp.freq]}.`)
    : isStock && !inp.rel.length ? "Pick at least one reliability level." : nProblem || (!(inp.years >= 1 && inp.years <= 40) ? "Plan between 1 and 40 years." : "");
  const setAmount = t => { const d = t.replace(/[^\d]/g, "").slice(0, 9); setAmtText(d ? Number(d).toLocaleString("en-IN") : ""); setInp({ amount: Number(d) || 0 }); };
  // a quick start from a public portfolio page ("Start your SIP · ₹25K a month" → sign up → here): the amount is filled in
  useEffect(() => { try { const x = JSON.parse(sessionStorage.getItem("hp_intent") || "null");
    if (x && x.app === APP && x.amount > 0) { setAmount(String(x.amount)); sessionStorage.removeItem("hp_intent"); } } catch { /* ignore */ } }, []);
  const body = () => isStock ? { amount: inp.amount, freq: inp.freq, rel: inp.rel, mix: inp.mix, count: inp.count, years: inp.years,
      ...(locked ? {} : { opts: adv, sector_max: inp.sector }) }
    : { amount: inp.amount, freq: inp.freq, opts: { gold: inp.opts.gold, caps: inp.opts.caps, style: inp.opts.style }, years: inp.years };
  const build = () => {
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(""); setSent(""); setMsg("");
    api(`/app/api/${APP}`, { method: "POST", json: body() })
      .then(r => { setRes(r); setShut(new Set()); setFltRaw(null); window.scrollTo(0, 0); })
      .catch(e => { if (e.status === 401) onOut(e.message); else setErr(e.message); })
      .finally(() => setBusy(false));
  };
  const canPf = apps.some(x => x.key === "portfolio"), canEtf = apps.some(x => x.key === "etf");
  const tabs = (
    <div className="hp-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "build"} className={tab === "build" ? "on" : ""} onClick={() => setTab("build")} id={`${APP}-tab-build`}><Icon name="sparkles" size={14}/> Build</button>
      <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")} id={`${APP}-tab-mine`}><Icon name="star" size={14}/> My portfolios{nSaved ? ` · ${nSaved}` : ""}</button>
    </div>);
  const chip = <span className={`sp-mode ${isStock ? "risk" : "safe"}`} id={`${APP}-mode`}>{isStock ? <Icon name="alert" size={12}/> : <Icon name="check" size={12}/>} {M.chip}</span>;
  const canSip = apps.some(x => x.key === "sip");
  const risk = isStock && <div className="sp-risk" role="note" id={`${APP}-risk`}><Icon name="alert" size={16}/><div><b>Higher risk.</b> Single stocks move much more than ETFs and can fall sharply.
    Invest only money you can keep for years. Hyperplane AI re-checks every stock after each update and alerts you when one turns down.
    {canSip && <button type="button" className="sp-tolink" id={`${APP}-to-sip`} onClick={() => onOpenApp("sip")}>Prefer lower risk? Try the AI ETF SIP Builder <span aria-hidden="true">→</span></button>}</div></div>;
  const limitNote = <div className="sp-help" id={`${APP}-limit`}><Icon name="info" size={14}/><span>Need a higher amount? Raise a request in <b>Helpdesk</b> (your profile icon → Helpdesk).</span>
    {onHelpdesk && <button type="button" className="sp-helpb" onClick={() => onHelpdesk(null, "limit")}>Request a higher limit</button>}</div>;

  // ── My portfolios ──
  if (tab === "mine") return (
    <div className="sp" id={`${APP}-saved`}>
      <BrandBand product={M.product} title="My portfolios" accent="tracked every day" right={<>{chip}{tabs}</>}
        info="Each saved portfolio is tracked from the day you saved it. Stocks are re-checked after every update; core index ETFs and gold stay."/>
      {risk}
      <MyPortfolios app={APP} onOut={onOut} onCount={setNSaved}/>
    </div>);

  // ── result ──
  if (res) {
    const w = WORD[res.freq], hs = res.holdings;
    const stocks = hs.filter(h => h.kind === "stock"), etfs = hs.filter(h => h.kind === "etf");
    const shown = h => !flt || FILTER_BY[flt.by](h) === flt.v;
    const pick = by => v => setFlt(v ? { by, v } : null);
    const styleOf = res.inputs && res.inputs.opts && res.inputs.opts.style;
    const nCore = etfs.filter(h => h.role === "core").length, nExtra = etfs.filter(h => h.role === "theme" || h.role === "diversifier").length, nGold = etfs.filter(h => h.sleeve === "commodity").length;
    const groups = isStock
      ? CAPS.map(([k, l], i) => ({ k, label: l, color: CAP_COL[i], rows: stocks.filter(h => h.cap === k) }))
      : [{ k: "core", label: "Core index · Nifty large, mid and small", color: "var(--acc)", rows: etfs.filter(h => h.role === "core") },
         { k: "extra", label: "Strongest ETFs today · themes, strategy, international", color: "#8b5cf6", rows: etfs.filter(h => h.role === "theme" || h.role === "diversifier") },
         { k: "metal", label: "Gold & silver", color: "#d4a72c", rows: etfs.filter(h => h.sleeve === "commodity") }];
    const csv = () => {
      const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = [["Group", "Type", "Name", "Ticker", isStock ? "Reliability" : "Role", "Long-term strength", "Qty each time", "Price per unit (₹)", `₹ per ${w}`, "Size %", "Why"],
        ...hs.map(h => [h.grp, h.kind === "etf" ? "ETF" : "Stock", h.n, h.s, isStock ? REL_WORD[h.rel] : ROLE[h.role], h.st, h.every > 1 ? `1 every ${h.every} ${w}s` : h.units, h.p, h.amt, h.w, (h.why || []).join("; ")])];
      const el = document.createElement("a");
      el.href = URL.createObjectURL(new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
      el.download = `Hyperplane-${isStock ? "Momentum-SIP" : "SIP"}-${new Date().toISOString().slice(0, 10)}.csv`; el.click(); trackAction(APP, "download");
    };
    const pdf = () => loadChunk(() => import("../sip-report.js")).then(({ downloadSipReport }) => { downloadSipReport(res, sim.rate, sim.step); trackAction(APP, "download"); }).catch(e => setMsg(e.message));
    const send = how_ => { setSent("busy"); onAddToPortfolio(stocks.map(h => h.s), how_).then(() => { setSent(how_); trackAction(APP, "sent"); }).catch(e => setSent(`Could not update the list: ${e.message}`)); };
    const rows = simulate(res.invested, res.per_year, res.years_plan, sim.step, sim.rate);
    const last = rows[rows.length - 1];
    const secs = new Set(stocks.map(h => h.sec)).size;
    return (
      <div className="sp" id={`${APP}-result`}>
        <BrandBand product={M.product} title={isStock ? "Your Momentum SIP" : "Your SIP"} accent={`${inrShort(res.amount)} a ${w}`} sub={`${res.count} holdings`} right={<>{chip}{tabs}</>}/>
        {risk}
        <div className="hp-actbar">
          {/* round 16 (owner: "the buttons look awkward"): one slim row — your actions · one joined export group · how to buy · send on the right */}
          <button type="button" className="px-btn" id={`${APP}-edit`} onClick={() => setRes(null)}><Icon name="list" size={14}/> Edit inputs</button>
          <button type="button" className="px-btn" id={`${APP}-save`} onClick={() => { setSaving(v => !v); setMsg(""); }}><Icon name="star" size={14}/> Save</button>
          <span className="hp-grp" role="group" aria-label="Export">
            <button type="button" className="px-btn" onClick={pdf} id={`${APP}-pdf`}><Icon name="copy" size={14}/> PDF</button>
            <button type="button" className="px-btn" onClick={csv} id={`${APP}-csv`}><Icon name="table" size={14}/> CSV</button>
            <span className="tcopy"><span className="lbl">Tickers · {hs.length}</span><CopyBtns syms={hs.map(h => h.s)}/></span></span>
          <button type="button" className="px-btn hp-link" id={`${APP}-how-btn`} onClick={() => setHow(true)}><Icon name="info" size={14}/> How to buy</button>
          {canPf && stocks.length > 0 && <button type="button" className="px-btn primary" id={`${APP}-send`} disabled={sent === "busy"} onClick={() => setSent("ask")}>Send to AI Portfolio Analyser <Icon name="chevron" size={14}/></button>}
        </div>
        {saving && <SaveBar kind={APP} defName={`${inrShort(res.amount)} ${M.word}`} inputs={res.inputs} holdings={hs} onCancel={() => setSaving(false)}
          onDone={m => { setSaving(false); setMsg(m); setNSaved(n => (n || 0) + 1); }}/>}
        {msg && <SavedNote id={`${APP}-msg`} msg={msg} onOpen={() => setTab("mine")} onClose={() => setMsg("")}/>}
        {sent === "ask" && <div className="px-card sp-confirm" role="alert" id={`${APP}-ask`}>
          <span>Put the {stocks.length} stocks in your AI Portfolio Analyser list?</span>
          <button type="button" className="px-btn primary" onClick={() => send("add")}>Add to my list</button>
          <button type="button" className="px-btn" onClick={() => send("replace")}>Replace my list</button>
          <button type="button" className="px-btn" onClick={() => setSent("")}>Cancel</button></div>}
        {(sent === "add" || sent === "replace") && <div className="px-card sp-confirm ok" id={`${APP}-done`}>
          <span><Icon name="check" size={14}/> {sent === "replace" ? `Your Analyser list now holds these ${stocks.length} stocks.` : "Added to your Analyser list."}</span>
          <button type="button" className="px-btn primary" onClick={() => onOpenApp("portfolio")}>Open the Analyser</button>
          {etfs.length > 0 && canEtf && <button type="button" className="px-btn" onClick={() => onOpenApp("etf")}>ETFs in the ETF Analyser</button>}</div>}
        {sent && !["ask", "busy", "add", "replace"].includes(sent) && <div className="pf-miss" role="alert">{sent}</div>}
        {res.over_note && <div className="sp-over" id={`${APP}-over`}><Icon name="info" size={15}/>{res.over_note}</div>}

        <section className="sp-kpis">
          <div className="px-card sp-kpi"><span className="px-label">Each {w}</span><b>{inr(res.invested)}</b><small>{res.over ? `+${inr(res.over)} over` : `of ${inr(res.amount)}`}</small></div>
          {isStock ? <div className="px-card sp-kpi"><span className="px-label">Stocks</span><b>{stocks.length}</b><small>across {secs} sectors</small></div>
            : <div className="px-card sp-kpi sp-kpin" id={`${APP}-picked`}><span className="px-label">ETFs picked for you</span>
                <b>{etfs.length}{styleOf ? <small> · {STYLE_NAME[styleOf]}</small> : null}</b>
                <span className="sp-pick" aria-hidden="true"><i style={{ flexGrow: nCore, background: "var(--acc)" }}/><i style={{ flexGrow: nExtra, background: "#8b5cf6" }}/><i style={{ flexGrow: nGold, background: "#d4a72c" }}/></span>
                <small>{nCore} core index · {nExtra} strongest · {nGold} gold{nGold > 1 ? " & silver" : ""}</small></div>}
          {isStock ? <div className="px-card sp-kpi"><span className="px-label">Average strength</span><b className={tc(res.st_avg)}>{plus(res.st_avg)}</b><small>{trendWordOf(res.st_avg)}</small></div>
            : <div className="px-card sp-kpi"><span className="px-label">Split</span><b className="sp-kpi-sm">{res.sleeves.index}% equity · {res.sleeves.commodity}% gold</b><small>by money each {w}</small></div>}
          <div className="px-card sp-kpi"><span className="px-label">Put in, {res.years_plan} years</span><b>{inrShort(last.put)}</b><small>{sim.step ? `with +${sim.step}% a year` : "same amount each time"}</small></div>
        </section>

        <section className="sp-row2">
          <div className="px-card px-sumc sp-ai" id={`${APP}-ai`}>
            <div className="px-label"><AiSpark/> Hyperplane AI summary <Info text={I.ai}/></div>
            <ul className="px-points">{res.summary.map(([t, txt], i) => <li key={i} className={`pl-${t}`}>{txt}</li>)}
              {res.notes.map((n, i) => <li key={`n${i}`} className="pl-mid">{n}</li>)}</ul>
            <AiNumbers res={res} hs={hs} isStock={isStock} w={w}/>
          </div>
          <div className="px-card sp-ins" id={`${APP}-insights`}>
            {isStock ? <><Bars title="Stocks by market cap" rows={shares(hs, "cap")} on={flt && flt.by === "cap" ? flt.v : null} onPick={pick("cap")} id={`${APP}-f-cap`}/>
                <Bars title="Sectors" rows={shares(hs, "sec")} on={flt && flt.by === "sec" ? flt.v : null} onPick={pick("sec")} id={`${APP}-f-sec`}/></>
              : <><Bars title="Where the money goes" rows={shares(hs, "type")} on={flt && flt.by === "type" ? flt.v : null} onPick={pick("type")} id={`${APP}-f-type`}/>
                <Bars title="Markets" rows={shares(hs, "grp")} on={flt && flt.by === "grp" ? flt.v : null} onPick={pick("grp")} id={`${APP}-f-grp`}/></>}
          </div>
        </section>

        <section className="px-card sp-tcard" id={`${APP}-table`}>
          <div className="hp-tbar"><h3>Holdings<small>{flt ? `${hs.filter(shown).length} of ${hs.length}` : hs.length} · click one for its insights</small></h3>
            {flt && <span className="sp-fchip" id={`${APP}-fchip`}>{flt.v}<button type="button" id={`${APP}-fclear`} onClick={() => setFltRaw(null)} aria-label="Clear the filter">Clear filter <Icon name="x" size={11}/></button></span>}
            <button type="button" className="hp-gall" onClick={() => setShut(o => o.size ? new Set() : new Set(groups.map(g => g.k)))} id={`${APP}-gall`}>{shut.size ? "Show all groups" : "Collapse all groups"}</button></div>
          <div className="hp-tw"><table className="hp-t">
            <thead><tr><th>Instrument</th><th>{isStock ? "Reliability" : "Role"}</th><th>Long-term strength</th><th className="num">Qty each {w}</th>
              <th className="num">Price per unit</th><th className="num">₹ per {w}</th><th className="num">Size</th></tr></thead>
            <tbody>{groups.map(g => ({ ...g, rows: g.rows.filter(shown) })).filter(g => g.rows.length).map(g => { const amt = g.rows.reduce((t, h) => t + h.amt, 0); return <React.Fragment key={g.k}>
              <GroupRow cols={7} open={!shut.has(g.k)} onToggle={() => setShut(o => { const x = new Set(o); x.has(g.k) ? x.delete(g.k) : x.add(g.k); return x; })}
                color={g.color} label={g.label} id={`${APP}-grp-${g.k}`}
                meta={<><span>{g.rows.length} holding{g.rows.length === 1 ? "" : "s"}</span><span><b>{inr(amt)}</b> a {w}</span><span><b>{(amt / res.invested * 100).toFixed(1)}%</b> of the SIP</span></>}/>
              {!shut.has(g.k) && g.rows.map(h => <tr key={h.s} className="hp-row sp-in" onClick={() => setOpen(h)} data-sym={h.s} data-sec={h.sec || h.grp}>
                <td><span className="sym">{h.s}</span><span className="sub">{h.n !== h.s ? h.n : h.grp}{h.kind === "stock" ? ` · ${h.sec}` : ""}</span></td>
                <td>{h.kind === "stock" ? <span className={`hp-rel ${h.rel}`}><i/>{REL_WORD[h.rel]}{h.rs != null ? ` · ${h.rs}` : ""}</span> : <span className="hp-rel">{ROLE[h.role] || "ETF"}</span>}</td>
                <td><Strength v={h.st}/></td>
                <td className="num"><b>{h.every > 1 ? `1 every ${h.every} ${w}s` : h.units}</b></td>
                <td className="num">{inr2(h.p)}</td>
                <td className="num"><b>{inr(h.amt)}</b></td>
                <td className="num">{h.w}%</td></tr>)}
            </React.Fragment>; })}</tbody>
          </table></div>
          <div className="tk-foot">{isStock ? "Each stock gets the same money every instalment; a costly share is bought every few instalments." : "Core index ETFs are kept whatever the trend; a theme leaves only in a long-term downtrend."} Prices change daily — the money each {w} stays the same.</div>
        </section>

        <section className="px-card sp-sim" id={`${APP}-sim`}>
          <div className="sp-hh"><b><Icon name="chart" size={15}/> Growth simulator</b><small>{res.years_plan} years <Info text={I.sim}/></small></div>
          <div className="sp-simb">
            <div className="sp-simc">
              <span className="px-label">Assumed growth a year</span>
              <div className="sp-rate" style={{ "--f": sim.rate / RATE_MAX }}>
                <output className="sp-bub" htmlFor={`${APP}-rate`} id={`${APP}-rate-val`}>{sim.rate ? `${sim.rate}% a year` : "No growth"}</output>
                <input type="range" className="al-range" min="0" max={RATE_MAX} step="1" value={sim.rate} onChange={e => setSim({ rate: +e.target.value })} aria-label="Assumed growth a year" id={`${APP}-rate`}
                  style={{ "--c": "var(--sp-ai)", "--v": `${sim.rate / RATE_MAX * 100}%` }}/>
                <div className="sp-rticks" aria-hidden="true"><span>0%</span><span>5%</span><span>10%</span><span>15%</span></div>
              </div>
              <span className="px-label">Step-up: raise the instalment every year <Info text="Most people raise their SIP as their income grows. Each year the instalment goes up by this %."/></span>
              <div className="sp-chips" role="group" aria-label="Step-up">{STEPUPS.map(v => <button key={v} type="button" className={sim.step === v ? "on" : ""} onClick={() => setSim({ step: v })} id={`${APP}-s-${v}`}>{v ? `+${v}% a year` : "Same amount"}</button>)}</div>
              <div className="sp-simk"><div><small>You put in</small><b>{inrShort(last.put)}</b></div>
                <div className="hl"><small>{sim.rate ? `At ${sim.rate}% a year` : "Without growth"}</small><b id={`${APP}-simval`}>{inrShort(last.val)}</b></div></div>
            </div>
            <div className="sp-stt"><div className="h"><span>Year</span><span className="num">Each {w}</span><span className="num">Put in</span><span className="num">{sim.rate ? `At ${sim.rate}%` : "Value"}</span></div>
              {rows.map(r => <div key={r.y}><span>{r.y}</span><span className="num">{inr(r.each)}</span><span className="num">{inrShort(r.put)}</span><span className="num"><b>{inrShort(r.val)}</b></span></div>)}</div>
          </div>
        </section>
        {open && <Insight h={open} freq={res.freq} onClose={() => setOpen(null)}/>}
        {how && <HowToBuy res={res} onClose={() => setHow(false)}/>}
      </div>);
  }

  // ── form (the AI Portfolio Builder layout: numbered steps on the left, How it works + Your plan on the right) ──
  if (infoErr) return <div className="sp"><section className="card sp-empty" role="alert"><Icon name="info" size={18}/>{infoErr}</section></div>;
  const o = inp.opts || {};
  const togRel = k => setInp({ rel: inp.rel.includes(k) ? inp.rel.filter(x => x !== k) : REL.map(([r]) => r).filter(r => r === k || inp.rel.includes(r)) });
  const passing = info && info.by_rel && isStock ? inp.rel.reduce((t, r) => t + (info.by_rel[r] || 0), 0) : null;
  const n = inp.count || rec, fw = WORD[inp.freq];
  const range = info && info.spread ? (info.spread.find(([cut]) => cut == null || inp.amount <= cut) || []).slice(1) : null;   // the AI Portfolio Builder's range for the amount
  const caps = o.caps || {}, nCores = !isStock ? ["Large", "Mid", "Small"].filter(k => caps[k] > 0).length + (caps.Large > 0 ? 1 : 0) : 0;
  const nMetal = !isStock && o.gold > 0 ? 1 : 0;
  const pool = info && info.etf_pool ? info.etf_pool : null;                                    // how many ETFs each style holds today
  const step = (no, label, hint) => <span className="bd-l">{no} · {label}{hint && <Info text={hint}/>}</span>;
  const advChanged = Object.keys(ADV_DEFAULT).filter(k => JSON.stringify(adv[k]) !== JSON.stringify(ADV_DEFAULT[k])).length + (inp.sector !== 10 ? 1 : 0);
  const howSteps = isStock ? [
    ["Tell us the plan", "Amount, how often, reliability, the market-cap mix and how many stocks."],
    ["Hyperplane AI picks", "Momentum stocks across many sectors, never too many from one industry."],
    ["Get the list", "Each stock with the money every instalment. Save it to get an alert when a stock turns down."],
  ] : [
    ["Tell us the plan", "Amount, how often, the gold share, the market-cap mix and how focused you want it."],
    ["Hyperplane AI picks", "What is going up today — with the core Nifty index ETFs in Standard and More diversified. All easy to trade."],
    ["Get the list", "Each ETF with the units and money every instalment, and how to set it up in your broker."],
  ];
  return (
    <div className="sp" id={`${APP}-form`}>
      <BrandBand product={M.product} title={M.title} accent={M.accent} info={M.info} right={<>{chip}{tabs}</>}
        sub={info ? (isStock ? `${passing} stocks pass the momentum checks today` : `${info.core.filter(c => c.s).length} core index ETFs · ${info.etf_pool ? info.etf_pool.up : info.themes} others going up today`) : ""}/>
      {risk}
      <section className="card pf-start bd-start sp-start">
        <div className="pf-sl">
          <div className="bd-f" id={`${APP}-amount`}>
            <label className="bd-l" htmlFor={`${APP}-amt`}>1 · Amount every {fw}</label>
            <div className="sp-amtrow">
              <div className="bd-amt"><span>₹</span><input id={`${APP}-amt`} inputMode="numeric" value={amtText} onChange={e => setAmount(e.target.value)} aria-label="SIP amount in rupees"/>
                <em>{amtOk ? inrShort(inp.amount) : ""}</em></div>
              <div className="sp-seg" role="group" aria-label="How often">{[["month", "Monthly"], ["quarter", "Quarterly"]].map(([k, l]) => (
                <button key={k} type="button" id={`${APP}-f-${k}`} className={inp.freq === k ? "on" : ""} onClick={() => setInp({ freq: k })}>{l}</button>))}</div></div>
            <div className="bd-chips">{AMOUNTS.filter(v => v <= maxA).map(v => <button key={v} type="button" className={inp.amount === v ? "on" : ""} onClick={() => setAmount(String(v))}>{v < 100000 ? `₹${v / 1000} K` : inrShort(v)}</button>)}</div>
            {plan && plan.tier === "customer" && <div className="bd-hint" id={`${APP}-access`}>Your access allows up to <b>{inr(maxA)}</b> per {fw} and up to <b>{plan.max_count}</b> stocks.</div>}
            {!amtOk && inp.amount > 0 && <div className="pf-miss bd-ferr" role="alert">{problem}</div>}
            {limitNote}
          </div>

          {!isStock && <div className="bd-f" id={`${APP}-gold`}>{step(2, "Equity ETFs and gold", I.gold)}
            <Sliders keys={["eq", "gold"]} labels={[["Equity ETFs", "index + other ETFs"], ["Gold", "silver too from 20 %"]]} vals={{ eq: 100 - o.gold, gold: o.gold }}
              onChange={v => setOpt({ gold: Math.min(50, v.gold) })} idp={`${APP}-g`} colors={["var(--acc)", "#d4a72c"]} amount={inp.amount} word={fw} max={{ gold: 50 }}/>
            <div className="bd-hint">Gold can be up to 50 %. A little gold steadies the SIP when shares fall.</div></div>}

          {!isStock && <div className="bd-f" id={`${APP}-caps`}>{step(3, "Index market-cap mix", I.caps)}
            <Sliders keys={["Large", "Mid", "Small"]} labels={[["Large cap", "Nifty 50 + Nifty Next 50"], ["Mid cap", "Nifty Midcap 150"], ["Small cap", "Nifty Smallcap 250"]]} vals={caps}
              onChange={v => setOpt({ caps: v })} idp={`${APP}-c`} colors={CAP_COL} amount={inp.amount * (100 - o.gold) / 100} word={fw}/></div>}

          {!isStock && <div className="bd-f" id={`${APP}-style`}>{step(4, "How focused", "Focus holds only what is going up today. Standard holds the core Nifty index ETFs plus what is going up. More diversified adds steady strategy, international and other index ETFs on top of Standard. The core index already diversifies, so Focus and Standard never add diversifiers.")}
            <div className="sp-styles" role="radiogroup" aria-label="How focused">{STYLES.map(([k, l, sub, d]) => { const n = pool ? pool[k] + (o.gold > 0 ? 1 : 0) : null; return (
              <button key={k} type="button" role="radio" aria-checked={o.style === k} id={`${APP}-st-${k}`} className={`sp-style ${o.style === k ? "on" : ""}`} onClick={() => setOpt({ style: k })}>
                <span className="sp-sttop"><b>{l}</b>{n != null && <em>{n} ETFs today</em>}</span>
                <span className="sp-stsub">{sub}</span><small>{d}</small>
                <i className="sp-stbar" aria-hidden="true"><u style={{ flexGrow: k === "focus" ? 0 : 4, background: "var(--acc)" }}/><u style={{ flexGrow: k === "focus" ? 4 : 2, background: "#8b5cf6" }}/>{k === "diverse" && <u style={{ flexGrow: 2, background: "#22d3ee" }}/>}</i>
              </button>); })}</div>
            <div className="bd-hint" id={`${APP}-st-hint`}>{pool ? <>Today: <b>{pool.core_up}</b> of the {pool.core} core markets and <b>{pool.up}</b> other ETFs are going up{pool.div ? <>; <b>{pool.div}</b> diversifiers are available</> : null}.</> : ""}</div></div>}

          {isStock && <div className="bd-f" id={`${APP}-rel`}>{step(2, "Stock reliability", I.rel)}
            <div className="bd-chips" role="group" aria-label="Reliability">{REL.map(([k, l]) => plan && !plan.reliability.includes(k)
              ? <button key={k} type="button" id={`${APP}-r-${k}`} className="off" disabled title={`${l} reliability is not included in your access`}><Icon name="lock" size={12}/> {l}</button>
              : <button key={k} type="button" id={`${APP}-r-${k}`} className={inp.rel.includes(k) ? "on" : ""} aria-pressed={inp.rel.includes(k)} onClick={() => togRel(k)}>
                <Icon name={inp.rel.includes(k) ? "check" : "plus"} size={12}/> {l}</button>)}</div>
            <div className="bd-hint">{passing != null ? <><b>{passing}</b> stocks pass the momentum checks with this choice.</> : ""}</div></div>}

          {isStock && <div className="bd-f" id={`${APP}-mix`}>{step(3, "Stock mix")}
            <Sliders keys={["Large", "Mid", "Small"]} labels={[["Large cap", "the 100 biggest companies"], ["Mid cap", "the next 150"], ["Small cap", "smaller companies"]]} vals={inp.mix}
              onChange={v => setInp({ mix: v })} idp={`${APP}-m`} colors={CAP_COL} amount={inp.amount} word={fw}/></div>}

          {isStock && <div className="bd-f" id={`${APP}-count`}>{step(4, "How many stocks")}
            <div className="bd-chips">
              <button type="button" id={`${APP}-c-rec`} className={`sp-rec ${inp.count == null ? "on" : ""}`} onClick={() => setInp({ count: null })}><AiSpark/> Recommended · {rec}</button>
              {MSIP_CHIPS.filter(c => (!plan || (c <= plan.max_count && c >= plan.min_count)) && c <= Math.max(rec * 2, 40)).map(c => <button key={c} type="button" className={inp.count === c ? "on" : ""} onClick={() => setInp({ count: c })}>{c}</button>)}
              <label className="sp-nbox"><span>Or enter</span><input type="number" id={`${APP}-n`} inputMode="numeric" min={plan ? plan.min_count : 10} max={plan ? plan.max_count : 50} step="1"
                value={inp.count ?? ""} placeholder={String(rec)} aria-label="Number of stocks"
                onChange={e => { const v = e.target.value.replace(/[^\d]/g, "").slice(0, 4); setInp({ count: v ? Math.round(+v) : null }); }}/><em>stocks</em></label></div>
            {nProblem && <div className="pf-miss bd-ferr" role="alert" id={`${APP}-n-err`}>{nProblem}</div>}
            <div className="bd-hint" id={`${APP}-rec-hint`}>{range ? <>For <b>{inrShort(inp.amount)}</b> a {fw} a typical range is <b>{range[0]} to {range[1]}</b> stocks; Hyperplane AI suggests <b>{rec}</b>. </> : null}
              About <b>{inr(inp.amount / n)}</b> per stock each {fw}. {plan ? `${plan.min_count} to ${plan.max_count.toLocaleString("en-IN")} stocks${locked ? " with your access" : ""}. ` : ""}More stocks spread the risk.</div></div>}

          {isStock && <details className="bd-more" id={`${APP}-more`}>
            <summary>More options <span>{locked ? <><Icon name="lock" size={12}/> fixed for your access</> : advChanged ? `${advChanged} changed` : "horizon · trend quality · regime · run-up · sectors"}</span></summary>
            {locked && <div className="bd-lock" id={`${APP}-lock`}><Icon name="lock" size={14}/> These are the standard settings, fixed for your access.</div>}
            <fieldset className="bd-fs" disabled={locked}>
              <div className="bd-f"><span className="bd-l">Time horizon <Info text="How the monthly, quarterly and yearly trends are blended. Long term follows the AI Portfolio Analyser. Medium term gives the month more weight."/></span>
                <div className="bd-chips bd-cards2">{A_HORIZON.map(([k, l, d]) => <button key={k} type="button" id={`${APP}-h-${k}`} className={adv.horizon === k ? "on" : ""} onClick={() => setAdv({ horizon: k })}><b>{l}</b><small>{d}</small></button>)}</div></div>
              <div className="bd-f"><span className="bd-l">Trend quality <Info text="Leaders only: only the strongest long-term trends. Proven trends: every stock with a good trend. Proven + emerging: when there are not enough proven ones, stocks whose trend is still building fill the gap."/></span>
                <div className="bd-chips bd-cards2 three">{A_QUALITY.map(([k, l, d]) => <button key={k} type="button" id={`${APP}-q-${k}`} className={adv.quality === k ? "on" : ""} onClick={() => setAdv({ quality: k })}><b>{l}</b><small>{d}</small></button>)}</div></div>
              <div className="bd-f"><span className="bd-l">Regime <Info text="Every pick needs an up long-term regime. Confirmed also needs the shorter regime to agree, so it leaves out stocks whose regime has started to fade."/></span>
                <div className="bd-chips bd-cards2">{A_REGIME.map(([k, l, d]) => <button key={l} type="button" id={`${APP}-g-${k ? "c" : "u"}`} className={adv.confirmed === k ? "on" : ""} onClick={() => setAdv({ confirmed: k })}><b>{l}</b><small>{d}</small></button>)}</div></div>
              <div className="bd-f"><span className="bd-l">Leave out stocks that already ran up <Info text="A stock that already rose a lot in the last 3 months has made much of its move. Stocks up 3 times or more in a year are always left out."/></span>
                <div className="bd-chips">{A_RUNUP.map(([v, l]) => <button key={v} type="button" className={adv.run_up === v ? "on" : ""} onClick={() => setAdv({ run_up: v })}>{v ? `Up more than ${l} in 3 months` : l}</button>)}</div></div>
              <div className="bd-f"><span className="bd-l">Stocks</span>
                <div className="bd-chips"><button type="button" id={`${APP}-fno`} className={adv.fno_only ? "on" : ""} onClick={() => setAdv({ fno_only: !adv.fno_only })}>{adv.fno_only ? <><Icon name="check" size={12}/> </> : ""}F&amp;O stocks only (easier to buy and sell)</button></div></div>
              <div className="bd-f"><span className="bd-l">Leave out sectors</span>
                <MultiSelect label="sectors" options={(info && info.sectors) || []} value={adv.exclude} onChange={v => setAdv({ exclude: v })} width={300}/></div>
              <div className="bd-f"><span className="bd-l">Most stocks in one sector <Info text="The share of the stocks one sector may take. A lower limit spreads the SIP over more sectors."/></span>
                <div className="bd-chips">{((plan && plan.sectors) || [10, 15, 20, 25, 30, 40, 100]).map(v => <button key={v} type="button" id={`${APP}-sec-${v}`} className={inp.sector === v ? "on" : ""} onClick={() => setInp({ sector: v })}>{v === 100 ? "No limit" : `${v}%`}</button>)}</div></div>
            </fieldset>
          </details>}

          <div className="bd-f" id={`${APP}-plan`}>{step(5, "How long you plan to invest")}
            <div className="sp-amtrow">
              <div className="bd-amt sp-yrs"><input type="number" min="1" max="40" id={`${APP}-years`} value={inp.years} aria-label="Years"
                onChange={e => setInp({ years: Math.max(0, Math.min(40, Math.round(+e.target.value || 0))) })}/><em>years</em></div>
              <div className="bd-chips">{YEARS.map(y => <button key={y} type="button" className={inp.years === y ? "on" : ""} onClick={() => setInp({ years: y })}>{y} years</button>)}</div></div>
          </div>

          {err && <div className="pf-miss" role="alert" id={`${APP}-err`}>{err}</div>}
          <button type="button" className="pf-go sp-build" id={`${APP}-build`} onClick={build} disabled={busy || !info}><AiSpark/> {busy ? "Building…" : `Build my ${M.word}`}</button>
        </div>

        <aside className="pf-sr">
          <h3>How it works</h3>
          <div className="pf-steps">{howSteps.map(([t, d], i) => <div key={t} className="pf-step"><b>{i + 1}</b><span><strong>{t}</strong>{d}</span></div>)}</div>
          {!isStock && <div className="sp-safen" id={`${APP}-safe`}><Icon name="check" size={16}/><div><b>ETFs are the safest way to run a SIP</b>
            <span>One ETF holds 50 to 250 companies, so a fall in one company barely moves it. Low cost, easy to buy and sell on NSE, and the core index ETFs stay in your SIP whatever the market does.</span>
            <em className="sp-sleep">Sleep peacefully with ETFs.</em></div></div>}
          <h3>Your plan</h3>
          <dl className="bd-sum">
            <div><dt>Amount</dt><dd>{amtOk ? `${inr(inp.amount)} a ${fw}` : "—"}</dd></div>
            {isStock ? <>
              <div><dt>Reliability</dt><dd>{inp.rel.map(r => REL_WORD[r]).join(", ") || "—"}</dd></div>
              <div><dt>Mix</dt><dd>{CAPS.map(([k]) => `${k} ${inp.mix[k]}%`).join(" · ")}</dd></div>
              <div><dt>Stocks</dt><dd>{n}{inp.count == null ? " (recommended)" : ""}</dd></div>
              <div><dt>More options</dt><dd>{locked || !advChanged ? "Standard settings" : `${advChanged} changed`}</dd></div>
            </> : <>
              <div><dt>Equity · gold</dt><dd>{100 - o.gold}% · {o.gold}%</dd></div>
              <div><dt>Index mix</dt><dd>{CAPS.map(([k]) => `${k} ${caps[k]}%`).join(" · ")}</dd></div>
              <div><dt>Style</dt><dd>{STYLE_NAME[o.style]}</dd></div>
            </>}
            <div><dt>Plan</dt><dd>{inp.years} years</dd></div>
          </dl>
          {isStock && canSip && <div className="sp-safen sp-togo" id={`${APP}-safe`}><Icon name="check" size={16}/><div><b>Prefer lower risk?</b>
            <span>The AI ETF SIP Builder uses ETFs only — the safest way to run a SIP.</span>
            <em className="sp-sleep">Sleep peacefully with ETFs.</em>
            <button type="button" className="sp-gobtn" id={`${APP}-to-sip2`} onClick={() => onOpenApp("sip")}>Open AI ETF SIP Builder <span aria-hidden="true">→</span></button></div></div>}
          <div className="pf-trust"><AiSpark/><span>Built on the same engine as the AI Portfolio Analyser. For education only, not investment advice.</span></div>
        </aside>
      </section>
    </div>);
}


export { SipView };
export default function EtfSip(p) { return <SipView {...p} mode="etf"/>; }
