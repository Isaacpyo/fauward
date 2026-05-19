from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    database_url: str = Field(default="", alias="DATABASE_URL")
    supabase_db_url: str = Field(default="", alias="SUPABASE_DB_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    sendgrid_api_key: str = Field(default="", alias="SENDGRID_API_KEY")
    twilio_account_sid: str = Field(default="", alias="TWILIO_ACCOUNT_SID")
    twilio_auth_token: str = Field(default="", alias="TWILIO_AUTH_TOKEN")
    twilio_from: str = Field(default="", alias="TWILIO_FROM")
    osrm_base_url: str = Field(default="http://router.project-osrm.org", alias="OSRM_BASE_URL")
    queue_listeners_enabled: bool = Field(default=True, alias="PYTHON_QUEUE_LISTENERS_ENABLED")
    local_storage_dir: Path = Field(default=Path(".storage"), alias="PYTHON_LOCAL_STORAGE_DIR")
    default_email_from: str = Field(default="no-reply@fauward.com", alias="PYTHON_DEFAULT_EMAIL_FROM")
    weather_disruption_regions: Optional[str] = Field(default="", alias="WEATHER_DISRUPTION_REGIONS")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO", alias="LOG_LEVEL")
    # Observability / status dashboard
    backend_url: str = Field(default="http://localhost:3001", alias="BACKEND_URL")
    monitoring_api_key: str = Field(default="", alias="MONITORING_API_KEY")
    python_obs_api_key: str = Field(default="", alias="PYTHON_OBS_API_KEY")
    prod_api_url: str = Field(default="", alias="PROD_API_URL")
    prod_frontend_url: str = Field(default="", alias="PROD_FRONTEND_URL")
    prod_tenant_portal_url: str = Field(default="", alias="PROD_TENANT_PORTAL_URL")
    prod_super_admin_url: str = Field(default="", alias="PROD_SUPER_ADMIN_URL")
    prod_fauward_go_url: str = Field(default="", alias="PROD_FAUWARD_GO_URL")
    prod_python_api_url: str = Field(default="", alias="PROD_PYTHON_API_URL")
    prometheus_url: str = Field(default="", alias="PROMETHEUS_URL")
    grafana_url: str = Field(default="", alias="GRAFANA_URL")
    sentry_dsn: str = Field(default="", alias="SENTRY_DSN")
    flower_url: str = Field(default="", alias="FLOWER_URL")
    loki_url: str = Field(default="", alias="LOKI_URL")

    @computed_field
    @property
    def resolved_database_url(self) -> str:
        return self.database_url or self.supabase_db_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
