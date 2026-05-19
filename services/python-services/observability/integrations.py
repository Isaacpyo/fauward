from __future__ import annotations

import os

INTEGRATION_ENV_MAP: dict[str, str] = {
    "prometheus": "PROMETHEUS_URL",
    "grafana":    "GRAFANA_URL",
    "sentry":     "SENTRY_DSN",
    "loki":       "LOKI_URL",
    "flower":     "FLOWER_URL",
}


def detect_integrations() -> dict[str, str]:
    """Returns name → 'configured' | 'not_configured' for each observability tool."""
    return {
        name: ("configured" if os.getenv(env_var, "") else "not_configured")
        for name, env_var in INTEGRATION_ENV_MAP.items()
    }


def get_integration_urls() -> dict[str, str | None]:
    """Returns name → URL (or None). Only safe to surface as links — values are URLs, not secrets."""
    return {
        name: (os.getenv(env_var) or None)
        for name, env_var in INTEGRATION_ENV_MAP.items()
    }
