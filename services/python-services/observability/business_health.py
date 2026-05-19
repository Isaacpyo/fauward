from __future__ import annotations

import os
from datetime import UTC, datetime

import httpx

from observability.schemas import BusinessHealthMetrics


async def get_business_health_metrics() -> BusinessHealthMetrics:
    """
    Proxies to the Node.js backend /api/internal/metrics/business-health.
    Falls back to source='unavailable' — never invents production values.
    """
    backend_url = os.getenv("BACKEND_URL", "").rstrip("/")
    api_key = os.getenv("MONITORING_API_KEY", "")

    if not backend_url:
        return BusinessHealthMetrics(
            last_checked_at=datetime.now(UTC),
            source="unavailable",
        )

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                f"{backend_url}/api/internal/metrics/business-health",
                headers=headers,
            )

        if not resp.is_success:
            return BusinessHealthMetrics(
                last_checked_at=datetime.now(UTC),
                source="unavailable",
            )

        data = resp.json()
        return BusinessHealthMetrics(
            active_tenants=data.get("activeTenants"),
            suspended_tenants=data.get("suspendedTenants"),
            trialing_tenants=data.get("trialingTenants"),
            shipments_created_today=data.get("shipmentsCreatedToday"),
            shipments_in_transit=data.get("shipmentsInTransit"),
            stuck_shipments=data.get("stuckShipments"),
            last_checked_at=datetime.now(UTC),
            source="real",
        )
    except Exception:
        return BusinessHealthMetrics(
            last_checked_at=datetime.now(UTC),
            source="unavailable",
        )
