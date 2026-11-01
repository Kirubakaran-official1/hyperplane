// Access manager v2 — tab 3: Roles ↔ Users. The customer list is paged, sorted and filtered on the server (search,
// role, "can use permission X", direct grants, owner-level, status), so it stays quick with thousands of customers.
// Bulk: tick rows or "select all N matching", then add / remove a role or give / remove a permission directly —
// always previewed first. A row opens the customer's drawer: roles, direct grants (reason + last day), and every
// permission with ✓ / ✗ and WHY ("via Customer Admin", "direct until 15 Nov", "switched off", "needs …").
import React, { useEffect, useMemo, useState } from "react";
import { AppIcon, Badge, Empty, LockIcon, btn, fmtDT, input, plural } from "./shared.jsx";
import { Chips, Drawer, Pager, PermName, PermSelect, ReviewDialog, SearchBox, useDebounced } from "./ui.jsx";

const SIZE = 50;
const STATUS = { approved: ["active", "var(--long)"], pending: ["pending", "var(--mixed)"], blocked: ["blocked", "var(--short)"] };
const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const qs = o => Object.entries(o).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

export function UsersTab({ acc, api, notify, reload, go, link }) {
  const [q, setQ] = useState(""); const qd = useDebounced(q);
  const [role, setRole] = useState(""); const [perm, setPerm] = useState(""); const [direct, setDirect] = useState(""); const [owner, setOwner] = useState("");
  const [status, setStatus] = useState(""); const [sort, setSort] = useState("name"); const [page, setPage] = useState(1);
  const [data, setData] = useState(null); const [n, setN] = useState(0);
  const [picked, setPicked] = useState(() => new Set()); const [all, setAll] = useState(false);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!link) return;
    setRole(link.role ? String(link.role) : ""); setPerm(link.perm || ""); setDirect(link.direct ? "true" : ""); setOwner(""); setStatus(""); setQ("");
  }, [link && link.n]);
  const filter = { q: qd, role, perm, direct, owner, status };
  const key = JSON.stringify(filter);
  useEffect(() => { setPage(1); setPicked(new Set()); setAll(false); }, [key]);
  useEffect(() => {
    let live = true;
    api(`/api/admin/access/users?${qs({ ...filter, sort, page, size: SIZE })}`).then(d => live && setData(d)).catch(e => notify(e.message, "err"));
    return () => { live = false; };
  }, [key, sort, page, n]);
  const refresh = () => { setN(x => x + 1); return reload(); };
  const roleById = useMemo(() => Object.fromEntries(acc.roles.map(r => [r.id, r])), [acc]);
  const pByKey = useMemo(() => Object.fromEntries(acc.permissions.map(p => [p.key, p])), [acc]);
  const views = acc.permissions.filter(p => p.action === "view" && !p.retired);
  const rows = data ? data.rows : [];
  const pageAll = rows.length > 0 && rows.every(r => picked.has(r.id));
  const count = all ? (data ? data.total : 0) : picked.size;
  const filters = [q, role, perm, direct, owner, status].filter(Boolean).length;
  return (
    <div className="ax-pane" id="ax-users">
      <div className="ax-tools wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Search name or email" id="us-search"/>
        <select value={role} onChange={e => setRole(e.target.value)} style={input} id="us-role" aria-label="Role">
          <option value="">Any role</option>{acc.roles.map(r => <option key={r.id} value={r.id}>{r.name} ({r.users})</option>)}</select>
        <PermSelect perms={acc.permissions} mods={acc.modules} value={perm} onChange={setPerm} id="us-perm" placeholder="Can use: any permission"/>
        <select value={direct} onChange={e => setDirect(e.target.value)} style={input} id="us-direct" aria-label="Direct grants">
          <option value="">Direct grants: any</option><option value="true">Has direct grants</option><option value="false">No direct grants</option></select>
        <select value={owner} onChange={e => setOwner(e.target.value)} style={input} id="us-owner" aria-label="Owner-level">
          <option value="">Owner-level: any</option><option value="true">🔒 Has owner-level access</option><option value="false">No owner-level access</option></select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={input} id="us-status" aria-label="Status">
          <option value="">Any status</option><option value="approved">Active</option><option value="pending">Pending</option><option value="blocked">Blocked</option></select>
        {filters > 0 && <button style={btn()} onClick={() => { setQ(""); setRole(""); setPerm(""); setDirect(""); setOwner(""); setStatus(""); }} id="us-clear">✕ Clear {filters}</button>}
        <span style={{ flex: 1 }}/>
        <select value={sort} onChange={e => setSort(e.target.value)} style={input} id="us-sort" aria-label="Sort">
          <option value="name">Sort: name</option><option value="email">Sort: email</option><option value="last_login">Sort: last login</option><option value="created">Sort: newest</option></select>
      </div>
      {(picked.size > 0 || all) && <Bulk acc={acc} api={api} notify={notify} count={count} ids={[...picked]} filter={all ? filter : null}
        onDone={() => { setPicked(new Set()); setAll(false); refresh(); }} onClear={() => { setPicked(new Set()); setAll(false); }}/>}
      {pageAll && !all && data && data.total > rows.length && (
        <div className="ax-selall" id="us-selall">All {rows.length} on this page are ticked. <button type="button" className="am-link" onClick={() => setAll(true)} id="us-select-all">Select all {data.total.toLocaleString("en-IN")} matching customers</button></div>)}
      {all && <div className="ax-selall on">All {data.total.toLocaleString("en-IN")} matching customers are selected. <button type="button" className="am-link" onClick={() => { setAll(false); setPicked(new Set()); }}>Clear</button></div>}
      <div className="am-tw ax-tw">
        <table className="am-t ax-t" id="us-table">
          <thead><tr>
            <th className="am-th" style={{ width: 30 }}><input type="checkbox" checked={pageAll || all} aria-label="Select this page"
              onChange={() => { setAll(false); setPicked(s => { const x = new Set(s); pageAll ? rows.forEach(r => x.delete(r.id)) : rows.forEach(r => x.add(r.id)); return x; }); }}/></th>
            {["Customer", "Status", "Roles", "Direct grants", "Can use", "Last login"].map(h => <th key={h} className="am-th">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(c => { const eff = new Set(c.perms); const own = c.perms.some(k => (pByKey[k] || {}).restricted); const st = STATUS[c.status] || [c.status, "var(--t3)"]; return (
              <tr key={c.id} className={`ax-row ${picked.has(c.id) || all ? "am-picked" : ""}`} onClick={() => setOpen(c.id)} data-cust={c.email}>
                <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={all || picked.has(c.id)} aria-label={`Select ${c.name}`} disabled={all}
                  onChange={() => setPicked(s => { const x = new Set(s); x.has(c.id) ? x.delete(c.id) : x.add(c.id); return x; })}/></td>
                <td><b>{c.name}</b>{own && <span className="am-own" title="Owner-level access"><LockIcon size={10}/> owner-level</span>}<div className="am-mut">{c.email}</div></td>
                <td><Badge color={st[1]}>{st[0]}</Badge></td>
                <td><div className="ax-chipw">{c.roles.map(id => roleById[id] && <span key={id} className="am-chip sm role">{roleById[id].name}</span>)}</div></td>
                <td><div className="ax-chipw">{c.grants.map(g => <span key={g.key} className="am-chip sm ax-direct" title={g.reason}>{(pByKey[g.key] || {}).name || g.key}{g.until ? ` · until ${g.until}` : ""}</span>)}
                  {!c.grants.length && <span className="am-mut">—</span>}</div></td>
                <td><span className="ax-can" title={c.perms.map(k => (pByKey[k] || {}).name).join(" · ")}><b>{c.perms.length}</b> of {acc.permissions.filter(p => !p.retired).length}
                  <span className="am-appicons">{views.filter(v => eff.has(v.key)).map(v => <AppIcon key={v.key} k={v.module} size={13}/>)}</span></span></td>
                <td>{c.last_login ? fmtDT(c.last_login) : "—"}</td>
              </tr>); })}
            {data && !rows.length && <tr><td colSpan={7}><Empty>No customers match.</Empty></td></tr>}
            {!data && <tr><td colSpan={7}><Empty>Loading…</Empty></td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} size={SIZE} total={data.total} onPage={setPage} id="us-pager"/>}
      {open && <UserDrawer cid={open} acc={acc} api={api} notify={notify} onClose={() => setOpen(null)} onChanged={refresh}/>}
    </div>);
}

function GrantFields({ g, setG, acc, exclude = [] }) {
  return (<>
    <PermSelect perms={acc.permissions} mods={acc.modules} value={g.permission} onChange={v => setG(x => ({ ...x, permission: v }))} id="gr-perm" filter={p => !exclude.includes(p.key)}/>
    <input value={g.reason} maxLength={200} onChange={e => setG(x => ({ ...x, reason: e.target.value }))} placeholder="Reason (required), e.g. 7-day trial" style={{ ...input, minWidth: 200 }} id="gr-reason"/>
    <label className="ax-until">Last day <input type="date" value={g.expires_on} min={todayIST()} onChange={e => setG(x => ({ ...x, expires_on: e.target.value }))} style={input} id="gr-until"/></label>
  </>);
}

function Bulk({ acc, api, notify, count, ids, filter, onDone, onClear }) {
  const [act, setAct] = useState("add_role"); const [role, setRole] = useState(""); const [perm, setPerm] = useState("");
  const [g, setG] = useState({ permission: "", reason: "", expires_on: "" });
  const [review, setReview] = useState(null); const [busy, setBusy] = useState(false);
  const body = () => ({ ...(filter ? { filter: Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== "").map(([k, v]) => [k, k === "role" ? +v : k === "direct" || k === "owner" ? v === "true" : v])) } : { customer_ids: ids }),
    ...(act === "add_role" ? { add_roles: [+role] } : act === "remove_role" ? { remove_roles: [+role] } : act === "grant" ? { grant: { ...g, expires_on: g.expires_on || null } } : { revoke: perm }) });
  const ready = (act === "add_role" || act === "remove_role") ? !!role : act === "grant" ? g.permission && g.reason.trim().length >= 3 : !!perm;
  const what = act === "add_role" ? `Add role “${(acc.roles.find(r => r.id === +role) || {}).name}”` : act === "remove_role" ? `Remove role “${(acc.roles.find(r => r.id === +role) || {}).name}”`
    : act === "grant" ? `Give “${(acc.permissions.find(p => p.key === g.permission) || {}).name}” directly` : `Remove the direct grant “${(acc.permissions.find(p => p.key === perm) || {}).name}”`;
  const preview = async () => {
    setReview({ summary: null });
    try { setReview({ summary: await api("/api/admin/access/users/bulk", { method: "POST", json: { ...body(), dry_run: true } }) }); }
    catch (e) { notify(e.message, "err"); setReview(null); }
  };
  const save = async () => {
    setBusy(true);
    try { const r = await api("/api/admin/access/users/bulk", { method: "POST", json: { ...body(), confirm_owner_level: true } });
      notify(`${what}: done for ${plural(r.matched - r.skipped, "customer")} · access changed for ${r.customers}${r.skipped ? ` · ${r.skipped} skipped` : ""}`); setReview(null); onDone(); }
    catch (e) { notify(e.message, "err"); } finally { setBusy(false); }
  };
  return (
    <div className="am-bulk ax-bulk" id="us-bulk">
      <b>{plural(count, "customer")} selected</b>
      <select value={act} onChange={e => setAct(e.target.value)} style={input} id="bk-action" aria-label="Action">
        <option value="add_role">Add a role</option><option value="remove_role">Remove a role</option>
        <option value="grant">Give a permission directly</option><option value="revoke">Remove a direct permission</option></select>
      {(act === "add_role" || act === "remove_role") && <select value={role} onChange={e => setRole(e.target.value)} style={input} id="bk-role" aria-label="Role">
        <option value="">Pick a role…</option>{acc.roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.owner ? " 🔒" : ""}</option>)}</select>}
      {act === "grant" && <GrantFields g={g} setG={setG} acc={acc}/>}
      {act === "revoke" && <PermSelect perms={acc.permissions} mods={acc.modules} value={perm} onChange={setPerm} id="bk-perm"/>}
      <button style={btn(true)} disabled={!ready} onClick={preview} id="bk-review">Review</button>
      <span style={{ flex: 1 }}/><button style={btn()} onClick={onClear}>Clear selection</button>
      {review && <ReviewDialog title={`${what} — ${plural(count, "customer")}`} summary={review.summary} busy={busy} onClose={() => setReview(null)} onConfirm={save} confirmLabel="Apply"/>}
    </div>);
}

const WHY = {
  off: "switched off for everyone", retired: "retired", not_given: "not given",
};

function UserDrawer({ cid, acc, api, notify, onClose, onChanged }) {
  const [d, setD] = useState(null); const [busy, setBusy] = useState(false);
  const [addRole, setAddRole] = useState(""); const [g, setG] = useState({ permission: "", reason: "", expires_on: "" }); const [ask, setAsk] = useState(null);
  const load = () => api(`/api/admin/access/users/${cid}`).then(setD).catch(e => notify(e.message, "err"));
  useEffect(() => { load(); }, [cid]);
  if (!d) return <Drawer title="Loading…" onClose={onClose} id="us-drawer"><div className="am-empty">Loading…</div></Drawer>;
  const run = async (fn, msg) => { setBusy(true); try { await fn(); await load(); onChanged(); notify(msg); } catch (e) { notify(e.message, "err"); } finally { setBusy(false); } };
  const roleIds = d.roles.map(r => r.id);
  const setRoles = ids => run(() => api(`/api/admin/access/users/${cid}/roles`, { method: "PUT", json: { role_ids: ids } }), `${d.customer.name}: roles saved`);
  const grantNow = () => run(() => api(`/api/admin/access/users/${cid}/grants`, { method: "POST", json: { ...g, expires_on: g.expires_on || null, confirm_owner_level: true } }),
    `${d.customer.name}: permission given`).then(() => { setG({ permission: "", reason: "", expires_on: "" }); setAsk(null); });
  const gp = acc.permissions.find(p => p.key === g.permission);
  const groups = acc.modules.map(m => ({ m, list: d.access.filter(a => a.module === m.key) })).filter(x => x.list.length);
  const held = d.access.filter(a => a.held).length;
  return (
    <Drawer title={d.customer.name} sub={`${d.customer.email} · ${d.customer.status}`} onClose={onClose} id="us-drawer" wide>
      <section className="ax-sec">
        <h4>Roles <span className="am-mut">{d.roles.length}</span></h4>
        <div className="ax-chipw" id="ud-roles">
          {d.roles.map(r => { const ro = acc.roles.find(x => x.id === r.id) || {}; return (
            <span key={r.id} className="am-chip role ax-rchip" title={`Given ${fmtDT(r.assigned_at)} by ${r.assigned_by || "—"}`}>{r.name}{ro.owner && <LockIcon size={10}/>}
              <button type="button" aria-label={`Remove ${r.name}`} disabled={busy || d.roles.length < 2} title={d.roles.length < 2 ? "A customer keeps at least one role (block the account to stop all access)" : "Remove"}
                onClick={() => setRoles(roleIds.filter(x => x !== r.id))}>✕</button></span>); })}
        </div>
        <div className="ax-row-actions">
          <select value={addRole} onChange={e => setAddRole(e.target.value)} style={input} id="ud-add-role" aria-label="Add a role">
            <option value="">Add a role…</option>{acc.roles.filter(r => !roleIds.includes(r.id)).map(r => <option key={r.id} value={r.id}>{r.name}{r.owner ? " 🔒" : ""}</option>)}</select>
          <button style={btn(true)} disabled={!addRole || busy} onClick={() => { const r = acc.roles.find(x => x.id === +addRole); if (r.owner) setAsk({ kind: "role", r }); else setRoles([...roleIds, +addRole]).then(() => setAddRole("")); }} id="ud-add-role-btn">Add</button>
        </div>
      </section>
      <section className="ax-sec">
        <h4>Direct permissions <span className="am-mut">given to this customer only</span></h4>
        <div className="ax-list" id="ud-grants">
          {d.grants.map(x => (
            <div key={x.key} className={`ax-li ${x.active ? "" : "dim"}`}>
              <span style={{ minWidth: 0 }}><b>{x.name}</b> <span className="am-mut">({x.app})</span>
                <span className="am-mut" style={{ display: "block" }}>{x.reason} · by {x.granted_by || "—"} on {fmtDT(x.granted_at)}{x.expires_on ? ` · last day ${x.expires_on}` : " · no end date"}{x.active ? "" : " · ended"}</span></span>
              <button style={btn(false, true)} disabled={busy} onClick={() => run(() => api(`/api/admin/access/users/${cid}/grants/${encodeURIComponent(x.key)}`, { method: "DELETE" }), "Direct permission removed")}>Remove</button>
            </div>))}
          {!d.grants.length && <div className="am-mut">None. Use this for a trial or a one-off — roles are better for anything lasting.</div>}
        </div>
        <div className="ax-row-actions wrap" id="ud-grant-form">
          <GrantFields g={g} setG={setG} acc={acc}/>
          <button style={btn(true)} disabled={busy || !g.permission || g.reason.trim().length < 3} onClick={() => gp && gp.restricted ? setAsk({ kind: "grant" }) : grantNow()} id="ud-grant">Give</button>
        </div>
      </section>
      <section className="ax-sec">
        <h4>What this customer can use <span className="am-mut">{held} of {d.access.length}</span></h4>
        <div className="ax-eff" id="ud-access">
          {groups.map(({ m, list }) => (
            <div key={m.key} className="ax-effg"><div className="ax-effh"><AppIcon k={m.key}/> <b>{m.name}</b></div>
              {list.map(a => (
                <div key={a.key} className={`ax-effr ${a.held ? "ok" : "no"}`} data-perm={a.key}>
                  <span className="ax-mk">{a.held ? "✓" : "✗"}</span>
                  <span style={{ minWidth: 0 }}><b>{a.name}</b>{a.restricted && <span className="am-own"><LockIcon size={10}/></span>} <span className="ax-key">{a.key}</span></span>
                  <span className="ax-whytext">{a.held ? a.sources.map(s => s.kind === "role" ? `via ${s.name}` : `direct${s.until ? ` until ${s.until}` : ""}`).join(" · ")
                    : a.why === "needs" ? `needs “${a.needs}” first` : WHY[a.why]}{!a.held && a.sources.length > 0 && a.why !== "needs" ? ` (held via ${a.sources.map(s => s.kind === "role" ? s.name : "direct").join(", ")})` : ""}</span>
                </div>))}
            </div>))}
        </div>
      </section>
      {ask && <ReviewDialog title={ask.kind === "role" ? `Give the role “${ask.r.name}” to ${d.customer.name}` : `Give “${gp.name}” (${gp.app}) to ${d.customer.name}`} busy={busy}
        onClose={() => setAsk(null)} confirmLabel="Give access"
        onConfirm={() => ask.kind === "role" ? setRoles([...roleIds, ask.r.id]).then(() => { setAddRole(""); setAsk(null); }) : grantNow()}
        lines={[ask.kind === "role" ? "This role holds owner-level permissions." : `Reason: ${g.reason}${g.expires_on ? ` · last day ${g.expires_on}` : " · no end date"}`]}
        summary={{ owner_level: true, customers: 1, gains: [], losses: [] }}/>}
    </Drawer>);
}
