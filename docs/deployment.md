# Deployment Guide

This document covers how to deploy Fauward's backend and frontend to production.

---

## Overview

| Service | Platform | URL pattern |
|---------|----------|-------------|
| Backend API | Railway (Docker) | `https://<name>.railway.app` |
| Marketing site / auth | Vercel (Next.js) | `https://<name>.vercel.app` |
| Tenant portal | TBD | `app.fauward.com` |
| Super admin | TBD | `admin.fauward.com` |
| Agent portal | TBD | — |

---

## Backend → Railway

### How it works

Railway builds the backend using the multi-stage Dockerfile at `apps/backend/Dockerfile`. The build is forced via `railway.json` at the repo root — Railway's auto-detector (Railpack) is explicitly disabled.

**`railway.json`**
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "apps/backend/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "startCommand": "node dist/server.js"
  }
}
```

### Docker build — two stages

**Stage 1 (builder)**
1. Copies all workspace `package.json` files so `npm ci` can resolve the monorepo.
2. Runs `npm ci` — full install with lockfile.
3. Copies backend source + Prisma schema.
4. Runs `npx prisma generate` then `npm run build` (TypeScript → `apps/backend/dist/`).
5. Creates an isolated `/prod` directory, copies only the backend `package.json` there, and runs `npm install --omit=dev`. This sidesteps npm workspace hoisting — every production dep (including `@fastify/jwt`) is guaranteed to land in `/prod/node_modules`.

**Stage 2 (runtime)**
1. Base: `node:20-alpine` + `openssl` (required by Prisma).
2. Copies backend `package.json` to `/app/package.json` — provides `"type": "module"` so Node treats compiled output as ESM.
3. Copies `/prod/node_modules` → `/app/node_modules`.
4. Copies compiled `dist/` and `prisma/` schema.
5. Runs `npx prisma generate` against the production `node_modules`.
6. Exposes port `3001`, starts with `node dist/server.js`.

### Required environment variables (set in Railway dashboard)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `PORT` | Optional — Railway sets this automatically |

### Health check

Railway polls `GET /health` after deploy. The container must respond `200` within the timeout or the deploy is rolled back.

---

## Frontend → Vercel

### How it works

The `apps/frontend` Next.js app is deployed directly from the monorepo. Vercel is pointed at the `apps/frontend` directory as the root.

**`apps/frontend/vercel.json`**
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install"
}
```

### API proxy

The frontend does not call the Railway URL directly from the browser. Instead, Next.js rewrites proxy all `/api/v1/*` requests to `BACKEND_URL` at runtime:

**`apps/frontend/next.config.mjs`**
```js
async rewrites() {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) return [];
  return [
    {
      source: '/api/v1/:path*',
      destination: `${backendUrl.replace(/\/$/, '')}/api/v1/:path*`
    }
  ];
}
```

This means auth pages and any server-side code call `/api/v1/...` as relative paths — Vercel forwards them to Railway transparently.

### Required environment variables (set in Vercel dashboard)

| Variable | Description |
|----------|-------------|
| `BACKEND_URL` | Full Railway backend URL, e.g. `https://fauward-backend.railway.app` |

---

## Domain Routing (self-hosted / production VPS)

For a single-server deployment a reverse proxy (`proxy.js`) routes traffic by subdomain:

| Subdomain | App | Port |
|-----------|-----|------|
| `fauward.com` | frontend | 3002 |
| `app.fauward.com` | tenant-portal | 3003 |
| `admin.fauward.com` | super-admin | 3004 |
| `api.fauward.com` | backend | 3001 |

---

## Common Deploy Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `ERR_MODULE_NOT_FOUND: @fastify/jwt` | Package not hoisted to root `node_modules` in workspace | Use isolated `/prod` install in Dockerfile stage 1 |
| `npm ci` fails — no `package-lock.json` | `apps/backend` has no standalone lockfile | Use `npm install --omit=dev` instead |
| Healthcheck timeout | Prisma can't find `libssl` on Alpine | Add `RUN apk add --no-cache openssl` to stage 2 |
| Railway uses Railpack instead of Docker | No `railway.json` present | Add `railway.json` with `"builder": "DOCKERFILE"` |
| `npm error No workspaces found: --workspace=@fauward/backend` | Railway auto-detects a workspace start command | Add `"startCommand"` to `railway.json` deploy section |
| `Error: Cannot find module '/app/apps/backend/dist/server.js'` | Repo-level start command points to a path that does not exist in the runtime image | Use `node dist/server.js` — the backend Docker image copies compiled output to `/app/dist` |
| Vercel build fails `Invalid value for '--ignoreDeprecations'` | `"ignoreDeprecations": "6.0"` invalid in TypeScript 5.x | Remove the line from `apps/frontend/tsconfig.json` |
