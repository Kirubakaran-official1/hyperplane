// Hyperplane Planner — the pieces of the one screen (rounds 22b–22f). 22f (owner 2026-11-15): "tabs — Dashboard (with the calendar), To-do,
// Planner (several planners, each a tile), Notes — below the notebooks · the dashboard shows every planner in its small place · the to-do
// header steady, today's date by default, a better time picker (no forced hour), a long to-do readable on hover, a proper full view (Notion /
// Asana) · Clear only hides from the dashboard · the planner's progress a slider again, one button to expand / collapse".
// Widget · NotebookRail (with the tabs) · to-dos (TodoCard, TodoBoard, TodoRow, TodoAdd, TimeChip) · planners (PlannerWidget, PlannerTiles,
// PlannerTable) · NotesCard · the download / merge / confirm pop-ups.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PhonePush } from "../push.jsx";
import { api } from "../core.jsx";
import { DateChip, DatePop, Float, Modal, Menu, NB_COLORS, NbDot, PI, addDays, ago, clean, dayLong, dayShort, diffDays, useFloat } from "./planner-lib.jsx";

export const P_STATUS = [["todo", "Not started"], ["doing", "In progress"], ["hold", "On hold"], ["done", "Done"]];
export const REPEAT = [[null, "Does not repeat"], ["daily", "Every day"], ["weekdays", "Every weekday"], ["weekly", "Every week"], ["monthly", "Every month"]];
const REP_SHORT = { daily: "Daily", weekdays: "Weekdays", weekly: "Weekly", monthly: "Monthly" };
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (a.tf || "99").localeCompare(b.tf || "99") || a.sort - b.sort || a.id - b.id;
export const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } } };
export const closed = t => t.status === "done" || t.status === "missed";
const initial = s => (String(s || "?").trim()[0] || "?").toUpperCase();
export const TABS = [["dash", "Dashboard", "grid"], ["todo", "To-do", "tasks"], ["plan", "Planner", "project"], ["notes", "Notes", "note"]];

// close a small panel on a click outside it or Escape
export function useOutside(open, ref, close) {
  useEffect(() => {
    if (!open) return undefined;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const k = e => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
}

// ── a widget of the dashboard: a fixed height with its own scroll bar and a maximise button (Escape or the button to come back).
// page = a tab of its own (no fixed height, no maximise); fullView = what it shows when maximised (when different)
export function Widget({ id, cls = "", title, icon, head, top, children, label, page, fullView, onFull }) {
  const [full, setFull] = useState(false);
  const set = v => { setFull(v); onFull && onFull(v); };
  useEffect(() => {
    if (!full) return undefined;
    const k = e => { if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(".pl-mpop,.pl-ov,.pl-dpop,.pl-tpop2")) set(false); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [full]);
  return <>
    {full && <div className="pl-fullback" onClick={() => set(false)} aria-hidden="true"/>}
    <section className={`px-card pl-wid ${cls} ${full ? "pl-full" : ""} ${page ? "page" : ""}`} id={id} aria-label={label || title}>
      {full && fullView ? <>
        <div className="pl-ch"><h3><PI n={icon} s={16}/>{title}</h3><span className="pl-sp"/>
          <button type="button" className="pl-ib pl-maxb" onClick={() => set(false)} title="Back to the dashboard" aria-label="Minimise" id={`${id}-max`}><PI n="narrow" s={16}/></button></div>
        <div className="pl-wbody fv">{fullView}</div></>
      : <>
        <div className="pl-ch"><h3><PI n={icon} s={16}/>{title}</h3>{head}
          {!page && <button type="button" className="pl-ib pl-maxb" onClick={() => set(!full)} title={full ? "Back to the dashboard" : "Maximise"} aria-label={full ? "Minimise" : "Maximise"} id={`${id}-max`}>
            <PI n={full ? "narrow" : "wide"} s={16}/></button>}</div>
        {top}
        <div className="pl-wbody">{children}</div></>}
    </section>
  </>;
}

// a long title read in full on hover (a small card beside it, never cut off)
function useTip(text, min = 30) {
  const [tip, setTip] = useState(null); const timer = useRef(null);
  const on = e => { if (!text || text.length < min) return; const r = e.currentTarget.getBoundingClientRect(); clearTimeout(timer.current);
    timer.current = setTimeout(() => setTip({ left: Math.min(r.left, window.innerWidth - 380), top: r.bottom + 6 > window.innerHeight - 120 ? undefined : r.bottom + 6, bottom: r.bottom + 6 > window.innerHeight - 120 ? window.innerHeight - r.top + 6 : undefined }), 380); };
  const off = () => { clearTimeout(timer.current); setTip(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return [{ onMouseEnter: on, onMouseLeave: off, onFocus: off }, tip && <Float><div className="pl-tip" role="tooltip" style={tip}>{text}</div></Float>];
}

// ── the left side: the notebooks (a strip of initials when folded; a dropdown on a phone) and, below them, the tabs
export function NotebookRail({ st, nb, setNb, ops, counts, onPicked, min, onMin, tab, setTab, tabCounts, noTabs }) {
  const [adding, setAdding] = useState(false); const [name, setName] = useState(""); const [q, setQ] = useState("");
  const [ren, setRen] = useState(null); const [del, setDel] = useState(null);
  const total = st.notebooks.reduce((s, n) => s + (counts.get(n.id) || 0), 0);
  const list = st.notebooks.filter(n => !q || n.name.toLowerCase().includes(q.toLowerCase()));
  const pick = id => { setNb(id); onPicked && onPicked(); };
  const add = async () => { const v = clean(name).trim(); if (!v) { setAdding(false); return; }
    const n = await ops.nb.create({ name: v, color: NB_COLORS[st.notebooks.length % NB_COLORS.length][0], icon: "book" }); if (n) { setName(""); setAdding(false); onPicked && onPicked(); } };
  const rename = async () => { if (!ren) return; const v = clean(ren.v).trim(); setRen(null); if (v && v !== ren.n.name) await ops.nb.update(ren.n.id, { name: v }); };
  const remove = async force => { const r = await ops.nb.remove(del.n.id, force); if (r === true) setDel(null); else if (typeof r === "string") setDel({ ...del, msg: r }); };
  const tabs = !noTabs && <div className={`pl-rtabs ${min ? "min" : ""}`} role="tablist" aria-label="Views">
    {!min && <div className="pl-rh"><b>Views</b></div>}
    {TABS.map(([k, l, ic]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`pl-rr tab ${tab === k ? "on" : ""}`} onClick={() => { setTab(k); onPicked && onPicked(); }}
      id={`pl-tab-${k}`} title={l} aria-label={l}><PI n={ic} s={15}/>{!min && <span>{l}</span>}{!min && tabCounts && tabCounts[k] != null && <small>{tabCounts[k]}</small>}</button>)}
  </div>;
  if (min) return (
    <nav className="pl-rail min" aria-label="Notebooks" id="pl-rail">
      <button type="button" className="pl-ib" onClick={() => onMin(false)} aria-label="Show the notebooks" title="Show the notebooks" id="pl-rail-open"><PI n="panelopen"/></button>
      <button type="button" className={`pl-ri ${!nb ? "on" : ""}`} onClick={() => pick(null)} aria-label="All notebooks" title={`All notebooks · ${total}`} id="pl-nb-all"><PI n="grid" s={15}/></button>
      {st.notebooks.map(n => <button key={n.id} type="button" className={`pl-ri ${nb === n.id ? "on" : ""}`} data-c={n.color} data-nb={n.id} onClick={() => pick(n.id)}
        aria-label={n.name} title={`${n.name} · ${counts.get(n.id) || 0}`}><b>{initial(n.name)}</b></button>)}
      {st.notebooks.length < st.limits.notebooks && <button type="button" className="pl-ib" onClick={() => { onMin(false); setAdding(true); }} aria-label="New notebook" title="New notebook" id="pl-nb-add"><PI n="plus" s={15}/></button>}
      {tabs}
    </nav>);
  return (
    <nav className="pl-rail" aria-label="Notebooks" id="pl-rail">
      <div className="pl-rh"><b>Notebooks</b><span className="pl-sp"/>
        {st.notebooks.length < st.limits.notebooks && <button type="button" className="pl-ib" onClick={() => setAdding(true)} aria-label="New notebook" title="New notebook" id="pl-nb-add"><PI n="plus" s={15}/></button>}
        {onMin && <button type="button" className="pl-ib" onClick={() => onMin(true)} aria-label="Hide the notebooks" title="Fold the side panel" id="pl-rail-close"><PI n="panelclose" s={16}/></button>}</div>
      {st.notebooks.length > 8 && <input className="pl-rq" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a notebook" aria-label="Find a notebook"/>}
      <div className="pl-rl">
        <button type="button" className={`pl-rr ${!nb ? "on" : ""}`} onClick={() => pick(null)} id="pl-nb-all"><PI n="grid" s={14}/><span>All notebooks</span><small>{total}</small></button>
        {list.map(n => ren && ren.n.id === n.id
          ? <form key={n.id} className="pl-rr edit" data-c={n.color} onSubmit={e => { e.preventDefault(); rename(); }}><i/>
              <input autoFocus value={ren.v} onChange={e => setRen({ ...ren, v: e.target.value })} onBlur={rename} maxLength={60} aria-label="Notebook name" id="pl-nb-rename"
                onKeyDown={e => { if (e.key === "Escape") setRen(null); }}/></form>
          : <div key={n.id} className={`pl-rr ${nb === n.id ? "on" : ""}`} data-c={n.color} data-nb={n.id} role="button" tabIndex={0}
              onClick={() => pick(n.id)} onKeyDown={e => { if (e.key === "Enter") pick(n.id); }} title={n.name}>
              <i/><span>{n.name}</span><small>{counts.get(n.id) || 0}</small>
              <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} className="pl-rm"><Menu icon="more" title={`${n.name}: rename, colour, delete`} id={`pl-nb-menu-${n.id}`} items={[
                { label: "Rename", icon: "edit", id: `pl-nb-ren-${n.id}`, run: () => setRen({ n, v: n.name }) },
                { head: "Colour" },
                ...NB_COLORS.map(([k, l]) => ({ label: l, swatch: k, on: n.color === k, id: `pl-nb-c-${n.id}-${k}`, run: () => ops.nb.update(n.id, { color: k }) })),
                st.notebooks.length > 1 && "-",
                st.notebooks.length > 1 && { label: "Delete…", icon: "trash", danger: true, id: `pl-nb-del-${n.id}`, run: () => setDel({ n }) },
              ]}/></span>
            </div>)}
        {del && <div className="pl-warn sm" id="pl-nb-delbox"><span>{del.msg ? `${del.msg}. Delete “${del.n.name}” with everything in it?` : `Delete “${del.n.name}”?`}</span>
          <div><button type="button" className="px-btn danger" onClick={() => remove(!!del.msg)} id="pl-nb-delgo">{del.msg ? "Delete everything" : "Delete"}</button>
            <button type="button" className="px-btn" onClick={() => setDel(null)}>Cancel</button></div></div>}
        {adding && <form className="pl-rr edit" onSubmit={e => { e.preventDefault(); add(); }}><PI n="book" s={14}/>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onBlur={add} placeholder="Notebook name" maxLength={60} aria-label="New notebook name" id="pl-nb-name"
            onKeyDown={e => { if (e.key === "Escape") { setName(""); setAdding(false); } }}/></form>}
      </div>
      {tabs}
      {/* round 28: reminders — 15 min before a to-do / plan with a time; 8 am, then 12 · 4 pm · 7 pm for the day's list while something is left */}
      <label className={`hp-switch pl-dig ${st.prefs.digest ? "on" : ""}`}
        title="15 minutes before a to-do or plan with a time. Day-only ones: a list at 8 am, then at 12, 4 pm and 7 pm while something is still left. Notes never remind.">
        <input type="checkbox" checked={st.prefs.digest} onChange={e => ops.setDigest(e.target.checked)} id="pl-digest"/>Reminders in the Inbox</label>
      {st.prefs.digest && <div className="pl-push"><PhonePush id="pl-push"/></div>}
    </nav>);
}

// ── a to-do's state, one small icon: an empty ring (open) · a filled check badge (done) · a calendar with a cross (missed)
export function StatusBtn({ t, ops }) {
  const st_ = t.status === "missed" ? "missed" : t.status === "done" ? "done" : "open";
  return <button type="button" className={`pl-sb ${st_}`} onClick={() => ops.task.patch(t.id, { status: st_ === "open" ? "done" : "todo" })}
    aria-label={st_ === "open" ? `Mark “${t.title}” done` : `Back to open: “${t.title}”`} title={st_ === "open" ? "Done" : st_ === "done" ? "Done — click to reopen" : "Missed — click to reopen"} data-sb={st_}>
    {st_ === "done" ? <PI n="tick" s={12}/> : st_ === "missed" ? <PI n="calx" s={12}/> : <PI n="tick" s={11} className="pl-sbh"/>}</button>;
}
export const MissBtn = ({ t, ops }) => <button type="button" className="pl-miss" onClick={() => ops.task.patch(t.id, { status: "missed" })} title="Missed it" aria-label={`Mark “${t.title}” missed`} data-miss={t.id}><PI n="calx" s={14}/></button>;

// a to-do's time (optional): pick the start from a 24-hour list, then the length — 15 minutes to 4 hours (no hour forced)
const QUARTERS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String(i % 4 * 15).padStart(2, "0")}`);
const LENS = [[15, "15m"], [30, "30m"], [45, "45m"], [60, "1h"], [90, "1½h"], [120, "2h"], [180, "3h"], [240, "4h"]];
const mins = s => +s.slice(0, 2) * 60 + +s.slice(3, 5), hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function TimeChip({ t, ops }) {
  const [open, setOpen] = useState(false); const btn = useRef(null);
  return <>
    <button ref={btn} type="button" className={`pl-tsel ${t.tf ? "" : "none"}`} onClick={() => setOpen(v => !v)} aria-expanded={open} data-time={t.id}
      title={t.tf ? `${t.tf}–${t.tt} (24-hour)` : "A time (optional)"}><PI n="clock" s={12}/><span>{t.tf ? `${t.tf}–${t.tt}` : "Time"}</span></button>
    {open && <TimePop t={t} ops={ops} btn={btn} onClose={() => setOpen(false)}/>}
  </>;
}
function TimePop({ t, ops, btn, onClose }) {
  const box = useRef(null), list = useRef(null); const pos = useFloat(true, btn, 252, 330, "right");
  const [from, setFrom] = useState(t.tf || null); const [len, setLen] = useState(t.tf && t.tt ? mins(t.tt) - mins(t.tf) : 60);
  useEffect(() => {
    const h = e => { if (box.current && !box.current.contains(e.target) && !(btn.current && btn.current.contains(e.target))) onClose(); };
    const k = e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k, true);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k, true); };
  }, []);
  useEffect(() => { const el = list.current && list.current.querySelector(".on") || list.current && list.current.querySelector('[data-t="08:00"]'); if (el) list.current.scrollTop = el.offsetTop - 60; }, [!!pos]);
  const save = (f, l) => { setFrom(f); setLen(l); if (f) ops.task.patch(t.id, { time_from: f, time_to: hhmm(Math.min(1439, mins(f) + l)) }); };
  if (!pos) return null;
  return (
    <Float><div className="pl-tpop2" ref={box} style={{ position: "fixed", ...pos }} role="dialog" aria-label="Time" onMouseDown={e => e.stopPropagation()}>
      <div className="pl-tpc"><small>Starts</small><div className="pl-tpl" ref={list}>{QUARTERS.map(x => <button key={x} type="button" className={from === x ? "on" : ""} onClick={() => save(x, len)} data-t={x}>{x}</button>)}</div></div>
      <div className="pl-tpc"><small>Length</small><div className="pl-tplen">{LENS.map(([m, l]) => <button key={m} type="button" className={len === m ? "on" : ""} disabled={!from} onClick={() => save(from, m)} data-len={m}>{l}</button>)}</div>
        <div className="pl-tpsum">{from ? `${from} – ${hhmm(Math.min(1439, mins(from) + len))}` : "Pick a start"}</div>
        {t.tf && <button type="button" className="pl-link" onClick={() => { ops.task.patch(t.id, { time_from: null, time_to: null }); onClose(); }} id="pl-time-none">No time</button>}</div>
    </div></Float>);
}

// ── To-do: one row — state · words · missed · notebook · date · time · more
export function TodoRow({ t, nbs, st, today, ops, showNb, drag, wide }) {
  const [v, setV] = useState(t.title); useEffect(() => setV(t.title), [t.title]);
  const [tipOn, tip] = useTip(t.title);
  const save = () => { const s = clean(v).trim(); if (!s) setV(t.title); else if (s !== t.title) ops.task.patch(t.id, { title: s }); };
  const open = !closed(t), late = open && t.due && t.due < today, nb = showNb && nbs.get(t.nb);
  const menu = <Menu icon="more" title="More" align="right" items={[
    open ? { label: "Missed it", icon: "calx", run: () => ops.task.patch(t.id, { status: "missed" }) } : { label: "Back to open", icon: "restore", run: () => ops.task.patch(t.id, { status: "todo" }) },
    { head: "Repeat" }, ...REPEAT.map(([k, l]) => ({ label: l, on: (t.repeat || null) === k, run: () => ops.task.patch(t.id, { repeat: k, ...(k && !t.due ? { due: today } : {}) }) })),
    t.due && { label: "Remove the date", icon: "x", run: () => ops.task.patch(t.id, { due: null, repeat: null }) },
    st.notebooks.length > 1 && { head: "Notebook" }, ...(st.notebooks.length > 1 ? st.notebooks.map(n => ({ label: n.name, swatch: n.color, on: n.id === t.nb, run: () => ops.task.patch(t.id, { notebook_id: n.id }) })) : []),
    "-", { label: "Delete", icon: "trash", danger: true, run: () => ops.task.remove(t, 0) }]}/>;
  return (
    <div className={`pl-trow ${wide ? "wide" : ""} ${t.status === "done" ? "done" : ""} ${t.status === "missed" ? "missed" : ""} ${late ? "late" : ""}`} data-task={t.id} draggable={drag || undefined}
      onDragStart={drag ? e => { e.dataTransfer.setData("text/pl-task", String(t.id)); e.dataTransfer.effectAllowed = "move"; } : undefined}>
      <StatusBtn t={t} ops={ops}/>
      <span className="pl-tinw" {...tipOn}><input className="pl-tin" value={v} onChange={e => setV(e.target.value)} onBlur={save} maxLength={300} aria-label="To-do"
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(t.title); const el = e.currentTarget; setTimeout(() => el.blur()); } }}/>{tip}</span>
      {open && !wide && <MissBtn t={t} ops={ops}/>}
      {wide ? <>
          <span className="pl-tcol nb">{nbs.get(t.nb) ? <NbDot nb={nbs.get(t.nb)}/> : null}</span>
          <span className="pl-tcol"><DateChip value={t.due} today={today} late={late} onChange={d => ops.task.patch(t.id, { due: d })} label="Date" empty="No date" clear/></span>
          <span className="pl-tcol">{t.due ? <TimeChip t={t} ops={ops}/> : <span className="pl-muted">—</span>}</span>
          <span className="pl-tcol"><select className={`pl-rsel ${t.repeat ? "on" : ""}`} value={t.repeat || ""} aria-label="Repeat"
            onChange={e => ops.task.patch(t.id, { repeat: e.target.value || null, ...(e.target.value && !t.due ? { due: today } : {}) })}>
            {REPEAT.map(([k, l]) => <option key={l} value={k || ""}>{k ? l : "No repeat"}</option>)}</select></span>
          <span className="pl-tcol act">{open && <MissBtn t={t} ops={ops}/>}{menu}</span></>
        : <>
          {t.repeat && <span className="pl-rep" title={(REPEAT.find(r => r[0] === t.repeat) || [])[1]}><PI n="repeat" s={12}/><span>{REP_SHORT[t.repeat]}</span></span>}
          {nb && <span className="pl-nbi" data-c={nb.color} title={nb.name} aria-label={nb.name}>{initial(nb.name)}</span>}
          <DateChip value={t.due} today={today} late={late} onChange={d => ops.task.patch(t.id, { due: d })} label="Date" empty="Date" clear/>
          {t.due && <TimeChip t={t} ops={ops}/>}
          {menu}</>}
    </div>);
}

// type a to-do, Enter: it goes on today (change the day, the time or make it repeat later from its row)
export function TodoAdd({ ops, st, nb, due, today, id, placeholder = "Add a to-do — Enter" }) {
  const def = due === undefined ? today : due;
  const [v, setV] = useState(""); const [d, setD] = useState(def); const [n, setN] = useState(nb || st.notebooks[0].id); const [busy, setBusy] = useState(false);
  useEffect(() => setD(def), [def]); useEffect(() => { if (nb) setN(nb); }, [nb]);
  const go = async () => { if (!v.trim() || busy) return; setBusy(true); const r = await ops.task.create({ kind: "todo", title: v, due: d, nb: nb || n }); setBusy(false); if (r) setV(""); };
  return (
    <form className="pl-qa" onSubmit={e => { e.preventDefault(); go(); }} id={id}>
      <PI n="plus" s={15}/>
      <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} aria-label="New to-do" maxLength={300}/>
      {!nb && st.notebooks.length > 1 && <select value={n} onChange={e => setN(Number(e.target.value))} aria-label="Notebook" className="pl-qn">
        {st.notebooks.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
      <DateChip value={d} today={today} onChange={setD} label="Date" empty="No date" clear/>
      <button type="submit" className="px-btn sm" disabled={!v.trim() || busy}>Add</button>
    </form>);
}

// sorting the to-dos into their sections (the dashboard's Open tab and the full view's left side)
function todoSections(todos, today, showCleared) {
  const open = todos.filter(t => !closed(t)).sort(byDue);
  const by = s => todos.filter(t => t.status === s && (showCleared || !t.archived)).sort((a, b) => (b.due || "").localeCompare(a.due || "") || (b.done_at || "").localeCompare(a.done_at || ""));
  return { open, late: open.filter(t => t.due && t.due < today), today: open.filter(t => t.due === today), upcoming: open.filter(t => t.due && t.due > today),
    nodate: open.filter(t => !t.due), done: by("done"), missed: by("missed") };
}
const byDate = (list, today, label) => { const m = new Map(); list.forEach(t => { const k = t.due || "none"; if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
  return [...m.entries()].map(([k, l]) => [k === "none" ? "No date" : label ? label(k) : dayShort(k, today), l]); };
function rate30(todos, today) {
  const since = addDays(today, -29), inWin = t => t.due ? t.due >= since && t.due <= today : (t.done_at || "").slice(0, 10) >= since;
  const d = todos.filter(t => t.status === "done" && inWin(t)).length, m = todos.filter(t => t.status === "missed" && inWin(t)).length;
  return { d, m, rate: d + m ? Math.round(d / (d + m) * 100) : null };
}

// ── the To-do widget of the dashboard: Open · Done · Missed (the header never changes size); maximised → the full view
export function TodoCard(props) {
  const { st, f, nbs, today, ops, nb, focus } = props;
  const [tab, setTab] = useState("open");
  const todos = f.tasks.filter(t => t.kind === "todo"), S = todoSections(todos, today, false);
  const G = tab === "open" ? [["Late", S.late, "late"], ["Today", S.today, "now"], ["Upcoming", S.upcoming, ""], ["No date", S.nodate, ""]].filter(g => g[1].length)
    : byDate(tab === "done" ? S.done : S.missed, today).map(([l, list]) => [l, list, tab]);
  const R = rate30(todos, today);
  useEffect(() => { if (focus && focus.kind === "todo") { const t = todos.find(x => x.id === focus.id); if (t) setTab(t.status === "done" ? "done" : t.status === "missed" ? "missed" : "open"); } }, [focus && focus.n]);
  useFocus(focus, "todo");
  const showNb = !nb && st.notebooks.length > 1;
  const missAll = async () => { const ids = S.late.map(t => t.id); for (const id of ids) await ops.task.patch(id, { status: "missed" }); ops.say(`${plural(ids.length, "late to-do")} marked missed`); };
  const closedList = tab === "done" ? S.done : S.missed;
  return (
    <Widget id="pl-todo" cls="pl-todo" title="To-do" icon="tasks" label="To-do" fullView={<TodoBoard {...props} inWidget/>}
      head={<><span className="pl-sp"/>
        <span className="pl-tabs2" role="tablist" aria-label="To-dos">
          {[["open", "Open", S.open.length, "tasks"], ["done", "Done", S.done.length, "tick"], ["missed", "Missed", S.missed.length, "calx"]].map(([k, l, n, ic]) =>
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${tab === k ? "on" : ""} t-${k}`} onClick={() => setTab(k)} id={`pl-td-${k}`} title={l}>
              <PI n={ic} s={13}/><span>{l}</span><small>{n}</small></button>)}</span></>}
      top={tab === "open" ? <TodoAdd ops={ops} st={st} nb={nb} today={today} id="pl-todo-add"/>
        : <div className="pl-rate" id="pl-rate">{R.rate == null ? <span className="pl-muted">Nothing closed in the last 30 days.</span>
          : <><span className="pl-trk" role="img" aria-label={`${R.rate}% done`}><i style={{ width: `${R.rate}%` }}/></span><b>{R.rate}%</b><small>last 30 days · {R.d} done · {R.m} missed</small></>}
          <span className="pl-sp"/>{closedList.length > 0 && <button type="button" className="pl-link" onClick={() => ops.task.clearDone(closedList.length, tab)} id="pl-clear-closed"
            title="Off the dashboard — they stay in the calendar and in the To-do tab">Clear</button>}</div>}>
      {!G.length && <p className="pl-muted pl-pad">{tab === "open" ? "Nothing open. Type a to-do above and press Enter — it goes on today." : tab === "done" ? "Nothing done here." : "Nothing missed — well done."}</p>}
      {G.map(([l, list, tone]) => <div key={l} className={`pl-grp ${tone}`} data-grp={l}>
        <div className="pl-gl">{l}<small>{list.length}</small><span className="pl-sp"/>
          {tone === "late" && <button type="button" className="pl-ib sm" onClick={missAll} title="Mark every late to-do missed" aria-label="Mark every late to-do missed" id="pl-miss-all"><PI n="calx" s={14}/></button>}</div>
        {list.map(t => <TodoRow key={t.id} t={t} nbs={nbs} st={st} today={today} ops={ops} showNb={showNb}/>)}
      </div>)}
    </Widget>);
}

// ── the full to-do view (the To-do tab, or the widget maximised): sections on the left, a clean list with columns on the right
const SECTIONS = [["today", "Today", "sun"], ["upcoming", "Upcoming", "calendar"], ["late", "Late", "alert"], ["nodate", "No date", "tasks"], ["open", "All open", "list"],
  "-", ["done", "Done", "tick"], ["missed", "Missed", "calx"]];
export function TodoBoard({ st, f, nbs, today, ops, nb, focus, inWidget }) {
  const [sec, setSecRaw] = useState(() => ls.get("hp_pl_tsec", "today")); const setSec = v => { setSecRaw(v); ls.set("hp_pl_tsec", v); };
  const [cleared, setCleared] = useState(false); const [q, setQ] = useState("");
  const todos = f.tasks.filter(t => t.kind === "todo"), S = todoSections(todos, today, cleared), R = rate30(todos, today);
  const w = q.trim().toLowerCase(), list = (S[sec] || []).filter(t => !w || t.title.toLowerCase().includes(w));
  const groups = sec === "today" || sec === "nodate" ? [[sec === "today" ? dayLong(today) : "No date", list]] : byDate(list, today, k => k === today ? `Today · ${dayLong(k)}` : dayLong(k));
  const addDue = sec === "upcoming" ? addDays(today, 1) : sec === "nodate" ? null : today;
  useFocus(!inWidget ? focus : null, "todo");
  return (
    <div className={`pl-tdb ${inWidget ? "inw" : ""}`} id={inWidget ? "pl-tb-w" : "pl-tb"}>
      <nav className="pl-tbnav" aria-label="To-do sections">
        {SECTIONS.map((x, i) => x === "-" ? <i key={i} className="pl-tbsep"/> : <button key={x[0]} type="button" className={`pl-tbs ${sec === x[0] ? "on" : ""} s-${x[0]}`} onClick={() => setSec(x[0])} data-sec={x[0]}>
          <PI n={x[2]} s={15}/><span>{x[1]}</span><small>{(S[x[0]] || []).length}</small></button>)}
        <div className="pl-tbrate">{R.rate == null ? <small>Nothing closed in the last 30 days</small>
          : <><b>{R.rate}%</b><small>done · last 30 days</small><span className="pl-trk"><i style={{ width: `${R.rate}%` }}/></span><small>{R.d} done · {R.m} missed</small></>}</div>
      </nav>
      <div className="pl-tbmain">
        <div className="pl-tbh"><h2>{(SECTIONS.find(x => x[0] === sec) || [])[1]}</h2><small>{plural(list.length, "to-do")}</small><span className="pl-sp"/>
          <span className="pl-tbq"><PI n="search" s={14}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find" aria-label="Find a to-do"/></span>
          {(sec === "done" || sec === "missed") && <label className="pl-chk sm"><input type="checkbox" checked={cleared} onChange={e => setCleared(e.target.checked)} id="pl-tb-cleared"/>Show cleared</label>}
          {(sec === "done" || sec === "missed") && list.some(t => !t.archived) && <button type="button" className="px-btn" onClick={() => ops.task.clearDone(list.filter(t => !t.archived).length, sec)}
            title="Off the dashboard — they stay here (Show cleared) and in the calendar">Clear from the dashboard</button>}</div>
        {sec !== "done" && sec !== "missed" && <TodoAdd ops={ops} st={st} nb={nb} today={today} due={addDue} id={inWidget ? "pl-tb-add-w" : "pl-tb-add"}/>}
        <div className="pl-tbt" role="table" aria-label="To-dos">
          <div className="pl-trow wide head" role="row"><span/><span>To-do</span><span>Notebook</span><span>Date</span><span>Time</span><span>Repeat</span><span/></div>
          {!list.length && <p className="pl-muted pl-pad">{sec === "missed" ? "Nothing missed." : sec === "done" ? "Nothing done yet." : "Nothing here — add one above."}</p>}
          {groups.map(([l, items]) => items.length > 0 && <div key={l} className="pl-tbg" data-grp={l}><div className="pl-gl">{l}<small>{items.length}</small></div>
            {items.map(t => <TodoRow key={t.id} t={t} nbs={nbs} st={st} today={today} ops={ops} wide/>)}</div>)}
        </div>
      </div>
    </div>);
}

// scroll to a row asked for elsewhere (the calendar, the search) and light it up for a moment
export function useFocus(focus, kind) {
  useEffect(() => {
    if (!focus || focus.kind !== kind) return undefined;
    const k = setTimeout(() => { const el = document.querySelector(`[data-task="${focus.id}"]`); if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("pl-flash");
      const inp = el.querySelector("input.pl-tin,input.pl-rowin"); if (inp) inp.focus({ preventScroll: true }); setTimeout(() => el.classList.remove("pl-flash"), 1600); }, 160);
    return () => clearTimeout(k);
  }, [focus && focus.n]);
}

// ── reading what Excel / Google Sheets put on the clipboard (tab-separated rows): dates, statuses, percentages
const MONS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const iso3 = (y, m, d) => { y = +y < 100 ? 2000 + +y : +y; m = +m; d = +d; if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100)) return undefined;
  const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCMonth() === m - 1 ? t.toISOString().slice(0, 10) : undefined; };
export function parseDate(s) {
  s = String(s || "").trim(); if (!s || s === "-" || s === "—") return null; let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso3(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) return +m[2] > 12 && +m[1] <= 12 ? iso3(m[3], m[1], m[2]) : iso3(m[3], m[2], m[1]);   // India: day first
  if ((m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s,-]+(\d{2,4})$/))) { const mo = MONS[m[2].slice(0, 4).toLowerCase()] || MONS[m[2].slice(0, 3).toLowerCase()]; if (mo) return iso3(m[3], mo, m[1]); }
  if ((m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/)) && MONS[m[1].slice(0, 3).toLowerCase()]) return iso3(m[3], MONS[m[1].slice(0, 3).toLowerCase()], m[2]);
  if (/^\d{5}$/.test(s)) { const t = new Date(Date.UTC(1899, 11, 30) + +s * 86400000); return t.toISOString().slice(0, 10); }   // an Excel day number
  return undefined;
}
export const parseStatus = s => { s = String(s || "").trim().toLowerCase(); if (!s) return undefined;
  if (/^(done|complete|completed|finished|closed|yes|✓)$/.test(s)) return "done"; if (/hold|pause|block|wait/.test(s)) return "hold";
  if (/not\s*started|^to\s*do$|^todo$|^open$|^pending$|^new$/.test(s)) return "todo"; if (/progress|doing|started|wip|ongoing|active/.test(s)) return "doing"; return undefined; };
export const parseProgress = s => { s = String(s || "").trim().replace(/%$/, ""); if (s === "") return undefined; const n = Number(s); if (!isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n <= 1 && /\./.test(s) ? n * 100 : n))); };
const tsvRows = text => { const r = String(text).replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map(l => l.split("\t")); return r.filter((x, i) => i < r.length - 1 || x.some(c => c.trim())); };
const HEAD = /^(task|tasks|name|title|start|start date|end|end date|due|finish|progress|%|status|state)$/i;


// the shape of a planner: its rows as a tree, each row's progress (a row with rows under it = the average of them), the overall progress
export function planShape(tasks, planId) {
  const all = tasks.filter(t => t.kind === "plan" && t.plan === planId), byId = new Map(all.map(t => [t.id, t])), kids = new Map();
  all.forEach(t => { const k = t.parent && byId.has(t.parent) ? t.parent : null; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(t); });
  kids.forEach(l => l.sort((a, b) => a.sort - b.sort || a.id - b.id));
  const roll = new Map();
  const go = t => { const ks = kids.get(t.id) || [];
    if (!ks.length) { const r = { p: t.status === "done" ? 100 : t.progress || 0, n: 0, d: 0, all: t.status === "done" }; roll.set(t.id, r); return r; }
    let p = 0, n = 0, d = 0, alld = t.status === "done";
    ks.forEach(c => { const r = go(c); p += r.p; n += 1 + r.n; d += (c.status === "done" ? 1 : 0) + r.d; alld = alld && r.all; });
    const r = { p: Math.round(p / ks.length), n, d, all: alld }; roll.set(t.id, r); return r; };
  const tops = kids.get(null) || []; tops.forEach(go);
  const overall = tops.length ? Math.round(tops.reduce((s, t) => s + roll.get(t.id).p, 0) / tops.length) : 0;
  const starts = all.map(t => t.start).filter(Boolean).sort(), ends = all.map(t => t.due).filter(Boolean).sort();
  return { all, byId, kids, roll, tops, overall, from: starts[0] || null, to: ends[ends.length - 1] || null, done: all.filter(t => t.status === "done").length };
}

// progress: a slider on a row of its own; a row with rows under it shows their average (read only)
function Progress({ value, onSet, parent, n }) {
  const [v, setV] = useState(value); useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onSet(v); };
  if (parent) return <span className="pl-prg ro" title={`The average of the ${plural(n, "row")} under it`} role="img" aria-label={`${value}% done`}><span className="pl-trk"><i style={{ width: `${value}%` }}/></span><b>{value}%</b></span>;
  return (
    <span className="pl-prg">
      <input type="range" min={0} max={100} step={5} value={v} onChange={e => setV(+e.target.value)} onPointerUp={commit} onKeyUp={commit} onBlur={commit}
        aria-label="Progress" style={{ "--p": `${v}%` }}/><b>{v}%</b>
    </span>);
}

// ── one planner: a table you type into, and a little Excel. Enter = next row · Tab = under the row above · Shift + Tab = back ·
// click a cell (or a row number) to pick it, drag over cells or Shift + click for more · the square in the corner fills the rows below
// (dates go on a day at a time; status and progress copy) · Ctrl + C / Ctrl + V to and from Excel · Delete clears dates · double-click or
// Enter changes a cell · the progress is a slider
const COLS = ["title", "start", "due", "progress", "status"];
export function PlannerTable({ plan, st, f, nbs, today, ops, focus, page }) {
  const [shut, setShutRaw] = useState(() => new Set(ls.get("hp_pl_shut", [])));
  const setShut = fn => setShutRaw(s => { const n = fn(new Set(s)); ls.set("hp_pl_shut", [...n].slice(-500)); return n; });
  const [hide, setHideRaw] = useState(() => ls.get("hp_pl_hidedone", false)); const setHide = v => { setHideRaw(v); ls.set("hp_pl_hidedone", v); };
  const [draft, setDraft] = useState(null);
  const [sel, setSel] = useState(null); const [fill, setFill] = useState(null); const [edit, setEdit] = useState(null); const [dp, setDp] = useState(null);
  const refs = useRef(new Map()), want = useRef(null), busy = useRef(false), tbl = useRef(null), drag = useRef(null), live = useRef({}), dpBtn = useRef(null);
  const P = useMemo(() => planShape(st.tasks, plan.id), [st.tasks, plan.id]);
  const { byId, kids, roll } = P;
  const keep = useMemo(() => { const out = new Set();
    f.tasks.filter(t => t.kind === "plan" && t.plan === plan.id).forEach(t0 => { let x = byId.get(t0.id); while (x && !out.has(x.id)) { out.add(x.id); x = x.parent ? byId.get(x.parent) : null; } });
    return out; }, [f.tasks, byId, plan.id]);
  const rows = [];
  const walk = (p, lv) => (kids.get(p) || []).forEach(t => { if (!keep.has(t.id) || (hide && (roll.get(t.id) || {}).all)) return; rows.push({ t, lv }); if (!shut.has(t.id)) walk(t.id, lv + 1); });
  walk(null, 0);
  const flat = rows.map(r => r.t);
  if (draft) {
    const lvOf = p => { let n = 0, x = p && byId.get(p); while (x) { n++; x = x.parent && byId.get(x.parent); } return n; };
    let at = rows.length;
    if (draft.after != null) { const i = rows.findIndex(r => r.t.id === draft.after); if (i >= 0) { at = i + 1; while (at < rows.length && rows[at].lv > rows[i].lv) at++; } }
    else if (draft.parent != null) { const i = rows.findIndex(r => r.t.id === draft.parent); if (i >= 0) at = i + 1; }
    rows.splice(at, 0, { draft: true, lv: lvOf(draft.parent) });
  }
  useEffect(() => { if (want.current != null) { const el = refs.current.get(want.current); if (el) { el.focus(); want.current = null; } } });
  useFocus(focus, "plan");
  useEffect(() => { if (focus && focus.kind === "plan") setShut(s => { let x = byId.get(focus.id); while (x && x.parent) { s.delete(x.parent); x = byId.get(x.parent); } return s; }); }, [focus && focus.n]);

  const startDraft = (parent, after) => { setSel(null); setDraft({ parent, after, title: "", key: Date.now() }); want.current = "draft"; };
  const addTop = () => { const top = kids.get(null) || []; startDraft(null, top.length ? top[top.length - 1].id : null); };
  const create = async (d, again) => {
    const title = clean(d.title).trim();
    setDraft(null);
    if (!title || busy.current) return;
    busy.current = true;
    const r = await ops.task.create({ kind: "plan", title, parent: d.parent, after: d.after, plan: plan.id, nb: plan.nb });
    busy.current = false;
    if (r && again) startDraft(r.parent, r.id);
  };
  const draftKey = e => {
    const d = draft;
    if (e.key === "Enter") { e.preventDefault(); create(d, true); }
    else if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
    else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault(); const above = d.after != null && byId.get(d.after);
      if (above) { const k = kids.get(above.id) || []; setShut(s => { s.delete(above.id); return s; }); setDraft({ ...d, parent: above.id, after: k.length ? k[k.length - 1].id : null }); want.current = "draft"; }
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault(); if (d.parent != null) { const p = byId.get(d.parent); setDraft({ ...d, parent: p.parent, after: p.id }); want.current = "draft"; }
    }
  };
  const move = async (t, action) => { want.current = t.id; await ops.task.move(t.id, action); };
  const ids = flat.map(t => t.id);
  const rowKey = (e, t, save) => {
    const i = ids.indexOf(t.id);
    if (e.key === "Enter") { e.preventDefault(); save(); startDraft(t.parent, t.id); }
    else if (e.key === "Tab") { e.preventDefault(); save(); move(t, e.shiftKey ? "outdent" : "indent"); }
    else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); save(); move(t, e.key === "ArrowUp" ? "up" : "down"); }
    else if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); save(); refs.current.get(ids[i - 1]).focus(); }
    else if (e.key === "ArrowDown" && i < ids.length - 1) { e.preventDefault(); save(); refs.current.get(ids[i + 1]).focus(); }
    else if (e.key === "Backspace" && !e.currentTarget.value && !(kids.get(t.id) || []).length) { e.preventDefault(); if (i > 0) want.current = ids[i - 1]; ops.task.remove(t, 0); }
  };

  // ── the little Excel
  const rect = sel && { r0: Math.min(sel.a[0], sel.b[0]), r1: Math.max(sel.a[0], sel.b[0]), c0: Math.min(sel.a[1], sel.b[1]), c1: Math.max(sel.a[1], sel.b[1]) };
  live.current = { rect, fill, flat, kids };
  const inSel = (r, c) => rect && r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
  const inFill = r => fill != null && rect && (fill > rect.r1 ? r > rect.r1 && r <= fill : fill < rect.r0 && r >= fill && r < rect.r0);
  const leaf = t => !(kids.get(t.id) || []).length;
  const valOf = (t, c) => c === 0 ? t.title : c === 1 ? t.start : c === 2 ? t.due : c === 3 ? (roll.get(t.id) || { p: 0 }).p : t.status;
  const pick = (r, c, ext) => { setEdit(null); setSel(s => ext && s ? { a: s.a, b: [r, c] } : { a: [r, c], b: [r, c] }); if (tbl.current) tbl.current.focus({ preventScroll: true }); };
  const cellDown = (e, r, c) => { if (e.button !== 0) return; const ctl = e.target.closest("input,select,button");
    if (ctl && !(e.shiftKey && c === 0 && ctl.tagName === "INPUT")) return; e.preventDefault(); pick(r, c, e.shiftKey); drag.current = "sel"; };
  const rowDown = (e, r) => { if (e.button !== 0) return; e.preventDefault(); setEdit(null);
    setSel(s => e.shiftKey && s ? { a: [s.a[0], 0], b: [r, 4] } : { a: [r, 0], b: [r, 4] }); drag.current = "rows"; if (tbl.current) tbl.current.focus({ preventScroll: true }); };
  const over = (r, c) => { if (drag.current === "sel") setSel(s => s && { a: s.a, b: [r, c] }); else if (drag.current === "rows") setSel(s => s && { a: [s.a[0], 0], b: [r, 4] }); else if (drag.current === "fill") setFill(r); };
  const patchMany = async list => { for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map(([id, ch]) => ops.task.patch(id, ch))); };
  const applyFill = async () => {
    const { rect: R, fill: to, flat: F, kids: K } = live.current; setFill(null); if (!R || to == null || (to >= R.r0 && to <= R.r1)) return;
    const down = to > R.r1, targets = down ? F.slice(R.r1 + 1, to + 1) : F.slice(to, R.r0).reverse(), src = F.slice(R.r0, R.r1 + 1), out = new Map();
    for (let c = Math.max(1, R.c0); c <= R.c1; c++) {
      const vals = src.map(t => valOf(t, c)), seq = down ? vals : vals.slice().reverse();
      targets.forEach((t, k) => {
        let v;
        if (c === 1 || c === 2) { const last = seq[seq.length - 1], prev = seq.length > 1 ? seq[seq.length - 2] : null;
          v = last == null ? null : addDays(last, (prev ? diffDays(last, prev) : (down ? 1 : -1)) * (k + 1)); }
        else v = seq[k % seq.length];
        if (c === 3 && (K.get(t.id) || []).length) return;
        const ch = out.get(t.id) || {}; ch[c === 1 ? "start" : c === 2 ? "due" : c === 3 ? "progress" : "status"] = v; out.set(t.id, ch);
      });
    }
    await patchMany([...out.entries()]);
    setSel({ a: [Math.min(R.r0, to), R.c0], b: [Math.max(R.r1, to), R.c1] });
  };
  useEffect(() => { const up = () => { if (drag.current === "fill") applyFill(); drag.current = null; }; window.addEventListener("mouseup", up); return () => window.removeEventListener("mouseup", up); }, []);
  const fmtCell = (t, c) => { const v = valOf(t, c); return c === 3 ? `${v}%` : c === 4 ? (P_STATUS.find(x => x[0] === v) || [])[1] : v || ""; };
  const copy = async () => {
    if (!rect) return;
    const txt = flat.slice(rect.r0, rect.r1 + 1).map(t => Array.from({ length: rect.c1 - rect.c0 + 1 }, (_, j) => fmtCell(t, rect.c0 + j)).join("\t")).join("\n");
    try { await navigator.clipboard.writeText(txt); ops.say(`Copied ${plural(rect.r1 - rect.r0 + 1, "row")} — paste into Excel`); } catch { ops.say("The browser did not allow copying", true); }
  };
  const paste = async (text, r0, c0, place) => {
    let grid = tsvRows(text).slice(0, 300); if (!grid.length) return;
    if (grid.length > 1 && grid[0].filter(x => HEAD.test(x.trim())).length >= 2) grid = grid.slice(1);
    const F = live.current.flat, upd = [], adds = [];
    grid.forEach((cells, i) => {
      const t = F[r0 + i], ch = {};
      cells.forEach((raw, j) => { const c = c0 + j; if (c > 4) return;
        if (c === 0) { const s = clean(raw).trim(); if (s) ch.title = s.slice(0, 300); }
        if (c === 1 || c === 2) { const d = parseDate(raw); if (d !== undefined) ch[c === 1 ? "start" : "due"] = d; }
        if (c === 3) { const p = parseProgress(raw); if (p !== undefined) ch.progress = p; }
        if (c === 4) { const s = parseStatus(raw); if (s) ch.status = s; } });
      if (t) { if (ch.progress !== undefined && !leaf(t)) delete ch.progress; if (Object.keys(ch).length) upd.push([t.id, ch]); }
      else if (c0 === 0 && ch.title) adds.push(ch);
    });
    await patchMany(upd);
    const tops = kids.get(null) || [];
    const last = place || { parent: null, after: tops.length ? tops[tops.length - 1].id : null };
    let after = last.after;
    for (const ch of adds) { const r = await ops.task.create({ kind: "plan", title: ch.title, parent: last.parent, after, plan: plan.id, nb: plan.nb, start: ch.start, due: ch.due, status: ch.status, progress: ch.progress }); if (r) after = r.id; }
    const skipped = c0 > 0 ? grid.length - Math.min(grid.length, F.length - r0) : 0;
    ops.say(`Pasted ${plural(upd.length + adds.length, "row")}${skipped > 0 ? ` · ${skipped} more need the Task column to be added` : ""}`);
  };
  const openCell = (r, c, init) => {
    const t = flat[r]; if (!t) return;
    if (c === 0) { const el = refs.current.get(t.id); if (el) { setSel(null); el.focus(); } return; }
    if (c === 1 || c === 2) { dpBtn.current = tbl.current && tbl.current.querySelector(`[data-cell="${r}-${c}"]`); setDp({ id: t.id, c }); return; }
    if (c === 3 && !leaf(t)) { ops.say("Its progress comes from the rows under it"); return; }
    setEdit({ id: t.id, c, init });
  };
  const keyDown = e => {
    if (e.target !== tbl.current || !rect) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey, n = flat.length;
    const mv = (dr, dc) => { e.preventDefault(); const b = sel.b, nr = Math.max(0, Math.min(n - 1, b[0] + dr)), nc = Math.max(0, Math.min(4, b[1] + dc)); setSel(e.shiftKey ? { a: sel.a, b: [nr, nc] } : { a: [nr, nc], b: [nr, nc] }); };
    if (k === "ArrowDown") mv(1, 0); else if (k === "ArrowUp") mv(-1, 0); else if (k === "ArrowLeft") mv(0, -1); else if (k === "ArrowRight" || (k === "Tab" && !e.shiftKey)) mv(0, 1);
    else if (k === "Tab") mv(0, -1);
    else if (mod && k.toLowerCase() === "c") { e.preventDefault(); copy(); }
    else if (mod && k.toLowerCase() === "a") { e.preventDefault(); setSel({ a: [0, 0], b: [n - 1, 4] }); }
    else if (k === "Escape") setSel(null);
    else if (k === "Enter" || k === "F2") { e.preventDefault(); openCell(sel.b[0], sel.b[1]); }
    else if (k === "Delete" || k === "Backspace") {
      e.preventDefault(); const list = [];
      flat.slice(rect.r0, rect.r1 + 1).forEach(t => { const ch = {}; if (rect.c0 <= 1 && rect.c1 >= 1) ch.start = null; if (rect.c0 <= 2 && rect.c1 >= 2) ch.due = null;
        if (rect.c0 <= 3 && rect.c1 >= 3 && leaf(t)) ch.progress = 0; if (Object.keys(ch).length) list.push([t.id, ch]); });
      patchMany(list);
    } else if (/^\d$/.test(k) && sel.b[1] === 3 && !mod) { e.preventDefault(); openCell(sel.b[0], 3, k); }
  };
  const onPaste = e => { if (e.target !== tbl.current) return; const txt = e.clipboardData && e.clipboardData.getData("text/plain"); if (!txt) return; e.preventDefault();
    paste(txt, rect ? rect.r0 : flat.length, rect ? rect.c0 : 0); };
  const rowPaste = (e, r) => { const txt = e.clipboardData && e.clipboardData.getData("text/plain"); if (!txt || !/[\t\n]/.test(txt.replace(/\n$/, ""))) return; e.preventDefault(); paste(txt, r, 0); };

  const parents = P.all.filter(t => (kids.get(t.id) || []).length).map(t => t.id);
  const anyShut = parents.some(id => shut.has(id));
  const dpTask = dp && byId.get(dp.id);
  let ri = -1;
  return (
    <div className={`pl-ptable ${page ? "page" : ""}`} data-plan={plan.id}>
      <div className="pl-ptool">
        {P.all.length > 0 && <span className="pl-ovr" title="Overall progress (the average of the top rows)"><span className="pl-trk"><i style={{ width: `${P.overall}%` }}/></span><b>{P.overall}%</b><small>{plural(P.all.length, "row")}</small></span>}
        <span className="pl-sp"/>
        <button type="button" className={`pl-ib ${hide ? "on" : ""}`} onClick={() => setHide(!hide)} aria-pressed={hide} id="pl-hide-done"
          title={hide ? "Show finished rows again" : "Hide finished rows (a row and everything under it done)"} aria-label="Hide finished rows"><PI n={hide ? "eyeoff" : "eye"} s={16}/></button>
        <button type="button" className="pl-ib" onClick={() => setShut(() => anyShut ? new Set() : new Set(parents))} title={anyShut ? "Expand all" : "Collapse all"}
          aria-label={anyShut ? "Expand all" : "Collapse all"} id="pl-expand" disabled={!parents.length}><PI n={anyShut ? "expand" : "collapse"} s={16}/></button>
      </div>
      <div className="pl-tbl" role="grid" aria-label={plan.name} ref={tbl} tabIndex={0} onKeyDown={keyDown} onPaste={onPaste} id="pl-grid" aria-multiselectable="true">
        <div className="pl-tr head" role="row"><span className="pl-rn"/><span role="columnheader">Task</span><span role="columnheader">Start</span><span role="columnheader">End</span>
          <span role="columnheader" className="pl-cdays">Days</span><span role="columnheader">Progress</span><span role="columnheader">Status</span><span/></div>
        {!rows.length && <p className="pl-muted pl-pad">{P.all.length ? (hide ? "Everything here is finished — press the eye to show it." : "No planned task matches the filters.")
          : "Press Add a row and type — Enter for the next row, Tab to put it under the one above. Or paste rows straight from Excel."}</p>}
        {rows.map(r => {
          if (r.draft) return (
            <div key={`d${draft.key}`} className="pl-tr draft" role="row" style={{ "--lv": r.lv }}>
              <span className="pl-rn"/>
              <span className="pl-tcell t"><span className="pl-tw2"/><input ref={el => { if (el) refs.current.set("draft", el); }} className="pl-rowin" value={draft.title} placeholder="Type a task — Enter adds it, Tab puts it under the row above"
                onChange={e => setDraft({ ...draft, title: e.target.value })} onKeyDown={draftKey} onBlur={() => create(draft, false)} maxLength={300} aria-label="New planned task" id="pl-draft"
                onPaste={e => { const txt = e.clipboardData.getData("text/plain"); if (txt && /[\t\n]/.test(txt.replace(/\n$/, ""))) { e.preventDefault(); const d = draft; setDraft(null); paste(txt, live.current.flat.length, 0, { parent: d.parent, after: d.after }); } }}/></span>
            </div>);
          ri += 1; const t = r.t, rix = ri, rr = roll.get(t.id) || { p: 0, n: 0, d: 0 }, late = t.status !== "done" && t.due && t.due < today;
          const corner = rect && rix === rect.r1 && rect.c1 >= 1 && !fill;
          return <PlanRow key={t.id} t={t} rix={rix} lv={r.lv} rr={rr} late={late} today={today} ops={ops} st={st} plan={plan} nbs={nbs} shut={shut.has(t.id)} refs={refs} inSel={inSel} inFill={inFill(rix)}
            cur={sel && sel.b[0] === rix ? sel.b[1] : -1} corner={corner ? rect.c1 : -1} edit={edit && edit.id === t.id ? edit : null} setEdit={setEdit}
            onShut={() => setShut(s => { s.has(t.id) ? s.delete(t.id) : s.add(t.id); return s; })} onKey={rowKey} onMove={a => move(t, a)} onPaste={e => rowPaste(e, rix)}
            onCellDown={cellDown} onRowDown={rowDown} onOver={over} onOpen={c => openCell(rix, c)} onFill={e => { e.preventDefault(); e.stopPropagation(); drag.current = "fill"; setFill(rect.r1); }}
            onAdd={() => startDraft(t.parent, t.id)} onSub={() => { const k = kids.get(t.id) || []; setShut(s => { s.delete(t.id); return s; }); startDraft(t.id, k.length ? k[k.length - 1].id : null); }}
            onDelete={() => ops.task.remove(t, rr.n)}/>;
        })}
        {!draft && <button type="button" className="pl-addc" onClick={addTop} id="pl-plan-add"><PI n="plus" s={14}/>Add a row</button>}
      </div>
      {sel && <p className="pl-gridhint">{rect.r1 - rect.r0 + 1} × {rect.c1 - rect.c0 + 1} picked · Ctrl + C copies for Excel · Ctrl + V pastes from it · drag the square to fill · Delete clears dates · Enter changes</p>}
      {dp && dpTask && <DatePop value={dp.c === 1 ? dpTask.start : dpTask.due} today={today} btn={dpBtn} clear onClose={() => setDp(null)}
        onPick={d => ops.task.patch(dpTask.id, { [dp.c === 1 ? "start" : "due"]: d })}/>}
    </div>);
}

function PlanRow({ t, rix, lv, rr, late, today, ops, st, plan, nbs, shut, refs, inSel, inFill, cur, corner, edit, setEdit, onShut, onKey, onMove, onPaste, onCellDown, onRowDown, onOver, onOpen, onFill, onAdd, onSub, onDelete }) {
  const [v, setV] = useState(t.title); useEffect(() => setV(t.title), [t.title]);
  const save = () => { const s = clean(v).trim(); if (!s) setV(t.title); else if (s !== t.title) ops.task.patch(t.id, { title: s }); };
  const days = t.start && t.due ? diffDays(t.due, t.start) + 1 : null, prog = rr.n ? rr.p : (t.status === "done" ? 100 : t.progress || 0);
  const others = st.plans.filter(p => p.id !== plan.id);
  const cell = (c, cls, body) => <span className={`pl-tcell ${cls || ""} ${inSel(rix, c) ? "sel" : ""} ${cur === c ? "cur" : ""} ${inFill ? "fill" : ""}`} role="gridcell" data-cell={`${rix}-${c}`}
    aria-selected={inSel(rix, c) || undefined} onMouseDown={e => onCellDown(e, rix, c)} onMouseEnter={() => onOver(rix, c)} onDoubleClick={e => { if (!e.target.closest("input[type=range]")) onOpen(c); }}>
    {body}{corner === c && <span className="pl-fillh" onMouseDown={onFill} title="Drag down to fill" aria-hidden="true"/>}</span>;
  return (
    <div className={`pl-tr ${t.status === "done" ? "done" : ""}`} role="row" style={{ "--lv": lv }} data-task={t.id} data-lv={lv}>
      <button type="button" className="pl-rn" onMouseDown={e => onRowDown(e, rix)} onMouseEnter={() => onOver(rix, 0)} tabIndex={-1} aria-label={`Pick row ${rix + 1}`} title="Pick the row">{rix + 1}</button>
      {cell(0, "t", <>
        {rr.n > 0 ? <button type="button" className="pl-tw2" onClick={onShut} aria-expanded={!shut} aria-label={shut ? "Show the rows under it" : "Hide the rows under it"}><PI n={shut ? "right" : "down"} s={13}/></button> : <span className="pl-tw2"/>}
        <input ref={el => { if (el) refs.current.set(t.id, el); else refs.current.delete(t.id); }} className="pl-rowin" value={v} onChange={e => setV(e.target.value)} onBlur={save}
          onKeyDown={e => onKey(e, t, save)} onPaste={onPaste} maxLength={300} aria-label="Task" title={t.title.length > 40 ? t.title : undefined}/>
        {rr.n > 0 && <small className="pl-roll" title={`${rr.d} of ${rr.n} rows under it done`}>{rr.d}/{rr.n}</small>}</>)}
      {cell(1, "dt", <span className={`pl-cv ${t.start ? "" : "nil"}`}>{t.start ? dayShort(t.start, today) : "Start"}</span>)}
      {cell(2, "dt", <span className={`pl-cv ${t.due ? "" : "nil"} ${late ? "late" : ""}`}>{t.due ? dayShort(t.due, today) : "End"}</span>)}
      <span className="pl-tcell pl-cdays">{days ? plural(days, "day") : ""}</span>
      {cell(3, "pg", edit && edit.c === 3
        ? <input className="pl-cedit" type="number" min={0} max={100} step={5} autoFocus defaultValue={edit.init != null ? edit.init : prog} aria-label="Progress (%)"
            onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.dataset.cancel = "1"; e.currentTarget.blur(); } }}
            onBlur={e => { const n = parseProgress(e.target.value); setEdit(null); if (!e.target.dataset.cancel && n !== undefined && n !== prog) ops.task.patch(t.id, { progress: n }); }}/>
        : <Progress value={prog} parent={rr.n > 0} n={rr.n} onSet={p => ops.task.patch(t.id, { progress: p })}/>)}
      {cell(4, "stc", edit && edit.c === 4
        ? <select className={`pl-st s-${t.status}`} autoFocus defaultValue={t.status} aria-label="Status" ref={el => { if (el && !el.dataset.o) { el.dataset.o = "1"; try { el.showPicker(); } catch { /* opens on the next click */ } } }}
            onChange={e => { setEdit(null); ops.task.patch(t.id, { status: e.target.value }); }} onBlur={() => setEdit(null)} onKeyDown={e => { if (e.key === "Escape") setEdit(null); }}>
            {P_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        : <span className={`pl-stp s-${t.status}`} title="Double-click to change">{(P_STATUS.find(x => x[0] === t.status) || [])[1]}</span>)}
      <span className="pl-tcell a" role="cell"><Menu icon="more" title="More" align="right" items={[
        { label: "Add a row below", icon: "plus", run: onAdd }, { label: "Add a row under it", icon: "right", run: onSub },
        "-", { label: "Indent (Tab)", icon: "right", run: () => onMove("indent") }, { label: "Outdent (Shift + Tab)", icon: "left", run: () => onMove("outdent"), disabled: !t.parent },
        { label: "Move up (Alt + ↑)", icon: "up", run: () => onMove("up") }, { label: "Move down (Alt + ↓)", icon: "down", run: () => onMove("down") },
        { head: "Status" }, ...P_STATUS.map(([k, l]) => ({ label: l, on: t.status === k, run: () => ops.task.patch(t.id, { status: k }) })),
        !t.parent && others.length > 0 && { head: "Move to planner" },
        ...(!t.parent ? others.slice(0, 20).map(p => ({ label: `${p.name}${st.notebooks.length > 1 ? ` · ${(nbs.get(p.nb) || {}).name || ""}` : ""}`, icon: "project", run: () => ops.task.patch(t.id, { plan_id: p.id }) })) : []),
        "-", { label: rr.n ? `Delete (with ${plural(rr.n, "row")} under it)` : "Delete", icon: "trash", danger: true, run: onDelete }]}/></span>
    </div>);
}

// a new planner: its name (and its notebook when "All notebooks" is picked)
function NewPlanner({ st, nb, ops, onMade, id = "pl-plan-new" }) {
  const [on, setOn] = useState(false); const [v, setV] = useState(""); const [n, setN] = useState(nb || st.notebooks[0].id);
  useEffect(() => { if (nb) setN(nb); }, [nb]);
  const go = async () => { const s = clean(v).trim(); if (!s) { setOn(false); return; } const p = await ops.plan.create({ notebook_id: nb || n, name: s }); if (p) { setV(""); setOn(false); onMade && onMade(p); } };
  if (!on) return <button type="button" className="pl-pchip add" onClick={() => setOn(true)} id={id} title="A new planner"><PI n="plus" s={13}/>Planner</button>;
  return (
    <form className="pl-pchip edit" onSubmit={e => { e.preventDefault(); go(); }}>
      <input autoFocus value={v} onChange={e => setV(e.target.value)} placeholder="Planner name — Enter" maxLength={80} aria-label="New planner name" id={`${id}-name`}
        onKeyDown={e => { if (e.key === "Escape") { setV(""); setOn(false); } }} onBlur={() => !v.trim() && setOn(false)}/>
      {!nb && st.notebooks.length > 1 && <select value={n} onChange={e => setN(Number(e.target.value))} aria-label="Notebook">{st.notebooks.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
    </form>);
}
const planMenu = (p, st, ops, nbs) => [
  { label: "Rename", icon: "edit", run: () => ops.plan.rename(p) },
  st.notebooks.length > 1 && { head: "Notebook" },
  ...(st.notebooks.length > 1 ? st.notebooks.map(n => ({ label: n.name, swatch: n.color, on: n.id === p.nb, run: () => ops.plan.patch(p.id, { notebook_id: n.id }) })) : []),
  "-", { label: "Delete the planner…", icon: "trash", danger: true, run: () => ops.plan.remove(p) }];

// ── the Planner widget of the dashboard: every planner as a small chip (with its progress) — the picked one below
export function PlannerWidget(vp) {
  const { st, nb, nbs, ops, focus } = vp;
  const plans = st.plans.filter(p => !nb || p.nb === nb);
  const key = `hp_pl_plan_${nb || 0}`;
  const [pid, setPidRaw] = useState(() => ls.get(key, null)); const setPid = v => { setPidRaw(v); ls.set(key, v); };
  useEffect(() => { setPidRaw(ls.get(key, null)); }, [nb]);
  useEffect(() => { if (focus && focus.kind === "plan") { const t = st.tasks.find(x => x.id === focus.id); if (t && t.plan) setPid(t.plan); } }, [focus && focus.n]);
  const cur = plans.find(p => p.id === pid) || plans[0];
  const shapes = useMemo(() => new Map(plans.map(p => [p.id, planShape(st.tasks, p.id)])), [st.tasks, plans.map(p => p.id).join()]);
  return (
    <Widget id="pl-plan" cls="pl-plan" title="Planner" icon="project" label="Planner"
      top={<div className="pl-pchips" role="tablist" aria-label="Planners">
        {plans.map(p => { const sh = shapes.get(p.id);
          return <button key={p.id} type="button" role="tab" aria-selected={cur && cur.id === p.id} className={`pl-pchip ${cur && cur.id === p.id ? "on" : ""}`} data-c={(nbs.get(p.nb) || {}).color}
            onClick={() => setPid(p.id)} data-plan-chip={p.id} title={`${p.name} · ${sh.overall}% done · ${plural(sh.all.length, "row")}`}>
            {!nb && <i/>}<span>{p.name}</span><em>{sh.overall}%</em></button>; })}
        <NewPlanner st={st} nb={nb} ops={ops} onMade={p => setPid(p.id)}/>
      </div>}>
      {cur ? <PlannerTable key={cur.id} plan={cur} {...vp}/> : <p className="pl-muted pl-pad">No planner yet. Press <b>+ Planner</b> to make one — a project, a study plan, a fitness block.</p>}
    </Widget>);
}

// ── the Planner tab: every planner as a tile (progress, rows, dates); open one to work in it
export function PlannerTiles(vp) {
  const { st, nb, nbs, ops, today, openPlan, setOpenPlan } = vp;
  const plans = st.plans.filter(p => !nb || p.nb === nb);
  const cur = openPlan && st.plans.find(p => p.id === openPlan);
  if (cur) {
    const sh = planShape(st.tasks, cur.id);
    return (
      <section className="px-card pl-wid page pl-plan pl-pdetail" id="pl-plan-page" aria-label={cur.name}>
        <div className="pl-ch"><button type="button" className="px-btn" onClick={() => setOpenPlan(null)} id="pl-plan-back"><PI n="back" s={15}/>Planners</button>
          <h3><PI n="project" s={16}/>{cur.name}</h3><NbDot nb={nbs.get(cur.nb)}/>
          <small className="pl-muted">{sh.from ? `${dayShort(sh.from, today)} → ${sh.to ? dayShort(sh.to, today) : "…"}` : ""}</small>
          <span className="pl-sp"/><Menu icon="more" title="Planner" align="right" id="pl-plan-menu" items={planMenu(cur, st, ops, nbs)}/></div>
        <div className="pl-wbody"><PlannerTable plan={cur} {...vp} page/></div>
      </section>);
  }
  return (
    <section className="pl-ptiles" id="pl-plan-tiles" aria-label="Planners">
      {plans.map(p => { const sh = planShape(st.tasks, p.id), late = sh.all.filter(t => t.status !== "done" && t.due && t.due < today).length;
        return <article key={p.id} className="px-card pl-ptile" data-c={(nbs.get(p.nb) || {}).color} data-plan-tile={p.id} tabIndex={0}
          onClick={e => { if (!e.target.closest(".pl-menu")) setOpenPlan(p.id); }} onKeyDown={e => { if (e.key === "Enter") setOpenPlan(p.id); }}>
          <div className="pl-pth"><h4>{p.name}</h4><span onClick={e => e.stopPropagation()}><Menu icon="more" title={`${p.name}: rename, notebook, delete`} align="right" items={planMenu(p, st, ops, nbs)}/></span></div>
          {!nb && <NbDot nb={nbs.get(p.nb)}/>}
          <div className="pl-ptp"><span className="pl-trk"><i style={{ width: `${sh.overall}%` }}/></span><b>{sh.overall}%</b></div>
          <div className="pl-ptm"><span>{plural(sh.all.length, "row")}</span><span>{sh.done} done</span>{late > 0 && <span className="late">{late} late</span>}</div>
          <div className="pl-ptd"><PI n="calendar" s={12}/>{sh.from ? `${dayShort(sh.from, today)} → ${sh.to ? dayShort(sh.to, today) : "…"}` : "No dates yet"}</div>
        </article>; })}
      <article className="px-card pl-ptile add"><NewPlanner st={st} nb={nb} ops={ops} onMade={p => setOpenPlan(p.id)} id="pl-plan-new-tile"/>
        <p className="pl-muted">One planner per project, study plan or fitness block — as many as you like in a notebook.</p></article>
    </section>);
}

// ── Notes: common notes and dated notes (tick which to show); cards or a list; New note, graph, select → merge / download / move / trash
export function NotesCard({ st, f, nbs, ops, hits, filtered, nb, today, page }) {
  const [sel, setSel] = useState(null); const [trash, setTrash] = useState(false);
  const [sort, setSortRaw] = useState(() => ls.get("hp_pl_sort", "updated")); const setSort = v => { setSortRaw(v); ls.set("hp_pl_sort", v); };
  const [lay, setLayRaw] = useState(() => ls.get("hp_pl_nlay", "grid")); const setLay = v => { setLayRaw(v); ls.set("hp_pl_nlay", v); };
  const [kind, setKindRaw] = useState(() => ls.get("hp_pl_nkind", { common: true, dated: true })); const setKind = v => { setKindRaw(v); ls.set("hp_pl_nkind", v); };
  const SORTS = { updated: ["Last edited", (a, b) => b.updated.localeCompare(a.updated)], created: ["Newest first", (a, b) => b.created.localeCompare(a.created)],
    day: ["By note date", (a, b) => (b.day || "").localeCompare(a.day || "") || b.updated.localeCompare(a.updated)], title: ["Title A–Z", (a, b) => (a.title || "").localeCompare(b.title || "")] };
  const base = trash ? f.trash : f.pages.filter(p => (p.day ? kind.dated : kind.common));
  const list = useMemo(() => { const s = base.slice().sort((SORTS[sort] || SORTS.updated)[1]); return trash ? s : [...s.filter(p => p.pinned), ...s.filter(p => !p.pinned)]; }, [base, sort, trash]);
  const pick = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = sel ? [...sel] : [];
  const move = to => Promise.all(ids.map(id => ops.page.patch(id, { notebook_id: to }))).then(() => { ops.say(`Moved ${plural(ids.length, "note")}`); setSel(null); });
  const toTrash = () => Promise.all(ids.map(id => ops.page.patch(id, { trashed: true }))).then(() => { ops.say(`${plural(ids.length, "note")} moved to the trash`); setSel(null); });
  const nCommon = f.pages.filter(p => !p.day).length, nDated = f.pages.length - nCommon;
  const open = p => !trash && (sel ? pick(p.id) : ops.open(p.id));
  return (
    <Widget id="pl-notes" cls="pl-notes" title={trash ? "Trash" : "Notes"} icon={trash ? "trash" : "note"} label="Notes" page={page}
      head={<>{trash ? <small className="pl-hm">removed for good after {st.limits.trash_days} days</small>
          : <span className="pl-kinds"><label className="pl-chk sm"><input type="checkbox" checked={kind.common} onChange={e => setKind({ ...kind, common: e.target.checked })} id="pl-n-common"/>Common ({nCommon})</label>
            <label className="pl-chk sm"><input type="checkbox" checked={kind.dated} onChange={e => setKind({ ...kind, dated: e.target.checked })} id="pl-n-dated"/>Dated ({nDated})</label></span>}
        <span className="pl-sp"/>
        {!trash && <label className="pl-sel"><span className="sr">Sort</span><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort" id="pl-sort">
          {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>}
        {!trash && <span className="pl-seg ic" role="group" aria-label="Layout">
          <button type="button" className={lay === "grid" ? "on" : ""} onClick={() => setLay("grid")} title="Cards" aria-label="Cards"><PI n="grid" s={15}/></button>
          <button type="button" className={lay === "list" ? "on" : ""} onClick={() => setLay("list")} title="List" aria-label="List" id="pl-n-list"><PI n="list" s={15}/></button></span>}
        {!trash && <button type="button" className="pl-ib" onClick={() => ops.openGraph()} id="pl-graph-open" title="Graph — how your notes link" aria-label="Graph"><PI n="graph" s={16}/></button>}
        {!trash && <button type="button" className={`pl-ib ${sel ? "on" : ""}`} onClick={() => setSel(sel ? null : new Set())} id="pl-select" title={sel ? "Done picking" : "Pick notes — merge, download, move"} aria-label="Pick notes"><PI n="tasks" s={16}/></button>}
        <button type="button" className={`pl-ib ${trash ? "on" : ""}`} onClick={() => { setTrash(v => !v); setSel(null); }} id="pl-trash-toggle" title={trash ? "Back to notes" : `Trash${f.trash.length ? ` (${f.trash.length})` : ""}`} aria-label={trash ? "Back to notes" : "Trash"}>
          <PI n={trash ? "back" : "trash"} s={16}/></button>
        {trash && f.trash.length > 0 && <button type="button" className="px-btn danger" onClick={() => ops.page.emptyTrash(f.trash.length)} id="pl-trash-empty">Empty</button>}
        {!trash && <Menu className="pl-new2" label="New" icon="plus" align="right" id="pl-note-newm" items={[
          { label: "A common note", icon: "newnote", id: "pl-note-new", run: () => ops.page.create({ nb }) },
          { label: "A note for today", icon: "calendar", id: "pl-note-today", run: () => ops.page.create({ nb, day: today }) }]}/>}</>}
      top={sel && <div className="pl-selbar" id="pl-selbar">
        <b>{ids.length} picked</b><button type="button" className="pl-link" onClick={() => setSel(new Set(list.map(p => p.id)))}>All {list.length}</button><span className="pl-sp"/>
        <button type="button" className="px-btn" disabled={ids.length < 2 || ids.length > st.limits.merge} onClick={() => ops.merge(ids)} id="pl-merge"><PI n="merge" s={15}/>Merge</button>
        <button type="button" className="px-btn" disabled={!ids.length} onClick={() => ops.exportOf("ids", ids)} id="pl-sel-export"><PI n="download" s={15}/>Download</button>
        {st.notebooks.length > 1 && <Menu label="Move to" icon="move" items={st.notebooks.map(n => ({ label: n.name, swatch: n.color, run: () => move(n.id), disabled: !ids.length }))} id="pl-move"/>}
        <button type="button" className="px-btn danger" disabled={!ids.length} onClick={toTrash} id="pl-sel-trash"><PI n="trash" s={15}/>Trash</button>
      </div>}>
      {!list.length && <p className="pl-muted pl-pad">{trash ? "The trash is empty." : !kind.common && !kind.dated ? "Tick Common or Dated to see notes." : filtered ? "No notes match the filters." : "Write anything — press New. A note with a date also shows on that day in the Calendar."}</p>}
      {list.length > 0 && lay === "list" && !trash
        ? <div className="pl-nlist" id="pl-cards">{list.map(p => <div key={p.id} className={`pl-nrow ${sel && sel.has(p.id) ? "sel" : ""}`} data-page={p.id} role="button" tabIndex={0}
            onClick={() => open(p)} onKeyDown={e => { if (e.key === "Enter") open(p); }}>
            {sel && <input type="checkbox" className="pl-cpick" checked={sel.has(p.id)} onChange={() => pick(p.id)} onClick={e => e.stopPropagation()} aria-label={`Pick ${p.title || "Untitled"}`}/>}
            <PI n="note" s={15}/>{p.pinned && <PI n="pin" s={13} className="pl-pin"/>}<b className="pl-rt">{p.title || "Untitled"}</b>
            <span className="pl-nsnip">{(hits && hits.get(p.id) && hits.get(p.id).snip) || p.snip}</span>
            {!nb && <NbDot nb={nbs.get(p.nb)}/>}{p.day && <em className="pl-dc">{dayShort(p.day, today)}</em>}<small>{ago(p.updated)}</small></div>)}</div>
        : list.length > 0 && <div className="pl-cards" id="pl-cards">
        {list.map(p => <article key={p.id} className={`pl-card ${sel && sel.has(p.id) ? "sel" : ""}`} data-page={p.id} data-c={(nbs.get(p.nb) || {}).color}
          onClick={() => open(p)} tabIndex={trash ? undefined : 0} onKeyDown={e => { if (e.key === "Enter") open(p); }}>
          {sel && <input type="checkbox" className="pl-cpick" checked={sel.has(p.id)} onChange={() => pick(p.id)} onClick={e => e.stopPropagation()} aria-label={`Pick ${p.title || "Untitled"}`}/>}
          {p.thumb && <div className="pl-thumb"><img src={`/app/api/planner/files/${p.thumb}`} alt="" loading="lazy"/></div>}
          <div className="pl-cb">
            {(!nb || p.pinned || p.day) && <div className="pl-cm">{!nb && <NbDot nb={nbs.get(p.nb)}/>}{p.day && <em className="pl-dc"><PI n="calendar" s={12}/>{dayShort(p.day, today)}</em>}
              {p.pinned && <PI n="pin" s={13} className="pl-pin" title="Pinned"/>}</div>}
            <h4>{p.title || "Untitled"}</h4>
            <p>{(hits && hits.get(p.id) && hits.get(p.id).snip) || p.snip || "Empty note"}</p>
            <div className="pl-cf">{p.tags.slice(0, 3).map(x => <em key={x} className="pl-ht">#{x}</em>)}<span className="pl-sp"/><small>{ago(p.updated)}</small></div>
            {trash && <div className="pl-cact"><button type="button" className="px-btn" onClick={() => ops.page.restore(p.id)} data-restore={p.id}><PI n="restore" s={14}/>Restore</button>
              <button type="button" className="px-btn danger" onClick={() => ops.page.remove(p.id)} data-delete={p.id}>Delete for good</button></div>}
          </div>
        </article>)}
      </div>}
    </Widget>);
}

// ── pop-ups: only for what needs a decision (delete, merge, download) — never for typing a task
export function ConfirmModal({ title, text, yes, danger, run, onClose }) {
  const [busy, setBusy] = useState(false);
  return <Modal title={title} onClose={onClose} id="pl-confirm"
    foot={<><span className="pl-sp"/><button type="button" className="px-btn" onClick={onClose}>Cancel</button>
      <button type="button" className={`px-btn ${danger ? "danger" : "primary"}`} disabled={busy} id="pl-confirm-yes" onClick={async () => { setBusy(true); await run(); setBusy(false); onClose(); }}>{yes}</button></>}>
    <p className="pl-muted">{text}</p></Modal>;
}

export function MergeModal({ ids, st, nbs, ops, onClose }) {
  const [order, setOrder] = useState(ids); const [title, setTitle] = useState(""); const [trash, setTrash] = useState(false);
  const [nb, setNb] = useState(() => (st.pages.find(p => p.id === ids[0]) || {}).nb || st.notebooks[0].id); const [busy, setBusy] = useState(false);
  const mv = (i, d) => setOrder(o => { const n = o.slice(); [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const go = async () => {
    setBusy(true);
    try { const r = await api("/app/api/planner/pages/merge", { method: "POST", json: { ids: order, title: clean(title).trim(), notebook_id: nb, trash_sources: trash } });
      await ops.reload(); ops.open(r.page.id); ops.say(`Merged ${plural(order.length, "note")} into one`); onClose(); }
    catch (e) { ops.fail(e); setBusy(false); }
  };
  return (
    <Modal title={`Merge ${plural(order.length, "note")}`} sub="One new note: each note becomes a section, in this order." onClose={onClose} id="pl-merge-modal"
      foot={<><span className="pl-sp"/><button type="button" className="px-btn" onClick={onClose}>Cancel</button><button type="button" className="px-btn primary" onClick={go} disabled={busy} id="pl-merge-go"><PI n="merge" s={15}/>Merge</button></>}>
      <ol className="pl-order">{order.map((id, i) => { const p = st.pages.find(x => x.id === id) || {};
        return <li key={id}><span className="pl-on">{i + 1}</span><span className="pl-rt">{p.title || "Untitled"}</span><NbDot nb={nbs.get(p.nb)} s/>
          <button type="button" className="pl-ib" disabled={i === 0} onClick={() => mv(i, -1)} aria-label="Move up"><PI n="up" s={14}/></button>
          <button type="button" className="pl-ib" disabled={i === order.length - 1} onClick={() => mv(i, 1)} aria-label="Move down"><PI n="down" s={14}/></button></li>; })}</ol>
      <div className="pl-form">
        <label className="pl-f"><span>Title of the new note</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Merged notes" maxLength={200} id="pl-merge-title"/></label>
        <label className="pl-f"><span>Notebook</span><select value={nb} onChange={e => setNb(Number(e.target.value))}>{st.notebooks.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
        <label className="pl-chk full"><input type="checkbox" checked={trash} onChange={e => setTrash(e.target.checked)} id="pl-merge-trash"/>Move the original notes to the trash (you can restore them for {st.limits.trash_days} days)</label>
      </div>
    </Modal>);
}

// download notes: this note · the picked notes · a notebook · what the filters show · everything → PDF, Word or Markdown; one file or a file per note
export function ExportModal({ scope: scope0, ids: ids0, st, f, nbs, nb, openId, filtered, onClose, say, fail, onDone }) {
  const live = st.pages.filter(p => !p.trashed);
  const scopes = [openId && ["page", "This note", [openId]], ids0 && ["ids", `The notes you picked (${ids0.length})`, ids0],
    nb && ["nb", `The notebook “${(nbs.get(nb) || {}).name}”`, live.filter(p => p.nb === nb).map(p => p.id)],
    filtered && ["shown", `What the filters show (${f.pages.length})`, f.pages.map(p => p.id)], ["all", `Every note (${live.length})`, live.map(p => p.id)]].filter(Boolean);
  const [scope, setScope] = useState((scopes.find(s => s[0] === scope0) || scopes[0])[0]);
  const [fmt, setFmt] = useState("pdf"); const [sep, setSep] = useState(false); const [pics, setPics] = useState(true);
  const [busy, setBusy] = useState(""); const ids = (scopes.find(s => s[0] === scope) || scopes[0])[2];
  const go = async () => {
    if (!ids.length) return;
    setBusy("Getting your notes…");
    try {
      const { exportNotes } = await import("./planner-export.js");
      const name = scope === "page" ? ((live.find(p => p.id === openId) || {}).title || "Note") : scope === "nb" ? (nbs.get(nb) || {}).name : scope === "all" ? "Hyperplane Planner" : "Planner notes";
      const n = await exportNotes({ ids, fmt, separate: sep && ids.length > 1, pictures: pics, title: name, nbs, onStep: setBusy });
      onDone(); say(`Downloaded ${plural(n, "note")}`); onClose();
    } catch (e) { fail(e); setBusy(""); }
  };
  return (
    <Modal title="Download notes" onClose={onClose} id="pl-export-modal" wide
      foot={<><span className="pl-muted pl-grow">{busy || (fmt === "pdf" ? "PDF uses standard fonts: English letters, numbers and common signs (₹ prints as Rs). For other scripts choose Word." : fmt === "md" ? "Markdown is plain text for other note apps; pictures stay links to your Planner." : "Word keeps headings, lists, tables and pictures — it opens in Word, Google Docs and LibreOffice.")}</span>
        <button type="button" className="px-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="px-btn primary" onClick={go} disabled={!!busy || !ids.length} id="pl-export-go"><PI n="download" s={15}/>Download</button></>}>
      <div className="pl-form">
        <div className="pl-f full"><span>What</span><div className="pl-radios">{scopes.map(([k, l]) => <label key={k} className={`pl-radio ${scope === k ? "on" : ""}`}><input type="radio" name="pl-scope" checked={scope === k} onChange={() => setScope(k)} data-scope={k}/>{l}</label>)}</div></div>
        <div className="pl-f full"><span>Format</span><div className="pl-seg">{[["pdf", "PDF"], ["docx", "Word (.docx)"], ["md", "Markdown"]].map(([k, l]) => <button key={k} type="button" className={fmt === k ? "on" : ""} onClick={() => setFmt(k)} data-fmt={k}>{l}</button>)}</div></div>
        {ids.length > 1 && <div className="pl-f full"><span>Files</span><div className="pl-seg">
          <button type="button" className={!sep ? "on" : ""} onClick={() => setSep(false)} id="pl-export-one">One file with every note</button>
          <button type="button" className={sep ? "on" : ""} onClick={() => setSep(true)} id="pl-export-sep">A file per note (.zip)</button></div></div>}
        {fmt !== "md" && <label className="pl-chk full"><input type="checkbox" checked={pics} onChange={e => setPics(e.target.checked)}/>Include pictures</label>}
      </div>
    </Modal>);
}
