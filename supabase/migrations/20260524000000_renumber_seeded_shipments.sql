-- Renumber seeded FWD-XXXX shipments to the new {TN}{YY}{MM}-{RR}-{AAAA}-{NNNNN} format
-- Run once in Supabase Studio SQL editor (or via psql).
-- Safe to re-run: only touches rows with tracking_number LIKE 'FWD-%'

DO $$
DECLARE
  rec        RECORD;
  old_tn     TEXT;
  new_tn     TEXT;
  prefix     TEXT;
  yy         TEXT;
  mm         TEXT;
  seg1       TEXT;  -- 2 digits
  seg2       TEXT;  -- 4 alphanumeric
  seg3       TEXT;  -- 5 digits
  alphanum   TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  digits     TEXT := '0123456789';
  attempt    INT;
  conflict   BOOL;
BEGIN
  FOR rec IN
    SELECT s.id, s."trackingNumber", s."createdAt", t.name AS tenant_name
    FROM   shipments s
    JOIN   tenants   t ON t.id = s."tenantId"
    WHERE  s."trackingNumber" LIKE 'FWD-%'
    ORDER  BY s."createdAt"
  LOOP
    old_tn := rec."trackingNumber";

    -- Tenant prefix: first 2 uppercase letters from tenant name
    prefix := upper(left(regexp_replace(rec.tenant_name, '[^A-Za-z]', '', 'g'), 2));

    IF length(prefix) < 2 THEN
      prefix := rpad(prefix, 2, 'X');
    END IF;

    -- Date parts from createdAt
    yy := to_char(rec."createdAt", 'YY');
    mm := to_char(rec."createdAt", 'MM');

    -- Generate a unique tracking number (up to 20 tries)
    conflict := TRUE;
    attempt  := 0;
    WHILE conflict AND attempt < 20 LOOP
      -- 2 random digits
      seg1 := substr(digits, (floor(random()*10)::int % 10) + 1, 1)
            || substr(digits, (floor(random()*10)::int % 10) + 1, 1);

      -- 4 random alphanumeric
      seg2 := substr(alphanum, (floor(random()*36)::int % 36) + 1, 1)
            || substr(alphanum, (floor(random()*36)::int % 36) + 1, 1)
            || substr(alphanum, (floor(random()*36)::int % 36) + 1, 1)
            || substr(alphanum, (floor(random()*36)::int % 36) + 1, 1);

      -- 5 random digits
      seg3 := substr(digits, (floor(random()*10)::int % 10) + 1, 1)
            || substr(digits, (floor(random()*10)::int % 10) + 1, 1)
            || substr(digits, (floor(random()*10)::int % 10) + 1, 1)
            || substr(digits, (floor(random()*10)::int % 10) + 1, 1)
            || substr(digits, (floor(random()*10)::int % 10) + 1, 1);

      new_tn := prefix || yy || mm || '-' || seg1 || '-' || seg2 || '-' || seg3;

      SELECT EXISTS (
        SELECT 1 FROM shipments WHERE "trackingNumber" = new_tn AND id <> rec.id
      ) INTO conflict;

      attempt := attempt + 1;
    END LOOP;

    IF conflict THEN
      RAISE EXCEPTION 'Could not generate unique tracking number for shipment %', rec.id;
    END IF;

    -- Update shipment
    UPDATE shipments SET "trackingNumber" = new_tn WHERE id = rec.id;

    -- Keep tracking_events + tracking_snapshots in sync
    UPDATE tracking_events    SET "trackingNumber" = new_tn WHERE "trackingNumber" = old_tn;
    UPDATE tracking_snapshots SET "trackingNumber" = new_tn WHERE "trackingNumber" = old_tn;

    RAISE NOTICE '% → %', old_tn, new_tn;
  END LOOP;
END;
$$;
