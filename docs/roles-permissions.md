# User Roles & Permissions

> Role hierarchy · Full permission matrix · Customer organisation model · Cross-branch visibility

**Navigation →** [Pricing](./pricing-billing.md) · [Architecture](./system-architecture.md) · [← README](../README.md)

---

## Contents

1. [Role Hierarchy](#1-role-hierarchy)
2. [Full Permission Matrix](#2-full-permission-matrix)
3. [Customer Organisation Model](#3-customer-organisation-model)
4. [Cross-Branch Visibility (Enterprise)](#4-cross-branch-visibility-enterprise)

---

## 1. Role Hierarchy

```
SUPER_ADMIN  ─── Fauward internal — full access to all tenants
  └── TENANT_ADMIN  ─── scoped to their tenant
        ├── TENANT_MANAGER
        │     └── TENANT_STAFF
        │           └── TENANT_DRIVER
        └── TENANT_FINANCE  ─── financial data only, no operations

CUSTOMER_ADMIN  ─── scoped to their organisation
  └── CUSTOMER_USER
```

| Role | Abbrev | Scope |
|------|--------|-------|
| `SUPER_ADMIN` | SUPER | All tenants — Fauward internal |
| `TENANT_ADMIN` | T_ADMIN | Their tenant only |
| `TENANT_MANAGER` | T_MGR | Their tenant; subset of admin permissions |
| `TENANT_STAFF` | T_STAFF | Own shipments + assigned work |
| `TENANT_DRIVER` | T_DRIVER | Assigned stops + POD capture only |
| `TENANT_FINANCE` | T_FIN | Financial data only; no operations |
| `CUSTOMER_ADMIN` | C_ADMIN | Their organisation only |
| `CUSTOMER_USER` | C_USER | Own bookings and tracking only |

---

## 2. Full Permission Matrix

| Permission | SUPER | T\_ADMIN | T\_MGR | T\_FIN | T\_STAFF | T\_DRIVER | C\_ADMIN | C\_USER |
|------------|:-----:|:--------:|:------:|:------:|:--------:|:---------:|:--------:|:-------:|
| View all tenants | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Impersonate tenant | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create shipment | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Edit any shipment | ✅ | ✅ | ✅ | ❌ | *own* | ❌ | *own* | *own* |
| Update shipment status | ✅ | ✅ | ✅ | ❌ | ✅ | *assigned* | ❌ | ❌ |
| Assign driver | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View all shipments | ✅ | ✅ | ✅ | ✅ | ✅ | *assigned* | *own org* | *own* |
| Create invoice | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View invoices | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | *own org* | *own* |
| View P&L / financials | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage staff | ✅ | ✅ | *limited* | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage branding | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | *own* | ❌ |
| View analytics | ✅ | ✅ | ✅ | ✅ | *limited* | ❌ | *own org* | ❌ |
| Manage API keys | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Capture POD | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| View audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Customer Organisation Model

Logistics is **B2B** — customers are companies, not just individuals.

```
Organisation (B2B client)
├── billing_owner_id  →  User  (pays the invoices)
├── admin_users       →  [User]  (can manage org bookings)
└── regular_users     →  [User]  (can book + track only)
```

This enables:

- **Multi-user companies** as clients
- **Organisation-level invoicing** with consolidated statements
- **Net 30/60 payment terms** per organisation
- **Consolidated shipment views** across all users in an org

---

## 4. Cross-Branch Visibility (Enterprise)

> Multi-branch is an Enterprise-tier feature. See [Enterprise Tier](./logistics-core.md#12-enterprise-tier--full-specification) for full details.

| Role | Branch Visibility |
|------|-------------------|
| `TENANT_ADMIN` | All branches — full view |
| `TENANT_MANAGER` | Assigned branch(es) only |
| `TENANT_STAFF` | Their branch only |
| `TENANT_FINANCE` | All branches — financial data only |

---

*Part of the [Fauward documentation](../README.md)*
