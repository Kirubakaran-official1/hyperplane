// The AI Mode tile field (owner, round 7: "blocks pop up top to down … the hover effect"): a canvas of cells in the accent colour —
// an opening wave from the top, and a fading trail under the mouse. Used by AI Mode (full page) and, round 16, as a showcase on a few
// parts of the shared portfolio page. Calm for prefers-reduced-motion and touch screens.
import React, { useEffect, useRef } from "react";

const CELL = 56;
export function CellField({ className = "hp-cells", size: CS = CELL }) {
  const cv = useRef(null), st = useRef({ trail: [], t0: 0, last: "", raf: 0, w: 0, h: 0, mx: -1, my: -1 });
  useEffect(() => {
    const c = cv.current; if (!c) return;
    let calm = false, touch = false;
    try { calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches; touch = window.matchMedia("(hover: none)").matches; } catch { /* ignore */ }
    const S = st.current, ctx = c.getContext("2d");
    const size = () => {
      const r = c.getBoundingClientRect(), k = Math.min(2, window.devicePixelRatio || 1);
      if (!r.width) return false;
      S.w = r.width; S.h = r.height; c.width = Math.round(r.width * k); c.height = Math.round(r.height * k); ctx.setTransform(k, 0, 0, k, 0, 0); return true;
    };
    const rgb = () => {                                              // the accent colour of the theme, as r, g, b
      const v = getComputedStyle(document.documentElement).getPropertyValue("--acc").trim();
      const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v); if (!m) return [14, 116, 144];
      const h = m[1].length === 3 ? m[1].replace(/./g, x => x + x) : m[1];
      return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
    };
    const draw = now => {
      S.raf = 0;
      if (!c.getBoundingClientRect().width && !size()) return;              // the page is not showing
      ctx.clearRect(0, 0, S.w, S.h);
      const [R, G, B] = rgb(), cols = Math.ceil(S.w / CS), rows = Math.ceil(S.h / CS);
      let live = false;
      const cell = (r, col, a, pad = 1) => { ctx.fillStyle = `rgba(${R},${G},${B},${a})`; ctx.fillRect(col * CS + pad, r * CS + pad, CS - pad * 2, CS - pad * 2); };
      // opening: a wave of popping cells from the top to the bottom
      const t = now - S.t0;
      if (t < rows * 55 + 12 * 8 + 760) {
        live = true;
        for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
          const p = (t - (r * 55 + ((col * 7 + r * 3) % 9) * 12)) / 700;
          if (p > 0 && p < 1) { const e = Math.sin(Math.PI * p); cell(r, col, e * 0.2, 1 + (1 - e) * 10); }
        }
      }
      // the mouse: the cell under it, and a trail that fades
      S.trail = S.trail.filter(x => now - x.t < 1000);
      for (const x of S.trail) {
        const a = Math.max(0, 1 - (now - x.t) / 1000); live = true;
        cell(x.r, x.c, a * a * 0.3); ctx.strokeStyle = `rgba(${R},${G},${B},${a * 0.5})`; ctx.lineWidth = 1; ctx.strokeRect(x.c * CS + 1.5, x.r * CS + 1.5, CS - 3, CS - 3);
      }
      if (live) S.raf = requestAnimationFrame(draw);
    };
    const kick = () => { if (!S.raf) S.raf = requestAnimationFrame(draw); };
    S.kick = kick;
    size(); S.t0 = performance.now();
    if (!calm) kick();
    const move = e => {
      if (calm || touch || !c.getBoundingClientRect().width) return;
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) return;
      const col = Math.floor(x / CS), row = Math.floor(y / CS), key = `${row}:${col}`;
      if (key !== S.last) { S.last = key; S.trail.push({ r: row, c: col, t: performance.now() }); if (S.trail.length > 40) S.trail.shift(); kick(); }
    };
    const resize = () => { if (size()) { S.t0 = performance.now(); if (!calm) kick(); } };
    window.addEventListener("mousemove", move, { passive: true }); window.addEventListener("resize", resize);
    const shown = new IntersectionObserver(es => { if (es[0].isIntersecting && c.getBoundingClientRect().width) { size(); S.t0 = performance.now(); if (!calm) kick(); } });   // opening the app again plays it again
    shown.observe(c);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("resize", resize); shown.disconnect(); cancelAnimationFrame(S.raf); };
  }, []);
  return <canvas className={className} ref={cv} aria-hidden="true"/>;
}
