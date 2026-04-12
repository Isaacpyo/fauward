# Fauward — User Roles & Permissions

---

## 6.1 Role Hierarchy

```
SUPER_ADMIN (Fauward internal — full access to all tenants)
  └── TENANT_ADMIN (scoped to their tenant)
        ├── TENANT_MANAGER
        │     └── TENANT_STAFF
        │           └── TENANT_DRIVER
        └── TENANT_FINANCE
              (no operational access)

CUSTOMER_ADMIN (scoped to their organisation)
  └── CUSTOMER_USER
```

---

## 6.2 Full Permission Matrix

| Permission | SUPER | T_ADMIN | T_MANAGER | T_FINANCE | T_STAFF | T_DRIVER | C_ADMIN | C_USER |
|------------|-------|---------|-----------|-----------|---------|----------|---------|--------|
| View all tenants | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Impersonate tenant | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create shipment | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Edit any shipment | ✅ | ✅ | ✅ | ❌ | own | ❌ | own | own |
| Update status | ✅ | ✅ | ✅ | ❌ | ✅ | assigned | ❌ | ❌ |
| Assign driver | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View all shipments | ✅ | ✅ | ✅ | ✅ | ✅ | assigned | own org | own |
| Create invoice | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View invoices | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | own org | own |
| View P&L / financials | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage staff | ✅ | ✅ | limited | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage branding | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | own | ❌ |
| View analytics | ✅ | ✅ | ✅ | ✅ | limited | ❌ | own org | ❌ |
| Manage API keys | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Capture POD | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| View audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 6.3 Customer Organisation Model

Logistics is B2B — customers are companies, not just individuals.

```
Organisation (B2B client)
├── billing_owner_id → User (pays the invoices)
├── admin_users → [User] (can manage org bookings)
└── regular_users → [User] (can book + track only)
```

This enables: multi-user companies as clients, organisation-level invoicing, Net 30/60 payment terms, consolidated shipment views per organisation.

---

## 6.4 Cross-Branch Visibility (Enterprise)

```
TENANT_ADMIN: sees all branches
TENANT_MANAGER: sees their assigned branch(es)
TENANT_STAFF: sees their branch only
TENANT_FINANCE: sees all branches (financial data only)
```
