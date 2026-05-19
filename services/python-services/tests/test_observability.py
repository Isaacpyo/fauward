"""Tests for the Python observability module."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from observability.health_checks import (
    check_http_service,
    check_postgres_connection,
    check_redis_connection,
    check_version_endpoint,
)
from observability.queue_monitor import _classify_queue, THRESHOLDS
from observability.schemas import ServiceStatus
from observability.worker_monitor import check_worker_status, HEARTBEAT_UP_SECONDS, HEARTBEAT_DEGRADED_SECONDS
from observability.env_validator import validate_observability_env
from observability.business_health import get_business_health_metrics
from observability.integrations import detect_integrations


# ── Health Checks ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_url_returns_not_configured():
    result = await check_http_service(None, "my-service", "local")
    assert result.status == ServiceStatus.not_configured


@pytest.mark.asyncio
async def test_missing_redis_url_returns_not_configured():
    result = await check_redis_connection(None, "redis", "local")
    assert result.status == ServiceStatus.not_configured


@pytest.mark.asyncio
async def test_missing_postgres_url_returns_not_configured():
    result = await check_postgres_connection(None, "postgres", "local")
    assert result.status == ServiceStatus.not_configured


@pytest.mark.asyncio
async def test_404_response_returns_down():
    import httpx
    mock_resp = MagicMock()
    mock_resp.status_code = 404

    async def _mock_get(*args, **kwargs):
        return mock_resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("observability.health_checks.httpx.AsyncClient", return_value=mock_client):
        result = await check_http_service("http://localhost:9999", "svc", "local")

    assert result.status == ServiceStatus.down


@pytest.mark.asyncio
async def test_200_response_returns_up():
    import httpx
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("observability.health_checks.httpx.AsyncClient", return_value=mock_client):
        result = await check_http_service("http://localhost:9999", "svc", "local")

    assert result.status in (ServiceStatus.up, ServiceStatus.degraded)


@pytest.mark.asyncio
async def test_version_endpoint_failure_does_not_mark_service_down():
    """A failed /version call must return a dict with version='unavailable', not raise."""
    import httpx

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(side_effect=Exception("connection refused"))

    with patch("observability.health_checks.httpx.AsyncClient", return_value=mock_client):
        result = await check_version_endpoint("http://localhost:9999", "svc", "local")

    assert result == {"version": "unavailable"}


# ── Queue classification ───────────────────────────────────────────────────────

def test_queue_depth_below_warning_is_up():
    status = _classify_queue(depth=10, oldest_age=100, failed=0, dead=0)
    assert status == ServiceStatus.up


def test_queue_depth_above_warning_is_degraded():
    status = _classify_queue(
        depth=THRESHOLDS["queue_depth_warning"] + 1,
        oldest_age=None,
        failed=0,
        dead=0,
    )
    assert status == ServiceStatus.degraded


def test_queue_depth_above_critical_is_down():
    status = _classify_queue(
        depth=THRESHOLDS["queue_depth_critical"] + 1,
        oldest_age=None,
        failed=0,
        dead=0,
    )
    assert status == ServiceStatus.down


def test_oldest_job_age_above_warning_is_degraded():
    status = _classify_queue(
        depth=0,
        oldest_age=THRESHOLDS["oldest_job_warning_seconds"] + 1,
        failed=0,
        dead=0,
    )
    assert status == ServiceStatus.degraded


def test_failed_jobs_above_warning_is_degraded():
    status = _classify_queue(
        depth=0,
        oldest_age=None,
        failed=THRESHOLDS["failed_jobs_warning"] + 1,
        dead=0,
    )
    assert status == ServiceStatus.degraded


def test_failed_jobs_above_critical_is_down():
    status = _classify_queue(
        depth=0,
        oldest_age=None,
        failed=THRESHOLDS["failed_jobs_critical"] + 1,
        dead=0,
    )
    assert status == ServiceStatus.down


# ── Worker Heartbeat ───────────────────────────────────────────────────────────

def _mock_redis_get(value: str | None):
    """Return a mock redis client whose .get() returns the given value."""
    client = MagicMock()
    client.get = MagicMock(return_value=value)
    return client


def test_worker_heartbeat_fresh_is_up():
    fresh_ts = datetime.now(UTC).isoformat()
    with patch("observability.worker_monitor._get_redis_client", return_value=_mock_redis_get(fresh_ts)):
        with patch("observability.worker_monitor._get_prometheus_counter", return_value=None):
            status = check_worker_status("ocr_worker")
    assert status.status == ServiceStatus.up


def test_worker_heartbeat_stale_over_warning_is_degraded():
    stale_ts = (datetime.now(UTC) - timedelta(seconds=HEARTBEAT_UP_SECONDS + 10)).isoformat()
    with patch("observability.worker_monitor._get_redis_client", return_value=_mock_redis_get(stale_ts)):
        with patch("observability.worker_monitor._get_prometheus_counter", return_value=None):
            status = check_worker_status("ocr_worker")
    assert status.status == ServiceStatus.degraded


def test_worker_heartbeat_stale_over_critical_is_down():
    old_ts = (datetime.now(UTC) - timedelta(seconds=HEARTBEAT_DEGRADED_SECONDS + 10)).isoformat()
    with patch("observability.worker_monitor._get_redis_client", return_value=_mock_redis_get(old_ts)):
        with patch("observability.worker_monitor._get_prometheus_counter", return_value=None):
            status = check_worker_status("ocr_worker")
    assert status.status == ServiceStatus.down


def test_worker_no_heartbeat_no_prometheus_is_not_configured():
    with patch("observability.worker_monitor._get_redis_client", return_value=_mock_redis_get(None)):
        with patch("observability.worker_monitor._get_prometheus_counter", return_value=None):
            status = check_worker_status("pdf_worker")
    assert status.status == ServiceStatus.not_configured


# ── Env Validator ──────────────────────────────────────────────────────────────

def test_env_validator_never_exposes_values():
    """Validate that no actual env var values appear in the output."""
    import os
    os.environ["DATABASE_URL"] = "postgresql://secret_user:secret_pass@localhost/db"
    warnings = validate_observability_env()
    os.environ.pop("DATABASE_URL", None)
    for w in warnings:
        # The ConfigWarning schema has no 'value' field — just status
        assert not hasattr(w, "value")
        assert "secret" not in str(w.model_dump())


def test_missing_required_env_is_missing():
    import os
    os.environ.pop("DATABASE_URL", None)
    warnings = validate_observability_env()
    db_warn = next((w for w in warnings if w.name == "DATABASE_URL"), None)
    assert db_warn is not None
    assert db_warn.status.value == "missing"
    assert db_warn.required is True


def test_present_env_is_configured():
    import os
    os.environ["DATABASE_URL"] = "postgresql://host/db"
    warnings = validate_observability_env()
    os.environ.pop("DATABASE_URL", None)
    db_warn = next((w for w in warnings if w.name == "DATABASE_URL"), None)
    assert db_warn is not None
    assert db_warn.status.value == "configured"


# ── Business Health ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_business_health_unavailable_when_no_backend_url():
    import os
    os.environ.pop("BACKEND_URL", None)
    result = await get_business_health_metrics()
    assert result.source == "unavailable"
    # No invented values
    assert result.active_tenants is None
    assert result.shipments_created_today is None


@pytest.mark.asyncio
async def test_business_health_unavailable_when_backend_down():
    import os
    os.environ["BACKEND_URL"] = "http://localhost:9999"
    result = await get_business_health_metrics()
    os.environ.pop("BACKEND_URL", None)
    assert result.source == "unavailable"


# ── Integrations ───────────────────────────────────────────────────────────────

def test_integrations_not_configured_when_env_missing():
    import os
    for key in ["PROMETHEUS_URL", "GRAFANA_URL", "SENTRY_DSN", "FLOWER_URL", "LOKI_URL"]:
        os.environ.pop(key, None)
    result = detect_integrations()
    for name, status in result.items():
        assert status == "not_configured"


def test_integrations_configured_when_env_set():
    import os
    os.environ["PROMETHEUS_URL"] = "http://prometheus:9090"
    result = detect_integrations()
    os.environ.pop("PROMETHEUS_URL", None)
    assert result["prometheus"] == "configured"
