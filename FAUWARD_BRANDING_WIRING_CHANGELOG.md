# Fauward — Brand Studio → Widget Wiring Changelog

Wires the tenant portal **Settings → Brand Studio** save path to the canonical
`tenants` row (and `tenant_settings.notificationEmail`) so a single Save
propagates to that tenant's widget across hosted, embed, and white-label surfaces.

The widget's **read** path (`@fauward/tenant-db` → `branding: { primary, accent, radius, logoUrl }`)
is unchanged. Output shape is preserved. Only writes + the AA contrast guard are added.

---

## 1. Phase 1 findings — field map

| UI field | Canonical column / key | Widget consumption point | Status before | Action |
|---|---|---|---|---|
| Company name | `Tenant.brandName` (write); `brandName ?? name` (display) | hosted page header / logo alt | accessor only surfaced `name` | Accessor now exposes `brandName` + uses it for `displayName`. |
| Support email | `TenantSettings.notificationEmail` (existing) | Notification templates (no widget surface yet) | read-only in UI, never written | Save now upserts `notificationEmail`. |
| Logo URL | `Tenant.logoUrl` | `tenant.branding.logoUrl` → widget header slot | wired (read); save was a no-op | Save now persists; empty string clears. |
| Primary color | `Tenant.primaryColor` | `--brand-primary` CSS var | wired (read); save was a no-op | Save now persists; hex-validated. |
| Accent color | `Tenant.accentColor` | `--brand-accent` CSS var | wired (read), **no contrast guard** | Save now persists; accessor falls back to default if it fails WCAG AA vs primary. |
| Tracking headline | `Tenant.trackingHeadline` | not yet read by widget (storage only) | **NOT FOUND** anywhere | New column `trackingHeadline String?` via migration `0032_tenant_tracking_headline`. |
| RTL | `Tenant.isRtl` | `tenant.isRtl` | exists; UI doesn't expose | Left alone. |

**Decisions taken** (from clarifying questions):
1. Tracking headline → new `Tenant.trackingHeadline` column.
2. Company name → writes **`brandName` only** (preserves internal `name`); accessor + `/v1/tenant/me` use `brandName ?? name` for `displayName`.
3. AA contrast guard added in `normalizeTenantRow` (output shape unchanged).
4. Single endpoint: extended `PATCH /api/v1/tenant/branding` to update tenant + tenantSettings in a Prisma `$transaction`.

**Draft vs live decision:** "Save branding" writes directly to the live `tenants` row. "Reset draft" reverts unsaved local form state to the last server-loaded values (client-only revert; no staging table). Flagged as a follow-up if a true preview-before-publish workflow is ever wanted.

---

## 2. Files changed / created

### Backend
- `apps/backend/prisma/schema.prisma` — added `trackingHeadline String?` to `Tenant`.
- `apps/backend/prisma/migrations/0032_tenant_tracking_headline/migration.sql` — created (`ALTER TABLE "tenants" ADD COLUMN "trackingHeadline" TEXT;`).
- `apps/backend/src/modules/tenants/tenant.schema.ts` — `brandingSchema` extended with `supportEmail`, `trackingHeadline`, `https://`-only logo URL (empty string allowed to clear).
- `apps/backend/src/modules/tenants/branding.service.ts` — exported `BrandingPayload`; added `getBrandingSnapshot`; `updateBranding` now wraps `tenant.update` + `tenantSettings.upsert(notificationEmail)` in a `$transaction`; empty-string semantics for clearable fields.
- `apps/backend/src/modules/tenants/tenant.service.ts` — `updateBranding` fetches before/after snapshots and writes an `AuditLog` row (`action: 'BRANDING_UPDATED'`) only when something actually changed. `getCurrentTenant` now returns `displayName = brandName ?? name`.
- `apps/backend/src/modules/tenants/tenant.controller.ts` — catches `ZodError` and returns `400 { error: 'VALIDATION_ERROR', issues }` matching the convention from `domain.controller.ts`.
- `apps/backend/src/modules/tenants/tenant.routes.ts` — added `requireRole(['TENANT_ADMIN'])` to `PATCH /api/v1/tenant/branding`.
- `apps/backend/src/modules/tenants/tenant.service.test.ts` — rewrote `brandingService.updateBranding` tests to cover `$transaction`, logo clearing, supportEmail upsert path, and omitted-supportEmail no-op.

### Shared accessor
- `packages/tenant-db/src/queries/tenants.ts` — added `brandName` and `trackingHeadline` to `Tenant`/`TenantRow`; included them in the Supabase `SELECT`; `displayName = brandName ?? name`; new `ensureAccentContrast()` helper applies a WCAG AA fallback to `DEFAULT_ACCENT` when the stored accent fails contrast vs primary. **Public output shape unchanged** — only values may differ.

### Tenant portal
- `apps/tenant-portal/src/types/domain.ts` — `TenantConfig` gained `brand_name` and `tracking_headline`.
- `apps/tenant-portal/src/hooks/useTenant.ts` — normalizer surfaces `brandName` and `trackingHeadline` from `/v1/tenant/me`.
- `apps/tenant-portal/src/api/branding.ts` — **new**: `useUpdateBranding` mutation hook + `BrandingValidationError` that extracts Zod issue field errors from the 400 response.
- `apps/tenant-portal/src/pages/settings/BrandingTab.tsx` — rewired Save (calls the mutation, invalidates `tenant-config` query, toasts) + Reset draft (reverts to a `useRef` baseline that re-syncs whenever the tenant store updates) + inline field errors on both client- and server-side validation failures. Save/Reset disable while pending or while nothing is dirty.

---

## 3. Propagation path & cache invalidation

```
BrandingTab Save click
  → PATCH /api/v1/tenant/branding  (TENANT_ADMIN, tenant-scoped via req.tenant.id)
  → brandingService.updateBranding (prisma.$transaction[tenant.update, tenantSettings.upsert])
  → AuditLog row (BRANDING_UPDATED, before/after)
  → response → useQueryClient.invalidateQueries(['tenant-config'])
  → portal refetches /v1/tenant/me → store + applyTenantConfig() re-themes the portal
```

Widget surfaces:
- **Hosted `/ship/[tenant]`** — `apps/widget/app/ship/[tenant]/page.tsx` is `force-dynamic`; next request calls `getTenantBySlugOrHistory` → fresh DB → new CSS vars + logo. **No cache to invalidate.**
- **Embed iframe** — `/api/widget/config` has no cache headers; embed token TTL is 15 min. Next token refresh (or hard reload) picks up the change. **No cache to invalidate.**
- **White-label host** — middleware uses Edge Config only for `host → slug` (not branding); branding still reads through `getTenantBySlug`, same as hosted. **No cache to invalidate.**

The AA contrast guard runs inside `normalizeTenantRow`, so a tenant who saves a low-contrast accent gets the default served back to the widget without ever changing the stored value or the accessor's output shape.

---

## 4. Verification

### Automated
- `npm run typecheck --workspace=packages/tenant-db` — clean.
- `npm run typecheck --workspace=apps/tenant-portal` — clean.
- `npm run typecheck --workspace=apps/backend` — 9 errors remain, **all pre-existing** in `agent/`, `field/`, `payments/stripe.service.ts` modules (none touch the tenant or branding modules; not introduced by this task).
- `npm run test --workspace=apps/backend -- tenant.service.test` — **23/23 passing**, including the rewritten branding suite (covers `$transaction` shape, logo clearing, supportEmail upsert, and omitted-supportEmail no-op).

### Manual (to run after restarting the backend dev server to refresh the Prisma engine DLL)
Run `prisma migrate deploy` to apply migration `0032_tenant_tracking_headline`, then:

1. **Two non-red brand colors:** save `#2563EB` then `#7C3AED` for the same tenant.
   - Reload Brand Studio → values persist.
   - Hard-reload `/ship/<slug>` → primary CTA, focus rings, stepper fill all re-skin; status pills (success/error/warn) stay semantic.
   - Embed iframe (test page using `widget-sdk`) re-skins on next token fetch.
   - White-label host: same as hosted.
2. **Logo URL:** save a valid `https://…` URL → header logo appears. Save empty string → falls back to the brand-name / reserved-bar slot per the header design pass.
3. **Validation rejected with field-level errors:**
   - `primaryColor: "red"` → inline error under that input ("Must be a 6-digit hex color…"). No save.
   - `logoUrl: "http://insecure"` → inline error ("Logo URL must start with https://"). No save.
   - `supportEmail: "not-an-email"` → inline error.
4. **Auth / scope:**
   - Non-admin (e.g. TENANT_STAFF) JWT → `403 Forbidden`.
   - Cross-tenant write is structurally impossible: handler reads only `request.tenant.id`; payload has no tenant id field.
5. **AuditLog:** after a successful save, `SELECT * FROM audit_log WHERE action='BRANDING_UPDATED' ORDER BY timestamp DESC LIMIT 1;` shows an entry with sensible `beforeState`/`afterState`/`metadata.diff`.
6. **AA contrast guard:** save `primaryColor=#0D1F3C, accentColor=#0D1F3C` → DB stores both as `#0D1F3C` (user's choice respected at rest), but `getTenantBySlug` returns `branding.accent = #D97706` (default), so the widget remains legible. The portal's own preview, which uses the user-entered accent directly, makes the bad choice visible to the editor.
7. **Reset draft:** edit several fields → click Reset → form reverts to the last saved state; Save/Reset buttons go disabled (nothing dirty).

---

## 5. Flagged follow-ups (NOT in this PR)

- **`trackingHeadline` is stored but not yet rendered** on the widget tracking page. The column + accessor surface (`tenant.trackingHeadline`) are ready; rendering is a separate UX task.
- **`brandName` consumption in the widget header.** `displayName` now resolves correctly across both `@fauward/tenant-db` and `/v1/tenant/me`, but if any widget surface currently reads `tenant.name` directly, it would still ignore the brand override. Worth a sweep — non-blocking for branding propagation since the CSS vars + logo (the heavier visual cues) are the main re-skin path.
- **True draft / publish workflow.** Today's "Reset draft" is a client-side revert. If Brand Studio is ever expected to preview before going live, a `tenant_branding_draft` table + a publish action would be needed.
- **Pre-existing shadow-DB drift.** `prisma migrate dev` fails on `0017_relay_approval_fields` because the shadow DB can't reconcile the migration history (`public.relay_messages` missing). I worked around this by writing the migration SQL manually as `0032_tenant_tracking_headline`. The drift itself is unrelated and not in scope, but should be cleaned up.
- **Prisma engine DLL was locked on Windows** while the backend dev server was running, so `prisma generate` couldn't swap the runtime binary. The TypeScript `.d.ts` did refresh (which is why typecheck and tests pass). The user should stop the backend dev server, run `npm run prisma:generate --workspace=apps/backend`, then `npm run prisma:migrate:deploy --workspace=apps/backend` to apply migration `0032`, then restart the backend.
