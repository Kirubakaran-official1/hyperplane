// The 🔔 in the customer top bar — since round 19 a small preview of the Unified Inbox (inbox.jsx, owner 2026-11-08: "full page +
// small bell"). The count = unread inbox items + unread helpdesk replies, never more than "99+"; the pop-up lists the latest few and
// every row (and "Open inbox") opens the full inbox on that item. Sources:
//   Hyperplane AI alerts + announcements   /app/api/notifications (monitor.py after each publish; Admin → Announcements)
//   Helpdesk replies                       the helpdesk unread counts (shared/helpdesk.jsx useHelpdeskUnread)
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AiSpark, Icon, addCss, api } from "./core.jsx";

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
.nc-it .nc-ap{display:inline-block;margin-right:6px;padding:0 5px;border-radius:4px;background:var(--s3);color:var(--t2);font:700 9.5px/16px var(--sans);letter-spacing:.04em;vertical-align:1px}
.nc-all{display:block;width:100%;padding:10px 14px;border:0;background:var(--s1);color:var(--acc);font:600 12.5px var(--sans);cursor:pointer;text-align:center}
`);

const CODE = { portfolio: "PA", builder: "PB", sip: "ES", msip: "MS", hyperplane: "HP", helpdesk: "HD", community: "CM" };
const ago = iso => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

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

export function NotifyCenter({ notes, hd, onInbox }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const total = notes.unread + hd.total;
  const rows = [...notes.items.map(it => ({ id: `n${it.id}`, app: it.app || "hyperplane", t: it.title, s: (it.body && it.body.items || []).map(x => x.s).join(" · ") || (it.body && it.body.order ? "Order ready" : (it.body && it.body.text || "").slice(0, 70)), at: it.at, un: !it.read })),
                ...hd.items.map(it => ({ id: `h${it.id}`, app: "helpdesk", t: it.subject, s: `${it.n} new repl${it.n === 1 ? "y" : "ies"}`, at: it.at, un: true }))]
    .sort((a, b) => (b.un - a.un) || String(b.at).localeCompare(String(a.at))).slice(0, 6);
  const go = id => { setOpen(false); onInbox(id); };
  return (
    <div className="nc" ref={ref}>
      <button type="button" className={`nc-b ${open ? "on" : ""}`} onClick={() => { setOpen(v => !v); if (!open) { notes.refresh(); hd.refresh && hd.refresh(); } }} id="nc-bell"
        title="Inbox" aria-label={`Inbox, ${total} new`}>
        <Icon name="bell" size={17}/>{total > 0 && <span className="nc-n" id="nc-count">{total > 99 ? "99+" : total}</span>}
      </button>
      {open && (
        <div className="nc-pop" role="menu" id="nc-pop">
          <div className="nc-h"><b>Inbox</b><span>{total ? `${total} new` : "all caught up"}</span>
            {notes.unread > 0 && <button type="button" onClick={() => notes.read([], true)} id="nc-readall">Mark all read</button>}</div>
          <div className="nc-body">
            {rows.length ? rows.map(r => (
              <button key={r.id} type="button" className={`nc-it ${r.un ? "un" : "rd"}`} onClick={() => go(r.id)} data-note={r.id}>
                <i/><span><b><span className="nc-ap">{CODE[r.app] || "HP"}</span>{r.t}</b><small>{r.s}</small></span><em>{ago(r.at)}</em></button>))
              : <div className="nc-empty"><AiSpark/> Nothing new. Alerts, updates and helpdesk replies land here.</div>}
          </div>
          <button type="button" className="nc-all" onClick={() => go(null)} id="nc-open-inbox">Open inbox →</button>
        </div>)}
    </div>);
}
