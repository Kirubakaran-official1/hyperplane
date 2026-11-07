// Access manager v2 — tab 2: Permissions ↔ Roles. A searchable role list on the left; on the right the selected role's
// permissions (Role view; owner 2026-11-01: "remove the Matrix view, keep only the role view"). Every click is a pending
// change (amber) until "Review & save" shows who gains / loses access.
import React, { useEffect, useMemo, useState } from "react";
import { Badge, Empty, LockIcon, Switch, btn, fmtDT, input, plural } from "./shared.jsx";
import { GroupHead, PendingBar, PermName, ReviewDialog, SearchBox, useFold, withNeeds, withoutKey } from "./ui.jsx";

const fold = t => String(t || "").toLowerCase();

export function RolesTab({ acc, api, notify, reload, go, link }) {
  const perms = acc.permissions.filter(p => !p.retired || acc.roles.some(r => r.permissions.includes(p.key)));
  const byKey = useMemo(() => Object.fromEntries(acc.permissions.map(p => [p.key, p])), [acc]);
  const roles = acc.roles, mods = acc.modules;
  const [sel, setSel] = useState(() => (roles.find(r => r.is_default) || roles[0] || {}).id);
  const [rq, setRq] = useState(""); const [q, setQ] = useState("");
  const [pend, setPend] = useState({});                       // "roleId|perm" → true (give) / false (take away)
  const [review, setReview] = useState(null); const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!link) return;
    if (link.perm) setQ(link.perm);                          // from the Permission manager: filter the role's list to it
    if (link.role) setSel(link.role);
  }, [link && link.n]);
  useEffect(() => { if (!roles.some(r => r.id === sel)) setSel((roles.find(r => r.is_default) || roles[0] || {}).id); }, [acc]);

  const base = id => new Set((roles.find(r => r.id === id) || { permissions: [] }).permissions);
  const nowIn = (p, id) => { const s = base(id); for (const [k, v] of Object.entries(p)) { const [rid, key] = k.split("|"); if (+rid === id) v ? s.add(key) : s.delete(key); } return s; };
  const now = id => nowIn(pend, id);
  // each change builds on the latest pending state, so several changes in one click ("All", "make the same") add up
  const setPerm = (id, key, on) => setPend(p => {
    const cur = nowIn(p, id), next = on ? withNeeds(byKey, cur, key) : withoutKey(byKey, cur, key), b = base(id);
    const x = { ...p };
    for (const k of new Set([...cur, ...next, ...b])) {
      const id_k = `${id}|${k}`;
      if (next.has(k) === b.has(k)) delete x[id_k]; else x[id_k] = next.has(k);
    }
    return x;
  });
  const blocked = (r, p) => p.restricted && r.is_default;
  const pendCount = Object.keys(pend).length;
  const changes = () => Object.entries(pend).map(([k, on]) => { const [rid, perm] = k.split("|"); return { role: +rid, perm, on }; });
  const preview = async () => {
    setReview({ summary: null });
    try { setReview({ summary: await api("/api/admin/access/role-permissions", { method: "POST", json: { changes: changes(), dry_run: true } }) }); }
    catch (e) { notify(e.message, "err"); setReview(null); }
  };
  const save = async () => {
    setBusy(true);
    try { const r = await api("/api/admin/access/role-permissions", { method: "POST", json: { changes: changes(), confirm_owner_level: true } });
      await reload(); setPend({}); setReview(null);
      notify(`${plural(r.summary.roles.length, "role")} saved · ${plural(r.summary.customers, "customer")} affected`); }
    catch (e) { notify(e.message, "err"); } finally { setBusy(false); }
  };
  const shownRoles = roles.filter(r => !rq.trim() || fold(`${r.name} ${r.description}`).includes(fold(rq.trim())));
  const role = roles.find(r => r.id === sel);
  const pendOf = id => Object.keys(pend).filter(k => +k.split("|")[0] === id).length;
  const props = { acc, perms, byKey, mods, roles, now, base, setPerm, blocked, pend, q, setQ };
  return (
    <div className="ax-pane ax-roles" id="ax-roles">
      <aside className="ax-rlist">
        <div className="ax-rlh"><b>Roles</b><span className="am-mut">{roles.length}</span><span style={{ flex: 1 }}/>
          <button style={btn(true)} onClick={() => setCreating(true)} id="role-new">＋ New role</button></div>
        <SearchBox value={rq} onChange={setRq} placeholder="Find a role" id="role-search"/>
        <div className="ax-rcards" id="role-list">
          {shownRoles.map(r => (
            <button key={r.id} type="button" className={`ax-rcard ${sel === r.id && !creating ? "on" : ""}`} onClick={() => { setSel(r.id); setCreating(false); }} data-role={r.name}>
              <span className="ax-rct"><b>{r.name}</b>{r.is_default && <Badge color="var(--long)">default</Badge>}{r.is_system && <Badge color="var(--t3)">built-in</Badge>}
                {r.owner && <span className="am-own" title="Holds owner-level permissions"><LockIcon size={10}/></span>}{pendOf(r.id) > 0 && <span className="ax-pdot" title="Unsaved changes"/>}</span>
              <span className="am-mut">{plural(now(r.id).size, "permission")} · {plural(r.users, "customer")}</span>
            </button>))}
          {!shownRoles.length && <Empty>No role matches.</Empty>}
        </div>
      </aside>
      <section className="ax-rmain">
        <div className="ax-tools">
          <span style={{ flex: 1 }}/>
          <SearchBox value={q} onChange={setQ} placeholder="Filter permissions" id="role-perm-search"/>
        </div>
        {creating ? <NewRole acc={acc} api={api} notify={notify} reload={reload} onDone={id => { setCreating(false); if (id) setSel(id); }}/>
          : role ? <RoleView {...props} role={role} api={api} notify={notify} reload={reload} go={go} onGone={() => setSel(null)} dirty={pendOf(role.id)}/> : <Empty>Pick a role.</Empty>}
      </section>
      <PendingBar count={pendCount} onReview={preview} onDiscard={() => setPend({})} busy={busy}/>
      {review && <ReviewDialog title="Review role changes" summary={review.summary} busy={busy} onClose={() => setReview(null)} onConfirm={save}/>}
    </div>);
}

const match = (p, q) => !q.trim() || fold(`${p.name} ${p.key} ${p.app} ${p.grp || ""}`).includes(fold(q.trim()));

function RoleView({ role, acc, perms, mods, now, base, setPerm, blocked, q, api, notify, reload, go, onGone, dirty }) {
  const [form, setForm] = useState({ name: role.name, description: role.description });
  const [only, setOnly] = useState(false); const [del, setDel] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { setForm({ name: role.name, description: role.description }); setDel(false); }, [role.id, role.name, role.description]);
  const cur = now(role.id), b = base(role.id);
  const run = async (fn, msg) => { setBusy(true); try { const r = await fn(); await reload(); if (msg) notify(typeof msg === "function" ? msg(r) : msg); return r; } catch (e) { notify(e.message, "err"); return null; } finally { setBusy(false); } };
  const groups = mods.map(m => ({ m, list: perms.filter(p => p.module === m.key && match(p, q) && (!only || cur.has(p.key))) })).filter(g => g.list.length);
  const gf = useFold("hp_ax_fold_roles", groups.map(g => g.m.key));
  const defRole = acc.roles.find(r => r.is_default);
  return (
    <div className="ax-rv" id="role-view">
      <div className="ax-rvh">
        <div className="ax-form">
          <label className="am-fl">Role name<input value={form.name} maxLength={40} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={input} id="role-name"/></label>
          <label className="am-fl ax-wide2">Description<input value={form.description} maxLength={200} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={input} id="role-desc"/></label>
          <button style={{ ...btn(true), alignSelf: "flex-end" }} disabled={busy || form.name.trim().length < 2 || (form.name === role.name && form.description === role.description)}
            onClick={() => run(() => api(`/api/admin/roles/${role.id}`, { method: "PATCH", json: form }), "Role details saved")} id="role-save-details">Save details</button>
        </div>
        <div className="ax-rvmeta">
          <span>{plural(role.users, "customer")}{role.users > 0 && <> · <button type="button" className="am-link" onClick={() => go("users", { role: role.id })} id="role-show-users">show them →</button></>}</span>
          <span>last changed {fmtDT(role.updated_at)}{role.updated_by ? ` by ${role.updated_by}` : ""}</span>
          <span style={{ flex: 1 }}/>
          {role.is_default ? <Badge color="var(--long)">default for new customers</Badge>
            : <button style={btn()} disabled={busy || [...b].some(k => (acc.permissions.find(p => p.key === k) || {}).restricted)}
                title={[...b].some(k => (acc.permissions.find(p => p.key === k) || {}).restricted) ? "A role with owner-level permissions cannot be the default" : `Replaces “${defRole && defRole.name}”`}
                onClick={() => run(() => api(`/api/admin/roles/${role.id}`, { method: "PATCH", json: { is_default: true } }), `${role.name} is now the default role`)} id="role-make-default">Make default</button>}
          <button style={btn()} disabled={busy} onClick={() => run(() => api(`/api/admin/roles/${role.id}/duplicate`, { method: "POST" }), "Role copied")} id="role-dup">⧉ Duplicate</button>
          {!role.is_system && !role.is_default && (del
            ? <span className="am-confirm">Delete “{role.name}”?{role.users ? ` Customers left with no role move to “${defRole && defRole.name}”.` : ""}
                <button style={btn(false, true)} onClick={() => run(() => api(`/api/admin/roles/${role.id}`, { method: "DELETE" }), `Role “${role.name}” deleted`).then(r => r && onGone())} id="role-del-yes">Delete</button>
                <button style={btn()} onClick={() => setDel(false)}>Keep</button></span>
            : <button style={btn(false, true)} onClick={() => setDel(true)} id="role-del">Delete</button>)}
        </div>
      </div>
      <div className="ax-tools sm">
        <b>{plural(cur.size, "permission")}</b>{dirty > 0 && <span className="ax-chg">{plural(dirty, "unsaved change")}</span>}
        <span style={{ flex: 1 }}/>
        <label className="ax-only"><input type="checkbox" checked={only} onChange={e => setOnly(e.target.checked)} id="role-only"/> Show only what it has</label>
        {gf.button("role-foldall")}
      </div>
      <div className="ax-pgroups" id="role-perms">
        {groups.map(({ m, list }) => {
          const all = list.every(p => cur.has(p.key));
          return (
            <div key={m.key} className="ax-pg" data-app={m.key}>
              <GroupHead m={m} open={gf.isOpen(m.key)} onFlip={() => gf.flip(m.key)} count={`${list.filter(p => cur.has(p.key)).length} of ${list.length}`}
                right={<button type="button" className="am-link" onClick={() => list.forEach(p => !blocked(role, p) && setPerm(role.id, p.key, !all))}>{all ? "None" : "All"}</button>}/>
              {gf.isOpen(m.key) && list.map(p => { const on = cur.has(p.key), chg = on !== b.has(p.key), bl = blocked(role, p); return (
                <label key={p.key} className={`ax-check row ${chg ? "chg" : ""} ${bl ? "dis" : ""}`} data-perm={p.key} title={bl ? "Owner-level permissions never go on the default role" : p.description}>
                  <input type="checkbox" checked={on} disabled={bl && !on} onChange={() => setPerm(role.id, p.key, !on)}/>
                  <span style={{ minWidth: 0 }}><PermName p={p}/>
                    {p.requires && <span className="am-mut ax-needs">needs {acc.permissions.find(x => x.key === p.requires).name} — given with it</span>}</span>
                  {chg && <span className="ax-chgtag">{on ? "will add" : "will remove"}</span>}
                </label>); })}
            </div>); })}
        {!groups.length && <Empty>No permission matches.</Empty>}
      </div>
    </div>);
}

function NewRole({ acc, api, notify, reload, onDone }) {
  const [form, setForm] = useState({ name: "", description: "", from: "" });
  const [ask, setAsk] = useState(false); const [busy, setBusy] = useState(false);
  const src = acc.roles.find(r => r.id === +form.from);
  const owner = src && src.owner;
  const create = async () => {
    setBusy(true);
    try { const r = await api("/api/admin/roles", { method: "POST", json: { name: form.name, description: form.description, permissions: src ? src.permissions : [], confirm_owner_level: true } });
      await reload(); notify(`Role “${form.name.trim()}” created`); onDone(r.id); }
    catch (e) { notify(e.message, "err"); } finally { setBusy(false); setAsk(false); }
  };
  return (
    <div className="ax-rv" id="role-create">
      <h4 style={{ margin: "4px 0 10px" }}>Create a role</h4>
      <div className="ax-form">
        <label className="am-fl">Role name<input value={form.name} maxLength={40} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Pro plan" style={input} id="new-role-name" autoFocus/></label>
        <label className="am-fl ax-wide2">Description<input value={form.description} maxLength={200} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What this plan is for" style={input} id="new-role-desc"/></label>
        <label className="am-fl">Start with the permissions of<select value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} style={input} id="new-role-from">
          <option value="">Nothing (empty role)</option>{acc.roles.map(r => <option key={r.id} value={r.id}>{r.name} ({plural(r.permissions.length, "permission")})</option>)}</select></label>
      </div>
      <p className="am-mut">You can change the permissions straight after, in the role's view.</p>
      <div className="ax-row-actions">
        <button style={btn(true)} disabled={busy || form.name.trim().length < 2} onClick={() => owner ? setAsk(true) : create()} id="new-role-create">Create role</button>
        <button style={btn()} onClick={() => onDone(null)}>Cancel</button>
      </div>
      {ask && <ReviewDialog title={`Create “${form.name.trim()}” with the permissions of ${src.name}`} busy={busy} onClose={() => setAsk(false)} onConfirm={create} confirmLabel="Create role"
        lines={[`It starts with ${plural(src.permissions.length, "permission")}, including owner-level ones. Nobody holds the new role yet.`]}
        summary={{ owner_level: true, customers: 0, gains: [], losses: [] }}/>}
    </div>);
}
