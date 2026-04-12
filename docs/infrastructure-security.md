# Fauward — Infrastructure & Security

> **Sections:** Performance Targets · Scale Assumptions · Scaling Strategy · Caching · Backup & DR · Security Architecture

---

## 16. Infrastructure & Non-Functional Requirements

### Performance Targets

| Metric | Target |
|--------|--------|
| API p50 | < 100ms |
| API p95 | < 250ms |
| API p99 | < 500ms |
| WebSocket latency | < 2 seconds |
| PDF generation | < 3 seconds |
| Page load (LCP) | < 2.5 seconds |
| Uptime (Starter/Pro) | 99.5% |
| Uptime (Enterprise) | 99.9% |

### Scale Assumptions

| Metric | Year 1 | Year 2 |
|--------|--------|--------|
| Active tenants | 150 | 350 |
| Concurrent API requests | 500 | 2,000 |
| Concurrent WebSocket connections | 1,000 | 5,000 |
| Shipments per day (all tenants) | 5,000 | 25,000 |
| DB rows (shipments) | 2M | 10M |

### Scaling Strategy

**Phase 1 (0–5K users):** Modular monolith, 2–4 ECS tasks, single PostgreSQL + read replica.
**Phase 2 (5K–50K users):** Extract Tracking + Notification services. Shared auth via JWT.
**Phase 3 (50K+ users):** Event-driven (Kafka/SNS+SQS), per-service databases, API gateway + service mesh.

### Caching (Redis)

User sessions (TTL 7d), shipment status (TTL 30s), pricing zone matrix (TTL 24h), analytics aggregates (TTL 5min), rate limiting counters (TTL 1min sliding window).

### Backup & DR

| Parameter | Value |
|-----------|-------|
| Backup | Continuous WAL + daily snapshots |
| PITR | 7 days (Starter/Pro), 35 days (Enterprise) |
| RPO | < 5 minutes |
| RTO | < 1 hour |
| Cross-region | S3 replication London → Frankfurt |
| DR drill | Quarterly |

---

## 17. Security Architecture

### Authentication

| Control | Implementation |
|---------|---------------|
| Password hashing | bcrypt, cost factor 12 |
| JWT access token | 15 min expiry, RS256 |
| Refresh token | 7 days, hashed in DB, rotated on use |
| MFA | TOTP via authenticator app, backup codes |
| SSO (Enterprise) | SAML 2.0 / OIDC, JIT provisioning |
| Suspicious login | New IP + new device → email verification |
| IP allowlisting (Enterprise) | Admin restricts API to IP ranges |

### API Security

| Control | Implementation |
|---------|---------------|
| API key scopes | `read:shipments`, `write:shipments`, `read:invoices`, etc. |
| Rate limiting | 100 req/min (general), 10/min (auth), 500/hr (API keys) |
| Key storage | bcrypt hashed, show-once |
| Document URLs | Signed S3, 1-hour expiry |
| Malware scanning | ClamAV on uploads |
| Input validation | Zod schemas on all inputs |
| SQL injection | Prisma ORM only — zero raw queries |

### Operational Security

| Control | Implementation |
|---------|---------------|
| Impersonation | Audit logged, 30-minute max |
| Key rotation | JWT secrets quarterly, API keys user-rotatable |
| Webhook security | HMAC-SHA256 signature verification |
| Secrets | AWS Secrets Manager — nothing in code |
| Dependency scanning | Dependabot + npm audit in CI |
| Pen testing | Annual third-party |
