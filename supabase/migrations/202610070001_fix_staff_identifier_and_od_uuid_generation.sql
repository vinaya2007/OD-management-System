-- Use PostgreSQL's built-in UUID generator for new records and OD submission.
-- Existing UUID values and relationships are left untouched.
do $$
declare
  column_default record;
begin
  for column_default in
    select ns.nspname as schema_name, cls.relname as table_name, att.attname as column_name
    from pg_attrdef def
    join pg_class cls on cls.oid = def.adrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join pg_attribute att on att.attrelid = cls.oid and att.attnum = def.adnum
    where ns.nspname = 'public'
      and att.atttypid = 'uuid'::regtype
      and pg_get_expr(def.adbin, def.adrelid) ilike '%uuid_generate_v4%'
  loop
    execute format('alter table %I.%I alter column %I set default gen_random_uuid()',
      column_default.schema_name, column_default.table_name, column_default.column_name);
  end loop;
end;
$$;

-- The current submit function explicitly generated the request ID using the
-- unavailable uuid-ossp function. Preserve its workflow and only change the
-- generation expression. Related student/faculty links continue to use the
-- same request ID and the existing request_id column.
do $$
declare
  function_definition text;
begin
  function_definition := pg_get_functiondef('public.submit_od_request(jsonb)'::regprocedure);
  if position('uuid_generate_v4()' in function_definition) = 0 then
    raise exception 'submit_od_request(jsonb) no longer contains uuid_generate_v4(); inspect the active function before applying this migration.';
  end if;
  function_definition := replace(function_definition, 'uuid_generate_v4()', 'gen_random_uuid()');
  execute function_definition;
end;
$$;

-- Keep the existing student register-number format while allowing an
-- arbitrary non-empty department-issued identifier for staff profiles.
alter table public.profiles
  drop constraint if exists profiles_register_number_check;

alter table public.profiles
  add constraint profiles_register_number_check
  check (
    register_number is null
    or (role = 'student' and register_number ~* '^RA[A-Z0-9]+$')
    or (role in ('faculty', 'hod', 'admin') and length(btrim(register_number)) between 1 and 120)
  );

-- Staff roles come from the invitation record. Only remove the erroneous
-- prefix restriction from the identifier collected during account setup.
create or replace function public.complete_staff_account_setup(
  p_full_name text,
  p_faculty_id text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  invitation public.staff_account_invitations%rowtype;
  department_row public.departments%rowtype;
  actor public.profiles%rowtype;
  staff_id text := trim(coalesce(p_faculty_id, ''));
  staff_name text := trim(coalesce(p_full_name, ''));
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select lower(email) into actor_email
  from auth.users
  where id = actor_id and email_confirmed_at is not null;
  if actor_email is null or lower(split_part(actor_email, '@', 2)) <> 'srmist.edu.in' then
    raise exception 'A verified SRMIST email is required.' using errcode = '42501';
  end if;

  select * into invitation
  from public.staff_account_invitations
  where email = actor_email
    and auth_user_id = actor_id
    and claimed_at is not null
    and completed_at is null
    and expires_at > now()
    and role in ('faculty', 'hod')
  for update;
  if invitation.id is null then
    raise exception 'No pending staff invitation was found for this account.' using errcode = '42501';
  end if;

  select * into department_row
  from public.departments
  where id = invitation.department_id and code = 'ECE' and is_active = true;
  if department_row.id is null then
    raise exception 'The invited ECE department is not active.' using errcode = '23503';
  end if;
  if length(staff_name) not between 2 and 120 or length(staff_id) not between 1 and 120 then
    raise exception 'Enter a valid name and non-empty Faculty ID.' using errcode = '23514';
  end if;

  select * into actor from public.profiles where auth_user_id = actor_id for update;
  if actor.id is null then
    insert into public.profiles (
      auth_user_id, full_name, email, register_number, department_id, role,
      is_admin_access, is_active, must_change_password, staff_setup_pending,
      created_at, updated_at
    ) values (
      actor_id, staff_name, actor_email, staff_id, invitation.department_id,
      invitation.role, false, true, false, false, now(), now()
    );
  else
    if actor.email <> actor_email
       or actor.role <> invitation.role
       or actor.department_id <> invitation.department_id
       or actor.staff_setup_pending is distinct from true then
      raise exception 'The existing profile does not match this pending invitation.' using errcode = '42501';
    end if;
    update public.profiles
    set full_name = staff_name,
        register_number = staff_id,
        is_active = true,
        must_change_password = false,
        staff_setup_pending = false,
        updated_at = now()
    where id = actor.id;
  end if;

  update public.staff_account_invitations
  set completed_at = now()
  where id = invitation.id;
end;
$$;

revoke all on function public.complete_staff_account_setup(text, text) from public, anon;
grant execute on function public.complete_staff_account_setup(text, text) to authenticated;
