# SOC 2 Control Mapping

Status: implementation scaffolded for Fauward Console Phase 4.

| Trust Service Criteria | Fauward control coverage |
|---|---|
| CC6.1 Logical access | Employee IAM, Just-in-Time Access, active staff session inventory, and security monitoring. |
| CC6.6 Encryption and secret protection | Doppler-backed secret inventory with expiry tracking; no secret values stored in Fauward DB. |
| CC7.2 Anomaly detection | Security anomaly queue, failed-login monitoring, IP blocks, and scheduled anomaly scan. |
| CC7.3 Incident response | PagerDuty incident integration, tenant-impact mapping, runbooks, and postmortem links. |
| CC8.1 Change management | LaunchDarkly feature flag integration, release view, and Fauward audit entries for tenant overrides. |
| P1.1 Privacy notice | Existing tenant-facing privacy surfaces; compliance operations links DSAR requests to tenant records. |
| P4.2 Data retention | Legal hold model and delete guard block tenant-scoped destructive operations while holds are active. |
| P5.1 Data subject rights | DSAR workflow, state transitions, data gathering jobs, delivery URLs, and export audit entries. |
