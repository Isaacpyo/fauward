import pytest
from fastapi import HTTPException

import db
from api.auth import AuthContext
from models.pdf_schemas import PdfDisplayOptions, PdfGenerateRequest
from services.pdf_jobs import (
    QueuePublishError,
    build_pdf_data_from_shipment,
    fetch_document_for_auth,
    latest_completed_label,
    queue_pdf_generation,
    status_response,
)


def auth(tenant_id: str = "tenant_a", scopes: list[str] | None = None) -> AuthContext:
    return AuthContext(tenant_id=tenant_id, scopes=scopes or [])


def payload(**overrides):
    values = {
        "tenantId": "tenant_a",
        "type": "invoice",
        "shipmentId": "shp_1",
    }
    values.update(overrides)
    return PdfGenerateRequest.model_validate(values)


@pytest.mark.asyncio
async def test_normal_tenant_can_queue_pdf_for_own_shipment(monkeypatch):
    writes = []
    published = []

    async def fake_fetchrow(query, *args):
        if "from shipments" in query:
            assert args == ("shp_1", "tenant_a")
            return {"id": "shp_1", "tenantId": "tenant_a", "trackingNumber": "TRK-1"}
        if "idempotency_key" in query:
            return None
        raise AssertionError(query)

    async def fake_execute(query, *args):
        writes.append((query, args))
        return "INSERT 0 1"

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    result = await queue_pdf_generation(
        payload=payload(),
        auth=auth("tenant_a"),
        publisher=lambda queue, body: published.append((queue, body)),
    )

    assert result["status"] == "QUEUED"
    assert result["jobId"] != "client_supplied"
    assert writes[0][1][1:4] == ("tenant_a", "shp_1", "invoice")
    assert published[0][0] == "fauward:pdf:generate"
    assert published[0][1]["jobId"] == result["jobId"]
    assert "data" not in published[0][1]


@pytest.mark.asyncio
async def test_tenant_cannot_queue_pdf_for_another_tenants_shipment(monkeypatch):
    async def fake_fetchrow(query, *args):
        assert "from shipments" in query
        assert args == ("shp_other", "tenant_a")
        return None

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    with pytest.raises(HTTPException) as exc:
        await queue_pdf_generation(payload=payload(shipmentId="shp_other"), auth=auth("tenant_a"), publisher=lambda *_: None)

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_guessed_cross_tenant_pdf_status_returns_404(monkeypatch):
    async def fake_fetchrow(query, *args):
        assert "where id = $1 and tenant_id = $2" in query
        assert args == ("job_b", "tenant_a")
        return None

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    with pytest.raises(HTTPException) as exc:
        await fetch_document_for_auth("job_b", auth("tenant_a"))

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_super_admin_can_inspect_cross_tenant_pdf_job(monkeypatch):
    async def fake_fetchrow(query, *args):
        assert "where id = $1\n" in query
        assert args == ("job_b",)
        return {
            "id": "job_b",
            "tenant_id": "tenant_b",
            "shipment_id": "shp_b",
            "type": "invoice",
            "url": "https://storage.example/public/invoice.pdf",
            "status": "COMPLETED",
            "error_message": None,
            "metadata": {"storagePath": "tenant_b/invoice/shp_b.pdf"},
        }

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    row = await fetch_document_for_auth("job_b", auth("platform", ["super_admin"]))
    assert status_response(row, auth("platform", ["super_admin"])) == {
        "jobId": "job_b",
        "status": "COMPLETED",
        "url": "/pdf/download/job_b",
    }


@pytest.mark.asyncio
async def test_client_cannot_overwrite_another_document_by_sending_existing_job_id(monkeypatch):
    published = []

    async def fake_fetchrow(query, *args):
        if "from shipments" in query:
            return {"id": "shp_1", "tenantId": "tenant_a"}
        return None

    async def fake_execute(query, *args):
        assert "on conflict (id)" not in query.lower()
        assert args[0] != "existing_cross_tenant_job"
        return "INSERT 0 1"

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    result = await queue_pdf_generation(
        payload=payload(jobId="existing_cross_tenant_job"),
        auth=auth("tenant_a"),
        publisher=lambda queue, body: published.append(body),
    )

    assert result["jobId"] != "existing_cross_tenant_job"
    assert published[0]["jobId"] == result["jobId"]


@pytest.mark.asyncio
async def test_publish_job_failure_marks_document_failed(monkeypatch):
    writes = []

    async def fake_fetchrow(query, *args):
        if "from shipments" in query:
            return {"id": "shp_1", "tenantId": "tenant_a"}
        return None

    async def fake_execute(query, *args):
        writes.append((query, args))
        return "INSERT 0 1"

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    def fail_publish(queue, body):
        raise RuntimeError("redis connection stack trace secret")

    with pytest.raises(QueuePublishError):
        await queue_pdf_generation(payload=payload(), auth=auth("tenant_a"), publisher=fail_publish)

    failed_update = writes[-1]
    assert "set status = 'FAILED'" in failed_update[0]
    assert failed_update[1][1] == "tenant_a"


def test_pdf_status_does_not_expose_internal_stack_traces_to_normal_tenants():
    row = {
        "id": "job_1",
        "tenant_id": "tenant_a",
        "status": "FAILED",
        "error_message": "Traceback: database password secret",
    }

    normal = status_response(row, auth("tenant_a"))
    admin = status_response(row, auth("platform", ["super_admin"]))

    assert normal["error"] == "PDF generation failed"
    assert "Traceback" not in normal["error"]
    assert admin["error"] == "Traceback: database password secret"


def test_pdf_url_is_only_returned_for_completed_authorized_status():
    completed = {"id": "job_1", "tenant_id": "tenant_a", "status": "COMPLETED", "error_message": None}
    queued = {"id": "job_2", "tenant_id": "tenant_a", "status": "QUEUED", "error_message": None}

    assert status_response(completed, auth("tenant_a"))["url"] == "/pdf/download/job_1"
    assert "url" not in status_response(queued, auth("tenant_a"))


def test_shipping_label_field_bag_populates_all_label_fields():
    data = build_pdf_data_from_shipment(
        shipment={
            "id": "shp_1",
            "trackingNumber": "QU2605-96-H3T4-49053",
            "serviceTier": "express",
            "weightKg": "4.200",
            "createdAt": "2026-05-25T17:13:00Z",
            "referenceNumber": "REF-9001",
            "originAddress": {"line1": "Nehru Place", "city": "New Delhi", "postcode": "110019", "country": "India"},
            "destinationAddress": {
                "name": "Leila Rashid",
                "line1": "28 Dunford Drive",
                "city": "Doncaster",
                "postcode": "DN4 0GF",
                "country": "United Kingdom",
                "email": "leila.rashid@outlook.com",
                "phone": "+44 7799 945678",
            },
        },
        document_type="shipping_label",
        options=PdfDisplayOptions(),
        items=[{"quantity": 1, "lengthCm": "30", "widthCm": "20", "heightCm": "15", "isDangerous": True}],
        tracking_url_base="https://track.fauward.com",
    )

    assert data["serviceTier"] == "EXPRESS"
    assert data["weightKg"] == "4.2"
    assert data["packageQuantity"] == 1
    assert data["dimensions"] == "30 × 20 × 15 cm"
    assert data["fragile"] is True
    assert data["recipientName"] == "Leila Rashid"
    assert data["recipientEmail"] == "leila.rashid@outlook.com"
    assert data["recipientPhone"] == "+44 7799 945678"
    assert data["referenceNumber"] == "REF-9001"
    assert data["createdAt"] == "25 May 2026"
    assert data["trackingUrl"] == "https://track.fauward.com/QU2605-96-H3T4-49053"


def test_shipping_label_field_bag_degrades_when_optional_fields_missing():
    data = build_pdf_data_from_shipment(
        shipment={
            "id": "shp_1",
            "trackingNumber": "QU2605-96-H3T4-49053",
            "originAddress": {"line1": "Origin"},
            "destinationAddress": {"line1": "Dest"},
        },
        document_type="shipping_label",
        options=PdfDisplayOptions(),
        items=None,
    )

    # Optional fields are absent (not stringified "None") so the Jinja template's
    # `{% if data.field %}` guards collapse the corresponding rows cleanly.
    assert data.get("serviceTier") is None
    assert data.get("dimensions") is None
    assert data.get("packageQuantity") is None
    assert data.get("fragile") is False
    assert data.get("recipientEmail") is None
    assert data.get("recipientPhone") is None
    assert data.get("weightKg") is None
    assert data.get("referenceNumber") is None


def test_shipping_label_reference_falls_back_to_none_when_only_id():
    # Don't echo the shipment id back as a reference — it's already in tracking.
    data = build_pdf_data_from_shipment(
        shipment={"id": "shp_1", "trackingNumber": "TRK", "reference": "shp_1"},
        document_type="shipping_label",
        options=PdfDisplayOptions(),
    )
    assert data.get("referenceNumber") is None


@pytest.mark.asyncio
async def test_latest_completed_label_returns_none_when_no_label_exists(monkeypatch):
    async def fake_fetchrow(query, *args):
        assert "type = 'shipping_label'" in query
        assert "status = 'COMPLETED'" in query
        assert args == ("tenant_a", "shp_1")
        return None

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    assert await latest_completed_label("tenant_a", "shp_1") is None


@pytest.mark.asyncio
async def test_latest_completed_label_is_tenant_scoped(monkeypatch):
    captured = {}

    async def fake_fetchrow(query, *args):
        captured["args"] = args
        return {"id": "doc_1", "status": "COMPLETED", "metadata": {}, "url": "https://x/y.pdf"}

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    row = await latest_completed_label("tenant_a", "shp_1")
    assert row is not None
    assert captured["args"] == ("tenant_a", "shp_1")


def test_request_data_options_cannot_override_trusted_shipment_fields():
    request = payload(
        data={"trackingNumber": "ATTACKER", "recipientName": "Mallory"},
        options={"currency": "gbp"},
    )
    data = build_pdf_data_from_shipment(
        shipment={
            "id": "shp_1",
            "trackingNumber": "TRUSTED",
            "recipientName": "Alice",
            "destinationAddress": {"line1": "1 Trusted Street"},
        },
        document_type=request.type,
        options=request.options,
    )

    assert data["trackingNumber"] == "TRUSTED"
    assert data["billTo"]["name"] == "Alice"
    assert data["currency"] == "GBP"
