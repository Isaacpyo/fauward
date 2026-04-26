import hashlib
import json
import logging
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import Any

import asyncpg
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None
_engine: AsyncEngine | None = None


def json_dumps(value: Any) -> str:
    return json.dumps(value, default=str, separators=(",", ":"))


def api_key_hash(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


async def connect_db() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool
    if not settings.resolved_database_url:
        raise RuntimeError("DATABASE_URL or SUPABASE_DB_URL is required")
    _pool = await asyncpg.create_pool(
        dsn=settings.resolved_database_url,
        min_size=1,
        max_size=10,
        command_timeout=60,
    )
    await ensure_service_tables()
    return _pool


async def close_db() -> None:
    global _pool, _engine
    if _pool is not None:
        await _pool.close()
        _pool = None
    if _engine is not None:
        await _engine.dispose()
        _engine = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        if not settings.sqlalchemy_database_url:
            raise RuntimeError("DATABASE_URL or SUPABASE_DB_URL is required")
        _engine = create_async_engine(settings.sqlalchemy_database_url, pool_pre_ping=True)
    return _engine


async def get_pool() -> asyncpg.Pool:
    return await connect_db()


@asynccontextmanager
async def acquire() -> AsyncIterator[asyncpg.Connection]:
    pool = await get_pool()
    async with pool.acquire() as connection:
        yield connection


async def fetch(query: str, *args: Any) -> list[asyncpg.Record]:
    async with acquire() as connection:
        return list(await connection.fetch(query, *args))


async def fetchrow(query: str, *args: Any) -> asyncpg.Record | None:
    async with acquire() as connection:
        return await connection.fetchrow(query, *args)


async def fetchval(query: str, *args: Any) -> Any:
    async with acquire() as connection:
        return await connection.fetchval(query, *args)


async def execute(query: str, *args: Any) -> str:
    async with acquire() as connection:
        return await connection.execute(query, *args)


async def executemany(query: str, args: Sequence[Sequence[Any]]) -> None:
    async with acquire() as connection:
        await connection.executemany(query, args)


async def table_exists(table_name: str) -> bool:
    return bool(await fetchval("select to_regclass($1)", f"public.{table_name}"))


async def column_exists(table_name: str, column_name: str) -> bool:
    value = await fetchval(
        """
        select 1
        from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = $2
        """,
        table_name,
        column_name,
    )
    return bool(value)


async def validate_api_key(raw_key: str) -> dict[str, Any] | None:
    hashed = api_key_hash(raw_key)
    if await table_exists("api_keys"):
        row = await fetchrow(
            """
            update api_keys
            set "lastUsed" = now()
            where "keyHash" = $1
              and "isActive" = true
              and ("expiresAt" is null or "expiresAt" > now())
            returning "tenantId" as tenant_id, scopes
            """,
            hashed,
        )
        if row:
            return {"tenant_id": row["tenant_id"], "scopes": row["scopes"] or []}
    if await table_exists("tenant_api_keys"):
        row = await fetchrow(
            """
            select tenant_id, scopes
            from tenant_api_keys
            where key_hash = $1 and status = 'active'
            """,
            hashed,
        )
        if row:
            return {"tenant_id": row["tenant_id"], "scopes": row["scopes"] or []}
    return None


async def log_worker_error(
    *,
    job_id: str | None,
    worker: str,
    error_message: str,
    traceback_text: str,
    payload: dict[str, Any] | None = None,
) -> None:
    try:
        await execute(
            """
            insert into error_logs (job_id, worker, error_message, traceback, payload, created_at)
            values ($1, $2, $3, $4, $5::jsonb, now())
            """,
            job_id,
            worker,
            error_message[:4000],
            traceback_text,
            json_dumps(payload or {}),
        )
    except Exception:
        logger.exception("failed_to_write_error_log", extra={"_worker": worker, "_job_id": job_id})


async def ensure_service_tables() -> None:
    if _pool is None:
        return
    statements = [
        """
        create table if not exists error_logs (
          id bigserial primary key,
          job_id text,
          worker text not null,
          error_message text not null,
          traceback text,
          payload jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists documents (
          id text primary key,
          tenant_id text not null,
          shipment_id text,
          type text not null,
          url text,
          status text not null default 'QUEUED',
          error_message text,
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists route_jobs (
          id text primary key,
          tenant_id text not null,
          vehicle_id text,
          ordered_stops jsonb not null default '[]'::jsonb,
          total_distance_m integer not null default 0,
          estimated_duration_s integer not null default 0,
          status text not null default 'QUEUED',
          result jsonb not null default '{}'::jsonb,
          error_message text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists analytics_snapshots (
          id bigserial primary key,
          tenant_id text not null,
          date date not null,
          shipments_total integer not null default 0,
          shipments_delivered integer not null default 0,
          shipments_failed integer not null default 0,
          on_time_count integer not null default 0,
          on_time_rate numeric(8,4) not null default 0,
          revenue_total numeric(14,2) not null default 0,
          revenue_average_per_shipment numeric(14,2) not null default 0,
          avg_delivery_hours numeric(10,2) not null default 0,
          new_customers_count integer not null default 0,
          active_drivers_count integer not null default 0,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (tenant_id, date)
        )
        """,
        """
        create table if not exists cohort_metrics (
          id bigserial primary key,
          tenant_id text not null,
          signup_week date not null,
          metrics jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (tenant_id, signup_week)
        )
        """,
        """
        create table if not exists parsed_documents (
          job_id text primary key,
          tenant_id text not null,
          document_type text not null,
          file_url text,
          extracted_fields jsonb not null default '{}'::jsonb,
          raw_text text not null default '',
          confidence_score numeric(5,4) not null default 0,
          status text not null default 'READY',
          error_message text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists customs_declarations (
          id text primary key,
          tenant_id text not null,
          shipment_id text,
          declaration_type text not null,
          xml_url text,
          status text not null default 'QUEUED',
          metadata jsonb not null default '{}'::jsonb,
          error_message text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists prediction_results (
          id bigserial primary key,
          tenant_id text,
          entity_type text not null,
          entity_id text not null,
          model_name text not null,
          score numeric(8,6) not null default 0,
          label text not null,
          payload jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (entity_type, entity_id, model_name)
        )
        """,
    ]
    async with _pool.acquire() as connection:
        for statement in statements:
            await connection.execute(statement)
