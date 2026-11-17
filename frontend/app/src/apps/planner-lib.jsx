// Hyperplane Planner (round 22) — the pieces every Planner file shares: its icons, the notebook colours, dates, the pop-up,
// the date-range picker, the topic box and the templates. Everything here is private to the Planner chunk.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ── icons: the shell's ICON_PATHS has no notebook / editor icons, so the Planner keeps its own (Lucide paths, 24 × 24, stroke)
const P = {
  book: <><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></>,
  chart: <><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/></>,
  briefcase: <><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></>,
  check: <><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></>,
  dumbbell: <><path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/></>,
  heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>,
  star: <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>,
  home: <><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>,
  bulb: <><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></>,
  wallet: <><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></>,
  plane: <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>,
  code: <><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  leaf: <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></>,
  pen: <><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></>,
  // the screen
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></>,
  note: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></>,
  newnote: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/></>,
  tasks: <><rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></>,
  calendar: <><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></>,
  project: <><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/></>,
  graph: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/></>,
  plus: <><path d="M5 12h14"/><path d="M12 5v14"/></>,
  minus: <path d="M5 12h14"/>,
  x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
  search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
  left: <path d="m15 18-6-6 6-6"/>,
  right: <path d="m9 18 6-6-6-6"/>,
  down: <path d="m6 9 6 6 6-6"/>,
  up: <path d="m18 15-6-6-6 6"/>,
  more: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
  pin: <><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></>,
  trash: <><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></>,
  merge: <><path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"/><path d="m20 22-5-5"/></>,
  split: <><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></>,
  image: <><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
  notelink: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m10 18 4-4"/><path d="M10 14h4v4"/></>,
  bold: <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>,
  italic: <><path d="M19 4h-9"/><path d="M14 20H5"/><path d="M15 4 9 20"/></>,
  underline: <><path d="M6 4v6a6 6 0 0 0 12 0V4"/><path d="M4 20h16"/></>,
  strike: <><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><path d="M4 12h16"/></>,
  highlight: <><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></>,
  list: <><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/></>,
  olist: <><path d="M10 12h11"/><path d="M10 18h11"/><path d="M10 6h11"/><path d="M4 10h2"/><path d="M4 6h1v4"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></>,
  tlist: <><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></>,
  quote: <><path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/></>,
  codeblock: <><path d="m10 9-3 3 3 3"/><path d="m14 15 3-3-3-3"/><rect x="3" y="3" width="18" height="18" rx="2"/></>,
  table: <><path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></>,
  divider: <><path d="M3 12h18"/><path d="M8 6h8"/><path d="M8 18h8"/></>,
  undo: <><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></>,
  redo: <><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/></>,
  repeat: <><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></>,
  wide: <><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></>,
  narrow: <><path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/></>,
  back: <><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></>,
  copy: <><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></>,
  restore: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></>,
  filter: <><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></>,
  tag: <><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></>,
  clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
  grid: <><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></>,
  board: <><path d="M6 5v11"/><path d="M12 5v6"/><path d="M18 5v14"/></>,
  tick: <path d="M20 6 9 17l-5-5"/>,
  alert: <><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></>,
  template: <><rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/></>,
  move: <><path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/></>,
  calx: <><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14 14-4 4"/><path d="m10 14 4 4"/></>,
  eye: <><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></>,
  eyeoff: <><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></>,
  sigma: <path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2"/>,
  panelclose: <><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/></>,
  panelopen: <><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/></>,
  expand: <><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></>,
  collapse: <><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></>,
  edit: <><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></>,
};
export const PI = ({ n, s = 16, className = "", title }) => (
  <svg className={`pl-ic ${className}`} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={s <= 14 ? 2 : 1.75}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined} aria-label={title}>{P[n] || P.book}</svg>);
export const NB_ICONS = ["book", "chart", "briefcase", "check", "dumbbell", "heart", "star", "home", "bulb", "wallet", "plane", "code", "users", "leaf", "flag", "pen"];

// ── the notebook colours: one fixed order, checked for colour-blind readers on the light and the dark surface (dataviz validator,
// 2026-11-14 — light on #ffffff and dark on #0d1520 both pass every check). A notebook's name is always written beside its colour.
export const NB_COLORS = [
  ["blue", "Blue", "#2563eb", "#3b82f6"], ["orange", "Orange", "#ea580c", "#e5662a"], ["teal", "Teal", "#0f9f8f", "#0fa594"],
  ["pink", "Pink", "#c026d3", "#c75ad2"], ["green", "Green", "#4d9a1f", "#5fa83a"], ["violet", "Violet", "#7c3aed", "#8b72f0"],
  ["amber", "Amber", "#b7791f", "#b9871c"], ["red", "Red", "#be123c", "#e0506f"], ["sky", "Sky", "#0369a1", "#2a9fd6"]];
export const NB_CSS = NB_COLORS.map(([k, , l, d]) => `.pl [data-c="${k}"],.pl-float [data-c="${k}"]{--nb:${l}}:root:not([data-theme="light"]) .pl [data-c="${k}"],:root:not([data-theme="light"]) .pl-float [data-c="${k}"]{--nb:${d}}`).join("\n");
export const nbHex = (k, dark) => { const c = NB_COLORS.find(x => x[0] === k) || NB_COLORS[0]; return dark ? c[3] : c[2]; };

// ── dates: ISO days ("2026-11-14") everywhere; the server's "today" (India time) is the truth
const D = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const isoOf = dt => dt.toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
export const dow = iso => D(iso).getUTCDay();                                              // 0 = Sunday
export const monthStart = iso => `${iso.slice(0, 8)}01`;
export const addMonths = (iso, n) => { const d = D(monthStart(iso)); d.setUTCMonth(d.getUTCMonth() + n); return isoOf(d); };
export const diffDays = (a, b) => Math.round((D(a) - D(b)) / 86400000);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const monthName = iso => `${MONTH[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
export const dayShort = (iso, today) => {
  if (!iso) return "";
  if (today) { const n = diffDays(iso, today); if (n === 0) return "Today"; if (n === 1) return "Tomorrow"; if (n === -1) return "Yesterday"; }
  const y = iso.slice(0, 4) !== (today || "").slice(0, 4);
  return `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}${y ? ` ${iso.slice(0, 4)}` : ""}`;
};
export const dayLong = iso => `${WDAY[dow(iso)]}, ${+iso.slice(8, 10)} ${MONTH[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
export const dayOfTs = ts => { if (!ts) return null; try { return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); } catch { return ts.slice(0, 10); } };
export const ago = ts => {
  const m = Math.max(0, (Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${Math.round(m)} min ago`; if (m < 1440) return `${Math.round(m / 60)} h ago`;
  const d = dayOfTs(ts); return d ? dayShort(d) : "";
};
export const weekStart = iso => addDays(iso, -((dow(iso) + 6) % 7));                          // weeks start on Monday
export const RANGES = [["today", "Today"], ["week", "This week"], ["7", "Last 7 days"], ["month", "This month"], ["30", "Last 30 days"],
  ["next7", "Next 7 days"], ["year", "This year"], ["fy", "This FY"], ["lastfy", "Last FY"]];
// India's financial year: 1 April → 31 March (owner 2026-11-14: "in the date selector bring the FY year")
const fyStart = today => +today.slice(5, 7) >= 4 ? +today.slice(0, 4) : +today.slice(0, 4) - 1;
export const fyLabel = y => `FY ${y}–${String(y + 1).slice(2)}`;
export function rangeOf(k, today) {
  if (k === "today") return { from: today, to: today };
  if (k === "week") return { from: weekStart(today), to: addDays(weekStart(today), 6) };
  if (k === "7") return { from: addDays(today, -6), to: today };
  if (k === "month") return { from: monthStart(today), to: addDays(addMonths(today, 1), -1) };
  if (k === "30") return { from: addDays(today, -29), to: today };
  if (k === "next7") return { from: today, to: addDays(today, 6) };
  if (k === "year") return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  if (k === "fy" || k === "lastfy") { const y = fyStart(today) - (k === "lastfy" ? 1 : 0); return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; }
  return null;
}
export const inRange = (iso, r) => !r || (!!iso && (!r.from || iso >= r.from) && (!r.to || iso <= r.to));

// ── text: what the server refuses is never sent (control characters; the C1 block that JSON does not escape)
export const clean = s => String(s || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "");
export const docString = doc => JSON.stringify(doc).replace(/[\u007f-\u009f]/g, "");
export const normTag = s => clean(s).trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);

// ── the pop-up: always centred (never a side panel); Escape and the backdrop close it
export function Modal({ title, sub, onClose, children, foot, wide, id }) {
  const box = useRef(null);
  useEffect(() => {
    const k = e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    const f = box.current && box.current.querySelector("input:not([type=checkbox]):not([type=radio]),textarea,select");
    if (f && window.matchMedia("(pointer:fine)").matches) f.focus();
    return () => window.removeEventListener("keydown", k, true);
  }, []);
  return (
    <div className="pl-ov" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`pl-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={box} id={id}>
        <div className="pl-mh"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
          <button type="button" className="pl-ib" onClick={onClose} aria-label="Close"><PI n="x"/></button></div>
        <div className="pl-mb">{children}</div>
        {foot && <div className="pl-mf">{foot}</div>}
      </div>
    </div>);
}

// a small menu that opens under its button (closes on a click outside or Escape)
// a floating panel placed by its button, kept on the screen (position: fixed — nothing that scrolls can cut it off)
// round 23 (owner 2026-11-17: "the 3 dots showed the options somewhere else"): a floating panel is drawn at the top of the page (a portal),
// never inside the page — a card that lifts on hover (transform) or a panel with container queries makes position: fixed count from that box
export const Float = ({ children }) => typeof document === "undefined" ? children : createPortal(<div className="pl-float">{children}</div>, document.body);

export function useFloat(open, btn, w = 240, h = 360, align) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open || !btn.current) { setPos(null); return undefined; }
    const place = () => { const r = btn.current.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
      const left = Math.max(8, Math.min(align === "right" ? r.right - w : r.left, vw - w - 8));
      const below = vh - r.bottom - 12, above = r.top - 12, up = below < Math.min(h, 240) && above > below;
      setPos({ left, width: w, ...(up ? { bottom: vh - r.top + 6, maxHeight: Math.min(h, above) } : { top: r.bottom + 6, maxHeight: Math.min(h, below) }) }); };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  return pos;
}

// a small menu that opens by its button (closes on a click outside or Escape)
export function Menu({ label, icon, items, className = "", align, id, title, children, width = 236 }) {
  const [open, setOpen] = useState(false); const ref = useRef(null), btn = useRef(null), pop = useRef(null);
  const pos = useFloat(open, btn, width, 420, align);
  useEffect(() => {
    if (!open) return undefined;
    const h = e => { if (ref.current && !ref.current.contains(e.target) && !(pop.current && pop.current.contains(e.target))) setOpen(false); };
    const k = e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k, true);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k, true); };
  }, [open]);
  return (
    <div className={`pl-menu ${className}`} ref={ref}>
      <button ref={btn} type="button" className={children ? "pl-mbtn" : label ? "px-btn" : "pl-ib"} onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open} id={id} title={title || label}>
        {children || <>{icon && <PI n={icon}/>}{label}</>}</button>
      {open && pos && <Float><div className="pl-mpop" role="menu" ref={pop} style={{ position: "fixed", ...pos }}>
        {items.filter(Boolean).map((it, i) => it === "-" ? <div key={i} className="pl-msep"/>
          : it.head ? <div key={i} className="pl-mhead">{it.head}</div>
          : <button key={i} type="button" role="menuitem" className={`${it.danger ? "danger" : ""} ${it.on ? "on" : ""}`} disabled={it.disabled} id={it.id}
              onClick={() => { setOpen(false); it.run(); }}>{it.swatch ? <i className="pl-swi" data-c={it.swatch}/> : it.icon ? <PI n={it.icon} s={15}/> : <span className="pl-swi none"/>}<span>{it.label}</span>{it.on && <PI n="tick" s={14} className="pl-mon"/>}{it.hint && <small>{it.hint}</small>}</button>)}
      </div></Float>}
    </div>);
}

// From → To: quick choices and two date boxes; null = any date
export function DateRange({ value, onChange, today, label = "Any date", id }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  const [f, setF] = useState(value ? value.from || "" : ""), [t, setT] = useState(value ? value.to || "" : "");
  useEffect(() => { setF(value ? value.from || "" : ""); setT(value ? value.to || "" : ""); }, [value && value.from, value && value.to]);
  useEffect(() => {
    if (!open) return undefined;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const txt = !value ? label : value.key === "fy" || value.key === "lastfy" ? fyLabel(+value.from.slice(0, 4)) : value.key ? (RANGES.find(r => r[0] === value.key) || [, ""])[1]
    : `${value.from ? dayShort(value.from, null) : "…"} – ${value.to ? dayShort(value.to, null) : "…"}`;
  return (
    <div className="pl-dr" ref={ref}>
      <button type="button" className={`pl-fbtn ${value ? "on" : ""}`} onClick={() => setOpen(v => !v)} id={id} aria-expanded={open}>
        <PI n="calendar" s={14}/><span>{txt}</span>{value && <span className="pl-x" role="button" aria-label="Any date" onClick={e => { e.stopPropagation(); onChange(null); }}><PI n="x" s={12}/></span>}</button>
      {open && <div className="pl-drpop" role="dialog" aria-label="Date range">
        <div className="pl-drq">{RANGES.map(([k, l]) => <button key={k} type="button" className={value && value.key === k ? "on" : ""}
          onClick={() => { onChange({ key: k, ...rangeOf(k, today) }); setOpen(false); }} data-range={k}>{k === "fy" || k === "lastfy" ? fyLabel(+rangeOf(k, today).from.slice(0, 4)) : l}</button>)}</div>
        <div className="pl-drc">
          <label><span>From</span><input type="date" value={f} max={t || undefined} onChange={e => setF(e.target.value)} id={id && `${id}-from`}/></label>
          <label><span>To</span><input type="date" value={t} min={f || undefined} onChange={e => setT(e.target.value)} id={id && `${id}-to`}/></label>
        </div>
        <div className="pl-drf"><button type="button" className="px-btn" onClick={() => { onChange(null); setOpen(false); }}>Any date</button>
          <button type="button" className="px-btn primary" disabled={!f && !t} id={id && `${id}-apply`} onClick={() => { onChange({ from: f || null, to: t || null }); setOpen(false); }}>Apply</button></div>
      </div>}
    </div>);
}

// topics: chips + a box with suggestions from the topics already used
export function TagBox({ value, onChange, all, max = 12, id, placeholder = "Add a topic" }) {
  const [q, setQ] = useState(""); const [focus, setFocus] = useState(false);
  const add = s => { const t = normTag(s); if (t && !value.includes(t) && value.length < max) onChange([...value, t]); setQ(""); };
  const sug = all.filter(t => !value.includes(t) && (!q || t.includes(q.toLowerCase()))).slice(0, 8);
  return (
    <div className="pl-tags" id={id}>
      {value.map(t => <span key={t} className="pl-tag">#{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter(x => x !== t))}><PI n="x" s={11}/></button></span>)}
      {value.length < max && <span className="pl-tagin">
        <input value={q} placeholder={value.length ? "" : placeholder} aria-label="Add a topic" maxLength={30}
          onChange={e => setQ(e.target.value.replace(/,/g, ""))} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={e => { if ((e.key === "Enter" || e.key === ",") && q.trim()) { e.preventDefault(); add(q); } else if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1)); }}/>
        {focus && (sug.length > 0 || q.trim()) && <span className="pl-tagsug">
          {q.trim() && !all.includes(normTag(q)) && <button type="button" onMouseDown={e => { e.preventDefault(); add(q); }}>Add “{normTag(q)}”</button>}
          {sug.map(t => <button key={t} type="button" onMouseDown={e => { e.preventDefault(); add(t); }}>#{t}</button>)}</span>}
      </span>}
    </div>);
}

// a date: Today · Tomorrow · Next week · a small month — the same in every browser (owner 2026-11-15: "the date function is not working")
export function DatePop({ value, today, onPick, onClose, btn, clear }) {
  const [cur, setCur] = useState(monthStart(value || today)); const box = useRef(null);
  const pos = useFloat(true, btn, 264, 360);
  useEffect(() => {
    const h = e => { if (box.current && !box.current.contains(e.target) && !(btn.current && btn.current.contains(e.target))) onClose(); };
    const k = e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k, true);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k, true); };
  }, []);
  const first = addDays(cur, -((dow(cur) + 6) % 7)), days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const nextMon = addDays(today, 7 - ((dow(today) + 6) % 7));
  const pick = d => { onPick(d); onClose(); };
  if (!pos) return null;
  return (
    <Float><div className="pl-dpop" ref={box} style={{ position: "fixed", ...pos }} role="dialog" aria-label="Pick a date" onMouseDown={e => e.stopPropagation()}>
      <div className="pl-dpq">
        <button type="button" onClick={() => pick(today)} data-q="today">Today</button>
        <button type="button" onClick={() => pick(addDays(today, 1))} data-q="tomorrow">Tomorrow</button>
        <button type="button" onClick={() => pick(nextMon)} data-q="nextweek">Next week</button>
        {clear && value && <button type="button" onClick={() => pick(null)} data-q="none">No date</button>}
      </div>
      <div className="pl-dph"><button type="button" className="pl-ib" onClick={() => setCur(addMonths(cur, -1))} aria-label="Earlier month"><PI n="left" s={14}/></button>
        <b>{monthName(cur)}</b><button type="button" className="pl-ib" onClick={() => setCur(addMonths(cur, 1))} aria-label="Later month"><PI n="right" s={14}/></button></div>
      <div className="pl-dpg">{["M", "T", "W", "T", "F", "S", "S"].map((x, i) => <span key={i}>{x}</span>)}
        {days.map(d => <button key={d} type="button" className={`${d.slice(0, 7) !== cur.slice(0, 7) ? "out" : ""} ${d === today ? "today" : ""} ${d === value ? "on" : ""}`}
          onClick={() => pick(d)} data-d={d} aria-label={d}>{+d.slice(8, 10)}</button>)}</div>
    </div></Float>);
}

// a date as a small chip: a click opens the date picker above
export function DateChip({ value, onChange, today, late, empty = "Add date", label, id, disabled, clear }) {
  const [open, setOpen] = useState(false); const btn = useRef(null);
  return (
    <>
      <button ref={btn} type="button" className={`pl-dc ${value ? "" : "none"} ${late ? "late" : ""} ${value === today ? "now" : ""}`} onClick={() => !disabled && setOpen(v => !v)}
        title={label} aria-label={`${label || "Date"}: ${value || "none"}`} id={id} aria-expanded={open} disabled={disabled}>
        <PI n="calendar" s={12}/><span>{value ? dayShort(value, today) : empty}</span></button>
      {open && <DatePop value={value} today={today} btn={btn} clear={clear} onPick={onChange} onClose={() => setOpen(false)}/>}
    </>);
}

// a notebook's name with its colour (the colour is never the only sign)
export const NbDot = ({ nb, s }) => nb ? <span className={`pl-nbd ${s ? "s" : ""}`} data-c={nb.color}><i/>{!s && nb.name}</span> : null;
export const Check = ({ on, onClick, label, id }) => (
  <button type="button" className={`pl-ck ${on ? "on" : ""}`} onClick={onClick} aria-pressed={on} aria-label={label} id={id}><PI n="tick" s={12}/></button>);

// ── note templates: headings and empty lines only — what to write is the customer's (never a trading rule)
const t = text => ({ type: "text", text });
const p = s => ({ type: "paragraph", ...(s ? { content: [t(s)] } : {}) });
const h = (l, s) => ({ type: "heading", attrs: { level: l }, content: [t(s)] });
const ul = xs => ({ type: "bulletList", content: xs.map(x => ({ type: "listItem", content: [p(x)] })) });
const tl = xs => ({ type: "taskList", content: xs.map(x => ({ type: "taskItem", attrs: { checked: false }, content: [p(x)] })) });
const cell = (s, head) => ({ type: head ? "tableHeader" : "tableCell", content: [p(s)] });
const table = (head, rows) => ({ type: "table", content: [{ type: "tableRow", content: head.map(x => cell(x, true)) },
  ...rows.map(r => ({ type: "tableRow", content: r.map(x => cell(x)) }))] });
export const TEMPLATES = [
  { k: "trade", t: "Trade notes", icon: "chart", doc: [
    h(2, "Before the trade"), ul(["Stock or index: ", "Why I am taking it: ", "Entry · stop-loss · target: ", "Quantity and money at risk: "]),
    p("Paste the chart here."),
    h(2, "What happened"), ul(["Entry (time, price): ", "Exit (time, price): ", "Result: "]),
    h(2, "Review"), tl(["I followed my plan", "I kept to my stop-loss", "I took the size I planned"]),
    h(2, "What I learned"), p("")] },
  { k: "meeting", t: "Meeting notes", icon: "users", doc: [
    ul(["Date: ", "People: "]), h(2, "Agenda"), ul([""]), h(2, "Notes"), p(""), h(2, "Decisions"), ul([""]), h(2, "Action items"), tl([""])] },
  { k: "workout", t: "Workout log", icon: "dumbbell", doc: [
    h(2, "Warm-up"), ul([""]), h(2, "Workout"), table(["Exercise", "Sets", "Reps", "Weight"], [["", "", "", ""], ["", "", "", ""], ["", "", "", ""]]),
    h(2, "Cardio"), ul(["Distance: ", "Time: "]), h(2, "How I felt"), p("")] },
  { k: "weekly", t: "Weekly review", icon: "calendar", doc: [
    h(2, "What went well"), ul([""]), h(2, "What did not go well"), ul([""]), h(2, "Numbers this week"), p(""),
    h(2, "Focus for next week"), tl(["", ""])] },
  { k: "brief", t: "Project brief", icon: "project", doc: [
    h(2, "Goal"), p(""), h(2, "Why it matters"), p(""), h(2, "Milestones"), tl(["", "", ""]), h(2, "Risks"), ul([""]), h(2, "Notes"), p("")] },
];
export const tplDoc = k => { const x = TEMPLATES.find(z => z.k === k); return x ? { type: "doc", content: JSON.parse(JSON.stringify(x.doc)) } : null; };
