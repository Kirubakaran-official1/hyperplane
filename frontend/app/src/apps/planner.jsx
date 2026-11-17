// Hyperplane Planner (round 22, owner 2026-11-14; reshaped in 22b the same day: "keep it clean … the main dashboard … just To-do, Notebook —
// write anything, Planner with start and end date and a proper status (easy like a table, indent / outdent, no pop-ups), Calendar is a
// view … notebooks not on the top — what if they grow … one Trading journal notebook to start … no journal for now").
// One screen: the band (search + New), a slim notebook list on the left (a dropdown on a phone), and the main area — the Dashboard (To-do and
// Planner side by side, Notes below) or the Calendar. A note (and the graph) opens in the main area with Back. Each customer's Planner is
// private (the server checks "planner:view" on every call; every row belongs to one customer). The editor, the graph and the downloads are
// their own chunks, fetched when first used.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandBand, MultiSelect, addCss, api, loadChunk, trackAction } from "../core.jsx";
import { CSS } from "./planner.css.js";
import { Menu, Modal, NB_CSS, PI, TEMPLATES, DateRange, clean, dayOfTs, inRange, tplDoc } from "./planner-lib.jsx";
import { ConfirmModal, ExportModal, MergeModal, NotebookRail, NotesCard, PlannerTiles, PlannerWidget, TABS, TodoBoard, TodoCard, closed } from "./planner-views.jsx";
import CalendarView from "./planner-calendar.jsx";

const Editor = lazy(() => loadChunk(() => import("./planner-editor.jsx")));
const Graph = lazy(() => loadChunk(() => import("./planner-graph.jsx")));

// how the screen was left (this browser only — never access: the server decides that on every call)
const UI_KEY = "hp_pl_ui";
const readUi = () => { try { return JSON.parse(localStorage.getItem(UI_KEY) || "{}") || {}; } catch { return {}; } };
const NARROW = "(max-width:900px)";
function useNarrow() {
  const [v, setV] = useState(() => typeof window !== "undefined" && window.matchMedia(NARROW).matches);
  useEffect(() => { const m = window.matchMedia(NARROW), h = () => setV(m.matches); m.addEventListener("change", h); return () => m.removeEventListener("change", h); }, []);
  return v;
}
const readOpen = () => { try { return Number(sessionStorage.getItem("hp_pl_page")) || null; } catch { return null; } };

export default function Planner({ onOut }) {
  addCss("planner", CSS + "\n" + NB_CSS);
  const [st, setSt] = useState(null); const [err, setErr] = useState("");
  const ui0 = useMemo(readUi, []);
  const [view, setViewRaw] = useState(ui0.view === "cal" ? "cal" : "dash");             // the Dashboard tab: the dashboard or the calendar
  const [tab, setTabRaw] = useState(TABS.some(x => x[0] === ui0.tab) ? ui0.tab : "dash");  // Dashboard · To-do · Planner · Notes (22f)
  const [openPlan, setOpenPlan] = useState(null);                                          // the planner open in the Planner tab
  const [nb, setNbRaw] = useState(ui0.nb || null); const [topics, setTopics] = useState([]); const [range, setRange] = useState(null);
  const [q, setQ] = useState(""); const [hits, setHits] = useState(null); const [qOpen, setQOpen] = useState(false);
  const [openId, setOpenId] = useState(readOpen); const [graph, setGraph] = useState(false); const [edKey, setEdKey] = useState(0); const [wide, setWide] = useState(false);
  const [focus, setFocus] = useState(null); const [nbOpen, setNbOpen] = useState(false);
  const [railMin, setRailMinRaw] = useState(!!ui0.railMin);                // the notebook list folded to a strip (like the side nav)
  const [modal, setModal] = useState(null);
  const [note, setNote] = useState(null);
  const root = useRef(null), qRef = useRef(null), nbBox = useRef(null);
  const narrow = useNarrow();                                         // a phone / small tablet: the notebook list becomes a dropdown

  const say = useCallback((t, bad) => setNote({ t, bad, n: Date.now() }), []);
  useEffect(() => { if (!note) return undefined; const k = setTimeout(() => setNote(null), note.bad ? 4200 : 2600); return () => clearTimeout(k); }, [note]);
  const fail = useCallback(e => { if (e && e.status === 401) onOut(e.message); else say((e && e.message) || "Something went wrong — please try again", true); }, [onOut, say]);
  const save = (k, v) => { try { localStorage.setItem(UI_KEY, JSON.stringify({ ...readUi(), [k]: v })); } catch { /* storage blocked */ } };
  const setView = v => { setViewRaw(v); save("view", v); setOpenId(null); setGraph(false); };
  const setTab = v => { setTabRaw(v); save("tab", v); setOpenId(null); setGraph(false); if (v !== "plan") setOpenPlan(null); };
  const setNb = v => { setNbRaw(v); save("nb", v); };
  const setRailMin = v => { setRailMinRaw(v); save("railMin", v); };

  const load = useCallback(() => api("/app/api/planner").then(s => { setSt(s); setErr(""); }).catch(e => { if (e.status === 401) onOut(e.message); else setErr(e.message); }), [onOut]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { if (openId) sessionStorage.setItem("hp_pl_page", String(openId)); else sessionStorage.removeItem("hp_pl_page"); } catch { /* ignore */ } }, [openId]);
  useEffect(() => { if (st && openId && !st.pages.some(p => p.id === openId)) setOpenId(null); }, [st, openId]);
  useEffect(() => { if (st && nb && !st.notebooks.some(n => n.id === nb)) setNb(null); }, [st, nb]);
  useEffect(() => {
    if (!nbOpen) return undefined;
    const h = e => { if (nbBox.current && !nbBox.current.contains(e.target)) setNbOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [nbOpen]);

  // the Inbox's "Open the Planner" → the dashboard
  useEffect(() => {
    const go = () => { setViewRaw("dash"); setOpenId(null); setGraph(false); };
    try { if (sessionStorage.getItem("hp_open_planner")) { sessionStorage.removeItem("hp_open_planner"); go(); } } catch { /* ignore */ }
    const on = e => { if (e.detail && e.detail.app === "planner") { try { sessionStorage.removeItem("hp_open_planner"); } catch { /* ignore */ } go(); } };
    window.addEventListener("hp-open", on); return () => window.removeEventListener("hp-open", on);
  }, []);
  // Ctrl / ⌘ + K: the search box (only while the Planner is on screen)
  useEffect(() => {
    const k = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && root.current && root.current.offsetParent !== null) { e.preventDefault(); qRef.current && qRef.current.focus(); setQOpen(true); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  // search: every word anywhere in a note (the server reads the words); to-dos and planned tasks are matched here
  useEffect(() => {
    const s = clean(q).trim();
    if (!s) { setHits(null); return undefined; }
    const k = setTimeout(() => api(`/app/api/planner/search?q=${encodeURIComponent(s.slice(0, 120))}`).then(r => setHits(new Map(r.hits.map(h => [h.id, h])))).catch(fail), 250);
    return () => clearTimeout(k);
  }, [q]);

  // ── what the server answered goes straight into the screen
  const upPage = m => setSt(s => ({ ...s, pages: s.pages.some(x => x.id === m.id) ? s.pages.map(x => x.id === m.id ? m : x) : [m, ...s.pages] }));
  const upTasks = list => setSt(s => { const m = new Map(list.map(t => [t.id, t])); return { ...s, tasks: [...s.tasks.map(t => m.get(t.id) || t), ...list.filter(t => !s.tasks.some(x => x.id === t.id))] }; });
  const today = st ? st.today : dayOfTs(new Date().toISOString());
  const nbs = useMemo(() => new Map((st ? st.notebooks : []).map(n => [n.id, n])), [st]);

  const ops = useMemo(() => ({
    say, fail, reload: load,
    open: id => { setOpenId(id); setGraph(false); setQOpen(false); },
    openGraph: () => { setOpenId(null); setGraph(true); },
    back: () => { setOpenId(null); setGraph(false); setWide(false); },
    focusTask: t => { setOpenId(null); setGraph(false); setQOpen(false); if (nb && t.nb !== nb) setNb(null);
      if (t.kind === "plan") { setTabRaw("plan"); save("tab", "plan"); setOpenPlan(t.plan); } else { setTabRaw("dash"); save("tab", "dash"); setViewRaw("dash"); save("view", "dash"); }
      setFocus({ id: t.id, kind: t.kind, n: Date.now() }); },
    page: {
      create: async ({ nb: n, title = "", doc = null, tpl, day = null, open = true }) => {
        const T = tpl && TEMPLATES.find(x => x.k === tpl);
        const body = { notebook_id: n || nb || st.notebooks[0].id, kind: "note", title: clean(title || (T ? T.t : "")).slice(0, 200), tags: [], ...(day ? { day } : {}),
          ...(doc || T ? { doc: JSON.stringify(doc || tplDoc(tpl)) } : {}) };
        try { const m = await api("/app/api/planner/pages", { method: "POST", json: body }); upPage(m); if (open) { setOpenId(m.id); setGraph(false); setEdKey(k => k + 1); } return m; }
        catch (e) { fail(e); return null; }
      },
      patch: async (id, ch) => { try { const m = await api(`/app/api/planner/pages/${id}`, { method: "PATCH", json: ch }); upPage(m); return m; } catch (e) { fail(e); return null; } },
      trash: async id => { const m = await ops.page.patch(id, { trashed: true }); if (m) { say("Moved to the trash"); if (openId === id) setOpenId(null); } },
      restore: async id => { const m = await ops.page.patch(id, { trashed: false }); if (m) say("Restored"); },
      remove: id => setModal({ k: "confirm", title: "Delete this note for good?", text: "It cannot be brought back.", yes: "Delete for good", danger: true,
        run: async () => { try { await api(`/app/api/planner/pages/${id}`, { method: "DELETE" }); setSt(s => ({ ...s, pages: s.pages.filter(p => p.id !== id), links: s.links.filter(l => l[0] !== id && l[1] !== id) })); say("Deleted"); } catch (e) { fail(e); } } }),
      emptyTrash: n => setModal({ k: "confirm", title: `Empty the trash (${n})?`, text: "Every note in the trash is removed for good.", yes: "Empty the trash", danger: true,
        run: async () => { try { const r = await api("/app/api/planner/trash/empty", { method: "POST" }); await load(); say(`Removed ${r.removed} note${r.removed === 1 ? "" : "s"}`); } catch (e) { fail(e); } } }),
      copy: async id => { try { const m = await api(`/app/api/planner/pages/${id}/copy`, { method: "POST" }); upPage(m); setOpenId(m.id); say("Made a copy"); } catch (e) { fail(e); } },
      meta: upPage,
      links: (pid, ids) => setSt(s => ({ ...s, links: [...s.links.filter(l => l[0] !== pid), ...ids.filter(i => i !== pid && s.pages.some(p => p.id === i)).map(i => [pid, i])] })),
      split: async (pid, body) => {
        try { const r = await api(`/app/api/planner/pages/${pid}/split`, { method: "POST", json: body }); await load(); setEdKey(k => k + 1);
          say(`Made ${r.pages.length} new note${r.pages.length === 1 ? "" : "s"}`); if (body.trash_source && r.pages[0]) setOpenId(r.pages[0].id); return r; }
        catch (e) { fail(e); return null; }
      },
    },
    task: {
      create: async t => {
        const body = { kind: t.kind || "todo", notebook_id: t.nb || nb || st.notebooks[0].id, title: clean(t.title).trim().slice(0, 300), due: t.due || null,
          ...(t.start ? { start: t.start } : {}), ...(t.parent ? { parent_id: t.parent } : {}), ...(t.after ? { after_id: t.after } : {}),
          ...(t.tf ? { time_from: t.tf, time_to: t.tt } : {}), ...(t.status ? { status: t.status } : {}), ...(t.progress != null ? { progress: t.progress } : {}),
          ...(t.plan ? { plan_id: t.plan } : {}) };
        if (!body.title) return null;
        try { const r = await api("/app/api/planner/tasks", { method: "POST", json: body }); upTasks([r]); return r; } catch (e) { fail(e); return null; }
      },
      patch: async (id, ch) => {
        try { const r = await api(`/app/api/planner/tasks/${id}`, { method: "PATCH", json: ch });
          if (ch.notebook_id || ch.plan_id) await load(); else upTasks([r.task, ...(r.next ? [r.next] : [])]);
          if (r.next) say(`Next one added for ${r.next.due}`); return r.task; }
        catch (e) { fail(e); return null; }
      },
      toggle: t => ops.task.patch(t.id, { status: t.status === "done" ? "todo" : "done" }),
      move: async (id, action) => { try { const r = await api(`/app/api/planner/tasks/${id}/move`, { method: "POST", json: { action } }); upTasks(r.tasks); } catch (e) { fail(e); } },
      remove: (t, under) => {
        const go = async () => { try { await api(`/app/api/planner/tasks/${t.id}`, { method: "DELETE" });
          setSt(s => { const gone = new Set([t.id]); let more = true; while (more) { more = false; s.tasks.forEach(x => { if (x.parent && gone.has(x.parent) && !gone.has(x.id)) { gone.add(x.id); more = true; } }); }
            return { ...s, tasks: s.tasks.filter(x => !gone.has(x.id)) }; }); } catch (e) { fail(e); } };
        if (under) setModal({ k: "confirm", title: `Delete “${t.title}”?`, text: `The ${under} row${under === 1 ? "" : "s"} under it go too.`, yes: "Delete", danger: true, run: go });
        else go();
      },
      // "Clear" takes closed to-dos off the dashboard only: they stay in the calendar and in the To-do tab (Show cleared)
      clearDone: async (n, status = "done") => { try { const r = await api("/app/api/planner/tasks/clear-done", { method: "POST", json: { notebook_id: nb || null, status } });
        await load(); say(`${r.cleared} ${status} to-do${r.cleared === 1 ? "" : "s"} off the dashboard — still in the calendar and the To-do tab`); } catch (e) { fail(e); } },
    },
    nb: {
      create: async b => { try { const n = await api("/app/api/planner/notebooks", { method: "POST", json: b }); setSt(s => ({ ...s, notebooks: [...s.notebooks, n] })); setNb(n.id); return n; } catch (e) { fail(e); return null; } },
      update: async (id, b) => { try { const n = await api(`/app/api/planner/notebooks/${id}`, { method: "PATCH", json: b }); setSt(s => ({ ...s, notebooks: s.notebooks.map(x => x.id === id ? n : x) })); return n; } catch (e) { fail(e); return null; } },
      remove: async (id, force) => {
        try { await api(`/app/api/planner/notebooks/${id}${force ? "?force=true" : ""}`, { method: "DELETE" }); if (nb === id) setNb(null); await load(); say("Notebook removed"); return true; }
        catch (e) { if (e.status === 409 && !force) return e.message; fail(e); return false; }
      },
    },
    plan: {
      create: async b => { try { const p = await api("/app/api/planner/plans", { method: "POST", json: { ...b, name: clean(b.name).trim() } }); setSt(s => ({ ...s, plans: [...s.plans, p] })); say(`Planner “${p.name}” made`); return p; } catch (e) { fail(e); return null; } },
      patch: async (id, b) => { try { const p = await api(`/app/api/planner/plans/${id}`, { method: "PATCH", json: b }); if (b.notebook_id) await load(); else setSt(s => ({ ...s, plans: s.plans.map(x => x.id === id ? p : x) })); return p; } catch (e) { fail(e); return null; } },
      rename: p => setModal({ k: "rename", plan: p }),
      remove: p => { const n = st.tasks.filter(t => t.plan === p.id).length;
        setModal({ k: "confirm", title: `Delete the planner “${p.name}”?`, text: n ? `Its ${n} row${n === 1 ? "" : "s"} go too. This cannot be undone.` : "It has no rows.", yes: "Delete the planner", danger: true,
          run: async () => { try { await api(`/app/api/planner/plans/${p.id}`, { method: "DELETE" }); if (openPlan === p.id) setOpenPlan(null); await load(); say("Planner deleted"); } catch (e) { fail(e); } } }); },
    },
    merge: ids => setModal({ k: "merge", ids }),
    exportOf: (scope, ids) => setModal({ k: "export", scope, ids }),
    setDigest: async on => { try { const r = await api("/app/api/planner/prefs", { method: "PATCH", json: { digest: on } }); setSt(s => ({ ...s, prefs: r })); say(on ? "Morning summary on" : "Morning summary off"); } catch (e) { fail(e); } },
  }), [st, nb, openId, openPlan, today, load, say, fail]);

  // ── the filters, once, for every part: the notebook on the left, topics (notes), a date range, the search
  const f = useMemo(() => {
    if (!st) return null;
    const words = clean(q).toLowerCase().trim().split(/\s+/).filter(Boolean);
    const nbOk = x => !nb || x.nb === nb;
    const pages = st.pages.filter(p => !p.trashed && nbOk(p) && (!topics.length || topics.some(t => p.tags.includes(t))) && inRange(dayOfTs(p.created), range)
      && (!words.length || (hits ? hits.has(p.id) : words.every(w => (p.title || "").toLowerCase().includes(w)))));
    const tasks = st.tasks.filter(t => nbOk(t) && (!range || (t.kind === "plan" ? (t.start || t.due) && (t.start || t.due) <= (range.to || "9999") && (t.due || t.start) >= (range.from || "0000") : inRange(t.due, range)))
      && (!words.length || words.every(w => t.title.toLowerCase().includes(w))));
    return { pages, tasks, trash: st.pages.filter(p => p.trashed && nbOk(p)), words };
  }, [st, nb, topics, range, q, hits]);
  const allTags = useMemo(() => st ? [...new Set(st.pages.filter(p => !p.trashed).flatMap(p => p.tags))].sort() : [], [st]);
  const counts = useMemo(() => { const m = new Map(); if (st) { st.pages.forEach(p => { if (!p.trashed) m.set(p.nb, (m.get(p.nb) || 0) + 1); });
    st.tasks.forEach(t => { if (!closed(t)) m.set(t.nb, (m.get(t.nb) || 0) + 1); }); } return m; }, [st]);
  const tabCounts = useMemo(() => st && f ? { todo: f.tasks.filter(t => t.kind === "todo" && !closed(t)).length, plan: st.plans.filter(p => !nb || p.nb === nb).length, notes: f.pages.length } : null, [st, f, nb]);
  const filtered = !!(topics.length || range || q.trim());
  const clearAll = () => { setTopics([]); setRange(null); setQ(""); };

  if (!st) return (
    <div className="pl px" id="planner" ref={root}>
      <BrandBand product="Planner" title="Hyperplane" accent="Planner" id="pl-band"/>
      <div className="pl-wait" id="pl-loading">{err ? <><PI n="alert"/> {err} <button type="button" className="px-btn" onClick={load}>Try again</button></> : "Opening your Planner…"}</div>
    </div>);

  const page = openId ? st.pages.find(p => p.id === openId) : null;
  const cur = nb ? nbs.get(nb) : null;
  const quick = q.trim() && f ? { pages: f.pages.slice().sort((a, b) => (hits && hits.get(b.id) && hits.get(b.id).in_title ? 1 : 0) - (hits && hits.get(a.id) && hits.get(a.id).in_title ? 1 : 0)).slice(0, 6),
    tasks: f.tasks.filter(t => t.status !== "done" && t.status !== "missed").slice(0, 5) } : null;
  const newItems = [
    { label: "New note", icon: "newnote", id: "pl-new-note", run: () => ops.page.create({}) },
    { label: "New to-do", icon: "tasks", id: "pl-new-todo", run: () => { setTab("dash"); setView("dash"); setTimeout(() => { const i = document.querySelector("#pl-todo-add input"); if (i) i.focus(); }, 80); } },
    { label: "New planner", icon: "project", id: "pl-new-plan", run: () => { setTab("plan"); setTimeout(() => { const b = document.getElementById("pl-plan-new-tile"); if (b) b.click(); }, 80); } },
    "-", { head: "A note from a template" },
    ...TEMPLATES.map(x => ({ label: x.t, icon: x.icon, id: `pl-tpl-${x.k}`, run: () => ops.page.create({ tpl: x.k }) })),
  ];
  const vp = { st, f, today, nbs, ops, hits, filtered, nb, openId, focus, openPlan, setOpenPlan };
  const rail = <NotebookRail st={st} nb={nb} setNb={setNb} ops={ops} counts={counts} onPicked={() => setNbOpen(false)} min={!narrow && railMin} onMin={narrow ? null : setRailMin}
    tab={tab} setTab={setTab} tabCounts={tabCounts} noTabs={narrow}/>;

  return (
    <div className="pl px" id="planner" ref={root}>
      <BrandBand product="Planner" title="Hyperplane" accent="Planner" id="pl-band"
        info="Your to-dos, notes, plans and calendar in one place. Everything is private to your account."
        right={<div className="pl-bandr">
          <div className="pl-search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => setQOpen(false), 120); }}>
            <PI n="search" s={15}/>
            <input ref={qRef} id="pl-q" value={q} placeholder="Search everything" aria-label="Search notes, to-dos and plans" maxLength={120} autoComplete="off"
              onChange={e => { setQ(e.target.value); setQOpen(true); }} onFocus={() => setQOpen(true)}
              onKeyDown={e => { if (e.key === "Enter" && quick && quick.pages[0]) { ops.open(quick.pages[0].id); e.currentTarget.blur(); } if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }}/>
            {q ? <button type="button" className="pl-x" aria-label="Clear the search" onClick={() => setQ("")}><PI n="x" s={13}/></button> : <kbd>Ctrl K</kbd>}
            {qOpen && quick && <div className="pl-qpop" id="pl-qpop">
              {quick.pages.length + quick.tasks.length === 0 && <div className="pl-muted pl-pad">Nothing found for “{q.trim()}”</div>}
              {quick.pages.map(p => <button key={p.id} type="button" data-hit={p.id} onMouseDown={e => e.preventDefault()} onClick={() => ops.open(p.id)}>
                <PI n="note" s={15}/><span><b>{p.title || "Untitled"}</b><small>{(hits && hits.get(p.id) && hits.get(p.id).snip) || p.snip || "Empty note"}</small></span></button>)}
              {quick.tasks.map(t => <button key={`t${t.id}`} type="button" data-hit-task={t.id} onMouseDown={e => e.preventDefault()} onClick={() => ops.focusTask(t)}>
                <PI n={t.kind === "plan" ? "project" : "tasks"} s={15}/><span><b>{t.title}</b><small>{t.kind === "plan" ? "Planner" : "To-do"}{t.due ? ` · ${t.due}` : ""}</small></span></button>)}
            </div>}
          </div>
          <Menu className="pl-new" label="New" icon="plus" items={newItems} align="right" id="pl-new"/>
        </div>}/>

      <div className={`pl-shell ${wide && (page || graph) ? "wide" : ""} ${railMin && !narrow ? "min" : ""}`}>
        {!narrow && <aside className="pl-side">{rail}</aside>}
        <div className="pl-body">
          {!page && !graph && <div className="hp-actbar pl-bar">
            {narrow && <div className="pl-nbpick" ref={nbBox}>
              <button type="button" className="pl-fbtn" onClick={() => setNbOpen(v => !v)} aria-expanded={nbOpen} id="pl-nb-pick" data-c={cur && cur.color}>
                {cur ? <i className="pl-dot"/> : <PI n="grid" s={14}/>}<span>{cur ? cur.name : "All notebooks"}</span><PI n="down" s={13}/></button>
              {nbOpen && <div className="pl-nbpop">{rail}</div>}
            </div>}
            {narrow && <div className="pl-tabs pl-tabsn" role="tablist" aria-label="Views">{TABS.map(([k, l, ic]) =>
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} id={`pl-tab-${k}`} aria-label={l} title={l}><PI n={ic} s={15}/></button>)}</div>}
            {tab === "dash" ? <div className="pl-tabs" role="tablist" aria-label="View">
              <button type="button" role="tab" aria-selected={view === "dash"} className={view === "dash" ? "on" : ""} onClick={() => setView("dash")} id="pl-v-dash"><PI n="grid" s={15}/><span>Dashboard</span></button>
              <button type="button" role="tab" aria-selected={view === "cal"} className={view === "cal" ? "on" : ""} onClick={() => setView("cal")} id="pl-v-cal"><PI n="calendar" s={15}/><span>Calendar</span></button>
            </div> : <h2 className="pl-tabh"><PI n={(TABS.find(x => x[0] === tab) || [])[2]} s={17}/>{(TABS.find(x => x[0] === tab) || [])[1]}{cur && <small>· {cur.name}</small>}</h2>}
            <div className="pl-filt">
              {(tab === "notes" || (tab === "dash" && view === "dash")) && allTags.length > 0 && <MultiSelect label="topics" options={allTags} value={topics} onChange={setTopics} width={140}/>}
              {!(tab === "dash" && view === "cal") && <DateRange value={range} onChange={setRange} today={today} id="pl-range"/>}
              {filtered && <button type="button" className="pl-link" onClick={clearAll} id="pl-clear">Clear filters</button>}
              <button type="button" className="px-btn" id="pl-export" onClick={() => ops.exportOf(filtered ? "shown" : nb ? "nb" : "all")}><PI n="download" s={15}/><span className="pl-hm">Download</span></button>
            </div>
          </div>}

          {page ? <Suspense fallback={<div className="pl-wait">Opening the note…</div>}>
              <section className="pl-edp" id="pl-editor-pane" aria-label="The open note">
                <Editor key={`${page.id}:${edKey}`} meta={page} st={st} today={today} nbs={nbs} ops={ops} wide={wide} setWide={setWide} allTags={allTags} onOut={onOut} reload={() => setEdKey(k => k + 1)}/>
              </section></Suspense>
            : graph ? <section className="pl-gpane" id="pl-graph-pane">
                <div className="pl-crumb"><button type="button" className="px-btn" onClick={ops.back} id="pl-graph-back"><PI n="back" s={15}/>Dashboard</button><b>Graph</b><small>how your notes link to each other</small></div>
                <Suspense fallback={<div className="pl-wait">Drawing your graph…</div>}><Graph {...vp}/></Suspense></section>
            : tab === "todo" ? <section className="px-card pl-wid page pl-todopage" id="pl-todo-page" aria-label="To-do"><TodoBoard {...vp}/></section>
            : tab === "plan" ? <PlannerTiles {...vp}/>
            : tab === "notes" ? <NotesCard {...vp} page/>
            : view === "cal" ? <CalendarView {...vp}/>
            : <div className="pl-dash" id="pl-dash">
                <TodoCard {...vp}/><PlannerWidget {...vp}/><NotesCard {...vp}/>
              </div>}
        </div>
      </div>

      {modal && modal.k === "merge" && <MergeModal ids={modal.ids} st={st} nbs={nbs} ops={ops} onClose={() => setModal(null)}/>}
      {modal && modal.k === "export" && <ExportModal scope={modal.scope} ids={modal.ids} st={st} f={f} nbs={nbs} nb={nb} openId={openId} filtered={filtered}
        onClose={() => setModal(null)} say={say} fail={fail} onDone={() => trackAction("planner", "export")}/>}
      {modal && modal.k === "confirm" && <ConfirmModal {...modal} onClose={() => setModal(null)}/>}
      {modal && modal.k === "rename" && <RenamePlan plan={modal.plan} ops={ops} onClose={() => setModal(null)}/>}
      {note && <div className={`pl-toast ${note.bad ? "bad" : ""}`} role="status" id="pl-toast"><PI n={note.bad ? "alert" : "tick"} s={15}/>{note.t}</div>}
    </div>);
}

function RenamePlan({ plan, ops, onClose }) {
  const [v, setV] = useState(plan.name);
  const go = async () => { const s = clean(v).trim(); if (!s || s === plan.name) { onClose(); return; } if (await ops.plan.patch(plan.id, { name: s })) onClose(); };
  return <Modal title="Rename the planner" onClose={onClose} id="pl-plan-rename"
    foot={<><span className="pl-sp"/><button type="button" className="px-btn" onClick={onClose}>Cancel</button><button type="button" className="px-btn primary" onClick={go} id="pl-plan-rename-go">Save</button></>}>
    <input className="pl-in" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") go(); }} maxLength={80} aria-label="Planner name" id="pl-plan-rename-in"/>
  </Modal>;
}
