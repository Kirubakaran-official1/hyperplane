// AI Mode — a lazily loaded application module.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiSpark, BrandBand, Icon, addCss, trackAction } from "../core.jsx";
import { CopyBtns, DivBar, Info, LEVEL, MODES, ModeWeights, OverallMeter, RELIABILITY, RegimeBox, StockSearch, aan, combinedView, dirToneOf, dirVal, fmtDT, isBi, levelOf, pct, regimeOf, signed, sizeOf, trendWordOf } from "../core.jsx";
import { CSS } from "./simple.css.js";
import { CellField } from "../cells.jsx";

addCss("simple", CSS);

// One stat card (owner round 11: "the 4 stats look old, make them better"): an icon tile + what it measures + the name, the big
// number, a gauge from −100 to +100 with a marker (or, for reliability, three steps Low · Medium · High), and the plain word.
function Gauge({ v, tone }) {
  const p = v == null ? 50 : Math.max(0, Math.min(100, (v + 100) / 2));
  return (
    <div className="sx-gauge" role="img" aria-label={v == null ? "No reading" : `${v} on a scale from −100 to +100`}>
      <div className="sx-gt"><i className={`fill ${tone}`} style={{ left: `${Math.min(50, p)}%`, width: `${Math.abs(p - 50)}%` }}/><i className={`dot ${tone}`} style={{ left: `${p}%` }}/></div>
      <div className="sx-gs" aria-hidden="true"><span>−100</span><span>0</span><span>+100</span></div>
    </div>);
}
function Stat({ label, icon, name, sub, value, pct, tone, word, note, steps }) {
  return (
    <div className={`card sx-stat ${tone}`}>
      <div className="sx-sh">
        <span className="sx-si" aria-hidden="true"><Icon name={icon} size={18}/></span>
        <div className="sx-shn"><div className="sx-sl">{label}</div><div className="sx-sn" title={name}>{name}{sub && <span className="sx-ssub">{sub}</span>}</div></div>
      </div>
      {value != null
        ? <><div className={`sx-sv ${tone}`}>{value}<small>%</small></div><Gauge v={pct} tone={tone}/><span className={`sx-sw ${tone}`}>{word}</span></>
        : <><div className={`sx-sv word ${tone}`}>{word}</div>
            {steps && <div className="sx-steps" aria-hidden="true">{steps.map(([k, on]) => <i key={k} className={on ? `on ${tone}` : ""}><span>{k}</span></i>)}</div>}
            {note && <div className="sx-snote">{note}</div>}</>}
    </div>
  );
}

// combinedView title → professional wording for AI Mode (the rule itself is unchanged)
const PRO_VERDICT = {
  "Overheated — don't chase": ["Overextended — avoid chasing", "The price has risen three times or more in about a year. Even with a strong trend, moves this extended often retrace; a consolidation is the safer point to consider it."],
  "Watch — stock still building": ["Watchlist — trend still developing", "Its sector and industry are strong, but the stock's own trend is only average. Worth monitoring until the stock's trend strengthens."],
  "Best case — with the tide": ["Strong set-up — fully aligned", "The stock is trending up, and both its sector and industry are Good or Strong — everything points the same way."],
  "Careful — against its group": ["Caution — weak group backing", "The stock is trending up, but its sector or industry is Weak. A stock moving against its group carries more risk."],
  "Okay — group is only average": ["Positive — average group backing", "The stock is trending up, but its sector and industry are only Average. Stocks with Good or Strong group support are generally preferable."],
  "Watch only — a laggard": ["Laggard — weak stock in a strong group", "The group is strong, but the stock is in a downtrend. It may catch up or keep lagging; it is not a buying candidate yet."],
  "Avoid for buying": ["Unfavourable — no support", "The stock is in a downtrend and its sector and industry offer no support."],
  "Good group, mixed timeframes": ["Mixed — timeframes disagree", "Its sector and industry are strong, but the stock's short- and long-term trends point in different directions. Waiting for them to align lowers the risk."],
};
const proVerdict = (view, groupStrong) => !view ? null : view.title === "No edge yet"
  ? ["Neutral — no clear trend", groupStrong ? "There is no clear trend in the stock yet, although its group is strong. Wait for the stock to establish a direction." : "There is no clear trend in the stock. Better candidates are available."]
  : PRO_VERDICT[view.title] || [view.title.replace(/^[^A-Za-z]+/, ""), view.text];

// Sector / industry on −100 … +100 (owner, 2026-10-13): the number is the group's strength (0–100%), the sign is its
// direction — net bias > 0 = bullish (right side of the bubble chart), < 0 = bearish (left side)
const grpSigned = g => !g ? null : (g.nb < 0 ? -1 : 1) * Math.round(g.st);
const grpDir = g => !g ? 0 : g.nb > 0 ? 1 : g.nb < 0 ? -1 : 0;
const grpTone = g => !g ? "side" : g.nb > 0 ? "good" : g.nb < 0 ? "bad" : "side";
const grpWord = g => !g ? "No data" : `${levelOf(g.st)} · ${g.nb > 0 ? "bullish" : g.nb < 0 ? "bearish" : "neutral"}`;

const PERIOD_ROWS = [["Days", "short term"], ["Weeks", ""], ["Months", ""], ["Quarters", ""], ["Years", "long term"]];


// The landing background's blocks (owner 2026-11-07: "the blocks over the mouse effect … while opening the blocks pop up from
// top to down"): a field of square cells behind the page. On opening, the cells pop in a wave from the top to the bottom; the
// cell under the mouse lights up and leaves a fading trail; the mouse lights the cell under it and leaves a fading trail. A canvas, drawn
// only while something moves; reduced motion draws nothing but the still grid.

function SimpleView({ data, mode, setMode, sym, setSym }) {
  const stocks = data.stocks;
  useEffect(() => { if (sym) trackAction("simple", "search"); }, [sym]);           // adoption: a stock looked up
  // choosing a stock on the landing page (owner round 7: "a small animation after choosing the stock name, on Enter"): the
  // page gathers for a moment — "Hyperplane AI is reading …" with the three things it reads — then the answer rises in
  const [picking, setPicking] = useState(null); const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (sym) setPicking(null); }, [sym]);
  const pick = k => {
    let calm = false; try { calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* ignore */ }
    if (calm) { setSym(k); return; }
    setPicking(k); clearTimeout(timer.current); timer.current = setTimeout(() => setSym(k), 1100);
  };
  const s = sym ? stocks.find(x => x.s === sym) : null;
  if (!s) return (
    <div className="sv sv-empty">
      {/* the landing background (owner round 6: "a gradient effect as the best landing page"): soft moving light + a fading grid */}
      <div className={`sv-aura ${picking ? "boost" : ""}`} aria-hidden="true"><i/><i/><i/><i/></div><div className="sv-grid" aria-hidden="true"/><CellField className="sv-cells"/>
      {picking && <div className="sv-think" id="sv-think" role="status" aria-live="polite">
        <span className="sv-ring" aria-hidden="true"><i/><AiSpark/></span>
        <b>Hyperplane AI is reading <span>{picking}</span></b>
        <ol aria-hidden="true"><li>Trend strength</li><li>Sector &amp; industry</li><li>Reliability</li></ol>
      </div>}
      <div className={`sv-hero ${picking ? "picking" : ""}`} id="sv-hero">
        <div className="px-eyebrow sv-eb"><AiSpark/> Hyperplane AI · AI Mode <span>by QuantFriday</span></div>
        <h1>Understand any stock <span>in seconds</span></h1>
        <p>Type a company name or ticker. Hyperplane AI explains its trend, sector, industry and reliability in plain words.</p>
        <StockSearch stocks={stocks} onPick={pick} autoFocus/>
        <div className="sv-feats">
          <span><b>Trend strength</b> out of 100</span><span><b>Sector &amp; industry</b> score and rank</span><span><b>Historical reliability</b> High / Medium / Low</span>
        </div>
        {data.top && data.top.length > 0 && <div className="sv-try"><span className="dim">Strongest right now:</span>
          {data.top.slice(0, 6).map(k => <button key={k} type="button" onClick={() => pick(k)}>{k}</button>)}</div>}
      </div>
    </div>
  );
  const od = dirVal(s.os), bi = isBi(s, []);
  const ctx = (tf, ind) => { const list = ((ind ? data.industries : data.sectors) || {})[tf] || [];
    const i = list.findIndex(r => ind ? r.k === s.ind && r.sec === s.sec : r.k === s.sec);
    return i < 0 ? null : { ...list[i], rank: i + 1, of: list.length }; };
  const secA = ctx("A", false), indA = ctx("A", true);
  const view = combinedView(od, bi, secA, indA, s.os, !!s.x);
  const peers = stocks.filter(x => x.os != null && x.sec === s.sec && x.ind === s.ind).sort((a, b) => b.os - a.os);
  const myRank = peers.findIndex(x => x.s === s.s) + 1;
  const a = s.os == null ? null : Math.abs(s.os);
  const trendWord = trendWordOf, dirTone = dirToneOf;
  const stockWord = trendWord(s.os);
  const [secTone, secWord] = secA ? LEVEL(secA) : ["side", "No data"];
  const [indTone, indWord] = indA ? LEVEL(indA) : ["side", "No data"];
  const rel = RELIABILITY[s.h] || null;
  // summary — fixed rules, in this order: stock trend → periods disagree → reliability → stretched → verdict
  const parts = [];
  const lw = s.os == null ? "" : levelOf(s.os).toLowerCase();
  parts.push(s.os == null ? `There is not enough data on ${s.n} yet.`
    : od === 1 ? `${s.n} is in ${aan(lw)} ${lw} uptrend (${a}%).`
    : od === -1 ? `${s.n} is in ${aan(lw)} ${lw} downtrend (${signed(s.os)}%).`
    : `${s.n} is moving sideways, with no clear direction (${signed(s.os)}%, leaning ${s.os < 0 ? "down" : "up"}).`);
  if (bi) parts.push("Its short- and long-term trends point in different directions.");
  const rg = regimeOf(s, data.rd);
  if (rg && rg.w) parts.push(rg.base);                       // what it means for the stock: the Regime analyser strip below
  if (rel) parts.push(s.h === "S" ? "Its long-term price history is reliable." : s.h === "M" ? "Its long-term price history is average." : "Its long-term price history is unreliable, with sharp falls or wild moves in the past.");
  if (s.x) parts.push("The price has risen three times or more in about a year, and moves this fast often reverse.");
  const pro = proVerdict(view, secTone === "good" && indTone === "good");
  if (pro) parts.push(pro[1]);
  const title = pro ? pro[0] : stockWord;
  const vt = view ? view.tone : "mid";
  return (
    <div className="sv sx sv-in" key={s.s}>
      <BrandBand product="AI Mode" title={s.n} accent={`· ${s.s}`} id="sv-band" sub={`${s.sec} › ${s.ind}`}
        right={<span className={`sv-vchip t-${vt}`} id="sv-vchip" title="The Hyperplane AI verdict">{title}</span>}/>
      <div className="sv-bar2">
        <StockSearch stocks={stocks} onPick={setSym} onClear={() => setSym(null)}/>
        <div className="sv-mode2">
          <span className="sv-ml">Trading mode <Info wide label="Trading mode weights per timeframe" text={<ModeWeights active={mode}/>}/></span>
          <div className="sv-pills" role="radiogroup" aria-label="Trading mode">
            {Object.entries(MODES).map(([k, m]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? "on" : ""} title={`${m.label}: ${m.hint}`} onClick={() => setMode(k)}>
                {k === "equal" ? "Balanced" : k === "swing" ? "Swing" : "Investing"}</button>))}
          </div>
        </div>
      </div>

      <section className="card sx-hero">
        <div className="sx-id">
          <div className="sx-title"><h2>{s.n}</h2><span className="sx-tick">{s.s}</span>{s.f ? <span className="sx-tag">F&amp;O</span> : null}</div>
          <div className="sx-meta">{s.sec} <span className="dim">›</span> {s.ind} <span className="dim">·</span> {sizeOf(s)} cap</div>
          <div className="sx-price"><b>₹{s.p}</b>{s.c != null && <span className={`sx-chg ${s.c >= 0 ? "up" : "down"}`}>{s.c >= 0 ? "+" : ""}{s.c}% today</span>}
            <span className="tcopy"><CopyBtns syms={[s.s]} compact/></span><span className="sx-meta2">{s.sec} › {s.ind} · {sizeOf(s)} cap</span></div>
          <div className={`sx-verdict ${vt}`}>
            <div className="sx-lbl"><AiSpark/> Hyperplane AI summary <Info text="Hyperplane AI is built on Hyperplane's own quant algorithms: fixed rules applied to our trend data — the same numbers as Deep Research. It does not use any outside AI service, and it never makes up a number."/></div>
            <div className="sx-vtitle">{title}</div>
            <p>{parts.join(" ")}</p>
          </div>
        </div>
        <div className="sx-meter"><OverallMeter os={s.os} secA={secA} indA={indA} size={250}/></div>
      </section>

      {rg && <section className="card sx-rg"><RegimeBox s={s} rd={data.rd} strip/></section>}

      <section className="sx-stats">
        <Stat label="Stock trend strength" icon="chart" name={s.n} sub={s.s} value={s.os == null ? null : signed(s.os)} pct={s.os} tone={dirTone(s.os)} word={stockWord}/>
        <Stat label="Sector strength" icon="layers" name={s.sec} sub="sector" value={secA ? signed(grpSigned(secA)) : null} pct={grpSigned(secA)} tone={grpTone(secA)} word={grpWord(secA)}/>
        <Stat label="Industry strength" icon="table" name={s.ind} sub="industry" value={indA ? signed(grpSigned(indA)) : null} pct={grpSigned(indA)} tone={grpTone(indA)} word={grpWord(indA)}/>
        <Stat label="Historical reliability" icon="check" name="Long-term price history" value={null} tone={rel ? rel[1] : "side"} word={rel ? rel[0] : "No data"} note={rel ? rel[2] : "Not enough history."}
          steps={[["Low", rel && rel[0] === "Low"], ["Medium", rel && rel[0] === "Medium"], ["High", rel && rel[0] === "High"]]}/>
      </section>

      <div className="sv-foot dim">Data as of {fmtDT(data.as_of)} · For education only — not investment advice.</div>
    </div>
  );
}

export default SimpleView;
