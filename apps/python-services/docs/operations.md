# Operations

## Environment Files

| File | Purpose |
| --- | --- |
| `.env` | local ignored runtime env |
| `.env.example` | minimal example |
| `env.local.example` | host-local dev values |
| `env.docker.local.example` | Docker Compose local values |
| `env.production.example` | production secret-manager template |

## Key Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes, unless `SUPABASE_DB_URL` is set | Postgres connection URL |
| `SUPABASE_DB_URL` | alternative | Supabase DB fallback |
| `REDIS_URL` | yes | Celery broker/backend and queue bridge |
| `SUPABASE_URL` | optional | Supabase Storage URL |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Supabase Storage writes |
| `SENDGRID_API_KEY` | optional | email provider |
| `TWILIO_ACCOUNT_SID` | optional | SMS provider |
| `TWILIO_AUTH_TOKEN` | optional | SMS provider |
| `TWILIO_FROM` | optional | SMS sender |
| `OSRM_BASE_URL` | optional | route matrix service |
| `PYTHON_QUEUE_LISTENERS_ENABLED` | optional | Redis-list bridge toggle |
| `PYTHON_LOCAL_STORAGE_DIR` | optional | local fallback storage |
| `PYTHON_DEFAULT_EMAIL_FROM` | optional | email sender |
| `LOG_LEVEL` | optional | JSON logging level |

## Local Install

```powershell
cd C:\Users\temit\fauward\apps\python-services
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item env.local.example .env
```

## Run API

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Run Worker

```powershell
celery -A celery_app worker --loglevel=info -Q pdf,routes,analytics,ocr,notifications,pricing,customs,ml
```

## Run Beat

```powershell
celery -A celery_app beat --loglevel=info
```

## Run Migrations

```powershell
psql $env:DATABASE_URL -f migrations/versions/0001_service_hardening_indexes.sql
```

## Run Tests

```powershell
pytest tests
```

Focused examples:

```powershell
pytest tests/test_auth_api.py
pytest tests/test_ocr_api.py
pytest tests/test_routes_api.py
```

## Compile Check

```powershell
$files = Get-ChildItem api,core,schemas,services,repositories,workers -Filter *.py | ForEach-Object { $_.FullName }
python -m py_compile @files
```

## Health Checks

```powershell
curl http://localhost:8000/health/live
curl http://localhost:8000/health/ready
```

Readiness response:

```json
{
  "status": "ready",
  "checks": {
    "database": true,
    "redis": true
  }
}
```

Failures do not expose connection strings or secrets.

## Queue Metrics

```http
GET /metrics/queues
```

Requires super admin or platform/ops metrics key.

The endpoint returns JSON queue depths and updates the Prometheus gauge. Redis calls are run off the event loop.

## Docker Compose

From repo root:

```powershell
docker compose --env-file apps/python-services/env.docker.local.example up --build python-api python-worker python-beat
```

Recommended production process split:

- `python-api`: `PYTHON_QUEUE_LISTENERS_ENABLED=false`
- `python-worker`: `PYTHON_QUEUE_LISTENERS_ENABLED=true`
- `python-beat`: `PYTHON_QUEUE_LISTENERS_ENABLED=false`

## Native Dependencies

PDF and OCR features require system packages:

- Tesseract OCR
- WeasyPrint dependencies: Cairo, Pango, GDK Pixbuf, libffi, shared MIME info
- `python-magic` native library when used for MIME detection

Prefer the provided Dockerfile for deployment where native packages are needed.

## Storage

Storage behavior:

1. Use Supabase Storage when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.
2. Fall back to local storage under `PYTHON_LOCAL_STORAGE_DIR`.
3. PDF downloads are served through authorized API routes.

Do not log signed URLs or storage credentials.
