// Hyperplane Planner — the knowledge graph (its own chunk). Every note is a dot in its notebook's colour; a line joins two notes when one
// links to the other ([[ … ]]); with "Topics" on, each topic is a ring joined to its notes. Hover shows a note's neighbours, a click opens
// it; drag a dot, drag the background to move, wheel / pinch to zoom. "Most connected" beside it is the same graph as a list.
// A small force layout of its own (no chart library): springs on the lines, a push between nearby dots (a grid keeps it fast for
// thousands of notes), a soft pull to the middle. With reduced motion the layout is worked out first and drawn once, without animation.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { NbDot, PI, nbHex } from "./planner-lib.jsx";

const hash = n => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const cut = (s, n) => s.length > n ? `${s.slice(0, n - 1)}…` : s;

export default function PlannerGraph({ st, f, nbs, ops, openId }) {
  const [topicsOn, setTopicsOn] = useState(false); const [linkedOnly, setLinkedOnly] = useState(false);
  const [tip, setTip] = useState(null);
  const wrap = useRef(null), cv = useRef(null), G = useRef(null);

  // the nodes and lines from what the filters show
  const data = useMemo(() => {
    const ids = new Set(f.pages.map(p => p.id));
    const edges = st.links.filter(([a, b]) => a !== b && ids.has(a) && ids.has(b)).map(([a, b]) => [`p${a}`, `p${b}`]);
    const deg = new Map(); edges.forEach(([a, b]) => { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); });
    let nodes = f.pages.map(p => ({ k: `p${p.id}`, id: p.id, t: p.title || "Untitled", c: (nbs.get(p.nb) || {}).color || "blue", nb: p.nb, topic: false }));
    if (topicsOn) {
      const tags = new Map();
      f.pages.forEach(p => p.tags.forEach(t => { if (!tags.has(t)) tags.set(t, []); tags.get(t).push(p.id); }));
      tags.forEach((list, t) => { if (list.length < 2 && !linkedOnly) return; nodes.push({ k: `t:${t}`, t: `#${t}`, topic: true });
        list.forEach(id => { edges.push([`p${id}`, `t:${t}`]); deg.set(`p${id}`, (deg.get(`p${id}`) || 0) + 1); deg.set(`t:${t}`, (deg.get(`t:${t}`) || 0) + 1); }); });
    }
    if (linkedOnly) nodes = nodes.filter(n => deg.get(n.k));
    const keep = new Set(nodes.map(n => n.k));
    const E = edges.filter(([a, b]) => keep.has(a) && keep.has(b));
    const nb = new Map(nodes.map(n => [n.k, new Set()])); E.forEach(([a, b]) => { nb.get(a).add(b); nb.get(b).add(a); });
    nodes.forEach(n => { n.d = nb.get(n.k).size; n.r = n.topic ? 5 + Math.min(6, Math.sqrt(n.d) * 1.4) : 4.5 + Math.min(9, Math.sqrt(n.d) * 2); });
    return { nodes, edges: E, nbr: nb };
  }, [f.pages, st.links, nbs, topicsOn, linkedOnly]);

  const top = useMemo(() => data.nodes.filter(n => !n.topic && n.d > 0).sort((a, b) => b.d - a.d).slice(0, 10), [data]);
  const used = useMemo(() => [...new Set(data.nodes.filter(n => !n.topic).map(n => n.nb))].map(id => nbs.get(id)).filter(Boolean), [data, nbs]);

  useEffect(() => {
    const canvas = cv.current, box = wrap.current; if (!canvas || !box) return undefined;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const old = G.current ? new Map(G.current.nodes.map(n => [n.k, n])) : new Map();
    const N = data.nodes.map((n, i) => { const o = old.get(n.k); const a = hash(i + 1 + (n.id || 0) * 7) * Math.PI * 2, rr = 40 + Math.sqrt(i) * 18 * hash(i + 99);
      return { ...n, x: o ? o.x : Math.cos(a) * rr, y: o ? o.y : Math.sin(a) * rr, vx: 0, vy: 0, fx: null, fy: null }; });
    const idx = new Map(N.map((n, i) => [n.k, i]));
    const L = data.edges.map(([a, b]) => [idx.get(a), idx.get(b)]);
    const g = G.current = { nodes: N, links: L, alpha: old.size ? 0.5 : 1, k: G.current ? G.current.k : 1, tx: G.current ? G.current.tx : 0, ty: G.current ? G.current.ty : 0,
      hover: null, raf: 0, w: 0, h: 0, fitted: !!old.size };
    const tick = () => {
      const a = g.alpha, cell = 70, grid = new Map();
      N.forEach((n, i) => { const key = `${Math.floor(n.x / cell)},${Math.floor(n.y / cell)}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i); });
      N.forEach((n, i) => {
        const cx = Math.floor(n.x / cell), cy = Math.floor(n.y / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const list = grid.get(`${cx + dx},${cy + dy}`); if (!list) continue;
          for (const j of list) { if (j <= i) continue; const m = N[j]; let ex = n.x - m.x, ey = n.y - m.y, d2 = ex * ex + ey * ey;
            if (d2 > cell * cell) continue; if (d2 < 0.01) { ex = hash(i * 31 + j) - 0.5; ey = hash(j * 17 + i) - 0.5; d2 = 0.5; }
            const d = Math.sqrt(d2), push = (cell - d) / d * 0.08 * a * (1 + (n.r + m.r) / 20); n.vx += ex * push; n.vy += ey * push; m.vx -= ex * push; m.vy -= ey * push; }
        }
      });
      L.forEach(([i, j]) => { const n = N[i], m = N[j], ex = m.x - n.x, ey = m.y - n.y, d = Math.sqrt(ex * ex + ey * ey) || 1, want = (n.topic || m.topic) ? 70 : 55;
        const s = (d - want) / d * 0.06 * a; n.vx += ex * s; n.vy += ey * s; m.vx -= ex * s; m.vy -= ey * s; });
      N.forEach(n => { n.vx -= n.x * 0.004 * a; n.vy -= n.y * 0.004 * a;
        if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; } else { n.vx *= 0.6; n.vy *= 0.6; n.x += n.vx; n.y += n.vy; } });
      g.alpha *= 0.985;
    };
    const fit = () => {
      if (!N.length) return; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      N.forEach(n => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
      const k = Math.max(0.2, Math.min(2.2, Math.min((g.w - 60) / (x1 - x0 || 1), (g.h - 60) / (y1 - y0 || 1))));
      g.k = k; g.tx = g.w / 2 - (x0 + x1) / 2 * k; g.ty = g.h / 2 - (y0 + y1) / 2 * k;
    };
    g.fit = () => { fit(); draw(); };
    const colors = () => { const cs = getComputedStyle(box); return { t1: cs.getPropertyValue("--t1").trim() || "#ddd", t2: cs.getPropertyValue("--t2").trim() || "#999",
      t3: cs.getPropertyValue("--t3").trim() || "#888", b2: cs.getPropertyValue("--b2").trim() || "#444", s1: cs.getPropertyValue("--s1").trim() || "#111", acc: cs.getPropertyValue("--acc").trim() || "#0ff" }; };
    let C = colors();
    const draw = () => {
      const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1, dark = document.documentElement.getAttribute("data-theme") !== "light";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, g.w, g.h);
      ctx.setTransform(dpr * g.k, 0, 0, dpr * g.k, dpr * g.tx, dpr * g.ty);
      const h = g.hover, near = h != null ? data.nbr.get(N[h].k) : null, on = n => h == null || n.k === N[h].k || near.has(n.k);
      ctx.lineWidth = 1.2 / g.k;
      L.forEach(([i, j]) => { const n = N[i], m = N[j], hit = h != null && (i === h || j === h);
        ctx.globalAlpha = h == null ? 0.5 : hit ? 0.95 : 0.1; ctx.strokeStyle = hit ? C.acc : C.t3; ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(m.x, m.y); ctx.stroke(); });
      N.forEach(n => {
        ctx.globalAlpha = on(n) ? 1 : 0.2; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (n.topic) { ctx.fillStyle = C.s1; ctx.fill(); ctx.lineWidth = 2 / g.k; ctx.strokeStyle = C.t3; ctx.stroke(); }
        else { ctx.fillStyle = nbHex(n.c, dark); ctx.fill(); ctx.lineWidth = 2 / g.k; ctx.strokeStyle = C.s1; ctx.stroke();
          if (n.id === openId) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 4 / g.k, 0, Math.PI * 2); ctx.strokeStyle = C.acc; ctx.lineWidth = 2 / g.k; ctx.stroke(); } }
      });
      ctx.font = `${12 / g.k}px Inter, system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "top";
      N.forEach((n, i) => {
        const show = i === h || (near && near.has(n.k)) || n.id === openId || (h == null && (g.k > 1.25 || n.d >= 3 || (N.length <= 40 && n.d >= 1) || N.length <= 12));
        if (!show) return; ctx.globalAlpha = on(n) ? 1 : 0.25; ctx.fillStyle = i === h ? C.t1 : n.topic ? C.t3 : C.t2; ctx.fillText(cut(n.t, 30), n.x, n.y + n.r + 3 / g.k);
      });
      ctx.globalAlpha = 1;
    };
    const size = () => { const r = box.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; g.w = r.width; g.h = r.height;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); canvas.style.width = `${r.width}px`; canvas.style.height = `${r.height}px`; draw(); };
    const loop = () => { tick(); if (!g.fitted && g.alpha < 0.35) { fit(); g.fitted = true; } draw(); if (g.alpha > 0.02) g.raf = requestAnimationFrame(loop); else g.raf = 0; };
    const heat = v => { g.alpha = Math.max(g.alpha, v); if (reduce) { for (let i = 0; i < 120; i++) tick(); draw(); } else if (!g.raf) g.raf = requestAnimationFrame(loop); };
    size();
    if (reduce) { for (let i = 0; i < 320 && g.alpha > 0.02; i++) tick(); if (!g.fitted) { fit(); g.fitted = true; } draw(); } else g.raf = requestAnimationFrame(loop);

    // pointer: hover · drag a dot · pan · wheel and pinch zoom
    const at = e => { const r = canvas.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
    const toW = (sx, sy) => ({ x: (sx - g.tx) / g.k, y: (sy - g.ty) / g.k });
    const pick = (sx, sy) => { const p = toW(sx, sy); let best = null, bd = Infinity;
      N.forEach((n, i) => { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < n.r + 6 / g.k && d < bd) { bd = d; best = i; } }); return best; };
    const ptrs = new Map(); let drag = null, moved = false, pinch = null;
    const down = e => { canvas.setPointerCapture(e.pointerId); const { sx, sy } = at(e); ptrs.set(e.pointerId, { sx, sy }); moved = false;
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy), k: g.k, mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2 }; drag = null; return; }
      const i = pick(sx, sy); drag = i != null ? { node: i, sx, sy } : { pan: true, sx, sy, tx: g.tx, ty: g.ty }; };
    const move = e => {
      const { sx, sy } = at(e);
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { sx, sy });
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.sx - b.sx, a.sy - b.sy), k = Math.max(0.15, Math.min(5, pinch.k * d / pinch.d));
        const w = toW(pinch.mx, pinch.my); g.k = k; g.tx = pinch.mx - w.x * k; g.ty = pinch.my - w.y * k; moved = true; draw(); return; }
      if (drag) {
        if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) moved = true;
        if (drag.pan) { g.tx = drag.tx + sx - drag.sx; g.ty = drag.ty + sy - drag.sy; draw(); }
        else if (moved) { const p = toW(sx, sy), n = N[drag.node]; n.fx = p.x; n.fy = p.y; n.x = p.x; n.y = p.y; heat(0.25); draw(); }
        return;
      }
      const i = pick(sx, sy);
      if (i !== g.hover) { g.hover = i; canvas.style.cursor = i != null ? "pointer" : "grab"; draw(); }
      setTip(i != null ? { x: sx, y: sy, n: N[i] } : null);
    };
    const up = e => {
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
      if (drag && !drag.pan) { const n = N[drag.node]; if (!moved && !n.topic) ops.open(n.id); n.fx = n.fy = null; }
      else if (drag && drag.pan && !moved && e.pointerType !== "mouse") { const { sx, sy } = at(e); const i = pick(sx, sy); g.hover = i; draw(); }
      drag = null;
    };
    const leave = () => { if (!drag) { g.hover = null; setTip(null); draw(); } };
    const wheel = e => { e.preventDefault(); const { sx, sy } = at(e), w = toW(sx, sy), k = Math.max(0.15, Math.min(5, g.k * Math.exp(-e.deltaY * 0.0015)));
      g.k = k; g.tx = sx - w.x * k; g.ty = sy - w.y * k; draw(); };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up); canvas.addEventListener("pointerleave", leave); canvas.addEventListener("wheel", wheel, { passive: false });
    const ro = new ResizeObserver(size); ro.observe(box);
    const mo = new MutationObserver(() => { C = colors(); draw(); }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    g.zoom = z => { const sx = g.w / 2, sy = g.h / 2, w = toW(sx, sy), k = Math.max(0.15, Math.min(5, g.k * z)); g.k = k; g.tx = sx - w.x * k; g.ty = sy - w.y * k; draw(); };
    return () => { cancelAnimationFrame(g.raf); ro.disconnect(); mo.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("pointerleave", leave); canvas.removeEventListener("wheel", wheel); };
  }, [data, openId]);

  const links = data.edges.filter(([a, b]) => !a.startsWith("t:") && !b.startsWith("t:")).length;
  return (
    <div className="pl-graph" id="pl-graph">
      <div className="pl-vbar">
        <label className="hp-switch"><input type="checkbox" checked={topicsOn} onChange={e => setTopicsOn(e.target.checked)} id="pl-g-topics"/>Topics</label>
        <label className="hp-switch"><input type="checkbox" checked={linkedOnly} onChange={e => setLinkedOnly(e.target.checked)} id="pl-g-linked"/>Only connected notes</label>
        <span className="pl-sp"/>
        <small className="pl-muted" id="pl-g-count">{data.nodes.filter(n => !n.topic).length} notes · {links} link{links === 1 ? "" : "s"}</small>
      </div>
      <div className="pl-gbox">
        <div className="pl-gcv px-card" ref={wrap}>
          <canvas ref={cv} id="pl-g-canvas" role="img" aria-label={`A graph of ${data.nodes.length} notes and how they link`}/>
          <div className="pl-gzoom"><button type="button" className="pl-ib" onClick={() => G.current && G.current.zoom(1.25)} aria-label="Zoom in"><PI n="plus" s={15}/></button>
            <button type="button" className="pl-ib" onClick={() => G.current && G.current.zoom(0.8)} aria-label="Zoom out"><PI n="minus" s={15}/></button>
            <button type="button" className="pl-ib" onClick={() => G.current && G.current.fit()} aria-label="Fit the graph" id="pl-g-fit"><PI n="wide" s={15}/></button></div>
          {used.length > 0 && <div className="pl-glegend" aria-label="Notebooks">{used.map(n => <NbDot key={n.id} nb={n}/>)}{topicsOn && <span className="pl-nbd"><i className="ring"/>Topic</span>}</div>}
          {tip && <div className="pl-gtip" style={{ left: Math.min(tip.x + 14, (wrap.current ? wrap.current.clientWidth : 400) - 220), top: tip.y + 14 }}>
            <b>{tip.n.t}</b><small>{tip.n.topic ? `${tip.n.d} note${tip.n.d === 1 ? "" : "s"}` : `${(nbs.get(tip.n.nb) || {}).name || ""} · ${tip.n.d} link${tip.n.d === 1 ? "" : "s"} · click to open`}</small></div>}
          {!data.nodes.length && <div className="pl-empty pl-gempty"><PI n="graph" s={22}/><b>Nothing to draw</b><span>No notes match the filters.</span></div>}
          {data.nodes.length > 0 && links === 0 && !topicsOn && <div className="pl-ghint">Type <b>[[</b> in a note to link it to another — the lines appear here. Or switch on <b>Topics</b>.</div>}
        </div>
        <div className="px-card pl-sec pl-gside" id="pl-g-top">
          <div className="pl-sh"><h3>Most connected</h3></div>
          {top.length ? top.map(n => <button key={n.k} type="button" className="pl-row" onClick={() => ops.open(n.id)} data-page={n.id}>
            <PI n="note" s={15}/><span className="pl-rt">{n.t}</span><NbDot nb={nbs.get(n.nb)} s/><small>{n.d}</small></button>)
            : <p className="pl-muted">No links yet.</p>}
        </div>
      </div>
    </div>);
}
