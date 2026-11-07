-- จัดกะ FMS (Shift Planner): employee master + shift rules + monthly comp days, and the FMS
-- "Upload Planned HC" templates used as the export layout.
-- Read: any signed-in user. Write: admins only, through SECURITY DEFINER RPCs (no direct writes).
-- Requires public.is_admin() (already used by the leave pages).

CREATE TABLE IF NOT EXISTS public.shift_planner (
  hub text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  rev integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS public.shift_planner_template (
  hub text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('driver','ops')),
  file_name text,
  file_b64 text NOT NULL,
  month text,                       -- 'YYYY-MM' of the dates in the template
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (hub, kind),
  CONSTRAINT shift_planner_template_size CHECK (length(file_b64) <= 3000000)
);

ALTER TABLE public.shift_planner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_planner_template ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.shift_planner FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.shift_planner_template FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.shift_planner TO authenticated;
GRANT SELECT ON TABLE public.shift_planner_template TO authenticated;

DROP POLICY IF EXISTS shift_planner_read ON public.shift_planner;
CREATE POLICY shift_planner_read ON public.shift_planner FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shift_planner_template_read ON public.shift_planner_template;
CREATE POLICY shift_planner_template_read ON public.shift_planner_template FOR SELECT TO authenticated USING (true);

-- Save the whole planner document. p_rev must equal the stored rev (optimistic lock); returns the new rev.
CREATE OR REPLACE FUNCTION public.save_shift_planner(p_hub text, p_data jsonb, p_rev integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rev integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'แก้ไขได้เฉพาะผู้ดูแลระบบ' USING errcode = '42501';
  END IF;
  IF nullif(btrim(p_hub), '') IS NULL OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
     OR jsonb_typeof(p_data -> 'employees') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid planner data' USING errcode = '22023';
  END IF;
  IF octet_length(p_data::text) > 2000000 THEN
    RAISE EXCEPTION 'planner data too large' USING errcode = '22023';
  END IF;

  SELECT rev INTO v_rev FROM public.shift_planner WHERE hub = p_hub FOR UPDATE;
  IF NOT FOUND THEN
    IF coalesce(p_rev, 0) <> 0 THEN
      RAISE EXCEPTION 'rev conflict' USING errcode = '40001';
    END IF;
    INSERT INTO public.shift_planner (hub, data, rev, updated_at, updated_by)
    VALUES (p_hub, p_data, 1, now(), auth.jwt() ->> 'email');
    RETURN 1;
  END IF;
  IF v_rev <> coalesce(p_rev, -1) THEN
    RAISE EXCEPTION 'rev conflict' USING errcode = '40001';
  END IF;
  UPDATE public.shift_planner
     SET data = p_data, rev = v_rev + 1, updated_at = now(), updated_by = auth.jwt() ->> 'email'
   WHERE hub = p_hub;
  RETURN v_rev + 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_shift_planner_template(p_hub text, p_kind text, p_file_name text, p_file_b64 text, p_month text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'แก้ไขได้เฉพาะผู้ดูแลระบบ' USING errcode = '42501';
  END IF;
  IF p_kind NOT IN ('driver','ops') OR nullif(btrim(p_hub), '') IS NULL OR nullif(p_file_b64, '') IS NULL THEN
    RAISE EXCEPTION 'invalid template' USING errcode = '22023';
  END IF;
  INSERT INTO public.shift_planner_template (hub, kind, file_name, file_b64, month, updated_at, updated_by)
  VALUES (p_hub, p_kind, left(p_file_name, 200), p_file_b64, left(p_month, 7), now(), auth.jwt() ->> 'email')
  ON CONFLICT (hub, kind) DO UPDATE
    SET file_name = excluded.file_name, file_b64 = excluded.file_b64, month = excluded.month,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_shift_planner(text, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_shift_planner_template(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_shift_planner(text, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_shift_planner_template(text, text, text, text, text) TO authenticated;
