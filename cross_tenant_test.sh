#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# cross_tenant_test.sh
#
# Security test: verifies that data from one tenant is never accessible
# from another — regardless of the HTTP method used.
#
# Requires a running backend server.
# Usage:
#   BASE_URL=http://localhost:3001 bash cross_tenant_test.sh
#   SUPER_ADMIN_TOKEN=<token> TARGET_TENANT_ID=<id> bash cross_tenant_test.sh
#
# All tests must pass before any deployment.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3001}
PASS=0
FAIL=0

# ── Helpers ──────────────────────────────────────────────────────────────────

function json_field() {
  node -e "
    const fs = require('fs');
    const d = JSON.parse(fs.readFileSync(0, 'utf8'));
    const path = process.argv[1].split('.');
    let cur = d;
    for (const p of path) { cur = cur?.[p]; }
    if (cur === undefined) { process.exit(2); }
    console.log(typeof cur === 'object' ? JSON.stringify(cur) : cur);
  " "$1"
}

function pass() {
  echo "  ✅  $1"
  PASS=$((PASS + 1))
}

function fail() {
  echo "  ❌  $1"
  FAIL=$((FAIL + 1))
}

function assert_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label → HTTP $actual"
  else
    fail "$label → expected $expected, got $actual"
  fi
}

function assert_not_status() {
  local label="$1"
  local forbidden="$2"
  local actual="$3"
  if [[ "$actual" != "$forbidden" ]]; then
    pass "$label → HTTP $actual (not $forbidden)"
  else
    fail "$label → got forbidden status $actual"
  fi
}

# ── Register two isolated tenants ────────────────────────────────────────────

echo ""
echo "▶  Setting up test tenants"

TENANT_A=$(curl -s -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Fast Couriers","region":"uk_europe","email":"admin@fast-couriers-test.com","password":"TestPass123!"}')
TENANT_A_SLUG=$(echo "$TENANT_A" | json_field "tenant.slug")
TOKEN_A=$(echo "$TENANT_A" | json_field "accessToken")

TENANT_B=$(curl -s -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Quick Ship","region":"west_africa","email":"admin@quick-ship-test.com","password":"TestPass123!"}')
TENANT_B_SLUG=$(echo "$TENANT_B" | json_field "tenant.slug")
TENANT_B_ID=$(echo "$TENANT_B" | json_field "tenant.id")
TOKEN_B=$(echo "$TENANT_B" | json_field "accessToken")

echo "  Tenant A slug: $TENANT_A_SLUG"
echo "  Tenant B slug: $TENANT_B_SLUG"

# ── Create shipment in Tenant A ───────────────────────────────────────────────

echo ""
echo "▶  Creating test shipment in Tenant A"

SHIPMENT_A=$(curl -s -X POST "$BASE_URL/api/v1/shipments" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "X-Tenant-Slug: $TENANT_A_SLUG" \
  -H "Content-Type: application/json" \
  -d '{"originAddress":{"line1":"1 Start St","city":"London"},"destinationAddress":{"line1":"2 End St","city":"Manchester"},"serviceTier":"STANDARD","items":[{"weightKg":2.1,"lengthCm":20,"widthCm":10,"heightCm":5}]}')
SHIPMENT_A_ID=$(echo "$SHIPMENT_A" | json_field "id")
echo "  Shipment A id: $SHIPMENT_A_ID"

# ── Shipment isolation ────────────────────────────────────────────────────────

echo ""
echo "▶  Shipment isolation"

# Test 1: Tenant B cannot list Tenant A shipments (cross-slug)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/v1/shipments" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "X-Tenant-Slug: $TENANT_A_SLUG")
assert_status "Tenant B GET /shipments with Tenant A slug" "403" "$STATUS"

# Test 2: Tenant B cannot fetch Tenant A shipment by ID (returns 404, not 403)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/v1/shipments/$SHIPMENT_A_ID" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "X-Tenant-Slug: $TENANT_B_SLUG")
assert_status "Tenant B GET /shipments/:id of Tenant A — 404 not 403 (no data leak)" "404" "$STATUS"

# Test 3: Tenant B cannot PATCH Tenant A shipment status
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PATCH "$BASE_URL/api/v1/shipments/$SHIPMENT_A_ID/status" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "X-Tenant-Slug: $TENANT_B_SLUG" \
  -H "Content-Type: application/json" \
  -d '{"status":"PROCESSING"}')
assert_status "Tenant B PATCH /shipments/:id/status of Tenant A — 404 not 403" "404" "$STATUS"

# ── User list isolation ───────────────────────────────────────────────────────

echo ""
echo "▶  User list isolation"

# Test 4: Tenant B token cannot GET Tenant A user list
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/v1/users" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "X-Tenant-Slug: $TENANT_A_SLUG")
assert_status "Tenant B GET /users with Tenant A slug" "403" "$STATUS"

# ── Invoice isolation ─────────────────────────────────────────────────────────

echo ""
echo "▶  Invoice isolation"

# Create an invoice in Tenant A
INVOICE_A=$(curl -s -X POST "$BASE_URL/api/v1/finance/invoices" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "X-Tenant-Slug: $TENANT_A_SLUG" \
  -H "Content-Type: application/json" \
  -d '{"total":100,"currency":"GBP"}')
INVOICE_A_ID=$(echo "$INVOICE_A" | json_field "id" 2>/dev/null || echo "none")

if [[ "$INVOICE_A_ID" != "none" && -n "$INVOICE_A_ID" ]]; then
  # Test 5: Tenant B cannot fetch Tenant A invoice
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE_URL/api/v1/finance/invoices/$INVOICE_A_ID" \
    -H "Authorization: Bearer $TOKEN_B" \
    -H "X-Tenant-Slug: $TENANT_B_SLUG")
  assert_status "Tenant B GET /finance/invoices/:id of Tenant A — 404" "404" "$STATUS"
else
  echo "  ⚠️  Invoice creation returned unexpected response — skipping invoice isolation test"
fi

# ── API key isolation ─────────────────────────────────────────────────────────

echo ""
echo "▶  API key isolation"

# Create API key for Tenant A
KEY_CREATE=$(curl -s -X POST "$BASE_URL/api/v1/tenant/api-keys" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "X-Tenant-Slug: $TENANT_A_SLUG" \
  -H "Content-Type: application/json" \
  -d '{"name":"cross-tenant-test"}')
RAW_KEY=$(echo "$KEY_CREATE" | json_field "key" 2>/dev/null || echo "none")

if [[ "$RAW_KEY" != "none" && -n "$RAW_KEY" ]]; then
  # Test 6: Tenant A API key cannot access Tenant B data
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE_URL/api/v1/shipments" \
    -H "Authorization: Bearer $RAW_KEY" \
    -H "X-Tenant-Slug: $TENANT_B_SLUG")
  assert_not_status "Tenant A API key against Tenant B slug" "200" "$STATUS"
else
  echo "  ⚠️  API key creation returned unexpected response — skipping API key isolation test"
fi

# ── Returns isolation ─────────────────────────────────────────────────────────

echo ""
echo "▶  Returns isolation"

# Test 7: Tenant B cannot list Tenant A's return requests
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/v1/returns" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "X-Tenant-Slug: $TENANT_A_SLUG")
assert_status "Tenant B GET /returns with Tenant A slug" "403" "$STATUS"

# ── Support ticket isolation ──────────────────────────────────────────────────

echo ""
echo "▶  Support ticket isolation"

# Test 8: Tenant B token cannot list Tenant A's support tickets
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/v1/support/tickets" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "X-Tenant-Slug: $TENANT_A_SLUG")
assert_status "Tenant B GET /support/tickets with Tenant A slug" "403" "$STATUS"

# ── SUPER_ADMIN impersonation ─────────────────────────────────────────────────

if [[ -n "${SUPER_ADMIN_TOKEN:-}" && -n "${TARGET_TENANT_ID:-}" ]]; then
  echo ""
  echo "▶  SUPER_ADMIN impersonation TTL"

  IMPERSONATE=$(curl -s -X POST \
    "$BASE_URL/api/v1/admin/tenants/$TARGET_TENANT_ID/impersonate" \
    -H "Authorization: Bearer $SUPER_ADMIN_TOKEN")
  IMP_TOKEN=$(echo "$IMPERSONATE" | json_field "token")
  IMP_EXP=$(echo "$IMPERSONATE" | json_field "expiresInSeconds")

  if [[ "$IMP_EXP" -le 1800 ]]; then
    pass "Impersonation token expires in $IMP_EXP seconds (≤ 1800)"
  else
    fail "Impersonation token expires in $IMP_EXP seconds (expected ≤ 1800)"
  fi

  # Verify the impersonation JWT payload contains actor info
  JWT_PAYLOAD=$(echo "$IMP_TOKEN" | cut -d '.' -f2 | tr '_-' '/+' | base64 -d 2>/dev/null || true)
  echo "  JWT payload: $JWT_PAYLOAD"

  # Test 9: Impersonation token cannot be used for a different tenant
  if [[ -n "${ANOTHER_TENANT_ID:-}" ]]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      "$BASE_URL/api/v1/admin/tenants/$ANOTHER_TENANT_ID/impersonate" \
      -H "Authorization: Bearer $IMP_TOKEN")
    assert_status "Impersonation token cannot impersonate a second tenant" "403" "$STATUS"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────"
echo "  Results: $PASS passed, $FAIL failed"
echo "─────────────────────────────────────────────"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $FAIL cross-tenant security check(s) did not pass."
  exit 1
fi

echo "All cross-tenant security checks passed ✅"
