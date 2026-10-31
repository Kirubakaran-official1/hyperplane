// Hyperplane AI Portfolio Builder — a lazily loaded application module.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addCss } from "../core.jsx";
import { CopyBtns, Info, MultiSelect, RELIABILITY, api, colorOf, fmtDT, signed, tc, trendWordOf } from "../core.jsx";
import { CSS } from "./builder.css.js";

addCss("builder", CSS);


// ─── HYPERPLANE AI PORTFOLIO BUILDER (owner, 2026-10-31) ─────────────────────────────────────────────────────
// The customer gives an amount, a stock count, a market-cap mix with cash, and reliability. The SERVER builds the model
// portfolio (builder.py: the AI Portfolio engine's strength and long-term regime, already-moved stocks left out); this
// page only collects the inputs and shows the plan. Role "AI Portfolio Builder" (Admin → Access manager).
// presets (owner, 2026-11-01; Mid was given as 20/50/10/10 = 90%, small set to 20 so it adds to 100)
const B_PRESETS = { large: { Large: 70, Mid: 10, Small: 10, Cash: 10 }, mid: { Large: 20, Mid: 50, Small: 20, Cash: 10 },
  small: { Large: 15, Mid: 15, Small: 60, Cash: 10 }, multi: { Large: 25, Mid: 25, Small: 25, Cash: 25 } };
const B_STYLES = [["large", "Large cap", "Mostly big, established companies"], ["mid", "Mid cap", "Mostly growing, medium-sized companies"],
  ["small", "Small cap", "Mostly smaller companies: faster, but bumpier"], ["multi", "Multi cap", "An even mix of all three"]];
const B_PARTS = [["Large", "Large cap"], ["Mid", "Mid cap"], ["Small", "Small cap"], ["Cash", "Cash (safety)"]];
// colours (owner, 2026-11-01: "why green for small cap — it confuses"): market cap is an ORDERED scale, so one blue in
// three shades (large = most weight = most contrast; reversed in the dark theme) — never green / red / amber, which
// mean up / down / caution in this app — and a hatched neutral grey for cash. Contrast of every label checked.
const B_COL = { Large: "var(--mx-l)", Mid: "var(--mx-m)", Small: "var(--mx-s)", Cash: "var(--mx-c)" };
const B_NAME = { Large: "Large cap", Mid: "Mid cap", Small: "Small cap", Cash: "Cash" };
const B_SUB = { Large: "Top 100 companies", Mid: "Companies 101 to 250", Small: "Company 251 onwards", Cash: `Kept aside · at least 5%` };
const B_RES = "qf_builder_res";
// Diversification check (owner, 2026-11-01: "₹1 crore in only 20 stocks needs a warning … and too many stocks for a small
// amount too"). Guide ranges by amount — Claude's proposal, owner may tune: [up to amount, fewest, most].
const B_SPREAD = [[50000, 5, 10], [200000, 8, 20], [1000000, 15, 40], [5000000, 20, 60], [20000000, 30, 80], [100000000, 40, 150],
  [1000000000, 60, 250], [Infinity, 80, 500]];
const B_MIN_SLICE = 2500;                                           // below this per stock, charges eat the position
// owner, 2026-11-01: "9 stocks suits ₹1 L (8 to 20)" → go with the HIGHER diversification: below the middle of the range
// the suggestion is the top of it (never more than the amount can carry at B_MIN_SLICE per stock)
function spreadCheck(amount, count, cashPct) {
  if (!(amount > 0) || !(count > 0)) return null;
  const [, lo, hi] = B_SPREAD.find(([max]) => amount <= max);
  const eq = amount * (100 - cashPct) / 100, per = eq / count, share = (100 - cashPct) / count;
  const best = Math.max(B_MIN_N, Math.min(hi, Math.floor(eq / B_MIN_SLICE)));
  if (per < B_MIN_SLICE && count > best) return { tone: "warn", key: "thin", title: "Spread too thin for the amount", fix: best,
    text: `${count} stocks for ${inrShort(amount)} leaves only about ${inr(per)} per stock. Charges take a bigger bite of small positions, many shares cost more than the slice, and the portfolio gets hard to follow. ${best} stocks suits this amount better.` };
  if (count < lo) return { tone: "warn", key: "few", title: "Less diversified", fix: best,
    text: `${count} stocks for ${inrShort(amount)} puts about ${inr(per)} (${share.toFixed(1)}% of the money) in each one, so one bad stock can hurt the whole portfolio. For this amount, ${best} stocks spreads the risk much better.` };
  if (count < (lo + hi) / 2 && best > count) return { tone: "info", key: "more", title: "Could be more diversified", fix: best,
    text: `${count} stocks is at the low end for ${inrShort(amount)} (a typical range is ${lo} to ${hi}). Going up to ${best} stocks spreads the risk better, so no single stock decides the result.` };
  if (count > hi) return { tone: "info", key: "wide", title: "A very wide spread", fix: hi,
    text: `${count} stocks is more than this amount needs (${lo} to ${hi} is typical). Each stock moves the portfolio very little, so it will behave much like the overall market, and it takes more effort to follow.` };
  return { tone: "ok", key: "ok", title: "Well spread", text: `${count} stocks suits ${inrShort(amount)} (a typical range is ${lo} to ${hi}).` };
}
function SpreadNote({ chk, onFix, id }) {
  if (!chk) return null;
  return (
    <div className={`bd-spread is-${chk.tone}`} id={id} role={chk.tone === "warn" ? "alert" : undefined}>
      <span className="bd-spi" aria-hidden="true">{chk.tone === "warn" ? "⚠" : chk.tone === "info" ? "ℹ" : "✓"}</span>
      <div><b>{chk.title}</b><span>{chk.text}</span></div>
      {onFix && chk.fix && chk.tone !== "ok" ? <button type="button" className="px-btn" onClick={() => onFix(chk.fix)}>Use {chk.fix} stocks</button> : null}
    </div>
  );
}                                    // the last plan, kept for this browser tab
const B_COUNTS = [20, 30, 50, 100];
const B_AMOUNTS = [10000, 50000, 100000, 500000, 1000000, 2500000, 10000000, 100000000, 1000000000];
const B_SECTOR = [[5, "5%"], [10, "10%"], [15, "15%"], [20, "20%"], [25, "25%"], [30, "30%"], [40, "40%"], [100, "No limit"]];
const B_CASH_MIN = 5, B_MIN_AMT = 10000, B_MAX_AMT = 100000000000, B_MIN_N = 5, B_MAX_N = 1000;   // ₹10,000 … ₹10,000 crore · 5 … 1,000 stocks
const B_KEY = "qf_builder";                                  // the customer's last inputs, this device only
// "More options" (owner, 2026-11-01: "add more fields … based on the quant — zones along with the regime")
const B_OPT_DEFAULT = { horizon: "long", quality: "building", confirmed: false, stock_max: 10, run_up: 30, fno_only: false, exclude: [], by_volume: false };
const B_HORIZON = [["long", "Long term", "Months to years · quarter and year count most"], ["medium", "Medium term", "Weeks to months · the month counts more"]];
// names (owner, 2026-11-01: "most of the words look similar")
const B_QUALITY = [["strong", "Leaders only", "Strength 40 and above · the fewest, strongest stocks"],
  ["good", "Proven trends", "Strength 24 and above"], ["building", "Proven + emerging", "Adds rising trends when proven ones run out"]];
const B_REGIME = [[false, "Uptrend regime", "The long-term regime is up"], [true, "Confirmed uptrend", "Long- and short-term regimes both up · stricter"]];
const B_VOLUME = [[false, "No", "Trading volume gives warnings only"], [true, "Yes", "No stock bigger than 5 days of normal buying"]];
const B_STOCK = [5, 10, 15, 20, 25];
const B_RUNUP = [[20, "20%"], [30, "30%"], [50, "50%"], [0, "Don't leave out"]];
const B_DEFAULT = { amount: 1000000, count: 30, alloc: B_PRESETS.multi, rel: ["S"], sector: 25, weighting: "equal", opts: B_OPT_DEFAULT };
const inr = v => `₹${Math.round(v).toLocaleString("en-IN")}`;
const inrShort = v => v >= 1e7 ? `₹${(v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr` : v >= 1e5 ? `₹${+(v / 1e5).toFixed(2)} L` : inr(v);
// money on the plan (owner, 2026-11-01: "₹10,000 crore — the zeros break the page"): crore and lakh words, full on hover
const money = v => v >= 1e7 ? `₹${(v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr` : inr(v);
const Money = ({ v }) => <span title={inr(v)}>{money(v)}</span>;
const qtyTxt = q => q >= 1e7 ? `${(q / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr` : q >= 1e5 ? `${(q / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L` : q.toLocaleString("en-IN");
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const styleOf = a => (Object.entries(B_PRESETS).find(([, p]) => B_PARTS.every(([k]) => p[k] === a[k])) || [null])[0];
const cleanOpts = o => {                                      // saved "More options", checked
  o = o && typeof o === "object" ? o : {};
  return { horizon: B_HORIZON.some(([k]) => k === o.horizon) ? o.horizon : "long", quality: B_QUALITY.some(([k]) => k === o.quality) ? o.quality : "building",
    confirmed: !!o.confirmed, stock_max: B_STOCK.includes(o.stock_max) ? o.stock_max : 10, run_up: B_RUNUP.some(([v]) => v === o.run_up) ? o.run_up : 30,
    fno_only: !!o.fno_only, exclude: Array.isArray(o.exclude) ? o.exclude.filter(x => typeof x === "string").slice(0, 100) : [], by_volume: !!o.by_volume };
};
const loadBuilder = () => {                                   // saved inputs, checked (an old or edited value falls back)
  let v = {};
  try { v = JSON.parse(localStorage.getItem(B_KEY) || "{}") || {}; } catch { /* storage blocked */ }
  const al = v.alloc, okAlloc = al && B_PARTS.every(([k]) => Number.isFinite(al[k]) && al[k] >= 0)
    && Math.abs(B_PARTS.reduce((t, [k]) => t + al[k], 0) - 100) < 0.01 && al.Cash >= B_CASH_MIN && al.Cash < 100;
  return { amount: Number.isFinite(v.amount) && v.amount > 0 ? v.amount : B_DEFAULT.amount,
    count: Number.isInteger(v.count) && v.count >= B_MIN_N && v.count <= B_MAX_N ? v.count : B_DEFAULT.count,
    alloc: okAlloc ? al : { ...B_DEFAULT.alloc }, rel: Array.isArray(v.rel) && v.rel.includes("M") ? ["S", "M"] : ["S"],
    sector: B_SECTOR.some(([x]) => x === v.sector) ? v.sector : B_DEFAULT.sector,
    weighting: v.weighting === "strength" ? "strength" : "equal", opts: cleanOpts(v.opts) };
};

// Market-cap mix bar (owner, 2026-11-01: "keep the graph of the market cap and cash better"): one 100% bar, 2px gaps,
// the percentage printed on every part wide enough to hold it, cash as a hatched grey part (money kept aside, not a
// stock group). The coloured rows next to it (sliders / table) are its legend.
function MixBar({ parts, label = "", thin = false }) {
  const vis = parts.filter(([, v]) => v > 0);
  const pc = v => `${+v.toFixed(v % 1 ? 1 : 0)}%`;
  return (
    <div className={`mx-line ${thin ? "thin" : ""}`}>
      {label && <span className="mx-rl">{label}</span>}
      <div className="mx-bar" role="img" aria-label={`${label ? `${label}: ` : ""}${vis.map(([k, v]) => `${B_NAME[k]} ${pc(v)}`).join(", ")}`}>
        {vis.map(([k, v]) => <span key={k} className={`mx-seg mx-${k.toLowerCase()}`} style={{ flexGrow: v }} title={`${B_NAME[k]}: ${pc(v)}`}>
          {!thin && v >= 9 && <em>{pc(v)}</em>}</span>)}
      </div>
    </div>
  );
}

function BuilderView({ apps, onAddToPortfolio, onOpenApp, onOut }) {
  const [inp, setInpRaw] = useState(loadBuilder);
  const setInp = patch => setInpRaw(p => { const n = { ...p, ...patch }; try { localStorage.setItem(B_KEY, JSON.stringify(n)); } catch { /* storage blocked */ } return n; });
  const [amtText, setAmtText] = useState(() => Math.round(loadBuilder().amount).toLocaleString("en-IN"));
  const [custom, setCustom] = useState(() => !B_COUNTS.includes(loadBuilder().count));
  const [res, setResRaw] = useState(() => { try { return JSON.parse(sessionStorage.getItem(B_RES) || "null"); } catch { return null; } });
  const setRes = r => { setResRaw(r); try { if (r) sessionStorage.setItem(B_RES, JSON.stringify(r)); else sessionStorage.removeItem(B_RES); } catch { /* storage full or blocked */ } }; const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [added, setAdded] = useState("");                   // "" · "ask" · "busy" · "add" / "replace" (done) · error text
  const [pfNow, setPfNow] = useState(null);                 // how many stocks the Analyser list holds right now
  const a = inp.alloc, eqSum = a.Large + a.Mid + a.Small;
  const amtOk = inp.amount >= B_MIN_AMT && inp.amount <= B_MAX_AMT, nOk = inp.count >= B_MIN_N && inp.count <= B_MAX_N;
  const per = amtOk && nOk ? inp.amount * eqSum / 100 / inp.count : null;
  const spread = amtOk && nOk ? spreadCheck(inp.amount, inp.count, a.Cash) : null;
  const opt = inp.opts, setOpt = patch => setInp({ opts: { ...opt, ...patch } });
  const [pool, setPool] = useState(null);                         // how many stocks pass every check today (live, counts only)
  const optKey = JSON.stringify([inp.rel, opt]);
  useEffect(() => {
    const t = setTimeout(() => api("/app/api/builder/preview", { method: "POST", json: { reliability: inp.rel, opts: opt } })
      .then(setPool).catch(e => { if (e.status === 401) onOut(e.message); }), 250);
    return () => clearTimeout(t);
  }, [optKey]);
  const changed = ["horizon", "quality", "confirmed", "stock_max", "run_up", "fno_only", "by_volume"].filter(k => opt[k] !== B_OPT_DEFAULT[k]).length
    + (opt.exclude.length ? 1 : 0) + (inp.sector !== 25) + (inp.weighting !== "equal");
  const [secSel, setSecSel] = useState([]);                       // sector filter on the plan's stock table
  useEffect(() => { setSecSel([]); }, [res]);
  // an equity slider moves only into the cash share (cash never below the buffer); the cash slider scales the equity
  const setPart = (k, raw) => {
    const v = Math.max(0, Math.round(Number(raw) || 0));
    if (k === "Cash") {
      const cash = Math.min(100, Math.max(B_CASH_MIN, v)), eq = 100 - cash;
      const keys = eqSum > 0 ? ["Large", "Mid", "Small"].filter(x => a[x] > 0) : ["Large", "Mid", "Small"];
      const base = keys.reduce((t, x) => t + (eqSum > 0 ? a[x] : 1), 0);
      const next = { Large: 0, Mid: 0, Small: 0, Cash: cash };
      keys.forEach(x => { next[x] = Math.floor(eq * (eqSum > 0 ? a[x] : 1) / base); });
      next[keys[0]] += eq - keys.reduce((t, x) => t + next[x], 0);
      setInp({ alloc: next });
    } else {
      const room = 100 - B_CASH_MIN - (eqSum - a[k]);
      const nv = Math.min(v, room), next = { ...a, [k]: nv };
      next.Cash = 100 - next.Large - next.Mid - next.Small;
      setInp({ alloc: next });
    }
  };
  const setAmount = t => { const digits = t.replace(/[^\d]/g, "").slice(0, 12); setAmtText(digits ? Number(digits).toLocaleString("en-IN") : ""); setInp({ amount: Number(digits) || 0 }); };
  const problem = !amtOk ? `Enter an amount between ${inr(B_MIN_AMT)} and ${inrShort(B_MAX_AMT)}.`
    : !nOk ? `Choose between ${B_MIN_N} and ${B_MAX_N} stocks.` : eqSum <= 0 ? "Put some money in at least one market-cap group." : "";
  const build = () => {
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(""); setAdded("");
    api("/app/api/builder", { method: "POST", json: { amount: inp.amount, count: inp.count, alloc: a, reliability: inp.rel, sector_max: inp.sector, weighting: inp.weighting, opts: inp.opts } })
      .then(r => { setRes(r); window.scrollTo(0, 0); })
      .catch(e => { if (e.status === 401) onOut(e.message); else setErr(e.message); })
      .finally(() => setBusy(false));
  };
  const brand = <div className="px-eyebrow"><span className="ai-spark">✦</span> Hyperplane AI · Portfolio Builder <span>by QuantFriday</span></div>;
  const canPf = apps.some(x => x.key === "portfolio");

  if (res) {
    const picks = res.picks, caps = ["Large", "Mid", "Small"].filter(c => picks.some(p => p.cap === c));
    const csv = () => {
      const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = [["Stock", "Ticker", "Market cap", "Sector", "Industry", "Price (₹)", "Quantity", "Amount (₹)", "Weight %", "Long-term strength", "Reliability"],
        ...picks.map(p => [p.n, p.s, `${p.cap} cap`, p.sec, p.ind, p.p, p.qty, p.amt, p.w, p.st, RELIABILITY[p.h] ? RELIABILITY[p.h][0] : ""]),
        [], ["Cash kept", "", "", "", "", "", "", Math.round(res.cash), res.cash_pct], ["Total", "", "", "", "", "", "", res.amount, 100],
        [], [`Hyperplane AI Portfolio Builder · data as of ${fmtDT(res.as_of)} · for education only, not investment advice`]];
      const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
      const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `Hyperplane-Portfolio-Builder-${istToday()}.csv`;
      document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 1000);
    };
    const ask = () => { setAdded("ask"); setPfNow(null); api("/app/api/portfolio").then(r => setPfNow((r.symbols || []).length)).catch(() => setPfNow(0)); };
    const sendPf = mode => { setAdded("busy"); onAddToPortfolio(picks.map(p => p.s), mode).then(() => setAdded(mode)).catch(e => setAdded(`Could not update the list: ${e.message}`)); };
    const done = added === "add" || added === "replace";
    const maxSec = Math.max(1, ...res.by_sec.map(r => r.pct));
    const pickSec = k => setSecSel(v => v.includes(k) ? v.filter(x => x !== k) : [...v, k]);
    const shown = secSel.length ? picks.filter(p => secSel.includes(p.sec)) : picks;
    // the spread advice is about the customer's own choice: when fewer stocks passed than asked, the notes explain that instead
    const resSpread = res.stocks >= res.count ? spreadCheck(res.amount, res.stocks, res.alloc.Cash) : null;
    return (
      <div className="pf px bd" id="builder-result">
        <header className="px-head">
          <div className="px-ht">{brand}<h1>Your model portfolio</h1>
            <div className="px-meta">{res.stocks} stocks · <Money v={res.amount}/> · Data as of {fmtDT(res.as_of)}</div></div>
          <div className="px-actions">
            <button type="button" className="px-btn" id="bd-edit" onClick={() => { setRes(null); window.scrollTo(0, 0); }}>Edit inputs</button>
            <span className="tcopy"><span className="lbl">Ticker copy · {picks.length}</span><CopyBtns syms={picks.map(p => p.s)}/></span>
            <button type="button" className="px-btn" id="bd-csv" onClick={csv}>Download (Excel)</button>
            {canPf && <button type="button" className="px-btn primary" id="bd-add" disabled={added === "busy" || done} onClick={ask}>
              {done ? "✓ Sent to AI Portfolio" : "Send to AI Portfolio Analyser"}</button>}
          </div>
        </header>
        {added === "ask" && <div className="bd-confirm" role="alert" id="bd-ask">
          {pfNow == null ? <span>Checking your AI Portfolio Analyser list…</span>
            : pfNow === 0 ? <><span>Your AI Portfolio Analyser list is empty. Put these {picks.length} stocks in it?</span>
                <button type="button" className="px-btn primary" id="bd-add-yes" onClick={() => sendPf("add")}>Yes, add them</button></>
            : <><span>Your AI Portfolio Analyser list has <b>{pfNow}</b> stock{pfNow === 1 ? "" : "s"}. What should happen to them?</span>
                <button type="button" className="px-btn primary" id="bd-add-yes" onClick={() => sendPf("add")} title={`Keep your ${pfNow} stocks and add the new ones`}>Add to my list</button>
                <button type="button" className="px-btn danger" id="bd-replace" onClick={() => sendPf("replace")} title={`Remove your ${pfNow} stocks and keep only these ${picks.length}`}>Replace my list</button></>}
          <button type="button" className="px-btn" onClick={() => setAdded("")}>Cancel</button></div>}
        {done && <div className="bd-confirm ok" id="bd-done">{added === "replace" ? `Your AI Portfolio Analyser list now holds only these ${picks.length} stocks.` : "Added to your AI Portfolio Analyser list; the stocks already there stay."}
          <button type="button" className="px-btn" onClick={() => onOpenApp("portfolio")}>Open the Analyser</button></div>}
        {added && !["ask", "busy", "add", "replace"].includes(added) && <div className="pf-miss">{added}</div>}

        <section className="bd-kpis">
          <div className="px-card bd-kpi"><span className="px-label">Amount</span><b><Money v={res.amount}/></b><small>{res.amount >= 1e7 ? "Cr = crore (1,00,00,000)" : inrShort(res.amount)}</small></div>
          <div className="px-card bd-kpi"><span className="px-label">Invested in stocks</span><b><Money v={res.invested}/></b><small>{(100 - res.cash_pct).toFixed(1)}% of the amount</small></div>
          <div className="px-card bd-kpi cash"><span className="px-label">Cash kept <Info text={`Cash for safety: your ${res.alloc.Cash}% choice plus what is left after buying whole shares or when too few stocks passed the checks. Keeping cash lets you add on dips and pay charges without selling.`}/></span><b><Money v={res.cash}/></b><small>{res.cash_pct.toFixed(1)}% of the amount</small></div>
          <div className="px-card bd-kpi"><span className="px-label">Stocks</span><b>{res.stocks}</b><small>{res.stocks < res.count ? `of the ${res.count} you asked for` : "as you asked"}</small></div>
          <div className="px-card bd-kpi"><span className="px-label">Average strength <Info text="The average long-term strength of the stocks picked, from −100 to +100 (the same strength as the AI Portfolio Analyser). It is how strong the trend is, not a price change."/></span>
            <b className={tc(res.avg_st)}>{signed(res.avg_st)}</b><small className={tc(res.avg_st)}>{trendWordOf(res.avg_st)}</small></div>
        </section>

        <section className="px-row2 bd-row">
          <div className="px-card bd-alloc">
            <div className="px-label">Where the money goes</div>
            <div className="mx-cmp"><MixBar label="You chose" parts={res.by_cap.map(r => [r.k, r.target])}/><MixBar label="Plan" parts={res.by_cap.map(r => [r.k, r.pct])}/></div>
            <table className="bd-mix"><thead><tr><th></th><th>You chose</th><th>Plan</th><th className="num">Amount</th><th className="num">Stocks</th></tr></thead>
              <tbody>{res.by_cap.map(r => (
                <tr key={r.k}><td><i style={{ background: B_COL[r.k] }}/>{r.k === "Cash" ? "Cash (safety)" : `${r.k} cap`}</td><td>{r.target}%</td><td><b>{r.pct.toFixed(1)}%</b></td>
                  <td className="num"><Money v={r.amt}/></td><td className="num">{r.k === "Cash" ? "—" : r.n}</td></tr>))}</tbody></table>
          </div>
          <div className="px-card bd-secs">
            <div className="bd-sh"><div className="px-label">Sectors · {res.by_sec.length} <Info text={`Share of the invested money in each sector. No sector gets more than ${res.sector_max === 100 ? "any limit (you chose no limit)" : `${res.sector_max}%`} of it. Click sectors to show only their stocks in the list below.`}/></div>
              {secSel.length > 0 ? <button type="button" className="bd-clr" onClick={() => setSecSel([])}>Clear filter ✕</button> : <span className="bd-shint">click to filter the list</span>}</div>
            <div className="bd-sl" id="bd-sectors">{res.by_sec.map(r => (
              <button type="button" key={r.k} className={`bd-s ${secSel.includes(r.k) ? "on" : ""}`} onClick={() => pickSec(r.k)} aria-pressed={secSel.includes(r.k)}
                title={`${r.k}: ${r.pct.toFixed(1)}% of the invested money, ${r.n} stock${r.n === 1 ? "" : "s"}`}>
                <span className="bd-sn">{r.k}</span><span className="bd-st"><i style={{ width: `${r.pct / maxSec * 100}%` }}/></span><b>{r.pct.toFixed(1)}%</b><small>{r.n}</small></button>))}</div>
          </div>
        </section>

        {resSpread && resSpread.tone !== "ok" && <SpreadNote chk={resSpread} id="bd-spread-res"/>}
        {res.notes.length > 0 && <section className="px-card bd-notes">{res.notes.map((n, i) => <p key={i}><span aria-hidden="true">ℹ</span>{n}</p>)}</section>}

        <section className="px-card px-hold bd-hold">
          <div className="px-ch"><div><h3>What to buy</h3><p>{secSel.length ? `${shown.length} of ${picks.length} stocks · ${secSel.join(", ")}` : "Whole shares at today's price. Prices move, so check the price before you buy."}</p></div>
            <div className="bd-tf"><span className="px-label">Sector</span>
              <MultiSelect label="sectors" options={res.by_sec.map(r => r.k)} value={secSel} onChange={setSecSel} width={190}/></div></div>
          <div className="table-wrap"><table className="bd-t">
            <thead><tr><th>#</th><th>Stock</th><th className="hide-sm">Sector · Industry</th><th className="num">Price</th><th className="num">Quantity</th><th className="num">Amount</th><th className="num">Weight</th>
              <th className="num" title="Long-term strength from −100 to +100 (AI Portfolio engine), not a price change">Strength</th>
              <th className="num hide-sm" title="How long the quantity takes to buy at about 10% of the stock's normal daily trading">Days to buy</th><th className="hide-sm">Why it was picked</th></tr></thead>
            <tbody>{caps.filter(c => shown.some(p => p.cap === c)).map(c => <React.Fragment key={c}>
              <tr className="bd-grp"><td colSpan={10}><i style={{ background: B_COL[c] }}/>{c} cap · {shown.filter(p => p.cap === c).length} stocks · <Money v={shown.filter(p => p.cap === c).reduce((t, p) => t + p.amt, 0)}/></td></tr>
              {shown.filter(p => p.cap === c).map(p => (
                <tr key={p.s} data-sym={p.s}>
                  <td className="mono dim">{picks.indexOf(p) + 1}</td>
                  <td><span className="sym">{p.s}</span>{p.tier === 2 && <span className="bd-tier" title="The trend is still building: added because not enough stocks with a strong trend passed every check in this group">Building</span>}<div className="sub">{p.n}</div></td>
                  <td className="hide-sm"><span className="sec" style={{ color: colorOf(p.sec) }}>● {p.sec}</span><div className="sub">{p.ind}</div></td>
                  <td className="num mono">₹{p.p.toLocaleString("en-IN")}</td>
                  <td className="num mono" title={`${p.qty.toLocaleString("en-IN")} shares`}><b>{qtyTxt(p.qty)}</b></td>
                  <td className="num mono"><Money v={p.amt}/></td>
                  <td className="num mono">{p.w.toFixed(2)}%</td>
                  <td className={`num mono ${tc(p.st)}`}><b>{signed(p.st)}</b></td>
                  <td className="num hide-sm">{p.days == null ? <span className="dim">—</span>
                    : <span className={`bd-days ${p.days > 5 ? "slow" : p.days > 1 ? "mid" : "easy"}`} title={`About ${p.days} day${p.days === 1 ? "" : "s"} of buying at 10% of normal daily trading`}>{p.days <= 1 ? "Under a day" : `${p.days < 10 ? p.days : Math.round(p.days)} days`}</span>}</td>
                  <td className="hide-sm"><div className="bd-why">{p.why.map(w => <span key={w}>{w}</span>)}</div></td>
                </tr>))}
            </React.Fragment>)}
              {!secSel.length && <tr className="bd-cash"><td></td><td colSpan={4}><i style={{ background: B_COL.Cash }}/>Cash kept for safety</td><td className="num mono"><Money v={res.cash}/></td><td className="num mono">{res.cash_pct.toFixed(2)}%</td><td colSpan={2}></td></tr>}
            </tbody></table></div>
        </section>

        <section className="px-card bd-how">
          <div className="px-label"><span className="ai-spark">✦</span> How Hyperplane AI picked these</div>
          <ul>
            <li>It checked all {res.checked.toLocaleString("en-IN")} stocks with the same engine as the AI Portfolio Analyser. {res.qualified} passed every check today.</li>
            <li>Each stock's trend comes from how its price levels have been stepping up or down month by month, quarter by quarter and
              year by year, and where today's price sits within them ({res.opts && res.opts.horizon === "medium" ? "medium term: the month counts more" : "long term: the quarter and the year count most"}).</li>
            <li>Only stocks whose long-term regime is up{res.opts && res.opts.confirmed ? " and confirmed by the shorter regime" : ""}, with {res.reliability.map(r => RELIABILITY[r][0]).join(" or ")} reliability and at least 3 years of price history.</li>
            <li>Stocks that have already run up a lot ({res.opts && res.opts.run_up ? `up more than ${res.opts.run_up}% in 3 months, or ` : ""}3 times in a year) are left out: most of their move has already happened.{res.opts && res.opts.fno_only ? " Only F&O stocks were used." : ""}</li>
            <li>The strongest trends come first in each market-cap group, and no sector gets more than {res.sector_max === 100 ? "any fixed share (you chose no limit)" : `${res.sector_max}% of the money`}. {res.weighting === "strength" ? "Stronger stocks get a little more money." : "Every stock gets about the same money."}</li>
            <li>At least {B_CASH_MIN}% always stays in cash as a buffer for charges, rounding and new chances.</li>
          </ul>
          <p className="fine">This is a model portfolio made by fixed rules on our trend data, for education only. It is not investment advice or a recommendation to buy or sell. Check each stock yourself, and consider a SEBI-registered adviser before investing.</p>
        </section>
      </div>
    );
  }

  const st = styleOf(a);
  return (
    <div className="pf bd" id="builder-form">
      <section className="card pf-start bd-start">
        <div className="pf-sl">
          {brand}
          <h1>Build a strong portfolio <span>in seconds</span></h1>
          <p className="pf-lead">Tell Hyperplane AI how much you want to invest and how. It picks the stocks with the strongest
            long-term trend, tells you how many shares to buy, and keeps some cash aside for safety.</p>

          <div className="bd-f" id="bd-amount">
            <label className="bd-l" htmlFor="bd-amt">1 · Amount to invest</label>
            <div className="bd-amt"><span>₹</span><input id="bd-amt" inputMode="numeric" value={amtText} onChange={e => setAmount(e.target.value)} placeholder="10,00,000" aria-label="Amount to invest in rupees"/>
              <em>{amtOk ? inrShort(inp.amount) : ""}</em></div>
            <div className="bd-chips">{B_AMOUNTS.map(v => <button key={v} type="button" className={inp.amount === v ? "on" : ""} onClick={() => setAmount(String(v))}>{v < 100000 ? `₹${v / 1000} K` : inrShort(v)}</button>)}</div>
          </div>

          <div className="bd-f" id="bd-count">
            <span className="bd-l">2 · Number of stocks</span>
            <div className="bd-chips">{B_COUNTS.map(n => <button key={n} type="button" className={!custom && inp.count === n ? "on" : ""} onClick={() => { setCustom(false); setInp({ count: n }); }}>{n} stocks</button>)}
              <button type="button" className={custom ? "on" : ""} onClick={() => setCustom(true)}>Custom</button>
              {custom && <input type="number" className="bd-n" id="bd-n" min={B_MIN_N} max={B_MAX_N} value={inp.count || ""} aria-label="Number of stocks"
                onChange={e => setInp({ count: Math.min(B_MAX_N, Math.max(0, Math.round(Number(e.target.value) || 0))) })}/>}</div>
            <div className="bd-hint">{per ? <>About <b>{money(per)}</b> per stock. </> : null}Up to {B_MAX_N} stocks. More stocks spread the risk; fewer let each idea matter.</div>
            <SpreadNote chk={spread} id="bd-spread" onFix={n => { setCustom(!B_COUNTS.includes(n)); setInp({ count: n }); }}/>
          </div>

          <div className="bd-f" id="bd-mix">
            <span className="bd-l">3 · Market cap and cash</span>
            <div className="bd-styles">{B_STYLES.map(([k, l, d]) => (
              <button key={k} type="button" className={st === k ? "on" : ""} onClick={() => setInp({ alloc: { ...B_PRESETS[k] } })}><b>{l}</b><span>{d}</span>
                <span className="bd-smix">{B_PARTS.map(([p]) => <i key={p} className={`mx-${p.toLowerCase()}`} style={{ flexGrow: B_PRESETS[k][p] }}/>)}</span>
                <small>{B_PARTS.map(([p]) => `${B_PRESETS[k][p]} ${p === "Cash" ? "cash" : p.toLowerCase()}`).join(" · ")}</small></button>))}</div>
            <div className="al" role="group" aria-label="Market-cap mix and cash">
              <div className="al-top"><MixBar thin parts={B_PARTS.map(([k]) => [k, a[k]])}/>
                <span className="al-total" title="Large, mid and small cap plus cash">✓ 100% allocated</span></div>
              <div className="al-head" aria-hidden="true"><span>Segment</span><span>Allocation</span><span className="c">Share</span><span className="r">Amount</span></div>
              {B_PARTS.map(([k, l]) => (
                <div key={k} className={`al-row ${k === "Cash" ? "cash" : ""}`} data-part={k}>
                  <span className="al-name"><i className={`al-sw mx-${k.toLowerCase()}`}/><span><b>{l}</b><small>{B_SUB[k]}</small></span></span>
                  <input type="range" className="al-range" min="0" max="100" value={a[k]} onChange={e => setPart(k, e.target.value)} aria-label={`${l} share`}
                    style={{ "--c": B_COL[k], "--v": `${a[k]}%` }}/>
                  <span className="al-step bd-pv">
                    <button type="button" onClick={() => setPart(k, a[k] - 1)} aria-label={`Less ${l}`} disabled={a[k] <= (k === "Cash" ? B_CASH_MIN : 0)}>−</button>
                    <input type="number" min="0" max="100" value={a[k]} onChange={e => setPart(k, e.target.value)} aria-label={`${l} %`}/><em>%</em>
                    <button type="button" onClick={() => setPart(k, a[k] + 1)} aria-label={`More ${l}`} disabled={k === "Cash" ? a[k] >= 100 : a.Cash <= B_CASH_MIN}>+</button>
                  </span>
                  <span className="al-amt">{amtOk ? <Money v={inp.amount * a[k] / 100}/> : "—"}</span>
                </div>))}
            </div>
            <div className="bd-hint">{st ? `${B_STYLES.find(x => x[0] === st)[1]} mix.` : "Your own mix."} Cash never goes below {B_CASH_MIN}%: a buffer for charges, rounding and buying on dips.</div>
          </div>

          <div className="bd-f" id="bd-rel">
            <span className="bd-l">4 · Reliability <Info wide text={<><b>Reliability</b> comes from the stock's whole price history. <b>High</b>: it has stayed close to its highest price over the years.
              <b> Medium</b>: more than 50% below its highest price, or lower than 5 years ago. <b>Low</b>: it once fell more than 70% from its highest price, so the builder never uses it.</>}/></span>
            <div className="bd-chips">
              <button type="button" className="on locked" disabled title="High reliability is always included">✓ High</button>
              <button type="button" id="bd-rel-m" className={inp.rel.includes("M") ? "on" : ""} onClick={() => setInp({ rel: inp.rel.includes("M") ? ["S"] : ["S", "M"] })}>{inp.rel.includes("M") ? "✓ " : "+ "}Medium</button>
              <button type="button" id="bd-rel-w" className="off" disabled title="Low reliability stocks once fell more than 70% from their highest price. The builder never uses them.">🔒 Low</button>
            </div>
          </div>

          {pool && <div className={`bd-pool ${pool.total < inp.count ? "short" : ""}`} id="bd-pool">
            <span><b>{pool.total.toLocaleString("en-IN")}</b> stocks pass every check today</span>
            <small>{["Large", "Mid", "Small"].map(c => `${pool.by_cap[c].strong + pool.by_cap[c].building} ${c.toLowerCase()}`).join(" · ")}</small>
            {pool.total < inp.count && <em>Fewer than the {inp.count} you asked for: the plan holds the ones that pass and keeps your cash share.</em>}
          </div>}

          <details className="bd-more" id="bd-more">
            <summary>More options <span>{changed ? `${changed} changed` : "horizon · trend quality · regime · limits · sectors"}</span></summary>
            <div className="bd-f">
              <span className="bd-l">Time horizon <Info text="How the monthly, quarterly and yearly trends are blended. Long term follows the AI Portfolio Analyser. Medium term gives the month more weight."/></span>
              <div className="bd-chips bd-cards2">{B_HORIZON.map(([k, l, d]) => <button key={k} type="button" id={`bd-h-${k}`} className={opt.horizon === k ? "on" : ""} onClick={() => setOpt({ horizon: k })}><b>{l}</b><small>{d}</small></button>)}</div>
            </div>
            <div className="bd-f">
              <span className="bd-l">Trend quality <Info text="Strong: only the strongest long-term trends. Good: every stock with a good trend. Good, then building: when there are not enough good ones, stocks whose trend is still building fill the gap (marked Building)."/></span>
              <div className="bd-chips bd-cards2">{B_QUALITY.map(([k, l, d]) => <button key={k} type="button" id={`bd-q-${k}`} className={opt.quality === k ? "on" : ""} onClick={() => setOpt({ quality: k })}><b>{l}</b><small>{d}</small></button>)}</div>
            </div>
            <div className="bd-f">
              <span className="bd-l">Regime <Info text="Every pick needs an up long-term regime. Confirmed also needs the shorter regime to agree, so it leaves out stocks whose regime has started to fade."/></span>
              <div className="bd-chips bd-cards2">{B_REGIME.map(([k, l, d]) => (
                <button key={l} type="button" id={`bd-r-${k ? "c" : "u"}`} className={opt.confirmed === k ? "on" : ""} onClick={() => setOpt({ confirmed: k })}><b>{l}</b><small>{d}</small></button>))}</div>
            </div>
            <div className="bd-f">
              <span className="bd-l">Leave out stocks that already ran up <Info text="A stock that already rose a lot in the last 3 months has made much of its move. Stocks up 3 times or more in a year are always left out."/></span>
              <div className="bd-chips">{B_RUNUP.map(([v, l]) => <button key={v} type="button" className={opt.run_up === v ? "on" : ""} onClick={() => setOpt({ run_up: v })}>{v ? `Up more than ${l} in 3 months` : l}</button>)}</div>
            </div>
            <div className="bd-f">
              <span className="bd-l">Most money in one stock</span>
              <div className="bd-chips">{B_STOCK.map(v => <button key={v} type="button" className={opt.stock_max === v ? "on" : ""} onClick={() => setOpt({ stock_max: v })}>{v}%</button>)}</div>
            </div>
            <div className="bd-f">
              <span className="bd-l">Size by trading volume <Info text="Buying more than about 10% of a stock's normal daily trading can push its price up. Yes: no position is bigger than 5 days of buying at that pace (the money goes to the other stocks or stays as cash). No: the quantities follow your plan, and the plan shows how many days each stock takes to buy."/></span>
              <div className="bd-chips bd-cards2">{B_VOLUME.map(([k, l, d]) => <button key={l} type="button" id={`bd-v-${k ? "y" : "n"}`} className={opt.by_volume === k ? "on" : ""} onClick={() => setOpt({ by_volume: k })}><b>{l}</b><small>{d}</small></button>)}</div>
            </div>
            <div className="bd-f">
              <span className="bd-l">Stocks</span>
              <div className="bd-chips"><button type="button" id="bd-fno" className={opt.fno_only ? "on" : ""} onClick={() => setOpt({ fno_only: !opt.fno_only })}>{opt.fno_only ? "✓ " : ""}F&amp;O stocks only (easier to buy and sell)</button></div>
            </div>
            <div className="bd-f">
              <span className="bd-l">Leave out sectors</span>
              <MultiSelect label="sectors" options={pool ? pool.sectors : []} value={opt.exclude} onChange={v => setOpt({ exclude: v })} width={300}/>
            </div>
            <div className="bd-f">
              <span className="bd-l">Most money in one sector</span>
              <div className="bd-chips">{B_SECTOR.map(([v, l]) => <button key={v} type="button" className={inp.sector === v ? "on" : ""} onClick={() => setInp({ sector: v })}>{l}</button>)}</div>
            </div>
            <div className="bd-f">
              <span className="bd-l">How the money is shared</span>
              <div className="bd-chips">{[["equal", "Same money in each stock"], ["strength", "Stronger stocks get more"]].map(([k, l]) => (
                <button key={k} type="button" className={inp.weighting === k ? "on" : ""} onClick={() => setInp({ weighting: k })}>{l}</button>))}</div>
            </div>
          </details>

          {(err || problem) && <div className="pf-miss" role="alert">{err || problem}</div>}
          <button type="button" className="pf-go" id="bd-go" disabled={busy || !!problem} onClick={build}>
            {busy ? "Hyperplane AI is checking every stock…" : "✦ Build my portfolio"}</button>
        </div>
        <aside className="pf-sr">
          <h3>How it works</h3>
          <div className="pf-steps">
            <div className="pf-step"><b>1</b><span><strong>Tell us the plan</strong>Amount, number of stocks, the market-cap mix and reliability.</span></div>
            <div className="pf-step"><b>2</b><span><strong>Hyperplane AI picks</strong>The strongest long-term trends that have not already run up, spread across sectors.</span></div>
            <div className="pf-step"><b>3</b><span><strong>Get the shopping list</strong>Every stock with the number of shares to buy, the money and the reason.</span></div>
          </div>
          <h3>Your plan</h3>
          <dl className="bd-sum">
            <div><dt>Amount</dt><dd>{amtOk ? <Money v={inp.amount}/> : "—"}</dd></div>
            <div><dt>Stocks</dt><dd>{nOk ? inp.count : "—"}</dd></div>
            <div><dt>Mix</dt><dd>{B_PARTS.filter(([k]) => a[k] > 0).map(([k]) => `${k === "Cash" ? "Cash" : k} ${a[k]}%`).join(" · ")}</dd></div>
            <div><dt>Reliability</dt><dd>{inp.rel.includes("M") ? "High and Medium" : "High"}</dd></div>
            <div><dt>Horizon</dt><dd>{B_HORIZON.find(([k]) => k === opt.horizon)[1]}</dd></div>
            <div><dt>Trend quality</dt><dd>{B_QUALITY.find(([k]) => k === opt.quality)[1]}</dd></div>
            <div><dt>Regime</dt><dd>{B_REGIME.find(([k]) => k === opt.confirmed)[1]}</dd></div>
            {pool && <div><dt>Today's pool</dt><dd>{pool.total.toLocaleString("en-IN")} stocks</dd></div>}
          </dl>
          <div className="pf-trust"><span className="ai-spark">✦</span><span>Built on the same engine as the AI Portfolio Analyser. For education only, not investment advice.</span></div>
        </aside>
      </section>
    </div>
  );
}


export default BuilderView;
