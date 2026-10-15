-- Daily Report: add "Time Since Last Delivery" (Daily Report column H, from import!S).
-- Additive and backward compatible:
--   * new column defaults to '' so an older Sync.gs (no "idle" field) keeps working;
--   * sync_sheet_apply / get_daily_report are patched in place (one column added),
--     everything else in their current definitions is kept as-is.

alter table public.daily_report add column if not exists last_del_gap text not null default '';

do $mig$
declare
  v text;
  a1 constant text := 'insert into public.daily_report (row_no, driver_id, driver_name, position, first_del, assign, delivered, onhold)';
  a2 constant text := E'::int\n    from jsonb_array_elements(v_sec -> ''drivers'')';
  b1 constant text := '''onhold'', d.onhold)';
begin
  -- 1) writer: store drivers[].idle
  select pg_get_functiondef('private.sync_sheet_apply(text,jsonb)'::regprocedure) into v;
  if position('last_del_gap' in v) = 0 then
    if position(a1 in v) = 0 or position(a2 in v) = 0 then
      raise exception 'sync_sheet_apply: expected daily_report insert not found';
    end if;
    v := replace(v, a1, left(a1, length(a1) - 1) || ', last_del_gap)');
    v := replace(v, a2, E'::int,\n           left(coalesce(e.d ->> ''idle'', ''''), 40)\n    from jsonb_array_elements(v_sec -> ''drivers'')');
    execute v;
  end if;

  -- 2) reader: return drivers[].idle
  select pg_get_functiondef('public.get_daily_report()'::regprocedure) into v;
  if position('last_del_gap' in v) = 0 then
    if position(b1 in v) = 0 then
      raise exception 'get_daily_report: expected drivers object not found';
    end if;
    v := replace(v, b1, '''onhold'', d.onhold, ''idle'', d.last_del_gap)');
    execute v;
  end if;
end
$mig$;
