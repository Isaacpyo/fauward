from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base

INVOICE_STATUS_ENUM = ENUM(
    "DRAFT",
    "ISSUED",
    "SENT",
    "PARTIALLY_PAID",
    "PAID",
    "VOID",
    "OVERDUE",
    name="InvoiceStatus",
    create_type=False,
)


def new_id() -> str:
    return str(uuid4())


class InvoiceRow(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("tenantId", "fiscalYear", "sequenceNumber", name="invoices_tenant_fiscal_sequence_key"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="invoices_currency_iso_chk"),
        CheckConstraint('"subtotalMinor" >= 0', name="invoices_subtotal_minor_nonnegative_chk"),
        CheckConstraint('"discountMinor" >= 0', name="invoices_discount_minor_nonnegative_chk"),
        CheckConstraint('"taxTotalMinor" >= 0', name="invoices_tax_total_minor_nonnegative_chk"),
        CheckConstraint('"totalMinor" >= 0', name="invoices_total_minor_nonnegative_chk"),
        CheckConstraint('"amountPaidMinor" >= 0', name="invoices_amount_paid_minor_nonnegative_chk"),
        CheckConstraint('"amountDueMinor" >= 0', name="invoices_amount_due_minor_nonnegative_chk"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column("tenantId", Text, nullable=False, index=True)
    invoice_number: Mapped[str | None] = mapped_column("invoiceNumber", Text)
    customer_id: Mapped[str | None] = mapped_column("customerId", Text)
    organisation_id: Mapped[str | None] = mapped_column("organisationId", Text)
    shipment_id: Mapped[str | None] = mapped_column("shipmentId", Text)
    legacy_line_items: Mapped[list[dict[str, Any]]] = mapped_column("lineItems", JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    legacy_subtotal: Mapped[Decimal] = mapped_column("subtotal", Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    legacy_tax_rate: Mapped[Decimal] = mapped_column("taxRate", Numeric(5, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    legacy_tax_amount: Mapped[Decimal] = mapped_column("taxAmount", Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    legacy_discount_amount: Mapped[Decimal] = mapped_column("discountAmount", Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    legacy_total: Mapped[Decimal] = mapped_column("total", Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    currency: Mapped[str] = mapped_column(Text, nullable=False, default="GBP", server_default=text("'GBP'"))
    status: Mapped[str] = mapped_column(INVOICE_STATUS_ENUM, nullable=False, default="DRAFT", server_default=text("'DRAFT'"))
    due_date: Mapped[datetime | None] = mapped_column("dueDate", DateTime(timezone=True))
    payment_terms: Mapped[int] = mapped_column("paymentTerms", Integer, nullable=False, default=0, server_default=text("0"))
    notes: Mapped[str | None] = mapped_column(Text)
    e_invoice_ref: Mapped[str | None] = mapped_column("eInvoiceRef", Text)
    e_invoice_status: Mapped[str | None] = mapped_column("eInvoiceStatus", Text)
    sent_at: Mapped[datetime | None] = mapped_column("sentAt", DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column("paidAt", DateTime(timezone=True))
    voided_at: Mapped[datetime | None] = mapped_column("voidedAt", DateTime(timezone=True))
    created_by: Mapped[str | None] = mapped_column("createdBy", Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=text("now()"))

    fiscal_year: Mapped[int | None] = mapped_column("fiscalYear", Integer)
    sequence_number: Mapped[int | None] = mapped_column("sequenceNumber", BigInteger)
    subtotal_minor: Mapped[int] = mapped_column("subtotalMinor", BigInteger, nullable=False, default=0, server_default=text("0"))
    discount_minor: Mapped[int] = mapped_column("discountMinor", BigInteger, nullable=False, default=0, server_default=text("0"))
    tax_total_minor: Mapped[int] = mapped_column("taxTotalMinor", BigInteger, nullable=False, default=0, server_default=text("0"))
    total_minor: Mapped[int] = mapped_column("totalMinor", BigInteger, nullable=False, default=0, server_default=text("0"))
    amount_paid_minor: Mapped[int] = mapped_column("amountPaidMinor", BigInteger, nullable=False, default=0, server_default=text("0"))
    amount_due_minor: Mapped[int] = mapped_column("amountDueMinor", BigInteger, nullable=False, default=0, server_default=text("0"))
    issue_date: Mapped[datetime | None] = mapped_column("issueDate", Date)
    issued_at: Mapped[datetime | None] = mapped_column("issuedAt", DateTime(timezone=True))
    issued_by: Mapped[str | None] = mapped_column("issuedBy", Text)
    updated_by: Mapped[str | None] = mapped_column("updatedBy", Text)
    payer_name: Mapped[str | None] = mapped_column("payerName", Text)
    payer_address: Mapped[dict[str, Any] | None] = mapped_column("payerAddress", JSONB)
    payer_vat_id: Mapped[str | None] = mapped_column("payerVatId", Text)
    payee_name: Mapped[str | None] = mapped_column("payeeName", Text)
    payee_address: Mapped[dict[str, Any] | None] = mapped_column("payeeAddress", JSONB)
    payee_vat_id: Mapped[str | None] = mapped_column("payeeVatId", Text)
    reverse_charge: Mapped[bool] = mapped_column("reverseCharge", Boolean, nullable=False, default=False, server_default=text("false"))
    content_hash_sha256: Mapped[str | None] = mapped_column("contentHashSha256", Text)

    line_items: Mapped[list[InvoiceLineItemRow]] = relationship(back_populates="invoice", cascade="all, delete-orphan", lazy="selectin")
    events: Mapped[list[InvoiceEventRow]] = relationship(back_populates="invoice", lazy="selectin")


class InvoiceLineItemRow(Base):
    __tablename__ = "invoice_line_items"
    __table_args__ = (
        UniqueConstraint("invoice_id", "line_number", name="invoice_line_items_invoice_line_number_key"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="invoice_line_items_currency_iso_chk"),
        CheckConstraint("tax_country_code is null or tax_country_code ~ '^[A-Z]{2}$'", name="invoice_line_items_tax_country_iso_chk"),
        CheckConstraint("quantity_micros > 0", name="invoice_line_items_quantity_positive_chk"),
        CheckConstraint("unit_amount_minor >= 0", name="invoice_line_items_unit_amount_nonnegative_chk"),
        CheckConstraint("discount_amount_minor >= 0", name="invoice_line_items_discount_nonnegative_chk"),
        CheckConstraint("net_amount_minor >= 0", name="invoice_line_items_net_nonnegative_chk"),
        CheckConstraint("tax_amount_minor >= 0", name="invoice_line_items_tax_nonnegative_chk"),
        CheckConstraint("gross_amount_minor >= 0", name="invoice_line_items_gross_nonnegative_chk"),
        CheckConstraint("tax_rate_bps >= 0 and tax_rate_bps <= 10000", name="invoice_line_items_tax_rate_range_chk"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    invoice_id: Mapped[str] = mapped_column(Text, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity_micros: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1_000_000, server_default=text("1000000"))
    unit_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    discount_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default=text("0"))
    net_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default=text("0"))
    gross_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(Text, nullable=False)
    tax_code: Mapped[str] = mapped_column(Text, nullable=False)
    tax_rate_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    tax_country_code: Mapped[str | None] = mapped_column(Text)
    reverse_charge: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    item_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=text("now()"))

    invoice: Mapped[InvoiceRow] = relationship(back_populates="line_items")


class InvoiceSequenceRow(Base):
    __tablename__ = "invoice_sequences"

    tenant_id: Mapped[str] = mapped_column(Text, primary_key=True)
    fiscal_year: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_number: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1, server_default=text("1"))
    prefix: Mapped[str] = mapped_column(Text, nullable=False, default="INV", server_default=text("'INV'"))
    padding: Mapped[int] = mapped_column(Integer, nullable=False, default=6, server_default=text("6"))
    last_allocated_invoice_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=text("now()"))


class InvoiceEventRow(Base):
    __tablename__ = "invoice_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    invoice_id: Mapped[str] = mapped_column(Text, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    from_status: Mapped[str | None] = mapped_column(Text)
    to_status: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[str | None] = mapped_column(Text)
    actor_type: Mapped[str] = mapped_column(Text, nullable=False, default="API", server_default=text("'API'"))
    correlation_id: Mapped[str | None] = mapped_column(Text)
    before_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    event_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    invoice: Mapped[InvoiceRow] = relationship(back_populates="events")


class OutboxRow(Base):
    __tablename__ = "outbox"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    aggregate_type: Mapped[str] = mapped_column(Text, nullable=False)
    aggregate_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending", server_default=text("'pending'"))
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default=text("10"))
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_by: Mapped[str | None] = mapped_column(Text)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    correlation_id: Mapped[str | None] = mapped_column(Text)
    traceparent: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=text("now()"))


class IdempotencyKeyRow(Base):
    __tablename__ = "idempotency_keys"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column("tenantId", Text, nullable=False, index=True)
    key: Mapped[str] = mapped_column(Text, nullable=False)
    request_hash: Mapped[str | None] = mapped_column("requestHash", Text)
    response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    status_code: Mapped[int | None] = mapped_column("statusCode", Integer)
    response_headers: Mapped[dict[str, Any]] = mapped_column("responseHeaders", JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    state: Mapped[str] = mapped_column(Text, nullable=False, default="processing", server_default=text("'processing'"))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=text("now()"))
    expires_at: Mapped[datetime] = mapped_column("expiresAt", DateTime(timezone=True), nullable=False)

    __table_args__ = (UniqueConstraint("tenantId", "key", name="idempotency_keys_tenantId_key_key"),)
