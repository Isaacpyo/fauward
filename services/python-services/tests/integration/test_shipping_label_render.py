"""Integration tests that exercise the real shipping_label render path:
python-barcode Code128 SVG, qrcode QR data URI, and the enriched Jinja template.

The full WeasyPrint PDF byte render is attempted only when WeasyPrint's GTK
backend is importable on the host — on Windows dev machines without GTK we
skip the PDF assertion while still verifying the HTML, SVG, and QR content.
"""

from pathlib import Path
from typing import Any

import pytest
from jinja2 import Environment, FileSystemLoader, select_autoescape

import db
from models.pdf_schemas import PdfDisplayOptions
from workers.pdf_worker import _code128_svg, _qr_data_uri, _resolve_label_snapshot

TEMPLATE_DIR = Path(__file__).resolve().parents[2] / "templates"


def _render_html(snapshot: dict[str, Any]) -> str:
    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR), autoescape=select_autoescape(("html", "xml")))
    return env.get_template("shipping_label.html").render(**snapshot)


def test_code128_svg_is_inline_and_strips_xml_declaration():
    svg = _code128_svg("QU2605-96-H3T4-49053")
    assert svg.startswith("<svg") or svg.startswith("<!DOCTYPE"), svg[:80]
    assert "<?xml" not in svg
    assert svg.count("<rect") > 10


def test_qr_data_uri_is_well_formed_png():
    uri = _qr_data_uri("https://track.fauward.com/QU2605-96-H3T4-49053")
    assert uri.startswith("data:image/png;base64,")
    # PNG payload should decode to non-trivial bytes.
    import base64

    payload = base64.b64decode(uri.split(",", 1)[1])
    assert payload[:4] == b"\x89PNG"


@pytest.mark.asyncio
async def test_resolve_label_snapshot_produces_full_field_bag(monkeypatch):
    async def fake_fetchrow(query, *args):
        if "from shipments" in query:
            return {
                "id": "shp_1",
                "tenantId": "tenant_a",
                "trackingNumber": "QU2605-96-H3T4-49053",
                "serviceTier": "STANDARD",
                "weightKg": "4.200",
                "createdAt": "2026-05-25T17:13:00Z",
                "originAddress": {"line1": "Nehru Place", "city": "New Delhi", "country": "India"},
                "destinationAddress": {
                    "name": "Leila Rashid",
                    "line1": "28 Dunford Drive",
                    "city": "Doncaster",
                    "postcode": "DN4 0GF",
                    "country": "United Kingdom",
                    "email": "leila.rashid@outlook.com",
                    "phone": "+44 7799 945678",
                },
            }
        if "from tenants" in query:
            return {
                "name": "Acme Logistics",
                "logoUrl": None,
                "primaryColor": "#1d4ed8",
                "accentColor": "#f97316",
                "brandName": "Acme",
            }
        raise AssertionError(query)

    async def fake_fetch(query, *args):
        assert "from shipment_items" in query
        return [{"quantity": 1, "lengthCm": "30", "widthCm": "20", "heightCm": "15", "isDangerous": False}]

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "fetch", fake_fetch)

    snapshot = await _resolve_label_snapshot(
        tenant_id="tenant_a",
        shipment_id="shp_1",
        options=PdfDisplayOptions(),
    )

    assert snapshot["tenant"]["brandName"] == "Acme"
    assert snapshot["data"]["serviceTier"] == "STANDARD"
    assert snapshot["data"]["recipientEmail"] == "leila.rashid@outlook.com"
    assert snapshot["data"]["dimensions"] == "30 × 20 × 15 cm"
    assert snapshot["data"]["trackingUrl"].endswith("QU2605-96-H3T4-49053")
    assert snapshot["data"]["qrCodeDataUri"].startswith("data:image/png;base64,")
    assert "<svg" in snapshot["data"]["barcodeSvg"] or "<rect" in snapshot["data"]["barcodeSvg"]


def test_template_renders_full_label_with_all_fields():
    snapshot = {
        "tenant": {
            "name": "Acme Logistics",
            "brandName": "Acme",
            "logoUrl": None,
            "primaryColor": "#1d4ed8",
            "accentColor": "#f97316",
        },
        "type": "shipping_label",
        "shipmentId": "shp_1",
        "data": {
            "trackingRef": "QU2605-96-H3T4-49053",
            "trackingNumber": "QU2605-96-H3T4-49053",
            "serviceTier": "EXPRESS",
            "originAddress": "Nehru Place, New Delhi, India",
            "destAddress": "28 Dunford Drive, Doncaster, DN4 0GF, United Kingdom",
            "recipientName": "Leila Rashid",
            "recipientEmail": "leila.rashid@outlook.com",
            "recipientPhone": "+44 7799 945678",
            "weightKg": "4.2",
            "packageQuantity": 1,
            "dimensions": "30 × 20 × 15 cm",
            "fragile": True,
            "referenceNumber": "REF-9001",
            "createdAt": "25 May 2026",
            "qrCodeDataUri": _qr_data_uri("https://track.fauward.com/QU2605-96-H3T4-49053"),
            "barcodeSvg": _code128_svg("QU2605-96-H3T4-49053"),
        },
    }

    html = _render_html(snapshot)

    assert "QU2605-96-H3T4-49053" in html
    assert "EXPRESS" in html
    assert "Leila Rashid" in html
    assert "leila.rashid@outlook.com" in html
    assert "+44 7799 945678" in html
    assert "30 × 20 × 15 cm" in html
    assert "4.2 kg" in html
    assert "REF-9001" in html
    assert "Fragile" in html
    assert "data:image/png;base64," in html  # QR
    assert "<rect" in html  # Code128 bars inlined
    # Brand fallback is rendered when no logo is set.
    assert "Acme" in html
    # The XML declaration must not leak into the WeasyPrint HTML document.
    assert "<?xml" not in html


def test_template_degrades_when_optional_fields_missing():
    snapshot = {
        "tenant": {
            "name": "Solo",
            "brandName": "Solo",
            "logoUrl": None,
            "primaryColor": "#0D1F3C",
            "accentColor": "#D97706",
        },
        "type": "shipping_label",
        "shipmentId": "shp_1",
        "data": {
            "trackingRef": "TRK-1",
            "trackingNumber": "TRK-1",
            "originAddress": "Origin City",
            "destAddress": "Dest City",
            "recipientName": "Customer",
            "fragile": False,
            "qrCodeDataUri": _qr_data_uri("TRK-1"),
            "barcodeSvg": _code128_svg("TRK-1"),
        },
    }

    html = _render_html(snapshot)

    # No literal "None" strings, no service-tier badge, no fragile badge,
    # no email/phone contact row, no package row, no ref. We look for the
    # element openers, not bare strings, because the CSS class names also
    # appear in the <style> block.
    assert "None" not in html
    assert 'class="service-tier"' not in html
    assert 'class="fragile"' not in html
    assert 'class="addr-contact"' not in html
    assert 'class="package"' not in html
    assert "Ref:" not in html


def test_full_pdf_render_produces_valid_pdf_bytes():
    """Real end-to-end render. Requires WeasyPrint's GTK backend; skip on hosts
    where it cannot load (e.g. Windows dev without the GTK runtime)."""
    try:
        from weasyprint import HTML
    except (OSError, ImportError) as exc:
        pytest.skip(f"WeasyPrint backend unavailable on this host: {exc}")

    snapshot = {
        "tenant": {
            "name": "Acme",
            "brandName": "Acme",
            "logoUrl": None,
            "primaryColor": "#1d4ed8",
            "accentColor": "#f97316",
        },
        "type": "shipping_label",
        "shipmentId": "shp_1",
        "data": {
            "trackingRef": "QU2605-96-H3T4-49053",
            "trackingNumber": "QU2605-96-H3T4-49053",
            "serviceTier": "STANDARD",
            "originAddress": "Origin",
            "destAddress": "Destination",
            "recipientName": "Customer",
            "weightKg": "4.2",
            "packageQuantity": 1,
            "dimensions": "30 × 20 × 15 cm",
            "fragile": False,
            "createdAt": "25 May 2026",
            "qrCodeDataUri": _qr_data_uri("https://track.fauward.com/QU2605-96-H3T4-49053"),
            "barcodeSvg": _code128_svg("QU2605-96-H3T4-49053"),
        },
    }

    html_string = _render_html(snapshot)
    pdf_bytes = HTML(string=html_string, base_url=str(TEMPLATE_DIR)).write_pdf()

    assert pdf_bytes[:5] == b"%PDF-", "WeasyPrint did not produce a valid PDF header"
    # A populated 100x150mm label should be a few KB at minimum.
    assert len(pdf_bytes) > 4_000
