from __future__ import annotations

import asyncio
from logging.config import fileConfig
import os
from pathlib import Path
import sys

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import settings  # noqa: E402
from models.base import Base  # noqa: E402
from models import invoicing as _invoicing_models  # noqa: E402,F401
from services.invoicing.database import sqlalchemy_connect_args, sqlalchemy_database_url  # noqa: E402

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or settings.resolved_database_url
    if not url:
        raise RuntimeError("DATABASE_URL or SUPABASE_DB_URL is required for Alembic migrations")
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=sqlalchemy_database_url(get_url()),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    raw_url = get_url()
    connectable = create_async_engine(
        sqlalchemy_database_url(raw_url),
        poolclass=pool.NullPool,
        connect_args=sqlalchemy_connect_args(raw_url),
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
