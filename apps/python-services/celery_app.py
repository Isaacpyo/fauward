from __future__ import annotations

import logging
from datetime import timedelta

from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_ready, worker_shutdown
from kombu import Queue

import db
from config import settings
from lib.json_logging import configure_logging
from workers import start_queue_bridge

configure_logging()
logger = logging.getLogger(__name__)

celery_app = Celery("fauward_python_services", broker=settings.redis_url, backend=settings.redis_url)

celery_app.conf.update(
    timezone="UTC",
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_hijack_root_logger=False,
    task_queues=(
        Queue("pdf"),
        Queue("routes"),
        Queue("analytics"),
        Queue("ocr"),
        Queue("notifications"),
        Queue("pricing"),
        Queue("customs"),
        Queue("ml"),
    ),
    task_routes={
        "workers.pdf_worker.process_pdf_job": {"queue": "pdf"},
        "workers.route_worker.process_route_job": {"queue": "routes"},
        "workers.ocr_worker.process_ocr_job": {"queue": "ocr"},
        "workers.notifications_worker.process_notification_job": {"queue": "notifications"},
        "workers.customs_worker.process_customs_job": {"queue": "customs"},
        "workers.pricing_worker.refresh_demand_signals": {"queue": "pricing"},
        "workers.pricing_worker.retrain_pricing_model": {"queue": "pricing"},
        "workers.analytics_worker.nightly_rollup": {"queue": "analytics"},
        "workers.analytics_worker.realtime_kpis": {"queue": "analytics"},
        "workers.analytics_worker.cohort_analysis": {"queue": "analytics"},
        "workers.analytics_worker.churn_signals": {"queue": "analytics"},
        "workers.ml_worker.train_delay_model": {"queue": "ml"},
        "workers.ml_worker.train_churn_model": {"queue": "ml"},
        "workers.ml_worker.train_lead_model": {"queue": "ml"},
        "workers.ml_worker.score_all_shipments": {"queue": "ml"},
        "workers.ml_worker.score_all_tenants": {"queue": "ml"},
        "workers.ml_worker.score_all_leads": {"queue": "ml"},
    },
    beat_schedule={
        "analytics-nightly-rollup": {
            "task": "workers.analytics_worker.nightly_rollup",
            "schedule": crontab(hour=2, minute=0),
        },
        "analytics-realtime-kpis": {
            "task": "workers.analytics_worker.realtime_kpis",
            "schedule": timedelta(hours=1),
        },
        "analytics-weekly-cohorts": {
            "task": "workers.analytics_worker.cohort_analysis",
            "schedule": crontab(hour=2, minute=30, day_of_week="sun"),
        },
        "analytics-daily-churn-signals": {
            "task": "workers.analytics_worker.churn_signals",
            "schedule": crontab(hour=2, minute=45),
        },
        "pricing-hourly-demand-signals": {
            "task": "workers.pricing_worker.refresh_demand_signals",
            "schedule": timedelta(hours=1),
        },
        "pricing-weekly-retrain": {
            "task": "workers.pricing_worker.retrain_pricing_model",
            "schedule": crontab(hour=3, minute=45, day_of_week="sun"),
        },
        "ml-weekly-delay-train": {
            "task": "workers.ml_worker.train_delay_model",
            "schedule": crontab(hour=3, minute=0, day_of_week="sun"),
        },
        "ml-weekly-churn-train": {
            "task": "workers.ml_worker.train_churn_model",
            "schedule": crontab(hour=3, minute=30, day_of_week="sun"),
        },
        "ml-weekly-lead-train": {
            "task": "workers.ml_worker.train_lead_model",
            "schedule": crontab(hour=4, minute=0, day_of_week="sun"),
        },
        "ml-hourly-score-shipments": {
            "task": "workers.ml_worker.score_all_shipments",
            "schedule": timedelta(hours=1),
        },
        "ml-daily-score-tenants": {
            "task": "workers.ml_worker.score_all_tenants",
            "schedule": crontab(hour=6, minute=0),
        },
        "ml-daily-score-leads": {
            "task": "workers.ml_worker.score_all_leads",
            "schedule": crontab(hour=6, minute=30),
        },
    },
)


@worker_ready.connect
def on_worker_ready(sender=None, **_: object) -> None:
    queue_task_map = {
        "fauward:pdf:generate": ("workers.pdf_worker.process_pdf_job", "pdf"),
        "fauward:routes:optimize": ("workers.route_worker.process_route_job", "routes"),
        "fauward:ocr:parse": ("workers.ocr_worker.process_ocr_job", "ocr"),
        "fauward:notifications:send": ("workers.notifications_worker.process_notification_job", "notifications"),
        "fauward:customs:generate": ("workers.customs_worker.process_customs_job", "customs"),
        "fauward:pricing:quote": ("workers.pricing_worker.process_pricing_job", "pricing"),
        "fauward:ml:score": ("workers.ml_worker.process_ml_score_job", "ml"),
    }
    start_queue_bridge(celery_app, queue_task_map)


@worker_shutdown.connect
def on_worker_shutdown(**_: object) -> None:
    logger.info("celery_worker_shutdown")


# Import task modules after the Celery app is configured.
from workers import analytics_worker as _analytics_worker  # noqa: E402,F401
from workers import customs_worker as _customs_worker  # noqa: E402,F401
from workers import ml_worker as _ml_worker  # noqa: E402,F401
from workers import notifications_worker as _notifications_worker  # noqa: E402,F401
from workers import ocr_worker as _ocr_worker  # noqa: E402,F401
from workers import pdf_worker as _pdf_worker  # noqa: E402,F401
from workers import pricing_worker as _pricing_worker  # noqa: E402,F401
from workers import route_worker as _route_worker  # noqa: E402,F401
