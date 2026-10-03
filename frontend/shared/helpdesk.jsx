// Helpdesk — shared by the dashboard (src/server.jsx) and the customer edition (app/src/main.jsx).
// It only talks to the helpdesk API it is given (`base`) and holds no trading logic, so the customer bundle can use it.
// Messages travel as plain blocks [{t:"text",v}, {t:"img",src|id}] and are rendered as text — never as HTML.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export const SEV = { high: ["High", "#ff4454"], medium: ["Medium", "#ffaa00"], low: ["Low", "#00c896"] };
const MAX_IMAGES = 3, MAX_BYTES = 1_100_000, MAX_SIDE = 1600;

const fmt = iso => {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const opt = { timeZone: "Asia/Kolkata" };
  const day = d.toLocaleDateString("en-IN", { ...opt, day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("en-IN", { ...opt, hour: "2-digit", minute: "2-digit", hour12: true });
  return day === now.toLocaleDateString("en-IN", { ...opt, day: "2-digit", month: "short" }) ? time : `${day}, ${time}`;
};

// ─── images: re-drawn on a canvas (strips metadata, normalises the format, keeps them small) ───
const readUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const bytesOf = url => (url.length - url.indexOf(",") - 1) * 0.75;
async function shrink(file) {
  const img = await loadImg(await readUrl(file));
  let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const draw = (s, white) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const g = c.getContext("2d"); if (white) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(img, 0, 0, c.width, c.height); return c;
  };
  if (file.type === "image/png") { const url = draw(scale, false).toDataURL("image/png"); if (bytesOf(url) <= MAX_BYTES) return url; }
  for (const q of [0.88, 0.8, 0.7, 0.62, 0.55, 0.5]) {
    const url = draw(scale, true).toDataURL("image/jpeg", q);
    if (bytesOf(url) <= MAX_BYTES) return url;
    if (q <= 0.7) scale *= 0.75;
  }
  throw new Error("too big");
}

// contenteditable -> blocks
function toBlocks(root) {
  const out = []; let buf = "";
  const flush = () => { if (buf) { out.push({ t: "text", v: buf }); buf = ""; } };
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) buf += c.nodeValue.replace(/ /g, " ");
      else if (c.nodeName === "BR") buf += "\n";
      else if (c.nodeName === "IMG") { const s = c.getAttribute("src") || ""; if (s.startsWith("data:image/")) { flush(); out.push({ t: "img", src: s }); } }
      else if (c.nodeType === 1) {
        const block = /^(DIV|P|LI|H\d|BLOCKQUOTE|PRE)$/.test(c.nodeName);
        if (block && buf && !buf.endsWith("\n")) buf += "\n";
        walk(c);
        if (block && buf && !buf.endsWith("\n")) buf += "\n";
      }
    }
  };
  walk(root); flush();
  return out;
}
const hasContent = blocks => blocks.some(b => b.t === "img" || b.v.trim());

// ─── the "email body": type, paste or drop screenshots; everything else is pasted as plain text ───
const RichBox = forwardRef(function RichBox({ placeholder, minHeight = 160, onError, onSubmit }, ref) {
  const el = useRef(null);
  const [empty, setEmpty] = useState(true);
  const sync = () => setEmpty(!el.current || (!el.current.textContent.trim() && !el.current.querySelector("img")));
  const insert = node => {
    const root = el.current; root.focus();
    const sel = window.getSelection();
    let range = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!range || !root.contains(range.commonAncestorContainer)) { range = document.createRange(); range.selectNodeContents(root); range.collapse(false); }
    range.deleteContents(); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
    sel.removeAllRanges(); sel.addRange(range);
  };
  const addFiles = async files => {
    for (const f of files) {
      if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(f.type)) { onError("Only images can be added — files are not allowed"); continue; }
      if (el.current.querySelectorAll("img").length >= MAX_IMAGES) { onError(`Up to ${MAX_IMAGES} images per message`); break; }
      if (f.size > 25e6) { onError("That image is too large"); continue; }
      try {
        const img = document.createElement("img"); img.src = await shrink(f); img.alt = "image"; img.className = "hd-inl";
        insert(img); insert(document.createElement("br")); onError("");
      } catch { onError("That image could not be read"); }
    }
    sync();
  };
  useImperativeHandle(ref, () => ({ blocks: () => toBlocks(el.current), clear: () => { el.current.innerHTML = ""; sync(); }, addFiles, focus: () => el.current.focus() }));
  const onPaste = e => {
    e.preventDefault();
    const files = [...(e.clipboardData.files || [])];
    if (files.length) { addFiles(files); return; }
    const t = e.clipboardData.getData("text/plain");
    if (t) document.execCommand("insertText", false, t);
  };
  const onDrop = e => {
    e.preventDefault();
    const files = [...(e.dataTransfer.files || [])];
    if (files.length) addFiles(files);
    else { const t = e.dataTransfer.getData("text/plain"); if (t) document.execCommand("insertText", false, t); }
  };
  return (
    <div className="hd-rich-wrap">
      <div ref={el} className="hd-rich" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={placeholder}
        style={{ minHeight }} onInput={sync} onPaste={onPaste} onDrop={onDrop} onDragOver={e => e.preventDefault()}
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit && onSubmit(); } }} />
      {empty && <div className="hd-ph">{placeholder}</div>}
    </div>
  );
});

function ImageBtn({ onFiles, label = "Insert image" }) {
  const inp = useRef(null);
  return <>
    <button type="button" className="hd-btn ghost" onClick={() => inp.current.click()} title="Add a screenshot or picture (PNG, JPEG, WebP)">🖼 {label}</button>
    <input ref={inp} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { onFiles([...e.target.files]); e.target.value = ""; }} />
  </>;
}

const SevChip = ({ s }) => <span className="hd-sevchip" style={{ color: SEV[s][1], borderColor: SEV[s][1] + "66", background: SEV[s][1] + "14" }}>● {SEV[s][0]}</span>;
const StatusChip = ({ s }) => <span className={`hd-stchip ${s}`}>{s === "open" ? "Open" : "Closed"}</span>;

// ─── unread counts (inbox) — one poll shared by the bell and the tab badge ───
export function useHelpdeskUnread(api, base, enabled = true) {
  const [u, setU] = useState({ total: 0, items: [] });
  const apiRef = useRef(api); apiRef.current = api;
  const refresh = useCallback(() => apiRef.current(`${base}/unread`).then(r => r && setU(r)).catch(() => {}), [base]);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 30000);
    const v = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [refresh, enabled]);
  useEffect(() => {
    const plain = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = u.total ? `(${u.total > 99 ? "99+" : u.total}) ${plain}` : plain;
  }, [u.total]);
  return { ...u, refresh };
}

export function InboxBell({ unread, onOpen }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  return (
    <div className="hd-bell-wrap" ref={ref}>
      <style>{HD_CSS}</style>
      <button type="button" className={`hd-bell ${unread.total ? "on" : ""}`} onClick={() => setOpen(v => !v)} title="Helpdesk inbox" aria-label={`Helpdesk inbox, ${unread.total} new`}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        {unread.total > 0 && <span className="hd-bell-n">{unread.total > 99 ? "99+" : unread.total}</span>}
      </button>
      {open && (
        <div className="hd-bell-pop" role="menu">
          <div className="hd-bell-h">Helpdesk inbox <span>{unread.total ? `${unread.total} new` : "all caught up"}</span></div>
          {unread.items.length ? unread.items.map(it => (
            <button key={it.id} type="button" className="hd-bell-it" onClick={() => { setOpen(false); onOpen(it.id); }}>
              <span className="dot" style={{ background: SEV[it.severity] ? SEV[it.severity][1] : "var(--acc)" }} />
              <span className="t">{it.subject}</span>
              <span className="n">{it.n} new</span>
              <span className="at">{fmt(it.at)}</span>
            </button>
          )) : <div className="hd-bell-empty">No new messages</div>}
          <button type="button" className="hd-bell-all" onClick={() => { setOpen(false); onOpen(null); }}>Open helpdesk →</button>
        </div>
      )}
    </div>
  );
}

// ─── new query: written like an email ───
function Compose({ api, base, onSent, onCancel }) {
  const [subject, setSubject] = useState(""); const [sev, setSev] = useState("medium");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const box = useRef(null);
  const send = async () => {
    if (busy) return;
    const body = box.current.blocks();
    if (subject.trim().length < 3) { setMsg("Please write a subject"); return; }
    if (!hasContent(body)) { setMsg("Please describe your query"); return; }
    setBusy(true); setMsg("");
    try { const r = await api(`${base}/tickets`, { method: "POST", json: { subject: subject.trim(), severity: sev, body } }); onSent(r.id); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="hd-compose">
      <div className="hd-compose-h"><span>New query</span><button type="button" className="hd-x" onClick={onCancel} aria-label="Discard">✕</button></div>
      <div className="hd-field"><label>To</label><span className="hd-to"><span className="hd-to-av">Q</span>QuantFriday Helpdesk</span></div>
      <div className="hd-field"><label htmlFor="hd-subj">Subject</label><input id="hd-subj" maxLength={150} value={subject} onChange={e => setSubject(e.target.value)} placeholder="A short summary of your query" autoFocus /></div>
      <div className="hd-field"><label>Severity</label>
        <div className="hd-sev" role="radiogroup">{Object.entries(SEV).map(([k, [l, c]]) => (
          <button key={k} type="button" role="radio" aria-checked={sev === k} className={sev === k ? "on" : ""} style={sev === k ? { borderColor: c, color: c, background: c + "1a" } : null} onClick={() => setSev(k)}>
            <span className="dot" style={{ background: c }} />{l}</button>))}
        </div>
        <span className="hd-sev-help">{sev === "high" ? "Something is broken or blocking you" : sev === "medium" ? "Something is not working as expected" : "A question or a suggestion"}</span>
      </div>
      <div className="hd-compose-body">
        <RichBox ref={box} placeholder="Describe your query… you can paste or drop screenshots right here." minHeight={230} onError={setMsg} onSubmit={send} />
      </div>
      <div className="hd-compose-f">
        <button type="button" className="hd-btn send" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send"} <span aria-hidden="true">➤</span></button>
        <ImageBtn onFiles={f => box.current.addFiles(f)} />
        <span className="hd-hint">Images only (PNG, JPEG, WebP) · up to {MAX_IMAGES} · no files · Ctrl+Enter sends</span>
        <span className="hd-grow" />
        {msg && <span className="hd-err" role="alert">{msg}</span>}
        <button type="button" className="hd-btn ghost" onClick={onCancel}>Discard</button>
      </div>
    </div>
  );
}

// ─── one query: the conversation ───
function Thread({ api, base, id, staff, onChanged, onBack, onNew }) {
  const [d, setD] = useState(null); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const [zoom, setZoom] = useState(null); const [confirmDel, setConfirmDel] = useState(false);
  const box = useRef(null); const scroller = useRef(null); const lastN = useRef(-1);
  const load = useCallback(async () => {
    try { const r = await api(`${base}/tickets/${id}`); setD(r); setErr(""); if (r.messages.length !== lastN.current) onChanged(); }
    catch (e) { setErr(e.message); }
  }, [api, base, id]);
  useEffect(() => { load(); const t = setInterval(() => document.visibilityState === "visible" && load(), 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (d && d.messages.length !== lastN.current) { lastN.current = d.messages.length; const s = scroller.current; if (s) requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; }); }
  }, [d]);
  const send = async () => {
    if (busy) return;
    const body = box.current.blocks();
    if (!hasContent(body)) { setMsg("Write a reply first"); return; }
    setBusy(true); setMsg("");
    try { await api(`${base}/tickets/${id}/messages`, { method: "POST", json: { body } }); box.current.clear(); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const act = async (path, method = "POST") => {
    try { await api(`${base}/tickets/${id}${path}`, { method }); if (method === "DELETE") { onChanged(); onBack(true); return; } await load(); onChanged(); }
    catch (e) { setMsg(e.message); }
  };
  if (err && !d) return <div className="hd-empty"><b>{err}</b><button type="button" className="hd-btn ghost" onClick={() => onBack()}>‹ Back to inbox</button></div>;
  if (!d) return <div className="hd-empty">Loading…</div>;
  const t = d.ticket;
  const who = m => m.mine && !staff ? "You" : m.name;
  return (
    <div className="hd-thread">
      <div className="hd-th">
        <button type="button" className="hd-back" onClick={() => onBack()} aria-label="Back to inbox">‹</button>
        <div className="hd-th-t">
          <div className="hd-th-subj">{t.subject}</div>
          <div className="hd-th-meta"><span className="hd-mono">#{t.id}</span><SevChip s={t.severity} /><StatusChip s={t.status} />
            <span>opened {fmt(t.created_at)}</span>
            {staff && <span>by <b>{t.owner_name}</b> · {t.owner_kind === "customer" ? "customer" : "dashboard user"}{t.owner_email ? ` · ${t.owner_email}` : ""}</span>}
          </div>
        </div>
        <div className="hd-th-a">
          {t.status === "open"
            ? <button type="button" className="hd-btn" onClick={() => act("/close")} title="Mark this query as resolved">✓ Close query</button>
            : staff && <button type="button" className="hd-btn" onClick={() => act("/reopen")}>↺ Reopen</button>}
          {staff && (confirmDel
            ? <><button type="button" className="hd-btn danger" onClick={() => act("", "DELETE")}>Delete for good</button><button type="button" className="hd-btn ghost" onClick={() => setConfirmDel(false)}>Keep</button></>
            : <button type="button" className="hd-btn ghost" onClick={() => setConfirmDel(true)} title="Delete this query and its images">🗑</button>)}
        </div>
      </div>
      <div className="hd-msgs" ref={scroller}>
        {d.messages.map(m => m.kind === "system"
          ? <div key={m.id} className="hd-event">{(m.body[0] && m.body[0].v) === "closed" ? "✓ Closed" : "↺ Reopened"} by {m.mine && !staff ? "you" : m.name} · {fmt(m.at)}</div>
          : (
            <div key={m.id} className={`hd-msg ${m.side} ${m.mine ? "mine" : ""}`}>
              <div className="hd-msg-h">
                <span className="hd-av">{(who(m) || "?")[0].toUpperCase()}</span>
                <b>{who(m)}</b>
                {m.side === "staff" ? <span className="hd-tag staff">Helpdesk</span> : staff ? <span className="hd-tag">{m.kind === "customer" ? "Customer" : "User"}</span> : null}
                <span className="hd-at">{fmt(m.at)}</span>
              </div>
              <div className="hd-msg-b">
                {m.body.map((b, i) => b.t === "img"
                  ? <img key={i} src={`${base}/images/${b.id}`} alt="attached image" loading="lazy" onClick={() => setZoom(`${base}/images/${b.id}`)} />
                  : <span key={i} className="hd-text">{b.v}</span>)}
              </div>
            </div>
          ))}
      </div>
      {t.status === "open" ? (
        <div className="hd-reply">
          <RichBox ref={box} placeholder={staff ? "Write a reply to the customer / user…" : "Write a reply… paste or drop screenshots here"} minHeight={74} onError={setMsg} onSubmit={send} />
          <div className="hd-reply-f">
            <button type="button" className="hd-btn send" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send"} <span aria-hidden="true">➤</span></button>
            <ImageBtn onFiles={f => box.current.addFiles(f)} label="Image" />
            <span className="hd-hint">Ctrl+Enter sends</span>
            <span className="hd-grow" />
            {msg && <span className="hd-err" role="alert">{msg}</span>}
          </div>
        </div>
      ) : (
        <div className="hd-closed">This query is closed{t.closed_at ? ` · ${fmt(t.closed_at)}` : ""}.
          {staff ? " Reopen it to reply." : <> Need more help? <button type="button" className="hd-link" onClick={onNew}>Raise a new query</button></>}
          {msg && <span className="hd-err">{msg}</span>}
        </div>
      )}
      {zoom && <div className="hd-zoom" onClick={() => setZoom(null)} role="dialog" aria-label="Image"><img src={zoom} alt="attached image, full size" /></div>}
    </div>
  );
}

// ─── the whole helpdesk page: inbox on the left, compose / conversation on the right ───
export function Helpdesk({ api, base, staff = false, openReq = null, onChanged = () => {} }) {
  const [status, setStatus] = useState("open");
  const [data, setData] = useState(null); const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);                       // ticket id | "new" | null
  const [q, setQ] = useState(""); const [sev, setSev] = useState("all"); const [who, setWho] = useState("all");
  const apiRef = useRef(api); apiRef.current = api;
  const call = useCallback((p, o) => apiRef.current(p, o), []);
  const load = useCallback(async () => {
    try { setData(await call(`${base}/tickets?status=${status}`)); setErr(""); } catch (e) { setErr(e.message); }
  }, [call, base, status]);
  useEffect(() => { load(); const t = setInterval(() => document.visibilityState === "visible" && load(), 20000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (openReq) setSel(openReq.id || null); }, [openReq]);
  const changed = useCallback(() => { load(); onChanged(); }, [load, onChanged]);

  const list = (data ? data.tickets : []).filter(t =>
    (sev === "all" || t.severity === sev) && (who === "all" || t.owner_kind === who) &&
    (!q || `${t.subject} ${t.snippet} ${t.owner_name || ""} ${t.owner_email || ""} #${t.id}`.toLowerCase().includes(q.toLowerCase())));
  const counts = data ? data.counts : {};
  const unreadTotal = (data ? data.tickets : []).reduce((a, t) => a + (t.unread || 0), 0);
  return (
    <div className={`hd ${sel ? "has-sel" : ""}`}>
      <style>{HD_CSS}</style>
      <aside className="hd-list">
        <div className="hd-list-h">
          <div><div className="hd-title">{staff ? "Helpdesk inbox" : "My queries"}</div>
            <div className="hd-sub">{staff ? "Every query from customers and users" : "Ask QuantFriday anything — we reply here"}{unreadTotal ? ` · ${unreadTotal} new` : ""}</div></div>
          {!staff && <button type="button" className="hd-btn primary" onClick={() => setSel("new")}>✎ New query</button>}
        </div>
        <div className="hd-tabs">
          {[["open", "Open", counts.open || 0], ["closed", "Closed", counts.closed || 0], ["all", "All", (counts.open || 0) + (counts.closed || 0)]].map(([k, l, n]) => (
            <button key={k} type="button" className={status === k ? "on" : ""} onClick={() => setStatus(k)}>{l} <span>{n}</span></button>))}
        </div>
        <div className="hd-filters">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={staff ? "Search subject, name, email, #id" : "Search my queries"} aria-label="Search" />
          {staff && <div className="hd-frow">
            <select value={sev} onChange={e => setSev(e.target.value)} aria-label="Severity"><option value="all">All severities</option>{Object.entries(SEV).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
            <select value={who} onChange={e => setWho(e.target.value)} aria-label="From"><option value="all">Customers + users</option><option value="customer">Customers</option><option value="user">Dashboard users</option></select>
          </div>}
        </div>
        <div className="hd-items">
          {err && <div className="hd-err pad">{err}</div>}
          {!data && !err && <div className="hd-none">Loading…</div>}
          {data && !list.length && <div className="hd-none">{status === "open" ? "No open queries." : status === "closed" ? "No closed queries." : "No queries yet."}{!staff && status !== "closed" && <><br /><button type="button" className="hd-link" onClick={() => setSel("new")}>Raise your first query</button></>}</div>}
          {list.map(t => (
            <button key={t.id} type="button" className={`hd-item ${sel === t.id ? "on" : ""} ${t.unread ? "unread" : ""}`} onClick={() => setSel(t.id)}>
              <div className="r1"><span className="sevbar" style={{ background: SEV[t.severity][1] }} /><span className="subj">{t.subject}</span>{t.unread > 0 && <span className="hd-badge">{t.unread}</span>}</div>
              <div className="r2">{staff && <b>{t.owner_name} · </b>}{t.snippet || "—"}</div>
              <div className="r3"><span className="hd-mono">#{t.id}</span><span style={{ color: SEV[t.severity][1] }}>{SEV[t.severity][0]}</span><span className={`st ${t.status}`}>{t.status === "open" ? "Open" : "Closed"}</span>{staff && <span>{t.owner_kind === "customer" ? "Customer" : "User"}</span>}<span className="at">{fmt(t.updated_at)}</span></div>
            </button>
          ))}
        </div>
      </aside>
      <section className="hd-main">
        {sel === "new" ? <Compose api={call} base={base} onSent={id => { setStatus("open"); setSel(id); changed(); }} onCancel={() => setSel(null)} />
          : sel ? <Thread key={sel} api={call} base={base} id={sel} staff={staff} onChanged={changed} onBack={() => setSel(null)} onNew={() => setSel("new")} />
          : <div className="hd-empty">
              <div className="hd-empty-ic">✉</div>
              <b>{staff ? "Pick a query to read and reply" : "Pick a query, or raise a new one"}</b>
              <span>{staff ? "New messages show a badge here and on the 🔔 bell." : "Our replies show up here and on the 🔔 bell at the top."}</span>
              {!staff && <button type="button" className="hd-btn primary" onClick={() => setSel("new")}>✎ New query</button>}
            </div>}
      </section>
    </div>
  );
}

export const HD_CSS = `
.hd{display:grid;grid-template-columns:minmax(280px,340px) minmax(0,1fr);gap:0;height:calc(100vh - 190px);min-height:560px;background:var(--s1);border:1px solid var(--b1);border-radius:12px;overflow:hidden;font-size:13px;color:var(--t1);text-align:left}
.hd *{box-sizing:border-box}
.hd input,.hd select{background:var(--s2);border:1px solid var(--b2);color:var(--t1);border-radius:7px;padding:7px 10px;font:inherit;font-size:12.5px;width:100%;min-width:0}
.hd input:focus,.hd select:focus{outline:2px solid var(--adim);border-color:var(--acc)}
.hd-list{display:flex;flex-direction:column;border-right:1px solid var(--b1);min-height:0;background:var(--s1)}
.hd-list-h{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:14px 14px 10px}
.hd-title{font-size:15px;font-weight:700;color:var(--t1)}.hd-sub{font-size:11px;color:var(--t3);margin-top:2px}
.hd-tabs{display:flex;gap:4px;padding:0 14px 8px}
.hd-tabs button{flex:1;padding:6px 8px;border-radius:7px;border:1px solid var(--b2);background:var(--s2);color:var(--t2);font:inherit;font-size:11.5px;font-weight:600;cursor:pointer}
.hd-tabs button span{font-family:var(--mono);font-size:10.5px;opacity:.8;margin-left:3px}
.hd-tabs button.on{border-color:var(--acc);color:var(--acc);background:var(--adim)}
.hd-filters{padding:0 14px 10px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--b1)}.hd-frow{display:flex;gap:6px}
.hd-items{flex:1;overflow-y:auto;min-height:0}
.hd-item{display:block;width:100%;text-align:left;padding:10px 14px;border:0;border-bottom:1px solid var(--b1);background:none;color:var(--t1);font:inherit;cursor:pointer;position:relative}
.hd-item:hover{background:var(--s2)}.hd-item.on{background:var(--adim);box-shadow:inset 3px 0 0 var(--acc)}
.hd-item .r1{display:flex;align-items:center;gap:7px}.hd-item .sevbar{width:3px;height:14px;border-radius:2px;flex-shrink:0}
.hd-item .subj{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;color:var(--t2)}
.hd-item.unread .subj{color:var(--t1);font-weight:700}
.hd-item .r2{font-size:11.5px;color:var(--t3);margin:3px 0 4px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hd-item .r2 b{color:var(--t2);font-weight:600}
.hd-item .r3{display:flex;gap:8px;align-items:center;font-size:10.5px;color:var(--t3);margin-left:10px}.hd-item .r3 .at{margin-left:auto}
.hd-item .st.open{color:var(--acc)}.hd-item .st.closed{color:var(--t3)}
.hd-badge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--acc);color:#04121a;font:700 10.5px/18px var(--mono);text-align:center}
.hd-none{padding:28px 14px;text-align:center;color:var(--t3);font-size:12px;line-height:1.8}
.hd-main{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--bg,var(--s1))}
.hd-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--t3);padding:30px;text-align:center}
.hd-empty b{color:var(--t1);font-size:14px}.hd-empty-ic{font-size:36px;opacity:.6}
.hd-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border-radius:8px;border:1px solid var(--b2);background:var(--s2);color:var(--t1);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap}
.hd-btn:hover{border-color:var(--acc)}.hd-btn:disabled{opacity:.6;cursor:default}
.hd-btn.primary{border-color:var(--acc);color:var(--acc);background:var(--adim)}
.hd-btn.send{background:var(--acc);border-color:var(--acc);color:#04121a;padding:8px 18px;font-weight:700}
.hd-btn.ghost{background:none}.hd-btn.danger{border-color:#ff4454;color:#ff4454}
.hd-link{background:none;border:0;color:var(--acc);font:inherit;cursor:pointer;padding:0;text-decoration:underline}
.hd-mono{font-family:var(--mono)}.hd-grow{flex:1}
.hd-err{color:#ff4454;font-size:12px}.hd-err.pad{display:block;padding:12px 14px}
.hd-hint{font-size:11px;color:var(--t3)}
.hd-compose{flex:1;display:flex;flex-direction:column;min-height:0;margin:14px;border:1px solid var(--b2);border-radius:12px;background:var(--s1);overflow:hidden;box-shadow:0 14px 40px -18px rgba(0,0,0,.6)}
.hd-compose-h{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--s2);border-bottom:1px solid var(--b1);font-weight:700;font-size:13px}
.hd-x{background:none;border:0;color:var(--t2);font-size:14px;cursor:pointer}
.hd-field{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--b1);flex-wrap:wrap}
.hd-field>label{width:64px;flex-shrink:0;font-size:12px;color:var(--t3)}
.hd-field input{border:0;background:none;padding:4px 0;font-size:14px;flex:1;outline:none!important}
.hd-to{display:inline-flex;align-items:center;gap:7px;padding:3px 10px 3px 3px;border-radius:999px;background:var(--s2);border:1px solid var(--b2);font-size:12.5px}
.hd-to-av{width:20px;height:20px;border-radius:50%;background:var(--acc);color:#04121a;font:800 11px/20px var(--mono);text-align:center}
.hd-sev{display:flex;gap:6px}.hd-sev button{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;border:1px solid var(--b2);background:var(--s2);color:var(--t2);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.hd-sev .dot{width:7px;height:7px;border-radius:50%}.hd-sev-help{font-size:11px;color:var(--t3)}
.hd-compose-body{flex:1;overflow-y:auto;min-height:0;padding:4px 14px}
.hd-rich-wrap{position:relative}
.hd-rich{outline:none;padding:10px 2px;font-size:13.5px;line-height:1.6;color:var(--t1);white-space:pre-wrap;word-break:break-word;cursor:text}
.hd-ph{position:absolute;top:10px;left:2px;color:var(--t3);pointer-events:none;font-size:13.5px}
.hd-rich img,.hd-inl{display:block;max-width:min(100%,420px);max-height:300px;border-radius:8px;border:1px solid var(--b2);margin:6px 0}
.hd-compose-f{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid var(--b1);flex-wrap:wrap;background:var(--s1)}
.hd-thread{flex:1;display:flex;flex-direction:column;min-height:0}
.hd-th{display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-bottom:1px solid var(--b1);background:var(--s1)}
.hd-back{display:none;background:none;border:1px solid var(--b2);border-radius:7px;color:var(--t1);font-size:16px;width:30px;height:30px;cursor:pointer}
.hd-th-t{flex:1;min-width:0}.hd-th-subj{font-size:15px;font-weight:700;color:var(--t1);word-break:break-word}
.hd-th-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--t3);margin-top:4px}.hd-th-meta b{color:var(--t2)}
.hd-th-a{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.hd-sevchip,.hd-stchip{font-size:10.5px;font-weight:700;padding:1px 8px;border-radius:999px;border:1px solid}
.hd-stchip.open{color:var(--acc);border-color:var(--acc)}.hd-stchip.closed{color:var(--t3);border-color:var(--b2)}
.hd-msgs{flex:1;overflow-y:auto;min-height:0;padding:16px;display:flex;flex-direction:column;gap:12px}
.hd-msg{max-width:min(78%,640px);align-self:flex-start;background:var(--s2);border:1px solid var(--b2);border-radius:4px 14px 14px 14px;padding:9px 12px 11px}
.hd-msg.staff{border-left:3px solid var(--acc)}
.hd-msg.mine{align-self:flex-end;background:var(--adim);border-color:var(--acc);border-radius:14px 4px 14px 14px;border-left-width:1px}
.hd-msg-h{display:flex;align-items:center;gap:7px;font-size:11.5px;margin-bottom:5px;color:var(--t2)}.hd-msg-h b{color:var(--t1)}
.hd-av{width:20px;height:20px;border-radius:50%;background:var(--s3);color:var(--t1);font:700 10.5px/20px var(--mono);text-align:center;flex-shrink:0}
.hd-msg.staff .hd-av{background:var(--acc);color:#04121a}
.hd-tag{font-size:9.5px;font-weight:700;padding:0 6px;border-radius:4px;border:1px solid var(--b2);color:var(--t2);text-transform:uppercase;letter-spacing:.5px}
.hd-tag.staff{border-color:var(--acc);color:var(--acc)}.hd-at{margin-left:auto;font-size:10.5px;color:var(--t3);white-space:nowrap}
.hd-msg-b{font-size:13.5px;line-height:1.6;color:var(--t1);word-break:break-word}
.hd-text{white-space:pre-wrap}
.hd-msg-b img{display:block;max-width:100%;max-height:320px;border-radius:8px;border:1px solid var(--b2);margin:6px 0;cursor:zoom-in;background:var(--s3)}
.hd-event{align-self:center;font-size:11px;color:var(--t3);padding:3px 12px;border-radius:999px;border:1px dashed var(--b2)}
.hd-reply{border-top:1px solid var(--b1);padding:8px 16px 10px;background:var(--s1)}
.hd-reply .hd-rich{max-height:220px;overflow-y:auto;border:1px solid var(--b2);border-radius:10px;padding:9px 12px;background:var(--s2)}
.hd-reply .hd-ph{top:10px;left:13px}
.hd-reply-f{display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap}
.hd-closed{border-top:1px solid var(--b1);padding:14px 16px;color:var(--t2);font-size:12.5px;background:var(--s1);display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.hd-zoom{position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px}
.hd-zoom img{max-width:100%;max-height:100%;border-radius:8px}
.hd-bell-wrap{position:relative;display:inline-flex}
.hd-bell{position:relative;width:34px;height:34px;border-radius:9px;border:1px solid var(--b2);background:var(--s2);color:var(--t2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.hd-bell.on{color:var(--acc);border-color:var(--acc)}
.hd-bell-n{position:absolute;top:-6px;right:-7px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#ff4454;color:#fff;font:700 10px/18px var(--mono);text-align:center;box-shadow:0 0 0 2px var(--s1)}
.hd-bell-pop{position:absolute;right:0;top:42px;z-index:600;width:320px;max-width:86vw;background:var(--s1);border:1px solid var(--b2);border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.45);overflow:hidden;text-align:left}
.hd-bell-h{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;font-size:12.5px;font-weight:700;color:var(--t1);border-bottom:1px solid var(--b1)}.hd-bell-h span{font-size:11px;color:var(--t3);font-weight:500}
.hd-bell-it{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:4px 8px;align-items:center;width:100%;padding:9px 12px;border:0;border-bottom:1px solid var(--b1);background:none;color:var(--t1);font:inherit;text-align:left;cursor:pointer}
.hd-bell-it:hover{background:var(--s2)}.hd-bell-it .dot{width:8px;height:8px;border-radius:50%}
.hd-bell-it .t{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hd-bell-it .n{font-size:11px;color:var(--acc);font-weight:700}
.hd-bell-it .at{grid-column:2/4;font-size:10.5px;color:var(--t3)}
.hd-bell-empty{padding:16px 12px;font-size:12px;color:var(--t3);text-align:center}
.hd-bell-all{width:100%;padding:9px 12px;border:0;background:var(--s2);color:var(--acc);font:inherit;font-size:12px;font-weight:600;cursor:pointer;text-align:center}
@media (max-width:800px){
  .hd{grid-template-columns:1fr;height:auto;min-height:calc(100vh - 170px)}
  .hd.has-sel .hd-list{display:none}.hd:not(.has-sel) .hd-main{display:none}
  .hd-list{border-right:0}.hd-back{display:inline-block}
  .hd-msg{max-width:92%}.hd-compose{margin:8px}.hd-field>label{width:auto}
  .hd-thread{min-height:calc(100vh - 170px)}.hd-th{flex-wrap:wrap}.hd-th-a{width:100%;justify-content:flex-start}
}
`;
