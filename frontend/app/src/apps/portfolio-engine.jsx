// AI Portfolio engine (long-term read): shared by the AI Portfolio Analyser and the Research stock card's
// "Long-term AI Investment Summary" — its own chunk, loaded with whichever of the two opens first.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiSpark, DivBar, Info, TF_FULL, TREND_CUT, andJoin, dirTf, dirVal, regimeFull, regimeOf, signed, tc, trendWordOf } from "../core.jsx";
import { addCss } from "../core.jsx";
import { CSS } from "./engine.css.js";

addCss("engine", CSS);


// ─── AI PORTFOLIO ANALYSER — Hyperplane AI by QuantFriday ───────────────────────
// Long-term read (owner, 2026-10-16 v3): the stock's OWN strength only (sector / industry never added) on Quarterly 50 ·
// Yearly 30 · Monthly 20; Weekly and Daily are ignored. `zs` (publish: this month's / quarter's zone vs the zone stored in
// the previous month / quarter) moves a group one step on the quarterly step: Doing well + quarter stepped down → Keep an
// eye on; Keep an eye on + stepped down + strength < 0 → Look at first; Look at first + stepped up → marked "Improving".
// Customer words: plain, no long dashes, compare with past months / quarters / years (never "zone" or "range"), never
// "buy / sell / hold" (owner, 2026-10-17: "people don't know what a range is").
export const LT_TF = [["M", 2, "Monthly", 20], ["Q", 3, "Quarterly", 50], ["Y", 4, "Yearly", 30]];   // card order M · Q · Y
export const PF_MIN_YEARS = 3;                 // fewer years of yearly price history → recently listed, no view
// attention order: red → amber → green → grey
export const PF_CATS = [
  ["review", "Look at first", "bad", "Weak trend or low reliability. These need your attention first."],
  ["watch", "Keep an eye on", "mid", "Mixed signs. Check these from time to time."],
  ["intact", "Doing well", "good", "Strong and steady trend."],
  ["new", "Recently listed", "side", `The quant algorithm needs at least ${PF_MIN_YEARS} years of yearly data. These do not have it yet.`],
];
export const PF_CAT = Object.fromEntries(PF_CATS.map(c => [c[0], c]));
export const PF_ORDER = { review: 0, watch: 1, intact: 2, new: 3 };
export const goingWord = d => d === 1 ? "going up" : d === -1 ? "going down" : d === 0 ? "moving sideways" : "not known";
export function groupLongTerm(data, sec, ind) {        // average of the Quarterly and Yearly rows: strength + direction (reference only)
  const pick = (byTf, match) => ["Q", "Y"].map(tf => ((byTf || {})[tf] || []).find(match)).filter(Boolean);
  const avg = rows => rows.length ? { st: rows.reduce((a, r) => a + r.st, 0) / rows.length, nb: rows.reduce((a, r) => a + r.nb, 0) / rows.length } : null;
  return { sec: avg(pick(data.sectors, r => r.k === sec)), ind: avg(pick(data.industries, r => r.k === ind && r.sec === sec)) };
}
// Zone engine result (publish → zone_engine.py; owner, 2026-10-17): s.zv = [colour 1/0/−1, strength, [M], [Q], [Y]], each
// timeframe [trend 2…−2, price position 2 / 1 / −1 / −2, strength]. All maths stays on the server; this only turns the
// results into plain words for people with no finance background. No zv (collection without Zone_History) → strength rules.
export const ZTREND = { 2: "the trend is going up", 1: "the trend has just turned up", 0: "the trend is flat", [-1]: "the trend has just turned down", [-2]: "the trend is going down" };
export const ZPRICE = { 2: "very strong", 1: "holding up well", [-1]: "weak", [-2]: "very weak" };
export const ZPERIOD = { M: ["month", "months"], Q: ["quarter", "quarters"], Y: ["year", "years"] };
// "going down for the last 3 quarters" — streak = periods in a row the trend moved the same way (sent by the server)
export const streakText = (t, k) => {
  const [one, many] = ZPERIOD[k];
  if (t.sd == null) return ZTREND[t.tr];                        // older published data without the streak
  if (t.sd === 0) return t.sn >= 2 ? `the trend has been flat for the last ${t.sn} ${many}` : `the trend is flat this ${one}`;
  const dir = t.sd > 0 ? "up" : "down";
  return t.sn >= 2 ? `the trend has been going ${dir} for the last ${t.sn} ${many}` : `the trend turned ${dir} this ${one}`;
};
export const zDir = t => t.sd != null ? t.sd : Math.sign(t.tr || 0);   // latest direction: 1 up · 0 flat · −1 down
// regime analyser line for one holding (held = the timeframes the regime holds back: s.rz for the zone view, s.rh else)
// reliability in plain words (v3 stability score, 0–100 from the whole price history; High from 58, Low below 30 or a fall past 70 %)
export const relWhy = s => s.h === "W"
  ? `Reliability is low${s.rs != null ? ` (stability ${s.rs}/100)` : ""}: deep falls or an unsteady price history. That means more risk.`
  : `Reliability is medium${s.rs != null ? ` (stability ${s.rs}/100)` : ""}: its price history is less steady than the best stocks.`;

export function regimeWhy(s, data, held, dir) {
  const r = regimeOf(s, data.rd, true);
  if (!r || !r.w) return null;
  const h = (held || "").split("").filter(k => "MQY".includes(k)).map(k => TF_FULL[k].toLowerCase());
  const views = `the ${andJoin(h)} view${h.length > 1 ? "s" : ""}`;
  // a rising view under a down regime: the story already says "not trusted" unless the stock itself is falling
  const extra = !h.length ? "" : r.w === -1 ? (dir === -1 ? ` The rise on ${views} is not trusted yet.` : "")
    : ` The dip on ${views} is seen as a pause.`;
  return regimeFull(r, dir) + extra;
}
export function analyseZone(s, data) {
  const [fin, strength, ...per] = s.zv;
  const tf = {};
  ["M", "Q", "Y"].forEach((k, i) => { const t = per[i];
    tf[k] = t ? { v: t[2], d: dirVal(t[2]), tr: t[0], pos: t[1], sd: t[3] ?? null, sn: t[4] ?? null, nr: t[5] ?? 0, at: t[6] ?? -1 } : { v: null, d: null, tr: null, pos: null, sd: null, sn: null, nr: 0, at: -1 }; });
  const tooNew = s.yh == null || s.yh < PF_MIN_YEARS;
  let cat = tooNew ? "new" : fin === 1 ? "intact" : fin === -1 ? "review" : "watch";
  if (cat !== "new" && s.h === "W") cat = "review";                 // low reliability: always red (owner, 2026-10-16)
  if (cat === "intact" && s.x) cat = "watch";                       // rose very fast: never "Doing well"
  const { M, Q, Y } = tf;
  const improving = cat === "review" && Q.tr != null && zDir(Q) === 1;
  const why = [];
  if (cat === "new") {
    why.push(s.yh != null ? `It has about ${s.yh} year${s.yh === 1 ? "" : "s"} of price history so far.` : "It has very little price history so far.");
    why.push(`The quant algorithm needs at least ${PF_MIN_YEARS} years of yearly data, so there is no view yet.`);
  } else {
    const rw = regimeWhy(s, data, s.rz, dirVal(strength));
    if (rw) why.push(rw);
    const line = (t, k, name) => { const tr = streakText(t, k), once = tr.endsWith(`this ${ZPERIOD[k][0]}`);
      return `${name}: ${tr}, and the price is ${ZPRICE[t.pos]}${once ? "" : ` this ${ZPERIOD[k][0]}`}.`; };
    // mother candle breakout / breakdown on M / Q / Y, read by WHERE the price sits in that timeframe (zone_engine.py:
    // 12 combinations; at = above · near top · upper half · lower half · near bottom · below). Plain words only.
    const NR_SAY = {
      bo: ["and it is already above its usual {p} price level. A strong sign.", "right at the top of its usual {p} price level. A strong sign.",
        "It still has to clear the top of its usual {p} price level.", "but it is still in the lower part of its usual {p} price level. An early sign.",
        "from near the bottom of its usual {p} price level. Not proven yet.", "but it is still below its usual {p} price level. A weak bounce."],
      bd: ["but it is still above its usual {p} price level. A pullback; it stays strong.", "turning down at the top of its usual {p} price level. A warning sign.",
        "while in the upper part of its usual {p} price level. It is losing strength.", "in the lower part of its usual {p} price level. A weak sign.",
        "near the bottom of its usual {p} price level. Support is giving way.", "and it is below its usual {p} price level. The fall is confirmed."],
    };
    const base = (t, k) => { const n = Math.abs(t.nr), [one, many] = ZPERIOD[k], adj = one === "year" ? "yearly" : `${one}ly`;
      const tail = (NR_SAY[t.nr > 0 ? "bo" : "bd"][t.at] || "").replace("{p}", adj);
      const head = t.nr > 0 ? (t.at >= 4 ? "The price has bounced up" : "The price has broken out") : (t.at === 0 ? "The price has slipped back" : "The price has broken down");
      return `${head} after being held for the last ${n} ${many}, ${tail}`.replace(", It", ". It"); };
    ["Y", "Q", "M"].forEach(k => { if (tf[k].nr) why.push(base(tf[k], k)); });
    why.push(line(Q, "Q", "Quarterly view"));
    why.push(Y.tr != null ? line(Y, "Y", "Yearly view") : "Yearly view: not available yet. It needs 10 years of price data.");
    if (M.tr != null) why.push(line(M, "M", "Monthly view")
      + (zDir(M) === -1 && M.pos <= -1 ? " Keep an eye on it." : zDir(M) === 1 && M.pos >= 1 ? " A good short-term sign." : ""));
    if (fin === 0 && Q.v >= TREND_CUT) why.push("The quarterly view is strong, but the yearly or monthly view holds it back.");
    else if (fin === 0 && strength >= TREND_CUT && Q.v < 0) why.push("The overall strength is good, but the quarterly view is negative, so it is not marked Doing well yet.");
    if (fin === -1 && Q.v > -TREND_CUT) why.push("The yearly and monthly views are weak enough to pull it down.");
    if (s.h === "W") why.push(fin === -1 ? relWhy(s) : `${relWhy(s)} Low reliability always puts a stock in Look at first.`);
    else if (s.h === "M") why.push(relWhy(s));
    if (s.x) why.push(fin === 1 ? "It went up more than 3 times in a year, so it stays in Keep an eye on. Such fast gains often cool off."
                                : "It went up more than 3 times in a year. Such fast gains often cool off.");
  }
  return { s, cat, lt: tooNew ? null : strength, tf, g: groupLongTerm(data, s.sec, s.ind), why, moved: null, improving, qStep: s.zs ? s.zs[1] : null, zone: true, rg: regimeOf(s, data.rd, true) };
}
export function analyseHolding(s, data) {
  if (s.zv) return analyseZone(s, data);
  const tf = {}; let a = 0, w = 0;
  LT_TF.forEach(([k, i, , wt]) => { const v = s.sc[i]; tf[k] = { v, d: v == null ? null : dirTf(s, i) }; if (v != null) { a += wt * v; w += wt; } });
  const lt = w ? Math.round(a / w) : null;
  const qStep = s.zs ? s.zs[1] : null;           // the monthly step (zs[0]) is published but not used here
  const tooNew = s.yh !== undefined ? (s.yh == null || s.yh < PF_MIN_YEARS) : (tf.Y.v == null && tf.Q.v == null);
  const dY = tf.Y.d, dQ = tf.Q.d, dM = tf.M.d;
  let cat, moved = null;
  if (tooNew || lt == null) cat = "new";
  else if (s.h === "W" || lt <= -TREND_CUT || (dY === -1 && dQ === -1)) cat = "review";   // low reliability: always red (owner, 2026-10-16)
  else if (lt >= TREND_CUT && dY !== -1 && dQ !== -1 && s.h !== "W" && !s.x) cat = "intact";
  else cat = "watch";
  if (cat === "intact" && qStep === -1) { cat = "watch"; moved = "watch"; }
  else if (cat === "watch" && qStep === -1 && lt < 0) { cat = "review"; moved = "review"; }
  const improving = cat === "review" && qStep === 1;
  const why = [];
  if (cat === "new") {
    why.push(s.yh != null ? `It has about ${s.yh} year${s.yh === 1 ? "" : "s"} of price history so far.` : "It has very little price history so far.");
    why.push(`The quant algorithm needs at least ${PF_MIN_YEARS} years of yearly data, so there is no view yet.`);
  } else {
    const rw = regimeWhy(s, data, s.rz, dirVal(lt));
    if (rw) why.push(rw);
    if (dQ === 1 && dY === 1) why.push("The quarterly and yearly trends are both going up.");
    else if (dQ === -1 && dY === -1) why.push("The quarterly and yearly trends are both going down.");
    else if (dQ === -1 && dY === 1) why.push("The quarterly trend has turned down, but the yearly trend is still up.");
    else if (dQ === 1 && dY === -1) why.push("The quarterly trend is going up, but the yearly trend is still down.");
    else why.push(dY == null ? `No clear direction yet. Quarterly is ${goingWord(dQ)}, and there is no yearly trend yet.`
                             : `No clear direction yet. Quarterly is ${goingWord(dQ)} and yearly is ${goingWord(dY)}.`);
    if (moved === "watch") why.push("Its strength looks good, but compared with last quarter the trend has weakened. Worth watching.");
    else if (moved === "review") why.push("Its strength is below zero and compared with last quarter the trend has weakened.");
    else if (improving) why.push(lt < 0 ? "It is still weak, but compared with last quarter the trend has improved. An early sign of improvement."
                                        : "Compared with last quarter the trend has improved. An early sign of improvement.");
    else if (qStep === 1) why.push("Compared with last quarter, the trend has improved.");
    else if (qStep === -1) why.push("Compared with last quarter, the trend has weakened.");
    if (!moved && cat === "review" && !(dY === -1 && dQ === -1)) {
      if (lt <= -TREND_CUT) why.push(`Its strength is weak (${signed(lt)}%).`);
      else if (s.h === "W") why.push(lt < 0 ? `Its reliability is low and its strength is below zero (${signed(lt)}%).`
                                            : `Its strength is ${signed(lt)}%, but low reliability always puts a stock in Look at first.`);
    } else if (!moved && cat === "watch" && lt < TREND_CUT) why.push(`Its strength is not high enough yet (${signed(lt)}%). Doing well starts at +${TREND_CUT}%.`);
    if (dM === -1 && dQ === 1) why.push("The monthly trend is dipping. So far this looks like a pause.");
    if (s.h === "W" || s.h === "M") why.push(relWhy(s));
    if (s.x) why.push("It went up more than 3 times in a year. Such fast gains often cool off.");
  }
  return { s, cat, lt, tf, g: groupLongTerm(data, s.sec, s.ind), why, moved, improving, qStep, rg: regimeOf(s, data.rd, true) };
}
export function portfolioSummary(rows) {
  const live = rows.filter(r => r.cat !== "new");
  const by = k => rows.filter(r => r.cat === k);
  const names = (list, n = 3) => list.length > n ? `${list.slice(0, n).map(r => r.s.s).join(", ")} and ${list.length - n} more` : andJoin(list.map(r => r.s.s));
  const cnt = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const avg = live.length ? Math.round(live.reduce((a, r) => a + r.lt, 0) / live.length) : null;
  const intact = by("intact").sort((a, b) => b.lt - a.lt), watch = by("watch"), review = by("review").sort((a, b) => a.lt - b.lt), fresh = by("new");
  const lines = [];
  lines.push(["info", avg == null ? `${cnt(rows.length, "stock", "stocks")} checked.`
    : `${cnt(rows.length, "stock", "stocks")} checked. Taken together, your portfolio is ${dirVal(avg) === 0 ? "moving sideways" : avg > 0 ? "moving up" : "moving down"} (${signed(avg)}%).`]);
  if (review.length) lines.push(["bad", `${cnt(review.length, "stock needs", "stocks need")} your attention first: ${names(review)}.`]);
  if (watch.length) lines.push(["mid", `${cnt(watch.length, "stock is", "stocks are")} worth keeping an eye on: ${names(watch)}.`]);
  if (intact.length) lines.push(["good", `${cnt(intact.length, "stock is", "stocks are")} doing well: ${names(intact)}.`]);
  if (fresh.length) lines.push(["side", `${cnt(fresh.length, "stock is", "stocks are")} recently listed, so there is no view yet: ${names(fresh)}.`]);
  const zoned = live.filter(r => r.zone && r.tf.Q.tr != null);
  if (zoned.length) {
    const rise = zoned.filter(r => zDir(r.tf.Q) === 1).length, fall = zoned.filter(r => zDir(r.tf.Q) === -1).length;
    if (rise || fall) lines.push([rise >= fall ? "good" : "bad", "On the quarterly view, " + andJoin([
      rise ? `${cnt(rise, "stock is", "stocks are")} trending up` : "", fall ? `${cnt(fall, "stock is", "stocks are")} trending down` : ""].filter(Boolean)) + "."]);
  } else {
    const up = live.filter(r => r.qStep === 1), down = live.filter(r => r.qStep === -1);
    if (up.length || down.length) lines.push([up.length >= down.length ? "good" : "bad", "Compared with last quarter, " + andJoin([
      up.length ? `${cnt(up.length, "stock has", "stocks have")} an improving trend` : "",
      down.length ? `${cnt(down.length, "stock has", "stocks have")} a weakening one` : ""].filter(Boolean)) + "."]);
  }
  const rk = k => live.filter(r => r.rg && r.rg.key === k);             // long-term regime of each holding
  const shiftedDn = rk("sdn"), shiftedUp = rk("sup"), downReg = rk("down"), soon = rk("dn-soon"), upSoon = rk("up-soon");
  if (shiftedDn.length) lines.push(["bad", `The long-term regime has changed from up to down for ${names(shiftedDn)}. Their rises are not trusted until it turns up again.`]);
  if (downReg.length) lines.push(["bad", `The long-term regime is down for ${cnt(downReg.length, "stock", "stocks")}: ${names(downReg)}.`]);
  if (soon.length) lines.push(["mid", `The long-term regime has started changing from up to down for ${names(soon)}. A complete change is expected soon, so watch these closely.`]);
  if (upSoon.length) lines.push(["mid", `The long-term regime has started turning up for ${names(upSoon)}, but it is not confirmed yet. Monitor these for a few more weeks.`]);
  if (shiftedUp.length) lines.push(["good", `The long-term regime has changed from down to up for ${names(shiftedUp)}.`]);
  const better = rows.filter(r => r.improving);
  if (better.length) lines.push(["good", `${names(better)} ${better.length === 1 ? "is" : "are"} in Look at first, but the quarterly view is turning up.`]);
  const weak = rows.filter(r => r.s.h === "W");
  if (weak.length) lines.push(["bad", `${names(weak)} fell very sharply in the past, so ${weak.length === 1 ? "it carries" : "they carry"} more risk.`]);
  const hot = rows.filter(r => r.s.x);
  if (hot.length) lines.push(["mid", `${names(hot)} went up more than 3 times in a year. Such fast gains often cool off.`]);
  const secCount = {}; rows.forEach(r => { secCount[r.s.sec] = (secCount[r.s.sec] || 0) + 1; });
  const [topSec, topN] = Object.entries(secCount).sort((a, b) => b[1] - a[1])[0] || [];
  if (rows.length >= 4 && topN / rows.length >= 0.4) lines.push(["mid", `${topN} of your ${rows.length} stocks are in ${topSec}. Too much in one sector adds risk.`]);
  const share = k => rows.length ? by(k).length / rows.length : 0;
  const title = !live.length ? "Your stocks are too new to judge" : share("review") >= 0.3 ? "Many of your stocks need attention"
    : share("intact") >= 0.6 ? "Most of your stocks are doing well" : "Some stocks are doing well, others need watching";
  const tone = !live.length ? "side" : share("review") >= 0.3 ? "bad" : share("intact") >= 0.6 ? "good" : "mid";
  return { avg, title, tone, lines, counts: Object.fromEntries(PF_CATS.map(c => [c[0], by(c[0]).length])) };
}


export const pctTxt = v => v === 0 ? "Sideways" : `${signed(v)}%`;
export const noData = (k, lbl) => <span className="px-na px-nd">No data <Info text={k === "Y" ? "Hyperplane needs 10 years of price data to calculate the yearly trend."
  : `Not enough price data yet to calculate the ${lbl.toLowerCase()} trend.`}/></span>;
// stock strength + Monthly / Quarterly / Yearly tiles with the key-insight chip (AI Portfolio cards and the Research
// stock card's Investment AI summary use the same block)
export function StrengthTiles({ r, label = "Stock strength" }) {
  return <>
    <div className="px-label">{label}</div>
    <div className="px-dbig" title="Trend strength from −100 (strong downtrend) to +100 (strong uptrend), not a price change"><b className={tc(r.lt)}>{signed(r.lt)}</b><span className={tc(r.lt)}>{trendWordOf(r.lt)}</span></div>
    <DivBar v={r.lt} d={dirVal(r.lt)} scale className="px-dbar"/>
    <div className="px-tfs">{LT_TF.map(([k, , lbl]) => { const v = r.tf[k].v;
      return (
        <div key={k} className="px-tf">
          <span className="px-label">{lbl} strength</span>
          {v == null ? noData(k, lbl) : (() => { const x = streakShort(r, k);
            return <><b className={`px-tfv ${tc(v)}`} title={`${trendWordOf(v)} · strength from −100 to +100, not a price change`}>{signed(v)}</b>
              {x && <span className={`px-kin c-${x[1]}`} title={`${lbl}: ${x[2]}`}>{x[0]}</span>}</>; })()}
        </div>); })}</div>
  </>;
}

// Long-term AI Investment Summary (owner, 2026-10-17: "only the summary part") — the AI Portfolio engine's plain-word
// research summary for ONE stock, inside Deep Research's stock card. A different formula from the Research strength.
export function InvestmentSummary({ s, data }) {
  const r = analyseHolding(s, data);
  return (
    <section className="blk inv">
      <div className="px-aih"><AiSpark/><b>Long-term</b><span>AI Investment Summary</span>
        <Info right text="A long-term reading by Hyperplane AI (the same engine as the AI Portfolio Analyser): the monthly, quarterly and yearly trend of this stock and how long each has lasted. It uses a different formula from Deep Research's strength above, which also looks at daily and weekly signals. Information, not advice."/></div>
      <ul className="px-why">{r.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
    </section>
  );
}


// "Portfolio by status" (owner, 2026-10-17: the 4 boxes looked boxy) — one panel: split bar, four status tabs with count
// and share, then the selected status's stocks as clean rows (name · ticker · sector · quarterly trend · strength).
// key insight per period (owner: "I like ▲ Up for 2 quarters — show it in the detail below the 3 boxes")
export const UNIT = { M: ["month", "months"], Q: ["quarter", "quarters"], Y: ["year", "years"] };
export function streakShort(r, k) {
  const t = r.tf[k], [one, many] = UNIT[k];
  if (t.v == null) return null;
  const d = r.zone ? zDir(t) : t.d, n = r.zone ? t.sn : null;
  const full = r.zone ? streakText(t, k) : `the trend is ${d === 1 ? "going up" : d === -1 ? "going down" : "flat"}`;
  if (d === 1) return [n >= 2 ? `Up ${n} ${many}` : "Turned up", "good", full];          // colour shows the direction
  if (d === -1) return [n >= 2 ? `Down ${n} ${many}` : "Turned down", "bad", full];
  return [n >= 2 ? `Flat ${n} ${many}` : `Flat this ${one}`, "side", full];
}

