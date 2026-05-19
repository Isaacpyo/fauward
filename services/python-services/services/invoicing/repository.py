from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.invoicing import InvoiceEventRow, InvoiceLineItemRow, InvoiceRow, OutboxRow
from services.invoicing.state import domain_state


def minor_to_decimal(value: int) -> Decimal:
    return (Decimal(value) / Decimal(100)).quantize(Decimal("0.01"))


async def get_invoice_for_update(session: AsyncSession, *, tenant_id: str, invoice_id: str) -> InvoiceRow | None:
    result = await session.execute(
        select(InvoiceRow)
        .where(InvoiceRow.id == invoice_id, InvoiceRow.tenant_id == tenant_id)
        .options(selectinload(InvoiceRow.line_items))
        .with_for_update()
    )
    return result.scalar_one_or_none()


def line_item_snapshot(item: InvoiceLineItemRow) -> dict[str, Any]:
    return {
        "id": item.id,
        "lineNumber": item.line_number,
        "description": item.description,
        "quantityMicros": item.quantity_micros,
        "unitAmountMinor": item.unit_amount_minor,
        "discountAmountMinor": item.discount_amount_minor,
        "netAmountMinor": item.net_amount_minor,
        "taxAmountMinor": item.tax_amount_minor,
        "grossAmountMinor": item.gross_amount_minor,
        "currency": item.currency,
        "taxCode": item.tax_code,
        "taxRateBps": item.tax_rate_bps,
        "taxCountryCode": item.tax_country_code,
        "reverseCharge": item.reverse_charge,
        "metadata": item.item_metadata or {},
    }


def invoice_snapshot(invoice: InvoiceRow, *, include_content_hash: bool = True) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": invoice.id,
        "tenantId": invoice.tenant_id,
        "invoiceNumber": invoice.invoice_number,
        "fiscalYear": invoice.fiscal_year,
        "sequenceNumber": invoice.sequence_number,
        "status": domain_state(str(invoice.status)),
        "currency": invoice.currency,
        "subtotalMinor": invoice.subtotal_minor,
        "discountMinor": invoice.discount_minor,
        "taxTotalMinor": invoice.tax_total_minor,
        "totalMinor": invoice.total_minor,
        "amountPaidMinor": invoice.amount_paid_minor,
        "amountDueMinor": invoice.amount_due_minor,
        "payerName": invoice.payer_name,
        "payerAddress": invoice.payer_address,
        "payerVatId": invoice.payer_vat_id,
        "payeeName": invoice.payee_name,
        "payeeAddress": invoice.payee_address,
        "payeeVatId": invoice.payee_vat_id,
        "reverseCharge": invoice.reverse_charge,
        "issueDate": invoice.issue_date.isoformat() if invoice.issue_date else None,
        "issuedAt": invoice.issued_at.isoformat() if invoice.issued_at else None,
        "dueDate": invoice.due_date.isoformat() if invoice.due_date else None,
        "lineItems": [line_item_snapshot(item) for item in sorted(invoice.line_items, key=lambda item: item.line_number)],
    }
    if include_content_hash:
        payload["contentHashSha256"] = invoice.content_hash_sha256
    return payload


def add_invoice_event(
    session: AsyncSession,
    *,
    tenant_id: str,
    invoice_id: str,
    event_type: str,
    from_status: str | None,
    to_status: str | None,
    actor_id: str | None,
    actor_type: str,
    correlation_id: str | None,
    before_snapshot: dict[str, Any] | None,
    after_snapshot: dict[str, Any] | None,
    metadata: dict[str, Any] | None = None,
) -> InvoiceEventRow:
    row = InvoiceEventRow(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        actor_id=actor_id,
        actor_type=actor_type,
        correlation_id=correlation_id,
        before_snapshot=before_snapshot,
        after_snapshot=after_snapshot,
        event_metadata=metadata or {},
    )
    session.add(row)
    return row


def add_outbox_event(
    session: AsyncSession,
    *,
    tenant_id: str,
    aggregate_type: str,
    aggregate_id: str,
    event_type: str,
    payload: dict[str, Any],
    correlation_id: str | None,
    traceparent: str | None = None,
    available_at: datetime | None = None,
) -> OutboxRow:
    row = OutboxRow(
        tenant_id=tenant_id,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        event_type=event_type,
        payload=payload,
        correlation_id=correlation_id,
        traceparent=traceparent,
    )
    if available_at is not None:
        row.available_at = available_at
    session.add(row)
    return row
