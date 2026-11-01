// Admin → 🔐 Access manager v2 (owner, 2026-11-01: "in future there might be 10 permissions and many roles … the
// UI is good but handling the data gets bad when the count grows … only three sub-tabs: permission manager,
// permissions to roles, roles to users … any permission to any role, and to a user as well … identify everything").
// Customer → roles → permissions ("application:action") + direct grants. Every change is reviewed before it is saved
// (the server previews who gains / loses access), owner-level access needs a typed confirmation, and the customer list
// is paged and filtered on the server, so it stays fast with thousands of customers.
import React, { useCallback, useEffect, useState } from "react";
import { SectionTitle } from "../dashboard.jsx";
import { AM_CSS, LockIcon } from "./shared.jsx";
import { AX_CSS } from "./style.js";
import { PermissionsTab } from "./perms.jsx";
import { RolesTab } from "./roles.jsx";
import { UsersTab } from "./users.jsx";

const TABS = [
  ["perms", "Permission manager", "What each permission is · on / off · who has it",
    <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>],
  ["roles", "Permissions ↔ Roles", "Give any permission to any role",
    <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 8h5M19.5 5.5v5"/></>],
  ["users", "Roles ↔ Users", "Roles and direct permissions per customer",
    <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h4M7 13h10M7 17h6"/><circle cx="16.5" cy="9" r="1.5"/></>],
];

export function AccessTab({ api, notify }) {
  const [acc, setAcc] = useState(null);
  const [tab, setTab] = useState(() => { try { const t = localStorage.getItem("hp_access_tab"); return TABS.some(x => x[0] === t) ? t : "perms"; } catch { return "perms"; } });
  const [link, setLink] = useState(null);                  // deep link between tabs: { perm, role, n }
  const reload = useCallback(() => api("/api/admin/access").then(a => { setAcc(a); return a; }), []);
  useEffect(() => { reload().catch(e => notify(e.message, "err")); }, []);
  const go = (t, params) => { setTab(t); setLink(params ? { ...params, n: Date.now() } : null); try { localStorage.setItem("hp_access_tab", t); } catch { /* storage blocked */ } };
  if (!acc) return <div style={{ padding: 30, color: "var(--t3)" }}>Loading the access manager…</div>;
  const ownerHolders = acc.permissions.filter(p => p.restricted).reduce((a, p) => Math.max(a, p.holders), 0);
  const counts = { perms: acc.permissions.filter(p => !p.retired).length, roles: acc.roles.length, users: null };
  const props = { acc, api, notify, reload, go, link };
  return (
    <div className="am ax" style={{ padding: "18px 22px" }}>
      <style>{AM_CSS}</style><style>{AX_CSS}</style>
      <SectionTitle icon="🔐" title="Access manager" sub="Who can use what in the customer app (/app). Customers get roles; roles hold permissions; a permission can also be given straight to one customer (with a reason and an end date). Nothing is saved until you review it."/>
      <div className="ax-tabs" role="tablist" id="ax-tabs">
        {TABS.map(([k, label, hint, icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => go(k)} id={`ax-tab-${k}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
            <span><b>{label}{counts[k] != null && <i>{counts[k]}</i>}</b><small>{hint}</small></span>
          </button>))}
        <span style={{ flex: 1 }}/>
        {ownerHolders > 0 && <span className="am-own lg" title="Customers who can see how results are worked out"><LockIcon/> owner-level access in use</span>}
      </div>
      {tab === "perms" && <PermissionsTab {...props}/>}
      {tab === "roles" && <RolesTab {...props}/>}
      {tab === "users" && <UsersTab {...props}/>}
    </div>);
}
