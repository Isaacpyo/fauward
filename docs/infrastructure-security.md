# Infrastructure & Security

> Performance targets · Scale assumptions · Scaling strategy · Caching · Backup & DR · Security architecture

**Navigation →** [System Architecture](./system-architecture.md) · [API Design](./api.md) · [← README](../README.md)

---

## Contents

1. [Performance Targets](#1-performance-targets)
2. [Scale Assumptions](#2-scale-assumptions)
3. [Scaling Strategy](#3-scaling-strategy)
4. [Caching (Redis)](#4-caching-redis)
5. [Backup & Disaster Recovery](#5-backup--disaster-recovery)
6. [Authentication Security](#6-authentication-security)
7. [API Security](#7-api-security)
8. [Operational Security](#8-operational-security)

---

## 1. Performance Targets

| Metric | Target |
|--------|--------|
| API p50 latency | < 100 ms |
| API p95 latency | < 250 ms |
| API p99 latency | < 500 ms |
| WebSocket status update | < 2 s |
| PDF generation | < 3 s |
| Page load (LCP) | < 2.5 s |
| Uptime — Starter / Pro | 99.5% |
| Uptime — Enterprise | **99.9%** |

---

## 2. Scale Assumptions

| Metric | Year 1 | Year 2 |
|--------|-------:|-------:|
| Active tenants | 150 | 350 |
| Concurrent API requests | 500 | 2,000 |
| Concurrent WebSocket connections | 1,000 | 5,000 |
| Shipments per day (all tenants) | 5,000 | 25,000 |
| DB rows — shipments table | 2 M | 10 M |

---

## 3. Scaling Strategy

| Phase | Scale | Architecture |
|-------|-------|-------------|
| **Phase 1** | 0–5 K users | Modular monolith · 2–4 ECS tasks · Single PostgreSQL + read replica |
| **Phase 2** | 5 K–50 K users | Extract Tracking + Notification services · Shared auth via JWT |
| **Phase 3** | 50 K+ users | Event-driven (Kafka / SNS+SQS) · Per-service databases · API gateway + service mesh |

---

## 4. Caching (Redis)

| Data | TTL | Key pattern |
|------|-----|------------|
| User sessions | 7 d | `session:{userId}` |
| Shipment status | 30 s | `shipment:{id}:status` |
| Pricing zone matrix | 24 h | `zones:{tenantId}` |
| Analytics aggregates | 5 min | `analytics:{tenantId}:{metric}` |
| Rate limiting counters | 1 min sliding window | `rl:{identifier}:{route}` |
| Driver location | 5 min | `driver:{driverId}:location` |

---

## 5. Backup & Disaster Recovery

| Parameter | Value |
|-----------|-------|
| Backup method | Continuous WAL streaming + daily snapshots |
| PITR — Starter / Pro | 7 days |
| PITR — Enterprise | 35 days |
| RPO | < 5 minutes |
| RTO | < 1 hour |
| Cross-region replication | S3: London → Frankfurt |
| DR drill frequency | Quarterly |

---

## 6. Authentication Security

| Control | Implementation |
|---------|---------------|
| Password hashing | bcrypt, cost factor **12** |
| JWT access token | RS256, **15-minute expiry** |
| Refresh token | 7-day expiry · hashed in DB · **rotated on every use** |
| MFA | TOTP via authenticator app + backup codes |
| SSO *(Enterprise)* | SAML 2.0 / OIDC · JIT provisioning |
| Suspicious login | New IP + new device → email verification required |
| IP allowlisting *(Enterprise)* | Admin restricts API access to configured IP ranges |

---

## 7. API Security

| Control | Implementation |
|---------|---------------|
| API key scopes | `read:shipments`, `write:shipments`, `read:invoices`, etc. |
| Rate limiting | 100 req/min (general) · 10 req/min (auth) · 500 req/hr (API keys) |
| Key storage | bcrypt-hashed · **shown only once** at creation |
| Document URLs | Signed S3 URLs · **1-hour expiry** |
| File uploads | ClamAV malware scan on all uploads |
| Input validation | Zod schemas on **all** inputs — no exceptions |
| SQL injection | Prisma ORM only — **zero raw queries** permitted |

---

## 8. Operational Security

| Control | Implementation |
|---------|---------------|
| Impersonation | Audit-logged · **30-minute maximum** session |
| JWT key rotation | JWT signing secrets rotated quarterly |
| API key rotation | User-rotatable on demand |
| Webhook security | HMAC-SHA256 signature on every delivery |
| Secrets management | AWS Secrets Manager — **nothing in code or env files in production** |
| Dependency scanning | Dependabot + `npm audit` in every CI run |
| Penetration testing | Annual third-party assessment |

---

*Part of the [Fauward documentation](../README.md)*
