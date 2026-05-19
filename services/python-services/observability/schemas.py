from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ServiceStatus(str, Enum):
    up = "up"
    degraded = "degraded"
    down = "down"
    unknown = "unknown"
    not_configured = "not_configured"
    maintenance = "maintenance"


class ConfigWarningStatus(str, Enum):
    configured = "configured"
    missing = "missing"
    optional_missing = "optional_missing"
    invalid = "invalid"


class AlertChannel(str, Enum):
    email = "email"
    slack = "slack"
    discord = "discord"
    webhook = "webhook"
    none = "none"


class AlertStatus(str, Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"
    muted = "muted"
    snoozed = "snoozed"


class IncidentSeverity(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class IncidentStatus(str, Enum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"


# ── Service health ─────────────────────────────────────────────────────────────

class ServiceCheckResult(BaseModel):
    service_id: str
    environment: str
    status: ServiceStatus
    response_time_ms: int | None = None
    status_code: int | None = None
    message: str = "OK"
    last_checked_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


# ── Queue health ───────────────────────────────────────────────────────────────

class QueueHealth(BaseModel):
    queue_name: str
    environment: str
    status: ServiceStatus
    depth: int = 0
    oldest_job_age_seconds: int | None = None
    failed_jobs: int = 0
    retry_jobs: int = 0
    dead_letter_count: int = 0
    worker_assigned: str | None = None
    last_checked_at: datetime = Field(default_factory=datetime.utcnow)


# ── Worker health ──────────────────────────────────────────────────────────────

class WorkerStatus(BaseModel):
    worker_name: str
    environment: str
    status: ServiceStatus
    last_heartbeat: datetime | None = None
    heartbeat_age_seconds: int | None = None
    last_job_processed: datetime | None = None
    jobs_processed_today: int = 0
    failed_jobs: int = 0
    current_queue: str | None = None
    last_checked_at: datetime = Field(default_factory=datetime.utcnow)


# ── Incidents ──────────────────────────────────────────────────────────────────

class IncidentAuditEntry(BaseModel):
    ts: str
    action: str
    by: str
    note: str | None = None


class IncidentRecord(BaseModel):
    id: str
    service_id: str
    service_name: str
    environment: str
    title: str
    severity: IncidentSeverity
    status: IncidentStatus
    message: str | None = None
    affected_workflows: list[str] = Field(default_factory=list)
    acknowledged_by: str | None = None
    acknowledged_at: datetime | None = None
    resolution_notes: str | None = None
    started_at: datetime
    resolved_at: datetime | None = None
    duration_seconds: int | None = None
    audit: list[IncidentAuditEntry] = Field(default_factory=list)


class AcknowledgeRequest(BaseModel):
    acknowledged_by: str = "ops"
    note: str | None = None


class ResolveRequest(BaseModel):
    resolved_by: str = "ops"
    notes: str | None = None


# ── Alerts ─────────────────────────────────────────────────────────────────────

class AlertEvent(BaseModel):
    id: str
    service_id: str
    environment: str
    severity: IncidentSeverity
    channel: AlertChannel = AlertChannel.none
    status: AlertStatus = AlertStatus.pending
    message: str
    created_at: datetime
    sent_at: datetime | None = None


# ── Audit trail ────────────────────────────────────────────────────────────────

class AuditEvent(BaseModel):
    id: str
    action: str
    service_id: str | None = None
    environment: str | None = None
    actor_id: str = "local-dev-user"
    actor_email: str | None = None
    reason: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime


# ── Business health ────────────────────────────────────────────────────────────

class BusinessHealthMetrics(BaseModel):
    active_tenants: int | None = None
    suspended_tenants: int | None = None
    trialing_tenants: int | None = None
    failed_billing_tenants: int | None = None
    shipments_created_today: int | None = None
    shipments_in_transit: int | None = None
    stuck_shipments: int | None = None
    delayed_shipments: int | None = None
    sla_breaches_today: int | None = None
    failed_notifications: int | None = None
    failed_tracking_updates: int | None = None
    failed_payment_events: int | None = None
    last_checked_at: datetime = Field(default_factory=datetime.utcnow)
    source: str = "unavailable"  # "real" | "mock" | "unavailable"


# ── Config warnings ────────────────────────────────────────────────────────────

class ConfigWarning(BaseModel):
    name: str
    status: ConfigWarningStatus
    required: bool
    category: str
    environment: str = "local"


# ── Summary ────────────────────────────────────────────────────────────────────

class ObservabilitySummary(BaseModel):
    overall_status: ServiceStatus
    services_up: int = 0
    services_degraded: int = 0
    services_down: int = 0
    services_not_configured: int = 0
    active_incidents: int = 0
    queues_degraded: int = 0
    workers_down: int = 0
    config_warnings: int = 0
    checked_at: datetime = Field(default_factory=datetime.utcnow)
    dev_mode: bool = False
