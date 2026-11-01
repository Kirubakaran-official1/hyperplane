// Research view (Control Tower) — a lazily loaded application module (micro-frontend): its code and styles load
// only when the customer opens it.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addCss, trackAction } from "../core.jsx";
import { BG, BG_NAME, CAT, CopyBtns, DISCLAIMER, Info, MODES, Meter, ModeWeights, MultiSelect, OverallMeter, RG_FILTER, RG_INFO, RegimeBox, RegimeTag, SIZES, Seg, StrengthBar, StrengthTag, TFS, TF_NAME, categoryOf, colorOf, combinedView, dirKey, dirTf, dirVal, fmtDT, focusDir, focusOf, groupState, groupWord, isBi, levelOf, pct, regimeMatch, regimeOf, sizeOf, strengthCls, strengthLabel, summaryOf, weightPct } from "../core.jsx";
import { InvestmentSummary } from "./portfolio-engine.jsx";
import { CSS } from "./research.css.js";

addCss("research", CSS);

// "AI insights" on the stock card: three short lines (good · watch out · focus) written by rules from the published
// numbers of the stock, its industry and its sector. Information, never a buy / sell call.
function insightsOf(s, od, bi, sec, ind, view, indRank, indCount, rg = null) {
  const names = ["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"];
  const sc = s.sc || [];
  const ups = names.filter((_, i) => dirTf(s, i) === 1), dns = names.filter((_, i) => dirTf(s, i) === -1);
  const good = [], bad = [];
  // regime analyser first: it decides which trends count at all
  if (rg && (rg.key === "up" || rg.key === "sup")) good.push(rg.key === "sup" ? "regime has changed from down to up" : "current regime is up");
  if (rg && rg.key === "sdn") bad.push(`regime has changed from up to down${rg.held.length ? `, so the rise on ${rg.held.join(", ")} is not trusted yet` : ""}`);
  else if (rg && rg.key === "down") bad.push(`current regime is down${rg.held.length ? `, so the rise on ${rg.held.join(", ")} is not trusted yet` : ""}`);
  else if (rg && rg.key === "up-soon") bad.push("regime is down; the turn to up is not confirmed yet");
  else if (rg && rg.key === "dn-soon") bad.push("regime has started changing from up to down");
  if (s.h === "S") good.push("strong reliability");
  if (groupState(ind) === "up") good.push(`industry ranks #${ind.rank} of ${ind.of}`);
  if (groupState(sec) === "up") good.push(`sector ranks #${sec.rank} of ${sec.of}`);
  if (indRank && indRank <= 3 && indCount > 3) good.push(`#${indRank} of ${indCount} in its industry`);
  if (s.x) bad.push("ran up 3× or more in about a year — stretched");
  if (s.h === "W") bad.push("weak reliability (past crash or wild moves)");
  else if (s.h === "M") bad.push("only moderate reliability");
  if (od === -1) bad.push(`in a downtrend${dns.length ? ` on ${dns.join(", ")}` : ""}`);
  else if (bi && dns.length) bad.push(`timeframes disagree — down on ${dns.join(", ")}`);
  const wk = [["sector", s.sec, sec], ["industry", s.ind, ind]].filter(([, , g]) => g && groupState(g) !== "up");
  wk.forEach(([k, n, g]) => bad.push(`${k} ${n} is ${groupWord(g)} (#${g.rank} of ${g.of})`));
  if (od === 1 && sc[0] != null && sc[1] != null && dirTf(s, 1) === 1 && Math.abs(sc[0]) < Math.abs(sc[1]) - 30)
    bad.push(`short term cooling — Daily ${Math.abs(sc[0])}% vs Weekly ${Math.abs(sc[1])}%`);
  const weakGroup = wk.find(([, , g]) => groupState(g) === "down") || wk[0];
  const tone = view ? view.tone : "mid";
  const focus = rg && rg.key === "up-soon" ? "The regime may be turning up, but it is not confirmed. Monitor it for a few more days before acting."
    : rg && rg.w === -1 && od !== -1 ? "The current regime is down, so any rise is not trusted yet. Wait for the regime to turn up before acting."
    : rg && rg.key === "dn-soon" && od !== -1 ? "The regime has started changing from up to down. Protect your gains and avoid fresh buying for now."
    : s.x && od === 1 ? "Don't chase. Wait for it to cool down or build a base — the Daily strength turning up again is the first sign."
    : tone === "good" ? "Plan your entry and stop-loss on the chart; the Daily trend is the one to watch for timing."
    : tone === "warn" ? `Watch ${weakGroup ? `the ${weakGroup[1]} ${weakGroup[0]}` : "its group"} — the idea improves only when it turns strong. Until then, wait.`
    : tone === "watch" && od === 1 ? "Keep it on your watch list and act when the stock's own trend turns strong on your timeframe."
    : tone === "watch" ? "A laggard in a strong group — wait for its Weekly and Daily trend to turn up before acting."
    : tone === "bad" ? "Avoid for buying — look at stronger stocks in stronger groups (see the top 5 in its industry below)."
    : od === 0 ? "No edge yet — skip it until a clear trend appears."
    : `Prefer it only when its ${weakGroup ? weakGroup[0] : "group"} turns strong; compare it with the top 5 in its industry below.`;
  return { good: good.slice(0, 3), bad: bad.slice(0, 3), focus };
}


// ─── bubble chart (Control Tower style) ──────────────────────────────────────
function resolveCollisions(nodes, iterations = 60, gap = 2) {
  const out = nodes.map(n => ({ ...n, ox:n.x, oy:n.y }));
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + gap;
      if (d < min) { const p = (min - d) / 2, ux = dx / d, uy = dy / d; a.x -= ux * p; a.y -= uy * p; b.x += ux * p; b.y += uy * p; moved = true; }
    }
    out.forEach(n => { n.x += (n.ox - n.x) * 0.02; n.y += (n.oy - n.y) * 0.02; });
    if (!moved) break;
  }
  return out;
}

function QuadrantChart({ items, selected, onSelect, height = 360 }) {
  const [hover, setHover] = useState(null);
  const w = 680, h = height, pad = { l:48, r:20, t:18, b:42 };
  if (!items.length) return <div className="empty">No data for this view.</div>;
  const xs = items.map(i => i.x), xMin = Math.min(...xs, 0) - 4, xMax = Math.max(...xs, 0) + 4;
  const X = v => pad.l + (v - xMin) / ((xMax - xMin) || 1) * (w - pad.l - pad.r), Y = v => h - pad.b - v / 100 * (h - pad.t - pad.b);
  const maxS = Math.max(1, ...items.map(i => i.size)), R = v => 7 + Math.sqrt(Math.max(v, 0) / maxS) * 22;
  // `id` must be unique per bubble (industry names like "Miscellaneous" repeat across sectors); `key` is what gets selected
  const nodes = resolveCollisions(items.map(i => ({ ...i, id:i.id || i.key, r:R(i.size), x:X(i.x), y:Y(i.y) }))).sort((a, b) => a.id === hover ? 1 : b.id === hover ? -1 : b.r - a.r);
  const q = [["STRONG + UPTREND","#00c896"],["STRONG + DOWNTREND","#ffaa00"],["WEAK + UPTREND","#a259ff"],["WEAK + DOWNTREND","#ff4454"]];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="qchart">
      {[0,20,40,60,80,100].map(v => <g key={v}><line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} className="gridl"/><text x={pad.l - 8} y={Y(v) + 3} textAnchor="end" className="tick-t">{v}</text></g>)}
      <line x1={X(0)} x2={X(0)} y1={pad.t} y2={h - pad.b} className="zero"/>
      <text x={w / 2} y={h - 8} textAnchor="middle" className="ax-t">TREND  (downtrend ← 0 → uptrend)</text>
      {selected.length > 0 && <text x={w - pad.r} y={h - 8} textAnchor="end" className="ax-t sel-t">{selected.length} selected · click again to clear</text>}
      <text x={13} y={h / 2} textAnchor="middle" className="ax-t" transform={`rotate(-90 13 ${h / 2})`}>STRENGTH SCORE</text>
      <text x={w - pad.r} y={pad.t + 12} textAnchor="end" className="q-t" fill={q[0][1]}>{q[0][0]}</text>
      <text x={pad.l + 4} y={pad.t + 12} className="q-t" fill={q[1][1]}>{q[1][0]}</text>
      <text x={w - pad.r} y={h - pad.b - 6} textAnchor="end" className="q-t" fill={q[2][1]}>{q[2][0]}</text>
      <text x={pad.l + 4} y={h - pad.b - 6} className="q-t" fill={q[3][1]}>{q[3][0]}</text>
      {nodes.map(n => {
        const on = selected.includes(n.key), dim = selected.length > 0 && !on, r = hover === n.id ? n.r + 3 : n.r;
        return (
          <g key={n.id} onClick={() => onSelect && onSelect(n.key)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(k => k === n.id ? null : k)} style={{ cursor:"pointer", opacity: dim && hover !== n.id ? .28 : 1 }}>
            {on && <circle cx={n.x} cy={n.y} r={r + 5} fill="none" stroke={n.color} strokeOpacity=".45" strokeWidth="1" strokeDasharray="3 3"/>}
            <circle cx={n.x} cy={n.y} r={r} fill={n.color} fillOpacity={on ? .6 : .22} stroke={n.color} style={on ? { stroke:"var(--sel-t)" } : undefined} strokeWidth={on ? 2 : 1.4}/>
            <text x={n.x} y={n.y + 3.5} textAnchor="middle" className="b-t" fill={n.color} style={on ? { fill:"var(--sel-t)" } : undefined}>{n.label.length > 12 ? n.label.slice(0, 11) + "…" : n.label}</text>
            <title>{n.tip}</title>
          </g>
        );
      })}
    </svg>
  );
}

const ViewToggle = ({ v, set }) => <div className="seg">{[["bubble","◉ Bubble"],["list","☰ List"]].map(([k, l]) => <button key={k} className={v === k ? "on" : ""} onClick={() => set(k)}>{l}</button>)}</div>;

function SectorPanel({ rows, tfLabel, selected, onPick }) {
  const [view, setView] = useState("bubble");
  const top = rows.slice(0, 10), max = Math.max(1, ...top.map(r => r.st));
  return (
    <div className="card panel">
      <div className="panel-h"><div><div className="panel-t">🏭 Sector Strength Leaderboard <Info text="Each bubble is a sector. Right = more of it is in an uptrend, left = more of it is in a downtrend, up = stronger (0–100), bigger = more activity. Click a sector to filter the industries and the master data; click it again to clear."/></div><div className="sub">{tfLabel} · bubble size = activity · click to filter</div></div><ViewToggle v={view} set={setView}/></div>
      {view === "bubble"
        ? <QuadrantChart selected={selected} onSelect={onPick} items={rows.map(r => ({ key:r.k, label:r.k, x:r.nb, y:r.st, size:r.sig || r.n, color:colorOf(r.k),
            tip:`${r.k}: strength ${r.st} (${strengthLabel(r.st)}) · net bias ${r.nb > 0 ? "+" : ""}${r.nb} · ${r.n} stocks · ${r.adv} up / ${r.dec} down · avg ${r.avg >= 0 ? "+" : ""}${r.avg}%` }))}/>
        : <div className="lb">{top.map((r, i) => (
            <button key={r.k} className={`lb-row ${selected.includes(r.k) ? "on" : ""}`} onClick={() => onPick(r.k)}>
              <span className="lb-i">{i + 1}</span>
              <div className="lb-mid"><div className="lb-top"><b>{r.k}</b><span className={`nb ${r.nb >= 0 ? "up" : "down"}`}>{r.nb > 0 ? "+" : ""}{r.nb}</span><span className={`badge ${strengthCls(r.st)}`}>{strengthLabel(r.st)}</span></div>
                <div className="bar"><div style={{ width:`${r.st / max * 100}%`, background:colorOf(r.k) }}/></div></div>
              <span className="lb-s" style={{ color:colorOf(r.k) }}>{r.st}</span>
            </button>))}</div>}
    </div>
  );
}

function IndustryPanel({ rows, tfLabel, sectors, selected, onPick }) {
  const [view, setView] = useState("bubble"); const [side, setSide] = useState("up");
  const inSec = sectors.length ? rows.filter(r => sectors.includes(r.sec)) : rows;
  const byNet = [...inSec].sort((a, b) => b.nb - a.nb), list = side === "up" ? byNet.slice(0, 10) : [...byNet].reverse().slice(0, 10);
  const maxAbs = Math.max(1, ...list.map(r => Math.abs(r.nb)));
  const bubbles = [...inSec].sort((a, b) => (b.sig || b.n) - (a.sig || a.n)).slice(0, 40);
  return (
    <div className="card panel">
      <div className="panel-h"><div><div className="panel-t">📐 Industry Bias Momentum <Info right text="Each bubble is an industry, coloured by its sector. Same axes as the sector chart. Picking a sector shows only its industries. Click an industry to filter the master data."/></div><div className="sub">{tfLabel}{sectors.length ? ` · in ${sectors.length === 1 ? sectors[0] : `${sectors.length} sectors`}` : " · busiest 40"} · click to filter</div></div>
        <div className="row-gap">{view === "list" && <div className="seg"><button className={side === "up" ? "on up" : ""} onClick={() => setSide("up")}>▲ Uptrend</button><button className={side === "down" ? "on down" : ""} onClick={() => setSide("down")}>▼ Downtrend</button></div>}<ViewToggle v={view} set={setView}/></div></div>
      {view === "bubble"
        ? <QuadrantChart selected={selected} onSelect={onPick} items={bubbles.map(r => ({ id:`${r.sec}|${r.k}`, key:r.k, label:r.k, x:r.nb, y:r.st, size:r.sig || r.n, color:colorOf(r.sec),
            tip:`${r.k} (${r.sec}): strength ${r.st} · net bias ${r.nb > 0 ? "+" : ""}${r.nb} · ${r.n} stocks · ${r.adv} up / ${r.dec} down` }))}/>
        : <div className="lb">{list.map(r => { const pos = r.nb >= 0; return (
            <button key={r.sec + r.k} className={`lb-row ${selected.includes(r.k) ? "on" : ""}`} onClick={() => onPick(r.k)}>
              <div className="lb-mid"><div className="lb-top"><b>{r.k}</b><span className="sub">{r.sec}</span><span className={`nb ${pos ? "up" : "down"}`}>{pos ? "+" : ""}{r.nb}</span></div>
                <div className="bar"><div style={{ width:`${Math.abs(r.nb) / maxAbs * 100}%`, background:pos ? "var(--long)" : "var(--short)" }}/></div></div>
            </button>); })}
            {!list.length && <div className="empty">No industries for this selection.</div>}</div>}
    </div>
  );
}


// ─── stock card ──────────────────────────────────────────────────────────────
function StockCard({ s, data, onOpen, onClose, origin = null }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  useEffect(() => { trackAction("research", "stock_card"); }, [s && s.s]);
  const asOf = data && data.as_of;
  const rows = TFS.map(([k, l, hint], i) => ({ k, l, hint, v:s.sc[i], d:dirTf(s, i), held:(s.rh || "").includes(k) }));
  const ups = rows.filter(r => r.d === 1), dns = rows.filter(r => r.d === -1);
  const od = dirVal(s.os), bi = isBi(s, []);
  const indPeers = useMemo(() => (data ? data.stocks : []).filter(x => x.os != null && x.sec === s.sec && x.ind === s.ind)
    .sort((a, b) => b.os - a.os), [data, s]);
  const indRank = indPeers.findIndex(x => x.s === s.s) + 1;
  // sector / industry rows per timeframe (lists come sorted strongest first → rank = position)
  const ctx = (tf, ind) => { const list = ((ind ? data.industries : data.sectors) || {})[tf] || [];
    const i = list.findIndex(r => ind ? r.k === s.ind && r.sec === s.sec : r.k === s.sec);
    return i < 0 ? null : { ...list[i], rank:i + 1, of:list.length }; };
  // top 5, then (with their real rank) this stock and the stock first opened from the list when they are outside the top 5
  const top = indPeers.slice(0, 5), showSelf = indRank > 5;
  const originRank = origin && origin.s !== s.s ? indPeers.findIndex(x => x.s === origin.s) + 1 : 0;
  const extraRows = [...(showSelf ? [[s, indRank]] : []), ...(originRank > 5 ? [[indPeers[originRank - 1], originRank]] : [])].sort((a, b) => a[1] - b[1]);
  const secA = data ? ctx("A", false) : null, indA = data ? ctx("A", true) : null;
  const view = combinedView(od, bi, secA, indA, s.os, !!s.x);
  const rg = regimeOf(s, data && data.rd);
  const ai = s.os != null ? insightsOf(s, od, bi, secA, indA, view, indRank, indPeers.length, rg) : null;
  const grp = (kind, name, g) => (
    <div className="cv-row cv-grp"><span className="cv-k">{kind}</span>
      <span className="cv-v"><b>{name}</b>{g
        ? <> is <span className={`cv-st ${groupState(g)}`}>{groupWord(g)}</span> <span className="dim mono">· {Math.round(g.st)}% · #{g.rank} of {g.of}</span></>
        : <span className="dim"> — no data</span>}</span></div>
  );
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal stock" onClick={e => e.stopPropagation()} role="dialog" aria-label={s.n}>
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
        <div className="m-head">
          <div><div className="m-name">{s.n}</div><div className="sub"><span className="sym">{s.s}</span> · {s.sec} › {s.ind} · {sizeOf(s)} cap{s.f ? " · F&O" : ""}{s.h && <> · <span className={`bgtag ${s.h}`}>{BG_NAME[s.h]} reliability</span></>}{s.x ? <> · <span className="stretch-tag" title="Ran up 3x or more in about a year — stretched; sharp falls are common. Don't chase.">🔥 Stretched</span></> : null}</div></div>
          <div className="m-price"><div className="mono">₹{s.p}</div>{s.c != null && <div className={`mono ${s.c >= 0 ? "up" : "down"}`}>{s.c >= 0 ? "+" : ""}{s.c}% today</div>}
            <span className="tcopy m-copy" title={`Copy ${s.s} only`}><span className="lbl">Copy {s.s}</span><CopyBtns syms={[s.s]}/></span></div>
        </div>
        <div className="m-grid">
        <div className="m-col">
        <div className="m-overall">
          <OverallMeter os={s.os} secA={secA} indA={indA} size={170} className="om-card"/>
          <div className="mo-side">
          <div className="mo-top">
            <span className={`dirtag ${bi ? "bi" : od === 1 ? "up" : od === -1 ? "down" : "side"}`} title={summaryOf(s)}>{bi ? "⇅ Bidirectional" : ups.length && !dns.length ? "▲ One-directional up" : dns.length && !ups.length ? "▼ One-directional down" : "◆ Sideways"}</span>
            {view && <div className={`cv-verdict ${view.tone}`}>{view.title}</div>}
          </div>
          <div className="mo-sum">
            <div className="lbl ai-h"><span className="ai-spark">✦</span> AI insights <Info text="Short insights written automatically from Hyperplane's quant data for this stock, its industry and its sector (Combined timeframe) — information, not advice. A sector or industry backs the stock when it is Good or Strong (61%+) and counts against it when Weak (30% or less). The best ideas have all three pointing the same way — see Docs → golden rules."/></div>
            {grp("Sector", s.sec, secA)}
            {grp("Industry", s.ind, indA)}
            {ai && <div className={`ai-box ${view ? view.tone : "mid"}`}>
              <div className="ai-l good"><b>✓ Good</b><span>{ai.good.length ? ai.good.join(" · ") : "No clear strength right now."}</span></div>
              <div className="ai-l bad"><b>⚠ Watch out</b><span>{ai.bad.length ? ai.bad.join(" · ") : "Nothing major — stock, industry and sector point the same way."}</span></div>
              <div className="ai-l focus"><b>◎ Focus</b><span>{ai.focus}</span></div>
            </div>}
          </div>
          </div>
        </div>
        <div className="blk blk-ctx">
        <div className="m-sec-t">Sector &amp; industry strength <Info text="How strong the stock's sector and industry are (0–100%), combined and on each timeframe, with their rank among all sectors / industries. Hover a cell for advancing vs declining stocks."/></div>
        <div className="ctx-wrap">
          <table className="ctx">
            <thead><tr><th></th><th>Combined</th>{TFS.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
            <tbody>
              {[[false, s.sec, "Sector"], [true, s.ind, "Industry"]].map(([ind, name, kind]) => (
                <tr key={kind}>
                  <td className="ctx-n"><span className="lbl">{kind}</span><b title={name}>{name}</b>
                    {(() => { const a = ctx("A", ind); return a ? <span className="sub">{a.n} stocks · <span className="up">▲{a.adv}</span> <span className="down">▼{a.dec}</span></span> : null; })()}</td>
                  {["A", ...TFS.map(([k]) => k)].map(tf => { const r = ctx(tf, ind); return (
                    <td key={tf} className={tf === "A" ? "ctx-a" : ""} title={r ? `${levelOf(r.st)} · rank #${r.rank} of ${r.of} · ${r.adv} advancing / ${r.dec} declining · avg move ${r.avg}%` : "No data"}>
                      {r ? <><span className={`ss ${groupState(r)}`}>{Math.round(r.st)}%</span><span className="rk">#{r.rank}/{r.of}</span></> : <span className="dim">—</span>}
                    </td>); })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        </div>
        </div>
        <div className="m-col">
        {rg && <div className="blk blk-rg"><RegimeBox s={s} rd={data && data.rd}/></div>}
        <div className="blk blk-tf">
        <div className="m-sec-t">Trend by timeframe <Info text="The stock's trend on each timeframe and how strong it is (0–100%) — not a price move."/></div>
        <div className="m-rows">
          {rows.map(r => (
            <div key={r.k} className="m-row">
              <div className="m-l" title={r.hint}><b>{r.l}</b><span className="sub">{r.hint}</span></div>
              <StrengthBar v={r.v} d={r.d}/>
              <StrengthTag v={r.v} d={r.d}/>
              <span className={`dirtag sm ${r.d === 1 ? "up" : r.d === -1 ? "down" : "side"}`}>{r.v == null ? "No data" : r.d === 1 ? "Uptrend" : r.d === -1 ? "Downtrend" : "Sideways"}</span>
            </div>
          ))}
        </div>
        </div>
        {indPeers.length > 1 && <div className="blk blk-peers">
          <div className="m-sec-t">Top {top.length} strongest in {s.ind} <span className="tcopy"><span className="lbl">Ticker copy · {top.length}</span><CopyBtns syms={top.map(x => x.s)} compact/></span></div>
          <div className="peers">
            {[...top.map((p, i) => [p, i + 1]), ...extraRows].map(([p, rk], i) => (
              <button key={p.s} type="button" className={`peer ${p.s === s.s ? "me" : ""} ${i === top.length ? "gap" : ""}`} onClick={() => p.s !== s.s && onOpen(p)}
                title={p.s === s.s ? "This stock" : `Open ${p.n}`}>
                <span className="mono dim">#{rk}</span><span className="sym">{p.s}</span><span className="sub pn">{p.n}</span><Meter v={p.os} d={dirVal(p.os)} label="Combined"/>
              </button>))}
          </div>
        </div>}

        </div>
        </div>

        {data && <InvestmentSummary s={s} data={data}/>}
        <div className="m-foot"><span className="sub">Data as of {fmtDT(asOf)} · strength = how strong the trend is (0–100%), not a price move</span><span className="sub m-disc">For education only — not investment advice.</span></div>
        <p className="fine">{DISCLAIMER}</p>
      </div>
    </div>
  );
}

// ─── RESEARCH VIEW (Control Tower) — filters, tiles, sector / industry charts, master data, stock card ───
const EMPTY ={ sectors:[], industries:[], sizes:[], bg:[], fno:false, trend:"all" };

export default function ResearchView({ data, err, sel, mode, setMode }) {
  const [f, setF] = useState(EMPTY); const [tfs, setTfs] = useState([]);
  const [q, setQ] = useState(""); const [sort, setSort] = useState("best"); const [page, setPage] = useState(0);
  const [rgf, setRgf] = useState("all");                                         // Regime filter (master data)
  const used = useRef(false);                                 // adoption: the customer used a filter or the search
  useEffect(() => { if (used.current) trackAction("research", "filter"); used.current = true; }, [JSON.stringify(f), tfs.join(), q, rgf]);
  const [open, setOpenRaw] = useState(null); const [trail, setTrail] = useState([]);
  const setOpen = st => { setTrail([]); setOpenRaw(st); };                       // from the list / close
  // a peer inside the card: keep only the ORIGINAL stock to go back to (owner: back = the one I picked first)
  const openFromCard = st => { const origin = trail[0] || open; setTrail(origin && origin.s !== st.s ? [origin] : []); setOpenRaw(st); };
  useEffect(() => { setOpen(null); }, [sel]);                                   // another day: close the card
  useEffect(() => setPage(0), [f, tfs, q, sort, rgf]);
  const stocks = data ? data.stocks : [];
  const sectorOpts = useMemo(() => [...new Set(stocks.map(s => s.sec))].sort(), [stocks]);
  const industryOpts = useMemo(() => [...new Set(stocks.filter(s => !f.sectors.length || f.sectors.includes(s.sec)).map(s => s.ind))].sort(), [stocks, f.sectors]);
  const base = useMemo(() => stocks.filter(s => (!f.sectors.length || f.sectors.includes(s.sec)) && (!f.industries.length || f.industries.includes(s.ind))
    && (!f.sizes.length || f.sizes.includes(sizeOf(s))) && (!f.bg.length || f.bg.includes(s.h)) && (!f.fno || s.f)), [stocks, f]);
  const hasBg = stocks.some(s => s.h);
  const filtered = useMemo(() => { const qq = q.trim().toLowerCase();
    const ok = s => f.trend === "all" || categoryOf(s, tfs) === f.trend;
    return base.filter(s => ok(s) && regimeMatch(s, rgf) && (!qq || s.s.toLowerCase().includes(qq) || s.n.toLowerCase().includes(qq))); }, [base, f.trend, tfs, q, rgf]);
  const hasRg = stocks.some(s => s.rg);
  const sorted = useMemo(() => {
    const v = s => focusOf(s, tfs), arr = [...filtered];
    // 0 = Strong reliability & not stretched, 1 = Moderate, 2 = Weak or stretched
    const tier = s => (s.x || s.h === "W") ? 2 : s.h === "M" ? 1 : 0;
    const dirUp = s => focusDir(s, tfs) === 1 ? 0 : 1;
    if (sort === "best") arr.sort((a, b) => dirUp(a) - dirUp(b) || tier(a) - tier(b) || (v(b) ?? -999) - (v(a) ?? -999) || a.n.localeCompare(b.n));
    else if (sort === "up") arr.sort((a, b) => (v(b) ?? -999) - (v(a) ?? -999) || (b.os ?? -999) - (a.os ?? -999) || a.n.localeCompare(b.n));
    else if (sort === "down") arr.sort((a, b) => (v(a) ?? 999) - (v(b) ?? 999) || (a.os ?? 999) - (b.os ?? 999) || a.n.localeCompare(b.n));
    else if (sort === "change") arr.sort((a, b) => (b.c ?? -99) - (a.c ?? -99));
    else arr.sort((a, b) => a.n.localeCompare(b.n));
    return arr;
  }, [filtered, sort, tfs]);
  const cats = useMemo(() => { const c = { up:0, down:0, bi:0, side:0 }; base.forEach(s => { const k = categoryOf(s, tfs); if (k) c[k]++; }); return c; }, [base, tfs]);
  const nUp = cats.up, nDown = cats.down, nBi = cats.bi;
  const panelTf = tfs.length === 1 ? tfs[0] : "A";
  const tfLabel = tfs.length > 1 ? "Combined (pick one timeframe to see it alone)" : panelTf === "A" ? `${MODES[mode].label} (all timeframes)` : TF_NAME[panelTf];
  const focusLabel = !tfs.length ? `${MODES[mode].label} (all timeframes)` : tfs.length === 1 ? TF_NAME[tfs[0]] : `Avg ${tfs.join("+")}`;
  const secRows = data ? (data.sectors || {})[panelTf] || [] : [], indRows = data ? (data.industries || {})[panelTf] || [] : [];
  const PAGE = 50, pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  // removing a sector also removes its industries; clearing all sectors clears the industries
  const setK = (k, v) => setF(p => ({ ...p, [k]: v, ...(k === "sectors" && v.length < p.sectors.length
    ? { industries: v.length ? p.industries.filter(i => stocks.some(s => s.ind === i && v.includes(s.sec))) : [] } : {}) }));
  const pick = (k, v) => setK(k, f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v]);
  const toggleTf = t => setTfs(p => p.includes(t) ? p.filter(x => x !== t) : "DWMQY".split("").filter(x => x === t || p.includes(x)));
  const setTrend = t => { setK("trend", t); if (t === "down") setSort("down"); else if (t === "up") setSort("best"); };
  const active = f.sectors.length || f.industries.length || f.sizes.length || f.bg.length || f.fno || f.trend !== "all" || tfs.length;
  const scope = tfs.length ? (tfs.length === 1 ? TF_NAME[tfs[0]] : `all of ${tfs.join(" · ")}`) : "combined";
  return (
    <>
      <div className="fbar">
        {/* Trading mode and Timeframe are separate but exclusive: a mode clears the timeframes, a timeframe switches the
            mode off (with no timeframe left, the last mode is back on) */}
        <div className="fg"><span className="fl">Trading mode <Info wide label="Trading mode weights per timeframe" text={<ModeWeights active={tfs.length ? null : mode}/>}/></span>
          <Seg items={Object.entries(MODES).map(([k, m]) => [k, m.short, null, `${m.label}: ${m.hint} — ${Object.entries(weightPct(m.w)).map(([t, p]) => `${t} ${p}%`).join(" · ")}`])}
            isOn={k => !tfs.length && mode === k} onPick={k => { setMode(k); setTfs([]); }}/></div>
        <div className="fg"><span className="fl">Timeframe <Info text="Look at single timeframes only: D / W / M / Q / Y (several = they must all agree). Picking a timeframe switches the Trading mode off; clear the timeframes to go back to your mode."/></span>
          <Seg items={TFS.map(([k, l]) => [k, k, "tf", `${l} only`])} isOn={k => tfs.includes(k)} onPick={toggleTf}/></div>
        <div className="fg"><span className="fl">Trend <Info text="Uptrend / Downtrend = direction on the chosen timeframe(s). Sideways = no clear direction. Bidirectional = up on some timeframes and down on others."/></span>
          <Seg items={[["all","All"],["up","▲ Up","up"],["down","▼ Down","down"],["side","◆ Sideways","flat"],["bi","⇅ Bidirectional","bi"]]} isOn={k => f.trend === k} onPick={setTrend}/></div>
        <div className="fg"><span className="fl">Market cap</span>
          <Seg items={SIZES.map(z => [z, z])} isOn={z => f.sizes.includes(z)} onPick={z => pick("sizes", z)}/></div>
        {hasBg && <div className="fg"><span className="fl">Stock reliability <Info text="How reliable the stock's longer-term price history is. Strong = healthy, Moderate = average, Weak = poor. Pick one or more."/></span>
          <Seg items={BG.map(([k, l, tone]) => [k, l, tone])} isOn={k => f.bg.includes(k)} onPick={k => pick("bg", k)}/></div>}
        <div className="fg"><span className="fl">Segment</span>
          <Seg items={[["fno","F&O only","up"]]} isOn={() => f.fno} onPick={() => setK("fno", !f.fno)}/></div>
        <div className="fg grow"><span className="fl">Sector</span><MultiSelect label="sectors" options={sectorOpts} value={f.sectors} onChange={v => setK("sectors", v)} width={138}/></div>
        <div className="fg grow"><span className="fl">Industry</span><MultiSelect label="industries" options={industryOpts} value={f.industries} onChange={v => setK("industries", v)} width={150}/></div>
        {active ? <button className="reset" onClick={() => { setF(EMPTY); setTfs([]); setSort("best"); }} title="Clear every filter">✕ Reset</button> : null}
      </div>

      {err && <div className="card empty">{err}</div>}
      {!data && !err && <div className="card empty">{sel ? "Loading that day…" : "Loading the latest data…"}</div>}
      {data && <>
        <div className="kpis">
          <div className="card kpi"><span className="lbl">Stocks in view <Info text={`Stocks that match the market-cap, segment, sector and industry filters (${scope}).`}/></span><b className="mono">{base.length.toLocaleString()}</b></div>
          <div className="card kpi up"><span className="lbl">▲ Uptrend <Info text="Stocks in an uptrend on the chosen timeframe(s)."/></span><b className="mono">{nUp.toLocaleString()}</b><div className="kbar"><div style={{ width:`${base.length ? nUp / base.length * 100 : 0}%` }}/></div></div>
          <div className="card kpi down"><span className="lbl">▼ Downtrend <Info text="Stocks in a downtrend on the chosen timeframe(s)."/></span><b className="mono">{nDown.toLocaleString()}</b><div className="kbar"><div style={{ width:`${base.length ? nDown / base.length * 100 : 0}%` }}/></div></div>
          <div className="card kpi side"><span className="lbl">◆ Sideways <Info text="Stocks with no clear trend on the chosen timeframe(s) — price is going nowhere."/></span><b className="mono">{cats.side.toLocaleString()}</b><div className="kbar"><div style={{ width:`${base.length ? cats.side / base.length * 100 : 0}%` }}/></div></div>
          <div className="card kpi bi"><span className="lbl">⇅ Bidirectional <Info text="Stocks in an uptrend on some timeframes and a downtrend on others — the timeframes disagree."/></span><b className="mono">{nBi.toLocaleString()}</b><div className="kbar"><div style={{ width:`${base.length ? nBi / base.length * 100 : 0}%` }}/></div></div>
          <div className="card kpi"><span className="lbl">Strongest sector <Info text="Highest sector strength (0–100) on the chosen timeframe."/></span><b className="kname">{secRows[0] ? secRows[0].k : "—"}</b>{secRows[0] && <small className="mono">strength {secRows[0].st}</small>}</div>
          <div className="card kpi"><span className="lbl">Weakest sector <Info right text="Lowest sector strength (0–100) on the chosen timeframe."/></span><b className="kname">{secRows.length ? secRows[secRows.length - 1].k : "—"}</b>{secRows.length > 0 && <small className="mono">strength {secRows[secRows.length - 1].st}</small>}</div>
        </div>

        <div className="panels">
          <SectorPanel rows={secRows} tfLabel={tfLabel} selected={f.sectors} onPick={k => pick("sectors", k)}/>
          <IndustryPanel rows={indRows} tfLabel={tfLabel} sectors={f.sectors} selected={f.industries} onPick={k => pick("industries", k)}/>
        </div>

        <section className="card table-card">
          <div className="t-head">
            <div><div className="panel-t">🗂 Master data <Info text="Every stock with its trend and strength. Strength = how strong the trend is in its own direction, 0–100%. Click a stock for the full picture."/></div>
              <div className="sub">{sorted.length.toLocaleString()} stocks · {focusLabel} · click a stock for details</div></div>
            <div className="t-tools">
              <input className="search" placeholder="Search a stock" value={q} onChange={e => setQ(e.target.value)} aria-label="Search"/>
              {hasRg && <select value={rgf} onChange={e => setRgf(e.target.value)} aria-label="Regime" id="rg-filter" title={RG_INFO} className={rgf !== "all" ? "on" : ""}>
                {RG_FILTER.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
              <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
                <option value="best">Best uptrend first (reliable, not stretched)</option><option value="up">Strongest uptrend first</option><option value="down">Strongest downtrend first</option>
                <option value="change">Biggest gain today</option><option value="name">Name A–Z</option>
              </select>
              <span className="tcopy"><span className="lbl">Ticker copy · {sorted.length}</span><CopyBtns syms={sorted.map(s => s.s)}/></span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th rowSpan={2}>#</th><th rowSpan={2}>Stock</th><th rowSpan={2} className="hide-sm">Sector · Industry</th><th rowSpan={2} className="num">Price</th><th rowSpan={2}>Trend</th>
                  {hasRg && <th rowSpan={2} title={RG_INFO}>Regime</th>}
                  <th rowSpan={2} title="How strong the trend is on the chosen timeframe(s), 0–100% — not a price move">Trend strength</th>
                  <th colSpan={5} className="hide-sm grp-h" title="How strong the trend is on each timeframe, 0–100%. Bars lit = strength, colour = direction. Not a price move.">Trend strength by timeframe <span>(0–100%)</span></th>
                  <th rowSpan={2} className="hide-sm">Ticker copy</th></tr>
                <tr>{TFS.map(([k, l]) => <th key={k} className={`num hide-sm ${tfs.includes(k) ? "hl" : ""}`} title={`${l} trend strength`}>{l}</th>)}</tr>
              </thead>
              <tbody>
                {sorted.slice(page * PAGE, page * PAGE + PAGE).map((s, i) => { const v = focusOf(s, tfs), d = focusDir(s, tfs), cat = categoryOf(s, tfs); return (
                  <tr key={s.s} onClick={() => setOpen(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setOpen(s)}>
                    <td className="mono dim">{page * PAGE + i + 1}</td>
                    <td><span className="sym">{s.s}</span>{s.f ? <span className="fno">F&amp;O</span> : null}{s.x ? <span className="stretch-tag sm" title="Ran up 3x or more in about a year — stretched; sharp falls are common. Don't chase.">🔥</span> : null}{isBi(s, []) && <span className="bi-tag" title="Uptrend on some timeframes, downtrend on others">⇅</span>}<div className="sub">{s.n} · {sizeOf(s)}</div></td>
                    <td className="hide-sm"><span className="sec" style={{ color:colorOf(s.sec) }}>● {s.sec}</span><div className="sub">{s.ind}</div></td>
                    <td className="num mono">₹{s.p}{s.c != null && <div className={`small ${s.c >= 0 ? "up" : "down"}`}>{s.c >= 0 ? "+" : ""}{s.c}%</div>}</td>
                    <td>{cat ? <span className={`dirtag ${CAT[cat][1]}`}>{CAT[cat][0]}</span> : <span className="dim">—</span>}</td>
                    {hasRg && <td><RegimeTag r={regimeOf(s, data.rd)} sm/></td>}
                    <td className="cur" title={v == null ? "" : `Trend strength ${Math.abs(v)}% — not a price move`}><span className={`pct ${dirKey(d)}`}>{pct(v)}</span><StrengthBar v={v} d={d}/></td>
                    {TFS.map(([k], j) => <td key={k} className={`num hide-sm ${tfs.includes(k) ? "hl" : ""}`}><Meter v={s.sc[j]} d={dirTf(s, j)} label={TFS[j][1]}/></td>)}
                    <td className="hide-sm"><CopyBtns syms={[s.s]} compact/></td>
                  </tr>); })}
                {!sorted.length && <tr><td colSpan={14} className="empty">No stocks match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && <div className="pager"><button className="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Previous</button><span className="sub mono">Page {page + 1} / {pages}</span><button className="ghost" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next ›</button></div>}
        </section>
      </>}
      {open && <StockCard key={open.s} s={(data && data.stocks.find(x => x.s === open.s)) || open} data={data} onOpen={openFromCard} onClose={() => setOpen(null)} origin={trail[0] || null}/>}
    </>
  );
}
