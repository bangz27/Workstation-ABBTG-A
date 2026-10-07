REVOKE SELECT ON TABLE public.fleet_weekly_off FROM PUBLIC, anon;
REVOKE SELECT ON TABLE public.ops_weekly_off FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.fleet_weekly_off TO authenticated;
GRANT SELECT ON TABLE public.ops_weekly_off TO authenticated;

DROP POLICY IF EXISTS weekly_off_public_read ON public.fleet_weekly_off;
DROP POLICY IF EXISTS weekly_off_public_read ON public.ops_weekly_off;

CREATE POLICY weekly_off_signed_in_read ON public.fleet_weekly_off
  FOR SELECT TO authenticated
  USING (COALESCE(((SELECT auth.jwt() AS jwt) ->> 'is_anonymous')::boolean, false) = false);
CREATE POLICY weekly_off_signed_in_read ON public.ops_weekly_off
  FOR SELECT TO authenticated
  USING (COALESCE(((SELECT auth.jwt() AS jwt) ->> 'is_anonymous')::boolean, false) = false);
