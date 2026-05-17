import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request, status

import db
from api.auth import AuthContext
from models.pricing_schemas import PricingQuoteRequest

logger = logging.getLogger(__name__)

DEFAULT_QUOTE_VALIDITY_MINUTES = 30
SAFE_EVALUATION_ERROR = "Unable to calculate quote"
SAFE_PERSISTENCE_ERROR = "Unable to persist quote"


def resolve_effective_tenant_id(auth: AuthContext, requested_tenant_id: str) -> str:
    return requested_tenant_id if auth.is_super_admin else auth.tenant_id


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def _money_float(value: Any) -> float:
    return float(_money(value))


def _quote_number(now: datetime | None = None) -> str:
    current = now or datetime.now(UTC)
    return f"PY-{current.strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8].upper()}"


async def evaluate_quote(**kwargs: Any) -> dict[str, Any]:
    from workers.pricing_worker import evaluate_quote as worker_evaluate_quote

    return await worker_evaluate_quote(**kwargs)


async def quote_valid_until(tenant_id: str, now: datetime | None = None) -> datetime:
    current = now or datetime.now(UTC)
    minutes = DEFAULT_QUOTE_VALIDITY_MINUTES
    try:
        if await db.table_exists("tenant_settings"):
            row = await db.fetchrow(
                """
                select "quoteValidityMinutes"
                from tenant_settings
                where "tenantId" = $1
                """,
                tenant_id,
            )
            if row and row["quoteValidityMinutes"]:
                minutes = max(5, min(int(row["quoteValidityMinutes"]), 7 * 24 * 60))
    except Exception:
        logger.warning("quote_validity_lookup_failed", extra={"_tenant_id": tenant_id})
    return current + timedelta(minutes=minutes)


async def validate_promo_code(tenant_id: str, promo_code: str | None) -> None:
    if promo_code is None:
        return
    if not await db.table_exists("promo_codes"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Promo code is invalid")
    promo = await db.fetchrow(
        """
        select id, "maxUses", "usedCount"
        from promo_codes
        where "tenantId" = $1
          and upper(code) = $2
          and "isEnabled" = true
          and ("expiresAt" is null or "expiresAt" > now())
        limit 1
        """,
        tenant_id,
        promo_code,
    )
    if not promo:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Promo code is invalid")
    if promo["maxUses"] is not None and int(promo["usedCount"] or 0) >= int(promo["maxUses"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Promo code is invalid")


def safe_quote_response(*, quote_id: str, tenant_id: str, quote: dict[str, Any], valid_until: datetime) -> dict[str, Any]:
    base_decimal = _money(quote.get("base"))
    base = float(base_decimal)
    surcharges = [
        {
            "name": str(item.get("name") or item.get("type") or "Surcharge"),
            "amount": _money_float(item.get("amount")),
            "type": str(item.get("type") or "surcharge"),
        }
        for item in quote.get("surcharges", [])
        if isinstance(item, dict)
    ]
    discount = _money_float(quote.get("promoDiscount"))
    total = _money_float(quote.get("total"))
    subtotal = _money_float(base_decimal + sum(_money(item["amount"]) for item in surcharges))
    return {
        "quoteId": quote_id,
        "tenantId": tenant_id,
        "currency": str(quote.get("currency") or "GBP").upper(),
        "subtotal": subtotal,
        "discount": discount,
        "total": total,
        "validUntil": valid_until.isoformat(),
        "breakdown": {"base": base, "surcharges": surcharges, "promoDiscount": discount},
    }


async def persist_normalized_quote(
    *,
    quote_id: str,
    tenant_id: str,
    payload: PricingQuoteRequest,
    quote: dict[str, Any],
    valid_until: datetime,
    auth: AuthContext,
) -> None:
    tenant_plan = "UNKNOWN"
    try:
        row = await db.fetchrow("select plan from tenants where id = $1", tenant_id)
        if row and row["plan"]:
            tenant_plan = str(row["plan"])
    except Exception:
        logger.warning("tenant_plan_lookup_failed", extra={"_tenant_id": tenant_id})
    await db.execute(
        """
        insert into quotes (
          id, "tenantId", "quoteNumber", "shipmentData", subtotal, total, currency,
          status, "validUntil", "createdBy", "createdAt"
        )
        values ($1, $2, $3, $4::jsonb, $5, $6, $7, 'DRAFT', $8, $9, now())
        """,
        quote_id,
        tenant_id,
        _quote_number(),
        db.json_dumps(
            {
                "originPostcode": payload.originPostcode,
                "destPostcode": payload.destPostcode,
                "weightKg": str(payload.weightKg),
                "promoCode": payload.promoCode,
                "routeDemandSignal": quote.get("demandSignal"),
                "tenantPlan": tenant_plan,
                "pricingRuleVersion": quote.get("pricingRuleVersion"),
                "actor": {
                    "apiKeyId": auth.api_key_id,
                    "userId": auth.user_id,
                    "actorId": auth.actor_id,
                },
            }
        ),
        _money_float(quote.get("base")) + sum(_money_float(item.get("amount")) for item in quote.get("surcharges", []) if isinstance(item, dict)),
        _money_float(quote.get("total")),
        str(quote.get("currency") or "GBP").upper(),
        valid_until,
        auth.actor_id or auth.user_id,
    )


async def log_pricing_audit(
    *,
    auth: AuthContext,
    tenant_id: str,
    payload: PricingQuoteRequest,
    quote_id: str,
    response: dict[str, Any],
    request: Request,
) -> None:
    try:
        if not await db.table_exists("audit_log"):
            return
        await db.execute(
            """
            insert into audit_log (
              id, "tenantId", "actorId", "actorType", "actorIp",
              action, "resourceType", "resourceId", metadata, timestamp
            )
            values ($1, $2, $3, $4, $5, 'pricing_quote_created', 'quote', $6, $7::jsonb, now())
            """,
            str(uuid4()),
            tenant_id,
            auth.actor_id or auth.user_id,
            "SUPER_ADMIN" if auth.is_super_admin else "API",
            request.client.host if request.client else None,
            quote_id,
            db.json_dumps(
                {
                    "tenantId": tenant_id,
                    "originPostcode": payload.originPostcode,
                    "destPostcode": payload.destPostcode,
                    "weightKg": str(payload.weightKg),
                    "promoCode": payload.promoCode,
                    "quoteId": quote_id,
                    "total": response["total"],
                    "currency": response["currency"],
                    "apiKeyId": auth.api_key_id,
                }
            ),
        )
    except Exception:
        logger.warning("pricing_quote_audit_failed", extra={"_quote_id": quote_id, "_tenant_id": tenant_id})


async def create_pricing_quote(
    *,
    payload: PricingQuoteRequest,
    auth: AuthContext,
    request: Request | None = None,
) -> dict[str, Any]:
    tenant_id = resolve_effective_tenant_id(auth, payload.tenantId)
    await validate_promo_code(tenant_id, payload.promoCode)

    try:
        quote = await evaluate_quote(
            tenant_id=tenant_id,
            origin_postcode=payload.originPostcode,
            dest_postcode=payload.destPostcode,
            weight_kg=float(payload.weightKg),
            promo_code=payload.promoCode,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("pricing_quote_evaluation_failed", extra={"_tenant_id": tenant_id})
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=SAFE_EVALUATION_ERROR) from exc

    quote_id = str(uuid4())
    valid_until = await quote_valid_until(tenant_id)
    response = safe_quote_response(quote_id=quote_id, tenant_id=tenant_id, quote=quote, valid_until=valid_until)
    try:
        await persist_normalized_quote(
            quote_id=quote_id,
            tenant_id=tenant_id,
            payload=payload,
            quote=quote,
            valid_until=valid_until,
            auth=auth,
        )
    except Exception as exc:
        logger.exception("pricing_quote_persistence_failed", extra={"_quote_id": quote_id, "_tenant_id": tenant_id})
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=SAFE_PERSISTENCE_ERROR) from exc

    if request is not None:
        await log_pricing_audit(auth=auth, tenant_id=tenant_id, payload=payload, quote_id=quote_id, response=response, request=request)
    return response
