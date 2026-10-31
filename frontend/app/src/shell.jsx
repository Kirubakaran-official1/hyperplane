// Hyperplane customer app — SHELL: sign-in, side menu, top bar, past-days picker, data loading and the lazily loaded
// applications (micro-frontends in ./apps). It must never import the dashboard code.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helpdesk, HelpdeskIcon, InboxBell, useHelpdeskUnread } from "../../shared/helpdesk.jsx";
import { QuickGuideButton } from "./quick.jsx";
import { DIAL_CODES, POPULAR_DIAL } from "./dial.js";
import { AppIcon, Brand, CollapseIcon, DISCLAIMER, GridIcon, GuideIcon, Logo, MODE_KEY, MenuIcon, NavSvg, PinIcon, SearchIcon, api, applyMode, fmtDT, fmtDay, fmtTime, foldText, getMode, useTheme } from "./core.jsx";

// WhatsApp country code: every country (dial.js); it follows the Country choice until the user picks a code
const DIAL_BY = Object.fromEntries(DIAL_CODES);
// India: 10 digits starting 6-9; elsewhere 5-13 digits (E.164 allows 15 digits including the country code)
const phoneError = (code, num) => code === "91" ? (/^[6-9]\d{9}$/.test(num) ? "" : "Enter your 10-digit WhatsApp number (it starts with 6, 7, 8 or 9)")
  : (/^\d{5,13}$/.test(num) ? "" : "Enter your WhatsApp number without the country code (digits only)");
function DialSelect({ value, onChange }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const qq = foldText(q.trim()).replace(/^\+/, "");
  const found = qq ? DIAL_CODES.filter(([n, c]) => foldText(n).includes(qq) || c.startsWith(qq))
    .sort((x, y) => (foldText(y[0]).startsWith(qq) - foldText(x[0]).startsWith(qq)) || (y[1] === qq) - (x[1] === qq)) : [];
  const popular = POPULAR_DIAL.map(n => [n, DIAL_BY[n]]);
  const pick = n => { onChange(n); setOpen(false); setQ(""); };
  const row = pre => ([n, c]) => (
    <button key={pre + n} type="button" role="option" aria-selected={n === value} className={`dial-it ${n === value ? "on" : ""}`} onClick={() => pick(n)}>
      <span>{n}</span><b>+{c}</b></button>);
  return (
    <div className="ms dial" ref={ref}>
      <button type="button" className="ms-btn on" onClick={() => setOpen(v => !v)} aria-haspopup="listbox" aria-expanded={open} title={value}>
        <span>+{DIAL_BY[value]} <small>{value}</small></span><span className="caret">▾</span></button>
      {open && (
        <div className="ms-pop dial-pop">
          <input autoFocus className="ms-q" placeholder="Search country or code" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const first = (qq ? found : popular)[0]; if (first) pick(first[0]); } else if (e.key === "Escape") setOpen(false); }}/>
          <div className="ms-list" role="listbox">
            {qq ? (found.length ? found.map(row("f")) : <div className="ms-empty">No country found</div>)
              : <><div className="dial-h">Popular</div>{popular.map(row("p"))}<div className="dial-h">All countries · {DIAL_CODES.length}</div>{DIAL_CODES.map(row("a"))}</>}
          </div>
        </div>
      )}
    </div>
  );
}
const COUNTRIES = ["India","United Arab Emirates","United States","United Kingdom","Singapore","Saudi Arabia","Qatar","Kuwait","Oman","Bahrain","Canada","Australia","Malaysia","Germany","Other"];
const IN_STATES = ["Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"];


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
              <div><span className="lbl">Plan</span><span className="acct-plan">{(me.roles || []).join(" · ") || "—"}</span></div>
              <div className="acct-apps"><span className="lbl">Applications</span><span className="acct-chips">{(me.apps || []).length
                ? me.apps.map(a => <span key={a.key} className="acct-chip"><AppIcon k={a.key}/>{a.name}</span>) : "None yet"}</span></div>
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


// "More apps": every application on the customer's plan, with search and pins (owner, 2026-10-28)
function AppsPanel({ apps, pins, maxPins, current, onOpen, onPin, onClose, msg }) {
  const [q, setQ] = useState("");
  useEffect(() => { const k = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const ql = foldText(q.trim());
  const list = apps.filter(a => !ql || foldText(`${a.name} ${a.description || ""}`).includes(ql));
  const full = pins.length >= maxPins;
  const row = a => { const on = pins.includes(a.key); return (
    <div key={a.key} className={`ap-row ${current === a.key ? "cur" : ""}`} data-app={a.key}>
      <button type="button" className="ap-open" onClick={() => onOpen(a.key)}>
        <span className="ap-ic"><AppIcon k={a.key}/></span>
        <span className="ap-t"><b>{a.name}</b>{a.description && <span>{a.description}</span>}</span>
      </button>
      <button type="button" className={`ap-pin ${on ? "on" : ""}`} onClick={() => onPin(a.key)} disabled={!on && full} aria-pressed={on}
        aria-label={on ? `Unpin ${a.name}` : `Pin ${a.name}`}
        title={on ? "Unpin from the menu" : full ? `You can pin up to ${maxPins} apps. Unpin one first.` : "Pin to the menu"}><PinIcon on={on}/></button>
    </div>); };
  const pinned = list.filter(a => pins.includes(a.key)), rest = list.filter(a => !pins.includes(a.key));
  return (
    <>
      <div className="ap-scrim" onClick={onClose} aria-hidden="true"/>
      <aside className="ap" role="dialog" aria-label="All apps" id="apps-panel">
        <div className="ap-head">
          <label className="ap-search"><SearchIcon/><input autoFocus placeholder="Search apps" value={q} onChange={e => setQ(e.target.value)} aria-label="Search apps" id="apps-search"/></label>
          <button type="button" className="ap-x" onClick={onClose} aria-label="Close" id="apps-close">✕</button>
        </div>
        <div className="ap-note"><b>{pins.length} of {maxPins}</b> pinned to your menu · pin the apps you use most</div>
        {msg && <div className="ap-msg" role="alert">{msg}</div>}
        <div className="ap-list">
          {pinned.length > 0 && <><div className="ap-h">Pinned</div>{pinned.map(row)}</>}
          {rest.length > 0 && <><div className="ap-h">{pinned.length ? "More apps" : "All apps"}</div>{rest.map(row)}</>}
          {!list.length && <div className="ap-empty">{apps.length ? <>No app matches “{q}”</> : "No applications on your plan yet"}</div>}
        </div>
      </aside>
    </>
  );
}
const NAV_KEY = "qf_nav";
// collapsed (icon + name rail) unless the customer opened it wide (owner, 2026-10-28)
const getNavMin = () => { try { return localStorage.getItem(NAV_KEY) !== "full"; } catch { return true; } };

function SideNav({ apps, pins, face, view, onFace, onDocs, onHelpdesk, unread, min, setMin, open, onClose, moreOn, onMore }) {
  const rail = apps.filter(a => pins.includes(a.key));           // catalogue order; at most 6 (max_pins)
  const item = (key, label, icon, on, onClick, badge) => (
    <button key={key} type="button" className={`sn-it ${on ? "on" : ""}`} onClick={onClick} aria-current={on ? "page" : undefined}
      aria-label={label} title={label} id={`nav-${key}`}>
      <span className="sn-ic">{icon}{badge > 0 && <span className="sn-dot" aria-hidden="true"/>}</span>
      <span className="sn-l">{label}</span>
      {badge > 0 && <span className="tab-n sn-n">{badge}</span>}
    </button>);
  return (
    <>
      <div className={`sn-scrim ${open ? "on" : ""}`} onClick={onClose} aria-hidden="true"/>
      <nav className={`sn ${min ? "min" : ""} ${open ? "open" : ""}`} aria-label="Applications">
        <div className="sn-head">
          <button type="button" className="sn-brand" onClick={() => apps[0] && onFace(face || apps[0].key)} aria-label="Hyperplane home">
            <Logo size={36}/><span className="sn-bt"><span className="brand-name">Hyperplane</span><span className="brand-by">by QuantFriday</span></span>
          </button>
          <button type="button" className="sn-tog" onClick={() => setMin(!min)} aria-expanded={!min} aria-label={min ? "Open the menu" : "Close the menu"}
            title={min ? "Open the menu" : "Close the menu"} id="nav-collapse">{min ? <MenuIcon/> : <CollapseIcon/>}</button>
        </div>
        <div className="sn-sec">Applications</div>
        <div className="sn-list">
          {rail.map(a => item(a.key, a.name, <AppIcon k={a.key}/>, view === "tower" && face === a.key, () => onFace(a.key)))}
          {!apps.length && <div className="sn-none">No applications on your plan yet</div>}
          {apps.length > 0 && !rail.length && <div className="sn-none">Pin apps from More apps</div>}
        </div>
        <div className="sn-sec">Support</div>
        <div className="sn-list">
          {item("docs", "Docs", <GuideIcon/>, view === "guide", onDocs)}
          {item("helpdesk", "Helpdesk", <HelpdeskIcon size={18}/>, view === "helpdesk", onHelpdesk, unread)}
        </div>
        {apps.length > 0 && <div className="sn-list sn-more">{item("more", "More apps", <GridIcon/>, moreOn, onMore)}</div>}
      </nav>
    </>
  );
}


// ─── sign in / register ──────────────────────────────────────────────────────
function Hero() {
  const feats = [
    ["Stay away from the traps", "Weak stocks, weak sectors, past crashes and wild run-ups are flagged — before your money goes in."],
    ["Trade with the tide", "See at a glance whether the stock, its industry and its sector all point the same way."],
    ["Five timeframes, one answer", "Daily to Yearly trend strength in one view — and a warning when short term and long term disagree."],
    ["Less noise, better decisions", "No jargon and no hundred charts: one clear screen, refreshed every session, copy to TradingView in one click."],
  ];
  const demo = [["Daily", "up", 82], ["Weekly", "up", 71], ["Monthly", "side", 12], ["Quarterly", "down", 44], ["Yearly", "down", 58]];
  return (
    <div className="hero">
      <div className="hero-grid"/>
      <Brand/>
      <div className="hero-k">Quant trend intelligence for Indian stocks</div>
      <h2 className="hero-h">Protect your capital<br/><span>with the right quant information.</span></h2>
      <p className="hero-p">Most losses start the same way — buying a weak stock, in a falling sector, against the bigger trend.
        Hyperplane checks every NSE stock, its industry and its sector across five timeframes, and tells you in plain words
        where the strength is and what to stay away from. You don't need more information — you need the right information.</p>
      <ul className="feats">{feats.map(([h, t]) => <li key={h}><span className="tick">✓</span><div><b>{h}</b><span>{t}</span></div></li>)}</ul>
      <div className="hero-demo">
        {demo.map(([l, k, v]) => (
          <div key={l} className="hd-row"><span>{l}</span>
            <span className={`meter ${k}`}><span className="bars" aria-hidden="true">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= Math.max(1, Math.ceil(v / 20)) ? "on" : ""}/>)}</span>{v}%</span>
            <div className="sbar"><div className={`sbar-f ${k}`} style={{ width:`${v}%` }}/></div></div>
        ))}
        <div className="hd-note">Example · short term up, long term down → <b>wait</b>. Hyperplane flags it before you buy.</div>
      </div>
      <p className="hero-fine">For education and information only — not investment advice. No tool removes market risk; Hyperplane helps you see it.</p>
    </div>
  );
}

function AuthScreen({ onIn, notice }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name:"", email:"", phone:"", ccName:"India", ccSet:false, country:"India", state:"", city:"", password:"", confirm:"", accept:false });
  const [msg, setMsg] = useState(notice || ""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  useEffect(() => { if (mode === "register") api("/app/api/signup-info").then(r => setAuto(!!r.auto_approve)).catch(() => {}); }, [mode]);
  const set = k => e => setF(p => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const submit = async e => {
    e.preventDefault(); setMsg(""); setBusy(true);
    try {
      if (mode === "login") { await api("/app/api/login", { method:"POST", json:{ email:f.email, password:f.password } }); onIn(); }
      else {
        if (f.password !== f.confirm) throw new Error("The two passwords do not match");
        if (!f.accept) throw new Error("Please tick the box to agree to the terms");
        const pe = phoneError(DIAL_BY[f.ccName], f.phone); if (pe) throw new Error(pe);
        const r = await api("/app/api/register", { method:"POST", json:{ name:f.name, email:f.email, phone:`+${DIAL_BY[f.ccName]} ${f.phone}`, country:f.country, state:f.state, city:f.city, password:f.password, accept:f.accept } });
        if (r.signed_in) { onIn(); return; }
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
          <p className="muted">{mode === "login" ? "Sign in to see where the strength is today — and what to avoid." : auto ? "It takes a minute — you can start using Hyperplane right after." : "It takes a minute. Your account becomes active once QuantFriday approves it."}</p>
          {ok && <div className="ok">{ok}</div>}
          {mode === "register" && <>
            {Field("Full name", <input value={f.name} onChange={set("name")} required maxLength={80} autoComplete="name"/>)}
            <label className="field">
              <span className="wa-l"><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="#25d366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.6 14.1c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.7-2.2 1-2.5c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .7.5l1 2.3c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.2 1c.3.2.5.2.6.4.1.1.1.8-.2 1.5z"/></svg>WhatsApp number</span>
              <div className="wa-in">
                <DialSelect value={f.ccName} onChange={n => setF(p => ({ ...p, ccName:n, ccSet:true, phone:p.phone.slice(0, DIAL_BY[n] === "91" ? 10 : 13) }))}/>
                <input value={f.phone} onChange={e => { const v = e.target.value.replace(/\D/g, ""); setF(p => ({ ...p, phone:v.slice(0, DIAL_BY[p.ccName] === "91" ? 10 : 13) })); }}
                  required inputMode="numeric" autoComplete="tel-national" maxLength={DIAL_BY[f.ccName] === "91" ? 10 : 13} aria-label="WhatsApp number"/>
              </div>
              {f.phone && phoneError(DIAL_BY[f.ccName], f.phone) && <span className="wa-err">{DIAL_BY[f.ccName] === "91" ? `${f.phone.length}/10 digits` : "Digits only, without the country code (5–13)"}{DIAL_BY[f.ccName] === "91" && f.phone.length === 10 ? " · must start with 6, 7, 8 or 9" : ""}</span>}
              <span className="wa-note">Use your <b>WhatsApp</b> number — we'll invite you to the <b>Hyperplane community</b>: a healthy, disciplined
                circle that learns to trade with the trend and protect capital. Your number is never shared or sold.</span>
            </label>
            <div className="grid2">
              {Field("Country", <select value={f.country} onChange={e => { const c = e.target.value; setF(p => ({ ...p, country:c, state:"", ...(!p.ccSet && DIAL_BY[c] ? { ccName:c } : {}) })); }}>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select>)}
              {Field("State", f.country === "India"
                ? <select value={f.state} onChange={set("state")} required><option value="">Choose your state</option>{IN_STATES.map(s => <option key={s}>{s}</option>)}</select>
                : <input value={f.state} onChange={set("state")} required maxLength={60}/>)}
            </div>
            {Field("City", <input value={f.city} onChange={set("city")} maxLength={60} autoComplete="address-level2"/>)}
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

// ─── past days (only when the admin allows it): ONE scheduled collection — a date, then Day open or Day end ───
const PARTS = [["open", "Day open"], ["end", "Day end"]];
function DayPicker({ days, sel, asOf, onPick, onOpen }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  const byDay = useMemo(() => Object.fromEntries(days.map(x => [x.d, x])), [days]);
  const min = days[0].d, max = days[days.length - 1].d;
  const [d, setD] = useState(sel ? sel.date : max);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const day = byDay[d];
  return (
    <div className="dp" ref={ref}>
      <button type="button" className={`dp-btn ${sel ? "hist" : ""}`} onClick={() => { setD(sel ? sel.date : max); if (!open && onOpen) onOpen(); setOpen(v => !v); }} aria-expanded={open} title="View a past day">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
        {sel ? "VIEWING" : "DATA AS OF"} <b>{asOf ? fmtDT(asOf) : "…"}</b>{sel && <span className="dp-part">{sel.part === "open" ? "Day open" : "Day end"}</span>}<span className="caret">▾</span>
      </button>
      {open && (
        <div className="dp-pop" role="dialog" aria-label="View a past day">
          <div className="dp-t">View a past day</div>
          <input className="dp-in" type="date" value={d || ""} min={min} max={max} onChange={e => setD(e.target.value)}/>
          {!day ? <div className="dp-none">No data for {d ? fmtDay(d) : "this day"} — the market may have been closed. Pick another date.</div>
            : <div className="sg dp-parts">{PARTS.map(([k, l]) => (
                <button key={k} type="button" disabled={!day[k]} className={sel && sel.date === d && sel.part === k ? "on" : ""}
                  onClick={() => { onPick({ date: d, part: k }); setOpen(false); }} title={day[k] ? `Data as of ${fmtDT(day[k])}` : "Not collected that day"}>
                  {l}<small>{day[k] ? fmtTime(day[k]) : "—"}</small>
                </button>))}</div>}
          <div className="dp-f"><span>{days.length} days · {fmtDay(min)} – {fmtDay(max)}</span>
            {sel && <button type="button" onClick={() => { onPick(null); setOpen(false); }}>↺ Latest data</button>}</div>
        </div>
      )}
    </div>
  );
}

// ─── applications: micro-frontend modules (owner, 2026-11-01: "not a monolithic single file … loading fast … consume
// what we use"). Each application is its own chunk with its own styles, downloaded the first time it is opened. An
// opened application stays alive in the background, so switching apps keeps the customer exactly where they left
// (inputs, results, filters, scroll position).
const APP_MODULES = {
  research: lazy(() => import("./apps/research.jsx")),
  simple: lazy(() => import("./apps/simple.jsx")),
  portfolio: lazy(() => import("./apps/portfolio.jsx")),
  builder: lazy(() => import("./apps/builder.jsx")),
};
const Guide = lazy(() => import("./guide.jsx"));
const DATA_APPS = ["research", "simple", "portfolio"];         // the builder works on the server: no stock data needed
const Waiting = ({ text = "Loading…" }) => <div className="card empty">{text}</div>;

function Home({ me, onOut, reloadMe }) {
  const apps = me.apps || [];
  const allowed = apps.map(a => a.key);
  const [rawData, setData] = useState(null); const [err, setErr] = useState("");
  const [mode, setModeState] = useState(getMode);
  const setMode = m => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* storage blocked */ } };
  const data = useMemo(() => rawData && applyMode(rawData, mode), [rawData, mode]);
  const [view, setView] = useState("tower"); const [hdReq, setHdReq] = useState(null);
  const [faceRaw, setFaceRaw] = useState(() => { try { return localStorage.getItem("qf_face") || "research"; } catch { return "research"; } });
  // only an application the customer's roles allow; otherwise their first one (null = none on their plan)
  const face = allowed.includes(faceRaw) ? faceRaw : allowed[0] || null;
  const [navMin, setNavMinRaw] = useState(getNavMin); const [navOpen, setNavOpen] = useState(false);
  // pinned applications (rail shows at most max_pins; everything is under "More apps"); null = never chose → first 6
  const maxPins = me.max_pins || 6;
  const [pinsRaw, setPinsRaw] = useState(me.pins ?? null);
  useEffect(() => { setPinsRaw(me.pins ?? null); }, [me]);
  const pins = (pinsRaw ?? allowed.slice(0, maxPins)).filter(k => allowed.includes(k)).slice(0, maxPins);
  const [moreOpen, setMoreOpen] = useState(false); const [pinMsg, setPinMsg] = useState("");
  const togglePin = k => {
    const next = pins.includes(k) ? pins.filter(x => x !== k) : [...pins, k];
    if (next.length > maxPins) { setPinMsg(`You can pin up to ${maxPins} apps. Unpin one first.`); return; }
    const prev = pinsRaw; setPinsRaw(next); setPinMsg("");
    api("/app/api/pins", { method: "PUT", json: { pins: next } })
      .catch(e => { setPinsRaw(prev); setPinMsg(`Could not save: ${e.message}`); if (e.noAccess) reloadMe(); else if (e.status === 401) onOut(e.message); });
  };
  const setNavMin = v => { setNavMinRaw(v); try { localStorage.setItem(NAV_KEY, v ? "min" : "full"); } catch { /* storage blocked */ } };
  // where the customer was in each application (scroll position), restored when they come back to it
  const scrollAt = useRef({});
  const here_ = view === "tower" ? face : view;
  const leave = () => { scrollAt.current[here_] = window.scrollY; };
  const setFace = f => { leave(); setFaceRaw(f); setView("tower"); setNavOpen(false); try { localStorage.setItem("qf_face", f); } catch { /* storage blocked */ } };
  const goView = v => { leave(); setView(v); setNavOpen(false); };
  useEffect(() => { const y = scrollAt.current[here_] || 0; requestAnimationFrame(() => window.scrollTo(0, y)); }, [here_]);
  const [simpleSym, setSimpleSym] = useState(null);
  // AI Portfolio: the customer's stock list, saved to their account (no quantities)
  const [pf, setPfRaw] = useState(null); const [pfStatus, setPfStatus] = useState("");
  const pfTimer = useRef(null);
  useEffect(() => { if (face === "portfolio" && pf == null) api("/app/api/portfolio").then(r => setPfRaw(r.symbols || [])).catch(e => { if (e.status === 401) onOut(e.message); else setPfRaw([]); }); }, [face]);
  const setPf = list => {
    setPfRaw(list); setPfStatus("");
    clearTimeout(pfTimer.current);
    pfTimer.current = setTimeout(() => api("/app/api/portfolio", { method: "PUT", json: { symbols: list } })
      .then(() => setPfStatus("")).catch(e => { if (e.status === 401) onOut(e.message); else setPfStatus(`could not update your list: ${e.message}`); }), 500);
  };
  // AI Portfolio Builder → "Send to AI Portfolio Analyser" (owner, 2026-11-01): add = keep the saved list and add the
  // new stocks · replace = erase the saved list and keep only the new ones
  const addToPf = async (syms, how = "add") => {
    const cur = how === "replace" ? [] : (await api("/app/api/portfolio")).symbols ?? [];
    const next = [...new Set([...cur, ...syms])];
    await api("/app/api/portfolio", { method: "PUT", json: { symbols: next } });
    setPfRaw(next);
  };
  const hdApi = useCallback((p, o) => api(p, o).catch(e => { if (e.status === 401 || e.status === 403) onOut(e.message); throw e; }), []);
  const unread = useHelpdeskUnread(hdApi, "/app/api/helpdesk");
  const openHelpdesk = id => { goView("helpdesk"); setHdReq({ id, n: Date.now() }); };
  // Activity log: which application is open (once per visit) and a minute heartbeat while the page is visible
  const track = useCallback((module, kind) => module && api("/app/api/activity", { method: "POST", json: { module, kind } })
    .catch(e => { if (e.noAccess) reloadMe(); else if (e.status === 401) onOut(e.message); }), []);
  useEffect(() => { if (view === "tower" && face) track(face, "open"); }, [view, face]);
  useEffect(() => {
    if (view !== "tower" || !face) return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") track(face, "ping"); }, 60000);
    return () => clearInterval(t);
  }, [view, face]);
  // role changes made by Admin show up without signing out: refresh the plan when the customer comes back to the tab
  useEffect(() => {
    let last = Date.now();
    const f = () => { if (document.visibilityState === "visible" && Date.now() - last > 60000) { last = Date.now(); reloadMe(); } };
    document.addEventListener("visibilitychange", f); window.addEventListener("focus", f);
    return () => { document.removeEventListener("visibilitychange", f); window.removeEventListener("focus", f); };
  }, []);
  useEffect(() => { const k = e => { if (e.key === "Escape") setNavOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  // stock data: fetched only once an application that shows it is opened (the builder, Docs and Helpdesk never need it)
  const wantsData = DATA_APPS.some(k => allowed.includes(k)) && view === "tower" && DATA_APPS.includes(face);
  const [dataOn, setDataOn] = useState(false);
  useEffect(() => { if (wantsData) setDataOn(true); }, [wantsData]);
  // past days: offered only when the admin has switched it on; sel = { date, part } or null for the latest published data
  const [hist, setHist] = useState(null); const [sel, setSel] = useState(null);
  const loadHist = () => api("/app/api/history").then(setHist).catch(() => setHist(null));
  useEffect(() => { if (dataOn) loadHist(); }, [dataOn]);
  useEffect(() => {
    if (!dataOn) return;
    setData(null); setErr("");
    api("/app/api/data" + (sel ? `?date=${sel.date}&part=${sel.part}` : "")).then(setData).catch(e => {
      if (e.noAccess) { setErr(e.message); reloadMe(); return; }
      if (sel && e.status !== 401) { setSel(null); setErr(""); return; }      // not available (any more) → back to the latest
      if (e.status === 401 || e.status === 403) onOut(e.message); else setErr(e.message);
    });
  }, [sel, dataOn]);
  // applications opened so far (kept alive while the customer moves between them)
  const [opened, setOpened] = useState(() => new Set());
  useEffect(() => { if (view === "tower" && face && APP_MODULES[face]) setOpened(s => s.has(face) ? s : new Set([...s, face])); }, [view, face]);
  const hasApps = allowed.length > 0;
  const app = k => {
    if (k === "research") return <APP_MODULES.research data={data} err={err} sel={sel} mode={mode} setMode={setMode}/>;
    if (k === "builder") return <APP_MODULES.builder apps={apps} onAddToPortfolio={addToPf} onOpenApp={setFace} onOut={onOut}/>;
    if (!data) return <Waiting text={err || "Loading…"}/>;
    if (k === "simple") return <APP_MODULES.simple data={data} mode={mode} setMode={setMode} sym={simpleSym} setSym={setSimpleSym}/>;
    if (k === "portfolio") return pf != null ? <APP_MODULES.portfolio data={data} symbols={pf} setSymbols={setPf} status={pfStatus} me={me}/> : <Waiting/>;
    return null;
  };

  const curApp = apps.find(a => a.key === face);
  const here = view === "helpdesk" ? { icon: <HelpdeskIcon size={18}/>, name: "Helpdesk", sub: "Your questions and our answers" }
    : view === "guide" ? { icon: <GuideIcon/>, name: "Docs", sub: "How to use Hyperplane · golden rules" }
    : curApp ? { icon: <AppIcon k={curApp.key}/>, name: curApp.name, sub: curApp.description } : { icon: null, name: "Hyperplane", sub: "" };
  const showsData = view === "tower" && DATA_APPS.includes(face);
  return (
    <div className={`shell ${navMin ? "nav-min" : ""}`}>
      <SideNav apps={apps} pins={pins} face={face} view={view} onFace={k => { setMoreOpen(false); setFace(k); }}
        onDocs={() => { setMoreOpen(false); goView("guide"); }} onHelpdesk={() => { setMoreOpen(false); openHelpdesk(null); }}
        unread={unread.total} min={navMin} setMin={setNavMin} open={navOpen} onClose={() => { setNavOpen(false); setMoreOpen(false); }}
        moreOn={moreOpen || (view === "tower" && !!face && !pins.includes(face))} onMore={() => { setPinMsg(""); setMoreOpen(v => !v); }}/>
      {moreOpen && <AppsPanel apps={apps} pins={pins} maxPins={maxPins} current={view === "tower" ? face : null} msg={pinMsg}
        onOpen={k => { setMoreOpen(false); setFace(k); }} onPin={togglePin} onClose={() => setMoreOpen(false)}/>}
      <div className="shell-main">
    <div className="page">
      <header className="top">
        <button type="button" className="sn-burger" onClick={() => setNavOpen(true)} aria-label="Open menu" id="nav-burger"><MenuIcon/></button>
        <div className="top-here" id="top-here">
          {here.icon && <span className="th-ic">{here.icon}</span>}
          <div className="th-t"><b>{here.name}</b>{here.sub && <span className="th-sub">{here.sub}</span>}</div>
        </div>
        {showsData && (hist && hist.enabled && hist.days.length
          ? <DayPicker days={hist.days} sel={sel} asOf={data && data.as_of} onPick={setSel} onOpen={loadHist}/>
          : <div className="asof">{data ? <>DATA AS OF <b>{fmtDT(data.as_of)}</b></> : err ? "" : "Loading…"}</div>)}
        <QuickGuideButton onDocs={() => goView("guide")}/>
        <InboxBell unread={unread} onOpen={openHelpdesk}/>
        <AccountMenu me={me} unread={unread.total} onHelpdesk={() => openHelpdesk(null)} onDocs={() => goView("guide")}
          onSignOut={async () => { await api("/app/api/logout", { method:"POST" }).catch(() => {}); onOut(); }}/>
      </header>

      {view === "tower" && !hasApps && (
        <div className="card no-apps" id="no-apps">
          <div className="na-ic"><NavSvg size={26}><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></NavSvg></div>
          <h2>No applications on your plan yet</h2>
          <p className="muted">Your account is active, but no application has been added to your plan. Please raise a query in the Helpdesk and QuantFriday will set it up for you.</p>
          <button type="button" className="primary" onClick={() => openHelpdesk(null)}>Open Helpdesk</button>
        </div>
      )}
      {view === "guide" && <Suspense fallback={<Waiting/>}><Guide disclaimer={DISCLAIMER} apps={allowed}/></Suspense>}
      {view === "helpdesk" && <Helpdesk api={hdApi} base="/app/api/helpdesk" openReq={hdReq} onChanged={unread.refresh}/>}
      {[...opened].filter(k => allowed.includes(k)).map(k => (
        <div key={k} className="app-pane" data-app={k} hidden={!(view === "tower" && face === k)}>
          <Suspense fallback={<Waiting/>}>{app(k)}</Suspense>
        </div>))}

      <footer><p className="fine">{DISCLAIMER}</p><p className="fine">© {new Date().getFullYear()} QuantFriday · Hyperplane</p></footer>
    </div>
      </div>
    </div>
  );
}

export function App() {
  const [me, setMe] = useState(undefined); const [notice, setNotice] = useState("");
  const load = () => api("/app/api/me").then(setMe).catch(e => { setMe(null); if (e.status === 403) setNotice(e.message); });
  useEffect(() => { load(); }, []);
  if (me === undefined) return <div className="loading"><Brand/></div>;
  if (!me) return <AuthScreen onIn={load} notice={notice}/>;
  // later refreshes (plan changed by Admin) keep the page on a network hiccup; only a real sign-out ends it
  const refresh = () => api("/app/api/me").then(setMe).catch(e => { if (e.status === 401 || e.status === 403) { setMe(null); if (e.status === 403) setNotice(e.message); } });
  return <Home me={me} reloadMe={refresh} onOut={msg => { setNotice(typeof msg === "string" ? msg : ""); setMe(null); }}/>;
}
