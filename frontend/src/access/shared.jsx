// Admin → Access manager + Activity log: shared helpers, small components and styles.
import React from "react";

export const TZ = "Asia/Kolkata";
export const fmtTime = iso => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
export const fmtDay = iso => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
export const fmtDT = iso => iso ? `${fmtDay(iso)} ${fmtTime(iso)}` : "—";
export const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export const istDay = (d = new Date()) => IST_DATE.format(d);                       // "YYYY-MM-DD" on Indian time, any browser timezone
export const ago = iso => {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`; if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return fmtDay(iso);
};
export const mins = m => { m = Math.round(m || 0); if (m < 60) return `${m} min`; const h = Math.floor(m / 60); return `${h} h ${m % 60 ? `${m % 60} min` : ""}`.trim(); };
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ─── shared look ─────────────────────────────────────────────────────────────
export const btn = (primary = false, danger = false) => ({
  padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  border: `1px solid ${danger ? "var(--short)" : primary ? "var(--acc)" : "var(--b2)"}`,
  background: danger ? "var(--shortd)" : primary ? "var(--adim)" : "var(--s2)", color: danger ? "var(--short)" : primary ? "var(--acc)" : "var(--t1)",
});
export const input = { background: "var(--s2)", border: "1px solid var(--b2)", color: "var(--t1)", borderRadius: 7, fontSize: 12, padding: "6px 9px" };

export const APP_SVG = {
  research: <><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></>,
  simple: <><path d="M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9z"/><path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></>,
  portfolio: <><path d="M21.2 15.9A10 10 0 1 1 8.1 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></>,
  builder: <><rect x="3" y="13" width="5" height="8" rx="1"/><rect x="9.5" y="8" width="5" height="13" rx="1"/><rect x="16" y="3" width="5" height="18" rx="1"/><path d="M5.5 9.5 12 4l2.5 2"/></>,
};
export const AppIcon = ({ k, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {APP_SVG[k] || <rect x="4" y="4" width="16" height="16" rx="3"/>}</svg>);
export const Badge = ({ color, children, solid, title }) => (
  <span title={title} className="am-badge" style={{ color, borderColor: color, background: solid ? color : "transparent", ...(solid ? { color: "#fff" } : {}) }}>{children}</span>);
export const Empty = ({ children }) => <div className="am-empty">{children}</div>;

export const LockIcon = ({ size = 12 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;

export function Switch({ on, onChange, label, disabled, id }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} id={id} className={`am-sw ${on ? "on" : ""}`} onClick={() => onChange(!on)}><span/></button>;
}

export const AM_CSS = `
.am .mono{font-family:var(--mono)}
.am-mut{font-size:11px;color:var(--t3);line-height:1.45}
.am-badge{display:inline-flex;align-items:center;gap:5px;padding:1px 8px;border-radius:999px;border:1px solid;font-size:10.5px;font-weight:700;white-space:nowrap;line-height:17px;margin-left:4px}
.am-badge:first-child{margin-left:0}
.am-dot{display:inline-block;width:7px;height:7px;border-radius:50%;vertical-align:middle}
.am-dot.pulse{animation:amPulse 1.6s ease-in-out infinite}
@keyframes amPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--long) 60%,transparent)}70%{box-shadow:0 0 0 6px transparent}100%{box-shadow:0 0 0 0 transparent}}
.am-live{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;color:var(--t2);white-space:nowrap}
.am-empty{padding:22px;text-align:center;color:var(--t3);font-size:12px}
.am-seg{display:inline-flex;gap:3px;padding:3px;border:1px solid var(--b2);border-radius:9px;background:var(--s2);flex-wrap:wrap}
.am-seg button{border:0;background:none;color:var(--t2);font-size:12px;font-weight:600;padding:5px 12px;border-radius:7px;cursor:pointer;white-space:nowrap}
.am-seg button:hover{color:var(--t1)}.am-seg button.on{background:var(--s1);color:var(--acc);box-shadow:0 1px 0 var(--b1),0 0 0 1px var(--accborder)}
.am-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px}
.am-kpi{background:var(--s1);border:1px solid var(--b1);border-radius:11px;padding:11px 13px;min-width:0}
.am-kl{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.6px;font-weight:700;display:flex;align-items:center;gap:6px}
.am-kv{font-family:var(--mono);font-size:22px;font-weight:700;margin-top:3px;line-height:1.2;white-space:nowrap}
.am-ks{font-size:10.5px;color:var(--t3);margin-top:2px}
.am-grid2{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:12px;margin-bottom:12px}
.am-apps{display:flex;flex-direction:column;gap:4px}
.am-arow{display:grid;grid-template-columns:34px minmax(0,1fr) 64px 64px 92px;gap:12px;align-items:center;padding:9px 4px;border-bottom:1px solid var(--b1)}
.am-arow:last-child{border-bottom:0}
.am-aic,.am-mic{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--adim);color:var(--acc);border:1px solid var(--accborder);flex-shrink:0}
.am-an{font-size:12.5px;font-weight:700;margin-bottom:5px;display:flex;align-items:center;gap:6px}
.am-ubar{height:6px;border-radius:4px;background:var(--s2);overflow:hidden;flex:1}
.am-ubar>div{height:100%;border-radius:4px;background:var(--acc);min-width:2px}
.am-astat{display:flex;flex-direction:column;align-items:flex-end}.am-astat b{font-family:var(--mono);font-size:15px}.am-astat span{font-size:10px;color:var(--t3)}
.am-daily{position:relative}
.am-bars{display:grid;align-items:end;height:120px;border-bottom:1px solid var(--b2)}
.am-bcol{height:100%;display:flex;align-items:flex-end;cursor:default}
.am-bar{width:100%;border-radius:4px 4px 0 0;background:color-mix(in srgb,var(--acc) 70%,transparent);transition:background .12s}
.am-bar.on,.am-bcol:hover .am-bar{background:var(--acc)}
.am-baxis{display:flex;justify-content:space-between;font-size:10px;color:var(--t3);margin-top:4px;font-family:var(--mono)}
.am-btip{font-size:11.5px;margin-top:6px;min-height:18px;color:var(--t2)}
.am-hours{display:grid;grid-template-columns:repeat(24,1fr);gap:2px}.am-hr{height:22px;border-radius:3px}
.am-sec{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.7px;font-weight:700;margin:14px 0 6px}
.am-top{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px}
.am-topi{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--b1);border-radius:9px;background:var(--s2);color:var(--t1);cursor:pointer;font-size:12px}
.am-topi:hover{border-color:var(--accborder)}
.am-rank{width:22px;height:22px;border-radius:7px;background:var(--adim);color:var(--acc);font:700 11px/22px var(--mono);text-align:center;flex-shrink:0}
.am-topa{margin-left:auto;display:flex;gap:4px;color:var(--acc)}
.am-vbar{margin:4px 0 10px}
.am-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.am-tw{overflow:auto;border:1px solid var(--b1);border-radius:9px}
.am-t{width:100%;border-collapse:collapse;font-size:12px}
.am-th{position:sticky;top:0;background:var(--s2);border-bottom:1px solid var(--b1);padding:7px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);text-align:left;white-space:nowrap;z-index:1}
.am-th.c,.am-t td.c{text-align:center}
.am-t td{padding:8px 10px;border-bottom:1px solid var(--b1);vertical-align:top}
.am-t tbody tr:last-child>td{border-bottom:0}
.am-tr{cursor:pointer}.am-tr:hover>td,.am-t tbody tr:hover>td{background:var(--rowhover)}.am-tr.open>td{background:var(--adim)}
.am-caret{color:var(--t3);width:18px}
.am-sub>td{background:var(--s2);padding:8px 10px 12px}
.am-t.inner{border:1px solid var(--b1);border-radius:8px;background:var(--s1)}.am-t.inner .am-th{background:var(--s1)}
.am-num{font-family:var(--mono);white-space:nowrap}
.am-det{max-width:360px;color:var(--t2)}
.am-devn{display:inline-flex;min-width:24px;height:22px;padding:0 7px;align-items:center;justify-content:center;border-radius:7px;background:var(--s2);border:1px solid var(--b2);font:700 12px var(--mono)}
.am-devn.warn{color:var(--mixed);border-color:var(--mixed);background:var(--mixedd)}
.am-link{border:0;background:none;padding:0;color:var(--acc);font-weight:700;cursor:pointer;font-size:12.5px;text-align:left}
.am-link:hover{text-decoration:underline}
.am-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;border:1px solid var(--accborder);background:var(--adim);color:var(--t1);font-size:11.5px;white-space:nowrap}
.am-chip svg{color:var(--acc)}.am-chip.sm{padding:1px 7px;font-size:10.5px}.am-chip.plain{border-color:var(--b2);background:var(--s2);min-width:200px}
.am-chip.role{border-color:color-mix(in srgb,var(--ret) 45%,transparent);background:var(--retd);font-weight:600}
.am-pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:8px}
.am-drawer-bg{position:fixed;inset:0;z-index:900;background:rgba(4,8,16,.45);display:flex;justify-content:flex-end}
.am-drawer{position:relative;width:min(560px,100%);height:100%;overflow:auto;background:var(--s1);border-left:1px solid var(--b2);padding:22px 22px 30px;box-shadow:-30px 0 70px -30px rgba(0,0,0,.6);animation:amIn .2s ease}
@keyframes amIn{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
.am-x{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:1px solid var(--b2);background:var(--s2);color:var(--t2);cursor:pointer}
.am-ph{display:flex;gap:14px;align-items:flex-start;padding-right:36px}
.am-av{width:48px;height:48px;border-radius:14px;background:var(--adim);color:var(--acc);border:1px solid var(--accborder);display:flex;align-items:center;justify-content:center;font:700 20px var(--mono);flex-shrink:0}
.am-pn{font-size:18px;font-weight:800}
.am-pk{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:16px}
.am-pk .am-kv{font-size:18px}
.am-urow{display:grid;grid-template-columns:auto minmax(0,1fr) 70px;gap:10px;align-items:center;margin-bottom:6px}
.am-mini{display:flex;align-items:flex-end;gap:2px;height:56px;border-bottom:1px solid var(--b2)}
.am-mini>div{flex:1;background:color-mix(in srgb,var(--acc) 70%,transparent);border-radius:3px 3px 0 0;min-width:3px}
.am-mini>div:hover{background:var(--acc)}.am-mini>div.z{background:var(--b2)}
.am-dev{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--b1);font-size:12px}
.am-devi{width:30px;height:30px;border-radius:8px;background:var(--s2);border:1px solid var(--b1);display:flex;align-items:center;justify-content:center;color:var(--t2);flex-shrink:0}
.am-tl{display:flex;flex-direction:column;border-left:2px solid var(--b1);margin-left:5px}
.am-tli{display:flex;gap:10px;align-items:flex-start;padding:5px 0 9px 12px;position:relative;font-size:12px}
.am-tld{position:absolute;left:-6px;top:9px;width:10px;height:10px;border-radius:50%;box-shadow:0 0 0 3px var(--s1)}
.am-shell{display:grid;grid-template-columns:250px minmax(0,1fr);gap:14px;align-items:start}
.am-snav{position:sticky;top:64px;display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid var(--b1);border-radius:12px;background:var(--s1)}
.am-sn{position:relative;display:flex;align-items:center;gap:11px;width:100%;padding:10px;border:0;border-radius:9px;background:none;color:var(--t2);text-align:left;cursor:pointer;transition:background .15s,color .15s}
.am-sn:hover{background:var(--rowhover);color:var(--t1)}
.am-sn.on{background:var(--adim);color:var(--acc)}
.am-sn.on::before{content:"";position:absolute;left:-8px;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;background:var(--acc)}
.am-sni{flex:0 0 34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--s2);border:1px solid var(--b1)}
.am-sn.on .am-sni{background:var(--s1);border-color:var(--accborder)}
.am-snt{display:flex;flex-direction:column;min-width:0;flex:1}.am-snt b{font-size:12.5px;color:var(--t1)}.am-sn.on .am-snt b{color:var(--acc)}
.am-snt span{font-size:10.5px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.am-snn{min-width:24px;height:20px;padding:0 6px;border-radius:999px;background:var(--s2);border:1px solid var(--b2);font:700 10.5px/18px var(--mono);text-align:center;color:var(--t2)}
.am-sn.on .am-snn{border-color:var(--accborder);color:var(--acc)}
.am-pane{min-width:0}
.am-fl.am-flrow{flex-direction:row;align-items:center}.am-flr{text-transform:none;letter-spacing:0;font-weight:600;color:var(--t2);font-size:11.5px}
.am-mic.lg{width:42px;height:42px;border-radius:11px}
.am-appb{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.am-apph{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.am-apph b{font-size:13.5px}
.am-appd{font-size:12px;color:var(--t2);line-height:1.5}
.am-appm{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--t3);margin-top:3px}.am-appm b{color:var(--t1)}
.am-dotsep{width:3px;height:3px;border-radius:50%;background:var(--t3)}
.am-appa{display:flex;align-items:center;gap:10px;flex-shrink:0}
.am-appcount{display:inline-flex;align-items:center;gap:8px;font-size:11.5px;color:var(--t2);white-space:nowrap}.am-appcount b{color:var(--t1);font-family:var(--mono)}
.am-appicons{display:inline-flex;gap:4px;color:var(--acc);align-items:center}.am-appicons span{font-size:10.5px;color:var(--t3)}
.am-roles{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(0,1.4fr);gap:12px;margin-bottom:12px;align-items:start}
.am-rlist{display:flex;flex-direction:column;gap:6px;max-height:560px;overflow:auto}
.am-rcard{display:flex;flex-direction:column;gap:4px;text-align:left;padding:10px 12px;border:1px solid var(--b1);border-radius:10px;background:var(--s2);color:var(--t1);cursor:pointer;font-size:12.5px}
.am-rcard:hover{border-color:var(--accborder)}.am-rcard.on{border-color:var(--acc);background:var(--adim);box-shadow:inset 3px 0 0 var(--acc)}
.am-rcard.new{border-style:dashed;cursor:default}
.am-rt{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.am-rt b{margin-right:4px}
.am-rd{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.am-rf{display:flex;justify-content:space-between;align-items:center}
.am-form{display:flex;flex-direction:column;gap:10px}
.am-fl{display:flex;flex-direction:column;gap:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--t3)}
.am-fl input{font-size:13px;padding:8px 10px;text-transform:none;letter-spacing:0;font-weight:500}
.am-mods{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px}
.am-mod{display:flex;gap:10px;align-items:flex-start;padding:11px 12px;border:1px solid var(--b2);border-radius:11px;background:var(--s2);color:var(--t1);cursor:pointer;font-size:12.5px;position:relative;transition:border-color .15s,background .15s}
.am-mod:hover{border-color:var(--accborder)}.am-mod.on{border-color:var(--acc);background:var(--adim)}
.am-mod:not(.on) .am-mic{background:var(--s1);color:var(--t3);border-color:var(--b2)}
.am-tick{margin-left:auto;width:20px;height:20px;border-radius:6px;border:1.5px solid var(--b2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0}
.am-tick.on{background:var(--acc);border-color:var(--acc);color:#fff}
.am-modw{display:flex;flex-direction:column;gap:4px}
.am-modw .am-mod{width:100%;font-family:inherit;text-align:left}
.am-perm{display:flex;gap:9px;align-items:flex-start;margin-left:22px;padding:8px 11px;border:1px dashed var(--b2);border-radius:10px;background:var(--s1);font-size:12px;cursor:pointer;position:relative}
.am-perm::before{content:"";position:absolute;left:-13px;top:-6px;width:10px;height:22px;border-left:1.5px solid var(--b2);border-bottom:1.5px solid var(--b2);border-bottom-left-radius:6px}
.am-perm.on{border-style:solid;border-color:color-mix(in srgb,var(--mixed) 60%,transparent);background:color-mix(in srgb,var(--mixed) 9%,var(--s1))}
.am-perm.dis{opacity:.55;cursor:not-allowed}
.am-perm input{margin-top:2px;accent-color:var(--mixed)}
.am-pkey{display:block;margin-top:3px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;color:var(--t3)}
.am-own{display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:0 6px;border-radius:999px;border:1px solid color-mix(in srgb,var(--mixed) 55%,transparent);color:var(--mixed);font-size:10px;font-weight:700;white-space:nowrap;vertical-align:1px}
.am-own.lg{font-size:11.5px;padding:3px 10px}
.am-warn{display:flex;gap:8px;align-items:center;padding:9px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--mixed) 55%,transparent);background:color-mix(in srgb,var(--mixed) 10%,transparent);color:var(--t1);font-size:12px}
.am-warn svg{color:var(--mixed);flex-shrink:0}
.am-pm td,.am-pm th{vertical-align:middle}
.am-pmc{text-align:center;min-width:96px}
.am-pmapp td{background:var(--s2)}
.am-pmname{display:inline-flex;align-items:center;gap:7px}.am-pmname svg{color:var(--acc)}
.am-pmname.sub{padding-left:21px;font-size:12px}
.am-pmsub .am-pkey{padding-left:21px}
.am-pmy{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--acc);color:#fff;font-weight:800;font-size:12px}
.am-pmy.own{background:var(--mixed)}
.am-pmn{color:var(--t3)}
.am-defrow{display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border:1px solid var(--b1);border-radius:10px;background:var(--s2);font-size:12.5px;cursor:pointer}
.am-defrow.on{border-color:color-mix(in srgb,var(--long) 50%,transparent);background:var(--longd)}
.am-sw{position:relative;width:36px;height:20px;border-radius:999px;border:0;background:var(--b2);cursor:pointer;flex-shrink:0;transition:background .15s;padding:0}
.am-sw span{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.am-sw.on{background:var(--long)}.am-sw.on span{left:18px}.am-sw:disabled{opacity:.6;cursor:not-allowed}
.am-factions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:4px}
.am-confirm{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--short)}
.am-applist{display:flex;flex-direction:column;gap:6px}
.am-app{display:flex;gap:14px;align-items:center;padding:14px 16px;border:1px solid var(--b1);border-radius:10px;background:var(--s2);font-size:12.5px;flex-wrap:wrap}
.am-app.off{opacity:.75;border-style:dashed}
.am-appf{display:flex;gap:10px;flex:1;flex-wrap:wrap;align-items:flex-end}.am-appf .am-fl{flex:1;min-width:160px}
.am-swl{display:inline-flex;gap:7px;align-items:center;font-size:11.5px;font-weight:700}
.am-bulk{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:9px 12px;margin-bottom:10px;border:1px solid var(--accborder);border-radius:10px;background:var(--adim);font-size:12.5px}
.am-picked>td{background:var(--adim)}
.am-pop{position:absolute;right:0;top:calc(100% - 2px);z-index:50;width:270px;padding:12px;border:1px solid var(--b2);border-radius:11px;background:var(--s1);box-shadow:0 18px 40px -12px var(--shadow);text-align:left}
.am-check{display:flex;gap:9px;align-items:flex-start;padding:6px 4px;border-radius:7px;cursor:pointer;font-size:12.5px}
.am-check:hover{background:var(--rowhover)}.am-check input{margin-top:3px}
@media (max-width:1100px){.am-grid2,.am-roles{grid-template-columns:1fr}}
@media (max-width:1000px){.am-shell{grid-template-columns:1fr}.am-snav{position:static;flex-direction:row;overflow-x:auto}.am-sn{flex:1 0 200px}.am-sn.on::before{display:none}}
@media (max-width:700px){.am-arow{grid-template-columns:34px minmax(0,1fr) 70px}.am-astat:not(.wide){display:none}.am-pk{grid-template-columns:1fr 1fr}}
`;
