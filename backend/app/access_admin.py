"""
Admin → 🔐 Access manager v2 (owner 2026-11-01: "in future there might be 10 permissions and many roles … the UI is good
but handling the data gets bad as the count grows … three sub-tabs: permission manager, permissions to roles, roles to
users … any permission to any role, and to a user as well … dynamic, but identify everything properly").

Model (permissions.py): customer → roles → permissions "application:action"  +  customer → direct grants.
Everything here is built for scale: the user list is paged on the server and filters by EFFECTIVE permission; every
change can be previewed first (dry_run: the change is made inside a savepoint, the effective access of every customer it
touches is compared before / after, then rolled back) and is saved in one transaction; owner-level (restricted)
permissions need confirm_owner_level; every change goes to the activity log.

Rules: a permission that requires another (portfolio:detail → portfolio:view) brings it along when given and leaves
with it when that one is taken away; the default role holds at least one application and never an owner-level
permission; a customer always keeps at least one role (block the account to stop all access); a direct grant needs a
reason and may have a last day.
"""
from datetime import date

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from . import activity as act
from . import permissions as perms
from .db import pool
from .schedule import TZ, now

ROLE_NAME_MAX, ROLE_DESC_MAX = 40, 200
MAX_PINS = 8                         # same as portal.MAX_PINS (applications pinned to the customer's side menu)
PAGE_MAX = 200
BULK_MAX = 20000
OWNER_CONFIRM = "This gives owner-level access. Send confirm_owner_level to go ahead."


class RoleIn(BaseModel):
    name: str
    description: str = ""
    permissions: list[str] = []
    modules: list[str] = []              # older clients: application keys → "<app>:view"
    is_default: bool = False
    confirm_owner_level: bool = False


class RolePatch(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: list[str] | None = None
    modules: list[str] | None = None
    is_default: bool | None = None
    confirm_owner_level: bool = False


class ModulePatch(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None


class PermPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    grp: str | None = None
    restricted: bool | None = None
    enabled: bool | None = None


class Change(BaseModel):
    role: int
    perm: str
    on: bool


class ChangesIn(BaseModel):
    changes: list[Change]
    dry_run: bool = False
    confirm_owner_level: bool = False


class PermRolesIn(BaseModel):
    add: list[int] = []
    remove: list[int] = []
    dry_run: bool = False
    confirm_owner_level: bool = False


class GrantIn(BaseModel):
    permission: str
    reason: str
    expires_on: date | None = None
    confirm_owner_level: bool = False


class UserFilter(BaseModel):
    q: str = ""
    role: int | None = None
    perm: str | None = None
    direct: bool | None = None
    owner: bool | None = None
    status: str | None = None


class BulkUsersIn(BaseModel):
    customer_ids: list[int] = []
    filter: UserFilter | None = None         # "select all N matching": the server resolves the filter
    add_roles: list[int] = []
    remove_roles: list[int] = []
    grant: GrantIn | None = None
    revoke: str | None = None                # remove this direct grant
    dry_run: bool = False
    confirm_owner_level: bool = False


class CustomerRolesIn(BaseModel):
    role_ids: list[int]


class BulkRolesIn(BaseModel):
    customer_ids: list[int]
    add: list[int] = []
    remove: list[int] = []


def _iso(v):
    return v.astimezone(TZ).isoformat() if v else None


def _today():
    return now().date()


def _log(c, user, event, **detail):
    act.log(c, actor_kind="user", actor_id=user["name"], actor_name=user["name"], app="admin", event=event, detail=detail)


# ─── reads ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def _catmap(c):
    return {r["key"]: r for r in c.execute("SELECT p.*, m.name AS app FROM app_permissions p JOIN app_modules m ON m.key = p.module")}


def _catalogue(c):
    return c.execute(
        "SELECT p.key, p.module, p.action, p.name, p.description, p.grp, p.restricted, p.enabled, p.requires, p.retired, "
        "m.name AS app, (SELECT count(*) FROM role_permissions rp WHERE rp.permission = p.key) AS roles, "
        "(SELECT count(*) FROM effective_permissions e WHERE e.key = p.key) AS holders, "
        f"(SELECT count(*) FROM customer_permissions g WHERE g.permission = p.key AND {perms.ACTIVE_GRANT}) AS direct "
        "FROM app_permissions p JOIN app_modules m ON m.key = p.module ORDER BY m.sort, p.sort, p.key").fetchall()


def _modules(c):
    return c.execute("SELECT m.key, m.name, m.description, m.sort, COALESCE(p.enabled, m.enabled) AS enabled "
                     "FROM app_modules m LEFT JOIN app_permissions p ON p.key = m.key || ':view' ORDER BY m.sort, m.key").fetchall()


def _roles(c):
    restricted = {r["key"] for r in c.execute("SELECT key FROM app_permissions WHERE restricted")}
    rows = c.execute(
        "SELECT r.id, r.name, r.description, r.is_default, r.is_system, r.created_at, r.updated_at, r.updated_by, "
        "ARRAY(SELECT rp.permission FROM role_permissions rp JOIN app_permissions p ON p.key = rp.permission "
        "      JOIN app_modules m ON m.key = p.module WHERE rp.role_id = r.id ORDER BY m.sort, p.sort) AS permissions, "
        "(SELECT count(*) FROM customer_roles cr WHERE cr.role_id = r.id) AS users "
        "FROM roles r ORDER BY r.is_system DESC, r.is_default DESC, lower(r.name)").fetchall()
    return [{**r, "created_at": _iso(r["created_at"]), "updated_at": _iso(r["updated_at"]),
             "modules": [k.split(":")[0] for k in r["permissions"] if k.endswith(":view")],
             "owner": any(k in restricted for k in r["permissions"])} for r in rows]


def _access(c):
    return {"modules": _modules(c), "roles": _roles(c), "permissions": _catalogue(c)}


def _eff_map(c, cids):
    out = {cid: set() for cid in cids}
    if cids:
        for r in c.execute("SELECT customer_id, key FROM effective_permissions WHERE customer_id = ANY(%s)", (list(cids),)):
            out[r["customer_id"]].add(r["key"])
    return out


def _diff(c, before, after):
    """who gains / loses which permission (counts per permission + the number of customers whose access changed)"""
    cat = _catmap(c)
    gains, losses, changed = {}, {}, 0
    for cid in before:
        b, a = before[cid], after.get(cid, set())
        if a != b:
            changed += 1
        for k in a - b:
            gains[k] = gains.get(k, 0) + 1
        for k in b - a:
            losses[k] = losses.get(k, 0) + 1
    fmt = lambda d: [{"key": k, "name": cat[k]["name"], "app": cat[k]["app"], "restricted": cat[k]["restricted"], "n": n}
                     for k, n in sorted(d.items(), key=lambda x: -x[1])]
    return {"customers": changed, "gains": fmt(gains), "losses": fmt(losses)}


def _pin_new_apps(c, before, after):
    """An application a customer has just gained is pinned to their side menu (owner, 2026-11-01). Saved pins: added
    while there is room; a full menu gives its last place to the first new app. No saved pins: nothing is written."""
    order = [r["key"] for r in c.execute("SELECT key FROM app_modules ORDER BY sort, key")]
    apps = lambda keys: {k.split(":")[0] for k in keys if k.endswith(":view")}
    for cid in before:
        now_apps = apps(after.get(cid, set()))
        new = [k for k in order if k in now_apps - apps(before[cid])]
        row = new and c.execute("SELECT pins FROM customer_prefs WHERE customer_id = %s", (cid,)).fetchone()
        if not row:
            continue
        pins = [k for k in row["pins"] if k in now_apps]
        add = [k for k in new if k not in pins]
        if not add:
            continue
        room = MAX_PINS - len(pins)
        pins = pins + add[:room] if room > 0 else pins[:MAX_PINS - 1] + add[:1]
        c.execute("INSERT INTO customer_prefs (customer_id, pins, updated_at) VALUES (%s, %s, now()) "
                  "ON CONFLICT (customer_id) DO UPDATE SET pins = EXCLUDED.pins, updated_at = now()", (cid, pins))


# ─── role ↔ permission changes ──────────────────────────────────────────────────────────────────────────────────────
def _with_needs(cat, keys):
    """a permission brings the one it requires"""
    keys = set(keys)
    keys |= {cat[k]["requires"] for k in keys if k in cat and cat[k]["requires"]}
    return keys


def _without_orphans(cat, keys):
    """a permission whose required one is gone leaves too"""
    return {k for k in keys if not (k in cat and cat[k]["requires"] and cat[k]["requires"] not in keys)}


def _check_role_set(cat, role, keys, had):
    unknown = [k for k in keys if k not in cat]
    if unknown:
        raise HTTPException(422, f"Unknown permission: {unknown[0]}")
    new_retired = [k for k in keys - had if cat[k]["retired"]]
    if new_retired:
        raise HTTPException(422, f"“{cat[new_retired[0]]['name']}” is retired and cannot be given any more")
    if role["is_default"]:
        if not any(k.endswith(":view") for k in keys):
            raise HTTPException(422, "The default role needs at least one application")
        bad = [k for k in keys if cat[k]["restricted"]]
        if bad:
            raise HTTPException(422, f"“{cat[bad[0]]['name']}” ({cat[bad[0]]['app']}) is owner-level and can never be on the "
                                     "default role — every new customer would get it")


def _apply_roles(c, user, new_sets, dry_run=False, confirm=False):
    """Set the permissions of several roles at once ({role id: set of keys}) → summary. One savepoint: rolled back
    for a preview (dry_run)."""
    cat = _catmap(c)
    roles = {r["id"]: r for r in c.execute("SELECT id, name, is_default FROM roles WHERE id = ANY(%s)", (list(new_sets),))}
    missing = [rid for rid in new_sets if rid not in roles]
    if missing:
        raise HTTPException(404, "Role not found")
    cur = {rid: set() for rid in new_sets}
    for r in c.execute("SELECT role_id, permission FROM role_permissions WHERE role_id = ANY(%s)", (list(new_sets),)):
        cur[r["role_id"]].add(r["permission"])
    per_role, owner_added = [], False
    for rid, keys in new_sets.items():
        keys = set(keys)
        _check_role_set(cat, roles[rid], keys, cur[rid])
        added, removed = sorted(keys - cur[rid]), sorted(cur[rid] - keys)
        owner_added |= any(cat[k]["restricted"] for k in added)
        if added or removed:
            per_role.append({"id": rid, "name": roles[rid]["name"], "added": added, "removed": removed})
    if owner_added and not confirm and not dry_run:
        raise HTTPException(409, OWNER_CONFIRM, headers={"X-Confirm": "owner-level"})
    holders = [r["customer_id"] for r in c.execute("SELECT DISTINCT customer_id FROM customer_roles WHERE role_id = ANY(%s)",
                                                   ([p["id"] for p in per_role],))] if per_role else []
    before = _eff_map(c, holders)
    with c.transaction() as tx:
        for p in per_role:
            if p["removed"]:
                c.execute("DELETE FROM role_permissions WHERE role_id = %s AND permission = ANY(%s)", (p["id"], p["removed"]))
            for k in p["added"]:
                c.execute("INSERT INTO role_permissions (role_id, permission) VALUES (%s, %s) ON CONFLICT DO NOTHING", (p["id"], k))
            c.execute("UPDATE roles SET updated_at = now(), updated_by = %s WHERE id = %s", (user["name"], p["id"]))
        after = _eff_map(c, holders)
        summary = {"roles": per_role, "owner_level": owner_added, "dry_run": dry_run, **_diff(c, before, after)}
        if dry_run:
            raise psycopg.Rollback(tx)
        for p in per_role:
            _log(c, user, "role_updated", role=p["name"], added=p["added"], removed=p["removed"],
                 customers_changed=summary["customers"])
        _pin_new_apps(c, before, after)
    return summary


# ─── customers ↔ roles / direct grants ──────────────────────────────────────────────────────────────────────────────
def _user_where(f: UserFilter):
    w, a = [], []
    if f.q and f.q.strip():
        like = f"%{f.q.strip()}%"
        w.append("(c.name ILIKE %s OR c.email ILIKE %s)"); a += [like, like]
    if f.role:
        w.append("EXISTS (SELECT 1 FROM customer_roles cr WHERE cr.customer_id = c.id AND cr.role_id = %s)"); a.append(f.role)
    if f.perm:
        w.append("EXISTS (SELECT 1 FROM effective_permissions e WHERE e.customer_id = c.id AND e.key = %s)"); a.append(f.perm)
    if f.direct is not None:
        w.append(("" if f.direct else "NOT ") +
                 f"EXISTS (SELECT 1 FROM customer_permissions g WHERE g.customer_id = c.id AND {perms.ACTIVE_GRANT})")
    if f.owner is not None:
        w.append(("" if f.owner else "NOT ") + "EXISTS (SELECT 1 FROM effective_permissions e JOIN app_permissions p "
                 "ON p.key = e.key AND p.restricted WHERE e.customer_id = c.id)")
    if f.status:
        w.append("c.status = %s"); a.append(f.status)
    return (" WHERE " + " AND ".join(w)) if w else "", a


def _grant(c, user, cids, g: GrantIn, dry=False):
    """direct grant to customers (+ the permission it requires, when they don't have it) → list of keys given"""
    cat = _catmap(c)
    p = cat.get(g.permission)
    if not p:
        raise HTTPException(422, "Unknown permission")
    if p["retired"]:
        raise HTTPException(422, f"“{p['name']}” is retired and cannot be given any more")
    reason = " ".join((g.reason or "").split())
    if not 3 <= len(reason) <= 200:
        raise HTTPException(422, "Write a reason (3–200 characters), e.g. “7-day trial” or “checking results”")
    if g.expires_on and g.expires_on < _today():
        raise HTTPException(422, "The last day cannot be in the past")
    if p["restricted"] and not (g.confirm_owner_level or dry):
        raise HTTPException(409, OWNER_CONFIRM, headers={"X-Confirm": "owner-level"})
    keys = [g.permission]
    eff = _eff_map(c, cids)
    names = {r["id"]: r["name"] for r in c.execute("SELECT id, name FROM customers WHERE id = ANY(%s)", (list(cids),))}
    for cid in cids:
        give = [g.permission] + ([p["requires"]] if p["requires"] and p["requires"] not in eff[cid] else [])
        for k in give:
            c.execute("INSERT INTO customer_permissions (customer_id, permission, reason, expires_on, granted_by) VALUES (%s,%s,%s,%s,%s) "
                      "ON CONFLICT (customer_id, permission) DO UPDATE SET reason = EXCLUDED.reason, expires_on = EXCLUDED.expires_on, "
                      "granted_by = EXCLUDED.granted_by, granted_at = now()", (cid, k, reason, g.expires_on, user["name"]))
        if len(give) > 1:
            keys = give
        if not dry:
            act.log(c, actor_kind="customer", actor_id=cid, actor_name=names.get(cid), app="customer", event="grant_added",
                    detail={"by": user["name"], "permissions": [cat[k]["name"] + f" ({cat[k]['app']})" for k in give],
                            "reason": reason, "until": g.expires_on.isoformat() if g.expires_on else None})
    return keys


def _revoke(c, user, cids, key, dry=False):
    cat = _catmap(c)
    names = {r["id"]: r["name"] for r in c.execute("SELECT id, name FROM customers WHERE id = ANY(%s)", (list(cids),))}
    rows = c.execute("DELETE FROM customer_permissions WHERE customer_id = ANY(%s) AND permission = %s RETURNING customer_id, permission",
                     (list(cids), key)).fetchall()
    if rows:                       # a removed application takes the direct grants that need it (e.g. its detail view)
        rows += c.execute("DELETE FROM customer_permissions WHERE customer_id = ANY(%s) AND permission IN "
                          "(SELECT key FROM app_permissions WHERE requires = %s) RETURNING customer_id, permission",
                          ([r["customer_id"] for r in rows], key)).fetchall()
    if not dry:
        done = {}
        for r in rows:
            done.setdefault(r["customer_id"], []).append(r["permission"])
        for cid, ks in done.items():
            act.log(c, actor_kind="customer", actor_id=cid, actor_name=names.get(cid), app="customer", event="grant_removed",
                    detail={"by": user["name"], "permissions": [cat[k]["name"] + f" ({cat[k]['app']})" for k in ks if k in cat]})
    return len(rows)


def _set_roles(c, user, cid, role_ids, valid, name=None):
    before = [r["role_id"] for r in c.execute("SELECT role_id FROM customer_roles WHERE customer_id = %s ORDER BY role_id", (cid,))]
    after = sorted(set(role_ids))
    if before == after:
        return False
    c.execute("DELETE FROM customer_roles WHERE customer_id = %s AND NOT (role_id = ANY(%s))", (cid, after))
    for rid in after:
        c.execute("INSERT INTO customer_roles (customer_id, role_id, assigned_by) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                  (cid, rid, user["name"]))
    act.log(c, actor_kind="customer", actor_id=cid, actor_name=name, app="customer", event="roles_changed",
            detail={"by": user["name"], "before": [valid[x] for x in before if x in valid], "after": [valid[x] for x in after]})
    return True


def _bulk_users(c, user, cids, add_roles=(), remove_roles=(), grant=None, revoke=None, dry_run=False, confirm=False):
    valid = {r["id"]: r["name"] for r in c.execute("SELECT id, name FROM roles")}
    if any(r not in valid for r in list(add_roles) + list(remove_roles)):
        raise HTTPException(404, "Role not found")
    cat = _catmap(c)
    owner_roles = {r["role_id"] for r in c.execute("SELECT DISTINCT rp.role_id FROM role_permissions rp JOIN app_permissions p "
                                                   "ON p.key = rp.permission AND p.restricted")}
    if (any(r in owner_roles for r in add_roles) or (grant and cat.get(grant.permission, {}).get("restricted"))) and not (confirm or dry_run):
        raise HTTPException(409, OWNER_CONFIRM, headers={"X-Confirm": "owner-level"})
    if grant:
        grant = grant.model_copy(update={"confirm_owner_level": True})      # confirmed above for the whole batch
    names = {r["id"]: r["name"] for r in c.execute("SELECT id, name FROM customers WHERE id = ANY(%s)", (list(cids),))}
    cids = [cid for cid in dict.fromkeys(cids) if cid in names]
    have = {cid: set() for cid in cids}
    for r in c.execute("SELECT customer_id, role_id FROM customer_roles WHERE customer_id = ANY(%s)", (cids,)):
        have[r["customer_id"]].add(r["role_id"])
    before = _eff_map(c, cids)
    skipped = role_changes = 0
    with c.transaction() as tx:
        if add_roles or remove_roles:
            for cid in cids:
                new = (have[cid] | set(add_roles)) - set(remove_roles)
                if not new:
                    skipped += 1
                    continue
                if new == have[cid]:
                    continue
                role_changes += 1
                if not dry_run:
                    _set_roles(c, user, cid, new, valid, names[cid])
                else:
                    c.execute("DELETE FROM customer_roles WHERE customer_id = %s AND NOT (role_id = ANY(%s))", (cid, list(new)))
                    for rid in new:
                        c.execute("INSERT INTO customer_roles (customer_id, role_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (cid, rid))
        if grant:
            _grant(c, user, cids, grant, dry=dry_run)
        if revoke:
            _revoke(c, user, cids, revoke, dry=dry_run)
        after = _eff_map(c, cids)
        summary = {"matched": len(cids), "skipped": skipped, "role_changes": role_changes, "dry_run": dry_run, **_diff(c, before, after)}
        if dry_run:
            raise psycopg.Rollback(tx)
        _pin_new_apps(c, before, after)
    return summary


def build(admin_user, cust, cust_cols):
    """the Access manager API, mounted by main.py (admin_user = its admin dependency, cust = its customer row formatter)"""
    r = APIRouter()

    def _role_or_404(c, rid):
        row = c.execute("SELECT * FROM roles WHERE id = %s", (rid,)).fetchone()
        if not row:
            raise HTTPException(404, "Role not found")
        return row

    def _clean_name(c, name, rid=None):
        name = " ".join((name or "").split())
        if not 2 <= len(name) <= ROLE_NAME_MAX:
            raise HTTPException(422, f"Role name must be 2–{ROLE_NAME_MAX} characters")
        if c.execute("SELECT 1 FROM roles WHERE lower(name) = lower(%s) AND id IS DISTINCT FROM %s", (name, rid)).fetchone():
            raise HTTPException(409, f"A role called “{name}” already exists")
        return name

    def _keys_from(body_perms, body_mods):
        return set(body_perms or []) | {f"{m}:view" for m in (body_mods or [])}

    # ── overview + roles ────────────────────────────────────────────────────────────────────────────────────────────
    @r.get("/api/admin/access")
    def access_overview(user=Depends(admin_user)):
        with pool.connection() as c:
            return _access(c)

    @r.post("/api/admin/roles")
    def create_role(body: RoleIn, user=Depends(admin_user)):
        with pool.connection() as c:
            name = _clean_name(c, body.name)
            cat = _catmap(c)
            keys = _with_needs(cat, _keys_from(body.permissions, body.modules))
            _check_role_set(cat, {"is_default": body.is_default}, keys, set())
            if any(cat[k]["restricted"] for k in keys) and not body.confirm_owner_level:
                raise HTTPException(409, OWNER_CONFIRM, headers={"X-Confirm": "owner-level"})
            if body.is_default:
                c.execute("UPDATE roles SET is_default = false WHERE is_default")
            rid = c.execute("INSERT INTO roles (name, description, is_default, updated_by) VALUES (%s,%s,%s,%s) RETURNING id",
                            (name, body.description.strip()[:ROLE_DESC_MAX], body.is_default, user["name"])).fetchone()["id"]
            for k in keys:
                c.execute("INSERT INTO role_permissions (role_id, permission) VALUES (%s, %s)", (rid, k))
            _log(c, user, "role_created", role=name, permissions=sorted(keys), default=body.is_default)
            return {**_access(c), "id": rid}

    @r.patch("/api/admin/roles/{rid}")
    def update_role(rid: int, body: RolePatch, user=Depends(admin_user)):
        with pool.connection() as c:
            role = _role_or_404(c, rid)
            name = _clean_name(c, body.name, rid) if body.name is not None else role["name"]
            if body.is_default is False and role["is_default"]:
                raise HTTPException(422, "There must always be a default role — make another role the default instead")
            make_default = bool(body.is_default) and not role["is_default"]
            cat = _catmap(c)
            cur = {x["permission"] for x in c.execute("SELECT permission FROM role_permissions WHERE role_id = %s", (rid,))}
            if body.permissions is not None:
                keys = _with_needs(cat, _keys_from(body.permissions, body.modules))
            elif body.modules is not None:        # older clients send applications only: extra permissions stay with their app
                views = _keys_from([], body.modules)
                keys = views | {k for k in cur if not k.endswith(":view") and cat.get(k, {}).get("requires") in views}
            else:
                keys = cur
            if make_default:
                _check_role_set(cat, {"is_default": True}, keys, cur)
                c.execute("UPDATE roles SET is_default = false WHERE is_default")
            c.execute("UPDATE roles SET name = %s, description = %s, is_default = %s, updated_at = now(), updated_by = %s WHERE id = %s",
                      (name, (body.description if body.description is not None else role["description"]).strip()[:ROLE_DESC_MAX],
                       role["is_default"] or make_default, user["name"], rid))
            summary = _apply_roles(c, user, {rid: keys}, confirm=body.confirm_owner_level) if keys != cur else None
            if name != role["name"] or make_default:
                _log(c, user, "role_updated", role=name, **({"renamed_from": role["name"]} if name != role["name"] else {}),
                     **({"default": True} if make_default else {}))
            return {**_access(c), "summary": summary}

    @r.post("/api/admin/roles/{rid}/duplicate")
    def duplicate_role(rid: int, user=Depends(admin_user)):
        with pool.connection() as c:
            role = _role_or_404(c, rid)
            name, n = f"{role['name'][:ROLE_NAME_MAX - 7]} (copy)", 2
            while c.execute("SELECT 1 FROM roles WHERE lower(name) = lower(%s)", (name,)).fetchone():
                name = f"{role['name'][:ROLE_NAME_MAX - 10]} (copy {n})"; n += 1
            new = c.execute("INSERT INTO roles (name, description, updated_by) VALUES (%s,%s,%s) RETURNING id",
                            (name, role["description"], user["name"])).fetchone()["id"]
            c.execute("INSERT INTO role_permissions (role_id, permission) SELECT %s, permission FROM role_permissions WHERE role_id = %s", (new, rid))
            _log(c, user, "role_created", role=name, copied_from=role["name"])
            return {**_access(c), "id": new}

    @r.delete("/api/admin/roles/{rid}")
    def delete_role(rid: int, user=Depends(admin_user)):
        with pool.connection() as c:
            role = _role_or_404(c, rid)
            if role["is_system"]:
                raise HTTPException(422, f"“{role['name']}” is the built-in role and cannot be deleted (you can edit it)")
            if role["is_default"]:
                raise HTTPException(422, "This is the default role — make another role the default first")
            moved = c.execute("INSERT INTO customer_roles (customer_id, role_id, assigned_by) "
                              "SELECT cr.customer_id, d.id, %s FROM customer_roles cr CROSS JOIN (SELECT id FROM roles WHERE is_default) d "
                              "WHERE cr.role_id = %s AND NOT EXISTS (SELECT 1 FROM customer_roles o WHERE o.customer_id = cr.customer_id AND o.role_id <> %s) "
                              "ON CONFLICT DO NOTHING", (f"{user['name']} (role deleted)", rid, rid)).rowcount
            c.execute("DELETE FROM roles WHERE id = %s", (rid,))
            _log(c, user, "role_deleted", role=role["name"], moved_to_default=moved)
            return {**_access(c), "moved": moved}

    @r.post("/api/admin/access/role-permissions")
    def change_role_permissions(body: ChangesIn, user=Depends(admin_user)):
        """the matrix / role editor's pending changes, saved (or previewed) in one go"""
        if not body.changes:
            raise HTTPException(422, "Nothing to change")
        with pool.connection() as c:
            cat = _catmap(c)
            sets = {}
            for ch in body.changes:
                if ch.perm not in cat:
                    raise HTTPException(422, f"Unknown permission: {ch.perm}")
                if ch.role not in sets:
                    sets[ch.role] = {x["permission"] for x in c.execute("SELECT permission FROM role_permissions WHERE role_id = %s", (ch.role,))}
                sets[ch.role] = _with_needs(cat, sets[ch.role] | {ch.perm}) if ch.on else _without_orphans(cat, sets[ch.role] - {ch.perm})
            summary = _apply_roles(c, user, sets, body.dry_run, body.confirm_owner_level)
            return summary if body.dry_run else {**_access(c), "summary": summary}

    # ── permission manager ──────────────────────────────────────────────────────────────────────────────────────────
    @r.patch("/api/admin/access/permissions/{key}")
    def update_permission(key: str, body: PermPatch, user=Depends(admin_user)):
        with pool.connection() as c:
            p = c.execute("SELECT * FROM app_permissions WHERE key = %s", (key,)).fetchone()
            if not p:
                raise HTTPException(404, "Permission not found")
            name = " ".join((body.name if body.name is not None else p["name"]).split())
            if not 2 <= len(name) <= 60:
                raise HTTPException(422, "Permission label must be 2–60 characters")
            grp = (" ".join(body.grp.split())[:40] or None) if body.grp is not None else p["grp"]
            restricted = p["restricted"] if body.restricted is None else body.restricted
            if restricted and not p["restricted"] and c.execute(
                    "SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id AND r.is_default WHERE rp.permission = %s", (key,)).fetchone():
                raise HTTPException(422, "The default role holds this permission — take it off the default role before making it owner-level")
            enabled = p["enabled"] if body.enabled is None else body.enabled
            c.execute("UPDATE app_permissions SET name = %s, description = %s, grp = %s, restricted = %s, enabled = %s WHERE key = %s",
                      (name, (body.description if body.description is not None else p["description"]).strip()[:200], grp, restricted, enabled, key))
            if key.endswith(":view") and enabled != p["enabled"]:
                c.execute("UPDATE app_modules SET enabled = %s WHERE key = %s", (enabled, p["module"]))
            changed = {k: v for k, v in (("label", name), ("group", grp), ("owner_level", restricted), ("enabled", enabled))
                       if v != {"label": p["name"], "group": p["grp"], "owner_level": p["restricted"], "enabled": p["enabled"]}[k]}
            _log(c, user, "perm_updated", permission=key, **changed)
            return _access(c)

    @r.patch("/api/admin/modules/{key}")
    def update_module(key: str, body: ModulePatch, user=Depends(admin_user)):
        """an application's name / description (the group heading of its permissions); on/off = its view permission"""
        with pool.connection() as c:
            m = c.execute("SELECT * FROM app_modules WHERE key = %s", (key,)).fetchone()
            if not m:
                raise HTTPException(404, "Application not found")
            name = " ".join((body.name if body.name is not None else m["name"]).split())
            if not 2 <= len(name) <= 60:
                raise HTTPException(422, "Application name must be 2–60 characters")
            enabled = m["enabled"] if body.enabled is None else body.enabled
            c.execute("UPDATE app_modules SET name = %s, description = %s, enabled = %s WHERE key = %s",
                      (name, (body.description if body.description is not None else m["description"]).strip()[:200], enabled, key))
            c.execute("UPDATE app_permissions SET enabled = %s WHERE key = %s", (enabled, f"{key}:view"))
            _log(c, user, "app_updated", app=key, **({"enabled": body.enabled} if body.enabled is not None else {}),
                 **({"renamed_from": m["name"]} if name != m["name"] else {}))
            return _access(c)

    @r.get("/api/admin/access/permissions/{key}/holders")
    def permission_holders(key: str, q: str = "", source: str = "all", page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=PAGE_MAX),
                           user=Depends(admin_user)):
        if source not in ("all", "role", "direct"):
            raise HTTPException(422, "source is all, role or direct")
        with pool.connection() as c:
            if not c.execute("SELECT 1 FROM app_permissions WHERE key = %s", (key,)).fetchone():
                raise HTTPException(404, "Permission not found")
            w, a = ["e.key = %s"], [key]
            if q.strip():
                w.append("(c.name ILIKE %s OR c.email ILIKE %s)"); a += [f"%{q.strip()}%"] * 2
            via_role = ("EXISTS (SELECT 1 FROM customer_roles cr JOIN role_permissions rp ON rp.role_id = cr.role_id "
                        "WHERE cr.customer_id = c.id AND rp.permission = e.key)")
            direct = f"EXISTS (SELECT 1 FROM customer_permissions g WHERE g.customer_id = c.id AND g.permission = e.key AND {perms.ACTIVE_GRANT})"
            if source == "role":
                w.append(via_role)
            elif source == "direct":
                w.append(direct)
            where = " WHERE " + " AND ".join(w)
            frm = "FROM customers c JOIN effective_permissions e ON e.customer_id = c.id"
            total = c.execute(f"SELECT count(*) AS n {frm}{where}", a).fetchone()["n"]
            rows = c.execute(
                f"SELECT c.id, c.name, c.email, c.status, "
                "ARRAY(SELECT r.name FROM customer_roles cr JOIN roles r ON r.id = cr.role_id JOIN role_permissions rp "
                "      ON rp.role_id = r.id AND rp.permission = e.key WHERE cr.customer_id = c.id ORDER BY r.name) AS via_roles, "
                "(SELECT json_build_object('until', g.expires_on, 'reason', g.reason) FROM customer_permissions g "
                f" WHERE g.customer_id = c.id AND g.permission = e.key AND {perms.ACTIVE_GRANT}) AS direct "
                f"{frm}{where} ORDER BY lower(c.name) LIMIT %s OFFSET %s", (*a, size, (page - 1) * size)).fetchall()
            roles = c.execute("SELECT r.id, r.name, (SELECT count(*) FROM customer_roles cr WHERE cr.role_id = r.id) AS users "
                              "FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE rp.permission = %s ORDER BY lower(r.name)", (key,)).fetchall()
        return {"total": total, "page": page, "size": size, "rows": rows, "roles": roles}

    @r.put("/api/admin/access/permissions/{key}/roles")
    def permission_roles(key: str, body: PermRolesIn, user=Depends(admin_user)):
        """one permission → many roles (add / remove), previewed or saved in one go"""
        if not (body.add or body.remove):
            raise HTTPException(422, "Pick roles to add or remove")
        with pool.connection() as c:
            cat = _catmap(c)
            if key not in cat:
                raise HTTPException(404, "Permission not found")
            sets = {}
            for rid in dict.fromkeys(body.add + body.remove):
                cur = {x["permission"] for x in c.execute("SELECT permission FROM role_permissions WHERE role_id = %s", (rid,))}
                sets[rid] = _with_needs(cat, cur | {key}) if rid in body.add else _without_orphans(cat, cur - {key})
            summary = _apply_roles(c, user, sets, body.dry_run, body.confirm_owner_level)
            return summary if body.dry_run else {**_access(c), "summary": summary}

    # ── customers ───────────────────────────────────────────────────────────────────────────────────────────────────
    SORTS = {"name": "lower(c.name)", "email": "lower(c.email)", "last_login": "c.last_login DESC NULLS LAST", "created": "c.created_at DESC"}

    @r.get("/api/admin/access/users")
    def access_users(q: str = "", role: int | None = None, perm: str | None = None, direct: bool | None = None, owner: bool | None = None,
                     status: str | None = None, sort: str = "name", page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=PAGE_MAX),
                     user=Depends(admin_user)):
        where, args = _user_where(UserFilter(q=q, role=role, perm=perm, direct=direct, owner=owner, status=status))
        with pool.connection() as c:
            total = c.execute(f"SELECT count(*) AS n FROM customers c{where}", args).fetchone()["n"]
            rows = c.execute(
                "SELECT c.id, c.name, c.email, c.status, c.last_login, c.created_at, "
                "ARRAY(SELECT cr.role_id FROM customer_roles cr WHERE cr.customer_id = c.id ORDER BY cr.role_id) AS roles, "
                "COALESCE((SELECT json_agg(json_build_object('key', g.permission, 'until', g.expires_on, 'reason', g.reason) "
                f"ORDER BY g.permission) FROM customer_permissions g WHERE g.customer_id = c.id AND {perms.ACTIVE_GRANT}), '[]'::json) AS grants, "
                "ARRAY(SELECT e.key FROM effective_permissions e WHERE e.customer_id = c.id) AS perms "
                f"FROM customers c{where} ORDER BY {SORTS.get(sort, SORTS['name'])}, c.id LIMIT %s OFFSET %s",
                (*args, size, (page - 1) * size)).fetchall()
        return {"total": total, "page": page, "size": size,
                "rows": [{**x, "last_login": _iso(x["last_login"]), "created_at": _iso(x["created_at"])} for x in rows]}

    @r.get("/api/admin/access/users/{cid}")
    def access_user(cid: int, user=Depends(admin_user)):
        with pool.connection() as c:
            row = c.execute(f"SELECT {cust_cols} FROM customers WHERE id = %s", (cid,)).fetchone()
            if not row:
                raise HTTPException(404, "Customer not found")
            roles = c.execute("SELECT r.id, r.name, cr.assigned_at, cr.assigned_by FROM customer_roles cr JOIN roles r ON r.id = cr.role_id "
                              "WHERE cr.customer_id = %s ORDER BY r.name", (cid,)).fetchall()
            grants = c.execute("SELECT g.permission AS key, p.name, m.name AS app, g.reason, g.expires_on, g.granted_by, g.granted_at, "
                               f"{perms.ACTIVE_GRANT} AS active FROM customer_permissions g JOIN app_permissions p ON p.key = g.permission "
                               "JOIN app_modules m ON m.key = p.module WHERE g.customer_id = %s ORDER BY m.sort, p.sort", (cid,)).fetchall()
            access = perms.explain(c, cid)
        return {"customer": cust(row), "roles": [{**x, "assigned_at": _iso(x["assigned_at"])} for x in roles],
                "grants": [{**g, "expires_on": g["expires_on"].isoformat() if g["expires_on"] else None, "granted_at": _iso(g["granted_at"])}
                           for g in grants], "access": access}

    def _set_one(cid, role_ids, user):
        with pool.connection() as c:
            name = c.execute("SELECT name FROM customers WHERE id = %s", (cid,)).fetchone()
            if not name:
                raise HTTPException(404, "Customer not found")
            if not role_ids:
                raise HTTPException(422, "A customer needs at least one role (block the account to stop all access)")
            valid = {r["id"]: r["name"] for r in c.execute("SELECT id, name FROM roles")}
            if any(x not in valid for x in role_ids):
                raise HTTPException(404, "Role not found")
            before = _eff_map(c, [cid])
            _set_roles(c, user, cid, role_ids, valid, name["name"])
            _pin_new_apps(c, before, _eff_map(c, [cid]))
            return {"roles": sorted(set(role_ids))}

    @r.put("/api/admin/access/users/{cid}/roles")
    def access_user_roles(cid: int, body: CustomerRolesIn, user=Depends(admin_user)):
        return _set_one(cid, body.role_ids, user)

    @r.put("/api/admin/customers/{cid}/roles")                       # older clients (Customers tab, tests)
    def set_customer_roles(cid: int, body: CustomerRolesIn, user=Depends(admin_user)):
        return _set_one(cid, body.role_ids, user)

    @r.post("/api/admin/access/users/{cid}/grants")
    def add_grant(cid: int, body: GrantIn, user=Depends(admin_user)):
        with pool.connection() as c:
            if not c.execute("SELECT 1 FROM customers WHERE id = %s", (cid,)).fetchone():
                raise HTTPException(404, "Customer not found")
            before = _eff_map(c, [cid])
            keys = _grant(c, user, [cid], body)
            _pin_new_apps(c, before, _eff_map(c, [cid]))
        return {"granted": keys}

    @r.delete("/api/admin/access/users/{cid}/grants/{key}")
    def remove_grant(cid: int, key: str, user=Depends(admin_user)):
        with pool.connection() as c:
            n = _revoke(c, user, [cid], key)
        if not n:
            raise HTTPException(404, "No such direct grant")
        return {"removed": n}

    @r.post("/api/admin/access/users/bulk")
    def bulk_users(body: BulkUsersIn, user=Depends(admin_user)):
        if not (body.add_roles or body.remove_roles or body.grant or body.revoke):
            raise HTTPException(422, "Pick something to change")
        with pool.connection() as c:
            if body.filter is not None:
                where, args = _user_where(body.filter)
                cids = [x["id"] for x in c.execute(f"SELECT c.id FROM customers c{where} LIMIT %s", (*args, BULK_MAX + 1))]
            else:
                cids = list(dict.fromkeys(body.customer_ids))
            if not cids:
                raise HTTPException(422, "No customers picked")
            if len(cids) > BULK_MAX:
                raise HTTPException(422, f"Too many customers at once (up to {BULK_MAX:,})")
            return _bulk_users(c, user, cids, body.add_roles, body.remove_roles, body.grant, body.revoke, body.dry_run,
                               body.confirm_owner_level)

    @r.post("/api/admin/roles/bulk")                                  # older clients: add / remove roles for many customers
    def bulk_roles(body: BulkRolesIn, user=Depends(admin_user)):
        if not body.customer_ids or not (body.add or body.remove):
            raise HTTPException(422, "Pick customers and a role to add or remove")
        if len(body.customer_ids) > 5000:
            raise HTTPException(422, "Too many customers at once")
        with pool.connection() as c:
            s = _bulk_users(c, user, body.customer_ids, body.add, body.remove, confirm=True)
        return {"changed": s["role_changes"], "skipped": s["skipped"]}

    return r
