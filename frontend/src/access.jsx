// Admin → 📜 Activity log and 🔐 Access manager (owner, 2026-10-27).
// Access manager = RBAC for the customer app (/app) only: applications (its modules) → roles → customers.
// Activity log = who signed in, from which device, which application they used, when and for how long.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { FocusCard, Pill, SectionTitle } from "./dashboard.jsx";

const TZ = "Asia/Kolkata";
const fmtTime = iso => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const fmtDay = iso => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
const fmtDT = iso => iso ? `${fmtDay(iso)} ${fmtTime(iso)}` : "—";
const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const istDay = (d = new Date()) => IST_DATE.format(d);                       // "YYYY-MM-DD" on Indian time, any browser timezone
const ago = iso => {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`; if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return fmtDay(iso);
};
const mins = m => { m = Math.round(m || 0); if (m < 60) return `${m} min`; const h = Math.floor(m / 60); return `${h} h ${m % 60 ? `${m % 60} min` : ""}`.trim(); };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ─── shared look ─────────────────────────────────────────────────────────────
const btn = (primary = false, danger = false) => ({
  padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  border: `1px solid ${danger ? "var(--short)" : primary ? "var(--acc)" : "var(--b2)"}`,
  background: danger ? "var(--shortd)" : primary ? "var(--adim)" : "var(--s2)", color: danger ? "var(--short)" : primary ? "var(--acc)" : "var(--t1)",
});
const input = { background: "var(--s2)", border: "1px solid var(--b2)", color: "var(--t1)", borderRadius: 7, fontSize: 12, padding: "6px 9px" };

const APP_SVG = {
  research: <><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></>,
  simple: <><path d="M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9z"/><path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></>,
  portfolio: <><path d="M21.2 15.9A10 10 0 1 1 8.1 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></>,
  builder: <><rect x="3" y="13" width="5" height="8" rx="1"/><rect x="9.5" y="8" width="5" height="13" rx="1"/><rect x="16" y="3" width="5" height="18" rx="1"/><path d="M5.5 9.5 12 4l2.5 2"/></>,
};
const AppIcon = ({ k, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {APP_SVG[k] || <rect x="4" y="4" width="16" height="16" rx="3"/>}</svg>);
const DeviceIcon = ({ label = "" }) => {
  const phone = /iPhone|Android phone/.test(label), tab = /iPad|tablet/.test(label);
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {phone ? <><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></>
      : tab ? <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M11 18h2"/></>
      : <><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></>}</svg>;
};

const EVENT = {
  login:           ["Signed in", "var(--long)"],
  signup:          ["Signed up", "var(--acc)"],
  open:            ["Opened", "var(--acc)"],
  logout:          ["Signed out", "var(--t2)"],
  login_failed:    ["Sign-in failed", "var(--short)"],
  locked:          ["Locked", "var(--short)"],
  session_revoked: ["Device signed out", "var(--mixed)"],
  signed_out_all:  ["Signed out everywhere", "var(--mixed)"],
  blocked:         ["Blocked", "var(--short)"],
  password_reset:  ["Password reset", "var(--mixed)"],
  roles_changed:   ["Plan changed", "var(--ret)"],
  role_created:    ["Role created", "var(--ret)"],
  role_updated:    ["Role updated", "var(--ret)"],
  role_deleted:    ["Role deleted", "var(--ret)"],
  app_updated:     ["Application updated", "var(--ret)"],
};
const EVENT_GROUPS = [
  ["all", "All events", null],
  ["signin", "Sign-ins", "login,signup"],
  ["failed", "Failed & locked", "login_failed,locked"],
  ["out", "Sign-outs", "logout,session_revoked,signed_out_all"],
  ["open", "Applications opened", "open"],
  ["admin", "Admin changes", "roles_changed,role_created,role_updated,role_deleted,app_updated,blocked,password_reset"],
];
const REASON = { wrong_password: "Wrong password", unknown_email: "No account with this email", unknown_user: "No such user",
  locked: "Tried while locked", pending: "Waiting for approval", blocked: "Account blocked", expired: "Access expired" };
const STATUS = {
  active:         ["Active now", "var(--long)"],
  idle:           ["Signed in", "var(--acc)"],
  signed_out:     ["Signed out", "var(--t3)"],
  revoked:        ["Signed out by admin", "var(--mixed)"],
  blocked:        ["Ended: blocked", "var(--short)"],
  password_reset: ["Ended: password reset", "var(--mixed)"],
  expired:        ["Expired", "var(--t3)"],
};
function eventDetail(e, appName) {
  const d = e.detail || {};
  switch (e.event) {
    case "open": return appName(e.module);
    case "login_failed": return REASON[d.reason] || "";
    case "locked": return `Locked for ${d.minutes || 15} min after 5 wrong passwords`;
    case "signup": return d.status === "pending" ? "Waiting for approval" : "Approved automatically";
    case "login": return e.app === "admin" ? (d.admin ? "Admin" : "User") : "";
    case "session_revoked": return `by ${d.by}`;
    case "signed_out_all": case "blocked": case "password_reset": return `by ${d.by}${d.devices ? ` · ${plural(d.devices, "device")} signed out` : ""}`;
    case "roles_changed": return `${(d.before || []).join(", ") || "—"} → ${(d.after || []).join(", ")} · by ${d.by}`;
    case "role_created": return `${d.role}${d.copied_from ? ` (copy of ${d.copied_from})` : ""}`;
    case "role_deleted": return `${d.role}${d.moved_to_default ? ` · ${plural(d.moved_to_default, "customer")} moved to the default role` : ""}`;
    case "role_updated": return `${d.role}${d.renamed_from ? ` (was ${d.renamed_from})` : ""}${d.default ? " · now the default" : ""}`;
    case "app_updated": return `${appName(d.app)}${d.enabled === false ? " switched off" : d.enabled ? " switched on" : ""}${d.renamed_from ? ` (was ${d.renamed_from})` : ""}`;
    default: return "";
  }
}

const Badge = ({ color, children, solid, title }) => (
  <span title={title} className="am-badge" style={{ color, borderColor: color, background: solid ? color : "transparent", ...(solid ? { color: "#fff" } : {}) }}>{children}</span>);
const Dot = ({ color, pulse }) => <span className={`am-dot ${pulse ? "pulse" : ""}`} style={{ background: color }}/>;
const Empty = ({ children }) => <div className="am-empty">{children}</div>;

function Kpi({ label, value, sub, color, tip, id }) {
  return (
    <div className="am-kpi" title={tip} id={id}>
      <div className="am-kl">{label}</div>
      <div className="am-kv" style={{ color: color || "var(--t1)" }}>{value}</div>
      {sub && <div className="am-ks">{sub}</div>}
    </div>);
}

function Seg({ items, value, onChange, id }) {
  return (
    <div className="am-seg" role="tablist" id={id}>
      {items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}
    </div>);
}

function exportRows(name, header, rows, kind) {
  const table = [header, ...rows];
  if (kind === "copy") {
    const text = table.map(r => r.map(v => String(v ?? "").replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
    return navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    });
  }
  const ws = XLSX.utils.aoa_to_sheet(table);
  ws["!cols"] = header.map((h, i) => ({ wch: Math.max(10, Math.min(48, ...table.map(r => String(r[i] ?? "").length + 2))) }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  XLSX.writeFile(wb, `Hyperplane-${name.toLowerCase().replace(/\s+/g, "-")}-${istDay()}.xlsx`);
  return Promise.resolve();
}

// ─── charts (single series, accent hue; every mark has a hover tooltip) ──────
function DailyBars({ days }) {
  const max = Math.max(1, ...days.map(d => d.people));
  const [hov, setHov] = useState(null);
  const step = days.length > 45 ? 0 : days.length > 14 ? 1 : 2;
  return (
    <div className="am-daily" onMouseLeave={() => setHov(null)}>
      <div className="am-bars" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))`, gap: step }}>
        {days.map((d, i) => (
          <div key={d.day} className="am-bcol" onMouseEnter={() => setHov(i)} aria-label={`${d.day}: ${d.people} people`}>
            <div className={`am-bar ${hov === i ? "on" : ""}`} style={{ height: `${d.people ? Math.max(4, d.people / max * 100) : 0}%` }}/>
          </div>))}
      </div>
      <div className="am-baxis"><span>{fmtDay(days[0].day + "T12:00:00+05:30")}</span><span>{fmtDay(days[days.length - 1].day + "T12:00:00+05:30")}</span></div>
      <div className="am-btip">{hov != null
        ? <><b>{fmtDay(days[hov].day + "T12:00:00+05:30")}</b> · {plural(days[hov].people, "person")} · {plural(days[hov].signins, "sign-in")} · {mins(days[hov].minutes)} used{days[hov].failed ? <span style={{ color: "var(--short)" }}> · {days[hov].failed} failed</span> : null}</>
        : <span className="am-mut">Hover a day for details · peak {plural(max, "person")} a day</span>}</div>
    </div>);
}

function HourStrip({ hours }) {
  const max = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));
  return (
    <div>
      <div className="am-hours">
        {hours.map((n, h) => <div key={h} className="am-hr" title={`${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59 IST · ${n} sign-ins / applications opened`}
          style={{ background: n ? `color-mix(in srgb, var(--acc) ${Math.round(15 + n / max * 85)}%, transparent)` : "var(--s2)" }}/>)}
      </div>
      <div className="am-baxis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      <div className="am-ks">{hours.some(Boolean) ? <>Busiest hour: <b>{String(peak).padStart(2, "0")}:00 IST</b></> : "No activity in this period"}</div>
    </div>);
}

// ─── Person drawer: everything about one customer ────────────────────────────
function PersonDrawer({ api, notify, cid, appName, onClose, onChanged }) {
  const [p, setP] = useState(null);
  const load = useCallback(() => api(`/api/admin/activity/person/${cid}`).then(setP).catch(e => notify(e.message, "err")), [cid]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const revoke = async sid => { try { await api(`/api/admin/activity/sessions/${sid}/revoke`, { method: "POST" }); notify("Device signed out"); load(); onChanged(); } catch (e) { notify(e.message, "err"); } };
  const all = async () => { try { const r = await api(`/api/admin/customers/${cid}/signout-all`, { method: "POST" }); notify(`Signed out on ${plural(r.devices, "device")}`); load(); onChanged(); } catch (e) { notify(e.message, "err"); } };
  const c = p && p.customer;
  const total = p ? p.usage.reduce((a, u) => a + u.minutes, 0) : 0;
  const live = p ? p.sessions.filter(s => s.status === "active" || s.status === "idle") : [];
  const maxDay = p ? Math.max(1, ...p.daily.map(d => d.minutes)) : 1;
  // always 30 day slots (today last), so one busy day reads as one bar, not a block
  const days30 = p ? Array.from({ length: 30 }, (_, i) => { const day = istDay(new Date(Date.now() - (29 - i) * 86400000));
    return { day, minutes: (p.daily.find(x => x.day === day) || {}).minutes || 0 }; }) : [];
  return (
    <div className="am-drawer-bg" onClick={onClose}>
      <aside className="am-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-label="Customer activity" id="person-drawer">
        <button className="am-x" onClick={onClose} aria-label="Close">✕</button>
        {!p ? <Empty>Loading…</Empty> : <>
          <div className="am-ph">
            <div className="am-av">{(c.name || "?")[0].toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="am-pn">{c.name}</div>
              <div className="am-mut" style={{ wordBreak: "break-all" }}>{c.email}{c.phone ? ` · ${c.phone}` : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                <Badge color={c.status === "approved" ? "var(--long)" : c.status === "blocked" ? "var(--short)" : "var(--mixed)"}>{c.status === "approved" ? "active" : c.status}</Badge>
                {p.roles.map(r => <Badge key={r.id} color="var(--ret)" title={`Given ${fmtDT(r.assigned_at)} by ${r.assigned_by || "—"}`}>{r.name}</Badge>)}
              </div>
            </div>
          </div>
          <div className="am-pk">
            <Kpi label="Signed in now" value={live.length} sub={live.length ? plural(live.length, "device") : "none"} color={live.length ? "var(--long)" : undefined}/>
            <Kpi label="Devices used" value={p.devices.length} color={p.devices.length >= 3 ? "var(--mixed)" : undefined} sub={p.devices.length >= 3 ? "check for sharing" : "since records began"}/>
            <Kpi label="Time used" value={mins(total)} sub="all applications"/>
            <Kpi label="Last sign-in" value={c.last_login ? ago(c.last_login) : "never"} sub={`${plural(c.login_count || 0, "sign-in")} in total`}/>
          </div>
          <div className="am-sec">Applications on the plan</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {p.apps.length ? p.apps.map(a => <span key={a.key} className="am-chip"><AppIcon k={a.key}/>{a.name}</span>) : <span className="am-mut">None</span>}
          </div>
          <div className="am-sec">Time per application</div>
          {p.usage.length ? p.usage.sort((a, b) => b.minutes - a.minutes).map(u => (
            <div key={u.module} className="am-urow" title={`Last used ${fmtDT(u.last_at)} · on ${plural(u.days, "day")}`}>
              <span className="am-chip plain"><AppIcon k={u.module}/>{appName(u.module)}</span>
              <div className="am-ubar"><div style={{ width: `${total ? u.minutes / total * 100 : 0}%` }}/></div>
              <span className="am-num">{mins(u.minutes)}</span>
            </div>)) : <span className="am-mut">No application used yet.</span>}
          {p.daily.length > 0 && <>
            <div className="am-sec">Last 30 days</div>
            <div className="am-mini">{days30.map(d => <div key={d.day} className={d.minutes ? "" : "z"} title={`${fmtDay(d.day + "T12:00:00+05:30")} · ${d.minutes ? mins(d.minutes) : "not used"}`} style={{ height: d.minutes ? `${Math.max(8, d.minutes / maxDay * 100)}%` : "2px" }}/>)}</div>
            <div className="am-baxis"><span>30 days ago</span><span>today</span></div>
          </>}
          <div className="am-sec" style={{ display: "flex", alignItems: "center" }}>Devices ({p.devices.length})<span style={{ flex: 1 }}/>
            {live.length > 0 && <button style={{ ...btn(false, true), padding: "3px 9px", fontSize: 11 }} onClick={all} id="drawer-signout-all">Sign out all devices</button>}</div>
          {p.devices.map(d => (
            <div key={d.device_id || d.first_seen} className="am-dev">
              <span className="am-devi"><DeviceIcon label={d.device}/></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div><b>{d.device || "Unknown device"}</b>{d.live > 0 && <span style={{ marginLeft: 6 }}><Badge color="var(--long)">signed in</Badge></span>}</div>
                <div className="am-mut">First {fmtDT(d.first_seen)} · last {ago(d.last_seen)} · {plural(d.sessions, "sign-in")} · {mins(d.minutes)}</div>
                <div className="am-mut mono">IP {d.ips.join(", ") || "—"} · device id {(d.device_id || "").slice(0, 8)}</div>
              </div>
            </div>))}
          {live.length > 0 && <>
            <div className="am-sec">Signed-in sessions</div>
            {live.map(s => (
              <div key={s.id} className="am-dev">
                <span className="am-devi"><DeviceIcon label={s.device}/></span>
                <div style={{ flex: 1, minWidth: 0 }}><b>{s.device}</b> <Badge color={STATUS[s.status][1]}>{STATUS[s.status][0]}</Badge>
                  <div className="am-mut">Since {fmtDT(s.created_at)} · last active {ago(s.last_seen)} · IP {s.last_ip || s.ip}</div></div>
                <button style={{ ...btn(), padding: "3px 9px", fontSize: 11 }} onClick={() => revoke(s.id)}>Sign out</button>
              </div>))}
          </>}
          <div className="am-sec">Timeline</div>
          <div className="am-tl">
            {p.events.length ? p.events.map(e => { const [l, col] = EVENT[e.event] || [e.event, "var(--t2)"]; const det = eventDetail(e, appName); return (
              <div key={e.id} className="am-tli">
                <span className="am-tld" style={{ background: col }}/>
                <div style={{ minWidth: 0 }}>
                  <div><b style={{ color: col }}>{l}</b>{det && <span> · {det}</span>}</div>
                  <div className="am-mut">{fmtDT(e.at)}{e.device ? ` · ${e.device}` : ""}{e.ip ? ` · ${e.ip}` : ""}</div>
                </div>
              </div>); }) : <span className="am-mut">Nothing recorded yet.</span>}
          </div>
        </>}
      </aside>
    </div>);
}

// ─── 📜 ACTIVITY LOG ─────────────────────────────────────────────────────────
const RANGES = [["1", "Today"], ["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["custom", "Custom"]];
const PAGE = 100;

export function ActivityTab({ api, notify }) {
  const [rk, setRk] = useState("7");
  const [custom, setCustom] = useState(() => ({ from: istDay(new Date(Date.now() - 6 * 86400000)), to: istDay() }));
  const range = useMemo(() => {
    if (rk === "custom") return { date_from: custom.from, date_to: custom.to };
    const n = +rk; return { date_from: istDay(new Date(Date.now() - (n - 1) * 86400000)), date_to: istDay() };
  }, [rk, custom]);
  const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== "" && v != null)).toString();
  const [sum, setSum] = useState(null); const [people, setPeople] = useState(null); const [users, setUsers] = useState(null);
  const [view, setView] = useState("people");
  const [ev, setEv] = useState(null); const [evF, setEvF] = useState({ app: "", group: "all", module: "", q: "" }); const [page, setPage] = useState(0);
  const [qp, setQp] = useState(""); const [pf, setPf] = useState("all"); const [openRow, setOpenRow] = useState({});
  const [person, setPerson] = useState(null); const [ret, setRet] = useState(null); const [tick, setTick] = useState(0);
  const [updated, setUpdated] = useState(null); const [loading, setLoading] = useState(false);
  const modules = sum ? sum.modules : [];
  const appName = k => (modules.find(m => m.key === k) || {}).name || k || "";

  const loadMain = useCallback(() => { setLoading(true); return Promise.all([
    api(`/api/admin/activity/summary?${qs(range)}`).then(setSum),
    api(`/api/admin/activity/sessions?${qs(range)}`).then(r => setPeople(r.people)),
    api(`/api/admin/activity/users?${qs(range)}`).then(r => setUsers(r.users)),
    api("/api/admin/activity/retention").then(setRet),
  ]).then(() => setUpdated(new Date().toISOString())).catch(e => notify(e.message, "err")).finally(() => setLoading(false)); }, [range]);
  useEffect(() => { loadMain(); }, [loadMain, tick]);
  // live: the numbers update by themselves every minute while this page is on screen (no manual refresh needed)
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") setTick(x => x + 1); }, 60000);
    return () => clearInterval(t);
  }, []);
  const evQuery = useMemo(() => {
    const g = EVENT_GROUPS.find(x => x[0] === evF.group);
    return { ...range, app: evF.app, event: g && g[2], module: evF.module, q: evF.q.trim() };
  }, [range, evF]);
  useEffect(() => { setPage(0); }, [evQuery]);
  useEffect(() => {
    if (view !== "events") return undefined;
    const t = setTimeout(() => api(`/api/admin/activity/events?${qs({ ...evQuery, limit: PAGE, offset: page * PAGE })}`).then(setEv).catch(e => notify(e.message, "err")), evF.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [view, evQuery, page, tick]);

  const revoke = async sid => { try { await api(`/api/admin/activity/sessions/${sid}/revoke`, { method: "POST" }); notify("Device signed out — that browser must sign in again"); setTick(t => t + 1); } catch (e) { notify(e.message, "err"); } };
  const signoutAll = async p => { try { const r = await api(`/api/admin/customers/${p.id}/signout-all`, { method: "POST" }); notify(`${p.name}: signed out on ${plural(r.devices, "device")}`); setTick(t => t + 1); } catch (e) { notify(e.message, "err"); } };
  const setRetention = async d => { try { setRet(await api("/api/admin/activity/retention", { method: "PUT", json: { days: d } })); notify(`The log now keeps ${d} days`); } catch (e) { notify(e.message, "err"); } };

  const evRow = e => [fmtDT(e.at), e.actor_name || "", e.email || "", e.app === "admin" ? "Dashboard" : "Customer app", appName(e.module),
    (EVENT[e.event] || [e.event])[0], eventDetail(e, appName), e.device || "", e.ip || ""];
  const EV_HEAD = ["Time (IST)", "Person", "Email", "Application", "Module", "Event", "Details", "Device", "IP"];
  const exportEvents = async kind => {
    try {
      const r = await api(`/api/admin/activity/events?${qs({ ...evQuery, limit: 5000, offset: 0 })}`);
      await exportRows("Activity log", EV_HEAD, r.rows.map(evRow), kind);
      notify(kind === "copy" ? `Copied ${plural(r.rows.length, "row")}. Paste into Excel.` : `Excel downloaded: ${plural(r.rows.length, "row")}`);
    } catch (e) { notify(e.message, "err"); }
  };
  const exportPeople = kind => exportRows("People and devices", ["Name", "Email", "Status now", "Devices", "Signed in now", "IP addresses", "Applications used", "Time used (min)", "Last active (IST)"],
    shownPeople.map(p => [p.name, p.email, p.active ? "Active now" : p.signed_in ? "Signed in" : "Signed out", p.devices, p.signed_in, p.ips,
      [...new Set(p.sessions.flatMap(s => s.modules))].map(appName).join(", "), p.minutes, fmtDT(p.last_seen)]), kind)
    .then(() => notify(kind === "copy" ? "Copied. Paste into Excel." : "Excel downloaded"));

  const shownPeople = (people || []).filter(p => {
    const q = qp.trim().toLowerCase();
    if (q && !`${p.name} ${p.email} ${p.sessions.map(s => `${s.ip} ${s.last_ip} ${s.device}`).join(" ")}`.toLowerCase().includes(q)) return false;
    return pf === "all" || (pf === "active" && p.active) || (pf === "in" && p.signed_in) || (pf === "multi" && p.devices >= 3);
  });
  if (!sum || !people || !users) return <div style={{ padding: 30, color: "var(--t3)" }}>Loading the activity log…</div>;
  const k = sum.kpis;
  const totalMin = Math.max(1, ...modules.map(m => m.minutes));
  const TH = "am-th";
  return (
    <div className="am" style={{ padding: "18px 22px" }}>
      <style>{AM_CSS}</style>
      <SectionTitle icon="📜" title="Activity log" sub="Who signed in, from which device, which application they used, when and for how long. Customer app (/app) and dashboard sign-ins. Times are IST."
        right={<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Seg items={RANGES} value={rk} onChange={setRk} id="al-range"/>
          {rk === "custom" && <>
            <input type="date" value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} style={input} aria-label="From"/>
            <input type="date" value={custom.to} min={custom.from} max={istDay()} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} style={input} aria-label="To"/></>}
          <button style={btn()} onClick={() => setTick(t => t + 1)} disabled={loading} id="al-refresh"
            title="Load the newest sign-ins, devices and usage now. Your date range, filters and open rows stay as they are — nothing is reset.">
            {loading ? "Refreshing…" : "⟳ Refresh log"}</button>
          {updated && <span className="am-live" id="al-live" title="The log also refreshes by itself every minute while this page is open">
            <Dot color="var(--long)" pulse/>Last updated {fmtTime(updated)} · auto every minute</span>}
        </div>}/>

      <div className="am-kpis" id="al-kpis">
        <Kpi id="kpi-active" label={<><Dot color="var(--long)" pulse={k.active_now > 0}/> Active now</>} value={k.active_now} color={k.active_now ? "var(--long)" : undefined} sub="customers seen in the last 5 min" tip="Customers whose app was open and in use in the last 5 minutes"/>
        <Kpi label="People" value={k.people} sub={`used the app ${rk === "1" ? "today" : "in this period"}`} tip={`${sum.from} → ${sum.to} (IST)`}/>
        <Kpi label="Sign-ins" value={k.signins} sub={`${plural(k.signups, "new sign-up")}`}/>
        <Kpi label="Failed sign-ins" value={k.failed} color={k.failed ? "var(--short)" : undefined} sub="wrong password, locked, blocked…"/>
        <Kpi label="Devices signed in" value={k.devices_signed_in} sub="sessions open now (7-day sign-in)"/>
        <Kpi id="kpi-multi" label="3 or more devices" value={k.multi_device} color={k.multi_device ? "var(--mixed)" : undefined} sub={k.multi_device ? "possible shared accounts — check" : "no shared-account signs"} tip="Accounts used from 3 or more different browsers / systems in this period"/>
        <Kpi label="Time used" value={mins(k.minutes)} sub="all applications"/>
      </div>

      <div className="am-grid2">
        <FocusCard icon="🧩" title="Usage by application" sub="People, visits and time spent in each application of the customer app in this period.">
          <div className="am-apps" id="al-apps">
            {modules.map(m => (
              <div key={m.key} className="am-arow">
                <span className="am-aic"><AppIcon k={m.key} size={17}/></span>
                <div style={{ minWidth: 0 }}>
                  <div className="am-an">{m.name}{!m.enabled && <Badge color="var(--short)">off</Badge>}</div>
                  <div className="am-ubar" title={`${mins(m.minutes)} used`}><div style={{ width: `${m.minutes / totalMin * 100}%` }}/></div>
                </div>
                <div className="am-astat"><b>{m.people}</b><span>people</span></div>
                <div className="am-astat"><b>{m.opens}</b><span>visits</span></div>
                <div className="am-astat wide"><b>{mins(m.minutes)}</b><span>time used</span></div>
              </div>))}
          </div>
        </FocusCard>
        <FocusCard icon="📈" title="People per day" sub="Customers who used the app each day (IST).">
          <DailyBars days={sum.days}/>
          <div className="am-sec" style={{ marginTop: 12 }}>When they use it</div>
          <HourStrip hours={sum.hours}/>
        </FocusCard>
      </div>

      {sum.top.length > 0 && (
        <FocusCard icon="🏅" title="Most active customers" sub="By time spent in this period. Click a name for the full picture." style={{ marginBottom: 12 }}>
          <div className="am-top">
            {sum.top.map((t, i) => (
              <button key={t.id} type="button" className="am-topi" onClick={() => setPerson(t.id)}>
                <span className="am-rank">{i + 1}</span>
                <span style={{ minWidth: 0, textAlign: "left" }}><b>{t.name}</b><span className="am-mut" style={{ display: "block" }}>{mins(t.minutes)} · {plural(t.devices, "device")}</span></span>
                <span className="am-topa">{t.modules.map(m => <span key={m} title={appName(m)}><AppIcon k={m} size={13}/></span>)}</span>
              </button>))}
          </div>
        </FocusCard>
      )}

      <div className="am-vbar">
        <Seg id="al-view" value={view} onChange={setView} items={[["people", `👤 People & devices (${people.length})`], ["events", `🧾 Event log${ev ? ` (${ev.total.toLocaleString()})` : ""}`], ["admins", `🛡 Dashboard sign-ins (${users.length})`]]}/>
      </div>

      {view === "people" && (
        <FocusCard icon="👤" title={`People & devices (${shownPeople.length})`} sub="Each customer seen in this period or still signed in, with every device (browser / system) and session. A device = one browser on one computer or phone. Sign a device out and it must sign in again."
          right={<>
            <button style={btn()} onClick={() => exportPeople("copy")} disabled={!shownPeople.length}>📋 Copy</button>
            <button style={btn(true)} onClick={() => exportPeople("xlsx")} disabled={!shownPeople.length}>⬇ Excel</button></>}>
          <div className="am-tools">
            {[["all", "All"], ["active", "Active now"], ["in", "Signed in"], ["multi", "3+ devices"]].map(([kk, l]) => <Pill key={kk} active={pf === kk} onClick={() => setPf(kk)}>{l} · {(people || []).filter(p => kk === "all" || (kk === "active" && p.active) || (kk === "in" && p.signed_in) || (kk === "multi" && p.devices >= 3)).length}</Pill>)}
            <input placeholder="Search name, email, IP, device" value={qp} onChange={e => setQp(e.target.value)} style={{ ...input, width: 240 }} id="al-psearch"/>
          </div>
          <div className="am-tw tower-scroll" style={{ maxHeight: 620 }}>
            <table className="am-t" id="al-people">
              <thead><tr>{["", "Customer", "Now", "Devices", "Applications used", "Time used", "Last active", ""].map((h, i) => <th key={i} className={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {shownPeople.map(p => {
                  const isOpen = openRow[p.id]; const apps = [...new Set(p.sessions.flatMap(s => s.modules))];
                  return (
                    <React.Fragment key={p.id}>
                      <tr className={`am-tr ${isOpen ? "open" : ""}`} onClick={() => setOpenRow(o => ({ ...o, [p.id]: !o[p.id] }))}>
                        <td className="am-caret">{isOpen ? "▾" : "▸"}</td>
                        <td><button type="button" className="am-link" onClick={e => { e.stopPropagation(); setPerson(p.id); }}>{p.name}</button><div className="am-mut">{p.email}</div></td>
                        <td>{p.active ? <Badge color="var(--long)"><Dot color="var(--long)" pulse/> Active now</Badge> : p.signed_in ? <Badge color="var(--acc)">Signed in</Badge> : <span className="am-mut">Signed out</span>}</td>
                        <td><span className={`am-devn ${p.devices >= 3 ? "warn" : ""}`} title={`${plural(p.devices, "device")} · ${plural(p.ips, "IP address", )}`}>{p.devices}</span>
                          <span className="am-mut"> {p.signed_in ? `· ${p.signed_in} signed in` : ""}</span>{p.devices >= 3 && <div style={{ fontSize: 10.5, color: "var(--mixed)" }}>possible sharing</div>}</td>
                        <td>{apps.length ? <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{apps.map(m => <span key={m} className="am-chip sm"><AppIcon k={m} size={12}/>{appName(m)}</span>)}</div> : <span className="am-mut">—</span>}</td>
                        <td className="am-num">{mins(p.minutes)}</td>
                        <td title={fmtDT(p.last_seen)}>{ago(p.last_seen)}</td>
                        <td onClick={e => e.stopPropagation()}>{p.signed_in > 0 && <button style={{ ...btn(false, true), padding: "3px 9px", fontSize: 11 }} onClick={() => signoutAll(p)}>Sign out all</button>}</td>
                      </tr>
                      {isOpen && (
                        <tr className="am-sub"><td/><td colSpan={7}>
                          <table className="am-t inner">
                            <thead><tr>{["Device", "IP address", "Signed in", "Last active", "Status", "Applications", "Time", ""].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
                            <tbody>{p.sessions.map(s => (
                              <tr key={s.id}>
                                <td><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><DeviceIcon label={s.device}/><b>{s.device}</b></span><div className="am-mut mono">device {(s.device_id || "").slice(0, 8)}</div></td>
                                <td className="mono">{s.last_ip || s.ip}{s.ip && s.last_ip && s.ip !== s.last_ip && <div className="am-mut">signed in from {s.ip}</div>}</td>
                                <td>{fmtDT(s.created_at)}</td>
                                <td title={fmtDT(s.last_seen)}>{ago(s.last_seen)}</td>
                                <td><Badge color={STATUS[s.status][1]}>{STATUS[s.status][0]}</Badge>{s.ended_at && <div className="am-mut">{fmtDT(s.ended_at)}</div>}</td>
                                <td>{s.modules.length ? s.modules.map(m => <span key={m} title={appName(m)} style={{ marginRight: 4, color: "var(--acc)" }}><AppIcon k={m} size={13}/></span>) : <span className="am-mut">—</span>}</td>
                                <td className="am-num">{mins(s.minutes)}</td>
                                <td>{(s.status === "active" || s.status === "idle") && <button className="am-revoke" style={{ ...btn(), padding: "3px 9px", fontSize: 11 }} onClick={() => revoke(s.id)}>Sign out device</button>}</td>
                              </tr>))}</tbody>
                          </table>
                        </td></tr>)}
                    </React.Fragment>);
                })}
                {!shownPeople.length && <tr><td colSpan={8}><Empty>No customer activity in this period.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        </FocusCard>
      )}

      {view === "events" && (
        <FocusCard icon="🧾" title="Event log" sub="Every sign-in, sign-out, failed attempt, application opened and admin change, newest first. Click a name to see that customer's full picture."
          right={<>
            <button style={btn()} onClick={() => exportEvents("copy")} disabled={!ev || !ev.total} id="ev-copy">📋 Copy</button>
            <button style={btn(true)} onClick={() => exportEvents("xlsx")} disabled={!ev || !ev.total} id="ev-xlsx">⬇ Excel</button></>}>
          <div className="am-tools">
            {EVENT_GROUPS.map(([kk, l]) => <Pill key={kk} active={evF.group === kk} onClick={() => setEvF(f => ({ ...f, group: kk }))}>{l}</Pill>)}
          </div>
          <div className="am-tools">
            <select value={evF.app} onChange={e => setEvF(f => ({ ...f, app: e.target.value }))} style={input} aria-label="Application" id="ev-app">
              <option value="">Customer app + dashboard</option><option value="customer">Customer app (/app)</option><option value="admin">Dashboard (admin)</option></select>
            <select value={evF.module} onChange={e => setEvF(f => ({ ...f, module: e.target.value }))} style={input} aria-label="Module" id="ev-module">
              <option value="">Every application</option>{modules.map(m => <option key={m.key} value={m.key}>{m.name}</option>)}</select>
            <input placeholder="Search person, email, IP, device" value={evF.q} onChange={e => setEvF(f => ({ ...f, q: e.target.value }))} style={{ ...input, width: 240 }} id="ev-search"/>
          </div>
          {!ev ? <Empty>Loading…</Empty> : <>
            <div className="am-tw tower-scroll" style={{ maxHeight: 640 }}>
              <table className="am-t" id="ev-table">
                <thead><tr>{["Time (IST)", "Person", "Application", "Event", "Details", "Device", "IP"].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {ev.rows.map(e => { const [l, col] = EVENT[e.event] || [e.event, "var(--t2)"]; return (
                    <tr key={e.id}>
                      <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDay(e.at)}<div className="am-mut">{fmtTime(e.at)}</div></td>
                      <td>{e.actor_kind === "customer" && e.actor_id
                        ? <button type="button" className="am-link" onClick={() => setPerson(+e.actor_id)}>{e.actor_name}</button>
                        : <b>{e.actor_name || "—"}</b>}
                        <div className="am-mut">{e.actor_kind === "user" ? (e.actor_id ? "dashboard user" : "unknown user") : e.email || (e.actor_id ? "" : "no account")}</div></td>
                      <td>{e.app === "admin" ? <Badge color="var(--ret)">Dashboard</Badge> : <Badge color="var(--acc)">Customer app</Badge>}
                        {e.module && <div className="am-mut" style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 3 }}><AppIcon k={e.module} size={12}/>{appName(e.module)}</div>}</td>
                      <td><Badge color={col}>{l}</Badge></td>
                      <td className="am-det">{eventDetail(e, appName) || <span className="am-mut">—</span>}</td>
                      <td>{e.device ? <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><DeviceIcon label={e.device}/>{e.device}</span> : "—"}</td>
                      <td className="mono">{e.ip || "—"}</td>
                    </tr>); })}
                  {!ev.rows.length && <tr><td colSpan={7}><Empty>No events match these filters.</Empty></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="am-pager">
              <span className="am-mut">{ev.total ? `${(page * PAGE + 1).toLocaleString()}–${Math.min(ev.total, (page + 1) * PAGE).toLocaleString()} of ${ev.total.toLocaleString()}` : "0 events"}</span>
              <button style={btn()} disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Newer</button>
              <button style={btn()} disabled={(page + 1) * PAGE >= ev.total} onClick={() => setPage(p => p + 1)} id="ev-next">Older ›</button>
            </div>
          </>}
        </FocusCard>
      )}

      {view === "admins" && (
        <FocusCard icon="🛡" title="Dashboard sign-ins" sub="Sign-ins to this admin dashboard (users from config.ini) in this period. Unknown names are failed attempts with a user ID that does not exist.">
          <div className="am-tw tower-scroll">
            <table className="am-t" id="al-admins">
              <thead><tr>{["User", "Role", "Sign-ins", "Failed", "Last sign-in", "Devices", "IP addresses", "Used from"].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.name}>
                    <td><b>{u.name}</b></td>
                    <td>{u.exists ? <Badge color={u.admin ? "var(--ret)" : "var(--acc)"}>{u.admin ? "admin" : "user"}</Badge> : <Badge color="var(--short)">unknown</Badge>}</td>
                    <td className="am-num">{u.signins}</td>
                    <td className="am-num" style={{ color: u.failed ? "var(--short)" : undefined }}>{u.failed}</td>
                    <td>{u.last_login ? fmtDT(u.last_login) : "—"}</td>
                    <td className="am-num">{u.devices}</td>
                    <td className="am-num">{u.ips}</td>
                    <td>{(u.device_names || []).join(", ") || "—"}</td>
                  </tr>))}
                {!users.length && <tr><td colSpan={8}><Empty>No dashboard sign-ins in this period.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        </FocusCard>
      )}

      {ret && (
        <FocusCard icon="🗄" title="Keep the log for" style={{ marginTop: 12 }}
          sub={`Older events, finished sessions and minutes are removed once a day. ${ret.events.toLocaleString()} events stored${ret.oldest ? `, oldest ${fmtDay(ret.oldest)}` : ""}.`}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} id="al-retention">
            {ret.choices.map(d => <Pill key={d} active={ret.days === d} onClick={() => ret.days !== d && setRetention(d)}>{d >= 365 ? `${d / 365} year${d > 365 ? "s" : ""}` : `${d} days`}</Pill>)}
          </div>
        </FocusCard>
      )}

      {person && <PersonDrawer api={api} notify={notify} cid={person} appName={appName} onClose={() => setPerson(null)} onChanged={() => setTick(t => t + 1)}/>}
    </div>
  );
}

// ─── 🔐 ACCESS MANAGER ───────────────────────────────────────────────────────
const NEW_ROLE = { id: null, name: "", description: "", modules: [], is_default: false, is_system: false, users: 0 };

function Switch({ on, onChange, label, disabled, id }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} id={id} className={`am-sw ${on ? "on" : ""}`} onClick={() => onChange(!on)}><span/></button>;
}

function RolePicker({ roles, value, onSave, onClose }) {
  const [sel, setSel] = useState(value);
  return (
    <div className="am-pop" onClick={e => e.stopPropagation()}>
      <div className="am-sec" style={{ marginTop: 0 }}>Roles for this customer</div>
      {roles.map(r => (
        <label key={r.id} className="am-check">
          <input type="checkbox" checked={sel.includes(r.id)} onChange={() => setSel(s => s.includes(r.id) ? s.filter(x => x !== r.id) : [...s, r.id])}/>
          <span><b>{r.name}</b>{r.is_default && <span className="am-mut"> · default</span>}<span className="am-mut" style={{ display: "block" }}>{r.modules.length ? `${r.modules.length} application${r.modules.length > 1 ? "s" : ""}` : "no applications"}</span></span>
        </label>))}
      {!sel.length && <div style={{ fontSize: 11, color: "var(--short)", margin: "4px 0" }}>Pick at least one role (block the account to stop all access).</div>}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
        <button style={btn()} onClick={onClose}>Cancel</button>
        <button style={btn(true)} disabled={!sel.length} onClick={() => onSave(sel)} id="rp-save">Save roles</button>
      </div>
    </div>);
}

export function AccessTab({ api, notify }) {
  const [acc, setAcc] = useState(null); const [custs, setCusts] = useState(null);
  const [selId, setSelId] = useState(null); const [form, setForm] = useState(null); const [confirmDel, setConfirmDel] = useState(false);
  const [sec, setSec] = useState(() => { try { return localStorage.getItem("hp_access_sec") || "roles"; } catch { return "roles"; } });
  const goSec = k => { setSec(k); try { localStorage.setItem("hp_access_sec", k); } catch { /* storage blocked */ } };
  const [appEdit, setAppEdit] = useState({});
  const [q, setQ] = useState(""); const [roleF, setRoleF] = useState(""); const [picked, setPicked] = useState([]);
  const [bulkRole, setBulkRole] = useState(""); const [pickerFor, setPickerFor] = useState(null); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([api("/api/admin/access"), api("/api/admin/customers")]);
    setAcc(a); setCusts(c); return a;
  }, []);
  useEffect(() => { load().then(a => { const d = a.roles.find(r => r.is_default) || a.roles[0]; if (d) { setSelId(d.id); setForm({ ...d }); } }).catch(e => notify(e.message, "err")); }, []);
  useEffect(() => { const h = () => setPickerFor(null); document.addEventListener("click", h); return () => document.removeEventListener("click", h); }, []);

  const run = async (fn, ok) => {
    setBusy(true);
    try {
      const r = await fn();
      // every change can move role counts and customers' plans: reload both
      const [a, c] = await Promise.all([api("/api/admin/access"), api("/api/admin/customers")]);
      setAcc(a); setCusts(c);
      if (ok) notify(typeof ok === "function" ? ok(r) : ok); return r;
    }
    catch (e) { notify(e.message, "err"); return null; }
    finally { setBusy(false); }
  };
  if (!acc || !custs || !form) return <div style={{ padding: 30, color: "var(--t3)" }}>Loading the access manager…</div>;

  const mods = acc.modules, roles = acc.roles;
  const roleById = Object.fromEntries(roles.map(r => [r.id, r]));
  const defRole = roles.find(r => r.is_default);
  const appsOf = c => mods.filter(m => m.enabled && (c.roles || []).some(rid => (roleById[rid] || { modules: [] }).modules.includes(m.key)));
  const sel = form.id ? roleById[form.id] : null;
  const dirty = !sel || form.name !== sel.name || form.description !== sel.description || form.is_default !== sel.is_default
    || form.modules.slice().sort().join() !== sel.modules.slice().sort().join();
  const pick = r => { setSelId(r ? r.id : null); setForm(r ? { ...r, modules: [...r.modules] } : { ...NEW_ROLE }); setConfirmDel(false); };
  if (form.id && !sel) { pick(defRole || null); return null; }      // the selected role was removed elsewhere
  const toggleMod = k => setForm(f => ({ ...f, modules: f.modules.includes(k) ? f.modules.filter(x => x !== k) : mods.map(m => m.key).filter(x => x === k || f.modules.includes(x)) }));
  const save = async () => {
    const body = { name: form.name, description: form.description, modules: form.modules, ...(form.is_default && !(sel && sel.is_default) ? { is_default: true } : {}) };
    const r = await run(() => form.id ? api(`/api/admin/roles/${form.id}`, { method: "PATCH", json: body }) : api("/api/admin/roles", { method: "POST", json: body }),
      form.id ? `Role “${form.name.trim()}” saved` : `Role “${form.name.trim()}” created`);
    if (r) { const id = form.id || r.id; const nr = r.roles.find(x => x.id === id); setSelId(id); setForm({ ...nr, modules: [...nr.modules] }); }
  };
  const duplicate = async () => {
    const r = await run(() => api(`/api/admin/roles/${form.id}/duplicate`, { method: "POST" }), "Role copied — rename it and pick its applications");
    if (r) { const nr = r.roles.find(x => x.id === r.id); setSelId(nr.id); setForm({ ...nr, modules: [...nr.modules] }); }
  };
  const remove = async () => {
    const { id, name } = form;
    pick(defRole);                                     // leave the role before it disappears from the list
    const r = await run(() => api(`/api/admin/roles/${id}`, { method: "DELETE" }), x => `Role “${name}” deleted${x.moved ? ` · ${plural(x.moved, "customer")} moved to ${defRole.name}` : ""}`);
    if (!r) pick(roleById[id]);
  };
  const saveApp = (m, patch, msg) => run(() => api(`/api/admin/modules/${m.key}`, { method: "PATCH", json: patch }), msg).then(r => { if (r) setAppEdit(e => ({ ...e, [m.key]: undefined })); });

  const ql = q.trim().toLowerCase();
  const shown = custs.filter(c => (!ql || `${c.name} ${c.email}`.toLowerCase().includes(ql)) && (!roleF || (c.roles || []).includes(+roleF)));
  const allPicked = shown.length > 0 && shown.every(c => picked.includes(c.id));
  const bulk = async mode => {
    const rid = +bulkRole; if (!rid || !picked.length) return;
    const r = await run(() => api("/api/admin/roles/bulk", { method: "POST", json: { customer_ids: picked, [mode]: [rid] } }),
      x => `${roleById[rid].name}: ${mode === "add" ? "added to" : "removed from"} ${plural(x.changed, "customer")}${x.skipped ? ` · ${x.skipped} skipped (it was their only role)` : ""}`);
    if (r) setPicked([]);
  };
  const setRoles = (c, ids) => run(() => api(`/api/admin/customers/${c.id}/roles`, { method: "PUT", json: { role_ids: ids } }), `${c.name}: plan saved`).then(() => setPickerFor(null));
  const canOpen = k => custs.filter(c => c.status === "approved" && appsOf(c).some(m => m.key === k)).length;

  const SECTIONS = [
    ["roles", "Roles", roles.length, "Create and edit plans", <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6 6 0 0 1 3.5 6"/></>],
    ["users", "User access mapping", custs.length, "Which customer has which role", <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h4M7 13h10M7 17h6"/><circle cx="16.5" cy="9" r="1.5"/></>],
    ["apps", "Application manager", mods.length, "Names, descriptions, on / off", <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>],
  ];
  return (
    <div className="am" style={{ padding: "18px 22px" }}>
      <style>{AM_CSS}</style>
      <SectionTitle icon="🔐" title="Access manager" sub="Choose which applications of the customer app (/app) each customer can open. Applications are grouped into roles; a customer can hold several roles and gets every application in them. New customers get the default role."/>
      <div className="am-shell">
        <nav className="am-snav" aria-label="Access manager sections" id="am-snav">
          {SECTIONS.map(([k, label, n, hint, icon]) => (
            <button key={k} type="button" className={`am-sn ${sec === k ? "on" : ""}`} onClick={() => goSec(k)} aria-current={sec === k ? "page" : undefined} id={`am-sec-${k}`}>
              <span className="am-sni"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg></span>
              <span className="am-snt"><b>{label}</b><span>{hint}</span></span>
              <span className="am-snn">{n}</span>
            </button>))}
        </nav>
        <div className="am-pane">
          {sec === "roles" && (
            <div className="am-roles">
              <FocusCard icon="🎭" title={`Roles (${roles.length})`} sub="Click a role to edit it." right={<button style={btn(true)} onClick={() => pick(null)} id="role-new">＋ New role</button>}>
                <div className="am-rlist" id="role-list">
                  {roles.map(r => (
                    <button key={r.id} type="button" className={`am-rcard ${selId === r.id && form.id ? "on" : ""}`} onClick={() => pick(r)} data-role={r.name}>
                      <div className="am-rt"><b>{r.name}</b>{r.is_default && <Badge color="var(--long)">default</Badge>}{r.is_system && <Badge color="var(--t3)" title="Built-in: can be edited, never deleted">built-in</Badge>}</div>
                      {r.description && <div className="am-mut am-rd">{r.description}</div>}
                      <div className="am-rf">
                        <span className="am-mut">{r.modules.length ? `${r.modules.length} of ${mods.length} applications` : "No application"}</span>
                        <span className="am-mut">{plural(r.users, "customer")}</span>
                      </div>
                    </button>))}
                  {!form.id && <div className="am-rcard on new"><div className="am-rt"><b>New role</b></div><div className="am-mut">Fill in the form →</div></div>}
                </div>
              </FocusCard>

              <FocusCard icon={form.id ? "✏️" : "＋"} title={form.id ? `Edit role: ${sel.name}` : "Create a role"}
                sub={form.id ? `${plural(sel.users, "customer")} hold this role · last changed ${fmtDT(sel.updated_at)}${sel.updated_by ? ` by ${sel.updated_by}` : ""}` : "Name it after the plan, e.g. “Trial”, “Investor”, “Pro”."}>
                <div className="am-form" id="role-form">
                  <label className="am-fl">Role name<input value={form.name} maxLength={40} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Pro plan" style={input} id="role-name"/></label>
                  <label className="am-fl">Description<input value={form.description} maxLength={200} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What this plan is for" style={input} id="role-desc"/></label>
                  <div className="am-fl am-flrow">Applications in this role<span style={{ flex: 1 }}/>
                    <span className="am-flr">{form.modules.length} of {mods.length} ·{" "}
                      <button type="button" className="am-link" style={{ fontSize: 11.5 }} id="role-all"
                        onClick={() => setForm(f => ({ ...f, modules: f.modules.length === mods.length ? [] : mods.map(m => m.key) }))}>{form.modules.length === mods.length ? "Clear all" : "Select all"}</button></span></div>
                  <div className="am-mods">
                    {mods.map(m => { const on = form.modules.includes(m.key); return (
                      <button key={m.key} type="button" className={`am-mod ${on ? "on" : ""}`} onClick={() => toggleMod(m.key)} aria-pressed={on} data-mod={m.key}>
                        <span className="am-mic"><AppIcon k={m.key} size={18}/></span>
                        <span style={{ minWidth: 0, textAlign: "left" }}><b>{m.name}</b>{!m.enabled && <Badge color="var(--short)">off for everyone</Badge>}<span className="am-mut" style={{ display: "block" }}>{m.description}</span></span>
                        <span className={`am-tick ${on ? "on" : ""}`}>{on ? "✓" : ""}</span>
                      </button>); })}
                  </div>
                  <label className={`am-defrow ${form.is_default ? "on" : ""}`}>
                    <Switch on={form.is_default} disabled={!!(sel && sel.is_default)} onChange={v => setForm(f => ({ ...f, is_default: v }))} label="Default role" id="role-default"/>
                    <span><b>Default role for new customers</b><span className="am-mut" style={{ display: "block" }}>{sel && sel.is_default ? "This is the default. To change it, open another role and make that one the default." : `Every new sign-up gets this role.${defRole ? ` Replaces “${defRole.name}” as the default.` : ""}`}</span></span>
                  </label>
                  {form.is_default && !form.modules.length && <div style={{ fontSize: 11.5, color: "var(--short)" }}>The default role needs at least one application.</div>}
                  <div className="am-factions">
                    <button style={btn(true)} disabled={busy || !dirty || form.name.trim().length < 2 || (form.is_default && !form.modules.length)} onClick={save} id="role-save">{form.id ? "Save changes" : "Create role"}</button>
                    {form.id && dirty && <button style={btn()} onClick={() => pick(sel)}>Discard</button>}
                    {!form.id && <button style={btn()} onClick={() => pick(defRole)}>Cancel</button>}
                    <span style={{ flex: 1 }}/>
                    {form.id && <button style={btn()} disabled={busy} onClick={duplicate} id="role-dup">⧉ Duplicate</button>}
                    {form.id && !sel.is_system && !sel.is_default && (confirmDel
                      ? <span className="am-confirm">Delete “{sel.name}”?{sel.users ? ` ${plural(sel.users, "customer")} hold it; anyone left with no role moves to “${defRole.name}”.` : ""}
                          <button style={btn(false, true)} onClick={remove} id="role-del-yes">Delete</button><button style={btn()} onClick={() => setConfirmDel(false)}>Keep</button></span>
                      : <button style={btn(false, true)} onClick={() => setConfirmDel(true)} id="role-del">Delete</button>)}
                    {form.id && (sel.is_system || sel.is_default) && <span className="am-mut" style={{ fontSize: 11 }}>{sel.is_system ? "Built-in role: cannot be deleted" : "Default role: cannot be deleted"}</span>}
                  </div>
                  {form.id && sel.users > 0 && <button type="button" className="am-link" style={{ alignSelf: "flex-start", fontSize: 12 }} id="role-show-users"
                    onClick={() => { setRoleF(String(sel.id)); goSec("users"); }}>Show the {plural(sel.users, "customer")} with this role →</button>}
                </div>
              </FocusCard>
            </div>)}

          {sec === "users" && (
            <FocusCard icon="👥" title={`User access mapping (${shown.length})`} sub="Give each customer one or more roles. Tick several customers to add or remove a role in one go. Changes apply straight away, without signing them out.">
              <div className="am-tools">
                <input placeholder="Search name or email" value={q} onChange={e => setQ(e.target.value)} style={{ ...input, width: 220 }} id="cr-search"/>
                <select value={roleF} onChange={e => setRoleF(e.target.value)} style={input} aria-label="Filter by role" id="cr-role">
                  <option value="">Every role</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name} ({r.users})</option>)}</select>
                {(q || roleF) && <button style={btn()} onClick={() => { setQ(""); setRoleF(""); }}>✕ Clear</button>}
              </div>
              {picked.length > 0 && (
                <div className="am-bulk" id="cr-bulk">
                  <b>{plural(picked.length, "customer")} selected</b>
                  <select value={bulkRole} onChange={e => setBulkRole(e.target.value)} style={input} aria-label="Role" id="cr-bulk-role">
                    <option value="">Pick a role…</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                  <button style={btn(true)} disabled={!bulkRole || busy} onClick={() => bulk("add")} id="cr-bulk-add">＋ Add role</button>
                  <button style={btn()} disabled={!bulkRole || busy} onClick={() => bulk("remove")} id="cr-bulk-remove">－ Remove role</button>
                  <span style={{ flex: 1 }}/>
                  <button style={btn()} onClick={() => setPicked([])}>Clear selection</button>
                </div>)}
              <div className="am-tw tower-scroll" style={{ maxHeight: 620 }}>
                <table className="am-t" id="cr-table">
                  <thead><tr>
                    <th className="am-th" style={{ width: 30 }}><input type="checkbox" checked={allPicked} aria-label="Select all"
                      onChange={() => setPicked(p => allPicked ? p.filter(id => !shown.some(c => c.id === id)) : [...new Set([...p, ...shown.map(c => c.id)])])}/></th>
                    {["Customer", "Status", "Roles", "Applications", "Last login", ""].map(h => <th key={h} className="am-th">{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.map(c => { const apps = appsOf(c); return (
                      <tr key={c.id} className={picked.includes(c.id) ? "am-picked" : ""}>
                        <td><input type="checkbox" checked={picked.includes(c.id)} aria-label={`Select ${c.name}`} onChange={() => setPicked(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])}/></td>
                        <td><b>{c.name}</b><div className="am-mut">{c.email}</div></td>
                        <td><Badge color={c.status === "approved" ? "var(--long)" : c.status === "blocked" ? "var(--short)" : "var(--mixed)"}>{c.status === "approved" ? "active" : c.status}</Badge></td>
                        <td><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{(c.roles || []).map(rid => roleById[rid] && <span key={rid} className="am-chip role">{roleById[rid].name}</span>)}</div></td>
                        <td>{apps.length
                          ? <span className="am-appcount" title={apps.map(m => m.name).join(" · ")}><b>{apps.length}</b> of {mods.length}
                              <span className="am-appicons">{apps.slice(0, 6).map(m => <AppIcon key={m.key} k={m.key} size={13}/>)}{apps.length > 6 && <span>+{apps.length - 6}</span>}</span></span>
                          : <span style={{ color: "var(--short)", fontSize: 11.5 }}>No application</span>}</td>
                        <td>{c.last_login ? fmtDT(c.last_login) : "—"}</td>
                        <td style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
                          <button style={{ ...btn(), padding: "3px 9px", fontSize: 11 }} onClick={() => setPickerFor(pickerFor === c.id ? null : c.id)} data-edit-roles={c.email}>Edit roles</button>
                          {pickerFor === c.id && <RolePicker roles={roles} value={c.roles || []} onClose={() => setPickerFor(null)} onSave={ids => setRoles(c, ids)}/>}
                        </td>
                      </tr>); })}
                    {!shown.length && <tr><td colSpan={7}><Empty>No customers match.</Empty></td></tr>}
                  </tbody>
                </table>
              </div>
            </FocusCard>)}

          {sec === "apps" && (
            <FocusCard icon="🧩" title={`Application manager (${mods.length})`} sub="The applications of the customer app. Keep each name and description clear: customers see them in their side menu and at the top of each page. Switch one off to hide it from everyone (for example during maintenance).">
              <div className="am-applist" id="app-list">
                {mods.map(m => { const ed = appEdit[m.key]; const inRoles = roles.filter(r => r.modules.includes(m.key)); const n = canOpen(m.key); return (
                  <div key={m.key} className={`am-app ${m.enabled ? "" : "off"}`} data-app={m.key}>
                    <span className="am-mic lg"><AppIcon k={m.key} size={20}/></span>
                    {ed ? (
                      <div className="am-appf">
                        <label className="am-fl">Name<input value={ed.name} maxLength={60} onChange={e => setAppEdit(x => ({ ...x, [m.key]: { ...ed, name: e.target.value } }))} style={input} className="app-name"/></label>
                        <label className="am-fl" style={{ flex: 2 }}>Description<input value={ed.description} maxLength={200} onChange={e => setAppEdit(x => ({ ...x, [m.key]: { ...ed, description: e.target.value } }))} style={input} className="app-desc"/></label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={btn(true)} disabled={busy || ed.name.trim().length < 2} onClick={() => saveApp(m, ed, "Application saved")} className="app-save">Save</button>
                          <button style={btn()} onClick={() => setAppEdit(x => ({ ...x, [m.key]: undefined }))}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="am-appb">
                        <div className="am-apph"><b>{m.name}</b><span className="am-mut mono">/{m.key}</span>
                          <Badge color={m.enabled ? "var(--long)" : "var(--short)"}>{m.enabled ? "on" : "off for everyone"}</Badge></div>
                        <div className="am-appd">{m.description || <span className="am-mut">No description yet</span>}</div>
                        <div className="am-appm">
                          <span><b>{n}</b> active customer{n === 1 ? "" : "s"} can open it</span>
                          <span className="am-dotsep"/>
                          <span>{inRoles.length ? <>In {inRoles.map(r => <span key={r.id} className="am-chip role sm" style={{ marginLeft: 4 }}>{r.name}</span>)}</> : <b style={{ color: "var(--short)" }}>Not in any role yet</b>}</span>
                        </div>
                      </div>)}
                    {!ed && (
                      <div className="am-appa">
                        <button style={btn()} onClick={() => setAppEdit(x => ({ ...x, [m.key]: { name: m.name, description: m.description } }))} className="app-edit">Edit</button>
                        <span className="am-swl"><Switch on={m.enabled} onChange={v => saveApp(m, { enabled: v }, v ? `${m.name} is on again` : `${m.name} is switched off for everyone`)} label={`${m.name} on/off`} id={`app-sw-${m.key}`}/>
                          <span style={{ color: m.enabled ? "var(--long)" : "var(--short)" }}>{m.enabled ? "On" : "Off"}</span></span>
                      </div>)}
                  </div>); })}
              </div>
            </FocusCard>)}
        </div>
      </div>
    </div>
  );
}

const AM_CSS = `
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
