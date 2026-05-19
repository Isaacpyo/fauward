from __future__ import annotations

import os

from observability.schemas import ConfigWarning, ConfigWarningStatus

# (name, required, category)
ENV_SPEC: list[tuple[str, bool, str]] = [
    # Core infrastructure
    ("DATABASE_URL",          True,  "database"),
    ("REDIS_URL",             True,  "redis"),
    # Business health proxy
    ("BACKEND_URL",           True,  "service-urls"),
    ("MONITORING_API_KEY",    True,  "service-urls"),
    # External services
    ("SUPABASE_URL",          False, "service-urls"),
    ("SUPABASE_SERVICE_ROLE_KEY", False, "service-urls"),
    ("SENDGRID_API_KEY",      False, "smtp"),
    ("TWILIO_ACCOUNT_SID",    False, "smtp"),
    # Alert channels (one recommended)
    ("SLACK_WEBHOOK_URL",     False, "alerts"),
    ("DISCORD_WEBHOOK_URL",   False, "alerts"),
    ("ALERT_WEBHOOK_URL",     False, "alerts"),
    # Observability tooling (presence-only)
    ("PROMETHEUS_URL",        False, "observability-tools"),
    ("GRAFANA_URL",           False, "observability-tools"),
    ("SENTRY_DSN",            False, "observability-tools"),
    ("FLOWER_URL",            False, "observability-tools"),
    ("LOKI_URL",              False, "observability-tools"),
    # Python service config
    ("PYTHON_OBS_API_KEY",    False, "service-urls"),
]


def validate_observability_env(environment: str = "local") -> list[ConfigWarning]:
    """
    Checks whether env vars are present — never returns actual values.
    """
    warnings: list[ConfigWarning] = []
    for name, required, category in ENV_SPEC:
        value = os.getenv(name, "")
        if value:
            status = ConfigWarningStatus.configured
        elif required:
            status = ConfigWarningStatus.missing
        else:
            status = ConfigWarningStatus.optional_missing

        warnings.append(
            ConfigWarning(
                name=name,
                status=status,
                required=required,
                category=category,
                environment=environment,
            )
        )
    return warnings
