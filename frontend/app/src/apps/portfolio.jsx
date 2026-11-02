// AI Portfolio Analyser — a lazily loaded application module.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiSpark, Icon, addCss, trackAction } from "../core.jsx";
import { G_ZONES, Info, RELIABILITY, RG_INFO, StockLink, StockSearch, TrendGauge, dirVal, fmtDT, signed, tc, trendWordOf } from "../core.jsx";
import { LT_TF, PF_CAT, PF_CATS, PF_MIN_YEARS, PF_ORDER, StrengthTiles, analyseHolding, portfolioSummary, zDir } from "./portfolio-engine.jsx";
import { placeLabels } from "../labels.js";
import { CSS } from "./portfolio.css.js";

addCss("portfolio", CSS);

function HoldingItem({ r, flash }) {
  const [, label, tone] = PF_CAT[r.cat];
  const rel = r.s.h && r.cat !== "new" ? RELIABILITY[r.s.h] : null;
  const grp = x => !x ? ["no data", ""] : x.nb > 0 ? ["strong", "good"] : x.nb < 0 ? ["weak", "bad"] : ["flat", ""];
  const [sw, st] = grp(r.g.sec), [iw, it] = grp(r.g.ind);
  const isNew = r.cat === "new";
  return (
    <article id={`pf-card-${r.s.s}`} className={`px-item ${tone} ${flash ? "flash" : ""}`}>
      <div className="px-who">
        <div className="px-name"><StockLink sym={r.s.s} app="portfolio"><b title={r.s.n}>{r.s.n}</b></StockLink><StockLink sym={r.s.s} app="portfolio"><em>{r.s.s}</em></StockLink></div>
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
          <div className="px-chips">
            <span className="px-chip"><i className={st}/>Sector: {sw}</span>
            <span className="px-chip"><i className={it}/>Industry: {iw}</span>
          </div>
        </div>
      </div>
      <div className="px-how">
        {isNew ? <div className="px-newnote"><b>Recently listed</b><span>No view yet. The quant algorithm needs at least {PF_MIN_YEARS} years of yearly data.</span></div> : <>
          <StrengthTiles r={r}/>
        </>}
      </div>
      <div className="px-whyc">
        <div className="px-aih"><AiSpark/><b>Hyperplane AI</b><span>Research summary</span></div>
        <ul className="px-why">{(isNew ? r.why.slice(0, 1) : r.why).map((w, i) => <li key={i}>{w}</li>)}</ul>
      </div>
    </article>
  );
}


const PF_COL = { bad: "var(--short)", mid: "var(--mixed)", good: "var(--long)", side: "#8b97ad" };

function TrendMap({ rows, onPick }) {
  const box = useRef(null);
  const [size, setSize] = useState([700, 380]);       // drawn at the box's real size, so text keeps its normal size
  useEffect(() => { const el = box.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setSize([Math.round(e.contentRect.width), Math.round(e.contentRect.height)]));
    ro.observe(el); return () => ro.disconnect(); }, []);
  const pts = rows.filter(r => r.cat !== "new" && r.tf.Q.v != null && r.tf.Y.v != null);
  const hidden = rows.length - pts.length;
  const W = Math.max(280, size[0]), H = Math.max(260, size[1]), L = 30, R = 12, T = 22, B = 40;
  const x = v => L + (v + 100) / 200 * (W - L - R), y = v => T + (100 - v) / 200 * (H - T - B);
  const quads = [["Rising", "good", 1, 1], ["Cooling off", "mid", -1, 1], ["Recovering", "mid", 1, -1], ["Falling", "bad", -1, -1]];
  // ticker labels: right, left, above or below the dot, whichever overlaps nothing (red first); else hover only
  const dots = pts.map(r => ({ r, cx: x(r.tf.Q.v), cy: y(r.tf.Y.v) }));
  const tags = placeLabels([...dots].sort((a, b) => PF_ORDER[a.r.cat] - PF_ORDER[b.r.cat]).map(d => ({ key: d.r.s.s, x: d.cx, y: d.cy, label: d.r.s.s })),
    { box: [x(-100), y(100), x(100), y(-100)] });
  const unlabelled = pts.length - Object.keys(tags).length;
  return (
    <div className="px-card px-map">
      <div className="px-ch">
        <div><h3>Trend map</h3><p>Each dot is one stock. Right: stronger quarterly trend. Up: stronger yearly trend.</p></div>
        <div className="px-legend">{PF_CATS.filter(c => c[0] !== "new").map(([k, l, t]) => <span key={k}><i className={t}/>{l}</span>)}</div>
      </div>
      <div ref={box} className="pf-mapw"><svg className="pf-map" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend map of your stocks">
        {quads.map(([lbl, tone, sx, sy]) => (
          <g key={lbl}>
            <rect x={sx > 0 ? x(0) : x(-100)} y={sy > 0 ? y(100) : y(0)} width={x(0) - x(-100)} height={y(0) - y(100)} style={{ fill: PF_COL[tone] }} opacity=".06"/>
            <text x={sx > 0 ? x(100) : x(-100)} y={sy > 0 ? y(100) - 7 : y(-100) + 15} textAnchor={sx > 0 ? "end" : "start"} className="pf-mq" style={{ fill: PF_COL[tone] }}>{lbl}</text>
          </g>))}
        {[-50, 50].map(v => <g key={`g${v}`}><line x1={x(v)} x2={x(v)} y1={y(100)} y2={y(-100)} className="pf-mgrid"/><line x1={x(-100)} x2={x(100)} y1={y(v)} y2={y(v)} className="pf-mgrid"/></g>)}
        <rect x={x(-100)} y={y(100)} width={x(100) - x(-100)} height={y(-100) - y(100)} className="pf-mframe"/>
        <line x1={x(0)} x2={x(0)} y1={y(100)} y2={y(-100)} className="pf-max"/>
        <line x1={x(-100)} x2={x(100)} y1={y(0)} y2={y(0)} className="pf-max"/>
        <text x={x(0)} y={y(-100) + 13} textAnchor="middle" className="pf-mt">0</text>
        {[-100, 100].map(v => <text key={`y${v}`} x={L - 4} y={y(v) + (v > 0 ? 9 : -2)} textAnchor="end" className="pf-mt">{v > 0 ? "+100" : signed(v)}</text>)}
        <text x={x(0)} y={H - 4} textAnchor="middle" className="pf-mt b">Quarterly trend →</text>
        <text transform={`translate(10 ${y(0)}) rotate(-90)`} textAnchor="middle" className="pf-mt b">Yearly trend →</text>
        {dots.map(({ r, cx, cy }) => { const t = tags[r.s.s];
          return (
            <g key={r.s.s} className="pf-dot" onClick={() => onPick(r.s.s)}>
              <title>{`${r.s.n} (${r.s.s}): quarterly ${signed(r.tf.Q.v)}%, yearly ${signed(r.tf.Y.v)}%. ${PF_CAT[r.cat][1]}.`}</title>
              <circle cx={cx} cy={cy} r="6.5" style={{ fill: PF_COL[PF_CAT[r.cat][2]], stroke: "var(--s1)" }} strokeWidth="2.5"/>
              {t && <text x={t[1]} y={t[2]} textAnchor={t[0]} className="pf-ml">{r.s.s}</text>}
            </g>); })}
      </svg></div>
      <div className="px-foot">{hidden > 0 ? `${hidden} not shown: recently listed or no yearly data yet. ` : ""}{unlabelled > 0 ? "Point at a dot to see its name. " : ""}Click a dot to open the stock.</div>
    </div>
  );
}

// PDF report (owner, 2026-10-17): the page hands report.js the same numbers and words it shows; report.js only draws.
const PF_LONG = {
  review: "The stock's strength is weak (-24% or lower), or its reliability is low because it once fell more than 70% from its highest price. Look at these first.",
  watch: "Mixed signs: the strength is between -24% and +24% (moving sideways), the quarterly view is negative, or the price rose very fast. Check these from time to time.",
  intact: "The stock's strength is +24% or more and the quarterly view is not negative. The bigger picture is holding up well.",
  new: "Less than 3 years of yearly price data, so Hyperplane AI gives no view on these yet.",
};
const PF_GUIDE = [
  ["Stock strength", "A number from -100 to +100. Above +24% is an uptrend, below -24% is a downtrend, in between is sideways. Weak, Average, Good and Strong tell how strong the trend is (up to 30%, up to 60%, up to 80%, above 80%)."],
  ["Monthly, quarterly and yearly views", "For each period Hyperplane AI checks whether the trend is going up, flat or going down and for how long (for example, going down for the last 3 quarters), and how strong today's price is for this month, quarter and year. The quarter counts most, then the year, then the month. Daily and weekly moves are left out."],
  ["Long-term regime", "Tells you whether the long-term regime of each stock is up or down. A monthly, quarterly or yearly trend that goes against it is not trusted yet, so it is shown as sideways. Turning down means it has started changing from up to down; changed to down means the change is complete. Turning up is not confirmed until it lasts a few more weeks."],
  ["Reliability", "High, Medium or Low, from the stock's whole price history. Low means it once fell more than 70% from its highest price, which means more risk."],
  ["Rose very fast", "The price went up more than 3 times in a year. Such fast gains often cool off, so these stocks are never marked Doing well."],
  ["Trend map", "Each dot is one stock. Top right (Rising): the quarterly and yearly trends are both up. Bottom left (Falling): both down. Top left (Cooling off) and bottom right (Recovering) are mixed."],
  ["Sector and industry", "Shown on each stock for reference only. They are never used to calculate the strength and never change a colour."],
  ["Your privacy", "This report was made on your own device. Your stock list is visible only to you, the account holder. It is never visible to other users or to the admin, as per SEBI norms."],
];
function reportModel(rows, sum, data, me) {
  const now = new Date();
  const dots = rows.filter(r => r.cat !== "new" && r.tf.Q.v != null && r.tf.Y.v != null)
    .map(r => ({ s: r.s.s, q: r.tf.Q.v, y: r.tf.Y.v, tone: PF_CAT[r.cat][2], rank: PF_ORDER[r.cat] }));
  const grp = x => !x ? "no data" : x.nb > 0 ? "strong" : x.nb < 0 ? "weak" : "flat";
  return {
    file: `Hyperplane-Portfolio-Report-${now.toISOString().slice(0, 10)}.pdf`,
    customer: (me && me.name) || "", asOf: fmtDT(data.as_of), total: rows.length,
    generated: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    title: sum.title, tone: sum.tone, lines: sum.lines, avg: sum.avg, avgWord: trendWordOf(sum.avg), zones: G_ZONES,
    cats: PF_CATS.map(([k, label, tone, desc]) => ({ key: k, label, tone, desc, long: PF_LONG[k], count: sum.counts[k],
      items: rows.filter(r => r.cat === k).sort((a, b) => k === "new" ? (b.s.yh ?? 0) - (a.s.yh ?? 0) : k === "review" ? a.lt - b.lt : b.lt - a.lt)
        .map(r => ({ n: r.s.n, s: r.s.s, v: k === "new" ? null : r.lt, extra: r.s.yh != null ? `${r.s.yh} yr` : "new" })) })),
    dots, hidden: rows.length - dots.length, guide: PF_GUIDE,
    keys: (() => {
      const live = rows.filter(r => r.cat !== "new"), q = r => r.zone ? (r.tf.Q.tr == null ? null : zDir(r.tf.Q)) : r.tf.Q.d;
      const up = live.filter(r => q(r) >= 1).length, down = live.filter(r => q(r) <= -1).length;
      const low = rows.filter(r => r.s.h === "W").length, fast = rows.filter(r => r.s.x).length;
      const tone = v => v == null ? "side" : v < 0 ? "bad" : dirVal(v) === 1 ? "good" : "side";
      return [["Stocks analysed", String(rows.length), `${live.length} with a full view`, "side"],
        ["Portfolio strength", sum.avg == null ? "No data" : `${sum.avg < 0 ? "-" : ""}${Math.abs(sum.avg)}%`, trendWordOf(sum.avg), tone(sum.avg)],
        ["Trending up", String(up), "on the quarterly view", up ? "good" : "side"],
        ["Trending down", String(down), "on the quarterly view", down ? "bad" : "side"],
        ["Low reliability", String(low), "fell over 70% in the past", low ? "bad" : "good"],
        ["Rose very fast", String(fast), "3 times or more in a year", fast ? "mid" : "good"]];
    })(),
    stocks: [...rows].sort((a, b) => PF_ORDER[a.cat] - PF_ORDER[b.cat] || (a.lt ?? 999) - (b.lt ?? 999)).map(r => ({
      n: r.s.n, s: r.s.s, sec: r.s.sec, ind: r.s.ind, label: PF_CAT[r.cat][1], tone: PF_CAT[r.cat][2], isNew: r.cat === "new",
      chips: [r.rg && r.cat !== "new" && [r.rg.word, r.rg.tone], r.improving && ["Improving", "good"], r.s.cap && [`${r.s.cap} cap`, null],
        r.s.h && r.cat !== "new" && [`Reliability: ${RELIABILITY[r.s.h][0]}`, RELIABILITY[r.s.h][1]], r.s.x && ["Rose very fast", "mid"]].filter(Boolean),
      v: r.lt, word: trendWordOf(r.lt), why: r.why,
      tfs: LT_TF.map(([k, , lbl]) => ({ label: lbl, v: r.tf[k].v, word: r.tf[k].v == null ? "" : trendWordOf(r.tf[k].v),
        note: k === "Y" ? "Needs 10 years" : "Not enough data" })),
      ref: `Sector: ${grp(r.g.sec)}. Industry: ${grp(r.g.ind)}. Shown for reference only, not used in the strength.`,
    })),
  };
}

function PortfolioView({ data, symbols, setSymbols, status, me }) {
  const bySym = useMemo(() => Object.fromEntries(data.stocks.map(x => [x.s, x])), [data]);
  const added = useMemo(() => new Set(symbols), [symbols]);
  const rows = useMemo(() => symbols.filter(k => bySym[k]).map(k => analyseHolding(bySym[k], data)), [symbols, bySym, data]);
  const missing = symbols.filter(k => !bySym[k]);
  const sum = rows.length ? portfolioSummary(rows) : null;
  const add = k => { if (!added.has(k)) setSymbols([...symbols, k]); };
  const remove = k => setSymbols(symbols.filter(x => x !== k));
  const [stage, setStage] = useState(symbols.length ? "result" : "build");
  const [confirmClear, setConfirmClear] = useState(false);
  const [show, setShow] = useState("all");
  const [order, setOrder] = useState("bad");            // bad = weakest first · good = best first (recently listed always last)
  const [rel, setRel] = useState([]);                  // reliability filter (multi-select): S high · M medium · W low; none = all
  const [flash, setFlash] = useState(null);
  const [making, setMaking] = useState("");             // "" · "busy" · error text
  const listed = rows.filter(r => (show === "all" || r.cat === show) && (!rel.length || rel.includes(r.s.h))).sort((a, b) => order === "bad"
    ? PF_ORDER[a.cat] - PF_ORDER[b.cat] || (a.lt ?? 999) - (b.lt ?? 999)
    : (a.cat === "new") - (b.cat === "new") || PF_ORDER[b.cat] - PF_ORDER[a.cat] || (b.lt ?? -999) - (a.lt ?? -999));
  const jump = k => { setShow("all"); setFlash(k); setTimeout(() => { const el = document.getElementById(`pf-card-${k}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60); setTimeout(() => setFlash(null), 1800); };
  const plural = n => `${n} stock${n === 1 ? "" : "s"}`;
  const clearAll = <>{confirmClear
    ? <span className="pf-clr">Remove all {symbols.length}? <button type="button" onClick={() => { setSymbols([]); setConfirmClear(false); setStage("build"); }}>Yes, clear</button><button type="button" onClick={() => setConfirmClear(false)}>Cancel</button></span>
    : <button type="button" className="pf-clrbtn" onClick={() => setConfirmClear(true)}>Clear all</button>}</>;
  const brand = <div className="px-eyebrow"><AiSpark/> Hyperplane AI · Portfolio Analyser <span>by QuantFriday</span></div>;
  const lock = <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2"/></svg>;
  const search = <StockSearch stocks={data.stocks} onPick={add} added={added} keepOpen placeholder="Type a stock name or ticker to add it"/>;
  const privacy = <div className="pf-priv"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
    <span><b>Private to you.</b> Your stock list is visible only to you, the account holder. It is never visible to other users or to the admin, as per SEBI norms. We take the privacy of your investments seriously.</span></div>;

  if (stage === "build" || !symbols.length) return (
    <div className="pf">
      <section className="card pf-start">
        <div className="pf-sl">
          {brand}
          <h1>Know where your portfolio <span>stands today</span></h1>
          <p className="pf-lead">Add the stocks you own. Hyperplane AI checks each one and puts it in a clear colour group,
            with a simple reason for every stock. No quantities, no prices, no spreadsheets.</p>
          <div className="pf-add">{search}</div>
          <div className="pf-build">
            <div className="pf-bhead"><b>Your list</b><span className="dim">{plural(symbols.length)}{status ? ` · ${status}` : ""}</span>{symbols.length > 0 && clearAll}</div>
            {symbols.length ? <div className="pf-blist pf-scroll">{symbols.map((k, i) => (
              <div key={k} className="pf-bi"><span className="pf-bn">{i + 1}</span><b className="mono">{k}</b><span className="pf-bname">{bySym[k] ? bySym[k].n : "not in today's data"}</span>
                <button type="button" onClick={() => remove(k)} aria-label={`Remove ${k}`} title={`Remove ${k}`}><Icon name="x" size={12}/></button></div>))}</div>
              : <div className="pf-bempty">Your list is empty. Type a stock name or ticker above to add your first stock.</div>}
            <button type="button" className="pf-go" disabled={!symbols.length} onClick={() => { setStage("result"); window.scrollTo(0, 0); }}>
              Analyse my portfolio{symbols.length ? ` (${symbols.length})` : ""}</button>
          </div>
        </div>
        <aside className="pf-sr">
          <h3>How it works</h3>
          <div className="pf-steps">
            <div className="pf-step"><b>1</b><span><strong>Add your stocks</strong>Type a name or ticker. Add as many as you like.</span></div>
            <div className="pf-step"><b>2</b><span><strong>Press Analyse</strong>Hyperplane AI reads the trend of every stock in a moment.</span></div>
            <div className="pf-step"><b>3</b><span><strong>See the full picture</strong>Every stock gets a colour and the reasons behind it.</span></div>
          </div>
          <h3>What the colours mean</h3>
          <div className="pf-key">{PF_CATS.map(([k, l, t]) => <div key={k} className={t}><i/>{l}</div>)}</div>
          <h3>Your privacy</h3>
          {privacy}
          <div className="pf-trust"><AiSpark/><span>Built on Hyperplane's own quant algorithms.</span></div>
        </aside>
      </section>
    </div>
  );

  const KIND = { bad: "Needs attention", mid: "Mixed", good: "Healthy", side: "Too new" };
  const ranked = rows.filter(r => r.cat !== "new" && r.lt != null).sort((a, b) => b.lt - a.lt);
  const secN = {}; rows.forEach(r => { secN[r.s.sec] = (secN[r.s.sec] || 0) + 1; });
  const [topSec, topN] = Object.entries(secN).sort((a, b) => b[1] - a[1])[0] || ["", 0];
  const topPct = rows.length ? Math.round(topN / rows.length * 100) : 0, nSec = Object.keys(secN).length;
  const capN = ["Large", "Mid", "Small"].map(c => [c, rows.filter(r => r.s.cap === c).length]).filter(c => c[1]);
  const facts = ranked.length ? [
    ["Strongest", `${ranked[0].s.s} ${signed(ranked[0].lt)}%`, tc(ranked[0].lt)],
    ["Weakest", `${ranked[ranked.length - 1].s.s} ${signed(ranked[ranked.length - 1].lt)}%`, tc(ranked[ranked.length - 1].lt)],
    ["Spread", `${nSec} sector${nSec === 1 ? "" : "s"} · top ${topPct}%`, rows.length >= 4 && topPct >= 40 ? "c-mid" : "c-good",
      `Your ${rows.length} stocks are spread across ${nSec} sector${nSec === 1 ? "" : "s"}. The largest, ${topSec}, holds ${topN} of them (${topPct}%).`
      + ` When one sector holds 40% or more of your stocks, a bad phase for that sector hits a big part of the portfolio.`
      + (capN.length ? ` By company size: ${capN.map(([c, n]) => `${c} cap ${n}`).join(", ")}.` : "") + " Every stock counts equally (no quantities)."],
    ["Low reliability", `${rows.filter(r => r.s.h === "W").length} of ${rows.length}`, rows.some(r => r.s.h === "W") ? "c-bad" : "c-good"],
  ] : [];
  return (
    <div className="pf px">
      <header className="px-head">
        <div className="px-ht">
          {brand}
          <h1>Your portfolio</h1>
          <div className="px-meta">{plural(symbols.length)} · Data as of {fmtDT(data.as_of)}{status ? ` · ${status}` : ""}</div>
        </div>
        <div className="px-actions">
          <div className="px-search"><StockSearch stocks={data.stocks} onPick={add} added={added} keepOpen placeholder="Add a stock: name or ticker"/></div>
          <button type="button" className="px-btn" onClick={() => { setStage("build"); window.scrollTo(0, 0); }}>Edit list</button>
          {sum && <button type="button" className="px-btn primary pf-dl" disabled={making === "busy"} onClick={() => {
            setMaking("busy");
            import("../report.js").then(({ downloadReport }) => { downloadReport(reportModel(rows, sum, data, me)); setMaking(""); trackAction("portfolio", "report"); })
              .catch(e => setMaking(`Could not make the report: ${e.message || e}`));
          }}><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {making === "busy" ? "Preparing…" : "Download report"}</button>}
        </div>
      </header>
      <div className="px-privacy">{lock}<span><b>Private to you.</b> Your stock list is visible only to you, the account holder. It is never visible to other users or to the admin, as per SEBI norms. We take the privacy of your investments seriously.</span></div>
      {making && making !== "busy" && <div className="pf-miss">{making}</div>}
      {missing.length > 0 && <div className="pf-miss">Not in today's data: {missing.join(", ")}. They stay in your list and are checked again when they appear.</div>}

      {sum && <>
        <section className="px-card px-strip">
          <div className="px-sg"><TrendGauge v={sum.avg} size={150} caption={false}/></div>
          <div className="px-sm2">
            <div className="px-label">Current strength of the portfolio <Info text="The average strength of your stocks that have enough history. It uses each stock's own data only. Right of 0 means moving up, left of 0 means moving down."/></div>
            <div className="px-sfacts">
              <div className="px-sv"><b className={tc(sum.avg)}>{sum.avg == null ? "No data" : <>{signed(sum.avg)}<small>%</small></>}</b><span className={tc(sum.avg)}>{trendWordOf(sum.avg)}</span></div>
              <dl className="px-facts">{facts.map(([k, v, c, tip]) => <div key={k}><dt>{k}{tip && <Info text={tip}/>}</dt><dd className={c}>{v}</dd></div>)}</dl>
            </div>
          </div>
          <div className="px-smix">
            <div className="px-label">How your {rows.length} stocks are split</div>
            <div className="px-split">{PF_CATS.map(([k, , tone]) => sum.counts[k] ? <span key={k} className={tone} style={{ flex: sum.counts[k] }} title={`${PF_CAT[k][1]}: ${sum.counts[k]}`}/> : null)}</div>
            <div className="px-splitl">{PF_CATS.map(([k, label, tone]) => <div key={k} className={sum.counts[k] ? "" : "zero"}><i className={tone}/><span>{label}</span><b className="px-num">{sum.counts[k]}</b></div>)}</div>
          </div>
        </section>

        <section className="px-row2">
          <div className="px-card px-sumc">
            <div className="px-label"><AiSpark/> Hyperplane AI summary <Info text="Built on Hyperplane's own quant algorithms: fixed rules on our trend data. No outside AI service is used and it never makes up a number. For information only, not investment advice."/></div>
            <div className="px-headline"><span className={`px-pill ${sum.tone}`}><i/>{KIND[sum.tone]}</span><h2>{sum.title}</h2></div>
            <ul className="px-points">{sum.lines.map(([t, txt], i) => <li key={i} className={`pl-${t}`}>{txt}</li>)}</ul>
          </div>
          <TrendMap rows={rows} onPick={jump}/>
        </section>

        <section className="px-card px-hold">
          <div className="px-ch">
            <div><h3>Holdings</h3><p>{listed.length} of {rows.length} stocks · every stock with its strength and the reasons in plain words</p></div>
            <div className="px-tools">
              <div className="px-seg" role="group" aria-label="Reliability">
                <span className="px-segl">Reliability <Info wide text={<>
                  <b>Reliability</b> comes from the stock's whole price history. It tells you how safely the stock has behaved in the past, not how strong it is today.
                  <br/><br/><b>Low:</b> it once fell more than 70% from its highest price. That means more risk, so Hyperplane AI always puts it in Look at first.
                  <br/><b>Medium:</b> it is more than 50% below its highest price, or lower than it was 5 years ago.
                  <br/><b>High:</b> it has stayed close to its highest price over the years. The steadiest history.
                </>}/></span>
                {[["S", "High"], ["M", "Medium"], ["W", "Low"]].map(([k, l]) => {
                  const n = rows.filter(r => r.s.h === k).length, on = rel.includes(k);
                  return <button key={k} type="button" role="checkbox" aria-checked={on} disabled={!n} className={on ? "on" : ""}
                    onClick={() => setRel(on ? rel.filter(x => x !== k) : [...rel, k])}>{l} <b>{n}</b></button>; })}
              </div>
              <div className="px-seg" role="radiogroup" aria-label="Sort">
                <span className="px-segl">Sort</span>
                {[["bad", "Weakest first"], ["good", "Best first"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={order === k} className={order === k ? "on" : ""} onClick={() => setOrder(k)}>{l}</button>)}
              </div>
            </div>
          </div>
          <div className="px-split px-split2">{PF_CATS.map(([k, , t]) => sum.counts[k] ? <span key={k} className={t} style={{ flex: sum.counts[k] }}/> : null)}</div>
          <div className="px-tabs" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={show === "all"} className={`px-tab all ${show === "all" ? "on" : ""}`} onClick={() => setShow("all")}>
              <span className="px-tl"><i/>All stocks</span><b className="px-num">{rows.length}</b><small>100% of portfolio</small></button>
            {PF_CATS.map(([k, label, t]) => (
              <button key={k} type="button" role="tab" aria-selected={show === k} disabled={!sum.counts[k]} className={`px-tab ${t} ${show === k ? "on" : ""}`} onClick={() => setShow(show === k ? "all" : k)}>
                <span className="px-tl"><i/>{label}</span>
                <b className="px-num">{sum.counts[k]}</b>
                <small>{rows.length ? Math.round(sum.counts[k] / rows.length * 100) : 0}% of portfolio</small>
              </button>))}
          </div>
          {show !== "all" && <p className="px-tdesc"><i className={PF_CAT[show][2]}/>{PF_CAT[show][3]}</p>}
          {!listed.length && <p className="px-tdesc">No stock matches these filters.</p>}
          <div className="px-list">{listed.map(r => <HoldingItem key={r.s.s} r={r} flash={flash === r.s.s}/>)}</div>
        </section>
        <div className="sv-foot dim">Data as of {fmtDT(data.as_of)} · Hyperplane AI by QuantFriday · For education only, not investment advice.</div>
      </>}
    </div>
  );
}


export default PortfolioView;
