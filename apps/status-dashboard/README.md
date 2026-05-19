# Status Dashboard

Local + production health monitor for Fauward services. Runs on `http://localhost:4000`.

## Start

```bash
# standalone
npm start --workspace=apps/status-dashboard

# or as part of the full dev stack
npm run dev
```

## What it monitors

| Service | Local | Production |
|---|---|---|
| Main API | `localhost:3001/health` | `fauwardbackend-production.up.railway.app/health` |
| Frontend | `localhost:5000` | `fauward.com` |
| Tenant Portal | `localhost:3000` | `app.fauward.com` |
| Super Admin | `localhost:5173` | `admin.fauward.com` |
| Fauward Go | `localhost:5176` | optional `FAUWARD_GO_PROD_URL` |
| Postgres | `localhost:5432` | — |
| Redis | `localhost:6379` | — |
| MailHog SMTP | `localhost:1025` | — |
| MailHog Web | `localhost:8025` | — |
| Supabase | optional `SUPABASE_LOCAL_URL/rest/v1` | configured `SUPABASE_URL` |
| Custom Domains | backend `/api/internal/metrics/custom-domains` | backend `/api/internal/metrics/custom-domains` |

## UI

**Sidebar** — filter by view or type:
- All Services / Down / HTTP / TCP

**Cards** — each shows local + prod status, response time, last-checked time, and a 30-check history bar.

**Detail panel** — click any card to expand:
- Response time (large)
- URL / host:port
- Uptime % across last 30 checks
- History bars
- Response time sparkline (blue)

## Add a service

Edit `config.json` and restart. Two check types:

```json
{ "name": "My API", "type": "http", "url": "http://localhost:9000/health", "prod": "https://myapi.com/health" }
{ "name": "MySQL",  "type": "tcp",  "host": "localhost", "port": 3306 }
```

- `http` — GET request, 2xx = healthy. Add `"expectedStatus": 200` to require an exact code.
- `tcp` — raw TCP connect, success = healthy. No `prod` support (not publicly reachable).
- `prod` is optional on any service.

## Config options

```json
{
  "interval": 30000,
  "services": [...]
}
```

| Field | Default | Description |
|---|---|---|
| `interval` | `30000` | Check interval in ms |
| `PORT` env var | `4000` | Override server port: `PORT=4001 npm start` |
| `STATUS_DASHBOARD_PROD_URL` | empty | Optional production URL for the status dashboard. Leave empty until deployed. |
| `FAUWARD_GO_PROD_URL` | empty | Optional production URL for Fauward Go. Leave empty until deployed. |
| `SUPABASE_LOCAL_ENABLED` | `false` | Set `true` only when the Supabase CLI local stack is running |
| `SUPABASE_LOCAL_URL` | `http://localhost:54321` | Local Supabase API base URL used when local Supabase checks are enabled |

Fauward local development uses plain Docker Postgres on `localhost:5432` by default, not the Supabase CLI REST API on `localhost:54321`. Leave `SUPABASE_LOCAL_ENABLED` unset unless you run `supabase start`.

## Custom domain checks

The **Custom Domains** tab shows local backend health, production backend health, Vercel project attachment, tenant domain status counts, stale pending checks, failed domains, and optional public DNS probes.

Set these in `apps/status-dashboard/.env.local`:

```bash
LOCAL_BACKEND_URL=http://localhost:3001
BACKEND_URL=https://api.fauward.com
MONITORING_API_KEY=change_me_if_backend_uses_one
CUSTOM_DOMAIN_PROBE_HOSTS=track.vitalos.co.uk
```

The backend also supports `VERCEL_EXPECTED_PORTAL_DOMAIN=app.fauward.com`. The dashboard flags the custom-domain setup as degraded if that domain is missing from the configured Vercel project, which catches the tenant-portal vs super-admin project mix-up.

## Production serving

`admin.fauward.com/status` is a Super Admin route. It can only show the live dashboard when `apps/status-dashboard` is deployed separately and Super Admin has `VITE_STATUS_DASHBOARD_URL` set to that deployed dashboard URL.

Do not point `VITE_STATUS_DASHBOARD_URL` back to `https://admin.fauward.com/status`; that creates a self-iframe loop.

Deploy `apps/status-dashboard` with the included Dockerfile, then set:

```bash
# Super Admin build env
VITE_STATUS_DASHBOARD_URL=https://<deployed-status-dashboard-host>

# Status dashboard monitor env
STATUS_DASHBOARD_PROD_URL=https://admin.fauward.com/status
```

## File structure

```
status-dashboard/
├── config.json       Service definitions
├── server.js         Express server + scheduler
├── checks.js         HTTP and TCP check functions
└── public/
    ├── index.html
    ├── style.css     Dark mode UI
    └── app.js        Polling, filtering, detail panel
```
