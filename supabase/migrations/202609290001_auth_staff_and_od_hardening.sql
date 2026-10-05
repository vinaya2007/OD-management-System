-- ============================================================================
-- FINAL SCHEMA COMPATIBILITY PREAMBLE
-- Makes the hardening migration compatible with the current OD schema.
-- No student/faculty/admin dummy accounts are created here.
-- ============================================================================

-- The base schema uses od_status. Create the auxiliary faculty-review status
-- enum only if it is not already present.
do $$ begin
  if not exists (select 1 from pg_type where typnamespace='public'::regnamespace and typname='faculty_approval_status') then
    create type public.faculty_approval_status as enum ('PENDING','APPROVED','REJECTED');
  end if;
end $$;

alter type public.od_status add value if not exists 'WITHDRAWN';

-- Academic-year configuration used by OD submission. No fake user data is added.
create table if not exists public.academic_years (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_years_date_check check (end_date >= start_date)
);
create unique index if not exists academic_years_one_active_idx
  on public.academic_years ((is_active)) where is_active=true;

-- OD limit configuration is retained as a read-only configuration surface.
create table if not exists public.od_limits (
  id uuid primary key default uuid_generate_v4(),
  department_id uuid not null references public.departments(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete cascade,
  max_ods integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, academic_year_id)
);

-- The current OD model supports multiple faculty reviewers per request.
create table if not exists public.od_request_faculty (
  id uuid primary key default uuid_generate_v4(),
  od_request_id uuid not null references public.od_requests(id) on delete cascade,
  faculty_id uuid not null references public.profiles(id) on delete restrict,
  status public.faculty_approval_status not null default 'PENDING',
  remarks text,
  action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (od_request_id, faculty_id)
);
create index if not exists od_request_faculty_request_idx
  on public.od_request_faculty(od_request_id);
create index if not exists od_request_faculty_faculty_idx
  on public.od_request_faculty(faculty_id, status);

-- Immutable-ish workflow audit trail for OD state transitions.
create table if not exists public.od_approval_history (
  id uuid primary key default uuid_generate_v4(),
  od_request_id uuid not null references public.od_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role public.user_role not null,
  action text not null,
  from_status public.od_status,
  to_status public.od_status,
  remarks text,
  created_at timestamptz not null default now()
);
create index if not exists od_approval_history_request_idx
  on public.od_approval_history(od_request_id, created_at desc);

-- Add the fields used by the hardened RPC workflow if the base schema does not
-- already contain them.
alter table public.od_requests
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete restrict,
  add column if not exists event_type text,
  add column if not exists purpose text,
  add column if not exists requester_remarks text,
  add column if not exists is_potential_duplicate boolean not null default false,
  add column if not exists idempotency_key uuid,
  add column if not exists faculty_id uuid references public.profiles(id) on delete set null,
  add column if not exists faculty_action_at timestamptz,
  add column if not exists faculty_remarks text,
  add column if not exists hod_id uuid references public.profiles(id) on delete set null,
  add column if not exists hod_action_at timestamptz,
  add column if not exists hod_remarks text;

create unique index if not exists od_requests_requester_idempotency_idx
  on public.od_requests(requester_id,idempotency_key)
  where idempotency_key is not null;

-- Notifications in the final workflow use these names. Existing notification
-- columns are preserved; these are additive compatibility columns.
alter table public.notifications
  add column if not exists od_request_id uuid references public.od_requests(id) on delete cascade,
  add column if not exists notification_type text,
  add column if not exists read_at timestamptz;

-- Academic year timestamps are maintained with the common trigger function
-- created later in this migration when available.


alter table public.profiles add column if not exists designation text;
-- Incremental auth, staff provisioning, and OD workflow hardening.
-- Existing users, profiles, and OD records are preserved.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

alter table public.od_requests
  add column if not exists start_period smallint,
  add column if not exists end_period smallint,
  add column if not exists faculty_rejection_reason text,
  add column if not exists hod_rejection_reason text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='od_requests_period_range_check' and conrelid='public.od_requests'::regclass) then
    alter table public.od_requests add constraint od_requests_period_range_check
      check ((start_period is null and end_period is null) or (start_period between 1 and 9 and end_period between start_period and 9));
  end if;
end $$;

-- Authentication-bound role helpers are defined before any policy uses them.
create or replace function public.active_profile_or_error()
returns public.profiles language plpgsql stable security definer set search_path=public,auth as $$
declare actor public.profiles; verified_email text;
begin
  select u.email into verified_email from auth.users u where u.id=auth.uid()
    and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))='srmist.edu.in';
  if verified_email is null then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  select p.* into actor from public.profiles p where p.auth_user_id=auth.uid()
    and p.is_active and lower(p.email)=lower(verified_email) limit 1;
  if actor.id is null then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  return actor;
end $$;
create or replace function public.current_profile()
returns public.profiles language sql stable security definer set search_path=public as $$
  select * from public.active_profile_or_error()
$$;
create or replace function public.current_role()
returns public.user_role language sql stable security definer set search_path=public as $$
  select actor.role from public.active_profile_or_error() actor
$$;
revoke all on function public.active_profile_or_error(),public.current_profile(),public.current_role() from public,anon;
grant execute on function public.active_profile_or_error(),public.current_profile(),public.current_role() to authenticated;

create or replace function public.get_my_od_profile()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error();
begin
  return jsonb_build_object('id',actor.id,'full_name',actor.full_name,'role',actor.role,
    'is_active',actor.is_active,'must_change_password',actor.must_change_password,
    'register_number',actor.register_number,'section',actor.section,'year',actor.year,
    'department_id',actor.department_id,'designation',actor.designation);
end $$;
revoke all on function public.get_my_od_profile() from public,anon;
grant execute on function public.get_my_od_profile() to authenticated;

create table if not exists public.faculty_role_requests (
  id uuid primary key default uuid_generate_v4(),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  email text not null check (lower(email) like '%@srmist.edu.in'),
  department_id uuid not null references public.departments(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 5 and 2000),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  admin_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists faculty_role_requests_status_created_idx
  on public.faculty_role_requests (status, created_at desc);
create index if not exists faculty_role_requests_requester_idx
  on public.faculty_role_requests (requester_id, created_at desc);
alter table public.faculty_role_requests enable row level security;
grant select, insert, update on public.faculty_role_requests to authenticated;
drop policy if exists "faculty role requests scoped read" on public.faculty_role_requests;
create policy "faculty role requests scoped read" on public.faculty_role_requests for select to authenticated using (
  requester_id=(public.current_profile()).id or public.current_role()='admin'
);
drop policy if exists "hod creates own faculty requests" on public.faculty_role_requests;
create policy "hod creates own faculty requests" on public.faculty_role_requests for insert to authenticated with check (
  requester_id=(public.current_profile()).id and public.current_role()='hod'
  and department_id=(public.current_profile()).department_id
);
drop policy if exists "admin reviews faculty role requests" on public.faculty_role_requests;
create policy "admin reviews faculty role requests" on public.faculty_role_requests for update to authenticated
  using (public.current_role()='admin') with check (public.current_role()='admin');

-- Active department labels are public registration metadata, not user data.
drop policy if exists "public reads active departments for registration" on public.departments;
create policy "public reads active departments for registration" on public.departments
  for select to anon, authenticated using (is_active=true);
grant select on public.departments to anon, authenticated;
-- Ensure the configured ECE department exists without overwriting an existing row.
insert into public.departments(name,code,is_active) values ('Electronics and Communication Engineering','ECE',true) on conflict(code) do nothing;

-- Atomic Auth-to-profile provisioning. Public Auth metadata can only create
-- students. Staff role markers are read from app_metadata, which only the
-- server-side Supabase Admin API can set.
create or replace function public.provision_student_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  department_row public.departments;
  profile_name text;
  register_no text;
  section_value text;
  year_value text;
  department_code text;
  assigned_role public.user_role := 'student';
  staff_marker text;
  must_change boolean := false;
begin
  if new.email is null or lower(split_part(new.email,'@',2)) <> 'srmist.edu.in' then
    raise exception 'Only @srmist.edu.in accounts can use this application.' using errcode='23514';
  end if;

  profile_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), nullif(trim(new.raw_user_meta_data->>'name'),''));
  department_code := upper(trim(coalesce(new.raw_user_meta_data->>'department_code', '')));
  staff_marker := new.raw_app_meta_data->>'od_staff_role';

  if staff_marker in ('faculty','hod') then
    assigned_role := staff_marker::public.user_role;
    department_code := upper(trim(coalesce(new.raw_app_meta_data->>'od_department_code','ECE')));
    must_change := coalesce((new.raw_app_meta_data->>'must_change_password')::boolean, true);
  else
    register_no := upper(trim(coalesce(new.raw_user_meta_data->>'register_number','')));
    section_value := upper(trim(coalesce(new.raw_user_meta_data->>'section','')));
    year_value := upper(trim(coalesce(new.raw_user_meta_data->>'year','')));
    if profile_name is null or length(profile_name) not between 2 and 120
      or register_no !~ '^RA[A-Z0-9]{6,18}$'
      or section_value not in ('A','B')
      or year_value not in ('I','II','III','IV') then
      raise exception 'Required student profile information is invalid or incomplete.' using errcode='23514';
    end if;
  end if;

  select * into department_row from public.departments
    where code=department_code and is_active=true limit 1;
  if department_row.id is null or department_row.code <> 'ECE' then
    raise exception 'The selected ECE department is not active.' using errcode='23503';
  end if;

  if assigned_role='student' then
    insert into public.profiles
      (auth_user_id,full_name,email,role,department_id,register_number,section,year,is_active,must_change_password)
    values
      (new.id,profile_name,lower(new.email),'student',department_row.id,register_no,section_value,year_value,true,false);
  else
    if profile_name is null or length(profile_name) not between 2 and 120 then
      profile_name := split_part(new.email,'@',1);
    end if;
    insert into public.profiles
      (auth_user_id,full_name,email,role,department_id,is_active,must_change_password)
    values
      (new.id,profile_name,lower(new.email),assigned_role,department_row.id,true,must_change);
  end if;
  return new;
end $$;

drop trigger if exists auth_user_provision_student_profile on auth.users;
create trigger auth_user_provision_student_profile after insert on auth.users
  for each row execute function public.provision_student_profile_for_auth_user();
revoke all on function public.provision_student_profile_for_auth_user() from public, anon, authenticated;

-- Profile search exposes only the fields needed for OD recipient selection.
drop function if exists public.search_ece_students(text);
create function public.search_ece_students(p_query text)
returns table(id uuid,name text,register_number text,section text,department text,year text)
language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); term text;
begin
  if actor.role<>'student' or length(trim(coalesce(p_query,'')))<2 or length(p_query)>80 then
    raise exception 'Enter at least two characters to search.' using errcode='P0001';
  end if;
  term := replace(replace(replace(trim(p_query),'\','\\'),'%','\%'),'_','\_');
  return query select p.id,p.full_name,p.register_number,p.section,d.name,p.year
    from public.profiles p join public.departments d on d.id=p.department_id
    where p.role='student' and p.is_active and p.department_id=actor.department_id
      and p.id<>actor.id
      and (p.register_number ilike '%'||term||'%' escape '\' or p.full_name ilike '%'||term||'%' escape '\')
    order by p.full_name limit 50;
end $$;
revoke all on function public.search_ece_students(text) from public,anon;
grant execute on function public.search_ece_students(text) to authenticated;

drop function if exists public.complete_student_profile(text,text,text);

-- Rebind request creation to the current provisioned schema and requester / OD
-- student distinction. All request writes happen in this security-definer RPC.
create or replace function public.submit_od_request(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor public.profiles := public.active_profile_or_error();
  new_id uuid := coalesce(nullif(p_payload->>'id','')::uuid,uuid_generate_v4());
  year_id uuid;
  student_count integer;
  distinct_count integer;
  duplicate_found boolean := false;
  request_date date := (p_payload->>'event_date')::date;
  period_from smallint := nullif(p_payload->>'start_period','')::smallint;
  period_to smallint := nullif(p_payload->>'end_period','')::smallint;
begin
  if actor.role<>'student' or actor.department_id is null or actor.register_number is null or actor.section is null or actor.year is null then
    raise exception 'Required student identity details are missing from the OD record. Contact the ECE administrator.' using errcode='P0001';
  end if;
  select id into year_id from public.academic_years where is_active=true limit 1;
  if year_id is null then raise exception 'No active academic year is configured.' using errcode='P0001'; end if;
  if nullif(p_payload->>'idempotency_key','') is null or jsonb_typeof(p_payload->'student_ids')<>'array'
    or jsonb_typeof(p_payload->'faculty_ids')<>'array' then raise exception 'Select OD students and faculty reviewers.' using errcode='P0001'; end if;
  student_count := jsonb_array_length(p_payload->'student_ids');
  if student_count<1 then raise exception 'Select at least one OD student.' using errcode='P0001'; end if;
  select count(distinct value::uuid) into distinct_count from jsonb_array_elements_text(p_payload->'student_ids');
  if distinct_count<>student_count then raise exception 'An OD student cannot be selected more than once.' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'student_ids') ids(value)
    left join public.profiles p on p.id=ids.value::uuid and p.role='student' and p.is_active and p.department_id=actor.department_id
    where p.id is null) then raise exception 'One or more selected OD students are unavailable.' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'faculty_ids') ids(value)
    left join public.profiles p on p.id=ids.value::uuid and p.role='faculty' and p.is_active and p.department_id=actor.department_id
    where p.id is null) then raise exception 'One or more faculty reviewers are unavailable.' using errcode='P0001'; end if;
  if (p_payload->>'end_time')::time <= (p_payload->>'start_time')::time then raise exception 'End time must be after start time.' using errcode='P0001'; end if;
  if period_from not between 1 and 9 or period_to not between period_from and 9 then raise exception 'Select a valid period range from 1 to 9.' using errcode='P0001'; end if;

  select exists(select 1 from public.od_requests prior join public.od_request_students ps on ps.request_id=prior.id
    where prior.department_id=actor.department_id and prior.event_date=request_date
      and lower(prior.event_name)=lower(trim(p_payload->>'event_name'))
      and prior.status not in ('REJECTED_BY_FACULTY','REJECTED_BY_HOD','WITHDRAWN')
      and (p_payload->>'start_time')::time < coalesce(prior.end_time,'23:59:59'::time)
      and prior.start_time < (p_payload->>'end_time')::time
      and ps.student_id in (select value::uuid from jsonb_array_elements_text(p_payload->'student_ids') ids(value)))
    into duplicate_found;

  insert into public.od_requests
    (id,requester_id,department_id,academic_year_id,event_name,event_type,organization,event_date,start_period,end_period,start_time,end_time,venue,purpose,requester_remarks,status,is_potential_duplicate,idempotency_key)
  values
    (new_id,actor.id,actor.department_id,year_id,trim(p_payload->>'event_name'),coalesce(nullif(trim(p_payload->>'event_type'),''),'Other'),nullif(trim(p_payload->>'organization'),''),request_date,period_from,period_to,(p_payload->>'start_time')::time,(p_payload->>'end_time')::time,trim(p_payload->>'venue'),nullif(trim(p_payload->>'purpose'),''),nullif(trim(p_payload->>'requester_remarks'),''),'PENDING_FACULTY',duplicate_found,(p_payload->>'idempotency_key')::uuid)
  on conflict (requester_id,idempotency_key) where idempotency_key is not null do nothing;
  if not found then
    select id into new_id from public.od_requests where requester_id=actor.id and idempotency_key=(p_payload->>'idempotency_key')::uuid;
    return jsonb_build_object('id',new_id,'potentialDuplicate',false);
  end if;

  insert into public.od_request_students(request_id,student_id)
    select new_id,value::uuid from jsonb_array_elements_text(p_payload->'student_ids') ids(value);
  insert into public.od_request_faculty(od_request_id,faculty_id)
    select new_id,value::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') ids(value);
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,to_status)
    values(new_id,actor.id,'student','SUBMITTED','PENDING_FACULTY');
  insert into public.notifications(user_id,od_request_id,notification_type,title,message)
    select distinct targets.user_id,new_id,'OD_REQUEST_SUBMITTED','OD request submitted','A new OD request requires your review.'
    from (select actor.id user_id union select value::uuid from jsonb_array_elements_text(p_payload->'student_ids') ids(value)
      union select value::uuid from jsonb_array_elements_text(p_payload->'faculty_ids') ids(value)) targets;
  return jsonb_build_object('id',new_id,'potentialDuplicate',duplicate_found);
end $$;

create or replace function public.decide_od_request_faculty(p_request_id uuid,p_approved boolean,p_remarks text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); request_row public.od_requests; next_status public.od_status;
begin
  if actor.role<>'faculty' or (not p_approved and nullif(trim(p_remarks),'') is null) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from public.od_requests where id=p_request_id for update;
  if request_row.id is null or request_row.department_id<>actor.department_id or request_row.status<>'PENDING_FACULTY'
    or not exists(select 1 from public.od_request_faculty where od_request_id=p_request_id and faculty_id=actor.id and status='PENDING') then raise exception 'INVALID_STATUS_TRANSITION' using errcode='P0001'; end if;
  update public.od_request_faculty set status=case when p_approved then 'APPROVED'::public.faculty_approval_status else 'REJECTED'::public.faculty_approval_status end,remarks=nullif(trim(p_remarks),''),action_at=now(),updated_at=now()
    where od_request_id=p_request_id and faculty_id=actor.id;
  if not p_approved then next_status := 'REJECTED_BY_FACULTY'::public.od_status;
  elsif exists(select 1 from public.od_request_faculty where od_request_id=p_request_id and status='PENDING') then next_status := 'PENDING_FACULTY'::public.od_status;
  else next_status := 'PENDING_HOD'::public.od_status;
  end if;
  update public.od_requests set status=next_status,
    faculty_id=case when next_status='PENDING_HOD' then actor.id else faculty_id end,
    faculty_action_at=case when next_status<>'PENDING_FACULTY' then now() else faculty_action_at end,
    faculty_remarks=case when next_status<>'PENDING_FACULTY' then nullif(trim(p_remarks),'') else faculty_remarks end,
    faculty_rejection_reason=case when next_status='REJECTED_BY_FACULTY' then trim(p_remarks) else null end,
    updated_at=now() where id=p_request_id;
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,from_status,to_status,remarks)
    values(p_request_id,actor.id,'faculty',case when p_approved then 'FACULTY_APPROVED' else 'FACULTY_REJECTED' end,'PENDING_FACULTY',next_status,p_remarks);
  if next_status<>'PENDING_FACULTY' then
    insert into public.notifications(user_id,od_request_id,notification_type,title,message)
      select distinct target.user_id,p_request_id,case when next_status='PENDING_HOD' then 'FACULTY_APPROVED' else 'FACULTY_REJECTED' end,
        case when next_status='PENDING_HOD' then 'Faculty approved OD request' else 'Faculty rejected OD request' end,
        coalesce(nullif(trim(p_remarks),''),case when next_status='PENDING_HOD' then 'Your OD request is pending HOD review.' else 'Your OD request was rejected by faculty.' end)
      from (select request_row.requester_id user_id union select student_id from public.od_request_students where request_id=p_request_id) target;
  end if;
  if next_status='PENDING_HOD' then
    insert into public.notifications(user_id,od_request_id,notification_type,title,message)
      select p.id,p_request_id,'OD_PENDING_HOD','OD request requires HOD review','A faculty-approved OD request is ready for HOD review.'
      from public.profiles p where p.role='hod' and p.is_active and p.department_id=actor.department_id;
  end if;
end $$;

create or replace function public.decide_od_request_hod(p_request_id uuid,p_approved boolean,p_remarks text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); request_row public.od_requests; next_status public.od_status;
begin
  if actor.role<>'hod' or (not p_approved and nullif(trim(p_remarks),'') is null) then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from public.od_requests where id=p_request_id for update;
  if request_row.id is null or request_row.department_id<>actor.department_id or request_row.status<>'PENDING_HOD'
    or request_row.faculty_id is null or not exists(select 1 from public.od_request_faculty where od_request_id=p_request_id and faculty_id=request_row.faculty_id and status='APPROVED') then raise exception 'INVALID_STATUS_TRANSITION' using errcode='P0001'; end if;
  next_status := case when p_approved then 'APPROVED'::public.od_status else 'REJECTED_BY_HOD'::public.od_status end;
  update public.od_requests set status=next_status,hod_id=actor.id,hod_action_at=now(),hod_remarks=nullif(trim(p_remarks),''),hod_rejection_reason=case when p_approved then null else trim(p_remarks) end,updated_at=now() where id=p_request_id;
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,from_status,to_status,remarks)
    values(p_request_id,actor.id,'hod',case when p_approved then 'HOD_APPROVED' else 'HOD_REJECTED' end,'PENDING_HOD',next_status,p_remarks);
  insert into public.notifications(user_id,od_request_id,notification_type,title,message)
    select distinct target.user_id,p_request_id,case when p_approved then 'HOD_APPROVED' else 'HOD_REJECTED' end,
      case when p_approved then 'OD request approved' else 'OD request rejected by HOD' end,
      coalesce(nullif(trim(p_remarks),''),case when p_approved then 'Your OD request has been approved.' else 'Your OD request was rejected by the HOD.' end)
    from (select request_row.requester_id user_id union select student_id from public.od_request_students where request_id=p_request_id
      union select faculty_id from public.od_request_faculty where od_request_id=p_request_id) target;
end $$;

grant execute on function public.submit_od_request(jsonb), public.decide_od_request_faculty(uuid,boolean,text), public.decide_od_request_hod(uuid,boolean,text) to authenticated;
revoke all on function public.submit_od_request(jsonb), public.decide_od_request_faculty(uuid,boolean,text), public.decide_od_request_hod(uuid,boolean,text) from public,anon;

-- A staff member can clear the temporary-password gate only for their own
-- authenticated faculty/HOD profile, after changing the password in Supabase Auth.
create or replace function public.complete_staff_password_change()
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error();
begin
  if actor.role not in ('faculty','hod') or not actor.must_change_password then
    raise exception 'No temporary password change is pending.' using errcode='P0001';
  end if;
  update public.profiles set must_change_password=false,updated_at=now()
    where id=actor.id and auth_user_id=auth.uid();
end $$;
revoke all on function public.complete_staff_password_change() from public,anon;
grant execute on function public.complete_staff_password_change() to authenticated;
-- Core authorization helpers for the current profiles/od_requests schema.
-- These are SECURITY DEFINER to avoid RLS recursion while exposing only the
-- authenticated caller's effective profile/role.
create or replace function public.active_profile_or_error()
returns public.profiles language plpgsql stable security definer set search_path=public,auth as $$
declare actor public.profiles; verified_email text;
begin
  select u.email into verified_email from auth.users u
    where u.id=auth.uid() and u.email_confirmed_at is not null
      and lower(split_part(u.email,'@',2))='srmist.edu.in';
  if verified_email is null then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  select p.* into actor from public.profiles p
    where p.auth_user_id=auth.uid() and p.is_active and lower(p.email)=lower(verified_email) limit 1;
  if actor.id is null then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  return actor;
end $$;
create or replace function public.current_profile()
returns public.profiles language sql stable security definer set search_path=public as $$
  select * from public.active_profile_or_error()
$$;
create or replace function public.current_role()
returns public.user_role language sql stable security definer set search_path=public as $$
  select actor.role from public.active_profile_or_error() actor
$$;
revoke all on function public.active_profile_or_error(),public.current_profile(),public.current_role() from public,anon;
grant execute on function public.active_profile_or_error(),public.current_profile(),public.current_role() to authenticated;

-- Request visibility is evaluated inside trusted helpers to avoid cyclic RLS
-- references between od_requests and its child tables.
create or replace function public.can_access_od_request(p_request_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); request_row public.od_requests;
begin
  select * into request_row from public.od_requests where id=p_request_id;
  if request_row.id is null then return false; end if;
  return request_row.requester_id=actor.id
    or actor.role='admin'
    or (actor.role='hod' and request_row.department_id=actor.department_id)
    or (actor.role='faculty' and request_row.department_id=actor.department_id and exists(
      select 1 from public.od_request_faculty f where f.od_request_id=p_request_id and f.faculty_id=actor.id))
    or exists(select 1 from public.od_request_students s where s.request_id=p_request_id and s.student_id=actor.id);
end $$;
create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); target public.profiles;
begin
  select * into target from public.profiles where id=p_profile_id and is_active;
  if target.id is null then return false; end if;
  return target.id=actor.id or actor.role='admin'
    or (actor.role in ('faculty','hod') and target.department_id=actor.department_id)
    or (actor.role='student' and target.role='faculty' and target.department_id=actor.department_id)
    or (actor.role='student' and target.role='student' and exists(
      select 1 from public.od_request_students target_student
      join public.od_requests request on request.id=target_student.request_id
      where target_student.student_id=target.id and
        (request.requester_id=actor.id or exists(select 1 from public.od_request_students mine where mine.request_id=request.id and mine.student_id=actor.id))
    ));
end $$;
create or replace function public.can_view_od_attendance(p_request_id uuid,p_student_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); request_row public.od_requests;
begin
  select * into request_row from public.od_requests where id=p_request_id;
  if request_row.id is null or request_row.status<>'APPROVED' then return false; end if;
  return (actor.role='student' and actor.id=p_student_id)
    or actor.role='admin'
    or (actor.role='hod' and actor.department_id=request_row.department_id)
    or (actor.role='faculty' and actor.department_id=request_row.department_id and exists(
      select 1 from public.od_request_faculty f where f.od_request_id=p_request_id and f.faculty_id=actor.id));
end $$;
revoke all on function public.can_access_od_request(uuid),public.can_view_profile(uuid),public.can_view_od_attendance(uuid,uuid) from public,anon;
grant execute on function public.can_access_od_request(uuid),public.can_view_profile(uuid),public.can_view_od_attendance(uuid,uuid) to authenticated;

-- Replace broad/legacy policies where present and create scoped current-schema policies.
drop policy if exists "active users can read active profiles in department" on public.profiles;
drop policy if exists "scoped profile visibility" on public.profiles;
drop policy if exists "multi od scoped profile visibility" on public.profiles;
drop policy if exists "profiles scoped read current workflow" on public.profiles;
create policy "profiles scoped read current workflow" on public.profiles for select to authenticated using (public.can_view_profile(id));
revoke select on public.profiles from anon,authenticated;
grant select(id,full_name,role,department_id,register_number,year,section,designation,is_active,created_at,updated_at) on public.profiles to authenticated;

drop policy if exists "active users can read departments" on public.departments;
drop policy if exists "public reads active departments for registration" on public.departments;
create policy "public reads active departments for registration" on public.departments for select to anon,authenticated using (is_active=true);
grant select on public.departments to anon,authenticated;

drop policy if exists "od requests scoped read" on public.od_requests;
drop policy if exists "od requests scoped read current workflow" on public.od_requests;
create policy "od requests scoped read current workflow" on public.od_requests for select to authenticated using (public.can_access_od_request(id));

drop policy if exists "request students scoped read" on public.od_request_students;
drop policy if exists "request students scoped read current workflow" on public.od_request_students;
create policy "request students scoped read current workflow" on public.od_request_students for select to authenticated using (public.can_access_od_request(request_id));

drop policy if exists "request faculty scoped read" on public.od_request_faculty;
drop policy if exists "request faculty scoped read current workflow" on public.od_request_faculty;
create policy "request faculty scoped read current workflow" on public.od_request_faculty for select to authenticated using (public.can_access_od_request(od_request_id));

drop policy if exists "attendance scoped read" on public.od_attendance;
drop policy if exists "attendance scoped read current workflow" on public.od_attendance;
create policy "attendance scoped read current workflow" on public.od_attendance for select to authenticated using (public.can_view_od_attendance(request_id,student_id));

drop policy if exists "approval history scoped read current workflow" on public.od_approval_history;
create policy "approval history scoped read current workflow" on public.od_approval_history for select to authenticated using (public.can_access_od_request(od_request_id));

drop policy if exists "users read own notifications" on public.notifications;
drop policy if exists "notifications own read current workflow" on public.notifications;
drop policy if exists "users update own notifications" on public.notifications;
create policy "notifications own read current workflow" on public.notifications for select to authenticated using (user_id=(public.current_profile()).id);
grant select on public.od_requests,public.od_request_students,public.od_request_faculty,public.od_attendance,public.od_approval_history,public.notifications to authenticated;
revoke insert,update,delete on public.od_requests,public.od_request_students,public.od_request_faculty,public.od_attendance,public.od_approval_history,public.notifications from anon,authenticated;

drop policy if exists "users read limits" on public.od_limits;
drop policy if exists "od limits scoped read current workflow" on public.od_limits;
create policy "od limits scoped read current workflow" on public.od_limits for select to authenticated using (
  public.current_role()='admin' or department_id=(public.current_profile()).department_id
);
grant select on public.od_limits to authenticated;

drop policy if exists "authenticated users read academic years" on public.academic_years;
drop policy if exists "academic years authenticated read current workflow" on public.academic_years;
create policy "academic years authenticated read current workflow" on public.academic_years for select to authenticated using (
  is_active=true or public.current_role() in ('hod','admin')
);
grant select on public.academic_years to authenticated;

-- Callers may only mark their own notification as read through this RPC.
create or replace function public.mark_notification_read(p_notification_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error();
begin
  update public.notifications set is_read=true,read_at=now()
    where user_id=actor.id and (p_notification_id is null or id=p_notification_id);
  if p_notification_id is not null and not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
end $$;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;



-- Faculty attendance writes are performed only through this validated RPC.
create or replace function public.mark_od_attendance(p_request_id uuid,p_student_id uuid,p_status public.attendance_status)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); request_row public.od_requests; attendance_id uuid;
begin
  if actor.role<>'faculty' then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from public.od_requests where id=p_request_id for share;
  if request_row.id is null or request_row.status<>'APPROVED' or request_row.department_id<>actor.department_id
    or not exists(select 1 from public.od_request_students where request_id=p_request_id and student_id=p_student_id)
    or not exists(select 1 from public.od_request_faculty where od_request_id=p_request_id and faculty_id=actor.id) then
    raise exception 'FORBIDDEN' using errcode='P0001';
  end if;
  if p_status not in ('PRESENT','ABSENT') then raise exception 'INVALID_ATTENDANCE_STATUS' using errcode='P0001'; end if;
  insert into public.od_attendance(request_id,student_id,attendance_status,marked_by,marked_at)
    values(p_request_id,p_student_id,p_status,actor.id,now())
    on conflict(request_id,student_id) do update set attendance_status=excluded.attendance_status,marked_by=excluded.marked_by,marked_at=now(),updated_at=now()
    returning id into attendance_id;
  return attendance_id;
end $$;
revoke all on function public.mark_od_attendance(uuid,uuid,public.attendance_status) from public,anon;
grant execute on function public.mark_od_attendance(uuid,uuid,public.attendance_status) to authenticated;

create or replace function public.withdraw_od_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles := public.active_profile_or_error(); request_row public.od_requests;
begin
  if actor.role<>'student' then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  select * into request_row from public.od_requests where id=p_request_id for update;
  if request_row.id is null or request_row.requester_id<>actor.id or request_row.status not in ('PENDING_FACULTY','PENDING_HOD') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode='P0001';
  end if;
  update public.od_requests set status='WITHDRAWN',updated_at=now() where id=p_request_id;
  insert into public.od_approval_history(od_request_id,actor_id,actor_role,action,from_status,to_status)
    values(p_request_id,actor.id,'student','WITHDRAWN',request_row.status,'WITHDRAWN');
  insert into public.notifications(user_id,od_request_id,notification_type,title,message)
    select distinct target.user_id,p_request_id,'OD_REQUEST_WITHDRAWN','OD request withdrawn','The requester withdrew this OD request.'
    from (select student_id user_id from public.od_request_students where request_id=p_request_id
      union select faculty_id from public.od_request_faculty where od_request_id=p_request_id) target;
end $$;
revoke all on function public.withdraw_od_request(uuid) from public,anon;
grant execute on function public.withdraw_od_request(uuid) to authenticated;

