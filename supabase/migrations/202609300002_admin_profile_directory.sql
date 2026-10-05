-- Admin-only profile directory. The hardening migration revokes direct SELECT
-- on profiles.email; expose the directory through a narrowly scoped RPC that
-- checks the authenticated database role before returning personal fields.
create or replace function public.admin_profile_directory(p_search text default null)
returns table (
  id uuid,
  full_name text,
  email text,
  role public.user_role,
  register_number text,
  department_name text,
  department_code text,
  is_active boolean,
  created_at timestamptz,
  must_change_password boolean
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  actor public.profiles;
  term text := nullif(trim(p_search), '');
begin
  actor := public.active_profile_or_error();
  if actor.role <> 'admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.email, p.role, p.register_number,
         d.name, d.code, p.is_active, p.created_at, p.must_change_password
  from public.profiles p
  left join public.departments d on d.id = p.department_id
  where term is null
     or position(lower(term) in lower(coalesce(p.full_name, ''))) > 0
     or position(lower(term) in lower(p.email)) > 0
     or position(lower(term) in lower(coalesce(p.register_number, ''))) > 0
  order by p.full_name
  limit 1000;
end;
$$;

revoke all on function public.admin_profile_directory(text) from public, anon;
grant execute on function public.admin_profile_directory(text) to authenticated;
