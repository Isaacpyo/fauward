#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3001}

function json_field() {
  node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const path=process.argv[1].split('.'); let cur=d; for(const p of path){ cur=cur?.[p]; } if(cur===undefined){ process.exit(2);} console.log(typeof cur==='object'?JSON.stringify(cur):cur);" "$1"
}

echo "Registering tenant A"
TENANT_A=$(curl -s -X POST "$BASE_URL/api/v1/auth/register" -H "Content-Type: application/json" -d '{"companyName":"Fast Couriers","region":"uk_europe","email":"admin@fast-couriers-test.com","password":"TestPass123!"}')
TENANT_A_SLUG=$(echo "$TENANT_A" | json_field "tenant.slug")
TOKEN_A=$(echo "$TENANT_A" | json_field "accessToken")


echo "Registering tenant B"
TENANT_B=$(curl -s -X POST "$BASE_URL/api/v1/auth/register" -H "Content-Type: application/json" -d '{"companyName":"Quick Ship","region":"west_africa","email":"admin@quick-ship-test.com","password":"TestPass123!"}')
TENANT_B_SLUG=$(echo "$TENANT_B" | json_field "tenant.slug")
TOKEN_B=$(echo "$TENANT_B" | json_field "accessToken")


echo "Creating shipment in tenant A"
SHIPMENT_A=$(curl -s -X POST "$BASE_URL/api/v1/shipments" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "X-Tenant-Slug: $TENANT_A_SLUG" \
  -H "Content-Type: application/json" \
  -d '{"originAddress":{"line1":"1 Start St","city":"London"},"destinationAddress":{"line1":"2 End St","city":"Manchester"},"serviceTier":"STANDARD","items":[{"weightKg":2.1,"lengthCm":20,"widthCm":10,"heightCm":5}]}'
)
SHIPMENT_A_ID=$(echo "$SHIPMENT_A" | json_field "id")


echo "Test 1: tenant B must not list tenant A data"
STATUS_LIST=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/shipments" -H "Authorization: Bearer $TOKEN_B" -H "X-Tenant-Slug: $TENANT_A_SLUG")
if [[ "$STATUS_LIST" != "403" ]]; then
  echo "Expected 403 for cross-tenant list, got $STATUS_LIST"
  exit 1
fi


echo "Test 2: tenant B cannot fetch tenant A shipment id"
STATUS_GET=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/shipments/$SHIPMENT_A_ID" -H "Authorization: Bearer $TOKEN_B" -H "X-Tenant-Slug: $TENANT_B_SLUG")
if [[ "$STATUS_GET" != "404" ]]; then
  echo "Expected 404 for cross-tenant fetch, got $STATUS_GET"
  exit 1
fi


echo "Test 3: tenant B cannot patch tenant A shipment id"
STATUS_PATCH=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/api/v1/shipments/$SHIPMENT_A_ID/status" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "X-Tenant-Slug: $TENANT_B_SLUG" \
  -H "Content-Type: application/json" \
  -d '{"status":"PROCESSING"}')
if [[ "$STATUS_PATCH" != "404" ]]; then
  echo "Expected 404 for cross-tenant patch, got $STATUS_PATCH"
  exit 1
fi


echo "Creating API key for tenant A"
KEY_CREATE=$(curl -s -X POST "$BASE_URL/api/v1/api-keys" -H "Authorization: Bearer $TOKEN_A" -H "X-Tenant-Slug: $TENANT_A_SLUG" -H "Content-Type: application/json" -d '{"name":"cross-tenant-test","scopes":["shipments:read"]}')
RAW_KEY=$(echo "$KEY_CREATE" | json_field "key")


echo "Test 4: API key from tenant A cannot be used against tenant B slug"
STATUS_API_KEY=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/shipments" -H "X-Api-Key: $RAW_KEY" -H "X-Tenant-Slug: $TENANT_B_SLUG")
if [[ "$STATUS_API_KEY" == "200" ]]; then
  echo "Expected non-200 for cross-tenant API key access"
  exit 1
fi

if [[ -n "${SUPER_ADMIN_TOKEN:-}" && -n "${TARGET_TENANT_ID:-}" ]]; then
  echo "Optional Test 5: SUPER_ADMIN impersonation token TTL"
  IMPERSONATE=$(curl -s -X POST "$BASE_URL/api/v1/admin/tenants/$TARGET_TENANT_ID/impersonate" -H "Authorization: Bearer $SUPER_ADMIN_TOKEN")
  IMP_TOKEN=$(echo "$IMPERSONATE" | json_field "token")
  IMP_EXP=$(echo "$IMPERSONATE" | json_field "expiresInSeconds")

  if [[ "$IMP_EXP" -gt 1800 ]]; then
    echo "Expected impersonation expiry <= 1800 seconds, got $IMP_EXP"
    exit 1
  fi

  HEADER=$(echo "$IMP_TOKEN" | cut -d '.' -f2 | tr '_-' '/+' | base64 -d 2>/dev/null || true)
  echo "Impersonation JWT payload: $HEADER"
fi

echo "Cross-tenant checks passed"
