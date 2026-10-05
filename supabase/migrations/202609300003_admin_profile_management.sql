-- Permit Admins to change roles/status for profiles that already exist.
-- These narrowly scoped RPCs avoid requiring the Auth service-role key for
-- ordinary profile administration; Auth user creation still requires it.
create or replace function public.admin_set_profile_role(p_profile_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor public.profiles := public.active_profile_or_error();
  target public.profiles;
begin
  if actor.role <> 'admin' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_profile_id = actor.id then raise exception 'CANNOT_CHANGE_OWN_ROLE' using errcode = '42501'; end if;
  if p_role not in ('student', 'faculty', 'hod') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  select * into target from public.profiles where id = p_profile_id for update;
  if target.id is null then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  if target.role = 'admin' then raise exception 'ADMIN_ROLE_IS_SQL_MANAGED' using errcode = '42501'; end if;
  update public.profiles set role = p_role, updated_at = now() where id = target.id;
end;
$$;

create or replace function public.admin_set_profile_active(p_profile_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor public.profiles := public.active_profile_or_error();
  target public.profiles;
  active_admin_count integer;
begin
  if actor.role <> 'admin' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_profile_id = actor.id then raise exception 'CANNOT_CHANGE_OWN_STATUS' using errcode = '42501'; end if;
  select * into target from public.profiles where id = p_profile_id for update;
  if target.id is null then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  if target.role = 'admin' and target.is_active and not p_is_active then
    select count(*) into active_admin_count from public.profiles where role = 'admin' and is_active;
    if active_admin_count <= 1 then raise exception 'LAST_ACTIVE_ADMIN' using errcode = '42501'; end if;
  end if;
  update public.profiles set is_active = p_is_active, updated_at = now() where id = target.id;
end;
$$;

revoke all on function public.admin_set_profile_role(uuid, public.user_role) from public, anon;
revoke all on function public.admin_set_profile_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_profile_role(uuid, public.user_role) to authenticated;
grant execute on function public.admin_set_profile_active(uuid, boolean) to authenticated;
