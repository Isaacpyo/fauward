# Railway Deployment Guide

This guide covers the current production strategy for running Fauward Python Services on Railway without upgrading to a larger plan.

## Current Strategy

Run the Python API, Celery worker, and Celery beat scheduler inside one Railway service:

```text
python-services
```

This saves Railway service slots while still enabling:

- FastAPI health checks and direct HTTP endpoints
- Redis queue workers for jobs created by the Node backend
- Scheduled analytics, pricing, and ML tasks

Later, this can be split into three services:

```text
python-api
python-worker
python-beat
```

## Railway Service Settings

Create or repurpose one Railway service.

Set the source to the GitHub repo:

```text
Isaacpyo/fauward
```

Set the root directory:

```text
services/python-services
```

Set the Railway config file path:

```text
/services/python-services/railway.json
```

The Python service config points Railway at:

```text
services/python-services/Dockerfile
```

If Railway has a Dockerfile path setting or variable, make sure it is not pointing to the backend Dockerfile.

Remove this if present:

```env
RAILWAY_DOCKERFILE_PATH=apps/backend/Dockerfile
```

Use this only if needed:

```env
RAILWAY_DOCKERFILE_PATH=services/python-services/Dockerfile
```

## Start Command

The start command is already defined in `railway.json`:

```bash
sh -c "celery -A celery_app worker --loglevel=info -Q pdf,routes,analytics,ocr,notifications,pricing,customs,ml --pool=solo & celery -A celery_app beat --loglevel=info & uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"
```

This starts:

- Celery worker
- Celery beat
- FastAPI

The FastAPI process stays in the foreground so Railway keeps the service alive.

## Required Variables

Set these on the Railway `python-services` service:

```env
DATABASE_URL=
REDIS_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SENDGRID_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
OSRM_BASE_URL=http://router.project-osrm.org
PYTHON_QUEUE_LISTENERS_ENABLED=true
PYTHON_DEFAULT_EMAIL_FROM=no-reply@fauward.com
LOG_LEVEL=INFO
```

Use the same production `DATABASE_URL` as the backend.

Use the same Upstash Redis protocol URL as the backend:

```env
REDIS_URL=rediss://default:PASSWORD@HOST.upstash.io:6379
```

Do not use the Upstash REST URL for `REDIS_URL`.

## Health Check

Set the Railway health check path:

```text
/health
```

Successful deployment logs should include:

```text
Starting Healthcheck
Path: /health
[1/1] Healthcheck succeeded!
```

If a public domain is generated, test it with:

```powershell
curl.exe https://YOUR-PYTHON-SERVICE.up.railway.app/health
```

Expected response:

```json
{"status":"ok"}
```

## Redis Queue Flow

The Node backend writes jobs into Redis:

```text
fauward:pdf:generate
fauward:routes:optimize
fauward:ocr:parse
fauward:notifications:send
fauward:customs:generate
fauward:pricing:quote
fauward:ml:score
```

The Python worker consumes those jobs and publishes results:

```text
fauward:pdf:done
fauward:routes:done
fauward:ocr:done
fauward:notifications:done
fauward:customs:done
fauward:pricing:done
fauward:ml:done
```

## Database Requirement

Run the backend Prisma migrations before processing real Python jobs.

The Python services expect backend tables such as:

```text
tenants
shipments
api_keys
```

If those tables do not exist, workers will fail with errors like:

```text
relation "tenants" does not exist
```

## Runtime Logs To Confirm

In Railway logs, confirm:

```text
celery worker ready
beat: Starting
redis_queue_bridge_started
```

The most important line is:

```text
redis_queue_bridge_started
```

That confirms the worker is listening to Redis queues.

## Scaling Later

When the Railway plan allows more services, split this service into:

```text
python-api
python-worker
python-beat
```

Use the same Docker image and environment variables, but different start commands.

For higher worker throughput, run more worker replicas or separate worker services by queue instead of increasing prefork concurrency. The current `--pool=solo` setting avoids asyncpg event-loop issues in the combined deployment.
