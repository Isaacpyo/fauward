from typing import Any

import db


async def create_route_job(
    *,
    job_id: str,
    tenant_id: str,
    vehicle_id: str | None,
    metadata: dict[str, Any],
    idempotency_key: str | None,
) -> None:
    await db.execute(
        """
        insert into route_jobs (id, tenant_id, vehicle_id, status, result, idempotency_key, updated_at)
        values ($1, $2, $3, 'QUEUED', $4::jsonb, $5, now())
        """,
        job_id,
        tenant_id,
        vehicle_id,
        db.json_dumps(metadata),
        idempotency_key,
    )


async def get_route_job_for_tenant(job_id: str, tenant_id: str | None = None) -> dict[str, Any] | None:
    if tenant_id is None:
        row = await db.fetchrow(
            """
            select id, tenant_id, status, ordered_stops, total_distance_m,
                   estimated_duration_s, error_message, updated_at
            from route_jobs
            where id = $1
            """,
            job_id,
        )
    else:
        row = await db.fetchrow(
            """
            select id, tenant_id, status, ordered_stops, total_distance_m,
                   estimated_duration_s, error_message, updated_at
            from route_jobs
            where id = $1 and tenant_id = $2
            """,
            job_id,
            tenant_id,
        )
    return dict(row) if row else None


async def mark_route_job_failed(job_id: str, tenant_id: str, error_message: str) -> None:
    await db.execute(
        "update route_jobs set status = 'FAILED', error_message = $3, updated_at = now() where id = $1 and tenant_id = $2",
        job_id,
        tenant_id,
        error_message[:4000],
    )
