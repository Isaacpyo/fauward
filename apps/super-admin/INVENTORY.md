# super-admin Inventory — 2026-05-10

## Stack
| Lib | Version | From package.json |
|---|---:|---|
| React | ^18.3.1 | apps/super-admin/package.json dependencies.react |
| React DOM | ^18.3.1 | apps/super-admin/package.json dependencies.react-dom |
| Vite | ^5.4.6 | apps/super-admin/package.json devDependencies.vite |
| TypeScript | ^5.6.2 | apps/super-admin/package.json devDependencies.typescript |
| Tailwind CSS | ^3.4.17 | apps/super-admin/package.json devDependencies.tailwindcss |
| React Router DOM | ^6.26.2 | apps/super-admin/package.json dependencies.react-router-dom |
| TanStack Query | ^5.62.0 | apps/super-admin/package.json dependencies.@tanstack/react-query |
| TanStack Virtual | ^3.10.8 | apps/super-admin/package.json dependencies.@tanstack/react-virtual |
| Axios | ^1.7.7 | apps/super-admin/package.json dependencies.axios |
| lucide-react | ^0.454.0 | apps/super-admin/package.json dependencies.lucide-react |
| @fauward/relay-ui | * | apps/super-admin/package.json dependencies.@fauward/relay-ui |
| @fauward/formatting | 0.1.0 | apps/super-admin/package.json dependencies.@fauward/formatting |
| @vitejs/plugin-react | ^4.3.2 | apps/super-admin/package.json devDependencies.@vitejs/plugin-react |
| PostCSS | ^8.5.6 | apps/super-admin/package.json devDependencies.postcss |
| Autoprefixer | ^10.4.21 | apps/super-admin/package.json devDependencies.autoprefixer |

## Routes (current)
| Route | File | Auth required | Purpose |
|---|---|---|---|
| `/login` | apps/super-admin/src/router.tsx | No | Local staff login form calling `POST /auth/login`. |
| `/admin` | apps/super-admin/src/router.tsx -> apps/super-admin/src/pages/admin/DashboardPage.tsx | Yes, `SuperAdminGuard` | Super admin dashboard with static MRR, shipment, activity, and alert cards. |
| `/admin/tenants` | apps/super-admin/src/router.tsx -> apps/super-admin/src/pages/admin/TenantsListPage.tsx | Yes, `SuperAdminGuard` | Tenant list, local filters, virtualized tenant table, suspend and plan override dialogs. |
| `/admin/tenants/:id` | apps/super-admin/src/router.tsx -> apps/super-admin/src/pages/admin/TenantDetailPage.tsx | Yes, `SuperAdminGuard` | Tenant detail tabs and tenant actions for impersonation, suspend, plan override, delete button. |
| `/admin/regions` | apps/super-admin/src/router.tsx -> apps/super-admin/src/pages/admin/RegionsPage.tsx | Yes, `SuperAdminGuard` | Region overview, region change request approval/rejection, payment regions, audit tab. |
| `/admin/revenue` | apps/super-admin/src/router.tsx -> apps/super-admin/src/pages/admin/RevenuePage.tsx | Yes, `SuperAdminGuard` | Static revenue analytics table/card surface. |
| `/admin/system` | apps/super-admin/src/router.tsx -> apps/super-admin/src/pages/admin/SystemHealthPage.tsx | Yes, `SuperAdminGuard` | System health metrics from `/health`. |
| `/admin/queues` | apps/super-admin/src/router.tsx -> apps/super-admin/src/pages/admin/QueuesPage.tsx | Yes, `SuperAdminGuard` | Queue monitoring table and virtualized sample message viewer. |
| `/admin/relay` | apps/super-admin/src/router.tsx -> apps/super-admin/src/pages/admin/RelayPage.tsx | Yes, `SuperAdminGuard` | Relay messaging UI from `@fauward/relay-ui`. |
| `/admin/support-audit` | apps/super-admin/src/router.tsx -> apps/super-admin/src/pages/admin/SupportAuditPage.tsx | Yes, `SuperAdminGuard` | Relay support audit UI from `@fauward/relay-ui`. |
| `/admin/logs` | apps/super-admin/src/router.tsx inline `LogsPage` | Yes, `SuperAdminGuard` | Static log sample view. |
| `/admin/impersonation` | apps/super-admin/src/router.tsx -> apps/super-admin/src/pages/admin/ImpersonationPage.tsx | Yes, `SuperAdminGuard` | Tenant impersonation form and banner. |
| `/` | apps/super-admin/src/router.tsx | Yes, `SuperAdminGuard` | Redirects to `/admin`. |
| `*` | apps/super-admin/src/router.tsx | No | Redirects to `/login`. |
| `/tenants` | apps/super-admin/src/router/index.tsx -> apps/super-admin/src/features/tenants/TenantsPage.tsx | Not wired by `App.tsx`; no guard in this router | Older/unused router entry with placeholder tenants page. |
| `*` | apps/super-admin/src/router/index.tsx | Not wired by `App.tsx`; no guard in this router | Redirects to `/tenants` inside older/unused router. |

## Pages
| File | Route | Data sources (queries) | Components used |
|---|---|---|---|
| apps/super-admin/src/pages/admin/DashboardPage.tsx | `/admin` | Static local arrays `mrrPoints`, `shipmentPoints`, activity items, alerts. | `ActivityFeed`, `AlertCard`, `MRRChart`, `MetricCard`, `ShipmentsChart`. |
| apps/super-admin/src/pages/admin/TenantsListPage.tsx | `/admin/tenants` | Static `tenantsSeed`; local filter state; `useDebouncedValue`. | `TenantTable`, `SuspendDialog`, `PlanOverrideModal`. |
| apps/super-admin/src/pages/admin/TenantDetailPage.tsx | `/admin/tenants/:id` | `useParams`; no server fetch. | `TenantDetailTabs`, `SuspendDialog`, `PlanOverrideModal`. |
| apps/super-admin/src/pages/admin/RegionsPage.tsx | `/admin/regions` | TanStack Query key `["admin-regions"]`; `api.get("/region-change-requests")`; mutation `api.patch("/region-change-requests/:id")`. | Inline cards/tabs/buttons; lucide `Check`, `Clock3`, `Globe2`, `X`. |
| apps/super-admin/src/pages/admin/RevenuePage.tsx | `/admin/revenue` | Static component data. | `RevenueCharts`. |
| apps/super-admin/src/pages/admin/SystemHealthPage.tsx | `/admin/system` | TanStack Query key `["admin-health"]`; `api.get("/health")`; refetch every 15s. | `SystemMetrics`. |
| apps/super-admin/src/pages/admin/QueuesPage.tsx | `/admin/queues` | TanStack Query key `["admin-queues"]`; `api.get("/queues")`; refetch every 10s. | `QueueTable`, `QueueMessageViewer`. |
| apps/super-admin/src/pages/admin/RelayPage.tsx | `/admin/relay` | Data handled by `@fauward/relay-ui`. | `RelayMessagingTab`. |
| apps/super-admin/src/pages/admin/SupportAuditPage.tsx | `/admin/support-audit` | Data handled by `@fauward/relay-ui`. | `SupportAuditTab`. |
| apps/super-admin/src/pages/admin/ImpersonationPage.tsx | `/admin/impersonation` | Local state only; opens `/tenant?impersonation=...`. | `ImpersonationBanner`. |
| apps/super-admin/src/features/tenants/TenantsPage.tsx | `/tenants` in older unused router | None found. | None found. |
| apps/super-admin/src/router.tsx inline `LoginPage` | `/login` | `api.post("/auth/login")`; session checked by cookie hint and `/auth/me` guard. | Inline form and loading overlay. |
| apps/super-admin/src/router.tsx inline `LogsPage` | `/admin/logs` | Static log strings. | None found. |

## Components
| File | Used in (file paths) | Notes |
|---|---|---|
| apps/super-admin/src/components/admin/ActivityFeed.tsx | apps/super-admin/src/pages/admin/DashboardPage.tsx | Renders activity list with relative-ish date text. |
| apps/super-admin/src/components/admin/AlertCard.tsx | apps/super-admin/src/pages/admin/DashboardPage.tsx | Danger/warning alert card. |
| apps/super-admin/src/components/admin/ImpersonationBanner.tsx | apps/super-admin/src/pages/admin/ImpersonationPage.tsx | Sticky amber impersonation banner with exit button. Candidate for `@fauward/internal-ui`. |
| apps/super-admin/src/components/admin/MetricCard.tsx | apps/super-admin/src/pages/admin/DashboardPage.tsx | Metric/stat card. Candidate to migrate as `StatCard`. |
| apps/super-admin/src/components/admin/MRRChart.tsx | apps/super-admin/src/pages/admin/DashboardPage.tsx | Lightweight SVG line chart. |
| apps/super-admin/src/components/admin/PlanOverrideModal.tsx | apps/super-admin/src/pages/admin/TenantsListPage.tsx; apps/super-admin/src/pages/admin/TenantDetailPage.tsx | Local modal for plan override reason/plan; no API call inside. |
| apps/super-admin/src/components/admin/QueueMessageViewer.tsx | apps/super-admin/src/pages/admin/QueuesPage.tsx | Virtualized queue message sample viewer using `@tanstack/react-virtual`. Candidate pattern for dense UI virtualization. |
| apps/super-admin/src/components/admin/QueueTable.tsx | apps/super-admin/src/pages/admin/QueuesPage.tsx | Simple queue table with status classes. |
| apps/super-admin/src/components/admin/RelayNotificationCenter.tsx | apps/super-admin/src/router.tsx | Header notification dropdown using `useRelayNotifications` from `@fauward/relay-ui` and `useNavigate`. |
| apps/super-admin/src/components/admin/RevenueCharts.tsx | apps/super-admin/src/pages/admin/RevenuePage.tsx | Static revenue table/cards. |
| apps/super-admin/src/components/admin/ShipmentsChart.tsx | apps/super-admin/src/pages/admin/DashboardPage.tsx | Lightweight SVG bar chart. |
| apps/super-admin/src/components/admin/SuspendDialog.tsx | apps/super-admin/src/pages/admin/TenantsListPage.tsx; apps/super-admin/src/pages/admin/TenantDetailPage.tsx | Local suspend confirmation dialog with reason field; no API call inside. |
| apps/super-admin/src/components/admin/SystemMetrics.tsx | apps/super-admin/src/pages/admin/SystemHealthPage.tsx | DB, Redis, and uptime cards. |
| apps/super-admin/src/components/admin/TenantDetailTabs.tsx | apps/super-admin/src/pages/admin/TenantDetailPage.tsx | Local tabs for overview, users, usage, shipments, billing, audit; renders static placeholder data. |
| apps/super-admin/src/components/admin/TenantTable.tsx | apps/super-admin/src/pages/admin/TenantsListPage.tsx | Virtualized tenant table using `@tanstack/react-virtual`; row actions link to `/admin/tenants/:id`. Candidate pattern for `DenseTable`. |

## Hooks
| File | Returns | Used in |
|---|---|---|
| apps/super-admin/src/hooks/useDebouncedValue.ts | Debounced copy of a generic value after `delayMs`. | apps/super-admin/src/pages/admin/TenantsListPage.tsx |

## Stores
| File | State shape | Used in |
|---|---|---|
| None found | None found | None found |

## API client
- Base URL env var: None found. `api` is hardcoded to `baseURL: "/api/v1/platform"` in apps/super-admin/src/lib/api.ts.
- Auth method: `withCredentials: true`; platform session is cookie-based. Mutating requests add `X-CSRF-Token` from the `fw_platform_csrf` cookie.
- Interceptors: request interceptor adds CSRF for `POST`, `PUT`, `PATCH`, `DELETE`; response interceptor retries a single 401 by calling `POST /auth/refresh`.
- Error handling (401/403/5xx): 401 refresh failures drain queued waiters and set `window.location.href = "/login"`. 403 and 5xx are not globally handled by the client.
- Backend current platform routes: apps/backend/src/modules/platform/platform.routes.ts exposes `/api/v1/platform/auth/*`, `/tenants`, `/tenants/:id`, `/tenants/:id/plan-override`, `/tenants/:id/suspend`, `/tenants/:id/unsuspend`, `/tenants/:id/impersonation-sessions`, `/impersonation-sessions/*`, `/metrics`, `/queues`, `/health`, `/region-change-requests`, `/logs`, `/audit`, `/relay`.
- Deprecated backend admin routes: apps/backend/src/modules/super-admin/super-admin.routes.ts exposes `/api/v1/admin/*` compatibility routes guarded by `authenticate` + `requireRole(["SUPER_ADMIN"])`.

## React Query
- Default options: None set. apps/super-admin/src/lib/query-client.ts exports `new QueryClient()` with library defaults.
- Query key conventions: Existing keys are flat string arrays: `["admin-queues"]`, `["admin-regions"]`, `["admin-health"]`. Relay UI owns its own query keys.

## Auth
- Login page path: `/login`, implemented inline in apps/super-admin/src/router.tsx.
- Session model (cookie/localStorage): HTTP-only platform access/refresh cookies are set by backend; frontend reads `fw_platform_csrf` as a session hint and CSRF token. No localStorage session storage found.
- Cookie name (if applicable): Frontend directly reads `fw_platform_csrf`; backend platform session service also uses `fw_platform_access` and `fw_platform_refresh`.
- Route guards (how they work): `SuperAdminGuard` first checks `hasPlatformSessionHint()`, then calls `api.get("/auth/me")`; route access is allowed when `data.user.permissions` is an array.
- Current role(s): Frontend no longer checks a literal role, but login error copy still says `SUPER_ADMIN role required`. Backend currently uses Prisma `PlatformRole` values and colon-namespaced permissions (`tenant:read`, `queue:view`, etc.) for `/api/v1/platform/*`; deprecated `/api/v1/admin/*` routes still require `SUPER_ADMIN`.

## Environment variables
| Var | Default | Used in | Required? |
|---|---|---|---|
| None found | None found | No `import.meta.env`, `VITE_`, or `process.env` usage found under apps/super-admin. | No |
| apps/super-admin/.env.example | Missing | Prompt expected this file to be read. | No current code dependency found |

## Test setup
- Framework: None found in apps/super-admin/package.json. No super-admin Vitest or Playwright config found.
- Test files found: None found under apps/super-admin.

## Tailwind tokens currently defined
| Token | Value |
|---|---|
| `fontFamily.sans` | `["Inter", "system-ui", "sans-serif"]` |
| `fontFamily.mono` | `["JetBrains Mono", "monospace"]` |
| `colors.brand.navy` | `#0D1F3C` |
| `colors.brand.amber` | `#D97706` |

## Existing CSS variables
(from index.css or globals)

- apps/super-admin/src/index.css imports `../../../packages/design-tokens/src/tokens.css`.
- apps/super-admin/src/index.css imports `../../../packages/design-tokens/src/fauward.css`.
- Variables referenced directly in super-admin CSS/classes include `--font-sans`, `--color-surface-50`, `--color-text-primary`, `--color-text-muted`, `--color-border`, `--fauward-amber`, and `--fauward-navy`.

## Open questions / discrepancies with architecture spec
- The spec is expected at `docs/FAUWARD_INTERNAL_OPS_ARCHITECTURE.md`, but this repo currently only has `C:\Users\temit\Downloads\FAUWARD_INTERNAL_OPS_ARCHITECTURE.md`.
- The root workspace currently uses npm (`packageManager: npm@10.9.2`) and root `workspaces`; `pnpm-workspace.yaml` is not present.
- Appendix D describes 7 existing pages and likely `src/features/*` paths, but the actual app uses `src/pages/admin/*`, has additional routes for regions, relay, support audit, and logs, and has an older unused `src/features/tenants/TenantsPage.tsx`.
- The current API base is `/api/v1/platform`, not `/api/internal/*`.
- Current backend platform permissions are colon-namespaced (`tenant:read`, `queue:view`, `audit:view`) while the architecture spec requires dotted permissions in `@fauward/internal-rbac`.
- The backend already has a hash-chained `PlatformAuditLog` table and service. The tenant-scoped `AuditLog` model exists separately and is not the current internal platform audit table.
- `apps/super-admin/.env.example` is missing.
- Architecture §3.1 lists Zustand, Radix UI, recharts, date-fns, Zod, React Hook Form, Vitest, and Playwright as stack items, but apps/super-admin/package.json does not currently include them.
