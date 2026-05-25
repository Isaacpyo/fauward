-- Add structured customs declarations to existing tenant shipment tables.
-- The column is nullable so existing domestic and historical rows remain valid.

do $$
declare
  tenant_schema text;
begin
  for tenant_schema in
    select schema_name
    from information_schema.schemata
    where schema_name like 'tenant\_%' escape '\'
  loop
    execute format(
      'alter table if exists %I.shipments add column if not exists customs_declaration jsonb',
      tenant_schema
    );
    execute format(
      'create index if not exists shipments_customs_declaration_gin on %I.shipments using gin (customs_declaration)',
      tenant_schema
    );
  end loop;
end $$;
