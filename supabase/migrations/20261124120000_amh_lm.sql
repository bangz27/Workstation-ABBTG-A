-- AMH-LM page (หน้าภาพรวม Last Mile): numbers typed/copied into the Sheet tab "AMH-LM",
-- pushed by apps-script/SyncAmhLm.gs, read by amh-lm/ in the web app.
--   * read:  signed-in users only (RLS select to authenticated)
--   * write: only public.sync_amh_lm(secret, payload) — same hashed secret as sync_sheet / sync_weekly_off
--   * one sync replaces the sections it carries for one hub + business date (idempotent)
--   * no names or personal data in these tables
-- Additive: new tables and functions only. Nothing existing is altered.

CREATE TABLE IF NOT EXISTS public.amh_lm_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub text NOT NULL DEFAULT 'ABBTG-A',
  business_date date NOT NULL,
  section text NOT NULL CHECK (section IN
    ('forecast','volume','dtp','backlog','expedite','lh','progress','headcount','productivity','finance')),
  fms_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub, business_date, section)
);

CREATE TABLE IF NOT EXISTS public.amh_lm_kpi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub text NOT NULL DEFAULT 'ABBTG-A',
  business_date date NOT NULL,
  key text NOT NULL CHECK (key IN (
    'est_inbound','actual_inbound',
    'forward_inbounded','return_inbounded','delivered_to_buyer','returned_to_seller',
    'avg_l7d_delivered','avg_l7d_returned',
    'dtp_value','dtp_target',
    'expedite','super_expedite',
    'lh_loading','lh_transporting',
    'today_volume','to_handover','to_deliver','completion_rate','cfr','delivering_attempted',
    'ft_headcount','ft_attendance_rate','pt_headcount','pt_attendance_rate',
    'ft_orders_per_rider','pt_orders_per_rider',
    'cod_pending_satang')),
  scope text NOT NULL DEFAULT 'total' CHECK (scope IN ('total','hub','fleet','forward','return')),
  value numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub, business_date, key, scope)
);

CREATE TABLE IF NOT EXISTS public.amh_lm_backlog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub text NOT NULL DEFAULT 'ABBTG-A',
  business_date date NOT NULL,
  scope text NOT NULL CHECK (scope IN ('total','hub','fleet')),
  aging_type text NOT NULL CHECK (aging_type IN ('hub_aging','leg_aging','delivery_attempts')),
  bucket text NOT NULL CHECK (length(bucket) BETWEEN 1 AND 40),
  sort_order smallint NOT NULL DEFAULT 0,
  to_buyer int NOT NULL DEFAULT 0 CHECK (to_buyer >= 0),
  to_seller int NOT NULL DEFAULT 0 CHECK (to_seller >= 0),
  to_transfer int NOT NULL DEFAULT 0 CHECK (to_transfer >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub, business_date, scope, aging_type, bucket)
);

CREATE TABLE IF NOT EXISTS public.amh_lm_lh_trip (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub text NOT NULL DEFAULT 'ABBTG-A',
  business_date date NOT NULL,
  trip_id text NOT NULL CHECK (trip_id ~ '^LT[0-9A-Z]+$'),
  atd text NOT NULL DEFAULT '' CHECK (length(atd) <= 20),     -- as shown, e.g. '09:00'
  eta text NOT NULL DEFAULT '' CHECK (length(eta) <= 20),
  orders int NOT NULL DEFAULT 0 CHECK (orders >= 0),
  status text NOT NULL DEFAULT '' CHECK (length(status) <= 40),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub, business_date, trip_id)
);

CREATE TABLE IF NOT EXISTS public.amh_lm_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub text NOT NULL DEFAULT 'ABBTG-A',
  business_date date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('before_cutoff','to_buyer','to_seller')),
  stage text NOT NULL CHECK (stage IN
    ('transported','received','assigning','assigned','delivering','delivered','on_hold')),
  volume int CHECK (volume >= 0),
  total int CHECK (total >= 0),
  completed int CHECK (completed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub, business_date, direction, stage)
);

CREATE TABLE IF NOT EXISTS public.amh_lm_fleet_vehicle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub text NOT NULL DEFAULT 'ABBTG-A',
  business_date date NOT NULL,
  contract text NOT NULL CHECK (contract IN ('full_time','part_time')),
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('2WH','4WH','Others')),
  direction text NOT NULL DEFAULT 'total' CHECK (direction IN ('total','forward','return')),
  actual int CHECK (actual >= 0),
  scheduled int CHECK (scheduled >= 0),
  delivered int CHECK (delivered >= 0),
  handed_over int CHECK (handed_over >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub, business_date, contract, vehicle_type, direction)
);

CREATE TABLE IF NOT EXISTS public.amh_lm_cod (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub text NOT NULL DEFAULT 'ABBTG-A',
  business_date date NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('today','1_3_days','4_5_days','over_5_days')),
  orders int CHECK (orders >= 0),
  pending_satang bigint CHECK (pending_satang >= 0),
  currency text NOT NULL DEFAULT 'THB',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub, business_date, bucket)
);

-- RLS: signed-in users read; no direct writes from any client role
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['amh_lm_snapshot','amh_lm_kpi','amh_lm_backlog','amh_lm_lh_trip',
                           'amh_lm_progress','amh_lm_fleet_vehicle','amh_lm_cod'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_read', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- KPI key → card section (used for the per-card "Updated" stamp)
CREATE OR REPLACE FUNCTION private.amh_lm_kpi_section(p_key text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN p_key IN ('est_inbound','actual_inbound') THEN 'forecast'
    WHEN p_key IN ('forward_inbounded','return_inbounded','delivered_to_buyer','returned_to_seller',
                   'avg_l7d_delivered','avg_l7d_returned') THEN 'volume'
    WHEN p_key IN ('dtp_value','dtp_target') THEN 'dtp'
    WHEN p_key IN ('expedite','super_expedite') THEN 'expedite'
    WHEN p_key IN ('lh_loading','lh_transporting') THEN 'lh'
    WHEN p_key IN ('today_volume','to_handover','to_deliver','completion_rate','cfr','delivering_attempted') THEN 'progress'
    WHEN p_key IN ('ft_headcount','ft_attendance_rate','pt_headcount','pt_attendance_rate') THEN 'headcount'
    WHEN p_key IN ('ft_orders_per_rider','pt_orders_per_rider') THEN 'productivity'
    WHEN p_key = 'cod_pending_satang' THEN 'finance'
  END
$$;

-- Writer body. Payload:
-- { "hub":"ABBTG-A", "business_date":"YYYY-MM-DD",
--   "kpi":[{key,scope,value,updated}], "backlog":[{scope,aging_type,bucket,sort,to_buyer,to_seller,to_transfer,updated}],
--   "lh":[{trip_id,atd,eta,orders,status,sort,updated}], "progress":[{direction,stage,volume,total,completed,updated}],
--   "fleet":[{contract,vehicle_type,direction,actual,scheduled,delivered,handed_over,updated,section}],
--   "cod":[{bucket,orders,pending_satang,updated}] }
-- A list that is present (even empty) replaces that list for hub+date; a missing list is left alone.
-- "updated" = FMS "Updated:" time as ISO 8601 with offset, or null.
CREATE OR REPLACE FUNCTION private.apply_amh_lm(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_hub text := coalesce(nullif(p_payload ->> 'hub', ''), 'ABBTG-A');
  v_date date := (p_payload ->> 'business_date')::date;
  v_rows int := 0;
  v_n int;
  v_secs text[] := ARRAY[]::text[];
BEGIN
  IF v_date IS NULL THEN RAISE EXCEPTION 'business_date is required' USING errcode = '22023'; END IF;
  IF v_hub !~ '^[A-Z0-9-]{2,20}$' THEN RAISE EXCEPTION 'bad hub' USING errcode = '22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('amh_lm|' || v_hub || '|' || v_date::text));

  IF p_payload ? 'kpi' THEN
    DELETE FROM public.amh_lm_kpi WHERE hub = v_hub AND business_date = v_date;
    INSERT INTO public.amh_lm_kpi (hub, business_date, key, scope, value)
    SELECT v_hub, v_date, e ->> 'key', coalesce(nullif(e ->> 'scope', ''), 'total'), (e ->> 'value')::numeric
    FROM jsonb_array_elements(p_payload -> 'kpi') e
    WHERE nullif(e ->> 'value', '') IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rows := v_rows + v_n;
    v_secs := v_secs || ARRAY['forecast','volume','dtp','expedite','lh','progress','headcount','productivity','finance'];
  END IF;

  IF p_payload ? 'backlog' THEN
    DELETE FROM public.amh_lm_backlog WHERE hub = v_hub AND business_date = v_date;
    INSERT INTO public.amh_lm_backlog (hub, business_date, scope, aging_type, bucket, sort_order, to_buyer, to_seller, to_transfer)
    SELECT v_hub, v_date, e ->> 'scope', e ->> 'aging_type', e ->> 'bucket', coalesce((e ->> 'sort')::smallint, 0),
           coalesce((e ->> 'to_buyer')::int, 0), coalesce((e ->> 'to_seller')::int, 0), coalesce((e ->> 'to_transfer')::int, 0)
    FROM jsonb_array_elements(p_payload -> 'backlog') e;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rows := v_rows + v_n;
    v_secs := array_append(v_secs, 'backlog'::text);
  END IF;

  IF p_payload ? 'lh' THEN
    DELETE FROM public.amh_lm_lh_trip WHERE hub = v_hub AND business_date = v_date;
    INSERT INTO public.amh_lm_lh_trip (hub, business_date, trip_id, atd, eta, orders, status, sort_order)
    SELECT v_hub, v_date, upper(e ->> 'trip_id'), coalesce(e ->> 'atd', ''), coalesce(e ->> 'eta', ''),
           coalesce((e ->> 'orders')::int, 0), coalesce(e ->> 'status', ''), coalesce((e ->> 'sort')::smallint, 0)
    FROM jsonb_array_elements(p_payload -> 'lh') e;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rows := v_rows + v_n;
    v_secs := array_append(v_secs, 'lh'::text);
  END IF;

  IF p_payload ? 'progress' THEN
    DELETE FROM public.amh_lm_progress WHERE hub = v_hub AND business_date = v_date;
    INSERT INTO public.amh_lm_progress (hub, business_date, direction, stage, volume, total, completed)
    SELECT v_hub, v_date, e ->> 'direction', e ->> 'stage',
           (nullif(e ->> 'volume', ''))::int, (nullif(e ->> 'total', ''))::int, (nullif(e ->> 'completed', ''))::int
    FROM jsonb_array_elements(p_payload -> 'progress') e;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rows := v_rows + v_n;
    v_secs := array_append(v_secs, 'progress'::text);
  END IF;

  IF p_payload ? 'fleet' THEN
    DELETE FROM public.amh_lm_fleet_vehicle WHERE hub = v_hub AND business_date = v_date;
    INSERT INTO public.amh_lm_fleet_vehicle (hub, business_date, contract, vehicle_type, direction, actual, scheduled, delivered, handed_over)
    SELECT v_hub, v_date, e ->> 'contract', e ->> 'vehicle_type', coalesce(nullif(e ->> 'direction', ''), 'total'),
           (nullif(e ->> 'actual', ''))::int, (nullif(e ->> 'scheduled', ''))::int,
           (nullif(e ->> 'delivered', ''))::int, (nullif(e ->> 'handed_over', ''))::int
    FROM jsonb_array_elements(p_payload -> 'fleet') e;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rows := v_rows + v_n;
    v_secs := v_secs || ARRAY['headcount','productivity'];
  END IF;

  IF p_payload ? 'cod' THEN
    DELETE FROM public.amh_lm_cod WHERE hub = v_hub AND business_date = v_date;
    INSERT INTO public.amh_lm_cod (hub, business_date, bucket, orders, pending_satang)
    SELECT v_hub, v_date, e ->> 'bucket', (nullif(e ->> 'orders', ''))::int, (nullif(e ->> 'pending_satang', ''))::bigint
    FROM jsonb_array_elements(p_payload -> 'cod') e;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rows := v_rows + v_n;
    v_secs := array_append(v_secs, 'finance'::text);
  END IF;

  -- per-section stamp = latest FMS "updated" among that section's rows (null when none given)
  INSERT INTO public.amh_lm_snapshot (hub, business_date, section, fms_updated_at, synced_at, updated_at)
  SELECT v_hub, v_date, s.section, max(u.ts), now(), now()
  FROM (SELECT DISTINCT unnest(v_secs) AS section) s
  LEFT JOIN (
    SELECT private.amh_lm_kpi_section(e ->> 'key') AS section, (nullif(e ->> 'updated', ''))::timestamptz AS ts
      FROM jsonb_array_elements(coalesce(p_payload -> 'kpi', '[]'::jsonb)) e
    UNION ALL SELECT 'backlog', (nullif(e ->> 'updated', ''))::timestamptz FROM jsonb_array_elements(coalesce(p_payload -> 'backlog', '[]'::jsonb)) e
    UNION ALL SELECT 'lh', (nullif(e ->> 'updated', ''))::timestamptz FROM jsonb_array_elements(coalesce(p_payload -> 'lh', '[]'::jsonb)) e
    UNION ALL SELECT 'progress', (nullif(e ->> 'updated', ''))::timestamptz FROM jsonb_array_elements(coalesce(p_payload -> 'progress', '[]'::jsonb)) e
    UNION ALL SELECT coalesce(nullif(e ->> 'section', ''), 'headcount'), (nullif(e ->> 'updated', ''))::timestamptz FROM jsonb_array_elements(coalesce(p_payload -> 'fleet', '[]'::jsonb)) e
    UNION ALL SELECT 'finance', (nullif(e ->> 'updated', ''))::timestamptz FROM jsonb_array_elements(coalesce(p_payload -> 'cod', '[]'::jsonb)) e
  ) u ON u.section = s.section
  GROUP BY s.section
  ON CONFLICT (hub, business_date, section)
  DO UPDATE SET fms_updated_at = excluded.fms_updated_at, synced_at = excluded.synced_at, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'hub', v_hub, 'business_date', v_date, 'rows', v_rows,
                            'sections', (SELECT coalesce(jsonb_agg(DISTINCT x), '[]'::jsonb) FROM unnest(v_secs) x));
END;
$$;
REVOKE ALL ON FUNCTION private.apply_amh_lm(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_amh_lm(p_secret text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_hash text;
BEGIN
  SELECT secret_sha256 INTO v_hash FROM private.sync_secret WHERE id;
  IF v_hash IS NULL OR p_secret IS NULL OR length(p_secret) < 32
     OR encode(pg_catalog.sha256(convert_to(p_secret, 'UTF8')), 'hex') <> v_hash THEN
    RAISE EXCEPTION 'invalid sync secret' USING errcode = '28000';
  END IF;
  RETURN private.apply_amh_lm(p_payload);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_amh_lm(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_amh_lm(text, jsonb) TO anon, authenticated;

-- Reader. SECURITY INVOKER, so RLS decides (signed-in only). p_date null → latest business date synced.
CREATE OR REPLACE FUNCTION public.get_amh_lm(p_hub text DEFAULT 'ABBTG-A', p_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $$
DECLARE v_date date := p_date;
BEGIN
  IF v_date IS NULL THEN
    SELECT max(business_date) INTO v_date FROM public.amh_lm_snapshot WHERE hub = p_hub;
  END IF;
  IF v_date IS NULL THEN
    RETURN jsonb_build_object('hub', p_hub, 'business_date', NULL, 'sections', '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'hub', p_hub,
    'business_date', v_date,
    'sections', (SELECT coalesce(jsonb_object_agg(section, jsonb_build_object('fms_updated_at', fms_updated_at, 'synced_at', synced_at)), '{}'::jsonb)
                   FROM public.amh_lm_snapshot WHERE hub = p_hub AND business_date = v_date),
    'kpi', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', key, 'scope', scope, 'value', value)), '[]'::jsonb)
              FROM public.amh_lm_kpi WHERE hub = p_hub AND business_date = v_date),
    'backlog', (SELECT coalesce(jsonb_agg(jsonb_build_object('scope', scope, 'aging_type', aging_type, 'bucket', bucket,
                  'to_buyer', to_buyer, 'to_seller', to_seller, 'to_transfer', to_transfer) ORDER BY sort_order, bucket), '[]'::jsonb)
                  FROM public.amh_lm_backlog WHERE hub = p_hub AND business_date = v_date),
    'lh', (SELECT coalesce(jsonb_agg(jsonb_build_object('trip_id', trip_id, 'atd', atd, 'eta', eta, 'orders', orders, 'status', status)
             ORDER BY sort_order, trip_id), '[]'::jsonb)
             FROM public.amh_lm_lh_trip WHERE hub = p_hub AND business_date = v_date),
    'progress', (SELECT coalesce(jsonb_agg(jsonb_build_object('direction', direction, 'stage', stage, 'volume', volume,
                   'total', total, 'completed', completed)), '[]'::jsonb)
                   FROM public.amh_lm_progress WHERE hub = p_hub AND business_date = v_date),
    'fleet', (SELECT coalesce(jsonb_agg(jsonb_build_object('contract', contract, 'vehicle_type', vehicle_type, 'direction', direction,
                'actual', actual, 'scheduled', scheduled, 'delivered', delivered, 'handed_over', handed_over)), '[]'::jsonb)
                FROM public.amh_lm_fleet_vehicle WHERE hub = p_hub AND business_date = v_date),
    'cod', (SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'orders', orders, 'pending_satang', pending_satang)), '[]'::jsonb)
              FROM public.amh_lm_cod WHERE hub = p_hub AND business_date = v_date)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_amh_lm(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_amh_lm(text, date) TO authenticated;
