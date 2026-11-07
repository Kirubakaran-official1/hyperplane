// Notification centre — the 🔔 in the customer top bar (owner, 2026-11-06: "if there is any change … it should come under
// the notification centre and open to view what changed, what to remove and the better alternative"). One bell for:
//   Hyperplane AI alerts   /app/api/notifications — written by monitor.py after each publish for saved SIPs / Builder
//                          portfolios / the Analyser list with alerts on
//   Helpdesk replies       the helpdesk unread counts (shared/helpdesk.jsx useHelpdeskUnread)
// Clicking an alert marks it read and opens its detail panel; "Open" goes to the application (sessionStorage
// hp_open_<app> + the hp-open event, read by saved.jsx / portfolio.jsx).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AiSpark, Icon, addCss, api, signed } from "./core.jsx";

addCss("notify", `
.nc{position:relative}
.nc-b{position:relative;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;border:1px solid var(--b1);background:var(--s1);color:var(--t2);cursor:pointer}
.nc-b:hover,.nc-b.on{color:var(--t1);border-color:var(--b2)}
.nc-n{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--short,#e5484d);color:#fff;font:700 10.5px/18px var(--sans);text-align:center;box-shadow:0 0 0 2px var(--bg)}
.nc-pop{position:absolute;right:0;top:calc(100% + 8px);z-index:60;width:min(400px,calc(100vw - 24px));max-height:min(560px,calc(100vh - 90px));display:flex;flex-direction:column;
  background:var(--bg);border:1px solid var(--b2);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden}
.nc-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--b1)}
.nc-h b{font:700 14px var(--sans);color:var(--t1)}.nc-h span{font-size:12px;color:var(--t3)}
.nc-h button{margin-left:auto;border:0;background:none;color:var(--acc);font:600 12px var(--sans);cursor:pointer}
.nc-body{overflow-y:auto}
.nc-sec{padding:8px 14px 4px;font:600 11px var(--sans);letter-spacing:.05em;text-transform:uppercase;color:var(--t3);display:flex;align-items:center;gap:6px}
.nc-it{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:10px;align-items:start;width:100%;padding:10px 14px;border:0;border-bottom:1px solid var(--b1);background:none;text-align:left;cursor:pointer;font:inherit;color:inherit}
.nc-it:hover{background:var(--s2)}
.nc-it i{width:8px;height:8px;margin-top:6px;border-radius:50%;background:transparent}.nc-it.un i{background:var(--acc)}
.nc-it b{display:block;font:600 13px/18px var(--sans);color:var(--t1)}.nc-it.rd b{font-weight:500;color:var(--t2)}
.nc-it small{display:block;font-size:12px;line-height:16px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nc-it em{font-style:normal;font-size:11px;color:var(--t3);white-space:nowrap}
.nc-empty{padding:16px 14px;font-size:13px;color:var(--t3)}
.nc-all{display:block;width:100%;padding:10px 14px;border:0;background:var(--s1);color:var(--acc);font:600 12.5px var(--sans);cursor:pointer;text-align:center}
.nc-ov{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.55)}
.nc-panel{width:min(640px,100%);max-height:88vh;overflow-y:auto;background:var(--bg);border:1px solid var(--b2);border-radius:14px;padding:20px 22px 24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.nc-ph{display:flex;justify-content:space-between;gap:12px}.nc-ph h2{margin:6px 0 0;font:700 19px/26px var(--sans);color:var(--t1)}
.nc-ph .x{flex:none;width:32px;height:32px;border-radius:8px;border:1px solid var(--b1);background:var(--s1);color:var(--t2);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.nc-when{font-size:12px;color:var(--t3)}
.nc-ch{display:flex;flex-direction:column;gap:8px}
.nc-c{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:10px;align-items:center;padding:12px;border-radius:10px;border:1px solid var(--b1)}
.nc-c .out b{display:block;font:700 14px var(--sans);color:var(--t1)}.nc-c .out small{display:block;font-size:12px;color:var(--mixed)}
.nc-c .arr{color:var(--t3)}
.nc-c .in{padding:8px 10px;border-radius:8px;background:var(--longd)}.nc-c .in b{display:block;font:700 14px var(--sans);color:var(--long)}.nc-c .in small{display:block;font-size:12px;color:var(--t2)}
.nc-c .in.none{background:var(--s2)}.nc-c .in.none b{color:var(--t2);font-weight:600}
.nc-order{padding:14px;border-radius:10px;background:var(--adim);font-size:14px;color:var(--t1)}.nc-order b{font-size:18px}
.nc-go{display:flex;gap:8px;flex-wrap:wrap}.nc-go .px-btn{display:inline-flex;align-items:center;gap:6px;height:36px}
.nc-fine{font-size:11.5px;color:var(--t3)}
@media (max-width:640px){.nc-c{grid-template-columns:1fr}.nc-c .arr{display:none}}
`);

const APP_OF = { sip: "sip", msip: "msip", builder: "builder", analyser: "portfolio", portfolio: "portfolio" };
const OPEN_LABEL = { sip: "Open in My portfolios", msip: "Open in My portfolios", builder: "Open in My portfolios", analyser: "Open in My portfolios", portfolio: "Open the AI Portfolio Analyser" };
const ago = iso => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const inr = v => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;

export function useNotifications(onOut) {
  const [n, setN] = useState({ items: [], unread: 0 });
  const refresh = useCallback(() => api("/app/api/notifications").then(setN).catch(e => { if (e.status === 401) onOut(e.message); }), []);
  useEffect(() => {
    refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 60000);
    const v = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [refresh]);
  const read = (ids, all = false) => {
    setN(o => ({ items: o.items.map(x => all || ids.includes(x.id) ? { ...x, read: true } : x), unread: all ? 0 : Math.max(0, o.unread - o.items.filter(x => ids.includes(x.id) && !x.read).length) }));
    return api("/app/api/notifications/read", { method: "POST", json: all ? { all: true } : { ids } }).catch(() => {});
  };
  return { ...n, refresh, read };
}

function Detail({ it, canOpen, onOpen, onClose }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const b = it.body || {}, app = APP_OF[it.kind];
  return (
    <div className="nc-ov" onClick={onClose}>
      <aside className="nc-panel" role="dialog" aria-label={it.title} id="nc-detail" onClick={e => e.stopPropagation()}>
        <div className="nc-ph"><div><div className="px-eyebrow"><AiSpark/> Hyperplane AI alert</div><h2>{it.title}</h2><div className="nc-when">{new Date(it.at).toLocaleString("en-IN")}</div></div>
          <button type="button" className="x" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button></div>
        {b.order && <div className="nc-order">Your order is ready: <b>{inr(b.total)}</b> this instalment. Open it to see what to buy.</div>}
        {(b.items || []).length > 0 && <div className="nc-ch"><span className="px-label">{it.kind === "portfolio" || it.kind === "analyser" ? "What needs a look" : "What to change"}</span>
          {b.items.map(x => (
            <div key={x.s} className="nc-c" data-nc={x.s}>
              <div className="out"><b>{x.s}</b><small>{it.kind === "portfolio" || it.kind === "analyser" ? "" : "Exit: "}{x.why}</small></div>
              <span className="arr"><Icon name="chevron" size={16}/></span>
              {x.alt ? <div className="in"><b>{x.alt.s}</b><small>Better alternative{x.alt.st != null ? ` · strength ${x.alt.st > 0 ? "+" : ""}${signed(x.alt.st)}` : ""}</small></div>
                : <div className="in none"><b>No better one today</b><small>Keep the money aside</small></div>}
            </div>))}</div>}
        <div className="nc-go">{canOpen && <button type="button" className="px-btn primary" id="nc-open" onClick={() => onOpen(app, it.ref)}><AiSpark/> {OPEN_LABEL[it.kind] || "Open"}</button>}
          <button type="button" className="px-btn" onClick={onClose}>Close</button></div>
        <p className="nc-fine">Checked by fixed rules on our latest data. For education only, not investment advice.</p>
      </aside>
    </div>);
}

export function NotifyCenter({ notes, hd, apps, onHelpdesk, onOpen }) {
  const [open, setOpen] = useState(false), [detail, setDetail] = useState(null);
  const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const total = notes.unread + hd.total;
  const have = new Set(apps.map(a => a.key));
  const pick = it => { setOpen(false); setDetail(it); if (!it.read) notes.read([it.id]); };
  return (
    <div className="nc" ref={ref}>
      <button type="button" className={`nc-b ${open ? "on" : ""}`} onClick={() => { setOpen(v => !v); if (!open) { notes.refresh(); hd.refresh && hd.refresh(); } }} id="nc-bell"
        title="Notifications" aria-label={`Notifications, ${total} new`}>
        <Icon name="bell" size={17}/>{total > 0 && <span className="nc-n" id="nc-count">{total > 99 ? "99+" : total}</span>}
      </button>
      {open && (
        <div className="nc-pop" role="menu" id="nc-pop">
          <div className="nc-h"><b>Notifications</b><span>{total ? `${total} new` : "all caught up"}</span>
            {notes.unread > 0 && <button type="button" onClick={() => notes.read([], true)} id="nc-readall">Mark all read</button>}</div>
          <div className="nc-body">
            <div className="nc-sec"><AiSpark/> Hyperplane AI alerts</div>
            {notes.items.length ? notes.items.slice(0, 30).map(it => (
              <button key={it.id} type="button" className={`nc-it ${it.read ? "rd" : "un"}`} onClick={() => pick(it)} data-note={it.id}>
                <i/><span><b>{it.title}</b><small>{(it.body && it.body.items || []).map(x => x.alt ? `${x.s} → ${x.alt.s}` : x.s).join(" · ") || (it.body && it.body.order ? "Open to see what to buy" : "")}</small></span>
                <em>{ago(it.at)}</em></button>))
              : <div className="nc-empty">No alerts yet. Turn alerts on inside any of My portfolios.</div>}
            <div className="nc-sec">Helpdesk</div>
            {hd.items.length ? hd.items.map(it => (
              <button key={it.id} type="button" className="nc-it un" onClick={() => { setOpen(false); onHelpdesk(it.id); }}>
                <i/><span><b>{it.subject}</b><small>{it.n} new repl{it.n === 1 ? "y" : "ies"}</small></span><em>{ago(it.at)}</em></button>))
              : <div className="nc-empty">No new replies</div>}
          </div>
          <button type="button" className="nc-all" onClick={() => { setOpen(false); onHelpdesk(null); }}>Open helpdesk →</button>
        </div>)}
      {detail && <Detail it={detail} canOpen={!!APP_OF[detail.kind] && have.has(APP_OF[detail.kind])} onClose={() => setDetail(null)}
        onOpen={(app, r) => { setDetail(null); onOpen(app, r); }}/>}
    </div>);
}
