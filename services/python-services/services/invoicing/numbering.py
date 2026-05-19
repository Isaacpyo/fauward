from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json
from typing import AsyncIterator

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.invoicing import InvoiceRow, InvoiceSequenceRow
from services.invoicing.repository import (
    add_invoice_event,
    add_outbox_event,
    get_invoice_for_update,
    invoice_snapshot,
    minor_to_decimal,
)
from services.invoicing.state import InvalidTransition, db_state, domain_state, validate_transition


class InvoiceNotFound(LookupError):
    pass


class InvoiceValidationError(ValueError):
    pass


@dataclass(frozen=True)
class AllocatedInvoiceNumber:
    invoice_number: str
    sequence_number: int
    fiscal_year: int


@dataclass(frozen=True)
class IssueInvoiceResult:
    invoice_id: str
    tenant_id: str
    invoice_number: str
    sequence_number: int
    fiscal_year: int
    status: str
    content_hash_sha256: str
    outbox_id: str


@asynccontextmanager
async def _transaction(session: AsyncSession) -> AsyncIterator[None]:
    if session.in_transaction():
        yield
    else:
        async with session.begin():
            yield


def fiscal_year_for(issued_at: datetime) -> int:
    return issued_at.astimezone(UTC).year


def format_invoice_number(*, prefix: str, fiscal_year: int, sequence_number: int, padding: int) -> str:
    return f"{prefix}-{fiscal_year}-{sequence_number:0{padding}d}"


async def allocate_invoice_number(
    session: AsyncSession,
    *,
    tenant_id: str,
    fiscal_year: int,
    invoice_id: str | None = None,
) -> AllocatedInvoiceNumber:
    insert_stmt = (
        pg_insert(InvoiceSequenceRow)
        .values(tenant_id=tenant_id, fiscal_year=fiscal_year, next_number=1, prefix="INV", padding=6)
        .on_conflict_do_nothing(index_elements=["tenant_id", "fiscal_year"])
    )
    await session.execute(insert_stmt)
    result = await session.execute(
        select(InvoiceSequenceRow)
        .where(InvoiceSequenceRow.tenant_id == tenant_id, InvoiceSequenceRow.fiscal_year == fiscal_year)
        .with_for_update()
    )
    sequence = result.scalar_one()
    sequence_number = int(sequence.next_number)
    sequence.next_number = sequence_number + 1
    sequence.last_allocated_invoice_id = invoice_id
    sequence.updated_at = datetime.now(UTC)
    return AllocatedInvoiceNumber(
        invoice_number=format_invoice_number(
            prefix=sequence.prefix,
            fiscal_year=fiscal_year,
            sequence_number=sequence_number,
            padding=sequence.padding,
        ),
        sequence_number=sequence_number,
        fiscal_year=fiscal_year,
    )


def _canonical_hash(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _require_issueable(invoice: InvoiceRow) -> None:
    state = domain_state(str(invoice.status))
    if state != "draft":
        raise InvalidTransition(state, "issued")
    if invoice.invoice_number or invoice.sequence_number or invoice.fiscal_year:
        raise InvoiceValidationError("Draft invoice already has an issued number")
    if not invoice.line_items:
        raise InvoiceValidationError("Invoice must have at least one line item")
    if not invoice.payer_name or not invoice.payer_address:
        raise InvoiceValidationError("Payer snapshot is required before issue")
    if not invoice.payee_name or not invoice.payee_address:
        raise InvoiceValidationError("Payee snapshot is required before issue")
    if str(invoice.currency).upper() != invoice.currency:
        raise InvoiceValidationError("Invoice currency must be ISO 4217 uppercase")
    currencies = {line.currency for line in invoice.line_items}
    if currencies != {invoice.currency}:
        raise InvoiceValidationError("All line items must use the invoice currency")


def _sync_totals(invoice: InvoiceRow) -> None:
    discount = sum(line.discount_amount_minor for line in invoice.line_items)
    subtotal = sum(line.net_amount_minor for line in invoice.line_items) + discount
    tax_total = sum(line.tax_amount_minor for line in invoice.line_items)
    total = sum(line.gross_amount_minor for line in invoice.line_items)
    if total != subtotal - discount + tax_total:
        raise InvoiceValidationError("Line totals are inconsistent")
    invoice.subtotal_minor = subtotal
    invoice.discount_minor = discount
    invoice.tax_total_minor = tax_total
    invoice.total_minor = total
    invoice.amount_due_minor = total - invoice.amount_paid_minor
    if invoice.amount_due_minor < 0:
        raise InvoiceValidationError("Invoice is overpaid")
    invoice.legacy_line_items = [
        {
            "description": line.description,
            "quantityMicros": line.quantity_micros,
            "unitAmountMinor": line.unit_amount_minor,
            "netAmountMinor": line.net_amount_minor,
            "taxAmountMinor": line.tax_amount_minor,
            "grossAmountMinor": line.gross_amount_minor,
            "currency": line.currency,
            "taxCode": line.tax_code,
            "taxRateBps": line.tax_rate_bps,
        }
        for line in sorted(invoice.line_items, key=lambda item: item.line_number)
    ]
    invoice.legacy_subtotal = minor_to_decimal(invoice.subtotal_minor)
    invoice.legacy_discount_amount = minor_to_decimal(invoice.discount_minor)
    invoice.legacy_tax_amount = minor_to_decimal(invoice.tax_total_minor)
    invoice.legacy_total = minor_to_decimal(invoice.total_minor)


async def issue_invoice(
    session: AsyncSession,
    *,
    tenant_id: str,
    invoice_id: str,
    actor_id: str | None = None,
    actor_type: str = "API",
    correlation_id: str | None = None,
    traceparent: str | None = None,
    issued_at: datetime | None = None,
) -> IssueInvoiceResult:
    issued_at = (issued_at or datetime.now(UTC)).astimezone(UTC)
    async with _transaction(session):
        invoice = await get_invoice_for_update(session, tenant_id=tenant_id, invoice_id=invoice_id)
        if invoice is None:
            raise InvoiceNotFound("Invoice not found")

        _require_issueable(invoice)
        validate_transition(str(invoice.status), "issued")
        _sync_totals(invoice)
        before = invoice_snapshot(invoice)

        fiscal_year = fiscal_year_for(issued_at)
        allocated = await allocate_invoice_number(
            session,
            tenant_id=tenant_id,
            fiscal_year=fiscal_year,
            invoice_id=invoice.id,
        )

        invoice.invoice_number = allocated.invoice_number
        invoice.sequence_number = allocated.sequence_number
        invoice.fiscal_year = allocated.fiscal_year
        invoice.status = db_state("issued")
        invoice.issue_date = issued_at.date()
        invoice.issued_at = issued_at
        invoice.issued_by = actor_id
        invoice.updated_by = actor_id
        invoice.updated_at = issued_at
        hash_payload = invoice_snapshot(invoice, include_content_hash=False)
        invoice.content_hash_sha256 = _canonical_hash(hash_payload)
        await session.flush()

        after = invoice_snapshot(invoice)
        add_invoice_event(
            session,
            tenant_id=tenant_id,
            invoice_id=invoice.id,
            event_type="invoice.issued",
            from_status="draft",
            to_status="issued",
            actor_id=actor_id,
            actor_type=actor_type,
            correlation_id=correlation_id,
            before_snapshot=before,
            after_snapshot=after,
            metadata={"invoiceNumber": invoice.invoice_number},
        )
        outbox = add_outbox_event(
            session,
            tenant_id=tenant_id,
            aggregate_type="invoice",
            aggregate_id=invoice.id,
            event_type="render_invoice",
            payload={
                "tenantId": tenant_id,
                "invoiceId": invoice.id,
                "invoiceNumber": invoice.invoice_number,
                "contentHashSha256": invoice.content_hash_sha256,
                "correlationId": correlation_id,
            },
            correlation_id=correlation_id,
            traceparent=traceparent,
        )
        await session.flush()
        return IssueInvoiceResult(
            invoice_id=invoice.id,
            tenant_id=tenant_id,
            invoice_number=str(invoice.invoice_number),
            sequence_number=int(invoice.sequence_number or 0),
            fiscal_year=int(invoice.fiscal_year or 0),
            status=domain_state(str(invoice.status)),
            content_hash_sha256=str(invoice.content_hash_sha256),
            outbox_id=outbox.id,
        )
