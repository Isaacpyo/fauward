import pytest
from fastapi import HTTPException

import db
from api.auth import AuthContext, require_scope
from schemas.ocr import OcrJsonRequest
from services import ocr_service
from services.ocr_service import build_ocr_payload_from_upload, fetch_ocr_result, queue_ocr_parse
from services.storage_service import read_upload_file_limited, validate_content_type, validate_trusted_file_url


def auth(tenant_id: str = "tenant_a", scopes: tuple[str, ...] = ("ocr:write", "ocr:read")) -> AuthContext:
    return AuthContext(tenant_id=tenant_id, scopes=scopes, key_type="tenant", api_key_id="key_1")


def admin() -> AuthContext:
    return AuthContext(tenant_id="platform", scopes=("platform:admin",), key_type="platform", api_key_id="platform_key")


class FakeUpload:
    filename = "invoice?.pdf"
    content_type = "application/pdf"

    def __init__(self, chunks):
        self.chunks = list(chunks)

    async def read(self, _size):
        return self.chunks.pop(0) if self.chunks else b""


@pytest.mark.asyncio
async def test_ocr_requires_scope():
    dependency = require_scope("ocr:write")

    with pytest.raises(HTTPException) as exc:
        await dependency(AuthContext(tenant_id="tenant_a", scopes=("ocr:read",), key_type="tenant"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_tenant_is_resolved_before_upload_storage(monkeypatch):
    stored = {}

    async def fake_read(file):
        return b"pdf"

    async def fake_store(**kwargs):
        stored.update(kwargs)
        return "file:///tmp/.storage/documents/tenant_a/ocr/job_1.pdf"

    monkeypatch.setattr(ocr_service, "read_upload_file_limited", fake_read)
    monkeypatch.setattr(ocr_service, "store_uploaded_file", fake_store)

    result = await build_ocr_payload_from_upload(
        auth=auth("tenant_a"),
        tenant_id="tenant_b",
        document_type="customs_form",
        file=FakeUpload([b"pdf"]),
        job_id="job_1",
    )

    assert stored["tenant_id"] == "tenant_a"
    assert result.tenantId == "tenant_a"


@pytest.mark.asyncio
async def test_reject_oversized_upload():
    file = FakeUpload([b"x" * (1024 * 1024), b"x"])

    with pytest.raises(HTTPException) as exc:
        await read_upload_file_limited(file, max_bytes=1024 * 1024)

    assert exc.value.status_code == 413


def test_reject_unsupported_upload_type():
    with pytest.raises(HTTPException) as exc:
        validate_content_type("application/x-msdownload")

    assert exc.value.status_code == 415


def test_reject_untrusted_file_url():
    with pytest.raises(HTTPException) as exc:
        validate_trusted_file_url("http://169.254.169.254/latest/meta-data")

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_queue_publish_failure_marks_job_failed(monkeypatch):
    executed = []

    async def fake_execute(query, *args):
        executed.append((query, args))
        return "UPDATE 1"

    monkeypatch.setattr(db, "execute", fake_execute)
    monkeypatch.setattr(ocr_service, "validate_trusted_file_url", lambda url: url)

    with pytest.raises(ocr_service.OcrQueuePublishError):
        await queue_ocr_parse(
            payload=OcrJsonRequest(tenantId="tenant_a", documentType="customs_form", fileUrl="file:///tmp/a.pdf"),
            auth=auth(),
            publisher=lambda queue, body: (_ for _ in ()).throw(RuntimeError("redis secret")),
        )

    assert any("insert into parsed_documents" in query.lower() for query, _args in executed)
    assert any("set status = 'FAILED'" in query for query, _args in executed)


@pytest.mark.asyncio
async def test_cross_tenant_ocr_result_returns_404(monkeypatch):
    async def fake_get(job_id, tenant_id=None):
        assert tenant_id == "tenant_a"
        return None

    monkeypatch.setattr(ocr_service, "get_ocr_job_for_tenant", fake_get)

    with pytest.raises(HTTPException) as exc:
        await fetch_ocr_result("job_b", auth("tenant_a"))

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_normal_tenant_does_not_receive_internal_ocr_error(monkeypatch):
    async def fake_get(job_id, tenant_id=None):
        return {
            "job_id": job_id,
            "tenant_id": tenant_id,
            "document_type": "customs_form",
            "extracted_fields": {},
            "confidence_score": 0,
            "status": "FAILED",
            "error_message": "Traceback redis://secret",
        }

    monkeypatch.setattr(ocr_service, "get_ocr_job_for_tenant", fake_get)

    result = await fetch_ocr_result("job_1", auth("tenant_a"))

    assert result["error"] == "OCR parsing failed"


@pytest.mark.asyncio
async def test_super_admin_receives_ocr_diagnostics(monkeypatch):
    async def fake_get(job_id, tenant_id=None):
        assert tenant_id is None
        return {
            "job_id": job_id,
            "tenant_id": "tenant_a",
            "document_type": "customs_form",
            "extracted_fields": {},
            "confidence_score": 0,
            "status": "FAILED",
            "error_message": "provider timeout",
        }

    monkeypatch.setattr(ocr_service, "get_ocr_job_for_tenant", fake_get)

    result = await fetch_ocr_result("job_1", admin())

    assert result["error"] == "provider timeout"
