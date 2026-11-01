"""Access audit: every API route must check access on the server (owner, 2026-11-01: "even they use Postman or Burp
… restrict the response based on the role"). Lists each route with the checks FastAPI runs before it and fails when a
route has none and is not a known exception.

    docker compose exec api python -m app.route_guards              # admin service (app.main)
    docker compose exec portal python -m app.route_guards portal    # customer service (app.portal)
"""
import sys

from fastapi.routing import APIRoute

# open on purpose (signing in / up / out, health)
PUBLIC = {"/api/login", "/api/logout", "/api/health",
          "/app/api/login", "/app/api/logout", "/app/api/register", "/app/api/signup-info", "/app/api/health"}
# the check runs inside the function (the permission depends on a query value): name the check here
INSIDE = {"/app/api/detail/{symbol}": "need_perm(f'{app_key}:detail') + row-level security on stock_detail"}
# what a route under each prefix must run
REQUIRED = [("/api/admin", {"admin_user"}),
            ("/api/helpdesk", {"hd_actor"}),
            ("/api/", {"current_user", "admin_user"}),
            ("/app/api/helpdesk", {"hd_customer"}),
            ("/app/api/", {"customer"})]


def _guards(dep, out):
    for d in dep.dependencies:
        out.add(getattr(d.call, "__qualname__", str(d.call)).split(".")[0])
        _guards(d, out)
    return out


def audit(app):
    """[(methods, path, checks, problem or "")] for every API route of the app"""
    rows = []
    for r in app.routes:
        if not isinstance(r, APIRoute):
            continue
        g = _guards(r.dependant, set())
        need = next((s for p, s in REQUIRED if r.path.startswith(p)), None)
        problem = "" if r.path in PUBLIC or r.path in INSIDE or (need and g & need) else \
            f"no access check (needs one of {', '.join(sorted(need or {'a guard'}))})"
        rows.append((",".join(sorted(r.methods)), r.path, sorted(g) or [INSIDE.get(r.path, "public")], problem))
    return rows


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "main"
    mod = __import__(f"app.{which}", fromlist=["app"])
    rows = audit(mod.app)
    for m, p, g, bad in rows:
        print(f"{'FAIL' if bad else 'ok  '} {m:14} {p:52} {' '.join(g)}{'  ← ' + bad if bad else ''}")
    bad = [r for r in rows if r[3]]
    print(f"\n{len(rows)} routes · {len(bad)} without an access check")
    sys.exit(1 if bad else 0)
