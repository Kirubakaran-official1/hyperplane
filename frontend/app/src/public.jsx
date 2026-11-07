// A public saved portfolio — the brand's shop window (owner 2026-11-07, round 14: "rethink completely — this is forward testing, not a
// back-test: mostly there is little or no data yet, so plan and design for that … the large / mid / small mix first with a progress symbol,
// then the portfolio … no weight bar … simulators like the brokers have, with proper UI / UX and animation … the chart full width").
// /app/portfolio/<ID> renders ONLY this page: main.jsx never starts the app shell or asks who is signed in. Its requests go to the open,
// rate-limited /app/api/public/portfolio/<ID> (the plan) and …/track (the live tracking) — nothing else of Hyperplane is reachable from here.
// Order: brand bar · hero with a quick start · portfolio spread (Large / Mid / Small rings) · live tracking (or "live since …" while the
// first days come in) with the forward-test road · swaps (what left, what came, how both did since) · simulators · holdings · brand band.
// Round 15 (owner 2026-11-07): the simulators assume a fixed 5 % a year — below the market's long-run average, on purpose — and never ask
// for a one-time amount; a saved portfolio's own amount is fixed (a new amount = a new portfolio, through the quick start). A visitor
// already signed in on this browser (localStorage hp_signed, set by the app — a hint only, it grants nothing) sees "Open Hyperplane".
// A quick start keeps {app, amount} in sessionStorage (hp_intent): after sign-up / log-in that application opens with the amount filled in.
import React, { useEffect, useRef, useState } from "react";
import { AiSpark, Brand, DISCLAIMER, Icon, copyText } from "./core.jsx";
import { Count, Simulators, useWidth } from "./sim.jsx";
import { SwapDetail } from "./saved.jsx";
import { CellField } from "./cells.jsx";

const APP_OF = { sip: ["sip", "etf-sip-builder"], msip: ["msip", "momentum-sip-builder"], builder: ["builder", "portfolio-builder"], analyser: ["builder", "portfolio-builder"] };
const STYLE = { focus: "Focus", standard: "Standard", diverse: "More diversified" };
// the app's own market-cap palette (shell.css.js --mx-*: one blue ramp) with the text colour made for each tone
const MIX = [["Large", "Large cap", "var(--mx-l)", "The 100 biggest companies — the steady core", "var(--mx-lt)"],
  ["Mid", "Mid cap", "var(--mx-m)", "The next 150 — faster growth, more swings", "var(--mx-mt)"],
  ["Small", "Small cap", "var(--mx-s)", "Smaller companies — the biggest swings", "var(--mx-st)"],
  ["Other", "Gold & themes", "var(--mx-c)", "Gold, sectors and other markets", "#fff"]];
const TAGLINE = "Forward-tested portfolios, tracked live every trading day";
const signedIn = () => { try { return localStorage.getItem("hp_signed") === "1"; } catch { return false; } };
const VAL = "#8b5cf6";
const inr = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const short = v => v == null ? "—" : Math.abs(v) >= 1e7 ? `₹${+(v / 1e7).toFixed(2)} Cr` : Math.abs(v) >= 1e5 ? `₹${+(v / 1e5).toFixed(2)} L` : inr(v);
const kAmt = v => v >= 1e5 ? `₹${+(v / 1e5).toFixed(1)} L` : `₹${v / 1000}K`;
const money = v => v == null ? "—" : `${v >= 0 ? "+" : "−"}${inr(Math.abs(v))}`;
const pct = v => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = v => v == null ? "" : v > 0 ? "up" : v < 0 ? "dn" : "";
const dLong = iso => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
const calm = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
// a holding's place in the mix: a stock by its market cap, an ETF by the index it follows (gold, themes and the rest → Other)
const mixOf = h => {
  if (h.kind !== "etf") return ["Large", "Mid", "Small"].includes(h.cap) ? h.cap : "Other";
  const u = String(h.u || "");
  return /Midcap/i.test(u) ? "Mid" : /Smallcap/i.test(u) ? "Small" : /^(Nifty 50|Nifty Next 50|Nifty 100|Sensex)$/i.test(u) ? "Large" : "Other";
};


// ── the mix: one ring per market cap ──
function Ring({ pct: p, color }) {
  const r = 34, c = 2 * Math.PI * r, [on, setOn] = useState(calm());
  useEffect(() => { const t = setTimeout(() => setOn(true), 80); return () => clearTimeout(t); }, []);
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--s3)" strokeWidth="9"/>
      {p > 0 && <circle cx="44" cy="44" r={r} fill="none" stroke="var(--mx-m)" strokeWidth="11" strokeLinecap="round" transform="rotate(-90 44 44)" opacity=".55"
        strokeDasharray={`${on ? c * Math.min(p, 99.5) / 100 : 0} ${c}`} style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1)" }}/>}
      {p > 0 && <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" transform="rotate(-90 44 44)"
        strokeDasharray={`${on ? c * Math.min(p, 99.5) / 100 : 0} ${c}`} style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1)" }}/>}
    </svg>);
}
function MixTiles({ hs, isSip, w }) {
  const by = MIX.map(([k, l, col, sub]) => { const r = hs.filter(h => mixOf(h) === k); return { k, l, col, sub, n: r.length, share: r.reduce((a, h) => a + (h.w || 0), 0),
    money: r.reduce((a, h) => a + (isSip ? (h.amt || 0) : (h.qty || 0) * (h.p || 0)), 0) }; }).filter(x => x.k !== "Other" || x.n);
  return (
    <section className="pq-mix" id="pub-mix">
      {by.map(x => <div key={x.k} className="pq-tile" data-mix={x.k}>
        <div className="pq-rw"><Ring pct={x.share} color={x.col}/><b className="pq-rp"><Count v={x.share} f={v => `${v.toFixed(0)}%`}/></b></div>
        <div className="pq-tt"><span className="pq-tl"><i style={{ background: x.col }}/>{x.l}</span>
          <b>{x.n ? `${x.n} ${x.n === 1 ? "holding" : "holdings"}` : "None"}</b>
          <span className="pq-tm">{x.money ? `${inr(x.money)}${isSip ? ` a ${w}` : ""}` : "not in this plan"}</span>
          <small>{x.sub}</small></div>
      </div>)}
    </section>);
}

// ── a line chart that fills its box (live tracking) ──
function Lines({ dates, series, height = 320 }) {
  const [ref, w] = useWidth(), [at, setAt] = useState(null);
  const H = height, L = 72, R = 18, T = 14, B = 28, n = dates.length;
  const all = series.flatMap(s => s.vals).filter(v => v != null);
  let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.02 || 1; lo -= pad; hi += pad;
  const x = i => L + i * (w - L - R) / Math.max(1, n - 1), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const path = vals => vals.map((v, i) => v == null ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = [0, 1, 2, 3, 4].map(k => lo + (hi - lo) * k / 4);
  const xt = [0, Math.round((n - 1) / 3), Math.round(2 * (n - 1) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  const move = e => { const r = e.currentTarget.getBoundingClientRect(); setAt(Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - L) / ((w - L - R) / Math.max(1, n - 1)))))); };
  return (
    <div className="pq-chart" ref={ref}>
      <svg width={w} height={H} onPointerMove={move} onPointerLeave={() => setAt(null)} role="img" aria-label="Live tracking since it was saved">
        <defs><linearGradient id="pqg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--ch-pf)" stopOpacity=".26"/><stop offset="1" stopColor="var(--ch-pf)" stopOpacity="0"/></linearGradient></defs>
        {ticks.map((v, i) => <g key={i}><line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke="var(--b1)"/><text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--t3)">{short(v)}</text></g>)}
        {xt.map(i => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="var(--t3)">{dLong(dates[i]).replace(/ \d{4}$/, "")}</text>)}
        <path d={`${path(series[0].vals)}L${x(n - 1)},${H - B}L${x(0)},${H - B}Z`} fill="url(#pqg)" className="pq-area"/>
        {series.map(s => <path key={s.k} d={path(s.vals)} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" className="pq-draw" pathLength="1"/>)}
        {at != null && <><line x1={x(at)} x2={x(at)} y1={T} y2={H - B} stroke="var(--t3)" strokeDasharray="3 3"/>
          {series.map(s => s.vals[at] != null && <circle key={s.k} cx={x(at)} cy={y(s.vals[at])} r="4.5" fill={s.color} stroke="var(--s1)" strokeWidth="2"/>)}</>}
      </svg>
      {at != null && <div className="pq-tip" style={{ left: Math.max(8, Math.min(x(at) + 14, w - 230)) }}><b>{dLong(dates[at])}</b>
        {series.map(s => <span key={s.k}><i style={{ background: s.color }}/>{s.label}<em>{s.vals[at] == null ? "—" : inr(s.vals[at])}</em></span>)}</div>}
    </div>);
}


// sign-up, then that application with the amount filled in
const startWith = (kind, amount, monthly, signup = !signedIn()) => {
  const [app, slug] = monthly && !(kind === "sip" || kind === "msip") ? APP_OF.sip : APP_OF[kind] || APP_OF.builder;
  try { sessionStorage.setItem("hp_intent", JSON.stringify({ app, amount })); } catch { /* ignore */ }
  window.location.assign(`/app/${slug}${signup ? "?signup=1" : ""}`);
};
function QuickStart({ kind, id, dark }) {
  const sip = kind === "sip" || kind === "msip";
  const amts = sip ? [10000, 25000, 50000] : [50000, 100000, 500000];
  const inNow = signedIn();
  return (
    <div className={`pq-qs ${dark ? "dk" : ""}`} id={id}>
      <span className="eb">{sip ? "Start your own SIP" : "Build your own portfolio"}</span>
      <h2>{sip ? "How much a month?" : "How much to invest?"}</h2>
      <div className="pq-amts">{amts.map(v => <button key={v} type="button" className="pq-amt" onClick={() => startWith(kind, v, false, !inNow)} data-amt={v}>
        <b>{kAmt(v)}</b><small>{sip ? "a month" : "to invest"}</small><Icon name="chevron" size={14}/></button>)}</div>
      {inNow ? <div className="alt">You are signed in — it opens in your Hyperplane.</div>
        : <div className="alt">Free to sign up · Have an account? <a href={`/app/${(APP_OF[kind] || APP_OF.builder)[1]}`} onClick={e => { e.preventDefault(); startWith(kind, amts[0], false, false); }}>Log in</a></div>}
    </div>);
}

const CSS = `
.pq{--ch-pf:#0891b2;--ch-in:#f59e0b;--ch-bn:#8b5cf6;min-height:100vh;display:flex;flex-direction:column;background:var(--bg)}
.pq *{box-sizing:border-box}
.pq-top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:14px;padding:10px 32px;background:color-mix(in srgb,var(--s1) 86%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--b1)}
.pq-tag{font:600 12px var(--sans);color:var(--t2);padding-left:14px;border-left:1px solid var(--b1)}.pq-sp{flex:1}
.pq-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 16px;border-radius:9px;font:600 13.5px var(--sans);text-decoration:none;white-space:nowrap;cursor:pointer;border:1px solid var(--b2);background:var(--s1);color:var(--t1)}
.pq-btn:hover{border-color:var(--acc);color:var(--acc)}.pq-btn.pri{background:var(--ds-action-bg);border-color:transparent;color:var(--on-acc)}.pq-btn.pri:hover{background:var(--ds-action-hover);color:var(--on-acc)}
.pq-btn.sm{height:32px;padding:0 12px;font-size:12.5px}.pq-btn.pri .ai-spark{color:#fff;opacity:1}
.pq-hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,440px);gap:24px;align-items:center;padding:18px 32px;border-bottom:1px solid var(--b1);
  background:radial-gradient(60% 180% at 0% 0%,color-mix(in srgb,var(--acc) 16%,var(--bg)) 0%,transparent 60%),radial-gradient(50% 160% at 100% 0%,rgba(139,92,246,.14) 0%,transparent 60%),var(--bg)}
.pq-eb{display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 11px;border-radius:999px;background:var(--s1);border:1px solid var(--b1);font:600 11.5px var(--sans);color:var(--acc)}
.pq-hero h1{margin:8px 0 6px;font:800 34px/42px var(--sans);letter-spacing:-.025em;color:var(--t1)}
.pq-lead{margin:0;max-width:860px;font-size:15px;line-height:24px;color:var(--t2)}
.pq-facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.pq-fact{display:flex;flex-direction:column;gap:2px;min-width:120px;padding:9px 14px;border-radius:12px;background:color-mix(in srgb,var(--s1) 82%,transparent);border:1px solid var(--b1)}
.pq-fact span{font:600 10.5px var(--sans);letter-spacing:.5px;text-transform:uppercase;color:var(--t3)}.pq-fact b{font:700 15.5px var(--sans);color:var(--t1)}
.pq-copy{align-self:center;border:0;background:none;color:var(--acc);font:600 13px var(--sans);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.pq-qs{display:flex;flex-direction:column;background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:18px;box-shadow:0 22px 50px -28px rgba(15,27,45,.45)}
.pq-qs .eb{font:700 11px var(--sans);letter-spacing:.6px;text-transform:uppercase;color:var(--acc)}.pq-qs h2{margin:6px 0 14px;font:800 22px/28px var(--sans);color:var(--t1)}
.pq-amts{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px}
.pq-amt{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:14px 16px;border-radius:12px;border:1.5px solid var(--b2);background:var(--s1);cursor:pointer;text-align:left;font-family:var(--sans);transition:all .18s}
.pq-amt b{font:800 22px/28px var(--sans);color:var(--t1)}.pq-amt small{font-size:12px;color:var(--t2)}.pq-amt .ic{position:absolute;right:12px;top:16px;color:var(--t3);transition:transform .18s}
.pq-amt:hover{border-color:var(--acc);background:var(--adim);transform:translateY(-2px)}.pq-amt:hover b{color:var(--acc)}.pq-amt:hover .ic{transform:translateX(3px);color:var(--acc)}
.pq-amt:focus-visible{outline:none;box-shadow:var(--ds-focus)}
.pq-qs .alt{margin-top:12px;font-size:12.5px;color:var(--t2)}.pq-qs .alt a{color:var(--acc);font-weight:600;text-decoration:none}
.pq-body{display:flex;flex-direction:column;gap:12px;padding:14px 32px 0}
.pq-h2{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.pq-h2 h2{margin:0;font:800 19px var(--sans);color:var(--t1)}.pq-h2 small{font-size:13px;color:var(--t2)}
.pq-mix{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:-4px}
.pq-tile{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:16px;background:var(--s1);border:1px solid var(--b1);transition:transform .2s,box-shadow .2s;animation:pqIn .45s cubic-bezier(.2,.8,.2,1) both}
.pq-tile:nth-child(2){animation-delay:.06s}.pq-tile:nth-child(3){animation-delay:.12s}.pq-tile:nth-child(4){animation-delay:.18s}
.pq-tile:hover{transform:translateY(-2px);box-shadow:0 12px 28px -16px rgba(15,27,45,.35)}
.pq-rw{position:relative;flex:none;width:88px;height:88px}.pq-rw svg{display:block}.pq-rp{position:absolute;inset:0;display:grid;place-items:center;font:800 18px var(--sans);color:var(--t1)}
.pq-tt{display:flex;flex-direction:column;gap:2px;min-width:0}.pq-tl{display:inline-flex;align-items:center;gap:7px;font:700 11.5px var(--sans);letter-spacing:.5px;text-transform:uppercase;color:var(--t2)}.pq-tl i{width:10px;height:10px;border-radius:3px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mx-l) 45%,transparent)}
.pq-tt b{font:800 19px/24px var(--sans);color:var(--t1)}.pq-tm{font:600 13px var(--sans);color:var(--acc)}.pq-tt small{font-size:12px;line-height:17px;color:var(--t2)}
.pq-card{background:var(--s1);border:1px solid var(--b1);border-radius:18px;overflow:hidden;min-width:0}
.pq-ch{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--b1)}
.pq-ch h3{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0;font:700 16px var(--sans);color:var(--t1)}.pq-ch h3 small{font:500 12.5px var(--sans);color:var(--t2)}.pq-ch h3 .ic{color:var(--acc)}
.pq-live{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;background:var(--longd);color:var(--long);font:700 11px var(--sans);letter-spacing:.4px;text-transform:uppercase}
.pq-live::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;animation:pqBlink 1.6s ease-in-out infinite}
@keyframes pqBlink{50%{opacity:.25}}
.pq-seg{display:inline-flex;flex-wrap:wrap;padding:3px;border-radius:10px;background:var(--s2);border:1px solid var(--b1)}
.pq-seg button{height:30px;padding:0 12px;border:0;border-radius:7px;background:none;color:var(--t2);font:600 12.5px var(--sans);cursor:pointer;transition:all .15s}
.pq-seg button:hover{color:var(--t1)}.pq-seg button.on{background:var(--s1);color:var(--acc);box-shadow:0 1px 3px rgba(15,27,45,.14)}
.pq-k{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-bottom:1px solid var(--b1)}
.pq-k>div{padding:12px 18px;border-right:1px solid var(--b1);min-width:0}.pq-k>div:last-child{border-right:0}
.pq-k span{display:block;font:600 10.5px var(--sans);letter-spacing:.5px;text-transform:uppercase;color:var(--t3)}.pq-k b{display:block;margin-top:3px;font:800 21px/27px var(--sans);color:var(--t1)}.pq-k small{font-size:12px;color:var(--t2)}
.up{color:var(--long)!important}.dn{color:var(--short)!important}
.pq-leg{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--t2)}.pq-leg>span{display:inline-flex;align-items:center;gap:6px}.pq-leg i{width:12px;height:4px;border-radius:2px}
.pq-lc{display:flex;flex-direction:column;gap:8px;padding:12px 18px 14px}
.pq-chart{position:relative;width:100%;min-width:0}.pq-chart svg{display:block}
.pq-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:pqDraw 1.4s cubic-bezier(.2,.8,.2,1) forwards}.pq-area{opacity:0;animation:pqFade .8s .6s forwards}
@keyframes pqDraw{to{stroke-dashoffset:0}}@keyframes pqFade{to{opacity:1}}
.pq-tip{position:absolute;top:12px;z-index:3;min-width:210px;padding:10px 12px;border-radius:10px;background:var(--s1);border:1px solid var(--b2);box-shadow:0 12px 28px -12px rgba(0,0,0,.4);font-size:12.5px;color:var(--t1);pointer-events:none}
.pq-tip b{display:block;margin-bottom:4px}.pq-tip span{display:flex;align-items:center;gap:6px;padding:2px 0}.pq-tip i{width:8px;height:8px;border-radius:2px}.pq-tip em{margin-left:auto;padding-left:12px;font-style:normal;font-weight:700}
.pq-wait{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;align-items:center;padding:14px 18px}
.pq-pulse{position:relative;width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:var(--adim);color:var(--acc)}
.pq-pulse::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--acc);animation:pqPulse 1.8s ease-out infinite}
@keyframes pqPulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.6);opacity:0}}
.pq-wait h3{margin:0 0 4px;font:700 16.5px var(--sans);color:var(--t1)}.pq-wait p{margin:0;max-width:980px;font-size:13.5px;line-height:21px;color:var(--t2)}
.pq-road{position:relative;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin-top:10px}
.pq-road::before{content:"";position:absolute;left:10%;right:10%;top:11px;height:3px;border-radius:2px;background:var(--s3)}
.pq-road::after{content:"";position:absolute;left:10%;top:11px;height:3px;border-radius:2px;width:var(--done);background:linear-gradient(90deg,var(--acc),${VAL});animation:pqGrow 1.2s cubic-bezier(.2,.8,.2,1) both}
@keyframes pqGrow{from{width:0}}
.pq-road>div{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;font:600 12px var(--sans);color:var(--t3)}
.pq-road>div i{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:var(--s1);border:2px solid var(--s3);color:#fff}
.pq-road>div.on{color:var(--t1)}.pq-road>div.on i{background:var(--acc);border-color:var(--acc)}.pq-road>div.now i{box-shadow:0 0 0 5px var(--adim)}
.pq-road small{font-weight:500;color:var(--t3)}
.pq-simb{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr)}
.pq-simc{display:flex;flex-direction:column;gap:18px;padding:18px 20px;border-right:1px solid var(--b1);background:var(--s2)}
.pq-simr{display:flex;flex-direction:column;gap:12px;padding:16px 18px 12px;min-width:0}
.pq-sl{display:flex;flex-direction:column;gap:5px}.pq-sll{display:flex;justify-content:space-between;align-items:baseline;font:600 13px var(--sans);color:var(--t2)}.pq-sll b{font:800 17px var(--sans);color:var(--t1)}
.pq-sl input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;margin:6px 0;padding:0;border:0;box-shadow:none;border-radius:999px;cursor:pointer;
  background:linear-gradient(90deg,var(--acc) 0,${VAL} var(--f),var(--s3) var(--f))}
.pq-sl input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid var(--acc);box-shadow:0 2px 6px rgba(15,27,45,.3);transition:transform .15s}
.pq-sl input[type=range]:active::-webkit-slider-thumb{transform:scale(1.15)}
.pq-sl input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid var(--acc)}
.pq-slr{display:flex;justify-content:space-between;font-size:11px;color:var(--t3)}
.pq-steps{display:flex;flex-direction:column;gap:6px;font:600 13px var(--sans);color:var(--t2)}
.pq-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pq-big{display:flex;flex-direction:column;gap:2px;padding:12px 16px;border-radius:14px;background:var(--s2);border:1px solid var(--b1);min-width:0}
.pq-big>span{font:600 11px var(--sans);letter-spacing:.5px;text-transform:uppercase;color:var(--t3)}.pq-big b{font:800 28px/34px var(--sans);letter-spacing:-.02em;color:var(--t1)}.pq-big small{font-size:12.5px;color:var(--t2)}
.pq-big.hl{background:linear-gradient(135deg,color-mix(in srgb,var(--acc) 11%,var(--s1)),color-mix(in srgb,${VAL} 11%,var(--s1)));border-color:var(--accb)}.pq-big.hl b{color:var(--acc)}
.pq-hf{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid var(--b1)}
.pq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;padding:12px 14px 14px}
.pq-h{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;border:1px solid var(--b1);border-top:3px solid var(--c);background:var(--s1);animation:pqIn .45s cubic-bezier(.2,.8,.2,1) both;transition:transform .18s,box-shadow .18s}
.pq-h:hover{transform:translateY(-2px);box-shadow:0 12px 26px -16px rgba(15,27,45,.35)}
@keyframes pqIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.pq-hh{display:flex;align-items:center;gap:10px;min-width:0}.pq-av{width:38px;height:38px;flex:none;border-radius:11px;display:grid;place-items:center;font:800 12.5px var(--sans);color:var(--ct);background:var(--c);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--mx-l) 35%,transparent)}
.pq-hn{min-width:0;flex:1}.pq-hn b{display:block;font:800 14.5px var(--sans);color:var(--acc)}.pq-hn small{display:block;font-size:12px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pq-w{text-align:right}.pq-w b{display:block;font:800 17px var(--sans);color:var(--t1)}.pq-w small{font-size:11px;color:var(--t3)}
.pq-hm{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;padding-top:10px;border-top:1px dashed var(--b1);font-size:11.5px;color:var(--t3)}
.pq-hm>div{min-width:0}.pq-hm b{display:block;margin-top:1px;font:700 13.5px var(--sans);color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pq-chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;font:700 11.5px var(--sans);background:var(--s2);color:var(--t2)}
.pq-chip.up{background:var(--longd)}.pq-chip.dn{background:var(--shortd)}.pq-chip.soon::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--acc);animation:pqBlink 1.6s infinite}
.pq-band{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,480px);gap:24px;align-items:center;padding:22px 28px;border-radius:18px;color:#fff;
  background:linear-gradient(135deg,#0b3b4a 0%,#173a6b 55%,#3b2a74 100%)}
.pq-band h2{margin:0 0 6px;font:800 25px/32px var(--sans);color:#fff}.pq-band p{margin:0;font-size:14px;line-height:22px;color:rgba(255,255,255,.82)}
.pq-feats{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.pq-feats>span{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);font:600 12.5px var(--sans);color:#fff}
.pq-qs.dk{box-shadow:none}.pq-band .pq-qs h2{margin:6px 0 14px;font-size:22px;color:var(--t1)}
.pq-fixed{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:12px;background:var(--s1);border:1px solid var(--b1)}
.pq-fixed span{font:600 13px var(--sans);color:var(--t2)}.pq-fixed b{font:800 22px var(--sans);color:var(--t1)}.pq-fixed small{font-size:12px;line-height:17px;color:var(--t3)}
.pq-rate{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:10px;border:1px dashed var(--b2);font-size:12px;line-height:17px;color:var(--t2)}
.pq-rate b{font:800 15px var(--sans);color:var(--t1)}
.pq-first{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:var(--adim);color:var(--t1);font-size:13px}.pq-first .ic{color:var(--acc)}
.pq-roadn{margin-top:10px;text-align:center;font-size:12px;color:var(--t3)}
.pq-swr{display:grid;grid-template-columns:110px minmax(0,1fr) 30px minmax(0,1fr) 170px;gap:12px;align-items:center;padding:12px 18px;border-bottom:1px solid var(--b1)}
.pq-swr:last-child{border-bottom:0}
.pq-swd{font:600 12.5px var(--sans);color:var(--t2)}.pq-swd small{display:block;font-weight:500;color:var(--t3)}
.pq-sws{display:flex;align-items:center;gap:10px;min-width:0;padding:8px 12px;border-radius:12px;border:1px solid var(--b1)}
.pq-sws>div{min-width:0;flex:1}.pq-sws b{font:800 14px var(--sans);color:var(--acc)}.pq-sws small{display:block;font-size:11.5px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pq-sws.out{background:var(--s2)}.pq-sws.out b{color:var(--t2);text-decoration:line-through}
.pq-sws.in{border-color:color-mix(in srgb,var(--long) 35%,var(--b1));background:color-mix(in srgb,var(--long) 6%,var(--s1))}
.pq-sws em{font-style:normal;font:700 13px var(--sans);text-align:right;white-space:nowrap}
.pq-swa{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--adim);color:var(--acc)}
.pq-swe{text-align:right}
.pq-swwrap{border-bottom:1px solid var(--b1)}.pq-swwrap:last-child{border-bottom:0}.pq-swwrap .pq-swr{border-bottom:0;cursor:pointer}.pq-swwrap .pq-swr:hover{background:var(--s2)}
.pq-swwrap .pq-swr:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--acc)}.pq-swm{color:var(--acc)!important;font-weight:600}
.pq-swdd{padding:0 18px 12px}.pq-swdd .sw-dd{margin:0}
.sw-dd{border:1px solid var(--b1);border-radius:12px;overflow:hidden;background:var(--bg)}
.sw-dh,.sw-dr{display:grid;grid-template-columns:170px minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center;padding:0 14px}
.sw-dh{height:30px;background:var(--s2);border-bottom:1px solid var(--b1);font:600 11px var(--sans);letter-spacing:.4px;text-transform:uppercase;color:var(--t3)}.sw-dh b{color:var(--acc)}
.sw-dr{min-height:36px;border-bottom:1px solid var(--b1);font-size:12.5px}.sw-dr:last-child{border-bottom:0}
.sw-dr>span{color:var(--t2)}.sw-dr b{font:600 13px var(--sans);color:var(--t1)}.sw-dr b small{display:block;font:500 11.5px var(--sans);color:var(--t3)}
.sw-dr.hl{background:var(--s2)}.sw-dr.amt b{font-size:14px}
@media (max-width:700px){.sw-dh,.sw-dr{grid-template-columns:110px 1fr 1fr;gap:8px;padding:0 10px}}
.pq-fx{position:absolute;inset:0;pointer-events:none;z-index:0}.pq-hin{position:relative;z-index:1;min-width:0}
.pq-cells{position:absolute;inset:0;width:100%;height:100%}
.pq-gridbg{position:absolute;inset:0;opacity:.45;background-image:linear-gradient(var(--b1) 1px,transparent 1px),linear-gradient(90deg,var(--b1) 1px,transparent 1px);background-size:48px 48px;
  -webkit-mask-image:linear-gradient(90deg,#000 0,transparent 70%);mask-image:linear-gradient(90deg,#000 0,transparent 70%)}
.pq-band .pq-cells{opacity:.6}
.pq-fact.bt{border-color:color-mix(in srgb,#8b5cf6 40%,var(--b1));background:color-mix(in srgb,#8b5cf6 8%,var(--s1))}.pq-fact.bt b{color:#7c3aed}
.pq-miss{margin:60px auto;width:min(560px,92%);text-align:center;background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:40px 24px;color:var(--t2)}
.pq-miss h1{font:700 22px var(--sans);margin:12px 0 6px;color:var(--t1)}.pq-miss p{margin:0 0 18px}
.pq-foot{margin-top:14px;padding:14px 32px;border-top:1px solid var(--b1);font-size:11.5px;line-height:17px;color:var(--t3);background:var(--s1)}
@media (max-width:1180px){.pq-k{grid-template-columns:repeat(3,minmax(0,1fr))}.pq-k>div:nth-child(3){border-right:0}.pq-k>div:nth-child(-n+3){border-bottom:1px solid var(--b1)}
  .pq-simb{grid-template-columns:1fr}.pq-simc{border-right:0;border-bottom:1px solid var(--b1)}}
@media (max-width:980px){.pq-hero,.pq-band{grid-template-columns:1fr}.pq-swr{grid-template-columns:1fr 30px 1fr}.pq-swd,.pq-swe{grid-column:1/-1;text-align:left}}
@media (max-width:640px){.pq-top{padding:8px 12px;gap:8px}.pq-tag{display:none}.pq-top .pq-btn{height:34px;padding:0 11px;font-size:12.5px}
  .pq-hero{padding:18px 12px}.pq-hero h1{font-size:26px;line-height:33px}.pq-body{padding:14px 12px 0}
  .pq-k{grid-template-columns:1fr 1fr}.pq-k>div{border-right:0;border-bottom:1px solid var(--b1)}.pq-two{grid-template-columns:1fr}.pq-big b{font-size:24px;line-height:30px}
  .pq-band{padding:18px}.pq-foot{padding:14px 12px}.pq-wait{grid-template-columns:1fr;padding:16px}.pq-road small{display:none}.pq-ch,.pq-lc,.pq-hf,.pq-simr{padding-left:12px;padding-right:12px}.pq-grid{padding:12px}}
@media (prefers-reduced-motion:reduce){.pq-draw,.pq-area,.pq-h,.pq-tile,.pq-road::after{animation:none;stroke-dashoffset:0;opacity:1}.pq-pulse::after,.pq-live::before,.pq-chip.soon::before{animation:none}}
`;

// where a forward test stands (round 15: "after 3 months, what happens?"): the milestones roll on — 6 months, 1 year, then every year —
// and the road always shows the five around today: the last ones reached, the next ones ahead.
const MILES = [["Saved", 0], ["First close", 1], ["1 week", 5], ["1 month", 21], ["3 months", 63], ["6 months", 126], ["1 year", 250],
  ...Array.from({ length: 19 }, (_, i) => [`${i + 2} years`, 250 * (i + 2)])];
function Road({ days, saved }) {
  const k = MILES.reduce((a, r, j) => days >= r[1] ? j : a, 0);
  const from = Math.max(0, Math.min(k - 2, MILES.length - 5)), shown = MILES.slice(from, from + 5), at = k - from;
  const next = MILES[k + 1];
  return (
    <div id="pub-road">
      <div className="pq-road" style={{ "--done": `${at * 20}%` }}>
        {shown.map(([l, n], j) => <div key={l} className={`${j <= at ? "on" : ""} ${j === at ? "now" : ""}`}><i>{j <= at ? <Icon name="check" size={12}/> : null}</i>{l}
          <small>{n === 0 ? dLong(saved) : `${n} trading day${n === 1 ? "" : "s"}`}</small></div>)}
      </div>
      <div className="pq-roadn">{days ? `${days} trading day${days === 1 ? "" : "s"} live` : "Live from today"}{next ? ` · next: ${next[0]} in ${next[1] - days} trading day${next[1] - days === 1 ? "" : "s"}` : ""} · the test never ends: every day, every swap, all of it stays on the record.</div>
    </div>);
}

// the swaps of a shared portfolio: from when, what to what, and how both did after (the stock that left is still followed)
function Swaps({ swaps, isSip }) {
  const [open, setOpen] = useState(() => new Set());
  if (!swaps || !swaps.length) return null;
  const side = (x, cls) => <div className={`pq-sws ${cls}`}>{x ? <><div><b>{x.s}</b><small>{x.n && x.n !== x.s ? x.n : ""}{x.cap ? ` · ${x.cap} cap` : ""}</small>
    {(x.invested != null || x.sold_for != null) && <small className="pq-swm">{cls === "out" ? `${inr(x.sold_for != null ? x.sold_for : x.invested)} moved` : `${inr(x.invested)} in`}</small>}</div>
    <em className={tone(x.ret)}>{pct(x.ret)}<small>{cls === "out" ? "if kept" : "since in"}</small></em></> : <div><b>—</b></div>}</div>;
  const inr2 = v => v == null ? "—" : `₹${(+v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <section className="pq-card" id="pub-swaps">
      <div className="pq-ch"><h3><Icon name="swap" size={16}/> Swaps<small>{swaps.length} change{swaps.length === 1 ? "" : "s"} · what left, what came in, and how both did since</small></h3></div>
      <div>{swaps.map((w, i) => <div key={i} className={`pq-swwrap ${open.has(i) ? "open" : ""}`}><div className="pq-swr" role="button" tabIndex={0} aria-expanded={open.has(i)} data-swap-row={i}
        onClick={() => setOpen(o => { const x = new Set(o); x.has(i) ? x.delete(i) : x.add(i); return x; })}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}>
        <div className="pq-swd">{dLong(w.d)}<small>swapped · {open.has(i) ? "hide" : "details"}</small></div>{side(w.out, "out")}<span className="pq-swa"><Icon name="chevron" size={15}/></span>{side(w.in, "in")}
        <div className="pq-swe">{w.edge == null || (w.edge === 0 && w.in && w.in.then === w.in.now) ? <span className="pq-chip">Starts next close</span> : <span className={`pq-chip ${tone(w.edge)}`}>{w.edge >= 0 ? "Swap ahead" : "Swap behind"} {Math.abs(w.edge).toFixed(2)}%</span>}</div>
      </div>{open.has(i) && <div className="pq-swdd"><SwapDetail w={w} inr={inr} inr2={inr2} pct={pct} tone={tone} isSip={isSip}/></div>}</div>)}</div>
    </section>);
}

export default function PublicPortfolio({ code }) {
  const [d, setD] = useState(null), [err, setErr] = useState(""), [t, setT] = useState(null);
  const [step, setStep] = useState(null), [per, setPer] = useState("All"), [copied, setCopied] = useState(false), [flt, setFlt] = useState("All");
  const get = url => fetch(url, { credentials: "omit", headers: { Accept: "application/json" } })
    .then(async r => { if (!r.ok) throw new Error(r.status === 429 ? "Too many requests — please try again in a minute." : "This portfolio is private, or the link is not right."); return r.json(); });
  useEffect(() => {
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    get(`/app/api/public/portfolio/${encodeURIComponent(code)}`).then(x => { setD(x); setStep((x.inputs && x.inputs.stepup) || 0); document.title = `${x.name} · shared on Hyperplane`; })
      .catch(e => { setErr(e.message); document.title = "Hyperplane"; });
    return () => st.remove();
  }, [code]);
  const isSip = d && (d.kind === "sip" || d.kind === "msip");
  useEffect(() => {
    if (!d || step == null) return;
    const q = new URLSearchParams(); if (isSip) q.set("stepup", step);
    get(`/app/api/public/portfolio/${encodeURIComponent(code)}/track?${q}`).then(setT).catch(() => setT({ dates: [], holdings: [], groups: [] }));
  }, [d, step]);
  const top = (
    <header className="pq-top"><Brand/><span className="pq-tag">{TAGLINE}</span><span className="pq-sp"/>
      {signedIn() ? <a className="pq-btn pri" href="/app/" id="pub-open">Open Hyperplane</a>
        : <><a className="pq-btn" href="/app/" id="pub-login">Log in</a><a className="pq-btn pri" href="/app/?signup=1" id="pub-signup">Sign up free</a></>}</header>);
  const foot = <footer className="pq-foot">{DISCLAIMER} The simulators are illustrations at the growth you choose (5% a year by default), never a forecast. Shared by a Hyperplane customer; the owner is not shown. © {new Date().getFullYear()} QuantFriday · Hyperplane</footer>;
  if (err) return <div className="pq" id="pub-page">{top}<section className="pq-miss" id="pub-miss"><Icon name="lock" size={30}/><h1>Not available</h1><p>{err}</p>
    <a className="pq-btn pri" href="/app/?signup=1">Build your own with Hyperplane</a></section>{foot}</div>;
  if (!d) return <div className="pq" id="pub-page">{top}<div className="pq-miss">Opening the portfolio…</div>{foot}</div>;

  const i = d.inputs || {}, w = i.freq === "quarter" ? "quarter" : "month";
  const hs = d.holdings || [];
  const total = hs.reduce((a, h) => a + (isSip ? (h.amt || 0) : (h.qty || 0) * (h.p || 0)), 0);
  const days = t ? t.dates.length : 0, tracked = days >= 2, m = t && t.metrics, have = days >= 1 && !!m;    // numbers from the first close, the line from day 2
  let from = 0;
  const pd = [["1M", 31], ["3M", 92], ["6M", 183], ["All", 0]].find(p => p[0] === per);
  if (tracked && pd && pd[1]) { const lim = new Date(new Date(t.dates[days - 1]).getTime() - pd[1] * 864e5).toISOString().slice(0, 10); from = Math.max(0, t.dates.findIndex(x => x >= lim)); }
  const cut = a => (a || []).slice(from);
  const series = tracked ? [{ k: "pf", label: "Portfolio value", color: "var(--ch-pf)", vals: cut(t.value) }, { k: "in", label: "Amount invested", color: "var(--ch-in)", vals: cut(t.put_in) },
    { k: "bn", label: "Same money in the Nifty 50", color: "var(--ch-bn)", vals: cut(t.bench) }] : [];
  const live = Object.fromEntries((t ? t.holdings : []).filter(h => h.held).map(h => [h.s, h]));
  const groupsHere = MIX.filter(([k]) => hs.some(h => mixOf(h) === k));
  const cards = hs.slice().sort((a, b) => (b.w || 0) - (a.w || 0)).filter(h => flt === "All" || mixOf(h) === flt);
  const mixRow = h => MIX.find(x => x[0] === mixOf(h)) || MIX[3];
  const copy = async () => { if (await copyText(window.location.href)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } };
  const what = d.kind === "sip" ? "ETFs" : d.kind === "msip" ? "momentum stocks" : "stocks";
  const back = !!i.as_of;                                          // built on a past day's data (round 16)
  return (
    <div className="pq" id="pub-page">
      {top}
      <section className="pq-hero">
        <div className="pq-fx" aria-hidden="true"><div className="pq-gridbg"/><CellField className="pq-cells" size={48}/></div>
        <div className="pq-hin">
          <span className="pq-eb"><AiSpark/> Shared portfolio · built with Hyperplane AI</span>
          <h1 id="pub-name">{d.name}</h1>
          <p className="pq-lead">{isSip ? `A ${w}ly SIP across ${hs.length} ${what}, made with the ${d.tag}.` : `${hs.length} ${what} made with the ${d.tag}.`} {back
            ? <>It was built on the data of {dLong(d.saved_on)} and is tracked from that day to today — a back-test from {dLong(d.saved_on)} until it was shared, then live every trading day.</>
            : <>It is forward-tested, not back-tested: Hyperplane AI tracks it live every trading day from {dLong(d.saved_on)}, so every result shown here happened after it was saved.</>}</p>
          <div className="pq-facts">
            {isSip ? <div className="pq-fact"><span>Every {w}</span><b>{inr(total)}</b></div> : <div className="pq-fact"><span>Invested</span><b>{short(total)}</b></div>}
            <div className="pq-fact"><span>Holdings</span><b>{hs.length}</b></div>
            {i.opts && i.opts.style && <div className="pq-fact"><span>Style</span><b>{STYLE[i.opts.style]}</b></div>}
            {isSip && i.years && <div className="pq-fact"><span>Plan for</span><b>{i.years} years</b></div>}
            {isSip && <div className="pq-fact"><span>Step-up</span><b>{i.stepup ? `+${i.stepup}% a year` : "None"}</b></div>}
            {back ? <div className="pq-fact bt" id="pub-back"><span>Back-tested from</span><b>{dLong(d.saved_on)}</b></div>
              : <div className="pq-fact"><span>Live since</span><b>{dLong(d.saved_on)}</b></div>}
            <button type="button" className="pq-copy" onClick={copy} id="pub-copy"><Icon name={copied ? "check" : "copy"} size={13}/> {copied ? "Link copied" : "Copy link"}</button>
          </div>
        </div>
        <div className="pq-hin"><QuickStart kind={d.kind} id="pub-qs"/></div>
      </section>

      <div className="pq-body">
        <div className="pq-h2"><h2>Portfolio spread</h2><small>by company size{hs.some(h => mixOf(h) === "Other") ? ", gold and themes" : ""}</small></div>
        <MixTiles hs={hs} isSip={isSip} w={w}/>

        <section className="pq-card" id="pub-track">
          <div className="pq-ch"><h3><Icon name="clock" size={16}/> Live tracking <span className="pq-live">Live</span>
            <small>{have ? `${days} trading day${days === 1 ? "" : "s"} since ${dLong(t.start)}` : `forward test from ${dLong(d.saved_on)}`}</small></h3><span className="pq-sp"/>
            {have && isSip && <div className="pq-seg" role="group" aria-label="Yearly step-up" id="pub-stepup">{[0, 5, 10, 15, 20].map(v =>
              <button key={v} type="button" className={step === v ? "on" : ""} onClick={() => setStep(v)} data-step={v}>{v ? `+${v}%` : "No step-up"}</button>)}</div>}
            {tracked && days > 25 && <div className="pq-seg" id="pub-per">{["1M", "3M", "6M", "All"].map(k => <button key={k} type="button" className={per === k ? "on" : ""} onClick={() => setPer(k)}>{k}</button>)}</div>}</div>
          {have ? <>
            <div className="pq-k" id="pub-kpis">
              <div><span>Value now</span><b><Count v={m.value} f={short}/></b><small className={tone(m.day_gain)}>{m.day_gain != null ? `${money(m.day_gain)} on the day` : ""}</small></div>
              <div><span>Amount invested</span><b><Count v={m.invested} f={short}/></b><small>since {dLong(t.start)}</small></div>
              <div><span>Returns</span><b className={tone(m.gain)}>{pct(m.ret)}</b><small className={tone(m.gain)}>{money(m.gain)}</small></div>
              <div><span>Nifty 50, same money</span><b className={tone(m.bench_ret)}>{pct(m.bench_ret)}</b>
                <small>{m.ret != null && m.bench_ret != null ? (m.ret >= m.bench_ret ? `${(m.ret - m.bench_ret).toFixed(2)}% ahead` : `${(m.bench_ret - m.ret).toFixed(2)}% behind`) : ""}</small></div>
              <div><span>Biggest fall</span><b className={m.drawdown < 0 ? "dn" : ""}>{m.drawdown.toFixed(2)}%</b><small>from a high point</small></div>
            </div>
            <div className="pq-lc">{tracked ? <><div className="pq-leg">{series.map(s => <span key={s.k}><i style={{ background: s.color }}/>{s.label}</span>)}</div>
              <div id="pub-chart"><Lines dates={cut(t.dates)} series={series}/></div></>
              : <div className="pq-first" id="pub-first"><Icon name="check" size={14}/> Priced at the close of {dLong(t.dates[0])} — the line starts with the next trading day.</div>}
              <Road days={days} saved={d.saved_on}/></div>
          </> : <div className="pq-wait" id="pub-notyet"><span className="pq-pulse"><Icon name="clock" size={22}/></span>
            <div><h3>{t ? "Saved — the first prices arrive after the next market close" : "Opening the live tracking…"}</h3>
              <p>A forward test starts on the day it is saved. Every trading day adds a point: the value, the amount invested, and the same money in the Nifty 50.
                Until then, see the spread above and try your own numbers in the simulators below.</p>
              <Road days={days} saved={d.saved_on}/></div></div>}
        </section>

        {t && <Swaps swaps={t.swaps} isSip={isSip}/>}

        <Simulators isSip={isSip} amount0={total} years0={i.years} onStart={(amt, monthly) => startWith(d.kind, amt, monthly)}/>

        <section className="pq-card" id="pub-holdings">
          <div className="pq-ch"><h3><Icon name="layers" size={16}/> The portfolio<small>{hs.length} holdings · biggest first</small></h3><span className="pq-sp"/>
            <div className="pq-seg" role="group" aria-label="Show" id="pub-flt">{[["All", "All"], ...groupsHere.map(([k, l]) => [k, l])].map(([k, l]) =>
              <button key={k} type="button" className={flt === k ? "on" : ""} onClick={() => setFlt(k)} data-flt={k}>{l} · {k === "All" ? hs.length : hs.filter(h => mixOf(h) === k).length}</button>)}</div></div>
          <div className="pq-grid" id="pub-table">{cards.map((h, j) => { const lv = live[h.s], etf = h.kind === "etf"; return (
            <article key={`${flt}-${h.s}`} className="pq-h" data-sym={h.s} data-mix={mixOf(h)} style={{ "--c": mixRow(h)[2], "--ct": mixRow(h)[4], animationDelay: `${Math.min(j, 12) * 30}ms` }}>
              <div className="pq-hh"><span className="pq-av">{h.s.slice(0, 2)}</span>
                <div className="pq-hn"><b>{h.s}</b><small>{h.n && h.n !== h.s ? h.n : h.u || ""}</small></div>
                <div className="pq-w"><b>{(h.w || 0).toFixed(1)}%</b><small>of the {isSip ? "SIP" : "money"}</small></div></div>
              <div className="pq-hm">
                <div>{isSip ? `₹ every ${w}` : "Amount"}<b>{inr(isSip ? h.amt : (h.qty || 0) * (h.p || 0))}</b></div>
                <div>{isSip ? `Buys every ${w}` : "Shares"}<b>{isSip ? (h.every > 1 ? `1 every ${h.every} ${w}s` : `${h.units || 0} ${etf ? "unit" : "share"}${h.units === 1 ? "" : "s"}`) : (h.qty || 0).toLocaleString("en-IN")}</b></div>
                <div>{etf ? "Follows" : "Sector"}<b title={etf ? h.u : h.sec}>{etf ? (h.u || "—") : (h.sec || "—")}</b></div>
                <div>Since saved<b>{lv && lv.qty && lv.ret != null ? <span className={`pq-chip ${tone(lv.ret)}`}>{pct(lv.ret)}</span> : <span className="pq-chip soon">Live soon</span>}</b></div>
              </div>
            </article>); })}</div>
        </section>

        <section className="pq-band" id="pub-band">
          <div className="pq-fx" aria-hidden="true"><CellField className="pq-cells" size={44}/></div>
          <div className="pq-hin"><h2>Your money, with a plan — not a guess</h2>
            <p>Hyperplane AI reads every NSE stock and ETF with one long-term engine, builds portfolios and SIPs, tracks them live and tells you when something needs to change.</p>
            <div className="pq-feats"><span><AiSpark/> AI Mode</span><span><AiSpark/> AI Portfolio Builder</span><span><AiSpark/> AI ETF SIP Builder</span><span><AiSpark/> AI Momentum SIP Builder</span><span><AiSpark/> Daily tracking & alerts</span></div></div>
          <div className="pq-hin"><QuickStart kind={d.kind} id="pub-qs2" dark/></div>
        </section>
      </div>
      {foot}
    </div>);
}
