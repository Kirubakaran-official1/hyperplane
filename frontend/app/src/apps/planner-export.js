// Hyperplane Planner — downloads (its own chunk; jsPDF and docx load only when a download starts). The notes come from the server as
// blocks (the same allow-list the editor saves) and are written here as a PDF, a Word document or Markdown: one file with every note
// (a cover and a contents page first), or a file per note in a .zip (a small zip writer of our own: stored, not compressed).
import { api } from "../core.jsx";

const FILE = /^\/app\/api\/planner\/files\/(\d{1,18})$/;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const niceDay = iso => { if (!iso) return ""; const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };
const walk = (n, fn) => { fn(n); (n.content || []).forEach(c => walk(c, fn)); };
const plain = n => { let s = ""; walk(n, x => { if (x.type === "text") s += x.text; else if (x.type === "pageLink") s += (x.attrs || {}).label || "";
  else if (x.type === "inlineMath" || x.type === "blockMath") s += texText((x.attrs || {}).latex); else if (x.type === "hardBreak") s += "\n"; }); return s; };
// a formula as readable text (Word, tables): the common LaTeX commands → their signs; the rest as written
const SYM = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ",
  Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω", sum: "∑", prod: "∏", int: "∫", oint: "∮", infty: "∞", pm: "±", mp: "∓", times: "×",
  div: "÷", cdot: "·", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", equiv: "≡", sim: "∼", propto: "∝", partial: "∂", nabla: "∇", forall: "∀",
  exists: "∃", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩", emptyset: "∅", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒",
  Leftrightarrow: "⇔", implies: "⇒", iff: "⇔", ldots: "…", cdots: "⋯", degree: "°", circ: "∘", sqrt: "√", log: "log", ln: "ln", sin: "sin", cos: "cos", tan: "tan",
  exp: "exp", max: "max", min: "min", lim: "lim", quad: " ", qquad: "  " };
export function texText(t) {
  let s = String(t || "");
  for (let i = 0; i < 4; i++) s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)").replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  return s.replace(/\\(left|right|displaystyle|textstyle|mathrm|mathbf|mathit|text|operatorname)\b/g, "")
    .replace(/\\([A-Za-z]+)/g, (m, k) => SYM[k] !== undefined ? SYM[k] : k).replace(/\\[,;:! ]/g, " ").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}
const fname = (s, used, ext) => {
  let b = String(s || "Untitled").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled", n = b, i = 2;
  while (used.has(`${n}.${ext}`.toLowerCase())) n = `${b} (${i++})`;
  used.add(`${n}.${ext}`.toLowerCase()); return `${n}.${ext}`;
};
const metaLine = (p, nbs) => [(nbs.get(p.nb) || {}).name, p.kind === "journal" ? "Journal" : p.kind === "project" ? "Project" : null,
  niceDay(p.day || p.created), p.tags.length ? p.tags.map(t => `#${t}`).join(" ") : null].filter(Boolean).join("  ·  ");

function save(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

// ── the notes' pictures → JPEG (PDF and Word both take it), at most 1400 px wide
async function pictures(pages, onStep) {
  const ids = new Set(); pages.forEach(p => walk(p.doc || {}, n => { if (n.type === "image") { const m = FILE.exec((n.attrs || {}).src || ""); if (m) ids.add(m[1]); } }));
  const list = [...ids].slice(0, 600), out = new Map(); let done = 0;
  const one = async id => {
    try {
      const r = await fetch(`/app/api/planner/files/${id}`, { credentials: "same-origin" }); if (!r.ok) return;
      const url = await new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; r.blob().then(b => f.readAsDataURL(b), no); });
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const s = Math.min(1, 1400 / img.naturalWidth), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      const jpg = c.toDataURL("image/jpeg", 0.85), bin = atob(jpg.split(",")[1]), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      out.set(id, { url: jpg, bytes, w: c.width, h: c.height });
    } catch { /* a picture that cannot be read is left out */ }
    finally { done += 1; if (list.length > 3) onStep(`Getting the pictures… ${done} of ${list.length}`); }
  };
  for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map(one));
  return out;
}
const picOf = (n, pics) => { const m = FILE.exec((n.attrs || {}).src || ""); return m ? pics.get(m[1]) : null; };

// ── PDF: the standard fonts (Latin letters); what they cannot print becomes the nearest plain sign
const LAT = { "₹": "Rs ", "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "•": "-", " ": " ", "−": "-", "→": "->", "←": "<-", "✓": "v", "×": "x" };
const lat = s => String(s || "").replace(/[^\u0000-ÿ]/g, c => LAT[c] !== undefined ? LAT[c] : "?");

function pdfOf(jsPDF, pages, { title, nbs, pics, cover }) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 50, R = W - M, TOP = 56, BOT = H - 56;
  let y = TOP;
  const font = (st = "normal", size = 11, mono) => { doc.setFont(mono ? "courier" : "helvetica", st); doc.setFontSize(size); };
  const color = (r, g, b) => doc.setTextColor(r, g, b);
  const room = h => { if (y + h > BOT) { doc.addPage(); y = TOP; } };

  // inline content → lines of styled pieces that fit the width
  const runs = (nodes, base = {}) => {
    const out = [];
    (nodes || []).forEach(n => {
      if (n.type === "hardBreak") out.push({ br: true });
      else if (n.type === "pageLink") out.push({ t: lat((n.attrs || {}).label || "Untitled"), b: true, ...base });
      else if (n.type === "inlineMath") out.push({ t: lat(texText((n.attrs || {}).latex)), i: true, ...base });
      else if (n.type === "text") { const m = {}; (n.marks || []).forEach(k => { m[k.type] = k.attrs || true; });
        out.push({ t: lat(n.text), b: !!m.bold || base.b, i: !!m.italic || base.i, code: !!m.code, u: !!m.underline, s: !!m.strike, hl: !!m.highlight, href: m.link && m.link.href }); }
    });
    return out;
  };
  const styleOf = r => r.b && r.i ? "bolditalic" : r.b ? "bold" : r.i ? "italic" : "normal";
  const lay = (rs, size, width) => {
    const lines = [[]]; let x = 0;
    rs.forEach(r => {
      if (r.br) { lines.push([]); x = 0; return; }
      font(styleOf(r), r.code ? size - 1 : size, r.code);
      r.t.split(/(\s+)/).forEach(tok => {
        if (!tok) return;
        let w = doc.getTextWidth(tok);
        if (/^\s+$/.test(tok)) { if (x === 0) return; tok = " "; w = doc.getTextWidth(" "); }
        else if (x + w > width && x > 0) { lines.push([]); x = 0; }
        while (w > width) {                                            // a word longer than the line: cut it
          let k = tok.length; while (k > 1 && doc.getTextWidth(tok.slice(0, k)) > width - x) k--;
          lines[lines.length - 1].push({ ...r, t: tok.slice(0, k), x, w: doc.getTextWidth(tok.slice(0, k)) }); lines.push([]); x = 0;
          tok = tok.slice(k); w = doc.getTextWidth(tok);
        }
        lines[lines.length - 1].push({ ...r, t: tok, x, w }); x += w;
      });
    });
    return lines;
  };
  const text = (nodes, { size = 11, x0 = M, gap = 6, bar, base, grey } = {}) => {
    const lh = size * 1.42, lines = lay(runs(nodes, base), size, R - x0);
    lines.forEach(line => {
      room(lh);
      line.forEach(p => {
        const fs = p.code ? size - 1 : size; font(styleOf(p), fs, p.code);
        if (p.hl) { doc.setFillColor(255, 240, 150); doc.rect(x0 + p.x, y - 1, p.w, lh - 2, "F"); }
        if (p.code) { doc.setFillColor(238, 240, 244); doc.rect(x0 + p.x - 1, y, p.w + 2, lh - 3, "F"); }
        if (p.href) color(29, 78, 216); else if (grey) color(90, 98, 112); else color(20, 24, 32);
        doc.text(p.t, x0 + p.x, y + size, { baseline: "alphabetic" });
        if (p.u || p.href) { doc.setDrawColor(p.href ? 29 : 20, p.href ? 78 : 24, p.href ? 216 : 32); doc.setLineWidth(0.5); doc.line(x0 + p.x, y + size + 1.5, x0 + p.x + p.w, y + size + 1.5); }
        if (p.s) { doc.setDrawColor(20, 24, 32); doc.setLineWidth(0.6); doc.line(x0 + p.x, y + size * 0.68, x0 + p.x + p.w, y + size * 0.68); }
        if (p.href && /^(https?:|mailto:)/i.test(p.href)) doc.link(x0 + p.x, y, p.w, lh, { url: p.href });
      });
      if (bar) { doc.setDrawColor(190, 196, 206); doc.setLineWidth(2); doc.line(bar, y, bar, y + lh); }
      y += lh;
    });
    y += gap;
  };
  const blocks = (list, x0 = M, ctx = {}) => (list || []).forEach(b => block(b, x0, ctx));
  const block = (b, x0, ctx) => {
    const c = b.content || [];
    if (b.type === "paragraph") text(c, { x0, bar: ctx.bar, grey: ctx.bar, base: ctx.bar ? { i: true } : undefined, gap: ctx.tight ? 2 : 6 });
    else if (b.type === "heading") { const l = (b.attrs || {}).level || 2, size = l === 1 ? 19 : l === 2 ? 15 : 12.5; y += l === 1 ? 10 : 7; room(size * 3); text(c, { x0, size, base: { b: true }, gap: 4 }); }
    else if (b.type === "bulletList" || b.type === "orderedList" || b.type === "taskList") {
      let n = (b.attrs || {}).start || 1;
      c.forEach(it => {
        room(16); const my = y; font("normal", 11); color(20, 24, 32);
        if (b.type === "bulletList") { doc.setFillColor(60, 66, 78); doc.circle(x0 + 5, my + 8, ctx.depth ? 1.6 : 2.1, ctx.depth ? "S" : "F"); }
        else if (b.type === "orderedList") doc.text(`${n++}.`, x0, my + 11);
        else { doc.setDrawColor(90, 98, 112); doc.setLineWidth(0.8); doc.rect(x0, my + 2, 10, 10);
          if ((it.attrs || {}).checked) { doc.setLineWidth(1.4); doc.line(x0 + 2, my + 7, x0 + 4.5, my + 10); doc.line(x0 + 4.5, my + 10, x0 + 8.5, my + 4); } }
        blocks(it.content, x0 + 18, { ...ctx, tight: true, depth: (ctx.depth || 0) + 1 });
      });
      y += ctx.depth ? 0 : 4;
    }
    else if (b.type === "blockquote") blocks(c, x0 + 14, { ...ctx, bar: x0 + 4 });
    else if (b.type === "codeBlock") {
      const lines = plain(b).split("\n"); font("normal", 9.5, true); const lh = 13; y += 2;
      lines.forEach(l => doc.splitTextToSize(lat(l) || " ", R - x0 - 12).forEach(s => { room(lh); doc.setFillColor(240, 242, 246); doc.rect(x0, y, R - x0, lh, "F"); color(30, 36, 48); doc.text(s, x0 + 6, y + 9.5); y += lh; }));
      y += 8;
    }
    else if (b.type === "blockMath") { const s = lat(texText((b.attrs || {}).latex)); font("italic", 12); color(20, 24, 32);
      doc.splitTextToSize(s, R - x0 - 40).forEach(l => { room(18); doc.text(l, (x0 + R) / 2, y + 13, { align: "center" }); y += 18; }); y += 8; }
    else if (b.type === "horizontalRule") { room(14); doc.setDrawColor(200, 205, 214); doc.setLineWidth(0.8); doc.line(x0, y + 6, R, y + 6); y += 14; }
    else if (b.type === "image") {
      const p = picOf(b, pics); if (!p) return;
      let w = Math.min(R - x0, p.w * 0.6), h = p.h * w / p.w; if (h > 420) { h = 420; w = p.w * h / p.h; }
      room(h + 8); doc.addImage(p.url, "JPEG", x0, y, w, h, undefined, "FAST"); y += h + 10;
    }
    else if (b.type === "table") {
      const rows = c.filter(r => r.type === "tableRow"), cols = Math.max(1, ...rows.map(r => (r.content || []).length)), cw = (R - x0) / cols, lh = 12.5;
      font("normal", 9.5); y += 2;
      rows.forEach(r => {
        const cells = r.content || [], head = cells.some(x => x.type === "tableHeader");
        font(head ? "bold" : "normal", 9.5);
        const txt = cells.map(x => doc.splitTextToSize(lat((x.content || []).map(plain).join("\n")) || " ", cw - 10));
        const rh = Math.max(...txt.map(t => t.length), 1) * lh + 8; room(rh);
        cells.forEach((x, i) => { if (head) { doc.setFillColor(236, 239, 244); doc.rect(x0 + i * cw, y, cw, rh, "F"); }
          doc.setDrawColor(200, 205, 214); doc.setLineWidth(0.6); doc.rect(x0 + i * cw, y, cw, rh); color(20, 24, 32); doc.text(txt[i], x0 + i * cw + 5, y + 12); });
        y += rh;
      });
      y += 10;
    }
  };

  const starts = [];
  if (cover) {
    font("bold", 26); color(20, 24, 32); doc.text(doc.splitTextToSize(lat(title), R - M), M, 200);
    font("normal", 12); color(90, 98, 112); doc.text(`${pages.length} notes  ·  downloaded on ${niceDay(today())}`, M, 236);
    doc.text("Hyperplane Planner", M, 256);
    const per = 34, tocPages = Math.ceil(pages.length / per);
    for (let i = 0; i < tocPages; i++) doc.addPage();
    pages.forEach((p, i) => { doc.addPage(); y = TOP; starts.push(doc.getNumberOfPages()); note(p); });
    for (let i = 0; i < tocPages; i++) {
      doc.setPage(2 + i); y = TOP;
      if (i === 0) { font("bold", 18); color(20, 24, 32); doc.text("Contents", M, y + 18); y += 40; }
      pages.slice(i * per, (i + 1) * per).forEach((p, j) => {
        const k = i * per + j; font("normal", 11); color(20, 24, 32);
        const t = doc.splitTextToSize(lat(p.title || "Untitled"), R - M - 50)[0]; doc.text(t, M, y + 11);
        color(90, 98, 112); doc.text(String(starts[k]), R, y + 11, { align: "right" });
        doc.link(M, y, R - M, 16, { pageNumber: starts[k] }); y += 19;
      });
    }
  } else pages.forEach((p, i) => { if (i) { doc.addPage(); y = TOP; } note(p); });
  function note(p) {
    font("bold", 21); color(20, 24, 32);
    doc.splitTextToSize(lat(p.title || "Untitled"), R - M).forEach(l => { room(28); doc.text(l, M, y + 21); y += 28; });
    font("normal", 9.5); color(110, 118, 132); doc.text(lat(metaLine(p, nbs)), M, y + 8); y += 18;
    doc.setDrawColor(220, 224, 232); doc.setLineWidth(0.8); doc.line(M, y, R, y); y += 14;
    blocks((p.doc || {}).content || []);
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); font("normal", 8.5); color(130, 138, 150); doc.text(`Hyperplane Planner  ·  ${i} / ${n}`, W / 2, H - 28, { align: "center" }); }
  return doc.output("blob");
}

// ── Word
async function docxOf(D, pages, { title, nbs, pics, cover }) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell, WidthType, ExternalHyperlink, BorderStyle, ShadingType, LevelFormat, AlignmentType } = D;
  let inst = 0;
  const inl = (nodes, base = {}) => (nodes || []).flatMap(n => {
    if (n.type === "hardBreak") return [new TextRun({ break: 1 })];
    if (n.type === "pageLink") return [new TextRun({ text: (n.attrs || {}).label || "Untitled", bold: true, ...base })];
    if (n.type === "inlineMath") return [new TextRun({ text: texText((n.attrs || {}).latex), font: "Cambria Math", italics: true })];
    if (n.type !== "text") return [];
    const m = {}; (n.marks || []).forEach(k => { m[k.type] = k.attrs || true; });
    const o = { text: n.text, bold: !!m.bold || base.bold, italics: !!m.italic || base.italics, strike: !!m.strike, underline: m.underline ? {} : undefined,
      highlight: m.highlight ? "yellow" : undefined, font: m.code ? "Consolas" : undefined, color: base.color };
    if (m.link && /^(https?:|mailto:)/i.test(m.link.href)) return [new ExternalHyperlink({ link: m.link.href, children: [new TextRun({ ...o, style: "Hyperlink" })] })];
    return [new TextRun(o)];
  });
  const H = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const out = (list, ctx = {}) => (list || []).flatMap(b => blk(b, ctx));
  const blk = (b, ctx) => {
    const c = b.content || [], lvl = Math.min(8, ctx.level || 0);
    if (b.type === "paragraph") return [new Paragraph({ children: [...(ctx.prefix ? [new TextRun(ctx.prefix)] : []), ...inl(c, ctx.quote ? { italics: true, color: "555555" } : {})],
      ...(ctx.num ? { numbering: ctx.num } : {}), ...(ctx.indent ? { indent: { left: ctx.indent } } : {}),
      ...(ctx.quote ? { border: { left: { style: BorderStyle.SINGLE, size: 12, color: "B0B7C3", space: 8 } }, indent: { left: 360 } } : {}), spacing: { after: ctx.tight ? 40 : 120 } })];
    if (b.type === "heading") return [new Paragraph({ heading: H[((b.attrs || {}).level || 2) - 1], children: inl(c) })];
    if (b.type === "bulletList" || b.type === "orderedList" || b.type === "taskList") {
      const ref = b.type === "orderedList" ? "pl-num" : "pl-bullet", me = ++inst;
      return c.flatMap(it => (it.content || []).flatMap((x, i) => {
        if (x.type === "paragraph" && i === 0) {
          if (b.type === "taskList") return blk(x, { ...ctx, tight: true, indent: 360 * (lvl + 1), prefix: (it.attrs || {}).checked ? "☒ " : "☐ " });
          return blk(x, { ...ctx, tight: true, num: { reference: ref, level: lvl, ...(b.type === "orderedList" ? { instance: me } : {}) } });
        }
        return blk(x, { ...ctx, level: lvl + 1, tight: true, indent: x.type === "paragraph" ? 360 * (lvl + 1) + 360 : undefined, num: undefined, prefix: undefined });
      }));
    }
    if (b.type === "blockquote") return out(c, { ...ctx, quote: true });
    if (b.type === "codeBlock") return plain(b).split("\n").map(l => new Paragraph({ shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F3F6" }, spacing: { after: 0 },
      children: [new TextRun({ text: l || " ", font: "Consolas", size: 19 })] }));
    if (b.type === "blockMath") return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: texText((b.attrs || {}).latex), font: "Cambria Math", italics: true, size: 26 })] })];
    if (b.type === "horizontalRule") return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C8CDD6", space: 1 } }, spacing: { after: 160 } })];
    if (b.type === "image") {
      const p = picOf(b, pics); if (!p) return [];
      let w = Math.min(600, p.w), h = Math.round(p.h * w / p.w); if (h > 700) { h = 700; w = Math.round(p.w * h / p.h); }
      return [new Paragraph({ children: [new ImageRun({ type: "jpg", data: p.bytes, transformation: { width: w, height: h } })], spacing: { after: 160 } })];
    }
    if (b.type === "table") {
      const rows = c.filter(r => r.type === "tableRow"); if (!rows.length) return [];
      return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map(r => new TableRow({ tableHeader: (r.content || []).some(x => x.type === "tableHeader"),
        children: (r.content || []).map(x => new TableCell({ shading: x.type === "tableHeader" ? { type: ShadingType.CLEAR, color: "auto", fill: "ECEFF4" } : undefined,
          children: (() => { const k = out(x.content, { tight: true }).filter(z => z instanceof Paragraph); return k.length ? k : [new Paragraph("")]; })() })) })) }), new Paragraph("")];
    }
    return [];
  };
  const children = [];
  if (cover) children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
    new Paragraph({ children: [new TextRun({ text: `${pages.length} notes · downloaded on ${niceDay(today())} · Hyperplane Planner`, color: "666666" })], spacing: { after: 240 } }));
  pages.forEach((p, i) => {
    children.push(new Paragraph({ heading: cover ? HeadingLevel.HEADING_1 : HeadingLevel.TITLE, pageBreakBefore: i > 0 || cover, children: [new TextRun(p.title || "Untitled")] }),
      new Paragraph({ children: [new TextRun({ text: metaLine(p, nbs), color: "777777", size: 18 })], spacing: { after: 200 } }),
      ...out(((p.doc || {}).content || []).map(b => cover && b.type === "heading" ? { ...b, attrs: { level: Math.min(3, ((b.attrs || {}).level || 1) + 1) } } : b)));
  });
  const lv = (fmt, texts) => Array.from({ length: 9 }, (_, i) => ({ level: i, format: fmt, text: typeof texts === "function" ? texts(i) : texts[i % texts.length], alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 360 * (i + 1), hanging: 280 } } } }));
  const d = new Document({
    creator: "Hyperplane Planner", title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: { config: [{ reference: "pl-bullet", levels: lv(LevelFormat.BULLET, ["•", "◦", "▪"]) }, { reference: "pl-num", levels: lv(LevelFormat.DECIMAL, i => `%${i + 1}.`) }] },
    sections: [{ children }],
  });
  return Packer.toBlob(d);
}

// ── Markdown
function mdOf(p, nbs) {
  const origin = window.location.origin;
  const inl = nodes => (nodes || []).map(n => {
    if (n.type === "hardBreak") return "  \n";
    if (n.type === "pageLink") return `[[${(n.attrs || {}).label || "Untitled"}]]`;
    if (n.type === "inlineMath") return `$${(n.attrs || {}).latex || ""}$`;
    if (n.type !== "text") return "";
    let t = n.text.replace(/([\\`*_[\]#<>|])/g, "\\$1"); const m = {}; (n.marks || []).forEach(k => { m[k.type] = k.attrs || true; });
    if (m.code) t = `\`${n.text.replace(/`/g, "'")}\``; if (m.bold) t = `**${t}**`; if (m.italic) t = `_${t}_`; if (m.strike) t = `~~${t}~~`; if (m.highlight) t = `==${t}==`;
    if (m.link) t = `[${t}](${m.link.href})`; return t;
  }).join("");
  const out = (list, pre = "") => (list || []).map(b => blk(b, pre)).filter(x => x !== null).join("\n\n");
  const blk = (b, pre) => {
    const c = b.content || [], P = s => s.split("\n").map(l => pre + l).join("\n");
    if (b.type === "paragraph") return P(inl(c));
    if (b.type === "heading") return P(`${"#".repeat(((b.attrs || {}).level || 2) + 1)} ${inl(c)}`);
    if (b.type === "bulletList" || b.type === "orderedList" || b.type === "taskList") {
      let n = (b.attrs || {}).start || 1;
      return c.map(it => { const mark = b.type === "orderedList" ? `${n++}. ` : b.type === "taskList" ? `- [${(it.attrs || {}).checked ? "x" : " "}] ` : "- ";
        const [first, ...rest] = it.content || [];
        return [pre + mark + (first && first.type === "paragraph" ? inl(first.content) : ""), ...rest.map(x => blk(x, pre + "  "))].join("\n"); }).join("\n");
    }
    if (b.type === "blockquote") return out(c, `${pre}> `);
    if (b.type === "codeBlock") return P(`\`\`\`${(b.attrs || {}).language || ""}\n${plain(b)}\n\`\`\``);
    if (b.type === "horizontalRule") return P("---");
    if (b.type === "blockMath") return P(`$$\n${(b.attrs || {}).latex || ""}\n$$`);
    if (b.type === "image") { const a = b.attrs || {}; return FILE.test(a.src || "") ? P(`![${(a.alt || "picture").replace(/[[\]]/g, "")}](${origin}${a.src})`) : null; }
    if (b.type === "table") {
      const rows = c.map(r => (r.content || []).map(x => (x.content || []).map(plain).join(" ").replace(/\|/g, "\\|").replace(/\n/g, " ")));
      if (!rows.length) return null; const w = Math.max(...rows.map(r => r.length));
      const line = r => `| ${Array.from({ length: w }, (_, i) => r[i] || "").join(" | ")} |`;
      return P([line(rows[0]), `|${" --- |".repeat(w)}`, ...rows.slice(1).map(line)].join("\n"));
    }
    return null;
  };
  return `# ${p.title || "Untitled"}\n\n_${metaLine(p, nbs)}_\n\n${out((p.doc || {}).content)}\n`;
}

// ── a .zip of several files (stored as they are; every system opens it)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function zipOf(files) {
  const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, blob] of files) {
    const data = new Uint8Array(await blob.arrayBuffer()), nm = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nm.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nm.length, 2],
      [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]].forEach(([o, v, n]) => n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
    parts.push(h, nm, data); dir.push(c, nm); off += 30 + nm.length + data.length;
  }
  const size = dir.reduce((s, x) => s + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, off, 4], [20, 0, 2]].forEach(([o, v, n]) => n === 4 ? e.setUint32(o, v, true) : e.setUint16(o, v, true));
  return new Blob([...parts, ...dir, e], { type: "application/zip" });
}

export async function exportNotes({ ids, fmt, separate, pictures: withPics, title, nbs, onStep }) {
  const pages = []; let left = ids.slice();
  while (left.length) {
    onStep(`Getting your notes… ${pages.length} of ${ids.length}`);
    const r = await api("/app/api/planner/pages/docs", { method: "POST", json: { ids: left.slice(0, 500) } });
    if (!r.pages.length) break;
    pages.push(...r.pages); left = [...r.more, ...left.slice(500)];
  }
  if (!pages.length) throw new Error("Those notes could not be found");
  const at = new Map(ids.map((id, i) => [id, i])); pages.sort((a, b) => at.get(a.id) - at.get(b.id));
  const pics = withPics && fmt !== "md" ? await pictures(pages, onStep) : new Map();
  onStep(fmt === "pdf" ? "Writing the PDF…" : fmt === "docx" ? "Writing the Word document…" : "Writing the files…");
  const used = new Set(), ext = fmt === "docx" ? "docx" : fmt;
  const one = async (list, name, cover) => {
    if (fmt === "md") return new Blob([list.map(p => mdOf(p, nbs)).join("\n---\n\n")], { type: "text/markdown;charset=utf-8" });
    if (fmt === "pdf") { const { jsPDF } = await import("jspdf"); return pdfOf(jsPDF, list, { title: name, nbs, pics, cover }); }
    const D = await import("docx"); return docxOf(D, list, { title: name, nbs, pics, cover });
  };
  if (separate) {
    const files = [];
    for (const p of pages) { files.push([fname(p.title, used, ext), await one([p], p.title || "Untitled", false)]); onStep(`Writing ${files.length} of ${pages.length}…`); }
    save(await zipOf(files), `${fname(`${title} · ${today()}`, new Set(), "zip")}`);
  } else {
    const multi = pages.length > 1;
    save(await one(pages, title, multi), fname(multi ? `${title} · ${today()}` : pages[0].title, used, ext));
  }
  return pages.length;
}
