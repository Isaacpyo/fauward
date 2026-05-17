import pytest
from fastapi import HTTPException

import db
from api.auth import AuthContext
from models.pdf_schemas import PdfGenerateRequest
from services.pdf_jobs import (
    QueuePublishError,
    build_pdf_data_from_shipment,
    fetch_document_for_auth,
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
