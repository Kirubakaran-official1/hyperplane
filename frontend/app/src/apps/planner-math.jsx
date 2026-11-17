// Hyperplane Planner — formulas in a note (round 22d, owner 2026-11-14: "copy and paste formulas from ChatGPT or Claude — pi, sigma and all").
// A formula is kept as LaTeX only (the server keeps nothing else) and drawn by KaTeX here — links, HTML and macros that reach outside are off.
//   Pasted from a chat that shows maths with KaTeX / MathML (ChatGPT, Claude, Wikipedia…): the TeX behind each formula becomes a formula.
//   Pasted as text: $…$ or \(…\) → a formula in the line; $$…$$ or \[…\] → a formula on its own line. "$5 and $10" stays text.
//   Typed: "/" → Formula · Formula block, or the Σ button; click any formula to change it (with a live preview).
import React, { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Float, PI } from "./planner-lib.jsx";

export const KATEX = { throwOnError: false, strict: "ignore", trust: false, maxSize: 20, maxExpand: 500 };

// ── pasted HTML: KaTeX (.katex / .katex-display) and MathML (<math>) carry their TeX in an annotation
const texOf = el => { const a = el.querySelector('annotation[encoding="application/x-tex"]'); return a ? a.textContent.trim() : null; };
export function fromMathHtml(html) {
  if (!/katex|<math[\s>]/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");            // an inert document: nothing in it runs
  const mk = (block, tex) => { const el = doc.createElement(block ? "div" : "span"); el.setAttribute("data-type", block ? "block-math" : "inline-math"); el.setAttribute("data-latex", tex); return el; };
  doc.querySelectorAll(".katex-display").forEach(el => { const t = texOf(el); if (t) el.replaceWith(mk(true, t)); });
  doc.querySelectorAll(".katex").forEach(el => { const t = texOf(el); if (t) el.replaceWith(mk(false, t)); });
  doc.querySelectorAll("math").forEach(el => { const t = texOf(el); if (t) el.replaceWith(mk(el.getAttribute("display") === "block", t)); });
  return doc.body.innerHTML;
}

// ── pasted text with $…$ / $$…$$ / \(…\) / \[…\]
const BLOCK = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
const INLINE = /\\\((.+?)\\\)|(?<![\\$\w])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?![\d$])/g;
export const hasMath = txt => { BLOCK.lastIndex = 0; INLINE.lastIndex = 0; return BLOCK.test(txt) || INLINE.test(txt); };
function line(s) {
  const out = []; let at = 0; INLINE.lastIndex = 0; let m;
  while ((m = INLINE.exec(s))) {
    if (m.index > at) out.push({ type: "text", text: s.slice(at, m.index) });
    out.push({ type: "inlineMath", attrs: { latex: (m[1] || m[2]).trim() } });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push({ type: "text", text: s.slice(at) });
  return out.filter(x => x.type !== "text" || x.text);
}
export function mathContent(txt) {
  const out = []; let at = 0; BLOCK.lastIndex = 0; let m;
  const para = s => s.replace(/\r/g, "").split("\n").forEach(l => { if (l.trim()) out.push({ type: "paragraph", content: line(l) }); });
  while ((m = BLOCK.exec(txt))) { para(txt.slice(at, m.index)); out.push({ type: "blockMath", attrs: { latex: (m[1] || m[2]).trim() } }); at = m.index + m[0].length; }
  para(txt.slice(at));
  return out;
}

const EXAMPLES = [["π", "\\pi"], ["Σ", "\\sum_{i=1}^{n} x_i"], ["a/b", "\\frac{a}{b}"], ["√", "\\sqrt{x}"], ["x²", "x^{2}"], ["∫", "\\int_{a}^{b} f(x)\\,dx"],
  ["σ", "\\sigma"], ["μ", "\\mu"], ["≤", "\\le"], ["≈", "\\approx"]];

// ── change a formula: its LaTeX, a live preview, Save / Remove
export function MathPanel({ math, onSave, onRemove, onClose }) {
  const [v, setV] = useState(math.latex || ""); const ref = useRef(null), box = useRef(null);
  useEffect(() => { if (ref.current) { ref.current.focus(); ref.current.select(); } }, []);
  useEffect(() => {
    const h = e => { if (box.current && !box.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const html = useMemo(() => { try { return v.trim() ? katex.renderToString(v, { ...KATEX, displayMode: math.kind === "block" }) : ""; } catch { return ""; } }, [v]);
  const save = () => { const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "").trim().slice(0, 4000); if (s) onSave(s); else if (!math.isNew) onRemove(); else onClose(); };
  return (
    <Float><div className="pl-math" ref={box} style={math.style} role="dialog" aria-label="Formula" id="pl-math">
      <div className="pl-mathh"><PI n="sigma" s={15}/><b>{math.kind === "block" ? "Formula block" : "Formula"}</b><span className="pl-sp"/>
        <small>LaTeX — the way ChatGPT and Claude write maths</small></div>
      <textarea ref={ref} value={v} onChange={e => setV(e.target.value)} rows={3} spellCheck={false} aria-label="LaTeX" id="pl-math-in" placeholder="\sum_{i=1}^{n} x_i"
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === "Escape") { e.preventDefault(); onClose(); } }}/>
      <div className="pl-mathx">{EXAMPLES.map(([l, t]) => <button key={t} type="button" title={t} onClick={() => { setV(x => (x ? `${x} ` : "") + t); ref.current && ref.current.focus(); }}>{l}</button>)}</div>
      <div className={`pl-mathp ${math.kind === "block" ? "blk" : ""}`} aria-live="polite" dangerouslySetInnerHTML={{ __html: html || "<span class=\"pl-muted\">The preview shows here</span>" }}/>
      <div className="pl-mathf">{!math.isNew && <button type="button" className="px-btn danger" onClick={onRemove}>Remove</button>}<span className="pl-sp"/>
        <button type="button" className="px-btn" onClick={onClose}>Cancel</button><button type="button" className="px-btn primary" onClick={save} id="pl-math-save">{math.isNew ? "Insert" : "Save"}</button></div>
    </div></Float>);
}
