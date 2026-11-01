// Access manager v2 — tab 1: Permission manager. The catalogue (created by the code, permissions.py) grouped by
// application: label, group, description, owner-level, on / off; how many roles hold each one, how many customers can
// use it, how many direct grants. A row opens a drawer: edit it, give it to many roles at once, see who has it and why.
import React, { useEffect, useMemo, useState } from "react";
import { Badge, Empty, LockIcon, Switch, btn, input, plural } from "./shared.jsx";
import { AppHead, Chips, Drawer, Pager, PermName, ReviewDialog, SearchBox, useDebounced } from "./ui.jsx";

const fold = t => String(t || "").toLowerCase();

export function PermissionsTab({ acc, api, notify, reload, go, link }) {
  const [q, setQ] = useState(""); const [f, setF] = useState("all");
  const [open, setOpen] = useState(null); const [closed, setClosed] = useState(() => new Set());
  const [appEdit, setAppEdit] = useState(null); const [toggle, setToggle] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (link && link.perm) setOpen(link.perm); }, [link && link.n]);
  const perms = acc.permissions, mods = acc.modules;
  const ql = fold(q.trim());
  const test = {
    all: p => !p.retired, owner: p => p.restricted && !p.retired, off: p => !p.enabled && !p.retired,
    unused: p => !p.retired && p.roles === 0 && p.direct === 0, retired: p => p.retired,
  };
  const shown = perms.filter(p => test[f](p) && (!ql || fold(`${p.name} ${p.key} ${p.description} ${p.app} ${p.grp || ""}`).includes(ql)));
  const n = k => perms.filter(test[k]).length;
  const chips = [["all", "All", n("all")], ["owner", "Owner-level", n("owner")], ["off", "Switched off", n("off")], ["unused", "Not given to anyone", n("unused")],
    ...(n("retired") ? [["retired", "Retired", n("retired")]] : [])];
  const groups = mods.map(m => ({ m, list: shown.filter(p => p.module === m.key) })).filter(g => g.list.length);
  const flip = k => setClosed(s => { const x = new Set(s); x.has(k) ? x.delete(k) : x.add(k); return x; });
  const saveToggle = async () => {
    setBusy(true);
    try { await api(`/api/admin/access/permissions/${encodeURIComponent(toggle.p.key)}`, { method: "PATCH", json: { enabled: toggle.on } }); await reload();
      notify(`${toggle.p.name} (${toggle.p.app}) is ${toggle.on ? "on" : "off for everyone"}`); setToggle(null); }
    catch (e) { notify(e.message, "err"); } finally { setBusy(false); }
  };
  const saveApp = async () => {
    setBusy(true);
    try { await api(`/api/admin/modules/${appEdit.key}`, { method: "PATCH", json: { name: appEdit.name, description: appEdit.description } }); await reload(); notify("Application saved"); setAppEdit(null); }
    catch (e) { notify(e.message, "err"); } finally { setBusy(false); }
  };
  return (
    <div className="ax-pane" id="ax-perms">
      <div className="ax-tools">
        <SearchBox value={q} onChange={setQ} placeholder="Search permissions, keys, applications" id="pm-search"/>
        <Chips items={chips} value={f} onChange={setF} id="pm-filter"/>
        <span style={{ flex: 1 }}/>
        <span className="am-mut">{plural(shown.length, "permission")} · new ones appear here when a feature ships</span>
      </div>
      <div className="am-tw ax-tw">
        <table className="am-t ax-t" id="pm-table">
          <thead><tr>{["Permission", "Needs", "On", "Roles", "Customers", "Direct"].map((h, i) => <th key={h} className={`am-th ${i > 2 ? "num" : ""}`}>{h}</th>)}</tr></thead>
          {groups.map(({ m, list }) => (
            <tbody key={m.key} data-app={m.key}>
              <tr className="ax-grp"><td colSpan={6}>
                <button type="button" className="ax-fold" onClick={() => flip(m.key)} aria-expanded={!closed.has(m.key)}>{closed.has(m.key) ? "▸" : "▾"}</button>
                {appEdit && appEdit.key === m.key ? (
                  <span className="ax-appedit">
                    <input value={appEdit.name} onChange={e => setAppEdit(a => ({ ...a, name: e.target.value }))} style={input} maxLength={60} aria-label="Application name" id="pm-app-name"/>
                    <input value={appEdit.description} onChange={e => setAppEdit(a => ({ ...a, description: e.target.value }))} style={{ ...input, flex: 1 }} maxLength={200} aria-label="Application description"/>
                    <button style={btn(true)} disabled={busy || appEdit.name.trim().length < 2} onClick={saveApp} id="pm-app-save">Save</button>
                    <button style={btn()} onClick={() => setAppEdit(null)}>Cancel</button></span>
                ) : <AppHead m={m} n={list.length} right={<>{!m.enabled && <Badge color="var(--short)">off for everyone</Badge>}
                    <button type="button" className="am-link ax-edit" onClick={() => setAppEdit({ key: m.key, name: m.name, description: m.description })}>Rename</button>
                    {m.description && <span className="am-mut ax-appd">{m.description}</span>}</>}/>}
              </td></tr>
              {!closed.has(m.key) && list.map(p => (
                <tr key={p.key} className={`ax-row ${p.retired ? "dim" : ""}`} data-perm={p.key} onClick={() => setOpen(p.key)} tabIndex={0}
                  onKeyDown={e => { if (e.key === "Enter") setOpen(p.key); }}>
                  <td><PermName p={p}/>{p.grp && <span className="am-chip sm ax-grpchip">{p.grp}</span>}<div className="am-mut ax-desc">{p.description}</div></td>
                  <td>{p.requires ? <span className="ax-key">{p.requires}</span> : <span className="am-mut">—</span>}</td>
                  <td onClick={e => e.stopPropagation()}><Switch on={p.enabled} disabled={p.retired} onChange={v => setToggle({ p, on: v })} label={`${p.name} on/off`} id={`pm-sw-${p.key.replace(":", "-")}`}/></td>
                  <td className="num" onClick={e => e.stopPropagation()}><button type="button" className="ax-count" onClick={() => go("roles", { perm: p.key })} title="Open in Permissions ↔ Roles">{p.roles}</button></td>
                  <td className="num" onClick={e => e.stopPropagation()}><button type="button" className={`ax-count ${p.restricted && p.holders ? "own" : ""}`} onClick={() => go("users", { perm: p.key })} title="Open in Roles ↔ Users">{p.holders}</button></td>
                  <td className="num" onClick={e => e.stopPropagation()}>{p.direct ? <button type="button" className="ax-count" onClick={() => go("users", { perm: p.key, direct: true })}>{p.direct}</button> : <span className="am-mut">0</span>}</td>
                </tr>))}
            </tbody>))}
          {!groups.length && <tbody><tr><td colSpan={6}><Empty>No permission matches.</Empty></td></tr></tbody>}
        </table>
      </div>
      {open && <PermDrawer k={open} acc={acc} api={api} notify={notify} reload={reload} go={go} onClose={() => setOpen(null)}/>}
      {toggle && <ReviewDialog title={`${toggle.on ? "Switch on" : "Switch off"}: ${toggle.p.name} (${toggle.p.app})`} busy={busy} onClose={() => setToggle(null)} onConfirm={saveToggle}
        confirmLabel={toggle.on ? "Switch on" : "Switch off for everyone"}
        lines={[toggle.on ? "Everyone who holds it (through a role or directly) can use it again." : "Nobody can use it until you switch it back on. Roles and direct grants stay as they are.",
          ...(toggle.p.action === "view" && !toggle.on ? ["This is the application itself: it disappears from every customer's menu, with all its extra permissions."] : [])]}
        summary={{ customers: toggle.on ? 0 : toggle.p.holders, gains: [], losses: toggle.on ? [] : [{ key: toggle.p.key, name: toggle.p.name, app: toggle.p.app, n: toggle.p.holders }] }}/>}
    </div>);
}

function PermDrawer({ k, acc, api, notify, reload, go, onClose }) {
  const p = acc.permissions.find(x => x.key === k);
  const [form, setForm] = useState(() => p && { name: p.name, grp: p.grp || "", description: p.description, restricted: p.restricted });
  const [rq, setRq] = useState(""); const [want, setWant] = useState(() => new Set(acc.roles.filter(r => r.permissions.includes(k)).map(r => r.id)));
  const [review, setReview] = useState(null); const [busy, setBusy] = useState(false);
  const [hq, setHq] = useState(""); const hqd = useDebounced(hq); const [src, setSrc] = useState("all"); const [page, setPage] = useState(1); const [holders, setHolders] = useState(null);
  useEffect(() => { setPage(1); }, [hqd, src]);
  useEffect(() => {
    if (!p) return;
    api(`/api/admin/access/permissions/${encodeURIComponent(k)}/holders?q=${encodeURIComponent(hqd)}&source=${src}&page=${page}&size=20`).then(setHolders).catch(e => notify(e.message, "err"));
  }, [k, hqd, src, page, p && p.holders]);
  if (!p) return null;
  const has = new Set(acc.roles.filter(r => r.permissions.includes(k)).map(r => r.id));
  const add = [...want].filter(id => !has.has(id)), remove = [...has].filter(id => !want.has(id));
  const dirtyForm = form.name !== p.name || form.grp !== (p.grp || "") || form.description !== p.description || form.restricted !== p.restricted;
  const roles = acc.roles.filter(r => !rq.trim() || fold(r.name).includes(fold(rq.trim())));
  const saveForm = async () => {
    setBusy(true);
    try { await api(`/api/admin/access/permissions/${encodeURIComponent(k)}`, { method: "PATCH", json: form }); await reload(); notify("Permission saved"); }
    catch (e) { notify(e.message, "err"); } finally { setBusy(false); }
  };
  const preview = async () => {
    setReview({ summary: null });
    try { setReview({ summary: await api(`/api/admin/access/permissions/${encodeURIComponent(k)}/roles`, { method: "PUT", json: { add, remove, dry_run: true } }) }); }
    catch (e) { notify(e.message, "err"); setReview(null); }
  };
  const save = async () => {
    setBusy(true);
    try { const r = await api(`/api/admin/access/permissions/${encodeURIComponent(k)}/roles`, { method: "PUT", json: { add, remove, confirm_owner_level: true } });
      await reload(); setReview(null); notify(`${p.name}: ${plural(r.summary.roles.length, "role")} updated · ${plural(r.summary.customers, "customer")} affected`); }
    catch (e) { notify(e.message, "err"); } finally { setBusy(false); }
  };
  return (
    <Drawer title={<PermName p={p}/>} sub={`${p.app} · ${p.action === "view" ? "opens the application" : "an action inside the application"}`} onClose={onClose} id="pm-drawer">
      <section className="ax-sec">
        <h4>About this permission</h4>
        <div className="ax-form">
          <label className="am-fl">Label<input value={form.name} maxLength={60} onChange={e => setForm(x => ({ ...x, name: e.target.value }))} style={input} id="pd-name"/></label>
          <label className="am-fl">Group<input value={form.grp} maxLength={40} placeholder={p.app} onChange={e => setForm(x => ({ ...x, grp: e.target.value }))} style={input} id="pd-grp"/></label>
          <label className="am-fl ax-wide">Description<textarea value={form.description} maxLength={200} rows={2} onChange={e => setForm(x => ({ ...x, description: e.target.value }))} style={{ ...input, resize: "vertical" }} id="pd-desc"/></label>
          <label className="ax-swrow"><Switch on={form.restricted} onChange={v => setForm(x => ({ ...x, restricted: v }))} label="Owner-level" id="pd-owner"/>
            <span><b>Owner-level</b><span className="am-mut" style={{ display: "block" }}>For views that show how results are worked out. Never on the default role; giving it needs a typed confirmation.</span></span></label>
        </div>
        <div className="ax-meta"><span>Key <code>{p.key}</code></span>{p.requires && <span>Needs <code>{p.requires}</code> (given with it automatically)</span>}<span>Created by the code — label, group, description and owner-level are yours to edit.</span></div>
        <button style={btn(true)} disabled={busy || !dirtyForm || form.name.trim().length < 2} onClick={saveForm} id="pd-save">Save</button>
      </section>

      <section className="ax-sec">
        <h4>Roles with this permission <span className="am-mut">{want.size} of {acc.roles.length}</span></h4>
        <SearchBox value={rq} onChange={setRq} placeholder="Find a role" id="pd-role-search"/>
        <div className="ax-checks" id="pd-roles">
          {roles.map(r => { const on = want.has(r.id); const changed = on !== has.has(r.id); const block = p.restricted && r.is_default; return (
            <label key={r.id} className={`ax-check ${changed ? "chg" : ""} ${block ? "dis" : ""}`} title={block ? "Owner-level permissions never go on the default role" : ""} data-role={r.name}>
              <input type="checkbox" checked={on} disabled={block && !on} onChange={() => setWant(s => { const x = new Set(s); x.has(r.id) ? x.delete(r.id) : x.add(r.id); return x; })}/>
              <span><b>{r.name}</b>{r.is_default && <Badge color="var(--long)">default</Badge>}{r.owner && <span className="am-own"><LockIcon size={10}/></span>}
                <span className="am-mut" style={{ display: "block" }}>{plural(r.users, "customer")}{changed ? (on ? " · will get it" : " · will lose it") : ""}</span></span>
            </label>); })}
          {!roles.length && <Empty>No role matches.</Empty>}
        </div>
        <div className="ax-row-actions">
          <button style={btn(true)} disabled={!add.length && !remove.length} onClick={preview} id="pd-roles-review">Review {add.length + remove.length ? `(${add.length + remove.length})` : ""}</button>
          {(add.length || remove.length) > 0 && <button style={btn()} onClick={() => setWant(new Set(has))}>Discard</button>}
        </div>
      </section>

      <section className="ax-sec">
        <h4>Who can use it <span className="am-mut">{holders ? holders.total.toLocaleString("en-IN") : "…"}</span>
          <button type="button" className="am-link" style={{ marginLeft: "auto", fontSize: 12 }} onClick={() => go("users", { perm: k })} id="pd-open-users">Open in Roles ↔ Users →</button></h4>
        <div className="ax-tools">
          <SearchBox value={hq} onChange={setHq} placeholder="Find a customer" id="pd-holder-search"/>
          <Chips items={[["all", "All"], ["role", "Through a role"], ["direct", "Given directly"]]} value={src} onChange={setSrc} id="pd-src"/>
        </div>
        {holders && <>
          <div className="ax-list" id="pd-holders">
            {holders.rows.map(h => (
              <div key={h.id} className="ax-li"><span style={{ minWidth: 0 }}><b>{h.name}</b><span className="am-mut" style={{ display: "block" }}>{h.email}</span></span>
                <span className="ax-why">{h.via_roles.map(n => <span key={n} className="am-chip sm role">via {n}</span>)}
                  {h.direct && <span className="am-chip sm ax-direct" title={h.direct.reason}>direct{h.direct.until ? ` · until ${h.direct.until}` : ""}</span>}</span></div>))}
            {!holders.rows.length && <Empty>Nobody{hq ? " matches" : " can use it yet"}.</Empty>}
          </div>
          {holders.total > 20 && <Pager page={page} size={20} total={holders.total} onPage={setPage} id="pd-pager"/>}
        </>}
      </section>
      {review && <ReviewDialog title={`Give “${p.name}” (${p.app}) to roles`} summary={review.summary} busy={busy} onClose={() => setReview(null)} onConfirm={save}/>}
    </Drawer>);
}
