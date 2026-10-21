#!/usr/bin/env bash
# Point the Vercel frontends at https://api.fauward.com and redeploy them. Runs ON THE VM, where backend.env already
# holds VERCEL_API_TOKEN, VERCEL_TEAM_ID and MONITORING_API_KEY, so no token passes through a laptop or chat.
#
#   plan (changes nothing):  curl -fsSL <raw url> | ssh oracle-vm 'bash -s'
#   apply and redeploy:      curl -fsSL <raw url> | ssh oracle-vm 'bash -s -- --yes'
#
# If env/vercel-admin.token exists (a token made in Vercel → Account Settings → Tokens, scoped to the team), it is
# used instead of backend.env's VERCEL_API_TOKEN. Delete it afterwards. On a 403 the script prints which account and
# teams the token can see, so a wrong VERCEL_TEAM_ID or a token from another account shows up.
#   --backend-token   use backend.env's VERCEL_API_TOKEN even if vercel-admin.token exists
#   --team <id>       use this team instead of backend.env's VERCEL_TEAM_ID
# The plan lists each project's domains and marks the one backend.env's VERCEL_PORTAL_PROJECT_ID names.
#
# Projects are matched by their Vercel root directory, not by name:
#   apps/frontend          BACKEND_URL
#   apps/tenant-portal     VITE_API_BASE_URL (Fauward Go is built into it under /go)
#   apps/fauward-Go        VITE_API_BASE_URL (only if it has its own project)
#   apps/status-dashboard  BACKEND_URL, MONITORING_API_KEY (same value as the VM)
# super-admin needs nothing: its vercel.json rewrites already go to api.fauward.com.
# Existing production entries are updated in place (their targets are kept); missing ones are created for
# production + preview. A project is redeployed (same commit as its live production deployment) only if a value changed.
set -euo pipefail
ENV_FILE=${FAUWARD_PROD_ROOT:-/data/fauward-prod}/env/backend.env
[ -r "$ENV_FILE" ] || { echo "cannot read $ENV_FILE (run this on the VM)" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is not installed on the VM" >&2; exit 1; }

env_value() { # last duplicate wins, CRs and surrounding quotes stripped
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '\r' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}
APPLY=0 FORCE_BACKEND=0 TEAM=$(env_value VERCEL_TEAM_ID)
while [ $# -gt 0 ]; do
  case $1 in
    --yes) APPLY=1 ;;
    --backend-token) FORCE_BACKEND=1 ;;
    --team) TEAM=$2; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
  shift
done
ADMIN_TOKEN_FILE=$(dirname "$ENV_FILE")/vercel-admin.token
if [ -s "$ADMIN_TOKEN_FILE" ] && [ $FORCE_BACKEND = 0 ]; then TOKEN=$(tr -d '\r\n ' < "$ADMIN_TOKEN_FILE"); TOKEN_SRC=vercel-admin.token
else TOKEN=$(env_value VERCEL_API_TOKEN); TOKEN_SRC="backend.env VERCEL_API_TOKEN"; fi
TOKEN_SRC=$TOKEN_SRC VERCEL_API_TOKEN=$TOKEN VERCEL_TEAM_ID=$TEAM PORTAL_ID=$(env_value VERCEL_PORTAL_PROJECT_ID) \
MONITORING_API_KEY=$(env_value MONITORING_API_KEY) APPLY=$APPLY \
python3 - <<'PY'
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

TOKEN, TEAM, MON = os.environ["VERCEL_API_TOKEN"], os.environ["VERCEL_TEAM_ID"], os.environ["MONITORING_API_KEY"]
APPLY = os.environ["APPLY"] == "1"
API = "https://api.fauward.com"
for k, v in (("VERCEL_API_TOKEN", TOKEN), ("VERCEL_TEAM_ID", TEAM), ("MONITORING_API_KEY", MON)):
    if not v: sys.exit(f"{k} is empty in backend.env")

WANT = {  # root directory -> {key: (value, secret)}
    "apps/frontend": {"BACKEND_URL": (API, False)},
    "apps/tenant-portal": {"VITE_API_BASE_URL": (API, False)},
    "apps/fauward-Go": {"VITE_API_BASE_URL": (API, False)},
    "apps/status-dashboard": {"BACKEND_URL": (API, False), "MONITORING_API_KEY": (MON, True)},
}

def call(method, path, body=None, **query):
    query["teamId"] = TEAM
    req = urllib.request.Request(f"{os.environ.get('VERCEL_API', 'https://api.vercel.com')}{path}?{urllib.parse.urlencode(query)}", method=method,
                                 data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try: msg = json.load(e).get("error", {}).get("message", "")
        except Exception: msg = ""
        raise RuntimeError(f"{method} {path} -> HTTP {e.code} {msg}") from None

try:
    projects = call("GET", "/v9/projects", limit=100)["projects"]
except RuntimeError as err:
    print(f"cannot list the team's projects with {os.environ['TOKEN_SRC']}: {err}")
    print(f"configured VERCEL_TEAM_ID: {TEAM[:9]}... ({len(TEAM)} chars)")
    def who(path):
        req = urllib.request.Request(f"{os.environ.get('VERCEL_API', 'https://api.vercel.com')}{path}", headers={"Authorization": f"Bearer {TOKEN}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
        except urllib.error.HTTPError as e: return {"error": f"HTTP {e.code}"}
    u = who("/v2/user")
    print("token belongs to:", u.get("user", {}).get("username") or u.get("error"))
    t = who("/v2/teams")
    for team in t.get("teams", []):
        print(f"  team it can see: {team.get('slug')}  id {team.get('id')}  {'<- matches VERCEL_TEAM_ID' if team.get('id') == TEAM else ''}")
    if "error" in t: print("  teams:", t["error"])
    sys.exit(1)
print(f"{'APPLY' if APPLY else 'PLAN (nothing changes; add --yes to apply)'}: {len(projects)} projects in team "
      f"{TEAM} with {os.environ['TOKEN_SRC']}")
PORTAL_ID = os.environ.get("PORTAL_ID", "")
redeploy = []
for p in sorted(projects, key=lambda p: p["name"]):
    root = (p.get("rootDirectory") or "").rstrip("/")
    want = WANT.get(root)
    try:
        domains = [d["name"] for d in call("GET", f"/v9/projects/{p['id']}/domains").get("domains", [])]
    except RuntimeError:
        domains = []
    mark = "  <- backend VERCEL_PORTAL_PROJECT_ID" if p["id"] == PORTAL_ID else ""
    print(f"\n{p['name']}  [{root or 'repo root'}]  domains: {', '.join(domains[:6]) or 'none'}"
          f"{f' (+{len(domains) - 6} more)' if len(domains) > 6 else ''}{mark}")
    if not want:
        print("  no change needed"); continue
    try:
        entries = call("GET", f"/v9/projects/{p['id']}/env")["envs"]
    except RuntimeError as err:
        print(f"  cannot read its env vars: {err}"); continue
    changed = False
    for key, (value, secret) in want.items():
        prod = [e for e in entries if e["key"] == key and "production" in (e.get("target") or [])]
        if not prod:
            print(f"  {key}: missing -> create for production+preview")
            if APPLY:
                call("POST", f"/v10/projects/{p['id']}/env",
                     {"key": key, "value": value, "type": "encrypted", "target": ["production", "preview"]})
            changed = True
            continue
        for e in prod:
            try:
                current = call("GET", f"/v1/projects/{p['id']}/env/{e['id']}").get("value")
            except RuntimeError:
                current = None  # "sensitive" entries cannot be read back
            targets = ",".join(e.get("target") or [])
            if current == value:
                print(f"  {key} [{targets}]: already {'set (matches the VM)' if secret else value}"); continue
            shown = "differs from the VM" if secret else (current or "unreadable")
            print(f"  {key} [{targets}]: {shown} -> {'VM value' if secret else value}")
            if APPLY:
                call("PATCH", f"/v9/projects/{p['id']}/env/{e['id']}", {"value": value})
            changed = True
    if changed:
        redeploy.append(p)

if not APPLY:
    print(f"\nWould redeploy: {', '.join(p['name'] for p in redeploy) or 'nothing'}"); sys.exit(0)

started = []
for p in redeploy:
    live = call("GET", "/v6/deployments", projectId=p["id"], target="production", state="READY", limit=1)["deployments"]
    if not live:
        print(f"\n{p['name']}: no READY production deployment to redeploy; redeploy it in the dashboard"); continue
    d = call("POST", "/v13/deployments", {"name": p["name"], "project": p["id"], "deploymentId": live[0]["uid"],
                                          "target": "production"})
    print(f"\n{p['name']}: redeploying ({d['id']})")
    started.append((p["name"], d["id"]))

deadline = time.time() + 15 * 60
pending = dict(started)
while pending and time.time() < deadline:
    time.sleep(20)
    for name, dep in list(pending.items()):
        state = call("GET", f"/v13/deployments/{dep}").get("readyState")
        if state in ("READY", "ERROR", "CANCELED"):
            print(f"{name}: {state}"); del pending[name]
for name in pending:
    print(f"{name}: still building after 15 min; check the Vercel dashboard")
PY
