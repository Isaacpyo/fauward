from functools import lru_cache
from pathlib import Path
from typing import Literal

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
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO", alias="LOG_LEVEL")

    @computed_field
    @property
    def resolved_database_url(self) -> str:
        return self.database_url or self.supabase_db_url

    @computed_field
    @property
    def sqlalchemy_database_url(self) -> str:
        url = self.resolved_database_url
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
