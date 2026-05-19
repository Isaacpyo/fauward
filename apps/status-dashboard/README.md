# Status Dashboard

Local + production health monitor for Fauward services. Runs on `http://localhost:4000`.

## Start

```bash
# standalone
npm start --workspace=status-dashboard

# or as part of the full dev stack
npm run dev
```

## What it monitors

| Service | Local | Production |
|---|---|---|
| Main API | `localhost:3001/health` | `fauwardbackend-production.up.railway.app/health` |
| Frontend | `localhost:5000` | `fauward.com` |
| Tenant Portal | `localhost:5173` | `app.fauward.com` |
| Super Admin | `localhost:5174` | `admin.fauward.com` |
| Postgres | `localhost:5432` | — |
| Redis | `localhost:6379` | — |
| MailHog SMTP | `localhost:1025` | — |
| MailHog Web | `localhost:8025` | — |

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
