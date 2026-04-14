# Application Gating — Implementation Guide

> How each of the five Fauward client surfaces is properly gated for interaction, following industry-standard patterns.

**Navigation →** [Roles & Permissions](./roles-permissions.md) · [System Architecture](./system-architecture.md) · [API Design](./api.md) · [← README](../README.md)

---

## Contents

1. [Overview — The Five Surfaces](#1-overview--the-five-surfaces)
2. [Gating Model — Layers of Defence](#2-gating-model--layers-of-defence)
3. [MARKETING — Public Site](#3-marketing--public-site)
4. [TENANT — Tenant Portal](#4-tenant--tenant-portal)
5. [DRIVER — Driver PWA](#5-driver--driver-pwa)
6. [SUPER — Super Admin](#6-super--super-admin)
7. [EMBEDDED — Tracking Widget](#7-embedded--tracking-widget)
8. [Cross-Cutting: JWT Payload & Shared Claims](#8-cross-cutting-jwt-payload--shared-claims)
9. [Cross-Cutting: API Middleware Stack](#9-cross-cutting-api-middleware-stack)
10. [Cross-Cutting: Plan Feature Gating](#10-cross-cutting-plan-feature-gating)
11. [Gaps & Hardening Checklist](#11-gaps--hardening-checklist)
12. [Environment Variables Required](#12-environment-variables-required)

---

## 1. Overview — The Five Surfaces

```
╔═══════════════╦═══════════════╦══════════════╦═══════════════╦═════════════════╗
║  MARKETING    ║  TENANT       ║  DRIVER      ║  SUPER        ║  EMBEDDED       ║
║  SITE         ║  PORTAL       ║  PWA         ║  ADMIN        ║  WIDGET         ║
╠═══════════════╬═══════════════╬══════════════╬═══════════════╬═════════════════╣
║ fauward.com   ║{slug}.fw.com  ║ Mobile PWA   ║admin.fw.com   ║ Any 3rd-party   ║
║               ║               ║              ║               ║ website         ║
╠═══════════════╬═══════════════╬══════════════╬═══════════════╬═════════════════╣
║ Audience:     ║ Audience:     ║ Audience:    ║ Audience:     ║ Audience:       ║
║ Prospects     ║ Logistics ops ║ Drivers      ║ Fauward team  ║ End customers   ║
║ (unauthentd.) ║ + customers   ║ (field)      ║ (internal)    ║ (unauthentd.)   ║
╠═══════════════╬═══════════════╬══════════════╬═══════════════╬═════════════════╣
║ Auth model:   ║ Auth model:   ║ Auth model:  ║ Auth model:   ║ Auth model:     ║
║ None (public) ║ JWT + RBAC    ║ JWT + RBAC   ║ JWT + role    ║ None (public)   ║
║               ║ + tenant      ║ + tenant     ║ check         ║ tenantId only   ║
╠═══════════════╬═══════════════╬══════════════╬═══════════════╬═════════════════╣
║ Gate type:    ║ Gate type:    ║ Gate type:   ║ Gate type:    ║ Gate type:      ║
║ Origin /      ║ AuthGuard +   ║ ProtectedRte ║ SuperAdmin-   ║ data-tenant-id  ║
║ CORS only     ║ requireRole   ║ + TENANT_    ║ Guard + SUPER_║ + public API    ║
║               ║               ║ DRIVER role  ║ ADMIN role    ║ path exemption  ║
╚═══════════════╩═══════════════╩══════════════╩═══════════════╩═════════════════╝
```

**Key principle:** Every surface shares the same single API backend. All gating is enforced in the backend middleware chain — frontend guards are UX-only convenience layers that do not substitute for server-side enforcement.

---

## 2. Gating Model — Layers of Defence

Industry-standard gating uses defence-in-depth across four layers. Fauward implements all four:

```
Layer 1 — Network / Origin
  CORS origin whitelist · subdomain routing · proxy rules

Layer 2 — Authentication
  JWT Bearer token · RS256 or HS256 signature · expiry · isActive check

Layer 3 — Authorisation (Identity)
  Role-Based Access Control (RBAC) · requireRole([...]) · tenantId match

Layer 4 — Authorisation (Capability)
  Plan feature flags · requireFeature('webhooks') · usage limits
```

The backend middleware runs these layers in order on every request:

```
CORS → Rate Limit → Tenant Resolver → authenticate() → requireRole() 
     → requireTenantMatch() → requireFeature() → idempotency → handler
```

See [System Architecture § Layer 2](./system-architecture.md#4-layer-2--api-gateway-layer) for the full middleware diagram.

---

## 3. MARKETING — Public Site

### What it is
Next.js 14 App Router site at `fauward.com`. Entirely public — no authentication required. Audience is prospects and unauthenticated visitors. The only action a visitor can trigger is submitting the **sign-up form**, which calls `POST /api/v1/auth/register`.

### How it is gated

#### 3.1 No auth gate needed — the surface itself is the gate
The marketing site intentionally has no restricted pages. Any attempt to add a protected page should use Next.js middleware (`middleware.ts`) with token verification, not client-side redirects.

#### 3.2 CORS on the API
The backend only accepts requests from `fauward.com` and `*.fauward.com`. A random third-party site cannot issue `POST /api/v1/auth/register` from a browser.

```
// apps/backend/src/app.ts — CORS plugin config
origin: ['https://fauward.com', /\.fauward\.com$/]
credentials: true
```

#### 3.3 Rate limiting on auth endpoints
Sign-up and login are rate-limited to **10 requests / minute per IP** to prevent bot sign-up floods.

#### 3.4 Sign-up flow (the only write path from marketing)
1. Visitor submits `POST /api/v1/auth/register` with `{ companyName, region, email, password }`.
2. Backend creates a new `Tenant` (status: `TRIALING`) + first user (role: `TENANT_ADMIN`).
3. Returns `accessToken` + `refreshToken`.
4. Marketing site stores these and redirects the user to the **Tenant Portal** (`https://{slug}.fauward.com`).

#### 3.5 Proper implementation checklist

| Item | Status | Action |
|------|--------|--------|
| CORS origin whitelist | ✅ | Configured in `app.ts` |
| Rate limit on `/auth/register` | ✅ | 10 req/min per IP |
| Email uniqueness check | ✅ | `auth.service.ts` line 68 |
| Plan-gated `/plan-gated` page | ✅ | UX page in `apps/frontend` |
| Next.js `middleware.ts` for any future protected pages | ❌ | Not yet present — add if adding member-only pages |
| Email verification on sign-up | ❌ | Not yet implemented — add to harden |

#### 3.6 Industry-standard additions to implement

```typescript
// apps/frontend/middleware.ts — add when creating any protected Next.js pages
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('accessToken')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  // Optionally verify token shape here (not signature — do that server-side)
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/account/:path*']
};
```

---

## 4. TENANT — Tenant Portal

### What it is
React 18 + Vite SPA at `{slug}.fauward.com`. The operational hub for a logistics business and their customers. Users have one of seven roles: `TENANT_ADMIN`, `TENANT_MANAGER`, `TENANT_STAFF`, `TENANT_FINANCE`, `TENANT_DRIVER`, `CUSTOMER_ADMIN`, `CUSTOMER_USER`.

### How it is gated

#### 4.1 Frontend — AuthGuard (UX layer)
`apps/tenant-portal/src/router.tsx` wraps all authenticated routes in `<AuthGuard>`:

```tsx
// apps/tenant-portal/src/router.tsx  lines 53–75
function AuthGuard() {
  const { isLoading, user } = useAuth();
  const tenant = useTenantStore((state) => state.tenant);

  if (isLoading && !user) return <Skeleton />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  if (tenant?.onboarding_complete === false && location.pathname !== '/onboarding') {
    return <Navigate to='/onboarding' replace />;
  }
  return <Outlet />;
}
```

`useAuth` calls `GET /api/v1/auth/me` on mount. If the API returns 401 (token expired / revoked), `user` becomes null and the guard redirects to `/login`.

#### 4.2 Frontend — GuestGuard (prevents authenticated re-login)

```tsx
// apps/tenant-portal/src/router.tsx  lines 77–83
function GuestGuard() {
  const { user } = useAuth();
  if (user) return <Navigate to='/' replace />;
  return <Outlet />;
}
```

#### 4.3 Frontend — Per-page role check (usePermission)
`apps/tenant-portal/src/hooks/usePermission.ts` provides a `usePermission(allowedRoles)` hook. Pages that should only be visible to certain roles call this at the top:

```typescript
// Example: apps/tenant-portal/src/pages/team/TeamPage.tsx
const { allowed } = usePermission(['TENANT_ADMIN']);
if (!allowed) return <AccessDenied />;
```

#### 4.4 Backend — Tenant resolution (Layer 3)
Every API request from the portal hits the `tenantResolver` middleware. It reads the subdomain from the `Host` header (e.g. `acme.fauward.com` → `slug = "acme"`) and loads the tenant from the database into `AsyncLocalStorage`. All downstream Prisma queries are automatically scoped to this tenant's `tenantId` — no developer action required.

```typescript
// apps/backend/src/shared/middleware/tenant.resolver.ts
// Resolves: subdomain → tenant_slug → tenant row
// Sets: request.tenant = { id, plan, status, slug, ... }
// Runs: AsyncLocalStorage.run({ tenant }, handler)
```

#### 4.5 Backend — Authentication (Layer 4)

```typescript
// apps/backend/src/shared/middleware/authenticate.ts
await request.jwtVerify();           // verify JWT signature + expiry
const user = await prisma.user.findFirst({
  where: { id: userId, tenantId },   // token tenantId must match a real user
  select: { isActive: true }
});
if (!user?.isActive) → 401 USER_SUSPENDED
```

#### 4.6 Backend — Tenant match (Layer 5)
Prevents a JWT from one tenant being used against another tenant's subdomain:

```typescript
// apps/backend/src/shared/middleware/tenantMatch.ts
if (user.role !== 'SUPER_ADMIN' && user.tenantId !== tenant.id) → 403 Forbidden
```

#### 4.7 Backend — RBAC (Layer 5)
Routes require specific roles via `requireRole(roles[])`:

```typescript
// Example — users.routes.ts
app.post('/api/v1/users/invite', {
  preHandler: [authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN'])]
}, handler);
```

Full role permission matrix: [Roles & Permissions](./roles-permissions.md#2-full-permission-matrix).

#### 4.8 Backend — Plan feature gating (Layer 6)
PRO/ENTERPRISE-only features are protected by `requireFeature`:

```typescript
// apps/backend/src/shared/middleware/featureGuard.ts
app.post('/api/v1/webhooks', {
  preHandler: [authenticate, requireTenantMatch, requireFeature('webhooks')]
}, handler);
// Returns 403 { code: 'FEATURE_NOT_AVAILABLE', upgradeUrl } for STARTER tenants
```

Feature matrix by plan:

| Feature | STARTER | PRO | ENTERPRISE |
|---------|:-------:|:---:|:----------:|
| Custom domain | ❌ | ✅ | ✅ |
| White label | ❌ | ✅ | ✅ |
| SMS notifications | ❌ | ✅ | ✅ |
| CRM module | ❌ | ✅ | ✅ |
| Finance module | ❌ | ✅ | ✅ |
| API access | ❌ | ✅ | ✅ |
| Webhooks | ❌ | ✅ | ✅ |
| Multi-branch | ❌ | ❌ | ✅ |
| SSO (SAML/OIDC) | ❌ | ❌ | ✅ |
| Audit log | ❌ | ❌ | ✅ |
| Carrier integrations | ❌ | ❌ | ✅ |
| Max staff | 3 | 15 | Unlimited |
| Max shipments/mo | 300 | 2,000 | Unlimited |

#### 4.9 Public routes (no auth)
Some routes within the portal domain are intentionally public:

| Route | Auth required | Notes |
|-------|:-------------:|-------|
| `GET /track` | No | Tracking lookup — anyone can track |
| `GET /track/:number` | No | Tracking result |
| `POST /book` | No | Public booking form |
| `POST /api/v1/auth/login` | No | Login endpoint |
| `POST /api/v1/auth/register` | No | Sign-up |
| `POST /api/v1/auth/refresh` | No | Token refresh |

#### 4.10 Proper implementation checklist

| Item | Status | Action |
|------|--------|--------|
| `AuthGuard` redirects unauthenticated users | ✅ | `router.tsx` |
| `GuestGuard` prevents re-login | ✅ | `router.tsx` |
| `usePermission` hook for page-level RBAC | ✅ | `usePermission.ts` |
| Backend JWT verification | ✅ | `authenticate.ts` |
| Backend tenant isolation | ✅ | `tenant.resolver.ts` + Prisma middleware |
| Backend RBAC | ✅ | `requireRole.ts` |
| Backend plan feature gating | ✅ | `featureGuard.ts` |
| Token refresh on 401 (axios interceptor) | ❌ | Add to `apps/tenant-portal/src/lib/api.ts` |
| MFA enforcement for `TENANT_ADMIN` | ❌ | Check `mfaVerified` claim in `authenticate.ts` |
| Onboarding completion gate | ✅ | `AuthGuard` checks `onboarding_complete` |
| Suspended tenant gate (`SUSPENDED` status) | ❌ | Check `tenant.status` in `authenticate.ts` |

#### 4.11 Token refresh interceptor (recommended addition)

```typescript
// apps/tenant-portal/src/lib/api.ts
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const { data } = await axios.post('/api/v1/auth/refresh', {
        refreshToken: localStorage.getItem('refreshToken')
      });
      localStorage.setItem('accessToken', data.accessToken);
      original.headers['Authorization'] = `Bearer ${data.accessToken}`;
      return api(original);
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## 5. DRIVER — Driver PWA

### What it is
React 18 + Vite PWA at a mobile URL. Used by delivery drivers in the field. Operates offline via Service Worker. The only role that should access this surface is `TENANT_DRIVER`.

### How it is gated

#### 5.1 Frontend — ProtectedRoute
`apps/driver/src/router.tsx` uses a Zustand-backed `ProtectedRoute`:

```tsx
// apps/driver/src/router.tsx  lines 18–25
function ProtectedRoute() {
  const isAuthenticated = useDriverStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to='/login' replace state={{ from: location }} />;
  }
  return <Outlet />;
}
```

`isAuthenticated` is set to `true` after a successful `POST /api/v1/auth/login` and the token is stored. On app start, the token should be validated against `GET /api/v1/auth/me` to detect expiry.

#### 5.2 Backend — TENANT_DRIVER role enforcement
All driver-specific routes require the `TENANT_DRIVER` role:

```typescript
// apps/backend/src/modules/driver/driver.routes.ts
preHandler: [authenticate, requireTenantMatch, requireRole(['TENANT_DRIVER'])]
```

Drivers cannot access shipment management, finance, CRM, or any other module — their role grants only:
- View assigned stops and shipment details
- Update shipment status for assigned stops only
- Capture POD (photo + signature)
- Report failed delivery
- Push GPS location
- View their own delivery history

#### 5.3 Backend — Tenant isolation for drivers
Drivers belong to a tenant. Their JWT contains `tenantId`. The `requireTenantMatch` middleware ensures they can only access their own tenant's data regardless of the request hostname.

#### 5.4 Offline support gating
The Service Worker queues mutations (status updates, POD uploads) when offline. When connectivity is restored, the queue is flushed in order. Each queued request must include the JWT token — the offline queue must also handle 401 responses by re-authenticating before replaying the queue.

#### 5.5 Proper implementation checklist

| Item | Status | Action |
|------|--------|--------|
| `ProtectedRoute` blocks unauthenticated access | ✅ | `router.tsx` |
| JWT stored in Zustand + `localStorage` | ✅ | `useDriverStore` |
| Backend `TENANT_DRIVER` role required on all driver routes | ✅ | `driver.routes.ts` |
| Backend tenant isolation | ✅ | `tenantMatch.ts` |
| Token validation on PWA cold start (`GET /auth/me`) | ❌ | Add to `useDriverStore` hydration |
| Offline queue handles 401 → re-auth before replay | ❌ | Implement in service worker message handler |
| Biometric auth (optional, PWA Web Auth API) | ❌ | Enhancement for v2 |

#### 5.6 Cold-start token validation (recommended addition)

```typescript
// apps/driver/src/stores/useDriverStore.ts  — hydration on app start
const token = localStorage.getItem('driverToken');
if (token) {
  try {
    const { data } = await axios.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    set({ isAuthenticated: true, user: data.user });
  } catch {
    localStorage.removeItem('driverToken');
    set({ isAuthenticated: false });
  }
}
```

---

## 6. SUPER — Super Admin

### What it is
React 18 + Vite SPA at `admin.fauward.com`. Internal Fauward tool. Only Fauward internal staff should ever access it. The surface must be fully inaccessible to any tenant user or external party.

### How it is gated

#### 6.1 Frontend — SuperAdminGuard (currently a stub)
`apps/super-admin/src/router.tsx` contains a `SuperAdminGuard` but `requireSuperAdmin()` is **hardcoded to return `true`**:

```tsx
// apps/super-admin/src/router.tsx  lines 22–32
function requireSuperAdmin(): boolean {
  return true;  // ⚠️ NO REAL AUTH — must be replaced
}

function SuperAdminGuard() {
  if (!requireSuperAdmin()) {
    return <Navigate to='/' replace />;
  }
  return <Outlet />;
}
```

**This is a critical gap.** The SPA currently has no frontend auth gate. It relies entirely on the backend — which is correct as a principle, but the UX experience is broken (unauthenticated visitors see the admin UI skeleton before hitting 401).

#### 6.2 Backend — SUPER_ADMIN role on all admin routes
The backend correctly enforces the `SUPER_ADMIN` role on every admin endpoint:

```typescript
// apps/backend/src/modules/super-admin/super-admin.routes.ts  line 9
const preHandlers = [authenticate, requireRole(['SUPER_ADMIN'])];
// Applied to: GET/PATCH /admin/tenants, POST /admin/impersonate, etc.
```

A `SUPER_ADMIN` JWT cannot be obtained through normal sign-up — it must be seeded directly in the database. The `SUPER_ADMIN` role is also exempt from `requireTenantMatch`, meaning it can access all tenants.

#### 6.3 Network-level gate (strongly recommended)
Because this is an internal tool, it should not be publicly reachable. Industry standard is one of:
- **IP allowlist** at the load balancer / CDN (only Fauward office/VPN IPs can reach `admin.fauward.com`)
- **VPN-only deployment** (admin app served on a private VPC, not public internet)
- **Mutual TLS (mTLS)** — require a client certificate from the browser

#### 6.4 Proper implementation for SuperAdminGuard

Replace the stub with a real JWT-backed guard:

```tsx
// apps/super-admin/src/router.tsx — replace requireSuperAdmin stub

import { useEffect, useState } from 'react';
import axios from 'axios';

function SuperAdminGuard() {
  const location = useLocation();
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    const token = localStorage.getItem('superAdminToken');
    if (!token) { setStatus('denied'); return; }
    axios.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(({ data }) => {
      if (data.user?.role === 'SUPER_ADMIN') {
        setStatus('ok');
      } else {
        setStatus('denied');
      }
    }).catch(() => setStatus('denied'));
  }, []);

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'denied') return <Navigate to='/login' replace state={{ from: location }} />;
  return <Outlet />;
}
```

You will also need to add a login page to the super-admin app:

```tsx
// apps/super-admin/src/pages/LoginPage.tsx
async function handleLogin(email: string, password: string) {
  const { data } = await axios.post('/api/v1/auth/login', { email, password });
  // Verify role on the returned token — do not trust the client claim alone
  if (data.role !== 'SUPER_ADMIN') throw new Error('Access denied');
  localStorage.setItem('superAdminToken', data.accessToken);
  navigate('/admin');
}
```

#### 6.5 Proper implementation checklist

| Item | Status | Action |
|------|--------|--------|
| Backend `SUPER_ADMIN` role on all `/admin/*` routes | ✅ | `super-admin.routes.ts` |
| `SUPER_ADMIN` bypasses tenant isolation | ✅ | `tenantMatch.ts` line 11 |
| Impersonation token generation | ✅ | `POST /admin/tenants/:id/impersonate` |
| Impersonation audit log | ✅ | `auditLog` entry in `super-admin.routes.ts` |
| Frontend `SuperAdminGuard` with real JWT check | ❌ | **Critical — replace stub** |
| Super admin login page | ❌ | Add to `apps/super-admin` |
| IP allowlist / VPN gate at network layer | ❌ | Infrastructure config (Cloudflare/ALB) |
| MFA required for `SUPER_ADMIN` login | ❌ | Enforce `mfaVerified: true` in `authenticate.ts` |
| Session timeout (short-lived tokens) | ❌ | Use 5–15min access token, never extend via cookie |
| Break-glass account procedure documented | ❌ | Ops runbook |

---

## 7. EMBEDDED — Tracking Widget

### What it is
A < 15 KB vanilla JavaScript snippet loaded via `<script>` on any third-party website. It renders a tracking input + event timeline inside a Shadow DOM so it cannot be styled by the host page. Configured entirely via `data-*` attributes on the script tag.

### How it is gated

#### 7.1 Configuration via data attributes
```html
<script
  src="https://cdn.fauward.com/widget/embed.js"
  data-tenant-id="t_abc123"
  data-primary-color="#1a2e4a"
  data-accent-color="#f59e0b"
  data-container="#my-tracking-div"
></script>
```

`data-tenant-id` is **not a secret** — it is a public identifier used to scope the tracking lookup to the correct tenant. The widget does not authenticate as a user.

#### 7.2 Public API path exemption
The widget calls `GET /api/v1/tracking/:number` which is a **public path** — no JWT required. The `tenantResolver` on the backend resolves the tenant from the `tenantId` query parameter rather than a subdomain:

```
GET /api/v1/tracking/FW-20241215-ABC123?tenantId=t_abc123
```

The backend's `tenantResolver` has a special case for tracking paths — it bypasses the normal subdomain check and resolves from the query param:

```typescript
// Pseudocode from tenantResolver behaviour:
if (path.startsWith('/api/v1/tracking/')) {
  // resolve tenant from query param, not subdomain
  // no JWT required — public read-only
}
```

#### 7.3 What the widget can and cannot do

| Action | Allowed | Notes |
|--------|:-------:|-------|
| Look up a shipment by tracking number | ✅ | Public read, scoped to tenant |
| See shipment status events | ✅ | Public read |
| See recipient name, address | ❌ | PII — not returned in public tracking response |
| Modify shipment status | ❌ | Requires JWT + role |
| Book a new shipment | ❌ | Requires JWT |

#### 7.4 Shadow DOM isolation
The widget uses Shadow DOM (`mode: "open"`) to prevent CSS bleed from the host page and to prevent the host page from reading widget internals:

```javascript
// widget/src/embed.js  lines 33–34
const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
```

#### 7.5 Proper implementation checklist

| Item | Status | Action |
|------|--------|--------|
| Shadow DOM isolation | ✅ | `embed.js` |
| `data-tenant-id` read from script tag | ✅ | `embed.js` |
| Public tracking API path exempt from auth | ✅ | Tenant resolver + public path config |
| PII fields excluded from public tracking response | ❌ | Audit `tracking.service.ts` response shape |
| CSP `script-src` guidance for embedders | ❌ | Document the CDN URL for tenant onboarding |
| Subresource Integrity (SRI) hash on CDN bundle | ❌ | Add to widget build pipeline |
| Rate limiting on public tracking endpoint | ❌ | Add IP-based rate limit: 30 req/min |

#### 7.6 Rate limit the public tracking endpoint (recommended)

```typescript
// apps/backend/src/modules/tracking/tracking.routes.ts
app.get('/api/v1/tracking/:number', {
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
}, handler);
```

---

## 8. Cross-Cutting: JWT Payload & Shared Claims

All authenticated surfaces (TENANT, DRIVER, SUPER) use the same JWT structure:

```typescript
// apps/backend/src/shared/utils/jwt.ts
interface JwtPayload {
  sub: string;          // userId
  email: string;
  role: string;         // one of the UserRole enum values
  tenantId: string;     // scopes the user to a tenant
  tenantSlug: string;   // for subdomain routing hints
  plan: string;         // STARTER | PRO | ENTERPRISE | TRIALING
  mfaVerified: boolean; // true if MFA was completed this session
  impersonator?: string; // set when SUPER_ADMIN is impersonating
}
```

**Access token:** 15-minute TTL (configurable via `JWT_ACCESS_EXPIRES_IN`).  
**Refresh token:** 7-day TTL (configurable via `JWT_REFRESH_EXPIRES_IN`), stored in the database as `refreshToken` table row.

### Token rotation
On `POST /api/v1/auth/refresh`:
1. Verify the incoming refresh token (signature + expiry + DB lookup).
2. Delete the old refresh token row (rotation — prevents token reuse).
3. Issue new access token + refresh token.
4. Any refresh token that does not exist in the DB is rejected even if cryptographically valid.

### Impersonation token
When a `SUPER_ADMIN` calls `POST /api/v1/admin/tenants/:id/impersonate`, the backend issues a short-lived (30-minute) access token for the target tenant's `TENANT_ADMIN` user, with the `impersonator` field set to the SUPER_ADMIN's userId. This is logged in `auditLog`. The impersonation session can be ended via `DELETE /api/v1/admin/impersonate`.

---

## 9. Cross-Cutting: API Middleware Stack

The exact order middleware runs on every request to the backend:

```
1. CORS
   └── Allowed origins: fauward.com, *.fauward.com
   └── Allowed headers: Authorization, Content-Type, X-Tenant-Slug
   └── Credentials: true

2. Rate Limiter (@fastify/rate-limit)
   └── Auth endpoints: 10 req/min per IP
   └── General API:    100 req/min per userId
   └── API key auth:   500 req/hr per apiKeyId
   └── 429 → { code: "RATE_LIMITED", retryAfter }

3. Tenant Resolver
   └── Reads: Host subdomain | custom domain | X-Tenant-Slug header | API key
   └── Looks up tenant in PostgreSQL
   └── Stores in AsyncLocalStorage (accessible everywhere without passing it)
   └── Special case: /api/v1/admin/* → "system" context (SUPER_ADMIN only)
   └── Special case: /api/v1/tracking/* → tenant from query param (public)
   └── 404 if tenant not found and path is not public

4. authenticate()  [only on routes that declare it as preHandler]
   └── Extracts Bearer token from Authorization header
   └── Calls request.jwtVerify() → validates signature + expiry
   └── DB lookup: user.isActive must be true
   └── 401 if missing / invalid / user suspended

5. requireRole([...roles])  [only on routes that declare it]
   └── Checks request.user.role ∈ allowed roles
   └── 403 if role not in list

6. requireTenantMatch()  [only on tenant-scoped routes]
   └── JWT tenantId must equal resolved tenant.id
   └── SUPER_ADMIN is always exempt
   └── 403 if mismatch

7. requireFeature('featureName')  [only on plan-gated routes]
   └── Checks plan.service.hasFeature(tenant.plan, feature)
   └── 403 { code: "FEATURE_NOT_AVAILABLE", upgradeUrl } if not on plan

8. Idempotency  [only on POST/PATCH routes]
   └── Reads Idempotency-Key header
   └── SHA-256 hash → lookup in idempotency_keys table
   └── 409 if PROCESSING; cached response if COMPLETED
   └── Inserts PROCESSING row if new

9. Route Handler
   └── Prisma queries auto-scoped to tenant via middleware (no bypass)
```

### Adding a new protected route — the complete pattern

```typescript
app.post('/api/v1/my-resource', {
  preHandler: [
    authenticate,          // Always first
    requireTenantMatch,    // Always second for tenant routes
    requireRole(['TENANT_ADMIN', 'TENANT_MANAGER']),  // Specific roles
    requireFeature('crmModule')  // If plan-gated
  ]
}, async (request, reply) => {
  // request.user.sub       = userId
  // request.user.tenantId  = tenantId  (already verified)
  // request.user.role      = role      (already verified)
  // request.tenant         = full tenant object
  // All prisma queries auto-scoped — don't add tenantId manually
});
```

---

## 10. Cross-Cutting: Plan Feature Gating

Plan gating is a fourth layer of authorisation on top of RBAC. It answers: "Your role allows this action in general, but does your tenant's plan include this feature?"

### Feature matrix
Defined in `apps/backend/src/modules/tenants/plan.service.ts`:

```
STARTER  → no custom domain, no API access, no webhooks, max 3 staff, 300 shipments/mo
PRO      → custom domain, white label, API access, webhooks, CRM, finance, max 15 staff
ENTERPRISE → all PRO features + multi-branch, SSO, audit log, carrier integrations, unlimited
TRIALING → same limits as STARTER (tenant just signed up; convert within trial period)
```

### Usage enforcement
Numeric limits (staff count, shipments per month) are checked as part of the business logic in service files, not as middleware. When a limit is hit:

```typescript
// Example pattern in users.service.ts
const staffCount = await prisma.user.count({ where: { tenantId } });
const maxStaff = planService.getLimit(tenant.plan, 'maxStaff');
if (maxStaff !== -1 && staffCount >= maxStaff) {
  throw new PlanLimitError('Staff limit reached', 'upgradeUrl');
}
```

### Plan upgrades
Triggered by Stripe webhook (`customer.subscription.updated`) → backend updates `tenant.plan` + `subscription.plan`. Until Stripe is wired up, plans can only be changed via `PATCH /api/v1/admin/tenants/:id/plan` (SUPER_ADMIN only).

---

## 11. Gaps & Hardening Checklist

The following gaps exist in the current implementation. They are ordered by security impact.

### Critical

| Gap | Surface | Fix |
|-----|---------|-----|
| `SuperAdminGuard` is a stub (`return true`) | SUPER | Replace with real JWT + role check — see §6.4 |
| No super admin login page | SUPER | Add `LoginPage` to `apps/super-admin` |
| `admin.fauward.com` publicly reachable | SUPER | Add IP allowlist or VPN gate at CDN/ALB layer |

### High

| Gap | Surface | Fix |
|-----|---------|-----|
| No suspended tenant check | TENANT | Add `tenant.status === 'SUSPENDED' → 403` in `authenticate.ts` |
| `mfaVerified` claim in JWT not enforced anywhere | ALL | Check `req.user.mfaVerified` for sensitive operations |
| Token not validated on Driver PWA cold start | DRIVER | Call `GET /auth/me` on store hydration |
| No token refresh interceptor in Tenant Portal | TENANT | Add axios interceptor (see §4.11) |

### Medium

| Gap | Surface | Fix |
|-----|---------|-----|
| Email verification on sign-up missing | MARKETING | Add email verification token flow to `auth.service.ts` |
| PII in public tracking response not audited | EMBEDDED | Audit and redact recipient fields in `tracking.service.ts` |
| Rate limit on public tracking endpoint missing | EMBEDDED | Add `{ max: 30, timeWindow: '1 minute' }` per IP |
| Offline queue on Driver PWA doesn't handle 401 | DRIVER | Re-auth before queue replay |

### Low / Enhancement

| Gap | Surface | Fix |
|-----|---------|-----|
| CSP / SRI for widget bundle | EMBEDDED | Add to CDN build pipeline |
| MFA required for `SUPER_ADMIN` | SUPER | Enforce `mfaVerified: true` in authenticate.ts when role = SUPER_ADMIN |
| Next.js `middleware.ts` for future protected pages | MARKETING | Add when adding member pages |
| Biometric auth for Driver PWA | DRIVER | Web Authentication API (WebAuthn) |

---

## 12. Environment Variables Required

Each surface has its own environment variable requirements.

### Backend (`apps/backend/.env`)

```bash
# Database
SUPABASE_DB_URL=postgresql://...
SUPABASE_DIRECT_URL=postgresql://...   # For Prisma migrations

# Cache
REDIS_URL=redis://...

# JWT — generate strong random secrets (min 32 chars)
JWT_ACCESS_SECRET=<random-32-char-string>
JWT_REFRESH_SECRET=<random-32-char-string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Platform
PLATFORM_DOMAIN=fauward.com
NODE_ENV=production
PORT=3001

# MFA
MFA_ISSUER=Fauward

# External services (required for full functionality)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SENDGRID_API_KEY=SG....
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=fauward-uploads
AWS_REGION=eu-west-2
GOOGLE_MAPS_API_KEY=...
```

### Marketing Site (`apps/frontend/.env.local`)

```bash
NEXT_PUBLIC_API_URL=https://api.fauward.com
NEXT_PUBLIC_MARKETING_SITE_URL=https://fauward.com
NEXT_PUBLIC_TENANT_PORTAL_URL=https://{slug}.fauward.com
```

### Tenant Portal (`apps/tenant-portal/.env`)

```bash
VITE_API_BASE_URL=/api        # proxied to backend via nginx
VITE_WS_URL=wss://api.fauward.com
```

### Driver PWA (`apps/driver/.env`)

```bash
VITE_API_BASE_URL=https://api.fauward.com
```

### Super Admin (`apps/super-admin/.env`)

```bash
VITE_API_BASE_URL=https://api.fauward.com
```

### Widget (`widget/.env`)

```bash
VITE_API_BASE_URL=https://api.fauward.com   # baked into the bundle at build time
```

---

## Quick Reference — Which middleware protects what

| Route prefix | Tenant resolver | authenticate | requireRole | requireTenantMatch | requireFeature |
|---|:---:|:---:|:---:|:---:|:---:|
| `POST /api/v1/auth/login` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /api/v1/tracking/:n` | ✅ (from query) | ❌ | ❌ | ❌ | ❌ |
| `GET /api/v1/shipments` | ✅ | ✅ | T_ADMIN/MGR/STAFF/FIN | ✅ | ❌ |
| `POST /api/v1/users/invite` | ✅ | ✅ | T_ADMIN | ✅ | ❌ |
| `GET /api/v1/driver/route` | ✅ | ✅ | T_DRIVER | ✅ | ❌ |
| `POST /api/v1/finance/invoices` | ✅ | ✅ | T_ADMIN/MGR/FIN | ✅ | financeModule |
| `POST /api/v1/webhooks` | ✅ | ✅ | T_ADMIN | ✅ | webhooks |
| `GET /api/v1/admin/tenants` | system | ✅ | SUPER_ADMIN | ❌ (exempt) | ❌ |
| `POST /api/v1/admin/impersonate` | system | ✅ | SUPER_ADMIN | ❌ (exempt) | ❌ |

---

*Part of the [Fauward documentation](../README.md)*
