#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[start] Starting Fauward services..."

echo "[1/4] Backend API → :3001"
cd "$ROOT/apps/backend"
node dist/server.js &
BACKEND_PID=$!

echo "[2/4] Marketing Site → :3002"
cd "$ROOT/apps/frontend"
PORT=3002 npx next start -p 3002 -H 0.0.0.0 &
FRONTEND_PID=$!

echo "[3/4] Tenant Portal (static) → :3003"
cd "$ROOT"
npx serve apps/tenant-portal/dist --listen 3003 --single &
PORTAL_PID=$!

echo "[4/4] Super Admin (static) → :3004"
npx serve apps/super-admin/dist --listen 3004 --single &
ADMIN_PID=$!

echo "[proxy] Starting reverse proxy → :5000"
sleep 2
node "$ROOT/proxy.js"

wait $BACKEND_PID $FRONTEND_PID $PORTAL_PID $ADMIN_PID
