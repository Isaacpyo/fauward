from __future__ import annotations

import asyncio
import socket
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from observability.schemas import ServiceCheckResult, ServiceStatus

TIMEOUT_MS = 5000
DEGRADED_LATENCY_MS = 1000

# Services to probe and their URL env-var names (looked up from config at call time)
HEALTH_PATHS = ["/live", "/ready", "/health"]
VERSION_PATH = "/version"


def _not_configured(service_id: str, env: str) -> ServiceCheckResult:
    return ServiceCheckResult(
        service_id=service_id,
        environment=env,
        status=ServiceStatus.not_configured,
        message="No URL configured for this service/environment",
    )


async def check_http_service(
    url: str | None,
    service_id: str,
    env: str,
    timeout_ms: int = TIMEOUT_MS,
) -> ServiceCheckResult:
    if not url:
        return _not_configured(service_id, env)

    timeout = timeout_ms / 1000
    start = time.monotonic()

    # Try health paths in order; fall back to root
    probe_paths = HEALTH_PATHS + ["/"]
    last_status_code: int | None = None
    last_error: str | None = None

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for path in probe_paths:
            try:
                resp = await client.get(f"{url.rstrip('/')}{path}")
                elapsed_ms = int((time.monotonic() - start) * 1000)
                last_status_code = resp.status_code

                if resp.status_code < 400:
                    status = (
                        ServiceStatus.degraded
                        if elapsed_ms > DEGRADED_LATENCY_MS
                        else ServiceStatus.up
                    )
                    return ServiceCheckResult(
                        service_id=service_id,
                        environment=env,
                        status=status,
                        response_time_ms=elapsed_ms,
                        status_code=resp.status_code,
                        message="OK" if status == ServiceStatus.up else f"Slow response: {elapsed_ms}ms",
                        last_checked_at=datetime.now(UTC),
                    )

                # 4xx/5xx — try next path
                last_error = f"HTTP {resp.status_code}"
            except httpx.TimeoutException:
                elapsed_ms = int((time.monotonic() - start) * 1000)
                return ServiceCheckResult(
                    service_id=service_id,
                    environment=env,
                    status=ServiceStatus.down,
                    response_time_ms=elapsed_ms,
                    message=f"Timeout after {elapsed_ms}ms",
                    last_checked_at=datetime.now(UTC),
                )
            except Exception as exc:
                last_error = str(exc)
                break

    elapsed_ms = int((time.monotonic() - start) * 1000)
    return ServiceCheckResult(
        service_id=service_id,
        environment=env,
        status=ServiceStatus.down,
        response_time_ms=elapsed_ms,
        status_code=last_status_code,
        message=last_error or "All health paths failed",
        last_checked_at=datetime.now(UTC),
    )


async def check_tcp_service(
    host: str | None,
    port: int,
    service_id: str,
    env: str,
    timeout_ms: int = TIMEOUT_MS,
) -> ServiceCheckResult:
    if not host:
        return _not_configured(service_id, env)

    start = time.monotonic()
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=timeout_ms / 1000,
        )
        writer.close()
        await writer.wait_closed()
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.up,
            response_time_ms=elapsed_ms,
            message=f"TCP {host}:{port} reachable",
            last_checked_at=datetime.now(UTC),
        )
    except asyncio.TimeoutError:
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.down,
            message=f"TCP timeout connecting to {host}:{port}",
            last_checked_at=datetime.now(UTC),
        )
    except Exception as exc:
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.down,
            message=str(exc),
            last_checked_at=datetime.now(UTC),
        )


async def check_postgres_connection(
    dsn: str | None,
    service_id: str,
    env: str,
) -> ServiceCheckResult:
    if not dsn:
        return _not_configured(service_id, env)

    start = time.monotonic()
    try:
        import asyncpg

        conn = await asyncio.wait_for(asyncpg.connect(dsn), timeout=5)
        await conn.fetchval("SELECT 1")
        await conn.close()
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.up,
            response_time_ms=elapsed_ms,
            message="Postgres connection OK",
            last_checked_at=datetime.now(UTC),
        )
    except Exception as exc:
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.down,
            message=str(exc)[:200],
            last_checked_at=datetime.now(UTC),
        )


async def check_redis_connection(
    url: str | None,
    service_id: str,
    env: str,
) -> ServiceCheckResult:
    if not url:
        return _not_configured(service_id, env)

    start = time.monotonic()
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(url, decode_responses=True, socket_timeout=5)
        await client.ping()
        await client.aclose()
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.up,
            response_time_ms=elapsed_ms,
            message="Redis PING OK",
            last_checked_at=datetime.now(UTC),
        )
    except Exception as exc:
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.down,
            message=str(exc)[:200],
            last_checked_at=datetime.now(UTC),
        )


async def check_smtp_connection(
    host: str | None,
    port: int,
    service_id: str,
    env: str,
) -> ServiceCheckResult:
    if not host:
        return _not_configured(service_id, env)

    start = time.monotonic()
    try:
        import smtplib

        def _smtp_check() -> None:
            with smtplib.SMTP(host, port, timeout=5) as smtp:
                smtp.ehlo()

        await asyncio.to_thread(_smtp_check)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.up,
            response_time_ms=elapsed_ms,
            message=f"SMTP {host}:{port} EHLO OK",
            last_checked_at=datetime.now(UTC),
        )
    except Exception as exc:
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.down,
            message=str(exc)[:200],
            last_checked_at=datetime.now(UTC),
        )


async def check_version_endpoint(
    base_url: str | None,
    service_id: str,
    env: str,
) -> dict[str, Any] | None:
    """Fetch /version — never marks the service as down on failure."""
    if not base_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{base_url.rstrip('/')}/version")
            if resp.status_code < 400:
                try:
                    return resp.json()
                except Exception:
                    return {"raw": resp.text[:200]}
    except Exception:
        pass
    return {"version": "unavailable"}


async def check_dns_resolution(hostname: str, service_id: str, env: str) -> ServiceCheckResult:
    if not hostname:
        return _not_configured(service_id, env)
    start = time.monotonic()
    try:
        await asyncio.to_thread(socket.getaddrinfo, hostname, None)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.up,
            response_time_ms=elapsed_ms,
            message=f"DNS resolved {hostname}",
            last_checked_at=datetime.now(UTC),
        )
    except Exception as exc:
        return ServiceCheckResult(
            service_id=service_id,
            environment=env,
            status=ServiceStatus.down,
            message=str(exc)[:200],
            last_checked_at=datetime.now(UTC),
        )
