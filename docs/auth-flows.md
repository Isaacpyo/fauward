# Sign-In & Sign-Out Flows

> How users, tenants, and the super admin sign in and sign out across all three authenticated surfaces.

**Navigation →** [Gating Implementation](./gating-implementation.md) · [Roles & Permissions](./roles-permissions.md) · [API Design](./api.md) · [← README](../README.md)

---

## Contents

1. [Token Architecture](#1-token-architecture)
2. [TENANT PORTAL — Sign-In / Sign-Out](#2-tenant-portal--sign-in--sign-out)
3. [AGENTS PWA — Sign-In / Sign-Out](#3-agents-pwa--sign-in--sign-out)
4. [SUPER ADMIN — Sign-In / Sign-Out](#4-super-admin--sign-in--sign-out)
5. [Backend Auth Endpoints Reference](#5-backend-auth-endpoints-reference)
6. [Token Refresh (Silent Re-Authentication)](#6-token-refresh-silent-re-authentication)
7. [Impersonation (SUPER_ADMIN only)](#7-impersonation-super_admin-only)
8. [Password Reset Flow](#8-password-reset-flow)
9. [MFA (TOTP) Flow](#9-mfa-totp-flow)
10. [Session Lifecycle Diagram](#10-session-lifecycle-diagram)

---

## 1. Token Architecture

All three authenticated surfaces share the same backend token system.

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| **Access token** (JWT) | 15 min | `localStorage` | Sent as `Authorization: Bearer <token>` on every API call |
| **Refresh token** (opaque) | 7 days | `localStorage` + `refreshToken` DB table | Exchange for a new access token when it expires |

**JWT payload claims:**

```typescript
{
  sub: string;          // userId
  email: string;
  role: string;         // SUPER_ADMIN | TENANT_ADMIN | ... | TENANT_DRIVER
  tenantId: string;
  tenantSlug: string;
  plan: string;         // STARTER | PRO | ENTERPRISE | TRIALING
  mfaVerified: boolean;
  impersonator?: string; // present only during SUPER_ADMIN impersonation
}
```

**Token rotation:** Every call to `POST /api/v1/auth/refresh` deletes the old refresh token row and issues a brand-new pair. A refresh token that no longer exists in the DB is rejected even if the JWT signature is valid.

**localStorage key namespacing:**

| Surface | Access token key | Refresh token key |
|---------|-----------------|------------------|
| Tenant Portal | `fw_access_token` | `fw_refresh_token` |
| Agents PWA | `fauward_agent_session` | `fauward_agent_session` (full session JSON) |
| Super Admin | `fw_sa_access_token` | `fw_sa_refresh_token` |

Different keys prevent one surface's token from interfering with another on the same device.

---

## 2. TENANT PORTAL — Sign-In / Sign-Out

### Who uses this

All tenant roles: `TENANT_ADMIN`, `TENANT_MANAGER`, `TENANT_STAFF`, `TENANT_FINANCE`, `TENANT_DRIVER`, `CUSTOMER_ADMIN`, `CUSTOMER_USER`.

### Sign-In

**URL:** `https://{slug}.fauward.com/login`

**Entry point:** `apps/tenant-portal/src/pages/AppPages.tsx` → `LoginPage`

**Flow:**

```
1. User visits {slug}.fauward.com/login
2. Fills in email + password
3. Form submits → POST /api/v1/auth/login  { email, password }
4. Backend: resolves tenant from subdomain → verifies credentials
5. Returns: { accessToken, refreshToken, tenantSlug, tenantId }
6. Frontend: stores tokens via setTokens() in localStorage
7. Redirects to the original intended URL (or "/" dashboard)
```

**Code path:**

```typescript
// apps/tenant-portal/src/pages/AppPages.tsx — LoginPage
const { data } = await api.post("/v1/auth/login", { email, password });
setTokens(data.accessToken, data.refreshToken, data.tenantSlug);
navigate(from ?? "/", { replace: true });
```

**Token storage helpers:** `apps/tenant-portal/src/lib/auth.ts`

**Axios interceptor** (`apps/tenant-portal/src/lib/api.ts`) automatically attaches the access token to every subsequent request:

```
Authorization: Bearer <accessToken>
```

**GuestGuard:** If the user is already signed in and navigates to `/login`, they are immediately redirected to `/`.

**Onboarding gate:** After first login, `AuthGuard` checks `tenant.onboarding_complete`. If false, the user is redirected to `/onboarding` regardless of what page they tried to visit.

### Sign-Out

**Location:** Top-bar user dropdown → "Logout" (`apps/tenant-portal/src/layouts/TopBar.tsx`)

**Flow:**

```
1. User clicks "Logout" in the top-bar dropdown
2. Frontend calls POST /api/v1/auth/logout  { refreshToken }
3. Backend deletes the refreshToken row from the DB (invalidates that session)
4. Frontend calls clearTokens() — removes both tokens from localStorage
5. Zustand user state set to null
6. React Router redirects to /login
```

The API call is best-effort — even if it fails (network error, expired access token), the local tokens are always cleared and the user is always redirected to `/login`.

**Code path:**

```typescript
// apps/tenant-portal/src/layouts/TopBar.tsx — Logout menu item
await apiClient.post("/v1/auth/logout", { refreshToken });
clearTokens();
setUser(null);
navigate("/login");
```

---

## 3. AGENTS PWA — Sign-In / Sign-Out

### Who uses this

Operational roles: `TENANT_DRIVER`, `TENANT_STAFF`, `TENANT_MANAGER`, `TENANT_ADMIN`.

### Sign-In

**URL:** Served at the agents app URL (configured per deployment), route `/login`

**Entry point:** `apps/agents/src/pages/LoginPage.tsx`

**Flow:**

```
1. Agent opens the PWA on their mobile device
2. Fills in email + password
3. Form submits → POST /api/v1/auth/login  { email, password }
4. Backend: resolves tenant from subdomain/header → verifies credentials
5. Returns: { accessToken, refreshToken, tenantSlug, tenantId }
6. Frontend: stores session via saveSession() in localStorage (key: fauward_agent_session)
7. AgentAuthContext sets session state
8. Redirects to /dashboard (or original intended URL via ?next= query param)
```

**Code path:**

```typescript
// apps/agents/src/pages/LoginPage.tsx
await login(email, password);
navigate(nextPath, { replace: true, state: { from: location } });
```

**Offline behaviour:** The PWA service worker caches routes for offline access. Scan and advance actions made while offline are queued in `localStorage` (`agentScanQueue`, `agentAdvanceQueue`) and replayed automatically by `AgentSyncListener` when connectivity is restored.

### Sign-Out

**Location:** Navigation header → "Logout" button (`apps/agents/src/components/agent/AgentNav.tsx`)

**Flow:**

```
1. Agent taps "Logout" in the navigation header
2. AgentAuthContext.logout() is called → clearSession() removes session from localStorage
3. session state set to null in context
4. React Router redirects to /login via AgentGate
```

```typescript
// apps/agents/src/context/AgentAuthContext.tsx
function logout() {
  clearSession();
  setSession(null);
}
```

---

## 4. SUPER ADMIN — Sign-In / Sign-Out

### Who uses this

`SUPER_ADMIN` role only — Fauward internal team exclusively.

### Sign-In

**URL:** `https://admin.fauward.com/login`

**Entry point:** `apps/super-admin/src/router.tsx` → `LoginPage` (inline component)

**Flow:**

```
1. Admin visits admin.fauward.com/login
2. Fills in email + password
3. Form submits → POST /api/v1/auth/login  { email, password }
   Note: The backend resolves tenant as "system" for admin.fauward.com,
   which means login succeeds only for SUPER_ADMIN users (no tenant context needed)
4. Returns: { accessToken, refreshToken, role }
5. Frontend verifies: role must equal "SUPER_ADMIN" — if not, access is denied
   and tokens are NOT stored.
6. Stores tokens via setTokens() (fw_sa_access_token)
7. Redirects to /admin (or original intended URL)
```

**Role verification is double-enforced:**

- **Frontend:** checks `data.role === "SUPER_ADMIN"` before storing tokens
- **Backend:** `SuperAdminGuard` re-validates via `GET /api/v1/auth/me` — if the role from the token is not `SUPER_ADMIN`, the user is redirected to `/login`
- **API:** every `/admin/*` route has `requireRole(['SUPER_ADMIN'])` — any request with a non-SUPER_ADMIN token gets 403

**Code path:**

```typescript
// apps/super-admin/src/router.tsx — LoginPage
const { data } = await api.post("/auth/login", { email, password });
if (data.role !== "SUPER_ADMIN" && data.user?.role !== "SUPER_ADMIN") {
  setError("Access denied — SUPER_ADMIN role required");
  return;
}
setTokens(data.accessToken, data.refreshToken);
navigate(from ?? "/admin", { replace: true });
```

**SuperAdminGuard** (previously a stub `return true` — now real):

```typescript
// apps/super-admin/src/router.tsx — SuperAdminGuard
useEffect(() => {
  if (!getAccessToken()) { setStatus("denied"); return; }
  api.get("/auth/me").then(({ data }) => {
    setStatus(data?.user?.role === "SUPER_ADMIN" ? "ok" : "denied");
  }).catch(() => setStatus("denied"));
}, []);
```

### Sign-Out

**Location:** Sidebar footer → "Sign out" button (`SignOutButton` in `router.tsx`)

**Flow:**

```
1. Admin clicks "Sign out" in the sidebar footer
2. Frontend calls POST /api/v1/auth/logout  { refreshToken }
3. Backend deletes the refreshToken row
4. Frontend calls clearTokens() — removes fw_sa_access_token + fw_sa_refresh_token
5. React Router redirects to /login
```

**Code path:**

```typescript
// apps/super-admin/src/router.tsx — SignOutButton
await api.post("/auth/logout", { refreshToken: getRefreshToken() });
clearTokens();
navigate("/login");
```

---

## 5. Backend Auth Endpoints Reference

All endpoints are on the shared backend (`apps/backend/src/modules/auth/`).

| Method | Path | Auth required | Rate limit | Purpose |
|--------|------|:---:|----------|---------|
| `POST` | `/api/v1/auth/register` | No | 10/min per IP | Create new tenant + TENANT_ADMIN user |
| `POST` | `/api/v1/auth/login` | No | 10/min per IP | Exchange email+password for tokens |
| `POST` | `/api/v1/auth/refresh` | No | — | Exchange refresh token for new token pair |
| `POST` | `/api/v1/auth/logout` | No | 30/min | Invalidate refresh token in DB |
| `GET` | `/api/v1/auth/me` | Yes (Bearer) | — | Return current user + tenant context |
| `POST` | `/api/v1/auth/forgot-password` | No | 10/min per IP | Send password reset email |
| `POST` | `/api/v1/auth/reset-password` | No | — | Redeem reset token + set new password |
| `POST` | `/api/v1/auth/mfa/setup` | Yes (Bearer) | — | Generate TOTP secret + QR code |
| `POST` | `/api/v1/auth/mfa/verify` | Yes (Bearer) | — | Confirm TOTP code to enable/disable MFA |
| `POST` | `/api/v1/auth/mfa/validate` | No | — | Validate TOTP code during login (step 2) |

### Login request / response

**Request:**
```json
POST /api/v1/auth/login
{ "email": "user@company.com", "password": "••••••••" }
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "e8f3a2c1...",
  "tenantSlug": "acme-logistics",
  "tenantId": "t_abc123"
}
```

**Error responses:**

| Status | Body | Cause |
|--------|------|-------|
| `401` | `{ "error": "Invalid credentials" }` | Wrong email or password |
| `400` | `{ "error": "Tenant context required" }` | No subdomain resolved AND email matches >1 tenant |
| `401` | `{ "error": "Account suspended", "code": "USER_SUSPENDED" }` | `user.isActive = false` |
| `429` | `{ "code": "RATE_LIMITED", "retryAfter": 60 }` | Exceeded 10/min |

### Logout request

**Request:**
```json
POST /api/v1/auth/logout
{ "refreshToken": "e8f3a2c1..." }
```

**Response:** `204 No Content`

The `refreshToken` body field is optional — if omitted the endpoint still returns 204 (the access token will expire naturally after 15 minutes).

---

## 6. Token Refresh (Silent Re-Authentication)

All three surfaces have an axios interceptor that automatically handles token expiry without interrupting the user.

**Interceptor location:**

| Surface | File |
|---------|------|
| Tenant Portal | `apps/tenant-portal/src/lib/api.ts` |
| Agents PWA | `apps/agents/src/lib/api.ts` |
| Super Admin | `apps/super-admin/src/lib/api.ts` |

**How it works:**

```
1. Any API call returns 401
2. Interceptor checks: is this already a retry? (prevents infinite loop)
3. If not: POST /api/v1/auth/refresh  { refreshToken }
4. If refresh succeeds:
   - Store new tokens
   - Retry the original failed request with the new access token
   - Release any other queued requests that were waiting
5. If refresh fails (expired or revoked):
   - clearTokens()
   - window.location.href = '/login'
```

**Queue behaviour:** If multiple requests fire simultaneously while the token is expired, only one refresh request is made. All other requests are queued and replayed once the new token is available.

---

## 7. Impersonation (SUPER_ADMIN only)

Super admins can temporarily act as a tenant's TENANT_ADMIN user for support and debugging. This generates a short-lived (30-minute) access token for the target user.

**Start impersonation:**

```
POST /api/v1/admin/tenants/:id/impersonate
Authorization: Bearer <SUPER_ADMIN token>

Response:
{ "token": "eyJ...", "expiresInSeconds": 1800 }
```

**In the tenant portal:**

The Tenant Portal's `AppShell` detects the `impersonated: true` claim on the user object and renders an amber banner at the top: *"You are viewing as [tenant name] — Exit impersonation"*.

**End impersonation:**

```
DELETE /api/v1/admin/impersonate
Authorization: Bearer <impersonation token>
```

Or: the super admin clicks the "Exit impersonation" button in the amber banner, which clears the impersonation token and restores their own session.

**Audit log:** Every impersonation start is recorded in `auditLog` with `action: "TENANT_IMPERSONATION_START"`, `actorId` (super admin), and `impersonatedUserId` (target tenant admin).

---

## 8. Password Reset Flow

Available on all surfaces for email-based password recovery.

```
1. User clicks "Forgot password?" → visits /forgot-password
2. Submits email address
3. POST /api/v1/auth/forgot-password  { email }
   Always returns { success: true } (no user enumeration)
4. Backend generates a 32-byte random token, SHA-256 hashes it,
   stores hash in passwordResetToken table (1hr expiry)
5. Sends reset email (via notificationLog queue → SendGrid worker)
6. User clicks link in email → /reset-password?token=<rawToken>
7. POST /api/v1/auth/reset-password  { token, newPassword }
8. Backend: hashes the token → looks up in DB → validates expiry
9. Updates passwordHash, marks token as used, deletes all refreshTokens
   (forces re-login on all devices after password change)
10. User redirected to /login
```

**Security notes:**
- Step 3 always returns 200 regardless of whether the email exists (prevents account enumeration)
- Step 9 invalidates all active sessions across all devices (refresh token wipe)
- Reset tokens expire after 1 hour and are single-use

---

## 9. MFA (TOTP) Flow

TOTP (Time-based One-Time Password, compatible with Google Authenticator, Authy, etc.) is available for all authenticated users. It is not yet enforced by default — enforcement at login is a pending implementation item.

### Enable MFA

```
1. User visits Settings → Profile → MFA section
2. Clicks "Setup MFA"
3. POST /api/v1/auth/mfa/setup  (requires active Bearer token)
   Returns: { secret, otpauth, qrCodeDataUrl }
4. User scans QR code in authenticator app
5. User enters 6-digit code to confirm
6. POST /api/v1/auth/mfa/verify  { code }
   Sets user.mfaEnabled = true
```

### Login with MFA (when enabled)

```
1. POST /api/v1/auth/login  (returns tokens)
2. Frontend checks: if mfaVerified = false in JWT payload → show MFA step
3. POST /api/v1/auth/mfa/validate  { email, code }
4. On valid code: issue new tokens with mfaVerified = true
```

The login-time MFA step (step 2–4) is documented but not yet enforced in the frontend login flow — it needs to be added to `LoginPage` on all three surfaces.

### Disable MFA

```
POST /api/v1/auth/mfa/verify  { code, disable: true }
```

---

## 10. Session Lifecycle Diagram

```
  User enters credentials
          │
          ▼
  POST /auth/login ──── 401 Invalid ──────────────────► Show error
          │
          │ 200 OK
          ▼
  Store access token (15 min)
  Store refresh token (7 days)
          │
          ▼
  ┌─────────────────────────────────┐
  │          ACTIVE SESSION         │
  │                                 │
  │  Every API request:             │
  │  Authorization: Bearer <token>  │
  │                                 │
  │  Token expires after 15 min     │
  └──────────┬──────────────────────┘
             │ 401 on any request
             ▼
  POST /auth/refresh ── 401 Expired ─────────────────► clearTokens()
          │                                              redirect /login
          │ 200 OK
          ▼
  Store NEW access token (15 min)
  Store NEW refresh token (7 days)
  Retry original request
          │
          ▼
  Continue active session
          │
          │ User clicks "Logout"
          ▼
  POST /auth/logout  { refreshToken }
  clearTokens()
  setUser(null)
  redirect /login
          │
          ▼
  ┌─────────────────────────────────┐
  │  SIGNED OUT                     │
  │  No tokens in localStorage      │
  │  AuthGuard → redirect /login    │
  └─────────────────────────────────┘
```

---

*Part of the [Fauward documentation](../README.md)*
