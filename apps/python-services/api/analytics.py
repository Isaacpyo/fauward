from datetime import date, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query

import db
from api.auth import AuthContext, require_bearer_token, require_super_admin

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
async def summary(
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
    tenantId: str = Query(...),
    dateFrom: date | None = Query(default=None),
    dateTo: date | None = Query(default=None),
) -> dict[str, Any]:
    if tenantId != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    end = dateTo or date.today()
    start = dateFrom or (end - timedelta(days=30))
    rows = await db.fetch(
        """
        select date, shipments_total, on_time_rate, revenue_total, avg_delivery_hours
        from analytics_snapshots
        where tenant_id = $1 and date >= $2 and date <= $3
        order by date asc
        """,
        tenantId,
        start,
        end,
    )
    shipments_total = sum(int(row["shipments_total"] or 0) for row in rows)
    revenue_total = sum(float(row["revenue_total"] or 0) for row in rows)
    weighted_on_time = (
        sum(float(row["on_time_rate"] or 0) * int(row["shipments_total"] or 0) for row in rows) / shipments_total
        if shipments_total
        else 0.0
    )
    avg_delivery_hours = (
        sum(float(row["avg_delivery_hours"] or 0) for row in rows) / len(rows)
        if rows
        else 0.0
    )
    return {
        "shipmentsTotal": shipments_total,
        "onTimeRate": round(weighted_on_time, 2),
        "revenueTotal": round(revenue_total, 2),
        "avgDeliveryHours": round(avg_delivery_hours, 2),
        "dailySeries": [
            {
                "date": row["date"].isoformat(),
                "shipments": row["shipments_total"],
                "revenue": float(row["revenue_total"] or 0),
            }
            for row in rows
        ],
    }


@router.get("/cohorts")
async def cohorts(
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
    tenantId: str = Query(...),
) -> dict[str, Any]:
    if tenantId != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    rows = await db.fetch(
        """
        select signup_week, metrics
        from cohort_metrics
        where tenant_id = $1
        order by signup_week desc
        """,
        tenantId,
    )
    return {
        "tenantId": tenantId,
        "cohorts": [{"signupWeek": row["signup_week"].isoformat(), **dict(row["metrics"])} for row in rows],
    }


@router.get("/churn-risk")
async def churn_risk(_: Annotated[AuthContext, Depends(require_super_admin)]) -> dict[str, Any]:
    if not await db.column_exists("tenants", "churnRisk"):
        return {"tenants": []}
    rows = await db.fetch(
        """
        select id, name, slug, "churnRisk"
        from tenants
        where "churnRisk" = 'AT_RISK'
        order by name asc
        """
    )
    return {"tenants": [dict(row) for row in rows]}
