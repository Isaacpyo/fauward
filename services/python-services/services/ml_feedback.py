from typing import Any
from uuid import uuid4

import db
from api.auth import AuthContext
from models.ml_schemas import FeedbackRequest
from services.ml_predictions import require_tenant_scope


async def record_feedback(payload: FeedbackRequest, auth: AuthContext) -> None:
    require_tenant_scope(auth, payload.tenantId)
    await db.execute(
        """
        insert into ml_prediction_feedback (
          id, tenant_id, entity_type, entity_id, model_name,
          prediction_was_correct, actual_label, actual_value, notes, created_by, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, now())
        """,
        str(uuid4()),
        payload.tenantId,
        payload.entityType,
        payload.entityId,
        payload.modelName,
        payload.predictionWasCorrect,
        payload.actualLabel,
        db.json_dumps(payload.actualValue),
        payload.notes,
        None,
    )


def feedback_row(
    *,
    tenant_id: str,
    entity_type: str,
    entity_id: str,
    model_name: str,
    prediction_was_correct: bool,
    actual_label: str | None = None,
    actual_value: Any = None,
    notes: str | None = None,
) -> FeedbackRequest:
    return FeedbackRequest(
        tenantId=tenant_id,
        entityType=entity_type,
        entityId=entity_id,
        modelName=model_name,
        predictionWasCorrect=prediction_was_correct,
        actualLabel=actual_label,
        actualValue=actual_value,
        notes=notes,
    )
