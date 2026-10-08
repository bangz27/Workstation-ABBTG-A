CREATE OR REPLACE FUNCTION private.replace_weekly_off(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_fleet jsonb;
  v_ops jsonb;
  v_fleet_count integer;
  v_ops_count integer;
  v_unique_count integer;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Weekly Off payload must be a JSON object' USING errcode = '22023';
  END IF;
  v_fleet := p_payload -> 'fleet';
  v_ops := p_payload -> 'ops';
  IF jsonb_typeof(v_fleet) IS DISTINCT FROM 'array' OR jsonb_typeof(v_ops) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Weekly Off payload requires fleet and ops arrays' USING errcode = '22023';
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
  SELECT count(*), count(DISTINCT e.value ->> 'driver_id')
    INTO v_fleet_count, v_unique_count
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
  SELECT count(*), count(DISTINCT e.value ->> 'ops_id')
    INTO v_ops_count, v_unique_count
    FROM jsonb_array_elements(v_ops) AS e(value);
  IF v_ops_count <> v_unique_count THEN
    RAISE EXCEPTION 'Weekly Off Ops contains duplicate Ops IDs' USING errcode = '22023';
  END IF;

  DELETE FROM public.fleet_weekly_off WHERE TRUE;
  INSERT INTO public.fleet_weekly_off (driver_id, employee_id, staff_name, shift, weekly_off, updated_at)
  SELECT e.value ->> 'driver_id', e.value ->> 'employee_id', e.value ->> 'staff_name',
         e.value ->> 'shift', e.value ->> 'weekly_off', now()
  FROM jsonb_array_elements(v_fleet) AS e(value);

  DELETE FROM public.ops_weekly_off WHERE TRUE;
  INSERT INTO public.ops_weekly_off (ops_id, staff_name, department, shift, weekly_off, updated_at)
  SELECT e.value ->> 'ops_id', e.value ->> 'staff_name', e.value ->> 'department',
         e.value ->> 'shift', e.value ->> 'weekly_off', now()
  FROM jsonb_array_elements(v_ops) AS e(value);

  RETURN jsonb_build_object('ok', true, 'fleet', v_fleet_count, 'ops', v_ops_count, 'synced_at', now());
END;
$function$;
