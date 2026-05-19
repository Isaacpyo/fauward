import asyncio
from datetime import UTC, datetime
from functools import lru_cache
import os
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

import pytest
from pydantic import ValidationError

pytest.importorskip("sqlalchemy")
pytest.importorskip("alembic")

from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from models.invoicing import InvoiceEventRow, InvoiceLineItemRow, InvoiceRow, OutboxRow  # noqa: E402
from services.invoicing.database import sqlalchemy_connect_args, sqlalchemy_database_url  # noqa: E402
from services.invoicing.numbering import InvoiceValidationError, issue_invoice  # noqa: E402
from services.invoicing.schemas import Address, Invoice, LineItem, Money, TaxBreakdown  # noqa: E402
from services.invoicing.state import InvalidTransition, state_for_payment, validate_transition  # noqa: E402


def test_invoice_state_machine_allows_only_defined_transitions():
    validate_transition("draft", "issued")
    validate_transition("issued", "sent")
    validate_transition("issued", "paid")
    validate_transition("sent", "void")
    validate_transition("partially_paid", "paid")

    with pytest.raises(InvalidTransition):
        validate_transition("draft", "sent")
    with pytest.raises(InvalidTransition):
        validate_transition("paid", "void")
    with pytest.raises(InvalidTransition):
        validate_transition("void", "paid")


def test_payment_state_helper_rejects_invalid_payment_states():
    assert state_for_payment(current="issued", amount_paid_minor=500, total_minor=1000) == "partially_paid"
    assert state_for_payment(current="sent", amount_paid_minor=1000, total_minor=1000) == "paid"
    assert state_for_payment(current="partially_paid", amount_paid_minor=750, total_minor=1000) == "partially_paid"

    with pytest.raises(InvalidTransition):
        state_for_payment(current="draft", amount_paid_minor=100, total_minor=1000)
    with pytest.raises(ValueError):
        state_for_payment(current="issued", amount_paid_minor=0, total_minor=1000)


def test_invoice_schemas_enforce_iso_codes_minor_units_and_totals():
    payer = Address(line1="1 Billing Street", city="London", countryCode="gb")
    payee = Address(line1="10 Depot Road", city="London", countryCode="GB")
    line = LineItem(
        lineNumber=1,
        description="Courier delivery",
        unitAmount=Money(amountMinor=1000, currency="gbp"),
        netAmount=Money(amountMinor=1000, currency="GBP"),
        taxAmount=Money(amountMinor=200, currency="GBP"),
        grossAmount=Money(amountMinor=1200, currency="GBP"),
        taxCode="GB_STANDARD",
        taxRateBps=2000,
        taxCountryCode="gb",
    )
    tax = TaxBreakdown(
        taxCode="GB_STANDARD",
        taxableAmount=Money(amountMinor=1000, currency="GBP"),
        taxAmount=Money(amountMinor=200, currency="GBP"),
        rateBps=2000,
        countryCode="gb",
    )

    invoice = Invoice(
        id="inv_1",
        tenantId="tenant_a",
        currency="gbp",
        lineItems=[line],
        taxBreakdown=[tax],
        subtotal=Money(amountMinor=1000, currency="GBP"),
        taxTotal=Money(amountMinor=200, currency="GBP"),
        total=Money(amountMinor=1200, currency="GBP"),
        amountDue=Money(amountMinor=1200, currency="GBP"),
        payerName="Alice Ltd",
        payerAddress=payer,
        payeeName="Fauward Logistics",
        payeeAddress=payee,
    )

    assert invoice.currency == "GBP"
    assert invoice.payerAddress.countryCode == "GB"
    assert invoice.lineItems[0].taxCountryCode == "GB"
    assert invoice.lineItems[0].discountAmount.currency == "GBP"

    with pytest.raises(ValidationError):
        Money(amountMinor=-1, currency="GBP")
    with pytest.raises(ValidationError):
        Invoice(
            id="inv_2",
            tenantId="tenant_a",
            currency="GBP",
            lineItems=[line],
            subtotal=Money(amountMinor=1000, currency="GBP"),
            taxTotal=Money(amountMinor=200, currency="GBP"),
            total=Money(amountMinor=1300, currency="GBP"),
            amountDue=Money(amountMinor=1300, currency="GBP"),
            payerName="Alice Ltd",
            payerAddress=payer,
            payeeName="Fauward Logistics",
            payeeAddress=payee,
        )


def _test_database_url() -> str | None:
    return os.getenv("INVOICING_TEST_DATABASE_URL")


@lru_cache(maxsize=None)
def _alembic_upgrade(db_url: str) -> None:
    service_root = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=service_root,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


async def _ensure_tenant(engine, tenant_id: str) -> None:
    async with engine.begin() as connection:
        has_tenants = await connection.scalar(text("select to_regclass('public.tenants')"))
        if has_tenants:
            await connection.execute(
                text(
                    """
                    insert into tenants (id, name, slug, "updatedAt")
                    values (:id, :name, :slug, now())
                    on conflict (id) do nothing
                    """
                ),
                {"id": tenant_id, "name": f"Tenant {tenant_id}", "slug": tenant_id.lower().replace("_", "-")},
            )


async def _create_draft(session_factory, tenant_id: str) -> str:
    invoice_id = f"inv_{uuid4().hex}"
    async with session_factory() as session:
        async with session.begin():
            invoice = InvoiceRow(
                id=invoice_id,
                tenant_id=tenant_id,
                currency="GBP",
                status="DRAFT",
                payer_name="Alice Ltd",
                payer_address={"line1": "1 Billing Street", "city": "London", "countryCode": "GB"},
                payer_vat_id="GB123456789",
                payee_name="Fauward Logistics",
                payee_address={"line1": "10 Depot Road", "city": "London", "countryCode": "GB"},
                payee_vat_id="GB987654321",
            )
            invoice.line_items.append(
                InvoiceLineItemRow(
                    id=f"line_{uuid4().hex}",
                    tenant_id=tenant_id,
                    line_number=1,
                    description="Courier delivery",
                    quantity_micros=1_000_000,
                    unit_amount_minor=1000,
                    discount_amount_minor=0,
                    net_amount_minor=1000,
                    tax_amount_minor=200,
                    gross_amount_minor=1200,
                    currency="GBP",
                    tax_code="GB_STANDARD",
                    tax_rate_bps=2000,
                    tax_country_code="GB",
                )
            )
            session.add(invoice)
    return invoice_id


@pytest.mark.asyncio
async def test_issue_invoice_writes_number_hash_event_and_outbox_atomically():
    db_url = _test_database_url()
    if not db_url:
        pytest.skip("INVOICING_TEST_DATABASE_URL is required for DB-backed invoicing tests")
    _alembic_upgrade(db_url)
    engine = create_async_engine(sqlalchemy_database_url(db_url), pool_pre_ping=True, connect_args=sqlalchemy_connect_args(db_url))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    tenant_id = f"tenant_{uuid4().hex}"
    await _ensure_tenant(engine, tenant_id)
    invoice_id = await _create_draft(session_factory, tenant_id)

    async with session_factory() as session:
        result = await issue_invoice(
            session,
            tenant_id=tenant_id,
            invoice_id=invoice_id,
            actor_id="actor_1",
            correlation_id="corr_1",
            issued_at=datetime(2026, 5, 18, 12, 0, tzinfo=UTC),
        )

    async with session_factory() as session:
        invoice = await session.scalar(select(InvoiceRow).where(InvoiceRow.id == invoice_id))
        event = await session.scalar(select(InvoiceEventRow).where(InvoiceEventRow.invoice_id == invoice_id))
        outbox = await session.scalar(select(OutboxRow).where(OutboxRow.aggregate_id == invoice_id))

    assert result.invoice_number == "INV-2026-000001"
    assert invoice is not None
    assert invoice.status == "ISSUED"
    assert invoice.content_hash_sha256 == result.content_hash_sha256
    assert len(invoice.content_hash_sha256 or "") == 64
    assert event is not None
    assert event.event_type == "invoice.issued"
    assert event.before_snapshot["status"] == "draft"
    assert event.after_snapshot["status"] == "issued"
    assert outbox is not None
    assert outbox.event_type == "render_invoice"
    assert outbox.payload["invoiceId"] == invoice_id
    await engine.dispose()


@pytest.mark.asyncio
async def test_issued_invoice_cannot_be_issued_again():
    db_url = _test_database_url()
    if not db_url:
        pytest.skip("INVOICING_TEST_DATABASE_URL is required for DB-backed invoicing tests")
    _alembic_upgrade(db_url)
    engine = create_async_engine(sqlalchemy_database_url(db_url), pool_pre_ping=True, connect_args=sqlalchemy_connect_args(db_url))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    tenant_id = f"tenant_{uuid4().hex}"
    await _ensure_tenant(engine, tenant_id)
    invoice_id = await _create_draft(session_factory, tenant_id)

    async with session_factory() as session:
        await issue_invoice(session, tenant_id=tenant_id, invoice_id=invoice_id)
    async with session_factory() as session:
        with pytest.raises(InvalidTransition):
            await issue_invoice(session, tenant_id=tenant_id, invoice_id=invoice_id)
    await engine.dispose()


@pytest.mark.asyncio
async def test_draft_without_line_items_cannot_be_issued():
    db_url = _test_database_url()
    if not db_url:
        pytest.skip("INVOICING_TEST_DATABASE_URL is required for DB-backed invoicing tests")
    _alembic_upgrade(db_url)
    engine = create_async_engine(sqlalchemy_database_url(db_url), pool_pre_ping=True, connect_args=sqlalchemy_connect_args(db_url))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    tenant_id = f"tenant_{uuid4().hex}"
    await _ensure_tenant(engine, tenant_id)
    invoice_id = f"inv_{uuid4().hex}"
    async with session_factory() as session:
        async with session.begin():
            session.add(
                InvoiceRow(
                    id=invoice_id,
                    tenant_id=tenant_id,
                    currency="GBP",
                    status="DRAFT",
                    payer_name="Alice Ltd",
                    payer_address={"line1": "1 Billing Street", "city": "London", "countryCode": "GB"},
                    payee_name="Fauward Logistics",
                    payee_address={"line1": "10 Depot Road", "city": "London", "countryCode": "GB"},
                )
            )

    async with session_factory() as session:
        with pytest.raises(InvoiceValidationError):
            await issue_invoice(session, tenant_id=tenant_id, invoice_id=invoice_id)
    await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_issue_allocates_gapless_numbers_per_tenant_fiscal_year():
    db_url = _test_database_url()
    if not db_url:
        pytest.skip("INVOICING_TEST_DATABASE_URL is required for DB-backed invoicing tests")
    _alembic_upgrade(db_url)
    engine = create_async_engine(sqlalchemy_database_url(db_url), pool_pre_ping=True, connect_args=sqlalchemy_connect_args(db_url))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    tenant_id = f"tenant_{uuid4().hex}"
    await _ensure_tenant(engine, tenant_id)
    invoice_ids = await asyncio.gather(*[_create_draft(session_factory, tenant_id) for _ in range(12)])

    async def issue_one(invoice_id: str):
        async with session_factory() as session:
            return await issue_invoice(
                session,
                tenant_id=tenant_id,
                invoice_id=invoice_id,
                issued_at=datetime(2026, 5, 18, 12, 0, tzinfo=UTC),
            )

    results = await asyncio.gather(*[issue_one(invoice_id) for invoice_id in invoice_ids])

    assert sorted(result.sequence_number for result in results) == list(range(1, 13))
    assert len({result.invoice_number for result in results}) == 12
    assert sorted(result.invoice_number for result in results) == [f"INV-2026-{idx:06d}" for idx in range(1, 13)]

    other_tenant = f"tenant_{uuid4().hex}"
    await _ensure_tenant(engine, other_tenant)
    other_invoice = await _create_draft(session_factory, other_tenant)
    async with session_factory() as session:
        other = await issue_invoice(
            session,
            tenant_id=other_tenant,
            invoice_id=other_invoice,
            issued_at=datetime(2026, 5, 18, 12, 0, tzinfo=UTC),
        )
    assert other.sequence_number == 1
    await engine.dispose()
