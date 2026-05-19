# Fauward Admin Portal

Fresh Vite build for the hardened super-admin hostname.

- Production hostname: `admin.fauward.com`
- Staging hostname: `admin-staging.fauward.com`
- Dev port: `5176`
- Backend admin auth namespace: `/admin/auth/*`

Run locally:

```powershell
npm run dev --workspace=apps/admin-portal
```

Build:

```powershell
npm run build --workspace=apps/admin-portal
```

This app must stay separate from `apps/tenant-portal`; tenant builds should not import or bundle files from this workspace.
