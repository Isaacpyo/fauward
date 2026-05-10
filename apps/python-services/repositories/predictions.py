from typing import Any

import db


async def get_prediction(*, entity_type: str, entity_id: str, model_name: str, tenant_id: str | None, global_only: bool = False) -> dict[str, Any] | None:
    if global_only:
        row = await db.fetchrow(
            """
            select tenant_id, entity_type, entity_id, model_name, score, label, payload, created_at, updated_at
            from prediction_results
            where tenant_id is null and entity_type = $1 and entity_id = $2 and model_name = $3
            order by updated_at desc
            limit 1
            """,
            entity_type,
            entity_id,
            model_name,
        )
    elif tenant_id is None:
        row = await db.fetchrow(
            """
            select tenant_id, entity_type, entity_id, model_name, score, label, payload, created_at, updated_at
            from prediction_results
            where entity_type = $1 and entity_id = $2 and model_name = $3
            order by updated_at desc
            limit 1
            """,
            entity_type,
            entity_id,
            model_name,
        )
    else:
        row = await db.fetchrow(
            """
            select tenant_id, entity_type, entity_id, model_name, score, label, payload, created_at, updated_at
            from prediction_results
            where entity_type = $1 and entity_id = $2 and model_name = $3 and tenant_id = $4
            order by updated_at desc
            limit 1
            """,
            entity_type,
            entity_id,
            model_name,
            tenant_id,
        )
    return dict(row) if row else None


async def list_predictions_for_tenant(*, tenant_id: str, limit: int, offset: int) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in await db.fetch(
            """
            select entity_type, entity_id, model_name, score, label, payload, created_at, updated_at
            from prediction_results
            where tenant_id = $1
            order by updated_at desc
            limit $2 offset $3
            """,
            tenant_id,
            limit,
            offset,
        )
    ]


async def list_lead_scores(*, tenant_id: str | None, limit: int, offset: int) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in await db.fetch(
            """
            select pr.entity_id, pr.tenant_id, pr.score, pr.label, pr.payload, l.company, l.email
            from prediction_results pr
            left join leads l on l.id = pr.entity_id and l."tenantId" = pr.tenant_id
            where pr.entity_type = 'lead'
              and pr.model_name = 'lead_score'
              and ($1::text is null or pr.tenant_id = $1)
            order by pr.score desc
            limit $2 offset $3
            """,
            tenant_id,
            limit,
            offset,
        )
    ]
