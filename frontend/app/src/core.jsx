// Hyperplane customer app — CORE: vocabulary, shared helpers and small shared components. Imported by the shell and
// by every application module (never by the admin dashboard).
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── icons (design system, owner 2026-11-03): Lucide line icons (https://lucide.dev, ISC licence) — no emoji or unicode
// glyphs as icons. currentColor; stroke per K4K: 12 px → 1 px on screen (2 units), larger → 1.5 units. Decorative unless
// a title is given.
const ICON_PATHS = {
  check: <path d="M20 6 9 17l-5-5"/>,
  x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
  plus: <><path d="M5 12h14"/><path d="M12 5v14"/></>,
  minus: <path d="M5 12h14"/>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
  alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
  info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></>,
  sparkles: <><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></>,
  eye: <><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>,
  lock: <><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  menu: <><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></>,
  star: <path d="M11.53 2.3a.53.53 0 0 1 .95 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.76a.53.53 0 0 1 .3.9l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0L6.4 21.01a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .3-.9l5.16-.76a2.12 2.12 0 0 0 1.6-1.16z"/>,
  bulb: <><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
  factory: <><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/></>,
  globe: <><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></>,
  layers: <><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></>,
  table: <><path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></>,
  copy: <><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></>,
  bubble: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/></>,
  list: <><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/></>,
  half: <><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/></>,
  diamond: <path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"/>,
  chart: <><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></>,
  percent: <><path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></>,
  search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
  share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/></>,
  swap: <><path d="M7 4 3 8l4 4"/><path d="M3 8h13"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8"/></>,
  edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
  trend: <><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></>,
  help: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></>,
};
export function Icon({ name, size = 16, className = "", title }) {
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={size <= 12 ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined} aria-label={title}>{ICON_PATHS[name]}</svg>);
}
// the "Hyperplane AI" mark (our purple) — beside AI-written content
export const AiSpark = ({ size = 12 }) => <span className="ai-spark" aria-hidden="true"><Icon name="sparkles" size={size}/></span>;
// a verdict's icon by its tone (combinedView): the colour comes from the tone, the word carries the meaning
export const TONE_ICON = { good: "check", warn: "alert", bad: "x", watch: "eye", mid: "half" };

// ─── vocabulary ──────────────────────────────────────────────────────────────
export const TFS = [["D","Daily","short term"],["W","Weekly","weeks"],["M","Monthly","months"],["Q","Quarterly","quarters"],["Y","Yearly","long term"]];
export const TF_NAME = { A:"Combined", ...Object.fromEntries(TFS.map(([k,l]) => [k,l])) };
export const SIZES = ["Large","Mid","Small","Others"];
export const TREND_CUT = 24;                       // |strength| below this = sideways (the server's Good / Weak cut)
export const foldText = t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const DISCLAIMER = "Hyperplane shows trend information for education only. It is not investment advice or a recommendation to buy or sell any security. Please do your own research or consult a SEBI-registered adviser before investing.";

export const idx = tf => "DWMQY".indexOf(tf);
export const dirTf = (s, i) => ({ G:1, W:-1, M:0 })[s.r[i]] ?? null;
export const dirVal = v => v == null ? null : v >= TREND_CUT ? 1 : v <= -TREND_CUT ? -1 : 0;
// Level words (owner, 2026-10-11): Weak 0–30 · Average 31–60 · Good 61–80 · Strong 81–100 on the rounded |value|.
// Stocks keep the sideways cut (|strength| < TREND_CUT); sector / industry use the same words on their 0–100% strength.
export const levelOf = v => { const a = Math.round(Math.abs(v)); return a > 80 ? "Strong" : a > 60 ? "Good" : a > 30 ? "Average" : "Weak"; };
export const strengthWord = a => levelOf(a);
export const aan = w => /^[aeiou]/i.test(w) ? "an" : "a";
export const focusOf = (s, tfs) => {                 // signed strength for the chosen timeframe(s)
  if (!tfs.length) return s.os;
  const v = tfs.map(t => s.sc[idx(t)]).filter(x => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
export const focusDir = (s, tfs) => tfs.length === 1 ? dirTf(s, idx(tfs[0])) : dirVal(focusOf(s, tfs));
export const isUp = (s, tfs) => tfs.length ? tfs.every(t => dirTf(s, idx(t)) === 1) : dirVal(s.os) === 1;
export const isDown = (s, tfs) => tfs.length ? tfs.every(t => dirTf(s, idx(t)) === -1) : dirVal(s.os) === -1;
export const isBi = (s, tfs) => { const set = (tfs.length >= 2 ? tfs : "DWMQY".split("")).map(t => dirTf(s, idx(t))); return set.includes(1) && set.includes(-1); };
export const sizeOf = s => s.cap || "Others";
// One label per stock for the chosen timeframe(s): one timeframe = its direction; several / Combined = bidirectional
// when they disagree (some up, some down), otherwise the direction of the average.
export const categoryOf = (s, tfs) => {
  if (tfs.length === 1) { const d = dirTf(s, idx(tfs[0])); return d === 1 ? "up" : d === -1 ? "down" : d === 0 ? "side" : null; }
  if (isBi(s, tfs)) return "bi";
  const d = dirVal(focusOf(s, tfs)); return d === 1 ? "up" : d === -1 ? "down" : d === 0 ? "side" : null;
};
export const BG = [["S", "Strong", "up"], ["M", "Moderate", "side"], ["W", "Weak", "down"]];
export const BG_NAME = Object.fromEntries(BG.map(([k, l]) => [k, l]));
export const CAT = { up:["▲ Uptrend","up"], down:["▼ Downtrend","down"], bi:["⇅ Bidirectional","bi"], side:["◆ Sideways","side"] };
export const pct = v => v == null ? "—" : `${Math.abs(v)}%`;
export const strengthLabel = s => s >= 70 ? "Very strong" : s >= 55 ? "Strong" : s >= 45 ? "Neutral" : s >= 30 ? "Weak" : "Very weak";
export const strengthCls = s => s >= 55 ? "up" : s >= 45 ? "side" : "down";
export const PALETTE = ["#00e5ff","#00c896","#ffaa00","#ff4454","#a259ff","#38bdf8","#f472b6","#2dd4bf","#fb923c","#a3e635","#818cf8","#facc15","#34d399","#c084fc","#fb7185","#60a5fa"];
export const colorOf = name => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

// Past data (round 16, permission research:history): the day picked in the shell goes with every request of the app, so each
// application's server answer uses that day's data ("X-HP-Day: YYYY-MM-DD.open|end"); the server checks the permission.
let DAY = null;
export const setApiDay = sel => { DAY = sel ? `${sel.date}.${sel.part}` : null; };
export const apiDay = () => DAY;
export async function api(path, opts = {}) {
  const init = { credentials:"same-origin", ...opts, headers:{ ...(opts.headers || {}) } };
  if (DAY && path.startsWith("/app/api/") && !path.startsWith("/app/api/history") && !path.startsWith("/app/api/public/")) init.headers["X-HP-Day"] = DAY;
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers["content-type"] = "application/json"; }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new Error(typeof (data && data.detail) === "string" && data.detail ? data.detail : "Something went wrong — please try again"); e.status = res.status;
    e.field = res.headers.get("x-field") || "";                           // sign-up: which box the message belongs to
    e.verify = res.headers.get("x-verify") === "1";                     // sign-in refused: the email is not confirmed yet
    e.noAccess = res.headers.get("x-access") === "denied";          // an application outside the customer's roles
    throw e;
  }
  return data;
}
// Adoption report (Admin): a key action in an application — fire and forget, never blocks or breaks the page; the same
// action is sent at most once every 30 seconds (the server also caps it per day)
const _sent = {};
export function trackAction(module, action) {
  const k = `${module}:${action}`, now = Date.now();
  if (_sent[k] && now - _sent[k] < 30000) return;
  _sent[k] = now;
  api("/app/api/activity", { method: "POST", json: { module, kind: "action", action } }).catch(() => { /* never matters to the customer */ });
}
// Helpdesk ready-made requests (owner, 2026-11-03: "the template in the predefined queries, like extend the limit of the
// portfolio … in one click it can send to the admin"): shown in New query; the builder sends the limit one directly
export const HD_LIMIT_SUBJECT = "Increase my portfolio limit";
export const HD_TEMPLATES = [
  { key: "limit", label: "Increase my portfolio limit", subject: HD_LIMIT_SUBJECT, severity: "low",
    body: "Hello QuantFriday team,\n\nPlease increase my AI Portfolio Builder limit.\nAmount I would like to invest: ₹\nNumber of stocks: \n\nThank you." },
  { key: "renew", label: "Renew my access", subject: "Renew my access", severity: "low",
    body: "Hello QuantFriday team,\n\nPlease renew my access to Hyperplane.\n\nThank you." },
  { key: "app", label: "Add an application", subject: "Add an application to my account", severity: "low",
    body: "Hello QuantFriday team,\n\nPlease add this application to my account: \n\nThank you." },
  { key: "email", label: "Change my email", subject: "Change my sign-in email", severity: "low",
    body: "Hello QuantFriday team,\n\nPlease change my sign-in email to: \n\nThank you." },
  { key: "data", label: "Report wrong data", subject: "A stock's data looks wrong", severity: "medium",
    body: "Hello QuantFriday team,\n\nThe data for this stock looks wrong.\nStock: \nWhere I saw it: \nWhat looks wrong: \n\nThank you." },
];
export const fmtDT = iso => iso ? new Date(iso).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata" }) : "—";
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); const ok = document.execCommand("copy"); a.remove(); return ok; }
}

export function summaryOf(s) {
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
export const groupState = g => !g ? null : Math.round(g.st) > 60 ? "up" : Math.round(g.st) <= 30 ? "down" : "side";
export const groupWord = g => levelOf(g.st).toLowerCase();
export function combinedView(od, bi, sec, ind, os = null, stretched = false) {
  const gs = [sec && ["sector", groupState(sec)], ind && ["industry", groupState(ind)]].filter(Boolean);
  const weak = gs.filter(([, st]) => st === "down").map(([n]) => n), strong = gs.length > 0 && gs.every(([, st]) => st === "up");
  const which = weak.join(" and ");
  let v;
  if (od === 1 && stretched) v = ["warn", "Overheated — don't chase", "The stock has run up 3x or more in about a year. Even if the trend looks strong, prices this stretched often fall back sharply — wait for it to cool down and build a base."];
  else if (od === 1 && strong && os != null && Math.round(Math.abs(os)) <= 60) v = ["watch", "Watch — stock still building", "Its sector and industry are strong, but the stock's own trend is only average. Keep it on your watch list and act when it turns strong."];
  else if (od === 1) v = strong ? ["good", "Best case — with the tide", "Strong stock in a strong industry and a strong sector. Everything points the same way."]
    : weak.length ? ["warn", "Careful — against its group", `The stock is strong, but its ${which} ${weak.length > 1 ? "are" : "is"} weak. It is moving against its own group — avoid or wait (golden rule 2).`]
    : ["mid", "Okay — group is only average", "The stock is strong, but its group is only average. Candidates in stronger sectors / industries are better."];
  else if (od === -1) v = strong ? ["watch", "Watch only — a laggard", "A weak stock inside a strong group. It may catch up later — or keep lagging. Not a buy yet."]
    : ["bad", "Avoid for buying", weak.length ? `A weak stock in a weak ${which}. Nothing is supporting it.` : "The stock is in a downtrend and its group is not helping."];
  else if (od === 0) v = ["mid", "No edge yet", strong ? "No clear trend yet, but its group is strong — watch for the stock to pick a direction." : "No clear trend in the stock — there are better candidates."];
  else return null;
  if (bi && v[0] === "good") v = ["mid", "Good group, mixed timeframes", "Its sector and industry are strong, but the stock's timeframes disagree — wait for them to line up (golden rule 3)."];
  return { tone: v[0], title: v[1], text: v[2], icon: TONE_ICON[v[0]] };
}

// ─── Regime analyser (owner, 2026-10-31: "without the trend nothing is great") ───
// The server decides it: the weekly regime sets which direction counts on EVERY timeframe; a strength pointing against it
// is already squeezed into sideways there (s.rh = those timeframes of s.sc, s.rz = of the AI Portfolio view). The daily
// regime only warns. s.rg = [weekly, daily] 1 up · −1 down · 0 flat; s.rx = the weekly regime flipped since the previous
// trading day (data.rd). This only turns those codes into words — customers never see how the regime is measured.
export const TF_FULL = { D:"Daily", W:"Weekly", M:"Monthly", Q:"Quarterly", Y:"Yearly" };
// Customer wording (owner, 2026-10-31): plain and professional. The regime is an uptrend or a downtrend; a daily reading
// against it = "has started fading recently". Never "weekly" / "daily" regime, never the indicator's name.
// lt = the AI Portfolio's LONG-TERM regime (owner, 2026-10-31): s.rp = [monthly, weekly], s.rpx = monthly flip, s.rz = held
export function regimeOf(s, rd, lt = false) {
  const rg = s && (lt ? s.rp : s.rg);
  if (!rg) return null;
  const [w, d] = rg, rx = lt ? s.rpx : s.rx, since = rd ? ` since ${fmtDay(rd)}` : "";
  const R = lt ? "long-term regime" : "regime", RC = lt ? "long-term regime" : "current regime", wait = lt ? "weeks" : "days";
  // [key, tone, icon, label, short label, what the regime is]
  const L = t => lt ? `Long-term regime ${t}` : `Regime ${t}`;
  const r = rx === -1 ? ["sdn", "bad", "▼", L("changed to down"), "Changed to down", `The ${R} of the stock has changed from up to down${since}.`]
    : rx === 1 ? ["sup", "good", "▲", L("changed to up"), "Changed to up", `The ${R} of the stock has changed from down to up${since}.`]
    : w === 1 && d === -1 ? ["dn-soon", "mid", "↘", L("turning down"), "Turning down", `The ${RC} of the stock is up, but it has started changing from up to down. A complete change to down is expected soon.`]
    : w === -1 && d === 1 ? ["up-soon", "mid", "↗", L("turning up (not confirmed)"), "Turning up?", `The ${RC} of the stock is down. Recently it has started changing towards up, but this is not confirmed yet and it can turn down again at any time. Monitor it for a few more ${wait} for a complete change.`]
    : w === 1 ? ["up", "good", "▲", L("up"), "Up", `The ${RC} of the stock is up.`]
    : w === -1 ? ["down", "bad", "▼", L("down"), "Down", `The ${RC} of the stock is down.`]
    : ["flat", "side", "◆", L("not clear"), "Not clear", `The ${RC} of the stock is not clear.`];
  const [key, tone, icon, word, short, base] = r;
  return { key, tone, icon, word, short, base, text: base, w, d, held: ((lt ? s.rz : s.rh) || "").split("").filter(Boolean).map(k => TF_FULL[k]) };
}
// What the regime means for the stock's OWN direction (1 rising · 0 sideways · −1 falling) — every combination
export const RG_STORY = {
  up:        { 1: "The stock is rising along with it, which is a healthy sign.",
               0: "The stock itself is moving sideways for now. A rise from here would have the regime behind it.",
              [-1]: "The stock itself is still weak. Wait for it to pick up." },
  "dn-soon": { 1: "The stock is still rising, but this rise may not last. Protect your gains.",
               0: "The stock has already lost its strength. If the regime turns down fully, it may start to fall.",
              [-1]: "The stock is already weak, which supports the change to down." },
  down:      { 1: "Its rise is not trusted until the regime turns up.",
               0: "The stock is moving sideways. Any rise is not trusted until the regime turns up.",
              [-1]: "The stock is falling along with it. Stay away until the regime turns up." },
  "up-soon": { 1: "Its rise is not trusted until the change is confirmed.",
               0: "The stock is trying to steady itself. Wait for the change to be confirmed.",
              [-1]: "The stock is still falling, so do not act yet." },
  sdn:       { 1: "Its rise is not trusted until the regime turns up again.",
               0: "Any rise is not trusted until the regime turns up again.",
              [-1]: "The stock has started falling with it. Avoid fresh buying." },
  sup:       { 1: "The stock has started rising with it.",
               0: "A rise from here would have the regime behind it.",
              [-1]: "The stock itself is still weak. Wait for it to pick up." },
};
export const regimeStory = (r, dir) => (r && dir != null && RG_STORY[r.key] && RG_STORY[r.key][dir]) || "";
export const regimeFull = (r, dir) => [r.base, regimeStory(r, dir)].filter(Boolean).join(" ");
// Research table "Regime" filter: by the regime, or the stocks whose regime is fading / has turned
export const RG_FILTER = [["all", "All regimes"], ["up", "▲ Regime up"], ["down", "▼ Regime down"],
  ["sdn", "↘ Turning or changed to down"], ["sup", "↗ Turning or changed to up"]];
// the turning / changed filters follow the label's own order (a change since the previous day comes first), so the rows
// they show always carry the matching label (e.g. "changed to up" today with a short-term dip is not "turning down")
export const regimeMatch = (s, k) => k === "all" || (!!s.rg && (k === "up" ? s.rg[0] === 1 : k === "down" ? s.rg[0] === -1
  : (k === "sdn" ? ["sdn", "dn-soon"] : ["sup", "up-soon"]).includes(regimeOf(s).key)));
export const RG_INFO = "Regime analyser: tells you whether the current regime of the stock is up or down, and when it starts changing. A trend that goes against the regime is not trusted yet, so it is shown as Sideways.";
export const RegimeTag = ({ r, sm }) => !r ? <span className="dim">—</span>
  : <span className={`rgtag ${r.tone} ${sm ? "sm" : ""}`} title={`${r.word}. ${r.text}`}><i aria-hidden="true">{r.icon}</i>{sm ? r.short : r.word}</span>;
// stock card and AI Mode: the regime in one line and the timeframes it holds back
export function RegimeBox({ s, rd, strip = false }) {
  const r = regimeOf(s, rd);
  if (!r) return null;
  return (
    <div className={`rgbox ${r.tone} ${strip ? "strip" : ""}`} id="regime-box">
      <div className="rg-h"><span className="lbl">Regime analyser <Info text={RG_INFO}/></span><RegimeTag r={r}/></div>
      <p className="rg-t">{regimeFull(r, dirVal(s.os))}</p>
    </div>
  );
}

// ─── theme (light default for customers — owner, 2026-10-20; dark optional; a customer's own choice is remembered) ───
export const THEME_KEY = "qf_theme";
export const getTheme = () => { try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; } catch { return "light"; } };
export const applyTheme = t => { document.documentElement.dataset.theme = t; try { localStorage.setItem(THEME_KEY, t); } catch { /* storage blocked */ } };
export function useTheme() {
  const [theme, setTheme] = useState(getTheme);
  return [theme, t => { applyTheme(t); setTheme(t); }];
}


// ─── trading mode: how much each timeframe counts in the COMBINED strength (stocks, sectors, industries) ───
export const MODES = {
  equal:  { label: "Balanced",           short: "Balanced",  hint: "every timeframe counts the same",                       w: { D: 1, W: 1, M: 1, Q: 1, Y: 1 } },
  swing:  { label: "Swing / Positional", short: "Swing",     hint: "Monthly and Quarterly count most — trades of weeks to months", w: { D: 1, W: 2, M: 3, Q: 3, Y: 1 } },
  invest: { label: "Investing",          short: "Investing", hint: "Quarterly and Yearly count most — holding for a year or more", w: { D: 0, W: 0.5, M: 1.5, Q: 4, Y: 4 } },
};
export const MODE_KEY = "qf_mode";
export const getMode = () => { try { const m = localStorage.getItem(MODE_KEY); return MODES[m] ? m : "equal"; } catch { return "equal"; } };
export const weightPct = w => { const t = Object.values(w).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(v / t * 100)])); };
// Recompute every "Combined" number with the mode's weights: stock os from its D..Y strengths; sector / industry
// strength and net bias from their D..Y rows (counts, breadth and moves stay from the server's combined rows).
export function applyMode(data, mode) {
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


// ─── small pieces ────────────────────────────────────────────────────────────
// the Hyperplane mark — exactly the admin console's (dashboard.jsx HyperplaneLogo; owner 2026-11-07: "the admin and customer logos must match"):
// the plane in perspective, its normal vector w standing up from it, one class below and one above
export function Logo({ size = 32 }) {
  const id = "hpl" + size, small = size < 36;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Hyperplane logo" style={{ flexShrink: 0, display: "block" }}>
      <defs>
        <linearGradient id={id + "bg"} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0d1b33"/><stop offset="1" stopColor="#070d1a"/></linearGradient>
        <linearGradient id={id + "pl"} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" stopOpacity=".95"/><stop offset="1" stopColor="#6366f1" stopOpacity=".95"/></linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="61" height="61" rx="16" fill={`url(#${id}bg)`} stroke="#1f3a5f" strokeWidth="1.5"/>
      <circle cx="14" cy="47" r={small ? 3.4 : 3} fill="#6366f1"/>
      {!small && <circle cx="22" cy="53" r="2.6" fill="#6366f1" opacity=".8"/>}
      <path d="M7 37 L35 27 L57 34 L29 45 Z" fill={`url(#${id}pl)`} opacity=".9"/>
      <path d="M7 37 L35 27 L57 34 L29 45 Z" fill="none" stroke="#a5f3fc" strokeOpacity=".7" strokeWidth="1.2" strokeLinejoin="round"/>
      <line x1="32" y1="36" x2="32" y2="12" stroke="#e0f2fe" strokeWidth="3.4" strokeLinecap="round"/>
      <path d="M26.5 17 L32 10 L37.5 17" fill="none" stroke="#e0f2fe" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="32" cy="36" r="2.6" fill="#070d1a" stroke="#e0f2fe" strokeWidth="1.8"/>
      <circle cx="49" cy="17" r={small ? 3.4 : 3} fill="#22d3ee"/>
      {!small && <circle cx="43" cy="11" r="2.6" fill="#22d3ee" opacity=".8"/>}
    </svg>
  );
}
export const GuideIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>);
export const Brand = () => <div className="brand"><Logo/><div><div className="brand-name">Hyperplane</div><div className="brand-by">by QuantFriday</div></div></div>;

// ─── side navigation: one item per application the customer's roles allow (Admin → Access manager) ───
export const NavSvg = ({ children, size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>);
export const APP_ICON = {
  research: <NavSvg><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/><circle cx="19" cy="8" r="1.2" fill="currentColor"/></NavSvg>,
  simple: <NavSvg><path d="M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9z"/><path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></NavSvg>,
  portfolio: <NavSvg><path d="M21.2 15.9A10 10 0 1 1 8.1 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></NavSvg>,
  builder: <NavSvg><rect x="3" y="13" width="5" height="8" rx="1"/><rect x="9.5" y="8" width="5" height="13" rx="1"/><rect x="16" y="3" width="5" height="18" rx="1"/><path d="M5.5 9.5 12 4l2.5 2"/></NavSvg>,
  // AI ETF SIP Builder (owner 2026-11-07: "change the icon"): Lucide "piggy-bank" — steady saving, the safe way
  sip: <NavSvg><ellipse cx="8" cy="6" rx="5.5" ry="2.3"/><path d="M2.5 6v3.6c0 1.3 2.5 2.3 5.5 2.3s5.5-1 5.5-2.3V6"/><path d="M2.5 9.6v3.6c0 1.3 2.5 2.3 5.5 2.3"/><path d="M2.5 13.2v3.6c0 1.3 2.5 2.3 5.5 2.3"/><path d="m12 19 3.2-3.4 2.4 2.2 4-4.6"/><path d="M18.6 13.2h3v3"/></NavSvg>,
  // AI Momentum SIP (2026-11-06): Lucide "trending-up"
  msip: <NavSvg><path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/></NavSvg>,
  // ETF analyser (2026-11-06): Lucide "coins"
  etf: <NavSvg><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></NavSvg>,
};
// Addresses (owner 2026-11-07: "don't keep all apps a monolith — every app its own /application-name; the portfolio ID part of the
// address"): /app/<app-name> for each application, /app/<app-name>/portfolio/<ID> for one of the customer's own saved portfolios (signed
// in), /app/portfolio/<ID> for the PUBLIC page of a shared one (no sign-in, no app shell — main.jsx / public.jsx), /app/docs, /app/helpdesk.
// The server already sends /app/* to the page (Caddyfile try_files).
export const APP_SLUG = { simple: "ai-mode", research: "deep-research", portfolio: "portfolio-analyser", builder: "portfolio-builder",
  etf: "etf-analyser", sip: "etf-sip-builder", msip: "momentum-sip-builder" };
const SLUG_APP = Object.fromEntries(Object.entries(APP_SLUG).map(([k, v]) => [v, k]));
export const routeOf = (p = window.location.pathname) => {
  const seg = p.replace(/^\/app\/?/, "").split("/").filter(Boolean);
  if (seg[0] === "portfolio" && seg[1]) return { public: decodeURIComponent(seg[1]).toUpperCase() };
  if (SLUG_APP[seg[0]] && seg[1] === "portfolio" && seg[2]) return { app: SLUG_APP[seg[0]], code: decodeURIComponent(seg[2]).toUpperCase() };
  if (seg[0] === "docs") return { view: "guide" };
  if (seg[0] === "helpdesk") return { view: "helpdesk" };
  return { app: SLUG_APP[seg[0]] || null };
};
export const portfolioUrl = code => `${window.location.origin}/app/portfolio/${code}`;
// go to an address inside the app (a new history step unless replace); everyone listening to "hp-route" follows it
export function goPath(path, replace = false) {
  if (window.location.pathname === path) return;
  try { window.history[replace ? "replaceState" : "pushState"](null, "", path); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("hp-route"));
}

export const AppIcon = ({ k }) => APP_ICON[k] || <NavSvg><rect x="4" y="4" width="16" height="16" rx="3"/></NavSvg>;
export const CollapseIcon = () => <NavSvg size={17}><path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/></NavSvg>;
export const MenuIcon = () => <NavSvg size={20}><path d="M4 7h16M4 12h16M4 17h16"/></NavSvg>;
export const GridIcon = () => <NavSvg><rect x="4" y="4" width="4" height="4" rx="1"/><rect x="10" y="4" width="4" height="4" rx="1"/><rect x="16" y="4" width="4" height="4" rx="1"/>
  <rect x="4" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="16" y="10" width="4" height="4" rx="1"/>
  <rect x="4" y="16" width="4" height="4" rx="1"/><rect x="10" y="16" width="4" height="4" rx="1"/><rect x="16" y="16" width="4" height="4" rx="1"/></NavSvg>;
export const PinIcon = ({ on }) => <NavSvg size={17}><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" fill={on ? "currentColor" : "none"}/><path d="M12 14v7"/></NavSvg>;
export const SearchIcon = () => <NavSvg size={17}><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></NavSvg>;


export const dirKey = d => d === 1 ? "up" : d === -1 ? "down" : "side";
export const dirWord = d => d === 1 ? "uptrend" : d === -1 ? "downtrend" : "sideways";
export function Meter({ v, d, label = "", held = false }) {       // ▂▃▅▆█ 84%  (bars lit = strength, colour = direction)
  if (v == null) return <span className="meter none">—</span>;
  const a = Math.abs(v), lit = Math.max(1, Math.min(5, Math.ceil(a / 20)));
  return <span className={`meter ${dirKey(d)} ${held ? "held" : ""}`} title={`${label ? label + ": " : ""}${dirWord(d)} · trend strength ${a}% (not a price move)${held ? " · goes against the overall direction, so it is shown as sideways for now" : ""}`}>
    <span className="bars" aria-hidden="true">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= lit ? "on" : ""}/>)}</span>{a}%</span>;
}
export const StrengthTag = ({ v, d, big }) => v == null ? <span className="stag none">No data</span>
  : <span className={`stag ${dirKey(d)} ${big ? "big" : ""}`} title={`Trend strength ${Math.abs(v)}% (${dirWord(d)}) — not a price move`}><b>{Math.abs(v)}%</b> strength</span>;
// Diverging bar from −100 to +100 with a 0 mark in the middle (owner, 2026-10-13): an uptrend fills to the right of 0,
// a downtrend to the left (anything below 0 is red). `scale` adds "−100 · 0 · +100" under it.
// `scale` (owner, 2026-10-31: "hard to find where the progress is"; a round marker was rejected): coloured zones
// (downtrend · sideways · uptrend), tick marks at −50 / 0 / +50, a value tag with a ▼ pointer above the end of the fill
// and the numbers under their own ticks.
export const DBAR_TICKS = [-100, -50, 0, 50, 100];
export function DivBar({ v, d, scale = false, className = "" }) {
  const w = v == null ? 0 : Math.min(100, Math.abs(v)) / 2;
  const cls = v == null ? "" : v < 0 ? "down" : d === 1 ? "up" : "side";
  const at = v == null ? 50 : 50 + Math.max(-100, Math.min(100, v)) / 2;          // position of the value, % from the left
  return (
    <div className={`dbar ${scale ? "dbar-x" : ""} ${className}`} title={v == null ? "No data" : `${v < 0 ? "−" : "+"}${Math.abs(v)} on a scale from −100 (strong downtrend) to +100 (strong uptrend)`}>
      {scale && <div className="dbar-tr" aria-hidden="true">{v != null && <span className={`dbar-tag ${cls}`} style={{ left: `clamp(16px, ${at}%, calc(100% - 16px))` }}>{signed(v)}</span>}</div>}
      <div className="dbar-t">
        {scale && <><i className="dbar-z zd" aria-hidden="true"/><i className="dbar-z zs" aria-hidden="true"/><i className="dbar-z zu" aria-hidden="true"/>
          {[-50, 50].map(t => <i key={t} className="dbar-tk" style={{ left: `${50 + t / 2}%` }} aria-hidden="true"/>)}</>}
        <i className="dbar-0" aria-hidden="true"/>
        {v != null && v !== 0 && <span className={`dbar-f ${cls}`} style={v > 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}/>}
      </div>
      {scale && <div className="dbar-s2" aria-hidden="true">{DBAR_TICKS.map(t => (
        <span key={t} className={t === 0 ? "z" : ""} style={{ left: `${50 + t / 2}%` }}>{t > 0 ? `+${t}` : t < 0 ? `−${-t}` : "0"}</span>))}</div>}
    </div>
  );
}
export const StrengthBar = ({ v, d }) => <DivBar v={v} d={d}/>;

export function CopyBtns({ syms, compact }) {
  const [done, setDone] = useState("");
  const go = async kind => { if (await copyText(kind === "tv" ? syms.map(s => `NSE:${s},`).join("") : syms.join(","))) { setDone(kind); setTimeout(() => setDone(""), 1300); } };
  return (
    <span className="copybtns" onClick={e => e.stopPropagation()}>
      <button className="cbtn" onClick={() => go("plain")} title="Copy as A,B,C">{done === "plain" ? <Icon name="check" size={12}/> : compact ? <Icon name="copy" size={12}/> : <><Icon name="copy" size={12}/> Copy</>}</button>
      <button className="cbtn tv" onClick={() => go("tv")} title="Copy for a TradingView watchlist (NSE:A,NSE:B,)">{done === "tv" ? <Icon name="check" size={12}/> : "TV"}</button>
    </span>
  );
}

// Branded page header (owner, 2026-11-06: "that branding look at the top is good — bring the same UI for all the pages").
// One compact band on every application: AI eyebrow, one title line (+ accent words and an ⓘ for any explanation),
// one short subline, and a right-hand slot for actions / data freshness.
// the page header of every application (owner 2026-11-06: "all pages in one format … no empty space in the stripe"):
// ONE line — the Hyperplane AI eyebrow, the title, the sub text, and tabs / actions on the right; the date is in the top bar
export function BrandBand({ product, title, accent, sub, info, right, id, className = "" }) {
  return (
    <section className={`hp-band ${className}`} id={id}>
      <div className="hp-band-l">
        <span className="px-eyebrow hp-band-eb"><AiSpark/> Hyperplane AI · {product}</span>
        <h1>{title}{accent && <> <span>{accent}</span></>}{info && <Info wide text={info}/>}</h1>{sub && <p>{sub}</p>}
      </div>
      {right && <div className="hp-band-r">{right}</div>}
    </section>);
}

// one table format (owner 2026-11-06): the accordion group row of the AI Portfolio Builder table, for every app's tables
export function GroupRow({ cols, open, onToggle, color, label, meta, id }) {
  return (
    <tr className="hp-grp"><td colSpan={cols}>
      <button type="button" className="hp-gbtn" aria-expanded={open} onClick={onToggle} id={id}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        {color && <i style={{ background: color }}/>}<span>{label}</span><span className="hp-gmeta">{meta}</span>
        <span className="hp-ghint">{open ? "Hide" : "Show"}</span></button></td></tr>);
}

// a short confirmation at the bottom of the screen (swaps, saves) — goes away by itself
// A part of the app loaded on demand (an app, a PDF report). After an update the old file names are gone, so a page
// opened before it cannot load them (owner: "Download report is not working"): try again once, then load the new
// version of the page once — never a silent failure.
export function loadChunk(fn) {
  return fn().catch(() => new Promise(r => setTimeout(r, 700)).then(fn)).catch(() => {
    try {
      if (!sessionStorage.getItem("hp_reloaded")) { sessionStorage.setItem("hp_reloaded", "1"); window.location.reload(); return new Promise(() => {}); }
    } catch { /* ignore */ }
    throw new Error("Hyperplane was just updated. Reload the page and try again.");
  });
}

export function useToast() {
  const [t, setT] = useState(null);
  useEffect(() => { if (!t) return undefined; const k = setTimeout(() => setT(null), 2600); return () => clearTimeout(k); }, [t]);
  return [t ? <div className="hp-toast" role="status"><Icon name="check" size={14}/>{t}</div> : null, setT];
}

// "DATA AS OF" in the top bar for every application: an app that loads its own data reports its date here
export const AsOfCtx = React.createContext(null);
export function useAsOf(app, asOf) {
  const set = React.useContext(AsOfCtx);
  useEffect(() => { if (set && asOf) set(app, asOf); }, [asOf]);
}

// the pop-up opens under the icon; one that would run past the edge of the screen (a narrow window) is moved back inside
const keepInside = e => {
  const pop = e.currentTarget.querySelector(".info-pop"); if (!pop) return;
  pop.style.transform = "";
  requestAnimationFrame(() => {
    const r = pop.getBoundingClientRect(), m = 12; let dx = 0;
    if (r.right > window.innerWidth - m) dx = window.innerWidth - m - r.right;
    if (r.left + dx < m) dx = m - r.left;
    if (dx) pop.style.transform = `translateX(${Math.round(dx)}px)`;
  });
};
export function Info({ text, right, wide, label, above }) {
  return <span className="info" tabIndex={0} onClick={e => e.stopPropagation()} onMouseEnter={keepInside} onFocus={keepInside} aria-label={label || (typeof text === "string" ? text : "More info")}><Icon name="info" size={14}/><span className={`info-pop ${right ? "r" : ""} ${wide ? "wide" : ""} ${above ? "above" : ""}`}>{text}</span></span>;
}

// Trading-mode ⓘ: how much each timeframe counts in each mode (the active one highlighted, top weights in bold)
export function ModeWeights({ active }) {
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
export function Seg({ items, isOn, onPick }) {
  return <div className="sg">{items.map(([k, l, tone, title]) =>
    <button key={k} type="button" title={title} className={`${isOn(k) ? "on" : ""} ${tone || ""}`} onClick={() => onPick(k)}>{l}</button>)}</div>;
}

export function MultiSelect({ label, options, value, onChange, width = 200 }) {
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


export const signed = v => v == null ? "—" : v < 0 ? `−${Math.abs(v)}` : `${Math.abs(v)}`;   // negative side gets a minus
// ─── trend gauge: −100 (strong downtrend) … 0 (sideways) … +100 (strong uptrend); zones use the same cuts as the labels ───
export const G_ZONES = [[-100, -80, "#ff2d45"], [-80, -60, "#ff5f6d"], [-60, -TREND_CUT, "#ff9aa3"], [-TREND_CUT, TREND_CUT, "#8b97ad"],
                 [TREND_CUT, 60, "#86e5c4"], [60, 80, "#2fd39a"], [80, 100, "#00b884"]];
export function TrendGauge({ v, size = 180, caption = true }) {
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

// ─── Overall trend meter — the SAME component in AI Mode and the Research stock card ───
// Overall trend (owner, 2026-10-11): stock 50 % · sector 25 % · industry 25 %. The stock is −100…+100; sector and industry
// strength go on the same scale (50% = neutral → (st − 50) × 2). A missing part's weight goes to the others.
export function overallOf(os, secA, indA) {
  const mix = [[os, 0.5], [secA ? (secA.st - 50) * 2 : null, 0.25], [indA ? (indA.st - 50) * 2 : null, 0.25]].filter(([v]) => v != null);
  const w = mix.reduce((x, [, k]) => x + k, 0);
  return mix.length ? Math.round(mix.reduce((x, [v, k]) => x + v * k, 0) / w) : null;
}
export const trendWordOf = v => v == null ? "No data" : dirVal(v) === 0 ? "Sideways" : `${levelOf(v)} ${v > 0 ? "uptrend" : "downtrend"}`;
export const dirToneOf = v => v == null ? "side" : v < 0 ? "bad" : dirVal(v) === 1 ? "good" : "side";   // red on the downtrend side
export function OverallMeter({ os, secA, indA, size = 250, className = "" }) {
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
export const LEVEL = g => { const k = groupState(g); return [k === "up" ? "good" : k === "down" ? "bad" : "mid", levelOf(g.st)]; };   // same rule as the research view
export const PERIODS = ["Days", "Weeks", "Months", "Quarters", "Years"];
export function StockSearch({ stocks, onPick, autoFocus, onClear = null, placeholder = null, added = null, keepOpen = false }) {
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
      <span className="sv-mag" aria-hidden="true"><Icon name="search" size={16}/></span>
      {onClear && <button type="button" className="sv-x" onClick={onClear} title="Clear this stock and search again" aria-label="Clear this stock"><Icon name="x" size={16}/></button>}
      <span className="sv-qai" title="Hyperplane AI is built on Hyperplane's own quant algorithms: fixed rules applied to our trend data — the same numbers as Deep Research. It does not use any outside AI service, and it never makes up a number."><AiSpark/>Hyperplane AI</span>
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
              <b className="mono">{x.s}</b><span className="sv-dn">{x.n}</span><span className="sv-ds">{added && added.has(x.s) ? <span className="pf-added"><Icon name="check" size={12}/> added</span> : x.sec}</span>
            </button>)) : <div className="sv-none">No stock found for “{q}”.</div>}
        </div>
      )}
    </div>
  );
}


export const RELIABILITY = { S: ["High", "good", "The long-term price history is healthy."], M: ["Medium", "mid", "The long-term price history is average."],
                      W: ["Low", "bad", "The price has fallen sharply or moved erratically in the past."] };

export const andJoin = a => a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;

// Holdings table row (owner, 2026-10-17: "professional like the big companies" — clean fintech + institutional research).
export const tc = v => `c-${dirToneOf(v)}`;                                  // red below 0 · green from the uptrend cut · else grey

export const fmtTime = iso => new Date(iso).toLocaleTimeString("en-IN", { hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata" });
export const fmtDay = d => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });

// Each module brings its own styles: added once, the first time the module loads.
export function addCss(id, css) {
  if (typeof document === "undefined" || document.getElementById(`css-${id}`)) return;
  const el = document.createElement("style"); el.id = `css-${id}`; el.textContent = css; document.head.appendChild(el);
}

// Stock detail view (customer admin, permission "<application>:detail"): the shell provides open(symbol, app) when the
// customer's roles hold that permission; everyone else gets a plain name (no link, no extra download).
export const DetailCtx = React.createContext(null);
export function StockLink({ sym, app, className = "", children, title }) {
  const d = React.useContext(DetailCtx);
  if (!d || !d.can(app)) return children;
  return <button type="button" className={`stock-link ${className}`} data-detail={sym}
    title={title || `Open the detail view of ${sym}`} onClick={e => { e.stopPropagation(); d.open(sym, app); }}>{children}</button>;
}
