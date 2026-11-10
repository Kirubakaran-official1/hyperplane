// Hyperplane Community — the group chat of every customer and the owner (owner 2026-11-08, round 19: "a group chat inside the customer
// application as the community forum — the most professional messaging application — default to all users"; 2026-11-09: "only show them
// the name, not the mail id or number"). Shared by the customer app (base /app/api/community) and the admin app (/api/admin/community,
// staff = true: delete any message, pin, mute, reports, member tags). It only talks to the API it is given (backend/app/community.py).
// Round 19b (owner 2026-11-09: "not up to the mark — too old school — keep my messages right and others left like WhatsApp; favourites
// and a favourites view with their threads; tags near the name, created in my admin app; anyone can tag anybody"):
//   · WhatsApp-style bubbles (mine right, others left, grouped, time inside the bubble, quotes inside, reactions under)
//   · a left menu of views: Chat · Favourites · Mentions · Pinned (+ Tags · Reports · Muted for the admin); chips on a phone
//   · member TAGS beside the name (admin creates and gives them); @MENTIONS with a picker (names only) → the Inbox "Updates" of that person
//   · ☆ favourite any message for oneself
// Round 19d (owner 2026-11-11): no groups; @mention only the Community admins (the "Customer Admin" role — shown with the Admin badge),
// they get it in their Inbox; a DATE search (open any day — the server reads it by index) instead of a message search.
// Class names stay prefixed (cm-first, not "top"): the shell's global .top / .lbl styles leak into plain names.
// Messages are plain blocks rendered as text — never HTML; a link in a customer's message stays plain text (anti-scam), the admin's are
// clickable. Polling, no sockets: the room every 4 s while open, the badge every 30 s (CommunityButton).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { shrinkImage } from "./helpdesk.jsx";

const REACT = ["👍", "❤️", "😂", "😮", "🙏", "🔥"];
const PICK = ["😀", "😂", "🙂", "😉", "😍", "🤔", "😮", "😢", "🙏", "👍", "👏", "🔥", "💯", "📈", "📉", "✅", "❌", "💡", "🎯", "🚀"];
const HUES = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0d9488", "#4f46e5", "#0891b2", "#b45309", "#9333ea", "#e11d48", "#0369a1", "#be185d"];
const MAX_IMG = 4, MAX_TEXT = 2000;
const IC = {
  chat: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>,
  reply: <><path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></>,
  thread: <><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></>,
  smile: <><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/></>,
  more: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
  pin: <><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></>,
  trash: <><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></>,
  image: <><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/></>,
  send: <><path d="M14.54 21.69a.5.5 0 0 0 .94-.02l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/></>,
  x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
  search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
  shield: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></>,
  down: <><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></>,
  mute: <><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  star: <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>,
  at: <><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></>,
  tag: <><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></>,
  hash: <><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/></>,
  copy: <><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></>,
  back: <path d="m15 18-6-6 6-6"/>,
  calendar: <><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></>,
};
const Ic = ({ n, s = 16, fill }) => <svg width={s} height={s} viewBox="0 0 24 24" fill={fill || "none"} stroke="currentColor" strokeWidth={s <= 14 ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>{IC[n]}</svg>;
const tz = { timeZone: "Asia/Kolkata" };
const tm = iso => new Date(iso).toLocaleTimeString("en-IN", { ...tz, hour: "numeric", minute: "2-digit", hour12: true });
const dkey = iso => new Date(iso).toLocaleDateString("en-CA", tz);
const dlabel = iso => {
  const k = dkey(iso), t = dkey(new Date().toISOString()), y = dkey(new Date(Date.now() - 864e5).toISOString());
  return k === t ? "Today" : k === y ? "Yesterday" : new Date(iso).toLocaleDateString("en-IN", { ...tz, weekday: "short", day: "numeric", month: "short", year: "numeric" });
};
const ago = iso => { const m = (Date.now() - new Date(iso).getTime()) / 60000; return m < 1 ? "just now" : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const initials = n => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const textOf = m => (m.body || []).map(b => b.t === "text" ? b.v : b.t === "at" ? `@${b.n}` : "").join("").trim();
const linkify = v => v.split(/(https?:\/\/[^\s<>"']+)/g).map((p, i) => i % 2 ? <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow">{p}</a> : p);
const hueOf = m => m.admin ? "var(--acc)" : HUES[(m.hue || 0) % HUES.length];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const CM_CSS = `
.cm-wrap{container-type:inline-size;min-width:0}
.cm{position:relative;display:grid;grid-template-columns:232px minmax(0,1fr);height:var(--cm-h,calc(100vh - 150px));min-height:500px;border:1px solid var(--b1);border-radius:14px;background:var(--s1);overflow:hidden;font-family:var(--sans,inherit);color:var(--t1);box-shadow:0 1px 3px rgba(0,0,0,.04)}
.cm.th{grid-template-columns:232px minmax(0,1fr) minmax(330px,400px)}
.cm-rail{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--b1);background:var(--s1)}
.cm-rh{display:flex;align-items:center;gap:10px;padding:16px 14px 12px}.cm-rh .lg{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,var(--acc),color-mix(in srgb,var(--acc) 55%,#7c3aed));color:#fff}
.cm-rh b{display:block;font-size:15px;font-weight:700;line-height:19px}.cm-rh small{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--t3)}
.cm-nav{display:flex;flex-direction:column;gap:2px;padding:4px 8px;overflow-y:auto}
.cm-nav .lb{padding:12px 8px 4px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.cm-nav button{display:flex;align-items:center;gap:10px;width:100%;height:38px;padding:0 10px;border:0;border-radius:9px;background:none;color:var(--t2);font:inherit;font-size:13.5px;font-weight:500;text-align:left;cursor:pointer}
.cm-nav button:hover{background:var(--s2);color:var(--t1)}.cm-nav button.on{background:var(--adim);color:var(--acc);font-weight:600}
.cm-nav button span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-nav em{font-style:normal;min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:grid;place-items:center;background:var(--s3);color:var(--t2);font-size:11px;font-weight:700}.cm-nav button.on em{background:var(--acc);color:var(--bg)}.cm-nav em.red{background:var(--short,#e5484d);color:#fff}
.cm-rules-mini{margin:auto 12px 12px;padding:10px 12px;border-radius:10px;background:var(--s2);font-size:11.5px;line-height:17px;color:var(--t3)}
.cm-chips{display:none;gap:6px;padding:8px 12px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--b1)}.cm-chips::-webkit-scrollbar{display:none}.cm-chips button{flex:none;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--b2);border-radius:999px;background:var(--s1);color:var(--t2);font:inherit;font-size:12.5px;cursor:pointer}.cm-chips button.on{border-color:var(--acc);background:var(--adim);color:var(--acc);font-weight:600}
.cm-room{display:flex;flex-direction:column;min-width:0;min-height:0;position:relative}
.cm-h{display:flex;align-items:center;gap:12px;min-height:60px;padding:8px 16px;border-bottom:1px solid var(--b1);background:var(--s1)}
.cm-h .ti{min-width:0;flex:1}.cm-h b{display:block;font-size:15.5px;font-weight:700}.cm-h small{display:block;font-size:12px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-sr{display:flex;align-items:center;gap:6px;height:36px;padding:0 6px 0 12px;border:1px solid var(--b2);border-radius:999px;background:var(--bg);color:var(--t3)}
.cm-sr input{min-width:0;border:0;outline:0;background:none;color:var(--t1);font:inherit;font-size:13px;color-scheme:light dark}
.cm-h{position:relative}
.cm-datebtn{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border:1px solid var(--b2);border-radius:999px;background:var(--bg);color:var(--t1);font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.cm-datebtn:hover,.cm-datebtn.on{border-color:var(--acc);color:var(--acc)}
.cm-dp{position:absolute;right:16px;top:calc(100% - 4px);z-index:20;width:min(380px,calc(100% - 32px));padding:14px;border:1px solid var(--b2);border-radius:14px;background:var(--bg);box-shadow:0 18px 50px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:12px}
.cm-dp .cm-dp-pre{display:flex;flex-wrap:wrap;gap:6px}.cm-dp .cm-dp-pre button{height:30px;padding:0 12px;border:1px solid var(--b2);border-radius:999px;background:var(--s1);color:var(--t2);font:inherit;font-size:12.5px;cursor:pointer}.cm-dp .cm-dp-pre button:hover{border-color:var(--acc);color:var(--acc)}
.cm-cal{display:flex;flex-direction:column;gap:8px}
.cm-cal-h{display:flex;align-items:center;gap:6px}.cm-cal-h select{flex:1;min-width:0;height:34px;padding:0 8px;border:1px solid var(--b2);border-radius:9px;background:var(--s1);color:var(--t1);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.cm-cal-nav{flex:none;width:34px;height:34px;border:1px solid var(--b2);border-radius:50%;background:var(--s1);color:var(--t1);font-size:18px;line-height:1;cursor:pointer}.cm-cal-nav:disabled{opacity:.35;cursor:default}
.cm-cal-g{display:grid;grid-template-columns:repeat(7,1fr);row-gap:3px}
.cm-cal-g .wd{height:24px;display:grid;place-items:center;font-size:11px;font-weight:600;color:var(--t3)}
.cm-cal-g button{height:36px;border:0;background:none;color:var(--t1);font:inherit;font-size:13px;cursor:pointer;border-radius:0}
.cm-cal-g button:hover:not(:disabled){background:var(--s2);border-radius:999px}.cm-cal-g button:disabled{color:var(--t3);opacity:.35;cursor:default}
.cm-cal-g button.td{font-weight:800;color:var(--acc)}
.cm-cal-g button.in{background:color-mix(in srgb,var(--acc) 15%,transparent)}
.cm-cal-g button.st,.cm-cal-g button.en{background:var(--acc);color:var(--bg);font-weight:700}
.cm-cal-g button.st{border-radius:999px 0 0 999px}.cm-cal-g button.en{border-radius:0 999px 999px 0}.cm-cal-g button.one{border-radius:999px}
.cm-dp-sum{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cm-dp-sum div{padding:7px 10px;border:1px solid var(--b2);border-radius:10px;background:var(--s1)}
.cm-dp-sum span{display:block;font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--t3)}.cm-dp-sum b{font-size:13px;color:var(--t1)}.cm-dp-sum b.no{color:var(--t3);font-weight:500}
.cm-dp .cm-dp-fl{display:grid;grid-template-columns:1fr 1fr;gap:10px;height:auto}.cm-dp .cm-dp-lb{display:flex;flex-direction:column;gap:4px;height:auto;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--t3)}
.cm-dp input{height:38px;padding:0 10px;border:1px solid var(--b2);border-radius:10px;background:var(--s1);color:var(--t1);font:inherit;font-size:13.5px;text-transform:none;letter-spacing:0;color-scheme:light dark}.cm-dp input:focus{outline:0;border-color:var(--acc);box-shadow:0 0 0 3px var(--adim)}
.cm-dp .cm-dp-hint{display:block;margin:0;font-size:11.5px;line-height:16px;color:var(--t3);white-space:normal;overflow:visible}
.cm-dayb{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid var(--b1);background:color-mix(in srgb,var(--acc) 6%,var(--s1));font-size:13px}
.cm-dayb b{flex:1;min-width:160px}.cm-dayb small{color:var(--t3);font-weight:400;margin-left:6px}
.cm-pins{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--b1);background:color-mix(in srgb,var(--acc) 6%,var(--s1));cursor:pointer}
.cm-pins .tx{flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cm-pins b{margin-right:6px}.cm-pins em{font-style:normal;font-size:11.5px;color:var(--t3)}
.cm-list{position:relative;flex:1;min-height:0;overflow-y:auto;padding:10px 0 14px;overscroll-behavior:contain;
  background-color:color-mix(in srgb,var(--bg) 70%,var(--s1));background-image:radial-gradient(color-mix(in srgb,var(--t3) 16%,transparent) 1px,transparent 1.2px);background-size:22px 22px}
.cm-day{display:flex;justify-content:center;margin:14px 0 8px;position:sticky;top:4px;z-index:2}.cm-day span{padding:4px 12px;border-radius:999px;background:var(--s1);box-shadow:0 1px 3px rgba(0,0,0,.08);font-size:11.5px;font-weight:600;color:var(--t2)}
.cm-new{display:flex;justify-content:center;margin:10px 0}.cm-new span{padding:4px 14px;border-radius:999px;background:var(--acc);color:var(--bg);font-size:11.5px;font-weight:700}
.cm-row{position:relative;display:flex;align-items:flex-end;gap:8px;padding:1px 16px}.cm-row.cm-first{margin-top:8px}
.cm-row.me{flex-direction:row-reverse}
.cm-av{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:12.5px;font-weight:700;letter-spacing:.02em;align-self:flex-start;margin-top:2px}
.cm-av.adm{border-radius:11px;background:linear-gradient(135deg,var(--acc),color-mix(in srgb,var(--acc) 55%,#7c3aed))}.cm-av.sp{visibility:hidden;height:1px}
.cm-row.me .cm-av{display:none}
.cm-col{display:flex;flex-direction:column;align-items:flex-start;min-width:0;max-width:min(72%,620px)}.cm-row.me .cm-col{align-items:flex-end}
.cm-bub{position:relative;min-width:72px;max-width:100%;padding:6px 10px 6px;border-radius:16px;background:var(--s1);box-shadow:0 1px 1.5px rgba(0,0,0,.08);overflow-wrap:anywhere}
.cm-row.cm-first:not(.me) .cm-bub{border-top-left-radius:5px}.cm-row.cm-first.me .cm-bub{border-top-right-radius:5px}
.cm-row.me .cm-bub{background:color-mix(in srgb,var(--acc) 17%,var(--s1))}
.cm-row.adm:not(.me) .cm-bub{background:color-mix(in srgb,var(--acc) 7%,var(--s1));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--acc) 35%,transparent),0 1px 1.5px rgba(0,0,0,.06)}
.cm-row.hl .cm-bub{animation:cmHl 1.8s ease-out}@keyframes cmHl{from{box-shadow:0 0 0 3px var(--acc)}}
.cm-who{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;font-size:13px;font-weight:700;line-height:18px}
.cm-tg{display:inline-flex;align-items:center;height:17px;padding:0 7px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.01em}
.cm-badge{display:inline-flex;align-items:center;gap:3px;height:17px;padding:0 7px;border-radius:999px;background:var(--acc);color:var(--bg);font-size:10.5px;font-weight:700}
.cm-tx{font-size:14.5px;line-height:21px;color:var(--t1);white-space:pre-wrap}.cm-tx a{color:var(--acc);text-decoration:underline}
.cm-at{color:var(--acc);font-weight:600}.cm-at.me{padding:0 3px;border-radius:4px;background:color-mix(in srgb,var(--acc) 20%,transparent)}
.cm-meta{float:right;display:inline-flex;align-items:center;gap:4px;margin:6px 0 -3px 12px;font-size:10.5px;line-height:14px;color:var(--t3);white-space:nowrap}.cm-meta .st{color:#f59e0b}
.cm-del{font-size:13.5px;font-style:italic;color:var(--t3)}
.cm-q{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;margin:2px 0 5px;padding:5px 9px;border:0;border-left:3px solid var(--qc,var(--t3));border-radius:6px;background:color-mix(in srgb,var(--t1) 6%,transparent);color:var(--t2);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
.cm-q b{font-size:12px;color:var(--qc,var(--t1))}.cm-q span{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-imgs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin:2px -4px 2px;max-width:340px}.cm-imgs.one{grid-template-columns:1fr}
.cm-imgs img{width:100%;height:150px;border-radius:10px;cursor:zoom-in;object-fit:cover;background:var(--s2)}.cm-imgs.one img{height:auto;max-height:280px}
.cm-rx{display:flex;flex-wrap:wrap;gap:4px;margin:-6px 6px 0;position:relative;z-index:1}
.cm-rx button{display:inline-flex;align-items:center;gap:3px;height:24px;padding:0 8px;border:1px solid var(--b1);border-radius:999px;background:var(--s1);color:var(--t2);font:inherit;font-size:12px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.cm-rx button.mine{border-color:var(--acc);background:var(--adim);color:var(--acc);font-weight:700}
.cm-thr{display:inline-flex;align-items:center;gap:6px;margin:4px 4px 0;padding:3px 10px;border:1px solid var(--b1);border-radius:999px;background:var(--s1);color:var(--acc);font:inherit;font-size:12px;font-weight:600;cursor:pointer}.cm-thr small{font-weight:400;color:var(--t3)}
.cm-ctx{margin:3px 6px 0;font-size:11.5px;color:var(--t3)}.cm-ctx button{border:0;background:none;color:var(--acc);font:inherit;font-weight:600;cursor:pointer;padding:0}
.cm-tools{position:relative;align-self:center;display:flex;gap:1px;padding:2px;border:1px solid var(--b1);border-radius:999px;background:var(--s1);box-shadow:0 2px 8px rgba(0,0,0,.1);opacity:0;transition:opacity .12s}
.cm-row:hover .cm-tools,.cm-row.menu .cm-tools,.cm-tools:focus-within{opacity:1}
.cm-tools>button{width:28px;height:28px;border:0;border-radius:50%;background:none;color:var(--t2);display:grid;place-items:center;cursor:pointer}.cm-tools>button:hover{background:var(--s2);color:var(--t1)}.cm-tools>button.on{color:#f59e0b}
.cm-pop{position:absolute;top:34px;left:0;z-index:9;min-width:210px;padding:4px;border:1px solid var(--b2);border-radius:12px;background:var(--bg);box-shadow:0 14px 40px rgba(0,0,0,.25)}
.cm-row.me .cm-pop{left:auto;right:0}
.cm-pop.em{display:flex;gap:2px;min-width:0;border-radius:999px;padding:4px 6px}.cm-pop.em button{width:36px;height:36px;font-size:20px;border:0;border-radius:50%;background:none;cursor:pointer;transition:transform .1s}.cm-pop.em button:hover{background:var(--s2);transform:scale(1.15)}
.cm-pop .it{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:none;color:var(--t1);font:inherit;font-size:13px;text-align:left;cursor:pointer}.cm-pop .it:hover{background:var(--s2)}.cm-pop .it.bad{color:var(--short,#e5484d)}
.cm-pop .sep{height:1px;margin:4px 0;background:var(--b1)}.cm-pop .lb{padding:6px 10px 2px;font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.04em}
.cm-jump{position:absolute;right:18px;bottom:84px;z-index:4;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border:0;border-radius:999px;background:var(--s1);color:var(--acc);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.cm-more{display:block;margin:6px auto;padding:6px 14px;border:1px solid var(--b2);border-radius:999px;background:var(--s1);color:var(--t2);font:inherit;font-size:12px;cursor:pointer}
.cm-empty{display:grid;place-items:center;height:100%;padding:30px;text-align:center;color:var(--t3);font-size:13px}.cm-empty b{display:block;margin-bottom:4px;font-size:15px;color:var(--t1)}.cm-empty .ei{width:52px;height:52px;margin:0 auto 10px;border-radius:16px;display:grid;place-items:center;background:var(--adim);color:var(--acc)}
.cm-comp{position:relative;padding:10px 14px 12px;border-top:1px solid var(--b1);background:var(--s1)}
.cm-qc{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:7px 10px;border-left:3px solid var(--acc);border-radius:8px;background:var(--s2);font-size:12.5px;color:var(--t2)}.cm-qc span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cm-qc b{color:var(--t1)}
.cm-qc button,.cm-chip button{border:0;background:none;color:var(--t3);cursor:pointer;display:grid;place-items:center}
.cm-imgc{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.cm-chip{position:relative}.cm-chip img{width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid var(--b2)}
.cm-chip button{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--t1);color:var(--bg)}
.cm-in{display:flex;align-items:flex-end;gap:8px}
.cm-box{flex:1;display:flex;align-items:flex-end;gap:2px;min-width:0;padding:4px 6px 4px 14px;border:1px solid var(--b2);border-radius:22px;background:var(--bg)}.cm-box:focus-within{border-color:var(--acc);box-shadow:0 0 0 3px var(--adim)}
.cm-box textarea{flex:1;min-width:0;max-height:160px;min-height:22px;padding:7px 0;border:0;outline:0;resize:none;background:none;color:var(--t1);font:inherit;font-size:14.5px;line-height:21px}
.cm-ib{flex:none;width:34px;height:34px;border:0;border-radius:50%;background:none;color:var(--t3);display:grid;place-items:center;cursor:pointer}.cm-ib:hover{background:var(--s2);color:var(--t1)}
.cm-send{flex:none;width:44px;height:44px;border:0;border-radius:50%;background:var(--acc);color:var(--bg);display:grid;place-items:center;cursor:pointer;box-shadow:0 3px 10px color-mix(in srgb,var(--acc) 40%,transparent);transition:transform .1s}.cm-send:hover:not(:disabled){transform:scale(1.05)}.cm-send:disabled{opacity:.4;cursor:default;box-shadow:none}
.cm-hint{display:flex;gap:10px;margin-top:6px;padding:0 6px;font-size:11px;color:var(--t3)}.cm-hint .er{color:var(--short,#e5484d)}.cm-hint .sp{flex:1}
.cm-emo{position:absolute;bottom:64px;left:14px;z-index:8;display:grid;grid-template-columns:repeat(10,34px);gap:2px;padding:8px;border:1px solid var(--b2);border-radius:14px;background:var(--bg);box-shadow:0 14px 40px rgba(0,0,0,.25)}
.cm-emo button{width:34px;height:34px;border:0;border-radius:8px;background:none;font-size:19px;cursor:pointer}.cm-emo button:hover{background:var(--s2)}
.cm-ment{position:absolute;bottom:64px;left:14px;right:70px;z-index:8;max-width:360px;max-height:280px;overflow-y:auto;padding:6px;border:1px solid var(--b2);border-radius:14px;background:var(--bg);box-shadow:0 14px 40px rgba(0,0,0,.25)}
.cm-ment .lb{padding:4px 8px 6px;font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.04em}
.cm-ment button{display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border:0;border-radius:9px;background:none;color:var(--t1);font:inherit;font-size:13.5px;text-align:left;cursor:pointer}.cm-ment button.on,.cm-ment button:hover{background:var(--adim)}
.cm-ment .cm-av{width:28px;height:28px;font-size:11px;margin:0}
.cm-muted{display:flex;align-items:center;gap:8px;padding:14px;border-top:1px solid var(--b1);font-size:13px;color:var(--t2);background:var(--s2)}
.cm-tp{display:flex;flex-direction:column;min-width:0;min-height:0;border-left:1px solid var(--b1);background:var(--s1)}
.cm-tph{display:flex;align-items:center;gap:8px;min-height:60px;padding:8px 14px;border-bottom:1px solid var(--b1)}.cm-tph b{flex:1;font-size:15px}.cm-tph small{font-size:12px;color:var(--t3);font-weight:400;margin-left:6px}
.cm-x{flex:none;width:34px;height:34px;border:1px solid var(--b1);border-radius:50%;background:var(--s1);color:var(--t2);display:grid;place-items:center;cursor:pointer}
.cm-tsep{display:flex;align-items:center;gap:10px;margin:8px 16px;font-size:11.5px;color:var(--t3)}.cm-tsep::after{content:"";flex:1;height:1px;background:var(--b1)}
.cm-ov{position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.6)}
.cm-zoom img{max-width:min(1100px,96vw);max-height:90vh;border-radius:10px}
.cm-dlg{width:min(460px,100%);padding:20px;border:1px solid var(--b2);border-radius:16px;background:var(--bg);box-shadow:0 30px 80px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px}
.cm-dlg h3{margin:0;font-size:17px}.cm-dlg p{margin:0;font-size:13.5px;line-height:20px;color:var(--t2)}.cm-dlg textarea{min-height:70px;padding:8px 10px;border:1px solid var(--b2);border-radius:10px;background:var(--s1);color:var(--t1);font:inherit;font-size:13px;resize:vertical}
.cm-dlg ul{margin:0;padding-left:18px;font-size:13.5px;line-height:22px;color:var(--t1)}
.cm-act{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.cm-b{height:36px;padding:0 16px;border:1px solid var(--b2);border-radius:999px;background:var(--s1);color:var(--t1);font:inherit;font-size:13px;font-weight:600;cursor:pointer}.cm-b.pri{border-color:var(--acc);background:var(--acc);color:var(--bg)}.cm-b.bad{border-color:var(--short,#e5484d);color:var(--short,#e5484d)}.cm-b.sm{height:30px;padding:0 12px;font-size:12px}
.cm-pane{flex:1;min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:color-mix(in srgb,var(--bg) 70%,var(--s1))}
.cm-card{border:1px solid var(--b1);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--s1)}.cm-card small{font-size:12px;color:var(--t3)}.cm-card h4{margin:0;font-size:14px}
.cm-tagrow{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--b1)}.cm-tagrow:first-of-type{border-top:0}.cm-tagrow small{flex:1}
.cm-sw{display:flex;gap:6px}.cm-sw button{width:24px;height:24px;border-radius:50%;border:2px solid transparent;cursor:pointer}.cm-sw button.on{border-color:var(--t1);box-shadow:0 0 0 2px var(--s1) inset}
.cm-inp{height:36px;padding:0 12px;border:1px solid var(--b2);border-radius:999px;background:var(--bg);color:var(--t1);font:inherit;font-size:13px;min-width:0}
.cm-person{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--b1)}.cm-person .nm{flex:0 1 240px;min-width:0}.cm-person .nm b{display:block;font-size:13.5px}.cm-person .nm small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-person .tg{flex:1;display:flex;gap:6px;flex-wrap:wrap}.cm-tgb{height:24px;padding:0 10px;border-radius:999px;border:1px dashed var(--b2);background:none;color:var(--t3);font:inherit;font-size:11.5px;font-weight:600;cursor:pointer}.cm-tgb.on{border-style:solid}
.cm-ment .gi{flex:none;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:var(--adim);color:var(--acc)}.cm-ment small{font-size:11.5px;color:var(--t3)}
.cm-rules{position:absolute;inset:0;z-index:12;display:grid;place-items:center;padding:16px;background:color-mix(in srgb,var(--bg) 70%,transparent);backdrop-filter:blur(3px)}
@container (max-width:980px){.cm,.cm.th{grid-template-columns:minmax(0,1fr)}.cm-rail{display:none}.cm-chips{display:flex}.cm.th .cm-tp{position:absolute;inset:0;z-index:10;border-left:0}.cm-sr{width:auto;flex:1}.cm-h .ti{flex:0 1 auto}.cm-h .ti small{display:none}}
@container (max-width:560px){.cm-col{max-width:84%}.cm-row{padding:1px 8px}.cm-av{width:28px;height:28px;font-size:11px}.cm-tools{display:none}.cm-row.menu .cm-tools{display:flex;opacity:1}}
@media (hover:none){.cm-tools{opacity:1}}
@media (prefers-reduced-motion:reduce){.cm-row.hl .cm-bub{animation:none}.cm-send,.cm-pop.em button{transition:none}}
`;

// ── the badge: unread count (max "99+") and whether Hyperplane posted (the admin mark) ──
export function useCommunityUnread(api, base, enabled = true) {
  const [u, setU] = useState({ n: 0, admin: false });
  const refresh = useCallback(() => enabled ? api(`${base}/unread`).then(setU).catch(() => {}) : Promise.resolve(), [api, base, enabled]);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 30000);
    const v = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [refresh, enabled]);
  return { ...u, refresh, set: setU };
}

export const CommunityIcon = ({ size = 18 }) => <Ic n="chat" s={size}/>;

export function CommunityButton({ unread, onOpen, active }) {
  const n = unread.n || 0, adm = n > 0 && unread.admin;
  return (
    <button type="button" className={`nc-b cm-btn ${active ? "on" : ""}`} onClick={onOpen} id="cm-btn" data-admin={adm ? 1 : 0}
      title={adm ? "Community — new message from Hyperplane" : "Community"} aria-label={`Community, ${n} new${adm ? ", including a message from Hyperplane" : ""}`}>
      <Ic n="chat" s={17}/>
      {n > 0 && <span className={`nc-n cm-n ${adm ? "adm" : ""}`} id="cm-count">{adm && <Ic n="shield" s={10}/>}{n > 99 ? "99+" : n}</span>}
      <style>{`.cm-btn .cm-n.adm{display:inline-flex;align-items:center;gap:2px;background:var(--acc);color:var(--bg)}`}</style>
    </button>);
}

const Avatar = ({ m, sp }) => m.admin ? <span className={`cm-av adm ${sp ? "sp" : ""}`} title="Hyperplane"><Ic n="shield" s={16}/></span>
  : <span className={`cm-av ${sp ? "sp" : ""}`} style={{ background: hueOf(m) }}>{initials(m.name)}</span>;
const Tag = ({ t }) => <span className="cm-tg" style={{ background: `color-mix(in srgb,${t.c} 15%,transparent)`, color: t.c }}>{t.n}</span>;

// a message body: text and @mentions inline, then the images (links clickable only in the admin's messages)
function Body({ m, base, onZoom }) {
  const imgs = (m.body || []).filter(b => b.t === "img"), inl = (m.body || []).filter(b => b.t !== "img");
  return <>
    {inl.length > 0 && <div className="cm-tx">{inl.map((b, i) => b.t === "at" ? <span key={i} className={`cm-at ${b.me ? "me" : ""}`}>@{b.n}</span>
      : <React.Fragment key={i}>{m.admin ? linkify(b.v) : b.v}</React.Fragment>)}</div>}
    {imgs.length > 0 && <div className={`cm-imgs ${imgs.length === 1 ? "one" : ""}`}>{imgs.map(b => <img key={b.id} src={`${base}/images/${b.id}`} alt="shared image" loading="lazy" onClick={() => onZoom(`${base}/images/${b.id}`)}/>)}</div>}
  </>;
}

function Msg({ m, top, staff, inThread, ctx, onAct, open, setOpen, base, onZoom }) {
  const menu = open && open.id === m.id ? open.k : null;
  const showWho = top && !m.mine;
  return (
    <div className={`cm-row ${m.mine ? "me" : ""} ${m.admin ? "adm" : ""} ${top ? "cm-first" : ""} ${menu ? "menu" : ""}`} data-msg={m.id} id={`cm-m-${m.id}`}>
      {!m.mine && <Avatar m={m} sp={!top}/>}
      <div className="cm-col">
        <div className="cm-bub">
          {showWho && <div className="cm-who"><span style={{ color: hueOf(m) }} title={staff && m.email ? m.email : undefined}>{m.name}</span>
            {(m.admin || m.role_admin) && <span className="cm-badge"><Ic n="shield" s={10}/>Admin</span>}{(m.tags || []).map(t => <Tag key={t.n} t={t}/>)}</div>}
          {m.quote && <button type="button" className="cm-q" style={{ "--qc": m.quote.admin ? "var(--acc)" : undefined }} onClick={() => onAct("goto", m.quote)}><b>{m.quote.name}</b><span>{m.quote.text}</span></button>}
          {m.deleted ? <div className="cm-del">Message removed</div> : <Body m={m} base={base} onZoom={onZoom}/>}
          <span className="cm-meta">{m.fav && <span className="st"><Ic n="star" s={11} fill="currentColor"/></span>}{m.pinned && <Ic n="pin" s={11}/>}<time dateTime={m.at} title={new Date(m.at).toLocaleString("en-IN", tz)}>{tm(m.at)}</time></span>
        </div>
        {!m.deleted && m.reactions.length > 0 && <div className="cm-rx">{m.reactions.map(r => <button key={r.e} type="button" className={r.mine ? "mine" : ""} onClick={() => onAct("react", m, r.e)} data-rx={r.e}>{r.e} {r.n}</button>)}</div>}
        {!inThread && m.replies > 0 && <button type="button" className="cm-thr" onClick={() => onAct("thread", m)} data-thread={m.id}><Ic n="thread" s={13}/>{m.replies} repl{m.replies === 1 ? "y" : "ies"}{m.last_reply && <small>· {ago(m.last_reply)}</small>}</button>}
        {ctx && <div className="cm-ctx">{m.thread ? <>In a thread · <button type="button" onClick={() => onAct("thread", { id: m.thread, body: [], reactions: [], name: "", at: m.at })}>Open the thread</button></> : <><button type="button" onClick={() => onAct("show", m)}>Show in the chat</button>{m.replies > 0 ? " · has replies" : ""}</>}</div>}
      </div>
      {!m.deleted && <div className="cm-tools" role="toolbar" aria-label="Message actions">
        <button type="button" title="React" aria-label="React" onClick={() => setOpen(menu === "em" ? null : { id: m.id, k: "em" })} data-react-open={m.id}><Ic n="smile" s={15}/></button>
        <button type="button" title="Reply" aria-label="Reply" onClick={() => onAct("quote", m)} data-reply={m.id}><Ic n="reply" s={15}/></button>
        {!inThread && !m.thread && <button type="button" title="Reply in thread" aria-label="Reply in thread" onClick={() => onAct("thread", m)} data-thread-open={m.id}><Ic n="thread" s={15}/></button>}
        <button type="button" className={m.fav ? "on" : ""} title={m.fav ? "Remove from favourites" : "Add to favourites"} aria-label="Favourite" onClick={() => onAct("fav", m)} data-fav={m.id}><Ic n="star" s={15} fill={m.fav ? "currentColor" : undefined}/></button>
        <button type="button" title="More" aria-label="More" onClick={() => setOpen(menu === "more" ? null : { id: m.id, k: "more" })} data-more={m.id}><Ic n="more" s={15}/></button>
        {menu === "em" && <div className="cm-pop em" role="menu">{REACT.map(e => <button key={e} type="button" onClick={() => { setOpen(null); onAct("react", m, e); }} data-pick-rx={e}>{e}</button>)}</div>}
        {menu === "more" && <div className="cm-pop" role="menu">
          <button type="button" className="it" onClick={() => { setOpen(null); onAct("copy", m); }}><Ic n="copy" s={14}/>Copy text</button>
          {!m.mine && m.role_admin && <button type="button" className="it" onClick={() => { setOpen(null); onAct("mention", m); }} data-mention={m.id}><Ic n="at" s={14}/>Mention {m.name.split(" ")[0]}</button>}
          {staff && !m.thread && <button type="button" className="it" onClick={() => { setOpen(null); onAct("pin", m); }} data-pin={m.id}><Ic n="pin" s={14}/>{m.pinned ? "Unpin" : "Pin to the top"}</button>}
          {staff && !m.admin && m.customer_id && <button type="button" className="it" onClick={() => { setOpen(null); onAct("tags", m); }} data-tagp={m.id}><Ic n="tag" s={14}/>Tags for {m.name.split(" ")[0]}</button>}
          {!staff && !m.mine && !m.admin && <button type="button" className="it" onClick={() => { setOpen(null); onAct("report", m); }} data-report={m.id}><Ic n="flag" s={14}/>Report</button>}
          {staff && !m.admin && m.customer_id && <><div className="sep"/><div className="lb">Pause posting for {m.name.split(" ")[0]}</div>
            {[[1, "1 hour"], [24, "24 hours"], [168, "7 days"], [null, "Until I lift it"]].map(([h, l]) => <button key={l} type="button" className="it" onClick={() => { setOpen(null); onAct("mute", m, h); }}><Ic n="mute" s={14}/>{l}</button>)}</>}
          {(m.mine || staff) && <><div className="sep"/><button type="button" className="it bad" onClick={() => { setOpen(null); onAct("delete", m); }} data-del={m.id}><Ic n="trash" s={14}/>Delete message</button></>}
        </div>}
      </div>}
    </div>);
}

// one list of messages: day pills, the "New messages" pill, consecutive messages of one person grouped (one avatar, one name)
function Messages({ items, firstNew, list, ...p }) {
  const out = []; let prev = null;
  items.forEach(m => {
    const newDay = !prev || dkey(prev.at) !== dkey(m.at);
    if (newDay) out.push(<div key={`d${m.id}`} className="cm-day"><span>{dlabel(m.at)}</span></div>);
    if (firstNew && m.id === firstNew) out.push(<div key="new" className="cm-new" id="cm-newline"><span>New messages</span></div>);
    const top = list || newDay || !prev || m.quote || prev.deleted || prev.name !== m.name || prev.admin !== m.admin || prev.hue !== m.hue || prev.mine !== m.mine
      || new Date(m.at) - new Date(prev.at) > 5 * 60000 || m.id === firstNew || prev.replies > 0 || prev.reactions.length > 0;
    out.push(<Msg key={m.id} m={m} top={!!top} ctx={list} {...p}/>);
    prev = m;
  });
  return out;
}

function Composer({ api, base, thread, quote, onQuote, onSent, muted, placeholder, idp, mentionReq }) {
  const [text, setText] = useState(""); const [imgs, setImgs] = useState([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [emo, setEmo] = useState(false);
  const [ments, setMents] = useState([]); const [pick, setPick] = useState(null);
  const ta = useRef(null), file = useRef(null), seq = useRef(0);
  useLayoutEffect(() => { const t = ta.current; if (t) { t.style.height = "auto"; t.style.height = `${Math.min(160, t.scrollHeight)}px`; } }, [text]);
  useEffect(() => { if (quote && ta.current) ta.current.focus(); }, [quote && quote.id]);
  useEffect(() => { if (mentionReq && mentionReq.k) { const tok = `@${mentionReq.n} `; setText(t => (t && !/\s$/.test(t) ? t + " " : t) + tok); setMents(o => [...o.filter(x => x.k !== mentionReq.k), { k: mentionReq.k, n: mentionReq.n }]); setTimeout(() => ta.current && ta.current.focus(), 0); } }, [mentionReq && mentionReq.t]);
  const add = async files => {
    setErr("");
    const list = [...files].filter(f => /^image\/(png|jpeg|webp)$/.test(f.type));
    if (!list.length) { setErr("Only PNG, JPEG or WebP images"); return; }
    for (const f of list.slice(0, MAX_IMG - imgs.length)) {
      try { const u = await shrinkImage(f); setImgs(o => o.length < MAX_IMG ? [...o, u] : o); } catch { setErr("That image is too large"); }
    }
    if (imgs.length + list.length > MAX_IMG) setErr(`Up to ${MAX_IMG} images per message`);
  };
  // @mentions: typing "@na…" opens the picker (members who have posted — names only)
  const look = (v, caret) => {
    const m = /(^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/.exec(v.slice(0, caret));      // a first name, or first and last
    if (!m) { setPick(null); return; }
    const q = m[2], at = caret - q.length - 1, n = ++seq.current;
    api(`${base}/people?${base.startsWith("/api/") ? "mention=1&" : ""}q=${encodeURIComponent(q)}`).then(list => { if (n === seq.current) setPick({ at, q, list, i: 0 }); }).catch(() => setPick(null));
  };
  const choose = p => {
    const t = ta.current, caret = t ? t.selectionStart : text.length;
    const v = `${text.slice(0, pick.at)}@${p.n} ${text.slice(caret)}`;
    setText(v); setMents(o => [...o.filter(x => x.k !== p.k), { k: p.k, n: p.n }]); setPick(null);
    requestAnimationFrame(() => { if (t) { const pos = pick.at + p.n.length + 2; t.focus(); t.setSelectionRange(pos, pos); } });
  };
  const blocks = () => {
    const used = ments.filter(x => text.includes(`@${x.n}`)).sort((a, b) => b.n.length - a.n.length);
    const out = [];
    if (!used.length) { if (text.trim()) out.push({ t: "text", v: text }); }
    else {
      const k = Object.fromEntries(used.map(x => [x.n, x.k]));
      text.split(new RegExp(`@(${used.map(x => esc(x.n)).join("|")})`, "g")).forEach((part, i) => {
        if (i % 2) out.push({ t: "at", k: k[part] }); else if (part) out.push({ t: "text", v: part });
      });
    }
    return [...out, ...imgs.map(src => ({ t: "img", src }))];
  };
  const send = async () => {
    if (busy || (!text.trim() && !imgs.length)) return;
    if (text.length > MAX_TEXT) { setErr(`Please keep it under ${MAX_TEXT.toLocaleString("en-IN")} characters`); return; }
    setBusy(true); setErr("");
    try {
      const m = await api(base, { method: "POST", json: { body: blocks(), reply_to: quote ? quote.id : null, thread: thread || null } });
      setText(""); setImgs([]); setMents([]); setPick(null); onQuote(null); onSent(m);
    } catch (e) { setErr(e.message); } finally { setBusy(false); if (ta.current) ta.current.focus(); }
  };
  if (muted) return <div className="cm-muted" id={`${idp}-muted`}><Ic n="mute" s={16}/>Posting is paused for your account{!/^9999/.test(muted) ? ` until ${new Date(muted).toLocaleString("en-IN", { ...tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}. You can still read the Community.</div>;
  return (
    <div className="cm-comp" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); add(e.dataTransfer.files); }}>
      {quote && <div className="cm-qc"><Ic n="reply" s={14}/><span>Replying to <b>{quote.name}</b> · {textOf(quote) || "Photo"}</span><button type="button" onClick={() => onQuote(null)} aria-label="Cancel reply"><Ic n="x" s={14}/></button></div>}
      {imgs.length > 0 && <div className="cm-imgc">{imgs.map((u, i) => <span key={i} className="cm-chip"><img src={u} alt=""/><button type="button" onClick={() => setImgs(o => o.filter((_, j) => j !== i))} aria-label="Remove image"><Ic n="x" s={12}/></button></span>)}</div>}
      <div className="cm-in">
        <div className="cm-box">
          <textarea ref={ta} rows={1} value={text} placeholder={placeholder} aria-label={placeholder} id={`${idp}-text`} maxLength={MAX_TEXT + 200}
            onChange={e => { setText(e.target.value); look(e.target.value, e.target.selectionStart); }}
            onPaste={e => { const f = [...(e.clipboardData && e.clipboardData.files || [])]; if (f.length) { e.preventDefault(); add(f); } }}
            onKeyDown={e => {
              if (pick) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setPick(p => ({ ...p, i: (p.i + (e.key === "ArrowDown" ? 1 : p.list.length - 1)) % p.list.length })); return; }
                if ((e.key === "Enter" || e.key === "Tab") && pick.list.length) { e.preventDefault(); choose(pick.list[pick.i]); return; }
                if (e.key === "Escape") { setPick(null); return; }
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
              if (e.key === "Escape" && quote) onQuote(null);
            }}/>
          <button type="button" className="cm-ib" title="Emoji" aria-label="Emoji" onClick={() => setEmo(v => !v)}><Ic n="smile" s={19}/></button>
          <button type="button" className="cm-ib" title="Mention an admin" aria-label="Mention an admin" onClick={() => { const v = text + (text && !/\s$/.test(text) ? " @" : "@"); setText(v); look(v, v.length); ta.current && ta.current.focus(); }} id={`${idp}-at`}><Ic n="at" s={18}/></button>
          <button type="button" className="cm-ib" title="Add images" aria-label="Add images" onClick={() => file.current.click()} disabled={imgs.length >= MAX_IMG}><Ic n="image" s={18}/></button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { add(e.target.files); e.target.value = ""; }} id={`${idp}-file`}/>
        </div>
        <button type="button" className="cm-send" onClick={send} disabled={busy || (!text.trim() && !imgs.length)} id={`${idp}-send`} title="Send" aria-label="Send"><Ic n="send" s={18}/></button>
      </div>
      {pick && <div className="cm-ment" role="listbox" id={`${idp}-ment`}><div className="lb">Mention an admin</div>{!pick.list.length && <small style={{ display: "block", padding: "4px 8px 8px" }}>No admin by that name.</small>}{pick.list.map((p, i) => (
        <button key={p.k} type="button" className={i === pick.i ? "on" : ""} onMouseDown={e => { e.preventDefault(); choose(p); }} data-person={p.n}>
          <span className="cm-av" style={{ background: HUES[(p.hue || 0) % HUES.length] }}>{initials(p.n)}</span><span style={{ flex: 1 }}>{p.n}</span><span className="cm-badge"><Ic n="shield" s={10}/>Admin</span>{(p.tags || []).slice(0, 2).map(t => <Tag key={t.n} t={t}/>)}</button>))}</div>}
      {emo && <div className="cm-emo">{PICK.map(e => <button key={e} type="button" onClick={() => { setText(t => t + e); setEmo(false); ta.current && ta.current.focus(); }}>{e}</button>)}</div>}
      <div className="cm-hint">{err ? <span className="er" role="alert">{err}</span> : <span>Enter to send · Shift+Enter new line · @ to mention an admin · paste images</span>}<span className="sp"/>{text.length > MAX_TEXT - 300 && <span>{text.length}/{MAX_TEXT}</span>}</div>
    </div>);
}

// ── a calendar range picker (round 19g, owner: "a date picker, not the type one"): click the first day, then the last; the range lights
// up (hover previews it); month / year selects jump far back; days outside [min, max] cannot be picked. Dates are "YYYY-MM-DD" strings.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad2 = n => String(n).padStart(2, "0");
function RangeCal({ min, max, value, onChange }) {
  const [ym, setYm] = useState(() => (value.to || value.from || max).slice(0, 7));
  const [hover, setHover] = useState(null);
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1;
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();   // weeks start on Monday
  const go = (yy, mm) => { const d0 = new Date(yy, mm, 1); setYm(`${d0.getFullYear()}-${pad2(d0.getMonth() + 1)}`); };
  const lo = (min || max).slice(0, 7), hi = max.slice(0, 7);
  const end = value.to || (value.from && hover && hover >= value.from ? hover : null);
  const pick = iso => onChange(!value.from || value.to || iso < value.from ? { from: iso, to: "" } : { from: value.from, to: iso });
  const years = []; for (let k = +lo.slice(0, 4); k <= +hi.slice(0, 4); k++) years.push(k);
  return (
    <div className="cm-cal" id="cm-cal" onMouseLeave={() => setHover(null)}>
      <div className="cm-cal-h">
        <button type="button" className="cm-cal-nav" onClick={() => go(y, m - 1)} disabled={ym <= lo} aria-label="Previous month" id="cm-cal-prev">‹</button>
        <select value={m} onChange={e => go(y, +e.target.value)} aria-label="Month" id="cm-cal-m">{MONTHS.map((n, i) => <option key={n} value={i} disabled={`${y}-${pad2(i + 1)}` < lo || `${y}-${pad2(i + 1)}` > hi}>{n}</option>)}</select>
        <select value={y} onChange={e => { const ny = +e.target.value; const nm = `${ny}-${pad2(m + 1)}` < lo ? +lo.slice(5) - 1 : `${ny}-${pad2(m + 1)}` > hi ? +hi.slice(5) - 1 : m; go(ny, nm); }} aria-label="Year" id="cm-cal-y">{years.map(k => <option key={k} value={k}>{k}</option>)}</select>
        <button type="button" className="cm-cal-nav" onClick={() => go(y, m + 1)} disabled={ym >= hi} aria-label="Next month" id="cm-cal-next">›</button>
      </div>
      <div className="cm-cal-g">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(w => <span key={w} className="wd">{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`}/>)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${ym}-${pad2(i + 1)}`, off = (min && iso < min) || iso > max;
          const a = value.from === iso, b = end === iso, inr = value.from && end && iso > value.from && iso < end;
          return <button key={iso} type="button" disabled={off} data-day={iso} onClick={() => pick(iso)} onMouseEnter={() => setHover(iso)}
            className={`${a ? "st" : ""} ${b ? "en" : ""} ${inr ? "in" : ""} ${iso === max ? "td" : ""} ${a && (b || !end) ? "one" : ""}`}>{i + 1}</button>;
        })}
      </div>
    </div>);
}

function Dialog({ title, children, onClose }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  return <div className="cm-ov" onClick={onClose}><div className="cm-dlg" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}><h3>{title}</h3>{children}</div></div>;
}

// ── admin: member tags — create / rename / colour / delete, and give them to people ──
function TagAdmin({ api, base, focus }) {
  const [d, setD] = useState(null); const [ppl, setPpl] = useState(null); const [q, setQ] = useState(focus || ""); const [nt, setNt] = useState({ name: "", color: null }); const [err, setErr] = useState("");
  const load = () => api(`${base}/tags`).then(r => { setD(r); setNt(o => ({ ...o, color: o.color || r.colors[0] })); }).catch(e => setErr(e.message));
  const loadP = s => api(`${base}/people?q=${encodeURIComponent(s)}`).then(setPpl).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => loadP(q), 250); return () => clearTimeout(t); }, [q]);
  const add = async () => { setErr(""); try { await api(`${base}/tags`, { method: "POST", json: nt }); setNt(o => ({ ...o, name: "" })); load(); } catch (e) { setErr(e.message); } };
  const del = async t => { try { await api(`${base}/tags/${t.id}`, { method: "DELETE" }); load(); loadP(q); } catch (e) { setErr(e.message); } };
  const recolor = async (t, color) => { try { await api(`${base}/tags/${t.id}`, { method: "PUT", json: { name: t.name, color } }); load(); } catch (e) { setErr(e.message); } };
  const toggle = async (p, id) => {
    const ids = p.tag_ids.includes(id) ? p.tag_ids.filter(x => x !== id) : [...p.tag_ids, id];
    setPpl(o => o.map(x => x.id === p.id ? { ...x, tag_ids: ids } : x));
    try { await api(`${base}/people/${p.id}/tags`, { method: "PUT", json: { tag_ids: ids } }); load(); } catch (e) { setErr(e.message); loadP(q); }
  };
  if (!d) return <div className="cm-pane">{err || "Loading…"}</div>;
  return (
    <div className="cm-pane" id="cm-tags">
      {err && <div className="cm-card" style={{ color: "var(--short,#e5484d)" }}>{err}</div>}
      <div className="cm-card">
        <h4>Tags</h4><small>Labels shown beside a person's name in the Community — for example Mentor, Pro member, Moderator. Only you create and give them; everyone sees them.</small>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="cm-inp" value={nt.name} onChange={e => setNt(o => ({ ...o, name: e.target.value.slice(0, 24) }))} placeholder="New tag name" id="cm-tag-name" style={{ flex: "1 1 180px" }} onKeyDown={e => e.key === "Enter" && add()}/>
          <div className="cm-sw">{d.colors.map(c => <button key={c} type="button" className={nt.color === c ? "on" : ""} style={{ background: c }} onClick={() => setNt(o => ({ ...o, color: c }))} aria-label={`Colour ${c}`}/>)}</div>
          {nt.name.trim().length >= 2 && <Tag t={{ n: nt.name.trim(), c: nt.color }}/>}
          <button type="button" className="cm-b pri sm" onClick={add} disabled={nt.name.trim().length < 2} id="cm-tag-add">Create tag</button>
        </div>
        {d.tags.length ? d.tags.map(t => <div key={t.id} className="cm-tagrow" data-tag={t.name}><Tag t={{ n: t.name, c: t.color }}/><small>{t.members} {t.members === 1 ? "person" : "people"}</small>
          <div className="cm-sw">{d.colors.map(c => <button key={c} type="button" className={t.color === c ? "on" : ""} style={{ background: c, width: 18, height: 18 }} onClick={() => recolor(t, c)} aria-label={`Colour ${c}`}/>)}</div>
          <button type="button" className="cm-b sm bad" onClick={() => del(t)}>Delete</button></div>) : <small>No tags yet — create the first one above.</small>}
      </div>
      <div className="cm-card">
        <h4>Give tags to people</h4>
        <input className="cm-inp" value={q} onChange={e => setQ(e.target.value)} placeholder="Search a name or email" id="cm-tag-q"/>
        {!ppl ? <small>Loading…</small> : !ppl.length ? <small>Nobody found.</small> : ppl.map(p => (
          <div key={p.id} className="cm-person" data-person-row={p.id}>
            <span className="cm-av" style={{ background: HUES[p.id % HUES.length] }}>{initials(p.name)}</span>
            <div className="nm"><b>{p.name}</b><small>{p.email}{p.posted ? "" : " · has not posted yet"}</small></div>
            <div className="tg">{d.tags.length ? d.tags.map(t => { const on = p.tag_ids.includes(t.id); return (
              <button key={t.id} type="button" className={`cm-tgb ${on ? "on" : ""}`} style={on ? { background: `color-mix(in srgb,${t.color} 15%,transparent)`, color: t.color, borderColor: t.color } : null}
                onClick={() => toggle(p, t.id)} data-give={t.name}>{on ? "✓ " : "+ "}{t.name}</button>); }) : <small>Create a tag first</small>}</div>
          </div>))}
      </div>
    </div>);
}


const VIEWS = [["chat", "Community chat", "hash"], ["fav", "Favourites", "star"], ["mentions", "Mentions", "at"], ["pinned", "Pinned", "pin"]];
const ADMIN_VIEWS = [["tags", "Member tags", "tag"], ["reports", "Reports", "flag"], ["muted", "Paused members", "mute"]];
const EMPTY = {
  fav: ["star", "No favourites yet", "Tap ☆ on any message to keep it here — with its thread."],
  mentions: ["at", "No mentions yet", "When someone mentions you with @, it shows here and in your Inbox."],
  pinned: ["pin", "Nothing pinned", "Important notes from Hyperplane are pinned here."],
};

export function Community({ api, base, staff = false, onChanged = () => {}, height, openReq }) {
  const [d, setD] = useState(null); const [err, setErr] = useState("");
  const [items, setItems] = useState([]); const [open, setOpen] = useState(null); const [quote, setQuote] = useState(null);
  const [th, setTh] = useState(null); const [thQuote, setThQuote] = useState(null);
  const [zoom, setZoom] = useState(null); const [dlg, setDlg] = useState(null); const [why, setWhy] = useState("");
  const [atEnd, setAtEnd] = useState(false); const [fresh, setFresh] = useState(0); const [firstNew, setFirstNew] = useState(null);
  const [dayV, setDayV] = useState(null); const [dp, setDp] = useState(false); const [draft, setDraft] = useState({ from: "", to: "" }); const [view, setView] = useState("chat"); const [vlist, setVlist] = useState(null);   // dayV = one day opened by the date search
  const [reports, setReports] = useState(null); const [muted, setMuted] = useState(null); const [mreq, setMreq] = useState(null); const [tagFocus, setTagFocus] = useState("");
  const list = useRef(null), tlist = useRef(null), last = useRef(0), sentRead = useRef(0), tick = useRef(0), endRef = useRef(false), first = useRef(true);
  const lastId = its => its.reduce((a, m) => Math.max(a, m.id), 0);
  const merge = (o, add) => { const by = new Map(o.map(m => [m.id, m])); add.forEach(m => by.set(m.id, m)); return [...by.values()].filter(m => !(m.deleted && !m.replies)).sort((a, b) => a.id - b.id); };
  const toEnd = (el = list.current) => { if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); };
  const markRead = useCallback(id => { if (id > sentRead.current && document.visibilityState === "visible") { sentRead.current = id; api(`${base}/read`, { method: "POST", json: staff ? { ids: [id] } : { last_id: id } }).then(onChanged).catch(() => {}); } }, [api, base]);
  const load = useCallback(async () => {
    try {
      const r = await api(base); setD(r); setErr(""); setItems(r.items); last.current = lastId(r.items);
      if (!first.current) return;                                      // the "New messages" line is set once, on opening
      first.current = false;
      const fn = r.me ? (r.items.find(m => m.id > r.me.last_read && !m.mine) || {}).id : null; setFirstNew(fn || null);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = fn && document.getElementById("cm-newline"), l = list.current;
        if (el && l) l.scrollTop = el.offsetTop - 60; else if (l) l.scrollTop = l.scrollHeight;
        if (l) { const end = l.scrollHeight - l.scrollTop - l.clientHeight < 80; endRef.current = end; setAtEnd(end); }
      }));
    } catch (e) { setErr(e.message); }
  }, [api, base]);
  useEffect(() => { load(); }, [load]);
  // the room every 4 s while the page is visible; every 4th time also the state of what is on screen (reactions, replies, removed, pinned, favourites)
  useEffect(() => {
    if (!d) return undefined;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible" || dayV) return;
      try {
        const r = await api(`${base}?after=${last.current}`);
        if (r.items.length) {
          last.current = Math.max(last.current, lastId(r.items)); setItems(o => merge(o, r.items));
          if (endRef.current) toEnd(); else setFresh(n => n + r.items.filter(m => !m.mine).length);
        }
        if (++tick.current % 4 === 0) {
          const ids = (list.current ? [...list.current.querySelectorAll("[data-msg]")].map(e => +e.dataset.msg) : []).slice(-120);
          const s = await api(`${base}/refresh`, { method: "POST", json: { ids: [...new Set([...ids, ...(d.pinned || []).map(m => m.id)])] } });
          setItems(o => merge(o, s.items.filter(m => o.some(x => x.id === m.id))));
          setD(o => ({ ...o, counts: s.counts || o.counts, pinned: s.pinned || o.pinned, reports: s.reports ?? o.reports }));
        }
      } catch { /* the next tick tries again */ }
    }, 4000);
    return () => clearInterval(t);
  }, [!!d, !!dayV]);
  useEffect(() => { if (view === "chat" && atEnd && items.length && d && (staff || (d.me && d.me.rules_ok))) { markRead(lastId(items)); setFresh(0); } }, [atEnd, items, view, d && d.me && d.me.rules_ok]);
  const onScroll = e => { const el = e.currentTarget, end = el.scrollHeight - el.scrollTop - el.clientHeight < 80; endRef.current = end; if (end !== atEnd) setAtEnd(end); };
  const older = async () => {
    const el = list.current, h = el.scrollHeight;
    const r = await api(`${base}?before=${items[0].id}`).catch(() => null); if (!r) return;
    setItems(o => merge(o, r.items)); setD(o => ({ ...o, more: r.more }));
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - h; });
  };
  // the other views (favourites, mentions, pinned)
  const loadView = useCallback(async v => {
    try { const r = await api(`${base}?view=${v}`); setVlist(r.items); setD(o => ({ ...o, counts: { ...(o.counts || {}), [v]: r.items.length } })); }   // the number = what is shown
    catch (e) { setErr(e.message); }
  }, [api, base]);
  const go = v => { setView(v); setDayV(null); setVlist(null); if (EMPTY[v]) loadView(v); if (v === "chat") { endRef.current = true; setAtEnd(true); toEnd(); } };
  useEffect(() => { if (staff && (view === "reports" || view === "muted")) loadReports(); }, [view]);
  // threads
  const loadThread = useCallback(async (id, keep) => {
    try { const r = await api(`${base}?thread=${id}`); setTh(r); if (!keep) toEnd(tlist.current); if (!staff && r.items.length) api(`${base}/read`, { method: "POST", json: { last_id: lastId(r.items), thread: id } }).then(onChanged).catch(() => {}); }
    catch (e) { setTh(null); setDlg({ k: "info", t: "Thread not found", x: e.message }); }
  }, [api, base]);
  useEffect(() => {
    if (!th) return undefined;
    const id = th.root.id;
    const t = setInterval(() => document.visibilityState === "visible" && loadThread(id, true), 4000);
    return () => clearInterval(t);
  }, [th && th.root.id]);
  useEffect(() => { if (th) toEnd(tlist.current); }, [th && th.items.length]);
  // opened from the Inbox (a mention): that message, in its thread or in Mentions
  useEffect(() => {
    if (!openReq || !d) return;
    if (openReq.thread) { setTh({ root: { id: openReq.thread, body: [], reactions: [], name: "", at: null }, items: [] }); loadThread(openReq.thread); }
    else go("mentions");
    setTimeout(() => act("goto", { id: openReq.mid }), 900);
  }, [openReq && openReq.n, !!d]);
  const patch = m => {
    setItems(o => merge(o, o.some(x => x.id === m.id) ? [m] : []));
    setVlist(o => o && (view === "fav" && !m.fav ? o.filter(x => x.id !== m.id) : o.map(x => x.id === m.id ? m : x)));
    setTh(t => t && (t.root.id === m.id ? { ...t, root: m } : { ...t, items: t.items.map(x => x.id === m.id ? m : x) }));
  };
  const act = async (k, m, arg) => {
    try {
      if (k === "quote") { if (th && (m.thread === th.root.id || m.id === th.root.id)) setThQuote(m); else { if (view !== "chat") go("chat"); setQuote(m); } }
      else if (k === "thread") { setThQuote(null); setTh({ root: m, items: [] }); loadThread(m.id); }
      else if (k === "react") patch(await api(`${base}/${m.id}/react`, { method: "PUT", json: { emoji: arg } }));
      else if (k === "fav") { const r = await api(`${base}/${m.id}/fav`, { method: "PUT" }); patch(r); setD(o => ({ ...o, counts: { ...(o.counts || {}), fav: Math.max(0, ((o.counts || {}).fav || 0) + (r.fav ? 1 : -1)) } })); }
      else if (k === "copy") { try { await navigator.clipboard.writeText(textOf(m)); } catch { /* not allowed */ } }
      else if (k === "mention") { if (view !== "chat") go("chat"); const pp = await api(`${base}/people?${staff ? "mention=1&" : ""}q=${encodeURIComponent(m.name)}`); const p = pp.find(x => x.n === m.name); if (p) setMreq({ k: p.k, n: p.n, t: Date.now() }); }
      else if (k === "pin") { const r = await api(`${base}/${m.id}/pin`, { method: "PUT", json: { on: !m.pinned } }); patch(r); setD(o => ({ ...o, pinned: r.pinned ? [r, ...(o.pinned || [])] : (o.pinned || []).filter(p => p.id !== r.id) })); }
      else if (k === "tags") { setTagFocus(m.email || m.name); setView("tags"); }
      else if (k === "report") { setWhy(""); setDlg({ k: "report", m }); }
      else if (k === "delete") setDlg({ k: "delete", m });
      else if (k === "mute") { await api(`${base}/mute`, { method: "POST", json: { customer_id: m.customer_id, hours: arg } }); setDlg({ k: "info", t: `Posting paused for ${m.name}`, x: arg === null ? "Until you lift it in Paused members." : `For ${arg === 1 ? "1 hour" : arg === 24 ? "24 hours" : "7 days"}.` }); }
      else if (k === "show") { go("chat"); setTimeout(() => act("goto", m), 300); }
      else if (k === "goto") { const el = document.getElementById(`cm-m-${m.id}`); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.remove("hl"); void el.offsetWidth; el.classList.add("hl"); } }
    } catch (e) { setDlg({ k: "info", t: "Could not do that", x: e.message }); }
  };
  const confirm = async () => {
    const { k, m } = dlg;
    try {
      if (k === "delete") { await api(`${base}/${m.id}`, { method: "DELETE" }); const gone = { ...m, deleted: true, body: [], reactions: [], pinned: false };
        if (th && th.root.id === m.id) setTh(t => ({ ...t, root: gone })); setTh(t => t && { ...t, items: t.items.filter(x => x.id !== m.id) });
        setItems(o => merge(o.filter(x => x.id !== m.id), m.replies ? [gone] : [])); setVlist(o => o && o.filter(x => x.id !== m.id)); setD(o => ({ ...o, pinned: (o.pinned || []).filter(p => p.id !== m.id) })); setDlg(null); }
      if (k === "report") { await api(`${base}/${m.id}/report`, { method: "POST", json: { reason: why } }); setDlg({ k: "info", t: "Thank you", x: "The Hyperplane team will look at this message." }); }
    } catch (e) { setDlg({ k: "info", t: "Could not do that", x: e.message }); }
  };
  useEffect(() => { const h = e => { if (!e.target.closest || !e.target.closest(".cm-pop,.cm-tools")) setOpen(null); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  // date search (round 19e: a From — To range): the messages between two days, oldest first, 300 at a time; back to the latest
  const openRange = async (from, to) => {
    setDp(false);
    if (!from) { setDayV(null); endRef.current = true; setAtEnd(true); toEnd(); return; }
    try { const r = await api(`${base}?dfrom=${from}&dto=${to || from}`); setDayV(r); setDraft({ from: r.from, to: r.to }); requestAnimationFrame(() => { if (list.current) list.current.scrollTop = 0; }); }
    catch (e) { setDlg({ k: "info", t: "Could not open those dates", x: e.message }); }
  };
  const moreRange = async () => {
    try { const r = await api(`${base}?dfrom=${dayV.from}&dto=${dayV.to}&cursor=${encodeURIComponent(dayV.cursor)}`); setDayV(o => ({ ...o, items: [...o.items, ...r.items], more: r.more, cursor: r.cursor })); }
    catch (e) { setDlg({ k: "info", t: "Could not load more", x: e.message }); }
  };
  useEffect(() => { if (!dp) return undefined; const h = e => { if (!e.target.closest || !e.target.closest(".cm-dp,.cm-datebtn")) setDp(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [dp]);
  const today = new Date().toLocaleDateString("en-CA", tz);
  const ago_d = n => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA", tz);
  const PRESETS = [["Today", ago_d(0), today], ["Yesterday", ago_d(1), ago_d(1)], ["Last 7 days", ago_d(6), today], ["Last 30 days", ago_d(29), today], ["This month", `${today.slice(0, 8)}01`, today]];
  const dfmt = iso => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const loadReports = () => Promise.all([api(`${base}/reports`), api(`${base}/members`)]).then(([r, m]) => { setReports(r); setMuted(m); setD(o => ({ ...o, reports: r.length })); }).catch(e => setErr(e.message));
  if (!d) return <div className="cm-wrap"><style>{CM_CSS}</style><div className="cm" style={height ? { "--cm-h": height } : null}><div className="cm-empty" style={{ gridColumn: "1/-1" }}>{err || "Loading the Community…"}</div></div></div>;
  const me = d.me || {}, isMuted = me.muted_until && new Date(me.muted_until) > new Date() ? me.muted_until : null;
  const counts = d.counts || {};
  const P = { staff, open, setOpen, base, onZoom: setZoom, onAct: act };
  const views = [...VIEWS, ...(staff ? ADMIN_VIEWS : [])];
  const badge = k => k === "chat" ? (fresh || 0) : k === "reports" ? d.reports || 0 : counts[k] || 0;
  const title = (views.find(v => v[0] === view) || VIEWS[0])[1];
  const pinned = (d.pinned || [])[0];
  return (
    <div className="cm-wrap"><style>{CM_CSS}</style>
      <div className={`cm ${th ? "th" : ""}`} id="community" style={height ? { "--cm-h": height } : null}>
        <aside className="cm-rail" aria-label="Community views">
          <div className="cm-rh"><span className="lg"><Ic n="chat" s={20}/></span><div style={{ minWidth: 0 }}><b>Hyperplane Community</b><small><Ic n="users" s={12}/>{(d.members || 0).toLocaleString("en-IN")} members</small></div></div>
          <nav className="cm-nav">
            {VIEWS.map(([k, l, ic]) => <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => go(k)} id={`cm-v-${k}`}><Ic n={ic} s={16}/><span>{l}</span>{badge(k) > 0 && <em>{badge(k) > 99 ? "99+" : badge(k)}</em>}</button>)}
            {staff && <><div className="lb">Admin</div>{ADMIN_VIEWS.map(([k, l, ic]) => <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => go(k)} id={`cm-v-${k}`}><Ic n={ic} s={16}/><span>{l}</span>{badge(k) > 0 && <em className={k === "reports" ? "red" : ""}>{badge(k)}</em>}</button>)}</>}
          </nav>
          <div className="cm-rules-mini">Be kind · no paid tips or selling · never share phone numbers. Everyone sees only your name.</div>
        </aside>
        <section className="cm-room" aria-label={title}>
          <header className="cm-h">
            <div className="ti"><b>{title}</b><small>{view === "chat" ? `${(d.members || 0).toLocaleString("en-IN")} members · learn and discuss together` : view === "fav" ? "Your starred messages — only you see this list" : view === "mentions" ? "Messages that mention you" : view === "pinned" ? "Pinned by Hyperplane" : view === "tags" ? "Labels beside names" : view === "reports" ? "Messages members reported" : "Members whose posting is paused"}</small></div>
            {view === "chat" && <button type="button" className={`cm-datebtn ${dp || dayV ? "on" : ""}`} onClick={() => setDp(v => !v)} aria-expanded={dp} id="cm-date"><Ic n="calendar" s={15}/>{dayV ? (dayV.from === dayV.to ? dfmt(dayV.from) : `${dfmt(dayV.from)} – ${dfmt(dayV.to)}`) : "Search by date"}</button>}
            {view === "chat" && dp && <div className="cm-dp" id="cm-dp" role="dialog" aria-label="Search by date">
              <div className="cm-dp-pre">{PRESETS.map(([l, f, t]) => <button key={l} type="button" onClick={() => openRange(f, t)} data-preset={l}>{l}</button>)}</div>
              <RangeCal min={d.first_day} max={today} value={draft} onChange={setDraft}/>
              <div className="cm-dp-sum" id="cm-dp-sum"><div><span>From</span>{draft.from ? <b>{dfmt(draft.from)}</b> : <b className="no">Pick a day</b>}</div>
                <div><span>To</span>{draft.to ? <b>{dfmt(draft.to)}</b> : <b className="no">{draft.from ? "Same day — or pick the last day" : "—"}</b>}</div></div>
              <p className="cm-dp-hint">Click the first day, then the last day. {d.first_day ? `Messages start on ${dfmt(d.first_day)}.` : "No messages yet."} They show oldest first.</p>
              <div className="cm-act">{dayV && <button type="button" className="cm-b sm" onClick={() => openRange(null)}>Clear</button>}
                <button type="button" className="cm-b pri sm" disabled={!draft.from} onClick={() => openRange(draft.from, draft.to || draft.from)} id="cm-dp-go">Show messages</button></div>
            </div>}
          </header>
          <div className="cm-chips">{views.map(([k, l, ic]) => <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => go(k)}><Ic n={ic} s={14}/>{l}{badge(k) > 0 && ` · ${badge(k)}`}</button>)}</div>
          {view === "tags" ? <TagAdmin api={api} base={base} focus={tagFocus}/>
          : view === "reports" ? <div className="cm-pane" id="cm-reports">{!reports ? "Loading…" : !reports.length ? <div className="cm-empty"><div><div className="ei"><Ic n="flag" s={24}/></div><b>No open reports</b>Messages members report show up here.</div></div>
            : reports.map(r => <div key={r.id} className="cm-card" data-report-row={r.id}>
              <small>Reported by <b>{r.by}</b> ({r.by_email}) · {ago(r.at)}{r.reason ? ` · “${r.reason}”` : ""}</small>
              {r.message ? <Msg m={{ ...r.message, mine: false }} top inThread {...P} onAct={() => {}}/> : <small>The message is gone.</small>}
              <div className="cm-act" style={{ justifyContent: "flex-start" }}>
                {r.message && !r.message.deleted && <button type="button" className="cm-b bad sm" onClick={async () => { await api(`${base}/${r.message.id}`, { method: "DELETE" }); await api(`${base}/reports/${r.id}/resolve`, { method: "POST" }); loadReports(); load(); }}>Delete message</button>}
                {r.message && r.message.customer_id && <button type="button" className="cm-b sm" onClick={async () => { await api(`${base}/mute`, { method: "POST", json: { customer_id: r.message.customer_id, hours: 24 } }); await api(`${base}/reports/${r.id}/resolve`, { method: "POST" }); loadReports(); }}>Pause posting 24 h</button>}
                <button type="button" className="cm-b sm" onClick={async () => { await api(`${base}/reports/${r.id}/resolve`, { method: "POST" }); loadReports(); load(); }}>Keep — no action</button>
              </div></div>)}</div>
          : view === "muted" ? <div className="cm-pane" id="cm-muted-list">{!muted ? "Loading…" : !muted.length ? <div className="cm-empty"><div><div className="ei"><Ic n="mute" s={24}/></div><b>Nobody is paused</b>Use a message's ⋯ menu to pause someone's posting.</div></div>
            : muted.map(m => <div key={m.customer_id} className="cm-card"><b>{m.name}</b><small>{m.email} · {/^9999/.test(m.muted_until) ? "until lifted" : `until ${new Date(m.muted_until).toLocaleString("en-IN", tz)}`}{m.mute_reason ? ` · ${m.mute_reason}` : ""}</small>
              <div className="cm-act" style={{ justifyContent: "flex-start" }}><button type="button" className="cm-b sm" onClick={async () => { await api(`${base}/mute`, { method: "POST", json: { customer_id: m.customer_id, hours: 0 } }); loadReports(); }}>Lift</button></div></div>)}</div>
          : <>
            {view === "chat" && dayV && <div className="cm-dayb" id="cm-dayview"><Ic n="calendar" s={15}/>
              <b>{dayV.from === dayV.to ? dfmt(dayV.from) : `${dfmt(dayV.from)} – ${dfmt(dayV.to)}`}<small>{(dayV.total || 0).toLocaleString("en-IN")} message{dayV.total === 1 ? "" : "s"}</small></b>
              <button type="button" className="cm-b sm" onClick={() => setDp(true)} id="cm-day-change">Change dates</button>
              <button type="button" className="cm-b pri sm" onClick={() => openRange(null)} id="cm-day-back">Back to the latest</button></div>}
            {view === "chat" && pinned && !dayV && <div className="cm-pins" id="cm-pins" onClick={() => (d.pinned.length > 1 ? go("pinned") : act("goto", pinned))} data-pinned={pinned.id}><Ic n="pin" s={15}/><span className="tx"><b>{pinned.name}</b>{textOf(pinned) || "Photo"}</span><em>{d.pinned.length > 1 ? `${d.pinned.length} pinned` : dlabel(pinned.at)}</em></div>}
            <div className="cm-list" ref={list} onScroll={view === "chat" ? onScroll : undefined} id="cm-list" aria-live="polite">
              {view === "chat" && dayV ? (!dayV.items.length ? <div className="cm-empty"><div><div className="ei"><Ic n="calendar" s={24}/></div><b>No messages</b>Nothing was posted between these dates.</div></div>
                : <><Messages items={dayV.items} {...P}/>{dayV.more && <button type="button" className="cm-more" onClick={moreRange} id="cm-range-more">Load more messages</button>}</>)
                : view !== "chat" ? (!vlist ? <div className="cm-empty">Loading…</div> : !vlist.length ? <div className="cm-empty"><div><div className="ei"><Ic n={EMPTY[view][0]} s={24}/></div><b>{EMPTY[view][1]}</b>{EMPTY[view][2]}</div></div>
                  : <Messages items={vlist} list {...P}/>)
                : <>
                  {d.more && <button type="button" className="cm-more" onClick={older} id="cm-older">Show earlier messages</button>}
                  {!items.length ? <div className="cm-empty"><div><div className="ei"><Ic n="chat" s={24}/></div><b>Welcome to the Hyperplane Community</b>Say hello — share what you are learning about trading with the trend.</div></div>
                    : <Messages items={items} firstNew={firstNew} {...P}/>}
                </>}
            </div>
            {view === "chat" && !atEnd && fresh > 0 && !dayV && <button type="button" className="cm-jump" onClick={() => { toEnd(); setFresh(0); }} id="cm-jump"><Ic n="down" s={14}/>{fresh} new</button>}
            {view === "chat" && !dayV && <Composer api={api} base={base} quote={quote} onQuote={setQuote} muted={isMuted} idp="cm" mentionReq={mreq} placeholder={staff ? "Message everyone as Hyperplane" : "Type a message"}
              onSent={m => { setItems(o => merge(o, [m])); last.current = Math.max(last.current, m.id); setFirstNew(null); endRef.current = true; setAtEnd(true); toEnd(); }}/>}
          </>}
          {!staff && !me.rules_ok && <div className="cm-rules" id="cm-rules"><div className="cm-dlg" role="dialog" aria-label="Community rules">
            <h3>Welcome to the Hyperplane Community</h3>
            <p>A place for Hyperplane members to learn and discuss together. Everyone sees your <b>name</b> and what you post — never your email or phone number.</p>
            <ul><li>Be respectful — no insults, no spam.</li><li>No paid tips, no selling, no promotions.</li><li>Do not share phone numbers or personal details.</li><li>Posts are for learning, not investment advice.</li></ul>
            <div className="cm-act"><button type="button" className="cm-b pri" id="cm-accept" onClick={async () => { await api(`${base}/rules`, { method: "POST" }); load(); }}>I agree — join the Community</button></div>
          </div></div>}
        </section>
        {th && <aside className="cm-tp" aria-label="Thread" id="cm-thread">
          <div className="cm-tph"><b>Thread<small>{th.root.replies || 0} repl{th.root.replies === 1 ? "y" : "ies"}</small></b><button type="button" className="cm-x" onClick={() => { setTh(null); setThQuote(null); }} aria-label="Close thread" id="cm-thread-x"><Ic n="x" s={15}/></button></div>
          <div className="cm-list" ref={tlist}>
            {th.root.at && <Msg m={th.root} top inThread {...P}/>}
            <div className="cm-tsep">{th.items.length ? `${th.items.length} repl${th.items.length === 1 ? "y" : "ies"}` : "No replies yet — start the thread"}</div>
            <Messages items={th.items} inThread {...P}/>
          </div>
          {th.root.deleted ? <div className="cm-muted">This message was removed — the thread is closed.</div>
            : <Composer api={api} base={base} thread={th.root.id} quote={thQuote} onQuote={setThQuote} muted={isMuted} idp="cmt" placeholder="Reply in the thread"
              onSent={m => { setTh(t => ({ ...t, items: [...t.items, m], root: { ...t.root, replies: (t.root.replies || 0) + 1 } })); setItems(o => o.map(x => x.id === th.root.id ? { ...x, replies: (x.replies || 0) + 1, last_reply: m.at } : x)); }}/>}
        </aside>}
      </div>
      {zoom && <div className="cm-ov cm-zoom" onClick={() => setZoom(null)} role="dialog" aria-label="Image"><img src={zoom} alt="shared image, full size"/></div>}
      {dlg && dlg.k === "delete" && <Dialog title="Delete this message?" onClose={() => setDlg(null)}><p>It is removed for everyone{dlg.m.replies ? "; its thread stays, marked as removed" : ""}. This cannot be undone.</p>
        <div className="cm-act"><button type="button" className="cm-b" onClick={() => setDlg(null)}>Cancel</button><button type="button" className="cm-b bad" onClick={confirm} id="cm-del-ok">Delete</button></div></Dialog>}
      {dlg && dlg.k === "report" && <Dialog title="Report this message" onClose={() => setDlg(null)}><p>Tell us what is wrong (optional). Only the Hyperplane team sees reports.</p>
        <textarea value={why} onChange={e => setWhy(e.target.value.slice(0, 300))} placeholder="Spam, rude, selling tips…" id="cm-why"/>
        <div className="cm-act"><button type="button" className="cm-b" onClick={() => setDlg(null)}>Cancel</button><button type="button" className="cm-b pri" onClick={confirm} id="cm-report-ok">Report</button></div></Dialog>}
      {dlg && dlg.k === "info" && <Dialog title={dlg.t} onClose={() => setDlg(null)}><p>{dlg.x}</p><div className="cm-act"><button type="button" className="cm-b pri" onClick={() => setDlg(null)}>OK</button></div></Dialog>}
    </div>);
}
