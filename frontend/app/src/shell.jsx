// Hyperplane customer app — SHELL: sign-in, side menu, top bar, past-days picker, data loading and the lazily loaded
// applications (micro-frontends in ./apps). It must never import the dashboard code.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helpdesk, HelpdeskIcon, useHelpdeskUnread } from "../../shared/helpdesk.jsx";
import { NotifyCenter, useNotifications } from "./notify.jsx";
import { QuickGuideButton } from "./quick.jsx";
import { DIAL_CODES, POPULAR_DIAL } from "./dial.js";
import { emailError, lettersOnly, nameError, noSpaces, passwordError, passwordScore, placeError } from "./validate.js";
import { APP_SLUG, goPath, routeOf } from "./core.jsx";
import { AppIcon, Brand, CollapseIcon, DISCLAIMER, DetailCtx, AsOfCtx, BrandBand, GridIcon, GuideIcon, HD_TEMPLATES, Icon, Logo, MODE_KEY, MenuIcon, NavSvg, PinIcon, SearchIcon, api, applyMode, setApiDay, fmtDT, fmtDay, fmtTime, foldText, getMode, loadChunk, useTheme } from "./core.jsx";
// loadChunk reloads a page opened before an update once; when this version has run a while, allow that again later
setTimeout(() => { try { sessionStorage.removeItem("hp_reloaded"); } catch { /* ignore */ } }, 20000);

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
            <button className="x" onClick={() => setAcct(false)} aria-label="Close"><Icon name="x" size={16}/></button>
            <div className="acct-h big"><span className="avatar xl">{initial}</span><div><div className="m-name">{me.name}</div><div className="sub">Hyperplane by QuantFriday</div></div></div>
            <div className="acct-rows">
              <div><span className="lbl">Email</span><span>{me.email}</span></div>
              <div><span className="lbl">Access until</span><span>{me.expires_on ? new Date(me.expires_on + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "No end date"}</span></div>
              <div><span className="lbl">Plan</span><span className="acct-plan">{(me.roles || []).join(" · ") || "—"}</span></div>
              {(me.grants || []).length > 0 && <div className="acct-apps"><span className="lbl">Extra access</span><span className="acct-chips">{me.grants.map((g, i) => (
                <span key={i} className="acct-chip">{g.name} · {g.app}{g.until ? ` (until ${fmtDay(g.until)})` : ""}</span>))}</span></div>}
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
function AppsPanel({ apps, pins, maxPins, current, onOpen, onPin, onMove, onClose, msg }) {
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
      {on && <span className="ap-mv">
        <button type="button" onClick={() => onMove(a.key, -1)} disabled={pins.indexOf(a.key) === 0} aria-label={`Move ${a.name} up`} title="Move up" data-up={a.key}>↑</button>
        <button type="button" onClick={() => onMove(a.key, 1)} disabled={pins.indexOf(a.key) === pins.length - 1} aria-label={`Move ${a.name} down`} title="Move down" data-down={a.key}>↓</button></span>}
      <button type="button" className={`ap-pin ${on ? "on" : ""}`} onClick={() => onPin(a.key)} disabled={!on && full} aria-pressed={on}
        aria-label={on ? `Unpin ${a.name}` : `Pin ${a.name}`}
        title={on ? "Unpin from the menu" : full ? `You can pin up to ${maxPins} apps. Unpin one first.` : "Pin to the menu"}><PinIcon on={on}/></button>
    </div>); };
  const pinned = pins.map(k => list.find(a => a.key === k)).filter(Boolean), rest = list.filter(a => !pins.includes(a.key));
  return (
    <>
      <div className="ap-scrim" onClick={onClose} aria-hidden="true"/>
      <aside className="ap" role="dialog" aria-label="All apps" id="apps-panel">
        <div className="ap-head">
          <label className="ap-search"><SearchIcon/><input autoFocus placeholder="Search apps" value={q} onChange={e => setQ(e.target.value)} aria-label="Search apps" id="apps-search"/></label>
          <button type="button" className="ap-x" onClick={onClose} aria-label="Close" id="apps-close"><Icon name="x" size={16}/></button>
        </div>
        <div className="ap-note"><b>{pins.length} of {maxPins}</b> pinned to your menu · ↑ ↓ arrange them · the first one opens when you sign in</div>
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
  const rail = pins.map(k => apps.find(a => a.key === k)).filter(Boolean);   // the customer's own order; at most 6 (max_pins)
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
        {/* owner 2026-11-06: only the pinned apps (at most 6), scrolling on a short screen; Docs and Helpdesk live in the
            top bar (? guide, 🔔 inbox) and the account menu */}
        <div className="sn-list sn-apps">
          {rail.map(a => item(a.key, a.name, <AppIcon k={a.key}/>, view === "tower" && face === a.key, () => onFace(a.key)))}
          {!apps.length && <div className="sn-none">No applications on your plan yet</div>}
          {apps.length > 0 && !rail.length && <div className="sn-none">Pin apps from More apps</div>}
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
      <ul className="feats">{feats.map(([h, t]) => <li key={h}><span className="tick"><Icon name="check" size={12}/></span><div><b>{h}</b><span>{t}</span></div></li>)}</ul>
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

// a reset link from the "Forgot password" email: /app/#reset=<token> (the part after # never reaches a server or a log);
// read once and wiped from the address bar so it is not left in the history
function takeResetToken() {
  const m = /^#reset=([A-Za-z0-9_-]{30,64})$/.exec(window.location.hash || "");
  if (m) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return m ? m[1] : null;
}

// the confirmation link from the sign-up email: /app/#verify=<token> (after the #, so a mail scanner's prefetch never reaches it); wiped once read
function takeVerifyToken() {
  const m = /^#verify=([A-Za-z0-9_-]{30,64})$/.exec(window.location.hash || "");
  if (m) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return m ? m[1] : null;
}

// a password box with a show / hide eye (round 17c)
function PwBox({ value, onChange, id, autoComplete, placeholder, autoFocus, bad, invalid }) {
  const [show, setShow] = useState(false);
  return (
    <span className={`pw ${bad ? "bad" : ""}`}>
      <input id={id} type={show ? "text" : "password"} value={value} onChange={onChange} maxLength={128} autoComplete={autoComplete} placeholder={placeholder} autoFocus={autoFocus}
        aria-invalid={invalid ? "true" : undefined} spellCheck={false} autoCapitalize="off"/>
      <button type="button" className="pw-eye" onClick={() => setShow(v => !v)} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"} tabIndex={-1}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {show ? <><path d="M17.9 17.9A10.9 10.9 0 0 1 12 20C5 20 1 12 1 12a18.7 18.7 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="m1 1 22 22"/></>
            : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></>}
        </svg></button>
    </span>);
}
const PW_LABEL = ["", "Weak", "Okay", "Good", "Strong"];
// pressing a button or link must not take focus away from a field: the field's "left it" message would appear, push the page down, and the click would land on nothing
const keepFocus = e => { if (e.target.closest && e.target.closest("button, a")) e.preventDefault(); };

function AuthScreen({ onIn, notice, resetToken = null, onResetDone, verifyToken = null, onVerifyDone }) {
  const [mode, setMode] = useState(verifyToken ? "verify" : resetToken ? "reset" : new URLSearchParams(window.location.search).has("signup") ? "register" : "login");       // login · register · forgot · reset · verify
  const [f, setF] = useState({ name:"", email:"", phone:"", ccName:"India", ccSet:false, country:"India", state:"", city:"", password:"", confirm:"", accept:false });
  const [msg, setMsg] = useState(notice || ""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState({}); const [tried, setTried] = useState(false);        // an error shows once the field was left, or Submit was pressed
  const [srv, setSrv] = useState({});                                       // the server's message for one field (X-Field)
  const [nudge, setNudge] = useState({});                                   // "letters only" hint while a number / symbol is being dropped
  const [link, setLink] = useState(null);                                  // the reset link: null = checking · { valid, email }
  const [ver, setVer] = useState(null);                                    // the confirmation link: null = checking · { ok, status, message }
  const [needVerify, setNeedVerify] = useState(false);                     // sign-in refused because the email is not confirmed
  useEffect(() => {
    if (!verifyToken) return;
    setMode("verify"); setVer(null);
    api("/app/api/signup/verify", { method:"POST", json:{ token:verifyToken } }).then(r => setVer({ ok:true, ...r })).catch(e => setVer({ ok:false, message:e.message }));
  }, [verifyToken]);
  useEffect(() => {
    if (!resetToken) return;
    setMode("reset"); setLink(null); setMsg(""); setOk("");                  // also when the sign-in form was already open
    api("/app/api/password/check", { method:"POST", json:{ token:resetToken } }).then(setLink).catch(e => setLink({ valid:false, message:e.message }));
  }, [resetToken]);
  const resend = async () => {
    setMsg(""); setBusy(true);
    try { const r = await api("/app/api/signup/resend", { method:"POST", json:{ email:f.email.trim() } }); setNeedVerify(false); setOk(r.message); }
    catch (x) { setMsg(x.message); } finally { setBusy(false); }
  };
  // the rules for the form on screen (the server checks the same again)
  const reg = mode === "register";
  const errs = {};
  if (mode === "login" || mode === "forgot") {
    const e = f.email.trim();
    errs.email = !e ? "Please enter your email address." : !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) ? "Please enter a valid email address." : "";
    if (mode === "login") errs.password = f.password ? "" : "Please enter your password.";
  } else if (mode === "reset") {
    errs.password = passwordError(f.password); errs.confirm = f.confirm !== f.password ? "The two passwords do not match." : "";
  } else if (reg) {
    errs.name = nameError(f.name);
    errs.phone = phoneError(DIAL_BY[f.ccName], f.phone);
    errs.country = COUNTRIES.includes(f.country) ? "" : "Please choose your country.";
    errs.state = f.country === "India" ? (IN_STATES.includes(f.state) ? "" : "Please choose your state.") : placeError(f.state, "state");
    errs.city = placeError(f.city, "city", false);
    errs.email = emailError(f.email, true);
    errs.password = passwordError(f.password, f.email, f.name);
    errs.confirm = f.confirm !== f.password ? "The two passwords do not match." : "";
    errs.accept = f.accept ? "" : "Please tick the box to agree to the terms.";
  }
  const shown = k => (touched[k] || tried) ? (errs[k] || "") : "";
  const err = k => shown(k) || srv[k] || nudge[k] || "";
  const set = k => e => { const v = e.target.type === "checkbox" ? e.target.checked : e.target.value; setSrv(o => ({ ...o, [k]:"" })); setF(p => ({ ...p, [k]: v })); };
  const blur = k => () => setTouched(o => ({ ...o, [k]:true }));
  const typed = (k, clean, hint) => e => {                                 // a letters-only box: numbers / symbols are dropped as typed, with a one-line hint
    const raw = e.target.value, v = clean(raw);
    setSrv(o => ({ ...o, [k]:"" }));
    if (v !== raw && v.length < raw.length) { setNudge(o => ({ ...o, [k]:hint })); setTimeout(() => setNudge(o => ({ ...o, [k]:"" })), 2600); }
    setF(p => ({ ...p, [k]: v }));
  };
  const go = (m, keepOk = false) => { setMode(m); setMsg(""); if (!keepOk) setOk(""); setNeedVerify(false); setTouched({}); setTried(false); setSrv({}); setNudge({}); setF(p => ({ ...p, password:"", confirm:"" })); };
  const submit = async e => {
    e.preventDefault(); setMsg(""); setNeedVerify(false); setTried(true);
    const bad = Object.keys(errs).find(k => errs[k]);
    if (bad) { const el = document.getElementById(`f-${bad}`); if (el) el.focus(); return; }
    setBusy(true);
    try {
      const email = f.email.trim().toLowerCase();
      if (mode === "login") { await api("/app/api/login", { method:"POST", json:{ email, password:f.password } }); onIn(); }
      else if (mode === "forgot") { const r = await api("/app/api/password/forgot", { method:"POST", json:{ email } }); setOk(r.message); }
      else if (mode === "reset") {
        const r = await api("/app/api/password/reset", { method:"POST", json:{ token:resetToken, password:f.password } });
        if (onResetDone) onResetDone(true);
        go("login"); setOk(r.message);
      }
      else {
        const r = await api("/app/api/register", { method:"POST", json:{ name:f.name.trim().replace(/\s+/g, " "), email, phone:`+${DIAL_BY[f.ccName]} ${f.phone}`, country:f.country, state:f.state.trim(), city:f.city.trim(), password:f.password, accept:f.accept } });
        if (r.signed_in) { onIn(); return; }
        go("login", true); setOk(r.message);
      }
    } catch (x) {
      if (x.field && ["name", "email", "phone", "country", "state", "city", "password", "accept"].includes(x.field)) { setSrv(o => ({ ...o, [x.field]:x.message })); const el = document.getElementById(`f-${x.field}`); if (el) el.focus(); }
      else setMsg(x.message);
      setNeedVerify(!!x.verify);
    } finally { setBusy(false); }
  };
  // one labelled field with its own message line
  const Field = (label, input, k, hint) => <label className={`field ${err(k) ? "bad" : ""}`} htmlFor={`f-${k}`}><span>{label}</span>{input}
    {err(k) ? <span className="fe" role="alert" id={`fe-${k}`}>{err(k)}</span> : hint ? <span className="fh">{hint}</span> : null}</label>;
  if (mode === "verify") return (
    <div className="auth-page">
      <Hero/>
      <div className="auth-side">
        <div className="auth" id="auth-verify">
          {ver == null ? <><h1>Confirming your email…</h1><p className="muted">One moment.</p></>
            : ver.ok ? <><h1>{ver.status === "approved" ? "You're in!" : "Email confirmed"}</h1><div className="ok" id="verify-ok">{ver.message}</div></>
            : <><h1>This link can't be used</h1><div className="err" role="alert" id="verify-dead">{ver.message}</div></>}
          <button type="button" className="primary" id="verify-continue" disabled={ver == null} onClick={() => { if (onVerifyDone) onVerifyDone(); go("login"); }}>Go to sign in</button>
        </div>
        <p className="fine center">{DISCLAIMER}</p>
      </div>
    </div>
  );
  if (mode === "forgot" || mode === "reset") return (
    <div className="auth-page">
      <Hero/>
      <div className="auth-side">
        <form className="auth" onSubmit={submit} noValidate id={mode === "forgot" ? "auth-forgot" : "auth-reset"} onMouseDown={keepFocus}>
          {mode === "forgot" ? <>
            <h1>Reset your password</h1>
            <p className="muted">Enter the email you signed up with. We'll send you a link to choose a new password.</p>
            {ok ? <div className="ok" id="forgot-sent">{ok}</div>
              : Field("Email", <input id="f-email" type="email" value={f.email} onChange={e => set("email")({ target:{ value:noSpaces(e.target.value).toLowerCase() } })} onBlur={blur("email")} maxLength={254} autoComplete="email" placeholder="Your email address" autoFocus inputMode="email" aria-invalid={err("email") ? "true" : undefined}/>, "email")}
            {msg && <div className="err" role="alert">{msg}</div>}
            {!ok && <button className="primary" disabled={busy}>{busy ? "Please wait…" : "Send reset link"}</button>}
            {ok && <button type="button" className="primary" onClick={() => go("login")}>Back to sign in</button>}
            {ok && <p className="muted small">No email after a few minutes? Check the spam folder, or <a href="#" onClick={e => { e.preventDefault(); setOk(""); }}>try again</a>.</p>}
          </> : link == null ? <><h1>Choose a new password</h1><p className="muted">Checking your link…</p></>
            : !link.valid ? <>
              <h1>This link can't be used</h1>
              <div className="err" role="alert" id="reset-dead">{link.message}</div>
              <button type="button" className="primary" onClick={() => go("forgot")}>Send me a new link</button>
            </> : <>
              <h1>Choose a new password</h1>
              <p className="muted">For <b>{link.email}</b>. You'll be signed out on every device, then you can sign in with the new password.</p>
              <div className="grid2">
                {Field("New password", <PwBox id="f-password" value={f.password} onChange={set("password")} autoComplete="new-password" placeholder="8+ characters" autoFocus bad={!!err("password")} invalid={!!err("password")}/>, "password", "8+ characters with a letter and a number")}
                {Field("Confirm password", <PwBox id="f-confirm" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" bad={!!err("confirm")} invalid={!!err("confirm")}/>, "confirm")}
              </div>
              {msg && <div className="err" role="alert">{msg}</div>}
              <button className="primary" disabled={busy}>{busy ? "Please wait…" : "Save new password"}</button>
            </>}
          {!(mode === "forgot" && ok) && <div className="switch"><a href="#" id="back-signin" onClick={e => { e.preventDefault(); if (onResetDone) onResetDone(false); go("login"); }}>Back to sign in</a></div>}
        </form>
        <p className="fine center">{DISCLAIMER}</p>
      </div>
    </div>
  );
  const score = passwordScore(f.password);
  return (
    <div className="auth-page">
      <Hero/>
      <div className="auth-side">
        <form className="auth" onSubmit={submit} noValidate id={reg ? "auth-register" : "auth-login"} onMouseDown={keepFocus}>
          <h1>{mode === "login" ? "Welcome back" : "Create your free account"}</h1>
          <p className="muted">{mode === "login" ? "Sign in to see where the strength is today — and what to avoid." : "It takes a minute. We'll email you a link to confirm your address — your account opens right after."}</p>
          {ok && <div className="ok" id="auth-ok">{ok}</div>}
          {reg && <>
            {Field("Full name", <input id="f-name" value={f.name} onChange={typed("name", lettersOnly, "Letters only — numbers and symbols aren't allowed in the name.")} onBlur={blur("name")} maxLength={60} autoComplete="name" autoFocus
              aria-invalid={err("name") ? "true" : undefined} autoCapitalize="words" spellCheck={false}/>, "name")}
            <label className={`field ${err("phone") ? "bad" : ""}`} htmlFor="f-phone">
              <span className="wa-l"><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="#25d366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.6 14.1c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.7-2.2 1-2.5c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .7.5l1 2.3c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.2 1c.3.2.5.2.6.4.1.1.1.8-.2 1.5z"/></svg>WhatsApp number</span>
              <div className="wa-in">
                <DialSelect value={f.ccName} onChange={n => setF(p => ({ ...p, ccName:n, ccSet:true, phone:p.phone.slice(0, DIAL_BY[n] === "91" ? 10 : 13) }))}/>
                <input id="f-phone" value={f.phone} onChange={e => { const v = e.target.value.replace(/\D/g, ""); setSrv(o => ({ ...o, phone:"" })); setF(p => ({ ...p, phone:v.slice(0, DIAL_BY[p.ccName] === "91" ? 10 : 13) })); }} onBlur={blur("phone")}
                  inputMode="numeric" autoComplete="tel-national" maxLength={DIAL_BY[f.ccName] === "91" ? 10 : 13} aria-label="WhatsApp number" aria-invalid={err("phone") ? "true" : undefined}/>
              </div>
              {err("phone") ? <span className="fe" role="alert" id="fe-phone">{err("phone")}{f.phone && DIAL_BY[f.ccName] === "91" && f.phone.length < 10 ? ` (${f.phone.length}/10 digits)` : ""}</span> : null}
              <span className="wa-note">Use your <b>WhatsApp</b> number — we'll invite you to the <b>Hyperplane community</b>: a healthy, disciplined
                circle that learns to trade with the trend and protect capital. Your number is never shared or sold.</span>
            </label>
            <div className="grid2">
              {Field("Country", <select id="f-country" value={f.country} onChange={e => { const c = e.target.value; setSrv(o => ({ ...o, country:"" })); setF(p => ({ ...p, country:c, state:"", ...(!p.ccSet && DIAL_BY[c] ? { ccName:c } : {}) })); }} onBlur={blur("country")}>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select>, "country")}
              {Field("State", f.country === "India"
                ? <select id="f-state" value={f.state} onChange={set("state")} onBlur={blur("state")} aria-invalid={err("state") ? "true" : undefined}><option value="">Choose your state</option>{IN_STATES.map(s => <option key={s}>{s}</option>)}</select>
                : <input id="f-state" value={f.state} onChange={typed("state", lettersOnly, "Letters only for the state.")} onBlur={blur("state")} maxLength={60} aria-invalid={err("state") ? "true" : undefined}/>, "state")}
            </div>
            {Field("City (optional)", <input id="f-city" value={f.city} onChange={typed("city", lettersOnly, "Letters only for the city.")} onBlur={blur("city")} maxLength={60} autoComplete="address-level2" aria-invalid={err("city") ? "true" : undefined}/>, "city")}
          </>}
          {Field("Email", <input id="f-email" type="email" value={f.email} onChange={e => set("email")({ target:{ value:noSpaces(e.target.value).toLowerCase() } })} onBlur={blur("email")} maxLength={254}
              autoComplete={reg ? "email" : "username"} placeholder={reg ? "yourname@gmail.com" : "Your email address"} inputMode="email" autoFocus={!reg} aria-invalid={err("email") ? "true" : undefined} autoCapitalize="off" spellCheck={false}/>, "email",
            reg ? "Gmail only — we'll send the confirmation link there. Company and other email addresses aren't accepted." : null)}
          {reg
            ? <div className="grid2">
                {Field("Password", <PwBox id="f-password" value={f.password} onChange={set("password")} autoComplete="new-password" placeholder="8+ characters" bad={!!err("password")} invalid={!!err("password")}/>, "password", "8+ characters with a letter and a number")}
                {Field("Confirm password", <PwBox id="f-confirm" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" bad={!!err("confirm")} invalid={!!err("confirm")}/>, "confirm")}
              </div>
            : <>{Field("Password", <PwBox id="f-password" value={f.password} onChange={set("password")} autoComplete="current-password" bad={!!err("password")} invalid={!!err("password")}/>, "password")}
                <div className="forgot"><a href="#" id="forgot-link" onClick={e => { e.preventDefault(); go("forgot"); }}>Forgot password?</a></div></>}
          {reg && f.password && <div className={`pwm s${score}`} id="pw-meter" aria-live="polite"><span><i/><i/><i/><i/></span><b>{PW_LABEL[score]}</b></div>}
          {reg && (
            <label className={`agree ${f.accept ? "on" : ""} ${err("accept") ? "bad" : ""}`}>
              <input id="f-accept" type="checkbox" checked={f.accept} onChange={set("accept")}/>
              <span><b>I agree to the terms.</b> {DISCLAIMER}{err("accept") && <span className="fe" role="alert" id="fe-accept">{err("accept")}</span>}</span>
            </label>
          )}
          {msg && <div className="err" role="alert" id="auth-err">{msg}</div>}
          {mode === "login" && needVerify && <button type="button" className="resend" id="auth-resend" disabled={busy} onClick={resend}>Send the confirmation link again</button>}
          <button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
          <div className="switch">
            {mode === "login" ? <>New to Hyperplane? <a href="#" onClick={e => { e.preventDefault(); go("register"); }}>Create a free account</a></>
                              : <>Already have an account? <a href="#" onClick={e => { e.preventDefault(); go("login"); }}>Sign in</a></>}
          </div>
        </form>
        <p className="fine center">{DISCLAIMER}</p>
      </div>
    </div>
  );
}

// ─── past data (permission research:history, round 16): ONE scheduled collection — a date, then Day open or Day end ───
const PARTS = [["open", "Day open"], ["end", "Day end"]];
const ZONE_APPS = ["builder", "sip", "msip"], ETF_APPS = ["etf", "sip"];
function DayPicker({ days, sel, asOf, onPick, onOpen, face }) {
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
          {day && ((ZONE_APPS.includes(face) && day.zones === false) || (ETF_APPS.includes(face) && day.etf === false)) &&
            <div className="dp-none" id="dp-limit">{ZONE_APPS.includes(face) && day.zones === false ? "This day was collected before the zone view was stored — this application cannot use it. AI Mode, Deep Research and the Analyser can." : "No ETF data is stored for this day."}</div>}
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
  research: lazy(() => loadChunk(() => import("./apps/research.jsx"))),
  simple: lazy(() => loadChunk(() => import("./apps/simple.jsx"))),
  portfolio: lazy(() => loadChunk(() => import("./apps/portfolio.jsx"))),
  builder: lazy(() => loadChunk(() => import("./apps/builder.jsx"))),
  etf: lazy(() => loadChunk(() => import("./apps/etf.jsx"))),                     // ETF analyser: its own data (/app/api/etf)
  sip: lazy(() => loadChunk(() => import("./apps/sip.jsx"))),                     // AI ETF SIP Builder (ETFs, reliable)
  msip: lazy(() => loadChunk(() => import("./apps/msip.jsx"))),                   // AI Momentum SIP (stocks, risk)
};
const Guide = lazy(() => loadChunk(() => import("./guide.jsx")));
// stock detail view (customer admin): its own chunk, downloaded only by someone with a detail permission who opens it
const StockDetail = lazy(() => loadChunk(() => import("./apps/detail.jsx")));
const SharedView = lazy(() => loadChunk(() => import("./saved.jsx").then(m => ({ default: m.SharedView }))));   // /app/portfolio/<ID> of someone else
const DATA_APPS = ["research", "simple", "portfolio"];         // the builder works on the server: no stock data needed
const Waiting = ({ text = "Loading…" }) => <div className="card empty">{text}</div>;

function Home({ me, onOut, reloadMe }) {
  const apps = me.apps || [];
  const allowed = apps.map(a => a.key);
  const [rawData, setData] = useState(null); const [err, setErr] = useState("");
  const [mode, setModeState] = useState(getMode);
  const setMode = m => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* storage blocked */ } };
  const data = useMemo(() => rawData && applyMode(rawData, mode), [rawData, mode]);
  // the address decides what opens (/app/<app-name>, /app/portfolio/<ID>, /app/docs, /app/helpdesk); without one, the app of this tab, else the first pin
  const route0 = useMemo(() => routeOf(), []);
  const [view, setView] = useState(route0.view || "tower"); const [hdReq, setHdReq] = useState(null);
  const [faceRaw, setFaceRaw] = useState(() => route0.app || (() => { try { return sessionStorage.getItem("qf_face"); } catch { return null; } })());
  const [shared, setShared] = useState(null);                     // the ID of a public portfolio of someone else, shown as a page
  const [navMin, setNavMinRaw] = useState(getNavMin); const [navOpen, setNavOpen] = useState(false);
  // pinned applications (rail shows at most max_pins; everything is under "More apps"); null = never chose → first 6
  const maxPins = me.max_pins || 8;
  const [pinsRaw, setPinsRaw] = useState(me.pins ?? null);
  useEffect(() => { setPinsRaw(me.pins ?? null); }, [me]);
  const pins = (pinsRaw ?? allowed.slice(0, maxPins)).filter(k => allowed.includes(k)).slice(0, maxPins);   // default order: AI Mode, Deep Research, …
  // the open application: one the customer's roles allow; at sign-in the first pinned app (the landing page), else the first one
  const face = allowed.includes(faceRaw) ? faceRaw : pins[0] || allowed[0] || null;
  const [moreOpen, setMoreOpen] = useState(false); const [pinMsg, setPinMsg] = useState("");
  const savePins = (next, prev) => api("/app/api/pins", { method: "PUT", json: { pins: next } })
    .catch(e => { setPinsRaw(prev); setPinMsg(`Could not save: ${e.message}`); if (e.noAccess) reloadMe(); else if (e.status === 401) onOut(e.message); });
  const movePin = (k, d) => {
    const i = pins.indexOf(k), j = i + d;
    if (i < 0 || j < 0 || j >= pins.length) return;
    const next = [...pins]; [next[i], next[j]] = [next[j], next[i]];
    const prev = pinsRaw; setPinsRaw(next); setPinMsg(""); savePins(next, prev);
  };
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
  const setFace = (f, push = true) => { leave(); setFaceRaw(f); setView("tower"); setShared(null); setNavOpen(false); try { sessionStorage.setItem("qf_face", f); } catch { /* storage blocked */ }
    if (push) goPath(`/app/${APP_SLUG[f] || ""}`); };
  const goView = v => { leave(); setView(v); setShared(null); setNavOpen(false); goPath(v === "guide" ? "/app/docs" : v === "helpdesk" ? "/app/helpdesk" : `/app/${APP_SLUG[face] || ""}`); };
  useEffect(() => { const y = scrollAt.current[here_] || 0; requestAnimationFrame(() => window.scrollTo(0, y)); }, [here_]);
  const [simpleSym, setSimpleSym] = useState(null);
  // AI Portfolio: the customer's stock list, saved to their account (no quantities)
  const [pf, setPfRaw] = useState(null); const [pfStatus, setPfStatus] = useState("");
  const [pfSent, setPfSent] = useState(0);                       // the builder sent stocks: the Analyser shows its analysis
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
    setPfRaw(next); setPfSent(n => n + 1);
  };
  const [appAsOf, setAppAsOf] = useState({});
  const reportAsOf = useCallback((k, v) => setAppAsOf(o => o[k] === v ? o : { ...o, [k]: v }), []);
  const hdApi = useCallback((p, o) => api(p, o).catch(e => { if (e.status === 401 || e.status === 403) onOut(e.message); throw e; }), []);
  const unread = useHelpdeskUnread(hdApi, "/app/api/helpdesk");
  const openHelpdesk = (id, tpl) => { goView("helpdesk"); setHdReq({ id, tpl, n: Date.now() }); };
  // notification centre (notify.jsx): Hyperplane AI alerts + helpdesk replies; an alert opens its application on the right
  // saved plan (sessionStorage hp_open_<app> for a module not loaded yet, the hp-open event for one already open)
  const notes = useNotifications(onOut);
  const openFrom = (k, ref, push = true) => {
    try { sessionStorage.setItem(`hp_open_${k}`, JSON.stringify({ ref })); } catch { /* storage blocked */ }
    setFace(k, push); window.scrollTo(0, 0);
    setTimeout(() => window.dispatchEvent(new CustomEvent("hp-open", { detail: { app: k, ref } })), 60);
  };
  // /app/portfolio/<ID>: the customer's own portfolio opens in its application; someone else's public one opens read only
  // /app/<app-name>/portfolio/<ID>: one of the customer's own saved portfolios; anything else goes to the public page of that ID
  const openCode = r => {
    const pub = () => window.location.assign(`/app/portfolio/${encodeURIComponent(r.code)}`);
    if (!r.app || !allowed.includes(r.app)) { pub(); return; }
    api("/app/api/saved?kind=all").then(list => {
      const mine = (list || []).find(x => x.code === r.code);
      if (mine) { setShared(null); openFrom(r.app, mine.id, false); } else pub();
    }).catch(e => { if (e.status === 401) onOut(e.message); else pub(); });
  };
  // the browser's Back / Forward and links inside the app: follow the address
  useEffect(() => {
    const follow = () => {
      const r = routeOf();
      if (r.public) { window.location.reload(); return; }                       // the public page is its own page
      if (r.code) { openCode(r); return; }
      setShared(null);
      if (r.view) { setView(r.view); return; }
      if (r.app && allowed.includes(r.app)) { setFaceRaw(r.app); setView("tower"); try { sessionStorage.setItem("qf_face", r.app); } catch { /* storage blocked */ } }
    };
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, [allowed.join(), shared]);
  // first paint: an ID in the address opens it; otherwise the address names the application on screen
  useEffect(() => {
    if (route0.code) openCode(route0);
    else if (!route0.view && face) goPath(`/app/${APP_SLUG[face] || ""}`, true);
    if (window.location.search) try { window.history.replaceState(null, "", window.location.pathname); } catch { /* ignore */ }   // ?signup used up
  }, []);
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
  // past data (round 16): the permission research:history (Customer Admin) — a day picker in EVERY application; sel = { date, part }
  // or null for the latest published data. The day goes with every request (core.setApiDay), so the server answers with that day.
  const canPast = (me.perms || []).includes("research:history");
  const [hist, setHist] = useState(null); const [sel, setSelRaw] = useState(null);
  const setSel = v => { setApiDay(v); setSelRaw(v); };
  const loadHist = () => api("/app/api/history").then(setHist).catch(() => setHist(null));
  useEffect(() => { if (canPast) loadHist(); else { setHist(null); setSel(null); } }, [canPast]);
  const dayKey = sel ? `${sel.date}.${sel.part}` : "latest";
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
  // stock detail view: AI Portfolio Analyser follows the day on screen, the builder always works on the latest data
  const perms = me.perms || [];
  const [detail, setDetail] = useState(null);
  const detailCtx = useMemo(() => perms.some(p => p.endsWith(":detail")) ? {
    can: k => perms.includes(`${k}:detail`),
    open: (sym, k) => setDetail({ sym, app: k, day: k === "portfolio" ? sel : null, n: Date.now() }),
  } : null, [perms.join(), sel]);
  const app = k => {
    if (k === "research") return <APP_MODULES.research data={data} err={err} sel={sel} mode={mode} setMode={setMode}/>;
    // the applications with their own server data start again on that day when the day changes (key)
    if (k === "etf") return <APP_MODULES.etf key={dayKey} onOut={onOut}/>;
    if (k === "sip") return <APP_MODULES.sip key={dayKey} apps={apps} onAddToPortfolio={addToPf} onOpenApp={setFace} onOut={onOut} onHelpdesk={openHelpdesk}/>;
    if (k === "msip") return <APP_MODULES.msip key={dayKey} apps={apps} onAddToPortfolio={addToPf} onOpenApp={setFace} onOut={onOut} onHelpdesk={openHelpdesk}/>;
    if (k === "builder") return <APP_MODULES.builder key={dayKey} apps={apps} onAddToPortfolio={addToPf} onOpenApp={setFace} onOut={onOut} onHelpdesk={openHelpdesk}/>;
    if (!data) return <Waiting text={err || "Loading…"}/>;
    if (k === "simple") return <APP_MODULES.simple data={data} mode={mode} setMode={setMode} sym={simpleSym} setSym={setSimpleSym}/>;
    if (k === "portfolio") return pf != null ? <APP_MODULES.portfolio data={data} symbols={pf} setSymbols={setPf} status={pfStatus} me={me} sent={pfSent} onOut={onOut}/> : <Waiting/>;
    return null;
  };

  const curApp = apps.find(a => a.key === face);
  useEffect(() => {                                               // the browser tab says where the customer is
    const n = view === "helpdesk" ? "Helpdesk" : view === "guide" ? "Docs" : shared ? "Shared portfolio" : curApp ? curApp.name : "";
    document.title = n ? `${n} · Hyperplane` : "Hyperplane";
  }, [view, face, shared, curApp && curApp.name]);
  const here = view === "helpdesk" ? { icon: <HelpdeskIcon size={18}/>, name: "Helpdesk", sub: "Your questions and our answers" }
    : view === "guide" ? { icon: <GuideIcon/>, name: "Docs", sub: "How to use Hyperplane · golden rules" }
    : curApp ? { icon: <AppIcon k={curApp.key}/>, name: curApp.name, sub: curApp.description } : { icon: null, name: "Hyperplane", sub: "" };
  const showsData = view === "tower" && DATA_APPS.includes(face);
  const ownAsOf = view === "tower" && !showsData && face ? appAsOf[face] : null;     // apps with their own data (ETF, SIP, Builder)
  return (
    <DetailCtx.Provider value={detailCtx}><AsOfCtx.Provider value={reportAsOf}>
    <div className={`shell ${navMin ? "nav-min" : ""}`}>
      <SideNav apps={apps} pins={pins} face={face} view={view} onFace={k => { setMoreOpen(false); setFace(k); }}
        onDocs={() => { setMoreOpen(false); goView("guide"); }} onHelpdesk={() => { setMoreOpen(false); openHelpdesk(null); }}
        unread={unread.total} min={navMin} setMin={setNavMin} open={navOpen} onClose={() => { setNavOpen(false); setMoreOpen(false); }}
        moreOn={moreOpen || (view === "tower" && !!face && !pins.includes(face))} onMore={() => { setPinMsg(""); setMoreOpen(v => !v); }}/>
      {moreOpen && <AppsPanel apps={apps} pins={pins} maxPins={maxPins} current={view === "tower" ? face : null} msg={pinMsg}
        onOpen={k => { setMoreOpen(false); setFace(k); }} onPin={togglePin} onMove={movePin} onClose={() => setMoreOpen(false)}/>}
      <div className="shell-main">
    <div className="page">
      <header className="top">
        <button type="button" className="sn-burger" onClick={() => setNavOpen(true)} aria-label="Open menu" id="nav-burger"><MenuIcon/></button>
        <div className="top-here" id="top-here">
          {here.icon && <span className="th-ic">{here.icon}</span>}
          <div className="th-t"><b>{here.name}</b>{here.sub && <span className="th-sub">{here.sub}</span>}</div>
        </div>
        {view === "tower" && face && hist && hist.enabled && hist.days.length
          ? <DayPicker days={hist.days} sel={sel} asOf={showsData ? data && data.as_of : ownAsOf || (sel && (hist.days.find(x => x.d === sel.date) || {})[sel.part])} onPick={setSel} onOpen={loadHist} face={face}/>
          : <>{showsData && <div className="asof">{data ? <>DATA AS OF <b>{fmtDT(data.as_of)}</b></> : err ? "" : "Loading…"}</div>}
            {ownAsOf && <div className="asof" id="top-asof">DATA AS OF <b>{fmtDT(ownAsOf)}</b></div>}</>}
        <QuickGuideButton onDocs={() => goView("guide")}/>
        <NotifyCenter notes={notes} hd={unread} apps={apps} onHelpdesk={openHelpdesk} onOpen={openFrom}/>
        <AccountMenu me={me} unread={unread.total} onHelpdesk={() => openHelpdesk(null)} onDocs={() => goView("guide")}
          onSignOut={async () => { try { sessionStorage.removeItem("qf_face"); } catch { /* storage blocked */ } await api("/app/api/logout", { method:"POST" }).catch(() => {}); goPath("/app/", true); onOut(); }}/>
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
      {view === "helpdesk" && <><BrandBand product="Helpdesk" title="Helpdesk" accent="we reply here" id="hd-band" sub="Ask anything; our replies show up here and on the bell."/>
        <Helpdesk api={hdApi} base="/app/api/helpdesk" openReq={hdReq} onChanged={unread.refresh} templates={HD_TEMPLATES}/></>}
      {shared && view === "tower" && <Suspense fallback={<Waiting/>}><SharedView code={shared} page onClose={() => setFace(face)}/></Suspense>}
      {[...opened].filter(k => allowed.includes(k)).map(k => (
        <div key={k} className="app-pane" data-app={k} hidden={!(view === "tower" && face === k && !shared)}>
          <Suspense fallback={<Waiting/>}>{app(k)}</Suspense>
        </div>))}

      <footer><p className="fine">{DISCLAIMER}</p><p className="fine">© {new Date().getFullYear()} QuantFriday · Hyperplane</p></footer>
    </div>
      </div>
      {detail && <Suspense fallback={null}><StockDetail req={detail} onClose={() => setDetail(null)} onOut={onOut}/></Suspense>}
    </div>
    </AsOfCtx.Provider></DetailCtx.Provider>
  );
}

export function App() {
  const [me, setMe] = useState(undefined); const [notice, setNotice] = useState("");
  const [resetToken, setResetToken] = useState(takeResetToken);              // opened from a "Forgot password" email
  const [verifyToken, setVerifyToken] = useState(takeVerifyToken);           // opened from the sign-up confirmation email
  const load = () => api("/app/api/me").then(setMe).catch(e => { setMe(null); if (e.status === 403) setNotice(e.message); });
  useEffect(() => { load(); }, []);
  // "signed in on this browser" for the open shared page (round 15: "if already logged in, don't show sign up / log in"): only a hint —
  // it grants nothing; the public page never asks the server who is signed in
  useEffect(() => { if (me === undefined) return; try { me ? localStorage.setItem("hp_signed", "1") : localStorage.removeItem("hp_signed"); } catch { /* storage blocked */ } }, [me]);
  // a reset link pasted into a tab that already shows the app changes only the #part: no reload, so listen for it
  useEffect(() => {
    const f = () => { const t = takeResetToken(); if (t) setResetToken(t); const v = takeVerifyToken(); if (v) setVerifyToken(v); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  // changed → signed out everywhere, so the sign-in form; left without changing → back to wherever this browser was
  if (verifyToken) return <AuthScreen onIn={load} verifyToken={verifyToken} onVerifyDone={() => setVerifyToken(null)}/>;
  if (resetToken) return <AuthScreen onIn={load} resetToken={resetToken} onResetDone={changed => { setResetToken(null); if (changed) setMe(null); else load(); }}/>;
  if (me === undefined) return <div className="loading"><Brand/></div>;
  if (!me) return <AuthScreen onIn={load} notice={notice}/>;
  // later refreshes (plan changed by Admin) keep the page on a network hiccup; only a real sign-out ends it
  const refresh = () => api("/app/api/me").then(setMe).catch(e => { if (e.status === 401 || e.status === 403) { setMe(null); if (e.status === 403) setNotice(e.message); } });
  return <Home me={me} reloadMe={refresh} onOut={msg => { setNotice(typeof msg === "string" ? msg : ""); setMe(null); }}/>;
}
