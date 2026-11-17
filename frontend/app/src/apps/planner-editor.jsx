// Hyperplane Planner — the note editor (its own chunk: TipTap is fetched only when a note is first opened).
// Blocks: headings, lists, check lists, quotes, code, tables, pictures, dividers and links to other notes ([[ … ]]). "/" opens the
// block menu. Every change is saved by itself a moment later (with the page's version number, so two windows never overwrite each other
// without asking). Pictures are made smaller here, then stored on the server as the customer's own private files.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, Extension, Node, mergeAttributes, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { TableKit } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { Highlight } from "@tiptap/extension-highlight";
import { Suggestion } from "@tiptap/suggestion";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import { NodeSelection, PluginKey, Selection } from "@tiptap/pm/state";
import { DOMParser as PMParser } from "@tiptap/pm/model";
import { api } from "../core.jsx";
import { KATEX, MathPanel, fromMathHtml, hasMath, mathContent } from "./planner-math.jsx";
import { DateChip, Float, Menu, Modal, NbDot, PI, TagBox, TEMPLATES, ago, clean, dayOfTs, dayShort, docString, tplDoc } from "./planner-lib.jsx";

// ── a link to another note: an inline chip that keeps the note's number (the label follows the note's title when it is opened)
const PageLink = Node.create({
  name: "pageLink", group: "inline", inline: true, atom: true, selectable: true,
  addAttributes() {
    return { id: { default: null, parseHTML: el => Number(el.getAttribute("data-id")) || null, renderHTML: a => ({ "data-id": a.id }) },
      label: { default: "", parseHTML: el => el.textContent || "", renderHTML: () => ({}) } };
  },
  parseHTML() { return [{ tag: "a[data-page-link]" }]; },
  renderHTML({ node, HTMLAttributes }) { return ["a", mergeAttributes(HTMLAttributes, { "data-page-link": "", class: "pl-plink", href: `#note-${node.attrs.id}` }), node.attrs.label || "Untitled"]; },
  renderText({ node }) { return node.attrs.label || "Untitled"; },
});

// "/" and "[[" menus: the plugin reports to a small React menu through `hub` (a ref the component fills in)
const menuExt = (name, char, hub, extra) => Extension.create({
  name,
  addProseMirrorPlugins() {
    return [Suggestion({
      editor: this.editor, char, pluginKey: new PluginKey(name), ...extra,
      items: ({ query }) => hub.current.items(name, query),
      command: ({ editor, range, props }) => props.run(editor, range),
      render: () => ({ onStart: p => hub.current.show(name, p), onUpdate: p => hub.current.show(name, p),
        onKeyDown: ({ event }) => hub.current.key(name, event), onExit: () => hub.current.hide(name) }),
    })];
  },
});

// after a paste (or a new formula) that ends on a formula, the cursor goes just after it — so the next key never replaces it
const caretAfterMath = view => {
  const sel = view.state.selection;
  if (sel instanceof NodeSelection && /Math$/.test(sel.node.type.name)) view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(sel.to), 1)));
};
const keepImg = html => html.replace(/<img\b[^>]*>/gi, m => /src=["']\/app\/api\/planner\/files\/\d+["']/i.test(m) ? m : "");

const walk = (n, fn) => { fn(n); (n.content || []).forEach(c => walk(c, fn)); };
const linkIds = doc => { const s = new Set(); walk(doc, n => { if (n.type === "pageLink" && n.attrs && n.attrs.id) s.add(n.attrs.id); }); return [...s]; };

// a picture → at most 1600 px on its longer side, WebP (or JPEG where WebP is missing); small PNG / JPEG / WebP files stay as they are
const readUrl = file => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error("That picture could not be read")); r.readAsDataURL(file); });
const loadImg = src => new Promise((ok, no) => { const i = new window.Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("That picture could not be read")); i.src = src; });
async function shrink(file) {
  if (!/^image\//.test(file.type)) throw new Error("Only pictures can be added");
  const url = await readUrl(file), img = await loadImg(url);
  let w = img.naturalWidth, h = img.naturalHeight;
  if (/^data:image\/(png|jpeg|webp);/.test(url) && Math.max(w, h) <= 1600 && file.size <= 700_000) return url;
  let max = 1600, q = 0.86, out = "";
  for (let i = 0; i < 6; i++) {
    const s = Math.min(1, max / Math.max(w, h)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL("image/webp", q); if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", q);
    if (out.length < 2_600_000) return out;
    max = Math.round(max * 0.75); q = Math.max(0.6, q - 0.08);
  }
  throw new Error("That picture is too big — please use one under 2 MB");
}

const SLASH = (pick, formula) => [
  { k: "text", t: "Text", s: "Plain writing", icon: "pen", run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { k: "h1", t: "Heading 1", s: "A big section title", txt: "H1", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { k: "h2", t: "Heading 2", s: "A section title", txt: "H2", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { k: "h3", t: "Heading 3", s: "A small title", txt: "H3", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { k: "bullet", t: "Bulleted list", s: "Points", icon: "list", run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { k: "number", t: "Numbered list", s: "Steps 1, 2, 3", icon: "olist", run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { k: "todo", t: "Check list", s: "Things to tick off", icon: "tlist", run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { k: "quote", t: "Quote", s: "Set a line apart", icon: "quote", run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { k: "code", t: "Code", s: "Fixed-width text", icon: "codeblock", run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { k: "table", t: "Table", s: "Rows and columns", icon: "table", run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { k: "divider", t: "Divider", s: "A line across", icon: "divider", run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { k: "image", t: "Picture", s: "From your device — or just paste one", icon: "image", run: (e, r) => { e.chain().focus().deleteRange(r).run(); pick(); } },
  { k: "link", t: "Link to a note", s: "Type [[ anywhere", icon: "notelink", run: (e, r) => e.chain().focus().deleteRange(r).insertContent("[[").run() },
  { k: "formula", t: "Formula", s: "π, Σ, fractions — LaTeX, in the line", icon: "sigma", run: (e, r) => { e.chain().focus().deleteRange(r).run(); formula("inline"); } },
  { k: "formulablock", t: "Formula block", s: "A formula on its own line", icon: "sigma", run: (e, r) => { e.chain().focus().deleteRange(r).run(); formula("block"); } },
  ...TEMPLATES.map(x => ({ k: `tpl-${x.k}`, t: x.t, s: "Template", icon: x.icon, run: (e, r) => e.chain().focus().deleteRange(r).insertContent(tplDoc(x.k).content).run() })),
];

export default function PlannerEditor(props) {
  const { meta, onOut, ops } = props;
  const [page, setPage] = useState(null); const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    api(`/app/api/planner/pages/${meta.id}`).then(p => { if (live) setPage(p); }).catch(e => { if (e.status === 401) onOut(e.message); else if (live) setErr(e.message); });
    return () => { live = false; };
  }, [meta.id]);
  if (err) return <div className="pl-wait"><PI n="alert"/> {err} <button type="button" className="px-btn" onClick={ops.back}>Back</button></div>;
  if (!page) return <div className="pl-wait">Opening the note…</div>;
  return <Inner {...props} page={page}/>;
}

function Inner({ meta, page, st, today, nbs, ops, wide, setWide, allTags, onOut, reload }) {
  const S = useRef({ rev: page.rev, title: page.title || "", dirty: false, saving: false, timer: null, retry: 0, conflict: false });
  const opsRef = useRef(ops); opsRef.current = ops;
  const stRef = useRef(st); stRef.current = st;
  const [title, setTitle] = useState(page.title || "");
  const [status, setStatus] = useState("saved"); const [msg, setMsg] = useState("");
  const [menu, setMenu] = useState(null); const menuRef = useRef(null); menuRef.current = menu;
  const [linkBox, setLinkBox] = useState(null); const [modal, setModal] = useState(null); const [ups, setUps] = useState(0);
  const [math, setMath] = useState(null); const mathRef = useRef(null);       // the formula being written or changed
  const fileRef = useRef(null), edRef = useRef(null), hub = useRef(null), titleRef = useRef(null), body = useRef(null);
  const trashed = !!meta.trashed;

  // the labels of note links follow the titles of today
  const doc = useMemo(() => {
    const d = JSON.parse(JSON.stringify(page.doc || { type: "doc", content: [] }));
    walk(d, n => { if (n.type === "pageLink" && n.attrs) { const p = st.pages.find(x => x.id === n.attrs.id); if (p) n.attrs.label = p.title || "Untitled"; } });
    if (!d.content || !d.content.length) d.content = [{ type: "paragraph" }];
    return d;
  }, [page]);

  // ── saving
  const flush = async () => {
    const s = S.current, e = edRef.current; clearTimeout(s.timer);
    if (!s.dirty || s.saving || s.conflict || !e) return;
    s.saving = true; s.dirty = false; setStatus("saving");
    const json = e.getJSON();
    try {
      const m = await api(`/app/api/planner/pages/${meta.id}`, { method: "PUT", json: { title: clean(s.title).trim().slice(0, 200), doc: docString(json), rev: s.rev } });
      s.rev = m.rev; s.retry = 0; opsRef.current.page.meta(m); opsRef.current.page.links(meta.id, linkIds(json));
      if (!s.dirty) { setStatus("saved"); setMsg(""); }
    } catch (x) {
      if (x.status === 409) { s.conflict = true; setStatus("conflict"); }
      else if (x.status === 401) onOut(x.message);
      else if (x.status === 413 || x.status === 422) { setStatus("error"); setMsg(x.message); }
      else { s.dirty = true; s.retry += 1; setStatus("error"); setMsg("Not saved yet — trying again"); s.timer = setTimeout(() => { s.timer = null; flush(); }, Math.min(30000, 3000 * s.retry)); }
    } finally {
      s.saving = false;
      if (s.dirty && !s.conflict && !s.timer) later(700);
    }
  };
  const later = (ms = 1200) => { const s = S.current; clearTimeout(s.timer); s.timer = setTimeout(() => { s.timer = null; flush(); }, ms); };
  const touch = () => { if (trashed) return; S.current.dirty = true; setStatus("dirty"); later(); };
  // leaving the note (another note, closing it, leaving the page) saves what is left
  useEffect(() => {
    const out = () => {
      const s = S.current, e = edRef.current;
      if (!s.dirty || s.conflict || !e) return;
      const b = JSON.stringify({ title: clean(s.title).trim().slice(0, 200), doc: docString(e.getJSON()), rev: s.rev });
      try { fetch(`/app/api/planner/pages/${meta.id}`, { method: "PUT", credentials: "same-origin", keepalive: b.length < 60000, headers: { "content-type": "application/json" }, body: b }); } catch { /* the page is going away */ }
      s.dirty = false;
    };
    const vis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", out); document.addEventListener("visibilitychange", vis);
    // closing the note: what is left is read now (the editor goes away) and sent once any save on its way has finished
    const last = () => {
      const s = S.current, e = edRef.current; clearTimeout(s.timer);
      if (!s.dirty || s.conflict || !e) return;
      const json = e.getJSON(), title = clean(s.title).trim().slice(0, 200); s.dirty = false;
      const send = () => s.saving ? setTimeout(send, 150) : api(`/app/api/planner/pages/${meta.id}`, { method: "PUT", json: { title, doc: docString(json), rev: s.rev } })
        .then(m => { opsRef.current.page.meta(m); opsRef.current.page.links(meta.id, linkIds(json)); })
        .catch(x => opsRef.current.say(x.status === 409 ? "The note was changed in another window — your last change was not saved" : x.message, true));
      send();
    };
    return () => { window.removeEventListener("pagehide", out); document.removeEventListener("visibilitychange", vis); last(); };
  }, []);

  // ── pictures
  const addPictures = async (files, at) => {
    const list = [...files].filter(f => /^image\//.test(f.type)).slice(0, 10);
    if (!list.length) return false;
    setUps(n => n + list.length);
    for (const f of list) {
      try {
        const src = await shrink(f);
        const r = await api("/app/api/planner/files", { method: "POST", json: { image: src } });
        const e = edRef.current; if (!e) break;
        const pos = at != null ? Math.min(at, e.state.doc.content.size) : e.state.selection.to;
        e.chain().focus().insertContentAt(pos, { type: "image", attrs: { src: r.src, alt: clean(f.name || "").slice(0, 120) || null } }).run();
        at = null;
      } catch (x) { if (x.status === 401) { onOut(x.message); break; } opsRef.current.say(x.message, true); }
      finally { setUps(n => n - 1); }
    }
    return true;
  };

  // ── the "/" and "[[" menus
  // a formula: where it is (or goes), placed beside it on the screen
  const openMath = (kind, pos, latex, isNew) => {
    const e = edRef.current; if (!e || trashed) return;
    let c = { left: 120, bottom: 160 }; try { c = e.view.coordsAtPos(Math.min(pos, e.state.doc.content.size)); } catch { /* the default place */ }
    const w = Math.min(380, window.innerWidth - 24);
    setMath({ kind, pos, latex, isNew, style: { left: Math.max(12, Math.min(c.left, window.innerWidth - w - 12)), top: Math.max(12, Math.min(c.bottom + 8, window.innerHeight - 360)), width: w } });
  };
  mathRef.current = (node, pos, kind) => openMath(kind, pos, node.attrs.latex, false);
  const newMath = kind => { const e = edRef.current; if (e) openMath(kind, e.state.selection.from, "", true); };
  const saveMath = latex => {
    const e = edRef.current, m = math; setMath(null); if (!e || !m) return;
    if (m.isNew) { e.chain().focus().insertContentAt(m.pos, { type: m.kind === "block" ? "blockMath" : "inlineMath", attrs: { latex } }).run(); caretAfterMath(e.view); }
    else e.chain().focus().command(({ tr }) => { tr.setNodeMarkup(m.pos, undefined, { latex }); return true; }).run();
  };
  const dropMath = () => { const e = edRef.current, m = math; setMath(null); if (!e || !m) return;
    e.chain().focus().command(({ tr }) => { const n = tr.doc.nodeAt(m.pos); if (n) tr.delete(m.pos, m.pos + n.nodeSize); return true; }).run(); };
  const slash = useMemo(() => SLASH(() => fileRef.current && fileRef.current.click(), kind => newMath(kind)), []);
  hub.current = {
    items: (name, q) => {
      const w = (q || "").toLowerCase().trim();
      if (name === "plSlash") return slash.filter(c => !w || c.t.toLowerCase().includes(w) || c.k.includes(w)).slice(0, 14);
      const ps = stRef.current.pages.filter(p => !p.trashed && p.id !== meta.id && (!w || (p.title || "untitled").toLowerCase().includes(w)))
        .sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 8)
        .map(p => ({ k: `p${p.id}`, t: p.title || "Untitled", s: (nbs.get(p.nb) || {}).name, icon: "note",
          run: (e, r) => e.chain().focus().deleteRange(r).insertContent([{ type: "pageLink", attrs: { id: p.id, label: p.title || "Untitled" } }, { type: "text", text: " " }]).run() }));
      const name2 = clean(q || "").trim().slice(0, 200);
      if (name2 && !stRef.current.pages.some(p => !p.trashed && (p.title || "").toLowerCase() === name2.toLowerCase()))
        ps.push({ k: "new", t: `New note “${name2}”`, s: "Make it and link to it", icon: "newnote",
          run: async (e, r) => { e.chain().focus().deleteRange(r).run(); const m = await opsRef.current.page.create({ nb: meta.nb, title: name2, open: false });
            if (m) edRef.current && edRef.current.chain().focus().insertContent([{ type: "pageLink", attrs: { id: m.id, label: m.title || name2 } }, { type: "text", text: " " }]).run(); } });
      return ps;
    },
    show: (name, p) => setMenu(m => ({ name, items: p.items, rect: p.clientRect ? p.clientRect() : null, command: p.command, i: m && m.name === name ? Math.min(m.i, Math.max(0, p.items.length - 1)) : 0 })),
    hide: name => setMenu(m => m && m.name === name ? null : m),
    key: (name, ev) => {
      const m = menuRef.current; if (!m || m.name !== name) return false;
      if (ev.key === "Escape") { setMenu(null); return true; }
      if (!m.items.length) return false;
      if (ev.key === "ArrowDown") { setMenu({ ...m, i: (m.i + 1) % m.items.length }); return true; }
      if (ev.key === "ArrowUp") { setMenu({ ...m, i: (m.i + m.items.length - 1) % m.items.length }); return true; }
      if (ev.key === "Enter" || ev.key === "Tab") { m.command(m.items[m.i]); return true; }
      return false;
    },
  };

  const editor = useEditor({
    immediatelyRender: true, shouldRerenderOnTransaction: false, editable: !trashed, content: doc,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, dropcursor: { color: "var(--acc)", width: 2 },
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https", protocols: ["mailto"], HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } } }),
      TaskList, TaskItem.configure({ nested: true }), TableKit.configure({ table: { resizable: false } }),
      Image.configure({ inline: false, allowBase64: false }), Highlight.configure({ multicolor: false }), PageLink,
      Placeholder.configure({ placeholder: ({ node }) => node.type.name === "heading" ? "Heading" : "Write anything — type / for blocks, [[ to link a note, or paste a picture" }),
      InlineMath.configure({ katexOptions: KATEX, onClick: (node, pos) => mathRef.current(node, pos, "inline") }),
      BlockMath.configure({ katexOptions: { ...KATEX, displayMode: true }, onClick: (node, pos) => mathRef.current(node, pos, "block") }),
      CharacterCount, menuExt("plSlash", "/", hub, {}), menuExt("plLink", "[[", hub, { allowSpaces: true, allowedPrefixes: null }),
    ],
    editorProps: {
      attributes: { class: "pl-prose", id: "pl-prose", "aria-label": "The note", spellcheck: "true" },
      // a picture from the web is never stored as a link to someone else's server: paste the picture itself (a file)
      // a formula from ChatGPT / Claude / any page drawn with KaTeX or MathML → its TeX as a formula
      transformPastedHTML: html => keepImg(fromMathHtml(html)),
      handlePaste: (view, ev) => {
        const cd = ev.clipboardData; if (!cd) return false;
        const txt = cd.getData("text/plain"), html = cd.getData("text/html"), inCode = view.state.selection.$from.parent.type.name === "codeBlock";
        const sheet = !inCode && (/<table[\s>]/i.test(html || "") || (txt && /\t/.test(txt)));
        const fs = cd.files; if (!sheet && fs && [...fs].some(f => /^image\//.test(f.type))) { ev.preventDefault(); addPictures(fs); return true; }
        // cells from Excel / Google Sheets: a real table (from the sheet's HTML, or from the tab-separated text when there is none)
        if (sheet && !/<table[\s>]/i.test(html || "") && txt) {
          const rows = txt.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").slice(0, 500).map(l => l.split("\t").slice(0, 30));
          const w = Math.max(...rows.map(r => r.length));
          if (w > 1 || rows.length > 1) {
            ev.preventDefault();
            edRef.current.chain().focus().insertContent({ type: "table", content: rows.map(r => ({ type: "tableRow", content: Array.from({ length: w }, (_, i) => ({ type: "tableCell",
              content: [{ type: "paragraph", ...(clean(r[i] || "").trim() ? { content: [{ type: "text", text: clean(r[i]).trim() }] } : {}) }] })) })) }).run();
            return true;
          }
        }
        // formulas drawn with KaTeX / MathML (ChatGPT, Claude, the web): read at the level of the note, so a formula on its own line always fits
        if (html && !inCode && /katex|<math[\s>]/i.test(html)) {
          ev.preventDefault();
          const dom = new window.DOMParser().parseFromString(keepImg(fromMathHtml(html)), "text/html").body;
          view.dispatch(view.state.tr.replaceSelection(PMParser.fromSchema(view.state.schema).parseSlice(dom)).setMeta("uiEvent", "paste").scrollIntoView());
          caretAfterMath(view); return true;
        }
        // text with $…$ / $$…$$ (Claude's copy button, a Markdown file): the formulas become formulas
        if (txt && !html && !inCode && hasMath(txt)) {
          ev.preventDefault(); edRef.current.chain().focus().insertContent(mathContent(txt)).run(); caretAfterMath(view); return true; }
        if (txt && html && !inCode && hasMath(txt) && !/<(b|strong|em|i|h[1-6]|ul|ol|table|a)\b/i.test(html)) {
          ev.preventDefault(); edRef.current.chain().focus().insertContent(mathContent(txt)).run(); caretAfterMath(view); return true; }
        return false;
      },
      handleDrop: (view, ev, slice, moved) => {
        const fs = ev.dataTransfer && ev.dataTransfer.files;
        if (moved || !fs || ![...fs].some(f => /^image\//.test(f.type))) return false;
        ev.preventDefault(); const at = view.posAtCoords({ left: ev.clientX, top: ev.clientY }); addPictures(fs, at ? at.pos : null); return true;
      },
      // a note link opens that note (a click of any kind: mouse, touch, keyboard)
      handleDOMEvents: { click: (view, ev) => {
        const a = ev.target && ev.target.closest && ev.target.closest("a[data-page-link]");
        if (!a) return false;
        ev.preventDefault(); const id = Number(a.getAttribute("data-id"));
        if (stRef.current.pages.some(p => p.id === id && !p.trashed)) { flush(); opsRef.current.open(id); } else opsRef.current.say("That note is in the trash or was deleted", true);
        return true;
      } },
      handleKeyDown: (view, ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") { ev.preventDefault(); flush(); return true; } return false; },
    },
    onUpdate: () => touch(),
  }, []);
  edRef.current = editor;
  useEffect(() => { if (editor && editor.isEditable === trashed) editor.setEditable(!trashed, false); }, [trashed, editor]);
  // a new, empty note starts at its title
  useEffect(() => { if (!page.title && titleRef.current && !trashed) titleRef.current.focus(); }, []);

  const s = useEditorState({
    editor, selector: ({ editor: e }) => !e ? {} : ({
      b: e.isActive("bold"), i: e.isActive("italic"), u: e.isActive("underline"), st: e.isActive("strike"), hl: e.isActive("highlight"), c: e.isActive("code"),
      h1: e.isActive("heading", { level: 1 }), h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }),
      ul: e.isActive("bulletList"), ol: e.isActive("orderedList"), tl: e.isActive("taskList"), q: e.isActive("blockquote"), cb: e.isActive("codeBlock"),
      link: e.isActive("link"), href: e.getAttributes("link").href || "", table: e.isActive("table"),
      undo: e.can().undo(), redo: e.can().redo(), words: e.storage.characterCount ? e.storage.characterCount.words() : 0 }),
  }) || {};

  const setTitleNow = v => { setTitle(v); S.current.title = v; touch(); };
  const patch = ch => ops.page.patch(meta.id, ch);
  const nb = nbs.get(meta.nb);
  const back = st.links.filter(l => l[1] === meta.id).map(l => st.pages.find(p => p.id === l[0])).filter(p => p && !p.trashed);
  const chain = () => editor.chain().focus();
  const T = (k, icon, label, on, run, dis) => <button key={k} type="button" className={`pl-tb ${on ? "on" : ""}`} onMouseDown={e => e.preventDefault()} onClick={run} disabled={dis || trashed}
    aria-label={label} title={label} aria-pressed={on || undefined} data-tb={k}>{icon.startsWith("H") ? <b>{icon}</b> : <PI n={icon} s={16}/>}</button>;
  const keepMine = async () => {
    try { const p = await api(`/app/api/planner/pages/${meta.id}`); S.current.rev = p.rev; S.current.conflict = false; S.current.dirty = true; setStatus("dirty"); flush(); }
    catch (x) { ops.fail(x); }
  };
  const blocks = () => (editor.getJSON().content || []);
  const heads = lv => blocks().filter(b => b.type === "heading" && (b.attrs || {}).level === lv).length;
  const words = s.words || 0;

  return (
    <div className={`pl-ed ${trashed ? "ro" : ""}`} id="pl-ed" data-page={meta.id}>
      <div className="pl-edh">
        <button type="button" className="px-btn pl-back" onClick={() => { flush(); ops.back(); }} id="pl-ed-back"><PI n="back" s={15}/><span>Dashboard</span></button>
        <span className="pl-edcrumb">{nb && <NbDot nb={nb}/>}<em className={`pl-sv s-${status}`} id="pl-saved" role="status">
          {status === "saving" ? "Saving…" : status === "dirty" ? "Editing" : status === "conflict" ? "Changed elsewhere" : status === "error" ? (msg || "Not saved") : `Saved · ${ago(meta.updated)}`}</em></span>
        <span className="pl-sp"/>
        <button type="button" className={`pl-ib ${meta.pinned ? "on" : ""}`} onClick={() => patch({ pinned: !meta.pinned })} aria-pressed={meta.pinned} title={meta.pinned ? "Unpin" : "Pin to the top"} aria-label="Pin" disabled={trashed} id="pl-ed-pin"><PI n="pin"/></button>
        <button type="button" className="pl-ib pl-dk" onClick={() => setWide(!wide)} title={wide ? "Show the notebooks" : "Wide — hide the notebooks"} aria-label="Wide" id="pl-ed-wide"><PI n={wide ? "narrow" : "wide"}/></button>
        <Menu icon="more" title="More" align="right" id="pl-ed-more" items={[
          { label: "Download this note", icon: "download", id: "pl-ed-export", run: () => { flush(); ops.exportOf("page"); } },
          { label: "Duplicate", icon: "copy", id: "pl-ed-copy", disabled: trashed, run: async () => { await flush(); ops.page.copy(meta.id); } },
          { label: "Split into notes…", icon: "split", id: "pl-ed-split", disabled: trashed, run: () => setModal("split") },
          { label: "Merge with other notes…", icon: "merge", id: "pl-ed-merge", disabled: trashed, run: () => setModal("merge") },
          "-",
          trashed ? { label: "Restore", icon: "restore", run: () => ops.page.restore(meta.id) } : { label: "Move to the trash", icon: "trash", danger: true, id: "pl-ed-trash", run: async () => { await flush(); ops.page.trash(meta.id); } },
        ]}/>
      </div>

      <div className="pl-edb" ref={body}>
        {trashed && <div className="pl-warn" id="pl-ed-trashed"><PI n="trash" s={16}/><span>This note is in the trash.</span><span className="pl-sp"/>
          <button type="button" className="px-btn" onClick={() => ops.page.restore(meta.id)}>Restore</button>
          <button type="button" className="px-btn danger" onClick={() => ops.page.remove(meta.id)}>Delete for good</button></div>}
        {status === "conflict" && <div className="pl-warn" id="pl-conflict"><PI n="alert" s={16}/><span>This note was changed in another window. Load the latest version, or keep what you have here.</span>
          <span className="pl-sp"/><button type="button" className="px-btn" onClick={reload} id="pl-conflict-load">Load the latest</button>
          <button type="button" className="px-btn primary" onClick={keepMine} id="pl-conflict-keep">Keep mine</button></div>}

        <textarea ref={titleRef} className="pl-title" value={title} placeholder="Untitled" rows={1} maxLength={200} aria-label="Title" id="pl-title" readOnly={trashed}
          onChange={e => setTitleNow(e.target.value.replace(/\n/g, " "))} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); editor && editor.commands.focus("start"); } }}
          onInput={e => { e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }}/>

        <div className="pl-props" id="pl-props">
          <label className="pl-prop"><span>Notebook</span><select value={meta.nb} onChange={e => patch({ notebook_id: Number(e.target.value) })} disabled={trashed} id="pl-ed-nb" data-c={nb && nb.color}>
            {st.notebooks.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
          <div className="pl-prop" title="A note with a date shows on that day in the Calendar; without one it is a common note"><span>Date</span>
            <DateChip value={meta.day} today={today} empty="None — a common note" label="Date" onChange={d => patch({ day: d })} clear disabled={trashed} id="pl-ed-day"/></div>
          <div className="pl-prop wide"><span>Topics</span><TagBox value={meta.tags} onChange={tags => patch({ tags })} all={allTags} max={st.limits.tags} id="pl-ed-tags"/></div>
        </div>

        {!trashed && <div className="pl-toolbar" role="toolbar" aria-label="Formatting" id="pl-toolbar">
          {T("h1", "H1", "Heading 1", s.h1, () => chain().toggleHeading({ level: 1 }).run())}
          {T("h2", "H2", "Heading 2", s.h2, () => chain().toggleHeading({ level: 2 }).run())}
          {T("h3", "H3", "Heading 3", s.h3, () => chain().toggleHeading({ level: 3 }).run())}
          <i className="pl-tsep"/>
          {T("bold", "bold", "Bold (Ctrl B)", s.b, () => chain().toggleBold().run())}
          {T("italic", "italic", "Italic (Ctrl I)", s.i, () => chain().toggleItalic().run())}
          {T("underline", "underline", "Underline (Ctrl U)", s.u, () => chain().toggleUnderline().run())}
          {T("strike", "strike", "Strike through", s.st, () => chain().toggleStrike().run())}
          {T("highlight", "highlight", "Highlight", s.hl, () => chain().toggleHighlight().run())}
          {T("code", "code", "Code", s.c, () => chain().toggleCode().run())}
          <i className="pl-tsep"/>
          {T("ul", "list", "Bulleted list", s.ul, () => chain().toggleBulletList().run())}
          {T("ol", "olist", "Numbered list", s.ol, () => chain().toggleOrderedList().run())}
          {T("tl", "tlist", "Check list", s.tl, () => chain().toggleTaskList().run())}
          {T("quote", "quote", "Quote", s.q, () => chain().toggleBlockquote().run())}
          {T("codeblock", "codeblock", "Code block", s.cb, () => chain().toggleCodeBlock().run())}
          <i className="pl-tsep"/>
          {T("table", "table", "Table", s.table, () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), s.table)}
          {T("image", "image", "Picture", false, () => fileRef.current && fileRef.current.click())}
          {T("link", "link", "Web link", s.link, () => setLinkBox({ href: s.href || "" }))}
          {T("notelink", "notelink", "Link to a note ([[)", false, () => chain().insertContent("[[").run())}
          {T("math", "sigma", "Formula — π, Σ, fractions (LaTeX)", false, () => newMath("inline"))}
          {T("hr", "divider", "Divider", false, () => chain().setHorizontalRule().run())}
          <i className="pl-tsep"/>
          {T("undo", "undo", "Undo (Ctrl Z)", false, () => chain().undo().run(), !s.undo)}
          {T("redo", "redo", "Redo (Ctrl Y)", false, () => chain().redo().run(), !s.redo)}
        </div>}
        {!trashed && s.table && <div className="pl-tblbar" id="pl-tblbar">
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => chain().addRowAfter().run()}>+ Row</button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => chain().addColumnAfter().run()}>+ Column</button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => chain().deleteRow().run()}>Remove row</button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => chain().deleteColumn().run()}>Remove column</button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => chain().toggleHeaderRow().run()}>Header row</button>
          <button type="button" className="danger" onMouseDown={e => e.preventDefault()} onClick={() => chain().deleteTable().run()}>Delete table</button></div>}
        {!trashed && s.link && !linkBox && <div className="pl-tblbar" id="pl-linkbar"><span className="pl-lnk">{s.href}</span>
          <a href={/^(https?:|mailto:)/i.test(s.href) ? s.href : undefined} target="_blank" rel="noopener noreferrer nofollow">Open</a>
          <button type="button" onClick={() => setLinkBox({ href: s.href })}>Edit</button><button type="button" onClick={() => chain().extendMarkRange("link").unsetLink().run()}>Remove</button></div>}
        {linkBox && <form className="pl-linkbox" id="pl-linkbox" onSubmit={e => {
          e.preventDefault(); let h = linkBox.href.trim(); if (h && !/^(https?:\/\/|mailto:)/i.test(h)) h = `https://${h}`;
          if (!h) chain().extendMarkRange("link").unsetLink().run(); else if (/^(https?:\/\/|mailto:)[^\s<>"'`]+$/i.test(h)) chain().extendMarkRange("link").setLink({ href: h }).run(); else { ops.say("That is not a web address", true); return; }
          setLinkBox(null); }}>
          <PI n="link" s={15}/><input autoFocus value={linkBox.href} onChange={e => setLinkBox({ href: e.target.value })} placeholder="https://…" aria-label="Web address" maxLength={2000}/>
          <button type="submit" className="px-btn primary">Apply</button><button type="button" className="px-btn" onClick={() => setLinkBox(null)}>Cancel</button></form>}

        <EditorContent editor={editor} className="pl-ec"/>
        {ups > 0 && <div className="pl-up" role="status" id="pl-uploading"><span className="pl-spin"/>Adding {ups === 1 ? "a picture" : `${ups} pictures`}…</div>}

        {back.length > 0 && <div className="pl-back2" id="pl-backlinks"><h4><PI n="notelink" s={15}/>Linked from</h4>
          <div>{back.map(p => <button key={p.id} type="button" className="pl-chip lnk" onClick={() => { flush(); ops.open(p.id); }} data-page={p.id}>{p.title || "Untitled"}</button>)}</div></div>}
        <div className="pl-edf"><span>{words} word{words === 1 ? "" : "s"}</span>{meta.imgs > 0 && <span>{meta.imgs} picture{meta.imgs === 1 ? "" : "s"}</span>}
          <span>Written {dayShort(dayOfTs(meta.created), today)}</span></div>
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={e => { addPictures(e.target.files); e.target.value = ""; }}/>
      {menu && menu.rect && <SuggestMenu menu={menu} setMenu={setMenu}/>}
      {math && <MathPanel key={`${math.pos}:${math.isNew}`} math={math} onSave={saveMath} onRemove={dropMath} onClose={() => setMath(null)}/>}
      {modal === "split" && <SplitModal heads={heads} cursor={editor ? editor.state.selection.$from.index(0) : 0} count={blocks().length}
        onClose={() => setModal(null)} go={async b => { await flush(); if (S.current.dirty || S.current.conflict) { ops.say("Wait until the note is saved", true); return false; } return ops.page.split(meta.id, b); }}/>}
      {modal === "merge" && <PickModal st={st} nbs={nbs} self={meta.id} max={st.limits.merge - 1} onClose={() => setModal(null)} go={async ids => { await flush(); setModal(null); ops.merge([meta.id, ...ids]); }}/>}
    </div>);
}

function SuggestMenu({ menu, setMenu }) {
  const r = menu.rect, vw = window.innerWidth, vh = window.innerHeight, w = Math.min(300, vw - 24);
  const below = r.bottom + 330 < vh || r.top < 330;
  const style = { left: Math.max(12, Math.min(r.left, vw - w - 12)), width: w, ...(below ? { top: r.bottom + 6 } : { bottom: vh - r.top + 6 }) };
  const ref = useRef(null);
  useEffect(() => { const el = ref.current && ref.current.querySelector(".on"); if (el) el.scrollIntoView({ block: "nearest" }); }, [menu.i]);
  return (
    <Float><div className="pl-sug" style={style} ref={ref} role="listbox" id={menu.name === "plSlash" ? "pl-slash" : "pl-linkmenu"} onMouseDown={e => e.preventDefault()}>
      {menu.name === "plLink" && <div className="pl-mhead">Link to a note</div>}
      {!menu.items.length && <div className="pl-empty s">{menu.name === "plLink" ? "Type a title" : "No block with that name"}</div>}
      {menu.items.map((it, i) => <button key={it.k} type="button" role="option" aria-selected={i === menu.i} className={i === menu.i ? "on" : ""} data-cmd={it.k}
        onMouseEnter={() => setMenu(m => m && { ...m, i })} onClick={() => menu.command(it)}>
        <span className="pl-sgi">{it.txt ? <b>{it.txt}</b> : <PI n={it.icon} s={16}/>}</span><span><b>{it.t}</b>{it.s && <small>{it.s}</small>}</span></button>)}
    </div></Float>);
}

function SplitModal({ heads, cursor, count, onClose, go }) {
  const levels = [1, 2, 3].map(l => [l, heads(l)]).filter(x => x[1] > 0);
  const [mode, setMode] = useState(levels.length ? `h${levels[0][0]}` : "at"); const [trash, setTrash] = useState(false); const [busy, setBusy] = useState(false);
  const canAt = cursor > 0 && cursor < count;
  const run = async () => {
    setBusy(true);
    const r = await go(mode === "at" ? { mode: "at", index: cursor } : { mode: "heading", level: Number(mode.slice(1)), trash_source: trash });
    setBusy(false); if (r) onClose();
  };
  return (
    <Modal title="Split this note" sub="Long note? Make several shorter ones. The pictures, topics and notebook go with each part." onClose={onClose} id="pl-split-modal"
      foot={<><span className="pl-sp"/><button type="button" className="px-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="px-btn primary" onClick={run} disabled={busy || (mode === "at" ? !canAt : !levels.length)} id="pl-split-go"><PI n="split" s={15}/>Split</button></>}>
      <div className="pl-radios col">
        {levels.map(([l, n]) => <label key={l} className={`pl-radio ${mode === `h${l}` ? "on" : ""}`}><input type="radio" name="pl-split" checked={mode === `h${l}`} onChange={() => setMode(`h${l}`)} data-split={`h${l}`}/>
          <span><b>A new note for every Heading {l}</b><small>{n} heading{n === 1 ? "" : "s"} → {n} new note{n === 1 ? "" : "s"}, each named after its heading</small></span></label>)}
        <label className={`pl-radio ${mode === "at" ? "on" : ""} ${canAt ? "" : "off"}`}><input type="radio" name="pl-split" checked={mode === "at"} onChange={() => setMode("at")} disabled={!canAt} data-split="at"/>
          <span><b>At the cursor</b><small>{canAt ? "Everything from the line with the cursor moves to a new note; this note keeps the part above." : "Click on the line where the new note should start, then open Split again."}</small></span></label>
      </div>
      {mode !== "at" && <label className="pl-chk"><input type="checkbox" checked={trash} onChange={e => setTrash(e.target.checked)} id="pl-split-trash"/>Move this note to the trash afterwards</label>}
    </Modal>);
}

function PickModal({ st, nbs, self, max, onClose, go }) {
  const [q, setQ] = useState(""); const [sel, setSel] = useState([]);
  const w = q.toLowerCase().trim();
  const list = st.pages.filter(p => !p.trashed && p.id !== self && (!w || (p.title || "untitled").toLowerCase().includes(w))).sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 60);
  return (
    <Modal title="Merge with other notes" sub="Pick the notes to add after this one; you can change the order next." onClose={onClose} id="pl-pick-modal"
      foot={<><span className="pl-muted pl-grow">{sel.length} picked</span><button type="button" className="px-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="px-btn primary" disabled={!sel.length} onClick={() => go(sel)} id="pl-pick-go">Next</button></>}>
      <input className="pl-in" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a note" aria-label="Find a note"/>
      <div className="pl-picks">{list.map(p => <label key={p.id} className="pl-pickr"><input type="checkbox" checked={sel.includes(p.id)} disabled={!sel.includes(p.id) && sel.length >= max}
        onChange={() => setSel(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])} data-pick={p.id}/><span className="pl-rt">{p.title || "Untitled"}</span><NbDot nb={nbs.get(p.nb)} s/></label>)}</div>
    </Modal>);
}
