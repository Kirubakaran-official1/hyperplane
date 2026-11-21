// Admin → 🔭 Lens admin (owner 2026-11-21: "the Admin tab split into 2: Hyperplane admin and Lens admin"). Hyperplane LENS is a separate
// application (folder lens/, its own database and sign-in); this tab shows its data, asked from Lens's server by /api/admin/lens/* (main.py).
//   People    everyone who asked for Lens access: Approve / Block (requests waiting come first)
//   Sign-ins  every Lens sign-in attempt: who, when, result, device, address — filter by result, or one person's from People
//   Fyers Data Lab   connect Fyers, test what its API allows, the bulk download, data checks (fyerslab.jsx)
// Lens stopped = a plain "Lens is not running" here; nothing else in the dashboard depends on Lens.
import React, { useEffect, useState } from "react";
import { exportRows } from "./access.jsx";
import { fmtDay } from "./access/shared.jsx";
import { FyersLab } from "./fyerslab.jsx";

const CSS = `
.ln-adm{padding:18px 22px 40px;display:flex;flex-direction:column;gap:14px}
.ln-adm h2{margin:0;font-size:20px;color:var(--t1)}.ln-adm .sub{font-size:12.5px;color:var(--t2);margin-top:3px}
.ln-k{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.ln-k>div{background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:12px 14px}
.ln-k>div.warn{border-color:var(--mixed);background:color-mix(in srgb,var(--mixed) 10%,var(--s1))}
.ln-k span{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}
.ln-k b{display:block;margin-top:4px;font-size:22px;color:var(--t1)}
.ln-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ln-chips{display:inline-flex;gap:4px;flex-wrap:wrap}
.ln-chips button{border:1px solid var(--b2);background:var(--s1);color:var(--t2);font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;cursor:pointer}
.ln-chips button.on{border-color:var(--acc);color:var(--acc);background:var(--adim)}
.ln-tw{background:var(--s1);border:1px solid var(--b1);border-radius:12px;overflow:auto}
.ln-t{width:100%;border-collapse:collapse;font-size:12.5px}
.ln-t th{padding:9px 12px;text-align:left;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--t3);border-bottom:1px solid var(--b1);white-space:nowrap;background:var(--s2)}
.ln-t td{padding:10px 12px;border-bottom:1px solid var(--b1);color:var(--t1);vertical-align:middle;white-space:nowrap}
.ln-t tr:last-child td{border-bottom:0}.ln-t td small{display:block;font-size:11.5px;color:var(--t3)}.ln-t .num{text-align:right}
.ln-t tr[data-status=pending] td{background:color-mix(in srgb,var(--mixed) 8%,transparent)}
.ln-st{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:700}
.ln-st.approved,.ln-st.ok{background:color-mix(in srgb,var(--long) 14%,transparent);color:var(--long)}
.ln-st.pending{background:color-mix(in srgb,var(--mixed) 16%,transparent);color:var(--mixed)}
.ln-st.blocked,.ln-st.failed{background:color-mix(in srgb,var(--short) 14%,transparent);color:var(--short)}
.ln-act{display:flex;gap:6px;justify-content:flex-end}
.ln-btn{height:28px;padding:0 12px;border-radius:7px;border:1px solid var(--b2);background:var(--s1);color:var(--t1);font-size:12px;font-weight:700;cursor:pointer}
.ln-btn.go{background:var(--acc);border-color:var(--acc);color:#fff}.ln-btn:disabled{opacity:.5;cursor:default}
.ln-link{border:0;background:none;color:var(--acc);font-weight:700;cursor:pointer;padding:0;font-size:12.5px}
.ln-empty{padding:30px;text-align:center;color:var(--t2)}
.ln-down{padding:18px;border:1px solid var(--b1);border-radius:12px;background:var(--s1);color:var(--t2);font-size:13px}
@media (max-width:1100px){.ln-k{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
const fmtDT = s => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const LABEL = { pending: "Waiting", approved: "Approved", blocked: "Blocked" };

function People({ api, notify, onShowLogins, onChanged }) {
  const [rows, setRows] = useState(null), [busy, setBusy] = useState(0), [st, setSt] = useState("all");
  const load = () => api("/api/admin/lens/users").then(setRows).catch(e => { setRows([]); notify(e.message, "err"); });
  useEffect(() => { load(); }, []);
  const change = async (u, status) => {
    setBusy(u.id);
    try { await api(`/api/admin/lens/users/${u.id}`, { method: "POST", json: { status } }); notify(`${u.name}: ${LABEL[status].toLowerCase()}`); await load(); onChanged(); }
    catch (e) { notify(e.message, "err"); }
    setBusy(0);
  };
  if (!rows) return <div className="ln-empty">Loading…</div>;
  const shown = rows.filter(u => st === "all" || u.status === st);
  return (<>
    <div className="ln-tools">
      <div className="ln-chips" id="ln-people-filter">{[["all", "Everyone"], ["pending", "Waiting"], ["approved", "Approved"], ["blocked", "Blocked"]].map(([k, l]) =>
        <button key={k} type="button" className={st === k ? "on" : ""} onClick={() => setSt(k)}>{l}</button>)}</div>
      <button type="button" className="ln-btn" onClick={() => exportRows("lens-people", ["Name", "Email", "Mobile", "Status", "Asked on", "Approved on", "Approved by", "Last sign-in", "Sign-ins"],
        shown.map(u => [u.name, u.email, u.phone, LABEL[u.status], fmtDay(u.created_at), u.approved_at ? fmtDay(u.approved_at) : "", u.approved_by || "", fmtDT(u.last_login_at), u.login_count]))}>⬇ Excel</button>
    </div>
    <div className="ln-tw"><table className="ln-t" id="ln-people">
      <thead><tr><th>Person</th><th>Mobile</th><th>Status</th><th>Asked on</th><th>Approved</th><th>Last sign-in</th><th className="num">Sign-ins</th><th/></tr></thead>
      <tbody>{shown.map(u => (
        <tr key={u.id} data-status={u.status}>
          <td><b>{u.name}</b><small>{u.email}</small></td>
          <td>{u.phone || "—"}</td>
          <td><span className={`ln-st ${u.status}`}>{LABEL[u.status]}</span></td>
          <td>{fmtDT(u.created_at)}</td>
          <td>{u.approved_at ? <>{fmtDay(u.approved_at)}<small>by {u.approved_by}</small></> : "—"}</td>
          <td>{fmtDT(u.last_login_at)}</td>
          <td className="num">{u.login_count ? <button type="button" className="ln-link" onClick={() => onShowLogins(u)}>{u.login_count}</button> : 0}</td>
          <td><div className="ln-act">
            {u.status !== "approved" && <button type="button" className="ln-btn go" disabled={busy === u.id} onClick={() => change(u, "approved")}>Approve</button>}
            {u.status !== "blocked" && <button type="button" className="ln-btn" disabled={busy === u.id} onClick={() => change(u, "blocked")}>Block</button>}
          </div></td>
        </tr>))}
        {!shown.length && <tr><td colSpan={8} className="ln-empty">{rows.length ? "No one in this list." : "No one has asked for Lens access yet."}</td></tr>}
      </tbody></table></div>
  </>);
}

function SignIns({ api, notify, who, onClear }) {
  const [rows, setRows] = useState(null), [result, setResult] = useState("all");
  useEffect(() => {
    setRows(null);
    api(`/api/admin/lens/logins?result=${result}${who ? `&user_id=${who.id}` : ""}`).then(setRows).catch(e => { setRows([]); notify(e.message, "err"); });
  }, [result, who && who.id]);
  return (<>
    <div className="ln-tools">
      {who && <span className="ln-st approved">{who.name} <button type="button" className="ln-link" aria-label="Show everyone" onClick={onClear}>✕</button></span>}
      <div className="ln-chips" id="ln-login-filter">{[["all", "All"], ["ok", "Signed in"], ["failed", "Failed"]].map(([k, l]) =>
        <button key={k} type="button" className={result === k ? "on" : ""} onClick={() => setResult(k)}>{l}</button>)}</div>
      {rows && <button type="button" className="ln-btn" onClick={() => exportRows("lens-sign-ins", ["When", "Name", "Email", "Result", "Device", "Address"],
        rows.map(l => [fmtDT(l.at), l.name || "", l.email, l.ok ? "Signed in" : `Failed: ${l.reason}`, l.device, l.ip]))}>⬇ Excel</button>}
    </div>
    {!rows ? <div className="ln-empty">Loading…</div> :
    <div className="ln-tw"><table className="ln-t" id="ln-logins">
      <thead><tr><th>When</th><th>Person</th><th>Result</th><th>Device</th><th>Address</th></tr></thead>
      <tbody>{rows.map(l => (
        <tr key={l.id} data-ok={l.ok ? "1" : "0"}>
          <td>{fmtDT(l.at)}</td>
          <td>{l.name ? <><b>{l.name}</b><small>{l.email}</small></> : l.email}</td>
          <td><span className={`ln-st ${l.ok ? "ok" : "failed"}`}>{l.ok ? "Signed in" : `Failed: ${l.reason}`}</span></td>
          <td>{l.device}</td><td style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{l.ip}</td>
        </tr>))}
        {!rows.length && <tr><td colSpan={5} className="ln-empty">No sign-ins yet.</td></tr>}
      </tbody></table></div>}
  </>);
}

export function LensAdmin({ api, notify }) {
  const [sum, setSum] = useState(null), [down, setDown] = useState(""), [tab, setTab] = useState("people"), [who, setWho] = useState(null);
  const loadSum = () => api("/api/admin/lens/summary").then(s => { setSum(s); setDown(""); }).catch(e => setDown(e.message));
  useEffect(() => { loadSum(); }, []);
  return (
    <div className="ln-adm" id="adm-lens">
      <style>{CSS}</style>
      <div><h2>🔭 Lens admin</h2><div className="sub">Hyperplane LENS, the back-testing lab: a separate application with its own sign-in and data. Approve who can use it and see every sign-in.</div></div>
      {down ? <div className="ln-down" id="ln-down">{down}</div> : <>
        <div className="ln-k" id="ln-kpis">
          <div className={sum && sum.pending ? "warn" : ""}><span>Waiting for approval</span><b>{sum ? sum.pending : "…"}</b></div>
          <div><span>Approved</span><b>{sum ? sum.approved : "…"}</b></div>
          <div><span>Blocked</span><b>{sum ? sum.blocked : "…"}</b></div>
          <div><span>Sign-ins today</span><b>{sum ? sum.signins_today : "…"}</b></div>
          <div><span>Active this week</span><b>{sum ? sum.active_week : "…"}</b></div>
        </div>
        <div className="ln-chips" role="tablist">{[["people", "👥 People"], ["logins", "🔑 Sign-ins"], ["fyers", "📊 Fyers Data Lab"]].map(([k, l]) =>
          <button key={k} type="button" role="tab" aria-selected={tab === k} id={`ln-tab-${k}`} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab === "people" && <People api={api} notify={notify} onChanged={loadSum} onShowLogins={u => { setWho(u); setTab("logins"); }}/>}
        {tab === "logins" && <SignIns api={api} notify={notify} who={who} onClear={() => setWho(null)}/>}
        {tab === "fyers" && <FyersLab api={api} notify={notify}/>}
      </>}
    </div>);
}
