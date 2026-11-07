// Access manager v2 — building blocks shared by the three tabs: search box, pending-changes bar, review dialog (with
// the typed confirmation for owner-level access), side drawer, permission label, pager.
import React, { useEffect, useRef, useState } from "react";
import { AppIcon, Badge, LockIcon, btn, input, plural } from "./shared.jsx";

export const OWNER_WORD = "OWNER";

export function SearchBox({ value, onChange, placeholder, id, autoFocus }) {
  return (
    <div className="ax-search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} id={id} autoFocus={autoFocus} aria-label={placeholder}/>
      {value && <button type="button" onClick={() => onChange("")} aria-label="Clear search">✕</button>}
    </div>);
}

// debounced value (server searches)
export function useDebounced(v, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function Chips({ items, value, onChange, id }) {
  return (
    <div className="ax-chips" role="tablist" id={id}>
      {items.map(([k, label, n]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {label}{n != null && <span>{n}</span>}</button>))}
    </div>);
}

export function PermName({ p, sub = true }) {
  return (
    <span className="ax-pn">
      <span className="ax-pnl"><b>{p.name}</b>
        {p.restricted && <span className="am-own" title="Owner-level: shows how results are worked out"><LockIcon size={10}/> owner-level</span>}
        {!p.enabled && <Badge color="var(--short)">off</Badge>}
        {p.retired && <Badge color="var(--t3)">retired</Badge>}</span>
      {sub && <span className="ax-key">{p.key}</span>}
    </span>);
}

export const AppHead = ({ m, n, right }) => (
  <span className="ax-apph"><span className="ax-appi"><AppIcon k={m.key} size={15}/></span><b>{m.name}</b>{n != null && <span className="am-mut">{plural(n, "permission")}</span>}{right}</span>);

// One application's group header, the same in every tab (owner 2026-11-07: "the accordion of the app is very small — make it
// proper, with collapse all, common for all the apps"): the whole bar opens / closes it; the right side holds its own buttons.
export const GroupHead = ({ m, open, onFlip, count, sub, right }) => (
  <div className={`ax-gh ${open ? "open" : ""}`} data-app={m.key}>
    <button type="button" className="ax-ghb" onClick={onFlip} aria-expanded={open} title={open ? "Close" : "Open"}>
      <svg className="ax-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      <span className="ax-ghi"><AppIcon k={m.key} size={18}/></span>
      <span className="ax-ght"><b>{m.name}</b>{sub && <small>{sub}</small>}</span>
      {count != null && <span className="ax-ghn">{count}</span>}
    </button>
    {right && <span className="ax-ghr" onClick={e => e.stopPropagation()}>{right}</span>}
  </div>);

// which groups are closed, remembered per tab; plus the "Collapse all / Expand all" button
export function useFold(store, keys) {
  const [closed, setClosed] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(store) || "[]")); } catch { return new Set(); } });
  const save = s => { try { localStorage.setItem(store, JSON.stringify([...s])); } catch { /* storage blocked */ } return s; };
  const flip = k => setClosed(s => { const x = new Set(s); x.has(k) ? x.delete(k) : x.add(k); return save(x); });
  const allClosed = keys.length > 0 && keys.every(k => closed.has(k));
  const all = () => setClosed(save(allClosed ? new Set() : new Set(keys)));
  const button = id => (
    <button type="button" className="ax-foldall" onClick={all} id={id}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {allClosed ? <path d="m7 15 5 5 5-5M7 9l5-5 5 5"/> : <path d="m7 20 5-5 5 5M7 4l5 5 5-5"/>}</svg>
      {allClosed ? "Expand all" : "Collapse all"}</button>);
  return { isOpen: k => !closed.has(k), flip, button };
}

export function PendingBar({ count, onReview, onDiscard, busy, what = "change" }) {
  if (!count) return null;
  return (
    <div className="ax-pending" role="status" id="ax-pending">
      <span className="ax-pdot"/><b>{plural(count, `unsaved ${what}`)}</b>
      <span className="am-mut">Nothing is saved until you review it.</span>
      <span style={{ flex: 1 }}/>
      <button style={btn()} onClick={onDiscard} disabled={busy} id="ax-discard">Discard</button>
      <button style={btn(true)} onClick={onReview} disabled={busy} id="ax-review">Review &amp; save</button>
    </div>);
}

// What a change does before it is saved: roles touched, how many customers' access changes, who gains / loses what.
export function ReviewDialog({ title, summary, lines = [], onConfirm, onClose, busy, confirmLabel = "Save changes" }) {
  const [typed, setTyped] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.focus(); const k = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const owner = summary && (summary.owner_level || (summary.gains || []).some(g => g.restricted));
  const ok = !owner || typed.trim().toUpperCase() === OWNER_WORD;
  return (
    <div className="ax-ov" onClick={onClose}>
      <div className="ax-dlg" role="dialog" aria-label={title} onClick={e => e.stopPropagation()} ref={ref} tabIndex={-1} id="ax-review-dlg">
        <h3>{title}</h3>
        {!summary ? <div className="am-empty">Working out what changes…</div> : <>
          {lines.length > 0 && <ul className="ax-lines">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          {(summary.roles || []).length > 0 && <div className="ax-rsec"><div className="ax-rh">Roles</div>
            {summary.roles.map(r => <div key={r.id} className="ax-rrow"><b>{r.name}</b>
              {r.added.map(k => <span key={k} className="ax-tag add">＋ {k}</span>)}{r.removed.map(k => <span key={k} className="ax-tag rem">− {k}</span>)}</div>)}</div>}
          {summary.matched != null && <div className="ax-rsec"><div className="ax-rh">Customers</div>
            <div>{plural(summary.matched, "customer")} picked{summary.role_changes != null && summary.role_changes !== summary.matched ? ` · ${plural(summary.role_changes, "customer")} whose roles change` : ""}{summary.skipped ? ` · ${summary.skipped} skipped (it would leave them with no role)` : ""}</div></div>}
          <div className="ax-rsec"><div className="ax-rh">Effect on access</div>
            {summary.customers ? <div className="ax-eff"><b>{plural(summary.customers, "customer")}</b> will see a change.</div>
              : <div className="am-mut">No customer's access changes (the role may have nobody yet, or they already have it another way).</div>}
            {(summary.gains || []).map(g => <div key={g.key} className="ax-gl add">＋ {g.name} <span className="am-mut">({g.app})</span>{g.restricted && <span className="am-own"><LockIcon size={10}/> owner-level</span>}<span className="ax-n">{plural(g.n, "customer")}</span></div>)}
            {(summary.losses || []).map(g => <div key={g.key} className="ax-gl rem">− {g.name} <span className="am-mut">({g.app})</span><span className="ax-n">{plural(g.n, "customer")}</span></div>)}
          </div>
          {owner && <div className="am-warn ax-ownerbox"><LockIcon/> <span>This gives <b>owner-level</b> access (it shows how every result is worked out). Type <b>{OWNER_WORD}</b> to confirm.
            <input value={typed} onChange={e => setTyped(e.target.value)} style={{ ...input, marginLeft: 8, width: 110 }} id="ax-owner-type" aria-label="Type OWNER to confirm"/></span></div>}
        </>}
        <div className="ax-dlgf">
          <button style={btn()} onClick={onClose}>Cancel</button>
          <button style={btn(true)} disabled={!summary || !ok || busy} onClick={onConfirm} id="ax-confirm">{busy ? "Saving…" : confirmLabel}</button>
        </div>
      </div>
    </div>);
}

export function Drawer({ title, sub, onClose, children, id, wide }) {
  useEffect(() => { const k = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  return (
    <div className="ax-ov side" onClick={onClose}>
      <aside className={`ax-drawer ${wide ? "wide" : ""}`} role="dialog" aria-label={typeof title === "string" ? title : "Details"} onClick={e => e.stopPropagation()} id={id}>
        <header><div style={{ minWidth: 0 }}><h3>{title}</h3>{sub && <div className="am-mut">{sub}</div>}</div>
          <button type="button" className="ax-x" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="ax-dbody">{children}</div>
      </aside>
    </div>);
}

export function Pager({ page, size, total, onPage, id }) {
  const last = Math.max(1, Math.ceil(total / size));
  return (
    <div className="ax-pager" id={id}>
      <span className="am-mut">{total ? `${((page - 1) * size + 1).toLocaleString("en-IN")}–${Math.min(page * size, total).toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}` : "0 results"}</span>
      <button style={btn()} disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page">«</button>
      <button style={btn()} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
      <span className="ax-pg">Page {page} of {last}</span>
      <button style={btn()} disabled={page >= last} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      <button style={btn()} disabled={page >= last} onClick={() => onPage(last)} aria-label="Last page">»</button>
    </div>);
}

// a permission picker grouped by application (native select stays keyboard- and screen-reader friendly)
export function PermSelect({ perms, mods, value, onChange, id, placeholder = "Pick a permission…", filter = () => true }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={input} id={id} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {mods.map(m => { const list = perms.filter(p => p.module === m.key && !p.retired && filter(p)); return list.length ? (
        <optgroup key={m.key} label={m.name}>{list.map(p => <option key={p.key} value={p.key}>{p.name}{p.restricted ? " 🔒" : ""} — {p.key}</option>)}</optgroup>) : null; })}
    </select>);
}

// requires: giving a permission brings the one it needs; taking that one away takes its dependants (same rule as the server)
export function withNeeds(byKey, set, key) {
  const s = new Set(set); s.add(key);
  const need = byKey[key] && byKey[key].requires; if (need) s.add(need);
  return s;
}
export function withoutKey(byKey, set, key) {
  const s = new Set(set); s.delete(key);
  for (const k of [...s]) if (byKey[k] && byKey[k].requires === key) s.delete(k);
  return s;
}
