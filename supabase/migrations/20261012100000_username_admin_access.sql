-- Username login + admin-managed account permissions for Workstation ABBTG-A.
-- Staged only; apply to production only after PR review and verification.
create table if not exists public.workstation_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  is_active boolean not null default true,
  can_home boolean not null default false,
  can_fleet_overview boolean not null default false,
  can_fleet boolean not null default false,
  can_ops boolean not null default false,
  can_leave boolean not null default false,
  can_manage_fleet boolean not null default false,
  can_manage_ops boolean not null default false,
  can_manage_leave boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workstation_accounts_username_format check (username ~ '^[A-Za-z0-9._-]{3,40}$')
);
create unique index if not exists workstation_accounts_username_lower_uidx on public.workstation_accounts(lower(username));
alter table public.workstation_accounts enable row level security;
revoke all on public.workstation_accounts from anon, authenticated, public;
grant all on public.workstation_accounts to service_role;
-- Current accounts preserve existing page-read access during rollout.
with source_users as (
 select u.*, case when length(lower(left(regexp_replace(split_part(u.email,'@',1),'[^A-Za-z0-9._-]','','g'),32)))<3 then 'user'||substr(replace(u.id::text,'-',''),1,8) else lower(left(regexp_replace(split_part(u.email,'@',1),'[^A-Za-z0-9._-]','','g'),32)) end as base_name
 from auth.users u where u.email is not null
), ranked_users as (
 select s.*, row_number() over(partition by s.base_name order by s.created_at,s.id) as name_rank
 from source_users s
)
insert into public.workstation_accounts(user_id,username,is_active,can_home,can_fleet_overview,can_fleet,can_ops,can_leave)
select u.id,
 case when u.name_rank=1 and not exists(select 1 from public.workstation_accounts a where lower(a.username)=u.base_name)
      then u.base_name else left(u.base_name,31)||'-'||substr(replace(u.id::text,'-',''),1,6) end,
 true,true,true,true,true,
 exists(select 1 from private.app_admins ad where ad.user_id=u.id)
 or exists(select 1 from private.leave_permissions lp where lower(lp.email)=lower(u.email) and lp.can_view)
from ranked_users u on conflict(user_id) do nothing;

create or replace function private.seed_workstation_account()
returns trigger language plpgsql security definer set search_path=''
as $$
declare base_name text; chosen text;
begin
 if new.email is null then return new; end if;
 base_name:=left(lower(regexp_replace(split_part(new.email,'@',1),'[^A-Za-z0-9._-]','','g')),32);
 if length(base_name)<3 then base_name:='user'||substr(replace(new.id::text,'-',''),1,8); end if;
 chosen:=base_name;
 if exists(select 1 from public.workstation_accounts a where lower(a.username)=lower(chosen)) then
   chosen:=left(base_name,31)||'-'||substr(replace(new.id::text,'-',''),1,6);
 end if;
 insert into public.workstation_accounts(user_id,username,is_active,can_home,can_fleet_overview,can_fleet,can_ops,can_leave)
 values(new.id,chosen,true,false,false,false,false,false)
 on conflict(user_id) do nothing;
 return new;
end; $$;
drop trigger if exists seed_workstation_account on auth.users;
create trigger seed_workstation_account after insert on auth.users for each row execute function private.seed_workstation_account();

create or replace view public.workstation_accounts_lookup as
select a.user_id,a.username,lower(u.email) email,a.is_active,a.can_home,a.can_fleet_overview,a.can_fleet,a.can_ops,a.can_leave,
 a.can_manage_fleet,a.can_manage_ops,a.can_manage_leave,a.created_at,a.updated_at
from public.workstation_accounts a join auth.users u on u.id=a.user_id;
revoke all on public.workstation_accounts_lookup from public,anon,authenticated;
grant select on public.workstation_accounts_lookup to service_role;

create or replace function private.has_workstation_access(p_access text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.workstation_accounts a where a.user_id=(select auth.uid()) and a.is_active
 and (exists(select 1 from private.app_admins ad where ad.user_id=(select auth.uid()))
 or case p_access when 'home' then a.can_home when 'fleet_overview' then a.can_fleet_overview
 when 'fleet' then (a.can_fleet or a.can_manage_fleet) when 'ops' then (a.can_ops or a.can_manage_ops) when 'leave' then (a.can_leave or a.can_manage_leave or private.leave_can('view'))
 when 'manage_fleet' then a.can_manage_fleet when 'manage_ops' then a.can_manage_ops
 when 'manage_leave' then a.can_manage_leave else false end));
$$;
revoke all on function private.has_workstation_access(text) from public,anon;
grant execute on function private.has_workstation_access(text) to authenticated;
create or replace function public.get_my_workstation_access()
returns jsonb language sql stable security definer set search_path=''
as $$
 select coalesce((select jsonb_build_object('username',a.username,'active',a.is_active,
 'is_admin',exists(select 1 from private.app_admins ad where ad.user_id=(select auth.uid())),
 'home',a.can_home,'fleet_overview',a.can_fleet_overview,'fleet',a.can_fleet,'ops',a.can_ops,'leave',a.can_leave,
 'manage_fleet',a.can_manage_fleet,'manage_ops',a.can_manage_ops,'manage_leave',a.can_manage_leave)
 from public.workstation_accounts a where a.user_id=(select auth.uid())), '{}'::jsonb);
$$;
revoke all on function public.get_my_workstation_access() from public,anon;
grant execute on function public.get_my_workstation_access() to authenticated;

drop policy if exists "signed-in users can read" on public.daily_report;
create policy "workstation access can read daily report" on public.daily_report for select to authenticated using(private.has_workstation_access('home') or private.has_workstation_access('fleet_overview'));
drop policy if exists "signed-in users can read" on public.fleet_roster;
create policy "workstation access can read fleet roster" on public.fleet_roster for select to authenticated using(private.has_workstation_access('fleet') or private.has_workstation_access('fleet_overview') or private.has_workstation_access('leave'));
drop policy if exists "signed-in users can read" on public.fleet_shifts;
create policy "workstation access can read fleet shifts" on public.fleet_shifts for select to authenticated using(private.has_workstation_access('fleet') or private.has_workstation_access('leave'));
drop policy if exists "signed-in users can read" on public.ops_roster;
create policy "workstation access can read ops roster" on public.ops_roster for select to authenticated using(private.has_workstation_access('ops') or private.has_workstation_access('leave'));
drop policy if exists "signed-in users can read" on public.ops_shifts;
create policy "workstation access can read ops shifts" on public.ops_shifts for select to authenticated using(private.has_workstation_access('ops') or private.has_workstation_access('leave'));
drop policy if exists "signed-in users can read" on public.sheet_snapshot;
create policy "workstation access can read snapshots" on public.sheet_snapshot for select to authenticated using(private.has_workstation_access('home') or private.has_workstation_access('fleet_overview') or private.has_workstation_access('fleet') or private.has_workstation_access('ops'));
drop policy if exists weekly_off_signed_in_read on public.fleet_weekly_off;
create policy weekly_off_workstation_read on public.fleet_weekly_off for select to authenticated using(private.has_workstation_access('fleet') or private.has_workstation_access('leave'));
drop policy if exists weekly_off_signed_in_read on public.ops_weekly_off;
create policy weekly_off_workstation_read on public.ops_weekly_off for select to authenticated using(private.has_workstation_access('ops') or private.has_workstation_access('leave'));

drop policy if exists weekly_off_ot_signed_in_select on public.weekly_off_ot;
create policy weekly_off_ot_workstation_select on public.weekly_off_ot for select to authenticated using(private.has_workstation_access('fleet'));
drop policy if exists weekly_off_ot_signed_in_insert on public.weekly_off_ot;
create policy weekly_off_ot_workstation_insert on public.weekly_off_ot for insert to authenticated with check(private.has_workstation_access('manage_fleet'));
drop policy if exists weekly_off_ot_signed_in_update on public.weekly_off_ot;
create policy weekly_off_ot_workstation_update on public.weekly_off_ot for update to authenticated using(private.has_workstation_access('manage_fleet')) with check(private.has_workstation_access('manage_fleet'));
drop policy if exists weekly_off_ot_signed_in_delete on public.weekly_off_ot;
create policy weekly_off_ot_workstation_delete on public.weekly_off_ot for delete to authenticated using(private.has_workstation_access('manage_fleet'));

drop policy if exists "view leave (admin or can_view)" on public.leave_records;
create policy "view leave (admin or can_view)" on public.leave_records for select to authenticated
using(private.has_workstation_access('leave'));
drop policy if exists "add leave (admin or can_add)" on public.leave_records;
create policy "add leave (admin or can_add)" on public.leave_records for insert to authenticated
with check(private.has_workstation_access('leave') and (private.is_admin() or private.has_workstation_access('manage_leave') or private.leave_can('add')));
drop policy if exists "edit leave (admin or can_edit)" on public.leave_records;
create policy "edit leave (admin or can_edit)" on public.leave_records for update to authenticated
using(private.has_workstation_access('leave') and (private.is_admin() or private.has_workstation_access('manage_leave') or private.leave_can('edit')))
with check(private.has_workstation_access('leave') and (private.is_admin() or private.has_workstation_access('manage_leave') or private.leave_can('edit')));
drop policy if exists "delete leave (admin or can_delete)" on public.leave_records;
create policy "delete leave (admin or can_delete)" on public.leave_records for delete to authenticated
using(private.has_workstation_access('leave') and (private.is_admin() or private.has_workstation_access('manage_leave') or private.leave_can('delete')));
