import hashlib
import hmac
import json
import logging
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import Any

import asyncpg

from config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


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
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


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
    key_prefix = raw_key[:8]
    if await table_exists("api_keys"):
        has_key_prefix = await column_exists("api_keys", "keyPrefix")
        has_revoked_at = await column_exists("api_keys", "revokedAt")
        has_user_id = await column_exists("api_keys", "userId")
        has_actor_id = await column_exists("api_keys", "actorId")
        has_key_type = await column_exists("api_keys", "keyType")
        has_tenants = await table_exists("tenants")
        has_tenant_status = has_tenants and await column_exists("tenants", "status")
        join_tenants = 'join tenants t on t.id = k."tenantId"' if has_tenants else ""
        tenant_status_clause = (
            "and t.status not in ('SUSPENDED', 'CANCELLED', 'DELETED')"
            if has_tenant_status
            else ""
        )
        revoked_clause = 'and k."revokedAt" is null' if has_revoked_at else ""
        lookup_clause = 'k."keyPrefix" = $1' if has_key_prefix else 'k."keyHash" = $1'
        lookup_value = key_prefix if has_key_prefix else hashed
        select_user_id = 'k."userId" as user_id' if has_user_id else "null::text as user_id"
        select_actor_id = 'k."actorId" as actor_id' if has_actor_id else "null::text as actor_id"
        select_key_type = 'k."keyType" as key_type' if has_key_type else "'tenant'::text as key_type"
        rows = await fetch(
            f"""
            select k.id as api_key_id,
                   k."tenantId" as tenant_id,
                   k."keyHash" as key_hash,
                   k.scopes,
                   {select_user_id},
                   {select_actor_id},
                   {select_key_type}
            from api_keys k
            {join_tenants}
            where {lookup_clause}
              and k."isActive" = true
              and (k."expiresAt" is null or k."expiresAt" > now())
              {revoked_clause}
              {tenant_status_clause}
            """,
            lookup_value,
        )
        for row in rows:
            if hmac.compare_digest(str(row["key_hash"]), hashed):
                await execute("""update api_keys set "lastUsed" = now() where id = $1""", row["api_key_id"])
                return {
                    "tenant_id": row["tenant_id"],
                    "scopes": row["scopes"] or [],
                    "api_key_id": row["api_key_id"],
                    "user_id": row["user_id"],
                    "actor_id": row["actor_id"],
                    "key_type": row["key_type"],
                }
    if await table_exists("tenant_api_keys"):
        has_key_prefix = await column_exists("tenant_api_keys", "key_prefix")
        has_revoked_at = await column_exists("tenant_api_keys", "revoked_at")
        has_user_id = await column_exists("tenant_api_keys", "user_id")
        has_actor_id = await column_exists("tenant_api_keys", "actor_id")
        has_key_type = await column_exists("tenant_api_keys", "key_type")
        has_tenants = await table_exists("tenants")
        has_tenant_status = has_tenants and await column_exists("tenants", "status")
        join_tenants = "join tenants t on t.id = k.tenant_id" if has_tenants else ""
        tenant_status_clause = (
            "and t.status not in ('SUSPENDED', 'CANCELLED', 'DELETED')"
            if has_tenant_status
            else ""
        )
        revoked_clause = "and k.revoked_at is null" if has_revoked_at else ""
        lookup_clause = "k.key_prefix = $1" if has_key_prefix else "k.key_hash = $1"
        lookup_value = key_prefix if has_key_prefix else hashed
        select_user_id = "k.user_id" if has_user_id else "null::text as user_id"
        select_actor_id = "k.actor_id" if has_actor_id else "null::text as actor_id"
        select_key_type = "k.key_type" if has_key_type else "'tenant'::text as key_type"
        rows = await fetch(
            f"""
            select k.id as api_key_id,
                   k.tenant_id,
                   k.key_hash,
                   k.scopes,
                   {select_user_id},
                   {select_actor_id},
                   {select_key_type}
            from tenant_api_keys k
            {join_tenants}
            where {lookup_clause}
              and k.status = 'active'
              and (k.expires_at is null or k.expires_at > now())
              {revoked_clause}
              {tenant_status_clause}
            """,
            lookup_value,
        )
        for row in rows:
            if hmac.compare_digest(str(row["key_hash"]), hashed):
                if await column_exists("tenant_api_keys", "last_used_at"):
                    await execute("""update tenant_api_keys set last_used_at = now() where id = $1""", row["api_key_id"])
                return {
                    "tenant_id": row["tenant_id"],
                    "scopes": row["scopes"] or [],
                    "api_key_id": row["api_key_id"],
                    "user_id": row["user_id"],
                    "actor_id": row["actor_id"],
                    "key_type": row["key_type"],
                }
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
        alter table documents
        add column if not exists idempotency_key text
        """,
        """
        create index if not exists documents_tenant_id_idx
        on documents (tenant_id, id)
        """,
        """
        create index if not exists documents_tenant_shipment_idx
        on documents (tenant_id, shipment_id)
        """,
        """
        create index if not exists documents_tenant_type_updated_idx
        on documents (tenant_id, type, updated_at desc)
        """,
        """
        create unique index if not exists documents_tenant_idempotency_key_uidx
        on documents (tenant_id, idempotency_key)
        where idempotency_key is not null
        """,
        """
        create table if not exists audit_log (
          id text primary key,
          "tenantId" text not null,
          "actorId" text,
          "actorType" text not null default 'API',
          "actorIp" text,
          action text not null,
          "resourceType" text,
          "resourceId" text,
          metadata jsonb not null default '{}'::jsonb,
          timestamp timestamptz not null default now()
        )
        """,
        """
        create index if not exists audit_log_tenant_timestamp_idx
        on audit_log ("tenantId", timestamp desc)
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
        alter table route_jobs
        add column if not exists idempotency_key text
        """,
        """
        create index if not exists route_jobs_tenant_id_idx
        on route_jobs (tenant_id, id)
        """,
        """
        create index if not exists route_jobs_tenant_status_updated_idx
        on route_jobs (tenant_id, status, updated_at desc)
        """,
        """
        create index if not exists route_jobs_tenant_vehicle_updated_idx
        on route_jobs (tenant_id, vehicle_id, updated_at desc)
        """,
        """
        create unique index if not exists route_jobs_tenant_idempotency_key_uidx
        on route_jobs (tenant_id, idempotency_key)
        where idempotency_key is not null
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
        create index if not exists parsed_documents_tenant_job_idx
        on parsed_documents (tenant_id, job_id)
        """,
        """
        create index if not exists parsed_documents_tenant_status_updated_idx
        on parsed_documents (tenant_id, status, updated_at desc)
        """,
        """
        create index if not exists parsed_documents_tenant_type_updated_idx
        on parsed_documents (tenant_id, document_type, updated_at desc)
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
        alter table customs_declarations
        add column if not exists idempotency_key text
        """,
        """
        create index if not exists customs_declarations_tenant_id_idx
        on customs_declarations (tenant_id, id)
        """,
        """
        create index if not exists customs_declarations_tenant_shipment_idx
        on customs_declarations (tenant_id, shipment_id)
        """,
        """
        create index if not exists customs_declarations_tenant_type_updated_idx
        on customs_declarations (tenant_id, declaration_type, updated_at desc)
        """,
        """
        create unique index if not exists customs_declarations_tenant_idempotency_key_uidx
        on customs_declarations (tenant_id, idempotency_key)
        where idempotency_key is not null
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
          updated_at timestamptz not null default now()
        )
        """,
        """
        alter table prediction_results
        drop constraint if exists prediction_results_entity_type_entity_id_model_name_key
        """,
        """
        delete from prediction_results old
        using prediction_results newer
        where old.id < newer.id
          and coalesce(old.tenant_id, '__global__') = coalesce(newer.tenant_id, '__global__')
          and old.entity_type = newer.entity_type
          and old.entity_id = newer.entity_id
          and old.model_name = newer.model_name
        """,
        """
        create unique index if not exists prediction_results_tenant_entity_model_uidx
        on prediction_results (tenant_id, entity_type, entity_id, model_name)
        where tenant_id is not null
        """,
        """
        create unique index if not exists prediction_results_global_entity_model_uidx
        on prediction_results (entity_type, entity_id, model_name)
        where tenant_id is null
        """,
        """
        create index if not exists prediction_results_tenant_entity_model_idx
        on prediction_results (tenant_id, entity_type, model_name)
        """,
        """
        create index if not exists prediction_results_tenant_updated_idx
        on prediction_results (tenant_id, updated_at desc)
        """,
        """
        create index if not exists prediction_results_entity_lookup_idx
        on prediction_results (entity_type, entity_id, model_name)
        """,
        """
        create table if not exists ml_prediction_feedback (
          id text primary key,
          tenant_id text not null,
          entity_type text not null,
          entity_id text not null,
          model_name text not null,
          prediction_was_correct boolean not null,
          actual_label text,
          actual_value jsonb,
          notes text,
          created_by text,
          created_at timestamptz not null default now()
        )
        """,
        """
        create index if not exists ml_prediction_feedback_tenant_model_created_idx
        on ml_prediction_feedback (tenant_id, model_name, created_at desc)
        """,
        """
        create table if not exists ml_models (
          name text primary key,
          status text not null default 'available',
          version text,
          last_trained_at timestamptz,
          metrics jsonb not null default '{}'::jsonb,
          updated_at timestamptz not null default now()
        )
        """,
    ]
    async with _pool.acquire() as connection:
        for statement in statements:
            await connection.execute(statement)
