// ETF Analyser · the basket (round 23, owner 2026-11-15: "move the ETF to the basket, then move the basket to the analyser like the AI
// stock analyser — same page, same style, same download button, same Save portfolio … make that portfolio a SIP (ETF only) with all the
// options of the ETF SIP portfolio … place the order to Zerodha as SIP or one time"). The customer's basket (server-side, own row) is read
// here like the AI Portfolio Analyser reads a stock list: the gauge, the AI summary, the trend map, an AI check (a better ETF of the same
// market, the same market twice) and one card per ETF — on the ETF Analyser's own readings only (strength −100…+100, up / sideways / down
// at ±24, the recommended ETF of each market). Save = an ETF portfolio (tracked as 1 unit of each); Make it a SIP = the AI ETF SIP Builder's
// result page for the basket (sip.build_basket); Buy on Zerodha = a one-time basket of whole units for an amount.
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AiSpark, BrandBand, DivBar, G_ZONES, Icon, Info, TrendGauge, ZerodhaButton, ZerodhaCtx, addCss, api, dirVal, fmtDT, loadChunk, signed, tc, trackAction, trendWordOf } from "../core.jsx";
import { placeLabels } from "../labels.js";
import { CSS as ENGINE_CSS } from "./engine.css.js";
import { CSS as PF_CSS } from "./portfolio.css.js";
import { SaveBar, SavedNote } from "../saved.jsx";
import { SipResult } from "./sip.jsx";
import { aboutShort } from "./etf-about.js";

addCss("engine", ENGINE_CSS);
addCss("portfolio", PF_CSS);

// the ETF Analyser's own trend words (±24), in the AI Portfolio Analyser's colour groups — red, amber, green, grey
export const BK_CATS = [
  ["review", "Look at first", "bad", "In a long-term downtrend. Look at these first."],
  ["watch", "Keep an eye on", "mid", "Moving sideways: no clear long-term direction."],
  ["intact", "Doing well", "good", "In a long-term uptrend."],
  ["new", "Too new", "side", "Too new for a long-term reading."],
];
const BK_CAT = Object.fromEntries(BK_CATS.map(c => [c[0], c]));
const BK_ORDER = { review: 0, watch: 1, intact: 2, new: 3 };
export const catOf = e => e.st == null ? "new" : dirVal(e.st) === -1 ? "review" : dirVal(e.st) === 1 ? "intact" : "watch";
const EASE = { "Very high": "Very easy", High: "Easy", Moderate: "Fairly easy", Low: "Harder", "Very low": "Hard" };
const HARD = ["Low", "Very low"];
const TF = ["Monthly", "Quarterly", "Yearly"];
const COL = { bad: "var(--short)", mid: "var(--mixed)", good: "var(--long)", side: "#8b97ad" };
const inr = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const inr2 = v => v == null ? "—" : `₹${(+v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inrShort = v => v == null ? "—" : v >= 1e7 ? `₹${+(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${+(v / 1e5).toFixed(2)} L` : inr(v);
const plus = v => v == null ? "—" : `${v > 0 ? "+" : ""}${signed(v)}`;
const tfWord = v => dirVal(v) === 1 ? "rising" : dirVal(v) === -1 ? "falling" : "sideways";
const tfLine = tf => { const p = TF.map((l, i) => tf && tf[i] != null ? `${l.toLowerCase()} ${tfWord(tf[i])}` : null).filter(Boolean).join(" · ");
  return p ? `${p[0].toUpperCase()}${p.slice(1)}${tf && tf[2] == null ? " · too new for a yearly reading" : ""}.` : null; };
const plural = (n, w, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const gk = e => `${e.k}|${e.u}`;
const TYPE = { Gold: "Commodities", Silver: "Commodities", "Broad market": "Broad market", "Sector & theme": "Sectors & themes", Strategy: "Strategy", International: "International" };

// one ETF of the basket, read in plain words (only the ETF Analyser's readings — never a new rule)
function readEtf(e, g) {
  const best = g && g.best, cat = catOf(e);
  const why = [
    e.st == null ? `${e.s} is too new for a long-term reading.`
      : `${e.s} is ${cat === "intact" ? "in a long-term uptrend" : cat === "review" ? "in a long-term downtrend" : "moving sideways"} (strength ${plus(e.st)}).`,
    tfLine(e.tf),
    e.rg === 1 ? "Its overall direction is up." : e.rg === -1 ? "Its overall direction is down." : e.st != null ? "Its overall direction is flat." : null,
    e.r ? `The recommended ETF for ${e.u}: the most traded, with a long record.`
      : best && best.s !== e.s ? `${best.s} also follows ${e.u} and is ${(EASE[best.lq] || "easier").toLowerCase()} to trade — the better buy for this market.` : null,
    e.v ? `${EASE[e.lq] || "—"} to trade: about ${inrShort(e.v)} changes hands on a normal day${e.e ? " (uneven — buy with a limit order)" : ""}.` : null,
  ].filter(Boolean);
  return { e, g, best, cat, why, alt: !e.r && best && best.s !== e.s ? best : null };
}

// the basket in one look: counts, the average strength, the title and the plain-word lines of the AI summary
export function basketSummary(rows) {
  const n = rows.length, cnt = k => rows.filter(r => r.cat === k).length;
  const up = cnt("intact"), side = cnt("watch"), down = cnt("review"), nw = cnt("new");
  const known = rows.filter(r => r.e.st != null);
  const avg = known.length ? Math.round(known.reduce((a, r) => a + r.e.st, 0) / known.length) : null;
  const markets = new Map(); rows.forEach(r => markets.set(gk(r.e), [...(markets.get(gk(r.e)) || []), r.e]));
  const twice = [...markets.values()].filter(l => l.length > 1);
  const types = {}; rows.forEach(r => { const t = TYPE[r.e.k] || "Other"; types[t] = (types[t] || 0) + 1; });
  const metals = rows.filter(r => r.e.k === "Gold" || r.e.k === "Silver").length;
  const bestN = rows.filter(r => r.e.r).length, hard = rows.filter(r => HARD.includes(r.e.lq)).length;
  const title = !n ? "" : down ? `${down} of ${plural(n, "ETF")} in a long-term downtrend` : up * 2 >= n ? "Most of your basket is going up" : "Your basket is mostly moving sideways";
  const tone = down ? (down * 2 >= n ? "bad" : "mid") : up * 2 >= n ? "good" : "mid";
  const lines = [
    [up * 2 >= n ? "good" : "mid", `${up} going up · ${side} sideways · ${down} going down${nw ? ` · ${nw} too new` : ""}.`],
    ["info", `Spread over ${plural(markets.size, "market")} in ${plural(Object.keys(types).length, "type")}: ${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / n * 100)}%`).join(", ")} (each ETF counts equally).`],
    [bestN === n ? "good" : "mid", bestN === n ? "Every ETF is the recommended ETF of its market." : `${bestN} of ${n} are the recommended ETF of their market — for the others an easier ETF of the same market is shown.`],
    twice.length ? ["mid", `${twice.map(l => `${l[0].u} (${l.map(e => e.s).join(", ")})`).join("; ")}: two ETFs of one market move together — one is enough.`] : null,
    metals ? ["info", `${plural(metals, "ETF")} in gold / silver: they move differently from shares.`] : ["info", "No gold or silver ETF: every ETF in the basket moves with shares."],
    hard ? ["mid", `${plural(hard, "ETF is", "ETFs are")} harder to trade (few buyers and sellers) — buy with a limit order.`] : null,
  ].filter(Boolean);
  return { n, up, side, down, nw, avg, title, tone, lines, markets, twice, types, bestN, hard, counts: { review: down, watch: side, intact: up, new: nw } };
}

// the PDF (report.js, the AI Portfolio Analyser's report) for the basket — the same numbers and words as the screen
const BK_GUIDE = [
  ["ETF strength", "A number from -100 to +100. Above +24 is an uptrend, below -24 is a downtrend, in between is sideways."],
  ["Monthly, quarterly and yearly strength", "How strong the ETF's trend is over months, quarters and years. The quarter and the year matter most for a long-term holding."],
  ["Recommended ETF", "One for each market: the most traded ETF with a long record — the easiest to buy and sell at a fair price."],
  ["Trend map", "Each dot is one ETF. Top right (Rising): the quarterly and yearly trends are both up. Bottom left (Falling): both down. Top left (Cooling off) and bottom right (Recovering) are mixed."],
  ["Your privacy", "This report was made on your own device. Your basket is visible only to you, the account holder. It is never visible to other users or to the admin, as per SEBI norms."],
];
function reportModel(rows, sum, d, me) {
  const now = new Date();
  const dots = rows.filter(r => r.e.tf && r.e.tf[1] != null && r.e.tf[2] != null).map(r => ({ s: r.e.s, q: r.e.tf[1], y: r.e.tf[2], tone: BK_CAT[r.cat][2], rank: BK_ORDER[r.cat] }));
  const tone = v => v == null ? "side" : dirVal(v) === 1 ? "good" : dirVal(v) === -1 ? "bad" : "side";
  return {
    file: `Hyperplane-ETF-Basket-Report-${now.toISOString().slice(0, 10)}.pdf`, noun: "ETF", nouns: "ETFs", band: "HYPERPLANE AI  ·  ETF ANALYSER",
    title1: "ETF Basket", tagline: "A clear, long-term view of the ETFs in your basket, prepared by Hyperplane AI.", header: "ETF Basket Report",
    customer: (me && me.name) || "", asOf: fmtDT(d.as_of), total: rows.length,
    generated: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    title: sum.title, tone: sum.tone, lines: sum.lines, avg: sum.avg, avgWord: trendWordOf(sum.avg), zones: G_ZONES,
    cats: BK_CATS.map(([k, label, t, desc]) => ({ key: k, label, tone: t, desc, long: desc, count: sum.counts[k],
      items: rows.filter(r => r.cat === k).map(r => ({ n: r.e.n, s: r.e.s, v: r.e.st, extra: r.e.y ? `${Math.floor(r.e.y)} yr` : "new" })) })),
    dots, hidden: rows.length - dots.length, guide: BK_GUIDE, swaps: null,
    keys: [["ETFs analysed", String(rows.length), `${plural(sum.markets.size, "market")}`, "side"],
      ["Basket strength", sum.avg == null ? "No data" : `${sum.avg < 0 ? "-" : ""}${Math.abs(sum.avg)}%`, trendWordOf(sum.avg), tone(sum.avg)],
      ["Going up", String(sum.up), "long-term uptrend", sum.up ? "good" : "side"],
      ["Going down", String(sum.down), "long-term downtrend", sum.down ? "bad" : "good"],
      ["Best of market", `${sum.bestN} of ${rows.length}`, "the recommended ETF", sum.bestN === rows.length ? "good" : "mid"],
      ["Harder to trade", String(sum.hard), "few buyers and sellers", sum.hard ? "mid" : "good"]],
    stocks: [...rows].sort((a, b) => BK_ORDER[a.cat] - BK_ORDER[b.cat] || (a.e.st ?? 999) - (b.e.st ?? 999)).map(r => ({
      n: r.e.n, s: r.e.s, sec: r.e.k, ind: r.e.u, label: BK_CAT[r.cat][1], tone: BK_CAT[r.cat][2], isNew: r.cat === "new",
      chips: [r.e.r && ["Recommended", "good"], [`${EASE[r.e.lq] || "—"} to trade`, HARD.includes(r.e.lq) ? "mid" : null], r.e.y && [`${Math.floor(r.e.y)}+ years`, null]].filter(Boolean),
      v: r.e.st, word: trendWordOf(r.e.st), why: r.why,
      tfs: TF.map((l, i) => ({ label: l, v: r.e.tf ? r.e.tf[i] : null, word: r.e.tf && r.e.tf[i] != null ? trendWordOf(r.e.tf[i]) : "", note: "Not enough data" })),
      ref: `Market: ${r.e.u} · ${r.e.k}.${r.alt ? ` Better ETF of this market: ${r.alt.s}.` : ""}`,
    })),
  };
}

// a search box over today's ETFs: type a name, a ticker or a market; Enter (or a click) adds it
function EtfSearch({ etfs, added, onPick, full }) {
  const [q, setQ] = useState(""), [open, setOpen] = useState(false), [i, setI] = useState(0);
  const n = q.trim().toLowerCase();
  const hits = n ? etfs.filter(e => `${e.s} ${e.n} ${e.u}`.toLowerCase().includes(n)).sort((a, b) => (b.r || 0) - (a.r || 0) || (b.v || 0) - (a.v || 0)).slice(0, 8) : [];
  const pick = e => { if (!added.has(e.s) && !full) onPick(e.s); setQ(""); setI(0); };
  return (
    <div className="ef-bks" onBlur={() => setTimeout(() => setOpen(false), 120)}>
      <Icon name="search" size={14}/>
      <input className="search" id="ef-bk-q" value={q} placeholder={full ? "The basket is full" : "Add an ETF: name, ticker or market"} disabled={full} aria-label="Add an ETF to the basket"
        onChange={e => { setQ(e.target.value); setOpen(true); setI(0); }} onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setI(x => Math.min(hits.length - 1, x + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setI(x => Math.max(0, x - 1)); }
          if (e.key === "Enter" && hits[i]) pick(hits[i]); if (e.key === "Escape") setOpen(false); }}/>
      {open && hits.length > 0 && <div className="ef-bkl" role="listbox" id="ef-bk-hits">{hits.map((e, k) => (
        <button key={e.s} type="button" role="option" aria-selected={k === i} className={k === i ? "on" : ""} disabled={added.has(e.s)} data-hit={e.s}
          onMouseDown={x => { x.preventDefault(); pick(e); }}>
          <b>{e.r && <Icon name="star" size={11}/>}{e.s}</b><span>{e.u}<small>{e.n !== e.s ? e.n : ""}</small></span><em>{added.has(e.s) ? "In basket" : <Icon name="plus" size={13}/>}</em></button>))}</div>}
    </div>);
}

function TrendMap({ rows }) {
  const box = useRef(null);
  const [size, setSize] = useState([700, 380]);
  useEffect(() => { const el = box.current; if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([x]) => setSize([Math.round(x.contentRect.width), Math.round(x.contentRect.height)]));
    ro.observe(el); return () => ro.disconnect(); }, []);
  const pts = rows.filter(r => r.e.tf && r.e.tf[1] != null && r.e.tf[2] != null);
  const W = Math.max(280, size[0]), H = Math.max(260, size[1]), L = 30, R = 12, T = 22, B = 40;
  const x = v => L + (v + 100) / 200 * (W - L - R), y = v => T + (100 - v) / 200 * (H - T - B);
  const quads = [["Rising", "good", 1, 1], ["Cooling off", "mid", -1, 1], ["Recovering", "mid", 1, -1], ["Falling", "bad", -1, -1]];
  const dots = pts.map(r => ({ r, cx: x(r.e.tf[1]), cy: y(r.e.tf[2]) }));
  const tags = placeLabels([...dots].sort((a, b) => BK_ORDER[a.r.cat] - BK_ORDER[b.r.cat]).map(d => ({ key: d.r.e.s, x: d.cx, y: d.cy, label: d.r.e.s })), { box: [x(-100), y(100), x(100), y(-100)] });
  return (
    <div className="px-card px-map" id="ef-bk-map">
      <div className="px-ch">
        <div><h3>Trend map</h3><p>Each dot is one ETF. Right: stronger quarterly trend. Up: stronger yearly trend.</p></div>
        <div className="px-legend">{BK_CATS.filter(c => c[0] !== "new").map(([k, l, t]) => <span key={k}><i className={t}/>{l}</span>)}</div>
      </div>
      <div ref={box} className="pf-mapw"><svg className="pf-map" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend map of the ETFs in your basket">
        {quads.map(([lbl, tone, sx, sy]) => (
          <g key={lbl}>
            <rect x={sx > 0 ? x(0) : x(-100)} y={sy > 0 ? y(100) : y(0)} width={x(0) - x(-100)} height={y(0) - y(100)} style={{ fill: COL[tone] }} opacity=".06"/>
            <text x={sx > 0 ? x(100) : x(-100)} y={sy > 0 ? y(100) - 7 : y(-100) + 15} textAnchor={sx > 0 ? "end" : "start"} className="pf-mq" style={{ fill: COL[tone] }}>{lbl}</text>
          </g>))}
        {[-50, 50].map(v => <g key={`g${v}`}><line x1={x(v)} x2={x(v)} y1={y(100)} y2={y(-100)} className="pf-mgrid"/><line x1={x(-100)} x2={x(100)} y1={y(v)} y2={y(v)} className="pf-mgrid"/></g>)}
        <rect x={x(-100)} y={y(100)} width={x(100) - x(-100)} height={y(-100) - y(100)} className="pf-mframe"/>
        <line x1={x(0)} x2={x(0)} y1={y(100)} y2={y(-100)} className="pf-max"/><line x1={x(-100)} x2={x(100)} y1={y(0)} y2={y(0)} className="pf-max"/>
        <text x={x(0)} y={y(-100) + 13} textAnchor="middle" className="pf-mt">0</text>
        {[-100, 100].map(v => <text key={`y${v}`} x={L - 4} y={y(v) + (v > 0 ? 9 : -2)} textAnchor="end" className="pf-mt">{v > 0 ? "+100" : signed(v)}</text>)}
        <text x={x(0)} y={H - 4} textAnchor="middle" className="pf-mt b">Quarterly trend →</text>
        <text transform={`translate(10 ${y(0)}) rotate(-90)`} textAnchor="middle" className="pf-mt b">Yearly trend →</text>
        {dots.map(({ r, cx, cy }) => { const t = tags[r.e.s];
          return (
            <g key={r.e.s} className="pf-dot" onClick={() => { const el = document.getElementById(`ef-bk-card-${r.e.s}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
              <title>{`${r.e.n} (${r.e.s}): quarterly ${signed(r.e.tf[1])}, yearly ${signed(r.e.tf[2])}. ${BK_CAT[r.cat][1]}.`}</title>
              <circle cx={cx} cy={cy} r="6.5" style={{ fill: COL[BK_CAT[r.cat][2]], stroke: "var(--s1)" }} strokeWidth="2.5"/>
              {t && <text x={t[1]} y={t[2]} textAnchor={t[0]} className="pf-ml">{r.e.s}</text>}
            </g>); })}
      </svg></div>
      <div className="px-foot">{rows.length - pts.length > 0 ? `${rows.length - pts.length} not shown: too new for a yearly reading. ` : ""}Click a dot to go to the ETF.</div>
    </div>);
}

// one ETF of the basket, in the AI Portfolio Analyser's card layout
function EtfItem({ r, inBasket, onRemove, onSwap, onOpen }) {
  const [, label, tone] = BK_CAT[r.cat], e = r.e;
  return (
    <article id={`ef-bk-card-${e.s}`} className={`px-item ${tone}`} data-bk={e.s}>
      <div className="px-who">
        <div className="px-name"><button type="button" className="ef-bkname" onClick={() => onOpen(e)} title="Open the ETF card"><b title={e.n}>{e.n}</b><em>{e.s}</em></button></div>
        <div className="px-where">{e.k} › {e.u}</div>
        <span className={`px-pill ${tone}`}><i/>{label}</span>
        <div className="px-chips">
          {e.r && <span className="px-chip"><i className="good"/>Recommended for {e.u}</span>}
          <span className="px-chip"><i className={HARD.includes(e.lq) ? "mid" : "good"}/>{EASE[e.lq] || "—"} to trade</span>
          {e.y ? <span className="px-chip">{Math.floor(e.y)}+ years</span> : null}
          <span className="px-chip" title="One unit at the last price">1 unit · {inr2(e.p)}</span>
        </div>
        <div className="px-where ef-bkabout">{aboutShort(e.u, e.k)}</div>
      </div>
      <div className="px-how">
        {e.st == null ? <div className="px-newnote"><b>Too new</b><span>Not enough history for a long-term reading yet.</span></div> : <>
          <div className="px-label">ETF strength</div>
          <div className="px-dbig"><b className={tc(e.st)}>{signed(e.st)}</b><span className={tc(e.st)}>{trendWordOf(e.st)}</span></div>
          <DivBar v={e.st} d={dirVal(e.st)} scale className="px-dbar"/>
          <div className="px-tfs">{TF.map((l, i) => { const v = e.tf ? e.tf[i] : null;
            return <div key={l} className="px-tf"><span className="px-label">{l} strength</span>{v == null ? <span className="px-nodata">No data</span> : <b className={`px-tfv ${tc(v)}`}>{signed(v)}</b>}</div>; })}</div>
        </>}
      </div>
      <div className="px-whyc">
        <div className="px-aih"><AiSpark/><b>Hyperplane AI</b><span>Research summary</span></div>
        <ul className="px-why">{r.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
        <div className="ef-bkacts">
          {r.alt && (inBasket.has(r.alt.s)
            ? <span className="ef-bknote"><Icon name="info" size={13}/> {r.alt.s} is already in your basket for {e.u}</span>
            : <button type="button" className="px-btn pf-altb" onClick={() => onSwap(e.s, r.alt.s)} data-bkswap={e.s}><AiSpark/> Swap to {r.alt.s}</button>)}
          <button type="button" className="px-btn" onClick={() => onRemove(e.s)} data-bkrm={e.s}><Icon name="x" size={13}/> Remove</button>
        </div>
      </div>
    </article>);
}

// "Make it a SIP": the amount, how often, how long and the split (equal, or your own %)
function SipForm({ rows, onBuilt, onCancel, onOut }) {
  const KEY = "hp_etf_bksip_v1";
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();
  const [amount, setAmount] = useState(saved.amount || 10000), [freq, setFreq] = useState(saved.freq || "month"), [years, setYears] = useState(saved.years || 10);
  const [own, setOwn] = useState(false), [w, setW] = useState(() => Object.fromEntries(rows.map(r => [r.e.s, 0])));
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const even = () => { const n = rows.length, base = Math.floor(100 / n); setW(Object.fromEntries(rows.map((r, i) => [r.e.s, base + (i < 100 - base * n ? 1 : 0)]))); };
  useEffect(even, [rows.map(r => r.e.s).join()]);
  const tot = Object.values(w).reduce((a, v) => a + (+v || 0), 0), word = freq === "quarter" ? "quarter" : "month";
  const problem = !(amount >= 5000) ? `Enter at least ₹5,000 a ${word}.` : amount > 1e7 ? "A SIP can be up to ₹1 crore an instalment." : !(years >= 1 && years <= 40) ? "Plan between 1 and 40 years."
    : own && tot !== 100 ? `The shares add up to ${tot}% — make them 100%.` : own && Object.values(w).some(v => !(v >= 1)) ? "Give every ETF at least 1%." : "";
  const build = () => {
    if (problem) { setErr(problem); return; }
    try { localStorage.setItem(KEY, JSON.stringify({ amount, freq, years })); } catch { /* ignore */ }
    setBusy(true); setErr("");
    api("/app/api/etf/basket/sip", { method: "POST", json: { symbols: rows.map(r => r.e.s), amount, freq, years, weights: own ? Object.fromEntries(rows.map(r => [r.e.s, Math.round(+w[r.e.s] || 0)])) : null } })
      .then(res => { trackAction("etf", "sip"); onBuilt(res); }).catch(e => { if (e.status === 401) onOut(e.message); else setErr(e.message); }).finally(() => setBusy(false));
  };
  const step = (n, l, hint) => <span className="bd-l">{n} · {l}{hint && <Info text={hint}/>}</span>;
  return (
    <section className="card pf-start bd-start sp-start" id="ef-bk-sip">
      <div className="pf-sl">
        <div className="bd-f">
          <label className="bd-l" htmlFor="ef-bk-amt">1 · Amount every {word}</label>
          <div className="sp-amtrow">
            <div className="bd-amt"><span>₹</span><input id="ef-bk-amt" inputMode="numeric" value={amount ? amount.toLocaleString("en-IN") : ""} aria-label="SIP amount in rupees"
              onChange={e => setAmount(Number(e.target.value.replace(/[^\d]/g, "").slice(0, 9)) || 0)}/><em>{amount >= 5000 ? inrShort(amount) : ""}</em></div>
            <div className="sp-seg" role="group" aria-label="How often">{[["month", "Monthly"], ["quarter", "Quarterly"]].map(([k, l]) => (
              <button key={k} type="button" id={`ef-bk-f-${k}`} className={freq === k ? "on" : ""} onClick={() => setFreq(k)}>{l}</button>))}</div></div>
          <div className="bd-chips">{[5000, 10000, 25000, 50000, 100000].map(v => <button key={v} type="button" className={amount === v ? "on" : ""} onClick={() => setAmount(v)}>{v < 100000 ? `₹${v / 1000} K` : inrShort(v)}</button>)}</div>
        </div>
        <div className="bd-f" id="ef-bk-split">{step(2, "How the money is split", "Equal: every ETF gets the same money. Your own: set the % of each ETF (whole numbers, adding up to 100).")}
          <div className="bd-chips bd-cards2">
            <button type="button" id="ef-bk-eq" className={!own ? "on" : ""} onClick={() => setOwn(false)}><b>Equal</b><small>{rows.length ? `${(100 / rows.length).toFixed(rows.length > 3 ? 1 : 0)}% each · about ${inr(amount / rows.length)} a ${word}` : ""}</small></button>
            <button type="button" id="ef-bk-own" className={own ? "on" : ""} onClick={() => setOwn(true)}><b>Your own %</b><small>more money in the ETFs you prefer</small></button></div>
          {own && <div className="ef-bkw" id="ef-bk-weights">
            {rows.map(r => <label key={r.e.s} className="ef-bkwr" data-w={r.e.s}><span><b>{r.e.s}</b><small>{r.e.u}</small></span>
              <input type="range" min="1" max="100" value={w[r.e.s] || 1} onChange={e => setW(o => ({ ...o, [r.e.s]: +e.target.value }))} aria-label={`${r.e.s} share`} className="al-range" style={{ "--c": "var(--acc)", "--v": `${w[r.e.s] || 1}%` }}/>
              <span className="ef-bkwn"><input type="number" min="1" max="100" value={w[r.e.s] ?? ""} onChange={e => setW(o => ({ ...o, [r.e.s]: Math.max(0, Math.min(100, Math.round(+e.target.value || 0))) }))} aria-label={`${r.e.s} %`}/><em>%</em></span>
              <span className="ef-bkwa">{inr(amount * (w[r.e.s] || 0) / 100)}</span></label>)}
            <div className={`ef-bkwt ${tot === 100 ? "ef-wok" : "ef-wno"}`} id="ef-bk-wtot"><Icon name={tot === 100 ? "check" : "alert"} size={13}/> {tot}% of 100%
              <button type="button" className="px-btn sm" onClick={even} id="ef-bk-even">Spread equally</button></div>
          </div>}
        </div>
        <div className="bd-f">{step(3, "How long you plan to invest")}
          <div className="sp-amtrow">
            <div className="bd-amt sp-yrs"><input type="number" min="1" max="40" id="ef-bk-years" value={years} aria-label="Years" onChange={e => setYears(Math.max(0, Math.min(40, Math.round(+e.target.value || 0))))}/><em>years</em></div>
            <div className="bd-chips">{[5, 10, 15, 20, 25].map(y => <button key={y} type="button" className={years === y ? "on" : ""} onClick={() => setYears(y)}>{y} years</button>)}</div></div>
        </div>
        {err && <div className="pf-miss" role="alert" id="ef-bk-sip-err">{err}</div>}
        <div className="ef-bkgo"><button type="button" className="px-btn" onClick={onCancel} id="ef-bk-sip-back">Back to the basket</button>
          <button type="button" className="pf-go sp-build" id="ef-bk-sip-build" onClick={build} disabled={busy}><AiSpark/> {busy ? "Building…" : "Build the SIP"}</button></div>
      </div>
      <aside className="pf-sr">
        <h3>Your basket as a SIP</h3>
        <div className="pf-steps">
          <div className="pf-step"><b>1</b><span><strong>Pick the amount</strong>The same money every {word}, split over your {plural(rows.length, "ETF")}.</span></div>
          <div className="pf-step"><b>2</b><span><strong>Whole units</strong>Each ETF is bought in whole units; a costly one every few instalments.</span></div>
          <div className="pf-step"><b>3</b><span><strong>Save and track</strong>Saved as an ETF SIP: tracking, the momentum check, a monthly reminder and Buy on Zerodha.</span></div>
        </div>
        <div className="ef-bkmini">{rows.map(r => <span key={r.e.s} className={BK_CAT[r.cat][2]}><i/>{r.e.s}</span>)}</div>
      </aside>
    </section>);
}

// Buy on Zerodha, one time: an amount split equally into whole units (the customer can still change each quantity before Kite opens)
function BuyOnce({ rows, onClose }) {
  const [amount, setAmount] = useState(() => { try { return +localStorage.getItem("hp_etf_bkbuy") || 10000; } catch { return 10000; } });
  const each = rows.length ? amount / rows.length : 0;
  const lines = rows.map(r => ({ e: r.e, qty: r.e.p ? Math.floor(each / r.e.p) : 0 }));
  const ok = lines.filter(l => l.qty > 0), spent = ok.reduce((a, l) => a + l.qty * l.e.p, 0);
  useEffect(() => { try { localStorage.setItem("hp_etf_bkbuy", String(amount)); } catch { /* ignore */ } }, [amount]);
  return (
    <section className="px-card ef-bkbuy" id="ef-bk-buy">
      <div className="tk-mh"><div><div className="px-eyebrow"><Icon name="out" size={12}/> Buy on Zerodha · one time</div><h3>Buy the basket once</h3>
        <small>The amount is split equally into whole units at today's price. You check every line before Kite opens, and you confirm on Kite.</small></div>
        <button type="button" className="tk-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
      <div className="ef-bkbrow">
        <div className="bd-amt"><span>₹</span><input id="ef-bk-buy-amt" inputMode="numeric" value={amount ? amount.toLocaleString("en-IN") : ""} aria-label="Amount to invest once"
          onChange={e => setAmount(Number(e.target.value.replace(/[^\d]/g, "").slice(0, 10)) || 0)}/><em>{amount ? inrShort(amount) : ""}</em></div>
        <div className="bd-chips">{[10000, 25000, 50000, 100000, 500000].map(v => <button key={v} type="button" className={amount === v ? "on" : ""} onClick={() => setAmount(v)}>{inrShort(v)}</button>)}</div>
      </div>
      <div className="hp-tw"><table className="hp-t" id="ef-bk-buy-t"><thead><tr><th>ETF</th><th className="num">Price</th><th className="num">Units</th><th className="num">Money</th></tr></thead>
        <tbody>{lines.map(l => <tr key={l.e.s} data-buy={l.e.s} className={l.qty ? "" : "ef-bkoff"}><td><span className="sym">{l.e.s}</span><span className="sub">{l.e.u}</span></td>
          <td className="num">{inr2(l.e.p)}</td><td className="num"><b>{l.qty || "—"}</b>{!l.qty && <span className="sub">one unit costs more than its {inr(each)}</span>}</td>
          <td className="num">{l.qty ? inr(l.qty * l.e.p) : "—"}</td></tr>)}</tbody></table></div>
      <div className="ef-bkbf"><span>{plural(ok.length, "ETF")} · <b>{inr(spent)}</b> of {inr(amount)}{amount - spent >= 1 ? ` · ${inr(amount - spent)} stays with you` : ""}</span>
        {ok.length > 0 && <ZerodhaButton id="ef-bk-zr" label="Review and open Kite" req={{ app: "etf", source: "etf", title: `One-time buy · ${inrShort(spent)} · ${plural(ok.length, "ETF")}`,
          lines: ok.map(l => ({ s: l.e.s, qty: l.qty })) }}/>}</div>
    </section>);
}

export function BasketView({ d, groups, basket, setBasket, status, me, apps = [], onOut, onBack, onOpen, tabs, onSaved, onOpenMine }) {
  const bySym = useMemo(() => Object.fromEntries(d.etfs.map(e => [e.s, e])), [d]);
  const byKey = useMemo(() => new Map(groups.map(g => [g.key, g])), [groups]);
  const inBasket = useMemo(() => new Set(basket), [basket]);
  const rows = useMemo(() => basket.filter(s => bySym[s]).map(s => readEtf(bySym[s], byKey.get(gk(bySym[s])))), [basket, bySym, byKey]);
  const missing = basket.filter(s => !bySym[s]);
  const sum = rows.length ? basketSummary(rows) : null;
  const [stage, setStage] = useState("analyse");                    // analyse · sip (the form) · sipres (the SIP's result page)
  const [sipRes, setSipRes] = useState(null), [buy, setBuy] = useState(false), [saving, setSaving] = useState(false), [saveMsg, setSaveMsg] = useState("");
  const [show, setShow] = useState("all"), [order, setOrder] = useState("bad"), [making, setMaking] = useState(""), [confirmClear, setConfirmClear] = useState(false);
  const z = useContext(ZerodhaCtx), canSip = apps.some(a => a.key === "sip"), canBuy = !!z && z.can("etf");
  const add = s => { if (!inBasket.has(s)) setBasket([...basket, s]); };
  const remove = s => setBasket(basket.filter(x => x !== s));
  const swap = (s, alt) => setBasket(basket.includes(alt) ? basket.filter(x => x !== s) : basket.map(x => x === s ? alt : x));
  const full = basket.length >= 30;

  if (stage === "sipres" && sipRes) return (
    <div className="ef" id="ef-bk-sipres">
      <SipResult res={sipRes} mode="etf" apps={apps} onEdit={() => setStage("sip")} editLabel="Change the SIP" defName={`ETF basket SIP · ${inrShort(sipRes.amount)} a ${sipRes.freq === "quarter" ? "quarter" : "month"}`}
        band={<BrandBand product="ETF Analyser" title="Your basket" accent={`as a SIP · ${inrShort(sipRes.amount)} a ${sipRes.freq === "quarter" ? "quarter" : "month"}`} sub={`${sipRes.count} ETFs`} right={tabs}/>}
        top={<div className="ef-bkback"><button type="button" className="px-btn" onClick={() => setStage("analyse")} id="ef-bk-sip-home"><Icon name="chevron" size={13}/> Back to the basket analysis</button></div>}
        onSaved={onSaved} onOpenMine={onOpenMine}/>
    </div>);

  const band = <BrandBand product="ETF Analyser" title="Your" accent="ETF basket" id="ef-bk-band" right={tabs} sub={`${plural(basket.length, "ETF")}${status ? ` · ${status}` : ""}`}/>;
  if (!rows.length) return (
    <div className="ef pf px" id="ef-bk">
      {band}
      <section className="card pf-start">
        <div className="pf-sl">
          <div className="pf-add"><EtfSearch etfs={d.etfs} added={inBasket} onPick={add}/></div>
          <div className="pf-bempty" id="ef-bk-empty">Your basket is empty. Add ETFs with <b>+</b> in the ETF list, or type a name above.</div>
          <button type="button" className="pf-go" onClick={onBack} id="ef-bk-pick">Pick ETFs from the list</button>
        </div>
        <aside className="pf-sr">
          <h3>How it works</h3>
          <div className="pf-steps">
            <div className="pf-step"><b>1</b><span><strong>Fill the basket</strong>Press + on any ETF in the list — up to 30.</span></div>
            <div className="pf-step"><b>2</b><span><strong>Analyse it</strong>Hyperplane AI reads every ETF, with a better choice of the same market when there is one.</span></div>
            <div className="pf-step"><b>3</b><span><strong>Save, SIP or buy</strong>Save it as a portfolio, make it a monthly SIP, or buy it once on Zerodha.</span></div>
          </div>
        </aside>
      </section>
    </div>);

  if (stage === "sip") return (
    <div className="ef" id="ef-bk-sipform">
      <BrandBand product="ETF Analyser" title="Make your basket" accent="a SIP" right={tabs} sub={`${plural(rows.length, "ETF")} · the AI ETF SIP Builder's plan for your own ETFs`}/>
      <SipForm rows={rows} onOut={onOut} onCancel={() => setStage("analyse")} onBuilt={r => { setSipRes(r); setStage("sipres"); window.scrollTo(0, 0); }}/>
    </div>);

  const listed = rows.filter(r => show === "all" || r.cat === show).sort((a, b) => order === "bad"
    ? BK_ORDER[a.cat] - BK_ORDER[b.cat] || (a.e.st ?? 999) - (b.e.st ?? 999)
    : (a.cat === "new") - (b.cat === "new") || (b.e.st ?? -999) - (a.e.st ?? -999));
  const ranked = rows.filter(r => r.e.st != null).sort((a, b) => b.e.st - a.e.st);
  const better = rows.filter(r => r.alt);
  const facts = [
    ranked.length && ["Strongest", `${ranked[0].e.s} ${signed(ranked[0].e.st)}`, tc(ranked[0].e.st)],
    ranked.length && ["Weakest", `${ranked[ranked.length - 1].e.s} ${signed(ranked[ranked.length - 1].e.st)}`, tc(ranked[ranked.length - 1].e.st)],
    ["Spread", `${plural(sum.markets.size, "market")} · ${plural(Object.keys(sum.types).length, "type")}`, sum.twice.length ? "c-mid" : "c-good",
      `${Object.entries(sum.types).map(([k, v]) => `${k}: ${v}`).join(", ")}.${sum.twice.length ? " Two ETFs follow the same market — they move together." : ""}`],
    ["Best of market", `${sum.bestN} of ${rows.length}`, sum.bestN === rows.length ? "c-good" : "c-mid"],
  ].filter(Boolean);
  const report = () => {
    setMaking("busy");
    loadChunk(() => import("../report.js"))
      .then(mod => mod.downloadReport(reportModel(rows, sum, d, me)))
      .then(() => { setMaking(""); trackAction("etf", "report"); })
      .catch(e => setMaking(`Could not make the report: ${e.message || e}`));
  };
  return (
    <div className="ef pf px" id="ef-bk">
      {band}
      <div className="hp-actbar ef-bkbar">
        <div className="px-search"><EtfSearch etfs={d.etfs} added={inBasket} onPick={add} full={full}/></div>
        <button type="button" className="px-btn" onClick={onBack} id="ef-bk-more"><Icon name="plus" size={14}/> Add from the list</button>
        <button type="button" className="px-btn" id="ef-bk-save" onClick={() => { setSaving(v => !v); setSaveMsg(""); }}><Icon name="star" size={14}/> Save portfolio</button>
        {canSip && <button type="button" className="px-btn" id="ef-bk-mksip" onClick={() => { setStage("sip"); window.scrollTo(0, 0); }}><Icon name="clock" size={14}/> Make it a SIP</button>}
        {canBuy && <button type="button" className={`px-btn zr-btn ${buy ? "on" : ""}`} id="ef-bk-buybtn" aria-expanded={buy} onClick={() => setBuy(v => !v)}><Icon name="out" size={14}/> Buy on Zerodha</button>}
        {/* round 27g (owner: "PDF only, like the Analyser" — Word and Markdown stay in the Planner) */}
        <button type="button" className="px-btn" id="ef-bk-dl" disabled={making === "busy"} title="Download the report as PDF" onClick={report}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>{making === "busy" ? "Preparing…" : "Download PDF"}</button>
      </div>
      {saving && <SaveBar kind="etf" defName={`My ETF portfolio · ${rows.length} ETFs`} inputs={{}} holdings={rows.map(r => ({ kind: "etf", s: r.e.s }))} onCancel={() => setSaving(false)}
        onDone={m => { setSaving(false); setSaveMsg(m); onSaved && onSaved(); }}/>}
      {saveMsg && <SavedNote id="ef-bk-saved" msg={saveMsg} onOpen={onOpenMine} onClose={() => setSaveMsg("")}/>}
      {buy && canBuy && <BuyOnce rows={rows} onClose={() => setBuy(false)}/>}
      {canBuy && canSip && buy && <div className="ef-bknote2" id="ef-bk-buysip"><Icon name="clock" size={14}/><span>Want to buy it every month instead? <button type="button" className="sp-tolink" onClick={() => { setStage("sip"); setBuy(false); }}>Make it a SIP</button> — each instalment then goes to Zerodha the same way, with a reminder.</span></div>}
      <div className="px-privacy"><Icon name="lock" size={14}/><span><b>Private to you.</b> Your basket is visible only to you, the account holder. It is never visible to other users or to the admin, as per SEBI norms.</span></div>
      {making && making !== "busy" && <div className="pf-miss">{making}</div>}
      {missing.length > 0 && <div className="pf-miss">Not in today's data: {missing.join(", ")}. They stay in your basket and come back when they appear.</div>}

      <section className="px-card px-strip" id="ef-bk-strip">
        <div className="px-sg"><TrendGauge v={sum.avg} size={150} caption={false}/></div>
        <div className="px-sm2">
          <div className="px-label">Current strength of the basket <Info text="The average long-term strength of the ETFs that have enough history. Right of 0 means moving up, left of 0 means moving down."/></div>
          <div className="px-sfacts">
            <div className="px-sv"><b className={tc(sum.avg)}>{sum.avg == null ? "No data" : <>{signed(sum.avg)}<small>%</small></>}</b><span className={tc(sum.avg)}>{trendWordOf(sum.avg)}</span></div>
            <dl className="px-facts">{facts.map(([k, v, c, tip]) => <div key={k}><dt>{k}{tip && <Info text={tip}/>}</dt><dd className={c}>{v}</dd></div>)}</dl>
          </div>
        </div>
        <div className="px-smix">
          <div className="px-label">How your {plural(rows.length, "ETF")} are split</div>
          <div className="px-split">{BK_CATS.map(([k, , t]) => sum.counts[k] ? <span key={k} className={t} style={{ flex: sum.counts[k] }} title={`${BK_CAT[k][1]}: ${sum.counts[k]}`}/> : null)}</div>
          <div className="px-splitl">{BK_CATS.map(([k, label, t]) => <div key={k} className={sum.counts[k] ? "" : "zero"}><i className={t}/><span>{label}</span><b className="px-num">{sum.counts[k]}</b></div>)}</div>
        </div>
      </section>

      <section className="px-row2">
        <div className="px-card px-sumc" id="ef-bk-ai">
          <div className="px-label"><AiSpark/> Hyperplane AI summary <Info text="Fixed rules on the ETF Analyser's own readings. No outside AI service is used and it never makes up a number. For information only, not investment advice."/></div>
          <div className="px-headline"><span className={`px-pill ${sum.tone}`}><i/>{{ bad: "Needs attention", mid: "Mixed", good: "Healthy" }[sum.tone]}</span><h2>{sum.title}</h2></div>
          <ul className="px-points">{sum.lines.map(([t, txt], i) => <li key={i} className={`pl-${t}`}>{txt}</li>)}</ul>
        </div>
        <TrendMap rows={rows}/>
      </section>

      <section className={`px-card ef-bkchk ${better.length || sum.twice.length ? "warn" : "clear"}`} id="ef-bk-check">
        <div className="ef-bkchh"><span className="pf-wic">{better.length || sum.twice.length ? <Icon name="alert" size={18}/> : <Icon name="check" size={18}/>}</span>
          <span><b><AiSpark/> Hyperplane AI check</b><small>{better.length ? `${plural(better.length, "ETF has", "ETFs have")} an easier ETF of the same market` : "Every ETF is the recommended ETF of its market"}{sum.twice.length ? ` · ${plural(sum.twice.length, "market")} twice` : ""}</small></span></div>
        {better.length > 0 && <div className="ef-bkchl">{better.map(r => (
          <div key={r.e.s} className="ef-bkchr" data-better={r.e.s}>
            <span className="ef-bkchf"><b className="sym">{r.e.s}</b><small>{r.e.u} · {EASE[r.e.lq] || "—"} to trade</small></span>
            <span className="hp-arrow" aria-hidden="true">→</span>
            <span className="ef-bkchf"><b className="sym"><Icon name="star" size={11}/> {r.alt.s}</b><small>Recommended · {EASE[r.alt.lq] || "—"} to trade{r.alt.st != null ? ` · strength ${plus(r.alt.st)}` : ""}</small></span>
            {inBasket.has(r.alt.s) ? <button type="button" className="px-btn sm" onClick={() => remove(r.e.s)} data-bkdrop={r.e.s}>Keep {r.alt.s} only</button>
              : <button type="button" className="px-btn primary sm" onClick={() => swap(r.e.s, r.alt.s)} data-bkswap2={r.e.s}><Icon name="swap" size={13}/> Swap</button>}
          </div>))}</div>}
        {sum.twice.length > 0 && <div className="ef-bkchl">{sum.twice.map(l => <div key={gk(l[0])} className="ef-bkchr twice" data-twice={l[0].u}>
          <span className="ef-bkchf"><b>{l[0].u}</b><small>{l.map(e => e.s).join(" · ")} follow the same market — they move together</small></span></div>)}</div>}
      </section>

      <section className="px-card px-hold" id="ef-bk-hold">
        <div className="px-ch">
          <div><h3>ETFs in your basket</h3><p>{listed.length} of {rows.length} · every ETF with its strength and the reasons in plain words</p></div>
          <div className="px-tools">
            <div className="px-seg" role="radiogroup" aria-label="Sort"><span className="px-segl">Sort</span>
              {[["bad", "Weakest first"], ["good", "Best first"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={order === k} className={order === k ? "on" : ""} onClick={() => setOrder(k)}>{l}</button>)}</div>
            {confirmClear ? <span className="pf-clr">Empty the basket? <button type="button" onClick={() => { setBasket([]); setConfirmClear(false); }} id="ef-bk-clear-yes">Yes, empty it</button><button type="button" onClick={() => setConfirmClear(false)}>Cancel</button></span>
              : <button type="button" className="pf-clrbtn" onClick={() => setConfirmClear(true)} id="ef-bk-clear">Empty the basket</button>}
          </div>
        </div>
        <div className="px-split px-split2">{BK_CATS.map(([k, , t]) => sum.counts[k] ? <span key={k} className={t} style={{ flex: sum.counts[k] }}/> : null)}</div>
        <div className="px-tabs" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={show === "all"} className={`px-tab all ${show === "all" ? "on" : ""}`} onClick={() => setShow("all")}>
            <span className="px-tl"><i/>All ETFs</span><b className="px-num">{rows.length}</b><small>100% of the basket</small></button>
          {BK_CATS.map(([k, label, t]) => (
            <button key={k} type="button" role="tab" aria-selected={show === k} disabled={!sum.counts[k]} className={`px-tab ${t} ${show === k ? "on" : ""}`} onClick={() => setShow(show === k ? "all" : k)} data-cat={k}>
              <span className="px-tl"><i/>{label}</span><b className="px-num">{sum.counts[k]}</b><small>{Math.round(sum.counts[k] / rows.length * 100)}% of the basket</small></button>))}
        </div>
        {show !== "all" && <p className="px-tdesc"><i className={BK_CAT[show][2]}/>{BK_CAT[show][3]}</p>}
        <div className="px-list">{listed.map(r => <EtfItem key={r.e.s} r={r} inBasket={inBasket} onRemove={remove} onSwap={swap} onOpen={onOpen}/>)}</div>
      </section>
      <div className="sv-foot dim">Data as of {fmtDT(d.as_of)} · Hyperplane AI by QuantFriday · For education only, not investment advice.</div>
    </div>);
}
