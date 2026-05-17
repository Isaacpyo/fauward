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
);

create index if not exists audit_log_tenant_timestamp_idx
on audit_log ("tenantId", timestamp desc);

alter table documents add column if not exists idempotency_key text;
create index if not exists documents_tenant_id_idx on documents (tenant_id, id);
create index if not exists documents_tenant_shipment_idx on documents (tenant_id, shipment_id);
create index if not exists documents_tenant_type_updated_idx on documents (tenant_id, type, updated_at desc);
create unique index if not exists documents_tenant_idempotency_key_uidx
on documents (tenant_id, idempotency_key)
where idempotency_key is not null;

create index if not exists parsed_documents_tenant_job_idx on parsed_documents (tenant_id, job_id);
create index if not exists parsed_documents_tenant_status_updated_idx on parsed_documents (tenant_id, status, updated_at desc);
create index if not exists parsed_documents_tenant_type_updated_idx on parsed_documents (tenant_id, document_type, updated_at desc);

alter table customs_declarations add column if not exists idempotency_key text;
create index if not exists customs_declarations_tenant_id_idx on customs_declarations (tenant_id, id);
create index if not exists customs_declarations_tenant_shipment_idx on customs_declarations (tenant_id, shipment_id);
create index if not exists customs_declarations_tenant_type_updated_idx on customs_declarations (tenant_id, declaration_type, updated_at desc);
create unique index if not exists customs_declarations_tenant_idempotency_key_uidx
on customs_declarations (tenant_id, idempotency_key)
where idempotency_key is not null;

alter table route_jobs add column if not exists idempotency_key text;
create index if not exists route_jobs_tenant_id_idx on route_jobs (tenant_id, id);
create index if not exists route_jobs_tenant_status_updated_idx on route_jobs (tenant_id, status, updated_at desc);
create index if not exists route_jobs_tenant_vehicle_updated_idx on route_jobs (tenant_id, vehicle_id, updated_at desc);
create unique index if not exists route_jobs_tenant_idempotency_key_uidx
on route_jobs (tenant_id, idempotency_key)
where idempotency_key is not null;

alter table prediction_results
drop constraint if exists prediction_results_entity_type_entity_id_model_name_key;

create unique index if not exists prediction_results_tenant_entity_model_uidx
on prediction_results (tenant_id, entity_type, entity_id, model_name)
where tenant_id is not null;

create unique index if not exists prediction_results_global_entity_model_uidx
on prediction_results (entity_type, entity_id, model_name)
where tenant_id is null;

create index if not exists prediction_results_tenant_entity_model_idx
on prediction_results (tenant_id, entity_type, model_name);

create index if not exists prediction_results_tenant_updated_idx
on prediction_results (tenant_id, updated_at desc);
