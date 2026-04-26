import asyncio
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from premailer import transform
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from twilio.rest import Client

import db
from celery_app import celery_app
from config import settings
from workers import run_worker

TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates" / "email"

SUBJECTS = {
    "shipment_created": "Shipment created",
    "out_for_delivery": "Out for delivery",
    "delivered": "Delivered",
    "failed_delivery": "Delivery attempt failed",
    "invoice_sent": "Invoice available",
}


def _environment() -> Environment:
    return Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(("html", "xml")),
    )


async def _tenant_branding(tenant_id: str) -> dict[str, Any]:
    row = await db.fetchrow(
        """
        select name, "logoUrl", "primaryColor", "brandName"
        from tenants
        where id = $1
        """,
        tenant_id,
    )
    if not row:
        return {"brandName": "Fauward", "logoUrl": None, "primaryColor": "#0D1F3C"}
    return {
        "brandName": row["brandName"] or row["name"],
        "logoUrl": row["logoUrl"],
        "primaryColor": row["primaryColor"] or "#0D1F3C",
    }


def _render_email(template_key: str, context: dict[str, Any], locale: str) -> str:
    template = _environment().get_template(f"{template_key}.html")
    html = template.render(**context)
    if locale == "ar":
        html = html.replace("<html", '<html dir="rtl"', 1)
    return transform(html)


def _send_email(to_email: str, subject: str, html: str) -> str:
    if not settings.sendgrid_api_key:
        return "sendgrid:not-configured"
    message = Mail(
        from_email=settings.default_email_from,
        to_emails=to_email,
        subject=subject,
        html_content=html,
    )
    response = SendGridAPIClient(settings.sendgrid_api_key).send(message)
    return response.headers.get("X-Message-Id", f"sendgrid:{response.status_code}")


def _send_sms(to_phone: str, body: str) -> str:
    if not (settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from):
        return "twilio:not-configured"
    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    message = client.messages.create(body=body, from_=settings.twilio_from, to=to_phone)
    return str(message.sid)


async def _log_delivery(
    *,
    tenant_id: str,
    channel: str,
    template_key: str,
    recipient_email: str | None,
    status: str,
    provider_message_id: str,
    error: str | None = None,
) -> None:
    await db.execute(
        """
        insert into notification_logs ("tenantId", channel, event, status, "providerRef", error, "sentAt", "createdAt")
        values ($1, $2, $3, $4, $5, $6, now(), now())
        """,
        tenant_id,
        channel.upper(),
        template_key,
        status,
        provider_message_id,
        error,
    )


async def handle_notification_job(payload: dict[str, Any]) -> dict[str, Any]:
    tenant_id = str(payload["tenantId"])
    channel = str(payload["channel"]).lower()
    template_key = str(payload["templateKey"])
    recipient = dict(payload.get("recipient") or {})
    variables = dict(payload.get("variables") or {})
    locale = str(payload.get("locale") or "en")
    branding = await _tenant_branding(tenant_id)

    provider_message_id = ""
    if channel == "email":
        email = str(recipient.get("email") or "")
        if not email:
            raise ValueError("Email recipient is required")
        html = await asyncio.to_thread(
            _render_email,
            template_key,
            {"tenant": branding, "recipient": recipient, "variables": variables, "locale": locale},
            locale,
        )
        subject = SUBJECTS.get(template_key, template_key.replace("_", " ").title())
        provider_message_id = await asyncio.to_thread(_send_email, email, subject, html)
        await _log_delivery(
            tenant_id=tenant_id,
            channel="EMAIL",
            template_key=template_key,
            recipient_email=email,
            status="SENT" if "not-configured" not in provider_message_id else "SKIPPED",
            provider_message_id=provider_message_id,
        )
    elif channel == "sms":
        phone = str(recipient.get("phone") or "")
        if not phone:
            raise ValueError("SMS recipient phone is required")
        body = str(variables.get("message") or variables.get("trackingRef") or template_key)
        provider_message_id = await asyncio.to_thread(_send_sms, phone, body)
        await _log_delivery(
            tenant_id=tenant_id,
            channel="SMS",
            template_key=template_key,
            recipient_email=None,
            status="SENT" if "not-configured" not in provider_message_id else "SKIPPED",
            provider_message_id=provider_message_id,
        )
    else:
        raise ValueError(f"Unsupported notification channel: {channel}")
    return {"channel": channel, "templateKey": template_key, "providerMessageId": provider_message_id}


@celery_app.task(bind=True, name="workers.notifications_worker.process_notification_job", queue="notifications", max_retries=3)
def process_notification_job(self: Any, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return run_worker(
            worker_name="notifications_worker",
            done_queue="fauward:notifications:done",
            payload=payload,
            handler=handle_notification_job,
        )
    except Exception as exc:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=2 ** self.request.retries)
        raise
