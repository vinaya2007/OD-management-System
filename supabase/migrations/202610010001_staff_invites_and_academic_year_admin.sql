-- Staff can only be provisioned through an Admin-created, email-bound invite.
-- Authenticated users cannot read or modify invitation records.
create table if not exists public.staff_account_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email ~* '^[^@]+@srmist\.edu\.in$'),
  role public.user_role not null check (role in ('faculty','hod')),
  department_id uuid not null references public.departments(id) on delete restrict,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  auth_user_id uuid unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.staff_account_invitations enable row level security;
revoke all on public.staff_account_invitations from public, anon, authenticated;
grant all on public.staff_account_invitations to service_role;

alter table public.profiles add column if not exists staff_setup_pending boolean not null default false;
grant select (staff_setup_pending) on public.profiles to authenticated;

-- Override earlier Auth triggers so a valid invite is resolved before public
-- student registration metadata. The role and department come only from the
-- protected invitation row, never from user-editable metadata.
create or replace function public.provision_student_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare
  department_row public.departments%rowtype;
  invitation public.staff_account_invitations%rowtype;
  provisioned_profile_id uuid;
  profile_name text;
  register_no text;
  section_value text;
  year_value text;
  department_code text;
begin
  if new.email is null or lower(split_part(new.email,'@',2)) <> 'srmist.edu.in' then
    raise exception 'Only @srmist.edu.in accounts can use this application.' using errcode='23514';
  end if;

  select * into invitation from public.staff_account_invitations
   where email=lower(new.email) and auth_user_id is null and claimed_at is null and expires_at>now()
   for update;
  if invitation.id is not null then
    select * into department_row from public.departments where id=invitation.department_id and is_active=true;
    if department_row.id is null or department_row.code <> 'ECE' then
      raise exception 'The invited ECE department is not active.' using errcode='23503';
    end if;
    insert into public.profiles(auth_user_id,full_name,email,role,department_id,is_active,must_change_password,staff_setup_pending)
    values(new.id,split_part(new.email,'@',1),lower(new.email),invitation.role,invitation.department_id,false,false,true)
    on conflict(email) do update set auth_user_id=excluded.auth_user_id,role=excluded.role,
      department_id=excluded.department_id,is_active=false,must_change_password=false,
      staff_setup_pending=true,updated_at=now()
    where public.profiles.staff_setup_pending=true
      and public.profiles.role=excluded.role
      and public.profiles.department_id=excluded.department_id
    returning id into provisioned_profile_id;
    if provisioned_profile_id is null then
      raise exception 'This email is already linked to a non-pending profile.' using errcode='23505';
    end if;
    update public.staff_account_invitations set auth_user_id=new.id,claimed_at=now() where id=invitation.id;
    return new;
  end if;

  profile_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name')),'');
  register_no := upper(trim(coalesce(new.raw_user_meta_data->>'register_number','')));
  section_value := upper(trim(coalesce(new.raw_user_meta_data->>'section','')));
  year_value := upper(trim(coalesce(new.raw_user_meta_data->>'year','')));
  department_code := upper(trim(coalesce(new.raw_user_meta_data->>'department_code','')));
  if profile_name is null or length(profile_name) not between 2 and 120
    or register_no !~ '^RA[A-Z0-9]{6,18}$' or section_value not in ('A','B')
    or year_value not in ('I','II','III','IV') or department_code <> 'ECE' then
    raise exception 'Required student registration details are invalid.' using errcode='23514';
  end if;
  select * into department_row from public.departments where code=department_code and is_active=true limit 1;
  if department_row.id is null then raise exception 'The ECE department is not active.' using errcode='23503'; end if;
  insert into public.profiles(auth_user_id,full_name,email,role,department_id,register_number,section,year,is_active)
  values(new.id,profile_name,lower(new.email),'student'::public.user_role,department_row.id,register_no,section_value,year_value,true);
  return new;
end $$;
revoke all on function public.provision_student_profile_for_auth_user() from public,anon,authenticated;

-- Setup is only callable by the currently authenticated, email-confirmed user
-- whose Auth user id owns a still-pending invited profile.
create or replace function public.complete_staff_account_setup(p_full_name text,p_faculty_id text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare actor public.profiles%rowtype; staff_id text;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and lower(split_part(email,'@',2))='srmist.edu.in') then
    raise exception 'A verified SRMIST email is required.' using errcode='42501';
  end if;
  select * into actor from public.profiles where auth_user_id=auth.uid() for update;
  if actor.id is null or actor.staff_setup_pending is distinct from true or actor.role not in ('faculty','hod') then
    raise exception 'No pending staff invitation was found for this account.' using errcode='42501';
  end if;
  staff_id:=upper(trim(coalesce(p_faculty_id,'')));
  if length(trim(coalesce(p_full_name,''))) not between 2 and 120 or staff_id !~ '^RA[A-Z0-9]{6,18}$' then
    raise exception 'Enter a valid name and Faculty ID.' using errcode='23514';
  end if;
  update public.profiles set full_name=trim(p_full_name),register_number=staff_id,
    staff_setup_pending=false,is_active=true,updated_at=now() where id=actor.id;
end $$;
revoke all on function public.complete_staff_account_setup(text,text) from public,anon;
grant execute on function public.complete_staff_account_setup(text,text) to authenticated;

-- Admin-only atomic operation: configure the year and make it the single
-- active year used by submit_od_request.
create or replace function public.admin_save_academic_year(p_name text,p_start_date date,p_end_date date)
returns uuid language plpgsql security definer set search_path=public set row_security=off as $$
declare actor public.profiles%rowtype; year_id uuid; year_name text;
begin
  actor:=public.active_profile_or_error();
  if actor.role<>'admin' then raise exception 'Admin role required.' using errcode='42501'; end if;
  year_name:=trim(coalesce(p_name,''));
  if length(year_name) not between 4 and 80 or p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Enter a valid academic year name and date range.' using errcode='23514';
  end if;
  update public.academic_years set is_active=false,updated_at=now() where is_active=true and lower(name)<>lower(year_name);
  insert into public.academic_years(name,start_date,end_date,is_active)
   values(year_name,p_start_date,p_end_date,true)
   on conflict(name) do update set start_date=excluded.start_date,end_date=excluded.end_date,is_active=true,updated_at=now()
   returning id into year_id;
  return year_id;
end $$;
revoke all on function public.admin_save_academic_year(text,date,date) from public,anon;
grant execute on function public.admin_save_academic_year(text,date,date) to authenticated;
