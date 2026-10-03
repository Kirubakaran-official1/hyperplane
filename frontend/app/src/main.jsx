// Hyperplane by QuantFriday — customer edition (/app).
// Self-contained on purpose: it must never import the dashboard code. It only shows what the server publishes.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Helpdesk, HelpdeskIcon, InboxBell, useHelpdeskUnread } from "../../shared/helpdesk.jsx";
import Guide, { GUIDE_CSS } from "./guide.jsx";

// ─── vocabulary ──────────────────────────────────────────────────────────────
const TFS = [["D","Daily","short term"],["W","Weekly","weeks"],["M","Monthly","months"],["Q","Quarterly","quarters"],["Y","Yearly","long term"]];
const TF_NAME = { A:"Combined", ...Object.fromEntries(TFS.map(([k,l]) => [k,l])) };
const SIZES = ["Large","Mid","Small","Others"];
const TREND_CUT = 24;                       // |strength| below this = sideways (the server's Good / Weak cut)
const COUNTRIES = ["India","United Arab Emirates","United States","United Kingdom","Singapore","Saudi Arabia","Qatar","Kuwait","Oman","Bahrain","Canada","Australia","Malaysia","Germany","Other"];
const IN_STATES = ["Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"];
const DISCLAIMER = "Hyperplane shows trend information for education only. It is not investment advice or a recommendation to buy or sell any security. Please do your own research or consult a SEBI-registered adviser before investing.";

const idx = tf => "DWMQY".indexOf(tf);
const dirTf = (s, i) => ({ G:1, W:-1, M:0 })[s.r[i]] ?? null;
const dirVal = v => v == null ? null : v >= TREND_CUT ? 1 : v <= -TREND_CUT ? -1 : 0;
const strengthWord = a => a >= 75 ? "Very strong" : a >= 50 ? "Strong" : a >= TREND_CUT ? "Moderate" : "Weak";
const focusOf = (s, tfs) => {                 // signed strength for the chosen timeframe(s)
  if (!tfs.length) return s.os;
  const v = tfs.map(t => s.sc[idx(t)]).filter(x => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
const focusDir = (s, tfs) => tfs.length === 1 ? dirTf(s, idx(tfs[0])) : dirVal(focusOf(s, tfs));
const isUp = (s, tfs) => tfs.length ? tfs.every(t => dirTf(s, idx(t)) === 1) : dirVal(s.os) === 1;
const isDown = (s, tfs) => tfs.length ? tfs.every(t => dirTf(s, idx(t)) === -1) : dirVal(s.os) === -1;
const isBi = (s, tfs) => { const set = (tfs.length >= 2 ? tfs : "DWMQY".split("")).map(t => dirTf(s, idx(t))); return set.includes(1) && set.includes(-1); };
const sizeOf = s => s.cap || "Others";
// One label per stock for the chosen timeframe(s): one timeframe = its direction; several / Combined = bidirectional
// when they disagree (some up, some down), otherwise the direction of the average.
const categoryOf = (s, tfs) => {
  if (tfs.length === 1) { const d = dirTf(s, idx(tfs[0])); return d === 1 ? "up" : d === -1 ? "down" : d === 0 ? "side" : null; }
  if (isBi(s, tfs)) return "bi";
  const d = dirVal(focusOf(s, tfs)); return d === 1 ? "up" : d === -1 ? "down" : d === 0 ? "side" : null;
};
const BG = [["S", "Strong", "up"], ["M", "Moderate", "side"], ["W", "Weak", "down"]];
const BG_NAME = Object.fromEntries(BG.map(([k, l]) => [k, l]));
const CAT = { up:["▲ Uptrend","up"], down:["▼ Downtrend","down"], bi:["⇅ Bidirectional","bi"], side:["◆ Sideways","side"] };
const pct = v => v == null ? "—" : `${Math.abs(v)}%`;
const strengthLabel = s => s >= 70 ? "Very strong" : s >= 55 ? "Strong" : s >= 45 ? "Neutral" : s >= 30 ? "Weak" : "Very weak";
const strengthCls = s => s >= 55 ? "up" : s >= 45 ? "side" : "down";
const PALETTE = ["#00e5ff","#00c896","#ffaa00","#ff4454","#a259ff","#38bdf8","#f472b6","#2dd4bf","#fb923c","#a3e635","#818cf8","#facc15","#34d399","#c084fc","#fb7185","#60a5fa"];
const colorOf = name => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

async function api(path, opts = {}) {
  const init = { credentials:"same-origin", ...opts, headers:{ ...(opts.headers || {}) } };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers["content-type"] = "application/json"; }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) { const e = new Error((data && data.detail) || "Something went wrong — please try again"); e.status = res.status; throw e; }
  return data;
}
const fmtDT = iso => iso ? new Date(iso).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata" }) : "—";
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); const ok = document.execCommand("copy"); a.remove(); return ok; }
}

function summaryOf(s) {
  const up = TFS.filter((_, i) => dirTf(s, i) === 1).map(([, l]) => l), dn = TFS.filter((_, i) => dirTf(s, i) === -1).map(([, l]) => l);
  const shortUp = [0, 1].some(i => dirTf(s, i) === 1), longDn = [3, 4].some(i => dirTf(s, i) === -1);
  const longUp = [3, 4].some(i => dirTf(s, i) === 1), shortDn = [0, 1].some(i => dirTf(s, i) === -1);
  if (up.length >= 4 && !dn.length) return "Uptrend on almost every timeframe — a clean, one-directional uptrend.";
  if (dn.length >= 4 && !up.length) return "Downtrend on almost every timeframe — a clean, one-directional downtrend.";
  if (shortUp && longDn) return "Bidirectional: the short term is rising inside a falling long-term trend — be careful.";
  if (longUp && shortDn) return "Bidirectional: the long-term uptrend is intact, but the short term is pulling back.";
  if (up.length && dn.length) return "Bidirectional: timeframes disagree — wait for them to line up.";
  if (up.length) return "Leaning up, without any timeframe in a downtrend.";
  if (dn.length) return "Leaning down, without any timeframe in an uptrend.";
  return "Sideways on every timeframe — no clear trend yet.";
}

// Group state on the Combined timeframe, by level AND rank (so a weak market doesn't make every group "weak"):
// strong = strength ≥ 55% or in the top quarter of all sectors / industries; weak = under 45% and in the bottom half.
const groupState = g => !g ? null : (g.st >= 55 || g.rank / g.of <= 0.25) ? "up" : (g.st < 45 && g.rank / g.of > 0.5) ? "down" : "side";
const GROUP_WORD = { up:"strong", side:"average", down:"weak" };
function combinedView(od, bi, sec, ind) {
  const gs = [sec && ["sector", groupState(sec)], ind && ["industry", groupState(ind)]].filter(Boolean);
  const weak = gs.filter(([, st]) => st === "down").map(([n]) => n), strong = gs.length > 0 && gs.every(([, st]) => st === "up");
  const which = weak.join(" and ");
  let v;
  if (od === 1) v = strong ? ["good", "✓ Best case — with the tide", "Strong stock in a strong industry and a strong sector. Everything points the same way."]
    : weak.length ? ["warn", "⚠ Careful — against its group", `The stock is strong, but its ${which} ${weak.length > 1 ? "are" : "is"} weak. It is moving against its own group — avoid or wait (golden rule 2).`]
    : ["mid", "◐ Okay — group is only average", "The stock is strong, but its group is only average. Candidates in stronger sectors / industries are better."];
  else if (od === -1) v = strong ? ["watch", "👁 Watch only — a laggard", "A weak stock inside a strong group. It may catch up later — or keep lagging. Not a buy yet."]
    : ["bad", "✕ Avoid for buying", weak.length ? `A weak stock in a weak ${which}. Nothing is supporting it.` : "The stock is in a downtrend and its group is not helping."];
  else if (od === 0) v = ["mid", "◆ No edge yet", strong ? "No clear trend yet, but its group is strong — watch for the stock to pick a direction." : "No clear trend in the stock — there are better candidates."];
  else return null;
  if (bi && v[0] === "good") v = ["mid", "◐ Good group, mixed timeframes", "Its sector and industry are strong, but the stock's timeframes disagree — wait for them to line up (golden rule 3)."];
  return { tone: v[0], title: v[1], text: v[2] };
}

// ─── theme (dark default, light optional; remembered on this device) ───
const THEME_KEY = "qf_theme";
const getTheme = () => { try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; } };
const applyTheme = t => { document.documentElement.dataset.theme = t; try { localStorage.setItem(THEME_KEY, t); } catch { /* storage blocked */ } };
function useTheme() {
  const [theme, setTheme] = useState(getTheme);
  return [theme, t => { applyTheme(t); setTheme(t); }];
}

// ─── account menu: name ▾ → Account · Appearance · Sign out ───
function AccountMenu({ me, onSignOut, unread = 0, onHelpdesk, onDocs }) {
  const [open, setOpen] = useState(false); const [acct, setAcct] = useState(false);
  const [theme, setTheme] = useTheme();
  const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  useEffect(() => { const k = e => { if (e.key === "Escape") { setOpen(false); setAcct(false); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const initial = (me.name || "?")[0].toUpperCase();
  return (
    <div className="acct" ref={ref}>
      <button type="button" className={`acct-btn ${open ? "on" : ""}`} onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{initial}{unread > 0 && <span className="acct-dot" title={`${unread} new helpdesk message${unread > 1 ? "s" : ""}`}/>}</span><span className="hide-sm">{me.name}</span><span className="caret">▾</span>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-h"><span className="avatar lg">{initial}</span><div><b>{me.name}</b><div className="sub">{me.email}</div></div></div>
          <button type="button" role="menuitem" className="acct-it" onClick={() => { setAcct(true); setOpen(false); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>Account</button>
          <button type="button" role="menuitem" className="acct-it" onClick={() => { setOpen(false); onHelpdesk(); }}><HelpdeskIcon/>Helpdesk{unread > 0 && <span className="tab-n acct-n">{unread}</span>}</button>
          <button type="button" role="menuitem" className="acct-it" onClick={() => { setOpen(false); onDocs(); }}><GuideIcon/>Docs<span className="acct-hint">how to use · golden rules</span></button>
          <div className="acct-it static">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>Appearance
            <div className="sg acct-theme">{[["dark", "Dark"], ["light", "Light"]].map(([k, l]) => <button key={k} type="button" className={theme === k ? "on" : ""} onClick={() => setTheme(k)}>{l}</button>)}</div>
          </div>
          <button type="button" role="menuitem" className="acct-it out" onClick={onSignOut}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>Sign out</button>
        </div>
      )}
      {acct && (
        <div className="overlay" onClick={() => setAcct(false)}>
          <div className="modal acct-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Account">
            <button className="x" onClick={() => setAcct(false)} aria-label="Close">✕</button>
            <div className="acct-h big"><span className="avatar xl">{initial}</span><div><div className="m-name">{me.name}</div><div className="sub">Hyperplane by QuantFriday</div></div></div>
            <div className="acct-rows">
              <div><span className="lbl">Email</span><span>{me.email}</span></div>
              <div><span className="lbl">Access until</span><span>{me.expires_on ? new Date(me.expires_on + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "No end date"}</span></div>
              <div><span className="lbl">Appearance</span><div className="sg">{[["dark", "Dark"], ["light", "Light"]].map(([k, l]) => <button key={k} type="button" className={theme === k ? "on" : ""} onClick={() => setTheme(k)}>{l}</button>)}</div></div>
            </div>
            <p className="sub">To change your email or password, or to renew your access, raise a query in the <b>Helpdesk</b>.</p>
            <div className="acct-f"><button type="button" className="acct-out" onClick={onSignOut}>Sign out</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── small pieces ────────────────────────────────────────────────────────────
function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="lgb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0d1b33"/><stop offset="1" stopColor="#070d1a"/></linearGradient>
        <linearGradient id="lgp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee"/><stop offset="1" stopColor="#6366f1"/></linearGradient></defs>
      <rect x="1.5" y="1.5" width="61" height="61" rx="16" fill="url(#lgb)" stroke="#1f3a5f" strokeWidth="1.5"/>
      <path d="M7 37 L35 27 L57 34 L29 45 Z" fill="url(#lgp)" opacity=".9"/>
      <line x1="32" y1="36" x2="32" y2="12" stroke="#e0f2fe" strokeWidth="3.6" strokeLinecap="round"/>
      <path d="M26.5 17 L32 10 L37.5 17" fill="none" stroke="#e0f2fe" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
const TowerIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>);
const GuideIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>);
const Brand = () => <div className="brand"><Logo/><div><div className="brand-name">Hyperplane</div><div className="brand-by">by QuantFriday</div></div></div>;

const dirKey = d => d === 1 ? "up" : d === -1 ? "down" : "side";
const dirWord = d => d === 1 ? "uptrend" : d === -1 ? "downtrend" : "sideways";
function Meter({ v, d, label = "" }) {                     // ▂▃▅▆█ 84%  (bars lit = strength, colour = direction)
  if (v == null) return <span className="meter none">—</span>;
  const a = Math.abs(v), lit = Math.max(1, Math.min(5, Math.ceil(a / 20)));
  return <span className={`meter ${dirKey(d)}`} title={`${label ? label + ": " : ""}${dirWord(d)} · trend strength ${a}% (not a price move)`}>
    <span className="bars" aria-hidden="true">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= lit ? "on" : ""}/>)}</span>{a}%</span>;
}
const StrengthTag = ({ v, d, big }) => v == null ? <span className="stag none">No data</span>
  : <span className={`stag ${dirKey(d)} ${big ? "big" : ""}`} title={`Trend strength ${Math.abs(v)}% (${dirWord(d)}) — not a price move`}><b>{Math.abs(v)}%</b> strength</span>;
const StrengthBar = ({ v, d }) => <div className="sbar"><div className={`sbar-f ${d === 1 ? "up" : d === -1 ? "down" : "side"}`} style={{ width:`${v == null ? 0 : Math.abs(v)}%` }}/></div>;

function CopyBtns({ syms, compact }) {
  const [done, setDone] = useState("");
  const go = async kind => { if (await copyText(kind === "tv" ? syms.map(s => `NSE:${s},`).join("") : syms.join(","))) { setDone(kind); setTimeout(() => setDone(""), 1300); } };
  return (
    <span className="copybtns" onClick={e => e.stopPropagation()}>
      <button className="cbtn" onClick={() => go("plain")} title="Copy as A,B,C">{done === "plain" ? "✓" : compact ? "⎘" : "⎘ Copy"}</button>
      <button className="cbtn tv" onClick={() => go("tv")} title="Copy for a TradingView watchlist (NSE:A,NSE:B,)">{done === "tv" ? "✓" : "TV"}</button>
    </span>
  );
}

function Info({ text, right }) {
  return <span className="info" tabIndex={0} onClick={e => e.stopPropagation()} aria-label={text}>i<span className={`info-pop ${right ? "r" : ""}`}>{text}</span></span>;
}

// Joined button group (Control-Tower style); multi = several can be on
function Seg({ items, isOn, onPick }) {
  return <div className="sg">{items.map(([k, l, tone, title]) =>
    <button key={k} type="button" title={title} className={`${isOn(k) ? "on" : ""} ${tone || ""}`} onClick={() => onPick(k)}>{l}</button>)}</div>;
}

function MultiSelect({ label, options, value, onChange, width = 200 }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const shown = options.filter(o => !q || o.toLowerCase().includes(q.toLowerCase()));
  const toggle = o => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
  return (
    <div className="ms" ref={ref} style={{ width }}>
      <button type="button" className={`ms-btn ${value.length ? "on" : ""}`} onClick={() => setOpen(v => !v)}>
        <span>{value.length === 0 ? `All ${label}` : value.length === 1 ? value[0] : `${value.length} ${label}`}</span><span className="caret">▾</span>
      </button>
      {open && (
        <div className="ms-pop">
          {options.length > 8 && <input autoFocus className="ms-q" placeholder={`Search ${label}`} value={q} onChange={e => setQ(e.target.value)}/>}
          {value.length > 0 && <button type="button" className="ms-clear" onClick={() => onChange([])}>Clear {value.length}</button>}
          <div className="ms-list">
            {shown.map(o => <label key={o} className="ms-item"><input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)}/><span>{o}</span></label>)}
            {!shown.length && <div className="ms-empty">Nothing found</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── sign in / register ──────────────────────────────────────────────────────
function Hero() {
  const feats = [
    ["Uptrend or downtrend — with a strength", "Every NSE stock on Daily, Weekly, Monthly, Quarterly and Yearly: ▲ or ▼, scored 0–100."],
    ["Sector & industry strength", "See which sectors and industries lead or lag, on each timeframe or combined."],
    ["Spot bidirectional stocks", "Know when the short term and the long term disagree — before you act."],
    ["Updated every session", "Fresh after every market session, with copy-to-TradingView in one click."],
  ];
  return (
    <div className="hero">
      <div className="hero-grid"/>
      <Brand/>
      <h2 className="hero-h">Know the trend<br/><span>before you trade.</span></h2>
      <p className="hero-p">Hyperplane reads every NSE stock across five timeframes and turns it into one clear picture — direction, strength and sector, in plain words.</p>
      <ul className="feats">{feats.map(([h, t]) => <li key={h}><span className="tick">✓</span><div><b>{h}</b><span>{t}</span></div></li>)}</ul>
      <div className="hero-demo">
        {[["Daily","up",82],["Weekly","up",71],["Monthly","side",12],["Quarterly","down",44],["Yearly","down",58]].map(([l, k, v]) => (
          <div key={l} className="hd-row"><span>{l}</span><span className={`tc ${k}`}>{k === "up" ? "▲" : k === "down" ? "▼" : "◆"} {v}</span><div className="sbar"><div className={`sbar-f ${k}`} style={{ width:`${v}%` }}/></div></div>
        ))}
        <div className="hd-note">Example · bidirectional: short term up, long term down</div>
      </div>
    </div>
  );
}

function AuthScreen({ onIn, notice }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name:"", email:"", phone:"", country:"India", state:"", city:"", password:"", confirm:"", accept:false });
  const [msg, setMsg] = useState(notice || ""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const submit = async e => {
    e.preventDefault(); setMsg(""); setBusy(true);
    try {
      if (mode === "login") { await api("/app/api/login", { method:"POST", json:{ email:f.email, password:f.password } }); onIn(); }
      else {
        if (f.password !== f.confirm) throw new Error("The two passwords do not match");
        if (!f.accept) throw new Error("Please tick the box to agree to the terms");
        const r = await api("/app/api/register", { method:"POST", json:{ name:f.name, email:f.email, phone:f.phone, country:f.country, state:f.state, city:f.city, password:f.password, accept:f.accept } });
        setOk(r.message); setMode("login");
      }
    } catch (x) { setMsg(x.message); } finally { setBusy(false); }
  };
  const Field = (label, input) => <label className="field"><span>{label}</span>{input}</label>;
  return (
    <div className="auth-page">
      <Hero/>
      <div className="auth-side">
        <form className="auth" onSubmit={submit}>
          <h1>{mode === "login" ? "Welcome back" : "Create your free account"}</h1>
          <p className="muted">{mode === "login" ? "Sign in to see today's trends." : "It takes a minute. Your account becomes active once QuantFriday approves it."}</p>
          {ok && <div className="ok">{ok}</div>}
          {mode === "register" && <>
            {Field("Full name", <input value={f.name} onChange={set("name")} required maxLength={80} autoComplete="name"/>)}
            <div className="grid2">
              {Field("Phone", <input value={f.phone} onChange={set("phone")} required maxLength={20} autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210"/>)}
              {Field("City", <input value={f.city} onChange={set("city")} maxLength={60} autoComplete="address-level2"/>)}
              {Field("Country", <select value={f.country} onChange={e => setF(p => ({ ...p, country:e.target.value, state:"" }))}>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select>)}
              {Field("State", f.country === "India"
                ? <select value={f.state} onChange={set("state")} required><option value="">Choose your state</option>{IN_STATES.map(s => <option key={s}>{s}</option>)}</select>
                : <input value={f.state} onChange={set("state")} required maxLength={60}/>)}
            </div>
          </>}
          {Field("Email", <input type="email" value={f.email} onChange={set("email")} required maxLength={255} autoComplete="email" placeholder="you@example.com"/>)}
          {mode === "register"
            ? <div className="grid2">
                {Field("Password", <input type="password" value={f.password} onChange={set("password")} required minLength={8} maxLength={128} autoComplete="new-password" placeholder="8+ characters"/>)}
                {Field("Confirm password", <input type="password" value={f.confirm} onChange={set("confirm")} required maxLength={128} autoComplete="new-password"/>)}
              </div>
            : Field("Password", <input type="password" value={f.password} onChange={set("password")} required maxLength={128} autoComplete="current-password"/>)}
          {mode === "register" && (
            <label className={`agree ${f.accept ? "on" : ""}`}>
              <input type="checkbox" checked={f.accept} onChange={set("accept")}/>
              <span><b>I agree to the terms.</b> {DISCLAIMER}</span>
            </label>
          )}
          {msg && <div className="err" role="alert">{msg}</div>}
          <button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
          <div className="switch">
            {mode === "login" ? <>New to Hyperplane? <a href="#" onClick={e => { e.preventDefault(); setMode("register"); setMsg(""); setOk(""); }}>Create a free account</a></>
                              : <>Already have an account? <a href="#" onClick={e => { e.preventDefault(); setMode("login"); setMsg(""); }}>Sign in</a></>}
          </div>
        </form>
        <p className="fine center">{DISCLAIMER}</p>
      </div>
    </div>
  );
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
  const nodes = resolveCollisions(items.map(i => ({ ...i, r:R(i.size), x:X(i.x), y:Y(i.y) }))).sort((a, b) => a.key === hover ? 1 : b.key === hover ? -1 : b.r - a.r);
  const q = [["STRONG + BULLISH","#00c896"],["STRONG + BEARISH","#ffaa00"],["WEAK + BULLISH","#a259ff"],["WEAK + BEARISH","#ff4454"]];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="qchart">
      {[0,20,40,60,80,100].map(v => <g key={v}><line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} className="gridl"/><text x={pad.l - 8} y={Y(v) + 3} textAnchor="end" className="tick-t">{v}</text></g>)}
      <line x1={X(0)} x2={X(0)} y1={pad.t} y2={h - pad.b} className="zero"/>
      <text x={w / 2} y={h - 8} textAnchor="middle" className="ax-t">NET BIAS  (bearish ← 0 → bullish)</text>
      {selected.length > 0 && <text x={w - pad.r} y={h - 8} textAnchor="end" className="ax-t sel-t">{selected.length} selected · click again to clear</text>}
      <text x={13} y={h / 2} textAnchor="middle" className="ax-t" transform={`rotate(-90 13 ${h / 2})`}>STRENGTH SCORE</text>
      <text x={w - pad.r} y={pad.t + 12} textAnchor="end" className="q-t" fill={q[0][1]}>{q[0][0]}</text>
      <text x={pad.l + 4} y={pad.t + 12} className="q-t" fill={q[1][1]}>{q[1][0]}</text>
      <text x={w - pad.r} y={h - pad.b - 6} textAnchor="end" className="q-t" fill={q[2][1]}>{q[2][0]}</text>
      <text x={pad.l + 4} y={h - pad.b - 6} className="q-t" fill={q[3][1]}>{q[3][0]}</text>
      {nodes.map(n => {
        const on = selected.includes(n.key), dim = selected.length > 0 && !on, r = hover === n.key ? n.r + 3 : n.r;
        return (
          <g key={n.key} onClick={() => onSelect && onSelect(n.key)} onMouseEnter={() => setHover(n.key)} onMouseLeave={() => setHover(k => k === n.key ? null : k)} style={{ cursor:"pointer", opacity: dim && hover !== n.key ? .28 : 1 }}>
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
      <div className="panel-h"><div><div className="panel-t">🏭 Sector Strength Leaderboard <Info text="Each bubble is a sector. Right = more bullish signals than bearish (net bias), up = stronger (0–100), bigger = more activity. Click a sector to filter the industries and the master data; click it again to clear."/></div><div className="sub">{tfLabel} · bubble size = activity · click to filter</div></div><ViewToggle v={view} set={setView}/></div>
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
        <div className="row-gap">{view === "list" && <div className="seg"><button className={side === "up" ? "on up" : ""} onClick={() => setSide("up")}>▲ Bullish</button><button className={side === "down" ? "on down" : ""} onClick={() => setSide("down")}>▼ Bearish</button></div>}<ViewToggle v={view} set={setView}/></div></div>
      {view === "bubble"
        ? <QuadrantChart selected={selected} onSelect={onPick} items={bubbles.map(r => ({ key:r.k, label:r.k, x:r.nb, y:r.st, size:r.sig || r.n, color:colorOf(r.sec),
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
function StockCard({ s, data, onOpen, onClose }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const asOf = data && data.as_of;
  const rows = TFS.map(([k, l, hint], i) => ({ k, l, hint, v:s.sc[i], d:dirTf(s, i) }));
  const ups = rows.filter(r => r.d === 1), dns = rows.filter(r => r.d === -1);
  const od = dirVal(s.os), bi = isBi(s, []);
  const indPeers = useMemo(() => (data ? data.stocks : []).filter(x => x.os != null && x.sec === s.sec && x.ind === s.ind)
    .sort((a, b) => b.os - a.os), [data, s]);
  const indRank = indPeers.findIndex(x => x.s === s.s) + 1;
  // sector / industry rows per timeframe (lists come sorted strongest first → rank = position)
  const ctx = (tf, ind) => { const list = ((ind ? data.industries : data.sectors) || {})[tf] || [];
    const i = list.findIndex(r => ind ? r.k === s.ind && r.sec === s.sec : r.k === s.sec);
    return i < 0 ? null : { ...list[i], rank:i + 1, of:list.length }; };
  const top = indPeers.slice(0, 5), showSelf = indRank > 5;
  const secA = data ? ctx("A", false) : null, indA = data ? ctx("A", true) : null;
  const view = combinedView(od, bi, secA, indA);
  const grp = (kind, name, g) => (
    <div className="cv-row"><span className="cv-k">{kind}</span>
      <span className="cv-v"><b>{name}</b>{g
        ? <> is <span className={`cv-st ${groupState(g)}`}>{GROUP_WORD[groupState(g)]}</span> <span className="dim mono">· {Math.round(g.st)}% · #{g.rank} of {g.of}</span></>
        : <span className="dim"> — no data</span>}</span></div>
  );
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={s.n}>
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
        <div className="m-head">
          <div><div className="m-name">{s.n}</div><div className="sub"><span className="sym">{s.s}</span> · {s.sec} › {s.ind} · {sizeOf(s)} cap{s.f ? " · F&O" : ""}{s.h && <> · <span className={`bgtag ${s.h}`}>{BG_NAME[s.h]} reliability</span></>}</div>
            <span className="tcopy m-copy" title={`Copy ${s.s} only`}><span className="lbl">Copy {s.s}</span><CopyBtns syms={[s.s]}/></span></div>
          <div className="m-price"><div className="mono">₹{s.p}</div>{s.c != null && <div className={`mono ${s.c >= 0 ? "up" : "down"}`}>{s.c >= 0 ? "+" : ""}{s.c}% today</div>}</div>
        </div>
        <div className="m-overall">
          <div className="mo-cell"><span className="lbl">Combined trend strength</span><StrengthTag v={s.os} d={od} big/><span className="grp-w">{od === 0 ? "Sideways" : od === 1 ? `${strengthWord(Math.abs(s.os))} uptrend` : od === -1 ? `${strengthWord(Math.abs(s.os))} downtrend` : "—"}</span></div>
          <div className="mo-cell"><span className="lbl">Direction</span><span className={`dirtag ${bi ? "bi" : od === 1 ? "up" : od === -1 ? "down" : "side"}`}>{bi ? "⇅ Bidirectional" : ups.length && !dns.length ? "▲ One-directional up" : dns.length && !ups.length ? "▼ One-directional down" : "◆ Sideways"}</span></div>
          {view && <div className={`cv-verdict ${view.tone}`}>{view.title}</div>}
          <div className="mo-sum">
            <div className="lbl">Combined view <Info text="The stock, its sector and its industry read together (Combined timeframe). A group is strong when it ranks in the top quarter or is above 55%, weak when it is in the bottom half and under 45%. The best ideas have all three pointing the same way — see Docs → golden rules."/></div>
            <div className="cv-row"><span className="cv-k">Stock</span><span className="cv-v">{summaryOf(s)}</span></div>
            {grp("Sector", s.sec, secA)}
            {grp("Industry", s.ind, indA)}
            {view && <div className={`cv-say ${view.tone}`}>{view.text}</div>}
          </div>
        </div>
        <div className="m-rows">
          {rows.map(r => (
            <div key={r.k} className="m-row">
              <div className="m-l"><b>{r.l}</b><span className="sub">{r.hint}</span></div>
              <StrengthBar v={r.v} d={r.d}/>
              <StrengthTag v={r.v} d={r.d}/>
              <span className={`dirtag sm ${r.d === 1 ? "up" : r.d === -1 ? "down" : "side"}`}>{r.v == null ? "No data" : r.d === 1 ? "Uptrend" : r.d === -1 ? "Downtrend" : "Sideways"}</span>
            </div>
          ))}
        </div>

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
                    <td key={tf} className={tf === "A" ? "ctx-a" : ""} title={r ? `${strengthLabel(r.st)} · rank #${r.rank} of ${r.of} · ${r.adv} advancing / ${r.dec} declining · avg move ${r.avg}%` : "No data"}>
                      {r ? <><span className={`ss ${strengthCls(r.st)}`}>{Math.round(r.st)}%</span><span className="rk">#{r.rank}/{r.of}</span></> : <span className="dim">—</span>}
                    </td>); })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {indPeers.length > 1 && <>
          <div className="m-sec-t">Top {top.length} strongest in {s.ind} <span className="tcopy"><span className="lbl">Ticker copy · {top.length}</span><CopyBtns syms={top.map(x => x.s)} compact/></span></div>
          <div className="peers">
            {[...top.map((p, i) => [p, i + 1]), ...(showSelf ? [[s, indRank]] : [])].map(([p, rk]) => (
              <button key={p.s} type="button" className={`peer ${p.s === s.s ? "me" : ""} ${showSelf && p.s === s.s ? "gap" : ""}`} onClick={() => p.s !== s.s && onOpen(p)} title={p.s === s.s ? "This stock" : `Open ${p.n}`}>
                <span className="mono dim">#{rk}</span><span className="sym">{p.s}</span><span className="sub pn">{p.n}</span><Meter v={p.os} d={dirVal(p.os)} label="Combined"/>
              </button>))}
          </div>
        </>}

        <div className="m-foot"><span className="sub">Data as of {fmtDT(asOf)} · strength = how strong the trend is in its own direction (0–100%)</span></div>
        <p className="fine">{DISCLAIMER}</p>
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────
const EMPTY = { sectors:[], industries:[], sizes:[], bg:[], fno:false, trend:"all" };

function Home({ me, onOut }) {
  const [data, setData] = useState(null); const [err, setErr] = useState("");
  const [f, setF] = useState(EMPTY); const [tfs, setTfs] = useState([]);
  const [q, setQ] = useState(""); const [sort, setSort] = useState("up"); const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const [view, setView] = useState("tower"); const [hdReq, setHdReq] = useState(null);
  const hdApi = useCallback((p, o) => api(p, o).catch(e => { if (e.status === 401 || e.status === 403) onOut(e.message); throw e; }), []);
  const unread = useHelpdeskUnread(hdApi, "/app/api/helpdesk");
  const openHelpdesk = id => { setView("helpdesk"); setHdReq({ id, n: Date.now() }); };
  useEffect(() => { api("/app/api/data").then(setData).catch(e => { if (e.status === 401 || e.status === 403) onOut(e.message); else setErr(e.message); }); }, []);
  useEffect(() => setPage(0), [f, tfs, q, sort]);
  const stocks = data ? data.stocks : [];
  const sectorOpts = useMemo(() => [...new Set(stocks.map(s => s.sec))].sort(), [stocks]);
  const industryOpts = useMemo(() => [...new Set(stocks.filter(s => !f.sectors.length || f.sectors.includes(s.sec)).map(s => s.ind))].sort(), [stocks, f.sectors]);
  const base = useMemo(() => stocks.filter(s => (!f.sectors.length || f.sectors.includes(s.sec)) && (!f.industries.length || f.industries.includes(s.ind))
    && (!f.sizes.length || f.sizes.includes(sizeOf(s))) && (!f.bg.length || f.bg.includes(s.h)) && (!f.fno || s.f)), [stocks, f]);
  const hasBg = stocks.some(s => s.h);
  const filtered = useMemo(() => { const qq = q.trim().toLowerCase();
    const ok = s => f.trend === "all" || categoryOf(s, tfs) === f.trend;
    return base.filter(s => ok(s) && (!qq || s.s.toLowerCase().includes(qq) || s.n.toLowerCase().includes(qq))); }, [base, f.trend, tfs, q]);
  const sorted = useMemo(() => {
    const v = s => focusOf(s, tfs), arr = [...filtered];
    if (sort === "up") arr.sort((a, b) => (v(b) ?? -999) - (v(a) ?? -999) || (b.os ?? -999) - (a.os ?? -999) || a.n.localeCompare(b.n));
    else if (sort === "down") arr.sort((a, b) => (v(a) ?? 999) - (v(b) ?? 999) || (a.os ?? 999) - (b.os ?? 999) || a.n.localeCompare(b.n));
    else if (sort === "change") arr.sort((a, b) => (b.c ?? -99) - (a.c ?? -99));
    else arr.sort((a, b) => a.n.localeCompare(b.n));
    return arr;
  }, [filtered, sort, tfs]);
  const cats = useMemo(() => { const c = { up:0, down:0, bi:0, side:0 }; base.forEach(s => { const k = categoryOf(s, tfs); if (k) c[k]++; }); return c; }, [base, tfs]);
  const nUp = cats.up, nDown = cats.down, nBi = cats.bi;
  const panelTf = tfs.length === 1 ? tfs[0] : "A";
  const tfLabel = tfs.length > 1 ? "Combined (pick one timeframe to see it alone)" : TF_NAME[panelTf];
  const focusLabel = !tfs.length ? "Combined" : tfs.length === 1 ? TF_NAME[tfs[0]] : `Avg ${tfs.join("+")}`;
  const secRows = data ? (data.sectors || {})[panelTf] || [] : [], indRows = data ? (data.industries || {})[panelTf] || [] : [];
  const PAGE = 50, pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  // removing a sector also removes its industries; clearing all sectors clears the industries
  const setK = (k, v) => setF(p => ({ ...p, [k]: v, ...(k === "sectors" && v.length < p.sectors.length
    ? { industries: v.length ? p.industries.filter(i => stocks.some(s => s.ind === i && v.includes(s.sec))) : [] } : {}) }));
  const pick = (k, v) => setK(k, f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v]);
  const toggleTf = t => setTfs(p => p.includes(t) ? p.filter(x => x !== t) : "DWMQY".split("").filter(x => x === t || p.includes(x)));
  const setTrend = t => { setK("trend", t); if (t === "down") setSort("down"); else if (t === "up") setSort("up"); };
  const active = f.sectors.length || f.industries.length || f.sizes.length || f.bg.length || f.fno || f.trend !== "all" || tfs.length;
  const scope = tfs.length ? (tfs.length === 1 ? TF_NAME[tfs[0]] : `all of ${tfs.join(" · ")}`) : "combined";

  return (
    <div className="page">
      <header className="top">
        <button type="button" className="brand-home" onClick={() => setView("tower")} title="Control Tower"><Brand/></button>
        <div className="asof">{data ? <>DATA AS OF <b>{fmtDT(data.as_of)}</b></> : "Loading…"}</div>
        <InboxBell unread={unread} onOpen={openHelpdesk}/>
        <AccountMenu me={me} unread={unread.total} onHelpdesk={() => openHelpdesk(null)} onDocs={() => { setView("guide"); window.scrollTo(0, 0); }}
          onSignOut={async () => { await api("/app/api/logout", { method:"POST" }).catch(() => {}); onOut(); }}/>
      </header>
      {view !== "tower" && (
        <div className="crumb">
          <button type="button" onClick={() => setView("tower")}><TowerIcon/>← Control Tower</button>
          <span className="crumb-sep">/</span>
          <span className="crumb-here">{view === "helpdesk" ? <><HelpdeskIcon/>Helpdesk</> : <><GuideIcon/>Docs</>}</span>
        </div>
      )}

      {view === "guide" && <Guide disclaimer={DISCLAIMER}/>}
      {view === "helpdesk" && <Helpdesk api={hdApi} base="/app/api/helpdesk" openReq={hdReq} onChanged={unread.refresh}/>}
      {view === "tower" && <>
      <div className="fbar">
        <div className="fg"><span className="fl">Timeframe <Info text="Combined = all five timeframes together. Pick one timeframe, or several (they must all agree for Uptrend / Downtrend)."/></span>
          <Seg items={[["A","Combined",null,"All five timeframes together"], ...TFS.map(([k, l]) => [k, k, null, l])]} isOn={k => k === "A" ? !tfs.length : tfs.includes(k)}
            onPick={k => k === "A" ? setTfs([]) : toggleTf(k)}/></div>
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
        {active ? <button className="reset" onClick={() => { setF(EMPTY); setTfs([]); setSort("up"); }} title="Clear every filter">✕ Reset</button> : null}
      </div>

      {err && <div className="card empty">{err}</div>}
      {!data && !err && <div className="card empty">Loading the latest data…</div>}
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
              <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
                <option value="up">Strongest uptrend first</option><option value="down">Strongest downtrend first</option>
                <option value="change">Biggest gain today</option><option value="name">Name A–Z</option>
              </select>
              <span className="tcopy"><span className="lbl">Ticker copy · {sorted.length}</span><CopyBtns syms={sorted.map(s => s.s)}/></span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th rowSpan={2}>#</th><th rowSpan={2}>Stock</th><th rowSpan={2} className="hide-sm">Sector · Industry</th><th rowSpan={2} className="num">Price</th><th rowSpan={2}>Trend</th>
                  <th rowSpan={2} title="How strong the trend is on the chosen timeframe(s), 0–100% — not a price move">Trend strength</th>
                  <th colSpan={5} className="hide-sm grp-h" title="How strong the trend is on each timeframe, 0–100%. Bars lit = strength, colour = direction. Not a price move.">Trend strength by timeframe <span>(0–100%)</span></th>
                  <th rowSpan={2} className="hide-sm">Ticker copy</th></tr>
                <tr>{TFS.map(([k, l]) => <th key={k} className={`num hide-sm ${tfs.includes(k) ? "hl" : ""}`} title={`${l} trend strength`}>{l}</th>)}</tr>
              </thead>
              <tbody>
                {sorted.slice(page * PAGE, page * PAGE + PAGE).map((s, i) => { const v = focusOf(s, tfs), d = focusDir(s, tfs), cat = categoryOf(s, tfs); return (
                  <tr key={s.s} onClick={() => setOpen(s)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setOpen(s)}>
                    <td className="mono dim">{page * PAGE + i + 1}</td>
                    <td><span className="sym">{s.s}</span>{s.f ? <span className="fno">F&amp;O</span> : null}{isBi(s, []) && <span className="bi-tag" title="Uptrend on some timeframes, downtrend on others">⇅</span>}<div className="sub">{s.n} · {sizeOf(s)}</div></td>
                    <td className="hide-sm"><span className="sec" style={{ color:colorOf(s.sec) }}>● {s.sec}</span><div className="sub">{s.ind}</div></td>
                    <td className="num mono">₹{s.p}{s.c != null && <div className={`small ${s.c >= 0 ? "up" : "down"}`}>{s.c >= 0 ? "+" : ""}{s.c}%</div>}</td>
                    <td>{cat ? <span className={`dirtag ${CAT[cat][1]}`}>{CAT[cat][0]}</span> : <span className="dim">—</span>}</td>
                    <td className="cur" title={v == null ? "" : `Trend strength ${Math.abs(v)}% — not a price move`}><span className={`pct ${dirKey(d)}`}>{pct(v)}</span><StrengthBar v={v} d={d}/></td>
                    {TFS.map(([k], j) => <td key={k} className={`num hide-sm ${tfs.includes(k) ? "hl" : ""}`}><Meter v={s.sc[j]} d={dirTf(s, j)} label={TFS[j][1]}/></td>)}
                    <td className="hide-sm"><CopyBtns syms={[s.s]} compact/></td>
                  </tr>); })}
                {!sorted.length && <tr><td colSpan={13} className="empty">No stocks match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && <div className="pager"><button className="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Previous</button><span className="sub mono">Page {page + 1} / {pages}</span><button className="ghost" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next ›</button></div>}
        </section>
      </>}
      </>}

      <footer><p className="fine">{DISCLAIMER}</p><p className="fine">© {new Date().getFullYear()} QuantFriday · Hyperplane</p></footer>
      {open && <StockCard key={open.s} s={open} data={data} onOpen={setOpen} onClose={() => setOpen(null)}/>}
    </div>
  );
}

function App() {
  const [me, setMe] = useState(undefined); const [notice, setNotice] = useState("");
  const load = () => api("/app/api/me").then(setMe).catch(e => { setMe(null); if (e.status === 403) setNotice(e.message); });
  useEffect(() => { load(); }, []);
  if (me === undefined) return <div className="loading"><Brand/></div>;
  if (!me) return <AuthScreen onIn={load} notice={notice}/>;
  return <Home me={me} onOut={msg => { setNotice(typeof msg === "string" ? msg : ""); setMe(null); }}/>;
}

// Same palette and type as the Hyperplane dashboard (dark)
const CSS = `
:root{--mono:'IBM Plex Mono',ui-monospace,monospace;--sans:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --bg:#060b14;--s1:#0d1520;--s2:#131e2e;--s3:#192540;--b1:#1b2d48;--b2:#243859;
  --acc:#00e5ff;--adim:rgba(0,229,255,.1);--accb:rgba(0,229,255,.25);
  --long:#00c896;--longd:rgba(0,200,150,.12);--short:#ff4454;--shortd:rgba(255,68,84,.12);--mixed:#ffaa00;--mixedd:rgba(255,170,0,.12);
  --ret:#a259ff;--retd:rgba(162,89,255,.12);--t1:#d0dff0;--t2:#6a86a6;--t3:#46607d;color-scheme:dark;
  --on-acc:#04121a;--glass:rgba(13,21,32,.96);--hover:rgba(255,255,255,.03);--pop:#0a1220;--sel-t:#fff}
:root[data-theme="light"]{--bg:#f3f6fa;--s1:#ffffff;--s2:#f3f6fa;--s3:#e2e8f0;--b1:#dfe6ef;--b2:#c9d4e2;
  --acc:#0891b2;--adim:rgba(8,145,178,.09);--accb:rgba(8,145,178,.32);
  --long:#059669;--longd:rgba(5,150,105,.1);--short:#dc2626;--shortd:rgba(220,38,38,.08);--mixed:#d97706;--mixedd:rgba(217,119,6,.1);
  --ret:#7c3aed;--retd:rgba(124,58,237,.08);--t1:#0f1b2d;--t2:#4b5f7a;--t3:#8394aa;color-scheme:light;
  --on-acc:#ffffff;--glass:rgba(255,255,255,.94);--hover:rgba(15,27,45,.04);--pop:#ffffff;--sel-t:#0f1b2d}
:root[data-theme="light"] .b-t{filter:brightness(.6) saturate(1.5);stroke:none}
:root[data-theme="light"] .modal{box-shadow:0 30px 70px -20px rgba(15,27,45,.35)}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--t1);font:13.5px/1.5 var(--sans)}
button{font:inherit;cursor:pointer;color:inherit}a{color:var(--acc)}.mono{font-family:var(--mono)}
.muted{color:var(--t2)}.sub{font-size:11.5px;color:var(--t2)}.small{font-size:11.5px}.dim{color:var(--t3)}.fine{font-size:10.5px;color:var(--t3);line-height:1.55;max-width:920px}.center{text-align:center;margin:0 auto}
.lbl{font-size:9.5px;color:var(--t2);text-transform:uppercase;letter-spacing:.9px;font-weight:700}
.card{background:var(--s1);border:1px solid var(--b1);border-radius:10px}.up{color:var(--long)}.down{color:var(--short)}
.brand{display:flex;align-items:center;gap:10px}.brand-name{font:700 19px/1.05 'Oxanium',var(--mono);letter-spacing:.9px;color:var(--t1)}.brand-name b{color:var(--acc);font-weight:700}.brand-by{font-size:11px;color:var(--t2);margin-top:2px}
.loading{min-height:100vh;display:flex;align-items:center;justify-content:center}
input,select{font:inherit;color:var(--t1);background:var(--s2);border:1px solid var(--b2);border-radius:7px;padding:9px 11px;width:100%;min-width:0;color-scheme:dark}
input:focus,select:focus{outline:2px solid var(--accb);border-color:var(--acc)}
.primary{background:linear-gradient(135deg,#00e5ff,#3b82f6);color:var(--on-acc);border:0;border-radius:8px;padding:11px;font-weight:800;font-size:14.5px;letter-spacing:.3px;box-shadow:0 10px 28px -12px rgba(0,229,255,.6)}
.primary:disabled{opacity:.6}.ghost{background:var(--s2);border:1px solid var(--b2);border-radius:7px;padding:6px 12px;white-space:nowrap;font-size:12px;color:var(--t1)}.ghost:disabled{opacity:.35;cursor:default}
.err{color:var(--short);font-size:12.5px}.ok{background:var(--longd);color:var(--long);border:1px solid rgba(0,200,150,.3);border-radius:8px;padding:10px 12px;font-size:12.5px}
/* auth */
.auth-page{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}
.hero{position:relative;overflow:hidden;padding:48px 56px;display:flex;flex-direction:column;justify-content:center;gap:16px;border-right:1px solid var(--b1);
  background:radial-gradient(90% 70% at 10% 0%,rgba(0,229,255,.16),transparent 60%),radial-gradient(70% 60% at 100% 100%,rgba(99,102,241,.18),transparent 60%),var(--bg)}
.hero-grid{position:absolute;inset:0;background-image:linear-gradient(var(--b1) 1px,transparent 1px),linear-gradient(90deg,var(--b1) 1px,transparent 1px);background-size:44px 44px;opacity:.25;mask-image:radial-gradient(80% 70% at 30% 40%,#000,transparent)}
.hero>*{position:relative}.hero-h{font-size:40px;line-height:1.1;margin:14px 0 0;font-weight:800;letter-spacing:-.5px}.hero-h span{background:linear-gradient(90deg,#00e5ff,#818cf8);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero-p{font-size:15px;color:var(--t2);max-width:480px;margin:0;line-height:1.6}
.feats{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-direction:column;gap:13px;max-width:480px}.feats li{display:flex;gap:12px}
.feats b{display:block;font-size:13.5px;color:var(--t1)}.feats span{font-size:12.5px;color:var(--t2)}
.tick{flex-shrink:0;width:22px;height:22px;border-radius:6px;background:var(--adim);border:1px solid var(--accb);color:var(--acc);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}
.hero-demo{margin-top:8px;max-width:420px;background:var(--s1);border:1px solid var(--b1);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:7px}
.hd-row{display:grid;grid-template-columns:80px 64px 1fr;gap:10px;align-items:center;font-size:12px;color:var(--t2)}.hd-note{font-size:10.5px;color:var(--t3);margin-top:2px}
.auth-side{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px 20px}
.auth{width:100%;max-width:460px;padding:30px 28px;display:flex;flex-direction:column;gap:14px;background:var(--s1);border:1px solid var(--b1);border-radius:12px;box-shadow:0 30px 70px -30px rgba(0,0,0,.7)}
.auth h1{font-size:22px;margin:0;font-weight:800}.auth>p{margin:-6px 0 4px;font-size:13px}
.field{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:10.5px;color:var(--t2);font-weight:700;text-transform:uppercase;letter-spacing:.6px}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.agree{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1.5px solid var(--b2);border-radius:10px;background:var(--s2);cursor:pointer;font-size:11.5px;color:var(--t2);line-height:1.5}
.agree.on{border-color:var(--acc);background:var(--adim)}.agree input{width:22px;height:22px;flex-shrink:0;margin:1px 0 0;accent-color:#00e5ff;cursor:pointer}.agree b{color:var(--t1);font-size:12.5px}
.switch{font-size:13px;text-align:center;color:var(--t2)}
/* page */
.page{max-width:1380px;margin:0 auto;padding:0 20px 30px}
.tabs{display:flex;gap:4px;margin:12px 0 0;border-bottom:1px solid var(--b1)}.tabs button{position:relative;display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border:0;border-bottom:2px solid transparent;background:none;color:var(--t2);font-size:13px;font-weight:600;margin-bottom:-1px}.tabs button:hover{color:var(--t1)}.tabs button.on{color:var(--acc);border-bottom-color:var(--acc)}.bgtag{font-weight:700}.bgtag.S{color:var(--long)}.bgtag.M{color:var(--mixed)}.bgtag.W{color:var(--short)}
.brand-home{border:0;background:none;padding:0;text-align:left;color:inherit}
.crumb{display:flex;align-items:center;gap:8px;margin:12px 0 0;font-size:12.5px}
.crumb button{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border:1px solid var(--b2);border-radius:8px;background:var(--s2);color:var(--t2);font-weight:600}
.crumb button:hover{border-color:var(--acc);color:var(--acc)}.crumb-sep{color:var(--t3)}.crumb-here{display:inline-flex;align-items:center;gap:7px;color:var(--t1);font-weight:700}
.avatar{position:relative}.acct-dot{position:absolute;top:-2px;right:-2px;width:9px;height:9px;border-radius:50%;background:#ff4454;box-shadow:0 0 0 2px var(--s2)}
.acct-n{margin-left:auto}.acct-hint{margin-left:auto;font-size:10.5px;color:var(--t3)}
.acct{position:relative}.acct-btn{display:flex;align-items:center;gap:9px;padding:4px 10px 4px 4px;border:1px solid var(--b2);border-radius:999px;background:var(--s2);font-size:12.5px;font-weight:600;color:var(--t1)}
.acct-btn:hover,.acct-btn.on{border-color:var(--acc)}.acct-btn .caret{font-size:10px;color:var(--t2)}
.acct-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:700;width:270px;background:var(--pop);border:1px solid var(--b2);border-radius:12px;box-shadow:0 18px 40px -12px rgba(0,0,0,.5);padding:6px;display:flex;flex-direction:column}
.acct-h{display:flex;align-items:center;gap:10px;padding:8px 8px 10px;border-bottom:1px solid var(--b1);margin-bottom:4px}.acct-h b{font-size:13px}.acct-h .sub{word-break:break-all}
.acct-it{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:8px;background:none;color:var(--t1);font-size:13px;text-align:left}
.acct-it:hover{background:var(--hover)}.acct-it.static{cursor:default}.acct-it.static:hover{background:none}.acct-it svg{color:var(--t2)}
.acct-it.out{color:var(--short);border-top:1px solid var(--b1);border-radius:0 0 8px 8px;margin-top:4px}.acct-it.out svg{color:var(--short)}
.acct-theme{margin-left:auto;height:26px}.acct-theme button{padding:0 10px}
.avatar.lg{width:34px;height:34px;font-size:14px}.avatar.xl{width:46px;height:46px;font-size:18px}
.acct-modal{max-width:440px}.acct-h.big{border:0;padding:0 0 14px}
.acct-rows{display:flex;flex-direction:column;border:1px solid var(--b1);border-radius:10px;background:var(--s1);margin-bottom:12px}
.acct-rows>div{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 14px;border-bottom:1px solid var(--b1)}.acct-rows>div:last-child{border-bottom:0}
.acct-f{display:flex;justify-content:flex-end;margin-top:12px}.acct-out{padding:8px 16px;border-radius:8px;border:1px solid var(--short);background:var(--shortd);color:var(--short);font-weight:700}
.tab-n{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#ff4454;color:#fff;font:700 10px/18px var(--mono);text-align:center}
.page>.hd,.page>.guide{margin-top:12px}
.top{display:flex;align-items:stretch;gap:16px;min-height:56px;flex-wrap:wrap;border-bottom:1px solid var(--b1)}.top>*{align-self:center}.top .tabs{align-self:center;margin:0 0 0 14px;border:0;display:flex;gap:6px}.top .tabs button{margin:0;padding:0 14px;height:34px;border:1px solid var(--b2);border-radius:8px;background:var(--s2);color:var(--t2);transition:border-color .15s,background .15s,color .15s}.top .tabs button:hover{border-color:var(--accb);color:var(--t1)}.top .tabs button.on{border-color:var(--acc);background:var(--adim);color:var(--acc);box-shadow:0 0 0 1px var(--accb) inset}.asof{font:11px var(--mono);color:var(--t2);margin-left:auto;letter-spacing:.4px}.asof b{color:var(--t1)}
.who{display:flex;align-items:center;gap:10px;font-size:12.5px}.avatar{width:28px;height:28px;border-radius:50%;background:var(--adim);border:1px solid var(--accb);color:var(--acc);display:flex;align-items:center;justify-content:center;font:700 12px var(--mono)}
.fbar{position:sticky;top:0;z-index:6;display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 14px;padding:9px 12px;margin:12px 0 12px;background:var(--glass);backdrop-filter:blur(10px);border:1px solid var(--b1);border-radius:10px}
.fg{display:flex;flex-direction:column;gap:5px}.fl{display:flex;align-items:center;gap:5px;font-size:9px;color:var(--t2);text-transform:uppercase;letter-spacing:.9px;font-weight:700;height:13px}
.sg{display:inline-flex;border:1px solid var(--b2);border-radius:6px;overflow:hidden;background:var(--s2);height:27px}
.sg button{background:transparent;border:0;border-right:1px solid var(--b2);padding:0 8px;font-size:11px;font-weight:600;color:var(--t2);white-space:nowrap}
.sg button:last-child{border-right:0}.sg button:hover{color:var(--t1);background:var(--hover)}
.sg button.on{background:var(--adim);color:var(--acc)}.sg button.on.up{background:var(--longd);color:var(--long)}.sg button.on.down{background:var(--shortd);color:var(--short)}.sg button.on.bi{background:var(--retd);color:var(--ret)}.sg button.on.side{background:var(--mixedd);color:var(--mixed)}.sg button.on.flat{background:rgba(106,134,166,.16);color:var(--t1)}
.reset{margin-left:auto;height:27px;padding:0 12px;border:1px solid var(--b2);border-radius:6px;background:transparent;color:var(--t2);font-size:11.5px;font-weight:600}.reset:hover{border-color:var(--short);color:var(--short)}
.info{position:relative;display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border-radius:50%;border:1px solid var(--t3);color:var(--t2);font:700 8.5px/1 var(--sans);text-transform:none;letter-spacing:0;cursor:help;flex-shrink:0;vertical-align:1px}
.info:hover,.info:focus{border-color:var(--acc);color:var(--acc);outline:none}
.info-pop{display:none;position:absolute;top:calc(100% + 7px);left:-10px;z-index:50;width:250px;padding:9px 11px;border-radius:8px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 14px 30px -10px rgba(0,0,0,.8);font:400 11.5px/1.5 var(--sans);color:var(--t1);white-space:normal;text-align:left}
.info-pop.r{left:auto;right:-10px}.info:hover .info-pop,.info:focus .info-pop{display:block}
.chip{border:1px solid var(--b2);background:var(--s2);color:var(--t2);border-radius:6px;padding:5px 11px;font-size:12px;font-weight:600;white-space:nowrap}
.chip:hover{border-color:var(--accb);color:var(--t1)}.chip.on{border-color:var(--acc);background:var(--adim);color:var(--acc)}
.chip.on.up{border-color:var(--long);background:var(--longd);color:var(--long)}.chip.on.down{border-color:var(--short);background:var(--shortd);color:var(--short)}.chip.on.bi{border-color:var(--ret);background:var(--retd);color:var(--ret)}
.seg{display:inline-flex;border:1px solid var(--b2);border-radius:6px;overflow:hidden}.seg button{background:var(--s2);border:0;border-right:1px solid var(--b2);padding:4px 10px;font-size:11px;font-weight:600;color:var(--t2);white-space:nowrap}
.seg button:last-child{border-right:0}.seg button.on{background:var(--adim);color:var(--acc)}.seg button.on.up{background:var(--longd);color:var(--long)}.seg button.on.down{background:var(--shortd);color:var(--short)}
.ms{position:relative}.ms-btn{width:100%;height:27px;display:flex;justify-content:space-between;align-items:center;gap:6px;border:1px solid var(--b2);background:var(--s2);border-radius:6px;padding:0 10px;font-size:11.5px;font-weight:600;color:var(--t2);text-align:left}
.ms-btn span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ms-btn.on{border-color:var(--acc);color:var(--acc);background:var(--adim)}.caret{font-size:9px;opacity:.7}
.ms-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:30;width:max(100%,270px);background:var(--s1);border:1px solid var(--b2);border-radius:10px;box-shadow:0 20px 44px -18px rgba(0,0,0,.8);padding:8px}
.ms-q{padding:7px 9px;font-size:12px;margin-bottom:6px}.ms-clear{background:none;border:0;color:var(--acc);font-size:11.5px;padding:2px 4px;float:right}
.ms-list{max-height:280px;overflow:auto;clear:both}.ms-item{display:flex;align-items:center;gap:8px;padding:6px;border-radius:6px;font-size:12.5px;cursor:pointer;text-transform:none;letter-spacing:0;font-weight:500;color:var(--t1)}
.ms-item:hover{background:var(--s2)}.ms-item input{width:15px;height:15px;accent-color:#00e5ff}.ms-empty{padding:8px;color:var(--t3);font-size:12px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:12px}
.kpi{padding:11px 14px;display:flex;flex-direction:column;gap:3px;position:relative}.kpi::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;border-radius:10px 10px 0 0;background:var(--acc);opacity:.5}
.kpi .lbl{display:flex;align-items:center;gap:5px}
.kpi.up::before{background:var(--long)}.kpi.down::before{background:var(--short)}.kpi.bi::before{background:var(--ret)}.kpi.side::before{background:var(--t3)}.kpi.side b{color:var(--t1)}.kpi.side .kbar div{background:var(--t3)}.kpi.bi .kbar div{background:var(--ret)}
.kpi b{font-size:22px;font-weight:700}.kpi.up b{color:var(--long)}.kpi.down b{color:var(--short)}.kpi.bi b{color:var(--ret)}.kpi b.kname{font:700 15px var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpi small{color:var(--t2);font-size:11px}
.kbar{height:3px;background:var(--s3);border-radius:2px;overflow:hidden;margin-top:5px}.kbar div{height:100%}.kpi.up .kbar div{background:var(--long)}.kpi.down .kbar div{background:var(--short)}
.panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:10px;margin-bottom:12px}
.panel{padding:14px 16px}.panel-h{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;flex-wrap:wrap}.panel-t{font-weight:700;font-size:13px;color:var(--t1)}.row-gap{display:flex;gap:6px}
.qchart{width:100%;height:auto;display:block}.gridl{stroke:var(--b1);stroke-width:1}.zero{stroke:var(--b2);stroke-width:1.2;stroke-dasharray:3 3}
.tick-t{font:10px var(--mono);fill:var(--t2)}.ax-t{font-size:10px;fill:var(--t2);letter-spacing:.6px}.q-t{font-size:9.5px;font-weight:700}.b-t{font:700 9.5px var(--mono);pointer-events:none;paint-order:stroke;stroke:var(--s1);stroke-width:2.5px}
.lb{display:flex;flex-direction:column;gap:3px}.lb-row{display:flex;align-items:center;gap:10px;background:transparent;border:1px solid transparent;border-radius:7px;padding:6px 8px;text-align:left;width:100%}
.lb-row:hover{background:var(--s2)}.lb-row.on{border-color:var(--acc);background:var(--adim)}
.lb-i{width:18px;font:11px var(--mono);color:var(--t3)}.lb-mid{flex:1;min-width:0}.lb-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}.lb-top b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.nb{font:700 11px var(--mono)}.lb-s{font:700 14px var(--mono);width:44px;text-align:right}
.bar{height:5px;background:var(--s3);border-radius:3px;overflow:hidden}.bar>div{height:100%;border-radius:3px}
.badge{font:700 9.5px var(--mono);padding:2px 7px;border-radius:4px;white-space:nowrap}.badge.up{background:var(--longd);color:var(--long)}.badge.side{background:var(--mixedd);color:var(--mixed)}.badge.down{background:var(--shortd);color:var(--short)}
.table-card{padding:0;overflow:hidden}.t-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid var(--b1)}
.t-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.t-tools .search{width:190px;padding:6px 10px;font-size:12.5px}.t-tools select{width:auto;padding:6px 10px;font-size:12px}
.tcopy{display:inline-flex;align-items:center;gap:6px;padding:3px 4px 3px 9px;border:1px solid var(--b2);border-radius:7px;background:var(--s2)}
.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}
th{position:sticky;top:0;background:var(--s2);text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--t2);font-weight:700;padding:9px 12px;border-bottom:1px solid var(--b1);white-space:nowrap}
td{padding:8px 12px;border-bottom:1px solid var(--b1);vertical-align:middle}tbody tr{cursor:pointer}tbody tr:hover,tbody tr:focus{background:var(--hover);outline:none}
th.num,td.num{text-align:center}.hl{background:rgba(0,229,255,.05)}td.cur{min-width:120px}td.cur .sbar{margin-top:5px}
.sym{font:700 12.5px var(--mono);color:var(--acc)}.pct{font:700 13px var(--mono)}.pct.up{color:var(--long)}.pct.down{color:var(--short)}.pct.side{color:var(--t2)}.sel-t{fill:var(--acc)}.sec{font-size:11.5px;font-weight:600}
.fno{margin-left:6px;font:700 8.5px var(--mono);padding:1px 4px;border-radius:3px;background:var(--longd);color:var(--long);vertical-align:2px}
.bi-tag{margin-left:5px;font-size:11px;color:var(--ret)}
.tc{display:inline-flex;align-items:center;justify-content:center;gap:3px;min-width:50px;padding:2px 7px;border-radius:5px;font:700 11.5px var(--mono);white-space:nowrap}
.tc.wide{min-width:62px;font-size:13px;padding:3px 9px}.tc.up{background:var(--longd);color:var(--long)}.tc.down{background:var(--shortd);color:var(--short)}.tc.side{background:rgba(106,134,166,.12);color:var(--t2)}.tc.none{color:var(--t3)}
.meter{display:inline-flex;align-items:center;gap:6px;font:700 12px var(--mono);white-space:nowrap}.meter.up{color:var(--long)}.meter.down{color:var(--short)}.meter.side{color:var(--t2)}.meter.none{color:var(--t3)}.bars{display:inline-flex;align-items:flex-end;gap:2px;height:13px}.bars i{display:block;width:3px;border-radius:1px;background:var(--s3)}.bars i:nth-child(1){height:4px}.bars i:nth-child(2){height:6px}.bars i:nth-child(3){height:8px}.bars i:nth-child(4){height:10.5px}.bars i:nth-child(5){height:13px}.meter.up .bars i.on{background:var(--long)}.meter.down .bars i.on{background:var(--short)}.meter.side .bars i.on{background:var(--t3)}
.stag{display:inline-flex;align-items:baseline;gap:5px;font-size:11px;color:var(--t2);white-space:nowrap;padding:3px 9px;border-radius:6px;background:var(--s2);border:1px solid var(--b2)}.stag b{font:700 13px var(--mono)}.stag.up b{color:var(--long)}.stag.down b{color:var(--short)}.stag.side b{color:var(--t2)}.stag.up{border-color:rgba(0,200,150,.35)}.stag.down{border-color:rgba(255,68,84,.35)}.stag.big b{font-size:16px}.stag.none{color:var(--t3)}
th.grp-h{text-align:center!important;border-bottom:1px solid var(--b1)}th.grp-h span{font-weight:500;opacity:.75}
.sbar{height:4px;background:var(--s3);border-radius:2px;overflow:hidden;min-width:60px}.sbar-f{height:100%;border-radius:2px}.sbar-f.up{background:var(--long)}.sbar-f.down{background:var(--short)}.sbar-f.side{background:var(--t3)}
.copybtns{display:inline-flex;gap:4px}.cbtn{background:var(--s1);border:1px solid var(--b2);border-radius:5px;padding:3px 8px;font:600 11px var(--mono);white-space:nowrap;color:var(--t1)}.cbtn:hover{border-color:var(--acc)}.cbtn.tv{color:var(--acc)}
.empty{padding:22px;text-align:center;color:var(--t2)}.pager{display:flex;align-items:center;justify-content:center;gap:12px;padding:12px}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;z-index:40}
.modal{width:100%;max-width:680px;max-height:92vh;overflow:auto;padding:22px 24px;position:relative;background:var(--bg);border:1px solid var(--b2);border-radius:12px;box-shadow:0 30px 70px -20px rgba(0,0,0,.8)}
.x{position:absolute;top:10px;right:12px;background:none;border:0;font-size:18px;color:var(--t2)}
.m-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding-right:26px}.m-name{font-size:19px;font-weight:800}.m-price{text-align:right;font-weight:700;font-size:16px}.m-price div+div{font-size:12px}
.m-overall{display:grid;grid-template-columns:auto auto 1fr;gap:16px;align-items:center;margin:14px 0 10px;padding:12px 14px;border-radius:10px;background:var(--s1);border:1px solid var(--b1)}
.mo-cell{display:flex;flex-direction:column;gap:5px;align-items:flex-start}.mo-sum{grid-column:1/-1;font-size:12.5px;color:var(--t1);line-height:1.5;border-top:1px solid var(--b1);padding-top:10px;display:flex;flex-direction:column;gap:5px}.mo-sum>.lbl{display:flex;align-items:center;gap:5px;margin-bottom:2px}.cv-row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:8px;align-items:baseline}.cv-k{font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);font-weight:700}.cv-st{font-weight:700}.cv-st.up{color:var(--long)}.cv-st.down{color:var(--short)}.cv-st.side{color:var(--mixed)}.cv-say{margin-top:4px;padding:8px 11px;border-radius:8px;border:1px solid var(--b2);background:var(--s2);border-left:3px solid var(--b2)}.cv-say.good{border-left-color:var(--long)}.cv-say.warn{border-left-color:var(--mixed)}.cv-say.bad{border-left-color:var(--short)}.cv-say.watch{border-left-color:var(--acc)}.cv-verdict{justify-self:end;align-self:center;font-size:12.5px;font-weight:700;padding:6px 12px;border-radius:8px;border:1px solid var(--b2);background:var(--s2);color:var(--t1);white-space:nowrap}.cv-verdict.good{color:var(--long);border-color:rgba(0,200,150,.45);background:var(--longd)}.cv-verdict.warn{color:var(--mixed);border-color:rgba(255,170,0,.45);background:var(--mixedd)}.cv-verdict.bad{color:var(--short);border-color:rgba(255,68,84,.45);background:var(--shortd)}.cv-verdict.watch{color:var(--acc);border-color:var(--accb);background:var(--adim)}.cv-verdict.mid{color:var(--t2)}
.dirtag{font:700 11px var(--mono);padding:4px 9px;border-radius:5px;white-space:nowrap}.dirtag.sm{font-size:10px;padding:3px 7px;text-align:center}
.dirtag.up{background:var(--longd);color:var(--long)}.dirtag.down{background:var(--shortd);color:var(--short)}.dirtag.side{background:rgba(106,134,166,.12);color:var(--t2)}.dirtag.bi{background:var(--retd);color:var(--ret)}
.grp-w{font-size:10.5px;color:var(--t2)}
.m-sec-t{display:flex;align-items:center;gap:6px;margin:18px 0 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.9px;font-weight:700;color:var(--t2)}.m-sec-t .tcopy{margin-left:auto;text-transform:none;letter-spacing:0}
.ctx-wrap{overflow-x:auto;border:1px solid var(--b1);border-radius:10px;background:var(--s1)}.ctx{width:100%;border-collapse:collapse;font-size:12px}
.ctx th{font-size:9.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--t2);font-weight:700;padding:8px 6px;border-bottom:1px solid var(--b1);text-align:center}
.ctx td{padding:9px 6px;text-align:center;border-bottom:1px solid var(--b1);white-space:nowrap}.ctx tr:last-child td{border-bottom:0}.ctx .ctx-a{background:rgba(0,229,255,.05)}
.ctx td.ctx-n{text-align:left;padding-left:12px;max-width:170px}.ctx-n>*{display:block;margin-bottom:2px}.ctx-n b{overflow:hidden;text-overflow:ellipsis;color:var(--t1)}.ctx-n .sub{font-size:10.5px}
.ss{display:block;font-family:var(--mono);font-weight:700;font-size:12.5px}.ss.up{color:var(--long)}.ss.down{color:var(--short)}.ss.side{color:var(--t2)}.rk{display:block;font-size:9.5px;color:var(--t3);font-family:var(--mono);margin-top:2px}
.peers{display:flex;flex-direction:column;border:1px solid var(--b1);border-radius:10px;overflow:hidden;background:var(--s1)}
.peer{display:grid;grid-template-columns:34px 92px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 12px;border:0;border-bottom:1px solid var(--b1);background:none;color:var(--t1);text-align:left;cursor:pointer;font:inherit}
.peer:last-child{border-bottom:0}.peer:hover{background:var(--s2)}.peer.me{background:rgba(0,229,255,.07);cursor:default}.peer.gap{border-top:1px dashed var(--b2)}.pn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m-rows{display:flex;flex-direction:column;border:1px solid var(--b1);border-radius:10px;overflow:hidden;background:var(--s1)}
.m-row{display:grid;grid-template-columns:110px minmax(0,1fr) 112px 86px;gap:12px;align-items:center;padding:9px 14px;border-bottom:1px solid var(--b1)}.m-row:last-child{border-bottom:0}.m-l{display:flex;flex-direction:column}
.m-copy{margin-top:8px}
.m-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0}
footer{border-top:1px solid var(--b1);padding-top:14px;margin-top:18px}
@media (min-width:1300px){.fbar{flex-wrap:nowrap}.fbar .fg{flex-shrink:0}.fbar .fg.grow{flex:0 1 150px;min-width:96px}.fbar .fg.grow .ms{width:100%!important}.fbar .reset{flex-shrink:0;padding:0 9px}}
@media (max-width:900px){.top .tabs{order:5;width:100%;margin:0 0 8px}.top .tabs button{flex:1;justify-content:center}.auth-page{grid-template-columns:1fr}.hero{padding:30px 22px;border-right:0;border-bottom:1px solid var(--b1)}.hero-h{font-size:28px}.hero-demo{display:none}.panels{grid-template-columns:1fr}.m-overall{grid-template-columns:auto auto}.cv-verdict{grid-column:1/-1;justify-self:start;white-space:normal}}
@media (max-width:640px){.top{gap:8px 12px;padding-top:8px}.top .hd-bell-wrap{margin-left:auto}.asof{order:4}.fbar{position:static}.reset{margin-left:0}.hide-sm{display:none}.asof{margin-left:0;width:100%}.grid2{grid-template-columns:1fr}.m-row{grid-template-columns:76px minmax(0,1fr) 104px}.m-row .dirtag{display:none}.t-tools .search{width:100%}}
`;

document.documentElement.dataset.theme = getTheme();
const style = document.createElement("style"); style.textContent = CSS + GUIDE_CSS; document.head.appendChild(style);
createRoot(document.getElementById("root")).render(<App/>);
