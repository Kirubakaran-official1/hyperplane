// Hyperplane AI Portfolio Builder — a lazily loaded application module.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addCss } from "../core.jsx";
import { CopyBtns, Info, MultiSelect, RELIABILITY, StockLink, api, colorOf, fmtDT, signed, tc, trackAction, trendWordOf } from "../core.jsx";
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
const B_KEY = "qf_builder_v2";                               // the customer's last inputs, this device only (v2: new standard settings)
// "More options" (owner, 2026-11-01: "add more fields … based on the quant — zones along with the regime")
// standard settings for every plan (owner, 2026-11-01); the Customer plan cannot change them (the server checks it)
const B_OPT_DEFAULT = { horizon: "long", quality: "good", confirmed: true, stock_max: 5, run_up: 30, fno_only: false, exclude: [], by_volume: false, pace: "standard", by_float: false };
const B_HORIZON = [["long", "Long term", "Months to years · quarter and year count most"], ["medium", "Medium term", "Weeks to months · the month counts more"]];
// names (owner, 2026-11-01: "most of the words look similar")
const B_QUALITY = [["strong", "Leaders only", "Strength 40 and above · the fewest, strongest stocks"],
  ["good", "Proven trends", "Strength 24 and above"], ["building", "Proven + emerging", "Adds rising trends when proven ones run out"]];
const B_REGIME = [[false, "Uptrend regime", "The long-term regime is up"], [true, "Confirmed uptrend", "Long- and short-term regimes both up · stricter"]];
const B_VOLUME = [[false, "No", "Your plan stays · stocks too big for their trading are warned"], [true, "Yes", "No stock bigger than its trading supports · the rest goes to the others"]];
// free float (owner, 2026-11-02: "give the i button because people don't know what free float is")
const FF_INFO = "Free float is the part of a company's shares that the public can actually buy and sell: all its shares minus those held by the promoters (the founders and their group), which rarely change hands. A stock can trade lakhs of shares a day, yet only its free float can ever be bought.";
const B_FLOAT = [[false, "No", "Your plan stays · a stock that takes a large part of its free float is shown in its details"], [true, "Yes", "No stock above 1% of its free float · the rest goes to the others"]];
// buying pace = the share of a stock's normal day of trading you buy each day (thin or jumpy stocks always slower)
const B_PACE = [["careful", "Careful", "5% of a normal day · least price push"], ["standard", "Standard", "10% of a normal day · the usual rule"],
  ["fast", "Fast", "20% of a normal day · quicker, pushes the price more"]];
const V_TONE = { 5: "up", 4: "up", 3: "mid", 2: "low", 1: "bad" };
const V_STATUS = { fits: "Fits", capped: "Kept to its limit", over: "Too big", unknown: "Not known" };
const FF_STATUS = { light: "Small part", watch: "Noticeable part", capped: "Kept to the standard", over: "Above the standard", unknown: "Not reported" };
const B_STOCK = [5, 10, 15, 20, 25];
const B_RUNUP = [[20, "20%"], [30, "30%"], [50, "50%"], [0, "Don't leave out"]];
const B_DEFAULT = { amount: 100000, count: 20, alloc: B_PRESETS.multi, rel: ["S"], sector: 10, weighting: "equal", opts: B_OPT_DEFAULT };
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
  const d = B_OPT_DEFAULT;
  return { horizon: B_HORIZON.some(([k]) => k === o.horizon) ? o.horizon : d.horizon, quality: B_QUALITY.some(([k]) => k === o.quality) ? o.quality : d.quality,
    confirmed: typeof o.confirmed === "boolean" ? o.confirmed : d.confirmed, stock_max: B_STOCK.includes(o.stock_max) ? o.stock_max : d.stock_max,
    run_up: B_RUNUP.some(([v]) => v === o.run_up) ? o.run_up : d.run_up,
    fno_only: !!o.fno_only, exclude: Array.isArray(o.exclude) ? o.exclude.filter(x => typeof x === "string").slice(0, 100) : [], by_volume: !!o.by_volume,
    pace: B_PACE.some(([k]) => k === o.pace) ? o.pace : "standard", by_float: !!o.by_float };
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

// ─── volume analysis (owner, 2026-11-01: "detail analysis … a lakh of volume doesn't mean we can buy all of it … exact
// output and a better order to proceed"). The server works it out (liquidity.py + builder.py); this only shows it.
const sh = n => n == null ? "—" : qtyTxt(Math.round(n));
function VolCell({ p, open, onClick }) {
  const l = p.liq;
  if (!l || l.status === "unknown") return <button type="button" className="bd-vc unk" onClick={onClick} aria-expanded={open}><span className="vb">Not known</span></button>;
  const st = l.status === "over" ? <span className="bd-vs is-over">⚠ {(p.amt / l.most_amt).toFixed(1)}× over limit</span>
    : l.status === "capped" ? <span className="bd-vs is-cap">Capped at limit</span>
    : l.light ? <span className="bd-vs is-ok">Easy to buy</span>
    : <span className="bd-vs is-ok">Within limit · {l.days <= 1 ? "1 day" : `${l.days} days`}</span>;
  return (
    <button type="button" className={`bd-vc ${open ? "on" : ""}`} onClick={onClick} aria-expanded={open} title="Show the volume check">
      <span className={`vb ${V_TONE[l.grade]}`}>{l.grade_word}</span>{st}</button>);
}

function Strip({ vals, label }) {
  const v = (vals || []).map(x => x || 0), mx = Math.max(1, ...v);
  if (!v.some(Boolean)) return <div className="bd-strip"><span>{label}</span><small className="dim">not enough history yet</small></div>;
  return (
    <div className="bd-strip"><span>{label}</span>
      <div>{v.map((x, i) => <i key={i} style={{ height: `${Math.max(4, x / mx * 100)}%` }} title={`${qtyTxt(Math.round(x))} shares a day`}/>)}</div></div>);
}

// owner, 2026-11-01: "1 share can move the stock by 1 %?? … show the volume analyser based on the portfolio, don't show
// the unnecessary things to a small holder". The push is now worked out from what YOU buy a day (server), and a
// position that is a tiny part of the stock's trading gets one plain line instead of the full analysis.
const pct = v => v == null ? "—" : v < 0.01 ? "under 0.01%" : `${+v.toFixed(v < 1 ? 2 : 1)}%`;
const pushTxt = v => v == null ? null : v < 0.05 ? "negligible" : `about ${+v.toFixed(2)}%`;

function VolCard({ p }) {
  const l = p.liq || {};
  if (l.status === "unknown") return <div className="bd-vcard" id={`vc-${p.s}`}><p>{(l.warn || [])[0]}</p></div>;
  if (l.light) return (
    <div className="bd-vcard light" id={`vc-${p.s}`}>
      <p className="bd-vlight"><b>✓ Easily bought and sold.</b> Your {sh(p.qty)} share{p.qty === 1 ? "" : "s"} ({inrShort(p.amt)}) {p.qty === 1 ? "is" : "are"} {pct(l.share)} of
        the {sh(l.dep)} shares it trades on a normal day (about {inrShort(l.value)}). Buy {p.qty === 1 ? "it" : "them"} in one go; {p.qty === 1 ? "it does" : "they do"} not move the price.</p>
      {(l.warn || []).length > 0 && <ul className="bd-vwarn">{l.warn.map((w, i) => <li key={i}>{w}</li>)}</ul>}
    </div>);
  const trend = l.trend === 1 ? "rising" : l.trend === -1 ? "falling" : "steady";
  const push = pushTxt(l.push);
  return (
    <div className="bd-vcard" id={`vc-${p.s}`}>
      <div className="bd-vgrid">
        <div><span className="px-label">Average daily volume <Info text="Shares the stock normally trades in a day, from its finished weeks, months and quarters. The lower, recent figure is used when trading is falling, and one unusually heavy day is never counted."/></span>
          <b>{sh(l.dep)} shares a day</b><small>about {inrShort(l.value)} a day · dependable figure{l.norm > l.dep ? ` (normal ${sh(l.norm)})` : ""}</small>
          <div className="bd-strips"><Strip vals={l.wk} label="Last 4 weeks"/><Strip vals={l.mo} label="Last 4 months"/></div>
          <small>Trading is {trend}{l.spike ? " · unusually heavy today (not counted)" : ""}{l.erratic ? " · uneven month to month" : ""}</small></div>
        <div><span className="px-label">Buying capacity · {+(l.pace * 100).toFixed(1)}% of a day <Info text="To avoid pushing the price, buy only a small share of a day's trading. The stock's limit is five days of buying at that pace, an amount that can also be sold within about ten days even if trading halves."/></span>
          <b>{sh(l.per_day)} shares a day</b>
          <small>supports up to {sh(l.most)} shares ({inrShort(l.most_amt)}) — five days of buying, and sellable within about ten days even if trading halves</small></div>
        <div><span className="px-label">Your position <Info text="Your quantity compared with the stock's trading: share of one day, days to buy at your pace, days to sell in a hurry, and how much your own buying may push the price (from the shares you buy each day)."/></span>
          <b className={l.status === "over" ? "bad" : ""}>{sh(p.qty)} shares · {inrShort(p.amt)}</b>
          <small>{pct(l.share)} of one day's trading · {l.days <= 1 ? "bought in one day" : `${l.days.toLocaleString("en-IN")} days to buy`} · {l.exit_days.toLocaleString("en-IN")} day{l.exit_days === 1 ? "" : "s"} to sell in a hurry</small>
          {push && <small>Price push from your own buying: {push}</small>}</div>
      </div>
      {(l.warn || []).length > 0 && <ul className="bd-vwarn">{l.warn.map((w, i) => <li key={i}>{w}</li>)}</ul>}
    </div>);
}

// free float of one holding (server: builder._float) — shown in the stock's details only when it matters
function FloatCard({ p }) {
  const f = p.ff || {};
  if (f.status === "unknown") return <div className="bd-vcard" id={`ff-${p.s}`}><p>The free float is not reported for this stock, so it could not be checked.</p></div>;
  const warn = [];
  if (f.status === "over") warn.push(`Your ${sh(p.qty)} shares are ${(f.held / f.cap_pct).toFixed(1)}× the ${f.cap_pct}% standard. Selling them later could take a long time and move the price: consider a smaller amount, or turn on “Size by free float” in More options.`);
  if (f.status === "capped") warn.push(`Kept to ${f.cap_pct}% of the free float; the rest of the money went to the other stocks.`);
  if (f.status === "watch") warn.push("A noticeable part of the shares the public can trade. It is within the standard: buy slowly and spread the orders.");
  if (f.line) warn.push(f.line);
  return (
    <div className="bd-vcard" id={`ff-${p.s}`}>
      <div className="bd-vgrid">
        <div><span className="px-label">Tradable shares <Info text={FF_INFO}/></span>
          <b>{sh(f.free)} shares</b><small>{+f.free_pct.toFixed(1)}% of all {sh(f.total)} shares · about {inrShort(f.free * p.p)}</small></div>
        <div><span className="px-label">Standard · {f.cap_pct}% of the free float <Info text={`The most one portfolio should hold of a stock: ${f.cap_pct}% of its free float. Big investors keep each holding to a small part of the tradable shares, so they can sell later without trouble and stay well below the levels where SEBI's disclosure rules begin.`}/></span>
          <b>{sh(f.most)} shares</b><small>about {inrShort(f.most_amt)} — the most within the standard</small></div>
        <div><span className="px-label">Your position <Info text="Your quantity compared with the free float, and with all the company's shares."/></span>
          <b className={f.status === "over" ? "bad" : ""}>{sh(p.qty)} shares · {pct(f.held)} of the free float</b>
          <small>{pct(f.held_total)} of all the company's shares</small></div>
      </div>
      {warn.length > 0 && <ul className="bd-vwarn">{warn.map((w, i) => <li key={i}>{w}</li>)}</ul>}
    </div>);
}

function FloatBanner({ res, picks }) {
  const f = res.float;
  if (!f) return null;
  const over = picks.filter(p => p.ff && p.ff.status === "over");
  return <>
    {over.length > 0 && <div className="bd-vbanner" id="bd-ffbanner">
      <b>⚠ {over.length} stock{over.length === 1 ? " takes" : "s take"} more than {f.cap_pct}% of {over.length === 1 ? "its" : "their"} free float</b> <Info text={FF_INFO}/> ({inrShort(f.over_amt)}).
      Buying that big a part of the shares the public can trade is hard to undo later. Turn on “Size by free float” in More options to keep each within {f.cap_pct}%.
      <div className="bd-vlist">{over.slice(0, 12).map(p => <span key={p.s}><b>{p.s}</b> {pct(p.ff.held)} · max {inrShort(p.ff.most_amt)}</span>)}{over.length > 12 && <span>+{over.length - 12} more</span>}</div></div>}
    {f.by_float && f.capped > 0 && <p className="bd-vnote" id="bd-ffcapped">{f.capped} stock{f.capped === 1 ? " was" : "s were"} kept to {f.cap_pct}% of {f.capped === 1 ? "its" : "their"} free float; the rest of the money went to the other stocks in the same group.</p>}
    {(f.replaced || []).length > 0 && <p className="bd-vnote" id="bd-ffrepl">Left out because too few of their shares are traded by the public: {f.replaced.slice(0, 10).map(r => `${r.s} (up to ${inrShort(r.most_amt)})`).join(", ")}{f.replaced.length > 10 ? ` and ${f.replaced.length - 10} more` : ""}.</p>}
  </>;
}

// owner, 2026-11-01: "the usual dark side of trading … hit everyone's stop loss, then buy … mention some as a note".
// Education only: what large players are known to do, and how a small investor avoids being on the wrong side.
const TRICKS = [
  ["Stop-loss hunting", "The price is pushed just below an obvious level — a round number, a recent low, the bottom of a zone — to set off many stop-losses at once. The forced selling is then bought cheaply and the price recovers.",
    "Don't put stops exactly on obvious levels; leave a small gap, and prefer stop-limit orders."],
  ["Spoofing and layering", "Large buy or sell orders are shown in the order book only to make others react, and are pulled before they trade. It is illegal under SEBI rules, but it still happens.",
    "Judge a stock by trades that actually happened, not by the orders waiting in the book."],
  ["Front-running", "Someone who knows a big order is coming buys just before it and sells to it at a higher price.",
    "Split large orders, use limit prices, and keep your plans to yourself."],
  ["Pump and dump", "A thinly traded stock is pushed up with heavy buying and 'tips', then sold to the late buyers who rush in.",
    "Be careful with sudden volume jumps and tips; the dependable volume here ignores one-day spikes for this reason."],
  ["Circuit traps", "A small stock is held at its upper circuit with no sellers, so it looks unstoppable; when the circuit opens, the holders who drove it sell and late buyers cannot get out.",
    "Avoid chasing stocks that keep hitting circuits."],
  ["Marking the close", "Heavy orders in the last minutes push the closing price to a level that suits a large holder.",
    "Avoid the last 15 minutes, and judge trends on weekly and monthly closes rather than one day."],
  ["Fake volume", "Related parties trade the same shares back and forth so a stock looks busy and easy to sell (circular trading). It is illegal, but it happens in small stocks.",
    "Prefer stocks whose trading is steady over months, not just this week."],
  ["Hidden buying (iceberg orders)", "Big funds show only a small part of a large order, so their buying looks like normal trading while they collect shares over weeks. This one is legal.",
    "A steady rise in volume and price over weeks often means someone large is buying."],
];
function MarketTricks() {
  return (
    <details className="bd-tricks" id="bd-tricks">
      <summary><b>Tricks big players use</b> <span>and how to stay on the right side</span></summary>
      <ul>{TRICKS.map(([t, what, how]) => <li key={t}><b>{t}.</b> {what} <span className="bd-how">{how}</span></li>)}</ul>
      <p className="fine">For education only. Many of these are illegal under SEBI rules; knowing them helps you avoid being on the wrong side of them.</p>
    </details>);
}

function VolumeSection({ res, picks }) {
  const v = res.volume, g = v.grades || {};
  const over = picks.filter(p => p.liq && p.liq.status === "over");
  const order = ["Very high", "High", "Moderate", "Low", "Very low"];
  if (v.light) return (                                     // a small portfolio: nothing to manage, say so in one line
    <section className="px-card bd-volume light" id="bd-volume">
      <div className="px-ch"><div><h3>Volume analyser</h3>
        <p className="bd-vlight"><b>✓ No volume concerns.</b> Every stock trades far more each day than this portfolio buys: each one can be bought in one go,
          and your orders will not move the prices.</p></div></div>
      <FloatBanner res={res} picks={picks}/>
      <MarketTricks/>
    </section>);
  return (
    <section className="px-card bd-volume" id="bd-volume">
      <div className="px-ch"><div><h3>Volume analyser</h3>
        <p>How easily each stock can be bought and later sold, at your <b>{(B_PACE.find(([k]) => k === v.pace) || [, ""])[1].toLowerCase()}</b> pace ({v.pace_pct}% of a normal day){v.by_volume ? " — sized to what each stock supports" : " — your plan is kept as it is"}.</p></div></div>
      <div className="bd-vkpis">
        <div id="vk-liquid"><span className="px-label">Liquid allocation <Info text="Share of the invested money in stocks that trade ₹10 crore or more a day (High or Very high liquidity). The higher it is, the easier the whole portfolio is to buy and to sell."/></span><b>{v.high_share}%</b><small>in High / Very high liquidity</small></div>
        <div id="vk-days"><span className="px-label">Execution period <Info text="Trading days needed to buy every stock at your buying pace without pushing prices, following the Execution plan below."/></span><b>{v.days.toLocaleString("en-IN")} day{v.days === 1 ? "" : "s"}</b><small>at your buying pace</small></div>
        <div id="vk-within"><span className="px-label">Within liquidity limit <Info text="Stocks whose amount is no bigger than their trading supports (five days of buying at your pace). 'Capped' stocks were reduced to that limit and the rest of their money went to the other stocks."/></span><b>{v.fits + v.capped}</b><small>{v.capped ? `${v.capped} capped at the limit` : `of ${v.fits + v.capped + v.over + v.unknown} stocks`}</small></div>
        <div id="vk-over" className={v.over ? "warn" : ""}><span className="px-label">Over liquidity limit <Info text="Stocks whose amount is bigger than their trading supports. They take longer to buy and are slow to sell in a hurry. Turn on 'Size by trading volume' in More options to cap them."/></span><b>{v.over}</b><small>{v.over ? `${inrShort(v.over_amt)} in them` : "none"}</small></div>
        <div id="vk-impact"><span className="px-label">Est. market impact <Info text="How much your own buying may push prices, on average, from the shares you buy each day compared with what each stock trades. Small orders in busy stocks have no effect."/></span><b>{pushTxt(v.push) || "—"}</b><small>average while buying</small></div>
      </div>
      <div className="bd-glabel"><span className="px-label">Liquidity grade of the money <Info text="Money traded in the stock each day: Very high ₹50 Cr or more · High ₹10 Cr or more · Moderate ₹2 Cr or more · Low ₹50 L or more · Very low below ₹50 L. Low and Very low stocks are always bought at no more than 5% of a day."/></span></div>
      <div className="bd-gbar" role="img" aria-label={order.map(k => `${k} ${g[k] || 0}%`).join(", ")}>
        {order.filter(k => g[k] > 0).map(k => <span key={k} className={`g${5 - order.indexOf(k)}`} style={{ flexGrow: g[k] }} title={`${k} trading: ${g[k]}% of the money`}>{g[k] >= 8 && <em>{k} {g[k]}%</em>}</span>)}</div>
      <div className="bd-glegend">{order.map(k => <span key={k}><i className={`g${5 - order.indexOf(k)}`}/>{k}</span>)}</div>
      {!v.by_volume && over.length > 0 && <div className="bd-vbanner" id="bd-vbanner">
        <b>⚠ {over.length} stock{over.length === 1 ? " is" : "s are"} too big for {over.length === 1 ? "its" : "their"} trading</b> ({inrShort(v.over_amt)}).
        Buying them at your pace takes up to {Math.max(...over.map(p => p.liq.days)).toLocaleString("en-IN")} days and they are slow to sell. Turn on “Size by trading volume” in More options to keep each within what it supports.
        <div className="bd-vlist">{over.slice(0, 12).map(p => <span key={p.s}><b>{p.s}</b> {(p.amt / p.liq.most_amt).toFixed(1)}× · max {inrShort(p.liq.most_amt)}</span>)}{over.length > 12 && <span>+{over.length - 12} more</span>}</div></div>}
      {(v.replaced || []).length > 0 && <p className="bd-vnote">Left out because they trade too little to take a useful share: {v.replaced.slice(0, 10).map(r => `${r.s} (up to ${inrShort(r.most_amt)})`).join(", ")}{v.replaced.length > 10 ? ` and ${v.replaced.length - 10} more` : ""}.</p>}
      <FloatBanner res={res} picks={picks}/>
      <MarketTricks/>
    </section>);
}

// sticky section tabs on the result page: a click scrolls to the section; the tab of the section in view is lit
function SectionTabs({ tabs }) {
  const [on, setOn] = useState(tabs[0][0]);
  useEffect(() => {
    const els = tabs.map(([id]) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(es => {
      const vis = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis.length) setOn(vis[0].target.id);
    }, { rootMargin: "-80px 0px -55% 0px", threshold: 0 });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [tabs.map(t => t[0]).join()]);
  const go = id => { const el = document.getElementById(id); if (el) { setOn(id); el.scrollIntoView({ behavior: "smooth", block: "start" }); } };
  return (
    <nav className="bd-tabs" aria-label="Sections" id="bd-tabs">
      {tabs.map(([id, label]) => <button key={id} type="button" className={on === id ? "on" : ""} aria-current={on === id ? "true" : undefined} onClick={() => go(id)} data-tab={id}>{label}</button>)}
    </nav>);
}

const yearsTxt = d => d >= 500 ? ` (about ${Math.round(d / 250)} years)` : d >= 60 ? ` (about ${Math.round(d / 21)} months)` : "";
function BuyingPlan({ plan, picks, res }) {
  const [all, setAll] = useState(false);
  const days = all ? plan.days : plan.days.slice(0, 7);
  const sw = picks.map(p => p.liq && p.liq.swing).filter(Boolean).sort((a, b) => a - b);
  const swing = sw.length ? Math.max(1, Math.round(sw[Math.floor(sw.length / 2)])) : 3;      // a typical day's move of these stocks
  const byS = Object.fromEntries(picks.map(p => [p.s, p]));
  if (plan.total_days <= 1) return (                       // everything in one day: a short list, no day-by-day plan
    <section className="px-card bd-plan" id="bd-plan">
      <div className="px-ch"><div><h3>Execution plan · 1 day</h3><p>Every stock can be bought today, in full.</p></div></div>
      <div className="bd-buys">{plan.days[0] && plan.days[0].buys.map(b => <span key={b.s}><b>{b.s}</b> {qtyTxt(b.qty)}</span>)}</div>
      <div className="bd-tips"><div className="px-label">How to place the orders</div>
        <ul><li>Use limit orders at or near the current price, not market orders.</li>
          <li>Avoid the first and last 15 minutes of the day, when prices swing the most.</li></ul></div>
    </section>);
  return (
    <section className="px-card bd-plan" id="bd-plan">
      <div className="px-ch"><div><h3>Execution plan · {plan.total_days.toLocaleString("en-IN")} day{plan.total_days === 1 ? "" : "s"}{yearsTxt(plan.total_days)}</h3>
        <p>{plan.one_day} stock{plan.one_day === 1 ? "" : "s"} can be bought in full on day 1{plan.multi_day ? `; ${plan.multi_day} need${plan.multi_day === 1 ? "s" : ""} several days — start them on day 1 and continue each day, the slowest first` : ""}.</p></div></div>
      <ol className="bd-days-list">
        {days.map(d => (
          <li key={d.day} className="bd-day" data-day={d.day}>
            <div className="bd-dh"><b>Day {d.day}</b><span>{inrShort(d.amt)}</span><small>{Math.round(d.total / res.invested * 100)}% bought</small></div>
            <div className="bd-buys">{d.buys.map(b => <span key={b.s} className={b.done ? "done" : ""} title={b.done ? "Completes this stock" : "Part of this stock"}><b>{b.s}</b> {qtyTxt(b.qty)}{b.done ? " ✓" : ""}</span>)}</div>
          </li>))}
      </ol>
      {plan.days.length > 7 && <button type="button" className="px-btn" onClick={() => setAll(v => !v)} id="bd-plan-all">{all ? "Show fewer days" : `Show all ${plan.days.length} days`}</button>}
      {plan.more && <div className="bd-later" id="bd-plan-more">
        <div className="bd-laterh">⚠ {plan.more.stocks.length} stock{plan.more.stocks.length === 1 ? "" : "s"} still need buying after day {plan.more.from - 1} — the last one finishes on day {plan.more.to.toLocaleString("en-IN")}{yearsTxt(plan.more.to)}.</div>
        <p>They trade too little for the amount planned: buying faster would push their prices up. Consider a smaller amount in them, or turn on “Size by trading volume”.</p>
        <div className="table-wrap"><table className="bd-t bd-latert">
          <thead><tr><th>Stock</th><th className="num">Shares a day</th><th className="num">Shares still to buy</th><th className="num">Money still to invest</th><th className="num">Finished on</th></tr></thead>
          <tbody>{plan.more.stocks.map(x => <tr key={x.s}><td><b>{x.s}</b></td><td className="num mono">{qtyTxt(x.per_day)}</td><td className="num mono">{qtyTxt(x.qty)}</td>
            <td className="num mono">{byS[x.s] ? inrShort(x.qty * byS[x.s].p) : "—"}</td><td className="num">day {x.days.toLocaleString("en-IN")}{yearsTxt(x.days)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>Still to invest after day {plan.more.from - 1}</td><td className="num mono"><b>{inrShort(plan.more.amt)}</b></td><td></td></tr></tfoot></table></div>
      </div>}
      <div className="bd-tips"><div className="px-label">How to place the orders</div>
        <ul>
          <li>Use limit orders at or near the current price, not market orders.</li>
          <li>Split each day's shares into 2–4 orders through the day, and avoid the first and last 15 minutes.</li>
          <li>If a stock jumps more than about {swing}% (a normal day's move for these stocks) above today's price, pause it and buy the rest on another day.</li>
          <li>On a day with big news or unusually heavy trading in a stock, skip that stock for the day.</li>
        </ul></div>
    </section>);
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
  // builder plan (Access manager: builder:customer / trader / admin) — limits shown here, enforced by the server
  // the form is drawn only once the plan is known, so a limited customer never sees options they do not have
  const [plan, setPlan] = useState(null);
  const [planErr, setPlanErr] = useState(""), [planTry, setPlanTry] = useState(0);
  useEffect(() => {
    setPlanErr("");
    api("/app/api/builder/plan").then(pl => {
      setPlan(pl);
      setInpRaw(p => {                                         // keep the saved inputs inside the plan
        const n = { ...p };
        if (pl.max_amount && n.amount > pl.max_amount) { n.amount = pl.max_amount; setAmtText(Math.round(pl.max_amount).toLocaleString("en-IN")); }
        if (n.count > pl.max_stocks) n.count = pl.max_stocks;
        n.rel = n.rel.filter(r => pl.reliability.includes(r)); if (!n.rel.length) n.rel = ["S"];
        if (!pl.options) { n.opts = { ...pl.defaults.opts }; n.sector = pl.defaults.sector_max; n.weighting = pl.defaults.weighting; }
        return n;
      });
    }).catch(e => { if (e.status === 401) onOut(e.message); else setPlanErr(e.message || "Could not load your settings."); });
  }, [planTry]);
  const maxAmt = plan ? plan.max_amount : B_MAX_AMT, minAmt = plan ? plan.min_amount : B_MIN_AMT, maxN = plan ? plan.max_stocks : B_MAX_N;
  const locked = !!plan && !plan.options;
  const a = inp.alloc, eqSum = a.Large + a.Mid + a.Small;
  const amtOk = inp.amount >= minAmt && (maxAmt == null || inp.amount <= maxAmt), nOk = inp.count >= B_MIN_N && inp.count <= maxN;
  const per = amtOk && nOk ? inp.amount * eqSum / 100 / inp.count : null;
  const spread = amtOk && nOk ? spreadCheck(inp.amount, inp.count, a.Cash) : null;
  const opt = inp.opts, setOpt = patch => setInp({ opts: { ...opt, ...patch } });
  const [pool, setPool] = useState(null);                         // how many stocks pass every check today (live, counts only)
  const optKey = JSON.stringify([inp.rel, opt]);
  useEffect(() => {
    if (!plan) return;                                            // the saved inputs are clamped to the plan first
    const t = setTimeout(() => api("/app/api/builder/preview", { method: "POST", json: { reliability: inp.rel, opts: opt } })
      .then(setPool).catch(e => { if (e.status === 401) onOut(e.message); }), 250);
    return () => clearTimeout(t);
  }, [optKey, plan]);
  const changed = ["horizon", "quality", "confirmed", "stock_max", "run_up", "fno_only", "by_volume", "pace", "by_float"].filter(k => opt[k] !== B_OPT_DEFAULT[k]).length
    + (opt.exclude.length ? 1 : 0) + (inp.sector !== B_DEFAULT.sector) + (inp.weighting !== "equal");
  const [secSel, setSecSel] = useState([]);                       // sector filter on the plan's stock table
  useEffect(() => { setSecSel([]); setOpenRows(new Set()); }, [res]);
  const [openRows, setOpenRows] = useState(() => new Set());       // stocks whose detail row is open
  const toggleRow = sym => setOpenRows(o => { const x = new Set(o); x.has(sym) ? x.delete(sym) : x.add(sym); return x; });
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
  const setAmount = t => { const digits = t.replace(/[^\d]/g, "").slice(0, 15); setAmtText(digits ? Number(digits).toLocaleString("en-IN") : ""); setInp({ amount: Number(digits) || 0 }); };
  const limited = !!plan && plan.tier === "customer";            // amounts / stocks / options limited for this access
  const amtProblem = !plan ? "" : amtOk ? "" : maxAmt != null && inp.amount > maxAmt ? `Your access allows amounts up to ${inrShort(maxAmt)}.` : `Enter an amount of at least ${inr(minAmt)}.`;
  const nProblem = !plan || nOk ? "" : inp.count > maxN ? `Your access allows up to ${maxN} stocks.` : `Choose at least ${B_MIN_N} stocks.`;
  const problem = !plan ? "Loading…" : amtProblem || nProblem || (eqSum <= 0 ? "Put some money in at least one market-cap group." : "");
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
      const L = p => p.liq || {};
      const rows = [["Stock", "Ticker", "Market cap", "Sector", "Industry", "Price (₹)", "Quantity", "Amount (₹)", "Weight %", "Long-term strength", "Reliability",
          "Trading", "Shares a day (dependable)", "₹ traded a day", "Most it supports (shares)", "Most it supports (₹)", "Buy per day (shares)", "Days to buy", "Days to sell in a hurry", "% of one day", "Price push %", "Volume check", "Warnings",
          "Free float (shares)", "Free float % of all shares", "% of free float held", "Most at the free-float standard (shares)", "Free float check"],
        ...picks.map(p => { const F = p.ff || {}; return [p.n, p.s, `${p.cap} cap`, p.sec, p.ind, p.p, p.qty, p.amt, p.w, p.st, RELIABILITY[p.h] ? RELIABILITY[p.h][0] : "",
          L(p).grade_word || "Not known", L(p).dep ?? "", L(p).value ?? "", L(p).most ?? "", L(p).most_amt ?? "", L(p).per_day ?? "", L(p).days ?? "", L(p).exit_days ?? "",
          L(p).share ?? "", L(p).push ?? "", V_STATUS[L(p).status] || "", (L(p).warn || []).join(" | "),
          F.free ?? "", F.free_pct ?? "", F.held ?? "", F.most ?? "", FF_STATUS[F.status] || ""]; }),
        [], ["Cash kept", "", "", "", "", "", "", Math.round(res.cash), res.cash_pct], ["Total", "", "", "", "", "", "", res.amount, 100],
        ...(res.plan ? [[], ["Buying plan", `${res.plan.total_days} day${res.plan.total_days === 1 ? "" : "s"}`], ["Day", "Ticker", "Shares", "Amount (₹)", "Finishes this stock"],
          ...res.plan.days.flatMap(d => d.buys.map(b => [d.day, b.s, b.qty, b.amt, b.done ? "yes" : ""])),
          ...(res.plan.more ? res.plan.more.stocks.map(x => [`${res.plan.more.from}–${res.plan.more.to}`, x.s, x.qty, "", `${x.per_day} a day`]) : [])] : []),
        [], [`Hyperplane AI Portfolio Builder · data as of ${fmtDT(res.as_of)} · for education only, not investment advice`]];
      const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
      const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `Hyperplane-Portfolio-Builder-${istToday()}.csv`;
      document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 1000);
      trackAction("builder", "download");
    };
    const ask = () => { setAdded("ask"); setPfNow(null); api("/app/api/portfolio").then(r => setPfNow((r.symbols || []).length)).catch(() => setPfNow(0)); };
    const sendPf = mode => { setAdded("busy"); onAddToPortfolio(picks.map(p => p.s), mode).then(() => { setAdded(mode); trackAction("builder", "sent"); }).catch(e => setAdded(`Could not update the list: ${e.message}`)); };
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
          <button type="button" className="px-btn" onClick={() => onOpenApp("portfolio")}>Open the Analyser</button>
          <button type="button" className="bd-x" onClick={() => setAdded("")} aria-label="Close this message" title="Close" id="bd-done-x">✕</button></div>}
        {added && !["ask", "busy", "add", "replace"].includes(added) && <div className="pf-miss">{added}</div>}

        <SectionTabs tabs={[["bd-kpis", "Overview"], ["bd-row", "Allocation"], ...(res.volume ? [["bd-volume", "Volume analyser"]] : []),
          ["bd-hold", "Holdings"], ...(res.plan ? [["bd-plan", "Execution plan"]] : [])]}/>

        <section className="bd-kpis" id="bd-kpis">
          <div className="px-card bd-kpi"><span className="px-label">Amount</span><b><Money v={res.amount}/></b><small>{res.amount >= 1e7 ? "Cr = crore (1,00,00,000)" : inrShort(res.amount)}</small></div>
          <div className="px-card bd-kpi"><span className="px-label">Invested in stocks</span><b><Money v={res.invested}/></b><small>{(100 - res.cash_pct).toFixed(1)}% of the amount</small></div>
          <div className="px-card bd-kpi cash"><span className="px-label">Cash kept <Info text={`Cash for safety: your ${res.alloc.Cash}% choice plus what is left after buying whole shares or when too few stocks passed the checks. Keeping cash lets you add on dips and pay charges without selling.`}/></span><b><Money v={res.cash}/></b><small>{res.cash_pct.toFixed(1)}% of the amount</small></div>
          <div className="px-card bd-kpi"><span className="px-label">Stocks</span><b>{res.stocks}</b><small>{res.stocks < res.count ? `of the ${res.count} you asked for` : "as you asked"}</small></div>
          <div className="px-card bd-kpi"><span className="px-label">Average strength <Info text="The average long-term strength of the stocks picked, from −100 to +100 (the same strength as the AI Portfolio Analyser). It is how strong the trend is, not a price change."/></span>
            <b className={tc(res.avg_st)}>{signed(res.avg_st)}</b><small className={tc(res.avg_st)}>{trendWordOf(res.avg_st)}</small></div>
        </section>

        <section className="px-row2 bd-row" id="bd-row">
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

        {res.volume && <VolumeSection res={res} picks={picks}/>}

        <section className="px-card px-hold bd-hold" id="bd-hold">
          <div className="px-ch"><div><h3>Portfolio holdings</h3><p>{secSel.length ? `${shown.length} of ${picks.length} stocks · ${secSel.join(", ")}` : "Whole shares at today's price. Prices move, so check the price before you buy."}</p></div>
            <div className="bd-tf"><span className="px-label">Sector</span>
              <MultiSelect label="sectors" options={res.by_sec.map(r => r.k)} value={secSel} onChange={setSecSel} width={190}/></div></div>
          <div className="table-wrap"><table className="bd-t">
            <thead><tr><th className="bd-xh"><button type="button" className="bd-xall" id="bd-xall" onClick={() => setOpenRows(o => o.size ? new Set() : new Set(shown.map(p => p.s)))}
              title={openRows.size ? "Collapse all" : "Expand all"} aria-label={openRows.size ? "Collapse all" : "Expand all"}>{openRows.size ? "−" : "+"}</button></th><th>#</th><th>Stock</th><th className="hide-sm">Sector · Industry</th><th className="num">Price</th><th className="num">Quantity</th><th className="num">Amount</th><th className="num">Weight</th>
              <th className="num" title="Long-term strength from −100 to +100 (AI Portfolio engine), not a price change">Strength</th>
              <th title="Liquidity grade and whether your amount fits the stock's trading — open the row for the full analysis">Liquidity</th></tr></thead>
            <tbody>{caps.filter(c => shown.some(p => p.cap === c)).map(c => <React.Fragment key={c}>
              <tr className="bd-grp"><td colSpan={10}><i style={{ background: B_COL[c] }}/>{c} cap · {shown.filter(p => p.cap === c).length} stocks · <Money v={shown.filter(p => p.cap === c).reduce((t, p) => t + p.amt, 0)}/></td></tr>
              {shown.filter(p => p.cap === c).map(p => (<React.Fragment key={p.s}>
                <tr data-sym={p.s} className={`${p.liq && p.liq.status === "over" ? "bd-over" : ""} ${openRows.has(p.s) ? "bd-open" : ""}`}>
                  <td className="bd-xc"><button type="button" className="bd-xbtn" aria-expanded={openRows.has(p.s)} aria-label={`${openRows.has(p.s) ? "Hide" : "Show"} details of ${p.s}`}
                    onClick={() => toggleRow(p.s)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button></td>
                  <td className="mono dim">{picks.indexOf(p) + 1}</td>
                  <td><StockLink sym={p.s} app="builder"><span className="sym">{p.s}</span></StockLink>{p.tier === 2 && <span className="bd-tier" title="The trend is still building: added because not enough stocks with a strong trend passed every check in this group">Building</span>}<div className="sub"><StockLink sym={p.s} app="builder">{p.n}</StockLink></div></td>
                  <td className="hide-sm"><span className="sec" style={{ color: colorOf(p.sec) }}>● {p.sec}</span><div className="sub">{p.ind}</div></td>
                  <td className="num mono">₹{p.p.toLocaleString("en-IN")}</td>
                  <td className="num mono" title={`${p.qty.toLocaleString("en-IN")} shares`}><b>{qtyTxt(p.qty)}</b></td>
                  <td className="num mono"><Money v={p.amt}/></td>
                  <td className="num mono">{p.w.toFixed(2)}%</td>
                  <td className={`num mono ${tc(p.st)}`}><b>{signed(p.st)}</b></td>
                  <td><VolCell p={p} open={openRows.has(p.s)} onClick={() => toggleRow(p.s)}/>
                    {p.ff && p.ff.status === "over" && <button type="button" className="bd-ffx" onClick={() => toggleRow(p.s)} title="Open the row for the free-float check">⚠ {pct(p.ff.held)} of free float</button>}</td>
                </tr>
                {openRows.has(p.s) && <tr className="bd-vrow"><td colSpan={10}>
                  <div className="bd-detail" id={`bd-detail-${p.s}`}>
                    <div className="bd-dsec"><div className="bd-dh2">Why it was picked</div><div className="bd-why lg">{p.why.map(w => <span key={w}>{w}</span>)}</div></div>
                    <div className="bd-dsec"><div className="bd-dh2">Volume analyser</div><VolCard p={p}/></div>
                    {p.ff && p.ff.show && <div className="bd-dsec"><div className="bd-dh2">Free float <Info text={FF_INFO}/></div><FloatCard p={p}/></div>}
                  </div></td></tr>}</React.Fragment>))}
            </React.Fragment>)}
              {!secSel.length && <tr className="bd-cash"><td></td><td></td><td colSpan={4}><i style={{ background: B_COL.Cash }}/>Cash kept for safety</td><td className="num mono"><Money v={res.cash}/></td><td className="num mono">{res.cash_pct.toFixed(2)}%</td><td colSpan={2}></td></tr>}
            </tbody></table></div>
        </section>

        {res.plan && <BuyingPlan plan={res.plan} picks={picks} res={res}/>}

        <p className="fine bd-fine">This is a model portfolio made by fixed rules on our trend data, for education only. It is not investment advice or a recommendation to buy or sell. Check each stock yourself, and consider a SEBI-registered adviser before investing.</p>
      </div>
    );
  }

  if (!plan) return (
    <div className="pf bd" id="bd-wait">
      <section className="card bd-wait">
        {brand}
        {planErr
          ? <><div className="pf-miss" role="alert">{planErr}</div>
              <button type="button" className="px-btn" id="bd-wait-retry" onClick={() => setPlanTry(n => n + 1)}>Try again</button></>
          : <><div className="bd-wait-bar"/><div className="bd-wait-bar short"/><p>Getting the builder ready…</p></>}
      </section>
    </div>
  );

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
            {amtProblem ? <div className="pf-miss bd-ferr" role="alert" id="bd-amt-err">{amtProblem}</div>
              : limited && <div className="bd-hint" id="bd-access">Your access allows amounts up to {inrShort(maxAmt)} and up to {maxN} stocks.</div>}
            <div className="bd-chips">{B_AMOUNTS.filter(v => maxAmt == null || v <= maxAmt).map(v => <button key={v} type="button" className={inp.amount === v ? "on" : ""} onClick={() => setAmount(String(v))}>{v < 100000 ? `₹${v / 1000} K` : inrShort(v)}</button>)}</div>
          </div>

          <div className="bd-f" id="bd-count">
            <span className="bd-l">2 · Number of stocks</span>
            <div className="bd-chips">{B_COUNTS.filter(n => n <= maxN).map(n => <button key={n} type="button" className={!custom && inp.count === n ? "on" : ""} onClick={() => { setCustom(false); setInp({ count: n }); }}>{n} stocks</button>)}
              <button type="button" className={custom ? "on" : ""} onClick={() => setCustom(true)}>Custom</button>
              {custom && <input type="number" className="bd-n" id="bd-n" min={B_MIN_N} max={maxN} value={inp.count || ""} aria-label="Number of stocks"
                onChange={e => setInp({ count: Math.min(maxN, Math.max(0, Math.round(Number(e.target.value) || 0))) })}/>}</div>
            <div className="bd-hint">{per ? <>About <b>{money(per)}</b> per stock. </> : null}Up to {maxN.toLocaleString("en-IN")} stocks{limited ? " with your access" : ""}. More stocks spread the risk; fewer let each idea matter.</div>
            {nProblem && <div className="pf-miss bd-ferr" role="alert" id="bd-n-err">{nProblem}</div>}
            <SpreadNote chk={spread} id="bd-spread" onFix={n => { n = Math.min(n, maxN); setCustom(!B_COUNTS.includes(n)); setInp({ count: n }); }}/>
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
              {plan && !plan.reliability.includes("M")
                ? <button type="button" id="bd-rel-m" className="off" disabled title="Medium reliability is not included in your access">🔒 Medium</button>
                : <button type="button" id="bd-rel-m" className={inp.rel.includes("M") ? "on" : ""} onClick={() => setInp({ rel: inp.rel.includes("M") ? ["S"] : ["S", "M"] })}>{inp.rel.includes("M") ? "✓ " : "+ "}Medium</button>}
              <button type="button" id="bd-rel-w" className="off" disabled title="Low reliability stocks once fell more than 70% from their highest price. The builder never uses them.">🔒 Low</button>
            </div>
          </div>

          {pool && <div className={`bd-pool ${pool.total < inp.count ? "short" : ""}`} id="bd-pool">
            <span><b>{pool.total.toLocaleString("en-IN")}</b> stocks pass every check today</span>
            <small>{["Large", "Mid", "Small"].map(c => `${pool.by_cap[c].strong + pool.by_cap[c].building} ${c.toLowerCase()}`).join(" · ")}</small>
            {pool.total < inp.count && <em>Fewer than the {inp.count} you asked for: the plan holds the ones that pass and keeps your cash share.</em>}
          </div>}

          <details className="bd-more" id="bd-more">
            <summary>More options <span>{locked ? "🔒 fixed for your access" : changed ? `${changed} changed` : "horizon · trend quality · regime · limits · sectors"}</span></summary>
            {locked && <div className="bd-lock" id="bd-lock">🔒 These are the standard settings, fixed for your access.</div>}
            <fieldset className="bd-fs" disabled={locked}>
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
              <span className="bd-l">Size by trading volume <Info text="A stock that trades little cannot take a big amount: buying it pushes the price up and selling it later is slow. Yes: no stock gets more than its trading supports, the rest goes to the other stocks in its group (or cash), and stocks that can take only a little are replaced by the next best. No: your plan stays as it is, and every stock that is too big for its trading is marked with a warning."/></span>
              <div className="bd-chips bd-cards2">{B_VOLUME.map(([k, l, d]) => <button key={l} type="button" id={`bd-v-${k ? "y" : "n"}`} className={opt.by_volume === k ? "on" : ""} onClick={() => setOpt({ by_volume: k })}><b>{l}</b><small>{d}</small></button>)}</div>
            </div>
            <div className="bd-f" id="bd-float">
              <span className="bd-l">Size by free float <Info text={`${FF_INFO} Big investors keep each holding to a small part of it, so they can sell later without trouble. Yes: no stock gets more than 1% of its free float; the rest goes to the other stocks in its group, and a stock that can take only a little is replaced by the next best. No: your plan stays as it is, and a stock that takes a large part of its free float is shown in its details.`}/></span>
              <div className="bd-chips bd-cards2">{B_FLOAT.map(([k, l, d]) => <button key={l} type="button" id={`bd-ff-${k ? "y" : "n"}`} className={opt.by_float === k ? "on" : ""} onClick={() => setOpt({ by_float: k })}><b>{l}</b><small>{d}</small></button>)}</div>
            </div>
            <div className="bd-f" id="bd-pace">
              <span className="bd-l">Buying pace <Info text="How much of a stock's normal day of trading you buy each day. Buying a bigger share pushes the price up against you. Stocks that trade little, or very unevenly, are always bought more slowly. The plan's 'most it supports' is five days of buying at this pace."/></span>
              <div className="bd-chips bd-cards2 three">{B_PACE.map(([k, l, d]) => <button key={k} type="button" id={`bd-pace-${k}`} className={opt.pace === k ? "on" : ""} onClick={() => setOpt({ pace: k })}><b>{l}</b><small>{d}</small></button>)}</div>
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
            </fieldset>
          </details>

          {(err || (problem && !amtProblem && !nProblem && problem !== "Loading…")) && <div className="pf-miss" role="alert">{err || problem}</div>}
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
