// Hyperplane by QuantFriday — customer edition (/app).
// Self-contained on purpose: it must never import the dashboard code. It only shows what the server publishes.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Helpdesk, HelpdeskIcon, InboxBell, useHelpdeskUnread } from "../../shared/helpdesk.jsx";
import Guide, { GUIDE_CSS } from "./guide.jsx";
import { QuickGuideButton, QUICK_CSS } from "./quick.jsx";
import { DIAL_CODES, POPULAR_DIAL } from "./dial.js";
import { placeLabels } from "./labels.js";

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

function Info({ text, right, wide, label, above }) {
  return <span className="info" tabIndex={0} onClick={e => e.stopPropagation()} aria-label={label || (typeof text === "string" ? text : "More info")}>i<span className={`info-pop ${right ? "r" : ""} ${wide ? "wide" : ""} ${above ? "above" : ""}`}>{text}</span></span>;
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

        {data && <InvestmentSummary s={s} data={data}/>}
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
function StockSearch({ stocks, onPick, autoFocus, onClear = null, placeholder = null, added = null, keepOpen = false }) {
  const [q, setQ] = useState(""); const [hi, setHi] = useState(0); const [open, setOpen] = useState(false); const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const found = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return [];
    const rank = x => x.s.toLowerCase() === t ? 0 : x.s.toLowerCase().startsWith(t) ? 1 : x.n.toLowerCase().startsWith(t) ? 2 : x.n.toLowerCase().includes(" " + t) ? 3 : 4;
    return stocks.filter(x => x.s.toLowerCase().includes(t) || x.n.toLowerCase().includes(t)).sort((a, b) => rank(a) - rank(b) || a.n.localeCompare(b.n)).slice(0, 8);
  }, [q, stocks]);
  const pick = x => { onPick(x.s); setQ(""); if (!keepOpen) setOpen(false); };
  return (
    <div className={`sv-search ${onClear ? "has-x" : ""}`} ref={ref}>
      <span className="sv-mag" aria-hidden="true">⌕</span>
      {onClear && <button type="button" className="sv-x" onClick={onClear} title="Clear this stock and search again" aria-label="Clear this stock">✕</button>}
      <span className="sv-qai" title="Hyperplane AI is built on Hyperplane's own quant algorithms: fixed rules applied to our trend data — the same numbers as the Research view. It does not use any outside AI service, and it never makes up a number."><span className="ai-spark">✦</span>Hyperplane AI</span>
      <input value={q} autoFocus={autoFocus} placeholder={placeholder || "Ask Hyperplane AI — type a company name or ticker (e.g. Tata, INFY)"} aria-label="Search a stock"
        onChange={e => { setQ(e.target.value); setHi(0); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setHi(i => Math.min(i + 1, found.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && found[hi]) { e.preventDefault(); pick(found[hi]); }
          else if (e.key === "Escape") setOpen(false); }}/>
      {open && q.trim() && (
        <div className="sv-drop" role="listbox">
          {found.length ? found.map((x, i) => (
            <button key={x.s} type="button" role="option" aria-selected={i === hi} className={i === hi ? "on" : ""} onMouseEnter={() => setHi(i)} onClick={() => pick(x)}>
              <b className="mono">{x.s}</b><span className="sv-dn">{x.n}</span><span className="sv-ds">{added && added.has(x.s) ? <span className="pf-added">✓ added</span> : x.sec}</span>
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

// ─── AI PORTFOLIO ANALYSER — Hyperplane AI by QuantFriday ───────────────────────
// Long-term read (owner, 2026-10-16 v3): the stock's OWN strength only (sector / industry never added) on Quarterly 50 ·
// Yearly 30 · Monthly 20; Weekly and Daily are ignored. `zs` (publish: this month's / quarter's zone vs the zone stored in
// the previous month / quarter) moves a group one step on the quarterly step: Doing well + quarter stepped down → Keep an
// eye on; Keep an eye on + stepped down + strength < 0 → Look at first; Look at first + stepped up → marked "Improving".
// Customer words: plain, no long dashes, compare with past months / quarters / years (never "zone" or "range"), never
// "buy / sell / hold" (owner, 2026-10-17: "people don't know what a range is").
const LT_TF = [["M", 2, "Monthly", 20], ["Q", 3, "Quarterly", 50], ["Y", 4, "Yearly", 30]];   // card order M · Q · Y
const PF_MIN_YEARS = 3;                 // fewer years of yearly price history → recently listed, no view
// attention order: red → amber → green → grey
const PF_CATS = [
  ["review", "Look at first", "bad", "Weak trend or low reliability. These need your attention first."],
  ["watch", "Keep an eye on", "mid", "Mixed signs. Check these from time to time."],
  ["intact", "Doing well", "good", "Strong and steady trend."],
  ["new", "Recently listed", "side", `The quant algorithm needs at least ${PF_MIN_YEARS} years of yearly data. These do not have it yet.`],
];
const PF_CAT = Object.fromEntries(PF_CATS.map(c => [c[0], c]));
const PF_ORDER = { review: 0, watch: 1, intact: 2, new: 3 };
const goingWord = d => d === 1 ? "going up" : d === -1 ? "going down" : d === 0 ? "moving sideways" : "not known";
const andJoin = a => a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
function groupLongTerm(data, sec, ind) {        // average of the Quarterly and Yearly rows: strength + direction (reference only)
  const pick = (byTf, match) => ["Q", "Y"].map(tf => ((byTf || {})[tf] || []).find(match)).filter(Boolean);
  const avg = rows => rows.length ? { st: rows.reduce((a, r) => a + r.st, 0) / rows.length, nb: rows.reduce((a, r) => a + r.nb, 0) / rows.length } : null;
  return { sec: avg(pick(data.sectors, r => r.k === sec)), ind: avg(pick(data.industries, r => r.k === ind && r.sec === sec)) };
}
// Zone engine result (publish → zone_engine.py; owner, 2026-10-17): s.zv = [colour 1/0/−1, strength, [M], [Q], [Y]], each
// timeframe [trend 2…−2, price position 2 / 1 / −1 / −2, strength]. All maths stays on the server; this only turns the
// results into plain words for people with no finance background. No zv (collection without Zone_History) → strength rules.
const ZTREND = { 2: "the trend is going up", 1: "the trend has just turned up", 0: "the trend is flat", [-1]: "the trend has just turned down", [-2]: "the trend is going down" };
const ZPRICE = { 2: "very strong", 1: "holding up well", [-1]: "weak", [-2]: "very weak" };
const ZPERIOD = { M: ["month", "months"], Q: ["quarter", "quarters"], Y: ["year", "years"] };
// "going down for the last 3 quarters" — streak = periods in a row the trend moved the same way (sent by the server)
const streakText = (t, k) => {
  const [one, many] = ZPERIOD[k];
  if (t.sd == null) return ZTREND[t.tr];                        // older published data without the streak
  if (t.sd === 0) return t.sn >= 2 ? `the trend has been flat for the last ${t.sn} ${many}` : `the trend is flat this ${one}`;
  const dir = t.sd > 0 ? "up" : "down";
  return t.sn >= 2 ? `the trend has been going ${dir} for the last ${t.sn} ${many}` : `the trend turned ${dir} this ${one}`;
};
const zDir = t => t.sd != null ? t.sd : Math.sign(t.tr || 0);   // latest direction: 1 up · 0 flat · −1 down
function analyseZone(s, data) {
  const [fin, strength, ...per] = s.zv;
  const tf = {};
  ["M", "Q", "Y"].forEach((k, i) => { const t = per[i];
    tf[k] = t ? { v: t[2], d: dirVal(t[2]), tr: t[0], pos: t[1], sd: t[3] ?? null, sn: t[4] ?? null } : { v: null, d: null, tr: null, pos: null, sd: null, sn: null }; });
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
    const line = (t, k, name) => { const tr = streakText(t, k), once = tr.endsWith(`this ${ZPERIOD[k][0]}`);
      return `${name}: ${tr}, and the price is ${ZPRICE[t.pos]}${once ? "" : ` this ${ZPERIOD[k][0]}`}.`; };
    why.push(line(Q, "Q", "Quarterly view"));
    why.push(Y.tr != null ? line(Y, "Y", "Yearly view") : "Yearly view: not available yet. It needs 10 years of price data.");
    if (M.tr != null) why.push(line(M, "M", "Monthly view")
      + (zDir(M) === -1 && M.pos <= -1 ? " Keep an eye on it." : zDir(M) === 1 && M.pos >= 1 ? " A good short-term sign." : ""));
    if (fin === 0 && Q.v >= TREND_CUT) why.push("The quarterly view is strong, but the yearly or monthly view holds it back.");
    else if (fin === 0 && strength >= TREND_CUT && Q.v < 0) why.push("The overall strength is good, but the quarterly view is negative, so it is not marked Doing well yet.");
    if (fin === -1 && Q.v > -TREND_CUT) why.push("The yearly and monthly views are weak enough to pull it down.");
    if (s.h === "W") why.push(fin === -1 ? "Reliability is low: it once fell more than 70% from its highest price. That means more risk."
                                         : "Reliability is low: it once fell more than 70% from its highest price. Low reliability always puts a stock in Look at first.");
    else if (s.h === "M") why.push("It is more than 50% below its highest price, or lower than 5 years ago.");
    if (s.x) why.push(fin === 1 ? "It went up more than 3 times in a year, so it stays in Keep an eye on. Such fast gains often cool off."
                                : "It went up more than 3 times in a year. Such fast gains often cool off.");
  }
  return { s, cat, lt: tooNew ? null : strength, tf, g: groupLongTerm(data, s.sec, s.ind), why, moved: null, improving, qStep: s.zs ? s.zs[1] : null, zone: true };
}
function analyseHolding(s, data) {
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
    if (s.h === "W") why.push("Reliability is low: it once fell more than 70% from its highest price. That means more risk.");
    else if (s.h === "M") why.push("It is more than 50% below its highest price, or lower than 5 years ago.");
    if (s.x) why.push("It went up more than 3 times in a year. Such fast gains often cool off.");
  }
  return { s, cat, lt, tf, g: groupLongTerm(data, s.sec, s.ind), why, moved, improving, qStep };
}
function portfolioSummary(rows) {
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

// Holdings table row (owner, 2026-10-17: "professional like the big companies" — clean fintech + institutional research).
const tc = v => `c-${dirToneOf(v)}`;                                  // red below 0 · green from the uptrend cut · else grey
const pctTxt = v => v === 0 ? "Sideways" : `${signed(v)}%`;
const noData = (k, lbl) => <span className="px-na px-nd">No data <Info text={k === "Y" ? "Hyperplane needs 10 years of price data to calculate the yearly trend."
  : `Not enough price data yet to calculate the ${lbl.toLowerCase()} trend.`}/></span>;
// stock strength + Monthly / Quarterly / Yearly tiles with the key-insight chip (AI Portfolio cards and the Research
// stock card's Investment AI summary use the same block)
function StrengthTiles({ r, label = "Stock strength" }) {
  return <>
    <div className="px-label">{label}</div>
    <div className="px-dbig"><b className={tc(r.lt)}>{signed(r.lt)}<small>%</small></b><span className={tc(r.lt)}>{trendWordOf(r.lt)}</span></div>
    <DivBar v={r.lt} d={dirVal(r.lt)} scale className="px-dbar"/>
    <div className="px-tfs">{LT_TF.map(([k, , lbl]) => { const v = r.tf[k].v;
      return (
        <div key={k} className="px-tf">
          <span className="px-label">{lbl}</span>
          {v == null ? noData(k, lbl) : (() => { const x = streakShort(r, k);
            return <><b className={`px-tfv ${tc(v)}`} title={trendWordOf(v)}>{pctTxt(v)}</b>
              {x && <span className={`px-kin c-${x[1]}`} title={`${lbl}: ${x[2]}`}>{x[0]}</span>}</>; })()}
        </div>); })}</div>
  </>;
}

// Long-term AI Investment Summary (owner, 2026-10-17: "only the summary part") — the AI Portfolio engine's plain-word
// research summary for ONE stock, inside the Research view's stock card. A different formula from the Research strength.
function InvestmentSummary({ s, data }) {
  const r = analyseHolding(s, data);
  return (
    <section className="blk inv">
      <div className="px-aih"><span className="ai-spark">✦</span><b>Long-term</b><span>AI Investment Summary</span>
        <Info right text="A long-term reading by Hyperplane AI (the same engine as the AI Portfolio Analyser): the monthly, quarterly and yearly trend of this stock and how long each has lasted. It uses a different formula from the Research view's strength above, which also looks at daily and weekly signals. Information, not advice."/></div>
      <ul className="px-why">{r.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
    </section>
  );
}

function HoldingItem({ r, flash }) {
  const [, label, tone] = PF_CAT[r.cat];
  const rel = r.s.h && r.cat !== "new" ? RELIABILITY[r.s.h] : null;
  const grp = x => !x ? ["no data", ""] : x.nb > 0 ? ["strong", "good"] : x.nb < 0 ? ["weak", "bad"] : ["flat", ""];
  const [sw, st] = grp(r.g.sec), [iw, it] = grp(r.g.ind);
  const isNew = r.cat === "new";
  return (
    <article id={`pf-card-${r.s.s}`} className={`px-item ${tone} ${flash ? "flash" : ""}`}>
      <div className="px-who">
        <div className="px-name"><b title={r.s.n}>{r.s.n}</b><em>{r.s.s}</em></div>
        <div className="px-where">{r.s.sec} › {r.s.ind}</div>
        <span className={`px-pill ${tone}`}><i/>{label}</span>
        <div className="px-chips">
          {r.s.cap && <span className="px-chip">{r.s.cap} cap</span>}
          {rel && <span className="px-chip" title={rel[2]}><i className={rel[1]}/>Reliability: {rel[0]}</span>}
          {r.improving && <span className="px-chip"><i className="good"/>Improving</span>}
          {r.s.x ? <span className="px-chip" title="Went up more than 3 times in a year"><i className="mid"/>Rose very fast</span> : null}
        </div>
        <div className="px-backdrop">
          <div className="px-label">Sector and industry <Info text="Sector and industry strength are shown for reference only. They are not used to calculate the stock strength or the colour."/></div>
          <div className="px-chips">
            <span className="px-chip"><i className={st}/>Sector: {sw}</span>
            <span className="px-chip"><i className={it}/>Industry: {iw}</span>
          </div>
        </div>
      </div>
      <div className="px-how">
        {isNew ? <div className="px-newnote"><b>Recently listed</b><span>No view yet. The quant algorithm needs at least {PF_MIN_YEARS} years of yearly data.</span></div> : <>
          <StrengthTiles r={r}/>
        </>}
      </div>
      <div className="px-whyc">
        <div className="px-aih"><span className="ai-spark">✦</span><b>Hyperplane AI</b><span>Research summary</span></div>
        <ul className="px-why">{(isNew ? r.why.slice(0, 1) : r.why).map((w, i) => <li key={i}>{w}</li>)}</ul>
      </div>
    </article>
  );
}

// "Portfolio by status" (owner, 2026-10-17: the 4 boxes looked boxy) — one panel: split bar, four status tabs with count
// and share, then the selected status's stocks as clean rows (name · ticker · sector · quarterly trend · strength).
// key insight per period (owner: "I like ▲ Up for 2 quarters — show it in the detail below the 3 boxes")
const UNIT = { M: ["month", "months"], Q: ["quarter", "quarters"], Y: ["year", "years"] };
function streakShort(r, k) {
  const t = r.tf[k], [one, many] = UNIT[k];
  if (t.v == null) return null;
  const d = r.zone ? zDir(t) : t.d, n = r.zone ? t.sn : null;
  const full = r.zone ? streakText(t, k) : `the trend is ${d === 1 ? "going up" : d === -1 ? "going down" : "flat"}`;
  if (d === 1) return [n >= 2 ? `Up ${n} ${many}` : "Turned up", "good", full];          // colour shows the direction
  if (d === -1) return [n >= 2 ? `Down ${n} ${many}` : "Turned down", "bad", full];
  return [n >= 2 ? `Flat ${n} ${many}` : `Flat this ${one}`, "side", full];
}

const PF_COL = { bad: "var(--short)", mid: "var(--mixed)", good: "var(--long)", side: "#8b97ad" };

function TrendMap({ rows, onPick }) {
  const box = useRef(null);
  const [size, setSize] = useState([700, 380]);       // drawn at the box's real size, so text keeps its normal size
  useEffect(() => { const el = box.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setSize([Math.round(e.contentRect.width), Math.round(e.contentRect.height)]));
    ro.observe(el); return () => ro.disconnect(); }, []);
  const pts = rows.filter(r => r.cat !== "new" && r.tf.Q.v != null && r.tf.Y.v != null);
  const hidden = rows.length - pts.length;
  const W = Math.max(280, size[0]), H = Math.max(260, size[1]), L = 30, R = 12, T = 22, B = 40;
  const x = v => L + (v + 100) / 200 * (W - L - R), y = v => T + (100 - v) / 200 * (H - T - B);
  const quads = [["Rising", "good", 1, 1], ["Cooling off", "mid", -1, 1], ["Recovering", "mid", 1, -1], ["Falling", "bad", -1, -1]];
  // ticker labels: right, left, above or below the dot, whichever overlaps nothing (red first); else hover only
  const dots = pts.map(r => ({ r, cx: x(r.tf.Q.v), cy: y(r.tf.Y.v) }));
  const tags = placeLabels([...dots].sort((a, b) => PF_ORDER[a.r.cat] - PF_ORDER[b.r.cat]).map(d => ({ key: d.r.s.s, x: d.cx, y: d.cy, label: d.r.s.s })),
    { box: [x(-100), y(100), x(100), y(-100)] });
  const unlabelled = pts.length - Object.keys(tags).length;
  return (
    <div className="px-card px-map">
      <div className="px-ch">
        <div><h3>Trend map</h3><p>Each dot is one stock. Right: stronger quarterly trend. Up: stronger yearly trend.</p></div>
        <div className="px-legend">{PF_CATS.filter(c => c[0] !== "new").map(([k, l, t]) => <span key={k}><i className={t}/>{l}</span>)}</div>
      </div>
      <div ref={box} className="pf-mapw"><svg className="pf-map" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend map of your stocks">
        {quads.map(([lbl, tone, sx, sy]) => (
          <g key={lbl}>
            <rect x={sx > 0 ? x(0) : x(-100)} y={sy > 0 ? y(100) : y(0)} width={x(0) - x(-100)} height={y(0) - y(100)} style={{ fill: PF_COL[tone] }} opacity=".06"/>
            <text x={sx > 0 ? x(100) : x(-100)} y={sy > 0 ? y(100) - 7 : y(-100) + 15} textAnchor={sx > 0 ? "end" : "start"} className="pf-mq" style={{ fill: PF_COL[tone] }}>{lbl}</text>
          </g>))}
        {[-50, 50].map(v => <g key={`g${v}`}><line x1={x(v)} x2={x(v)} y1={y(100)} y2={y(-100)} className="pf-mgrid"/><line x1={x(-100)} x2={x(100)} y1={y(v)} y2={y(v)} className="pf-mgrid"/></g>)}
        <rect x={x(-100)} y={y(100)} width={x(100) - x(-100)} height={y(-100) - y(100)} className="pf-mframe"/>
        <line x1={x(0)} x2={x(0)} y1={y(100)} y2={y(-100)} className="pf-max"/>
        <line x1={x(-100)} x2={x(100)} y1={y(0)} y2={y(0)} className="pf-max"/>
        <text x={x(0)} y={y(-100) + 13} textAnchor="middle" className="pf-mt">0</text>
        {[-100, 100].map(v => <text key={`y${v}`} x={L - 4} y={y(v) + (v > 0 ? 9 : -2)} textAnchor="end" className="pf-mt">{v > 0 ? "+100" : signed(v)}</text>)}
        <text x={x(0)} y={H - 4} textAnchor="middle" className="pf-mt b">Quarterly trend →</text>
        <text transform={`translate(10 ${y(0)}) rotate(-90)`} textAnchor="middle" className="pf-mt b">Yearly trend →</text>
        {dots.map(({ r, cx, cy }) => { const t = tags[r.s.s];
          return (
            <g key={r.s.s} className="pf-dot" onClick={() => onPick(r.s.s)}>
              <title>{`${r.s.n} (${r.s.s}): quarterly ${signed(r.tf.Q.v)}%, yearly ${signed(r.tf.Y.v)}%. ${PF_CAT[r.cat][1]}.`}</title>
              <circle cx={cx} cy={cy} r="6.5" style={{ fill: PF_COL[PF_CAT[r.cat][2]], stroke: "var(--s1)" }} strokeWidth="2.5"/>
              {t && <text x={t[1]} y={t[2]} textAnchor={t[0]} className="pf-ml">{r.s.s}</text>}
            </g>); })}
      </svg></div>
      <div className="px-foot">{hidden > 0 ? `${hidden} not shown: recently listed or no yearly data yet. ` : ""}{unlabelled > 0 ? "Point at a dot to see its name. " : ""}Click a dot to open the stock.</div>
    </div>
  );
}

// PDF report (owner, 2026-10-17): the page hands report.js the same numbers and words it shows; report.js only draws.
const PF_LONG = {
  review: "The stock's strength is weak (-24% or lower), or its reliability is low because it once fell more than 70% from its highest price. Look at these first.",
  watch: "Mixed signs: the strength is between -24% and +24% (moving sideways), the quarterly view is negative, or the price rose very fast. Check these from time to time.",
  intact: "The stock's strength is +24% or more and the quarterly view is not negative. The bigger picture is holding up well.",
  new: "Less than 3 years of yearly price data, so Hyperplane AI gives no view on these yet.",
};
const PF_GUIDE = [
  ["Stock strength", "A number from -100% to +100%. Above +24% is an uptrend, below -24% is a downtrend, in between is sideways. Weak, Average, Good and Strong tell how strong the trend is (up to 30%, up to 60%, up to 80%, above 80%)."],
  ["Monthly, quarterly and yearly views", "For each period Hyperplane AI checks whether the trend is going up, flat or going down and for how long (for example, going down for the last 3 quarters), and how strong today's price is for this month, quarter and year. The quarter counts most, then the year, then the month. Daily and weekly moves are left out."],
  ["Reliability", "High, Medium or Low, from the stock's whole price history. Low means it once fell more than 70% from its highest price, which means more risk."],
  ["Rose very fast", "The price went up more than 3 times in a year. Such fast gains often cool off, so these stocks are never marked Doing well."],
  ["Trend map", "Each dot is one stock. Top right (Rising): the quarterly and yearly trends are both up. Bottom left (Falling): both down. Top left (Cooling off) and bottom right (Recovering) are mixed."],
  ["Sector and industry", "Shown on each stock for reference only. They are never used to calculate the strength and never change a colour."],
  ["Your privacy", "This report was made on your own device. Your stock list is visible only to you, the account holder. It is never visible to other users or to the admin, as per SEBI norms."],
];
function reportModel(rows, sum, data, me) {
  const now = new Date();
  const dots = rows.filter(r => r.cat !== "new" && r.tf.Q.v != null && r.tf.Y.v != null)
    .map(r => ({ s: r.s.s, q: r.tf.Q.v, y: r.tf.Y.v, tone: PF_CAT[r.cat][2], rank: PF_ORDER[r.cat] }));
  const grp = x => !x ? "no data" : x.nb > 0 ? "strong" : x.nb < 0 ? "weak" : "flat";
  return {
    file: `Hyperplane-Portfolio-Report-${now.toISOString().slice(0, 10)}.pdf`,
    customer: (me && me.name) || "", asOf: fmtDT(data.as_of), total: rows.length,
    generated: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    title: sum.title, tone: sum.tone, lines: sum.lines, avg: sum.avg, avgWord: trendWordOf(sum.avg), zones: G_ZONES,
    cats: PF_CATS.map(([k, label, tone, desc]) => ({ key: k, label, tone, desc, long: PF_LONG[k], count: sum.counts[k],
      items: rows.filter(r => r.cat === k).sort((a, b) => k === "new" ? (b.s.yh ?? 0) - (a.s.yh ?? 0) : k === "review" ? a.lt - b.lt : b.lt - a.lt)
        .map(r => ({ n: r.s.n, s: r.s.s, v: k === "new" ? null : r.lt, extra: r.s.yh != null ? `${r.s.yh} yr` : "new" })) })),
    dots, hidden: rows.length - dots.length, guide: PF_GUIDE,
    keys: (() => {
      const live = rows.filter(r => r.cat !== "new"), q = r => r.zone ? (r.tf.Q.tr == null ? null : zDir(r.tf.Q)) : r.tf.Q.d;
      const up = live.filter(r => q(r) >= 1).length, down = live.filter(r => q(r) <= -1).length;
      const low = rows.filter(r => r.s.h === "W").length, fast = rows.filter(r => r.s.x).length;
      const tone = v => v == null ? "side" : v < 0 ? "bad" : dirVal(v) === 1 ? "good" : "side";
      return [["Stocks analysed", String(rows.length), `${live.length} with a full view`, "side"],
        ["Portfolio strength", sum.avg == null ? "No data" : `${sum.avg < 0 ? "-" : ""}${Math.abs(sum.avg)}%`, trendWordOf(sum.avg), tone(sum.avg)],
        ["Trending up", String(up), "on the quarterly view", up ? "good" : "side"],
        ["Trending down", String(down), "on the quarterly view", down ? "bad" : "side"],
        ["Low reliability", String(low), "fell over 70% in the past", low ? "bad" : "good"],
        ["Rose very fast", String(fast), "3 times or more in a year", fast ? "mid" : "good"]];
    })(),
    stocks: [...rows].sort((a, b) => PF_ORDER[a.cat] - PF_ORDER[b.cat] || (a.lt ?? 999) - (b.lt ?? 999)).map(r => ({
      n: r.s.n, s: r.s.s, sec: r.s.sec, ind: r.s.ind, label: PF_CAT[r.cat][1], tone: PF_CAT[r.cat][2], isNew: r.cat === "new",
      chips: [r.improving && ["Improving", "good"], r.s.cap && [`${r.s.cap} cap`, null],
        r.s.h && r.cat !== "new" && [`Reliability: ${RELIABILITY[r.s.h][0]}`, RELIABILITY[r.s.h][1]], r.s.x && ["Rose very fast", "mid"]].filter(Boolean),
      v: r.lt, word: trendWordOf(r.lt), why: r.why,
      tfs: LT_TF.map(([k, , lbl]) => ({ label: lbl, v: r.tf[k].v, word: r.tf[k].v == null ? "" : trendWordOf(r.tf[k].v),
        note: k === "Y" ? "Needs 10 years" : "Not enough data" })),
      ref: `Sector: ${grp(r.g.sec)}. Industry: ${grp(r.g.ind)}. Shown for reference only, not used in the strength.`,
    })),
  };
}

function PortfolioView({ data, symbols, setSymbols, status, me }) {
  const bySym = useMemo(() => Object.fromEntries(data.stocks.map(x => [x.s, x])), [data]);
  const added = useMemo(() => new Set(symbols), [symbols]);
  const rows = useMemo(() => symbols.filter(k => bySym[k]).map(k => analyseHolding(bySym[k], data)), [symbols, bySym, data]);
  const missing = symbols.filter(k => !bySym[k]);
  const sum = rows.length ? portfolioSummary(rows) : null;
  const add = k => { if (!added.has(k)) setSymbols([...symbols, k]); };
  const remove = k => setSymbols(symbols.filter(x => x !== k));
  const [stage, setStage] = useState(symbols.length ? "result" : "build");
  const [confirmClear, setConfirmClear] = useState(false);
  const [show, setShow] = useState("all");
  const [order, setOrder] = useState("bad");            // bad = weakest first · good = best first (recently listed always last)
  const [rel, setRel] = useState([]);                  // reliability filter (multi-select): S high · M medium · W low; none = all
  const [flash, setFlash] = useState(null);
  const [making, setMaking] = useState("");             // "" · "busy" · error text
  const listed = rows.filter(r => (show === "all" || r.cat === show) && (!rel.length || rel.includes(r.s.h))).sort((a, b) => order === "bad"
    ? PF_ORDER[a.cat] - PF_ORDER[b.cat] || (a.lt ?? 999) - (b.lt ?? 999)
    : (a.cat === "new") - (b.cat === "new") || PF_ORDER[b.cat] - PF_ORDER[a.cat] || (b.lt ?? -999) - (a.lt ?? -999));
  const jump = k => { setShow("all"); setFlash(k); setTimeout(() => { const el = document.getElementById(`pf-card-${k}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60); setTimeout(() => setFlash(null), 1800); };
  const plural = n => `${n} stock${n === 1 ? "" : "s"}`;
  const clearAll = <>{confirmClear
    ? <span className="pf-clr">Remove all {symbols.length}? <button type="button" onClick={() => { setSymbols([]); setConfirmClear(false); setStage("build"); }}>Yes, clear</button><button type="button" onClick={() => setConfirmClear(false)}>Cancel</button></span>
    : <button type="button" className="pf-clrbtn" onClick={() => setConfirmClear(true)}>Clear all</button>}</>;
  const brand = <div className="px-eyebrow"><span className="ai-spark">✦</span> Hyperplane AI · Portfolio Analyser <span>by QuantFriday</span></div>;
  const lock = <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2"/></svg>;
  const search = <StockSearch stocks={data.stocks} onPick={add} added={added} keepOpen placeholder="Type a stock name or ticker to add it"/>;
  const privacy = <div className="pf-priv"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
    <span><b>Private to you.</b> Your stock list is visible only to you, the account holder. It is never visible to other users or to the admin, as per SEBI norms. We take the privacy of your investments seriously.</span></div>;

  if (stage === "build" || !symbols.length) return (
    <div className="pf">
      <section className="card pf-start">
        <div className="pf-sl">
          {brand}
          <h1>Know where your portfolio <span>stands today</span></h1>
          <p className="pf-lead">Add the stocks you own. Hyperplane AI checks each one and puts it in a clear colour group,
            with a simple reason for every stock. No quantities, no prices, no spreadsheets.</p>
          <div className="pf-add">{search}</div>
          <div className="pf-build">
            <div className="pf-bhead"><b>Your list</b><span className="dim">{plural(symbols.length)}{status ? ` · ${status}` : ""}</span>{symbols.length > 0 && clearAll}</div>
            {symbols.length ? <div className="pf-blist pf-scroll">{symbols.map((k, i) => (
              <div key={k} className="pf-bi"><span className="pf-bn">{i + 1}</span><b className="mono">{k}</b><span className="pf-bname">{bySym[k] ? bySym[k].n : "not in today's data"}</span>
                <button type="button" onClick={() => remove(k)} aria-label={`Remove ${k}`} title={`Remove ${k}`}>✕</button></div>))}</div>
              : <div className="pf-bempty">Your list is empty. Type a stock name or ticker above to add your first stock.</div>}
            <button type="button" className="pf-go" disabled={!symbols.length} onClick={() => { setStage("result"); window.scrollTo(0, 0); }}>
              Analyse my portfolio{symbols.length ? ` (${symbols.length})` : ""}</button>
          </div>
        </div>
        <aside className="pf-sr">
          <h3>How it works</h3>
          <div className="pf-steps">
            <div className="pf-step"><b>1</b><span><strong>Add your stocks</strong>Type a name or ticker. Add as many as you like.</span></div>
            <div className="pf-step"><b>2</b><span><strong>Press Analyse</strong>Hyperplane AI reads the trend of every stock in a moment.</span></div>
            <div className="pf-step"><b>3</b><span><strong>See the full picture</strong>Every stock gets a colour and the reasons behind it.</span></div>
          </div>
          <h3>What the colours mean</h3>
          <div className="pf-key">{PF_CATS.map(([k, l, t]) => <div key={k} className={t}><i/>{l}</div>)}</div>
          <h3>Your privacy</h3>
          {privacy}
          <div className="pf-trust"><span className="ai-spark">✦</span><span>Built on Hyperplane's own quant algorithms.</span></div>
        </aside>
      </section>
    </div>
  );

  const KIND = { bad: "Needs attention", mid: "Mixed", good: "Healthy", side: "Too new" };
  const ranked = rows.filter(r => r.cat !== "new" && r.lt != null).sort((a, b) => b.lt - a.lt);
  const secN = {}; rows.forEach(r => { secN[r.s.sec] = (secN[r.s.sec] || 0) + 1; });
  const [topSec, topN] = Object.entries(secN).sort((a, b) => b[1] - a[1])[0] || ["", 0];
  const topPct = rows.length ? Math.round(topN / rows.length * 100) : 0, nSec = Object.keys(secN).length;
  const capN = ["Large", "Mid", "Small"].map(c => [c, rows.filter(r => r.s.cap === c).length]).filter(c => c[1]);
  const facts = ranked.length ? [
    ["Strongest", `${ranked[0].s.s} ${signed(ranked[0].lt)}%`, tc(ranked[0].lt)],
    ["Weakest", `${ranked[ranked.length - 1].s.s} ${signed(ranked[ranked.length - 1].lt)}%`, tc(ranked[ranked.length - 1].lt)],
    ["Spread", `${nSec} sector${nSec === 1 ? "" : "s"} · top ${topPct}%`, rows.length >= 4 && topPct >= 40 ? "c-mid" : "c-good",
      `Your ${rows.length} stocks are spread across ${nSec} sector${nSec === 1 ? "" : "s"}. The largest, ${topSec}, holds ${topN} of them (${topPct}%).`
      + ` When one sector holds 40% or more of your stocks, a bad phase for that sector hits a big part of the portfolio.`
      + (capN.length ? ` By company size: ${capN.map(([c, n]) => `${c} cap ${n}`).join(", ")}.` : "") + " Every stock counts equally (no quantities)."],
    ["Low reliability", `${rows.filter(r => r.s.h === "W").length} of ${rows.length}`, rows.some(r => r.s.h === "W") ? "c-bad" : "c-good"],
  ] : [];
  return (
    <div className="pf px">
      <header className="px-head">
        <div className="px-ht">
          {brand}
          <h1>Your portfolio</h1>
          <div className="px-meta">{plural(symbols.length)} · Data as of {fmtDT(data.as_of)}{status ? ` · ${status}` : ""}</div>
        </div>
        <div className="px-actions">
          <div className="px-search"><StockSearch stocks={data.stocks} onPick={add} added={added} keepOpen placeholder="Add a stock: name or ticker"/></div>
          <button type="button" className="px-btn" onClick={() => { setStage("build"); window.scrollTo(0, 0); }}>Edit list</button>
          {sum && <button type="button" className="px-btn primary pf-dl" disabled={making === "busy"} onClick={() => {
            setMaking("busy");
            import("./report.js").then(({ downloadReport }) => { downloadReport(reportModel(rows, sum, data, me)); setMaking(""); })
              .catch(e => setMaking(`Could not make the report: ${e.message || e}`));
          }}><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {making === "busy" ? "Preparing…" : "Download report"}</button>}
        </div>
      </header>
      <div className="px-privacy">{lock}<span><b>Private to you.</b> Your stock list is visible only to you, the account holder. It is never visible to other users or to the admin, as per SEBI norms. We take the privacy of your investments seriously.</span></div>
      {making && making !== "busy" && <div className="pf-miss">{making}</div>}
      {missing.length > 0 && <div className="pf-miss">Not in today's data: {missing.join(", ")}. They stay in your list and are checked again when they appear.</div>}

      {sum && <>
        <section className="px-card px-strip">
          <div className="px-sg"><TrendGauge v={sum.avg} size={150} caption={false}/></div>
          <div className="px-sm2">
            <div className="px-label">Current strength of the portfolio <Info text="The average strength of your stocks that have enough history. It uses each stock's own data only. Right of 0 means moving up, left of 0 means moving down."/></div>
            <div className="px-sfacts">
              <div className="px-sv"><b className={tc(sum.avg)}>{sum.avg == null ? "No data" : <>{signed(sum.avg)}<small>%</small></>}</b><span className={tc(sum.avg)}>{trendWordOf(sum.avg)}</span></div>
              <dl className="px-facts">{facts.map(([k, v, c, tip]) => <div key={k}><dt>{k}{tip && <Info text={tip}/>}</dt><dd className={c}>{v}</dd></div>)}</dl>
            </div>
          </div>
          <div className="px-smix">
            <div className="px-label">How your {rows.length} stocks are split</div>
            <div className="px-split">{PF_CATS.map(([k, , tone]) => sum.counts[k] ? <span key={k} className={tone} style={{ flex: sum.counts[k] }} title={`${PF_CAT[k][1]}: ${sum.counts[k]}`}/> : null)}</div>
            <div className="px-splitl">{PF_CATS.map(([k, label, tone]) => <div key={k} className={sum.counts[k] ? "" : "zero"}><i className={tone}/><span>{label}</span><b className="px-num">{sum.counts[k]}</b></div>)}</div>
          </div>
        </section>

        <section className="px-row2">
          <div className="px-card px-sumc">
            <div className="px-label"><span className="ai-spark">✦</span> Hyperplane AI summary <Info text="Built on Hyperplane's own quant algorithms: fixed rules on our trend data. No outside AI service is used and it never makes up a number. For information only, not investment advice."/></div>
            <div className="px-headline"><span className={`px-pill ${sum.tone}`}><i/>{KIND[sum.tone]}</span><h2>{sum.title}</h2></div>
            <ul className="px-points">{sum.lines.map(([t, txt], i) => <li key={i} className={`pl-${t}`}>{txt}</li>)}</ul>
          </div>
          <TrendMap rows={rows} onPick={jump}/>
        </section>

        <section className="px-card px-hold">
          <div className="px-ch">
            <div><h3>Holdings</h3><p>{listed.length} of {rows.length} stocks · every stock with its strength and the reasons in plain words</p></div>
            <div className="px-tools">
              <div className="px-seg" role="group" aria-label="Reliability">
                <span className="px-segl">Reliability <Info wide text={<>
                  <b>Reliability</b> comes from the stock's whole price history. It tells you how safely the stock has behaved in the past, not how strong it is today.
                  <br/><br/><b>Low:</b> it once fell more than 70% from its highest price. That means more risk, so Hyperplane AI always puts it in Look at first.
                  <br/><b>Medium:</b> it is more than 50% below its highest price, or lower than it was 5 years ago.
                  <br/><b>High:</b> it has stayed close to its highest price over the years. The steadiest history.
                </>}/></span>
                {[["S", "High"], ["M", "Medium"], ["W", "Low"]].map(([k, l]) => {
                  const n = rows.filter(r => r.s.h === k).length, on = rel.includes(k);
                  return <button key={k} type="button" role="checkbox" aria-checked={on} disabled={!n} className={on ? "on" : ""}
                    onClick={() => setRel(on ? rel.filter(x => x !== k) : [...rel, k])}>{l} <b>{n}</b></button>; })}
              </div>
              <div className="px-seg" role="radiogroup" aria-label="Sort">
                <span className="px-segl">Sort</span>
                {[["bad", "Weakest first"], ["good", "Best first"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={order === k} className={order === k ? "on" : ""} onClick={() => setOrder(k)}>{l}</button>)}
              </div>
            </div>
          </div>
          <div className="px-split px-split2">{PF_CATS.map(([k, , t]) => sum.counts[k] ? <span key={k} className={t} style={{ flex: sum.counts[k] }}/> : null)}</div>
          <div className="px-tabs" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={show === "all"} className={`px-tab all ${show === "all" ? "on" : ""}`} onClick={() => setShow("all")}>
              <span className="px-tl"><i/>All stocks</span><b className="px-num">{rows.length}</b><small>100% of portfolio</small></button>
            {PF_CATS.map(([k, label, t]) => (
              <button key={k} type="button" role="tab" aria-selected={show === k} disabled={!sum.counts[k]} className={`px-tab ${t} ${show === k ? "on" : ""}`} onClick={() => setShow(show === k ? "all" : k)}>
                <span className="px-tl"><i/>{label}</span>
                <b className="px-num">{sum.counts[k]}</b>
                <small>{rows.length ? Math.round(sum.counts[k] / rows.length * 100) : 0}% of portfolio</small>
              </button>))}
          </div>
          {show !== "all" && <p className="px-tdesc"><i className={PF_CAT[show][2]}/>{PF_CAT[show][3]}</p>}
          {!listed.length && <p className="px-tdesc">No stock matches these filters.</p>}
          <div className="px-list">{listed.map(r => <HoldingItem key={r.s.s} r={r} flash={flash === r.s.s}/>)}</div>
        </section>
        <div className="sv-foot dim">Data as of {fmtDT(data.as_of)} · Hyperplane AI by QuantFriday · For education only, not investment advice.</div>
      </>}
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
  const [face, setFaceRaw] = useState(() => { try { const f = localStorage.getItem("qf_face"); return f === "simple" || f === "portfolio" ? f : "research"; } catch { return "research"; } });
  const setFace = f => { setFaceRaw(f); setView("tower"); try { localStorage.setItem("qf_face", f); } catch { /* storage blocked */ } window.scrollTo(0, 0); };
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
          {[["research", "Research view"], ["simple", "Simplified view (AI Mode)"], ["portfolio", "AI Portfolio Analyser"]].map(([k, l]) => (
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
      {view === "tower" && face === "portfolio" && (data && pf != null ? <PortfolioView data={data} symbols={pf} setSymbols={setPf} status={pfStatus} me={me}/>
        : <div className="card empty">{err || "Loading…"}</div>)}
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
.pf{max-width:1260px;margin:14px auto 0;display:flex;flex-direction:column;gap:12px}
.pf{display:flex;flex-direction:column;gap:16px}
/* AI Portfolio — one design language (owner, 2026-10-17: clean fintech + a touch of institutional research):
   solid surfaces, 1px borders, 14px corners, Inter with tabular numbers, colour only for status. */
.pf .c-good,.inv .c-good{color:var(--long)}.pf .c-bad,.inv .c-bad{color:var(--short)}.pf .c-mid,.inv .c-mid{color:var(--mixed)}.pf .c-side,.inv .c-side{color:var(--t2)}
.inv{margin-top:12px;padding:14px 18px;display:flex;flex-direction:column;gap:10px;border:1px solid var(--b1);border-radius:12px;background:linear-gradient(180deg,var(--adim),transparent 60%),var(--s2)}
.px-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.px-label{display:flex;align-items:center;gap:6px;font:600 11px var(--sans);letter-spacing:.07em;text-transform:uppercase;color:var(--t3)}
.px-card{background:var(--s1);border:1px solid var(--b1);border-radius:14px;box-shadow:0 1px 2px rgba(15,27,45,.04),0 8px 24px -18px rgba(15,27,45,.25)}
.px-na{color:var(--t3);font-weight:500}
.px-pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;font:600 12px var(--sans);white-space:nowrap;background:rgba(139,151,173,.14);color:var(--t2)}
.px-pill i{width:6px;height:6px;border-radius:50%;background:currentColor}
.px-pill.good{background:var(--longd);color:var(--long)}.px-pill.mid{background:var(--mixedd);color:var(--mixed)}.px-pill.bad{background:var(--shortd);color:var(--short)}
.px-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:8px;border:1px solid var(--b1);color:var(--t2);font:500 12px var(--sans);white-space:nowrap}
.px-chip i{width:7px;height:7px;border-radius:50%;background:#8b97ad}.px-chip i:not([class]),.px-chip i[class=""]{display:none}
.px-chip i.good,.px-legend i.good,.px-splitl i.good,.px-seg i.good,.px-rel i.good{background:var(--long)}
.px-chip i.mid,.px-legend i.mid,.px-splitl i.mid,.px-seg i.mid,.px-rel i.mid{background:var(--mixed)}
.px-chip i.bad,.px-legend i.bad,.px-splitl i.bad,.px-seg i.bad,.px-rel i.bad{background:var(--short)}
.px-legend i.side,.px-splitl i.side,.px-seg i.side{background:#8b97ad}
.px-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:40px;padding:0 16px;border-radius:10px;border:1px solid var(--b2);background:var(--s1);color:var(--t1);font:600 13.5px var(--sans);cursor:pointer;white-space:nowrap}
.px-btn:hover{border-color:var(--acc)}
.px-btn.primary{background:var(--acc);border-color:var(--acc);color:var(--on-acc)}.px-btn.primary:hover{filter:brightness(1.06)}.px-btn:disabled{opacity:.6;cursor:progress}
.px-eyebrow{display:flex;align-items:center;gap:6px;font:600 12px var(--sans);letter-spacing:.04em;color:var(--acc)}.px-eyebrow span:last-child{color:var(--t3);font-weight:500}
/* thin scroller: slim at rest, wider and easy to grab on hover */
.pf-scroll{overflow-y:auto;overscroll-behavior:contain}
.pf-scroll::-webkit-scrollbar{width:10px}.pf-scroll::-webkit-scrollbar-track{background:transparent}
.pf-scroll::-webkit-scrollbar-thumb{background-color:var(--b2);border:3px solid transparent;background-clip:padding-box;border-radius:10px}
.pf-scroll:hover::-webkit-scrollbar-thumb{background-color:var(--t3);border-width:1px}
.pf-scroll::-webkit-scrollbar-thumb:hover,.pf-scroll::-webkit-scrollbar-thumb:active{background-color:var(--acc)}
@supports not selector(::-webkit-scrollbar){.pf-scroll{scrollbar-width:thin;scrollbar-color:var(--b2) transparent}}
.pf-miss{font-size:13px;color:var(--mixed);padding:10px 14px;border:1px solid var(--mixedd);background:var(--mixedd);border-radius:10px}

/* ── start page ── */
.pf-start{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr);padding:0;overflow:hidden;border-radius:14px}
.pf-sl{padding:34px 36px 32px}
.pf-sl .px-eyebrow{margin-bottom:14px}
.pf-sl h1{font:700 34px/1.15 var(--sans);letter-spacing:-.025em;margin:0 0 12px;color:var(--t1)}.pf-sl h1 span{color:var(--acc)}
.pf-lead{font-size:15.5px;line-height:1.65;color:var(--t2);margin:0 0 22px;max-width:620px}
.pf-add{width:100%}
.pf-build{margin-top:18px}
.pf-bhead{display:flex;align-items:center;gap:10px;margin-bottom:8px}.pf-bhead b{font-size:14px;font-weight:650}.pf-bhead .pf-clrbtn,.pf-bhead .pf-clr{margin-left:auto}
.pf-blist{display:flex;flex-direction:column;border:1px solid var(--b1);border-radius:12px;max-height:300px;background:var(--s1)}
.pf-bi{display:grid;grid-template-columns:28px 120px minmax(0,1fr) 28px;gap:10px;align-items:center;padding:9px 14px;border-bottom:1px solid var(--b1);font-size:13.5px}
.pf-bi:last-child{border-bottom:0}.pf-bn{color:var(--t3);font-size:12px;font-variant-numeric:tabular-nums}.pf-bi b{color:var(--t1);font:650 13px var(--sans);letter-spacing:.02em}
.pf-bname{color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf-bi button{border:1px solid transparent;background:none;color:var(--t3);border-radius:8px;width:28px;height:28px;font-size:11px;cursor:pointer}.pf-bi button:hover{color:var(--short);border-color:var(--b2)}
.pf-bempty{padding:24px 16px;border:1px dashed var(--b2);border-radius:12px;color:var(--t3);font-size:13.5px;text-align:center}
.pf-go{display:block;width:100%;margin-top:16px;height:48px;border:0;border-radius:12px;font:650 15px var(--sans);cursor:pointer;color:var(--on-acc);background:var(--acc)}
.pf-go:hover{filter:brightness(1.06)}.pf-go:disabled{opacity:.4;cursor:default;filter:none}
.pf-clrbtn,.pf-clr button{border:1px solid var(--b2);background:var(--s1);color:var(--t2);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer}
.pf-clr{font-size:12px;color:var(--t2);display:inline-flex;gap:6px;align-items:center}.pf-clr button:first-of-type{color:var(--short);border-color:var(--short)}
.pf-sr{padding:32px 28px;border-left:1px solid var(--b1);background:var(--s2);display:flex;flex-direction:column;gap:14px}
.pf-sr h3{margin:0;font:600 11px var(--sans);letter-spacing:.07em;text-transform:uppercase;color:var(--t3)}
.pf-steps{display:flex;flex-direction:column;gap:16px;margin-bottom:6px}
.pf-step{display:grid;grid-template-columns:32px minmax(0,1fr);gap:12px;align-items:start}
.pf-step b{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font:700 13px var(--sans);color:var(--acc);background:var(--adim);border:1px solid var(--accb)}
.pf-step strong{display:block;font-size:14.5px;font-weight:650;color:var(--t1);margin-bottom:2px}.pf-step span{font-size:13px;color:var(--t2);line-height:1.5}
.pf-key{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pf-key div{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:550;padding:9px 11px;border-radius:10px;background:var(--s1);border:1px solid var(--b1)}
.pf-key i{width:8px;height:8px;border-radius:50%;background:#8b97ad;flex-shrink:0}.pf-key .good i{background:var(--long)}.pf-key .mid i{background:var(--mixed)}.pf-key .bad i{background:var(--short)}
.pf-priv{display:flex;align-items:flex-start;gap:8px;padding:11px 12px;border-radius:10px;font-size:12.5px;line-height:1.55;color:var(--t2);background:var(--s1);border:1px solid var(--b1)}
.pf-priv svg{flex-shrink:0;margin-top:2px;color:var(--long)}.pf-priv b{color:var(--t1)}
.pf-trust{margin-top:auto;display:flex;gap:8px;font-size:12px;color:var(--t3);line-height:1.5;padding-top:10px;border-top:1px solid var(--b1)}

/* ── result page ── */
.px-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:6px 2px 0}
.px-ht h1{font:700 28px/1.15 var(--sans);letter-spacing:-.025em;margin:6px 0 4px;color:var(--t1)}
.px-meta{font-size:13px;color:var(--t2)}
.px-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.px-search{width:380px}.px-search input{height:40px}
.px-privacy{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;line-height:1.5;color:var(--t3);padding:0 2px}
.px-privacy svg{flex-shrink:0;margin-top:2px;color:var(--long)}.px-privacy b{color:var(--t2);font-weight:600}
/* overview */
.px-strip{display:grid;grid-template-columns:auto minmax(0,1.25fr) minmax(0,1.3fr);gap:32px;align-items:center;padding:16px 28px}
.px-sg .gauge{display:block;margin:0}
.px-sm2{display:flex;flex-direction:column;gap:8px;min-width:0}.px-sm2 .px-sv{align-items:flex-start;margin:0}
.px-sfacts{display:flex;align-items:center;gap:28px}
.px-facts{display:grid;grid-template-columns:repeat(2,minmax(0,auto));gap:8px 26px;margin:0;padding-left:28px;border-left:1px solid var(--b1)}
.px-facts div{display:flex;flex-direction:column;gap:1px;min-width:0}
.px-facts dt{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--t3)}.px-facts dd{margin:0;font:650 13.5px var(--sans);color:var(--t1);white-space:nowrap;font-variant-numeric:tabular-nums}
.px-smix{display:flex;flex-direction:column;gap:10px;padding-left:32px;border-left:1px solid var(--b1)}.px-smix .px-splitl{margin-top:0;grid-template-columns:1fr 1fr;gap:6px 24px}.px-smix .px-splitl span{white-space:nowrap}
.px-sumc{padding:20px 24px;display:flex;flex-direction:column;gap:2px;min-width:0}
.px-headline{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:12px 0 10px}
.px-headline h2{margin:0;font:700 22px/1.25 var(--sans);letter-spacing:-.015em;color:var(--t1)}
.px-points{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.px-points{gap:9px}
.px-points li{position:relative;padding-left:20px;font-size:15px;line-height:1.55;color:var(--t1)}
.px-points li::before{content:"";position:absolute;left:3px;top:8px;width:7px;height:7px;border-radius:50%;background:#8b97ad}
.px-points li.pl-good::before{background:var(--long)}.px-points li.pl-mid::before{background:var(--mixed)}.px-points li.pl-bad::before{background:var(--short)}.px-points li.pl-info::before{background:var(--acc)}

.px-sv{display:flex;flex-direction:column;align-items:center;gap:2px;margin-bottom:18px}
.px-sv b{font:700 40px/1 var(--sans);letter-spacing:-.03em;font-variant-numeric:tabular-nums}.px-sv b small{font-size:20px;margin-left:1px}
.px-sv span{font:600 14px var(--sans)}
.px-split{display:flex;gap:3px;height:10px;border-radius:6px;overflow:hidden}
.px-split span{display:block;min-width:6px}.px-split .good{background:var(--long)}.px-split .mid{background:var(--mixed)}.px-split .bad{background:var(--short)}.px-split .side{background:#8b97ad}
.px-splitl{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin-top:12px;font-size:12.5px;color:var(--t2)}
.px-splitl div{display:flex;align-items:center;gap:8px}.px-splitl div.zero{opacity:.45}.px-splitl i{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.px-splitl b{margin-left:auto;color:var(--t1);font-weight:650}
/* row 2: colour groups | trend map */
.px-row2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:stretch}
.px-split2{margin:14px 20px 0;height:6px;gap:2px}
.px-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin-top:6px;border-bottom:1px solid var(--b1)}
.px-tab{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:12px 20px 14px;border:0;background:none;color:var(--t1);text-align:left;cursor:pointer;min-width:0}
.px-tab+.px-tab::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:1px;background:var(--b1)}
.px-tab:hover{background:var(--hover)}.px-tab:disabled{opacity:.45;cursor:default;background:none}
.px-tl{display:flex;align-items:center;gap:7px;font:600 12.5px var(--sans);color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.px-tl i{width:8px;height:8px;border-radius:50%;background:#8b97ad;flex-shrink:0}
.px-tab.good .px-tl i{background:var(--long)}.px-tab.mid .px-tl i{background:var(--mixed)}.px-tab.bad .px-tl i{background:var(--short)}
.px-tab b{font:700 26px/1.1 var(--sans);letter-spacing:-.02em}.px-tab small{font-size:11.5px;color:var(--t3)}
.px-tab.on::after{content:"";position:absolute;left:20px;right:20px;bottom:-1px;height:3px;border-radius:3px 3px 0 0;background:#8b97ad}
.px-tab.on.good::after{background:var(--long)}.px-tab.on.mid::after{background:var(--mixed)}.px-tab.on.bad::after{background:var(--short)}
.px-tab.on .px-tl{color:var(--t1)}.px-tab.all .px-tl i{background:var(--acc)}.px-tab.on.all::after{background:var(--acc)}
.px-tdesc{display:flex;align-items:center;gap:8px;margin:0;padding:12px 20px;font-size:12.5px;color:var(--t2)}
.px-tdesc i{width:6px;height:6px;border-radius:50%;background:#8b97ad;flex-shrink:0}.px-tdesc i.good{background:var(--long)}.px-tdesc i.mid{background:var(--mixed)}.px-tdesc i.bad{background:var(--short)}
.px-slist{flex:1;min-height:0;display:flex;flex-direction:column}
.px-sval{display:flex;align-items:center;justify-content:flex-end;gap:10px}.px-sval b{min-width:46px;text-align:right;font-weight:650;font-size:14px}
.px-ch{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.px-ch h3{margin:0;font:700 16px var(--sans);color:var(--t1)}.px-ch p{margin:3px 0 0;font-size:12.5px;color:var(--t3)}
.px-map{padding:18px 18px 12px;display:flex;flex-direction:column;gap:10px;min-width:0}
.px-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--t2)}.px-legend span{display:inline-flex;align-items:center;gap:6px}.px-legend i{width:8px;height:8px;border-radius:50%}
.pf-mapw{position:relative;flex:1;width:100%;min-width:0;min-height:300px;overflow:hidden}.pf-map{position:absolute;left:0;top:0;display:block}
.pf-mq{font:650 12px var(--sans)}.pf-max{stroke:var(--b2);stroke-width:1.2}.pf-mgrid{stroke:var(--b1);stroke-width:1;stroke-dasharray:3 4}.pf-mframe{fill:none;stroke:var(--b1);stroke-width:1}
.pf-mt{font:500 10.5px var(--sans);fill:var(--t3)}.pf-mt.b{font-weight:600}
.pf-ml{font:650 10.5px var(--sans);letter-spacing:.02em;fill:var(--t1);paint-order:stroke;stroke:var(--s1);stroke-width:3px}
.pf-dot{cursor:pointer}.pf-dot:hover circle{stroke:var(--acc)!important}
.px-foot{font-size:11.5px;color:var(--t3)}
/* row 3: holdings table */
.px-hold{padding:18px 0 4px}
.px-hold>.px-ch{padding:0 20px 14px}
.px-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.px-seg{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:var(--s2);border:1px solid var(--b1);flex-wrap:wrap}
.px-seg button{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:0;border-radius:8px;background:none;color:var(--t2);font:550 12.5px var(--sans);cursor:pointer;white-space:nowrap}
.px-seg button b{font-weight:650;color:var(--t3);font-variant-numeric:tabular-nums}
.px-seg button i{width:7px;height:7px;border-radius:50%}
.px-seg button.on{background:var(--s1);color:var(--t1);box-shadow:0 1px 2px rgba(15,27,45,.12),0 0 0 1px var(--b1)}.px-seg button.on b{color:var(--t1)}
.px-seg button:disabled{opacity:.4;cursor:default}
.px-segl{display:inline-flex;align-items:center;gap:5px;padding:0 6px 0 9px;font:600 11px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}
.px-list{display:flex;flex-direction:column}
.px-item{position:relative;display:grid;grid-template-columns:minmax(210px,.85fr) minmax(340px,1.15fr) minmax(0,1.3fr);gap:28px;padding:22px 24px 22px 28px;border-top:1px solid var(--b1)}
.px-item::before{content:"";position:absolute;left:0;top:18px;bottom:18px;width:4px;border-radius:0 3px 3px 0;background:#8b97ad}
.px-item.good::before{background:var(--long)}.px-item.mid::before{background:var(--mixed)}.px-item.bad::before{background:var(--short)}
.px-item.flash{background:var(--hover);box-shadow:inset 0 0 0 2px var(--accb)}
.px-who,.px-how,.px-whyc{display:flex;flex-direction:column;gap:10px;min-width:0}
.px-who{align-items:flex-start}
.px-name{display:flex;flex-direction:column;gap:3px;min-width:0;max-width:100%}
.px-name b{font:700 17px/1.25 var(--sans);letter-spacing:-.01em;color:var(--t1)}
.px-name em{font:650 12px var(--sans);font-style:normal;letter-spacing:.04em;color:var(--acc)}
.px-where{font-size:12.5px;color:var(--t3);line-height:1.4;margin-top:-4px}
.px-how{padding:0 2px}
.px-whyc{padding:16px 18px 14px;border-radius:12px;border:1px solid var(--b1);background:linear-gradient(180deg,var(--adim),transparent 55%),var(--s2)}
.px-aih{display:flex;align-items:center;gap:7px;font:650 11.5px var(--sans);letter-spacing:.07em;text-transform:uppercase}
.px-aih b{color:var(--acc);font-weight:700}.px-aih span:last-child{color:var(--t2)}.px-aih span:last-child::before{content:"·";margin-right:7px;color:var(--t3)}
.px-nd{display:inline-flex;align-items:center;gap:6px;font:600 14px var(--sans)}
.px-dbig{display:flex;align-items:baseline;gap:10px}.px-dbig b{font:700 30px/1 var(--sans);letter-spacing:-.02em;font-variant-numeric:tabular-nums}.px-dbig b small{font-size:16px}
.px-dbig span{font:600 14px var(--sans)}
.px-dbar .dbar-t{height:8px;border-radius:4px}
.px-tfs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.px-tf{display:flex;flex-direction:column;gap:4px;padding:10px 10px;border-radius:10px;background:var(--s1);border:1px solid var(--b1);min-width:0}
.px-tfv{font:700 18px var(--sans);font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:6px}.px-tfv.px-na{font-size:14px;font-weight:600}
.px-chips{display:flex;gap:6px;flex-wrap:wrap}
.px-kin{display:inline-block;margin-top:4px;padding:4px 7px;border-radius:6px;font:650 11.5px/1.25 var(--sans);background:rgba(139,151,173,.12);align-self:flex-start;max-width:100%}
.px-kin.c-good{background:var(--longd)}.px-kin.c-bad{background:var(--shortd)}.px-kin.px-na{font-weight:500}
.px-newnote{display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:10px;border:1px dashed var(--b2);font-size:13px;color:var(--t2);line-height:1.5}.px-newnote b{color:var(--t1)}
.px-why{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.px-why li{position:relative;padding-left:16px;font-size:14px;line-height:1.55;color:var(--t1)}
.px-why li::before{content:"";position:absolute;left:2px;top:9px;width:6px;height:6px;border-radius:50%;background:var(--t3)}
.px-backdrop{display:flex;flex-direction:column;gap:8px;width:100%;margin-top:4px;padding-top:12px;border-top:1px dashed var(--b2)}

@media (max-width:1180px){.px-item{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)}.px-whyc{grid-column:1/-1}}
@media (max-width:1000px){.px-row2,.pf-start{grid-template-columns:1fr}.pf-sr{border-left:0;border-top:1px solid var(--b1)}
  .px-strip{grid-template-columns:auto 1fr;gap:18px}.px-smix{grid-column:1/-1;padding-left:0;border-left:0;padding-top:14px;border-top:1px solid var(--b1)}.px-tabs{grid-template-columns:repeat(3,minmax(0,1fr))}
  .px-search{width:100%}.px-actions{width:100%}}
@media (max-width:760px){.px-item{grid-template-columns:1fr;gap:16px;padding:18px 16px 18px 20px}.px-hold>.px-ch{padding:0 14px 12px}}
@media (max-width:640px){.px-tabs{grid-template-columns:1fr 1fr}.px-tab:nth-child(odd)::before{display:none}.px-strip{padding:14px 16px}.px-smix .px-splitl{grid-template-columns:1fr 1fr}
  .px-sumc{padding:18px 16px}
  .px-headline h2{font-size:19px}.px-ht h1{font-size:24px}
  .pf-sl{padding:22px 16px}.pf-sl h1{font-size:26px}.pf-sr{padding:20px 16px}.pf-bi{grid-template-columns:24px 92px minmax(0,1fr) 28px}}
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
.info-pop.above{top:auto;bottom:calc(100% + 7px)}.info-pop.wide{width:min(400px,calc(100vw - 32px))}
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
