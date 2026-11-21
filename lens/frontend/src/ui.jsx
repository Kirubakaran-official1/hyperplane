// Shared bits: the request helper, the logo (Hyperplane's, with a LENS ring), the brand line and the password box (as Hyperplane's).
import React, { useState } from "react";

// every change request carries X-Lens: 1 — the server refuses changes without it (no other site can send it)
export async function api(path, { method = "GET", json } = {}) {
  const r = await fetch(path, { method, credentials: "same-origin",
    headers: { ...(json ? { "content-type": "application/json" } : {}), ...(method !== "GET" ? { "x-lens": "1" } : {}) },
    body: json ? JSON.stringify(json) : undefined });
  let data = null;
  try { data = await r.json(); } catch { /* empty body */ }
  if (!r.ok) {
    const d = data && data.detail;
    const e = new Error(typeof d === "string" ? d : d && d.message ? d.message : r.status === 429 ? "Too many attempts — please wait a few minutes" : "Something went wrong — please try again");
    e.status = r.status; e.field = d && d.field;
    throw e;
  }
  return data;
}

export function Logo({ size = 32 }) {
  const id = "lnl" + size;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Hyperplane LENS logo" style={{ flexShrink: 0, display: "block" }}>
      <defs>
        <linearGradient id={id + "bg"} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0d1b33"/><stop offset="1" stopColor="#070d1a"/></linearGradient>
        <linearGradient id={id + "pl"} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" stopOpacity=".95"/><stop offset="1" stopColor="#6366f1" stopOpacity=".95"/></linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="61" height="61" rx="16" fill={`url(#${id}bg)`} stroke="#1f3a5f" strokeWidth="1.5"/>
      <path d="M7 37 L35 27 L57 34 L29 45 Z" fill={`url(#${id}pl)`} opacity=".9"/>
      <path d="M7 37 L35 27 L57 34 L29 45 Z" fill="none" stroke="#a5f3fc" strokeOpacity=".7" strokeWidth="1.2" strokeLinejoin="round"/>
      <circle cx="32" cy="22" r="11" fill="#070d1a" fillOpacity=".55" stroke="#e0f2fe" strokeWidth="3"/>
      <line x1="40" y1="30" x2="47" y2="37" stroke="#e0f2fe" strokeWidth="3.4" strokeLinecap="round"/>
      <circle cx="32" cy="22" r="3" fill="#22d3ee"/>
    </svg>
  );
}

export function Brand() {
  return (
    <div className="brand"><Logo size={40}/>
      <div><div className="brand-name">Hyperplane <b>LENS</b></div><div className="brand-by">by QuantFriday</div></div>
    </div>);
}

export function PwBox({ value, onChange, id, autoComplete, placeholder, autoFocus, invalid }) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw">
      <input id={id} type={show ? "text" : "password"} value={value} onChange={onChange} maxLength={128} autoComplete={autoComplete} placeholder={placeholder}
        autoFocus={autoFocus} aria-invalid={invalid ? "true" : undefined} spellCheck={false} autoCapitalize="off"/>
      <button type="button" className="pw-eye" onClick={() => setShow(v => !v)} aria-label={show ? "Hide password" : "Show password"} tabIndex={-1}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {show ? <><path d="M17.9 17.9A10.9 10.9 0 0 1 12 20C5 20 1 12 1 12a18.7 18.7 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="m1 1 22 22"/></>
            : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></>}
        </svg></button>
    </span>);
}

export const fmtDT = s => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
