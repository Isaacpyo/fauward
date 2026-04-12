#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> [1/4] Building Backend..."
cd apps/backend
npx prisma generate
npm run build
cd "$ROOT"

echo "==> [2/4] Building Marketing Site..."
cd apps/frontend
npm run build
cd "$ROOT"

echo "==> [3/4] Building Tenant Portal..."
cd apps/tenant-portal
npm run build
cd "$ROOT"

echo "==> [4/4] Building Super Admin..."
cd apps/super-admin
npm run build
cd "$ROOT"

echo ""
echo "✓ All apps built successfully."
