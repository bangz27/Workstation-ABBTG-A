-- Weekly Off month model: M0 = current Thai month, M+1 = next month.
-- Existing November 2026 rows are preserved as M+1 during the transition.
ALTER TABLE public.fleet_weekly_off ADD COLUMN IF NOT EXISTS month_key date;
ALTER TABLE public.ops_weekly_off ADD COLUMN IF NOT EXISTS month_key date;

UPDATE public.fleet_weekly_off SET month_key = DATE '2026-11-01' WHERE month_key IS NULL;
UPDATE public.ops_weekly_off SET month_key = DATE '2026-11-01' WHERE month_key IS NULL;

ALTER TABLE public.fleet_weekly_off ALTER COLUMN month_key SET NOT NULL;
ALTER TABLE public.ops_weekly_off ALTER COLUMN month_key SET NOT NULL;

ALTER TABLE public.fleet_weekly_off DROP CONSTRAINT IF EXISTS fleet_weekly_off_pkey;
ALTER TABLE public.ops_weekly_off DROP CONSTRAINT IF EXISTS ops_weekly_off_pkey;

ALTER TABLE public.fleet_weekly_off ADD CONSTRAINT fleet_weekly_off_pkey PRIMARY KEY (month_key, driver_id);
ALTER TABLE public.ops_weekly_off ADD CONSTRAINT ops_weekly_off_pkey PRIMARY KEY (month_key, ops_id);

CREATE INDEX IF NOT EXISTS fleet_weekly_off_month_idx ON public.fleet_weekly_off (month_key);
CREATE INDEX IF NOT EXISTS ops_weekly_off_month_idx ON public.ops_weekly_off (month_key);

CREATE OR REPLACE FUNCTION private.replace_weekly_off(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_month jsonb;
  v_key date;
  v_fleet jsonb;
  v_ops jsonb;
  v_fleet_count integer;
  v_ops_count integer;
  v_unique_count integer;
  v_total integer := 0;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Weekly Off payload must be a JSON object' USING errcode = '22023';
  END IF;
  IF jsonb_typeof(p_payload -> 'months') IS DISTINCT FROM 'array' THEN
    IF jsonb_typeof(p_payload -> 'fleet') = 'array' AND jsonb_typeof(p_payload -> 'ops') = 'array' THEN
      p_payload := jsonb_build_object(
        'months', jsonb_build_array(jsonb_build_object(
          'month_key', to_char((date_trunc('month', timezone('Asia/Bangkok', now())) + interval '1 month')::date, 'YYYY-MM-DD'),
          'fleet', p_payload -> 'fleet',
          'ops', p_payload -> 'ops'
        ))
      );
    ELSE
      RAISE EXCEPTION 'Weekly Off payload requires months array' USING errcode = '22023';
    END IF;
  END IF;

  FOR v_month IN SELECT value FROM jsonb_array_elements(p_payload -> 'months')
  LOOP
    v_key := NULLIF(v_month ->> 'month_key','')::date;
    IF v_key IS NULL OR extract(day from v_key) <> 1 THEN
      RAISE EXCEPTION 'Weekly Off month_key must be the first day of month' USING errcode = '22023';
    END IF;
    v_fleet := v_month -> 'fleet';
    v_ops := v_month -> 'ops';

    IF jsonb_typeof(v_fleet) IS DISTINCT FROM 'array' OR jsonb_typeof(v_ops) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Weekly Off month requires fleet and ops arrays' USING errcode = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_fleet) AS e(value)
      WHERE jsonb_typeof(e.value) <> 'object'
         OR nullif(btrim(e.value ->> 'driver_id'), '') IS NULL
         OR nullif(btrim(e.value ->> 'staff_name'), '') IS NULL
         OR nullif(btrim(e.value ->> 'shift'), '') IS NULL
         OR nullif(btrim(e.value ->> 'weekly_off'), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'Weekly Off Fleet contains an invalid record' USING errcode = '22023';
    END IF;

    SELECT count(*), count(DISTINCT e.value ->> 'driver_id') INTO v_fleet_count, v_unique_count
    FROM jsonb_array_elements(v_fleet) AS e(value);
    IF v_fleet_count <> v_unique_count THEN
      RAISE EXCEPTION 'Weekly Off Fleet contains duplicate Driver IDs' USING errcode = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_ops) AS e(value)
      WHERE jsonb_typeof(e.value) <> 'object'
         OR nullif(btrim(e.value ->> 'ops_id'), '') IS NULL
         OR nullif(btrim(e.value ->> 'staff_name'), '') IS NULL
         OR nullif(btrim(e.value ->> 'shift'), '') IS NULL
         OR nullif(btrim(e.value ->> 'weekly_off'), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'Weekly Off Ops contains an invalid record' USING errcode = '22023';
    END IF;

    SELECT count(*), count(DISTINCT e.value ->> 'ops_id') INTO v_ops_count, v_unique_count
    FROM jsonb_array_elements(v_ops) AS e(value);
    IF v_ops_count <> v_unique_count THEN
      RAISE EXCEPTION 'Weekly Off Ops contains duplicate Ops IDs' USING errcode = '22023';
    END IF;

    DELETE FROM public.fleet_weekly_off WHERE month_key = v_key;
    DELETE FROM public.ops_weekly_off WHERE month_key = v_key;

    INSERT INTO public.fleet_weekly_off (month_key, driver_id, employee_id, staff_name, shift, weekly_off, updated_at)
    SELECT v_key, e.value ->> 'driver_id', e.value ->> 'employee_id', e.value ->> 'staff_name',
           e.value ->> 'shift', e.value ->> 'weekly_off', now()
    FROM jsonb_array_elements(v_fleet) AS e(value);

    INSERT INTO public.ops_weekly_off (month_key, ops_id, staff_name, department, shift, weekly_off, updated_at)
    SELECT v_key, e.value ->> 'ops_id', e.value ->> 'staff_name', e.value ->> 'department',
           e.value ->> 'shift', e.value ->> 'weekly_off', now()
    FROM jsonb_array_elements(v_ops) AS e(value);

    v_total := v_total + v_fleet_count + v_ops_count;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'months', jsonb_array_length(p_payload -> 'months'), 'rows', v_total, 'synced_at', now());
END;
$function$;
