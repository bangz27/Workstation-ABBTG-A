-- Daily OT records are intentionally separate from Owner Source / weekly-off roster data.
create table if not exists public.weekly_off_ot (
  shift_date date not null,
  staff_type text not null check (staff_type in ('fleet', 'ops')),
  person_id text not null check (length(btrim(person_id)) between 1 and 100),
  person_name text not null default '' check (length(person_name) <= 300),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_off_ot_pkey primary key (shift_date, staff_type, person_id)
);

create index if not exists weekly_off_ot_shift_date_idx
  on public.weekly_off_ot (shift_date, staff_type, person_name);

alter table public.weekly_off_ot enable row level security;

grant select, insert, update, delete on public.weekly_off_ot to authenticated;

create policy weekly_off_ot_signed_in_select
  on public.weekly_off_ot for select to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy weekly_off_ot_signed_in_insert
  on public.weekly_off_ot for insert to authenticated
  with check (
    coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and created_by = (select auth.uid())
  );

create policy weekly_off_ot_signed_in_update
  on public.weekly_off_ot for update to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check (
    coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy weekly_off_ot_signed_in_delete
  on public.weekly_off_ot for delete to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);
