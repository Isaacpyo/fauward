import asyncio
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from lxml import etree

import db
from celery_app import celery_app
from lib.storage import upload_bytes
from services.customs_declarations import build_customs_shipment_data, fetch_shipment_for_tenant
from workers import run_worker

TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates" / "customs"

CUSTOMS_SCHEMA = etree.XMLSchema(
    etree.XML(
        b"""
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
          <xs:element name="Declaration">
            <xs:complexType>
              <xs:sequence>
                <xs:any minOccurs="0" maxOccurs="unbounded" processContents="lax"/>
              </xs:sequence>
              <xs:attribute name="type" type="xs:string" use="required"/>
            </xs:complexType>
          </xs:element>
        </xs:schema>
        """
    )
)


def _environment() -> Environment:
    return Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(("xml", "j2")),
    )


def _render_xml(declaration_type: str, context: dict[str, Any]) -> bytes:
    template = _environment().get_template(f"{declaration_type}.xml.j2")
    xml = template.render(**context).encode("utf-8")
    document = etree.fromstring(xml)
    CUSTOMS_SCHEMA.assertValid(document)
    return etree.tostring(document, pretty_print=True, xml_declaration=True, encoding="utf-8")


def _render_ioss_xml(shipment_data: dict[str, Any]) -> bytes:
    items = list(shipment_data.get("items") or [])
    total_value = sum(float(item.get("declaredValue", item.get("value", 0)) or 0) for item in items)
    vat_amount = round(total_value * 0.20, 2)
    xml = _environment().get_template("ioss.xml.j2").render(
        shipment=SimpleNamespace(**{**shipment_data, "totalDeclaredValue": total_value}),
        vat_amount=vat_amount,
        now=datetime.utcnow().isoformat(),
    ).encode("utf-8")
    document = etree.fromstring(xml)
    return etree.tostring(document, pretty_print=True, xml_declaration=True, encoding="utf-8")


async def handle_customs_job(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload["jobId"])
    tenant_id = str(payload["tenantId"])
    shipment_id = str(payload["shipmentId"])
    declaration_type = str(payload["declarationType"])
    options = dict(payload.get("options") or {})
    if declaration_type not in {"uk_cds", "eu_aes", "ioss"}:
        raise ValueError(f"Unsupported declaration type: {declaration_type}")
    shipment = await fetch_shipment_for_tenant(tenant_id, shipment_id)
    if shipment is None:
        raise ValueError("Shipment not found")
    updated = await db.execute(
        """
        update customs_declarations
        set status = 'PROCESSING',
            error_message = null,
            updated_at = now()
        where id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
    )
    if updated == "UPDATE 0":
        raise ValueError("Customs declaration not found")

    shipment_data = build_customs_shipment_data(shipment, options)
    if declaration_type == "ioss":
        xml_bytes = await asyncio.to_thread(_render_ioss_xml, shipment_data)
    else:
        xml_bytes = await asyncio.to_thread(
            _render_xml,
            declaration_type,
            {"jobId": job_id, "tenantId": tenant_id, "shipmentId": shipment_id, "shipment": shipment_data},
        )
    path = f"{tenant_id}/customs/{shipment_id}-{declaration_type}.xml"
    url = await asyncio.to_thread(
        upload_bytes,
        bucket="documents",
        path=path,
        content=xml_bytes,
        content_type="application/xml",
    )
    updated = await db.execute(
        """
        update customs_declarations
        set xml_url = $5,
            status = 'COMPLETED',
            metadata = metadata || $6::jsonb,
            error_message = null,
            updated_at = now()
        where id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
        shipment_id,
        declaration_type,
        url,
        db.json_dumps({"storagePath": path}),
    )
    if updated == "UPDATE 0":
        raise ValueError("Customs declaration not found")
    return {"declarationType": declaration_type, "shipmentId": shipment_id, "url": url}


@celery_app.task(name="workers.customs_worker.process_customs_job", queue="customs")
def process_customs_job(payload: dict[str, Any]) -> dict[str, Any]:
    return run_worker(
        worker_name="customs_worker",
        done_queue="fauward:customs:done",
        payload=payload,
        handler=handle_customs_job,
    )
