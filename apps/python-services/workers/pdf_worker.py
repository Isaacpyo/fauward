import asyncio
import base64
import io
from pathlib import Path
from typing import Any

import qrcode
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

import db
from celery_app import celery_app
from lib.storage import upload_bytes
from models.pdf_schemas import PdfDisplayOptions
from services.pdf_jobs import build_pdf_data_from_shipment, fetch_shipment_for_tenant
from workers import run_worker

TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates"

PDF_TEMPLATES = {
    "invoice": "invoice.html",
    "shipping_label": "shipping_label.html",
    "pod": "pod.html",
    "manifest": "manifest.html",
}


def _environment() -> Environment:
    return Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(("html", "xml")),
    )


def _qr_data_uri(value: str) -> str:
    image = qrcode.make(value)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


async def _tenant_branding(tenant_id: str) -> dict[str, Any]:
    row = await db.fetchrow(
        """
        select name, "logoUrl", "primaryColor", "accentColor", "brandName"
        from tenants
        where id = $1
        """,
        tenant_id,
    )
    if not row:
        return {
            "name": "Fauward",
            "logoUrl": None,
            "primaryColor": "#0D1F3C",
            "accentColor": "#D97706",
            "brandName": "Fauward",
        }
    return {
        "name": row["name"],
        "logoUrl": row["logoUrl"],
        "primaryColor": row["primaryColor"] or "#0D1F3C",
        "accentColor": row["accentColor"] or "#D97706",
        "brandName": row["brandName"] or row["name"],
    }


def _render_pdf(template_name: str, context: dict[str, Any]) -> bytes:
    template = _environment().get_template(template_name)
    html = template.render(**context)
    return HTML(string=html, base_url=str(TEMPLATE_DIR)).write_pdf()


async def handle_pdf_job(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload["jobId"])
    tenant_id = str(payload["tenantId"])
    document_type = str(payload["type"])
    shipment_id = str(payload.get("shipmentId") or "")
    options = PdfDisplayOptions.model_validate(dict(payload.get("options") or {}))
    template_name = PDF_TEMPLATES.get(document_type)
    if template_name is None:
        raise ValueError(f"Unsupported PDF type: {document_type}")
    shipment = await fetch_shipment_for_tenant(tenant_id, shipment_id)
    if shipment is None:
        raise ValueError("Shipment not found")

    updated = await db.execute(
        """
        update documents
        set status = 'PROCESSING',
            error_message = null,
            updated_at = now()
        where id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
    )
    if updated == "UPDATE 0":
        raise ValueError("PDF job not found")

    branding = await _tenant_branding(tenant_id)
    data = build_pdf_data_from_shipment(shipment=shipment, document_type=document_type, options=options)
    if document_type == "shipping_label":
        tracking_ref = str(data.get("trackingRef") or data.get("trackingNumber") or shipment_id)
        data["qrCodeDataUri"] = _qr_data_uri(tracking_ref)

    context = {
        "tenant": branding,
        "type": document_type,
        "shipmentId": shipment_id,
        "data": data,
    }
    pdf_bytes = await asyncio.to_thread(_render_pdf, template_name, context)
    path = f"{tenant_id}/{document_type}/{shipment_id or job_id}.pdf"
    url = await asyncio.to_thread(
        upload_bytes,
        bucket="documents",
        path=path,
        content=pdf_bytes,
        content_type="application/pdf",
    )

    updated = await db.execute(
        """
        update documents
        set url = $5,
            status = 'COMPLETED',
            error_message = null,
            metadata = metadata || $6::jsonb,
            updated_at = now()
        where id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
        shipment_id or None,
        document_type,
        url,
        db.json_dumps({"storagePath": path}),
    )
    if updated == "UPDATE 0":
        raise ValueError("PDF job not found")
    if await db.table_exists("shipment_documents"):
        await db.execute(
            """
            update shipment_documents
            set "fileUrl" = $1
            where "tenantId" = $3
              and (id = $2 or ("shipmentId" = $4 and lower(type::text) = $5))
            """,
            url,
            job_id,
            tenant_id,
            shipment_id,
            document_type,
        )
    return {"url": url, "type": document_type, "shipmentId": shipment_id}


@celery_app.task(name="workers.pdf_worker.process_pdf_job", queue="pdf")
def process_pdf_job(payload: dict[str, Any]) -> dict[str, Any]:
    return run_worker(
        worker_name="pdf_worker",
        done_queue="fauward:pdf:done",
        payload=payload,
        handler=handle_pdf_job,
    )
