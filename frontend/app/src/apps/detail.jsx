// Stock detail view (customer admin, permission "<application>:detail") — a lazily loaded module, downloaded only by
// someone whose roles hold a detail permission, the first time they click a stock.
// Owner 2026-11-01 (first ask): "monthly, quarterly and yearly zone range, the status of the mother candle, is any NR
// supporting the trend, has the regime helped, the technical table … draw the zone with the mother candle".
// Owner 2026-11-01 (second ask): "very simple, like a checklist table — is it satisfied … the view should not make me do
// more calculation … an animated picture, not the original chart … colour the zones … the zone and where the candle
// breaks on one picture for every timeframe … very simple words". So: verdict → checklist (✓ / ✗ per timeframe) →
// how the score adds up (already calculated) → one animated zone picture per timeframe (drawn to the zone, not to price
// scale) → technicals with a plain reading. Raw numbers only under "For checking".
// Every number comes from the server (detail.py, the same arithmetic as the strength customers see).
import React, { useEffect, useRef, useState } from "react";
import { addCss, api, fmtDT, levelOf } from "../core.jsx";
import { CSS } from "./detail.css.js";

addCss("detail", CSS);

const TFS3 = [["M", "Monthly", "month"], ["Q", "Quarterly", "quarter"], ["Y", "Yearly", "year"]];
const CUT = 24;
// the server (Python) rounds a half to the even number (60.5 → 60): the cross-checks here do the same
const pyRound = v => { const f = Math.floor(v); return v - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(v); };
const dirWord = v => v == null ? "No view" : v >= CUT ? "Uptrend" : v <= -CUT ? "Downtrend" : "Sideways";
const tone = v => v == null ? "" : v >= CUT ? "up" : v <= -CUT ? "down" : "side";
const n2 = v => v == null ? "—" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-IN") : (+v).toFixed(2).replace(/\.?0+$/, "");
const plus = v => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
const TREND_SAY = { 2: ["Moving up", "ok"], 1: ["Starting to move up", "ok"], 0: ["Flat", "mid"], "-1": ["Starting to move down", "no"], "-2": ["Moving down", "no"] };
const PLACE_SAY = { above: ["Above the zone", "ok"], near_top: ["At the top of the zone", "ok"], upper: ["Upper half", "ok"],
  lower: ["Lower half", "no"], near_bottom: ["At the bottom of the zone", "no"], below: ["Below the zone", "no"] };
const PLACE_SENTENCE = { above: "above", near_top: "at the top of", upper: "in the upper half of", lower: "in the lower half of",
  near_bottom: "at the bottom of", below: "below" };
const MARK = { ok: "✓", no: "✗", mid: "–" };
const BAND_NAMES = ["Above the zone", "Top band", "Upper half", "Lower half", "Bottom band", "Below the zone"];
const afterRegime = (t, held, sq) => t.strength == null ? null : held ? pyRound(t.strength * sq) : t.strength;

const Cell = ({ s, text, sub }) => (
  <td className={`ck ck-${s}`}><span className="ck-m" aria-hidden="true">{MARK[s]}</span><span className="ck-t">{text}{sub && <small>{sub}</small>}</span></td>);

// ─── the checklist: is each condition of a strong stock met, per timeframe ───────────────────────────────────────────
function tfChecks(t, held) {
  const tr = t.trend_code != null ? TREND_SAY[t.trend_code] : ["Not enough history", "mid"];
  const pl = t.place ? PLACE_SAY[t.place] : ["No zone yet", "mid"];
  const mc = !t.nr ? ["No signal", "mid"] : !t.place ? ["Not counted (no zone)", "mid"]
    : t.nr > 0 ? ["Broke out upward", "ok", `mother candle ${Math.abs(t.nr)} candles back`] : ["Broke down", "no", `mother candle ${Math.abs(t.nr)} candles back`];
  const rg = t.strength == null ? ["—", "mid"] : held ? ["Against the regime", "no", "so it counts as sideways"] : ["Agrees", "ok"];
  return { tr, pl, mc, rg };
}

function Checklist({ d, held }) {
  const rows = [
    ["Zone is moving up", "tr", "Each new zone sits higher than the one before"],
    ["Price is in the upper part of the zone", "pl", "Upper half, top band or above the zone"],
    ["Mother candle breaks the right way", "mc", "Breaking out upward helps, breaking down hurts (a small part of the score)"],
    ["Regime agrees with the trend", "rg", "If not, that timeframe counts as sideways"],
  ];
  const per = Object.fromEntries(TFS3.map(([tf]) => [tf, tfChecks(d.tf[tf] || {}, held.includes(tf))]));
  return (
    <div className="dt-tw">
      <table className="dt-ck" id="dt-checklist">
        <thead><tr><th>Check</th>{TFS3.map(([tf, name]) => <th key={tf}>{name}</th>)}</tr></thead>
        <tbody>
          {rows.map(([label, k, hint]) => (
            <tr key={k}><th scope="row">{label}<small>{hint}</small></th>
              {TFS3.map(([tf]) => { const [text, s, sub] = per[tf][k]; return <Cell key={tf} s={s} text={text} sub={sub}/>; })}</tr>))}
          <tr className="ck-res"><th scope="row">Result of this timeframe<small>Share of the final score: {TFS3.map(([tf, n]) => `${n.toLowerCase()} ${d.weights[tf]}%`).join(" · ")}</small></th>
            {TFS3.map(([tf]) => { const v = afterRegime(d.tf[tf] || {}, held.includes(tf), d.squeeze);
              return <td key={tf} className={`ck-v ${tone(v)}`}><b>{dirWord(v)}</b>{v != null && <small>{plus(v)}</small>}</td>; })}</tr>
        </tbody>
      </table>
    </div>);
}

function StockChecks({ d }) {
  const lt = d.regime.long;
  const q = (d.tf.Q || {}).strength;
  const items = [
    ["The regime of the stock is up", !lt ? "mid" : lt[0] === 1 ? "ok" : "no",
      !lt ? "No regime reading" : lt[0] === 1 ? (lt[1] === -1 ? "Up, but it has started to turn down" : "Up") : (lt[1] === 1 ? "Down, but it has started to turn up (not confirmed)" : "Down")],
    ["Long price history is healthy", d.h === "S" ? "ok" : d.h === "W" ? "no" : "mid", { S: "Healthy", M: "Average", W: "Fell sharply or moved erratically in the past" }[d.h] || "Not rated"],
    ["No sudden big run-up", d.x ? "no" : "ok", d.x ? "Up 3 times or more within a year — careful" : "Normal"],
    ["Listed long enough", d.yh == null ? "mid" : d.yh >= 3 ? "ok" : "no", d.yh == null ? "Unknown" : `${d.yh} years of yearly data`],
    ["Quarterly is not weak (needed for green)", q == null ? "mid" : q >= 0 ? "ok" : "no", q == null ? "No quarterly view" : q >= 0 ? "Not negative" : "Negative"],
  ];
  return (
    <div className="dt-tw">
      <table className="dt-ck" id="dt-stockchecks"><tbody>
        {items.map(([label, s, text]) => <tr key={label}><th scope="row">{label}</th><Cell s={s} text={text}/></tr>)}
      </tbody></table>
    </div>);
}

// ─── how the score adds up (already calculated: no sums left to the reader) ─────────────────────────────────────────
function ScoreBuild({ d, held }) {
  const rows = TFS3.map(([tf, name]) => ({ tf, name, v: afterRegime(d.tf[tf] || {}, held.includes(tf), d.squeeze), w: d.weights[tf] }))
    .filter(r => r.v != null);
  const tw = rows.reduce((a, r) => a + r.w, 0);
  const total = tw ? pyRound(rows.reduce((a, r) => a + r.w * r.v, 0) / tw) : null;
  const final = d.final ? d.final[1] : null;
  return (
    <div className="dt-build" id="dt-build">
      {rows.map(r => { const share = r.w * r.v / tw; return (
        <div key={r.tf} className="db-row">
          <span className="db-l">{r.name}<small>{plus(r.v)} × {Math.round(r.w / tw * 100)}%</small></span>
          <span className="db-bar"><i className={share >= 0 ? "pos" : "neg"} style={{ width: `${Math.min(50, Math.abs(share) / 2)}%`, [share >= 0 ? "left" : "right"]: "50%" }}/></span>
          <b className={share >= 0 ? "up" : "down"}>{share >= 0 ? "adds " : "takes away "}{Math.abs(share).toFixed(1)}</b>
        </div>); })}
      <div className="db-total">
        <span>Final score</span><b className={tone(final)}>{plus(final)}</b>
        <span className="dt-mut">{final != null ? `${levelOf(final)} ${dirWord(final).toLowerCase()}` : "No long-term view"}{total != null && total !== final ? ` · ⚠ the parts add up to ${plus(total)}` : ""}</span>
      </div>
    </div>);
}

// ─── one animated picture per timeframe: the zone as coloured bands (drawn to the zone, not to price scale), the
// mother candle with the candles inside it, the candle that broke out, and where the price is now ───────────────────────
function zoneScale(z, vals, H, pad) {
  const T = z.top, B = z.bottom, w = T - B;
  const TN = z.top_near != null && z.top_near < T && z.top_near > B ? z.top_near : T - w * 0.05;
  const BN = z.bottom_near != null && z.bottom_near > B && z.bottom_near < T ? z.bottom_near : B + w * 0.05;
  const hi = Math.max(T + w * 0.3, ...vals), lo = Math.min(B - w * 0.3, ...vals);
  const stops = [[hi, 0], [T, 0.15], [TN, 0.28], [(T + B) / 2, 0.5], [BN, 0.72], [B, 0.85], [lo, 1]];
  return { TN, BN, y: v => {
    v = Math.max(lo, Math.min(hi, v));
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, fa] = stops[i], [b, fb] = stops[i + 1];
      if (v >= b) return pad + (H - 2 * pad) * (fa + (a === b ? 0 : (a - v) / (a - b) * (fb - fa)));
    }
    return H - pad;
  } };
}

function ZonePicture({ t, tf, name, unit, price, held, squeeze }) {
  const z = t.zone;
  const W = 330, H = 250, pad = 10, X0 = 122, X1 = 236, BW = W - 70;
  if (!z || z.top == null || z.bottom == null || !(z.top > z.bottom))
    return <figure className="zp zp-empty" data-tf={tf}><div className="zp-h"><b>{name}</b></div><div className="dt-mut">No {unit}ly zone for this stock yet.</div></figure>;
  const c = t.candles;
  const n = Math.abs(t.nr || 0);
  const other = !n && (t.signals || []).filter(s => s.n && s.n <= 12).sort((a, b) => b.n - a.n)[0];
  const mn = n || (other ? other.n : 0);
  const from = c ? (mn && c[mn] ? mn : Math.min(3, c.length - 1)) : -1;    // mother → now, or the last 4 candles
  const bars = c ? c.slice(0, from + 1).map((b, k) => [k, b]).filter(([, b]) => b).reverse() : [];
  const vals = [price, ...bars.flatMap(([, b]) => [b[1], b[2]])].filter(v => v != null);
  const { y, TN, BN } = zoneScale(z, vals, H, pad);
  const step = bars.length > 1 ? (X1 - X0) / (bars.length - 1) : 0;
  const xOf = i => bars.length > 1 ? X0 + step * i : (X0 + X1) / 2;
  const bw = Math.max(5, Math.min(16, step * 0.55 || 16));
  const mother = mn && c && c[mn] && bars.length && bars[0][0] === mn ? c[mn] : null;
  const yT = y(z.top), yTN = y(TN), yM = y((z.top + z.bottom) / 2), yBN = y(BN), yB = y(z.bottom);
  const bands = [["above", pad, yT], ["top", yT, yTN], ["upper", yTN, yM], ["lower", yM, yBN], ["bottom", yBN, yB], ["below", yB, H - pad]];
  const hereBand = { above: "above", near_top: "top", upper: "upper", lower: "lower", near_bottom: "bottom", below: "below" }[t.place];
  const words = [];
  if (t.place) words.push(`The price is ${PLACE_SENTENCE[t.place]} the ${unit}ly zone.`);
  if (t.trend_code != null) words.push(`The zone is ${TREND_SAY[t.trend_code][0].toLowerCase()}${t.streak && t.streak[1] > 1 && t.streak[0] ? ` (${t.streak[1]} ${unit}s in a row)` : ""}.`);
  if (n) words.push(t.nr > 0 ? `This ${unit} broke out upward from the mother candle of ${n} ${unit}s ago.` : `This ${unit} broke down from the mother candle of ${n} ${unit}s ago.`);
  else if (other) words.push(`The mother candle of ${other.n} ${unit}s ago has not broken yet (${String(other.type).toLowerCase()}).`);
  else words.push("No mother candle signal.");
  if (held) words.push("It goes against the regime, so it counts as sideways.");
  const v = afterRegime(t, held, squeeze);
  const priceY = price != null ? y(price) : null;
  const tEnd = 450 + bars.length * 70;
  return (
    <figure className="zp" data-tf={tf}>
      <div className="zp-h"><b>{name}</b><span className={`dt-chip ${tone(v)}`}>{dirWord(v)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${name}: ${words.join(" ")}`}>
        {bands.map(([k, a, b], i) => (
          <g key={k} className={`zb zb-${k} ${hereBand === k ? "here" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
            <rect x="0" y={a} width={BW} height={Math.max(0, b - a)}/>
            {b - a > 13 && <text x="8" y={(a + b) / 2 + 4}>{BAND_NAMES[i]}</text>}
          </g>))}
        <line x1="0" x2={BW} y1={yM} y2={yM} className="zp-mid"/>
        <text x={W - 4} y={yT + 4} textAnchor="end" className="zp-px">top {n2(z.top)}</text>
        <text x={W - 4} y={yB + 4} textAnchor="end" className="zp-px">bottom {n2(z.bottom)}</text>
        {mother && (
          <rect className={`zp-mbox ${n ? "" : "soft"}`} x={xOf(0) - bw} y={y(mother[1])} width={xOf(bars.length - 1) - xOf(0) + 2 * bw}
            height={Math.max(2, y(mother[2]) - y(mother[1]))} style={{ animationDelay: "380ms" }}/>)}
        {bars.map(([k, b], i) => {
          const kind = mother && k === mn ? "mother" : k === 0 ? (b[3] >= b[0] ? "now up" : "now down") : mother ? "child" : "past";
          return (
            <g key={k} className={`zc ${kind}`} style={{ animationDelay: `${450 + i * 70}ms` }}>
              <line x1={xOf(i)} x2={xOf(i)} y1={y(b[1])} y2={y(b[2])}/>
              <rect x={xOf(i) - bw / 2} width={bw} y={y(Math.max(b[0], b[3]))} height={Math.max(2, Math.abs(y(b[0]) - y(b[3])))} rx="2"/>
            </g>); })}
        {n > 0 && bars.length > 0 && (() => { const b = bars[bars.length - 1][1]; const up = t.nr > 0; return (
          <text className={`zp-arrow ${up ? "up" : "down"}`} x={xOf(bars.length - 1)} y={up ? y(b[1]) - 7 : y(b[2]) + 17} textAnchor="middle"
            style={{ animationDelay: `${tEnd + 150}ms` }}>{up ? "▲" : "▼"}</text>); })()}
        {mother && <text className="zp-mlabel" x={xOf(0) - bw} y={Math.max(11, y(mother[1]) - 5)} style={{ animationDelay: "380ms" }}>Mother candle</text>}
        {priceY != null && (
          <g className="zp-now" style={{ "--from": `${yM - priceY}px`, animationDelay: `${tEnd + 250}ms` }}>
            <line x1="0" x2={BW} y1={priceY} y2={priceY}/>
            <circle cx={BW - 6} cy={priceY} r="5"/>
            <rect x={BW + 4} y={priceY - 9} width={W - BW - 6} height="18" rx="5"/>
            <text x={(BW + W) / 2 + 1} y={priceY + 4} textAnchor="middle">{n2(price)}</text>
          </g>)}
      </svg>
      {!c && <div className="dt-note">Candles are drawn from the next collection onwards — this day shows the zone and the price only.</div>}
      <Steps hist={t.history} unit={unit}/>
      <figcaption>{words.join(" ")}</figcaption>
    </figure>);
}

// the last 5 zones side by side (oldest → now): rising or falling at a glance
function Steps({ hist, unit }) {
  const h = (hist || []).map((z, k) => [k, z]).filter(([, z]) => z && z[0] != null && z[1] != null).reverse();
  if (h.length < 2) return null;
  const lo = Math.min(...h.map(([, z]) => z[0])), hi = Math.max(...h.map(([, z]) => z[1]));
  const W = 150, H = 40, y = v => 3 + (H - 6) * (1 - (v - lo) / (hi - lo || 1));
  return (
    <div className="zp-steps"><span className="dt-mut">Last {h.length} {unit}ly zones, oldest → newest</span>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {h.map(([k, z], i) => <rect key={k} className={k === 0 ? "now" : ""} x={4 + i * (W - 8) / h.length} width={(W - 8) / h.length - 4} y={y(z[1])} height={Math.max(2, y(z[0]) - y(z[1]))} rx="2"
          style={{ animationDelay: `${200 + i * 90}ms` }}/>)}
      </svg>
    </div>);
}

// ─── technicals with a plain reading ────────────────────────────────────────────────────────────────────────────────
const TECH = [
  ["RSI", "Momentum (RSI)", v => v >= 60 ? ["Strong", "ok"] : v <= 40 ? ["Weak", "no"] : ["Neutral", "mid"]],
  ["ADX", "Trend strength (ADX)", v => v >= 25 ? ["Trending", "ok"] : ["No clear trend", "mid"]],
  ["MACD", "MACD", v => v > 0 ? ["Positive", "ok"] : ["Negative", "no"]],
  ["CCI", "CCI", v => v >= 100 ? ["Strong", "ok"] : v <= -100 ? ["Weak", "no"] : ["Neutral", "mid"]],
  ["BB", "Bollinger bands", (v, t, p) => t.BB_Upper != null && p > t.BB_Upper ? ["Above the upper band", "mid"] : t.BB_Lower != null && p < t.BB_Lower ? ["Below the lower band", "no"] : ["Inside the bands", "ok"]],
  ["ST", null, (v, t, p) => p > v ? ["Price above it", "ok"] : ["Price below it", "no"]],
  ["ATR", "Average move (ATR)", v => [n2(v), "mid"]],
];
function Technicals({ d, lineName }) {
  if (!d.tech) return <div className="dt-empty">No technical data in this collection.</div>;
  const cols = [["D", "Daily"], ["W", "Weekly"], ["M", "Monthly"], ["Q", "Quarterly"], ["Y", "Yearly"]];
  return (
    <div className="dt-tw"><table className="dt-ck dt-tech" id="dt-tech">
      <thead><tr><th>Indicator</th>{cols.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
      <tbody>{TECH.map(([k, label, read]) => (
        <tr key={k}><th scope="row">{label || `Regime line (${lineName})`}</th>
          {cols.map(([tf]) => { const t = d.tech[tf] || {}; const v = k === "BB" ? (t.BB_Upper ?? t.BB_Lower) : t[k];
            if (v == null) return <td key={tf} className="ck ck-mid"><span className="ck-t dt-mut">—</span></td>;
            const [text, s] = read(v, t, d.p);
            return <Cell key={tf} s={s} text={text} sub={k === "BB" || k === "ATR" ? null : n2(v)}/>; })}</tr>))}
      </tbody></table></div>);
}

// ─── the raw numbers, closed by default (for checking the arithmetic) ─────────────────────────────────────────────
function Numbers({ d, meta, held }) {
  const f2 = v => v == null ? "—" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
  return (
    <details className="dt-raw" id="dt-raw"><summary>For checking: the numbers behind the checklist</summary>
      <div className="dt-tw"><table className="dt-t" id="dt-breakdown">
        <thead><tr><th>Timeframe</th><th>Zone trend</th><th>Price place</th><th>Zone points</th><th>Mother candle</th><th>Strength</th><th>After regime</th><th>Weight</th></tr></thead>
        <tbody>{TFS3.map(([tf, name]) => { const t = d.tf[tf] || {}; return (
          <tr key={tf}><td><b>{name}</b></td><td>{f2(t.T)}</td><td>{f2(t.P)}</td><td>{f2(t.zone_points)}</td>
            <td>{!t.nr ? "—" : `${Math.abs(t.nr)} candles ${t.nr > 0 ? "up" : "down"} ${t.nr_points == null ? "(no zone)" : f2(t.nr_points)}`}</td>
            <td>{plus(t.strength)}</td><td>{t.strength == null ? "—" : held.includes(tf) ? plus(pyRound(t.strength * meta.squeeze)) : "same"}</td><td>{meta.tf_weight[tf]}</td></tr>); })}</tbody></table></div>
      <p className="dt-mut">Timeframe strength = 100 × ({meta.trend_w} × zone trend + {meta.pos_w} × price place) + mother candle points; against the regime × {meta.squeeze}. The zone trend weighs the last 4 zone moves {meta.recency.map(r => `${Math.round(r * 100)}%`).join(" / ")}.</p>
      <div className="dt-tw"><table className="dt-t" id="dt-dw"><thead><tr><th></th><th>Bottom</th><th>Bottom band ends</th><th>Top band starts</th><th>Top</th></tr></thead>
        <tbody>{[["D", "Daily"], ["W", "Weekly"], ["M", "Monthly"], ["Q", "Quarterly"], ["Y", "Yearly"]].map(([k, l]) => { const z = (d.tf[k] || {}).zone; return (
          <tr key={k}><td><b>{l}</b></td><td>{n2(z && z.bottom)}</td><td>{n2(z && z.bottom_near)}</td><td>{n2(z && z.top_near)}</td><td>{n2(z && z.top)}</td></tr>); })}</tbody></table></div>
    </details>);
}

// a record the view does not expect must never take the whole app down: show a message inside the panel instead
class Guard extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.k !== this.props.k && this.state.err) this.setState({ err: null }); }
  render() { return this.state.err ? <div className="dt-empty" role="alert">This stock's detail could not be drawn ({String(this.state.err.message || this.state.err)}).</div> : this.props.children; }
}

function Verdict({ d, held }) {
  const final = d.final ? d.final[1] : null;
  const good = [], bad = [];
  const names = list => list.map(([, n]) => n.toLowerCase()).join(", ");
  const up = TFS3.filter(([tf]) => (d.tf[tf] || {}).trend_code >= 1), down = TFS3.filter(([tf]) => (d.tf[tf] || {}).trend_code <= -1);
  if (up.length) good.push(`zone moving up (${names(up)})`);
  if (down.length) bad.push(`zone moving down (${names(down)})`);
  const hiP = TFS3.filter(([tf]) => ["above", "near_top", "upper"].includes((d.tf[tf] || {}).place));
  const loP = TFS3.filter(([tf]) => ["lower", "near_bottom", "below"].includes((d.tf[tf] || {}).place));
  if (hiP.length) good.push(`price in the upper part (${names(hiP)})`);
  if (loP.length) bad.push(`price in the lower part (${names(loP)})`);
  TFS3.forEach(([tf, n]) => { const t = d.tf[tf] || {}; if (t.nr && t.place) (t.nr > 0 ? good : bad).push(`${n.toLowerCase()} mother candle ${t.nr > 0 ? "broke out upward" : "broke down"}`); });
  if (held) bad.push(`against the regime (${held.split("").map(k => ({ M: "monthly", Q: "quarterly", Y: "yearly" })[k]).join(", ")})`);
  return (
    <div className={`dt-verdict ${tone(final)}`} id="dt-verdict">
      <div className="dv-score"><span>{plus(final)}</span><small>score, −100 to +100</small></div>
      <div>
        <div className="dv-w">{final == null ? "No long-term view for this stock" : `${levelOf(final)} ${dirWord(final).toLowerCase()}`}</div>
        {good.length > 0 && <div className="dv-l ok">✓ Helping: {good.join(" · ")}</div>}
        {bad.length > 0 && <div className="dv-l no">✗ Holding it back: {bad.join(" · ")}</div>}
      </div>
    </div>);
}

export default function StockDetail({ req, onClose, onOut }) {
  const [res, setRes] = useState(null); const [err, setErr] = useState("");
  const [play, setPlay] = useState(0);
  const panel = useRef(null);
  useEffect(() => {
    setRes(null); setErr("");
    const q = new URLSearchParams({ app_key: req.app, ...(req.day ? { date: req.day.date, part: req.day.part } : {}) });
    api(`/app/api/detail/${encodeURIComponent(req.sym)}?${q}`).then(setRes).catch(e => { if (e.status === 401) onOut(e.message); else setErr(e.message); });
  }, [req.n]);
  useEffect(() => {
    const k = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); document.body.classList.add("dt-lock");
    panel.current && panel.current.focus();
    return () => { window.removeEventListener("keydown", k); document.body.classList.remove("dt-lock"); };
  }, []);
  const meta = res && res.meta;
  const d = res && { ...res.stock, weights: meta.tf_weight, squeeze: meta.squeeze };
  const held = d ? d.regime.long_held || "" : "";
  return (
    <div className="dt-overlay" onClick={onClose}>
      <aside className="dt-panel" role="dialog" aria-label={`Detail view of ${req.sym}`} onClick={e => e.stopPropagation()} ref={panel} tabIndex={-1} id="stock-detail">
        <header className="dt-head">
          <div style={{ minWidth: 0 }}>
            <div className="dt-badge">🔒 Owner only · detail view</div>
            <h2>{d ? d.n : req.sym} <span className="dt-sym">{req.sym}</span></h2>
            {d && <div className="dt-mut">{d.sec} · {d.ind}{d.cap ? ` · ${d.cap} cap` : ""} · price {n2(d.p)}{d.c != null ? ` (${d.c >= 0 ? "+" : "−"}${Math.abs(d.c).toFixed(2)}% today)` : ""} · data as of {fmtDT(meta.as_of)}{req.day ? ` (${req.day.part === "open" ? "day open" : "day end"})` : ""}</div>}
          </div>
          <button type="button" className="dt-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {err && <div className="dt-empty" role="alert">{err}</div>}
        {!res && !err && <div className="dt-empty">Loading the detail…</div>}
        {d && <Guard k={req.n}>
          <div className="dt-body">
            <Verdict d={d} held={held}/>
            <h4 className="dt-h">Checklist — is each condition met?</h4>
            <Checklist d={d} held={held}/>
            <h4 className="dt-h">About the stock</h4>
            <StockChecks d={d}/>
            <h4 className="dt-h">How the final score adds up</h4>
            <ScoreBuild d={d} held={held}/>
            <div className="dt-hrow"><h4 className="dt-h">Where the price is in each zone</h4>
              <button type="button" className="dt-replay" onClick={() => setPlay(p => p + 1)} id="dt-replay">↻ Play again</button></div>
            <div className="zp-grid" id="dt-pictures" key={`${req.n}-${play}`}>
              {TFS3.map(([tf, name, unit]) => <ZonePicture key={tf} t={d.tf[tf] || {}} tf={tf} name={name} unit={unit} price={d.p} held={held.includes(tf)} squeeze={d.squeeze}/>)}
            </div>
            <div className="zp-legend">
              <span><i className="lg l-above"/>Above the zone</span><span><i className="lg l-top"/>Top band</span><span><i className="lg l-in"/>Inside the zone</span>
              <span><i className="lg l-bottom"/>Bottom band</span><span><i className="lg l-below"/>Below the zone</span>
              <span><i className="lg l-mother"/>Mother candle</span><span><i className="lg l-child"/>Candles inside it</span><span><i className="lg l-now"/>Latest candle</span><span><i className="lg l-price"/>Price now</span>
            </div>
            <p className="dt-mut zp-note">The pictures are drawn to the zone, not to price scale, so the bands are easy to see.</p>
            <h4 className="dt-h">Technicals</h4>
            <Technicals d={d} lineName={meta.line_name || "regime line"}/>
            <Numbers d={d} meta={meta} held={held}/>
            <p className="dt-foot">Only roles with the owner-level “Stock detail view” permission can open this page. Every look is written to the activity log.</p>
          </div>
        </Guard>}
      </aside>
    </div>);
}
