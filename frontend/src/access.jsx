// Admin → 📜 Activity log and 🔐 Access manager (owner, 2026-10-27).
// Access manager = RBAC for the customer app (/app) only: applications (its modules) → roles → customers.
// Activity log = who signed in, from which device, which application they used, when and for how long.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { FocusCard, Pill, SectionTitle } from "./dashboard.jsx";
import { AM_CSS, APP_SVG, AppIcon, Badge, Empty, IST_DATE, LockIcon, Switch, TZ, ago, btn, fmtDT, fmtDay, fmtTime, input, istDay, mins, plural } from "./access/shared.jsx";

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
  detail:          ["Stock detail viewed", "var(--mixed)"],
  perm_updated:    ["Permission updated", "var(--ret)"],
  grant_added:     ["Permission given directly", "var(--mixed)"],
  grant_removed:   ["Direct permission removed", "var(--ret)"],
  grant_expired:   ["Direct permission ended", "var(--t2)"],
};
const EVENT_GROUPS = [
  ["all", "All events", null],
  ["signin", "Sign-ins", "login,signup"],
  ["failed", "Failed & locked", "login_failed,locked"],
  ["out", "Sign-outs", "logout,session_revoked,signed_out_all"],
  ["open", "Applications opened", "open"],
  ["detail", "Stock detail views", "detail"],
  ["admin", "Admin changes", "roles_changed,role_created,role_updated,role_deleted,app_updated,perm_updated,grant_added,grant_removed,grant_expired,blocked,password_reset"],
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
    case "detail": return `${d.symbol || ""} · ${appName(e.module)}${d.date ? ` · ${d.date} ${d.part === "open" ? "day open" : "day end"}` : ""}`;
    case "login_failed": return REASON[d.reason] || "";
    case "locked": return `Locked for ${d.minutes || 15} min after 5 wrong passwords`;
    case "signup": return d.status === "pending" ? "Waiting for approval" : "Approved automatically";
    case "login": return e.app === "admin" ? (d.admin ? "Admin" : "User") : "";
    case "session_revoked": return `by ${d.by}`;
    case "signed_out_all": case "blocked": case "password_reset": return `by ${d.by}${d.devices ? ` · ${plural(d.devices, "device")} signed out` : ""}`;
    case "roles_changed": return `${(d.before || []).join(", ") || "—"} → ${(d.after || []).join(", ")} · by ${d.by}`;
    case "role_created": return `${d.role}${d.copied_from ? ` (copy of ${d.copied_from})` : ""}`;
    case "role_deleted": return `${d.role}${d.moved_to_default ? ` · ${plural(d.moved_to_default, "customer")} moved to the default role` : ""}`;
    case "perm_updated": return `${d.permission}${d.enabled === false ? " switched off" : d.enabled ? " switched on" : ""}${d.label ? ` · label “${d.label}”` : ""}${d.owner_level != null ? (d.owner_level ? " · now owner-level" : " · no longer owner-level") : ""}`;
    case "grant_added": return `${(d.permissions || []).join(", ")} · ${d.reason}${d.until ? ` · until ${d.until}` : ""} · by ${d.by}`;
    case "grant_removed": return `${(d.permissions || []).join(", ")} · by ${d.by}`;
    case "grant_expired": return `${d.permission} · last day ${d.until}`;
    case "role_updated": return `${d.role}${d.renamed_from ? ` (was ${d.renamed_from})` : ""}${d.default ? " · now the default" : ""}${(d.added || []).length ? ` · ＋ ${d.added.join(", ")}` : ""}${(d.removed || []).length ? ` · − ${d.removed.join(", ")}` : ""}${d.customers_changed ? ` · ${plural(d.customers_changed, "customer")} affected` : ""}`;
    case "app_updated": return `${appName(d.app)}${d.enabled === false ? " switched off" : d.enabled ? " switched on" : ""}${d.renamed_from ? ` (was ${d.renamed_from})` : ""}`;
    default: return "";
  }
}

const Dot = ({ color, pulse }) => <span className={`am-dot ${pulse ? "pulse" : ""}`} style={{ background: color }}/>;
export function Kpi({ label, value, sub, color, tip, id }) {
  return (
    <div className="am-kpi" title={tip} id={id}>
      <div className="am-kl">{label}</div>
      <div className="am-kv" style={{ color: color || "var(--t1)" }}>{value}</div>
      {sub && <div className="am-ks">{sub}</div>}
    </div>);
}

export function Seg({ items, value, onChange, id }) {
  return (
    <div className="am-seg" role="tablist" id={id}>
      {items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}
    </div>);
}

export function exportRows(name, header, rows, kind) {
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
export function PersonDrawer({ api, notify, cid, appName, onClose, onChanged }) {
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
          {(p.permissions || []).length > 0 && <>
            <div className="am-sec">Extra permissions</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} id="pd-perms">
              {p.permissions.map(x => <span key={x.key} className="am-chip" title={x.key}>{x.name} · {(p.apps.find(a => a.key === x.module) || {}).name}{x.restricted && <span className="am-own"><LockIcon size={10}/> owner-level</span>}</span>)}
            </div></>}
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

// Access manager v2 (permissions ↔ roles ↔ customers): its own files in ./access
export { AccessTab } from "./access/index.jsx";
