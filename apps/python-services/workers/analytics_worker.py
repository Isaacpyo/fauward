import asyncio
import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import redis.asyncio as aioredis

import db
from celery_app import celery_app


def _float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


async def _run_nightly_rollup() -> dict[str, int]:
    target_date = datetime.now(UTC).date() - timedelta(days=1)
    start = datetime.combine(target_date, datetime.min.time(), tzinfo=UTC)
    end = start + timedelta(days=1)
    rows = await db.fetch(
        """
        select
          s."tenantId" as tenant_id,
          count(*)::int as shipments_total,
          count(*) filter (where s.status = 'DELIVERED')::int as shipments_delivered,
          count(*) filter (where s.status in ('FAILED_DELIVERY', 'CANCELLED', 'EXCEPTION'))::int as shipments_failed,
          count(*) filter (
            where s.status = 'DELIVERED'
              and s."actualDelivery" is not null
              and s."estimatedDelivery" is not null
              and s."actualDelivery" <= s."estimatedDelivery"
          )::int as on_time_count,
          coalesce(sum(s.price), 0) as revenue_total,
          coalesce(avg(s.price), 0) as revenue_average_per_shipment,
          coalesce(avg(extract(epoch from (s."actualDelivery" - s."createdAt")) / 3600)
            filter (where s."actualDelivery" is not null), 0) as avg_delivery_hours
        from shipments s
        where s."createdAt" >= $1 and s."createdAt" < $2
        group by s."tenantId"
        """,
        start,
        end,
    )
    for row in rows:
        tenant_id = row["tenant_id"]
        new_customers = await db.fetchval(
            """
            select count(*)::int
            from users
            where "tenantId" = $1
              and role in ('CUSTOMER_ADMIN', 'CUSTOMER_USER')
              and "createdAt" >= $2 and "createdAt" < $3
            """,
            tenant_id,
            start,
            end,
        )
        active_drivers = await db.fetchval(
            """
            select count(distinct "assignedDriverId")::int
            from shipments
            where "tenantId" = $1
              and "assignedDriverId" is not null
              and "createdAt" >= $2 and "createdAt" < $3
            """,
            tenant_id,
            start,
            end,
        )
        delivered = int(row["shipments_delivered"] or 0)
        on_time = int(row["on_time_count"] or 0)
        on_time_rate = (on_time / delivered * 100) if delivered else 0.0
        await db.execute(
            """
            insert into analytics_snapshots (
              tenant_id, date, shipments_total, shipments_delivered, shipments_failed,
              on_time_count, on_time_rate, revenue_total, revenue_average_per_shipment,
              avg_delivery_hours, new_customers_count, active_drivers_count, updated_at
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
            on conflict (tenant_id, date) do update
            set shipments_total = excluded.shipments_total,
                shipments_delivered = excluded.shipments_delivered,
                shipments_failed = excluded.shipments_failed,
                on_time_count = excluded.on_time_count,
                on_time_rate = excluded.on_time_rate,
                revenue_total = excluded.revenue_total,
                revenue_average_per_shipment = excluded.revenue_average_per_shipment,
                avg_delivery_hours = excluded.avg_delivery_hours,
                new_customers_count = excluded.new_customers_count,
                active_drivers_count = excluded.active_drivers_count,
                updated_at = now()
            """,
            tenant_id,
            target_date,
            row["shipments_total"],
            delivered,
            row["shipments_failed"],
            on_time,
            on_time_rate,
            _float(row["revenue_total"]),
            _float(row["revenue_average_per_shipment"]),
            _float(row["avg_delivery_hours"]),
            new_customers or 0,
            active_drivers or 0,
        )
    return {"snapshots": len(rows)}


async def _run_realtime_kpis() -> dict[str, int]:
    start = datetime.now(UTC) - timedelta(hours=24)
    rows = await db.fetch(
        """
        select
          "tenantId" as tenant_id,
          count(*)::int as shipments_total,
          count(*) filter (where status = 'DELIVERED')::int as shipments_delivered,
          count(*) filter (where status in ('FAILED_DELIVERY', 'EXCEPTION'))::int as shipments_failed,
          coalesce(sum(price), 0) as revenue_total
        from shipments
        where "createdAt" >= $1
        group by "tenantId"
        """,
        start,
    )
    client = aioredis.Redis.from_url(db.settings.redis_url, decode_responses=True)
    try:
        for row in rows:
            payload = {
                "shipmentsTotal": row["shipments_total"],
                "shipmentsDelivered": row["shipments_delivered"],
                "shipmentsFailed": row["shipments_failed"],
                "revenueTotal": _float(row["revenue_total"]),
            }
            await client.setex(f"analytics:kpi:{row['tenant_id']}", 300, json.dumps(payload))
    finally:
        await client.aclose()
    return {"tenants": len(rows)}


async def _run_cohort_analysis() -> dict[str, int]:
    tenants = await db.fetch(
        """
        select id as tenant_id, date_trunc('week', "createdAt")::date as signup_week
        from tenants
        """
    )
    count = 0
    for tenant in tenants:
        metrics: dict[str, int] = {}
        for week in range(1, 13):
            start = tenant["signup_week"] + timedelta(weeks=week - 1)
            end = start + timedelta(weeks=1)
            shipments = await db.fetchval(
                """
                select count(*)::int
                from shipments
                where "tenantId" = $1 and "createdAt" >= $2 and "createdAt" < $3
                """,
                tenant["tenant_id"],
                start,
                end,
            )
            metrics[f"shipments_week_{week}"] = shipments or 0
        await db.execute(
            """
            insert into cohort_metrics (tenant_id, signup_week, metrics, updated_at)
            values ($1, $2, $3::jsonb, now())
            on conflict (tenant_id, signup_week) do update
            set metrics = excluded.metrics, updated_at = now()
            """,
            tenant["tenant_id"],
            tenant["signup_week"],
            db.json_dumps(metrics),
        )
        count += 1
    return {"cohorts": count}


async def _run_churn_signals() -> dict[str, int]:
    if not await db.column_exists("tenants", "churnRisk"):
        await db.execute("""alter table tenants add column if not exists "churnRisk" text""")
    rows = await db.fetch(
        """
        select t.id
        from tenants t
        where exists (
          select 1 from shipments s
          where s."tenantId" = t.id and s."createdAt" >= now() - interval '30 days'
        )
        and not exists (
          select 1 from shipments s
          where s."tenantId" = t.id and s."createdAt" >= now() - interval '14 days'
        )
        """
    )
    if rows:
        await db.executemany(
            """update tenants set "churnRisk" = 'AT_RISK' where id = $1""",
            [(row["id"],) for row in rows],
        )
    return {"atRisk": len(rows)}


@celery_app.task(name="workers.analytics_worker.nightly_rollup", queue="analytics")
def nightly_rollup() -> dict[str, int]:
    async def runner() -> dict[str, int]:
        await db.connect_db()
        return await _run_nightly_rollup()

    return asyncio.run(runner())


@celery_app.task(name="workers.analytics_worker.realtime_kpis", queue="analytics")
def realtime_kpis() -> dict[str, int]:
    async def runner() -> dict[str, int]:
        await db.connect_db()
        return await _run_realtime_kpis()

    return asyncio.run(runner())


@celery_app.task(name="workers.analytics_worker.cohort_analysis", queue="analytics")
def cohort_analysis() -> dict[str, int]:
    async def runner() -> dict[str, int]:
        await db.connect_db()
        return await _run_cohort_analysis()

    return asyncio.run(runner())


@celery_app.task(name="workers.analytics_worker.churn_signals", queue="analytics")
def churn_signals() -> dict[str, int]:
    async def runner() -> dict[str, int]:
        await db.connect_db()
        return await _run_churn_signals()

    return asyncio.run(runner())
