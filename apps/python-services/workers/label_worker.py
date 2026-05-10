import asyncio
import base64
import io
import urllib.error
import urllib.request
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


def _embed_logo_data_uri(url: str | None) -> str | None:
    if not url:
        return None
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "FauwardLabelWorker/1.0"})
        with urllib.request.urlopen(request, timeout=5) as response:
            content_type = response.headers.get("content-type") or "image/png"
            if not content_type.startswith("image/"):
                return None
            data = response.read(1_000_000)
            encoded = base64.b64encode(data).decode("ascii")
            return f"data:{content_type};base64,{encoded}"
    except (OSError, urllib.error.URLError, ValueError):
        return None


def _zpl_safe(value: Any) -> str:
    return str(value or "").replace("^", "").replace("~", "")[:180]


def _render_zpl(data: dict[str, Any], tenant: dict[str, Any]) -> bytes:
    tracking = _zpl_safe(data.get("trackingRef") or data.get("trackingNumber"))
    origin = _zpl_safe(data.get("originAddress") or data.get("origin"))
    destination = _zpl_safe(data.get("destAddress") or data.get("destinationAddress") or data.get("destination"))
    weight = _zpl_safe(data.get("weightKg") or data.get("weight") or "")
    brand = _zpl_safe(tenant.get("brandName") or tenant.get("name") or "Fauward")
    return f"""^XA
^CI28
^FO40,30^A0N,32,32^FD{brand}^FS
^FO40,80^A0N,28,28^FD{tracking}^FS
^FO40,125^BY2
^BCN,90,Y,N,N^FD{tracking}^FS
^FO40,245^BQN,2,5^FDQA,{tracking}^FS
^FO260,245^A0N,24,24^FDOrigin^FS
^FO260,275^A0N,22,22^FD{origin}^FS
^FO260,350^A0N,24,24^FDDestination^FS
^FO260,380^A0N,22,22^FD{destination}^FS
^FO40,520^A0N,24,24^FDWeight: {weight} kg^FS
^XZ""".encode("utf-8")


def _render_pdf(data: dict[str, Any], tenant: dict[str, Any]) -> bytes:
    tracking_ref = str(data.get("trackingRef") or data.get("trackingNumber") or "")
    context = {
        "tenant": tenant,
        "type": "shipping_label",
        "shipmentId": data.get("shipmentId"),
        "data": {
            **data,
            "qrCodeDataUri": _qr_data_uri(tracking_ref),
        },
    }
    html = _environment().get_template("shipping_label.html").render(**context)
    return HTML(string=html, base_url=str(TEMPLATE_DIR)).write_pdf()


async def _tenant_branding(tenant_id: str, override: dict[str, Any]) -> dict[str, Any]:
    row = await db.fetchrow(
        """
        select name, "logoUrl", "primaryColor", "accentColor", "brandName"
        from tenants
        where id = $1
        """,
        tenant_id,
    )
    base = {
        "name": "Fauward",
        "logoUrl": None,
        "primaryColor": "#0D1F3C",
        "primaryColour": "#0D1F3C",
        "accentColor": "#D97706",
        "accentColour": "#D97706",
        "brandName": "Fauward",
        "fontFamily": "Arial, sans-serif",
    }
    if row:
        base.update(
            {
                "name": row["name"],
                "logoUrl": row["logoUrl"],
                "primaryColor": row["primaryColor"] or "#0D1F3C",
                "primaryColour": row["primaryColor"] or "#0D1F3C",
                "accentColor": row["accentColor"] or "#D97706",
                "accentColour": row["accentColor"] or "#D97706",
                "brandName": row["brandName"] or row["name"],
            }
        )
    base.update({k: v for k, v in override.items() if v is not None})
    primary = base.get("primaryColour") or base.get("primaryColor") or "#0D1F3C"
    accent = base.get("accentColour") or base.get("accentColor") or "#D97706"
    base["primaryColor"] = primary
    base["primaryColour"] = primary
    base["accentColor"] = accent
    base["accentColour"] = accent
    embedded_logo = _embed_logo_data_uri(base.get("logoUrl"))
    base["logoUrl"] = embedded_logo
    return base


async def handle_label_job(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload["jobId"])
    tenant_id = str(payload["tenantId"])
    shipment_id = str(payload["shipmentId"])
    label_format = str(payload.get("format") or "PDF").upper()
    branding_config = dict(payload.get("brandingConfig") or {})

    shipment = await fetch_shipment_for_tenant(tenant_id, shipment_id)
    if shipment is None:
        raise ValueError("Shipment not found")

    tenant = await _tenant_branding(tenant_id, branding_config)
    data = build_pdf_data_from_shipment(
        shipment=shipment,
        document_type="shipping_label",
        options=PdfDisplayOptions.model_validate(dict(payload.get("options") or {})),
    )
    data["shipmentId"] = shipment_id

    if label_format == "ZPL":
        content = await asyncio.to_thread(_render_zpl, data, tenant)
        content_type = "application/x-zpl"
        extension = "zpl"
    else:
        content = await asyncio.to_thread(_render_pdf, data, tenant)
        content_type = "application/pdf"
        extension = "pdf"

    path = f"{tenant_id}/labels/{shipment_id}-{job_id}.{extension}"
    url = await asyncio.to_thread(
        upload_bytes,
        bucket="documents",
        path=path,
        content=content,
        content_type=content_type,
    )

    await db.execute(
        """
        update generated_labels
        set url = $1
        where id = $2 and "tenantId" = $3
        """,
        url,
        job_id,
        tenant_id,
    )
    return {"url": url, "format": label_format, "shipmentId": shipment_id}


@celery_app.task(name="workers.label_worker.process_label_job", queue="pdf")
def process_label_job(payload: dict[str, Any]) -> dict[str, Any]:
    return run_worker(
        worker_name="label_worker",
        done_queue="fauward:labels:done",
        payload=payload,
        handler=handle_label_job,
    )
