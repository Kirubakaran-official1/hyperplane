// ⚙ Admin → 🎚 Scoring (round 24, owner 2026-11-17: "the zone and regime scores inside the admin panel … default, change it, any number of
// scenarios … apply it to the old data as well"). Named score sets of the strength engine (backend/app/zone_engine.py, app/scoring.py): the
// live one, the built-in Default, drafts and the ones that were live. A draft is edited here; the Period table (the review sheet's 5 trends ×
// 6 price places) follows every change at once; Compare runs the draft against the live set on the stored days — colours per day, the
// colour changes, the biggest movers, and how each colour group did afterwards; Apply makes it live — today's view at once, every past day
// by the worker in the background (no raw collection is opened again: each day is rescored from its stored factors). Admin only.
import React, { useEffect, useMemo, useState } from "react";

const card = { background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 10, padding: "12px 14px" };
const lbl = { fontSize: 10.5, color: "var(--t3)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" };
const btn = (on = false, tone) => ({ padding: "6px 12px", borderRadius: 7, border: `1px solid ${tone === "danger" ? "var(--short)" : on ? "var(--acc)" : "var(--b2)"}`,
  cursor: "pointer", background: on ? "var(--acc)" : "var(--s2)", color: on ? "#fff" : tone === "danger" ? "var(--short)" : "var(--t1)", fontSize: 12, fontWeight: 700 });
const inp = { width: 74, padding: "5px 7px", borderRadius: 6, border: "1px solid var(--b2)", background: "var(--s2)", color: "var(--t1)", fontSize: 12.5,
  fontFamily: "var(--mono)", textAlign: "right" };
const COLOUR = { 1: ["Green", "var(--long)"], 0: ["Amber", "var(--mixed)"], [-1]: ["Red", "var(--short)"] };
const PLACES = [["above", "Above the zone top"], ["near_top", "Near the top"], ["upper", "Upper half"], ["lower", "Lower half"], ["near_bottom", "Near the bottom"],
  ["below", "Below the zone bottom"]];
const TRENDW = { 2: "Uptrend", 1: "Turning up", 0: "Sideways", [-1]: "Turning down", [-2]: "Downtrend" };
const fmtDT = iso => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "—";
const sg = v => v == null ? "—" : `${v > 0 ? "+" : ""}${v}`;
const pc = v => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const word = (s, cut) => { const a = Math.abs(s); if (a < cut) return "Sideways"; return `${a > 80 ? "Strong" : a > 60 ? "Good" : a > 30 ? "Average" : "Weak"} ${s > 0 ? "up" : "down"}`; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// round 25: the zone ladder model (zone_engine.ladder) — its marks in plain words
const LTFN = { W: "Weekly", M: "Monthly", Q: "Quarterly", Y: "Yearly" };
const PAIRS = [["WM", "Weekly zone in the Monthly zone"], ["WQ", "Weekly zone in the Quarterly zone"], ["WY", "Weekly zone in the Yearly zone"], ["MQ", "Monthly zone in the Quarterly zone"]];
const ZIN = [["upper", "upper part"], ["break_top", "breaking the top"], ["above", "fully above"], ["break_bottom", "breaking the bottom"], ["below", "fully below"]];
const LWHERE = { upper: "sits in the upper part of", break_top: "is breaking above", above: "is fully above", break_bottom: "is breaking below", below: "is fully below" };
const ladderWords = code => { const cc = /^consol_W([MQY])$/.exec(code), g = /^gate_([MQ])$/.exec(code);
  if (cc) return `weekly and ${LTFN[cc[1]].toLowerCase()} disagree — consolidation`;
  if (g) return `price below the ${LTFN[g[1]].toLowerCase()} zone, not closed yet — not green`;
  const m = /^(up|down)_([WMQY])$/.exec(code);
  if (m) return `last ${LTFN[m[2]].toLowerCase().replace("ly", "")} closed ${m[1] === "up" ? "above" : "below"} the ${LTFN[m[2]].toLowerCase()} zone`;
  const [pair, ...w] = code.split("_"); return `${LTFN[pair[0]].toLowerCase()} zone ${LWHERE[w.join("_")]} the ${LTFN[pair[1]].toLowerCase()} zone`; };

// one number of the score set: its value, the default beside it, a reset
function Num({ id, value, def, onChange, step = 0.01, min, max, ro, suffix }) {
  const changed = !same(value, def);
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
    <input id={id} type="number" step={step} min={min} max={max} value={value} disabled={ro} style={{ ...inp, borderColor: changed ? "var(--acc)" : "var(--b2)" }}
      onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}/>{suffix && <small style={{ color: "var(--t3)" }}>{suffix}</small>}
    {changed && <small style={{ color: "var(--t3)" }} title="The Default">was {String(def)}</small>}
    {changed && !ro && <button type="button" title="Back to the Default" style={{ ...btn(), padding: "2px 7px" }} onClick={() => onChange(def)}>↺</button>}
  </span>;
}
function Row({ label, hint, children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 210px) 1fr", gap: 10, alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--b1)" }}>
    <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</div>{hint && <div style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.4 }}>{hint}</div>}</div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>{children}</div></div>;
}

function Editor({ p, def, ro, set }) {
  const up = (k, v) => set({ ...p, [k]: v });
  const model = p.model || "default", L = p.ladder || def.ladder, LD = def.ladder;
  const upL = v => set({ ...p, ladder: { ...L, ...v } });
  return <div style={{ display: "flex", flexDirection: "column" }} id="sc-editor">
    <div style={lbl}>Model</div>
    <Row label="How the price place counts" hint="Default: where the price sits in each zone. Zone ladder: confirmed breakouts and where the zones sit in each other — the price place earns nothing">
      {[["default", "Default — price place"], ["ladder", "Zone ladder — breakouts + zone in zone"]].map(([k, l]) =>
        <button key={k} type="button" disabled={ro} style={btn(model === k)} id={`sc-model-${k}`} onClick={() => up("model", k)}>{l}</button>)}</Row>
    {model === "ladder" && <>
      <div style={{ ...lbl, marginTop: 10 }}>Zone ladder — confirmed breakouts (the last completed candle closed above the zone top; below the bottom takes the same away)</div>
      <Row label="Weekly · Monthly · Quarterly · Yearly" hint="Marks added to the final score">
        {["W", "M", "Q", "Y"].map(k => <Num key={k} id={`sc-l-close-${k}`} value={L.close[k]} def={LD.close[k]} ro={ro} min={0} max={30} step={1}
          onChange={v => upL({ close: { ...L.close, [k]: v } })} suffix={LTFN[k].toLowerCase()}/>)}</Row>
      <Row label="Strict ladder" hint="A monthly breakout counts only when the weekly one did too; quarterly needs monthly; yearly needs quarterly">
        <label style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" id="sc-l-strict" checked={L.strict} disabled={ro} onChange={e => upL({ strict: e.target.checked })}/>
          Strict (Weekly → Monthly → Quarterly → Yearly){L.strict !== LD.strict && <small style={{ color: "var(--t3)" }}>(was {LD.strict ? "on" : "off"})</small>}</label></Row>
      <Row label="Consolidation" hint="The weekly candle closed one way and a higher one the other way (e.g. a weekly breakdown under a monthly breakout): it is ranging — those marks cancel">
        <label style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" id="sc-l-consol" checked={L.consol !== false} disabled={ro} onChange={e => upL({ consol: e.target.checked })}/>
          Mixed closes = consolidation (no marks)</label></Row>
      <Row label="Green gate" hint="The price has fallen below the monthly or quarterly zone but no candle has closed there yet: it stays amber until a close confirms">
        <label style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" id="sc-l-guard" checked={L.guard !== false} disabled={ro} onChange={e => upL({ guard: e.target.checked })}/>
          Not green while the price is below the monthly / quarterly zone, unconfirmed</label></Row>
      <div style={{ ...lbl, marginTop: 10 }}>Zone ladder — where a zone sits in a bigger one (the lower part counts 0)</div>
      {PAIRS.map(([k, l]) => <Row key={k} label={l}>
        {ZIN.map(([w, wl], i) => <Num key={w} id={`sc-l-${k}-${w}`} value={L.pairs[k][i]} def={LD.pairs[k][i]} ro={ro} min={i < 3 ? 0 : -20} max={i < 3 ? 20 : 0} step={1}
          onChange={v => upL({ pairs: { ...L.pairs, [k]: L.pairs[k].map((x, j) => j === i ? v : x) } })} suffix={wl}/>)}</Row>)}
    </>}
    <div style={{ ...lbl, marginTop: 10 }}>Trend (the zone steps)</div>
    <Row label="Recency weights" hint="The latest step first — how much each of the last 4 zone moves counts">
      {p.recency.map((v, i) => <Num key={i} id={`sc-p-recency-${i}`} value={v} def={def.recency[i]} ro={ro} min={0} max={1} onChange={x => up("recency", p.recency.map((y, j) => j === i ? x : y))}/>)}</Row>
    <Row label="A full step" hint="A zone moving this many widths counts in full"><Num id="sc-p-full_step" value={p.full_step} def={def.full_step} ro={ro} min={0.1} max={2} step={0.05} onChange={v => up("full_step", v)} suffix="widths"/></Row>
    <Row label="Trend words" hint="T at or above: Uptrend / Turning up (the same below zero)">
      <Num id="sc-p-up" value={p.up} def={def.up} ro={ro} min={0.05} max={1} step={0.05} onChange={v => up("up", v)} suffix="uptrend"/>
      <Num id="sc-p-turn" value={p.turn} def={def.turn} ro={ro} min={0.01} max={0.95} step={0.01} onChange={v => up("turn", v)} suffix="turning"/></Row>
    <div style={{ ...lbl, marginTop: 10 }}>Period strength = 100 × (trend share × T + price share × P)</div>
    <Row label="Trend · price share" hint={model === "ladder" ? "Must add up to 1 — the zone ladder uses only the trend share (the price share is not used)" : "Must add up to 1"}>
      <Num id="sc-p-trend_w" value={p.trend_w} def={def.trend_w} ro={ro} min={0} max={1} step={0.05} onChange={v => set({ ...p, trend_w: v, pos_w: v === "" ? p.pos_w : Math.round((1 - v) * 100) / 100 })} suffix="trend"/>
      <Num id="sc-p-pos_w" value={p.pos_w} def={def.pos_w} ro={ro} min={0} max={1} step={0.05} onChange={v => set({ ...p, pos_w: v, trend_w: v === "" ? p.trend_w : Math.round((1 - v) * 100) / 100 })} suffix="price"/></Row>
    <div style={{ ...lbl, marginTop: 10 }}>Stock strength (the periods' weights)</div>
    <Row label="Quarter · Year · Month" hint="A missing Year or Month is left out and the rest re-weighted">
      {["Q", "Y", "M"].map(k => <Num key={k} id={`sc-p-tf_w-${k}`} value={p.tf_w[k]} def={def.tf_w[k]} ro={ro} min={0} max={100} step={5} onChange={v => up("tf_w", { ...p.tf_w, [k]: v })}
        suffix={{ Q: "quarter", Y: "year", M: "month" }[k]}/>)}</Row>
    <div style={{ ...lbl, marginTop: 10 }}>Colour</div>
    <Row label="Colour cut" hint="Green at +cut or more, red at −cut or less, amber between (the app's up / sideways / down words too)">
      <Num id="sc-p-cut" value={p.cut} def={def.cut} ro={ro} min={5} max={60} step={1} onChange={v => up("cut", v)} suffix="±"/>
      <label style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" id="sc-p-q_guard" checked={p.q_guard} disabled={ro} onChange={e => up("q_guard", e.target.checked)}/>
        Green also needs the quarter not negative{p.q_guard !== def.q_guard && <small style={{ color: "var(--t3)" }}>(was {def.q_guard ? "on" : "off"})</small>}</label></Row>
    <div style={{ ...lbl, marginTop: 10 }}>Regime</div>
    <Row label="Regime squeeze" hint="A period pointing against the long-term regime × this (into sideways)">
      <Num id="sc-p-squeeze" value={p.squeeze} def={def.squeeze} ro={ro} min={0} max={1} step={0.01} onChange={v => up("squeeze", v)}/></Row>
    <div style={{ ...lbl, marginTop: 10 }}>Mother candle (points by where the price sits in that zone)</div>
    {PLACES.map(([k, l]) => <Row key={k} label={l}>
      <Num id={`sc-p-nr-${k}-bo`} value={p.nr[k][0]} def={def.nr[k][0]} ro={ro} min={0} max={20} step={1} onChange={v => up("nr", { ...p.nr, [k]: [v, p.nr[k][1]] })} suffix="breakout"/>
      <Num id={`sc-p-nr-${k}-bd`} value={p.nr[k][1]} def={def.nr[k][1]} ro={ro} min={-20} max={0} step={1} onChange={v => up("nr", { ...p.nr, [k]: [p.nr[k][0], v] })} suffix="breakdown"/></Row>)}
    <Row label="Shortest candle share" hint="A 4-bar mother candle counts this much of a 12-bar one">
      <Num id="sc-p-nr_base" value={p.nr_base} def={def.nr_base} ro={ro} min={0.5} max={1} step={0.01} onChange={v => up("nr_base", v)}/></Row>
    <div style={{ ...lbl, marginTop: 10 }}>Streak ("going down for the last 3 quarters")</div>
    <Row label="Streak move" hint="A zone middle moving this many widths counts as up / down">
      <Num id="sc-p-move" value={p.move} def={def.move} ro={ro} min={0.01} max={0.5} step={0.01} onChange={v => up("move", v)} suffix="widths"/></Row>
  </div>;
}

// the review sheet's Period table, live: 5 trends × 6 price places → the period strength and its word
function PeriodTable({ p, live, home }) {
  const cell = (t, x, P) => Math.round(Math.max(-100, Math.min(100, 100 * ((+P.trend_w || 0) * t + (P.model === "ladder" ? 0 : (+P.pos_w || 0)) * x))));
  return <div style={{ ...card, padding: 0, overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }} id="sc-table">
      <thead><tr style={{ background: "var(--s2)", color: "var(--t3)", fontSize: 10.5 }}><th style={{ padding: "7px 9px", textAlign: "left" }}>Trend \ price</th>
        {home.cols.map(c => <th key={c} style={{ padding: "7px 9px", textAlign: "right" }}>{c}</th>)}</tr></thead>
      <tbody>{home.rows.map((r, i) => <tr key={r} style={{ borderTop: "1px solid var(--b1)" }}><td style={{ padding: "6px 9px", fontWeight: 700 }}>{r}</td>
        {home.p_values.map((x, j) => { const s = cell(home.t_values[i], x, p), s0 = cell(home.t_values[i], x, live), cut = +p.cut || 24;
          const tone = s >= cut ? "var(--long)" : s <= -cut ? "var(--short)" : "var(--t2)";
          return <td key={j} data-cell={`${i}-${j}`} style={{ padding: "6px 9px", textAlign: "right", fontFamily: "var(--mono)", color: tone }}
            title={word(s, cut)}><b>{s}</b>{s !== s0 && <small style={{ color: "var(--t3)", marginLeft: 4 }}>({sg(s - s0)})</small>}
            <div style={{ fontSize: 10, color: "var(--t3)", fontFamily: "var(--sans)" }}>{word(s, cut)}</div></td>; })}</tr>)}</tbody></table></div>;
}

function Bars({ cur, nw }) {
  const tot = Math.max(1, cur.reduce((a, b) => a + b, 0), nw.reduce((a, b) => a + b, 0));
  const bar = (v, c) => <span style={{ display: "inline-block", height: 8, width: `${v / tot * 100}%`, background: c, borderRadius: 2 }}/>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 120 }}>
    <span style={{ display: "flex", gap: 1 }} title={`Live: ${cur.join(" / ")}`}>{bar(cur[0], "var(--long)")}{bar(cur[1], "var(--mixed)")}{bar(cur[2], "var(--short)")}</span>
    <span style={{ display: "flex", gap: 1, opacity: .75 }} title={`This set: ${nw.join(" / ")}`}>{bar(nw[0], "var(--long)")}{bar(nw[1], "var(--mixed)")}{bar(nw[2], "var(--short)")}</span></div>;
}

function Compare({ res }) {
  const [open, setOpen] = useState(null), [hz, setHz] = useState("30");
  if (!res.days) return <div style={{ color: "var(--t3)", fontSize: 12.5 }}>No stored day has its factors yet — the worker is preparing them.</div>;
  const l = res.series[0], d = i => l.new[i] - l.cur[i];
  const bt = res.backtest[hz];
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }} id="sc-res">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
      {[0, 1, 2].map(i => <div key={i} style={card} data-count={i}><div style={{ ...lbl, color: [COLOUR[1], COLOUR[0], COLOUR[-1]][i][1] }}>{["Green", "Amber", "Red"][i]} · {l.date}</div>
        <b style={{ fontSize: 20 }}>{l.new[i].toLocaleString("en-IN")}</b> <small style={{ color: d(i) > 0 ? "var(--long)" : d(i) < 0 ? "var(--short)" : "var(--t3)" }}>{d(i) ? sg(d(i)) : "no change"}</small>
        <div style={{ fontSize: 11, color: "var(--t3)" }}>live: {l.cur[i].toLocaleString("en-IN")}</div></div>)}
    </div>
    <div style={card}><div style={lbl}>Colour changes on {l.date} (rows: live · columns: this set)</div>
      <table style={{ borderCollapse: "collapse", fontSize: 12, marginTop: 6 }} id="sc-trans"><thead><tr><th/>{["Green", "Amber", "Red"].map(h => <th key={h} style={{ padding: "4px 12px" }}>{h}</th>)}</tr></thead>
        <tbody>{res.transitions.map((r, i) => <tr key={i}><td style={{ padding: "4px 8px", fontWeight: 700 }}>{["Green", "Amber", "Red"][i]}</td>
          {r.map((v, j) => <td key={j} style={{ padding: "4px 12px", textAlign: "right", fontFamily: "var(--mono)", fontWeight: i === j ? 400 : 800, color: i === j ? "var(--t2)" : v ? "var(--acc)" : "var(--t3)" }}>{v}</td>)}</tr>)}</tbody></table></div>
    <div style={card}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={lbl}>Back-test — how each colour did afterwards, vs all stocks of the same day</div>
      <div style={{ display: "flex", gap: 6 }}>{Object.keys(res.backtest).map(h => <button key={h} type="button" style={btn(hz === h)} onClick={() => setHz(h)}>{h} days</button>)}</div></div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 6 }} id="sc-bt"><thead><tr style={{ color: "var(--t3)", fontSize: 10.5 }}>
        <th style={{ textAlign: "left", padding: 4 }}>Colour</th><th style={{ textAlign: "right" }}>Examples (live · set)</th><th style={{ textAlign: "right" }}>Vs market (live · set)</th>
        <th style={{ textAlign: "right" }}>Beat the market (live · set)</th></tr></thead>
        <tbody>{["1", "0", "-1"].map(k => { const a = bt.cur[k], b = bt.new[k]; return <tr key={k} style={{ borderTop: "1px solid var(--b1)" }}>
          <td style={{ padding: 4, fontWeight: 700, color: COLOUR[k][1] }}>{COLOUR[k][0]}</td>
          <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{a.n} · {b.n}</td>
          <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{pc(a.excess)} · <b>{pc(b.excess)}</b></td>
          <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{a.beat == null ? "—" : `${a.beat}%`} · <b>{b.beat == null ? "—" : `${b.beat}%`}</b></td></tr>; })}</tbody></table>
      <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 6 }}>A good set: green well above the market, red well below. Only days whose {hz} days have passed count; more stored days = a firmer answer.</div></div>
    <div style={card}><div style={lbl}>The biggest movers on {l.date} — click one for its periods</div>
      {!res.movers.length ? <div style={{ fontSize: 12.5, color: "var(--t3)", marginTop: 6 }}>No stock changes with this set.</div>
        : <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }} id="sc-movers">{res.movers.map(m => <div key={m.s} style={{ borderTop: "1px solid var(--b1)" }}>
          <button type="button" onClick={() => setOpen(open === m.s ? null : m.s)} data-mover={m.s} style={{ all: "unset", cursor: "pointer", display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, width: "100%", padding: "5px 0", fontSize: 12.5 }}>
            <b style={{ fontFamily: "var(--mono)" }}>{m.s}</b><span style={{ fontFamily: "var(--mono)" }}>{sg(m.cur)} → <b>{sg(m.new)}</b></span>
            <span style={{ color: COLOUR[m.new_c] ? COLOUR[m.new_c][1] : "var(--t3)", fontWeight: 700 }}>{(COLOUR[m.cur_c] || ["—"])[0]} → {(COLOUR[m.new_c] || ["—"])[0]}</span></button>
          {open === m.s && <table style={{ width: "100%", fontSize: 11.5, marginBottom: 6 }}><tbody>{m.per.map(t => <tr key={t.tf}><td style={{ padding: "2px 6px", fontWeight: 700 }}>{{ M: "Month", Q: "Quarter", Y: "Year" }[t.tf]}</td>
            <td>{t.trend == null ? "no reading" : TRENDW[t.trend]}</td><td>{t.place ? t.place.replace("_", " ") : ""}{t.nr ? ` · mother candle ${t.nr > 0 ? "breakout" : "breakdown"} ${Math.abs(t.nr)}` : ""}</td>
            <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{sg(t.cur)} → <b>{sg(t.new)}</b></td></tr>)}
            {m.ladder && m.ladder.new && <tr><td colSpan={4} style={{ padding: "4px 6px", color: "var(--t2)" }} data-mladder={m.s}><b>Zone ladder:</b>{" "}
              {m.ladder.new.length ? m.ladder.new.map(([c, v]) => `${ladderWords(c)} (${v > 0 ? "+" : ""}${v})`).join(" · ") : "nothing confirmed — adds 0"}</td></tr>}</tbody></table>}</div>)}</div>}</div>
    <div style={card}><div style={lbl}>Each stored day (live · this set)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, maxHeight: 260, overflowY: "auto" }} id="sc-series">{res.series.map(x => <div key={x.at}
        style={{ display: "grid", gridTemplateColumns: "92px 1fr 150px", gap: 10, alignItems: "center", fontSize: 11.5 }}><span>{x.date}</span><Bars cur={x.cur} nw={x.new}/>
        <span style={{ fontFamily: "var(--mono)", color: "var(--t2)" }}>{x.new[0]}/{x.new[1]}/{x.new[2]} <small style={{ color: "var(--t3)" }}>({x.cur.join("/")})</small></span></div>)}</div></div>
  </div>;
}

export function ScoringTab({ api, notify }) {
  const [home, setHome] = useState(null), [sel, setSel] = useState(null), [edit, setEdit] = useState(null), [name, setName] = useState("");
  const [days, setDays] = useState(30), [res, setRes] = useState(null), [busy, setBusy] = useState(""), [ask, setAsk] = useState(false);
  const say = (m, t = "ok") => notify && notify(m, t);
  const load = (pick) => api("/api/admin/scoring").then(h => { setHome(h);
    const p = h.profiles.find(x => x.id === (pick ?? sel)) || h.profiles.find(x => x.status === "active");
    if (p && (pick != null || !sel)) { setSel(p.id); setEdit(p.params); setName(p.name); setRes(null); } }).catch(e => say(e.message, "error"));
  useEffect(() => { load(); }, []);
  useEffect(() => {                                   // the rescoring progress, every few seconds while something is left
    if (!home || !home.status.pending) return undefined;
    const t = setInterval(() => api("/api/admin/scoring/status").then(s => setHome(h => h && { ...h, status: s })).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [home && home.status.pending]);
  const prof = home && home.profiles.find(x => x.id === sel), live = home && home.profiles.find(x => x.status === "active");
  const ro = !prof || prof.builtin || prof.status !== "draft";
  const dirty = prof && edit && (!same(edit, prof.params) || name !== prof.name);
  const pick = p => { setSel(p.id); setEdit(p.params); setName(p.name); setRes(null); setAsk(false); };
  const create = (from, nm) => api("/api/admin/scoring/profiles", { method: "POST", json: { name: `${nm || "New score set"} ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`, params: from } })
    .then(p => { say("Draft created"); load(p.id); }).catch(e => say(e.message, "error"));
  const save = () => api(`/api/admin/scoring/profiles/${sel}`, { method: "PATCH", json: { name, params: edit } }).then(() => { say("Saved"); load(sel); }).catch(e => say(e.message, "error"));
  const dup = () => api(`/api/admin/scoring/profiles/${sel}/duplicate`, { method: "POST" }).then(p => { say("Copied — a draft you can change"); load(p.id); }).catch(e => say(e.message, "error"));
  const del = () => { if (!window.confirm(`Delete the draft "${prof.name}"?`)) return;
    api(`/api/admin/scoring/profiles/${sel}`, { method: "DELETE" }).then(() => { say("Deleted"); setSel(null); load(live && live.id); }).catch(e => say(e.message, "error")); };
  const compare = () => { setBusy("compare"); api("/api/admin/scoring/compare", { method: "POST", json: { params: edit, days } })
    .then(setRes).catch(e => say(e.message, "error")).finally(() => setBusy("")); };
  const apply = () => { setBusy("apply"); setAsk(false); api(`/api/admin/scoring/profiles/${sel}/apply`, { method: "POST" })
    .then(r => { say(`Live now. Today's view is rescored; ${r.status.pending ? `${r.status.pending} stored outputs follow in the background` : "every stored day follows"}.`); load(sel); })
    .catch(e => say(e.message, "error")).finally(() => setBusy("")); };
  if (!home) return <div style={{ padding: 22, color: "var(--t3)" }}>Loading…</div>;
  const st = home.status;
  const tag = p => p.status === "active" ? ["Live", "var(--long)"] : p.builtin ? ["Default", "var(--acc)"] : p.status === "archived" ? ["Was live", "var(--t3)"] : ["Draft", "var(--mixed)"];
  return (
    <div style={{ padding: "16px 22px 30px", display: "flex", flexDirection: "column", gap: 14 }} id="sc-root">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div><div style={{ fontSize: 18, fontWeight: 800 }}>🎚 Scoring</div>
          <div style={{ fontSize: 12.5, color: "var(--t2)", marginTop: 3, maxWidth: 900, lineHeight: 1.5 }}>The numbers of the strength engine (the Zone Engine Review sheet): trend steps, the trend / price split,
            the Quarter · Year · Month weights, the colour cut, the mother candle points and the regime squeeze. Keep any number of score sets, compare one with the live set on the stored days,
            then apply it — today's view at once, every past day in the background. Customers' saved portfolios keep their price tracking; past alerts stay as they were.</div></div>
      </div>
      <div style={{ ...card, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", fontSize: 12.5 }} id="sc-status">
        <span><span style={lbl}>Live</span> <b>{live ? live.name : "—"}</b>{live && live.applied_at ? <small style={{ color: "var(--t3)" }}> · since {fmtDT(live.applied_at)}{live.applied_by ? ` by ${live.applied_by}` : ""}</small> : null}</span>
        <span><span style={lbl}>Past days</span> <b>{st.history.done}</b> of {st.history.days} rescored</span>
        <span><span style={lbl}>Stock states</span> {st.states.old ? <b style={{ color: "var(--mixed)" }}>{st.states.old} collections to go</b> : <b>up to date</b>}</span>
        <span><span style={lbl}>Factors</span> {st.factors.stock} of {st.factors.collections} collections · {(st.factors.bytes / 1048576).toFixed(1)} MB</span>
        {st.pending > 0 ? <b style={{ color: "var(--acc)" }} id="sc-pending">⟳ Rescoring… {st.pending} left</b> : <b style={{ color: "var(--long)" }} id="sc-done">✓ Everything uses the live set</b>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 260px) minmax(0, 1.25fr) minmax(0, 1fr)", gap: 14, alignItems: "start" }} className="sc-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" style={btn()} id="sc-new-live" onClick={() => create(live.params)}>＋ From the live set</button>
            <button type="button" style={btn()} id="sc-new-default" onClick={() => create(home.defaults)}>＋ From Default</button>
            <button type="button" style={btn()} id="sc-new-ladder" onClick={() => create({ ...home.defaults, model: "ladder" }, "Zone ladder")}>＋ Zone ladder</button></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }} id="sc-list">{home.profiles.map(p => { const [t, c] = tag(p); return (
            <button key={p.id} type="button" data-prof={p.id} onClick={() => pick(p)} style={{ all: "unset", cursor: "pointer", ...card, padding: "9px 11px",
              borderColor: p.id === sel ? "var(--acc)" : "var(--b1)", boxShadow: p.id === sel ? "0 0 0 1px var(--acc)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><b style={{ fontSize: 13 }}>{p.name}</b><span style={{ fontSize: 10.5, fontWeight: 800, color: c }}>{t}</span></div>
              <div style={{ fontSize: 11, color: "var(--acc)", fontWeight: 700 }}>{(p.params.model || "default") === "ladder" ? "Zone ladder model" : "Default model"}</div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>{p.status === "archived" && p.retired_at ? `Live until ${fmtDT(p.retired_at)}` : `Changed ${fmtDT(p.updated_at)}`}{p.created_by && p.created_by !== "system" ? ` · ${p.created_by}` : ""}</div>
            </button>); })}</div>
        </div>
        {prof && edit && <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={name} disabled={ro} onChange={e => setName(e.target.value)} maxLength={60} id="sc-name" aria-label="Name"
              style={{ ...inp, width: 240, textAlign: "left", fontFamily: "var(--sans)", fontWeight: 700, fontSize: 13.5 }}/>
            {ro ? <span style={{ fontSize: 11.5, color: "var(--t3)" }}>{prof.builtin ? "The built-in Default stays as it is." : prof.status === "active" ? "The live set stays as it is." : "It was live, so it stays as it was."} Copy it to change it.</span>
              : <span style={{ fontSize: 11.5, color: dirty ? "var(--mixed)" : "var(--t3)" }}>{dirty ? "Not saved yet" : "Draft · saved"}</span>}
            <span style={{ flex: 1 }}/>
            {!ro && <button type="button" style={btn(true)} disabled={!dirty} onClick={save} id="sc-save">Save draft</button>}
            <button type="button" style={btn()} onClick={dup} id="sc-dup">Copy</button>
            {!ro && <button type="button" style={btn(false, "danger")} onClick={del} id="sc-del">Delete</button>}
          </div>
          <Editor p={edit} def={home.defaults} ro={ro} set={setEdit}/>
          <div style={{ ...lbl, marginTop: 6 }}>The Period table — every trend × price place (changes from the live set in brackets){edit.model === "ladder" ? " · the zone ladder: the price place earns nothing" : ""}</div>
          <PeriodTable p={edit} live={live.params} home={home}/>
        </div>}
        {prof && edit && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...card, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <b style={{ fontSize: 13 }}>Compare with the live set</b><span style={{ flex: 1 }}/>
            <select value={days} onChange={e => setDays(+e.target.value)} style={{ ...btn(), fontWeight: 600 }} id="sc-days">
              {[7, 30, 60, home.days_max].map(d => <option key={d} value={d}>last {d} stored days</option>)}</select>
            <button type="button" style={btn(true)} onClick={compare} disabled={busy === "compare"} id="sc-compare">{busy === "compare" ? "Comparing…" : "Compare"}</button>
            {prof.status !== "active" && <button type="button" style={{ ...btn(), borderColor: "var(--long)", color: "var(--long)" }} disabled={dirty || busy === "apply"} onClick={() => setAsk(true)}
              id="sc-apply" title={dirty ? "Save the draft first" : "Make it live: today at once, every past day in the background"}>{busy === "apply" ? "Applying…" : "Apply to all data"}</button>}
          </div>
          {res ? <Compare res={res}/> : <div style={{ ...card, color: "var(--t3)", fontSize: 12.5 }}>Press Compare: the stored days are scored with this set and with the live set, side by side —
            from each day's stored factors, in about a second.</div>}
        </div>}
      </div>
      {ask && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", zIndex: 200, padding: 16 }} onClick={() => setAsk(false)}>
        <div style={{ ...card, maxWidth: 480, padding: 20, display: "flex", flexDirection: "column", gap: 12 }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Apply" id="sc-confirm">
          <b style={{ fontSize: 15 }}>Make "{prof.name}" live?</b>
          <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.55 }}>Today's view is rescored now — customers see the new colours within seconds. Every stored past day, the stock states and
            the strength evidence follow in the background ({st.history.days} days). Customers' saved portfolios keep their price tracking; alerts already sent stay as they were.
            You can go back at any time by applying the previous set (or Default).</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" style={btn()} onClick={() => setAsk(false)}>Cancel</button>
            <button type="button" style={btn(true)} onClick={apply} id="sc-confirm-yes">Apply to all data</button></div></div></div>}
      <style>{"@media (max-width: 1100px){ #sc-root .sc-grid{ grid-template-columns: 1fr !important; } }"}</style>
    </div>);
}
