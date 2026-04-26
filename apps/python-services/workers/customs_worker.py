import asyncio
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from lxml import etree

import db
from celery_app import celery_app
from lib.storage import upload_bytes
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


async def handle_customs_job(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload["jobId"])
    tenant_id = str(payload["tenantId"])
    shipment_id = str(payload["shipmentId"])
    declaration_type = str(payload["declarationType"])
    shipment_data = dict(payload.get("shipmentData") or {})
    if declaration_type not in {"uk_cds", "eu_aes"}:
        raise ValueError(f"Unsupported declaration type: {declaration_type}")
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
    await db.execute(
        """
        insert into customs_declarations (id, tenant_id, shipment_id, declaration_type, xml_url, status, metadata, updated_at)
        values ($1, $2, $3, $4, $5, 'READY', $6::jsonb, now())
        on conflict (id) do update
        set xml_url = excluded.xml_url,
            status = 'READY',
            metadata = excluded.metadata,
            error_message = null,
            updated_at = now()
        """,
        job_id,
        tenant_id,
        shipment_id,
        declaration_type,
        url,
        db.json_dumps({"storagePath": path}),
    )
    return {"declarationType": declaration_type, "shipmentId": shipment_id, "url": url}


@celery_app.task(name="workers.customs_worker.process_customs_job", queue="customs")
def process_customs_job(payload: dict[str, Any]) -> dict[str, Any]:
    return run_worker(
        worker_name="customs_worker",
        done_queue="fauward:customs:done",
        payload=payload,
        handler=handle_customs_job,
    )
