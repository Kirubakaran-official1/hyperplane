// Hyperplane ETF Analyser — a lazily loaded application module. Grouped sections (owner, 2026-11-06: "top picks is not
// needed … grouped sections"): the branded band with the AI market read, a search + trend filter, then one section per
// type (Commodities · Broad market · Sectors & themes · Strategy · International). Round 8 (owner 2026-11-07): the table shows
// EVERY ETF by default; the "Best in segment" button narrows it to one row per market (its best ETF). A row opens the card
// with a plain-word description of the ETF and every other ETF of its market. The server (backend/app/etf.py) reads every tradable ETF with the same long-term engine as the stocks and
// picks, per market, the most traded ETF with the longest record. No prices, zones or formulas are shown.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AiSpark, BrandBand, CopyBtns, GroupRow, Icon, Info, addCss, api, dirVal, signed, tc, trendWordOf, useAsOf } from "../core.jsx";
import { CSS } from "./etf.css.js";
import { aboutMarket, aboutShort } from "./etf-about.js";

addCss("etf", CSS);

const SECTIONS = [["Commodities", ["Gold", "Silver"], "diamond"], ["Broad market", ["Broad market"], "layers"], ["Sectors & themes", ["Sector & theme"], "chart"],
  ["Strategy", ["Strategy"], "sparkles"], ["International", ["International"], "globe"]];
const inr = v => v == null ? "—" : v >= 1e7 ? `₹${(v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: v >= 1e9 ? 0 : 1 })} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)} L` : `₹${Math.round(v).toLocaleString("en-IN")}`;
const inr2 = v => v == null ? "—" : `₹${(+v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const plus = v => v == null ? "—" : `${v > 0 ? "+" : ""}${signed(v)}`;
const EASE = { "Very high": "Very easy", High: "Easy", Moderate: "Fairly easy", Low: "Harder", "Very low": "Hard" };
const dir = v => v == null ? null : dirVal(v);
const toneOf = v => dir(v) === 1 ? "good" : dir(v) === -1 ? "bad" : "mid";
const VERDICT = { good: "Long-term uptrend", mid: "No clear direction", bad: "Long-term downtrend" };
const PHRASE = { good: "in a long-term uptrend", mid: "moving sideways", bad: "in a long-term downtrend" };
const TF_WORD = ["Months", "Quarters", "Years"], TREND_WORD = { "c-good": "rising", "c-bad": "falling", "c-side": "sideways" };
// M · Q · Y in colour (owner round 5): green rising, red falling, grey sideways
const ARROW = v => v == null ? ["–", "c-side"] : dir(v) === 1 ? ["▲", "c-good"] : dir(v) === -1 ? ["▼", "c-bad"] : ["◆", "c-side"];
const tfWord = v => v == null ? "—" : dir(v) === 1 ? "Rising" : dir(v) === -1 ? "Falling" : "Sideways";
const gkey = (k, u) => `${k}|${u}`;
const I = {
  app: "An ETF is one share that follows a whole market — gold, the Nifty 50, a sector. ★ = the best ETF to buy for that market: the most traded, with a long record.",
  strength: "−100 to +100. Above +24 = going up. Below −24 = going down.",
};

function Strength({ v, big }) {
  if (v == null) return <span className="ef-na">Too new</span>;
  const w = `${Math.min(100, Math.abs(v)) / 2}%`;
  return (
    <span className={`ef-st ${big ? "big" : ""} ${tc(v)}`} title={`Long-term strength ${plus(v)} (−100 to +100)`}>
      <span className="ef-bar" aria-hidden="true"><i style={v >= 0 ? { left: "50%", width: w } : { right: "50%", width: w }}/></span>
      <b>{plus(v)}</b><small>{trendWordOf(v)}</small>
    </span>);
}

// how much of the ETF changes hands on a normal day (rupees) with the plain word under it: the money you can buy or sell without moving the price
const Vol = ({ e }) => <span className="ef-vol" title={e.v ? `About ${inr(e.v)} is bought and sold on a normal day${e.e ? " (it varies a lot from day to day)" : ""}` : "Not known"}><b>{e.v ? inr(e.v) : "—"}</b><small>{EASE[e.lq] || "—"} to trade</small></span>;
const Arrows = ({ e }) => <span className="ef-arr">{[0, 1, 2].map(k => { const [a, c] = ARROW(e.tf && e.tf[k]); return <i key={k} className={c} title={`${TF_WORD[k]}: ${TREND_WORD[c]}`}><small>{"MQY"[k]}</small>{a}</i>; })}</span>;

function etfTake(e, best) {
  const t = e.st == null ? "is too new for a long-term reading" : `is ${PHRASE[toneOf(e.st)]}`;
  if (e.r) return `${e.s} ${t}, and it is the best ${e.u} ETF to buy: the most traded, with a long record.`;
  return `${e.s} ${t}. It follows ${e.u} like ${best ? best.s : "the others"}, but ${best ? `${best.s} is ${(EASE[best.lq] || "easier").toLowerCase()} to trade — the better buy` : "none trades enough to be recommended"}.`;
}

// the side panel: the full ETF card
function Panel({ e, group, onPick, onClose }) {
  const best = group && group.best, peers = (group ? group.items : []).filter(p => p.s !== e.s);
  const t = toneOf(e.st);
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.scrollTo({ top: 0, behavior: "smooth" }); }, [e.s]);   // a picked ETF starts at the top
  return (
    <div className="overlay ef-ov" onClick={onClose}>
      <aside className="ef-panel" role="dialog" aria-label={`${e.s} ETF`} id="ef-panel" ref={box} onClick={x => x.stopPropagation()}>
        <div className="ef-ph">
          <div><div className="px-eyebrow"><AiSpark/> Hyperplane AI · ETF card</div>
            <h2>{e.s} <small>{e.n !== e.s ? e.n : ""}</small></h2>
            <div className="ef-tags"><span>{e.k} · {e.u}</span>{e.r && <span className="rec"><Icon name="star" size={11}/> Best {e.u} ETF</span>}</div></div>
          <button className="x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button>
        </div>
        <section className="ef-about" id="ef-about">
          <span className="px-label">About this ETF</span>
          <p><b>{e.n}</b>{e.n !== e.s ? <> (<span className="sym">{e.s}</span>)</> : null} follows <b>{e.u}</b>. {aboutMarket(e.u, e.k)}</p>
          <ul>
            <li><b>What you buy:</b> one unit costs about {inr2(e.p)}. A unit is the smallest amount you can buy, and you can buy as many as you like.</li>
            <li><b>Buying and selling:</b> {EASE[e.lq] ? EASE[e.lq].toLowerCase() : "not known"}{e.v ? `, about ${inr(e.v)} traded on a normal day${e.e ? " (it varies a lot from day to day)" : ""}` : ""}.</li>
            <li><b>Record:</b> {e.y ? `${Math.floor(e.y)} year${Math.floor(e.y) === 1 ? "" : "s"} of prices` : "too new for a long record"}.</li>
            <li><b>Among its market:</b> {group ? `one of ${group.items.length} ETF${group.items.length === 1 ? "" : "s"} that follow ${e.u}${e.r ? "; the one we recommend" : best ? `; we recommend ${best.s}` : ""}` : "—"}.</li>
          </ul>
        </section>
        <p className="ef-take"><AiSpark/> {etfTake(e, best)}</p>
        <div className={`ef-verdict t-${t}`}><div className="ef-vt">{e.st == null ? "Too new to read" : VERDICT[t]} <Info text={I.strength}/></div><Strength v={e.st} big/></div>
        <div className="ef-facts">
          <div className="ef-fact"><span className="px-label">Trend over time</span>
            <div className="ef-tfs">{["Months", "Quarters", "Years"].map((l, i) => <span key={l} className={tc(e.tf && e.tf[i])}><small>{l}</small><b>{tfWord(e.tf && e.tf[i])}</b></span>)}</div></div>
          <div className="ef-fact"><span className="px-label">Overall direction</span><b className={e.rg === 1 ? "c-good" : e.rg === -1 ? "c-bad" : ""}>{e.rg === 1 ? "Up" : e.rg === -1 ? "Down" : "Flat"}</b></div>
          <div className="ef-fact"><span className="px-label">Easy to trade</span><b>{EASE[e.lq] || "—"}</b><small>{e.v ? `~${inr(e.v)} a day${e.e ? " · uneven" : ""}` : ""}</small></div>
          <div className="ef-fact"><span className="px-label">Track record</span><b>{e.y ? `${Math.floor(e.y)}+ years` : "—"}</b></div>
        </div>
        {e.r ? <div className="ef-recbox"><span className="ef-badge"><Icon name="star" size={12}/> Recommended for {e.u}</span><span>{e.why}</span></div>
             : e.wn && <div className="ef-notrec"><Icon name="info" size={14}/><span>{e.wn}</span></div>}
        <div className="ef-buy" id="ef-buy"><Icon name="info" size={14}/><span><b>How to buy:</b> in Zerodha Kite (India's largest broker, zero brokerage on delivery) search <b>{e.s}</b> on NSE →
          Buy, or choose <b>SIP</b> to buy it every month. Any broker works.</span></div>
        {peers.length > 0 && <div className="ef-peers"><span className="px-label">Also follow {e.u} · {peers.length}</span>
          {peers.map(p => (
            <button key={p.s} type="button" className="ef-peer" onClick={() => onPick(p)}>
              <span><b>{p.s}</b>{p.r && <span className="ef-badge sm"><Icon name="star" size={11}/> Best</span>}<small>{EASE[p.lq] || "—"} to trade</small></span><Strength v={p.st}/>
            </button>))}</div>}
      </aside>
    </div>);
}

function EtfView({ onOut }) {
  const [d, setD] = useState(null), [err, setErr] = useState("");
  useEffect(() => {
    api("/app/api/etf").then(setD).catch(e => { if (e.status === 401) onOut(e.message); else setErr(e.message || "Could not load the ETFs."); });
  }, []);
  useAsOf("etf", d && d.as_of);
  const [trend, setTrend] = useState("all"), [q, setQ] = useState(""), [shut, setShut] = useState(() => new Set());
  const [only, setOnly] = useState(false);                     // false = every ETF · true = the best ETF of each market (a segment)
  const [open, setOpenRaw] = useState(null);
  // the panel adds a browser history step, so Back closes it
  const setOpen = e => { setOpenRaw(e); try { if (e) window.history.pushState({ ...(window.history.state || {}), efp: e.s }, ""); } catch { /* ignore */ } };
  const close = () => { if (window.history.state && window.history.state.efp) window.history.back(); else setOpenRaw(null); };
  useEffect(() => {
    const pop = () => setOpenRaw(null);
    const key = e => e.key === "Escape" && close();
    window.addEventListener("popstate", pop); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("popstate", pop); window.removeEventListener("keydown", key); };
  }, []);

  const groups = useMemo(() => {
    if (!d) return [];
    const m = new Map();
    for (const e of d.etfs) { const k = gkey(e.k, e.u); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    for (const l of m.values()) l.sort((a, b) => (b.r || 0) - (a.r || 0) || (b.st ?? -999) - (a.st ?? -999));
    return (d.groups || []).map(g => { const items = m.get(gkey(g.k, g.u)) || []; return { ...g, key: gkey(g.k, g.u), items, best: items.find(e => e.r) || items[0] || null }; })
      .filter(g => g.best);
  }, [d]);
  const byKey = useMemo(() => new Map(groups.map(g => [g.key, g])), [groups]);

  if (err) return <div className="ef"><section className="card ef-empty" role="alert"><Icon name="info" size={18}/>{err}</section></div>;
  if (!d) return <div className="ef"><section className="card ef-empty"><AiSpark/> Hyperplane AI is reading the ETFs…</section></div>;

  const bests = groups.map(g => g.best).filter(e => e.st != null);
  const up = bests.filter(e => dir(e.st) === 1).length, down = bests.filter(e => dir(e.st) === -1).length, side = bests.length - up - down;
  const n = q.trim().toLowerCase();
  // a market row shows its best ETF; a search for another ETF of the market shows (and opens) that one
  const rowOf = g => {
    const hit = n ? g.items.find(e => `${e.s} ${e.n}`.toLowerCase().includes(n)) : null;
    if (n && !hit && !g.u.toLowerCase().includes(n)) return null;
    const e = hit || g.best;
    if (trend !== "all" && (g.best.st == null || toneOf(g.best.st) !== trend)) return null;
    return { g, e };
  };
  // every ETF of a market (best first), narrowed by the search and the trend filter
  const rowsOf = g => g.items.filter(e => (!n || `${e.s} ${e.n} ${g.u}`.toLowerCase().includes(n)) && (trend === "all" || (e.st != null && toneOf(e.st) === trend))).map(e => ({ g, e }));
  const known = SECTIONS.flatMap(([, ks]) => ks);
  const secs = [...SECTIONS, ["Other", (d.classes || []).filter(c => !known.includes(c)), "list"]]
    .map(([title, ks, icon]) => ({ title, icon, rows: only ? groups.filter(g => ks.includes(g.k)).map(rowOf).filter(Boolean) : groups.filter(g => ks.includes(g.k)).flatMap(rowsOf) })).filter(x => x.rows.length);
  const nShown = secs.reduce((t, x) => t + x.rows.length, 0);
  const toggle = t => setShut(o => { const x = new Set(o); x.has(t) ? x.delete(t) : x.add(t); return x; });
  const SEC_COL = { Commodities: "#d4a72c", "Broad market": "var(--acc)", "Sectors & themes": "#8b5cf6", Strategy: "var(--mx-m)", International: "var(--mx-l)", Other: "var(--mx-c)" };

  // the types (the table's groups), counted on every ETF whatever the search / trend filter says
  const typeStats = [...SECTIONS, ["Other", (d.classes || []).filter(c => !known.includes(c)), "list"]].map(([title, ks]) => {
    const gs = groups.filter(g => ks.includes(g.k)), bs = gs.map(g => g.best).filter(e => e.st != null);
    const u = bs.filter(e => dir(e.st) === 1).length, dn = bs.filter(e => dir(e.st) === -1).length;
    return { title, markets: gs.length, etfs: gs.reduce((t, g) => t + g.items.length, 0), up: u, down: dn, side: bs.length - u - dn };
  }).filter(t => t.markets);
  const goType = t => { setQ(""); setTrend("all"); setShut(o => { const x = new Set(o); x.delete(t); return x; });
    setTimeout(() => { const el = document.getElementById(`ef-grp-${t.replace(/[^a-z]/gi, "")}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60); };

  return (
    <div className="ef">
      <BrandBand product="ETF Analyser" title="The best ETF" accent="for every market" info={I.app}
        sub={<><AiSpark/> {up} markets up · {side} sideways · {down} down <span className="ef-sub2">· {d.etfs.length} ETFs in {groups.length} markets</span></>}/>

      {/* owner round 7: "stats on the different types of ETF and how many ETFs there are inside each" */}
      <section className="ef-stats" id="ef-stats" aria-label="ETFs by type">
        <div className="ef-stat ef-stat-all"><span className="px-label">{only ? "Best ETFs" : "All ETFs"}</span><b>{only ? groups.length : d.etfs.length}</b><small>{only ? "one for each market" : `in ${groups.length} markets`}</small>
          <span className="ef-sbar" aria-hidden="true"><i className="up" style={{ flexGrow: up }}/><i className="sd" style={{ flexGrow: side }}/><i className="dn" style={{ flexGrow: down }}/></span></div>
        {typeStats.map(t => (
          <button type="button" key={t.title} className="ef-stat" data-type={t.title} onClick={() => goType(t.title)} style={{ "--c": SEC_COL[t.title] }}>
            <span className="px-label"><i/>{t.title}</span><b>{only ? t.markets : t.etfs}</b><small>{only ? `best ETF${t.markets === 1 ? "" : "s"}, one per market` : `ETFs in ${t.markets} market${t.markets === 1 ? "" : "s"}`}</small>
            <span className="ef-sbar" aria-hidden="true"><i className="up" style={{ flexGrow: t.up }}/><i className="sd" style={{ flexGrow: t.side }}/><i className="dn" style={{ flexGrow: t.down }}/></span>
            <em><span className="up">▲ {t.up}</span><span>◆ {t.side}</span><span className="dn">▼ {t.down}</span></em></button>))}
      </section>

      <section className="card ef-tcard" id="ef-table">
        <div className="hp-tbar">
          <input className="search ef-q" placeholder="Search an ETF or a market" value={q} onChange={e => setQ(e.target.value)} aria-label="Search a market or an ETF"/>
          <div className="ef-seg" role="group" aria-label="Trend">{[["all", "All"], ["good", "▲ Up"], ["mid", "◆ Sideways"], ["bad", "▼ Down"]].map(([k, l]) => (
            <button key={k} type="button" className={trend === k ? "on" : ""} onClick={() => setTrend(k)} id={`ef-t-${k}`}>{l}</button>))}</div>
          <button type="button" className={`ef-bestbtn ${only ? "on" : ""}`} id="ef-best" aria-pressed={only} onClick={() => setOnly(v => !v)}
            title="Show only the best ETF of each market"><Icon name="star" size={13}/> Best in segment<em>{groups.length}</em></button>
          <span className="ef-hint">{only ? <><Icon name="star" size={12}/> = the best ETF of the market</> : <>{nShown} of {d.etfs.length} ETFs · <Icon name="star" size={12}/> = best of its market</>} <Info text={I.app}/></span>
          <button type="button" className="hp-gall" onClick={() => setShut(o => o.size ? new Set() : new Set(secs.map(x => x.title)))} id="ef-gall">{shut.size ? "Show all groups" : "Collapse all groups"}</button>
        </div>
        <div className="hp-tw"><table className={`hp-t ${only ? "" : "ef-all"}`}>
          <thead>{only ? <tr><th>Market · best ETF</th><th>Long-term strength</th><th>M · Q · Y</th><th className="num">Traded a day</th><th className="num">ETFs</th></tr>
            : <tr><th>ETF</th><th>Market · what it is</th><th>Long-term strength</th><th>M · Q · Y</th><th className="num">Traded a day</th><th className="num">Price</th></tr>}</thead>
          <tbody>{secs.map(sec => <React.Fragment key={sec.title}>
            <GroupRow cols={only ? 5 : 6} open={!shut.has(sec.title)} onToggle={() => toggle(sec.title)} color={SEC_COL[sec.title]} label={sec.title} id={`ef-grp-${sec.title.replace(/[^a-z]/gi, "")}`}
              meta={<><span>{only ? `${sec.rows.length} market${sec.rows.length === 1 ? "" : "s"}` : `${sec.rows.length} ETF${sec.rows.length === 1 ? "" : "s"}`}</span>
                <span className="up">▲ {sec.rows.filter(r => dir(only ? r.g.best.st : r.e.st) === 1).length}</span>
                <span>◆ {sec.rows.filter(r => (only ? r.g.best.st : r.e.st) != null && dir(only ? r.g.best.st : r.e.st) === 0).length}</span>
                <span className="dn">▼ {sec.rows.filter(r => dir(only ? r.g.best.st : r.e.st) === -1).length}</span></>}/>
            {!shut.has(sec.title) && sec.rows.map(({ g, e }) => only ? (
              <tr key={g.key} className={`hp-row ef-mrow t-${toneOf(e.st)}`} onClick={() => setOpen(e)} data-group={g.u} data-sym={e.s} data-sec={sec.title}>
                <td><b>{g.u}</b><span className="sub ef-what">{aboutShort(g.u, g.k)}</span><span className="sub">{e.r && <Icon name="star" size={11}/>} <span className="sym">{e.s}</span>{e.n !== e.s ? ` · ${e.n}` : ""}</span></td>
                <td><Strength v={e.st}/></td>
                <td><Arrows e={e}/></td>
                <td className="num"><Vol e={e}/></td>
                <td className="num">{g.items.length}</td>
              </tr>) : (
              <tr key={e.s} className={`hp-row ef-mrow ef-erow t-${toneOf(e.st)}`} onClick={() => setOpen(e)} data-group={g.u} data-sym={e.s} data-sec={sec.title}>
                <td><span className="ef-tk">{e.r && <Icon name="star" size={11}/>}<span className="sym">{e.s}</span></span>{e.n !== e.s && <span className="sub">{e.n}</span>}</td>
                <td className="ef-mkt"><b>{g.u}</b><span className="sub">{aboutShort(g.u, g.k)}</span></td>
                <td><Strength v={e.st}/></td>
                <td><Arrows e={e}/></td>
                <td className="num"><Vol e={e}/></td>
                <td className="num">{inr2(e.p)}</td>
              </tr>))}
          </React.Fragment>)}</tbody>
        </table></div>
        <div className="ef-foot"><span>{only ? "Tickers of the best ETFs shown" : "Tickers of the ETFs shown"}</span><CopyBtns syms={secs.flatMap(x => x.rows.map(r => r.e.s))}/></div>
      </section>
      {!secs.length && <section className="card ef-none" id="ef-none">No ETF matches.</section>}
      {open && <Panel e={open} group={byKey.get(gkey(open.k, open.u))} onPick={e => setOpenRaw(e)} onClose={close}/>}
    </div>
  );
}

export default EtfView;
