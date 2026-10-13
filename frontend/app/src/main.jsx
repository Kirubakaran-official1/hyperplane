// Hyperplane by QuantFriday — customer edition (/app).
// Self-contained on purpose: it must never import the dashboard code. It only shows what the server publishes.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Helpdesk, HelpdeskIcon, InboxBell, useHelpdeskUnread } from "../../shared/helpdesk.jsx";
import Guide, { GUIDE_CSS } from "./guide.jsx";
import { QuickGuideButton, QUICK_CSS } from "./quick.jsx";
import { DIAL_CODES, POPULAR_DIAL } from "./dial.js";

// ─── vocabulary ──────────────────────────────────────────────────────────────
const TFS = [["D","Daily","short term"],["W","Weekly","weeks"],["M","Monthly","months"],["Q","Quarterly","quarters"],["Y","Yearly","long term"]];
const TF_NAME = { A:"Combined", ...Object.fromEntries(TFS.map(([k,l]) => [k,l])) };
const SIZES = ["Large","Mid","Small","Others"];
const TREND_CUT = 24;                       // |strength| below this = sideways (the server's Good / Weak cut)
// WhatsApp country code: every country (dial.js); it follows the Country choice until the user picks a code
const DIAL_BY = Object.fromEntries(DIAL_CODES);
// India: 10 digits starting 6-9; elsewhere 5-13 digits (E.164 allows 15 digits including the country code)
const phoneError = (code, num) => code === "91" ? (/^[6-9]\d{9}$/.test(num) ? "" : "Enter your 10-digit WhatsApp number (it starts with 6, 7, 8 or 9)")
  : (/^\d{5,13}$/.test(num) ? "" : "Enter your WhatsApp number without the country code (digits only)");
const foldText = t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
const DISCLAIMER = "Hyperplane shows trend information for education only. It is not investment advice or a recommendation to buy or sell any security. Please do your own research or consult a SEBI-registered adviser before investing.";

const idx = tf => "DWMQY".indexOf(tf);
const dirTf = (s, i) => ({ G:1, W:-1, M:0 })[s.r[i]] ?? null;
const dirVal = v => v == null ? null : v >= TREND_CUT ? 1 : v <= -TREND_CUT ? -1 : 0;
// Level words (owner, 2026-10-11): Weak 0–30 · Average 31–60 · Good 61–80 · Strong 81–100 on the rounded |value|.
// Stocks keep the sideways cut (|strength| < TREND_CUT); sector / industry use the same words on their 0–100% strength.
const levelOf = v => { const a = Math.round(Math.abs(v)); return a > 80 ? "Strong" : a > 60 ? "Good" : a > 30 ? "Average" : "Weak"; };
const strengthWord = a => levelOf(a);
const aan = w => /^[aeiou]/i.test(w) ? "an" : "a";
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
// A sector / industry backs the stock when it is Good or Strong (61%+) and counts against it when Weak (30% or less)
const groupState = g => !g ? null : Math.round(g.st) > 60 ? "up" : Math.round(g.st) <= 30 ? "down" : "side";
const groupWord = g => levelOf(g.st).toLowerCase();
function combinedView(od, bi, sec, ind, os = null, stretched = false) {
  const gs = [sec && ["sector", groupState(sec)], ind && ["industry", groupState(ind)]].filter(Boolean);
  const weak = gs.filter(([, st]) => st === "down").map(([n]) => n), strong = gs.length > 0 && gs.every(([, st]) => st === "up");
  const which = weak.join(" and ");
  let v;
  if (od === 1 && stretched) v = ["warn", "⚠ Overheated — don't chase", "The stock has run up 3x or more in about a year. Even if the trend looks strong, prices this stretched often fall back sharply — wait for it to cool down and build a base."];
  else if (od === 1 && strong && os != null && Math.round(Math.abs(os)) <= 60) v = ["watch", "👁 Watch — stock still building", "Its sector and industry are strong, but the stock's own trend is only average. Keep it on your watch list and act when it turns strong."];
  else if (od === 1) v = strong ? ["good", "✓ Best case — with the tide", "Strong stock in a strong industry and a strong sector. Everything points the same way."]
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

// ─── trading mode: how much each timeframe counts in the COMBINED strength (stocks, sectors, industries) ───
const MODES = {
  equal:  { label: "Balanced",           short: "Balanced",  hint: "every timeframe counts the same",                       w: { D: 1, W: 1, M: 1, Q: 1, Y: 1 } },
  swing:  { label: "Swing / Positional", short: "Swing",     hint: "Monthly and Quarterly count most — trades of weeks to months", w: { D: 1, W: 2, M: 3, Q: 3, Y: 1 } },
  invest: { label: "Investing",          short: "Investing", hint: "Quarterly and Yearly count most — holding for a year or more", w: { D: 0, W: 0.5, M: 1.5, Q: 4, Y: 4 } },
};
const MODE_KEY = "qf_mode";
const getMode = () => { try { const m = localStorage.getItem(MODE_KEY); return MODES[m] ? m : "equal"; } catch { return "equal"; } };
const weightPct = w => { const t = Object.values(w).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(v / t * 100)])); };
// Recompute every "Combined" number with the mode's weights: stock os from its D..Y strengths; sector / industry
// strength and net bias from their D..Y rows (counts, breadth and moves stay from the server's combined rows).
function applyMode(data, mode) {
  const W = MODES[mode].w, TF = "DWMQY".split("");
  const comb = sc => { let a = 0, b = 0; TF.forEach((t, i) => { const v = (sc || [])[i]; if (v != null && W[t] > 0) { a += W[t] * v; b += W[t]; } }); return b ? Math.round(a / b) : null; };
  const groups = byTf => {
    if (!byTf) return byTf;
    const acc = {}, key = r => `${r.k}|${r.sec || ""}`;
    TF.forEach(t => W[t] > 0 && (byTf[t] || []).forEach(r => {
      const a = acc[key(r)] = acc[key(r)] || { k: r.k, sec: r.sec, st: 0, nb: 0, w: 0 };
      a.st += W[t] * r.st; a.nb += W[t] * r.nb; a.w += W[t];
    }));
    const base = Object.fromEntries((byTf.A || []).map(r => [key(r), r]));
    const A = Object.values(acc).map(a => ({ ...(base[`${a.k}|${a.sec || ""}`] || { k: a.k, sec: a.sec, n: 0, sig: 0, adv: 0, dec: 0, avg: 0 }),
      st: Math.round(a.st / a.w * 10) / 10, nb: Math.round(a.nb / a.w * 10) / 10 })).sort((x, y) => y.st - x.st);
    return { ...byTf, A };
  };
  return { ...data, stocks: data.stocks.map(s => ({ ...s, os: comb(s.sc) })), sectors: groups(data.sectors), industries: groups(data.industries) };
}

// "AI insights" on the stock card: three short lines (good · watch out · focus) written by rules from the published
// numbers of the stock, its industry and its sector. Information, never a buy / sell call.
function insightsOf(s, od, bi, sec, ind, view, indRank, indCount) {
  const names = ["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"];
  const sc = s.sc || [];
  const ups = names.filter((_, i) => dirTf(s, i) === 1), dns = names.filter((_, i) => dirTf(s, i) === -1);
  const good = [], bad = [];
  if (od === 1 && ups.length) {
    const best = sc.reduce((b, v, i) => (v != null && dirTf(s, i) === 1 && (b < 0 || v > sc[b]) ? i : b), -1);
    good.push(`Uptrend on ${ups.length} of 5 timeframes${best >= 0 ? `, strongest on ${names[best]} (${Math.abs(sc[best])}%)` : ""}`);
  }
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
  const focus = s.x && od === 1 ? "Don't chase. Wait for it to cool down or build a base — the Daily strength turning up again is the first sign."
    : tone === "good" ? "Plan your entry and stop-loss on the chart; the Daily trend is the one to watch for timing."
    : tone === "warn" ? `Watch ${weakGroup ? `the ${weakGroup[1]} ${weakGroup[0]}` : "its group"} — the idea improves only when it turns strong. Until then, wait.`
    : tone === "watch" && od === 1 ? "Keep it on your watch list and act when the stock's own trend turns strong on your timeframe."
    : tone === "watch" ? "A laggard in a strong group — wait for its Weekly and Daily trend to turn up before acting."
    : tone === "bad" ? "Avoid for buying — look at stronger stocks in stronger groups (see the top 5 in its industry below)."
    : od === 0 ? "No edge yet — skip it until a clear trend appears."
    : `Prefer it only when its ${weakGroup ? weakGroup[0] : "group"} turns strong; compare it with the top 5 in its industry below.`;
  return { good: good.slice(0, 3), bad: bad.slice(0, 3), focus };
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
// Diverging bar from −100 to +100 with a 0 mark in the middle (owner, 2026-10-13): an uptrend fills to the right of 0,
// a downtrend to the left (anything below 0 is red). `scale` adds "−100 · 0 · +100" under it.
function DivBar({ v, d, scale = false, className = "" }) {
  const w = v == null ? 0 : Math.min(100, Math.abs(v)) / 2;
  const cls = v == null ? "" : v < 0 ? "down" : d === 1 ? "up" : "side";
  return (
    <div className={`dbar ${className}`} title={v == null ? "No data" : `${v < 0 ? "−" : "+"}${Math.abs(v)} on a scale from −100 (strong downtrend) to +100 (strong uptrend)`}>
      <div className="dbar-t"><i className="dbar-0" aria-hidden="true"/>
        {v != null && v !== 0 && <span className={`dbar-f ${cls}`} style={v > 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}/>}</div>
      {scale && <div className="dbar-s" aria-hidden="true"><span>−100</span><span className="z">0</span><span>+100</span></div>}
    </div>
  );
}
const StrengthBar = ({ v, d }) => <DivBar v={v} d={d}/>;

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

function Info({ text, right, wide, label }) {
  return <span className="info" tabIndex={0} onClick={e => e.stopPropagation()} aria-label={label || (typeof text === "string" ? text : "More info")}>i<span className={`info-pop ${right ? "r" : ""} ${wide ? "wide" : ""}`}>{text}</span></span>;
}

// Trading-mode ⓘ: how much each timeframe counts in each mode (the active one highlighted, top weights in bold)
function ModeWeights({ active }) {
  const TF = "DWMQY".split("");
  return <>
    <div>Blends all five timeframes into one strength, weighted for how you trade. Picking a mode clears the Timeframe filter.</div>
    <table className="mw">
      <thead><tr><th>Mode</th>{TF.map(t => <th key={t}>{t}</th>)}<th>Best for</th></tr></thead>
      <tbody>{Object.entries(MODES).map(([k, m]) => { const p = weightPct(m.w), top = Math.max(...Object.values(p));
        return <tr key={k} className={k === active ? "mw-on" : ""}>
          <td>{m.short}</td>{TF.map(t => <td key={t} className={`mw-n ${p[t] === top ? "mw-top" : ""} ${p[t] === 0 ? "mw-zero" : ""}`}>{p[t]}%</td>)}
          <td className="mw-hint">{k === "equal" ? "an all-round view" : k === "swing" ? "trades of weeks to months" : "holding a year or more"}</td></tr>; })}</tbody>
    </table>
    <div className="mw-foot">D Daily · W Weekly · M Monthly · Q Quarterly · Y Yearly</div>
  </>;
}

// Joined button group (Control-Tower style); multi = several can be on
function Seg({ items, isOn, onPick }) {
  return <div className="sg">{items.map(([k, l, tone, title]) =>
    <button key={k} type="button" title={title} className={`${isOn(k) ? "on" : ""} ${tone || ""}`} onClick={() => onPick(k)}>{l}</button>)}</div>;
}

function MultiSelect({ label, options, value, onChange, width = 200 }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const ref = useRef(null);
  const [alignRight, setAlignRight] = useState(false);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  // open towards the left when there is not enough room on the right (e.g. the Industry box at the end of the bar)
  const toggleOpen = () => {
    if (!open && ref.current) { const r = ref.current.getBoundingClientRect(); setAlignRight(r.left + Math.max(r.width, 300) > document.documentElement.clientWidth - 12); }
    setOpen(v => !v);
  };
  const shown = options.filter(o => !q || o.toLowerCase().includes(q.toLowerCase()));
  const toggle = o => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
  return (
    <div className="ms" ref={ref} style={{ width }}>
      <button type="button" className={`ms-btn ${value.length ? "on" : ""}`} onClick={toggleOpen}>
        <span>{value.length === 0 ? `All ${label}` : value.length === 1 ? value[0] : `${value.length} ${label}`}</span><span className="caret">▾</span>
      </button>
      {open && (
        <div className={`ms-pop ${alignRight ? "right" : ""}`}>
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
  // top 5, then (with their real rank) this stock and the stock first opened from the list when they are outside the top 5
  const top = indPeers.slice(0, 5), showSelf = indRank > 5;
  const originRank = origin && origin.s !== s.s ? indPeers.findIndex(x => x.s === origin.s) + 1 : 0;
  const extraRows = [...(showSelf ? [[s, indRank]] : []), ...(originRank > 5 ? [[indPeers[originRank - 1], originRank]] : [])].sort((a, b) => a[1] - b[1]);
  const secA = data ? ctx("A", false) : null, indA = data ? ctx("A", true) : null;
  const view = combinedView(od, bi, secA, indA, s.os, !!s.x);
  const ai = s.os != null ? insightsOf(s, od, bi, secA, indA, view, indRank, indPeers.length) : null;
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

        <div className="m-foot"><span className="sub">Data as of {fmtDT(asOf)} · strength = how strong the trend is (0–100%), not a price move</span><span className="sub m-disc">For education only — not investment advice.</span></div>
        <p className="fine">{DISCLAIMER}</p>
      </div>
    </div>
  );
}

const signed = v => v == null ? "—" : v < 0 ? `−${Math.abs(v)}` : `${Math.abs(v)}`;   // negative side gets a minus
// ─── trend gauge: −100 (strong downtrend) … 0 (sideways) … +100 (strong uptrend); zones use the same cuts as the labels ───
const G_ZONES = [[-100, -80, "#ff2d45"], [-80, -60, "#ff5f6d"], [-60, -TREND_CUT, "#ff9aa3"], [-TREND_CUT, TREND_CUT, "#8b97ad"],
                 [TREND_CUT, 60, "#86e5c4"], [60, 80, "#2fd39a"], [80, 100, "#00b884"]];
function TrendGauge({ v, size = 180, caption = true }) {
  const w = size, r = size * 0.4, cx = w / 2, cy = r + size * 0.08, sw = size * 0.075, h = cy + (caption ? size * 0.26 : size * 0.06);
  const pt = (val, rad) => { const t = Math.PI * (1 - (val + 100) / 200); return [cx + rad * Math.cos(t), cy - rad * Math.sin(t)]; };
  const arc = (a, b) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`; };
  const has = v != null, val = has ? Math.max(-100, Math.min(100, v)) : 0, d = dirVal(v), a = Math.abs(val);
  const [nx, ny] = pt(val, r - sw * 1.2);
  const word = !has ? "No data" : d === 0 ? "Sideways" : `${strengthWord(a)} ${d > 0 ? "uptrend" : "downtrend"}`;
  const col = !has ? "var(--t3)" : val < 0 ? "var(--short)" : d > 0 ? "var(--long)" : "var(--t2)";
  return (
    <svg className="gauge" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Trend meter: ${word}${has ? `, ${signed(val)}%` : ""}`}>
      {G_ZONES.map(([x, y, c]) => <path key={x} d={arc(x + 0.8, y - 0.8)} stroke={c} strokeWidth={sw} fill="none" opacity={has ? .9 : .25}/>)}
      <text x={pt(-100, r)[0]} y={cy + size * 0.1} textAnchor="middle" className="g-end">Down</text>
      <text x={pt(100, r)[0]} y={cy + size * 0.1} textAnchor="middle" className="g-end">Up</text>
      {has && <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--t1)" strokeWidth={size * 0.022} strokeLinecap="round"/>}
      <circle cx={cx} cy={cy} r={size * 0.035} fill="var(--t1)"/>
      {caption && <>
        <text x={cx} y={cy + size * 0.15} textAnchor="middle" className="g-val" style={{ fontSize: size * 0.11, fill: col }}>{has ? signed(val) : "—"}<tspan className="g-of" style={{ fontSize: size * 0.065, fill: col }}>{has ? "%" : ""}</tspan></text>
        <text x={cx} y={cy + size * 0.235} textAnchor="middle" className="g-word" style={{ fontSize: size * 0.065, fill: col }}>{word}</text>
      </>}
    </svg>
  );
}

// ─── Overall trend meter — the SAME component in the Simplified view and the Research stock card ───
// Overall trend (owner, 2026-10-11): stock 50 % · sector 25 % · industry 25 %. The stock is −100…+100; sector and industry
// strength go on the same scale (50% = neutral → (st − 50) × 2). A missing part's weight goes to the others.
function overallOf(os, secA, indA) {
  const mix = [[os, 0.5], [secA ? (secA.st - 50) * 2 : null, 0.25], [indA ? (indA.st - 50) * 2 : null, 0.25]].filter(([v]) => v != null);
  const w = mix.reduce((x, [, k]) => x + k, 0);
  return mix.length ? Math.round(mix.reduce((x, [v, k]) => x + v * k, 0) / w) : null;
}
const trendWordOf = v => v == null ? "No data" : dirVal(v) === 0 ? "Sideways" : `${levelOf(v)} ${v > 0 ? "uptrend" : "downtrend"}`;
const dirToneOf = v => v == null ? "side" : v < 0 ? "bad" : dirVal(v) === 1 ? "good" : "side";   // red on the downtrend side
function OverallMeter({ os, secA, indA, size = 250, className = "" }) {
  const overall = overallOf(os, secA, indA);
  return (
    <div className={`ometer ${className}`}>
      <div className="sx-lbl">Overall trend <Info text="A mix of three parts: the stock's own trend counts 50%, its sector's strength 25% and its industry's strength 25% (for the sector and industry 50% is neutral). Left = down, right = up. It measures how strong the trend is — not a price move."/></div>
      <TrendGauge v={overall} size={size} caption={false}/>
      <div className={`sx-gv ${dirToneOf(overall)}`}>{signed(overall)}<small>%</small></div>
      <div className={`sx-gw ${dirToneOf(overall)}`}>{trendWordOf(overall)}</div>
      <div className="sx-mix">
        <span>Stock <b className={dirToneOf(os)}>{signed(os)}%</b><i>× 50%</i></span>
        <span>Sector <b>{secA ? `${Math.round(secA.st)}%` : "—"}</b><i>× 25%</i></span>
        <span>Industry <b>{indA ? `${Math.round(indA.st)}%` : "—"}</b><i>× 25%</i></span>
      </div>
    </div>
  );
}

// ─── SIMPLE VIEW: pick a stock, read it in plain words (rules only — the same numbers as the research view) ───
const LEVEL = g => { const k = groupState(g); return [k === "up" ? "good" : k === "down" ? "bad" : "mid", levelOf(g.st)]; };   // same rule as the research view
const PERIODS = ["Days", "Weeks", "Months", "Quarters", "Years"];
function StockSearch({ stocks, onPick, autoFocus, onClear = null }) {
  const [q, setQ] = useState(""); const [hi, setHi] = useState(0); const [open, setOpen] = useState(false); const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const found = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return [];
    const rank = x => x.s.toLowerCase() === t ? 0 : x.s.toLowerCase().startsWith(t) ? 1 : x.n.toLowerCase().startsWith(t) ? 2 : x.n.toLowerCase().includes(" " + t) ? 3 : 4;
    return stocks.filter(x => x.s.toLowerCase().includes(t) || x.n.toLowerCase().includes(t)).sort((a, b) => rank(a) - rank(b) || a.n.localeCompare(b.n)).slice(0, 8);
  }, [q, stocks]);
  const pick = x => { onPick(x.s); setQ(""); setOpen(false); };
  return (
    <div className={`sv-search ${onClear ? "has-x" : ""}`} ref={ref}>
      <span className="sv-mag" aria-hidden="true">⌕</span>
      {onClear && <button type="button" className="sv-x" onClick={onClear} title="Clear this stock and search again" aria-label="Clear this stock">✕</button>}
      <span className="sv-qai" title="Hyperplane AI is built on Hyperplane's own quant algorithms: fixed rules applied to our trend data — the same numbers as the Research view. It does not use any outside AI service, and it never makes up a number."><span className="ai-spark">✦</span>Hyperplane AI</span>
      <input value={q} autoFocus={autoFocus} placeholder="Ask Hyperplane AI — type a company name or ticker (e.g. Tata, INFY)" aria-label="Search a stock"
        onChange={e => { setQ(e.target.value); setHi(0); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setHi(i => Math.min(i + 1, found.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && found[hi]) { e.preventDefault(); pick(found[hi]); }
          else if (e.key === "Escape") setOpen(false); }}/>
      {open && q.trim() && (
        <div className="sv-drop" role="listbox">
          {found.length ? found.map((x, i) => (
            <button key={x.s} type="button" role="option" aria-selected={i === hi} className={i === hi ? "on" : ""} onMouseEnter={() => setHi(i)} onClick={() => pick(x)}>
              <b className="mono">{x.s}</b><span className="sv-dn">{x.n}</span><span className="sv-ds">{x.sec}</span>
            </button>)) : <div className="sv-none">No stock found for “{q}”.</div>}
        </div>
      )}
    </div>
  );
}

// One stat card: tiny label → name → big number → thin bar → coloured word (or a big word + note, e.g. reliability)
function Stat({ label, name, sub, value, pct, d, signedBar = false, tone, word, note }) {
  return (
    <div className={`card sx-stat ${tone}`}>
      <div className="sx-sl">{label}</div>
      <div className="sx-sn" title={name}>{name}{sub && <span className="sx-ssub">{sub}</span>}</div>
      {value != null
        ? <><div className={`sx-sv ${tone}`}>{value}<small>%</small></div>
            {signedBar
              ? <DivBar v={pct} d={d} scale className="sx-dbar"/>
              : <div className="sx-gbar"><div className="sx-sbar"><i className={tone} style={{ width: `${Math.max(2, Math.min(100, Math.abs(pct)))}%` }}/></div>
                  <div className="dbar-s" aria-hidden="true"><span>0</span><span>100</span></div></div>}
            <span className={`sx-sw ${tone}`}>{word}</span></>
        : <><div className={`sx-sv word ${tone}`}>{word}</div>{note && <div className="sx-snote">{note}</div>}</>}
    </div>
  );
}

// combinedView title → professional wording for the Simplified view (the rule itself is unchanged)
const PRO_VERDICT = {
  "⚠ Overheated — don't chase": ["Overextended — avoid chasing", "The price has risen three times or more in about a year. Even with a strong trend, moves this extended often retrace; a consolidation is the safer point to consider it."],
  "👁 Watch — stock still building": ["Watchlist — trend still developing", "Its sector and industry are strong, but the stock's own trend is only average. Worth monitoring until the stock's trend strengthens."],
  "✓ Best case — with the tide": ["Strong set-up — fully aligned", "The stock is trending up, and both its sector and industry are Good or Strong — everything points the same way."],
  "⚠ Careful — against its group": ["Caution — weak group backing", "The stock is trending up, but its sector or industry is Weak. A stock moving against its group carries more risk."],
  "◐ Okay — group is only average": ["Positive — average group backing", "The stock is trending up, but its sector and industry are only Average. Stocks with Good or Strong group support are generally preferable."],
  "👁 Watch only — a laggard": ["Laggard — weak stock in a strong group", "The group is strong, but the stock is in a downtrend. It may catch up or keep lagging; it is not a buying candidate yet."],
  "✕ Avoid for buying": ["Unfavourable — no support", "The stock is in a downtrend and its sector and industry offer no support."],
  "◐ Good group, mixed timeframes": ["Mixed — timeframes disagree", "Its sector and industry are strong, but the stock's short- and long-term trends point in different directions. Waiting for them to align lowers the risk."],
};
const proVerdict = (view, groupStrong) => !view ? null : view.title === "◆ No edge yet"
  ? ["Neutral — no clear trend", groupStrong ? "There is no clear trend in the stock yet, although its group is strong. Wait for the stock to establish a direction." : "There is no clear trend in the stock. Better candidates are available."]
  : PRO_VERDICT[view.title] || [view.title.replace(/^[^A-Za-z]+/, ""), view.text];

// Sector / industry on −100 … +100 (owner, 2026-10-13): the number is the group's strength (0–100%), the sign is its
// direction — net bias > 0 = bullish (right side of the bubble chart), < 0 = bearish (left side)
const grpSigned = g => !g ? null : (g.nb < 0 ? -1 : 1) * Math.round(g.st);
const grpDir = g => !g ? 0 : g.nb > 0 ? 1 : g.nb < 0 ? -1 : 0;
const grpTone = g => !g ? "side" : g.nb > 0 ? "good" : g.nb < 0 ? "bad" : "side";
const grpWord = g => !g ? "No data" : `${levelOf(g.st)} · ${g.nb > 0 ? "bullish" : g.nb < 0 ? "bearish" : "neutral"}`;

const PERIOD_ROWS = [["Days", "short term"], ["Weeks", ""], ["Months", ""], ["Quarters", ""], ["Years", "long term"]];
const RELIABILITY = { S: ["High", "good", "The long-term price history is healthy."], M: ["Medium", "mid", "The long-term price history is average."],
                      W: ["Low", "bad", "The price has fallen sharply or moved erratically in the past."] };

function SimpleView({ data, mode, setMode, sym, setSym }) {
  const stocks = data.stocks;
  const s = sym ? stocks.find(x => x.s === sym) : null;
  if (!s) return (
    <div className="sv sv-empty">
      <div className="sv-hero">
        <div className="sv-brand"><span className="ai-spark">✦</span> Hyperplane AI <span className="sv-pow">· powered by quant algorithms</span></div>
        <h1>Understand any stock in seconds</h1>
        <p>Type a company name or ticker. Hyperplane AI reads our quant algorithms and explains the stock's trend, its sector and industry, and its reliability — in plain language.</p>
        <StockSearch stocks={stocks} onPick={setSym} autoFocus/>
        <div className="sv-feats">
          <span><b>Trend strength</b> out of 100</span><span><b>Sector &amp; industry</b> score and rank</span><span><b>Historical reliability</b> High / Medium / Low</span>
        </div>
        {data.top && data.top.length > 0 && <div className="sv-try"><span className="dim">Strongest right now:</span>
          {data.top.slice(0, 6).map(k => <button key={k} type="button" onClick={() => setSym(k)}>{k}</button>)}</div>}
      </div>
    </div>
  );
  const od = dirVal(s.os), bi = isBi(s, []);
  const ctx = (tf, ind) => { const list = ((ind ? data.industries : data.sectors) || {})[tf] || [];
    const i = list.findIndex(r => ind ? r.k === s.ind && r.sec === s.sec : r.k === s.sec);
    return i < 0 ? null : { ...list[i], rank: i + 1, of: list.length }; };
  const secA = ctx("A", false), indA = ctx("A", true);
  const view = combinedView(od, bi, secA, indA, s.os, !!s.x);
  const peers = stocks.filter(x => x.os != null && x.sec === s.sec && x.ind === s.ind).sort((a, b) => b.os - a.os);
  const myRank = peers.findIndex(x => x.s === s.s) + 1;
  const a = s.os == null ? null : Math.abs(s.os);
  const trendWord = trendWordOf, dirTone = dirToneOf;
  const stockWord = trendWord(s.os);
  const [secTone, secWord] = secA ? LEVEL(secA) : ["side", "No data"];
  const [indTone, indWord] = indA ? LEVEL(indA) : ["side", "No data"];
  const rel = RELIABILITY[s.h] || null;
  // summary — fixed rules, in this order: stock trend → periods disagree → reliability → stretched → verdict
  const parts = [];
  const lw = s.os == null ? "" : levelOf(s.os).toLowerCase();
  parts.push(s.os == null ? `There is not enough data on ${s.n} yet.`
    : od === 1 ? `${s.n} is in ${aan(lw)} ${lw} uptrend (${a}%).`
    : od === -1 ? `${s.n} is in ${aan(lw)} ${lw} downtrend (${signed(s.os)}%).`
    : `${s.n} is moving sideways, with no clear direction (${signed(s.os)}%, leaning ${s.os < 0 ? "down" : "up"}).`);
  if (bi) parts.push("Its short- and long-term trends point in different directions.");
  if (rel) parts.push(s.h === "S" ? "Its long-term price history is reliable." : s.h === "M" ? "Its long-term price history is average." : "Its long-term price history is unreliable, with sharp falls or wild moves in the past.");
  if (s.x) parts.push("The price has risen three times or more in about a year, and moves this fast often reverse.");
  const pro = proVerdict(view, secTone === "good" && indTone === "good");
  if (pro) parts.push(pro[1]);
  const title = pro ? pro[0] : stockWord;
  const vt = view ? view.tone : "mid";
  return (
    <div className="sv sx">
      <div className="sv-bar2">
        <StockSearch stocks={stocks} onPick={setSym} onClear={() => setSym(null)}/>
        <div className="sv-mode2">
          <span className="sv-ml">Trading mode <Info wide label="Trading mode weights per timeframe" text={<ModeWeights active={mode}/>}/></span>
          <div className="sv-pills" role="radiogroup" aria-label="Trading mode">
            {Object.entries(MODES).map(([k, m]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? "on" : ""} title={`${m.label}: ${m.hint}`} onClick={() => setMode(k)}>
                {k === "equal" ? "Balanced" : k === "swing" ? "Swing" : "Investing"}</button>))}
          </div>
        </div>
      </div>

      <section className="card sx-hero">
        <div className="sx-id">
          <div className="sx-title"><h2>{s.n}</h2><span className="sx-tick">{s.s}</span>{s.f ? <span className="sx-tag">F&amp;O</span> : null}</div>
          <div className="sx-meta">{s.sec} <span className="dim">›</span> {s.ind} <span className="dim">·</span> {sizeOf(s)} cap</div>
          <div className="sx-price"><b>₹{s.p}</b>{s.c != null && <span className={`sx-chg ${s.c >= 0 ? "up" : "down"}`}>{s.c >= 0 ? "+" : ""}{s.c}% today</span>}
            <span className="tcopy"><CopyBtns syms={[s.s]} compact/></span><span className="sx-meta2">{s.sec} › {s.ind} · {sizeOf(s)} cap</span></div>
          <div className={`sx-verdict ${vt}`}>
            <div className="sx-lbl"><span className="ai-spark">✦</span> Hyperplane AI summary <Info text="Hyperplane AI is built on Hyperplane's own quant algorithms: fixed rules applied to our trend data — the same numbers as the Research view. It does not use any outside AI service, and it never makes up a number."/></div>
            <div className="sx-vtitle">{title}</div>
            <p>{parts.join(" ")}</p>
          </div>
        </div>
        <div className="sx-meter"><OverallMeter os={s.os} secA={secA} indA={indA} size={250}/></div>
      </section>

      <section className="sx-stats">
        <Stat label="Stock trend strength" name={s.n} sub={s.s} value={s.os == null ? null : signed(s.os)} pct={s.os} d={od} signedBar tone={dirTone(s.os)} word={stockWord}/>
        <Stat label="Sector strength" name={s.sec} sub="sector" signedBar value={secA ? signed(grpSigned(secA)) : null} pct={grpSigned(secA)} d={grpDir(secA)} tone={grpTone(secA)} word={grpWord(secA)}/>
        <Stat label="Industry strength" name={s.ind} sub="industry" signedBar value={indA ? signed(grpSigned(indA)) : null} pct={grpSigned(indA)} d={grpDir(indA)} tone={grpTone(indA)} word={grpWord(indA)}/>
        <Stat label="Historical reliability" name="Long-term price history" value={null} tone={rel ? rel[1] : "side"} word={rel ? rel[0] : "No data"} note={rel ? rel[2] : "Not enough history."}/>
      </section>

      <div className="sv-foot dim">Data as of {fmtDT(data.as_of)} · For education only — not investment advice.</div>
    </div>
  );
}

// ─── past days (only when the admin allows it): ONE scheduled collection — a date, then Day open or Day end ───
const fmtTime = iso => new Date(iso).toLocaleTimeString("en-IN", { hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata" });
const fmtDay = d => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
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

// ─── main page ───────────────────────────────────────────────────────────────
const EMPTY = { sectors:[], industries:[], sizes:[], bg:[], fno:false, trend:"all" };

function Home({ me, onOut }) {
  const [rawData, setData] = useState(null); const [err, setErr] = useState("");
  const [mode, setModeState] = useState(getMode);
  const setMode = m => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* storage blocked */ } };
  const data = useMemo(() => rawData && applyMode(rawData, mode), [rawData, mode]);
  const [f, setF] = useState(EMPTY); const [tfs, setTfs] = useState([]);
  const [q, setQ] = useState(""); const [sort, setSort] = useState("best"); const [page, setPage] = useState(0);
  const [open, setOpenRaw] = useState(null); const [trail, setTrail] = useState([]);
  const setOpen = st => { setTrail([]); setOpenRaw(st); };                       // from the list / close
  // a peer inside the card: keep only the ORIGINAL stock to go back to (owner: back = the one I picked first)
  const openFromCard = st => { const origin = trail[0] || open; setTrail(origin && origin.s !== st.s ? [origin] : []); setOpenRaw(st); };
  const [view, setView] = useState("tower"); const [hdReq, setHdReq] = useState(null);
  const [face, setFaceRaw] = useState(() => { try { return localStorage.getItem("qf_face") === "simple" ? "simple" : "research"; } catch { return "research"; } });
  const setFace = f => { setFaceRaw(f); setView("tower"); try { localStorage.setItem("qf_face", f); } catch { /* storage blocked */ } window.scrollTo(0, 0); };
  const [simpleSym, setSimpleSym] = useState(null);
  const hdApi = useCallback((p, o) => api(p, o).catch(e => { if (e.status === 401 || e.status === 403) onOut(e.message); throw e; }), []);
  const unread = useHelpdeskUnread(hdApi, "/app/api/helpdesk");
  const openHelpdesk = id => { setView("helpdesk"); setHdReq({ id, n: Date.now() }); };
  // past days: offered only when the admin has switched it on; sel = { date, part } or null for the latest published data
  const [hist, setHist] = useState(null); const [sel, setSel] = useState(null);
  const loadHist = () => api("/app/api/history").then(setHist).catch(() => setHist(null));
  useEffect(() => { loadHist(); }, []);
  useEffect(() => {
    setData(null); setErr(""); setOpen(null);
    api("/app/api/data" + (sel ? `?date=${sel.date}&part=${sel.part}` : "")).then(setData).catch(e => {
      if (sel && e.status !== 401) { setSel(null); setErr(""); return; }      // not available (any more) → back to the latest
      if (e.status === 401 || e.status === 403) onOut(e.message); else setErr(e.message);
    });
  }, [sel]);
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
    <div className="page">
      <header className="top">
        <button type="button" className="brand-home" onClick={() => setView("tower")} title="Control Tower"><Brand/></button>
        <div className="sg face" role="tablist" aria-label="View">
          {[["research", "Research view"], ["simple", "Simplified view (AI Mode)"]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={face === k} className={face === k && view === "tower" ? "on" : ""} onClick={() => setFace(k)}>{l}</button>))}
        </div>
        {hist && hist.enabled && hist.days.length
          ? <DayPicker days={hist.days} sel={sel} asOf={data && data.as_of} onPick={setSel} onOpen={loadHist}/>
          : <div className="asof">{data ? <>DATA AS OF <b>{fmtDT(data.as_of)}</b></> : "Loading…"}</div>}
        <QuickGuideButton onDocs={() => { setView("guide"); window.scrollTo(0, 0); }}/>
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
      {view === "tower" && face === "simple" && (data ? <SimpleView data={data} mode={mode} setMode={m => { setMode(m); setTfs([]); }} sym={simpleSym} setSym={setSimpleSym}/>
        : <div className="card empty">{err || "Loading…"}</div>)}
      {view === "tower" && face === "research" && <>
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
      {open && <StockCard key={open.s} s={(data && data.stocks.find(x => x.s === open.s)) || open} data={data} onOpen={openFromCard} onClose={() => setOpen(null)} origin={trail[0] || null}/>}
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
:root[data-theme="light"] button.primary{background:linear-gradient(135deg,#0891b2,#3b82f6);color:#fff}
:root[data-theme="light"] .hero-h span{background:linear-gradient(90deg,#0891b2,#6366f1);-webkit-background-clip:text;background-clip:text}
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
.hero-p{font-size:15px;color:var(--t2);max-width:500px;margin:0;line-height:1.6}
.hero-k{margin-top:14px;font:700 11px var(--mono);letter-spacing:1.6px;text-transform:uppercase;color:var(--acc)}.hero-k+.hero-h{margin-top:6px}
.hero-fine{font-size:10.5px;color:var(--t3);max-width:480px;margin:2px 0 0;line-height:1.5}
.hd-row .meter{font-size:11.5px}.hd-note b{color:var(--mixed)}
.wa-l{display:inline-flex;align-items:center;gap:6px}
.wa-in{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px}
.dial .ms-btn{height:100%;min-height:38px;font-size:13px;color:var(--t1);text-transform:none;letter-spacing:0}.dial .ms-btn small{font-size:11px;font-weight:500;color:var(--t2);margin-left:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dial .ms-btn>span:first-child{display:flex;align-items:baseline;min-width:0;overflow:hidden}
.dial-pop{width:300px;text-transform:none;letter-spacing:0;font-weight:400}.dial-pop .ms-list{max-height:260px}
.dial-h{padding:7px 8px 3px;font-size:9.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--t3)}
.dial-it{display:flex;justify-content:space-between;gap:10px;width:100%;padding:7px 8px;border:0;border-radius:6px;background:none;color:var(--t1);font-size:13px;text-align:left}
.dial-it:hover,.dial-it.on{background:var(--adim)}.dial-it b{font:600 12.5px var(--mono);color:var(--acc)}.wa-in input{font:600 15px var(--mono);letter-spacing:1px}
.wa-err{font-size:11px;font-weight:600;text-transform:none;letter-spacing:0;color:var(--mixed)}
.wa-note{font-size:11px;font-weight:400;text-transform:none;letter-spacing:0;color:var(--t2);line-height:1.45;padding:7px 9px;border-radius:7px;background:rgba(37,211,102,.07);border:1px solid rgba(37,211,102,.25)}
.wa-note b{color:#25d366;font-weight:700}
.feats{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-direction:column;gap:13px;max-width:480px}.feats li{display:flex;gap:12px}
.feats b{display:block;font-size:13.5px;color:var(--t1)}.feats span{font-size:12.5px;color:var(--t2)}
.tick{flex-shrink:0;width:22px;height:22px;border-radius:6px;background:var(--adim);border:1px solid var(--accb);color:var(--acc);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}
.hero-demo{margin-top:8px;max-width:420px;background:var(--s1);border:1px solid var(--b1);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:7px}
.hd-row{display:grid;grid-template-columns:80px 92px 1fr;gap:10px;align-items:center;font-size:12px;color:var(--t2)}.hd-note{font-size:10.5px;color:var(--t3);margin-top:2px}
.auth-side{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px 20px}
.auth{width:100%;max-width:460px;padding:30px 28px;display:flex;flex-direction:column;gap:14px;background:var(--s1);border:1px solid var(--b1);border-radius:12px;box-shadow:0 30px 70px -30px rgba(0,0,0,.7)}
.auth h1{font-size:22px;margin:0;font-weight:800}.auth>p{margin:-6px 0 4px;font-size:13px}
.field{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:10.5px;color:var(--t2);font-weight:700;text-transform:uppercase;letter-spacing:.6px}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.agree{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1.5px solid var(--b2);border-radius:10px;background:var(--s2);cursor:pointer;font-size:11.5px;color:var(--t2);line-height:1.5}
.agree.on{border-color:var(--acc);background:var(--adim)}.agree input{width:22px;height:22px;flex-shrink:0;margin:1px 0 0;accent-color:#00e5ff;cursor:pointer}.agree b{color:var(--t1);font-size:12.5px}
.switch{font-size:13px;text-align:center;color:var(--t2)}
/* page */
.page{max-width:1440px;margin:0 auto;padding:0 20px 30px}
.tabs{display:flex;gap:4px;margin:12px 0 0;border-bottom:1px solid var(--b1)}.tabs button{position:relative;display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border:0;border-bottom:2px solid transparent;background:none;color:var(--t2);font-size:13px;font-weight:600;margin-bottom:-1px}.tabs button:hover{color:var(--t1)}.tabs button.on{color:var(--acc);border-bottom-color:var(--acc)}.sg button.tf:nth-child(4){border-left:2px solid var(--b2)}
.modebar{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;margin:12px 0 0;padding:8px 12px;border:1px solid var(--b1);border-radius:10px;background:var(--s1)}
.modebar .fl{height:auto}.mode-w{display:inline-flex;gap:6px;font:600 11px var(--mono);color:var(--t3)}.mode-w span{padding:2px 6px;border-radius:5px;background:var(--s2);border:1px solid var(--b1)}
.mode-w .hi{color:var(--acc);border-color:var(--accb);background:var(--adim)}.mode-w .off{opacity:.45}.mode-hint{font-size:11.5px;color:var(--t2)}
.modebar+.fbar{margin-top:8px}
.stretch-tag{font-weight:700;color:#ff7a1a}.stretch-tag.sm{margin-left:5px;font-size:12px;cursor:help}
.bgtag{font-weight:700}.bgtag.S{color:var(--long)}.bgtag.M{color:var(--mixed)}.bgtag.W{color:var(--short)}
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
.face{height:32px;margin-left:6px}.face button{padding:0 12px;font-size:12px}.face button.on{background:var(--adim);color:var(--acc)}
.gauge{display:block;overflow:visible}.gauge .g-end{font:600 10px var(--sans);fill:var(--t3)}.gauge .g-val{font-family:var(--mono);font-weight:800}.gauge .g-of{font-weight:700}.gauge .g-word{font-family:var(--sans);font-weight:700}
.mo-cell.mo-gauge{flex-direction:row;align-items:center;gap:10px}.modal.stock .cv-verdict{white-space:normal}.mo-gt{display:flex;flex-direction:column;gap:2px;white-space:nowrap}.mo-gt .lbl{white-space:nowrap}.mo-gv{font:800 22px var(--mono);line-height:1.1}.mo-gv small{font-size:11px;color:var(--t3);font-weight:600}.mo-gv.up{color:var(--long)}.mo-gv.down{color:var(--short)}.mo-gv.side{color:var(--t2)}
.sv{max-width:1180px;margin:14px auto 0}.sv-empty{display:flex;justify-content:center}
.sv-hero{width:min(760px,100%);text-align:center;padding:44px 16px 30px}.sv-hero h1{font-size:30px;margin:0 0 10px;background:linear-gradient(90deg,var(--t1),#a78bfa 55%,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}
.sv-brand{display:inline-flex;align-items:center;gap:6px;margin-bottom:14px;padding:5px 14px;border-radius:999px;border:1px solid rgba(167,139,250,.45);background:rgba(167,139,250,.08);color:#a78bfa;font-size:13px;font-weight:800;letter-spacing:.3px}
.sv-pow{color:var(--t2);font-weight:600}
.sv-feats{display:flex;justify-content:center;gap:8px 18px;flex-wrap:wrap;margin-top:14px;font-size:12.5px;color:var(--t2)}.sv-feats span::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:#a78bfa;margin-right:7px;vertical-align:2px}.sv-feats b{color:var(--t1);font-weight:700}.sv-hero p{color:var(--t2);margin:0 0 20px;font-size:15px;line-height:1.5}
.sv-try{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center;margin-top:16px;font-size:12.5px}.sv-try button{font:600 12px var(--mono);padding:5px 10px;border-radius:7px;border:1px solid var(--b2);background:var(--s2);color:var(--acc);cursor:pointer}.sv-try button:hover{border-color:var(--acc)}
.sv-search{position:relative;flex:1;text-align:left}.sv-search input{width:100%;padding:13px 14px 13px 40px;font-size:15px;border-radius:12px}
.sv-mag{position:absolute;left:13px;top:50%;transform:translateY(-50%);font-size:20px;color:var(--t3);pointer-events:none}
.sv-drop{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:30;background:var(--s1);border:1px solid var(--b2);border-radius:12px;box-shadow:0 20px 44px -18px rgba(0,0,0,.8);padding:6px;max-height:380px;overflow:auto}
.sv-drop button{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;padding:9px 10px;border:0;border-radius:8px;background:none;color:var(--t1);text-align:left;cursor:pointer;font-size:13px}
.sv-drop button.on{background:var(--adim)}.sv-drop b{color:var(--acc)}.sv-dn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sv-ds{font-size:11px;color:var(--t3);white-space:nowrap}.sv-none{padding:12px;color:var(--t3);font-size:13px}
.sv-bar{display:flex;gap:8px;align-items:center;margin-bottom:12px}.sv-clear{flex-shrink:0;min-width:70px;height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--b2);background:var(--s2);color:var(--t2);font-weight:600;cursor:pointer}
.sv-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;margin-bottom:12px}.sv-name{font-size:21px;font-weight:800}
.sv-price{display:flex;align-items:center;gap:10px;font-size:18px}.sv-price .up{color:var(--long)}.sv-price .down{color:var(--short)}.sv-price span.mono{font-size:14px}
.sv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sv-card{padding:14px 16px}.sv-t{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;margin-bottom:10px}
.sv-meter{display:flex;flex-direction:column;align-items:center;text-align:center}.sv-meter .sv-t{align-self:flex-start}
.sv-verdict{margin-top:8px;padding:10px 12px;border-radius:10px;border:1px solid var(--b2);display:flex;flex-direction:column;gap:4px;font-size:13px;line-height:1.5;color:var(--t2);text-align:left;width:100%}
.sv-verdict b{font-size:15px;color:var(--t1)}.sv-verdict.good{border-color:var(--long);background:var(--longd)}.sv-verdict.bad{border-color:var(--short);background:var(--shortd)}.sv-verdict.warn{border-color:var(--mixed);background:rgba(255,170,0,.08)}.sv-verdict.watch{border-color:var(--acc);background:var(--adim)}
.sv-mode{margin-top:8px;font-size:11.5px}
.sv-score{margin-bottom:14px}.sv-st{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13.5px;margin-bottom:6px}.sv-st .dim{font-size:12px}
.sv-num{font:800 18px var(--mono)}.sv-num small{font-size:11px;color:var(--t3);font-weight:600}.sv-num.good{color:var(--long)}.sv-num.mid{color:var(--mixed)}.sv-num.bad{color:var(--short)}
.sv-track{position:relative;height:14px;border-radius:7px;background:var(--s3,var(--s2));overflow:hidden}.sv-track i{position:absolute;top:0;bottom:0;width:1px;background:var(--b2)}
.sv-fill{height:100%;border-radius:7px}.sv-fill.good{background:var(--long)}.sv-fill.mid{background:var(--mixed)}.sv-fill.bad{background:var(--short)}
.sv-note{font-size:11.5px;color:var(--t3);margin-top:5px}.sv-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;align-items:center}.sv-legend span:not(.dim)::before{content:'';display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;background:currentColor;vertical-align:0}.sv-legend .good{color:var(--long)}.sv-legend .mid{color:var(--mixed)}.sv-legend .bad{color:var(--short)}
.sv-rule{margin-top:12px;padding-top:10px;border-top:1px solid var(--b1);font-size:12.5px;color:var(--t2)}
.sv-axis{display:grid;grid-template-columns:92px 1fr 1fr 1fr 96px;font-size:10.5px;color:var(--t3);margin-bottom:4px}.sv-axis span:nth-child(1){grid-column:2;text-align:left}.sv-axis span:nth-child(2){text-align:center}.sv-axis span:nth-child(3){text-align:right}
.sv-tf{display:grid;grid-template-columns:92px minmax(0,1fr) 96px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--b1)}.sv-tf:last-of-type{border-bottom:0}
.sv-tfl{font-size:13.5px;font-weight:600;display:flex;flex-direction:column;line-height:1.2}.sv-tfl small{font-size:10.5px;color:var(--t3);font-weight:500}
.sv-div{position:relative;height:14px;border-radius:7px;background:var(--s2)}.sv-zero{position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;background:var(--t3);transform:translateX(-1px)}
.sv-df{position:absolute;top:0;bottom:0}.sv-df.up{background:var(--long);border-radius:0 7px 7px 0}.sv-df.down{background:var(--short);border-radius:7px 0 0 7px}.sv-df.side{background:#8b97ad;border-radius:7px}.sv-df.side.neg{background:#ff8a95}
.sv-tfv{font:700 12.5px var(--mono);text-align:right;white-space:nowrap}.sv-tfv.up{color:var(--long)}.sv-tfv.down{color:var(--short)}.sv-tfv.side{color:var(--t2)}
.sv-qai{position:absolute;right:12px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#a78bfa;border:1px solid rgba(167,139,250,.45);border-radius:999px;padding:2px 8px;pointer-events:auto;cursor:help;background:rgba(167,139,250,.08)}
.sv-search input{padding-right:142px}
.sv-summary{margin-bottom:12px}.sv-summary .sv-t{display:flex;align-items:center;gap:6px}
.sv-overall{padding:12px 14px;border-radius:10px;border-left:4px solid var(--mixed);background:var(--s2);margin-bottom:12px}.sv-overall.good{border-left-color:var(--long)}.sv-overall.bad{border-left-color:var(--short)}.sv-overall.watch{border-left-color:var(--acc)}
.sv-overall b{font-size:17px;display:block;margin-bottom:4px}.sv-overall p{margin:0;font-size:14.5px;line-height:1.6;color:var(--t1)}
.sv-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.sv-tile{border:1px solid var(--b1);border-top:3px solid var(--b2);border-radius:10px;padding:10px 12px;background:var(--s1);display:flex;flex-direction:column;gap:4px;min-width:0}
.sv-tile.good{border-top-color:var(--long)}.sv-tile.mid{border-top-color:var(--mixed)}.sv-tile.bad{border-top-color:var(--short)}
.sv-tl{font-size:10.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);font-weight:700}.sv-tn{font-size:12.5px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-tv{font:800 24px var(--mono);line-height:1.15}.sv-tv small{font-size:16px;font-weight:700;margin-left:1px}.sv-tile.good .sv-tv{color:var(--long)}.sv-tile.mid .sv-tv{color:var(--mixed)}.sv-tile.bad .sv-tv{color:var(--short)}
.sv-track.sm{height:7px}.sv-tw{font-size:12.5px;font-weight:700}.sv-tw.good{color:var(--long)}.sv-tw.mid{color:var(--mixed)}.sv-tw.bad{color:var(--short)}
.sv-rank{margin-top:4px}.sv-rk{font-size:12.5px;color:var(--t2)}.sv-rk b{color:var(--t1);font-family:var(--mono)}
.sv-rline{position:relative;height:4px;border-radius:2px;margin:6px 4px 2px;background:linear-gradient(90deg,var(--long),var(--mixed),var(--short));opacity:.85}
.sv-rline i{position:absolute;top:50%;width:11px;height:11px;border-radius:50%;background:var(--t1);border:2px solid var(--bg);transform:translate(-50%,-50%)}
.sv-rends{display:flex;justify-content:space-between;font-size:10px;color:var(--t3)}.sv-tnote{font-size:12px;color:var(--t2);line-height:1.45}
.sv-tiles-note{font-size:11.5px;margin-top:8px}
.sv-bar{flex-wrap:wrap}.sv-bar .sv-search{min-width:320px}.sv-bar .sv-modebar{margin:0;flex-shrink:0}.sv-bar .sv-modebar .sg{height:46px;border-radius:12px}.sv-bar .sv-modebar .sg button{padding:0 14px;font-size:12.5px}
.sv-head2{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--b1)}
.sv-hn{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0}.sv-name{font-size:19px;font-weight:800}
@media (min-width:901px) and (max-height:860px){
  .sv{margin-top:8px}.sv-bar{margin-bottom:8px}.sv-search input{padding-top:10px;padding-bottom:10px}.sv-bar .sv-modebar .sg,.sv-clear{height:40px}
  .sv-summary{padding:10px 12px}.sv-head2{padding-bottom:7px;margin-bottom:7px}.sv-summary .sv-t{margin-bottom:6px}
  .sv-sumgrid .sv-overall{padding:9px 12px}.sv-sumgrid .sv-overall b{font-size:16px}.sv-sumgrid .sv-overall p{font-size:13.5px;line-height:1.5}
  .sv-sumgrid .sv-tile{padding:6px 10px}.sv-sumgrid .sv-tv{font-size:19px}.sv-tiles-note{margin-top:5px}
  .sv-meter .gauge{width:210px;height:auto}.sv-top{padding:10px 14px}.sv-verdict2 p{font-size:13.5px;line-height:1.5}.sv-card{padding:10px 12px}.sv-card .sv-t{margin-bottom:6px}.sv-tf{padding:3px 0}.sv-note{margin-top:3px}
}
@media (min-width:901px) and (max-height:720px){
  .sv-tiles-note,.sv-card>.sv-note,.sv-tfl small{display:none}.sv-sumgrid .sv-tn{display:none}
  .sv-meter .gauge{width:190px}.sv-metrics .sv-tile{padding:6px 9px}.sv-metrics .sv-tv{font-size:19px}.sv-meter .sv-mode{font-size:10.5px;margin-top:2px}.sv-mix{font-size:11.5px}
  .sv-tf{padding:1px 0}.sv-div{height:11px}.sv-axis{margin-bottom:0}.sv-foot{margin:6px 0 2px}
}
.sv-top{padding:12px 16px;margin-bottom:10px}.sv-top .sv-head2{margin-bottom:10px}
.sv-verdict2{padding:10px 14px 12px;border-radius:10px;border-left:4px solid var(--mixed);background:var(--s2)}
.sv-verdict2.good{border-left-color:var(--long)}.sv-verdict2.bad{border-left-color:var(--short)}.sv-verdict2.watch{border-left-color:var(--acc)}.sv-verdict2.warn{border-left-color:var(--mixed)}
.sv-vt{display:flex;align-items:center;gap:6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;margin-bottom:4px}
.sv-verdict2 b{display:block;font-size:17px;margin-bottom:3px}.sv-verdict2.good b{color:var(--long)}.sv-verdict2.bad b{color:var(--short)}.sv-verdict2.warn b,.sv-verdict2.mid b{color:var(--mixed)}.sv-verdict2.watch b{color:var(--acc)}
.sv-verdict2 p{margin:0;font-size:14px;line-height:1.6;color:var(--t1)}
.sv-row3{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr);gap:10px;align-items:stretch}
.sv-row3 .sv-card{display:flex;flex-direction:column}.sv-row3 .sv-meter{justify-content:flex-start}
.sv-metrics .sv-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;flex:1}.sv-metrics .sv-tile{padding:8px 10px;gap:2px}.sv-metrics .sv-tv{font-size:22px}.sv-metrics .sv-tn{font-size:12px}
.sv-periods .sv-tf{grid-template-columns:78px minmax(0,1fr) 92px;flex:1;max-height:56px}.sv-periods .sv-axis{grid-template-columns:78px 1fr 1fr 1fr 92px}
@media (max-width:1180px){.sv-row3{grid-template-columns:repeat(2,minmax(0,1fr))}.sv-metrics{grid-column:1/-1;order:-1}}
.sx{max-width:1260px}
.dbar{min-width:60px}.dbar-t{position:relative;height:6px;border-radius:3px;background:linear-gradient(90deg,rgba(255,68,84,.13) 0 50%,rgba(0,200,150,.13) 50% 100%),var(--s3)}
.dbar-0{position:absolute;left:50%;top:-4px;bottom:-4px;width:2px;margin-left:-1px;border-radius:1px;background:var(--t1);opacity:.75;z-index:1}
.dbar-f{position:absolute;top:0;bottom:0}.dbar-f.up{background:var(--long);border-radius:0 3px 3px 0}.dbar-f.down{background:var(--short);border-radius:3px 0 0 3px}.dbar-f.side{background:#8b97ad;border-radius:0 3px 3px 0}
.dbar-s{display:flex;justify-content:space-between;font:600 10px var(--mono);color:var(--t3);margin-top:5px}.dbar-s .z{color:var(--t2)}
.sx-dbar{margin-top:6px}.sx-dbar .dbar-t{height:9px;border-radius:5px}.sx-dbar .dbar-0{top:-5px;bottom:-5px;width:3px;margin-left:-1.5px}
.sx-dbar .dbar-f.up{border-radius:0 5px 5px 0}.sx-dbar .dbar-f.down{border-radius:5px 0 0 5px}
.sx-gbar{margin-top:6px}.sx-gbar .sx-sbar{height:9px;border-radius:5px;margin-top:0}.sx-gbar .sx-sbar i{border-radius:5px}
.sx-sn{font-size:14.5px;font-weight:600;color:var(--t1)}.sx-ssub{margin-left:7px;font:600 11px var(--mono);color:var(--t3)}
td.cur .dbar{margin-top:7px}.m-row .dbar{min-width:80px}
.sv-bar2{display:flex;align-items:flex-end;gap:18px;margin-bottom:12px}.sv-bar2 .sv-search{flex:1;min-width:0}
.sv-search input{height:48px;border-radius:14px;border:1px solid var(--b2);background:var(--s1);font-size:14.5px;transition:border-color .15s,box-shadow .15s}
.sv-search input:focus{border-color:var(--acc);box-shadow:0 0 0 3px var(--adim);outline:none}
.sv-search.has-x input{padding-right:178px}
.sv-x{position:absolute;right:136px;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;border:1px solid var(--b2);background:var(--s2);color:var(--t2);font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
.sv-x:hover{color:var(--short);border-color:var(--short)}
.sv-mode2{display:flex;flex-direction:column;gap:5px;flex-shrink:0}
.sv-ml{display:flex;align-items:center;gap:5px;font-size:10.5px;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700}
.sv-pills{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:var(--s2);border:1px solid var(--b2)}
.sv-pills button{border:0;background:none;color:var(--t2);font-size:13px;font-weight:600;padding:8px 18px;border-radius:999px;cursor:pointer;transition:background .15s,color .15s}
.sv-pills button:hover{color:var(--t1);background:var(--s1)}.sv-pills button.on{background:var(--acc);color:var(--on-acc,#04121a)}
@media (max-width:900px){.sv-bar2{flex-direction:column;align-items:stretch;gap:10px}.sv-pills{align-self:flex-start}.sv-search.has-x input{padding-right:52px}.sv-x{right:12px}}
@media (min-width:901px) and (max-height:860px){.sv-search input{height:42px}.sv-pills button{padding:6px 15px}.sv-bar2{margin-bottom:8px}}
.ometer{display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0}.ometer .sx-lbl{align-self:stretch;justify-content:center}
.ometer .gauge{margin:10px 0 16px}
.om-card .gauge{margin:6px 0 11px}.om-card .sx-gv{font-size:26px}.om-card .sx-gv small{font-size:14px}.om-card .sx-gw{font-size:13px;margin-top:3px}
.om-card .sx-mix{margin-top:8px;gap:4px}.om-card .sx-mix span{font-size:10.5px;padding:2px 7px}.om-card .sx-mix i{font-size:10px;margin-left:3px}.om-card .sx-mix b{margin-left:3px}
.modal.stock .m-overall{grid-template-columns:minmax(220px,.8fr) minmax(0,1.45fr);align-items:center}
.mo-side .ai-l{grid-template-columns:80px minmax(0,1fr);gap:6px}.mo-side .ai-box{margin-top:2px}
@media (min-width:1000px) and (max-height:800px){.om-card .gauge{margin:3px 0 8px !important}.mo-side .mo-sum{gap:3px}.mo-side .mo-sum>.lbl{margin-bottom:0}.mo-top .cv-verdict{padding:3px 10px}.mo-top{gap:6px}.modal.stock .m-overall{padding-top:7px;padding-bottom:7px}.om-card .sx-gw{margin-top:1px}.mo-side{gap:6px}.mo-side .ai-box{gap:3px;padding:6px 9px}.modal.stock .mo-side .ai-l{line-height:1.35}.om-card .sx-mix i{display:none}.om-card .sx-mix{gap:3px}.om-card .sx-mix span{padding:2px 6px;font-size:10px}.om-card .gauge{width:150px;height:auto}.om-card .sx-gv{font-size:23px}}
.mo-side{display:flex;flex-direction:column;gap:8px;min-width:0}.mo-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mo-side .mo-sum{border-top:0;padding-top:0;grid-column:auto}.mo-side .cv-verdict{justify-self:auto;text-align:left}
@media (max-width:900px){.modal.stock .m-overall{grid-template-columns:1fr}}
.sx-hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr);padding:0;overflow:hidden;margin-bottom:12px}
.sx-id{padding:18px 22px 20px;display:flex;flex-direction:column;gap:9px;min-width:0}
.sx-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sx-title h2{margin:0;font-size:25px;font-weight:800;letter-spacing:-.3px;line-height:1.15}
.sx-tick{font:700 12.5px var(--mono);color:var(--acc);padding:3px 9px;border-radius:6px;background:var(--adim);border:1px solid var(--accb)}
.sx-tag{font-size:11px;font-weight:700;color:var(--long);padding:3px 8px;border-radius:6px;background:var(--longd)}
.sx-meta{font-size:13.5px;color:var(--t2)}.sx-meta2{display:none;font-size:12.5px;color:var(--t2)}
.sx-price{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.sx-price b{font:700 27px var(--mono);letter-spacing:-.5px}
.sx-chg{font:700 13.5px var(--mono);padding:4px 9px;border-radius:7px}.sx-chg.up{color:var(--long);background:var(--longd)}.sx-chg.down{color:var(--short);background:var(--shortd)}
.sx-verdict{margin-top:6px;padding:14px 16px 15px;border-radius:12px;background:var(--s2);border:1px solid var(--b1);border-left:4px solid var(--mixed)}
.sx-verdict.good{border-left-color:var(--long)}.sx-verdict.bad{border-left-color:var(--short)}.sx-verdict.watch{border-left-color:var(--acc)}
.sx-lbl{display:flex;align-items:center;gap:6px;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700}
.sx-vtitle{font-size:19px;font-weight:800;margin:7px 0 6px;color:var(--mixed)}.sx-verdict.good .sx-vtitle{color:var(--long)}.sx-verdict.bad .sx-vtitle{color:var(--short)}.sx-verdict.watch .sx-vtitle{color:var(--acc)}
.sx-verdict p{margin:0;font-size:14.5px;line-height:1.65;color:var(--t1)}
.sx-meter{border-left:1px solid var(--b1);background:var(--s2);padding:18px 18px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.sx-meter .sx-lbl{align-self:stretch;justify-content:center}.sx-meter .gauge{margin:10px 0 16px}
.sx-gv{font:800 40px/1 var(--mono);letter-spacing:-1px}.sx-gv small{font-size:20px;margin-left:2px;letter-spacing:0}
.sx-gw{font-size:15.5px;font-weight:700;margin-top:6px}
.sx-gv.good,.sx-gw.good{color:var(--long)}.sx-gv.bad,.sx-gw.bad{color:var(--short)}.sx-gv.side,.sx-gw.side{color:var(--t2)}
.sx-mix{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:14px}
.sx-mix span{font-size:12px;color:var(--t2);padding:4px 10px;border-radius:999px;background:var(--s1);border:1px solid var(--b1);white-space:nowrap}
.sx-mix b{font-family:var(--mono);color:var(--t1);margin-left:5px}.sx-mix b.good{color:var(--long)}.sx-mix b.bad{color:var(--short)}.sx-mix i{font-style:normal;color:var(--t3);margin-left:5px;font-size:11px}
.sx-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}
.sx-stat{position:relative;overflow:hidden;padding:14px 16px 15px 18px;display:flex;flex-direction:column;gap:5px;min-width:0}
.sx-stat::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--b2)}
.sx-stat.good::before{background:var(--long)}.sx-stat.mid::before{background:var(--mixed)}.sx-stat.bad::before{background:var(--short)}.sx-stat.side::before{background:#8b97ad}
.sx-sl{font-size:10.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--t3);font-weight:700}
.sx-sn{font-size:13.5px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sx-sv{font:800 34px/1.05 var(--mono);letter-spacing:-1px;margin-top:4px}.sx-sv small{font-size:17px;margin-left:2px;letter-spacing:0}.sx-sv.word{font-family:var(--sans);letter-spacing:-.3px;font-size:30px}
.sx-sv.good{color:var(--long)}.sx-sv.mid{color:var(--mixed)}.sx-sv.bad{color:var(--short)}.sx-sv.side{color:var(--t2)}
.sx-sbar{height:6px;border-radius:3px;background:var(--s2);overflow:hidden;margin-top:4px}.sx-sbar i{display:block;height:100%;border-radius:3px;background:#8b97ad}
.sx-sbar i.good{background:var(--long)}.sx-sbar i.mid{background:var(--mixed)}.sx-sbar i.bad{background:var(--short)}
.sx-sw{align-self:flex-start;margin-top:4px;font-size:12.5px;font-weight:700;padding:3px 10px;border-radius:999px;background:var(--s2);color:var(--t2)}
.sx-sw.good{color:var(--long);background:var(--longd)}.sx-sw.mid{color:var(--mixed);background:rgba(255,170,0,.12)}.sx-sw.bad{color:var(--short);background:var(--shortd)}
.sx-snote{font-size:13px;color:var(--t2);line-height:1.5;margin-top:4px}
.sx-periods{padding:14px 18px 16px}.sx-phead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}.sx-hint{font-size:11.5px;color:var(--t3)}
.sx-pgrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:10px}
.sx-pc{padding:10px 12px 11px;border-radius:10px;background:var(--s2);border:1px solid var(--b1);display:flex;flex-direction:column;gap:6px;min-width:0}
.sx-pl{display:flex;justify-content:space-between;align-items:baseline;gap:6px;font-size:13.5px;font-weight:700}.sx-pl small{font-size:10.5px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.sx-pv{font:800 22px var(--mono);letter-spacing:-.5px}.sx-pv small{font-size:13px;margin-left:1px}.sx-pv.good{color:var(--long)}.sx-pv.bad{color:var(--short)}.sx-pv.side{color:var(--t2)}
.sx-pbar{position:relative;height:8px;border-radius:4px;background:var(--s1)}.sx-pbar i{position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;background:var(--t3);transform:translateX(-1px)}
.sx-pbar span{position:absolute;top:0;bottom:0;background:#8b97ad}.sx-pbar span.good{background:var(--long);border-radius:0 4px 4px 0}.sx-pbar span.bad{background:var(--short);border-radius:4px 0 0 4px}.sx-pbar span.side{border-radius:4px}
.sx-pw{font-size:12.5px;font-weight:600;color:var(--t2)}
@media (max-width:1100px){.sx-hero{grid-template-columns:1fr}.sx-meter{border-left:0;border-top:1px solid var(--b1)}.sx-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.sx-pgrid{grid-template-columns:repeat(5,minmax(120px,1fr));overflow-x:auto}}
@media (max-width:640px){.sx-id{padding:14px 14px 16px}.sx-title h2{font-size:21px}.sx-pgrid{grid-template-columns:repeat(2,minmax(0,1fr))}.sx-sv{font-size:28px}.sx-sv.word{font-size:24px}}
@media (min-width:1101px) and (max-height:860px){
  .sx-id{padding:14px 18px 15px;gap:7px}.sx-title h2{font-size:22px}.sx-price b{font-size:23px}.sx-verdict{padding:11px 14px 12px;margin-top:3px}
  .sx-vtitle{font-size:17px;margin:5px 0 4px}.sx-verdict p{font-size:13.5px;line-height:1.55}
  .sx-meter{padding:12px 16px 14px}.sx-meter .gauge{width:210px;height:auto;margin:6px 0 12px}.sx-gv{font-size:34px}.sx-gw{font-size:14px;margin-top:4px}.sx-mix{margin-top:10px}
  .sx-stat{padding:10px 14px 11px 16px;gap:3px}.sx-sv{font-size:28px}.sx-sv.word{font-size:25px}.sx-stats{margin-bottom:10px;gap:10px}.sx-hero{margin-bottom:10px}
  .sx-periods{padding:10px 14px 12px}.sx-pc{padding:8px 10px;gap:4px}.sx-pv{font-size:19px}
}
@media (min-width:1101px) and (max-height:720px){
  .sx-meter .gauge{width:180px;margin:4px 0 10px}.sx-gv{font-size:30px}.sx-mix span{padding:3px 8px;font-size:11.5px}
  .sx-snote{font-size:12px}.sx-hint{display:none}.sx-pw{display:none}
  .sx-meta{display:none}.sx-meta2{display:inline}.sx-id{gap:6px;padding:12px 16px 13px}.sx-price b{font-size:21px}.sx-chg{font-size:12.5px;padding:3px 8px}
  .sx-verdict p{font-size:13px;line-height:1.48}.sx-vtitle{font-size:16px;margin:4px 0 3px}.sx-verdict{padding:9px 12px 10px}
  .sx-stat{padding:8px 12px 9px 15px}.sx-sv{font-size:25px;margin-top:2px}.sx-sv.word{font-size:22px}.sx-sw{padding:2px 9px;font-size:12px}
  .sx-stats,.sx-hero{margin-bottom:8px}.sx-periods{padding:9px 14px 10px}.sx-pgrid{margin-top:6px}.sx-pc{padding:7px 10px;gap:5px}.sx-pv{font-size:18px}
  .sv-bar{margin-bottom:6px}.sv.sx{margin-top:6px}
}
.sv-sumgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:12px;align-items:stretch}
.sv-sumgrid .sv-overall{margin:0;display:flex;flex-direction:column;justify-content:center}.sv-sumgrid .sv-overall b{font-size:18px}.sv-sumgrid .sv-overall p{font-size:14.5px}
.sv-sumgrid .sv-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sv-sumgrid .sv-tile{padding:8px 11px;gap:2px}.sv-sumgrid .sv-tv{font-size:22px}.sv-sumgrid .sv-tn{font-size:12px}
.sv-summary{padding:12px 14px;margin-bottom:10px}.sv-summary .sv-t{margin-bottom:8px}
.sv-card{padding:12px 14px}.sv-grid{gap:10px}.sv-tf{padding:5px 0}.sv-meter .sv-mix{margin-top:0}.sv-foot{margin:10px 0 4px}
.sv-modebar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:-4px 0 12px}.sv-modebar .sg{height:30px}.sv-modebar .sg button{padding:0 12px;font-size:12px}
.sv-mix{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;font-size:12.5px;color:var(--t2);margin-top:2px}.sv-mix b{font-family:var(--mono);color:var(--t1)}.sv-mix b.down{color:var(--short)}.sv-mix b.up{color:var(--long)}
.sv-sum dl{margin:0;display:flex;flex-direction:column}.sv-row{display:grid;grid-template-columns:132px minmax(0,1fr);gap:12px;padding:9px 0 9px 12px;border-bottom:1px solid var(--b1);position:relative}
.sv-row::before{content:"";position:absolute;left:0;top:13px;width:6px;height:6px;border-radius:50%;background:var(--b2)}.sv-row.good::before{background:var(--long)}.sv-row.bad::before{background:var(--short)}.sv-row.mid::before{background:var(--mixed)}
.sv-row dt{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);padding-top:2px}.sv-row dd{margin:0;font-size:14px;line-height:1.55;color:var(--t1)}
.sv-foot{text-align:center;font-size:11.5px;margin:14px 0 6px}
@media (max-width:900px){.sv-row3{grid-template-columns:1fr}.sv-metrics{grid-column:auto}.sv-sumgrid{grid-template-columns:1fr}.sv-bar .sv-search{min-width:0;flex-basis:100%}.sv-bar .sv-modebar .sg{height:36px}.sv-grid{grid-template-columns:1fr}.sv-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.sv-qai{display:none}.sv-search input{padding-right:14px}.sv-row{grid-template-columns:1fr;gap:2px}.sv-tf{grid-template-columns:70px minmax(0,1fr) 84px}.sv-axis{grid-template-columns:70px 1fr 1fr 1fr 84px}.sv-drop button{grid-template-columns:96px minmax(0,1fr)}.sv-ds{display:none}.face{order:5;width:100%;margin:0}.face button{flex:1}.sv-head{flex-direction:column;align-items:flex-start}}
.dp{position:relative;margin-left:auto}.dp-btn{display:inline-flex;align-items:center;gap:7px;font:11px var(--mono);letter-spacing:.4px;color:var(--t2);background:var(--s2);border:1px solid var(--b2);border-radius:8px;padding:6px 10px;cursor:pointer}
.dp-btn b{color:var(--t1)}.dp-btn:hover{border-color:var(--accb)}.dp-btn.hist{border-color:var(--mixed);color:var(--mixed)}.dp-btn.hist b{color:var(--mixed)}.dp-part{font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;border:1px solid var(--mixed)}
.dp-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:40;width:290px;background:var(--s1);border:1px solid var(--b2);border-radius:12px;box-shadow:0 20px 44px -18px rgba(0,0,0,.8);padding:12px}
.dp-t{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;font-weight:700;margin-bottom:8px}
.dp-in{width:100%;padding:7px 9px;font:13px var(--mono);color-scheme:dark}[data-theme="light"] .dp-in{color-scheme:light}
.dp-none{margin-top:10px;font-size:12px;color:var(--t2);line-height:1.5}
.sg.dp-parts{display:flex;width:100%;margin-top:10px;height:auto}.sg.dp-parts button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 4px;height:auto;min-height:44px;line-height:1.2}
.sg.dp-parts button small{font:10px var(--mono);opacity:.75}.sg.dp-parts button:disabled{opacity:.35;cursor:not-allowed}
.dp-f{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;font-size:10.5px;color:var(--t3)}
.dp-f button{background:none;border:0;color:var(--acc);font-size:11.5px;font-weight:600;cursor:pointer;padding:0}

.who{display:flex;align-items:center;gap:10px;font-size:12.5px}.avatar{width:28px;height:28px;border-radius:50%;background:var(--adim);border:1px solid var(--accb);color:var(--acc);display:flex;align-items:center;justify-content:center;font:700 12px var(--mono)}
.fbar{position:sticky;top:0;z-index:6;display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 14px;padding:9px 12px;margin:12px 0 12px;background:var(--glass);backdrop-filter:blur(10px);border:1px solid var(--b1);border-radius:10px}
.fg{display:flex;flex-direction:column;gap:5px}.fl{display:flex;align-items:center;gap:5px;font-size:9px;color:var(--t2);text-transform:uppercase;letter-spacing:.9px;font-weight:700;height:13px}
.sg{display:inline-flex;border:1px solid var(--b2);border-radius:6px;overflow:hidden;background:var(--s2);height:27px}
.sg button{background:transparent;border:0;border-right:1px solid var(--b2);padding:0 7px;font-size:11px;font-weight:600;color:var(--t2);white-space:nowrap}
.sg button:last-child{border-right:0}.sg button:hover{color:var(--t1);background:var(--hover)}
.sg button.on{background:var(--adim);color:var(--acc)}.sg button.on.up{background:var(--longd);color:var(--long)}.sg button.on.down{background:var(--shortd);color:var(--short)}.sg button.on.bi{background:var(--retd);color:var(--ret)}.sg button.on.side{background:var(--mixedd);color:var(--mixed)}.sg button.on.flat{background:rgba(106,134,166,.16);color:var(--t1)}
.reset{margin-left:auto;height:27px;padding:0 12px;border:1px solid var(--b2);border-radius:6px;background:transparent;color:var(--t2);font-size:11.5px;font-weight:600}.reset:hover{border-color:var(--short);color:var(--short)}
.info{position:relative;display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border-radius:50%;border:1px solid var(--t3);color:var(--t2);font:700 8.5px/1 var(--sans);text-transform:none;letter-spacing:0;cursor:help;flex-shrink:0;vertical-align:1px}
.info:hover,.info:focus{border-color:var(--acc);color:var(--acc);outline:none}
.info-pop{display:none;position:absolute;top:calc(100% + 7px);left:-10px;z-index:50;width:250px;padding:9px 11px;border-radius:8px;background:var(--pop);border:1px solid var(--b2);box-shadow:0 14px 30px -10px rgba(0,0,0,.8);font:400 11.5px/1.5 var(--sans);color:var(--t1);white-space:normal;text-align:left}
.info-pop.r{left:auto;right:-10px}.info:hover .info-pop,.info:focus .info-pop{display:block}
.info-pop.wide{width:min(400px,calc(100vw - 32px))}
.mw{width:100%;border-collapse:collapse;margin:8px 0 6px;font-size:11px}.mw th{font:700 9px var(--sans);color:var(--t3);text-transform:uppercase;letter-spacing:.6px;padding:4px 5px;border-bottom:1px solid var(--b2);text-align:left}
.mw td{padding:5px;border-bottom:1px solid var(--b1);color:var(--t1);font-weight:600;white-space:nowrap}.mw td.mw-n{font:600 11px var(--mono);color:var(--t2);text-align:center}.mw th:not(:first-child):not(:last-child){text-align:center}
.mw td.mw-n.mw-top{color:var(--acc);font-weight:800}.mw td.mw-n.mw-zero{color:var(--t3);opacity:.6}.mw td.mw-hint{font-weight:400;color:var(--t2);white-space:normal;font-size:10.5px}
.mw tr.mw-on td{background:var(--adim)}.mw tr.mw-on td:first-child{color:var(--acc);box-shadow:inset 2px 0 0 var(--acc)}.mw-foot{font-size:10px;color:var(--t3)}
.chip{border:1px solid var(--b2);background:var(--s2);color:var(--t2);border-radius:6px;padding:5px 11px;font-size:12px;font-weight:600;white-space:nowrap}
.chip:hover{border-color:var(--accb);color:var(--t1)}.chip.on{border-color:var(--acc);background:var(--adim);color:var(--acc)}
.chip.on.up{border-color:var(--long);background:var(--longd);color:var(--long)}.chip.on.down{border-color:var(--short);background:var(--shortd);color:var(--short)}.chip.on.bi{border-color:var(--ret);background:var(--retd);color:var(--ret)}
.seg{display:inline-flex;border:1px solid var(--b2);border-radius:6px;overflow:hidden}.seg button{background:var(--s2);border:0;border-right:1px solid var(--b2);padding:4px 10px;font-size:11px;font-weight:600;color:var(--t2);white-space:nowrap}
.seg button:last-child{border-right:0}.seg button.on{background:var(--adim);color:var(--acc)}.seg button.on.up{background:var(--longd);color:var(--long)}.seg button.on.down{background:var(--shortd);color:var(--short)}
.ms{position:relative}.ms-btn{width:100%;height:27px;display:flex;justify-content:space-between;align-items:center;gap:6px;border:1px solid var(--b2);background:var(--s2);border-radius:6px;padding:0 10px;font-size:11.5px;font-weight:600;color:var(--t2);text-align:left}
.ms-btn span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ms-btn.on{border-color:var(--acc);color:var(--acc);background:var(--adim)}.caret{font-size:9px;opacity:.7}
.ms-pop.right{left:auto;right:0}.ms-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:30;width:max(100%,270px);max-width:calc(100vw - 24px);background:var(--s1);border:1px solid var(--b2);border-radius:10px;box-shadow:0 20px 44px -18px rgba(0,0,0,.8);padding:8px}
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
.mo-cell{display:flex;flex-direction:column;gap:5px;align-items:flex-start}.mo-sum{grid-column:1/-1;font-size:12.5px;color:var(--t1);line-height:1.5;border-top:1px solid var(--b1);padding-top:10px;display:flex;flex-direction:column;gap:5px}.mo-sum>.lbl{display:flex;align-items:center;gap:5px;margin-bottom:2px}.cv-row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:8px;align-items:baseline}.cv-k{font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);font-weight:700}.cv-st{font-weight:700}.cv-st.up{color:var(--long)}.cv-st.down{color:var(--short)}.cv-st.side{color:var(--mixed)}.ai-h{display:flex;align-items:center;gap:6px}.ai-spark{color:#a78bfa;font-size:12px;filter:drop-shadow(0 0 4px rgba(167,139,250,.6))}
.ai-box{margin-top:6px;display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:9px;border:1px solid var(--b2);background:var(--s2);border-left:3px solid #a78bfa}
.ai-l{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px;font-size:12.5px;line-height:1.5}.ai-l b{font-size:11.5px;white-space:nowrap}
.ai-l.good b{color:var(--long)}.ai-l.bad b{color:var(--mixed)}.ai-l.focus b{color:#a78bfa}.ai-l.focus span{font-weight:600;color:var(--t1)}
@media (max-width:640px){.ai-l{grid-template-columns:1fr;gap:1px}}
.cv-say{margin-top:4px;padding:8px 11px;border-radius:8px;border:1px solid var(--b2);background:var(--s2);border-left:3px solid var(--b2)}.cv-say.good{border-left-color:var(--long)}.cv-say.warn{border-left-color:var(--mixed)}.cv-say.bad{border-left-color:var(--short)}.cv-say.watch{border-left-color:var(--acc)}.cv-verdict{justify-self:end;align-self:center;font-size:12.5px;font-weight:700;padding:6px 12px;border-radius:8px;border:1px solid var(--b2);background:var(--s2);color:var(--t1);white-space:nowrap}.cv-verdict.good{color:var(--long);border-color:rgba(0,200,150,.45);background:var(--longd)}.cv-verdict.warn{color:var(--mixed);border-color:rgba(255,170,0,.45);background:var(--mixedd)}.cv-verdict.bad{color:var(--short);border-color:rgba(255,68,84,.45);background:var(--shortd)}.cv-verdict.watch{color:var(--acc);border-color:var(--accb);background:var(--adim)}.cv-verdict.mid{color:var(--t2)}
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

/* stock card: one screen on desktop (two columns), single column + scroll on phones */
@media (min-width:1000px){
  .modal.stock{max-width:1240px;width:min(1240px,96vw);max-height:95vh;padding:16px 22px 12px}
  .modal.stock .m-head{padding-right:30px}.modal.stock .m-name{font-size:19px}
  .modal.stock .m-price{display:flex;flex-direction:column;align-items:flex-end;gap:3px}.modal.stock .m-copy{margin-top:3px}
  .m-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:16px;align-items:start;margin-top:10px}
  .m-col{display:flex;flex-direction:column;gap:12px;min-width:0}
  .modal.stock .m-overall{margin:0;padding:11px 13px;gap:10px 14px}
  .modal.stock .m-sec-t{margin:0 0 6px}
  .modal.stock .m-row{padding:6px 12px;grid-template-columns:78px minmax(0,1fr) 106px 84px}.modal.stock .m-l .sub{display:none}
  .modal.stock .ctx td{padding:4px 5px}.modal.stock .ctx th{padding:6px 5px}
  .modal.stock .peer{padding:4px 12px}.modal.stock .ctx .rk{margin-top:0}
  .modal.stock .mo-sum{padding-top:8px;gap:3px}.modal.stock .cv-row{line-height:1.35}
  .modal.stock .m-foot{margin:8px 0 2px}.modal.stock .fine{margin:0;font-size:9.5px;line-height:1.4}
  .modal.stock .ai-box{gap:4px;padding:8px 11px}.modal.stock .ai-l{font-size:12px;line-height:1.45}
  .modal.stock .cv-grp,.modal.stock .fine{display:none}.modal.stock .m-foot{justify-content:space-between}
  .m-grid{margin-top:8px}
}
@media (min-width:1000px) and (max-height:800px){
  .modal.stock .mo-gauge .gauge{width:108px;height:auto}
  .modal.stock{max-height:98vh;padding:12px 20px 8px}.modal.stock .m-name{font-size:17px}
  .modal.stock .m-row{padding:4px 12px}.modal.stock .peer{padding:3px 12px}.modal.stock .ctx td{padding:3px 5px}
  .modal.stock .m-overall{padding:9px 12px;gap:8px 12px}.modal.stock .ai-box{padding:7px 10px}.modal.stock .ai-l{font-size:11.5px;line-height:1.4}
  .modal.stock .m-col{gap:9px}.m-grid{gap:12px}.modal.stock .stag.big b{font-size:14px}
}
@media (max-width:999px){
  .m-disc{display:none}
  .m-grid{display:flex;flex-direction:column}.m-col{display:contents}
  .m-overall{order:1}.blk-tf{order:2}.blk-ctx{order:3}.blk-peers{order:4}.blk{margin-top:14px}
}
.m-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0}
footer{border-top:1px solid var(--b1);padding-top:14px;margin-top:18px}
@media (min-width:1380px){.fbar{flex-wrap:nowrap}.fbar .fg{flex-shrink:0}.fbar .fg.grow{flex:0 1 150px;min-width:96px}.fbar .fg.grow .ms{width:100%!important}.fbar .reset{flex-shrink:0;padding:0 9px}}
@media (max-width:900px){.top .tabs{order:5;width:100%;margin:0 0 8px}.top .tabs button{flex:1;justify-content:center}.auth-page{grid-template-columns:1fr}.hero{padding:30px 22px;border-right:0;border-bottom:1px solid var(--b1)}.hero-h{font-size:28px}.hero-demo{display:none}.panels{grid-template-columns:1fr}.m-overall{grid-template-columns:auto auto}.cv-verdict{grid-column:1/-1;justify-self:start;white-space:normal}}
@media (max-width:640px){.auth-page .feats,.auth-page .hero-fine{display:none}.hero-p{font-size:13.5px}.hero{gap:10px}.top{gap:8px 12px;padding-top:8px}.top .hd-bell-wrap{margin-left:auto}.asof{order:4}.dp{order:4;margin-left:0;width:100%}.dp-btn{width:100%;justify-content:center}.dp-pop{left:0;right:auto;width:100%}.fbar{position:static}.reset{margin-left:0}.hide-sm{display:none}.asof{margin-left:0;width:100%}.grid2{grid-template-columns:1fr}.m-row{grid-template-columns:76px minmax(0,1fr) 104px}.m-row .dirtag{display:none}.t-tools .search{width:100%}}
`;

document.documentElement.dataset.theme = getTheme();
const style = document.createElement("style"); style.textContent = CSS + GUIDE_CSS + QUICK_CSS; document.head.appendChild(style);
createRoot(document.getElementById("root")).render(<App/>);
