// Hyperplane Planner — the Calendar (a view, not a feature): Month and Week (owner 2026-11-14: "a weekly calendar like Teams — I can select
// a range like 1 hr / 2 hr for a specific purpose, but time is optional … I need the current feature too … notes for a specific date: choose
// the date and its to-dos and notes appear"). Everything here follows the notebook picked on the left (or all of them).
//   Month: planned rows as bars from start to end, to-dos on their day, dated notes; pick a day for its list.
//   Week:  an hour grid (one day on a narrow screen). Drag over the hours to add a to-do with a time; drag a block to move it, its lower
//          edge to make it longer; click it to change it. To-dos without a time and dated notes sit in the all-day row.
// 22f (owner 2026-11-15): "the calendar shows only the to-dos and the notes — not the planner"; a repeating to-do shows its next days faintly
// (one row on the dashboard; the next one is made when this one is done or missed).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { NbDot, PI, WD, addDays, addMonths, clean, dayLong, dayShort, diffDays, dow, monthName, monthStart, weekStart } from "./planner-lib.jsx";
import { P_STATUS, TodoAdd, TodoRow, byDue, ls, plural, useOutside } from "./planner-views.jsx";

const HOUR = 48, SNAP = 15, FIRST = 7;                        // px per hour · minutes a drag snaps to · the hour the grid opens at
const toMin = s => s ? +s.slice(0, 2) * 60 + +s.slice(3, 5) : null;
const hm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const nowMin = () => { const s = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }); return +s.slice(0, 2) * 60 + +s.slice(3, 5); };
const span = t => [t.start || t.due, t.due || t.start];
const isoYMD = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function nextRep(d, rep, want) {
  if (rep === "daily") return addDays(d, 1);
  if (rep === "weekly") return addDays(d, 7);
  if (rep === "weekdays") { let x = addDays(d, 1); while (dow(x) === 0 || dow(x) === 6) x = addDays(x, 1); return x; }
  let y = +d.slice(0, 4), m = +d.slice(5, 7) + 1; if (m > 12) { m = 1; y += 1; }
  return isoYMD(y, m, Math.min(want, new Date(Date.UTC(y, m, 0)).getUTCDate()));
}
// the days a repeating to-do will come back on (shown faintly; they become real one at a time)
function ghostsOf(todos, from, to) {
  const out = [];
  todos.filter(t => t.repeat && t.due && t.status !== "done" && t.status !== "missed").forEach(t => {
    let d = t.due; const want = +t.due.slice(8, 10);
    for (let k = 0; k < 400; k++) { d = nextRep(d, t.repeat, want); if (d > to) break; if (d >= from) out.push({ ...t, id: `g${t.id}-${d}`, due: d, ghost: true, src: t.id }); }
  });
  return out;
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = iso => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;
const fine = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer:fine)").matches;
// planned rows in one week: a lane each, so bars never sit on top of each other
function lanesOf(plans, days) {
  const a = days[0], b = days[days.length - 1];
  const segs = plans.map(t => { const [s, e] = span(t); return s <= b && e >= a ? { t, s: Math.max(0, diffDays(s, a)), e: Math.min(days.length - 1, diffDays(e, a)), l: s < a, r: e > b } : null; })
    .filter(Boolean).sort((x, y) => x.s - y.s || (y.e - y.s) - (x.e - x.s));
  const lanes = []; segs.forEach(sg => { let k = lanes.findIndex(end => end < sg.s); if (k < 0) { k = lanes.length; lanes.push(-1); } lanes[k] = sg.e; sg.lane = k; });
  return { segs, n: lanes.length };
}

export default function CalendarView({ st, f, nbs, today, ops, nb }) {
  const [mode, setModeRaw] = useState(() => ls.get("hp_pl_calmode", "month")); const setMode = m => { setModeRaw(m); ls.set("hp_pl_calmode", m); };
  const [cur, setCur] = useState(today); const [sel, setSel] = useState(today);
  const box = useRef(null); const [w, setW] = useState(1200);
  useEffect(() => { const el = box.current; if (!el) return undefined; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  const one = w < 640;                                           // a phone: the week view shows one day at a time
  const real = f.tasks.filter(t => t.kind === "todo" && t.due), plans = [];       // the calendar shows to-dos and notes only (22f)
  const notes = f.pages.filter(p => p.day);
  const days = mode === "week" ? (one ? [cur] : Array.from({ length: 7 }, (_, i) => addDays(weekStart(cur), i))) : null;
  const step = n => setCur(c => mode === "month" ? addMonths(monthStart(c), n) : addDays(c, n * (one ? 1 : 7)));
  const title = mode === "month" ? monthName(monthStart(cur)) : one ? dayLong(cur)
    : `${dm(days[0])} – ${dm(days[6])} ${days[6].slice(0, 4)}`;
  const pick = d => { setSel(d); if (mode === "week" && one) setCur(d); };
  const g0 = mode === "month" ? addDays(monthStart(cur), -((dow(monthStart(cur)) + 6) % 7)) : days[0], g1 = mode === "month" ? addDays(g0, 41) : days[days.length - 1];
  const todos = [...real, ...ghostsOf(real, g0, g1)];
  const vp = { st, nbs, today, ops, nb, todos, plans, notes, sel, pick };
  return (
    <div className="pl-cal" id="pl-cal" ref={box} data-mode={mode}>
      <div className="px-card pl-calg">
        <div className="pl-calh">
          <button type="button" className="pl-ib" onClick={() => step(-1)} aria-label="Earlier" id="pl-cal-prev"><PI n="left"/></button>
          <h3 id="pl-cal-month">{title}</h3>
          <button type="button" className="pl-ib" onClick={() => step(1)} aria-label="Later" id="pl-cal-next"><PI n="right"/></button>
          <button type="button" className="px-btn" onClick={() => { setCur(today); setSel(today); }} id="pl-cal-today">Today</button>
          <span className="pl-sp"/>
          <span className="pl-legend"><i className="dot"/>To-do<i className="dot ghost"/>Repeats<i className="nt"/>Note</span>
          <span className="pl-seg" role="group" aria-label="Calendar view">
            <button type="button" className={mode === "month" ? "on" : ""} onClick={() => setMode("month")} id="pl-cal-month-v">Month</button>
            <button type="button" className={mode === "week" ? "on" : ""} onClick={() => { setMode("week"); setCur(sel); }} id="pl-cal-week-v">{one ? "Day" : "Week"}</button></span>
        </div>
        {mode === "month" ? <MonthGrid {...vp} cur={monthStart(cur)}/> : <WeekGrid {...vp} days={days}/>}
      </div>
      <DayPanel {...vp}/>
    </div>);
}

function MonthGrid({ nbs, today, ops, todos, plans, notes, sel, pick, cur, st }) {
  const first = addDays(cur, -((dow(cur) + 6) % 7));
  const nWeeks = addDays(first, 35) > addDays(addMonths(cur, 1), -1) ? 5 : 6;
  const LANES = 3, drag = fine();
  const drop = (e, days) => { e.preventDefault(); const id = Number(e.dataTransfer.getData("text/pl-task")); const t = st.tasks.find(x => x.id === id); if (!t) return;
    const r = e.currentTarget.getBoundingClientRect(), d = days[Math.max(0, Math.min(6, Math.floor((e.clientX - r.left) / (r.width / 7))))]; if (t.due !== d) ops.task.patch(id, { due: d }); };
  return <>
    <div className="pl-calw" aria-hidden="true">{[1, 2, 3, 4, 5, 6, 0].map(i => <span key={i}>{WD[i]}</span>)}</div>
    {Array.from({ length: nWeeks }, (_, w) => {
      const days = Array.from({ length: 7 }, (_, i) => addDays(first, w * 7 + i)), { segs, n } = lanesOf(plans, days), lanes = Math.min(LANES, n);
      return (
        <div key={w} className="pl-wk" style={{ gridTemplateRows: `28px ${lanes ? `repeat(${lanes}, 22px) ` : ""}minmax(30px, auto)` }} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, days)}>
          {days.map((d, i) => { const ts = todos.filter(t => t.due === d), ns = notes.filter(p => p.day === d), bars = segs.filter(s => s.s <= i && s.e >= i);
            const dots = [...bars.map(s => ["bar", s.t.nb]), ...ts.map(t => ["dot", t.nb]), ...ns.map(p => ["nt", p.nb])].slice(0, 5);
            return <button key={d} type="button" className={`pl-wbg ${d.slice(0, 7) !== cur.slice(0, 7) ? "out" : ""} ${d === today ? "today" : ""} ${d === sel ? "sel" : ""}`}
              style={{ gridColumn: i + 1 }} onClick={() => pick(d)} data-day={d} aria-pressed={d === sel}
              aria-label={`${dayLong(d)}${ts.length + bars.length + ns.length ? ` · ${ts.length + bars.length + ns.length} items` : ""}`}>
              <span className="pl-cd">{+d.slice(8, 10)}</span>
              {dots.length > 0 && <span className="pl-cdots">{dots.map(([k, n_], j) => <i key={j} className={k} data-c={(nbs.get(n_) || {}).color}/>)}</span>}
            </button>; })}
          {segs.filter(s => s.lane < LANES).map(s => <button key={s.t.id} type="button" className={`pl-bar3 ${s.l ? "l" : ""} ${s.r ? "r" : ""} s-${s.t.status}`} data-c={(nbs.get(s.t.nb) || {}).color}
            style={{ gridColumn: `${s.s + 1} / ${s.e + 2}`, gridRow: s.lane + 2 }} onClick={() => ops.focusTask(s.t)} data-plan={s.t.id}
            title={`${s.t.title} · ${s.t.start ? dayShort(s.t.start, today) : ""}${s.t.start && s.t.due ? " → " : ""}${s.t.due ? dayShort(s.t.due, today) : ""}`}>{s.t.title}</button>)}
          {days.map((d, i) => { const ts = todos.filter(t => t.due === d).sort(byDue), ns = notes.filter(p => p.day === d), hidden = segs.filter(s => s.lane >= LANES && s.s <= i && s.e >= i).length;
            const items = [...ts.map(t => ["t", t]), ...ns.map(p => ["n", p])];
            return items.length || hidden ? <div key={`t${d}`} className="pl-wtd" style={{ gridColumn: i + 1, gridRow: lanes + 2 }}>
              {items.slice(0, 3).map(([k, x]) => k === "t"
                ? <span key={`t${x.id}`} className={`pl-cit ${x.ghost ? "ghost" : ""} ${x.status === "done" ? "done" : ""} ${x.status === "missed" ? "missed" : ""} ${x.status !== "done" && x.status !== "missed" && d < today ? "late" : ""}`} data-c={(nbs.get(x.nb) || {}).color}
                    draggable={(drag && !x.ghost) || undefined} onDragStart={e => e.dataTransfer.setData("text/pl-task", String(x.id))} onClick={() => pick(d)} title={x.ghost ? `${x.title} — repeats` : x.title} data-todo={x.id}>
                    <i/>{x.tf && <b>{x.tf}</b>}{x.title}</span>
                : <span key={`n${x.id}`} className="pl-cit nt" data-c={(nbs.get(x.nb) || {}).color} onClick={() => ops.open(x.id)} title={x.title || "Untitled"} data-note={x.id}>
                    <PI n="note" s={11}/>{x.title || "Untitled"}</span>)}
              {items.length + hidden > 3 && <small className="pl-cmore" onClick={() => pick(d)}>+{items.length + hidden - Math.min(3, items.length)} more</small>}</div> : null; })}
        </div>);
    })}
  </>;
}

// ── Week: the hour grid
function layDay(evts) {                                        // side by side where they overlap
  const out = [], s = evts.slice().sort((a, b) => a.from - b.from || b.to - a.to);
  let group = [], end = -1;
  const flush = () => { const cols = []; group.forEach(e => { let k = cols.findIndex(c => c <= e.from); if (k < 0) { k = cols.length; cols.push(0); } cols[k] = e.to; e.col = k; });
    group.forEach(e => { e.cols = cols.length; out.push(e); }); group = []; };
  s.forEach(e => { if (e.from >= end && group.length) flush(); group.push(e); end = Math.max(end, e.to); });
  if (group.length) flush();
  return out;
}

function WeekGrid({ st, nbs, today, ops, nb, todos, plans, notes, sel, pick, days }) {
  const n = days.length, scroller = useRef(null), grid = useRef(null);
  const [drag, setDrag] = useState(null);                      // { kind: new | move | resize, … } while the pointer is down
  const [box, setBox] = useState(null);                        // a new block waiting for its title: { day, from, to }
  const [edit, setEdit] = useState(null);                      // the block being changed
  const [, tick] = useState(0);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = FIRST * HOUR - 8; }, []);
  useEffect(() => { const k = setInterval(() => tick(x => x + 1), 60000); return () => clearInterval(k); }, []);
  const timed = todos.filter(t => t.tf && days.includes(t.due)), untimed = todos.filter(t => !t.tf && days.includes(t.due));
  const { segs, n: nl } = lanesOf(plans, days);
  const at = e => { const r = grid.current.getBoundingClientRect(), cw = (r.width - 52) / n;
    return { col: Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - 52) / cw))), m: Math.max(0, Math.min(1440, Math.round((e.clientY - r.top) / HOUR * 60 / SNAP) * SNAP)) }; };
  const down = e => {
    if (e.button !== 0 || e.target.closest(".pl-evnew,.pl-evedit")) return;
    const ev = e.target.closest("[data-ev]"), p = at(e);
    if (ev) {
      const t = st.tasks.find(x => x.id === Number(ev.getAttribute("data-ev"))); if (!t) return;
      e.preventDefault(); try { grid.current.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
      setDrag({ kind: e.target.closest(".pl-evh") ? "resize" : "move", t, col0: p.col, m0: p.m, day: t.due, from: toMin(t.tf), to: toMin(t.tt), moved: false });
      return;
    }
    if (!e.target.closest(".pl-wcol")) return;
    setEdit(null); setBox(null);
    if (e.pointerType !== "mouse") { setDrag({ kind: "tap", col: p.col, a: Math.floor(p.m / 30) * 30 }); return; }
    e.preventDefault(); try { grid.current.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    const a0 = Math.floor(p.m / 30) * 30;                      // a click = one hour from the half hour under the pointer; a drag = what it covers
    setDrag({ kind: "new", col: p.col, a0, m0: p.m, a: a0, b: a0 + 60, moved: false });
  };
  const move = e => {
    if (!drag || drag.kind === "tap") return;
    const p = at(e);
    if (drag.kind === "new") {
      if (!drag.moved && Math.abs(p.m - drag.m0) < SNAP) return;
      const a = p.m >= drag.a0 ? drag.a0 : Math.floor(p.m / SNAP) * SNAP, b = p.m >= drag.a0 ? Math.max(drag.a0 + SNAP, Math.ceil(p.m / SNAP) * SNAP) : drag.a0 + 30;
      setDrag({ ...drag, a, b, moved: true }); return; }
    const t = drag.t, dur = toMin(t.tt) - toMin(t.tf), dm = p.m - drag.m0;
    if (drag.kind === "move") { const from = Math.max(0, Math.min(1440 - dur, toMin(t.tf) + dm)), day = days[Math.max(0, Math.min(n - 1, days.indexOf(t.due) + p.col - drag.col0))] || t.due;
      setDrag({ ...drag, from, to: from + dur, day, moved: drag.moved || Math.abs(dm) >= SNAP || p.col !== drag.col0 }); }
    else setDrag({ ...drag, to: Math.max(toMin(t.tf) + SNAP, Math.min(1440, p.m)), moved: true });
  };
  const up = () => {
    const d = drag; setDrag(null); if (!d) return;
    if (d.kind === "tap") { setBox({ day: days[d.col], from: d.a, to: Math.min(1440, d.a + 60) }); return; }
    if (d.kind === "new") { setBox({ day: days[d.col], from: d.a, to: Math.min(1440, d.b) }); return; }
    if (!d.moved) { setEdit(d.t.id); return; }
    ops.task.patch(d.t.id, { due: d.day, time_from: hm(d.from), time_to: hm(Math.min(d.to, 1439)) });
  };
  const shown = days.map(d => {
    const list = timed.filter(t => (drag && drag.t && drag.t.id === t.id && drag.kind !== "tap" ? drag.day : t.due) === d)
      .map(t => { const live = drag && drag.t && drag.t.id === t.id; return { t, from: live ? drag.from : toMin(t.tf), to: live ? drag.to : toMin(t.tt) }; });
    return layDay(list);
  });
  const nowCol = days.indexOf(today), nowTop = nowMin() * HOUR / 60;
  const lanes = Math.min(4, nl);
  return (
    <div className="pl-wv" style={{ "--n": n }}>
      <div className="pl-wvh" style={{ gridTemplateColumns: `52px repeat(${n}, minmax(0,1fr))` }}>
        <span/>
        {days.map(d => <button key={d} type="button" className={`pl-wvd ${d === today ? "today" : ""} ${d === sel ? "sel" : ""}`} onClick={() => pick(d)} data-day={d}>
          <small>{WD[dow(d)]}</small><b>{+d.slice(8, 10)}</b></button>)}
      </div>
      <div className="pl-wvall" style={{ gridTemplateColumns: `52px repeat(${n}, minmax(0,1fr))`, gridTemplateRows: `${lanes ? `repeat(${lanes}, 22px) ` : ""}auto` }}>
        <span className="pl-wvlab" style={{ gridRow: `1 / -1` }}>All day</span>
        {segs.filter(s => s.lane < 4).map(s => <button key={s.t.id} type="button" className={`pl-bar3 ${s.l ? "l" : ""} ${s.r ? "r" : ""} s-${s.t.status}`} data-c={(nbs.get(s.t.nb) || {}).color}
          style={{ gridColumn: `${s.s + 2} / ${s.e + 3}`, gridRow: s.lane + 1 }} onClick={() => ops.focusTask(s.t)} data-plan={s.t.id} title={s.t.title}>{s.t.title}</button>)}
        {days.map((d, i) => { const ts = untimed.filter(t => t.due === d), ns = notes.filter(p => p.day === d);
          return <div key={d} className="pl-wtd" style={{ gridColumn: i + 2, gridRow: lanes + 1 }}>
            {ts.map(t => <span key={t.id} className={`pl-cit ${t.ghost ? "ghost" : ""} ${t.status === "done" ? "done" : ""} ${t.status === "missed" ? "missed" : ""}`} data-c={(nbs.get(t.nb) || {}).color} onClick={() => pick(d)} title={t.title} data-todo={t.id}><i/>{t.title}</span>)}
            {ns.map(p => <span key={p.id} className="pl-cit nt" data-c={(nbs.get(p.nb) || {}).color} onClick={() => ops.open(p.id)} title={p.title || "Untitled"} data-note={p.id}><PI n="note" s={11}/>{p.title || "Untitled"}</span>)}
          </div>; })}
      </div>
      <div className="pl-wvs" ref={scroller}>
        <div className="pl-wgrid" ref={grid} style={{ height: 24 * HOUR, gridTemplateColumns: `52px repeat(${n}, minmax(0,1fr))`, "--h": `${HOUR}px` }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)} id="pl-wgrid">
          <div className="pl-wgut">{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * HOUR }}>{h ? hm(h * 60) : ""}</span>)}</div>
          {days.map((d, i) => (
            <div key={d} className={`pl-wcol ${d === today ? "today" : ""}`} data-col={i} data-day={d}>
              {shown[i].map(({ t, from, to, col, cols }) => <div key={t.id} className={`pl-ev ${t.ghost ? "ghost2" : ""} ${t.status === "done" ? "done" : ""} ${t.status === "missed" ? "missed" : ""} ${drag && drag.t && drag.t.id === t.id ? "drag" : ""}`}
                data-ev={t.id} data-c={(nbs.get(t.nb) || {}).color} title={`${t.title} · ${hm(from)}–${hm(to)}`}
                style={{ top: from * HOUR / 60, height: Math.max(18, (to - from) * HOUR / 60 - 2), left: `calc(${col / cols * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}>
                <b>{t.title}</b><small>{hm(from)}–{hm(to)}</small><span className="pl-evh" aria-hidden="true"/></div>)}
              {drag && drag.kind === "new" && drag.col === i && <div className="pl-ev ghost" style={{ top: drag.a * HOUR / 60, height: (drag.b - drag.a) * HOUR / 60 - 2 }}><small>{hm(drag.a)}–{hm(drag.b)}</small></div>}
              {box && box.day === d && <NewBlock box={box} setBox={setBox} ops={ops} nb={nb} st={st}/>}
              {edit && shown[i].some(x => x.t.id === edit) && <EditBlock t={st.tasks.find(x => x.id === edit)} i={i} n={n} ops={ops} onClose={() => setEdit(null)}/>}
              {i === nowCol && <div className="pl-now" style={{ top: nowTop }} aria-hidden="true"/>}
            </div>))}
        </div>
      </div>
      <p className="pl-muted pl-whint">{fine() ? "Drag over the hours to add a to-do with a time · drag a block to move it, its lower edge to change the length · click it to change it." : "Tap an hour to add a to-do with a time · tap a block to change it."}</p>
    </div>);
}

// a new block: type what it is for, Enter
function NewBlock({ box, setBox, ops, nb, st }) {
  const [v, setV] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => { const s = clean(v).trim(); if (!s) { setBox(null); return; } if (busy) return; setBusy(true);
    await ops.task.create({ kind: "todo", title: s, due: box.day, tf: hm(box.from), tt: hm(Math.min(box.to, 1439)), nb: nb || st.notebooks[0].id }); setBusy(false); setBox(null); };
  return (
    <div className="pl-ev pl-evnew" style={{ top: box.from * HOUR / 60, minHeight: Math.max(44, (box.to - box.from) * HOUR / 60 - 2) }}>
      <input autoFocus value={v} onChange={e => setV(e.target.value)} placeholder="What is it for? Enter" maxLength={300} aria-label="New to-do" id="pl-evnew"
        onKeyDown={e => { if (e.key === "Enter") go(); if (e.key === "Escape") setBox(null); }} onBlur={go}/>
      <small>{hm(box.from)}–{hm(box.to)}</small>
    </div>);
}

// change a block in place: title, day, time, done, delete
function EditBlock({ t, i, n, ops, onClose }) {
  const ref = useRef(null); useOutside(true, ref, onClose);
  const [v, setV] = useState(t.title); const [a, setA] = useState(t.tf); const [b, setB] = useState(t.tt);
  const saveT = () => { const s = clean(v).trim(); if (s && s !== t.title) ops.task.patch(t.id, { title: s }); };
  const saveTime = (x, y) => { if (x && y && y > x) ops.task.patch(t.id, { time_from: x, time_to: y }); else ops.say("The end time is before the start time", true); };
  return (
    <div className={`pl-evedit ${n <= 2 ? "in" : i >= n - 2 ? "l" : ""}`} ref={ref} style={{ top: toMin(t.tf) * HOUR / 60 }} role="dialog" aria-label="Change this to-do" id="pl-evedit">
      <input value={v} onChange={e => setV(e.target.value)} onBlur={saveT} onKeyDown={e => { if (e.key === "Enter") { saveT(); onClose(); } }} maxLength={300} aria-label="To-do" className="pl-evt"/>
      <div className="pl-evr"><input type="date" value={t.due} onChange={e => e.target.value && ops.task.patch(t.id, { due: e.target.value })} aria-label="Day"/></div>
      <div className="pl-evr"><input type="time" value={a} step={900} onChange={e => setA(e.target.value)} onBlur={() => saveTime(a, b)} aria-label="From"/><span>–</span>
        <input type="time" value={b} step={900} onChange={e => setB(e.target.value)} onBlur={() => saveTime(a, b)} aria-label="To"/></div>
      <div className="pl-evr">
        <button type="button" className={`px-btn ${t.status === "done" ? "on" : ""}`} onClick={() => ops.task.toggle(t)}><PI n="tick" s={14}/>{t.status === "done" ? "Done" : "Mark done"}</button>
        <button type="button" className="px-btn" onClick={() => { ops.task.patch(t.id, { time_from: null, time_to: null }); onClose(); }} title="Keep the day, drop the time">No time</button>
        <button type="button" className="pl-ib" onClick={() => { ops.task.remove(t, 0); onClose(); }} aria-label="Delete" title="Delete"><PI n="trash" s={15}/></button>
      </div>
    </div>);
}

// the picked day: its to-dos (by time), what is planned over it and its notes — and a note for this day
function DayPanel({ st, nbs, today, ops, nb, todos, plans, notes, sel }) {
  const dayTodos = todos.filter(t => t.due === sel && !t.ghost).sort(byDue), dayGhosts = todos.filter(t => t.due === sel && t.ghost), dayPlans = plans.filter(t => { const [s, e] = span(t); return s <= sel && e >= sel; });
  const dayNotes = notes.filter(p => p.day === sel), showNb = !nb && st.notebooks.length > 1;
  return (
    <div className="px-card pl-calday" id="pl-calday">
      <div className="pl-ch"><h3>{dayLong(sel)}</h3>{sel !== today && <small>{diffDays(sel, today) > 0 ? `in ${plural(diffDays(sel, today), "day")}` : `${plural(-diffDays(sel, today), "day")} ago`}</small>}</div>
      <TodoAdd ops={ops} st={st} nb={nb} due={sel} today={today} id="pl-cal-add" placeholder="Add a to-do"/>
      {dayTodos.length > 0 && <div className="pl-gl">To-do<small>{dayTodos.length}</small></div>}
      {dayTodos.map(t => <TodoRow key={t.id} t={t} nbs={nbs} st={st} today={today} ops={ops} showNb={showNb} drag={fine()}/>)}
      {dayGhosts.map(t => <div key={t.id} className="pl-ghostrow" data-ghost={t.src}><PI n="repeat" s={13}/><span className="pl-rt">{t.title}</span><small>repeats — comes when the one before is done</small></div>)}
      {dayPlans.length > 0 && <div className="pl-gl">Planned<small>{dayPlans.length}</small></div>}
      {dayPlans.map(t => <button key={t.id} type="button" className="pl-prow2" onClick={() => ops.focusTask(t)} data-plan={t.id}>
        <i data-c={(nbs.get(t.nb) || {}).color} title={(nbs.get(t.nb) || {}).name}/><span className="pl-rt">{t.title}</span>
        <em className={`pl-stp s-${t.status}`}>{(P_STATUS.find(x => x[0] === t.status) || [])[1]}</em>
        <small>{t.start ? dayShort(t.start, today) : "…"} → {t.due ? dayShort(t.due, today) : "…"} · {t.progress || (t.status === "done" ? 100 : 0)}%</small></button>)}
      <div className="pl-gl">Notes<small>{dayNotes.length}</small></div>
      {dayNotes.map(p => <button key={p.id} type="button" className="pl-row" onClick={() => ops.open(p.id)} data-page={p.id}>
        <PI n="note" s={15}/><span className="pl-rt">{p.title || "Untitled"}</span>{showNb && <NbDot nb={nbs.get(p.nb)}/>}</button>)}
      <button type="button" className="pl-addc" onClick={() => ops.page.create({ nb, day: sel })} id="pl-cal-note"><PI n="plus" s={14}/>A note for this day</button>
    </div>);
}
